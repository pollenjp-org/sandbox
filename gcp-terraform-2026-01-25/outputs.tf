output "project_info" {
  value = data.google_project.project
}

output "streamlit_url" {
  value = google_cloud_run_v2_service.streamlit.uri
}
