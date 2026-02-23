# Compliance & Regulatory Scenarios

These scenarios focus on the audit, control, and governance aspects of major regulatory frameworks (HIPAA, PCI DSS, SOC 2, GDPR).

## 1. HIPAA (Healthcare) - Focus on "Accounting of Disclosures"
- **Audit Log Suppression**: An attack where a user with high privileges attempts to perform a PHI export while simultaneously calling an endpoint like `/api/audit/suspend` or using a header like `X-Skip-Audit: true`.
- **Emergency Access ("Break Glass") Abuse**: Testing the logic of emergency access endpoints (e.g., `/api/records/emergency-access`). The scenario involves triggering emergency access without a required "Justification" string or failing to trigger the mandatory high-priority alert.
- **Patient Right to Access (API Level)**: Simulating a request to `/api/patient/export-all` and checking if it accidentally includes internal medical notes or "Psychotherapy Notes" which have different legal protections.

## 2. PCI DSS (Payment Card Industry)
- **Insecure PAN Logging**: Performing a transaction and then probing `/api/logs/debug` or `/api/support/tickets` to see if the full Primary Account Number (PAN) was accidentally stored in plain text.
- **CDE Segmentation Probe**: Attempting to pivot from a "Public" API (like a product catalog) to an "Internal" payment processing subnet, testing if network segmentation is enforced at the API Gateway level.
- **Payment Page Integrity**: Probing for DOM injection vulnerabilities on the checkout page that could allow an attacker to overlay a fake credit card form over the legitimate PCI-compliant IFrame.

## 3. SOC 2 (Trust Services Criteria)
- **Unauthorized Configuration Change**: Targeting the "System Settings" API to disable MFA or change password complexity rules without a required "Change Management" ticket ID.
- **Access Review Bypass**: Attempting to use a "Service Account" API key that was supposed to be rotated (e.g., >90 days old), testing enforcement of credential lifecycle policies.
- **Availability/DoS Resilience**: Launching application-layer DoS against `/api/status` to see if auto-scaling or circuit breaking controls are effective.

## 4. FedRAMP / Government
- **Non-FIPS Cipher Negotiation**: Attempting to force a TLS handshake using "Weak" or "Non-FIPS" compliant ciphers (like 3DES or RC4).
- **Cross-Tenant Data Leakage**: A sophisticated IDOR scenario where "Tenant A" attempts to access "Tenant B" resources by manipulating `X-Tenant-ID` or JWT claims.

## 5. GDPR/CCPA (Data Privacy)
- **Right-to-be-Forgotten Residual Data**: Requesting account deletion via `/api/user/delete`, then probing `/api/analytics/events` to see if PII still exists in secondary data stores.
- **Consent Preference Conflict**: Attempting to trigger a marketing event via the API for a user who has explicitly opted out (`marketing_opt_in: false`).
