# 付録 用語集

[← 第6章](./06_operations.md) | [目次](./README.md)

本文中のアコーディオン (折りたたみ) で解説した用語の一覧。詳しい文脈は各章を参照。

## Google ドライブ / Workspace 関連

| 用語 | 意味 | 初出 |
| --- | --- | --- |
| ドメイン | メールアドレスの `@` より後ろ。Workspace では組織の単位 | [第1章](./01_background.md) |
| Google Workspace | 企業・組織向け Google サービス一式 (旧 G Suite) | [第1章](./01_background.md) |
| マイドライブ | 個人アカウントに紐づくドライブ領域。アイテムは個人所有 | [第1章](./01_background.md) |
| 共有ドライブ | 所有者が「組織 (共有ドライブ自体)」になる Workspace のドライブ。旧チームドライブ | [第1章](./01_background.md) |
| オーナー権限 (所有権) | アイテムの持ち主としての権限。1アイテムに1オーナー | [第1章](./01_background.md) |
| 組織外ユーザー | その Workspace 組織のドメインに属さないアカウント | [第1章](./01_background.md) |
| コンテンツ管理者 | 共有ドライブのメンバー役割の一つ。追加・編集・移動・削除が可能 | [第2章](./02_solution_architecture.md) |
| 管理コンソール / 特権管理者 | Workspace 組織全体を設定する画面と、その最上位権限 | [第3章](./03_setup_guide.md) |
| 親 (parents) | ファイルがどのフォルダに属するかを表す Drive の属性 | [第4章](./04_code_walkthrough.md) |
| MIME タイプ | ファイル種別を表す文字列。フォルダも特殊な MIME タイプを持つ | [第4章](./04_code_walkthrough.md) |

## GAS / API 関連

| 用語 | 意味 | 初出 |
| --- | --- | --- |
| Google Apps Script (GAS) | Google のサーバーで動く JavaScript 実行環境 | [第2章](./02_solution_architecture.md) |
| コンテナバインドスクリプト | スプレッドシート等に紐づけて作る GAS。今回の操作画面化の土台 | [第2章](./02_solution_architecture.md) |
| onOpen / カスタムメニュー | シートを開くと自動実行され独自メニューを足す仕組み | [第3章](./03_setup_guide.md) |
| トースト | 画面右下に数秒出る小さな通知 (`toast()`) | [第4章](./04_code_walkthrough.md) |
| チェックボックス / 保護 | 真偽値入力用のセル機能と、誤編集を防ぐ範囲保護 | [第3章](./03_setup_guide.md) |
| Drive API | プログラムからドライブを操作する公式インターフェース | [第2章](./02_solution_architecture.md) |
| 高度なサービス | GAS から各種 Google API をフルスペックで使う仕組み | [第2章](./02_solution_architecture.md) |
| OAuth | アプリにアカウント操作を許可する標準的な認可の仕組み | [第2章](./02_solution_architecture.md) |
| スコープ | スクリプトが要求する権限の範囲 | [第3章](./03_setup_guide.md) |
| マニフェスト (appsscript.json) | GAS プロジェクトの設定ファイル | [第3章](./03_setup_guide.md) |
| スクリプトプロパティ | 実行をまたいで残る Key-Value 保存領域 | [第2章](./02_solution_architecture.md) |
| トリガー (時間主導) | 指定時刻・間隔で関数を自動実行する仕組み | [第2章](./02_solution_architecture.md) |
| クォータ | サービス利用量の上限 (実行時間、API 回数など) | [第6章](./06_operations.md) |
| レート制限 | 単位時間あたりの API 呼び出し上限 | [第4章](./04_code_walkthrough.md) |
| V8 ランタイム | GAS の実行エンジン。モダン JS 構文対応、ただし import/export 不可 | [第5章](./05_dev_environment.md) |

## プログラミング / 設計関連

| 用語 | 意味 | 初出 |
| --- | --- | --- |
| キュー / BFS (幅優先探索) | 待ち行列構造と、それを使った浅い階層から順の木探索 | [第4章](./04_code_walkthrough.md) |
| コールスタック | 関数呼び出しの積み重ねを管理する領域。実行終了で消える | [第4章](./04_code_walkthrough.md) |
| JSON / シリアライズ | データの文字列表現と、保存可能な形式への変換 | [第4章](./04_code_walkthrough.md) |
| べき等 (idempotent) | 何度実行しても結果が同じになる性質。安全な再実行の鍵 | [第4章](./04_code_walkthrough.md) |
| ページネーション | 一覧 API が結果を1ページずつ返す方式 | [第4章](./04_code_walkthrough.md) |
| 指数バックオフ | リトライ間隔を2倍ずつ延ばす再試行戦略 | [第4章](./04_code_walkthrough.md) |

## 開発ツール関連

| 用語 | 意味 | 初出 |
| --- | --- | --- |
| mise | ツールバージョン管理 + タスクランナー | [第5章](./05_dev_environment.md) |
| TypeScript / tsc / トランスパイル | 型付き JavaScript とそのコンパイラ・変換 | [第5章](./05_dev_environment.md) |
| .d.ts / DefinitelyTyped | 型定義ファイルと、その共有リポジトリ (`@types/...`) | [第5章](./05_dev_environment.md) |
| clasp | GAS 公式 CLI。ローカル ⇔ GAS のコード同期 | [第5章](./05_dev_environment.md) |
| PlantUML | テキストから図を生成するツール | [第5章](./05_dev_environment.md) |
| Graphviz | グラフ自動レイアウトエンジン (PlantUML が利用) | [第5章](./05_dev_environment.md) |
| MCP (Model Context Protocol) | AI アシスタントに外部ツールを接続する規格 | [第5章](./05_dev_environment.md) |
| アコーディオン | クリックで開閉する折りたたみ表示 (`<details>` タグ) | [目次](./README.md) |

---

[← 第6章](./06_operations.md) | [目次](./README.md)
