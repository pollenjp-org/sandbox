# 第5章 開発環境 — mise / TypeScript / clasp / PlantUML / drawio

[← 第4章](./04_code_walkthrough.md) | [目次](./README.md) | [次章: 運用ガイド →](./06_operations.md)

この章は「コードや図を**修正する人**」向け。使うだけなら第3章まででよい。

## 5.1 リポジトリ構成

```text
gas-drive-migration-2026-07-11/
├── README.md                    # プロジェクト概要とクイックスタート
├── mise.toml                    # ツール (node / pnpm) とタスク定義
├── package.json                 # 依存 (typescript / clasp / 型定義)
├── pnpm-workspace.yaml          # pnpm 設定 (minimumReleaseAge など)
├── pnpm-lock.yaml               # 依存のロックファイル
├── tsconfig.json                # TypeScript の設定 (GAS 向け)
├── .clasp.json.example          # clasp 設定の雛形 (コピーして .clasp.json に)
├── .claude/
│   └── settings.json            # drawio-mcp の設定 (Claude Code 用)
├── src/
│   ├── main.ts                  # ★ソースコード本体 (TypeScript)
│   ├── globals.d.ts             # Drive API v3 の最小型定義
│   └── appsscript.json          # GAS マニフェスト
├── dist/                        # ビルド成果物 (コミット済み・コピペ用)
│   ├── main.js                  # ★GAS に貼り付けるファイル
│   └── appsscript.json
└── docs/textbook/               # この教科書 (図のソースも配下に置く)
    ├── README.md                # 教科書の目次
    ├── 00_introduction.md 〜 06_operations.md / 99_glossary.md
    ├── plantuml/                # PlantUML 図のソース (.puml) と mise タスク
    │   └── out/                 # 生成された SVG (コミット済み)
    └── drawio/                  # draw.io 形式の編集可能な図
        ├── render.mjs           # Chromium+mxgraph レンダラ
        └── out/                 # 生成された SVG (コミット済み)
```

> 💡 `dist/` と `docs/textbook/**/out/` は生成物だが、**意図的にコミットしている**。
> 前者は「ビルド環境なしでもコピペで使える」ため、後者は「GitHub 上で教科書の
> 図が表示される」ためである。ソースを変えたら生成物も再生成してコミットすること。
> (図のソース `plantuml/` `drawio/` は教科書と一緒に `docs/textbook/` 配下に置いている。)

## 5.2 mise — ツールバージョンとタスクの管理

このリポジトリでは、外部 CLI ツール (Node.js・pnpm、図生成用の Java) の
バージョン固定とタスクランナーに [mise](https://mise.jdx.dev/) を使う。

<details>
<summary>📖 用語解説: mise (ミーズ)</summary>

プロジェクトごとに開発ツールのバージョンを固定・自動切替するツール
(asdf の後継的存在)。`mise.toml` に「このプロジェクトは node 22 を使う」などと
書いておくと、ディレクトリに入るだけで適切なバージョンが使われる。
`[tasks.xxx]` でタスクランナーとしても使え、npm scripts や Makefile の
代わりになる。

</details>

```bash
# インストール (https://mise.jdx.dev/getting-started.html)
curl https://mise.run | sh

# このプロジェクトの設定を信頼する (初回のみ・セキュリティ機構)
cd gas-drive-migration-2026-07-11
mise trust
cd docs/textbook/plantuml && mise trust && cd -
cd docs/textbook/drawio   && mise trust && cd -

# ツール (Node.js + pnpm) を導入してタスクを実行
mise install
mise run setup        # pnpm install
```

### タスク一覧

| コマンド | 内容 |
| --- | --- |
| `mise run setup` | 依存のインストール (`pnpm install`) |
| `mise run typecheck` | 型チェックのみ |
| `mise run build` | `dist/` へビルド (tsc + マニフェストコピー) |
| `mise run login` | clasp の Google ログイン (`pnpm exec clasp login`) |
| `mise run create-sheet` | シート+バインドプロジェクトを新規作成 (`clasp create-script --type sheets`) |
| `mise run push` | ビルドして GAS プロジェクトへ反映 (`pnpm exec clasp push`) |
| `mise run open` | Apps Script エディタを開く (`pnpm exec clasp open-script`) |
| `mise run docs:diagrams` | 教科書の図 (SVG) を再生成 (plantuml + drawio) |
| (plantuml/ 内) `mise run plantuml:generate svg,png` | 図を任意フォーマットで生成 |

> セットアップから初回デプロイまでの詳しい手順は [第3章](./03_setup_guide.md) を参照。
> 本プロジェクトはパッケージマネージャに **pnpm** を採用し、`pnpm-workspace.yaml` の
> `minimumReleaseAge` でサプライチェーン対策を入れている ([第3章 3.4](./03_setup_guide.md#34-依存パッケージをインストールする))。

### ネットワーク制限環境での Tips (実体験に基づく)

プロキシ等で外部ダウンロードが制限された環境では次が役立つ。

- **PlantUML jar**: GitHub releases がブロックされる環境向けに、
  `plantuml/mise.toml` のダウンロードタスクは **Maven Central への
  フォールバック**を実装済み (中身は同一の jar)
- **JDK が取得できない環境**: システムに Java (11+) が入っていれば
  `MISE_DISABLE_TOOLS=java mise run plantuml:generate` で mise 管理の Java を
  バイパスしてシステム Java を使える
- **mise 本体**: `curl https://mise.run` がブロックされる場合、
  `npm install -g @jdxcode/mise` でも導入できる (npm レジストリは
  通ることが多い)

## 5.3 TypeScript とビルド

![ビルドパイプライン](./plantuml/out/08_build_pipeline.svg)

ソースは TypeScript ([`src/main.ts`](../../src/main.ts)) で書き、`tsc` で
GAS 用 JavaScript ([`dist/main.js`](../../dist/main.js)) に変換する。

<details>
<summary>📖 用語解説: TypeScript / tsc / トランスパイル</summary>

TypeScript は JavaScript に型 (この変数は文字列、この関数は数値を返す、など) を
書き足せる言語。コンパイラ `tsc` が型の矛盾を実行前に検出してくれるため、
「typo でプロパティ名を間違えた」「null かもしれない値を使った」といったバグを
実行せずに潰せる。tsc は型を取り除いた素の JavaScript を出力する
(この変換をトランスパイルと呼ぶ)。GAS が実行するのは出力された JavaScript の方。

</details>

### GAS 向け TypeScript の特殊事情

[`tsconfig.json`](../../tsconfig.json) にはっきり表れている。普通の Web/Node
プロジェクトとの違いはここ:

| 設定 | 値 | 理由 |
| --- | --- | --- |
| `module` | `"none"` | **GAS は import/export (ES Modules) に対応していない**。全関数がグローバルに置かれる「1枚のスクリプト」として書く。トリガーやエディタから呼べるのはトップレベル関数だけ |
| `target` | `"ES2019"` | GAS の V8 ランタイムが確実にサポートする構文レベルに合わせる |
| `types` | `["google-apps-script"]` | `Logger` や `PropertiesService` など組み込みサービスの型を効かせる |

<details>
<summary>📖 用語解説: V8 ランタイム</summary>

GAS のスクリプト実行エンジン。Chrome や Node.js と同じ JavaScript エンジン
「V8」ベースで、モダンな構文 (クラス、アロー関数、const/let など) が使える。
旧 Rhino ランタイムの後継。ただしモジュール機構 (import/export) は使えない。

</details>

もう1つ、Drive API v3 (高度なサービス) のグローバル `Drive` には公式の型定義
パッケージがないため、**使うメソッドだけを [`src/globals.d.ts`](../../src/globals.d.ts)
に自前で宣言**している。全部の型を書こうとせず「使う範囲だけ正確に」が保守のコツ。

<details>
<summary>📖 用語解説: .d.ts (型定義ファイル) / DefinitelyTyped</summary>

`.d.ts` は「実装はないが型情報だけがある」TypeScript のファイル。JavaScript
ライブラリに後付けで型を与えるのに使う。世界中のライブラリの型定義を集めた
リポジトリが DefinitelyTyped で、`npm install @types/xxx` で取り込める。
`@types/google-apps-script` もその一つ。

</details>

## 5.4 clasp — ローカルから GAS へデプロイ

<details>
<summary>📖 用語解説: clasp (クラスプ)</summary>

Google 公式の GAS 用コマンドラインツール (Command Line Apps Script Projects)。
ローカルのファイルを GAS プロジェクトへアップロード (`clasp push`) /
ダウンロード (`clasp pull`) できる。これによりコードを Git で管理し、
好きなエディタで開発できるようになる。

</details>

初回セットアップの全手順は [第3章](./03_setup_guide.md) にまとめてある。要点だけ再掲すると:

```bash
# 1. Apps Script API を有効化 (初回のみ)
#    https://script.google.com/home/usersettings を開き ON にする
mise run login          # clasp で移行元アカウントにログイン

# 2A. シートごと新規作成する (おすすめ) — .clasp.json も自動生成される
mise run create-sheet   # clasp create-script --type sheets --title "ドライブ移行ツール" --rootDir dist

# 2B. あるいは既存シートのバインドプロジェクトに紐付ける
#     cp .clasp.json.example .clasp.json して scriptId を書き込む

# 3. ビルドして反映
mise run push
```

以後、コードを修正したら `mise run push` するだけで GAS 側に反映される。
`.clasp.json` は個人環境ごとに違うため Git 管理外 (`.gitignore` 済み)。

> 💡 本ツールはスプレッドシートに紐づく **container-bound スクリプト**。
> `clasp create-script --type sheets` は新しいシートとバインドプロジェクトを一度に作る。
> 既存シートに紐付ける場合は、そのシートの「拡張機能 → Apps Script」で開いた
> プロジェクトの scriptId を使うこと(スタンドアロン作成はシートに紐づかない)。

> 💡 push 対象は `dist/` ディレクトリ (`.clasp.json` の `rootDir`)。
> `src/*.ts` を直接 push しているのではなく、ビルド成果物を送っている。

## 5.5 PlantUML — 図をテキストで管理する

<details>
<summary>📖 用語解説: PlantUML</summary>

図をテキスト (専用記法) で書いて画像に変換するツール。図が「コード」になるため、
Git で差分管理でき、レビューもしやすい。シーケンス図・状態遷移図・
アクティビティ図など UML 系の図が得意。実体は Java 製の jar ファイル。

</details>

この教科書の図の多くは `docs/textbook/plantuml/*.puml` がソース。生成手順:

```bash
# 依存 (日本語ラベルの描画に必要)
sudo apt install graphviz fonts-noto-cjk

# 生成 (jar は初回に自動ダウンロードされる)
cd docs/textbook/plantuml
mise run plantuml:generate          # svg のみ
mise run plantuml:generate svg,png  # svg と png
# → docs/textbook/plantuml/out/*.svg が更新される
```

各 `.puml` の冒頭には日本語描画のための `skinparam defaultFontName "Noto Sans CJK JP"`
と、白背景を明示する `skinparam backgroundColor #FFFFFF` を入れている。
プロジェクトルートからは `mise run docs:diagrams` で PlantUML と drawio を一括再生成できる。

<details>
<summary>📖 用語解説: Graphviz</summary>

グラフ (ノードと辺) の自動レイアウトエンジン。PlantUML はコンポーネント図や
状態遷移図のレイアウト計算に Graphviz (`dot` コマンド) を使う。
日本語フォント (fonts-noto-cjk) が無いと日本語ラベルが文字化け (豆腐) になる。

</details>

図を修正する流れ: `.puml` を編集 → `mise run plantuml:generate svg,png` →
PNG で見た目を確認 → SVG とともにコミット。

## 5.6 drawio — マウスで編集する図

テキストより手作業のレイアウトが向く図は [drawio/](./drawio/) に置く
(現在はアーキテクチャ図の drawio 版)。編集方法と SVG 生成
(`mise run drawio:generate`) は [drawio/README.md](./drawio/README.md) を参照。

![アーキテクチャ (drawio 版)](./drawio/out/architecture.svg)

> 💡 このサンドボックスでは drawio-desktop を導入できない (GitHub Releases が
> ブロックされている) ため、**Chromium + mxgraph で `.drawio` を SVG 化する
> フォールバック renderer** ([`drawio/render.mjs`](./drawio/render.mjs)) を同梱している。
> `.drawio` は mxgraph 標準の図形だけで描いており、drawio-desktop でも同じ絵になる。

Claude Code ユーザー向けに、[drawio-mcp](https://github.com/jgraph/drawio-mcp)
を使う MCP 設定を [`.claude/settings.json`](../../.claude/settings.json) に用意してある。
このプロジェクトディレクトリを Claude Code で開くと、AI に図の編集を依頼できる。

<details>
<summary>📖 用語解説: MCP (Model Context Protocol)</summary>

AI アシスタントに外部ツールを安全に接続するためのオープンな規格。
`.claude/settings.json` に「このコマンドを立ち上げて接続して」と書いておくと、
Claude Code などの AI エージェントがそのツール (ここでは draw.io の編集機能) を
呼び出せるようになる。

</details>

---

[← 第4章](./04_code_walkthrough.md) | [目次](./README.md) | [次章: 運用ガイド →](./06_operations.md)
