# textbook — SpiceDB を一から

SpiceDB を前提知識なしに理解するための教科書。**上から順に読めば分かる**ように
書いてある。各章は [tutorial/](../../../tutorial/README.md) の手を動かす章と対になっていて、
読みながら対応する章を実行すると定着が速い。

| 章 | 内容 | 想定読者 |
| --- | --- | --- |
| [00_introduction.md](./00_introduction.md) | なぜ認可は難しいのか。Zanzibar と SpiceDB の位置づけ | 全員 |
| [01_rebac.md](./01_rebac.md) | ReBAC という考え方。RBAC / ABAC との関係 | 全員 |
| [02_schema_language.md](./02_schema_language.md) | スキーマ言語の全体系。relation と permission の使い分け | 全員 |
| [03_relationships_and_check.md](./03_relationships_and_check.md) | relationship の CRUD と、Check がグラフ探索であること | 全員 |
| [04_zed_workflow.md](./04_zed_workflow.md) | zed CLI と validate ファイル。スキーマをテストする作法 | スキーマを書く人 |
| [05_running_spicedb.md](./05_running_spicedb.md) | serve・datastore・テスト用サーバ・運用の入口 | サーバを立てる人 |
| [06_consistency.md](./06_consistency.md) | New Enemy 問題・ZedToken・consistency の選び方 | アプリを書く人 (必読) |
| [07_app_integration.md](./07_app_integration.md) | アプリへの組み込み方。docshare の解剖 | アプリを書く人 |

**急いでいる場合は 00 → 02 → 04 の 3 章でスキーマを書いてテストできるようになる。**
「なぜそう動くのか」を知りたくなったら 01 と 03 へ戻ってくればよい。
本番投入の前には 06 と 07 を必ず読む (取りこぼすと権限剥奪が漏れる)。

## HTML 版

同じ内容を 1 ファイルにまとめた [html/textbook.html](./html/textbook.html) がある。
GitHub Pages でそのまま読める:
<https://pollenjp-org.github.io/sandbox/spicedb-tutorial-2026-09-07/>

Markdown の完全包含 (本文・表・用語アコーディオンは全部入り) の上に、
**GitHub の Markdown では出せない見せ方**を足してある。

| 章 | 動く図 |
| --- | --- |
| 01 | docshare の世界をグラフで |
| 03 | check のグラフ探索をコマ送り / サブ問題キャッシュが命中する瞬間 / 1 リクエストの一生 (シーケンス図) |
| 06 | New Enemy 問題を対策 ON/OFF で見比べる (シーケンス図) / 高水位トークンの水位が上がる様子 |
| 07 | 二重書き込みで落ちたら何が残るか (シーケンス図) |

決定の経緯 (検討して却下した案を含む) は
[ADR 001](../../adr/001_learning_path_20260907T004350JST/README.md) と
[ADR 002](../../adr/002_docshare_zedtoken_20260907T004357JST/README.md)。
いまの構成の一覧は [../README.md](../README.md)。
