// Package authz は SpiceDB クライアントの薄いラッパ。
// docshare が使う操作だけを docshare の語彙 (document / folder / user / group) で提供し、
// gRPC の詳細 (consistency の組み立て、caveat context、streaming) をここに閉じ込める。
//
// 方針:
//   - チェックには「資源と一緒に保存しておいた ZedToken」を at_least_as_fresh で渡す
//     (剥奪直後の取りこぼしを防ぐ。tutorial/08_consistency 参照)
//   - caveat (期限付き共有) の current_time は常にこちらから渡す
package authz

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	pb "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/authzed-go/v1"
	"github.com/authzed/grpcutil"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/structpb"
)

// Client は SpiceDB への接続 1 本を包む。goroutine safe。
type Client struct {
	spice *authzed.Client
}

// New は平文 gRPC + preshared key で SpiceDB につなぐ (ローカル/テスト用)。
// 本番は TLS 側のオプション (grpcutil.WithBearerToken など) に差し替える。
func New(endpoint, presharedKey string) (*Client, error) {
	spice, err := authzed.NewClient(
		endpoint,
		grpcutil.WithInsecureBearerToken(presharedKey),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("connect to spicedb %s: %w", endpoint, err)
	}
	return &Client{spice: spice}, nil
}

// WriteSchema はスキーマ全体を書き込み (冪等)、書き込み時点の ZedToken を返す。
// アプリ起動時にこの token を Store に取り込めば、起動前に外 (zed 等) で
// 書かれた relationship もチェック時に必ず見えるようになる。
func (c *Client) WriteSchema(ctx context.Context, schema string) (string, error) {
	resp, err := c.spice.WriteSchema(ctx, &pb.WriteSchemaRequest{Schema: schema})
	if err != nil {
		return "", fmt.Errorf("write schema: %w", err)
	}
	return resp.GetWrittenAt().GetToken(), nil
}

// Subject は relationship の主体。"user:alice" や "group:eng#member"。
type Subject struct {
	Type     string // "user" | "group" など
	ID       string
	Relation string // group の member 集合を指すときの "member"。user は空
}

func (s Subject) String() string {
	if s.Relation == "" {
		return s.Type + ":" + s.ID
	}
	return s.Type + ":" + s.ID + "#" + s.Relation
}

// ParseSubject は "user:alice" / "group:eng#member" 形式を分解する。
func ParseSubject(raw string) (Subject, error) {
	typePart, rest, ok := strings.Cut(raw, ":")
	if !ok || typePart == "" || rest == "" {
		return Subject{}, fmt.Errorf("subject %q: want <type>:<id> or <type>:<id>#<relation>", raw)
	}
	id, relation, _ := strings.Cut(rest, "#")
	if id == "" {
		return Subject{}, fmt.Errorf("subject %q: empty id", raw)
	}
	return Subject{Type: typePart, ID: id, Relation: relation}, nil
}

// consistencyFor は「保存しておいた ZedToken 以上に新しい世界で」を組み立てる。
// token が空 (その資源の ACL をまだ一度も書いていない等) なら既定の
// minimize_latency に落とす。
func consistencyFor(zedToken string) *pb.Consistency {
	if zedToken == "" {
		return &pb.Consistency{Requirement: &pb.Consistency_MinimizeLatency{MinimizeLatency: true}}
	}
	return &pb.Consistency{Requirement: &pb.Consistency_AtLeastAsFresh{
		AtLeastAsFresh: &pb.ZedToken{Token: zedToken},
	}}
}

// caveatContext は not_expired caveat が要求する current_time を組み立てる。
func caveatContext(now time.Time) (*structpb.Struct, error) {
	s, err := structpb.NewStruct(map[string]any{
		"current_time": now.UTC().Format(time.RFC3339),
	})
	if err != nil {
		return nil, fmt.Errorf("build caveat context: %w", err)
	}
	return s, nil
}

func (c *Client) check(ctx context.Context, resourceType, resourceID, permission, userID, zedToken string, caveatCtx *structpb.Struct) (bool, error) {
	resp, err := c.spice.CheckPermission(ctx, &pb.CheckPermissionRequest{
		Consistency: consistencyFor(zedToken),
		Resource:    &pb.ObjectReference{ObjectType: resourceType, ObjectId: resourceID},
		Permission:  permission,
		Subject: &pb.SubjectReference{
			Object: &pb.ObjectReference{ObjectType: "user", ObjectId: userID},
		},
		Context: caveatCtx,
	})
	if err != nil {
		return false, fmt.Errorf("check %s:%s#%s@user:%s: %w", resourceType, resourceID, permission, userID, err)
	}
	return resp.Permissionship == pb.CheckPermissionResponse_PERMISSIONSHIP_HAS_PERMISSION, nil
}

// CheckDocument は user が document に対して permission を持つか。
// zedToken にはその文書と一緒に保存しておいた ZedToken を渡す。
// now は期限付き共有 (not_expired) の判定に使う。
func (c *Client) CheckDocument(ctx context.Context, docID, permission, userID, zedToken string, now time.Time) (bool, error) {
	cavCtx, err := caveatContext(now)
	if err != nil {
		return false, err
	}
	return c.check(ctx, "document", docID, permission, userID, zedToken, cavCtx)
}

// CheckFolder は user が folder に対して permission を持つか。
// folder に caveat は無いので context は渡さない。
func (c *Client) CheckFolder(ctx context.Context, folderID, permission, userID, zedToken string) (bool, error) {
	return c.check(ctx, "folder", folderID, permission, userID, zedToken, nil)
}

// ViewableDocumentIDs は user が view できる document の ID 一覧 (昇順)。
// 一覧画面は「全件 + 1 件ずつ check」の N+1 ではなく LookupResources を 1 回。
func (c *Client) ViewableDocumentIDs(ctx context.Context, userID, zedToken string, now time.Time) ([]string, error) {
	cavCtx, err := caveatContext(now)
	if err != nil {
		return nil, err
	}
	stream, err := c.spice.LookupResources(ctx, &pb.LookupResourcesRequest{
		Consistency:        consistencyFor(zedToken),
		ResourceObjectType: "document",
		Permission:         "view",
		Subject: &pb.SubjectReference{
			Object: &pb.ObjectReference{ObjectType: "user", ObjectId: userID},
		},
		Context: cavCtx,
	})
	if err != nil {
		return nil, fmt.Errorf("lookup viewable documents for user:%s: %w", userID, err)
	}
	var ids []string
	for {
		resp, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("lookup viewable documents for user:%s: %w", userID, err)
		}
		// current_time を渡しているので通常は確定する。万一 context 不足で
		// CONDITIONAL が返った資源は「見えない」側に倒す。
		if resp.Permissionship == pb.LookupPermissionship_LOOKUP_PERMISSIONSHIP_HAS_PERMISSION {
			ids = append(ids, resp.ResourceObjectId)
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func touch(resourceType, resourceID, relation string, subject Subject, caveat *pb.ContextualizedCaveat) *pb.RelationshipUpdate {
	return &pb.RelationshipUpdate{
		Operation: pb.RelationshipUpdate_OPERATION_TOUCH,
		Relationship: &pb.Relationship{
			Resource: &pb.ObjectReference{ObjectType: resourceType, ObjectId: resourceID},
			Relation: relation,
			Subject: &pb.SubjectReference{
				Object:           &pb.ObjectReference{ObjectType: subject.Type, ObjectId: subject.ID},
				OptionalRelation: subject.Relation,
			},
			OptionalCaveat: caveat,
		},
	}
}

// write は更新をまとめて 1 トランザクションで書き、ZedToken を返す。
func (c *Client) write(ctx context.Context, updates ...*pb.RelationshipUpdate) (string, error) {
	resp, err := c.spice.WriteRelationships(ctx, &pb.WriteRelationshipsRequest{Updates: updates})
	if err != nil {
		return "", fmt.Errorf("write relationships: %w", err)
	}
	return resp.WrittenAt.GetToken(), nil
}

// TouchRelationship は任意の relationship を 1 本書く (冪等)。seed やテスト用。
func (c *Client) TouchRelationship(ctx context.Context, resourceType, resourceID, relation string, subject Subject) (string, error) {
	return c.write(ctx, touch(resourceType, resourceID, relation, subject, nil))
}

// CreateDocument は文書作成に伴う relationship (owner と parent) をまとめて書く。
func (c *Client) CreateDocument(ctx context.Context, docID, folderID, ownerID string) (string, error) {
	return c.write(ctx,
		touch("document", docID, "owner", Subject{Type: "user", ID: ownerID}, nil),
		touch("document", docID, "parent", Subject{Type: "folder", ID: folderID}, nil),
	)
}

// GrantDocumentRole は viewer / editor を無期限で付与する。
func (c *Client) GrantDocumentRole(ctx context.Context, docID string, subject Subject, role string) (string, error) {
	return c.write(ctx, touch("document", docID, role, subject, nil))
}

// GrantDocumentExpiringView は期限付きの閲覧共有 (shared_viewer + not_expired)。
// 期限は relationship 側の context として SpiceDB に保存される。
func (c *Client) GrantDocumentExpiringView(ctx context.Context, docID, userID string, expiresAt time.Time) (string, error) {
	cavCtx, err := structpb.NewStruct(map[string]any{
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
	if err != nil {
		return "", fmt.Errorf("build expiry context: %w", err)
	}
	return c.write(ctx, touch("document", docID, "shared_viewer",
		Subject{Type: "user", ID: userID},
		&pb.ContextualizedCaveat{CaveatName: "not_expired", Context: cavCtx},
	))
}

// RevokeDocumentRole は該当 relationship を (あれば) 消す。
// DeleteRelationships はフィルタ一致 0 件でもエラーにならないので冪等。
func (c *Client) RevokeDocumentRole(ctx context.Context, docID string, subject Subject, role string) (string, error) {
	filter := &pb.RelationshipFilter{
		ResourceType:       "document",
		OptionalResourceId: docID,
		OptionalRelation:   role,
		OptionalSubjectFilter: &pb.SubjectFilter{
			SubjectType:       subject.Type,
			OptionalSubjectId: subject.ID,
		},
	}
	if subject.Relation != "" {
		filter.OptionalSubjectFilter.OptionalRelation = &pb.SubjectFilter_RelationFilter{
			Relation: subject.Relation,
		}
	}
	resp, err := c.spice.DeleteRelationships(ctx, &pb.DeleteRelationshipsRequest{RelationshipFilter: filter})
	if err != nil {
		return "", fmt.Errorf("revoke document:%s#%s@%s: %w", docID, role, subject, err)
	}
	return resp.DeletedAt.GetToken(), nil
}
