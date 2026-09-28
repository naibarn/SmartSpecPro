# Vertical Drama sub-episode auto-recovery design

## Problem

When `storyboard_shotgrid` is blocked by the continuity gate, the page opens a
manual script-repair dialog. A successful repair only creates a new artifact;
the storyboard stage is not retried as part of the original generate action.
The user therefore sees a new artifact/version but does not receive a usable
sub-episode in the same workflow.

## Approved design

The real storyboard background job owns a bounded recovery loop:

1. Validate the current episode script and series continuity ledger.
2. When the gate fails, automatically repair `plan_episode_script` using the
   persisted continuity issues as the repair instruction.
3. Reload the episode and validate again.
4. Once the gate passes, generate and persist `storyboard_shotgrid` in the same
   background run.
5. Retry the repair only a bounded number of times; if recovery is exhausted,
   finalize the original storyboard run as failed with the actionable failure
   reason.

Continuity repair also has a deterministic legacy-data rule: when the repaired
final episode repeats an existing canonical `thread_id` with
`expected_resolution: "season"`, the normalizer updates the original opening's
classification instead of quarantining that explicit season carry-over as a
duplicate opening.

The existing run row remains the durable user-visible status record. Repair
runs and artifacts remain in the ledger for auditability, while the UI only
reports success after the storyboard run itself succeeds. Manual repair remains
available as an explicit fallback, but it is no longer the automatic response
to a continuity failure during one-click generation.

## Acceptance criteria

- A one-click real sub-episode generation does not stop at the first
  `VD_CONTINUITY_GATE_FAILED` result.
- A successful automatic repair causes the same storyboard run to continue and
  finish with a usable storyboard.
- Recovery is bounded and cannot loop forever or silently spend unbounded
  credits.
- A failed repair or exhausted recovery finalizes the storyboard run as
  `failed` and exposes the actual error, never a successful artifact-only state.
- Existing manual repair and non-real/dry-run behavior remain compatible.
- Focused tests cover recovery success, recovery exhaustion, and accurate UI
  handling of a failed repair result.

## UI/UX contract

### Target User / JTBD

- Role: Vertical Drama creator.
- Goal: Generate one usable sub-episode from the episode page.
- Entry point: Generate this Sub-episode (paid).
- Success outcome: The storyboard is available without manual stage recovery.

### Existing Pattern Reference

- Existing pattern: `runStoryboardShotgridStageJob` plus
  `pollStoryboardShotgridRun` already provide durable background execution and
  terminal polling.
- Decision: reuse. Auto-recovery is added inside that durable job; the page
  continues to poll the same run id.

### Surface Inventory

| Surface                   | File/route                        | Change                                                                                                                                            |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storyboard background job | `verticalDramaEpisodePipeline.ts` | Add bounded continuity repair loop.                                                                                                               |
| Episode page              | `VerticalDramaEpisodePage.tsx`    | Stop opening a misleading manual repair modal for an automatic recovery case; do not mark artifact-only repair as success when the result failed. |

### State matrix

| State         | Expected UI                                                           |
| ------------- | --------------------------------------------------------------------- |
| running       | Existing generation/polling state remains active while recovery runs. |
| success       | Only the storyboard run's terminal success announces completion.      |
| error         | The persisted latest error is shown after bounded recovery fails.     |
| manual repair | Existing dialog remains available for explicit user repair.           |

### Responsive / accessibility / visual direction

N/A for this behavior-focused change; existing dialog and polling surfaces are
retained without layout changes. Existing keyboard and live-region behavior
remains in use.

## Verification plan

- Add service-level regression coverage for automatic repair success and
  bounded exhaustion.
- Add page-level regression coverage for failed `repairStageOutput` results.
- Run focused Vertical Drama tests, changed-file diagnostics, and
  `git diff --check`.
