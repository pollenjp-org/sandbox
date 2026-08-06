# 選択フローチャート

```
Q1. Terraform を実行する対象に「プライベートネットワーク経由でしか到達できないリソース」
    (private EKS API, internal RDS, on-prem 経由など) があるか?
   ├── Yes ──▶ Self-hosted Runner (5) を VPC 内に置く
   │           もしくは Atlantis (2) を VPC 内に立てる
   └── No  ──▶ Q2 へ

Q2. 月額数万円〜の SaaS コストは許容できるか? (Sentinel / 集中管理が欲しい)
   ├── Yes ──▶ Terraform Cloud / HCP Terraform (3) または Spacelift / env0
   └── No  ──▶ Q3 へ

Q3. PR コメントベースで plan / apply を回したいか?
    (大量の workspace を扱う / SRE 以外も apply するなど)
   ├── Yes ──▶ Atlantis (2) を自前ホスト
   └── No  ──▶ GitHub Actions + OIDC (1)  ←★ デフォルト選択

Q4. 緊急時の手動 apply 経路は?
   └─▶ どのパターンでも workflow_dispatch (6) を別 workflow として用意しておく
       (本番 environment + 二重承認)
```

## 規模別のおすすめ

| 規模 | パターン |
|---|---|
| 個人 / PoC | GitHub Actions + OIDC (1) |
| スタートアップ初期 | (1) + drift check schedule |
| 複数チーム / 複数 repo | Atlantis (2) または TFC (3) |
| 規制業界 / 監査要件強 | TFC (3) + Sentinel または Spacelift OPA |
| プライベート network 必須 | Self-hosted Runner (5) または Atlantis (2) on-VPC |
