# gas-drive-ownership-transfer

Google Drive 内で自分が所有するファイル/フォルダの所有権を、指定したユーザーへ**再帰的に一括譲渡**する Google Apps Script(GAS)プロジェクトです。**スプレッドシートに紐付けてデプロイし、シートのカスタムメニューから実行**します。開発は clasp + TypeScript、ツール管理は mise + pnpm です。

> ⚠️ 所有権の譲渡は実質的に不可逆な操作です。必ず **DRY RUN(既定モード)で対象を確認**してから本番実行してください。手順は教科書の[第 5 章](./docs/textbook/05-operations.md)にまとまっています。

## 📚 ドキュメント(Textbook)

新規参画者向けに、ゼロから順に理解できる教科書を用意しています。**まずはこちらから読んでください。**

➡️ **[docs/textbook/](./docs/textbook/README.md)**

| 章 | 内容 |
| --- | --- |
| [第 1 章](./docs/textbook/01-overview.md) | このツールは何か(課題・全体像・前提と制約) |
| [第 2 章](./docs/textbook/02-setup.md) | 環境構築からシートへの初回デプロイまで |
| [第 3 章](./docs/textbook/03-architecture.md) | 設計解説(6 分制限との戦い方) |
| [第 4 章](./docs/textbook/04-code-walkthrough.md) | コードリーディング |
| [第 5 章](./docs/textbook/05-operations.md) | 実行手順・トラブルシューティング |
| [付録](./docs/textbook/06-appendix.md) | 個人アカウント対応、図の再生成、参考リンク |
| [第 7 章](./docs/textbook/07-spreadsheet.md) | スプレッドシート UI の仕組みと共有(設定セル・台帳・共有範囲) |

## クイックスタート(経験者向け)

```bash
# 1. ツールと依存の準備
mise trust && mise install && mise run setup

# 2. Apps Script API を有効化(初回のみ)
#    https://script.google.com/home/usersettings

# 3. ログインと「シート + バインドプロジェクト」の作成
mise run login
mise run build
pnpm exec clasp create-script --type sheets --title "Drive 所有権一括譲渡" --rootDir dist
mise run push

# 4. 作成されたスプレッドシートを開き、メニュー「所有権譲渡 → 初期設定」を実行
#    「設定」シートに譲渡先(B2)と対象フォルダ(B3)を入力
#    → 「開始(ツリー走査)」を DRY RUN で実行し、「譲渡ログ」シートで対象を確認
#    → B4 を本番に切り替えてもう一度実行
```

## 主な機能

- **スプレッドシート UI**: 設定は「設定」シートのセル(B2 譲渡先 / B3 対象フォルダ / B4 モードのプルダウン)、実行はカスタムメニュー、結果は「譲渡ログ」シート(台帳)に 1 件 1 行で記録
- **2 つの走査戦略**: 指定フォルダ配下の再帰走査(ツリー走査)と、全所有物の検索走査。対象になるのは常に**実行者本人が所有する**アイテムだけ
- **6 分制限対策**: バッチ処理 + ユーザープロパティへのチェックポイント保存 + 時間主導トリガーによる自動再開
- **安全装置**: DRY RUN 既定(本番は確認 2 段階)、**譲渡先・対象フォルダはデフォルトなしで未指定はエラー**、1 件ごとの所有者チェック、ユーザーロックによる多重実行防止、エラー時も記録して継続
- **利用者ごとの分離**: 進捗(ユーザープロパティ)・排他ロック・再開トリガーがすべて利用者単位。シートを共有して複数人で使っても互いに干渉しない

## ディレクトリ構成

```
├── src/            # TypeScript ソース(編集はここ)
├── dist/           # ビルド成果物 = clasp が push する実体(自動生成)
├── docs/textbook/  # 教科書ドキュメント
│   ├── plantuml/   # 図のソース(.puml)+ 生成物(out/*.svg)と生成タスク
│   ├── drawio/     # drawio を使う場合の手引き
│   └── images/     # drawio 図の SVG 置き場(必要時に作成)
├── mise.toml       # ツールバージョンとタスク定義
├── package.json    # 依存パッケージ(clasp / typescript / 型定義)
└── pnpm-workspace.yaml # pnpm 設定(リリース後 1 週間未満のバージョンを使わない)
```

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `mise run setup` | 依存パッケージのインストール(pnpm) |
| `mise run build` | TypeScript → `dist/` へビルド |
| `mise run push` | ビルドして Apps Script へ反映 |
| `mise run open` | Apps Script エディタを開く(ログ確認・開発用) |
| `mise run diagrams` | PlantUML 図の再生成 + 教科書へコピー |
