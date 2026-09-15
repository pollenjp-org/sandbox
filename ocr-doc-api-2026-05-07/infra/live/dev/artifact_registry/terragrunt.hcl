include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

locals {
  account = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
}

terraform {
  source = "${get_repo_root()}/ocr-doc-api-2026-05-07/infra/modules/artifact_registry"
}

inputs = {
  project_id = local.account.project_id
  location   = local.account.region
  name       = local.account.name_prefix
}
