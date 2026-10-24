---
name: development-lifecycle
description: Minimal shared lifecycle for continuous development integration, durable handoff, safe Git ownership and recovery.
---

# Universal Development Lifecycle

The existing WorkUnit/HandOff is the durable record; do not create another job system or requirement registry. `canonical_ref` is supplied by repository policy. Integrated development state does not imply final SPEC acceptance, deployment or production readiness.

## Normal development

Follow [primary checkout and worktree policy](workspace-policy.md) as the shared authority for task-start authorization, source selection, immediate commit/push synchronization, dev DB freshness and exceptional isolation/cleanup. Reuse the primary checkout by default; a task, SPEC, PR or verification step does not require another source directory. Do not add local owner/human approval gates to that contract.

1. Start the next independent, useful slice in the primary checkout, safely refreshed against the configured canonical ref. Resume owned in-flight work in place; preserve its ownership and base SHA without forcibly resetting stale or dirty files.
2. Implement and run focused checks appropriate to the changed scope.
3. Whenever the user stops, pauses, hands off, or switches to another subtask, immediately checkpoint all coherent safe work already done for the current slice. Run only the FAST INTEGRATION GATE before committing owned paths; do not wait for the parent task, unrelated work, full verification, UAT or deployment. Push the commit to the configured canonical branch directly when current repository rules allow it; use a PR only when branch protection or an explicit repository rule requires one. Honor actual required checks and reviews, and never bypass protection.
4. Immediately push/integrate each commit and fetch/reconcile local canonical HEAD with the remote-tracking tip to the same SHA. Write the short existing HandOff and continue; do not strand commits waiting for optional acceptance or historical workspace cleanup.
5. Apply pending applicable dev migrations under the standing task authority and verify the actual schema before user testing. Build only when needed for the change, debug and integrate fixes progressively on canonical source. Keep final UAT and production release evidence separate.

## Durable continuation (existing records only)

Record progress at meaningful task transitions and before known interruption, not just at final completion. For ordinary WorkUnits retain in the **existing** task HandOff: objective/section, owner and worktree, current base and latest commit, verified integrated Main SHA (if any), completed output, pending sections/gaps, last test result, exact next action, and any waiting dependency. For canonical Specs, use the existing [Spec HandOff writer contract](spec-handoff-contract.md) (`handoff/manifest.json`, requirement ledger and generated STATUS) instead of inventing a second registry. Never edit generated `STATUS.md` as the source of truth.

On resume, read these records and the Deep Plan/Implement session config; reconcile with actual Git, PR and artifact state. Reuse the last verified step, not a stale stage label. Persist resolved changes to the same existing records without overwriting concurrent owner state. When a tool/session cannot continue, preserve the active delta and its continuation pointer; independent work can still advance.

## Git and workspace boundaries

Normal flows never force-push, discard unrelated dirty files, overwrite another session's work, or bypass actual repository-required checks. A failed push requires fetch/reconcile, not forced history rewriting. For conflict ownership and Git-version specifics use `git_capabilities.py` when needed; stage owned paths only.

Use `scripts/development-lifecycle/workspace_authority.py` where registered workspace identity/owner or recovery needs proof. Preserve unrelated dirty edits and reconcile in place; do not automatically create a clean checkout when dirty. Reuse an owned temporary workspace only when isolation is actually necessary under the workspace policy. Historical workspace convergence does not block promoting a verified owned slice. Finish retirement of a task-created temporary workspace after integration, or report its exact cleanup blocker. Do not assert two machines or runtimes match without checking both.

## Blockers and status

- **Implementation:** code may be partial; remaining sections and bugs are carried in HandOff.
- **Integrated:** verified source is present in configured canonical history. PR opened or checks pending is not integrated.
- **Verification pending:** a test could not run or final evidence is incomplete; this is not a code failure and does not block unrelated development.
- **Waiting external:** only a concrete missing permission, irreversible external authorization, material unresolved product decision, or an actual safety/security/required protection boundary for the affected action.
- **Verified / deployed / accepted:** require separate evidence for those claims; never infer one from another.

Ordinary compile errors, merge conflicts, broken fixtures, stale checkouts, and authorized development migrations call for diagnosis and repair. When one path is blocked, run other independent ready work instead of returning control to the user just to say 'continue'.

## Spec work

Keep authoritative requirements and remaining gaps mapped in the existing Spec HandOff (see `spec-handoff-contract.md` when needed). A coherent section can merge while other requirements remain unverified. Only label the overall SPEC complete once its actual acceptance criteria are met; do not make that overall label a condition for earlier development integration.
