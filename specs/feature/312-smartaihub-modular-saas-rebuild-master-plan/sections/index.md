<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: corepack pnpm@10.4.1 test:core
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-environment-database-boundary
section-02-password-mfa-compatibility
section-03-session-membership-routes
section-04-worker-proof-and-handoff
END_MANIFEST -->

# Implementation Sections Index

Plan scope: SPEC-312 R1.6 first stateful Core identity slice in the canonical `smartaihub-platform` repository. The plan does not cover the full SmartAIHub program or any public deployment. Canonical requirement `REQ-46847581892C` is the requirement mapping; all rows remain open until the full parent acceptance is evidenced.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-environment-database-boundary | - | 02, 03, 04 | No |
| section-02-password-mfa-compatibility | 01 | 03, 04 | No |
| section-03-session-membership-routes | 01, 02 | 04 | No |
| section-04-worker-proof-and-handoff | 01, 02, 03 | - | No |

## Execution Order

1. Section 01 — define explicit runtime/environment-tenant binding and minimal shared-DB adapter/credential contract.
2. Section 02 — verify existing account password and MFA formats without changing stored values.
3. Section 03 — expose host-scoped Hono auth/session and active membership read APIs.
4. Section 04 — run focused package/workerd checks, inspect boundaries, and update the canonical handoff with truthful evidence.

## Section Summaries

### section-01-environment-database-boundary

**Requirement IDs:** `REQ-46847581892C` (environment separation and shared canonical account data). **Objective:** build explicit immutable environment bindings, Workers-compatible PostgreSQL access and narrowly scoped auth/membership repositories against `smartspec`. **Owned paths:** `smartaihub-platform/apps/saas-core/src/config/**`, `src/db/**`, `apps/saas-core/wrangler.jsonc`, root/package lock only if a driver is necessary, plus the scoped local credential operation outside Git. **Prerequisites:** source remains canonical `main`; only read-only schema facts already audited. **Completion predicate:** tests show target/scope cannot be request- or Host-selected, SQL is parameterized, no shared-schema DDL occurs, and a separate dev credential has only documented authentication/membership grants or the live grant check is explicitly carried as a gap. A local DSN is allowed only from an owner-only ignored file after checking database `smartspec` and a `_dev` role; a Cloudflare runtime must use Hyperdrive and cannot fall back to the local DSN. **Verification/evidence:** injected client tests, target binding tests, catalog-only grants if provisioned; record exact source and DB identity without secrets. **Fallback:** keep the app mockable and dev credentials absent; do not reuse Legacy role. **Blocker strategy:** continue source/test work if credential provisioning fails, and stop only live DB access for that failure. **Exposure/rollback:** local workerd only; revert owned files and revoke the new dev role/secret only after verifying no active consumer.

### section-02-password-mfa-compatibility

**Requirement IDs:** `REQ-46847581892C` (existing user can authenticate through canonical account authority). **Objective:** verify supported bcrypt and Argon2 `i`/`d`/`id` version-19 formats plus MFA/TOTP/recovery behavior using Worker-safe code, preserving stored hashes and values. **Owned paths:** `smartaihub-platform/apps/saas-core/src/identity/password.ts`, `totp.ts`, `accountAuthentication.ts`, unit tests, app package manifest/lock. **Prerequisites:** section 01's account row mapping and injectable repository. **Completion predicate:** bounded synthetic fixtures pass; verifier permits one in-flight hash and at most 8 queued waiters per isolate; disabled/passwordless users fail; MFA challenge, TOTP and one-time recovery flow pass without writing any password or creating/promoting a user. **Verification/evidence:** synthetic vectors only; no production/real-user secret in tests. **Fallback:** reject unsupported/corrupt hashes or ciphertext safely and record precise compatibility gap; never skip MFA. **Blocker strategy:** replace an incompatible candidate library only after verifying a Worker-safe alternative and focused fixtures. **Exposure/rollback:** not public; revert the code/dependency only, preserving DB rows. The actual stored hash distribution and real-user login remain unverified. Cloudflare production auth requires a Paid Workers CPU budget or measured equivalent; local workerd is not CPU-limit proof.

### section-03-session-membership-routes

**Requirement IDs:** `REQ-46847581892C` (existing customer IDs/membership plus isolated dev scope). **Objective:** create Hono login, 2FA, logout and `/me` endpoints with host-only environment-bound session, fresh active membership lookup and strict sharded Durable Object login/MFA throttling. **Owned paths:** `smartaihub-platform/apps/saas-core/src/identity/session.ts`, `authRoutes.ts`, `src/tenancy/**`, `src/security/loginThrottle*.ts`, local Wrangler DO binding/migration, app composition and API tests. **Prerequisites:** sections 01 and 02. **Completion predicate:** environment/audience/host/revocation and CSRF failures deny; 10/60s per-IP and 5/15m per-account windows serialize and fail closed; successful `/me` returns original account/membership IDs/roles; no customer tenant comes from request/hostname; there are no wallet/job/payment/business write routes. **Verification/evidence:** Hono request tests with fake repositories, cookie/JWT tests, membership-isolation tests, concurrent/window throttle tests and local workerd DO smoke. **Fallback:** leave origin/host policy fail-closed; preserve liveness. **Blocker strategy:** repair normal code failures and test contract mismatch; do not relax auth. **Exposure/rollback:** local-only handler; source revert restores the current liveness app.

### section-04-worker-proof-and-handoff

**Requirement IDs:** `REQ-46847581892C` (Hono/no Express and truthful development path evidence). **Objective:** verify package build and local workerd behavior, prove no retired/legacy runtime import, and record honest canonical handoff evidence. **Owned paths:** source repo package test/config/docs as needed; SmartSpecPro `specs/feature/312-.../handoff/evidence/**` and handoff writer-owned fields only. **Prerequisites:** sections 01–03. **Completion predicate:** Core tests/typecheck/dry-run build/local smoke pass; source SHA is fetched and equal to `origin/main`; handoff writer records exact source/check evidence while full parent requirement remains OPEN. **Verification/evidence:** package outputs and structured handoff validation; no live public deployment. **Fallback:** preserve a failing check as an exact scoped gap and fix code-caused failures; never make a false PASS. **Blocker strategy:** retry fixable package/workerd issues; no production/target mutation. **Exposure/rollback:** no public traffic. Roll back code only; if a dev credential was created, revoke it with its exact role/secret record after confirming no running consumer.
