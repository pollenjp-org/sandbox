locals {
  app_name      = "streamlit-tutorial"
  artifact_registry_repository_name = "${local.app_name}"
  image_name    = "${local.app_name}"
  image_tag     = "${var.location}-docker.pkg.dev/${var.project_id}/${local.artifact_registry_repository_name}/${local.image_name}:latest"
  runtime_sa_name = "${local.app_name}-runtime"
  builder_sa_name = "${local.app_name}-builder"
  trigger_name  = "${local.app_name}-trigger"
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.location
  repository_id = local.artifact_registry_repository_name
  format        = "DOCKER"
}


resource "google_service_account" "cloudbuild_builder_sa" {
  account_id   = local.builder_sa_name
  display_name = "Cloud Build Builder SA"
}

resource "google_project_iam_member" "cloudbuild_builder_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
  ])
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.cloudbuild_builder_sa.email}"
}

resource "google_artifact_registry_repository_iam_member" "cloudbuild_registry_writer" {
  location   = google_artifact_registry_repository.repo.location
  repository = google_artifact_registry_repository.repo.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.cloudbuild_builder_sa.email}"
}

resource "google_cloudbuild_trigger" "streamlit_trigger" {
  name     = local.trigger_name
  location = var.location

  service_account = google_service_account.cloudbuild_builder_sa.id

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
