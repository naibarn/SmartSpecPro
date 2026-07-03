# Implementation Plan: Feature 131 Vertical Drama Series Storyboard Video Flow

## 1. Purpose And Product Shape

Feature 131 adds a dedicated Dashboard workspace for long-running 9:16 vertical drama series. It is not a landing page and not a copy of Article Video Builder. It is a production workspace that owns series bible, character stock, episode continuity, start-frame candidates, motion prompt planning, provider routing, Storyboard Review handoff, and post-episode memory updates.

The main flow is:

```text
Dashboard Vertical Drama Series
  -> series project and memory
  -> character visual bible and reference stock
  -> episode script and 9-shot vertical storyboard
  -> 3x3 contact-sheet start-frame candidates
  -> selected start/stop frames
  -> video motion prompt pack and provider routing
  -> Storyboard Review project
  -> paid generation, repair, final assembly, memory checkpoint
```

The implementation must adapt the pinned GitHub guide at commit `e2dbef07d07447489d041112d862d994adeac5d4` while fitting SmartSpecPro's current skill registry, model registry, media asset registry, Storyboard Review, and feature-flag conventions.

## 2. Architecture Overview

Build Feature 131 as a set of vertical-drama-specific contracts and services layered on existing systems:

- `apps/web/shared/verticalDramaSeries/` contains pure contracts, validation helpers, model-resolution helpers, artifact names, and handoff mapping types.
- `apps/web/server/services/verticalDrama*` services own persistence, stage execution, artifact writing, media asset linkage, memory, provider routing, and Storyboard Review handoff.
- `apps/web/server/routers/verticalDramaSeries.ts` exposes protected tRPC procedures for Dashboard UI actions.
- `apps/web/skills/vertical-drama-*` contains the eight skill packages.
- `apps/web/client/src/pages/VerticalDramaSeriesPage.tsx` and detail/episode pages own user workflow UI.
- Storyboard Review remains the review/generation workspace through `mediaStudioStoryboardReviews.reviewData`.
- Existing `mediaAssets` remains the durable registry for generated/imported character stock, contact sheets, cropped candidates, selected start frames, clips, and final media.

Do not place core series memory only in Storyboard Review JSON. Storyboard Review receives a projection and backlink to the Vertical Drama source state.

## 3. Data Model And Persistence

Add first-class Drizzle tables for:

- `vertical_drama_series`
- `vertical_drama_characters`
- `vertical_drama_character_assets`
- `vertical_drama_episodes`
- `vertical_drama_episode_runs`
- `vertical_drama_run_artifacts`
- `vertical_drama_approval_checkpoints`
- `vertical_drama_memory_events`
- `vertical_drama_memory_snapshots`
- `vertical_drama_qc_reports`

Important fields:

- `tenantId`, `userId`, and ownership fields on every durable row.
- `seriesId`, `episodeId`, and `runId` on run-scoped rows.
- JSONB fields for stage payloads that need guide-compatible snake_case preservation.
- hashes/checksums for artifact stability.
- status/stale/repair fields for resumable stage execution.
- append-only memory event fields plus compact snapshot fields for 10-100 episode retrieval.
- QC report fields with stage, pass/fail score, target issue refs, and recommended repair actions.

The plan should avoid a table-per-artifact explosion. Use normalized rows for long-lived objects and JSONB payloads for evolving stage artifacts.

## 4. Skill Packages

Create eight skill packages under `apps/web/skills`:

- `vertical-drama-script-builder`
- `vertical-drama-character-visual-bible`
- `vertical-drama-storyboard-shotgrid`
- `vertical-drama-shot-start-frame-render`
- `vertical-drama-video-motion-prompt-pack`
- `vertical-drama-series-memory-planner`
- `vertical-drama-product-tie-in-planner`
- `vertical-drama-dialogue-audio-planner`

Each package includes:

- `SKILL.md`
- legacy `skill.md`
- `skill.json` where useful for imported guide parity
- schemas, examples, fixtures, tests metadata, verify script, help files, and contract docs

The four imported guide skills must round-trip upstream input/output schemas, manifest fields, enum values, snake_case fields, provider request payloads, and config parity terms. The four SmartSpecPro-only skills must use the same package shape and structured JSON outputs.

## 5. Runtime Pipeline

Create an episode runner service that supports modes:

- `dry_run`
- `plan_only`
- `render_images`
- `render_video`
- `full`
- `repair`

Stage order — this is the canonical `VerticalDramaPipelineStage` enum from spec §11.1/§11.5 (use these exact identifiers; do not invent alternate stage names):

1. `normalize_series_input`
2. `plan_episode_script`
3. `update_character_visual_bible`
4. `generate_or_import_character_refs`
5. `storyboard_shotgrid`
6. `start_frame_render_plan` — includes contact-sheet batch planning (`contact_sheet_3x3_batch`) when that start-frame mode is selected
7. `render_or_import_start_frames` — generate/crop/select contact-sheet candidate frames
8. `approve_start_frames`
9. `dialogue_audio_plan`
10. `video_motion_prompt_pack` — includes provider routing (`VideoRoutingDecision`)
11. `create_storyboard_review_project`
12. `review_generate_repair_in_storyboard_review`
13. `render_or_import_video_clips`
14. `assemble_episode_manifest`
15. `summarize_episode_to_series_memory` — writes the pending memory-update checkpoint (approved after export/QC)

QC is not a separate stage: each stage's `RunResult` carries an optional `qc?: QCResult` (spec §11.5/§16), and the artifact ledger persists `10_qc_report.json`. Every stage returns a structured `RunResult` with `status`, `next_action`, `artifactIds`, `warnings`, `errors`, and audit-safe debug details.

Approval checkpoints are durable immutable artifacts. Approving a checkpoint never rewrites the prior artifact; repair creates a new artifact version, supersedes the prior candidate, stores `sourceArtifactIds` and `repairRequestIds`, and keeps the audit chain visible.

Developer/admin equivalents to the GitHub CLI must exist through app-safe paths:

- `vdflow validate` -> skill verify scripts, schema tests, and app test commands.
- `vdflow run` -> episode stage runner in `dry_run`, `plan_only`, or `full`.
- `vdflow render-images` -> character/start-frame image generation or import stage.
- `vdflow render-video` -> approved provider clip job stage.
- `vdflow assemble` -> assembly/export service.
- `vdflow repair` -> repair stage/artifact/shot/clip route that creates a new repair artifact.

## 6. Contact-Sheet Start-Frame Flow

Default generated start-frame mode is `contact_sheet_3x3_batch`.

Core contracts:

- `VerticalDramaContactSheetBatchPlan`
- `VerticalDramaContactSheetGenerationJobGroup`
- `VerticalDramaContactSheetAsset`
- `VerticalDramaSelectedStartFrame`

Behavior:

- default image model is `google-banana-2-lite`, resolved through the model registry;
- dropdown lists every enabled compatible `type = "image"` model;
- unsupported image models show reason codes instead of disappearing;
- sheet count presets include 3 and 6;
- 3 sheets produce 27 candidates; 6 sheets produce 54 candidates;
- all sheet prompts, per-cell prompts, negative prompts, model IDs, references, and credit estimates are visible before generation;
- full contact sheets crop deterministically into 9 candidate frames;
- candidate frames validate or crop/pad/resize to 9:16 before approval;
- users select one final candidate per shot before handoff to Storyboard Review.

## 7. Video Model Routing

Video model selection must use the current model registry and provider capability metadata.

Required behavior:

- list every enabled compatible `type = "video"` model;
- resolve aliases such as `veo 3.1 lite`, `veo 3.1`, `omni flash`, `seedance 2.0 mini`, `seedance 2.0`, and `Grok Imagine 1.5`;
- support modes `first_last_frame_bridge`, `first_frame_to_video`, `image_to_video`, `text_to_video`, `reference_to_video`, and `prompt_only`;
- generate provider-ready prompt payloads from the approved episode script, selected frames, selected model, motion mode, audio policy, and tie-in policy;
- show selected model, resolved provider/API model ID, duration, prompt, negative prompt, provider payload preview, and credit estimate before paid generation.

Do not hard-code a Veo-only path. Veo-compatible first/last-frame bridge is preferred only when capability checks pass.

Provider access goes through a `VerticalDramaVideoProviderAdapter` interface — never one-off provider calls in UI/service code. The MVP allowlist and named adapters are:

- `VeoCompatibleVideoProvider` — the only first/last-frame human-face bridge provider for MVP, gated by tenant/provider config proving 9:16, duration, first/last-frame input, and audio policy support.
- `OpenAIVideoProvider` — prompt-only or capability-gated fallback for MVP; must NOT silently become the human-face bridge default.
- `ExternalImageToVideoProvider` — requires explicit tenant/provider configuration.
- `MockVideoProvider` — deterministic placeholder that makes dry-run and tests work without provider keys.

Default and fallback duration profiles:

- Default `vertical_drama_60s_9_frames_8_clips` (a.k.a. `veo31_first_last_bridge_60s`) uses 9 approved frames as 8 adjacent bridge clips: `1->2`, `2->3`, `3->4`, `4->5`, `5->6`, `6->7`, `7->8`, `8->9`. Preferred timing `8 + 8 + 8 + 8 + 8 + 8 + 8 + 4 = 60`s, trim metadata preserved in the assembly manifest.
- Fallback `vertical_drama_60s_9_shots` uses `motionMode = "per_shot_first_frame_or_prompt"` with 9 clips and `shotDurationsSeconds = [8,8,8,4,8,8,4,8,4]` (sum 60) when the bridge path is unavailable.
- Bridge mode creates 8 video clip requests mapped back to 9 source shots/frames; fallback modes may create 8-9 tasks only when the provider contract explicitly requires it. Every profile validates sum-of-durations == target and provider-supported durations.

**Sub-shot decomposition (opt-in, spec §7.4):** to feel edited like real footage — quick cuts, faster scene changes, not one stretched motion — each main shot can be decomposed into 2-5 sub-shots (`VerticalDramaSubShot`), short sub-clips whose durations SUM to the parent main-shot duration (episode stays 60s, storyboard stays 9 shots/frames). Governed by `VerticalDramaSubShotPolicy` (default target 2-3 per shot in `auto` mode, option to raise `maxPerShot` to 4-5, `minSubShotSeconds` floor ~1.2s). Gated by the `verticalDramaSeriesSubShots` flag (default off) and capability-gated: when the resolved provider supports the short durations/input mode, each sub-shot becomes its own short `video_clip_requests` entry carrying `parentShotNumber`+`subShotNumber` (assembly concatenates them as ordered cuts); otherwise degrade "as feasible" (fewer sub-shots, or collapse to the single parent clip). Sub-shots reuse the parent shot's start frame (reframed via `cameraSetup`) unless `perSubShotStartFrames` is set. Sub-shot prompts/camera/durations/transitions are visible and editable before paid generation and repairable per sub-shot (`repair_sub_shot`).
- Provider jobs must track create, poll, webhook, download/import, cancel, retry, `timed_out`, and stale/repair states, and map provider errors into stable app error codes.

## 8. Storyboard Review Handoff

Create one Storyboard Review project per episode run after required approvals pass.

Mapping rules:

- ordered tasks match clip/shot order;
- `task.prompt` contains video prompt only;
- start/stop frames are stored in `storyboardContext.referenceImages` with `referenceFrameRoles`;
- character/product/style references remain separate unless explicitly used as scene frames;
- `extraParams.source = "vertical_drama_series"`;
- include `seriesId`, `episodeId`, `episodeNumber`, `shotNumber`, `clipNumber`, `durationProfileId`, selected model IDs, prompt set IDs, contact-sheet IDs, candidate frame IDs, audio/subtitle IDs, tie-in metadata, continuity warnings, and provider routing decision;
- initialize `videoSegmentState.videoSegmentPlan.referenceMode = "start_stop"` for bridge mode;
- preserve `companionAudio`, `companionAudioUpdatedAt`, `voiceoverFullScript`, and per-task duration conventions;
- use a deterministic idempotency key so retries open the existing review project when appropriate.

Storyboard Review must show all prompts, selected frames, selected models, provider payload previews, candidate lineage, and source artifact IDs before paid generation.

## 9. Dashboard UI/UX Contract

### Target User / JTBD

- Role: content creator, marketer, or operator creating episodic vertical drama content.
- Goal: continue a series across many episodes while keeping characters, story arcs, start frames, prompts, and tie-ins consistent.
- Entry point: Dashboard menu item `Vertical Drama Series` / Thai `ซีรีย์แนวตั้ง`.
- Success outcome: user creates or resumes a series, plans an episode, approves prompts/frames, and creates a Storyboard Review project without hidden paid generation.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Series list | `/dashboard/vertical-drama` | list/create/resume workspace |
| Series detail | `/dashboard/vertical-drama/:seriesId` | progressive-disclosure tabs; Memory tab is an event timeline; Assets tab shows supersede lineage |
| Episode workspace | `/dashboard/vertical-drama/:seriesId/episodes/:episodeId` | phase-grouped stage runner (1 `next_action` CTA), contact sheets, approvals; read-only for completed episodes |
| Run detail (history) | `/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId` | read-only past-run artifact ledger + per-clip provider job statuses |
| Storyboard Review | existing route | metadata panels, image+video prompts, editable prompt + edit history, clickable QC repairs, backlink/breadcrumb |
| Feature flags/menu | shared config | hidden by default |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaSeriesPage` | client page | list/create UI | series router |
| `VerticalDramaSeriesDetailPage` | client page | progressive-disclosure tabs and memory | series, characters, episodes |
| `VerticalDramaEpisodeWorkspace` | component | phase-grouped stage runner and approvals | episode run state |
| `VerticalDramaContactSheetPicker` | component | prompt review, batch status, frame selection, reject/flag, version lineage, per-frame repair dialog | contact-sheet service |
| `VerticalDramaRunHistoryPanel` | component | run list + read-only run-detail ledger | `listEpisodeRuns` |
| `VerticalDramaMemoryTimeline` | component | append-only memory event timeline + retcon-proposal review | `listMemoryEvents` |
| `VerticalDramaRepairDialog` | component | capture repair instruction, credit confirm, submit to repair route | QC recommendedRepairs / target artifact |
| `VerticalDramaStoryboardReviewPanel` | Storyboard Review component | metadata display, prompts (image+video), edit + clickable repairs | handoff extraParams |

### History, Review, And Repair (spec §8.6)

The durable data (append-only memory events, superseded checkpoint artifacts, per-run artifact
ledger, preserved candidates) is browsable: run history + read-only run detail, per-shot version
lineage with old-vs-new compare, Memory event timeline (incl. `retcon_proposal` review),
re-viewable "prompts used" for completed runs, and end-to-end image repair — per-target
reject/flag → repair dialog capturing a user instruction → repair route → new non-destructive
version, with QC `recommendedRepairs` surfaced as clickable prefilled actions and a credit
confirm before paid repair. All surfaces stay read-only-reachable for completed/archived work.

### Simplicity (spec §8.7)

15 pipeline stages are grouped into ~4 labeled phases with one `next_action`-driven CTA; tabs use
progressive disclosure; planning vs paid generation stays visually distinct; breadcrumbs make
navigation reversible.

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeletons for list/detail/stage cards | component tests and screenshots |
| empty | first usable create-series workflow | component tests |
| error | recoverable alert with retry and reason code | unit/UI tests |
| success | active stage summary and next CTA | integration tests |
| disabled | paid buttons disabled until approval/credits pass | unit/UI tests |
| selected | selected candidate frames visibly pinned per shot | component tests |
| focus/hover | keyboard-visible controls and icon labels | accessibility check |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | single-column stage cards, no horizontal overflow | Playwright/screenshot |
| tablet 768x1024 | two-column where safe, sticky action bar remains reachable | Playwright/screenshot |
| desktop 1440x900 | dense three-panel workspace with list/detail/approval | Playwright/screenshot |
| laptop 1024x768 | controls do not overlap; candidate grid scrolls predictably | extended screenshot |
| wide-desktop 1280x800 | workspace remains constrained and scan-friendly | extended screenshot |

### Accessibility Acceptance

- All icon-only controls have accessible labels.
- Keyboard path reaches series list, create wizard, approval buttons, contact-sheet candidates, and Storyboard Review create action.
- Focus rings are visible.
- Error/warning/status messages have semantic text, not only color.
- Reduced motion is respected for progress indicators.

### Copy Contract

- Primary UI copy supports Thai and English.
- Labels distinguish planning, prompt generation, contact-sheet generation, Storyboard Review creation, and paid video generation.
- Warnings explain model incompatibility, credit estimate, provider fallback, stale prompts, missing references, and tie-in compliance.

### Browser Evidence Required

Collect browser evidence for list, detail, episode workspace, contact-sheet selection, and Storyboard Review handoff metadata at mobile, tablet, and desktop sizes.

## 10. Audio, Dialogue, Subtitles, And Product Tie-In

The dialogue/audio planner creates:

- shot/clip dialogue lines;
- narrator/dialogue mode;
- speaker-to-character mapping;
- voice continuity map;
- separate TTS plan;
- native audio prompt snippets only when model capability allows;
- subtitle cue plan with 9:16 safe areas;
- repair actions for overlong speech, missing voice IDs, unsupported native audio, or unsafe claims.

The product tie-in planner creates:

- per-episode usage policy;
- story function for each placement;
- regulated claim warnings;
- product reference asset requirements;
- `productSource` provenance (`manual` | `marketplace` | `library` | `uploaded_reference`) retained for audit;
- fatigue history and diversity checks;
- removable tie-in metadata.

Tie-in approval is mandatory for MVP and beta: every tie-in (including all regulated categories) requires human approval and manual review before paid generation, and must be approve/remove/repair-able before Storyboard Review creation. A `disclosurePolicy` governs caption/overlay disclosure text, which is stored separately from the video-generation prompt (never inlined into `task.prompt`). Tie-ins can never unrealistically solve the main conflict.

## 11. Artifacts, Assembly, And Memory

Every run writes a durable artifact ledger:

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

Final export-adjacent artifacts include concat plan, subtitle plan, audio plan, ffmpeg/export metadata, and final media asset ID when available.

Memory updates are pending checkpoints after export/QC, not automatic mutation. A user or policy gate approves memory writes so bad generated output does not pollute future episodes.

Series memory is append-only: `vertical_drama_memory_events` carries a typed `VerticalDramaMemoryKind` (including `retcon_proposal`), and compact `vertical_drama_memory_snapshots` support retrieval bundles for 10/20/30/up-to-100 episodes via `compactionStrategy = "rolling_summary_plus_events"`. Retcons are explicit proposals: an approved retcon writes a NEW event and never mutates or deletes prior events, preserving the audit chain. Retrieval-bundle construction honors `includeResolvedHookLookbackCount` (default 10) and product/placement fatigue limits.

## 12. Rollout And Verification

Rollout sequence:

1. contracts/tables/flags;
2. skills and fixtures;
3. dry-run stage runner;
4. Dashboard list/detail/episode shell;
5. contact-sheet planning/selection;
6. provider model routing;
7. Storyboard Review handoff;
8. audio/dialogue/tie-in/QC;
9. assembly/export and memory checkpoint;
10. browser evidence and beta enablement.

Feature flags default off and must include the source-spec flags:

- `verticalDramaSeries`
- `verticalDramaSeriesDashboardMenu`
- `verticalDramaSeriesSkillChain`
- `verticalDramaSeriesCharacterStock`
- `verticalDramaSeriesMemory`
- `verticalDramaSeriesProductTieIn`
- `verticalDramaSeriesStartFrames`
- `verticalDramaSeriesFirstLastFrameBridge`
- `verticalDramaSeriesStoryboardReviewHandoff`
- `verticalDramaSeriesProviderRouting`
- `verticalDramaSeriesQcRepair`
- `verticalDramaSeriesDialogueAudio`
- `verticalDramaSeriesSubtitles`
- `verticalDramaSeriesSubShots`

If the implementation needs local aliases such as `verticalDramaSeriesEnabled`, they must map to these canonical flags in one place and tests must prove the mapping.

Global verification:

- `cd apps/web && pnpm test -- verticalDrama`
- `cd apps/web && pnpm test -- skillRegistry`
- `cd apps/web && pnpm test -- storyboardReviewWorkspace`
- `cd apps/web && pnpm check`
- run focused pytest only if Python provider code changes.
