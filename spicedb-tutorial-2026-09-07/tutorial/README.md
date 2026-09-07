# tutorial — SpiceDB を 1 概念ずつ

各章が **新しい概念を 1 つだけ**持ち込む。上から順にやれば、
[応用アプリ (docshare)](../app/README.md) のスキーマが全部読めるようになる。

01〜06 は **サーバ不要**。`zed validate` がスキーマ + データ + 期待値を
1 セットで検証してくれるので、書いたそばから答え合わせできる。
07〜08 で初めて `spicedb serve` を立て、API としての SpiceDB に触る。

| 章 | 新出概念 | 形式 |
| --- | --- | --- |
| [01_hello_schema](./01_hello_schema/README.md) | `definition` / `relation` / `permission` / relationship | zed validate |
| [02_operators](./02_operators/README.md) | `+` union / `&` intersection / `-` exclusion | zed validate |
| [03_hierarchy](./03_hierarchy/README.md) | `->` arrow (階層の継承) / `validation:` ブロック | zed validate |
| [04_groups](./04_groups/README.md) | subject relation (`group#member`) / グループの入れ子 | zed validate |
| [05_public_wildcard](./05_public_wildcard/README.md) | wildcard (`user:*`) による全員公開 | zed validate |
| [06_caveats](./06_caveats/README.md) | caveat (条件付き relationship) / CONDITIONAL | zed validate |
| [07_zed_server](./07_zed_server/README.md) | `spicedb serve` / zed での CRUD / expand / lookup | script |
| [08_consistency](./08_consistency/README.md) | ZedToken / New Enemy 問題 / consistency 指定 | script |

## 進め方

```sh
# 各章のディレクトリで (nix develop はプロジェクトルートの flake を拾う)
cd tutorial/01_hello_schema
nix develop ../.. --command zed validate validate.yaml
```

devShell に入りっぱなしでもよい。

```sh
nix develop            # プロジェクトルートで
cd tutorial/01_hello_schema && zed validate validate.yaml
```

07 と 08 は script が一連の操作を実演する。

```sh
./tutorial/07_zed_server/run.sh     # PATH に道具が無ければ勝手に devShell へ入り直す
```

全章 + 応用アプリをまとめて検証するなら [`../scripts/check-all.sh`](../scripts/check-all.sh)。

## 読みながら参照するもの

- 概念の体系立った説明 → [docs/architecture/textbook/](../docs/architecture/textbook/README.md)
  (チュートリアルが「手」、textbook が「頭」)
- スキーマ言語の一次情報 → https://authzed.com/docs/spicedb/concepts/schema

## 課題スキーマの育ち方

01 の `document` が章を追うごとに育ち、最後に [応用アプリのスキーマ](../app/schema/schema.zed)
(user / group / folder / document + caveat) になる。「章ごとの差分」を意識して読むとよい。
