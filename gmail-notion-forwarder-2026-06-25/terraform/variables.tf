variable "gcp_project_id" {
  type        = string
  description = "GCP プロジェクト ID"
}

variable "gcp_region" {
  type        = string
  description = "GCP リージョン"
  default     = "asia-northeast1"
}

variable "notion_api_key" {
  type        = string
  sensitive   = true
  description = "Notion API キー（内部統合トークン）"
}

variable "notion_database_id" {
  type        = string
  description = "Notion Database ID"
}
