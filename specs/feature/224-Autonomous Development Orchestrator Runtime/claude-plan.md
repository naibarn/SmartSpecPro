# Implementation Plan — Developer Autonomous Mode

## Objective and fit

Implement the smallest local-development fast lane using SPEC-224 and the existing Agents SDK WorkUnit harness. The initial verified repository permission is GitHub `admin` for the authenticated `gh` subject; this is repository permission evidence only, not SmartSpec tenant ownership or protected-runner authority. Local live execution must use a policy/auth path that binds the actual developer principal and fail closed where binding is unavailable.

## Slices

1. **Local developer authorization and workspace provisioning** — define an existing-policy-backed R1/R2 local decision, generate Task ID, create an isolated task worktree from the fetched canonical SHA, bind authenticated caller/session/process identity, lease/fence, allowed paths and budget, and return a durable workspace receipt. Do not change protected dispatch.
2. **Continuation and scoped execution** — add atomic claim/reclaim in the existing registry/persistence boundary with process/lease/source checks and fencing; make every mutating WorkUnit tool revalidate ownership; resume existing Agents SDK RunState/tool receipts without repeating side effects. Keep budget exhaustion and production risk as waits/decisions.
3. **CI candidate repair** — separate PR-head, synthetic test-merge and merge-group SHA semantics in critical check binding; add positive synthetic-merge regression and negative stale/wrong/missing/failed/skipped/duplicate cases. Use a fresh authorized task branch from candidate `d826f71bde6c995260e7dbb9ae6925aef29b08a9`; keep baseline failures separate.
4. **Working UI proof and delivery** — use a disposable Mini-App fixture for an actual small UI change, scoped tests, forced repair/restart, browser UAT, trace/screenshot and final verify; report Dev Preview only when the runtime is reachable. Do not claim protected Runner or production acceptance.

## Affected areas

- Existing lifecycle: `scripts/development-lifecycle/workspace_authority.py` and its tests.
- Existing local SDK runner: `experiments/agents-sdk-codex-subscription/spec_workunit_contract.py`, `run_spec_workunit.py`, durable store, test/browser UAT harness.
- Existing SmartSpec authorization/runtime: `apps/web/server/services/spec224AuthorizationService.ts`, `spec224RuntimeAdmission.ts`, `spec224DevelopmentRunPersistence.ts`, `spec226DevelopmentControl.ts`, plus focused tests only where local dispatch must integrate.
- CI candidate workflow files and tests only in the separate CI slice.

## Security and integration constraints

- Authenticated app/repository identity must be verified by the canonical authority, never inferred from session name or CLI account label alone.
- Local R1/R2 permission is repository/project/path scoped and must not authorize paid provider, Gateway, shared DB, Runner dispatch, PR merge, production or deployment.
- Claim uses atomic compare-and-swap, monotonic fencing, durable transfer receipt and idempotency key; lease expiry alone is not proof a live process has exited.
- Share one file ownership surface at a time and integrate only through normal non-force protected PR flow. Never edit the dirty primary checkout.

## Verification

- Focused workspace-authority tests for registered task creation/active lease, denied identity/scope, concurrent claims, expired lease with live process, stale owner/fence, wrong SHA, crash/replay and no duplicate effects.
- Focused authorization/admission tests for local R1/R2 success and protected operation denial; preserve existing suites and gates.
- Existing Agents SDK focused tests plus one disposable end-to-end WorkUnit with durable receipts and browser UAT.
- PR workflow regressions distinguish head SHA from test merge SHA and keep all invalid critical-check cases fail-closed.
- No repository-wide typecheck/build in the shared implementation session.

## Rollout / rollback

Local lane is opt-in until focused checks pass, then becomes the default only for policy-authorized R1/R2 developer tasks. On any identity, workspace, source or fence uncertainty, leave the run resumable/blocked without executing tools. Protected dispatch and production operations retain their current authorization paths. The change can be disabled/reverted through the existing local execution selector without changing data schema outside the existing workspace registry migration pattern.
