include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

locals {
  account = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
}

terraform {
  source = "${get_repo_root()}/ocr-doc-api-2026-05-07/infra/modules/pubsub"
}

inputs = {
  project_id  = local.account.project_id
  name_prefix = local.account.name_prefix
}
