/**
 * Vertical Drama Series — base series router (spec feature 131, section 03).
 *
 * Series CRUD used by the feature-flagged Dashboard workspace. Every procedure
 * is protected (auth required), gated on the `verticalDramaSeries` tenant
 * feature flag (fail-closed), and scoped to the caller's tenant + user so a
 * user can never read or mutate another tenant's or user's series.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaGenrePresets,
  verticalDramaCharacters,
  verticalDramaCharacterAssets,
  /**
   * Location Visual Bible whole-series seeding (mirrors
   * `verticalDramaCharacters` above) — used only by `seedLocationsFromDraft`
   * below to bulk-insert the wizard's freeform `bible.locationsDraft` text
   * into the durable `vertical_drama_locations` roster at series-creation
   * time.
   */
  verticalDramaLocations,
  verticalDramaRunArtifacts,
  verticalDramaShotReferences,
  verticalDramaEpisodeRuns,
  verticalDramaMemoryEvents,
  verticalDramaMemorySnapshots,
  verticalDramaQcReports,
  mediaAssets,
  apiAuditEvents,
  /**
   * Manual LLM model override for the "generate start-frame render plan" /
   * "generate storyboard" pipeline stages (added 2026-07-11 — see
   * `/home/dev/.claude/plans/polished-toasting-gadget.md`). Only these two
   * pure table definitions are imported statically here (NOT
   * `services/enabledLlmModels.ts`/`services/verticalDramaImproveScript.ts`
   * themselves, which pull in a heavy `routers/llmProviders.ts` transitive
   * chain — see this file's own established lazy-import convention
   * documented a few hundred lines below, e.g. the Ad Banner Overlay import
   * block) — used by `listQualityPlanningModels` to join in a display
   * label (`modelName`/`displayName`) for each eligible model id.
   */
  llmProviders,
  modelProviderMap,
  type VerticalDramaSeriesRow,
  type VerticalDramaGenrePresetRow,
  type VerticalDramaMemoryEventRow,
} from "../../drizzle/schema";
import type {
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
  VerticalDramaSeriesTrailerState,
  VerticalDramaMemoryKind,
  /**
   * Task #22 (season-level product tie-in draft awareness, added
   * 2026-07-09) — the series' `productTieIn` policy shape, read defensively
   * off the loosely-typed jsonb column exactly like every other
   * `productTieIn` read site in this file (see `resolveTieInDraftBootstrap`).
   */
  VerticalDramaProductTieInConfig,
  /**
   * Manual LLM model override (added 2026-07-11 — see
   * `/home/dev/.claude/plans/polished-toasting-gadget.md`) — the series'
   * `llmModelPolicy` jsonb shape, read/written by `listQualityPlanningModels`
   * / `setSeriesLlmModelPolicy` below.
   */
  VerticalDramaSeriesLlmModelPolicy,
  /**
   * Production Episodes (Phase D′-1,
   * `planning/vertical-drama-production-episodes/plan.md`) — the series'
   * `productionEpisodesManifest` jsonb shape, read defensively off the
   * loosely-typed column in `get` below and written by
   * `assembleProductionEpisodesForSeries`
   * (`server/services/verticalDramaProductionEpisodeAssembly.ts`).
   */
  VerticalDramaProductionEpisodesManifest,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_SERIES_LOCALES,
  normalizeVerticalDramaSeriesLocale,
  CREATE_SERIES_FIELD_LIMITS,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  verticalDramaPresetMixSelectionSchema,
  type VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import {
  verticalDramaArcReplanProposalSchema,
  type VerticalDramaArcReplanProposal,
  type VerticalDramaEpisodeBreakdownItem,
} from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaQualityLedgers } from "@shared/verticalDramaSeries/qualityLedgers";
/**
 * Series-level audience age rating (Phase 1 of a 2-phase feature — later
 * phases thread it into per-episode stages) — single source of truth for
 * the target-audience content-constraint tier shown to every story-bible
 * generation prompt; see that module's own header doc comment. Value import
 * (not type-only): `AUDIENCE_AGE_RATINGS` backs the
 * `createSeriesInput`/`synthesizeGenrePresetInput` zod enums below and
 * `resolveAudienceAgeRating` narrows the untyped `bible.audienceAgeRating`
 * jsonb read at every call site that reads an existing series' bible.
 */
import {
  AUDIENCE_AGE_RATINGS,
  resolveAudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
/**
 * Task #22 (season-level product tie-in draft awareness, spec §7.7.2/§7.7.3,
 * added 2026-07-09) — VALUE import (not type-only): `planSeasonTieInPlacements`
 * is a pure/shared function with zero server-only transitive imports (same
 * reasoning `verticalDramaEpisodes.ts` documents at its own identical
 * import), so a static import here is safe. Own import block (not folded
 * into the `contentBudget` block above) so a narrow sibling `vi.mock` of
 * that module keeps working unless it actually exercises tie-in bootstrap.
 */
import {
  planSeasonTieInPlacements,
  type VerticalDramaEpisodeTieInPlacement,
} from "@shared/verticalDramaSeries/contentBudget";
import {
  generateStoryBible,
  generateStoryBibleDeep,
  InsufficientCreditsError,
  VdSchemaValidationError,
  getActiveBreakdown,
  appendBreakdownVersion,
  readActiveDeepDraftMetadata,
  computeDeepDraftSummary,
  readItemShotDrafts,
  readItemCliffhangerLine,
  resolveDeepDraftHorizon,
  VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES,
  /**
   * Task #22 (added 2026-07-09) — the tie-in draft context shape threaded
   * into `generateStoryBibleDeep`'s `tieInDraftContext` param; built by
   * `resolveTieInDraftBootstrap` below.
   */
  type VdTieInDraftContext,
  /**
   * Async story jobs (#28, added 2026-07-08) — credits PRE-CHECK estimate
   * math only (mirrors the SAME per-call estimate `generateStoryBibleDeep`/
   * `applySeasonCritique` already run internally, now inside the worker via
   * `runVerticalDramaStoryJobExecutor`) so a doomed job never gets queued.
   * NOT a reservation/deduction — real credits are still deducted per actual
   * LLM call inside the worker, unchanged.
   */
  computeDeepDraftChunkSizes,
  estimatePremiumDeepDraftCalls,
  VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE,
  readItemWorldRules,
  type DeepDraftRecapEpisode,
  type StoredEpisodeBreakdownItem,
} from "../services/verticalDramaStoryBible";
/**
 * Async story jobs (#28, added 2026-07-08) — generic submit -> jobId -> poll
 * plumbing (queue/worker/status-record store). See
 * `services/verticalDramaStoryJobs.ts`'s own header doc comment for the full
 * design (pattern investigation, persistence, per-series dedupe).
 */
import {
  enqueueVerticalDramaStoryJob,
  getActiveVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus,
  submitVerticalDramaSystemFeedback,
  type VerticalDramaStoryJobPayload,
  type VerticalDramaStoryJobProgress,
} from "../services/verticalDramaStoryJobs";
/**
 * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — replaces the season
 * critique/apply-critique/quality-loop flow. `runImproveScriptJob` is the
 * SAME kind of job-executor function `deep_generate`/`extend` have, except it
 * owns its own DB load + precondition guard (see that function's own doc
 * comment for why) — this router's `startImproveScript` mutation only does
 * ownership/credit pre-checks and enqueues; `runVerticalDramaStoryJobExecutor`
 * below calls `runImproveScriptJob` directly, with no router-owned wrapper.
 *
 * TYPE-ONLY import here (erased at compile time, zero runtime `require`) —
 * `services/verticalDramaImproveScript.ts` pulls in `enabledLlmModels.ts` ->
 * `routers/llmProviders.ts` (needing `adminProcedure`), the SAME "heavy real
 * transitive chain that breaks a sibling test's narrow `vi.mock` graph the
 * instant this module loads" this file's own Ad Banner Overlay/Final Render
 * Suite import blocks document for themselves. The actual VALUE
 * (`runImproveScriptJob`) is loaded via a lazy `await import(...)` INSIDE
 * `runVerticalDramaStoryJobExecutor`'s `"improve_script"` case below — the
 * ONLY call site that ever needs it — mirroring this file's own established
 * lazy-import precedent for exactly this class of problem.
 * `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS`/`VD_IMPROVE_SCRIPT_SKILL_ID`
 * (and the straggler-redo constants) are NOT imported here either — see
 * `estimateImproveScriptJobCredits`'s own doc comment and
 * `confirmImproveScript`'s inline skill-id literal below.
 */
import type { RunImproveScriptJobResult } from "../services/verticalDramaImproveScript";
/**
 * Phase F (added 2026-07-09) — JSONL audit logger. The `record*AuditEvent`
 * helpers already in this file only write to the `api_audit_events` DB
 * table, which the guardian `error_spike` sensor (`services/virtualAdmin/
 * sensors/errorSpike.ts`) never reads — that sensor scans ONLY
 * `logs/audit/audit-YYYY-MM-DD.jsonl` lines for an `eventType` containing
 * "error". `recordVerticalDramaSystemFailureAuditEvent` below writes to BOTH
 * so a partial in-job LLM failure becomes visible to the sensor as well as
 * to `audit.search`'s DB-backed `errorOnly` filter.
 */
import { auditLogger } from "../services/auditLogger";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../services/creditService";
import { renderCriteriaVersionMarker } from "../services/verticalDramaQualityCriteria";
/**
 * Manual dialogue edits (W10.5, added 2026-07-08) — `updateEpisodeDraftDialogue`
 * mutation below. Kept as its OWN import block (rather than folded into the
 * one above) so the "deep story drafts" vs. "manual dialogue edits" feature
 * boundary stays easy to scan; both blocks import from the same service
 * file.
 *
 * Deliberately does NOT import the service's `VD_MANUAL_DIALOGUE_EDIT_*`
 * numeric limit constants (or `VD_DEEP_DRAFT_SHOTS_PER_EPISODE` above) for
 * use in `updateEpisodeDraftDialogueInput` below — several sibling test
 * files mock this whole service module with a narrow, hand-picked export
 * list (no `importOriginal`; see `verticalDramaSeries.createSeriesFieldLimits.agreement.test.ts`
 * for the convention), and any NEW symbol referenced at this file's TOP
 * LEVEL (module-evaluation time, which a zod schema literal always is) is
 * dereferenced immediately on import — breaking every one of those mocks
 * the instant this module loads, regardless of whether their test ever
 * calls this mutation. Symbols referenced only INSIDE a function body
 * (`applyManualDialogueEdit` etc. below) are safe — they are never
 * dereferenced by a test that never invokes that function. The limits
 * are therefore inlined as literals in the schema itself, just below.
 */
import {
  readBreakdownVersions,
  resolveActiveBreakdownVersionIndex,
  readItemManualDialogueEdit,
  applyManualDialogueEdit,
  analyzeManualDialogueEditLines,
  ManualDialogueEditNoDraftError,
  type StoredBreakdownVersion,
} from "../services/verticalDramaStoryBible";
/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — `readActiveSeasonCritique`
 * feeds ONLY `get`'s additive (now UI-orphaned but harmless) `lastCritique`
 * field below. The critique/apply/quality-loop mutations that used to live in
 * this import block were replaced by "ปรับปรุงบทละครให้มีความสมบูรณ์"
 * (2026-07-10, see `services/verticalDramaImproveScript.ts`) — everything
 * else this block used to import (`critiqueSeasonDrafts`/`applySeasonCritique`
 * service functions, `stampSeasonCritiqueOnActiveVersion`,
 * `listSeasonQualityModels`, etc.) was removed along with them.
 * `analyzeSeasonDramaturgy`/`VD_SEASON_CRITIQUE_FINDING_KINDS`/
 * `readActiveSeasonCritique`/`stampSeasonCritiqueOnActiveVersion`/
 * `readItemLastAppliedCritiqueRound` are all DELIBERATELY still exported from
 * `verticalDramaStoryBible.ts` — the separate, still-active
 * `verticalDramaQualityLedgerReconcile.ts` feature depends on them staying
 * intact, even though most are no longer imported HERE.
 */
import {
  readActiveSeasonCritique,
  readBibleRefinedCharacters,
} from "../services/verticalDramaStoryBible";
/**
 * Premium multi-round drafts (W11-A, added 2026-07-08) — `mode` input on the
 * two deep-draft mutations below; `VerticalDramaDeepStoryDraftMode` is this
 * router's own local type (not re-exported from the service) so the input
 * Zod schema and the service call stay in lockstep without a cross-file
 * type import for a 2-value union.
 */
type VerticalDramaDeepStoryDraftMode = "standard" | "premium";
const verticalDramaDeepStoryDraftModeSchema = z.enum(["standard", "premium"]);
import {
  PresetSynthesisInputError,
  synthesizeVerticalDramaPreset,
  synthesizeVerticalDramaPresetV2,
} from "../services/verticalDramaPresetSynthesis";
import {
  applyApprovedArcReplan,
  VerticalDramaArcReplanGuardViolationError,
} from "../services/verticalDramaArcReplan";
import { verticalDramaSeriesMemoryService } from "../services/verticalDramaSeriesMemory";
import { debugError } from "../_core/logger";
import {
  resolveSeriesThumbnailUrls,
  resolveEpisodeThumbnailUrls,
} from "../services/verticalDramaThumbnails";
import {
  submitTrailerJob,
  getTrailerJobStatus,
} from "../services/verticalDramaSeriesTrailerAssembly";
import { getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
/**
 * Read-only series share links (Collab-lite L1, task #32, F131AA, added
 * 2026-07-09) — own import block, but a normal STATIC import (unlike the ad
 * banner block just below): this service's own imports are lightweight
 * (`crypto`/`drizzle-orm`/`../db`/schema tables only — no heavy router or
 * `JWT_SECRET`-asserting transitive chain), same class as
 * `verticalDramaSeriesTrailerAssembly`'s `submitTrailerJob`/`getTrailerJobStatus`
 * import a few lines above, so it is safe for this file's sibling
 * narrow-`vi.mock` tests. See `services/verticalDramaShareLinks.ts` for
 * token hashing, cap enforcement, and the whitelist projection served by
 * this feature's OWN public router (`routers/verticalDramaShare.ts`).
 */
import {
  createSeriesShareLink,
  listSeriesShareLinks,
  revokeSeriesShareLink,
} from "../services/verticalDramaShareLinks";
/**
 * Ad Banner Overlay — series-level banner design studio (F131W, #30-A, spec
 * feature 131, `planning/vertical-drama-ad-banner-overlay/plan.md`). Own
 * import block per this file's established "narrow vi.mock safety"
 * convention (see the deep-story-drafts import block's doc comment above) —
 * every symbol here is referenced ONLY inside a procedure handler's function
 * body below, never at this file's top level.
 *
 * `@shared/verticalDramaSeries/adBannerPresets` is a pure, dependency-free
 * module — safe as a normal static import. The SERVER-side pieces
 * (`services/verticalDramaAdBanner`, `services/rateLimiter`, `_core/tokens`,
 * `services/mediaGenerationService`) are deliberately NOT statically
 * imported here: this router file is imported by many sibling test files
 * with narrow `vi.mock` graphs (see those tests' own doc comments), and each
 * of those 4 modules pulls in a heavy real transitive chain (e.g.
 * `verticalDramaAdBanner` -> `enabledLlmModels` -> the `llmProviders` ROUTER
 * needing `adminProcedure`; `_core/tokens` asserts `JWT_SECRET` at import
 * time) that would otherwise break every one of those sibling tests the
 * instant this module loads — regardless of whether their test ever calls
 * an ad banner procedure. Instead, each is loaded via a lazy
 * `await import(...)` INSIDE the specific handler that needs it, mirroring
 * this file's own established `listProductImages`/`verticalDramaProductTieIn`
 * precedent (see that query's own lazy import a few hundred lines below).
 */
import {
  parseAdBannerDesigns,
  getAdBannerStylePreset,
  getAdBannerPlacementPreset,
  validateAdBannerDesigns,
  containsForbiddenClaim,
  readAdBannerProductContext,
  type VdAdBannerDesign,
} from "@shared/verticalDramaSeries/adBannerPresets";
/**
 * Season batch render (task #21 / W12.5 "Final Render Suite" phase B, added
 * 2026-07-09) — `assembleSeasonVideos` below. TYPE-ONLY imports here
 * (erased at compile time, zero runtime `require`) for the SAME reason this
 * file's Ad Banner Overlay import block documents for itself: the actual
 * VALUES from `../services/verticalDramaEpisodeVideoAssembly` (which
 * statically imports `../storage` and spawns `ffmpeg`/`ffprobe` — a heavy,
 * side-effecting module) are loaded via a lazy `await import(...)` INSIDE
 * `assembleSeasonVideos`'s handler body — none of this router's existing
 * sibling test files mock `../services/verticalDramaEpisodeVideoAssembly`
 * or `../storage` today (the series router never needed either before this
 * wave), so a static top-level import here would break every one of them
 * the instant this module loads. `@shared/verticalDramaSeries/audio` and
 * `@shared/verticalDramaSeries/dialogueAudioTimeline` are pure, DB-free
 * contract modules (no server-only imports) — safe as normal imports, same
 * posture as every other `@shared/verticalDramaSeries/*` import in this
 * file. `HyperframesFinalCompositeSubtitlePresetSchema` is a pure zod schema
 * (`@shared/hyperframes/runtimeApiSchemas`) — also safe.
 */
import type {
  /**
   * Series detail `get`'s `compiledVideo` episode-list summary (below) reads
   * `episode.assemblyManifest.compiledVideo` against this shape — same
   * type-only-import safety as every other name in this block.
   */
  CompiledVideoState,
  EpisodeClipSource,
  RunAssemblyJobDialogueAudioInput,
  RunAssemblyJobSubtitlesInput,
  RunAssemblyJobWatermarkImageInput,
  VdEpisodeTextOverlayCardInput,
  VdEpisodeTextOverlayCharacterIntroInput,
} from "../services/verticalDramaEpisodeVideoAssembly";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type { VdDialogueTimelineClip } from "@shared/verticalDramaSeries/dialogueAudioTimeline";
import { HyperframesFinalCompositeSubtitlePresetSchema } from "@shared/hyperframes/runtimeApiSchemas";
/**
 * Production Episodes render-options (Phase D′-2,
 * `planning/vertical-drama-production-episodes/plan.md` "Render-options
 * LEVEL") — `SUBTITLE_FONT_SIZE_IDS` backs `assembleProductionEpisodes`'s
 * `renderOptions.subtitleFontSize` zod enum below, reusing the EXACT SAME
 * source-of-truth array `assembleEpisodeVideo`'s own inline
 * `subtitleFontSize` enum uses (`verticalDramaEpisodes.ts`), instead of
 * retyping the 4 literal values a second time. Phase C-2
 * (`planning/vertical-drama-production-render/plan.md` Phase C, "overlays
 * generalization") additionally imports `VD_PRODUCTION_OVERLAY_STYLES`/
 * `VD_PRODUCTION_OVERLAY_MAX_COUNT`, backing `overlays[].style`'s zod enum
 * and the `overlays` array's own `.max()` cap below, same reuse-the-single-
 * source-of-truth rationale. Safe as a normal top-level VALUE import (unlike
 * the sibling `verticalDramaEpisodeVideoAssembly.ts` type-only import block
 * above): `verticalDramaFinalRenderGraph.ts` only imports `zod` +
 * `@shared/hyperframes/runtimeApiSchemas` — no `../storage`, no ffmpeg spawn,
 * no DB — so it carries none of that module's "breaks every sibling test's
 * narrow `vi.mock` graph" risk.
 */
import {
  SUBTITLE_FONT_SIZE_IDS,
  VD_PRODUCTION_OVERLAY_MAX_COUNT,
  VD_PRODUCTION_OVERLAY_STYLES,
} from "../services/verticalDramaFinalRenderGraph";
// Task #34 (Text Overlay Suite) — pure/DB-free data model + derivation
// helpers, same safe-static-import posture as `adBannerPresets.ts` above.
import {
  defaultCardStyleVariantForKind,
  deriveEpisodeIndicatorLabel,
  deriveTitleBumperLines,
  parseSeriesWatermarkConfig,
  parseTextOverlayPlan,
  resolveWatermarkCornerAutoAvoid,
  vdSeriesWatermarkConfigSchema,
  type VdSeriesWatermarkConfig,
  type VdTextOverlayPlan,
} from "@shared/verticalDramaSeries/textOverlay";

/** Per-series episode aggregate row shape (typed projection; `db.select` erases to `any`). */
type EpisodeAggRow = {
  seriesId: number;
  maxEpisodeNumber: number;
  episodeCount: number;
};
/** Per-series pending-approval aggregate row shape. */
type ApprovalAggRow = { seriesId: number; pendingCount: number };
/** Light episode projection returned by the Series detail query. */
type EpisodeListProjection = {
  id: number;
  episodeNumber: number;
  title: string | null;
  status: string;
  targetDurationSeconds: number;
  updatedAt: Date;
  /**
   * Raw jsonb manifest — read ONLY so `get`'s DTO map (below) can derive the
   * compact `compiledVideo` summary via `extractEpisodeCompiledVideoSummary`;
   * it is destructured back OUT before the episode DTO is returned, so the
   * raw manifest itself never reaches the client. `unknown` matches this
   * column's Drizzle-inferred type (`jsonb()`, no `.$type<>()`) — same
   * convention as `RunArtifactProjection.mediaAssetIds` below.
   */
  assemblyManifest: unknown;
};
/** Character asset projection (joined to character name) for the Assets tab. */
type CharacterAssetProjection = {
  id: number;
  characterId: number | null;
  characterName: string | null;
  mediaAssetId: number | null;
  assetType: string;
  role: string | null;
  approved: boolean;
  qcStatus: string;
  createdAt: Date;
};
/** Run artifact projection for the Assets tab. */
type RunArtifactProjection = {
  id: number;
  episodeId: number;
  stage: string;
  storageKey: string | null;
  mediaAssetIds: unknown;
  createdAt: Date;
};
type GenrePresetDto = {
  id: string;
  title: string;
  category: string;
  scope: string;
  logline: string;
  mainPlot: string;
  seasonArc: string;
  tone: string;
  cliffhangerStyle: string;
  characters: Array<{ name: string; role: string; description: string }>;
  visualBible: string;
  /** VerticalDramaPresetVisualIdentity (spec 131 §8.2.2) — null for legacy presets */
  visualIdentityJson?: unknown;
};

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Base procedure for the vertical drama series surface: authenticated AND gated
 * on the canonical `verticalDramaSeries` feature flag (fail-closed).
 */
const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

/**
 * Base procedure for the arc-replan review procedures (spec §7.7.3,
 * section-13): the base `verticalDramaSeries` gate PLUS the dedicated
 * `verticalDramaSeriesArcReplan` flag — mirrors `agency.ts`'s established
 * "chain a second, more specific `requireFeatureFlag` middleware" convention
 * for a feature-specific sub-flag layered on top of a surface-wide one.
 */
const verticalDramaArcReplanProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesArcReplan")
);

/**
 * Base procedure for the deep story draft procedures (W10-A, added
 * 2026-07-08): the base `verticalDramaSeries` gate PLUS the dedicated
 * `verticalDramaSeriesDeepStoryDrafts` flag — same "chain a second,
 * feature-specific `requireFeatureFlag` middleware" convention as
 * `verticalDramaArcReplanProcedure` above.
 */
const verticalDramaDeepStoryDraftsProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesDeepStoryDrafts")
);

/**
 * Base procedure for the read-only series share link OWNER mutations (task
 * #32, Collab-lite L1, F131AA, added 2026-07-09): the base
 * `verticalDramaSeries` gate PLUS the dedicated `verticalDramaSeriesShareLinks`
 * flag — same "chain a second, feature-specific `requireFeatureFlag`
 * middleware" convention as `verticalDramaArcReplanProcedure`/
 * `verticalDramaDeepStoryDraftsProcedure` above. The PUBLIC read procedure
 * (`verticalDramaShare.getSharedSeries`, a completely separate router) does
 * NOT re-check this flag — see that router's own doc comment: a link can
 * only be CREATED while the flag is on (control at the source), and an
 * already-issued link must keep resolving on its own expiresAt/revokedAt
 * lifecycle even if the flag is later turned off for that tenant.
 */
const verticalDramaShareLinksProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesShareLinks")
);

/**
 * Named + exported (not inlined into `.input(...)`) so
 * `verticalDramaSeries.shareLinks.test.ts` can `.safeParse()` it directly —
 * same "export the zod schema for direct bounds testing" convention as
 * `createSeriesInput` (see
 * `verticalDramaSeries.createSeriesFieldLimits.agreement.test.ts`). Only 7
 * or 30 days are offered; any other number (or non-number) fails to parse.
 */
export const createSeriesShareLinkInput = z.object({
  seriesId: z.string().min(1),
  expiresInDays: z.union([z.literal(7), z.literal(30)]),
});

export const listSeriesShareLinksInput = z.object({
  seriesId: z.string().min(1),
});

export const revokeSeriesShareLinkInput = z.object({
  seriesId: z.string().min(1),
  linkId: z.string().min(1),
});

/** Resolve a non-null tenant id or fail closed. */
function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

/** Ownership predicate reused by every query: tenant + user + id. */
function seriesOwnershipWhere(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  return and(
    eq(verticalDramaSeries.id, seriesId),
    eq(verticalDramaSeries.tenantId, tenantId),
    eq(verticalDramaSeries.userId, userId)
  );
}

/**
 * Load a series row the caller owns, or throw NOT_FOUND. NOT_FOUND (not
 * FORBIDDEN) is deliberate so we never disclose the existence of another
 * tenant's/user's series.
 */
async function loadOwnedSeries(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const [row] = await db
    .select()
    .from(verticalDramaSeries)
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  return row;
}

/**
 * Load an `arc_replan_proposal` memory event the caller owns (tenant +
 * series scoped — mirrors `verticalDramaSeriesMemory.ts`'s private
 * `getProposal()` for retcons exactly, inlined here since that method isn't
 * exported and is retcon-kind-specific). NOT_FOUND (never FORBIDDEN) for a
 * missing/cross-tenant/wrong-kind row — never discloses existence.
 */
async function loadArcReplanProposalEvent(
  tenantId: string,
  seriesId: number,
  proposalEventId: number
): Promise<VerticalDramaMemoryEventRow> {
  const [row] = await db
    .select()
    .from(verticalDramaMemoryEvents)
    .where(
      and(
        eq(verticalDramaMemoryEvents.id, proposalEventId),
        eq(verticalDramaMemoryEvents.tenantId, tenantId),
        eq(verticalDramaMemoryEvents.seriesId, seriesId)
      )
    )
    .limit(1);
  if (!row || row.memoryKind !== "arc_replan_proposal") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Arc re-plan proposal not found",
    });
  }
  return row as VerticalDramaMemoryEventRow;
}

/**
 * True when `proposalEventId` already has a later approval/rejection event
 * pointing back at it (mirrors `deriveRetconOutcome`'s "scan later events"
 * pattern for retcons, reimplemented narrowly here for arc-replan's own
 * `arcReplanApprovalOf`/`arcReplanRejectionOf` payload keys since that
 * function is retcon-key-specific and not reusable as-is). Guards against
 * double-processing (e.g. a duplicate click without an idempotency key)
 * appending a second breakdown version or contradicting a prior decision.
 */
async function findArcReplanDecision(
  tenantId: string,
  userId: number,
  seriesId: number,
  proposalEventId: number
): Promise<"approved" | "rejected" | null> {
  const events = await verticalDramaSeriesMemoryService.listEvents({
    tenantId,
    userId,
    seriesId,
    limit: 1000,
  });
  const key = String(proposalEventId);
  for (const ev of events) {
    if (ev.payload?.arcReplanApprovalOf === key) return "approved";
    if (ev.payload?.arcReplanRejectionOf === key) return "rejected";
  }
  return null;
}

/**
 * Best-effort audit record for a deep story draft generate/extend run
 * (W10-A, added 2026-07-08). Written to the cross-cutting `api_audit_events`
 * table (mirrors `hyperframesOperatorService.ts`'s own "best-effort DB
 * insert, never throws" convention) rather than a new
 * `verticalDramaMemoryEvents` kind: `VerticalDramaMemoryKind`
 * (`@shared/verticalDramaSeries/memory`) is a closed union outside this
 * task's owned files, so a new per-series Memory-timeline kind is out of
 * scope here — this still gives an admin-queryable durable record of the
 * action (seriesId, chunk plan, partial flag, credits used, idempotency key
 * for correlation) without touching that file. NEVER throws — a failed
 * audit write must not fail the user-facing mutation.
 */
async function recordDeepStoryDraftAuditEvent(params: {
  userId: number;
  seriesId: number;
  action: "generate" | "extend";
  chunkSizes: number[];
  horizonEndEpisode: number;
  partial: boolean;
  creditsUsed: number;
  idempotencyKey?: string;
  /** Premium multi-round drafts (W11-A) — always present; "standard" for every pre-W11-A call site's behavior. */
  mode: VerticalDramaDeepStoryDraftMode;
  /** Live-bug fix (added 2026-07-08) — episode numbers still missing after chunk processing; see `GenerateStoryBibleDeepResult.missingEpisodes`. Always present (may be `[]`), per the LLM/Media debugging protocol's "audit log has the answer" rule. */
  missingEpisodes: number[];
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: "vertical_drama_deep_story_draft",
      userId: params.userId,
      endpoint: `verticalDramaSeries.${params.action === "generate" ? "generateStoryBibleDeep" : "extendStoryDraftHorizon"}`,
      statusCode: 200,
      skillSlug: "vertical-drama-deep-story-draft",
      creditsCharged: Math.round(params.creditsUsed),
      metadata: {
        seriesId: params.seriesId,
        action: params.action,
        chunkSizes: params.chunkSizes,
        horizonEndEpisode: params.horizonEndEpisode,
        partial: params.partial,
        idempotencyKey: params.idempotencyKey ?? null,
        mode: params.mode,
        missingEpisodes: params.missingEpisodes,
      },
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to record deep story draft audit event",
      error
    );
  }
}

/**
 * Merge freshly deep-drafted episode data onto the EXISTING active
 * breakdown (owner-approved design point 5): only `shotDrafts` /
 * `cliffhanger_line` / `draftCompleteness` come from the fresh generation —
 * `workingTitle`/`logline`/`keyBeats`/`contentBudget` always stay exactly as
 * already planned. Episodes outside the covered horizon are returned
 * untouched. Never mutates `existingItems`.
 */
function mergeDeepDraftItems(
  existingItems: StoredEpisodeBreakdownItem[],
  draftedItems: Array<{
    episodeNumber: number;
    shotDrafts: unknown;
    cliffhanger_line?: string;
    draftCompleteness: unknown;
    /** Premium multi-round drafts (W11-A) — absent for standard-mode results, so the conditional spread below omits the key entirely (byte-identical to pre-W11-A merged items). */
    draftScorecard?: unknown;
  }>
): StoredEpisodeBreakdownItem[] {
  const draftedByEpisode = new Map(
    draftedItems.map(item => [item.episodeNumber, item])
  );
  return existingItems.map(item => {
    const drafted = draftedByEpisode.get(item.episodeNumber);
    if (!drafted) return item;
    return {
      ...item,
      shotDrafts: drafted.shotDrafts,
      cliffhanger_line: drafted.cliffhanger_line,
      draftCompleteness: drafted.draftCompleteness,
      ...(drafted.draftScorecard
        ? { draftScorecard: drafted.draftScorecard }
        : {}),
    } as StoredEpisodeBreakdownItem;
  });
}

/* -------------------------------------------------------------------------- */
/* Async story jobs (#28, added 2026-07-08) — shared helpers                  */
/* -------------------------------------------------------------------------- */

/**
 * Synchronous credits pre-check — FAILS FAST inside the mutation, BEFORE a
 * job is ever enqueued, so a doomed request never occupies the series'
 * story-job slot. Mirrors the SAME `hasEnoughCredits` + per-call estimate
 * math `generateStoryBibleDeep`/`applySeasonCritique`/`critiqueSeasonDrafts`
 * already run internally (now inside the worker) — this is NOT a
 * reservation/deduction, just an early, honest "you can't afford this"
 * signal. Throws the exact FORBIDDEN shape the worker's own internal
 * `InsufficientCreditsError` would eventually map to.
 */
async function ensureStoryJobCreditsAvailable(
  userId: number,
  estimate: number
): Promise<void> {
  const ok = await hasEnoughCredits(userId, estimate);
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: new InsufficientCreditsError().message,
    });
  }
}

/** Credits pre-check estimate for `generateStoryBibleDeep`/`extendStoryDraftHorizon` — mirrors `generateStoryBibleDeep`'s/`generateStoryBibleDeepPremium`'s own internal `totalEstimate` math exactly. */
function estimateDeepDraftJobCredits(
  episodeCount: number,
  mode: VerticalDramaDeepStoryDraftMode
): number {
  const chunkSizes = computeDeepDraftChunkSizes(episodeCount);
  const calls =
    mode === "premium"
      ? estimatePremiumDeepDraftCalls(chunkSizes.length)
      : chunkSizes.length;
  return calls * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE;
}

/**
 * Worst-case credits pre-check for "ปรับปรุงบทละครให้มีความสมบูรณ์" — mirrors
 * the removed `estimateQualityLoopJobCredits`'s own "worst case" shape.
 * Realigned (2026-07-10, whole-block restoration) to the WHOLE-BLOCK
 * PRIMARY pass + bounded PER-EPISODE STRAGGLER REDO architecture
 * (`services/verticalDramaImproveScript.ts`): the primary pass burns its
 * own whole-job round budget regardless of episode count, and on top of
 * that every drafted episode could — worst case — ALSO need a full
 * straggler redo (its own bounded attempt/round budget). Cost is therefore
 * a fixed whole-block worst case PLUS a per-episode straggler worst case,
 * not purely linear-in-episodes like the per-episode-primary era's formula.
 *
 * Deliberately duplicates the LITERAL values of
 * `VD_IMPROVE_SCRIPT_MAX_CONTINUATION_ROUNDS` (whole-block primary pass,
 * now 8 — per JOB, not per episode), `VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ATTEMPTS`
 * (2), and `VD_IMPROVE_SCRIPT_STRAGGLER_MAX_ROUNDS` (3) (all
 * `services/verticalDramaImproveScript.ts`) instead of importing them — see
 * this file's import block doc comment just above `runImproveScriptJob`'s
 * own import for why a value import of anything from that service file must
 * stay lazy (heavy `enabledLlmModels` -> `llmProviders` router transitive
 * chain, breaks sibling `vi.mock` tests).
 */
const VD_IMPROVE_SCRIPT_WHOLE_BLOCK_ROUNDS_ESTIMATE = 8;
const VD_IMPROVE_SCRIPT_STRAGGLER_ATTEMPTS_ESTIMATE = 2;
const VD_IMPROVE_SCRIPT_STRAGGLER_ROUNDS_ESTIMATE = 3;
function estimateImproveScriptJobCredits(draftedEpisodeCount: number): number {
  return (
    VD_IMPROVE_SCRIPT_WHOLE_BLOCK_ROUNDS_ESTIMATE *
      VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE +
    Math.max(0, draftedEpisodeCount) *
      VD_IMPROVE_SCRIPT_STRAGGLER_ATTEMPTS_ESTIMATE *
      VD_IMPROVE_SCRIPT_STRAGGLER_ROUNDS_ESTIMATE *
      VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE
  );
}

interface StoryJobExecutorOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

/**
 * Kind-specific job executors (#28) — each is the OLD synchronous mutation's
 * EXACT body (guards + service call + persistence + audit), parameterized by
 * `(tenantId, userId, seriesId, ...light input)` instead of `(ctx, input)`,
 * with an `onProgress` passthrough added into the storyBible service call.
 * Called ONLY from inside the BullMQ worker (via
 * `runVerticalDramaStoryJobExecutor` below) — there is no more public
 * synchronous path to any of them. Each re-runs the SAME ownership/
 * precondition guards the mutation already ran fail-fast (state may have
 * shifted between enqueue and dequeue) — mirrors this file's own established
 * "guard in both places" convention (see `critiqueSeasonDrafts`'s
 * service-level defensive re-check doc comment). Exported so
 * `routers/__tests__/verticalDramaSeries.*.test.ts` can exercise them
 * directly, the same way it used to call the mutation handler directly.
 */
/**
 * F131X (`verticalDramaSeriesFormatProfiles`) — length-aware format profiles
 * for the 4 story-job executors below. Resolved per tenant, mirroring the
 * episodes router's `resolveVerticalDramaVoiceChainFlag` convention. Fails
 * closed: flag missing/unreadable → `false` → byte-identical legacy behavior
 * inside `verticalDramaStoryBible.ts` (its params are optional-additive).
 */
async function resolveVerticalDramaFormatProfilesFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaSeriesFormatProfiles === true;
  } catch {
    return false;
  }
}

/**
 * Feature 132 §5 (F132B) — gates the `ledger_plan` step in the two
 * deep-draft job executors. Local fail-closed helper, matching the existing
 * per-router tenant-flag resolver pattern in this file.
 */
async function resolveVerticalDramaQualityLedgersFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaQualityLedgers === true;
  } catch {
    return false;
  }
}

/**
 * F131Y (`verticalDramaSeriesTieInReplan`, task #22, added 2026-07-09) —
 * gates season-level tie-in draft awareness in the 2 deep-draft job
 * executors below. This router does NOT yet have this resolver (unlike
 * `verticalDramaEpisodes.ts`'s own `resolveVerticalDramaTieInReplanFlag`,
 * which gates `deferEpisodeTieIn`'s real-proposal path) — added here as its
 * own local copy, mirroring `resolveVerticalDramaFormatProfilesFlag`'s shape
 * exactly (same fail-closed try/catch), per this file's own established
 * "small pure helper duplicated per router file" convention (see that
 * function's own doc comment, and `contentBudget.ts`'s `VD_TIE_IN_REPLAN_ROLLOUT`
 * note). SAME flag key as the episodes router's resolver — this is the ONE
 * canonical tenant flag, just resolved independently per file.
 */
async function resolveVerticalDramaTieInReplanFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaSeriesTieInReplan === true;
  } catch {
    return false;
  }
}

async function planQualityLedgersForBreakdown(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  title?: string | null;
  locale: VerticalDramaSeriesRow["locale"];
  genre?: string | null;
  tone?: string | null;
  bible: Record<string, unknown>;
  activeBreakdown: StoredEpisodeBreakdownItem[];
  totalEpisodeCount?: number | null;
  idempotencyKey?: string;
  onProgress: (progress: VerticalDramaStoryJobProgress) => void;
}): Promise<{
  ledgers: VerticalDramaQualityLedgers;
  creditsUsed: number;
} | null> {
  const enabled = await resolveVerticalDramaQualityLedgersFlag(params.tenantId);
  if (!enabled) return null;

  const { runVerticalDramaLedgerPlanning } =
    await import("../services/verticalDramaLedgerPlanner");
  const result = await runVerticalDramaLedgerPlanning({
    userId: params.userId,
    tenantId: params.tenantId,
    seriesId: params.seriesId,
    title: params.title,
    locale: normalizeVerticalDramaSeriesLocale(params.locale),
    genre: params.genre,
    tone: params.tone,
    refinedCharacters: readBibleRefinedCharacters(params.bible),
    worldRules: params.activeBreakdown.flatMap(item =>
      readItemWorldRules(item)
    ),
    activeBreakdown: params.activeBreakdown,
    totalEpisodeCount:
      params.totalEpisodeCount ?? params.activeBreakdown.length,
    idempotencyKey: params.idempotencyKey
      ? `${params.idempotencyKey}:ledger_plan`
      : undefined,
    onProgress: params.onProgress,
  });

  return { ledgers: result.ledgers, creditsUsed: result.creditsUsed };
}

/**
 * F131AB (`verticalDramaSeriesTextOverlaySuite`, task #34) — gates
 * `updateSeriesWatermark` (brand-new mutation — flags-off means FORBIDDEN)
 * and the additive text-overlay/watermark feeding inside `assembleSeasonVideos`
 * below. This router does NOT import `verticalDramaEpisodes.ts`'s own
 * `resolveVerticalDramaTextOverlaySuiteFlag` — added here as its own local
 * copy, mirroring `resolveVerticalDramaTieInReplanFlag`'s shape exactly (same
 * fail-closed try/catch), per this file's own established "small pure helper
 * duplicated per router file" convention. SAME flag key as the episodes
 * router's resolver — this is the ONE canonical tenant flag, just resolved
 * independently per file.
 */
async function resolveVerticalDramaTextOverlaySuiteFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaSeriesTextOverlaySuite === true;
  } catch {
    return false;
  }
}

/**
 * Defensive fallback for a legacy/malformed `productTieIn.maxEpisodesWithTieInPerTenEpisodes`
 * (task #22) — the field is REQUIRED by `VerticalDramaProductTieInConfig`'s
 * TS type, but the stored column is a loosely-typed jsonb blob
 * (`updateSeries`'s own input is `z.record(z.string(), z.unknown())`, see
 * this file's own `productTieIn` schema) that predates any strict runtime
 * validation of this specific key. Mirrors the value this codebase's own
 * test fixtures already use for it (`verticalDramaProductTieIn.test.ts`,
 * `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`) — a
 * reasonable mid-range default within `verticalDramaProvider.ts`'s own
 * `tieInConfigSchema` bounds (`z.number().int().min(0).max(10)`).
 */
const VD_TIE_IN_DRAFT_DEFAULT_PER_TEN_CAP = 3;

/**
 * Task #22 (season-level product tie-in draft awareness, spec §7.7.2/§7.7.3,
 * added 2026-07-09) — shared by `runGenerateStoryBibleDeepJob` and
 * `runExtendStoryDraftHorizonJob` below (same "small helper shared by both
 * deep-draft executors" convention as `mergeDeepDraftItems`/
 * `recordDeepStoryDraftAuditEvent`/`resolveVerticalDramaFormatProfilesFlag`).
 *
 * Activates ONLY when ALL of: (a) `resolveVerticalDramaTieInReplanFlag`
 * resolves `true` for `tenantId`, (b) the series' own `productTieIn.enabled
 * === true`. Otherwise returns `{ items, context: undefined }` — the
 * ORIGINAL `items` array, byte-identical, untouched — so a flag-off or
 * tie-in-disabled series' deep-draft run stays exactly as it was before this
 * feature existed: no bootstrap, no persisted `tieIn` field, no
 * `tieInDraftContext` passed to the service.
 *
 * Bootstrap: mirrors `verticalDramaEpisodes.ts`'s `deferEpisodeTieIn`
 * `hasAnyPlannedTieIn` check exactly (same convention, independently
 * duplicated per that file's own established "small pure helper duplicated
 * per router file" pattern) — if NO item in `items` carries a `tieIn` field
 * yet, plans one via the canonical `planSeasonTieInPlacements` (never a
 * second distribution formula) over the FULL active breakdown and returns
 * that FULL bootstrapped array in place of `items`. When at least one item
 * already carries `tieIn` (a prior bootstrap/plan, or an adopted
 * `VD_ARC_TIE_IN_DEFERRED` re-plan), `items` is returned untouched — this
 * function never overwrites an existing placement decision.
 *
 * The CALLER is responsible for persisting the returned `items` (via the
 * SAME `appendBreakdownVersion({ source: "generate_story", ... })` write it
 * already performs after generation) so a first-time bootstrap durably
 * sticks — this function itself never writes to the database.
 */
async function resolveTieInDraftBootstrap(params: {
  tenantId: string;
  items: StoredEpisodeBreakdownItem[];
  productTieIn: unknown;
  plannedCount: number;
}): Promise<{
  items: StoredEpisodeBreakdownItem[];
  context?: VdTieInDraftContext;
}> {
  const tieInReplanEnabled = await resolveVerticalDramaTieInReplanFlag(
    params.tenantId
  );
  const rawProductTieIn =
    (params.productTieIn as Record<string, unknown> | null) ?? null;
  if (!tieInReplanEnabled || rawProductTieIn?.enabled !== true) {
    return { items: params.items };
  }

  const hasAnyPlannedTieIn = params.items.some(
    item => item.tieIn !== undefined
  );
  const perTenCap =
    typeof rawProductTieIn.maxEpisodesWithTieInPerTenEpisodes === "number"
      ? rawProductTieIn.maxEpisodesWithTieInPerTenEpisodes
      : VD_TIE_IN_DRAFT_DEFAULT_PER_TEN_CAP;
  // Type bridge (mirrors `verticalDramaEpisodes.ts`'s `deferEpisodeTieIn`
  // identical cast — see that call site's own doc comment): `StoredEpisodeBreakdownItem`
  // (this file's zod-inferred, storage-tolerant type) is structurally a
  // superset of `VerticalDramaEpisodeBreakdownItem` (contentBudget.ts's
  // hand-written, `contentBudget`-required type) for every field
  // `planSeasonTieInPlacements` actually reads/spreads.
  const workingItems: StoredEpisodeBreakdownItem[] = hasAnyPlannedTieIn
    ? params.items
    : (planSeasonTieInPlacements(
        params.items as unknown as VerticalDramaEpisodeBreakdownItem[],
        { perTenCap, plannedCount: params.plannedCount }
      ) as unknown as StoredEpisodeBreakdownItem[]);

  const placements = workingItems
    .filter(
      (
        item
      ): item is StoredEpisodeBreakdownItem & {
        tieIn: VerticalDramaEpisodeTieInPlacement;
      } => item.tieIn !== undefined
    )
    .map(item => ({
      episodeNumber: item.episodeNumber,
      placement: item.tieIn,
    }));

  const productName =
    typeof rawProductTieIn.productName === "string" &&
    rawProductTieIn.productName.trim().length > 0
      ? rawProductTieIn.productName
      : "the product";
  const productCategory =
    typeof rawProductTieIn.productCategory === "string"
      ? rawProductTieIn.productCategory
      : undefined;
  // No current UI writes a `benefitFocus` key into `productTieIn` — read
  // defensively/forward-compatibly here anyway (see `VdTieInDraftContext`'s
  // own doc comment), matching how `verticalDramaEpisodePipeline.ts` already
  // reads `productDescription` even though no UI writes THAT key either.
  const benefitFocus =
    typeof rawProductTieIn.benefitFocus === "string"
      ? rawProductTieIn.benefitFocus
      : undefined;
  const forbiddenClaims = Array.isArray(rawProductTieIn.forbiddenClaims)
    ? rawProductTieIn.forbiddenClaims.filter(
        (c): c is string => typeof c === "string"
      )
    : [];

  return {
    items: workingItems,
    context: {
      productName,
      productCategory,
      benefitFocus,
      forbiddenClaims,
      placements,
    },
  };
}

export async function runGenerateStoryBibleDeepJob(
  params: StoryJobExecutorOwner & {
    horizonEpisodes?: number;
    mode?: VerticalDramaDeepStoryDraftMode;
    idempotencyKey?: string;
  },
  onProgress: (progress: VerticalDramaStoryJobProgress) => void
) {
  const { tenantId, userId, seriesId } = params;
  const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
  const formatProfilesEnabled =
    await resolveVerticalDramaFormatProfilesFlag(tenantId);

  const row = await loadOwnedSeries(tenantId, userId, seriesId);
  const bible = (row.bible as Record<string, unknown> | null) ?? {};
  const rawExistingItems = getActiveBreakdown(bible);
  if (rawExistingItems.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Generate the story bible first before generating deep shot drafts",
    });
  }

  // Task #22 — season-level tie-in draft awareness bootstrap. `existingItems`
  // below REPLACES `rawExistingItems` for every later use in this executor
  // (horizon filtering AND the final `mergeDeepDraftItems` base) so a
  // first-time bootstrap's `tieIn` fields are actually persisted by the SAME
  // `appendBreakdownVersion` write below — see `resolveTieInDraftBootstrap`'s
  // own doc comment. `context` stays `undefined` (byte-identical run) unless
  // the flag AND the series' tie-in are both on.
  const tieInBootstrap = await resolveTieInDraftBootstrap({
    tenantId,
    items: rawExistingItems,
    productTieIn: row.productTieIn,
    plannedCount: row.targetEpisodeCount ?? rawExistingItems.length,
  });
  const existingItems = tieInBootstrap.items;

  const horizon = resolveDeepDraftHorizon(
    params.horizonEpisodes,
    row.targetEpisodeCount
  );
  const episodeNumbers = new Set(
    Array.from({ length: horizon }, (_, i) => i + 1)
  );
  const episodesToDraft = existingItems
    .filter(item => episodeNumbers.has(item.episodeNumber))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  if (episodesToDraft.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No planned Sub-episodes are available within the requested horizon",
    });
  }

  let ledgerPlan: {
    ledgers: VerticalDramaQualityLedgers;
    creditsUsed: number;
  } | null = null;
  let result;
  try {
    ledgerPlan = await planQualityLedgersForBreakdown({
      tenantId,
      userId,
      seriesId,
      title: row.title,
      locale: row.locale,
      genre: row.genre,
      tone: row.tone,
      bible,
      activeBreakdown: existingItems,
      totalEpisodeCount: row.targetEpisodeCount,
      idempotencyKey: params.idempotencyKey,
      onProgress,
    });
    result = await generateStoryBibleDeep({
      userId,
      tenantId,
      seriesId,
      title: row.title,
      locale: normalizeVerticalDramaSeriesLocale(row.locale),
      genre: row.genre,
      tone: row.tone,
      episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
      episodes: episodesToDraft,
      mode,
      // F131X + finale price_paid rule (both dormant without these — the
      // service's optional params default off; see #23's wiring note)
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
      formatProfilesEnabled,
      // Task #22 — dormant (`undefined`) unless the bootstrap above actually
      // activated; see `resolveTieInDraftBootstrap`'s own doc comment.
      tieInDraftContext: tieInBootstrap.context,
      // Feature 132 §4.2.7 (F132A) — inherits the premise via the same
      // bible read already done above; the flag gate itself lives at
      // `create`/`synthesizeGenrePreset` write time (only a truthy string
      // ever gets persisted into `bible.userPremise` in the first place).
      userPremise:
        typeof bible.userPremise === "string" ? bible.userPremise : undefined,
      // Series-level audience age rating (Phase 1) — same "inherit via the
      // bible read already done above" convention as `userPremise` just
      // above; always resolves to a concrete tier (defaults to the
      // least-restrictive "18plus" when absent/invalid).
      audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
      onProgress,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    if (error instanceof VdSchemaValidationError) {
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
          : "Deep story draft generation failed",
    });
  }

  const mergedItems = mergeDeepDraftItems(existingItems, result.draftedItems);
  const horizonEndEpisode = result.draftedItems.reduce(
    (max, item) => Math.max(max, item.episodeNumber),
    0
  );
  const generatedAt = new Date().toISOString();
  const totalCreditsUsed = result.creditsUsed + (ledgerPlan?.creditsUsed ?? 0);

  const nextBible = appendBreakdownVersion(bible, {
    source: "generate_story",
    items: mergedItems,
    createdByUserId: userId,
    ...(ledgerPlan ? { ledgers: ledgerPlan.ledgers } : {}),
    deepDraft: {
      horizonEndEpisode,
      chunkSizes: result.chunkSizes,
      generatedAt,
      ...(result.premiumMetrics ? { premium: result.premiumMetrics } : {}),
    },
  });

  const [updatedRow] = await db
    .update(verticalDramaSeries)
    .set({ bible: nextBible, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .returning();

  await recordDeepStoryDraftAuditEvent({
    userId,
    seriesId,
    action: "generate",
    chunkSizes: result.chunkSizes,
    horizonEndEpisode,
    partial: result.partial,
    creditsUsed: totalCreditsUsed,
    idempotencyKey: params.idempotencyKey,
    mode,
    missingEpisodes: result.missingEpisodes,
  });

  // Phase F (added 2026-07-09) — additive error-shaped audit event + auto
  // system feedback ticket when `generateStoryBibleDeep` stopped early
  // (`partial: true`) with a real system/LLM-call error, so this failure
  // stops being buried silently inside `partial`/`error` response fields.
  // Noise control: only when BOTH `partial` and `error` are set — a `partial`
  // run with no `error` cannot happen per `GenerateStoryBibleDeepResult`'s own
  // contract, but the `&&` keeps this defensive regardless.
  if (result.partial && result.error) {
    const traceId = randomUUID().replace(/-/g, "").slice(0, 32);
    const draftedEpisodeNumbers = new Set(
      result.draftedItems.map(item => item.episodeNumber)
    );
    const requestedEpisodeNumbers = episodesToDraft.map(
      item => item.episodeNumber
    );
    const diffFailedEpisodes = requestedEpisodeNumbers.filter(
      ep => !draftedEpisodeNumbers.has(ep)
    );
    const failedEpisodes =
      diffFailedEpisodes.length > 0
        ? diffFailedEpisodes
        : result.missingEpisodes;

    await recordVerticalDramaSystemFailureAuditEvent({
      eventType: "vertical_drama_deep_generate_error",
      endpoint: "verticalDramaSeries.generateStoryBibleDeep",
      userId,
      seriesId,
      traceId,
      errorMessage: result.error,
      metadata: {
        failedEpisodes,
        requestedCount: requestedEpisodeNumbers.length,
        draftedCount: result.draftedItems.length,
        stage: "deep_generate_chunk",
        mode,
      },
    });

    await submitVerticalDramaSystemFeedback(
      {
        tenantId,
        userId,
        seriesId,
        category: "vertical_drama_deep_generate",
        title: `[System] สร้างร่างละเอียดเนื้อเรื่อง ล้มเหลวบางส่วน (series #${seriesId})`,
        description: [
          `ระบบสร้างร่างละเอียดเนื้อเรื่อง (deep_generate) ล้มเหลวบางส่วนและสร้าง feedback นี้อัตโนมัติ`,
          `User ID: ${userId}`,
          `Tenant ID: ${tenantId}`,
          `Series ID: ${seriesId}`,
          `ตอนย่อยที่ล้มเหลว: ${failedEpisodes.join(", ")}`,
          `จำนวนที่ขอสร้าง: ${requestedEpisodeNumbers.length}`,
          `จำนวนที่สร้างสำเร็จ: ${result.draftedItems.length}`,
          `Error: ${result.error}`,
        ].join("\n"),
        stepsToReproduce: [
          `1. เปิดหน้า /drama-series/${seriesId}`,
          `2. ตรวจสอบตอนย่อยที่ล้มเหลว: ${failedEpisodes.join(", ")}`,
          "3. ค้น log ด้วย traceId ต่อไปนี้ใน logs/audit/",
          `4. traceId: ${traceId}`,
        ].join("\n"),
        expectedBehavior:
          "การสร้างร่างละเอียดเนื้อเรื่องควรสำเร็จหรือรายงานผลลัพธ์บางส่วนได้โดยไม่ทำให้ workflow ล้มเหลวเงียบ",
        actualBehavior: result.error,
        contextJson: {
          source: "vertical_drama_deep_generate",
          eventType: "system_partial_failure",
          seriesId,
          jobKind: "deep_generate",
          failedEpisodes,
          model: result.model,
          errorMessages: [result.error],
          traceId,
        },
      },
      db
    );
  }

  return {
    series: { ...updatedRow, id: String(updatedRow.id) },
    creditsUsed: totalCreditsUsed,
    model: result.model,
    partial: result.partial,
    horizonEndEpisode,
    chunkSizes: result.chunkSizes,
    warnings: result.warnings,
    error: result.partial ? result.error : undefined,
    mode,
    callsMade: result.premiumMetrics?.callsMade ?? result.chunkSizes.length,
    // Live-bug fix (added 2026-07-08) — episode numbers still missing after
    // this run's chunk processing (including its corrective retry); always
    // `[]` when every requested episode was drafted.
    missingEpisodes: result.missingEpisodes,
    // Task #22 — additive, only present when tie-in draft awareness was
    // active this run (see `GenerateStoryBibleDeepResult.tieInMismatchCount`'s
    // own doc comment).
    tieInMismatchCount: result.tieInMismatchCount,
  };
}

export async function runExtendStoryDraftHorizonJob(
  params: StoryJobExecutorOwner & {
    additionalEpisodes?: number;
    mode?: VerticalDramaDeepStoryDraftMode;
    idempotencyKey?: string;
  },
  onProgress: (progress: VerticalDramaStoryJobProgress) => void
) {
  const { tenantId, userId, seriesId } = params;
  const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
  const formatProfilesEnabled =
    await resolveVerticalDramaFormatProfilesFlag(tenantId);

  const row = await loadOwnedSeries(tenantId, userId, seriesId);
  const bible = (row.bible as Record<string, unknown> | null) ?? {};
  const rawExistingItems = getActiveBreakdown(bible);
  if (rawExistingItems.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Generate the story bible first before extending deep shot drafts",
    });
  }

  // Task #22 — see `runGenerateStoryBibleDeepJob`'s identical bootstrap step
  // (and `resolveTieInDraftBootstrap`'s own doc comment) for the full
  // rationale; `existingItems` below replaces `rawExistingItems` for every
  // later use in this executor.
  const tieInBootstrap = await resolveTieInDraftBootstrap({
    tenantId,
    items: rawExistingItems,
    productTieIn: row.productTieIn,
    plannedCount: row.targetEpisodeCount ?? rawExistingItems.length,
  });
  const existingItems = tieInBootstrap.items;

  const totalEpisodes = row.targetEpisodeCount;
  const priorMetadata = readActiveDeepDraftMetadata(bible);
  const horizonStart = (priorMetadata?.horizonEndEpisode ?? 0) + 1;
  if (horizonStart > totalEpisodes) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "All planned Sub-episodes already have deep shot drafts",
    });
  }

  const additionalEpisodes =
    params.additionalEpisodes ?? VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES;
  const horizonEnd = Math.min(
    horizonStart + additionalEpisodes - 1,
    totalEpisodes
  );
  const episodeNumbers = new Set(
    Array.from(
      { length: Math.max(0, horizonEnd - horizonStart + 1) },
      (_, i) => horizonStart + i
    )
  );
  const episodesToDraft = existingItems
    .filter(item => episodeNumbers.has(item.episodeNumber))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  if (episodesToDraft.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No planned Sub-episodes are available within the requested horizon",
    });
  }

  // Full prior recap (owner-approved design): every episode already
  // deep-drafted before this run's horizon start.
  const recapItems: DeepDraftRecapEpisode[] = existingItems
    .filter(
      item =>
        item.episodeNumber < horizonStart && readItemShotDrafts(item) !== null
    )
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(item => ({
      episodeNumber: item.episodeNumber,
      workingTitle: item.workingTitle,
      logline: item.logline,
      cliffhangerLine: readItemCliffhangerLine(item),
    }));

  let ledgerPlan: {
    ledgers: VerticalDramaQualityLedgers;
    creditsUsed: number;
  } | null = null;
  let result;
  try {
    ledgerPlan = await planQualityLedgersForBreakdown({
      tenantId,
      userId,
      seriesId,
      title: row.title,
      locale: row.locale,
      genre: row.genre,
      tone: row.tone,
      bible,
      activeBreakdown: existingItems,
      totalEpisodeCount: row.targetEpisodeCount,
      idempotencyKey: params.idempotencyKey,
      onProgress,
    });
    result = await generateStoryBibleDeep({
      userId,
      tenantId,
      seriesId,
      title: row.title,
      locale: normalizeVerticalDramaSeriesLocale(row.locale),
      genre: row.genre,
      tone: row.tone,
      episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
      episodes: episodesToDraft,
      priorRecap: { items: recapItems, openThreads: [] },
      mode,
      // F131X + finale price_paid rule (see runGenerateStoryBibleDeepJob)
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
      formatProfilesEnabled,
      // Task #22 (see runGenerateStoryBibleDeepJob) — dormant unless the
      // bootstrap above activated.
      tieInDraftContext: tieInBootstrap.context,
      // Feature 132 §4.2.7 (F132A) — see `runGenerateStoryBibleDeepJob`'s
      // identical wiring; inherits the premise via the same bible read.
      userPremise:
        typeof bible.userPremise === "string" ? bible.userPremise : undefined,
      // Series-level audience age rating (Phase 1) — see
      // `runGenerateStoryBibleDeepJob`'s identical wiring.
      audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
      onProgress,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    if (error instanceof VdSchemaValidationError) {
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
          : "Deep story draft extension failed",
    });
  }

  const mergedItems = mergeDeepDraftItems(existingItems, result.draftedItems);
  const newHorizonEndEpisode = result.draftedItems.reduce(
    (max, item) => Math.max(max, item.episodeNumber),
    priorMetadata?.horizonEndEpisode ?? 0
  );
  const generatedAt = new Date().toISOString();
  const totalCreditsUsed = result.creditsUsed + (ledgerPlan?.creditsUsed ?? 0);

  const nextBible = appendBreakdownVersion(bible, {
    source: "generate_story",
    items: mergedItems,
    createdByUserId: userId,
    ...(ledgerPlan ? { ledgers: ledgerPlan.ledgers } : {}),
    deepDraft: {
      horizonEndEpisode: newHorizonEndEpisode,
      chunkSizes: result.chunkSizes,
      generatedAt,
      ...(result.premiumMetrics ? { premium: result.premiumMetrics } : {}),
    },
  });

  const [updatedRow] = await db
    .update(verticalDramaSeries)
    .set({ bible: nextBible, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .returning();

  await recordDeepStoryDraftAuditEvent({
    userId,
    seriesId,
    action: "extend",
    chunkSizes: result.chunkSizes,
    horizonEndEpisode: newHorizonEndEpisode,
    partial: result.partial,
    creditsUsed: totalCreditsUsed,
    idempotencyKey: params.idempotencyKey,
    mode,
    missingEpisodes: result.missingEpisodes,
  });

  // Phase F parity fix (deferred note, added 2026-07-09) — `runExtendStoryDraftHorizonJob`
  // has the EXACT same partial/error result shape as `runGenerateStoryBibleDeepJob`
  // (`generateStoryBibleDeep` powers both), so it gets the SAME error audit
  // event + auto system feedback ticket — see that job's identical block for
  // the full rationale. Distinct dedupe title (`ขยายร่างเนื้อเรื่อง` vs
  // `สร้างร่างละเอียดเนื้อเรื่อง`) so the two failure classes never collapse
  // into the SAME feedback ticket via `feedbackProcessor.ts`'s title-prefix
  // dedupe.
  if (result.partial && result.error) {
    const traceId = randomUUID().replace(/-/g, "").slice(0, 32);
    const draftedEpisodeNumbers = new Set(
      result.draftedItems.map(item => item.episodeNumber)
    );
    const requestedEpisodeNumbers = episodesToDraft.map(
      item => item.episodeNumber
    );
    const diffFailedEpisodes = requestedEpisodeNumbers.filter(
      ep => !draftedEpisodeNumbers.has(ep)
    );
    const failedEpisodes =
      diffFailedEpisodes.length > 0
        ? diffFailedEpisodes
        : result.missingEpisodes;

    await recordVerticalDramaSystemFailureAuditEvent({
      eventType: "vertical_drama_deep_generate_error",
      endpoint: "verticalDramaSeries.extendStoryDraftHorizon",
      userId,
      seriesId,
      traceId,
      errorMessage: result.error,
      metadata: {
        failedEpisodes,
        requestedCount: requestedEpisodeNumbers.length,
        draftedCount: result.draftedItems.length,
        stage: "deep_generate_extend_chunk",
        mode,
      },
    });

    await submitVerticalDramaSystemFeedback(
      {
        tenantId,
        userId,
        seriesId,
        category: "vertical_drama_deep_generate",
        title: `[System] ขยายร่างเนื้อเรื่อง ล้มเหลวบางส่วน (series #${seriesId})`,
        description: [
          `ระบบขยายร่างละเอียดเนื้อเรื่อง (extend) ล้มเหลวบางส่วนและสร้าง feedback นี้อัตโนมัติ`,
          `User ID: ${userId}`,
          `Tenant ID: ${tenantId}`,
          `Series ID: ${seriesId}`,
          `ตอนย่อยที่ล้มเหลว: ${failedEpisodes.join(", ")}`,
          `จำนวนที่ขอสร้าง: ${requestedEpisodeNumbers.length}`,
          `จำนวนที่สร้างสำเร็จ: ${result.draftedItems.length}`,
          `Error: ${result.error}`,
        ].join("\n"),
        stepsToReproduce: [
          `1. เปิดหน้า /drama-series/${seriesId}`,
          `2. ตรวจสอบตอนย่อยที่ล้มเหลว: ${failedEpisodes.join(", ")}`,
          "3. ค้น log ด้วย traceId ต่อไปนี้ใน logs/audit/",
          `4. traceId: ${traceId}`,
        ].join("\n"),
        expectedBehavior:
          "การขยายร่างละเอียดเนื้อเรื่องควรสำเร็จหรือรายงานผลลัพธ์บางส่วนได้โดยไม่ทำให้ workflow ล้มเหลวเงียบ",
        actualBehavior: result.error,
        contextJson: {
          source: "vertical_drama_deep_generate",
          eventType: "system_partial_failure",
          seriesId,
          jobKind: "extend",
          failedEpisodes,
          model: result.model,
          errorMessages: [result.error],
          traceId,
        },
      },
      db
    );
  }

  return {
    series: { ...updatedRow, id: String(updatedRow.id) },
    creditsUsed: totalCreditsUsed,
    model: result.model,
    partial: result.partial,
    horizonEndEpisode: newHorizonEndEpisode,
    chunkSizes: result.chunkSizes,
    warnings: result.warnings,
    error: result.partial ? result.error : undefined,
    mode,
    callsMade: result.premiumMetrics?.callsMade ?? result.chunkSizes.length,
    missingEpisodes: result.missingEpisodes,
    // Task #22 — see `runGenerateStoryBibleDeepJob`'s identical field.
    tieInMismatchCount: result.tieInMismatchCount,
  };
}

/**
 * Generic dispatch point for `vertical_drama_story_jobs` BullMQ jobs (#28) —
 * the ONLY symbol `services/verticalDramaStoryJobs.ts`'s worker imports (via
 * a lazy `await import(...)` at EXECUTION time, so the two files never form a
 * static circular import: this router file already statically imports
 * `enqueueVerticalDramaStoryJob`/`getVerticalDramaStoryJobStatus`/
 * `getActiveVerticalDramaStoryJob` from that service file).
 */
export async function runVerticalDramaStoryJobExecutor(
  payload: VerticalDramaStoryJobPayload,
  onProgress: (progress: VerticalDramaStoryJobProgress) => void
): Promise<unknown> {
  const owner: StoryJobExecutorOwner = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    seriesId: payload.seriesId,
  };
  switch (payload.kind) {
    case "deep_generate":
      return runGenerateStoryBibleDeepJob(
        {
          ...owner,
          ...(payload.input as {
            horizonEpisodes?: number;
            mode?: VerticalDramaDeepStoryDraftMode;
            idempotencyKey?: string;
          }),
        },
        onProgress
      );
    case "extend":
      return runExtendStoryDraftHorizonJob(
        {
          ...owner,
          ...(payload.input as {
            additionalEpisodes?: number;
            mode?: VerticalDramaDeepStoryDraftMode;
            idempotencyKey?: string;
          }),
        },
        onProgress
      );
    case "improve_script": {
      // Lazy `await import(...)` — see this file's own import block doc
      // comment on `RunImproveScriptJobResult` for why a static VALUE import
      // of anything from `verticalDramaImproveScript.ts` must be avoided here.
      const { runImproveScriptJob } =
        await import("../services/verticalDramaImproveScript");
      return runImproveScriptJob(
        {
          ...owner,
          ...(payload.input as {
            userRevisionRequest: string;
            idempotencyKey?: string;
          }),
        },
        onProgress
      );
    }
    default: {
      const exhaustive: never = payload.kind;
      throw new Error(`Unknown vertical drama story job kind: ${exhaustive}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits — helpers (W10.5, added 2026-07-08)                  */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the ACTIVE breakdown version + item + shot draft
 * `updateEpisodeDraftDialogue` needs, or throws NOT_FOUND with ONE generic
 * Thai message covering every "no draft" case (no breakdown version adopted
 * yet, `episodeNumber` not present in the active version, the item has no
 * `shotDrafts` at all, or `shotNumber` isn't one of them) — mirrors
 * `loadOwnedSeries`'s own "one message, never discloses which specific
 * thing is missing" convention.
 */
function loadManualDialogueEditTarget(
  bible: Record<string, unknown>,
  episodeNumber: number,
  shotNumber: number
): {
  activeIndex: number;
  versions: StoredBreakdownVersion[];
  item: StoredEpisodeBreakdownItem;
} {
  const versions = readBreakdownVersions(bible);
  const activeIndex = resolveActiveBreakdownVersionIndex(bible);
  const item =
    activeIndex >= 0
      ? versions[activeIndex].items.find(
          candidate => candidate.episodeNumber === episodeNumber
        )
      : undefined;
  const shotDrafts = item ? readItemShotDrafts(item) : null;
  const shotExists =
    shotDrafts?.some(shot => shot.shot_number === shotNumber) ?? false;

  if (activeIndex < 0 || !item || !shotDrafts || !shotExists) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "ไม่มีร่างสำหรับตอน/ช็อตนี้",
    });
  }

  return { activeIndex, versions, item };
}

/**
 * Best-effort audit record for `updateEpisodeDraftDialogue` (W10.5, added
 * 2026-07-08) — mirrors `recordDeepStoryDraftAuditEvent`'s exact
 * "cross-cutting `api_audit_events` insert, never throws" convention (same
 * rationale: a new per-series Memory-timeline kind is out of scope here).
 * Only called on a FRESH (non-replay) edit — an idempotent replay is a
 * complete no-op and is never separately audited.
 */
async function recordManualDialogueEditAuditEvent(params: {
  userId: number;
  seriesId: number;
  episodeNumber: number;
  shotNumber: number;
  idempotencyKey?: string;
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: "vertical_drama_manual_dialogue_edit",
      userId: params.userId,
      endpoint: "verticalDramaSeries.updateEpisodeDraftDialogue",
      statusCode: 200,
      skillSlug: "vertical-drama-deep-story-draft",
      creditsCharged: 0,
      metadata: {
        seriesId: params.seriesId,
        episodeNumber: params.episodeNumber,
        shotNumber: params.shotNumber,
        idempotencyKey: params.idempotencyKey ?? null,
      },
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.updateEpisodeDraftDialogue",
      "Failed to record manual dialogue edit audit event",
      error
    );
  }
}

/**
 * Error-shaped audit signal for a PARTIAL (not job-terminal) system failure
 * inside a `deep_generate`/`extend` story job (Phase F, added 2026-07-09) —
 * e.g. `generateStoryBibleDeep` stopping early with `partial: true`. These
 * are currently invisible to the guardian `error_spike` sensor: every
 * `record*AuditEvent` helper above only inserts into `api_audit_events` with
 * a non-"error" `eventType` and `statusCode: 200` — the sensor
 * (`services/virtualAdmin/sensors/errorSpike.ts`) never reads that DB table
 * at all, only `logs/audit/audit-YYYY-MM-DD.jsonl` lines whose `eventType`
 * contains "error". This helper writes BOTH: an `api_audit_events` row
 * (`statusCode: 500`, `errorMessage` populated) so `audit.search`'s DB-backed
 * `errorOnly` filter and any other apiAuditEvents-based tooling picks it up,
 * AND an `auditLogger.log()` JSONL line with an `"..._error"`-suffixed
 * `eventType` so the error_spike sensor's file-based scan actually counts it.
 * Additive — the existing 200/non-error audit event for the overall
 * operation is untouched and still recorded separately. NEVER throws
 * (best-effort, same convention as every other `record*AuditEvent` helper).
 */
async function recordVerticalDramaSystemFailureAuditEvent(params: {
  eventType: "vertical_drama_deep_generate_error";
  endpoint: string;
  userId: number;
  seriesId: number;
  errorMessage: string;
  traceId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const metadata = { seriesId: params.seriesId, ...params.metadata };
  try {
    await db.insert(apiAuditEvents).values({
      traceId: params.traceId,
      eventType: params.eventType,
      userId: params.userId,
      endpoint: params.endpoint,
      statusCode: 500,
      errorMessage: params.errorMessage,
      metadata,
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.systemFailureAudit",
      "Failed to record api_audit_events row for a vertical drama partial system failure",
      error
    );
  }
  try {
    auditLogger.log({
      traceId: params.traceId,
      eventType: params.eventType,
      userId: params.userId,
      endpoint: params.endpoint,
      statusCode: 500,
      errorMessage: params.errorMessage,
      metadata,
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.systemFailureAudit",
      "Failed to write JSONL audit log entry for a vertical drama partial system failure",
      error
    );
  }
}

/**
 * Best-effort parse of the wizard's freeform "characters" textarea (one line
 * per character) back into `{ name, role, description }[]` for "Save as
 * preset". `CreateSeriesWizard.tsx`'s `applyPreset` writes this exact
 * `name — role: description` shape when a preset is applied, so
 * preset -> series -> re-saved-as-preset round-trips losslessly; any line
 * that doesn't match becomes `{ name: line, role: "", description: "" }`.
 */
function parseCharactersDraft(
  draft: string
): Array<{ name: string; role: string; description: string }> {
  return draft
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.+?)\s+—\s+(.+?):\s*(.*)$/);
      if (match) {
        return {
          name: match[1].trim(),
          role: match[2].trim(),
          description: match[3].trim(),
        };
      }
      return { name: line, role: "", description: "" };
    });
}

function toGenrePresetDto(row: VerticalDramaGenrePresetRow): GenrePresetDto {
  return {
    id: String(row.id),
    title: row.title,
    category: row.category,
    scope: row.scope,
    logline: row.logline,
    mainPlot: row.mainPlot,
    seasonArc: row.seasonArc,
    tone: row.tone,
    cliffhangerStyle: row.cliffhangerStyle,
    characters: row.charactersJson as Array<{
      name: string;
      role: string;
      description: string;
    }>,
    visualBible: row.visualBible,
    visualIdentityJson: row.visualIdentityJson ?? undefined,
  };
}

/**
 * Slugify a character name into a `characterKey` candidate (lowercase,
 * non-alphanumeric collapsed to `-`, trimmed). Falls back to `"character"`
 * for names that are entirely non-alphanumeric (e.g. emoji-only input) so we
 * never produce an empty `characterKey`.
 */
function slugifyCharacterName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "character";
}

/**
 * Seed the durable `vertical_drama_characters` roster from the wizard's
 * freeform `bible.charactersDraft` text (already parsed by
 * `parseCharactersDraft`). Best-effort only: the series shell must never fail
 * to be created because of a character-seeding problem, so callers must wrap
 * this in a try/catch (see `create` below) — this function itself does not
 * swallow errors so callers can log them.
 *
 * `characterKey` is derived from the character name and de-duplicated within
 * this batch (`-2`, `-3`, ...) to satisfy the `(seriesId, characterKey)`
 * unique constraint; blank/whitespace-only names are skipped.
 */
/**
 * Feature 132 §5 (F132B, ledgers-and-story-state / Section 05 speech
 * profiles) — normalized name key used to match a preset-synthesized
 * character profile against a parsed `charactersDraft` row. Trims + lowers
 * so casing/whitespace differences between the free-text draft and a
 * structured preset profile don't prevent a match.
 */
function normalizeCharacterNameForMatch(name: string): string {
  return name.trim().toLowerCase();
}

// Exported (in addition to internal use in `create` below) so tests can
// unit-test the normalized-name character-profile merge directly, mirroring
// `stampPresetVisualIdentityIntoBible`'s existing export-for-testability
// precedent.
export async function seedCharactersFromDraft(
  tenantId: string,
  userId: number,
  seriesId: number,
  charactersDraft: string,
  /**
   * Feature 132 §5 (F132B / Section 05 speech profiles) — optional,
   * structured character profiles (from preset synthesis) matched by
   * normalized name against the parsed draft rows. When a match carries
   * `speechProfile`/`personality`, those are merged into the seeded row's
   * `data` column alongside the existing `description`; falls back to
   * today's text-only path when absent (grandfather — every existing
   * caller omits this param, so seeding behavior is unchanged).
   */
  presetCharacterProfiles?: Array<{
    name: string;
    speechProfile?: unknown;
    personality?: unknown;
  }>
): Promise<void> {
  const parsed = parseCharactersDraft(charactersDraft).filter(
    c => c.name.trim().length > 0
  );
  if (parsed.length === 0) return;

  const profileByNormalizedName = new Map(
    (presetCharacterProfiles ?? []).map(profile => [
      normalizeCharacterNameForMatch(profile.name),
      profile,
    ])
  );

  const usedKeys = new Set<string>();
  const rows = parsed.map(character => {
    const base = slugifyCharacterName(character.name);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    const matchedProfile = profileByNormalizedName.get(
      normalizeCharacterNameForMatch(character.name)
    );
    const data: Record<string, unknown> = {};
    if (character.description) data.description = character.description;
    if (matchedProfile?.speechProfile !== undefined) {
      data.speechProfile = matchedProfile.speechProfile;
    }
    if (matchedProfile?.personality !== undefined) {
      data.personality = matchedProfile.personality;
    }

    return {
      tenantId,
      userId,
      seriesId,
      characterKey: key,
      name: character.name,
      role: character.role || null,
      data: Object.keys(data).length > 0 ? data : null,
    } as typeof verticalDramaCharacters.$inferInsert;
  });

  await db.insert(verticalDramaCharacters).values(rows);
}

/* -------------------------------------------------------------------------- */
/* Location Visual Bible whole-series seeding                                 */
/*                                                                            */
/* Location-side companion to `parseCharactersDraft`/`seedCharactersFromDraft`*/
/* above — same wizard-textarea-seeding shape, minus the `role` field (a      */
/* location has no role concept) and minus the preset-profile merge (no      */
/* location-side equivalent of a preset's structured speech/personality      */
/* profile exists).                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort parse of the wizard's freeform "locations" textarea (one line
 * per location) back into `{ name, description }[]` — same `Name — Description`
 * em-dash convention as `parseCharactersDraft`, minus the `role:` segment (a
 * location has no role field). Any line that doesn't match the shape becomes
 * `{ name: line, description: "" }`, same tolerant, never-throws fallback as
 * `parseCharactersDraft`.
 */
function parseLocationsDraft(
  draft: string
): Array<{ name: string; description: string }> {
  return draft
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.+?)\s+—\s+(.*)$/);
      if (match) {
        return { name: match[1].trim(), description: match[2].trim() };
      }
      return { name: line, description: "" };
    });
}

/**
 * Slugify a location name into a `locationKey` candidate — byte-identical
 * convention to `slugifyCharacterName` above (and
 * `verticalDramaLocationReconciliation.ts`'s own `slugifyForLocationKey`,
 * which this mirrors): lowercase, non-alphanumeric collapsed to `-`, trimmed.
 * Falls back to `"location"` for a name that's entirely non-alphanumeric
 * (e.g. Thai-only text, which this app's location names usually are) so a
 * seeded row never gets an empty `locationKey`.
 */
function slugifyLocationName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "location";
}

/** Matches `verticalDramaLocations.locationKey`'s `varchar(64)` column limit. */
const VD_LOCATION_KEY_MAX_LENGTH = 64;
/**
 * Base slug is truncated to this length before a dedup suffix (`-2`, `-3`,
 * ...) is appended, so even a long name plus a suffix can never overflow the
 * `varchar(64)` column.
 */
const VD_LOCATION_KEY_BASE_TRUNCATE_LENGTH = 60;

/**
 * Seed the durable `vertical_drama_locations` roster from the wizard's
 * freeform `bible.locationsDraft` text (already parsed by
 * `parseLocationsDraft`) — location-side companion to `seedCharactersFromDraft`
 * above, mirroring its exact contract: best-effort only (the series shell
 * must never fail to be created because of a location-seeding problem, so
 * callers must wrap this in a try/catch — see `create` below); this function
 * itself does not swallow errors so callers can log them. Silently no-ops
 * (never inserts, never throws) when `locationsDraft` is empty or parses to
 * nothing usable — same contract as `seedCharactersFromDraft`.
 *
 * `locationKey` is derived from the location name and de-duplicated within
 * this batch (`-2`, `-3`, ...) to satisfy the `(seriesId, locationKey)`
 * unique constraint (`vds_location_key_unique`) — same dedup-suffix loop as
 * `seedCharactersFromDraft`'s own `characterKey` derivation, plus a
 * length-safety truncation of the base slug first (see
 * `VD_LOCATION_KEY_BASE_TRUNCATE_LENGTH`'s doc comment) that
 * `seedCharactersFromDraft` doesn't need (its `characterKey` column has no
 * comparable length pressure in practice). Blank/whitespace-only names are
 * skipped before dedup/insert.
 */
export async function seedLocationsFromDraft(
  tenantId: string,
  userId: number,
  seriesId: number,
  locationsDraft: string
): Promise<void> {
  const parsed = parseLocationsDraft(locationsDraft).filter(
    l => l.name.trim().length > 0
  );
  if (parsed.length === 0) return;

  const usedKeys = new Set<string>();
  const rows = parsed.map(location => {
    const base = slugifyLocationName(location.name).slice(
      0,
      VD_LOCATION_KEY_BASE_TRUNCATE_LENGTH
    );
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    return {
      tenantId,
      userId,
      seriesId,
      locationKey: key.slice(0, VD_LOCATION_KEY_MAX_LENGTH),
      name: location.name,
      data: location.description ? { description: location.description } : null,
    } as typeof verticalDramaLocations.$inferInsert;
  });

  await db.insert(verticalDramaLocations).values(rows);
}

/**
 * Stamps a preset's structured visual identity into series bible fields
 * (spec §8.2.2.A flow-through rule, section-15 change C) — additive only:
 * `visualStyle`/`cameraGrammar` are ENRICHED (appended to any existing
 * wizard-authored text, or set directly when absent) rather than
 * overwritten, and the full identity object is stored verbatim under
 * `bible.presetVisualIdentity` for downstream consumption (character
 * reference prompts — see `verticalDramaCharacterImageGeneration.ts`;
 * start-frame/motion-prompt flow-through is Wave-4, deferred). Never
 * mutates the input `bible`.
 */
export function stampPresetVisualIdentityIntoBible(
  bible: Record<string, unknown> | null | undefined,
  identity: VerticalDramaPresetVisualIdentity
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(bible ?? {}) };

  const existingVisualStyle =
    typeof base.visualStyle === "string" ? base.visualStyle.trim() : "";
  const presetStyleSummary = `${identity.styleName} — palette: ${identity.palette.join(", ")}; lighting: ${identity.lighting}`;
  base.visualStyle = existingVisualStyle
    ? `${existingVisualStyle} ${presetStyleSummary}`
    : presetStyleSummary;

  const existingCameraGrammar =
    typeof base.cameraGrammar === "string" ? base.cameraGrammar.trim() : "";
  base.cameraGrammar = existingCameraGrammar
    ? `${existingCameraGrammar} ${identity.cameraGrammar}`
    : identity.cameraGrammar;

  base.presetVisualIdentity = identity;
  return base;
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const SERIES_STATUSES = [
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

/**
 * Exported (in addition to being used inline below) so tests can assert this
 * schema's length limits stay in lockstep with `CREATE_SERIES_FIELD_LIMITS`
 * (the shared source of truth also used by preset synthesis clamping and the
 * Create Series wizard) — see createSeriesFieldLimits.agreement.test.ts.
 */
export const createSeriesInput = z.object({
  title: z.string().trim().min(1).max(CREATE_SERIES_FIELD_LIMITS.title),
  locale: z.enum(VERTICAL_DRAMA_SERIES_LOCALES).optional(),
  aspectRatio: z.literal("9:16").optional(),
  /** Legacy API name; this is the planned Sub-episode count for story structure. */
  targetEpisodeCount: z.number().int().positive().max(1000).optional(),
  defaultEpisodeDurationSeconds: z
    .number()
    .int()
    .positive()
    .max(3600)
    .optional(),
  genre: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.genre).optional(),
  tone: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.tone).optional(),
  targetAudience: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.targetAudience)
    .optional(),
  agePolicyId: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.agePolicyId)
    .optional(),
  // Wizard shell payloads — stored losslessly, validated by their own contracts.
  bible: z.record(z.string(), z.unknown()).optional(),
  memory: z.record(z.string(), z.unknown()).optional(),
  productTieIn: z.record(z.string(), z.unknown()).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  /**
   * Additive (spec §8.2.2, section-15 change C) — the genre preset id the
   * wizard applied to produce this series' wizard-gathered `bible` fields.
   * Optional; when present AND `verticalDramaSeriesPresetMixV2` is enabled
   * AND the referenced preset carries `visualIdentityJson`, `create` stamps
   * the identity into `bible.visualStyle`/`bible.cameraGrammar` (additive
   * enrichment) plus `bible.presetVisualIdentity` (full object, for
   * downstream flow-through — character refs, start frames, motion
   * prompts). Best-effort: an invalid/inaccessible id never fails series
   * creation (same convention as `charactersDraft` seeding below).
   */
  appliedPresetId: z.string().trim().min(1).max(20).optional(),
  /**
   * Feature 132 §4.2 (F132A, user-premise-preset-mix) — free-form
   * "โจทย์เรื่องที่อยากได้" premise, a TOP-LEVEL sibling of `bible` (not
   * nested inside it) so the field-limits agreement test covers it
   * automatically. `create` merges it into `bible.userPremise` below.
   */
  userPremise: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.userPremise)
    .optional(),
  /**
   * Series-level audience age rating (Phase 1) — see
   * `@shared/verticalDramaSeries/audienceAgeRating`'s header doc comment.
   * Optional; `create` below always resolves a concrete tier via
   * `resolveAudienceAgeRating` (defaulting to the least-restrictive
   * `"18plus"`), so omitting it is a valid, fully-supported input.
   */
  audienceAgeRating: z.enum(AUDIENCE_AGE_RATINGS).optional(),
});

const listSeriesInput = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z.enum(SERIES_STATUSES).optional(),
    /** When false (default) archived series are excluded from the list. */
    includeArchived: z.boolean().optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

const synthesizeGenrePresetInput = z.object({
  locale: z.enum(["th", "en"]).optional(),
  selectedPresetIds: z.array(z.string().min(1)).max(5).optional(),
  selectedCategories: z
    .array(z.string().trim().min(1).max(80))
    .max(5)
    .optional(),
  primarySelectionId: z.string().trim().max(100).optional(),
  businessContext: z.string().trim().max(600).optional(),
  productContext: z.string().trim().max(600).optional(),
  /** Legacy API name; this is the planned Sub-episode count for story structure. */
  targetEpisodeCount: z.number().int().positive().max(1000).optional(),
  toneHint: z.string().trim().max(180).optional(),
  /**
   * Preset Mix v2 (spec §8.2.2.C.1, section-15) — optional alongside legacy
   * `selectedPresetIds`; equal default weights apply when omitted (see
   * `resolveMixSelections`). Only consulted when the caller's tenant has
   * `verticalDramaSeriesPresetMixV2` enabled — flag-off byte-identical v1
   * behavior never reads this field.
   */
  selections: z.array(verticalDramaPresetMixSelectionSchema).max(5).optional(),
  /**
   * Feature 132 §4.2/§4.3 (F132A) — same contract as `createSeriesInput.userPremise`.
   * Sent unconditionally by the client (server decides whether to honor it,
   * same convention as `selections` for Preset Mix v2) — forwarded to
   * `synthesizeVerticalDramaPreset[V2]` ONLY when the tenant's
   * `verticalDramaUserPremise` flag is on; forced to `undefined` otherwise.
   */
  userPremise: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.userPremise)
    .optional(),
  /** Phase 1 — same contract as `createSeriesInput.audienceAgeRating`; accepted here for forward compatibility, not yet forwarded into preset synthesis (see Phase 1 task notes). */
  audienceAgeRating: z.enum(AUDIENCE_AGE_RATINGS).optional(),
});

/**
 * Edit an owned series' metadata. Every field is optional so callers can patch
 * just what changed; ownership is re-checked so a cross-tenant/user id can never
 * be mutated (surfaced as NOT_FOUND, never FORBIDDEN). Like `create`, this is a
 * metadata-only write and MUST NOT trigger any paid generation.
 */
const updateSeriesInput = z.object({
  seriesId: z.string().min(1),
  title: z.string().trim().min(1).max(255).optional(),
  status: z.enum(SERIES_STATUSES).optional(),
  // Wizard shell payloads — stored losslessly, validated by their own contracts.
  bible: z.record(z.string(), z.unknown()).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  productTieIn: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One caller-authored dialogue line for `updateEpisodeDraftDialogue`
 * (W10.5). `speaker` is OPTIONAL (unlike the stored `shotDialogueLineSchema`
 * in `verticalDramaStoryBible.ts` — the client does not always collect
 * one); `applyManualDialogueEdit` fills a non-empty placeholder for storage
 * when omitted, see that function's doc comment. `line` trims to a
 * non-empty string (`.min(1)` after `.trim()` rejects an empty-after-trim
 * submission with BAD_REQUEST automatically, via tRPC's normal input-parse
 * failure mapping).
 *
 * Limits are LITERAL numbers, not imports of the service's
 * `VD_MANUAL_DIALOGUE_EDIT_SPEAKER_MAX_LENGTH`/`..._LINE_MAX_LENGTH`/
 * `..._DELIVERY_MAX_LENGTH` constants — see the doc comment on this file's
 * second `verticalDramaStoryBible` import block above for why.
 */
const updateEpisodeDraftDialogueLineInput = z.object({
  speaker: z.string().trim().max(60).optional(),
  line: z.string().trim().min(1).max(300),
  delivery: z.string().trim().max(120).optional(),
});

/**
 * Exported (in addition to being used inline below) so tests can assert
 * this schema's limits directly via `.safeParse()` — same convention as
 * `createSeriesInput` above (see `verticalDramaSeries.createSeriesFieldLimits.agreement.test.ts`).
 *
 * `shotNumber`'s `max(9)` and `lines`' `max(8)` are LITERAL numbers for the
 * same cross-module-mock reason as `updateEpisodeDraftDialogueLineInput`
 * above (9 mirrors the service's `VD_DEEP_DRAFT_SHOTS_PER_EPISODE`; 8 is
 * the service's `VD_MANUAL_DIALOGUE_EDIT_MAX_LINES`).
 */
export const updateEpisodeDraftDialogueInput = z.object({
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  shotNumber: z.number().int().min(1).max(9),
  lines: z.array(updateEpisodeDraftDialogueLineInput).max(8),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

/**
 * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — `startImproveScript`
 * mutation input. `userRevisionRequest` is the user's free-text "what to
 * improve" box (the client seeds a sensible Thai default the user can edit).
 */
export const startImproveScriptInput = z.object({
  seriesId: z.string().min(1),
  userRevisionRequest: z.string().min(1).max(4000),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

/** `confirmImproveScript`/`discardImproveScript` share the same shape — just the job to act on. */
export const improveScriptJobRefInput = z.object({
  seriesId: z.string().min(1),
  jobId: z.string().min(1),
});

/* -------------------------------------------------------------------------- */
/* Ad Banner Overlay (F131W, #30-A) — shared input schema + helpers           */
/* -------------------------------------------------------------------------- */

/** All 3 new ad banner procedures only ever need to locate one banner design inside a series' `productTieIn.adBanners[]`. */
export const adBannerScopeInput = z.object({
  seriesId: z.string().min(1),
  bannerId: z.string().min(1),
});

/**
 * Short-lived server-to-server bearer token for the Python media-generation
 * backend — mirrors `verticalDramaCharacters.ts`'s `getCharacterPortraitUserToken`/
 * `createCharacterPortraitMediaToken` convention exactly: prefer the
 * caller's own session token (so usage attributes correctly), fall back to
 * minting a scoped token. Reuses this file's own top-level `randomUUID`
 * import rather than a second `crypto` import style. `signBearerToken` is
 * loaded via a lazy `await import("../_core/tokens")` — see this file's Ad
 * Banner Overlay import-block doc comment above for why (`_core/tokens`
 * asserts `JWT_SECRET` at import time, which would break every sibling
 * test's narrow module graph if this were a static top-level import).
 */
async function getAdBannerMediaUserToken(ctx: {
  userToken: string | null;
  user: { id: number };
}): Promise<string> {
  if (ctx.userToken) return ctx.userToken;
  const { signBearerToken } = await import("../_core/tokens");
  return signBearerToken(
    {
      sub: String(ctx.user.id),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_ad_banner_${Date.now()}_${randomUUID()}`,
    },
    "15m"
  );
}

interface LoadedAdBannerContext {
  rawProductTieIn: Record<string, unknown> | null;
  banners: VdAdBannerDesign[];
  bannerIndex: number;
  banner: VdAdBannerDesign;
}

/** Load an owned series, parse its `productTieIn.adBanners[]`, and locate one banner by id — NOT_FOUND (never FORBIDDEN) for a missing banner, matching `loadOwnedSeries`'s own "never disclose existence" convention. */
async function loadOwnedAdBanner(
  tenantId: string,
  userId: number,
  seriesId: number,
  bannerId: string
): Promise<LoadedAdBannerContext> {
  const series = await loadOwnedSeries(tenantId, userId, seriesId);
  const rawProductTieIn =
    (series.productTieIn as Record<string, unknown> | null) ?? null;
  const banners = parseAdBannerDesigns(rawProductTieIn?.adBanners);
  const bannerIndex = banners.findIndex(b => b.id === bannerId);
  if (bannerIndex === -1) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Ad banner design not found",
    });
  }
  return {
    rawProductTieIn,
    banners,
    bannerIndex,
    banner: banners[bannerIndex],
  };
}

/**
 * Defense-in-depth: never let a paid generation mutation proceed when the
 * series' CURRENT stored banner list already violates a structural limit
 * (≤5, duplicate ids, invalid window timing) — the client is expected to
 * enforce this too (disabled "add" button at 5, etc.), but the server must
 * never trust the client alone. Reuses the SAME `validateAdBannerDesigns`
 * the client/CRUD merge-patch path is built around, so there is exactly one
 * source of truth for what counts as a structural violation.
 */
function ensureAdBannerDesignsWithinLimits(banners: VdAdBannerDesign[]): void {
  const blockingIssue = validateAdBannerDesigns(banners).find(
    issue => issue.severity === "error"
  );
  if (blockingIssue) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${blockingIssue.code}: ${blockingIssue.message}`,
    });
  }
}

/** Persist an updated banner design list back onto the series' `productTieIn` jsonb — read-modify-write preserving every OTHER `productTieIn` key, mirroring `setSeriesTargetAudienceRegion`'s `bible` read-modify-write convention exactly. */
async function persistAdBannerDesigns(
  tenantId: string,
  userId: number,
  seriesId: number,
  rawProductTieIn: Record<string, unknown> | null,
  nextBanners: VdAdBannerDesign[]
): Promise<void> {
  const nextProductTieIn = {
    ...(rawProductTieIn ?? {}),
    adBanners: nextBanners,
  };
  await db
    .update(verticalDramaSeries)
    .set({ productTieIn: nextProductTieIn, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId));
}

/**
 * Compact, client-safe summary of an episode's assembled full-episode video
 * (Episode List UI player) — used by `get`'s DTO map below. Reads the
 * untyped `assemblyManifest` jsonb column defensively (same
 * "narrow-an-`unknown`-jsonb-read" posture as every `row.bible as
 * Record<string, unknown> | null` read elsewhere in this file) and returns
 * ONLY a compact summary — never the raw manifest itself, which also carries
 * per-clip render plans, subtitle plans, pending job ids, etc. that the
 * client has no business seeing.
 *
 * Returns `null` unless `assemblyManifest.compiledVideo` (shape
 * `CompiledVideoState`, `../services/verticalDramaEpisodeVideoAssembly`) has
 * BOTH `status === "completed"` AND a non-empty `videoUrl` — a
 * `pending`/`failed` compiled video (or a manifest that never had one) has
 * nothing playable to offer the episode list yet.
 *
 * Exported for direct unit testing — same "export the pure function so
 * tests can call it directly" precedent as `stampPresetVisualIdentityIntoBible`
 * above.
 */
export function extractEpisodeCompiledVideoSummary(
  assemblyManifest: unknown
): { videoUrl: string; status: "completed"; durationSeconds?: number } | null {
  if (!assemblyManifest || typeof assemblyManifest !== "object") return null;

  const compiledVideo = (assemblyManifest as Record<string, unknown>)
    .compiledVideo as CompiledVideoState | null | undefined;
  if (!compiledVideo || typeof compiledVideo !== "object") return null;

  const status = compiledVideo.status;
  if (status !== "completed") return null;

  const videoUrl = compiledVideo.videoUrl;
  if (typeof videoUrl !== "string" || videoUrl.trim().length === 0) return null;

  const summary: {
    videoUrl: string;
    status: "completed";
    durationSeconds?: number;
  } = {
    videoUrl,
    status: "completed",
  };
  const durationSeconds = compiledVideo.durationSeconds;
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    summary.durationSeconds = durationSeconds;
  }
  return summary;
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export const verticalDramaSeriesRouter = router({
  /**
   * List series owned by the caller (tenant + user scoped), newest first, with
   * the light per-series aggregates the Series List surface renders: next
   * episode number, episode count, pending-approval count, product tie-in flag.
   */
  list: verticalDramaProcedure
    .input(listSeriesInput)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const opts = input ?? {};

      const conditions = [
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId),
      ];
      if (opts.status) {
        conditions.push(eq(verticalDramaSeries.status, opts.status));
      } else if (!opts.includeArchived) {
        conditions.push(sql`${verticalDramaSeries.status} <> 'archived'`);
      }
      if (opts.search) {
        conditions.push(
          sql`${verticalDramaSeries.title} ILIKE ${"%" + opts.search + "%"}`
        );
      }

      const rows: VerticalDramaSeriesRow[] = await db
        .select()
        .from(verticalDramaSeries)
        .where(and(...conditions))
        .orderBy(desc(verticalDramaSeries.updatedAt))
        .limit(opts.limit ?? 100);

      const seriesIds = rows.map(r => r.id);

      // Per-series episode aggregates (max episode number + count) in one query.
      const episodeAgg: EpisodeAggRow[] =
        seriesIds.length > 0
          ? await db
              .select({
                seriesId: verticalDramaEpisodes.seriesId,
                maxEpisodeNumber: sql<number>`COALESCE(MAX(${verticalDramaEpisodes.episodeNumber}), 0)`,
                episodeCount: sql<number>`COUNT(*)`,
              })
              .from(verticalDramaEpisodes)
              .where(
                and(
                  eq(verticalDramaEpisodes.tenantId, tenantId),
                  eq(verticalDramaEpisodes.userId, userId),
                  inArray(verticalDramaEpisodes.seriesId, seriesIds)
                )
              )
              .groupBy(verticalDramaEpisodes.seriesId)
          : [];

      // Pending-approval counts (missing-approval badges) per series.
      const approvalAgg: ApprovalAggRow[] =
        seriesIds.length > 0
          ? await db
              .select({
                seriesId: verticalDramaApprovalCheckpoints.seriesId,
                pendingCount: sql<number>`COUNT(*)`,
              })
              .from(verticalDramaApprovalCheckpoints)
              .where(
                and(
                  eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
                  eq(verticalDramaApprovalCheckpoints.userId, userId),
                  inArray(verticalDramaApprovalCheckpoints.seriesId, seriesIds),
                  eq(verticalDramaApprovalCheckpoints.state, "pending")
                )
              )
              .groupBy(verticalDramaApprovalCheckpoints.seriesId)
          : [];

      const maxBySeries = new Map(episodeAgg.map(a => [a.seriesId, a]));
      const pendingBySeries = new Map(
        approvalAgg.map(a => [a.seriesId, Number(a.pendingCount)])
      );

      // Derived thumbnails (no schema change) — episode 1's approved shot image
      // per series, resolved from `startFramePlan.frames[i].approvedMediaAssetId`.
      const thumbnailBySeries = await resolveSeriesThumbnailUrls(db, {
        tenantId,
        userId,
        seriesIds,
      });

      return {
        series: rows.map(row => {
          const agg = maxBySeries.get(row.id);
          const productTieIn = row.productTieIn as { enabled?: boolean } | null;
          return {
            id: String(row.id),
            title: row.title,
            status: row.status,
            locale: row.locale,
            aspectRatio: row.aspectRatio,
            genre: row.genre,
            tone: row.tone,
            targetEpisodeCount: row.targetEpisodeCount,
            episodeCount: Number(agg?.episodeCount ?? 0),
            nextEpisodeNumber: Number(agg?.maxEpisodeNumber ?? 0) + 1,
            pendingApprovalCount: pendingBySeries.get(row.id) ?? 0,
            productTieInEnabled: productTieIn?.enabled === true,
            thumbnailUrl: thumbnailBySeries.get(row.id) ?? null,
            // Deep story drafts (W10-A) — additive, `null` when the series has
            // no deep-drafted episodes yet.
            deepDraftSummary: computeDeepDraftSummary(
              row.bible as Record<string, unknown> | null,
              row.targetEpisodeCount
            ),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        }),
      };
    }),

  /**
   * Create a series SHELL in dry-run mode. This persists metadata only and
   * MUST NOT trigger any paid generation. Ownership is stamped from the
   * authenticated context (never client-supplied).
   */
  create: verticalDramaProcedure
    .input(createSeriesInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;

      const [row] = await db
        .insert(verticalDramaSeries)
        .values({
          tenantId,
          userId,
          title: input.title,
          locale: input.locale ?? "th",
          aspectRatio: input.aspectRatio ?? "9:16",
          status: "draft",
          targetEpisodeCount: input.targetEpisodeCount ?? 10,
          defaultEpisodeDurationSeconds:
            input.defaultEpisodeDurationSeconds ?? 60,
          genre: input.genre ?? null,
          tone: input.tone ?? null,
          targetAudience: input.targetAudience ?? null,
          agePolicyId: input.agePolicyId ?? null,
          // Feature 132 §4.2 (F132A) — merge the top-level `userPremise` field
          // into `bible.userPremise` when present, preserving every other
          // `input.bible` key untouched.
          //
          // Series-level audience age rating (Phase 1) — unlike `userPremise`,
          // `audienceAgeRating` is ALWAYS merged in (it has a safe default via
          // `resolveAudienceAgeRating`, same "always defaulted" precedent as
          // `locale: input.locale ?? "th"` above), so `bible` is no longer
          // ever persisted as `null` — the "no premise, no bible" branch now
          // persists an object carrying just `audienceAgeRating`.
          bible: {
            ...(input.userPremise
              ? { ...(input.bible ?? {}), userPremise: input.userPremise }
              : (input.bible ?? {})),
            audienceAgeRating: resolveAudienceAgeRating(
              input.audienceAgeRating
            ),
          },
          memory: input.memory ?? null,
          productTieIn: input.productTieIn ?? null,
          policy: input.policy ?? null,
        })
        .returning();

      // Best-effort: seed the durable character roster (`vertical_drama_characters`,
      // read by the Series Detail Characters tab) from the wizard's freeform
      // `bible.charactersDraft` text. Never allowed to fail series creation.
      const charactersDraft = input.bible?.charactersDraft;
      if (
        typeof charactersDraft === "string" &&
        charactersDraft.trim().length > 0
      ) {
        try {
          await seedCharactersFromDraft(
            tenantId,
            userId,
            Number(row.id),
            charactersDraft
          );
        } catch (error) {
          debugError(
            "verticalDramaSeries.create",
            `Failed to seed characters for series ${row.id} from charactersDraft`,
            error
          );
        }
      }

      // Best-effort: seed the durable location roster (`vertical_drama_locations`,
      // read by the Location Visual Bible tab) from the wizard's freeform
      // `bible.locationsDraft` text — location-side companion to the
      // `charactersDraft` seeding above. Never allowed to fail series creation.
      const locationsDraft = input.bible?.locationsDraft;
      if (
        typeof locationsDraft === "string" &&
        locationsDraft.trim().length > 0
      ) {
        try {
          await seedLocationsFromDraft(
            tenantId,
            userId,
            Number(row.id),
            locationsDraft
          );
        } catch (error) {
          debugError(
            "verticalDramaSeries.create",
            `Failed to seed locations for series ${row.id} from locationsDraft`,
            error
          );
        }
      }

      // Best-effort: stamp a genre preset's structured visual identity into
      // the series bible (spec §8.2.2 flow-through rule, section-15 change C)
      // — additive only, never fails series creation. Only applies when the
      // caller's tenant has `verticalDramaSeriesPresetMixV2` enabled AND the
      // referenced preset (visibility-scoped exactly like `listGenrePresets` —
      // global, or the caller's OWN private preset) actually carries a
      // `visualIdentityJson`.
      let finalRow = row;
      if (input.appliedPresetId) {
        try {
          const flags = await getTenantFeatureFlags(tenantId);
          if (flags.verticalDramaSeriesPresetMixV2 === true) {
            const appliedPresetNumericId = Number(input.appliedPresetId);
            if (Number.isFinite(appliedPresetNumericId)) {
              const [presetRow] = await db
                .select()
                .from(verticalDramaGenrePresets)
                .where(
                  and(
                    eq(verticalDramaGenrePresets.id, appliedPresetNumericId),
                    or(
                      eq(verticalDramaGenrePresets.scope, "global"),
                      and(
                        eq(verticalDramaGenrePresets.scope, "private"),
                        eq(verticalDramaGenrePresets.tenantId, tenantId),
                        eq(verticalDramaGenrePresets.userId, userId)
                      )
                    )
                  )
                )
                .limit(1);
              const identity =
                presetRow?.visualIdentityJson as VerticalDramaPresetVisualIdentity | null;
              if (identity) {
                const stampedBible = stampPresetVisualIdentityIntoBible(
                  (row.bible as Record<string, unknown> | null) ?? null,
                  identity
                );
                const [updatedRow] = await db
                  .update(verticalDramaSeries)
                  .set({ bible: stampedBible, updatedAt: new Date() })
                  .where(seriesOwnershipWhere(tenantId, userId, Number(row.id)))
                  .returning();
                if (updatedRow) finalRow = updatedRow;
              }
            }
          }
        } catch (error) {
          debugError(
            "verticalDramaSeries.create",
            `Failed to stamp preset visual identity for series ${row.id} from appliedPresetId ${input.appliedPresetId}`,
            error
          );
        }
      }

      return { series: { ...finalRow, id: String(finalRow.id) } };
    }),

  /**
   * Fetch a single owned series plus its episodes (light projection) for the
   * Series detail workspace. Ownership enforced on both queries.
   */
  get: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      const episodes: EpisodeListProjection[] = await db
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          status: verticalDramaEpisodes.status,
          targetDurationSeconds: verticalDramaEpisodes.targetDurationSeconds,
          updatedAt: verticalDramaEpisodes.updatedAt,
          // Read ONLY to derive `compiledVideo` below via
          // `extractEpisodeCompiledVideoSummary` — never spread into the
          // returned episode DTO (see the `episodes.map` destructure below).
          assemblyManifest: verticalDramaEpisodes.assemblyManifest,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .orderBy(verticalDramaEpisodes.episodeNumber);

      // Derived thumbnails (no schema change) — each episode's own approved
      // shot image, resolved from `startFramePlan.frames[i].approvedMediaAssetId`.
      const thumbnailByEpisode = await resolveEpisodeThumbnailUrls(db, {
        tenantId,
        userId,
        episodeIds: episodes.map(e => e.id),
      });

      return {
        series: {
          ...row,
          id: String(row.id),
          // Deep story drafts (W10-A) — additive, `null` when the series has
          // no deep-drafted episodes yet.
          deepDraftSummary: computeDeepDraftSummary(
            row.bible as Record<string, unknown> | null,
            row.targetEpisodeCount
          ),
          // Dramaturgy critic (W11.5) — additive, `null` when the active
          // breakdown version has never been critiqued.
          lastCritique: readActiveSeasonCritique(
            row.bible as Record<string, unknown> | null
          ),
          // Production Episodes (Phase D′-1) — additive, `null` when the
          // series has never had a Production Episode group assembled yet.
          // Unlike `assemblyManifest` (episode-level; carries internal
          // render-plan data the client must never see — see `compiledVideo`
          // below), this manifest shape is ALREADY display-safe (just
          // index/subEpisodeNumbers/status/videoUrl/durationSeconds per
          // group), so it is returned as-is with no extraction helper.
          productionEpisodesManifest:
            (row.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null) ??
            null,
        },
        episodes: episodes.map(e => {
          // Destructure `assemblyManifest` OUT of the spread so the raw
          // jsonb manifest never reaches the client — only the compact
          // `compiledVideo` summary derived from it does.
          const { assemblyManifest, ...rest } = e;
          return {
            ...rest,
            id: String(e.id),
            thumbnailUrl: thumbnailByEpisode.get(e.id) ?? null,
            compiledVideo: extractEpisodeCompiledVideoSummary(assemblyManifest),
          };
        }),
      };
    }),

  /**
   * List the Assets tab's two backing collections for an owned series:
   * character/product reference assets (`vertical_drama_character_assets`,
   * joined to the character name) and durable run artifacts
   * (`vertical_drama_run_artifacts`). Read-only; ownership enforced via
   * `loadOwnedSeries` plus tenant+user+seriesId scoping on both queries.
   */
  listSeriesAssets: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const characterAssetRows: CharacterAssetProjection[] = await db
        .select({
          id: verticalDramaCharacterAssets.id,
          characterId: verticalDramaCharacterAssets.characterId,
          characterName: verticalDramaCharacters.name,
          mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
          assetType: verticalDramaCharacterAssets.assetType,
          role: verticalDramaCharacterAssets.role,
          approved: verticalDramaCharacterAssets.approved,
          qcStatus: verticalDramaCharacterAssets.qcStatus,
          createdAt: verticalDramaCharacterAssets.createdAt,
        })
        .from(verticalDramaCharacterAssets)
        .leftJoin(
          verticalDramaCharacters,
          eq(
            verticalDramaCharacterAssets.characterId,
            verticalDramaCharacters.id
          )
        )
        .where(
          and(
            eq(verticalDramaCharacterAssets.tenantId, tenantId),
            eq(verticalDramaCharacterAssets.userId, userId),
            eq(verticalDramaCharacterAssets.seriesId, seriesId)
          )
        )
        .orderBy(desc(verticalDramaCharacterAssets.createdAt));

      const runArtifactRows: RunArtifactProjection[] = await db
        .select({
          id: verticalDramaRunArtifacts.id,
          episodeId: verticalDramaRunArtifacts.episodeId,
          stage: verticalDramaRunArtifacts.stage,
          storageKey: verticalDramaRunArtifacts.storageKey,
          mediaAssetIds: verticalDramaRunArtifacts.mediaAssetIds,
          createdAt: verticalDramaRunArtifacts.createdAt,
        })
        .from(verticalDramaRunArtifacts)
        .where(
          and(
            eq(verticalDramaRunArtifacts.tenantId, tenantId),
            eq(verticalDramaRunArtifacts.userId, userId),
            eq(verticalDramaRunArtifacts.seriesId, seriesId)
          )
        )
        .orderBy(desc(verticalDramaRunArtifacts.createdAt));

      return {
        characterAssets: characterAssetRows.map(row => ({
          id: String(row.id),
          characterId:
            row.characterId !== null ? String(row.characterId) : null,
          characterName: row.characterName ?? null,
          mediaAssetId:
            row.mediaAssetId !== null ? String(row.mediaAssetId) : null,
          assetType: row.assetType,
          role: row.role ?? null,
          approved: row.approved,
          qcStatus: row.qcStatus,
          createdAt: row.createdAt.toISOString(),
        })),
        runArtifacts: runArtifactRows.map(row => ({
          id: String(row.id),
          episodeId: String(row.episodeId),
          stage: row.stage,
          storageKey: row.storageKey ?? null,
          mediaAssetIds: (row.mediaAssetIds as number[] | null) ?? [],
          createdAt: row.createdAt.toISOString(),
        })),
      };
    }),

  /**
   * Fallback "images linked to this series" source (2026-07-05, project-scoped
   * media panel filter). New generations are tagged with `__vd_series_id` in
   * their media task's `parameters.extra_params` (see `media.listTasks`'s
   * `seriesId` filter), but images generated BEFORE this change carry no such
   * tag — this procedure instead reads the durable link tables that already
   * point at this series' images regardless of when they were generated:
   *  - `verticalDramaCharacterAssets` (character portraits/turnarounds/sheets)
   *  - `verticalDramaShotReferences` (per-shot reference strip)
   *  - every episode's `startFramePlan.frames[].approvedMediaAssetId` /
   *    `.angleGrid.imageUrl` (the start-frame plan JSONB, not a link table)
   *
   * The panel's "โปรเจกต์นี้" (this project) view is the UNION of this result
   * and the tagged `media.listTasks({seriesId})` result, deduped by URL on
   * the client. Returns plain URLs (already resolved via `mediaAssets`'s
   * `originalUrl`) rather than task/asset ids — the panel only needs
   * something to render + drag, not a specific row type.
   */
  listSeriesLinkedImageUrls: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [characterAssetUrlRows, shotReferenceUrlRows, episodeRows] =
        await Promise.all([
          db
            .select({ url: mediaAssets.originalUrl })
            .from(verticalDramaCharacterAssets)
            .innerJoin(
              mediaAssets,
              eq(verticalDramaCharacterAssets.mediaAssetId, mediaAssets.id)
            )
            .where(
              and(
                eq(verticalDramaCharacterAssets.tenantId, tenantId),
                eq(verticalDramaCharacterAssets.userId, userId),
                eq(verticalDramaCharacterAssets.seriesId, seriesId)
              )
            ),
          db
            .select({ url: mediaAssets.originalUrl })
            .from(verticalDramaShotReferences)
            .innerJoin(
              mediaAssets,
              eq(verticalDramaShotReferences.mediaAssetId, mediaAssets.id)
            )
            .where(
              and(
                eq(verticalDramaShotReferences.tenantId, tenantId),
                eq(verticalDramaShotReferences.userId, userId),
                eq(verticalDramaShotReferences.seriesId, seriesId)
              )
            ),
          db
            .select({ startFramePlan: verticalDramaEpisodes.startFramePlan })
            .from(verticalDramaEpisodes)
            .where(
              and(
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.userId, userId),
                eq(verticalDramaEpisodes.seriesId, seriesId)
              )
            ),
        ]);

      const urls = new Set<string>();
      for (const row of characterAssetUrlRows) {
        if (row.url) urls.add(row.url);
      }
      for (const row of shotReferenceUrlRows) {
        if (row.url) urls.add(row.url);
      }

      // startFramePlan-approved / angle-grid assets aren't in a link table —
      // approvedMediaAssetId needs a lookup against mediaAssets; angleGrid
      // already carries a direct imageUrl.
      const approvedAssetIds = new Set<number>();
      const angleGridUrls = new Set<string>();
      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            if (Number.isFinite(parsed)) approvedAssetIds.add(parsed);
          }
          if (frame.angleGrid?.imageUrl) {
            angleGridUrls.add(frame.angleGrid.imageUrl);
          }
        }
      }
      for (const url of angleGridUrls) {
        urls.add(url);
      }

      if (approvedAssetIds.size > 0) {
        const approvedAssetRows = await db
          .select({ id: mediaAssets.id, url: mediaAssets.originalUrl })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, userId),
              inArray(mediaAssets.id, Array.from(approvedAssetIds))
            )
          );
        for (const row of approvedAssetRows) {
          if (row.url) urls.add(row.url);
        }
      }

      return { imageUrls: Array.from(urls) };
    }),

  /**
   * List EVERY available product reference image for this series' tie-in
   * config (spec follow-up: "let the user view and change which product
   * image(s) are used as generation references per shot"). The full
   * Marketplace Capture image set (not the generation-time capped-3 subset)
   * plus the series' own `productTieIn.productImageUrl` — this is the
   * storyboard panel's "เปลี่ยนภาพสินค้า" picker's source list. Read-only,
   * ownership-scoped (NOT_FOUND on a cross-tenant/user series id). Never
   * throws over a missing/inaccessible capture — degrades to `[]` /
   * direct-URL-only, matching `resolveMarketplaceCaptureProductImageUrls`'s
   * existing graceful-skip convention.
   */
  listProductImages: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const rawProductTieIn =
        (row.productTieIn as Record<string, unknown> | null) ?? null;
      const productImageUrl =
        typeof rawProductTieIn?.productImageUrl === "string" &&
        rawProductTieIn.productImageUrl
          ? rawProductTieIn.productImageUrl
          : undefined;
      const marketplaceCaptureId =
        typeof rawProductTieIn?.marketplaceCaptureId === "string" &&
        rawProductTieIn.marketplaceCaptureId
          ? rawProductTieIn.marketplaceCaptureId
          : undefined;

      const { listAvailableProductReferenceImages } =
        await import("../services/verticalDramaProductTieIn");
      const images = await listAvailableProductReferenceImages({
        productImageUrl,
        marketplaceCaptureId,
        auth: { userId, tenantId },
      });

      return { images };
    }),

  /**
   * Soft-archive a series (status -> "archived"). History surfaces stay
   * readable; nothing is destroyed. Ownership enforced.
   */
  archiveSeries: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ status: "archived", updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Update an owned series' title / bible / policy / status. Ownership is
   * enforced (NOT_FOUND on a cross-tenant/user id). Metadata-only — never
   * triggers paid generation. Only supplied fields are written.
   */
  updateSeries: verticalDramaProcedure
    .input(updateSeriesInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const updates: Partial<typeof verticalDramaSeries.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.status !== undefined) updates.status = input.status;
      if (input.bible !== undefined) updates.bible = input.bible;
      if (input.policy !== undefined) updates.policy = input.policy;
      if (input.productTieIn !== undefined)
        updates.productTieIn = input.productTieIn;

      const [row] = await db
        .update(verticalDramaSeries)
        .set(updates)
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Free (no paid generation) setting: the series' default target-audience
   * region/ethnicity look, injected as a DEFAULT into every AI-generated
   * person/character prompt (portraits, turnarounds, character sheets, start
   * frames, angle-grid variations, image repairs) — see
   * `@shared/verticalDramaSeries/targetAudienceRegion.ts` for the value set
   * and the precedence rule (an explicit character `description` always
   * wins over this default).
   *
   * Stored inside the EXISTING `bible` jsonb column (additive-only field,
   * no migration) via a read-modify-write so this mutation never clobbers
   * any other `bible` field a wizard/story-bible call already populated —
   * unlike `updateSeries`, which replaces `bible` wholesale when the caller
   * supplies it.
   */
  setSeriesTargetAudienceRegion: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        targetAudienceRegion: z.enum(VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const existing = await loadOwnedSeries(tenantId, userId, seriesId);
      const existingBible =
        (existing.bible as Record<string, unknown> | null) ?? {};
      const nextBible: Record<string, unknown> = {
        ...existingBible,
        targetAudienceRegion:
          input.targetAudienceRegion satisfies VerticalDramaTargetAudienceRegion,
      };

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Manual LLM model override (added 2026-07-11 — see
   * `/home/dev/.claude/plans/polished-toasting-gadget.md`) — lists the
   * eligible model set the "generate start-frame render plan" / "generate
   * storyboard" stages' automatic selector would pick from (the SAME
   * `contextLength >= 1,000,000 && !isFree && supportsThinking === true`
   * filter "improve script" already uses), sorted cheapest-first (the same
   * order the auto-selector would pick from) — for the series settings
   * dropdown's "automatic" + explicit-model-list options. No input; not
   * series-scoped (the eligible model catalog is tenant-independent).
   *
   * `loadEnabledLlmModelRows`/`selectQualityLargeContextEligibleModels` are
   * loaded via a lazy `await import(...)` — see this file's own established
   * "narrow vi.mock safety" convention documented on the Ad Banner
   * Overlay/`runImproveScriptJob` import blocks above: both pull in a heavy
   * `routers/llmProviders.ts` transitive chain that would otherwise break
   * every sibling test file's narrow `vi.mock` graph the instant this module
   * loads. `llmProviders`/`modelProviderMap` (imported statically above —
   * pure table definitions, no heavy transitive chain) are used here only to
   * join in a richer display label (`modelName`/provider `displayName`),
   * mirroring `multiProvider.ts`'s `listAdminModelCatalog` join.
   */
  listQualityPlanningModels: verticalDramaProcedure.query(async () => {
    const { loadEnabledLlmModelRows } =
      await import("../services/enabledLlmModels");
    const { selectQualityLargeContextEligibleModels } =
      await import("../services/verticalDramaImproveScript");

    const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    const eligible = selectQualityLargeContextEligibleModels(rows);
    if (eligible.length === 0) {
      return [] as Array<{ modelId: string; label: string }>;
    }

    type QualityPlanningModelLabelRow = {
      modelId: string;
      modelName: string;
      providerName: string;
      providerDisplayName: string;
    };
    const modelIds = eligible.map(row => row.modelId);
    const labelRows: QualityPlanningModelLabelRow[] = await db
      .select({
        modelId: modelProviderMap.modelId,
        modelName: modelProviderMap.modelName,
        providerName: llmProviders.providerName,
        providerDisplayName: llmProviders.displayName,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(inArray(modelProviderMap.modelId, modelIds));
    const labelByModelId = new Map<string, QualityPlanningModelLabelRow>(
      labelRows.map(row => [row.modelId, row])
    );

    return eligible.map(row => {
      const labelRow = labelByModelId.get(row.modelId);
      const providerLabel =
        labelRow?.providerDisplayName ||
        labelRow?.providerName ||
        row.providerName;
      const modelLabel = labelRow?.modelName || row.modelId;
      return {
        modelId: row.modelId,
        label: `${providerLabel} — ${modelLabel}`,
      };
    });
  }),

  /**
   * Manual LLM model override (added 2026-07-11, widened the same day to a
   * single series-wide field —
   * `planning/vertical-drama-centralized-model-policy/plan.md`) — sets the
   * series' `llmModelPolicy.defaultModelId`, the ONE override that applies to
   * every LLM call in the Vertical Drama chain for this series (see
   * `server/services/verticalDramaLlmModelPolicy.ts`). `defaultModelId` is
   * `required-but-nullable`: `null` always means "automatic" (each stage's
   * own auto-selector); a non-null model id must be present in
   * `listQualityPlanningModels`' eligible set, or this throws `BAD_REQUEST`
   * — never silently persists an ineligible pin. The whole `llmModelPolicy`
   * column is overwritten (not merged) since there is now only one field.
   */
  setSeriesLlmModelPolicy: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        defaultModelId: z.string().min(1).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      if (input.defaultModelId !== null) {
        const { loadEnabledLlmModelRows } =
          await import("../services/enabledLlmModels");
        const { selectQualityLargeContextEligibleModels } =
          await import("../services/verticalDramaImproveScript");
        const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
        const eligibleModelIds = new Set(
          selectQualityLargeContextEligibleModels(rows).map(row => row.modelId)
        );
        if (!eligibleModelIds.has(input.defaultModelId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Model "${input.defaultModelId}" is not eligible for this planning stage`,
          });
        }
      }

      await loadOwnedSeries(tenantId, userId, seriesId);
      const nextPolicy: VerticalDramaSeriesLlmModelPolicy = {
        defaultModelId: input.defaultModelId,
      };

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ llmModelPolicy: nextPolicy, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Text Overlay Suite (F131AB, task #34, plan.md v2 "ลายน้ำ") — save this
   * series' branding WATERMARK config (attached to the SERIES, not per-
   * episode — plan.md "ระดับซีรีส์ (branding ผูกกับเรื่อง ไม่ใช่รายตอน)").
   * Brand-new mutation, so gated at the TOP of the handler (mirrors
   * `verticalDramaEpisodes.ts`'s `updateEpisodeTextOverlayPlan` exactly) —
   * flags-off throws FORBIDDEN before any DB read. Range validation
   * (opacity 0.2-0.8, scalePct 5-20, marginPx 0-200) is fully enforced by
   * `vdSeriesWatermarkConfigSchema` itself (zod `.min`/`.max`), so a
   * malformed payload never reaches the handler body at all — tRPC's own
   * input-parsing layer rejects it with a zod `BAD_REQUEST` before this
   * function runs.
   */
  updateSeriesWatermark: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        watermark: vdSeriesWatermarkConfigSchema,
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const textOverlaySuiteEnabled =
        await resolveVerticalDramaTextOverlaySuiteFlag(tenantId);
      if (!textOverlaySuiteEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Feature 'verticalDramaSeriesTextOverlaySuite' is not enabled for this tenant",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ watermark: input.watermark, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { watermark: row.watermark as VdSeriesWatermarkConfig };
    }),

  /**
   * Genre preset catalog for the Create-Series Wizard's "start from a preset"
   * picker. Returns `scope: "global"` presets (visible to everyone — the
   * seeded catalog plus anything an admin published) plus the caller's own
   * `scope: "private"` presets (their own "Save as preset" saves, invisible
   * to other users). Still gated behind the feature flag like every other
   * procedure on this router.
   */
  listGenrePresets: verticalDramaProcedure
    .input(z.object({ locale: z.enum(["th", "en"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const locale = input?.locale ?? "th";
      const tenantId = ctx.tenantId;
      const userId = ctx.user.id;
      const rows: VerticalDramaGenrePresetRow[] = await db
        .select()
        .from(verticalDramaGenrePresets)
        .where(
          and(
            eq(verticalDramaGenrePresets.locale, locale),
            tenantId
              ? or(
                  eq(verticalDramaGenrePresets.scope, "global"),
                  and(
                    eq(verticalDramaGenrePresets.scope, "private"),
                    eq(verticalDramaGenrePresets.tenantId, tenantId),
                    eq(verticalDramaGenrePresets.userId, userId)
                  )
                )
              : eq(verticalDramaGenrePresets.scope, "global")
          )
        )
        .orderBy(asc(verticalDramaGenrePresets.sortOrder));

      return {
        presets: rows.map(toGenrePresetDto),
      };
    }),

  /**
   * AI-assisted Mix and Match draft generator for the Create-Series Wizard.
   * The mutation returns a transient editable preset draft only — it never
   * writes a global/private preset row, so users stay in control before apply.
   */
  synthesizeGenrePreset: verticalDramaProcedure
    .input(synthesizeGenrePresetInput)
    .mutation(async ({ ctx, input }) => {
      const locale = input.locale ?? "th";
      const tenantId = ctx.tenantId;
      const userId = ctx.user.id;
      const selectedPresetIds = Array.from(
        new Set(input.selectedPresetIds ?? [])
      );
      const selectedCategories = Array.from(
        new Set(
          (input.selectedCategories ?? [])
            .map(category => category.trim())
            .filter(Boolean)
        )
      );

      // Preset Mix v2 (spec §8.2.2.C, section-15) — the ENTIRE v1 branch
      // below is untouched, verbatim shipped code, reached whenever the
      // tenant flag is off (or absent). This keeps flags-off behavior
      // byte-identical NO MATTER what `input.selections` contains (v1 never
      // reads that field at all).
      const flags = tenantId ? await getTenantFeatureFlags(tenantId) : null;
      const presetMixV2Enabled = flags?.verticalDramaSeriesPresetMixV2 === true;
      // Feature 132 §4 (F132A, user-premise-preset-mix) — independent of
      // Preset Mix v2; gates whether `input.userPremise` is honored by
      // EITHER the v1 or v2 synthesis call below. Flag-off forces
      // `undefined` regardless of what the client sent, guaranteeing
      // byte-identical prompts (mirrors `verticalDramaSeriesPresetMixV2`'s
      // proven server-decides pattern).
      const userPremiseEnabled = flags?.verticalDramaUserPremise === true;

      if (!presetMixV2Enabled) {
        const selectedPresetNumericIds = selectedPresetIds.map(id =>
          Number(id)
        );
        if (selectedPresetNumericIds.some(id => !Number.isFinite(id))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid preset id",
          });
        }

        const visibleRows: VerticalDramaGenrePresetRow[] = await db
          .select()
          .from(verticalDramaGenrePresets)
          .where(
            and(
              eq(verticalDramaGenrePresets.locale, locale),
              tenantId
                ? or(
                    eq(verticalDramaGenrePresets.scope, "global"),
                    and(
                      eq(verticalDramaGenrePresets.scope, "private"),
                      eq(verticalDramaGenrePresets.tenantId, tenantId),
                      eq(verticalDramaGenrePresets.userId, userId)
                    )
                  )
                : eq(verticalDramaGenrePresets.scope, "global")
            )
          )
          .orderBy(asc(verticalDramaGenrePresets.sortOrder));

        const visibleById = new Map(
          visibleRows.map(row => [String(row.id), row])
        );
        const selectedRows = selectedPresetIds
          .map(id => visibleById.get(id))
          .filter((row): row is VerticalDramaGenrePresetRow => Boolean(row));
        if (selectedRows.length !== selectedPresetIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Preset not found",
          });
        }

        try {
          const result = await synthesizeVerticalDramaPreset({
            userId,
            tenantId: tenantId ?? undefined,
            locale: normalizeVerticalDramaSeriesLocale(locale),
            selectedPresets: selectedRows.map(toGenrePresetDto),
            selectedCategories,
            primarySelectionId: input.primarySelectionId,
            businessContext: input.businessContext,
            productContext: input.productContext,
            targetEpisodeCount: input.targetEpisodeCount,
            toneHint: input.toneHint,
            userPremise: userPremiseEnabled ? input.userPremise : undefined,
          });
          return result;
        } catch (error) {
          if (error instanceof PresetSynthesisInputError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          }
          if (error instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: error.message });
          }
          if (error instanceof VdSchemaValidationError) {
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
                : "Preset synthesis failed",
          });
        }
      }

      // ---- Preset Mix v2 branch (flag ON) ----
      // `input.selections` may reference presets NOT also present in legacy
      // `selectedPresetIds` — union both for the SAME ownership/visibility
      // lookup `listGenrePresets` uses, so a v2 weighted selection gets
      // identical NOT_FOUND/scope enforcement as a legacy id.
      const v2SelectionPresetIds = Array.from(
        new Set((input.selections ?? []).map(selection => selection.presetId))
      );
      const allPresetIds = Array.from(
        new Set([...selectedPresetIds, ...v2SelectionPresetIds])
      );

      const allPresetNumericIds = allPresetIds.map(id => Number(id));
      if (allPresetNumericIds.some(id => !Number.isFinite(id))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid preset id",
        });
      }

      const visibleRowsV2: VerticalDramaGenrePresetRow[] = await db
        .select()
        .from(verticalDramaGenrePresets)
        .where(
          and(
            eq(verticalDramaGenrePresets.locale, locale),
            tenantId
              ? or(
                  eq(verticalDramaGenrePresets.scope, "global"),
                  and(
                    eq(verticalDramaGenrePresets.scope, "private"),
                    eq(verticalDramaGenrePresets.tenantId, tenantId),
                    eq(verticalDramaGenrePresets.userId, userId)
                  )
                )
              : eq(verticalDramaGenrePresets.scope, "global")
          )
        )
        .orderBy(asc(verticalDramaGenrePresets.sortOrder));

      const visibleByIdV2 = new Map(
        visibleRowsV2.map(row => [String(row.id), row])
      );
      const allPresetRows = allPresetIds
        .map(id => visibleByIdV2.get(id))
        .filter((row): row is VerticalDramaGenrePresetRow => Boolean(row));
      if (allPresetRows.length !== allPresetIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
      }

      try {
        const result = await synthesizeVerticalDramaPresetV2({
          userId,
          tenantId: tenantId ?? undefined,
          locale: normalizeVerticalDramaSeriesLocale(locale),
          selections: input.selections,
          selectedPresetIds,
          selectedPresets: allPresetRows.map(row => ({
            ...toGenrePresetDto(row),
            visualIdentityJson:
              row.visualIdentityJson as VerticalDramaPresetVisualIdentity | null,
          })),
          selectedCategories,
          primarySelectionId: input.primarySelectionId,
          businessContext: input.businessContext,
          productContext: input.productContext,
          targetEpisodeCount: input.targetEpisodeCount,
          toneHint: input.toneHint,
          userPremise: userPremiseEnabled ? input.userPremise : undefined,
        });
        return result;
      } catch (error) {
        if (error instanceof PresetSynthesisInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Preset synthesis failed",
        });
      }
    }),

  /**
   * Expand an owned series' wizard-gathered bible into a full season/episode
   * story bible via a real LLM call. Unlike `create`/`updateSeries`, this is
   * a genuinely paid action (credit-gated) — the first real generation step
   * in this feature area. Ownership enforced; writes the result back into
   * the existing `bible` jsonb column (no schema change needed).
   */
  generateStoryBible: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};

      let result;
      try {
        result = await generateStoryBible({
          userId,
          tenantId,
          seriesId,
          title: row.title,
          locale: normalizeVerticalDramaSeriesLocale(row.locale),
          genre: row.genre,
          tone: row.tone,
          targetEpisodeCount: row.targetEpisodeCount,
          bible,
        });
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        if (error instanceof VdSchemaValidationError) {
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
              : "Story bible generation failed",
        });
      }

      const updatedBible = {
        ...bible,
        expandedSeasonArc: result.expanded.expandedSeasonArc,
        refinedCharacters: result.expanded.refinedCharacters,
        episodeBreakdown: result.expanded.episodeBreakdown,
        expandedAt: new Date().toISOString(),
      };

      const [updatedRow] = await db
        .update(verticalDramaSeries)
        .set({ bible: updatedBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return {
        series: { ...updatedRow, id: String(updatedRow.id) },
        creditsUsed: result.creditsUsed,
        model: result.model,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* Async story jobs (#28, added 2026-07-08) — deep story drafts             */
  /* ------------------------------------------------------------------------ */

  /**
   * Deep story drafts (W10-A, added 2026-07-08; converted to an async job by
   * task #28, 2026-07-08) — chunked bible-stage generation of a full 9-shot,
   * speakable-dialogue draft for every planned episode within the resolved
   * horizon. Requires an ACTIVE breakdown to already exist (run "Generate
   * story" first) — this mutation only ADDS shot-level detail onto
   * already-planned episodes, it never invents new
   * `workingTitle`/`logline`/`keyBeats`/`contentBudget` (owner-approved
   * design point 5).
   *
   * ASYNC JOB (#28): validates ownership/flags/preconditions/credits
   * SYNCHRONOUSLY (fails fast, same TRPCError codes as before), then
   * enqueues `runGenerateStoryBibleDeepJob` (below) as a
   * `vertical_drama_story_jobs` job and returns `{ jobId, deduped }`
   * immediately — the real generation (persist + audit) now happens inside
   * the worker. Poll `getStoryJobStatus({ seriesId, jobId })`; the OLD
   * synchronous response shape is unchanged, just relocated into
   * `result` once `status === "succeeded"`.
   */
  generateStoryBibleDeep: verticalDramaDeepStoryDraftsProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        horizonEpisodes: z.number().int().positive().optional(),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
        /**
         * Premium multi-round drafts (W11-A, added 2026-07-08) — defaults to
         * `"standard"` when omitted, running the EXACT W10-A pipeline
         * byte-identically. `"premium"` runs the fan-out -> gates -> judge ->
         * targeted-revise -> season-sweep pipeline instead (see
         * `generateStoryBibleDeep`'s mode switch in the service).
         */
        mode: verticalDramaDeepStoryDraftModeSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const mode: VerticalDramaDeepStoryDraftMode = input.mode ?? "standard";

      // Fail-fast sync validation — SAME guards the old synchronous body ran
      // (ownership + preconditions), so a doomed request never occupies the
      // series' story-job slot. `runGenerateStoryBibleDeepJob` re-runs these
      // same guards inside the worker (state may have shifted between
      // enqueue and dequeue) — this deliberate double-guard mirrors this
      // file's own established "guard in both places" convention (see
      // `critiqueSeasonDrafts`'s service-level defensive re-check doc
      // comment).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const existingItems = getActiveBreakdown(bible);
      if (existingItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate the story bible first before generating deep shot drafts",
        });
      }

      const horizon = resolveDeepDraftHorizon(
        input.horizonEpisodes,
        row.targetEpisodeCount
      );
      const episodeNumbers = new Set(
        Array.from({ length: horizon }, (_, i) => i + 1)
      );
      const episodesToDraft = existingItems.filter(item =>
        episodeNumbers.has(item.episodeNumber)
      );
      if (episodesToDraft.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No planned Sub-episodes are available within the requested horizon",
        });
      }

      await ensureStoryJobCreditsAvailable(
        userId,
        estimateDeepDraftJobCredits(episodesToDraft.length, mode)
      );

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "deep_generate",
        seriesId,
        tenantId,
        userId,
        input: {
          horizonEpisodes: input.horizonEpisodes,
          mode,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { jobId, deduped };
    }),

  /**
   * Deep story drafts (W10-A, added 2026-07-08; converted to an async job by
   * task #28, 2026-07-08) — continues shot-level drafting from the active
   * version's persisted `deepDraft.horizonEndEpisode` (0 when the series has
   * never run a deep draft yet, which makes this behave like a first
   * `generateStoryBibleDeep` call) through `additionalEpisodes` further
   * episodes (default `VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES`), clamped to
   * the series' `targetEpisodeCount`.
   *
   * ASYNC JOB (#28): same submit -> `{jobId, deduped}` -> poll contract as
   * `generateStoryBibleDeep` above — see that mutation's own doc comment.
   */
  extendStoryDraftHorizon: verticalDramaDeepStoryDraftsProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        additionalEpisodes: z.number().int().positive().optional(),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
        /** Premium multi-round drafts (W11-A) — see `generateStoryBibleDeep`'s own `mode` input doc comment above. */
        mode: verticalDramaDeepStoryDraftModeSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const mode: VerticalDramaDeepStoryDraftMode = input.mode ?? "standard";

      // Fail-fast sync validation — see `generateStoryBibleDeep`'s own doc
      // comment on the deliberate double-guard (also re-run inside
      // `runExtendStoryDraftHorizonJob`).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const existingItems = getActiveBreakdown(bible);
      if (existingItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate the story bible first before extending deep shot drafts",
        });
      }

      const totalEpisodes = row.targetEpisodeCount;
      const priorMetadata = readActiveDeepDraftMetadata(bible);
      const horizonStart = (priorMetadata?.horizonEndEpisode ?? 0) + 1;
      if (horizonStart > totalEpisodes) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "All planned Sub-episodes already have deep shot drafts",
        });
      }

      const additionalEpisodes =
        input.additionalEpisodes ?? VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES;
      const horizonEnd = Math.min(
        horizonStart + additionalEpisodes - 1,
        totalEpisodes
      );
      const episodeNumbers = new Set(
        Array.from(
          { length: Math.max(0, horizonEnd - horizonStart + 1) },
          (_, i) => horizonStart + i
        )
      );
      const episodesToDraft = existingItems.filter(item =>
        episodeNumbers.has(item.episodeNumber)
      );
      if (episodesToDraft.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No planned Sub-episodes are available within the requested horizon",
        });
      }

      await ensureStoryJobCreditsAvailable(
        userId,
        estimateDeepDraftJobCredits(episodesToDraft.length, mode)
      );

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "extend",
        seriesId,
        tenantId,
        userId,
        input: {
          additionalEpisodes: input.additionalEpisodes,
          mode,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { jobId, deduped };
    }),

  /**
   * Edit a deep-drafted shot's dialogue lines AT THE SOURCE — the series'
   * ACTIVE breakdown item (W10.5, added 2026-07-08) — so a corrected line
   * hydrates into episodes materialized from this item afterward, instead
   * of only patching an already-materialized episode's own copy.
   *
   * PERSISTENCE (locked design decision — see `verticalDramaStoryBible.ts`'s
   * "Manual dialogue edits" section for the full rationale): this EDITS the
   * ACTIVE breakdown version's item IN PLACE, an explicit, deliberate
   * exception to the append-only breakdown-versions discipline (spec
   * §7.7.3 hard rule 4). Justified as a typo/line-level user correction to
   * already-produced text, not a re-plan — append-only continues to govern
   * real plan regeneration (`generateStoryBibleDeep`/`extendStoryDraftHorizon`
   * above) and arc re-plans (`approveArcReplanProposal` below). Persists via
   * the exact SAME `db.update(verticalDramaSeries).set({ bible, updatedAt })`
   * call shape `approveArcReplanProposal` uses.
   *
   * Dialogue lines are stored VERBATIM — never auto-cleaned (the client
   * already offers live cleaning before submit); `speakabilityWarnings`
   * only REPORTS `analyzeVerticalDramaLineSpeakability` violations per line
   * for the client to act on. A shot's contradictory `silence_intent` is
   * stripped (dialogue wins) whenever at least one line is submitted —
   * mirrors `enforceEpisodeShotDraftSpeakability`'s existing
   * `silence_intent_conflict` rule — and surfaced as `silenceIntentRemoved`.
   *
   * Idempotent: a retried call carrying an `idempotencyKey` this item has
   * already applied is a complete no-op (no second write, no second audit
   * event, no re-accumulated `manualDialogueEdit.shotNumbers`).
   */
  updateEpisodeDraftDialogue: verticalDramaDeepStoryDraftsProcedure
    .input(updateEpisodeDraftDialogueInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const { activeIndex, versions, item } = loadManualDialogueEditTarget(
        bible,
        input.episodeNumber,
        input.shotNumber
      );

      // Idempotent replay: a retried call carrying an idempotencyKey this
      // item has already applied is a complete no-op — no second write, no
      // second audit event, no re-accumulated `shotNumbers`. Warnings are
      // recomputed from the already-stored lines (identical to the first
      // call's own submitted lines) purely so the response shape stays
      // consistent between the first call and every replay of it.
      const priorStamp = readItemManualDialogueEdit(item);
      const isReplay =
        !!input.idempotencyKey &&
        !!priorStamp?.appliedIdempotencyKeys?.includes(input.idempotencyKey);
      if (isReplay) {
        const shotDrafts = readItemShotDrafts(item) ?? [];
        const currentShot = shotDrafts.find(
          shot => shot.shot_number === input.shotNumber
        );
        return {
          item,
          criteriaVersionMarker: renderCriteriaVersionMarker(),
          speakabilityWarnings: analyzeManualDialogueEditLines(
            currentShot?.dialogue_lines ?? []
          ),
          silenceIntentRemoved: false,
        };
      }

      let editResult;
      try {
        editResult = applyManualDialogueEdit({
          item,
          shotNumber: input.shotNumber,
          lines: input.lines,
          editedByUserId: userId,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (error) {
        if (error instanceof ManualDialogueEditNoDraftError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }

      const updatedVersions = versions.map((version, index) =>
        index === activeIndex
          ? {
              ...version,
              items: version.items.map(existingItem =>
                existingItem.episodeNumber === input.episodeNumber
                  ? editResult.item
                  : existingItem
              ),
            }
          : version
      );
      const nextBible: Record<string, unknown> = {
        ...bible,
        breakdownVersions: updatedVersions,
      };

      await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      await recordManualDialogueEditAuditEvent({
        userId,
        seriesId,
        episodeNumber: input.episodeNumber,
        shotNumber: input.shotNumber,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        item: editResult.item,
        criteriaVersionMarker: editResult.criteriaVersionMarker,
        speakabilityWarnings: editResult.speakabilityWarnings,
        silenceIntentRemoved: editResult.silenceIntentRemoved,
      };
    }),

  /**
   * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — replaces the old
   * critique/apply-critique/quality-loop flow with ONE whole-script pass
   * through the `drama-script-evaluate-improve` skill (see
   * `services/verticalDramaImproveScript.ts`'s own doc comment for the full
   * design). Same submit -> `{jobId, deduped}` -> poll contract as every
   * other story-job mutation; shares the SAME per-series job slot as
   * `deep_generate`/`extend` — an improve-script run in flight blocks a new
   * submit of any kind for this series, and vice versa.
   *
   * Requires at least one deep-drafted episode (`generateStoryBibleDeep`
   * first) — same guard the removed `critiqueSeasonDrafts` used to run. The
   * job NEVER writes to `bible` itself; the user must review the original/
   * improved comparison and explicitly call `confirmImproveScript` (or
   * `discardImproveScript`) once the job succeeds.
   */
  startImproveScript: verticalDramaDeepStoryDraftsProcedure
    .input(startImproveScriptInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Fail-fast sync validation — see `generateStoryBibleDeep`'s own doc
      // comment on the deliberate double-guard (also re-run inside
      // `runImproveScriptJob`).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const existingItems = getActiveBreakdown(bible);
      const hasAnyDraftedEpisode = existingItems.some(
        item => readItemShotDrafts(item) !== null
      );
      if (!hasAnyDraftedEpisode) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate deep story drafts first before improving this script",
        });
      }

      const draftedEpisodeCount = existingItems.filter(
        item => readItemShotDrafts(item) !== null
      ).length;
      await ensureStoryJobCreditsAvailable(
        userId,
        estimateImproveScriptJobCredits(draftedEpisodeCount)
      );

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "improve_script",
        seriesId,
        tenantId,
        userId,
        input: {
          userRevisionRequest: input.userRevisionRequest,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { jobId, deduped };
    }),

  /**
   * Confirms a succeeded `improve_script` job's result: merges
   * `result.improvedItems` back into the FULL active item list (episodes
   * outside the job's scope are untouched), appends a NEW append-only
   * breakdown version (`source: "improve_script"`), and flips
   * `activeBreakdownVersionId` — this IS the "keep the original until
   * confirm" contract, for free, via the existing versioning system (the job
   * itself never touched `bible`). Requires `needsReview === false`
   * (fail-closed — see `runImproveScriptJob`'s own verification-gate doc
   * comment; the client's only action on a `needsReview: true` result is
   * discard, never a partial apply).
   *
   * STALENESS GUARD: rejects if the series' active breakdown version
   * changed since this job ran (another job landed, or a manual edit was
   * made in the meantime) — the comparison the user reviewed no longer
   * matches what's live, so applying it now could silently clobber newer
   * content.
   */
  confirmImproveScript: verticalDramaDeepStoryDraftsProcedure
    .input(improveScriptJobRefInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      const record = await getVerticalDramaStoryJobStatus(input.jobId, {
        tenantId,
        seriesId,
      });
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story job not found",
        });
      }
      if (record.kind !== "improve_script" || record.status !== "succeeded") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "งานปรับปรุงบทละครนี้ยังไม่เสร็จสมบูรณ์ ไม่สามารถยืนยันได้",
        });
      }

      const result = record.result as RunImproveScriptJobResult | undefined;
      if (!result || result.improvedItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ผลลัพธ์นี้ยังไม่ผ่านการตรวจสอบความถูกต้อง ไม่สามารถยืนยันได้ — กรุณาตรวจสอบเหตุผลแล้วสั่งปรับปรุงใหม่",
        });
      }

      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const currentActiveBreakdownVersionId =
        typeof (bible as { activeBreakdownVersionId?: unknown })
          .activeBreakdownVersionId === "string"
          ? ((bible as { activeBreakdownVersionId?: string })
              .activeBreakdownVersionId as string)
          : null;
      if (
        currentActiveBreakdownVersionId !== result.activeBreakdownVersionIdAtRun
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "เนื้อหาเปลี่ยนไปตั้งแต่รันงานนี้ กรุณาสั่งปรับปรุงใหม่",
        });
      }

      const existingItems = getActiveBreakdown(bible);
      const improvedByEpisode = new Map(
        result.improvedItems.map(item => [item.episodeNumber, item])
      );
      const mergedItems = existingItems.map(
        item => improvedByEpisode.get(item.episodeNumber) ?? item
      );

      const nextBible = appendBreakdownVersion(bible, {
        source: "improve_script",
        items: mergedItems,
        createdByUserId: userId,
      });

      // Sync the improved PLAN fields (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง) into
      // the legacy top-level `bible.episodeBreakdown` array too. The
      // deep-story-drafts "plan" view (`VerticalDramaSeriesDetailPage.tsx` —
      // `expanded.episodeBreakdown`) reads the logline/keyBeats/title from
      // `episodeBreakdown`, NOT from the versioned items (which only feed the
      // per-shot dialogue view). `appendBreakdownVersion` never touches
      // `episodeBreakdown`, so without this sync a confirmed improvement
      // updated the shots (read from the active version) but left the plan
      // summary showing the pre-improvement text. Only the plan fields the
      // view actually renders are overwritten; per-episode extras
      // (contentBudget, etc.) and un-improved episodes are left untouched.
      const legacyBreakdown = (nextBible as { episodeBreakdown?: unknown })
        .episodeBreakdown;
      if (Array.isArray(legacyBreakdown)) {
        (nextBible as { episodeBreakdown?: unknown }).episodeBreakdown =
          legacyBreakdown.map(entry => {
            if (!entry || typeof entry !== "object") return entry;
            const epNum = (entry as { episodeNumber?: unknown }).episodeNumber;
            const improved =
              typeof epNum === "number"
                ? improvedByEpisode.get(epNum)
                : undefined;
            if (!improved) return entry;
            const cliffhanger = (improved as { cliffhanger_line?: unknown })
              .cliffhanger_line;
            return {
              ...(entry as Record<string, unknown>),
              workingTitle: improved.workingTitle,
              logline: improved.logline,
              keyBeats: improved.keyBeats,
              ...(cliffhanger !== undefined
                ? { cliffhanger_line: cliffhanger }
                : {}),
            };
          });
      }

      await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      try {
        await db.insert(apiAuditEvents).values({
          traceId: randomUUID().replace(/-/g, "").slice(0, 32),
          eventType: "vertical_drama_improve_script_confirm",
          userId,
          endpoint: "verticalDramaSeries.confirmImproveScript",
          statusCode: 200,
          // Literal, not imported — see this file's import block doc comment
          // on `RunImproveScriptJobResult` for why.
          skillSlug: "drama-script-evaluate-improve",
          creditsCharged: 0,
          metadata: {
            seriesId,
            jobId: input.jobId,
            // `improvedItems`-derived, NOT `expectedEpisodeNumbers` — a
            // partial success means not every expected episode actually got
            // improved (see `RunImproveScriptJobResult`'s own doc comment).
            updatedEpisodeNumbers: result.improvedItems.map(
              item => item.episodeNumber
            ),
          },
        });
      } catch (error) {
        debugError(
          "verticalDramaSeries.confirmImproveScript",
          "Failed to record improve-script confirm audit event",
          error
        );
      }

      return {
        updatedEpisodeNumbers: result.improvedItems.map(
          item => item.episodeNumber
        ),
      };
    }),

  /**
   * Discards a completed `improve_script` job's result — ownership check
   * only, no `bible` mutation (the original active breakdown version was
   * never touched by the job in the first place). No early-clear helper
   * exists in `verticalDramaStoryJobs.ts` today for proactively expiring a
   * Redis job record; the simpler option is preferred here — the record's
   * own TTL naturally expires it, and a client that already discarded won't
   * poll it again.
   */
  discardImproveScript: verticalDramaDeepStoryDraftsProcedure
    .input(improveScriptJobRefInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, userId, seriesId);
      return { ok: true };
    }),

  /**
   * Poll a `vertical_drama_story_jobs` job's status (#28, added 2026-07-08)
   * — the poll side of `generateStoryBibleDeep`/`extendStoryDraftHorizon`/
   * `startImproveScript`'s shared submit contract.
   * `result` carries the EXACT old synchronous response shape for the job's
   * `kind` once `status === "succeeded"`; `error` is the message once
   * `status === "failed"`. Ownership-checked via `loadOwnedSeries` (NOT_FOUND
   * for a cross-tenant/missing series) THEN via the job record's own
   * tenant/series match (NOT_FOUND for a jobId that belongs to someone
   * else's job) — never discloses existence either way.
   */
  getStoryJobStatus: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, userId, seriesId);

      const record = await getVerticalDramaStoryJobStatus(input.jobId, {
        tenantId,
        seriesId,
      });
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story job not found",
        });
      }

      return {
        kind: record.kind,
        status: record.status,
        progress: record.progress,
        result: record.status === "succeeded" ? record.result : undefined,
        error:
          record.status === "failed" ? (record.error ?? undefined) : undefined,
      };
    }),

  /**
   * Refresh-safe resume support (#28, added 2026-07-08) — the currently
   * active (queued/running) `vertical_drama_story_jobs` job for this series,
   * if any, across EVERY kind. The client calls this on mount (or folds it
   * into its own `get` load) to resume polling and keep the primary CTA
   * disabled with progress shown after a page reload while a job is still
   * in flight. Returns `null` (never an error) when no job is active.
   */
  getActiveStoryJob: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, userId, seriesId);

      const record = await getActiveVerticalDramaStoryJob({
        tenantId,
        seriesId,
      });
      if (!record) return null;
      return {
        jobId: record.jobId,
        kind: record.kind,
        status: record.status,
        progress: record.progress,
      };
    }),

  /**
   * Save an owned series (the project the user is already editing) as a
   * reusable genre preset — no separate preset-management screen. Defaults to
   * `scope: "private"` (visible only to the saving user); `publishGlobally`
   * is only honored for callers with the `admin` role, in which case the
   * preset becomes `scope: "global"` (visible to every user, indistinguishable
   * from the seeded catalog).
   */
  saveSeriesAsPreset: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        title: z.string().trim().min(1).max(150),
        publishGlobally: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const charactersDraft =
        typeof bible.charactersDraft === "string" ? bible.charactersDraft : "";

      const isAdmin = ctx.user.role === "admin";
      const publishGlobally = Boolean(input.publishGlobally) && isAdmin;

      const [created] = await db
        .insert(verticalDramaGenrePresets)
        .values({
          title: input.title,
          category:
            row.genre?.trim() ||
            input.title.toLowerCase().replace(/\s+/g, "-").slice(0, 60),
          // Genre presets only support th/en (preset browsing follows the UI
          // language, not the series' own content locale) — clamp any of the
          // wider series locales down to the closer of the two.
          locale: row.locale === "th" ? "th" : "en",
          logline: (bible.logline as string) ?? "",
          mainPlot: (bible.mainPlot as string) ?? "",
          seasonArc: (bible.seasonArc as string) ?? "",
          tone: row.tone ?? "",
          cliffhangerStyle: (bible.cliffhangerStyle as string) ?? "",
          charactersJson: parseCharactersDraft(charactersDraft),
          visualBible: (bible.visualStyle as string) ?? "",
          sortOrder: 0,
          scope: publishGlobally ? "global" : "private",
          tenantId: publishGlobally ? null : tenantId,
          userId: publishGlobally ? null : userId,
        })
        .returning();

      return {
        preset: {
          id: String(created.id),
          title: created.title,
          scope: created.scope,
        },
      };
    }),

  /**
   * PERMANENTLY delete an owned series and every child row (episodes,
   * storyboard/shot references, character stock + reference links, episode
   * runs/artifacts/checkpoints, memory events/snapshots, QC reports).
   *
   * All ten child tables that reference `vertical_drama_series.id` are
   * declared with `onDelete: "cascade"` in `drizzle/schema.ts`, so deleting
   * the parent row inside a transaction is sufficient for the database to
   * remove every dependent row atomically — there is nothing to manually
   * cascade. This mutation still runs inside `db.transaction` so the
   * pre-delete COUNT aggregates (used for the confirmation toast) and the
   * delete itself observe a single consistent snapshot.
   *
   * `media_assets` rows are NEVER deleted — only the link rows in
   * `vertical_drama_character_assets` / `vertical_drama_shot_references`
   * that reference them are removed by the cascade; the underlying media
   * library assets remain untouched and reusable by other series/features.
   *
   * Defense-in-depth: in addition to the standard ownership guard, the
   * caller must pass `confirmName` matching the series title exactly
   * (case-sensitive, no trimming) or the mutation is rejected before any
   * row is touched. This mirrors the client's "type the series name to
   * confirm" dialog so a scripted/replayed request can't skip that guard.
   */
  deleteSeries: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        confirmName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise — never
      // discloses existence of another tenant's/user's series).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      if (input.confirmName !== row.title) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Series name confirmation does not match — deletion aborted",
        });
      }

      const counts = await db.transaction(async tx => {
        const [
          [episodesAgg],
          [charactersAgg],
          [characterAssetsAgg],
          [shotReferencesAgg],
          [episodeRunsAgg],
          [runArtifactsAgg],
          [approvalCheckpointsAgg],
          [memoryEventsAgg],
          [memorySnapshotsAgg],
          [qcReportsAgg],
        ] = await Promise.all([
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaEpisodes)
            .where(
              and(
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaCharacters)
            .where(
              and(
                eq(verticalDramaCharacters.tenantId, tenantId),
                eq(verticalDramaCharacters.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaCharacterAssets)
            .where(
              and(
                eq(verticalDramaCharacterAssets.tenantId, tenantId),
                eq(verticalDramaCharacterAssets.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaShotReferences)
            .where(
              and(
                eq(verticalDramaShotReferences.tenantId, tenantId),
                eq(verticalDramaShotReferences.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaEpisodeRuns)
            .where(
              and(
                eq(verticalDramaEpisodeRuns.tenantId, tenantId),
                eq(verticalDramaEpisodeRuns.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaRunArtifacts)
            .where(
              and(
                eq(verticalDramaRunArtifacts.tenantId, tenantId),
                eq(verticalDramaRunArtifacts.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaApprovalCheckpoints)
            .where(
              and(
                eq(verticalDramaApprovalCheckpoints.tenantId, tenantId),
                eq(verticalDramaApprovalCheckpoints.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaMemoryEvents)
            .where(
              and(
                eq(verticalDramaMemoryEvents.tenantId, tenantId),
                eq(verticalDramaMemoryEvents.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaMemorySnapshots)
            .where(
              and(
                eq(verticalDramaMemorySnapshots.tenantId, tenantId),
                eq(verticalDramaMemorySnapshots.seriesId, seriesId)
              )
            ),
          tx
            .select({ count: sql<number>`COUNT(*)` })
            .from(verticalDramaQcReports)
            .where(
              and(
                eq(verticalDramaQcReports.tenantId, tenantId),
                eq(verticalDramaQcReports.seriesId, seriesId)
              )
            ),
        ]);

        const episodesDeleted = Number(episodesAgg?.count ?? 0);
        const charactersDeleted = Number(charactersAgg?.count ?? 0);
        const characterAssetsDeleted = Number(characterAssetsAgg?.count ?? 0);
        const shotReferencesDeleted = Number(shotReferencesAgg?.count ?? 0);
        const episodeRunsDeleted = Number(episodeRunsAgg?.count ?? 0);
        const runArtifactsDeleted = Number(runArtifactsAgg?.count ?? 0);
        const approvalCheckpointsDeleted = Number(
          approvalCheckpointsAgg?.count ?? 0
        );
        const memoryEventsDeleted = Number(memoryEventsAgg?.count ?? 0);
        const memorySnapshotsDeleted = Number(memorySnapshotsAgg?.count ?? 0);
        const qcReportsDeleted = Number(qcReportsAgg?.count ?? 0);

        // Deleting the parent row cascades to every child table above at
        // the database level (all declared `onDelete: "cascade"` on
        // `seriesId`) — `media_assets` rows themselves are never touched.
        await tx
          .delete(verticalDramaSeries)
          .where(seriesOwnershipWhere(tenantId, userId, seriesId));

        return {
          episodesDeleted,
          charactersDeleted,
          characterAssetsDeleted,
          shotReferencesDeleted,
          episodeRunsDeleted,
          runArtifactsDeleted,
          approvalCheckpointsDeleted,
          memoryEventsDeleted,
          memorySnapshotsDeleted,
          qcReportsDeleted,
        };
      });

      return { deleted: true, seriesId: input.seriesId, ...counts };
    }),

  /**
   * Submit a series-level narrated trailer compile job (Bible tab "series
   * trailer" feature, 2026-07-07). The client already generated the narration
   * voice-over via `media.generateAudio` (same pattern as Media Studio) —
   * possibly in several chunks when the script exceeds the TTS model's prompt
   * limit — and hands us the ordered `audioUrls` (+ total duration, if known)
   * here; the assembly job concatenates the parts into one track. This
   * procedure gathers the visual sources SERVER-SIDE (never trusts the client
   * to supply media URLs) and kicks off the background ffmpeg assembly job.
   *
   * Idempotent while a job is already in flight: if `series.trailer.status
   * === "processing"` and that job is still tracked in-process, the existing
   * `jobId` is returned instead of double-submitting (protects against
   * double-click / duplicate mutation calls before the first poll observes
   * completion).
   */
  generateTrailer: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        audioUrls: z.array(z.string().min(1)).min(1).max(12),
        audioDurationSeconds: z.number().positive().optional(),
        idempotencyKey: z.string().trim().min(1).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);

      const existingTrailer =
        seriesRow.trailer as VerticalDramaSeriesTrailerState | null;
      if (existingTrailer?.status === "processing" && existingTrailer.jobId) {
        const liveJob = getTrailerJobStatus(existingTrailer.jobId);
        if (liveJob && liveJob.status === "processing") {
          return {
            jobId: existingTrailer.jobId,
            imageCount: 0,
            videoClipCount: 0,
            resumed: true,
          };
        }
      }

      const episodeRows = await db
        .select({
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          startFramePlan: verticalDramaEpisodes.startFramePlan,
          motionPromptPack: verticalDramaEpisodes.motionPromptPack,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      const isUsableUrl = (url: string | undefined | null): url is string =>
        !!url &&
        (/^https?:\/\//i.test(url) ||
          url.startsWith("/api/storage") ||
          url.startsWith("/uploads"));

      // --- Images: episode 1 first (all of its approved/angle-grid images),
      // then a sample from the other episodes, in episode order. ---
      const approvedAssetIds = new Set<number>();
      const episodeOneImageUrls: string[] = [];
      const otherEpisodeImageUrls: string[] = [];

      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            if (Number.isFinite(parsed)) approvedAssetIds.add(parsed);
          }
        }
      }

      // Resolve approvedMediaAssetId -> originalUrl in one batched query, then
      // bucket by episode number using a second light per-episode lookup
      // (small dataset — vertical drama series have a handful of episodes).
      const assetUrlById = new Map<number, string>();
      if (approvedAssetIds.size > 0) {
        const assetRows = await db
          .select({ id: mediaAssets.id, url: mediaAssets.originalUrl })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, userId),
              inArray(mediaAssets.id, Array.from(approvedAssetIds))
            )
          );
        for (const row of assetRows) {
          if (row.url) assetUrlById.set(row.id, row.url);
        }
      }

      for (const row of episodeRows) {
        const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
        const isEpisodeOne = row.episodeNumber === 1;
        const bucket = isEpisodeOne
          ? episodeOneImageUrls
          : otherEpisodeImageUrls;
        for (const frame of plan?.frames ?? []) {
          if (frame.approvedMediaAssetId) {
            const parsed = Number(frame.approvedMediaAssetId);
            const url = Number.isFinite(parsed)
              ? assetUrlById.get(parsed)
              : undefined;
            if (isUsableUrl(url)) bucket.push(url);
          } else if (
            frame.angleGrid?.imageUrl &&
            isUsableUrl(frame.angleGrid.imageUrl)
          ) {
            bucket.push(frame.angleGrid.imageUrl);
          }
        }
      }

      // Shuffle the "other episodes" bucket (deterministic-enough Fisher-Yates)
      // so a long series doesn't just show episodes 2/3 repeatedly.
      for (let i = otherEpisodeImageUrls.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherEpisodeImageUrls[i], otherEpisodeImageUrls[j]] = [
          otherEpisodeImageUrls[j],
          otherEpisodeImageUrls[i],
        ];
      }
      const imageUrls = [...episodeOneImageUrls, ...otherEpisodeImageUrls];

      // --- Video clips: episode 1 first, then others, completed only. ---
      const episodeOneClipUrls: string[] = [];
      const otherEpisodeClipUrls: string[] = [];
      for (const row of episodeRows) {
        const pack =
          row.motionPromptPack as VerticalDramaMotionPromptPack | null;
        const bucket =
          row.episodeNumber === 1 ? episodeOneClipUrls : otherEpisodeClipUrls;
        for (const clip of pack?.clips ?? []) {
          const url = clip.videoTask?.videoUrl;
          if (isUsableUrl(url)) bucket.push(url);
        }
      }
      const videoClipUrls = [...episodeOneClipUrls, ...otherEpisodeClipUrls];

      if (imageUrls.length === 0 && videoClipUrls.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No episode images or video clips are available yet to build a trailer — generate at least one episode's start frames or video clips first.",
        });
      }

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl =
        runtimeConfig.internalNodeUrl ||
        ctx.publicUrl ||
        "http://localhost:3000";

      const { jobId } = await submitTrailerJob({
        owner: { tenantId, userId, seriesId },
        audioUrls: input.audioUrls,
        audioDurationSeconds: input.audioDurationSeconds,
        imageUrls,
        videoClipUrls,
        internalBaseUrl,
      });

      return {
        jobId,
        imageCount: imageUrls.length,
        videoClipCount: videoClipUrls.length,
        resumed: false,
      };
    }),

  /**
   * Poll the series trailer job status. Returns `null` when no trailer has
   * ever been generated for this series (client treats `null` as "idle" —
   * show the generate button, not an error state).
   */
  getTrailerStatus: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const trailer = row.trailer as VerticalDramaSeriesTrailerState | null;
      return trailer ?? null;
    }),

  /**
   * Season batch render (task #21 / W12.5 "Final Render Suite" phase B,
   * added 2026-07-09) — submits an `assembleEpisodeVideo`-equivalent job for
   * EVERY episode in the series that is ready (has at least one completed
   * clip; honors `options.allowPartial` the same way the single-episode
   * mutation's own `allowPartial` does — per episode), sharing ONE
   * `subtitlePreset`/`includeDialogueAudio`/`loudnessNormalize` option set
   * across the whole batch. Per-episode subtitle/audio CONTENT still comes
   * from each episode's own persisted `dialogueAudioPlan` — only the PRESET
   * CHOICE and the audio/loudness toggles are shared, matching the "one
   * shared options dialog" UI design for this feature.
   *
   * Explicitly EXCLUDES ad banners in this wave (documented scope decision,
   * not silently dropped): per-episode ad banner feeding
   * (`resolveEpisodeAdBannerRunInputs`) is ROUTER-LOCAL to
   * `verticalDramaEpisodes.ts`, with a deliberately lazy-loaded,
   * approval-gated dependency chain (see that router's own Ad Banner
   * Overlay import-block doc comment for why). This router must NEVER
   * import the episodes router — both files rely on staying importable with
   * only their OWN narrow `vi.mock` graph in their sibling test suites (see
   * both routers' own doc comments on that convention) — and relocating the
   * banner resolver into a shared service so both routers could call it is a
   * larger, separate refactor, out of this wave's scope. Banners remain
   * fully available via the existing per-episode `assembleEpisodeVideo` flow;
   * a season-wide caller that also wants banners can still call that
   * mutation per episode.
   *
   * Sequencing: every ready episode's job is minted immediately (the caller
   * sees every episode as "queued" right away — same synchronous-persist
   * convention as a single `assembleEpisodeVideo`/`submitAssemblyJob` call),
   * but the underlying ffmpeg RUNS are chained ONE AT A TIME in the
   * background via `submitSequentialAssemblyJobs`
   * (`verticalDramaEpisodeVideoAssembly.ts`) — see that function's own doc
   * comment for the full "why sequential, not parallel" rationale. A
   * per-episode failure never stops the rest of the season (continue-on-
   * failure, both at the precondition-check stage below and inside the
   * sequential ffmpeg chain itself).
   *
   * NO upload/publish/scheduling of any kind — explicitly excluded by the
   * owner for this whole feature (task #21).
   *
   * Progress: the client polls each returned episode's EXISTING
   * `assemblyManifest.compiledVideo` status the same way the single-episode
   * workspace flow already does (via `getEpisodeDetail`) — this mutation
   * intentionally does NOT add a new batch-level polling endpoint.
   */
  assembleSeasonVideos: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        options: z
          .object({
            allowPartial: z.boolean().optional(),
            includeDialogueAudio: z.boolean().optional(),
            loudnessNormalize: z.boolean().optional(),
            subtitlePreset: z
              .union([
                HyperframesFinalCompositeSubtitlePresetSchema,
                z.literal("none"),
              ])
              .optional(),
            // Task #34 (Text Overlay Suite) — batch-level toggles
            // (plan.md "batch season render: toggle รวม 'ใส่ข้อความตามแผน
            // ของแต่ละตอน'" + "batch ตาม" for the watermark). Both default
            // to "apply" (`!== false`); an explicit `false` skips that whole
            // feed for the WHOLE batch without touching any saved plan.
            applyTextOverlays: z.boolean().optional(),
            applyWatermark: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const options = input.options ?? {};

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);

      const episodeRows = await db
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          title: verticalDramaEpisodes.title,
          motionPromptPack: verticalDramaEpisodes.motionPromptPack,
          dialogueAudioPlan: verticalDramaEpisodes.dialogueAudioPlan,
          // Task #34 — needed for per-episode text-overlay/character-intro
          // resolution below.
          startFramePlan: verticalDramaEpisodes.startFramePlan,
          textOverlayPlan: verticalDramaEpisodes.textOverlayPlan,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .orderBy(asc(verticalDramaEpisodes.episodeNumber));

      if (episodeRows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This series has no Sub-episodes yet.",
        });
      }

      // Lazy-loaded — see this procedure's own doc comment + this file's Ad
      // Banner Overlay import-block doc comment for why.
      const {
        extractClipSourcesFromMotionPromptPack,
        resolveClipsForAssembly,
        compiledVideoFilename,
        resolveEpisodeDialogueAudioAndSubtitlesRunInputs,
        submitSequentialAssemblyJobs,
      } = await import("../services/verticalDramaEpisodeVideoAssembly");

      // Small, deliberate duplication of `verticalDramaEpisodes.ts`'s own
      // `resolveVerticalDramaVoiceChainFlag` (a 2-line tenant-flag read) —
      // this router must never import the episodes router (see this
      // procedure's own doc comment), so it isn't worth relocating into a
      // shared service for just this.
      const flags = await getTenantFeatureFlags(tenantId);
      const voiceChainEnabled = flags?.verticalDramaSeriesVoiceChain === true;
      // F131AB (task #34) — mirrors `resolveVerticalDramaTextOverlaySuiteFlag`
      // above.
      const textOverlaySuiteEnabled =
        await resolveVerticalDramaTextOverlaySuiteFlag(tenantId);
      const applyTextOverlays =
        textOverlaySuiteEnabled && options.applyTextOverlays !== false;
      const applyWatermark =
        textOverlaySuiteEnabled && options.applyWatermark !== false;
      // Task #34 — SHARED resolution service (see that file's own header doc
      // comment for why it is safe/deliberate for this router to depend on
      // it — a plain service-to-service dependency, not a cross-ROUTER one).
      const { resolveVdEpisodeTextOverlayEngineInputs } =
        await import("../services/verticalDramaTextOverlayResolution");

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl =
        runtimeConfig.internalNodeUrl ||
        ctx.publicUrl ||
        "http://localhost:3000";

      const specs: Array<{
        owner: {
          tenantId: string;
          userId: number;
          seriesId: number;
          episodeId: number;
        };
        clips: EpisodeClipSource[];
        filename: string;
        dialogueAudio?: RunAssemblyJobDialogueAudioInput;
        subtitles?: RunAssemblyJobSubtitlesInput;
        watermarkImage?: RunAssemblyJobWatermarkImageInput;
      }> = [];
      const skipped: Array<{ episodeId: string; reason: string }> = [];
      let dialogueAudioSegmentsIncluded = 0;
      let subtitleLinesIncluded = 0;
      let textOverlayEventsIncluded = 0;
      let episodesWithWatermark = 0;

      for (const row of episodeRows) {
        const pack =
          row.motionPromptPack as VerticalDramaMotionPromptPack | null;
        const clipSources: EpisodeClipSource[] =
          extractClipSourcesFromMotionPromptPack(pack);
        if (clipSources.length === 0) {
          skipped.push({
            episodeId: String(row.id),
            reason:
              "No video clips exist for this Sub-episode yet — generate the video motion prompt pack and render clips first.",
          });
          continue;
        }

        let resolvedClips: {
          ordered: EpisodeClipSource[];
          missing: { clipNumber: number }[];
        };
        try {
          resolvedClips = resolveClipsForAssembly(clipSources, {
            allowPartial: options.allowPartial,
          });
        } catch (err) {
          skipped.push({
            episodeId: String(row.id),
            reason:
              err instanceof Error
                ? err.message
                : "Sub-episode video assembly precondition failed",
          });
          continue;
        }

        const dialoguePlan =
          row.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null;
        const dialogueRunInputs =
          resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
            plan: dialoguePlan,
            motionClips: (pack?.clips ?? []).map(
              (c): VdDialogueTimelineClip => ({
                clipNumber: c.clipNumber,
                sourceShotNumbers: c.sourceShotNumbers,
                durationSeconds: c.durationSeconds,
              })
            ),
            includedClipNumbers: resolvedClips.ordered.map(c => c.clipNumber),
            includeDialogueAudio:
              voiceChainEnabled && options.includeDialogueAudio === true,
            loudnessNormalize: options.loudnessNormalize === true,
            subtitlePreset: options.subtitlePreset,
          });
        dialogueAudioSegmentsIncluded +=
          dialogueRunInputs.dialogueAudioSegmentsIncluded;
        subtitleLinesIncluded += dialogueRunInputs.subtitleLinesIncluded;

        // Text Overlay Suite (F131AB, task #34) — additive, flag-gated feed,
        // merged into the SAME `subtitles` object dialogue captions use (see
        // `buildAssSubtitleFile`'s own doc comment for why one `.ass` file
        // safely carries both).
        let combinedSubtitles = dialogueRunInputs.subtitles;
        let episodeWatermarkImage:
          | RunAssemblyJobWatermarkImageInput
          | undefined;
        if (applyTextOverlays || applyWatermark) {
          const plan = applyTextOverlays
            ? parseTextOverlayPlan(row.textOverlayPlan)
            : null;
          const { overlays, watermarkImage, overlaysIncluded } =
            await resolveVdEpisodeTextOverlayEngineInputs({
              owner: { tenantId, userId, seriesId },
              episodeNumber: row.episodeNumber,
              episodeTitle: row.title,
              plan,
              startFramePlan:
                row.startFramePlan as VerticalDramaStartFramePlan | null,
              motionClips: (pack?.clips ?? []).map(
                (c): VdDialogueTimelineClip => ({
                  clipNumber: c.clipNumber,
                  sourceShotNumbers: c.sourceShotNumbers,
                  durationSeconds: c.durationSeconds,
                })
              ),
              includedClipNumbers: resolvedClips.ordered.map(c => c.clipNumber),
              includeWatermark: applyWatermark,
            });
          textOverlayEventsIncluded += overlaysIncluded;
          if (overlays.length > 0) {
            combinedSubtitles = {
              preset:
                dialogueRunInputs.subtitles?.preset ?? "no_subtitle_style",
              lines: dialogueRunInputs.subtitles?.lines ?? [],
              fontsDir: dialogueRunInputs.subtitles?.fontsDir,
              overlays,
            };
          }
          if (watermarkImage) {
            episodeWatermarkImage = watermarkImage;
            episodesWithWatermark += 1;
          }
        }

        specs.push({
          owner: { tenantId, userId, seriesId, episodeId: row.id },
          clips: resolvedClips.ordered,
          filename: compiledVideoFilename({
            seriesId,
            episodeNumber: row.episodeNumber ?? row.id,
            seriesTitle: seriesRow.title ?? undefined,
          }),
          dialogueAudio: dialogueRunInputs.dialogueAudio,
          subtitles: combinedSubtitles,
          watermarkImage: episodeWatermarkImage,
        });
      }

      if (specs.length === 0) {
        return {
          submitted: [],
          skipped,
          dialogueAudioSegmentsIncluded: 0,
          subtitleLinesIncluded: 0,
          textOverlayEventsIncluded: 0,
          episodesWithWatermark: 0,
        };
      }

      const submitted = await submitSequentialAssemblyJobs(
        specs,
        internalBaseUrl
      );

      return {
        submitted: submitted.map(s => ({
          episodeId: String(s.episodeId),
          jobId: s.jobId,
        })),
        skipped,
        dialogueAudioSegmentsIncluded,
        subtitleLinesIncluded,
        // Text Overlay Suite (F131AB, task #34) — cumulative across every
        // submitted episode in this batch. Always `0` when the flag is off
        // or both `applyTextOverlays`/`applyWatermark` were explicitly `false`.
        textOverlayEventsIncluded,
        episodesWithWatermark,
      };
    }),

  /**
   * Production Episodes (Phase D′-1, `planning/vertical-drama-production-episodes/plan.md`)
   * — group `groupSize` (5 or 10) CONSECUTIVE Sub-Episodes' own compiled
   * videos (`episode.assemblyManifest.compiledVideo.videoUrl`) into
   * Production Episodes: ONE concatenated 4-10 minute video PER group — the
   * actual publishable unit (a Sub-Episode is today's ~9-shot "ตอน"; see
   * `memory/project_vd_episode_terminology.md`).
   *
   * All DB loading, precondition checking, chunking, and persistence live in
   * `assembleProductionEpisodesForSeries`
   * (`server/services/verticalDramaProductionEpisodeAssembly.ts`) — this
   * handler only resolves ownership + the internal base URL and maps that
   * service's thrown `Error` (message-prefixed `vertical_drama_production_*`)
   * to `PRECONDITION_FAILED`, same convention as `assembleEpisodeVideo`'s own
   * `resolveClipsForAssembly` catch (`verticalDramaEpisodes.ts`).
   *
   * No dedicated rate limiter here — mirrors EVERY sibling ffmpeg-assembly
   * mutation in this codebase (`assembleSeasonVideos` above,
   * `verticalDramaEpisodes.assembleEpisodeVideo`, `generateTrailer` below):
   * `services/rateLimiter`'s `mediaGenerationLimiter` is reserved for actual
   * PAID provider calls (image/video/audio/ad-banner generation), never for
   * a local ffmpeg concat of already-rendered videos.
   *
   * Idempotent re-assembly: groups already completed with unchanged
   * membership are left untouched by the service (`groupsSkipped`) — safe to
   * call again after compiling more Sub-Episodes without re-doing finished
   * work. Progress: the client polls `verticalDramaSeries.get`'s
   * `productionEpisodesManifest` (this mutation does not add a separate
   * polling endpoint), same convention as `assembleSeasonVideos`.
   *
   * Render-options LEVEL (plan.md "Render-options LEVEL" section, user
   * correction 2026-07-13, Phase D′-2): `renderOptions` carries the SAME
   * styling fields `assembleEpisodeVideo` accepts
   * (`verticalDramaEpisodes.ts`), reusing its exact zod field types/enums
   * (`HyperframesFinalCompositeSubtitlePresetSchema` for `subtitlePreset`,
   * `SUBTITLE_FONT_SIZE_IDS` for `subtitleFontSize`) rather than retyping
   * them — so styling is configured ONCE per Production Episode and applied
   * UNIFORMLY across every Sub-Episode in the group, instead of per
   * Sub-Episode. Omitted (every pre-existing caller) preserves D′-1 behavior
   * exactly. See `ProductionEpisodeRenderOptions` and
   * `assembleProductionEpisodesForSeries`'s own doc comments
   * (`server/services/verticalDramaProductionEpisodeAssembly.ts`) for how
   * this threads into a per-Sub-Episode re-render.
   *
   * Phase C-2 (`planning/vertical-drama-production-render/plan.md` Phase C,
   * "overlays generalization"): `overlays` carries an UNLIMITED (capped at
   * `VD_PRODUCTION_OVERLAY_MAX_COUNT`), caller-authored list of ad-hoc timed
   * text overlays (`{atSeconds, durationSeconds, text, style}`), burned in
   * (folded with `credits` into ONE re-encode when both are supplied — see
   * `runProductionEpisodeGroupJob`'s own doc comment) AFTER the bgm post-pass
   * (if any). Omitted (or an empty array — every pre-existing caller)
   * preserves prior behavior exactly. See
   * `assembleProductionEpisodesForSeries`'s own `overlays` doc comment.
   */
  assembleProductionEpisodes: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        groupSize: z.union([z.literal(5), z.literal(10)]),
        allowPartial: z.boolean().optional(),
        renderOptions: z
          .object({
            subtitlePreset: z
              .union([
                HyperframesFinalCompositeSubtitlePresetSchema,
                z.literal("none"),
              ])
              .optional(),
            subtitleFontSize: z.enum(SUBTITLE_FONT_SIZE_IDS).optional(),
            showAgeBadge: z.boolean().optional(),
            includeDialogueAudio: z.boolean().optional(),
            loudnessNormalize: z.boolean().optional(),
          })
          .optional(),
        // Phase B-1 (`planning/vertical-drama-production-render/plan.md`
        // Phase B) — BGM bed + ducking, attached at the PRODUCTION EPISODE
        // level (never per Sub-Episode). `url` uses `z.string()` (not
        // `.url()`), same relative-path tolerance as `VdBgmTrack.url`
        // (`@shared/verticalDramaSeries/standout.ts`) and every other asset
        // URL field in this codebase. Omitted entirely preserves prior
        // behavior exactly (no second ffmpeg pass) — see
        // `assembleProductionEpisodesForSeries`'s own `bgm` doc comment.
        bgm: z
          .object({
            url: z.string().min(1).max(2048),
            volumePercent: z.number().min(1).max(100).default(35),
            duckUnderVideoAudio: z.boolean().default(true),
          })
          .optional(),
        // Phase C-1 (`planning/vertical-drama-production-render/plan.md`
        // Phase C) — an OPTIONAL scrolling credits roll, attached at the
        // PRODUCTION EPISODE level (never per Sub-Episode), burned in as a
        // post-pass AFTER the bgm post-pass (if any). Multi-line: one
        // name/role per line. Omitted entirely preserves prior behavior
        // exactly (no credits pass) — see
        // `assembleProductionEpisodesForSeries`'s own `credits` doc comment.
        credits: z
          .object({
            text: z.string().min(1).max(4000),
          })
          .optional(),
        // Phase C-2 (`planning/vertical-drama-production-render/plan.md`
        // Phase C, "overlays generalization") — an UNLIMITED (capped),
        // caller-authored list of ad-hoc timed text overlays, attached at the
        // PRODUCTION EPISODE level (never per Sub-Episode), burned in as a
        // post-pass alongside credits (folded into ONE re-encode when BOTH
        // are supplied — see `runProductionEpisodeGroupJob`'s own doc
        // comment). `style` reuses none of this codebase's existing preset/
        // position enums (see `verticalDramaFinalRenderGraph.ts`'s own "Style
        // enum decision" doc comment) — a small dedicated
        // `VD_PRODUCTION_OVERLAY_STYLES` enum instead. Omitted entirely (or
        // an EMPTY array) preserves prior behavior exactly (no overlays
        // pass) — see `assembleProductionEpisodesForSeries`'s own `overlays`
        // doc comment.
        overlays: z
          .array(
            z.object({
              atSeconds: z.number().min(0).max(3600),
              durationSeconds: z.number().min(1).max(30).default(3),
              text: z.string().min(1).max(300),
              style: z.enum(VD_PRODUCTION_OVERLAY_STYLES).default("centered"),
            })
          )
          .max(VD_PRODUCTION_OVERLAY_MAX_COUNT)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ensure the caller owns it (throws NOT_FOUND otherwise).
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl =
        runtimeConfig.internalNodeUrl ||
        ctx.publicUrl ||
        "http://localhost:3000";

      // Lazy-loaded — same "narrow vi.mock sibling test" convention this
      // file's Season Batch Render / Ad Banner Overlay import blocks
      // document for themselves: the real values from
      // `verticalDramaProductionEpisodeAssembly.ts` (transitively
      // `../storage` + spawns ffmpeg, exactly like
      // `verticalDramaEpisodeVideoAssembly.ts`) are loaded INSIDE this
      // handler, never as a static top-level import.
      const { assembleProductionEpisodesForSeries } =
        await import("../services/verticalDramaProductionEpisodeAssembly");

      try {
        const result = await assembleProductionEpisodesForSeries({
          tenantId,
          userId,
          seriesId,
          groupSize: input.groupSize,
          allowPartial: input.allowPartial,
          internalBaseUrl,
          seriesTitle: seriesRow.title ?? undefined,
          renderOptions: input.renderOptions,
          bgm: input.bgm,
          credits: input.credits,
          overlays: input.overlays,
        });
        return {
          groupsCreated: result.groupsCreated,
          groupsSkipped: result.groupsSkipped,
          manifest: result.manifest,
        };
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Production Episode assembly precondition failed",
        });
      }
    }),

  /**
   * Approve an `arc_replan_proposal` memory event (spec §7.7.3, section-13).
   * Series-scoped, so it lives BESIDE `verticalDramaEpisodes.ts`'s retcon
   * procedures it mirrors (`proposeRetcon`/`approveRetconProposal`/
   * `rejectRetconProposal`) — same ownership re-check, feature-flag gate
   * (base `verticalDramaSeries` + `verticalDramaSeriesArcReplan`),
   * idempotency key, and NOT_FOUND-never-FORBIDDEN cross-tenant contract.
   *
   * Applies the approved proposal via the pure, DB-free
   * `applyApprovedArcReplan` (`verticalDramaArcReplan.ts`) — appends a NEW
   * breakdown version onto the series bible (never mutates a prior version
   * or any already-produced episode entry, spec §7.7.3 hard rule 4),
   * persists the returned bible, then appends an `arc_replan_applied`
   * memory event recording the decision (append-only; the proposal event
   * itself is never mutated — mirrors retcon's approval exactly).
   */
  approveArcReplanProposal: verticalDramaArcReplanProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const proposalEventId = Number(input.proposalEventId);
      if (!Number.isFinite(proposalEventId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid proposal event id",
        });
      }

      // Ownership re-check (throws NOT_FOUND otherwise — never discloses
      // existence of another tenant's/user's series).
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);
      const proposalRow = await loadArcReplanProposalEvent(
        tenantId,
        seriesId,
        proposalEventId
      );

      const parsedProposal = verticalDramaArcReplanProposalSchema.safeParse(
        proposalRow.payload
      );
      if (!parsedProposal.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Arc re-plan proposal payload is invalid or corrupted",
        });
      }

      // `verticalDramaArcReplanProposalSchema.proposedBreakdown` reuses the
      // STORAGE-tolerant breakdown-item schema (`contentBudget` optional —
      // shared with legacy stored breakdowns elsewhere), but a genuine
      // arc-replan proposal ALWAYS carries one per item (`buildArcReplanProposal`,
      // spec §7.7.3, only ever builds from `VerticalDramaEpisodeBreakdownItem[]`
      // where it is required). This defensive check narrows the type for
      // `applyApprovedArcReplan` below AND catches a corrupted/hand-crafted
      // proposal before it can silently drop a budget.
      const missingBudgetItem = parsedProposal.data.proposedBreakdown.find(
        item => !item.contentBudget
      );
      if (missingBudgetItem) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Arc re-plan proposal is missing contentBudget for episode ${missingBudgetItem.episodeNumber}`,
        });
      }

      const existingDecision = await findArcReplanDecision(
        tenantId,
        userId,
        seriesId,
        proposalRow.id
      );
      if (existingDecision) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Arc re-plan proposal has already been ${existingDecision}`,
        });
      }

      const approvedProposal: VerticalDramaArcReplanProposal = {
        ...parsedProposal.data,
        proposedBreakdown: parsedProposal.data
          .proposedBreakdown as VerticalDramaEpisodeBreakdownItem[],
        status: "approved",
      };

      let nextBible: Record<string, unknown>;
      try {
        nextBible = applyApprovedArcReplan(
          (seriesRow.bible as Record<string, unknown> | null) ?? null,
          approvedProposal,
          userId
        );
      } catch (error) {
        if (error instanceof VerticalDramaArcReplanGuardViolationError) {
          // Tie-in-replan guard (task #31, spec §7.7.3) — the proposal claims
          // to only move a `tieIn` placement but touches story content.
          // Persist the audit trail via the same memory ledger the proposal
          // itself lives in (the service stays pure/DB-free by design — see
          // `VerticalDramaArcReplanGuardViolationError`'s doc comment), then
          // surface a typed failure. The proposal is left in `proposed`
          // status so the user can inspect and reject it manually.
          await verticalDramaSeriesMemoryService
            .appendEvent({
              tenantId,
              userId,
              seriesId,
              memoryKind: "continuity_warning",
              payload: {
                guard: error.code,
                proposalId: error.proposalId,
                violations: error.violations,
              },
              summaryText: `Arc re-plan proposal ${error.proposalId} rejected by tie-in guard — non-tieIn fields changed on episode(s) ${error.violations.map(v => v.episodeNumber).join(", ")}`,
            })
            .catch(() => {});
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "ข้อเสนอย้ายสินค้าถูกปฏิเสธโดยระบบตรวจสอบ: มีการแก้ไขเนื้อเรื่องปะปนมากับการย้ายตำแหน่งสินค้า (แก้ได้เฉพาะตำแหน่งสินค้าเท่านั้น) — ตรวจสอบและปฏิเสธข้อเสนอนี้ได้จากการ์ดแผนซีซั่น",
          });
        }
        throw error;
      }

      const [updatedRow] = await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      const event = await verticalDramaSeriesMemoryService.appendEvent({
        tenantId,
        userId,
        seriesId,
        memoryKind: "arc_replan_applied",
        payload: {
          arcReplanApprovalOf: String(proposalRow.id),
          proposalId: approvedProposal.proposalId,
          triggeredByEpisodeNumber: approvedProposal.triggeredByEpisodeNumber,
          affectedEpisodeNumbers: approvedProposal.affectedEpisodeNumbers,
          driftReasons: approvedProposal.driftReasons,
        },
        summaryText: `Arc re-plan approved — future episodes ${approvedProposal.affectedEpisodeNumbers.join(", ")} re-planned`,
        approved: true,
        approvedByUserId: userId,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        series: { ...updatedRow, id: String(updatedRow.id) },
        event,
      };
    }),

  /**
   * Reject an `arc_replan_proposal` memory event (spec §7.7.3, section-13).
   * Mirrors `rejectRetconProposal` exactly: appends a rejection outcome
   * event; every prior event (including the proposal itself) is left
   * untouched. The old plan stands — future episodes keep planning from the
   * CURRENT active breakdown version, with a standing continuity warning
   * (surfaced by the memory/UI layer from this rejection event, not
   * constructed here).
   */
  rejectArcReplanProposal: verticalDramaArcReplanProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        proposalEventId: z.string().min(1),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const proposalEventId = Number(input.proposalEventId);
      if (!Number.isFinite(proposalEventId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid proposal event id",
        });
      }

      // Ownership re-check (throws NOT_FOUND otherwise).
      await loadOwnedSeries(tenantId, userId, seriesId);
      const proposalRow = await loadArcReplanProposalEvent(
        tenantId,
        seriesId,
        proposalEventId
      );

      const existingDecision = await findArcReplanDecision(
        tenantId,
        userId,
        seriesId,
        proposalRow.id
      );
      if (existingDecision) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Arc re-plan proposal has already been ${existingDecision}`,
        });
      }

      const event = await verticalDramaSeriesMemoryService.appendEvent({
        tenantId,
        userId,
        seriesId,
        // Reuses the EXISTING "arc_replan_proposal" kind for the rejection
        // marker — mirrors `rejectRetconProposal`'s own convention of
        // reusing the proposal's kind for its rejection event (no new kind
        // literal needed here, unlike the approval path above).
        memoryKind: "arc_replan_proposal" as VerticalDramaMemoryKind,
        payload: {
          arcReplanRejectionOf: String(proposalRow.id),
          decision: "rejected",
        },
        summaryText: "Arc re-plan proposal rejected — prior plan stands",
        approved: false,
        approvedByUserId: userId,
        idempotencyKey: input.idempotencyKey,
      });

      return { event };
    }),

  /**
   * Ad Banner Overlay (F131W, #30-A) — run the `vertical-drama-ad-banner-prompt`
   * skill for one banner design and persist the result onto
   * `productTieIn.adBanners[i].prompt.generated`/`.negative`
   * (`status: "prompt_ready"`). Deliberately does NOT go through
   * `sanitizeBrandMentionsInPrompt`/`VD_PRODUCT_LOCK_INSTRUCTION` — see
   * `verticalDramaAdBanner.ts`'s header doc comment (plan.md §1). Also
   * (re)stamps `approval.required` from the series' CURRENT
   * `regulatedCategory`/`requireHumanApproval` so the studio can show the
   * "ต้องอนุมัติก่อนใช้" badge as soon as a prompt exists, without waiting for
   * the image-generation step to discover the gate.
   */
  generateAdBannerPrompt: verticalDramaProcedure
    .input(adBannerScopeInput)
    .mutation(async ({ ctx, input }) => {
      // Lazy-loaded (see this file's Ad Banner Overlay import-block doc
      // comment) — `services/rateLimiter` is checked FIRST, fail-fast,
      // before any DB read or paid call.
      const { mediaGenerationLimiter } =
        await import("../services/rateLimiter");
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const { rawProductTieIn, banners, bannerIndex, banner } =
        await loadOwnedAdBanner(tenantId, userId, seriesId, input.bannerId);
      ensureAdBannerDesignsWithinLimits(banners);

      const stylePreset = getAdBannerStylePreset(banner.stylePresetId);
      const placement = getAdBannerPlacementPreset(banner.placementId);
      const productContext = readAdBannerProductContext(rawProductTieIn);

      const {
        generateAdBannerPrompt: generateAdBannerPromptService,
        resolveAdBannerProductReferenceImageUrls,
        resolveAdBannerApprovalGate,
        AdBannerRateLimitExceededError,
        VdAdBannerForbiddenClaimError,
      } = await import("../services/verticalDramaAdBanner");

      const referenceImageUrls = await resolveAdBannerProductReferenceImageUrls(
        rawProductTieIn,
        {
          userId,
          tenantId,
        }
      );

      let result;
      try {
        result = await generateAdBannerPromptService({
          userId,
          tenantId,
          seriesId,
          bannerId: banner.id,
          product: {
            name: productContext.name,
            category: productContext.category,
            copy: banner.copy,
            forbiddenClaims: productContext.forbiddenClaims,
          },
          stylePreset,
          placement,
          sideAlign: banner.sideAlign,
          referenceImageUrls,
        });
      } catch (err) {
        if (err instanceof AdBannerRateLimitExceededError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        }
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof VdAdBannerForbiddenClaimError) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message: err.message,
          });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Ad banner prompt generation failed",
        });
      }

      const isRegulatedGate = resolveAdBannerApprovalGate(
        productContext.regulatedCategory,
        productContext.requireHumanApproval
      );

      const nextBanner: VdAdBannerDesign = {
        ...banner,
        prompt: {
          ...banner.prompt,
          generated: result.imagePrompt,
          negative: result.negativePrompt,
        },
        status: "prompt_ready",
        approval: {
          required: isRegulatedGate,
          ...(banner.approval?.approvedBy
            ? { approvedBy: banner.approval.approvedBy }
            : {}),
          ...(banner.approval?.approvedAt
            ? { approvedAt: banner.approval.approvedAt }
            : {}),
        },
      };
      const nextBanners = banners.slice();
      nextBanners[bannerIndex] = nextBanner;
      await persistAdBannerDesigns(
        tenantId,
        userId,
        seriesId,
        rawProductTieIn,
        nextBanners
      );

      return {
        banner: nextBanner,
        textInImage: result.textInImage,
        compositionNotes: result.compositionNotes,
        complianceNotes: result.complianceNotes,
        model: result.model,
        creditsUsed: result.creditsUsed,
      };
    }),

  /**
   * Ad Banner Overlay (F131W, #30-A) — render one banner design's approved
   * prompt into an actual image via `mediaGenerationService`'s async image
   * path, mirroring `verticalDramaCharacters.ts`'s `generateCharacterImage`
   * credit lifecycle exactly (pre-flight price + credit check -> reserve ->
   * submit -> refund on submit failure). Guards, in order: a prompt must
   * exist (`prompt.final` wins over `prompt.generated`), the combined
   * prompt+copy text must not contain a forbidden claim, and — when this
   * series' product is in a regulated category AND requires human approval
   * — the banner must already be approved (`approval.approvedAt` set,
   * persisted by the client's merge-patch "อนุมัติ" action) before any paid
   * generation runs (plan.md §1, §8).
   */
  generateAdBannerImage: verticalDramaProcedure
    .input(adBannerScopeInput)
    .mutation(async ({ ctx, input }) => {
      // Lazy-loaded (see this file's Ad Banner Overlay import-block doc
      // comment) — checked FIRST, fail-fast, before any DB read or paid call.
      const { mediaGenerationLimiter } =
        await import("../services/rateLimiter");
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const { rawProductTieIn, banners, bannerIndex, banner } =
        await loadOwnedAdBanner(tenantId, userId, seriesId, input.bannerId);
      ensureAdBannerDesignsWithinLimits(banners);

      const promptText = banner.prompt.final || banner.prompt.generated;
      if (!promptText) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate (or write) a prompt before generating the banner image",
        });
      }

      const productContext = readAdBannerProductContext(rawProductTieIn);
      const combinedText = [
        promptText,
        banner.copy.headline,
        banner.copy.subtext,
        banner.copy.priceText,
        banner.copy.ctaText,
      ]
        .filter((v): v is string => Boolean(v))
        .join(" \n ");
      if (
        containsForbiddenClaim(combinedText, productContext.forbiddenClaims)
      ) {
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message:
            "VD_AD_BANNER_FORBIDDEN_CLAIM: the banner prompt/copy contains a forbidden claim",
        });
      }

      const {
        resolveAdBannerImageModelPricing,
        submitAdBannerImageGeneration: submitAdBannerImageGenerationService,
        resolveAdBannerProductReferenceImageUrls,
        resolveAdBannerApprovalGate,
      } = await import("../services/verticalDramaAdBanner");

      const isRegulatedGate = resolveAdBannerApprovalGate(
        productContext.regulatedCategory,
        productContext.requireHumanApproval
      );
      if (isRegulatedGate && !banner.approval?.approvedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "VD_AD_BANNER_APPROVAL_REQUIRED: this banner's product category requires human approval before generating the image",
        });
      }

      const { DEFAULT_MODELS } =
        await import("../services/mediaGenerationService");
      const modelId = banner.generation.modelId || DEFAULT_MODELS.image;
      const pricing = await resolveAdBannerImageModelPricing(modelId);
      const shouldChargeImageCredits = pricing.creditCost > 0;
      if (shouldChargeImageCredits) {
        const hasCredits = await hasEnoughCredits(userId, pricing.creditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for banner image render. Required: ${pricing.creditCost}`,
          });
        }
      }

      const referenceImageUrls = await resolveAdBannerProductReferenceImageUrls(
        rawProductTieIn,
        {
          userId,
          tenantId,
        }
      );

      // Credits are RESERVED now; `getAdBannerImageStatus` reconciles once
      // the task completes/fails, same convention as `generateCharacterImage`.
      if (shouldChargeImageCredits) {
        await deductCredits({
          userId,
          tenantId,
          amount: pricing.creditCost,
          description: `Vertical Drama — generate ad banner image (series #${seriesId}, banner ${banner.id}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_ad_banner",
            seriesId,
            bannerId: banner.id,
            type: "reservation",
            creditCost: pricing.creditCost,
            modelId,
          },
        });
      }

      const userToken = await getAdBannerMediaUserToken(ctx);
      let submitResult;
      try {
        submitResult = await submitAdBannerImageGenerationService({
          userId,
          seriesId,
          bannerId: banner.id,
          prompt: promptText,
          negativePrompt: banner.prompt.negative,
          modelId,
          aspectRatio: banner.generation.aspectRatio,
          size: banner.generation.size,
          referenceImageUrls,
          maxReferenceImages: pricing.maxReferenceImages,
          publicUrl: ctx.publicUrl ?? undefined,
          userToken,
        });
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: pricing.creditCost,
            description: `Refund: ad banner image render failed to submit (banner ${banner.id})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_ad_banner",
              seriesId,
              bannerId: banner.id,
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Ad banner image generation failed to submit",
        });
      }

      const nextBanner: VdAdBannerDesign = {
        ...banner,
        status: "generating",
        pendingTaskId: submitResult.taskId,
      };
      const nextBanners = banners.slice();
      nextBanners[bannerIndex] = nextBanner;
      await persistAdBannerDesigns(
        tenantId,
        userId,
        seriesId,
        rawProductTieIn,
        nextBanners
      );

      return {
        taskId: submitResult.taskId,
        creditCost: pricing.creditCost,
        banner: nextBanner,
      };
    }),

  /**
   * Ad Banner Overlay (F131W, #30-A) — poll a banner's in-flight image
   * generation task, reusing `mediaGenerationService.getTask` exactly like
   * `media.ts`'s own `getTask` query does. On a terminal state, persists the
   * result: `"completed"` -> `imageAsset` populated + `status: "ready"`;
   * `"failed"` -> `status: "failed"`, both clearing `pendingTaskId`. A
   * non-terminal poll (`"pending"`/`"processing"`) is a pure read — no
   * write. The client polls this on a fixed interval (2.5s, matching this
   * component family's own `pollCharacterImageTask`/`pollVoicePreviewTask`
   * convention) until it observes a terminal `taskStatus`.
   */
  getAdBannerImageStatus: verticalDramaProcedure
    .input(adBannerScopeInput)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      const { rawProductTieIn, banners, bannerIndex, banner } =
        await loadOwnedAdBanner(tenantId, userId, seriesId, input.bannerId);

      if (!banner.pendingTaskId) {
        return { banner, taskStatus: null };
      }

      const userToken = await getAdBannerMediaUserToken(ctx);
      const { mediaGenerationService } =
        await import("../services/mediaGenerationService");
      let task;
      try {
        task = await mediaGenerationService.getTask(
          banner.pendingTaskId,
          userToken,
          {
            userId,
            source: "trpc.verticalDramaSeries.getAdBannerImageStatus",
            stage: "poll",
          }
        );
      } catch (err) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            err instanceof Error
              ? err.message
              : "Ad banner image task not found",
        });
      }

      if (task.status === "completed" && task.resultUrl) {
        const { pendingTaskId: completedTaskId, ...bannerWithoutPendingTask } =
          banner;
        const resultData = task.resultData as
          | Record<string, unknown>
          | undefined;
        const width =
          typeof resultData?.width === "number" ? resultData.width : undefined;
        const height =
          typeof resultData?.height === "number"
            ? resultData.height
            : undefined;
        const nextBanner: VdAdBannerDesign = {
          ...bannerWithoutPendingTask,
          status: "ready",
          imageAsset: {
            url: task.resultUrl,
            taskId: completedTaskId,
            generatedAt: new Date().toISOString(),
            ...(width !== undefined ? { width } : {}),
            ...(height !== undefined ? { height } : {}),
          },
        };
        const nextBanners = banners.slice();
        nextBanners[bannerIndex] = nextBanner;
        await persistAdBannerDesigns(
          tenantId,
          userId,
          seriesId,
          rawProductTieIn,
          nextBanners
        );
        return { banner: nextBanner, taskStatus: task.status };
      }

      if (task.status === "failed") {
        const { pendingTaskId: _droppedTaskId, ...bannerWithoutPendingTask } =
          banner;
        const nextBanner: VdAdBannerDesign = {
          ...bannerWithoutPendingTask,
          status: "failed",
        };
        const nextBanners = banners.slice();
        nextBanners[bannerIndex] = nextBanner;
        await persistAdBannerDesigns(
          tenantId,
          userId,
          seriesId,
          rawProductTieIn,
          nextBanners
        );
        return {
          banner: nextBanner,
          taskStatus: task.status,
          errorMessage: task.errorMessage,
        };
      }

      return { banner, taskStatus: task.status };
    }),

  /**
   * Create a new read-only share link for an owned series (task #32,
   * Collab-lite L1, F131AA). Returns the RAW token exactly once — only its
   * SHA-256 hash is ever persisted (`services/verticalDramaShareLinks.ts`).
   * The client builds the full shareable URL itself
   * (`window.location.origin + "/share/vd/" + token`) — this procedure
   * never hardcodes a domain. Capped at
   * `MAX_ACTIVE_SERIES_SHARE_LINKS` (5) active links per series — the
   * service throws `PRECONDITION_FAILED` once that cap is hit.
   */
  createSeriesShareLink: verticalDramaShareLinksProcedure
    .input(createSeriesShareLinkInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // Ownership guard — NOT_FOUND (never FORBIDDEN) for a missing/
      // cross-tenant/cross-user series, same `loadOwnedSeries` convention
      // every other mutation in this router uses.
      await loadOwnedSeries(tenantId, userId, seriesId);

      return createSeriesShareLink({
        tenantId,
        seriesId,
        createdByUserId: userId,
        expiresInDays: input.expiresInDays,
      });
    }),

  /**
   * List share link METADATA for an owned series — NEVER the token or its
   * hash (see `services/verticalDramaShareLinks.ts`'s `listSeriesShareLinks`,
   * which deliberately never selects the `tokenHash` column).
   */
  listSeriesShareLinks: verticalDramaShareLinksProcedure
    .input(listSeriesShareLinksInput)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      await loadOwnedSeries(tenantId, userId, seriesId);

      const links = await listSeriesShareLinks({ tenantId, seriesId });
      return { links };
    }),

  /**
   * Revoke one of the owned series' share links. Immediate effect — the
   * public read path (`verticalDramaShare.getSharedSeries`) re-checks
   * `revokedAt` on every single request, there is no cache to invalidate.
   */
  revokeSeriesShareLink: verticalDramaShareLinksProcedure
    .input(revokeSeriesShareLinkInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      const linkId = Number(input.linkId);
      if (!Number.isFinite(seriesId) || !Number.isFinite(linkId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid id" });
      }

      // Ownership guard on the SERIES first (same convention as every
      // sibling mutation) — `revokeSeriesShareLink` in the service then
      // scopes its own row lookup by tenantId+seriesId+linkId again as
      // defense in depth, so a linkId that exists but belongs to a
      // different series/tenant can never be revoked cross-tenant.
      await loadOwnedSeries(tenantId, userId, seriesId);

      return revokeSeriesShareLink({ tenantId, seriesId, linkId });
    }),
});

export type VerticalDramaSeriesRouter = typeof verticalDramaSeriesRouter;
