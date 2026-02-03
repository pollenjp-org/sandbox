include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

dependencies {
  paths = ["../../init"]
}

terraform {
  source = "../../../../modules//sample_cloud_run_init"
}

inputs = {
  project_id = "${include.root.locals.gcp_project_id}"
  location   = "${include.root.locals.default_region}"
}
