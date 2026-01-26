provider "google" {
  project = "awesome-habitat-485413-g7"
  region  = "asia-northeast1"
  zone    = "asia-northeast1-b"

  # NOTE: manually write SA email from 'terraform_sa' output
  impersonate_service_account = "terraform-runner@awesome-habitat-485413-g7.iam.gserviceaccount.com"
}
