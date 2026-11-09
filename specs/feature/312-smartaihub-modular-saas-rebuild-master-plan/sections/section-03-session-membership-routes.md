# Section 03 — Hono session and membership routes

## Objective and requirement mapping

Compose the Core account verifier into a small Hono API that issues modular-host-only sessions and reads the caller's active canonical customer memberships. Customer tenancy remains independent from the configured development environment tenant.

**Canonical requirement:** `REQ-46847581892C` (partial implementation evidence only).

## Owned scope

Write scope in `smartaihub-platform/apps/saas-core`:

- `src/identity/session.ts`
- `src/identity/authRoutes.ts`
- `src/security/loginThrottle.ts`
- `src/security/loginThrottleDO.ts`
- `apps/saas-core/wrangler.jsonc` local Durable Object class binding/migration only
- `src/tenancy/**`
- `src/security/**`
- app composition and focused API tests.

## API behavior

- `POST /v1/core/auth/login`: rate-limited email/password verification; returns success or a short-lived MFA challenge. Does not leak account existence.
- `POST /v1/core/auth/2fa`: validates the environment-bound pending challenge and TOTP or one-time recovery code, then issues the session.
- `POST /v1/core/auth/logout`: verify session, persist hashed-JTI revocation, clear cookie; never report a failed revocation as success.
- `GET /v1/core/me`: verify the current session and read active membership roles from canonical `tenant_users`/`tenants`; return safe user and membership DTOs only.
- Preserve `GET /livez` exactly as a liveness check. Do not add business-effect routes.

## Security contract

- Session claims: numeric canonical user ID, JTI, `iat`, 30-day `exp`, fixed audience, explicit environment ID and environment-tenant scope. HMAC key is separate for each environment.
- Verify signature, expiry, audience, configured environment/scope, approved host, `users.isDisabled`, `users.sessionRevokedAt`, and active JTI revocation on each protected request.
- Cookie has no Domain attribute, is HttpOnly and SameSite=Lax, and is Secure on HTTPS/secure origins. Non-local deployments require HTTPS.
- Login/2FA/logout require same-origin browser requests. Ignore request-provided tenant/environment fields and untrusted forwarded-host headers.
- `/me` always resolves memberships from `session.sub`; a current-tenant hint or hostname does not grant access.
- Login and 2FA use a strict sliding-window Durable Object throttle: 10 requests/60 seconds per trusted client IP and 5/15 minutes per normalized account. Apply the IP bucket before parsing the login/MFA body or token; apply the account bucket after resolving a valid login email or MFA challenge. Use a fixed set of 256 shards per policy, selected by the first byte of an environment-specific HMAC; pass the full HMAC digest as the logical bucket key. SQLite rows contain policy, digest, and timestamp only, with indexed expiry cleanup across each shard. This prevents attacker-controlled email/IP values from creating unbounded objects while preserving independent strict counters. The Cloudflare runtime accepts only `CF-Connecting-IP`; local workerd uses one fixed local key. Never use one global DO, approximate Rate Limiting binding, or arbitrary forwarded IP header for this control. Throttle binding/key/identity/storage errors fail closed for auth routes while `/livez` remains healthy.

## Prerequisites and acceptance

Sections 01–02 are complete. Hono tests prove cookies and claims, host/audience/environment denial, expiry, disabled-account/revocation checks, current membership filtering, exact account/membership IDs, generic errors, origin validation, strict throttle windows/key scoping/fail-closed behavior and absence of wallet/job/admin routes. A local workerd smoke exercises the actual DO binding. A request with another tenant ID cannot change `/me` or select another tenant.

## Exposure, fallback and rollback

Local worker only. Do not route `aimarkethubs.com` or `smartsihub.com`, and do not replace the current port-3100 process. Preserve existing liveness if auth dependencies are unavailable; auth routes fail closed. Reverting this section restores the liveness-only Worker.

## Remaining acceptance

These API tests do not prove real authorized-user login, full customer-data parity, production credentials or actual environment isolation. Keep those parent SPEC requirements open.
