# gas-drive-ownership-transfer

Google Drive 内で自分が所有するファイル/フォルダの所有権を、指定したユーザーへ**再帰的に一括譲渡**する Google Apps Script(GAS)プロジェクトです。clasp + TypeScript で開発し、mise でツールを管理します。

> ⚠️ 所有権の譲渡は実質的に不可逆な操作です。必ず **DRY RUN(既定)で対象を確認**してから本番実行してください。手順は教科書の[第 5 章](./docs/textbook/05-operations.md)にまとまっています。

## 📚 ドキュメント(Textbook)

新規参画者向けに、ゼロから順に理解できる教科書を用意しています。**まずはこちらから読んでください。**

➡️ **[docs/textbook/](./docs/textbook/README.md)**

| 章 | 内容 |
| --- | --- |
| [第 1 章](./docs/textbook/01-overview.md) | このツールは何か(課題・全体像・前提と制約) |
| [第 2 章](./docs/textbook/02-setup.md) | 環境構築から初回デプロイまで |
| [第 3 章](./docs/textbook/03-architecture.md) | 設計解説(6 分制限との戦い方) |
| [第 4 章](./docs/textbook/04-code-walkthrough.md) | コードリーディング |
| [第 5 章](./docs/textbook/05-operations.md) | 実行手順・トラブルシューティング |
| [付録](./docs/textbook/06-appendix.md) | 個人アカウント対応、図の再生成、参考リンク |
| [第 7 章](./docs/textbook/07-webapp.md) | (オプション)Web アプリ UI と共有範囲の設定 |

## クイックスタート(経験者向け)

```bash
# 1. ツールと依存の準備
mise trust && mise install && mise run setup

# 2. Apps Script API を有効化(初回のみ)
#    https://script.google.com/home/usersettings

# 3. ログインとプロジェクト作成
mise run login
mise run build
npx clasp create-script --title "drive-ownership-transfer" --rootDir dist

# 4. 設定(src/config.ts の newOwnerEmail 等)を編集して反映
mise run push

# 5. エディタを開き、countOwnedFiles → startTransfer(DRY RUN)の順に実行
mise run open
```

## 主な機能

- **2 つの走査戦略**: 指定フォルダ配下の再帰走査(`startTransfer`)と、全所有物の検索走査(`startTransferAllOwned`)
- **6 分制限対策**: バッチ処理 + スクリプトプロパティへのチェックポイント保存 + 時間主導トリガーによる自動再開
- **安全装置**: DRY RUN 既定、譲渡先の検証、所有者チェック、LockService による多重実行防止、エラー時も継続して完走
- **Web アプリ UI(オプション)**: ブラウザのボタンで開始・進捗確認・停止。既定は「自分として実行 × 自分のみアクセス可」の最も安全な公開設定

## ディレクトリ構成

```
├── src/            # TypeScript ソース(編集はここ)
├── dist/           # ビルド成果物 = clasp が push する実体(自動生成)
├── docs/textbook/  # 教科書ドキュメント
├── plantuml/       # 図のソース(.puml)と生成タスク
├── drawio/         # drawio を使う場合の手引き
├── mise.toml       # ツールバージョンとタスク定義
└── package.json    # npm 依存(clasp / typescript / 型定義)
```

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `mise run setup` | npm 依存のインストール |
| `mise run build` | TypeScript → `dist/` へビルド |
| `mise run push` | ビルドして Apps Script へ反映 |
| `mise run open` | Apps Script エディタを開く |
| `mise run diagrams` | PlantUML 図の再生成 + 教科書へコピー |
