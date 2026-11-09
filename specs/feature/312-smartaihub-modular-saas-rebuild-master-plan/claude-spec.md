# First Modular Core identity slice (SPEC-312 R1.6)

## Purpose

Implement the first stateful Core capability in the canonical `smartaihub-platform` repository: allow an existing SmartAIHub account to authenticate through a small Hono Worker, resolve the same canonical active customer memberships, and issue a modular-host-only session. The Core uses the existing PostgreSQL `smartspec` database and preserves account and customer IDs. Development is bound to its own environment tenant, separate from production and customer tenancy.

## Accepted constraints

- Canonical code source: `smartaihub-platform`, `main`; development may be performed directly by Codex/Claude. SPEC-224 is optional and must only be cited when actually used.
- Runtime: TypeScript + Hono + Workers/workerd. No Express server, legacy package imports, Node/Python service proxy, replacement auth table, database clone, DDL, user seeding or password rehash.
- Shared data: PostgreSQL `smartspec` remains the sole account and customer membership authority. A modular session does not transfer from `smartaihub.app`; browser cookies are host-only. Existing IDs, hashes, disabled state, MFA, session invalidation and membership roles are preserved.
- Environment boundary: bind explicit `modular-debian-dev` / `modular-development` or `modular-cloudflare-prod` / `modular-production` values from trusted runtime configuration. Do not infer scope from hostname, `NODE_ENV`, customer `tenantId`, or request fields. Only local/development configuration is added in this slice; production stays unconfigured.
- Release boundary: do not deploy, change DNS, create Cloudflare resources, replace the existing port-3100 service, or activate `smartsihub.com`. The registered targets remain unavailable/inactive until their existing authorities say otherwise.

## Observable behavior

1. A normalized email and password authenticate against the existing `users` row. Existing bcrypt and Argon2 hash formats are verified without changing them. Passwordless/OAuth-only and disabled users do not receive sessions, and error responses do not reveal whether an email exists.
2. MFA-enabled users receive a short-lived, environment/audience-bound challenge. A valid existing TOTP code completes login; a valid hashed recovery code is consumed exactly once with a transactional update. Existing encrypted TOTP values use the verified legacy AES-GCM format and required account-data key. Invalid or unsupported ciphertext fails closed.
3. Successful login issues a 30-day HMAC-signed modular session with the existing numeric account ID as subject, random JTI, `iat`/`exp`, modular environment ID and matching environment tenant scope. It is HttpOnly, SameSite=Lax, Secure on secure origins and host-only (no Domain attribute). Session verification rejects wrong environment, audience, host, expiry, disabled accounts, `sessionRevokedAt` and active JTI revocations.
4. Logout revokes the session JTI in the existing canonical hashed-JTI store before clearing the cookie. A revocation-store failure is not reported as a successful server-side revocation.
5. `GET /v1/core/me` resolves the user from the verified session and returns only safe account fields plus active memberships read from `tenant_users`/`tenants`. It preserves canonical customer-tenant IDs and roles; user-supplied or hostname-derived tenant IDs are ignored.
6. Login is protected by a bounded rate limit compatible with the local Worker path. Production fails closed if a production rate-limit capability is absent.
7. The local Worker serves `/livez`, login, session, logout and `/v1/core/me` through Hono. Development scope cannot call wallet, payment, job, outbox, tenant-admin or Mini App business write routes because those routes do not exist and the development credential has no grants for those tables.

## Scope exclusions and honest limits

- No registration, OAuth provider exchange, password reset/change, admin role changes, credit lifecycle mutations, wallet, subscriptions, payments, job intake/status, Mini App storage, general tenant administration, UI Shell, production provisioning, deployment or human UAT.
- Membership reads prove canonical membership mapping; they do not claim full customer-record/API parity. Full SPEC-312 `REQ-46847581892C` remains OPEN until its full real-user, customer-data, dev/prod isolation, target, and development-path acceptance evidence is recorded.
- Canonical auth writes (one-time recovery-code consumption and JTI revocation) are shared account-security effects by design. Development-only business effects are not created by this slice. If runtime catalog review cannot establish exact columns/grants safely, keep live credential proof as an explicit gap and do not broaden access.
- Any future development write to shared `worker_jobs`, financial, entitlement or app-business tables requires an authoritative, enforceable environment-scope contract first; this plan does not invent a second job/ledger authority or pretend the current schema has such a field.

## Security and operational contract

- Parameterized SQL only; fresh minimal row mappers; one short-lived `pg` client per request/transaction using Hyperdrive's connection string in Workers and a protected `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` variable for local workerd.
- A dedicated Modular development PostgreSQL login role is provisioned separately from the Legacy superuser. Grant schema use, only needed auth/membership columns, required recovery/session-security updates, and no CREATE, role, DB, financial, `worker_jobs`/outbox or app-data writes. Store its secret outside Git with owner-only permissions. Never expose it in output or evidence.
- Signing keys are unique by environment. The legacy TOTP ciphertext decryption key is the narrowly necessary shared canonical-data key until a separately approved canonical re-encryption design exists; it is not reused for JWT/session signing. Production key binding is not added now.
- Origin checks protect browser login/logout/MFA writes. Errors/logs do not expose SQL, connection data, hashes, TOTP secrets, submitted codes or internal diagnostics. No user-row values are printed in tests/evidence.
- Code-level environment checks bind target configuration and reject mismatched host/audience/scope. DB role tests prove dev has no DML grants to effect tables. This is not proof of production credentials or deployment isolation.

## Definition of Done for this plan

- All sections below are implemented in `smartaihub-platform` and coherently integrated on canonical `main`.
- Focused unit/API tests cover hash compatibility, MFA, host-only cookie, expiry/audience/environment checks, disabled users, one-time recovery, JTI revocation, active membership and cross-environment denial. Core package typecheck and dry-run build pass without `apps/web`/Express in the dependency graph.
- Local `wrangler dev --local`/workerd can boot the same Hono app with injected/synthetic auth data; `/livez` remains liveness only.
- If a separate dev DB role is safely provisioned, verify database identity, its exact auth-only grants and no writes to job/financial/business tables without selecting real user rows. Never test production credentials or real external effects.
- The canonical SPEC handoff is updated with exact source SHA, completed implementation evidence, focused checks, honest remaining acceptance gaps, and next action. Do not mark the whole SPEC requirement PASS or claim a domain deployment/UAT.
