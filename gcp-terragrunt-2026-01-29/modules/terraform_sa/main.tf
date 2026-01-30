# create a service account for this project
resource "google_service_account" "terraform_sa" {
  account_id   = "terraform-runner"
  display_name = "Terraform Execution SA"
}

# grant roles/storage.admin to the service account
resource "google_project_iam_member" "sa_roles" {
  for_each = toset([
    "roles/storage.admin",                   # tfstate 等の bucket 管理
    "roles/run.admin",                      # Cloud Run サービスの作成・更新・削除。
    "roles/cloudbuild.builds.editor",        # Cloud Build トリガーの作成・更新。
    "roles/artifactregistry.admin",          # Artifact Registry リポジトリの管理。
    "roles/serviceusage.serviceUsageAdmin",  # Terraform から必要な Google Cloud API を有効化（google_project_service）するために必要。
    "roles/resourcemanager.projectIamAdmin", # Cloud Build や Cloud Run に対する IAM 権限（google_project_iam_member 等）を設定するために必要。
    "roles/iam.serviceAccountUser",          # Cloud Run サービスに実行用のサービスアカウントを割り当てるために必要。
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
