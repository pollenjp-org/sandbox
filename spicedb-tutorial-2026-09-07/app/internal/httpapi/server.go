// Package httpapi は docshare の HTTP API。
//
// 認証 (誰なのか) はデモ用に X-User ヘッダをそのまま信じる。本物では
// OIDC などの認証基盤が置き換わる部分で、この repo の主題ではない。
// 認可 (何をしてよいか) はすべて SpiceDB へ問い合わせる。
// このパッケージに権限判定の if 文を書かないことが設計のルール。
package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/authz"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/store"
)

type Server struct {
	Authz *authz.Client
	Store *store.Store
	// Now を差し替えられるようにしておく (期限付き共有のテスト用)
	Now func() time.Time
}

func (s *Server) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /folders/{folderID}/documents", s.handleCreateDocument)
	mux.HandleFunc("GET /documents", s.handleListDocuments)
	mux.HandleFunc("GET /documents/{id}", s.handleGetDocument)
	mux.HandleFunc("PUT /documents/{id}", s.handleUpdateDocument)
	mux.HandleFunc("POST /documents/{id}/share", s.handleShare)
	mux.HandleFunc("POST /documents/{id}/unshare", s.handleUnshare)
	return mux
}

// ---- リクエスト/レスポンスの形 ---------------------------------------------

type documentResponse struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Body  string `json:"body,omitempty"`
}

type createDocumentRequest struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

type updateDocumentRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type shareRequest struct {
	// "user:carol" または "group:eng#member"
	Subject string `json:"subject"`
	// "viewer" | "editor"
	Role string `json:"role"`
	// RFC3339。指定すると期限付き共有 (role は viewer、subject は user のみ)
	ExpiresAt string `json:"expires_at,omitempty"`
}

type unshareRequest struct {
	Subject string `json:"subject"`
	Role    string `json:"role"`
}

// ---- 共通の小物 -------------------------------------------------------------

// user は X-User ヘッダから「誰か」を取り出す。無ければ 401。
func (s *Server) user(w http.ResponseWriter, r *http.Request) (string, bool) {
	u := r.Header.Get("X-User")
	if u == "" {
		httpError(w, http.StatusUnauthorized, "X-User header is required (demo authn)")
		return "", false
	}
	return u, true
}

func httpError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
		httpError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

// serverError は SpiceDB 呼び出し自体の失敗 (権限なしとは別物)。
func serverError(w http.ResponseWriter, err error) {
	log.Printf("authz error: %v", err)
	httpError(w, http.StatusInternalServerError, "authorization backend error")
}

// ---- handlers ---------------------------------------------------------------

// POST /folders/{folderID}/documents
// 「そのフォルダを編集できる人」だけが文書を作れる (folder#create_document)。
func (s *Server) handleCreateDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	folderID := r.PathValue("folderID")

	var req createDocumentRequest
	if !readJSON(w, r, &req) {
		return
	}
	if req.ID == "" {
		httpError(w, http.StatusBadRequest, "id is required")
		return
	}

	allowed, err := s.Authz.CheckFolder(r.Context(), folderID, "create_document", userID, s.Store.LastZedToken())
	if err != nil {
		serverError(w, err)
		return
	}
	if !allowed {
		httpError(w, http.StatusForbidden, "not allowed to create documents in this folder")
		return
	}

	if _, exists := s.Store.Get(req.ID); exists {
		httpError(w, http.StatusConflict, "document already exists")
		return
	}

	// SpiceDB への書き込み (owner/parent) とアプリ DB への保存は 2 つの書き込みで、
	// 途中で落ちるとズレうる。実務での扱いは docs/architecture/textbook/07 を参照。
	token, err := s.Authz.CreateDocument(r.Context(), req.ID, folderID, userID)
	if err != nil {
		serverError(w, err)
		return
	}
	doc := store.Document{ID: req.ID, Title: req.Title, Body: req.Body, ZedToken: token}
	if err := s.Store.Create(doc); err != nil {
		httpError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, documentResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
}

// GET /documents/{id}
// view できない人には 404 を返し、文書の存在自体を隠す。
func (s *Server) handleGetDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")

	doc, exists := s.Store.Get(id)
	if !exists {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canView, err := s.Authz.CheckDocument(r.Context(), id, "view", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canView {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	writeJSON(w, http.StatusOK, documentResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
}

// PUT /documents/{id}
// view はあるが edit が無い人には 403 (存在は既に知られてよい)。
func (s *Server) handleUpdateDocument(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")

	doc, exists := s.Store.Get(id)
	if !exists {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canView, err := s.Authz.CheckDocument(r.Context(), id, "view", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canView {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canEdit, err := s.Authz.CheckDocument(r.Context(), id, "edit", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canEdit {
		httpError(w, http.StatusForbidden, "not allowed to edit this document")
		return
	}

	var req updateDocumentRequest
	if !readJSON(w, r, &req) {
		return
	}
	doc.Title = req.Title
	doc.Body = req.Body
	s.Store.Put(doc)
	writeJSON(w, http.StatusOK, documentResponse{ID: doc.ID, Title: doc.Title, Body: doc.Body})
}

// GET /documents
// 一覧は「全件取得して 1 件ずつ check」の N+1 ではなく LookupResources 1 回。
func (s *Server) handleListDocuments(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	ids, err := s.Authz.ViewableDocumentIDs(r.Context(), userID, s.Store.LastZedToken(), s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	docs := []documentResponse{}
	for _, id := range ids {
		if doc, exists := s.Store.Get(id); exists {
			// 一覧は本文を返さない
			docs = append(docs, documentResponse{ID: doc.ID, Title: doc.Title})
		}
	}
	writeJSON(w, http.StatusOK, docs)
}

// POST /documents/{id}/share
// 共有の可否そのものも SpiceDB に聞く (document#share)。
func (s *Server) handleShare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")

	doc, exists := s.Store.Get(id)
	if !exists {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canView, err := s.Authz.CheckDocument(r.Context(), id, "view", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canView {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canShare, err := s.Authz.CheckDocument(r.Context(), id, "share", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canShare {
		httpError(w, http.StatusForbidden, "not allowed to share this document")
		return
	}

	var req shareRequest
	if !readJSON(w, r, &req) {
		return
	}
	subject, err := authz.ParseSubject(req.Subject)
	if err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	if subject.Type != "user" && subject.Type != "group" {
		httpError(w, http.StatusBadRequest, "subject type must be user or group")
		return
	}
	if req.Role != "viewer" && req.Role != "editor" {
		httpError(w, http.StatusBadRequest, "role must be viewer or editor")
		return
	}

	var token string
	if req.ExpiresAt != "" {
		// 期限付き共有はスキーマ上 shared_viewer (user のみ) に限定している
		if req.Role != "viewer" || subject.Type != "user" || subject.Relation != "" {
			httpError(w, http.StatusBadRequest, "expires_at is only supported for role=viewer and a user subject")
			return
		}
		expiresAt, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err != nil {
			httpError(w, http.StatusBadRequest, "expires_at must be RFC3339: "+err.Error())
			return
		}
		token, err = s.Authz.GrantDocumentExpiringView(r.Context(), id, subject.ID, expiresAt)
		if err != nil {
			serverError(w, err)
			return
		}
	} else {
		token, err = s.Authz.GrantDocumentRole(r.Context(), id, subject, req.Role)
		if err != nil {
			serverError(w, err)
			return
		}
	}

	// ZedToken を文書に保存し直す。以後この文書のチェックは共有を必ず反映する
	s.Store.SetZedToken(id, token)
	writeJSON(w, http.StatusOK, map[string]string{"zed_token": token})
}

// POST /documents/{id}/unshare
// role=viewer の剥奪は、無期限の viewer と期限付きの shared_viewer の両方を消す。
func (s *Server) handleUnshare(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.user(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")

	doc, exists := s.Store.Get(id)
	if !exists {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canView, err := s.Authz.CheckDocument(r.Context(), id, "view", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canView {
		httpError(w, http.StatusNotFound, "document not found")
		return
	}
	canShare, err := s.Authz.CheckDocument(r.Context(), id, "share", userID, doc.ZedToken, s.now())
	if err != nil {
		serverError(w, err)
		return
	}
	if !canShare {
		httpError(w, http.StatusForbidden, "not allowed to manage sharing of this document")
		return
	}

	var req unshareRequest
	if !readJSON(w, r, &req) {
		return
	}
	subject, err := authz.ParseSubject(req.Subject)
	if err != nil {
		httpError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Role != "viewer" && req.Role != "editor" {
		httpError(w, http.StatusBadRequest, "role must be viewer or editor")
		return
	}

	relations := []string{req.Role}
	if req.Role == "viewer" && subject.Type == "user" {
		relations = append(relations, "shared_viewer")
	}
	var token string
	for _, relation := range relations {
		token, err = s.Authz.RevokeDocumentRole(r.Context(), id, subject, relation)
		if err != nil {
			serverError(w, err)
			return
		}
	}

	// 剥奪こそ ZedToken の出番。保存しておけば直後の check から必ず false になる
	s.Store.SetZedToken(id, token)
	writeJSON(w, http.StatusOK, map[string]string{"zed_token": token})
}
