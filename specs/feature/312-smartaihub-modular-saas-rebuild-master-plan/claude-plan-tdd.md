# Focused test plan — first Modular Core identity slice

## Section 01 — Environment and shared DB boundary

- Config rejects missing/unknown target ID, environment-tenant ID, signing secret and DB binding.
- Development and production environment IDs/scope IDs are distinct; Host and request fields cannot choose them. A dev request cannot present a production Host and continue.
- `pg` factory uses only the provided Hyperdrive connection string, binds parameters, closes the client on success/failure, and does not log the URL.
- Repository SQL uses existing exact table/column names and normalized trim/lower email lookup; membership query filters inactive memberships and tenants. DTOs do not contain password, MFA secret, recovery hashes or private fields.
- Recovery-code update transaction locks the account row and cannot consume the same code twice under concurrent calls. JTI rows store only SHA-256 of the raw random JTI and expire no later than the token.
- A role/grant verification script or catalog query asserts the development role has no write privilege on `worker_jobs`, outbox, credits, transactions, billing, subscriptions, entitlements or Mini App business data and has no CREATE/role/database privilege. Do not select user rows.

## Section 02 — Existing password and MFA compatibility

- Known bcrypt and Argon2 fixtures from published/test vectors verify; wrong passwords, malformed hashes, unsupported parameters and passwordless users fail closed.
- Email normalization exactly trims and lowercases without provider alias rewriting. Unknown-user and wrong-password responses are indistinguishable; dummy verification is called for unknown users.
- Disabled users cannot receive sessions; no account is created, promoted, rehashed or synchronized.
- TOTP WebCrypto implementation passes RFC/legacy SHA-1, six-digit, 30-second and ±1-step vectors. AES-GCM decryption accepts the existing hex `iv:tag:ciphertext` format with the correct test key and rejects altered tag, malformed input and old CBC format.
- MFA login creates a short-lived challenge, and only valid TOTP or one unconsumed bcrypt recovery code completes it. A recovery code is consumed once transactionally; a DB failure does not fall back to TOTP bypass.
- Secrets/passwords/codes are absent from returned errors and console output.

## Section 03 — Hono sessions, membership and request safety

- Login sets a 30-day host-only HttpOnly SameSite=Lax cookie; Secure is required for non-local HTTPS targets; there is no Domain attribute.
- JWT claims bind numeric canonical user ID, JTI, expiry, fixed audience, environment ID and environment-tenant ID. Modified signature, expired token, wrong audience/env/scope/host, disabled user, `sessionRevokedAt` cutoff and revoked JTI are rejected.
- Logout revokes JTI before reporting success; on DB failure the response never says revocation succeeded. Cookie clearing is returned without leaking DB details.
- POST login/2FA/logout rejects missing or mismatched Origin outside approved local test mode. `X-Forwarded-Host`, request `tenantId`, `environmentId` and `NODE_ENV` cannot grant scope.
- `/me` returns the unchanged user ID and only active canonical membership IDs/roles; no membership or inactive tenant produces no access. A user cannot query another tenant by altering request JSON or URL.
- Login rate limiter blocks after configured threshold; production behavior fails closed if the distributed capability is missing.
- `/livez` behavior remains unchanged; unknown wallet/job/admin/payment/mini-app mutation routes do not exist.

## Section 04 — Worker integration and handoff

- Run `corepack pnpm@10.4.1 test:core`, `typecheck:core`, `build:core`, and a local `dev:core` HTTP smoke check on the actual Worker handler. Keep build output/target attribution honest and do not deploy.
- Verify package graph/imports for no Express or `apps/web`, and capture the dry-run bundle size for this slice.
- If the isolated dev credential is available, run catalog/grant checks and a read-only `SELECT current_database(), current_user` identity check; do not read real user rows or test a production target.
- Verify the handoff writer preserves canonical generation/spec digest and records the merged SHA and remaining acceptance gaps; do not mark the parent requirement PASS.
