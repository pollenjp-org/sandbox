# 01 — 最初のスキーマ

**新出**: `definition` / `relation` / `permission` / relationship / `zed validate`

SpiceDB に登場するものは 2 つしかない。

1. **スキーマ** ([schema.zed](./schema.zed)) — 世界の「型」。どんな種類のオブジェクトがあり、
   どんな関係を持ちえて、その関係から何の権限が導かれるか
2. **relationship** ([validate.yaml](./validate.yaml) の `relationships:`) — 世界の「データ」。
   実際に誰と何がその関係にあるか

チェック (`document:doc1 を user:alice は view できるか?`) は、この 2 つを突き合わせて
答えが出る。アプリのコードに if 文は書かない。

<details><summary>relationship の記法</summary>

```
document:doc1#reader@user:alice
<資源の型>:<id>#<relation>@<主体の型>:<id>
```

「document doc1 の reader は user alice」と右から左に読むと日本語になる。
SpiceDB ではこの 1 行を **タプル** とも呼ぶ。

</details>

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

`Success!` が出れば、`assertions:` に書いた期待どおりに権限が決まっている。

## ここで気づいてほしいこと

[schema.zed](./schema.zed) は `permission view = reader` としか書いていないので、
**writer の bob は view できない**。ドキュメントを書ける人が読めないのは変だが、
SpiceDB は書いたとおりにしか動かない。これを直すのが [02_operators](../02_operators/README.md)。

## 練習

`document:doc1#reader@user:carol` を `relationships:` に足したら、
どの assertion が壊れるか予想してから `zed validate` で確かめる。

<details><summary>答え</summary>

`assertFalse` の `document:doc1#view@user:carol` が壊れる。
carol が reader になったので view できてしまい、「false のはず」という期待に反する。
zed validate は **どの assertion がどう食い違ったか**をツリー表示で教えてくれるので、
わざと壊して出力を読むのが一番の練習になる。

</details>
