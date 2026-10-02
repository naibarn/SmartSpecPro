# Implementation Plan — Spec 245 Accelerated Cloudflare Migration

## 1. Purpose and operating mode

Move all in-scope production responsibilities to their approved Cloudflare-first destinations, then fix ordinary defects found on the new platform. The beta has two active users and can pause jobs during migration. Use a controlled maintenance window instead of preserving uninterrupted task execution for every subsystem. Do not wait 14–30 days to retire Redis. Never present repository changes or local readiness as a live Cloudflare migration.

Preserve ownership: Spec 245 coordinates; Spec 232 owns Redis/BullMQ migration mechanics; Spec 242 owns its native agent/container runtime; Feature 186/195 `worker_jobs` is the only durable job authority; PostgreSQL is business-data authority. Do not create a second job ledger or compromise auth, tenant, credit, idempotency, or data-retention contracts.

## 2. One executable migration ledger

Maintain one row per active responsibility with group, caller/process, source of truth, target, prerequisite, owner, binding/secret, cutover method, acceptance proof, recovery/forward-fix, status, blocker and evidence time. Reconcile source scans with service/container/systemd/schedule manifests and runtime evidence. A grep hit is not automatically a live dependency; absence of a grep is not proof that a scheduled/host dependency does not exist. Explicitly classify detached/in-process async execution, callback-triggered work, individual scheduled occurrences, startup/reconciliation tasks, and work initiated by long-lived listeners. Record the bounded operation, canonical `worker_jobs` identity, outbox intent, and first side-effect boundary; any business operation without both durable records before its first side effect is a blocker. A listener that only waits is infrastructure; the bounded operation it triggers is the job.

Implement the Spec 245 compatibility compiler as a read-only repository tool with `inspect`, `classify`, `verify`, `plan`, and `report` commands. It consumes versioned, owner-attributed evidence manifests; scans only declared source/config boundaries; emits the required normalized inventory, dependency graph, placement, refactor, wave, redacted-binding, egress, filesystem, cron/service maps, and report. Unknowns remain `BLOCKED`/partial; the tool never executes lifecycle hooks, probes production, reads secret values, or promotes code based on import/bundle success alone. The first version must explicitly inventory detached/in-process, callback, scheduled-occurrence, startup/reconciliation, and listener-triggered operations and enforce canonical job/outbox ownership before side effects.

Use `INVENTORIED → READY → IMPLEMENTED → LOCAL_PASS → TARGET_PASS → CUTOVER → RETIRED`. Keep local, target and production evidence separate. Missing target proof blocks deployment claims only; continue all independent repo-local work.

## 3. Accelerated waves and dependencies

### Deadline execution timebox

The requested completion date is 2026-09-30. Use this as the active cutover target, not as permission to claim unverified work complete:

- **2026-09-26:** close the runnable-code/service inventory, record exact target-account evidence gap, produce per-slice owners/config and begin Worker/cache implementation.
- **2026-09-27:** finish local cache Worker/API/Admin slice and deploy/probe it if target identity and bindings become available; independently verify existing R2/Vectorize live paths.
- **2026-09-28:** use controlled pause to move ready database/Redis/job/runtime slices in dependency order; no dual authority, no calendar wait.
- **2026-09-29:** run whole-user journeys, schedule/callback probes, fix platform defects, and remove residual old runtime routes where evidence permits.
- **2026-09-30:** complete eligible cutovers and Debian retirement checks. Anything lacking target credentials, data-reconciliation proof or a safe destination remains explicitly BLOCKED with exact next action; do not label full migration complete.

Run local implementation and target-access preparation concurrently. Each day's work is conditional on the slice dependencies, and a blocked item does not stop independent waves.

### Wave 0 — Inventory and target unblock

Verify active checkout/worktree and preserve unrelated changes. Finish P245.0 repository/host/service/Redis discovery. Resolve inventory/verifier contradictions. Record Cloudflare project, environment, deployment identity, binding names, secrets, routes, origin path and evidence file. Continue local contracts and admin UI while target access is absent.

**Exit:** every active responsibility and background trigger has a destination/owner or a precise blocker; bounded business work maps to `worker_jobs` plus outbox before side effects; no unknown caller is mislabeled as retired; one maintenance pause procedure exists; target setup steps are explicit.

**Compiler exit:** all five commands produce deterministic outputs from fixtures; malformed/unknown responsibilities fail verification; no output contains secret values; a complete-retirement result is impossible while caller/process/runtime evidence or canonical background-job ownership is unknown.

### Wave 1 — Cloudflare foundation

Prepare environment-specific Worker config, only-needed bindings/secrets, liveness/readiness, logs/trace correlation, non-recursive origin routing, request/retry budgets, release manifest and rollback artifact. Do not invent account resource IDs.

**Exit:** target health/readiness probes match intended bindings, origin/auth boundary is proven, and exact rollback path is available.

### Wave 2 — Stateless routes, cache, R2 and Vectorize verification

Move safe public/read-only routes and disposable caches first. For Responses API web-search cache, add a `SEARCH_RESULT_CACHE` KV binding and authenticated internal `/internal/cache/search` endpoint. Node client calls it only when configured. Miss, timeout or KV outage becomes a miss/no-op and never affects the response. Add Admin switch, status and complete setup/deploy/verify guide. Cache no private response body or security decision. Verify current R2 authorization/integrity and Vectorize ACL/rebuild; do not needlessly copy already-correct data.

**Exit:** representative cache hit/miss/error passes through the new path, and target UI shows truthful runtime readiness.

### Wave 3 — PostgreSQL and synchronous APIs

Use current PostgreSQL only for routes whose Hyperdrive/data policies pass. Move primary to managed PostgreSQL via schema parity, snapshot/CDC or safe pause-and-copy, checksum/reconciliation, writer fencing, restore/PITR rehearsal and exactly one writer. Move auth/tenant/credits/idempotency only with fresh authority and route-specific proof.

**Exit:** exact target DB path, single-writer state, restore/recovery and user journey pass.

### Wave 4 — Redis groups and background execution

Execute Spec 232 groups: cache; auth/revocation; rate limit; lock/lease; pub/sub/realtime; BullMQ/Celery/Beat families. Pause the affected old intake/scheduler/consumer, inspect canonical jobs, reconcile uncertain provider outcomes, move one owner, test and resume. Keep `worker_jobs`/outbox semantics. Workers Rate Limiting is approximate abuse control; credit/admission remains PostgreSQL. Use Queues/Workflows/Containers/Runner by workload, not as a blanket port.

Admit DO only for an inventoried serialized per-entity coordination/realtime requirement. Use per-tenant/user/resource identity, tenant auth, lifecycle/forward-recovery plan, load/shard plan and canonical DB fencing. It is unnecessary for KV cache and is not a global Redis replacement.

**Exit:** no dual authority; each active Redis responsibility has a proven new owner or explicit approved exception; every callback, startup/reconciliation task, scheduled occurrence, and listener-triggered business operation maps to canonical `worker_jobs` plus outbox before side effects. Complete-system certification requires zero unowned or untracked business-background execution regardless of transport.

### Wave 5 — App runtime, ingress, schedules and external dependencies

Classify every Node/Python service, binary/native dependency, CPU/memory/runtime duration, filesystem/network call and place on Workers, approved Cloudflare Container, Runner or an approved managed service. Move DNS/custom domains/TLS, webhooks/callbacks, email/egress, recurring schedules, static assets and operational admin surfaces. Enforce one schedule owner, byte-preserving webhook signature verification, no proxy recursion and no origin bypass. Do not violate Specs 224/242 or Feature 195 authority.

**Exit:** every ingress/egress/schedule/runtime has a destination and end-to-end trace; all callback-triggered, detached, in-process, startup and long-lived-listener work is explicitly classified and covered by the canonical background-job contract.

### Wave 6 — Full cutover, defect repair and Debian retirement

Run target user journeys for auth, tenant data, credits/jobs, R2 artifacts, Vectorize, callbacks and realtime where applicable. Resume beta on Cloudflare and fix normal defects there. Detect residual Redis/Debian dependency via inventory plus targeted network/process denial. Simulate rare/long-period schedules and callbacks. Keep recoverable data/config per retention rules; remove credentials only after no active consumer depends on them. Redis has no fixed elapsed observation gate; Debian power-off still needs the separate full-system dependency/recovery proof.

## 4. KV cache UI/Worker contract

- Scope: Responses API `SearchResultCache` only. The control offers `Disabled` or `Cloudflare KV`; it must not imply that every Redis usage moved.
- Internal endpoint: `POST /internal/cache/search`, authenticated by dedicated `CLOUDFLARE_SEARCH_CACHE_TOKEN` deployment secret, not a browser value or unrelated job token. Use a discriminated request: `{operation:"probe"}`, `{operation:"get",scope,id,queryHash}`, or `{operation:"put",scope,id,queryHash,entry,ttlSeconds}`. `probe` confirms token and binding readiness without exposing an application cache record. Responses are no-store; errors contain bounded codes only.
- KV binding: `SEARCH_RESULT_CACHE`. Worker validates tenant/user tier, IDs, query hash, entry JSON, request size and TTL cap, and builds keys itself.
- Gate this endpoint with a cache-specific enable setting independent of `CLOUDFLARE_ACTIVATION`; cache enablement must not activate job consumers.
- Node adapter uses `CLOUDFLARE_RUNTIME_URL` plus dedicated token; active KV mode never silently falls back to Redis. Cache outage is safe miss/no-op.
- Admin switch persists only `disabled|cloudflare_kv` through an admin-only setting/service; cache service refreshes setting safely with a bounded process-cache delay. Backend probes the endpoint before enablement and returns only sanitized readiness fields. Secret remains in environment/deployment.
- UI displays active mode, config source, endpoint/binding readiness, last probe, remediation, exact namespace/binding/secret/deploy/test steps, and remaining separate Redis categories. It never claims to provision account resources.

## 5. Maintenance pause and recovery

For each slice, stop new intake, pause relevant schedulers/dispatchers/consumers, record stopped generation, inspect canonical records and reconcile provider operations with unknown outcomes. Snapshot any data-bearing authority before deletion. Deploy config, run targeted health/auth/tenant/representative operation/logging checks, ensure one active owner, then resume only the new path. Fix normal defects forward on Cloudflare; pause the affected capability if a security, financial, ownership or data-integrity invariant fails. No silent Redis fallback for a migrated responsibility.

## 6. UI/UX contract — Admin Infrastructure → Cache / Redis

- **Target/job:** admin understands whether the search-result cache uses KV, sees missing setup, and can safely enable/disable only this cache.
- **Surface:** add a Cloudflare KV card inside existing `InfrastructureSettingsPanel` Redis tab; retain Redis health for unmigrated responsibilities.
- **State matrix:** loading; unconfigured (disabled switch and missing binding/token/endpoint); ready/off; ready/on; probe pending; save pending; probe/save error (prior value retained); success; access denied using existing admin auth.
- **Responsive:** mobile one column; tablet/laptop/desktop split only status/details; config code scrolls horizontally without page overflow.
- **Accessibility:** labeled switch and `aria-describedby`, keyboard/focus behavior, semantic ordered guide, visible status text beyond color, no hover-only help, external links named.
- **Visual/copy:** follow current Infrastructure components/tokens and i18n. Thai-first copy states plainly that cache miss continues the request and UI does not create Worker resources.
- **Browser evidence:** verify mobile/tablet/desktop and off/on/unconfigured/error/loading, keyboard toggling, no secret in DOM/API and no overflow; do not claim browser proof without a browser run.

## 7. Evidence boundaries and present blocker

Current local verifier result: `localContractReady=true`. Current target verifier result: blocked by absent `target_evidence_file`, with `targetAccountProof=false` and `productionProof=false`. No Worker KV binding/endpoint exists yet. This blocks external deployment proof, not local implementation. The plan does not call the migration complete until target identity/resources and every workload are proven.

## 8. Completion report

Report exact changed paths, focused checks and boundaries, active/migrated/unmigrated responsibilities, target blockers and next slice. Do not run repository typecheck. Do not use the absence of a calendar observation period to skip high-risk correctness checks.

## 9. Spec 232 G2 recovery crosswalk — planning update (2026-09-27)

Spec 232 now has a bounded G2 Auth/revocation recovery plan at [`Spec 232 G2 recovery plan`](../232-Zero-Downtime%20RedisBullMQ%20to%20Cloudflare%20Migration%20%26%20Runtime%20Hardening/claude-plan.md), with six ordered sections and a matching TDD matrix. This preserves the ownership boundary in §1 and executes the G2 recovery dependency in Wave 4; Spec 245 remains the coordinating migration plan.

The Spec 232 recovery work is deliberately PostgreSQL-backed. Its target/writer inventory, encrypted backup plus isolated restore, complete writer fence, fresh snapshots, guarded JTI/login reconciliation, device/pairing disposition, keyring/security validation, and staged reopen evidence are prerequisites for declaring the **immediate G2 recovery** complete. None moves G2 authority to Durable Objects, retires Redis, or certifies the full Spec 245 migration. Any Durable Objects promotion requires a separate future wave with its own consistency, lifecycle, restore, cross-region, authority-transfer, rollback, and live-provider gates.

Implementation crosswalk (2026-09-27): repository work has since completed across the six Spec 232 sections, including guarded JTI/login reconciliation paths, focused synthetic keyring validation, section reviews, and local tests. The implementation evidence is recorded in the Spec 232 section files. PostgreSQL integration tests and every target-specific/operational gate remain unproven, so the reopen decision is still `BLOCKED_SAFE`.

Status boundary: this crosswalk does not refresh the dated Production observations in `ops/feature-232/g1-g2-production-readiness-runbook.md`, certify current runtime state, authorize guarded imports, change secrets, unmask/start services, deploy, or reopen traffic. Treat the runbook's current explicit gates and timestamps as governing evidence; obtain fresh target-specific evidence and owner approval before acting. Spec 245's existing R8 plan/TDD/research/sections and unrelated G1/G3–G6/deployment blockers remain intact.
