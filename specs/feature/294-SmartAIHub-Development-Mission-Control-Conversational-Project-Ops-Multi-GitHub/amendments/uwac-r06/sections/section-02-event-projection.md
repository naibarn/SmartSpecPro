# Section 02 — WP32: event-projection

Priority: P0. Primary owners: SPEC-294 plus 200/205/206 producers.

## Prerequisites

WP31 metadata/event boundary agreed; can progress in parallel on independent reducer fixtures. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/taskObservabilityReadModel.ts; apps/web/server/routers/workerJobs.ts; apps/web/server/services/agentControlPlaneContracts.ts; apps/web/shared/taskAcceptanceProjection.ts`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Extend existing observation projection with normalized source events, original/native identities, work/session/parent bindings, stop reason/health/progress and artifact/Skill evidence. Design bounded replay/dedup/gap/watermark behavior and truthful mutable-field coverage. Observation outage cannot gate workers; do not create a new event scheduler/store.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Out-of-order/duplicate events, source clock skew, missing history, expired token, unknown provider state and tenant revocation. Same token/scope yields same immutable claims; live mutable fields explicitly labelled.

Scenario scope: `UW-09 UW-11 UW-12 UW-19 UW-20 UW-21 UW-23 UW-26 UW-27` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-294-UWAC-01/02; REQ-200-UWAC-01/02; REQ-205-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Current read model exposes live mutable task state under an as-of snapshot; do not claim historical immutability until persistence/replay proves it. A2A mapping may remain unavailable.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
