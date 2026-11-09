# SPEC-312 — Sections 03–04 implementation and runtime proof

**Recorded:** 2026-11-09 20:28 UTC (2026-11-10 Asia/Bangkok)
**Source repository:** `smartaihub-platform`, canonical `main`
**Source SHA:** `bff6a383de7694ea0675779a69a871368f56b484`
**Plan amendment:** SmartSpecPro `main` at `d5016c217aaf32f88d7ed3cbe791f1ce7bb398c6`

## Section 03 — Hono authentication, session, and membership

- Added Hono login, MFA, logout, and `/v1/core/me` routes. Sessions bind to the verified account ID, host, audience, target and environment tenant. Memberships are read from the existing canonical `tenant_users`/`tenants` relations and are not selected by request data.
- Added strict login throttling through the local SQLite Durable Object. Each policy has 256 fixed shards; full environment-scoped HMAC digests are logical keys. IP checks run before request-body/token parsing, and account checks run after resolving a valid login address or MFA challenge. Invalid MFA tokens therefore still consume the IP limit.
- Wrangler is pinned to `4.159.0`, Workers types to `5.20261109.1`, and the local compatibility date is `2026-11-09`, supported by the bundled Workerd `1.20261109.1`. The original local date of `2026-11-10` failed Workerd startup as unsupported; no date is silently assumed by a failed smoke.
- Added synthetic Hono tests for environment/host/origin boundaries, session cookie flags, login and MFA handling, one-time recovery/JTI behavior, revocation, disabled users, membership projection, generic failures, and throttle ordering.

## Section 04 — verification evidence

Commands run against integrated source SHA `bff6a383de7694ea0675779a69a871368f56b484`:

- `corepack pnpm@10.4.1 run typecheck:core` — PASS.
- `corepack pnpm@10.4.1 run test:core` — PASS, 10 files / 58 tests.
- `corepack pnpm@10.4.1 run build:core` — PASS, Wrangler dry-run only, 385.24 KiB / 91.11 KiB gzip. No Cloudflare deployment occurred.
- `corepack pnpm@10.4.1 --filter @smartaihub/saas-core list --depth 1` plus source/bundle import scan — Core runtime has Hono, `pg`, `jose`, and `hash-wasm`; no Express or `apps/web` runtime import. Wrangler output includes only the local `LOGIN_THROTTLE` binding and `modular-debian-dev` / `modular-development` vars.
- Local `wrangler dev --local` on loopback — `/livez` returned 200. With synthetic invalid credentials, five account attempts returned 401 and the sixth returned 429 across a Workerd restart (`401,401,401` before restart; `401,401,429` after). Ten IP attempts were allowed and the eleventh was throttled. Twenty concurrent attempts from the same local IP returned ten 401 and ten 429. No real account credentials or account values were used.
- Read-only PostgreSQL catalog checks — database `smartspec`, role `modular_core_auth_dev`; role is not superuser and cannot create databases or schemas. Effective column grants cover the account/auth fields, active membership fields, tenant name/state, and revoked JTI lookup. UPDATE is limited to `users.recoveryCodes`; INSERT is limited to `revoked_token_jtis.jti_hash` and `expires_at`; password UPDATE and JTI DELETE are denied. The JTI hash is the table primary key. Exact account, membership, and revoked-JTI query shapes prepared by Core returned zero rows under this role. No user rows, hashes, credentials, or schema objects were selected or changed.
- `apps/saas-core/.dev.vars` is ignored and mode `0600`; secret values were not printed or copied into this evidence.

## Deliberately unclaimed acceptance

`REQ-46847581892C` remains **PARTIAL / OPEN**. No existing user row or password hash was inspected, and no real-user login, authorized customer-data access, UAT, production Worker binding/CPU budget, `smartsihub.com` activation, or target handover was tested. Direct Codex work in the canonical source repository was used; SPEC-224 was not used and no SPEC-224 receipt is claimed. Database DDL, DNS changes, Cloudflare resource creation/deployment, and port-3100 handover did not occur. The current legacy `smartaihub.app` and healthy port-3100 service remain untouched.
