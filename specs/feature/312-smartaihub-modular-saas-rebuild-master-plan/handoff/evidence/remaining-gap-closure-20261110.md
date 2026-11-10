# SPEC-312 — Remaining-gap closure update

**Date:** 2026-11-10
**Scope:** Close the expired session-JTI cleanup gap from the first Hono Core identity slice. This update does not claim full SPEC-312 acceptance, existing-user login, customer-data UAT, performance superiority, production isolation, or deployment.

## Integrated implementation

- SmartSpecPro `main`: `712172880aab7d4994480236513b5fcc5b11b013` adds migration `0418_saas_core_bounded_jti_cleanup` and the future production-role grant/verification contract.
- `smartaihub-platform` `main`: `a5e16406e1ab79d62c283ff03d6b83c895f6d34b` adds the Core repository call, Worker scheduled handler, 15-minute cron, and tests.
- The bounded database function deletes only rows whose non-null `expires_at` is at or before statement time. It orders by indexed expiry, accepts batches from 1 to 500, serializes its own invocations with a transaction advisory lock, and returns only a count.
- The function runs as `modular_core_jti_cleanup_owner`, a `NOLOGIN`, non-superuser, non-inheriting role with only `SELECT` and `DELETE` on `revoked_token_jtis`. Its temporary schema `CREATE` grant is revoked after ownership transfer. `PUBLIC` cannot execute the function. Core receives `EXECUTE` only and has no direct table `DELETE`; the production runtime role receives the same function execution grant only after verifying the function and owner markers.

## Development database and runtime proof

- Read-only connection comparison confirmed the Legacy and Core credentials reach the same loopback PostgreSQL 15.17 instance and `smartspec` database. The Core connection uses `modular_core_auth_dev`; it has the intended JTI insert-column grants and no table-level `DELETE`.
- Before migration, the canonical Drizzle head was `0417_vertical_drama_book_studio`; `0418_saas_core_bounded_jti_cleanup` was the only pending migration. The existing receipt-enabled migration runner applied it against `modular-debian-dev` with source SHA `712172880aab7d4994480236513b5fcc5b11b013`. The database receipt is `SETTLED/SUCCEEDED`, and the latest ledger hash matches migration `0418`.
- Post-migration catalog checks confirmed the function’s fixed `pg_catalog, public` search path, `SECURITY DEFINER`, dedicated owner, no owner memberships/login/superuser/role-creation/database-creation/replication/RLS-bypass privileges, no `PUBLIC EXECUTE`, Core `EXECUTE`, and no Core direct table `DELETE`.
- A transaction-rolled-back PostgreSQL exercise verified batch limits, rejection above 500, Core direct-delete denial, expired-only deletion, retention of non-expired and null-expiry rows, and rollback of all fixture rows/DDL.
- Local Wrangler at `127.0.0.1:3200` returned `/livez` 200 and the local scheduled endpoint returned `outcome=ok`. Five scheduled invocations deleted 2,262 expired JTI rows in batches of 500, 500, 500, 500, and 262. A follow-up aggregate query returned zero expired rows. Only hashed JTI rows past expiry were removed; no user records, password hashes, or tenant rows were read. The Worker was stopped after the smoke check.
- Focused checks at `a5e16406e1ab79d62c283ff03d6b83c895f6d34b`: Core typecheck passed; 11 test files / 65 tests passed; Wrangler dry-run passed at 388.64 KiB / 91.87 KiB gzip. The SmartSpecPro production-role unit test passed (3 tests).

## Acceptance still open

`REQ-46847581892C` remains `PARTIAL/OPEN`. No authorized existing Legacy account was used; no customer membership or customer data was read; no production credentials or data were accessed. There is still no matched Legacy/Core benchmark demonstrating lower p50/p95 latency with the actual supported password-hash distribution, MFA path, and `/me` journey. Production isolation and real human UAT cannot be established while the production target is inactive and `aimarkethubs.com` is not yet serving Core.

Development remains local-only. No Cloudflare deployment, DNS change, `aimarkethubs.com` service handover, `smartsihub.com` activation, or port-3100 change occurred. Direct Codex development was used; no SPEC-224 receipt is claimed.

**Next action:** Use a dedicated, authorized existing Legacy development test account (credentials must stay in an ignored local secret file or be entered by the user) to complete login and authorized membership UAT. Then run the matched Legacy/Core performance comparison and development/production isolation checks when their permitted test path is available. Keep the requirement open until those proofs exist.
