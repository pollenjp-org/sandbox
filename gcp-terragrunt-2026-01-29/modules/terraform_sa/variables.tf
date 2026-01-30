variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "users" {
  description = "Users to grant roles/iam.serviceAccountTokenCreator role"
  type        = list(string)
}
