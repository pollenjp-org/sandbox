# global

<!-- TOC -->

- [Init Project](#init-project)
  - [global/terraform_sa/](#globalterraform_sa)
  - [global/bucket/](#globalbucket)
  - [backend をアンコメントする](#backend-%E3%82%92%E3%82%A2%E3%83%B3%E3%82%B3%E3%83%A1%E3%83%B3%E3%83%88%E3%81%99%E3%82%8B)
- [Service Account Impersonation](#service-account-impersonation)

<!-- /TOC -->

## Init Project

このセクションの内容はプロジェクト全体で一度だけ実行していれば良い。

- `global/terraform_sa/` ... terraform で利用するサービスアカウントの作成
- `global/bucket/` ... terraform state を保存するバケットの作成

### `global/terraform_sa/`

- `terraform.tf` の `backend` をコメントアウトする
- このディレクトリに移動して実行

```sh
terraform init
terraform apply
```

### `global/bucket/`

- `terraform.tf` の `backend` をコメントアウトする
- `global/sa/` の output に出てきた `sa_email` の値をコピーする
- `global/bucket/provider.tf` を開き、 `provider.google.impersonate_service_account` に値を渡す
- このディレクトリに移動して実行

  ```sh
  terraform ini
  terraform apply
  ```

- 出力 `bucket_name` に表示されているバケット名を控える。

### backend をアンコメントする

- 各 `terraform.tf` にて先程コメントアウトした backend をアンコメントする
- `<root>/backend.hcl` を編集して先ほど控えたバケット名を記載する。

  ```hcl
  bucket = "<your-tfstate-bucket-name>"
  ```

- それぞれのディレクトリに移動し、それぞれ以下のコマンドを実行する

  ```sh
  mise run tf-init
  ```

  ※ mise の task 定義で `-backend-config` を定義している

## Service Account Impersonation

権限借用できる開発者のアカウントを増やしたい場合は `global/terraform_sa/main.tf` の `google_service_account_iam_member.allow_impersonation` の `for_each` を編集して、 アカウントメールアドレスを追加する。
