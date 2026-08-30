# Google Apps Script Setup

## セットアップ手順

### 1. Google Apps Script プロジェクトの作成

1. [Google Apps Script](https://script.google.com) にアクセス
2. 新しいプロジェクトを作成
3. プロジェクト設定を開いて **Script ID** をコピー

### 2. clasp ログイン

```bash
npm install -g @google/clasp
clasp login
```

### 3. .clasp.json の設定

```bash
cp .clasp.json.example .clasp.json
```

`.clasp.json` を編集：
```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "projectIdSettings": {
    "projectId": "YOUR_GCP_PROJECT_ID_HERE"
  }
}
```

### 4. スクリプトをデプロイ

```bash
clasp push
```

### 5. 環境変数の設定（GAS UI）

Google Apps Script エディタで：

1. **プロジェクト設定 → スクリプト プロパティ** を開く
2. 以下を追加：

| キー | 値 |
|------|-----|
| `NOTION_API_KEY` | Notion API キー |
| `NOTION_DATABASE_ID` | Notion Database ID |

### 6. トリガーの設定

Google Apps Script エディタで：

1. **実行 → トリガー（時計アイコン）** をクリック
2. **トリガーを追加** をクリック
3. 設定：
   - 実行する関数：`forwardEmailsToNotion`
   - 実行するデプロイ：`Head`
   - イベントソース：`時間ベース`
   - 時間トリガーのタイプ：`1 時間ごと`

### 7. テスト

Google Apps Script エディタで：

1. **関数を選択 → testForwardEmail**
2. **実行（▶️ ボタン）** をクリック
3. **実行ログ** で結果を確認

## Notion API キーの取得

1. [Notion Integration Console](https://www.notion.so/my-integrations) にアクセス
2. **新しいインテグレーション** を作成
3. 内部統合トークンをコピー
4. GAS スクリプト プロパティに設定

## Notion Database ID の取得

1. Notion でデータベースを開く
2. URL を確認：`https://www.notion.so/{DATABASE_ID}?v=...`
3. `{DATABASE_ID}` をコピー（32文字）

## Properties（データベース構造）

Notion Database に以下のプロパティを作成：

| 名前 | タイプ | 説明 |
|------|--------|------|
| `Subject` | Title | メールの件名（必須） |
| `From` | Email | 送信元アドレス |
| `Received Date` | Date | 受信日時 |
| `Gmail Thread ID` | Text | Gmail スレッドID（検証用） |

## トラブルシューティング

### エラー: "Cannot read property 'getProperty' of null"
- スクリプト プロパティが設定されていないか確認
- GAS UI で再度プロパティを追加

### エラー: "401 Unauthorized"
- Notion API キーが正しいか確認
- トークンの有効期限を確認

### メールが転送されない
- Gmail ラベル「ToNotion」が正しく作成されているか確認
- GAS **実行ログ** でエラーメッセージを確認
- `testForwardEmail` で手動テストを実行
