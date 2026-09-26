# TDD Plan — Spec 245 Accelerated Cloudflare Migration

The implementation sections below define tests to add/run before each code change, using established Vitest/tsx and Python pytest patterns. They are test requirements, not test implementations.

## Section 01 — Inventory and Cloudflare foundation

- Inventory parser/schema rejects unclassified active responsibilities before a full-retirement result.
- Local, target and production readiness are separate; target mode remains blocked without authentic evidence.
- Maintenance pause/resume handles queued, active, delayed and provider-unknown jobs without duplicate ownership.
- Worker auth, disabled activation, binding subset, health/readiness, size limit and origin-loop cases are covered.

## Section 02 — Search cache KV and Admin control

- Worker rejects unauthorized, oversized, invalid scope, malformed cache item and TTL outside configured bounds; KV errors return typed unavailable outcome; probe verifies binding without reading tenant/user data.
- Cache endpoint activation is independent of job activation; enabling cache cannot start queue consumers.
- Key construction includes scope/tenant/user and normalized query; no cross-tenant/user collisions.
- Node adapter handles missing endpoint/token, timeout, non-2xx, malformed JSON and KV outage as safe miss/no-op; active KV provider never invokes Redis.
- Freshness bypass is unchanged; tenant/user cache TTLs remain bounded.
- Admin cannot enable before endpoint/binding readiness; switch updates actual runtime setting; failed save retains prior mode; no secret is returned or rendered.
- Thai setup guide contains namespace, binding name, Worker endpoint, dedicated secret name, deployment steps, verification, disablement and troubleshooting.
- UI states/loading/keyboard/responsive layout and no secret leakage are checked.

## Section 03 — Redis groups and DO

- Per family, assert old owner is paused and exactly one new executor/scheduler/lock authority is active.
- Verify duplicate Queue delivery, outbox retry, lease expiry/fencing, DLQ, provider unknown outcome, credit/idempotency and pause/resume.
- Auth revoke and tenant ACL remain fresh with KV unavailable; rate limiting does not replace credit accounting.
- If DO is selected, test per-entity serialization, different-entity parallelism, tenant scope, SQLite persistence across eviction/restart, lifecycle version compatibility, load/shard guard and recovery. Confirm no global singleton.

## Section 04 — Database/runtime/Debian

- Schema parity/checksum, one-writer transition, Hyperdrive behavior, PITR restore and ambiguous commit/idempotency.
- Node methods are tested on actual call paths; package import alone is insufficient. Container resource/network and Runner lease/reconnect behaviors are verified where used.
- Webhook raw-byte signature, redirect semantics, schedule uniqueness, provider callbacks, and route graph recursion are covered.
- R2 authorization/integrity and Vectorize tenant ACL/rebuild/deletion behaviors pass.
- Whole journey works on target; Debian network-deny catches no required call; long-interval schedule and rare callback fixtures complete.
- Post-cutover fix-forward path and affected-slice pause preserve canonical work.

## Commands and policy

- Worker: focused Vitest files via `npm --workspace @smartspec/cloudflare-runtime test -- --run <file>` after checking package script syntax.
- Web: focused Vitest via `npm --workspace @smartspec/web exec vitest run <file>` after checking package script syntax.
- Readiness: `npm --workspace @smartspec/web run verify:cloudflare-local-readiness`; target verifier requires authentic target evidence.
- Do not run repository TypeScript typecheck because of the documented RAM constraint.
- Only run tests/checks needed by a specifically authorized implementation slice; report any not run.
