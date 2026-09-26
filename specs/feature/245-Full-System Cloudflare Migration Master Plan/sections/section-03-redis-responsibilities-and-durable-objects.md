# Section 03 — Redis Responsibilities and Durable Objects

## Goal

Migrate every active Redis responsibility through Spec 232 without treating KV as a drop-in Redis replacement or creating a second durable authority.

## Responsibility decisions

- G1 cache: KV or Cache API for explicitly disposable/read-heavy keys; cache loss is safe.
- G2 auth/revocation: fresh canonical PostgreSQL/security authority; KV only bounded non-authoritative hints.
- G3 rate limit: Workers Rate Limiting for approximate abuse defense; PostgreSQL for credits/economic quotas; DO only for proven per-entity exact coordination when PG is not the right existing authority.
- G4 locks: durable job ownership uses Feature 195 `worker_jobs` leases and PostgreSQL fencing; ephemeral serialized per-resource coordination can use DO only after old/new owners share fencing semantics.
- G5 pub/sub/realtime: durable PostgreSQL event/outbox is truth; DO may own WebSocket sessions, replay cursor coordination or live room state. No in-memory-only business events.
- G6 BullMQ/Celery/Beat: route one family at a time through canonical PG/outbox and approved Queue/Workflow/Container/Runner executor.

## DO admission and preparation

DO is not a prerequisite for KV cache migration. Add DO only when an inventory row names the shared entity needing serialized coordination or persistent connections. Choose deterministic per-tenant/user/resource IDs; never use one global DO. Define tenant auth in every RPC, canonical source of truth, SQLite class/binding, data schema version, storage migration strategy, alarms/WebSocket behavior if used, per-object load/sharding, lifecycle change/recovery and cost cap. New classes use an independently reviewed lifecycle release because DO class lifecycle cannot be treated as ordinary Worker rollback.

## Implementation discovery update (2026-09-26)

- **Confirmed DO candidate: Voice realtime/revocation.** `apps/web/server/routes/voiceGateway.ts` keeps live WebSockets in process-local `activeSessions`, uses Redis pub/sub to deliver consent withdrawal, and stores one-time session token plus active-session exclusion in Redis. Moving this endpoint to a stateless Worker without a shared connection owner would lose cross-instance revocation and single-session semantics. A per-user DO is the leading target for WebSocket ownership and consent-revocation delivery; token issuance/consumption should use a one-time PG row or the same authenticated DO contract. Keep user/tenant/consent checks fresh and authoritative in PostgreSQL.
- **DO candidate, pending runtime placement: Browser concurrency.** `apps/web/server/routes/browserTool.ts` uses Redis atomic per-user and per-tenant admission; `python-backend/app/services/browser_pool.py` also uses Redis tenant counters while owning Chromium contexts in the Python process. Cloudflare Containers/approved browser runtime must own the actual browser; admission can use a per-tenant DO or a PG-backed lease after the runtime contract is confirmed. A DO cannot replace Chromium execution.
- **Not DO candidates by default:** disposable SearchResultCache uses KV; credit/economic decisions and durable job leases stay in PostgreSQL/`worker_jobs`; approximate abuse rate limits can use Workers Rate Limiting. Exact tenant/user serialization gets a DO only after its key and fairness semantics are specified.
- **Decision:** DO is not required to enable the current SearchResultCache KV slice. Start the Voice DO contract and lifecycle handoff now because G5 discovery demonstrates a real shared-connection use case. The DO runtime/class implementation must follow the owning Spec 237/242 boundaries; Spec 245/232 records the Redis responsibility and cutover proof, and must not create a parallel DO runtime. Do not bind or deploy a DO namespace until auth, class migration and target evidence are reviewed. A DO is likely part of completing the full Redis/realtime migration, but is not a blanket Redis replacement.
- SocratiCode index tools were unavailable; this discovery came from targeted `rg` and bounded source reads. It confirms candidates, not production traffic or live ownership.

## Cutover

Use the user-approved beta pause. Stop new intake and the affected old consumer/scheduler, inspect canonical job state, reconcile uncertain provider side effects, switch route generation/owner exactly once, verify representative success/error/retry, and resume new transport. Do not delete Redis state until data ownership/retention is resolved. If one group blocks, leave it unchanged and continue independent groups.

## Tests before implementation

- Each group has a contract-level old/new parity and failure test; no silent Redis fallback after its cutover.
- Job dispatch duplicate, lease expiry, stale fencing, scheduler duplicate, DLQ and provider-unknown outcomes preserve one side effect.
- Auth revoke remains immediate/fresh under KV outage; tenant change and session expiry tests prevent stale authorization.
- DO tests cover same-entity serialization, different-entity parallelism, eviction/restart persistence, tenant isolation, class version compatibility and hot-key guard.

## Acceptance

- Spec 232 inventory reaches zero live Redis responsibilities or explicit approved out-of-scope entries.
- No Redis operation from SmartAIHub reaches production after retirement; no elapsed observation timer is required.
- All queue families have one owner each; PostgreSQL/worker_jobs remains canonical.
- DO remains absent from cache-only and stateless routes.

## UI/UX Contract

### Target User / JTBD

N/A. This section defines backend responsibility contracts and does not add or change a user-facing surface.

### Surface Inventory

N/A for this section; Admin control for Search Result Cache is owned by section 02.

### Component Map

N/A. Redis group adapters, job transports and optional DOs are backend-only in this section.

### State Matrix

N/A for browser states. Backend status and cutover states are defined by per-family acceptance contracts above.

### Responsive Matrix

N/A. No browser-visible UI is changed here.

### Accessibility Acceptance

N/A. No browser-visible UI is changed here.

### Copy Contract

N/A. No user-facing copy is introduced here.

### Browser Evidence Required

N/A. No browser-visible UI is changed here; backend tests and runtime evidence apply instead.
