# create a service account for this project
resource "google_service_account" "terraform_sa" {
  account_id   = "terraform-runner"
  display_name = "Terraform Execution SA"
}

# grant roles/storage.admin to the service account
resource "google_project_iam_member" "sa_roles" {
  for_each = toset([
    "roles/storage.admin",                   # tfstate 等の bucket 管理
    "roles/run.admin",                      # Cloud Run サービスの作成・更新・削除
    "roles/cloudbuild.builds.editor",        # Cloud Build トリガーの作成・更新
    "roles/artifactregistry.admin",          # Artifact Registry リポジトリの管理

    # https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run#terraform
    "roles/iap.admin",

    # Google Cloud API 有効化に必要
    # https://github.com/terraform-google-modules/terraform-google-project-factory/tree/main/modules/project_services#prerequisites
    "roles/serviceusage.serviceUsageAdmin",

    # project レベルでの IAM 権限を設定に必要 (ex: google_project_iam_member)
    "roles/resourcemanager.projectIamAdmin",

    # SAアカウントの作成等
    "roles/iam.serviceAccountAdmin",

    # impersonate 用 (build trigger 等に SA を指定する際に必要)
    "roles/iam.serviceAccountUser",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform_sa.email}"
}

# grant roles/iam.serviceAccountTokenCreator to developers
resource "google_service_account_iam_member" "allow_impersonation" {
  for_each = toset(var.users)

  service_account_id = google_service_account.terraform_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${each.value}"
}
