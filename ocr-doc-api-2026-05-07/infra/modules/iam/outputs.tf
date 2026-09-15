output "api_sa_email" { value = google_service_account.api.email }
output "worker_sa_email" { value = google_service_account.worker.email }
output "eventarc_sa_email" { value = google_service_account.eventarc.email }
