locals {
  cloud_run_name = "streamlit-tutorial"
  runtime_sa_name = "${var.cloud_run_name}-runtime"
}

resource "google_service_account" "runtime_sa" {
  account_id   = local.runtime_sa_name
  display_name = "Streamlit Cloud Run Runtime SA"
}

resource "google_cloud_run_v2_service" "streamlit_cloud_run" {
  name     = local.cloud_run_name
  location = var.cloud_run_location
  ingress  = "INGRESS_TRAFFIC_ALL"
  deletion_protection=false

  template {
    service_account = google_service_account.runtime_sa.email
    containers {
      image = var.image_tag
      ports {
        container_port = 8501
      }
    }
  }

  # NOTE:
  # Allow Terraform to create the service even if the image doesn't exist yet (though it might fail on first run)
  # In a real scenario, you'd run the build once before applying this, or use a placeholder image.
}

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.streamlit_cloud_run.location
  name     = google_cloud_run_v2_service.streamlit_cloud_run.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
