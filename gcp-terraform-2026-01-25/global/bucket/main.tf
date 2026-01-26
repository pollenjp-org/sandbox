locals {
  project_id = "awesome-habitat-485413-g7"
}

# create a bucket for tfstate
resource "google_storage_bucket" "tfstate_bucket" {
  name     = "${local.project_id}-tfstate"
  location = "ASIA-NORTHEAST1" # 東京 シングルリージョン
  # location = "ASIA1" # 東京・大阪 デュアルリージョン
  # location = "ASIA"  # アジア マルチリージョン
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # 古いバージョンのステートが増えすぎないよう、一定期間（例: 90日）で削除する
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions         = 10
      days_since_noncurrent_time = 90
    }
  }
}
