<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: corepack pnpm@10.4.1 test:core
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-environment-database-boundary
section-02-password-mfa-compatibility
section-03-session-membership-routes
section-04-worker-proof-and-handoff
section-05-chat-canonical-job-and-queue-admission
section-06-provider-admission-and-queue-consumer
section-07-chat-job-status-ui-and-runtime-proof
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
| section-05-chat-canonical-job-and-queue-admission | 01, 03 | 06, 07 | No |
| section-06-provider-admission-and-queue-consumer | 05 | 07 | No |
| section-07-chat-job-status-ui-and-runtime-proof | 05, 06 | - | No |

## Execution Order

1. Section 01 — define explicit runtime/environment-tenant binding and minimal shared-DB adapter/credential contract.
2. Section 02 — verify existing account password and MFA formats without changing stored values.
3. Section 03 — expose host-scoped Hono auth/session and active membership read APIs.
4. Section 04 — run focused package/workerd checks, inspect boundaries, and update the canonical handoff with truthful evidence.
5. Section 05 — admit Chat turns into `worker_jobs` + outbox atomically and add Cloudflare Queue bindings/publishing without exposing prompt data in messages.
6. Section 06 — add a cross-instance provider admission Durable Object, idempotent Queue consumer/settlement, catalog freshness checks, and retry handling.
7. Section 07 — update Chat to poll scoped job results, verify responsive desktop/tablet/mobile and local Workerd Queue delivery, then deploy only to `modular-debian-dev` and record evidence.

## Section Summaries

### section-01-environment-database-boundary

**Requirement IDs:** `REQ-46847581892C` (environment separation and shared canonical account data). **Objective:** build explicit immutable environment bindings, Workers-compatible PostgreSQL access and narrowly scoped auth/membership repositories against `smartspec`. **Owned paths:** `smartaihub-platform/apps/saas-core/src/config/**`, `src/db/**`, `apps/saas-core/wrangler.jsonc`, root/package lock only if a driver is necessary, plus the scoped local credential operation outside Git. **Prerequisites:** source remains canonical `main`; only read-only schema facts already audited. **Completion predicate:** tests show target/scope cannot be request- or Host-selected, SQL is parameterized, no shared-schema DDL occurs, and a separate dev credential has only documented authentication/membership grants or the live grant check is explicitly carried as a gap. A local DSN is allowed only from an owner-only ignored file after checking database `smartspec` and a `_dev` role; a Cloudflare runtime must use Hyperdrive and cannot fall back to the local DSN. **Verification/evidence:** injected client tests, target binding tests, catalog-only grants if provisioned; record exact source and DB identity without secrets. **Fallback:** keep the app mockable and dev credentials absent; do not reuse Legacy role. **Blocker strategy:** continue source/test work if credential provisioning fails, and stop only live DB access for that failure. **Exposure/rollback:** local workerd only; revert owned files and revoke the new dev role/secret only after verifying no active consumer.

### section-02-password-mfa-compatibility

**Requirement IDs:** `REQ-46847581892C` (existing user can authenticate through canonical account authority). **Objective:** verify supported bcrypt and Argon2 `i`/`d`/`id` version-19 formats plus MFA/TOTP/recovery behavior using Worker-safe code, preserving stored hashes and values. **Owned paths:** `smartaihub-platform/apps/saas-core/src/identity/password.ts`, `totp.ts`, `accountAuthentication.ts`, unit tests, app package manifest/lock. **Prerequisites:** section 01's account row mapping and injectable repository. **Completion predicate:** bounded synthetic fixtures pass; verifier permits one in-flight hash and at most 8 queued waiters per isolate; disabled/passwordless users fail; MFA challenge, TOTP and one-time recovery flow pass without writing any password or creating/promoting a user. **Verification/evidence:** synthetic vectors only; no production/real-user secret in tests. **Fallback:** reject unsupported/corrupt hashes or ciphertext safely and record precise compatibility gap; never skip MFA. **Blocker strategy:** replace an incompatible candidate library only after verifying a Worker-safe alternative and focused fixtures. **Exposure/rollback:** not public; revert the code/dependency only, preserving DB rows. The actual stored hash distribution and real-user login remain unverified. Cloudflare production auth requires a Paid Workers CPU budget or measured equivalent; local workerd is not CPU-limit proof.

### section-03-session-membership-routes

**Requirement IDs:** `REQ-46847581892C` (existing customer IDs/membership plus isolated dev scope). **Objective:** create Hono login, 2FA, logout and `/me` endpoints with host-only environment-bound session, fresh active membership lookup and strict sharded Durable Object login/MFA throttling. **Owned paths:** `smartaihub-platform/apps/saas-core/src/identity/session.ts`, `authRoutes.ts`, `src/tenancy/**`, `src/security/loginThrottle*.ts`, local Wrangler DO binding/migration, app composition and API tests. **Prerequisites:** sections 01 and 02. **Completion predicate:** environment/audience/host/revocation and CSRF failures deny; 10/60s per-IP and 5/15m per-account windows serialize and fail closed; successful `/me` returns original account/membership IDs/roles; no customer tenant comes from request/hostname; there are no wallet/job/payment/business write routes. **Verification/evidence:** Hono request tests with fake repositories, cookie/JWT tests, membership-isolation tests, concurrent/window throttle tests and local workerd DO smoke. **Fallback:** leave origin/host policy fail-closed; preserve liveness. **Blocker strategy:** repair normal code failures and test contract mismatch; do not relax auth. **Exposure/rollback:** local-only handler; source revert restores the current liveness app.

### section-04-worker-proof-and-handoff

**Requirement IDs:** `REQ-46847581892C` (Hono/no Express and truthful development path evidence). **Objective:** verify package build and local workerd behavior, prove no retired/legacy runtime import, and record honest canonical handoff evidence. **Owned paths:** source repo package test/config/docs as needed; SmartSpecPro `specs/feature/312-.../handoff/evidence/**` and handoff writer-owned fields only. **Prerequisites:** sections 01–03. **Completion predicate:** Core tests/typecheck/dry-run build/local smoke pass; source SHA is fetched and equal to `origin/main`; handoff writer records exact source/check evidence while full parent requirement remains OPEN. **Verification/evidence:** package outputs and structured handoff validation; no live public deployment. **Fallback:** preserve a failing check as an exact scoped gap and fix code-caused failures; never make a false PASS. **Blocker strategy:** retry fixable package/workerd issues; no production/target mutation.

### section-05-chat-canonical-job-and-queue-admission

**Requirement IDs:** `REQ-46847581892C` and R1.8 Chat queue requirement. **Objective:** replace synchronous Core→OpenRouter HTTP response handling with prompt admission to canonical `worker_jobs` and `worker_job_outbox`, atomically scoped to the signed-in user and selected workspace/environment. Add only narrowly scoped database functions and additive control-plane columns/indexes needed to support a personal workspace job without fabricating a customer tenant. The Queue envelope contains job ID, attempt/version and dedupe key only. **Owned paths:** `smartaihub-platform/apps/saas-core/src/chat/**`, `src/identity/authRoutes.ts`, `src/config/environment.ts`, Core Wrangler config/worker; SmartSpecPro `apps/web/drizzle/04xx_modular_chat_queue.sql` and this SPEC's plan files. **Prerequisites:** source main and target map reconciled; inspect all legacy outbox publishers/claimers before creating a new job type. **Completion predicate:** duplicate idempotency keys return the same job; job+outbox creation is one transaction; dev/prod environment and workspace scope are verified in SQL; legacy publisher/worker cannot dispatch or claim the new contract; failure to queue leaves a recoverable outbox row. **Verification/evidence:** injected repository tests, SQL function tests/catalog check, exact grants and local dev DB migration proof. **Exposure/rollback:** no production DDL or release; dev-only additive migration, exact rollback plan preserves job evidence.

### section-06-provider-admission-and-queue-consumer

**Requirement IDs:** R1.8 provider safety and existing `worker_jobs` lifecycle. **Objective:** coordinate provider quota/concurrency globally with a Durable Object; claim queued canonical jobs using leases/fencing; invoke OpenRouter only after admission; settle Chat records and canonical job events once; release admission in all paths. Handle duplicate messages, explicit 429/`Retry-After`, transient Queue delivery, stale model IDs, and DLQ/exhausted jobs without bypassing the limiter. **Owned paths:** `smartaihub-platform/apps/saas-core/src/chat/**`, Core Worker entrypoint, DO binding/migration and tests; only when required, SmartSpecPro scoped migration functions. **Prerequisites:** section 05. **Completion predicate:** concurrent fake Queue messages never exceed the documented OpenRouter free-model ceiling (20/min, live daily quota, 10 global and 3/user); starts are at least 3 seconds apart; duplicate delivery causes at most one provider call and one settlement; paid, missing and stale models are never sent; provider rate feedback delays retry safely. **Verification/evidence:** focused vitest with deterministic clock/fake storage/fetch and local workerd Queue integration. **Exposure/rollback:** development target only; no provider call without valid configured free model and admitted slot.

### section-07-chat-job-status-ui-and-runtime-proof

**Requirement IDs:** R1.7 usable Chat and R1.8 asynchronous feedback. **Objective:** return a fast accepted response, show queued/running/failure states, poll the job through a user/workspace/environment scoped API, render the stored answer, and preserve conversation history. Configure producer and consumer Queue bindings for local Wrangler simulation and future Cloudflare Workers without provisioning/activating production. **Owned paths:** `smartaihub-platform/modules/chat/src/**`, `apps/saas-core/src/identity/authRoutes.ts`, Queue config/consumer and focused tests; SPEC-312 evidence and canonical handoff through shared writer. **Prerequisites:** sections 05–06. **Completion predicate:** no synchronous provider call in HTTP route; chat accepts then surfaces success/failure; user A cannot read user B's job; local Queue retry/outbox replay and responsive desktop/tablet/mobile smoke pass; target release proves aimarkethubs.com health and no legacy/production target moved. **Verification/evidence:** package tests/build, local Workerd Queue smoke, migration/schema audit, deployment target/service/port/health receipts and exact source SHA. **Exposure/rollback:** replace only `modular-debian-dev`; preserve old port-3100 rollback until all three services healthy.
