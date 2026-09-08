# 02 — スキーマ言語の全体系

スキーマは世界の**型**を決める。ここでは部品を体系として一望する。
1 つずつ手を動かすなら [tutorial/](../../../tutorial/README.md) 01〜06 が対応する。

```zed
definition user {}

definition document {
    relation viewer: user            // 関係の宣言 (材料)
    permission view = viewer         // 権限の定義 (材料の合成)
}
```

## 3 つの宣言

| 宣言 | 役割 | 覚え方 |
| --- | --- | --- |
| `definition` | オブジェクトの型 | DB のテーブル定義に相当 |
| `relation` | 持ちうる関係と、その相手の型 | **名詞**で命名 (viewer, owner, parent) |
| `permission` | 関係から導く「できること」 | **動詞**で命名 (view, edit, share) |

relation は「データを入れる箱」、permission は「箱をつなぐ計算式」。
実際に誰が viewer なのかは relationship (03 章) が持つ。

<details><summary>名詞 / 動詞の命名規約</summary>

authzed 公式の推奨。relation は状態 (〜である)、permission は行為 (〜できる)。
この規約に沿うだけで `check document:x view user:y` が英文として読めるようになり、
relation と permission の取り違えも起きにくい。

</details>

## 部品の一覧

| 部品 | 書き方 | 意味 | 手を動かす |
| --- | --- | --- | --- |
| union | `a + b` | どちらかに入っていれば | [tutorial/02](../../../tutorial/02_operators/README.md) |
| intersection | `a & b` | 両方に入っている人だけ | 〃 |
| exclusion | `a - b` | b の人を除く | 〃 |
| arrow | `parent->view` | 関係の先のオブジェクトで view を評価 | [tutorial/03](../../../tutorial/03_hierarchy/README.md) |
| subject relation | `group#member` | グループの member **集合**を関係の相手に | [tutorial/04](../../../tutorial/04_groups/README.md) |
| wildcard | `user:*` | 「user 型の全員」という relationship を許す | [tutorial/05](../../../tutorial/05_public_wildcard/README.md) |
| caveat | `user with not_expired` | 条件式 (CEL) 付きの関係 | [tutorial/06](../../../tutorial/06_caveats/README.md) |

<details><summary>arrow の Zanzibar 用語</summary>

Zanzibar 論文では tuple-to-userset (TTU) と呼ばれる操作。
「タプル (parent 関係) をたどった先の userset (view を持つ集合)」の意。
SpiceDB の `->` はこれの読みやすい記法。

</details>

<details><summary>CEL</summary>

Common Expression Language。Google 製の副作用なし式言語で、
Kubernetes のポリシー記述などでも使われる。caveat の中身はこれ。

</details>

## 設計の指針

### API からは permission だけを見る

アプリの check は必ず permission に対して行い、relation を直接 check しない。
relation は実装詳細で、permission はインターフェース。この分離を守ると、
「reader にも編集させたい」のような変更がスキーマ 1 行で済み、アプリは動かない。
同じ理由で **arrow の右側も permission を指す** のが作法 (tutorial/03)。

### 権限は資源側の語彙で切る

`can_call_this_endpoint` ではなく `view` / `edit` / `share` のように、
資源にとって意味のある単位で permission を切る。エンドポイントが増えても
permission の再利用で済むことが多い。

### 迷ったら「誰の集合か」を書き下す

permission の右辺は常に「ユーザーの集合を作る式」。日本語で
「**見られる**のは: viewer と、編集できる人と、親フォルダを見られる人。
ただし banned は除く」と言い切れれば、そのまま式になる。
式だけ見ても掴めないので、材料 (relation) と参照先まで全部そろえた形で見る。

```zed
definition user {}

definition folder {
    relation viewer: user
    permission view = viewer  // 実物はさらに階層をたどる (下の「全部入りの実例」)
}

definition document {
    // 材料 (relation): 誰がこの文書とどう関わっているか
    relation parent: folder
    relation owner: user
    relation editor: user
    relation viewer: user
    relation banned: user

    // 「編集できるのは: owner か editor」
    permission edit = owner + editor

    // 「見られるのは: viewer と、編集できる人と、親フォルダを見られる人。
    //  ただし banned は除く」 ← この日本語がそのまま次の 1 行になる
    permission view = (viewer + edit + parent->view) - banned
}
```

| 日本語 | 式の部品 | 正体 |
| --- | --- | --- |
| viewer | `viewer` | この文書に直接付けた閲覧者。すぐ上で宣言した relation |
| 編集できる人 | `edit` | **同じ definition の permission の再利用**。owner + editor を二度書きしない |
| 親フォルダを見られる人 | `parent->view` | `parent` 関係の先 (folder) で `view` を評価する arrow |
| ただし banned は除く | `- banned` | ここまでの union 全体から banned の集合を引く |

見どころは 2 つ。

- 式の材料には relation だけでなく **permission も置ける** (`edit` の再利用)。
  「編集できる人は当然見られる」を一度だけ書いておけば、後で edit の定義が
  変わっても (editor をやめてグループ制にしても) view は勝手に追従する
- `- banned` は括弧の**外に一度だけ**。直接の viewer でも、編集者でも、
  フォルダ経由でも、どの経路から届いた人も banned なら等しく除かれる。
  経路ごとに引き算を書いて回る必要はない

## 全部入りの実例

応用アプリのスキーマ [app/schema/schema.zed](../../../app/schema/schema.zed) が
上の部品の全部入りで、コメントも添えてある。各部品がなぜその場所にあるかは
[07 章](./07_app_integration.md) で解剖する。

<details><summary>スキーマの型検査</summary>

`relation viewer: user | group#member` の型注釈は書き込み時に検査される。
型に無い relationship (例: document を viewer に入れる) は書けない。
「関係の相手が何者か」をスキーマが保証するので、データの荒れ方が一段減る。

</details>

次章: [03 — relationship と Check の実体](./03_relationships_and_check.md)
