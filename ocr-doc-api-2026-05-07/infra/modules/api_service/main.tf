terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

resource "google_cloud_run_v2_service" "api" {
  project  = var.project_id
  name     = var.name
  location = var.location
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account_email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCS_INPUT_BUCKET"
        value = var.input_bucket
      }
      env {
        name  = "GCS_OUTPUT_BUCKET"
        value = var.output_bucket
      }
      env {
        name  = "PUBSUB_TOPIC"
        value = var.pubsub_topic
      }
      env {
        name  = "MAX_UPLOAD_BYTES"
        value = tostring(var.max_upload_bytes)
      }
      env {
        name  = "RUST_LOG"
        value = var.log_level
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = google_cloud_run_v2_service.api.project
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
