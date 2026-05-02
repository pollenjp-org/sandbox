# Agent Log 01: Evernote → Notion 移行ツール 初期構築

- 日時: 2026-05-02 (Asia/Tokyo)
- ブランチ: `claude/evernote-to-notion-AX2CV`
- 対応者: Claude (Opus 4.7 / 1M ctx)

## ゴール

`evernote-to-notion-2026-05-02/` 配下に、SDK 非依存で Evernote → Notion を全件移行する Rust CLI を作る。CI と mise タスクは `test / lint / fmt:check` を共通化。

## 決定の経緯

1. **Evernote API 接続方式**: ユーザに確認 → 「Thrift Binary を Rust で直接実装」を選択。代替案 (ENEX 取り込み / 既存 SDK) は要件 (「SDK は怪しい」「API で取得」) と矛盾するため不採用。
2. **認証**: ユーザに OAuth と Developer Token の手間の差を再説明し、最終的に Developer Token に確定。env 1 個で済む構成。
3. **添付**: Notion `file_upload` API を採用 (Notion 内に閉じる)。

詳細は [ADR-01](../../adr/2026-05/2026-05-02T13:19:12+09:00_01_evernote-to-notion-architecture.md) を参照。

## 主要な実装ポイント

- `src/thrift/protocol.rs`: Apache Thrift Binary Protocol の Writer / Reader を `bytes::Buf{Mut}` で実装。`skip(ty)` で未知フィールドを安全に飛ばせるため、Evernote の struct に存在する任意フィールドの差異を吸収する。
- `src/evernote/client.rs`:
  - `read_reply` で result struct を読み、フィールド ID 0 を成功値、1..=3 を `EDAMUserException` / `EDAMSystemException` / `EDAMNotFoundException` にマップ。
  - `EDAMSystemException.rateLimitDuration` を `EvernoteError::System { rate_limit_duration }` にひもづけ、`handle_rate_limit` ヘルパーで `tokio::time::sleep` 待機。
- `src/enml/converter.rs`: `quick-xml` で SAX 風にパースし、`<p>` / `<h1-6>` / `<ul/ol>` / `<li>` / `<pre|code>` / `<en-media>` を `ConvertedBlock` 列に変換。`<en-media hash="...">` は `MediaRef` のまま残し、移行時に `getResource` → `file_upload` を経由して解決。
- `src/notion/blocks.rs`: ConvertedBlock → Notion ブロック JSON。MIME ヒントで `image/video/audio/pdf/file` のうち適切な型を選ぶ。
- `src/notion/client.rs` + `src/notion/upload.rs`:
  - `find_page_by_evernote_url` で `Evernote URL` 列の一致を `databases.query` 検索 → 冪等性。
  - `create_page` は children 100 件に丸めてから残りを `append_block_children` で chunk 送信 (Notion 制約)。
  - `upload_file` で 2 段階の file_upload を実装。
- `src/migrator.rs`: ノート単位のメインフロー。`MigrateOptions { dry_run, max_notes }` 付き。
- `src/main.rs`: clap subcommand `migrate` / `dry-run`。`tracing-subscriber` でロガー初期化。
- レート制御: `Arc<TokenBucket>` を Evernote / Notion クライアントそれぞれに注入。`acquire().await` を各 RPC 直前に挿入。

## テスト戦略

各モジュールに単体テストを併設。HTTP は `wiremock` で実 HTTP モック。Thrift のリプライバイト列はテスト用に `build_user_reply_bytes` などのヘルパーを `#[cfg(test)] pub(crate)` で公開。

- `cargo test` 通過: 19 ユニット + 1 integration = 20 件。
- `cargo clippy --all-targets --all-features -- -D warnings` 通過。
- `cargo fmt --all -- --check` 通過。

## 詰まり所と対応

| 詰まり | 対処 |
| --- | --- |
| `read_reply` で `FnOnce` を loop 内で 2 度動かそうとしてコンパイルエラー | `Option::take()` パターンで 1 度きりに限定 |
| `&MediaResolver` (trait をそのまま型に) | `&dyn MediaResolver` に修正 |
| `Bytes::from(Bytes)` のような無意味変換を clippy が指摘 | テスト側を整理 |
| `(Option<Vec<u8>>, Option<Vec<u8>>, i32)` が `clippy::type_complexity` | `DataStruct` という小さい struct に切り出し |

## 残タスク (今回スコープ外)

- 並列度を 2 以上に上げる構成 (現状 1)。`futures::stream::iter(...).buffer_unordered(N)` で MAP_CONCURRENCY 化。
- Tag や ノートブック構造の Notion DB プロパティへのマッピング。
- Evernote の `getNoteStoreUrl` を呼んで notestore URL を自動解決する (今は環境変数で渡す)。
- ENML 高度要素 (`<en-todo>`, `<table>`, `<en-crypt>`) のサポート。
