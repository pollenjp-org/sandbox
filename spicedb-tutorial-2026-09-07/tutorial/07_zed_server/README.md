# 07 — サーバを立てて zed で触る

**新出**: `spicedb serve` / preshared key / relationship CRUD / `expand` / `lookup-resources` / `lookup-subjects`

01〜06 の `zed validate` は「スキーマ + データ + 期待」を 1 ファイルに閉じた箱庭だった。
ここからは本物: `spicedb serve` を立て、gRPC API 越しに同じことをする。

```sh
./run.sh
```

[run.sh](./run.sh) が以下を順に実演する (実行したコマンドを青字で表示しながら進む)。

1. `spicedb serve` をメモリ datastore で起動 (port 50061、終了時に落とす)
2. `zed schema write` — [03_hierarchy のスキーマ](../03_hierarchy/schema.zed) をそのまま登録
3. `zed relationship create` — フォルダ階層と viewer を組み立てる
4. `zed permission check` — 誰が何を見られるか
5. `zed permission check --explain` — 権限がどの経路で解決されたかの木
6. `zed permission lookup-resources` — 「alice が view できる document 一覧」
7. `zed permission lookup-subjects` — 「design_doc を view できるのは誰」
8. `zed relationship delete` — 剥奪すると check が false に変わる

script 中の check には `--consistency-full` を付けている。**書き込んだ直後の読み**は、
既定だと少し古いスナップショットで評価されて「まだ見えない」ことがあるため
(これ自体が学びどころなので [08_consistency](../08_consistency/README.md) で主題にする)。

<details><summary>preshared key とは</summary>

`spicedb serve --grpc-preshared-key <key>` の key は、クライアントが
`Authorization: Bearer <key>` として送る共有シークレット。ローカル学習用の
素朴な認証で、本番 (AuthZed Dedicated 等) では mTLS やサービス認証を使う。
key が違うと API は一切応答しない。

</details>

<details><summary>datastore とは</summary>

relationship とスキーマの永続化層。既定は `memory` (プロセスが死ぬと消える)。
本番は PostgreSQL / CockroachDB / Spanner / MySQL。切り替えは
`--datastore-engine` と接続文字列だけで、スキーマもアプリコードも変わらない。

</details>

## check / lookup の使い分け

| API | 問い | 典型の用途 |
| --- | --- | --- |
| `check` | この人はこの資源に対して X できる? | リクエストごとの認可判定 |
| `lookup-resources` | この人が X できる資源はどれ? | 一覧画面の絞り込み |
| `lookup-subjects` | この資源を X できるのは誰? | 共有ダイアログの表示、監査 |
| `check --explain` | その権限はどこから来た? | デバッグ、権限の説明 |

<details><summary>ExpandPermissionTree (zed permission expand) について</summary>

「権限の木」を返す専用 API もあるが、手元の組み合わせ (zed v1.2.0 × SpiceDB v1.54.0)
では `zed permission expand` がクライアント側の不具合で失敗する。
デバッグ目的なら `check --explain` が解決の経路と所要時間まで見せてくれるので、
むしろこちらが主力。

</details>

一覧画面で「全件取得してから 1 件ずつ check」をやると N+1 になる。
**一覧は lookup-resources**、と覚える (応用アプリで実際にそう組む)。

## 自分で叩いてみる

run.sh はサーバを終了時に落とすので、続けて手で試すなら:

```sh
nix develop ../.. --command bash
spicedb serve --grpc-preshared-key mykey --metrics-enabled=false &
zed --endpoint localhost:50051 --token mykey --insecure schema write ../03_hierarchy/schema.zed
zed --endpoint localhost:50051 --token mykey --insecure permission check ...
```

毎回 `--endpoint/--token/--insecure` を打ちたくなければ `zed context set` で保存できる
(グローバル設定 `~/.zed` に書かれる点だけ注意)。
