# Risk Register
Last updated: 2026-05-08T01:40:00Z
Session: Defensive security review of current SmartSpecPro codebase
Verdict: FAIL

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R001 | CRITICAL | Secret exposure | nginx/ssl/smartaihub.app.key | 1 | Tracked TLS private key is present in repository. Rotate/revoke certificate/key and remove from repo/history. | open |
| R002 | CRITICAL | Secret exposure | smartspecpro_backup.sql | 4329 | Tracked SQL backup contains an API-key-like value. Rotate affected key(s), remove backup from repo/history, and ignore SQL backups. | open |
| R003 | CRITICAL | Vulnerable dependencies | package-lock.json | n/a | `npm audit --omit=dev` reports 2 critical and 35 high production vulnerabilities, including `protobufjs`; several direct high-risk packages also affected. | open |
| R004 | HIGH | Webhook auth fail-open | python-backend/app/api/v1/kie_webhooks.py | 48 | Kie webhook validates HMAC only when `KIE_AI_WEBHOOK_SECRET` is configured, otherwise logs and accepts callback. | open |
| R005 | HIGH | Webhook auth fail-open | python-backend/app/api/v1/media_generation.py | 1881 | Legacy Kie callback accepts unsigned payloads when webhook secret is missing. | open |
| R006 | HIGH | SSRF via redirect | python-backend/app/services/media_pipeline.py | 62 | Provider result URL is validated before fetch, but `follow_redirects=True` can follow to an unvalidated internal/private URL. | open |
| R007 | HIGH | CI supply chain | .github/workflows/deploy-production.yml | 39 | Third-party GitHub Actions use mutable refs such as `@main`/`@master`. | open |
| R008 | HIGH | CI supply chain | .github/workflows/deploy-staging.yml | 34 | Third-party GitHub Actions use mutable refs such as `@main`/`@master`. | open |
| R009 | HIGH | Container control | docker-compose.opensandbox.yml | 27 | Docker socket is mounted into a service; compromise can become host/container control. | open |
| R010 | HIGH | Container control | docker-compose.nginx.yml | 181 | Docker socket is mounted into a service; compromise can become host/container control. | open |
| R011 | MEDIUM | Sensitive logging/data retention | python-backend/app/api/v1/media_generation.py | 1900 | Legacy callback logs full body, which can include provider URLs, prompts, or metadata. | open |
| R012 | MEDIUM | Sensitive payload retention | python-backend/app/api/v1/kie_webhooks.py | 123 | Raw webhook payload is stored in result data; needs redaction/access review. | open |
| R013 | MEDIUM | CSP weakness | apps/web/server/_core/index.ts | 235 | Production CSP allows `unsafe-inline` and `unsafe-eval`, reducing XSS containment. | open |
| R014 | MEDIUM | REST auth wiring review | apps/web/server/routes/voiceGateway.ts | 94 | `/api/voice/session` expects `req.user`, but mount point does not show explicit auth middleware. Likely broken auth path; verify. | open |
| R015 | MEDIUM | Missing abuse control review | apps/web/server/routers/voiceAgents.ts | 119 | Voice agent session/connection mutations appear protected but not per-user rate-limited. | open |
| R016 | MEDIUM | Weak default config | .env.example | 15 | Example/default reusable secret values can be accidentally deployed. Prefer required env syntax/generator placeholders. | open |
| R017 | LOW | Error disclosure | apps/web/server/routes/voiceAgentsElevenLabsCallback.ts | 20 | External signed callback failures return raw error messages. | open |

## Verdict Rationale

FAIL because CRITICAL findings are present. Per Orchestra security threshold policy,
critical findings block completion until remediated or explicitly accepted as risk.

## Skipped / Limits

- `pnpm audit` skipped because `pnpm` is not installed in this environment.
- Python dependency audit skipped because `pip-audit` is not installed.
- No live URL was provided, so runtime HTTP headers/TLS checks were not performed.
- Full gitleaks/trufflehog and Docker image scans were not run locally.
