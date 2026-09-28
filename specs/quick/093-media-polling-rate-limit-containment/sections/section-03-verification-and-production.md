# Section 03 — Verification and Production

## Ownership

- focused tests and lint/typecheck commands
- `orchestra/` progress, decisions, review, and incident evidence
- production web/backend process restarts only

## Acceptance

- Focused suites pass.
- Security review has no high/critical finding.
- Relevant services restart gracefully and health checks pass.
- Two polling windows show no MCP burst and no internal 429.
- No paid provider request is required for the default smoke check.

## Rollback

Revert only scoped code changes and restart the affected service. Do not restore
the incident MCP task unless an audit recovery specifically requires it.

## Implemented

- Web: 40 focused tests passed.
- Python: 36 focused tests passed.
- TypeScript and focused Ruff gates passed.
- Gracefully restarted only `smartspec-backend` and `smartspec-web`.
- Local backend/web and public health checks passed.
- Two post-deploy poll windows had zero fetch-result bursts, 404s, limiter
  events, or 429 responses; pending MCP task count was zero.
- Paid provider smoke was intentionally skipped.
