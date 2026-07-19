# 📚 教科書: マイドライブ → 別ドメイン共有ドライブ移行ツール

このプロジェクトに初めて参加する人が、**前提知識ゼロから順番に読むだけで
全体を理解できる**ことを目指した教科書。Google ドライブの仕様・移行戦略・
GAS のコード・開発環境まで、図と用語解説付きで一つずつ説明する。

**まずは [はじめに (00_introduction)](./00_introduction.md) から読むこと。**

## 目次

| 章 | タイトル | 内容 |
| --- | --- | --- |
| [第0章](./00_introduction.md) | はじめに | このツールの全体像・対象読者・読み方 |
| [第1章](./01_background.md) | 背景 — なぜ普通に移動できないのか | マイドライブと共有ドライブの違い、ドメイン間移行を阻む3つの壁 |
| [第2章](./02_solution_architecture.md) | 解決アプローチとアーキテクチャ | 「フォルダは作り直し・ファイルは移動」戦略、GAS+スプレッドシートを選んだ理由、実行アカウントの選択 |
| [第3章](./03_setup_guide.md) | セットアップと実行手順 | 事前準備 (権限設定)、スプレッドシート+スクリプト作成、設定シート入力、ドライラン → 本実行 |
| [第4章](./04_code_walkthrough.md) | コード解説 | スプレッドシート UI 層・キュー方式・べき等性・自動中断再開・エラー処理の設計と実装 |
| [第5章](./05_dev_environment.md) | 開発環境 | mise / TypeScript / clasp / PlantUML / drawio を使った開発フロー |
| [第6章](./06_operations.md) | 運用ガイド・制限事項・FAQ | 実行時間の目安、維持されるもの/変わるもの、トラブルシューティング |
| [付録](./99_glossary.md) | 用語集 | 本文中の用語解説の一覧 |

## このディレクトリの構成

```
docs/textbook/
├── README.md            # このファイル (目次)
├── 00_introduction.md   # はじめに
├── 01_background.md      〜 06_operations.md   # 各章
├── 99_glossary.md       # 用語集
├── plantuml/            # PlantUML 図のソース (.puml) と out/*.svg
└── drawio/              # draw.io 図のソース (.drawio) と out/*.svg
```

- 図のソースは教科書と同じ `docs/textbook/` 配下に置き、生成物 (`*/out/*.svg`) も
  コミットしている (GitHub 上で図が表示されるようにするため)
- 図の再生成はプロジェクトルートで `mise run docs:diagrams` (詳細は
  [第5章](./05_dev_environment.md))
