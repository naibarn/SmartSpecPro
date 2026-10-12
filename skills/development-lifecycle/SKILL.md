---
name: development-lifecycle
description: Minimal shared lifecycle for continuous development integration, durable handoff, safe Git ownership and recovery.
---

# Universal Development Lifecycle

The existing WorkUnit/HandOff is the durable record; do not create another job system or requirement registry. `canonical_ref` is supplied by repository policy. Integrated development state does not imply final SPEC acceptance, deployment or production readiness.
An integration merge never implies
requirement acceptance or overall completion.

## Normal development

1. Start the next independent, useful slice from a verified canonical source. Preserve the ownership and base SHA of in-flight work; do not forcibly reset stale or dirty worktrees.
2. Implement and run focused checks appropriate to the changed scope.
3. Commit and promote each coherent checkpoint via the repository's existing protected Git/PR flow. Do not require task completion, whole-SPEC validation or deployment before development integration.
4. Confirm the integrated canonical SHA, write a short HandOff (done, missing, checks, owner, next action) and continue. Refresh the base for the next slice; do not pause unrelated sessions for global workspace convergence.
5. Build on the intended development runtime, debug, review and integrate fixes progressively. Keep final UAT and production release evidence separate.

## Durable continuation (existing records only)

Record progress at meaningful task transitions and before known interruption, not just at final completion. For ordinary WorkUnits retain in the **existing** task HandOff: objective/section, owner and worktree, current base and latest commit, verified integrated Main SHA (if any), completed output, pending sections/gaps, last test result, exact next action, and any waiting dependency. For canonical Specs, use the existing [Spec HandOff writer contract](spec-handoff-contract.md) (`handoff/manifest.json`, requirement ledger and generated STATUS) instead of inventing a second registry. Never edit generated `STATUS.md` as the source of truth.

On resume, read these records and the Deep Plan/Implement session config; reconcile with actual Git, PR and artifact state. Reuse the last verified step, not a stale stage label. Persist resolved changes to the same existing records without overwriting concurrent owner state. When a tool/session cannot continue, preserve the active delta and its continuation pointer; independent work can still advance.

## Git and workspace boundaries

Normal flows never force-push, discard unrelated dirty files, overwrite another session's work, or bypass actual repository-required checks. A failed push requires fetch/reconcile, not forced history rewriting. For conflict ownership and Git-version specifics use `git_capabilities.py` when needed; stage owned paths only.

Use `scripts/development-lifecycle/workspace_authority.py` where registered workspace identity/owner or recovery needs proof. A dirty primary user checkout may remain preserved while an isolated registered clean canonical worktree is used for build or new work. Workspace convergence is a separate housekeeping/recovery obligation, **not a prerequisite for promoting a verified slice from an isolated owned checkout**. Do not assert two machines or runtimes match without checking both.

## Blockers and status

- **Implementation:** code may be partial; remaining sections and bugs are carried in HandOff.
- **Integrated:** verified source is present in configured canonical history. PR opened or checks pending is not integrated.
- **Verification pending:** a test could not run or final evidence is incomplete; this is not a code failure and does not block unrelated development.
- **Waiting external:** only a concrete missing permission, irreversible external authorization, material unresolved product decision, or an actual safety/security/required protection boundary for the affected action.
- **Verified / deployed / accepted:** require separate evidence for those claims; never infer one from another.

Ordinary compile errors, merge conflicts, broken fixtures, stale checkouts, and authorized development migrations call for diagnosis and repair. When one path is blocked, run other independent ready work instead of returning control to the user just to say 'continue'.

## Spec work

Keep authoritative requirements and remaining gaps mapped in the existing Spec HandOff (see `spec-handoff-contract.md` when needed). A coherent section can merge while other requirements remain unverified. Only label the overall SPEC complete once its actual acceptance criteria are met; do not make that overall label a condition for earlier development integration.
