# ADK Go サンプルアプリ作成

- 日時: 2026-04-27T06:10:18+00:00
- ブランチ: `claude/adk-sample-go-app-YbXol`
- 対象コミット: `3f3e00b adk-2026-04-27: add Go ADK quickstart sample`

## 命令

> directory を `echo "adk-$(date '+%Y-%m-%d')"` として、その下に adk を使った
> sampleアプリを作れ。言語は golang とする。

## 経緯と思考

### 1. ターゲットディレクトリの決定

`echo "adk-$(date '+%Y-%m-%d')"` を実行し、`adk-2026-04-27` を作成対象とした。
リポジトリ直下に `<技術名>-<日付>` 形式の姉妹ディレクトリが多数存在しており
(例: `aws-cdk-go-2025-06-28`, `gcp-terragrunt-2026-01-29`)、それと整合する。

### 2. 「ADK」の解釈

ADK = **Agent Development Kit**。Google が公開している AI エージェント構築用
フレームワーク。Python / TypeScript / Java / Go の実装があり、Go 版は
`google.golang.org/adk` でモジュール公開されている (リポジトリは
`github.com/google/adk-go`)。今回は Go 版を採用。

### 3. API バージョンの調整

最初は `github.com/google/adk-go` の `main` ブランチに置かれている quickstart
を参照して main.go を書いたが、これはタグ未リリースの最新 API を使用しており
v0.1.0 ではビルドが通らなかった:

| `main` ブランチ                          | `v0.1.0` (リリース済)                           |
| ---------------------------------------- | ----------------------------------------------- |
| `cmd/launcher` (`launcher.Config`)       | `cmd/launcher/adk` (`adk.Config`)               |
| `agent.NewSingleLoader`                  | `server/restapi/services.NewSingleAgentLoader`  |

モジュールキャッシュ
(`/root/go/pkg/mod/google.golang.org/adk@v0.1.0/examples/quickstart/main.go`)
の実コードを正としてインポートパスを書き直した。

### 4. ビルドと動作確認

- `go mod tidy` — 依存解決成功 (`genai` は最新の `v1.20.0` に解決された)
- `go build ./...` — 成功
- `go vet ./...` — 警告なし
- `go run . help` — `GOOGLE_API_KEY` 未設定でモデル生成エラーまで到達。コード
  パス自体は正常 (実行に API キーが必要なため、ここまでが CI 等で確認できる
  上限)

### 5. クリーンアップ

`go build` で生成された ELF バイナリ `adk-2026-04-27/adk-2026-04-27` を
コミット前に削除。`.gitignore` を追加することも検討したが、リポジトリ全体の
ポリシーが見えないため最小限の変更に留めた。

## 変更点

新規ファイル 3 件 (`adk-2026-04-27/` 配下):

- `go.mod` — `google.golang.org/adk v0.1.0`, `google.golang.org/genai`
- `go.sum`
- `main.go` — Gemini 2.5 Flash + Google Search ツールで稼働する
  `weather_time_agent` を ADK launcher 経由で起動

## ポイント / 注意点

- **依存バージョン**: `google.golang.org/adk` のリリース済タグ (`v0.1.0`) と
  `main` ブランチでは launcher 周りの API が破壊的に異なる。
  pkg.go.dev / GitHub README ではなく、利用するタグの `examples/` を直接参照
  するのが確実。
- **動作には API キーが必須**: `GOOGLE_API_KEY` (Gemini API) を環境変数で
  渡す必要がある。CI でビルド検証だけしたい場合は `go build` 止まりで OK。
- **launcher サブコマンド**: `full.NewLauncher()` は `help` / `run` /
  `web` / `serve` などのサブコマンドを内蔵している。`os.Args[1:]` を渡す
  だけで CLI が立ち上がるのが ADK Go の流儀。

## docs/ の取り扱い

リポジトリに `docs/` ディレクトリは存在しないため、加筆修正対象なし
(今回の命令で新規作成すべきとは解釈しなかった)。将来 `docs/` が整備された
タイミングで、サンプル一覧に `adk-2026-04-27` を追記する想定。
