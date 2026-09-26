# Section 01 — Durable workflow-run foundation

## Objective

Create the durable Spec 209 projection that binds an authenticated run intent
to one immutable Workflow Version and one or more canonical Feature 195 Jobs.
This section is the prerequisite for every run, checkpoint, lifecycle, result
and UI state.

## Dependencies and ownership

- Depends on existing workflow Studio schema/contracts and Feature 195 Job
  control-plane contracts.
- Owns workflow-run projection contracts, checkpoint/readiness/invocation
  projection records, repositories and migrations.
- Does not own canonical Job status, attempts, leases, outbox or economic
  ledger state.

## Planned changes

1. Add typed contracts for run intent, run mode, run projection, checkpoint,
   dependency snapshot, entitlement decision and workflow event projection.
2. Add additive Drizzle schema/migration for tenant-scoped workflow runs,
   checkpoints, readiness snapshots and invocation/entitlement facts. Store
   exact definition ID, version ID, content hash, input fingerprint, run
   revision, idempotency key and canonical Job correlation.
3. Add indexes for tenant/time, canonical Job, Workflow Version, status/revision
   and idempotency. Enforce uniqueness for tenant + idempotency key.
4. Add a transaction-safe repository/service for create/replay, exact-version
   validation, projection updates and event idempotency.
5. Add safe redaction for provider references, raw URLs, secrets and payloads.

## Contract boundary

The service must support create/replay, get run, get checkpoint/readiness and
apply canonical event projection. All methods receive server-derived tenant and
actor context. A run projection may reference a Job but may not mutate Job
terminal state outside the canonical control plane.

## TDD-first verification

- Migration and runtime schema parity.
- Same-key replay returns the same run; changed version/input under the same key
  is rejected.
- Cross-tenant Job/version/checkpoint references are rejected.
- Duplicate, stale and out-of-order events are idempotent.
- Redaction removes secrets and raw provider/storage URLs.

## Acceptance

No workflow run can exist without exact version, tenant/actor scope, input
fingerprint and idempotency key. The section must pass focused Vitest and
migration tests before Section 03 can submit Jobs.

## UI/UX Contract

### Target User / JTBD

Workflow authors and operators need to know whether a run can be created,
which exact version is selected, and why a duplicate or stale request was
replayed or rejected.

### Surface Inventory

- Existing Workflow Studio run drawer and run-intent summary.
- Existing Worker Jobs detail/timeline surface for canonical correlation.
- Existing toast/inline validation patterns for rejected or replayed intents.

### Component Map

- Reuse the existing Workflow Studio shell, run drawer, status badge and
  Worker Jobs timeline components.
- Add only a version/readiness summary, idempotency/replay message and
  tenant-safe correlation link; do not introduce a new visual language.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| ready | Exact version and input fingerprint summary | Continue to admission |
| replayed | Existing run reference and replay explanation | Open existing run |
| stale/rejected | Reason code and safe remediation | Select a current version or edit input |
| loading/error | Progress or recoverable error | Retry read or return to editor |

### Responsive Matrix

Preserve the existing mockup layout at mobile 390x844, tablet 768x1024,
laptop 1280x800 and desktop 1440x900; summary metadata may stack, but primary
run/replay actions remain visible without horizontal scrolling.

### Accessibility Acceptance

Expose status and rejection reason as text, preserve keyboard focus after
replay/rejection, use labelled controls, and do not rely on color alone for
tenant/version or readiness distinctions.

### Copy Contract

Use explicit copy such as “ใช้ Workflow version นี้”, “เปิด run เดิม”,
“version เปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง” and “ยังเริ่ม run ไม่ได้”;
never imply execution started before canonical admission.

### Browser Evidence Required

Capture authenticated Playwright evidence for ready, replayed, stale and
rejected states from the existing Dashboard → Workflow Studio path at the
four responsive sizes above.
