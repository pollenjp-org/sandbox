variable "project_id" {
  type = string
}

variable "cloud_run_name" {
  type = string
}

variable "cloud_run_location" {
  type = string
}

variable "image_tag" {
  type = string
  description = "image tag for cloud run (ex: asia-northeast1-docker.pkg.dev/<project_id>/<repo_name>/<image_name>:latest)"
}

variable "access_users" {
  type        = list(string)
  description = "List of members to allow access to Cloud Run (e.g. ['user:email@example.com'])"
  default     = []
}

variable "enable_public_access" {
  type        = bool
  description = "Enable public access to Cloud Run"
  default     = false
}
