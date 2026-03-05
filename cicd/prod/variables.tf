variable "project_name" {
  description = "Project name of the devops project to host CI/CD resources"
  type        = string
  default     = ""
}

variable "github_org" {
  description = "GitHub organization or user name where the repo is hosted."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name."
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

variable "parent_folder" {
  description = "GCP parent folder ID in the form folders/{id}"
  default     = ""
  type        = string
}

variable "project_labels" {
  description = "Labels to apply to the project."
  type        = map(string)
  default     = {}
}

variable "bucket" {} # Dummy variable (never used in resources)

variable "service_name" {
  description = "The name of your cloud run service"
  type        = string
  default     = "default-cloudrun-srv"
}
