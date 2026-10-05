# Urgent Canonical Work Convergence — Discovery Checkpoint

Date: 2026-10-05 (Asia/Bangkok)
Canonical baseline at scan: `b65e1f5488880c0555556d5a0badf1e9661903ea` (`origin/main`)
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

The tool emitted 84 branch-ref records and 117 worktree records. Local and remote refs are separate records, so these are not counts of unique tasks.

Branch relations: `{'ALREADY_IN_MAIN': 21, 'DIVERGED_FROM_MAIN': 63}`. Readiness trailers: `{'NONE': 39, 'READY_FOR_HEAVY_VERIFICATION': 35, 'READY_FOR_INTEGRATION': 10}`. Candidate actions: `{'ALREADY_CANONICAL': 18, 'REVIEW_RESCUE_OR_QUARANTINE': 12, 'REVIEW_FAST_GATE_AND_INTEGRATE': 44, 'PRESERVE_DIRTY_THEN_SPLIT_SAFE_CHECKPOINT': 7, 'PRESERVE_AND_CHECKPOINT_DIRTY_REMAINDER': 3}`. Worktree state: `{'DIRTY': 29, 'CLEAN': 88}`.

The working tree `/home/dev/projects/SmartSpecPro` was recorded as dirty and remains untouched. No reset, clean, prune, or worktree removal was run. The inventory includes 29 dirty worktrees; each remains preserved for owner/path reconciliation. Twelve rescue/quarantine refs are explicitly tagged for review and were not merged.

## Not yet reconciled

This is discovery, not semantic integration. I have not inspected every branch diff, classified every durable job/run/task record, or confirmed ownership for all dirty worktrees. Unknown-owner/diverged candidates must be reviewed individually before promotion. P0.2–P2, Spec 224/269/084/277/275 compatibility, tests for the remaining acceptance scenarios, and full stranded-work reconciliation remain open.

## Next action

Continue with P0.2: audit the canonical spec index and existing task-owned spec proposals, select a collision-free addendum number, and establish the cross-spec authority matrix. Then reconcile the discovered candidate refs by semantic diff and ownership before promoting any unrelated implementation.
