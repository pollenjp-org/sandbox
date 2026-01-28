terraform {
  required_version = ">= 1.0.0, < 2.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.17.0"
    }
  }

  backend "gcs" {
    bucket = "" # send from backend.hcl
    prefix = "root"
  }
}
