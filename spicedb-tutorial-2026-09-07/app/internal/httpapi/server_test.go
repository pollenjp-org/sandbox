// docshare の統合テスト。
//
// TestMain が spicedb serve-testing を 1 プロセスだけ起動する。
// serve-testing は preshared key ごとに独立した空の datastore を割り当てるので、
// テストごとにランダムな key を使えばサーバを使い回しつつ隔離できる。
// spicedb バイナリは devShell が持っている (scripts/check-all.sh 経由なら自動)。
package httpapi_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/authz"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/httpapi"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/store"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/schema"
)

var (
	spicedbEndpoint string
	spicedbStartErr error
)

func TestMain(m *testing.M) {
	os.Exit(runTestMain(m))
}

func runTestMain(m *testing.M) int {
	bin, err := exec.LookPath("spicedb")
	if err != nil {
		spicedbStartErr = fmt.Errorf("spicedb not in PATH (run inside `nix develop`): %w", err)
		return m.Run()
	}

	grpcPort, err := freePort()
	if err != nil {
		spicedbStartErr = err
		return m.Run()
	}
	roPort, err := freePort()
	if err != nil {
		spicedbStartErr = err
		return m.Run()
	}
	httpPort, err := freePort()
	if err != nil {
		spicedbStartErr = err
		return m.Run()
	}

	cmd := exec.Command(bin, "serve-testing",
		"--grpc-addr", fmt.Sprintf("localhost:%d", grpcPort),
		"--readonly-grpc-addr", fmt.Sprintf("localhost:%d", roPort),
		"--http-addr", fmt.Sprintf("localhost:%d", httpPort),
	)
	if os.Getenv("SPICEDB_TEST_VERBOSE") != "" {
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
	}
	if err := cmd.Start(); err != nil {
		spicedbStartErr = fmt.Errorf("start spicedb serve-testing: %w", err)
		return m.Run()
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	if err := waitPort(grpcPort, 15*time.Second); err != nil {
		spicedbStartErr = fmt.Errorf("spicedb serve-testing did not become ready: %w", err)
		return m.Run()
	}
	spicedbEndpoint = fmt.Sprintf("localhost:%d", grpcPort)
	return m.Run()
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func waitPort(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("port %d not ready within %s", port, timeout)
}

// env はテスト 1 本ぶんの docshare 一式 (独立 datastore + HTTP サーバ)。
type env struct {
	t  *testing.T
	ts *httptest.Server
	az *authz.Client
	st *store.Store
}

func newEnv(t *testing.T) *env {
	t.Helper()
	if spicedbEndpoint == "" {
		t.Skipf("spicedb unavailable: %v", spicedbStartErr)
	}

	key := make([]byte, 16)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("rand: %v", err)
	}
	az, err := authz.New(spicedbEndpoint, "test-"+hex.EncodeToString(key))
	if err != nil {
		t.Fatalf("authz.New: %v", err)
	}

	// 起動直後は gRPC 側の準備が整っていないことがあるので少し粘る
	ctx := context.Background()
	var token string
	deadline := time.Now().Add(10 * time.Second)
	for {
		token, err = az.WriteSchema(ctx, schema.Schema)
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("write schema: %v", err)
	}

	st := store.New()
	st.ObserveZedToken(token)
	srv := &httpapi.Server{Authz: az, Store: st, Now: time.Now}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &env{t: t, ts: ts, az: az, st: st}
}

// seed は relationship を直接書く (docshare の API を通らない管理操作の想定)。
// 返ってきた ZedToken を store に取り込むところまでが seed。
func (e *env) seed(resourceType, resourceID, relation, subject string) {
	e.t.Helper()
	sub, err := authz.ParseSubject(subject)
	if err != nil {
		e.t.Fatalf("seed subject %q: %v", subject, err)
	}
	token, err := e.az.TouchRelationship(context.Background(), resourceType, resourceID, relation, sub)
	if err != nil {
		e.t.Fatalf("seed %s:%s#%s@%s: %v", resourceType, resourceID, relation, subject, err)
	}
	e.st.ObserveZedToken(token)
}

// do はリクエストを投げて (status, body) を返す。user が空なら X-User を付けない。
func (e *env) do(method, path, user string, body any) (int, []byte) {
	e.t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			e.t.Fatalf("marshal body: %v", err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, e.ts.URL+path, rdr)
	if err != nil {
		e.t.Fatalf("new request: %v", err)
	}
	if user != "" {
		req.Header.Set("X-User", user)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		e.t.Fatalf("read body: %v", err)
	}
	return resp.StatusCode, b
}

func (e *env) expect(method, path, user string, body any, wantStatus int) []byte {
	e.t.Helper()
	status, respBody := e.do(method, path, user, body)
	if status != wantStatus {
		e.t.Fatalf("%s %s as %q: got %d want %d (body: %s)", method, path, user, status, wantStatus, respBody)
	}
	return respBody
}

func listIDs(t *testing.T, body []byte) []string {
	t.Helper()
	var docs []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &docs); err != nil {
		t.Fatalf("unmarshal list: %v (body: %s)", err, body)
	}
	ids := make([]string, 0, len(docs))
	for _, d := range docs {
		ids = append(ids, d.ID)
	}
	return ids
}

// TestDocshareScenario は README のデモと同じ物語を最初から最後まで通す。
//
//	root/ (owner: alice) └── eng-docs/ (viewer: eng グループ = {bob})
func TestDocshareScenario(t *testing.T) {
	e := newEnv(t)

	e.seed("folder", "root", "owner", "user:alice")
	e.seed("folder", "eng-docs", "parent", "folder:root")
	e.seed("folder", "eng-docs", "viewer", "group:eng#member")
	e.seed("group", "eng", "member", "user:bob")

	// 認証なしは 401
	e.expect("GET", "/documents/design", "", nil, http.StatusUnauthorized)

	// alice は root の owner なので eng-docs にも文書を作れる (arrow)
	e.expect("POST", "/folders/eng-docs/documents", "alice",
		map[string]string{"id": "design", "title": "設計メモ", "body": "最初の中身"},
		http.StatusCreated)

	// 同じ ID では作れない
	e.expect("POST", "/folders/eng-docs/documents", "alice",
		map[string]string{"id": "design", "title": "dup"},
		http.StatusConflict)

	// carol はフォルダに何の権限も無いので作れない
	e.expect("POST", "/folders/eng-docs/documents", "carol",
		map[string]string{"id": "evil", "title": "x"},
		http.StatusForbidden)

	// bob は eng グループ → フォルダ viewer → parent->view で読める
	e.expect("GET", "/documents/design", "bob", nil, http.StatusOK)

	// carol には存在ごと隠す (404)
	e.expect("GET", "/documents/design", "carol", nil, http.StatusNotFound)

	// bob は view はあるが edit が無いので 403
	e.expect("PUT", "/documents/design", "bob",
		map[string]string{"title": "書き換え", "body": "x"},
		http.StatusForbidden)

	// owner の alice は編集できる
	e.expect("PUT", "/documents/design", "alice",
		map[string]string{"title": "設計メモ v2", "body": "更新後の中身"},
		http.StatusOK)

	// 一覧: bob には design が見え、carol には空
	if ids := listIDs(t, e.expect("GET", "/documents", "bob", nil, http.StatusOK)); len(ids) != 1 || ids[0] != "design" {
		t.Fatalf("bob's list: got %v want [design]", ids)
	}
	if ids := listIDs(t, e.expect("GET", "/documents", "carol", nil, http.StatusOK)); len(ids) != 0 {
		t.Fatalf("carol's list: got %v want []", ids)
	}

	// 期限付き共有 (1 時間後まで): carol が読めるようになる
	e.expect("POST", "/documents/design/share", "alice",
		map[string]string{
			"subject":    "user:carol",
			"role":       "viewer",
			"expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		},
		http.StatusOK)
	e.expect("GET", "/documents/design", "carol", nil, http.StatusOK)

	// 期限切れの共有は最初から見えない
	e.expect("POST", "/documents/design/share", "alice",
		map[string]string{
			"subject":    "user:dave",
			"role":       "viewer",
			"expires_at": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339),
		},
		http.StatusOK)
	e.expect("GET", "/documents/design", "dave", nil, http.StatusNotFound)

	// 剥奪は「直後の check から必ず」効く (ZedToken を保存しているから)
	e.expect("POST", "/documents/design/unshare", "alice",
		map[string]string{"subject": "user:carol", "role": "viewer"},
		http.StatusOK)
	e.expect("GET", "/documents/design", "carol", nil, http.StatusNotFound)

	// グループへの editor 共有: bob が編集できるようになる
	e.expect("POST", "/documents/design/share", "alice",
		map[string]string{"subject": "group:eng#member", "role": "editor"},
		http.StatusOK)
	e.expect("PUT", "/documents/design", "bob",
		map[string]string{"title": "bob が編集", "body": "編集済み"},
		http.StatusOK)

	// 共有の権限が無い人 (bob は share を持たない) が共有しようとすると 403
	e.expect("POST", "/documents/design/share", "bob",
		map[string]string{"subject": "user:carol", "role": "viewer"},
		http.StatusForbidden)
}

func TestShareValidation(t *testing.T) {
	e := newEnv(t)
	e.seed("folder", "root", "owner", "user:alice")
	e.expect("POST", "/folders/root/documents", "alice",
		map[string]string{"id": "memo", "title": "t"},
		http.StatusCreated)

	// subject の形式が壊れている
	e.expect("POST", "/documents/memo/share", "alice",
		map[string]string{"subject": "carol", "role": "viewer"},
		http.StatusBadRequest)

	// role が不正
	e.expect("POST", "/documents/memo/share", "alice",
		map[string]string{"subject": "user:carol", "role": "admin"},
		http.StatusBadRequest)

	// 期限付き共有はグループには使えない (スキーマの shared_viewer が user 限定)
	e.expect("POST", "/documents/memo/share", "alice",
		map[string]string{
			"subject":    "group:eng#member",
			"role":       "viewer",
			"expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		},
		http.StatusBadRequest)

	// 存在しない文書は 404
	e.expect("POST", "/documents/ghost/share", "alice",
		map[string]string{"subject": "user:carol", "role": "viewer"},
		http.StatusNotFound)
}
