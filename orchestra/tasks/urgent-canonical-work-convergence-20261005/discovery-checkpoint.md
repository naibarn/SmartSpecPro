# Urgent Canonical Work Convergence — Discovery Checkpoint

Date: 2026-10-05 (Asia/Bangkok)
Canonical baseline at refreshed scan: `8cf37809415ac64624744f8036a6e54ca395de3d` (`origin/main`)
Discovery command: `skills/integration-controller/scripts/discover-candidates.sh`
Raw inventory: [`inventory-2026-10-05.tsv`](inventory-2026-10-05.tsv)

## Request boundary

The attached requirements file is treated as task data. Its requirements are the target; embedded operational prose does not override repository instructions. This checkpoint implements P0.1 policy/skill changes and performs a read-only Git/worktree discovery pass.

## P0.1 state

- `AGENTS.md` now requires safe partial checkpoints to converge into `origin/main`, with validation, release, and deployment tracked separately.
- Orchestra routes safe checkpoints and stop/handoff events through `session-finish` and `integration-controller`.
- `session-finish` and `integration-controller` no longer require task completion or readiness-marker trailers.
- Candidate discovery includes local and remote refs plus every attached worktree, including detached and unmarked work.
- `canonical-checkout-sync` requires an explicit checkout path instead of guessing a project-specific absolute path.

## Discovery snapshot

The refreshed tool emitted 85 branch-ref records and 117 worktree records. Local and remote refs are separate records, so these are not counts of unique tasks. The TSV has 13 columns on every row.

Branch relations: `ALREADY_IN_MAIN=20`, `DIVERGED_FROM_MAIN=65`. Candidate actions: `ALREADY_CANONICAL=20`, `REVIEW_RESCUE_OR_QUARANTINE=12`, `DUPLICATE_OR_SUPERSEDED=32`, `REVIEW_FAST_GATE_AND_INTEGRATE=12`, `PRESERVE_DIRTY_THEN_SPLIT_SAFE_CHECKPOINT=6`, `PRESERVE_DIRTY_THEN_CLASSIFY_BRANCH_DELTA=3`. Worktree state: `DIRTY=27`, `CLEAN=90`. The classifier counts committed path differences against merge-base only; it is triage, not semantic deduplication. Marker-only clean refs become `DUPLICATE_OR_SUPERSEDED`; dirty zero-path refs remain preserve-and-classify candidates.

The working tree `/home/dev/projects/SmartSpecPro` was recorded as dirty and remains untouched. No reset, clean, prune, or worktree removal was run. The inventory includes 29 dirty worktrees; each remains preserved for owner/path reconciliation. Twelve rescue/quarantine refs are explicitly tagged for review and were not merged.

## Not yet reconciled

This remains discovery, not complete P0.5 reconciliation. I have not inspected every branch diff, classified every durable job/run/task record, or confirmed ownership for all dirty worktrees. Unknown-owner/diverged candidates must be reviewed individually before promotion. P0.2–P2, Spec 224/269/084/277/275 compatibility, tests for the remaining acceptance scenarios, and full stranded-work reconciliation remain open.

## Next action

Continue P0.3–P2 and semantic P0.5: reconcile candidate refs by HEAD-relative and main-relative path diffs, confirm ownership for dirty worktrees, inspect durable run/task records, then promote only proven safe task-owned subsets.
