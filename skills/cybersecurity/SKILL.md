---
name: cybersecurity
description: Defensive cybersecurity reference skill for authorized security reviews, secure implementation guidance, and safe vulnerability remediation. Use only for systems the user owns or is authorized to assess.
---

# Cybersecurity

Use this skill for defensive security work: secure design review, implementation hardening, vulnerability triage, remediation planning, and safe verification on systems the user owns or is explicitly authorized to assess.

## Safety Boundary

- Do not provide instructions for unauthorized intrusion, credential theft, persistence, evasion, or destructive actions.
- For exploit-themed reference files, use them to understand risk, reproduce issues only in authorized local/staging environments, and explain remediations.
- Prefer evidence-backed findings with file paths, safe reproduction steps, and fixes.
- Treat realistic secrets in examples as bugs in the documentation; use redacted placeholders only.

## Reference Index

Read only the specific reference needed for the user's task:

- `SECURITY-AUDIT-PROTOCOL.md` — audit workflow and report structure.
- `implementing-secret-scanning-with-gitleaks.md` — secret scanning setup and remediation.
- `implementing-api-key-security-controls.md` — API key handling and rotation.
- `implementing-api-rate-limiting-and-throttling.md` — rate limits and abuse controls.
- `hardening-docker-containers-for-production.md` — container hardening.
- `scanning-docker-images-with-trivy.md` — image vulnerability scanning.
- `testing-jwt-token-security.md` — JWT defensive validation.
- `testing-oauth2-implementation-flaws.md` and `configuring-oauth2-authorization-flow.md` — OAuth2 hardening.
- `testing-cors-misconfiguration.md` — CORS review.
- `testing-for-xss-vulnerabilities.md` — XSS discovery and remediation.
- `remediating-s3-bucket-misconfiguration.md` — S3 exposure remediation.

## Consolidated Operational Skills

The recurring defensive checklists from this reference pack are now integrated into:

- `security-audit` — OAuth2/JWT, API key controls, CI/CD supply chain, Docker/container hardening, and secret-response playbook.
- `pentest` — authorized API verification for IDOR, CORS, SSRF protections, traversal, upload/deserialization, rate limits, XSS/CSP, and OAuth/JWT runtime behavior.
- `secret-scanner` — secret finding triage, rotation, cleanup, and prevention workflow.

Use this `cybersecurity` skill as a deeper reference library. Prefer the operational skills above when the user asks to run an audit, scan, or verification workflow.

## Output

For audits, return:

```json
{
  "category": "cybersecurity",
  "verdict": "PASS",
  "findings": [],
  "skipped": [],
  "remediations": []
}
```

For implementation guidance, provide the safest patch or configuration pattern for the user's stack, then list verification commands.
