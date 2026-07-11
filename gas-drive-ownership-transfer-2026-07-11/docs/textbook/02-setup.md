# 第 2 章: 開発環境の構築から初回デプロイまで

この章のゴールは、**手元のコードを自分の Apps Script プロジェクトへアップロード(push)し、Apps Script エディタで関数が見える状態**にすることです。所要時間はおよそ 15〜20 分です。

作業はすべてこのプロジェクトのディレクトリ(`gas-drive-ownership-transfer-2026-07-11/`)の中で行います。

```bash
$ cd gas-drive-ownership-transfer-2026-07-11
```

## 2.1 mise をインストールする

最初に、ツールバージョン管理の [mise](https://mise.jdx.dev/getting-started.html) をインストールします(インストール済みならスキップ)。

```bash
$ curl https://mise.run | sh
```

インストール後、シェルへの組み込み(アクティベート)方法が表示されるので、案内に従って `~/.bashrc` や `~/.zshrc` に設定を追加してください。`mise --version` が表示されれば成功です。

<details>
<summary>📘 用語解説: シェル / ~/.bashrc</summary>

**シェル**はターミナルでコマンドを受け付けて実行するプログラムです(bash、zsh など)。`~/.bashrc` はシェルの起動時に読み込まれる設定ファイルで、ここに mise の初期化コマンドを書いておくことで、どのディレクトリでも `mise` が使えるようになります。`~` は自分のホームディレクトリを表します。

</details>

次に、このプロジェクトの `mise.toml` を信頼(trust)して、宣言されたツール(Node.js 22)をインストールします。

```bash
$ mise trust      # このディレクトリの mise.toml を信頼する(初回のみ)
$ mise install    # mise.toml に書かれた Node.js 22 が入る
$ mise exec -- node --version
v22.23.1
```

<details>
<summary>📘 用語解説: mise trust(なぜ「信頼」が必要か)</summary>

`mise.toml` には環境変数の設定や任意のタスク(シェルスクリプト)を書けるため、**悪意あるリポジトリの設定を無条件に実行すると危険**です。そこで mise は、初めて見る設定ファイルを明示的に `mise trust` するまで実行しません。中身を確認してから信頼する、という安全装置です。

</details>

<details>
<summary>📘 用語解説: Node.js / npm</summary>

**Node.js** はブラウザの外で JavaScript を実行するための実行環境です。後述の clasp や TypeScript コンパイラは Node.js 上で動くツールなので、まず Node.js が必要になります。**npm** は Node.js に付属するパッケージマネージャで、公開されているライブラリやツール(パッケージ)をコマンド一つでインストールできます。

</details>

## 2.2 依存パッケージをインストールする

```bash
$ mise run setup
```

これは `npm install` を実行するタスクで、`package.json` に書かれた開発用パッケージ 3 つが `node_modules/` にインストールされます。

| パッケージ | 役割 |
| --- | --- |
| `@google/clasp` | Apps Script へのアップロード等を行う公式 CLI(v3 系) |
| `typescript` | TypeScript コンパイラ(`tsc` コマンド) |
| `@types/google-apps-script` | `DriveApp` など GAS 固有 API の型定義 |

<details>
<summary>📘 用語解説: package.json / devDependencies / node_modules</summary>

- **package.json**: この npm プロジェクトの設定ファイル。依存パッケージの一覧や、`npm run build` のようなスクリプト(コマンドの別名)を定義します
- **devDependencies**: 「開発時にだけ必要」な依存パッケージの区分。本ツールの成果物は GAS 上で動く JavaScript なので、すべての依存が開発用です
- **node_modules/**: インストールされたパッケージの実体が入るディレクトリ。サイズが大きく再生成可能なので、Git にはコミットしません(`.gitignore` 済み)

</details>

<details>
<summary>📘 用語解説: 型定義(@types パッケージ)</summary>

`DriveApp` のような GAS 固有のオブジェクトは、素の TypeScript は知りません。`@types/google-apps-script` を入れると「`DriveApp.getFolderById()` はフォルダを返す」といった情報(型定義)がエディタとコンパイラに伝わり、補完が効き、書き間違いをコンパイル時に検出できるようになります。

</details>

## 2.3 ビルドしてみる

この時点で、コードが正しくコンパイルできることを確認しておきます。

```bash
$ mise run build
```

成功すると `dist/` ディレクトリに次のファイルが生成されます。

```
dist/
├── appsscript.json   # マニフェスト(src/ からコピーされる)
├── config.js         # 以下、src/*.ts をコンパイルした JavaScript
├── main.js
├── state.js
├── transfer.js
└── triggers.js
```

**アップロードされるのは常にこの `dist/` の中身**です。`src/`(TypeScript)を編集 → `mise run build` で `dist/`(JavaScript)を再生成、という流れを覚えてください。

<details>
<summary>📘 用語解説: ビルド / 成果物(dist)</summary>

ソースコードを、実行環境が受け付ける形式に変換・整形する作業一式を**ビルド**と呼びます。変換結果の置き場所には `dist`(distribution = 配布物)という名前がよく使われます。`dist/` は `.gitignore` に登録されており、Git では管理しません(いつでも `src/` から再生成できるため)。

</details>

## 2.4 Apps Script API を有効にする(重要・初回のみ)

clasp が Google のサーバーと通信するには、**自分のアカウントで Apps Script API の利用を許可**しておく必要があります。ブラウザで次の URL を開き、「Google Apps Script API」を **オン** にしてください。

> https://script.google.com/home/usersettings

これを忘れると、後の `clasp push` で `User has not enabled the Apps Script API` というエラーになります(有効化後、反映まで数分かかることがあります)。

## 2.5 clasp でログインする

```bash
$ mise run login    # 実体: npx clasp login
```

ブラウザが開き、Google アカウントの認証画面が表示されます。**譲渡元となる(=ファイルを所有している)アカウント**でログインし、clasp に権限を許可してください。認証情報はホームディレクトリの `~/.clasprc.json` に保存されます。

SSH 先などブラウザを開けない環境では、代わりに次を実行すると URL とコード入力での認証になります。

```bash
$ npx clasp login --no-localhost
```

<details>
<summary>📘 用語解説: OAuth(オーオース)</summary>

パスワードを直接渡さずに「このアプリに、私のアカウントのこの操作だけを許可する」を実現する標準的な認可の仕組みです。`clasp login` で行っているのはまさに OAuth のフローで、許可の範囲は**スコープ**という単位で指定されます。ログイン時の同意画面に「Apps Script プロジェクトの管理」などの項目が並ぶのは、clasp が要求しているスコープの一覧です。

</details>

## 2.6 Apps Script プロジェクトを作る(または紐付ける)

手元のコードのアップロード先となる「Apps Script プロジェクト」を用意します。**A・B どちらか一方**を実施してください。

### 方法 A: 新規プロジェクトを CLI で作る(おすすめ)

```bash
$ mise run build    # 先に dist/ を作っておく
$ npx clasp create-script --title "drive-ownership-transfer" --rootDir dist
```

これで Google 側に空のプロジェクトが作られ、手元には接続情報ファイル `.clasp.json` が生成されます。

> 補足: clasp v3 では `create-script` が正式名で、`create` はその別名(エイリアス)です。`--type` を省略すると standalone(単体スクリプト)になります。

<details>
<summary>📘 用語解説: standalone スクリプト</summary>

Apps Script プロジェクトには、スプレッドシート等に紐付く「コンテナバインド型」と、単体で存在する「**standalone(スタンドアロン)型**」があります。本ツールは特定のシートに依存しないので standalone で作ります。standalone プロジェクトは Google Drive 上にファイルとして表示されます。

</details>

### 方法 B: ブラウザで作成済みのプロジェクトに紐付ける

[script.google.com](https://script.google.com) で「新しいプロジェクト」を作成し、エディタの「プロジェクトの設定」(⚙アイコン)から**スクリプト ID** をコピーします。次に、このディレクトリにある見本ファイルをコピーして ID を書き込みます。

```bash
$ cp .clasp.json.example .clasp.json
$ vim .clasp.json   # scriptId を自分の ID に書き換える
```

```json
{
  "scriptId": "1AbCdEfGh...(自分のスクリプト ID)",
  "rootDir": "dist"
}
```

<details>
<summary>📘 用語解説: スクリプト ID / .clasp.json</summary>

**スクリプト ID** は Apps Script プロジェクトを一意に識別する長い文字列です(エディタの URL `script.google.com/.../projects/【この部分】/edit` にも含まれます)。**`.clasp.json`** は「このディレクトリのコードを、どのプロジェクトの、どのフォルダ(`rootDir`)からアップロードするか」を clasp に伝える設定ファイルです。スクリプト ID は人それぞれ違うため、このファイルは Git にコミットしない運用にしています(`.gitignore` 済み)。代わりに雛形の `.clasp.json.example` をコミットしています。

</details>

## 2.7 push する(初回デプロイ)

```bash
$ mise run push    # ビルド → npx clasp push を連続実行
```

初回はマニフェスト(`appsscript.json`)の上書き確認を聞かれることがあります。

```
? Manifest file has been updated. Do you want to push and overwrite? (y/N)
```

**`y` を入力**してください(手元のマニフェストが正であるため)。成功すると次のように表示されます。

```
└─ dist/appsscript.json
└─ dist/config.js
└─ dist/main.js
└─ dist/state.js
└─ dist/transfer.js
└─ dist/triggers.js
Pushed 6 files.
```

<details>
<summary>📘 用語解説: マニフェスト(appsscript.json)</summary>

プロジェクトの実行環境を宣言する設定ファイルです。タイムゾーン、ランタイムのバージョン(V8)、そして**このスクリプトが要求する OAuth スコープの一覧**などが書かれています。中身の意味は第 4 章で 1 行ずつ解説します。

</details>

## 2.8 動作確認: エディタで関数が見えるか

```bash
$ mise run open    # 実体: npx clasp open-script
```

ブラウザで Apps Script エディタが開きます。左側のファイル一覧に `main.gs` / `transfer.gs` などが並び、上部ツールバーの関数選択メニューに `startTransfer` / `countOwnedFiles` などが表示されていれば、**デプロイ成功**です。

> 💡 手元の `.js` ファイルは、Apps Script 上では拡張子 `.gs` として表示されます(中身は同じです)。

## 2.9 初回実行時の「承認」について

エディタから初めて関数(例: `countOwnedFiles`)を実行すると、**このスクリプト自体への権限の承認**を求められます。流れは次のとおりです。

1. 「承認が必要です」→ アカウントを選択
2. 「このアプリは Google で確認されていません」という警告画面が出る
   - 自分で書いたスクリプトを自分のアカウントで動かすため、未確認なのは正常です
   - 「詳細」→「(プロジェクト名)(安全ではないページ)に移動」をクリック
3. 要求される権限(Drive の管理など)を確認して「許可」

<details>
<summary>📘 用語解説: 「Google で確認されていません」警告</summary>

Google の審査を受けていない OAuth アプリに対して表示される標準の警告です。第三者の不審なアプリならここで引き返すべきですが、今回は「自分が書いて、自分のプロジェクトにデプロイし、自分だけが使う」スクリプトなので、内容を理解した上で進めて問題ありません。要求されるスコープはマニフェストに書いたもの(第 4 章 4.3 参照)と一致しているはずです。

</details>

---

これで開発とデプロイの土台が整いました。次章では、いよいよこのツールの設計の核心 —「6 分制限との戦い方」— を解説します。

⬅️ [第 1 章: このツールは何をするものか](./01-overview.md) / ➡️ [第 3 章: 設計を理解する](./03-architecture.md)
