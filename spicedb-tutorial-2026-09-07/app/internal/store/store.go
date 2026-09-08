// Package store はデモ用のインメモリ文書ストア。
// 本物では RDB などに置き換わる部分だが、見てほしいのは
// 「文書の行に ZedToken を 1 列持たせる」という形。これはどの DB でも同じ。
package store

import (
	"fmt"
	"sync"
)

// Document は文書本体と、その ACL を最後に変更したときの ZedToken を一緒に持つ。
type Document struct {
	ID    string
	Title string
	Body  string
	// ZedToken はこの文書の relationship を最後に書いたときの返り値。
	// この文書のチェック時に at_least_as_fresh で渡すことで、
	// 「共有した/剥奪した直後なのに反映されていない」を防ぐ。
	ZedToken string
}

// Store は goroutine safe なインメモリストア。
type Store struct {
	mu   sync.RWMutex
	docs map[string]Document
	// lastZedToken はこのプロセスが最後に見た ZedToken。
	// 特定の文書に紐づかない読み (一覧の LookupResources) に使う。
	// 書き込みは単一プロセスから直列に起きるので「最後に代入したものが最新」でよい。
	lastZedToken string
}

func New() *Store {
	return &Store{docs: map[string]Document{}}
}

// Create は新規作成。既に居たらエラー。
func (s *Store) Create(doc Document) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.docs[doc.ID]; ok {
		return fmt.Errorf("document %q already exists", doc.ID)
	}
	s.docs[doc.ID] = doc
	s.noteToken(doc.ZedToken)
	return nil
}

// Put は上書き保存。
func (s *Store) Put(doc Document) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.docs[doc.ID] = doc
	s.noteToken(doc.ZedToken)
}

// Get は複製を返す (呼び出し側で書き換えてもストアに影響しない)。
func (s *Store) Get(id string) (Document, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	doc, ok := s.docs[id]
	return doc, ok
}

// SetZedToken は共有/剥奪などで ACL が変わったときに呼ぶ。
func (s *Store) SetZedToken(id, token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.docs[id]
	if !ok {
		return
	}
	doc.ZedToken = token
	s.docs[id] = doc
	s.noteToken(token)
}

// ObserveZedToken は SpiceDB への書き込みをこのストアの外 (起動時の schema 書き込み、
// seed スクリプト、テストの準備など) で行ったとき、その ZedToken を高水位として
// 取り込むためのもの。取り込んでおかないと、直後のチェックが量子化された古い
// revision を見て「書いたはずの relationship が無い世界」で評価されることがある。
func (s *Store) ObserveZedToken(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.noteToken(token)
}

// LastZedToken は文書に紐づかない読み (一覧など) 用の高水位トークン。
func (s *Store) LastZedToken() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastZedToken
}

// noteToken は mu を握った状態で呼ぶこと。
func (s *Store) noteToken(token string) {
	if token != "" {
		s.lastZedToken = token
	}
}
