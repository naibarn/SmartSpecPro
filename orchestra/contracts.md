# Orchestra Contracts

## Security Audit Review Contract

- Shared interface: read-only findings with severity, evidence path/line, impact, and remediation.
- Ownership boundaries:
  - Web backend/frontend reviewer: `apps/web/server/**`, `apps/web/client/**`, shared web code.
  - Python reviewer: `python-backend/**`.
  - Supply-chain/config reviewer: package manifests, lockfiles, CI, Docker, environment/config examples.
- Test boundary: reviewers do not edit tests; final conductor records runnable gates and skipped checks.
- Impact boundary: no code changes in this session unless the user asks for remediation.
- Security-sensitive surfaces: auth, RBAC, tenant isolation, secrets, API keys, file/media processing, CORS/CSP, SSRF, command execution, raw SQL, CI/Docker.
