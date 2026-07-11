# drawio/ — 編集可能な図のソース

このディレクトリには [draw.io (diagrams.net)](https://www.drawio.com/) 形式の図を置く。
PlantUML (テキストベース) と違い、マウスで自由にレイアウトを調整したい図はこちらで管理する。

| ファイル | 内容 | 対応する PlantUML 版 |
| --- | --- | --- |
| `architecture.drawio` | 移行スクリプトの全体アーキテクチャ図 | `../plantuml/02_architecture.puml` |

## 編集方法

いずれかの方法で開いて編集する。

1. **ブラウザ**: <https://app.diagrams.net/> を開き `architecture.drawio` を読み込む
2. **VS Code**: 拡張機能 [Draw.io Integration](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) を入れると `.drawio` ファイルを直接編集できる
3. **デスクトップアプリ**: [drawio-desktop](https://github.com/jgraph/drawio-desktop/releases)

## Claude Code から編集する (drawio-mcp)

このプロジェクトのルートに [drawio-mcp](https://github.com/jgraph/drawio-mcp) を使う MCP 設定
(`.mcp.json`) を置いてある。このディレクトリをプロジェクトルートとして Claude Code を開くと、
AI に図の編集を依頼できる。

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
