# 00 — なぜ認可は難しいのか

## if 文で始まり、if 文で破綻する

文書共有サービスを作るとする。最初の認可はこの程度で済む。

```go
if doc.OwnerID == user.ID { /* OK */ }
```

要求はすぐ増える。

1. フォルダに入れた文書は、フォルダを見られる人も見られるように (**階層**)
2. eng チームの全員に見せたい。メンバーの出入りで文書側は触りたくない (**グループ**)
3. 全社公開の文書 (**公開**)
4. 社外の人に 1 時間だけ共有 (**期限**)
5. この人だけは何があっても見せない (**ブロック**)
6. 「自分が見られる文書の一覧」を出したい (**逆引き**)

これを if 文で追うと、権限ロジックがハンドラ中に散らばり、
「結局この文書を誰が見られるのか」に誰も答えられなくなる。
特に 6 の逆引きは、判定ロジックが命令形コードの中にあると原理的に書けない。

<details><summary>認証と認可</summary>

- **認証 (authentication)**: 相手が誰かを確かめる。ログイン、OIDC、パスキー
- **認可 (authorization)**: その人が何をしてよいか決める。この repo の主題はこちら

この教材では認証を意図的に省き、デモアプリは `X-User` ヘッダを信じる。
なお OAuth 2.0 の文脈にも「認可」という言葉が出てくるが、あれは**別の問題**を
指している。章末のコラムで切り分ける。

</details>

## Zanzibar — Google の答え

Google も同じ問題を抱えていた。Drive・Docs・YouTube・Photos などの認可を
一手に引き受ける社内システムが **Zanzibar** で、2019 年に論文が公開された。
要点は 3 つ。

1. 認可を**専用のサービスに集約**する (各アプリの if 文をやめる)
2. 権限は「**関係**」のグラフとして表す (01 章の ReBAC)
3. 分散環境でもキャッシュが効き、かつ権限剥奪を取りこぼさない仕掛けを持つ
   (06 章の New Enemy 問題と ZedToken)

<details><summary>Zanzibar 論文</summary>

"Zanzibar: Google's Consistent, Global Authorization System" (USENIX ATC 2019)。
毎秒 1,000 万件超のチェックを 95%ile 10ms 以下で返す、という規模の話だが、
概念自体は小さなシステムにもそのまま使える。

</details>

## SpiceDB — その OSS 実装

**SpiceDB** は Zanzibar にインスパイアされた OSS (Apache-2.0) の認可データベース。
AuthZed 社が開発している。この教材が SpiceDB を選んだのは、Zanzibar 系の中で
実装が成熟していて、スキーマ言語とテスト道具 (zed) が学習に向くから。

アプリから見た SpiceDB は「権限の問いに答える gRPC サービス」で、持ち物は 2 つ。

| 持ち物 | 例 | 誰が書くか |
| --- | --- | --- |
| **スキーマ** (型) | 「document には viewer がいて、view = viewer + …」 | 開発者が設計時に |
| **relationship** (データ) | 「document:design の viewer は user:bob」 | アプリが実行時に |

アプリは判定を自前でせず、`Check(資源, 権限, 人)` を SpiceDB に聞く。

<details><summary>ReBAC</summary>

Relationship-Based Access Control。「誰と何がどんな関係にあるか」の
グラフから権限を導く方式。01 章で RBAC / ABAC と比べながら説明する。

</details>

<details><summary>OSS 版とマネージド版</summary>

セルフホストの SpiceDB (この教材はこれ) のほか、AuthZed 社のマネージド
(AuthZed Dedicated / Cloud) がある。API とスキーマは同じなので、
学んだことはそのまま持ち運べる。

</details>

<details><summary>gRPC</summary>

HTTP/2 上の RPC フレームワーク。SpiceDB の一次 API は gRPC で、
各言語の公式クライアント (authzed-go など) から叩く。
gRPC が使えない環境向けに HTTP (REST) ゲートウェイも同梱されている (05 章)。

</details>

## この repo の歩き方

| 場所 | 役割 |
| --- | --- |
| [tutorial/](../../../tutorial/README.md) | **手**。1 章 1 概念、書いたそばから `zed validate` で答え合わせ |
| この textbook | **頭**。概念を順番に、体系立てて |
| [app/](../../../app/README.md) | **応用**。Go 製の文書共有 API に SpiceDB を組み込む |

冒頭の要求 1〜6 は、この教材を終えると全部スキーマ数行ずつで表せるようになる
(1=arrow、2=group、3=wildcard、4=caveat、5=exclusion、6=LookupResources)。

## コラム — OAuth 2.0 の「認可」とこの本の「認可」

どちらも日本語では「認可」(英語でも authorization) だが、**解いている問題が違う**。
OAuth 2.0 を知っていると SpiceDB の話が二重写しに見えるので、先に切り分けておく。

- **OAuth 2.0 の認可 (委譲)** — 「ユーザーが、自分の代わりに動くアプリ (クライアント)
  に、自分のリソースへの**限定されたアクセスを貸し出す**」ための取り決め。
  「このアプリに Google カレンダーの読み取りを許可しますか?」の同意画面がそれで、
  成果物は**アクセストークン**
- **この本の認可 (アクセス制御)** — 「**この人**は**この資源**に**この操作**を
  してよいか」をサービスがリクエストのたびに判定する話。判定材料は所有・共有・
  所属といった**関係**。SpiceDB / Zanzibar はこちら

| 観点 | OAuth 2.0 (委譲) | アクセス制御 (この本) |
| --- | --- | --- |
| 問い | ユーザーは**このアプリに**何を貸すか | **このユーザーは**この資源に何ができるか |
| 許可を出すのは | リソースオーナー (ユーザー本人) の同意 | サービス (スキーマ + relationship) |
| 決まるタイミング | トークン発行時に前払い | リクエストごとに都度評価 |
| 粒度 | scope (`calendar.readonly` など API の範囲) | 資源 × 操作 × 主体 (document:design を bob が view) |
| 取り消し | トークンの期限切れ / revoke | relationship の削除 (直後から確実に。06 章) |

**実際のシステムでは両方を重ねて使う。** 典型的な 1 リクエストはこう流れる。

1. クライアントがアクセストークン付きでリクエストを送る
2. サービスはトークンを検証し、「誰の代理か (認証)」と「アプリに貸された範囲
   (scope)」を確認する — OAuth / OIDC の領分
3. その上で「では**その人は** document:design を view できるのか」を SpiceDB に
   聞く — この本の領分

scope を通過しても、資源単位の可否はまだ何も決まっていない。scope は「アプリに
貸した API の範囲」であって「ユーザー自身の権限」ではないから。
[docshare](../../../app/README.md) の `X-User` ヘッダは、この 1〜2 が済んだ後の
状態を素朴に代用したもの。

<details><summary>scope に資源を詰めたくなったら</summary>

`document:123:read` のような資源単位の scope を切りたくなったら、それは
アクセス制御を OAuth 側でやろうとしているサイン。トークン発行時に権限が
固定されるので剥奪が効かず (トークンが生きている限り読める)、資源 × 操作の
組み合わせで scope が爆発する。scope は API の粗い範囲に留め、資源単位の
可否はアクセス制御側 (SpiceDB) で都度判定するのが定石。

</details>

<details><summary>OIDC との三角関係</summary>

OpenID Connect (OIDC) は OAuth 2.0 の上に乗った**認証**の仕様で、
「誰がログインしたか」(ID トークン) を扱う。整理すると、
OIDC = 認証 (誰か) / OAuth 2.0 = 委譲 (アプリに何を貸すか) /
SpiceDB = アクセス制御 (その人がこの資源に何をできるか)。
3 つは競合ではなく、1 つのリクエストの中で順に登場する。

</details>

次章: [01 — ReBAC という考え方](./01_rebac.md)
