# SPEC-224 Goal Delegation Grant — Test Design

## Scope

Implement a fail-closed scope evaluator for Goal-level delegation sourced from an already-approved record in the canonical Approval Authority. This slice does not issue approvals, mutate approval records, or claim live dispatch. Existing Runner/session/capability checks and `worker_jobs` budget holds remain mandatory.

## Contract inputs

- Canonical approval evidence: approval ref, tenant, execution/goal id, requester/actor, status, approval counts, expiry, and immutable payload.
- Payload scope: grant id, goal id, workspace, repository, source SHA, allowed actions, write globs, required capabilities, budget ceiling/currency, issue/expiry and optional revocation marker.
- Child attempt: tenant, actor, goal, workspace, repository, source SHA, action, changed paths, required capabilities, job/attempt IDs, and exact held budget evidence.

## Tests

| ID | Case | Expected |
|---|---|---|
| G1 | Approved authority record with valid bounded scope and exact child hold | `READY_FOR_DELEGATION` and child binding scoped to job/attempt/source SHA |
| G2 | Pending/rejected/under-approved authority record | Denied; no binding |
| G3 | Tenant, actor, goal, workspace, repository, or source SHA mismatch | Denied |
| G4 | Child action/path/capability widens parent scope | Denied |
| G5 | Revoked/cancelled or expired grant | Denied |
| G6 | Missing, wrong-job, wrong-attempt, wrong-tenant, released, or cross-currency hold | Denied |
| G7 | Requested amount above grant ceiling | Denied |
| G8 | Concurrent child attempts are only individually scope-checked; aggregate spend must be enforced by canonical atomic economic holds, not this pure contract | Contract refuses to claim aggregate reservation authority |
| G9 | Duplicate child binding identity with changed scope/source | Denied by digest/idempotency mismatch |
| G10 | Raw credentials/secrets in scope payload | Denied |

## Verification

- RED/GREEN: focused Vitest for the pure contract, plus existing SPEC-224 binding/revocation tests.
- No live Runner, authorization backend, shared DB, or production data is used by these tests.
- Live acceptance remains separate and requires an approved Goal grant, isolated current-schema PostgreSQL, trusted enrolled Linux Runner and execution receipt.

## Current slice evidence (2026-10-10)

- RED observed before implementation: the focused Vitest suite failed to resolve `spec224GoalDelegationGrant` (module absent).
- GREEN after implementation: focused Goal Grant, DevelopmentRun, authorization binding/revocation and durable economics tests passed; see task PR/CI for the checkpoint SHA.
- The typecheck was limited to the new grant module and test. A broader typecheck of the DevelopmentRun import graph was stopped when it exceeded the scoped verification lane; repository-wide typecheck remains prohibited in this session.
