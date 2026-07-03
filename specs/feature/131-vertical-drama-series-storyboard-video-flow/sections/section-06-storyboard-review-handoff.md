# section-06-storyboard-review-handoff

## Goal

Create idempotent Storyboard Review projects from approved Vertical Drama episode plans with exact start/stop frames, prompts, model selections, provider payload previews, audio/subtitle metadata, product tie-in metadata, and continuity lineage.

## Depends On

- section-02-contracts-persistence-assets
- section-04-series-memory-and-episode-pipeline
- section-05-character-stock-and-start-frames
- section-07-audio-dialogue-subtitles
- section-08-provider-qc-product-tie-in

## Files

Create:

- `apps/web/server/services/verticalDramaStoryboardHandoffService.ts`
- `apps/web/shared/verticalDramaSeries/storyboardHandoff.ts`
- `apps/web/client/src/lib/verticalDramaStoryboardReviewMetadata.ts`
- `apps/web/client/src/lib/verticalDramaStoryboardReviewMetadata.test.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardReviewMetadataPanel.tsx`
- focused handoff tests

Modify:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- Storyboard Review metadata panel components
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts` only if normalization needs a typed vertical-drama envelope

## Handoff Rules

- Create one Storyboard Review project per approved episode handoff.
- Task order matches clip/shot order.
- Default `first_last_frame_bridge` handoff maps 9 approved frames into 8 adjacent video clip tasks: `1->2`, `2->3`, `3->4`, `4->5`, `5->6`, `6->7`, `7->8`, `8->9`.
- Default bridge timing is `8 + 8 + 8 + 8 + 8 + 8 + 8 + 4 = 60` seconds and per-task `durationSeconds` must preserve the selected duration profile.
- Fallback modes may create 8-9 tasks only when the selected provider contract requires it; metadata must still map each task back to source shot/frame IDs.
- `task.prompt` is video prompt only.
- Start/stop frames are in `storyboardContext.referenceImages`.
- `referenceFrameRoles` is `["start", "stop"]` for bridge mode.
- Character/product/style references remain separate unless explicitly used as scene frames.
- Contact-sheet IDs, candidate frame IDs, selected start-frame candidate IDs, and prompt set IDs round-trip in metadata.
- Every task carries the literal `extraParams.source = "vertical_drama_series"` so downstream Storyboard Review helpers can identify vertical-drama handoffs.
- `extraParams` carries the full vertical-drama ID set for lineage and repair, not only contact-sheet/candidate/prompt-set IDs. Required at handoff creation: `seriesId`, `episodeId`, `episodeNumber`, `shotNumber`, `durationProfileId`, selected image model ID, and selected video model ID. Optional / populated-when-available (matches spec §12 optional fields): `clipNumber`, `dialogueAudioPlanId`, `subtitleCueIds`, `providerRoutingDecision`, `continuityWarnings`, and `assemblyManifestId`. `assemblyManifestId` is back-filled later at `assemble_episode_manifest` (section-09) and written back onto the review task — it does not exist when the handoff is first created.
- `extraParams` also carries the skill-ID fields used to produce the handoff: `videoPromptSkillId`, `storyboardSkillId`, `characterBibleSkillId`, and `dialogueAudioSkillId`.
- `videoSegmentState.videoSegmentPlan.referenceMode` is `start_stop` for bridge mode.
- Existing `companionAudio`, `companionAudioUpdatedAt`, `voiceoverFullScript`, task duration, and stale-state conventions are preserved.
- Idempotency key prevents duplicate review projects. The key is deterministic and pinned to the format `vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>`, where `episodePlanHash` is derived from the approved episode plan.
- Retrying the handoff with the same key (same approved plan) reopens/updates the existing Storyboard Review project rather than creating a new one.
- Creating a NEW Storyboard Review project requires a new `episodePlanHash` (a changed approved plan) or an explicit user action.

### Prompt Visibility, Editing, and Repair Rules

- Image-side prompts are surfaced read-only in the review panel, not only the video prompt (spec §8.5). For each shot the panel exposes the contact-sheet prompt, the per-cell prompts, the negative prompts, and the selected-candidate lineage (which candidate frame ID / prompt-set ID produced the chosen start/stop frame). These render clearly separated from the video `task.prompt` so image prompts are never confused with the motion prompt.
- The video/motion prompt is **editable** in Storyboard Review (spec: prompts are inspectable AND editable). The panel provides an explicit editable video/motion-prompt control, not just a read-only inspector.
- Each manual prompt edit is persisted as a NEW append-only artifact version (never an in-place overwrite), reusing the existing supersede semantics (§11.6, L1686). Every edit version captures `editedByUserId`, `editedAt`, and the original prompt text so the full edit history is auditable and reversible.
- Editing a video prompt re-applies the stale/paid-generation gating: a manual edit marks downstream paid generation stale until re-confirmed, consistent with the model/frame stale rules.
- The provider payload preview renders as a labeled key/value block or a collapsible formatted block — never an unstructured raw-JSON blob — so creators can scan model, parameters, and reference wiring at a glance.
- QC `recommendedRepairs[]` (§8.5 QC, §16) render as actionable buttons, not display-only text. Each entry opens a repair dialog PRE-FILLED with its `action`, `instruction`, and target (`shotNumber` / `clipNumber` / `artifactId`), and submitting calls the existing repair route with that exact target + instruction.
- Completed runs/tasks expose a read-only "prompts used" view keyed to the finished run/task (§8.5, L2665). Reopening a finished episode shows the exact prompts (per shot / per cell / per clip) that were actually used to generate it, including any edited prompt versions from the append-only history.
- A breadcrumb (Series › Episode › Storyboard Review) is provided alongside the existing back link so users can navigate the lineage from the review surface.

### Sub-Shot Handoff Rules (`verticalDramaSeriesSubShots`)

- These rules apply ONLY when the `verticalDramaSeriesSubShots` feature flag is on AND the main shot was decomposed into sub-shots that are emitted as their own provider sub-clips (spec §7.4 Sub-Shot Decomposition). With the flag off — or when the resolved provider degrades to a single parent clip (`fallbackOnUnsupported`) — the parent shot maps to exactly ONE Storyboard Review video task, unchanged from the default Handoff Rules above.
- When sub-shots are enabled and emitted as sub-clips, create one ordered Storyboard Review video task PER sub-shot under the parent shot (2-5 sub-shots per decomposed main shot), preserving sub-shot order. Sub-shots never change the 9-shot storyboard or the 60-second episode total — they only subdivide a parent shot's screen time into ordered cuts.
- Task order is shot order first, then sub-shot order within each parent shot (`parentShotNumber` ascending, then `subShotNumber` ascending). The parent-shot position in the overall clip/shot sequence is preserved.
- Each sub-shot task's `extraParams` carries `parentShotNumber` (the decomposed main shot, one of the 9 storyboard shots), `subShotNumber` (1-based order within the parent shot), `subShotCount` (total sub-shots for that parent shot), and `subShotTransitionIn` (`cut` | `match_cut` | `smash_cut` | `continuous` — how the sub-shot follows the prior sub-shot), matching spec §12 `VerticalDramaTaskExtraParams`.
- `extraParams.shotNumber` still resolves back to the parent storyboard shot (the sub-shot's `source_shot_numbers` maps to the 9 storyboard shots); the sub-shot fields are additive lineage on top of the existing required ID set — a non-decomposed task omits them (or sets `subShotNumber = null`).
- `task.prompt` remains the (sub-shot) video/motion prompt only — the sub-shot's own motion prompt, never the parent-shot prompt, image prompts, camera-setup text, or transition label.
- Per-task `durationSeconds` carries the sub-shot's duration; sub-shot durations under a parent shot sum to that parent main-shot's duration (spec §7.4). Start frames default to the parent shot's approved start frame (reframed via the sub-shot `cameraSetup`) unless `perSubShotStartFrames` opted into distinct per-sub-shot start frames.
- Idempotency is unchanged: sub-shot tasks live under the same per-episode review project keyed by `vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>`; the decomposition is part of the approved plan, so a changed sub-shot plan changes `episodePlanHash`.

### Sub-Shot Prompt Editing Rules

- Each sub-shot's camera setup, motion prompt, duration, and transition are editable in Storyboard Review before paid generation, reusing the existing editable video/motion-prompt control and append-only edit-history rules (see "Prompt Visibility, Editing, and Repair Rules"; supersede semantics §11.6, L1686).
- Each manual sub-shot edit is persisted as a NEW append-only artifact version (never in-place overwrite), capturing `editedByUserId`, `editedAt`, and the original value, so the sub-shot edit history is auditable and reversible.
- Editing any sub-shot field re-applies the stale/paid-generation gating for that sub-shot's task, consistent with the model/frame stale rules; sub-shot repair is scoped per sub-shot (spec §7.4 `repair_sub_shot`).

## UI/UX Contract

### Target User / JTBD

- Role: creator reviewing an episode before paid video generation.
- Goal: inspect every frame, prompt, model, payload preview, audio/subtitle decision, and tie-in before spending credits.
- Entry point: Storyboard Review created from Vertical Drama episode.
- Success outcome: user can approve/generate/repair clips from a transparent review surface.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard Review project | existing Storyboard Review route | vertical-drama metadata panels |
| Metadata panel | Storyboard Review components | prompt/model/frame lineage |
| Backlink | Storyboard Review header or metadata panel | return to series/episode |
| Breadcrumb | Storyboard Review header | Series › Episode › Storyboard Review lineage nav |
| Prompt editor | Metadata panel per shot/clip | editable video/motion prompt + append-only edit history |
| Repair action | Repair queue / QC panel | prefilled repair dialog from `recommendedRepairs[]` |

### Episode Panel Display Fields

The Storyboard Review episode/metadata panel must display these vertical-drama fields (per spec §8.5):

- series title and episode number
- shot/clip order
- character references attached to each shot
- start-frame asset status
- motion mode: first/last-frame bridge (`first_last_frame_bridge`), first-frame-only (`first_frame_to_video`), or prompt-only (`prompt_only`)
- product tie-in usage for this episode
- continuity warnings
- audio/subtitle/overlay strategy
- voice casting and subtitle safe-area status
- per-shot image-side prompts (contact-sheet prompt, per-cell prompts, negative prompts) shown read-only and clearly separated from the video prompt (§8.5)
- selected-candidate lineage per shot (candidate frame ID / prompt-set ID that produced the chosen start/stop frame)
- editable video/motion prompt control with an append-only edit-history view (editor + timestamp + original text per version) (§11.6, L1686)
- formatted (labeled key/value or collapsible) provider payload preview — not raw JSON
- repair queue rendered as actionable, prefilled `recommendedRepairs[]` repair buttons (§8.5 QC, §16)
- read-only "prompts used" view for completed runs/tasks (per shot / cell / clip) (§8.5, L2665)
- per-shot sub-shot breakdown when `verticalDramaSeriesSubShots` is on and the shot was decomposed: the sub-shot count, and for each sub-shot its camera setup, duration, transition (`cut`/`match_cut`/`smash_cut`/`continuous`), and motion prompt — shown grouped under the parent shot and clearly labelled as sub-shots (§7.4); a non-decomposed shot shows no sub-shot group
- editable sub-shot fields (camera setup / motion prompt / duration / transition) per sub-shot, reusing the editable video/motion-prompt control and append-only edit-history view, visible before paid generation (§7.4, §11.6)
- breadcrumb (Series › Episode › Storyboard Review) alongside the back link
- back link to series workspace

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `verticalDramaStoryboardHandoffService` | server service | reviewData creation | approved episode state |
| `VerticalDramaStoryboardReviewMetadataPanel` | component | display metadata | `extraParams.verticalDrama` |
| `verticalDramaStoryboardReviewMetadata` | client lib | normalize metadata | reviewData |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | existing Storyboard Review loading | route test |
| empty | missing vertical-drama metadata shows recoverable warning | unit test |
| error | invalid lineage prevents paid generation | unit/UI test |
| success | prompts/models/frames visible | integration/browser |
| disabled | generate disabled if references or payload stale | unit test |
| focus/hover | metadata controls keyboard reachable | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | metadata stacks below task controls | screenshot |
| tablet 768x1024 | panels remain readable without overlap | screenshot |
| desktop 1440x900 | metadata and task preview fit in workspace | screenshot |
| laptop 1024x768 | no clipped action buttons | extended screenshot |
| wide-desktop 1280x800 | stable dense panel layout | extended screenshot |

### Accessibility Acceptance

- Metadata sections have headings.
- Prompt and payload preview panels are copyable and keyboard accessible.
- The provider payload preview is presented as labeled key/value rows or a collapsible formatted block with an accessible expand/collapse control — not an unlabeled raw-JSON blob.
- The editable video/motion prompt control is a labelled form field; its append-only edit-history entries are readable as text (editor, timestamp, original text).
- `recommendedRepairs[]` repair buttons are keyboard-focusable and name their action/target.
- Image-side prompts and the video prompt are under distinct labelled headings so they are not conflated.
- Frame roles are text-labelled, not only positional.
- Disabled generate reasons are explicit.

### Copy Contract

- Copy must clearly separate image prompts, video prompts, model selections, provider payload previews, and paid generation.
- Image-side prompts (contact-sheet, per-cell, negative) are labelled as such and separated from the video/motion prompt.
- The edit-history view labels each version with editor, timestamp, and "original prompt" so an edit is never mistaken for the live prompt.
- The "prompts used" view is labelled as the historical record for a completed run, distinct from the currently editable prompt.
- Thai/English labels should match Dashboard terminology.

### Browser Evidence Required

Capture Storyboard Review metadata with selected frames, provider payload preview, stale disabled state, and ready state.

## Tests First

- Test: 60-second episode creates ordered tasks.
- Test: default bridge mode creates 8 adjacent clip tasks from 9 approved source frames.
- Test: default bridge mode preserves `8+8+8+8+8+8+8+4` duration metadata.
- Test: `task.prompt` excludes image prompts, overlays, and non-video metadata.
- Test: start/stop frames and frame roles map correctly.
- Test: character and product references remain separate.
- Test: all contact-sheet/candidate lineage round-trips.
- Test: selected image/video models and provider payload previews are visible.
- Test: stale model/frame changes disable paid generation until repaired.
- Test: idempotency key is built deterministically as `vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>` from the approved episode plan.
- Test: idempotency key opens/updates the existing project on retry with the same plan hash, and a changed approved plan (new `episodePlanHash`) or explicit user action creates a new project.
- Test: `extraParams` round-trips the full vertical-drama ID set — required-at-creation (`source`, `seriesId`, `episodeId`, `episodeNumber`, `shotNumber`, `durationProfileId`, selected image/video model IDs) plus optional/when-available (`clipNumber`, `dialogueAudioPlanId`, `subtitleCueIds`, `providerRoutingDecision`, `continuityWarnings`) and the skill-ID fields (`videoPromptSkillId`, `storyboardSkillId`, `characterBibleSkillId`, `dialogueAudioSkillId`); `assemblyManifestId` is absent at creation and present only after assembly back-fill.
- Test: `companionAudioUpdatedAt` is preserved alongside `companionAudio`, `voiceoverFullScript`, and per-task duration.
- Test: metadata panel displays all §8.5 episode-panel fields (motion mode label, voice casting, subtitle safe-area status, and repair queue).
- Test: the review panel renders per-shot image-side prompts (contact-sheet prompt, per-cell prompts, negative prompts) and selected-candidate lineage, visually/structurally separated from the video `task.prompt` (§8.5).
- Test: editing a video/motion prompt records an append-only edit version capturing `editedByUserId`, `editedAt`, and the original prompt text (supersede semantics, §11.6, L1686) rather than overwriting in place, and re-applies stale/paid-generation gating.
- Test: the provider payload preview renders as labeled key/value rows or a collapsible formatted block, not an unstructured raw-JSON blob.
- Test: each `recommendedRepairs[]` entry renders as an actionable button that opens a repair dialog pre-filled with its `action`, `instruction`, and target (`shotNumber`/`clipNumber`/`artifactId`); submitting calls the repair route with the correct target + instruction (§8.5 QC, §16).
- Test: reopening a completed episode shows the exact "prompts used" per clip (per shot/cell/clip), keyed to the finished run/task, including edited prompt versions from the append-only history (§8.5, L2665).
- Test: a breadcrumb (Series › Episode › Storyboard Review) renders alongside the existing back link and navigates the lineage.
- Test: with `verticalDramaSeriesSubShots` on and a main shot decomposed into sub-clips, the handoff creates one ordered Storyboard Review video task PER sub-shot under the parent shot, in shot-order then sub-shot-order (`parentShotNumber` then `subShotNumber`).
- Test: each sub-shot task's `extraParams` carries the correct `parentShotNumber`, `subShotNumber`, `subShotCount`, and `subShotTransitionIn` (one of `cut`/`match_cut`/`smash_cut`/`continuous`), and `extraParams.shotNumber` still resolves to the parent storyboard shot (§7.4, §12).
- Test: a sub-shot task's `task.prompt` is the sub-shot motion prompt only (excludes the parent-shot prompt, image prompts, camera-setup text, and transition label), and its `durationSeconds` is the sub-shot duration.
- Test (no regression): a non-decomposed shot (flag off, or provider degrades to a single clip) produces exactly ONE task with no sub-shot `extraParams` (or `subShotNumber = null`), identical to default handoff.
- Test: the metadata panel renders the grouped per-shot sub-shot breakdown (count, and each sub-shot's camera setup, duration, transition, and prompt) under the parent shot, clearly labelled; a non-decomposed shot renders no sub-shot group.
- Test: editing a sub-shot camera setup / motion prompt / duration / transition records an append-only edit version (`editedByUserId`, `editedAt`, original value) via supersede semantics (§11.6, L1686) rather than overwriting, and re-applies stale/paid-generation gating for that sub-shot task.

## Implementation Tasks

1. Build `VerticalDramaStoryboardHandoff` to Storyboard Review draft mapper.
2. Add idempotency lookup and backlink metadata. Compute the deterministic key `vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>` (with `episodePlanHash` derived from the approved episode plan); same-key retries reopen/update the existing project, and a new project requires a new plan hash or explicit user action.
3. Attach start/stop frames and reference roles.
4. Store vertical-drama metadata in `extraParams`.
5. Add metadata panel normalization and display.
6. Add stale-state and disabled-generation guards.
7. Preserve existing Storyboard Review audio and duration conventions.
8. Add tests for load/save/backlink and duplicate prevention.
9. Surface per-shot image-side prompts (contact-sheet, per-cell, negative) and selected-candidate lineage read-only, separated from the video prompt (§8.5).
10. Add an editable video/motion-prompt control that writes each manual edit as a new append-only artifact version with `editedByUserId`/`editedAt`/original text (reuse supersede semantics, §11.6, L1686) and re-triggers stale/paid gating.
11. Render the provider payload preview as a labeled key/value or collapsible formatted block (no raw-JSON blob).
12. Wire `recommendedRepairs[]` entries to actionable buttons that open a prefilled repair dialog (`action` + `instruction` + target) and call the repair route.
13. Add a read-only "prompts used" view for completed runs/tasks keyed by run/task ID (§8.5, L2665).
14. Add a breadcrumb (Series › Episode › Storyboard Review) alongside the back link.
15. When `verticalDramaSeriesSubShots` is on and a shot is emitted as sub-clips, fan the parent shot out into one ordered Storyboard Review task per sub-shot (shot order then sub-shot order), writing `parentShotNumber`/`subShotNumber`/`subShotCount`/`subShotTransitionIn` into each task's `extraParams` and the sub-shot motion prompt into `task.prompt`; keep the single-task path unchanged when the flag is off or the provider degrades to a single clip.
16. Render the grouped per-shot sub-shot breakdown in the metadata panel and make each sub-shot's camera setup / motion prompt / duration / transition editable via the existing append-only edit-history control before paid generation.

## Acceptance

- Storyboard Review opens with reviewable vertical drama metadata.
- Paid generation remains explicit.
- Handoff round-trips through save/load without losing frame roles or continuity metadata.
- User can inspect and repair prompts/start frames before generating video.
- User can read image-side prompts (contact-sheet/per-cell/negative) and candidate lineage per shot, separated from the video prompt.
- User can edit the video/motion prompt, and every edit is preserved as an append-only version with editor, timestamp, and original text.
- Provider payload preview is formatted (labeled/collapsible), not raw JSON.
- QC `recommendedRepairs[]` are clickable and open a prefilled repair dialog that calls the repair route with the correct target + instruction.
- Reopening a completed episode shows the exact prompts used per clip.
- A breadcrumb (Series › Episode › Storyboard Review) is available alongside the back link.
- When `verticalDramaSeriesSubShots` is on and a shot is decomposed into sub-clips, each sub-shot becomes its own ordered Storyboard Review task with correct `parentShotNumber`/`subShotNumber`/`subShotCount`/`subShotTransitionIn`, while a non-decomposed shot still produces a single task.
- The panel shows the grouped sub-shot breakdown per parent shot, and a user can edit each sub-shot's camera setup, motion prompt, duration, and transition (append-only history) before paid generation.

## Verification

```bash
cd apps/web && pnpm test -- storyboardReviewWorkspace
cd apps/web && pnpm test -- verticalDramaStoryboard
cd apps/web && pnpm check
```
