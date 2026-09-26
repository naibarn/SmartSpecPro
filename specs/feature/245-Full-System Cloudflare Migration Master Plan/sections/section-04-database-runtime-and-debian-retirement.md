# Section 04 — Database, Runtime and Debian Retirement

## Goal

Complete the remaining migration from Debian-hosted application/runtime dependencies to Cloudflare-compatible Workers, Containers, Queues, managed PostgreSQL and approved external workers, then prove Debian no longer serves an active dependency.

## Work areas

1. **PostgreSQL:** inventory schema, extensions, advisory locks, LISTEN/NOTIFY, triggers, transactions, pool behavior, backup and restore. Keep one writer. Use Hyperdrive only after driver/network/pool tests; move primary through a consistent snapshot plus replication/reconciliation or a planned write pause and exact delta/checksum validation. Never claim that R2/Vectorize migration also moved relational authority.
2. **Node/Python:** classify every service, package API call, filesystem/native dependency, CPU duration, memory and outbound network need. Place stateless supported routes on Workers; long-running/native/media work on approved Cloudflare Container or Runner. Preserve Feature 195, Specs 224/242 boundaries.
3. **Ingress/schedules:** inventory DNS, custom domains, TLS, callbacks/webhooks, mail/egress, recurring tasks and static assets. Ensure one scheduler and one callback authority, byte-preserving signature verification, no proxy recursion and no origin bypass.
4. **Existing Cloudflare destinations:** verify R2 object authorization/checksum and Vectorize tenant ACL, deletion/rebuild behavior and job consistency; do not unnecessarily retransfer known-good data.
5. **Host retirement:** stop and observe Debian services after all callers moved; simulate long-period schedules and rare callbacks; run network-deny/power-off smoke; keep recoverable image/data according to retention; remove credentials only after no active consumer can use them.

## Tests before implementation

- PG schema parity/checksum, writer exclusion, PITR restore and ambiguous commit/idempotency drill.
- Node method-level compatibility probes, Container startup/resource/network policy and Runner reconnection/fencing where applicable.
- Route graph prevents loops; webhook verifies raw signed bytes; scheduler uniqueness prevents duplicate paid work.
- R2/Vectorize lifecycle and authorization contracts pass; full journey includes auth, tenant data, credit/job, artifact read/write, callback and reconnect.
- Debian network-deny identifies no required caller; powered-off mode continues the supported business journey.

## Acceptance

- Every production ingress, egress, schedule, service, worker and storage dependency has a Cloudflare target or approved explicit exception.
- Managed DB and all target bindings have real environment proof before calling the production path complete.
- Full-system `M245.10` has separate Debian retirement evidence; the Redis 14–30 day wait is not reused as a blocker.

## UI/UX Contract

### Target User / JTBD

N/A. This section defines database/runtime migration and host-retirement operations, not a browser feature.

### Surface Inventory

N/A. Any operational admin UI is handled by its owning subsystem section.

### Component Map

N/A. No browser component is added or changed here.

### State Matrix

N/A for browser states. Runtime/deployment state is covered by the acceptance matrix above.

### Responsive Matrix

N/A. No browser-visible UI is changed here.

### Accessibility Acceptance

N/A. No browser-visible UI is changed here.

### Copy Contract

N/A. No user-facing copy is introduced here.

### Browser Evidence Required

N/A. No browser-visible UI is changed here; target journey and operations evidence apply instead.
