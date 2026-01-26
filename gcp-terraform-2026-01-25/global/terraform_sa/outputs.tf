output "sa_email" {
  description = "The email address of the service account."
  value       = google_service_account.terraform_sa.email
}
