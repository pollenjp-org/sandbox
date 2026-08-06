include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

locals {
  account      = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
  image_tag    = get_env("IMAGE_TAG", "latest")
}

dependency "storage" {
  config_path = "../storage"
}
dependency "pubsub" {
  config_path = "../pubsub"
}
dependency "iam" {
  config_path = "../iam"
}
dependency "ar" {
  config_path = "../artifact_registry"
}

terraform {
  source = "${get_repo_root()}/ocr-doc-api-2026-05-07/infra/modules/api_service"
}

inputs = {
  project_id            = local.account.project_id
  location              = local.account.region
  name                  = "${local.account.name_prefix}-api"
  image                 = "${dependency.ar.outputs.repository_url}/api:${local.image_tag}"
  service_account_email = dependency.iam.outputs.api_sa_email
  input_bucket          = dependency.storage.outputs.input_bucket
  output_bucket         = dependency.storage.outputs.output_bucket
  pubsub_topic          = dependency.pubsub.outputs.topic
  allow_unauthenticated = true
  max_upload_bytes      = 104857600
}
