variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix of every resource."
  type        = string
  default     = "jobradar"
}

variable "api_url" {
  description = "Public HTTPS base URL the worker calls back, as the browser would reach the API (https://jobradar.vertexall.com/api behind the Caddy proxy). No trailing slash needed."
  type        = string

  validation {
    condition     = can(regex("^https://", var.api_url))
    error_message = "api_url must be an https:// URL (the worker sends a signed request to it)."
  }
}

variable "worker_secret_parameter" {
  description = "Name of the SSM SecureString holding WORKER_SECRET. Terraform only grants read access to it; create the value yourself so it never enters the state (see README)."
  type        = string
  default     = "/jobradar/worker-secret"
}

variable "worker_dist_dir" {
  description = "Directory with the built worker (`pnpm --filter @jobradar/worker build` writes apps/worker/dist/index.mjs)."
  type        = string
  default     = "../../apps/worker/dist"
}

variable "lambda_timeout_seconds" {
  description = "Worker timeout. One job is one AI call (a few seconds); the API enforces its own limits."
  type        = number
  default     = 60
}

variable "max_receive_count" {
  description = "Deliveries before a message goes to the dead-letter queue."
  type        = number
  default     = 3
}

variable "worker_max_concurrency" {
  description = "Cap on concurrent worker invocations (also caps parallel AI calls). Minimum 2 (AWS limit)."
  type        = number
  default     = 2

  validation {
    condition     = var.worker_max_concurrency >= 2
    error_message = "SQS event sources need a maximum concurrency of at least 2."
  }
}

variable "budget_limit_usd" {
  description = "Monthly cost alarm (a net, not a cap)."
  type        = number
  default     = 5
}

variable "alert_email" {
  description = "Receives the budget and dead-letter alarms. Empty disables both (no budget is created without a recipient)."
  type        = string
  default     = ""
}
