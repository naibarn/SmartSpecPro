# Section 02: Durable Persistence And Migration

## Purpose

Create durable Hybrid execution and stage persistence so started executions survive reloads, Redis loss, and rolling deploys.

## Depends On

- `section-01-contracts-flags-routing-fixtures`

## Blocks

- neutral router start/resume/cancel
- stage runner
- workspace UI
- commit executor idempotency
- release replay gates

## Files Owned By This Section

- `apps/web/drizzle/schema.ts`
- generated Drizzle migration files
- `apps/web/server/services/hybridOrchestrationStore.ts` (new)
- `apps/web/server/services/__tests__/hybridOrchestrationStore.test.ts`
- any generated schema mirror files required by the repo's build process

## Data Model

Prefer new Hybrid-specific durable tables unless implementation discovery proves existing generic runtime tables already satisfy the same read model with lower risk.

Minimum records:

- `hybridExecutions`
- `hybridExecutionStages`

Each execution must store:

- tenant id
- user id
- optional conversation id
- optional legacy agency id
- origin surface
- status
- objective
- routing decision
- current stage id
- total credits used
- runtime contract version
- Hybrid plan/result schema versions
- SDK and adapter version metadata when available
- timestamps

Each stage must store:

- execution id
- stage index
- stage type
- owner
- executor id
- status
- input envelope
- normalized result envelope
- error code
- idempotency key
- trace refs
- timestamps

## Migration Discipline

Use expand -> dual-read/backfill -> cutover -> contract.

Rules:

- add schema additively
- do not drop or rename legacy fields in this feature
- started executions read durable store first
- Redis remains preview cache and compatibility fallback
- backfill should not try to reconstruct expired Redis previews
- repeated start from the same preview is idempotent
- tenant/user mismatch fails closed

## Preview Token Policy

Preview tokens are not durable execution records.

Requirements:

- no secrets or provider credentials in token payload
- tenant/user scoped
- single-purpose start behavior
- TTL no longer than 30 minutes
- repeated start attempts return existing execution or fail idempotently
- expired preview can be regenerated only from the original chat message when access is still valid

## TDD Expectations

Write tests first for:

- execution creation from preview
- repeated start idempotency
- ordered stage persistence
- Redis miss after start still reads durable execution
- tenant/user mismatch rejection
- status transition validation
- migration smoke query shape
- single-purpose preview start behavior
- expired preview regeneration authorization

## Acceptance Checks

- Generated migration is additive.
- Store service can create, read, update stage, and mark terminal state.
- Durable reads do not require Redis for started executions.
- Legacy preview compatibility behavior is documented.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation. This section provides persistence state that later UI sections render.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Hybrid workspace | `/hybrid/:executionId` | no UI change here; durable data source only |

### Component Map

N/A. No React components are owned by this section.

### State Matrix

N/A. Data states must support UI states, but rendering is owned by section 07.

### Responsive Matrix

N/A. No layout work.

### Accessibility Acceptance

N/A. No browser-visible change.

### Copy Contract

N/A. No user-facing copy.

### Browser Evidence Required

N/A. Validate through persistence tests in this section; browser evidence occurs in section 07.
