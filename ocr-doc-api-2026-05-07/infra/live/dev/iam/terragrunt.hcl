include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

locals {
  account = read_terragrunt_config(find_in_parent_folders("account.hcl")).locals
}

dependency "storage" {
  config_path = "../storage"
  mock_outputs = {
    input_bucket  = "mock-input"
    output_bucket = "mock-output"
  }
}

dependency "pubsub" {
  config_path = "../pubsub"
  mock_outputs = {
    topic    = "mock-topic"
    topic_id = "projects/mock/topics/mock-topic"
  }
}

terraform {
  source = "${get_repo_root()}/ocr-doc-api-2026-05-07/infra/modules/iam"
}

inputs = {
  project_id    = local.account.project_id
  name_prefix   = local.account.name_prefix
  input_bucket  = dependency.storage.outputs.input_bucket
  output_bucket = dependency.storage.outputs.output_bucket
  pubsub_topic  = dependency.pubsub.outputs.topic
}
