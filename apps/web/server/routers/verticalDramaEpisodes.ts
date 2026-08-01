/**
 * Vertical Drama Series — episode pipeline + memory router (spec feature 131, §04).
 *
 * Protected, feature-flag-gated (`verticalDramaSeries`, fail-closed), and scoped
 * to the caller's tenant + user on every read and mutation. Every mutation
 * accepts an idempotency key so a retried request does not duplicate state.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { auditLogger } from "../services/auditLogger";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  workerJobs,
  verticalDramaApprovalCheckpoints,
  verticalDramaRunArtifacts,
  verticalDramaEpisodeRuns,
  verticalDramaCharacters,
  verticalDramaLocations,
  verticalDramaMemoryEvents,
  mediaAssets,
  mediaModels,
} from "../../drizzle/schema";
import {
  mediaGenerationService,
  DEFAULT_MODELS,
  resolveReferenceUrl,
} from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import {
  getModelsByTypeAsync,
  isDbModelCatalogLoaded,
  resolveVerticalDramaCapabilities,
  deriveModelResolutionOptions,
} from "../services/modelRegistry";
import {
  markArtifactStale,
  stampArtifactForStoryboard,
  stampStoryboardRevision,
  storyboardArtifactStatus,
} from "../services/verticalDramaStoryboardRevision";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../services/creditService";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import { resolveMediaTransport } from "../services/mediaTransportResolver";
import { normalizeMcpProviderModelIdForProvider } from "../services/mcpProviderModelAliases";
import {
  resolveMcpRouteFromModelId,
  defaultMcpArgumentShape,
} from "../services/mcpModelRouteResolver";
import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
// Feature 135 — Hermes Grok media worker (section 09). Pure string helper
// only (no DB import) — see this file's private `resolveVdMediaTransportDecision`.
import { formatHermesErrorMessage } from "../../shared/hermesMedia";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { verticalDramaCharacterStockService } from "../services/verticalDramaCharacterStock";
import { verticalDramaLocationStockService } from "../services/verticalDramaLocationStock";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  verticalDramaShotReferencesService,
  VerticalDramaShotReferenceError,
  type VerticalDramaShotReferenceRole,
  type VerticalDramaShotReferenceSource,
} from "../services/verticalDramaShotReferences";
import {
  runVerticalDramaEpisodeQualityReview,
  computeVerticalDramaDensityMetrics,
  // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W6,
  // added 2026-07-11) — same "deterministic fact computed in TS, fed to the
  // review LLM" role as `computeVerticalDramaDensityMetrics` above.
  computeRetentionMetrics,
  InsufficientCreditsError as QualityReviewInsufficientCreditsError,
  VdSchemaValidationError as QualityReviewVdSchemaValidationError,
  RateLimitExceededError as QualityReviewRateLimitExceededError,
  type EpisodeQualityReviewOutput,
  type VerticalDramaDensityMetrics,
  type VerticalDramaRetentionMetrics,
} from "../services/verticalDramaEpisodeQualityReview";
import {
  groupQualityReviewIssuesByStage,
  groupQualityReviewIssuesByStageWithFlag,
  composeQualityReviewRepairInstruction,
  appendVerticalDramaStoryLockRepairConstraint,
  evaluateVerticalDramaStoryLockScriptGuard,
  evaluateVerticalDramaStoryLockStoryboardGuard,
  VD_STORY_LOCK_VIOLATION,
} from "../services/verticalDramaQualityReviewApply";
// Wave-4A (spec §16.1, section-14) — the bounded auto-improve loop
// orchestrator. Pure/DB-free (only imports `@shared/verticalDramaSeries`,
// `qualityPolicy.ts`, and `verticalDramaQualityReviewApply.ts`, all already
// either shared or already statically imported above) — safe as a static
// import, no `adminProcedure`/`enabledLlmModels.ts` chain to worry about
// (see this file's `runArcDriftCheckAndProposeIfNeeded` doc comment for the
// pattern this mirrors when a chain like that DOES exist).
import {
  runVerticalDramaQualityLoop,
  estimateVerticalDramaQualityLoopCredits,
  type VerticalDramaQualityLoopEffects,
  type VerticalDramaQualityLoopReviewLike,
} from "../services/verticalDramaQualityLoop";
// Wave-4A (spec §16.1) — policy resolution (series column -> tenant default
// hook -> built-in defaults). Pure/shared, zero server/db imports.
import {
  resolveQualityPolicy,
  evaluateScorecardAgainstPolicy,
  type VerticalDramaQualityPolicy,
  type VerticalDramaQualityScorecardDimensions,
} from "@shared/verticalDramaSeries/qualityPolicy";
import {
  resolveStoryboardLocationRoster,
  type VerticalDramaLocationIdentity,
} from "@shared/verticalDramaSeries/locationIdentity";
import {
  runVerticalDramaSeriesMemoryPlanning,
  InsufficientCreditsError as MemoryPlanningInsufficientCreditsError,
  VdSchemaValidationError as MemoryPlanningSchemaValidationError,
  RateLimitExceededError as MemoryPlanningRateLimitExceededError,
} from "../services/verticalDramaSeriesMemoryPlanning";
import {
  formatVideoClipRequest,
  type VerticalDramaClipDialogueLine,
} from "../services/verticalDramaVideoPromptFormatter";
import {
  generateVerticalDramaShotVideoPrompt,
  generateVerticalDramaShotVideoPromptSpeakerSwitch,
  // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
  // quality/plan.md` Phase 2) — the router's `generateShotVideoPrompt`
  // mutation calls these instead of the plain generators above (which stay
  // imported/untouched — every other doc comment in this file that
  // references them by name still resolves correctly).
  generateJudgedVerticalDramaShotVideoPrompt,
  generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch,
  generateVerticalDramaClipDialogue,
  InsufficientCreditsError as ClipDialogueInsufficientCreditsError,
  VdSchemaValidationError as ClipDialogueSchemaValidationError,
  RateLimitExceededError as ClipDialogueRateLimitExceededError,
  appendPresetVisualIdentityStyleTokensToMotionPrompt,
  // Multi-character reference images (multi-character disambiguation fix,
  // `polished-toasting-gadget.md`) — type-only, shared by
  // `resolveShotVideoPromptCharacterReferenceImages` below and every
  // `characterReferenceImages` field this router threads through to the
  // generator.
  type ShotVideoPromptCharacterReferenceImage,
} from "../services/verticalDramaVideoMotionPromptGeneration";
import {
  extractShotProductPlacements,
  findPlacementForShot,
  type VerticalDramaShotProductPlacement,
  tieInShotNumberSet,
  evaluateFatigue,
  screenClaims,
  buildTieInQualityReport,
  VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW,
  mergeAndTrimReferenceImageUrls,
  mergeProductLockNegativePrompt,
  sanitizeBrandMentionsInPrompt,
  // vertical-drama-skill-first-architecture plan, Phase 1 item 2 —
  // `VD_PRODUCT_LOCK_INSTRUCTION` (the authored positive-prompt sentence) is
  // no longer used by `repairShotImage`/`generateStartFrameAngleVariations`;
  // the `vertical-drama-shot-image-action` skill now phrases the product
  // lock instruction itself from raw product facts. Still used by other,
  // out-of-scope call sites via `verticalDramaProductTieIn.ts` directly.
} from "../services/verticalDramaProductTieIn";
import {
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
} from "@shared/verticalDramaSeries/characterLock";
import {
  ensurePromptWithinLimit,
} from "../services/verticalDramaPromptQc";
import {
  VD_IMAGE_PROMPT_ABSOLUTE_MAX,
  resolveVdImagePromptBudgetForModel,
} from "../services/modelPromptBudget";
// Preset visual identity flow-through (spec §8.2.2 flow-through rule,
// section-15 change D, Wave-4A/section-14 completing the "start
// frames/motion prompts" leg of the rule — character refs were already
// wired by `verticalDramaCharacterImageGeneration.ts`). Pure/shared type +
// zod schema only (TYPE + a pure zod object are both erased/side-effect-free
// at runtime) — safe as a static import. The two pure fragment-merge
// FUNCTIONS themselves live in `verticalDramaStartFrameGeneration.ts`, which
// (like `verticalDramaStoryBible.ts` itself) transitively reaches
// `enabledLlmModels.ts` -> `../routers/llmProviders` -> `adminProcedure` —
// this router's OWN test suite's `../../_core/trpc` mock never provides
// that export, and `verticalDramaStartFrameGeneration.ts` is NOT already
// mocked wholesale by any existing test file (unlike
// `verticalDramaEpisodeQualityReview.ts`/
// `verticalDramaVideoMotionPromptGeneration.ts` above, which every existing
// test file already mocks away entirely) — so those two functions are
// loaded via a runtime `import()` inside `generateStartFrameImage` instead,
// mirroring `runArcDriftCheckAndProposeIfNeeded`'s established pattern.
import {
  applySeriesLookToImagePrompt,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  buildSceneShotGroups,
  computeSceneMembershipHash,
  type VdSceneShotGroup,
  type VdSceneVisualState,
} from "@shared/verticalDramaSeries/sceneContinuity";
import {
  buildCharacterIdentityMapBlock,
  findCharacterImageIndexMappingMismatches,
  stripExistingIdentityLockSuffix,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
import {
  VERTICAL_DRAMA_MEMORY_KINDS,
  VERTICAL_DRAMA_PROMPT_LANGUAGES,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGES,
  VERTICAL_DRAMA_THAI_ACCENTS,
  VERTICAL_DRAMA_TARGET_DURATION_SECONDS,
  analyzeVerticalDramaClipDialogueQuality,
  // Phase 6 (`planning/vd-start-frame-reference-mapping/plan.md`) —
  // `generateShotReferenceFrameImage`'s `prompt` input zod-caps at the same
  // limit `ensurePromptWithinLimit` itself enforces (so a user who edits the
  // confirmed prompt can never submit something the render call would have
  // silently truncated anyway). Imported from the shared barrel directly
  // (NOT from `verticalDramaPromptQc.ts`'s re-export) — that service module
  // is wholesale-mocked by every existing VD router test file, and none of
  // those mocks export this constant; `@shared/verticalDramaSeries` is a
  // pure/shared module every one of those same test files already imports
  // unmocked.
  VD_IMAGE_PROMPT_MAX,
} from "@shared/verticalDramaSeries";
import {
  targetVerticalDramaSpeechSeconds,
  analyzeVerticalDramaEpisodeDialogueQuality,
  // Content-completeness pass semantics (2026-07-08/W9-A, spec §14.1 rule
  // 6b, section-12 "Pass Semantics") — `estimateVerticalDramaDialogueSeconds`
  // / `analyzeVerticalDramaClipSilence` / `analyzeVerticalDramaLineSpeakability`
  // feed the wizard's per-shot completeness summary
  // (`resolveWizardPerShotDialogue` below); no second speech/silence/
  // speakability model is declared anywhere in this router.
  estimateVerticalDramaDialogueSeconds,
  analyzeVerticalDramaClipSilence,
  analyzeVerticalDramaLineSpeakability,
  MIN_EPISODE_COVERAGE_RATIO,
  ERROR_EPISODE_COVERAGE_RATIO,
  type VerticalDramaDialogueClipQualityInput,
  type VerticalDramaDialogueQualityLine,
  type VerticalDramaEpisodeDialogueQuality,
} from "@shared/verticalDramaSeries/dialogueQuality";
import { resolveEffectiveImagePromptLanguage } from "@shared/verticalDramaSeries/imagePromptLanguage";
// Wave-4A/W4-B integration (spec §8.8, section-12) — the guided Production
// Wizard state resolver. TYPE-ONLY here (pure/shared, no runtime import) —
// the resolver FUNCTION itself is loaded via a runtime `import()` inside
// `getEpisodeDetail`'s flag-gated block (this file's established dynamic-
// import pattern for any new value import — see
// `runArcDriftCheckAndProposeIfNeeded`'s doc comment), per this wave's
// integration rule.
import type {
  DeriveVerticalDramaProductionWizardStateInput,
  VerticalDramaProductionWizardStepId,
  VerticalDramaProductionWizardScriptCoverageStatus,
  VerticalDramaWizardPerShotDialogueCompleteness,
} from "@shared/verticalDramaSeries/productionWizard";
// Story-density reform (spec §7.7.3, section-13, added 2026-07-07) — imported
// DIRECTLY from the submodule (not the shared barrel), mirroring the
// convention already established in `verticalDramaStoryBible.ts` /
// `verticalDramaScriptGeneration.ts`: `contentBudget.ts` is the ONE
// canonical content-budget/breakdown-versioning contract source.
import type {
  VerticalDramaConflictLevel,
  VerticalDramaEpisodeBreakdownItem as VerticalDramaArcReplanBreakdownItem,
  VerticalDramaEpisodeTieInPlacement,
} from "@shared/verticalDramaSeries/contentBudget";
// Task #31 (tie-in defer -> real arc re-plan proposal, spec §7.7.3, added
// 2026-07-09) — VALUE import (not type-only): both are pure/shared
// functions with zero server-only transitive imports (unlike the 3 modules
// dynamically imported via `runArcDriftCheckAndProposeIfNeeded`'s doc
// comment below), so a static import here is safe.
import {
  planSeasonTieInPlacements,
  proposeTieInDeferReplan,
} from "@shared/verticalDramaSeries/contentBudget";
// TYPE-ONLY (erased at compile time — see the doc comment further below,
// right before `runArcDriftCheckAndProposeIfNeeded`, for why the VALUES from
// these 2 modules are loaded via a runtime `import()` instead of a static
// import here).
import type { ArcDriftOpenHook } from "../services/verticalDramaArcReplan";
import type { ScriptBuilderOutput } from "../services/verticalDramaScriptGeneration";
// Part B3 (planning/`polished-toasting-gadget.md`) — pure, shared formatter
// for the compact episode plan-context block injected into
// `generateShotVideoPrompt`'s per-shot video-prompt call. Safe as a static
// import (no server/DB code, `@shared` module).
import { formatStoryScriptEpisodePlanContext, type StoryScriptLang } from "@shared/verticalDramaSeries/storyScriptText";
// Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`) —
// TYPE-ONLY import of the deep-drafted shot's canonical dialogue shapes
// (erased at compile time, zero runtime `require`, so safe despite
// `verticalDramaStoryBible.ts` itself needing the lazy `import()` treatment
// for its VALUE exports — see `getActiveBreakdown`'s existing dynamic-import
// call site below for that established convention).
import type {
  VdDeepDraftShotDraft,
  VdDeepDraftShotDialogueLine,
} from "../services/verticalDramaStoryBible";
import type {
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaSubShotPolicy,
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
  VerticalDramaShotgrid,
  VerticalDramaProductTieInConfig,
  VerticalDramaSeriesLocale,
  VerticalDramaAssemblyManifest,
  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`) — the pack's
  // existing structured warning shape, reused to record any position-anchor
  // compliance warning the service surfaces (item C).
  VerticalDramaWarning,
} from "@shared/verticalDramaSeries";
// Model-family-aware, vision-grounded video prompt quality upgrade — the
// persisted-clip metadata type; the resolver function itself is called only
// inside the service (this router just reads `result.family` off the
// service's return value and stamps it, so no VALUE import is needed here).
import type { VideoPromptModelTarget } from "@shared/verticalDramaSeries/videoPromptModelFamily";
// Two-mode start-frame image prompt switch
// (`planning/vd-start-frame-prompt-modes/plan.md`) — UNLIKE the video sibling
// above, the family/default-mode resolution happens HERE in the router (this
// mutation already loads the plan's `selectedImageModelId` and has
// `getModelsByTypeAsync` in scope), not inside the service.
import {
  type ImagePromptModelFamily,
  type VdImagePromptMode,
  type VdImagePromptModeStamp,
  resolveImagePromptTargetFamily,
  resolveDefaultImagePromptMode,
} from "@shared/verticalDramaSeries/imagePromptModelFamily";
import {
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  normalizeVerticalDramaSeriesLocale,
  // Speaker-aware sub-shots task — deterministic (no LLM call) split-decision
  // gate + the window shape it produces. See `resolveSubShotPolicy`'s own
  // doc comment for why the tenant flag is resolved separately from this.
  computeSpeakerSwitchSubShotPlan,
  type SpeakerSwitchSubShotWindow,
  // Multi-character disambiguation fix (`polished-toasting-gadget.md`) —
  // shared anchor-first/first-appearance dedup, see its own doc comment in
  // `subShots.ts` for why this is extracted rather than inlined here.
  deriveDistinctSpeakerCharacterKeysFromWindows,
} from "@shared/verticalDramaSeries";
// W12-A voice chain wave — imported by DIRECT PATH (not the shared barrel),
// same convention `audio.ts`'s own doc comment documents for itself: its
// `VerticalDramaDialogueAudioPlan` would otherwise collide with the compact,
// unrelated recommendation type of the same name re-exported from
// `./contracts` through the barrel.
import type {
  VerticalDramaDialogueAudioPlan,
  VerticalDramaSeparateTtsPlanItem,
} from "@shared/verticalDramaSeries/audio";
import {
  readTargetAudienceRegionFromBible,
  // vertical-drama-skill-first-architecture plan, Phase 1 items 1-2 — the
  // FACT (descriptor label) is passed to `vertical-drama-shot-image-action`
  // as skill input; the old `buildTargetAudienceRegionInstruction`'s full
  // authored sentence (with the "apply only as default" policy prose) is no
  // longer used at those two call sites, since the skill now phrases that
  // policy itself (taught once in skill.md rather than re-sent as prose per
  // call). Still used by other, out-of-scope call sites that import it
  // directly from `@shared/verticalDramaSeries/targetAudienceRegion`.
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  verticalDramaEpisodePipeline,
  VerticalDramaEpisodePipeline,
  VERTICAL_DRAMA_PIPELINE_STAGES,
  VERTICAL_DRAMA_RUNNER_MODES,
  VERTICAL_DRAMA_ASYNC_STAGES,
  type EpisodeRunOwner,
  type RunStageOptions,
  type RunStageOutcome,
} from "../services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../services/verticalDramaProviderRouting";
// Bug #127 (`planning/vd-storyboard-runstage-async-job/plan.md`) —
// `storyboard_shotgrid`'s real (non dry_run/plan_only) generation path is
// dispatched as an async BullMQ job instead of running inline inside this
// HTTP mutation; see `submitStoryboardShotgridAsync` below.
import { enqueueVerticalDramaEpisodeStageJob } from "../services/verticalDramaEpisodeStageJobs";
// Vertical Drama Render Queue plan §4.2 Wave 3 — `queueVerticalDramaFfmpegAssemblyJob`
// (`../services/workerSchedulerService`) replaces the in-process
// `submitAssemblyJob` launch inside `assembleEpisodeVideo`. Loaded via a
// lazy `await import(...)` INSIDE that handler (not a static top-level
// import) because `workerSchedulerService.ts` calls `createRateLimiter(...)`
// at module-load time — a static import here would pull that side effect
// into every OTHER procedure's sibling test file that mocks
// `../services/rateLimiter` narrowly (or not at all), breaking module load
// for tests that never touch `assembleEpisodeVideo`. Mirrors this file's
// existing lazy-import posture for other heavy/side-effecting service
// modules.
import {
  verticalDramaSeriesMemoryService,
  memoryRowToEvent,
} from "../services/verticalDramaSeriesMemory";
import {
  extractClipSourcesFromMotionPromptPack,
  mergeVideoTaskIntoMotionPromptPack,
  resolveClipsForAssembly,
  // no longer the primary path — see queueVerticalDramaFfmpegAssemblyJob
  submitAssemblyJob,
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleEpisodeVideo`
  // enqueues instead of launching `runAssemblyJob` in-process; this is the
  // SAME read-modify-write persist `submitAssemblyJob` always used, exported
  // so the router can call it directly right after enqueueing.
  persistCompiledVideoState,
  compiledVideoFilename,
  // Task #21 phase B — connects the already-landed render engine's
  // `dialogueAudio`/`subtitles` inputs to real data. Lives in the SERVICE
  // (not router-local, unlike `resolveEpisodeAdBannerRunInputs` below) so
  // `verticalDramaSeries.ts`'s `assembleSeasonVideos` can reuse it too
  // without a cross-router import — see that function's own doc comment.
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs,
  // Task #34 — same "lives in the SERVICE, not router-local" convention,
  // for the same cross-router-reuse reason.
  resolveEpisodeTextOverlayRunInputs,
  type EpisodeClipSource,
  type VerticalDramaVideoTaskPatch,
  type CompiledVideoState,
  type RunAssemblyJobBannerInput,
  type RunAssemblyJobSubtitlesInput,
  type RunAssemblyJobTextOverlayEventInput,
  type RunAssemblyJobWatermarkImageInput,
  type VdEpisodeTextOverlayCardInput,
  type VdEpisodeTextOverlayCharacterIntroInput,
} from "../services/verticalDramaEpisodeVideoAssembly";
// Task #34 — the Text Overlay Suite's data model + pure derivation helpers
// (zod schemas, priority resolvers, watermark corner auto-avoid). Pure/
// isomorphic module, safe as a normal static import (same posture as
// `adBannerPresets.ts`'s own doc comment).
import {
  defaultCardStyleVariantForKind,
  deriveEpisodeIndicatorLabel,
  deriveTitleBumperLines,
  parseSeriesWatermarkConfig,
  parseTextOverlayPlan,
  resolveWatermarkCornerAutoAvoid,
  validateTextOverlayPlan,
  vdTextOverlayPlanSchema,
  VD_CHARACTER_INTRO_DURATION_SECONDS,
  type VdTextOverlayCard,
  type VdTextOverlayPlan,
} from "@shared/verticalDramaSeries/textOverlay";
// Task #21 phase B — pure shot-local -> absolute-render-timeline placement,
// shared with `verticalDramaEpisodeVideoAssembly.ts`'s
// `resolveEpisodeDialogueAudioAndSubtitlesRunInputs` (this router only needs
// the `VdDialogueTimelineClip` projection TYPE to build that call's
// `motionClips` argument from `pack.clips`).
import type { VdDialogueTimelineClip } from "@shared/verticalDramaSeries/dialogueAudioTimeline";
// Task #21 phase B — subtitle preset picker input validation; the SAME 10
// caption preset ids `verticalDramaFinalRenderGraph.ts` already burns in
// (see that module's own header doc comment for the "reused whole" citation).
import { HyperframesFinalCompositeSubtitlePresetSchema } from "@shared/hyperframes/runtimeApiSchemas";
// Phase A render-options quick win — `showAgeBadge`'s label needs the
// series' resolved audience age rating; `resolveAudienceAgeRating` is the
// SAME "untyped bible read -> defaulted tier" helper `verticalDramaSeries.ts`
// already uses (see `loadSeriesAudienceAgeRating` below, which mirrors this
// file's own `loadSeriesTargetAudienceRegion` "read bible for a caller-owned
// series" convention). Pure/zero-dependency shared module — safe as a normal
// static import.
import {
  resolveAudienceAgeRating,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
/**
 * Ad Banner Overlay — per-episode SELECTION of the series' ready banner
 * designs (F131W, #30-A2, `planning/vertical-drama-ad-banner-overlay/plan.md`
 * §2 "ชั้นการใช้" + §6 episode side). `@shared/verticalDramaSeries/
 * adBannerPresets` is a pure, dependency-free module (no DB/network imports —
 * see its own header doc comment) — safe as a normal static import, same as
 * every other `@shared/verticalDramaSeries/*` import in this file. The
 * SERVER-side `resolveAdBannerApprovalGate` (from `services/
 * verticalDramaAdBanner`) is deliberately NOT statically imported here: that
 * module pulls a heavy transitive chain (-> `enabledLlmModels` -> the
 * `llmProviders` ROUTER needing `adminProcedure`) that would break this
 * router's sibling test files' narrow `vi.mock` graphs the instant this
 * module loads — same known issue already documented on
 * `verticalDramaSeries.ts`'s own Ad Banner Overlay import block. It is loaded
 * via a lazy `await import(...)` inside the handlers that need it below.
 */
import {
  parseAdBannerDesigns,
  getAdBannerPlacementPreset,
  readAdBannerProductContext,
  VD_AD_BANNER_MAX_PER_SERIES,
  type VdAdBannerDesign,
  type VdAdBannerPlacementId,
  type VdAdBannerStatus,
} from "@shared/verticalDramaSeries/adBannerPresets";
import { getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";
import {
  generateNextEpisodesViaLlm,
  InsufficientCreditsError as EpisodeContinuationInsufficientCreditsError,
  VdSchemaValidationError as EpisodeContinuationSchemaValidationError,
  type ExistingEpisodeContext,
  type EpisodeBreakdownItem,
} from "../services/verticalDramaEpisodeContinuation";
// Story-density reform (spec §7.7.3, section-13, added 2026-07-07) — arc
// drift detection + proposal construction (Wave-2A, `verticalDramaArcReplan.ts`),
// the breakdown-version helpers (Wave-2A, `verticalDramaStoryBible.ts`), and
// the script coverage gate (Wave-2A, `verticalDramaScriptGeneration.ts`).
// TYPE-ONLY imports here deliberately (erased at compile time, zero runtime
// `require`) — the actual VALUES are loaded via a runtime `import()` inside
// `runArcDriftCheckAndProposeIfNeeded` below. This is NOT a style choice:
// `verticalDramaStoryBible.ts` (and everything that imports it, including
// `verticalDramaArcReplan.ts` and `verticalDramaScriptGeneration.ts`)
// transitively imports `enabledLlmModels.ts` -> `llmProviders.ts`, whose
// `adminProcedure` export this router's OWN test suite's `../../_core/trpc`
// mock never provides (see the pre-existing `ensurePromptWithinLimit` /
// `verticalDramaPromptQc.ts` doc comment above for the identical, already-
// solved problem) — a STATIC value import here would crash every one of
// this router's existing unit test files at import time, not just the ones
// that exercise this new code. The lazy import only ever executes when the
// `verticalDramaSeriesArcReplan` flag is actually on, which no pre-existing
// test enables.
import { debugError } from "../_core/logger";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                         */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

/**
 * Base procedure for the voice-chain procedures (W12-A, spec feature 131
 * addendum): the base `verticalDramaSeries` gate PLUS the dedicated
 * `verticalDramaSeriesVoiceChain` flag — same "chain a second, feature-
 * specific `requireFeatureFlag` middleware" convention already established
 * for `verticalDramaDeepStoryDraftsProcedure`/`verticalDramaArcReplanProcedure`
 * in `verticalDramaSeries.ts`. `generateEpisodeDialogueAudio` is a brand-new
 * procedure, so flags-off means it throws FORBIDDEN before any handler code
 * runs — byte-identical to not existing.
 */
const verticalDramaVoiceChainProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesVoiceChain")
);

/** Feature 138 P1 — explicit scene visual-state authoring and manual edits. */
const verticalDramaSceneContinuityProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSceneContinuity")
);

function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/** Mirrors `verticalDramaCharacters.ts`'s `createCharacterPortraitMediaToken`/
 *  `getCharacterPortraitUserToken` — mints a short-lived media-generation
 *  scoped token when the request context has none. */
function getStartFrameMediaUserToken(ctx: {
  userToken: string | null;
  user: { id: number };
}): string {
  if (ctx.userToken) return ctx.userToken;
  return signBearerToken(
    {
      sub: String(ctx.user.id),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_start_frame_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m"
  );
}

/**
 * Runner modes that never route paid provider work — they use the bundled,
 * dry-run-safe stub pipeline singleton (renders nothing, spends nothing).
 */
const VERTICAL_DRAMA_DRY_RUN_MODES: ReadonlySet<string> = new Set([
  "dry_run",
  "plan_only",
]);

/**
 * Pick the pipeline for a run mode. Dry-run / plan-only stay on the stub
 * singleton (section-04 default). Modes that can route real provider work wire
 * in the section-08 provider routing port (`createVerticalDramaProviderRoutingPort`),
 * which routes + gates paid stages (and stays dry-run-safe by default — it never
 * calls a paid API, so this is behavior-preserving for tests/dry runs).
 */
function pipelineForMode(mode: string): VerticalDramaEpisodePipeline {
  if (VERTICAL_DRAMA_DRY_RUN_MODES.has(mode))
    return verticalDramaEpisodePipeline;
  return new VerticalDramaEpisodePipeline(
    createVerticalDramaProviderRoutingPort()
  );
}

/**
 * Bug #127 (`planning/vd-storyboard-runstage-async-job/plan.md`) — shared
 * async-submit helper for `storyboard_shotgrid`'s REAL (non dry_run/
 * plan_only) generation path, used by BOTH `runStage` and `regenerateStage`
 * (the only two mutations that can trigger a real `storyboard_shotgrid`
 * run). Inserts (or reuses, if one is already in flight — idempotency, see
 * `submitStoryboardShotgridStage`'s doc comment) a `queued`
 * `vertical_drama_episode_runs` row and returns immediately: the actual LLM
 * generation + persistence/validation/checkpoint work runs later, from a
 * BullMQ background worker (`verticalDramaEpisodeStageJobs.ts`), never on
 * this HTTP request — this is what stops Cloudflare's ~100s edge-proxy read
 * timeout from ever being able to kill the generation again.
 *
 * `clearDownstreamOnSuccess` — threaded through from `regenerateStage`'s
 * call site only; see `clearStoryboardShotgridDownstreamAfterRegenerate`'s
 * doc comment in `verticalDramaEpisodePipeline.ts`.
 */
async function submitStoryboardShotgridAsync(
  owner: EpisodeRunOwner,
  opts: RunStageOptions,
  clearDownstreamOnSuccess?: boolean,
  stage: VerticalDramaPipelineStage = "storyboard_shotgrid"
): Promise<RunStageOutcome> {
  const pipeline = pipelineForMode(opts.mode);
  const submitted = await pipeline.submitEpisodeStageAsync(owner, stage, opts);
  if (!submitted.alreadySubmitted) {
    const { enqueued } = await enqueueVerticalDramaEpisodeStageJob({
      runId: submitted.runId,
      owner,
      opts,
      stage,
      clearDownstreamOnSuccess,
    });
    if (!enqueued) {
      // Fail-fast (bug #127 hardening): the enqueue failed and has already
      // marked the freshly-inserted row `failed` itself (see
      // `enqueueVerticalDramaEpisodeStageJob`) — reflect that here instead
      // of telling the client the run is `queued`, which would strand the
      // UI polling a row no worker will ever touch. Deliberately not a
      // thrown error: the row state is consistent and re-running the stage
      // is safe, so the client gets a normal failed RunResult it already
      // knows how to render.
      return {
        runId: submitted.runId,
        result: {
          ...submitted.result,
          status: "failed",
          next_action: "repair",
          errors: [
            {
              code: "VD_STORYBOARD_GENERATION_FAILED",
              message:
                "Could not enqueue the background storyboard job — the run was marked failed immediately. Running the stage again is safe.",
              repairable: true,
            },
          ],
        },
        staleStages: [],
      };
    }
  }
  return { runId: submitted.runId, result: submitted.result, staleStages: [] };
}

/** Confirm the caller owns the series (tenant + user), else NOT_FOUND. */
async function assertSeriesOwned(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
}

/** Load an episode the caller owns (tenant + user + series), else NOT_FOUND. */
async function loadOwnedEpisode(owner: EpisodeRunOwner) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
  return row;
}

/**
 * Series-level target-audience region default (2026-07-06 character-prompt
 * quality upgrade) — read `bible.targetAudienceRegion` for a caller-owned
 * series. Used by every person-generating mutation in this router (angle
 * grid, image repair) so the rendered person defaults to the series'
 * configured region/ethnicity look unless the shot/character's own
 * description overrides it. Returns the normalized default ("thai") when the
 * series/bible/field is missing — never throws.
 */
async function loadSeriesTargetAudienceRegion(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const [row] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  return readTargetAudienceRegionFromBible(
    (row?.bible as Record<string, unknown> | null) ?? null
  );
}

/**
 * Series-level audience age rating (Phase A render-options quick win) —
 * mirrors `loadSeriesTargetAudienceRegion`'s exact "read `bible` for a
 * caller-owned series" query shape. Only called by `assembleEpisodeVideo`
 * when `input.showAgeBadge` is true (every pre-existing caller never sets
 * it, so this pays zero extra DB cost for them). Resolves via the SAME
 * `resolveAudienceAgeRating` helper the series router uses when reading an
 * existing series' `bible.audienceAgeRating` — defaults to the
 * least-restrictive `"18plus"` tier (never throws) when the series/bible/
 * field is missing, satisfying this mutation's own "no rating? default to
 * 18+" contract for free.
 */
async function loadSeriesAudienceAgeRating(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<AudienceAgeRating> {
  const [row] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const bible = (row?.bible as Record<string, unknown> | null) ?? null;
  return resolveAudienceAgeRating(bible?.audienceAgeRating);
}

/**
 * Series-level product tie-in NAME/DESCRIPTION facts (vertical-drama
 * skill-first-architecture plan, Phase 1 item 2) — read for a caller-owned
 * series ONLY when the caller already knows this shot has a product
 * reference attached (`hasProductReference`), so a non-tie-in shot never
 * pays for the extra query. Returns `null` on no product tie-in configured /
 * `hasProductReference` false — never throws. Used by
 * `generateStartFrameAngleVariations`/`repairShotImage` to pass real product
 * FACTS (name/description) as skill input, instead of the code-authored
 * `VD_PRODUCT_LOCK_INSTRUCTION` sentence — the skill now phrases the lock
 * instruction itself from these facts.
 */
async function loadSeriesProductTieInFacts(
  tenantId: string,
  userId: number,
  seriesId: number,
  hasProductReference: boolean
): Promise<{ productName: string | null; productDescription: string | null } | null> {
  if (!hasProductReference) return null;
  const [row] = await db
    .select({ productTieIn: verticalDramaSeries.productTieIn })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const config = row?.productTieIn as VerticalDramaProductTieInConfig | null;
  if (!config) return null;
  return {
    productName: config.productName ?? null,
    productDescription: config.productDescription ?? null,
  };
}

/**
 * Non-pipeline "stage" tag used ONLY to persist the episode quality-review
 * scorecard through the EXISTING `verticalDramaEpisodeRuns`/
 * `verticalDramaRunArtifacts` ledger tables (storyboard-complete plan, Phase
 * 3B.5 — "persist using the existing run/artifact mechanism ... so it
 * survives reload"). This is deliberately NOT added to the strict, closed
 * `VerticalDramaPipelineStage` union (`@shared/verticalDramaSeries`
 * `contracts.ts`) — the quality-review skill is an LLM-only advisory gate,
 * not one of the 15 canonical pipeline stages, and widening that union would
 * ripple through every stage-keyed switch/map in
 * `verticalDramaEpisodePipeline.ts`. Both ledger tables' `stage` DB column is
 * a plain `varchar` with no CHECK constraint (verified against the migration
 * SQL), so writing this tag directly via `db.insert(...)` here — bypassing
 * the pipeline class's stage-typed `writeRun`/`writeArtifact` methods
 * entirely — is safe and does not touch pipeline stage-sequencing logic.
 */
const VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG =
  "episode_quality_review" as const;

/**
 * Load the most recently written episode-quality-review artifact's JSON
 * payload (see `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`), or `null` if the
 * review has never been run for this episode. Tenant + user + series +
 * episode scoped.
 */
async function loadLatestQualityReview(
  owner: EpisodeRunOwner
): Promise<EpisodeQualityReviewOutput | null> {
  const [row] = await db
    .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        eq(
          verticalDramaRunArtifacts.stage,
          VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG
        )
      )
    )
    .orderBy(desc(verticalDramaRunArtifacts.id))
    .limit(1);
  if (!row?.jsonPayload) return null;
  return row.jsonPayload as EpisodeQualityReviewOutput;
}

/**
 * The two canonical `VERTICAL_DRAMA_PIPELINE_STAGES` tags whose relative
 * artifact recency drives `videoPrompts.stale` (debt-item-4, 2026-07-08) —
 * see `resolveVideoPromptsStale`'s doc comment below. Kept as plain literals
 * here (not re-imported from `verticalDramaEpisodePipeline.ts`'s stage
 * union) — this file already has its own precedent for that
 * (`VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG` above), and a literal avoids a
 * static import of the pipeline module purely for two string constants.
 */
const VD_STORYBOARD_STAGE_TAG = "storyboard_shotgrid" as const;
const VD_VIDEO_MOTION_PROMPT_PACK_STAGE_TAG =
  "video_motion_prompt_pack" as const;

/**
 * Resolve `videoPrompts.stale` (debt-item-4, 2026-07-08) — whether the
 * episode's LATEST `storyboard_shotgrid` artifact was written AFTER its
 * latest `video_motion_prompt_pack` artifact, i.e. the storyboard shot grid
 * changed since video prompts were last (re)generated from it.
 * `buildProductionWizardInput` previously hardcoded this to `false`; that
 * function's own doc comment explains the prior investigation ("no real
 * per-artifact timestamp signal exists... without new persistence") — which
 * was true for the fields ALREADY loaded onto `getEpisodeDetail`'s `row`,
 * but both stages in fact already write an immutable ledger row via
 * `VerticalDramaEpisodePipeline`'s `writeArtifact` on every (re)generation
 * (`verticalDramaRunArtifacts.id`, strictly increasing), so no NEW
 * persistence is needed — only a targeted read using the exact same
 * "one indexed, `id`-ordered, tenant/user/series/episode-scoped query, no
 * `runId` filter" convention as `loadLatestQualityReview` above (`id` is
 * used instead of `createdAt` for tie-break-free ordering, same reasoning).
 * A single query (both stages via `inArray`, newest-first) rather than two
 * separate ones. Returns `false` (never stale) whenever either stage has no
 * artifact yet — nothing to honestly compare, mirrors `videoPrompts.exists`'
 * own "nothing generated yet" semantics.
 */
async function resolveVideoPromptsStale(
  owner: EpisodeRunOwner
): Promise<boolean> {
  const rows = await db
    .select({
      stage: verticalDramaRunArtifacts.stage,
      id: verticalDramaRunArtifacts.id,
    })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        inArray(verticalDramaRunArtifacts.stage, [
          VD_STORYBOARD_STAGE_TAG,
          VD_VIDEO_MOTION_PROMPT_PACK_STAGE_TAG,
        ])
      )
    )
    .orderBy(desc(verticalDramaRunArtifacts.id));

  let latestStoryboardId: number | null = null;
  let latestVideoPromptsId: number | null = null;
  for (const row of rows) {
    if (row.stage === VD_STORYBOARD_STAGE_TAG && latestStoryboardId === null) {
      latestStoryboardId = row.id;
    } else if (
      row.stage === VD_VIDEO_MOTION_PROMPT_PACK_STAGE_TAG &&
      latestVideoPromptsId === null
    ) {
      latestVideoPromptsId = row.id;
    }
    if (latestStoryboardId !== null && latestVideoPromptsId !== null) break;
  }
  if (latestStoryboardId === null || latestVideoPromptsId === null)
    return false;
  return latestStoryboardId > latestVideoPromptsId;
}

/**
 * Persist a freshly-generated quality-review payload via the existing
 * run/artifact ledger tables (see `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s
 * doc comment) — extracted so both `runEpisodeQualityReview` and
 * `applyQualityReviewSuggestions`'s auto re-review share the exact same
 * persistence path (one ledger row shape, one place to change it).
 *
 * Returns the newly-written artifact's id (Wave-4A, spec §16.1) — additive:
 * every pre-existing call site already discards the return value (`await
 * persistQualityReviewArtifact(...)` with no assignment), so widening
 * `Promise<void>` to `Promise<string>` is backward-compatible. The auto-
 * improve loop's `effects.persistReview` (see `applyQualityReviewSuggestions`'
 * loop-mode branch) needs this id for `VerticalDramaQualityLoopRound.
 * reReviewArtifactId`.
 */
async function persistQualityReviewArtifact(
  owner: EpisodeRunOwner,
  review: EpisodeQualityReviewOutput
): Promise<string> {
  const [runRow] = await db
    .insert(verticalDramaEpisodeRuns)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      stage: VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG,
      runMode: "full",
      status: "succeeded",
      nextAction: "none",
      artifactIds: [],
      warnings: [],
      errors: [],
    })
    .returning({ id: verticalDramaEpisodeRuns.id });

  const [artifactRow] = await db
    .insert(verticalDramaRunArtifacts)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId: runRow.id,
      stage: VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG,
      jsonPayload: review as unknown as Record<string, unknown>,
      mediaAssetIds: null,
    })
    .returning({ id: verticalDramaRunArtifacts.id });

  await db
    .update(verticalDramaEpisodeRuns)
    .set({ artifactIds: [String(artifactRow.id)] })
    .where(eq(verticalDramaEpisodeRuns.id, runRow.id));

  return String(artifactRow.id);
}

/**
 * Load just the artifact id of the most recently written episode-quality-
 * review artifact — a separate, narrow query from `loadLatestQualityReview`
 * (which returns the JSON payload) so that function's return shape and every
 * existing call site stay untouched. Only the auto-improve loop's
 * `initialReview.artifactId` (spec §16.1, `applyQualityReviewSuggestions`'
 * loop-mode branch) needs the id of an ALREADY-persisted (not freshly
 * inserted) review.
 */
async function loadLatestQualityReviewArtifactId(
  owner: EpisodeRunOwner
): Promise<string | null> {
  const [row] = await db
    .select({ id: verticalDramaRunArtifacts.id })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        eq(
          verticalDramaRunArtifacts.stage,
          VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG
        )
      )
    )
    .orderBy(desc(verticalDramaRunArtifacts.id))
    .limit(1);
  return row ? String(row.id) : null;
}

/** Load a specific (by id) quality-review artifact's JSON payload — tenant/user/series/episode scoped. */
async function loadQualityReviewArtifactById(
  owner: EpisodeRunOwner,
  artifactId: string
): Promise<EpisodeQualityReviewOutput | null> {
  const numericId = Number(artifactId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const [row] = await db
    .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.id, numericId),
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId)
      )
    )
    .limit(1);
  return (row?.jsonPayload as EpisodeQualityReviewOutput | undefined) ?? null;
}

/**
 * Non-pipeline stage tag used ONLY to persist the auto-improve loop's final
 * `VerticalDramaQualityLoopState` (spec §16.1) via the SAME run/artifact
 * ledger mechanism the quality-review scorecard itself uses — mirrors
 * `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc comment exactly.
 */
const VD_QUALITY_LOOP_STATE_STAGE_TAG = "quality_loop_state" as const;

/** Persist the loop's final state as a run artifact (mirrors `persistQualityReviewArtifact`'s shape). */
async function persistQualityLoopStateArtifact(
  owner: EpisodeRunOwner,
  state: import("@shared/verticalDramaSeries/qualityPolicy").VerticalDramaQualityLoopState
): Promise<void> {
  const [runRow] = await db
    .insert(verticalDramaEpisodeRuns)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      stage: VD_QUALITY_LOOP_STATE_STAGE_TAG,
      runMode: "full",
      status: "succeeded",
      nextAction: "none",
      artifactIds: [],
      warnings: [],
      errors: [],
    })
    .returning({ id: verticalDramaEpisodeRuns.id });

  const [artifactRow] = await db
    .insert(verticalDramaRunArtifacts)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId: runRow.id,
      stage: VD_QUALITY_LOOP_STATE_STAGE_TAG,
      jsonPayload: state as unknown as Record<string, unknown>,
      mediaAssetIds: null,
    })
    .returning({ id: verticalDramaRunArtifacts.id });

  await db
    .update(verticalDramaEpisodeRuns)
    .set({ artifactIds: [String(artifactRow.id)] })
    .where(eq(verticalDramaEpisodeRuns.id, runRow.id));
}

/** Load the most recently persisted quality-loop state, or `null` if the loop has never run for this episode. */
async function loadLatestQualityLoopState(
  owner: EpisodeRunOwner
): Promise<
  | import("@shared/verticalDramaSeries/qualityPolicy").VerticalDramaQualityLoopState
  | null
> {
  const [row] = await db
    .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        eq(verticalDramaRunArtifacts.stage, VD_QUALITY_LOOP_STATE_STAGE_TAG)
      )
    )
    .orderBy(desc(verticalDramaRunArtifacts.id))
    .limit(1);
  if (!row?.jsonPayload) return null;
  return row.jsonPayload as import("@shared/verticalDramaSeries/qualityPolicy").VerticalDramaQualityLoopState;
}

/* -------------------------------------------------------------------------- */
/* W11.6 "Story Lock" — deterministic post-repair guard wiring (2026-07-08)   */
/* -------------------------------------------------------------------------- */

/**
 * Non-pipeline stage tag for the audit record of a rejected story-lock
 * repair round — mirrors `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc
 * comment exactly (append-only ledger, bypasses the pipeline class's
 * stage-typed writers since this is not one of the 15 canonical stages).
 */
const VD_STORY_LOCK_VIOLATION_STAGE_TAG = "story_lock_violation" as const;

/**
 * Persists a rejected round's audit record (spec owner directive, W11.6 —
 * "push warning code VD_STORY_LOCK_VIOLATION with what changed"). The
 * rejected artifact `repairStage` itself already wrote is NEVER deleted
 * (append-only) — this is a SEPARATE record naming which stage/violations
 * caused the revert, so the rejected content stays inspectable.
 */
async function writeVerticalDramaStoryLockViolationArtifact(
  owner: EpisodeRunOwner,
  stage: "plan_episode_script" | "storyboard_shotgrid",
  violations: string[]
): Promise<void> {
  const [runRow] = await db
    .insert(verticalDramaEpisodeRuns)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      stage: VD_STORY_LOCK_VIOLATION_STAGE_TAG,
      runMode: "repair",
      status: "failed",
      nextAction: "none",
      artifactIds: [],
      warnings: [
        {
          code: VD_STORY_LOCK_VIOLATION,
          severity: "warning",
          message: violations.join("; "),
          targetStage: stage,
          repairable: false,
        },
      ],
      errors: [],
    })
    .returning({ id: verticalDramaEpisodeRuns.id });

  const [artifactRow] = await db
    .insert(verticalDramaRunArtifacts)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId: runRow.id,
      stage: VD_STORY_LOCK_VIOLATION_STAGE_TAG,
      jsonPayload: { stage, violations, rejectedAt: new Date().toISOString() },
      mediaAssetIds: null,
    })
    .returning({ id: verticalDramaRunArtifacts.id });

  await db
    .update(verticalDramaEpisodeRuns)
    .set({ artifactIds: [String(artifactRow.id)] })
    .where(eq(verticalDramaEpisodeRuns.id, runRow.id));
}

/**
 * Reverts the episode's live `script`/`storyboard` jsonb column back to
 * `priorContent` — mirrors the EXACT column-update pattern
 * `verticalDramaEpisodePipeline.ts`'s own real-generation paths use
 * (`runStage`'s `plan_episode_script`/`storyboard_shotgrid` overrides: same
 * tenant/user/series/episode-scoped `WHERE`, same `updatedAt` touch), just
 * invoked from the router instead of the pipeline class. Used ONLY by the
 * story-lock guard to "keep prior" after a rejected repair — mirrors the
 * existing overall-score regression guard's "supersede, never delete"
 * pattern: the rejected artifact `repairStage` already wrote stays in the
 * append-only ledger untouched (see
 * `writeVerticalDramaStoryLockViolationArtifact` above), only the LIVE
 * candidate column reverts.
 */
async function revertVerticalDramaEpisodeContent(
  owner: EpisodeRunOwner,
  stage: "plan_episode_script" | "storyboard_shotgrid",
  priorContent: Record<string, unknown> | null
): Promise<void> {
  const whereClause = and(
    eq(verticalDramaEpisodes.id, owner.episodeId),
    eq(verticalDramaEpisodes.tenantId, owner.tenantId),
    eq(verticalDramaEpisodes.userId, owner.userId),
    eq(verticalDramaEpisodes.seriesId, owner.seriesId)
  );
  if (stage === "plan_episode_script") {
    await db
      .update(verticalDramaEpisodes)
      .set({ script: priorContent, updatedAt: new Date() })
      .where(whereClause);
  } else {
    await db
      .update(verticalDramaEpisodes)
      .set({ storyboard: priorContent, updatedAt: new Date() })
      .where(whereClause);
  }
}

/**
 * Wraps a single stage repair call with the story-lock guard (spec owner
 * directive, W11.6 "Story Lock" — "the teeth", mechanical not prompt-only):
 *  1. when `storyLockEnabled` and `stage` is one of the two story-carrying
 *     stages, snapshots the PRIOR content and appends the execution-only
 *     hard-constraint block to the instruction (`appendVerticalDramaStoryLockRepairConstraint`);
 *  2. calls the real pipeline repair, unchanged args otherwise;
 *  3. re-snapshots the REPAIRED content and runs the matching deterministic
 *     guard (`evaluateVerticalDramaStoryLockScriptGuard`/
 *     `evaluateVerticalDramaStoryLockStoryboardGuard`);
 *  4. on violation, reverts the live column back to the prior snapshot and
 *     writes a `VD_STORY_LOCK_VIOLATION` audit record.
 *
 * No-op passthrough (unmodified instruction, no snapshot, never violates)
 * for any other stage or when `storyLockEnabled` is false — this is what
 * keeps every existing call site byte-identical when the flag is off or the
 * repaired group isn't script/storyboard (e.g. `dialogue_audio_plan`).
 *
 * Reused by BOTH the auto-improve loop's injected `repairStage` effect and
 * the v1 single-apply path (`applyQualityReviewSuggestions`'s non-loop
 * branch) — the spec's "loop AND single apply path" — so the guard can
 * never drift between the two callers. The loop's `tie_in` group already
 * maps onto a real `verticalDramaEpisodePipeline.repairStage(owner,
 * "plan_episode_script", ...)` call (see `verticalDramaQualityReviewApply.ts`'s
 * doc comment) — routing THAT call through this same wrapper means a tie-in
 * rewrite that inadvertently drifts the story is caught by the exact same
 * script guard, with no special-casing needed here.
 */
async function repairVerticalDramaStageWithStoryLockGuard(
  owner: EpisodeRunOwner,
  stage: VerticalDramaPipelineStage,
  instruction: string,
  storyLockEnabled: boolean,
  // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W1/W3,
  // router-wiring package, added 2026-07-11) — threaded straight through to
  // `repairStage`'s own `args.retentionHooksEnabled` (see that method's doc
  // comment: it threads into BOTH the `plan_episode_script` and
  // `storyboard_shotgrid` real-regeneration branches). Defaults to `false`
  // so every pre-existing caller of this wrapper (before this param existed)
  // stays byte-identical.
  retentionHooksEnabled: boolean = false
): Promise<{
  outcome: Awaited<ReturnType<typeof verticalDramaEpisodePipeline.repairStage>>;
  storyLockViolated: boolean;
}> {
  const isScriptStage = stage === "plan_episode_script";
  const isStoryboardStage = stage === "storyboard_shotgrid";
  const guarded = storyLockEnabled && (isScriptStage || isStoryboardStage);

  let priorScript: Record<string, unknown> | null = null;
  let priorStoryboard: Record<string, unknown> | null = null;
  if (guarded) {
    const before = await loadOwnedEpisode(owner);
    priorScript = (before.script as Record<string, unknown> | null) ?? null;
    priorStoryboard =
      (before.storyboard as Record<string, unknown> | null) ?? null;
  }

  const finalInstruction = storyLockEnabled
    ? appendVerticalDramaStoryLockRepairConstraint(instruction, stage)
    : instruction;

  const outcome = await verticalDramaEpisodePipeline.repairStage(owner, stage, {
    instruction: finalInstruction,
    retentionHooksEnabled,
  });

  if (!guarded) {
    return { outcome, storyLockViolated: false };
  }

  const after = await loadOwnedEpisode(owner);
  if (isScriptStage) {
    const repairedScript =
      (after.script as Record<string, unknown> | null) ?? null;
    const guard = evaluateVerticalDramaStoryLockScriptGuard(
      priorScript,
      repairedScript
    );
    if (guard.violated) {
      await revertVerticalDramaEpisodeContent(
        owner,
        "plan_episode_script",
        priorScript
      );
      await writeVerticalDramaStoryLockViolationArtifact(
        owner,
        "plan_episode_script",
        guard.violations
      );
      return { outcome, storyLockViolated: true };
    }
    return { outcome, storyLockViolated: false };
  }

  // `guarded` is only true here when `isScriptStage || isStoryboardStage`, and
  // the `isScriptStage` branch above already returned — so this is always
  // the storyboard stage.
  const repairedStoryboard =
    (after.storyboard as Record<string, unknown> | null) ?? null;
  const guard = evaluateVerticalDramaStoryLockStoryboardGuard(
    priorStoryboard,
    repairedStoryboard
  );
  if (guard.violated) {
    await revertVerticalDramaEpisodeContent(
      owner,
      "storyboard_shotgrid",
      priorStoryboard
    );
    await writeVerticalDramaStoryLockViolationArtifact(
      owner,
      "storyboard_shotgrid",
      guard.violations
    );
    return { outcome, storyLockViolated: true };
  }
  return { outcome, storyLockViolated: false };
}

/**
 * Translate a `VerticalDramaShotReferenceError` into the correct tRPC error
 * code — mirrors `verticalDramaCharacters.ts`'s `mapStockError`: cross-tenant/
 * cross-user/missing rows become NOT_FOUND so we never disclose another
 * owner's data; a deleted/unattachable media asset is a BAD_REQUEST (the
 * caller can fix the request, unlike a missing/foreign row).
 */
function mapShotReferenceError(err: unknown): never {
  if (err instanceof VerticalDramaShotReferenceError) {
    switch (err.reason) {
      case "episode_not_found":
      case "reference_not_found":
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      case "media_asset_not_found":
      case "media_asset_cross_tenant":
      case "media_asset_cross_user":
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referenced media asset not found",
        });
      case "media_asset_deleted":
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      default:
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
  }
  throw err;
}

/**
 * Batch-resolve `media_assets` ids referenced from `startFramePlan`/
 * `motionPromptPack` JSONB (start/end frame asset ids) into display URLs,
 * scoped to the caller's tenant+user so one series never leaks another
 * user's asset URLs. Returns a plain id->url map for the client to join by
 * shot/clip number against the raw plan data it already receives.
 */
async function resolveEpisodePlanAssetUrls(
  tenantId: string,
  userId: number,
  startFramePlan: unknown,
  motionPromptPack: unknown
): Promise<Record<string, { url: string; thumbnailUrl: string | null }>> {
  const ids = new Set<string>();
  const frames =
    (startFramePlan as VerticalDramaStartFramePlan | null)?.frames ?? [];
  for (const frame of frames) {
    if (frame?.approvedMediaAssetId)
      ids.add(String(frame.approvedMediaAssetId));
    // Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
    // plan.md`) — additive: folds each frame's persisted alternate-angle
    // "backup still" ids into the SAME batch query/flat id->url map this
    // function already builds (no new query). `?? []` contributes nothing
    // for every frame created before this field existed, so every
    // pre-existing caller/test stays byte-identical.
    for (const angleGridAssetId of frame?.angleGridAssetIds ?? []) {
      ids.add(String(angleGridAssetId));
    }
  }
  const clips =
    (motionPromptPack as VerticalDramaMotionPromptPack | null)?.clips ?? [];
  for (const clip of clips) {
    if (clip?.startFrameAssetId) ids.add(String(clip.startFrameAssetId));
    if (clip?.endFrameAssetId) ids.add(String(clip.endFrameAssetId));
  }
  if (ids.size === 0) return {};
  const numericIds = Array.from(ids)
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0);
  if (numericIds.length === 0) return {};

  const rows = await db
    .select({
      id: mediaAssets.id,
      originalUrl: mediaAssets.originalUrl,
      thumbnailUrl: mediaAssets.thumbnailUrl,
    })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, numericIds),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId)
      )
    );

  const result: Record<string, { url: string; thumbnailUrl: string | null }> =
    {};
  for (const row of rows) {
    if (!row.originalUrl) continue;
    result[String(row.id)] = {
      url: row.originalUrl,
      thumbnailUrl: row.thumbnailUrl ?? null,
    };
  }
  return result;
}

/**
 * Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
 * plan.md`) — group each frame's persisted `angleGridAssetIds` into resolved
 * `{ mediaAssetId, url }[]`, keyed by `shotNumber`, for `getEpisodeDetail`'s
 * response. Deliberately NOT a new query: `assetUrls` is the SAME flat map
 * `resolveEpisodePlanAssetUrls` already returned (its `ids` set now also
 * includes every frame's `angleGridAssetIds`, see that function's own doc
 * comment) — this is a pure in-memory re-grouping of already-fetched data,
 * following the existing "resolve every referenced id in one batch query,
 * client joins by id/shot number" pattern this router already uses for
 * `assetUrls` itself, rather than inventing a second per-frame query. A
 * frame with no `angleGridAssetIds` (every frame created before this field
 * existed) is simply absent from the returned record — never an empty-array
 * placeholder — so this stays a strictly additive, opt-in-by-presence key.
 */
function buildAngleGridAssetsByShotNumber(
  startFramePlan: VerticalDramaStartFramePlan | null,
  assetUrls: Record<string, { url: string; thumbnailUrl: string | null }>
): Record<number, Array<{ mediaAssetId: number; url: string }>> {
  const result: Record<number, Array<{ mediaAssetId: number; url: string }>> =
    {};
  for (const frame of startFramePlan?.frames ?? []) {
    const angleGridAssetIds = frame?.angleGridAssetIds;
    if (!angleGridAssetIds?.length) continue;
    const resolved = angleGridAssetIds
      .map(mediaAssetId => {
        const entry = assetUrls[String(mediaAssetId)];
        return entry ? { mediaAssetId, url: entry.url } : null;
      })
      .filter((entry): entry is { mediaAssetId: number; url: string } =>
        Boolean(entry)
      );
    if (resolved.length > 0) result[frame.shotNumber] = resolved;
  }
  return result;
}

/**
 * Batch-resolve arbitrary `media_assets` numeric ids to their display URL,
 * tenant + user scoped (never discloses another owner's asset URL). Used by
 * `generateVideoClip` to resolve the approved start-frame asset + a shot's
 * linked reference images into the URLs `mediaGenerationService.
 * generateVideoAsync`'s `referenceImageUrls` needs — the shot-references
 * service already returns joined thumbnail URLs for its OWN rows, but the
 * start-frame asset id (from `startFramePlan.frames[i].
 * approvedMediaAssetId`) is not itself a shot-reference row, so it needs
 * this separate general-purpose lookup.
 */
async function resolveMediaAssetUrlsByIds(
  tenantId: string,
  userId: number,
  assetIds: number[]
): Promise<Map<number, string>> {
  const uniqueIds = Array.from(new Set(assetIds)).filter(
    id => Number.isInteger(id) && id > 0
  );
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({ id: mediaAssets.id, originalUrl: mediaAssets.originalUrl })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, uniqueIds),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId)
      )
    );
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.originalUrl) map.set(row.id, row.originalUrl);
  }
  return map;
}

/**
 * Reference-mapping fix Phase 5c (`planning/vd-start-frame-reference-mapping/
 * plan.md`) — resolve a video clip's REQUIRED characters (unioned across
 * every source shot in `clip.sourceShotNumbers`, deduped, first-appearance
 * order — a consolidated/speaker-switch clip can span more than one shot) to
 * their current approved primary-portrait `media_assets` ids, for
 * `generateVideoClip` to auto-attach as extra video-generation references on
 * multi-image-reference models. "Required characters" comes from
 * `startFramePlan.frames[shotNumber].requiredCharacterRefs` — the SAME
 * ordering-truth source Phase 1 of this plan established for start-frame
 * image generation — never from the storyboard's own `characterIds` (that
 * field is DB-order, not authoritative; see this plan's RC1).
 *
 * Same portrait-resolution primitive
 * (`verticalDramaCharacterStockService.getPrimaryPortraitAssetId`) the
 * 2026-07-11 speaker-switch redesign already uses for
 * `clip.extraReferenceAssetIds` (~line 6345 of this file), so results stay
 * consistent with that existing path. Tolerant by design — a character key
 * with no matching roster row, or no approved portrait yet, is silently
 * skipped (same convention as `resolveShotVideoPromptCharacterReferenceImages`)
 * rather than throwing; the caller additionally wraps this whole call in a
 * try/catch since portrait enrichment must never block a paid render.
 */
async function resolveClipRequiredCharacterPortraitAssetIds(
  tenantId: string,
  userId: number,
  seriesId: number,
  startFramePlan: VerticalDramaStartFramePlan | null,
  sourceShotNumbers: number[]
): Promise<number[]> {
  const frameByShotNumber = new Map(
    (startFramePlan?.frames ?? []).map(frame => [frame.shotNumber, frame])
  );
  const orderedCharacterKeys: string[] = [];
  const seenCharacterKeys = new Set<string>();
  for (const shotNumber of sourceShotNumbers) {
    const requiredCharacterRefs =
      frameByShotNumber.get(shotNumber)?.requiredCharacterRefs ?? [];
    for (const characterKey of requiredCharacterRefs) {
      if (!characterKey || seenCharacterKeys.has(characterKey)) continue;
      seenCharacterKeys.add(characterKey);
      orderedCharacterKeys.push(characterKey);
    }
  }
  if (orderedCharacterKeys.length === 0) return [];

  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, orderedCharacterKeys)
      )
    );
  // Explicit annotations on both the callback param and its tuple return
  // (rather than the terser `rows.map(row => [row.characterKey, row])` this
  // file's OTHER `verticalDramaCharacters` queries use) — without them, this
  // particular `db.select(...).from(verticalDramaCharacters)...` query's
  // return type does not propagate through `.map()` into `new Map(...)`
  // (falls back to `{}`/`unknown`), a pre-existing `db`/drizzle
  // type-inference gap this table already exhibits elsewhere in this file
  // (see `resolveRequiredShotCharacterAttachmentManifest`'s identical
  // un-annotated pattern, which has the same gap — untouched here, out of
  // scope). Annotating both sides here keeps THIS new query's row/map types
  // sound without touching that pre-existing code.
  const characterRowByKey: Map<string, { id: number; characterKey: string }> =
    new Map(
      characterRows.map(
        (
          row: { id: number; characterKey: string }
        ): [string, { id: number; characterKey: string }] => [
          row.characterKey,
          row,
        ]
      )
    );

  const owner = { tenantId, userId, seriesId };
  const portraitAssetIds: number[] = [];
  for (const characterKey of orderedCharacterKeys) {
    const characterRow = characterRowByKey.get(characterKey);
    if (!characterRow) continue;
    const assetId = await verticalDramaCharacterStockService.getPrimaryPortraitAssetId(
      owner,
      characterRow.id
    );
    if (assetId != null) portraitAssetIds.push(assetId);
  }
  return portraitAssetIds;
}

/**
 * Resolve every character in the series to its current approved primary
 * portrait (if any), keyed by `characterKey` — the same key storyboard shots
 * reference in `characters`/`required_character_refs`. Lets the client show
 * "which character(s) does this shot need" directly on the shot card, so
 * identity-lock is visible/correctable per shot instead of only happening
 * invisibly inside generation calls.
 *
 * planning/vertical-drama-twin-variant-completeness/plan.md (W6 backend) —
 * additive relationship metadata (`parentCharacterId`/`variantLabel`/
 * `variantType`/`sharesFaceWithCharacterId`), same fields/projection
 * convention `verticalDramaCharacters.ts`'s `characterRowToDto` already uses
 * for the Characters tab. Purely additive: every field is `undefined` (not
 * present as an own-enumerable key with a value, but present in the type) for
 * a plain base character with no variant/twin relationships, so every
 * existing consumer that only reads `{characterId, name, portraitUrl}`
 * continues to work unchanged. Lets a per-shot character picker (built
 * later) group variant/twin entries under their parent instead of showing an
 * undifferentiated flat list of unrelated-looking character keys.
 */
async function resolveSeriesCharacterPortraits(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<
  Record<
    string,
    {
      characterId: string;
      name: string;
      portraitUrl: string | null;
      parentCharacterId?: string;
      variantLabel?: string;
      variantType?: "outfit" | "age_stage";
      sharesFaceWithCharacterId?: string;
    }
  >
> {
  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      parentCharacterId: verticalDramaCharacters.parentCharacterId,
      variantLabel: verticalDramaCharacters.variantLabel,
      variantType: verticalDramaCharacters.variantType,
      sharesFaceWithCharacterId:
        verticalDramaCharacters.sharesFaceWithCharacterId,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    );

  const portraitUrls = await Promise.all(
    characterRows.map((c: { id: number }) =>
      verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        c.id
      )
    )
  );

  const result: Record<
    string,
    {
      characterId: string;
      name: string;
      portraitUrl: string | null;
      parentCharacterId?: string;
      variantLabel?: string;
      variantType?: "outfit" | "age_stage";
      sharesFaceWithCharacterId?: string;
    }
  > = {};
  characterRows.forEach(
    (
      c: {
        id: number;
        characterKey: string;
        name: string;
        parentCharacterId: number | null;
        variantLabel: string | null;
        variantType: string | null;
        sharesFaceWithCharacterId: number | null;
      },
      i: number
    ) => {
      result[c.characterKey] = {
        characterId: String(c.id),
        name: c.name,
        portraitUrl: portraitUrls[i],
        parentCharacterId:
          c.parentCharacterId != null ? String(c.parentCharacterId) : undefined,
        variantLabel: c.variantLabel ?? undefined,
        variantType: (c.variantType as "outfit" | "age_stage" | null) ?? undefined,
        sharesFaceWithCharacterId:
          c.sharesFaceWithCharacterId != null
            ? String(c.sharesFaceWithCharacterId)
            : undefined,
      };
    }
  );
  return result;
}

/**
 * Resolve a shot's `requiredCharacterRefs` (character keys) to their
 * identity-lock reference URLs for one image generation call — shared by
 * `generateStartFrameImage` and `generateStartFrameAngleVariations`
 * (previously duplicated inline).
 *
 * F131Z (`verticalDramaSeriesCharacterRefV2`, added 2026-07-09 — see
 * `resolveVerticalDramaCharacterRefV2Flag`'s doc comment): when the tenant
 * flag is OFF, this is BYTE-IDENTICAL to the pre-F131Z behavior — each
 * character's approved primary portrait only, via
 * `verticalDramaCharacterStockService.getPrimaryPortraitUrl` (same call,
 * same order, same filter). This branch is kept as a literal duplicate of
 * the flag-on branch's portrait-only case (rather than always routing
 * through `getCharacterReferenceUrls` with `includeSheet: false`) so every
 * pre-existing test that mocks `verticalDramaCharacterStockService` as
 * `{ getPrimaryPortraitUrl: vi.fn() }` (no `getCharacterReferenceUrls`
 * stub) keeps passing unchanged — see
 * `verticalDramaEpisodes.characterRefV2.test.ts` for the flag-on coverage.
 *
 * When the flag is ON, each character additionally resolves its best
 * `character_sheet_turnaround`/`character_sheet_full` asset (via
 * `getCharacterReferenceUrls`) as a SECOND reference image. ORDERING
 * REQUIREMENT (budget fairness): with multiple characters in a shot, this
 * returns ALL portraits first, THEN all sheets (A-portrait, B-portrait, ...,
 * A-sheet, B-sheet, ...) — never interleaved per-character
 * (A-portrait, A-sheet, B-portrait, B-sheet, ...). `mergeAndTrimReferenceImageUrls`
 * (`verticalDramaProductTieIn.ts`) trims the merged
 * `[...characterRefUrls, ...productRefUrls]` list from the END once it
 * exceeds the resolved model's `maxReferenceImages`; if sheets were
 * interleaved per-character, a tight budget could trim off a LATER
 * character's portrait — the single most important identity-lock reference
 * — while an EARLIER character's less-critical sheet survives. Grouping all
 * portraits ahead of all sheets guarantees end-trimming always drops sheets
 * before it ever drops a portrait, no matter how many characters are in the
 * shot.
 */
interface ShotCharacterRefEntry {
  name: string;
  url: string;
  /**
   * Multi-character reference images (multi-character disambiguation fix,
   * `polished-toasting-gadget.md`) — the underlying query already selects
   * this (see `resolveShotCharacterReferenceEntries`'s `characterRows`
   * query below); surfaced here so
   * `resolveShotVideoPromptCharacterReferenceImages` can re-sort/dedup
   * entries by their owning character without a second query. Purely
   * additive — every pre-existing caller destructures only `.url`/`.name`
   * and is unaffected.
   */
  characterKey: string;
}

interface RequiredShotCharacterAttachmentManifest {
  primaryEntries: ShotCharacterRefEntry[];
  supplementaryEntries: ShotCharacterRefEntry[];
}

/**
 * Fail-closed character attachment resolver for paid start-frame renders.
 * Unlike the tolerant prompt-vision resolver below, this restores the exact
 * requiredCharacterRefs order and rejects missing/duplicate portraits before
 * credits can be reserved or a provider task can be submitted.
 */
async function resolveRequiredShotCharacterAttachmentManifest(
  tenantId: string,
  userId: number,
  seriesId: number,
  shotNumber: number,
  characterKeys: string[] | undefined,
): Promise<RequiredShotCharacterAttachmentManifest> {
  const orderedKeys = Array.from(
    new Set((characterKeys ?? []).map(key => key.trim()).filter(Boolean)),
  );
  if (orderedKeys.length === 0) {
    return { primaryEntries: [], supplementaryEntries: [] };
  }

  const rows = await db
    .select({
      id: verticalDramaCharacters.id,
      name: verticalDramaCharacters.name,
      characterKey: verticalDramaCharacters.characterKey,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, orderedKeys),
      ),
    );
  const rowByKey = new Map(rows.map(row => [row.characterKey, row]));
  const unknownKeys = orderedKeys.filter(key => !rowByKey.has(key));
  if (unknownKeys.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ไม่พบตัวละครในรายการสำหรับ ${unknownKeys.join(", ")}`,
    });
  }

  const includeSheets = await resolveVerticalDramaCharacterRefV2Flag(tenantId);
  const owner = { tenantId, userId, seriesId };
  const resolved = await Promise.all(
    orderedKeys.map(async characterKey => {
      const row = rowByKey.get(characterKey)!;
      const primaryPortraitUrl =
        await verticalDramaCharacterStockService.getPrimaryPortraitUrl(owner, row.id);
      const allReferenceUrls = includeSheets
        ? await verticalDramaCharacterStockService.getCharacterReferenceUrls(
            owner,
            row.id,
            { includeSheet: true },
          )
        : [];
      const supplementaryUrls = allReferenceUrls.filter(
        url => Boolean(url) && url !== primaryPortraitUrl,
      );
      return { row, primaryPortraitUrl, supplementaryUrls };
    }),
  );

  const missingNames = resolved
    .filter(item => !item.primaryPortraitUrl)
    .map(item => item.row.name || item.row.characterKey);
  if (missingNames.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ไม่พบภาพตัวละครที่อนุมัติแล้วสำหรับ ${missingNames.join(", ")}`,
    });
  }

  const primaryEntries = resolved.map(({ row, primaryPortraitUrl }) => ({
    name: row.name,
    url: primaryPortraitUrl!,
    characterKey: row.characterKey,
  }));
  if (new Set(primaryEntries.map(entry => entry.url)).size !== primaryEntries.length) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ตัวละครหลายคนใช้ภาพอ้างอิงเดียวกัน กรุณาตรวจสอบภาพตัวละครก่อน`,
    });
  }

  const supplementaryEntries = resolved.flatMap(({ row, supplementaryUrls }) =>
    supplementaryUrls.map(url => ({
      name: row.name,
      url,
      characterKey: row.characterKey,
    })),
  );
  return { primaryEntries, supplementaryEntries };
}

function assertRequiredCharacterReferenceCapacity(
  shotNumber: number,
  requiredCount: number,
  maxReferenceImages: number | undefined,
): void {
  if (maxReferenceImages === undefined || requiredCount <= maxReferenceImages) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `โมเดลนี้รองรับภาพอ้างอิงสูงสุด ${maxReferenceImages} ภาพ แต่ช็อต ${shotNumber} ต้องใช้ตัวละคร ${requiredCount} คน กรุณาเลือกโมเดลที่รองรับอย่างน้อย ${requiredCount} ภาพ`,
  });
}

/**
 * `formatIdentityLockedImagePrompt` (formerly defined here, a near-duplicate
 * of `@shared/verticalDramaSeries/characterIdentityMap.ts`'s canonical copy)
 * and its `assertRequiredIdentityBlockFits` length-cap guard were removed
 * again (`planning/vd-start-frame-reference-mapping/plan.md` Phase 3,
 * 2026-07-16) — a 2026-07-13 uncommitted change had re-added the code-side
 * bracket append after HEAD's 2026-07-11 skill-first-architecture removal,
 * which reintroduced RC2: the append's own attachment-order mapping could
 * silently CONTRADICT the mapping the skill already wrote in its own prose
 * (observed live, series 16 episode 66 shot 9 — prose said
 * `"ภาคิน (Image 1)"` / `"ไอริณ (Image 2)"` while the appended tail said
 * `"Image 1 = ไอริณ; Image 2 = ภาคิน"`). Every call site
 * (`generateStartFrameImage`, `generateStartFrameAngleVariations`) now uses
 * the planning/authoring skill's own prompt text UNMODIFIED — since
 * `vertical-drama-shot-start-frame-render/skill.md` /
 * `vertical-drama-shot-start-frame-prompt/skill.md` already author the full
 * identity-lock constraint (including the "Image N ↔ name" mapping) in their
 * own prose — and instead runs
 * `findCharacterImageIndexMappingMismatches` (the shared validator) as a
 * render-time fail-closed guard against the REAL attachment order right
 * before credits are reserved; see each mutation's own
 * `referenceMappingMismatches` block below. `stripExistingIdentityLockSuffix`
 * (imported from the shared module) is UNRELATED and still used below — it
 * is a back-compat safety net that strips a stale bracket-style suffix a
 * PRE-migration stored prompt may still carry, so it is never echoed back as
 * if it were story content (and so it never confuses the new validator with
 * a legacy code-authored claim).
 */

async function resolveShotCharacterReferenceEntries(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterKeys: string[] | undefined
): Promise<ShotCharacterRefEntry[]> {
  if (!characterKeys?.length) return [];
  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      name: verticalDramaCharacters.name,
      characterKey: verticalDramaCharacters.characterKey,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, characterKeys)
      )
    );
  const owner = { tenantId, userId, seriesId };
  const includeSheets = await resolveVerticalDramaCharacterRefV2Flag(tenantId);

  if (!includeSheets) {
    const entries = await Promise.all(
      characterRows.map(async (c: { id: number; name: string; characterKey: string }) => {
        const url = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
          owner,
          c.id
        );
        return url ? { name: c.name, url, characterKey: c.characterKey } : undefined;
      })
    );
    return entries.filter((e): e is ShotCharacterRefEntry => Boolean(e));
  }

  const perCharacterRefs = await Promise.all(
    characterRows.map(async (c: { id: number; name: string; characterKey: string }) => {
      const urls = await verticalDramaCharacterStockService.getCharacterReferenceUrls(
        owner,
        c.id,
        { includeSheet: true }
      );
      return urls.map(url => ({ name: c.name, url, characterKey: c.characterKey }));
    })
  );
  // Re-interleave into "all portraits, then all sheets" — see doc comment
  // above. Each entry in `perCharacterRefs` is that character's own
  // [portrait, sheet] pair (in that fixed order, per
  // `getCharacterReferenceUrls`), so index 0 is always the higher-priority
  // reference and index 1 (if present) the supplementary one.
  const portraits = perCharacterRefs
    .map(refs => refs[0])
    .filter((e): e is ShotCharacterRefEntry => Boolean(e));
  const sheets = perCharacterRefs
    .map(refs => refs[1])
    .filter((e): e is ShotCharacterRefEntry => Boolean(e));
  return [...portraits, ...sheets];
}

async function resolveShotCharacterReferenceUrls(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterKeys: string[] | undefined
): Promise<string[]> {
  const entries = await resolveShotCharacterReferenceEntries(
    tenantId,
    userId,
    seriesId,
    characterKeys
  );
  return entries.map(e => e.url);
}

/**
 * Cap on character reference portraits attached to a shot-video-prompt
 * vision call (multi-character disambiguation fix,
 * `polished-toasting-gadget.md`) — governs
 * `resolveShotVideoPromptCharacterReferenceImages` below. Deliberately a
 * SEPARATE constant from `VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX` (same value
 * today, 3) even though they happen to agree — that constant governs how
 * many speaker-switch SUB-SHOT WINDOWS a shot can split into
 * (`@shared/verticalDramaSeries/subShots.ts`), a different concern that
 * could reasonably diverge from this one later.
 */
const VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS = 3;

/**
 * Re-sort `resolveShotCharacterReferenceEntries`' arbitrary (no-`ORDER BY`)
 * return value into a caller-supplied `keysInOrder` order, keeping only the
 * FIRST entry per `characterKey` (always that character's portrait, never a
 * character-sheet supplementary image — per `resolveShotCharacterReferenceEntries`'s
 * own "all portraits before any sheets" ordering guarantee). Extracted
 * (`planning/vd-start-frame-reference-mapping/plan.md` Phase 1, RC1 fix,
 * 2026-07-16) from `resolveShotVideoPromptCharacterReferenceImages`'s own
 * inline re-sort so both that function AND `generateShotStartFramePrompt`'s
 * `character_reference_manifest` builder share exactly one ordering
 * implementation — the bug this fixes (RC1) was that the start-frame-prompt
 * path built its manifest straight from the DB's own arbitrary row order
 * instead of re-sorting like this, so the skill was sometimes told the WRONG
 * "Image N" index for a character relative to what the paid render actually
 * attaches later (`resolveRequiredShotCharacterAttachmentManifest`, which
 * always restores `requiredCharacterRefs` order).
 *
 * Defensively de-dupes `keysInOrder` itself too (in case a caller ever
 * passes the same key twice), so a caller-side cap can never be partly
 * consumed by the same character appearing more than once. Pure — no I/O.
 */
function reorderShotCharacterRefEntriesByKeyOrder(
  entries: readonly ShotCharacterRefEntry[],
  keysInOrder: readonly string[],
): ShotCharacterRefEntry[] {
  const firstEntryByCharacterKey = new Map<string, ShotCharacterRefEntry>();
  for (const entry of entries) {
    if (!firstEntryByCharacterKey.has(entry.characterKey)) {
      firstEntryByCharacterKey.set(entry.characterKey, entry);
    }
  }
  const ordered: ShotCharacterRefEntry[] = [];
  const seenCharacterKeys = new Set<string>();
  for (const characterKey of keysInOrder) {
    if (seenCharacterKeys.has(characterKey)) continue;
    seenCharacterKeys.add(characterKey);
    const entry = firstEntryByCharacterKey.get(characterKey);
    if (entry) ordered.push(entry);
  }
  return ordered;
}

/**
 * Resolve up to `VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS`
 * character reference portraits for a shot-video-prompt vision call
 * (multi-character disambiguation fix, `polished-toasting-gadget.md`) — one
 * per distinct required/speaking character, in `characterKeysInOrder`'s own
 * order, each resolved to a publicly-fetchable URL via `resolveReferenceUrl`
 * (`verticalDramaCharacterStockService.getPrimaryPortraitUrl` — reused here
 * through `resolveShotCharacterReferenceEntries` — returns a raw,
 * unresolved relative `media_assets.originalUrl`, the same correctness fix
 * `generateShotVideoPrompt`'s own `imageUrl` resolution already applies, a
 * few lines below this helper's own call site).
 *
 * Reuses `resolveShotCharacterReferenceEntries` (no new resolution path) —
 * that function's own return order is NOT reliably `characterKeysInOrder`
 * (the underlying query has no `ORDER BY`), so this re-sorts to match via
 * `reorderShotCharacterRefEntriesByKeyOrder` above.
 *
 * Never throws for a character with no approved portrait yet — that
 * character is silently omitted from the result, same tolerant convention
 * as `resolveShotLocationReferenceEntry` below.
 */
async function resolveShotVideoPromptCharacterReferenceImages(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterKeysInOrder: string[],
  publicUrl: string | undefined
): Promise<ShotVideoPromptCharacterReferenceImage[]> {
  if (characterKeysInOrder.length === 0) return [];
  const entries = await resolveShotCharacterReferenceEntries(
    tenantId,
    userId,
    seriesId,
    characterKeysInOrder
  );
  const ordered = reorderShotCharacterRefEntriesByKeyOrder(entries, characterKeysInOrder);
  return ordered
    .slice(0, VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS)
    .map((entry) => ({
      characterKey: entry.characterKey,
      name: entry.name,
      url: resolveReferenceUrl(entry.url, publicUrl),
    }));
}

/**
 * Resolve which `locationKey` governs a given shot (Phase D of
 * `planning/polished-toasting-gadget.md` — per-shot location override) —
 * precedence: (1) `overrideLocationKey` (the shot's own
 * `startFramePlan.frames[i].locationKey`, set via `setShotLocation`) when
 * present, else (2) the storyboard's own `distinct_locations[]` grouping
 * (snake_case, stored verbatim from the LLM's own JSON output — same reading
 * convention `verticalDramaEpisodePipeline.ts`'s `generateRealStartFramePlan`
 * already established for this exact field): finds which group's
 * `shot_numbers` contains `shotNumber` and returns that group's
 * `location_key`.
 *
 * Pure/no DB — shared by `resolveShotLocationReferenceEntry` below (start-
 * frame image-generation path, which resolves the FULL roster row +
 * reference URL for whatever key this returns) and the video-prompt/
 * video-render call sites in `generateShotVideoPrompt`/
 * `generateAndPersistSplitShotVideoPrompt`/`generateVideoClip` (which only
 * need the bare key, to feed `resolveShotVideoPromptLocationReferenceImage`/
 * `resolveShotLocationReferenceAssetId`) — a single shared precedence
 * function so all of a shot's location-reference call sites can never drift
 * out of sync with each other. Returns `undefined` (never throws) when
 * neither an override nor a matching storyboard group resolves a key.
 */
function resolveEffectiveShotLocationIdentity(
  storyboard: unknown,
  shotNumber: number,
  overrideLocationKey?: string
): VerticalDramaLocationIdentity | undefined {
  if (overrideLocationKey) {
    return { locationKey: overrideLocationKey, name: "" };
  }

  const distinctLocationGroups = Array.isArray(
    (storyboard as Record<string, unknown> | null)?.distinct_locations
  )
    ? ((storyboard as Record<string, unknown>).distinct_locations as Array<
        Record<string, unknown>
      >)
    : [];
  if (distinctLocationGroups.length === 0) return undefined;

  const matchingGroup = distinctLocationGroups.find(group => {
    const shotNumbers = Array.isArray(group.shot_numbers) ? group.shot_numbers : [];
    return shotNumbers.some(n => Number(n) === shotNumber);
  });
  if (typeof matchingGroup?.location_key !== "string") return undefined;
  return {
    locationKey: matchingGroup.location_key,
    name:
      typeof matchingGroup.location_name === "string"
        ? matchingGroup.location_name
        : "",
  };
}

function resolveEffectiveShotLocationKey(
  storyboard: unknown,
  shotNumber: number,
  overrideLocationKey?: string
): string | undefined {
  return resolveEffectiveShotLocationIdentity(
    storyboard,
    shotNumber,
    overrideLocationKey
  )?.locationKey;
}

/**
 * Resolve a single location roster row (tenant/user/series scoped) by its
 * canonical identity — the shared low-level lookup used by every location-
 * reference resolver below (`resolveShotLocationReferenceEntry`,
 * `resolveShotVideoPromptLocationReferenceImage`,
 * `resolveShotLocationReferenceAssetId`), mirroring how
 * `resolveShotCharacterReferenceEntries` is the single shared row-lookup
 * every character-reference resolver builds on. It preserves the original
 * exact-key query as the fast path, then uses the shared bounded name
 * fallback only for legacy storyboard identities. Returns `undefined`
 * (never throws) when no roster row resolves.
 */
async function resolveLocationRosterRowByIdentity(
  tenantId: string,
  userId: number,
  seriesId: number,
  locationIdentity: VerticalDramaLocationIdentity
): Promise<
  { id: number; name: string; data: unknown } | undefined
> {
  const [exactKeyRow] = await db
    .select({
      id: verticalDramaLocations.id,
      name: verticalDramaLocations.name,
      data: verticalDramaLocations.data,
    })
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, tenantId),
        eq(verticalDramaLocations.userId, userId),
        eq(verticalDramaLocations.seriesId, seriesId),
        eq(
          verticalDramaLocations.locationKey,
          locationIdentity.locationKey
        )
      )
    )
    .limit(1);
  if (exactKeyRow || !locationIdentity.name) return exactKeyRow;

  const locationRows = await db
    .select({
      id: verticalDramaLocations.id,
      locationKey: verticalDramaLocations.locationKey,
      name: verticalDramaLocations.name,
      data: verticalDramaLocations.data,
    })
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, tenantId),
        eq(verticalDramaLocations.userId, userId),
        eq(verticalDramaLocations.seriesId, seriesId)
      )
    );
  return resolveStoryboardLocationRoster<(typeof locationRows)[number]>(
    locationRows,
    locationIdentity.locationKey,
    locationIdentity.name
  );
}

/**
 * Resolve THIS shot's location reference entry (Phase 2 of
 * `planning/polished-toasting-gadget.md` — location visual bible) —
 * singular counterpart to `resolveShotCharacterReferenceEntries` above (one
 * shot has at most ONE location, not a list). Resolves the shot's effective
 * location identity via `resolveEffectiveShotLocationIdentity` (Phase D:
 * honors the
 * per-shot `overrideLocationKey` first, else falls back to the storyboard's
 * `distinct_locations[]` grouping — see that function's own doc comment),
 * looks it up against the series' `vertical_drama_locations` roster via
 * `resolveLocationRosterRowByIdentity`, then resolves the location's current
 * approved reference image via
 * `verticalDramaLocationStockService.getPrimaryReferenceUrl`.
 *
 * Purely additive and tolerant — returns `null` (never throws) when there is
 * no override AND no `distinct_locations` data, no matching group for this
 * shot, or no roster row for the resolved `locationKey` (e.g. a storyboard
 * generated before this feature existed, or before
 * `reconcileEpisodeLocations` ran for this episode). Deliberately returns
 * BEFORE touching the database in every one of those tolerant cases, so a
 * shot/episode with no location data (and no override) adds zero new DB
 * calls — this is what keeps every pre-existing
 * `generateStartFrameImage`/`generateStartFrameAngleVariations`/
 * `generateShotStartFramePrompt` test (none of whose fixtures carry a
 * `storyboard`/override field) byte-identical.
 */
async function resolveShotLocationReferenceEntry(
  tenantId: string,
  userId: number,
  seriesId: number,
  storyboard: unknown,
  shotNumber: number,
  overrideLocationKey?: string
): Promise<
  | { url?: string; name?: string; description?: string; hasReferenceImage: boolean }
  | null
> {
  const locationIdentity = resolveEffectiveShotLocationIdentity(
    storyboard,
    shotNumber,
    overrideLocationKey
  );
  if (!locationIdentity) return null;

  const locationRow = await resolveLocationRosterRowByIdentity(
    tenantId,
    userId,
    seriesId,
    locationIdentity
  );
  if (!locationRow) return null;

  const description =
    typeof (locationRow.data as Record<string, unknown> | null)?.description === "string"
      ? ((locationRow.data as Record<string, unknown>).description as string)
      : undefined;

  const url = await verticalDramaLocationStockService.getPrimaryReferenceUrl(
    { tenantId, userId, seriesId },
    locationRow.id
  );

  return {
    url,
    name: locationRow.name,
    description,
    hasReferenceImage: Boolean(url),
  };
}

/**
 * Resolve THIS shot's video-prompt location reference IMAGE (Phase E of
 * `planning/polished-toasting-gadget.md` — location visual bible) — mirrors
 * `resolveShotVideoPromptCharacterReferenceImages` above, but for the single
 * location a shot belongs to (a shot has at most ONE location, never a
 * list). Takes the already-resolved location identity directly (the CALLER
 * resolves it via `resolveEffectiveShotLocationIdentity`, honoring the
 * shot's override) rather than `shotNumber`/`storyboard` — same "caller
 * resolves which identity, this function resolves its reference data" split
 * `resolveShotVideoPromptCharacterReferenceImages` uses for characters.
 * Reuses `resolveLocationRosterRowByIdentity` then
 * `verticalDramaLocationStockService.getPrimaryReferenceUrl`, mirroring
 * `resolveShotLocationReferenceEntry`'s own resolution chain exactly, and
 * applies `resolveReferenceUrl` the same way
 * `resolveShotVideoPromptCharacterReferenceImages` does for portraits (the
 * vision call needs a publicly-fetchable URL, not a raw stored path).
 *
 * Never throws — returns `null` when `locationKey` is absent/undefined, no
 * roster row exists yet for it, or it has no approved reference image.
 */
async function resolveShotVideoPromptLocationReferenceImage(
  tenantId: string,
  userId: number,
  seriesId: number,
  locationIdentity: VerticalDramaLocationIdentity | undefined,
  publicUrl: string | undefined
): Promise<{ url: string; name?: string } | null> {
  if (!locationIdentity) return null;
  const locationRow = await resolveLocationRosterRowByIdentity(
    tenantId,
    userId,
    seriesId,
    locationIdentity
  );
  if (!locationRow) return null;
  const url = await verticalDramaLocationStockService.getPrimaryReferenceUrl(
    { tenantId, userId, seriesId },
    locationRow.id
  );
  if (!url) return null;
  return { url: resolveReferenceUrl(url, publicUrl), name: locationRow.name };
}

/**
 * Resolve the numeric `media_assets` id of a shot's location's primary
 * reference image (Phase E of `planning/polished-toasting-gadget.md`) — the
 * `generateVideoClip` sibling of `resolveShotVideoPromptLocationReferenceImage`
 * (which resolves a fetchable URL for the video-PROMPT vision call);
 * `generateVideoClip` instead batches every reference through
 * `resolveMediaAssetUrlsByIds` alongside the start frame/character/shot
 * references, so this resolves an ASSET ID rather than a URL. Reuses
 * `resolveLocationRosterRowByIdentity` then
 * `verticalDramaLocationStockService.getPrimaryReferenceAssetId`.
 *
 * Never throws — returns `undefined` when `locationKey` is absent/undefined,
 * no roster row exists yet for it, or it has no approved reference image.
 */
async function resolveShotLocationReferenceAssetId(
  tenantId: string,
  userId: number,
  seriesId: number,
  locationIdentity: VerticalDramaLocationIdentity | undefined
): Promise<number | undefined> {
  if (!locationIdentity) return undefined;
  const locationRow = await resolveLocationRosterRowByIdentity(
    tenantId,
    userId,
    seriesId,
    locationIdentity
  );
  if (!locationRow) return undefined;
  return verticalDramaLocationStockService.getPrimaryReferenceAssetId(
    { tenantId, userId, seriesId },
    locationRow.id
  );
}

/**
 * Resolve the series' full location roster for the `getEpisodeDetail`
 * payload (Phase D of `planning/polished-toasting-gadget.md` — location
 * visual bible), each annotated with its current approved reference image
 * URL (if any) — the location-roster sibling of `characterPortraits`
 * (`resolveSeriesCharacterPortraits` above), consumed by the storyboard
 * frontend to render a real location thumbnail per shot and to populate a
 * location-override picker (`setShotLocation`). Composed entirely from
 * `verticalDramaLocationStockService.listRows` (Phase A/B's own roster +
 * primary-reference query) — no new query shape is introduced here.
 *
 * `primaryReferenceUrl` is surfaced RAW, exactly like `characterPortraits`'
 * own `portraitUrl` field (never passed through `resolveReferenceUrl` —
 * that resolver's job is only to make a URL fetchable by an EXTERNAL
 * provider/LLM call, not to reshape a URL for the browser, which already
 * renders a relative `/uploads/...`/`/api/storage/...` path fine against its
 * own origin).
 *
 * Never throws (same tolerant convention this whole location-visual-bible
 * feature follows — see `resolveShotLocationReferenceEntry`'s identical doc-
 * comment rationale): any query failure resolves to `[]`, same as a series
 * with a genuinely empty location roster, so this can never fail the read-
 * only `getEpisodeDetail` procedure over what is a purely additive/optional
 * data source.
 */
async function resolveSeriesEpisodeLocations(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<Array<{ locationKey: string; name: string; primaryReferenceUrl?: string }>> {
  try {
    const rows = await verticalDramaLocationStockService.listRows({
      tenantId,
      userId,
      seriesId,
    });
    return rows.map(row => ({
      locationKey: row.locationKey,
      name: row.name,
      primaryReferenceUrl: row.primaryReferenceUrl,
    }));
  } catch (err) {
    debugError(
      "verticalDramaEpisodes.getEpisodeDetail",
      `episode locations lookup failed (seriesId=${seriesId})`,
      err
    );
    return [];
  }
}

/**
 * Resolve a set of character keys to their identity-descriptor rows
 * (2026-07-07 non-human-character-vanishing fix) — `name`/`role` +
 * `data.description`, the same shape `verticalDramaEpisodePipeline.ts`'s
 * `generateRealStartFramePlan` feeds into `buildCharacterIdentityMapBlock`.
 * Used to re-inject the identity map into call sites that build a fresh
 * image/video prompt directly from `frame.imagePrompt` (rather than through
 * the pipeline), e.g. the multi-angle grid prompt and the shot-video-prompt
 * service context — so those prompts also know a required character's real
 * identity (species/age) instead of just a bare `characterKey`.
 */
async function resolveShotCharacterIdentitySources(
  tenantId: string,
  seriesId: number,
  characterKeys: string[] | undefined
): Promise<VerticalDramaCharacterDescriptorSource[]> {
  if (!characterKeys?.length) return [];
  const rows = await db
    .select({
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
      data: verticalDramaCharacters.data,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, characterKeys)
      )
    );
  return rows.map((row: (typeof rows)[number]) => ({
    characterKey: row.characterKey,
    name: row.name,
    role: row.role,
    description:
      typeof (row.data as Record<string, unknown> | null)?.description ===
      "string"
        ? ((row.data as Record<string, unknown>).description as string)
        : undefined,
  }));
}

/**
 * Load every known speaker label for a series — both `characterKey` (the
 * stable app-level id, e.g. `หนูนา`) and `name` (the display name, which the
 * script's freeform `"Speaker: line"` strings sometimes use instead of the
 * key) — as a single case-insensitive-trimmed lookup set. Used by
 * `resolveShotDialogueLines`'s script-fallback parser (2026-07-07
 * "unusable dialogue" fix) to distinguish a genuine character speaking from
 * an unattributable stage-direction/sound-cue fragment — see that function's
 * filter doc comment for the `เสียง…` exception.
 */
async function loadSeriesKnownSpeakerKeys(
  tenantId: string,
  seriesId: number
): Promise<Set<string>> {
  const rows = await db
    .select({
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    );
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.characterKey) keys.add(row.characterKey.trim());
    if (row.name) keys.add(row.name.trim());
  }
  return keys;
}

/**
 * Resolve a shot's `productReferenceAssetIds` (product tie-in) to reference
 * URLs. Unlike character refs, product tie-in assets are stored as plain
 * URLs directly on the frame (populated by the pipeline's
 * `start_frame_render_plan` post-processing from the series' `productTieIn`
 * config — see `verticalDramaEpisodePipeline.ts`), not `media_assets.id`
 * rows, so no DB lookup is needed — just pass through whatever is already a
 * plausible URL. Defensive against manually-edited/legacy values.
 */
function resolveShotProductReferenceUrls(
  productReferenceAssetIds: string[] | undefined
): string[] {
  if (!productReferenceAssetIds?.length) return [];
  return productReferenceAssetIds.filter(
    (u): u is string => typeof u === "string" && /^https?:\/\//.test(u)
  );
}

type ShotDialogueLine = {
  characterKey?: string;
  lineTh: string;
  emotion?: string;
  delivery?: {
    tone?: string;
    pace?: string;
    pauses?: string;
    texture?: string;
  };
  subtext?: string;
  /**
   * Additive (2026-07-07 unusable-dialogue fix) — set ONLY by the
   * script-fallback branch (source 3) below, so the UI can surface a subtle
   * "from the script — check it sounds natural" hint on lines that were
   * never reviewed by a human or a dedicated dialogue-planning pass.
   * `undefined` for source 1/2 (already-synced clip dialogue /
   * `dialogueAudioPlan`), which are considered reviewed/authoritative.
   */
  origin?: "script_fallback";
};

/**
 * Shared mapping (planning/`polished-toasting-gadget.md`): a deep-drafted
 * shot's canonical `{speaker, line, delivery}` dialogue line
 * (`VdDeepDraftShotDialogueLine` — the Overview page's user-editable source
 * of truth, `verticalDramaStoryBible.ts`) to this router's own
 * `ShotDialogueLine` shape. Used by BOTH `resolveShotDialogueLines`'s new
 * source 0 below AND `regenerateClipDialogue`'s sync-only short-circuit — a
 * single function so the two call sites can never drift apart.
 *
 * `characterKey`/`delivery` follow the EXACT same conventions already
 * established by source 3a below (deterministic beat-index mapping, itself
 * reading the same `{speaker, line, delivery}` shape from
 * `script.structure.beats[].dialogue_lines[]`): `characterKey` is stored
 * VERBATIM as the speaker label (no consumer resolves it to a real character
 * id — only rendered as a label / used to detect a speaker switch), and the
 * freeform `delivery` STRING is folded into the structured shape's `tone`
 * field (the closest single-field bridge between the two conventions; the
 * original text is preserved verbatim in `tone`, not lost).
 */
function mapDeepDraftDialogueLineToShotDialogueLine(
  line: VdDeepDraftShotDialogueLine
): ShotDialogueLine {
  return {
    characterKey: line.speaker,
    lineTh: line.line,
    delivery: line.delivery ? { tone: line.delivery } : undefined,
  };
}

/**
 * Resolve the dialogue line(s) for ONE shot's per-shot video prompt
 * (`generateShotVideoPrompt`) — a fallback chain, tried in order, since a
 * real Thai/whatever-locale dialogue line for this shot can live in any of
 * three places depending on which pipeline stages the episode has actually
 * run (2026-07-06 fix: previously this sourced `dialogueAudioPlan` ONLY,
 * so every episode that skipped that stage — which in practice is ALL of
 * them today, see the bug report — silently produced a "no dialogue"
 * instruction downstream even though the script already has real dialogue
 * for every scene):
 *
 * 1. `matchingClip.dialogue` — already-synced/persisted dialogue on the
 *    motion-pack clip (e.g. from a previous `syncDialogueOntoMotionPromptClips`
 *    run, or a prior manual edit). Most authoritative: someone already
 *    resolved this shot's line and it should not be overwritten by a
 *    lower-fidelity source.
 * 2. `dialogueAudioPlan.dialogue_lines[]` — the dedicated dialogue-planning
 *    stage's output, matched by `shot_number` or the matching clip's
 *    `clip_number` (pre-existing logic, unchanged).
 * 3. Script's dialogue-complete beats, in TWO possible forms (spec §7.7.2
 *    Layer 3/4, section-13, added 2026-07-07 — additive, sources 1/2
 *    unchanged):
 *    a. DETERMINISTIC beat-index mapping — when the caller passes this
 *       shot's persisted `sourceBeatIndexes` (the W1-B shotgrid schema's
 *       per-shot shot→beat attribution) AND `script.structure.beats[]` has
 *       dialogue-complete entries (`beats[i].dialogue_lines[]`, spec §7.7.2
 *       Layer 2 — "dialogue is authored AT SCRIPT STAGE"), the referenced
 *       beats' own structured lines are used directly. Preferred over (b)
 *       whenever it has ANY usable line, since it is an exact, persisted
 *       shot→beat attribution rather than a guess.
 *    b. `script.scene_dialogue_summary[].dialogue_lines[]` — the script
 *       stage's per-scene FREEFORM dialogue (always populated once the
 *       script exists, well before dialogue-planning or storyboard runs).
 *       There is no persisted shot→scene index for this legacy shape, so
 *       the shot is mapped onto the scene list proportionally by its
 *       position among the episode's shots (best-effort; good enough to
 *       recover real Thai dialogue instead of silence) — this remains the
 *       LAST-RESORT fallback (used when (a) is unavailable/empty), keeps
 *       its `script_fallback` origin tag, and stays a legacy-with-warning
 *       path per spec §7.7.2 hard rule 2 ("`script_fallback` parsing
 *       becomes legacy-with-warning").
 *
 * Returns `[]` (never throws) when none of the sources above has anything
 * usable for this shot — the caller/skill then decides whether to write a
 * short line itself (only when the shot's description implies speech).
 *
 * Script-fallback parser cleanup (2026-07-07 "unusable dialogue" fix): the
 * script stage's `scene_dialogue_summary[].dialogue_lines[]` are freeform
 * strings the script-writing LLM produced, and occasionally include a
 * stage-direction/sound-cue fragment rather than real spoken dialogue (bug
 * report repro: `เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า`). Every parsed line
 * now goes through `isDroppableScriptDialogueFragment` before being kept:
 * a line IS dropped only when it has NO speaker label attributable to a
 * known series character (via `knownSpeakerKeys`, checked against both
 * `characterKey` and display `name`) AND its text itself looks like a bare
 * sound/ellipsis fragment rather than a complete sentence. A line whose
 * spoken text itself starts with a sound cue such as `เสียง…` is dropped even
 * if a speaker label was attached, because that is still stage direction, not
 * dialogue.
 */
export function resolveShotDialogueLines(params: {
  shotNumber: number;
  matchingClip?: { dialogue?: ShotDialogueLine[]; clipNumber: number };
  dialogueAudioPlan: { dialogue_lines?: Array<Record<string, unknown>> } | null;
  script: Record<string, unknown> | null;
  storyboardShotCount: number | undefined;
  /**
   * Case-sensitive set of every known speaker label for this series (both
   * `characterKey` and display `name`) — used ONLY by the script-fallback
   * branch's junk-fragment filter (source 3). Optional/omitted preserves the
   * exact pre-existing behavior (every non-empty parsed line is kept) for
   * callers that haven't been updated to pass it yet, and for direct
   * source-1/source-2 hits which never run this filter at all.
   */
  knownSpeakerKeys?: ReadonlySet<string>;
  /**
   * Story-density reform (spec §7.7.2 Layer 3/4, section-13, added
   * 2026-07-07) — this shot's persisted `sourceBeatIndexes`: 0-based indexes
   * into `script.structure.beats[]` (the W1-B shotgrid schema's per-shot
   * shot→beat attribution — `VerticalDramaPerShotSpeechBudget
   * .sourceBeatIndexes`, `@shared/verticalDramaSeries/contentBudget`).
   * Optional/omitted (or empty) preserves the exact pre-existing behavior
   * (falls straight through to the positional guess, source 3b) — the
   * caller only passes this when the `verticalDramaSeriesSpeechBudget` flag
   * is on AND the storyboard shot actually carries the field (today's
   * shotgrid output does not populate it yet; this parameter is forward-
   * ready wiring for when it does).
   */
  sourceBeatIndexes?: number[];
  /**
   * Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
   * — this shot's deep-drafted entry (`bible.breakdownVersions[active]
   * .items[episode].shotDrafts[shot]`, the Overview page's user-EDITABLE
   * canonical dialogue source), when the caller has already resolved one.
   * The caller resolves this (never a DB/import call inside this pure
   * function — same "caller resolves, this function only consumes" contract
   * as `matchingClip` above), gated by the `verticalDramaSeriesDeepStoryDrafts`
   * tenant flag. `undefined` (every pre-existing caller that hasn't adopted
   * this yet) or `null` (flag off, or this series/episode/shot has no deep
   * draft) both preserve the exact pre-existing fallback chain below,
   * byte-identical — this parameter's mere PRESENCE in the call signature
   * changes nothing; only an actually-resolved non-null value with content
   * changes the result.
   */
  deepDraftShot?: VdDeepDraftShotDraft | null;
}): ShotDialogueLine[] {
  const {
    shotNumber,
    matchingClip,
    dialogueAudioPlan,
    script,
    storyboardShotCount,
    knownSpeakerKeys,
    sourceBeatIndexes,
    deepDraftShot,
  } = params;

  // 0. Deep-drafted canonical dialogue (planning/`polished-toasting-gadget.md`)
  // — the Overview page's user-editable source of truth, when the caller has
  // resolved one. Tried BEFORE every other source (including the previously
  // most-authoritative source 1, `matchingClip.dialogue`) because a
  // previously-persisted WRONG value on the clip must never keep winning over
  // dialogue a human has since edited/confirmed on the Overview page (the
  // exact bug this fix addresses — see this function's own updated doc
  // comment above for the full incident).
  if (deepDraftShot) {
    // Explicit "intentionally no speech" — never guess a line for it, even
    // if a lower-fidelity fallback source below has something.
    if (deepDraftShot.silence_intent) return [];
    if (deepDraftShot.dialogue_lines.length > 0) {
      return deepDraftShot.dialogue_lines
        .map(mapDeepDraftDialogueLineToShotDialogueLine)
        .filter(l => l.lineTh.trim().length > 0);
    }
    // Deep-draft entry exists but carries NEITHER `dialogue_lines` NOR
    // `silence_intent` (an in-progress/never-drafted shot) — fall through to
    // the pre-existing chain below exactly as if `deepDraftShot` were absent.
  }

  // 1. Already-synced clip dialogue — most authoritative (among the
  // pre-existing sources; source 0 above always wins when present).
  if (matchingClip?.dialogue && matchingClip.dialogue.length > 0) {
    return matchingClip.dialogue.filter(l => l.lineTh?.trim().length > 0);
  }

  // 2. `dialogueAudioPlan.dialogue_lines[]` (pre-existing logic, unchanged).
  const rawDialogueLines = Array.isArray(dialogueAudioPlan?.dialogue_lines)
    ? (dialogueAudioPlan!.dialogue_lines as Array<Record<string, unknown>>)
    : [];
  const planLines = rawDialogueLines
    .filter(line => {
      const lineShotNumber = line.shot_number;
      const clipNumber = line.clip_number;
      if (typeof lineShotNumber === "number" && lineShotNumber === shotNumber)
        return true;
      if (
        matchingClip &&
        typeof clipNumber === "number" &&
        clipNumber === matchingClip.clipNumber
      )
        return true;
      return false;
    })
    .map(line => ({
      characterKey:
        typeof line.speaker_character_id === "string"
          ? line.speaker_character_id
          : undefined,
      lineTh: typeof line.dialogue_line === "string" ? line.dialogue_line : "",
      emotion: typeof line.emotion === "string" ? line.emotion : undefined,
      delivery: line.delivery as
        | { tone?: string; pace?: string; pauses?: string; texture?: string }
        | undefined,
      subtext: typeof line.subtext === "string" ? line.subtext : undefined,
    }))
    .filter(l => l.lineTh.trim().length > 0);
  if (planLines.length > 0) return planLines;

  // 3a. DETERMINISTIC beat-index mapping (spec §7.7.2 Layer 3/4,
  // section-13, added 2026-07-07) — preferred over the positional guess
  // (3b) below whenever this shot carries `sourceBeatIndexes` AND the
  // referenced beat(s) have dialogue-complete `dialogue_lines[]`. Additive:
  // never runs at all when `sourceBeatIndexes` is omitted/empty, so a
  // caller that hasn't adopted it (or the flag is off) falls straight
  // through to the unchanged positional path.
  const scriptBeats = Array.isArray(
    (script as { structure?: { beats?: unknown } } | null)?.structure?.beats
  )
    ? (script as { structure: { beats: Array<Record<string, unknown>> } })
        .structure.beats
    : [];
  if (
    sourceBeatIndexes &&
    sourceBeatIndexes.length > 0 &&
    scriptBeats.length > 0
  ) {
    const beatMappedLines: ShotDialogueLine[] = [];
    for (const beatIndex of sourceBeatIndexes) {
      const beat = scriptBeats[beatIndex];
      const beatDialogueLines = Array.isArray(beat?.dialogue_lines)
        ? (beat!.dialogue_lines as Array<Record<string, unknown>>)
        : [];
      for (const line of beatDialogueLines) {
        const lineTh = typeof line.line === "string" ? line.line.trim() : "";
        if (!lineTh) continue;
        beatMappedLines.push({
          characterKey:
            typeof line.speaker === "string" ? line.speaker : undefined,
          lineTh,
          // `scriptDialogueLineSchema.delivery` (verticalDramaScriptGeneration.ts)
          // is a short freeform STRING (e.g. "urgent whisper"), unlike this
          // shape's own structured `{ tone, pace, pauses, texture }` object —
          // folded into `tone` as the closest single-field bridge between
          // the two conventions (documented adaptation, not a data loss:
          // the original text is preserved verbatim in `tone`).
          delivery:
            typeof line.delivery === "string"
              ? { tone: line.delivery }
              : undefined,
          subtext: typeof line.subtext === "string" ? line.subtext : undefined,
          // Deliberately NO `origin: "script_fallback"` tag — this is a
          // structured, script-stage-authored line (spec §7.7.2 Layer 2:
          // "dialogue is authored AT SCRIPT STAGE"), not a freeform-parsed
          // guess, so it does not carry the legacy-path warning that (3b)
          // below always attaches.
        });
      }
    }
    if (beatMappedLines.length > 0) return beatMappedLines;
  }

  // 3b. Script's `scene_dialogue_summary[].dialogue_lines[]` — proportional
  // shot→scene mapping (no persisted index exists). Last-resort fallback,
  // reached when (3a) is unavailable or produced nothing usable.
  const sceneDialogueSummary = Array.isArray(script?.scene_dialogue_summary)
    ? (script!.scene_dialogue_summary as Array<Record<string, unknown>>)
    : [];
  if (sceneDialogueSummary.length === 0) return [];

  const shotCount =
    storyboardShotCount && storyboardShotCount > 0 ? storyboardShotCount : 9;
  const sceneIndex = Math.min(
    sceneDialogueSummary.length - 1,
    Math.floor(((shotNumber - 1) / shotCount) * sceneDialogueSummary.length)
  );
  const scene = sceneDialogueSummary[sceneIndex];
  const rawLines = Array.isArray(scene?.dialogue_lines)
    ? (scene!.dialogue_lines as unknown[])
    : [];

  return rawLines
    .map((raw): ShotDialogueLine | null => {
      if (typeof raw !== "string" || !raw.trim()) return null;
      // Script lines are freeform strings like `หนูนา: "ยายทวดจัน…"` —
      // split on the first colon to recover a speaker label when present.
      const colonIndex = raw.indexOf(":");
      if (colonIndex > 0 && colonIndex < 40) {
        return {
          characterKey: raw.slice(0, colonIndex).trim(),
          lineTh: raw
            .slice(colonIndex + 1)
            .trim()
            .replace(/^[""]|[""]$/g, ""),
          origin: "script_fallback",
        };
      }
      return { lineTh: raw.trim(), origin: "script_fallback" };
    })
    .filter((l): l is ShotDialogueLine => l !== null && l.lineTh.length > 0)
    .filter(l => !isDroppableScriptDialogueFragment(l, knownSpeakerKeys));
}

/**
 * Sound/ellipsis markers that open (or make up the entirety of) a
 * stage-direction fragment rather than real spoken dialogue — e.g. `เสียง…`
 * ("[a] sound..."), `SFX:`, a bare run of ellipses, or a fragment shorter
 * than a sensible minimum once the markers are stripped. See
 * `isDroppableScriptDialogueFragment`'s doc comment for how this is combined
 * with the speaker-attribution check.
 */
const SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN =
  /^(?:เสียง(?=$|[\s:.…])|sfx\b|sound effect\b|\(sfx\))[\s:.…]*[…]?/i;
const SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN =
  /^(?:เสียง|sfx\b|sound effect\b|\(sfx\))/i;

/** A sensible minimum length (in characters, after trimming/markers) for a fragment to plausibly be a complete spoken line rather than a murmur/cue. */
const SCRIPT_DIALOGUE_MIN_MEANINGFUL_LENGTH = 4;

/**
 * True when a script-fallback-parsed line should be DROPPED as an
 * unattributable non-speech fragment (2026-07-07 "unusable dialogue" fix).
 * Only ever applied to source 3 (script `scene_dialogue_summary` freeform
 * parse) — never to already-synced clip dialogue or `dialogueAudioPlan`
 * lines, which come from more structured/authoritative sources.
 *
 * A line is dropped ONLY when BOTH are true:
 *  1. Its `characterKey` (the label found before the first `:`) is NOT a
 *     recognized series character — checked against `knownSpeakerKeys`
 *     (`characterKey` OR display `name`). When `knownSpeakerKeys` is
 *     `undefined` (caller hasn't supplied the series' character list) this
 *     condition is always treated as "unknown", matching this fix's intent
 *     to fail toward filtering junk once the caller is upgraded — existing
 *     callers that still don't pass `knownSpeakerKeys` opt out entirely via
 *     the outer function returning early (see doc comment above).
 *  2. Its `lineTh` text itself looks like a bare sound-cue/stage-direction
 *     fragment: starts with a recognized sound marker (`เสียง…`, `SFX:`, …),
 *     OR is nothing but ellipsis/punctuation, OR is shorter than
 *     `SCRIPT_DIALOGUE_MIN_MEANINGFUL_LENGTH` characters once markers and
 *     whitespace are stripped.
 *
 * A line WITH a recognized speaker is kept unless the spoken text itself
 * starts with an explicit sound cue such as `เสียง…`. That special case is
 * still stage direction even when a parser/LLM attached it to a character.
 */
function isDroppableScriptDialogueFragment(
  line: ShotDialogueLine,
  knownSpeakerKeys: ReadonlySet<string> | undefined
): boolean {
  const speaker = line.characterKey?.trim();
  const text = line.lineTh.trim();
  const textLooksLikeSoundCue = SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN.test(text);
  if (textLooksLikeSoundCue) return true;

  const hasKnownSpeaker = Boolean(
    speaker && knownSpeakerKeys && knownSpeakerKeys.has(speaker)
  );
  if (hasKnownSpeaker) return false;

  const speakerLooksLikeSoundCue = Boolean(
    speaker && SCRIPT_DIALOGUE_SOUND_SPEAKER_PATTERN.test(speaker)
  );
  const strippedOfMarker = text
    .replace(SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN, "")
    .trim();
  const strippedOfPunctuation = strippedOfMarker.replace(/[.…\s]+/g, "");

  const looksLikeSoundFragment =
    speakerLooksLikeSoundCue ||
    SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN.test(text) ||
    strippedOfPunctuation.length === 0 ||
    strippedOfMarker.length < SCRIPT_DIALOGUE_MIN_MEANINGFUL_LENGTH;

  return looksLikeSoundFragment;
}

function normalizeDialogueSignatureText(value: string): string {
  return value
    .replace(/[""''`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dialogueSignature(lines: ShotDialogueLine[] | undefined): string {
  return (lines ?? [])
    .map(line => normalizeDialogueSignatureText(line.lineTh))
    .filter(Boolean)
    .join("\n");
}

function hasDuplicateDialogueOnOtherClip(
  pack: VerticalDramaMotionPromptPack | null,
  shotNumber: number,
  dialogueLines: ShotDialogueLine[]
): boolean {
  const currentSignature = dialogueSignature(dialogueLines);
  if (!currentSignature || !pack?.clips?.length) return false;
  return pack.clips.some(clip => {
    const clipShotNumbers = clip.sourceShotNumbers?.length
      ? clip.sourceShotNumbers
      : clip.parentShotNumber != null
        ? [clip.parentShotNumber]
        : [];
    if (clipShotNumbers.includes(shotNumber)) return false;
    return (
      dialogueSignature(clip.dialogue as ShotDialogueLine[] | undefined) ===
      currentSignature
    );
  });
}

function shouldRegenerateDialogueForVideoPrompt(input: {
  pack: VerticalDramaMotionPromptPack | null;
  shotNumber: number;
  durationSeconds: number;
  dialogueLines: ShotDialogueLine[];
}): boolean {
  if (input.dialogueLines.length === 0) return false;
  if (input.dialogueLines.some(line => line.origin === "script_fallback"))
    return true;
  if (
    input.dialogueLines.some(line =>
      SCRIPT_DIALOGUE_SOUND_MARKER_PATTERN.test(line.lineTh.trim())
    )
  ) {
    return true;
  }
  const quality = analyzeVerticalDramaClipDialogueQuality({
    shotNumber: input.shotNumber,
    durationSeconds: input.durationSeconds,
    dialogue: input.dialogueLines,
  });
  if (
    quality.issues.some(
      issue =>
        issue.code === "VD_DIALOGUE_UNDERFILLED" ||
        issue.code === "VD_DIALOGUE_STAGE_DIRECTION"
    )
  ) {
    return true;
  }
  return hasDuplicateDialogueOnOtherClip(
    input.pack,
    input.shotNumber,
    input.dialogueLines
  );
}

/**
 * Resolve the effective image model for a start-frame generation call:
 * episode-level `startFramePlan.selectedImageModelId`. FAIL CLOSED: throws
 * `TRPCError BAD_REQUEST` when the plan has no selection yet OR the
 * selected model is unknown/no longer enabled — no silent fallback to
 * `DEFAULT_MODELS.image`. (Previously fell back silently, letting
 * generation run on a model the user never chose.) Shared by
 * `generateStartFrameImage`, `generateStartFrameAngleVariations`, and
 * `repairShotImage` — all user-clicked paid actions — so both the throw and
 * the credit pricing stay in sync with the same resolution.
 */
export async function resolveEpisodeImageModelId(
  plan: VerticalDramaStartFramePlan | null
): Promise<string> {
  const requested = plan?.selectedImageModelId?.trim();
  if (!requested) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "กรุณาเลือกโมเดลภาพก่อนสร้าง / Select an image model before generating.",
    });
  }
  const models = await getModelsByTypeAsync("image");
  const model = models.find(m => m.id === requested);
  if (!model) {
    // Cold-start / transient-DB guard: when the DB-backed model catalog is not
    // loaded, `getModelsByType` serves only the small static fallback subset
    // (no DB-only models like the higgsfield catalog). Do NOT reject a model we
    // simply cannot verify yet — trust the user's persisted selection and let
    // the downstream generation validate it, rather than either falsely erroring
    // ("pick another") or silently swapping to DEFAULT_MODELS.
    if (!isDbModelCatalogLoaded()) {
      return requested;
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "โมเดลภาพที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected image model is unavailable; pick another.",
    });
  }
  if (model.isEnabled === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "โมเดลภาพที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected image model is unavailable; pick another.",
    });
  }
  return model.id;
}

/**
 * Resolve the effective video model DEFINITION (not just the id) for a video
 * clip generation call: episode-level `motionPromptPack.selectedVideoModelId`.
 *
 * Feature 135 — Hermes Grok media worker (section 09, remediation row 9):
 * FAIL CLOSED, same convention as `resolveEpisodeImageModelId` above — this
 * doc comment previously CLAIMED that fail-closed symmetry while the
 * function body actually did the opposite (silently substituted
 * `DEFAULT_MODELS.video`, and even manufactured a synthetic last-resort
 * `ModelDefinition` when that lookup failed too) — that mismatch was the
 * bug's camouflage. There is now no fallback of any kind: an empty/absent
 * selection, an unknown model id, or a disabled model all throw
 * `TRPCError({code:"BAD_REQUEST"})`. `DEFAULT_MODELS.video` is never
 * consulted. Returns the full `ModelDefinition` (not just the id) because
 * `formatVideoClipRequest` needs the capability metadata
 * (`configJson`/`aspectRatios`/`provider`/`aliases`) to resolve
 * `nativeAudioDialogue`/`maxReferenceImages` for the requested model — a
 * second lookup by id would risk resolving a DIFFERENT model if the catalog
 * changed between the two calls.
 */
export async function resolveEpisodeVideoModel(
  pack: VerticalDramaMotionPromptPack | null
): Promise<import("../services/modelRegistry").ModelDefinition> {
  const requested = pack?.selectedVideoModelId?.trim();
  if (!requested) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง / Select a video model before generating.",
    });
  }
  const models = await getModelsByTypeAsync("video");
  const model = models.find(m => m.id === requested);
  if (!model) {
    // Cold-start / transient-DB guard — same convention as
    // `resolveEpisodeImageModelId`/`resolveCharacterImageModelId`: when the
    // DB-backed model catalog is not loaded yet, trust the caller's
    // persisted selection rather than falsely rejecting it as "unknown".
    if (!isDbModelCatalogLoaded()) {
      return {
        id: requested,
        type: "video",
        name: requested,
        provider: "unknown",
        description: "",
        aliases: [],
        creditCost: 10,
      };
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "โมเดลวิดีโอที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected video model is unavailable; pick another.",
    });
  }
  if (model.isEnabled === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "โมเดลวิดีโอที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected video model is unavailable; pick another.",
    });
  }
  return model;
}

/**
 * Resolve MCP transport metadata for a Vertical Drama generation call when
 * the episode-selected model is MCP-transport (e.g. `higgsfield/*`,
 * `magnific-mcp/*` — billed via the user's connected MCP provider account,
 * not SmartSpec credits; see the zero-cost credit guard above). Returns
 * `null` for ordinary gateway_api models, in which case the caller proceeds
 * exactly as before (credit reserve + `generateImageAsync`/
 * `generateVideoAsync` without `transportMetadata`).
 *
 * Mirrors `media.ts`'s `generateImageAsync`/`generateVideoAsync` MCP branch
 * (~line 2977-3037) route-by-route:
 *  - `resolveMediaModelTransportConfig` (shared) reads the model's
 *    `configJson` to decide `transport: "mcp" | "gateway_api"`.
 *  - `resolveMcpRouteFromModelId` (exported from `media.ts`) parses the
 *    `provider/model` id shape (`higgsfield/nano_banana_2` ->
 *    `{providerKey: "higgsfield", providerModelId: "nano_banana_2"}`) as a
 *    fallback when the model's `configJson` doesn't already carry a route.
 *  - `resolveMediaTransport` (shared service) validates the tenant's MCP
 *    feature flags + share policy and resolves the caller's
 *    `mcpConnectionId` into full `MediaTaskTransportMetadata` — the same
 *    validation `media.ts` relies on, so an MCP-transport model without a
 *    connected account fails closed with the same `BAD_REQUEST` message
 *    instead of silently falling through to the non-MCP branch (which would
 *    dispatch the `higgsfield`/`magnific` provider key to the Python
 *    gateway_api backend, which has no adapter for it).
 *
 * NOTE: Vertical Drama does not yet have its own `MediaOriginSurface` value
 * (`shared/mcpConnectTypes.ts` only defines `media_studio` /
 * `auto_storyboard_review` / `marketplace_capture` / `storyboard_review`) —
 * reuses `media_studio` for now so this stays gated by that surface's
 * existing tenant feature flags rather than introducing a new surface/flag
 * as part of this fix. A dedicated `vertical_drama_series` origin surface is
 * a follow-up product/flag decision, not a blocking part of this fix.
 */
async function resolveVdMcpTransportMetadata(params: {
  tenantId: string;
  actorUserId: number;
  assetType: "image" | "video";
  modelId: string;
  configJson: Record<string, unknown> | null;
  mcpConnectionId?: string;
  sharedGroupId?: number;
  idempotencyKey?: string;
}): Promise<MediaTaskTransportMetadata | null> {
  const modelTransport = resolveMediaModelTransportConfig({
    modelId: params.modelId,
    configJson: params.configJson,
  });
  const modelRoute = resolveMcpRouteFromModelId(params.modelId);
  const shouldUseMcpTransport =
    modelTransport.transport === "mcp" || Boolean(modelRoute.providerKey);
  if (!shouldUseMcpTransport) return null;

  const providerKey = modelTransport.providerKey ?? modelRoute.providerKey;
  if (!providerKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `MCP provider route metadata is missing for model "${params.modelId}". Re-select an MCP media model and try again.`,
    });
  }
  const rawProviderModelId =
    modelTransport.providerModelId ?? modelRoute.providerModelId;
  const argumentShape =
    modelTransport.argumentShape ??
    defaultMcpArgumentShape(providerKey, params.assetType);
  const providerModelId =
    normalizeMcpProviderModelIdForProvider({
      providerKey,
      providerModelId: rawProviderModelId,
      assetType: params.assetType,
      argumentShape,
    }) ?? rawProviderModelId;

  // NOTE: deliberately no "mcpConnectionId is required" pre-check here.
  // `resolveMediaTransport` auto-resolves the caller's own eligible connection
  // when the client doesn't pin one (the picker fills it in asynchronously and
  // its localStorage cache silently no-ops on full storage, so a null id here
  // does NOT mean the user lacks an account), and raises a precise error itself
  // when there genuinely is none / the choice is ambiguous.
  return resolveMediaTransport({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    originSurface: "media_studio",
    assetType: params.assetType,
    requestedTransport: "mcp",
    mcpConnectionId: params.mcpConnectionId,
    sharedGroupId: params.sharedGroupId,
    providerKey,
    providerModelId,
    model: providerModelId ?? params.modelId,
    toolName: modelTransport.toolName,
    argumentShape,
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Feature 135 — Hermes Grok media worker (section 09): private twin of
 * `verticalDramaCharacters.ts`'s exported `resolveVdCharacterMediaTransportDecision`
 * — byte-equivalent apart from the export keyword and the delegate call
 * (this file's own private `resolveVdMcpTransportMetadata` above, instead of
 * that file's exported one). See that function's doc comment for the full
 * design rationale (detect hermes_worker FIRST, delegate everything else to
 * the existing MCP helper unchanged).
 */
type VdTransportDecision =
  | { kind: "gateway" }
  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
  | { kind: "hermes"; connectionId: string };

interface ResolveVdMediaTransportDecisionDeps {
  resolveDefaultHermesConnectionId?: (params: {
    tenantId: string;
    userId: number;
    assetType: "image" | "video";
  }) => Promise<string | null>;
}

async function defaultResolveDefaultHermesConnectionIdForEpisodes(params: {
  tenantId: string;
  userId: number;
  assetType: "image" | "video";
}): Promise<string | null> {
  const { listHermesConnections } = await import("../services/hermesConnectionService");
  const connections = await listHermesConnections({
    tenantId: params.tenantId,
    userId: params.userId,
    assetType: params.assetType,
  });
  const defaultConnection = connections.find(connection =>
    params.assetType === "image" ? connection.defaultForImage : connection.defaultForVideo,
  );
  return defaultConnection?.id ?? null;
}

async function resolveVdMediaTransportDecision(
  params: {
    tenantId: string;
    actorUserId: number;
    assetType: "image" | "video";
    modelId: string;
    configJson: Record<string, unknown> | null;
    mcpConnectionId?: string;
    sharedGroupId?: number;
    hermesConnectionId?: string;
    idempotencyKey?: string;
  },
  deps: ResolveVdMediaTransportDecisionDeps = {},
): Promise<VdTransportDecision> {
  const modelTransport = resolveMediaModelTransportConfig({
    modelId: params.modelId,
    configJson: params.configJson,
  });

  if (modelTransport.transport === "hermes_worker") {
    const explicitConnectionId = params.hermesConnectionId?.trim();
    if (explicitConnectionId) {
      return { kind: "hermes", connectionId: explicitConnectionId };
    }
    const resolveDefault =
      deps.resolveDefaultHermesConnectionId ?? defaultResolveDefaultHermesConnectionIdForEpisodes;
    const defaultConnectionId = await resolveDefault({
      tenantId: params.tenantId,
      userId: params.actorUserId,
      assetType: params.assetType,
    });
    if (defaultConnectionId) {
      return { kind: "hermes", connectionId: defaultConnectionId };
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED"),
    });
  }

  if (params.hermesConnectionId?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "hermesConnectionId requires transport=hermes_worker",
    });
  }

  const transportMetadata = await resolveVdMcpTransportMetadata({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    assetType: params.assetType,
    modelId: params.modelId,
    configJson: params.configJson,
    mcpConnectionId: params.mcpConnectionId,
    sharedGroupId: params.sharedGroupId,
    idempotencyKey: params.idempotencyKey,
  });
  return transportMetadata ? { kind: "mcp", transportMetadata } : { kind: "gateway" };
}

/**
 * Insert one new episode row, safely assigning the next episode number.
 * Extracted from `createEpisode` (spec Tests) so every episode-creating
 * procedure — the plain shell `createEpisode` AND the plan-materializing /
 * LLM-continuation `generateNextEpisodes` — shares the exact same
 * race-safe max+1-with-retry-on-unique-violation numbering behavior. The
 * unique index on (tenant, series, episodeNumber) prevents concurrent
 * duplicates; on a collision (someone else raced us for the same number) the
 * max+1 assignment is simply retried up to 5 times.
 */
async function insertEpisodeWithSafeNumber(
  tenantId: string,
  userId: number,
  seriesId: number,
  input: {
    title?: string | null;
    script?: unknown;
    status?: string;
    targetDurationSeconds?: number;
  }
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [agg] = await db
      .select({
        maxEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
      })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.tenantId, tenantId),
          eq(verticalDramaEpisodes.seriesId, seriesId)
        )
      );
    const nextNumber = Number(agg?.maxEpisodeNumber ?? 0) + 1;
    try {
      const [row] = await db
        .insert(verticalDramaEpisodes)
        .values({
          tenantId,
          userId,
          seriesId,
          episodeNumber: nextNumber,
          title: input.title ?? null,
          status: input.status ?? "draft",
          targetDurationSeconds: input.targetDurationSeconds ?? 60,
          script: input.script ?? null,
        })
        .returning();
      return row;
    } catch (err) {
      // Unique-violation on the episode number → someone raced us; retry.
      if (attempt === 4) throw err;
    }
  }
  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not assign episode number",
  });
}

/**
 * Validate a user-requested episode-level model selection against the media
 * model catalog: must exist, must be the requested media type, and must be
 * enabled (spec Phase 1.1 — "ต้อง generate ได้จริง"). Reused by
 * `setEpisodeModelSelection` for both `selectedImageModelId` and
 * `selectedVideoModelId`. Uses the async/DB-fresh registry lookup (same
 * convention as `verticalDramaProviderRouting.ts`'s `resolveVideoModels`)
 * rather than the sync cache-or-static accessor, since this is a
 * user-triggered validation path, not a hot generation call site.
 */
export async function assertModelSelectable(
  modelId: string,
  mediaType: "image" | "video"
): Promise<void> {
  const models = await getModelsByTypeAsync(mediaType);
  const model = models.find(m => m.id === modelId);
  if (!model) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown ${mediaType} model "${modelId}"`,
    });
  }
  if (model.isEnabled === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Model "${modelId}" is currently disabled and cannot be selected`,
    });
  }
}

/**
 * Validate a caller-supplied `resolution` against a model's derived
 * `resolutionOptions` (storyboard-complete plan Phase 6.2b). If the model has
 * NO resolution/size options at all (`deriveModelResolutionOptions` returns
 * `undefined`), the requested value is silently ignored by the caller (not
 * validated here) since there's nothing to validate against — a model with no
 * resolution axis doesn't reject an unrelated `resolution` string, it simply
 * never receives one downstream. Returns `undefined` when no validation is
 * possible/needed so callers can tell "not applicable" apart from "valid".
 */
function assertResolutionOption(
  pricingModel: { creditCost: number; configJson?: Record<string, any> | null },
  resolution: string | undefined
): void {
  if (!resolution) return;
  const options = deriveModelResolutionOptions(pricingModel);
  if (!options || options.length === 0) return;
  const match = options.find(o => o.value === resolution);
  if (!match) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid resolution "${resolution}" — supported values: ${options.map(o => o.value).join(", ")}`,
    });
  }
}

/**
 * Resolve the effective sub-shot policy for a tenant (flag-gated, fail-closed).
 *
 * Uses OPTIONAL CHAINING on `flags?.verticalDramaSeriesSubShots` (speaker-
 * aware sub-shots task fix — this was previously a direct, non-optional
 * access) for the SAME reason `resolveVerticalDramaDensityFlags`'s own doc
 * comment documents: `generateShotVideoPrompt` is an ALREADY-COVERED
 * procedure whose existing unit tests mock `getTenantFeatureFlags` as a bare
 * `vi.fn()` (no resolved value) — a direct property access on `undefined`
 * would throw the instant this function is called from that procedure's new
 * split-gate wiring, crashing every pre-existing test for it. Optional
 * chaining resolves to "flag off" for that `undefined` case, which is the
 * correct fail-closed default anyway (identical behavior to before for every
 * already-passing test that configures a real flags object).
 */
async function resolveSubShotPolicy(
  tenantId: string,
  override?: Partial<VerticalDramaSubShotPolicy>
): Promise<{ flagOn: boolean; policy: VerticalDramaSubShotPolicy }> {
  const flags = await getTenantFeatureFlags(tenantId);
  const flagOn = flags?.verticalDramaSeriesSubShots === true;
  const policy: VerticalDramaSubShotPolicy = {
    ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    ...(override ?? {}),
    enabled: flagOn && (override?.enabled ?? true),
  };
  return { flagOn, policy };
}

/**
 * Resolve the two story-density-reform tenant flags (spec §7.7, section-13,
 * added 2026-07-07) in one query. Uses OPTIONAL CHAINING (unlike
 * `resolveSubShotPolicy`'s direct `flags.verticalDramaSeriesSubShots`
 * access above) deliberately: several call sites below are NEW additions to
 * ALREADY-COVERED procedures whose existing unit tests mock
 * `getTenantFeatureFlags` as a bare `vi.fn()` (no resolved value) — optional
 * chaining makes this call safe against that `undefined` default (resolving
 * to "flag off", the correct fail-closed default anyway) without requiring
 * every pre-existing test file that touches those procedures to be updated.
 */
async function resolveVerticalDramaDensityFlags(
  tenantId: string
): Promise<{
  speechBudgetEnabled: boolean;
  arcReplanEnabled: boolean;
  /** Feature 132 §5 (F132B, ledgers-and-story-state) — gates `story_state` memory-event writes below. */
  qualityLedgersEnabled: boolean;
  /** Feature 138 P1 — additive read flag for episode workspace scene locks. */
  sceneContinuityEnabled: boolean;
}> {
  const flags = await getTenantFeatureFlags(tenantId);
  return {
    speechBudgetEnabled: flags?.verticalDramaSeriesSpeechBudget === true,
    arcReplanEnabled: flags?.verticalDramaSeriesArcReplan === true,
    qualityLedgersEnabled: flags?.verticalDramaQualityLedgers === true,
    sceneContinuityEnabled: flags?.verticalDramaSceneContinuity === true,
  };
}

/** Feature 138 P1 — fail-closed gate for scene continuity lock resolution. */
async function resolveVerticalDramaSceneContinuityFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaSceneContinuity === true;
  } catch {
    return false;
  }
}

function hasVerticalDramaSceneIdentity(
  storyboard: unknown,
  shotNumber: number,
  overrideLocationKey?: string | null,
): boolean {
  if (typeof overrideLocationKey === "string" && overrideLocationKey.trim()) return true;
  const raw = storyboard as { distinct_locations?: unknown } | null;
  if (!Array.isArray(raw?.distinct_locations)) return false;
  return raw.distinct_locations.some(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const shots = (entry as { shot_numbers?: unknown }).shot_numbers;
    return Array.isArray(shots) && shots.some(value => Number(value) === shotNumber);
  });
}

type SceneMutationFacts = {
  plan: VerticalDramaStartFramePlan;
  group: VdSceneShotGroup;
  storyboard: Record<string, unknown>;
  location: Record<string, unknown>;
  shots: Array<{
    shotNumber: number;
    summary?: string;
    characters?: string[];
  }>;
  membershipHash: string;
};

function sceneRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sceneString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sceneNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Resolve the code-owned scene identity and factual authoring inputs. */
function resolveSceneMutationFacts(
  row: Awaited<ReturnType<typeof loadOwnedEpisode>>,
  locationKey: string,
): SceneMutationFacts {
  const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
  if (!plan || !Array.isArray(plan.frames)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No start-frame plan exists yet for this episode",
    });
  }

  const storyboard = sceneRecord(row.storyboard);
  const overridesByShotNumber = new Map<number, string>();
  for (const frame of plan.frames) {
    const key = sceneString(frame.locationKey);
    const shot = sceneNumber(frame.shotNumber);
    if (key && shot) overridesByShotNumber.set(shot, key);
  }
  const groups = buildSceneShotGroups({
    distinctLocations: storyboard.distinct_locations,
    overridesByShotNumber,
  });
  const group = groups.find(candidate => candidate.locationKey === locationKey);
  if (!group) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown scene location key: ${locationKey}`,
    });
  }

  const storyboardShots = Array.isArray(storyboard.shots)
    ? storyboard.shots.map(sceneRecord)
    : [];
  const shotsByNumber = new Map<number, Record<string, unknown>>();
  for (const shot of storyboardShots) {
    const shotNumber = sceneNumber(shot.shot_number ?? shot.shotNumber);
    if (shotNumber) shotsByNumber.set(shotNumber, shot);
  }
  const frameByShotNumber = new Map(
    plan.frames.map(frame => [frame.shotNumber, frame]),
  );
  const summaries = new Map<number, string>();
  const shots = group.shotNumbers.map(shotNumber => {
    const raw = shotsByNumber.get(shotNumber) ?? {};
    const frame = frameByShotNumber.get(shotNumber) as Record<string, unknown> | undefined;
    const summary =
      sceneString(frame?.canonicalShotSummary) ??
      sceneString(raw.summary) ??
      sceneString(raw.visual_description) ??
      sceneString(raw.description);
    if (summary) summaries.set(shotNumber, summary);
    const rawCharacters = Array.isArray(raw.required_character_refs)
      ? raw.required_character_refs
      : Array.isArray(raw.characters)
        ? raw.characters
        : [];
    const characters = rawCharacters.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return {
      shotNumber,
      ...(summary ? { summary } : {}),
      ...(characters.length ? { characters } : {}),
    };
  });
  const rawLocations = Array.isArray(storyboard.distinct_locations)
    ? storyboard.distinct_locations.map(sceneRecord)
    : [];
  const location =
    rawLocations.find(
      candidate => sceneString(candidate.location_key) === locationKey,
    ) ?? { location_key: locationKey };
  const membershipHash = computeSceneMembershipHash({
    episodeId: row.id,
    locationKey,
    memberShotNumbers: group.shotNumbers,
    canonicalSummariesByShotNumber: summaries,
  });
  return { plan, group, storyboard, location, shots, membershipHash };
}

function isSceneServiceError(
  error: unknown,
  candidate: unknown,
  name: string,
): boolean {
  if (typeof candidate === "function") {
    try {
      if (error instanceof (candidate as new (...args: never[]) => Error)) return true;
    } catch {
      // A narrow test double may be callable but not constructable.
    }
  }
  const record = sceneRecord(error);
  return record.name === name || record.code === name || record.code === "VD_RATE_LIMIT_EXCEEDED";
}

function mapSceneVisualStateAuthoringError(
  error: unknown,
  candidates?: {
    InsufficientCreditsError?: unknown;
    VdSchemaValidationError?: unknown;
  },
): never {
  if (isSceneServiceError(error, candidates?.InsufficientCreditsError, "InsufficientCreditsError")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient credits for scene continuity lock",
      cause: error,
    });
  }
  if (isSceneServiceError(error, candidates?.VdSchemaValidationError, "VdSchemaValidationError")) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Scene continuity lock authoring returned invalid data",
      cause: error,
    });
  }
  if (isSceneServiceError(error, undefined, "RateLimitExceededError")) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Scene continuity lock authoring is rate limited; try again shortly",
      cause: error,
    });
  }
  throw error;
}

function throwSceneRevisionConflict(expectedRevision: number, currentRevision: number): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: `Scene visual state is stale (expected revision ${expectedRevision}, current revision ${currentRevision})`,
  });
}

/**
 * Resolve the `verticalDramaSeriesTieInReplan` tenant flag (F131Y, task
 * #31, spec §7.7.3, added 2026-07-09) — gates `deferEpisodeTieIn`'s real
 * `arc_replan_proposal` path. Same loose, fail-closed
 * `getTenantFeatureFlags(tenantId)` string-key lookup + optional-chaining
 * convention as `resolveVerticalDramaDensityFlags`'s
 * `verticalDramaSeriesArcReplan` above.
 *
 * TODO(conductor, F131Y): this flag is NOT YET registered in
 * `shared/featureFlags.ts` / given an admin-group entry in
 * `client/src/components/admin/tenantFeatureFlagGroups.ts` (both forbidden
 * to this wave — see `VD_TIE_IN_REPLAN_ROLLOUT` in
 * `@shared/verticalDramaSeries/contentBudget`) — an unregistered key never
 * resolves `true` for a real tenant (no admin UI exists yet to set it), so
 * `deferEpisodeTieIn`'s new branch is effectively OFF for every tenant
 * today. Registering the flag + admin-group entry is the ONLY remaining
 * step; NO further code change is needed here.
 */
async function resolveVerticalDramaTieInReplanFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesTieInReplan === true;
}

/**
 * Resolve the `verticalDramaSeriesNativeAudioPrompts` rollout gate (F131AC,
 * task #36 — optional NATIVE AUDIO DIRECTION prompt option, added
 * 2026-07-09). Gates `generateShotVideoPrompt`'s native-audio-direction
 * branch.
 *
 * UNLIKE every other `resolveVerticalDramaXFlag` helper in this file, this
 * does NOT call `getTenantFeatureFlags` — `shared/featureFlags.ts` /
 * `client/src/components/admin/tenantFeatureFlagGroups.ts` were both
 * off-limits to this task (another agent was concurrently finishing
 * Vertical Drama share-links work in adjacent files), so this mirrors task
 * #23's param-gate precedent instead
 * (`VD_FORMAT_PROFILES_ROLLOUT`, `shared/verticalDramaSeries/formatProfiles.ts`)
 * — a hardcoded `false` default with a TODO marker, rather than
 * `resolveVerticalDramaTieInReplanFlag`'s "real lookup on an
 * as-yet-unregistered key" style immediately above.
 *
 * TODO(conductor, F131AC `verticalDramaSeriesNativeAudioPrompts`): register
 * the flag in `shared/featureFlags.ts` (+ admin group entry in
 * `tenantFeatureFlagGroups.ts`), then swap this function's body to
 * `const flags = await getTenantFeatureFlags(tenantId); return
 * flags?.verticalDramaSeriesNativeAudioPrompts === true;` (same fail-closed
 * shape as `resolveVerticalDramaTieInReplanFlag` above) — every call site
 * (`generateShotVideoPrompt`) stays unchanged. See
 * `VD_NATIVE_AUDIO_PROMPTS_ROLLOUT` in
 * `@shared/verticalDramaSeries/nativeAudioPrompts` for the matching client-
 * side marker and the full 3-layer audio architecture this option is part
 * of.
 */
async function resolveVerticalDramaNativeAudioPromptsFlag(tenantId: string): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaSeriesNativeAudioPrompts === true;
  } catch {
    return false;
  }
}

/**
 * Resolve the `verticalDramaSeriesDeepStoryDrafts` tenant flag (W10-B, spec/
 * section-16 refine-mode hydration, added 2026-07-08). Its own small helper
 * — same "one focused helper per flag-group" convention as
 * `resolveSubShotPolicy`/`resolveVerticalDramaDensityFlags`/
 * `resolveVerticalDramaQualityLoopFlags` above — rather than folding it into
 * `resolveVerticalDramaDensityFlags` (that function's own doc comment scopes
 * it to "the two story-density-reform tenant flags" specifically). Optional
 * chaining mirrors those siblings' fail-closed default for any pre-existing
 * test that mocks `getTenantFeatureFlags` as a bare `vi.fn()`.
 */
async function resolveVerticalDramaDeepStoryDraftsFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesDeepStoryDrafts === true;
}

/**
 * Resolve the `verticalDramaSeriesVoiceChain` tenant flag (W12-A, added
 * 2026-07-08) — same "one focused helper per flag-group" convention as
 * `resolveVerticalDramaDeepStoryDraftsFlag` above. Used by
 * `assembleEpisodeVideo` to decide whether to additionally populate
 * `assemblyManifest.dialogueAudioTimeline` (the mutation itself stays
 * reachable when the flag is off — only that ADDITIVE step is skipped, so
 * the existing compiled-video behavior stays flags-off byte-identical).
 * `generateEpisodeDialogueAudio` gates at the procedure level instead (see
 * `verticalDramaVoiceChainProcedure`), since it is a brand-new mutation.
 */
async function resolveVerticalDramaVoiceChainFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesVoiceChain === true;
}

/**
 * Resolve the `verticalDramaSeriesAdBannerOverlay` tenant flag (F131W, added
 * 2026-07-09, task #30-A2) — mirrors `resolveVerticalDramaVoiceChainFlag`
 * exactly (same "one focused helper per flag-group" convention). Used by
 * `updateEpisodeAdBannerPlan` (gates the whole mutation — brand new, so
 * flags-off means FORBIDDEN before any handler code runs), `getEpisodeDetail`
 * (gates the additive `adBannerPlan`/`adBannerDesignsSummary` fields — the
 * query itself stays reachable when the flag is off), and `assembleEpisodeVideo`
 * (gates the additive banner-feeding step — the mutation itself stays
 * reachable when the flag is off, same "additive step skipped, existing
 * behavior byte-identical" convention as the voice-chain wiring above).
 */
async function resolveVerticalDramaAdBannerOverlayFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesAdBannerOverlay === true;
}

/**
 * Resolve the `verticalDramaSeriesCharacterRefV2` tenant flag (F131Z, added
 * 2026-07-09 — character visual-identity consistency option A, see
 * `planning/vertical-drama-character-consistency/research-2026-07-09.md`) —
 * mirrors `resolveVerticalDramaVoiceChainFlag` exactly (same "one focused
 * helper per flag-group" convention). Used by `resolveShotCharacterReferenceUrls`
 * to decide whether to additionally resolve each required character's best
 * `character_sheet_*` asset as a SECOND identity-lock reference image
 * alongside the primary portrait. Flag off means the resolved reference set
 * stays byte-identical to before this feature (portraits only, same order,
 * same `getPrimaryPortraitUrl` call) — zero behavior change for tenants that
 * haven't opted in.
 */
async function resolveVerticalDramaCharacterRefV2Flag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesCharacterRefV2 === true;
}

/**
 * Resolve the `verticalDramaSeriesTextOverlaySuite` tenant flag (F131AB,
 * task #34) — mirrors `resolveVerticalDramaAdBannerOverlayFlag` exactly (same
 * "one focused helper per flag-group" convention). Used by
 * `updateEpisodeTextOverlayPlan` (gates the whole mutation — brand new, so
 * flags-off means FORBIDDEN before any handler code runs), `getEpisodeDetail`
 * (gates the additive `textOverlayPlan`/`textOverlayPreview` fields — the
 * query itself stays reachable when the flag is off), and `assembleEpisodeVideo`
 * (gates the additive text-overlay-feeding step — the mutation itself stays
 * reachable when the flag is off, same "additive step skipped, existing
 * behavior byte-identical" convention as the voice-chain/ad-banner wiring).
 */
async function resolveVerticalDramaTextOverlaySuiteFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesTextOverlaySuite === true;
}

/**
 * Resolve the `verticalDramaRetentionHooks` tenant flag (`planning/vertical-
 * drama-retention-hooks/plan.md`, router-wiring package, added 2026-07-11) —
 * mirrors `resolveVerticalDramaTextOverlaySuiteFlag` exactly (same "one
 * focused helper per flag-group" convention, optional-chaining fail-closed
 * default). This is the SINGLE flag that gates every retention-hooks
 * behavior across the pipeline (W1/W2/W3 script+shotgrid genre/retention-
 * loop guidance, W6 quality-review scorecard v4 + `retention_metrics`, W7
 * video-prompt hook/retention-ending motion energy) — every downstream
 * service param this resolves into (`RunStageOptions.retentionHooksEnabled`,
 * `repairStage`'s `args.retentionHooksEnabled`,
 * `RunEpisodeQualityReviewParams.scoreRetentionDimensions`,
 * `GenerateVerticalDramaShotVideoPromptParams.retentionHooksEnabled`,
 * `GenerateVideoMotionPromptPackParams.retentionHooksEnabled`) already
 * defaults to `false`/byte-identical when omitted, so resolving this ONCE
 * per request and threading the same boolean everywhere is safe.
 */
async function resolveVerticalDramaRetentionHooksFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaRetentionHooks === true;
}

/** Feature 137 P1 — fail-closed tenant gate for frame observability/motion contracts. */
async function resolveVerticalDramaMotionContractsFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaMotionContracts === true;
}

/**
 * Retention hooks W5/W6 (`planning/vertical-drama-retention-hooks/plan.md`)
 * — nearest-first `retention_loop.type` of this series' last `limit` PRIOR
 * episodes' persisted script artifacts (`episodeNumber` strictly less than
 * `currentEpisodeNumber`), read directly off the
 * `verticalDramaEpisodes.script` jsonb column. No dedicated "last N
 * episodes' scripts" helper exists in this file today (the pipeline's
 * `prior_episode_recap`/memory-bundle assembly goes through
 * `memoryService.buildEpisodeMemoryBundle`, a durable memory-EVENT read, not
 * a raw script-column read) — per the plan's explicit "a simple scoped
 * DB query is fine, don't over-engineer" guidance, this is a small,
 * read-only, tenant/user/series-scoped query instead of a new shared
 * service. Feeds `computeRetentionMetrics`'s `recentRetentionLoopTypes`
 * ADVISORY rotation fact ONLY (never gates/blocks anything — see that
 * function's own doc comment). Tolerant of episodes with no script yet, or
 * a script whose `retention_loop.type` is missing/malformed/not a string
 * (skipped, never coerced to `null`), so the returned array can be shorter
 * than `limit` (including empty, e.g. episode 1) rather than ever erroring.
 */
async function loadRecentVerticalDramaRetentionLoopTypes(
  owner: EpisodeRunOwner,
  currentEpisodeNumber: number,
  limit = 3
): Promise<string[]> {
  const rows = await db
    .select({ script: verticalDramaEpisodes.script })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        lt(verticalDramaEpisodes.episodeNumber, currentEpisodeNumber)
      )
    )
    .orderBy(desc(verticalDramaEpisodes.episodeNumber))
    .limit(limit);

  const types: string[] = [];
  for (const row of rows) {
    const script = row.script as Record<string, unknown> | null;
    const retentionLoop = script?.retention_loop as
      | Record<string, unknown>
      | undefined;
    const type = retentionLoop?.type;
    if (typeof type === "string" && type.length > 0) {
      types.push(type);
    }
  }
  return types;
}

/* -------------------------------------------------------------------------- */
/* Text Overlay Suite — per-episode plan + auto-text derivation (task #34)    */
/* -------------------------------------------------------------------------- */

/**
 * `getEpisodeDetail.textOverlayPreview` / `assembleEpisodeVideo`'s
 * `overlays`/`watermarkImage` engine feed both delegate to the SAME shared
 * resolution service (`server/services/verticalDramaTextOverlayResolution.ts`)
 * so `verticalDramaSeries.ts`'s `assembleSeasonVideos` (season batch) can
 * reuse the identical logic without a cross-router import — see that
 * service's own header doc comment. Lazy `await import(...)` mirrors
 * `resolveEpisodeDraftAvailable`'s established convention (that service
 * itself lazy-imports `verticalDramaStoryBible.ts`, so a static import here
 * is technically safe too, but this keeps the "anything touching bible-
 * adjacent resolution is lazy-loaded" posture consistent across this file).
 */

/** `getEpisodeDetail.textOverlayPreview` — read-only derived-text preview so
 *  the workspace can show "ที่มา"/auto-fill values without a separate
 *  round-trip. Never persists anything. */
export interface VdEpisodeTextOverlayPreview {
  endCard: { text: string; source: string };
  openerRecap: { text: string; source: string };
  titleBumper: { primary: string; secondary: string };
  episodeIndicator: { label: string };
  characterIntroCards: Array<{
    characterKey: string;
    shotNumber: number;
    name: string;
    role?: string;
  }>;
}

async function buildEpisodeTextOverlayPreview(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  plan: VdTextOverlayPlan | null;
  startFramePlan: VerticalDramaStartFramePlan | null;
}): Promise<VdEpisodeTextOverlayPreview> {
  const owner = {
    tenantId: params.tenantId,
    userId: params.userId,
    seriesId: params.seriesId,
  };
  const {
    loadVdSeriesTextOverlayContext,
    resolveVdEndCardAndOpenerAutoTexts,
    resolveVdCharacterIntroCardsForEpisode,
  } = await import("../services/verticalDramaTextOverlayResolution");

  const [seriesContext, autoTexts, characterIntroCards] = await Promise.all([
    loadVdSeriesTextOverlayContext(owner),
    resolveVdEndCardAndOpenerAutoTexts(owner, params.episodeNumber, {
      endCardText: params.plan?.endCard?.text,
      openerRecapText: params.plan?.openerRecap?.text,
    }),
    resolveVdCharacterIntroCardsForEpisode(
      owner,
      (params.startFramePlan?.frames ?? []).map(frame => ({
        shotNumber: frame.shotNumber,
        requiredCharacterRefs: frame.requiredCharacterRefs,
      }))
    ),
  ]);

  return {
    endCard: autoTexts.endCard,
    openerRecap: autoTexts.openerRecap,
    titleBumper: deriveTitleBumperLines({
      seriesTitle: seriesContext.seriesTitle,
      episodeNumber: params.episodeNumber,
      episodeTitle: params.episodeTitle,
    }),
    episodeIndicator: {
      label: deriveEpisodeIndicatorLabel(
        params.episodeNumber,
        seriesContext.targetEpisodeCount
      ),
    },
    characterIntroCards,
  };
}

/**
 * Resolve an episode's saved `textOverlayPlan` (+ the series' watermark
 * config) into the render engine's `overlays`/`watermarkImage` inputs (task
 * #34) — a thin wrapper around the shared
 * `resolveVdEpisodeTextOverlayEngineInputs` (see that function's own doc
 * comment for the full "why shared, not router-local like ad banners"
 * rationale).
 */
async function resolveEpisodeTextOverlayEngineInputs(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  plan: VdTextOverlayPlan | null;
  startFramePlan: VerticalDramaStartFramePlan | null;
  motionClips: VdDialogueTimelineClip[];
  includedClipNumbers: number[];
  includeWatermark: boolean;
}): Promise<{
  overlays: RunAssemblyJobTextOverlayEventInput[];
  watermarkImage: RunAssemblyJobWatermarkImageInput | null;
  overlaysIncluded: number;
}> {
  const { resolveVdEpisodeTextOverlayEngineInputs } = await import(
    "../services/verticalDramaTextOverlayResolution"
  );
  return resolveVdEpisodeTextOverlayEngineInputs({
    owner: { tenantId: params.tenantId, userId: params.userId, seriesId: params.seriesId },
    episodeNumber: params.episodeNumber,
    episodeTitle: params.episodeTitle,
    plan: params.plan,
    startFramePlan: params.startFramePlan,
    motionClips: params.motionClips,
    includedClipNumbers: params.includedClipNumbers,
    includeWatermark: params.includeWatermark,
  });
}

/* -------------------------------------------------------------------------- */
/* Ad Banner Overlay — per-episode plan (F131W, #30-A2)                       */
/* -------------------------------------------------------------------------- */

/**
 * `VdEpisodeAdBannerPlan` (plan.md §2 "ชั้นการใช้") — which of the series'
 * READY banner designs appear in THIS episode's video, with an optional
 * per-selection timing override. Deliberately router-local (not added to
 * `@shared/verticalDramaSeries/adBannerPresets`, which is owned by the A1
 * series-studio wave and only defines the SERIES-level design shape) — same
 * "small exported helper in the episodes router" scope the task packet calls
 * for. Unlike the series-level `VdAdBannerTiming` (whose `startSec`/
 * `durationSec` are optional, only meaningful for `"window"` mode), THIS
 * timing override always carries concrete numbers even for `"entire"` mode
 * (ignored by the resolver below) — this keeps the client's per-selection
 * timing editor a single, always-fully-populated shape instead of a
 * conditionally-typed one.
 */
const vdEpisodeAdBannerTimingSchema = z.object({
  mode: z.enum(["entire", "window"]),
  startSec: z.number(),
  durationSec: z.number(),
});

const vdEpisodeAdBannerSelectionSchema = z.object({
  bannerId: z.string().min(1),
  timing: vdEpisodeAdBannerTimingSchema.optional(),
});

const vdEpisodeAdBannerPlanSchema = z.object({
  enabled: z.boolean(),
  selections: z.array(vdEpisodeAdBannerSelectionSchema),
});

export type VdEpisodeAdBannerTiming = z.infer<
  typeof vdEpisodeAdBannerTimingSchema
>;
export type VdEpisodeAdBannerSelection = z.infer<
  typeof vdEpisodeAdBannerSelectionSchema
>;
export type VdEpisodeAdBannerPlan = z.infer<typeof vdEpisodeAdBannerPlanSchema>;

/**
 * Defensively parse the `vertical_drama_episodes.adBannerPlan` jsonb column
 * (`unknown` at the type level — same "never trust a jsonb column's runtime
 * shape" posture as `parseAdBannerDesigns`) into a `VdEpisodeAdBannerPlan`,
 * or `null` for a legacy/pre-migration row (`NULL` column value) OR a
 * malformed record — NEVER throws, mirroring `parseAdBannerDesigns`'s own
 * "drop rather than crash" contract.
 */
export function parseEpisodeAdBannerPlan(
  value: unknown
): VdEpisodeAdBannerPlan | null {
  if (value == null) return null;
  const parsed = vdEpisodeAdBannerPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

interface LoadedSeriesAdBannerContext {
  rawProductTieIn: Record<string, unknown> | null;
  designs: VdAdBannerDesign[];
}

/**
 * Load an owned series' `productTieIn.adBanners[]` (ownership scoped by
 * tenant + user + seriesId, same precedent as `loadSeriesTargetAudienceRegion`
 * above) — the ONE series-row read every ad-banner-plan handler below needs,
 * shared so there is exactly one query shape for it. NOT_FOUND (never
 * FORBIDDEN) for a series the caller does not own, matching this router's
 * "never disclose existence" convention (`loadOwnedEpisode`).
 */
async function loadSeriesAdBannerContext(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<LoadedSeriesAdBannerContext> {
  const [row] = await db
    .select({ productTieIn: verticalDramaSeries.productTieIn })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  const rawProductTieIn =
    (row.productTieIn as Record<string, unknown> | null) ?? null;
  return {
    rawProductTieIn,
    designs: parseAdBannerDesigns(rawProductTieIn?.adBanners),
  };
}

export interface VdEpisodeAdBannerValidationIssue {
  code:
    | "VD_EPISODE_AD_BANNER_TOO_MANY"
    | "VD_EPISODE_AD_BANNER_DUPLICATE_SELECTION"
    | "VD_EPISODE_AD_BANNER_UNKNOWN_DESIGN"
    | "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY"
    | "VD_EPISODE_AD_BANNER_INVALID_WINDOW"
    | "VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP";
  severity: "error" | "warning";
  message: string;
  bannerId?: string;
}

export interface VdEpisodeAdBannerEffectiveWindow {
  mode: "entire" | "window";
  /** Always 0 for `"entire"` — the caller resolves the real total-duration
   *  endpoint (this function has no duration source of its own). */
  startSec: number;
  /** `Number.POSITIVE_INFINITY` for `"entire"` — a deliberate sentinel so
   *  overlap comparisons below treat it as spanning the WHOLE timeline
   *  without needing a real duration value (see this function's doc
   *  comment and `findEpisodeAdBannerFullscreenOverlaps`). */
  endSec: number;
}

/**
 * Resolve one selection's effective display window (plan.md §6: "explicit
 * timing, else the design's defaultTiming, else placement preset default").
 * `"entire"` resolves to a `[0, Infinity)` sentinel window rather than a real
 * duration — this function is used both by PLAN-SAVE-TIME validation (no
 * known video duration yet) and is deliberately duration-agnostic; the
 * ASSEMBLY-TIME caller (`resolveEpisodeAdBannerRunInputs`) substitutes the
 * real total duration for the `Infinity` sentinel itself before building the
 * render engine's input contract.
 */
export function resolveEpisodeAdBannerEffectiveWindow(
  selection: Pick<VdEpisodeAdBannerSelection, "timing">,
  design: VdAdBannerDesign
): VdEpisodeAdBannerEffectiveWindow {
  const timing: VdEpisodeAdBannerTiming | VdAdBannerDesign["defaultTiming"] =
    selection.timing ??
    design.defaultTiming ??
    getAdBannerPlacementPreset(design.placementId).defaultTiming;
  if (
    timing.mode === "window" &&
    typeof timing.startSec === "number" &&
    typeof timing.durationSec === "number"
  ) {
    return {
      mode: "window",
      startSec: timing.startSec,
      endSec: timing.startSec + timing.durationSec,
    };
  }
  return { mode: "entire", startSec: 0, endSec: Number.POSITIVE_INFINITY };
}

/**
 * Fullscreen selections must not overlap in time (plan.md §6/§8) — only
 * `"fullscreen"`-placement selections participate; band/side placements
 * default to `"entire"` BY DESIGN (a persistent overlay, not an interstitial)
 * and are explicitly allowed to coexist with each other and with fullscreen.
 * An `"entire"` fullscreen selection's `[0, Infinity)` sentinel window
 * overlaps with ANY other fullscreen selection by construction — "entire
 * fullscreen may coexist with nothing" (plan.md §6) falls out of the same
 * general overlap check with no special-casing needed.
 */
export function findEpisodeAdBannerFullscreenOverlaps(
  selections: VdEpisodeAdBannerSelection[],
  designsById: Map<string, VdAdBannerDesign>
): VdEpisodeAdBannerValidationIssue[] {
  const fullscreenWindows: Array<{
    bannerId: string;
    window: VdEpisodeAdBannerEffectiveWindow;
  }> = [];
  for (const selection of selections) {
    const design = designsById.get(selection.bannerId);
    if (!design || design.placementId !== "fullscreen") continue;
    fullscreenWindows.push({
      bannerId: selection.bannerId,
      window: resolveEpisodeAdBannerEffectiveWindow(selection, design),
    });
  }

  const issues: VdEpisodeAdBannerValidationIssue[] = [];
  for (let i = 0; i < fullscreenWindows.length; i += 1) {
    for (let j = i + 1; j < fullscreenWindows.length; j += 1) {
      const a = fullscreenWindows[i]!;
      const b = fullscreenWindows[j]!;
      const overlaps =
        a.window.startSec < b.window.endSec &&
        b.window.startSec < a.window.endSec;
      if (overlaps) {
        issues.push({
          code: "VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP",
          severity: "error",
          message: `Fullscreen ad banners "${a.bannerId}" and "${b.bannerId}" overlap in time.`,
          bannerId: b.bannerId,
        });
      }
    }
  }
  return issues;
}

/**
 * Deterministic, pure validation over a proposed episode ad-banner plan
 * against the series' CURRENT banner designs (plan.md §6 v1 scope): ≤
 * `VD_AD_BANNER_MAX_PER_SERIES` selections, no duplicate `bannerId`, every
 * `bannerId` must reference an EXISTING `"ready"` design with a rendered
 * image, `"window"` timing overrides must be sane, and fullscreen selections
 * must not overlap. Warn-not-block conditions (plan.md §8, e.g. fullscreen
 * >20% of clip duration) are explicitly OUT of scope here — those are
 * render-time UI concerns resolved once a real clip duration exists (see
 * `verticalDramaFinalRenderGraph.ts`'s own `validateResolvedBanners`).
 */
export function validateEpisodeAdBannerPlan(
  plan: VdEpisodeAdBannerPlan,
  seriesDesigns: VdAdBannerDesign[]
): VdEpisodeAdBannerValidationIssue[] {
  const issues: VdEpisodeAdBannerValidationIssue[] = [];

  if (plan.selections.length > VD_AD_BANNER_MAX_PER_SERIES) {
    issues.push({
      code: "VD_EPISODE_AD_BANNER_TOO_MANY",
      severity: "error",
      message: `An episode may include at most ${VD_AD_BANNER_MAX_PER_SERIES} ad banner selections (found ${plan.selections.length}).`,
    });
  }

  const designsById = new Map(seriesDesigns.map(d => [d.id, d]));
  const seenIds = new Set<string>();
  for (const selection of plan.selections) {
    if (seenIds.has(selection.bannerId)) {
      issues.push({
        code: "VD_EPISODE_AD_BANNER_DUPLICATE_SELECTION",
        severity: "error",
        message: `Ad banner design "${selection.bannerId}" is selected more than once.`,
        bannerId: selection.bannerId,
      });
    }
    seenIds.add(selection.bannerId);

    const design = designsById.get(selection.bannerId);
    if (!design) {
      issues.push({
        code: "VD_EPISODE_AD_BANNER_UNKNOWN_DESIGN",
        severity: "error",
        message: `Ad banner design "${selection.bannerId}" was not found on this series.`,
        bannerId: selection.bannerId,
      });
      continue;
    }
    if (design.status !== "ready" || !design.imageAsset?.url) {
      issues.push({
        code: "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
        severity: "error",
        message: `Ad banner design "${selection.bannerId}" is not ready yet (status "${design.status}").`,
        bannerId: selection.bannerId,
      });
      continue;
    }

    if (selection.timing?.mode === "window") {
      const { startSec, durationSec } = selection.timing;
      const validWindow =
        Number.isFinite(startSec) &&
        startSec >= 0 &&
        Number.isFinite(durationSec) &&
        durationSec > 0;
      if (!validWindow) {
        issues.push({
          code: "VD_EPISODE_AD_BANNER_INVALID_WINDOW",
          severity: "error",
          message: `Ad banner design "${selection.bannerId}" has an invalid window timing (startSec=${startSec}, durationSec=${durationSec}).`,
          bannerId: selection.bannerId,
        });
      }
    }
  }

  issues.push(
    ...findEpisodeAdBannerFullscreenOverlaps(plan.selections, designsById)
  );

  return issues;
}

/** Compact per-design projection for `getEpisodeDetail.adBannerDesignsSummary` — so the workspace can render the per-episode selection UI without a second query. */
export interface VdEpisodeAdBannerDesignSummary {
  id: string;
  placementId: VdAdBannerPlacementId;
  status: VdAdBannerStatus;
  imageUrl?: string;
  label: string;
  defaultTiming: VdAdBannerDesign["defaultTiming"];
  /** True when this series' product is in a regulated category requiring
   *  human approval AND this design has not been approved yet — mirrors
   *  `resolveAdBannerApprovalGate`'s semantics (see that function; computed
   *  fresh from the series' CURRENT `regulatedCategory`/`requireHumanApproval`,
   *  not from this design's possibly-stale stored `approval.required`) so the
   *  workspace shows the SAME exclusion state `assembleEpisodeVideo` will
   *  actually enforce. */
  excludedByApproval: boolean;
}

/** Build `adBannerDesignsSummary` — pure, no DB/network access (the caller resolves `isRegulatedGate` once via the lazy-imported `resolveAdBannerApprovalGate`). */
export function buildAdBannerDesignsSummary(
  designs: VdAdBannerDesign[],
  isRegulatedGate: boolean
): VdEpisodeAdBannerDesignSummary[] {
  return designs.map(design => ({
    id: design.id,
    placementId: design.placementId,
    status: design.status,
    imageUrl: design.imageAsset?.url,
    label: design.copy.headline || design.stylePresetId,
    defaultTiming: design.defaultTiming,
    excludedByApproval: isRegulatedGate && !design.approval?.approvedAt,
  }));
}

export interface VdEpisodeAdBannerExclusion {
  bannerId: string;
  code:
    | "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY"
    | "VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED";
  message: string;
}

/**
 * Resolve an episode's saved `adBannerPlan` into the render engine's
 * `RunAssemblyJobBannerInput[]` contract (`verticalDramaEpisodeVideoAssembly.ts`).
 * Returns `{banners: []}` (a complete no-op) when the plan is
 * absent/disabled/empty, so `assembleEpisodeVideo`'s existing byte-identical-
 * when-off guarantee holds. `"entire"` mode resolves its ADVISORY window to
 * `[0, targetDurationSeconds]` — the episode's TARGET duration is the only
 * total-duration figure available this early (the render job only learns the
 * REAL probed duration after downloading clips, deep inside `runAssemblyJob`,
 * long after this mutation has already returned a `jobId`) — AND sets
 * `entire: true` on the banner input so `runAssemblyJob` re-resolves the
 * window to the REAL probed duration post-probe (task #21 phase B fix; see
 * `RunAssemblyJobBannerInput.entire`'s own doc comment for the full
 * investigation this closes out — previously a real duration SHORTER than
 * `targetDurationSeconds` made the render engine reject the banner as
 * out-of-bounds and fail the WHOLE job). Designs gated by the
 * regulated-category human-approval requirement (`resolveAdBannerApprovalGate`)
 * are EXCLUDED (not just skipped silently) so the caller can surface a warning.
 */
async function resolveEpisodeAdBannerRunInputs(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  plan: VdEpisodeAdBannerPlan | null;
  targetDurationSeconds: number;
}): Promise<{
  banners: RunAssemblyJobBannerInput[];
  excluded: VdEpisodeAdBannerExclusion[];
}> {
  if (!params.plan?.enabled || params.plan.selections.length === 0) {
    return { banners: [], excluded: [] };
  }

  const { rawProductTieIn, designs } = await loadSeriesAdBannerContext(
    params.tenantId,
    params.userId,
    params.seriesId
  );
  const designsById = new Map(designs.map(d => [d.id, d]));
  const productContext = readAdBannerProductContext(rawProductTieIn);
  const { resolveAdBannerApprovalGate } =
    await import("../services/verticalDramaAdBanner");
  const isRegulatedGate = resolveAdBannerApprovalGate(
    productContext.regulatedCategory,
    productContext.requireHumanApproval
  );

  const banners: RunAssemblyJobBannerInput[] = [];
  const excluded: VdEpisodeAdBannerExclusion[] = [];

  for (const selection of params.plan.selections) {
    const design = designsById.get(selection.bannerId);
    if (!design || design.status !== "ready" || !design.imageAsset?.url) {
      excluded.push({
        bannerId: selection.bannerId,
        code: "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
        message: `Ad banner design "${selection.bannerId}" is missing, not ready, or has no rendered image — excluded from this render.`,
      });
      continue;
    }
    if (isRegulatedGate && !design.approval?.approvedAt) {
      excluded.push({
        bannerId: selection.bannerId,
        code: "VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED",
        message: `Ad banner design "${selection.bannerId}" requires human approval before it can be included in a render — excluded from this render.`,
      });
      continue;
    }

    const window = resolveEpisodeAdBannerEffectiveWindow(selection, design);
    const placement = getAdBannerPlacementPreset(design.placementId);
    const isEntire = window.mode === "entire";
    const endSec = isEntire ? params.targetDurationSeconds : window.endSec;
    banners.push({
      imageUrl: design.imageAsset.url,
      placementId: design.placementId,
      sideAlign: design.sideAlign,
      startSec: window.startSec,
      endSec,
      fadeSec: placement.fadeSec,
      // Task #21 phase B fix — see this function's own doc comment.
      ...(isEntire ? { entire: true as const } : {}),
    });
  }

  return { banners, excluded };
}

/* -------------------------------------------------------------------------- */
/* W12-A voice chain — pure helpers (DB-free, unit-testable directly)         */
/* -------------------------------------------------------------------------- */

/**
 * Select the separate-TTS plan items still needing a submission: not
 * `blocked` (missing voice id — see `verticalDramaDialogueAudio.ts`'s
 * `buildSeparateTtsPlan`) and not already carrying a pending or completed
 * audio task (resumability — a retried/re-run call skips lines a prior call
 * already submitted). Returns items in their original plan order. Pure,
 * DB-free — exported for direct unit testing, same "pure-ish exported
 * helper" convention as `assertModelSelectable`/`resolveEpisodeImageModelId`.
 */
export function selectPendingDialogueAudioLines(
  plan: VerticalDramaDialogueAudioPlan | null | undefined
): VerticalDramaSeparateTtsPlanItem[] {
  if (!plan?.separateTtsPlan) return [];
  return plan.separateTtsPlan.items.filter(
    item =>
      !item.blocked &&
      !item.audioTask?.pendingTaskId &&
      !item.audioTask?.audioUrl
  );
}

/**
 * Sum a set of separate-TTS items' estimated credit cost against EACH item's
 * OWN resolved voice-model pricing (different characters may be cast to
 * different models/providers within one episode) — a strict generalization
 * of "pendingLines × per-line estimate" that degenerates to exactly that
 * formula when every line shares one model. Falls back to
 * `{creditCost: 10, configJson: null}` for a `voiceModelId` with no
 * `media_models` row (stale/deleted model) — same fallback convention this
 * router already uses for image/video pricing (see `generateVideoClip`
 * above). Pure — the caller resolves `pricingByModelId` via one batched DB
 * query; this function never touches the DB itself.
 */
export function estimateDialogueAudioBatchCreditCost(
  items: VerticalDramaSeparateTtsPlanItem[],
  pricingByModelId: Map<
    string,
    { creditCost: number; configJson: Record<string, unknown> | null }
  >
): number {
  const DEFAULT_AUDIO_PRICING = {
    creditCost: 10,
    configJson: null as Record<string, unknown> | null,
  };
  return items.reduce((total, item) => {
    const pricing =
      (item.voiceModelId && pricingByModelId.get(item.voiceModelId)) ||
      DEFAULT_AUDIO_PRICING;
    return total + calculateCreditCost(pricing, { text: item.text });
  }, 0);
}

/**
 * Build the per-line dialogue-audio timeline for `assemblyManifest`
 * (spec item 7, W12-A) from the episode's persisted dialogue-audio plan: one
 * entry per separate-TTS item that carries a COMPLETED audio task
 * (`audioTask.mediaAssetId`, preferred, else `.audioUrl`), cross-referenced
 * against `plan.dialogueLines` (by `lineId`) for `shotNumber`/`clipNumber`/
 * timing (`start`/`end` seconds on the shot's local timeline — see
 * `VerticalDramaDialogueLine`). Pure, DB-free. Empty when the plan has no
 * separate-TTS strategy, or no line has a completed audio task yet.
 *
 * IMPORTANT — see `VerticalDramaAssemblyManifest.dialogueAudioTimeline`'s own
 * doc comment in `@shared/verticalDramaSeries/assembly`: this is a
 * forward-compatible DATA CONTRACT only. Nothing in this wave wires the
 * result into the real ffmpeg concat (`verticalDramaEpisodeVideoAssembly.ts`)
 * or the manifest-planning stage (`verticalDramaAssembly.ts`) — both are
 * investigated, unmodified, and documented at `assembleEpisodeVideo`'s own
 * call site below.
 */
export function buildDialogueAudioTimelineFromPlan(
  plan: VerticalDramaDialogueAudioPlan | null | undefined
): NonNullable<VerticalDramaAssemblyManifest["dialogueAudioTimeline"]> {
  if (!plan?.separateTtsPlan) return [];
  const lineById = new Map(plan.dialogueLines.map(line => [line.lineId, line]));
  const timeline: NonNullable<
    VerticalDramaAssemblyManifest["dialogueAudioTimeline"]
  > = [];
  for (const item of plan.separateTtsPlan.items) {
    const audioAssetId =
      item.audioTask?.mediaAssetId || item.audioTask?.audioUrl;
    if (!audioAssetId) continue;
    const line = lineById.get(item.lineId);
    if (!line) continue;
    timeline.push({
      lineId: item.lineId,
      shotNumber: line.shotNumber,
      ...(line.clipNumber != null ? { clipNumber: line.clipNumber } : {}),
      audioAssetId,
      startSeconds: line.start,
      durationSeconds: line.end - line.start,
    });
  }
  return timeline;
}

/**
 * Deep story drafts (W10-B) — resolve whether the CURRENT active breakdown
 * item for `episodeNumber` carries a vetted W10-A `shotDrafts` array, for
 * `getEpisodeDetail`'s `episodeDraftAvailable` evidence field (additive;
 * surfacing this in the wizard/UI is a later wave — this wave only exposes
 * the boolean). Own light `bible`-only query (mirrors
 * `loadEffectiveSeriesVisualIdentity`'s shape above) — `getEpisodeDetail` does
 * not otherwise load the series' `bible` column.
 *
 * Dynamic `import()` — mirrors `runArcDriftCheckAndProposeIfNeeded`'s
 * established convention above: `verticalDramaStoryBible.ts` transitively
 * imports `enabledLlmModels.ts` -> `../routers/llmProviders.ts`'s
 * `adminProcedure`, which this router's OWN test suite's `../../_core/trpc`
 * mock never provides — a static import here would crash every existing
 * test file for this router at import time. The lazy import only ever
 * executes when the `verticalDramaSeriesDeepStoryDrafts` flag is actually
 * on, which no pre-existing test enables.
 */
async function resolveEpisodeDraftAvailable(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeNumber: number
): Promise<boolean> {
  const [seriesRow] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
  const { getActiveBreakdown, readItemShotDrafts } =
    await import("../services/verticalDramaStoryBible");
  const item = getActiveBreakdown(bible).find(
    i => i.episodeNumber === episodeNumber
  );
  return item ? readItemShotDrafts(item) !== null : false;
}

/* -------------------------------------------------------------------------- */
/* Wave-4A (2026-07-07) — quality-loop/tie-in-QC/wizard/preset-mix flags,      */
/* quality-policy resolution, and tie-in QC gate helpers (spec §16.1/§13.1).   */
/* Same "extend the flag-resolution pattern" / "optional chaining" convention */
/* as `resolveVerticalDramaDensityFlags` above.                               */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the four 2026-07-07 flags in one query, ALREADY applying spec §17's
 * dependency chain so every call site gets a single, correct boolean without
 * re-deriving the dependency rule itself:
 *  - `verticalDramaSeriesTieInQc` requires BOTH `verticalDramaSeriesSpeechBudget`
 *    AND `verticalDramaSeriesQualityLoopV2` (its repair path IS the §16.1 loop).
 *  - `verticalDramaSeriesProductionWizard` requires `verticalDramaSeriesQualityLoopV2`
 *    for its gate steps.
 *  - `verticalDramaSeriesPresetMixV2` is independent (§8.2.2 flow-through only).
 */
async function resolveVerticalDramaQualityLoopFlags(tenantId: string): Promise<{
  qualityLoopV2Enabled: boolean;
  tieInQcEnabled: boolean;
  productionWizardEnabled: boolean;
  presetMixV2Enabled: boolean;
  seriesLookLockEnabled: boolean;
  /**
   * W11.6 "Story Lock" (added 2026-07-08) — independent of the other flags
   * above (episode-level repair must stay execution-only whether the caller
   * is on the v1 single-apply path, the v2 loop, or a manual spot repair;
   * none of those require `verticalDramaSeriesQualityLoopV2`).
   */
  storyLockEnabled: boolean;
}> {
  const flags = await getTenantFeatureFlags(tenantId);
  const speechBudgetEnabled = flags?.verticalDramaSeriesSpeechBudget === true;
  const qualityLoopV2Enabled = flags?.verticalDramaSeriesQualityLoopV2 === true;
  return {
    qualityLoopV2Enabled,
    tieInQcEnabled:
      flags?.verticalDramaSeriesTieInQc === true &&
      speechBudgetEnabled &&
      qualityLoopV2Enabled,
    productionWizardEnabled:
      flags?.verticalDramaSeriesProductionWizard === true &&
      qualityLoopV2Enabled,
    presetMixV2Enabled: flags?.verticalDramaSeriesPresetMixV2 === true,
    seriesLookLockEnabled: flags?.verticalDramaSeriesLookLock === true,
    storyLockEnabled: flags?.verticalDramaSeriesStoryLock === true,
  };
}

/**
 * Tenant-default quality-policy layer (spec §16.1 resolution chain: series
 * column -> tenant default -> built-in defaults). SmartSpecPro has no
 * per-tenant quality-policy settings surface yet, so this is a documented
 * hook that always resolves to `undefined` for now — `resolveQualityPolicy`
 * (already shipped) already treats an `undefined` tenant layer as "fall
 * through to built-in defaults", so wiring a real tenant-settings read into
 * this ONE spot later (e.g. once a `system_settings` row exists for it)
 * requires no call-site changes anywhere else in this router.
 */
function resolveVerticalDramaTenantQualityPolicy(
  _tenantId: string
): Partial<VerticalDramaQualityPolicy> | undefined {
  return undefined;
}

/** Load + resolve a series' effective quality policy (spec §16.1 chain). Tenant + user + series scoped. */
async function loadVerticalDramaQualityPolicy(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<VerticalDramaQualityPolicy> {
  const [row] = await db
    .select({ qualityPolicy: verticalDramaSeries.qualityPolicy })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  return resolveQualityPolicy(
    (row?.qualityPolicy as Partial<VerticalDramaQualityPolicy> | null) ?? null,
    resolveVerticalDramaTenantQualityPolicy(tenantId)
  );
}

/**
 * Preset visual identity flow-through (spec §8.2.2 flow-through rule) —
 * reads `bible.presetVisualIdentity` (stamped by `verticalDramaSeries.ts`'s
 * `create`, see `stampPresetVisualIdentityIntoBible`) off the caller-owned
 * series. Best-effort: `undefined` for a legacy/non-preset series or a
 * malformed value — never throws (this is an enrichment, never required).
 * Deliberately re-implemented HERE (rather than importing
 * `readPresetVisualIdentityFromBible` from
 * `verticalDramaCharacterImageGeneration.ts`) — that module transitively
 * imports `verticalDramaStoryBible.ts` (see this file's `appendPreset...`
 * import doc comment above for why a static import of it is unsafe here).
 */
async function loadEffectiveSeriesVisualIdentity(
  tenantId: string,
  userId: number,
  seriesId: number,
  flags?: { presetMixV2Enabled: boolean; seriesLookLockEnabled: boolean },
) {
  const [row] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const resolvedFlags = flags ?? await resolveVerticalDramaQualityLoopFlags(tenantId);
  return resolveEffectiveSeriesVisualIdentity({
    bible: row?.bible,
    presetMixEnabled: resolvedFlags.presetMixV2Enabled,
    lookLockEnabled: resolvedFlags.seriesLookLockEnabled,
  });
}

/**
 * Best-effort per-shot dialogue LINE TEXT map for `buildTieInQualityReport`'s
 * `dialogueLinesByShot` input (spec §13.1) — a lighter-weight extraction than
 * `resolveShotDialogueLines`'s full canonical chain (script-fallback tagging,
 * known-speaker mapping, etc.): the tie-in report only needs raw spoken TEXT
 * for keyword matching (product-name/benefit mentions, ad-speak lexicon), not
 * a validated dialogue-line object. Sources, per shot: the persisted
 * `dialogueAudioPlan.dialogue_lines[]` (matched by `shot_number`), falling
 * back to the storyboard shot's own `dialogue_excerpt`/`subtitle_text` when no
 * dialogue-plan line exists for that shot. Never throws on malformed input.
 */
function buildTieInReportDialogueLinesByShot(
  dialogueAudioPlan: Record<string, unknown> | null,
  storyboard: Record<string, unknown> | null
): Map<number, string[]> {
  const byShot = new Map<number, string[]>();
  const rawLines = Array.isArray(
    (dialogueAudioPlan as { dialogue_lines?: unknown } | null)?.dialogue_lines
  )
    ? (dialogueAudioPlan as { dialogue_lines: unknown[] }).dialogue_lines
    : [];
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const shotNumber =
      typeof line.shot_number === "number"
        ? line.shot_number
        : typeof line.shotNumber === "number"
          ? line.shotNumber
          : undefined;
    const text =
      typeof line.dialogue_line === "string"
        ? line.dialogue_line
        : typeof line.text === "string"
          ? line.text
          : undefined;
    if (shotNumber === undefined || !text) continue;
    const bucket = byShot.get(shotNumber);
    if (bucket) bucket.push(text);
    else byShot.set(shotNumber, [text]);
  }
  const rawShots = Array.isArray(
    (storyboard as { shots?: unknown } | null)?.shots
  )
    ? (storyboard as { shots: unknown[] }).shots
    : [];
  for (const rawShot of rawShots) {
    if (!rawShot || typeof rawShot !== "object") continue;
    const shot = rawShot as Record<string, unknown>;
    const shotNumber =
      typeof shot.shot_number === "number"
        ? shot.shot_number
        : typeof shot.shotNumber === "number"
          ? shot.shotNumber
          : undefined;
    if (shotNumber === undefined || byShot.has(shotNumber)) continue;
    const excerpt =
      typeof shot.dialogue_excerpt === "string"
        ? shot.dialogue_excerpt
        : typeof shot.subtitle_text === "string"
          ? shot.subtitle_text
          : undefined;
    if (excerpt) byShot.set(shotNumber, [excerpt]);
  }
  return byShot;
}

/**
 * Recent tie-in placement history for `evaluateFatigue` (spec §13), derived
 * from each of the last `VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW` episodes' own
 * persisted `script.product_tie_in_plan` — same normalization
 * (`extractShotProductPlacements`) used everywhere else a script's tie-in
 * plan is read, so this always agrees with what `visualShotCount` etc. would
 * compute for that episode.
 */
async function loadSeriesTieInPlacementHistory(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<Array<{ episodeNumber: number; hadTieIn: boolean }>> {
  const rows = await db
    .select({
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      script: verticalDramaEpisodes.script,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.seriesId, seriesId)
      )
    )
    .orderBy(desc(verticalDramaEpisodes.episodeNumber))
    .limit(VERTICAL_DRAMA_TIE_IN_FATIGUE_WINDOW);
  return rows.map((r: { episodeNumber: number; script: unknown }) => ({
    episodeNumber: r.episodeNumber,
    hadTieIn:
      extractShotProductPlacements(
        (r.script as { product_tie_in_plan?: unknown } | null)
          ?.product_tie_in_plan
      ).length > 0,
  }));
}

/**
 * Episode numbers that already have a persisted `script` (task #31, spec
 * §7.7.3) — a `proposeTieInDeferReplan` re-placement TARGET must not be one
 * of these (spec: "ยังไม่ผลิต", not yet produced). Whole-series scan
 * (unlike `loadSeriesTieInPlacementHistory`'s 10-episode fatigue-window
 * `.limit`) — a season can run up to 100 episodes, and any of them could in
 * principle be the nearest eligible future target.
 */
async function loadProducedEpisodeNumbers(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<number[]> {
  const rows = await db
    .select({
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      script: verticalDramaEpisodes.script,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.seriesId, seriesId)
      )
    );
  return rows
    .filter((r: { episodeNumber: number; script: unknown }) => r.script != null)
    .map((r: { episodeNumber: number; script: unknown }) => r.episodeNumber);
}

/**
 * Best-effort read of the ACTIVE breakdown item's season-planned tie-in
 * placement for one episode (task #31, spec §7.7.2/§7.7.3) — backs
 * `getEpisodeDetail`'s `seasonTieInPlacement` field (the Wizard/
 * `VerticalDramaTieInReportCard` status line: "ตามแผนซีซั่น: ตอนนี้มีสินค้า
 * (ย้ายมาจากตอนที่ X)"). `null` for a legacy series whose breakdown has
 * never adopted `tieIn` planning (grandfather — spec §7.7.2 hard rule 6),
 * or on any read failure (never throws — this is a display-only
 * enhancement, never allowed to fail `getEpisodeDetail`). Dynamic
 * `import()` of `verticalDramaStoryBible.ts` mirrors
 * `runArcDriftCheckAndProposeIfNeeded`'s own doc comment (a static import
 * transitively pulls in `adminProcedure` and crashes every pre-existing
 * test file for this router at import time).
 */
async function resolveSeasonTieInPlacementForEpisode(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeNumber: number
): Promise<VerticalDramaEpisodeTieInPlacement | null> {
  try {
    const { getActiveBreakdown } =
      await import("../services/verticalDramaStoryBible");
    const [seriesRow] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, seriesId),
          eq(verticalDramaSeries.tenantId, tenantId),
          eq(verticalDramaSeries.userId, userId)
        )
      )
      .limit(1);
    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const activeItem = getActiveBreakdown(bible).find(
      item => item.episodeNumber === episodeNumber
    );
    return (
      (activeItem as { tieIn?: VerticalDramaEpisodeTieInPlacement } | undefined)
        ?.tieIn ?? null
    );
  } catch (err) {
    debugError(
      "verticalDramaEpisodes.getEpisodeDetail",
      `season tie-in placement lookup failed (episodeNumber=${episodeNumber})`,
      err
    );
    return null;
  }
}

/**
 * Compact per-episode PLAN shape for `getEpisodeDetail`'s `episodePlan` field
 * (planning/`polished-toasting-gadget.md` Part A1) — ชื่อตอน/เรื่องย่อ/
 * จุดดำเนินเรื่อง/จุดค้าง read straight from the series bible's ACTIVE
 * breakdown item for this episode. Unlike the Wave-4A `wizard`/flag-gated
 * fields above, this is plain read-only reference data with no feature-flag
 * gate — resolved unconditionally.
 */
export interface VerticalDramaEpisodePlanSummary {
  workingTitle: string;
  logline: string;
  keyBeats: string[];
  cliffhangerLine: string | null;
  /** Latest Overview shot summaries; omitted when the active item has no deep draft. */
  shotDrafts?: Array<{
    shotNumber: number;
    summary: string;
    /** Canonical per-shot dialogue (speaker/line only); [] when the shot has none. */
    dialogueLines: Array<{ speaker: string; line: string }>;
    /** Present only for wordless shots (e.g. "action_visual", "establishing"). */
    silenceIntent?: string;
  }>;
}

/**
 * Best-effort read of the ACTIVE breakdown item's plan fields for one
 * episode — backs `getEpisodeDetail`'s `episodePlan`. `null` when no
 * matching drafted item exists yet (episode ahead of the breakdown, or a
 * series that has never run "Generate story"), or on any read failure
 * (never throws — display-only, same defensive contract as
 * `resolveSeasonTieInPlacementForEpisode` above). Mirrors that function's
 * own dynamic-import + series-row-read pattern (a static import of
 * `verticalDramaStoryBible.ts` transitively pulls in `adminProcedure` and
 * crashes every pre-existing test file for this router at import time).
 */
async function resolveEpisodePlanForEpisode(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeNumber: number
): Promise<VerticalDramaEpisodePlanSummary | null> {
  try {
    const { getActiveBreakdown, readItemCliffhangerLine, readItemShotDrafts } = await import(
      "../services/verticalDramaStoryBible"
    );
    const [seriesRow] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, seriesId),
          eq(verticalDramaSeries.tenantId, tenantId),
          eq(verticalDramaSeries.userId, userId)
        )
      )
      .limit(1);
    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const activeItem = getActiveBreakdown(bible).find(
      item => item.episodeNumber === episodeNumber
    );
    if (!activeItem) return null;
    const shotDrafts =
      typeof readItemShotDrafts === "function"
        ? readItemShotDrafts(activeItem)
        : null;
    return {
      workingTitle: activeItem.workingTitle,
      logline: activeItem.logline,
      keyBeats: activeItem.keyBeats,
      cliffhangerLine: readItemCliffhangerLine(activeItem) ?? null,
      ...(shotDrafts
        ? {
            shotDrafts: shotDrafts.map(shot => ({
              shotNumber: shot.shot_number,
              summary: shot.summary,
              dialogueLines: (shot.dialogue_lines ?? []).map(line => ({
                speaker: line.speaker,
                line: line.line,
              })),
              ...(shot.silence_intent ? { silenceIntent: shot.silence_intent } : {}),
            })),
          }
        : {}),
    };
  } catch (err) {
    debugError(
      "verticalDramaEpisodes.getEpisodeDetail",
      `episode plan lookup failed (episodeNumber=${episodeNumber})`,
      err
    );
    return null;
  }
}

/**
 * Part B2/B3 (planning/`polished-toasting-gadget.md`) — maps a stored series
 * locale onto `StoryScriptLang`'s narrower `"th" | "en"` for
 * `formatStoryScriptEpisodePlanContext`. Mirrors
 * `verticalDramaEpisodePipeline.ts`'s own identically-named local helper
 * (itself mirroring `verticalDramaImproveScript.ts`'s file-local,
 * unexported `resolveScriptLangFromLocale`) — duplicated locally rather than
 * exporting/importing across files for one trivial ternary.
 */
function resolveStoryScriptLangFromLocale(
  locale: string | null | undefined
): StoryScriptLang {
  return locale === "th" ? "th" : "en";
}

/** Non-pipeline stage tag for the tie-in quality-report artifact (spec §13.1), mirrors `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc comment. */
const VD_TIE_IN_QUALITY_REPORT_STAGE_TAG = "tie_in_quality_report" as const;

/**
 * Non-pipeline stage tag used ONLY to back up an episode's PRIOR `script`
 * jsonb before `deferEpisodeTieIn` deterministically strips its tie-in plan
 * (spec §13.1 defer path) — the "supersede, never delete" backup, mirrors
 * `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc comment.
 */
const VD_TIE_IN_DEFER_PRIOR_SCRIPT_STAGE_TAG =
  "tie_in_defer_prior_script" as const;

/** Persist a tie-in quality report via the run/artifact ledger (append-only). Returns the new artifact's id. */
async function persistTieInQualityReportArtifact(
  owner: EpisodeRunOwner,
  report: import("../services/verticalDramaProductTieIn").VerticalDramaTieInQualityReport
): Promise<string> {
  const [runRow] = await db
    .insert(verticalDramaEpisodeRuns)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      stage: VD_TIE_IN_QUALITY_REPORT_STAGE_TAG,
      runMode: "full",
      status: report.passed ? "succeeded" : "failed",
      nextAction: report.passed ? "none" : "repair",
      artifactIds: [],
      warnings: [],
      errors: [],
    })
    .returning({ id: verticalDramaEpisodeRuns.id });
  const [artifactRow] = await db
    .insert(verticalDramaRunArtifacts)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId: runRow.id,
      stage: VD_TIE_IN_QUALITY_REPORT_STAGE_TAG,
      jsonPayload: report as unknown as Record<string, unknown>,
      mediaAssetIds: null,
    })
    .returning({ id: verticalDramaRunArtifacts.id });
  await db
    .update(verticalDramaEpisodeRuns)
    .set({ artifactIds: [String(artifactRow.id)] })
    .where(eq(verticalDramaEpisodeRuns.id, runRow.id));
  return String(artifactRow.id);
}

/** Load the most recently persisted tie-in quality report, or `null` if none has been produced yet. */
async function loadLatestTieInQualityReport(
  owner: EpisodeRunOwner
): Promise<
  | import("../services/verticalDramaProductTieIn").VerticalDramaTieInQualityReport
  | null
> {
  const [row] = await db
    .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
    .from(verticalDramaRunArtifacts)
    .where(
      and(
        eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
        eq(verticalDramaRunArtifacts.userId, owner.userId),
        eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
        eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        eq(verticalDramaRunArtifacts.stage, VD_TIE_IN_QUALITY_REPORT_STAGE_TAG)
      )
    )
    .orderBy(desc(verticalDramaRunArtifacts.id))
    .limit(1);
  if (!row?.jsonPayload) return null;
  return row.jsonPayload as import("../services/verticalDramaProductTieIn").VerticalDramaTieInQualityReport;
}

/**
 * Build + persist the tie-in naturalness report (spec §13.1) from a
 * freshly-produced quality review, when tie-in QC applies to this episode
 * (flag on + series tie-in config enabled + the episode actually carries a
 * placement). FOLDED INTO the quality-review flow (documented choice, this
 * wave) rather than a separate `runTieInQualityReport` procedure — the
 * report's qualitative dimension is read from the SAME scorecard the review
 * just produced (`scorecard.tie_in_naturalness`), so no second LLM call is
 * needed; `runEpisodeQualityReview` and `applyQualityReviewSuggestions`
 * (both v1 and loop mode) all call this right after persisting their review.
 * No-op (returns `null`) when tie-in QC does not apply to this episode.
 */
async function maybeBuildAndPersistTieInQualityReport(params: {
  owner: EpisodeRunOwner;
  tieInQcEnabled: boolean;
  script: Record<string, unknown> | null;
  storyboard: Record<string, unknown> | null;
  dialogueAudioPlan: Record<string, unknown> | null;
  review: EpisodeQualityReviewOutput;
  policy: VerticalDramaQualityPolicy;
}): Promise<
  | import("../services/verticalDramaProductTieIn").VerticalDramaTieInQualityReport
  | null
> {
  if (!params.tieInQcEnabled || !params.script) return null;

  const [tieInSeriesRow] = await db
    .select({ productTieIn: verticalDramaSeries.productTieIn })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, params.owner.seriesId),
        eq(verticalDramaSeries.tenantId, params.owner.tenantId),
        eq(verticalDramaSeries.userId, params.owner.userId)
      )
    )
    .limit(1);
  const tieInConfig =
    tieInSeriesRow?.productTieIn as VerticalDramaProductTieInConfig | null;
  if (!tieInConfig?.enabled) return null;

  const placements = extractShotProductPlacements(
    (params.script as { product_tie_in_plan?: unknown }).product_tie_in_plan
  );
  if (tieInShotNumberSet(placements).size === 0) return null;

  const history = await loadSeriesTieInPlacementHistory(
    params.owner.tenantId,
    params.owner.userId,
    params.owner.seriesId
  );
  const fatigue = evaluateFatigue(
    history,
    tieInConfig.maxEpisodesWithTieInPerTenEpisodes
  );

  const report = buildTieInQualityReport({
    script: params.script,
    storyboard: params.storyboard,
    dialogueLinesByShot: buildTieInReportDialogueLinesByShot(
      params.dialogueAudioPlan,
      params.storyboard
    ),
    tieInConfig,
    scorecardV2: {
      tie_in_naturalness: params.review.scorecard?.tie_in_naturalness ?? null,
      tie_in_assessment: params.review.tie_in_assessment,
    },
    fatigueContext: fatigue,
    policy: {
      tieInMinNaturalnessScore: params.policy.tieInMinNaturalnessScore,
    },
  });
  await persistTieInQualityReportArtifact(params.owner, report);
  return report;
}

/**
 * Spec §13.1 gate: REJECT paid generation (and Storyboard Review handoff)
 * for a tie-in-carrying shot when the episode's LATEST tie-in quality report
 * is failing or missing. Non-tie-in shots/episodes are unaffected — a no-op
 * (returns without throwing) whenever the episode carries no tie-in
 * placement at all, or `shotNumbers` names only non-tie-in shots. Stable
 * error code `VD_TIE_IN_BELOW_FLOOR` is prefixed onto the thrown message
 * (this codebase's other `VD_*` codes are structured-payload fields, not
 * TRPCError codes — a message prefix is the simplest stable, greppable/
 * assertable marker without introducing a new error-shape convention here).
 * Grandfathering (spec §17): only called from generation entry points — a
 * pre-existing (already-generated) shot/episode is never retro-invalidated.
 */
async function assertTieInQualityGatePassed(params: {
  owner: EpisodeRunOwner;
  tieInQcEnabled: boolean;
  script: Record<string, unknown> | null;
  /** Omitted = whole-episode check (any tie-in placement at all) — used by the Storyboard Review handoff gate. */
  shotNumbers?: number[];
}): Promise<void> {
  if (!params.tieInQcEnabled || !params.script) return;
  const placements = extractShotProductPlacements(
    (params.script as { product_tie_in_plan?: unknown }).product_tie_in_plan
  );
  const tieInShots = tieInShotNumberSet(placements);
  if (tieInShots.size === 0) return;
  const affectsTieInShot =
    params.shotNumbers === undefined ||
    params.shotNumbers.some(n => tieInShots.has(n));
  if (!affectsTieInShot) return;

  const report = await loadLatestTieInQualityReport(params.owner);
  if (!report || !report.passed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: report
        ? `VD_TIE_IN_BELOW_FLOOR: Tie-in naturalness report (score ${report.naturalnessScore}) is below the pass floor — repair, remove, or defer the tie-in before generating.`
        : "VD_TIE_IN_BELOW_FLOOR: No tie-in naturalness report yet — run the quality review before generating this shot.",
    });
  }
}

/**
 * Task #26 (data sanity — episode number beyond the planned season size,
 * e.g. episode 11 materialized/generated while the story bible's season
 * plan only covers episodes 1-10) — resolve whether `episodeNumber` is
 * covered by the series' season plan. Reads BOTH breakdown sources this
 * router/pipeline's various readers already use independently:
 *  - `getActiveBreakdown` (spec §7.7.2/§7.7.3's versioned/legacy-fallback
 *    resolver — what `resolveEpisodeDraftAvailable`,
 *    `resolveSeasonTieInPlacementForEpisode`, and
 *    `runArcDriftCheckAndProposeIfNeeded` above already read), and
 *  - the raw legacy top-level `bible.episodeBreakdown` array (what
 *    `verticalDramaEpisodePipeline.ts`'s `generateRealScript`/
 *    `generateRealStoryboard` read directly, and what THIS file's
 *    `generateNextEpisodes` above appends every Mode-A/Mode-B entry to).
 *
 * A UNION of the two, not `getActiveBreakdown` alone — specifically so an
 * episode legitimately materialized/continued via `generateNextEpisodes`
 * (which only ever appends to the top-level array, never to
 * `breakdownVersions[]`) is never misreported as "beyond plan" for a
 * series that has ALSO adopted versioned breakdowns via Deep Story Drafts
 * or an approved Arc Replan (`verticalDramaStoryBible.ts`'s
 * `appendBreakdownVersion`). This does NOT close every gap: the two
 * sources can still disagree on an item's *content* (not just
 * presence/absence) for such a series — reported, not fixed here, since
 * closing it means changing `generateNextEpisodes`'s persistence target,
 * out of this task's scope.
 *
 * `"no_plan"` (grandfathered — spec §17 "legacy data is read tolerantly,
 * never migrated or mutated") when NEITHER source has ANY items at all —
 * a pure pre-planning-reform series has nothing to "extend" and this check
 * must stay a no-op for it, exactly like every sibling reader above.
 */
async function resolveEpisodeBreakdownStatus(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeNumber: number
): Promise<{
  status: "matched" | "beyond_plan" | "no_plan";
  plannedCount: number;
}> {
  const [seriesRow] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
  const { getActiveBreakdown } =
    await import("../services/verticalDramaStoryBible");
  const activeBreakdown = getActiveBreakdown(bible);
  const legacyBreakdown: EpisodeBreakdownItem[] = Array.isArray(
    (bible as { episodeBreakdown?: unknown } | null)?.episodeBreakdown
  )
    ? (bible as { episodeBreakdown: EpisodeBreakdownItem[] }).episodeBreakdown
    : [];
  const plannedCount = Math.max(activeBreakdown.length, legacyBreakdown.length);
  if (plannedCount === 0) return { status: "no_plan", plannedCount: 0 };
  const matched =
    activeBreakdown.some(item => item.episodeNumber === episodeNumber) ||
    legacyBreakdown.some(item => Number(item.episodeNumber) === episodeNumber);
  return { status: matched ? "matched" : "beyond_plan", plannedCount };
}

/**
 * Task #26 — REJECT a fresh (non-repair) `plan_episode_script` generation
 * attempt for an episode `resolveEpisodeBreakdownStatus` reports as
 * `"beyond_plan"`, INSTEAD of letting `verticalDramaEpisodePipeline.ts`'s
 * `generateRealScript` silently build `storySource.logline`/`keyBeats` as
 * `undefined` and burn an LLM call on an ungrounded prompt. Called from
 * `runStage`/`regenerateStage`/`runEpisode` BEFORE the pipeline is ever
 * invoked — never from inside the pipeline itself, which never throws for
 * a generation-related condition (see `generateRealScript`'s call site in
 * `runStage`'s catch-and-map convention: a plain throw here would just be
 * swallowed into a `status: "failed"` `RunResult` with a misleading
 * "Repair" next_action, which cannot fix a missing season-plan item).
 * No-op (returns) for `"no_plan"` (grandfathered) or `"matched"`. Mirrors
 * `assertTieInQualityGatePassed`'s exact shape: stable error code
 * `VD_EPISODE_BEYOND_PLAN` prefixed onto the thrown message (this
 * codebase's other `VD_*` codes are structured-payload fields, not TRPCError
 * codes — see that function's doc comment).
 */
async function assertEpisodeWithinSeasonPlan(
  tenantId: string,
  userId: number,
  seriesId: number,
  episodeNumber: number
): Promise<void> {
  const { status, plannedCount } = await resolveEpisodeBreakdownStatus(
    tenantId,
    userId,
    seriesId,
    episodeNumber
  );
  if (status !== "beyond_plan") return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `VD_EPISODE_BEYOND_PLAN: ตอนที่ ${episodeNumber} อยู่นอกแผนซีซั่นปัจจุบัน (แผนมี ${plannedCount} ตอน) — กรุณาขยายแผนซีซั่นที่หน้าภาพรวมของซีรีส์ก่อนสร้างบทของตอนนี้`,
  });
}

/**
 * Non-pipeline stage tag (Wave-7D) for the expert-mode quality-floor-
 * override audit record — spec §16.1 acceptance: "guided mode cannot reach
 * paid video generation with a below-floor scorecard, expert mode can
 * (recorded as an explicit override)". Persisted through the SAME
 * run/artifact ledger tables as every other non-pipeline audit trail in this
 * file — mirrors `VD_TIE_IN_QUALITY_REPORT_STAGE_TAG`'s doc comment exactly
 * (a free-form varchar `stage` tag, not a `VerticalDramaPipelineStage`
 * member, so no pipeline-sequencing code is affected; no schema change).
 */
const VD_QUALITY_FLOOR_OVERRIDE_STAGE_TAG =
  "quality_floor_override_audit" as const;

/**
 * Spec §16.1 acceptance criterion: "guided mode cannot reach paid video
 * generation with a below-floor scorecard, expert mode can (recorded as an
 * explicit override)". Called from every PAID start-frame/video-clip
 * generation procedure, AFTER the tie-in gate has already let the call
 * proceed — this function itself NEVER blocks or throws (best-effort side
 * effect layered onto an ALREADY-COMMITTED generation decision, the same
 * convention `runArcDriftCheckAndProposeIfNeeded` documents at length).
 *
 * No-op unless ALL of:
 *  1. `policy.blockPaidGenerationBelowFloor` is `false` — i.e. EXPERT mode.
 *     Guided mode (`true`, the built-in default) is not this function's
 *     concern: the spec's guided-mode BLOCKING gate for a general (non-tie-
 *     in) below-floor scorecard is a separate, documented backlog item (see
 *     the plan's progress log) — this function only RECORDS, it never
 *     itself decides to block anything;
 *  2. the episode already has a persisted quality-review scorecard AND it
 *     currently fails `evaluateScorecardAgainstPolicy` against the resolved
 *     policy (no scorecard yet = nothing to evaluate = no-op, not an error).
 *
 * Callers only invoke this inside their own `if (qualityLoopV2Enabled)`
 * branch (mirrors `assertTieInQualityGatePassed`'s "caller gates the flag"
 * convention) — this function does not re-check that flag itself.
 *
 * One ledger row per call — NOT deduplicated across shots/clips in the same
 * run. The spec only requires the override to be recorded, and a per-
 * procedure-call emission keeps this function simple/stateless; see each
 * call site's doc comment for why this is an accepted, documented choice.
 */
async function maybeRecordQualityFloorOverrideAudit(params: {
  owner: EpisodeRunOwner;
  policy: VerticalDramaQualityPolicy;
  source: string;
}): Promise<void> {
  if (params.policy.blockPaidGenerationBelowFloor) return;
  try {
    const [reviewArtifactId, review] = await Promise.all([
      loadLatestQualityReviewArtifactId(params.owner),
      loadLatestQualityReview(params.owner),
    ]);
    if (!reviewArtifactId || !review?.scorecard) return;

    const scorecard =
      review.scorecard as unknown as VerticalDramaQualityScorecardDimensions;
    const evaluation = evaluateScorecardAgainstPolicy(scorecard, params.policy);
    if (evaluation.passed) return;

    const [runRow] = await db
      .insert(verticalDramaEpisodeRuns)
      .values({
        tenantId: params.owner.tenantId,
        userId: params.owner.userId,
        seriesId: params.owner.seriesId,
        episodeId: params.owner.episodeId,
        stage: VD_QUALITY_FLOOR_OVERRIDE_STAGE_TAG,
        runMode: "full",
        status: "succeeded",
        nextAction: "none",
        artifactIds: [],
        warnings: [],
        errors: [],
      })
      .returning({ id: verticalDramaEpisodeRuns.id });
    const [artifactRow] = await db
      .insert(verticalDramaRunArtifacts)
      .values({
        tenantId: params.owner.tenantId,
        userId: params.owner.userId,
        seriesId: params.owner.seriesId,
        episodeId: params.owner.episodeId,
        runId: runRow.id,
        stage: VD_QUALITY_FLOOR_OVERRIDE_STAGE_TAG,
        jsonPayload: {
          code: "VD_QUALITY_FLOOR_OVERRIDE",
          userId: params.owner.userId,
          episodeId: params.owner.episodeId,
          reviewArtifactId,
          overall: scorecard.overall,
          minOverall: params.policy.minOverall,
          minPerDimension: params.policy.minPerDimension,
          failingDimensions: evaluation.failingDimensions,
          source: params.source,
          occurredAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
        mediaAssetIds: null,
      })
      .returning({ id: verticalDramaRunArtifacts.id });
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds: [String(artifactRow.id)] })
      .where(eq(verticalDramaEpisodeRuns.id, runRow.id));
  } catch (err) {
    debugError(
      "vd_quality_floor_override",
      "Failed to record quality-floor override audit (non-blocking)",
      { message: err instanceof Error ? err.message : String(err) }
    );
  }
}

/**
 * Count unresolved `arc_replan_proposal` memory events for a series (spec
 * §7.7.3) — a proposal is "pending" when no later event references it as
 * approved (`arc_replan_applied` with matching `arcReplanApprovalOf`) or
 * rejected (`arc_replan_proposal` reused as the rejection marker, matching
 * `arcReplanRejectionOf` — same convention `findArcReplanDecision` in
 * `verticalDramaSeries.ts` uses for a single proposal's decision). Used by
 * `getEpisodeDetail`'s `arcReplanPendingCount` (spec/section-14 Wave-4A).
 */
async function countPendingArcReplanProposals(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<number> {
  const events = await verticalDramaSeriesMemoryService.listEvents({
    tenantId,
    userId,
    seriesId,
    limit: 1000,
  });
  let pending = 0;
  for (const ev of events) {
    if (
      ev.memoryKind !== "arc_replan_proposal" ||
      ev.payload?.arcReplanRejectionOf
    )
      continue;
    const decided = events.some(
      other =>
        (other.memoryKind === "arc_replan_applied" &&
          other.payload?.arcReplanApprovalOf === ev.memoryEventId) ||
        (other.memoryKind === "arc_replan_proposal" &&
          other.payload?.arcReplanRejectionOf === ev.memoryEventId)
    );
    if (!decided) pending += 1;
  }
  return pending;
}

/**
 * Best-effort per-shot dialogue-quality input for the Production Wizard's
 * `episodeDialogueQuality` snapshot field (spec §8.8/§14.1, section-12 step
 * 7) — reuses the SAME canonical analyzer
 * (`analyzeVerticalDramaEpisodeDialogueQuality`, `@shared/verticalDramaSeries/
 * dialogueQuality`) `computeVerticalDramaDensityMetrics` itself wraps, built
 * from the storyboard's per-shot durations + `buildTieInReportDialogueLinesByShot`'s
 * dialogue-line extraction (shared with the tie-in report — one dialogue-
 * line source of truth). Returns `null` when the dialogue plan does not
 * exist yet (nothing to analyze — matches the wizard module's own field doc
 * comment) or the storyboard has no shots yet.
 */
function buildEpisodeDialogueQualityForWizard(
  storyboard: Record<string, unknown> | null,
  dialogueAudioPlan: Record<string, unknown> | null
): VerticalDramaEpisodeDialogueQuality | null {
  if (!dialogueAudioPlan) return null;
  const rawShots = Array.isArray(
    (storyboard as { shots?: unknown } | null)?.shots
  )
    ? (storyboard as { shots: unknown[] }).shots
    : [];
  if (rawShots.length === 0) return null;

  const dialogueLinesByShot = buildTieInReportDialogueLinesByShot(
    dialogueAudioPlan,
    storyboard
  );
  const clips: VerticalDramaDialogueClipQualityInput[] = rawShots.map(
    rawShot => {
      const shot = (
        rawShot && typeof rawShot === "object" ? rawShot : {}
      ) as Record<string, unknown>;
      const shotNumber =
        typeof shot.shot_number === "number"
          ? shot.shot_number
          : typeof shot.shotNumber === "number"
            ? shot.shotNumber
            : undefined;
      const durationSeconds =
        typeof shot.duration_seconds === "number"
          ? shot.duration_seconds
          : typeof shot.durationSeconds === "number"
            ? shot.durationSeconds
            : 0;
      const texts =
        (shotNumber !== undefined
          ? dialogueLinesByShot.get(shotNumber)
          : undefined) ?? [];
      const dialogue: VerticalDramaDialogueQualityLine[] = texts.map(
        lineTh => ({ lineTh })
      );
      return {
        shotNumber,
        durationSeconds,
        dialogue: dialogue.length ? dialogue : undefined,
      };
    }
  );
  return analyzeVerticalDramaEpisodeDialogueQuality(clips);
}

/**
 * Reads the storyboard's real shot count and a `beats_mapped` proxy
 * (2026-07-08 criteria-transparency wave, feeds `productionWizard.ts`'s
 * `shots_9`/`beats_mapped` criteria) straight from the already-loaded
 * storyboard JSON — no new query. `beatsMapped` uses every shot's own
 * `narrative_purpose` (required, non-empty per the
 * `vertical-drama-storyboard-shotgrid` skill's own output schema,
 * `storyboardShotSchema` in `verticalDramaStoryboardGeneration.ts`) as the
 * honest, already-validated proxy for "this shot was actually derived from
 * the script's beats" — there is no separate persisted beat-index field on
 * a shot to check instead. Returns `null` when there is no storyboard at
 * all (nothing to read).
 *
 * `imagePromptsAllShots`/`videoPromptsAllShots` (2026-07-08/W9-A, spec
 * section-12 "Pass Semantics — Content Completeness") — added to this SAME
 * function (rather than a parallel storyboard-shots pass) purely to avoid
 * walking `storyboard.shots[]` twice. `imagePromptsAllShots` reads each
 * shot's own `image_prompt` (required, non-empty per the shotgrid skill's
 * output schema, §6.9). `videoPromptsAllShots` reads `motionPromptPack`'s
 * clips: a shot counts as covered once SOME clip with a non-empty `prompt`
 * claims it (via `sourceShotNumbers` or `parentShotNumber` — a sub-shot
 * decomposition still counts its parent as covered). `motionPromptPack:
 * null` (the pack has never been generated) makes `videoPromptsAllShots`
 * unconditionally `false` whenever at least one shot exists — a concrete,
 * checkable "0 of N shots have a video prompt yet" fact, not an unknown.
 */
function deriveStoryboardWizardFacts(
  storyboard: Record<string, unknown> | null,
  motionPromptPack: VerticalDramaMotionPromptPack | null
): {
  shotCount: number;
  beatsMapped: boolean;
  imagePromptsAllShots: boolean;
  videoPromptsAllShots: boolean;
} | null {
  if (!storyboard) return null;
  const shots = Array.isArray((storyboard as { shots?: unknown }).shots)
    ? (storyboard as { shots: unknown[] }).shots
    : [];
  const beatsMapped =
    shots.length > 0 &&
    shots.every(shot => {
      const purpose = (shot as { narrative_purpose?: unknown } | null)
        ?.narrative_purpose;
      return typeof purpose === "string" && purpose.trim().length > 0;
    });
  const imagePromptsAllShots =
    shots.length > 0 &&
    shots.every(shot => {
      const imagePrompt = (shot as { image_prompt?: unknown } | null)
        ?.image_prompt;
      return typeof imagePrompt === "string" && imagePrompt.trim().length > 0;
    });

  const shotNumbers = shots
    .map(shot => {
      const s = (shot ?? {}) as { shot_number?: unknown; shotNumber?: unknown };
      return typeof s.shot_number === "number"
        ? s.shot_number
        : typeof s.shotNumber === "number"
          ? s.shotNumber
          : undefined;
    })
    .filter((n): n is number => n !== undefined);
  const coveredShotNumbers = new Set<number>();
  for (const clip of motionPromptPack?.clips ?? []) {
    if (!clip.prompt || clip.prompt.trim().length === 0) continue;
    for (const sn of clip.sourceShotNumbers ?? []) coveredShotNumbers.add(sn);
    if (clip.parentShotNumber !== undefined)
      coveredShotNumbers.add(clip.parentShotNumber);
  }
  const videoPromptsAllShots =
    shotNumbers.length > 0 &&
    shotNumbers.every(sn => coveredShotNumbers.has(sn));

  return {
    shotCount: shots.length,
    beatsMapped,
    imagePromptsAllShots,
    videoPromptsAllShots,
  };
}

/**
 * One storyboard shot's resolved dialogue lines + duration (2026-07-08/W9-A,
 * spec §14.1 rule 6b, section-12 "Pass Semantics") — the shared per-shot
 * resolution BOTH `buildScriptPerShotCompletenessForWizard` (pass/fail
 * summary for the wizard's `episode_script` criteria) and
 * `buildPerShotDialoguePreview` (the raw-text viewer payload,
 * `getEpisodeDetail`'s `perShotDialoguePreview`) are built from, so
 * `resolveShotDialogueLines` only ever runs ONCE per shot for this wave.
 */
type VerticalDramaWizardResolvedShotDialogue = {
  shotNumber: number;
  durationSeconds: number;
  lines: ShotDialogueLine[];
};

/**
 * Resolve every storyboard shot's dialogue lines (2026-07-08/W9-A) via the
 * SAME fallback chain (`resolveShotDialogueLines`) every other per-shot
 * dialogue consumer in this router already uses. Deliberately omits
 * `knownSpeakerKeys` — an accepted simplification specific to this new,
 * DISPLAY-ONLY completeness/preview surface (never a hard generation gate):
 * every OTHER call of `resolveShotDialogueLines` that omits it already gets
 * that function's own documented "treat every speaker as unknown" fallback
 * behavior, and this is a pure, synchronous, already-loaded-data-only
 * computation — spending an extra `loadSeriesKnownSpeakerKeys` DB round-trip
 * here only to refine a checklist/preview is not worth it. Returns `null`
 * when the storyboard does not exist yet or has no shots — "evaluable once
 * storyboard exists" (section-12).
 */
function resolveWizardPerShotDialogue(
  script: Record<string, unknown> | null,
  storyboard: Record<string, unknown> | null,
  dialogueAudioPlan: Record<string, unknown> | null,
  motionPromptPack: VerticalDramaMotionPromptPack | null
): VerticalDramaWizardResolvedShotDialogue[] | null {
  const rawShots = Array.isArray(
    (storyboard as { shots?: unknown } | null)?.shots
  )
    ? (storyboard as { shots: unknown[] }).shots
    : [];
  if (rawShots.length === 0) return null;

  return rawShots.map(rawShot => {
    const shot = (
      rawShot && typeof rawShot === "object" ? rawShot : {}
    ) as Record<string, unknown>;
    const shotNumber =
      typeof shot.shot_number === "number"
        ? shot.shot_number
        : typeof shot.shotNumber === "number"
          ? shot.shotNumber
          : 0;
    const durationSeconds =
      typeof shot.duration_seconds === "number"
        ? shot.duration_seconds
        : typeof shot.durationSeconds === "number"
          ? shot.durationSeconds
          : 0;
    const matchingClip = motionPromptPack?.clips.find(
      c =>
        c.sourceShotNumbers?.includes(shotNumber) ||
        c.parentShotNumber === shotNumber
    );
    const lines = resolveShotDialogueLines({
      shotNumber,
      matchingClip,
      dialogueAudioPlan: dialogueAudioPlan as {
        dialogue_lines?: Array<Record<string, unknown>>;
      } | null,
      script,
      storyboardShotCount: rawShots.length,
    });
    return { shotNumber, durationSeconds, lines };
  });
}

/** This shot's over-length / long-silence facts (2026-07-08/W9-A), shared by
 *  both `buildScriptPerShotCompletenessForWizard` and
 *  `buildPerShotDialoguePreview` — built ONLY from the canonical
 *  `dialogueQuality.ts` estimators, no second speech/silence model. */
function computeWizardShotSpeechTimingFacts(
  lines: ShotDialogueLine[],
  durationSeconds: number
): { overLength: boolean; silent: boolean } {
  const speechLines: VerticalDramaDialogueQualityLine[] = lines.map(l => ({
    lineTh: l.lineTh,
  }));
  const totalSpeechSeconds = estimateVerticalDramaDialogueSeconds(speechLines);
  const overLength =
    durationSeconds > 0 && totalSpeechSeconds > durationSeconds + 1e-6;
  const silent = analyzeVerticalDramaClipSilence(
    speechLines,
    durationSeconds
  ).exceedsLimit;
  return { overLength, silent };
}

/**
 * Build the wizard's per-shot content-completeness summary
 * (2026-07-08/W9-A, spec §14.1 rule 6b) from the shared per-shot dialogue
 * resolution above — feeds `episode_script`'s 4 new criteria
 * (`dialogue_every_shot`/`no_shot_over_length`/`no_long_silence`/
 * `all_lines_speakable`). `allLinesSpeakable` is vacuously `true` for a
 * shot with zero resolved lines (nothing to fail) — a MISSING line is
 * `dialogue_every_shot`'s concern, not this one's.
 */
function buildScriptPerShotCompletenessForWizard(
  resolved: VerticalDramaWizardResolvedShotDialogue[] | null
): VerticalDramaWizardPerShotDialogueCompleteness[] | null {
  if (!resolved) return null;
  return resolved.map(({ shotNumber, durationSeconds, lines }) => {
    const { overLength, silent } = computeWizardShotSpeechTimingFacts(
      lines,
      durationSeconds
    );
    const allLinesSpeakable =
      lines.length === 0 ||
      lines.every(
        l =>
          analyzeVerticalDramaLineSpeakability({
            speaker: l.characterKey,
            line: l.lineTh,
          }).speakable
      );
    return {
      shotNumber,
      hasResolvedLine: lines.length > 0,
      overLength,
      silent,
      allLinesSpeakable,
    };
  });
}

/**
 * Acceptance-review fix #1 (2026-07-08, HIGH false-positive) — feeds the
 * wizard's `episode_script` `story_structure_complete` criterion
 * (`productionWizard.ts`). Reads the persisted script record's raw
 * `hook`/`cliffhanger`/`structure.beats` fields (same raw, snake_case,
 * pre-projection shape `runArcDriftCheckAndProposeIfNeeded` above already
 * reads `structure.beats` from — this is the actual persisted
 * `plan_episode_script` output, `ScriptBuilderOutput`, not the narrower
 * `VerticalDramaEpisodeScript` typed projection). `undefined` when there is
 * no script at all — `computeEpisodeScriptStep` never reaches its
 * `structureComplete` read in that case anyway (its own `!exists` branch
 * returns first), but this keeps the helper honest or its own.
 */
function deriveScriptStructureCompleteForWizard(
  script: Record<string, unknown> | null
): boolean | undefined {
  if (!script) return undefined;
  const hook = typeof script.hook === "string" ? script.hook.trim() : "";
  const cliffhanger =
    typeof script.cliffhanger === "string" ? script.cliffhanger.trim() : "";
  const structure = (script as { structure?: { beats?: unknown } }).structure;
  const beats = Array.isArray(structure?.beats)
    ? (structure!.beats as unknown[])
    : [];
  return hook.length > 0 && cliffhanger.length > 0 && beats.length > 0;
}

/**
 * Acceptance-review fix #5 (2026-07-08, LOW-MED dead input) — honest
 * best-effort replacement for the previously hardcoded
 * `shotRepair.failingTargetCount: 0`. Counts `motionPromptPack` clips whose
 * `videoTask` carries a `status: "failed"` marker — the real signal the
 * acceptance review pointed at. NOTE: as of this fix, nothing in this
 * codebase's WRITE path ever persists such a `status` field onto
 * `clip.videoTask` (`VerticalDramaMotionPromptPack["clips"][number]
 * ["videoTask"]`'s own type only ever declares `pendingTaskId`/`videoUrl`/
 * `mediaTaskId`/`source` — see `contracts.ts`), so this reads `0` in
 * practice today, identical to the previous hardcoded value. It is still a
 * genuine improvement over a literal constant: `motionPromptPack` is
 * untyped JSONB read via a type ASSERTION (`as VerticalDramaMotionPromptPack`),
 * not a runtime-validated shape, so a future writer (a webhook, an admin
 * tool, or a later wave that starts persisting render failures) populating
 * this field is honoured immediately, with zero further wiring, the moment
 * it exists. No per-shot start-frame QC-failure marker exists anywhere on
 * the already-loaded payload to add on top of this — `VerticalDramaStartFramePlan.
 * frames[]` (`contracts.ts`) has no such field either.
 */
function countWizardFailingShotRepairTargets(
  motionPromptPack: VerticalDramaMotionPromptPack | null
): number {
  if (!motionPromptPack) return 0;
  return motionPromptPack.clips.filter(
    clip =>
      (clip.videoTask as { status?: string } | undefined)?.status === "failed"
  ).length;
}

/**
 * Compact per-shot dialogue viewer payload for `getEpisodeDetail`'s
 * `perShotDialoguePreview` (2026-07-08/W9-A, section-12 "Pass Semantics":
 * "The step detail SHOWS the actual dialogue lines per shot [...], not only
 * second totals"). Line text is the RAW resolved text — deliberately NOT
 * run through `sanitizeSpeakableLineForDelivery`, since this is a viewer for
 * the CURRENT source content (so the user can see exactly what needs
 * fixing), never an outbound TTS/native-video payload. Each line's text is
 * capped at `VD_WIZARD_DIALOGUE_PREVIEW_LINE_MAX_CHARS` characters
 * (display-only truncation; never applied to the underlying artifact).
 */
const VD_WIZARD_DIALOGUE_PREVIEW_LINE_MAX_CHARS = 200;

function buildPerShotDialoguePreview(
  resolved: VerticalDramaWizardResolvedShotDialogue[] | null
): Array<{
  shotNumber: number;
  lines: Array<{ speaker?: string; line: string }>;
  overLength: boolean;
  silent: boolean;
}> | null {
  if (!resolved) return null;
  return resolved.map(({ shotNumber, durationSeconds, lines }) => {
    const { overLength, silent } = computeWizardShotSpeechTimingFacts(
      lines,
      durationSeconds
    );
    return {
      shotNumber,
      lines: lines.map(l => ({
        speaker: l.characterKey,
        line:
          l.lineTh.length > VD_WIZARD_DIALOGUE_PREVIEW_LINE_MAX_CHARS
            ? `${l.lineTh.slice(0, VD_WIZARD_DIALOGUE_PREVIEW_LINE_MAX_CHARS)}…`
            : l.lineTh,
      })),
      overLength,
      silent,
    };
  });
}

/**
 * Assemble the Production Wizard's input snapshot (spec §8.8, section-12)
 * from already-loaded/computed episode state — called only from
 * `getEpisodeDetail`'s `productionWizardEnabled` branch. Every field is
 * documented at its declaration in `productionWizard.ts`; simplifications
 * made here (rather than a byte-perfect reconstruction of every upstream
 * signal) are called out inline:
 *
 *  - `seriesSetup.complete` is always `true` — an episode can only exist
 *    after Create Series Wizard completion, so this is never the blocker
 *    for an already-existing episode being viewed.
 *  - `script.coverageStatus` (Wave-7D, spec §7.7.2/§8.8) is the REAL value
 *    from `evaluateScriptSpeechCoverage` (`verticalDramaScriptGeneration.ts`)
 *    when the episode has a script AND `speechBudgetEnabled` is on — loaded
 *    via a runtime `import()` (never a static one; see this file's
 *    `runArcDriftCheckAndProposeIfNeeded` doc comment for why a static
 *    import of that module is unsafe in this router's test suites). Stays
 *    `"in_range"` (never blocks `storyboard_shots` on this axis) when the
 *    script does not exist yet OR `speechBudgetEnabled` is off — matching
 *    today's byte-identical flags-off behavior; the §7.7.2 gate at script-
 *    generation TIME (`verticalDramaScriptGeneration.ts`'s own coverage
 *    check, out of this wave's file ownership) is unaffected either way,
 *    this is purely the wizard's own read-only snapshot of the SAME result.
 *  - `videoPrompts.stale` (debt-item-4, 2026-07-08 — supersedes the prior
 *    "STILL defaults to `false`" note from acceptance-review fix #5) is now
 *    `params.videoPromptsStale`, resolved by the caller via
 *    `resolveVideoPromptsStale`: the episode's `vertical_drama_episodes`
 *    row itself has only one shared `updatedAt` (useless for "was the
 *    prompt pack generated before/after the storyboard"), but both stages
 *    already write an immutable, individually-timestamped ledger row via
 *    `VerticalDramaEpisodePipeline`'s `writeArtifact` on every
 *    (re)generation — no new persistence needed, only a targeted read of
 *    `verticalDramaRunArtifacts` by stage (see that function's doc comment).
 *    `getEpisodeDetail` only fires that read when `row.motionPromptPack`
 *    exists, so the prior "zero new queries" test coverage for
 *    `motionPromptPack: null` scenarios is unaffected; the handful of tests
 *    that DO set a real `motionPromptPack` were updated for the one extra
 *    query (`verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`'s
 *    `mockFullPassingChain`).
 *  - `shotRepair.failingTargetCount` (acceptance-review fix #5, 2026-07-08)
 *    is now `countWizardFailingShotRepairTargets(params.motionPromptPack)`
 *    — a genuine best-effort read of `clip.videoTask.status === "failed"`
 *    (see that function's own doc comment for why this still reads `0` in
 *    practice today: nothing currently WRITES that field, but it is wired
 *    to real data instead of a hardcoded literal). No per-shot start-frame
 *    QC-failure marker exists on the already-loaded payload to add on top.
 *  - `clips.completed` (acceptance-review fix #2, 2026-07-08, HIGH
 *    false-negative / circular gate) is now
 *    `motionPromptPack?.clips.filter(c => Boolean(c.videoTask?.videoUrl)).length`
 *    — the same real "has a rendered video" signal this file's own
 *    `assembleEpisodeVideo` doc comment and the shared canonical-shot
 *    assembly-readiness resolver
 *    already use elsewhere. The PREVIOUS heuristic (`required` once
 *    `assemblyManifest` exists, else `0`) was circular: `assemblyManifest`
 *    is only ever created by the `final_episode` step's `assemble_episode`
 *    action, which itself stays "locked" until `video_clips` reads
 *    "passed" — so `video_clips` could never actually reach "passed"
 *    through the normal guided flow, permanently stranding the wizard one
 *    step before the end even once every clip actually had a rendered
 *    video.
 *  - `gateExemptStepIds` is always `[]` — this router has no record of
 *    WHEN each of the 2026-07-07 flags was enabled for a series, so it
 *    cannot determine which already-completed steps predate them. This
 *    only affects the WIZARD's own advisory step statuses; the actual
 *    generation-time gates this wave ships (`assertTieInQualityGatePassed`
 *    et al.) grandfather correctly on their own (they only ever evaluate
 *    the LATEST report for NEW generation calls).
 *  - `scriptQc.loopStatus` (2026-07-08 fix) is the REAL
 *    `latestQualityLoopState.status`, or `"not_run"` when no loop state has
 *    ever been persisted for this episode — this function previously
 *    hardcoded `"not_run"` unconditionally even though `getEpisodeDetail`
 *    already loads the real state (`loadLatestQualityLoopState`) and
 *    returns it as `latestQualityLoopState` in the SAME response; the
 *    wizard's own evidence row just never read it.
 *  - `storyboard.shotCount`/`beatsMapped`/`imagePromptsAllShots`/
 *    `videoPromptsAllShots` (2026-07-08 criteria-transparency wave +
 *    2026-07-08/W9-A content-completeness wave) come from
 *    `deriveStoryboardWizardFacts` above.
 *  - `script.perShotCompleteness` (2026-07-08/W9-A) comes from
 *    `buildScriptPerShotCompletenessForWizard(params.perShotDialogue)` —
 *    `perShotDialogue` is resolved ONCE by the caller (`getEpisodeDetail`)
 *    and shared with `perShotDialoguePreview`, so `resolveShotDialogueLines`
 *    never runs twice for the same shot in one request.
 *  - `script.structureComplete` (acceptance-review fix #1, 2026-07-08, HIGH
 *    false-positive) comes from `deriveScriptStructureCompleteForWizard(params.script)`
 *    — evaluable as soon as the script exists (never gated on the
 *    storyboard, unlike `perShotCompleteness` above).
 *  - `scriptQc.hasUnresolvedRecommendedRepairs` (2026-07-08/W9-A) is a
 *    best-effort read of the LATEST review's own `issues[]`
 *    (`issues.length > 0`) — see that field's doc comment in
 *    `productionWizard.ts` for why this is the honest, available signal
 *    (no per-repair resolved/dismissed tracking exists yet).
 */
async function buildProductionWizardInput(params: {
  script: Record<string, unknown> | null;
  storyboard: Record<string, unknown> | null;
  startFramePlan: VerticalDramaStartFramePlan | null;
  dialogueAudioPlan: Record<string, unknown> | null;
  motionPromptPack: VerticalDramaMotionPromptPack | null;
  assemblyManifest: Record<string, unknown> | null;
  /** 2026-07-08/W9-A — this episode's per-shot resolved dialogue, already
   *  computed once by `getEpisodeDetail` via `resolveWizardPerShotDialogue`
   *  (shared with `perShotDialoguePreview`). `null` when the storyboard
   *  does not exist yet. */
  perShotDialogue: VerticalDramaWizardResolvedShotDialogue[] | null;
  targetDurationSeconds: number;
  /** Series locale (Wave-7D) — fed straight into `evaluateScriptSpeechCoverage`, matching every other call site's `normalizeVerticalDramaSeriesLocale(...)` convention. */
  locale: VerticalDramaSeriesLocale;
  policy: VerticalDramaQualityPolicy;
  latestReview: EpisodeQualityReviewOutput | null;
  /** Already loaded by `getEpisodeDetail` (2026-07-08 fix) — the real
   *  auto-improve loop status this function previously ignored, hardcoding
   *  `"not_run"` on every call regardless of actual state (a leaked
   *  raw-enum evidence row PLUS wrong data underneath it). `null` when the
   *  loop has never run for this episode or `qualityLoopV2Enabled` is off,
   *  which still correctly reads as `"not_run"` below. */
  latestQualityLoopState:
    | import("@shared/verticalDramaSeries/qualityPolicy").VerticalDramaQualityLoopState
    | null;
  tieInReport:
    | import("../services/verticalDramaProductTieIn").VerticalDramaTieInQualityReport
    | null;
  seriesTieInEnabled: boolean;
  arcReplanPending: boolean;
  /** debt-item-4 (2026-07-08) — resolved by the caller via
   *  `resolveVideoPromptsStale`; see `videoPrompts.stale`'s doc comment
   *  above. `false` when there is no motion-prompt-pack artifact yet
   *  (nothing to be stale relative to). */
  videoPromptsStale: boolean;
  flags: {
    speechBudgetEnabled: boolean;
    arcReplanEnabled: boolean;
    qualityLoopV2Enabled: boolean;
    tieInQcEnabled: boolean;
    productionWizardEnabled: boolean;
  };
}): Promise<DeriveVerticalDramaProductionWizardStateInput> {
  const requiredShots = params.startFramePlan?.frames.length ?? 0;
  const approvedShots =
    params.startFramePlan?.frames.filter(f => Boolean(f.approvedMediaAssetId))
      .length ?? 0;

  const requiredClips = params.motionPromptPack?.clips.length ?? 0;
  // Acceptance-review fix #2 (2026-07-08, HIGH false-negative / circular
  // gate) — see this function's own doc comment above for why the previous
  // `params.assemblyManifest ? requiredClips : 0` heuristic was circular
  // and permanently stranded the guided flow.
  const completedClips =
    params.motionPromptPack?.clips.filter(c => Boolean(c.videoTask?.videoUrl))
      .length ?? 0;

  const totalClipDuration =
    params.motionPromptPack?.clips.reduce(
      (sum, c) => sum + (c.durationSeconds ?? 0),
      0
    ) ?? 0;
  const durationsAligned = params.motionPromptPack
    ? Math.abs(totalClipDuration - params.targetDurationSeconds) < 1
    : true;

  const episodeDialogueQuality = buildEpisodeDialogueQualityForWizard(
    params.storyboard,
    params.dialogueAudioPlan
  );

  // Wave-7D (spec §7.7.2/§8.8) — real coverage status, computed the same way
  // `runArcDriftCheckAndProposeIfNeeded` derives `realizedEstimatedSpeechSeconds`
  // (dynamic `import()`, never static — see this function's own doc comment
  // above for why). Guarded so the import only ever runs when there is a
  // script to evaluate AND the speech-budget flag is on; otherwise stays the
  // pre-Wave-7D `"in_range"` placeholder, preserving flags-off byte-identical
  // behavior exactly.
  let scriptCoverageStatus: VerticalDramaProductionWizardScriptCoverageStatus =
    "in_range";
  // 2026-07-08 fix — the FULL coverage result (not just `.status`), passed
  // through as `script.coverageDetail` so the shared resolver's
  // `episode_script` evidence row can render REAL numbers ("36.8s / target
  // 34.8-40.8s") instead of the bare `ScriptSpeechCoverageStatus` enum
  // string. `undefined` whenever the guard above didn't run (flag off, or
  // no script yet) — the resolver keeps its EXACT pre-existing evidence
  // output in that case (flags-off byte-identical).
  let scriptCoverageDetail:
    | {
        estimatedSpeechSeconds: number;
        targetSpeechSecondsMin: number;
        targetSpeechSecondsMax: number;
      }
    | undefined;
  if (params.script && params.flags.speechBudgetEnabled) {
    const { evaluateScriptSpeechCoverage } =
      await import("../services/verticalDramaScriptGeneration");
    const coverage = evaluateScriptSpeechCoverage(
      params.script as unknown as ScriptBuilderOutput,
      params.targetDurationSeconds,
      params.locale
    );
    scriptCoverageStatus = coverage.status;
    scriptCoverageDetail = {
      estimatedSpeechSeconds: coverage.estimatedSpeechSeconds,
      targetSpeechSecondsMin: coverage.targetSpeechSecondsMin,
      targetSpeechSecondsMax: coverage.targetSpeechSecondsMax,
    };
  }

  const storyboardFacts = deriveStoryboardWizardFacts(
    params.storyboard,
    params.motionPromptPack
  );
  const perShotCompleteness = buildScriptPerShotCompletenessForWizard(
    params.perShotDialogue
  );
  const structureComplete = deriveScriptStructureCompleteForWizard(
    params.script
  );
  // 2026-07-08/W9-A (section-12 "Pass Semantics" script-QC checklist) — best-
  // effort: the LATEST review supersedes any earlier one by construction, so
  // whatever it still lists in `issues[]` is, by definition, unresolved as
  // of now. `null` (not `false`) when no review has ever run — matches
  // `latestScorecard: null`'s own "nothing to check yet" convention.
  const hasUnresolvedRecommendedRepairs = params.latestReview
    ? params.latestReview.issues.length > 0
    : null;

  return {
    seriesSetup: { complete: true },
    script: {
      exists: Boolean(params.script),
      coverageStatus: scriptCoverageStatus,
      coverageDetail: scriptCoverageDetail,
      perShotCompleteness,
      structureComplete,
    },
    storyboard: {
      exists: Boolean(params.storyboard),
      shotCount: storyboardFacts?.shotCount,
      beatsMapped: storyboardFacts?.beatsMapped,
      imagePromptsAllShots: storyboardFacts?.imagePromptsAllShots,
      videoPromptsAllShots: storyboardFacts?.videoPromptsAllShots,
    },
    scriptQc: {
      latestScorecard:
        (params.latestReview?.scorecard as
          | VerticalDramaQualityScorecardDimensions
          | undefined) ?? null,
      policy: params.policy,
      loopStatus: params.latestQualityLoopState?.status ?? "not_run",
      tieIn: {
        enabled: params.seriesTieInEnabled,
        reportPassed: params.tieInReport
          ? params.tieInReport.passed
          : undefined,
      },
      hasUnresolvedRecommendedRepairs,
    },
    startFrames: { requiredShots, approvedShots },
    dialogueAudio: { exists: Boolean(params.dialogueAudioPlan) },
    episodeDialogueQuality,
    // debt-item-4 (2026-07-08) — real signal, resolved by the caller via
    // `resolveVideoPromptsStale`; see this function's doc comment above.
    videoPrompts: {
      exists: Boolean(params.motionPromptPack),
      stale: params.videoPromptsStale,
    },
    shotRepair: {
      failingTargetCount: countWizardFailingShotRepairTargets(
        params.motionPromptPack
      ),
    },
    clips: { required: requiredClips, completed: completedClips },
    assembly: {
      completed: Boolean(params.assemblyManifest),
      durationsAligned,
      audioSubtitleResolved: Boolean(params.dialogueAudioPlan),
    },
    arcReplanPending: params.arcReplanPending,
    flags: {
      speechBudget: params.flags.speechBudgetEnabled,
      qualityLoopV2: params.flags.qualityLoopV2Enabled,
      tieInQc: params.flags.tieInQcEnabled,
      productionWizard: params.flags.productionWizardEnabled,
      arcReplan: params.flags.arcReplanEnabled,
    },
    gateExemptStepIds: [] as VerticalDramaProductionWizardStepId[],
  };
}

/**
 * Shared arc-drift-check invocation used by BOTH hook points (spec §7.7.3):
 * after an episode-script (or pipeline-driven
 * `summarize_episode_to_series_memory`) checkpoint approval —
 * `approveCheckpoint` below, which also covers re-approval of a
 * repaired/regenerated script, since `repairStageOutput` always creates a
 * NEW checkpoint on the SAME stage, approved through this same mutation —
 * and at the end of the manual `summarizeEpisodeToMemory` mutation. Gated by
 * the CALLER on `verticalDramaSeriesArcReplan` — this function itself has no
 * flag awareness, mirroring this file's existing "gate at the call site"
 * convention (e.g. `resolveShotDialogueLines`'s `sourceBeatIndexes` param).
 *
 * Deterministic (spec §7.7.3 hard rule 5 — no LLM call here): loads the
 * series' active breakdown (`getActiveBreakdown`, Wave-2A) and the episode's
 * persisted script, runs `detectArcDrift`, and on material drift affecting
 * at least one FUTURE, non-produced episode, builds + appends an
 * `arc_replan_proposal` memory event via the SAME
 * `verticalDramaSeriesMemoryService.appendEvent` insert path (idempotency-
 * keyed) every other memory-event write in this file already uses — never
 * auto-applies (spec: proposals await the `verticalDramaSeries.ts`
 * approve/reject procedures, a different agent's file, out of scope here).
 *
 * `proposedItems` (fed into `buildArcReplanProposal`) is a deliberate,
 * scope-bounded adaptation: it carries the CURRENT active breakdown's own
 * future items UNCHANGED (with `contentBudget` resolved via
 * `deriveLegacyContentBudget` for any legacy item lacking one) rather than
 * an LLM-authored re-plan — this function's job is drift DETECTION and
 * surfacing a review-worthy proposal, not authoring new season content (no
 * re-plan LLM call is in this wave's scope/file list). A future wave can
 * enrich `proposedItems` with real content changes before this same
 * `buildArcReplanProposal`/`appendEvent` call.
 *
 * Best-effort: never throws. A failure here must never block the
 * approval/summarization mutation it's attached to — drift detection is an
 * advisory side effect layered onto an ALREADY-COMMITTED state change, not a
 * gate. Logs via `debugError` (never the prompt/response bodies — only the
 * error message, per this codebase's secret/PII logging rules) and returns
 * silently on any unexpected error.
 *
 * `newHookDescriptions` is OPTIONAL: the `summarizeEpisodeToMemory` call
 * site has structured hook data (from `runVerticalDramaSeriesMemoryPlanning`)
 * to diff against the prior memory bundle's open-hook list;
 * `approveCheckpoint`'s call site does not (the memory planner has not run
 * yet for this episode at script-approval time) and omits it —
 * `VD_ARC_HOOK_UNPLANNED` simply never fires from that call site, an
 * accepted, documented scope difference between the two.
 */
async function runArcDriftCheckAndProposeIfNeeded(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  episodeNumber: number;
  script: Record<string, unknown> | null;
  newHookDescriptions?: string[];
  idempotencyKey?: string;
}): Promise<void> {
  try {
    const script = params.script;
    if (!script) return;

    // Runtime (not static) import — see this function's doc comment above
    // and the module-level `import type` comments near the top of this
    // file: a STATIC value import of any of these 3 modules transitively
    // pulls in `enabledLlmModels.ts` -> `llmProviders.ts` -> `adminProcedure`,
    // which crashes every existing test file for this router at import time
    // (none of them mock that far down the chain). This `import()` only
    // ever executes once this function is actually called, i.e. only when
    // the caller already resolved `verticalDramaSeriesArcReplan === true` —
    // no pre-existing test enables that flag, so none of them ever reach
    // this line. Module resolution is cached after the first real call.
    const [
      { getActiveBreakdown, deriveLegacyContentBudget },
      { detectArcDrift, buildArcReplanProposal },
      { evaluateScriptSpeechCoverage },
    ] = await Promise.all([
      import("../services/verticalDramaStoryBible"),
      import("../services/verticalDramaArcReplan"),
      import("../services/verticalDramaScriptGeneration"),
    ]);

    const [seriesRow] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, params.seriesId),
          eq(verticalDramaSeries.tenantId, params.tenantId),
          eq(verticalDramaSeries.userId, params.userId)
        )
      )
      .limit(1);
    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const activeBreakdown = getActiveBreakdown(bible);
    if (activeBreakdown.length === 0) return; // nothing planned to drift against

    const priorMemoryBundle =
      await verticalDramaSeriesMemoryService.buildEpisodeMemoryBundle(
        {
          tenantId: params.tenantId,
          userId: params.userId,
          seriesId: params.seriesId,
        },
        params.episodeNumber
      );
    const priorMemoryHooks: ArcDriftOpenHook[] =
      priorMemoryBundle.unresolvedHooks.map(text => ({
        hookId: text,
        description: text,
      }));

    const structure = (script as { structure?: { beats?: unknown } }).structure;
    const beats = Array.isArray(structure?.beats)
      ? (structure!.beats as Array<Record<string, unknown>>)
      : [];
    const beatSummaries = beats
      .map(b => (typeof b.summary === "string" ? b.summary : ""))
      .filter(s => s.length > 0);
    const continuityNotes = Array.isArray(script.continuity_notes)
      ? (script.continuity_notes as unknown[]).filter(
          (s): s is string => typeof s === "string"
        )
      : [];
    const maxIntensity = beats.reduce((max, b) => {
      const intensity = typeof b.intensity === "number" ? b.intensity : 0;
      return intensity > max ? intensity : max;
    }, 0);
    // Linear 1-10 -> 1-5 mapping (ceil(intensity/2), clamped) — the two
    // scales are pinned by different spec sections (a script beat's
    // `intensity` is Phase 3B narrative grammar, 1-10;
    // `contentBudget.conflictLevel` is spec §7.7.2, 1-5) with no shared
    // conversion helper; defaults to the escalation curve's midpoint (3)
    // when no beat carries an intensity at all, mirroring
    // `deriveDefaultContentBudget`'s own midpoint-default choice for the
    // identical "no season-position context" situation.
    const realizedConflictLevel = (
      maxIntensity > 0
        ? Math.min(5, Math.max(1, Math.ceil(maxIntensity / 2)))
        : 3
    ) as VerticalDramaConflictLevel;
    const realizedEstimatedSpeechSeconds = evaluateScriptSpeechCoverage(
      script as unknown as ScriptBuilderOutput,
      VERTICAL_DRAMA_TARGET_DURATION_SECONDS
    ).estimatedSpeechSeconds;

    const drift = detectArcDrift({
      approvedScript: {
        beatSummaries,
        continuityNotes,
        newHookDescriptions: params.newHookDescriptions ?? [],
        realizedBeatCount: beats.length,
        realizedEstimatedSpeechSeconds,
        realizedConflictLevel,
      },
      activeBreakdown,
      episodeNumber: params.episodeNumber,
      priorMemoryHooks,
    });

    if (!drift.drifted || drift.affectedEpisodeNumbers.length === 0) return;

    const proposedItems: VerticalDramaArcReplanBreakdownItem[] = activeBreakdown
      .filter(item => drift.affectedEpisodeNumbers.includes(item.episodeNumber))
      .map(item => ({
        episodeNumber: item.episodeNumber,
        workingTitle: item.workingTitle,
        logline: item.logline,
        keyBeats: item.keyBeats,
        contentBudget: deriveLegacyContentBudget(
          item,
          VERTICAL_DRAMA_TARGET_DURATION_SECONDS
        ),
      }));
    if (proposedItems.length === 0) return;

    const proposal = buildArcReplanProposal({
      drift,
      activeBreakdown,
      triggeredByEpisodeNumber: params.episodeNumber,
      proposedItems,
      seriesId: String(params.seriesId),
    });

    await verticalDramaSeriesMemoryService.appendEvent({
      tenantId: params.tenantId,
      userId: params.userId,
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      memoryKind: "arc_replan_proposal",
      payload: proposal as unknown as Record<string, unknown>,
      summaryText: proposal.rationale,
      idempotencyKey: params.idempotencyKey,
    });
  } catch (err) {
    debugError("vd_arc_drift", "Arc-drift check failed (non-blocking)", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const idempotencyKey = z.string().trim().min(1).max(128).optional();

const sceneVisualStatePatchSchema = z
  .object({
    lightingState: z.string().trim().max(2000).optional(),
    fixedElements: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(300),
            placement: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    spatialLayout: z.string().trim().max(2000).optional(),
    stagingAxis: z.string().trim().max(1000).optional(),
    wardrobeInScene: z
      .array(
        z
          .object({
            character: z.string().trim().min(1).max(300),
            wardrobe: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    activeProps: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(300),
            placement: z.string().trim().min(1).max(500),
            fromShot: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    paletteMood: z.string().trim().max(1000).optional(),
    timeJumpSuspected: z.boolean().optional(),
    coverageGaps: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
  })
  .strict();
/**
 * Character-lock auto-soften level (2026-07-06 prompt-safety upgrade,
 * skill-authored per `vertical-drama-skill-first-architecture` plan Phase
 * 1.3) — 0/absent = full lock (default/first attempt), 1 = softened wording,
 * 2 = minimal lock. The client resubmits the SAME mutation with
 * `softenLevel + 1` (capped at `VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL`) when a
 * generation task fails with a policy/content/safety-category provider
 * error — see `isCharacterLockPolicyFailureMessage` in
 * `@shared/verticalDramaSeries/characterLock`. The actual softening is now
 * authored by the `vertical-drama-shot-image-action` skill's `soften_level`
 * input (`server/services/verticalDramaShotImageAction.ts`), not a regex
 * ladder in this file.
 */
const softenLevel = z
  .number()
  .int()
  .min(0)
  .max(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL)
  .optional();
const stageEnum = z.enum(
  VERTICAL_DRAMA_PIPELINE_STAGES as unknown as [
    VerticalDramaPipelineStage,
    ...VerticalDramaPipelineStage[],
  ]
);
const runModeEnum = z.enum(
  VERTICAL_DRAMA_RUNNER_MODES as unknown as [string, ...string[]]
);

const subShotPolicyInput = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(["auto", "fixed"]).optional(),
    targetPerShot: z.number().int().min(1).max(5).optional(),
    maxPerShot: z.number().int().min(1).max(5).optional(),
    minSubShotSeconds: z.number().positive().max(30).optional(),
  })
  .optional();

/**
 * Conservative fixed pre-check estimate (credits) for ONE quality-loop round's
 * LLM call — mirrors `verticalDramaEpisodeQualityReview.ts`'s own (un-exported)
 * `QUALITY_REVIEW_ESTIMATED_CREDIT_COST` (same skill, same call shape); kept
 * as a local constant since that file is not modified by this wave.
 */
const QUALITY_LOOP_PER_ROUND_CREDIT_ESTIMATE = 20;

/**
 * Loop-mode branch of `applyQualityReviewSuggestions` (spec §16.1, Wave-4A) —
 * bounded auto-improve: review -> group -> repair -> re-review, repeating up
 * to `policy.maxAutoImproveRounds`, stopping early on pass or regression (see
 * `runVerticalDramaQualityLoop`'s doc comment for the full round/regression/
 * escalation contract). Only reached when `input.loop === true` AND
 * `verticalDramaSeriesQualityLoopV2` is enabled — the calling procedure falls
 * through to the EXACT v1 single-pass behavior otherwise.
 */
async function runApplyQualityReviewSuggestionsLoop(params: {
  owner: EpisodeRunOwner;
  idempotencyKey?: string;
}): Promise<{
  loopState: import("@shared/verticalDramaSeries/qualityPolicy").VerticalDramaQualityLoopState;
  newReview: EpisodeQualityReviewOutput | null;
  // Superset fields (structurally compatible with the v1 single-pass return
  // shape below) — derived from `loopState`/the repair calls so the
  // procedure's overall return type stays a single, non-union shape for
  // every existing client caller, while still returning everything the loop
  // itself adds (`loopState`, spec §16.1's explicit ask).
  stagesRepaired: VerticalDramaPipelineStage[];
  staleStages: VerticalDramaPipelineStage[];
  warning: string | null;
}> {
  const { owner } = params;
  const { tenantId, userId, seriesId, episodeId } = owner;

  const policy = await loadVerticalDramaQualityPolicy(
    tenantId,
    userId,
    seriesId
  );
  const { tieInQcEnabled, storyLockEnabled } =
    await resolveVerticalDramaQualityLoopFlags(tenantId);
  // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`,
  // router-wiring package, added 2026-07-11) — resolved ONCE for the whole
  // bounded loop (every round's `effects.runReview`/`effects.repairStage`
  // reuse this same boolean), same "resolve once per request" convention as
  // every other flag above.
  const retentionHooksEnabled =
    await resolveVerticalDramaRetentionHooksFlag(tenantId);

  // Credit pre-check for the WHOLE bounded loop, shown/enforced up-front —
  // each round's own LLM call is separately credit-checked/deducted inside
  // `runVerticalDramaEpisodeQualityReview` itself (unchanged); this is only
  // the "can the user even afford the worst case" gate, same role
  // `hasEnoughCredits(..., 1)`-style pre-checks play at every other
  // Vertical Drama generation call site.
  const estimatedLoopCredits = estimateVerticalDramaQualityLoopCredits(
    QUALITY_LOOP_PER_ROUND_CREDIT_ESTIMATE,
    policy.maxAutoImproveRounds
  );
  if (estimatedLoopCredits > 0) {
    const hasCredits = await hasEnoughCredits(userId, estimatedLoopCredits);
    if (!hasCredits) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `เครดิตไม่พอสำหรับการปรับอัตโนมัติ (ต้องการประมาณ ${estimatedLoopCredits} เครดิต)`,
      });
    }
  }

  const [initialArtifactId, initialReviewPayload] = await Promise.all([
    loadLatestQualityReviewArtifactId(owner),
    loadLatestQualityReview(owner),
  ]);
  if (!initialArtifactId || !initialReviewPayload) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "ยังไม่มีผลตรวจคุณภาพให้ปรับตาม — กรุณาตรวจคุณภาพก่อน",
    });
  }

  const [seriesRowForLoop] = await db
    .select({
      locale: verticalDramaSeries.locale,
      productTieIn: verticalDramaSeries.productTieIn,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  const seriesTieInConfig =
    (seriesRowForLoop?.productTieIn as VerticalDramaProductTieInConfig | null) ??
    null;
  const tieInEnabledForLoop =
    tieInQcEnabled && seriesTieInConfig?.enabled === true;
  const tieInConfigForLoopReview = tieInEnabledForLoop
    ? {
        ...(seriesTieInConfig as VerticalDramaProductTieInConfig),
        enabled: true as const,
      }
    : undefined;

  const buildClipDurationsForMetrics = (
    pack: VerticalDramaMotionPromptPack | null
  ) =>
    pack?.clips?.length
      ? pack.clips.map(c => ({
          shotNumber: c.sourceShotNumbers?.[0],
          clipNumber: c.clipNumber,
          durationSeconds: c.durationSeconds,
        }))
      : undefined;

  const stagesRepaired: VerticalDramaPipelineStage[] = [];
  const staleStagesSet = new Set<VerticalDramaPipelineStage>();

  const effects: VerticalDramaQualityLoopEffects = {
    async runReview({ densityMetrics }) {
      const refreshed = await loadOwnedEpisode(owner);
      const script = refreshed.script as Record<string, unknown> | null;
      const storyboard = refreshed.storyboard as Record<string, unknown> | null;
      if (!script || !storyboard) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Episode script/storyboard missing mid-loop",
        });
      }
      const dialoguePlan = refreshed.dialogueAudioPlan as Record<
        string,
        unknown
      > | null;
      // Retention hooks (W6) — same conditional-computation convention as
      // `densityMetrics` (computed by `runVerticalDramaQualityLoop`'s own
      // caller, only ever supplied when its gating flag is on): only build
      // `retentionMetrics` when the flag is actually on, so a flag-off round
      // never even calls `computeRetentionMetrics` (zero observable side
      // effect either way — it's a pure function — but this keeps the
      // "nothing extra happens when the flag is off" contract literal).
      const retentionMetrics: VerticalDramaRetentionMetrics | undefined =
        retentionHooksEnabled
          ? computeRetentionMetrics({
              script,
              storyboard,
              recentRetentionLoopTypes: await loadRecentVerticalDramaRetentionLoopTypes(
                owner,
                refreshed.episodeNumber
              ),
            })
          : undefined;
      const outcome = await runVerticalDramaEpisodeQualityReview({
        userId,
        tenantId,
        seriesId,
        episodeId,
        episodeTitle: refreshed.title ?? `Episode ${refreshed.episodeNumber}`,
        locale: normalizeVerticalDramaSeriesLocale(seriesRowForLoop?.locale),
        script,
        storyboard,
        dialoguePlan,
        avoidPrevious: false,
        densityMetrics,
        tieInConfig: tieInConfigForLoopReview,
        idempotencyKey: params.idempotencyKey
          ? `${params.idempotencyKey}-loop-${Date.now()}`
          : undefined,
        // W11.6 "Story Lock" — same execution-only review-mode instruction
        // as `runEpisodeQualityReview`; omitted (byte-identical prompt)
        // whenever the tenant flag is off.
        reviewMode: storyLockEnabled ? "execution" : undefined,
        // Retention hooks (W6) — omitted (both) whenever the flag is off,
        // reproducing the exact prior prompt/contract_version unchanged.
        scoreRetentionDimensions: retentionHooksEnabled,
        retentionMetrics,
      });
      // `EpisodeQualityReviewOutput` is a structural superset of
      // `VerticalDramaQualityLoopReviewLike` (scorecard + issues) — returned
      // as-is (not narrowed) so `persistReview` below can persist the FULL
      // review via the SAME `persistQualityReviewArtifact` v1 uses; the loop
      // orchestrator itself only ever reads `.scorecard`/`.issues` off it.
      return outcome.review as unknown as VerticalDramaQualityLoopReviewLike;
    },
    async repairStage(stage, instruction) {
      if (stage === "tie_in") {
        // Cross-cutting tie-in rewrite (spec §13.1) — tie-in placements live
        // in `script.product_tie_in_plan`, and there is no dedicated
        // pipeline stage for them (see `verticalDramaQualityReviewApply.ts`'s
        // doc comment on why "tie_in" is deliberately not a
        // `VerticalDramaPipelineStage`). DOCUMENTED ADAPTATION: the narrowest
        // existing repair path that can rewrite that content is the SAME
        // `plan_episode_script` repair v1 already uses for script issues —
        // the instruction is prefixed so the repair pass scopes the rewrite
        // to tie-in-carrying beats/lines only (spec: "the rewrite touches
        // ONLY tie-in-carrying beats/lines/shots and preserves the story
        // spine"). W11.6 "Story Lock" — routed through the SAME guarded
        // wrapper as a direct script repair (this call really does target
        // `plan_episode_script` underneath), so a tie-in rewrite that
        // inadvertently drifts the story is caught by the exact same guard.
        const { outcome: tieInRepairOutcome, storyLockViolated } =
          await repairVerticalDramaStageWithStoryLockGuard(
            owner,
            "plan_episode_script",
            `[ปรับเฉพาะส่วนสินค้า ห้ามแก้โครงเรื่องหลัก] ${instruction}`,
            storyLockEnabled,
            retentionHooksEnabled
          );
        // W11.6 "Story Lock" — a REJECTED round already reverted the live
        // content back to prior (see `repairVerticalDramaStageWithStoryLockGuard`),
        // so nothing was actually repaired and nothing downstream is stale;
        // only record `stagesRepaired`/`staleStages` on a genuine, accepted change.
        if (!storyLockViolated) {
          stagesRepaired.push("plan_episode_script");
          for (const stale of tieInRepairOutcome.staleStages)
            staleStagesSet.add(stale);
        }
        return { storyLockViolated };
      }
      const { outcome: repairOutcome, storyLockViolated } =
        await repairVerticalDramaStageWithStoryLockGuard(
          owner,
          stage,
          instruction,
          storyLockEnabled,
          retentionHooksEnabled
        );
      if (!storyLockViolated) {
        stagesRepaired.push(stage);
        for (const stale of repairOutcome.staleStages)
          staleStagesSet.add(stale);
      }
      return { storyLockViolated };
    },
    async persistReview(review) {
      return persistQualityReviewArtifact(
        owner,
        review as unknown as EpisodeQualityReviewOutput
      );
    },
    async recomputeDensityMetrics() {
      const refreshed = await loadOwnedEpisode(owner);
      return computeVerticalDramaDensityMetrics({
        script: refreshed.script as Record<string, unknown> | null,
        storyboard: refreshed.storyboard as Record<string, unknown> | null,
        dialoguePlan: refreshed.dialogueAudioPlan as Record<
          string,
          unknown
        > | null,
        clipDurations: buildClipDurationsForMetrics(
          refreshed.motionPromptPack as VerticalDramaMotionPromptPack | null
        ),
      });
    },
  };

  const loopState = await runVerticalDramaQualityLoop({
    episodeId: String(episodeId),
    policy,
    initialReview: {
      artifactId: initialArtifactId,
      review:
        initialReviewPayload as unknown as VerticalDramaQualityLoopReviewLike,
    },
    effects,
    tieInEnabled: tieInEnabledForLoop,
    storyLockEnabled,
  });

  await persistQualityLoopStateArtifact(owner, loopState);

  const newReview = await loadQualityReviewArtifactById(
    owner,
    loopState.activeReviewArtifactId
  );

  // Wave-4A (spec §13.1) — refresh the tie-in report from the loop's FINAL
  // active review, same fold-in convention `runEpisodeQualityReview` uses.
  // Guarded on `tieInQcEnabled` BEFORE the extra `loadOwnedEpisode` read (not
  // just inside `maybeBuildAndPersistTieInQualityReport`) so a loop run with
  // tie-in QC off never pays for an unnecessary query. Best-effort: a
  // failure here must not discard the loop's real, already-paid-for work.
  if (newReview && tieInQcEnabled) {
    try {
      const finalRow = await loadOwnedEpisode(owner);
      await maybeBuildAndPersistTieInQualityReport({
        owner,
        tieInQcEnabled,
        script: finalRow.script as Record<string, unknown> | null,
        storyboard: finalRow.storyboard as Record<string, unknown> | null,
        dialogueAudioPlan: finalRow.dialogueAudioPlan as Record<
          string,
          unknown
        > | null,
        review: newReview,
        policy,
      });
    } catch (err) {
      debugError(
        "verticalDramaEpisodes.applyQualityReviewSuggestions(loop)",
        `maybeBuildAndPersistTieInQualityReport failed (episodeId=${episodeId})`,
        err
      );
    }
  }

  const escalationWarning =
    loopState.status === "escalated_regression"
      ? "คะแนนแย่ลง — คงเวอร์ชันที่ดีกว่าไว้ ต้องตรวจเอง"
      : loopState.status === "escalated_max_rounds"
        ? `ครบ ${policy.maxAutoImproveRounds} รอบแล้วยังไม่ถึงเกณฑ์ — ต้องตรวจเอง`
        : null;
  // W11.6 "Story Lock" — surfaced alongside (not instead of) any escalation
  // warning above; `storyLockRejections` is only ever present when at least
  // one round's script/storyboard repair was rejected for changing the
  // story (see `VerticalDramaQualityLoopState.storyLockRejections`'s doc
  // comment) — the prior content was kept in every such round.
  const storyLockWarning =
    loopState.storyLockRejections && loopState.storyLockRejections > 0
      ? `ปฏิเสธการซ่อม ${loopState.storyLockRejections} รอบ — เนื้อเรื่องเปลี่ยนเกินกำหนด (เก็บเวอร์ชันเดิมไว้)`
      : null;
  const warning =
    [escalationWarning, storyLockWarning].filter(Boolean).join(" / ") || null;

  return {
    loopState,
    newReview,
    stagesRepaired,
    staleStages: Array.from(staleStagesSet),
    warning,
  };
}

/* -------------------------------------------------------------------------- */
/* Speaker-switch consolidated clip (Package 3, 2026-07-11 redesign) —        */
/* split-path generation + persistence, now producing exactly ONE clip       */
/* -------------------------------------------------------------------------- */

/**
 * The split-shot ("speaker-switch consolidated clip") counterpart of
 * `generateShotVideoPrompt`'s single-clip generation + persistence — called
 * instead of `generateVerticalDramaShotVideoPrompt` whenever
 * `computeSpeakerSwitchSubShotPlan` decided this shot's dialogue needs
 * splitting (see that mutation's own call site). Applies the SAME brand-
 * sanitize -> length-cap-QC -> preset-visual-identity-token passes the
 * single-clip path applies, once (not looped — this path produces exactly
 * ONE combined timed prompt now, see `generateVerticalDramaShotVideoPromptSpeakerSwitch`),
 * then REPLACES every existing clip for this shot
 * (`sourceShotNumbers.includes(shotNumber)` OR `parentShotNumber ===
 * shotNumber`) with exactly ONE new clip, shaped IDENTICALLY to a normal
 * single-shot clip (`clipNumber: shotNumber`, no `parentShotNumber`/
 * `subShotNumber`) — never appends alongside a stale single clip or a stale
 * legacy (pre-2026-07-11) N-clip split. Identity for every referenced
 * speaker rides `extraReferenceAssetIds` (multi-reference-image support on
 * ONE `generateVideoClip` call) instead of a per-clip reference switch.
 */
async function generateAndPersistSplitShotVideoPrompt(args: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  idempotencyKey?: string;
  row: Awaited<ReturnType<typeof loadOwnedEpisode>>;
  pack: VerticalDramaMotionPromptPack | null;
  imageUrl: string;
  approvedStartFrameAssetId: string;
  imagePrompt?: string;
  storyboardShot: VerticalDramaShotgrid["shots"][number] | undefined;
  shotVideoCharacterIdentityMapBlock: string | undefined;
  dialogueLines: ShotDialogueLine[];
  /**
   * Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
   * Phase 1a) — the CALLER's already-resolved
   * `deepDraftShotForDialogue?.summary`, mirrored straight into
   * `GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams.shotContext
   * .canonicalShotSummary`. Optional/omitted preserves today's byte-
   * identical prompt (every caller before this fix).
   */
  canonicalShotSummary?: string;
  /**
   * Persistence/pin root-cause fix (`planning/vd-video-prompt-skill-first/
   * plan.md` Phase 2) — the CALLER's already-resolved
   * `deepDraftShotForDialogue?.silence_intent` truthiness, mirrored into
   * `shotContext.beatIsSilent`. In practice this split path only runs when
   * `dialogueLines` requires cutting between 2-3 speakers, so a genuinely
   * silent shot never reaches this branch — kept purely for shape symmetry
   * with the non-split path. Optional/omitted (`false`) preserves today's
   * byte-identical prompt.
   */
  beatIsSilent?: boolean;
  /**
   * Lip-sync discipline fix — `characterKey -> roster display name`,
   * pre-resolved by the CALLER from the identity sources it already fetched
   * for `shotVideoCharacterIdentityMapBlock` above (no new DB query here).
   * Used to attribute each dialogue line to its speaker by name in the
   * native-audio lip-sync block (`@shared/verticalDramaSeries/nativeDialogue.ts`).
   * Optional/omitted falls back to bare `characterKey` attribution.
   */
  characterNameByKey?: Map<string, string>;
  tieInPlacement: VerticalDramaShotProductPlacement | undefined;
  tieInProductName: string | undefined;
  tieInProductCategory: string | undefined;
  selectedVideoModel: Awaited<ReturnType<typeof resolveEpisodeVideoModel>>;
  locale: VerticalDramaSeriesLocale;
  shotDurationSeconds: number;
  speechBudgetEnabled: boolean;
  effectiveNativeAudioEnabled: boolean;
  requestedNativeAudioEnabled: boolean;
  extraDialogueCreditsUsed: number;
  subShotWindows: SpeakerSwitchSubShotWindow[];
  /**
   * Multi-character reference images (multi-character disambiguation fix,
   * `polished-toasting-gadget.md`) — the CALLER (`generateShotVideoPrompt`'s
   * `needsSplit` branch) already resolved this via
   * `resolveShotVideoPromptCharacterReferenceImages`, mirroring the existing
   * `imageUrl` convention (parent resolves a ready value, child just
   * forwards it to `generateVerticalDramaShotVideoPromptSpeakerSwitch`).
   */
  characterReferenceImages?: ShotVideoPromptCharacterReferenceImage[];
  /**
   * Location reference image (Phase E of `planning/polished-toasting-
   * gadget.md` — location visual bible) — the CALLER (`generateShotVideoPrompt`'s
   * `needsSplit` branch) already resolved this via
   * `resolveShotVideoPromptLocationReferenceImage`, mirroring
   * `characterReferenceImages`'s exact "parent resolves a ready value, child
   * just forwards it to `generateVerticalDramaShotVideoPromptSpeakerSwitch`"
   * convention immediately above.
   */
  locationReferenceImage?: { url: string; name?: string };
  /** Pre-rendered scene continuity lock consumed by the speaker-switch builder. */
  sceneContinuityLockBlock?: string;
  /**
   * planning/`polished-toasting-gadget.md` Fix B — threaded straight through
   * to `generateVerticalDramaShotVideoPromptSpeakerSwitch`'s own
   * `repairInstruction` (same contract — see
   * `GenerateVerticalDramaShotVideoPromptParams.repairInstruction`'s doc
   * comment). Optional/omitted by every caller except the one Fix B call
   * site below, preserving today's behavior.
   */
  repairInstruction?: string;
  /**
   * VideoPromptAiEditDialog — user-supplied reference image URLs, mirrored
   * from the parent `generateShotVideoPrompt` mutation and threaded straight
   * through to `generateVerticalDramaShotVideoPromptSpeakerSwitch`.
   */
  attachShotImage?: boolean;
  additionalImageUrls?: string[];
  /**
   * Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
   * quality/plan.md` Phase 2) — threaded straight through to
   * `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch`'s own
   * `qualityLoop` (same contract as the non-split path). The CALLER
   * (`generateShotVideoPrompt`) resolves the `input.qualityLoop ?? true`
   * default before calling this function.
   */
  qualityLoop?: boolean;
  motionContractsEnabled: boolean;
}) {
  const {
    tenantId,
    userId,
    seriesId,
    episodeId,
    shotNumber,
    idempotencyKey,
    row,
    pack,
    imageUrl,
    approvedStartFrameAssetId,
    imagePrompt,
    storyboardShot,
    shotVideoCharacterIdentityMapBlock,
    dialogueLines,
    canonicalShotSummary,
    beatIsSilent,
    characterNameByKey,
    tieInPlacement,
    tieInProductName,
    tieInProductCategory,
    selectedVideoModel,
    locale,
    shotDurationSeconds,
    speechBudgetEnabled,
    effectiveNativeAudioEnabled,
    requestedNativeAudioEnabled,
    extraDialogueCreditsUsed,
    subShotWindows,
    characterReferenceImages,
    locationReferenceImage,
    sceneContinuityLockBlock,
    repairInstruction,
    attachShotImage,
    additionalImageUrls,
    qualityLoop,
    motionContractsEnabled,
  } = args;

  // Lip-sync discipline fix — same speaker-attribution mirror convention as
  // the non-split path in `generateShotVideoPrompt` above.
  const dialogueLinesWithSpeakerNames = dialogueLines.map(l => ({
    ...l,
    speakerName: l.characterKey ? characterNameByKey?.get(l.characterKey) : undefined,
  }));

  const motionContractStartedAt = Date.now();
  const speakerSwitchGeneration = await generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch({
    userId,
    tenantId,
    seriesId,
    episodeId,
    shotNumber,
    imageUrl,
    imagePrompt,
    characterReferenceImages,
    locationReferenceImage,
    qualityLoop,
    motionContractsEnabled,
    shotContext: {
      canonicalShotSummary,
      beatIsSilent,
      description: storyboardShot?.description,
      camera: storyboardShot?.cameraSetup,
      emotion: undefined,
      dialogueLines: dialogueLines.length ? dialogueLinesWithSpeakerNames : undefined,
      characterIdentityMap: shotVideoCharacterIdentityMapBlock,
      sceneContinuityLockBlock,
      productContext: tieInPlacement
        ? {
            productName: tieInProductName,
            benefitTalkingPoint: tieInPlacement.benefitTalkingPoint,
            placementStyle: tieInPlacement.placementStyle,
            productCategory: tieInProductCategory,
          }
        : undefined,
    },
    selectedVideoModelId: selectedVideoModel.id,
    selectedVideoModel,
    locale,
    promptLanguage: pack?.promptLanguage,
    dialogueLanguage: pack?.dialogueLanguage,
    thaiAccent: pack?.thaiAccent,
    ...(speechBudgetEnabled
      ? {
          shotDurationSeconds,
          targetSpeechSeconds: targetVerticalDramaSpeechSeconds(shotDurationSeconds),
        }
      : {}),
    nativeAudioEnabled: effectiveNativeAudioEnabled,
    idempotencyKey,
    subShotWindows,
    repairInstruction,
    attachShotImage,
    additionalImageUrls,
  });
  if (speakerSwitchGeneration.motionContractStatus) {
    auditLogger.log({
      eventType: "vd_motion_contract_generated",
      userId,
      tenantId,
      model: speakerSwitchGeneration.model,
      metadata: {
        seriesId,
        episodeId,
        shot: shotNumber,
        effectiveRisk: speakerSwitchGeneration.effectiveRisk,
        contractStatus: speakerSwitchGeneration.motionContractStatus,
        modelFamily: speakerSwitchGeneration.family,
        observabilityPresent: Boolean(speakerSwitchGeneration.frameAnalysis),
        contractPresent: Boolean(speakerSwitchGeneration.motionProfile),
        ms: Date.now() - motionContractStartedAt,
      },
    });
  }

  // Same 2 passes the single-clip path applies (brand sanitize -> length-cap
  // QC), applied ONCE — no loop, this path now produces exactly one combined
  // prompt.
  let prompt = speakerSwitchGeneration.prompt;
  let negativeMotionPrompt = speakerSwitchGeneration.negativeMotionPrompt;
  if (tieInPlacement) {
    prompt = sanitizeBrandMentionsInPrompt(prompt, [tieInProductName], tieInProductCategory);
    if (negativeMotionPrompt) {
      negativeMotionPrompt = sanitizeBrandMentionsInPrompt(
        negativeMotionPrompt,
        [tieInProductName],
        tieInProductCategory
      );
    }
  }
  const { presetMixV2Enabled, seriesLookLockEnabled } =
    await resolveVerticalDramaQualityLoopFlags(tenantId);
  if (presetMixV2Enabled || seriesLookLockEnabled) {
    const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
      tenantId, userId, seriesId, { presetMixV2Enabled, seriesLookLockEnabled },
    );
    if (presetVisualIdentity) {
      prompt = appendPresetVisualIdentityStyleTokensToMotionPrompt(prompt, presetVisualIdentity);
    }
  }
  const speakerSwitchCapabilities = resolveVerticalDramaCapabilities(selectedVideoModel.id, {
    type: selectedVideoModel.type,
    aspectRatios: selectedVideoModel.aspectRatios,
    configJson: selectedVideoModel.configJson,
  });
  const qc = await ensurePromptWithinLimit({
    kind: "video",
    prompt,
    // Dialogue-duplication fix (2026-07-15) — protect each individual
    // spoken line (not the `buildNativeDialogueVerbatimBlock` boilerplate
    // block). The refiner already keeps dialogue inline/verbatim while
    // compressing, so protecting the block caused it to be re-appended a
    // SECOND time on top of the refiner's inline lines whenever the prompt
    // was over the length cap. Protecting the bare quoted line lets
    // `finalizeProtectedFragments` recognize the refiner's inline dialogue
    // as already-present (no duplicate) and only re-append a genuinely
    // dropped line, as a single bare quoted line — never the block.
    protectedFragments:
      speakerSwitchCapabilities.nativeAudioDialogue === true
        ? speakerSwitchGeneration.dialogue
            .map(l => l.lineTh.trim())
            // BARE, UNQUOTED line text — do NOT wrap in `"..."`.
            // finalizeProtectedFragments matches via a raw `indexOf`, and the
            // skill/refiner writes inline dialogue in CURLY quotes; a
            // straight-quoted fragment never matches inline, so it gets wrongly
            // re-appended (dialogue-duplication regression, 2026-07-15). The
            // unquoted line is found inside the curly-quoted inline text.
            .filter(Boolean)
        : undefined,
    userId,
    tenantId,
    seriesId,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:prompt-qc` : undefined,
    label: `shot video prompt (episode #${episodeId}, shot ${shotNumber})`,
  });
  prompt = qc.prompt;

  // Resolve every distinct speaker's own approved primary-portrait media
  // asset id, in `distinctSpeakerCharacterKeys` order. The shot's approved
  // composite image remains the authoritative `startFrameAssetId`; every
  // portrait is an extra identity reference so regenerating this prompt
  // cannot replace the actual shot image with an individual portrait.
  // These references let identity for every referenced speaker ride
  // the video model's multi-reference-image support on this ONE
  // `generateVideoClip` call instead of switching the reference image per
  // segment. Omitted (falls back to the shot's existing single approved
  // start frame at render time) for any character with no portrait yet. No
  // image generation happens here — bounded scope per the task's plan.
  const distinctCharacterKeys = speakerSwitchGeneration.distinctSpeakerCharacterKeys;
  const portraitAssetIdByCharacterKey = new Map<string, string>();
  if (distinctCharacterKeys.length > 0) {
    const characterRows = await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, tenantId),
          eq(verticalDramaCharacters.seriesId, seriesId),
          inArray(verticalDramaCharacters.characterKey, distinctCharacterKeys)
        )
      );
    const characterRowByKey = new Map<string, (typeof characterRows)[number]>();
    for (const c of characterRows) {
      characterRowByKey.set(c.characterKey, c);
    }
    for (const key of distinctCharacterKeys) {
      const characterRow = characterRowByKey.get(key);
      if (!characterRow) continue;
      const assetId = await verticalDramaCharacterStockService.getPrimaryPortraitAssetId(
        { tenantId, userId, seriesId },
        characterRow.id
      );
      if (assetId) {
        portraitAssetIdByCharacterKey.set(key, String(assetId));
      }
    }
  }
  const orderedPortraitAssetIds = distinctCharacterKeys
    .map(key => portraitAssetIdByCharacterKey.get(key))
    .filter(
      (id): id is string =>
        Boolean(id) && id !== approvedStartFrameAssetId
    );

  // Model-family-aware, vision-grounded video prompt quality upgrade
  // (`planning/vd-video-prompt-model-family-quality/plan.md`) — mirrors
  // `generateShotVideoPrompt`'s own identical construction (non-split path)
  // above/below in this file. `family` is the SERVICE's own resolution
  // (`speakerSwitchGeneration.family`, always present); `modelId`/
  // `modelName` come from the already-resolved `selectedVideoModel` row.
  const splitShotVideoPromptModelTarget: VideoPromptModelTarget = {
    family: speakerSwitchGeneration.family,
    modelId: selectedVideoModel.id,
    modelName: selectedVideoModel.name,
    generatedAt: new Date().toISOString(),
  };
  const splitShotVideoPromptWarnings: VerticalDramaWarning[] = (
    speakerSwitchGeneration.warnings ?? []
  ).map(message => ({
    code: "vd_video_prompt_position_anchor_degraded",
    severity: "warning" as const,
    message,
    targetShotNumber: shotNumber,
    targetClipNumber: shotNumber,
    repairable: true,
  }));
  if (splitShotVideoPromptWarnings.length > 0) {
    console.warn(
      "[vd_video_prompt] position-anchor check degraded (speaker-switch)",
      { seriesId, episodeId, shotNumber },
      splitShotVideoPromptWarnings.map(w => w.message),
    );
  }

  // Exactly ONE clip, shaped IDENTICALLY to a normal single-shot clip —
  // `clipNumber: shotNumber` (never `shotNumber * 100 + n`), no
  // `parentShotNumber`/`subShotNumber` — this is what makes the frontend's
  // existing generic per-clip render loop need ZERO changes.
  const newClip = {
    clipNumber: shotNumber,
    sourceShotNumbers: [shotNumber],
    durationSeconds: speakerSwitchGeneration.durationSeconds,
    prompt,
    negativeMotionPrompt,
    startFrameAssetId: approvedStartFrameAssetId,
    extraReferenceAssetIds: orderedPortraitAssetIds.length
      ? orderedPortraitAssetIds
      : undefined,
    dialogue: speakerSwitchGeneration.dialogue,
    requiredDisclosure: speakerSwitchGeneration.requiredDisclosure,
    audioDirection: speakerSwitchGeneration.audioDirection,
    promptModelTarget: splitShotVideoPromptModelTarget,
    frameAnalysis: speakerSwitchGeneration.frameAnalysis,
    ...(speakerSwitchGeneration.motionContractStatus
      ? {
          motionContractStatus: speakerSwitchGeneration.motionContractStatus,
          ...(speakerSwitchGeneration.motionProfile
            ? {
                motionProfile: speakerSwitchGeneration.motionProfile,
                effectiveRisk: speakerSwitchGeneration.effectiveRisk,
              }
            : {}),
        }
      : {}),
    // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
    // quality/plan.md` Phase 2) — compact record of how this prompt was
    // produced (single vs judged-best-of-2, verdict, whether a repair round
    // shipped) for the storyboard UI.
    promptQuality: speakerSwitchGeneration.promptQuality,
  };

  // 2026-07-11 lost-update race fix, applied to this path for the same
  // reason `generateShotVideoPrompt`'s own persist step below was fixed
  // (see that mutation's transaction block doc comment for the full
  // incident) — this path never had a lock before. A SEPARATE, parallel
  // transaction block (NOT shared with that fix's code) — both call sites
  // now converge on "replace this shot's clip(s) with exactly ONE fresh
  // clip", so both deserve the same row-lock protection against concurrent
  // overlapping calls for the same episode.
  await db.transaction(async tx => {
    const [freshRow] = await tx
      .select({ motionPromptPack: verticalDramaEpisodes.motionPromptPack })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, episodeId),
          eq(verticalDramaEpisodes.tenantId, tenantId),
          eq(verticalDramaEpisodes.userId, userId),
          eq(verticalDramaEpisodes.seriesId, seriesId)
        )
      )
      .for("update")
      .limit(1);
    const freshPack =
      (freshRow?.motionPromptPack as VerticalDramaMotionPromptPack | null) ?? pack;

    let updatedPack: VerticalDramaMotionPromptPack;
    if (freshPack) {
      // Replace, don't append: remove every existing clip for this shot
      // (whether it was previously a single clip or a legacy N-clip split)
      // before inserting exactly ONE fresh clip.
      const remainingClips = freshPack.clips.filter(
        c =>
          !(
            c.sourceShotNumbers?.includes(shotNumber) ||
            c.parentShotNumber === shotNumber
          )
      );
      updatedPack = {
        ...freshPack,
        clips: [...remainingClips, newClip],
        nativeAudioEnabled: requestedNativeAudioEnabled,
        // Model-family-aware, vision-grounded video prompt quality upgrade
        // (item C) — only touches `warnings` when the service actually
        // surfaced one, so a call with nothing to report stays byte-
        // identical to `freshPack.warnings`.
        ...(splitShotVideoPromptWarnings.length > 0
          ? { warnings: [...freshPack.warnings, ...splitShotVideoPromptWarnings] }
          : {}),
      };
    } else {
      updatedPack = {
        selectedVideoModelId: selectedVideoModel.id,
        durationProfileId:
          row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        nativeAudioEnabled: requestedNativeAudioEnabled,
        clips: [newClip],
        warnings: splitShotVideoPromptWarnings,
      };
    }

    await tx
      .update(verticalDramaEpisodes)
      .set({
        motionPromptPack: stampArtifactForStoryboard(
          updatedPack as unknown as Record<string, unknown>,
          row.storyboard,
        ),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, episodeId),
          eq(verticalDramaEpisodes.tenantId, tenantId),
          eq(verticalDramaEpisodes.userId, userId),
          eq(verticalDramaEpisodes.seriesId, seriesId)
        )
      );
  });

  return {
    prompt: newClip.prompt,
    dialogue: newClip.dialogue,
    creditsUsed: speakerSwitchGeneration.creditsUsed + extraDialogueCreditsUsed,
    usedVision: speakerSwitchGeneration.usedVision,
    audioDirection: speakerSwitchGeneration.audioDirection,
    promptModelTarget: splitShotVideoPromptModelTarget,
    promptQuality: speakerSwitchGeneration.promptQuality,
  };
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaEpisodesRouter = router({
  /**
   * Create an episode, assigning the next episode number safely. The unique
   * index (tenant, series, episodeNumber) prevents concurrent duplicates; the
   * idempotency key returns the same episode on retry.
   */
  createEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        title: z.string().trim().max(255).optional(),
        targetDurationSeconds: z.number().int().positive().max(3600).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Idempotent retry: a persistent receipt in the (otherwise-null-at-create)
      // `script` jsonb survives replays, so a repeated request returns the same
      // episode instead of assigning a new number.
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              sql`${verticalDramaEpisodes.script}->>'_idempotencyReceipt' = ${input.idempotencyKey}`
            )
          )
          .limit(1);
        if (existing)
          return { episode: { ...existing, id: String(existing.id) } };
      }

      const scriptReceipt = input.idempotencyKey
        ? { _idempotencyReceipt: input.idempotencyKey }
        : null;

      // Safe max+1 assignment with retry-on-unique-violation so concurrent
      // creators never duplicate the same episode number (spec Tests) —
      // shared with `generateNextEpisodes` via `insertEpisodeWithSafeNumber`.
      const row = await insertEpisodeWithSafeNumber(
        tenantId,
        userId,
        seriesId,
        {
          title: input.title ?? null,
          script: scriptReceipt,
          targetDurationSeconds: input.targetDurationSeconds,
        }
      );
      return { episode: { ...row, id: String(row.id) } };
    }),

  /**
   * Generate `count` MORE episodes that genuinely continue the same
   * storyline — repeatable indefinitely. Two modes, chosen automatically
   * (never by the caller):
   *
   *  - Mode A "materialize from plan" (free, no LLM call): takes unused
   *    `bible.episodeBreakdown` entries already written by the series'
   *    "Generate story" step (`generateStoryBible`) and inserts them as real
   *    episode rows.
   *  - Mode B "LLM continuation" (credit-gated): once there are no unused
   *    breakdown entries left, calls an LLM with every existing episode so
   *    far for continuity, appends the new entries to the series'
   *    `bible.episodeBreakdown` (never overwriting other bible keys), and
   *    inserts them as real episode rows too.
   *
   * Both modes insert via `insertEpisodeWithSafeNumber` — the exact same
   * race-safe numbering `createEpisode` uses — so calling this back-to-back
   * indefinitely never produces a duplicate/racy episode number.
   */
  generateNextEpisodes: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        count: z.number().int().min(1).max(1000).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      const [seriesRow] = await db
        .select()
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId)
          )
        )
        .limit(1);
      if (!seriesRow)
        throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });

      const bible = (seriesRow.bible as Record<string, unknown> | null) ?? {};
      const episodeBreakdown: EpisodeBreakdownItem[] = Array.isArray(
        bible.episodeBreakdown
      )
        ? (bible.episodeBreakdown as EpisodeBreakdownItem[])
        : [];

      const existingRows: Array<{
        id: number;
        episodeNumber: number;
        title: string | null;
        script: unknown;
      }> = await db
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          script: verticalDramaEpisodes.script,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      let maxEpisodeNumber = existingRows.reduce(
        (max: number, r) => Math.max(max, r.episodeNumber),
        0
      );
      const targetEpisodeCount = Math.max(0, Number(seriesRow.targetEpisodeCount ?? 0));
      const remainingEpisodeSlots =
        targetEpisodeCount > 0
          ? Math.max(0, targetEpisodeCount - existingRows.length)
          : input.count;

      // Continuity context so far, oldest first: prefer the row's own
      // materialized draft summary, falling back to a matching plan entry.
      const existingEpisodes: ExistingEpisodeContext[] = existingRows.map(r => {
        const draftSummary = (r.script as Record<string, unknown> | null)
          ?._draftSummary as
          | { logline?: string; keyBeats?: string[] }
          | undefined;
        const planned = episodeBreakdown.find(
          b => b.episodeNumber === r.episodeNumber
        );
        return {
          episodeNumber: r.episodeNumber,
          title: r.title,
          logline: draftSummary?.logline ?? planned?.logline,
          keyBeats: draftSummary?.keyBeats ?? planned?.keyBeats,
        };
      });

      const insertedEpisodes: Array<{
        id: string;
        episodeNumber: number;
        title: string | null;
        status: string;
      }> = [];
      let remaining = Math.min(input.count, remainingEpisodeSlots);
      let creditsUsed = 0;
      let usedModeA = false;
      let usedModeB = false;

      if (remaining <= 0) {
        return { episodes: insertedEpisodes, creditsUsed, source: "breakdown" as const };
      }

      // Mode A — materialize unused planned breakdown entries (free, no LLM call).
      const unusedPlanned = episodeBreakdown
        .filter(
          b =>
            b.episodeNumber > maxEpisodeNumber &&
            (targetEpisodeCount <= 0 || b.episodeNumber <= targetEpisodeCount)
        )
        .sort((a, b) => a.episodeNumber - b.episodeNumber);

      for (const planned of unusedPlanned) {
        if (remaining <= 0) break;
        const row = await insertEpisodeWithSafeNumber(
          tenantId,
          userId,
          seriesId,
          {
            title: planned.workingTitle,
            script: {
              _draftSummary: {
                logline: planned.logline,
                keyBeats: planned.keyBeats,
              },
            },
            status: "draft",
          }
        );
        const episodeNumber = Number(row.episodeNumber);
        const title = row.title as string | null;
        insertedEpisodes.push({
          id: String(row.id),
          episodeNumber,
          title,
          status: String(row.status),
        });
        existingEpisodes.push({
          episodeNumber,
          title,
          logline: planned.logline,
          keyBeats: planned.keyBeats,
        });
        maxEpisodeNumber = Math.max(maxEpisodeNumber, episodeNumber);
        remaining -= 1;
        usedModeA = true;
      }

      // Mode B — LLM continuation for whatever `count` Mode A couldn't cover.
      // All-or-nothing: `generateNextEpisodesViaLlm` throws rather than
      // returning a short batch, so we never insert a partial Mode-B batch.
      const appendedBreakdown: EpisodeBreakdownItem[] = [];
      let previousEpisodeBridgeForBible: {
        episodeNumber: number;
        logline?: string;
        keyBeats?: string[];
      } | null = null;
      if (remaining > 0) {
        let llmResult;
        try {
          llmResult = await generateNextEpisodesViaLlm({
            userId,
            tenantId,
            seriesId,
            title: seriesRow.title,
            locale: normalizeVerticalDramaSeriesLocale(seriesRow.locale),
            genre: seriesRow.genre,
            tone: seriesRow.tone,
            bible,
            existingEpisodes,
            nextEpisodeNumber: maxEpisodeNumber + 1,
            count: remaining,
          });
        } catch (error) {
          if (error instanceof EpisodeContinuationInsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: error.message });
          }
          if (error instanceof EpisodeContinuationSchemaValidationError) {
            throw new TRPCError({
              code: "UNPROCESSABLE_CONTENT",
              message: error.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Episode continuation failed",
          });
        }

        creditsUsed = llmResult.creditsUsed;
        usedModeB = true;

        if (llmResult.previousEpisodeBridge) {
          const bridge = llmResult.previousEpisodeBridge;
          const previousRow = existingRows.find(
            row => row.episodeNumber === bridge.episodeNumber
          );
          if (previousRow) {
            previousEpisodeBridgeForBible = bridge;
            const previousScript =
              previousRow.script && typeof previousRow.script === "object"
                ? (previousRow.script as Record<string, unknown>)
                : {};
            await db
              .update(verticalDramaEpisodes)
              .set({
                script: {
                  ...previousScript,
                  _draftSummary: {
                    ...((previousScript._draftSummary as Record<string, unknown> | undefined) ?? {}),
                    ...(bridge.logline ? { logline: bridge.logline } : {}),
                    ...(bridge.keyBeats ? { keyBeats: bridge.keyBeats } : {}),
                  },
                  _continuationBridge: {
                    toEpisodeNumber: maxEpisodeNumber + 1,
                    updatedAt: new Date().toISOString(),
                  },
                },
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(verticalDramaEpisodes.id, previousRow.id),
                  eq(verticalDramaEpisodes.tenantId, tenantId),
                  eq(verticalDramaEpisodes.seriesId, seriesId)
                )
              );
          }
        }

        // Insert the whole Mode-B batch (the service already guaranteed a
        // full-count response). The episode number actually persisted comes
        // from the same safe max+1 helper, not the model's claimed number, so
        // the bible's `episodeBreakdown` is updated with the REAL numbers to
        // stay consistent with what a future call's Mode A will see.
        for (const planned of llmResult.generated) {
          const row = await insertEpisodeWithSafeNumber(
            tenantId,
            userId,
            seriesId,
            {
              title: planned.workingTitle,
              script: {
                _draftSummary: {
                  logline: planned.logline,
                  keyBeats: planned.keyBeats,
                },
              },
              status: "draft",
            }
          );
          const episodeNumber = Number(row.episodeNumber);
          insertedEpisodes.push({
            id: String(row.id),
            episodeNumber,
            title: row.title as string | null,
            status: String(row.status),
          });
          appendedBreakdown.push({
            episodeNumber,
            workingTitle: planned.workingTitle,
            logline: planned.logline,
            keyBeats: planned.keyBeats,
          });
        }
      }

      // Append (never overwrite) the newly-generated entries into the series'
      // bible.episodeBreakdown, and keep the immediate previous episode's
      // bridge beat aligned with the row update.
      if (appendedBreakdown.length > 0 || previousEpisodeBridgeForBible) {
        const bridgedEpisodeBreakdown = previousEpisodeBridgeForBible
          ? episodeBreakdown.map(item =>
              item.episodeNumber === previousEpisodeBridgeForBible?.episodeNumber
                ? {
                    ...item,
                    ...(previousEpisodeBridgeForBible.logline
                      ? { logline: previousEpisodeBridgeForBible.logline }
                      : {}),
                    ...(previousEpisodeBridgeForBible.keyBeats
                      ? { keyBeats: previousEpisodeBridgeForBible.keyBeats }
                      : {}),
                  }
                : item
            )
          : episodeBreakdown;
        const updatedBible = {
          ...bible,
          episodeBreakdown: [...bridgedEpisodeBreakdown, ...appendedBreakdown],
        };
        await db
          .update(verticalDramaSeries)
          .set({ bible: updatedBible, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          );
      }

      const source: "breakdown" | "generated" | "mixed" =
        usedModeA && usedModeB
          ? "mixed"
          : usedModeB
            ? "generated"
            : "breakdown";

      return { episodes: insertedEpisodes, creditsUsed, source };
    }),

  /**
   * Delete one owned episode. Child rows that point at the episode
   * (runs/artifacts/checkpoints/shot references, etc.) are removed by DB-level
   * ON DELETE CASCADE; media library assets themselves are not deleted.
   */
  deleteEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      const [deleted] = await db
        .delete(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .returning({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
        });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      return {
        episode: {
          id: String(deleted.id),
          episodeNumber: deleted.episodeNumber,
          title: deleted.title,
        },
      };
    }),

  /**
   * Patch an owned episode's draft plan JSONB fields (script, storyboard, etc.)
   * and/or its title. Ownership-scoped (NOT_FOUND on a cross-tenant/user id).
   * Only supplied fields are written; this never triggers paid generation.
   */
  updateEpisodeDraft: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        title: z.string().trim().max(255).nullable().optional(),
        script: z.record(z.string(), z.unknown()).nullable().optional(),
        storyboard: z.record(z.string(), z.unknown()).nullable().optional(),
        startFramePlan: z.record(z.string(), z.unknown()).nullable().optional(),
        dialogueAudioPlan: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
        motionPromptPack: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
        assemblyManifest: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      // Confirm ownership (throws NOT_FOUND otherwise).
      const existingEpisode = await loadOwnedEpisode(owner);

      const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.script !== undefined) updates.script = input.script;
      const effectiveStoryboard =
        input.storyboard && typeof input.storyboard === "object"
          ? stampStoryboardRevision(input.storyboard)
          : input.storyboard !== undefined
            ? input.storyboard
            : existingEpisode.storyboard;
      if (input.storyboard !== undefined) updates.storyboard = effectiveStoryboard;
      if (input.startFramePlan !== undefined)
        updates.startFramePlan = input.startFramePlan && effectiveStoryboard
          ? stampArtifactForStoryboard(input.startFramePlan, effectiveStoryboard)
          : input.startFramePlan;
      if (input.dialogueAudioPlan !== undefined)
        updates.dialogueAudioPlan = input.dialogueAudioPlan;
      if (input.motionPromptPack !== undefined)
        updates.motionPromptPack = input.motionPromptPack && effectiveStoryboard
          ? stampArtifactForStoryboard(input.motionPromptPack, effectiveStoryboard)
          : input.motionPromptPack;
      if (input.assemblyManifest !== undefined)
        updates.assemblyManifest = input.assemblyManifest && effectiveStoryboard
          ? stampArtifactForStoryboard(input.assemblyManifest, effectiveStoryboard)
          : input.assemblyManifest;

      if (input.storyboard !== undefined) {
        if (input.startFramePlan === undefined) {
          updates.startFramePlan = markArtifactStale(
            existingEpisode.startFramePlan,
            existingEpisode.storyboard,
          );
        }
        if (input.motionPromptPack === undefined) {
          updates.motionPromptPack = markArtifactStale(
            existingEpisode.motionPromptPack,
            existingEpisode.storyboard,
          );
        }
        if (input.assemblyManifest === undefined) {
          updates.assemblyManifest = markArtifactStale(
            existingEpisode.assemblyManifest,
            existingEpisode.storyboard,
          );
        }
      }

      const [row] = await db
        .update(verticalDramaEpisodes)
        .set(updates)
        .where(
          and(
            eq(verticalDramaEpisodes.id, owner.episodeId),
            eq(verticalDramaEpisodes.tenantId, owner.tenantId),
            eq(verticalDramaEpisodes.userId, owner.userId),
            eq(verticalDramaEpisodes.seriesId, owner.seriesId)
          )
        )
        .returning();

      return { episode: { ...row, id: String(row.id) } };
    }),

  /**
   * Persist one generated/uploaded clip task without writing a stale whole
   * `motionPromptPack` snapshot.
   *
   * Video clips finish independently. The old client called
   * `updateEpisodeDraft({ motionPromptPack: ... })` for every completion; two
   * completions based on the same React-query snapshot could therefore erase
   * each other. This mutation locks and re-reads the episode row, merges only
   * the requested clip, and commits the result atomically.
   */
  persistVideoClipTask: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        clipNumber: z.number().int().positive(),
        sourceShotNumber: z.number().int().positive().optional(),
        durationSeconds: z.number().positive().max(3600).optional(),
        selectedVideoModelId: z.string().trim().max(255).optional(),
        videoTask: z
          .union([
            z.object({ pendingTaskId: z.string().min(1) }),
            z.object({
              videoUrl: z.string().min(1),
              mediaTaskId: z.string().min(1).optional(),
              source: z.enum(["generated", "upload"]).optional(),
            }),
          ])
          .nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };

      // Ownership check happens before the transaction so a cross-tenant or
      // cross-user request cannot use the row lock as an existence oracle. The
      // returned row also supplies the storyboard used to stamp artifact
      // provenance below (same convention as the sibling motion-pack writers).
      const ownedEpisode = await loadOwnedEpisode(owner);

      const persisted = await db.transaction(async tx => {
        const [freshRow] = await tx
          .select({
            motionPromptPack: verticalDramaEpisodes.motionPromptPack,
          })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          )
          .for("update")
          .limit(1);

        const freshPack =
          (freshRow?.motionPromptPack as VerticalDramaMotionPromptPack | null) ??
          null;
        const updatedPack = mergeVideoTaskIntoMotionPromptPack(
          freshPack,
          input.clipNumber,
          input.videoTask as VerticalDramaVideoTaskPatch | null,
          input.sourceShotNumber,
          input.durationSeconds ?? 8,
          input.selectedVideoModelId ?? ""
        );

        if (!updatedPack) return false;

        await tx
          .update(verticalDramaEpisodes)
          .set({
            motionPromptPack: stampArtifactForStoryboard(
              updatedPack as unknown as Record<string, unknown>,
              ownedEpisode.storyboard,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );
        return true;
      });

      return { persisted, clipNumber: input.clipNumber };
    }),

  /**
   * List an episode's approval checkpoints (read-only), newest first, optionally
   * filtered by state. The workspace approval bar resolves the pending
   * checkpoint id for a stage from this. Ownership-scoped.
   */
  listCheckpoints: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        state: z
          .enum(["pending", "approved", "rejected", "repaired"])
          .optional(),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);

      const conditions = [
        eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
        eq(verticalDramaApprovalCheckpoints.userId, owner.userId),
        eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
        eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
      ];
      if (input.state) {
        conditions.push(
          eq(verticalDramaApprovalCheckpoints.state, input.state)
        );
      }

      const rows = await db
        .select()
        .from(verticalDramaApprovalCheckpoints)
        .where(and(...conditions))
        .orderBy(
          desc(verticalDramaApprovalCheckpoints.updatedAt),
          desc(verticalDramaApprovalCheckpoints.id)
        )
        .limit(input.limit ?? 200);

      return {
        checkpoints: rows.map((r: (typeof rows)[number]) => ({
          checkpointId: String(r.id),
          runId: String(r.runId),
          stage: r.stage,
          state: r.state,
          sourceArtifactIds: (r.sourceArtifactIds as string[] | null) ?? [],
          notes: r.notes,
          updatedAt: r.updatedAt,
        })),
      };
    }),

  /** Run a single pipeline stage (dry-run capable). */
  runStage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        mode: runModeEnum.default("dry_run"),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      const stageRow = await loadOwnedEpisode(owner);

      // Wave-4A (spec §13.1) tie-in gate — the "Storyboard Review handoff"
      // equivalent: REJECT the REAL (non-dry-run/plan_only) `create_
      // storyboard_review_project` run for an episode whose latest tie-in
      // quality report is failing or missing (VD_TIE_IN_BELOW_FLOOR). A
      // dry-run/plan_only preview is never gated (it renders nothing, spends
      // nothing). No-op for episodes with no tie-in placement, or when
      // `verticalDramaSeriesTieInQc` is off.
      if (
        input.stage === "create_storyboard_review_project" &&
        !VERTICAL_DRAMA_DRY_RUN_MODES.has(input.mode)
      ) {
        const { tieInQcEnabled } =
          await resolveVerticalDramaQualityLoopFlags(tenantId);
        await assertTieInQualityGatePassed({
          owner,
          tieInQcEnabled,
          script: stageRow.script as Record<string, unknown> | null,
        });
      }

      // Task #26 — same shape as the tie-in gate above: REJECT a fresh
      // (real-mode) `plan_episode_script` run for an episode beyond the
      // season plan, before any LLM call is attempted. Dry-run/plan_only
      // previews are never gated (mirrors the tie-in gate's own carve-out).
      if (
        input.stage === "plan_episode_script" &&
        !VERTICAL_DRAMA_DRY_RUN_MODES.has(input.mode)
      ) {
        await assertEpisodeWithinSeasonPlan(
          tenantId,
          ctx.user.id,
          owner.seriesId,
          stageRow.episodeNumber
        );
      }

      const [
        { flagOn, policy },
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      ] = await Promise.all([
        resolveSubShotPolicy(tenantId, input.subShotPolicy),
        resolveVerticalDramaDeepStoryDraftsFlag(tenantId),
        resolveVerticalDramaTieInReplanFlag(tenantId),
        resolveVerticalDramaRetentionHooksFlag(tenantId),
        resolveVerticalDramaMotionContractsFlag(tenantId),
      ]);
      const stageOpts: RunStageOptions = {
        mode: input.mode as never,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      };

      // Bug #127 (`planning/vd-storyboard-runstage-async-job/plan.md`) —
      // `storyboard_shotgrid`'s REAL generation path (mode not dry_run/
      // plan_only) never runs inline on this request anymore: it would
      // routinely outlive Cloudflare's ~100s edge-proxy read timeout. Submit
      // + return immediately instead; the client polls this stage's run
      // status (`result.status: "queued"`/`"running"` -> `"succeeded"`/
      // `"failed"`) the same way it already does for other async jobs.
      // dry_run/plan_only previews for this stage, and EVERY other stage
      // (paid or not), are completely untouched — still fully synchronous.
      // Generalized 2026-07-31 from the single `storyboard_shotgrid` check to
      // the whole set (`planning/vd-async-stage-jobs-generalization/plan.md`):
      // `plan_episode_script` hits the very same Cloudflare ~100s wall, and
      // its 524 left the user re-running a generation that had already
      // succeeded server-side.
      if (
        VERTICAL_DRAMA_ASYNC_STAGES.has(input.stage) &&
        !VERTICAL_DRAMA_DRY_RUN_MODES.has(input.mode)
      ) {
        return submitStoryboardShotgridAsync(
          owner,
          stageOpts,
          undefined,
          input.stage
        );
      }

      const outcome = await pipelineForMode(input.mode).runStage(
        owner,
        input.stage,
        stageOpts
      );
      return outcome;
    }),

  /**
   * Regenerate a stage from scratch: delete its prior run(s) (cascades to
   * that run's approval checkpoints and artifacts via FK `onDelete:
   * "cascade"`), then immediately run it again in "full" mode. Distinct from
   * `repairStageOutput`, which deliberately never deletes — this is the
   * explicit "throw away what's there and start over" action the user asked
   * for, for stages whose current output isn't worth repairing incrementally.
   * Destructive — the client gates this behind an explicit confirm step, the
   * same convention as the paid "generate real script" action.
   *
   * Also deletes every DOWNSTREAM stage's run(s) (bug found 2026-07-05: an
   * earlier version only deleted the clicked stage, so regenerating e.g.
   * the script left the storyboard/start-frame/etc. — all built FROM that
   * script — completely untouched; the user correctly saw "regenerated" but
   * the shots/images they were looking at never changed, because those
   * belong to a different, later stage this action never touched). This
   * mirrors `repairStageOutput`'s existing `staleStages` concept
   * (`VerticalDramaEpisodePipeline.downstreamStages`), except here the stale
   * downstream content is actually deleted, not just flagged, since
   * "regenerate" is the explicit from-scratch action.
   */
  regenerateStage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      const stageRow = await loadOwnedEpisode(owner);

      // Wave-4A (spec §13.1) tie-in gate — `regenerateStage` always runs in
      // "full" (real) mode, so `create_storyboard_review_project` is gated
      // unconditionally here (matching `runStage`'s non-dry-run branch).
      // Rejects BEFORE the destructive delete below, so a below-floor tie-in
      // never loses the episode's prior handoff state.
      if (input.stage === "create_storyboard_review_project") {
        const { tieInQcEnabled } =
          await resolveVerticalDramaQualityLoopFlags(tenantId);
        await assertTieInQualityGatePassed({
          owner,
          tieInQcEnabled,
          script: stageRow.script as Record<string, unknown> | null,
        });
      }

      // Task #26 — same gate as `runStage`'s, applied here too since
      // `regenerateStage` always runs `plan_episode_script` in real "full"
      // mode. Rejects BEFORE the destructive delete below, so a beyond-plan
      // regenerate attempt never clears the episode's prior downstream
      // content only to fail afterward.
      if (input.stage === "plan_episode_script") {
        await assertEpisodeWithinSeasonPlan(
          tenantId,
          ctx.user.id,
          owner.seriesId,
          stageRow.episodeNumber
        );
      }

      const [
        { flagOn, policy },
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      ] = await Promise.all([
        resolveSubShotPolicy(tenantId, input.subShotPolicy),
        resolveVerticalDramaDeepStoryDraftsFlag(tenantId),
        resolveVerticalDramaTieInReplanFlag(tenantId),
        resolveVerticalDramaRetentionHooksFlag(tenantId),
        resolveVerticalDramaMotionContractsFlag(tenantId),
      ]);
      const stageOpts: RunStageOptions = {
        mode: "full",
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      };

      // Bug #127 (`planning/vd-storyboard-runstage-async-job/plan.md`) —
      // same async treatment as `runStage`'s branch above:
      // `regenerateStage` always runs in real "full" mode, so a
      // `storyboard_shotgrid` regenerate would otherwise ALWAYS hit the same
      // Cloudflare ~100s edge-proxy timeout. Submit + return immediately;
      // the below-floor downstream-invalidation block (gated on a
      // `"succeeded"` outcome, 2026-07-12 data-safety fix) runs from the
      // background job's own success path instead
      // (`clearStoryboardShotgridDownstreamAfterRegenerate`, threaded
      // through as `clearDownstreamOnSuccess`) — see that function's doc
      // comment in `verticalDramaEpisodePipeline.ts`. Every other stage's
      // `regenerateStage` call is untouched, still fully synchronous.
      if (input.stage === "storyboard_shotgrid") {
        return submitStoryboardShotgridAsync(owner, stageOpts, true);
      }

      const outcome = await pipelineForMode("full").runStage(
        owner,
        input.stage,
        stageOpts
      );

      // Data-safety fix (2026-07-12) — the downstream invalidation below used
      // to run BEFORE the `runStage` call above, unconditionally. `runStage`
      // never throws on a generation failure (every real-generation override
      // in this file catches its own errors and returns a normal `"failed"`
      // `RunResult` — see e.g. the `storyboard_shotgrid` override), so the
      // old ordering meant a failed regenerate attempt still destroyed every
      // downstream stage's data (start frame plan, video prompts, etc.) even
      // though the clicked stage's own content was left completely
      // unchanged. Confirmed in production: episode 43's `startFramePlan`/
      // `dialogueAudioPlan`/`motionPromptPack`/`assemblyManifest` columns and
      // their run history were wiped by a `storyboard_shotgrid` regenerate
      // that failed LLM-side schema validation, while `storyboard` itself
      // (correctly) still held the prior, still-valid 9 shots. Gating the
      // invalidation on `outcome.result.status === "succeeded"` makes a
      // failed regenerate a true no-op on every stage's data — matching the
      // safer convention `repairStage`'s pipeline method already uses
      // elsewhere in this file (report `staleStages` without destructively
      // clearing anything).
      if (outcome.result?.status === "succeeded") {
        const stagesToClear = [
          input.stage,
          ...VerticalDramaEpisodePipeline.downstreamStages(input.stage),
        ];
        await db
          .delete(verticalDramaEpisodeRuns)
          .where(
            and(
              eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
              eq(verticalDramaEpisodeRuns.userId, owner.userId),
              eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
              eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
              inArray(verticalDramaEpisodeRuns.stage, stagesToClear)
            )
          );

        // Also null out the downstream stages' own persisted jsonb columns on
        // the episode row — these are separate from the run/checkpoint/
        // artifact tables just deleted above, and were the actual cause of
        // the "says regenerated but still shows the same old data" bug: the
        // UI's storyboard panel (and equivalents) key off THIS column's
        // content directly, regardless of whether a run/checkpoint still
        // backs it. The clicked stage's own column is deliberately left
        // alone — `runStage` above already overwrote it with fresh content.
        const downstreamColumnByStage: Partial<
          Record<
            VerticalDramaPipelineStage,
            keyof typeof verticalDramaEpisodes.$inferInsert
          >
        > = {
          plan_episode_script: "script",
          storyboard_shotgrid: "storyboard",
          start_frame_render_plan: "startFramePlan",
          dialogue_audio_plan: "dialogueAudioPlan",
          video_motion_prompt_pack: "motionPromptPack",
          assemble_episode_manifest: "assemblyManifest",
        };
        const downstream = VerticalDramaEpisodePipeline.downstreamStages(
          input.stage
        );
        const columnUpdates: Record<string, null> = {};
        for (const s of downstream) {
          const col = downstreamColumnByStage[s];
          if (col) columnUpdates[col] = null;
        }
        if (downstream.includes("create_storyboard_review_project")) {
          columnUpdates.storyboardReviewId = null;
        }
        if (Object.keys(columnUpdates).length > 0) {
          await db
            .update(verticalDramaEpisodes)
            .set({ ...columnUpdates, updatedAt: new Date() })
            .where(
              and(
                eq(verticalDramaEpisodes.id, owner.episodeId),
                eq(verticalDramaEpisodes.tenantId, owner.tenantId),
                eq(verticalDramaEpisodes.userId, owner.userId),
                eq(verticalDramaEpisodes.seriesId, owner.seriesId)
              )
            );
        }
      }

      return outcome;
    }),

  /** Run stages sequentially until a gate (approval / failure / end). */
  runEpisode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: runModeEnum.default("dry_run"),
        fromStage: stageEnum.optional(),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      const episodeRow = await loadOwnedEpisode(owner);

      // Task #26 — same gate as `runStage`/`regenerateStage`'s, applied
      // here whenever this real run will actually REACH `plan_episode_
      // script` (i.e. `fromStage` is unset, or at-or-before it in the
      // canonical sequence). Resuming a full run from a LATER stage on an
      // already-scripted episode is never blocked — that episode already
      // has real content, grandfathered exactly like a targeted repair.
      if (!VERTICAL_DRAMA_DRY_RUN_MODES.has(input.mode)) {
        const scriptStageIdx = VERTICAL_DRAMA_PIPELINE_STAGES.indexOf(
          "plan_episode_script"
        );
        const startIdx = input.fromStage
          ? VERTICAL_DRAMA_PIPELINE_STAGES.indexOf(input.fromStage)
          : 0;
        if (startIdx <= scriptStageIdx) {
          await assertEpisodeWithinSeasonPlan(
            tenantId,
            ctx.user.id,
            owner.seriesId,
            episodeRow.episodeNumber
          );
        }
      }

      const [
        { flagOn, policy },
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      ] = await Promise.all([
        resolveSubShotPolicy(tenantId, input.subShotPolicy),
        resolveVerticalDramaDeepStoryDraftsFlag(tenantId),
        resolveVerticalDramaTieInReplanFlag(tenantId),
        // Retention hooks — `runEpisode` shares the SAME `RunStageOptions`
        // bag every per-stage call in this router resolves this flag for
        // (`runStage`/`regenerateStage` above); not one of the 4 call sites
        // explicitly enumerated by the router-wiring plan, but wiring it
        // here too keeps a full sequential episode run consistent with a
        // single-stage run of the exact same stages (otherwise a tenant
        // with the flag on would get retention-hooks guidance one stage at
        // a time but not via "run whole episode").
        resolveVerticalDramaRetentionHooksFlag(tenantId),
        resolveVerticalDramaMotionContractsFlag(tenantId),
      ]);
      return pipelineForMode(input.mode).runEpisode(owner, {
        mode: input.mode as never,
        fromStage: input.fromStage,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
        deepStoryDraftsFlagOn,
        tieInReplanFlagOn,
        retentionHooksEnabled,
        motionContractsEnabled,
      });
    }),

  /**
   * Approve a stage's checkpoint. Approving never mutates the source artifact —
   * it only records the approval and unblocks the paid/next stage.
   */
  approveCheckpoint: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        checkpointId: z.string().min(1),
        decision: z.enum(["approve", "reject"]).default("approve"),
        notes: z.string().max(2000).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const checkpointId = parseId(input.checkpointId, "checkpoint id");

      // Approves/rejects the checkpoint AND patches the run row that
      // produced it (bug fix, 2026-07-05: the run row used to freeze at
      // "approval_required" forever — nothing updated it after approval,
      // so the client kept showing the approval bar with a now-undefined
      // checkpoint id, an infinite no-op loop). Extracted onto the pipeline
      // service so the one-click episode-generate orchestration can reuse
      // the exact same fix instead of duplicating it.
      const outcome = await verticalDramaEpisodePipeline.approveRunCheckpoint(
        { tenantId, userId, seriesId, episodeId },
        checkpointId,
        input.decision,
        input.notes
      );
      if (!outcome)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Checkpoint not found",
        });
      const { checkpoint: row } = outcome;

      // Idempotent: `approveRunCheckpoint` itself short-circuits (no side
      // effects re-run) when the checkpoint is already terminal. The
      // `summarize_episode_to_series_memory` durable memory writes that used
      // to live inline here were moved into
      // `verticalDramaEpisodePipeline.approveRunCheckpoint` (2026-07-07) so
      // BOTH this mutation's legacy pending->approved transition AND the
      // pipeline's new create-time auto-approval apply them from one place,
      // with no double-write (each checkpoint id carries its own
      // idempotency-keyed `appendEvent` calls).

      // Story-density reform (spec §7.7.3, section-13, added 2026-07-07) —
      // deterministic arc-drift check on a GENUINE (never a repeated/
      // idempotent) approval transition of either the episode-script stage
      // checkpoint (covers first-time approval AND re-approval of a
      // repaired/regenerated script — `repairStageOutput` always creates a
      // NEW checkpoint on the SAME stage, approved through this exact
      // mutation) or the pipeline-driven `summarize_episode_to_series_memory`
      // checkpoint transition (the router's OWN separate
      // `summarizeEpisodeToMemory` mutation below has its own hook for the
      // MANUAL trigger path, which is not gated by a checkpoint at all).
      // Flag-gated (`verticalDramaSeriesArcReplan`); `!outcome.alreadyTerminal`
      // mirrors `approveRunCheckpoint`'s own "genuine pending->approved
      // transition only" guard for ITS memory writes, so a repeated/replayed
      // approve call never double-proposes.
      if (
        !outcome.alreadyTerminal &&
        row.state === "approved" &&
        (row.stage === "plan_episode_script" ||
          row.stage === "summarize_episode_to_series_memory")
      ) {
        const { arcReplanEnabled } =
          await resolveVerticalDramaDensityFlags(tenantId);
        if (arcReplanEnabled) {
          const episodeForDrift = await loadOwnedEpisode({
            tenantId,
            userId,
            seriesId,
            episodeId,
          });
          await runArcDriftCheckAndProposeIfNeeded({
            tenantId,
            userId,
            seriesId,
            episodeId,
            episodeNumber: episodeForDrift.episodeNumber,
            script: episodeForDrift.script as Record<string, unknown> | null,
            idempotencyKey: `vd-arc-replan-proposal-checkpoint-${checkpointId}`,
          });
        }
      }

      return { checkpoint: { ...row, id: String(row.id) } };
    }),

  /**
   * Repair a stage output: creates a new artifact/version that supersedes the
   * prior candidate (never overwrites it) and marks downstream stages stale.
   */
  repairStageOutput: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        stage: stageEnum,
        artifactId: z.string().optional(),
        target: z
          .object({
            parentShotNumber: z.number().int().positive().optional(),
            subShotNumber: z.number().int().positive().optional(),
            clipNumber: z.number().int().positive().optional(),
          })
          .optional(),
        instruction: z.string().trim().min(1).max(4000),
        subShotPolicy: subShotPolicyInput,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      // W11.6 "Story Lock" — this manual/spot-repair mutation covers ALL 15
      // pipeline stages (not just the quality-review-driven script/
      // storyboard groups the loop/apply paths repair), so it only gets the
      // PROMPT-level constraint here (task item 2), not the deterministic
      // post-repair guard (task item 3, which is scoped to "the loop AND
      // single apply path" — `applyQualityReviewSuggestions`'s two
      // branches). `appendVerticalDramaStoryLockRepairConstraint` is a no-op
      // for any stage other than `plan_episode_script`/`storyboard_shotgrid`,
      // so this is inert for every other stage regardless of the flag.
      const { storyLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      const retentionHooksEnabled =
        await resolveVerticalDramaRetentionHooksFlag(tenantId);
      const motionContractsEnabled =
        await resolveVerticalDramaMotionContractsFlag(tenantId);
      const instruction = storyLockEnabled
        ? appendVerticalDramaStoryLockRepairConstraint(
            input.instruction,
            input.stage
          )
        : input.instruction;
      const outcome = await verticalDramaEpisodePipeline.repairStage(
        owner,
        input.stage,
        {
          sourceArtifactId: input.artifactId,
          target: input.target,
          instruction,
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
          retentionHooksEnabled,
          motionContractsEnabled,
        }
      );
      return outcome;
    }),

  /** Per-episode run history, most recent first (read-only). */
  listEpisodeRuns: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner: EpisodeRunOwner = {
        tenantId,
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        episodeId: parseId(input.episodeId, "episode id"),
      };
      await loadOwnedEpisode(owner);
      const rows = await verticalDramaEpisodePipeline.listEpisodeRuns(
        owner,
        input.limit ?? 200
      );
      return {
        runs: rows.map((r: (typeof rows)[number]) => ({
          runId: String(r.id),
          stage: r.stage,
          status: r.status,
          mode: r.runMode,
          nextAction: r.nextAction,
          artifactIds: (r.artifactIds as string[] | null) ?? [],
          startedAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt:
            r.status === "succeeded" || r.status === "failed"
              ? r.updatedAt
              : null,
          // Link target to the read-only artifact-ledger detail (section 09).
          artifactLedgerHref: `/drama-series/${owner.seriesId}/episodes/${owner.episodeId}/runs/${r.id}`,
        })),
      };
    }),

  /**
   * Append-only memory events for a series, chronological, filterable by kind
   * (including `retcon_proposal`) and/or episode number (read-only timeline).
   */
  listMemoryEvents: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        kind: z
          .enum(
            VERTICAL_DRAMA_MEMORY_KINDS as unknown as [
              VerticalDramaMemoryKind,
              ...VerticalDramaMemoryKind[],
            ]
          )
          .optional(),
        episodeNumber: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Resolve episodeNumber → episodeId (scoped to the owned series).
      let episodeId: number | undefined;
      if (input.episodeNumber != null) {
        const [ep] = await db
          .select({ id: verticalDramaEpisodes.id })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
              eq(verticalDramaEpisodes.episodeNumber, input.episodeNumber)
            )
          )
          .limit(1);
        episodeId = ep?.id;
        if (episodeId == null) return { events: [] };
      }

      const events = await verticalDramaSeriesMemoryService.listEvents({
        tenantId,
        userId,
        seriesId,
        kind: input.kind,
        episodeId,
        limit: input.limit ?? 500,
      });
      return { events };
    }),

  /**
   * Propose a retcon: appends an append-only `retcon_proposal` memory event
   * carrying the new canonical fact and (optionally) which prior canonical-
   * fact events it would supersede once approved. Wraps
   * `verticalDramaSeriesMemory.ts`'s `proposeRetcon()` — the proposal is
   * inert until a later `approveRetconProposal`/`rejectRetconProposal` call
   * resolves it (never mutates or deletes anything by itself).
   */
  proposeRetcon: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        factSummary: z.string().trim().min(1).max(2000),
        supersedesEventIds: z.array(z.string().min(1)).optional(),
        reason: z.string().trim().max(2000).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);

      // Best-effort lookup of the contradicted fact's text, purely to give
      // the proposal a human-readable `contradictedFact` — not a
      // correctness requirement (supersession is driven by event ids, not
      // this text).
      let contradictedFact = "";
      if (input.supersedesEventIds?.length) {
        const supersededEvents =
          await verticalDramaSeriesMemoryService.listEvents({
            tenantId,
            userId,
            seriesId,
            kind: "canonical_fact",
            limit: 1000,
          });
        contradictedFact = supersededEvents
          .filter(ev => input.supersedesEventIds!.includes(ev.memoryEventId))
          .map(ev => ev.summaryText || String(ev.payload?.fact ?? ""))
          .filter(Boolean)
          .join("; ");
      }

      const event = await verticalDramaSeriesMemoryService.proposeRetcon({
        owner: { tenantId, userId, seriesId },
        contradictedFact,
        proposedFact: input.factSummary,
        rationale: input.reason ?? "",
        supersedesEventIds: input.supersedesEventIds ?? [],
        idempotencyKey: input.idempotencyKey,
      });
      return { event };
    }),

  /**
   * Approve a `retcon_proposal`: appends a NEW superseding memory event, never
   * mutating prior events (append-only chain preserved).
   */
  approveRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event =
        await verticalDramaSeriesMemoryService.approveRetconProposal({
          tenantId,
          userId,
          seriesId,
          proposalEventId: parseId(input.proposalEventId, "proposal event id"),
          actingUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
      return { event };
    }),

  /**
   * Reject a `retcon_proposal`: appends a rejection event, never mutating prior
   * events.
   */
  rejectRetconProposal: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await assertSeriesOwned(tenantId, userId, seriesId);
      const event = await verticalDramaSeriesMemoryService.rejectRetconProposal(
        {
          tenantId,
          userId,
          seriesId,
          proposalEventId: parseId(input.proposalEventId, "proposal event id"),
          actingUserId: userId,
          idempotencyKey: input.idempotencyKey,
        }
      );
      return { event };
    }),

  /** Feature 138 P1 — explicitly author one scene's visual continuity lock. */
  planSceneVisualState: verticalDramaSceneContinuityProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        locationKey: z.string().trim().min(1).max(200),
        force: z.boolean().optional(),
        expectedRevision: z.number().int().min(0),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });
      const locationKey = input.locationKey.trim();
      const facts = resolveSceneMutationFacts(row, locationKey);

      const { readSceneVisualStatesFromPlan } = await import(
        "../services/verticalDramaStartFrameGeneration"
      );
      const currentStates = readSceneVisualStatesFromPlan(facts.plan);
      const currentState = currentStates[locationKey];
      const currentRevision = currentState?.revision ?? 0;
      if (input.expectedRevision !== currentRevision) {
        throwSceneRevisionConflict(input.expectedRevision, currentRevision);
      }
      if (currentState && input.force !== true) {
        return {
          startFramePlan: facts.plan,
          sceneVisualState: currentState,
          planned: false as const,
          skippedReason: currentState.manualEdit === true
            ? ("manual_edit" as const)
            : ("already_planned" as const),
        };
      }

      const [{ buildSceneVisualStateAuthoringInput }, sceneService] = await Promise.all([
        import("../services/verticalDramaSceneContinuityLock"),
        import("../services/verticalDramaSceneVisualState"),
      ]);
      let authoringLocation = facts.location;
      let locationRow: Awaited<
        ReturnType<typeof resolveLocationRosterRowByIdentity>
      > = undefined;
      try {
        const locationIdentity: VerticalDramaLocationIdentity = {
          locationKey,
          name:
            sceneString(facts.location.location_name) ??
            sceneString(facts.location.locationName) ??
            "",
        };
        locationRow = await resolveLocationRosterRowByIdentity(
          tenantId,
          userId,
          seriesId,
          locationIdentity,
        );
        if (locationRow) {
          const rosterData = sceneRecord(locationRow.data);
          authoringLocation = {
            ...facts.location,
            location_name:
              sceneString(facts.location.location_name) ?? locationRow.name,
            description:
              sceneString(facts.location.description) ??
              sceneString(rosterData.description),
          };
        }
      } catch {
        // Text-grounded authoring remains useful when the roster is unavailable.
      }
      let locationImageUrl =
        sceneString(facts.location.location_image_url) ??
        sceneString(facts.location.reference_image_url) ??
        sceneString(facts.location.image_url);
      if (!locationImageUrl && locationRow) {
        try {
          locationImageUrl = await verticalDramaLocationStockService.getPrimaryReferenceUrl(
            { tenantId, userId, seriesId },
            locationRow.id,
          );
        } catch {
          // A text-grounded scene lock remains useful when no image is ready.
        }
      }

      let seriesLook: ReturnType<typeof resolveEffectiveSeriesVisualIdentity>;
      let lang: StoryScriptLang = "th";
      try {
        const [seriesRow] = await db
          .select({ bible: verticalDramaSeries.bible, locale: verticalDramaSeries.locale })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId),
            ),
          )
          .limit(1);
        const flags = await getTenantFeatureFlags(tenantId);
        seriesLook = resolveEffectiveSeriesVisualIdentity({
          bible: seriesRow?.bible,
          presetMixEnabled: flags?.verticalDramaSeriesPresetMixV2 === true,
          lookLockEnabled: flags?.verticalDramaSeriesLookLock === true,
        });
        lang = normalizeVerticalDramaSeriesLocale(seriesRow?.locale);
      } catch {
        seriesLook = undefined;
      }

      let authored: Awaited<ReturnType<typeof sceneService.generateSceneVisualState>>;
      try {
        authored = await sceneService.generateSceneVisualState(
          buildSceneVisualStateAuthoringInput({
            userId,
            tenantId,
            seriesId,
            episodeId,
            group: facts.group,
            location: authoringLocation,
            shots: facts.shots,
            ...(locationImageUrl ? { locationImageUrl } : {}),
            membershipHash: facts.membershipHash,
            revision: (currentState?.revision ?? 0) + 1,
            seriesLook,
            lang,
            idempotencyKey: input.idempotencyKey
              ? `${input.idempotencyKey}:scene-visual-state:${locationKey}`
              : undefined,
          }),
        );
      } catch (error) {
        mapSceneVisualStateAuthoringError(error, sceneService);
      }

      const persisted = await db.transaction(async tx => {
        const [lockedRow] = await tx
          .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          )
          .for("update")
          .limit(1);
        const freshPlan = lockedRow?.startFramePlan as VerticalDramaStartFramePlan | null;
        if (!freshPlan || !Array.isArray(freshPlan.frames)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No start-frame plan exists yet for this episode",
          });
        }
        const current = readSceneVisualStatesFromPlan(freshPlan);
        const concurrent = current[locationKey];
        const freshRevision = concurrent?.revision ?? 0;
        if (input.expectedRevision !== freshRevision) {
          throwSceneRevisionConflict(input.expectedRevision, freshRevision);
        }
        if (concurrent && input.force !== true) {
          return {
            startFramePlan: freshPlan,
            sceneVisualState: concurrent,
            planned: false as const,
            skippedReason: concurrent.manualEdit === true
              ? ("manual_edit" as const)
              : ("already_planned" as const),
          };
        }
        const { upsertSceneVisualState } = await import(
          "../services/verticalDramaStartFrameGeneration"
        );
        const nextState: VdSceneVisualState = {
          ...authored.state,
          locationKey,
          memberShotNumbers: facts.group.shotNumbers,
          revision: authored.state.revision ?? (concurrent?.revision ?? 1),
          stale: undefined,
          manualEdit: undefined,
        };
        const merged = upsertSceneVisualState({
          current,
          next: nextState,
          origin: "planned",
          force: input.force,
        });
        if (!merged.written) {
          return {
            startFramePlan: freshPlan,
            sceneVisualState: current[locationKey] ?? authored.state,
            planned: false as const,
            skippedReason: merged.skippedReason === "manual_edit_protected"
              ? ("manual_edit" as const)
              : ("already_planned" as const),
          };
        }
        const updatedPlan: VerticalDramaStartFramePlan = {
          ...freshPlan,
          sceneVisualStates: merged.states,
        };
        const [updatedRow] = await tx
          .update(verticalDramaEpisodes)
          .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          )
          .returning({ startFramePlan: verticalDramaEpisodes.startFramePlan });
        return {
          startFramePlan: (updatedRow?.startFramePlan as VerticalDramaStartFramePlan | null) ?? updatedPlan,
          sceneVisualState: merged.states[locationKey]!,
          planned: true as const,
          creditsUsed: authored.creditsUsed,
        };
      });

      auditLogger.log({
        eventType: "vd_scene_state_planned",
        userId,
        tenantId,
        metadata: {
          locationKey,
          episodeId,
          planned: persisted.planned,
          force: input.force === true,
          creditsUsed: persisted.creditsUsed ?? 0,
        },
      });
      return persisted;
    }),

  /** Feature 138 P1 — zero-cost manual Scene Visual State edit. */
  updateSceneVisualState: verticalDramaSceneContinuityProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        locationKey: z.string().trim().min(1).max(200),
        expectedRevision: z.number().int().min(0),
        patch: sceneVisualStatePatchSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });
      const locationKey = input.locationKey.trim();
      const facts = resolveSceneMutationFacts(row, locationKey);
      const { readSceneVisualStatesFromPlan, upsertSceneVisualState } = await import(
        "../services/verticalDramaStartFrameGeneration"
      );

      return db.transaction(async tx => {
        const [lockedRow] = await tx
          .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          )
          .for("update")
          .limit(1);
        const freshPlan = lockedRow?.startFramePlan as VerticalDramaStartFramePlan | null;
        if (!freshPlan || !Array.isArray(freshPlan.frames)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No start-frame plan exists yet for this episode",
          });
        }
        const current = readSceneVisualStatesFromPlan(freshPlan);
        const existing = current[locationKey];
        const currentRevision = existing?.revision ?? 0;
        if (input.expectedRevision !== currentRevision) {
          throwSceneRevisionConflict(input.expectedRevision, currentRevision);
        }
        const now = new Date().toISOString();
        const nextState: VdSceneVisualState = {
          locationKey,
          membershipHash: facts.membershipHash,
          revision: currentRevision + 1,
          lightingState: existing?.lightingState ?? "",
          fixedElements: existing?.fixedElements ?? [],
          spatialLayout: existing?.spatialLayout ?? "",
          stagingAxis: existing?.stagingAxis ?? "",
          wardrobeInScene: existing?.wardrobeInScene ?? [],
          activeProps: existing?.activeProps ?? [],
          paletteMood: existing?.paletteMood ?? "",
          timeJumpSuspected: existing?.timeJumpSuspected ?? false,
          coverageGaps: existing?.coverageGaps ?? [],
          memberShotNumbers: facts.group.shotNumbers,
          plannedAt: existing?.plannedAt ?? now,
          ...(existing?.skillVersion ? { skillVersion: existing.skillVersion } : {}),
          ...(input.patch as Partial<VdSceneVisualState>),
          stale: undefined,
          manualEdit: true,
        };
        const merged = upsertSceneVisualState({
          current,
          next: nextState,
          origin: "manual",
        });
        const updatedPlan: VerticalDramaStartFramePlan = {
          ...freshPlan,
          sceneVisualStates: merged.states,
        };
        const [updatedRow] = await tx
          .update(verticalDramaEpisodes)
          .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId),
            ),
          )
          .returning({ startFramePlan: verticalDramaEpisodes.startFramePlan });
        const persistedPlan =
          (updatedRow?.startFramePlan as VerticalDramaStartFramePlan | null) ?? updatedPlan;
        return {
          startFramePlan: persistedPlan,
          sceneVisualState: merged.states[locationKey]!,
        };
      });
    }),

  /**
   * Read-only per-episode detail projection for stage-detail views that need
   * a persisted jsonb field directly (e.g. the dialogue/audio plan review
   * panel) rather than only the mutation response that produced it.
   */
  getEpisodeDetail: verticalDramaProcedure
    .input(
      z.object({ seriesId: z.string().min(1), episodeId: z.string().min(1) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);

      // `planning/vd-remotion-render-option/plan.md` wave 1 — reconcile an
      // in-flight Remotion sub-episode render (`assembleEpisodeVideo`'s
      // `renderEngine: "remotion_queue"` opt-in) the SAME way the client
      // already polls this query while `compiledVideo.status === "pending"`.
      // No-op for every pre-existing render (ffmpeg path, or no compiled
      // video state at all). On reconcile, re-reads `assemblyManifest` so
      // this response reflects the just-written completed/failed state
      // immediately, without waiting for a second poll.
      {
        const compiledVideoState = (
          row.assemblyManifest as { compiledVideo?: CompiledVideoState } | null
        )?.compiledVideo;
        // A pending ffmpeg assembly was NEVER reconciled: this block only ran
        // for `remotion_queue`. Combined with the ffmpeg queue having no
        // consumer at all (see the `vd_assembly_remotion_failed_and_no_ffmpeg_worker`
        // guard in `assembleEpisodeVideo`), a fallback render sat on
        // "กำลังประกอบวิดีโอรวม…" forever — the job had already FAILED and the
        // user could not even start a new one. Resolve it from the worker job's
        // own terminal state (field report 2026-07-31).
        if (
          compiledVideoState?.status === "pending" &&
          compiledVideoState.renderEngine !== "remotion_queue" &&
          compiledVideoState.pendingJobId
        ) {
          const [ffmpegJob] = await db
            .select({
              status: workerJobs.status,
              failureReason: workerJobs.failureReason,
            })
            .from(workerJobs)
            .where(eq(workerJobs.id, compiledVideoState.pendingJobId))
            .limit(1);
          const terminalFailure =
            !ffmpegJob ||
            ffmpegJob.status === "failed" ||
            ffmpegJob.status === "cancelled";
          if (terminalFailure) {
            const reason = !ffmpegJob
              ? "งานเรนเดอร์หายไปจากคิว (อาจถูกล้างหรือหมดอายุ)"
              : (ffmpegJob.failureReason ??
                "ตัวประกอบวิดีโอ (ffmpeg) รายงานว่างานล้มเหลว");
            const nextManifest = {
              ...((row.assemblyManifest as Record<string, unknown> | null) ?? {}),
              compiledVideo: {
                ...compiledVideoState,
                status: "failed" as const,
                error: reason,
              },
            };
            await db
              .update(verticalDramaEpisodes)
              .set({ assemblyManifest: nextManifest, updatedAt: new Date() })
              .where(
                and(
                  eq(verticalDramaEpisodes.id, episodeId),
                  eq(verticalDramaEpisodes.tenantId, tenantId),
                  eq(verticalDramaEpisodes.userId, userId),
                  eq(verticalDramaEpisodes.seriesId, seriesId)
                )
              );
            row.assemblyManifest = nextManifest as typeof row.assemblyManifest;
          }
        }
        if (
          compiledVideoState?.status === "pending" &&
          compiledVideoState.renderEngine === "remotion_queue" &&
          compiledVideoState.pendingJobId
        ) {
          const { reconcileVdRemotionAssembly } = await import(
            "../services/verticalDramaRemotionRender"
          );
          const result = await reconcileVdRemotionAssembly(
            owner,
            compiledVideoState.pendingJobId,
            compiledVideoState.renderSubmittedAt
          ).catch(() => ({ reconciled: false as const }));
          if (result.reconciled) {
            const [fresh] = await db
              .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
              .from(verticalDramaEpisodes)
              .where(
                and(
                  eq(verticalDramaEpisodes.id, episodeId),
                  eq(verticalDramaEpisodes.tenantId, tenantId),
                  eq(verticalDramaEpisodes.userId, userId),
                  eq(verticalDramaEpisodes.seriesId, seriesId)
                )
              )
              .limit(1);
            if (fresh) row.assemblyManifest = fresh.assemblyManifest;
          }
        }
      }

      const [assetUrls, characterPortraits, qualityReview] = await Promise.all([
        resolveEpisodePlanAssetUrls(
          tenantId,
          userId,
          row.startFramePlan,
          row.motionPromptPack
        ),
        resolveSeriesCharacterPortraits(tenantId, userId, seriesId),
        loadLatestQualityReview(owner),
      ]);

      // Wave-4A (spec §16.1/§13.1/§7.7.3/§8.8) — additive, flag-gated keys.
      // Every new key is `null`/absent-equivalent when its flag is off, so
      // this never changes the shape of the fields already returned above.
      const [
        { speechBudgetEnabled, arcReplanEnabled, sceneContinuityEnabled },
        qualityLoopFlags,
        deepStoryDraftsEnabled,
        voiceChainEnabled,
        adBannerOverlayEnabled,
        textOverlaySuiteEnabled,
      ] = await Promise.all([
        resolveVerticalDramaDensityFlags(tenantId),
        resolveVerticalDramaQualityLoopFlags(tenantId),
        resolveVerticalDramaDeepStoryDraftsFlag(tenantId),
        // debt-item-1 (2026-07-08) — same "one flag per query, additive
        // null/false-when-off key" convention as the siblings above. The
        // client previously read `verticalDramaSeriesVoiceChain` directly via
        // `useTenantFeatureFlag` in `VerticalDramaEpisodePage.tsx`; now it can
        // prefer this server-resolved value instead (see that page's
        // `voiceChainFlagEnabled`).
        resolveVerticalDramaVoiceChainFlag(tenantId),
        // F131W (#30-A2) — same convention, gates `adBannerPlan`/
        // `adBannerDesignsSummary` below.
        resolveVerticalDramaAdBannerOverlayFlag(tenantId),
        // F131AB (task #34) — same convention, gates `textOverlayPlan`/
        // `textOverlayPreview` below.
        resolveVerticalDramaTextOverlaySuiteFlag(tenantId),
      ]);
      const {
        qualityLoopV2Enabled,
        tieInQcEnabled,
        productionWizardEnabled,
        presetMixV2Enabled,
      } = qualityLoopFlags;
      // Deep story drafts (W10-B) — `null` when the flag itself is off
      // (matches `wizard`'s own null-when-flag-off convention below); `true`/
      // `false` when on, depending on whether the episode's active breakdown
      // item actually carries a vetted W10-A draft.
      const episodeDraftAvailable = deepStoryDraftsEnabled
        ? await resolveEpisodeDraftAvailable(
            tenantId,
            userId,
            seriesId,
            row.episodeNumber
          )
        : null;

      // Ad Banner Overlay (F131W, #30-A2) — `null`/`[]` when the flag is off
      // (matches every sibling Wave-4A field's own convention above). A
      // SEPARATE series-row read from `productionWizardEnabled`'s tie-in row
      // load a few lines below (rather than sharing it) — the two flags are
      // independent and this keeps each addition's own db.select count
      // orthogonal to the OTHER flag's on/off state, matching how every
      // other flag-gated block in this query already resolves its own data
      // independently (`arcReplanEnabled` alone drives two separate reads,
      // for example).
      let adBannerPlan: VdEpisodeAdBannerPlan | null = null;
      let adBannerDesignsSummary: VdEpisodeAdBannerDesignSummary[] = [];
      if (adBannerOverlayEnabled) {
        adBannerPlan = parseEpisodeAdBannerPlan(row.adBannerPlan);
        const { rawProductTieIn, designs } = await loadSeriesAdBannerContext(
          tenantId,
          userId,
          seriesId
        );
        const productContext = readAdBannerProductContext(rawProductTieIn);
        const { resolveAdBannerApprovalGate } =
          await import("../services/verticalDramaAdBanner");
        const isRegulatedGate = resolveAdBannerApprovalGate(
          productContext.regulatedCategory,
          productContext.requireHumanApproval
        );
        adBannerDesignsSummary = buildAdBannerDesignsSummary(
          designs,
          isRegulatedGate
        );
      }

      // Text Overlay Suite (F131AB, task #34) — `null` when the flag is off
      // (matches every sibling Wave-4A/F131W field's own convention above);
      // gated behind `if (textOverlaySuiteEnabled)` so the flag-off case adds
      // ZERO additional `db.select` calls (same discipline the ad-banner
      // block above already established — this query's own test suite
      // hard-asserts exact select counts for the flag-off case).
      let textOverlayPlan: VdTextOverlayPlan | null = null;
      let textOverlayPreview: VdEpisodeTextOverlayPreview | null = null;
      if (textOverlaySuiteEnabled) {
        textOverlayPlan = parseTextOverlayPlan(row.textOverlayPlan);
        textOverlayPreview = await buildEpisodeTextOverlayPreview({
          tenantId,
          userId,
          seriesId,
          episodeNumber: row.episodeNumber,
          episodeTitle: row.title,
          plan: textOverlayPlan,
          startFramePlan: row.startFramePlan as VerticalDramaStartFramePlan | null,
        });
      }

      const needsPolicy = qualityLoopV2Enabled || productionWizardEnabled;
      const [
        qualityPolicyResolved,
        latestQualityLoopState,
        tieInQualityReport,
        arcReplanPendingCount,
        seasonTieInPlacement,
      ] = await Promise.all([
        needsPolicy
          ? loadVerticalDramaQualityPolicy(tenantId, userId, seriesId)
          : Promise.resolve(null),
        qualityLoopV2Enabled
          ? loadLatestQualityLoopState(owner)
          : Promise.resolve(null),
        tieInQcEnabled
          ? loadLatestTieInQualityReport(owner)
          : Promise.resolve(null),
        arcReplanEnabled
          ? countPendingArcReplanProposals(tenantId, userId, seriesId)
          : Promise.resolve(0),
        // Task #31 (spec §7.7.2/§7.7.3) — Wizard/`VerticalDramaTieInReportCard`
        // status-line source. Reuses the ALREADY-registered
        // `verticalDramaSeriesArcReplan` flag as its gate (not a separate
        // F131Y check): season-plan tie-in info is only actionable once
        // arc-replan proposals themselves are — see
        // `resolveSeasonTieInPlacementForEpisode`'s doc comment.
        arcReplanEnabled
          ? resolveSeasonTieInPlacementForEpisode(
              tenantId,
              userId,
              seriesId,
              row.episodeNumber
            )
          : Promise.resolve(null),
      ]);

      let wizard:
        | import("@shared/verticalDramaSeries/productionWizard").VerticalDramaProductionWizardState
        | { wizardSnapshot: DeriveVerticalDramaProductionWizardStateInput }
        | null = null;
      // 2026-07-08/W9-A (spec §14.1 rule 6b, section-12 "Pass Semantics") —
      // compact per-shot dialogue viewer payload, computed alongside the
      // wizard (never independently — see `resolveWizardPerShotDialogue`'s
      // doc comment for why it is resolved ONCE and shared with
      // `buildProductionWizardInput`'s `script.perShotCompleteness`).
      let perShotDialoguePreview: ReturnType<
        typeof buildPerShotDialoguePreview
      > = null;
      if (productionWizardEnabled) {
        const [tieInSeriesRow] = await db
          .select({
            productTieIn: verticalDramaSeries.productTieIn,
            locale: verticalDramaSeries.locale,
          })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          )
          .limit(1);
        const seriesTieInEnabled =
          (
            tieInSeriesRow?.productTieIn as VerticalDramaProductTieInConfig | null
          )?.enabled === true;

        // 2026-07-08/W9-A — resolved ONCE (no new DB round-trip: script/
        // storyboard/dialogueAudioPlan/motionPromptPack are already loaded
        // on `row`), then shared by BOTH the wizard input below and the
        // `perShotDialoguePreview` response field.
        const wizardShotDialogue = resolveWizardPerShotDialogue(
          row.script as Record<string, unknown> | null,
          row.storyboard as Record<string, unknown> | null,
          row.dialogueAudioPlan as Record<string, unknown> | null,
          row.motionPromptPack as VerticalDramaMotionPromptPack | null
        );
        perShotDialoguePreview =
          buildPerShotDialoguePreview(wizardShotDialogue);

        // debt-item-4 (2026-07-08) — see `resolveVideoPromptsStale`'s doc
        // comment. Only queried once a motion-prompt-pack artifact actually
        // exists (nothing to be stale relative to otherwise) — keeps every
        // pre-existing `motionPromptPack: null` test scenario's db.select
        // count unchanged.
        const videoPromptsStale = row.motionPromptPack
          ? await resolveVideoPromptsStale(owner)
          : false;

        const wizardInput = await buildProductionWizardInput({
          script: row.script as Record<string, unknown> | null,
          storyboard: row.storyboard as Record<string, unknown> | null,
          startFramePlan:
            row.startFramePlan as VerticalDramaStartFramePlan | null,
          dialogueAudioPlan: row.dialogueAudioPlan as Record<
            string,
            unknown
          > | null,
          motionPromptPack:
            row.motionPromptPack as VerticalDramaMotionPromptPack | null,
          assemblyManifest: row.assemblyManifest as Record<
            string,
            unknown
          > | null,
          perShotDialogue: wizardShotDialogue,
          targetDurationSeconds: row.targetDurationSeconds ?? 60,
          locale: normalizeVerticalDramaSeriesLocale(tieInSeriesRow?.locale),
          policy:
            qualityPolicyResolved ??
            (await loadVerticalDramaQualityPolicy(tenantId, userId, seriesId)),
          latestReview: qualityReview,
          latestQualityLoopState,
          tieInReport: tieInQualityReport,
          seriesTieInEnabled,
          arcReplanPending: arcReplanPendingCount > 0,
          videoPromptsStale,
          flags: {
            speechBudgetEnabled,
            arcReplanEnabled,
            qualityLoopV2Enabled,
            tieInQcEnabled,
            productionWizardEnabled,
          },
        });

        // Dynamic import — see this file's `DeriveVerticalDramaProductionWizardStateInput`
        // type-import doc comment above for why the VALUE is loaded lazily.
        const { deriveVerticalDramaProductionWizardState } =
          await import("@shared/verticalDramaSeries/productionWizard");
        wizard = deriveVerticalDramaProductionWizardState(wizardInput);
      }

      // Part A1 (planning/`polished-toasting-gadget.md`) — read-only episode
      // plan (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง), unconditional (no
      // feature-flag gate — pure reference data). Resolved as the LAST query
      // of this procedure (not folded into the first `Promise.all` above) so
      // it never shifts the `db.select` call ORDER/POSITION every other
      // field in this large procedure already depends on — several
      // pre-existing test suites for this procedure assert exact
      // `mockDb.select` call sequences/counts.
      const episodePlan = await resolveEpisodePlanForEpisode(
        tenantId,
        userId,
        seriesId,
        row.episodeNumber
      );

      // Phase D (planning/polished-toasting-gadget.md — location visual
      // bible) — the series' full location roster, resolved as the NEXT
      // query after `episodePlan` (same "unconditional, last-position"
      // call-order-stability reasoning as `episodePlan` immediately above —
      // this NEVER shifts any earlier query's position, so it only requires
      // updating pre-existing tests that assert an EXACT `mockDb.select`
      // call count, never tests that only assert on earlier fields).
      const episodeLocations = await resolveSeriesEpisodeLocations(
        tenantId,
        userId,
        seriesId
      );

      return {
        script: row.script as Record<string, unknown> | null,
        dialogueAudioPlan: row.dialogueAudioPlan as Record<
          string,
          unknown
        > | null,
        storyboard: row.storyboard as Record<string, unknown> | null,
        storyboardReviewId: row.storyboardReviewId as string | null,
        startFramePlan:
          row.startFramePlan as VerticalDramaStartFramePlan | null,
        motionPromptPack:
          row.motionPromptPack as VerticalDramaMotionPromptPack | null,
        assemblyManifest: row.assemblyManifest as Record<
          string,
          unknown
        > | null,
        artifactProvenance: {
          startFramePlan: storyboardArtifactStatus(row.startFramePlan, row.storyboard),
          motionPromptPack: storyboardArtifactStatus(row.motionPromptPack, row.storyboard),
          assemblyManifest: storyboardArtifactStatus(row.assemblyManifest, row.storyboard),
        },
        qualityReview,
        assetUrls,
        // Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
        // plan.md`) — resolved `{ mediaAssetId, url }[]` per shot number for
        // each frame's persisted `angleGridAssetIds` (backup alternate-angle
        // stills recorded via `recordShotAngleGridAsset`). `{}` for an
        // episode with no shot carrying any recorded angle-grid assets yet
        // (grandfathered — every frame predating this field is simply
        // absent as a key). See `buildAngleGridAssetsByShotNumber`'s doc
        // comment for why this reuses `assetUrls`'s existing batch query
        // instead of a new one.
        angleGridAssetsByShotNumber: buildAngleGridAssetsByShotNumber(
          row.startFramePlan as VerticalDramaStartFramePlan | null,
          assetUrls
        ),
        characterPortraits,
        // Part A1 (planning/`polished-toasting-gadget.md`) — read-only
        // episode plan for the new plan panel; `null` when the series bible
        // has no matching drafted breakdown item for this episode yet.
        episodePlan,
        // Phase D (planning/polished-toasting-gadget.md — location visual
        // bible) — the series' full location roster (see
        // `resolveSeriesEpisodeLocations`'s doc comment for the exact shape/
        // contract); `[]` for a series with no locations yet, never `null`.
        episodeLocations,
        // Wave-4A additive keys (spec §16.1/§13.1/§7.7.3/§8.8) — flag-gated,
        // `null`/`0` when the corresponding flag is off.
        qualityPolicyResolved,
        latestQualityLoopState,
        tieInQualityReport,
        arcReplanPendingCount,
        // Task #31 (spec §7.7.2/§7.7.3) — `null` when `verticalDramaSeriesArcReplan`
        // is off, or the active breakdown has no `tieIn` field for this
        // episode yet (grandfather). See `resolveSeasonTieInPlacementForEpisode`.
        seasonTieInPlacement,
        wizard,
        // 2026-07-08/W9-A (spec §14.1 rule 6b, section-12 "Pass Semantics")
        // — `null` when the wizard itself is off/unavailable (matches
        // `wizard`'s own null-when-flag-off convention).
        perShotDialoguePreview,
        // Deep story drafts (W10-B) — additive; `null` when
        // `verticalDramaSeriesDeepStoryDrafts` is off, else `true`/`false`.
        // See `resolveEpisodeDraftAvailable` above.
        episodeDraftAvailable,
        // Ad Banner Overlay (F131W, #30-A2) — `null`/`[]` when
        // `verticalDramaSeriesAdBannerOverlay` is off. See the block above.
        adBannerPlan,
        adBannerDesignsSummary,
        // Text Overlay Suite (F131AB, task #34) — `null` when
        // `verticalDramaSeriesTextOverlaySuite` is off. See the block above.
        textOverlayPlan,
        textOverlayPreview,
        flags: {
          speechBudget: speechBudgetEnabled,
          arcReplan: arcReplanEnabled,
          qualityLoopV2: qualityLoopV2Enabled,
          tieInQc: tieInQcEnabled,
          productionWizard: productionWizardEnabled,
          presetMixV2: presetMixV2Enabled,
          deepStoryDrafts: deepStoryDraftsEnabled,
          // debt-item-1 (2026-07-08) — mirrors `resolveVerticalDramaVoiceChainFlag`
          // exactly (same tenant flag `assembleEpisodeVideo` already gates on).
          voiceChain: voiceChainEnabled,
          // F131W (#30-A2) — mirrors `resolveVerticalDramaAdBannerOverlayFlag`
          // exactly.
          adBannerOverlay: adBannerOverlayEnabled,
          // F131AB (task #34) — mirrors `resolveVerticalDramaTextOverlaySuiteFlag`
          // exactly.
          textOverlaySuite: textOverlaySuiteEnabled,
          sceneContinuity: sceneContinuityEnabled,
        },
      };
    }),

  /**
   * Ad Banner Overlay (F131W, #30-A2, plan.md §2 "ชั้นการใช้") — save this
   * episode's SELECTION of the series' ready banner designs (which appear in
   * this episode's video, with optional per-selection timing overrides).
   * Brand-new mutation, so gated at the TOP of the handler via the local
   * tenant-flag resolver (mirrors `resolveVerticalDramaAdBannerOverlayFlag`'s
   * own doc comment on why this is a resolver call rather than a chained
   * `requireFeatureFlag` procedure here) — flags-off throws FORBIDDEN before
   * any DB read.
   */
  updateEpisodeAdBannerPlan: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        plan: vdEpisodeAdBannerPlanSchema,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");

      const adBannerOverlayEnabled =
        await resolveVerticalDramaAdBannerOverlayFlag(tenantId);
      if (!adBannerOverlayEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature 'verticalDramaSeriesAdBannerOverlay' is not enabled for this tenant",
        });
      }

      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      await loadOwnedEpisode(owner);

      const { designs } = await loadSeriesAdBannerContext(
        tenantId,
        userId,
        seriesId
      );
      const blockingIssue = validateEpisodeAdBannerPlan(
        input.plan,
        designs
      ).find(issue => issue.severity === "error");
      if (blockingIssue) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${blockingIssue.code}: ${blockingIssue.message}`,
        });
      }

      await db
        .update(verticalDramaEpisodes)
        .set({ adBannerPlan: input.plan, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        );

      return { plan: input.plan };
    }),

  /**
   * Text Overlay Suite (F131AB, task #34, plan.md v2) — save this episode's
   * text-overlay plan (end card / opener recap / title bumper / episode
   * indicator / character intro cards / mid-episode cards). Brand-new
   * mutation, so gated at the TOP of the handler via the local tenant-flag
   * resolver (mirrors `updateEpisodeAdBannerPlan`'s own doc comment on why
   * this is a resolver call rather than a chained `requireFeatureFlag`
   * procedure here) — flags-off throws FORBIDDEN before any DB read.
   * Duration-bound validation ERRORS block the save (BAD_REQUEST);
   * concurrency/fullscreen-overlap WARNINGS are returned alongside the saved
   * plan so the client can surface them without blocking (plan.md "กติกากัน
   * ชนกันเอง (deterministic validation → warning ไม่ block)").
   */
  updateEpisodeTextOverlayPlan: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        plan: vdTextOverlayPlanSchema,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");

      const textOverlaySuiteEnabled =
        await resolveVerticalDramaTextOverlaySuiteFlag(tenantId);
      if (!textOverlaySuiteEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature 'verticalDramaSeriesTextOverlaySuite' is not enabled for this tenant",
        });
      }

      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);

      const issues = validateTextOverlayPlan(input.plan, {
        estimatedVideoDurationSeconds: row.targetDurationSeconds,
      });
      const blockingIssue = issues.find(issue => issue.severity === "error");
      if (blockingIssue) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${blockingIssue.code}: ${blockingIssue.message}`,
        });
      }

      await db
        .update(verticalDramaEpisodes)
        .set({ textOverlayPlan: input.plan, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        );

      return {
        plan: input.plan,
        warnings: issues.filter(issue => issue.severity === "warning"),
      };
    }),

  /**
   * Task #26 (data sanity — episode number beyond the planned season size)
   * — lightweight, STANDALONE query so the client can show a warning
   * banner without widening `getEpisodeDetail`'s response shape. Kept
   * deliberately separate from that procedure: `getEpisodeDetail` already
   * has ~20+ existing test call sites across this router's test suite that
   * hard-assert its exact unconditional `db.select` call count/sequence
   * (some via `toHaveBeenCalledTimes`); adding one more unconditional read
   * there for an unrelated concern would require rewriting every one of
   * them. See `resolveEpisodeBreakdownStatus`'s doc comment for the exact
   * resolution rule (union of the active + legacy breakdown sources;
   * `"no_plan"` grandfathered for a series with no breakdown at all).
   */
  getEpisodeBreakdownStatus: verticalDramaProcedure
    .input(
      z.object({ seriesId: z.string().min(1), episodeId: z.string().min(1) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);
      const { status, plannedCount } = await resolveEpisodeBreakdownStatus(
        tenantId,
        userId,
        seriesId,
        row.episodeNumber
      );
      return { breakdownStatus: status, plannedEpisodeCount: plannedCount };
    }),

  /**
   * Directly set the approved start-frame asset for one shot — a no-cost,
   * deterministic swap (picking an existing Media History/Library image),
   * distinct from `repairStageOutput`'s LLM-driven regeneration. Patches
   * only the matching entry in `startFramePlan.frames[]`.
   */
  setApprovedStartFrameAsset: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        mediaAssetId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const numericAssetId = Number(input.mediaAssetId);
      if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid media asset id",
        });
      }
      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, numericAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, userId)
          )
        )
        .limit(1);
      if (!asset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media asset not found",
        });
      }

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (!plan || !Array.isArray(plan.frames)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No start-frame plan exists yet for this episode",
        });
      }
      const frameIndex = plan.frames.findIndex(
        f => f.shotNumber === input.shotNumber
      );
      if (frameIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No start-frame plan entry for shot ${input.shotNumber}`,
        });
      }
      // Previous main image, before the swap — used below to auto-demote it
      // into the reference strip (main-image-swap-history upgrade). Read
      // BEFORE `updatedFrames` overwrites it.
      const previousAssetIdRaw = plan.frames[frameIndex]?.approvedMediaAssetId;
      const previousAssetId =
        previousAssetIdRaw != null &&
        Number.isInteger(Number(previousAssetIdRaw))
          ? Number(previousAssetIdRaw)
          : null;

      const updatedFrames = plan.frames.slice();
      updatedFrames[frameIndex] = {
        ...updatedFrames[frameIndex],
        approvedMediaAssetId: input.mediaAssetId,
      };
      const updatedPlan: VerticalDramaStartFramePlan = {
        ...plan,
        frames: updatedFrames,
      };

      await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodes.id, episodeId));

      // Main-image-swap-history upgrade: every swap path (generation,
      // angle-variation pick, drag-drop, repair-accept, Media History/Library
      // picker) funnels through this single mutation, so doing the
      // demotion/promotion-dedup here covers all of them at once.
      //
      // 1. Demote the OLD main image into the shot's reference strip (so it
      //    isn't lost) — skipped when there was no previous asset, or the
      //    asset didn't actually change (no-op swap).
      if (previousAssetId && previousAssetId !== numericAssetId) {
        try {
          await verticalDramaShotReferencesService.linkReference({
            tenantId,
            userId,
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            mediaAssetId: previousAssetId,
            role: "reference",
            source: "previous_main",
          });
        } catch (err) {
          // Never fail the swap itself over a best-effort history link (e.g.
          // the previous asset was hard-deleted between requests) — mirrors
          // this procedure's existing tolerance for missing assetUrls.
          if (!(err instanceof VerticalDramaShotReferenceError)) throw err;
        }
      }
      // 2. If the NEW main image was already sitting in the reference strip,
      //    remove that row — it's being promoted to the main image slot, so
      //    leaving it in the strip would show it twice.
      if (previousAssetId !== numericAssetId) {
        await verticalDramaShotReferencesService.unlinkReferenceByAsset(
          { tenantId, userId, seriesId },
          episodeId,
          input.shotNumber,
          numericAssetId
        );
      }

      const assetUrls = await resolveEpisodePlanAssetUrls(
        tenantId,
        userId,
        updatedPlan,
        row.motionPromptPack
      );
      return { startFramePlan: updatedPlan, assetUrls };
    }),

  /**
   * Reference-mapping fix Phase 5d (`planning/vd-start-frame-reference-
   * mapping/plan.md`) — persist a durable "backup alternate-angle still" for
   * one shot, sourced from an already-completed media task (typically one
   * tile of the existing `generateStartFrameAngleVariations` 3x3 grid, or any
   * other approved Media History/Library image the user picks). This is the
   * asset SOURCE the reshoot/repair research finding (c) in this plan's
   * Phase 5 identified: a drifted shot's start frame can be regenerated from
   * a stored alternate angle instead of a brand-new render. A pure,
   * no-cost, no-LLM data patch — same "verify ownership, find-or-reject the
   * matching frame, patch one field, write the whole jsonb column back"
   * convention as `setApprovedStartFrameAsset` immediately above (id
   * parsing, `mediaAssets` ownership check, and "no plan yet" /
   * "no frame entry" error handling are all reused verbatim from that
   * mutation).
   *
   * Additive-only append: `frame.angleGridAssetIds` grows by one call at a
   * time (never a full-array replacement, unlike `setShotCharacterReference`/
   * `setShotLocation`), deduplicated (re-recording an asset already present
   * moves it to the MOST-RECENT position instead of creating a duplicate
   * entry) and capped at the 5 most recent entries — the OLDEST is dropped
   * once a 6th is recorded, so this can be called an unbounded number of
   * times across a shot's lifetime (e.g. once per multi-angle grid render)
   * without the jsonb column growing unbounded.
   */
  recordShotAngleGridAsset: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        mediaAssetId: z.string().min(1),
        // Accepted for API-shape consistency with this router's other
        // client-mutation calls; this is a free, no-credit, purely additive
        // data patch (idempotent by construction via the dedupe-then-append
        // logic below), so — unlike the paid `generateVideoClip`/
        // `generateStartFrameImage` mutations — nothing here actually reads
        // it.
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const numericAssetId = Number(input.mediaAssetId);
      if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid media asset id",
        });
      }
      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, numericAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, userId)
          )
        )
        .limit(1);
      if (!asset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media asset not found",
        });
      }

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (!plan || !Array.isArray(plan.frames)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No start-frame plan exists yet for this episode",
        });
      }
      const frameIndex = plan.frames.findIndex(
        f => f.shotNumber === input.shotNumber
      );
      if (frameIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No start-frame plan entry for shot ${input.shotNumber}`,
        });
      }

      // Dedupe (re-recording an already-present id promotes it to
      // most-recent instead of duplicating), append, then cap at the 5 MOST
      // RECENT entries — `.slice(-5)` keeps the tail (newest) and drops the
      // oldest once the list would exceed 5.
      const existingAngleGridAssetIds =
        plan.frames[frameIndex]?.angleGridAssetIds ?? [];
      const updatedAngleGridAssetIds = [
        ...existingAngleGridAssetIds.filter(id => id !== numericAssetId),
        numericAssetId,
      ].slice(-5);

      const updatedFrames = plan.frames.slice();
      updatedFrames[frameIndex] = {
        ...updatedFrames[frameIndex],
        angleGridAssetIds: updatedAngleGridAssetIds,
      };
      const updatedPlan: VerticalDramaStartFramePlan = {
        ...plan,
        frames: updatedFrames,
      };

      await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodes.id, episodeId));

      const urlsByAssetId = await resolveMediaAssetUrlsByIds(
        tenantId,
        userId,
        updatedAngleGridAssetIds
      );
      const angleGridAssets = updatedAngleGridAssetIds
        .map(mediaAssetId => {
          const url = urlsByAssetId.get(mediaAssetId);
          return url ? { mediaAssetId, url } : null;
        })
        .filter((entry): entry is { mediaAssetId: number; url: string } =>
          Boolean(entry)
        );

      return {
        startFramePlan: updatedPlan,
        angleGridAssetIds: updatedAngleGridAssetIds,
        angleGridAssets,
      };
    }),

  /**
   * Manually override which character(s) — or which specific
   * variant/age-stage/twin `characterKey` of a character — are used as the
   * identity-lock reference(s) for ONE shot only (planning/vertical-drama-
   * twin-variant-completeness/plan.md, W6 backend). Today
   * `requiredCharacterRefs` is only ever set by the storyboard/start-frame-
   * plan LLM generation stages; this is a pure, cheap, direct data patch —
   * no LLM/skill call, no regeneration of any kind. Patches ONLY the
   * matching entry's `requiredCharacterRefs` in `startFramePlan.frames[]`,
   * same "find by shotNumber, replace one array entry, write the whole
   * jsonb column back" pattern as `setApprovedStartFrameAsset` above.
   *
   * `characterRefs` is the shot's new FULL `requiredCharacterRefs` array
   * (full replacement, not a merge/append) — every key must already exist
   * in this series' character roster (base character OR one of its
   * variant/twin rows' own `characterKey`), otherwise the whole call is
   * rejected with BAD_REQUEST rather than silently persisting a key that
   * would later resolve to zero reference images.
   */
  setShotCharacterReference: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        characterRefs: z.array(z.string().min(1)),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      // The per-shot character-reference override must be settable BEFORE the
      // start-frame plan/prompt is generated — e.g. to add a manually-created
      // character (like a freshly added roster member) to a shot that has no
      // image prompt yet. This used to throw "No start-frame plan entry for
      // shot N". Instead, create a minimal plan/frame when missing; the empty
      // `imagePrompt` is authored later by the normal per-shot generation,
      // which reads this `requiredCharacterRefs`.
      const existingPlan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const basePlan: VerticalDramaStartFramePlan =
        existingPlan && Array.isArray(existingPlan.frames)
          ? existingPlan
          : { mode: "single_frame_per_shot", selectedImageModelId: "", frames: [] };

      // Every requested characterKey must exist in this series' roster —
      // reject unknown keys instead of silently persisting garbage that
      // would later resolve to zero reference images at render time.
      const uniqueKeys = Array.from(new Set(input.characterRefs));
      if (uniqueKeys.length > 0) {
        const rosterRows = await db
          .select({ characterKey: verticalDramaCharacters.characterKey })
          .from(verticalDramaCharacters)
          .where(
            and(
              eq(verticalDramaCharacters.tenantId, tenantId),
              eq(verticalDramaCharacters.seriesId, seriesId),
              inArray(verticalDramaCharacters.characterKey, uniqueKeys)
            )
          );
        const foundKeys = new Set(
          rosterRows.map((r: { characterKey: string }) => r.characterKey)
        );
        const unknownKeys = uniqueKeys.filter(k => !foundKeys.has(k));
        if (unknownKeys.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown character key(s): ${unknownKeys.join(", ")}`,
          });
        }
      }

      const frameIndex = basePlan.frames.findIndex(
        f => f.shotNumber === input.shotNumber
      );
      const updatedFrames = basePlan.frames.slice();
      if (frameIndex === -1) {
        updatedFrames.push({
          shotNumber: input.shotNumber,
          imagePrompt: "",
          negativePrompt: "",
          requiredCharacterRefs: input.characterRefs,
          productReferenceAssetIds: [],
        });
        updatedFrames.sort((a, b) => a.shotNumber - b.shotNumber);
      } else {
        // If the character set actually changed (membership OR order), any
        // explicit "Image N = character" mapping baked into the stored prompt
        // is now stale — the start-frame image generator fail-closes on it
        // (see `findCharacterImageIndexMappingMismatches`). Clear the stale
        // prompt so the shot reads as "needs a fresh prompt" rather than a
        // broken one that only fails at image-generation time.
        const priorRefs = updatedFrames[frameIndex].requiredCharacterRefs ?? [];
        const refsChanged =
          priorRefs.length !== input.characterRefs.length ||
          priorRefs.some((k, i) => k !== input.characterRefs[i]);
        const clearStalePrompt =
          refsChanged &&
          (updatedFrames[frameIndex].imagePrompt ?? "").trim().length > 0;
        updatedFrames[frameIndex] = {
          ...updatedFrames[frameIndex],
          requiredCharacterRefs: input.characterRefs,
          ...(clearStalePrompt ? { imagePrompt: "", negativePrompt: "" } : {}),
        };
      }
      const updatedPlan: VerticalDramaStartFramePlan = {
        ...basePlan,
        frames: updatedFrames,
      };

      await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodes.id, episodeId));

      return { startFramePlan: updatedPlan };
    }),

  /**
   * Manually override which LOCATION one shot uses (Phase D of
   * `planning/polished-toasting-gadget.md` — location visual bible),
   * independent of the storyboard's own `distinct_locations[]` shot
   * grouping. Mirrors `setShotCharacterReference` immediately above exactly:
   * a pure, cheap, direct data patch — no LLM/skill call, no regeneration of
   * any kind. Patches ONLY the matching entry's `locationKey` in
   * `startFramePlan.frames[]`, same "find by shotNumber, replace one field,
   * write the whole jsonb column back" pattern.
   *
   * `locationKey` must already exist in this series' location roster
   * (`vertical_drama_locations`, tenant/user/series scoped) — an unknown key
   * is rejected with BAD_REQUEST rather than silently persisting a key that
   * would later resolve to zero reference images. Pass `locationKey: null`
   * to CLEAR the override and fall back to the storyboard's own
   * `distinct_locations[]` grouping for this shot again — see
   * `resolveEffectiveShotLocationKey`'s precedence doc comment.
   *
   * Once patched, this shot's start-frame image generation, video-prompt
   * generation, AND the actual video-render provider call (Phases D/E) all
   * resolve this shot's location through that SAME shared precedence
   * function, so every one of those stays in sync from a single edit here.
   */
  setShotLocation: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        locationKey: z.string().min(1).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (!plan || !Array.isArray(plan.frames)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No start-frame plan exists yet for this episode",
        });
      }
      const frameIndex = plan.frames.findIndex(
        f => f.shotNumber === input.shotNumber
      );
      if (frameIndex === -1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No start-frame plan entry for shot ${input.shotNumber}`,
        });
      }

      // The requested locationKey must exist in this series' roster —
      // reject an unknown key instead of silently persisting garbage that
      // would later resolve to zero reference images at render time (same
      // discipline `setShotCharacterReference` applies to `characterRefs`
      // above). Skipped entirely when clearing the override (`null`).
      if (input.locationKey !== null) {
        const [locationRow] = await db
          .select({ id: verticalDramaLocations.id })
          .from(verticalDramaLocations)
          .where(
            and(
              eq(verticalDramaLocations.tenantId, tenantId),
              eq(verticalDramaLocations.userId, userId),
              eq(verticalDramaLocations.seriesId, seriesId),
              eq(verticalDramaLocations.locationKey, input.locationKey)
            )
          )
          .limit(1);
        if (!locationRow) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Unknown location key: ${input.locationKey}`,
          });
        }
      }

      const updatedFrames = plan.frames.slice();
      updatedFrames[frameIndex] = {
        ...updatedFrames[frameIndex],
        locationKey: input.locationKey ?? undefined,
      };
      const updatedPlan: VerticalDramaStartFramePlan = {
        ...plan,
        frames: updatedFrames,
      };

      await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodes.id, episodeId));

      return { startFramePlan: updatedPlan };
    }),

  /**
   * Repair missing per-shot character reference slots — scans every shot's
   * resolved dialogue speakers (`resolveShotDialogueLines`, the same
   * fallback chain the per-shot start-frame/video prompt generators use)
   * and UNION-merges any roster `characterKey` a speaker resolves to into
   * that shot's `requiredCharacterRefs`, creating a minimal frame when a
   * shot has none yet. Never removes an existing ref/character. All real
   * logic lives in `verticalDramaShotCharacterRepair.ts` (this file is huge
   * and concurrently edited) — this is a thin auth/ownership wrapper only.
   */
  repairEpisodeShotCharacterReferences: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");

      const { repairEpisodeShotCharacterReferences: runRepair } = await import(
        "../services/verticalDramaShotCharacterRepair"
      );
      try {
        return await runRepair({ tenantId, userId, seriesId, episodeId });
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to repair missing shot characters",
        });
      }
    }),

  /**
   * Set the episode-level image/video model selection (Vertical Drama
   * Storyboard Completion Plan, Phase 1.1). Deliberately EPISODE-level only —
   * no per-shot/per-clip override (2026-07-05 product decision, see
   * `planning/vertical-drama-storyboard-complete/plan.md` §4/§Phase 1) — to
   * keep the model-selection UI to a single control per episode.
   *
   * Free (no credits, no generation triggered) — same convention as
   * `updateEpisodeDraft`, which this reuses the JSONB-patch shape of:
   * `selectedImageModelId` is written into `startFramePlan.selectedImageModelId`
   * and `selectedVideoModelId` into `motionPromptPack.selectedVideoModelId`,
   * creating a minimal plan object for whichever of the two hasn't been
   * generated yet (so choosing a model before the LLM planning stages have
   * run still persists the user's choice — `generateRealStartFramePlan` /
   * `generateRealMotionPromptPack` in `verticalDramaEpisodePipeline.ts` now
   * read this pre-existing value and preserve it instead of overwriting it,
   * see `projectStartFramePlan`/`projectMotionPromptPack`).
   *
   * Returns the resolved credit cost for a single generation at the newly
   * selected model (image: per-image; video: per-clip) so the client can
   * show it in a confirm dialog before the next paid generation call.
   */
  setEpisodeModelSelection: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
        selectedVideoModelId: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.selectedImageModelId && !input.selectedVideoModelId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Provide at least one of selectedImageModelId or selectedVideoModelId",
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      if (input.selectedImageModelId) {
        await assertModelSelectable(input.selectedImageModelId, "image");
      }
      if (input.selectedVideoModelId) {
        await assertModelSelectable(input.selectedVideoModelId, "video");
      }

      const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
        updatedAt: new Date(),
      };

      let updatedStartFramePlan: VerticalDramaStartFramePlan | null =
        row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (input.selectedImageModelId) {
        updatedStartFramePlan = updatedStartFramePlan
          ? {
              ...updatedStartFramePlan,
              selectedImageModelId: input.selectedImageModelId,
            }
          : {
              mode: "single_frame_per_shot",
              selectedImageModelId: input.selectedImageModelId,
              frames: [],
            };
        updates.startFramePlan = updatedStartFramePlan;
      }

      let updatedMotionPromptPack: VerticalDramaMotionPromptPack | null =
        row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      if (input.selectedVideoModelId) {
        updatedMotionPromptPack = updatedMotionPromptPack
          ? {
              ...updatedMotionPromptPack,
              selectedVideoModelId: input.selectedVideoModelId,
            }
          : {
              selectedVideoModelId: input.selectedVideoModelId,
              durationProfileId:
                row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
              motionMode: "first_frame_to_video",
              clips: [],
              warnings: [],
            };
        updates.motionPromptPack = updatedMotionPromptPack;
      }

      const [updatedRow] = await db
        .update(verticalDramaEpisodes)
        .set(updates)
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .returning();

      // Surface the resolved per-unit credit cost for the newly selected
      // model(s) so the client can show it in a confirm dialog before the
      // next paid generation call — computed from the ACTUALLY-resolved
      // model, not a hardcoded default (spec Phase 1.2).
      let imageCreditCost: number | undefined;
      if (input.selectedImageModelId) {
        const [pricingRow] = await db
          .select({
            creditCost: mediaModels.creditCost,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(eq(mediaModels.modelId, input.selectedImageModelId))
          .limit(1);
        const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
        imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });
      }

      let videoCreditCost: number | undefined;
      if (input.selectedVideoModelId) {
        const [pricingRow] = await db
          .select({
            creditCost: mediaModels.creditCost,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(eq(mediaModels.modelId, input.selectedVideoModelId))
          .limit(1);
        videoCreditCost = pricingRow?.creditCost;
      }

      return {
        episode: { ...updatedRow, id: String(updatedRow.id) },
        startFramePlan: updatedStartFramePlan,
        motionPromptPack: updatedMotionPromptPack,
        imageCreditCost,
        videoCreditCost,
      };
    }),

  /**
   * Set the episode-level video-prompt LANGUAGE plan (episode-level language
   * options wave): `promptLanguage` — the language the video-clip PROMPT
   * TEXT ITSELF is written in (default `"en"`, video models follow English
   * best) — and `dialogueLanguage` — the language the characters SPEAK in
   * the video (default `"th"`, the series' own locale). Both are additive,
   * optional fields on `motionPromptPack` (see
   * `VerticalDramaPromptLanguage`/`VerticalDramaDialogueLanguage` in
   * `@shared/verticalDramaSeries`).
   *
   * Free (no credits, no generation triggered) — mirrors
   * `setEpisodeModelSelection`'s JSONB-patch shape exactly: writes onto
   * `motionPromptPack`, creating a minimal pack when none exists yet (so the
   * user's language choice persists even before `video_motion_prompt_pack`
   * has ever run) — the pipeline's `generateRealMotionPromptPack` /
   * `generateVerticalDramaShotVideoPrompt` call sites read this pre-existing
   * value the same way they already read `selectedVideoModelId`.
   */
  setEpisodeVideoPromptLanguage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        promptLanguage: z.enum(VERTICAL_DRAMA_PROMPT_LANGUAGES).optional(),
        dialogueLanguage: z.enum(VERTICAL_DRAMA_DIALOGUE_LANGUAGES).optional(),
        thaiAccent: z.enum(VERTICAL_DRAMA_THAI_ACCENTS).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !input.promptLanguage &&
        !input.dialogueLanguage &&
        !input.thaiAccent
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Provide at least one of promptLanguage, dialogueLanguage, or thaiAccent",
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      return db.transaction(async tx => {
        const [lockedRow] = await tx
          .select()
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .for("update")
          .limit(1);
        const freshRow = lockedRow ?? row;
        const existingPack =
          freshRow.motionPromptPack as VerticalDramaMotionPromptPack | null;
        const existingStartFramePlan =
          freshRow.startFramePlan as VerticalDramaStartFramePlan | null;
        const updatedPack: VerticalDramaMotionPromptPack = existingPack
          ? {
              ...existingPack,
              ...(input.promptLanguage
                ? { promptLanguage: input.promptLanguage }
                : {}),
              ...(input.dialogueLanguage
                ? { dialogueLanguage: input.dialogueLanguage }
                : {}),
              ...(input.thaiAccent ? { thaiAccent: input.thaiAccent } : {}),
            }
          : {
              selectedVideoModelId: "",
              durationProfileId:
                freshRow.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
              motionMode: "first_frame_to_video",
              clips: [],
              warnings: [],
              ...(input.promptLanguage
                ? { promptLanguage: input.promptLanguage }
                : {}),
              ...(input.dialogueLanguage
                ? { dialogueLanguage: input.dialogueLanguage }
                : {}),
              ...(input.thaiAccent ? { thaiAccent: input.thaiAccent } : {}),
            };

        if (input.dialogueLanguage && input.dialogueLanguage !== "th") {
          delete updatedPack.thaiAccent;
        }

        const shouldSnapshotLegacyImageLanguage =
          Boolean(input.promptLanguage) && !existingStartFramePlan?.imagePromptLanguage;
        const updatedStartFramePlan: VerticalDramaStartFramePlan | undefined =
          shouldSnapshotLegacyImageLanguage
            ? {
                ...(existingStartFramePlan ?? {
                  mode: "single_frame_per_shot" as const,
                  selectedImageModelId: "",
                  frames: [],
                }),
                imagePromptLanguage: resolveEffectiveImagePromptLanguage({
                  startFramePlan: existingStartFramePlan,
                  motionPromptPack: existingPack,
                }),
              }
            : undefined;
        const [updatedRow] = await tx
          .update(verticalDramaEpisodes)
          .set({
            motionPromptPack: updatedPack,
            ...(updatedStartFramePlan ? { startFramePlan: updatedStartFramePlan } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .returning();

        return {
          episode: { ...updatedRow, id: String(updatedRow.id) },
          motionPromptPack: updatedPack,
          ...(updatedStartFramePlan ? { startFramePlan: updatedStartFramePlan } : {}),
        };
      });
    }),

  setEpisodeImagePromptLanguage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        imagePromptLanguage: z.enum(VERTICAL_DRAMA_PROMPT_LANGUAGES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      return db.transaction(async tx => {
        const [lockedRow] = await tx
          .select()
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .for("update")
          .limit(1);
        const freshRow = lockedRow ?? row;
        const existingPlan =
          freshRow.startFramePlan as VerticalDramaStartFramePlan | null;
        const updatedPlan: VerticalDramaStartFramePlan = existingPlan
          ? { ...existingPlan, imagePromptLanguage: input.imagePromptLanguage }
          : {
              mode: "single_frame_per_shot",
              selectedImageModelId: "",
              frames: [],
              imagePromptLanguage: input.imagePromptLanguage,
            };
        const [updatedRow] = await tx
          .update(verticalDramaEpisodes)
          .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .returning();
        return {
          episode: { ...updatedRow, id: String(updatedRow.id) },
          startFramePlan: updatedPlan,
        };
      });
    }),

  /**
   * Two-mode start-frame image prompt switch
   * (`planning/vd-start-frame-prompt-modes/plan.md`) — per-sub-episode
   * setting for which skill `generateShotStartFramePrompt` authors a shot's
   * start-frame image prompt with. Modeled exactly on
   * `setEpisodeVideoPromptLanguage` immediately above: a free (no credits),
   * simple JSONB patch onto `startFramePlan.imagePromptMode`, creating a
   * minimal plan when none exists yet. `"auto"` (the default) resolves at
   * generation time from the episode's selected image model family; an
   * explicit `policy_safe_rewrite`/`cinematic_narrative` choice always wins.
   */
  setEpisodeImagePromptMode: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        mode: z.enum(["auto", "policy_safe_rewrite", "cinematic_narrative"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const existingPlan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const updatedPlan: VerticalDramaStartFramePlan = existingPlan
        ? { ...existingPlan, imagePromptMode: input.mode }
        : {
            mode: "single_frame_per_shot",
            selectedImageModelId: "",
            frames: [],
            imagePromptMode: input.mode,
          };

      const [updatedRow] = await db
        .update(verticalDramaEpisodes)
        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .returning();

      return {
        episode: { ...updatedRow, id: String(updatedRow.id) },
        startFramePlan: updatedPlan,
      };
    }),

  /**
   * Submit a real start-frame image generation for one shot via the model's
   * already approved prompt (`startFramePlan.frames[shotNumber].imagePrompt`,
   * from the `start_frame_render_plan` stage) — returns a task id to poll,
   * exactly like every other real image/video generation in the app
   * (`media.generateImageAsync` + `media.getTask`), so this shows up in
   * Media History with credit deduction like everything else. (An earlier
   * version of this endpoint called the synchronous `generateImage` — same
   * primitive `generateCharacterImage` uses for portraits — which does NOT
   * register a Media History task; that was a real gap, not an intentional
   * shortcut, corrected here.)
   *
   * The CALLER (frontend) polls `media.getTask({taskId})` until the task
   * completes, then finalizes by calling
   * `verticalDramaCharacters.resolveMediaAssetForImport({source:"url", url:
   * task.resultUrl, mimeType})` to register the canonical media asset,
   * followed by `setApprovedStartFrameAsset` to link it to this shot — both
   * already-built, already-tested procedures; no new "finalize" endpoint
   * needed.
   */
  generateStartFrameImage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        // Required only when the episode's selected image model is
        // MCP-transport (e.g. `higgsfield/*`, `magnific-mcp/*`) — see
        // `resolveVdMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 5).
        // Required only when the resolved model is Hermes-transport and the
        // caller has no default Hermes connection for images.
        hermesConnectionId: z.string().max(64).optional(),
        // Optional output resolution/size (storyboard-complete plan Phase
        // 6.2b) — e.g. "1K"/"2K"/"4K" or "720p"/"1080p"/"4K" depending on the
        // resolved model's `resolutionOptions` (`mediaModels.list`). Ignored
        // if the model has no resolution axis; validated against the
        // model's derived options otherwise.
        resolution: z.string().trim().max(32).optional(),
        softenLevel,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex =
        plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
      if (!plan || frameIndex === -1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame prompt for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }
      const frame = plan.frames[frameIndex];
      if (!frame.imagePrompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber} has no image prompt yet`,
        });
      }

      // Wave-4A (spec §13.1) tie-in gate — REJECT paid start-frame render for
      // a tie-in-carrying shot when the latest tie-in quality report is
      // failing or missing (VD_TIE_IN_BELOW_FLOOR). No-op for non-tie-in
      // shots/episodes, or when `verticalDramaSeriesTieInQc` is off.
      const { tieInQcEnabled, qualityLoopV2Enabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      await assertTieInQualityGatePassed({
        owner: { tenantId, userId, seriesId, episodeId },
        tieInQcEnabled,
        script: row.script as Record<string, unknown> | null,
        shotNumbers: [input.shotNumber],
      });

      // Wave-7D (spec §16.1 acceptance) — best-effort expert-mode quality-
      // floor-override audit record; never blocks. See
      // `maybeRecordQualityFloorOverrideAudit`'s doc comment.
      if (qualityLoopV2Enabled) {
        const startFrameQualityPolicy = await loadVerticalDramaQualityPolicy(
          tenantId,
          userId,
          seriesId
        );
        await maybeRecordQualityFloorOverrideAudit({
          owner: { tenantId, userId, seriesId, episodeId },
          policy: startFrameQualityPolicy,
          source: "trpc.verticalDramaEpisodes.generateStartFrameImage",
        });
      }

      // Content-policy-risk soften level (vertical-drama-skill-first-
      // architecture plan, Phase 1.3) — `effectiveSoftenLevel` 0/absent is
      // the default/first-attempt path and MUST stay a zero-extra-LLM-call
      // no-op: this mutation runs on EVERY normal image render, not just
      // retries. `effectiveSoftenLevel > 0` is an explicit client resubmit
      // after a provider content-policy rejection; that branch calls the
      // `vertical-drama-shot-image-action` skill's `"soften"` action further
      // below, once `keptCharEntries` (the identity-lock facts) are
      // resolved — see that block's doc comment. (Phase 3, item 2:
      // `formatIdentityLockedImagePrompt` no longer exists at all — the
      // level-0 branch below now uses `softenedImagePrompt` unmodified,
      // since the planning skill already authored the identity-lock text.)
      const effectiveSoftenLevel = input.softenLevel ?? 0;
      // `stripExistingIdentityLockSuffix` is NOT part of the soften
      // mechanism — it is the unrelated, always-on idempotency fix
      // (2026-07-10 incident) that strips a stale identity-lock suffix a
      // PRIOR call may have persisted onto this shot's stored prompt, so it
      // is never echoed back as if it were story content on ANY call,
      // softened or not.
      let softenedImagePrompt = stripExistingIdentityLockSuffix(frame.imagePrompt);
      let softenedNegativePrompt: string | undefined = frame.negativePrompt;

      // Final provider-bound Series Look assembler. Authoring never receives
      // raw fragments, and this merge is idempotent across retries.
      const { presetMixV2Enabled, seriesLookLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        if (presetVisualIdentity) {
          const assembled = applySeriesLookToImagePrompt({
            prompt: softenedImagePrompt,
            negativePrompt: softenedNegativePrompt,
            identity: presetVisualIdentity,
          });
          softenedImagePrompt = assembled.prompt;
          softenedNegativePrompt = assembled.negativePrompt;
        }
      }

      // Identity-lock references — resolve each required character's
      // approved portrait, same lookup `generateRealStoryboard` uses.
      const characterAttachmentManifest =
        await resolveRequiredShotCharacterAttachmentManifest(
        tenantId,
        userId,
        seriesId,
        input.shotNumber,
        frame.requiredCharacterRefs,
      );
      const characterRefEntries = [
        ...characterAttachmentManifest.primaryEntries,
        ...characterAttachmentManifest.supplementaryEntries,
      ];
      const characterRefUrls = characterRefEntries.map(e => e.url);

      // Render-time reference-mapping fail-closed guard (RC2/RC3 fix,
      // `planning/vd-start-frame-reference-mapping/plan.md` Phase 3,
      // 2026-07-16) — REPLACES the removed `formatIdentityLockedImagePrompt`
      // code-authored append (see this file's doc comment at that former
      // helper's old definition site for the full RC2 writeup). The skill
      // authors the identity-lock "Image N ↔ name" mapping itself, in its
      // own prose, at planning time; code no longer appends a second,
      // independently-authored mapping on top of it (that dual-authorship is
      // exactly what produced the observed contradiction — prose said
      // "ภาคิน (Image 1)" / "ไอริณ (Image 2)" while the removed append said
      // "Image 1 = ไอริณ; Image 2 = ภาคิน"). Instead, validate the STORED
      // prompt (after `stripExistingIdentityLockSuffix`, so a legacy
      // code-authored bracket from before this migration is never
      // mis-validated) against the REAL attachment order
      // (`characterAttachmentManifest.primaryEntries`, 1-based `imageIndex`
      // = attachment position) and fail closed on an EXPLICIT contradiction,
      // BEFORE credits are reserved. Legacy prompts that never make an
      // explicit "Image N" claim (i.e. authored before the skill wrote this
      // mapping into its own prose) proceed unchanged — the validator is
      // lenient by design (see `findCharacterImageIndexMappingMismatches`'s
      // doc comment).
      const referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
        softenedImagePrompt,
        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
          imageIndex: index + 1,
          characterName: entry.name,
        })),
      );
      if (referenceMappingMismatches.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — มีการเพิ่ม/เปลี่ยนตัวละครของช็อตนี้หลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน (ถ้าสร้างภาพตอนนี้ หน้าตัวละครอาจสลับกัน) วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่ก่อน แล้วจึงสร้างภาพ`,
        });
      }

      // Location reference (Phase 2 of `planning/polished-toasting-gadget.md`
      // — location visual bible) — this shot's environment-lock reference,
      // resolved from the storyboard's own `distinct_locations[]` groups
      // (already fetched as part of `row` above, no new query beyond what
      // `loadOwnedEpisode` already fetched), or the shot's own per-shot
      // override (`frame.locationKey`, Phase D — see
      // `resolveEffectiveShotLocationKey`'s precedence doc comment). At most
      // one URL per shot. Inserted BETWEEN character and product refs so
      // identity-lock always wins over environment-lock, and environment-lock
      // always wins over the (comparatively protected) product reference,
      // when a model's `maxReferenceImages` forces trimming.
      const locationRefEntry = await resolveShotLocationReferenceEntry(
        tenantId,
        userId,
        seriesId,
        row.storyboard,
        input.shotNumber,
        frame.locationKey
      );
      const locationRefUrls = locationRefEntry?.url ? [locationRefEntry.url] : [];
      // Product tie-in reference (spec: the product must physically appear
      // in the shot, not just be described in text) — appended AFTER
      // character/location refs so identity-lock and environment-lock always
      // take priority when a model's `maxReferenceImages` forces trimming.
      const productRefUrls = resolveShotProductReferenceUrls(
        frame.productReferenceAssetIds
      );

      // Resolution order (spec Phase 1.2): episode-level selection →
      // `DEFAULT_MODELS`. Pricing AND the actual generation call below both
      // use this same resolved model id — previously this always priced +
      // generated with `DEFAULT_MODELS.image`, silently ignoring the
      // episode's `selectedImageModelId` entirely.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCapabilities = resolveVerticalDramaCapabilities(
        resolvedImageModelId,
        {
          type: "image",
          configJson: pricingModel.configJson ?? undefined,
        }
      );
      assertRequiredCharacterReferenceCapacity(
        input.shotNumber,
        characterAttachmentManifest.primaryEntries.length,
        imageCapabilities.maxReferenceImages,
      );
      const {
        urls: referenceImageUrls,
        trimmedCount: trimmedProductReferenceCount,
      } = mergeAndTrimReferenceImageUrls(
        characterRefUrls,
        locationRefUrls,
        productRefUrls,
        imageCapabilities.maxReferenceImages
      );
      // Validate + recompute cost when the model has a resolution-tiered
      // matrix (storyboard-complete plan Phase 6.2b) — `calculateCreditCost`
      // ignores `resolution` entirely for flat-priced models, so this is
      // always safe to pass through.
      assertResolutionOption(pricingModel, input.resolution);
      const imageCreditCost = calculateCreditCost(pricingModel, {
        numImages: 1,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (e.g. Higgsfield/Magnific MCP — billed via MCP
      // subscription, not credits) must skip the reserve/refund cycle
      // entirely: `deductCredits`/`refundCredits` throw on amount <= 0 by
      // design (see creditService.ts). Same convention as the generic
      // `media.generateImageAsync` MCP-transport branch, which never calls
      // deductCredits at all for these models.
      const shouldChargeImageCredits = imageCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09): resolve the
      // transport-neutral decision BEFORE the credit reserve block below
      // (not after) — structurally guarantees "no platform-credit reserve
      // for hermes" regardless of a misconfigured catalog row's
      // `creditCost`. `mcp`/`gateway` fall through to the pre-existing code
      // below byte-identically (delegates to `resolveVdMcpTransportMetadata`
      // unchanged); `hermes` is handled at the submit block further down
      // (see the `transportDecision.kind === "hermes"` branch right before
      // this mutation's existing `generateImageAsync` submit call).
      const transportDecision = await resolveVdMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
        idempotencyKey: input.idempotencyKey,
      });
      const transportMetadata =
        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for start-frame image render. Required: ${imageCreditCost}`,
          });
        }

        // Reserve credits BEFORE starting the task — same convention as
        // `media.ts`'s `generateImageAsync` (`media.getTask` reconciles the
        // reservation against actual usage once the task completes/fails).
        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — start frame render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
          sourceType: "media_image",
          idempotencyKey: input.idempotencyKey,
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      // Identity-lock references — which character entries actually have a
      // reference image attached, after `mergeAndTrimReferenceImageUrls`'s
      // `maxReferenceImages` trimming. Still needed below (the soften>0
      // branch's `characterReferenceManifest` input), even though the
      // level-0 branch no longer formats a prompt from it — see that doc
      // comment.
      const keptCharEntries = characterAttachmentManifest.primaryEntries;

      let renderStartFramePrompt: string;
      if (effectiveSoftenLevel === 0) {
        // Default/first-attempt path (vertical-drama-skill-first-
        // architecture plan, Phase 3, item 2) — `softenedImagePrompt` IS the
        // final render prompt now: the `vertical-drama-shot-start-frame-
        // render` skill's own output already states the full identity-lock
        // constraint (face shape, skin tone, hairstyle, clothing/outfit,
        // distinguishing features) per required character in its own prose
        // (skill.md's "Attached Character Reference Image Indexing"
        // instruction), so no code-side `formatIdentityLockedImagePrompt`
        // append is needed here anymore. Zero extra LLM calls, same as
        // before.
        renderStartFramePrompt = softenedImagePrompt;
      } else {
        // Explicit client retry after a provider content-policy rejection
        // (vertical-drama-skill-first-architecture plan, Phase 1.3) — the
        // `vertical-drama-shot-image-action` skill's `"soften"` action
        // authors BOTH the softened wording AND its own appropriately-toned
        // identity-lock phrase from `characterReferenceManifest` in one
        // call. `formatIdentityLockedImagePrompt` is deliberately SKIPPED on
        // this branch only: running it afterward at full strength would
        // immediately overwrite the skill's toned-down identity language
        // with the strict version, defeating the soften request. This is
        // not a broader Phase-3 migration — softening and identity-lock
        // phrasing are inherently the same decision at reduced intensity.
        const softenRegionCode = await loadSeriesTargetAudienceRegion(
          tenantId,
          userId,
          seriesId
        );
        const softenProductLockFacts = await loadSeriesProductTieInFacts(
          tenantId,
          userId,
          seriesId,
          productRefUrls.length > 0
        );
        const {
          generateShotImageAction,
          InsufficientCreditsError: ShotImageActionInsufficientCreditsError,
          VdSchemaValidationError: ShotImageActionSchemaValidationError,
        } = await import("../services/verticalDramaShotImageAction");

        let softenActionResult: { prompt: string; negativePrompt: string };
        try {
          softenActionResult = await generateShotImageAction({
            userId,
            tenantId,
            seriesId,
            action: "soften",
            softenLevel: effectiveSoftenLevel,
            shot: {
              shotNumber: input.shotNumber,
              currentPrompt: softenedImagePrompt,
              currentNegativePrompt: softenedNegativePrompt ?? "",
            },
            repairInstruction: null,
            characterReferenceManifest: keptCharEntries.map((e, idx) => ({
              index: idx + 1,
              characterId: null,
              name: e.name,
            })),
            targetAudienceRegion: {
              code: softenRegionCode,
              descriptor:
                VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[
                  softenRegionCode
                ],
            },
            productLock: {
              active: productRefUrls.length > 0,
              productName: softenProductLockFacts?.productName ?? null,
              productDescription:
                softenProductLockFacts?.productDescription ?? null,
            },
            gridLayout: null,
            idempotencyKey: input.idempotencyKey,
          });
        } catch (err) {
          if (shouldChargeImageCredits) {
            await refundCredits({
              userId,
              amount: imageCreditCost,
              description: `Refund: start-frame soften prompt authoring failed (episode #${episodeId}, shot ${input.shotNumber})`,
              sourceType: "media_image",
              metadata: {
                feature: "vertical_drama_series",
                seriesId,
                episodeId,
                shotNumber: input.shotNumber,
                error: err instanceof Error ? err.message : "Unknown error",
              },
            });
          }
          if (err instanceof ShotImageActionInsufficientCreditsError) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Insufficient credits to author the softened image prompt",
            });
          }
          if (err instanceof ShotImageActionSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to author the softened image prompt — try again",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Failed to author the softened image prompt",
          });
        }

        renderStartFramePrompt = softenActionResult.prompt;
        softenedNegativePrompt = softenActionResult.negativePrompt || softenedNegativePrompt;
      }

      // Final-prompt QC (hard length cap) — enforced right before the
      // outgoing image render call. No-op (zero LLM calls / zero credits)
      // when the stored prompt is already within `VD_IMAGE_PROMPT_MAX`.
      // `renderStartFramePrompt` is used UNMODIFIED (no code-authored
      // identity-lock append — see the `referenceMappingMismatches` guard
      // above's doc comment for why) — the skill's own prose already states
      // the full identity-lock constraint, so there is no separate
      // "protected fragment" to shield from QC trimming anymore either.
      const imagePromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: renderStartFramePrompt,
        maxChars: resolveVdImagePromptBudgetForModel({
          modelId: resolvedImageModelId,
          configJson: pricingModel.configJson,
        }),
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `start-frame image prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

      if (
        imagePromptQc.prompt !== frame.imagePrompt &&
        Array.isArray(plan.frames)
      ) {
        const updatedFrames = plan.frames.map(
          (f: { shotNumber: number; imagePrompt: string }) =>
            f.shotNumber === input.shotNumber
              ? { ...f, imagePrompt: imagePromptQc.prompt }
              : f
        );
        const updatedPlan = { ...plan, frames: updatedFrames };
        await db
          .update(verticalDramaEpisodes)
          .set({
            startFramePlan: updatedPlan,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          );
      }

      // Feature 135 — Hermes Grok media worker (section 09, row 5): a
      // completely separate submit path — no platform credit reserve (the
      // block above already skipped it for a zero-cost hermes model), build
      // the reference set from the same trimmed `referenceImageUrls`, and
      // submit straight to `queueHermesMediaJob`.
      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
          tenantId,
          userId,
          urls: referenceImageUrls,
          traceId: hermesTraceId,
          connectionId: transportDecision.connectionId,
          requireAll: referenceImageUrls.length > 0,
        });
        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: imagePromptQc.prompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
            ...(input.resolution ? { resolution: input.resolution } : {}),
          },
          references,
          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: imagePromptQc.prompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_episode_id: String(episodeId),
            __vd_shot_number: String(input.shotNumber),
            __vd_purpose: "start_frame",
          },
          droppedReferenceCount,
        });
        return {
          taskId: hermesTask.id,
          modelId: resolvedImageModelId,
          creditCost: 0,
          trimmedProductReferenceCount,
          droppedReferenceCount,
        };
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: imagePromptQc.prompt,
            // Product lock (spec follow-up to tie-in): whenever a product
            // reference image is attached to this call, the negative prompt
            // must also guard against the model reinterpreting/redesigning
            // the product — see `verticalDramaProductTieIn.ts`'s doc comment.
            negativePrompt: mergeProductLockNegativePrompt(
              softenedNegativePrompt,
              productRefUrls.length > 0
            ),
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(input.resolution ? { resolution: input.resolution } : {}),
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            // Series provenance tag (project-scoped media panel filter) —
            // persisted verbatim into the media task's `parameters.extra_params`
            // (see PERSISTED_INTERNAL_EXTRA_PARAM_KEYS); read back by
            // `media.listTasks`'s optional `seriesId` filter.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
              __vd_shot_number: String(input.shotNumber),
              __vd_purpose: "start_frame",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.generateStartFrameImage",
              stage: "submission",
            },
          },
          userToken
        );
        return {
          taskId: task.id,
          modelId: resolvedImageModelId,
          creditCost: imageCreditCost,
          trimmedProductReferenceCount,
        };
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: start-frame render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Start-frame image generation failed to submit",
        });
      }
    }),

  /**
   * Submit a single "multi-angle variations" image for one shot — ONE 3x3
   * grid image containing 9 DIFFERENT CAMERA ANGLES of the exact same
   * scene/moment (not 9 different shots — that's what the pre-existing,
   * still-unwired `verticalDramaStartFramesRouter`'s contact-sheet mode
   * does). Lets the user generate once, then pick whichever framing reads
   * best for this shot. Async submit, same convention as
   * `generateStartFrameImage` — the caller polls `media.getTask`, then
   * splits the completed grid image into 9 candidates client-side (reusing
   * `imageGridSplitter.splitImage`, the same tool the character-reference
   * grid-cutter already uses) and lets the user pick one before finalizing
   * via `resolveMediaAssetForImport` + `setApprovedStartFrameAsset`.
   */
  generateStartFrameAngleVariations: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        // Required only when the episode's selected image model is
        // MCP-transport — see `resolveVdMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 6). See
        // `generateStartFrameImage`'s identical field.
        hermesConnectionId: z.string().max(64).optional(),
        // Optional output resolution/size (storyboard-complete plan Phase
        // 6.2b) — same convention as `generateStartFrameImage`.
        resolution: z.string().trim().max(32).optional(),
        softenLevel,
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex =
        plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
      if (!plan || frameIndex === -1) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame prompt for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }
      const frame = plan.frames[frameIndex];
      if (!frame.imagePrompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber} has no image prompt yet`,
        });
      }

      // Content-policy-risk soften level (vertical-drama-skill-first-
      // architecture plan, Phase 1.3) — no longer applied here via a regex
      // ladder; `effectiveSoftenLevel` is instead passed straight through
      // as `softenLevel` on the SAME `generateShotImageAction({action:
      // "multi_angle_grid", ...})` call below, which authors the grid
      // prompt AND the soften wording together in one skill call. See that
      // call site's doc comment.
      const effectiveSoftenLevel = input.softenLevel ?? 0;
      // `stripExistingIdentityLockSuffix` is NOT part of the soften
      // mechanism — see the matching comment in `generateStartFrameImage`.
      let softenedImagePrompt = stripExistingIdentityLockSuffix(frame.imagePrompt);
      let softenedNegativePrompt: string | undefined = frame.negativePrompt;

      // Same final provider-bound Series Look assembler as start-frame render;
      // idempotency protects grid retries from duplicate fragments.
      const { presetMixV2Enabled, seriesLookLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        if (presetVisualIdentity) {
          const assembled = applySeriesLookToImagePrompt({
            prompt: softenedImagePrompt,
            negativePrompt: softenedNegativePrompt,
            identity: presetVisualIdentity,
          });
          softenedImagePrompt = assembled.prompt;
          softenedNegativePrompt = assembled.negativePrompt;
        }
      }

      const characterAttachmentManifest =
        await resolveRequiredShotCharacterAttachmentManifest(
        tenantId,
        userId,
        seriesId,
        input.shotNumber,
        frame.requiredCharacterRefs,
      );
      const characterRefEntries = [
        ...characterAttachmentManifest.primaryEntries,
        ...characterAttachmentManifest.supplementaryEntries,
      ];
      const characterRefUrls = characterRefEntries.map(e => e.url);

      // Render-time reference-mapping fail-closed guard — same rationale and
      // convention as `generateStartFrameImage`'s identical guard above (see
      // that block's doc comment for the full RC2/RC3 writeup); validates
      // the stripped STORED prompt (before the grid-authoring skill call
      // below rewrites it), before credits are reserved.
      const angleReferenceMappingMismatches = findCharacterImageIndexMappingMismatches(
        softenedImagePrompt,
        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
          imageIndex: index + 1,
          characterName: entry.name,
        })),
      );
      if (angleReferenceMappingMismatches.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — มีการเพิ่ม/เปลี่ยนตัวละครของช็อตนี้หลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน (ถ้าสร้างภาพตอนนี้ หน้าตัวละครอาจสลับกัน) วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่ก่อน แล้วจึงสร้างภาพ`,
        });
      }

      // Location reference (Phase 2 of `planning/polished-toasting-gadget.md`
      // — location visual bible) — same resolution + priority-ordering
      // rationale as `generateStartFrameImage`'s identical block above,
      // including the Phase D per-shot override (`frame.locationKey`).
      const locationRefEntry = await resolveShotLocationReferenceEntry(
        tenantId,
        userId,
        seriesId,
        row.storyboard,
        input.shotNumber,
        frame.locationKey
      );
      const locationRefUrls = locationRefEntry?.url ? [locationRefEntry.url] : [];
      const productRefUrls = resolveShotProductReferenceUrls(
        frame.productReferenceAssetIds
      );

      // Character identity map (2026-07-07 non-human-character-vanishing
      // fix) — re-injected directly into the grid prompt (not just relying
      // on the base `imagePrompt` already carrying it) since the
      // `vertical-drama-shot-image-action` skill's `soften_level` input may
      // progressively relax identity-lock wording on repeated
      // policy-failure retries. See
      // `@shared/verticalDramaSeries/characterIdentityMap.ts`.
      const angleGridCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          frame.requiredCharacterRefs
        );
      const angleGridCharacterIdentityMapBlock = buildCharacterIdentityMapBlock(
        frame.requiredCharacterRefs ?? [],
        angleGridCharacterIdentitySources
      );

      // Resolution order (spec Phase 1.2): episode-level selection →
      // `DEFAULT_MODELS` — same resolver `generateStartFrameImage` uses, so
      // both call sites for this shot always price + generate with the same
      // model.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      // 9 cells at ~2x the per-shot credit cost (one grid render, not nine) —
      // matches how the pre-existing contact-sheet planner prices a sheet.
      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const angleImageCapabilities = resolveVerticalDramaCapabilities(
        resolvedImageModelId,
        {
          type: "image",
          configJson: pricingModel.configJson ?? undefined,
        }
      );
      assertRequiredCharacterReferenceCapacity(
        input.shotNumber,
        characterAttachmentManifest.primaryEntries.length,
        angleImageCapabilities.maxReferenceImages,
      );
      const {
        urls: referenceImageUrls,
        trimmedCount: trimmedProductReferenceCount,
      } = mergeAndTrimReferenceImageUrls(
        characterRefUrls,
        locationRefUrls,
        productRefUrls,
        angleImageCapabilities.maxReferenceImages
      );
      assertResolutionOption(pricingModel, input.resolution);
      const gridCreditCost = calculateCreditCost(pricingModel, {
        numImages: 2,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
      // entirely — see the matching comment in `generateStartFrameImage`.
      const shouldChargeGridCredits = gridCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09, row 6): resolve
      // the transport-neutral decision BEFORE the credit reserve block below
      // (not after) — structurally guarantees "no platform-credit reserve
      // for hermes" — see `generateStartFrameImage`'s matching block.
      const transportDecision = await resolveVdMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
        idempotencyKey: input.idempotencyKey,
      });
      const transportMetadata =
        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;

      if (transportDecision.kind !== "hermes" && shouldChargeGridCredits) {
        const hasCredits = await hasEnoughCredits(userId, gridCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for multi-angle grid render. Required: ${gridCreditCost}`,
          });
        }

        await deductCredits({
          userId,
          tenantId,
          amount: gridCreditCost,
          description: `Vertical Drama — multi-angle grid render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
          sourceType: "media_image",
          idempotencyKey: input.idempotencyKey,
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            type: "reservation",
            creditCost: gridCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      // Series-level target-audience region — passed to the skill as a raw
      // FACT (code, descriptor), not a pre-authored instruction sentence.
      const gridRegion = await loadSeriesTargetAudienceRegion(
        tenantId,
        userId,
        seriesId
      );

      // vertical-drama-skill-first-architecture plan, Phase 1 item 1: the
      // `vertical-drama-shot-image-action` skill authors the ENTIRE grid
      // prompt (scene restatement, 3x3 grid-layout instruction, camera-angle
      // diversity, identity lock, and the "no text anywhere in the image"
      // warning — a real production failure this wording was hand-tuned
      // against once via a code/redeploy cycle; the skill now owns that
      // wording so future tuning happens in skill.md, not here) from these
      // ground-truth facts. Code no longer authors any instructional prompt
      // text for this call site.
      const keptAngleCharEntries = characterAttachmentManifest.primaryEntries;
      const gridProductLockFacts = await loadSeriesProductTieInFacts(
        tenantId,
        userId,
        seriesId,
        productRefUrls.length > 0
      );

      const {
        generateShotImageAction,
        InsufficientCreditsError: ShotImageActionInsufficientCreditsError,
        VdSchemaValidationError: ShotImageActionSchemaValidationError,
      } = await import("../services/verticalDramaShotImageAction");

      let gridActionResult: { prompt: string; negativePrompt: string };
      try {
        gridActionResult = await generateShotImageAction({
          userId,
          tenantId,
          seriesId,
          action: "multi_angle_grid",
          // Content-policy-risk soften level (Phase 1.3) — the skill
          // authors the grid prompt AND the soften wording together in this
          // one call; no separate softening pass runs before or after it.
          softenLevel: effectiveSoftenLevel,
          shot: {
            shotNumber: input.shotNumber,
            currentPrompt: softenedImagePrompt,
            currentNegativePrompt: softenedNegativePrompt ?? "",
          },
          repairInstruction: null,
          characterReferenceManifest: keptAngleCharEntries.map((e, idx) => ({
            index: idx + 1,
            characterId: null,
            name: e.name,
          })),
          targetAudienceRegion: {
            code: gridRegion,
            descriptor:
              VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[gridRegion],
          },
          productLock: {
            active: productRefUrls.length > 0,
            productName: gridProductLockFacts?.productName ?? null,
            productDescription:
              gridProductLockFacts?.productDescription ?? null,
          },
          gridLayout: { panelCount: 9, layout: "3x3" },
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        if (shouldChargeGridCredits) {
          await refundCredits({
            userId,
            amount: gridCreditCost,
            description: `Refund: multi-angle grid prompt authoring failed (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        if (err instanceof ShotImageActionInsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Insufficient credits to author the multi-angle grid prompt",
          });
        }
        if (err instanceof ShotImageActionSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to author the multi-angle grid prompt — try again",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to author the multi-angle grid prompt",
        });
      }

      // The non-human/species-aware character-identity-map FACT block
      // (`buildCharacterIdentityMapBlock`) stays a deterministic, unauthored
      // append here — it is shared verbatim with the planning-time skill
      // call and is out of scope for this work package (Phase 3 of
      // `planning/vertical-drama-skill-first-architecture/plan.md`).
      const gridPromptWithIdentityMap = [
        gridActionResult.prompt,
        angleGridCharacterIdentityMapBlock,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ");

      // Final-prompt QC (hard length cap) — enforced on the FINAL grid
      // prompt (skill-authored prompt + the identity-map fact block), since
      // that concatenated string is what actually gets sent to the provider.
      // No code-authored identity-lock append (no `protectedFragments`
      // either) — see `generateStartFrameImage`'s matching guard/QC block
      // above for the full RC2 rationale.
      const gridPromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: gridPromptWithIdentityMap,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `multi-angle grid prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

      // Product-lock negative-prompt TERM merge (data, not authored prose)
      // stays a deterministic append here — same convention as
      // `generateStartFrameImage`; out of scope for this work package (Phase
      // 3 of the plan referenced above).
      const gridNegativePrompt = mergeProductLockNegativePrompt(
        gridActionResult.negativePrompt,
        productRefUrls.length > 0
      );

      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
          tenantId,
          userId,
          urls: referenceImageUrls,
          traceId: hermesTraceId,
          connectionId: transportDecision.connectionId,
          requireAll: referenceImageUrls.length > 0,
        });
        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: gridPromptQc.prompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
            ...(input.resolution ? { resolution: input.resolution } : {}),
          },
          references,
          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: gridPromptQc.prompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_episode_id: String(episodeId),
            __vd_shot_number: String(input.shotNumber),
            __vd_purpose: "angle_grid",
          },
          droppedReferenceCount,
        });
        return {
          taskId: hermesTask.id,
          modelId: resolvedImageModelId,
          creditCost: 0,
          trimmedProductReferenceCount,
          droppedReferenceCount,
        };
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: gridPromptQc.prompt,
            negativePrompt: gridNegativePrompt || undefined,
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(input.resolution ? { resolution: input.resolution } : {}),
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            // Series provenance tag — see generateStartFrameImage's comment.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
              __vd_shot_number: String(input.shotNumber),
              __vd_purpose: "angle_grid",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source:
                "trpc.verticalDramaEpisodes.generateStartFrameAngleVariations",
              stage: "submission",
            },
          },
          userToken
        );
        return {
          taskId: task.id,
          modelId: resolvedImageModelId,
          creditCost: gridCreditCost,
          trimmedProductReferenceCount,
        };
      } catch (err) {
        if (shouldChargeGridCredits) {
          await refundCredits({
            userId,
            amount: gridCreditCost,
            description: `Refund: multi-angle grid render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Multi-angle grid generation failed to submit",
        });
      }
    }),

  /**
   * Image-to-image repair for one shot's CURRENT approved start-frame image
   * (storyboard-complete plan Phase 6.5) — "fix the existing image" (change
   * wardrobe/background/etc.) rather than regenerating the whole shot from
   * scratch. Loads the shot's `approvedMediaAssetId`, resolves its URL,
   * submits it as the sole `referenceImageUrls` entry alongside an edit
   * instruction + a preservation directive, through the exact same async
   * submit + credit reserve/reconcile path every other Vertical Drama
   * generation mutation uses (`generateImageAsync`, never a new path — see
   * Section 4B). Returns only `{taskId, modelId, creditCost}`; the CLIENT is
   * responsible for showing the result next to the original and calling the
   * existing `setApprovedStartFrameAsset` to actually swap it in — this
   * mutation never auto-replaces the approved asset itself.
   */
  repairShotImage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        instruction: z.string().trim().min(1).max(2000),
        idempotencyKey,
        // Required only when the episode's selected image model is
        // MCP-transport — see `resolveVdMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 7). See
        // `generateStartFrameImage`'s identical field.
        hermesConnectionId: z.string().max(64).optional(),
        // Optional output resolution/size (storyboard-complete plan Phase
        // 6.2b) — same convention as `generateStartFrameImage`.
        resolution: z.string().trim().max(32).optional(),
        softenLevel,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
      if (!plan || !frame) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame plan for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }
      if (!frame.approvedMediaAssetId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber} has no approved image yet — generate and approve a start frame before repairing it`,
        });
      }

      const currentAssetId = Number(frame.approvedMediaAssetId);
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [
        currentAssetId,
      ]);
      const currentUrl = urlsByAssetId.get(currentAssetId);
      if (!currentUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Shot ${input.shotNumber}'s approved image could not be resolved (deleted or inaccessible) — set a new approved image first`,
        });
      }

      // Resolution order (spec Phase 1.2): episode-level selection →
      // `DEFAULT_MODELS` — same resolver every other image mutation uses.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };

      // Require the resolved model to actually accept an image input
      // (`maxReferenceImages >= 1`, e.g. img2img/i2i) OR be an MCP-transport
      // model whose provider supports image input — otherwise the "repair"
      // request would silently be treated as pure text-to-image and ignore
      // the current image entirely, which is worse than failing loudly.
      const capabilities = resolveVerticalDramaCapabilities(
        resolvedImageModelId,
        {
          type: "image",
          configJson: pricingModel.configJson ?? undefined,
        }
      );
      const modelSupportsImageInput =
        (capabilities.maxReferenceImages ?? 0) >= 1;
      const mcpRoute = resolveMcpRouteFromModelId(resolvedImageModelId);
      const modelTransport = resolveMediaModelTransportConfig({
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
      });
      const isMcpImageCapable =
        (modelTransport.transport === "mcp" || Boolean(mcpRoute.providerKey)) &&
        Boolean(input.mcpConnectionId);
      if (!modelSupportsImageInput && !isMcpImageCapable) {
        const imageModels = await getModelsByTypeAsync("image");
        const capableModelNames = imageModels
          .filter(m => {
            const caps = resolveVerticalDramaCapabilities(m.id, {
              type: "image",
              configJson: m.configJson ?? undefined,
            });
            return (caps.maxReferenceImages ?? 0) >= 1 && m.isEnabled !== false;
          })
          .map(m => m.name);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            capableModelNames.length > 0
              ? `The episode's selected image model ("${resolvedImageModelId}") does not accept an image input for repair. Switch the episode's image model to one of: ${capableModelNames.join(", ")}.`
              : `The episode's selected image model ("${resolvedImageModelId}") does not accept an image input for repair, and no other image model in the catalog currently supports image input either.`,
        });
      }

      assertResolutionOption(pricingModel, input.resolution);
      const imageCreditCost = calculateCreditCost(pricingModel, {
        numImages: 1,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
      // entirely — see the matching comment in `generateStartFrameImage`.
      const shouldChargeImageCredits = imageCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09, row 7): resolve
      // the transport-neutral decision BEFORE the credit reserve block below
      // (not after) — see `generateStartFrameImage`'s matching block.
      const transportDecision = await resolveVdMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
        idempotencyKey: input.idempotencyKey,
      });
      const transportMetadata =
        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for image repair. Required: ${imageCreditCost}`,
          });
        }

        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — image repair (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
          sourceType: "media_image",
          idempotencyKey: input.idempotencyKey,
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      // vertical-drama-skill-first-architecture plan, Phase 1 item 2: the
      // `vertical-drama-shot-image-action` skill authors the ENTIRE repair
      // prompt (applying the user's free-text `repair_instruction` to the
      // shot's current prompt while preserving identity/region/product-lock
      // facts) from these ground-truth facts. Code no longer authors any
      // instructional prompt text for this call site.
      const repairRegion = await loadSeriesTargetAudienceRegion(
        tenantId,
        userId,
        seriesId
      );

      // Product lock (spec follow-up to tie-in) — this shot's tie-in product
      // reference(s), if any, must never be redesigned by the repair edit
      // either (e.g. an instruction like "change the lighting" must not also
      // let the model reinterpret the product sitting in frame).
      const repairIsTieInShot = Boolean(frame.productReferenceAssetIds?.length);
      const repairProductLockFacts = await loadSeriesProductTieInFacts(
        tenantId,
        userId,
        seriesId,
        repairIsTieInShot
      );
      const repairCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          frame.requiredCharacterRefs
        );
      // Strip any leftover identity-lock suffix `generateStartFrameImage` may
      // have persisted onto this shot's stored prompt (see
      // `stripExistingIdentityLockSuffix`'s doc comment) before handing it to
      // the skill as scene ground truth — never repeat stale boilerplate back
      // as if it were story content.
      const repairBasePrompt = stripExistingIdentityLockSuffix(
        frame.imagePrompt
      );

      // Content-policy-risk soften level (vertical-drama-skill-first-
      // architecture plan, Phase 1.3) — passed straight through as
      // `softenLevel` on the SAME `generateShotImageAction({action:
      // "repair", ...})` call below, which authors the repair edit AND the
      // soften wording together in one skill call. No separate regex
      // softening pass runs on the skill's result afterward.
      const effectiveSoftenLevel = input.softenLevel ?? 0;

      const {
        generateShotImageAction,
        InsufficientCreditsError: ShotImageActionInsufficientCreditsError,
        VdSchemaValidationError: ShotImageActionSchemaValidationError,
      } = await import("../services/verticalDramaShotImageAction");

      let repairActionResult: { prompt: string; negativePrompt: string };
      try {
        repairActionResult = await generateShotImageAction({
          userId,
          tenantId,
          seriesId,
          action: "repair",
          softenLevel: effectiveSoftenLevel,
          shot: {
            shotNumber: input.shotNumber,
            currentPrompt: repairBasePrompt,
            currentNegativePrompt: frame.negativePrompt ?? "",
          },
          repairInstruction: input.instruction,
          characterReferenceManifest: repairCharacterIdentitySources.map(
            c => ({
              index: null,
              characterId: c.characterKey,
              name: c.name ?? c.characterKey,
            })
          ),
          targetAudienceRegion: {
            code: repairRegion,
            descriptor:
              VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[repairRegion],
          },
          productLock: {
            active: repairIsTieInShot,
            productName: repairProductLockFacts?.productName ?? null,
            productDescription:
              repairProductLockFacts?.productDescription ?? null,
          },
          gridLayout: null,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: image repair prompt authoring failed (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        if (err instanceof ShotImageActionInsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Insufficient credits to author the image repair prompt",
          });
        }
        if (err instanceof ShotImageActionSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to author the image repair prompt — try again",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to author the image repair prompt",
        });
      }

      // The skill already authored the softened wording (if any) as part of
      // the `generateShotImageAction` call above — no separate soften pass
      // runs on its output.
      let softenedRepairPrompt = repairActionResult.prompt;
      let repairNegativePrompt: string | undefined =
        repairActionResult.negativePrompt || undefined;

      // Wave-7D (spec §8.2.2 flow-through rule, `verticalDramaSeriesPresetMixV2`)
      // — same deterministic append `generateStartFrameImage` already does,
      // anchored the same way (before the final prompt-QC step below) so a
      // repair render carries the series' preset visual identity too, not
      // only from-scratch start-frame renders.
      const { presetMixV2Enabled, seriesLookLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        if (presetVisualIdentity) {
          const assembled = applySeriesLookToImagePrompt({
            prompt: softenedRepairPrompt,
            negativePrompt: repairNegativePrompt,
            identity: presetVisualIdentity,
          });
          softenedRepairPrompt = assembled.prompt;
          repairNegativePrompt = assembled.negativePrompt;
        }
      }

      // Final-prompt QC (hard length cap) — enforced on the final repair
      // prompt (`instruction` is already Zod-capped at 2000 chars, but the
      // appended preservation directive can still push it over
      // `VD_IMAGE_PROMPT_MAX` in edge cases; checked here for consistency
      // with every other outgoing image prompt in this router).
      const repairPromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: softenedRepairPrompt,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `image repair prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

      // Feature 135 — Hermes Grok media worker (section 09, row 7): a
      // separate submit path — the sole reference here is `currentUrl` (the
      // shot's current approved image), so this is always `image.edit`.
      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
          tenantId,
          userId,
          urls: [currentUrl],
          traceId: hermesTraceId,
          connectionId: transportDecision.connectionId,
          roleFor: () => "current_image",
          requireAll: true,
        });
        // The current-image reference is MANDATORY for a repair edit — a
        // drop here (see `resolveHermesOrderedRefsFromUrls`'s audit log)
        // leaves `references` empty, which `queueHermesMediaJob`'s contract
        // validation then rejects (`image.edit` requires >= 1 reference) —
        // fails loud, never silently downgrades to `image.generate`.
        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: "image.edit",
          connectionId: transportDecision.connectionId,
          prompt: repairPromptQc.prompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
            ...(input.resolution ? { resolution: input.resolution } : {}),
          },
          references,
          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: repairPromptQc.prompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_episode_id: String(episodeId),
            __vd_shot_number: String(input.shotNumber),
            __vd_purpose: "repair",
          },
          droppedReferenceCount,
        });
        return {
          taskId: hermesTask.id,
          modelId: resolvedImageModelId,
          creditCost: 0,
        };
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: repairPromptQc.prompt,
            negativePrompt: repairNegativePrompt,
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            referenceImageUrls: [currentUrl],
            ...(input.resolution ? { resolution: input.resolution } : {}),
            // Series provenance tag — see generateStartFrameImage's comment.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
              __vd_shot_number: String(input.shotNumber),
              __vd_purpose: "repair",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.repairShotImage",
              stage: "submission",
            },
          },
          userToken
        );
        return {
          taskId: task.id,
          modelId: resolvedImageModelId,
          creditCost: imageCreditCost,
        };
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: image repair failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Image repair generation failed to submit",
        });
      }
    }),

  /**
   * Submit a single video clip's render via the episode-selected video model
   * — the paid render for ONE `motionPromptPack.clips[]` entry. Async submit
   * only (Section 4B hard constraint): returns a `taskId` immediately; the
   * caller polls `media.getTask` exactly like every other real image/video
   * generation in the app, then finalizes via the existing
   * `resolveMediaAssetForImport` + a future "set approved clip asset"
   * mutation, mirroring `generateStartFrameImage`'s finalize convention.
   * Generating multiple clips is the caller's responsibility — submit one
   * `generateVideoClip` call per clip and poll each task independently
   * (never sequential/blocking waits here, per Section 4B).
   *
   * Wires together this wave's three new pieces:
   *  - the episode's selected video model (`resolveEpisodeVideoModel`)
   *  - the shot's linked reference images
   *    (`verticalDramaShotReferencesService`, trimmed to the model's
   *    `maxReferenceImages` by `sortOrder` — lowest sortOrder kept first;
   *    the trimmed count is returned so the client can surface a warning)
   *  - the model-aware prompt formatter (`formatVideoClipRequest`) for
   *    dialogue embedding / TTS-fallback signaling
   *
   * Never a new generation path: submission goes through the SAME
   * `mediaGenerationService.generateVideoAsync` + credit reserve/reconcile
   * mechanism `generateStartFrameImage` already uses for images.
   */
  generateVideoClip: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        clipNumber: z.number().int().positive(),
        // Required only when the episode's selected video model is
        // MCP-transport — see `resolveVdMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 9).
        // Required only when the resolved model is Hermes-transport and the
        // caller has no default Hermes connection for video.
        hermesConnectionId: z.string().max(64).optional(),
        // Optional output resolution (storyboard-complete plan Phase
        // 6.2b) — e.g. "720p"/"1080p"/"4K" per Veo's tiers. Same convention
        // as `generateStartFrameImage`.
        resolution: z.string().trim().max(32).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for video generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const clip = pack?.clips?.find(c => c.clipNumber === input.clipNumber);
      if (!pack || !clip) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No motion prompt for clip ${input.clipNumber} yet — generate the video motion prompt pack first`,
        });
      }
      const artifactStatus = storyboardArtifactStatus(pack, row.storyboard);
      if (artifactStatus === "stale") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Storyboard changed after this video prompt was created. Regenerate the prompt before paid video generation.",
        });
      }
      if (!clip.prompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Clip ${input.clipNumber} has no motion prompt yet`,
        });
      }

      // Wave-4A (spec §13.1) tie-in gate — REJECT paid video-clip render for
      // a tie-in-carrying shot when the latest tie-in quality report is
      // failing or missing (VD_TIE_IN_BELOW_FLOOR). No-op for non-tie-in
      // shots/episodes, or when `verticalDramaSeriesTieInQc` is off.
      const {
        tieInQcEnabled,
        presetMixV2Enabled,
        seriesLookLockEnabled,
        qualityLoopV2Enabled,
      } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      await assertTieInQualityGatePassed({
        owner: { tenantId, userId, seriesId, episodeId },
        tieInQcEnabled,
        script: row.script as Record<string, unknown> | null,
        shotNumbers: clip.sourceShotNumbers,
      });

      // Wave-7D (spec §16.1 acceptance) — best-effort expert-mode quality-
      // floor-override audit record; never blocks. See
      // `maybeRecordQualityFloorOverrideAudit`'s doc comment.
      if (qualityLoopV2Enabled) {
        const videoClipQualityPolicy = await loadVerticalDramaQualityPolicy(
          tenantId,
          userId,
          seriesId
        );
        await maybeRecordQualityFloorOverrideAudit({
          owner: { tenantId, userId, seriesId, episodeId },
          policy: videoClipQualityPolicy,
          source: "trpc.verticalDramaEpisodes.generateVideoClip",
        });
      }

      // FAIL CLOSED: this is a paid, user-clicked action — require an
      // explicit episode-level video model selection before generating.
      // `resolveEpisodeVideoModel` itself stays tolerant (falls back to
      // `DEFAULT_MODELS.video`) because it's shared with text-only
      // capability lookups (`generateShotVideoPrompt`,
      // `regenerateClipDialogue`), so the fail-closed check is enforced
      // here instead, explicitly, only for the paid render.
      if (!pack.selectedVideoModelId?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง / Select a video model before generating.",
        });
      }
      const model = await resolveEpisodeVideoModel(pack);

      // Shot references (Phase 2.6): gather the clip's shot(s) linked
      // reference images, trimmed to this model's `maxReferenceImages` by
      // `sortOrder` (lowest kept first) — never silently drop without
      // reporting: `trimmedReferenceCount` is always returned.
      const primaryShotNumber =
        clip.parentShotNumber ?? clip.sourceShotNumbers[0];
      const shotReferences = primaryShotNumber
        ? await verticalDramaShotReferencesService.listForShot(
            { tenantId, userId, seriesId },
            episodeId,
            primaryShotNumber
          )
        : [];

      // Location reference (Phase E of `planning/polished-toasting-gadget.md`
      // — location visual bible) — this clip's environment-lock reference
      // asset, resolved from the primary shot's location: the per-shot
      // override (`startFramePlan.frames[].locationKey`, Phase D) first, else
      // the storyboard's own `distinct_locations[]` grouping — same
      // precedence `resolveShotLocationReferenceEntry` uses for start-frame
      // image generation, via the shared `resolveEffectiveShotLocationKey`.
      // Tolerant/zero-DB-calls when the shot has no resolved location (no
      // override AND no matching storyboard group) — every pre-existing
      // `generateVideoClip` test fixture (none of which carry `storyboard`/
      // `startFramePlan` fields) stays byte-identical.
      const primaryStartFrame = primaryShotNumber
        ? (row.startFramePlan as VerticalDramaStartFramePlan | null)?.frames?.find(
            f => f.shotNumber === primaryShotNumber
          )
        : undefined;
      const clipLocationOverrideKey = primaryStartFrame?.locationKey;
      const clipLocationIdentity = primaryShotNumber
        ? resolveEffectiveShotLocationIdentity(
            row.storyboard,
            primaryShotNumber,
            clipLocationOverrideKey
          )
        : undefined;
      const clipLocationAssetId = await resolveShotLocationReferenceAssetId(
        tenantId,
        userId,
        seriesId,
        clipLocationIdentity
      );

      const capabilities = resolveVerticalDramaCapabilities(model.id, {
        type: model.type,
        aspectRatios: model.aspectRatios,
        configJson: model.configJson,
      });
      const maxReferenceImages = capabilities.maxReferenceImages ?? 0;
      const approvedStartFrameAssetId = Number(
        primaryStartFrame?.approvedMediaAssetId
      );
      const projectedStartFrameAssetId = Number(clip.startFrameAssetId);
      // `startFramePlan` is the authoritative approval record. A clip is a
      // generated projection and can be missing or stale after per-shot
      // prompt replacement or after the user approves a newer image.
      // Resolve authority again at the paid-render boundary so slot 1 can
      // never fall back to `previous_main` while a current approved frame
      // exists. Legacy clips still use their projected id when the plan has
      // no approved frame.
      const startFrameAssetId =
        Number.isInteger(approvedStartFrameAssetId) &&
        approvedStartFrameAssetId > 0
          ? approvedStartFrameAssetId
          : Number.isInteger(projectedStartFrameAssetId) &&
              projectedStartFrameAssetId > 0
            ? projectedStartFrameAssetId
            : undefined;
      // Reference-mapping fix Phase 5b (`vd-start-frame-reference-mapping/
      // plan.md`) — WHY this budget is `maxReferenceImages - 1` (not
      // `maxReferenceImages`) whenever a start frame is present: the start
      // frame is resolved and prepended to `idsToResolve` SEPARATELY, below,
      // so from THIS point on it reads like it has its own "free" slot. It
      // does NOT. `mediaGenerationService.generateVideoAsync` ->
      // `resolveReferenceImageUrlsForModel` ->
      // `getReferenceImageLimitForModel`/`getReferenceImageLimitFromConfig`
      // (mediaProviderUtils.ts) slices the FINAL COMBINED
      // `referenceImageUrls` array — start frame included — down to this
      // exact same model's `configJson.maxReferenceImages`. Before this fix,
      // extras were budgeted with the full `maxReferenceImages`, so
      // `idsToResolve.length` could reach `1 (start frame) + maxReferenceImages`
      // — one over the service's real cap — and the service would silently
      // drop the LAST entry (per the priority ordering below, usually the
      // location reference) at submission time, while `trimmedReferenceCount`
      // (returned to the client for the UI warning) still reported the
      // router's smaller, wrong trim count. Budgeting extras to
      // `maxReferenceImages - (startFrame present ? 1 : 0)` here makes the
      // router's own count match what the service will actually keep, so
      // nothing is silently dropped downstream and the reported count is
      // accurate. Byte-identical to the pre-fix behavior for every clip with
      // no `startFrameAssetId` (the `- 1` term is 0).
      const extraReferenceBudget = Math.max(
        0,
        maxReferenceImages - (startFrameAssetId ? 1 : 0)
      );
      // Speaker-switch consolidated clips (2026-07-11 redesign) carry one
      // portrait per additional speaker in `clip.extraReferenceAssetIds`
      // (ordered by priority, anchor speaker already covered by
      // `startFrameAssetId` below) — merged IN FRONT OF the shot-level
      // manual reference list so they're kept first when trimmed to this
      // model's `extraReferenceBudget`. A clip without the field (every clip
      // predating this task, and every non-speaker-switch clip) behaves
      // byte-identically: `?? []` contributes nothing.
      const manualReferenceAssetIds = [
        ...(clip.extraReferenceAssetIds ?? []).map(id => Number(id)),
        ...shotReferences
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(r => Number(r.mediaAssetId)),
      ];

      // Reference-mapping fix Phase 5c (`vd-start-frame-reference-mapping/
      // plan.md`) — best-effort auto-attach of this clip's REQUIRED
      // characters' primary-portrait asset ids, so a multi-image-reference
      // model gets identity-lock coverage for every character the clip's
      // source shot(s) actually need — not only the anchor speaker riding
      // `startFrameAssetId`/the switch-portrait `extraReferenceAssetIds`
      // pair above (that pair only covers characters who SPEAK during a
      // speaker switch; a silent/non-speaking required character, or a clip
      // whose motion pack predates the 2026-07-11 speaker-switch redesign,
      // gets none of that coverage otherwise). Gated on
      // `maxReferenceImages > 1` — a single-reference-image model (Grok
      // Imagine's `grok-imagine-video-1.5`, `maxReferenceImages: 1`) has NO
      // room for anything beyond the start frame; that model's single start
      // frame already carries 100% of identity (see plan.md Phase 5
      // research), so this block must stay a complete no-op there —
      // `remainingPortraitSlots` below is `<= 0` whenever
      // `extraReferenceBudget <= 1`, but the outer `maxReferenceImages > 1`
      // guard makes that explicit and byte-identical for Grok regardless of
      // how many manual/speaker-switch refs are already present. Fills only
      // whatever slots remain in `extraReferenceBudget` AFTER the
      // speaker-switch + manual shot references above (never displaces a
      // user-chosen reference), and is itself placed BEFORE the location
      // reference below — the image-reference-path convention documented at
      // `resolveShotCharacterReferenceEntries`'s "identity before
      // environment" priority applies here too, so a tight budget drops the
      // location before it ever drops a character portrait. Best-effort: a
      // DB/lookup failure here must never fail a paid render — caught below
      // and logged, same "log and continue" convention as this router's
      // other non-blocking enrichment steps (e.g.
      // `maybeBuildAndPersistTieInQualityReport`'s call site).
      let characterPortraitReferenceAssetIds: number[] = [];
      if (maxReferenceImages > 1) {
        const remainingPortraitSlots =
          extraReferenceBudget - manualReferenceAssetIds.length;
        if (remainingPortraitSlots > 0) {
          try {
            const alreadyReferencedAssetIds = new Set([
              ...(startFrameAssetId ? [startFrameAssetId] : []),
              ...manualReferenceAssetIds,
            ]);
            const requiredPortraitAssetIds =
              await resolveClipRequiredCharacterPortraitAssetIds(
                tenantId,
                userId,
                seriesId,
                row.startFramePlan as VerticalDramaStartFramePlan | null,
                clip.sourceShotNumbers
              );
            characterPortraitReferenceAssetIds = requiredPortraitAssetIds
              .filter(id => !alreadyReferencedAssetIds.has(id))
              .slice(0, remainingPortraitSlots);
          } catch (err) {
            debugError(
              "verticalDramaEpisodes.generateVideoClip",
              `resolveClipRequiredCharacterPortraitAssetIds failed (episodeId=${episodeId}, clipNumber=${input.clipNumber}) — continuing without auto-attached portraits`,
              err
            );
          }
        }
      }

      // The location reference (if any) is appended LAST — lower priority
      // than the start frame (always kept, resolved separately below) and
      // every character/shot/portrait reference above, so it is the FIRST
      // thing trimmed away once a model's `extraReferenceBudget` caps out.
      const orderedReferenceAssetIds = [
        ...manualReferenceAssetIds,
        ...characterPortraitReferenceAssetIds,
        ...(clipLocationAssetId ? [clipLocationAssetId] : []),
      ];
      const trimmedReferenceCount = Math.max(
        0,
        orderedReferenceAssetIds.length - extraReferenceBudget
      );
      const keptReferenceAssetIds =
        extraReferenceBudget > 0
          ? orderedReferenceAssetIds.slice(0, extraReferenceBudget)
          : [];

      // Resolve the approved start frame + kept reference assets to URLs in
      // one batch. The approved start frame goes first in the array so a
      // model that only reads `referenceImageUrls[0]` as its start/first
      // frame (the generic "market" dispatch convention — see
      // `modelRegistry.ts`'s `grok-imagine-video-1-5-preview`/HappyHorse
      // entries) still gets the right image first.
      const idsToResolve = [
        ...(startFrameAssetId ? [startFrameAssetId] : []),
        ...keptReferenceAssetIds,
      ];
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(
        tenantId,
        userId,
        idsToResolve
      );
      const referenceImageUrls = idsToResolve
        .map(id => urlsByAssetId.get(id))
        .filter((u): u is string => Boolean(u));

      // Dialogue (Phase 3.1/3.3): resolve this clip's dialogue lines (synced
      // onto `clip.dialogue` by `syncDialogueOntoMotionPromptClips` when the
      // motion pack was generated) and format the final model-aware prompt.
      const dialogueLines: VerticalDramaClipDialogueLine[] = (
        clip.dialogue ?? []
      ).map(d => ({
        characterKey: d.characterKey,
        lineTh: d.lineTh,
        emotion: d.emotion,
        delivery: d.delivery,
        subtext: d.subtext,
      }));
      // Lip-sync discipline fix — resolve each distinct speaker's roster
      // display name for the native-audio dialogue block (no roster is
      // otherwise loaded in this mutation, unlike `generateShotVideoPrompt`,
      // so this is the one targeted/minimal query added for this fix — kept
      // to just the distinct `characterKey`s this clip's dialogue actually
      // uses). Falls back to bare `characterKey` for any speaker with no
      // roster row/name.
      const videoClipDialogueCharacterKeys = Array.from(
        new Set(
          dialogueLines
            .map(d => d.characterKey)
            .filter((k): k is string => Boolean(k))
        )
      );
      const videoClipCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          videoClipDialogueCharacterKeys
        );
      const videoClipCharacterNameByKey = new Map(
        videoClipCharacterIdentitySources
          .filter((c): c is typeof c & { name: string } => Boolean(c.name))
          .map(c => [c.characterKey, c.name])
      );
      const dialogueLinesWithSpeakerNames: VerticalDramaClipDialogueLine[] =
        dialogueLines.map(l => ({
          ...l,
          speakerName: l.characterKey
            ? videoClipCharacterNameByKey.get(l.characterKey)
            : undefined,
        }));
      const formatted = formatVideoClipRequest({
        clip: {
          clipNumber: clip.clipNumber,
          prompt: clip.prompt,
          negativeMotionPrompt: clip.negativeMotionPrompt,
          durationSeconds: clip.durationSeconds,
          startFrameAssetId: startFrameAssetId
            ? String(startFrameAssetId)
            : undefined,
          endFrameAssetId: clip.endFrameAssetId,
          // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
          // option) — appended onto the final prompt by the formatter
          // itself when present; `undefined` for every clip that never
          // opted in, so this stays additive.
          audioDirection: clip.audioDirection,
        },
        dialogueLines: dialogueLinesWithSpeakerNames,
        dialogueLanguage: pack.dialogueLanguage,
        thaiAccent: pack.thaiAccent,
        modelId: model.id,
        model,
        aspectRatio: "9:16",
      });

      // Dialogue-duplication fix (2026-07-15) — protect each individual
      // spoken line, not the `buildNativeDialogueVerbatimBlock` boilerplate
      // block. See the sub-shots path's identical fix (near
      // `speakerSwitchGeneration.dialogue` above) for the full rationale.
      // Shared by both QC passes below (base formatted prompt + final
      // provider prompt) since both protect the same dialogue lines.
      const videoClipDialogueLineFragments =
        capabilities.nativeAudioDialogue === true
          ? dialogueLinesWithSpeakerNames
              .map(l => l.lineTh.trim())
              // BARE, UNQUOTED line text (see the sub-shots site's comment):
              // a straight-quoted fragment never matches the refiner's
              // curly-quoted inline dialogue and gets wrongly re-appended.
              .filter(Boolean)
          : undefined;

      // Final-prompt QC (hard length cap) — the formatter folds
      // dialogue/delivery/acting direction text INTO `clip.prompt`, so the
      // final string must be re-checked here (the base motion prompt alone
      // may already be within cap, but the formatted result can exceed it).
      // Zero-cost no-op when the formatted prompt is already within
      // `VD_VIDEO_PROMPT_MAX`.
      const videoPromptQc = await ensurePromptWithinLimit({
        kind: "video",
        prompt: formatted.prompt,
        protectedFragments: videoClipDialogueLineFragments,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `video clip prompt (episode #${episodeId}, clip ${input.clipNumber})`,
      });
      formatted.prompt = videoPromptQc.prompt;

      // Wave-4A (spec §8.2.2 flow-through rule, `verticalDramaSeriesPresetMixV2`)
      // — deterministically append the series' preset visual identity's
      // styleName/lighting as motion-prompt style tokens, when present.
      // `verticalDramaVideoMotionPromptGeneration.ts` is ALREADY statically
      // imported above (and already fully mocked by every existing test of
      // this router), so this is a plain function call, not a dynamic
      // import — see `appendPresetVisualIdentityStyleTokensToMotionPrompt`'s
      // own doc comment for the deterministic-append rationale.
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        if (presetVisualIdentity) {
          formatted.prompt =
            appendPresetVisualIdentityStyleTokensToMotionPrompt(
              formatted.prompt,
              presetVisualIdentity
            );
        }
      }

      // Provider-ready post-condition: re-check after every formatter/style
      // transform so native dialogue cannot be dropped at the last boundary.
      const finalProviderPromptQc = await ensurePromptWithinLimit({
        kind: "video",
        prompt: formatted.prompt,
        protectedFragments: videoClipDialogueLineFragments,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:final-prompt-qc`
          : undefined,
        label: `final provider video prompt (episode #${episodeId}, clip ${input.clipNumber})`,
      });
      formatted.prompt = finalProviderPromptQc.prompt;

      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, model.id))
        .limit(1);
      const videoPricingModel = pricingRow ?? {
        creditCost: model.creditCost ?? 10,
        configJson: model.configJson ?? null,
      };
      // Validate + recompute cost when the model has a resolution-tiered
      // matrix (storyboard-complete plan Phase 6.2b, e.g. Veo 3.1's
      // 720p/1080p/4K tiers) — previously this always used the model's flat
      // `creditCost` regardless of resolution, silently under/over-charging
      // relative to the tier actually requested downstream.
      assertResolutionOption(videoPricingModel, input.resolution);
      const videoCreditCost = calculateCreditCost(videoPricingModel, {
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
      // entirely — see the matching comment in `generateStartFrameImage`.
      const shouldChargeVideoCredits = videoCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09, row 9): resolve
      // the transport-neutral decision BEFORE the credit reserve block below
      // (not after) — structurally guarantees "no platform-credit reserve
      // for hermes" regardless of what a misconfigured catalog row's
      // `creditCost` might be, rather than relying solely on the zero-cost
      // convention holding true.
      const transportDecision = await resolveVdMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "video",
        modelId: model.id,
        configJson: pricingRow?.configJson ?? model.configJson ?? null,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
        idempotencyKey: input.idempotencyKey,
      });
      const transportMetadata =
        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;

      if (transportDecision.kind !== "hermes" && shouldChargeVideoCredits) {
        const hasCredits = await hasEnoughCredits(userId, videoCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for video clip render. Required: ${videoCreditCost}`,
          });
        }

        // Reserve credits BEFORE starting the task — same convention as
        // `generateStartFrameImage` (`media.getTask` reconciles the
        // reservation against actual usage once the task completes/fails).
        await deductCredits({
          userId,
          tenantId,
          amount: videoCreditCost,
          description: `Vertical Drama — video clip render (episode #${episodeId}, clip ${input.clipNumber}, reserved)`,
          sourceType: "media_video",
          idempotencyKey: input.idempotencyKey,
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            clipNumber: input.clipNumber,
            type: "reservation",
            creditCost: videoCreditCost,
            modelId: model.id,
          },
        });
      }

      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
        const { buildHermesMediaReferences, buildHermesMediaTaskEnvelope } = await import(
          "../services/hermesMediaReferences"
        );
        const { effectiveHermesCapability } = await import("../../shared/hermesMedia");
        const { getHermesConnection } = await import("../services/hermesConnectionService");

        // Reference trimming via effective capability (§4.5): intersect the
        // model row's own `maxReferenceImages` (already reflected in
        // `idsToResolve`'s length via `extraReferenceBudget` above) with the
        // CONNECTION's own capability manifest — e.g. Grok i2v's manifest
        // caps `video.image_to_video` at 1, so only the start frame (index 0
        // of the "identity before environment" assembly order) survives.
        const connection = await getHermesConnection({
          tenantId,
          userId,
          connectionId: transportDecision.connectionId,
        });
        const effective = effectiveHermesCapability(
          { maxReferences: maxReferenceImages },
          connection.capabilities,
          "video.image_to_video",
        );
        const hermesIdsToResolve =
          typeof effective.maxReferences === "number"
            ? idsToResolve.slice(0, effective.maxReferences)
            : idsToResolve;
        const orderedRefs = hermesIdsToResolve.map((id, idx) => ({
          assetId: String(id),
          role: idx === 0 && startFrameAssetId ? "start_frame" : "reference",
          label: `Image-${idx + 1}`,
        }));
        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: model.id,
            configJson: pricingRow?.configJson ?? model.configJson ?? null,
          }).providerModelId ?? model.id;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: "video.image_to_video",
          connectionId: transportDecision.connectionId,
          prompt: formatted.prompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            durationSeconds: clip.durationSeconds ?? null,
            ...(input.resolution ? { resolution: input.resolution } : {}),
          },
          references,
          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.clipNumber}` },
          traceId: crypto.randomUUID(),
          tenantId,
          requestedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "video",
          model: hermesProviderModelId,
          prompt: formatted.prompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_episode_id: String(episodeId),
            __vd_clip_number: String(input.clipNumber),
          },
        });
        return {
          taskId: hermesTask.id,
          modelId: model.id,
          creditCost: 0,
          providerFamily: formatted.providerFamily,
          ttsFallback: formatted.ttsFallback,
          ttsLines: formatted.ttsLines,
          trimmedReferenceCount: Math.max(0, idsToResolve.length - hermesIdsToResolve.length) + trimmedReferenceCount,
        };
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateVideoAsync(
          {
            prompt: formatted.prompt,
            model: model.id,
            duration: clip.durationSeconds,
            aspectRatio: "9:16",
            ...(input.resolution ? { resolution: input.resolution } : {}),
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            extraParams: {
              generate_audio: formatted.generateAudio,
              ...(formatted.negativePrompt
                ? { negative_prompt: formatted.negativePrompt }
                : {}),
              // Series provenance tag — see generateStartFrameImage's comment.
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
              // Clip-level provenance is required because speaker-aware shot
              // splitting can produce several clips for one source shot
              // (301/302/303). It lets media history/recovery map a completed
              // task back to the exact persisted motion-pack entry.
              __vd_clip_number: String(input.clipNumber),
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.generateVideoClip",
              stage: "submission",
            },
          },
          userToken
        );
        return {
          taskId: task.id,
          modelId: model.id,
          creditCost: videoCreditCost,
          providerFamily: formatted.providerFamily,
          ttsFallback: formatted.ttsFallback,
          ttsLines: formatted.ttsLines,
          trimmedReferenceCount,
        };
      } catch (err) {
        if (shouldChargeVideoCredits) {
          await refundCredits({
            userId,
            amount: videoCreditCost,
            description: `Refund: video clip render failed to submit (episode #${episodeId}, clip ${input.clipNumber})`,
            sourceType: "media_video",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              clipNumber: input.clipNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Video clip generation failed to submit",
        });
      }
    }),

  /* ------------------------------------------------------------------------ */
  /* W12-A voice chain — whole-episode dialogue TTS batch                     */
  /* ------------------------------------------------------------------------ */

  /**
   * Submit ONE async TTS task PER LINE for the episode's persisted dialogue-
   * audio plan (`separateTtsPlan.items[]`) — whole-episode batch, W12-A voice
   * chain wave. NEVER a new generation path: each line goes through the SAME
   * `mediaGenerationService.generateAudioAsync` + credit reserve/reconcile
   * mechanism `generateVideoClip` above and `previewCharacterVoice`
   * (`verticalDramaCharacters.ts`) already use.
   *
   * Resumable — a line already carrying a pending or completed `audioTask`
   * is skipped (`selectPendingDialogueAudioLines`); re-running this mutation
   * after a partial failure (or a page reload mid-batch) only submits what
   * is still missing.
   *
   * Persists each submitted line's `{audioTask: {pendingTaskId}}` directly
   * onto `dialogueAudioPlan.separateTtsPlan.items[]` — mirroring
   * `clip.videoTask`'s exact field naming/shape (see
   * `VerticalDramaSeparateTtsPlanItem.audioTask`'s doc comment in
   * `@shared/verticalDramaSeries/audio`) — so the client's existing
   * submit -> poll `media.getTask` -> `updateEpisodeDraft` persist-on-
   * completion convention applies completely unchanged for audio.
   *
   * Credit math: `creditEstimate` is the SUM of each pending line's own
   * resolved-voice-model cost (`estimateDialogueAudioBatchCreditCost`) — a
   * strict generalization of "pendingLines × per-line estimate" that
   * degenerates to exactly that formula when every line shares one model,
   * and stays correct when characters are cast to different providers/
   * models within the same episode. Checked once, up front (FORBIDDEN,
   * nothing submitted, when unaffordable) — mirrors `media.generateAudioAsync`'s
   * check-then-reserve convention. Each line THEN reserves credits
   * individually, atomically, right before its own submit call, so a
   * mid-batch failure (one line's provider error, or a balance change
   * between the pre-check and that line's turn) only affects that one line:
   * its reservation is refunded, every OTHER already-submitted line's task
   * is kept, and the loop continues through the remaining lines
   * (best-effort full-batch submission, not stop-on-first-failure).
   */
  generateEpisodeDialogueAudio: verticalDramaVoiceChainProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for dialogue audio generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan =
        row.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null;
      if (!plan?.separateTtsPlan) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No dialogue/audio plan with a separate-TTS strategy exists for this episode yet — plan dialogue audio first.",
        });
      }

      const pendingItems = selectPendingDialogueAudioLines(plan);
      const skippedCount =
        plan.separateTtsPlan.items.length - pendingItems.length;

      if (pendingItems.length === 0) {
        return {
          submittedCount: 0,
          skippedCount,
          taskIds: [] as string[],
          creditEstimate: 0,
        };
      }

      // Batch-load pricing for every DISTINCT voice model referenced by the
      // pending lines (characters may be cast to different providers/models
      // within the same episode) — ONE query, never N.
      const distinctModelIds = [
        ...new Set(
          pendingItems
            .map(item => item.voiceModelId)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      type DialogueAudioPricingRow = {
        modelId: string;
        creditCost: number;
        configJson: Record<string, unknown> | null;
      };
      const pricingRows: DialogueAudioPricingRow[] = distinctModelIds.length
        ? await db
            .select({
              modelId: mediaModels.modelId,
              creditCost: mediaModels.creditCost,
              configJson: mediaModels.configJson,
            })
            .from(mediaModels)
            .where(inArray(mediaModels.modelId, distinctModelIds))
        : [];
      const pricingByModelId = new Map<
        string,
        { creditCost: number; configJson: Record<string, unknown> | null }
      >(
        pricingRows.map(pricingRow => [
          pricingRow.modelId,
          {
            creditCost: pricingRow.creditCost,
            configJson: pricingRow.configJson,
          },
        ])
      );

      const creditEstimate = estimateDialogueAudioBatchCreditCost(
        pendingItems,
        pricingByModelId
      );
      if (creditEstimate > 0) {
        const hasCredits = await hasEnoughCredits(userId, creditEstimate);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for dialogue audio batch (${pendingItems.length} line(s)). Required: ${creditEstimate}`,
          });
        }
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      const submittedTaskIds: string[] = [];
      const failures: Array<{ lineId: string; error: string }> = [];
      const updatedItems = plan.separateTtsPlan.items.map(item => ({
        ...item,
      }));

      for (const item of pendingItems) {
        const lineCost = estimateDialogueAudioBatchCreditCost(
          [item],
          pricingByModelId
        );
        const shouldChargeLine = lineCost > 0;
        const lineIdempotencyKey = input.idempotencyKey
          ? `${input.idempotencyKey}:line:${item.lineId}`
          : undefined;

        if (shouldChargeLine) {
          try {
            await deductCredits({
              userId,
              tenantId,
              amount: lineCost,
              description: `Vertical Drama — dialogue audio line (episode #${episodeId}, line ${item.lineId}, reserved)`,
              sourceType: "media_audio",
              idempotencyKey: lineIdempotencyKey,
              metadata: {
                feature: "vertical_drama_dialogue_audio",
                seriesId,
                episodeId,
                lineId: item.lineId,
                type: "reservation",
                creditCost: lineCost,
                modelId: item.voiceModelId,
              },
            });
          } catch (err) {
            failures.push({
              lineId: item.lineId,
              error:
                err instanceof Error ? err.message : "Insufficient credits",
            });
            continue;
          }
        }

        try {
          const task = await mediaGenerationService.generateAudioAsync(
            {
              text: item.text,
              model: item.voiceModelId,
              voice: item.voiceId,
              publicUrl: ctx.publicUrl ?? undefined,
              auditContext: {
                userId,
                traceId: crypto.randomUUID(),
                source:
                  "trpc.verticalDramaEpisodes.generateEpisodeDialogueAudio",
                stage: "submission",
              },
            },
            userToken
          );
          submittedTaskIds.push(task.id);
          const idx = updatedItems.findIndex(i => i.lineId === item.lineId);
          if (idx >= 0) {
            updatedItems[idx] = {
              ...updatedItems[idx],
              audioTask: { pendingTaskId: task.id },
            };
          }
        } catch (err) {
          if (shouldChargeLine) {
            await refundCredits({
              userId,
              amount: lineCost,
              description: `Refund: dialogue audio line failed to submit (episode #${episodeId}, line ${item.lineId})`,
              sourceType: "media_audio",
              metadata: {
                feature: "vertical_drama_dialogue_audio",
                seriesId,
                episodeId,
                lineId: item.lineId,
              },
            });
          }
          failures.push({
            lineId: item.lineId,
            error: err instanceof Error ? err.message : "Failed to submit",
          });
        }
      }

      if (submittedTaskIds.length > 0) {
        const updatedPlan: VerticalDramaDialogueAudioPlan = {
          ...plan,
          separateTtsPlan: { ...plan.separateTtsPlan, items: updatedItems },
        };
        await db
          .update(verticalDramaEpisodes)
          .set({ dialogueAudioPlan: updatedPlan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          );
      }

      return {
        submittedCount: submittedTaskIds.length,
        skippedCount,
        taskIds: submittedTaskIds,
        creditEstimate,
        ...(failures.length > 0 ? { failures } : {}),
      };
    }),

  /**
   * Regenerate ONE shot's start-frame image prompt via the
   * `vertical-drama-shot-start-frame-prompt` skill
   * (`generateStartFrameShotPrompt`, `verticalDramaStartFrameGeneration.ts`)
   * — the fix for the "ให้ AI ปรับ" (AI-adjust) button next to a shot's
   * start-frame prompt (planning/`polished-toasting-gadget.md` Fix A;
   * previously completely non-functional — that button routed through the
   * generic `repairStageOutput` -> `verticalDramaEpisodePipeline.repairStage()`
   * dispatcher, which has no real-LLM branch for `start_frame_render_plan`
   * and silently fell through to a dry-run placeholder that never called an
   * LLM and never persisted to the live episode column).
   *
   * Bypasses `repairStageOutput`/`repairStage` entirely (both stay
   * completely untouched) — mirrors the exact shape `generateShotVideoPrompt`
   * below already uses for the equivalent `video_motion_prompt_pack` fix: a
   * dedicated single-shot skill + service function + router procedure,
   * persisting onto ONE frame inside `startFramePlan.frames[]` via a
   * `db.transaction(...).for("update")` row-lock + fresh re-read
   * immediately before merging (same 2026-07-11 lost-update-race-fix shape
   * `generateShotVideoPrompt` uses for `motionPromptPack.clips[]`). When the
   * requested frame does not exist yet, this procedure materializes only
   * that frame from the persisted storyboard facts; the per-shot UI never
   * needs to run the long whole-episode start-frame planning stage first.
   */
  generateShotStartFramePrompt: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        instruction: z.string().trim().max(4000).optional(),
        /** Latest Overview shot summary; passed raw to the skill as its authoritative source. */
        canonicalShotSummary: z.string().trim().max(2000).optional(),
        attachShotImage: z.boolean().optional().default(true),
        imageUrl: z.string().optional(),
        additionalImageUrls: z
          .array(z.string().url().startsWith("http"))
          .max(3)
          .optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const existingPlan =
        row.startFramePlan as VerticalDramaStartFramePlan | null;
      const basePlan: VerticalDramaStartFramePlan =
        existingPlan && Array.isArray(existingPlan.frames)
          ? existingPlan
          : {
              mode: "single_frame_per_shot",
              selectedImageModelId: "",
              frames: [],
            };
      const storyboardShots = Array.isArray(
        (row.storyboard as Record<string, unknown> | null)?.shots
      )
        ? (((row.storyboard as Record<string, unknown>).shots ?? []) as Array<
            Record<string, unknown>
          >)
        : [];
      const storyboardShot = storyboardShots.find(
        shot =>
          Number(shot.shot_number ?? shot.shotNumber) === input.shotNumber
      );
      const storyboardCharacterRefs = Array.isArray(
        storyboardShot?.required_character_refs
      )
        ? (storyboardShot.required_character_refs as unknown[])
        : Array.isArray(storyboardShot?.characters)
          ? (storyboardShot.characters as unknown[])
          : Array.isArray(storyboardShot?.characterIds)
            ? (storyboardShot.characterIds as unknown[])
            : [];
      const frame = basePlan.frames.find(
        f => f.shotNumber === input.shotNumber
      ) ?? {
        shotNumber: input.shotNumber,
        imagePrompt: "",
        negativePrompt: "",
        requiredCharacterRefs: Array.from(
          new Set(
            storyboardCharacterRefs
              .map(value => String(value).trim())
              .filter(Boolean)
          )
        ),
        productReferenceAssetIds: [],
      };

      // Resolve region/product-lock/character-identity facts — the SAME
      // router-private helpers `repairShotImage`/
      // `generateStartFrameAngleVariations` already use for the equivalent
      // facts (do not re-derive equivalent DB queries).
      const shotStartFramePromptRegion = await loadSeriesTargetAudienceRegion(
        tenantId,
        userId,
        seriesId
      );
      const shotStartFramePromptIsTieInShot = Boolean(
        frame.productReferenceAssetIds?.length
      );
      const shotStartFramePromptProductLockFacts =
        await loadSeriesProductTieInFacts(
          tenantId,
          userId,
          seriesId,
          shotStartFramePromptIsTieInShot
        );
      const shotStartFramePromptCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          frame.requiredCharacterRefs
        );
      // RC1 fix (`planning/vd-start-frame-reference-mapping/plan.md` Phase 1,
      // 2026-07-16): `resolveShotCharacterReferenceEntries`'s underlying
      // query has NO `ORDER BY` — its own return order is Postgres-arbitrary,
      // NOT reliably `frame.requiredCharacterRefs` order. The comment that
      // used to sit here claimed the two orders always matched; that claim
      // was FALSE, and when Postgres happened to return rows in a different
      // order than `requiredCharacterRefs`, the skill was told the WRONG
      // "Image N" index for a character relative to what the paid render
      // (`resolveRequiredShotCharacterAttachmentManifest`, which explicitly
      // restores `requiredCharacterRefs` order) actually attaches later —
      // the skill's own authored prose then correctly reflected the WRONG
      // index it was given, contradicting the real attachment order. Re-sort
      // via `reorderShotCharacterRefEntriesByKeyOrder` (the same helper
      // `resolveShotVideoPromptCharacterReferenceImages` uses) so the
      // manifest below is always in the SAME order the real render attaches
      // reference images in.
      const shotStartFramePromptCharacterRefEntries =
        reorderShotCharacterRefEntriesByKeyOrder(
          await resolveShotCharacterReferenceEntries(
            tenantId,
            userId,
            seriesId,
            frame.requiredCharacterRefs
          ),
          frame.requiredCharacterRefs ?? [],
        );

      // Location fact (Phase 2 of `planning/polished-toasting-gadget.md` —
      // location visual bible) — resolves the same `location_key` ->
      // roster -> approved-reference lookup `generateStartFrameImage`/
      // `generateStartFrameAngleVariations` use (including the Phase D
      // per-shot override, `frame.locationKey`), but only the TEXT facts are
      // threaded here (this procedure never attaches a reference image
      // itself — it's a prompt-authoring-only call; the real render still
      // happens via `generateStartFrameImage`, which does the URL-attach).
      const shotStartFramePromptLocationEntry = await resolveShotLocationReferenceEntry(
        tenantId,
        userId,
        seriesId,
        row.storyboard,
        input.shotNumber,
        frame.locationKey
      );
      const sceneContinuityEnabled = hasVerticalDramaSceneIdentity(
        row.storyboard,
        input.shotNumber,
        frame.locationKey,
      ) && await resolveVerticalDramaSceneContinuityFlag(tenantId);
      let shotSceneContinuityLockBlock: string | undefined;
      let shotSceneContinuityNewlyAuthored:
        | import("@shared/verticalDramaSeries/sceneContinuity").VdSceneVisualState
        | undefined;
      if (sceneContinuityEnabled) {
        const { resolveShotSceneContinuityLock } = await import(
          "../services/verticalDramaSceneContinuityLock"
        );
        const lock = await resolveShotSceneContinuityLock({
          enabled: true,
          tenantId,
          userId,
          seriesId,
          episodeId,
          storyboard: row.storyboard,
          startFramePlan: basePlan,
          shotNumber: input.shotNumber,
          authorIfMissing: true,
          canonicalShotSummaryByShotNumber: (input.canonicalShotSummary?.trim() || frame.canonicalShotSummary?.trim())
            ? new Map([[input.shotNumber, input.canonicalShotSummary?.trim() || frame.canonicalShotSummary!.trim()]])
            : undefined,
          locationImageUrlByLocationKey: shotStartFramePromptLocationEntry?.url && frame.locationKey
            ? new Map([[frame.locationKey, resolveReferenceUrl(shotStartFramePromptLocationEntry.url, ctx.publicUrl ?? undefined)]])
            : undefined,
          idempotencyKey: input.idempotencyKey,
        });
        shotSceneContinuityLockBlock = lock.block;
        shotSceneContinuityNewlyAuthored = lock.newlyAuthored;
        if (lock.failure) {
          console.warn("[vd_scene_continuity] explicit single-shot prompt proceeding unlocked", {
            episodeId,
            shotNumber: input.shotNumber,
            reason: lock.failure.reason,
          });
        }
      }

      // Resolve the independent image language, retaining the former shared
      // video-language value only as a compatibility fallback for episodes
      // created before `startFramePlan.imagePromptLanguage` existed.
      const shotStartFramePromptLanguage = resolveEffectiveImagePromptLanguage({
        startFramePlan: basePlan,
        motionPromptPack: row.motionPromptPack as VerticalDramaMotionPromptPack | null,
      });

      // Strip any stale identity-lock suffix before handing the stored
      // prompt to the skill as informational-only scene grounding — same
      // defensive stripping every other call site applies to a stored
      // prompt before an LLM call.
      const shotStartFramePromptBasePrompt = stripExistingIdentityLockSuffix(
        frame.imagePrompt
      );

      // Speaker-order composition fix (start-frame character positioning) —
      // this shot's dialogue speakers, in delivery order, deduped to first
      // appearance, resolved via the SAME dialogue-resolution chain
      // `generateShotVideoPrompt` uses (`resolveShotDialogueLines` — see
      // that function's own doc comment for the full fallback order). This
      // generator is not authoritative for dialogue and never triggers a
      // dialogue-refresh itself (unlike `generateShotVideoPrompt`) — a shot
      // with no resolvable dialogue simply leaves `speaking_order` empty
      // (silent/solo shot, or dialogue not drafted yet), which
      // `generateStartFrameShotPrompt` below then omits from the prompt
      // entirely (byte-identical regression guard).
      const shotStartFramePromptPack =
        row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const shotStartFramePromptMatchingClip = shotStartFramePromptPack?.clips?.find(
        c => c.sourceShotNumbers?.includes(input.shotNumber)
      );
      const shotStartFramePromptDeepStoryDraftsEnabled =
        await resolveVerticalDramaDeepStoryDraftsFlag(tenantId);
      let shotStartFramePromptDeepDraftShot: VdDeepDraftShotDraft | null = null;
      if (shotStartFramePromptDeepStoryDraftsEnabled) {
        const [shotStartFramePromptSeriesRow] = await db
          .select({ bible: verticalDramaSeries.bible })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          )
          .limit(1);
        const { getActiveBreakdown, readItemShotDrafts } = await import(
          "../services/verticalDramaStoryBible"
        );
        const shotStartFramePromptPlanItem = getActiveBreakdown(
          (shotStartFramePromptSeriesRow?.bible as Record<string, unknown> | null) ?? null
        ).find(item => item.episodeNumber === Number(row.episodeNumber));
        shotStartFramePromptDeepDraftShot = shotStartFramePromptPlanItem
          ? ((readItemShotDrafts(shotStartFramePromptPlanItem) ?? []).find(
              s => s.shot_number === input.shotNumber
            ) ?? null)
          : null;
      }
      const shotStartFramePromptDialogueLines = resolveShotDialogueLines({
        shotNumber: input.shotNumber,
        matchingClip: shotStartFramePromptMatchingClip,
        dialogueAudioPlan: row.dialogueAudioPlan as {
          dialogue_lines?: Array<Record<string, unknown>>;
        } | null,
        script: row.script as Record<string, unknown> | null,
        storyboardShotCount: (row.storyboard as { shots?: unknown[] } | null)
          ?.shots?.length,
        deepDraftShot: shotStartFramePromptDeepDraftShot,
      });
      const shotStartFramePromptSpeakingOrder = Array.from(
        new Set(
          shotStartFramePromptDialogueLines
            .map(l => l.characterKey?.trim())
            .filter((k): k is string => Boolean(k))
        )
      );

      // Two-mode start-frame image prompt switch
      // (`planning/vd-start-frame-prompt-modes/plan.md`) — resolve the
      // effective mode: an explicit non-"auto" per-sub-episode choice
      // (`setEpisodeImagePromptMode`) always wins; otherwise resolve from
      // the plan's selected image model's family. The model lookup is
      // wrapped in try/catch so a missing/unselected/unresolvable image
      // model NEVER breaks prompt generation — it degrades to family
      // "other" -> `cinematic_narrative`, same "informational fact, never a
      // hard precondition" convention this procedure already uses for the
      // region/product-lock facts above (unlike `resolveEpisodeImageModelId`,
      // which fails closed for the PAID render call — this is a prompt-
      // authoring call, and a wrong/missing model guess here only ever
      // picks a slightly different creative mode, never a broken render).
      const shotStartFramePromptExplicitMode: VdImagePromptMode | undefined =
        basePlan.imagePromptMode && basePlan.imagePromptMode !== "auto"
          ? basePlan.imagePromptMode
          : undefined;
      let shotStartFramePromptImageModelFamily: ImagePromptModelFamily = "other";
      let shotStartFramePromptImageModelName: string | undefined;
      let shotStartFramePromptImagePromptMaxChars = VD_IMAGE_PROMPT_MAX;
      try {
        if (basePlan.selectedImageModelId) {
          const shotStartFramePromptImageModels = await getModelsByTypeAsync("image");
          const shotStartFramePromptImageModelRow = shotStartFramePromptImageModels.find(
            m => m.id === basePlan.selectedImageModelId
          );
          if (shotStartFramePromptImageModelRow) {
            shotStartFramePromptImageModelName = shotStartFramePromptImageModelRow.name;
            shotStartFramePromptImageModelFamily = resolveImagePromptTargetFamily({
              modelId: shotStartFramePromptImageModelRow.id,
              name: shotStartFramePromptImageModelRow.name,
              provider: shotStartFramePromptImageModelRow.provider,
              configJson: shotStartFramePromptImageModelRow.configJson,
            });
            try {
              shotStartFramePromptImagePromptMaxChars = resolveVdImagePromptBudgetForModel({
                modelId: shotStartFramePromptImageModelRow.id,
                configJson: shotStartFramePromptImageModelRow.configJson,
              });
            } catch {
              // Budget metadata is advisory for prompt authoring. Keep the
              // legacy cap without discarding the independently resolved
              // image-model family when registry fallback is unavailable.
              shotStartFramePromptImagePromptMaxChars = VD_IMAGE_PROMPT_MAX;
            }
          }
        }
      } catch {
        shotStartFramePromptImageModelFamily = "other";
      }
      const shotStartFramePromptResolvedMode: VdImagePromptMode =
        shotStartFramePromptExplicitMode ??
        resolveDefaultImagePromptMode(shotStartFramePromptImageModelFamily);
      const shotStartFramePromptModeResolvedFrom: "user" | "auto" =
        shotStartFramePromptExplicitMode ? "user" : "auto";
      // A free-text AI edit is a separate, general prompt-repair action. It
      // must not masquerade as synopsis-direct mode or stamp the result as if
      // it came from the deterministic policy-safe contract.
      const shotStartFramePromptIsManualAiEdit =
        Boolean(input.instruction?.trim()) && !input.canonicalShotSummary?.trim();
      const shotStartFramePromptCanonicalSynopsis =
        input.canonicalShotSummary?.trim() || frame.canonicalShotSummary?.trim();
      if (
        !shotStartFramePromptIsManualAiEdit &&
        shotStartFramePromptResolvedMode === "policy_safe_rewrite" &&
        !shotStartFramePromptCanonicalSynopsis
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ไม่พบเรื่องย่อหลักของช็อต ${input.shotNumber} — กรุณากลับไปสร้างหรือบันทึกเรื่องย่อใน Overview ก่อนสร้างพรอมต์ภาพ`,
        });
      }

      // Feature 139: authoring receives compact register facts only. Raw
      // provider fragments are reserved for the final image assembler.
      const {
        presetMixV2Enabled: shotStartFramePromptPresetMixV2Enabled,
        seriesLookLockEnabled: shotStartFramePromptLookLockEnabled,
      } = await resolveVerticalDramaQualityLoopFlags(tenantId);
      let shotStartFramePromptSeriesLookRegister:
        | { styleName: string; palette: string[]; lighting: string; cameraGrammar: string }
        | undefined;
      if (shotStartFramePromptPresetMixV2Enabled || shotStartFramePromptLookLockEnabled) {
        const shotStartFramePromptPresetVisualIdentity =
          await loadEffectiveSeriesVisualIdentity(tenantId, userId, seriesId, {
            presetMixV2Enabled: shotStartFramePromptPresetMixV2Enabled,
            seriesLookLockEnabled: shotStartFramePromptLookLockEnabled,
          });
        if (shotStartFramePromptPresetVisualIdentity) {
          shotStartFramePromptSeriesLookRegister = {
            styleName: shotStartFramePromptPresetVisualIdentity.styleName,
            palette: shotStartFramePromptPresetVisualIdentity.palette,
            lighting: shotStartFramePromptPresetVisualIdentity.lighting,
            cameraGrammar: shotStartFramePromptPresetVisualIdentity.cameraGrammar,
          };
        }
      }

      const {
        generateStartFrameShotPrompt,
        InsufficientCreditsError: StartFrameShotPromptInsufficientCreditsError,
        VdSchemaValidationError: StartFrameShotPromptSchemaValidationError,
        RateLimitExceededError: StartFrameShotPromptRateLimitExceededError,
        VdReferenceMappingError: StartFrameShotPromptReferenceMappingError,
      } = await import("../services/verticalDramaStartFrameGeneration");

      let resolvedImageUrl: string | undefined = input.imageUrl
        ? resolveReferenceUrl(input.imageUrl, ctx.publicUrl ?? undefined)
        : undefined;
      if (
        !resolvedImageUrl &&
        frame.approvedMediaAssetId &&
        Number.isInteger(Number(frame.approvedMediaAssetId)) &&
        Number(frame.approvedMediaAssetId) > 0
      ) {
        const assetId = Number(frame.approvedMediaAssetId);
        const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [
          assetId,
        ]);
        const rawUrl = urlsByAssetId.get(assetId);
        if (rawUrl) {
          resolvedImageUrl = resolveReferenceUrl(rawUrl, ctx.publicUrl ?? undefined);
        }
      }

      let shotStartFramePromptResult: {
        prompt: string;
        negativePrompt: string;
        creditsUsed: number;
        model: string;
        usedVision?: boolean;
        usedMode?: VdImagePromptMode;
        frameStamp?: VdImagePromptModeStamp;
        safetyAdjustments?: string[];
        promptAnalysis?: {
          storyMeaning?: string;
          primaryEmotion?: string;
          decisiveMoment?: string;
          qualityScore?: number;
          qualityFlags?: string[];
        };
      };
      try {
        shotStartFramePromptResult = await generateStartFrameShotPrompt({
          userId,
          tenantId,
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          instruction: input.instruction,
          currentPrompt: shotStartFramePromptBasePrompt,
          currentNegativePrompt: frame.negativePrompt ?? "",
          canonicalShotSummary: shotStartFramePromptCanonicalSynopsis,
          requiredCharacterRefs: frame.requiredCharacterRefs,
          characters: shotStartFramePromptCharacterIdentitySources,
          characterReferenceManifest:
            shotStartFramePromptCharacterRefEntries.map((entry, idx) => ({
              index: idx + 1,
              characterId: null,
              name: entry.name,
            })),
          targetAudienceRegion: shotStartFramePromptRegion,
          promptLanguage: shotStartFramePromptLanguage,
          // Two-mode start-frame image prompt switch — resolved above.
          imagePromptMode: shotStartFramePromptIsManualAiEdit
            ? undefined
            : shotStartFramePromptResolvedMode,
          imagePromptModeResolvedFrom: shotStartFramePromptIsManualAiEdit
            ? undefined
            : shotStartFramePromptModeResolvedFrom,
          imageModelFamily: shotStartFramePromptImageModelFamily,
          imageModelName: shotStartFramePromptImageModelName,
          imageModelId: basePlan.selectedImageModelId || undefined,
          imagePromptMaxChars: shotStartFramePromptImagePromptMaxChars,
          // `cinematic_narrative`-only vision grounding — reuses the
          // ALREADY-resolved character/location entries above (same
          // manifest order `characterReferenceManifest` uses), absolutized
          // exactly like the video-prompt path absolutizes its own
          // portrait/location references.
          characterReferenceImages: shotStartFramePromptCharacterRefEntries.map(entry => ({
            url: resolveReferenceUrl(entry.url, ctx.publicUrl ?? undefined),
            label: entry.name,
          })),
          locationReferenceImage: shotStartFramePromptLocationEntry?.url
            ? {
                url: resolveReferenceUrl(
                  shotStartFramePromptLocationEntry.url,
                  ctx.publicUrl ?? undefined
                ),
                label: shotStartFramePromptLocationEntry.name ?? "",
              }
            : undefined,
          seriesLookRegister: shotStartFramePromptSeriesLookRegister,
          productLock: {
            active: shotStartFramePromptIsTieInShot,
            productName:
              shotStartFramePromptProductLockFacts?.productName ?? null,
            productDescription:
              shotStartFramePromptProductLockFacts?.productDescription ??
              null,
          },
          // NO CODE-SIDE PROMPT APPENDING — the two new modes' own skills
          // author the product-tie-in directive from these SAME facts (see
          // `productLock` immediately above) under a differently-labeled
          // `PRODUCT TIE-IN` fact their contracts look for by name.
          productTieIn: {
            active: shotStartFramePromptIsTieInShot,
            productName:
              shotStartFramePromptProductLockFacts?.productName ?? null,
            productDescription:
              shotStartFramePromptProductLockFacts?.productDescription ??
              null,
          },
          // Phase 2 of `planning/polished-toasting-gadget.md` — see this
          // procedure's own `shotStartFramePromptLocationEntry` doc comment
          // above. Omitted entirely (not merely `undefined`) when no
          // location resolves, so a shot/episode with no location data
          // renders byte-identical to before this field existed.
          location: shotStartFramePromptLocationEntry
            ? {
                name: shotStartFramePromptLocationEntry.name ?? "",
                description:
                  shotStartFramePromptLocationEntry.description ??
                  shotStartFramePromptLocationEntry.name ??
                  "",
                hasReferenceImage: Boolean(shotStartFramePromptLocationEntry.url),
              }
            : undefined,
          sceneContinuityLockBlock: shotSceneContinuityLockBlock,
          // Speaker-order composition fix — see this procedure's own
          // `shotStartFramePromptSpeakingOrder` resolution above. Omitted
          // entirely (not merely `undefined`) when no speakers resolved, so
          // a silent/solo shot or dialogue-not-yet-drafted shot produces the
          // same prompt as before this field existed.
          ...(shotStartFramePromptSpeakingOrder.length
            ? { speakingOrder: shotStartFramePromptSpeakingOrder }
            : {}),
          attachShotImage: input.attachShotImage,
          imageUrl: resolvedImageUrl,
          additionalImageUrls: input.additionalImageUrls?.map((url, idx) => ({
            url: resolveReferenceUrl(url, ctx.publicUrl ?? undefined),
            label: `Additional reference image ${idx + 1} (user-supplied)`,
          })),
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        console.error("[generateShotStartFramePrompt] ERROR CATCH:", err);
        if (err instanceof StartFrameShotPromptInsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Insufficient credits to author the start-frame prompt",
          });
        }
        if (err instanceof StartFrameShotPromptSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to author the start-frame prompt — try again",
          });
        }
        if (err instanceof StartFrameShotPromptRateLimitExceededError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        }
        // RC3 fix (`planning/vd-start-frame-reference-mapping/plan.md` Phase
        // 2, 2026-07-16) — the skill authored a prompt whose own "Image N ↔
        // name" text still explicitly contradicted `characterReferenceManifest`
        // after one corrective retry inside `generateStartFrameShotPrompt`.
        // Fail closed here (a contradictory prompt is never persisted) with a
        // clear Thai instruction, same convention as every other user-facing
        // PRECONDITION_FAILED in this router.
        if (err instanceof StartFrameShotPromptReferenceMappingError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} (ระบบลองแก้ให้อัตโนมัติแล้วแต่ยังไม่ตรง) — วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่อีกครั้ง แล้วจึงสร้างภาพ`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to author the start-frame prompt",
        });
      }

      // Final-prompt QC (hard length cap) — enforced BEFORE this prompt is
      // persisted onto `startFramePlan.frames[]` below, same convention as
      // every other outgoing image prompt in this router.
      // Synopsis-direct mode has already been hard-capped by the service.
      // Never send it through the creative QC rewriter: doing so would undo
      // the exact-replacement proof and could add cinematic details again.
      if (shotStartFramePromptResult.usedMode !== "policy_safe_rewrite") {
        const shotStartFramePromptQc = await ensurePromptWithinLimit({
          kind: "image",
          prompt: shotStartFramePromptResult.prompt,
          maxChars: shotStartFramePromptImagePromptMaxChars,
          userId,
          tenantId,
          seriesId,
          idempotencyKey: input.idempotencyKey
            ? `${input.idempotencyKey}:prompt-qc`
            : undefined,
          label: `start-frame shot prompt (episode #${episodeId}, shot ${input.shotNumber})`,
        });
        shotStartFramePromptResult.prompt = shotStartFramePromptQc.prompt;
      }

      // Persist onto ONLY the target shot's frame inside
      // `startFramePlan.frames[]` — same 2026-07-11 lost-update-race-fix
      // shape `generateShotVideoPrompt` already uses for
      // `motionPromptPack.clips[]`: lock the row and re-read the FRESHEST
      // `startFramePlan` inside a transaction immediately before merging, so
      // concurrent per-shot calls serialize instead of clobbering each
      // other. Every OTHER field on the target frame — including
      // `approvedMediaAssetId` — survives untouched (spread-overwrite of
      // ONLY `imagePrompt`/`negativePrompt` onto the ONE target frame
      // object); every sibling shot's frame object stays the exact same
      // reference, never reconstructed.
      //
      // `approvedMediaAssetId` is deliberately left as-is on repair (open
      // question, researched — see planning/`polished-toasting-gadget.md`):
      // the free-text "Edit" pencil path (`handleSaveStartFramePrompt`)
      // already edits this same `imagePrompt` field without clearing
      // approval, so behaving differently here for the identical field would
      // be inconsistent; clearing it would also immediately break
      // `generateShotVideoPrompt`'s own precondition gate for this shot.
      await db.transaction(async tx => {
        const [freshRow] = await tx
          .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .for("update")
          .limit(1);
        const freshPlan =
          (freshRow?.startFramePlan as VerticalDramaStartFramePlan | null) ??
          basePlan;
        const targetIndex = freshPlan.frames.findIndex(
          f => f.shotNumber === input.shotNumber
        );
        const updatedFrames = freshPlan.frames.slice();
        const updatedFrame = {
          ...(targetIndex === -1 ? frame : updatedFrames[targetIndex]),
          imagePrompt: shotStartFramePromptResult.prompt,
          negativePrompt: shotStartFramePromptResult.negativePrompt,
          ...(shotStartFramePromptCanonicalSynopsis
            ? { canonicalShotSummary: shotStartFramePromptCanonicalSynopsis }
            : {}),
          // Two-mode start-frame image prompt switch — stamp which engine
          // authored this prompt + its normalized director's-notes extras.
          // Automatic generation carries a stamp. A free-text AI edit uses
          // the general legacy editor and explicitly clears any stale stamp
          // and mode-specific extras below.
          ...(shotStartFramePromptResult.frameStamp
            ? { promptMode: shotStartFramePromptResult.frameStamp }
            : {}),
          ...(shotStartFramePromptResult.safetyAdjustments
            ? { promptSafetyAdjustments: shotStartFramePromptResult.safetyAdjustments }
            : {}),
          ...(shotStartFramePromptResult.promptAnalysis
            ? { promptAnalysis: shotStartFramePromptResult.promptAnalysis }
            : {}),
        };
        if (shotStartFramePromptIsManualAiEdit) {
          delete updatedFrame.promptMode;
          delete updatedFrame.promptSafetyAdjustments;
          delete updatedFrame.promptAnalysis;
        } else {
          if (!shotStartFramePromptResult.safetyAdjustments) {
            delete updatedFrame.promptSafetyAdjustments;
          }
          if (!shotStartFramePromptResult.promptAnalysis) {
            delete updatedFrame.promptAnalysis;
          }
        }
        if (targetIndex === -1) {
          updatedFrames.push(updatedFrame);
          updatedFrames.sort((a, b) => a.shotNumber - b.shotNumber);
        } else {
          updatedFrames[targetIndex] = updatedFrame;
        }
        const updatedPlan: VerticalDramaStartFramePlan = {
          ...freshPlan,
          frames: updatedFrames,
        };
        if (shotSceneContinuityNewlyAuthored) {
          const {
            readSceneVisualStatesFromPlan,
            upsertSceneVisualState,
          } = await import("../services/verticalDramaStartFrameGeneration");
          const sceneMerge = upsertSceneVisualState({
            current: readSceneVisualStatesFromPlan(freshPlan),
            next: shotSceneContinuityNewlyAuthored,
            origin: "lazy",
          });
          if (sceneMerge.written) {
            updatedPlan.sceneVisualStates = sceneMerge.states;
          }
        }

        await tx
          .update(verticalDramaEpisodes)
          .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          );
      });

      return {
        prompt: shotStartFramePromptResult.prompt,
        negativePrompt: shotStartFramePromptResult.negativePrompt,
        creditsUsed: shotStartFramePromptResult.creditsUsed,
        usedVision: shotStartFramePromptResult.usedVision ?? false,
        promptMode: shotStartFramePromptResult.frameStamp,
      };
    }),

  /**
   * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6 —
   * user-controlled supplementary reference frames) — author ONE additional
   * reference-frame image prompt for a shot. Reuses `generateStartFrameShotPrompt`
   * (the SAME service `generateShotStartFramePrompt` above calls) in its new
   * `referenceFrameMode` (see that service's `GenerateStartFrameShotPromptParams
   * .referenceFrameMode` doc comment) — the user picks WHICH characters
   * appear (not necessarily `frame.requiredCharacterRefs`) and types a
   * free-text directive (pose/camera/action, e.g. "ไอริณโอบกอดภาคิน") that
   * OUTRANKS `canonical_shot_summary` for action under the skill's new
   * "Supplementary reference frame mode" section; every other identity/
   * mapping/continuity rule still applies, including the mapping validator +
   * one corrective retry + fail-closed `VdReferenceMappingError` — identical
   * to the main flow.
   *
   * Deliberately does NOT touch `startFramePlan.frames[].imagePrompt` or any
   * other persisted episode field (no `db.update` call anywhere in this
   * mutation) — this is a prompt-authoring-only call the user must CONFIRM
   * before spending credits on the paid render
   * (`generateShotReferenceFrameImage`, immediately below). The completed
   * render is only linked into the episode's reference set
   * (`vertical_drama_shot_references`, `source: "reference_frame"`) by the
   * CLIENT calling the pre-existing `linkShotReference` mutation once the
   * user approves the image.
   */
  generateShotReferenceFramePrompt: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        characterKeys: z.array(z.string().min(1)).min(1).max(10),
        instruction: z.string().trim().min(1).max(2000),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
      if (!plan || !frame) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame plan for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }

      // De-dupe the user's own character selection (same tolerant convention
      // `resolveRequiredShotCharacterAttachmentManifest` uses below in the
      // sibling image mutation) — the multi-select UI could conceivably
      // resend the same key twice.
      const referenceFrameCharacterKeys = Array.from(
        new Set(input.characterKeys.map(key => key.trim()).filter(Boolean))
      );

      // Validate every selected key against the series roster BEFORE
      // spending an LLM call — an unknown key can never resolve to a real
      // portrait/identity fact at render time either, so failing fast here
      // is strictly better than discovering it later at the paid image
      // mutation.
      const referenceFrameRosterRows = await db
        .select({ characterKey: verticalDramaCharacters.characterKey })
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.seriesId, seriesId),
            inArray(verticalDramaCharacters.characterKey, referenceFrameCharacterKeys)
          )
        );
      const referenceFrameKnownKeys = new Set(
        referenceFrameRosterRows.map((r: { characterKey: string }) => r.characterKey)
      );
      const referenceFrameUnknownKeys = referenceFrameCharacterKeys.filter(
        key => !referenceFrameKnownKeys.has(key)
      );
      if (referenceFrameUnknownKeys.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `ไม่พบตัวละครในรายการสำหรับ ${referenceFrameUnknownKeys.join(", ")}`,
        });
      }

      // Manifest order = the USER'S selection order (Phase 6 design) — the
      // SAME order `generateShotReferenceFrameImage`'s
      // `resolveRequiredShotCharacterAttachmentManifest` call preserves
      // (first-occurrence order of its own `characterKeys` input, which the
      // client sends back unchanged as this mutation's own returned
      // `characterKeys`). Tolerant of a selected character with no portrait
      // yet at PROMPT time — same "informational for authoring, fail-closed
      // only at render" convention `generateShotStartFramePrompt` uses for
      // `frame.requiredCharacterRefs`; `resolveShotCharacterReferenceEntries`
      // simply omits a portrait-less character here.
      const referenceFrameCharacterRefEntries = reorderShotCharacterRefEntriesByKeyOrder(
        await resolveShotCharacterReferenceEntries(
          tenantId,
          userId,
          seriesId,
          referenceFrameCharacterKeys
        ),
        referenceFrameCharacterKeys
      );

      const referenceFrameCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          referenceFrameCharacterKeys
        );

      const referenceFrameLocationEntry = await resolveShotLocationReferenceEntry(
        tenantId,
        userId,
        seriesId,
        row.storyboard,
        input.shotNumber,
        frame.locationKey
      );

      // Supplementary reference frames are read-only consumers of the scene
      // lock. They must never spend a second LLM call authoring a missing
      // state; the primary start-frame authoring path owns that lifecycle.
      let referenceFrameSceneContinuityLockBlock: string | undefined;
      if (hasVerticalDramaSceneIdentity(row.storyboard, input.shotNumber, frame.locationKey) &&
        await resolveVerticalDramaSceneContinuityFlag(tenantId)) {
        const { resolveShotSceneContinuityLock } = await import(
          "../services/verticalDramaSceneContinuityLock"
        );
        const lock = await resolveShotSceneContinuityLock({
          enabled: true,
          tenantId,
          userId,
          seriesId,
          episodeId,
          storyboard: row.storyboard,
          startFramePlan: plan,
          shotNumber: input.shotNumber,
          authorIfMissing: false,
          canonicalShotSummaryByShotNumber: frame.canonicalShotSummary?.trim()
            ? new Map([[input.shotNumber, frame.canonicalShotSummary.trim()]])
            : undefined,
          locationImageUrlByLocationKey: referenceFrameLocationEntry?.url && frame.locationKey
            ? new Map([[frame.locationKey, resolveReferenceUrl(referenceFrameLocationEntry.url, ctx.publicUrl ?? undefined)]])
            : undefined,
          idempotencyKey: input.idempotencyKey,
        });
        referenceFrameSceneContinuityLockBlock = lock.block;
      }

      const referenceFramePromptLanguage = resolveEffectiveImagePromptLanguage({
        startFramePlan: plan,
        motionPromptPack: row.motionPromptPack as VerticalDramaMotionPromptPack | null,
      });

      // Scene grounding only — same defensive stripping every other call
      // site applies to a stored prompt before an LLM call.
      const referenceFrameBasePrompt = stripExistingIdentityLockSuffix(
        frame.imagePrompt ?? ""
      );

      const {
        generateStartFrameShotPrompt,
        InsufficientCreditsError: ReferenceFramePromptInsufficientCreditsError,
        VdSchemaValidationError: ReferenceFramePromptSchemaValidationError,
        RateLimitExceededError: ReferenceFramePromptRateLimitExceededError,
        VdReferenceMappingError: ReferenceFramePromptReferenceMappingError,
      } = await import("../services/verticalDramaStartFrameGeneration");

      let referenceFramePromptResult: {
        prompt: string;
        negativePrompt: string;
        creditsUsed: number;
        model: string;
      };
      try {
        referenceFramePromptResult = await generateStartFrameShotPrompt({
          userId,
          tenantId,
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          instruction: input.instruction,
          referenceFrameMode: true,
          currentPrompt: referenceFrameBasePrompt,
          currentNegativePrompt: frame.negativePrompt ?? "",
          canonicalShotSummary: frame.canonicalShotSummary,
          requiredCharacterRefs: referenceFrameCharacterKeys,
          characters: referenceFrameCharacterIdentitySources,
          characterReferenceManifest:
            referenceFrameCharacterRefEntries.map((entry, idx) => ({
              index: idx + 1,
              characterId: null,
              name: entry.name,
            })),
          promptLanguage: referenceFramePromptLanguage,
          // Phase 6 design — no `speakingOrder` fact by design (this is an
          // arbitrary user-directed pose/action, not necessarily this shot's
          // dialogue beat).
          location: referenceFrameLocationEntry
            ? {
                name: referenceFrameLocationEntry.name ?? "",
                description:
                  referenceFrameLocationEntry.description ??
                  referenceFrameLocationEntry.name ??
                  "",
                hasReferenceImage: Boolean(referenceFrameLocationEntry.url),
              }
            : undefined,
          sceneContinuityLockBlock: referenceFrameSceneContinuityLockBlock,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof ReferenceFramePromptInsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Insufficient credits to author the reference-frame prompt",
          });
        }
        if (err instanceof ReferenceFramePromptSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to author the reference-frame prompt — try again",
          });
        }
        if (err instanceof ReferenceFramePromptRateLimitExceededError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        }
        // Same fail-closed convention as `generateShotStartFramePrompt`'s
        // matching catch branch — a contradictory prompt is never returned
        // for the user to confirm.
        if (err instanceof ReferenceFramePromptReferenceMappingError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `พรอมต์เฟรมอ้างอิงไม่ตรงกับตัวละครในช็อต ${input.shotNumber} (ลองแก้ให้อัตโนมัติแล้วยังไม่ตรง) — วิธีแก้: กด "สร้างเฟรมอ้างอิง (AI)" ของช็อตนี้ใหม่อีกครั้ง`,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Failed to author the reference-frame prompt",
        });
      }

      // Final-prompt QC (hard length cap) — keeps this mutation's returned
      // prompt within `generateShotReferenceFrameImage`'s own `prompt` zod
      // max (`VD_IMAGE_PROMPT_MAX`), so a user who confirms unmodified never
      // hits a BAD_REQUEST on the render call.
      const referenceFramePromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: referenceFramePromptResult.prompt,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `reference-frame prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

      // Deliberately NOT persisted onto `startFramePlan.frames[]` — see this
      // procedure's own doc comment.
      return {
        prompt: referenceFramePromptQc.prompt,
        negativePrompt: referenceFramePromptResult.negativePrompt,
        creditsUsed: referenceFramePromptResult.creditsUsed,
        model: referenceFramePromptResult.model,
        characterKeys: referenceFrameCharacterKeys,
      };
    }),

  /**
   * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6) —
   * paid render of ONE user-confirmed reference-frame prompt
   * (`generateShotReferenceFramePrompt` above). Mirrors
   * `generateStartFrameImage`'s model-resolution / pricing / capabilities /
   * render-time mapping guard / credit reserve-refund / MCP-transport /
   * async-submit structure as closely as possible, with three deliberate
   * differences: (1) the character set is the caller's OWN `characterKeys`
   * (not `frame.requiredCharacterRefs`); (2) NO product reference is ever
   * attached (a supplementary reference still is not the shot's tie-in
   * carrier); (3) nothing is EVER persisted onto `startFramePlan` — the
   * completed asset is linked into the episode's reference set only once the
   * CLIENT calls `linkShotReference({source: "reference_frame"})`.
   *
   * Cap-10 guard (Phase 6 user spec: "no fixed count, cap 10 per shot") runs
   * BEFORE any other resolution/credit work — counts this shot's already-
   * LINKED `vertical_drama_shot_references` rows with `source:
   * "reference_frame"` via the existing `listForShot` read path (no new
   * query shape).
   */
  generateShotReferenceFrameImage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        prompt: z.string().trim().min(1).max(VD_IMAGE_PROMPT_ABSOLUTE_MAX),
        negativePrompt: z.string().max(2000).optional(),
        characterKeys: z.array(z.string().min(1)).min(1).max(10),
        resolution: z.string().trim().max(32).optional(),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 8). See
        // `generateStartFrameImage`'s identical field.
        hermesConnectionId: z.string().max(64).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      // (a) ownership + frame existence.
      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
      if (!plan || !frame) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No start-frame plan for shot ${input.shotNumber} yet — generate the start-frame plan first`,
        });
      }

      // (b) cap-10 guard — reuses the existing shot-reference read path, no
      // new query shape. Counts only rows this shot has ALREADY LINKED
      // (`source: "reference_frame"`); the in-flight render being submitted
      // right now is not yet a linked row.
      const referenceFrameExistingRefs =
        await verticalDramaShotReferencesService.listForShot(
          { tenantId, userId, seriesId },
          episodeId,
          input.shotNumber
        );
      const referenceFrameExistingCount = referenceFrameExistingRefs.filter(
        r => r.source === "reference_frame"
      ).length;
      if (referenceFrameExistingCount >= 10) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `เฟรมอ้างอิงของช็อตนี้ครบ 10 ภาพแล้ว — ลบภาพเก่าออกก่อนสร้างใหม่`,
        });
      }

      // De-dupe the caller's own selection — same convention as the sibling
      // prompt mutation above.
      const referenceFrameCharacterKeys = Array.from(
        new Set(input.characterKeys.map(key => key.trim()).filter(Boolean))
      );

      // (c) portraits resolved fail-closed, requiredCharacterRefs-order
      // resolver with the SELECTED keys — throws PRECONDITION_FAILED
      // (unknown character / missing approved portrait / duplicate-portrait
      // collision) with its own Thai messages; identical convention to
      // `generateStartFrameImage`'s identity-lock resolution.
      const characterAttachmentManifest =
        await resolveRequiredShotCharacterAttachmentManifest(
          tenantId,
          userId,
          seriesId,
          input.shotNumber,
          referenceFrameCharacterKeys
        );
      const characterRefEntries = [
        ...characterAttachmentManifest.primaryEntries,
        ...characterAttachmentManifest.supplementaryEntries,
      ];
      const characterRefUrls = characterRefEntries.map(e => e.url);

      // (d) render-time reference-mapping fail-closed guard — validates the
      // USER-CONFIRMED (possibly hand-edited) prompt against the real
      // attachment order, BEFORE credits are reserved. Same convention/
      // rationale as `generateStartFrameImage`'s identical guard.
      const referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
        input.prompt,
        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
          imageIndex: index + 1,
          characterName: entry.name,
        })),
      );
      if (referenceMappingMismatches.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `พรอมต์เฟรมอ้างอิงไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — ตัวละครของช็อตนี้เปลี่ยนหลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน วิธีแก้: กด "สร้างเฟรมอ้างอิง (AI)" ของช็อตนี้ใหม่ก่อนสร้างภาพ`,
        });
      }

      // Location reference — same resolution/priority-ordering rationale as
      // `generateStartFrameImage`'s identical block, including the Phase D
      // per-shot override (`frame.locationKey`). NO product reference — see
      // this procedure's own doc comment, item (2).
      const locationRefEntry = await resolveShotLocationReferenceEntry(
        tenantId,
        userId,
        seriesId,
        row.storyboard,
        input.shotNumber,
        frame.locationKey
      );
      const locationRefUrls = locationRefEntry?.url ? [locationRefEntry.url] : [];

      // (e) capacity assert + reference URL merge + model/pricing/credits/
      // MCP/task submission — mirrors `generateStartFrameImage` structurally.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCapabilities = resolveVerticalDramaCapabilities(
        resolvedImageModelId,
        {
          type: "image",
          configJson: pricingModel.configJson ?? undefined,
        }
      );
      assertRequiredCharacterReferenceCapacity(
        input.shotNumber,
        characterAttachmentManifest.primaryEntries.length,
        imageCapabilities.maxReferenceImages,
      );
      const {
        urls: referenceImageUrls,
        trimmedCount: trimmedReferenceCount,
      } = mergeAndTrimReferenceImageUrls(
        characterRefUrls,
        locationRefUrls,
        [], // NO product refs — see this procedure's own doc comment.
        imageCapabilities.maxReferenceImages
      );
      assertResolutionOption(pricingModel, input.resolution);
      const imageCreditCost = calculateCreditCost(pricingModel, {
        numImages: 1,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
      // entirely — see the matching comment in `generateStartFrameImage`.
      const shouldChargeImageCredits = imageCreditCost > 0;
      let finalReferencePrompt = input.prompt;
      let finalReferenceNegativePrompt = input.negativePrompt;
      const { presetMixV2Enabled, seriesLookLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const identity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        const assembled = applySeriesLookToImagePrompt({
          prompt: finalReferencePrompt,
          negativePrompt: finalReferenceNegativePrompt,
          identity,
        });
        finalReferencePrompt = assembled.prompt;
        finalReferenceNegativePrompt = assembled.negativePrompt;
      }

      // Feature 135 — Hermes Grok media worker (section 09, row 8): resolve
      // the transport-neutral decision BEFORE the credit reserve block below
      // (not after) — see `generateStartFrameImage`'s matching block.
      const transportDecision = await resolveVdMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
        idempotencyKey: input.idempotencyKey,
      });
      const transportMetadata =
        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for reference-frame image render. Required: ${imageCreditCost}`,
          });
        }

        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — reference-frame render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
          sourceType: "media_image",
          idempotencyKey: input.idempotencyKey,
          metadata: {
            feature: "vertical_drama_series",
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
          tenantId,
          userId,
          urls: referenceImageUrls,
          traceId: hermesTraceId,
          connectionId: transportDecision.connectionId,
          requireAll: referenceImageUrls.length > 0,
        });
        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: finalReferencePrompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
            ...(input.resolution ? { resolution: input.resolution } : {}),
          },
          references,
          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: finalReferencePrompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_episode_id: String(episodeId),
            __vd_shot_number: String(input.shotNumber),
            __vd_purpose: "reference_frame",
          },
          droppedReferenceCount,
        });
        return {
          taskId: hermesTask.id,
          creditCost: 0,
          modelId: resolvedImageModelId,
          trimmedReferenceCount,
          droppedReferenceCount,
        };
      }

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: finalReferencePrompt,
            negativePrompt: finalReferenceNegativePrompt,
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(input.resolution ? { resolution: input.resolution } : {}),
            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
              __vd_shot_number: String(input.shotNumber),
              __vd_purpose: "reference_frame",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaEpisodes.generateShotReferenceFrameImage",
              stage: "submission",
            },
          },
          userToken
        );
        return {
          taskId: task.id,
          creditCost: imageCreditCost,
          modelId: resolvedImageModelId,
          trimmedReferenceCount,
        };
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: reference-frame render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_series",
              seriesId,
              episodeId,
              shotNumber: input.shotNumber,
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Reference-frame image generation failed to submit",
        });
      }
    }),

  /**
   * Generate ONE shot's image-grounded video-clip prompt (Phase 6, §6.6b) via
   * `generateVerticalDramaShotVideoPrompt` — analyzes the shot's current
   * approved start-frame image (or its generating `imagePrompt` as a textual
   * proxy when no vision-capable model is available) plus the storyboard
   * shot's description/camera/emotion and any matching dialogue lines, then
   * persists the resulting prompt + dialogue onto the matching
   * `motionPromptPack.clips[]` entry (creating a minimal clip/pack when
   * neither exists yet, mirroring `setEpisodeModelSelection`'s
   * create-minimal-pack convention).
   *
   * Free-standing from `generateVideoMotionPromptPack` (the whole-pack LLM
   * planning call) — this targets a single shot and is meant to be re-run
   * per-shot without regenerating the entire pack.
   */
  generateShotVideoPrompt: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
        // option) — the caller's current toggle state for this call.
        // Omitted (undefined) falls back to the pack's previously-persisted
        // `nativeAudioEnabled` preference below; either way, the rollout
        // gate (`resolveVerticalDramaNativeAudioPromptsFlag`) + the
        // resolved model's `supportsNativeAudio` capability both still have
        // to be true for this to actually take effect.
        nativeAudioEnabled: z.boolean().optional(),
        // planning/`polished-toasting-gadget.md` Fix B — the user's free-text
        // repair/adjustment instruction from the "ให้ AI ปรับ" (AI-adjust)
        // dialog next to a shot's video prompt. Purely additive: omitted
        // (undefined) reproduces today's exact prompt/behavior — the plain
        // "สร้างพรอมต์วิดีโอ (AI)" button never sends this field.
        instruction: z.string().trim().max(2000).optional(),
        // Whether to attach the shot's start frame (and character/location refs)
        // for AI vision analysis during AI adjust (defaults to true).
        attachShotImage: z.boolean().optional().default(true),
        additionalImageUrls: z
          .array(z.string().url().startsWith("http"))
          .max(3)
          .optional(),
        // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-
        // family-quality/plan.md` Phase 2) — defaults to ON (true) for this
        // paid generate/AI-adjust action; `false` is the escape hatch back
        // to a single plain generation. Default applied at the call site
        // (`input.qualityLoop ?? true`), not here, so `undefined` reads
        // unambiguously as "use the default" at every call site below.
        qualityLoop: z.boolean().optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
      const approvedMediaAssetId = frame?.approvedMediaAssetId
        ? Number(frame.approvedMediaAssetId)
        : undefined;
      if (
        !approvedMediaAssetId ||
        !Number.isInteger(approvedMediaAssetId) ||
        approvedMediaAssetId <= 0
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องมีภาพหลักของช็อตก่อน",
        });
      }
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [
        approvedMediaAssetId,
      ]);
      const rawImageUrl = urlsByAssetId.get(approvedMediaAssetId);
      if (!rawImageUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องมีภาพหลักของช็อตก่อน",
        });
      }
      // `resolveMediaAssetUrlsByIds` returns `mediaAssets.originalUrl` as
      // stored — a relative storage path (e.g. `/api/storage/files/...`).
      // This URL goes straight into a vision-capable LLM's `image_url`
      // content part below (`buildVisionAwareContent`), which the provider
      // rejects as an invalid URL format unless it's absolute — same
      // relative-to-absolute conversion every other reference-image call
      // site in this router already applies via `mediaGenerationService`'s
      // internal `resolveReferenceUrl`.
      const imageUrl = resolveReferenceUrl(rawImageUrl, ctx.publicUrl ?? undefined);

      // Story-density reform (spec §7.7.2 Layer 3/4, section-13, added
      // 2026-07-07) — gates BOTH the beat-index dialogue mapping and the
      // duration-aware video-prompt params below. Flag off preserves
      // today's byte-identical `resolveShotDialogueLines`/
      // `generateVerticalDramaShotVideoPrompt` call shape exactly.
      const { speechBudgetEnabled } =
        await resolveVerticalDramaDensityFlags(tenantId);

      // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`
      // W7, router-wiring package, added 2026-07-11) — resolved once for
      // this mutation.
      const retentionHooksEnabled =
        await resolveVerticalDramaRetentionHooksFlag(tenantId);
      const motionContractsEnabled =
        await resolveVerticalDramaMotionContractsFlag(tenantId);

      // Shot context: description/camera/emotion from the storyboard shot.
      const storyboard = row.storyboard as VerticalDramaShotgrid | null;
      const storyboardShot = storyboard?.shots?.find(
        s => s.shotNumber === input.shotNumber
      );
      // Video prompt generation is a read-only scene-lock consumer. The
      // start-frame authoring path (or batch pre-pass) is responsible for
      // creating a missing state; this path must not introduce an extra paid
      // authoring call while regenerating motion text.
      let shotSceneContinuityLockBlock: string | undefined;
      if (hasVerticalDramaSceneIdentity(row.storyboard, input.shotNumber, frame?.locationKey) &&
        await resolveVerticalDramaSceneContinuityFlag(tenantId)) {
        const { resolveShotSceneContinuityLock } = await import(
          "../services/verticalDramaSceneContinuityLock"
        );
        const canonicalVideoSummary = frame?.canonicalShotSummary?.trim();
        const lock = await resolveShotSceneContinuityLock({
          enabled: true,
          tenantId,
          userId,
          seriesId,
          episodeId,
          storyboard: row.storyboard,
          startFramePlan: plan,
          shotNumber: input.shotNumber,
          authorIfMissing: false,
          canonicalShotSummaryByShotNumber: canonicalVideoSummary
            ? new Map([[input.shotNumber, canonicalVideoSummary]])
            : undefined,
          idempotencyKey: input.idempotencyKey,
        });
        shotSceneContinuityLockBlock = lock.block;
      }
      // Retention hooks (W7) — this episode's total shot count, used ONLY to
      // derive `is_retention_ending_shot` (see
      // `GenerateVerticalDramaShotVideoPromptParams.totalShotCount`'s doc
      // comment). `undefined` whenever the storyboard has no shots yet, same
      // as every other storyboard-derived optional fact in this mutation.
      const shotVideoTotalShotCount = storyboard?.shots?.length || undefined;
      // Additive/defensive: today's shotgrid output does not populate this
      // field yet (W1-B shotgrid schema superset, a different file/wave) —
      // read tolerantly off the raw shot object so this wiring activates
      // automatically once that schema ships, without another edit here.
      const shotSourceBeatIndexes =
        speechBudgetEnabled &&
        Array.isArray(
          (storyboardShot as unknown as { sourceBeatIndexes?: unknown })
            ?.sourceBeatIndexes
        )
          ? (
              (storyboardShot as unknown as { sourceBeatIndexes?: unknown[] })
                .sourceBeatIndexes ?? []
            ).filter((n): n is number => typeof n === "number")
          : undefined;

      // Product tie-in context (spec §13) — present only when this shot
      // carries a placement per the script stage's normalized
      // `product_tie_in_plan.tie_ins[]`. Drives the mandatory natural
      // product/benefit mention in `generateVerticalDramaShotVideoPrompt`.
      const scriptPayload = row.script as Record<string, unknown> | null;
      // Retention hooks (W7) — grounding TEXT context for the opening/
      // retention-ending shot rules (see `GenerateVerticalDramaShotVideoPromptParams
      // .hookText`/`.retentionLoopDescription`'s own doc comments). Read
      // straight off the already-loaded `scriptPayload` — tolerant of a
      // pre-retention-hooks script artifact that has neither field.
      const shotVideoHookText =
        typeof scriptPayload?.hook === "string" ? scriptPayload.hook : undefined;
      const shotVideoRetentionLoopDescription = (() => {
        const retentionLoop = scriptPayload?.retention_loop as
          | Record<string, unknown>
          | undefined;
        return typeof retentionLoop?.description === "string"
          ? retentionLoop.description
          : undefined;
      })();
      const tieInPlacements = extractShotProductPlacements(
        scriptPayload?.product_tie_in_plan
      );
      const tieInPlacement = findPlacementForShot(
        tieInPlacements,
        input.shotNumber
      );
      let tieInProductName: string | undefined;
      let tieInProductCategory: string | undefined;
      if (tieInPlacement) {
        const [tieInSeriesRow] = await db
          .select({ productTieIn: verticalDramaSeries.productTieIn })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          )
          .limit(1);
        const rawProductTieIn =
          (tieInSeriesRow?.productTieIn as Record<string, unknown> | null) ??
          null;
        tieInProductName =
          typeof rawProductTieIn?.productName === "string"
            ? rawProductTieIn.productName
            : undefined;
        tieInProductCategory =
          typeof rawProductTieIn?.productCategory === "string"
            ? rawProductTieIn.productCategory
            : undefined;
      }

      // Hoisted from further below (planning/`polished-toasting-gadget.md`
      // — was previously computed only for `episodePlanContext`, right
      // before the `subShotDecision?.needsSplit` branch) so its result
      // (`shotEpisodePlanItem`) is also available for
      // `deepDraftShotForDialogue` below, BEFORE `resolveShotDialogueLines`
      // is called. Pure code-motion — same query, same position relative to
      // `row`/`seriesId`/`tenantId`/`userId` being already in scope, no new
      // DB round trip added.
      const [localeSeriesRow] = await db
        .select({ locale: verticalDramaSeries.locale, bible: verticalDramaSeries.bible })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId)
          )
        )
        .limit(1);

      // Part B3 (planning/`polished-toasting-gadget.md`) — compact episode
      // scene-setting plan context, resolved from the ALREADY-loaded
      // `localeSeriesRow.bible` above (no extra DB round trip).
      //
      // Cliffhanger-bleed fix (confirmed production bug, 2026-07-11):
      // `cliffhangerLine` is intentionally the NEXT episode's teased theme
      // (good serialized-drama writing — see `readItemCliffhangerLine`'s own
      // doc comment / the story bible), so it must NEVER be included in the
      // context sent to THIS per-shot generator. This call site builds
      // `episodePlanContext` for `generateVerticalDramaShotVideoPrompt`
      // below, which runs once per shot (`generateShotVideoPrompt` mutation)
      // — including the next episode's cliffhanger here meant every single
      // shot's independent LLM call saw next-episode content as "reference"
      // context, and cheaper models (observed: `openai/gpt-5.4-nano`) did
      // not reliably honor the "reference only, do not copy" instruction,
      // bleeding next-episode dialogue/themes into unrelated current-episode
      // shots (confirmed: series 6 / episode 41, shots 2/3/6). A single shot
      // never needs forward-looking plot info — `storyboardShot` already
      // supplies everything this generation needs — so `cliffhangerLine` is
      // deliberately omitted (`undefined`) here. `logline`/`keyBeats`/
      // `workingTitle` are legitimate current-episode continuity grounding
      // and stay included. Contrast with the whole-EPISODE-PACK generator
      // (`generateVideoMotionPromptPack`, built in
      // `verticalDramaEpisodePipeline.ts`'s `generateRealMotionPromptPack`),
      // which renders this context as ONE global block for the whole
      // episode (not per-shot) and legitimately keeps the cliffhanger to
      // shape the episode's own ending beat — see the reasoning comment at
      // `verticalDramaVideoMotionPromptGeneration.ts`'s `buildUserPrompt`.
      const { getActiveBreakdown, readItemShotDrafts } = await import(
        "../services/verticalDramaStoryBible"
      );
      const shotEpisodePlanItem = getActiveBreakdown(
        (localeSeriesRow?.bible as Record<string, unknown> | null) ?? null
      ).find(item => item.episodeNumber === Number(row.episodeNumber));
      const shotEpisodePlanContext = shotEpisodePlanItem
        ? formatStoryScriptEpisodePlanContext(
            resolveStoryScriptLangFromLocale(localeSeriesRow?.locale),
            {
              episodeNumber: shotEpisodePlanItem.episodeNumber,
              workingTitle: shotEpisodePlanItem.workingTitle,
              logline: shotEpisodePlanItem.logline,
              keyBeats: shotEpisodePlanItem.keyBeats,
              cliffhangerLine: undefined,
            }
          )
        : undefined;

      // Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
      // — gated behind the SAME `verticalDramaSeriesDeepStoryDrafts` tenant
      // flag convention already used for `shotSourceBeatIndexes` above
      // (`speechBudgetEnabled`). Reuses `shotEpisodePlanItem` (just resolved
      // above) — no additional DB read. `null` when the flag is off, or this
      // series/episode/shot has no deep-drafted `shotDrafts` entry yet —
      // `resolveShotDialogueLines` treats `null` identically to `undefined`
      // (falls straight through to the pre-existing fallback chain).
      const deepStoryDraftsEnabledForDialogue =
        await resolveVerticalDramaDeepStoryDraftsFlag(tenantId);
      const deepDraftShotForDialogue: VdDeepDraftShotDraft | null =
        deepStoryDraftsEnabledForDialogue && shotEpisodePlanItem
          ? ((readItemShotDrafts(shotEpisodePlanItem) ?? []).find(
              s => s.shot_number === input.shotNumber
            ) ?? null)
          : null;

      // Dialogue lines matching this shot — fallback chain (2026-07-06 fix:
      // dialogue was silently dropped whenever the `dialogue_audio_plan`
      // pipeline stage was never run, even though the script already has
      // dialogue for every scene — see `resolveShotDialogueLines`'s doc
      // comment for the full chain order; source 0, the deep-drafted
      // canonical dialogue above, was added 2026-07-11 — see that
      // function's doc comment for the full incident).
      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const matchingClip = pack?.clips?.find(c =>
        c.sourceShotNumbers?.includes(input.shotNumber)
      );
      const knownSpeakerKeysForShot = await loadSeriesKnownSpeakerKeys(
        tenantId,
        seriesId
      );
      let dialogueLines = resolveShotDialogueLines({
        shotNumber: input.shotNumber,
        matchingClip,
        dialogueAudioPlan: row.dialogueAudioPlan as {
          dialogue_lines?: Array<Record<string, unknown>>;
        } | null,
        script: row.script as Record<string, unknown> | null,
        storyboardShotCount: storyboard?.shots?.length,
        knownSpeakerKeys: knownSpeakerKeysForShot,
        sourceBeatIndexes: shotSourceBeatIndexes,
        deepDraftShot: deepDraftShotForDialogue,
      });

      // Speaker-aware sub-shots (speaker-aware sub-shots task, Package 3) —
      // resolve the tenant's opt-in flag right after dialogue resolution
      // (existing `resolveSubShotPolicy` helper, unchanged). The actual
      // split DECISION (`computeSpeakerSwitchSubShotPlan`) is computed
      // further below, AFTER the dialogue-refresh block (see there), so it
      // always sees the FINAL dialogue lines for this shot rather than a
      // stale pre-refresh set. Flag off => `subShotFlagOn` stays false and
      // every code path below this point behaves exactly as it did before
      // this feature (this shot always falls through to the pre-existing
      // single-prompt path).
      const { flagOn: subShotFlagOn, policy: subShotPolicy } =
        await resolveSubShotPolicy(tenantId);

      const shotDurationSeconds =
        matchingClip?.durationSeconds ?? storyboardShot?.durationSeconds ?? 8;

      // Resolve the episode-selected video model (Phase 1.2 resolution order).
      const selectedVideoModel = await resolveEpisodeVideoModel(pack);

      // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
      // option) — resolve the rollout gate + this call's effective
      // decision. `requestedNativeAudioEnabled` (the raw user preference,
      // independent of the rollout gate) is what gets PERSISTED onto the
      // pack below, so a user's choice survives the rollout flag switching
      // on later; `effectiveNativeAudioEnabled` (gated) is what's actually
      // passed to the generator. The service call itself still ANDs its own
      // model-capability check (`supportsNativeAudio`) on top of this value
      // — see `generateVerticalDramaShotVideoPrompt`'s `nativeAudioEnabled`
      // param doc comment.
      const nativeAudioPromptsEnabled =
        await resolveVerticalDramaNativeAudioPromptsFlag(tenantId);
      const requestedNativeAudioEnabled =
        input.nativeAudioEnabled ?? pack?.nativeAudioEnabled ?? false;
      const effectiveNativeAudioEnabled =
        nativeAudioPromptsEnabled && requestedNativeAudioEnabled;

      // Character identity map (2026-07-07 non-human-character-vanishing
      // fix) — same descriptor block the start-frame planner/grid prompts
      // use, so the shot-video-prompt service also knows a required
      // character's real identity (species/age) instead of a bare
      // `characterKey` when it writes motion/acting direction for them. See
      // `@shared/verticalDramaSeries/characterIdentityMap.ts`.
      const shotVideoCharacterIdentitySources =
        await resolveShotCharacterIdentitySources(
          tenantId,
          seriesId,
          frame?.requiredCharacterRefs
        );
      const shotVideoCharacterIdentityMapBlock = buildCharacterIdentityMapBlock(
        frame?.requiredCharacterRefs ?? [],
        shotVideoCharacterIdentitySources
      );
      // Lip-sync discipline fix (video-clip prompt speaker/silent-listener
      // attribution) — resolve each dialogue line's `characterKey` to its
      // roster DISPLAY name using the identity sources already fetched
      // above (no new DB query). Falls back to bare `characterKey` for any
      // speaker with no roster row/name (mirrors the established
      // `name || characterKey` convention). Used to build a speaker-
      // attributed mirror of `dialogueLines` for prompt/QC purposes only —
      // the canonical persisted `dialogueLines`/`clip.dialogue` arrays are
      // never mutated with this extra field.
      const shotVideoCharacterNameByKey = new Map(
        shotVideoCharacterIdentitySources
          .filter((c): c is typeof c & { name: string } => Boolean(c.name))
          .map(c => [c.characterKey, c.name])
      );
      const withSpeakerNames = <T extends { characterKey?: string }>(
        lines: readonly T[]
      ): Array<T & { speakerName?: string }> =>
        lines.map(l => ({
          ...l,
          speakerName: l.characterKey
            ? shotVideoCharacterNameByKey.get(l.characterKey)
            : undefined,
        }));
      // Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
      // — a shot whose dialogue was actually resolved from the Overview
      // page's canonical source above (`deepDraftShotForDialogue`, either an
      // explicit `silence_intent` or one-or-more `dialogue_lines`) must never
      // be handed to this heuristic quality gate: a human already
      // authored/confirmed this exact dialogue (or explicitly intended
      // silence), so it must never be auto-rewritten by
      // `generateVerticalDramaClipDialogue` just because it happens to look
      // "underfilled"/duplicated to the heuristic below.
      const dialogueResolvedFromCanonicalSource =
        deepDraftShotForDialogue !== null &&
        (deepDraftShotForDialogue.silence_intent !== undefined ||
          deepDraftShotForDialogue.dialogue_lines.length > 0);

      let extraDialogueCreditsUsed = 0;
      if (
        !dialogueResolvedFromCanonicalSource &&
        shouldRegenerateDialogueForVideoPrompt({
          pack,
          shotNumber: input.shotNumber,
          durationSeconds: shotDurationSeconds,
          dialogueLines,
        })
      ) {
        try {
          const freshDialogue = await generateVerticalDramaClipDialogue({
            userId,
            tenantId,
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            shotContext: {
              description: storyboardShot?.description,
              camera: storyboardShot?.cameraSetup,
              durationSeconds: shotDurationSeconds,
              characterIdentityMap: shotVideoCharacterIdentityMapBlock,
              sceneDialogueContext: dialogueLines.length
                ? dialogueLines.map(line =>
                    line.characterKey
                      ? `${line.characterKey}: "${line.lineTh}"`
                      : `"${line.lineTh}"`
                  )
                : undefined,
            },
            dialogueLanguage: pack?.dialogueLanguage,
            thaiAccent: pack?.thaiAccent,
            idempotencyKey: input.idempotencyKey
              ? `${input.idempotencyKey}:dialogue-refresh`
              : undefined,
          });
          dialogueLines = freshDialogue.dialogue;
          extraDialogueCreditsUsed = freshDialogue.creditsUsed;
        } catch (err) {
          if (err instanceof ClipDialogueInsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: "เครดิตไม่พอ" });
          }
          if (err instanceof ClipDialogueRateLimitExceededError) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: err.message,
            });
          }
          if (err instanceof ClipDialogueSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "สร้างบทพูดใหม่ไม่สำเร็จ ลองอีกครั้ง",
            });
          }
          throw err;
        }
      }

      // Location reference image (Phase E of `planning/polished-toasting-
      // gadget.md` — location visual bible) — resolved ONCE, before the
      // `needsSplit` branch below, so BOTH the split and non-split paths
      // thread the exact same value (mirrors `imageUrl`'s own "resolved once,
      // forwarded to whichever path runs" convention). Honors this shot's
      // per-shot override (`frame?.locationKey`, Phase D) via the shared
      // `resolveEffectiveShotLocationKey` precedence, then resolves that
      // key's approved reference image via
      // `resolveShotVideoPromptLocationReferenceImage`. Tolerant/zero-DB-
      // calls when the shot has no resolved location — every pre-existing
      // test of this mutation (none of whose fixtures carry a
      // `distinct_locations`/`locationKey` field) stays byte-identical.
      const shotVideoLocationIdentity = resolveEffectiveShotLocationIdentity(
        row.storyboard,
        input.shotNumber,
        frame?.locationKey
      );
      const shotVideoLocationReferenceImage =
        await resolveShotVideoPromptLocationReferenceImage(
          tenantId,
          userId,
          seriesId,
          shotVideoLocationIdentity,
          ctx.publicUrl ?? undefined
        );

      // Speaker-aware sub-shots (Package 3) — the deterministic split
      // decision, now that `dialogueLines` reflects any dialogue-refresh
      // above. `subShotDecision` stays `null` whenever the tenant flag is
      // off (`subShotFlagOn === false`), so `subShotDecision?.needsSplit` is
      // always falsy and every branch below this point is unchanged from
      // before this feature.
      const subShotDecision = subShotFlagOn
        ? computeSpeakerSwitchSubShotPlan(
            dialogueLines,
            shotDurationSeconds,
            subShotPolicy
          )
        : null;

      if (subShotDecision?.needsSplit) {
        // Multi-character reference images (multi-character disambiguation
        // fix, `polished-toasting-gadget.md`) — the split path's distinct-
        // speaker set is always >= 2 by `computeSpeakerSwitchSubShotPlan`'s
        // own construction whenever `needsSplit` is true (see
        // `deriveDistinctSpeakerCharacterKeysFromWindows`'s doc comment), so
        // no length gate is needed here, unlike the non-split path below.
        const splitShotVideoCharacterReferenceImages =
          await resolveShotVideoPromptCharacterReferenceImages(
            tenantId,
            userId,
            seriesId,
            deriveDistinctSpeakerCharacterKeysFromWindows(subShotDecision.windows),
            ctx.publicUrl ?? undefined
          );
        return generateAndPersistSplitShotVideoPrompt({
          tenantId,
          userId,
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          idempotencyKey: input.idempotencyKey,
          row,
          pack,
          imageUrl,
          approvedStartFrameAssetId: String(approvedMediaAssetId),
          imagePrompt: frame?.imagePrompt,
          storyboardShot,
          shotVideoCharacterIdentityMapBlock,
          dialogueLines,
          // Synopsis grounding + silence signal (`planning/vd-video-prompt-
          // skill-first/plan.md` Phase 1a/2) — same resolved deep-draft
          // entry the non-split path threads into `shotContext` above; see
          // `generateAndPersistSplitShotVideoPrompt`'s own param doc
          // comments for how it's applied.
          canonicalShotSummary: deepDraftShotForDialogue?.summary?.trim() || undefined,
          beatIsSilent: Boolean(deepDraftShotForDialogue?.silence_intent),
          // Lip-sync discipline fix — same `characterKey -> name` map the
          // non-split path uses below (`shotVideoCharacterNameByKey`,
          // resolved once from `shotVideoCharacterIdentitySources` — no new
          // DB query for the split path either).
          characterNameByKey: shotVideoCharacterNameByKey,
          tieInPlacement,
          tieInProductName,
          tieInProductCategory,
          selectedVideoModel,
          locale: normalizeVerticalDramaSeriesLocale(localeSeriesRow?.locale),
          shotDurationSeconds,
          speechBudgetEnabled,
          effectiveNativeAudioEnabled,
          requestedNativeAudioEnabled,
          extraDialogueCreditsUsed,
          subShotWindows: subShotDecision.windows,
          characterReferenceImages: splitShotVideoCharacterReferenceImages,
          locationReferenceImage: shotVideoLocationReferenceImage ?? undefined,
          sceneContinuityLockBlock: shotSceneContinuityLockBlock,
          // planning/`polished-toasting-gadget.md` Fix B — mirrors the
          // non-split branch's identical `repairInstruction: input.instruction`
          // below; `undefined` when the caller doesn't supply one (byte-
          // identical to before this fix).
          repairInstruction: input.instruction,
          attachShotImage: input.attachShotImage,
          additionalImageUrls: input.additionalImageUrls,
          // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-
          // family-quality/plan.md` Phase 2) — default ON.
          qualityLoop: input.qualityLoop ?? true,
          motionContractsEnabled,
        });
      }

      // Multi-character reference images (multi-character disambiguation
      // fix, `polished-toasting-gadget.md`) — only worth resolving when this
      // shot actually has 2+ required characters to disambiguate; a solo
      // shot has nothing to tell apart and shouldn't pay the extra
      // vision-token cost. Resolved AFTER the `needsSplit` branch above (so
      // a splitting shot, which resolves its OWN reference set from
      // `subShotDecision.windows`, never pays for this resolution twice).
      const shotVideoCharacterReferenceImages =
        (frame?.requiredCharacterRefs?.length ?? 0) >= (motionContractsEnabled ? 1 : 2)
          ? await resolveShotVideoPromptCharacterReferenceImages(
              tenantId,
              userId,
              seriesId,
              frame?.requiredCharacterRefs ?? [],
              ctx.publicUrl ?? undefined
            )
          : undefined;

      const motionContractStartedAt = Date.now();
      const result = await generateJudgedVerticalDramaShotVideoPrompt({
        userId,
        tenantId,
        seriesId,
        episodeId,
        shotNumber: input.shotNumber,
        imageUrl,
        imagePrompt: frame?.imagePrompt,
        characterReferenceImages: shotVideoCharacterReferenceImages,
        motionContractsEnabled,
        locationReferenceImage: shotVideoLocationReferenceImage ?? undefined,
        attachShotImage: input.attachShotImage,
        additionalImageUrls: input.additionalImageUrls,
        shotContext: {
          // Synopsis grounding (`planning/vd-video-prompt-skill-first/
          // plan.md` Phase 1a) — the canonical Overview-page beat, when this
          // shot has a deep-drafted entry (`deepDraftShotForDialogue`,
          // already resolved above for dialogue-source-of-truth purposes —
          // no extra DB read). `undefined` whenever the deep-story-drafts
          // flag is off or this shot has no deep-drafted entry yet,
          // preserving today's byte-identical prompt for every caller that
          // hasn't adopted deep drafts.
          canonicalShotSummary: deepDraftShotForDialogue?.summary?.trim() || undefined,
          // Persistence/pin root-cause fix (`planning/vd-video-prompt-
          // skill-first/plan.md` Phase 2) — true only when this shot's
          // deep-drafted entry explicitly marked it silent.
          beatIsSilent: Boolean(deepDraftShotForDialogue?.silence_intent),
          description: storyboardShot?.description,
          camera: storyboardShot?.cameraSetup,
          emotion: undefined,
          dialogueLines: dialogueLines.length ? withSpeakerNames(dialogueLines) : undefined,
          characterIdentityMap: shotVideoCharacterIdentityMapBlock,
          sceneContinuityLockBlock: shotSceneContinuityLockBlock,
          productContext: tieInPlacement
            ? {
                productName: tieInProductName,
                benefitTalkingPoint: tieInPlacement.benefitTalkingPoint,
                placementStyle: tieInPlacement.placementStyle,
                productCategory: tieInProductCategory,
              }
            : undefined,
        },
        // Retention hooks (W7) — omitted (all four) whenever the tenant flag
        // is off, reproducing the exact prior prompt byte-for-byte.
        retentionHooksEnabled,
        totalShotCount: shotVideoTotalShotCount,
        hookText: shotVideoHookText,
        retentionLoopDescription: shotVideoRetentionLoopDescription,
        selectedVideoModelId: selectedVideoModel.id,
        selectedVideoModel,
        locale: normalizeVerticalDramaSeriesLocale(localeSeriesRow?.locale),
        promptLanguage: pack?.promptLanguage,
        dialogueLanguage: pack?.dialogueLanguage,
        thaiAccent: pack?.thaiAccent,
        // Story-density reform (spec §7.7.2 Layer 4, section-13, added
        // 2026-07-07) — first-pass duration awareness for
        // `buildShotVideoPromptUserPrompt`; `shotDurationSeconds` is already
        // resolved above (used for the dialogue-refresh gate), so this is
        // pure reuse. Flag-gated: omitted entirely when off, so the
        // service call is byte-identical to before this change.
        ...(speechBudgetEnabled
          ? {
              shotDurationSeconds,
              targetSpeechSeconds:
                targetVerticalDramaSpeechSeconds(shotDurationSeconds),
            }
          : {}),
        // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
        // option) — already gated by the rollout flag + the user's
        // persisted preference above; the service itself still ANDs its
        // own model-capability check on top.
        nativeAudioEnabled: effectiveNativeAudioEnabled,
        idempotencyKey: input.idempotencyKey,
        // Part B3 (planning/`polished-toasting-gadget.md`) — compact episode
        // scene-setting plan context, resolved above.
        episodePlanContext: shotEpisodePlanContext,
        // planning/`polished-toasting-gadget.md` Fix B — threaded straight
        // through; `undefined` when the caller doesn't supply one, which
        // `buildShotVideoPromptUserPrompt` renders as no new instruction
        // line at all (byte-identical to before this fix).
        repairInstruction: input.instruction,
        // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-
        // family-quality/plan.md` Phase 2) — default ON.
        qualityLoop: input.qualityLoop ?? true,
      });
      if (result.motionContractStatus) {
        auditLogger.log({
          eventType: "vd_motion_contract_generated",
          userId,
          tenantId,
          model: result.model,
          metadata: {
            seriesId,
            episodeId,
            shot: input.shotNumber,
            effectiveRisk: result.effectiveRisk,
            contractStatus: result.motionContractStatus,
            modelFamily: result.family,
            observabilityPresent: Boolean(result.frameAnalysis),
            contractPresent: Boolean(result.motionProfile),
            ms: Date.now() - motionContractStartedAt,
          },
        });
      }

      // Brand/public-figure sanitize pass (Thai ad-compliance + video-policy
      // guard, 2026-07-06) — provider-facing VIDEO prompts must never contain
      // the product/brand name; identity comes from the locked reference
      // image, not prompt text. Run BEFORE the length-cap QC below so the
      // sanitized (shorter) text is what gets capped, never the reverse.
      if (tieInPlacement) {
        result.prompt = sanitizeBrandMentionsInPrompt(
          result.prompt,
          [tieInProductName],
          tieInProductCategory
        );
        if (result.negativeMotionPrompt) {
          result.negativeMotionPrompt = sanitizeBrandMentionsInPrompt(
            result.negativeMotionPrompt,
            [tieInProductName],
            tieInProductCategory
          );
        }
      }

      // Wave-7D (spec §8.2.2 flow-through rule, `verticalDramaSeriesPresetMixV2`)
      // — same deterministic append `generateVideoClip` already does to the
      // PROVIDER payload, anchored the same way (after the QC cap, same as
      // that call site — the appended tokens are short/fixed-length so this
      // mirrors `generateVideoClip`'s existing no-re-check convention
      // exactly). This wires the identical append onto the user-visible
      // FIRST-PASS prompt this procedure persists, so the preset's style
      // tokens are visible before the clip is ever paid-rendered, not only
      // injected right before the `generateVideoClip` render call.
      const { presetMixV2Enabled, seriesLookLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (presetMixV2Enabled || seriesLookLockEnabled) {
        const presetVisualIdentity = await loadEffectiveSeriesVisualIdentity(
          tenantId,
          userId,
          seriesId,
          { presetMixV2Enabled, seriesLookLockEnabled },
        );
        if (presetVisualIdentity) {
          result.prompt = appendPresetVisualIdentityStyleTokensToMotionPrompt(
            result.prompt,
            presetVisualIdentity
          );
        }
      }

      // Final post-transform validation: dialogue is protected after brand
      // sanitization and preset-token appends, immediately before persist.
      const finalVideoCapabilities = resolveVerticalDramaCapabilities(selectedVideoModel.id, {
        type: selectedVideoModel.type,
        aspectRatios: selectedVideoModel.aspectRatios,
        configJson: selectedVideoModel.configJson,
      });
      const shotVideoPromptQc = await ensurePromptWithinLimit({
        kind: "video",
        prompt: result.prompt,
        // Dialogue-duplication fix (2026-07-15) — protect each individual
        // spoken line, not the `buildNativeDialogueVerbatimBlock` boilerplate
        // block. See the sub-shots path's identical fix (near
        // `speakerSwitchGeneration.dialogue` above) for the full rationale.
        protectedFragments:
          finalVideoCapabilities.nativeAudioDialogue === true
            ? dialogueLines
                .map(l => l.lineTh.trim())
                // BARE, UNQUOTED line text (see the sub-shots site's comment):
                // a straight-quoted fragment never matches the refiner's
                // curly-quoted inline dialogue and gets wrongly re-appended.
                .filter(Boolean)
            : undefined,
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `shot video prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });
      result.prompt = shotVideoPromptQc.prompt;

      // Persist-pin (planning/`polished-toasting-gadget.md`, anti-lock-in fix
      // hardened by `planning/vd-video-prompt-skill-first/plan.md` Phase 2a)
      // — the video-prompt LLM's own `dialogue[]` output field is an ECHO of
      // the resolved `dialogueLines` sent into it above, not a guaranteed
      // pass-through (models occasionally reword/paraphrase a spoken line
      // while writing the surrounding motion prompt). Pin the PERSISTED (and
      // returned) dialogue back to `dialogueLines` verbatim — the exact
      // value that was resolved to feed the LLM, whether that came from the
      // new canonical Overview-page source (source 0) or any pre-existing
      // fallback source — so it can never silently drift from whatever the
      // user actually sees/edits at the Overview page. Three cases:
      //  (a) `dialogueLines` non-empty + Thai/undefined `dialogueLanguage` —
      //      pin to `dialogueLines` (the case above).
      //  (b) `dialogueLines` non-empty + translation actually required (a
      //      non-Thai `dialogueLanguage`) — there is no source-language line
      //      to pin back to, so the LLM's own translated `result.dialogue`
      //      remains authoritative.
      //  (c) `dialogueLines` is EMPTY (this shot has no resolved source
      //      dialogue at all, including a genuinely SILENT beat) — ANTI-LOCK-
      //      IN FIX (root cause of "silent beat becomes speaking,
      //      permanently"): persist `[]`, never `result.dialogue`. Before
      //      this fix, whatever line the video-prompt LLM happened to invent
      //      on a single call got written here as `matchingClip.dialogue`,
      //      which `resolveShotDialogueLines`'s Source 1 ("most
      //      authoritative") then returns on every LATER call — turning a
      //      one-time guess into permanent, code-enforced "ground truth"
      //      that the deterministic dialogue-stitch/render-time formatter
      //      then force-quotes with lip-sync forever after, even though the
      //      beat was never actually meant to speak. A guess must never be
      //      allowed to become durable ground truth just because the
      //      resolved source happened to be empty on one call — the NEXT
      //      call keeps resolving from the same (still-empty) source and
      //      gets a fresh chance, instead of being pinned to the first
      //      LLM's improvisation. (`result.prompt` — the LLM's own composed
      //      motion-prompt PROSE for THIS generation — is unaffected by this
      //      fix; only whether the invented `dialogue[]` line becomes
      //      persisted authoritative data changes.)
      const shouldPinDialogueToResolvedSource =
        dialogueLines.length > 0 &&
        (pack?.dialogueLanguage === "th" || pack?.dialogueLanguage === undefined);
      const persistedDialogue = shouldPinDialogueToResolvedSource
        ? dialogueLines
        : dialogueLines.length > 0
          ? result.dialogue
          : [];

      // Model-family-aware, vision-grounded video prompt quality upgrade
      // (`planning/vd-video-prompt-model-family-quality/plan.md`) — stamp
      // which family this prompt was shaped for onto the persisted clip so
      // the storyboard UI can show a family badge + mismatch warning.
      // `family` is the SERVICE's own resolution (`result.family`, always
      // present, never re-derived here); `modelId`/`modelName` come from the
      // already-resolved `selectedVideoModel` row.
      const shotVideoPromptModelTarget: VideoPromptModelTarget = {
        family: result.family,
        modelId: selectedVideoModel.id,
        modelName: selectedVideoModel.name,
        generatedAt: new Date().toISOString(),
      };
      // Position-anchor compliance warning(s) (item C) — converted onto the
      // pack's existing structured `warnings` mechanism, and also logged
      // with the established `[vd_video_prompt]` prefix for audit-log
      // visibility. Empty/`undefined` for the overwhelming majority of
      // calls (fail-open by design — see the service's own doc comment).
      const shotVideoPromptWarnings: VerticalDramaWarning[] = (result.warnings ?? []).map(
        message => ({
          code: "vd_video_prompt_position_anchor_degraded",
          severity: "warning" as const,
          message,
          targetShotNumber: input.shotNumber,
          targetClipNumber: input.shotNumber,
          repairable: true,
        }),
      );
      if (shotVideoPromptWarnings.length > 0) {
        console.warn(
          "[vd_video_prompt] position-anchor check degraded",
          { seriesId, episodeId, shotNumber: input.shotNumber },
          shotVideoPromptWarnings.map(w => w.message),
        );
      }

      // Persist onto the matching clip — create a minimal clip entry if the
      // pack exists but has no matching clip, or a minimal pack if the pack
      // itself is entirely absent (mirrors `setEpisodeModelSelection`'s
      // create-minimal-pack convention so the user's selected video model
      // stays intact).
      //
      // 2026-07-11 lost-update race fix (bug report: "clicking generate on
      // several shots at once — only some shots show a result, no error").
      // This mutation is slow (LLM vision call above can take many
      // seconds), and every call for this episode read `pack` from the SAME
      // `loadOwnedEpisode` snapshot taken near the top of this procedure.
      // When two shots' calls overlap, both built their `updatedClips` off
      // that same stale `pack.clips` and then did a blind whole-column
      // `UPDATE ... SET motionPromptPack = updatedPack`, so whichever call's
      // write landed LAST silently clobbered the earlier call's
      // just-persisted clip — each individual call still returned 200 (no
      // TRPCError, hence no toast), so the data loss was invisible until
      // the next `getEpisodeDetail` refetch. Fix: lock the row and re-read
      // the FRESHEST `motionPromptPack` inside a transaction immediately
      // before merging + writing, so the merge is always based on
      // up-to-date data and concurrent writers serialize instead of
      // clobbering each other. The slow LLM call itself still runs OUTSIDE
      // the transaction/lock (only the final merge+write is atomic).
      await db.transaction(async tx => {
        const [freshRow] = await tx
          .select({ motionPromptPack: verticalDramaEpisodes.motionPromptPack })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          )
          .for("update")
          .limit(1);
        const freshPack =
          (freshRow?.motionPromptPack as VerticalDramaMotionPromptPack | null) ??
          pack;

        let updatedPack: VerticalDramaMotionPromptPack;
        if (freshPack) {
          // Replace, don't in-place-overwrite: remove every existing clip
          // for this shot (whether it was previously a single clip or a
          // prior split's 2-3 sub-shot clips, matched by EITHER
          // `sourceShotNumbers` OR `parentShotNumber` — a stale split
          // sub-shot clip's `sourceShotNumbers` still includes this shot
          // even though it's not the first match) before inserting exactly
          // ONE fresh clip. This mirrors
          // `generateAndPersistSplitShotVideoPrompt`'s own
          // "regenerate overwrites" convention, and is required here
          // because a shot can transition from split -> single between two
          // calls (the split decision is recomputed fresh every call), in
          // which case a `findIndex`-based in-place overwrite only touches
          // the FIRST matching sub-shot clip and leaves the rest behind as
          // stale duplicates (2026-07-11 dup-clip bug fix).
          const remainingClips = freshPack.clips.filter(
            c =>
              !(
                c.sourceShotNumbers?.includes(input.shotNumber) ||
                c.parentShotNumber === input.shotNumber
              )
          );
          const updatedClips = [
            ...remainingClips,
            {
              clipNumber: input.shotNumber,
              sourceShotNumbers: [input.shotNumber],
              prompt: result.prompt,
              negativeMotionPrompt: result.negativeMotionPrompt,
              durationSeconds: storyboardShot?.durationSeconds ?? 8,
              startFrameAssetId: String(approvedMediaAssetId),
              dialogue: persistedDialogue,
              requiredDisclosure: result.requiredDisclosure,
              audioDirection: result.audioDirection,
              promptModelTarget: shotVideoPromptModelTarget,
              frameAnalysis: result.frameAnalysis,
              ...(result.motionContractStatus
                ? {
                    motionContractStatus: result.motionContractStatus,
                    ...(result.motionProfile
                      ? {
                          motionProfile: result.motionProfile,
                          effectiveRisk: result.effectiveRisk,
                        }
                      : {}),
                  }
                : {}),
              promptQuality: result.promptQuality,
            },
          ];
          // Vertical Drama task #36 — persist the RAW user preference
          // (independent of the rollout gate) so it survives the flag
          // switching on later; see `requestedNativeAudioEnabled`'s own doc
          // comment above.
          updatedPack = {
            ...freshPack,
            clips: updatedClips,
            nativeAudioEnabled: requestedNativeAudioEnabled,
            // Model-family-aware, vision-grounded video prompt quality
            // upgrade (item C) — only touches `warnings` when the service
            // actually surfaced one, so a call with nothing to report stays
            // byte-identical to `freshPack.warnings`.
            ...(shotVideoPromptWarnings.length > 0
              ? { warnings: [...freshPack.warnings, ...shotVideoPromptWarnings] }
              : {}),
          };
        } else {
          updatedPack = {
            selectedVideoModelId: selectedVideoModel.id,
            durationProfileId:
              row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
            motionMode: "first_frame_to_video",
            nativeAudioEnabled: requestedNativeAudioEnabled,
            clips: [
              {
                clipNumber: input.shotNumber,
                sourceShotNumbers: [input.shotNumber],
                prompt: result.prompt,
                negativeMotionPrompt: result.negativeMotionPrompt,
                durationSeconds: storyboardShot?.durationSeconds ?? 8,
                startFrameAssetId: String(approvedMediaAssetId),
                dialogue: persistedDialogue,
                requiredDisclosure: result.requiredDisclosure,
                audioDirection: result.audioDirection,
                promptModelTarget: shotVideoPromptModelTarget,
                frameAnalysis: result.frameAnalysis,
                ...(result.motionContractStatus
                  ? {
                      motionContractStatus: result.motionContractStatus,
                      ...(result.motionProfile
                        ? {
                            motionProfile: result.motionProfile,
                            effectiveRisk: result.effectiveRisk,
                          }
                        : {}),
                    }
                  : {}),
                promptQuality: result.promptQuality,
              },
            ],
            warnings: shotVideoPromptWarnings,
          };
        }

        await tx
          .update(verticalDramaEpisodes)
          .set({
            motionPromptPack: stampArtifactForStoryboard(
              updatedPack as unknown as Record<string, unknown>,
              row.storyboard,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaEpisodes.id, episodeId),
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          );
      });

      return {
        prompt: result.prompt,
        dialogue: persistedDialogue,
        creditsUsed: result.creditsUsed + extraDialogueCreditsUsed,
        usedVision: result.usedVision,
        audioDirection: result.audioDirection,
        promptModelTarget: shotVideoPromptModelTarget,
        promptQuality: result.promptQuality,
      };
    }),

  /**
   * Regenerate ONE shot's spoken dialogue from scratch (2026-07-07 fix —
   * "unusable dialogue" bug report: `resolveShotDialogueLines`'s script
   * fallback can recover a stage-direction/sound-cue fragment verbatim as if
   * it were a spoken line, e.g. `เสียง…ชา…อืม…`, and re-running
   * `generateShotVideoPrompt` intentionally never touches existing dialogue —
   * see that mutation's own dialogue-sourcing fallback chain doc comment).
   *
   * This is the explicit user-triggered override path: writes a FRESH 2-4
   * line exchange from the shot's storyboard/script context (+ optional
   * free-text creative instruction) via
   * `generateVerticalDramaClipDialogue`, then OVERWRITES the matching clip's
   * `dialogue` array — creating a minimal clip/pack first if neither exists
   * yet, mirroring `generateShotVideoPrompt`'s own create-minimal-pack
   * convention exactly so a user can fix dialogue before ever generating a
   * video prompt.
   */
  regenerateClipDialogue: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        instruction: z.string().trim().max(500).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);

      const storyboard = row.storyboard as VerticalDramaShotgrid | null;
      const storyboardShot = storyboard?.shots?.find(
        s => s.shotNumber === input.shotNumber
      );

      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const matchingClip = pack?.clips?.find(c =>
        c.sourceShotNumbers?.includes(input.shotNumber)
      );

      // Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
      // — resolved BEFORE any LLM/credit/rate-limit work below (same gate/
      // resolution shape as `generateShotVideoPrompt`'s
      // `deepDraftShotForDialogue`): when this shot carries a canonical
      // dialogue (or an explicit `silence_intent`) at the Overview page,
      // this mutation always syncs to / rejects based on THAT source alone
      // and never calls the LLM, confirmed with the user — "สร้างบทพูดใหม่"
      // is not a substitute editor for Overview-authored dialogue.
      const deepStoryDraftsEnabledForRegen =
        await resolveVerticalDramaDeepStoryDraftsFlag(tenantId);
      let deepDraftShotForRegen: VdDeepDraftShotDraft | null = null;
      if (deepStoryDraftsEnabledForRegen) {
        const [regenLocaleSeriesRow] = await db
          .select({ bible: verticalDramaSeries.bible })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId),
              eq(verticalDramaSeries.userId, userId)
            )
          )
          .limit(1);
        const { getActiveBreakdown, readItemShotDrafts } = await import(
          "../services/verticalDramaStoryBible"
        );
        const regenEpisodePlanItem = getActiveBreakdown(
          (regenLocaleSeriesRow?.bible as Record<string, unknown> | null) ??
            null
        ).find(item => item.episodeNumber === Number(row.episodeNumber));
        deepDraftShotForRegen = regenEpisodePlanItem
          ? ((readItemShotDrafts(regenEpisodePlanItem) ?? []).find(
              s => s.shot_number === input.shotNumber
            ) ?? null)
          : null;
      }

      if (deepDraftShotForRegen?.silence_intent) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ช็อตนี้ถูกกำหนดไว้ว่าตั้งใจไม่มีบทพูด — แก้ไขได้ที่หน้าภาพรวม (Overview)",
        });
      }
      const canonicalDialogueLinesForRegen: ShotDialogueLine[] | null =
        deepDraftShotForRegen && deepDraftShotForRegen.dialogue_lines.length > 0
          ? deepDraftShotForRegen.dialogue_lines
              .map(mapDeepDraftDialogueLineToShotDialogueLine)
              .filter(l => l.lineTh.trim().length > 0)
          : null;

      let result: { dialogue: ShotDialogueLine[]; creditsUsed: number };
      const syncedFromCanonical = canonicalDialogueLinesForRegen !== null;
      if (canonicalDialogueLinesForRegen) {
        // Sync-only: no LLM call, no credits, `input.instruction` (if any)
        // is deliberately ignored — the canonical Overview-page dialogue
        // always wins.
        result = { dialogue: canonicalDialogueLinesForRegen, creditsUsed: 0 };
      } else {
        // Existing (possibly broken) dialogue + nearby script scene dialogue —
        // passed only as TONE/CONTINUITY context, never copied verbatim; see
        // `generateVerticalDramaClipDialogue`'s system prompt for the explicit
        // "do not reuse a broken/fragment line as-is" instruction.
        const knownSpeakerKeysForDialogueRegen = await loadSeriesKnownSpeakerKeys(
          tenantId,
          seriesId
        );
        const existingDialogueLines = resolveShotDialogueLines({
          shotNumber: input.shotNumber,
          matchingClip,
          dialogueAudioPlan: row.dialogueAudioPlan as {
            dialogue_lines?: Array<Record<string, unknown>>;
          } | null,
          script: row.script as Record<string, unknown> | null,
          storyboardShotCount: storyboard?.shots?.length,
          knownSpeakerKeys: knownSpeakerKeysForDialogueRegen,
        });
        const sceneDialogueContext = existingDialogueLines
          .map(l =>
            l.characterKey ? `${l.characterKey}: "${l.lineTh}"` : `"${l.lineTh}"`
          )
          .filter(l => l.length > 0);

        // Character identity map — same convention as `generateShotVideoPrompt`,
        // so the dialogue writer knows exactly which character keys are valid
        // speakers for this shot (used by the parser-cleanup rules too).
        const clipDialogueCharacterIdentitySources =
          await resolveShotCharacterIdentitySources(
            tenantId,
            seriesId,
            frame?.requiredCharacterRefs
          );
        const clipDialogueCharacterIdentityMapBlock =
          buildCharacterIdentityMapBlock(
            frame?.requiredCharacterRefs ?? [],
            clipDialogueCharacterIdentitySources
          );
        const shotDurationSeconds =
          matchingClip?.durationSeconds ?? storyboardShot?.durationSeconds ?? 8;

        try {
          result = await generateVerticalDramaClipDialogue({
            userId,
            tenantId,
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            shotContext: {
              description: storyboardShot?.description,
              camera: storyboardShot?.cameraSetup,
              durationSeconds: shotDurationSeconds,
              characterIdentityMap: clipDialogueCharacterIdentityMapBlock,
              sceneDialogueContext: sceneDialogueContext.length
                ? sceneDialogueContext
                : undefined,
            },
            instruction: input.instruction,
            dialogueLanguage: pack?.dialogueLanguage,
            thaiAccent: pack?.thaiAccent,
            idempotencyKey: input.idempotencyKey,
          });
        } catch (err) {
          if (err instanceof ClipDialogueInsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: "เครดิตไม่พอ" });
          }
          if (err instanceof ClipDialogueRateLimitExceededError) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: err.message,
            });
          }
          if (err instanceof ClipDialogueSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "สร้างบทพูดใหม่ไม่สำเร็จ ลองอีกครั้ง",
            });
          }
          throw err;
        }
      }

      // Persist onto the matching clip's `dialogue` — OVERWRITES any existing
      // (possibly broken) dialogue array, this mutation's whole purpose.
      // Create a minimal clip/pack when neither exists yet, exactly mirroring
      // `generateShotVideoPrompt`'s create-minimal-pack convention.
      let updatedPack: VerticalDramaMotionPromptPack;
      if (pack) {
        // Replace, don't in-place-overwrite: this mutation has no concept
        // of per-sub-shot dialogue (the caller only ever passes a bare
        // `shotNumber`, never a `subShotNumber` — see
        // `handleRegenerateClipDialogue` in `VerticalDramaEpisodePage.tsx`),
        // so writing a dialogue result here always COLLAPSES whatever is
        // currently on this shot (one single clip, or a stale/live split's
        // 2-3 sub-shot clips) down to exactly ONE clip. A `findIndex`-based
        // in-place overwrite only touched the FIRST matching sub-shot clip
        // and left any remaining sub-shot clips behind as stale duplicates
        // (2026-07-11 dup-clip bug fix) — mirrors
        // `generateAndPersistSplitShotVideoPrompt`'s own
        // "regenerate overwrites" filter convention.
        //
        // The survivor is seeded from `matchingClip` (the first match,
        // i.e. whichever sub-shot the user was actually looking at) so its
        // `prompt`/other fields carry over as the merged clip's baseline —
        // then `parentShotNumber`/`subShotNumber` are cleared since it's no
        // longer a sub-shot once collapsed.
        const remainingClips = pack.clips.filter(
          c =>
            !(
              c.sourceShotNumbers?.includes(input.shotNumber) ||
              c.parentShotNumber === input.shotNumber
            )
        );
        const { parentShotNumber: _droppedParentShotNumber, subShotNumber: _droppedSubShotNumber, ...matchingClipRest } =
          matchingClip ?? {};
        const updatedClips = [
          ...remainingClips,
          {
            ...matchingClipRest,
            // Explicit overrides AFTER the spread — must win over whatever
            // `matchingClip` (the pre-collapse sub-shot) happened to carry,
            // since the collapsed clip is scoped to the whole shot, not the
            // sub-shot `matchingClip` came from.
            clipNumber: input.shotNumber,
            sourceShotNumbers: [input.shotNumber],
            prompt: matchingClip?.prompt ?? "",
            durationSeconds: storyboardShot?.durationSeconds ?? 8,
            dialogue: result.dialogue,
          },
        ];
        updatedPack = { ...pack, clips: updatedClips };
      } else {
        const fallbackVideoModel = await resolveEpisodeVideoModel(null);
        updatedPack = {
          selectedVideoModelId: fallbackVideoModel.id,
          durationProfileId:
            row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
          motionMode: "first_frame_to_video",
          clips: [
            {
              clipNumber: input.shotNumber,
              sourceShotNumbers: [input.shotNumber],
              prompt: "",
              durationSeconds: storyboardShot?.durationSeconds ?? 8,
              dialogue: result.dialogue,
            },
          ],
          warnings: [],
        };
      }

      await db
        .update(verticalDramaEpisodes)
        .set({ motionPromptPack: updatedPack, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        );

      return {
        dialogue: result.dialogue,
        creditsUsed: result.creditsUsed,
        // Additive (planning/`polished-toasting-gadget.md`) — `true` only on
        // the sync-only path above, so the frontend can swap the toast copy
        // from "generated new dialogue" to "synced from the Overview page".
        // Omitted (not `false`) on the pre-existing LLM path, matching this
        // field's own "additive optional" contract.
        ...(syncedFromCanonical ? { synced: true } : {}),
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* Shot references (storyboard-complete plan, Phase 2.2)                    */
  /* ------------------------------------------------------------------------ */

  /**
   * List every reference image linked to any shot in this episode, grouped by
   * shot number (with a joined thumbnail URL) — thin wrapper over
   * `verticalDramaShotReferencesService.listForEpisode`. Read-only.
   */
  listShotReferences: verticalDramaProcedure
    .input(
      z.object({ seriesId: z.string().min(1), episodeId: z.string().min(1) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      try {
        const references =
          await verticalDramaShotReferencesService.listForEpisode(
            { tenantId, userId, seriesId },
            episodeId
          );
        return { references };
      } catch (err) {
        mapShotReferenceError(err);
      }
    }),

  /**
   * Link an existing canonical `media_assets` row as an additional reference
   * image for one shot (from a 3x3 grid cut, generation history, the media
   * library, or direct upload). Idempotent on `(episodeId, shotNumber,
   * mediaAssetId)` — a retried call returns the existing row unchanged rather
   * than duplicating it. No credits — this only links an already-generated
   * asset, it never renders anything new.
   */
  linkShotReference: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        mediaAssetId: z.string().min(1),
        role: z.enum(["start_frame", "reference"]).optional(),
        source: z.enum([
          "generated",
          "grid_cut",
          "history",
          "library",
          "upload",
          "previous_main",
          // Phase 6 (`planning/vd-start-frame-reference-mapping/plan.md`) —
          // user-controlled supplementary reference frame, linked by the
          // client after `generateShotReferenceFrameImage` completes.
          // `varchar(20)` column, no migration needed.
          "reference_frame",
        ]),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const mediaAssetId = parseId(input.mediaAssetId, "media asset id");
      try {
        const reference =
          await verticalDramaShotReferencesService.linkReference({
            tenantId,
            userId,
            seriesId,
            episodeId,
            shotNumber: input.shotNumber,
            mediaAssetId,
            role: input.role as VerticalDramaShotReferenceRole | undefined,
            source: input.source as VerticalDramaShotReferenceSource,
            sortOrder: input.sortOrder,
          });
        return { reference };
      } catch (err) {
        mapShotReferenceError(err);
      }
    }),

  /**
   * Permanently remove a reference image from a shot's reference set. Only
   * unlinks the `verticalDramaShotReferences` row — the underlying media
   * asset is left intact in Media History/Library (same convention as
   * `verticalDramaCharacters.ts`'s `deleteAsset`).
   */
  deleteShotReference: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        referenceId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      // `episodeId` is accepted for symmetry with the sibling shot-reference
      // procedures (and so the client can pass its already-known scope
      // without a special case) but the service itself scopes
      // `deleteReference` by tenant+user+series only — `parseId` still
      // validates the shape so a malformed id fails fast with BAD_REQUEST.
      parseId(input.episodeId, "episode id");
      const referenceId = parseId(input.referenceId, "reference id");
      try {
        await verticalDramaShotReferencesService.deleteReference(
          { tenantId, userId, seriesId },
          referenceId
        );
        return { deleted: true };
      } catch (err) {
        mapShotReferenceError(err);
      }
    }),

  /**
   * Re-order the reference strip for one shot. `orderedReferenceIds` must be
   * the complete ordered list of reference ids for that shot — array index
   * becomes the persisted `sortOrder`. Ids not owned by the caller/shot are
   * silently skipped by the service (never throws for a stale client list).
   */
  reorderShotReferences: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().positive(),
        orderedReferenceIds: z.array(z.string().min(1)).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const orderedReferenceIds = input.orderedReferenceIds.map(id =>
        parseId(id, "reference id")
      );
      try {
        const references = await verticalDramaShotReferencesService.reorder({
          tenantId,
          userId,
          seriesId,
          episodeId,
          shotNumber: input.shotNumber,
          orderedReferenceIds,
        });
        return { references };
      } catch (err) {
        mapShotReferenceError(err);
      }
    }),

  /* ------------------------------------------------------------------------ */
  /* Episode quality review (storyboard-complete plan, Phase 3B.5)            */
  /* ------------------------------------------------------------------------ */

  /**
   * Run the `vertical-drama-episode-quality-review` skill against the
   * episode's current script + storyboard + (optional) dialogue plan, and
   * persist the resulting scorecard so it survives reload — via the
   * EXISTING run/artifact ledger tables
   * (`verticalDramaEpisodeRuns`/`verticalDramaRunArtifacts`), tagged with
   * `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG` rather than a real pipeline
   * stage (see that constant's doc comment for why). Meant to run BEFORE the
   * user spends credits on image/video generation — cheap, LLM-only,
   * advisory (never blocks; the caller decides what to do with the
   * scorecard). Credits are handled entirely inside
   * `runVerticalDramaEpisodeQualityReview` (check → call → deduct).
   */
  runEpisodeQualityReview: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        // "ตรวจใหม่ แนะนำแนวทางอื่น" ("re-review, suggest a different
        // approach") — when set, the previous stored review's issues are
        // fed back into the prompt with an instruction to propose
        // substantively DIFFERENT alternative issues/fixes rather than the
        // same ones rephrased (see `RunEpisodeQualityReviewParams.avoidPrevious`).
        avoidPrevious: z.boolean().optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const script = row.script as Record<string, unknown> | null;
      const storyboard = row.storyboard as Record<string, unknown> | null;
      if (!script || !storyboard) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Episode needs a generated script and storyboard before it can be quality-reviewed",
        });
      }
      const dialoguePlan = row.dialogueAudioPlan as Record<
        string,
        unknown
      > | null;

      // Only consulted when `avoidPrevious` is set — loaded BEFORE the LLM
      // call so a "no previous review yet" case degrades gracefully to a
      // normal (non-avoid) review instead of erroring.
      const previousReviewForAvoid = input.avoidPrevious
        ? await loadLatestQualityReview({
            tenantId,
            userId,
            seriesId,
            episodeId,
          })
        : null;

      // Guard against pathologically large payloads before spending an LLM
      // call on them — a malformed/looping script or storyboard could
      // otherwise blow past the model's context window and burn credits on
      // a call that was always going to fail.
      const serializedSize =
        JSON.stringify(script).length +
        JSON.stringify(storyboard).length +
        (dialoguePlan ? JSON.stringify(dialoguePlan).length : 0);
      if (serializedSize > 400_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Episode script/storyboard/dialogue plan is too large to quality-review",
        });
      }

      const [qualityReviewSeriesRow] = await db
        .select({
          locale: verticalDramaSeries.locale,
          productTieIn: verticalDramaSeries.productTieIn,
          qualityPolicy: verticalDramaSeries.qualityPolicy,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId)
          )
        )
        .limit(1);

      // Wave-4A (spec §16.1/§13.1, section-14) — hybrid scoring + tie-in
      // passthrough, additive and flag-gated. Flags off (or absent series
      // row) reproduces the EXACT v1 call shape below unchanged (`densityMetrics`/
      // `tieInConfig` both stay `undefined`, which
      // `runVerticalDramaEpisodeQualityReview` already documents as byte-
      // identical to v1 behavior).
      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      const { speechBudgetEnabled } =
        await resolveVerticalDramaDensityFlags(tenantId);
      const { qualityLoopV2Enabled, tieInQcEnabled, storyLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`
      // W6, router-wiring package, added 2026-07-11) — resolved once for
      // this mutation, same convention as every other flag above.
      const retentionHooksEnabled =
        await resolveVerticalDramaRetentionHooksFlag(tenantId);
      const resolvedPolicy = resolveQualityPolicy(
        (qualityReviewSeriesRow?.qualityPolicy as Partial<VerticalDramaQualityPolicy> | null) ??
          null,
        resolveVerticalDramaTenantQualityPolicy(tenantId)
      );

      const motionPromptPackForMetrics =
        row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const clipDurationsForMetrics = motionPromptPackForMetrics?.clips?.length
        ? motionPromptPackForMetrics.clips.map(c => ({
            shotNumber: c.sourceShotNumbers?.[0],
            clipNumber: c.clipNumber,
            durationSeconds: c.durationSeconds,
          }))
        : undefined;
      const densityMetrics: VerticalDramaDensityMetrics | undefined =
        qualityLoopV2Enabled || speechBudgetEnabled
          ? computeVerticalDramaDensityMetrics({
              script,
              storyboard,
              dialoguePlan,
              clipDurations: clipDurationsForMetrics,
            })
          : undefined;

      const seriesTieInConfig =
        (qualityReviewSeriesRow?.productTieIn as VerticalDramaProductTieInConfig | null) ??
        null;
      const tieInConfigForReview =
        tieInQcEnabled && seriesTieInConfig?.enabled
          ? { ...seriesTieInConfig, enabled: true as const }
          : undefined;

      // Retention hooks (W6) — same conditional-computation convention as
      // `densityMetrics` above: only built when the flag is actually on, so
      // a flag-off request never even calls `computeRetentionMetrics` or
      // queries prior episodes.
      const retentionMetrics: VerticalDramaRetentionMetrics | undefined =
        retentionHooksEnabled
          ? computeRetentionMetrics({
              script,
              storyboard,
              recentRetentionLoopTypes: await loadRecentVerticalDramaRetentionLoopTypes(
                owner,
                row.episodeNumber
              ),
            })
          : undefined;

      let outcome: {
        review: EpisodeQualityReviewOutput;
        creditsUsed: number;
        model: string;
      };
      try {
        outcome = await runVerticalDramaEpisodeQualityReview({
          userId,
          tenantId,
          seriesId,
          episodeId,
          episodeTitle: row.title ?? `Episode ${row.episodeNumber}`,
          locale: normalizeVerticalDramaSeriesLocale(
            qualityReviewSeriesRow?.locale
          ),
          script,
          storyboard,
          dialoguePlan,
          avoidPrevious: input.avoidPrevious && previousReviewForAvoid != null,
          previousIssues: previousReviewForAvoid?.issues,
          idempotencyKey: input.idempotencyKey,
          densityMetrics,
          tieInConfig: tieInConfigForReview,
          // W11.6 "Story Lock" — execution-only suggested_fix instruction
          // (story dims still scored as usual). Omitted (byte-identical
          // prompt) whenever the tenant flag is off.
          reviewMode: storyLockEnabled ? "execution" : undefined,
          // Retention hooks (W6) — omitted (both, byte-identical prompt)
          // whenever the tenant flag is off.
          scoreRetentionDimensions: retentionHooksEnabled,
          retentionMetrics,
        });
      } catch (err) {
        if (err instanceof QualityReviewInsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof QualityReviewVdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err.message,
          });
        }
        if (err instanceof QualityReviewRateLimitExceededError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Episode quality review failed",
        });
      }

      // Persist via the existing run/artifact ledger tables (see
      // `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc comment) so the
      // scorecard survives reload — `getEpisodeDetail` reads it back via
      // `loadLatestQualityReview`.
      await persistQualityReviewArtifact(
        { tenantId, userId, seriesId, episodeId },
        outcome.review
      );

      // Wave-4A (spec §13.1) — fold the tie-in naturalness report into this
      // SAME review call (no second LLM call); no-op when tie-in QC does not
      // apply to this episode. Best-effort: a failure here must not discard
      // an otherwise-successful, already-paid-for review.
      let tieInQualityReport: Awaited<
        ReturnType<typeof maybeBuildAndPersistTieInQualityReport>
      > = null;
      try {
        tieInQualityReport = await maybeBuildAndPersistTieInQualityReport({
          owner,
          tieInQcEnabled,
          script,
          storyboard,
          dialogueAudioPlan: dialoguePlan,
          review: outcome.review,
          policy: resolvedPolicy,
        });
      } catch (err) {
        debugError(
          "verticalDramaEpisodes.runEpisodeQualityReview",
          `maybeBuildAndPersistTieInQualityReport failed (episodeId=${episodeId}) — the quality review itself already succeeded`,
          err
        );
      }

      return {
        review: outcome.review,
        creditsUsed: outcome.creditsUsed,
        tieInQualityReport,
      };
    }),

  /**
   * "อนุมัติและปรับเรื่องตามคำแนะนำ" (approve + auto-apply quality-review
   * suggestions): loads the LATEST persisted quality review, groups its
   * `issues[]` by the pipeline stage each references (script vs storyboard —
   * see `verticalDramaQualityReviewApply.ts`), and composes ONE combined
   * repair instruction per affected stage. Reuses
   * `verticalDramaEpisodePipeline.repairStage(...)` directly — the SAME
   * internal repair path `repairStageOutput` calls — so this is not a new
   * repair engine, just an automated multi-issue caller of the existing one.
   * Script is repaired before storyboard (matches canonical pipeline order —
   * the storyboard is generated from the script) so any script-level fix is
   * reflected before the storyboard repair instruction is composed... note
   * the storyboard repair instruction is still built from the ORIGINAL
   * review's storyboard-classified issues (not re-derived from the just-
   * repaired script), since re-deriving would require a fresh review first —
   * which is exactly what the auto re-review step below provides for the
   * NEXT iteration of this loop.
   *
   * After repairs complete, automatically re-runs
   * `runVerticalDramaEpisodeQualityReview` once more and persists it (same
   * `persistQualityReviewArtifact` path), so the UI can immediately show a
   * fresh scorecard without a separate manual "check quality" click. A
   * re-review failure does not fail the whole mutation — the repairs already
   * succeeded and are real, paid work the user should not lose visibility
   * into; it is surfaced as a `warning` string instead.
   */
  applyQualityReviewSuggestions: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        // Wave-4A (spec §16.1) — bounded auto-improve loop mode. Only takes
        // effect when `verticalDramaSeriesQualityLoopV2` is enabled for the
        // tenant; omitted/false (or the flag off) reproduces the EXACT v1
        // single manual-apply + one auto-re-review behavior below unchanged.
        loop: z.boolean().optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);

      const latestReview = await loadLatestQualityReview(owner);
      if (!latestReview) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ยังไม่มีผลตรวจคุณภาพให้ปรับตาม — กรุณาตรวจคุณภาพก่อน",
        });
      }

      const { qualityLoopV2Enabled, storyLockEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`,
      // router-wiring package, added 2026-07-11) — resolved ONCE for this
      // mutation, reused by both the repair loop below and the auto
      // re-review call. `runApplyQualityReviewSuggestionsLoop` resolves its
      // own copy internally (separate function, separate request-scoped
      // resolution), same convention as `storyLockEnabled` above.
      const retentionHooksEnabled =
        await resolveVerticalDramaRetentionHooksFlag(tenantId);

      if (input.loop) {
        if (qualityLoopV2Enabled) {
          return runApplyQualityReviewSuggestionsLoop({
            owner,
            idempotencyKey: input.idempotencyKey,
          });
        }
      }

      const grouped = groupQualityReviewIssuesByStage(
        latestReview.issues ?? []
      );
      if (grouped.length === 0) {
        return {
          stagesRepaired: [] as VerticalDramaPipelineStage[],
          staleStages: [] as VerticalDramaPipelineStage[],
          newReview: null as EpisodeQualityReviewOutput | null,
          warning: null as string | null,
        };
      }

      const stagesRepaired: VerticalDramaPipelineStage[] = [];
      const staleStagesSet = new Set<VerticalDramaPipelineStage>();
      // W11.6 "Story Lock" — tallied purely for this v1 single-apply path's
      // own `warning` string (this branch has no persisted loop-state
      // object to carry a `storyLockRejections` field on); stays 0 whenever
      // the flag is off or nothing was ever rejected.
      let storyLockRejectionsThisApply = 0;
      for (const group of grouped) {
        const instruction = composeQualityReviewRepairInstruction(
          group.issues,
          storyLockEnabled ? { storyLockStage: group.stage } : undefined
        );
        const { outcome, storyLockViolated } =
          await repairVerticalDramaStageWithStoryLockGuard(
            owner,
            group.stage,
            instruction,
            storyLockEnabled,
            retentionHooksEnabled
          );
        if (storyLockViolated) {
          storyLockRejectionsThisApply++;
          // Rejected + reverted — the live content is back to prior, so this
          // group was not actually repaired and nothing downstream is stale.
          continue;
        }
        stagesRepaired.push(group.stage);
        for (const stale of outcome.staleStages) staleStagesSet.add(stale);
      }

      // Auto re-review (step 2 of the task brief) — best-effort: a failure
      // here must not discard the repairs the user already paid for.
      let newReview: EpisodeQualityReviewOutput | null = null;
      let warning: string | null = null;
      try {
        const refreshedRow = await loadOwnedEpisode(owner);
        const script = refreshedRow.script as Record<string, unknown> | null;
        const storyboard = refreshedRow.storyboard as Record<
          string,
          unknown
        > | null;
        const dialoguePlan = refreshedRow.dialogueAudioPlan as Record<
          string,
          unknown
        > | null;
        if (script && storyboard) {
          const [seriesRow] = await db
            .select({ locale: verticalDramaSeries.locale })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId),
                eq(verticalDramaSeries.userId, userId)
              )
            )
            .limit(1);
          // Retention hooks (W6) — same conditional-computation convention
          // as the loop's `effects.runReview` above: only built when the
          // flag is actually on.
          const reReviewRetentionMetrics: VerticalDramaRetentionMetrics | undefined =
            retentionHooksEnabled
              ? computeRetentionMetrics({
                  script,
                  storyboard,
                  recentRetentionLoopTypes:
                    await loadRecentVerticalDramaRetentionLoopTypes(
                      owner,
                      refreshedRow.episodeNumber
                    ),
                })
              : undefined;
          const reReviewOutcome = await runVerticalDramaEpisodeQualityReview({
            userId,
            tenantId,
            seriesId,
            episodeId,
            episodeTitle:
              refreshedRow.title ?? `Episode ${refreshedRow.episodeNumber}`,
            locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
            script,
            storyboard,
            dialoguePlan,
            idempotencyKey: input.idempotencyKey
              ? `${input.idempotencyKey}-rereview`
              : undefined,
            // W11.6 "Story Lock" — see `runEpisodeQualityReview`'s identical wiring.
            reviewMode: storyLockEnabled ? "execution" : undefined,
            // Retention hooks (W6) — omitted (both) whenever the flag is off.
            scoreRetentionDimensions: retentionHooksEnabled,
            retentionMetrics: reReviewRetentionMetrics,
          });
          newReview = reReviewOutcome.review;
          await persistQualityReviewArtifact(owner, newReview);
        } else {
          warning =
            "แก้ไขสำเร็จ แต่ยังไม่สามารถตรวจคุณภาพซ้ำได้ (ไม่มีสคริปต์/สตอรีบอร์ด)";
        }
      } catch (err) {
        warning =
          err instanceof Error
            ? `แก้ไขสำเร็จ แต่ตรวจคุณภาพซ้ำไม่สำเร็จ: ${err.message}`
            : "แก้ไขสำเร็จ แต่ตรวจคุณภาพซ้ำไม่สำเร็จ";
      }

      // W11.6 "Story Lock" — surfaced alongside (not instead of) any
      // re-review warning above.
      if (storyLockRejectionsThisApply > 0) {
        const storyLockWarning = `ปฏิเสธการซ่อม ${storyLockRejectionsThisApply} รายการ — เนื้อเรื่องเปลี่ยนเกินกำหนด (เก็บเวอร์ชันเดิมไว้)`;
        warning = warning
          ? `${warning} / ${storyLockWarning}`
          : storyLockWarning;
      }

      return {
        stagesRepaired,
        staleStages: Array.from(staleStagesSet),
        newReview,
        warning,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* Tie-in defer (spec §13.1)                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Defer this episode's product tie-in placement (spec §13.1's exhausted-
   * loop-rounds recommended repair, `remove_or_rewrite_tie_in` -> default
   * action **defer**): deterministically strips `product_tie_in_plan.tie_ins[]`
   * from the persisted script — no LLM call, the story spine is untouched.
   * Supersedes, never hand-edits blind: the PRIOR script version is
   * persisted as a run artifact BEFORE the episode row is overwritten, so it
   * stays fully recoverable (documented choice — `verticalDramaEpisodePipeline
   * .repairStage`'s "supersede" path is an LLM-driven script REWRITE, not a
   * deterministic strip, so it is not the right supersede path for this
   * operation; this mutation implements its own narrow backup-then-overwrite
   * instead). Appends a `product_tie_in_usage` memory event marked
   * `{deferred: true, fromEpisodeNumber}` for fatigue/deferral history, and
   * returns the downstream stages that are now stale (informational —
   * mirrors `repairStage`'s own `staleStages` convention; unlike
   * `regenerateStage`, this mutation does NOT delete/null downstream
   * content — a defer only removes the placement, the rest of the episode
   * stands).
   *
   * RESOLVED (task #31, spec §7.7.3, added 2026-07-09 — supersedes the
   * former "DEVIATION (documented)" note this comment used to carry): once
   * `resolveVerticalDramaTieInReplanFlag` (F131Y
   * `verticalDramaSeriesTieInReplan`) is on for the tenant, this mutation
   * now builds a REAL, ACTIONABLE `arc_replan_proposal`
   * (`driftReasons: ["VD_ARC_TIE_IN_DEFERRED"]`, a genuine
   * `proposedBreakdown` — see `proposeTieInDeferReplan` in
   * `@shared/verticalDramaSeries/contentBudget`) that moves the placement
   * to the nearest eligible future episode, and persists it through the
   * EXACT SAME channel `runArcDriftCheckAndProposeIfNeeded` uses
   * (`verticalDramaSeriesMemoryService.appendEvent`,
   * `memoryKind: "arc_replan_proposal"`) so it shows up on the SAME
   * ArcReplanCard / approve-reject flow as a drift-detected proposal — see
   * `applyApprovedArcReplan`'s new tie-in-deferred guard in
   * `verticalDramaArcReplan.ts` for the approval-time integrity check.
   * `scheduleAtRisk` remains the fallback for the 2 cases a real proposal
   * genuinely cannot be built (no eligible future episode, or the
   * fatigue-window cap is already exhausted everywhere) — see `reason` on
   * the return shape — and is ALSO exactly what this mutation still
   * computes when the flag is off (grandfather: byte-identical to the
   * pre-#31 behavior in that case).
   */
  deferEpisodeTieIn: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner: EpisodeRunOwner = { tenantId, userId, seriesId, episodeId };

      const { tieInQcEnabled } =
        await resolveVerticalDramaQualityLoopFlags(tenantId);
      if (!tieInQcEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tie-in quality control is not enabled for this tenant",
        });
      }

      const row = await loadOwnedEpisode(owner);
      const script = row.script as Record<string, unknown> | null;
      if (!script) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Episode has no script yet",
        });
      }
      const placements = extractShotProductPlacements(
        (script as { product_tie_in_plan?: unknown }).product_tie_in_plan
      );
      if (placements.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This episode has no product tie-in placement to defer",
        });
      }

      // Supersede, never delete: persist the PRIOR script as a run artifact
      // BEFORE overwriting the episode's own `script` column.
      const [priorScriptRunRow] = await db
        .insert(verticalDramaEpisodeRuns)
        .values({
          tenantId,
          userId,
          seriesId,
          episodeId,
          stage: VD_TIE_IN_DEFER_PRIOR_SCRIPT_STAGE_TAG,
          runMode: "full",
          status: "succeeded",
          nextAction: "none",
          artifactIds: [],
          warnings: [],
          errors: [],
        })
        .returning({ id: verticalDramaEpisodeRuns.id });
      const [priorScriptArtifactRow] = await db
        .insert(verticalDramaRunArtifacts)
        .values({
          tenantId,
          userId,
          seriesId,
          episodeId,
          runId: priorScriptRunRow.id,
          stage: VD_TIE_IN_DEFER_PRIOR_SCRIPT_STAGE_TAG,
          jsonPayload: script,
          mediaAssetIds: null,
        })
        .returning({ id: verticalDramaRunArtifacts.id });
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ artifactIds: [String(priorScriptArtifactRow.id)] })
        .where(eq(verticalDramaEpisodeRuns.id, priorScriptRunRow.id));

      // Deterministic strip — no LLM call, story spine untouched.
      const existingPlan =
        (script as { product_tie_in_plan?: Record<string, unknown> })
          .product_tie_in_plan ?? {};
      const strippedScript: Record<string, unknown> = {
        ...script,
        product_tie_in_plan: { ...existingPlan, tie_ins: [] },
      };

      await db
        .update(verticalDramaEpisodes)
        .set({ script: strippedScript, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodes.id, episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        );

      // Audit + fatigue history — `loadSeriesTieInPlacementHistory` reads
      // `verticalDramaEpisodes.script` fresh each time, so the NOW-STRIPPED
      // script already reflects `hadTieIn: false` for this episode in every
      // future fatigue-window computation; this event is the durable AUDIT
      // record of the deferral action itself.
      await verticalDramaSeriesMemoryService.appendEvent({
        tenantId,
        userId,
        seriesId,
        episodeId,
        memoryKind: "product_tie_in_usage",
        payload: { deferred: true, fromEpisodeNumber: row.episodeNumber },
        summaryText: `Product tie-in deferred from episode ${row.episodeNumber}`,
        idempotencyKey: input.idempotencyKey,
      });

      // F131Y (`verticalDramaSeriesTieInReplan`, task #31) — real
      // arc_replan_proposal path. See this mutation's own doc comment above
      // ("RESOLVED") and `resolveVerticalDramaTieInReplanFlag`'s doc
      // comment for the flag-rollout status. Never throws — any failure
      // here falls through to the pre-#31 scheduleAtRisk-only fallback
      // below, which itself never blocks/fails the defer that already
      // committed above.
      const tieInReplanEnabled =
        await resolveVerticalDramaTieInReplanFlag(tenantId);

      let scheduleAtRisk = false;
      let proposal:
        | { proposalId: string; targetEpisodeNumber: number }
        | undefined;
      let tieInReplanUnavailableReason:
        | "no_future_slot"
        | "cap_exhausted"
        | "source_episode_not_found"
        | undefined;

      if (tieInReplanEnabled) {
        try {
          const [{ getActiveBreakdown }, producedEpisodeNumbers] =
            await Promise.all([
              import("../services/verticalDramaStoryBible"),
              loadProducedEpisodeNumbers(tenantId, userId, seriesId),
            ]);
          const [seriesRowForReplan] = await db
            .select({
              bible: verticalDramaSeries.bible,
              productTieIn: verticalDramaSeries.productTieIn,
              targetEpisodeCount: verticalDramaSeries.targetEpisodeCount,
            })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId),
                eq(verticalDramaSeries.userId, userId)
              )
            )
            .limit(1);

          const tieInConfig =
            (seriesRowForReplan?.productTieIn as VerticalDramaProductTieInConfig | null) ??
            null;

          if (tieInConfig?.enabled) {
            const bible =
              (seriesRowForReplan?.bible as Record<string, unknown> | null) ??
              null;
            const activeItems = getActiveBreakdown(
              bible
            ) as unknown as VerticalDramaArcReplanBreakdownItem[];
            const plannedCount =
              seriesRowForReplan?.targetEpisodeCount ?? activeItems.length;
            // Bootstrap in-memory ONLY (never persisted here — see
            // `planSeasonTieInPlacements`'s doc comment) when this series'
            // active breakdown has never carried a `tieIn` field on any
            // item — a legacy series adopting this feature for the first
            // time via its very first defer.
            const hasAnyPlannedTieIn = activeItems.some(
              item => (item as { tieIn?: unknown }).tieIn !== undefined
            );
            const workingItems = hasAnyPlannedTieIn
              ? activeItems
              : planSeasonTieInPlacements(activeItems, {
                  perTenCap: tieInConfig.maxEpisodesWithTieInPerTenEpisodes,
                  plannedCount,
                });

            const replanResult = proposeTieInDeferReplan({
              items: workingItems,
              fromEpisodeNumber: row.episodeNumber,
              producedEpisodeNumbers,
              perTenCap: tieInConfig.maxEpisodesWithTieInPerTenEpisodes,
              plannedCount,
            });

            if (replanResult.ok) {
              const proposalId = crypto.randomUUID();
              await verticalDramaSeriesMemoryService.appendEvent({
                tenantId,
                userId,
                seriesId,
                episodeId,
                memoryKind: "arc_replan_proposal",
                payload: {
                  proposalId,
                  seriesId: String(seriesId),
                  triggeredByEpisodeNumber: row.episodeNumber,
                  driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
                  affectedEpisodeNumbers: [
                    row.episodeNumber,
                    replanResult.targetEpisodeNumber,
                  ].sort((a, b) => a - b),
                  proposedBreakdown: replanResult.proposedBreakdown,
                  rationale: replanResult.rationaleTh,
                  status: "proposed",
                },
                summaryText: replanResult.rationaleTh,
                idempotencyKey: input.idempotencyKey
                  ? `${input.idempotencyKey}:arc-replan-proposal`
                  : undefined,
              });
              proposal = {
                proposalId,
                targetEpisodeNumber: replanResult.targetEpisodeNumber,
              };
            } else {
              tieInReplanUnavailableReason = replanResult.reason;
            }
          }
        } catch (err) {
          debugError(
            "verticalDramaEpisodes.deferEpisodeTieIn",
            `tie-in re-plan proposal failed (episodeId=${episodeId})`,
            err
          );
        }
      }

      // Best-effort schedule-risk check (see this mutation's own doc
      // comment above) — runs when the flag is off, OR the flag is on but
      // no real proposal could be built (`tieInReplanUnavailableReason` set
      // above). Never blocks/fails the defer itself.
      if (!proposal) {
        try {
          const [seriesRowForSchedule] = await db
            .select({
              productTieIn: verticalDramaSeries.productTieIn,
              targetEpisodeCount: verticalDramaSeries.targetEpisodeCount,
            })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId),
                eq(verticalDramaSeries.userId, userId)
              )
            )
            .limit(1);
          const scheduleTieInConfig =
            (seriesRowForSchedule?.productTieIn as VerticalDramaProductTieInConfig | null) ??
            null;
          if (scheduleTieInConfig?.enabled) {
            const history = await loadSeriesTieInPlacementHistory(
              tenantId,
              userId,
              seriesId
            );
            const placementsInWindow = history.filter(h => h.hadTieIn).length;
            const meetsTarget =
              placementsInWindow >=
              scheduleTieInConfig.maxEpisodesWithTieInPerTenEpisodes;
            const noFutureEpisodesLeft =
              row.episodeNumber >=
              (seriesRowForSchedule?.targetEpisodeCount ?? row.episodeNumber);
            scheduleAtRisk = !meetsTarget && noFutureEpisodesLeft;
          }
        } catch (err) {
          debugError(
            "verticalDramaEpisodes.deferEpisodeTieIn",
            `schedule-risk check failed (episodeId=${episodeId})`,
            err
          );
        }
      }

      const staleStages = VerticalDramaEpisodePipeline.downstreamStages(
        "plan_episode_script"
      );

      return {
        scriptArtifactRef: {
          priorScriptArtifactId: String(priorScriptArtifactRow.id),
        },
        script: strippedScript,
        staleStages,
        scheduleAtRisk,
        // F131Y additive fields (task #31) — `undefined` (omitted-equivalent
        // over the wire, superjson-safe) whenever the flag is off or no real
        // proposal could be built, so every pre-#31 client caller destructuring
        // only `scheduleAtRisk`/`staleStages`/`script` is unaffected.
        proposal,
        reason: tieInReplanUnavailableReason,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* Manual episode -> series memory summarization                            */
  /* ------------------------------------------------------------------------ */

  /**
   * Manually trigger the `summarize_episode_to_series_memory` pipeline stage
   * for THIS episode and immediately append the resulting memory events as
   * approved — the user's explicit button click IS the approval, mirroring
   * the same approval-gate principle `approveCheckpoint` uses for the
   * pipeline-run path (see that mutation's `summarize_episode_to_series_memory`
   * branch). This exists because the real pipeline stage is only ever reached
   * by running the FULL tail of the pipeline, which almost no user does in
   * practice — `vertical_drama_memory_events` was observed to have zero rows
   * ever written despite the planner service and append-only memory service
   * both being fully implemented and tested.
   *
   * Idempotency / re-summarize semantics (deliberately simple, chosen over the
   * per-item idempotency-key dedupe the checkpoint path uses, since there is
   * no single checkpoint id to scope keys to here):
   *  - If this episode has NEVER been manually summarized (no prior
   *    `episode_summary` event carrying `payload.source === "manual"` for this
   *    episodeId), run the planner and append every resulting kind. Returns
   *    `alreadySummarized: false`.
   *  - If it HAS already been manually summarized and `force` is not set,
   *    this is a no-op: no LLM call, no credits spent, no new events appended
   *    — returns `alreadySummarized: true, eventsAppended: 0, creditsUsed: 0`
   *    so a naive re-click (e.g. a double form submit) is free and inert.
   *  - If it HAS already been manually summarized and `force: true` is set,
   *    this is an explicit user decision to re-summarize: the planner runs
   *    again and a FRESH set of events is appended (new `episode_summary`,
   *    new hook/delta/warning/tie-in/canonical-fact events). This is NOT a
   *    retcon/supersession — per the append-only memory model, the newer
   *    `episode_summary` (by `createdAt`) simply wins in
   *    `buildEpisodeMemoryBundle`'s "last N summaries" projection, and the
   *    older event remains in the durable history (never mutated or
   *    deleted). This mirrors how the checkpoint path already tolerates
   *    multiple `episode_summary` events per episode over time (e.g. a
   *    `repairStageOutput` re-run followed by a fresh approval).
   *  - Idempotency key convention: every appended event's idempotency key is
   *    scoped by `runToken` (a fresh random token per manual run, i.e. per
   *    "attempt") so within ONE call the events are still de-duplicated
   *    against a network-retried client resubmission (same convention as
   *    `vd-episode-summary-manual-{episodeId}-{kind}-{index}` from the task
   *    brief, extended with the run token so a `force` re-run is a distinct
   *    idempotency scope from the original run):
   *    `vd-episode-summary-manual-{episodeId}-{runToken}-{kind}-{index}`.
   */
  summarizeEpisodeToMemory: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        force: z.boolean().optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });

      const script = row.script as Record<string, unknown> | null;
      const storyboard = row.storyboard as Record<string, unknown> | null;
      if (!script || !storyboard) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ตอนนี้ต้องมีบทและสตอรี่บอร์ดที่สร้างแล้วก่อน จึงจะสรุปความจำเข้าซีรีย์ได้",
        });
      }
      const dialoguePlan = row.dialogueAudioPlan as Record<
        string,
        unknown
      > | null;

      // Detect whether this episode was already manually summarized — scoped
      // to THIS episode's own `episode_summary` events tagged `source:
      // "manual"` (the checkpoint-approval path's events never carry that
      // tag, so a pipeline-run summarization does not block/require `force`
      // here, and vice versa — the two paths append to the same durable
      // event stream but track their own "already ran" state independently).
      const priorManualSummaries =
        await verticalDramaSeriesMemoryService.listEvents({
          tenantId,
          userId,
          seriesId,
          kind: "episode_summary",
          episodeId,
          limit: 50,
        });
      const alreadySummarized = priorManualSummaries.some(
        ev => ev.payload?.source === "manual"
      );
      if (alreadySummarized && !input.force) {
        return { alreadySummarized: true, eventsAppended: 0, creditsUsed: 0 };
      }

      const [seriesRow] = await db
        .select({ locale: verticalDramaSeries.locale })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId)
          )
        )
        .limit(1);

      const priorMemoryBundle =
        await verticalDramaSeriesMemoryService.buildEpisodeMemoryBundle(
          { tenantId, userId, seriesId },
          row.episodeNumber
        );

      let outcome: {
        planned: import("../services/verticalDramaSeriesMemoryPlanning").SeriesMemoryPlannerOutput;
        creditsUsed: number;
        model: string;
      };
      try {
        outcome = await runVerticalDramaSeriesMemoryPlanning({
          userId,
          tenantId,
          seriesId,
          episodeId,
          episodeNumber: row.episodeNumber,
          locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
          script,
          storyboard,
          dialoguePlan,
          priorMemoryBundle,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof MemoryPlanningInsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof MemoryPlanningSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err.message,
          });
        }
        if (err instanceof MemoryPlanningRateLimitExceededError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Episode memory summarization failed",
        });
      }

      const planned = outcome.planned;
      const runToken = crypto.randomBytes(8).toString("hex");
      const baseKey = `vd-episode-summary-manual-${episodeId}-${runToken}`;

      let eventsAppended = 0;
      const appendManual = async (
        memoryKind: VerticalDramaMemoryKind,
        payload: Record<string, unknown>,
        summaryText: string,
        keySuffix: string
      ) => {
        await verticalDramaSeriesMemoryService.appendEvent({
          tenantId,
          userId,
          seriesId,
          episodeId,
          memoryKind,
          payload: {
            episodeNumber: row.episodeNumber,
            source: "manual",
            ...payload,
          },
          summaryText,
          approved: true,
          approvedByUserId: userId,
          idempotencyKey: `${baseKey}-${keySuffix}`,
        });
        eventsAppended += 1;
      };

      await appendManual(
        "episode_summary",
        {
          summary: planned.episode_recap,
          memoryCompactionSummary: planned.memory_compaction_summary,
        },
        planned.episode_recap,
        "episode-summary"
      );

      const asArray = (value: unknown): Array<Record<string, unknown>> =>
        Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

      const appendKindArray = async (
        memoryKind: VerticalDramaMemoryKind,
        items: Array<Record<string, unknown>>,
        summaryOf: (item: Record<string, unknown>) => string,
        keySuffix: string
      ) => {
        for (const [index, item] of items.entries()) {
          await appendManual(
            memoryKind,
            item,
            summaryOf(item),
            `${keySuffix}-${index}`
          );
        }
      };

      await appendKindArray(
        "hook_opened",
        asArray(planned.unresolved_hooks),
        item =>
          String(item.description ?? item.hook ?? item.hookId ?? "hook opened"),
        "hook-opened"
      );
      await appendKindArray(
        "hook_resolved",
        asArray(planned.resolved_hooks),
        item =>
          String(
            item.description ?? item.hook ?? item.hookId ?? "hook resolved"
          ),
        "hook-resolved"
      );
      await appendKindArray(
        "character_delta",
        asArray(planned.character_emotional_state),
        item =>
          String(
            item.state ??
              item.change ??
              `${item.character_id ?? "character"} state change`
          ),
        "character-delta"
      );
      await appendKindArray(
        "relationship_delta",
        asArray(planned.relationship_state_changes),
        item =>
          String(
            item.change ??
              `${JSON.stringify(item.pair ?? [])} relationship change`
          ),
        "relationship-delta"
      );
      await appendKindArray(
        "continuity_warning",
        asArray(planned.continuity_risks),
        item => String(item.risk ?? item.warning ?? "continuity risk"),
        "continuity-warning"
      );
      await appendKindArray(
        "product_tie_in_usage",
        asArray(planned.product_tie_in_history),
        item =>
          String(
            item.productName ?? item.product_name ?? "product tie-in usage"
          ),
        "product-tie-in"
      );
      await appendKindArray(
        "canonical_fact",
        asArray(planned.canonical_facts),
        item => String(item.statement ?? item.fact ?? "canonical fact"),
        "canonical-fact"
      );

      // Story-density reform (spec §7.7.3, section-13, added 2026-07-07) —
      // deterministic arc-drift check on every FRESH manual summarization run
      // (never on the `alreadySummarized` early-return above). Flag-gated;
      // richer hook data available here than the `approveCheckpoint` hook —
      // `planned.unresolved_hooks` (just computed by the real memory-planner
      // call above) lets `VD_ARC_HOOK_UNPLANNED` fire, diffed against
      // `priorMemoryBundle.unresolvedHooks` (the OPEN-hook state from BEFORE
      // this episode's own summary), which the checkpoint-approval hook has
      // no equivalent structured source for.
      const { arcReplanEnabled, qualityLedgersEnabled } =
        await resolveVerticalDramaDensityFlags(tenantId);

      // Feature 132 §5.3 (F132B, ledgers-and-story-state) — appends a
      // `story_state` memory event ONLY when the tenant flag is on AND the
      // memory-planner's response actually included one this run (a
      // pre-upgrade skill version, or the flag being off at prompt-build
      // time, omits the key — see `seriesMemoryPlannerOutputSchema`'s own
      // doc comment) — byte-identical event count to today in either case.
      if (qualityLedgersEnabled && planned.story_state) {
        await appendManual(
          "story_state",
          { storyState: planned.story_state },
          planned.episode_recap,
          "story-state"
        );
      }

      if (arcReplanEnabled) {
        const plannedHookTexts = asArray(planned.unresolved_hooks)
          .map(item =>
            String(item.description ?? item.hook ?? item.hookId ?? "")
          )
          .filter(text => text.length > 0);
        const priorHookTextSet = new Set(priorMemoryBundle.unresolvedHooks);
        const newHookDescriptions = plannedHookTexts.filter(
          text => !priorHookTextSet.has(text)
        );

        await runArcDriftCheckAndProposeIfNeeded({
          tenantId,
          userId,
          seriesId,
          episodeId,
          episodeNumber: row.episodeNumber,
          script,
          newHookDescriptions,
          idempotencyKey: input.idempotencyKey
            ? `${input.idempotencyKey}:arc-replan-proposal`
            : undefined,
        });
      }

      return {
        alreadySummarized: false,
        eventsAppended,
        creditsUsed: outcome.creditsUsed,
      };
    }),

  /**
   * Compound episode video (2026-07-06 download + assembly upgrade; task #21
   * / W12.5 "Final Render Suite" phase B added dialogue-audio + subtitle
   * feeding, 2026-07-09) — concatenates every completed shot clip
   * (`motionPromptPack.clips[].videoTask.videoUrl`, in shot/clip order) into
   * ONE mp4 for the whole episode, optionally mixing in the episode's
   * generated dialogue audio and/or burning in subtitles from its script.
   *
   * Free (no credits): this is a local, deterministic ffmpeg concat of clips
   * the user already paid to render — not a new AI generation — matching the
   * "no billing unless found" instruction: no existing billing convention
   * covers a mechanical re-encode of already-owned media, so none is charged.
   *
   * Async submit -> poll, same convention as `generateVideoClip`/
   * `generateAngleVariations`: returns a `jobId` immediately; the actual
   * ffmpeg run happens in the background (not awaited here) and its result is
   * persisted onto `episode.assemblyManifest.compiledVideo` (via the same
   * JSONB-patch path as `updateEpisodeDraft`), so a reload recovers the
   * pending/completed state exactly like `videoTask.pendingTaskId`.
   *
   * PRECONDITION_FAILED (with the list of missing shot/clip numbers) when any
   * clip lacks a completed video, UNLESS `allowPartial` is set, in which case
   * only the completed clips are concatenated, in order.
   *
   * `includeDialogueAudio`/`loudnessNormalize`/`subtitlePreset` are all
   * additive and optional — omitting them (every pre-existing caller) is
   * byte-identical to before this wave. `includeDialogueAudio` additionally
   * requires the `verticalDramaSeriesVoiceChain` tenant flag (F131U);
   * `subtitlePreset` does NOT — subtitles render straight from the episode's
   * SCRIPT text and work regardless of whether any TTS audio was ever
   * generated. See `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`
   * (`verticalDramaEpisodeVideoAssembly.ts`) for the missing-audio/
   * missing-timing fallback rules.
   */
  assembleEpisodeVideo: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        allowPartial: z.boolean().optional(),
        includeDialogueAudio: z.boolean().optional(),
        loudnessNormalize: z.boolean().optional(),
        subtitlePreset: z
          .union([HyperframesFinalCompositeSubtitlePresetSchema, z.literal("none")])
          .optional(),
        // Phase A render-options quick win — additive/optional, same
        // convention as `subtitlePreset` above (threaded through the exact
        // same path: this input -> `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`
        // -> `buildFinalRenderFfmpegArgs`). Omitted `subtitleFontSize` means
        // `"medium"` (byte-identical to every render before this option
        // existed); omitted/`false` `showAgeBadge` means no badge is burned
        // in (also byte-identical).
        subtitleFontSize: z.enum(["small", "medium", "large", "xlarge"]).optional(),
        showAgeBadge: z.boolean().optional(),
        // Task #34 — render-time opt-outs. Both default to "apply whatever
        // the saved plan/series config says" (`!== false`, i.e. omitted or
        // `true` both mean "apply"); passing `false` explicitly skips that
        // whole feed for THIS render only, without touching the saved plan.
        includeTextOverlays: z.boolean().optional(),
        includeWatermark: z.boolean().optional(),
        // `planning/vd-remotion-render-option/plan.md` wave 1 — OPT-IN
        // Remotion render path for this sub-episode assembly. Omitted/
        // `"ffmpeg"` is BYTE-IDENTICAL to every render before this option
        // existed (the existing `vertical_drama_ffmpeg_assembly` queue path,
        // unchanged). `"remotion_queue"` carries the SAME resolved
        // `renderFeed` this mutation already builds below through
        // `submitVdRemotionAssembly` instead — ANY failure there falls back
        // to the ffmpeg path automatically (see below), never leaves the
        // run stuck.
        renderEngine: z.enum(["ffmpeg", "remotion_queue"]).optional(),
        idempotencyKey,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);

      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const clipSources: EpisodeClipSource[] =
        extractClipSourcesFromMotionPromptPack(pack);
      if (clipSources.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No video clips exist for this episode yet — generate the video motion prompt pack and render clips first.",
        });
      }

      let resolved: {
        ordered: EpisodeClipSource[];
        missing: { clipNumber: number }[];
      };
      try {
        resolved = resolveClipsForAssembly(clipSources, {
          allowPartial: input.allowPartial,
          storyboardShotNumbers: (
            row.storyboard as
              | {
                  shots?: Array<{
                    shot_number?: unknown;
                    shotNumber?: unknown;
                  }>;
                }
              | null
          )?.shots?.map(shot => shot.shot_number ?? shot.shotNumber),
          startFrameShotNumbers: (
            row.startFramePlan as
              | { frames?: Array<{ shotNumber?: unknown }> }
              | null
          )?.frames?.map(frame => frame.shotNumber),
        });
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Sub-episode video assembly precondition failed",
        });
      }

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl =
        runtimeConfig.internalNodeUrl ||
        ctx.publicUrl ||
        "http://localhost:3000";
      const filename = compiledVideoFilename({
        seriesId,
        episodeNumber: row.episodeNumber ?? episodeId,
      });

      // Ad Banner Overlay (F131W, #30-A2) — additive, flag-gated feed into
      // the render engine's `banners` input (`RunAssemblyJobBannerInput[]`,
      // `verticalDramaEpisodeVideoAssembly.ts`). `"entire"`-mode selections
      // resolve their ADVISORY window to `[0, targetDurationSeconds]` here
      // (the episode's TARGET duration is the only total-duration figure
      // available this early — the render job only learns the REAL probed
      // duration deep inside `runAssemblyJob`, well after this handler has
      // already returned a `jobId`) and are marked `entire: true` so
      // `runAssemblyJob` re-resolves the window to the REAL probed duration
      // post-probe (task #21 phase B fix — see
      // `RunAssemblyJobBannerInput.entire`'s own doc comment; previously a
      // real duration SHORTER than `targetDurationSeconds` made the render
      // engine reject the banner as out-of-bounds and fail the WHOLE job).
      const adBannerOverlayEnabled =
        await resolveVerticalDramaAdBannerOverlayFlag(tenantId);
      let adBannerRunInputs: RunAssemblyJobBannerInput[] = [];
      let excludedAdBanners: VdEpisodeAdBannerExclusion[] = [];
      if (adBannerOverlayEnabled) {
        const plan = parseEpisodeAdBannerPlan(row.adBannerPlan);
        const resolvedAdBanners = await resolveEpisodeAdBannerRunInputs({
          tenantId,
          userId,
          seriesId,
          plan,
          targetDurationSeconds: row.targetDurationSeconds ?? 60,
        });
        adBannerRunInputs = resolvedAdBanners.banners;
        excludedAdBanners = resolvedAdBanners.excluded;
      }

      // Dialogue audio + subtitles (task #21 phase B) — additive feed into
      // the render engine's ALREADY-LANDED `dialogueAudio`/`subtitles`
      // inputs (fully wired through `runAssemblyJob` ->
      // `buildFinalRenderFfmpegArgs` since phase A; this is the router-side
      // connecting wire, not new engine machinery). `voiceChainEnabled` is
      // resolved once here and reused below by the `dialogueAudioTimeline`
      // manifest-audit block, so the tenant flag is only fetched once.
      const voiceChainEnabled =
        await resolveVerticalDramaVoiceChainFlag(tenantId);
      const dialoguePlan =
        row.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null;
      // Phase A render-options quick win — only queried when this render
      // actually requests the badge (see `loadSeriesAudienceAgeRating`'s own
      // doc comment), so every pre-existing caller pays zero extra DB cost.
      const audienceAgeRating =
        input.showAgeBadge === true
          ? await loadSeriesAudienceAgeRating(tenantId, userId, seriesId)
          : undefined;
      const dialogueRunInputs = resolveEpisodeDialogueAudioAndSubtitlesRunInputs(
        {
          plan: dialoguePlan,
          motionClips: (pack?.clips ?? []).map(
            (c): VdDialogueTimelineClip => ({
              clipNumber: c.clipNumber,
              sourceShotNumbers: c.sourceShotNumbers,
              durationSeconds: c.durationSeconds,
            })
          ),
          includedClipNumbers: resolved.ordered.map(c => c.clipNumber),
          includeDialogueAudio:
            voiceChainEnabled && input.includeDialogueAudio === true,
          loudnessNormalize: input.loudnessNormalize === true,
          subtitlePreset: input.subtitlePreset,
          subtitleFontSize: input.subtitleFontSize,
          showAgeBadge: input.showAgeBadge === true,
          audienceAgeRating,
        }
      );

      // Text Overlay Suite (F131AB, task #34) — additive, flag-gated feed
      // into the render engine's `overlays`/`watermarkImage` inputs (merged
      // into the SAME `subtitles` object dialogue captions use — see
      // `buildAssSubtitleFile`'s own doc comment for why one `.ass` file
      // safely carries both). `includeTextOverlays`/`includeWatermark`
      // default to "apply" (only an explicit `false` opts out for this one
      // render — see this mutation's own input doc comment).
      const textOverlaySuiteEnabled =
        await resolveVerticalDramaTextOverlaySuiteFlag(tenantId);
      let textOverlayEventsIncluded = 0;
      let watermarkIncluded = false;
      let combinedSubtitles = dialogueRunInputs.subtitles;
      let watermarkImageForJob: RunAssemblyJobWatermarkImageInput | undefined;
      if (textOverlaySuiteEnabled && input.includeTextOverlays !== false) {
        const textOverlayPlan = parseTextOverlayPlan(row.textOverlayPlan);
        const { overlays, watermarkImage, overlaysIncluded } =
          await resolveEpisodeTextOverlayEngineInputs({
            tenantId,
            userId,
            seriesId,
            episodeNumber: row.episodeNumber,
            episodeTitle: row.title,
            plan: textOverlayPlan,
            startFramePlan: row.startFramePlan as VerticalDramaStartFramePlan | null,
            motionClips: (pack?.clips ?? []).map(
              (c): VdDialogueTimelineClip => ({
                clipNumber: c.clipNumber,
                sourceShotNumbers: c.sourceShotNumbers,
                durationSeconds: c.durationSeconds,
              })
            ),
            includedClipNumbers: resolved.ordered.map(c => c.clipNumber),
            includeWatermark: input.includeWatermark !== false,
          });
        textOverlayEventsIncluded = overlaysIncluded;
        watermarkIncluded = Boolean(watermarkImage);
        watermarkImageForJob = watermarkImage ?? undefined;
        if (overlays.length > 0) {
          combinedSubtitles = {
            preset: dialogueRunInputs.subtitles?.preset ?? "no_subtitle_style",
            lines: dialogueRunInputs.subtitles?.lines ?? [],
            fontsDir: dialogueRunInputs.subtitles?.fontsDir,
            // Phase A render-options quick win — preserve the font-size
            // scale AND any overlay `dialogueRunInputs.subtitles` already
            // carried (the age badge, when `showAgeBadge` is set) instead of
            // letting this Text Overlay Suite rebuild silently drop them;
            // `dialogueRunInputs.subtitles?.overlays` is empty/absent for
            // every pre-existing caller, so `[...[], ...overlays]` is
            // BYTE-IDENTICAL to the prior `overlays` value in that case.
            fontSize: dialogueRunInputs.subtitles?.fontSize,
            overlays: [...(dialogueRunInputs.subtitles?.overlays ?? []), ...overlays],
          };
        }
      }

      // Vertical Drama Render Queue plan §4.2 Wave 3 — enqueue the
      // `vertical_drama_ffmpeg_assembly` worker job instead of launching
      // `runAssemblyJob` in-process (`submitAssemblyJob`, now unused here).
      // `renderFeed` carries exactly the DATA args `runAssemblyJob` needs
      // (never the ffmpeg/probe fn injectables — the executor supplies its
      // own defaults for those), same set `submitAssemblyJob` was passed
      // above.
      const renderFeed = {
        owner,
        clips: resolved.ordered,
        internalBaseUrl,
        filename,
        ...(adBannerRunInputs.length > 0 ? { banners: adBannerRunInputs } : {}),
        ...(dialogueRunInputs.dialogueAudio
          ? { dialogueAudio: dialogueRunInputs.dialogueAudio }
          : {}),
        ...(combinedSubtitles ? { subtitles: combinedSubtitles } : {}),
        ...(watermarkImageForJob ? { watermarkImage: watermarkImageForJob } : {}),
      };
      // `planning/vd-remotion-render-option/plan.md` wave 1 — try the
      // opt-in Remotion queue path FIRST when requested; ANY failure falls
      // back to the existing ffmpeg queue path below (never leaves the run
      // stuck — same "throw = fall back" convention
      // `submitStagedRemotionFinalRenderOrFallback` uses for the marketplace
      // equivalent). `usedRenderEngine`/`renderEngineFallbackReason` are
      // surfaced in this mutation's response so the UI can show the
      // fallback explicitly (wave 2).
      let jobId: string | undefined;
      let usedRenderEngine: "ffmpeg" | "remotion_queue" = "ffmpeg";
      let renderEngineFallbackReason: string | undefined;

      // Remotion is the DEFAULT engine (2026-07-31). It was opt-in, which meant
      // the common path fell to the ffmpeg queue — and that queue has no
      // consumer at all (the worker-app cannot claim
      // `vertical_drama_ffmpeg_assembly`, and the inline in-process worker is
      // off by policy). Opt-OUT keeps `"ffmpeg"` reachable for anyone who has
      // the inline worker enabled.
      if (input.renderEngine !== "ffmpeg") {
        try {
          const { submitVdRemotionAssembly } = await import(
            "../services/verticalDramaRemotionRender"
          );
          const submitted = await submitVdRemotionAssembly({
            owner,
            clips: renderFeed.clips,
            internalBaseUrl,
            // The Remotion worker runs on ANOTHER machine, so asset URLs it
            // must fetch have to be resolved against a publicly reachable
            // origin — `internalBaseUrl` is frequently `http://localhost:3000`.
            publicBaseUrl: runtimeConfig.publicUrl || ctx.publicUrl || null,
            filename,
            banners: renderFeed.banners,
            dialogueAudio: renderFeed.dialogueAudio,
            subtitles: renderFeed.subtitles,
            watermarkImage: renderFeed.watermarkImage,
            tenantId,
            requestedByUserId: userId,
            idempotencyKey: input.idempotencyKey,
          });
          jobId = submitted.jobId;
          usedRenderEngine = "remotion_queue";
        } catch (error) {
          renderEngineFallbackReason =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[verticalDramaEpisodes] Remotion render submission failed for series ${seriesId} episode ${episodeId}; falling back to the ffmpeg render queue`,
            error,
          );
        }
      }

      if (!jobId) {
        // GAP AUDIT 2026-07-31 — the ffmpeg fallback is only real when something
        // can actually CLAIM a `vertical_drama_ffmpeg_assembly` job. The
        // worker-app cannot: its `WorkerJobKind` set is Hermes*/Hyperframes/
        // RemotionRenderVideo only. The single other consumer is the in-process
        // inline ffmpeg worker, which is OFF by default (and must stay off —
        // user policy: nothing renders inside `smartspec-web`).
        //
        // So with the inline worker disabled, "falling back" used to enqueue a
        // job NOBODY would ever claim: the episode sat on "กำลังประกอบ…"
        // forever with no error. Surface the real Remotion failure instead of
        // queueing into a black hole.
        const { getWebProcessRenderWorkerEnabled } = await import(
          "../services/renderWorkerSettings"
        );
        const ffmpegConsumerAvailable = await getWebProcessRenderWorkerEnabled();
        if (!ffmpegConsumerAvailable) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `vd_assembly_remotion_failed_and_no_ffmpeg_worker${
              renderEngineFallbackReason ? `: ${renderEngineFallbackReason}` : ""
            }`,
          });
        }
        // Lazy `await import(...)` — see this file's own import-block doc
        // comment above (`queueVerticalDramaFfmpegAssemblyJob` reference) for
        // why this is not a static top-level import.
        const { queueVerticalDramaFfmpegAssemblyJob } = await import(
          "../services/workerSchedulerService"
        );
        const { job } = await queueVerticalDramaFfmpegAssemblyJob({
          tenantId,
          requestedByUserId: userId,
          kind: "sub_episode",
          contractVersion: 1,
          owner: {
            tenantId,
            userId: String(userId),
            seriesId: String(seriesId),
            episodeId: String(episodeId),
          },
          renderFeed,
          display: {
            seriesTitle: row.title ?? undefined,
            episodeNumber: row.episodeNumber ?? undefined,
            label: filename,
          },
          idempotencyKey: input.idempotencyKey,
        });
        await persistCompiledVideoState(owner, {
          pendingJobId: job.id,
          status: "pending",
          error: undefined,
          renderEngine: "ffmpeg",
        });
        jobId = job.id as string;
      }

      // W12-A voice chain manifest audit trail (additive, flag-gated) —
      // merges a RAW, shot-LOCAL-timed `dialogueAudioTimeline` snapshot into
      // `assemblyManifest` whenever the episode's dialogue-audio plan has
      // lines with a completed audio asset. This is a SEPARATE, simpler data
      // contract from the real ABSOLUTE-timeline `dialogueRunInputs` feed
      // just submitted above (see `buildDialogueAudioTimelineFromPlan`'s own
      // doc comment) — kept as-is for its existing audit/display purpose;
      // task #21 phase B did not remove or change it. Flags-off (or no
      // completed lines yet) is a complete no-op.
      if (voiceChainEnabled) {
        // Reuses the SAME `dialoguePlan` cast computed above for the real
        // render feed — same source data, two independent consumers.
        const dialogueAudioTimeline =
          buildDialogueAudioTimelineFromPlan(dialoguePlan);
        if (dialogueAudioTimeline.length > 0) {
          // Fresh read-modify-write: `submitAssemblyJob` (awaited above)
          // already persisted its OWN `assemblyManifest.compiledVideo` patch
          // synchronously before returning, so re-reading here (rather than
          // reusing the `row` snapshot loaded before that call) preserves it
          // — same "re-read before patching a sibling key" care
          // `persistCompiledVideoState` itself takes.
          const [freshRow] = await db
            .select({
              assemblyManifest: verticalDramaEpisodes.assemblyManifest,
            })
            .from(verticalDramaEpisodes)
            .where(
              and(
                eq(verticalDramaEpisodes.id, episodeId),
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.userId, userId),
                eq(verticalDramaEpisodes.seriesId, seriesId)
              )
            )
            .limit(1);
          const existingManifest =
            freshRow?.assemblyManifest &&
            typeof freshRow.assemblyManifest === "object"
              ? (freshRow.assemblyManifest as Record<string, unknown>)
              : {};
          await db
            .update(verticalDramaEpisodes)
            .set({
              assemblyManifest: {
                ...existingManifest,
                dialogueAudioTimeline,
                loudnessNormalize: true as const,
              },
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(verticalDramaEpisodes.id, episodeId),
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.userId, userId),
                eq(verticalDramaEpisodes.seriesId, seriesId)
              )
            );
        }
      }

      return {
        jobId,
        shotCount: resolved.ordered.length,
        missingClipNumbers: resolved.missing.map(m => m.clipNumber),
        partial: resolved.missing.length > 0,
        // Ad Banner Overlay (F131W, #30-A2) — designs the plan selected but
        // that were excluded from THIS render (missing/not-ready design, or
        // approval-required-and-not-approved). Always `[]` when the flag is
        // off or nothing was excluded.
        excludedAdBanners,
        // Task #21 phase B — how many dialogue-audio segments/subtitle lines
        // were actually fed into THIS render. Always 0 when not requested
        // (opted out / no real preset) or no plan data was available.
        dialogueAudioSegmentsIncluded: dialogueRunInputs.dialogueAudioSegmentsIncluded,
        subtitleLinesIncluded: dialogueRunInputs.subtitleLinesIncluded,
        // Text Overlay Suite (F131AB, task #34) — how many overlay events
        // (end card/opener/title bumper/episode indicator/character intro/
        // mid-episode cards/text watermark, combined) were fed into THIS
        // render, and whether an IMAGE watermark was composited. Always
        // `0`/`false` when the flag is off or nothing was enabled.
        textOverlayEventsIncluded,
        watermarkIncluded,
        // `planning/vd-remotion-render-option/plan.md` wave 1 — which
        // render engine actually handled THIS submission (never the
        // requested one alone — a Remotion request that failed and fell
        // back reports `"ffmpeg"` here, with the failure reason surfaced so
        // the UI can show the fallback explicitly, wave 2).
        renderEngine: usedRenderEngine,
        ...(renderEngineFallbackReason
          ? { renderEngineFallbackReason }
          : {}),
      };
    }),
});

export type VerticalDramaEpisodesRouter = typeof verticalDramaEpisodesRouter;

// Re-export for symmetry with the memory row mapper used by callers/tests.
export { memoryRowToEvent };
