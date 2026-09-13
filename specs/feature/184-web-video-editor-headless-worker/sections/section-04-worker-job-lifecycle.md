# Section 04 — Worker job API, scheduler, leases, and billing

## Scope and dependencies

Extend the existing `worker_jobs` queue and `/api/worker-jobs/*` protocol using Section 01 envelopes and Section 02 revision pins. Do not create a second queue, status table, or worker transport.

## Tests first

- Add `apps/web/server/routers/__tests__/editorMediaJobs.test.ts` for typed preflight/submit/get/list/cancel/retry/replay/apply authorization, tenant isolation, stable error codes, trace IDs, expiry and idempotency.
- Add service tests for queue capacity/fairness/aging, capability freshness/hash/version, atomic claim, lease fencing, transition table, stale event/upload, cancellation race, retry/backoff and all credit states.
- Re-run existing worker-job family tests for Remotion, Vertical Drama, Feature 179/180 and cancellation/output compatibility.

## Implementation

Add `apps/web/server/routers/editorMediaJobs.ts` (or a documented extension of `workerJobs.ts`) and register it in `apps/web/server/routers.ts`. Procedures validate session/CSRF/origin, tenant ownership, asset access, plan/revision hash, quota, capability and queue capacity before reserving credit. Store the v1 envelope in `worker_jobs.inputJson`, requirements in `capabilityRequirementsJson`, execution controls in `instructionsJson`, and verified result in `outputJson`.

Extend `workerSchedulerService.ts`, billing, monitor and `routes/workerRuntime.ts`: capability snapshots expire; claim/event/renew/upload are fenced by lease token and attempt ID; server enforces lowercase existing statuses and an explicit transition table. Credit lifecycle is idempotent (`not_required → reserved → consumed|released`) keyed by idempotency key plus plan hash. Return `QUEUE_CAPACITY_EXCEEDED` before reservation. Retry creates a new fenced attempt while preserving logical job identity; stale callbacks are no-ops with audit evidence.

## Acceptance and evidence

Record API contract tests, scheduler/lease/billing tests, and existing-family regression commands. This section provides AC-05, AC-08, AC-09, AC-10, AC-13, AC-15, and AC-16 queue proof.

## Safety and rollback

Keep old validators and routes untouched for old families. Feature-flag new operations; disable admission on rollback while valid leased jobs finish under existing policy.

## Implementation status

Implemented `apps/web/server/services/editorMediaJobContract.ts` and the authenticated `editorMediaJobs.submit` procedure. The route validates tenant-owned ready media, feature/kill-switch state, idempotency, executable video timeline, reserves credits, and inserts the v1 envelope into existing `worker_jobs` columns. Existing scheduler claim/event lease fencing is reused; production retry/lease and billing reconciliation proof remain gated, and unsupported probe/proxy/analysis operations fail closed until their adapters are ready.

## UI/UX Contract
### Target User / JTBD
Creator needs predictable admission, progress, and failure reasons for heavy work.
### Surface Inventory
Preflight, approval, queue status, cancel/retry, and job detail diagnostics.
### Component Map
Router/scheduler own policy; Worker Jobs UI renders server snapshots.
### State Matrix
Preflight, blocked, queued, claimed, running, uploading, publishing, terminal.
### Responsive Matrix
Full controls on desktop/tablet; mobile supports status/cancel/retry.
### Accessibility Acceptance
Status uses live regions, focus-safe dialogs, and labelled retry/cancel controls.
### Copy Contract
Thai stable messages for capacity, capability, credit, lease, and authorization errors.
### Browser Evidence Required
Route-level jsdom and authenticated Playwright queue state evidence.
