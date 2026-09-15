terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

# Cloud Run Job that an Eventarc Pub/Sub trigger executes once per message.
# The Pub/Sub message body is delivered as the JOB_PAYLOAD container env via
# the trigger's container_overrides.
resource "google_cloud_run_v2_job" "worker" {
  project  = var.project_id
  name     = var.name
  location = var.location

  template {
    template {
      service_account = var.service_account_email
      max_retries     = var.max_retries
      timeout         = var.timeout

      containers {
        image = var.image

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }

        env {
          name  = "GCS_INPUT_BUCKET"
          value = var.input_bucket
        }
        env {
          name  = "GCS_OUTPUT_BUCKET"
          value = var.output_bucket
        }
        dynamic "env" {
          for_each = var.extra_env
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }
}

# Pub/Sub subscription with filter for this engine; Eventarc trigger fires the
# job per message and overrides JOB_PAYLOAD with the message data.
resource "google_eventarc_trigger" "pubsub_to_job" {
  project  = var.project_id
  name     = "${var.name}-trigger"
  location = var.location

  matching_criteria {
    attribute = "type"
    value     = "google.cloud.pubsub.topic.v1.messagePublished"
  }

  transport {
    pubsub {
      topic = var.pubsub_topic_id
    }
  }

  destination {
    cloud_run_service {
      service = google_cloud_run_v2_job.worker.name
      region  = var.location
    }
  }

  service_account = var.eventarc_sa_email
}
