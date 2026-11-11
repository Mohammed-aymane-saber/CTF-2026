variable "aws_region" {
  type    = string
  default = "eu-west-3"
}

variable "aws_profile" {
  type    = string
  default = "eclipse"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "frontend_instance_type" {
  description = "Free Tier eligible t3-small instance for the public frontend."
  type    = string
  default = "t3.small"
}

variable "backend_instance_type" {
  description = "Free Tier eligible M7i-flex instance for CTFd, MariaDB and Redis."
  type    = string
  default = "m7i-flex.large"
}

variable "ssh_cidr" {
  description = "Optional emergency SSH CIDR. Keep empty to use SSM only."
  type        = string
  default     = ""
}

variable "enable_nat_gateway" {
  description = "Optional fallback internet egress. Keep disabled when using VPC endpoints."
  type        = bool
  default     = false
}
