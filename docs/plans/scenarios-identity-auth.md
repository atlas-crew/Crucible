# Modern Identity & Auth Manipulation Scenarios

- **OAuth2 PKCE Bypass**: Probing for mobile or SPA applications that use OAuth2 but fail to enforce the Proof Key for Code Exchange (PKCE) flow.
- **OIDC Claim Injection**: Attempting to manipulate OpenID Connect claims (like `groups` or `roles`) during the callback phase to escalate privileges.
- **Session Fixation via Refresh Tokens**: A scenario where an attacker forces a victim to use a known refresh token, allowing the attacker to "hijack" the session once the victim authenticates.
