# AI & LLM Security Scenarios (OWASP for LLM)

- **Prompt Injection (Direct)**: Probing an LLM-powered chat or summary API with "Ignore all previous instructions" style payloads to exfiltrate system prompts or bypass safety filters.
- **Indirect Prompt Injection**: Simulating a scenario where an attacker places malicious instructions in a document (like a resume or support ticket) that the LLM later processes, causing it to perform actions on behalf of the attacker.
- **Sensitive Data Leaking (LLM)**: Attacking an AI agent to see if it can be tricked into revealing PII from its training data or internal context.
