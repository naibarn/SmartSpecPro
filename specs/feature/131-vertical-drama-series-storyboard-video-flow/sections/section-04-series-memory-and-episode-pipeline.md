# section-04-series-memory-and-episode-pipeline

## Goal

Implement durable series memory and a resumable episode stage runner that can plan, approve, repair, and hand off 10-100 episode vertical drama projects.

## Depends On

- section-01-skill-packages
- section-02-contracts-persistence-assets
- section-03-dashboard-routes-feature-flags

## Files

Create:

- `apps/web/server/services/verticalDramaSeriesService.ts`
- `apps/web/server/services/verticalDramaEpisodeService.ts`
- `apps/web/server/services/verticalDramaEpisodeRunner.ts`
- `apps/web/server/services/verticalDramaMemoryService.ts`
- `apps/web/server/services/verticalDramaApprovalService.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/__tests__/verticalDramaEpisodeRunner.test.ts`
- `apps/web/server/services/__tests__/verticalDramaMemoryService.test.ts`

Modify:

- server router registration file
- feature flag/admin grouping if server-side access checks require it

## Router Procedures And Idempotency (spec 15, lines 2337, 2346)

`apps/web/server/routers/verticalDramaSeries.ts` MUST expose the following procedures at minimum:

- `listSeries`, `createSeries`, `updateSeries`, `archiveSeries` (archive is a distinct protected mutation, not a hard delete);
- `createCharacter` / `updateCharacter` and character asset-link procedures;
- `createEpisodeDraft` / `updateEpisodeDraft`;
- `runEpisodeStage` / `resumeEpisodeStage` (dry-run capable);
- `approveStageOutput` / `rejectStageOutput`;
- `createStoryboardReviewHandoff`;
- `updateSeriesMemoryAfterReview`;
- `repairStageOutput`;
- `listEpisodeRuns` (read-only query): returns the per-episode run history — each entry carries `runId`, `status`, `mode`, `startedAt`/`updatedAt`/`completedAt` timestamps, and a link target to its read-only artifact-ledger detail (section-09) — ordered by recency (most recent first);
- `listMemoryEvents` (read-only query): returns the append-only series memory events, filterable by `kind` (including `retcon_proposal`) and/or `episodeNumber`, ordered chronologically for timeline rendering; and
- `approveRetconProposal` / `rejectRetconProposal`: act on a `retcon_proposal` memory event; approving appends a NEW superseding memory event (never mutates prior events, per Retcon Semantics), rejecting appends a rejection event. Both are mutations and follow the ownership/flag/authz/audit/idempotency rules below.

Every mutating vertical-drama route (including `archiveSeries`) MUST enforce tenant ownership, feature-flag access, user authorization, audit logging, and accept an idempotency key. Idempotency is NOT limited to the Storyboard Review handoff — all mutations (create/update/archive series, character, episode, run/resume, approve/reject, repair, memory update) accept and honor an idempotency key so retried requests do not duplicate state.

## Episode Stage Runner

Runner modes:

- `dry_run`
- `plan_only`
- `render_images`
- `render_video`
- `full`
- `repair`

Stage sequence uses the source-spec enum names:

1. `normalize_series_input`
2. `plan_episode_script`
3. `update_character_visual_bible`
4. `generate_or_import_character_refs`
5. `storyboard_shotgrid`
6. `start_frame_render_plan`
7. `render_or_import_start_frames`
8. `approve_start_frames`
9. `dialogue_audio_plan`
10. `video_motion_prompt_pack`
11. `create_storyboard_review_project`
12. `review_generate_repair_in_storyboard_review`
13. `render_or_import_video_clips`
14. `assemble_episode_manifest`
15. `summarize_episode_to_series_memory`

Every stage returns:

- `status`: `planned`, `blocked`, `waiting_for_approval`, `ready`, `running`, `completed`, `failed`, `needs_repair`
- `next_action`
- `artifactId`
- warnings
- repair actions
- stale downstream stages

### Phase Grouping And Single-CTA Simplification (spec 16)

The 15 canonical `VerticalDramaPipelineStage` stages are internal fidelity, not the operator's mental model. The stage runner MUST group the 15 stages into approximately 4 labeled, ordered phases so the workspace presents progress at phase granularity rather than 15 raw rows:

1. **Plan** — `normalize_series_input`, `plan_episode_script`, `update_character_visual_bible`, `generate_or_import_character_refs`.
2. **Frames** — `storyboard_shotgrid`, `start_frame_render_plan`, `render_or_import_start_frames`, `approve_start_frames`.
3. **Prompt & Handoff** — `dialogue_audio_plan`, `video_motion_prompt_pack`, `create_storyboard_review_project`, `review_generate_repair_in_storyboard_review`.
4. **Generate & Assemble** — `render_or_import_video_clips`, `assemble_episode_manifest`, `summarize_episode_to_series_memory`.

The workspace renders a phase progress indicator (which phase is active, which are complete, which are blocked/waiting) derived from the underlying stage statuses. Regardless of how many stages are in flight, the workspace surfaces exactly ONE primary call-to-action, driven by the current stage's `next_action` (for example "Run dry run", "Approve start frames", "Repair script", "Generate video"). Secondary/expert controls (per-stage detail, per-stage repair) remain available on drill-down but never compete with the single primary CTA. This is the key simplification: operators act on one clear next step, not a 15-item checklist.

### Failed-Validation Rule (spec 11.5, line 2084)

A stage runner MUST NOT silently continue past a schema-validation failure. When a stage's skill output or artifact fails schema validation, the runner sets `status = "failed"` and `next_action = "repair"` and attaches a stable machine-readable error code (for example `VD_SCHEMA_VALIDATION_FAILED`, not free-form text). The stable error code drives the repair UI/CTA and is persisted with the stage artifact/QC result. A failed validation never advances the stage sequence and never marks the stage `completed`.

### Sub-Shot Decomposition In The Motion-Prompt Stage (spec 7.4)

Sub-shot decomposition is opt-in behavior INSIDE the existing `video_motion_prompt_pack` stage — it is NOT a new pipeline stage and does NOT change the canonical 15-stage `VerticalDramaPipelineStage` enum or the ~4-phase grouping. The stage sequence remains exactly the 15 stages listed above.

When the `verticalDramaSeriesSubShots` feature flag is on, the `video_motion_prompt_pack` stage decomposes each main storyboard shot into 2-5 short cut sub-clips per §7.4 Sub-Shot Decomposition, driven by a `VerticalDramaSubShotPolicy`:

- Resolve counts from policy: `auto` mode targets `targetPerShot` (default 2-3 per shot) as feasible, `fixed` mode forces it; `maxPerShot` caps the count (up to 5); `minSubShotSeconds` is the anti-choppy/provider-feasibility floor. In `auto` mode the resolved count is `N = min(targetPerShot, floor(D / minSubShotSeconds))` for a parent shot of duration `D`, so a short trailing main shot receives fewer sub-shots.
- The per-parent sub-shot durations SUM to the parent main-shot duration, so the episode total stays 60 seconds and the storyboard stays 9 shots/frames. Sub-shots never change the shot count or episode duration.
- The stage emits the `sub_shot_plan` (resolved counts, per-sub-shot durations, camera setups, transitions, and feasibility/degrade decisions) as part of its motion-prompt-pack output, and — where the resolved provider supports the resulting short clip durations and input mode — per-sub-shot clip requests (each carrying `parentShotNumber` + `subShotNumber`). Where the provider cannot support the requested durations/count, the stage degrades gracefully "as feasible" per `fallbackOnUnsupported` (reduce `N` toward feasible, or collapse to the single parent clip) and records the reason in `provider_feasibility.blocking_reasons`.
- Sub-shot planning is dry-run-safe: the `sub_shot_plan` is planned (counts, durations, camera setups, transitions, prompts) WITHOUT any paid provider calls in `dry_run`/`plan_only`; per-sub-shot paid clip generation still gates on the motion-prompt-pack approval checkpoint like every other paid stage.
- With the flag off, the `video_motion_prompt_pack` stage output is unchanged: no `sub_shot_plan` is emitted and the stage behaves exactly as before (single-clip-per-shot), with no regression to the stage sequence, phases, or status contract.

## Approval And Repair Artifacts

Approval checkpoints:

1. episode script
2. character visual bible changes
3. character reference assets
4. 9-shot storyboard grid
5. start-frame render requests
6. rendered/imported start frames
7. dialogue/audio/subtitle plan
8. motion prompt pack
9. Storyboard Review project creation
10. rendered/imported video clips
11. final assembly manifest
12. final episode memory update

Each checkpoint persists a `VerticalDramaApprovalCheckpointArtifact` with checkpoint/run/series/episode IDs, stage, state, approving/rejecting user IDs, `sourceArtifactIds`, `repairRequestIds`, notes, and timestamps. Approving never mutates the source artifact. Repair creates a new artifact/version, supersedes the prior candidate, records the repair instruction, and marks dependent stages stale.

### Repair Instruction Capture Wiring (spec 8.4)

The `repairStageOutput` route accepts `stage`, `artifactId`, `target` (shot/clip when applicable), and a user `instruction`, but the instruction has no capture surface without a dedicated dialog. The `VerticalDramaRepairDialog` (invoked from the ApprovalBar or per-stage) MUST capture the repair `instruction` in a textarea — optionally prefilled from a repair-prompt template — resolve the `target`, and call `repairStageOutput` with `target` + `instruction`. It then shows the repair job status and result (the new artifact/version). Before any PAID repair executes, the dialog MUST show a credit-estimate confirmation that the user must accept; declining aborts the repair and spends no credits. Repair job status/result is text-visible and keyboard reachable per the Accessibility Acceptance rules.

### Sub-Shot Approval And Repair (spec 7.4)

When `verticalDramaSeriesSubShots` is on, the `sub_shot_plan` is part of the existing motion prompt pack approval checkpoint (checkpoint 8, "motion prompt pack") — it does NOT add a new approval checkpoint. The sub-shot prompts, camera setups, durations, and transitions are visible and editable before any paid generation, alongside the rest of the motion-prompt-pack candidate.

A bad sub-shot is repairable per sub-shot through the EXISTING repair route/dialog: `repairStageOutput` targets the `video_motion_prompt_pack` stage with a sub-shot `target` (parent shot + sub-shot) and one of the sub-shot repair actions — `repair_sub_shot` (regenerate/adjust the sub-shot prompt/camera/transition) or `adjust_sub_shot_timing` (re-split durations while keeping the per-parent sum equal to the parent main-shot duration and each sub-shot `>= minSubShotSeconds`). The `VerticalDramaRepairDialog` captures the instruction and target as usual; repair creates a new artifact/version, supersedes the prior sub-shot candidate, and marks dependent downstream stages stale per the immutable repair semantics above.

## Developer/Admin Equivalents

- `vdflow run` maps to the episode runner in `dry_run`, `plan_only`, or `full`.
- `vdflow repair` maps to a protected repair mutation that accepts stage, artifact ID, target shot/clip when applicable, and user instruction.
- `vdflow validate` is covered by section 01 skill verify scripts plus service/schema tests.
- `vdflow render-images`, `vdflow render-video`, and `vdflow assemble` are implemented in sections 05, 08, and 09, then invoked from this runner through stage-specific services.

## Memory Policy

For each new episode, retrieve:

- canonical series facts;
- current character and relationship state;
- unresolved hooks;
- last 3 episode summaries by default;
- recently resolved hooks within configured lookback;
- product tie-in history;
- continuity warnings.

Do not automatically mutate memory after generation. Export/QC creates a pending memory update checkpoint that must be approved or policy-accepted.

### Memory Bundle Construction (spec 7.6)

`verticalDramaMemoryService.buildEpisodeMemoryBundle(seriesId, episodeNumber)` assembles the skill input bundle in the source-spec order (spec 1371-1380). In addition to the base retrieval list above, bundle construction MUST include these steps:

1. `includeResolvedHookLookbackCount` step (default `10`): include any hook resolved within the last 10 episodes that might affect continuity.
2. Fatigue-limits step: include product/placement fatigue counts (product tie-in usage frequency and recency) so downstream generation can respect fatigue limits; feed these into the bundle alongside product tie-in history.
3. Compacted memory-text step: when the raw event list for the series exceeds the configured size threshold, add a compacted memory text block using `compactionStrategy: "rolling_summary_plus_events"` (rolling summary plus the most recent verbatim events) instead of inlining the full event history.

Bundle construction is deterministic for a given series/episode input so the same episode replans identically.

### Retcon Semantics (spec 7.6, append-only)

The memory model is strictly append-only. Retcons are EXPLICIT proposals, never in-place edits:

- A proposed retcon is persisted as a memory event of kind `retcon_proposal` (see `VerticalDramaMemoryKind` in spec 1387-1396) and requires user approval.
- Approving a retcon creates a NEW memory event that supersedes the contradicted fact going forward. It NEVER mutates or deletes any prior event; the historical append-only chain is preserved intact for audit and replay.
- If a new episode contradicts canonical memory, the pipeline stops at a repair checkpoint and emits a `retcon_proposal` rather than silently rewriting the past.

### Memory Event Timeline And Retcon Proposal Review (spec 7.6)

Because memory is append-only, the Memory tab MUST expose the history, not only the latest state:

- **Event timeline**: The Memory tab renders a browsable, chronologically ordered EVENT TIMELINE of the append-only memory events (backed by `listMemoryEvents`), filterable by `kind` and by `episodeNumber`. It shows how memory evolved across episodes — including past `retcon_proposal` events and their outcome (proposed/approved/rejected) — so a user can audit how a canonical fact came to be superseded. The timeline is read-only history; entries are never edited or deleted in place.
- **Current compacted summary**: Alongside the timeline, the tab shows the current compacted summary (the `compactionStrategy: "rolling_summary_plus_events"` rolling summary plus most-recent verbatim events described under Memory Bundle Construction). The summary is clearly labeled as the derived current view, distinct from the raw event timeline.
- **Retcon Proposal review**: The retcon flow (an explicit user-approval decision under Retcon Semantics) gets a first-class review surface. It presents the proposed change (the contradicted fact and the proposed superseding fact) and the rationale, with an approve affordance wired to `approveRetconProposal` and a reject affordance wired to `rejectRetconProposal`. Approving appends a NEW superseding memory event; rejecting appends a rejection event. Neither mutates or deletes prior events. Its states are enumerated in the State Matrix (`loading` / `none` / `proposed` / `approved` / `rejected`).

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator managing episode progress.
- Goal: understand the current stage, warnings, approvals, repairs, and next safe action.
- Entry point: episode workspace.
- Success outcome: user can resume a stage or approve/repair without guessing system state.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Episode workspace | `/dashboard/vertical-drama/:seriesId/episodes/:episodeId` | stage runner state grouped into ~4 phases with one primary CTA |
| Runs sub-list | episode workspace | per-episode run history (`listEpisodeRuns`); each run links to its read-only artifact-ledger detail (section-09) |
| Approval bar | vertical drama components | approve/reject/repair actions with in-progress/success/rejected states |
| Repair dialog | vertical drama components | captures repair instruction (target + instruction) and shows repair job status/result |
| Memory tab: event timeline | series/memory detail | browsable append-only event timeline (`listMemoryEvents`) plus current compacted summary |
| Retcon proposal review | Memory tab | proposed change + rationale, approve/reject affordance |
| Memory summary | series detail | continuity and checkpoint status |
| Completed episode (read-only) | episode workspace | historical view of final artifacts per stage when the episode is complete |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaEpisodeRunner` | server service | stage state | skills/services |
| `VerticalDramaPhaseProgress` | UI component | ~4-phase progress indicator and single primary CTA | runner result (stage statuses + `next_action`) |
| `VerticalDramaStageCard` | UI component | stage display | runner result |
| `VerticalDramaRunsList` | UI component | per-episode run history rows linking to artifact-ledger detail | `listEpisodeRuns` |
| `VerticalDramaApprovalBar` | UI component | approval actions (approve/reject) with in-progress/success/rejected states, and repair entry point | approval checkpoint |
| `VerticalDramaRepairDialog` | UI component | repair instruction capture (target + instruction, optional repair-prompt template prefill), paid-repair credit-estimate confirm, repair job status/result | `repairStageOutput` |
| `VerticalDramaMemoryTimeline` | UI component | browsable append-only memory event timeline + current compacted summary | `listMemoryEvents` |
| `VerticalDramaRetconProposalCard` | UI component | retcon proposal review (proposed change + rationale, approve/reject) | `listMemoryEvents` + `approveRetconProposal`/`rejectRetconProposal` |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stage card skeleton | UI test |
| empty | no episode shows create episode CTA | UI test |
| error | failed stage shows repair action and reason | service/UI test |
| success | completed stage shows artifact and next action | integration test |
| disabled/focus/hover | paid/repair buttons disabled until policy passes | UI/accessibility test |
| approval: approve-in-progress | `VerticalDramaApprovalBar` shows a busy/pending state while the approve mutation is inflight; controls are non-reentrant | UI test |
| approval: approved-success | approval bar shows an approved/success confirmation and advances the single CTA | UI test |
| approval: rejected | approval bar shows a rejected state with the rejection reason and the resulting next action (repair) | UI/service test |
| repair dialog: loading | repair job status shows inflight after submit | UI test |
| repair dialog: credit-estimate confirm | paid repair shows a credit-estimate confirmation that must be accepted before the repair runs | UI test |
| repair dialog: result | repair dialog shows completed job result (new artifact/version) or failure with reason | UI/service test |
| retcon proposal: loading | retcon card shows skeleton while `listMemoryEvents` loads | UI test |
| retcon proposal: none | no pending proposal shows an empty/none state | UI test |
| retcon proposal: proposed | card shows proposed change + rationale with approve/reject affordance | UI test |
| retcon proposal: approved | card shows approved outcome; a new superseding memory event exists in the timeline | UI/service test |
| retcon proposal: rejected | card shows rejected outcome; a rejection event exists, prior events intact | UI/service test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked stage cards and sticky approval action | screenshot |
| tablet 768x1024 | two-column stage cards where safe | screenshot |
| laptop 1024x768 | phase progress plus stage cards without horizontal overflow; runs sub-list and memory timeline scroll within their own containers | screenshot |
| desktop 1440x900 | stage timeline plus details panel | screenshot |
| wide-desktop 1280x800 | phase progress, stage timeline, and details/memory panels laid out side by side without truncation | screenshot |

### Accessibility Acceptance

- Stage status and repair reasons are text-visible.
- Approval controls are keyboard reachable.
- Focus order follows stage timeline order.
- Under `prefers-reduced-motion`, running-stage spinners and the phase/stage timeline animations are replaced with a static, non-animated indicator (for example a static "running" label or progress state); no looping/pulsing motion is required to perceive stage progress.

### Copy Contract

- Copy must distinguish `dry_run`, `plan_only`, paid image generation, paid video generation, and repair.
- Memory checkpoint copy must say pending updates are not yet applied.

### Browser Evidence Required

Capture dry-run, waiting-for-approval, failed/repair, and completed stage states.

## Tests First

- Test: create series persists tenant/user ownership and default memory.
- Test: create episode assigns the next episode number safely.
- Test: memory bundle includes canonical facts, last 3 summaries, open hooks, character state, and tie-in history.
- Test: stage runner can run `dry_run` without provider credentials.
- Test: every stage writes an artifact or repair artifact.
- Test: approval checkpoint blocks paid generation stages.
- Test: checkpoint artifacts preserve `sourceArtifactIds` and `repairRequestIds`.
- Test: repair creates a new artifact/version and supersedes the prior candidate without overwriting it.
- Test: repairing a prior stage marks dependent stages stale.
- Test: app-safe `vdflow run` and `vdflow repair` equivalents call the same runner/repair contracts.
- Test: concurrent attempts to create the same episode number do not duplicate canonical episode state.
- Test: memory update checkpoint is pending after export and does not mutate memory automatically.
- Test: retcon proposal -> approval creates a NEW memory event and leaves all prior events intact (append-only chain preserved; no in-place mutation or deletion of older events).
- Test: memory bundle construction is correct at episode 2, episode 30, and episode 100 — includes canonical facts, last 3 summaries, open hooks, resolved-hook lookback (`includeResolvedHookLookbackCount` default 10), product tie-in history with fatigue limits, and switches to `compactionStrategy: rolling_summary_plus_events` compacted memory text once the event list exceeds the size threshold (episodes 30 and 100).
- Test: a failed schema validation in a stage sets `status = "failed"` and `next_action = "repair"` with a stable error code and does not silently continue or mark the stage completed.
- Test: `archiveSeries` and every other mutating vertical-drama route reject/deduplicate a replayed request carrying the same idempotency key.
- Test: `listEpisodeRuns` returns all runs for an episode ordered by recency (most recent first) with `runId`, `status`, `mode`, and timestamps.
- Test: `listMemoryEvents` returns memory events across episodes and includes `retcon_proposal` events; filtering by `kind` and `episodeNumber` narrows the result.
- Test: the stage runner groups the 15 canonical `VerticalDramaPipelineStage` stages into the ~4 defined phases and exposes exactly one primary CTA derived from the current stage's `next_action`.
- Test: `VerticalDramaApprovalBar` renders approve-in-progress while the approve mutation is inflight, then approved-success on success and a rejected state on rejection.
- Test: the Repair dialog calls `repairStageOutput` with the selected target plus instruction and surfaces repair job status/result; a paid repair requires accepting the credit-estimate confirmation before it runs.
- Test: approving a `retcon_proposal` via `approveRetconProposal` appends a new superseding memory event visible in the timeline and leaves all prior events intact; rejecting via `rejectRetconProposal` appends a rejection event without mutating prior events.
- Test: a completed episode renders a read-only historical view exposing the final artifacts per stage (script, frames, prompts, provider decisions, assembly) instead of the live stage runner.
- Test: with `verticalDramaSeriesSubShots` on, the `video_motion_prompt_pack` stage emits a `sub_shot_plan` whose per-parent sub-shot durations SUM to that parent main-shot's duration and whose episode total stays 60 seconds (shot count stays 9).
- Test: with the flag on and `auto` mode, each main shot decomposes into 2-3 sub-shots (fewer for short shots) with every sub-shot `>= minSubShotSeconds`, and never more than `maxPerShot`.
- Test: sub-shot planning is dry-run-safe — `dry_run`/`plan_only` produces the `sub_shot_plan` without any paid provider calls, and per-sub-shot paid clip generation stays gated on the motion-prompt-pack approval checkpoint.
- Test: sub-shot decomposition does not add a pipeline stage or alter the canonical 15-stage `VerticalDramaPipelineStage` sequence or the ~4-phase grouping.
- Test: `repairStageOutput` with a sub-shot `target` and `repair_sub_shot`/`adjust_sub_shot_timing` creates a new superseding sub-shot artifact/version (keeping the per-parent duration sum and `minSubShotSeconds` floor) without overwriting the prior candidate.
- Test: with `verticalDramaSeriesSubShots` off, the `video_motion_prompt_pack` stage output is unchanged (no `sub_shot_plan`, single-clip-per-shot) — no regression to the stage sequence, phases, or status contract.

## Implementation Tasks

1. Add series CRUD and episode CRUD service methods.
2. Add protected tRPC procedures with feature flag checks.
3. Add memory retrieval/compaction helpers.
4. Add stage runner skeleton and stage result contract.
5. Wire skills from section 01 into dry-run stage calls.
6. Add approval checkpoint creation and approval/rejection mutation.
7. Add immutable repair artifact/version creation and supersede semantics.
8. Add stale propagation for changed script, character, start frame, audio, provider, and tie-in metadata.
9. Add repair entry point that targets a stage/artifact/shot/clip.
10. Add app-safe developer/admin equivalents for `vdflow run` and `vdflow repair`.
11. Add audit-safe run logging.
12. Add `listEpisodeRuns` and `listMemoryEvents` read-only queries plus `approveRetconProposal`/`rejectRetconProposal` mutations.
13. Group the 15 canonical stages into the ~4 phases with a phase progress indicator and a single primary CTA driven by `next_action`.
14. Add the Runs sub-list surface linking each run to its read-only artifact-ledger detail (section-09).
15. Add the Memory tab event timeline (append-only) plus current compacted summary, and the Retcon Proposal review surface wired to approve/reject.
16. Add approve-in-progress/approved-success/rejected states to `VerticalDramaApprovalBar`.
17. Add the Repair dialog (instruction capture with optional template prefill, paid-repair credit-estimate confirm, and repair job status/result) wired to `repairStageOutput`.
18. Add the read-only completed-episode historical view (final artifacts per stage) and reduced-motion handling for running-stage/timeline animations.

## Acceptance

- A user can create a series and a dry-run episode.
- Long-series memory can be reopened and used for later episodes.
- Stage state is resumable after page refresh.
- Approval and repair flows are deterministic.
- No paid generation runs in dry-run or before approval.
- The episode workspace presents progress as ~4 phases with exactly one primary CTA, and a user can browse the per-episode run history and open each run's read-only artifact-ledger detail.
- The Memory tab shows a browsable append-only event timeline (including past retcon proposals) plus the current compacted summary, and a user can review and approve or reject a retcon proposal, which appends a new event without altering prior events.
- A user can capture a repair instruction and run a repair, accepting a credit-estimate confirmation before any paid repair.
- A completed episode is viewable as a read-only historical view of its final artifacts per stage.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaEpisodeRunner
cd apps/web && pnpm test -- verticalDramaMemoryService
cd apps/web && pnpm check
```
