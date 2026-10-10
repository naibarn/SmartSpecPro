# Autonomous Completion Skill Candidate v1

Status: `REPOSITORY_CANDIDATE_NOT_ACTIVATED`
Candidate base: `c2dcab56648f1e9c8a7b662e465023bd861a7bd2` (`origin/main` at audit start)
Scope: strengthen the existing Orchestra and shared lifecycle policy; no parallel controller.

## Inventory and disposition

| Installed/repository skill | Disposition | Audit finding |
| --- | --- | --- |
| `orchestra` | STRENGTHEN | Existing routing and completion loop are authoritative. Added regression scenarios for capability loss, authorization denial, ownership collision, exact-SHA build and resume. |
| `development-lifecycle` | STRENGTHEN | Existing shared deterministic kernel already covers blocker challenge, durable waits, safe checkpoints and evidence-based closure. Added explicit decisions for the missing compatibility edges. |
| `session-finish` | KEEP | Already checkpoints fast-gate-safe progress and preserves dirty or owned work. |
| `integration-controller` | KEEP | Already reconciles canonical state and promotes safe work through non-force paths. |
| `canonical-checkout-sync` | KEEP | Already prepares leased exact-SHA isolated workspaces and preserves dirty checkouts. |
| `deep-project`, `deep-plan`, `deep-plan-quick`, `deep-implement` | KEEP | Existing contracts consume shared lifecycle policy; no duplicate completion logic added. |
| `sub-agents` and Orchestra handoff references | KEEP | Existing ownership, dispatch and resume contracts are retained; worker interruption is now covered by a scenario. |
| Spec authoring/validation and QA/UAT skills | KEEP | Their requirement and evidence boundaries remain in force; no behavior change found necessary in this scoped compatibility audit. |
| `AGENTS.md` / repository lifecycle policy | KEEP | Existing policy explicitly requires isolated worktrees, non-destructive operations, admission for heavy checks and evidence-bound completion. |

## Compatibility decision table

| Condition | Expected candidate behavior |
| --- | --- |
| Baseline failure with independent work | Isolate baseline and continue independent work; repair only task regressions. |
| Missing Safari/Windows runner | Use compatible fallback; otherwise keep optional verification pending or report required capability blocked. |
| Resource contention | Queue heavy verification and continue ready independent work. Never classify resource failure as code failure. |
| Interrupted worker | Resume from durable capsule after canonical reconciliation. |
| Dependency wake | Revalidate predicate and enqueue idempotent continuation through outbox; otherwise remain waiting with reconciliation fallback. |
| Dirty canonical checkout | Preserve it and use an exact-SHA isolated verification workspace when available. |
| Concurrent writer collision | Isolate worktrees or serialize the owned path. Never modify another owner's worktree. |
| Unauthorized action | Deny the action while continuing authorized independent work. |
| Safe PR integration | Require passed fast gate, reconciled base and normal non-force integration path. |
| Exact-SHA build | Reject wrong/noncanonical source; mark result stale and rebuild if canonical advances. |

These deterministic cases are contract compatibility tests, not proof of live Codex,
Windows, Safari, worker/outbox, GitHub protection, build, deployment, or UAT runtime behavior.

## Installed/runtime inventory

- Linux installed root: `/home/dev/.codex/skills`; matching skill directories were present during audit.
- Repository mirrors: `python3 skills/runtime_sync.py verify` passed at the unmodified base. After candidate edits it reports the expected `lifecycle_policy.py` difference; no installed files were changed.
- Compatibility suite: 13 focused tests passed in 10 consecutive QA rounds; 37 unique lifecycle scenarios and Python syntax checks passed.
- Windows Codex installation: `INSTALLED_VERSION_UNVERIFIED` (not accessible from this Linux host).
- Active Codex app-server processes were present. This candidate was not published to installed skills and does not restart or alter those sessions.
- Hooks, triggers and device runners are host/application configuration, not established by the repository mirror check. They remain unverified unless a host exposes them directly.

## Activation and rollback plan

1. Review and integrate this candidate through the repository's existing protected lifecycle.
2. Validate it in a newly started isolated Codex session against the compatibility scenarios and the actual installed runtime version.
3. Keep the current installed tree unchanged during active sessions. For a later activation, snapshot the prior installed skill tree and checksums, publish only through the supported sync command, verify parity, and retain that snapshot as the rollback source.
4. Roll back by restoring the versioned snapshot to a newly started session after confirming no active session is reading the target. Do not overwrite active-session skill files.

Activation remains pending until isolated-session and host-specific runtime evidence exists.
