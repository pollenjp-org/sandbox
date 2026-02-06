locals {
  cloud_run_name = "streamlit-tutorial"
  runtime_sa_name = "${var.cloud_run_name}-runtime"
}

resource "google_service_account" "runtime_sa" {
  account_id   = local.runtime_sa_name
  display_name = "Streamlit Cloud Run Runtime SA"
}

resource "google_cloud_run_v2_service" "streamlit_cloud_run" {
  provider = google-beta

  name     = local.cloud_run_name
  location = var.cloud_run_location
  ingress  = "INGRESS_TRAFFIC_ALL"
  deletion_protection=false

  // IAP
  // https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/cloud_run_v2_service#example-usage---cloudrunv2-service-iap
  //
  launch_stage = "BETA"
  iap_enabled  = true

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

# FIXME: not work?
resource "google_iap_web_iam_member" "iap_accessor" {
  provider = google-beta
  for_each = toset(var.access_users)

  project  = var.project_id
  role     = "roles/iap.httpsResourceAccessor"
  member   = each.value
}

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count = var.enable_public_access ? 1 : 0

  location = google_cloud_run_v2_service.streamlit_cloud_run.location
  name     = google_cloud_run_v2_service.streamlit_cloud_run.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
