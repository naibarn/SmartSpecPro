# Spec 207 Implementation Plan

**Goal:** Establish the economic authority consumed by runtime and workflow features.

**Architecture:** Add typed policy and money contracts in the web backend, persist
  only the canonical economic records needed for idempotent reserve/ledger/
  settlement transitions, and correlate every effect with Feature 195 Job and
  attempt IDs. Existing Credits/payment code is adapted through narrow ports.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, tRPC/HTTP patterns already used
  by `apps/web`, Vitest, existing audit/event services.

**Spec:** `specs/feature/207-agentic-economic-control-plane/spec.md`

## Global Constraints

- Feature 195 owns Job, attempt, dispatch, outbox and canonical execution state.
- Feature 207 owns economic intent, budget, authorization, ledger and settlement.
- Tenant and actor authority is server-derived; payload claims are not trusted.
- Monetary arithmetic uses integer minor units and explicit currency.
- All reserve/capture/release/settlement transitions are idempotent.
- Retired Agency, `work/request(s)`, `workpacks/*`, `/workflows`, OpenSandbox,
  `sandbox_jobs` and Docker/OpenSandbox dispatch remain prohibited.
- No repository-wide TypeScript typecheck unless explicitly requested.

## Review Focus

- Duplicate reserve/capture requests must not double-charge or strand funds.
- A stale/wrong tenant or actor claim must not authorize an economic effect.
- Partial provider failure must leave a reconciliable state, not a false finality.
- Negative, fractional, overflow and currency-mismatch amounts must fail closed.
- Job retry/attempt changes must not create duplicate ledger facts.

## Dependency and file map

The first code wave stays in the existing web package:

- Modify `apps/web/drizzle/schema.ts` and add one forward-only migration for
  economic intent, budget/hold, ledger account/journal, settlement and audit
  projections; do not alter legacy tables destructively.
- Create `apps/web/server/services/economicControlPlaneTypes.ts` for branded
  money, intent, decision and transition types.
- Create `apps/web/server/services/economicControlPlane.ts` for policy,
  idempotency and reserve/capture/release orchestration.
- Create `apps/web/server/services/economicLedgerService.ts` for balanced
  double-entry journal writes and immutable event attribution.
- Create `apps/web/server/services/economicSettlementService.ts` for
  settlement/revenue allocation and reconciliation states.
- Create `apps/web/server/routers/economicControlPlane.ts` only for
  authenticated tenant-scoped read/approval/control operations.
- Add focused tests adjacent to each service and migration/schema tests under
  `apps/web/drizzle/__tests__`.

## Section 1: Contracts and authoritative admission

Define `Money`, `EconomicIntent`, `EconomicDecision`, `BudgetEnvelope`,
`ReservationTransition`, `LedgerCorrelation` and `SettlementState`. The public
admission function must accept server context plus a request containing only
intent data; it returns a decision and canonical IDs. It must require a
tenant/user/agent scope, a Job/attempt correlation for runtime work, bounded
idempotency keys and supported currency.

Tests cover valid admission, tenant mismatch, missing correlation, invalid
amount/currency, replay and policy denial.

## Section 2: Persistence and balanced ledger

Add forward-only tables/constraints for intents, budgets, holds, accounts,
journal transactions/lines, economic events and reconciliation records. The
ledger service must reject unbalanced entries, duplicate idempotency keys,
cross-tenant references and invalid account currency. Journal entries are
append-only; corrections are reversals or adjustments.

Tests assert SQL constraints, balance invariants, tenant scoping, concurrent
replay and rollback-safe migration ordering.

## Section 3: Reserve, capture, release and settlement

Implement a state machine with explicit legal transitions. Reserve checks the
budget and writes a hold plus journal facts atomically. Capture consumes the
hold only after a provider/Job receipt. Release returns unused value. A
settlement worker consumes outbox facts idempotently and records pending,
settled, reconciliation-required or reversed states without claiming external
finality prematurely.

Tests cover retries, provider timeout, late receipt, partial capture, release
after failure, duplicate outbox delivery and reversal.

## Section 4: Policy, routing and revenue attribution

Evaluate tenant, project, user, agent mandate, workflow and provider limits in
the documented precedence order. Return explainable denial/approval reasons.
Revenue allocations are derived from immutable pricing and publisher facts;
this layer must not mutate marketplace UI state or bypass payment ownership.

Tests cover policy precedence, approval-required effects, caps, publisher
attribution, currency conversion rejection and explainability fields.

## Section 5: API, audit and finance projections

Expose only authenticated tenant-scoped procedures for intent preview,
approval, hold status, transaction/settlement read, reconciliation and
emergency freeze. Every mutation emits an audit/outbox fact with correlation,
actor and policy version. Build data contracts for the later Finance UI but do
not invent a new visual surface in this spec.

Tests cover authorization, redaction, audit correlation, freeze behavior and
stable response shapes.

## Section 6: Migration, rollout and release gates

Map existing Credits/reservation/skill-revenue paths to the new contracts with
dual-read/compatibility adapters only where source evidence supports it.
Provide backfill validation, dry-run reconciliation, rollback notes and
feature-gated activation. Production provider certification and financial
reconciliation remain explicit gates.

Tests cover legacy compatibility, backfill idempotency, feature-off behavior,
migration verification and release report generation.

