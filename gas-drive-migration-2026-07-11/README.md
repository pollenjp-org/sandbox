# gas-drive-migration — マイドライブ → 別ドメイン共有ドライブ 移行ツール

`@google.com` アカウントのマイドライブ内フォルダを、別ドメイン
(`@misugi-corp.co.jp`) の Google Workspace **共有ドライブ**へ移行する
Google Apps Script (GAS)。**操作は Google スプレッドシートの
メニューと設定シートだけで完結**し、コードを触る必要はない。

Google ドライブはドメイン間の「オーナー譲渡」や「フォルダごとの移動」を
許可していないため、このツールは仕様上許可されている操作だけを組み合わせて移行する:

1. 移行先の共有ドライブに**同じ名前・同じ階層の空フォルダを再帰的に作成**
2. **ファイルを1件ずつ移動** — 移動した瞬間に所有権が共有ドライブ (移行先組織) へ移る
3. 元のフォルダ階層はそのまま維持され、ファイルの **ID・URL・版履歴も維持**される

![解決戦略](./docs/textbook/plantuml/out/07_folder_mapping.svg)

## 📚 教科書 (docs/textbook)

新規参画者向けに、背景から運用まで図付きで解説した教科書ドキュメントがある。
**初めての人は [docs/textbook/README.md](./docs/textbook/README.md) から読むこと。**

| 章 | 内容 |
| --- | --- |
| [はじめに](./docs/textbook/00_introduction.md) | このツールの全体像・対象読者・読み方 |
| [第1章 背景](./docs/textbook/01_background.md) | なぜ普通に移動できないのか (3つの壁) |
| [第2章 解決アプローチ](./docs/textbook/02_solution_architecture.md) | 戦略・GAS を選んだ理由・実行アカウントの選択 |
| [第3章 セットアップ](./docs/textbook/03_setup_guide.md) | 事前準備・設定変数・実行手順 |
| [第4章 コード解説](./docs/textbook/04_code_walkthrough.md) | キュー方式・べき等性・自動中断再開の設計 |
| [第5章 開発環境](./docs/textbook/05_dev_environment.md) | mise / TypeScript / clasp / PlantUML / drawio |
| [第6章 運用ガイド](./docs/textbook/06_operations.md) | 制限・トラブルシューティング・FAQ |
| [付録 用語集](./docs/textbook/99_glossary.md) | 用語の一覧 |

## ⚡ クイックスタート (使うだけの人向け)

**操作はすべてスプレッドシート上で完結する** (コード編集は不要)。

> 前提: 移行先の共有ドライブに移行元アカウントが「コンテンツ管理者」で
> 追加済みであること (→ [第3章](./docs/textbook/03_setup_guide.md))

1. 移行元アカウントで <https://sheets.new> を開き、`拡張機能` → `Apps Script` を開く
2. `プロジェクトの設定` → `「appsscript.json」…を表示` を有効化し、
   [`dist/appsscript.json`](./dist/appsscript.json) の内容で置き換える
3. `コード.gs` に [`dist/main.js`](./dist/main.js) を全文貼り付けて保存
4. スプレッドシートを再読み込み → メニュー **「📁 ドライブ移行」→「① 設定シートを準備」**
5. 「設定」シートに **移行元/移行先フォルダ ID** と各設定を入力 (黄色い列のみ)
6. メニュー **「② 移行を開始」**。まず「ドライラン」ONで計画確認 → OFFで本実行
   (進捗は「進捗」シートに自動表示、または「③ 進捗を更新して表示」)

## 🛠 開発コマンド (コードや図を修正する人向け)

```bash
mise trust && mise install   # 初回のみ
mise run setup               # npm install
mise run build               # dist/ へビルド
mise run clasp:push          # GAS プロジェクトへ反映 (要 clasp:login)
mise run docs:diagrams       # 教科書の図 (SVG) を再生成
```

詳細は [第5章 開発環境](./docs/textbook/05_dev_environment.md)。

## 📂 ディレクトリ構成

```text
├── src/                    # TypeScript ソース (main.ts / globals.d.ts / appsscript.json)
├── dist/                   # ビルド成果物 (GAS へコピペする main.js) ※コミット済み
├── docs/textbook/          # 教科書ドキュメント (図のソースも配下)
│   ├── 00_introduction.md 〜 06_operations.md / 99_glossary.md
│   ├── plantuml/           # PlantUML 図のソース (.puml) と out/*.svg
│   └── drawio/             # draw.io 図のソースと out/*.svg
├── .claude/settings.json   # drawio-mcp の設定 (Claude Code 用)
├── mise.toml               # ツール・タスク定義
└── package.json            # npm 依存 (typescript / clasp / 型定義)
```

## ⚠ 注意事項

- 実行前に必ず「設定」シートの **「ドライラン」ON** で計画を確認すること (自動巻き戻し機能はない)
- コピーで救済されたファイルは ID が変わる (詳細: [第6章 6.2](./docs/textbook/06_operations.md#62-移行で維持されるもの変わるもの))
- 大規模移行では GAS のトリガー実行時間クォータ (90分/日) に注意 (詳細: [第6章 6.1](./docs/textbook/06_operations.md#61-どれくらい時間がかかるか))
