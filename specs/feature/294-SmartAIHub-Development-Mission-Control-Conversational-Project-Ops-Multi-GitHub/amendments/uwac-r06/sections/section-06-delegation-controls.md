# Section 06 — WP36: delegation-controls

Priority: P0. Primary owners: SPEC-196/269/279 with 200/205/206 adapters.

## Prerequisites

WP31/32/34 contracts; exact current command/permission/economic owners. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/agentControlPlaneContracts.ts; apps/web/server/services/externalAgentRunnerDispatcher.ts; apps/web/server/services/runnerJobCommandContracts.ts; apps/runner-app/src/session_command_lane.rs; existing command ingress modules`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Bind parent/child objective, criteria, return route and attenuated permission/budget; bound graph depth/fanout and retries. Normalize actual supported controls, distinguish requested/accepted/applied, reconcile same canonical attempts across sessions and protocol routes. User actions retain existing action/domain authorities; agent controls use 279.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Three agents/two Skills with one failed child, duplicate/out-of-order returns, cycle/depth/budget escalation, cancelled parent, revoked route and provider disconnect. No silent paid fallback, double effect or double settlement.

Scenario scope: `UW-09 UW-10 UW-11 UW-17 UW-18 UW-21 UW-22 UW-24 UW-29 UW-31 UW-32` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-196-UWAC-01/02; REQ-269-UWAC-01/02; REQ-205-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Full universal ingress/A2A runtime not demonstrated. Extend only existing owners; real account/IAM/trust limitations block that live route, not unrelated contracts.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
