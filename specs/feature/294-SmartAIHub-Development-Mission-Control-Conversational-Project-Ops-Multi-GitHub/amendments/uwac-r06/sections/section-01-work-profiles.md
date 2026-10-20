# Section 01 — WP31: work-profiles

Priority: P0. Primary owners: SPEC-196/269.

## Prerequisites

G0 source/identity audit; existing context/job owners agree metadata compatibility. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/shared/workOrchestrator.ts; apps/web/shared/taskGoalProgress.ts; apps/web/server/services/orchestratorCapabilityCatalogService.ts; apps/web/drizzle/schema.ts only if existing metadata cannot represent requirements`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Negotiate additive typed profile/context/source bindings on existing canonical records. Keep Goal semantics in 196, assistant/team lifecycle in 269, physical execution in worker_jobs/outbox. NONE is valid and Git fields are conditional. Define parent/dependency/acceptance/delivery bindings, profile/schema version and backward reads. Exclude retired values from all new admissions without reviving or deleting historical systems.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Scope spoofed tenant/App/Project, missing Git, unrecognized version, retired type and duplicate correlation. One non-code report, one Skill, one authoring and one development-child fixture share canonical IDs without a second ledger.

Scenario scope: `UW-02 UW-03 UW-09 UW-13 UW-28 UW-29 UW-32` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-196-UWAC-01/02; REQ-269-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Existing active schema/state ownership must be checked before a migration. Preserve queued jobs and existing context ACL; legacy direct/retired paths remain excluded.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
