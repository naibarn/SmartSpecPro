# Risk Register
Last updated: 2026-05-08T02:35:00Z
Session: Defensive security review and immediate remediation of current SmartSpecPro codebase
Verdict: PARTIAL PASS

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R001 | CRITICAL | Secret exposure | nginx/ssl/smartaihub.app.key | n/a | TLS private key reported during audit is not present/tracked in the current worktree, but any previously exposed certificate/key must still be rotated and purged from git history if it was committed. | external follow-up |
| R002 | CRITICAL | Secret exposure | smartspecpro_backup.sql | n/a | Tracked SQL backup was removed from the worktree and backup SQL patterns were added to `.gitignore`; rotate affected key(s) and purge repository history before considering fully closed. | remediated in repo, external follow-up |
| R003 | CRITICAL | Vulnerable dependencies | package-lock.json | n/a | Production npm audit no longer reports critical vulnerabilities after lockfile/package updates. One high vulnerability remains in `xlsx` with no audit fix. | partially remediated |
| R004 | HIGH | Webhook auth fail-open | python-backend/app/api/v1/kie_webhooks.py | n/a | Kie webhook now fails closed with HTTP 503 when `KIE_AI_WEBHOOK_SECRET` is missing and validates HMAC otherwise. | remediated |
| R005 | HIGH | Webhook auth fail-open | python-backend/app/api/v1/media_generation.py | n/a | Legacy Kie callback now fails closed with HTTP 503 when `KIE_AI_WEBHOOK_SECRET` is missing and validates HMAC otherwise. | remediated |
| R006 | HIGH | SSRF via redirect | python-backend/app/services/media_pipeline.py | n/a | Provider media downloads now manually follow redirects and validate each redirect target before fetching. | remediated |
| R007 | HIGH | CI supply chain | .github/workflows/deploy-production.yml | n/a | Mutable third-party GitHub Action refs identified in production deploy workflow were pinned to commit SHAs. | remediated |
| R008 | HIGH | CI supply chain | .github/workflows/deploy-staging.yml | n/a | Mutable third-party GitHub Action refs identified in staging deploy workflow were pinned to commit SHAs. | remediated |
| R009 | HIGH | Container control | docker-compose.opensandbox.yml | 27 | Docker socket is mounted into a service; compromise can become host/container control. | open |
| R010 | HIGH | Container control | docker-compose.nginx.yml | 181 | Docker socket is mounted into a service; compromise can become host/container control. | open |
| R011 | MEDIUM | Sensitive logging/data retention | python-backend/app/api/v1/media_generation.py | n/a | Legacy callback now redacts sensitive callback payload fields before logging. | remediated |
| R012 | MEDIUM | Sensitive payload retention | python-backend/app/api/v1/kie_webhooks.py | n/a | Kie webhook result payload storage now uses a redacted copy instead of raw body content. | remediated |
| R013 | MEDIUM | CSP weakness | apps/web/server/_core/index.ts | 235 | Production CSP allows `unsafe-inline` and `unsafe-eval`, reducing XSS containment. | open |
| R014 | MEDIUM | REST auth wiring review | apps/web/server/routes/voiceGateway.ts | 94 | `/api/voice/session` expects `req.user`, but mount point does not show explicit auth middleware. Verify before exposing. | open |
| R015 | MEDIUM | Missing abuse control review | apps/web/server/routers/voiceAgents.ts | n/a | Voice agent session and connection material mutations now have per-user rate limiting through the existing middleware. | remediated |
| R016 | MEDIUM | Weak default config | .env.example | 15 | Example/default reusable secret values can be accidentally deployed. Prefer required env syntax/generator placeholders. | open |
| R017 | LOW | Error disclosure | apps/web/server/routes/voiceAgentsElevenLabsCallback.ts | 20 | External signed callback failures return raw error messages. | open |
| R018 | HIGH | Vulnerable dependency | apps/web/package.json | n/a | `xlsx` remains vulnerable per npm audit and has no available fix. Replace, sandbox, or isolate usage. | open |

## Verdict Rationale

PARTIAL PASS because the immediately actionable repo-resident critical/high items were remediated and targeted tests passed, but residual high-risk items remain. The repo should not be treated as fully production-cleared until exposed credentials are rotated, git history is cleaned, Docker socket mounts are redesigned, and `xlsx` is removed or isolated.

## Skipped / Limits

- `pnpm audit` skipped because `pnpm` is not installed in this environment.
- Python dependency audit skipped because `pip-audit` is not installed.
- No live URL was provided, so runtime HTTP headers/TLS checks were not performed.
- Full gitleaks/trufflehog and Docker image scans were not run locally.
