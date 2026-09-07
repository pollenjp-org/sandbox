# 05 — wildcard で「全員に公開」

**新出**: wildcard (`user:*`)

「リンクを知っている全員が閲覧可」のような全員公開は、wildcard の relationship で表す。

```zed
relation viewer: user | user:*
```

型に `user:*` を許した上で、公開したい文書に**だけ**こう書く。

```
document:handbook#viewer@user:*
```

スキーマに `user:*` と書いただけでは何も公開されない。**公開は 1 文書ずつ
relationship で選ぶ** — 型 (できる) とデータ (している) の分離がここでも効いている。

<details><summary>wildcard と exclusion の組み合わせ</summary>

`permission view = viewer - banned` のように、**全員公開から特定の人を除く**ことは
できる (validate.yaml の troll がそれ)。逆に「wildcard を intersection の材料にする」
(`viewer & verified` の viewer が `user:*`) と、「全員 ∧ verified = verified」の
ような直感になるが、**wildcard は集合演算で個人には展開されない**ため
期待どおりに動かない組み合わせがある。wildcard は「公開フラグ」とだけ考え、
凝った演算に混ぜないのが安全。

</details>

<details><summary>lookup 系 API での注意</summary>

`LookupSubjects` (この資源を見られるのは誰?) に wildcard が絡むと、
答えは「全員 (ただし banned を除く)」のような形になる。API は wildcard を
特別な subject (`user:*`) として返すので、呼び出し側で解釈が要る。

</details>

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

## 練習

`document:secret` も公開してみて、`assertFalse` のどれが壊れるか確かめる。

<details><summary>答え</summary>

`document:secret#view@user:bob` が壊れる。「見られないはずの bob が見られる」
という向きの失敗で、**公開作業のミスは assertFalse が検知してくれる**。
本番スキーマでも「見られてはいけない」側の assertion を書く価値が高い。

</details>
