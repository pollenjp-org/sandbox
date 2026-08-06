variable "project_id" { type = string }
variable "location" { type = string }
variable "name" { type = string }
variable "image" { type = string }
variable "service_account_email" { type = string }

variable "input_bucket" { type = string }
variable "output_bucket" { type = string }
variable "pubsub_topic" { type = string }

variable "cpu" {
  type    = string
  default = "1"
}
variable "memory" {
  type    = string
  default = "512Mi"
}
variable "min_instances" {
  type    = number
  default = 0
}
variable "max_instances" {
  type    = number
  default = 5
}
variable "max_upload_bytes" {
  type    = number
  default = 104857600
}
variable "log_level" {
  type    = string
  default = "info"
}
variable "allow_unauthenticated" {
  type    = bool
  default = false
}
