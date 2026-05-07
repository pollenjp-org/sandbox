terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-api"
  display_name = "OCR API service"
}

resource "google_service_account" "worker" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-worker"
  display_name = "OCR worker (Cloud Run Job) service"
}

resource "google_service_account" "eventarc" {
  project      = var.project_id
  account_id   = "${var.name_prefix}-eventarc"
  display_name = "Eventarc invoker"
}

# API: read/write input bucket (write-only would be tighter; uses object admin
# for both buckets to support optional pre-signed URL flows).
resource "google_storage_bucket_iam_member" "api_input_rw" {
  bucket = var.input_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "api_output_read" {
  bucket = var.output_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.api.email}"
}

# API also writes initial status.json to output.
resource "google_storage_bucket_iam_member" "api_output_write" {
  bucket = var.output_bucket
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.api.email}"
}

# Worker: read input, write output.
resource "google_storage_bucket_iam_member" "worker_input_read" {
  bucket = var.input_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_storage_bucket_iam_member" "worker_output_admin" {
  bucket = var.output_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}

# API publishes to the jobs topic.
resource "google_pubsub_topic_iam_member" "api_publisher" {
  project = var.project_id
  topic   = var.pubsub_topic
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Eventarc → Cloud Run Job needs to invoke run jobs and consume pubsub.
resource "google_project_iam_member" "eventarc_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.eventarc.email}"
}

resource "google_project_iam_member" "eventarc_jobs_runner" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.eventarc.email}"
}

resource "google_project_iam_member" "eventarc_event_receiver" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${google_service_account.eventarc.email}"
}
