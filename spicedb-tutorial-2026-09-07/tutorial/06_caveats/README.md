# 06 — caveat で条件付きの関係

**新出**: `caveat` / `with` / CONDITIONAL という第 3 の答え

ここまでの関係は「ある / ない」の 2 値だった。caveat を使うと
**「条件を満たすあいだだけある」関係**を書ける。題材は期限付き共有リンク。

```zed
caveat not_expired(current_time timestamp, expires_at timestamp) {
    current_time < expires_at
}

definition document {
    relation shared_viewer: user with not_expired
    permission view = owner + shared_viewer
}
```

<details><summary>CEL とは</summary>

caveat の中身は CEL (Common Expression Language)。Kubernetes の
ValidatingAdmissionPolicy などでも使われる、副作用なしの式言語。
比較・論理演算・文字列/時刻/IP アドレスの関数が使える。

</details>

条件の材料 (context) は 2 か所から来て、チェック時にマージされる。

| いつ | どこに書く | この章では |
| --- | --- | --- |
| relationship を書くとき | タプル末尾の `[not_expired:{...}]` | `expires_at` (共有の期限) |
| チェックするとき | リクエストの context (`with {...}`) | `current_time` (今何時か) |

<details><summary>現在時刻は SpiceDB が入れてくれないのか</summary>

入れてくれない。時刻をどこから取るかは呼び出し側の責任 (テスト容易性にも効く)。
なお「期限付き relationship」だけが目的なら、新しめの SpiceDB には
専用の expiration 機能 (`use expiration` + `relation viewer: user with expiration`) も
あり、期限切れタプルの自動失効まで面倒を見てくれる。caveat は期限に限らない
**汎用の条件**の道具と覚えておく。

</details>

## 第 3 の答え: CONDITIONAL

context が足りないとき、SpiceDB は true/false ではなく
**CONDITIONAL (条件付き)** と答え、足りない context の名前を教えてくれる。
validate.yaml では `assertCaveated:` がそれを検証している。
API では `PERMISSIONSHIP_CONDITIONAL_PERMISSION` が返る。

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

## 練習

`not_expired` に第 3 引数 `max_uses int` を足して「10 回まで」のような条件を
書き足すには、式をどう変えればよいか考える (validate までできれば上出来)。

<details><summary>答えの方向</summary>

`current_time < expires_at && used_count < max_uses` のように**式は書ける**が、
`used_count` を数えて増やすのは SpiceDB の仕事ではない (relationship の context を
毎回書き換えることになり、書き込み競合も自前で持つことになる)。
「使用回数」のような頻繁に動く状態はアプリの DB に置き、caveat には
**チェック時に外から渡せる事実**だけを載せるのが設計の分かれ目。

</details>

これで文書共有アプリに必要な部品は全部そろった。次の [07_zed_server](../07_zed_server/README.md) から、
validate の箱庭を出て本物のサーバに触る。
