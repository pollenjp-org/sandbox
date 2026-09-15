output "job_name" { value = google_cloud_run_v2_job.worker.name }
output "trigger_name" { value = google_eventarc_trigger.pubsub_to_job.name }
