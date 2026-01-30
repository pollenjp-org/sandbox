include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../../modules//tfstate_bucket"
}

inputs = {
  project_id = "${include.root.locals.gcp_project_id}"
  env        = "${include.root.locals.env}"
}
