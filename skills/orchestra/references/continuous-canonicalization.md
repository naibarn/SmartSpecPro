# Continuous Canonicalization and HandOff

Promote coherent task-owned development changes to the repository-configured canonical ref through the existing protected Git flow as soon as their actual required checks pass. The canonical ref represents latest integrated development, not completed UAT or production certification.

Reuse the primary source checkout under the [workspace policy](../../development-lifecycle/workspace-policy.md). Preserve unrelated dirty files and reconcile in place; do not create a replacement checkout per checkpoint or required PR.

1. Preserve unrelated changes; commit only the current owned slice.
2. Reconcile that slice against current canonical SHA, handle actual conflicts and required checks, and merge through the normal non-force path.
3. Immediately push/integrate each commit, fetch and reconcile local canonical HEAD to the same remote tip. Confirm the SHA; write the completed scope and pending gaps in the existing HandOff. Task-start authority covers this operation without another local owner approval.
4. Refresh the source base for **new** work. Reconcile in-flight work at its next checkpoint; don't reset another session or require every historical/dirty checkout to converge before the next merge.
5. Complete safe cleanup of any temporary branch/worktree created by this task, or report its exact cleanup blocker. Run a build/preview only when requested or needed for the change; debug and integrate fixes as needed.
6. Apply applicable pending dev migrations under that same task authority and verify the live schema before user testing. A production release approval is not required for the configured dev database.

Full build/UAT, post-integration checks, runtime acceptance and production deployment are separate obligations unless explicitly part of the actual repository-required PR checks. Run repository-wide branch/worktree recovery inventories only for a recovery request, not on every normal WorkUnit.

Before voluntary session shutdown, preserve owned changes and a usable next action. Never force-push, discard dirty work, bypass actual protection, or claim missing verification passed.
