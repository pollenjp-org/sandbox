# draw.io MCP サンプル

draw.io (diagrams.net) を MCP (Model Context Protocol) 経由で AI アシスタント
(Claude Code / Claude Desktop など) から使うためのサンプルです。

公式実装である [`jgraph/drawio-mcp`](https://github.com/jgraph/drawio-mcp) の
**MCP Tool Server** (`@drawio/mcp`) の使い方をまとめています。

## drawio MCP は何をしてくれるか

AI が生成した「diagram の XML / CSV / Mermaid」を、draw.io エディタに
ワンクリックで開ける URL に変換し、ブラウザで開きます。
AI に「アーキテクチャ図を描いて」と依頼すると、draw.io 上で編集可能な状態の
図がそのまま立ち上がる、というのが基本の体験です。

提供されるツールは 3 つです (公式 README より):

| Tool                  | 用途                                          |
| --------------------- | --------------------------------------------- |
| `open_drawio_xml`     | draw.io ネイティブ XML を開く                 |
| `open_drawio_csv`     | CSV (ノードリスト) から図を生成して開く       |
| `open_drawio_mermaid` | Mermaid 記法を draw.io に変換して開く         |

共通パラメータ:

- `content` (string, required): 本体
- `lightbox` (bool, optional): lightbox モード
- `dark` ("auto" | "true" | "false", optional): ダークモード

## セットアップ

### 1. 前提

- Node.js 18+ (npx が動けば OK)
- AI クライアント (Claude Code / Claude Desktop など)

### 2. 動作確認 (任意)

サーバ単体を立ち上げて、起動するかだけ確認できます。

```bash
npx -y @drawio/mcp
```

通常は MCP クライアント側から起動させるので、ここで Ctrl-C で止めて OK。

### 3. MCP クライアントに登録

#### Claude Code

`~/.claude.json` (またはプロジェクトの `.mcp.json`) に
[`config/claude-code.mcp.json`](./config/claude-code.mcp.json) の内容を
追記します。CLI からも登録できます:

```bash
claude mcp add drawio -- npx -y @drawio/mcp
```

#### Claude Desktop

設定ファイルに [`config/claude-desktop.json`](./config/claude-desktop.json) を
マージします。

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 4. 使ってみる

AI クライアントに以下のようなプロンプトを投げます:

> `examples/architecture.xml` の内容で draw.io を開いて

> `examples/orgchart.csv` を draw.io で図にして

> `examples/sequence.mmd` の Mermaid を draw.io で開いて

AI 側はそれぞれ `open_drawio_xml` / `open_drawio_csv` / `open_drawio_mermaid`
ツールを呼び、ブラウザに draw.io エディタを開きます。

## サンプルファイル

- [examples/architecture.xml](./examples/architecture.xml)
  AWS 風のシンプルな 3 層アーキテクチャ (XML)
- [examples/orgchart.csv](./examples/orgchart.csv)
  CSV から組織図を生成するサンプル
- [examples/sequence.mmd](./examples/sequence.mmd)
  ログイン処理のシーケンス図 (Mermaid)
- [examples/flowchart.mmd](./examples/flowchart.mmd)
  CI/CD パイプラインのフローチャート (Mermaid)

## 参考にするプロンプト集

[`prompts.md`](./prompts.md) に、AI に投げると drawio MCP のツールを
うまく呼んでくれる例文を置いています。

## 参考リンク

- [jgraph/drawio-mcp](https://github.com/jgraph/drawio-mcp) - 公式
- [`@drawio/mcp` on npm](https://www.npmjs.com/package/@drawio/mcp)
- [Hosted MCP App Server](https://mcp.draw.io/mcp) (チャット内に図を埋め込む別実装)
