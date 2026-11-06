terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Remote state in the bucket created by ./bootstrap. Partial configuration:
  #   terraform init -backend-config=backend.hcl      (copy backend.hcl.example first)
  # For a throwaway local trial: terraform init -backend=false
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Sdd       = "SDD-010"
    }
  }
}
