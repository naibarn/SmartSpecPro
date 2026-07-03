# section-09-assembly-export-artifacts

## Goal

Persist the complete run artifact ledger, import generated/imported Storyboard Review clip outputs, create the final episode assembly manifest, hand off to the app render/export path, and checkpoint memory updates.

## Depends On

- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline
- section-06-storyboard-review-handoff
- section-07-audio-dialogue-subtitles
- section-08-provider-qc-product-tie-in

## Files

Create:

- `apps/web/server/services/verticalDramaArtifactService.ts`
- `apps/web/server/services/verticalDramaAssemblyService.ts`
- `apps/web/server/services/verticalDramaExportService.ts`
- `apps/web/shared/verticalDramaSeries/artifacts.ts`
- `apps/web/shared/verticalDramaSeries/assembly.ts`
- `apps/web/server/services/__tests__/verticalDramaArtifactService.test.ts`
- `apps/web/server/services/__tests__/verticalDramaAssemblyService.test.ts`

Modify:

- Storyboard Review completion/export integration points only where final clip import needs source mapping.

## Required Artifacts

Every run persists:

- `input.normalized.json`
- `01_drama_script.json`
- `02_character_visual_bible.json`
- `03_character_assets_manifest.json`
- `04_storyboard_shotgrid.json`
- `05_start_frame_render_plan.json`
- `05a_contact_sheet_batch_plan.json`
- `05b_contact_sheet_assets_manifest.json`
- `05c_candidate_frame_selection.json`
- `06_start_frame_manifest.json`
- `07_video_motion_prompt_pack.json`
- `08_video_clip_manifest.json`
- `09_assembly_manifest.json`
- `10_qc_report.json`
- `readable_summary.md`
- `run_log.jsonl`

Export-adjacent artifacts:

- `concat.txt` equivalent metadata
- `subtitles.srt` equivalent metadata
- `audio_plan.json`
- `ffmpeg_command.sh` equivalent command metadata
- final `final_episode_60s_vertical.mp4` media asset ID when rendered

If final rendering cannot run, mark the run `assembly_ready` and keep all deterministic inputs inspectable.

## Assembly Contract

`VerticalDramaAssemblyManifest` includes:

- `handoffType = "video_assembly_manifest"`
- `targetDurationSeconds = 60`
- `assemblyManifestId` — the stable ID assigned when the assembly manifest is built; the originating Storyboard Review task's `assemblyManifestId` is set to this value so the review task and its assembly are linked bidirectionally.
- ordered clips and source shot numbers
- default bridge clip schedule: 8 clips from 9 frames, `1->2`, `2->3`, `3->4`, `4->5`, `5->6`, `6->7`, `7->8`, `8->9`
- default duration schedule: `8 + 8 + 8 + 8 + 8 + 8 + 8 + 4 = 60`
- fallback-profile schedule: when the `vertical_drama_60s_9_shots` fallback profile is used (providers without first/last-frame support), the manifest records 9 clips with the `8 + 8 + 8 + 4 + 8 + 8 + 4 + 8 + 4 = 60` (`[8, 8, 8, 4, 8, 8, 4, 8, 4]`) per-shot schedule instead of the default bridge schedule.
- trim metadata — per-clip trim/timing metadata for whichever profile is active (default `8+8+8+8+8+8+8+4` bridge or fallback `[8,8,8,4,8,8,4,8,4]` 9-clip), so `VerticalDramaAssemblyManifest.clips` reflects the actual final clip trimming.
- per-clip provider job IDs and their last stable provider statuses, ingested at render/assembly completion alongside clip media asset IDs and QC results.
- `ffmpeg_concat_plan`
- `subtitle_plan`
- `audio_bgm_plan`
- `export_settings`
- final output metadata or media asset ID

Export completion writes:

- a searchable `vertical_drama_qc_reports` row for export/assembly QC.
- an append-only `vertical_drama_memory_events` candidate for the episode recap.
- a pending memory approval checkpoint; canonical memory snapshots are updated only after approval/policy acceptance.
- app-safe `vdflow assemble` equivalent metadata for concat, subtitle, audio/BGM, export settings, and final media output.

### Sub-Shot Assembly (flag `verticalDramaSeriesSubShots`)

When the `verticalDramaSeriesSubShots` flag is on and the resolved provider is feasible for the requested decomposition (§7.4 Sub-Shot Decomposition), a main shot renders as 2-5 ordered **sub-shot clips** whose durations sum to the parent main-shot duration. The assembly contract extends additively; with the flag off, all rules above are unchanged.

- `VerticalDramaAssemblyManifest.clips` includes every sub-shot clip in **flatten order** — sorted by parent shot order first, then by sub-shot order within each parent (`parentShotNumber` asc, then `subShotNumber` asc). The `ffmpeg_concat_plan` is the ordered flatten of all sub-clips (plus any non-decomposed clips in their shot position), so the concat sequence is deterministic.
- each sub-shot clip records `parentShotNumber` + `subShotNumber` (per §7.4 / clip contract `parent_shot_number`, `sub_shot_number`); a non-decomposed clip omits these or sets `sub_shot_number = null` and keeps its existing single-clip position.
- per sub-clip **cut point** and **trim/timing** metadata are recorded on the clip entry (the sub-shot `durationSeconds` and its cut boundary relative to the parent), so `VerticalDramaAssemblyManifest.clips` reflects the actual final sub-clip trimming — mirroring the default-bridge and fallback trim-metadata rules above, at sub-shot granularity.
- the final concat is the ordered flatten of all sub-clips; the episode still totals `targetDurationSeconds = 60` because per-parent sub-shot durations sum to the parent main-shot duration and the 9 shots/frames are unchanged (sub-shots never add shots or frames).

Sub-shot assembly validation (in addition to the existing 60s/clip checks):

- per main shot, the sub-shot clip durations MUST sum to that parent main-shot duration (default bridge or fallback `[8,8,8,4,8,8,4,8,4]` schedule); a per-parent mismatch is a duration-mismatch repair action (see Implementation Tasks 12).
- the full episode MUST still sum to 60 seconds after flatten (Σ over all sub-clips of all parents = Σ parent durations = 60).
- sub-shots MUST NOT change the shot or frame count — assembly still resolves exactly 9 storyboard shots/frames; `source_shot_numbers` on each sub-clip still maps back to the 9 storyboard shots.

## Run Detail Read-Only Ledger

The Artifact Ledger panel (see UI/UX Contract) is currently scoped to a single (current) run. Per spec §7.3 (run artifacts) and §12.2 (run history), the artifact ledger must also be inspectable for ANY past run of an episode, not only the run in progress.

`VerticalDramaRunDetailView` is a read-only view that renders any past run's full artifact ledger:

- Reachable from the episode's run history (`listEpisodeRuns`, section 04) and the nested run route `/episodes/:episodeId/runs/:runId` (section 03).
- Renders the complete ledger for the selected run — `input.normalized.json` … `10_qc_report.json`, `readable_summary.md`, and `run_log.jsonl` (every artifact listed in Required Artifacts) — in read-only mode. No repair, re-run, export, or memory actions are offered from this view; it is inspection only.
- Includes a **run selector** that switches between runs of the same episode (from `listEpisodeRuns`) without leaving the view; selecting a run re-renders the ledger for that run's `runId`.
- Surfaces the selected run's **per-clip provider job IDs and their last stable provider statuses** (already ingested at render/assembly completion, see Assembly Contract) so a past run's provider outcomes remain inspectable per clip alongside clip media asset IDs and QC results.
- Always available regardless of series/episode lifecycle: run artifacts are immutable and durable (§11), so the run detail view renders for archived series and completed episodes just as it does for active ones.

The run selector reads run summaries from `listEpisodeRuns`; the ledger payload for a given `runId` is served by the artifact read/list helpers (`verticalDramaArtifactService`). Because artifacts are immutable, the view requires no write path and never mutates run, episode, or memory state.

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator finishing or debugging an episode.
- Goal: inspect final assembly readiness, export metadata, artifact lineage, and memory checkpoint status.
- Entry point: episode assembly/export stage.
- Success outcome: final output is export-ready or repairable without corrupting memory.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Assembly stage | episode workspace | manifest and export status |
| Artifact ledger panel | episode workspace/debug panel | artifact list and lineage |
| Run detail (read-only) | `/episodes/:episodeId/runs/:runId` (section 03) | past-run full artifact ledger + provider job IDs/statuses, run selector |
| Memory checkpoint panel | series/episode workspace | approve/reject memory update |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaArtifactService` | server service | ledger | stage artifacts |
| `verticalDramaAssemblyService` | server service | assembly manifest | clips/audio/subtitles |
| Artifact/assembly UI panels | section 03 UI | display/actions | artifact summaries |
| `VerticalDramaRunDetailView` | section 03 UI | read-only past-run ledger + run selector | `listEpisodeRuns` summaries, `verticalDramaArtifactService` ledger + per-clip provider job IDs/statuses |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | export/import pending state | UI test |
| empty | no clips shows repair/import guidance | service/UI test |
| error | failed assembly/export shows repair action | unit/UI test |
| success | assembly/export-ready summary visible | integration test |
| disabled/focus/hover | final export disabled until required clips pass QC | UI/accessibility test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | artifact list is readable and scroll-safe | screenshot |
| tablet 768x1024 | assembly summary and ledger stack cleanly | screenshot |
| desktop 1440x900 | ledger and manifest can be inspected side by side | screenshot |

### Accessibility Acceptance

- Artifact names and statuses are text-visible.
- Repair/export buttons have labels and disabled reasons.
- Long payload previews are scrollable and keyboard reachable.

### Copy Contract

- Copy must distinguish `assembly_ready`, exported, failed, and pending memory checkpoint.
- Memory checkpoint copy must state that approval applies future episode memory.

### Browser Evidence Required

Capture assembly-ready, failed repair, exported, and pending memory checkpoint states.

## Tests First

- Test: artifact ledger records every required artifact for dry-run.
- Test: contact-sheet batch plan, generated sheet asset manifest, cropped candidates, and selected candidate lineage are recorded.
- Test: candidate-frame selection artifact remains stable when resubmitted unchanged.
- Test: generated/imported Storyboard Review clip assets map back to assembly clips.
- Test: render/assembly completion ingests per-clip provider job IDs and their stable provider statuses (not only clip assets, QC, and manifest), and persists them on the assembly manifest.
- Test: run-detail view renders a selected past run's full artifact ledger (`input.normalized.json` … `10_qc_report.json`, `readable_summary.md`, `run_log.jsonl`) read-only, exposes per-clip provider job IDs and stable statuses, and the run selector switches to another run of the same episode and re-renders that run's ledger — including for an archived series / completed episode, since artifacts are immutable and durable.
- Test: building the assembly manifest assigns `assemblyManifestId` and writes it back onto the originating Storyboard Review task so review task and assembly are linked.
- Test: assembly manifest includes clips, concat plan, subtitle plan, audio/BGM plan, and export settings.
- Test: default bridge assembly manifest preserves 8 clips from 9 frames and `8+8+8+8+8+8+8+4` timing.
- Test: fallback `vertical_drama_60s_9_shots` profile assembly manifest records 9 clips with `[8,8,8,4,8,8,4,8,4]` per-clip trim/timing metadata summing to 60.
- Test: with `verticalDramaSeriesSubShots` on and provider-feasible, assembly concatenates sub-shot clips in flatten order (parent shot order, then sub-shot order) with per-sub-clip cut point and trim/timing; each sub-clip carries `parentShotNumber` + `subShotNumber` and the `ffmpeg_concat_plan` sequence equals the ordered flatten.
- Test: with sub-shots on, per-parent sub-shot clip durations sum to the parent main-shot duration and the flattened episode still sums to 60 seconds, with the shot/frame count unchanged (still 9).
- Test: assembly with `verticalDramaSeriesSubShots` off is unchanged — no sub-shot clips, no `parentShotNumber`/`subShotNumber` on clips, and the default-bridge / fallback manifests are byte-for-byte equivalent to the pre-sub-shot behavior (no regression).
- Test: final export asset is tenant-owned and linked to the episode.
- Test: failed assembly creates repair action.
- Test: completed export creates QC report, append-only memory event candidate, and pending memory update checkpoint, not automatic memory mutation.
- Test: `vdflow assemble` behavior is represented by app service tests for concat, subtitle, audio, export settings, and final output metadata.

## Implementation Tasks

1. Add artifact ledger service and stable hashing.
2. Add artifact read/list/debug UI payload helpers, including a read-only run-detail ledger payload keyed by `runId` (full ledger plus per-clip provider job IDs and stable statuses) that any past run of an episode can be served from.
3. Persist contact-sheet artifacts `05a`, `05b`, and `05c` from section 05.
4. Import Storyboard Review clip outputs into episode run state, ingesting per-clip media asset IDs, provider job IDs, and their stable provider statuses at render/assembly completion.
5. Build `VerticalDramaAssemblyManifest`, assign `assemblyManifestId`, write it back onto the originating Storyboard Review task, and record per-clip trim/timing for the active profile (default bridge `8+8+8+8+8+8+8+4` or fallback `vertical_drama_60s_9_shots` `[8,8,8,4,8,8,4,8,4]`).
6. Build concat/subtitle/audio/export metadata.
7. Hand off to existing render/export path where available.
8. Persist final media asset ID and QC result.
9. Write `vertical_drama_qc_reports` and append-only `vertical_drama_memory_events` candidates.
10. Create pending memory update checkpoint after export completion.
11. Add app-safe `vdflow assemble` equivalent.
12. Add repair actions for failed import, missing clip, duration mismatch, subtitle mismatch, and export failure.

## Acceptance

- Final assembly manifest round-trips and can be inspected from the series workspace.
- Any past run's full artifact ledger (with per-clip provider job IDs and stable statuses) is inspectable read-only from the run-detail view via the run selector, including for archived series and completed episodes.
- Contact-sheet, cropped-frame, and selected-frame lineage remains inspectable after assembly.
- Export-ready metadata exists even when final render is deferred.
- Assembly/export failures are repairable and do not corrupt series memory.
- Final output metadata can be debugged without relying on local GitHub-style output folders.

## Verification

```bash
cd apps/web && pnpm test -- verticalDramaArtifact
cd apps/web && pnpm test -- verticalDramaAssembly
cd apps/web && pnpm check
```
