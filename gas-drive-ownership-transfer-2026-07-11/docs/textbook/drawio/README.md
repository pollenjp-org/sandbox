# docs/textbook/drawio/

textbook 用に自由配置の図(ネットワーク構成図、画面遷移のラフなど)を追加したくなった場合に、draw.io のファイル(`.drawio`)をこのディレクトリへ置きます。

現時点で本プロジェクトの図はすべて UML 系のため、テキストで差分管理できる [PlantUML](../plantuml/)(同じく `docs/textbook/` 直下)に統一しており、このディレクトリは手引きのみです。

## AI エージェントから drawio を編集する(drawio-mcp)

Claude Code などの MCP 対応エージェントから drawio ファイルを直接編集するには、[drawio-mcp](https://github.com/jgraph/drawio-mcp) を使います。リポジトリの `.claude/settings.json` に次を追加してください。

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

## 運用ルール(推奨)

- `.drawio` ソースファイルを必ずコミットする(エクスポート画像だけのコミットは不可)
- 教科書へ埋め込む場合は SVG でエクスポートし、`docs/textbook/images/`(無ければ作成)へ置く
- 図の命名は PlantUML 側と揃えて `NN_名前.drawio` とする
