output "repository_url" {
  value = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${google_artifact_registry_repository.containers.project}/${google_artifact_registry_repository.containers.repository_id}"
}
output "repository_id" { value = google_artifact_registry_repository.containers.repository_id }
