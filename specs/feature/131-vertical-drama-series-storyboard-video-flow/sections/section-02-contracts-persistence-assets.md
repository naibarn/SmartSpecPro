# section-02-contracts-persistence-assets

## Goal

Add shared contracts, database tables, artifact contracts, and media asset ownership boundaries for Vertical Drama Series.

## Depends On

- Existing `apps/web/drizzle/schema.ts`
- Existing `mediaAssets` table
- Existing Storyboard Review persistence table `mediaStudioStoryboardReviews`

## Files

Create:

- `apps/web/shared/verticalDramaSeries/index.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/artifacts.ts`
- `apps/web/shared/verticalDramaSeries/memory.ts`
- `apps/web/shared/verticalDramaSeries/assets.ts`
- `apps/web/shared/verticalDramaSeries/contactSheets.ts`
- `apps/web/shared/verticalDramaSeries/providerRouting.ts`
- `apps/web/shared/verticalDramaSeries/storyboardHandoff.ts`
- `apps/web/shared/verticalDramaSeries/assembly.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/contracts.test.ts`

Modify:

- `apps/web/drizzle/schema.ts`
- generated Drizzle migration files

## Data Model

Add tables:

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

All first-class rows include tenant/user ownership. Run-scoped rows include `seriesId`, `episodeId`, and `runId`. Use JSONB for fast-evolving guide-compatible payloads. Store media references as media asset IDs, not provider URLs.

Required indexes:

- `(tenantId, ownerUserId, updatedAt)` for series list.
- `(tenantId, seriesId, episodeNumber)` unique for episodes.
- `(tenantId, seriesId, characterId)` for character lookup.
- `(tenantId, seriesId, status)` for active/needs-repair dashboards.
- `(tenantId, seriesId, memoryKind, createdAt)` for append-only memory retrieval.
- `(tenantId, seriesId, episodeId, runId, stage)` for QC reports and artifact lookup.

## Core Contracts

Define field-only TypeScript contracts for:

- `VerticalDramaSeries`
- `VerticalDramaCharacter`
- `VerticalDramaCharacterAsset`
- `VerticalDramaEpisode`
- `VerticalDramaEpisodeRun`
- `VerticalDramaRunArtifact`
- `VerticalDramaApprovalCheckpoint`
- `VerticalDramaApprovalCheckpointArtifact`
- `VerticalDramaMemoryEvent`
- `VerticalDramaSeriesMemory`
- `VerticalDramaContactSheetBatchPlan`
- `VerticalDramaContactSheetGenerationJobGroup`
- `VerticalDramaContactSheetAsset`
- `VerticalDramaSelectedStartFrame`
- `VerticalDramaVideoModelRoutingPlan`
- `VerticalDramaProviderJob`
- `VerticalDramaStoryboardHandoff`
- `VerticalDramaAssemblyManifest`
- `VerticalDramaQcReport`
- `VerticalDramaQcResult`
- `VerticalDramaMinimalInput`
- `VerticalDramaSeriesPolicy`
- `VerticalDramaSeriesBible`
- `VerticalDramaMemoryRetrievalPolicy`
- `VerticalDramaUpstreamMinimalEpisodeInput`
- `VerticalDramaAssetRecordSnapshot`
- `VerticalDramaMemoryKind`
- `VerticalDramaDurationProfile` (default `vertical_drama_60s_9_frames_8_clips` + fallback `vertical_drama_60s_9_shots`)
- `VerticalDramaSubShotPolicy`
- `VerticalDramaSubShot`
- `RunResult`
- `VideoRoutingDecision`
- `NormalizedEpisodeInput`
- `VerticalDramaProviderCapabilities`
- `VerticalDramaWarning`

`VerticalDramaMinimalInput` must support the source-spec MVP input: locale, story title, target duration, story brief, character list, optional tie-in config, and age control. App UI fields may be friendlier, but persisted normalized input must preserve upstream-compatible field names in `input.normalized.json`.

`VerticalDramaApprovalCheckpointArtifact` must preserve checkpoint ID, run/series/episode IDs, stage, state, approving/rejecting user IDs, `sourceArtifactIds`, `repairRequestIds`, notes, and timestamps. Approval and repair flows must create new artifacts/versions instead of overwriting prior approved or rejected candidates.

### Series Policy And Bible Contracts (spec §7.3)

`VerticalDramaSeriesPolicy` governs how much automation and spend a series is allowed. `generationMode` gates dry-run vs. approval-gated vs. auto-after-approval execution:

```ts
type VerticalDramaSeriesPolicy = {
  visibility: "private" | "tenant" | "shared_group";
  generationMode: "dry_run" | "approval_required" | "auto_after_approval";
  maxConcurrentEpisodeRuns: number;
  maxProviderSpendPerEpisodeCredits?: number;
  requireTieInApproval: boolean;
  requireCharacterAssetApproval: boolean;
  retentionPolicyId?: string;
};
```

`VerticalDramaSeriesBible` is the durable creative source-of-truth persisted on the series row (JSONB) and referenced by episode planning:

```ts
type VerticalDramaSeriesBible = {
  logline: string;
  mainPlot: string;
  seasonArc: string;
  visualStyle: string;
  pacingStyle: string;
  cameraGrammar: string;
  locations: VerticalDramaLocation[];
  characters: VerticalDramaCharacter[];
  relationshipMap: VerticalDramaRelationship[];
  recurringProps: VerticalDramaProp[];
  continuityRules: string[];
};
```

`VerticalDramaMemoryRetrievalPolicy` controls how compact series memory is assembled into episode prompts. Defaults are pinned so retrieval is deterministic and token-bounded:

```ts
type VerticalDramaMemoryRetrievalPolicy = {
  includeCanonicalFacts: true;
  includeLastEpisodeCount: number; // default 3
  includeOpenHooks: true;
  includeResolvedHookLookbackCount: number; // default 10
  includeCharacterState: true;
  includeProductTieInHistory: true;
  maxPromptTokens: number;
  compactionStrategy: "rolling_summary_plus_events";
};
```

### Upstream Minimal Episode Input And Age Control (spec §7.2)

The imported GitHub minimal example must be accepted and stored losslessly as the raw upstream snake_case shape, separately from SmartSpecPro's app-facing camelCase `VerticalDramaMinimalInput`:

```ts
type VerticalDramaUpstreamMinimalEpisodeInput = {
  story_title: string;
  duration_seconds: 60;
  story_brief: string;
  characters: Array<{
    character_id: string;
    name: string;
    role: string;
  }>;
  episode_count: number;
  age_control?: {
    target_age_group: "preschool" | "children" | "tweens" | "teens" | "young_adults" | "adults" | string;
    target_rating?: string;
  };
};
```

Persistence rules:

- Store the upstream minimal input losslessly (raw snake_case) alongside the normalized app shape; do not lossy-map on the way in.
- Preserve the original brief and inferred fields **separately** in `input.normalized.json` so audit and repair can distinguish user-supplied text from skill-inferred fields.
- The upstream `target_age_group` enum accepts `preschool`, `children`, `tweens`, `teens`, `young_adults`, and `adults` (open string for forward-compat); SmartSpecPro's own `ageControl.targetAgeGroup` uses the reduced `children | teens | adults` set and maps upstream buckets into it.

### Asset Record Parity Snapshot (spec §7.1)

`VerticalDramaAssetRecordSnapshot` mirrors the GitHub guide's per-asset ledger for parity, including face and QC fields, and is subject to redaction before browser exposure:

```ts
type VerticalDramaAssetRecordSnapshot = {
  asset_id: string;
  run_id: string;
  stage: VerticalDramaPipelineStage | string;
  asset_type:
    | "character_reference"
    | "product_reference"
    | "start_frame"
    | "video_clip"
    | "audio"
    | "subtitle"
    | "thumbnail"
    | string;
  local_path?: string;
  file_id?: string;
  image_url?: string;
  mediaAssetId?: string;
  contains_human_face?: boolean;
  approved: boolean;
  qc_status: "pending" | "passed" | "failed" | "needs_repair" | string;
  created_at: string;
};
```

Redaction targets: `local_path`, `file_id`, and temporary `image_url` must not be exposed directly to browsers unless redacted, signed through the approved asset service, or transformed into a tenant-scoped `mediaAssetId`. The per-asset `qc_status` enum and `contains_human_face` flag must round-trip for parity with the upstream guide.

### Memory Event Kinds (spec §7.6)

Memory writes are append-only events plus a refreshed compacted summary. The full event-kind enum must be represented verbatim, including `retcon_proposal`:

```ts
type VerticalDramaMemoryKind =
  | "canonical_fact"
  | "episode_summary"
  | "character_delta"
  | "relationship_delta"
  | "hook_opened"
  | "hook_resolved"
  | "product_tie_in_usage"
  | "continuity_warning"
  | "retcon_proposal";
```

Retcons are explicit proposals requiring user approval. Approved retcons create **new** memory events; they never mutate older events in place. When a new episode contradicts canonical memory, the pipeline stops at a repair checkpoint instead of silently rewriting the past.

### Duration Profiles (spec §7.4)

Two profiles must be pinned as constants. The default is Veo-first `first_last_frame_bridge` (9 frames → 8 clips); the fallback is the OpenAI-compatible per-shot strategy (9 clips). `VerticalDramaEpisode.durationProfileId` references the default profile ID `vertical_drama_60s_9_frames_8_clips`.

Default (`durationProfileId` for generated episodes):

```ts
const VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT = {
  id: "vertical_drama_60s_9_frames_8_clips",
  totalSeconds: 60,
  frameCount: 9,
  clipCount: 8,
  clipDurationsSeconds: [8, 8, 8, 8, 8, 8, 8, 4],
  motionMode: "first_last_frame_bridge",
} as const;
```

Fallback for providers without first/last-frame support:

```ts
const VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK = {
  id: "vertical_drama_60s_9_shots",
  totalSeconds: 60,
  shotCount: 9,
  shotDurationsSeconds: [8, 8, 8, 4, 8, 8, 4, 8, 4],
  motionMode: "per_shot_first_frame_or_prompt",
} as const;
```

Validation rules (both profiles):

- Sum of durations must equal the target duration (60).
- Every clip/shot duration must be supported by the selected provider (`VerticalDramaProviderCapabilities.allowedVideoSeconds`).
- Every generated Storyboard Review task must carry stable timing metadata.
- Final clip trimming must be represented in `VerticalDramaAssemblyManifest.clips` (`trimStartSeconds` / `trimEndSeconds`), never applied silently.

### Sub-Shot Decomposition (Intra-Shot Cuts) (spec §7.4)

Each main shot may be decomposed into **sub-shots**: 2-5 short sub-clips whose durations SUM to the parent main-shot duration. This preserves the 60-second episode total and the 9-frame/9-shot storyboard; it only subdivides each main shot's screen time into ordered cuts. Sub-shots are **opt-in** via feature flag `verticalDramaSeriesSubShots` (default off) and **capability-gated**: the motion-prompt/provider-routing stage attempts the requested decomposition only when the resolved provider supports the resulting short clip durations and input mode, and degrades gracefully otherwise. Default behavior with the flag off is unchanged.

```ts
type VerticalDramaSubShotPolicy = {
  enabled: boolean;              // gated by verticalDramaSeriesSubShots; default false
  mode: "auto" | "fixed";        // "auto" tries targetPerShot as feasible; "fixed" forces it
  targetPerShot: number;         // default 2-3 (auto aims here)
  maxPerShot: number;            // hard cap 5 (option to raise from 2-3 up to 4-5)
  minSubShotSeconds: number;     // default 1.2 — provider-feasibility + anti-choppy floor
  perSubShotStartFrames: boolean; // default false: sub-shots reframe the parent start frame; true: own start frames
  fallbackOnUnsupported: "fewer_sub_shots" | "single_clip"; // graceful degrade
};

type VerticalDramaSubShot = {
  subShotNumber: number;         // 1-based order within the parent shot
  parentShotNumber: number;      // one of the 9 storyboard shots
  durationSeconds: number;       // sub-shot durations sum to the parent main-shot duration
  cameraSetup: string;           // angle / framing / lens feel / movement for this cut
  prompt: string;                // motion prompt for this sub-shot
  negativeMotionPrompt?: string;
  transitionIn: "cut" | "match_cut" | "smash_cut" | "continuous"; // how it follows the prior sub-shot
  startFrameAssetId?: string;    // optional own start frame; else derived from the parent shot frame
  endFrameAssetId?: string;      // optional (bridged sub-shots)
  providerClipRequestId?: string;// set when the sub-shot is its own provider clip
  status: "planned" | "ready" | "rendering" | "failed" | "skipped";
};
```

Contract requirements:

- The duration-profile contract may carry an optional `subShotPolicy` (`VerticalDramaSubShotPolicy`); when absent or `enabled: false`, generation proceeds with one clip per main shot as today.
- A video clip request may carry `parentShotNumber` / `subShotNumber` when it is a sub-shot, so each short sub-clip is its own `video_clip_requests` entry while `source_shot_numbers` still maps back to the 9 storyboard shots. Sub-shots reuse the parent shot's approved start frame (reframed via `cameraSetup`) unless `perSubShotStartFrames: true` opts into distinct per-sub-shot start frames.

Validation rules (sub-shots):

- For a main shot of duration `D` decomposed into `N` sub-shots, the sub-shot durations for that parent shot must sum to `D` (the parent main-shot duration).
- Every sub-shot duration must be `>= minSubShotSeconds`.
- The sub-shot count per parent shot must be `<= maxPerShot`; in `auto` mode `N = min(targetPerShot, floor(D / minSubShotSeconds))` so short main shots receive fewer sub-shots.
- The episode total stays 60 seconds and the storyboard stays 9 shots/frames — sub-shots never change the shot count or episode duration.
- If the provider cannot support the durations/count, degrade per `fallbackOnUnsupported` (reduce `N` toward feasible, or collapse to the single parent clip).

### Stage / Run / Routing Shared Contracts (spec §11.5)

The pipeline exposes GitHub-guide-equivalent shared types through tRPC responses so the Dashboard can resume, repair, and hand off safely. Add these to the Core Contracts set:

```ts
type VerticalDramaWarning = {
  code: string;
  severity: "info" | "warning" | "error" | "blocking";
  message: string;
  targetStage?: VerticalDramaPipelineStage;
  targetShotNumber?: number;
  targetClipNumber?: number;
  repairable: boolean;
};

type VerticalDramaProviderCapabilities = {
  supportsImageGeneration: boolean;
  supportsImageReferences: boolean;
  supportsVideoGeneration: boolean;
  supportsVideoInputReference: boolean;
  supportsFirstLastFrameVideo: boolean;
  supportsHumanFaceInputReference: boolean;
  supportsHumanLikenessCharacterAsset: boolean;
  supportsNativeAudio: boolean;
  supportsThaiNativeAudio: boolean;
  supportsSeparateTts: boolean;
  supportsDialogueTts: boolean;
  supportsSubtitleBurnIn: boolean;
  allowedVideoSeconds: number[];
  allowedVideoSizes: Array<"720x1280" | "1024x1792" | "1080x1920" | string>;
  allowedAspectRatios: Array<"9:16" | "16:9" | "1:1">;
};

type NormalizedEpisodeInput = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  locale: "th" | "en";
  targetDurationSeconds: 60;
  aspectRatio: "9:16";
  storyBrief: string;
  memoryBundle: VerticalDramaSeriesMemory;
  characters: VerticalDramaCharacter[];
  tieIn?: VerticalDramaProductTieInConfig;
  ageControl?: VerticalDramaMinimalInput["ageControl"];
};

type RunResult = {
  runId: string;
  seriesId: string;
  episodeId: string;
  stage: VerticalDramaPipelineStage;
  status: "queued" | "running" | "approval_required" | "succeeded" | "failed" | "cancelled";
  next_action:
    | "approve"
    | "repair"
    | "resume_next_stage"
    | "open_storyboard_review"
    | "wait_for_provider"
    | "none";
  artifactIds: string[]; // ARRAY — a stage may emit multiple artifacts
  errors: Array<{
    code: string;
    message: string;
    targetArtifactId?: string;
    repairable: boolean;
  }>;
  warnings: VerticalDramaWarning[];
  qc?: VerticalDramaQcResult;
};

type VideoRoutingDecision = {
  provider: string;
  provider_caps: VerticalDramaProviderCapabilities;
  recommended_provider_path:
    | "veo_first_last_frame"
    | "external_image_to_video"
    | "openai_prompt_only"
    | "manual_review";
  execution_status:
    | "ready"
    | "blocked"
    | "fallback_text_to_video"
    | "manual_review_required"
    | "external_provider_required";
  normalizedStatus:
    | "ready"
    | "blocked"
    | "fallback_prompt_only"
    | "manual_review_required"
    | "external_provider_required";
  blockingReasons: string[];
  // provider_request holds the raw upstream snake_case payload AND the normalized app status together
  provider_request: VerticalDramaProviderRequestSnapshot;
};
```

Contract requirements:

- Every stage run returns `RunResult`, even when the stage only creates a repair request. `artifactIds` is an **array** and `errors[]` carries stable `code`, `targetArtifactId`, and `repairable` per entry; the optional `qc` field carries the stage's `VerticalDramaQcResult`.
- `next_action` drives the primary Dashboard CTA and may not be inferred from free-form text.
- `VideoRoutingDecision.provider_request` stores raw upstream snake_case payloads and normalized app status together, and `blockingReasons` explains any non-`ready` `recommended_provider_path`.
- Failed schema validation must set `status = "failed"` and `next_action = "repair"` with a stable error code.

## Artifact Ledger

Required artifacts:

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

## UI/UX Contract

### Target User / JTBD

- Role: creator/operator and support/debug user.
- Goal: see durable status, artifact lineage, and safe error reasons without secret leakage.
- Entry point: Dashboard series/episode workspace and debug panels.
- Success outcome: data contracts can power UI states and repair actions.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Episode workspace | section 03 pages | reads series/episode/run state |
| Artifact/debug panels | section 09 UI integration | reads artifact summaries |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Shared contracts | `apps/web/shared/verticalDramaSeries/*` | data shapes | UI and services |
| Drizzle schema | `apps/web/drizzle/schema.ts` | persistence | server services |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | derived by pages from query state | section 03 evidence |
| empty | no series/episode/artifact rows shows create/repair CTA | service/UI tests |
| error | validation/ownership error has safe reason code | unit tests |
| success | state can render summaries | section 03/09 tests |
| disabled/focus/hover | N/A direct backend contract work | N/A |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | N/A direct contract UI | section 03/09 evidence |
| tablet 768x1024 | N/A direct contract UI | section 03/09 evidence |
| desktop 1440x900 | N/A direct contract UI | section 03/09 evidence |

### Accessibility Acceptance

- User-facing reason codes must be mappable to localized, text-visible messages.
- Artifact labels must not rely on color only.

### Copy Contract

- Shared reason codes should be stable and localizable.
- Secret redaction messages should say provider details are hidden for security.

### Browser Evidence Required

Indirect. Covered by Dashboard and artifact/debug panels in sections 03 and 09.

## Tests First

- Test: schema exports all required table definitions and inferred types.
- Test: memory event and QC report tables exist separately from compact memory snapshots and run artifacts.
- Test: every table has tenant/user ownership or a parent row that enforces it.
- Test: required indexes for series list, episode uniqueness, character lookup, memory retrieval, QC lookup, and artifact lookup are present.
- Test: minimal input normalizes locale, title, duration, story brief, characters, tie-in, and age control into `input.normalized.json`.
- Test: approval checkpoint repair creates a new artifact/version and supersedes the prior candidate without overwriting it.
- Test: artifact stage enum covers all required artifact names.
- Test: artifact hash remains stable for identical JSON payloads.
- Test: media asset references validate tenant ownership before attachment.
- Test: unknown upstream guide fields round-trip in JSONB payloads.
- Test: secret/signed URL redaction helper removes API keys, bearer tokens, and signed query params.
- Test: migration can create tables and indexes without dropping existing Storyboard Review data.
- Test: default duration profile constant has `id === "vertical_drama_60s_9_frames_8_clips"`, `clipDurationsSeconds` of `[8,8,8,8,8,8,8,4]`, and is the value used for `VerticalDramaEpisode.durationProfileId`.
- Test: fallback duration profile constant has `id === "vertical_drama_60s_9_shots"`, `shotDurationsSeconds` of `[8,8,8,4,8,8,4,8,4]`, and `motionMode === "per_shot_first_frame_or_prompt"`.
- Test: both duration profiles validate — sum of durations equals target (60), and validation rejects any clip duration not in the provider's `allowedVideoSeconds`.
- Test: final clip trimming is recorded in `AssemblyManifest.clips` via `trimStartSeconds`/`trimEndSeconds` rather than applied silently.
- Test: `VerticalDramaSubShot` and `VerticalDramaSubShotPolicy` shapes round-trip through JSONB, including `transitionIn`, `status`, `parentShotNumber`/`subShotNumber`, and the optional `subShotPolicy` carried on the duration profile.
- Test: sub-shot durations per parent shot sum to that main shot's duration and the episode total stays 60 seconds, and sub-shots never change the 9-shot/9-frame count.
- Test: sub-shot count is capped at `maxPerShot` and every sub-shot duration is `>= minSubShotSeconds`, with `auto` mode yielding `N = min(targetPerShot, floor(D / minSubShotSeconds))`.
- Test: `VerticalDramaMemoryKind` enumerates all 9 kinds including `retcon_proposal`, and approved retcons append new events without mutating prior events.
- Test: `VerticalDramaMemoryRetrievalPolicy` defaults resolve to `includeLastEpisodeCount === 3`, `includeResolvedHookLookbackCount === 10`, and `compactionStrategy === "rolling_summary_plus_events"`.
- Test: `VerticalDramaSeriesPolicy.generationMode` restricts to `dry_run | approval_required | auto_after_approval` and gates auto-execution accordingly.
- Test: `VerticalDramaSeriesBible` round-trips `logline`, `seasonArc`, `cameraGrammar`, `relationshipMap`, `recurringProps`, and `continuityRules` through JSONB.
- Test: upstream minimal input is stored losslessly and the original brief is preserved separately from inferred fields in `input.normalized.json`.
- Test: upstream `target_age_group` accepts `preschool`, `tweens`, and `young_adults` and maps into the app `children | teens | adults` set.
- Test: `VerticalDramaAssetRecordSnapshot` exposes `contains_human_face` and per-asset `qc_status`, and the redaction helper strips `local_path`, `file_id`, and temporary `image_url`.
- Test: `RunResult.artifactIds` is an array, `errors[]` entries carry stable `code`/`targetArtifactId`/`repairable`, and failed schema validation yields `status === "failed"` with `next_action === "repair"`.
- Test: `VideoRoutingDecision` carries `recommended_provider_path`, non-empty `blockingReasons` when not `ready`, and a `provider_request` holding raw snake_case plus normalized status together.

## Implementation Tasks

1. Add shared TypeScript contracts and validators.
2. Add Drizzle tables and migration.
3. Add required indexes and uniqueness constraints.
4. Add minimal input, checkpoint, memory event, QC, provider job, and artifact contracts.
5. Add artifact stage constants and stable hash helper.
6. Add media ownership validation helper.
7. Add redaction helper for provider payloads and debug snapshots.
8. Add table/index tests or schema unit tests following repo conventions.
9. Export contracts through `apps/web/shared/verticalDramaSeries/index.ts`.

## Acceptance

- Durable series/episode state no longer depends only on Storyboard Review metadata.
- Append-only memory events and compact memory snapshots are both represented.
- QC reports are searchable by run/stage and not hidden only inside opaque artifacts.
- Generated/imported media uses existing `mediaAssets`.
- Run artifacts are stable, inspectable, and tenant-safe.
- Secret and signed URL fields cannot leak into artifacts or browser-visible JSON.

## Verification

```bash
cd apps/web && pnpm test -- verticalDrama
cd apps/web && pnpm check
```
