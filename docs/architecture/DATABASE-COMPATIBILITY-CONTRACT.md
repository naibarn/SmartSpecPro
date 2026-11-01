# Canonical Core PostgreSQL Compatibility Contract — R1.0

- **Database of record for Core ONLY:** current PostgreSQL `smartspec`, same actual data and existing physical schema. Includes Core identity/tenant, credit/settlement, `worker_jobs`, App registry, platform subscriptions and explicit inventoried Legacy business tables. Does NOT host greenfield Mini App business tables. New stateful Mini Apps have a dedicated App database (D1 or separately owned PostgreSQL per SPEC-323); new stateless Apps have none.
- **Required exact continuity:** user identity/account IDs, tenant IDs/memberships, passwords and algorithm parameters, encrypted MFA secrets/recovery state, email/OAuth bindings, session revocation rules, credit ledger/balance transactions, existing `worker_jobs`, audit and R2 object references.
- **Do not:** clone/import the old DB, change DB platform to D1, silently invent a parallel `users`/`wallet`/`jobs` system, rewrite old keys, rename or drop fields, run DDL at Worker cold-start or duplicate payment/settlement authority.
- **Default:** zero schema migrations for first Core slice; read-only DB catalog introspection and per-domain small repository code against existing table/column identities.
- **Allowed later if demonstrated absent:** strictly additive new module metadata table/index under existing SPEC-295 migration authority with cross-version compatibility. This must not block an unrelated runnable account/Shell feature.
- **Dual runtime:** same true permissions, same Postgres DB, separate host-bound sessions; one authenticated writer per money/account/job mutation and idempotent transaction handling.
- **Freshness:** Core sensitive SELECTs use cache-disabled Hyperdrive; read-only public catalog may opt into caching later. Configure origin connection budgets across bindings, and benchmark database latency from Debian and Cloudflare.
- **Evidence:** read-only catalog fingerprint, SQL query mapping table by API, known drift report, actor/tenant isolation tests, transactional duplicate/rollback test and source SHA. Do not claim complete compatibility until these are actually measured/verified.

- **Legacy shared exception:** register exact App ID + original table ownership + permission. Do not interpret any Core schema compatibility check as permission for new app domain tables.
- **BYOC/self-hosting:** consume Core through scoped HTTPS APIs; never receive Core Postgres connection string or privileged credentials.
- **Data-plane portability:** separate D1/SQLite vs PostgreSQL semantics; optional App DB export/upgrade, provenance and verified cutover.
