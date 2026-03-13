variable "project_name" {
  description = "Project name of the devops project to host CI/CD resources"
  type        = string
}


variable "default_region" {
  description = "Default region to create resources where applicable."
  type        = string
  default     = "us-central1"
}

