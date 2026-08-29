variable "aws_region" {
  description = "AWS Region for deployment"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (staging/prod)"
  type        = string
  default     = "prod"
}

variable "app_name" {
  description = "Application name prefix"
  type        = string
  default     = "assessment-portal"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "container_image" {
  description = "ECR image URI for Next.js application"
  type        = string
  default     = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/assessment-portal:latest"
}

variable "db_name" {
  description = "PostgreSQL Database Name"
  type        = string
  default     = "assessment_portal"
}

variable "db_username" {
  description = "PostgreSQL Master Username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "PostgreSQL Master Password"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "NextAuth Secret string"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for ALB HTTPS listener (optional)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "AWS Certificate Manager (ACM) SSL Certificate ARN"
  type        = string
  default     = ""
}
