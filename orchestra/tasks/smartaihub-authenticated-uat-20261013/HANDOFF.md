# SmartAIHub Authenticated UAT — 2026-10-13

## Current operation

Implement and verify an authenticated development-only Browser UAT path for Codex over SSH. The app runs on Debian behind Cloudflare Tunnel; `smartaihub.app` and `api.smartaihub.app` are verified dev targets. Cloudflare Worker production is not deployed. Use the real HTTPS hostname and the existing session/JWT authorization path; do not add Runner as a prerequisite.

## Ownership and source

- WorkUnit: `WU-SMARTAIHUB-AUTHENTICATED-UAT`
- Owner: `/root` (current Codex task)
- Workspace: `/home/dev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/authenticated-uat`
- Branch: `codex/smarthub-authenticated-uat`
- Source Main SHA at start: `90203a06038e6df6dd33496ef54f0aa9839d149a`
- Current source commit: `37463accd` (full SHA recorded after commit)
- Intended promotion: normal protected PR from `codex/smarthub-authenticated-uat` to `main`; PR number pending.

## Last completed checkpoint

- Added a local-only UAT session broker using the existing SmartAIHub session signer and JTI revocation store. It requires explicit opt-in and a local `smartspec` database, and rejects `NODE_ENV=production`.
- Added isolated `.invalid` owner, admin, member, and restricted-user identities and separate test tenants. Each Playwright fixture issues and revokes its short-lived session.
- Verified the tunnel targets and HTTPS/TLS without disabling certificate validation or changing public DNS. Browser traffic uses `https://smartaihub.app`; Express validates the browser session and forwards a short-lived, tenant-scoped JWT to the local Python backend.
- Routed only OpenAI-compatible API paths to Python `/v1`; other Python API paths retain `/api/v1`. The Python backend then calls the SmartAIHub Gateway, which routes to the configured provider.
- Fixed integer user-ID lookup, fail-closed proxy-token auth, bearer-only CSRF exemption for the OpenAI-compatible router, and tenant-scoped credit settlement.
- Rotated the local Debian development JWT secret in the web and Python env files without logging values; restarted dependent local services. Earlier local sessions were invalidated. No production secret or deployment exists.
- Latest full Playwright UAT: `apps/web/test-results/smarthub-uat/45d0c1a4-f0dd-466f-8522-2ce46610d8dd` — 6/6 passed; includes screenshots, sanitized traces, browser network evidence, HTTPS route evidence, and Gateway integration receipt. No Worker Production is deployed; Debian `NODE_ENV=production` simulation remains distinct from a production deployment. (owner dashboard, admin dashboard, member/restricted tenant scope, forged-header rejection, real Gateway/provider call). All five session records show revoked; browser direct-provider attempts are empty; all five trace archives passed the unredacted-token scan.
- Two independent Codex UAT runs executed simultaneously with distinct run IDs and tenant/identity scopes: both navigation suites passed 5/5 (`codexparallelA`, `codexparallelB`). An initial prefix-derived run key collided; switching to a SHA-256 run suffix removed the collision and the concurrent retest passed.
- Gateway receipt confirms browser `/api/v1/chat/completions` → SmartAIHub Gateway → OpenRouter (`openai/gpt-4.1-mini`), 20 provider tokens, `$0.0000128` provider cost, and tenant `tenant-codex-uat` accounting.
- Focused Vitest: 8 passed. Focused Python tests (`test_credit_service.py`, `test_openai_compat.py`, `test_csrf_middleware.py`): 43 passed. Nginx config test and reload passed. `git diff --check` passed.

## Remaining scope

- Promote this owned source checkpoint through the normal protected GitHub path, then bind post-integration evidence to the merged SHA.
- The existing SPEC-224 and SPEC-271 canonical HandOffs remain unchanged. Their open Runner/control-plane authority and durable receipt requirements are separate from this direct-Codex dev UAT slice; this handoff does not claim those SPECs complete.
- Reconcile any post-integration check failures against the new canonical SHA. Do not run full repository typecheck/build in this shared implementation session.
