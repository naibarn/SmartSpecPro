# Implementation plan — first Modular Core identity slice

## Scope and outcome

Implement a small Hono/TypeScript authentication and membership-read vertical slice in `/mnt/SmartSpecDev/projects/smartaihub-platform/apps/saas-core`. It connects to the existing canonical PostgreSQL `smartspec` account store through a least-privilege Modular development credential. It uses existing Legacy account IDs, passwords, MFA material, customer membership and revocation records; it does not import Legacy runtime code.

This plan covers the earliest R1.6 stateful Core work only. It does not implement the full SPEC-312 programme. The canonical `REQ-46847581892C` remains open until full requirements are proven. No public target is deployed or handed over.

## Architecture and contracts

### Environment binding

Create a typed `CoreEnvironment` resolved from trusted bindings. It contains an allowlisted target ID, environment-tenant scope ID, expected host set, separate session-signing and throttle-HMAC secrets, shared account-data decryption secret, PostgreSQL binding, and a typed login-throttle Durable Object namespace. The local source config identifies `modular-debian-dev` and `modular-development`, but local workerd accepts loopback hosts only. `aimarkethubs.com` is not configured or claimed as serving Core until its existing port-3100 replacement is healthy and handover occurs. `modular-cloudflare-prod` / `modular-production` / `smartsihub.com` are recognized types only, with no Wrangler production environment, namespace, or secret. Missing/unknown target, tenant binding, required secret, or throttle binding fails closed for auth routes.

The request Host is checked only against the configured environment's host allowlist and used for origin/cookie safeguards. It never selects the environment or customer tenant. The customer tenant is derived for each authenticated request by joining the verified numeric user ID to active `tenant_users` and active `tenants` rows. `users.currentTenantId` is a hint only and cannot bypass membership.

### PostgreSQL adapter

Use pinned `pg@8.16.3` (or a newer version only if official Worker support is reverified), `nodejs_compat`, and a short-lived `Client`. In local workerd, read `CORE_LOCAL_DATABASE_URL` from an owner-only ignored `apps/saas-core/.dev.vars` file; before connecting, reject any database other than `smartspec` or any role not ending in `_dev`. In a future Cloudflare runtime, require `env.HYPERDRIVE.connectionString` and never fall back to the local DSN. No Hyperdrive resource is created in this slice. Never place credentials in Wrangler JSON or committed files. Inject the query/client factory so tests can assert SQL and parameters without a database.

Keep SQL in small repositories with exact quoted camel-case names for current `users` and `tenants`, and current snake-case columns for `tenant_users` and `revoked_token_jtis`. Select only authentication fields. Perform normalized lookup as `lower(btrim(email)) = lower(btrim($1))`. Membership queries filter `is_active = true` and active customer tenants. Bind all inputs; return narrow DTOs; never return password, MFA, recovery hashes, disabled reason, or internal diagnostics.

The separate `modular_core_dev_auth` role (choose a final name after catalog check) receives only CONNECT/USAGE and needed SELECT column grants on `users`, `tenant_users`, `tenants`, `revoked_token_jtis`, plus only necessary `UPDATE(users.recoveryCodes,lastSignedIn)` and JTI insert/upsert privileges. No DDL, create role/database, password/role changes, wallet/credit, billing, job/outbox, entitlement, or app-business writes. Verify actual grants catalog-only. Do not reuse the Legacy role. Keep the new secret in an owner-only local credential file, ignored by Git, and pass it only through the local Wrangler env variable.

If exact DML privileges cannot be safely established from the current schema, proceed with mocked adapter/tests and leave the live role check pending; never grant table-wide writes as a workaround.

### Password and MFA compatibility

Use a maintained Worker-compatible WASM hash verifier for bcrypt and Argon2 (candidate: pinned `hash-wasm`) only after validating fixtures generated with the existing supported formats. Parse/validate encoded hash structure and supported parameters before invoking memory-hard verification. Never rehash or update a stored password. Unknown-user paths perform a fixed dummy verification so the response does not reveal account existence.

Implement TOTP with WebCrypto HMAC-SHA1 and the existing base32 / six-digit / 30-second / ±1-window contract. Decrypt existing MFA secrets using AES-256-GCM with SHA-256-derived bytes from the narrowly scoped shared canonical account-data key. Reject legacy CBC or malformed ciphertext. Compare recovery-code hashes using bcrypt verification and atomically consume one matching code in a transaction (`SELECT ... FOR UPDATE`, then parameterized `UPDATE`) so two concurrent requests cannot redeem it twice.

Handle `isDisabled`, missing password and enabled MFA. Do not sync/create users, auto-promote admin, call OAuth, run credit-inactivity business policy, send notifications, or write other fields. Update `lastSignedIn` only after successful complete authentication and only if the role can grant that column; otherwise omit this non-authoritative bookkeeping and record the difference.

### Sessions, routes, tenancy and request safety

Expose small Hono endpoints: `POST /v1/core/auth/login`, `POST /v1/core/auth/2fa`, `POST /v1/core/auth/logout`, and `GET /v1/core/me`. Preserve `/livez` as process liveness only. Use `jose` or a reviewed equivalent for HS256 signing/verification with a random JTI, numeric canonical user ID subject, 30-day expiry, fixed audience, environment ID and environment-tenant scope. Use a distinct environment session key. Require Origin to match the request origin on browser mutations; ignore any tenant/environment fields in request JSON.

Issue an HttpOnly, SameSite=Lax, host-only cookie (no Domain). Set Secure for HTTPS/secure local origins; require HTTPS outside local workerd. The production target must require Secure and an explicit host binding. Verify environment/audience/host, expiry, active user, `sessionRevokedAt` cutoff and hashed-JTI revocation on every protected request. Logout commits JTI revocation before success and always clears the browser cookie; database failure returns a generic retryable error and is not described as a completed revoke.

`/me` reads current user status plus all active canonical customer memberships and returns only safe DTO fields. No route accepts a client-provided customer tenant to determine authority. No wallet, payment, entitlement mutation, job/outbox, admin, registration, provider auth or Mini App data routes are present. Since current `worker_jobs` has no environment-tenant column, do not add a job endpoint or write development-only business rows.

Use a strict persistent sliding-window login throttle backed by SQLite Durable Objects. `consume` is serialized inside each atom and enforces 10 attempts per 60 seconds per client IP plus 5 attempts per 15 minutes per normalized account; keys are HMACs derived with a dedicated environment-specific throttle key and use separate per-IP/per-account DO IDs. Store timestamps only, with expired-attempt cleanup. The environment-specific namespace binding prevents cross-environment counter sharing; do not route all requests through one global object or use Cloudflare's approximate Rate Limiting API for this security control. In the Cloudflare runtime, accept only the platform-provided `CF-Connecting-IP`; local workerd uses a fixed `local` key. Unknown deployment mode, missing IP in Cloudflare runtime, missing binding/key, or DO error fails closed on login/2FA. Preserve `/livez` during throttle outages.

## Section sequence and interfaces

### Section 01 — Environment and shared DB boundary

Add `src/config/environment.ts`, `src/db/postgres.ts`, and focused `src/db/*Repository.ts` modules. Define a typed, fail-closed environment binding and injected `PgClientFactory`. Implement the exact read/update operations needed for user lookup, memberships, recovery consumption, last-sign-in if granted, and hashed-JTI revocation. Keep Wrangler development config secret-free and Workers-compatible. No schema migration.

### Section 02 — Existing password and MFA compatibility

Add `src/identity/password.ts`, `src/identity/totp.ts`, and `src/identity/accountAuthentication.ts`. Verify bcrypt and Argon2 known formats; match legacy email normalization, AES-GCM TOTP ciphertext, TOTP window and one-time recovery-code behavior. Keep account and hash writes absent.

### Section 03 — Hono sessions, membership read and safety

Add `src/identity/session.ts`, `src/identity/authRoutes.ts`, `src/tenancy/membershipRoutes.ts`, `src/security/loginThrottle.ts`, and `src/security/loginThrottleDO.ts`. Add only the local DO namespace/class migration in `wrangler.jsonc`. Compose them into the existing Hono app. Enforce per-environment session claims, host-only cookie, current-user state, membership-only authority, strict per-IP/per-account throttling, fail-closed revocation and generic errors. No business effect routes.

### Section 04 — Worker integration and truthful handoff

Add API/repository tests, hash/MFA vectors, environment/host denial tests, revocation/recovery concurrency tests, throttle-window/key-isolation tests, and a local workerd smoke that proves persistent DO binding behavior. Update package pins and lockfile only as needed; verify Hono-only runtime dependency closure and dry-run bundle. If safe, provision/verify the isolated development database role and test only catalog grants/identity, not real user rows. Append implementation evidence to SPEC-312 through the canonical handoff writer. Preserve the existing target map and do not deploy.

## Requirement map and remaining canonical work

| Source | Mapping | This plan's contribution | Remains open |
|---|---|---|---|
| SPEC-312 R1.6, `REQ-46847581892C` | Sections 01–04 | Existing account auth, same canonical user ID, active membership IDs/roles, distinct dev environment binding, Hono/no Express, truthful direct development evidence | Real authorized Legacy-user journey, customer data route parity, actual dev-vs-prod credential/policy proof, SPEC-224 path if claimed, target deployment/UAT |
| SPEC-313 identity/session clauses | Sections 01–03 | Password/MFA compatibility, modular host session, account state, JTI/user revocation and fresh active membership read | WebAuthn, OAuth providers, session history, broad entitlement policy and all downstream Core actions |
| SPEC-315 R1.6 | Sections 01, 03–04 | Distinct runtime environment binding and scoped dev DB role against shared DB; no host-derived customer tenant | Production credential/binding, live cross-environment denial, full environment-target acceptance |
| SPEC-325 | Sections 02–03 | Fail-closed session/MFA/environment checks for this route slice | Broader Agent, device, signed-job, and production security requirements |

## Definition of Done and rollback

Every section has focused tests and is integrated on canonical `main` before the next section. The Core test, package typecheck and dry-run bundle pass; local workerd serves liveness and the new routes with no Express import. Schema/catalog checks prove no DDL and the development role has no financial/job/business data DML. No real account secret/hash/value is placed in test output. Canonical handoff records exact merged source SHA and marks only evidence actually achieved.

Rollback is a source revert of the Core-only commit(s) plus revocation of the Modular development DB role/secret if it was provisioned. It does not remove account data, change Legacy service credentials, alter port 3100, or affect production. Do not perform role retirement until its owning secret/use has been checked; record the revocation action and verifier if it occurs.

## Risk and recovery notes

- Argon2 verification is memory/CPU-heavy; enforce supported PHC parameter bounds, cap login concurrency if local workerd evidence requires it, and report a truthful known gap rather than silently skipping Argon2 accounts.
- The shared key needed to decrypt current TOTP records is distinct from session signing and DB credentials, but the legacy ciphertext format is keyed by `LLM_ENCRYPTION_KEY`. Narrow the DB role to the `users` MFA columns and use the key only for TOTP decrypt; a future at-rest key separation requires a separately designed canonical re-encryption and rollback path.
- Strict per-account throttling can temporarily block legitimate retries for 15 minutes; use identical generic `429` behavior for known and unknown accounts, apply the contract consistently across password and MFA endpoints, and cover parallel requests with DO serialization tests.
- Current canonical schema does not persist environment scope for `worker_jobs`. This plan creates no such records and adds no job route; future writes remain blocked until a canonical environment binding/writer contract exists.
- Real-user credentials and current target readiness are outside automated source tests. Do not use an unknown user's password, weaken checks, or switch either public domain to validate the code.
