# 02 — permission は集合演算

**新出**: `+` (union) / `&` (intersection) / `-` (exclusion)

permission の右辺は「ユーザーの集合を作る式」。relation が材料で、演算子で合成する。

| 演算子 | 意味 | この章での使い方 |
| --- | --- | --- |
| `a + b` | どちらかに入っていれば OK | reader **か** writer なら view できる |
| `a & b` | 両方に入っている人だけ | reader/writer **かつ** verified なら機密も見られる |
| `a - b` | b に入っている人を除く | banned は何があっても見られない |

```zed
permission view = (reader + writer) - banned
```

<details><summary>演算子の優先順位と括弧</summary>

`-` は左結合で、`a - b + c` のような混在は読み手が迷う。SpiceDB 自体も
曖昧な組み合わせには括弧を要求することがある。**混ぜるときは常に括弧を書く**、
で覚えておくと安全。

</details>

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

## ここで気づいてほしいこと

- 01 で「変だ」と言った **writer が view できない問題は union で解消**した
  (`document:doc1#view@user:bob` が assertTrue 側に移っている)
- eve は reader なのに view できない。**exclusion は union に勝つ**
  (正確には: 式のとおり、union の結果から除いている)
- 「役職」より「条件の組み合わせ」で考える。RBAC の頭で `role=admin` を探すのではなく、
  **集合をどう合成すればその権限になるか**を考えるのが SpiceDB 流

## 練習

「reader は昇格して writer を兼ねるべきでは?」と思ったら、
`permission edit = (reader + writer) - banned` に変えて validate してみる。

<details><summary>答え</summary>

`assertFalse` の `document:doc1#edit@user:alice` が壊れる。
「reader にも編集させる」はスキーマ 1 行の変更で、アプリのデプロイなしに
権限モデルが変わる — これが認可を外部化する意味でもあり、怖さでもある。
だからこの repo では validate.yaml (スキーマのテスト) を必ず並置する。

</details>
