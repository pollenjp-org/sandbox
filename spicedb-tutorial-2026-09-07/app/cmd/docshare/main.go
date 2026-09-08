// docshare: SpiceDB を認可に使う文書共有 API のデモ。
// 起動は app/run.sh 経由が楽 (spicedb の起動から seed まで面倒を見る)。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/authz"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/httpapi"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/internal/store"
	"github.com/pollenjp-org/sandbox/spicedb-tutorial-2026-09-07/app/schema"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	endpoint := envOr("SPICEDB_ENDPOINT", "localhost:50051")
	presharedKey := envOr("SPICEDB_PRESHARED_KEY", "docshare-dev-key")
	addr := envOr("DOCSHARE_ADDR", ":8090")

	client, err := authz.New(endpoint, presharedKey)
	if err != nil {
		log.Fatalf("connect to spicedb: %v", err)
	}

	// デモなので起動時にスキーマを書き込む。実務では zed schema write を
	// CI (マイグレーション) から流すのが定石で、アプリ起動には混ぜない。
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	token, err := client.WriteSchema(ctx, schema.Schema)
	if err != nil {
		log.Fatalf("write schema: %v", err)
	}

	st := store.New()
	// この token 以前の書き込み (run.sh が zed で流した seed など) は
	// 以後のチェックで必ず見える。tutorial/08_consistency の話がここで効く。
	st.ObserveZedToken(token)

	srv := &httpapi.Server{
		Authz: client,
		Store: st,
		Now:   time.Now,
	}
	log.Printf("docshare listening on %s (spicedb: %s)", addr, endpoint)
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
