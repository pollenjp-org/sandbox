terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

resource "google_pubsub_topic" "jobs" {
  name    = "${var.name_prefix}-jobs"
  project = var.project_id
}

resource "google_pubsub_topic" "dlq" {
  name    = "${var.name_prefix}-jobs-dlq"
  project = var.project_id
}
