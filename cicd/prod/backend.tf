# run terraform init/apply with this file inert (backend.tf.example)
# then rename to backend.tf
# grab output of the bucket created in terraform apply
# and enter when prompted.
# and run terraform init --force-copy

terraform {
  backend "gcs" {
    prefix = "cicd"
  }
}
