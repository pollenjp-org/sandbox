variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "app_name" {
  type = string
}

variable "repository_name" {
  type = string
  default = "${var.app_name}"
}

variable "image_name" {
  type = string
  default = "${var.app_name}"
}

variable "trigger_name" {
  type = string
  default = "${var.app_name}-trigger"
}

locals {
  image_tag = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository_name}/${var.image_name}:latest"
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.repository_name
  format        = "DOCKER"
}

resource "google_service_account" "runtime_sa" {
  account_id   = "${var.app_name}-runtime"
  display_name = "Streamlit Cloud Run Runtime SA"
}

resource "google_service_account" "cloudbuild_builder" {
  account_id   = "${var.app_name}-builder"
  display_name = "Cloud Build Builder SA"
}

resource "google_project_iam_member" "cloudbuild_builder_roles" {
  for_each = toset([
    "roles/logging.logWriter",
  ])
  project = data.google_project.project.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}

resource "google_service_account_iam_member" "cloudbuild_is_sa_user" {
  service_account_id = google_service_account.runtime_sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}

resource "google_artifact_registry_repository_iam_member" "cloudbuild_registry_writer" {
  location   = google_artifact_registry_repository.repo.location
  repository = google_artifact_registry_repository.repo.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}

resource "google_cloudbuild_trigger" "streamlit_trigger" {
  depends_on = [google_project_service.enabled_services]

  name     = var.trigger_name
  location = var.region

  service_account = google_service_account.cloudbuild_builder.id

  github {
    owner = "pollenjp-org"
    name  = "sandbox"
    push {
      branch = "^main$"
    }
  }

  included_files = ["streamlit-tutorial-2026-01-27/**"]

  build {
    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
    step {
      name = "gcr.io/cloud-builders/docker"
      dir  = "streamlit-tutorial-2026-01-27"
      args = ["build", "-t", "${local.image_tag}", "-f", "Dockerfile", "."]
    }
    step {
      name = "gcr.io/cloud-builders/docker"
      dir  = "streamlit-tutorial-2026-01-27"
      args = ["push", "${local.image_tag}"]
    }
  }
}
