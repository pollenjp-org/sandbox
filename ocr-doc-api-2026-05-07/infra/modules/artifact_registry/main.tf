terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.location
  repository_id = var.name
  description   = "Container images for ${var.name}"
  format        = "DOCKER"
}
