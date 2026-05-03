# Book Mindmap Explorer

本の内容をマインドマップ的に展開しながら読み進めるための React アプリ プロトタイプ。
お試しコンテンツとして [Google SRE Book](https://sre.google/sre-book/table-of-contents/) の TOC を載せている。

## できること

- Part / Chapter / Concept の階層をマインドマップで可視化
- ノード右の `+ / −` ボタンで展開・折りたたみ
- ノード本体をクリックすると右側のパネルに要約・詳細・原文へのリンクが出る
- 主要章 (SLO, Monitoring, Postmortem 等) は **主要概念 (Concept)** 子ノードで深掘り可能
- パン・ズーム・ミニマップ付き

## 使い方

```bash
mise install   # node 22.22.2 (任意)
npm install
npm run dev    # http://localhost:5173
```

## 仕組み (どう作っているか)

| 役割 | ファイル |
| --- | --- |
| 木構造データ | `src/data/sreBook.ts` |
| 型 | `src/types.ts` |
| 木 → react-flow ノード/エッジ変換 + tidy tree レイアウト | `src/layout.ts` |
| マインドマップ画面全体 | `src/App.tsx` |
| ノード見た目 | `src/components/MindNode.tsx` |
| 右側の詳細パネル | `src/components/DetailPanel.tsx` |

レイアウトは「子ノードの累積高さを再帰計算 → 親をその中央に置く」という単純な
tidy tree。展開状態 (Set<string>) を React state で持ち、変更時に
`buildGraph()` で nodes/edges を再計算する。

## 別の本を試したい場合

`src/data/sreBook.ts` と同じ形式の `BookNode` ツリーを書けば差し替えられる。
要約や詳細を AI にお任せで埋めるパイプラインを追加するのが次の発展候補。

## 設計上の選択

- **react-flow (xyflow)** を採用。パン・ズーム・ミニマップが標準装備で、ノードを React コンポーネントで自由に書ける。
- レイアウトライブラリ (dagre / elkjs) は使わず自前実装。データが小さく階層も浅いので十分シンプルに済む。
- マークダウンライブラリも使わず、`detail` フィールドは `**bold**` と箇条書きだけ自前で軽くレンダリング。
