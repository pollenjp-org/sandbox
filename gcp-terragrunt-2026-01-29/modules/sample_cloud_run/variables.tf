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
