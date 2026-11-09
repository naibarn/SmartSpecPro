# SPEC-312 — Current Core source and verification proof

**Recorded:** 2026-11-10 (Asia/Bangkok)
**Source repository:** `smartaihub-platform`, canonical `main`
**Source SHA:** `5aa98dab9ff2bfac22006b3a1ef89ed08f46c739`
**Canonical plan base reviewed:** SmartSpecPro `main` at `0e802803995d7893afc1bdc1bdc7030f4cbd755f`

## Integrated implementation

The four planned sections are implemented and integrated on `smartaihub-platform/main`:

1. Target-checked local/Cloudflare environment contracts and a least-privilege PostgreSQL adapter for the existing `smartspec` database.
2. Worker-compatible bcrypt/Argon2 verification, legacy AES-GCM TOTP decryption and transactional one-time recovery-code consumption.
3. Hono login/MFA/logout/`/me` routes, host/environment/audience-bound sessions, active canonical membership reads, and fixed-shard SQLite Durable Object throttling.
4. Local Worker/runtime proof, bundle/import review and canonical handoff evidence.

The last source fix stores one-time MFA challenge replay markers in a separate indexed Durable Object table on fixed account shards, deletes expired markers during shard activity, and uses SQLite `RETURNING` to detect successful one-time insertion. Session logout revocation remains in PostgreSQL `revoked_token_jtis`; no database schema or grant was changed.

## Verification at the exact source SHA

- `corepack pnpm@10.4.1 run typecheck:core` — PASS.
- `corepack pnpm@10.4.1 run test:core` — PASS, 10 files / 61 tests.
- `corepack pnpm@10.4.1 run build:core` — PASS, Wrangler dry-run only; 387.18 KiB total / 91.46 KiB gzip.
- Local Workerd smoke — `/livez` 200; synthetic invalid requests hit the configured IP throttle after the limit and the limit persisted across restart.
- Direct local Durable Object smoke — MFA challenge reservation succeeds once, rejects replay, cleans expired markers on later shard activity, and rejects replay after restart when shared persistence is used.
- Runtime import/config review — Hono Worker entrypoint; no Express server or `apps/web` import. Wrangler config has only local bindings, `workers_dev:false`, and no production deployment environment.
- Read-only PostgreSQL identity/grant and query-shape evidence remains in `section-03-and-04-proof-20261110.md`. That audit observed `smartspec` and `modular_core_auth_dev`, did not read account rows, and confirmed no DDL or broad business-data grants. Source commits after that catalog review did not change DB adapter SQL, schema or grants. `.dev.vars` remains ignored with mode `0600`; no secret value is included here.
- The final ten distinct gap-review passes are recorded in `final-10-gap-review-passes-20261110.md`.

## Target and acceptance limits

- `aimarkethubs.com` remains unavailable for Core traffic; its registered current service and port 3100 were not changed. Core's local dev runtime uses loopback/port 3200.
- `smartsihub.com` remains registered but inactive. There was no Cloudflare deployment, DNS/resource creation, production secret provisioning or handover.
- No existing user password/hash was inspected and no real-user login, authorized customer-data UAT or production isolation test was performed.
- No numeric speed objective or same-database Legacy/Core latency benchmark exists. Do not claim the new system is faster based on Hono or bundle size.
- Expired session-JTI rows have no cleanup owner in the current runtime. Core intentionally has no `DELETE` privilege; a separately bounded cleanup authority is required before high-volume production.
- `REQ-46847581892C` remains **PARTIAL / OPEN**. These implementation checks do not establish complete parent-SPEC acceptance.
