locals {
  project_id = "awesome-habitat-485413-g7"
}

# create a service account for this project
resource "google_service_account" "terraform_sa" {
  account_id   = "terraform-runner"
  display_name = "Terraform Execution SA"
}

# grant roles/storage.admin to the service account
resource "google_project_iam_member" "sa_storage_admin" {
  project = local.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.terraform_sa.email}"
}

# grant roles/iam.serviceAccountTokenCreator to developers
resource "google_service_account_iam_member" "allow_impersonation" {
  for_each = toset(["polleninjp@gmail.com", "dummysakiaki@gmail.com"])

  service_account_id = google_service_account.terraform_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${each.value}"
}
