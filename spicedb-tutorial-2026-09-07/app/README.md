# docshare — SpiceDB を認可に使う応用アプリ

Google Drive 風の文書共有 API。[tutorial](../tutorial/README.md) 01〜08 で学んだ部品
(階層・グループ・wildcard・caveat・ZedToken) が、実際のアプリコードのどこに座るかを見せる。

```sh
./run.sh     # spicedb 起動 → スキーマ/seed 投入 → docshare 起動 (Ctrl-C で全部落ちる)
./demo.sh    # 別ターミナルで。共有→閲覧→剥奪→即時反映、の一連を curl で流す
```

テストは `nix develop --command bash -c 'cd app && go test ./...'`
(または [`../scripts/check-all.sh`](../scripts/check-all.sh))。

## API

認証はデモ用に **`X-User` ヘッダをそのまま信じる** (認可を主題にするため認証は省く)。

| エンドポイント | 認可の問い (SpiceDB への check) |
| --- | --- |
| `POST /folders/{id}/documents` | `folder:{id}#create_document` |
| `GET /documents` | `LookupResources(document, view)` — check ではなく一覧専用 API |
| `GET /documents/{id}` | `document:{id}#view` (無ければ **404** で存在ごと隠す) |
| `PUT /documents/{id}` | `view` (404) → `edit` (403) の 2 段 |
| `POST /documents/{id}/share` | `document:{id}#share` |
| `POST /documents/{id}/unshare` | `document:{id}#share` |

share の body は `{"subject": "user:carol" \| "group:eng#member", "role": "viewer" \| "editor",
"expires_at": "RFC3339 (任意)"}`。`expires_at` を付けると caveat 付きの
`shared_viewer` として書かれ、期限が切れた瞬間から view が false になる。

## 設計の要点 (コードの読みどころ)

| 場所 | 見どころ |
| --- | --- |
| [schema/schema.zed](./schema/schema.zed) | チュートリアル全部入りのスキーマ。[schema/validate.yaml](./schema/validate.yaml) がそのテスト |
| [internal/authz](./internal/authz/authz.go) | SpiceDB クライアントの薄いラッパ。gRPC の詳細 (consistency、caveat context、streaming) をここに閉じ込める |
| [internal/store](./internal/store/store.go) | **文書の行に ZedToken を 1 列持たせる**。剥奪が「直後の check から必ず」効くのはこれのおかげ |
| [internal/httpapi](./internal/httpapi/server.go) | ハンドラに権限の if 文が無い。「誰が何をできるか」は全部 SpiceDB に聞く |
| [internal/httpapi/server_test.go](./internal/httpapi/server_test.go) | `spicedb serve-testing` を使った統合テスト。preshared key ごとに独立 datastore が貰えるので、テストごとにランダム key = 隔離 |

### ZedToken の流れ (この repo でいちばん大事な設計)

1. relationship を書く (作成・共有・剥奪) と ZedToken が返る
2. **その文書の行と一緒に保存**する (`store.Document.ZedToken`)
3. その文書のチェック時に `at_least_as_fresh` で渡す
   → 「剥奪したのに量子化窓の中でまだ見える」を防ぐ ([tutorial/08](../tutorial/08_consistency/README.md))

文書に紐づかない読み (一覧の LookupResources、フォルダの check) には、プロセスが
最後に見た token (`store.LastZedToken`) を高水位として使う。アプリ起動前に外
(run.sh の zed) で書いた seed は、起動時のスキーマ書き込みが返す token が覆う。

### わざと単純化しているところ

- **認証**: `X-User` を信じる。本物は OIDC 等の認証基盤の仕事
- **文書ストア**: インメモリ。再起動で消える (SpiceDB 側の relationship は
  `run.sh` を落とせばどのみち消える。メモリ datastore なので)
- **二重書き込み**: SpiceDB への relationship 書き込みとアプリ DB への保存は
  トランザクションで括れない。途中で落ちればズレる。実務での扱い
  (順序づけ・リコンサイル) は [textbook 07 章](../docs/architecture/textbook/07_app_integration.md)
- **check の回数**: `PUT` は view → edit の 2 回聞いている。まとめたければ
  `CheckBulkPermissions` API がある
