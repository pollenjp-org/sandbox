# 04 — グループと subject relation

**新出**: subject relation (`group#member`) / グループの入れ子

「eng グループの全員がこの runbook を見られる」を、メンバー数ぶんの relationship を
書かずに **1 本**で表す。

```
document:runbook#viewer@group:eng#member
```

subject の位置に `group:eng` ではなく `group:eng#member` と書くのが肝。
これは「グループというオブジェクト」ではなく **「group:eng の member という集合」**
を指している。メンバーが増減しても runbook 側の relationship は 1 本のまま。

<details><summary>なぜ `group:eng` ではだめなのか</summary>

`viewer: group` と型付けして `@group:eng` を書くと、それは「グループそのもの」が
viewer だという意味になり、メンバーには展開されない。集合として扱いたいなら
スキーマも relationship も `group#member` と書く。「誰を指しているのか」を
型システムで言い分けられるのが SpiceDB のスキーマの強み。

</details>

<details><summary>入れ子の展開</summary>

`group:eng#member@group:platform#member` は「platform のメンバーは eng のメンバー
でもある」。チェック時に SpiceDB がグラフをたどって展開するので、何段ネストしても
アプリ側は関知しない。組織階層 (部 > 課 > チーム) がそのまま書ける。

</details>

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

validation ブロックの展開結果に **`[group:eng#member] is ...` という「集合そのもの」
の行が現れる**のを見てほしい。SpiceDB は個人に潰してから覚えるのではなく、
集合は集合のまま保持し、チェックのたびにたどっている。

## 練習

carol を「platform のメンバー」として足し、`document:runbook#view@user:carol` が
true になることを確かめる。relationship は何本増えるか。

<details><summary>答え</summary>

`group:platform#member@user:carol` の **1 本だけ**。
runbook にも eng にも触らない。「権限を配る」のではなく「所属を記録する」だけで
権限が波及するのが ReBAC の設計感覚。

</details>
