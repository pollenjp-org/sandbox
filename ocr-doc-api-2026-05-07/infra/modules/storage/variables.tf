variable "project_id" { type = string }
variable "location" { type = string }
variable "name_prefix" { type = string }
variable "force_destroy" {
  type    = bool
  default = false
}
variable "input_ttl_days" {
  type    = number
  default = 7
}
variable "output_ttl_days" {
  type    = number
  default = 30
}
