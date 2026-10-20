# Section 07 — WP37: artifact-evidence

Priority: P1. Primary owners: SPEC-269/294 consumers; existing Library/R2/domain owners.

## Prerequisites

WP31 source/deliverable types and WP32 evidence envelope. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/workerJobMonitorService.ts; apps/web/server/services/taskObservabilityAcceptance.ts; existing Library/artifact/external receipt adapters`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Project report/document/spreadsheet/media/Skill/external record outcomes using immutable revision/digest plus acceptance/QC/access receipt. Keep draft/upload/publish/share/send/apply distinct. Use existing byte/record authorities, disclose local-only recovery limits and uncertain external effects.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Denied output dereference, expired link, changed external revision, attempted-but-unconfirmed send, missing QC and local-only artifact after device change. Read side never creates a retry/effect.

Scenario scope: `UW-03 UW-04 UW-06 UW-12 UW-19 UW-23 UW-25 UW-26` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-269-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

No new byte store or universal task ledger. Domain acceptance belongs to each output authority; artifact presence alone does not prove business effect.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
