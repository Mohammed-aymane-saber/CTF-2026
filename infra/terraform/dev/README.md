# Eclipse CTF - AWS foundation

Creates a public frontend EC2 with a stable Elastic IP, a private backend EC2,
SSM IAM access and a private versioned S3 bucket for challenge files. The EC2
instances are only bootstrapped with Docker; application deployment comes next.

The default instance type is `m7i-flex.large` (2 vCPU, 8 GiB RAM). AWS lists it
as Free Tier eligible for accounts created on or after July 15, 2025, subject
to the account's remaining credits and offer period. Two always-on instances
can consume the credits quickly, so verify the billing console before apply.

## Credentials

Do not put access keys in Terraform files. Create an AWS CLI profile instead:

```powershell
aws configure --profile eclipse
aws sts get-caller-identity --profile eclipse
```

## Deploy

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out eclipse.tfplan
terraform apply eclipse.tfplan
terraform output
```

## SSM

```powershell
aws ssm start-session --target <backend-instance-id> --profile eclipse --region eu-west-3
```

## Cost warning

The NAT Gateway is enabled because the private instance needs outbound access
for Docker bootstrap and SSM. NAT Gateway is billed separately. Destroy the
stack when finished:

```powershell
terraform destroy
```

The frontend uses an explicit Elastic IP instead of automatic public IP
assignment, and both instances require IMDSv2 tokens. Root EBS volumes are
encrypted with AWS-managed EBS encryption, while the uploads bucket uses a
dedicated customer-managed KMS key.
