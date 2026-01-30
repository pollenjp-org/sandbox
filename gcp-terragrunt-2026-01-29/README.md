# project root

<!-- TOC -->

- [Preparation](#preparation)
  - [ローカルの gcloud 設定](#%E3%83%AD%E3%83%BC%E3%82%AB%E3%83%AB%E3%81%AE-gcloud-%E8%A8%AD%E5%AE%9A)
  - [root.hcl にプロジェクト ID を設定する](#roothcl-%E3%81%AB%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88-id-%E3%82%92%E8%A8%AD%E5%AE%9A%E3%81%99%E3%82%8B)
  - [tfstate の backend を一時的にローカルに変更](#tfstate-%E3%81%AE-backend-%E3%82%92%E4%B8%80%E6%99%82%E7%9A%84%E3%81%AB%E3%83%AD%E3%83%BC%E3%82%AB%E3%83%AB%E3%81%AB%E5%A4%89%E6%9B%B4)
  - [一時的に権限借用を外す](#%E4%B8%80%E6%99%82%E7%9A%84%E3%81%AB%E6%A8%A9%E9%99%90%E5%80%9F%E7%94%A8%E3%82%92%E5%A4%96%E3%81%99)
  - [Terraform 実行者用 SA の作成＆設定](#terraform-%E5%AE%9F%E8%A1%8C%E8%80%85%E7%94%A8-sa-%E3%81%AE%E4%BD%9C%E6%88%90%EF%BC%86%E8%A8%AD%E5%AE%9A)
  - [権限借用用のアカウントを設定](#%E6%A8%A9%E9%99%90%E5%80%9F%E7%94%A8%E7%94%A8%E3%81%AE%E3%82%A2%E3%82%AB%E3%82%A6%E3%83%B3%E3%83%88%E3%82%92%E8%A8%AD%E5%AE%9A)
  - [tfstate Bucket 作成](#tfstate-bucket-%E4%BD%9C%E6%88%90)
  - [tfstate を保存する bucket を設定](#tfstate-%E3%82%92%E4%BF%9D%E5%AD%98%E3%81%99%E3%82%8B-bucket-%E3%82%92%E8%A8%AD%E5%AE%9A)
  - [自身の tfstate を bucket 管理に切り替え](#%E8%87%AA%E8%BA%AB%E3%81%AE-tfstate-%E3%82%92-bucket-%E7%AE%A1%E7%90%86%E3%81%AB%E5%88%87%E3%82%8A%E6%9B%BF%E3%81%88)
    - [prepare/<env>/tfstate_bucket/](#prepareenvtfstate_bucket)
    - [prepare/<env>/terraform_sa/](#prepareenvterraform_sa)

<!-- /TOC -->

```txt
.
├── live/    ... 各環境の terraform
├── modules/
└── prepare/ ... terraform 用の準備
```

## Preparation

- 本セクションは新しい GCP プロジェクトに展開するときに一度だけ必要なことを記述する。
- `dev` に設定したプロジェクトを別のプロジェクトに変更するケースを考える。新たな環境を追加するケースも同様である。
  - 以降では展開しようとしている環境のことを `<env>` と表現する。

### ローカルの gcloud 設定

初めてであればログイン認証やプロジェクト設定を行う。

```bash
gcloud init --no-launch-browser
```

Terraform で認証情報を使えるように以下のコマンドを実行する。

```bash
gcloud auth application-default login
```

### `root.hcl` にプロジェクト ID を設定する

- GCP のプロジェクトを新規に立てる (管理者に依頼する等)
- project id を控える

`root.hcl` を開き値を書き換える。
`gcp_project_id` に環境と project id を設定する。

```hcl
gcp_project_id = {
  <env> = "<project-id>"  # <- ここに追加・変更
  # ...
}[local.env]
```

### tfstate の backend を一時的にローカルに変更

以下の初期設定を行うまでは、tfstate の backend を一時的にローカルに変更する。

- Terraform 実行者用 SA の作成
- tfstate 用の bucket 作成

`generate.terraform.content` 内の `terraform.backend.gcs` を全てコメントアウトする

```hcl
generate "terraform" {
  ...
  contents = <<EOF
terraform {
  required_version = "~> 1.0"
  ...
  # backend "gcs" {            # <- このオブジェクトをコメントアウト
  #   ...
  # }
}
EOF
}
```

### 一時的に権限借用を外す

`root.hcl`

```hcl
locals (
  ...
  terraform_runner_sa_email = {
    <env>  = null                 # <- 一時的に null に設定
  }[local.env]
  ...
)
```

### Terraform 実行者用 SA の作成＆設定

Terraform 実行用の SA を作成し、自身がその SA を impersonate (権限借用) できるように設定する。

`prepare/<env>/terraform_sa/terragrunt.hcl` を編集し `inputs.users` 配列に開発者のアカウントを列挙する。

```hcl
# `prepare/<env>/terraform_sa/terragrunt.hcl`

inputs = {
  ...
  users = ["<your-google-email-address>", ...]
}

```

実行

```bash
cd prepare/<env>/terraform_sa/
terragrunt run -- apply
```

出力に出てくる `sa_account_email` をコピー

```txt
17:02:40.407 STDOUT terraform: Apply complete! Resources: 9 added, 0 changed, 0 destroyed.
17:02:40.407 STDOUT terraform:
17:02:40.407 STDOUT terraform: Outputs:
17:02:40.407 STDOUT terraform: sa_account_email = "terraform-runner@<project-id>.iam.gserviceaccount.com"
```

### 権限借用用のアカウントを設定

`root.hcl` で先程 `null` に設定した箇所に値を代入

```hcl
locals (
  ...
  terraform_runner_sa_email = {
    <env>  = <sa-account-email>   # <- コピーした値を設定
  }[local.env]
  ...
)
```

### `tfstate` Bucket 作成

```bash
cd prepare/<env>/tfstate_bucket
terragrunt run -- apply
```

出力の bucket_name の値をコピー

```txt
18:19:02.556 STDOUT terraform: Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
18:19:02.556 STDOUT terraform:
18:19:02.556 STDOUT terraform: Outputs:
18:19:02.556 STDOUT terraform: bucket_name = "dev-tfstate-civil-array-485708-k5"
```

### tfstate を保存する bucket を設定

`root.hcl` の `local.tfstate_bucket_name` に設定

```hcl
locals (
  ...
  tfstate_bucket_name = {
    <env>  = "<bucket_name>"
  }[local.env]
  ...
)
```

コメントアウトしていた backend 設定をアンコメントする。

```hcl
generate "terraform" {
  ...
  contents = <<EOF
terraform {
  required_version = "~> 1.0"
  ...
  backend "gcs" {            # <- このオブジェクトをアンコメント
    ...
  }
}
EOF
}
```

### 自身の `tfstate` を bucket 管理に切り替え

#### `prepare/<env>/tfstate_bucket/`

```bash
cd prepare/<env>/tfstate_bucket/
terragrunt run -- init -migrate-state
```

#### `prepare/<env>/terraform_sa/`

```bash
cd prepare/<env>/terraform_sa/
terragrunt run -- init -migrate-state
```

NOTE: `terraform_sa/` は Terraform を実行する SA の権限を管理するため、これを plan/apply する際には impersonate を解かないといけない。 (`terraform_runner_sa_email` を `null` にする)
