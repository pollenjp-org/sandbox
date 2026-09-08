# spicedb-tutorial-2026-09-07

SpiceDB ([Zanzibar](https://authzed.com/zanzibar) 系の OSS 認可データベース) を
**1 から順を追って理解し、応用アプリでの適用まで**持っていくための教材。

📖 **教科書の HTML 版はブラウザですぐ読める →
<https://pollenjp-org.github.io/sandbox/spicedb-tutorial-2026-09-07/>**
(Markdown 版と同内容 + 図がステップ送りで動く)

```sh
nix develop                 # spicedb / zed / go 1.27 / jq / curl が揃う
./scripts/check-all.sh      # 全チュートリアルの検証 + アプリのテストを一括実行
```

## 構成

| 場所 | 何があるか |
| --- | --- |
| [tutorial/](./tutorial/README.md) | 1 章 1 概念のチュートリアル 8 章。01〜06 はサーバ不要で `zed validate` 完結、07〜08 は実演スクリプト付き |
| [app/](./app/README.md) | 応用: Go + authzed-go の文書共有 API (docshare)。`./app/run.sh` → `./app/demo.sh` で動く |
| [docs/](./docs/README.md) | [textbook (教科書 8 章)](./docs/architecture/textbook/README.md)・[ADR](./docs/adr/README.md)・[architecture](./docs/architecture/README.md) |
| [video/](./video/README.md) | 教材を約 8 分で駆け抜ける解説動画の生成パイプライン (VOICEVOX + HTML レンダリング)。`./video/render-all.sh` 一発 |

## 学び方

1. **手を動かす**: [tutorial/01](./tutorial/01_hello_schema/README.md) から順に。
   各章 `zed validate validate.yaml` 一発で答え合わせできる
2. **概念を固める**: 対応する [textbook](./docs/architecture/textbook/README.md) の章を読む
   (チュートリアルが「手」、textbook が「頭」)
3. **応用を見る**: [app/](./app/README.md) で、check の置き場所・一覧の逆引き・
   ZedToken による剥奪の即時反映が実コードでどう座るかを読む

なぜこの構成なのかは [ADR 001](./docs/adr/001_learning_path_20260907T004350JST/README.md)。

## 依存

すべてルートの `flake.nix` が抱える (system には何も入れない)。
各 script は PATH に道具が無ければ devShell へ自動で入り直すので、
`nix develop` を意識せずに `./tutorial/07_zed_server/run.sh` などを直接叩ける。

| ツール | 版 (flake.lock が固定) | 用途 |
| --- | --- | --- |
| spicedb | 1.54.0 | 認可サーバ (`serve` / `serve-testing`) |
| zed | 1.2.0 | CLI (`validate` / `check` / CRUD) |
| go | 1.27.0 | 応用アプリ |
