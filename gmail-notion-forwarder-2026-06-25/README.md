# Gmail to Notion Forwarder

Gmail で受信したメールを Notion に自動転送するシステムです。

## 概要

- **実装**：Google Apps Script (GAS)
- **スケジュール**：時間ベースのトリガー（デフォルト：1時間ごと）
- **連携**：Gmail API + Notion API

## セットアップ

### 前提条件

- Google Workspace / Google Account
- Notion Workspace & API Token
- Node.js 18+
- clasp CLI

### 1. GAS プロジェクトのセットアップ

```bash
cd gas
npm install
cp .clasp.json.example .clasp.json
# .clasp.json を編集してスクリプトID等を設定
clasp push
```

### 2. Notion API キーの設定

Terraform で Google Secret Manager に保存します。

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を編集
terraform init
terraform apply
```

### 3. GAS でのトリガー設定

Google Apps Script エディタで以下を実行：
- メニュー：**実行 → 関数を実行 → forwardEmailsToNotion**
- トリガー：**時間ドリブン → 1時間ごと**

または `appsscript.json` で事前定義

## ファイル構成

```
.
├── gas/                    # Google Apps Script
│   ├── main.gs            # メイン処理
│   ├── appsscript.json    # トリガー定義
│   ├── .clasp.json.example
│   └── README.md
├── terraform/             # IaC (秘密鍵管理)
│   ├── main.tf
│   ├── variables.tf
│   ├── terraform.tfvars.example
│   └── .gitignore
├── .github/workflows/     # CI/CD
│   └── deploy-gas.yml
└── README.md
```

## デプロイ

GitHub Actions で自動デプロイ：
1. 変更を `gas/` にコミット
2. `main` ブランチにプッシュ
3. ワークフローが自動実行

## トラブルシューティング

### メールが転送されない場合
- Gmail ラベルの設定を確認
- GAS の実行ログを確認：**実行 → ログ**
- Notion API キーの有効性を確認

### Notion API エラー
- API キーが正しく Secret Manager に保存されているか確認
- Notion Database ID が正しいか確認

## ライセンス

MIT
