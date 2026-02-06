include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

dependency "sample_cloud_run_init" {
  config_path = "./init"
}

terraform {
  source = "../../../modules//sample_cloud_run"
}

inputs = {
  project_id = "${include.root.locals.gcp_project_id}"
  cloud_run_name = "streamlit-tutorial"
  cloud_run_location = "${dependency.sample_cloud_run_init.outputs.location}"
  image_tag = "${dependency.sample_cloud_run_init.outputs.image_tag}"
  access_users = ["user:polleninjp@gmail.com"]
  // enable_public_access = true
}
