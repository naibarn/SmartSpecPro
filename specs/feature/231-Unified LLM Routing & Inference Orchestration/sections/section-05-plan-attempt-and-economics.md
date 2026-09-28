# Section 05 — Plans, attempts and canonical economics

## Goal

Record one idempotent logical call, bound all paid attempts, and reconcile actual execution against the existing credit authority.

## Implementation

1. Inspect existing schemas before additive migrations; add only missing plan/attempt, version, ownership epoch, rollout bundle, charge state and evidence references.
2. Reserve a single parent ceiling using the canonical credit service and fixed-point amounts before dispatch.
3. Persist immutable plan and attempt rows with idempotency, owner epoch, deadline, provider IDs, stream commit sequence and terminal status.
4. For job-linked plans and attempts, append lifecycle events to canonical `worker_job_events` in the same PostgreSQL transaction as each state change. Keep `worker_job_outbox` exclusively for dispatch intents; connect durable work only through `worker_jobs`.
5. Before returning completed paid output, require the existing credit owner to accept an idempotent settlement keyed by physical attempt ID. Missing measured cost or failed settlement must withhold the provider response and return a typed reconciliation state; do not add a competing wallet or settlement ledger.
5. Reconcile late provider usage/invoice mismatch to provisional or disputed liabilities; never double-settle or erase an unknown charge.

## Current implementation delta (2026-09-27)

- Added migration `apps/web/drizzle/0353_spec231_inference_plans_attempts.sql` and matching Drizzle declarations for immutable plans and fenced attempt evidence.
- Added `apps/web/server/services/inference/persistence.ts` for idempotent plan persistence, owner-token-digest fencing, a pre-I/O `unknown` submission state, and schema-validated terminal receipts.
- Attempt receipts keep intended route IDs separate from observed provider/deployment/credential/surface identity; completed outcomes require observed identity and exact agreement with the receipt fields.
- Added `creditService.getCreditReservationSnapshot` as a read-only lookup of the current Redis-owned reservation and `createCreditReservationAuthorityLoader` to bind that lookup to server-authenticated user, tenant, and principal scope. The execution coordinator requires this loader and rechecks owner state before attempt creation and immediately before provider I/O; missing, stale, mismatched, malformed, or unavailable state fails closed. This is a preflight/revalidation seam, not an atomic credit draw or settlement flow.
- Durable job and attempt IDs reference `worker_jobs`/`worker_job_attempts`; the reservation is only referenced by ID and remains owned by the existing credit service. No second job queue, outbox, wallet, or settlement owner was added.
- Current Spec 231 combined local suite: 25 files / 187 tests passed; migrations 0353–0356 were applied to a disposable PostgreSQL 17.11 fixture. PostgreSQL tests cover AUTO selection from persisted policy/profile heads, eight concurrent same-process plan submissions and four independent Node processes submitting one plan idempotency key; each race produces one canonical plan. A controlled-provider coordinator run also persists its terminal attempt through the real PostgreSQL store. A stale-generation completion from another process is rejected. Focused credit/reservation/coordinator tests: 4 files / 48 tests passed. PostgreSQL 15/full-schema migration, simultaneous lease-claim races, credit draw atomicity and outbox coupling, settlement/recovery, authenticated provider execution and production tests remain unverified. `drizzle-kit check` is blocked by the pre-existing 0146/0147 parent-snapshot collision; those snapshots were not altered.
- Further chat AUTO update (2026-09-27): when the same trusted policy/registry snapshot admits another route, the gateway pins the next-ranked candidate as one preapproved fallback and reserves the combined estimated cost before dispatch. The attempt budget is two; provider/model locks retain their ask/deny behavior. Existing retry checks still stop on unknown outcomes, committed streams, uncertified submitted-request replay, non-transient failures, budget exhaustion, and deadline exhaustion. Local tests cover the AUTO fallback reservation and verify a provider lock is not silently relaxed. This is code and disposable-database test evidence only; no live provider or Production execution was tested.

## Tests first

- Disposable database migration and rolling-version compatibility.
- Concurrent budget reservation, idempotency and duplicate request behavior.
- Failure at each transaction/outbox boundary and rollback invariants.
- Timeout before/after submit, late usage, cancellation, invoice discrepancy and recovery.

## Acceptance

- Existing wallet/ledger remains the sole credit authority.
- Every paid call has one logical ID and a bounded parent cost ceiling.
- Ambiguous provider results never trigger blind paid replay.

## UI/UX Contract

### Target User / JTBD
N/A — storage and attempt lifecycle only; no user-facing flow is changed here.

### Existing Pattern Reference
N/A — no UI surface is designed or modified in this section.

### Surface Inventory
N/A — no UI surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — attempt lifecycle is a server-side durable record; Section 09 owns user-visible status.

### Responsive Matrix
N/A — no UI layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
N/A — no user-facing copy is introduced.

### Browser Evidence Required
N/A — no browser-facing changes.
