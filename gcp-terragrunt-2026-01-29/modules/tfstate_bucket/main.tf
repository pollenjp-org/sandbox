resource "google_storage_bucket" "tfstate_bucket" {
  name     = "${var.env}-tfstate-${var.project_id}"

  // https://docs.cloud.google.com/storage/docs/locations?hl=ja
  location = "ASIA-NORTHEAST1" # 東京 シングルリージョン
  # location = "ASIA1" # 東京・大阪 デュアルリージョン
  # location = "ASIA"  # アジア マルチリージョン

  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # 古いバージョンのステートが増えすぎないように
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions         = 10
      # days_since_noncurrent_time = 90
    }
  }
}
