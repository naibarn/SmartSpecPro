# Section 06 — Provider surfaces, state and jobs

## Goal

Execute a pinned plan through Cloudflare AI Gateway, direct/native providers or authorized local runners without losing ownership, state, stream or job guarantees.

## Implementation

1. Add one adapter per certified execution surface with explicit payload fidelity, deadline, cancellation and observed-identity receipt.
2. Prove Dynamic Route identity at dispatch and response; when exact immutable pin cannot be proven, emit `ROUTE_PIN_UNAVAILABLE` and do not dispatch that dynamic route.
3. Represent portable conversation state, tool-call mappings, committed effect receipts and pending approvals. Automatically migrate only certified equivalent continuation; otherwise require a typed replan/consent state.
4. Enforce attempt fencing and pre/post-stream-commit fallback policy. After output commit, report interruption rather than silently restarting elsewhere.
5. Inline streams stay request-owned. Durable inference uses existing `worker_jobs` and outbox; Queues only transport wakeups.
6. Local execution requires registered runner ownership, tenant ACL, model provenance, resource capacity and live revocation snapshot.

## Tests first

- Route repoint/preflight/postflight identity, fallback candidate mismatch and quarantine.
- Continuation portability, opaque reasoning, provider tool IDs and context migration refusal.
- Stale owner epoch, repeated effect receipt, stream chunk sequence and cancellation.
- Duplicate durable delivery, crash recovery, deadline hierarchy and no `waitUntil` finality.
- LOCAL_ONLY no-cloud behavior and runner capacity/owner revocation.

## Acceptance

- Every receipt distinguishes intended from observed execution identity.
- No attempt can be dispatched or settled by a stale owner.
- No duplicate provider submission or tool effect occurs after replay/duplicate delivery.

## Current implementation delta (2026-09-27)

- Added `apps/web/server/services/inference/executionCoordinator.ts` to validate the plan and intent hash, re-resolve and requalify each pinned deployment, require a live credit-reservation owner loader before attempt creation and immediately before provider I/O, check the canonical attempt fence, enforce the deadline with an abort signal, persist observed identity, and apply the existing retry policy only to a plan-listed fallback. `createLlmRouterExecutionBindings` requires and propagates the loader.
- Ambiguous exceptions and deadlines are persisted as unknown outcomes and terminate without fallback. Completed route identity mismatch is preserved as evidence and returned as a quarantine result instead of success.
- Reservation checks fail closed for missing, failed, expired or insufficient owner snapshots; a reservation change after attempt preparation writes a typed `not_submitted` receipt and prevents provider dispatch. Tests cover those cases.
- A completed attempt now requires measured `chargedCostMicros` and an idempotent settlement acceptance from the existing credit owner before response content is returned. Missing cost or owner rejection yields `settlement_pending`; the `llmRouter` binding uses the current Redis-backed credit reservation owner and physical attempt ID as its settlement key. Tests cover ceiling conversion, tenant mismatch, owner/draw failure and withheld output. Durable automatic reconciliation is not implemented.
- `reconcileInferenceAttemptSettlement` reloads only a terminal completed receipt from PostgreSQL and retries settlement with the same attempt ID; it never invokes the provider. Job-linked settlement pending/confirmed results are appended to `worker_job_events` with retry-deduplicated event keys. The job runtime does not yet invoke this reconciler automatically.
- PostgreSQL integration now executes a valid plan through the real execution coordinator and database attempt store with a controlled provider callback, verifies a terminal completed receipt, reloads it for replay-free settlement reconciliation, and checks idempotent `worker_job_events` sequencing for job-linked pending/confirmed settlement outcomes. This verifies local coordinator/storage composition only; it does not authenticate against a real provider or adopt a production caller.
- `executePolicyRoutedInference` now composes persisted AUTO/policy planning, immutable plan persistence, exact pinned execution bindings, coordinator execution and the existing credit-owner settlement in one caller-facing service. PostgreSQL integration verifies this complete composition with a controlled provider and confirms the attempt reaches a terminal completed row. The façade requires caller-owned reservation and canonical job/attempt ownership when durable; it creates neither. No production endpoint or job runtime adopts it yet.
- A separate Node process attempting to complete a job-linked attempt with generation-1 credentials after canonical `worker_jobs` and `worker_job_attempts` advance to generation 2 is rejected; the durable attempt remains `submitting`/unknown. The test uses the canonical fence fields in a disposable PostgreSQL fixture.
- `executionCoordinator.test.ts` also covers success, observed route mismatch, unknown-outcome no-retry, approved fallback, stale registry revision, intent/hash mismatch and timeout.
- This remains an unadopted coordinator seam. A scope-bound reservation loader and settlement adapter use the existing Redis-backed credit owner; no PostgreSQL credit settlement ledger or automatic job-runtime reconciliation exists. Production caller adoption, complete authenticated deployment/authority loading, Gateway/local adapters, durable job caller, tool-state handoff and live-provider certification remain necessary before Section 06 acceptance.

## UI/UX Contract

### Target User / JTBD
N/A — provider, stream and durable-job adapters only; no UI is implemented in this section.

### Existing Pattern Reference
N/A — no UI is designed or modified in this section.

### Surface Inventory
N/A — no UI surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — typed execution outcomes only; visible states are covered by Section 09.

### Responsive Matrix
N/A — no UI layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
N/A — stable execution reason codes are localized in the caller surface, not in adapters.

### Browser Evidence Required
N/A — this section has no browser-visible changes; stream tests provide service evidence.
