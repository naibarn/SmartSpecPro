<!-- SECTION_META
id: section-09-full-video
source: claude-plan.md WS-9, claude-plan-tdd.md WS-9
spec: spec.md v1.3.0 §14 (all), §12.2/§12.4 (duration + audio), §15 (no truncation), §23.1 items 5/6/8/9, §23.2 (duration-fitted + trim warnings), §26 Phase 4
depends_on: section-06-sequential-pipeline, section-07-evidence-guard-shared
also_consumes: section-01 (enum + flags + plan blocker precedent), section-02 (angle entries, model-cap helper), section-03 (global-block template), section-04 (pack preflight ids, marker constant, price detector, optimizer prompt_kind), section-08 (shotOverrides.video_prompt)
blocks: nothing
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_SECTION_META -->

# Section 09 — Full-Video Per-Shot (start-frame reference, global-block preflight, per-shot durations)

- **Section id:** `section-09-full-video`
- **Feature:** 136 — Marketplace Auto Review: Sequential Shot Storyboard
- **Milestone:** M4 — Full-video (spec §26 Phase 4). Parallelizable with section-11 and section-12.
- **Depends on:** `section-06-sequential-pipeline` (9 approved frames land in `metadata.storyboardFrameUrls[]`), `section-07-evidence-guard-shared` (guardian policy state that decides whether a guardian portrait is attached)
- **Blocks:** nothing
- **Test command:** `npm --prefix apps/web run test -- <files>` (Vitest resolves inside `apps/web`; never `pnpm` — blocked by the `packageManager` field)

---

## 1. Objective

Make `outputMode: "full_video"` work for `frameStrategy === "sequential_shot_storyboard"`. Nine per-shot video jobs are submitted from the skill-authored pack, each anchored on its own approved start frame:

1. **Prompt source** — each video prompt comes from `metadataJson.sequentialStoryboard.shots[n-1].video_prompt` (skill-authored, self-contained, mandatory global block already inside), with `shotOverrides[n].video_prompt` precedence. The deterministic `buildVideoPrompt` composer and the `product-video-motion-prompt` skill are **not** used in this mode.
2. **Preflight before any provider call and before any credit reservation** — global-block marker present, ≤ 2,000 chars (provider-clamped), price backstop, duration in range. Over budget ⇒ one bounded optimizer rewrite (`prompt_kind: "sequential_video"`), never `slice()`.
3. **Attachment** — the shot's approved frame is `referenceImageUrls[0]`; remaining budget `maxReferenceImages − 1` is filled guardian portrait (when depicted) → primary product → product angles, trimmed from the END. Single-reference models (e.g. `grok-imagine-video-1-5-preview`, `maxReferenceImages: 1`) get **only** the start frame.
4. **Reference-mode semantics** — always Feature 118's `single_storyboard_frame` for sequential: additional references are immutable product/identity references, never stop frames.
5. **Per-shot duration** — the skill-assigned `duration_seconds` (3–10) is passed where the model supports it; otherwise fitted to the model's supported set with a §23.2 warning. The fitted value is used for credit reservation *and* submission (they must never diverge).
6. **Start-frame-support gating** — a video model without start-frame support is a plan blocker and a hard `PRECONDITION_FAILED` at start for sequential full-video runs.
7. **Audio strategies, `video_edit`, `render`, `library_finalize` stages: untouched.**

Everything forks on an explicit `run.frameStrategy === "sequential_shot_storyboard"` equality check. The 3x3 and `video_shot_start_stop` video paths must stay byte-identical; the WS-1 snapshot suite is the standing tripwire.

---

## 2. Background — verified anchors

All service work is in `apps/web/server/services/marketplaceAutoReviewService.ts` ("SVC", ~27k lines). Line numbers verified 2026-07-21; this file is edited by concurrent sessions — **locate by symbol name, treat lines as hints**.

| Symbol / location | Observed line | Role in this section |
|---|---|---|
| `scheduleVideoAttempt(params)` | SVC:22249 | The one function that submits video jobs. Order today: governance/paid-authority asserts → user token → plan → active-ref short-circuit → units → audio strategy → `videoModel` → `referenceMode` → voice lock → per-unit loop |
| `buildInitialVideoUnits(plan)` | SVC:8518 | One `DirectVideoUnit` per shot (`${shot.id}-video`, role `video_clip`). **No change needed** — sequential inherits 9 per-shot units |
| `referenceImagesForVideoUnit(plan, metadata, unit)` | SVC:9991, single call site SVC:22342 | `[frameRefs, ...approvedVisualReferenceUrls(metadata, plan, 4)].slice(0, 5)` — hardcoded caps, no model awareness. Sequential needs its own resolver |
| `referenceMode` derivation inside `scheduleVideoAttempt` | SVC:22318-22321 | `metadata.startFrameUrls?.length ? "start_stop" : "single_storyboard_frame"` — must gain an explicit sequential guard |
| `buildVideoPrompt` / `buildCompactMarketplaceAutoReviewVideoPrompt` | SVC:15590 / :15490 | Deterministic composer for 3x3 + start/stop. **Not** used by sequential |
| `resolveMarketplaceAutoReviewVideoUnitPrompt(input)` | SVC:22192 | Motion-direction skill wrapper (`deterministic` / `skill` / `deterministic_fallback`). Sequential passes `runSkill: null` and a new source tag |
| `buildMarketplaceAutoReviewSubmittedVideoPrompt(input)` | SVC:22145 | Appends `Targeted repair:`, the motion-direction line, and the voice-consistency lock. Sequential reuses it **without** `motionDirection` |
| `runProductVideoMotionPromptSkill(...)` call | SVC:22369-22405 | Gated on `motionDirectionText`; sequential must never reach it (it returns a prompt with no global block) |
| `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000` | SVC:15198 | The video budget (identical to `VD_VIDEO_PROMPT_MAX`) |
| `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` | SVC:1535-1580 | Exact template to clone for the video variant (gate at `:1549`, audit reason string in the returned `audit` object) |
| `optimizeProductReferenceStoryboardPrompt` | `productReferenceStoryboardSkillRunner.ts:1755` | Optimizer entry point; section-04 extends it with `prompt_kind` |
| `MarketplaceAutoReviewPromptPreflightResult` | SVC:984-991 | `{status, score, ruleSet, blockers, warnings, checkedAt}` — reuse verbatim for the video preflight result |
| `MarketplaceAutoReviewImagePromptPreflightError` | SVC:993-1020 | Typed pre-spend throw; clone shape for video |
| `DirectMediaTaskRef.promptPreflight` | SVC:966 | Already exists on video refs — persist the video preflight here |
| `reserveMarketplaceMediaCredits({selections:{duration,…}})` | SVC:22424-22448 | Reserve happens with `duration: shot.durationSeconds` — pricing is duration-sensitive (veo matrix), so the fitted duration must be used here too |
| `mediaGenerationService.generateVideoAsync(payload)` | SVC:22479-22511 | `{prompt, model, duration, aspectRatio "9:16", resolution "1080p", referenceImageUrls, publicUrl, transportMetadata, extraParams, auditContext}` |
| `resolveMarketplaceAutoReviewAudioStrategy` | SVC:6659-6672 | Untouched. `native_video_audio` ⇒ dialogue is inside the prompt; `separate_tts_voiceover` ⇒ visual-only prompt + `generateAudioAsync` |
| `marketplaceVideoSegmentReferenceMode` | SVC:21433-21444 | Already returns `single_storyboard_frame` for every non-`video_shot_start_stop` strategy — **no edit needed**, but test-pin it |
| `approvedProductReferenceUrls(metadata, plan, 1)` | SVC:5165-5243 | Primary product anchor with all integrity checks. Reused as-is (never relaxed) |
| `approvedPackReferenceUrls(pack, max)` + `characterIdentityAllowsVisualGeneration` | SVC:5287 / used at :5313 | Guardian/presenter portrait source |
| `resolveProductReferenceStoryboardReferenceImageUrl(url, publicUrl)` | SVC:5389 | URL normalization; returns `""` when unresolvable |
| `MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS`, `nextDirectAttempt` | SVC:658, :7735 | Per-unit video repair budget — unchanged |
| `resolveVerticalDramaCapabilities(modelId, model)` | `server/services/modelRegistry.ts:1304` | Returns `{supportsStartFrame, maxReferenceImages, …}` |
| `getModelById(id)` (sync) | `modelRegistry.ts:1654` | Registry lookup; falls back to the static catalog. SVC currently imports only `getStaticModelById` (SVC:72) |
| `ModelDefinition.durations` | `modelRegistry.ts:47-48` | Supported durations. `veo3/generate-veo-3-video-lite` (the default) = `[8]`, `maxReferenceImages: 3`; `grok-imagine-video-1-5-preview` = `[6,10,15]`, `maxReferenceImages: 1`; `kling-2.6` / `sora-2` = `supportsStartFrame: false` |
| `buildHyperframesAutoPlanFromState` | `hyperframesAutoPlanService.ts:291-353` | Sync, DB-free plan builder; `buildBlocker(code, severity)` at `:126-139`; section-01 added `sequentialStoryboardEnabled?: boolean` here with the same "inject the fact, keep it sync" pattern |
| `hyperframesBlockerCodes` / `HYPERFRAMES_BLOCKER_COPY` | `shared/hyperframes/contracts.ts:75-94` / `shared/hyperframes/statusCopy.ts:151-251` | Adding a code requires adding copy in the same commit (`Record<HyperframesBlockerCode, …>` is compile-forced) |
| `canStart = access.capabilities.canStartAuto && blockers.length === 0` | `shared/hyperframes/autoPlan.ts:466-467` | Any `blockers[]` entry kills `canStart` — that is the desired effect here (unlike section-01's warning-only case) |
| `startMarketplaceAutoReviewRun` | SVC:17549, strategy resolved at :17583 | Where section-01's FORBIDDEN flag gate lives; the new capability gate sits immediately beside it |
| `startAutoStoryboardReviewForApi` | `hyperframesRuntimeApiService.ts:1309-1400` | Second start entry point (defense in depth, section-01 precedent) |

Data read by this section (written by earlier sections):

- `metadata.sequentialStoryboard.shots[i]` — `shot_id`, `duration_seconds`, `video_prompt`, `dialogue`, `depicts_minor`, `guardian_required`, `demonstration_type` (spec §19.2).
- `metadata.sequentialStoryboard.shotOverrides["<shotId>"].video_prompt` — section-08's editor output; must take precedence here from day one.
- `metadata.sequentialStoryboard.referenceManifest` — section-02's `storedManifest` (`{index, role, angleLabel?, url, evidenceOnly?}`).
- `metadata.sequentialStoryboard.childSubjectPolicy` — decides guardian attachment (section-05 computes, section-07 enforces).
- `metadata.storyboardFrameUrls[i]` — the 9 approved sequential frames (section-06 §5.6).
- `metadata.evidenceGuard.enabled` — section-07's per-run flag snapshot.

---

## 3. Scope boundaries

**In scope:** the seven items in §1 — all inside `scheduleVideoAttempt` and new SVC helpers, plus a plan-surface blocker (3 shared files) and two start-entry-point guards.

**Out of scope (owned elsewhere — reference only, do not re-implement):**

- The pack itself, its 3-round loop, `validateSequentialStoryboardPackPreflight`, the global-block marker constant, the price-claim detector, and the optimizer `prompt_kind` extension — **section-04**. This section imports those primitives; if a needed export is missing, add it in section-04's module, not here.
- Multi-angle resolution, dedupe, capacity semantics, `getSequentialReferenceImageModelCap` — **section-02**. Note section-02 §7 explicitly reserves a **different fill order** for this section (frame → guardian → primary → angles); do not generalize section-02's image order.
- Guardian directive text, QA fields, publish-block set, `childSubjectPolicy` computation — **sections 05/07**.
- `shotOverrides` writing + edit preflight — **section-08** (this section only *reads* `video_prompt` overrides).
- Named audit-event schemas and the metrics recorder — **section-12**. This section emits warnings into `promptPreflight.warnings` and structured `console.warn` lines only.
- Any UI — **section-11**.
- Video-clip vision QA / video repair heuristics: no new behavior. Existing per-unit repair machinery is reused unchanged.
- `videoStructureMode` grouping (`adaptive_multi_shot` / `compact_multi_shot` / `manual_group_size`): sequential full-video is **per-shot only** in v1. `scheduleVideoAttempt` already builds one unit per shot regardless of that field (it shapes the Storyboard Review segment plan, not the direct-media units). Do not add grouping.

---

## 4. Tests first (write these before touching any source file)

New file: `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialFullVideo.test.ts`
New file: `apps/web/server/services/__tests__/hyperframesAutoPlan.sequentialVideoModel.test.ts`

Conventions: Vitest; exercise exported `…ForTest` helpers (SVC convention, cluster near SVC:9878-10830 and :23663); no DB. Deep submit paths are tested either through a new narrow `…ForTest` extraction (preferred) or by `vi.mock`-ing `mediaGenerationService.generateVideoAsync` and `reserveMarketplaceMediaCredits` and asserting call ordering/absence.

Shared fixtures (module-local stubs — implementer fills bodies):

```ts
/** AutoReviewPlan with 9 shots (order 1..9, durationSeconds 5, stable ids). */
function buildSequentialPlanFixture(): AutoReviewPlan;

/** RunMetadata for a sequential full-video run: sequentialStoryboard pack with 9
 *  distinct video_prompt values (each opening with the global-block marker),
 *  duration_seconds per shot, storyboardFrameUrls[0..8] filled, referenceManifest
 *  = primary + 3 angles (one evidenceOnly parts_diagram), characterIdentityAssetPack
 *  approved, startFrameUrls absent, videoModel overridable. */
function buildSequentialVideoMetadataFixture(overrides?: Partial<RunMetadata>): RunMetadata;

/** DirectVideoUnit for shot n (`${shot.id}-video`), optional repair fields. */
function buildSequentialVideoUnitFixture(shotOrder: number, overrides?: Partial<DirectVideoUnit>): DirectVideoUnit;
```

### T1 — start-frame support gating

`hyperframesAutoPlan.sequentialVideoModel.test.ts` (pure, sync builder — no DB, fixed `now`, permissive `access`, mirroring section-01 §4.4):

- `buildHyperframesAutoPlanFromState` with `outputMode: "full_video"` + `frameStrategy: "sequential_shot_storyboard"` + `videoModelSupportsStartFrame: false` ⇒ `plan.blockers` contains `sequential_video_model_no_start_frame` (severity `blocking`) and `plan.canStart === false`.
- Same input with `videoModelSupportsStartFrame: true` ⇒ no such blocker; `canStart` unchanged.
- `videoModelSupportsStartFrame` omitted (legacy callers) ⇒ output deep-equals the call without the field (dark/back-compat).
- Non-sequential strategies, and sequential with `outputMode: "storyboard_images"`, never produce the blocker even when `videoModelSupportsStartFrame: false`.
- `HyperframesBlockerCodeSchema.parse("sequential_video_model_no_start_frame")` succeeds and `getHyperframesBlockerCopy(code, "th").description` is non-empty Thai (`/[\u0E00-\u0E7F]/`).

`marketplaceAutoReview.sequentialFullVideo.test.ts`:

- `marketplaceAutoReviewVideoModelSupportsStartFrameForTest("veo3/generate-veo-3-video-lite")` ⇒ `true`; `("grok-imagine-video-1-5-preview")` ⇒ `true`; `("sora-2")` and `("kling-2.6")` ⇒ `false`; unknown model id ⇒ `true` (fail-open on unknown metadata — do NOT block a run on missing catalog data; assert this explicitly so the intent is pinned).
- `assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest({outputMode, frameStrategy, videoModel})`: sequential + `full_video` + unsupported ⇒ throws `TRPCError` `PRECONDITION_FAILED` with the Thai message; supported ⇒ no throw; `storyboard_images` ⇒ no throw; 3x3/start_stop + unsupported ⇒ no throw.
- Wiring grep-guard (DB-free, section-01 §4.4 precedent): read `marketplaceAutoReviewService.ts` and `hyperframesRuntimeApiService.ts` from disk; assert each calls the gate helper.

### T2 — video prompt source and precedence

- Sequential unit N resolves to exactly `sequentialStoryboard.shots[N-1].video_prompt` (no deterministic composition, no re-wrapping).
- `shotOverrides["4"].video_prompt` set ⇒ unit 4 uses the override; units 3 and 5 unaffected.
- Missing prompt (empty pack entry, no override) ⇒ throws, message names the unit id (fail loud; run stays resumable).
- `motionDirection` present on metadata ⇒ the submitted prompt does **not** contain the `User motion direction (MANDATORY…` line (the skill already dual-injected it) and `runProductVideoMotionPromptSkill` is NOT invoked (spy count 0).
- `repairInstruction` on the unit ⇒ `Targeted repair:` tail appended exactly once (idempotent).
- `resolvedAudioStrategy === "native_video_audio"` ⇒ the voice-consistency lock line is appended; `separate_tts_voiceover` ⇒ it is not (existing behavior preserved).
- The ref's `skillRuntime.videoPromptSource === "sequential_skill_pack"`.

### T3 — video prompt preflight (pre-spend)

Via `validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest`:

- Clean fixture ⇒ `status: "passed"`, zero blockers.
- Prompt without the global-block marker ⇒ blocker `video_global_block_missing`.
- Prompt of 2,001 chars ⇒ blocker `prompt_too_long_for_video_provider`; a model whose `configJson.maxPromptLength` is smaller than 2,000 becomes the binding limit (include that case).
- Prompt containing a Thai price token (`ราคาถูกที่สุด`) and one containing `฿199` ⇒ blocker `price_claim_detected` (detector imported from section-04 — assert the SAME helper, not a re-implementation).
- Empty/whitespace prompt ⇒ `prompt_empty`.
- `duration_seconds` of 11 (and of 2) ⇒ blocker `shot_duration_exceeds_max`.

Submit-path behavior:

- A failing preflight throws `MarketplaceAutoReviewVideoPromptPreflightError` **before** `reserveMarketplaceMediaCredits` and before `generateVideoAsync` (both spies at call count 0), and the error carries `{unit, preflight}`.
- Over-budget prompt ⇒ the optimizer effect is invoked exactly once with `prompt_kind: "sequential_video"` and `maxOutputChars: 2000`; when the rewrite fits, submission proceeds with the rewritten prompt and the ref records `audit.reason === "final_video_prompt_over_provider_budget"`; when it still does not fit ⇒ throws (no second rewrite, no submission).
- **Grep-guard:** read `marketplaceAutoReviewService.ts` from disk and assert no `.slice(` or `compactImagePromptText(` call site targets the sequential video prompt variable (pattern-based; pin allowed pre-existing exceptions explicitly).

### T4 — reference attachment

Via `resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest`:

- Default model (cap 3): `referenceImageUrls[0]` is `storyboardFrameUrls[shotOrder-1]`; the remaining 2 slots are guardian portrait then primary product (guardian-required fixture); angles are trimmed into `trimmed[]` in original order.
- Guardian NOT required (no `depicts_minor`, `childSubjectPolicy` inactive) ⇒ fill order is primary product → angles; the character portrait is not attached.
- Cap 1 (`grok-imagine-video-1-5-preview`) ⇒ `referenceImageUrls.length === 1` and equals the start frame; `trimmed[]` lists everything else. Nothing else is attached under any fixture.
- Cap 9 (`happyhorse/reference-to-video`) ⇒ frame + guardian + primary + all non-evidence-only angles, in that order, no trim.
- `package` / `parts_diagram` (evidenceOnly) entries never appear in `referenceImageUrls` under any cap.
- Duplicate URLs (an angle equal to the primary) are deduped; the earlier (higher-priority) position wins.
- An angle whose URL cannot be resolved (relative path, no `publicUrl`) is dropped and the job continues; a MISSING start frame ⇒ throws (`sequential_start_frame_missing` in the message) with no provider call.
- Cap < 1 ⇒ throws `TRPCError` `PRECONDITION_FAILED` (defensive; normally unreachable because of T1's gate).
- Submitted `extraParams` carry `__reference_mode: "single_storyboard_frame"` and a `referenceImageManifest` whose entry 1 is the shot start frame.
- `marketplaceVideoSegmentReferenceMode({frameStrategy: "sequential_shot_storyboard", hasGeneratedStartStopFrameChain: true})` still returns `"single_storyboard_frame"` (pin), and the `scheduleVideoAttempt` local `referenceMode` is `"single_storyboard_frame"` for sequential even if `metadata.startFrameUrls` is non-empty.

### T5 — per-shot duration

Via `resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest`:

- Model with no declared duration set ⇒ requested `7` passes through, `fitted: false`.
- `veo3/generate-veo-3-video-lite` (`durations: [8]`) ⇒ requested `5` becomes `8`, `fitted: true`.
- `grok-imagine-video-1-5-preview` (`durations: [6,10,15]`) ⇒ requested `4` becomes `6`; requested `10` stays `10`, `fitted: false`.
- Requested value absent ⇒ falls back to `plan.shots[i].durationSeconds`.
- Submit parity: the SAME resolved number reaches `reserveMarketplaceMediaCredits({selections:{duration}})`, the reservation description string, `generateVideoAsync({duration})`, and the persisted ref metadata (assert all four from one submission).
- When `fitted` is true the ref's `promptPreflight.warnings` contains `sequential_video_duration_fitted_to_model`.

### T6 — audio strategies unchanged

- `resolveMarketplaceAutoReviewAudioStrategy` outputs for sequential fixtures are identical to today's for the same `{outputMode, requested, videoModel}` triples (re-assert the existing table).
- Native-audio fixture: the submitted sequential prompt still contains the pack's Thai dialogue (the skill embedded it) and `__resolved_audio_strategy: "native_video_audio"` is in `extraParams`.
- `separate_tts_voiceover` fixture: the pack's visual-only prompt is submitted unchanged (no dialogue injected by TS) and the `generateAudioAsync` path is untouched.
- Regression pin: `apps/web/shared/storyboardPromptAudio.test.ts` and the audio-strategy blocks in `server/services/__tests__/marketplaceAutoReviewService.test.ts` (≈:2760-3250) stay green with **zero edits**.

### T7 — repair, resume, and non-sequential isolation

- `nextDirectAttempt` counts per video `unitId`; a failure on `shot-05-video` does not raise `shot-06-video`'s attempt number; exceeding `MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1` still throws (unchanged).
- Restart resume: units 1–4 completed, 5–9 absent ⇒ only 5–9 are submitted.
- **Isolation:** for `storyboard_3x3_split` and `video_shot_start_stop` fixtures, `referenceImagesForVideoUnit` output, the composed prompt, and the `generateVideoAsync` payload are byte-identical to the pre-change behavior (snapshot or deep-equal against a committed fixture). The WS-1 snapshot suite must stay green with no baseline regeneration.

---

## 5. Implementation guidance

Every fork is an explicit `frameStrategy === "sequential_shot_storyboard"` equality check; never invert an existing condition.

### 5.1 Start-frame capability predicate (SVC)

```ts
/** True when the model can accept a start frame. Fail-OPEN on unknown models:
 *  missing catalog metadata must not block a run (the submit path would still
 *  attach the frame). Uses getModelById + resolveVerticalDramaCapabilities so the
 *  answer matches what the media service will actually do. */
function marketplaceAutoReviewVideoModelSupportsStartFrame(modelId: string): boolean;

/** Throws TRPCError PRECONDITION_FAILED only for
 *  outputMode "full_video" + frameStrategy "sequential_shot_storyboard" +
 *  unsupported model. No-op otherwise. */
function assertMarketplaceAutoReviewSequentialVideoModelSupported(input: {
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy | string | null | undefined;
  videoModel: string | null | undefined;
}): void;
```

Add `…ForTest` wrappers for both. Add the `getModelById` + `resolveVerticalDramaCapabilities` imports beside the existing `getStaticModelById` import (SVC:72).

Thai message (used verbatim in both the throw and the blocker copy):
`"โมเดลวิดีโอที่เลือกไม่รองรับภาพเริ่มต้น (start frame) จึงใช้กับโหมดวิดีโอเต็มแบบ 9 ภาพต่อเนื่องไม่ได้ กรุณาเลือกโมเดลวิดีโออื่น"`.

Wiring (both, defense in depth — section-01 §5.7 precedent):

1. `startMarketplaceAutoReviewRun` — immediately after `resolveFrameStrategy` (SVC:17583) and the section-01 FORBIDDEN flag gate, before anchors/persistence/credits.
2. `startAutoStoryboardReviewForApi` (`hyperframesRuntimeApiService.ts`, before the `startMarketplaceAutoReviewRun` call at `:1377`) using `plan.defaults.{outputMode, frameStrategy, videoModel}`.

### 5.2 Plan-surface blocker

- `apps/web/shared/hyperframes/contracts.ts:75-94` — append `"sequential_video_model_no_start_frame"` to `hyperframesBlockerCodes`.
- `apps/web/shared/hyperframes/statusCopy.ts:151-251` — add the forced `HYPERFRAMES_BLOCKER_COPY` entry: `copyId: "hyperframes.blocker.sequential_video_model_no_start_frame"`; label en `"Video model has no start-frame support"` / th `"โมเดลวิดีโอไม่รองรับภาพเริ่มต้น"`; description = the §5.1 Thai sentence (+ English twin); `nextAction` en `"Choose a start-frame capable video model"` / th `"เลือกโมเดลวิดีโอที่รองรับภาพเริ่มต้น"`. Keep `statusCopy.test.ts` / `assertHyperframesCopyCoverage` green.
- `hyperframesAutoPlanService.ts` — `buildHyperframesAutoPlanFromState` gains `videoModelSupportsStartFrame?: boolean` (keeps the builder **sync and DB-free**, same trick as section-01's `sequentialStoryboardEnabled`). Push `buildBlocker("sequential_video_model_no_start_frame", "blocking")` into `blockers` (NOT warnings — here we *do* want `canStart === false`, `autoPlan.ts:466-467`) only when the resolved defaults are `outputMode "full_video"` + `frameStrategy "sequential_shot_storyboard"` + `videoModelSupportsStartFrame === false`. `undefined` ⇒ never blocks.
- `getHyperframesAutoStoryboardReviewPlan` (the async wrapper, `:355-412`) resolves the flag with `marketplaceAutoReviewVideoModelSupportsStartFrame`-equivalent logic (import `getModelById` + `resolveVerticalDramaCapabilities` there, or export the SVC predicate — pick one and keep it single-sourced) and passes it in. Compute it only when the resolved strategy is sequential, so every other plan request is unchanged.

### 5.3 Sequential video prompt resolution (SVC)

```ts
/** shotOverrides[String(n)].video_prompt (trimmed, non-empty) else
 *  sequentialStoryboard.shots[n-1].video_prompt. Throws
 *  `Missing sequential video prompt for unit <unitId>` when neither exists. */
function resolveSequentialVideoUnitPromptText(
  metadata: RunMetadata,
  unit: DirectVideoUnit
): string;
```

Inside `scheduleVideoAttempt`, when sequential:

- Skip `buildVideoPrompt` entirely; `basePrompt = resolveSequentialVideoUnitPromptText(metadata, unit)`.
- Call `resolveMarketplaceAutoReviewVideoUnitPrompt({ basePrompt, repairInstruction: unit.repairInstruction, motionDirection: null, voiceConsistencyLock, runSkill: null })`. Passing `motionDirection: null` is load-bearing: the sequential skill already folded it into the prompt (spec §14.6, section-04 §5.2), and re-appending would duplicate the directive and consume the 2,000-char budget.
- Because `motionDirectionText` also gates the `absoluteVisionUrl` mapping at SVC:22352-22362, add the sequential check there too so that path is never entered (it throws without `publicUrl`).
- Extend `MarketplaceAutoReviewVideoPromptSource` (SVC:22168-22171) with `"sequential_skill_pack"` and set it on the sequential branch so `skillRuntime.videoPromptSource` is honest in the audit trail.

### 5.4 Video prompt preflight + optimizer (SVC)

```ts
/** Deterministic, pure. Reuses MarketplaceAutoReviewPromptPreflightResult
 *  (SVC:984). ruleSet e.g. "marketplace_auto_review_sequential_video_v1". */
function validateMarketplaceAutoReviewSequentialVideoPromptPreflight(input: {
  prompt: string;
  unit: DirectVideoUnit;
  shotDurationSeconds: number;
  videoModel: string;
}): MarketplaceAutoReviewPromptPreflightResult;
```

Blocker ids (all shared with section-04's pack preflight — **import the ids/predicates, do not re-declare strings**):

| Blocker id | Fires when |
|---|---|
| `prompt_empty` | prompt empty after `cleanText` |
| `video_global_block_missing` | the section-04 marker constant (`Use @Image1 as the absolute product identity reference`, exported from `productReviewSequentialStoryboardSkillRunner.ts`) is absent |
| `prompt_too_long_for_video_provider` | length > `min(MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS, providerMaxPromptLength ?? ∞)` |
| `price_claim_detected` | section-04's exported price detector matches |
| `shot_duration_exceeds_max` | resolved duration outside `[3, 10]` |

Warnings: `sequential_video_duration_fitted_to_model`, `sequential_video_reference_trimmed`.

Over-budget handling — clone `optimizeMarketplaceAutoReviewFinalImagePromptForProvider` (SVC:1535-1580):

```ts
async function optimizeMarketplaceAutoReviewFinalVideoPromptForProvider(input: {
  tenantId: string; userId: number; runId: string; unitId: string; attempt: number;
  sourcePrompt: string; maxOutputChars: number;
  optimizer?: typeof optimizeProductReferenceStoryboardPrompt;   // test seam
}): Promise<{ prompt: string; audit: Record<string, unknown> | null }>;
// gate: return early when sourcePrompt.length <= maxOutputChars
// call with prompt_kind: "sequential_video" (section-04's extension)
// audit.reason = "final_video_prompt_over_provider_budget"
```

Bounded to **one** rewrite. Re-run the preflight on the rewritten prompt; still failing ⇒ throw:

```ts
class MarketplaceAutoReviewVideoPromptPreflightError extends Error {
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
  unit: DirectVideoUnit;
}
```

Placement is contractual: this runs **after** prompt resolution and **before** `reserveMarketplaceMediaCredits` (SVC:22424). Persist the passing result on the submitted ref via the existing `promptPreflight` field (SVC:966). Never `slice()`; `compactImagePromptText` stays sub-block-only.

### 5.5 Reference attachment fork (SVC)

```ts
type SequentialVideoReferenceAttachment = {
  modelCap: number;
  startFrameUrl: string;
  referenceImageUrls: string[];   // [startFrame, ...priority fill], length <= modelCap
  manifest: Array<{ placeholder: string; role: "shot_start_frame" | "character" | "product"; url: string; instruction: string; angleLabel?: string }>;
  trimmed: Array<{ role: string; angleLabel?: string; url: string }>;
};

/** Sequential-only. Throws when the approved start frame is missing
 *  (`sequential_start_frame_missing`) or modelCap < 1 (PRECONDITION_FAILED). */
function resolveSequentialVideoReferenceAttachment(params: {
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  unit: DirectVideoUnit;
  videoModel: string;
  publicUrl?: string | null;
}): SequentialVideoReferenceAttachment;
```

Rules (spec §14.4, VD precedent `verticalDramaEpisodes.ts:11579-11665`):

1. `modelCap = getSequentialReferenceImageModelCap(videoModel)` — reuse section-02's helper unchanged (it is model-id generic: `getModelById` → `getReferenceImageLimitFromConfig` ?? 5). Reusing it guarantees the router's count matches what `resolveReferenceImageUrlsForModel` will actually keep — the documented VD "−1 budget" lesson.
2. `startFrameUrl = cleanText(metadata.storyboardFrameUrls?.[unit.shotOrder - 1])`; empty ⇒ throw. It is always index 0.
3. `extraBudget = Math.max(0, modelCap - 1)`. When `extraBudget === 0` (Grok, cap 1) return frame-only — an explicit early return with the VD-style explaining comment ("the single start frame carries 100% of identity; the prompt text compensates via the product identity summary").
4. Priority fill, each deduped against everything already accepted (by resolved URL):
   1. **Guardian/presenter portrait** — only when the shot depicts a minor / guardian is required (`shots[i].depicts_minor || shots[i].guardian_required`, or `childSubjectPolicy.childDepictionPlanned`) AND `characterIdentityAllowsVisualGeneration(metadata)`; source `approvedPackReferenceUrls(characterPack, 1)`.
   2. **Primary product** — `approvedProductReferenceUrls(metadata, plan, 1)` (untouched integrity checks).
   3. **Product angles** — non-`evidenceOnly` entries from `sequentialStoryboard.referenceManifest` in stored order, each normalized through `resolveProductReferenceStoryboardReferenceImageUrl(url, publicUrl)`; unresolvable entries are dropped (fail-open) and recorded.
5. Trim **from the END** into `trimmed[]` once `extraBudget` is exhausted.
6. Evidence-only (`package` / `parts_diagram`) references are never attached to a video job under any cap.
7. `manifest` mirrors the image path's shape so `extraParams.referenceImageManifest` / `referenceImageRoleOrder` / `referenceImageRoleCounts` remain derivable exactly as at SVC:18606-18615; entry 1's instruction names the shot start frame explicitly ("`@Image1` is this shot's approved start frame — animate from it; the remaining references are immutable identity references, never alternate or stop frames").

In `scheduleVideoAttempt`, replace `referenceImagesForVideoUnit(...)` (SVC:22342) with this resolver **only** on the sequential branch; leave the existing call for every other strategy. Also add the explicit sequential guard to the `referenceMode` derivation (SVC:22318-22321) so sequential can never be typed `start_stop`.

### 5.6 Per-shot duration

```ts
/** Clamp-then-fit. supportedDurations = model.durations ?? configJson.supportedDurations ?? null. */
function resolveMarketplaceAutoReviewSequentialShotVideoDuration(input: {
  requestedSeconds: number | null | undefined;  // sequentialStoryboard.shots[i].duration_seconds
  fallbackSeconds: number;                      // plan shot.durationSeconds
  videoModel: string;
}): { durationSeconds: number; fitted: boolean; supportedDurations: number[] | null };
```

- `requested = Math.round(requestedSeconds ?? fallbackSeconds)`. Outside `[3, 10]` ⇒ do **not** silently clamp; surface `shot_duration_exceeds_max` through the §5.4 preflight (spec §23.1 item 9). Section-04's pack preflight should have caught it already; this is the submit-time backstop.
- No declared duration set ⇒ pass `requested` through, `fitted: false`.
- Otherwise pick the smallest supported value `>= requested`; if none exists, the largest supported value; `fitted = picked !== requested`.
- Use the resolved `durationSeconds` for **all four** consumers in the same submission: `reserveMarketplaceMediaCredits({selections:{duration}})`, the reservation `description` string, `generateVideoAsync({duration})`, and the ref/credit `metadata.durationSeconds`. Divergence would mis-price the reservation against the veo pricing matrix.
- `fitted === true` ⇒ push `sequential_video_duration_fitted_to_model` into the preflight warnings (spec §23.2).

### 5.7 Submission payload (sequential branch only)

Everything else in the `generateVideoAsync` payload stays identical (`model`, `aspectRatio "9:16"`, `resolution "1080p"`, `publicUrl`, `transportMetadata`, `auditContext.traceId` shape). Sequential adds to `extraParams`:

- `__reference_mode: "single_storyboard_frame"`
- `__frame_strategy: "sequential_shot_storyboard"`
- `__sequential_shot_id: <n>`
- `__sequential_duration_fitted: <boolean>`
- `referenceImageManifest` / `referenceImageRoleOrder` / `referenceImageRoleCounts` derived from §5.5's manifest

3x3 and start/stop payloads must remain byte-identical (T7).

### 5.8 Audio + downstream stages

No edits. `resolveMarketplaceAutoReviewAudioStrategy` (SVC:6659), the voice-consistency lock (SVC:22325-22331), `generateAudioAsync`, `elevenlabs-product-voiceover-dialogue`, `video_edit`, `render`, and `library_finalize` are all untouched. The audio contract for sequential is enforced upstream in the skill (section-03 §6.5: dialogue embedded only when the resolved strategy embeds audio; visual-only otherwise) and is verified here by re-asserting the existing tests, not by adding TS behavior.

---

## 6. Files touched

| File | Change |
|---|---|
| `apps/web/server/services/marketplaceAutoReviewService.ts` | §5.1 predicate + gate, §5.3 prompt resolution + source tag, §5.4 preflight + video optimizer + error class, §5.5 reference resolver + `referenceMode` guard, §5.6 duration resolver, §5.7 payload additions; new imports (`getModelById`, `resolveVerticalDramaCapabilities`, section-04 marker/price/`prompt_kind` exports); new `…ForTest` exports: `marketplaceAutoReviewVideoModelSupportsStartFrameForTest`, `assertMarketplaceAutoReviewSequentialVideoModelSupportedForTest`, `validateMarketplaceAutoReviewSequentialVideoPromptPreflightForTest`, `resolveMarketplaceAutoReviewSequentialVideoReferenceAttachmentForTest`, `resolveMarketplaceAutoReviewSequentialShotVideoDurationForTest`, `resolveSequentialVideoUnitPromptTextForTest` |
| `apps/web/server/services/hyperframesRuntimeApiService.ts` | Capability gate before `startMarketplaceAutoReviewRun` (§5.1) |
| `apps/web/server/services/hyperframesAutoPlanService.ts` | `videoModelSupportsStartFrame?: boolean` input + blocker push (§5.2); async wrapper resolves the capability |
| `apps/web/shared/hyperframes/contracts.ts` | New blocker code `sequential_video_model_no_start_frame` |
| `apps/web/shared/hyperframes/statusCopy.ts` | Forced copy entry (TH/EN) for the new code |
| `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialFullVideo.test.ts` | New — T1–T7 |
| `apps/web/server/services/__tests__/hyperframesAutoPlan.sequentialVideoModel.test.ts` | New — T1 plan-surface cases |
| `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts` | **Read-only here.** If `SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER` / the price detector / `prompt_kind: "sequential_video"` are not yet exported, add them in section-04's module — never fork them into SVC |
| `apps/web/shared/storyboardPromptAudio.test.ts`, `server/services/__tests__/marketplaceAutoReviewService.test.ts`, `…/marketplaceAutoReview.snapshots.test.ts` | Read-only tripwires — must stay green with zero edits |

No DB migration. `marketplace_auto_review_runs.frameStrategy` is `varchar(40)`; every new field is additive JSONB inside `metadataJson` / task refs (Database Safety Protocol: Low risk, no DDL).

---

## 7. Verification checklist

1. New suites green:
   `npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.sequentialFullVideo.test.ts server/services/__tests__/hyperframesAutoPlan.sequentialVideoModel.test.ts`
2. Regression suites green with **zero edits**: `server/services/__tests__/marketplaceAutoReviewService.test.ts`, `shared/storyboardPromptAudio.test.ts`, `shared/hyperframes/__tests__/statusCopy.test.ts`, `shared/hyperframes/__tests__/contracts.test.ts`.
3. WS-1 snapshot suite byte-identical (`marketplaceAutoReview.snapshots.test.ts`) — no `-u`, ever.
4. tsc gate: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — no NEW errors vs the ~987-error baseline.
5. Grep guards: no `.slice(` / `compactImagePromptText(` against a final sequential video prompt; no `buildVideoPrompt` call reachable from the sequential branch; no `runProductVideoMotionPromptSkill` call reachable from the sequential branch; `approvedProductReferenceUrls` still called with max 1.
6. Manual trace (internal tenant, both flags on, `outputMode: full_video`): 9 `media_request` audit events with `__unit_id: <shot>-video`, `__reference_mode: single_storyboard_frame`, `referenceImageUrls[0]` equal to the shot's approved frame, per-shot `duration`, and a global-block-carrying prompt ≤ 2,000 chars; a `sora-2` selection is rejected at plan (`canStart: false`) and at start (`PRECONDITION_FAILED`).

---

## 8. Hazards and constraints

- **Pre-spend ordering is the whole point.** Preflight, capacity, and duration resolution must all run before `reserveMarketplaceMediaCredits`. A test that only asserts "throws" is insufficient — assert the credit and provider spies are at call count 0.
- **Reservation/submission duration parity.** veo pricing is a `resolution-duration` matrix; reserving 5s and submitting 8s under-reserves credits. One resolved value, four consumers.
- **Do not re-inject `motionDirection`.** The sequential skill dual-injects it; a TS append both duplicates the directive and eats the 2,000-char budget, and can push a valid prompt over budget at submit time.
- **Do not run the motion-prompt skill for sequential.** Its output has no mandatory global block and would trip `video_global_block_missing` — turning an enhancement into a hard stage failure.
- **Marker string is single-sourced.** The global-block marker literal lives in section-03's skill body and is exported once by section-04. Re-typing it in SVC creates a silent drift class (the skill can be edited without the check noticing).
- **Fail-open on unknown model metadata, fail-closed on missing frames.** An unknown model id must not block a run; a missing approved start frame must.
- **`blockers[]` vs `warnings[]`.** Unlike section-01's flag case, this blocker is intentionally in `blockers[]` because the model is genuinely not usable — it flips `canStart` to false and re-routes `primaryAction`. Confirm the plan-card copy reads sensibly in that state with section-11.
- **27k-line SVC + concurrent sessions.** Keep the diff additive and small; re-read line numbers immediately before editing; prove changes via an isolated copy or a worktree (symlink `node_modules` from the main checkout) and ff-merge — production serves from the main checkout.
- **Deploy note:** server `*.ts` changed ⇒ `cd apps/web && npm run build:deploy` then `sudo systemctl restart smartspec-web.service`. Never start dev servers in the background.