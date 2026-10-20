# Section 03 — WP33: unified-experience

Priority: P1. Primary owners: SPEC-198/277/287.

## Prerequisites

WP31/32 stable consumer contracts; preserve existing UI capabilities. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/client/src/pages/Chat.tsx; apps/web/client/src/pages/TaskObservabilityMonitor.tsx; apps/web/client/src/components/task-control/TaskAcceptanceEvidence.tsx; existing navigation/router files`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Make Chat the general entry with explicit Work/Skill/Develop conversion. Add Simple/Developer lens preference and contextual task/timeline drilldown using the same projection. No-Git context uses inputs/results; developer Git/log/CI/release details appear only when relevant. Use existing Astryx frame/tokens/components and accessibility conventions.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Rendered functional checks at 390×844, 820×1180, 1440×900, keyboard and screen reader; output links, timeline expansion, disabled controls and stale/error recovery. Assert lens/device fact parity using token/scope, not screenshots alone.

Scenario scope: `UW-01 UW-02 UW-13 UW-19 UW-20 UW-21 UW-22 UW-26 UW-27 UW-33` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-198-UWAC-01/02; REQ-277-UWAC-01/02; REQ-287-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Run Astryx build/docs layout/component discovery before writing UI. Source-only review cannot close conformance. Do not remove current navigation or controls.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
