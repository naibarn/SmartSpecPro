# Section 03: Bound Worker, Channel Handoff, and Callback Flows

## Ownership

This section owns the user-facing integration path where Hermes behaves as a personal external agent that can be bound into teams and report work back into SmartSpecPro.

## Target files and modules

- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/*`
- `python-backend/hermes_bridge/*`

## Scope

- make Hermes workers eligible for `external_connector` binding when capability and policy checks pass
- allow Hermes worker callbacks to update rooms, workflows, and user notifications
- define channel-companion semantics for Hermes-owned messaging platforms
- keep owner-bound and tenant-bound guardrails intact
- require Hermes callback publishing to reuse the existing worker callback ingress and trust boundaries

## Implementation notes

- Hermes should use the existing bound-worker UI and service flow rather than inventing a new member kind
- channel integration should be metadata-first:
  - SmartSpecPro knows which Hermes worker exposes which channel families
  - Hermes continues to own the actual messaging tokens and sessions
- room/workflow callbacks should remain auditable and lease-bound
- Hermes bridge callbacks should be sent only through the existing `/api/worker-jobs/:jobId/publish-*` worker runtime routes using `worker_execution` tokens and `workers:report` scope
- callback publishing should preserve current idempotency, payload size, rate-limit, and allowlisted-link protections instead of adding a Hermes-specific public webhook path
- pause and follow-up semantics should stay compatible with the existing `external_connector` posture

## TDD expectations

- add owner-bound binding tests before Hermes becomes selectable in Teams
- add callback publication tests before UI updates are surfaced
- add negative tests for cross-user, cross-tenant, and missing-capability channel bindings
- add route-boundary tests proving Hermes callbacks are rejected when worker token scope, idempotency, or callback-link policy does not satisfy the existing worker callback contract

## Acceptance checks

- a user can bind their own Hermes worker through the current `external_connector` model
- Hermes callbacks can report progress and links back into SmartSpecPro rooms/workflows
- channel-companion metadata is visible without exposing raw Hermes platform secrets
- cross-user or cross-tenant Hermes bindings are rejected
- Hermes callback publication does not depend on a separate public webhook surface outside the worker runtime API contract

## Risks and coordination notes

- channel posture is the highest product-risk area because it can create shadow workflows if ownership and audit are not explicit
- the main security risk is accidental introduction of a second callback ingress that is easier to spoof or weaker than the existing worker callback path
