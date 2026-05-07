# Root terragrunt config. Each env's terragrunt.hcl includes this.

locals {
  account = read_terragrunt_config(find_in_parent_folders("account.hcl"), { locals = { project_id = "REPLACE_ME", state_bucket = "REPLACE_ME-tfstate" } })
  region  = "asia-northeast1"
}

remote_state {
  backend = "gcs"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket   = local.account.locals.state_bucket
    prefix   = "${path_relative_to_include()}"
    project  = local.account.locals.project_id
    location = local.region
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "google" {
  project = "${local.account.locals.project_id}"
  region  = "${local.region}"
}
EOF
}
