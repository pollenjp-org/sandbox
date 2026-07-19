# drawio/ — 編集可能な図のソースと SVG 出力

[draw.io (diagrams.net)](https://www.drawio.com/) 形式の図を置く。マウスで自由に
レイアウトを調整したい図はこちらで管理する (テキストで管理する図は `../plantuml/`)。

```
drawio/
├── mise.toml            # *.drawio → out/*.svg の生成タスク
├── render.mjs           # Chromium+mxgraph によるレンダラ (drawio-desktop 無し環境向け)
├── architecture.drawio  # 全体アーキテクチャ (編集可能版)
└── out/
    └── architecture.svg # 生成された白背景 SVG (教科書から参照)
```

| ファイル | 内容 | 対応する PlantUML 版 |
| --- | --- | --- |
| `architecture.drawio` | 移行ツールの全体アーキテクチャ図 | `../plantuml/02_architecture.puml` |

## SVG を生成する

```bash
mise trust
mise run drawio:generate    # *.drawio → out/*.svg (白背景)
```

生成方法は2通り (タスクが自動で選ぶ):

1. **drawio-desktop があればそれを使う** (公式・最も忠実)
2. 無ければ **Chromium(Playwright) + mxgraph のフォールバック** (`render.mjs`)

> 💡 本ディレクトリの `.drawio` は **mxgraph 標準の図形だけ**で描いているため、
> どちらの方法でも同じ絵になる。drawio で編集する際も、独自ステンシル
> (folder/cylinder3 など) を使うとフォールバック renderer で崩れる点に注意。

<details>
<summary>📖 用語解説: なぜ Chromium+mxgraph のフォールバックがあるのか</summary>

`.drawio` の SVG 書き出しは本来 drawio-desktop で行うが、GitHub Releases から
バイナリを取得できない環境 (プロキシ制限など) では導入できない。draw.io の描画エンジン
である [mxGraph](https://github.com/jgraph/mxgraph) は npm で入手でき、これを
ヘッドレス Chromium 上で動かせば `.drawio` (mxGraph XML) を SVG 化できる。
本リポジトリの `render.mjs` はその実装。

</details>

## 編集方法

いずれかで開いて編集する。編集後は `mise run drawio:generate` で `out/` を更新する。

1. **ブラウザ**: <https://app.diagrams.net/> で `architecture.drawio` を開く
2. **VS Code**: 拡張機能 [Draw.io Integration](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio)
3. **デスクトップアプリ**: [drawio-desktop](https://github.com/jgraph/drawio-desktop/releases)

> ⚠ 保存時は**圧縮を無効**にすること (drawio の設定で「Compressed」を OFF)。
> フォールバック renderer は非圧縮の `<mxGraphModel>` を前提にしている。

## Claude Code から編集する (drawio-mcp)

プロジェクトルートに [drawio-mcp](https://github.com/jgraph/drawio-mcp) の設定
(`.claude/settings.json`) を置いてある。Claude Code で開くと AI に図の編集を依頼できる。

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "@drawio/mcp@1.3.2"]
    }
  }
}
```
