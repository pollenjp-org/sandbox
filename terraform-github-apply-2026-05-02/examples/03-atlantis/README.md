# 例 3: Atlantis (PR コメント駆動)

PR で `atlantis plan` / `atlantis apply` とコメントするとサーバが受け取り apply する。

## 構成

```
GitHub ──webhook──▶ Atlantis Server (ECS / EKS / EC2)
                          │
                          ├─ plan / apply 実行 (IRSA で AWS API)
                          ├─ tfstate (S3 + DynamoDB)
                          └─ 結果を PR にコメント
```

## デプロイ例 (ECS Fargate)

- ALB (HTTPS, 443) ─▶ Atlantis Container (4141)
- GitHub App (webhook URL = `https://atlantis.example.com/events`)
- Task Role に AssumeRole 権限を付与し、各 environment role を引き分ける
- `ATLANTIS_REPO_ALLOWLIST=github.com/myorg/*`
- `ATLANTIS_GH_APP_ID` / `ATLANTIS_GH_APP_KEY_FILE` を Secrets Manager 経由で注入

## 主要 ENV

| 変数 | 値 |
|---|---|
| `ATLANTIS_REPO_ALLOWLIST` | 許可 repo パターン |
| `ATLANTIS_GH_APP_ID` | GitHub App ID |
| `ATLANTIS_GH_WEBHOOK_SECRET` | webhook 署名検証用 |
| `ATLANTIS_REPO_CONFIG` | サーバ側 atlantis.yaml |
| `ATLANTIS_WRITE_GIT_CREDS` | true (Atlantis が一時的に git creds を書く) |

## サーバ側 repo config (`server-atlantis.yaml`)

```yaml
repos:
  - id: /.*/
    apply_requirements: [approved, mergeable]
    allowed_overrides: [workflow, apply_requirements]
    allow_custom_workflows: true
```

## このパターンが向くケース

- 複数 repo / 複数 workspace を中央集約したい
- PR コメント上で plan diff を読みたい (Atlantis のフォーマットが見やすい)
- private network 内クラスタに Terraform したい (Atlantis を VPC 内に置ける)
