# 08 — ZedToken と一貫性

**新出**: ZedToken / New Enemy 問題 / consistency の 4 段階

SpiceDB は速さのために、チェックを **少し古いスナップショット**で評価することがある
(revision の「量子化」)。それで困る場面と、困らないための道具がこの章。

```sh
./run.sh
```

[run.sh](./run.sh) は量子化間隔をわざと 8 秒に広げたサーバで、
「viewer を剥奪した**直後**の check」が consistency 指定によってどう変わるかを見せる。

## New Enemy 問題

Zanzibar 論文が名付けた、認可システム固有のレース。

1. alice がフォルダから bob を外す (剥奪)
2. alice が新しい機密文書をそのフォルダに置く
3. bob が古いスナップショットで check される → **外したはずの bob に新文書が見える**

「書いたはずの ACL 変更が、後続のチェックに反映されない」ことが問題の核。
SpiceDB の答えが **ZedToken**: すべての書き込みが「この変更を含む revision の印」を
返すので、以後のチェックに「**少なくともこの時点以降の世界で評価せよ**」と要求できる。

<details><summary>量子化 (quantization) とは</summary>

チェックのたびに最新 revision を使うと、キャッシュがほぼ効かない
(revision が変わるとキャッシュキーも変わるため)。そこで SpiceDB は時間を
一定幅 (既定 5s) に丸め、**窓の中では同じ revision を使い回す**ことで
キャッシュを効かせている。「少し古い」の出どころはこれ。

</details>

## consistency は 4 段階

| 指定 | 意味 | 使いどころ |
| --- | --- | --- |
| `minimize_latency` (既定) | 量子化された revision でよい | 大半の読み取り。速くてキャッシュが効く |
| `at_least_as_fresh(zedtoken)` | この token 以上に新しい世界で | **定石**。資源に紐づけて保存した token を渡す |
| `at_exact_snapshot(zedtoken)` | ちょうどこの時点で | ページネーションの整合、監査の再現 |
| `fully_consistent` | 常に最新 | 剥奪を 1 秒も漏らせない画面。高くつく |

<details><summary>ZedToken はどこに保存するのか</summary>

SpiceDB は覚えてくれないので**アプリが保存する**。定石は「資源の行に 1 列足す」
(document テーブルに `zedtoken` 列)。その資源への ACL 変更のたびに上書きし、
その資源のチェック時に `at_least_as_fresh` で渡す。
[応用アプリ](../../app/README.md) はメモリ上の文書ストアでこれを実装している。

</details>

<details><summary>スナップショットが古すぎると?</summary>

`at_exact_snapshot` は datastore の GC 窓 (既定 24h 程度) を過ぎた revision を
指すとエラーになる。ZedToken は「しばらく有効な栞」であって永久保存する
ものではない。

</details>

## 実務の目安

- 読み取り系はまず既定 (minimize_latency) で設計し、
  **「自分の変更が直後の画面に反映されてほしい」導線にだけ** ZedToken を通す
- `fully_consistent` を常用するのは、キャッシュを全部捨てるのと同じ。
  レイテンシと引き換えにする価値がある操作か、都度問い直す
