terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30"
    }
  }
}

resource "google_storage_bucket" "input" {
  name                        = "${var.name_prefix}-input"
  project                     = var.project_id
  location                    = var.location
  force_destroy               = var.force_destroy
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition { age = var.input_ttl_days }
    action { type = "Delete" }
  }
}

resource "google_storage_bucket" "output" {
  name                        = "${var.name_prefix}-output"
  project                     = var.project_id
  location                    = var.location
  force_destroy               = var.force_destroy
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition { age = var.output_ttl_days }
    action { type = "Delete" }
  }
}
