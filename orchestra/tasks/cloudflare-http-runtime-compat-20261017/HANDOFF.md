# Cloudflare HTTP Runtime Compatibility Handoff

Status: implementation checkpoint; production/staging acceptance remains open.

Review PR: https://github.com/naibarn/SmartSpecPro/pull/1040
Source branch: `codex/cloudflare-http-runtime-20261017` (rebased on `origin/main` at `e6e4253d75ea0b7c5319420d80d280cda0a66961`).

## Completed in this checkpoint

- Added an explicit API route manifest. `/healthz` and `/readyz` GET/HEAD are Worker-native (`/readyz` reports Worker bindings/job wiring only); API/auth/OAuth/tRPC/upload paths use the existing origin; HTTP paths that require Node state stay origin-owned; WebSocket and unknown routes fail closed.
- Wired the manifest into the Cloudflare Worker. It imports no Express app or native background-worker graph.
- Added a pinned HTTPS origin proxy preserving application headers, streamed request/response bodies, redirects, cookies, CSRF, and auth headers. It replaces caller-controlled forwarded/internal trust headers and validates private origin host configuration.
- Added origin-side constant-time validation for the Worker attestation header while preserving direct Linux ingress.
- Updated the existing Hyperdrive postgres.js options to `prepare: true`, `fetch_types: false`, `max: 5` in line with current Cloudflare guidance.
- Updated Wrangler compatibility dates to 2026-10-17; no production route, secret, database, or Cloudflare account was changed.

## Evidence from this checkpoint

- Cloudflare package Vitest: 10 files, 65 tests passed.
- Cloudflare package TypeScript build passed.
- Wrangler 4.151.1 dry-run bundle passed for both default and production config.
- Wrangler local runtime: `/healthz` 200; `/readyz` 503 with disabled/unbound bindings; API/auth and SSE proxy failed closed with 503 while origin bindings were absent; `/socket.io`, unknown paths, and POST `/healthz` returned 501.
- Origin-attestation helper passed direct Node assertions. Its Vitest file was not run because web dependencies are not installed in this isolated checkout.
- No PostgreSQL server, restricted staging role, Cloudflare credentials, or browser staging session was available; no database or production credential was accessed.
- PR CI first found two existing Cloudflare local-contract setup defects: the workflow repeated the pnpm version already pinned by root `packageManager`, and the package test script hard-coded a root `node_modules/vitest` path. Both were corrected to use the workspace package manager pin and local Vitest binary; CI rerun is pending.

## Remaining acceptance work

- Run the web-origin middleware test and Linux Express runtime smoke on an admitted web-package checkout.
- Deploy a non-production Worker with staging-only `AUTH_ORIGIN*` values and run real same-origin login/logout, cookie, CSRF, OAuth callback, refresh/revocation, and two-tenant isolation browser journeys.
- Run postgres.js + Drizzle against a disposable PostgreSQL or restricted staging role through Hyperdrive. Current unit coverage proves option selection, not database protocol/transaction behavior.
- Validate staging custom-domain routes, static assets, rollback, streaming, and direct-origin host forwarding. Keep `/ws` and `/socket.io` on Linux until a WebSocket bridge is independently verified.
- Select any additional Worker-native API route only after its existing authority and tenant checks are exercised through the shared app context. tRPC and broad Express business logic remain proxied.

## Safety and next action

Do not attach a broad production hostname route or enable Cloudflare activation in this checkpoint. The production Wrangler template continues to route only its existing runtime/SPEC-260 patterns. Next action: complete normal PR review/integration, then provision an isolated staging origin and restricted DB role through the owning authorization path; record all acceptance evidence against the merged SHA. Production cutover remains NO-GO until staging, tenant isolation, DB, and rollback evidence pass.
