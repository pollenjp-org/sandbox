# 例 5: Self-hosted Runner (VPC 内ランナー)

GitHub Actions ジョブを **自 VPC 内** で動かすパターン。
基本は例 1 と同じだが、`runs-on:` を `[self-hosted, terraform]` にする。

## 構成

```
GitHub Actions ─▶ self-hosted runner (EKS / EC2 ASG)
                  ├── private subnet
                  ├── IRSA で IAM Role を直付け (OIDC 不要)
                  └── EKS API server / RDS proxy / on-prem に到達可
```

## おすすめ: Actions Runner Controller (ARC) on EKS

```yaml
# RunnerScaleSet (例)
apiVersion: actions.github.com/v1alpha1
kind: AutoscalingRunnerSet
metadata:
  name: terraform-prd
spec:
  githubConfigUrl: https://github.com/ORG/REPO
  githubConfigSecret: gh-app-secret  # GitHub App credential
  template:
    spec:
      serviceAccountName: tf-apply-sa  # IRSA bind
      containers:
        - name: runner
          image: ghcr.io/actions/actions-runner:latest
  minRunners: 0
  maxRunners: 5
```

## このパターンが必要な典型ケース

- **private endpoint しか持たない EKS / GKE** に kubectl / helm provider で apply
- **RDS / Redshift / OpenSearch** に Terraform 経由で SQL 実行
- **AWS Direct Connect / VPN 越し** の on-prem リソース
- 企業 Proxy / IP allowlist の都合で固定 IP が必要

## 注意

- runner ホストはコード実行されるので、isolation を強く保つ (ephemeral runner 推奨)
- 外部 PR からの fork で self-hosted runner が使われると危険 → `if: github.event.pull_request.head.repo.full_name == github.repository` でガード
