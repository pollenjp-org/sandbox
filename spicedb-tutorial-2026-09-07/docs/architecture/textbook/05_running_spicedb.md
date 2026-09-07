# 05 — SpiceDB を動かす

## 最小の起動

```sh
spicedb serve --grpc-preshared-key "somekey"
```

これだけでメモリ datastore の SpiceDB が立つ。開くポートは 3 つ。

| ポート | 何が居るか | 既定 |
| --- | --- | --- |
| gRPC | 一次 API (アプリ・zed はここ) | :50051 |
| HTTP | REST ゲートウェイ (`--http-enabled` のときだけ) | :8443 |
| metrics | Prometheus 形式のメトリクス | :9090 |

<details><summary>preshared key</summary>

クライアントが `Authorization: Bearer <key>` として送る共有シークレット。
key が合わないと API は一切応答しない。ローカルと CI 用の素朴な認証で、
本番 (特にマネージド) はサービス認証や mTLS 側に寄せる。

</details>

<details><summary>HTTP ゲートウェイ</summary>

gRPC が使えない環境 (社内 proxy、ブラウザなど) のための REST 変換。
`POST /v1/permissions/check` のような JSON API が gRPC と同じ意味で使える。
公式クライアントがある言語なら gRPC を選ぶ。

</details>

## datastore — relationship の置き場所

| engine | 用途 |
| --- | --- |
| `memory` (既定) | 学習・ローカル。プロセス終了で消える。**複数レプリカ不可** |
| `postgres` | 本番の第一候補。運用ノウハウが世の中に多い |
| `cockroachdb` / `spanner` | マルチリージョンで書き込みも分散させたい規模 |
| `mysql` | 既存 MySQL 資産に載せたい場合 |

永続 datastore を使うときは、起動前にマイグレーションを流す。

```sh
spicedb datastore migrate head --datastore-engine postgres --datastore-conn-uri "..."
spicedb serve --datastore-engine postgres --datastore-conn-uri "..." --grpc-preshared-key "..."
```

<details><summary>マイグレーション</summary>

SpiceDB 自身のテーブル定義の版上げ。`migrate head` で最新へ。
SpiceDB 本体の更新時は release notes がマイグレーション要否を書いている。

</details>

スキーマや relationship はどの engine でも同じに見える。
**アプリコードを変えずに memory → postgres へ差し替えられる**ので、
学習は memory で何も失わない。

## テスト専用サーバ — serve-testing

```sh
spicedb serve-testing
```

**preshared key ごとに独立した空の datastore** を割り当てる特別なサーバ。
テストごとにランダムな key を使えば、1 プロセスを共有しながら完全に隔離できる。
docshare の統合テスト ([server_test.go](../../../app/internal/httpapi/server_test.go)) が
この形で、テスト 1 本 ≒ 0.5 秒に収まっている。

## 運用の入口 (紹介だけ)

- **メトリクス**: :9090 が Prometheus 形式。ダッシュボードは Grafana などで
- **Kubernetes**: 公式の **SpiceDB Operator** が版上げ・マイグレーションまで面倒を見る
- **マネージド**: AuthZed Dedicated / Cloud。API 互換なのでアプリはそのまま
- 検証系のフラグはこの repo の実例が参考になる:
  [tutorial/07 run.sh](../../../tutorial/07_zed_server/run.sh) (ポート指定・metrics 無効化)、
  [tutorial/08 run.sh](../../../tutorial/08_consistency/run.sh) (量子化間隔の変更)

<details><summary>SpiceDB Operator</summary>

k8s 上で SpiceDB クラスタを宣言的に管理する公式 operator。
`SpiceDBCluster` リソースを書くと、ローリング更新とマイグレーションの順序を
制御してくれる。

</details>

次章はいよいよ、この教材でいちばん事故が多い話。

次章: [06 — 一貫性と New Enemy 問題](./06_consistency.md)
