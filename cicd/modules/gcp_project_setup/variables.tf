variable "project_name" {
  description = "Project name of the devops project to host CI/CD resources"
  type        = string
}


variable "default_region" {
  description = "Default region to create resources where applicable."
  type        = string
  default     = "us-central1"
}

variable "org_id" {
  description = "GCP Organization ID"
  type        = string
  default     = ""
}

variable "folder_id" {
  description = "The ID of a folder to host this project"
  type        = string
  default     = ""
}

variable "billing_account" {
  description = "The ID of the billing account to associate this project with"
  type        = string
}

variable "project_labels" {
  description = "Labels to apply to the project."
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "The environment for the project (e.g., dev, prod)."
  type        = string
}
