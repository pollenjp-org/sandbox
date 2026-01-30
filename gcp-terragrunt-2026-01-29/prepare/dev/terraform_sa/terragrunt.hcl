include "root" {
  path = find_in_parent_folders("root.hcl")
  expose = true
}

terraform {
  source = "../../../modules//terraform_sa"
}

inputs = {
  project_id = "${include.root.locals.gcp_project_id}"
  users = ["polleninjp@gmail.com"]
}
