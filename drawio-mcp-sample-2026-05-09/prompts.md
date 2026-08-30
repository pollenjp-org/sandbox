# プロンプト例

drawio MCP の各ツールを呼ばせるための例文。
このディレクトリで Claude Code を起動した状態を想定しています。

## XML を直接開かせる (`open_drawio_xml`)

```
examples/architecture.xml の内容を読み取って、drawio MCP の
open_drawio_xml ツールで draw.io エディタに開いて。dark="auto" で。
```

## CSV から図を生成 (`open_drawio_csv`)

```
examples/orgchart.csv の中身を read して、drawio MCP の open_drawio_csv で
組織図として開いて。
```

## Mermaid から変換 (`open_drawio_mermaid`)

```
examples/sequence.mmd を読んで、drawio MCP の open_drawio_mermaid で
draw.io に開いて。
```

```
examples/flowchart.mmd を drawio MCP で開いて。lightbox=true で。
```

## ゼロから作らせる

```
S3 + CloudFront + Lambda + DynamoDB の典型的なサーバーレス構成図を
draw.io ネイティブ XML で作って、drawio MCP の open_drawio_xml で開いて。
```

```
EC コマースサイトの注文 → 決済 → 発送までのシーケンス図を Mermaid で書いて、
drawio MCP で開いて。
```

## ヒント

- 「drawio MCP で開いて」と明示すると、AI がツールを呼んでくれやすい。
- ツール名を直接書く (`open_drawio_xml` など) と、より確実。
- 大きい図は XML を長文で生成させるよりも、Mermaid → MCP 経由で変換させた
  方が短いプロンプトで済むことが多い。
