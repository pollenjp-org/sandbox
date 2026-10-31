terraform {
  cloud {
    organization = "my-org"
    workspaces {
      name = "network-prd"
    }
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# Workspace を Terraform 自身でコード管理する例
resource "tfe_workspace" "network_prd" {
  name              = "network-prd"
  organization      = "my-org"
  terraform_version = "1.9.5"

  vcs_repo {
    identifier     = "ORG/REPO"
    branch         = "main"
    oauth_token_id = var.tfc_github_oauth_token_id
  }

  working_directory   = "terraform/network"
  auto_apply          = false   # ★ apply は手動承認 (TFC UI)
  file_triggers_enabled = true
  trigger_prefixes    = ["terraform/network", "terraform/modules"]
}

resource "tfe_variable" "aws_region" {
  workspace_id = tfe_workspace.network_prd.id
  category     = "terraform"
  key          = "aws_region"
  value        = "ap-northeast-1"
}

resource "tfe_variable" "aws_role_arn" {
  workspace_id = tfe_workspace.network_prd.id
  category     = "env"
  key          = "TFC_AWS_RUN_ROLE_ARN"  # ★ TFC Dynamic Credentials (OIDC)
  value        = "arn:aws:iam::111122223333:role/tfc-apply"
}
