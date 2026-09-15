terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Secret Manager API の有効化
resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# Notion API キーをシークレットとして保存
resource "google_secret_manager_secret" "notion_api_key" {
  secret_id = "gmail-notion-forwarder-notion-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "notion_api_key" {
  secret      = google_secret_manager_secret.notion_api_key.id
  secret_data = var.notion_api_key
}

# Notion Database ID をシークレットとして保存
resource "google_secret_manager_secret" "notion_database_id" {
  secret_id = "gmail-notion-forwarder-notion-database-id"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "notion_database_id" {
  secret      = google_secret_manager_secret.notion_database_id.id
  secret_data = var.notion_database_id
}

# サービスアカウント（オプション：Cloud Run などで使用する場合）
resource "google_service_account" "gas_runner" {
  account_id   = "gmail-notion-forwarder"
  display_name = "Gmail to Notion Forwarder"
}

# Secret Manager へのアクセス権を付与
resource "google_secret_manager_secret_iam_member" "notion_api_key_access" {
  secret_id = google_secret_manager_secret.notion_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gas_runner.email}"
}

resource "google_secret_manager_secret_iam_member" "notion_database_id_access" {
  secret_id = google_secret_manager_secret.notion_database_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.gas_runner.email}"
}

# 出力
output "secret_manager_secret_ids" {
  value = {
    notion_api_key      = google_secret_manager_secret.notion_api_key.id
    notion_database_id  = google_secret_manager_secret.notion_database_id.id
  }
  description = "Secret Manager に保存されたシークレットの ID"
}

output "service_account_email" {
  value       = google_service_account.gas_runner.email
  description = "サービスアカウントのメールアドレス"
}
