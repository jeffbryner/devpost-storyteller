output "project_id" {
  description = "The ID of the created project."
  value       = data.google_project.target_project.project_id
}

output "cloudbuild_service_account_email" {
  description = "The email of the Cloud Build service account."
  value       = google_service_account.cloudbuild_sa.email
}

output "terraform_state_bucket" {
  description = "The name of the GCS bucket used for Terraform state."
  value       = google_storage_bucket.terraform_state_bucket.name
}

output "cloudbuild_sa" {
  description = "The email of the Cloud Build service account"
  value       = google_service_account.cloudbuild_sa
}
