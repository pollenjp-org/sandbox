variable "project_id" { type = string }
variable "location" { type = string }
variable "name" { type = string }
variable "image" { type = string }
variable "service_account_email" { type = string }
variable "eventarc_sa_email" { type = string }

variable "input_bucket" { type = string }
variable "output_bucket" { type = string }
variable "pubsub_topic_id" { type = string }

variable "cpu" {
  type    = string
  default = "2"
}
variable "memory" {
  type    = string
  default = "4Gi"
}
variable "max_retries" {
  type    = number
  default = 3
}
variable "timeout" {
  type    = string
  default = "1800s"
}
variable "extra_env" {
  type    = map(string)
  default = {}
}
