# 付録: 発展的な話題

## A. 検索走査の詳細とツリー走査の取りこぼし

### ツリー走査が「見つけられない」ファイル

ツリー走査(メニュー「開始(ツリー走査)」)は、起点フォルダから**たどり着けるもの**しか処理できません。実は「自分がオーナーなのに、自分のマイドライブのツリーからたどり着けない」ファイルが存在します。

1. **他人のフォルダに置いた自分のファイル**: 共有フォルダ(他人がオーナー)の中に自分が作ったファイル。ファイルのオーナーは自分ですが、置き場所は他人のツリーの中です
2. **オーファン(迷子)ファイル**: 親フォルダから外された(親フォルダごと削除された等)ファイル。どのフォルダにも属していません。Drive の検索窓で `is:unorganized owner:me` と検索すると見つけられます
3. **「共有アイテム」にだけ見えているもの**: 上記 1 の亜種で、自分のマイドライブに追加していない共有ファイルのうち自分がオーナーのもの

検索走査(メニュー「開始(検索走査)」)は Drive 全体への検索クエリ `'me' in owners and trashed = false` を使うため、これらもすべて対象にできます。**「基本はツリー走査 → 仕上げに検索走査」の 2 段構え**が確実です。

### 検索走査の「動く結果セット」問題

検索走査の本番実行では、譲渡が成功するたびにそのファイルが検索条件(`'me' in owners`)に合致しなくなり、**検索結果から抜けていきます**。バッチをまたいで継続トークンで再開すると、結果一覧のページ割りがずれて一部を飛ばしてしまうことがあります。

対策はシンプルで、**なくなるまで繰り返す**ことです。取りこぼしたファイルは依然として自分の所有物なので、再実行すれば必ず検索に引っかかります。完了ログにもその案内が出ます。

```
検索走査では譲渡により検索結果が変化するため、取りこぼしが残ることがあります。
メニューの「所有アイテム数を確認」で残数を確認し、残っていれば「開始(検索走査)」をもう一度実行してください。
```

## B. 個人アカウント(gmail.com)への譲渡: 招待方式

既定の**直接譲渡**(`setOwner()`)は、Google Workspace の**同一ドメイン間**の即時譲渡を前提としています。個人アカウント(gmail.com)宛てや別ドメイン宛てでは `setOwner()` が使えず、「引数が無効です」「アクセスが拒否されました: DriveApp」等のエラーになります。

個人アカウント間は「**招待 → 相手が承諾**」の 2 段階フローが必須です(承諾されるまで所有権は移りません = 保留中の所有者 / pending owner)。本ツールはこれを **「招待方式」** としてサポートしています。

### 使い方

1. **送信側(現在の所有者)**: 「設定」シートの **B5「譲渡方式」で「招待方式」を選択**し、通常どおり「開始(ツリー走査/検索走査)」を実行する。対象ファイルに pendingOwner の招待が付き、台帳に「招待済み」行(譲渡先 = 受信側)が記録される。
2. **受信側(新しい所有者)**: 共有された同じスプレッドシートを開き、メニュー **「所有権の譲渡を承諾する」** を実行する。台帳の「招待済み」かつ譲渡先 = 自分の行が対象になり、まとめて承諾(受領)される。

> ⚠️ **重要な制限(ファイル種別)**: 個人アカウントで所有権を移転できるのは **Google ネイティブ形式(ドキュメント/スプレッドシート/スライド/フォーム等)のファイルのみ**です。**フォルダ**や**アップロードしたファイル(PDF・Office ファイル・画像など)**は移転できず、招待方式では「対象外」として記録・スキップされます。これらを別の個人アカウントへ集約したい場合は、所有権移転ではなく**コピーベースの移行**(受信側でコピー = 受信側が所有者になる)や**共有ドライブへの移動**を検討してください。

### 仕組み(Advanced Drive Service / Drive API v3)

招待・承諾は高度な Drive サービス(`appsscript.json` の `enabledAdvancedServices` で有効化済み)で行っています。

```javascript
// 送信側: 相手を「保留中の所有者」として招待する(role=writer + pendingOwner)
Drive.Permissions.create(
  { role: 'writer', type: 'user', emailAddress: newOwnerEmail, pendingOwner: true },
  fileId
);

// 受信側: 自分の権限を owner に更新して承諾する(role=owner + transferOwnership)
Drive.Permissions.update({ role: 'owner' }, fileId, myPermissionId, { transferOwnership: true });
```

<details>
<summary>📘 用語解説: Advanced Drive Service(高度な Drive サービス)</summary>

GAS の `DriveApp` は使いやすさ優先の高水準 API で、細かいオプションは省かれています。Apps Script エディタの「サービス」から **Drive API** を追加すると、`Drive.Files` / `Drive.Permissions` のような低水準 API(Drive API v3 そのもの)を GAS から直接呼べるようになります。`pendingOwner` のような細かいフラグはこちらでしか指定できません。

</details>

> ⚠️ アカウント種別・ファイル種別による挙動差は Google 側の仕様変更も多い領域です。個人アカウントで使う場合は、必ず少数のテストファイルで挙動を確認してから本番実行してください。

## C. PlantUML で図を再生成する

この教科書の図(`docs/textbook/plantuml/out/*.svg`)は、[`plantuml/`](./plantuml/) ディレクトリの `.puml` テキストファイルから生成しています。

<details>
<summary>📘 用語解説: PlantUML</summary>

テキストで図(シーケンス図・状態遷移図・クラス図など)を記述し、画像へ変換するツールです。図がテキストなので Git で差分管理でき、「図の修正」がコードレビューに乗るのが最大の利点です。Java 製のため実行には Java が必要です。

</details>

### 前提パッケージ

レイアウトエンジンと日本語フォントが必要です(Debian/Ubuntu の場合)。

```bash
$ sudo apt install graphviz fonts-noto-cjk
```

### 生成手順

図のソースはこの教科書の直下 [`docs/textbook/plantuml/`](./plantuml/) にあり、`plantuml/mise.toml` に Java 25 と 3 つのタスクが定義済みです。

```bash
$ cd docs/textbook/plantuml
$ mise trust && mise install   # Java 25 が入る(初回のみ)
$ mise run plantuml:generate svg   # out/*.svg を一括生成
```

| タスク | 内容 |
| --- | --- |
| `plantuml:download` | PlantUML の JAR を `~/.cache/plantuml/` へダウンロード(存在すればスキップ) |
| `plantuml:run` | 任意の引数で PlantUML を直接実行(例: `mise run plantuml:run -- -tpng foo.puml`) |
| `plantuml:generate` | `*.puml` 全部を `out/` へ変換。引数で形式指定(`svg`, `png`, `svg,png`) |

プロジェクトルートには、図をまとめて生成するタスクがあります。

```bash
$ cd ../../..         # プロジェクトルートへ
$ mise run diagrams   # docs/textbook/plantuml/out/ に生成
```

図を修正するときの流れ: `docs/textbook/plantuml/*.puml` を編集 → プロジェクトルートで `mise run diagrams` → 教科書の画像(`docs/textbook/plantuml/out/`)が更新される、です。

> 💡 参考テンプレート: https://github.com/pollenjp/plantuml-template

## D. drawio を使う場合

PlantUML が苦手なフリーレイアウトの図(ネットワーク構成図など)は [draw.io](https://www.drawio.com/) が向いています。AI エージェント(Claude Code 等)と組み合わせる場合は [drawio-mcp](https://github.com/jgraph/drawio-mcp) を使うと、エージェントから直接 drawio ファイルを編集できます。

`.claude/settings.json` に次のように設定します。

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "@drawio/mcp@1.3.2"]
    }
  }
}
```

<details>
<summary>📘 用語解説: MCP(Model Context Protocol)</summary>

AI アシスタントに外部ツールの操作能力を追加するための標準プロトコルです。「MCP サーバー」がツール(ここでは drawio の編集機能)を提供し、AI 側がそれを呼び出します。上の設定は「drawio という MCP サーバーを npx 経由で起動して使う」という宣言です。

</details>

本プロジェクトでは、図がすべて UML 系(構造が定型的)だったため、テキスト管理できる PlantUML に統一しています。自由配置の図が必要になったら [`docs/textbook/drawio/`](./drawio/) に追加してください([`drawio/README.md`](./drawio/README.md) に手引きがあります)。

## E. 発展課題

理解を深めたい人向けの改造テーマです(易 → 難の順)。

1. **除外リスト**: 「設定」シートに除外フォルダ ID の欄を追加し、`runTreeBatch()` でキューに積む前に判定する
2. **完了通知**: `finishTransfer()` から `MailApp.sendEmail()` で自分にサマリをメールする
3. **進捗率の表示**: 開始時に全件数を数えて状態に持ち、メニューの「進捗を確認」でパーセント表示する
4. **Advanced Drive Service 化**: `DriveApp` を Drive API v3 直叩きに置き換え、`fields` 指定・ページサイズ調整で走査を高速化する。`previousOwnerRole` 相当の制御(元オーナーの権限をどうするか)にも挑戦できる

## F. 参考リンク

| 分類 | リンク |
| --- | --- |
| GAS 公式 | [Apps Script ドキュメント](https://developers.google.com/apps-script) |
| クォータ | [Quotas for Google Services](https://developers.google.com/apps-script/guides/services/quotas) |
| DriveApp | [Drive Service リファレンス](https://developers.google.com/apps-script/reference/drive) |
| トリガー | [Installable Triggers](https://developers.google.com/apps-script/guides/triggers/installable) |
| プロパティ | [Properties Service](https://developers.google.com/apps-script/guides/properties) |
| clasp | [google/clasp(GitHub)](https://github.com/google/clasp) |
| Drive の所有権 | [ファイルのオーナー権限を譲渡する(Google ヘルプ)](https://support.google.com/drive/answer/2494892) |
| 検索クエリ構文 | [Search query terms(Drive API)](https://developers.google.com/drive/api/guides/search-files) |
| mise | [mise-en-place](https://mise.jdx.dev/) |
| PlantUML | [plantuml.com](https://plantuml.com/ja/) |

---

⬅️ [第 5 章: 実行手順(運用マニュアル)](./05-operations.md) / 🏠 [目次へ戻る](./README.md)
