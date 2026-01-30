locals {
  product_name        = "gcp-terragrunt-2026-01-29"
  env                 = basename(dirname(get_terragrunt_dir()))
  gcp_project_id      = {
    // prod = ""
    // stg  = ""
    dev  = "civil-array-485708-k5"
  }[local.env]

  // NOTE: `terraform_sa` の apply 時は null にして、権限借用を外す
  terraform_runner_sa_email = {
    // prod = ""
    // stg  = ""
    dev  = "terraform-runner@civil-array-485708-k5.iam.gserviceaccount.com"
  }[local.env]

  tfstate_bucket_name = {
    // prod = ""
    // stg  = ""
    dev  = "dev-tfstate-civil-array-485708-k5"
  }[local.env]

}

generate "terraform" {
  path      = "autogen_terraform.tf"
  if_exists = "overwrite_terragrunt"

  contents = <<EOF
terraform {
  required_version = "~> 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.17.0"
    }
  }

  backend "gcs" {
    bucket = "${local.tfstate_bucket_name}"
    prefix = "${path_relative_to_include()}"
  }
}
EOF
}

generate "provider" {
  path      = "autogen_providers.tf"
  if_exists = "overwrite_terragrunt"

  contents = <<EOF
provider "google" {
  project = "${local.gcp_project_id}"
  region  = "asia-northeast1"

  %{ if local.terraform_runner_sa_email != null ~}
  impersonate_service_account = "${local.terraform_runner_sa_email}"
  %{ endif ~}
}
EOF
}
