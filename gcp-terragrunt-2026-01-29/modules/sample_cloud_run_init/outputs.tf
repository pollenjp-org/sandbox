output "trigger_name" {
  description = "Created cloudbuild trigger name"
  value       = google_cloudbuild_trigger.streamlit_trigger.name
}

output "image_tag" {
  description = "Image tag for cloud run (ex: asia-northeast1-docker.pkg.dev/<project_id>/<repo_name>/<image_name>:latest)"
  value       = local.image_tag
}

output "location" {
  description = "Location for cloud build trigger and artifact registry repository"
  value       = var.location
}
