# 例 1: GitHub Actions + OIDC (AWS) - 推奨パターン

## 前提

AWS 側に GitHub OIDC IdP を一度だけ作っておく。

```hcl
# AWS 側 (一度だけ)
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "trust_apply" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      # main への push 時のみ apply role を引けるよう絞る
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:ORG/REPO:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "tf_apply" {
  name               = "github-actions-tf-apply"
  assume_role_policy = data.aws_iam_policy_document.trust_apply.json
}
```

## ポイント

- **plan role** と **apply role** を分け、PR からは plan role しか引けないようにする
  (`token.actions.githubusercontent.com:sub` で `pull_request` を許可、apply role は `refs/heads/main` だけに絞る)
- **GitHub Environments** (`prd`) の Required reviewers で apply 前に人間承認
- `concurrency.group` で同一 ref への apply が直列化される
- Plan 結果を PR コメントに貼って差分レビューを GitHub 上で完結
- `-detailed-exitcode` で「変更なし(0) / 変更あり(2) / エラー(1)」を判定
- 本気でやるなら plan で生成した `tfplan` を artifact に保存し、apply ジョブで同じ plan を `terraform apply tfplan` で適用するのが厳密 (本サンプルは可読性のため省略)

## ワークフロー

`./.github/workflows/terraform.yml` を参照。

## State backend 例 (`terraform/backend.prd.hcl`)

```hcl
bucket         = "myorg-tfstate-prd"
key            = "global/network.tfstate"
region         = "ap-northeast-1"
dynamodb_table = "tf-state-lock"
encrypt        = true
```
