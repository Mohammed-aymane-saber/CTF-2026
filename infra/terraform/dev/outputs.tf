output "frontend_public_ip" {
  value = aws_eip.frontend.public_ip
}

output "backend_private_ip" {
  value = aws_instance.backend.private_ip
}

output "backend_instance_id" {
  value = aws_instance.backend.id
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}
