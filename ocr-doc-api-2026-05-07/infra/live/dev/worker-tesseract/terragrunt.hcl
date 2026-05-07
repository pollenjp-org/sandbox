include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

locals {
  account   = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
  image_tag = get_env("IMAGE_TAG", "latest")
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
  source = "${get_repo_root()}/ocr-doc-api-2026-05-07/infra/modules/worker_job"
}

inputs = {
  project_id            = local.account.project_id
  location              = local.account.region
  name                  = "${local.account.name_prefix}-worker-tesseract"
  image                 = "${dependency.ar.outputs.repository_url}/worker-tesseract:${local.image_tag}"
  service_account_email = dependency.iam.outputs.worker_sa_email
  eventarc_sa_email     = dependency.iam.outputs.eventarc_sa_email
  input_bucket          = dependency.storage.outputs.input_bucket
  output_bucket         = dependency.storage.outputs.output_bucket
  pubsub_topic_id       = dependency.pubsub.outputs.topic_id
  cpu                   = "2"
  memory                = "4Gi"
  timeout               = "1800s"
  extra_env = {
    TESSERACT_LANG = "jpn+eng"
  }
}
