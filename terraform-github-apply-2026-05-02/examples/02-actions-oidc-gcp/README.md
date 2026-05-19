# 例 2: GitHub Actions + Workload Identity Federation (GCP)

GCP 側で **Workload Identity Pool / Provider** を作り、GitHub OIDC を信頼させる。
GitHub Secrets に Service Account key を入れる必要が無くなる。

## GCP 側 (一度だけ)

```hcl
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
}

resource "google_iam_workload_identity_pool_provider" "gh_oidc" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "gh-oidc"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # 必ず repo / branch で絞る (これを忘れると他リポジトリからも引ける)
  attribute_condition = "assertion.repository == 'ORG/REPO'"
}

resource "google_service_account" "tf_apply" {
  account_id = "tf-apply"
}

resource "google_service_account_iam_member" "apply_binding" {
  service_account_id = google_service_account.tf_apply.name
  role               = "roles/iam.workloadIdentityUser"
  member = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/ORG/REPO"
}
```

## ポイント

- `attribute_condition` で **必ず repository / branch を絞る** こと
- plan 用 SA と apply 用 SA を分けて、apply 用は `attribute.ref == 'refs/heads/main'` で絞る
- State backend は GCS。GCS は native lock があるので DynamoDB 相当不要
