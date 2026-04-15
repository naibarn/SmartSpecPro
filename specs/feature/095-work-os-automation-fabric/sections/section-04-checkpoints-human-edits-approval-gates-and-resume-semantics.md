# Section 04 - Checkpoints, Human Edits, Approval Gates, and Resume Semantics

## Goal

Make the automation fabric resumable and safe to edit by defining explicit checkpoints, approval gates, and recovery rules.

## What this section must deliver

- Checkpoint types for draft-ready, review-required, approval-required, blocked-by-policy, and safe-to-resume states.
- Edit flows that preserve prior snapshots.
- Resume-from-checkpoint behavior.
- Approval gates for fully auto runs.
- Rollback/rerun behavior from a known checkpoint.
- Mandatory gating for publish, destructive, external side effects, and other high-risk steps.

## Files likely to change

- Work OS service logic for checkpoint persistence and resume.
- Any approval/exceptions path that needs to bind to the run.
- UI surfaces that show and edit checkpoints.
- Router tests for checkpoint and approval behavior.

## Implementation notes

- Every checkpoint transition must be machine-readable.
- Human edits should create new revision history instead of mutating the prior snapshot.
- Resume should continue the same case and the same run.
- High-risk actions should not silently auto-run.

## Expected behavior

- A case can pause at a checkpoint, accept human edits, then resume from the safe cursor.
- Fully auto runs stop at approval gates.
- Rollback or rerun does not break the case identity.

## Test expectations

- Checkpoint creation, edit, and resume tests.
- Approval gate tests for high-risk and external-side-effect steps.
- Snapshot immutability tests.
- Failure-path tests for restart/resume behavior.

## Risks to watch

- Losing the previous checkpoint snapshot during edits.
- Letting approval gates fail open.
- Resuming from the wrong step after a retry or failure.

## Implementation Result

This section is implemented as immutable checkpoint handling plus an explicit resume helper:

- [`apps/web/server/services/workAutomationFabricService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationFabricService.ts) already stores checkpoints as append-only records, and `resumeAutomationRunFromCheckpoint` now clones a prior snapshot into a new resumed checkpoint instead of mutating history.
- The checkpoint resume path preserves the original `snapshotJson`, `editSnapshotRefsJson`, and checkpoint metadata while marking the new checkpoint as resumed and advancing the run state back to running.
- [`apps/web/server/routers/workOs.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/routers/workOs.ts) exposes `resumeAutomationCheckpoint` so operators can resume from the safe cursor without rewriting the prior checkpoint row.
- The runtime still enforces approval gates through the checkpoint and mode transition policy, so fully-auto runs cannot silently skip unresolved approvals.
