# TODO: 初期化 tf を分離する golang の init 的な感じ
#
# - init1 phase (terraform)
#   - enable api
# - init2 phase (manual)
#   - cloud build: connect the target github repository
# - init3 phase (terraform)
#   - create an artifact registry
#   - push a dummy image to artifact registry (so that google_cloud_run_v2_service can refer to the image)
# - main phase
#   - create cloud run
#   - create trigger
#     - SA & policy settings

data "google_project" "project" {
}

locals {
  location = "asia-northeast1"
  app_name = "streamlit-tutorial"
  app_port_num = 8501
  image_name = "streamlit-tutorial"
}

# resource "time_sleep" "wait_30_seconds" {
#   depends_on = [google_project.my_project]

#   create_duration = "30s"
# }

resource "google_project_service" "enabled_services" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "iam.googleapis.com",
    "compute.googleapis.com", # Required for default service accounts
  ])
  project = data.google_project.project.project_id
  service = each.key

  disable_dependent_services = true
}

resource "google_artifact_registry_repository" "repo" {
  depends_on = [google_project_service.enabled_services]
  location      = local.location
  repository_id = local.app_name
  format        = "DOCKER"
}

resource "google_service_account" "streamlit_runtime_sa" {
  account_id   = "${local.app_name}-runtime"
  display_name = "Streamlit Cloud Run Runtime SA"
}

resource "google_service_account" "cloudbuild_builder" {
  account_id   = "${local.app_name}-builder"
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

resource "google_cloudbuild_trigger" "streamlit_trigger" {
  depends_on = [google_project_service.enabled_services]

  name     = "${local.app_name}-trigger"
  location = "asia-northeast1"

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
      args = [
        "build",
        "-t", "${local.location}-docker.pkg.dev/${data.google_project.project.project_id}/${google_artifact_registry_repository.repo.repository_id}/${local.image_name}:latest",
        "-f", "Dockerfile",
        "."
      ]
    }
    step {
      name = "gcr.io/cloud-builders/docker"
      dir  = "streamlit-tutorial-2026-01-27"
      args = [
        "push",
        "${local.location}-docker.pkg.dev/${data.google_project.project.project_id}/${google_artifact_registry_repository.repo.repository_id}/${local.image_name}:latest"
      ]
    }
    step {
      name = "gcr.io/google.com/cloudsdktool/cloud-sdk"
      dir  = "streamlit-tutorial-2026-01-27"
      entrypoint = "gcloud"
      args = [
        "run", "deploy", local.app_name,
        "--image", "${local.location}-docker.pkg.dev/${data.google_project.project.project_id}/${google_artifact_registry_repository.repo.repository_id}/${local.image_name}:latest",
        "--region", local.location,
        "--platform", "managed",
        "--port", "${local.app_port_num}",
        "--service-account", google_service_account.streamlit_runtime_sa.email,
        "--allow-unauthenticated"
      ]
    }
  }
}

resource "google_cloud_run_v2_service" "streamlit" {
  depends_on = [google_project_service.enabled_services]
  name     = local.app_name
  location = local.location
  ingress  = "INGRESS_TRAFFIC_ALL"
  deletion_protection=false

  template {
    service_account = google_service_account.streamlit_runtime_sa.email
    containers {
      image = "${local.location}-docker.pkg.dev/${data.google_project.project.project_id}/${google_artifact_registry_repository.repo.repository_id}/${local.image_name}:latest"
      ports {
        container_port = local.app_port_num
      }
    }
  }

  # NOTE:
  # Allow Terraform to create the service even if the image doesn't exist yet (though it might fail on first run)
  # In a real scenario, you'd run the build once before applying this, or use a placeholder image.
}

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.streamlit.location
  name     = google_cloud_run_v2_service.streamlit.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# cloud builder の step の gcloud deploy run で使用
resource "google_cloud_run_v2_service_iam_member" "cloudbuild_run_admin" {
  location = google_cloud_run_v2_service.streamlit.location
  name     = google_cloud_run_v2_service.streamlit.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}

# Cloud Build が、Cloud Run の実行用 SA (streamlit_runtime_sa) を使用してデプロイできるようにする
# プロジェクト全体ではなく、特定の SA に対してのみ権限を与えることでセキュリティを高める
resource "google_service_account_iam_member" "cloudbuild_is_sa_user" {
  service_account_id = google_service_account.streamlit_runtime_sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}

# プロジェクト全体ではなく、特定のリポジトリに対してのみプッシュ権限を与える
resource "google_artifact_registry_repository_iam_member" "cloudbuild_registry_writer" {
  location   = google_artifact_registry_repository.repo.location
  repository = google_artifact_registry_repository.repo.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.cloudbuild_builder.email}"
}
