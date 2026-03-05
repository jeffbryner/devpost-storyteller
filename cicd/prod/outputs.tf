output "terraform_state_bucket" {
  description = "The name of the Terraform state GCS bucket"
  value       = module.gcp_project_setup.terraform_state_bucket

}
