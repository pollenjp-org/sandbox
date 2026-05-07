output "topic" { value = google_pubsub_topic.jobs.name }
output "topic_id" { value = google_pubsub_topic.jobs.id }
output "dlq_topic" { value = google_pubsub_topic.dlq.name }
output "dlq_topic_id" { value = google_pubsub_topic.dlq.id }
