# SmartAIHub Availability Recovery Plan

**Date:** 2026-09-28
**Goal:** Restore user-facing Web/API service quickly while isolating the authentication migration risk to the auth paths that need it. Keep unmigrated database and queue responsibilities running on their current owners.

## Decision

The current outage is not required by cache, Vectorize, database, or queue migration. The Cloudflare cache/Vectorize work and the G2 auth-state transition were allowed to become one application-wide maintenance gate. That stopped all Web/API traffic while unrelated queue and database services remained active.

Treat service availability and migration completion as separate states. Do not wait for all Redis/BullMQ retirement, all Cloudflare job bindings, cache acceptance evidence, or job-family migrations to restore the application. Keep those migrations independently gated.

## Auth replacement map

| Existing Redis responsibility | New authority in the current implementation | Current recovery concern |
|---|---|---|
| Revoked JWT/session JTIs | PostgreSQL `revoked_token_jtis` (SHA-256 JTI digest and expiry) | Legacy Redis-only revocations must remain denied during the transition; use the Redis compatibility bridge, then reconcile from a fresh snapshot. |
| Login failure counters/lockouts | PostgreSQL `auth_login_failure_counters` | Keep this PostgreSQL path and fail closed for the login decision if PostgreSQL is unavailable. |
| OAuth device authorization codes | PostgreSQL `oauth_device_authorizations` | Conditional state transitions and one-time consumption remain in PostgreSQL. |
| Runner/Worker pairing handshakes | PostgreSQL `ephemeral_authorization_sessions`, with AES-256-GCM session payloads | Production keyring is missing in the last audit; gate these pairing flows individually until keyring parity is verified. |

PostgreSQL remains the auth source of truth and is still the existing database, not a database migration to Cloudflare. Durable Objects are a future coordination option in Spec 232; they are not the current replacement authority. Redis remains active for unrelated responsibilities such as Voice, Pub/Sub, and job families not yet migrated.

## Evidence and limits

- A live check on 2026-09-28 returned HTTP 502 for `smartaihub.app` and `api.smartaihub.app`.
- The Production host snapshot from 2026-09-28 shows Cloudflare Tunnel still points the Web/API domains to localhost ports 3000/8000, with no listeners. The Web, Backend, and Web watchdog units are system-masked/inactive.
- `runtime.smartaihub.app/healthz` returns 200, but `/readyz` returns 503 with job activation disabled and the job bindings/handler absent. This Worker is not the Web application or API.
- The last recorded Redis/PostgreSQL JTI mismatch is from 2026-09-26 (270 active Redis-only and one PostgreSQL-only at the 14:35 UTC snapshot; earlier snapshots differed). These counts are historical and must not be reused as current import counts.
- The browser email/password path reads the user/password from PostgreSQL, verifies bcrypt, and issues a cookie signed with `JWT_SECRET`; cookie requests reload the user from PostgreSQL and check `sessionRevokedAt`. This path does not call external OAuth or Redis JTI lookup.
- `JTI_REDIS_ROLLBACK_MIRROR=enabled` is needed for bearer-token routes while old JTI revocations may still exist only in Redis. It checks PostgreSQL first, checks Redis on a PostgreSQL miss, writes new revocations to Redis before PostgreSQL, and denies if either required store errors. It is not a prerequisite for the email/password cookie login itself.
- `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID` are separate from ordinary JWT validation. Their absence blocks encrypted Runner/Worker pairing state; it is not by itself a reason to stop all Web traffic.

## Recovery waves

### R0 — Refresh the smallest required production facts

**Actions**

1. Confirm Production host/tunnel identity and enumerate every live ingress origin and Web/API replica. Record deployed revision and the exact EnvironmentFile/secret versions by identifier only; do not print secret values.
2. Check current Web/Backend unit state, watchdog state, listeners, and recent service logs. Capture current public Web/API health.
3. Read current PostgreSQL and token-Redis health, and run the existing read-only JTI digest/expiry comparison. Keep this a snapshot; do not apply the importer or delete either store.
4. Confirm that the candidate Web release contains the compatibility bridge and that it will use the exact same token-revocation Redis target and prefix as the current revocation records.

**Exit:** one verified serving origin/revision is selected; no unknown origin can continue receiving authenticated traffic during the canary; the current state snapshot is retained with its timestamp.

### R1 — Restore Web first for email/password Admin login

**Fast path:** restore the existing Web origin first. The Admin login flow is local email/password plus PostgreSQL and the app's `JWT_SECRET`; it does not require external OAuth, Cloudflare job activation, the Python Backend, or the auth-session keyring. Confirm the existing artifact, database connection, cookie domain/HTTPS settings, `ADMIN_EMAIL`, and rollback before starting it.

**Actions**

1. Restore the Web service as a single canary on the existing Web origin and verify process health, PostgreSQL reads, static assets, and public login endpoint. This gets the Admin surface reachable without waiting for queue or Cloudflare runtime work.
2. Sign in using the designated Admin email/password account; verify the cookie is issued and a protected Admin tRPC query succeeds through the normal browser-cookie path.
3. The same Web process also accepts bearer authentication. Before allowing bearer-authenticated requests broadly, provision `JTI_REDIS_ROLLBACK_MIRROR=enabled` on every serving Web instance, using the exact token-revocation Redis target/prefix, or keep bearer auth behind a narrowly scoped temporary restriction. This protects Redis-only revocations; it does not gate the email/password cookie login.
4. Bring up the Python Backend separately after its own SQL, health, and auth checks pass. It is not needed for the Admin login or Admin tRPC settings.
5. Before broad bearer-authenticated traffic, run the full auth matrix in isolated staging with synthetic bounded-expiry records: PostgreSQL-only and Redis-only revoked JTIs are denied; new revocation writes Redis-first then PostgreSQL; either store outage fails closed. Never seed synthetic auth records in Production.
6. In Production, verify health, a designated operator's email/password login, a protected Admin query, and normal logout. Use sanitized config/telemetry only; do not expose JTI values, token data, or customer identity in logs/evidence.
7. Expand traffic only after the relevant cookie-session and bearer-auth controls are verified. Keep an immediate route rollback to the maintenance response if a check fails.

**Do not wait for:** production JTI import, durable-backup approval for that import, Cloudflare Queues/Workflows/Containers, complete Redis retirement, R2 API permissions, or unrelated media-worker recovery. No destructive data operation is part of this wave.

**Stop conditions:** email/password cookie login does not verify against PostgreSQL; the cookie cannot authenticate a protected Admin query; any bearer-authenticated route is exposed without the bridge while Redis-only revocations may remain; revoked-token checks fail open; database or Redis errors turn a bearer auth decision into allow; or the candidate cannot be rolled back quickly.

### R2 — Keep only keyring-dependent auth features gated

1. Provision the approved auth-session keyring to every Web instance via the production secret manager, independently from `JWT_SECRET`; verify key IDs and secret version identifiers only.
2. Until keyring parity is confirmed, keep Runner/Worker pairing and other encrypted ephemeral-session flows unavailable through their own feature/route boundary. Keep ordinary Web/API journeys available under R1.
3. Verify device authorization and login-counter behavior against PostgreSQL independently; fail closed only for the affected operation if its authoritative store is unavailable.

### R3 — Reconcile G2 after service is available

1. Establish an approved durable backup and isolated restore proof before any Production import.
2. Identify and fence every auth writer, then take a fresh Redis/PostgreSQL snapshot. Import only from the fresh snapshot using the existing guarded importer; preserve PostgreSQL-only revocations.
3. Require two stable scans with no Redis-only active revocations, verify all auth callers and replicas, then remove the compatibility bridge only after an approved rollback window and zero Redis G2 caller telemetry.

This wave does not recover queued jobs or old media work; those records are outside the G2 auth reconciliation.

### R4 — Continue Cloudflare migration without holding availability hostage

- Keep PostgreSQL as the current database authority. Move it only under the separate database/Hyperdrive cutover plan.
- Keep each queue family on its current worker/Redis/Celery owner until that family passes its own canary, recovery, and rollback criteria. Do not switch every job to the Cloudflare runtime at once.
- Keep `CLOUDFLARE_ACTIVATION=disabled` while the runtime is missing job bindings/handler. Its readiness does not govern the existing Web/API origin.
- Treat cache and Vectorize status independently; neither is a prerequisite to opening unrelated application paths.

## Completion criteria

1. `smartaihub.app` and `api.smartaihub.app` return healthy responses through the intended ingress.
2. A representative authenticated user journey succeeds.
3. PostgreSQL-only and Redis-only revoked tokens are both denied by the serving release; store outages fail closed for auth.
4. Keyring-dependent pairing remains individually gated until every serving instance has compatible key material.
5. Existing database and unmigrated job families continue under their present authority; Cloudflare queue activation remains off until its own acceptance criteria pass.
6. The recovery record distinguishes `APPLICATION_AVAILABLE`, `AUTH_COMPAT_BRIDGE_ACTIVE`, `G2_RECONCILED`, and `CLOUDFLARE_MIGRATION_COMPLETE`. One status must not stand in for another.

## Operational boundary

### Execution status — 2026-09-28

- `APPLICATION_AVAILABLE` for the Web origin: `smartspec-web.service` is unmasked, active, enabled, and serves the public `smartaihub.app` origin. It runs from a separate worktree based on commit `54e69ffaa69098e3d83efe540baa760c0fa7d9f5`, with only the scoped Cloudflare center files overlaid; the original dirty checkout was preserved.
- `AUTH_COMPAT_BRIDGE_ACTIVE`: `JTI_REDIS_ROLLBACK_MIRROR=enabled` is set only on the Web unit. A fresh read-only scan found 211 active Redis-only revocations and one PostgreSQL-only revocation; no records were imported, deleted, or changed. The bridge reads the existing `revoked:` keys and fails closed on store errors.
- Public Web, login page, health endpoint, and built JS asset returned HTTP 200. A synthetic nonexistent account reached `auth.login` and returned the expected HTTP 401. PostgreSQL contains one password-backed Admin account that is not disabled and does not require 2FA. A successful sign-in with the operator's real password and a protected Admin query still need operator confirmation.
- The Cloudflare Credential Center is deployed at Admin Settings → Infrastructure → Cloudflare. It manages Audit/Deployment token profiles, documents permissions, probes read access, synchronizes the shared Account ID and existing Vectorize token setting, and embeds the existing R2 Storage Settings editor. The old runtime page is labeled as a Worker deployment/readiness guide.
- A live read-only probe using the existing Vectorize credential passed Workers, KV, Queues, Workflows, Tunnels, Vectorize, and Worker Routes. It reported missing permission for dispatch namespaces, Hyperdrive, Load Balancer pools, R2 bucket administration, DNS, and zone Load Balancers. The Containers endpoint returned HTTP 400 and needs separate endpoint/availability review. `CLOUDFLARE_RUNTIME_TOKEN` is missing; runtime values remain deployment-environment-owned and the UI explains that boundary.
- The unauthenticated credential-center API check returned HTTP 403 as expected from its admin-only guard. The operator has confirmed successful Web login; this execution context did not have the Admin browser session for an authenticated query.
- Focused auth/JTI tests passed (19/19), and the clean production build passed. The separate `auth.logout.test.ts` suite could not load because the checked-in Vitest config provides a `CONTROL_PLANE_API_KEY` shorter than the application's 24-character minimum; that test setup was not changed as part of recovery.
- Python Backend and Web watchdog remain masked/inactive. No Redis-to-PostgreSQL import, Cloudflare resource/binding write, or queued-job recovery was performed. `G2_RECONCILED` and `CLOUDFLARE_MIGRATION_COMPLETE` remain open.

The Web unit uses `/home/dev/smartspec-web-recovery` so the production process does not execute the dirty main checkout. Keep that worktree and its dependency symlinks in place while this unit is active. The recovery unit and its systemd drop-in are recorded in `docs/incidents/2026-09-28-web-auth-availability-recovery.md`.
