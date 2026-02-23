# Advanced API Logic & Abuse Scenarios

- **GraphQL Depth & Complexity DoS**: Launching deeply nested or high-cost GraphQL queries designed to exhaust server-side resources without triggering standard rate limits.
- **HTTP Parameter Pollution (HPP)**: Sending multiple parameters with the same name (e.g., `?id=10&id=20`) to see if the WAF sees one and the application logic sees the other, bypassing security filters.
- **Unicode Normalization Bypass**: Using different Unicode representations of restricted characters (like path separators or admin usernames) to bypass regex-based security checks.
