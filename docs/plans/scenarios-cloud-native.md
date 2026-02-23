# Cloud-Native & Serverless Exploitation Scenarios

- **Lambda/Function Environment Hijacking**: Using command injection in a serverless endpoint to read `/proc/self/environ` or access the local `/tmp` directory to steal temporary AWS/Azure credentials.
- **IMDSv1/v2 SSRF**: A multi-step attack specifically targeting the Instance Metadata Service (`169.254.169.254`) to exfiltrate IAM role credentials from a cloud-hosted API.
- **Object Storage Pre-signed URL Abuse**: Testing for logic flaws in how an API generates pre-signed URLs (S3/GCS), allowing an attacker to generate a URL with `PUT` permissions for a bucket they shouldn't access.
