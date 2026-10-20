# Section 08 — WP38: development-source-release

Priority: P0. Primary owners: SPEC-218/224/293/295.

## Prerequisites

WP31/32 conditional bindings; current SPEC224 live work and source policies preserved. Refresh canonical source and read current HandOff. This is a future implementation packet, not an execution grant.

## Owned scope to assign

`apps/web/server/services/developmentControlPlaneContracts.ts; scripts/development-lifecycle/workspace_authority.py; scripts/development-lifecycle/canonical_source.py; skills/integration-controller/scripts/promote_ready_pr.py; apps/web/scripts/linux_backend_release.py; relevant active GitHub Actions`. Existing shared modules require one editor and versioned consumer fixtures; do not concurrently change shared schemas. Actual task packets must enumerate exact ownership_paths and preserve other sessions.

## Observable deliverable

Add consumer bindings and source observation for remote canonical/local/tracking/worktree/last-verified/deployed refs. Use one integration authority with immutable checkpoints while siblings continue. Specify/add exact admitted SHA checkout and common local/Actions provenance through existing builder/release controllers; digest and component runtime verification stay separate.

## Implementation approach

1. Map existing owner records/APIs and select the smallest additive metadata/adapter boundary; inspect active call sites and flags.
2. Keep backward-compatible reads; separate profile visibility from execution admission. Negotiate any necessary owner migration before touching shared schema.
3. Implement a coherent slice, run focused checks, then integrate promptly through the existing policy path. Continue unresolved acceptance separately.
4. Record source/canonical SHA, exact result, remaining gaps and next action in the existing owner HandOff via tools.spec_handoff.

## Focused verification and acceptance

Disposable repo tests for stale base, dirty sibling, ref drift, missing ancestor, unauthorized builder, mutable ref and digest mismatch. Inject CI/resource/build/health failure and verify bounded recovery/rollback receipts without deployment here.

Scenario scope: `UW-14 UW-15 UW-16 UW-23 UW-29 UW-30 UW-34 UW-35 UW-36` in [acceptance.md](../acceptance.md). Bind each exercised assertion to owner requirements REQ-218-UWAC-01/02; REQ-224-UWAC-01/02; REQ-293-UWAC-01/02; REQ-295-UWAC-01/02; no blanket PASS from helper tests. Select exact pnpm/vitest or Python/Rust scope from the current package configuration. No repository-wide local typecheck.

## Failure and recovery

Use existing retries/idempotency/lease/fencing; classify resource failures separately. Observability failure cannot gate execution; authority failures stop only affected effects. Keep external side effects uncertain until reconciled.

## Known gaps and limits

Do not rewrite SPEC224 phase controller or close its live blockers. Disabled historical deploy-production workflow remains disabled. Production release/migrations require existing controls; no per-harness deploy route.

## Completion evidence

Source diff, focused test receipt, protected/non-force canonical integration receipt and official requirement-level evidence for the implemented scope. Deployment/production acceptance require separate authorized target evidence.
