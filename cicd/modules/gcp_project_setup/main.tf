terraform {
  required_providers {
    google      = "~> 4.0"
    google-beta = "~> 4.0"
  }

}

resource "random_id" "suffix" {
  byte_length = 2
}

locals {
  project_name          = "prj-${var.project_name}"
  project_id            = "prj-${var.project_name}"
  project_org_id        = var.folder_id != "" ? null : var.org_id
  project_folder_id     = var.folder_id != "" ? var.folder_id : null
  state_bucket_name     = format("bkt-%s-%s", "tfstate", local.project_id)
  art_bucket_name       = format("bkt-%s-%s", "artifacts", local.project_id)
  cloudbuild_default_sa = "serviceAccount:${data.google_project.target_project.number}-compute@developer.gserviceaccount.com"
  services = [
    "cloudbilling.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "cloudidentity.googleapis.com",
    "appengine.googleapis.com",
    "developerconnect.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
    "firebase.googleapis.com",
    "storage.googleapis.com",
  ]
}


data "google_project" "target_project" {
  project_id = local.project_id

}

# bucket for terraform state
resource "google_storage_bucket" "terraform_state_bucket" {
  project                     = data.google_project.target_project.project_id
  name                        = local.state_bucket_name
  location                    = var.default_region
  uniform_bucket_level_access = true
  force_destroy               = true
  versioning {
    enabled = true
  }
}

# enable required services in the project
resource "google_project_service" "services" {
  for_each           = toset(local.services)
  project            = data.google_project.target_project.project_id
  service            = each.value
  disable_on_destroy = false
}


# Custom Service Account for Cloud Build to deploy infrastructure
resource "google_service_account" "cloudbuild_sa" {
  project      = data.google_project.target_project.project_id
  account_id   = "terraform-deployer"
  display_name = "Cloud Build Terraform Deployer"
  description  = "Account used by Cloud Build to deploy Cloud Run and Infrastructure"
}

# Grant permissions to the Service Account
# We iterate over a list of roles so we don't repeat code blocks.
resource "google_project_iam_member" "sa_roles" {
  for_each = toset([
    "roles/run.admin",                       # Deploy Cloud Run services
    "roles/iam.serviceAccountUser",          # Attach identities to Cloud Run services
    "roles/storage.admin",                   # Manage GCS buckets, Read/Write Terraform state files
    "roles/logging.logWriter",               # Write build logs
    "roles/cloudbuild.builds.editor",        # Cloud Build Editor role
    "roles/resourcemanager.projectIamAdmin", # Modify IAM policies (if TF manages IAM)
    "roles/secretmanager.secretAccessor",    # Access secrets from Secret Manager
    "roles/secretmanager.viewer",
    "roles/serviceusage.serviceUsageAdmin",     # Enable Cloud Build SA to list and enable APIs in the project.
    "roles/developerconnect.readTokenAccessor", # enable terrafor to read tokens for cloudbuild triggers.
    "roles/developerconnect.user",              # enable terraform to reference repos
    "roles/iam.serviceAccountAdmin",            # manage service accounts
    "roles/artifactregistry.admin",             # create and manage artifact registry repos
    "roles/run.admin",                          # manage cloud run services
  ])

  project    = local.project_id
  role       = each.key
  member     = "serviceAccount:${google_service_account.cloudbuild_sa.email}"
  depends_on = [google_project_service.services]
}

# # if needed grant permissions to the default cloud build service account
# resource "google_project_iam_member" "cloudbuild_default_sa_roles" {
#   for_each = toset([
#     "roles/storage.admin",           # Manage GCS buckets for build artifacts
#     "roles/artifactregistry.writer", # Push images to Artifact Registry
#     "roles/logging.logWriter",       # Write build logs
#   ])

#   project    = local.project_id
#   role       = each.key
#   member     = local.cloudbuild_default_sa
#   depends_on = [google_project_service.services]
# }


# secrets for the terraform tfvars
resource "google_secret_manager_secret" "tfvars" {
  secret_id = "tfvars"
  project   = local.project_id

  labels = {
    label = "secret-tfvars"
  }

  replication {
    user_managed {
      replicas {
        location = var.default_region
      }
    }
  }
  depends_on = [
    google_project_service.services
  ]
}
