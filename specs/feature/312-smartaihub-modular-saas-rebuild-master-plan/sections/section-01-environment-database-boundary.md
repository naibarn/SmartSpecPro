# Section 01 — Environment and shared database boundary

## Objective and requirement mapping

Implement the trusted per-runtime configuration and minimal PostgreSQL adapter that let Modular development read the existing `smartspec` account/customer-membership authority. Preserve canonical user and customer tenant IDs. Keep `modular-debian-dev` / `modular-development` separate from the future `modular-cloudflare-prod` / `modular-production` identity.

**Canonical requirement:** `REQ-46847581892C` (partial implementation evidence only; do not close the parent requirement).

## Owned scope

Write scope in `/mnt/SmartSpecDev/projects/smartaihub-platform`:

- `apps/saas-core/src/config/**`
- `apps/saas-core/src/db/**`
- `apps/saas-core/wrangler.jsonc`
- root and Core package manifest/lock only when required for `pg`.

Any provisioned role/connection secret lives outside Git in an owner-only local secret store or ignored `.dev.vars` file with mode `0600`; do not include its content in source, test output or evidence.

Session-signing, throttle-HMAC, and account-data encryption keys must be distinct within each environment and freshly generated for development and production; configuration rejects same-runtime key reuse.

## Contracts

- Resolve target ID and environment-tenant scope only from typed runtime bindings. Reject missing/unknown values. Host allowlists are for origin/cookie checks only, not customer-tenant selection.
- Create a `pg` Client from the future Cloudflare `HYPERDRIVE.connectionString`, or the local-only `CORE_LOCAL_DATABASE_URL`, close it per request/transaction, parameterize all values, and expose an injectable client factory. Local DSNs must resolve to database `smartspec` and exact role `modular_core_auth_dev`; Cloudflare runtime must use exact role `modular_core_auth_prod` and cannot use the local DSN. Do not provision a Cloudflare Hyperdrive resource or production role in this slice.
- Authenticate against exact current quoted `users` columns; query `tenant_users` and active `tenants` using verified current identifiers; access only the hashed JTI revocation table for session security.
- Do not use the Legacy service credential. A dedicated dev role can read only needed account/membership columns, update only recovery/session bookkeeping columns, and read/write JTI revocations. It cannot create schema/roles/databases or write financial, job/outbox, entitlement or Mini App business tables.
- The Core role deliberately has no DELETE privilege. Expired session-JTI row cleanup is outside this slice and needs a separate bounded cleanup authority before high-volume production; do not grant Core table-wide DELETE.
- No schema migration, user data seeding or database copy.

## Prerequisites and implementation order

Use the read-only R1.6 schema evidence and inspect any additional required columns using catalog-only queries. Confirm the active source checkout is `smartaihub-platform/main`, preserve its package conventions, then implement the environment config and injected repository. Provision the separate dev identity only after confirming the exact grants and secure secret destination; otherwise keep the code mockable and carry only the live-credential proof as a gap.

## Acceptance and verification

- Unit tests reject missing, forged or mismatched environment/host scope and prove request tenant data is ignored.
- Repository tests assert normalized lower/trim lookup, parameterized SQL, active membership filters, narrow return fields, connection cleanup and no DDL.
- Catalog-only DB test (if available) shows `current_database() = smartspec`, the exact Modular role, and no write grants to credit, billing, subscription, `worker_jobs`, outbox or Mini App business tables. Do not select real account rows.
- Secret checks verify the DSN is absent from tracked files, logs and fixtures.

## Exposure, fallback and rollback

Keep only local dev config active. Do not add a production Wrangler environment, remote binding ID, route, DNS change, deployment or handover. If the role cannot be safely provisioned, stop that live DB operation but continue synthetic repository tests. Revert only owned Core files; revoke a created role/secret only after confirming there is no active consumer.

## Gaps intentionally preserved

This slice creates no development-only business rows. `worker_jobs` has no environment field, so no job/credit/payment route may be added. Production credential/binding and actual cross-environment denial remain unverified.
