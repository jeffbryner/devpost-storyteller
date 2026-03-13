variable "project_name" {
  description = "Project ID/name of the existing GCP Project"
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

# Dummy variable (never used in resources)
# we fill it at terraform apply time from the GCP Secret tfvars to avoid hardcoding the bucket name in code and having it end up in a github repo
# used in cloudbuild.yaml, cloudbuild-apply.yaml 
variable "bucket" {
  description = "GCS bucket name for terraform remote state storage."
  type        = string
  default     = ""
}

variable "service_name" {
  description = "The name of your cloud run service"
  type        = string
  default     = "default-cloudrun-srv"
}
