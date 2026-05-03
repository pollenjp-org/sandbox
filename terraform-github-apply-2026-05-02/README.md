# Terraform を GitHub から apply するためのアイディア集

GitHub から `terraform apply` を実行するための代表的なパターンと、それぞれのトレードオフを整理する。
最終的にどれを選ぶかは「**誰が／どのタイミングで／どのクラウドに対して**」適用するかで決まる。

---

## TL;DR (推奨パターン)

> **GitHub Actions + OIDC + GitHub Environments + PR-driven workflow**
>
> - Pull Request で `terraform plan` を自動実行し、結果を PR コメントへ
> - `main` にマージされたら `terraform apply` を実行 (本番は Environment の Required reviewer で承認ゲート)
> - クラウド資格情報は OIDC で短期トークン化 (GitHub Secrets に長寿命キーを置かない)
> - State は S3 / GCS / Azure Blob などのリモートバックエンド + ロック機構

このパターンは `examples/01-actions-oidc-aws/` および `examples/02-actions-oidc-gcp/` にサンプルあり。

---

## パターン比較

| # | パターン | 実行場所 | 認証 | 承認 UI | コスト | 向いている規模 |
|---|---|---|---|---|---|---|
| 1 | GitHub Actions + OIDC | GH ホストランナー | OIDC → IAM Role | Environments / PR review | 無料枠あり | 小〜中 |
| 2 | Atlantis (self-hosted) | 自前 EC2/ECS/K8s | IAM Role / SA | PR コメント `atlantis apply` | 自前ホスト代 | 中〜大 |
| 3 | Terraform Cloud / HCP Terraform | TFC 上 | TFC Workspace 設定 | TFC UI で承認 | 有料 (無料枠あり) | 中〜大 |
| 4 | Spacelift / env0 / Scalr | SaaS | SaaS 統合 | SaaS UI | 有料 | 中〜大 |
| 5 | Self-hosted Runner | 自 VPC 内ランナー | インスタンスロール | Environments | ランナー代 | プライベート network 必須時 |
| 6 | workflow_dispatch (手動) | GH ホストランナー | OIDC | UI で `Run workflow` | 無料 | PoC / 緊急時 |

---

## 1. GitHub Actions + OIDC (推奨)

### 仕組み

```
PR open ──▶ terraform plan ──▶ PR にコメント
                │
merge to main ──▶ terraform apply (Environment 承認)
                │
                ▼
          OIDC token ──▶ AWS STS AssumeRoleWithWebIdentity
                       └▶ GCP Workload Identity Federation
                       └▶ Azure Federated Credential
```

### メリット

- 長寿命のクラウド資格情報を GitHub Secrets に保存しない
- `permissions: id-token: write` だけで OIDC が使える
- PR ベースの GitOps が自然に組める
- GitHub Environments で本番のみ手動承認・必須レビュアーを設定できる

### デメリット

- GH ホストランナーはパブリック egress なので、プライベートネットワーク内のリソースに直接到達できない場合は `5. Self-hosted Runner` を併用
- 並列実行で state ロックがぶつかるので必ずリモートバックエンド + ロックを使うこと
- GitHub Actions の concurrency 制御も併用するのが安全

### キーポイント

```yaml
# 同じ environment への apply は直列化
concurrency:
  group: tf-apply-${{ github.ref }}
  cancel-in-progress: false

permissions:
  id-token: write   # OIDC
  contents: read
  pull-requests: write   # plan 結果を PR にコメント
```

---

## 2. Atlantis (self-hosted)

PR で `atlantis plan` / `atlantis apply` のコメントをトリガにして apply するワーカ。

### メリット

- PR コメントで承認・適用のフローが完結 (plan 出力もコメントで確認しやすい)
- 大量の workspace / 複数の repo を集中管理できる
- 自前ホストなので、プライベートネットワーク内クラスタの apply も可能

### デメリット

- Atlantis サーバ自身の運用コスト (EKS / ECS / Fargate 上で動かすことが多い)
- Webhook を受けるエンドポイントを公開するか、GitHub App で pull 型にする必要がある
- 承認ポリシー (apply 権限のあるユーザ) の設計が必要

詳細サンプル: `examples/03-atlantis/`

---

## 3. Terraform Cloud / HCP Terraform (VCS-driven)

TFC の Workspace を GitHub repo にひも付けると、push / PR で plan が走り、TFC UI から apply する。

### メリット

- State 管理・ロック・履歴・Sentinel ポリシーが統合
- apply の承認 UI が TFC 側にある
- Run task 経由で TFLint / Checkov / Trivy を組み込める

### デメリット

- 月額費用 (人数 / Workspace 数で課金)
- TFC が SPOF
- カスタムが必要なときは GH Actions + tfc CLI のハイブリッドが必要

詳細サンプル: `examples/04-tfc-vcs/`

---

## 4. Self-hosted Runner

GitHub Actions のジョブを **自分の VPC 内ランナー** で動かすパターン。
基本ワークフローは 1. と同じだが、ランナーがプライベート subnet にいるので **EKS API server や RDS proxy などプライベートエンドポイントに直接届く**。

### 構成例

- `actions/actions-runner-controller` を EKS にデプロイ
- ランナー Pod に IRSA (IAM Roles for Service Accounts) を付与 → OIDC 不要にできる
- `runs-on: [self-hosted, terraform]` でジョブを誘導

詳細サンプル: `examples/05-self-hosted-runner/`

---

## 5. workflow_dispatch (手動トリガ)

`on: workflow_dispatch` + `inputs:` で

- `environment` (dev / stg / prd)
- `action` (plan / apply / destroy)
- `target` (`-target=...` 用、緊急時のみ)

を選んで Actions UI から `Run workflow` する。
**緊急対応・PoC・初期構築** には便利。常用するなら 1. の PR-driven に寄せる。

---

## 設計上の必須チェックリスト

| 項目 | 推奨 |
|---|---|
| State backend | S3 + DynamoDB / GCS + native lock / azurerm |
| 認証 | OIDC + IAM Role (AssumeRoleWithWebIdentity) |
| 並列制御 | `concurrency.group` + state lock |
| 承認 | GitHub Environments の Required reviewers |
| 監査 | apply 結果を Slack / Issue / S3 に記録 |
| Drift 検知 | 日次 `schedule:` で plan を実行し差分を Issue 起票 |
| Secrets | `tfvars` を repo にコミットしない、`TF_VAR_*` か SOPS / SSM Parameter Store |
| 静的解析 | `tflint`, `tfsec` / `trivy config`, `checkov` を plan 前に流す |
| Plan の保存 | `terraform plan -out=tfplan` を artifact に upload し、apply で同じ plan を使う |
| 破壊操作 | destroy は別 workflow + 別 environment + 二重承認 |

---

## ディレクトリ構成

```
terraform-github-apply-2026-05-02/
├── README.md                       ← この提案書
├── docs/
│   └── decision-matrix.md          ← パターン選択フローチャート
└── examples/
    ├── 01-actions-oidc-aws/        ← 推奨: AWS + OIDC + PR driven
    ├── 02-actions-oidc-gcp/        ← 推奨: GCP + WIF + PR driven
    ├── 03-atlantis/                ← Atlantis サーバ最小構成
    ├── 04-tfc-vcs/                 ← Terraform Cloud VCS 連携
    └── 05-self-hosted-runner/      ← VPC 内ランナー
```
