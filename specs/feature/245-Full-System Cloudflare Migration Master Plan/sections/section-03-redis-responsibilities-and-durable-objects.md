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
