# 04 — zed とスキーマのテスト

## zed = SpiceDB の公式 CLI

| よく使う形 | 何をする |
| --- | --- |
| `zed validate <file>` | **サーバ無しで**スキーマ+データ+期待値を検証 (この教材の主役) |
| `zed schema write / read` | スキーマの登録と取得 |
| `zed relationship create / touch / delete / read` | relationship の CRUD |
| `zed permission check / lookup-resources / lookup-subjects` | 権限の問い |
| `zed permission check --explain` | 解決経路の木を表示 (デバッグの主力) |
| `zed import` | validate ファイル形式をそのままサーバへ投入 |

サーバに繋ぐ系は接続先が要る。使い捨てなら
`--endpoint localhost:50051 --token <key> --insecure` をその都度、
常用なら `zed context set` (`~/.zed` に保存される点だけ注意)。

<details><summary>--insecure</summary>

TLS 無しの平文 gRPC で繋ぐフラグ。ローカル学習用。本番は TLS を張るので不要になる。

</details>

## validate ファイル — スキーマの単体テスト

[tutorial/](../../../tutorial/README.md) の各章に置いた `validate.yaml` の形式。
SpiceDB Playground と同じもので、**スキーマ・データ・期待値**を 1 ファイルに閉じる。

```yaml
schemaFile: schema.zed        # または schema: |- でインライン
relationships: |-
  document:doc1#reader@user:alice
assertions:
  assertTrue:
    - "document:doc1#view@user:alice"
    - 'document:doc1#view@user:bob with {"current_time": "2026-06-01T00:00:00Z"}'
  assertFalse:
    - "document:doc1#edit@user:alice"
  assertCaveated:
    - "document:doc1#view@user:bob"
validation:
  "document:doc1#view":
    - "[user:alice] is <document:doc1#reader>"
```

| ブロック | 検証すること |
| --- | --- |
| `assertions.assertTrue / assertFalse` | 誰ができる / できない (caveat の context は `with {...}`) |
| `assertions.assertCaveated` | context 不足なら「条件付き」になること |
| `validation` | その権限が**どの relationship 経由か**まで固定する |

<details><summary>assertCaveated</summary>

caveat の判定に必要な context が足りないとき、SpiceDB は true/false ではなく
CONDITIONAL を返す (tutorial/06)。「必ず条件付きになるはず」を固定する assertion。

</details>

<details><summary>validation ブロックの書き方のコツ</summary>

期待する展開結果の文字列は手で当てるのが難しいが、間違えると
zed validate が**正しい内容を提示してくれる**ので、一度わざと空で回して
出力を写すのが速い。展開が面白い章 (tutorial/03, 04) にだけ置いてある。

</details>

## スキーマは必ずテストと共に

スキーマ 1 行の変更は、デプロイなしで全アプリの権限を変える。強力さは怖さでもあり、
この repo では **schema.zed の隣に必ず validate.yaml を置く**ことにしている
([app/schema/](../../../app/schema/) も同じ)。特に価値が高いのは assertFalse 側で、
「公開しすぎ」「剥奪漏れ」という事故はこちらが検知する。

CI 相当の一括実行は [`scripts/check-all.sh`](../../../scripts/check-all.sh)。
数十 ms/件なので、スキーマを触るたびに全部回してよい。

<details><summary>Playground</summary>

https://play.authzed.com — validate ファイルと同じ内容をブラウザで対話的に
編集・可視化できる。共有リンクでスキーマ議論をするのに便利。
この repo が Playground ではなくローカルの zed validate を主役にした理由は
[ADR 001](../../adr/001_learning_path_20260907T004350JST/README.md)。

</details>

<details><summary>composable schema</summary>

スキーマを複数ファイルに分割して合成する仕組み (`zed preview schema compile`)。
定義が増えてきた実務向けで、学習中は 1 ファイルで十分。

</details>

次章: [05 — SpiceDB を動かす](./05_running_spicedb.md)
