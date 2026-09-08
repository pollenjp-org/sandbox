# 03 — arrow で階層をたどる

**新出**: `->` (arrow) / `validation:` ブロック

「フォルダを見られる人は、中の文書も見られる」。Google Drive のあの動きを作る。

```zed
definition document {
    relation parent: folder
    relation viewer: user
    permission view = viewer + parent->view
}
```

`parent->view` は「**parent 関係の先にあるオブジェクト**の `view` 権限を評価し、
その結果をここに合流させる」と読む。folder 側の `view` にも `parent->view` が
入っているので、評価は親、その親、と**何段でも**さかのぼる。

<details><summary>arrow の左と右に置けるもの</summary>

- 左: relation (`parent`)。**permission は置けない**
- 右: 先のオブジェクトの permission か relation。ただし **permission を指すのが作法**。
  relation を直接指すと、先の定義を変えたときに壊れやすく、lint (`zed lint` 相当) も警告する

</details>

<details><summary>再帰が止まる理由</summary>

relationship の連鎖 (`projects#parent@root` など) が有限だから。
親をたどり尽くしたら `parent->view` は空集合になり、そこで止まる。
循環 (`a#parent@b`, `b#parent@a`) があっても SpiceDB は検出して発散しない。

</details>

## 試す

```sh
nix develop ../.. --command zed validate validate.yaml
```

## validation ブロック

この章から [validate.yaml](./validate.yaml) に `validation:` が入っている。
assertions が「誰ができるか」の真偽だけを見るのに対し、validation は
**その権限がどの relationship を経由して来たか**まで固定する。

```yaml
validation:
  "document:design_doc#view":
    - "[user:alice] is <folder:root#owner>"   # ← alice の view は root の owner 由来
    - "[user:bob] is <document:design_doc#viewer>"
```

期待と実際が食い違うと、zed validate が**正しい展開結果を提示してくれる**ので、
書くときは一度わざと空にして出力を写すのが速い。

## 練習

`folder:private#parent@folder:root` を消すと、alice は `document:secret` を
見られるか。予想してから validate で確かめる。

<details><summary>答え</summary>

見られなくなる。alice の権限は root の owner であることだけが根拠で、
private が root から切り離されると arrow の経路が途切れる。
`assertTrue` の `document:secret#view@user:alice` が失敗に転じる。

</details>
