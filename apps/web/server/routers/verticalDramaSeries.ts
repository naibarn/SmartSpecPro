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
import { ingestVerticalDramaMediaAsset } from "../services/verticalDramaMediaAssetService";
import { getUnifiedMediaTask } from "../services/mediaTaskPollingService";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaGenrePresets,
  verticalDramaCharacters,
  verticalDramaCharacterAssets,
  /**
   * `planning/vd-character-identity-repair/plan.md` Phase 6.2 — the alias
   * table `reconcileCharactersFromStoryBible` now reads AND writes (see that
   * function below): resolves a bible name to an already-known roster
   * character via a persisted alias, and records a NEWLY-discovered
   * bible-declared alias (the wizard-rename case) so a later run doesn't
   * have to re-derive it from `refinedCharacters[].aliases` every time.
   */
  verticalDramaCharacterAliases,
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
  type InsertVerticalDramaSeriesRow,
  type VerticalDramaGenrePresetRow,
  type VerticalDramaCharacterRow,
  /** Phase 6.2 — see `verticalDramaCharacterAliases` import above. */
  type VerticalDramaCharacterAliasRow,
  type VerticalDramaMemoryEventRow,
  /** Production-grade full-story generation — see `loadSeriesLocationFacts` below. */
  type VerticalDramaLocationRow,
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
  verticalDramaPresetVisualIdentitySchema,
  type VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import {
  VD_LOOK_LOCK_GENRES,
  SeriesLookLockTransitionError,
  applySeriesLookLockTransition,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
  VD_SERIES_LOOK_LOCK_CHANGED_EVENT,
  recordSeriesLookLockAuditEvent,
} from "../services/verticalDramaSeriesLookLockAudit";
import {
  verticalDramaArcReplanProposalSchema,
  type VerticalDramaArcReplanProposal,
  type VerticalDramaEpisodeBreakdownItem,
} from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaQualityLedgers } from "@shared/verticalDramaSeries/qualityLedgers";
import {
  normalizeLegacyRole,
  narrativeRoleSchema,
  roleTierSchema,
  type NarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";
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
 * Genre pollution guard (Stage 1.5, `planning/vd-series-memory-and-lineage/
 * plan.md`) — `createSeriesInput` below rejects a `genre` that is a copy of
 * `title` or is logline/alt-title-shaped rather than genre-shaped. See that
 * module's own header doc comment for the real-data investigation and the
 * conservative, structural (not fuzzy-similarity) rule design.
 */
import {
  detectGenrePollution,
  genrePollutionErrorMessage,
} from "@shared/verticalDramaSeries/genrePollutionGuard";
/**
 * Series memory (Stage 1.1/1.2/1.4, `planning/vd-series-memory-and-lineage/
 * plan.md`) — `VdOpenThread` (type-only, used by
 * `resolveOpenThreadsFromSeriesMemory` below, Stage 1.5's openThreads-leak
 * fix) PLUS the additional types/value Stage 1.4's `getSeriesMemory`/
 * `updateSeriesMemory` procedures need: `foldSeriesMemory` (pure, TS-only,
 * no LLM/I-O — see that function's own doc comment) to re-derive
 * `currentState` after every user edit, and the remaining `VdSeriesMemory`
 * field types for this file's own `normalizeStoredSeriesMemory` below. Still
 * does NOT import `verticalDramaSeriesMemoryProjection.ts`'s unexported
 * `readStoredSeriesMemory` (see the original note this doc comment used to
 * carry) — this file has its own small `normalizeStoredSeriesMemory`
 * mirroring that function's tolerant-parse convention read-only. It DOES
 * import that module's exported `buildCompactSummary` (separate import,
 * right below) since that pure formatter is reused as-is rather than
 * re-implemented.
 */
import {
  foldSeriesMemory,
  type VdEpisodeMemory,
  type VdOpenThread,
  type VdRelationshipState,
  type VdSeriesMemory,
  type VdSeriesMemoryCurrentState,
} from "@shared/verticalDramaSeries/seriesMemoryState";
/**
 * Series Memory tab write path (Stage 1.4) reuses ONLY this pure formatter
 * from the Stage 1.2 projection service — see the import block's doc
 * comment above for why the rest of that module's write path (the
 * `userEdited`-gated `upsertEpisodeMemories`/`upsertEpisodeMemory`) is
 * deliberately NOT reused for user-triggered edits.
 */
import { buildCompactSummary } from "../services/verticalDramaSeriesMemoryProjection";
/**
 * Season/special-edition lineage (Part 2, Stage 2.1/2.2/2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`). `VerticalDramaSeriesLineage`
 * / `VerticalDramaSeasonCarryOverDraft` are the persisted/proposed contract
 * shapes (`@shared/verticalDramaSeries/lineage.ts` — a dedicated file, NOT
 * folded into the 1000+ line `contracts.ts`). `loadLineageContext` and
 * `cloneSeriesCastForLineage` are services this router calls INTO — they
 * never import this router back (see each service's own header doc comment
 * on why, mirroring `verticalDramaStoryJobs.ts`'s established convention).
 */
import {
  VERTICAL_DRAMA_SERIES_CREATE_MODES,
  type VerticalDramaSeriesCreateMode,
  type VerticalDramaSeriesLineage,
} from "@shared/verticalDramaSeries/lineage";
import {
  loadLineageContext,
  type VerticalDramaLineageContext,
} from "../services/verticalDramaSeriesLineage";
import { cloneSeriesCastForLineage } from "../services/verticalDramaSeriesClone";
import {
  synthesizeSeasonCarryOver,
  SeasonCarryOverInputError,
} from "../services/verticalDramaSeasonCarryOver";
/**
 * Stage 2.5 (`planning/vd-series-memory-and-lineage/plan.md`) —
 * `proposeSpecialEditionBrief` mutation, mirroring `proposeSeasonCarryOver`
 * immediately above exactly (same "LLM call -> transient draft, zero DB
 * writes" shape, same flag gate, same ownership hard-throw). Closes the gap
 * where `skills/vertical-drama-special-edition-planner/skill.md` had no
 * caller — see this service's own header doc comment for the full
 * `bible.userPremise` hand-off chain into the (untouched)
 * `vertical-drama-full-story-architect` skill.
 */
import {
  synthesizeSpecialEditionBrief,
  SpecialEditionInputError,
} from "../services/verticalDramaSpecialEdition";
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
  /**
   * Production-grade full-story generation
   * (`planning/vertical-drama-full-story-production-grade`, added
   * 2026-07-13) — `newLocations` on `generateStoryBibleDeep`'s result, the
   * shape persisted into `vertical_drama_locations` after the bible write —
   * see `runGenerateStoryBibleDeepJob` below.
   */
  type VdDeclaredLocation,
  /**
   * Resilient resume (added 2026-07-14,
   * `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — the
   * shape of a single deep-drafted episode; used to type the
   * `resumeDraftedItems` a checkpoint's `unknown[]` `draftedItems` gets cast
   * back to (see `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob`
   * below), matching `mergeDeepDraftItems`'s own draftedItems shape.
   */
  type DeepDraftedEpisodeItem,
  /**
   * Stage 2.4 threading (`planning/vd-series-memory-and-lineage/plan.md`,
   * added 2026-07-17) — the bounded fact set `resolveSeasonLineageContext`
   * below builds for a sequel row and threads into `generateStoryBibleDeep`'s
   * `seasonLineage` param; see that type's own doc comment.
   */
  type VdSeasonLineageContext,
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
  /**
   * Resilient resume (added 2026-07-14) — `VerticalDramaStoryJobResumeContext`
   * is `runVerticalDramaStoryJobExecutor`'s new 3rd parameter (see
   * `verticalDramaStoryJobs.ts`'s own doc comment); `VerticalDramaStoryJobCheckpoint`
   * types the (domain-agnostic, `draftedItems: unknown[]`) checkpoint shape
   * this router casts back to `DeepDraftedEpisodeItem[]`.
   */
  type VerticalDramaStoryJobResumeContext,
  type VerticalDramaStoryJobCheckpoint,
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
  /**
   * Manual shot-summary edits (added 2026-07-22,
   * `planning/vd-edit-episode-synopsis/plan.md` Phase 2, then revised same
   * day to a COMBINED summary+dialogue edit) — `updateEpisodeDraftShot`
   * mutation below. Same "kept in the same import block as its dialogue-edit
   * sibling" convention this block's own header doc comment already
   * establishes; same literal-limit rationale applies to
   * `updateEpisodeDraftShotInput` below too.
   *
   * `VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER` is imported here (unlike
   * the numeric limit constants this block's own header doc comment says are
   * deliberately NOT imported) because it is referenced only INSIDE
   * `updateEpisodeDraftShot`'s handler body below, never at this file's top
   * level — per that same doc comment, only a top-level reference
   * (module-evaluation time, e.g. a zod schema literal) breaks a sibling
   * test's narrow mock graph; an in-function reference is safe.
   */
  readItemManualSummaryEdit,
  applyManualShotSummaryEdit,
  ManualShotSummaryEditNoDraftError,
  VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER,
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
  // Vd character identity repair (`planning/vd-character-identity-repair/plan.md`
  // Phase 1) — the FULL bible character profile (name + role + narrativeRole +
  // roleTier + occupation), unlike `readBibleRefinedCharacters` just above,
  // which deliberately strips everything down to `{ name }` for its own
  // (unrelated) dramaturgy-roster callers. Threaded into
  // `ensureRosterCharactersFromStory`'s `refinedCharacters` param below so the
  // auto-register INSERT stops discarding role data the bible already has —
  // see that function's own doc comment for the bug this fixes.
  readBibleRefinedCharacterProfiles,
  // `planning/vd-character-identity-repair/plan.md` Phase 2.0/2.1 — the full
  // profile shape `readBibleRefinedCharacterProfiles` returns (now including
  // `aliases`), used as this file's `characterBibleProfiles` variable's
  // declared type so `.aliases` is visible without narrowing to
  // `VdRosterAutoRegisterRefinedCharacter` (which deliberately doesn't
  // declare `aliases` — see that type's own file). `VdBibleRefinedCharacter`
  // is a structural superset of `VdRosterAutoRegisterRefinedCharacter`, so
  // passing a `VdBibleRefinedCharacter[]` into
  // `ensureRosterCharactersFromStory`'s `refinedCharacters` param still
  // type-checks unchanged.
  type VdBibleRefinedCharacter,
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
/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — persists a deep story draft run's `new_locations` declarations into
 * `vertical_drama_locations`; see `runGenerateStoryBibleDeepJob` below.
 */
import { persistDeepDraftDeclaredLocations } from "../services/verticalDramaLocationReconciliation";
/**
 * Series memory (`planning/vd-series-memory-and-lineage/plan.md` Stage 1.2)
 * — persists each drafted episode's ALREADY-RESOLVED `episodeMemory`
 * (`DeepDraftedEpisodeItem.episodeMemory`, populated by
 * `extractDramaturgyStructureFields` in `verticalDramaStoryBible.ts` for
 * every item) into `vertical_drama_series.memory`; see the SAME two call
 * sites as `persistDeepDraftDeclaredLocations` just above
 * (`runGenerateStoryBibleDeepJob` / `runExtendStoryDraftHorizonJob` below).
 */
import { persistDeepDraftEpisodeMemories } from "../services/verticalDramaSeriesMemoryProjection";
/**
 * Auto-register story-introduced characters (`planning/vd-auto-register-story-characters/plan.md`)
 * — INSERT-capable counterpart to this file's own `reconcileCharactersFromStoryBible`
 * (which is UPDATE-only); persists a deep story draft run's dialogue
 * speakers / shot `characters[]` names that are new to the roster; see
 * `runGenerateStoryBibleDeepJob` / `runExtendStoryDraftHorizonJob` below.
 *
 * `planning/vd-character-identity-repair/plan.md` Phase 1 — both call sites
 * below now build the `refinedCharacters` argument from
 * `readBibleRefinedCharacterProfiles` instead of the name-only `{ name }`
 * they used to pass (`characterBibleProfiles`, typed as this file's own
 * `VdBibleRefinedCharacter[]` — a structural superset of this service's own
 * `VdRosterAutoRegisterRefinedCharacter`, so no explicit import of that
 * narrower type is needed here).
 */
import {
  ensureRosterCharactersFromStory,
  type VdRosterAutoRegisterSummary,
  /**
   * `planning/vd-character-identity-repair/plan.md` Phase 6.2 —
   * `reconcileCharactersFromStoryBible` below now shares the SAME
   * normalized-name convention (case-fold + whitespace-collapse) as this
   * service's own dedup/alias logic, instead of its previous bespoke
   * `.trim().toLocaleLowerCase()` (no whitespace-collapse). Import-only —
   * this router file must NOT modify
   * `verticalDramaCharacterRosterAutoRegister.ts` itself (out of scope for
   * this phase).
   */
  normalizeStoryCharacterName,
} from "../services/verticalDramaCharacterRosterAutoRegister";
import { debugError } from "../_core/logger";
import {
  resolveSeriesThumbnailUrls,
  resolveEpisodeThumbnailUrls,
} from "../services/verticalDramaThumbnails";
import {
  projectEpisodeCover,
  readEpisodeCoverStateFromRow,
  resolveEpisodeCoverAssetUrls,
} from "../services/verticalDramaEpisodeCover";
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
  coverImage: unknown;
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
  characters: Array<{
    name: string;
    role: string;
    description: string;
    narrativeRole?: NarrativeRole;
    roleTier?: RoleTier;
    occupation?: string;
  }>;
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

const verticalDramaSeriesLookLockProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesLookLock")
);

export const setSeriesLookLockInput = z
  .object({
    seriesId: z.string().min(1),
    mode: z.enum(["inherit_source", "genre", "manual", "none"]),
    genreKey: z.enum(VD_LOOK_LOCK_GENRES).optional(),
    manualPatch: z.unknown().optional(),
    expectedRevision: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (value.mode === "genre" && !value.genreKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["genreKey"],
        message: "genreKey is required for genre mode",
      });
    }
    if (value.mode === "manual" && value.manualPatch === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manualPatch"],
        message: "manualPatch is required for manual mode",
      });
    }
  });

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

/* -------------------------------------------------------------------------- */
/* Series Memory tab (Stage 1.4, `planning/vd-series-memory-and-lineage/      */
/* plan.md`) — input schemas + read/normalize helpers shared by               */
/* `getSeriesMemory`/`updateSeriesMemory` below.                              */
/* -------------------------------------------------------------------------- */

const vdRelationshipDisclosureInputSchema = z.enum([
  "secret",
  "known_to_some",
  "public",
  "undeclared",
]);

const vdThreadClassInputSchema = z.enum([
  "plot",
  "domestic",
  "career",
  "financial",
  "health",
  "relationship",
]);

/**
 * `VdRelationshipState` as user-editable input. Strict about the fields this
 * whole feature depends on — `pair`/`status`/`disclosure` are REQUIRED with
 * a closed enum for `disclosure` — deliberately NOT the
 * `z.object({}).passthrough()` looseness documented (this feature's plan
 * file, and `verticalDramaSeriesMemoryProjection.ts`'s own doc comment) as
 * the root cause of today's memory data being worthless. `knownBy` defaults
 * to `[]` (meaningfully empty for `"undeclared"` — nobody has been TOLD).
 */
const vdRelationshipStateInputSchema = z.object({
  pair: z.tuple([z.string().trim().min(1), z.string().trim().min(1)]),
  status: z.string().trim().min(1).max(200),
  disclosure: vdRelationshipDisclosureInputSchema,
  knownBy: z.array(z.string().trim().min(1)).default([]),
  sinceEpisode: z.number().int().positive(),
});

/**
 * `VdOpenThread` as user-editable input — `threadClass` is a closed enum for
 * the same reason `disclosure` is above (`"domestic"` is the whole point of
 * this feature's thread-class axis; a free-text field would let it silently
 * drift back to plot-only threads).
 */
const vdOpenThreadInputSchema = z.object({
  threadId: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  threadClass: vdThreadClassInputSchema,
  openedEpisode: z.number().int().positive(),
  resolvedEpisode: z.number().int().positive().optional(),
});

const vdKnowledgeChangeInputSchema = z.object({
  characterKey: z.string().trim().min(1),
  learned: z.string().trim().min(1).max(500),
});

/**
 * `VdEpisodeMemory` as user-editable input — the single granularity
 * `updateSeriesMemory` supports (see that procedure's own doc comment for
 * the "why episode-record, not sub-field, granularity" design decision).
 */
const vdEpisodeMemoryInputSchema = z.object({
  episodeNumber: z.number().int().positive(),
  recap: z.string().trim().min(1).max(4000),
  canonicalFacts: z.array(z.string().trim().min(1)).default([]),
  threadsOpened: z.array(vdOpenThreadInputSchema).default([]),
  threadsResolved: z.array(z.string().trim().min(1)).default([]),
  relationshipChanges: z.array(vdRelationshipStateInputSchema).default([]),
  knowledgeChanges: z.array(vdKnowledgeChangeInputSchema).default([]),
});

export const getSeriesMemoryInput = z.object({ seriesId: z.string().min(1) });

export const updateSeriesMemoryInput = z.object({
  seriesId: z.string().min(1),
  edit: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("upsertEpisode"),
      episode: vdEpisodeMemoryInputSchema,
    }),
    z.object({
      kind: z.literal("removeEpisode"),
      episodeNumber: z.number().int().positive(),
    }),
  ]),
});

/**
 * Defensive read of `vertical_drama_series.memory` jsonb into a trustworthy
 * `VdSeriesMemory` — mirrors `verticalDramaSeriesMemoryProjection.ts`'s
 * unexported `readStoredSeriesMemory` (same tolerant-parse convention:
 * missing/malformed input -> a well-formed EMPTY shape, never a throw, never
 * `null`/`undefined` reaching a caller). That function is intentionally not
 * exported (see this file's `seriesMemoryState` import doc comment above),
 * so this is a genuinely separate, small, READ-ONLY implementation rather
 * than a modification of that module.
 */
function normalizeStoredSeriesMemory(raw: unknown): VdSeriesMemory {
  if (!raw || typeof raw !== "object") {
    return {
      contractVersion: 1,
      episodes: [],
      currentState: foldSeriesMemory([]),
      compactSummary: "",
      lastFoldedEpisode: 0,
    };
  }
  const candidate = raw as Partial<VdSeriesMemory>;
  const episodes = Array.isArray(candidate.episodes)
    ? candidate.episodes.filter(
        (ep): ep is VdEpisodeMemory =>
          !!ep && typeof (ep as VdEpisodeMemory).episodeNumber === "number"
      )
    : [];
  const currentState: VdSeriesMemoryCurrentState =
    candidate.currentState ?? foldSeriesMemory(episodes);
  return {
    contractVersion: 1,
    episodes,
    currentState,
    compactSummary:
      typeof candidate.compactSummary === "string"
        ? candidate.compactSummary
        : "",
    lastFoldedEpisode:
      typeof candidate.lastFoldedEpisode === "number"
        ? candidate.lastFoldedEpisode
        : 0,
    ...(candidate.userEdited === true ? { userEdited: true as const } : {}),
  };
}

/**
 * Maps `vdEpisodeMemoryInputSchema`'s parsed shape 1:1 onto `VdEpisodeMemory`
 * — same field names throughout; zod already enforced the strict inner
 * shapes (`pair`/`status`/`disclosure`/`threadClass`, etc.) above.
 */
function toVdEpisodeMemoryFromInput(
  input: z.infer<typeof vdEpisodeMemoryInputSchema>
): VdEpisodeMemory {
  const relationshipChanges: VdRelationshipState[] = input.relationshipChanges;
  return {
    episodeNumber: input.episodeNumber,
    recap: input.recap,
    canonicalFacts: input.canonicalFacts,
    threadsOpened: input.threadsOpened,
    threadsResolved: input.threadsResolved,
    relationshipChanges,
    knowledgeChanges: input.knowledgeChanges,
  };
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
  /** Production-grade full-story generation, added 2026-07-13 — count of NEW `vertical_drama_locations` rows this run's declarations actually created (never counts a skipped-existing key). Optional — omitted for the `"extend"` action until that path is wired to the same persistence step. */
  createdLocationCount?: number;
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
        createdLocationCount: params.createdLocationCount ?? 0,
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
 * Deep-draft generate/extend `createdCharacters` response field
 * (`planning/vd-stuck-generation-and-lost-characters/plan.md`, Set B) — the
 * compact shape both `runGenerateStoryBibleDeepJob` and
 * `runExtendStoryDraftHorizonJob` surface, mirroring the pre-existing
 * `createdLocationCount` convention (always present, never `undefined`,
 * zero/empty when the run auto-registered nothing). Unlike
 * `createdLocationCount` (a bare number — locations don't need a name list
 * client-side), this carries `names` too since the client's post-run
 * toast/banner (B-client) names the newly-registered characters.
 */
export interface VdDeepDraftCreatedCharactersSummary {
  count: number;
  names: string[];
}

const EMPTY_DEEP_DRAFT_CREATED_CHARACTERS: VdDeepDraftCreatedCharactersSummary =
  {
    count: 0,
    names: [],
  };

/** Projects `ensureRosterCharactersFromStory`'s `VdRosterAutoRegisterSummary` (previously discarded at both call sites) into the compact response shape above. */
function toDeepDraftCreatedCharactersSummary(
  summary: VdRosterAutoRegisterSummary
): VdDeepDraftCreatedCharactersSummary {
  return {
    count: summary.createdCharacters.length,
    names: summary.createdCharacters.map(c => c.name),
  };
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

/**
 * Resilient resume (added 2026-07-14,
 * `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — computes
 * what `generateStoryBibleDeep`'s new `resumeDraftedItems`/
 * `alreadyDraftedEpisodeNumbers` params should be for THIS run, shared by
 * both `runGenerateStoryBibleDeepJob` and `runExtendStoryDraftHorizonJob`
 * (same "small helper shared by both deep-draft executors" convention as
 * `mergeDeepDraftItems` above).
 *
 * Two independent sources feed the skip set, unioned together:
 *  1. `resume.checkpoint.completedEpisodeNumbers` — episodes THIS SAME job
 *     (a same-jobId BullMQ redelivery after a mid-run crash) already
 *     checkpointed earlier in an interrupted attempt. Applies REGARDLESS of
 *     `mode` — this is the core crash-resume mechanism, not a plot-scope
 *     decision.
 *  2. Episodes already carrying a valid `VD_DEEP_DRAFT_SHOTS_PER_EPISODE`-shot
 *     `shotDrafts` in the CURRENT active breakdown (`readItemShotDrafts(item)
 *     !== null`) — but see the note below on why NO `mode`-based gate is
 *     needed for this source.
 *
 * On "keep vs. rewrite plot" and `mode`: the task brief for this feature
 * described gating source #2 on `VerticalDramaDeepStoryDraftMode` ("standard"
 * = "keep the current plot", "premium" = "rewrite the plot"), asking that
 * source #2 apply ONLY for "keep". That mapping does not hold against the
 * real code — `mode` here is a QUALITY TIER (`generateStoryBibleDeep` single-
 * pass vs. `generateStoryBibleDeepPremium`'s fan-out/judge/revise pipeline),
 * orthogonal to plot scope; BOTH modes only ADD shot-level detail onto
 * already-planned episodes and NEVER touch `workingTitle`/`logline`/
 * `keyBeats` (see `generateStoryBibleDeep`'s own doc comment, and this
 * router's `generateStoryBibleDeep` mutation's doc comment: "never invents
 * new ... it never invents new workingTitle/logline/keyBeats/contentBudget").
 * The actual "keep the current plot" vs. "rewrite everything" choice is a
 * CLIENT-ONLY concept (`VerticalDramaDeepStoryDraftsPanel.tsx`'s
 * `VerticalDramaDeepDraftScope`, never sent to the server): "rewrite"
 * mechanically means the client calls the separate `generateStoryBible`
 * mutation FIRST (an entirely different code path — it replaces
 * `bible.episodeBreakdown` wholesale with brand-new items that have no
 * `shotDrafts` at all) and only THEN enqueues this job. By the time THIS
 * executor reads the active breakdown, a "rewrite" run's episodes therefore
 * never have `shotDrafts` yet — source #2 naturally finds nothing to skip,
 * with no `mode`-based special-casing required. A "keep" run's episodes may
 * genuinely already have `shotDrafts` (from an earlier completed run), and
 * skipping those is exactly the credit-safety behavior this feature exists
 * for. Applying source #2 unconditionally is therefore BOTH simpler and
 * strictly more correct than gating it on `mode` (which cannot express plot
 * scope at all) — see this task's own Result Report for the full conflict
 * writeup against the original brief.
 */
function resolveDeepDraftResumeState(
  activeBreakdownItems: StoredEpisodeBreakdownItem[],
  resume: VerticalDramaStoryJobResumeContext
): {
  alreadyDraftedEpisodeNumbers: number[];
  resumeDraftedItems: DeepDraftedEpisodeItem[];
} {
  const alreadyDraftedFromBible = new Set(
    activeBreakdownItems
      .filter(item => readItemShotDrafts(item) !== null)
      .map(item => item.episodeNumber)
  );
  const alreadyDraftedFromCheckpoint = new Set(
    resume.checkpoint?.completedEpisodeNumbers ?? []
  );
  const alreadyDraftedEpisodeNumbers = [
    ...new Set([...alreadyDraftedFromBible, ...alreadyDraftedFromCheckpoint]),
  ];
  const resumeDraftedItems = (resume.checkpoint?.draftedItems ??
    []) as DeepDraftedEpisodeItem[];
  return { alreadyDraftedEpisodeNumbers, resumeDraftedItems };
}

/**
 * Resilient resume — wires `generateStoryBibleDeep`'s `onChunkComplete` to
 * the job's `persistCheckpoint`, maintaining a local running accumulator
 * (full-replacement, not a delta) across every chunk this run completes so
 * each checkpoint write is race-free and self-contained (see
 * `VerticalDramaStoryJobResumeContext.persistCheckpoint`'s own doc comment
 * on why a full replacement is the simplest race-free shape). Seeded from
 * the RESUMED checkpoint (if any) so a job that resumes and then completes
 * ANOTHER chunk before finishing/crashing again still checkpoints the FULL
 * set, not just this run's own new chunks.
 */
function createDeepDraftCheckpointRelay(
  resume: VerticalDramaStoryJobResumeContext
): (chunkDraftedItems: DeepDraftedEpisodeItem[]) => void {
  let draftedItems: DeepDraftedEpisodeItem[] = [
    ...((resume.checkpoint?.draftedItems ?? []) as DeepDraftedEpisodeItem[]),
  ];
  let completedEpisodeNumbers: number[] = [
    ...(resume.checkpoint?.completedEpisodeNumbers ?? []),
  ];
  let chunkSizesDone: number[] = [...(resume.checkpoint?.chunkSizesDone ?? [])];

  return (chunkDraftedItems: DeepDraftedEpisodeItem[]) => {
    draftedItems = [...draftedItems, ...chunkDraftedItems];
    completedEpisodeNumbers = [
      ...completedEpisodeNumbers,
      ...chunkDraftedItems.map(item => item.episodeNumber),
    ];
    chunkSizesDone = [...chunkSizesDone, chunkDraftedItems.length];
    const checkpoint: VerticalDramaStoryJobCheckpoint = {
      draftedItems,
      completedEpisodeNumbers,
      chunkSizesDone,
      // Credits bookkeeping only (Redis checkpoint observability, NOT the
      // real charged amount) — `onChunkComplete` doesn't carry the chunk's
      // actual spend, so this is the same PER-CALL ESTIMATE
      // `estimateDeepDraftJobCredits`'s own pre-check math uses, times the
      // chunk count checkpointed so far. The FINAL response's `creditsUsed`
      // still comes from `generateStoryBibleDeep`'s own real
      // `result.creditsUsed` for THIS run's newly-drafted chunks, unaffected
      // by this estimate.
      creditsUsed:
        chunkSizesDone.length * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE,
      updatedAt: new Date().toISOString(),
    };
    resume.persistCheckpoint(checkpoint);
  };
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

/** Feature 137 P1 tenant gate for draft-time identity-safe boundaries. */
async function resolveVerticalDramaMotionContractsFlag(
  tenantId: string
): Promise<boolean> {
  try {
    const flags = await getTenantFeatureFlags(tenantId);
    return flags?.verticalDramaMotionContracts === true;
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
  /**
   * Stage 2.5 follow-up (special-edition tie-in reaches generation, added
   * 2026-07-18) — the series' own `createMode`. `"special_edition"` BYPASSES
   * the `verticalDramaTieInReplan` flag gate below: a special edition IS a
   * tie-in by definition (it exists to carry the product/place), so gating
   * it on an UNRELATED flag (`verticalDramaTieInReplan`, meant for a regular
   * series' own season-level tie-in replanning) made the entire
   * special-edition mode product-blind for any tenant without that separate
   * flag on. Special editions themselves are already gated behind
   * `verticalDramaSeriesLineage` at `create` time (only that flag + an
   * owned parent ever produce `createMode === "special_edition"` — see
   * `create`'s own doc comment), so this bypass does not skip a flag check
   * entirely, it defers to the mode's OWN flag. Every OTHER createMode
   * (including `undefined`/original and `"sequel"`) keeps requiring
   * `verticalDramaTieInReplan`, byte-identical to before this follow-up.
   */
  createMode?: string | null;
}): Promise<{
  items: StoredEpisodeBreakdownItem[];
  context?: VdTieInDraftContext;
}> {
  const isSpecialEdition = params.createMode === "special_edition";
  const tieInReplanEnabled = await resolveVerticalDramaTieInReplanFlag(
    params.tenantId
  );
  const rawProductTieIn =
    (params.productTieIn as Record<string, unknown> | null) ?? null;
  if (!isSpecialEdition && !tieInReplanEnabled) {
    return { items: params.items };
  }
  if (rawProductTieIn?.enabled !== true) {
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

  // Stage 2.5 follow-up — special-edition-only facts (see
  // `VdTieInDraftContext.specialEdition`'s own doc comment). `undefined` for
  // every non-special-edition run, so `context` stays byte-identical to
  // before this follow-up for a regular sequel/original series' own tie-in.
  const specialEdition = isSpecialEdition
    ? {
        allowedStoryFunctions: Array.isArray(
          rawProductTieIn.allowedStoryFunctions
        )
          ? rawProductTieIn.allowedStoryFunctions.filter(
              (f): f is string => typeof f === "string"
            )
          : [],
        hasReferenceImages:
          Array.isArray(rawProductTieIn.referenceAssetIds) &&
          rawProductTieIn.referenceAssetIds.length > 0,
      }
    : undefined;

  return {
    items: workingItems,
    context: {
      productName,
      productCategory,
      benefitFocus,
      forbiddenClaims,
      placements,
      ...(specialEdition ? { specialEdition } : {}),
    },
  };
}

/**
 * Production-grade full-story generation
 * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
 * — loads THIS series' existing `vertical_drama_locations` roster as
 * prompt/gate FACTS (`GenerateStoryBibleDeepParams.existingLocations`):
 * `locationKey`, `name`, and a short description extracted from the `data`
 * jsonb (`data.description` when present, undefined otherwise — the deep
 * story draft prompt/gate treat an absent description as "no summary
 * available", never a hard requirement).
 *
 * Best-effort — NEVER throws (a query failure degrades to `[]`, exactly
 * like every other side-fact read in this file, e.g.
 * `resolveTieInDraftBootstrap`'s defensive `productTieIn` reads): the deep
 * story draft run must never be blocked by a location-roster lookup
 * problem, and an empty roster is a perfectly valid "no known locations yet"
 * fact for a brand-new series anyway.
 */
async function loadSeriesLocationFacts(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<Array<{ locationKey: string; name: string; description?: string }>> {
  let rows: VerticalDramaLocationRow[];
  try {
    rows = await db
      .select()
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.tenantId, tenantId),
          eq(verticalDramaLocations.userId, userId),
          eq(verticalDramaLocations.seriesId, seriesId)
        )
      );
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to load existing locations for deep story draft generation — continuing with an empty roster",
      error
    );
    return [];
  }
  return rows.map(row => {
    const data = (row.data as Record<string, unknown> | null) ?? null;
    const description =
      data &&
      typeof data.description === "string" &&
      data.description.trim().length > 0
        ? data.description
        : undefined;
    return { locationKey: row.locationKey, name: row.name, description };
  });
}

/** Defensive parse of `vertical_drama_series.lineage` (jsonb) — same "malformed blob degrades to null, never throws" convention as this file's own `normalizeStoredSeriesMemory`/`asRecord`-shaped reads. */
function asVerticalDramaSeriesLineage(
  raw: unknown
): VerticalDramaSeriesLineage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as VerticalDramaSeriesLineage;
}

/**
 * Stage 2.4 threading (`planning/vd-series-memory-and-lineage/plan.md`,
 * added 2026-07-17) — the ONE place a sequel's deep-draft/extend run
 * assembles `VdSeasonLineageContext`, per that stage's own "the router reads
 * `series.lineage` + `series.parentSeriesId` and assembles it itself, the
 * client never has to" design note. Called by both
 * `runGenerateStoryBibleDeepJob` and `runExtendStoryDraftHorizonJob` — a
 * sequel keeps needing these facts on every later extend/horizon run, not
 * just its first deep-draft.
 *
 * Two sources, preferring the freshest:
 *  - LIVE: `loadLineageContext` against the parent row, when
 *    `row.parentSeriesId` is still linked (not yet `ON DELETE SET NULL`'d) —
 *    reflects any episodes the parent has drafted SINCE this child's
 *    `lineage` snapshot was taken at `create` time.
 *  - SNAPSHOT: `row.lineage` (`VerticalDramaSeriesLineage`) — the Stage
 *    2.2/2.3 user-approved carry-over decision captured once, at `create`
 *    time. The ONLY source once the parent is deleted (`parentSeriesId`
 *    degrades to `NULL`) or the live load fails for any reason, and always
 *    preferred for `parentTitle` specifically (see inline comment below) so
 *    the badge/prompt text survives a deleted parent.
 *
 * Returns `undefined` for every non-sequel row (`createMode !== "sequel"`,
 * true for every series that existed before this feature and every
 * `special_edition` row) with ZERO extra DB calls — the entire byte-identity
 * guarantee this task's brief requires. Never throws for a `"sequel"` row
 * either: an unreachable/cross-tenant/deleted parent or a malformed
 * `lineage` blob all degrade to the best partial context still buildable
 * (worst case: just `seasonNumber`/a generic `parentTitle`, empty facts
 * otherwise) — mirrors `loadSeriesLocationFacts`'s own best-effort
 * convention just above.
 *
 * Deliberately does NOT special-case "parent has no recorded memory yet"
 * (true for 4/10 real series today) by omitting the whole block: every
 * field here already independently degrades to an honest "nothing here"
 * default (`""`, `[]`, `{}` — the SAME sentinel `loadLineageContext`'s own
 * `compactSummary` doc comment documents for "no memory yet"), and the
 * Stage 2.2 carry-over snapshot (`carriedCharacters`/`antagonistStrategy`)
 * is independent of live memory and normally non-empty for any
 * wizard-created sequel — so "no live memory" is rarely "zero lineage
 * information", and dropping the block would ALSO hide the season-number/
 * parent-title continuity framing `buildSeasonLineagePromptBlock` renders,
 * undermining Stage 2.4's title/genre-lock half of this feature even when
 * memory specifically is thin.
 */
async function resolveSeasonLineageContext(
  row: VerticalDramaSeriesRow,
  tenantId: string,
  userId: number
): Promise<VdSeasonLineageContext | undefined> {
  if (row.createMode !== "sequel") return undefined;

  const snapshot = asVerticalDramaSeriesLineage(row.lineage);
  const carryOver = snapshot?.carryOver;

  let live: VerticalDramaLineageContext | null = null;
  if (row.parentSeriesId) {
    try {
      const parentRow = await loadOwnedSeries(
        tenantId,
        userId,
        row.parentSeriesId
      );
      const flags = await getTenantFeatureFlags(tenantId);
      live = await loadLineageContext(
        parentRow,
        { tenantId, userId },
        {
          presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
          lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
        }
      );
    } catch (error) {
      // Parent deleted mid-request, cross-tenant race, or a transient DB
      // error — fall through to the `lineage` snapshot only, never throw.
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Failed to load live parent lineage context — falling back to the lineage snapshot",
        error
      );
      live = null;
    }
  }

  const carriedCharacters = (carryOver?.characters ?? [])
    .filter(character => character.availability !== "write_out")
    .map(character => ({
      characterKey: character.characterKey,
      name: character.name,
      postFinaleStatus: character.postFinaleStatus,
    }));
  const writtenOutCharacters = (carryOver?.characters ?? [])
    .filter(character => character.availability === "write_out")
    .map(character => ({
      characterKey: character.characterKey,
      name: character.name,
    }));

  return {
    seasonNumber: row.seasonNumber ?? snapshot?.seasonNumber ?? 2,
    // Snapshot preferred over the live row's own title — survives a
    // deleted parent (`lineage.parentTitle` is a snapshot; the live row
    // would be gone). See this function's own doc comment.
    parentTitle:
      snapshot?.parentTitle ?? live?.parentTitle ?? "the prior season",
    priorSeasonSummary:
      live?.compactSummary ?? snapshot?.priorSeasonSummary ?? "",
    carriedRelationships:
      live?.currentState.relationships ?? carryOver?.carriedRelationships ?? [],
    carriedThreads:
      live?.currentState.openThreads ?? carryOver?.carriedThreads ?? [],
    carriedCharacters,
    writtenOutCharacters,
    antagonistStrategy: carryOver?.antagonistStrategy ?? "",
    characterKnowledge: live?.currentState.characterKnowledge ?? {},
  };
}

export async function runGenerateStoryBibleDeepJob(
  params: StoryJobExecutorOwner & {
    horizonEpisodes?: number;
    mode?: VerticalDramaDeepStoryDraftMode;
    idempotencyKey?: string;
  },
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
  /**
   * Resilient resume (added 2026-07-14) — optional so every EXISTING test
   * call site (which predates this param) keeps compiling and running
   * byte-identically: `resume ?? { checkpoint: null, persistCheckpoint: () => {} }`
   * below makes a call site that never passes it behave exactly like there
   * is no checkpoint and no resume — a fresh run, drafting every requested
   * episode, exactly like today.
   */
  resume?: VerticalDramaStoryJobResumeContext
) {
  const resolvedResume: VerticalDramaStoryJobResumeContext = resume ?? {
    checkpoint: null,
    persistCheckpoint: () => {},
  };
  const { tenantId, userId, seriesId } = params;
  const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
  const formatProfilesEnabled =
    await resolveVerticalDramaFormatProfilesFlag(tenantId);
  const motionContractsEnabled =
    await resolveVerticalDramaMotionContractsFlag(tenantId);

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
  // the flag AND the series' tie-in are both on — UNLESS this is a special
  // edition (`row.createMode`), which bypasses the flag (see
  // `resolveTieInDraftBootstrap`'s own `createMode` doc comment).
  const tieInBootstrap = await resolveTieInDraftBootstrap({
    tenantId,
    items: rawExistingItems,
    productTieIn: row.productTieIn,
    plannedCount: row.targetEpisodeCount ?? rawExistingItems.length,
    createMode: row.createMode,
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

  // Production-grade full-story generation — the series' known location
  // roster + character-bible names, threaded into the deep-draft prompt
  // ("EXISTING LOCATIONS" FACT block) and the deterministic completeness
  // gate (`location_key`/character-name membership checks). Loaded ONCE,
  // BEFORE generation, so every chunk this run sees the SAME pre-run
  // baseline — `generateStoryBibleDeep` grows its own in-memory copy as
  // `new_locations` are accepted chunk-by-chunk within this one run.
  const existingLocations = await loadSeriesLocationFacts(
    tenantId,
    userId,
    seriesId
  );
  // Vd character identity repair (`planning/vd-character-identity-repair/
  // plan.md` Phase 1) — the FULL bible character profiles (role/
  // narrativeRole/roleTier/occupation/aliases), used THREE ways below:
  // (1) as-is, into `ensureRosterCharactersFromStory`'s `refinedCharacters`
  // param (Phase 1's own fix — role data no longer discarded at INSERT);
  // (2) as-is again, into `generateStoryBibleDeep`'s `knownCharacters`
  // (Phase 2.0 — renders the "CHARACTER BIBLE" FACT block the deep-draft
  // prompt was missing entirely); (3) flattened into `characterBibleNames`
  // just below (Phase 2.1/2.5 — the completeness gate's flat membership set).
  const characterBibleProfiles: VdBibleRefinedCharacter[] =
    readBibleRefinedCharacterProfiles(bible);
  // `planning/vd-character-identity-repair/plan.md` Phase 2.1/2.5 (added
  // 2026-07-17) — flattens each character's canonical `name` AND its
  // declared `aliases` (Phase 2.1) into ONE flat list, so the completeness
  // gate's membership check (`characterBibleNames`, both the
  // `characters[].name` check and the Phase 2.5 `dialogue_lines[].speaker`
  // check — see `computeShotCompletenessViolations`'s own doc comment)
  // accepts a legitimate short form ("คิริน") exactly like the canonical
  // spelling ("คิริน วัฒนเมธา"). A legacy bible with no declared aliases
  // contributes nothing extra here — byte-identical to before Phase 2.1.
  // Deliberately a SEPARATE variable from `characterBibleProfiles` above:
  // this one stays a flat `string[]` for the gate's cheap membership check;
  // that one carries the full profile the "CHARACTER BIBLE" prompt block
  // renders.
  const characterBibleNames = characterBibleProfiles.flatMap(c => [
    c.name,
    ...(c.aliases ?? []),
  ]);

  // Stage 2.4 threading (`planning/vd-series-memory-and-lineage/plan.md`) —
  // see `resolveSeasonLineageContext`'s own doc comment. `undefined` for
  // every non-sequel row (every series that existed before this feature),
  // with zero extra DB calls in that case.
  const seasonLineage = await resolveSeasonLineageContext(
    row,
    tenantId,
    userId
  );

  // Resilient resume — see `resolveDeepDraftResumeState`'s own doc comment
  // for why source #2 (already-drafted-in-the-bible) applies unconditionally
  // (no `mode` gate). Supported by BOTH modes: `generateStoryBibleDeep`
  // forwards `resumeDraftedItems`/`alreadyDraftedEpisodeNumbers`/
  // `onChunkComplete` straight through to `generateStoryBibleDeepPremium`
  // when `mode === "premium"` (its own mode-switch at the very top passes
  // `params` on unchanged) — see that function's own doc comment for its
  // skip/union mechanics, which differ slightly from standard mode's
  // (union happens at the END there, not seeded into a growing accumulator).
  const { alreadyDraftedEpisodeNumbers, resumeDraftedItems } =
    resolveDeepDraftResumeState(existingItems, resolvedResume);
  const onChunkComplete = createDeepDraftCheckpointRelay(resolvedResume);

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
      // Resilient resume — see the doc comment on this const block above.
      resumeDraftedItems,
      alreadyDraftedEpisodeNumbers,
      onChunkComplete,
      // F131X + finale price_paid rule (both dormant without these — the
      // service's optional params default off; see #23's wiring note)
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
      formatProfilesEnabled,
      motionContractsEnabled,
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
      // Production-grade full-story generation — see this function's own
      // "existingLocations"/"characterBibleNames" load above.
      existingLocations,
      characterBibleNames,
      // `planning/vd-character-identity-repair/plan.md` Phase 2.0 — the
      // deep-draft prompt's "CHARACTER BIBLE" FACT block source; reuses the
      // SAME `characterBibleProfiles` load above (Phase 1's role-preserving
      // read), never a separate query.
      knownCharacters: characterBibleProfiles,
      // Stage 2.4 threading — see this function's own `seasonLineage` load
      // above. `undefined` for every non-sequel run, byte-identical to
      // before this feature existed.
      seasonLineage,
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
  // Silent-no-op fix (plan
  // `planning/vertical-drama-deep-draft-update-all-noop`, added 2026-07-14)
  // — compute over the MERGED (existing + newly-drafted) state, not just
  // `result.draftedItems`. The old computation regressed
  // `deepDraft.horizonEndEpisode` to 0 whenever a run drafted zero new
  // episodes (empty `draftedItems.reduce(Math.max, 0) === 0`), even though
  // episodes were already drafted from a prior run — see the plan's
  // "secondary defect" section. This version never regresses: it's always
  // the highest episode number that actually has shot drafts right now.
  const horizonEndEpisode = mergedItems.reduce(
    (max, item) =>
      readItemShotDrafts(item) !== null
        ? Math.max(max, item.episodeNumber)
        : max,
    0
  );
  const generatedAt = new Date().toISOString();
  const totalCreditsUsed = result.creditsUsed + (ledgerPlan?.creditsUsed ?? 0);

  // Defense-in-depth for an enqueue-then-state-changed race (added
  // 2026-07-14, same plan as above) — the mutation's early-return (see
  // `generateStoryBibleDeep`'s `remainingToDraft` guard) normally prevents a
  // doomed "nothing to draft" job from ever being enqueued, but state can
  // still shift between enqueue and this worker actually running (e.g. a
  // concurrent run on the same series already drafted everything in the
  // meantime). When that happens, `result.draftedItems` comes back empty
  // and there is no ledger plan to persist either — skip the
  // `appendBreakdownVersion` + bible write entirely (no junk version, no
  // horizon regression) and return the CURRENT already-complete state with
  // the corrected horizon computed above.
  if (result.draftedItems.length === 0 && !ledgerPlan) {
    return {
      series: { ...row, id: String(row.id) },
      creditsUsed: totalCreditsUsed,
      model: result.model,
      partial: false,
      horizonEndEpisode,
      chunkSizes: [],
      warnings: result.warnings,
      error: undefined,
      mode,
      callsMade: 0,
      missingEpisodes: [],
      tieInMismatchCount: result.tieInMismatchCount,
      createdLocationCount: 0,
      // Set B — this early-return path skips `ensureRosterCharactersFromStory`
      // entirely (zero drafting work happened), so mirror `createdLocationCount`'s
      // `0` above with the same "always present" empty shape.
      createdCharacters: EMPTY_DEEP_DRAFT_CREATED_CHARACTERS,
      // Signals to callers (tests, and any future caller) that this run
      // did zero drafting work — distinct from `partial`, which means "did
      // some work but stopped early on an error".
      nothingDrafted: true,
    };
  }

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

  // Production-grade full-story generation — persist any NEW locations this
  // run declared into the durable `vertical_drama_locations` roster (Tab
  // ฉาก), AFTER the bible write succeeds. Best-effort: a failure here must
  // never fail the whole mutation or roll back the bible write, mirroring
  // this router's established "audit/side-effect write must not fail the
  // user-facing mutation" convention (see `recordDeepStoryDraftAuditEvent`'s
  // own doc comment). Never overwrites an existing location's data — see
  // `persistDeepDraftDeclaredLocations`'s own doc comment.
  let createdLocationCount = 0;
  // `result.newLocations ?? []` defensively tolerates a test double / older
  // in-flight mock of `generateStoryBibleDeep` that predates this field —
  // the REAL service always returns `[]` at minimum (see
  // `GenerateStoryBibleDeepResult.newLocations`'s own doc comment).
  const declaredNewLocations = result.newLocations ?? [];
  if (declaredNewLocations.length > 0) {
    try {
      const locationPersistSummary = await persistDeepDraftDeclaredLocations(
        { tenantId, userId, seriesId },
        declaredNewLocations
      );
      createdLocationCount = locationPersistSummary.createdLocations.length;
    } catch (error) {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Failed to persist deep story draft declared locations",
        error
      );
    }
  }

  // Series memory (`planning/vd-series-memory-and-lineage/plan.md` Stage
  // 1.2) — merge every drafted episode's ALREADY-RESOLVED `episodeMemory`
  // into `vertical_drama_series.memory`, AFTER the bible write succeeds.
  // Best-effort, same convention as the location block just above — a
  // failure here must NEVER fail this mutation or roll back the bible
  // write. `generateStoryBibleDeep` always resolves `episodeMemory` for
  // every fresh item (at minimum via a deterministic recap-only fallback —
  // see `DeepDraftedEpisodeItem.episodeMemory`'s own doc comment), so this
  // is the ONE stage that gets memory for every episode, whether or not the
  // series ever reaches script/storyboard/render.
  try {
    await persistDeepDraftEpisodeMemories(
      { tenantId, userId, seriesId },
      result.draftedItems
    );
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to persist deep story draft episode memory",
      error
    );
  }

  // Auto-register story-introduced characters
  // (`planning/vd-auto-register-story-characters/plan.md`) — same
  // "best-effort, AFTER the bible write succeeds, never fail/roll back the
  // user-facing mutation" convention as the location block just above.
  // Candidates: this run's newly-drafted shots' `characters[]`/dialogue
  // `speaker`s (`result.draftedItems`) PLUS the Story Bible's own
  // `refinedCharacters` list (`characterBibleProfiles`, already loaded above
  // for the deep-draft prompt) — see `ensureRosterCharactersFromStory`'s own
  // doc comment for why the two sources are trusted differently.
  //
  // `planning/vd-character-identity-repair/plan.md` Phase 1 — this used to
  // pass `characterBibleNames.map(name => ({ name }))`, discarding the
  // bible's own role/narrativeRole/roleTier/occupation before it ever
  // reached the auto-register INSERT (root cause of every
  // "ต้องตรวจบทบาท" badge on a series whose bible actually HAD the role
  // data). Now passes `characterBibleProfiles` — the full profiles — so a
  // newly-registered, bible-declared character's role is populated on
  // INSERT instead of hardcoded to `null`.
  //
  // Set B — the returned `VdRosterAutoRegisterSummary` used to be discarded
  // here; now captured into the mutation's `createdCharacters` response
  // field (mirrors `createdLocationCount` just above), `EMPTY_...` on any
  // failure (this best-effort block must never fail the mutation).
  let createdCharacters: VdDeepDraftCreatedCharactersSummary =
    EMPTY_DEEP_DRAFT_CREATED_CHARACTERS;
  try {
    const rosterAutoRegisterSummary = await ensureRosterCharactersFromStory(
      { tenantId, userId, seriesId },
      {
        refinedCharacters: characterBibleProfiles,
        deepDraftShots: result.draftedItems.flatMap(item => item.shotDrafts),
      }
    );
    createdCharacters = toDeepDraftCreatedCharactersSummary(
      rosterAutoRegisterSummary
    );
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to auto-register story-introduced characters",
      error
    );
  }

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
    createdLocationCount,
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
    // Production-grade full-story generation — count of NEW locations this
    // run declared AND persisted into `vertical_drama_locations` (Tab ฉาก);
    // always a number (never `undefined`), `0` when this run declared none.
    createdLocationCount,
    // Set B (vd-stuck-generation-and-lost-characters plan) — dialogue
    // speakers / shot characters this run auto-registered into the roster
    // (no DNA/portrait yet); always present, empty when none. See
    // `VdDeepDraftCreatedCharactersSummary`'s own doc comment.
    createdCharacters,
    // Silent-no-op fix (plan
    // `planning/vertical-drama-deep-draft-update-all-noop`, added
    // 2026-07-14) — mirrors the early-return branch above so both shapes of
    // this function's return value carry the same field; `false` here
    // because reaching this point means `result.draftedItems.length > 0` OR
    // a `ledgerPlan` was persisted (the early-return above is the only path
    // that skips this bible write with zero drafted items).
    nothingDrafted: result.draftedItems.length === 0,
  };
}

/**
 * Stage 1.5 (`planning/vd-series-memory-and-lineage/plan.md`) — the fix for
 * the openThreads leak: `runExtendStoryDraftHorizonJob` used to hardcode
 * `priorRecap.openThreads: []` on every call, silently dropping every
 * thread `finalOpenThreads` (`verticalDramaStoryBible.ts`) had already
 * computed on a PRIOR run. Reads the still-open threads back out of
 * `vertical_drama_series.memory` (`row.memory`, already selected in full by
 * `loadOwnedSeries`'s `.select()` — no new query) instead.
 *
 * Mapping choice (`VdOpenThread` -> `string`): `[threadClass] description`.
 * `generateStoryBibleDeep`'s `priorRecap.openThreads` is plain free-text
 * (joined with "; " by `buildDeepDraftContinuityRecap` into one "Currently
 * open threads to track/advance/resolve: ..." prompt line) — there is no
 * structured slot for `threadClass`/`threadId`/`openedEpisode` there, so the
 * class is folded into the string itself (bracket-prefixed) rather than
 * dropped, keeping "the renovation is still unfinished" (domestic) visibly
 * distinct from a plot thread for the model, without inventing a new prompt
 * shape.
 *
 * Graceful degradation (mandatory): EVERY series created before Stage 1.2
 * landed has no `memory` yet (or a legacy/malformed value) — `row.memory`
 * absent/null, not an object, or missing `currentState.openThreads`, all
 * return `[]`, i.e. behave EXACTLY like the hardcoded `[]` this replaces.
 * Never throws — this runs inline in the extend-horizon job's happy path,
 * and a memory-read hiccup must never block drafting.
 */
function resolveOpenThreadsFromSeriesMemory(memory: unknown): string[] {
  if (!memory || typeof memory !== "object") return [];
  const currentState = (memory as { currentState?: unknown }).currentState;
  if (!currentState || typeof currentState !== "object") return [];
  const openThreads = (currentState as { openThreads?: unknown }).openThreads;
  if (!Array.isArray(openThreads)) return [];
  return openThreads
    .filter(
      (thread): thread is VdOpenThread =>
        !!thread &&
        typeof thread === "object" &&
        typeof (thread as VdOpenThread).description === "string" &&
        (thread as VdOpenThread).description.length > 0
    )
    .map(thread =>
      typeof thread.threadClass === "string" && thread.threadClass.length > 0
        ? `[${thread.threadClass}] ${thread.description}`
        : thread.description
    );
}

export async function runExtendStoryDraftHorizonJob(
  params: StoryJobExecutorOwner & {
    additionalEpisodes?: number;
    mode?: VerticalDramaDeepStoryDraftMode;
    idempotencyKey?: string;
  },
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
  /** Resilient resume (added 2026-07-14) — see `runGenerateStoryBibleDeepJob`'s identical param doc comment. */
  resume?: VerticalDramaStoryJobResumeContext
) {
  const resolvedResume: VerticalDramaStoryJobResumeContext = resume ?? {
    checkpoint: null,
    persistCheckpoint: () => {},
  };
  const { tenantId, userId, seriesId } = params;
  const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
  const formatProfilesEnabled =
    await resolveVerticalDramaFormatProfilesFlag(tenantId);
  const motionContractsEnabled =
    await resolveVerticalDramaMotionContractsFlag(tenantId);

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
    createMode: row.createMode,
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

  // Production-grade full-story generation — parity with
  // `runGenerateStoryBibleDeepJob`: the series' known location roster +
  // character-bible names, threaded into the deep-draft prompt ("EXISTING
  // LOCATIONS" FACT block) and the deterministic completeness gate. Loaded
  // ONCE, BEFORE generation, so every extended chunk sees the SAME pre-run
  // baseline (including locations already declared by the earlier
  // generate/extend runs that populated `vertical_drama_locations`), and
  // `generateStoryBibleDeep` grows its own in-memory copy as this run's
  // `new_locations` are accepted chunk-by-chunk.
  const existingLocations = await loadSeriesLocationFacts(
    tenantId,
    userId,
    seriesId
  );
  // Vd character identity repair (`planning/vd-character-identity-repair/
  // plan.md` Phase 1/2.0/2.1/2.5) — parity with
  // `runGenerateStoryBibleDeepJob`'s identical `characterBibleProfiles` +
  // `characterBibleNames` load above; see that block's own doc comments for
  // the full rationale (Phase 1's role-data-preserving INSERT, Phase 2.0's
  // "CHARACTER BIBLE" prompt block, Phase 2.1/2.5's alias-flattened gate set).
  const characterBibleProfiles: VdBibleRefinedCharacter[] =
    readBibleRefinedCharacterProfiles(bible);
  const characterBibleNames = characterBibleProfiles.flatMap(c => [
    c.name,
    ...(c.aliases ?? []),
  ]);

  // Stage 2.4 threading — parity with `runGenerateStoryBibleDeepJob`; a
  // sequel keeps needing these facts on every LATER horizon extension, not
  // just its first deep-draft run. See `resolveSeasonLineageContext`'s own
  // doc comment.
  const seasonLineage = await resolveSeasonLineageContext(
    row,
    tenantId,
    userId
  );

  // Resilient resume — see `runGenerateStoryBibleDeepJob`'s identical block
  // and `resolveDeepDraftResumeState`'s own doc comment for the full
  // rationale (applies here too, since `episodesToDraft` above can still
  // include an episode a prior INTERRUPTED extend attempt already drafted).
  const { alreadyDraftedEpisodeNumbers, resumeDraftedItems } =
    resolveDeepDraftResumeState(existingItems, resolvedResume);
  const onChunkComplete = createDeepDraftCheckpointRelay(resolvedResume);

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
      priorRecap: {
        items: recapItems,
        openThreads: resolveOpenThreadsFromSeriesMemory(row.memory),
      },
      mode,
      // Resilient resume — see the doc comment on this const block above.
      resumeDraftedItems,
      alreadyDraftedEpisodeNumbers,
      onChunkComplete,
      // F131X + finale price_paid rule (see runGenerateStoryBibleDeepJob)
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
      formatProfilesEnabled,
      motionContractsEnabled,
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
      // Production-grade full-story generation — parity with
      // `runGenerateStoryBibleDeepJob`; see the load just above this try.
      existingLocations,
      characterBibleNames,
      // `planning/vd-character-identity-repair/plan.md` Phase 2.0 — parity
      // with `runGenerateStoryBibleDeepJob`'s identical wiring.
      knownCharacters: characterBibleProfiles,
      // Stage 2.4 threading — see this function's own `seasonLineage` load
      // above; parity with `runGenerateStoryBibleDeepJob`'s identical wiring.
      seasonLineage,
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

  // Production-grade full-story generation — parity with
  // `runGenerateStoryBibleDeepJob`: persist any NEW locations this extend run
  // declared into the durable `vertical_drama_locations` roster (Tab ฉาก),
  // AFTER the bible write succeeds. Best-effort (a failure here must never
  // fail the mutation or roll back the bible write); never overwrites an
  // existing location — see `persistDeepDraftDeclaredLocations`'s own doc
  // comment. `result.newLocations ?? []` defensively tolerates a test double
  // predating the field; the real service always returns `[]` at minimum.
  let createdLocationCount = 0;
  const declaredNewLocations = result.newLocations ?? [];
  if (declaredNewLocations.length > 0) {
    try {
      const locationPersistSummary = await persistDeepDraftDeclaredLocations(
        { tenantId, userId, seriesId },
        declaredNewLocations
      );
      createdLocationCount = locationPersistSummary.createdLocations.length;
    } catch (error) {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Failed to persist deep story draft declared locations (extend)",
        error
      );
    }
  }

  // Series memory (`planning/vd-series-memory-and-lineage/plan.md` Stage
  // 1.2) — parity with `runGenerateStoryBibleDeepJob`'s identical block
  // above; see that block's own doc comment for the full rationale.
  try {
    await persistDeepDraftEpisodeMemories(
      { tenantId, userId, seriesId },
      result.draftedItems
    );
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to persist deep story draft episode memory (extend)",
      error
    );
  }

  // Auto-register story-introduced characters
  // (`planning/vd-auto-register-story-characters/plan.md`) — parity with
  // `runGenerateStoryBibleDeepJob`'s identical block above; see that block's
  // own doc comment for the full rationale, including the
  // `planning/vd-character-identity-repair/plan.md` Phase 1 fix (role data
  // now threaded via `characterBibleProfiles` instead of being discarded).
  //
  // Set B — see `runGenerateStoryBibleDeepJob`'s identical capture above.
  let createdCharacters: VdDeepDraftCreatedCharactersSummary =
    EMPTY_DEEP_DRAFT_CREATED_CHARACTERS;
  try {
    const rosterAutoRegisterSummary = await ensureRosterCharactersFromStory(
      { tenantId, userId, seriesId },
      {
        refinedCharacters: characterBibleProfiles,
        deepDraftShots: result.draftedItems.flatMap(item => item.shotDrafts),
      }
    );
    createdCharacters = toDeepDraftCreatedCharactersSummary(
      rosterAutoRegisterSummary
    );
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to auto-register story-introduced characters (extend)",
      error
    );
  }

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
    createdLocationCount,
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
    // Production-grade full-story generation — see
    // `runGenerateStoryBibleDeepJob`'s identical field; count of NEW locations
    // this extend run persisted into Tab ฉาก (always a number, `0` when none).
    createdLocationCount,
    // Set B — see `runGenerateStoryBibleDeepJob`'s identical field.
    createdCharacters,
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
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
  /**
   * Resilient resume (added 2026-07-14) — always passed by
   * `runVerticalDramaStoryJob` (this is the concrete
   * `VerticalDramaStoryJobExecutor` registered onto the BullMQ worker, see
   * `verticalDramaStoryJobs.ts`'s `initVerticalDramaStoryJobsQueue`), so this
   * stays a required param here (unlike the two job functions it dispatches
   * to below, which keep it optional for their own pre-existing test call
   * sites). Only `"deep_generate"`/`"extend"` forward it — `"improve_script"`
   * has no checkpoint/resume concept of its own and simply never reads it.
   */
  resume: VerticalDramaStoryJobResumeContext
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
        onProgress,
        resume
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
        onProgress,
        resume
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
 * Compares an `updateEpisodeDraftShot` `lines` submission against a shot's
 * currently STORED `dialogue_lines`, applying the SAME `speaker` placeholder
 * normalization `applyManualDialogueEdit` stores
 * (`VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER` when omitted/blank) — so a
 * resubmission of the exact same content is correctly recognized as
 * unchanged even when the client omits `speaker`. `delivery` is compared
 * `undefined`-normalized (an omitted `delivery` in the submission matches a
 * stored line with no `delivery`). Used ONLY by `updateEpisodeDraftShot`'s
 * no-op short-circuit — never mutates either argument.
 */
function linesMatchStoredDialogue(
  stored: readonly { speaker: string; line: string; delivery?: string }[],
  submitted: readonly { speaker?: string; line: string; delivery?: string }[]
): boolean {
  if (stored.length !== submitted.length) return false;
  return stored.every((storedLine, index) => {
    const submittedLine = submitted[index];
    const normalizedSpeaker =
      submittedLine.speaker && submittedLine.speaker.length > 0
        ? submittedLine.speaker
        : VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER;
    return (
      storedLine.speaker === normalizedSpeaker &&
      storedLine.line === submittedLine.line &&
      (storedLine.delivery ?? undefined) ===
        (submittedLine.delivery ?? undefined)
    );
  });
}

/**
 * Resolves the ACTIVE breakdown version + item `updateEpisodeDraftSynopsis`
 * needs, or throws NOT_FOUND with the same "no draft" convention
 * `loadManualDialogueEditTarget` above uses (one generic Thai message,
 * never discloses which specific thing is missing). Unlike
 * `loadManualDialogueEditTarget`, this does NOT require `shotDrafts` to be
 * present — a synopsis (logline) exists on every breakdown item as soon as
 * it's planned, deep-drafted or not.
 */
function loadEpisodeSynopsisEditTarget(
  bible: Record<string, unknown>,
  episodeNumber: number
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

  if (activeIndex < 0 || !item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "ไม่มีร่างสำหรับตอนนี้",
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
 * Best-effort audit record for `updateEpisodeDraftSynopsis` — sibling of
 * `recordManualDialogueEditAuditEvent` immediately above, same "cross-cutting
 * `api_audit_events` insert, never throws" convention. Only called on a
 * FRESH (non-no-op) edit — an unchanged-logline submit is a complete no-op
 * and is never separately audited (mirrors the replay-skip behavior of the
 * dialogue edit's own audit call, one call site up).
 */
async function recordManualSynopsisEditAuditEvent(params: {
  userId: number;
  seriesId: number;
  episodeNumber: number;
  idempotencyKey?: string;
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: "vertical_drama_manual_synopsis_edit",
      userId: params.userId,
      endpoint: "verticalDramaSeries.updateEpisodeDraftSynopsis",
      statusCode: 200,
      skillSlug: "vertical-drama-deep-story-draft",
      creditsCharged: 0,
      metadata: {
        seriesId: params.seriesId,
        episodeNumber: params.episodeNumber,
        idempotencyKey: params.idempotencyKey ?? null,
      },
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.updateEpisodeDraftSynopsis",
      "Failed to record manual synopsis edit audit event",
      error
    );
  }
}

/**
 * Best-effort audit record for `updateEpisodeDraftShot` (combined
 * summary+dialogue edit) — sibling of
 * `recordManualDialogueEditAuditEvent`/`recordManualSynopsisEditAuditEvent`
 * above, same "cross-cutting `api_audit_events` insert, never throws"
 * convention. Only called on a FRESH (non-replay, non-no-op) edit — an
 * idempotent replay or an unchanged submit is a complete no-op and is never
 * separately audited (mirrors both sibling mutations' own audit-skip
 * behavior). `summaryChanged`/`linesChanged` record which of the two
 * optional fields this particular call actually applied.
 */
async function recordManualShotEditAuditEvent(params: {
  userId: number;
  seriesId: number;
  episodeNumber: number;
  shotNumber: number;
  summaryChanged: boolean;
  linesChanged: boolean;
  idempotencyKey?: string;
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: "vertical_drama_manual_shot_edit",
      userId: params.userId,
      endpoint: "verticalDramaSeries.updateEpisodeDraftShot",
      statusCode: 200,
      skillSlug: "vertical-drama-deep-story-draft",
      creditsCharged: 0,
      metadata: {
        seriesId: params.seriesId,
        episodeNumber: params.episodeNumber,
        shotNumber: params.shotNumber,
        summaryChanged: params.summaryChanged,
        linesChanged: params.linesChanged,
        idempotencyKey: params.idempotencyKey ?? null,
      },
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.updateEpisodeDraftShot",
      "Failed to record manual shot edit audit event",
      error
    );
  }
}

/**
 * Best-effort sync of the materialized `vertical_drama_episodes` row's
 * `script._draftSummary.logline` for one series/episode (see
 * `verticalDramaEpisodes.ts`'s own write site at the episode-materialize
 * mutation, and the matching read-with-fallback a few hundred lines above
 * it). A missing row (episode not yet materialized) or a `script` without a
 * `_draftSummary` object is the NORMAL case for most series and is silently
 * skipped, never logged as an error. Only unexpected failures (a thrown
 * query/update) are caught and logged — this must NEVER fail the calling
 * mutation, since `bible` is the source of truth and this is purely a
 * denormalized-copy refresh.
 */
async function syncEpisodeDraftSummarySynopsis(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeNumber: number;
  logline: string;
}): Promise<void> {
  try {
    const [episodeRow] = await db
      .select({
        id: verticalDramaEpisodes.id,
        script: verticalDramaEpisodes.script,
      })
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.tenantId, params.tenantId),
          eq(verticalDramaEpisodes.userId, params.userId),
          eq(verticalDramaEpisodes.seriesId, params.seriesId),
          eq(verticalDramaEpisodes.episodeNumber, params.episodeNumber)
        )
      )
      .limit(1);
    if (!episodeRow) return;

    const script =
      (episodeRow.script as Record<string, unknown> | null) ?? null;
    const draftSummary = script?._draftSummary;
    if (!script || !draftSummary || typeof draftSummary !== "object") return;

    await db
      .update(verticalDramaEpisodes)
      .set({
        script: {
          ...script,
          _draftSummary: { ...draftSummary, logline: params.logline },
        },
      })
      .where(eq(verticalDramaEpisodes.id, episodeRow.id));
  } catch (error) {
    debugError(
      "verticalDramaSeries.updateEpisodeDraftSynopsis",
      "Failed to sync materialized episode draft summary logline",
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
function parseCharactersDraft(draft: string): Array<{
  name: string;
  role: string;
  description: string;
  narrativeRole?: NarrativeRole;
  roleTier?: RoleTier;
  occupation?: string;
  roleReviewStatus: "ready" | "needs_role_review";
}> {
  return draft
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.+?)\s+—\s+(.+?):\s*(.*)$/);
      if (match) {
        const legacy = normalizeLegacyRole(match[2]);
        return {
          name: match[1].trim(),
          role: match[2].trim(),
          description: match[3].trim(),
          narrativeRole: legacy.narrativeRole ?? undefined,
          roleTier: legacy.roleTier ?? undefined,
          occupation: match[2].trim(),
          roleReviewStatus: legacy.reviewStatus,
        };
      }
      return {
        name: line,
        role: "",
        description: "",
        occupation: undefined,
        roleReviewStatus: "needs_role_review",
      };
    });
}

const presetCharacterProfileSchema = z.object({
  name: z.string().trim().min(1),
  speechProfile: z.unknown().optional(),
  personality: z.unknown().optional(),
  narrativeRole: narrativeRoleSchema.nullable().optional(),
  roleTier: roleTierSchema.nullable().optional(),
  occupation: z.string().trim().max(160).nullable().optional(),
});

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
      narrativeRole?: NarrativeRole;
      roleTier?: RoleTier;
      occupation?: string;
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
    narrativeRole?: NarrativeRole | null;
    roleTier?: RoleTier | null;
    occupation?: string | null;
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

    const legacy = normalizeLegacyRole(character.role);
    const narrativeRole =
      matchedProfile?.narrativeRole ??
      character.narrativeRole ??
      legacy.narrativeRole;
    const roleTier =
      matchedProfile?.roleTier ?? character.roleTier ?? legacy.roleTier;
    const occupation =
      matchedProfile?.occupation ??
      character.occupation ??
      (character.role || null);

    return {
      tenantId,
      userId,
      seriesId,
      characterKey: key,
      name: character.name,
      role: character.role || null,
      narrativeRole: narrativeRole ?? null,
      roleTier: roleTier ?? null,
      occupation,
      roleProvenance:
        matchedProfile?.narrativeRole || matchedProfile?.roleTier
          ? "ai_assigned"
          : "migrated",
      roleReviewStatus:
        narrativeRole && roleTier ? "ready" : "needs_role_review",
      data: Object.keys(data).length > 0 ? data : null,
    } as typeof verticalDramaCharacters.$inferInsert;
  });

  await db.insert(verticalDramaCharacters).values(rows);
}

/**
 * Persist the canonical narrative role emitted by Story Bible generation onto
 * the durable character roster. Legacy free-text `role` is never overwritten;
 * user-confirmed assignments are also never downgraded by a later AI run.
 *
 * `planning/vd-character-identity-repair/plan.md` Phase 6.2 — closes the
 * NEW-PROJECT (wizard) path hole: this function used to match ONLY by exact
 * normalized name, so a bible refinement that RENAMES a wizard-seeded roster
 * row (`ผู้บงการ(คนร้าย)` seeded by `seedCharactersFromDraft` at series
 * creation, refined by the bible to `ผู้บงการ`) could never find its roster
 * row, silently `continue`d, and left the row's roles NULL forever — the
 * very next deep draft would then have `ensureRosterCharactersFromStory`
 * mint a genuine SECOND row for `ผู้บงการ`, reproducing the plan's original
 * duplicate-roster bug from a brand-new project. The match cascade below
 * closes that hole with a THIRD, alias-aware step; the fix is intentionally
 * narrow (exact-or-declared only, never fuzzy/edit-distance — see this
 * function's own cascade doc comment).
 *
 * RENAME-vs-KEEP decision (required by the Phase 6.2 brief): when a bible
 * profile resolves to an EXISTING roster row via an alias (cascade steps 2/3
 * below) rather than by its own name, this function deliberately does NOT
 * rename that row's `name` column to the bible's canonical spelling. Two
 * reasons: (1) the wizard's `charactersDraft` name is something the human
 * creator typed on purpose — silently overwriting it with the model's
 * refined spelling is exactly the class of "AI overwrites a human's own
 * input" bug this plan exists to eliminate elsewhere (see the
 * `roleProvenance === "user_confirmed"` skip a few lines below, and the
 * plan's own resolved decision #2, "story text is never rewritten, aliased
 * instead"); (2) leaving the row's name untouched and recording the bible's
 * name as an alias is STRICTLY ADDITIVE and reversible — a future merge tool
 * or a human can still rename the row later with full information, whereas
 * an automatic rename here cannot be un-done once other data (asset links,
 * `characterKey`-based refs) has accumulated against whichever spelling won.
 * The tradeoff is that the roster UI keeps showing the wizard's original
 * spelling rather than the bible's refined one; that's a display nuance, not
 * a correctness bug, and is a reasonable follow-up for the merge-review UI
 * (plan Phase 3.4) to offer as an explicit, human-confirmed action — not
 * something this reconcile pass should ever decide unattended.
 */
export async function reconcileCharactersFromStoryBible(
  tenantId: string,
  userId: number,
  seriesId: number,
  refinedCharacters: Array<{
    name: string;
    role?: string;
    narrativeRole?: NarrativeRole;
    roleTier?: RoleTier;
    occupation?: string;
    /** Phase 6.1 — see `VdRosterAutoRegisterRefinedCharacter.aliases`'s own doc comment. */
    aliases?: string[];
  }>
): Promise<void> {
  if (refinedCharacters.length === 0) return;
  const roster = (await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    )) as VerticalDramaCharacterRow[];
  const byNormalizedName = new Map(
    roster.map(character => [
      normalizeStoryCharacterName(character.name),
      character,
    ])
  );
  const byId = new Map(roster.map(character => [character.id, character]));

  // Already-persisted aliases for this series — cascade step 2 below.
  // Mirrors `ensureRosterCharactersFromStory`'s own alias read
  // (`verticalDramaCharacterRosterAutoRegister.ts`), which this function
  // does not modify.
  const aliasRows = (await db
    .select()
    .from(verticalDramaCharacterAliases)
    .where(
      and(
        eq(verticalDramaCharacterAliases.tenantId, tenantId),
        eq(verticalDramaCharacterAliases.seriesId, seriesId)
      )
    )) as VerticalDramaCharacterAliasRow[];
  const characterIdByPersistedAlias = new Map(
    aliasRows.map(row => [row.normalizedAlias, row.characterId])
  );

  // Whole batch atomic (Database Safety Protocol) — a partial reconcile
  // (some characters updated, an unrelated one mid-write when the DB
  // rejects a later statement) is worse than all-or-nothing for a single
  // bible-expansion run. Mirrors `ensureRosterCharactersFromStory`'s own
  // `db.transaction` wrapping of its insert+alias-seed batch.
  await db.transaction(async tx => {
    for (const profile of refinedCharacters) {
      const normalizedProfileName = normalizeStoryCharacterName(profile.name);

      // Cascade, exact-or-declared only — NEVER fuzzy/edit-distance (see
      // this function's own doc comment): "ผู้บงการ" vs "ผู้บงการ(คนร้าย)" is
      // only knowable because the bible DECLARES the link, not because the
      // strings look similar.
      //
      // Step 1 — exact normalized name (today's original, pre-Phase-6
      // behavior).
      let character = byNormalizedName.get(normalizedProfileName);
      // True once `character` resolved via step 2 or 3 rather than step 1 —
      // gates the alias-linkage write below (a step-1 exact match needs no
      // new alias row; the character's OWN name already IS its identity).
      let matchedViaAlias = false;

      // Step 2 — a `vertical_drama_character_aliases` row already resolves
      // this bible name to a roster character (recorded by an earlier
      // reconcile run, or seeded by `ensureRosterCharactersFromStory` during
      // a deep-draft run).
      if (!character) {
        const aliasedCharacterId = characterIdByPersistedAlias.get(
          normalizedProfileName
        );
        if (aliasedCharacterId !== undefined) {
          character = byId.get(aliasedCharacterId);
          matchedViaAlias = character !== undefined;
        }
      }

      // Step 3 — THIS bible entry's OWN declared `aliases[]` names an
      // EXISTING roster character. This is the wizard-rename case: the
      // bible's canonical `profile.name` ("ผู้บงการ") doesn't match any
      // roster row, but one of ITS declared aliases ("ผู้บงการ(คนร้าย)")
      // matches the roster row the wizard originally seeded.
      if (!character) {
        for (const alias of profile.aliases ?? []) {
          const normalizedAlias = normalizeStoryCharacterName(alias);
          if (!normalizedAlias || normalizedAlias === normalizedProfileName) {
            continue;
          }
          const candidate = byNormalizedName.get(normalizedAlias);
          if (candidate) {
            character = candidate;
            matchedViaAlias = true;
            break;
          }
        }
      }

      if (!character) continue; // Genuinely unresolvable here — left for
      // `ensureRosterCharactersFromStory` (INSERT-capable) to create later,
      // per this function's UPDATE-only contract; see the doc comment above
      // this function for why it must never insert a character row itself.

      // A human's own decision outranks a later AI run, unchanged from
      // before Phase 6 — but this ONLY skips the ROLE fields below. Alias
      // linkage is not a role judgment; it merely records "these two
      // strings name the same person", which the human implicitly already
      // agreed to by keeping this row. Skipping alias recording here would
      // leave a `user_confirmed` character exposed to the exact duplicate-
      // insert risk this whole cascade exists to close.
      const isUserConfirmed = character.roleProvenance === "user_confirmed";
      if (!isUserConfirmed) {
        const narrativeRole = profile.narrativeRole ?? null;
        const roleTier = profile.roleTier ?? null;
        await tx
          .update(verticalDramaCharacters)
          .set({
            narrativeRole,
            roleTier,
            occupation:
              profile.occupation ??
              profile.role ??
              character.occupation ??
              character.role,
            roleProvenance:
              narrativeRole || roleTier ? "ai_assigned" : "migrated",
            roleReviewStatus:
              narrativeRole && roleTier ? "ready" : "needs_role_review",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaCharacters.id, character.id),
              eq(verticalDramaCharacters.tenantId, tenantId),
              eq(verticalDramaCharacters.userId, userId),
              eq(verticalDramaCharacters.seriesId, seriesId)
            )
          );
      }

      // Record the linkage so a LATER run (this function's own step-2
      // cascade above, PLUS `ensureRosterCharactersFromStory`'s
      // `existingAliasNames` dedup guard) resolves `profile.name` -> this
      // SAME roster row without re-deriving it from `aliases[]` every time.
      // `onConflictDoNothing` on the UNIQUE `(seriesId, normalizedAlias)`
      // index makes this idempotent — re-running the same expansion writes
      // nothing new and never aborts the transaction on a 23505, same
      // precedent as `ensureRosterCharactersFromStory`'s own alias-seeding
      // loop.
      if (matchedViaAlias) {
        await tx
          .insert(verticalDramaCharacterAliases)
          .values({
            tenantId,
            seriesId,
            characterId: character.id,
            alias: profile.name.trim(),
            normalizedAlias: normalizedProfileName,
            source: "bible_declared",
          } as typeof verticalDramaCharacterAliases.$inferInsert)
          .onConflictDoNothing();
      }
    }
  });
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
export const createSeriesInput = z
  .object({
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
    lookLock: z
      .object({
        mode: z.enum(["inherit_source", "genre", "manual", "none"]),
        genreKey: z.enum(VD_LOOK_LOCK_GENRES).optional(),
        manualPatch: z.unknown().optional(),
        candidateIdentity: z.unknown().optional(),
      })
      .optional(),
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
    /**
     * Season/special-edition lineage (Part 2, Stage 2.1/2.3,
     * `planning/vd-series-memory-and-lineage/plan.md`). All 4 fields are
     * optional and, when the `verticalDramaSeriesLineage` tenant flag is off
     * (or `parentSeriesId` is absent), `create` below writes every one of the
     * matching `vertical_drama_series` columns as `NULL` — the exact
     * "original mode is unchanged" structural guarantee the schema's own doc
     * comment describes. `lineage` is a lossless `z.record(...)`, same
     * "wizard shell payload, validated by its own contract" convention as
     * `bible`/`memory`/`productTieIn`/`policy` above — the client's `as`-cast
     * against this uniformly-untyped wizard is not this router's problem.
     */
    parentSeriesId: z.string().trim().min(1).optional(),
    createMode: z.enum(VERTICAL_DRAMA_SERIES_CREATE_MODES).optional(),
    seasonNumber: z.number().int().positive().optional(),
    lineage: z.record(z.string(), z.unknown()).optional(),
    /**
     * Manual LLM model override (same contract as `setSeriesLlmModelPolicy`'s
     * `defaultModelId`, added so the wizard can pin the series' model
     * ATOMICALLY at creation time — the wizard fires its background
     * story-generation mutation the instant `create` returns, so a follow-up
     * `setSeriesLlmModelPolicy` call would race that generation). Omitted OR
     * explicit `null` -> automatic (the stage's own quality/large-context
     * model selector picks the model, `llmModelPolicy.defaultModelId` written
     * as `null`); a non-null string is validated against the same eligible set
     * `setSeriesLlmModelPolicy` uses and, if not eligible, `create` throws
     * `BAD_REQUEST` before any row is inserted.
     */
    defaultModelId: z.string().min(1).nullable().optional(),
  })
  /**
   * Stage 1.5 (`planning/vd-series-memory-and-lineage/plan.md`) — genre
   * pollution guard. Runs AFTER every per-field `.max()` check above (zod
   * `superRefine` always runs after the base object shape parses), so a
   * `genre` that is merely too long is still reported as the ordinary
   * `too_big` issue; this only fires for a `genre` that parsed fine on
   * length but is a copy of `title` or logline/alt-title-shaped. See
   * `@shared/verticalDramaSeries/genrePollutionGuard`'s header doc comment
   * for the real-data investigation and why this rule is conservative.
   * There is no separate "update genre" mutation (`updateSeriesInput` does
   * not carry `genre`), so `create` is the only write path this needs.
   */
  .superRefine((data, ctx) => {
    const reason = detectGenrePollution(data.genre, data.title);
    if (reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["genre"],
        message: genrePollutionErrorMessage(reason),
      });
    }
    if (data.lookLock?.mode === "genre" && !data.lookLock.genreKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lookLock", "genreKey"],
        message: "genreKey is required for genre mode",
      });
    }
    if (
      data.lookLock?.mode === "manual" &&
      data.lookLock.manualPatch === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lookLock", "manualPatch"],
        message: "manualPatch is required for manual mode",
      });
    }
    // Stage 2.1 — a `createMode` with no `parentSeriesId` is a malformed
    // lineage request (a sequel/special-edition with no parent to derive
    // from is meaningless); catching this here, not just in `create`,
    // keeps the input contract itself self-consistent.
    if (data.createMode && !data.parentSeriesId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentSeriesId"],
        message: "parentSeriesId is required when createMode is set",
      });
    }
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
  /** Create-Series basics-only synthesis facts (no preset/premise required). */
  seriesTitleHint: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.title)
    .optional(),
  genreHint: z.string().trim().max(CREATE_SERIES_FIELD_LIMITS.genre).optional(),
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
  /** Same contract as `createSeriesInput.audienceAgeRating`; forwarded into synthesis. */
  audienceAgeRating: z.enum(AUDIENCE_AGE_RATINGS).optional(),
  /**
   * Same bounded lineage/carry-over snapshot the wizard will later persist on
   * `create`; lets a pre-create basics-only draft preserve sequel continuity.
   */
  lineageContext: z
    .record(z.string(), z.unknown())
    .refine(value => JSON.stringify(value).length <= 12_000, {
      message: "Lineage context is too large",
    })
    .optional(),
});

/**
 * Stage 2.2 (`planning/vd-series-memory-and-lineage/plan.md`) —
 * `proposeSeasonCarryOver`'s input. `parentSeriesId` is required (unlike
 * `createSeriesInput`'s optional field): this procedure only ever makes
 * sense FOR a chosen parent, whereas `create` also serves the unrelated
 * "original series" path.
 */
export const proposeSeasonCarryOverInput = z.object({
  parentSeriesId: z.string().trim().min(1),
  /** Free-form "โจทย์ภาคใหม่ที่อยากได้" — same top-level convention as `createSeriesInput.userPremise`. */
  premise: z
    .string()
    .trim()
    .max(CREATE_SERIES_FIELD_LIMITS.userPremise)
    .optional(),
});

/**
 * Stage 2.5 (`planning/vd-series-memory-and-lineage/plan.md`) —
 * `proposeSpecialEditionBrief`'s input. `parentSeriesId` is required, same
 * reasoning as `proposeSeasonCarryOverInput` above. `storyFunctionChoice`
 * values mirror `VD_SPECIAL_EDITION_STORY_FUNCTION_CHOICES`
 * (`verticalDramaProductTieIn.ts`) verbatim — inlined here (rather than
 * imported) purely to keep this router's top-level zod schemas free of a
 * static import into that service file; the two are guarded against drift
 * by `verticalDramaProductTieIn.test.ts`'s own coverage of that constant.
 * `marketplaceProductName`/`marketplaceProductDescription` (source 1) and
 * `uploadedSummary` (source 2) are BOTH optional — a special edition may
 * lean on only one source; at least one should be meaningfully populated by
 * the wizard, but this procedure does not hard-require it (the skill itself
 * can still plan around bare `premise`/roster facts if both are empty).
 */
export const proposeSpecialEditionBriefInput = z.object({
  parentSeriesId: z.string().trim().min(1),
  targetEpisodeCount: z.number().int().min(1).max(2),
  storyFunctionChoice: z.enum(["review", "tie_in_solution"]),
  marketplaceProductName: z.string().trim().max(256).optional(),
  marketplaceProductDescription: z.string().trim().max(4000).optional(),
  uploadedSummary: z.string().trim().max(4000).optional(),
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
 * `updateEpisodeDraftSynopsis` (manual "เรื่องย่อ" edit) input — lets a user
 * directly edit a Sub-episode's `logline`, same ownership/procedure gate as
 * `updateEpisodeDraftDialogueInput` above. `max(1200)` is a literal number
 * (not an imported constant) for the same cross-module-mock reason that
 * file's doc comment gives for its own literal limits.
 */
export const updateEpisodeDraftSynopsisInput = z.object({
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  logline: z.string().trim().min(1).max(1200),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

/**
 * `updateEpisodeDraftShot` (combined manual "แก้เรื่องย่อช็อต" + "แก้บทพูด"
 * edit, revised 2026-07-22 — a summary-only mutation was originally
 * planned, then widened to combine BOTH fields into one save because a
 * wrong-dialogue fix and a wrong-summary fix usually happen at the same
 * time) — lets a user directly edit ONE shot's `summary` heading text
 * ("ช็อต N — <summary>") and/or its `dialogue_lines`, in the SAME
 * mutation/write, within a Sub-episode's `shotDrafts[]`. Same ownership/
 * procedure gate as `updateEpisodeDraftDialogueInput`/
 * `updateEpisodeDraftSynopsisInput` above. `lines` reuses
 * `updateEpisodeDraftDialogueLineInput`/its `max(8)` array limit VERBATIM
 * (not redefined) — same shape `updateEpisodeDraftDialogueInput` above
 * validates with. `shotNumber`'s `max(9)` and `summary`'s `max(600)` are
 * LITERAL numbers (9 mirrors the service's `VD_DEEP_DRAFT_SHOTS_PER_EPISODE`)
 * for the same cross-module-mock reason this file's Manual dialogue edits
 * import block doc comment gives for its own literal limits. The
 * `superRefine` below requires at least one of `summary`/`lines` — a
 * request with neither is meaningless (nothing to save).
 */
export const updateEpisodeDraftShotInput = z
  .object({
    seriesId: z.string().min(1),
    episodeNumber: z.number().int().positive(),
    shotNumber: z.number().int().min(1).max(9),
    summary: z.string().trim().min(1).max(600).optional(),
    lines: z.array(updateEpisodeDraftDialogueLineInput).max(8).optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.summary === undefined && value.lines === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ต้องระบุเรื่องย่อหรือบทพูดอย่างน้อยหนึ่งอย่าง",
        path: ["summary"],
      });
    }
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
  setSeriesLookLock: verticalDramaSeriesLookLockProcedure
    .input(setSeriesLookLockInput)
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

      try {
        const result = await db.transaction(async tx => {
          const [row] = await tx
            .select({ bible: verticalDramaSeries.bible })
            .from(verticalDramaSeries)
            .where(seriesOwnershipWhere(tenantId, userId, seriesId))
            .for("update");
          if (!row) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Series not found",
            });
          }

          const transition = applySeriesLookLockTransition({
            bible: row.bible,
            mode: input.mode,
            genreKey: input.genreKey,
            manualPatch: input.manualPatch,
            expectedRevision: input.expectedRevision,
            now: new Date().toISOString(),
          });
          await tx
            .update(verticalDramaSeries)
            .set({ bible: transition.bible, updatedAt: new Date() })
            .where(seriesOwnershipWhere(tenantId, userId, seriesId));
          return transition;
        });
        await recordSeriesLookLockAuditEvent({
          eventType: VD_SERIES_LOOK_LOCK_CHANGED_EVENT,
          tenantId,
          userId,
          seriesId,
          mode: input.mode,
          revision: result.control.revision,
          outcome: "updated",
        });
        return { control: result.control };
      } catch (error) {
        if (
          error instanceof SeriesLookLockTransitionError &&
          error.reason === "conflict"
        ) {
          await recordSeriesLookLockAuditEvent({
            eventType: VD_SERIES_LOOK_LOCK_CHANGED_EVENT,
            tenantId,
            userId,
            seriesId,
            mode: input.mode,
            revision: error.currentRevision,
            outcome: "conflict",
          });
          throw new TRPCError({
            code: "CONFLICT",
            message: `Series look changed; reload revision ${error.currentRevision}`,
            cause: error,
          });
        }
        if (error instanceof SeriesLookLockTransitionError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

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
            // Series lineage (Stage 2.6) — additive, `null`/absent for the
            // overwhelming majority (original-mode series). The sidebar list
            // card reads these to render a "ภาค N" / "ภาคพิเศษ ของ <parent>"
            // badge; `list` (not `get`) is what the shell actually queries, so
            // these must be projected here or the badge silently never renders.
            createMode: row.createMode ?? null,
            seasonNumber: row.seasonNumber ?? null,
            parentSeriesId:
              row.parentSeriesId != null ? String(row.parentSeriesId) : null,
            // Only the parentTitle is surfaced (not the whole `lineage` blob —
            // it carries carry-over decisions and is larger than a list card
            // needs). Shape matches what `VerticalDramaShell`'s badge reads:
            // `item.lineage?.parentTitle`.
            lineage: (() => {
              const parentTitle = (
                row.lineage as { parentTitle?: unknown } | null
              )?.parentTitle;
              return typeof parentTitle === "string" ? { parentTitle } : null;
            })(),
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

      // Manual LLM model override (`input.defaultModelId`) — validated BEFORE
      // any other work (mirrors `setSeriesLlmModelPolicy`'s own eligibility
      // check exactly, so the two never drift) and PERSISTED atomically in
      // this same insert below (see `insertValues.llmModelPolicy`), rather
      // than via a follow-up `setSeriesLlmModelPolicy` call — the wizard
      // fires its background story-generation mutation the instant `create`
      // returns, which would otherwise race an un-pinned series. Skipped
      // entirely (no DB round-trip) when omitted/`null` — the common,
      // "automatic" case.
      if (input.defaultModelId != null) {
        const { loadEnabledLlmModelRows } =
          await import("../services/enabledLlmModels");
        const { selectQualityLargeContextEligibleModels } =
          await import("../services/verticalDramaImproveScript");
        const eligibleRows = await loadEnabledLlmModelRows({
          autoSelectionOnly: true,
        });
        const eligibleModelIds = new Set(
          selectQualityLargeContextEligibleModels(eligibleRows).map(
            row => row.modelId
          )
        );
        if (!eligibleModelIds.has(input.defaultModelId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Model "${input.defaultModelId}" is not eligible for this planning stage`,
          });
        }
      }

      // Season/special-edition lineage (Stage 2.1/2.3) — resolved BEFORE the
      // insert so the new row's `parentSeriesId`/`createMode`/`seasonNumber`/
      // `lineage` columns are written correctly at creation time (no
      // follow-up UPDATE needed). `parentSeriesRow` stays `null` — and every
      // one of those 4 columns is written `NULL` below — unless BOTH the
      // tenant flag is on AND `input.parentSeriesId` was sent; this is the
      // "flag off -> byte-identical original-mode create" guarantee.
      //
      // Ownership of the parent is a HARD THROW (`loadOwnedSeries`, NOT
      // wrapped in try/catch): a cross-tenant/cross-user parent silently
      // yielding an empty sequel is a data-leak-shaped bug, never a
      // best-effort degrade. Everything AFTER this point (character/location
      // cloning) is best-effort, per this mutation's own established
      // convention for `charactersDraft`/`locationsDraft` seeding below.
      let parentSeriesRow: VerticalDramaSeriesRow | null = null;
      if (input.parentSeriesId) {
        const flags = await getTenantFeatureFlags(tenantId);
        if (flags.verticalDramaSeriesLineage === true) {
          const parentSeriesIdNum = Number(input.parentSeriesId);
          if (!Number.isFinite(parentSeriesIdNum)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid parentSeriesId",
            });
          }
          parentSeriesRow = await loadOwnedSeries(
            tenantId,
            userId,
            parentSeriesIdNum
          );
        }
      }

      // Special edition (Stage 2.5, `planning/vd-series-memory-and-lineage/
      // plan.md`) — build a FULLY POPULATED, contract-valid `productTieIn`
      // instead of writing `input.productTieIn` through unvalidated (today's
      // behavior for every OTHER createMode, unchanged below). Gated on
      // `parentSeriesRow` being resolved (same flag+ownership gate as the 4
      // lineage columns above) so a flag-off or unowned-parent request stays
      // byte-identical to original-mode create — never build this object
      // unless the row itself will actually be persisted as special_edition.
      let resolvedProductTieIn: Record<string, unknown> | null = null;
      if (parentSeriesRow && input.createMode === "special_edition") {
        const rawProductTieIn = (input.productTieIn ?? {}) as Record<
          string,
          unknown
        >;

        // Stage 2.5 source 2 — uploaded reference images register as media
        // assets BEST-EFFORT (never fails series creation), mirroring the
        // `charactersDraft`/`locationsDraft` seeding blocks' own established
        // convention just below. Cannot use `resolveMediaAssetForImport`
        // (`verticalDramaCharacters.ts`) — it requires an already-existing
        // seriesId via `loadOwnedSeries`, which does not exist yet at wizard
        // time; `createAssetFromAttachment` needs only tenant+user context
        // (same `{ tenantId, userId } as any` cast that file's own
        // `resolveMediaAssetForImport` already uses for the identical
        // context-shape mismatch).
        const uploadedReferenceAssetIds: string[] = [];
        const uploadedReferences = Array.isArray(
          rawProductTieIn.uploadedReferences
        )
          ? (rawProductTieIn.uploadedReferences as unknown[])
          : [];
        if (uploadedReferences.length > 0) {
          const { createAssetFromAttachment } =
            await import("../services/mediaAssetService");
          for (const entryRaw of uploadedReferences) {
            if (!entryRaw || typeof entryRaw !== "object") continue;
            const entry = entryRaw as {
              url?: unknown;
              mimeType?: unknown;
              fileName?: unknown;
            };
            if (typeof entry.url !== "string" || !entry.url.trim()) continue;
            try {
              const { assetId } = await createAssetFromAttachment(
                {
                  type: "image",
                  url: entry.url,
                  mimeType:
                    typeof entry.mimeType === "string"
                      ? entry.mimeType
                      : undefined,
                  name:
                    typeof entry.fileName === "string"
                      ? entry.fileName
                      : undefined,
                } as any,
                { tenantId, userId } as any
              );
              uploadedReferenceAssetIds.push(String(assetId));
            } catch (error) {
              debugError(
                "verticalDramaSeries.create",
                "Failed to register a special-edition uploaded reference image as a media asset",
                error
              );
            }
          }
        }

        const {
          buildSpecialEditionProductTieInConfig,
          verticalDramaProductTieInConfigSchema,
        } = await import("../services/verticalDramaProductTieIn");
        const builtConfig = buildSpecialEditionProductTieInConfig({
          raw: rawProductTieIn,
          uploadedReferenceAssetIds,
        });
        const parsedConfig =
          verticalDramaProductTieInConfigSchema.safeParse(builtConfig);
        if (!parsedConfig.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid special-edition product tie-in configuration: ${parsedConfig.error.message}`,
          });
        }

        // `marketplaceCaptureId`/`productImageUrl` are NOT part of the strict
        // `VerticalDramaProductTieInConfig` contract (they're pre-existing
        // sibling keys stored in the same jsonb blob — see `listProductImages`
        // above, which already reads both this same way off any series'
        // `productTieIn`) — passed through verbatim, left exactly as-is per
        // this task's brief (a bare string, not an FK; not this task's
        // problem to fix).
        const marketplaceCaptureId =
          typeof rawProductTieIn.marketplaceCaptureId === "string" &&
          rawProductTieIn.marketplaceCaptureId.trim()
            ? rawProductTieIn.marketplaceCaptureId.trim()
            : undefined;
        const productImageUrl =
          typeof rawProductTieIn.productImageUrl === "string" &&
          rawProductTieIn.productImageUrl.trim()
            ? rawProductTieIn.productImageUrl.trim()
            : undefined;
        resolvedProductTieIn = {
          ...parsedConfig.data,
          ...(marketplaceCaptureId ? { marketplaceCaptureId } : {}),
          ...(productImageUrl ? { productImageUrl } : {}),
        };
      }

      // Feature 132 §4.2 (F132A) — merge the top-level `userPremise` field
      // into `bible.userPremise` when present, preserving every other
      // `input.bible` key untouched.
      //
      // Series-level audience age rating (Phase 1) — unlike `userPremise`,
      // `audienceAgeRating` is ALWAYS merged in (it has a safe default via
      // `resolveAudienceAgeRating`, same "always defaulted" precedent as
      // `locale: input.locale ?? "th"` above), so `bible` is no longer ever
      // persisted as `null` — the "no premise, no bible" branch now persists
      // an object carrying just `audienceAgeRating`.
      let initialBible: Record<string, unknown> = {
        ...(input.userPremise
          ? { ...(input.bible ?? {}), userPremise: input.userPremise }
          : (input.bible ?? {})),
        audienceAgeRating: resolveAudienceAgeRating(input.audienceAgeRating),
      };
      let lookLockAppliedAtCreate = false;
      if (input.lookLock) {
        const flags = await getTenantFeatureFlags(tenantId);
        if (flags.verticalDramaSeriesLookLock === true) {
          try {
            if (
              input.lookLock.mode === "inherit_source" &&
              input.lookLock.candidateIdentity !== undefined
            ) {
              const parsedCandidate =
                verticalDramaPresetVisualIdentitySchema.safeParse(
                  input.lookLock.candidateIdentity
                );
              if (!parsedCandidate.success) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Invalid AI-mix visual identity candidate",
                });
              }
              const {
                referenceAssetIds: _untrustedReferenceAssetIds,
                ...safeCandidate
              } = parsedCandidate.data;
              initialBible = stampPresetVisualIdentityIntoBible(
                initialBible,
                safeCandidate as VerticalDramaPresetVisualIdentity
              );
            }
            if (
              input.lookLock.mode === "inherit_source" &&
              input.lookLock.candidateIdentity === undefined &&
              input.appliedPresetId &&
              flags.verticalDramaSeriesPresetMixV2 === true
            ) {
              const appliedPresetNumericId = Number(input.appliedPresetId);
              if (Number.isFinite(appliedPresetNumericId)) {
                const [presetRow] = await db
                  .select({
                    visualIdentityJson:
                      verticalDramaGenrePresets.visualIdentityJson,
                  })
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
                if (identity)
                  initialBible = stampPresetVisualIdentityIntoBible(
                    initialBible,
                    identity
                  );
              }
            }
            if (
              input.lookLock.mode === "inherit_source" &&
              input.lookLock.candidateIdentity === undefined &&
              !input.appliedPresetId &&
              parentSeriesRow
            ) {
              const parentIdentity = resolveEffectiveSeriesVisualIdentity({
                bible: parentSeriesRow.bible,
                presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
                lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
              });
              if (parentIdentity) {
                initialBible = stampPresetVisualIdentityIntoBible(
                  initialBible,
                  parentIdentity
                );
              }
            }
            initialBible = applySeriesLookLockTransition({
              bible: initialBible,
              ...input.lookLock,
              expectedRevision: 0,
              now: new Date().toISOString(),
              ...(input.lookLock.mode === "inherit_source" &&
              input.lookLock.candidateIdentity !== undefined
                ? {
                    inheritedSource: "ai_mix" as const,
                    inheritedGovernance: "look_lock" as const,
                  }
                : {}),
              ...(input.lookLock.mode === "inherit_source" &&
              input.lookLock.candidateIdentity === undefined &&
              !input.appliedPresetId &&
              parentSeriesRow
                ? {
                    inheritedSource: "lineage" as const,
                    inheritedGovernance: "look_lock" as const,
                  }
                : {}),
            }).bible;
            lookLockAppliedAtCreate = true;
          } catch (error) {
            if (error instanceof SeriesLookLockTransitionError) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: error.message,
                cause: error,
              });
            }
            throw error;
          }
        }
      }

      const insertValues: InsertVerticalDramaSeriesRow = {
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
        bible: initialBible,
        memory: input.memory ?? null,
        // Stage 2.5 — `resolvedProductTieIn` is only ever non-null for
        // `createMode === "special_edition"` (see above); every other
        // createMode (including `undefined` = original and `"sequel"`)
        // writes `input.productTieIn` through completely unvalidated,
        // exactly as before this task.
        productTieIn: resolvedProductTieIn ?? input.productTieIn ?? null,
        policy: input.policy ?? null,
        // Stage 2.1 — NULL on every one of these 4 columns unless a valid,
        // flag-gated, ownership-checked parent was resolved above. This is
        // the "original mode writes NULL" structural guarantee described on
        // `verticalDramaSeries.parentSeriesId`'s own schema.ts doc comment.
        parentSeriesId: parentSeriesRow ? parentSeriesRow.id : null,
        createMode: parentSeriesRow ? (input.createMode ?? null) : null,
        seasonNumber: parentSeriesRow ? (input.seasonNumber ?? null) : null,
        lineage: parentSeriesRow
          ? ((input.lineage as VerticalDramaSeriesLineage | undefined) ?? null)
          : null,
        // Manual LLM model override — pinned ATOMICALLY in this same insert
        // (validated above); `undefined`/`null` `input.defaultModelId` both
        // persist `{ defaultModelId: null }` (automatic), byte-identical to
        // this table's pre-existing default (the column was never set here
        // before, which also always meant `null`/automatic).
        llmModelPolicy: {
          defaultModelId: input.defaultModelId ?? null,
        } satisfies VerticalDramaSeriesLlmModelPolicy,
      };

      // Insert + cast/location clone transactional guarantee (Stage 2.3
      // orphan-row fix): for a sequel/special-edition (`parentSeriesRow`
      // set), the new row's INSERT and `cloneSeriesCastForLineage` now run
      // inside ONE shared `db.transaction`, with the transaction's own `tx`
      // handle passed into the clone (see `verticalDramaSeriesClone.ts`'s
      // header doc comment for the full contract). Previously these were
      // two independently-committed operations — the insert always
      // committed, then the clone ran in its OWN transaction and a failure
      // there was only `debugError`'d, never surfaced. That could persist a
      // sequel row with `parentSeriesId`/`createMode`/`lineage` set and ZERO
      // cloned cast while still returning a plain success. Now: a clone
      // failure rolls back the just-inserted row too (no orphan can ever
      // reach the database) and is re-thrown as a hard error — a sequel
      // whose entire point is carrying the parent's cast forward must never
      // report success while silently shipping an empty roster.
      //
      // Original-mode creates (`parentSeriesRow` null) take the plain
      // non-transactional insert path below, byte-identical to before this
      // change.
      //
      // Wrapped in an IIFE (rather than a `let row: VerticalDramaSeriesRow`
      // declared up front) purely so `row`'s type is inferred from BOTH
      // `.returning()` calls below exactly like the original single-insert
      // code did — no new explicit annotation to drift out of sync with
      // whatever shape `db.insert(...).returning()` actually infers.
      const row = await (async () => {
        if (!parentSeriesRow) {
          const [insertedRow] = await db
            .insert(verticalDramaSeries)
            .values(insertValues)
            .returning();
          return insertedRow;
        }

        const parentSeriesIdForClone = parentSeriesRow.id;
        try {
          return await db.transaction(async tx => {
            const [insertedRow] = await tx
              .insert(verticalDramaSeries)
              .values(insertValues)
              .returning();
            await cloneSeriesCastForLineage(
              {
                tenantId,
                userId,
                parentSeriesId: parentSeriesIdForClone,
                childSeriesId: Number(insertedRow.id),
                lineage: input.lineage as
                  | VerticalDramaSeriesLineage
                  | undefined,
              },
              tx
            );
            return insertedRow;
          });
        } catch (error) {
          debugError(
            "verticalDramaSeries.create",
            `Failed to clone cast/locations from parent ${parentSeriesIdForClone} — series creation rolled back, no orphan row persisted`,
            error
          );
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to copy the parent series' cast and locations. No series was created — please try again.",
            cause: error instanceof Error ? error : undefined,
          });
        }
      })();

      // Best-effort: seed the durable character roster (`vertical_drama_characters`,
      // read by the Series Detail Characters tab) from the wizard's freeform
      // `bible.charactersDraft` text. Never allowed to fail series creation.
      const charactersDraft = input.bible?.charactersDraft;
      const characterProfilesResult = presetCharacterProfileSchema
        .array()
        .safeParse(input.bible?.characterProfiles);
      if (
        typeof charactersDraft === "string" &&
        charactersDraft.trim().length > 0
      ) {
        try {
          await seedCharactersFromDraft(
            tenantId,
            userId,
            Number(row.id),
            charactersDraft,
            characterProfilesResult.success
              ? characterProfilesResult.data
              : undefined
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
      if (input.appliedPresetId && !lookLockAppliedAtCreate) {
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

      if (lookLockAppliedAtCreate && input.lookLock?.mode !== "none") {
        await recordSeriesLookLockAuditEvent({
          eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
          tenantId,
          userId,
          seriesId: Number(finalRow.id),
          path: "series.create",
        });
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

      const initialRow = await loadOwnedSeries(tenantId, userId, seriesId);
      if (
        (
          initialRow.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null
        )?.episodes?.some(
          group =>
            group.renderer === "remotion" &&
            group.status === "pending" &&
            group.renderJobId
        )
      ) {
        try {
          const { reconcileProductionEpisodeRemotionJobs } =
            await import("../services/verticalDramaProductionEpisodeRemotion");
          await reconcileProductionEpisodeRemotionJobs({
            tenantId,
            userId,
            seriesId,
          });
        } catch (error) {
          console.warn(
            `[verticalDramaSeries.get] production episode Remotion reconcile skipped for series ${seriesId}:`,
            error instanceof Error ? error.message : error
          );
        }
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
          coverImage: verticalDramaEpisodes.coverImage,
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
      const coverStates = episodes.map(episode =>
        readEpisodeCoverStateFromRow(episode)
      );
      const coverAssetUrlById = await resolveEpisodeCoverAssetUrls(
        db,
        { tenantId, userId },
        coverStates
      );

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
          const { assemblyManifest, coverImage: _rawCoverImage, ...rest } = e;
          return {
            ...rest,
            id: String(e.id),
            thumbnailUrl: thumbnailByEpisode.get(e.id) ?? null,
            coverImage: projectEpisodeCover(
              e.coverImage,
              coverAssetUrlById.get(
                readEpisodeCoverStateFromRow(e)?.mediaAssetId ?? ""
              ) ?? null
            ),
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
   * Series Memory tab — READ (Stage 1.4, `planning/vd-series-memory-and-
   * lineage/plan.md`). Returns the full stored `VdSeriesMemory` plus a
   * coverage summary the client uses for the thin-season warning (the
   * product owner's chosen answer for thin seasons is "warn + let the user
   * fill it in themselves" — plan.md, "การตัดสินใจที่ผู้ใช้ให้มา" #6).
   *
   * Never throws for a series with no memory yet (every series until its
   * first deep-draft/script run has `memory: null`) —
   * `normalizeStoredSeriesMemory` turns that into a well-formed EMPTY
   * `VdSeriesMemory` shape, never `null`/`undefined`. Ownership IS still
   * enforced the normal way (`loadOwnedSeries` throws NOT_FOUND for a
   * missing/cross-tenant/cross-user series id — that is a genuinely
   * different case from "this series exists and I own it, it just has no
   * memory recorded yet").
   *
   * Coverage fields are derived from real, independently-verifiable
   * columns, never invented:
   *  - `targetEpisodeCount` — the series' planned episode count.
   *  - `episodeRowCount` — `vertical_drama_episodes` rows that actually
   *    exist yet (can be less than `targetEpisodeCount` for a series not
   *    fully drafted).
   *  - `episodesWithRealScript` — episode numbers where `.script IS NOT
   *    NULL`, i.e. `plan_episode_script` (Producer B) actually ran. This is
   *    the literal signal behind the plan's own example ("series 17 has
   *    real scripts for only 9 of 30 episodes").
   *  - `episodesWithMemory` — how many episode numbers have ANY memory
   *    record (`stored.episodes.length`).
   *  - `episodesWithMemoryAndRealScript` — episode numbers with BOTH a
   *    memory record AND a real script row. IMPORTANT, HONEST CAVEAT (the
   *    brief for this task explicitly asks not to invent a signal the data
   *    doesn't support): this is a CORRELATION, not stored provenance.
   *    Neither `VdEpisodeMemory` nor any DB column records WHICH producer
   *    (deep-draft Producer A, `plan_episode_script` Producer B, or the
   *    deterministic recap-only fallback) actually wrote a given stored
   *    record — `buildFallbackEpisodeMemory` can run for an episode that
   *    LATER also gets a real script without that memory record ever being
   *    refreshed, and conversely Producer B's own `episode_memory` block is
   *    itself optional (weak-model JSON risk), so a scripted episode can
   *    still be carrying Producer A's recap-only fallback. `false` on
   *    `provenanceDistinguishable` says this out loud to the client rather
   *    than silently implying a guarantee that isn't there. True per-record
   *    provenance would need a new field on `VdEpisodeMemory` itself
   *    (Stage 1.1's contract — out of scope for this router-only task).
   */
  getSeriesMemory: verticalDramaProcedure
    .input(getSeriesMemoryInput)
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

      // Ownership check — NOT_FOUND (not FORBIDDEN) on cross-tenant/missing,
      // never discloses existence (mirrors every other procedure in this
      // file).
      const series = await loadOwnedSeries(tenantId, userId, seriesId);
      const memory = normalizeStoredSeriesMemory(series.memory);

      const episodeRows: Array<{ episodeNumber: number; hasScript: boolean }> =
        await db
          .select({
            episodeNumber: verticalDramaEpisodes.episodeNumber,
            hasScript:
              sql<boolean>`${verticalDramaEpisodes.script} IS NOT NULL`.as(
                "hasScript"
              ),
          })
          .from(verticalDramaEpisodes)
          .where(
            and(
              eq(verticalDramaEpisodes.tenantId, tenantId),
              eq(verticalDramaEpisodes.userId, userId),
              eq(verticalDramaEpisodes.seriesId, seriesId)
            )
          );

      const episodeNumbersWithScript = new Set(
        episodeRows
          .filter((row: { hasScript: boolean }) => row.hasScript)
          .map((row: { episodeNumber: number }) => row.episodeNumber)
      );
      const episodesWithMemoryAndRealScript = memory.episodes.filter(ep =>
        episodeNumbersWithScript.has(ep.episodeNumber)
      ).length;

      return {
        memory,
        coverage: {
          targetEpisodeCount: series.targetEpisodeCount,
          episodeRowCount: episodeRows.length,
          episodesWithRealScript: episodeNumbersWithScript.size,
          episodesWithMemory: memory.episodes.length,
          episodesWithMemoryAndRealScript,
          provenanceDistinguishable: false as const,
        },
      };
    }),

  /**
   * Series Memory tab — WRITE (Stage 1.4). "custom ได้จริง" — the AI
   * proposes (Stage 1.2's producer-time upserts), the user corrects, here.
   *
   * GRANULARITY DECISION (documented per this task's brief, which flags
   * this as a real design fork): the ONLY editable unit is one whole
   * `VdEpisodeMemory` record, identified by `episodeNumber` — create it if
   * absent (this IS the thin-season "warn + let the user fill it in
   * themselves" escape hatch: an episode with no script yet has NO memory
   * record at all, and this op lets a user author one from scratch),
   * replace it if present (`upsertEpisode`), or delete a bogus one
   * (`removeEpisode`). There is deliberately NO surgical "edit just one
   * relationship" or "edit just one thread" server-side operation, and NO
   * whole-`VdSeriesMemory`-blob overwrite: the client (Stage 1.4's own
   * frontend task) reads the current episode object from `getSeriesMemory`,
   * mutates the one relationship/thread card the user touched WITHIN that
   * object client-side, and sends the whole episode record back. This keeps
   * the server-side conflict surface to exactly one well-understood unit
   * (already the SAME unit `verticalDramaSeriesMemoryProjection.ts`'s
   * producer-time upserts operate on), and avoids inventing a cross-episode
   * identity rule for e.g. "delete this one thread" (a `threadId` can be
   * OPENED in one episode and RESOLVED — appear in `threadsResolved` — in a
   * later one, so "the" episode owning a thread isn't always a single
   * well-defined record once resolution is involved).
   *
   * `currentState`/`compactSummary` are NEVER accepted as direct input —
   * they are ALWAYS re-derived via `foldSeriesMemory`/`buildCompactSummary`
   * from the merged `episodes[]` after every edit, so they can never drift
   * out of sync with the episodes that are the actual source of truth (this
   * directly answers the brief's "how does a direct `currentState` edit
   * survive a re-fold" question: it doesn't, because it is not offered —
   * `VdSeriesMemoryCurrentState`'s own doc comment already describes it as
   * "Pure `foldSeriesMemory(episodes)` output", so a divergent direct edit
   * would violate that invariant the moment any OTHER edit re-folds it).
   *
   * Always sets `userEdited: true`. Deliberately does NOT call
   * `upsertEpisodeMemories`/`upsertEpisodeMemory` from the Stage 1.2
   * projection service: that function's `userEdited` handling is "once
   * true, append ONLY genuinely-new episode numbers, never supersede" —
   * correct for guarding a user's edits against being overwritten by the
   * NEXT PRODUCER run, but wrong for THIS mutation, where the user is
   * deliberately re-editing an episode number that may already exist
   * (including one they themselves edited before) and must always win.
   * This procedure instead performs its own row-locked (`db.transaction` +
   * `.select().for("update")`) read-modify-write — the SAME lock
   * convention that module uses for the SAME class of problem (concurrent
   * writers racing on the one `memory` jsonb blob) — and reuses that
   * module's exported `buildCompactSummary` formatter rather than
   * re-implementing it.
   */
  updateSeriesMemory: verticalDramaProcedure
    .input(updateSeriesMemoryInput)
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

      return db.transaction(async tx => {
        const ownershipWhere = seriesOwnershipWhere(tenantId, userId, seriesId);

        // Row-lock FIRST, then read `memory` — mirrors
        // `verticalDramaSeriesMemoryProjection.ts`'s `upsertEpisodeMemories`
        // `.select().for("update")` inside `db.transaction` convention,
        // serializing any concurrent writer (a producer's deep-draft chunk
        // persist, or another hand-edit) on this exact series row instead of
        // losing one side's update. NOT_FOUND (not FORBIDDEN) if the row
        // doesn't match this tenant/user — never discloses existence,
        // mirroring `loadOwnedSeries`.
        const [row] = await tx
          .select({ memory: verticalDramaSeries.memory })
          .from(verticalDramaSeries)
          .where(ownershipWhere)
          .for("update");
        if (!row) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Series not found",
          });
        }

        const stored = normalizeStoredSeriesMemory(row.memory);

        // Bind to a local `const` before narrowing — narrowing a nested
        // property chain (`input.edit.kind`) directly is not reliably
        // retained across the `.map`/`.filter` callback boundaries below in
        // every TS version; a local `const` narrows exactly like any other
        // discriminated-union variable.
        const edit = input.edit;
        let nextEpisodes: VdEpisodeMemory[];
        if (edit.kind === "upsertEpisode") {
          const incoming = toVdEpisodeMemoryFromInput(edit.episode);
          const byNumber = new Map(
            stored.episodes.map(ep => [ep.episodeNumber, ep])
          );
          byNumber.set(incoming.episodeNumber, incoming);
          nextEpisodes = [...byNumber.values()].sort(
            (a, b) => a.episodeNumber - b.episodeNumber
          );
        } else {
          const episodeNumberToRemove = edit.episodeNumber;
          nextEpisodes = stored.episodes.filter(
            ep => ep.episodeNumber !== episodeNumberToRemove
          );
        }

        // Re-fold — never trust a stale client-supplied currentState (there
        // is none here; it is not accepted as input at all, see this
        // procedure's own doc comment).
        const currentState = foldSeriesMemory(nextEpisodes);
        const compactSummary = buildCompactSummary(currentState, nextEpisodes);
        const lastFoldedEpisode = nextEpisodes.reduce(
          (max, ep) => Math.max(max, ep.episodeNumber),
          0
        );
        const nextMemory: VdSeriesMemory = {
          contractVersion: 1,
          episodes: nextEpisodes,
          currentState,
          compactSummary,
          lastFoldedEpisode,
          userEdited: true,
        };

        await tx
          .update(verticalDramaSeries)
          .set({ memory: nextMemory, updatedAt: new Date() })
          .where(ownershipWhere);

        return { memory: nextMemory };
      });
    }),

  /**
   * Manual LLM model override (added 2026-07-11 — see
   * `/home/dev/.claude/plans/polished-toasting-gadget.md`) — lists the
   * eligible model set the "generate start-frame render plan" / "generate
   * storyboard" stages' automatic selector would pick from (the SAME
   * `contextLength >= 1,000,000 && !isFree && supportsThinking === true`
   * filter "improve script" already uses) — for the series settings
   * dropdown's "automatic" + explicit-model-list options. Optional input;
   * not series-scoped otherwise (the eligible model catalog is
   * tenant-independent).
   *
   * `loadEnabledLlmModelRows`/`selectQualityLargeContextEligibleModels`/
   * `selectRecommendedQualityLargeContextEligibleModels` are loaded via a
   * lazy `await import(...)` — see this file's own established "narrow
   * vi.mock safety" convention documented on the Ad Banner
   * Overlay/`runImproveScriptJob` import blocks above: both pull in a heavy
   * `routers/llmProviders.ts` transitive chain that would otherwise break
   * every sibling test file's narrow `vi.mock` graph the instant this module
   * loads. `llmProviders`/`modelProviderMap` (imported statically above —
   * pure table definitions, no heavy transitive chain) are used here only to
   * join in a richer display label (`modelName`/provider `displayName`),
   * mirroring `multiProvider.ts`'s `listAdminModelCatalog` join.
   *
   * 2026-07-31 (admin-vetted quality picker) — narrowed from the full
   * `selectQualityLargeContextEligibleModels` set to
   * `selectRecommendedQualityLargeContextEligibleModels` (admin-curated
   * `isRecommended` flag, falling back to the full eligible set when nothing
   * is currently recommended — see that selector's own doc comment for why).
   * `input.includeModelId` grandfathers an existing series' persisted
   * `defaultModelId` pin into the returned list even when it's no longer in
   * the recommended set (as long as it's still within the full eligible
   * set), so the Settings tab's controlled `<Select value=...>` always has a
   * matching option for whatever is already saved. `setSeriesLlmModelPolicy`
   * below still validates against the FULL eligible set (unchanged) — a pin
   * outside the recommended set was, and remains, a valid save; this only
   * fixes the dropdown rendering a value it has no option for.
   */
  listQualityPlanningModels: verticalDramaProcedure
    .input(
      z
        .object({ includeModelId: z.string().min(1).nullable().optional() })
        .optional()
    )
    .query(async ({ input }) => {
      const { loadEnabledLlmModelRows } =
        await import("../services/enabledLlmModels");
      const {
        selectQualityLargeContextEligibleModels,
        selectRecommendedQualityLargeContextEligibleModels,
      } = await import("../services/verticalDramaImproveScript");

      const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
      const recommended =
        selectRecommendedQualityLargeContextEligibleModels(rows);

      const includeModelId = input?.includeModelId ?? null;
      let eligible = recommended;
      if (
        includeModelId &&
        !recommended.some(row => row.modelId === includeModelId)
      ) {
        const fullEligible = selectQualityLargeContextEligibleModels(rows);
        const grandfathered = fullEligible.find(
          row => row.modelId === includeModelId
        );
        if (grandfathered) {
          eligible = [...recommended, grandfathered];
        }
      }

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
        .innerJoin(
          llmProviders,
          eq(modelProviderMap.providerId, llmProviders.id)
        )
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
  /**
   * Drag-and-drop / file-picker upload for the series watermark image.
   *
   * Returns ONLY a storage URL — it deliberately does not write the series
   * config, so the drop lands in the form and the user still presses
   * "บันทึกลายน้ำ". Mirrors `uploadStagedAutoReviewOverlayImage`'s validation
   * (size cap, extension allowlist, magic-byte sniff) rather than trusting the
   * browser-reported `fileType`.
   */
  uploadSeriesWatermarkImage: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        fileName: z.string().min(1).max(255),
        fileType: z.string().min(1).max(100),
        fileBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      if (!input.fileType.toLowerCase().startsWith("image/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "watermark_upload_not_an_image",
        });
      }
      const parts = input.fileBase64.split(",", 2);
      const buf = Buffer.from(
        parts.length === 2 ? parts[1] : input.fileBase64,
        "base64"
      );
      const MAX_BYTES = 10 * 1024 * 1024;
      if (buf.length > MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "watermark_upload_too_large:10MB",
        });
      }
      const ext = (input.fileName.split(".").pop() || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
      const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "svg"]);
      if (ext && !ALLOWED.has(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `watermark_upload_bad_extension:${ext}`,
        });
      }
      const magic = buf.slice(0, 12);
      const isValidImage =
        (magic[0] === 0xff && magic[1] === 0xd8) || // JPEG
        (magic[0] === 0x89 && magic[1] === 0x50) || // PNG
        (magic[0] === 0x52 &&
          magic[1] === 0x49 &&
          magic[2] === 0x46 &&
          magic[3] === 0x46) || // WEBP (RIFF)
        magic[0] === 0x3c; // SVG (<)
      if (!isValidImage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "watermark_upload_content_mismatch",
        });
      }
      const key = `vertical-drama/${input.seriesId}/watermark/${randomUUID()}${ext ? "." + ext : ""}`;
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(key, buf, input.fileType);
      return { url };
    }),

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
      const hasExplicitPresetOrPremise =
        selectedPresetIds.length > 0 ||
        (input.selections?.length ?? 0) > 0 ||
        Boolean(userPremiseEnabled && input.userPremise?.trim());
      // Title/genre/audience facts are only needed when basics are the story
      // spine. Lineage is different: sequel/special-edition canon must reach
      // synthesis in every mode, including requests with a premise/preset.
      const basicsOnlyContext = !hasExplicitPresetOrPremise
        ? {
            seriesTitleHint: input.seriesTitleHint,
            genreHint: input.genreHint,
            audienceAgeRating: input.audienceAgeRating,
          }
        : {};
      const lineageContext = input.lineageContext
        ? {
            lineageContext: input.lineageContext as VerticalDramaSeriesLineage,
          }
        : {};

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
            ...basicsOnlyContext,
            ...lineageContext,
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
          ...basicsOnlyContext,
          ...lineageContext,
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
   * Stage 2.2 (`planning/vd-series-memory-and-lineage/plan.md`) — AI
   * proposes a season carry-over draft (who returns, new conflict
   * directions, antagonist strategy) for a chosen PARENT series; the
   * wizard lets the user review/edit it before `create` ever persists
   * anything. Same "LLM call -> transient draft, zero DB writes" shape as
   * `synthesizeGenrePreset` immediately above — no series row exists yet
   * at this point in the wizard, so this is a synchronous mutation, not a
   * `VerticalDramaStoryJobPayload` job (which requires a `seriesId` that
   * does not exist here yet).
   *
   * Gated on the dedicated `verticalDramaSeriesLineage` tenant flag (on top
   * of the base `verticalDramaSeries` gate every procedure on this router
   * already has) — this is the "gate the create BRANCH, never the
   * underlying schema read path" rule from that flag's own doc comment.
   */
  proposeSeasonCarryOver: verticalDramaProcedure
    .input(proposeSeasonCarryOverInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;

      const flags = await getTenantFeatureFlags(tenantId);
      if (flags.verticalDramaSeriesLineage !== true) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Season carry-over planning is not enabled for this tenant",
        });
      }

      const parentSeriesIdNum = Number(input.parentSeriesId);
      if (!Number.isFinite(parentSeriesIdNum)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid parentSeriesId",
        });
      }
      // HARD THROW on a cross-tenant/cross-user parent — see `create`'s own
      // doc comment on why this specific check is never best-effort.
      const parentRow = await loadOwnedSeries(
        tenantId,
        userId,
        parentSeriesIdNum
      );

      const lineageContext = await loadLineageContext(
        parentRow,
        {
          tenantId,
          userId,
        },
        {
          presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
          lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
        }
      );

      try {
        const result = await synthesizeSeasonCarryOver({
          userId,
          tenantId,
          locale: normalizeVerticalDramaSeriesLocale(parentRow.locale),
          premise: input.premise,
          lineageContext,
        });
        return {
          ...result,
          hasMemory: lineageContext.hasMemory,
          memoryEpisodesRecorded: lineageContext.memoryEpisodesRecorded,
          parentEpisodeCount: lineageContext.parentEpisodeCount,
        };
      } catch (error) {
        if (error instanceof SeasonCarryOverInputError) {
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
            error instanceof Error
              ? error.message
              : "Season carry-over planning failed",
        });
      }
    }),

  /**
   * Stage 2.5 (`planning/vd-series-memory-and-lineage/plan.md`) — AI
   * proposes a special-edition brief (story shape, per-episode briefs sized
   * for a SHORT 1-2 sub-episode special, continuity notes) for a chosen
   * PARENT series; the wizard shows `suggestedUserPremise` in an editable
   * field and the user's FINAL text is what gets sent as
   * `createSeriesInput.userPremise` on `create` (see
   * `verticalDramaSpecialEdition.ts`'s header doc comment for the full
   * hand-off chain into `bible.userPremise` -> `buildDeepDraftPrompts`'s
   * "USER PREMISE (PRIMARY)" block — that block already renders
   * unconditionally whenever a non-empty string is present, so no
   * additional wiring in `create` was needed for this to reach the
   * architect). Same "LLM call -> transient draft, zero DB writes" shape as
   * `proposeSeasonCarryOver` immediately above — no series row exists yet
   * at this point in the wizard.
   *
   * Gated on the same `verticalDramaSeriesLineage` tenant flag as every
   * other lineage procedure on this router.
   */
  proposeSpecialEditionBrief: verticalDramaProcedure
    .input(proposeSpecialEditionBriefInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;

      const flags = await getTenantFeatureFlags(tenantId);
      if (flags.verticalDramaSeriesLineage !== true) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Special edition planning is not enabled for this tenant",
        });
      }

      const parentSeriesIdNum = Number(input.parentSeriesId);
      if (!Number.isFinite(parentSeriesIdNum)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid parentSeriesId",
        });
      }
      // HARD THROW on a cross-tenant/cross-user parent — see `create`'s own
      // doc comment on why this specific check is never best-effort.
      const parentRow = await loadOwnedSeries(
        tenantId,
        userId,
        parentSeriesIdNum
      );

      const lineageContext = await loadLineageContext(
        parentRow,
        {
          tenantId,
          userId,
        },
        {
          presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
          lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
        }
      );

      try {
        const result = await synthesizeSpecialEditionBrief({
          userId,
          tenantId,
          locale: normalizeVerticalDramaSeriesLocale(parentRow.locale),
          targetEpisodeCount: input.targetEpisodeCount,
          storyFunctionChoice: input.storyFunctionChoice,
          source: {
            marketplaceProductName: input.marketplaceProductName,
            marketplaceProductDescription: input.marketplaceProductDescription,
            uploadedSummary: input.uploadedSummary,
          },
          lineageContext,
        });
        return {
          ...result,
          hasMemory: lineageContext.hasMemory,
          memoryEpisodesRecorded: lineageContext.memoryEpisodesRecorded,
          parentEpisodeCount: lineageContext.parentEpisodeCount,
        };
      } catch (error) {
        if (error instanceof SpecialEditionInputError) {
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
            error instanceof Error
              ? error.message
              : "Special edition planning failed",
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

      await reconcileCharactersFromStoryBible(
        tenantId,
        userId,
        seriesId,
        result.expanded.refinedCharacters
      );

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
         * Premium multi-round drafts (W11-A, added 2026-07-08) — `"premium"`
         * runs the fan-out -> gates -> judge -> targeted-revise -> season-sweep
         * pipeline; `"standard"` runs the single-pass W10-A pipeline.
         *
         * Default CHANGED to `"premium"` when omitted (production-grade
         * full-story generation, plan
         * `planning/vertical-drama-full-story-production-grade`, added
         * 2026-07-13) — the button's flow now uses the quality loop by
         * default so it returns only complete, floor-passing content in one
         * run; the client can still explicitly request `"standard"`.
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
      // Production-grade full-story generation, added 2026-07-13 — default
      // to "premium" (the quality-loop pipeline) when the client doesn't
      // send a mode; an explicit "standard" request still runs the
      // single-pass pipeline unchanged.
      const mode: VerticalDramaDeepStoryDraftMode = input.mode ?? "premium";

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

      // Silent-no-op fix (plan
      // `planning/vertical-drama-deep-draft-update-all-noop`, added
      // 2026-07-14) — `episodesToDraft` above only reflects the resolved
      // HORIZON, not what's actually undrafted within it. For a large series
      // whose default horizon (or an explicitly-passed one) is fully covered
      // by already-drafted episodes, enqueuing here would produce a job that
      // makes zero LLM calls, charges zero credits, and "succeeds" in
      // ~60ms — indistinguishable from "stopped" in the UI (see the plan's
      // root-cause section). Filter to episodes that are still undrafted and
      // short-circuit BEFORE enqueuing/charging when there's nothing left.
      const remainingToDraft = episodesToDraft.filter(
        item => readItemShotDrafts(item) === null
      );
      if (remainingToDraft.length === 0) {
        // Pinned contract: this mutation's return type is now a union of
        // `{ jobId, deduped, alreadyComplete: false }` (normal path, below)
        // and `{ jobId: null, deduped: false, alreadyComplete: true }` (this
        // early-complete path). Both branches share the same three keys so
        // tRPC/TS infer one consistent object shape; the client narrows on
        // `!jobId` to detect this case and must not attempt to poll it.
        return { jobId: null, deduped: false, alreadyComplete: true as const };
      }

      await ensureStoryJobCreditsAvailable(
        userId,
        // Credit precheck scoped to REMAINING (undrafted) episodes, not the
        // full horizon — see the doc comment above. Already-drafted episodes
        // inside the horizon must never count against the user's credit
        // balance for this run.
        estimateDeepDraftJobCredits(remainingToDraft.length, mode)
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
      return { jobId, deduped, alreadyComplete: false as const };
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
      // Fail-fast sync validation — see `generateStoryBibleDeep`'s own doc
      // comment on the deliberate double-guard (also re-run inside
      // `runExtendStoryDraftHorizonJob`).
      const row = await loadOwnedSeries(tenantId, userId, seriesId);

      // Mode default is SEQUEL-AWARE (Stage 2.4b gap fix). For a normal series
      // extend stays `"standard"` (the established cost default). For a lineage
      // series (`parentSeriesId` set — a sequel/special edition), default to
      // `"premium"` so the `prior_season_continuity` judge dimension — which
      // ONLY scores in premium — actually runs on continuation episodes; a
      // standard extend would draft episodes 11+ of a sequel with the lineage
      // facts in the PROMPT but never continuity-CHECKED, defeating the whole
      // "must not drift from the prior season" requirement. Still fully
      // overridable: an explicit `input.mode` (incl. `"standard"`) always wins,
      // so a user who wants to save credits can opt out.
      const mode: VerticalDramaDeepStoryDraftMode =
        input.mode ?? (row.parentSeriesId != null ? "premium" : "standard");
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
   * Manual "แก้เรื่องย่อ" edit — lets a user directly rewrite a Sub-episode's
   * `logline` without going through an LLM (no credit charge, no LLM call).
   * The logline lives in TWO parallel places in the same `bible` jsonb blob
   * and BOTH must be patched or the edit silently fails to propagate:
   *   1. `bible.breakdownVersions[active].items[]` — consumed by the
   *      shot-splitting stage (`storyboard_shotgrid`) and by
   *      `getEpisodeDetail.episodePlan`.
   *   2. legacy top-level `bible.episodeBreakdown[]` — consumed by the
   *      Overview card and stage `plan_episode_script`.
   * Mirrors `confirmImproveScript`'s dual-write sync approach above, and
   * `updateEpisodeDraftDialogue`'s ownership/procedure/audit structure
   * immediately above this. Every OTHER field on the item (shotDrafts,
   * keyBeats, workingTitle, cliffhanger_line, tieIn, manualDialogueEdit,
   * contentBudget, ...) is carried over untouched via a shallow spread —
   * this function NEVER rebuilds the item or the bible object from scratch.
   * An unchanged logline is a complete no-op: no DB write, no `updatedAt`
   * bump, no audit event, same convention `updateEpisodeDraftDialogue`'s own
   * idempotent-replay path uses.
   */
  updateEpisodeDraftSynopsis: verticalDramaDeepStoryDraftsProcedure
    .input(updateEpisodeDraftSynopsisInput)
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
      const { activeIndex, versions, item } = loadEpisodeSynopsisEditTarget(
        bible,
        input.episodeNumber
      );

      // No-op short-circuit: identical logline, zero writes.
      if (item.logline === input.logline) {
        return {
          ok: true as const,
          episodeNumber: input.episodeNumber,
          logline: item.logline,
        };
      }

      const updatedVersions = versions.map((version, index) =>
        index === activeIndex
          ? {
              ...version,
              items: version.items.map(existingItem =>
                existingItem.episodeNumber === input.episodeNumber
                  ? { ...existingItem, logline: input.logline }
                  : existingItem
              ),
            }
          : version
      );

      // Legacy sync — skipped entirely (key omitted) when the legacy array
      // is absent, same "only patch what exists" convention
      // `confirmImproveScript` uses for the same array above.
      const legacyBreakdown = (bible as { episodeBreakdown?: unknown })
        .episodeBreakdown;
      const nextBible: Record<string, unknown> = {
        ...bible,
        breakdownVersions: updatedVersions,
        ...(Array.isArray(legacyBreakdown)
          ? {
              episodeBreakdown: legacyBreakdown.map(entry => {
                if (!entry || typeof entry !== "object") return entry;
                const epNum = (entry as { episodeNumber?: unknown })
                  .episodeNumber;
                if (epNum !== input.episodeNumber) return entry;
                return {
                  ...(entry as Record<string, unknown>),
                  logline: input.logline,
                };
              }),
            }
          : {}),
      };

      await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      await syncEpisodeDraftSummarySynopsis({
        tenantId,
        userId,
        seriesId,
        episodeNumber: input.episodeNumber,
        logline: input.logline,
      });

      await recordManualSynopsisEditAuditEvent({
        userId,
        seriesId,
        episodeNumber: input.episodeNumber,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        ok: true as const,
        episodeNumber: input.episodeNumber,
        logline: input.logline,
      };
    }),

  /**
   * Manual "แก้เรื่องย่อช็อต" + "แก้บทพูด" combined edit — lets a user
   * directly rewrite ONE shot's `summary` heading text ("ช็อต N —
   * <summary>") AND/OR its `dialogue_lines`, in ONE save, without going
   * through an LLM (no credit charge, no LLM call). Revised 2026-07-22 from
   * an originally summary-only mutation to a combined one — a wrong-dialogue
   * fix and a wrong-summary fix usually happen at the same time, so forcing
   * two separate saves/writes would be a worse UX for no benefit.
   *
   * Applies the two edits CHAINED on the SAME in-memory item — `summary`
   * first via `applyManualShotSummaryEdit`, then `lines` (if supplied) via
   * the EXISTING `applyManualDialogueEdit` (reused as-is, never forked, so
   * its silence_intent-removal/speakabilityWarnings/`draftCompleteness`
   * recompute behavior stays byte-identical to `updateEpisodeDraftDialogue`'s
   * own) — then persists with exactly ONE `db.update(...)` write. When only
   * one field is supplied, only that one apply step runs. `manualSummaryEdit`
   * and `manualDialogueEdit` remain two SEPARATE stamps on the item (each
   * apply function stamps its own) — never merged into one.
   *
   * UNLIKE `updateEpisodeDraftSynopsis` above (which dual-writes `logline`
   * into both `breakdownVersions[active].items[]` AND the legacy
   * `bible.episodeBreakdown[]`), this mutation writes ONLY the active
   * breakdown version's item — `episodeBreakdown[]` never carried per-shot
   * data in the first place (it is a whole-episode summary array), and both
   * deep-draft-consuming stages that read `shotDrafts` (`plan_episode_script`
   * and `storyboard_shotgrid`, via `resolveEpisodeDraftHydration`) already
   * read exclusively from the active breakdown version. A single write fully
   * propagates the edit.
   *
   * Idempotent: a retried call carrying an `idempotencyKey` every SUPPLIED
   * field's own stamp has already recorded is a complete no-op (no second
   * write, no second audit event, no re-accumulated stamp `shotNumbers`).
   * An edit where every supplied field is unchanged from the currently
   * stored shot is also a complete no-op — same convention
   * `updateEpisodeDraftSynopsis`'s own no-op short-circuit uses.
   * `updateEpisodeDraftDialogue` itself is left completely untouched by this
   * mutation — it has its own separate callers.
   */
  updateEpisodeDraftShot: verticalDramaDeepStoryDraftsProcedure
    .input(updateEpisodeDraftShotInput)
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

      const currentShot = (readItemShotDrafts(item) ?? []).find(
        shot => shot.shot_number === input.shotNumber
      );

      const emptyWarnings: ReturnType<typeof analyzeManualDialogueEditLines> =
        [];

      // Idempotent replay: a retried call carrying an idempotencyKey EVERY
      // supplied field's own stamp has already recorded is a complete no-op
      // — no second write, no second audit event, no re-accumulated
      // `shotNumbers`. Mirrors `updateEpisodeDraftDialogue`'s own replay
      // branch, scoped per-field since this mutation carries two
      // independent stamps (`manualSummaryEdit`/`manualDialogueEdit`).
      // Requires the key to have actually been recorded on at least one
      // SUPPLIED field's stamp (an absent `idempotencyKey` on the request
      // trivially satisfies "not-supplied-fields-are-fine" for both, but
      // must never count as a replay on its own).
      const summaryStamp = readItemManualSummaryEdit(item);
      const dialogueStamp = readItemManualDialogueEdit(item);
      const summaryKeyRecorded =
        !!input.idempotencyKey &&
        !!summaryStamp?.appliedIdempotencyKeys?.includes(input.idempotencyKey);
      const linesKeyRecorded =
        !!input.idempotencyKey &&
        !!dialogueStamp?.appliedIdempotencyKeys?.includes(input.idempotencyKey);
      const isReplay =
        !!input.idempotencyKey &&
        (input.summary === undefined || summaryKeyRecorded) &&
        (input.lines === undefined || linesKeyRecorded) &&
        (summaryKeyRecorded || linesKeyRecorded);
      if (isReplay) {
        return {
          ok: true as const,
          episodeNumber: input.episodeNumber,
          shotNumber: input.shotNumber,
          ...(input.summary !== undefined
            ? { summary: currentShot?.summary ?? input.summary }
            : {}),
          speakabilityWarnings:
            input.lines !== undefined
              ? analyzeManualDialogueEditLines(
                  currentShot?.dialogue_lines ?? []
                )
              : emptyWarnings,
          silenceIntentRemoved: false,
        };
      }

      // No-op short-circuit: every SUPPLIED field is unchanged from the
      // currently stored shot — zero writes. Mirrors
      // `updateEpisodeDraftSynopsis`'s own no-op convention.
      const summaryUnchanged =
        input.summary === undefined || currentShot?.summary === input.summary;
      const linesUnchanged =
        input.lines === undefined ||
        linesMatchStoredDialogue(
          currentShot?.dialogue_lines ?? [],
          input.lines
        );
      if (summaryUnchanged && linesUnchanged) {
        return {
          ok: true as const,
          episodeNumber: input.episodeNumber,
          shotNumber: input.shotNumber,
          ...(input.summary !== undefined
            ? { summary: currentShot?.summary ?? input.summary }
            : {}),
          speakabilityWarnings:
            input.lines !== undefined
              ? analyzeManualDialogueEditLines(
                  currentShot?.dialogue_lines ?? []
                )
              : emptyWarnings,
          silenceIntentRemoved: false,
        };
      }

      let workingItem: StoredEpisodeBreakdownItem = item;

      if (input.summary !== undefined) {
        try {
          workingItem = applyManualShotSummaryEdit({
            item: workingItem,
            shotNumber: input.shotNumber,
            summary: input.summary,
            editedByUserId: userId,
            idempotencyKey: input.idempotencyKey,
          }).item;
        } catch (error) {
          if (error instanceof ManualShotSummaryEditNoDraftError) {
            throw new TRPCError({ code: "NOT_FOUND", message: error.message });
          }
          throw error;
        }
      }

      let speakabilityWarnings = emptyWarnings;
      let silenceIntentRemoved = false;
      if (input.lines !== undefined) {
        try {
          const dialogueResult = applyManualDialogueEdit({
            item: workingItem,
            shotNumber: input.shotNumber,
            lines: input.lines,
            editedByUserId: userId,
            idempotencyKey: input.idempotencyKey,
          });
          workingItem = dialogueResult.item;
          speakabilityWarnings = dialogueResult.speakabilityWarnings;
          silenceIntentRemoved = dialogueResult.silenceIntentRemoved;
        } catch (error) {
          if (error instanceof ManualDialogueEditNoDraftError) {
            throw new TRPCError({ code: "NOT_FOUND", message: error.message });
          }
          throw error;
        }
      }

      const updatedVersions = versions.map((version, index) =>
        index === activeIndex
          ? {
              ...version,
              items: version.items.map(existingItem =>
                existingItem.episodeNumber === input.episodeNumber
                  ? workingItem
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

      await recordManualShotEditAuditEvent({
        userId,
        seriesId,
        episodeNumber: input.episodeNumber,
        shotNumber: input.shotNumber,
        summaryChanged: input.summary !== undefined,
        linesChanged: input.lines !== undefined,
        idempotencyKey: input.idempotencyKey,
      });

      return {
        ok: true as const,
        episodeNumber: input.episodeNumber,
        shotNumber: input.shotNumber,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        speakabilityWarnings,
        silenceIntentRemoved,
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
        // no longer the primary path — see queueVerticalDramaFfmpegAssemblyJob
        submitSequentialAssemblyJobs,
        // Vertical Drama Render Queue plan §4.2 Wave 3 — persists
        // `assemblyManifest.compiledVideo` = `{status:"pending", pendingJobId}`
        // per episode after enqueueing, same shape convention
        // `submitSequentialAssemblyJobs` itself always used.
        persistCompiledVideoState,
      } = await import("../services/verticalDramaEpisodeVideoAssembly");
      // Vertical Drama Render Queue plan §4.2 Wave 3 — enqueue-only entry
      // point for the `vertical_drama_ffmpeg_assembly` worker job type, lazy-
      // loaded for the SAME "narrow vi.mock sibling test" reason as the
      // import block above.
      const { queueVerticalDramaFfmpegAssemblyJob } =
        await import("../services/workerSchedulerService");

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
        /** Dual watermark (`planning/vd-dual-watermark/plan.md`): up to 2 entries. */
        watermarkImages?: RunAssemblyJobWatermarkImageInput[];
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
        let episodeWatermarkImages: RunAssemblyJobWatermarkImageInput[] = [];
        if (applyTextOverlays || applyWatermark) {
          const plan = applyTextOverlays
            ? parseTextOverlayPlan(row.textOverlayPlan)
            : null;
          const { overlays, watermarkImages, overlaysIncluded } =
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
          if (watermarkImages.length > 0) {
            episodeWatermarkImages = watermarkImages;
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
          watermarkImages:
            episodeWatermarkImages.length > 0
              ? episodeWatermarkImages
              : undefined,
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

      // Vertical Drama Render Queue plan §4.2 Wave 3 — fan OUT one
      // `vertical_drama_ffmpeg_assembly` worker job (kind:
      // "season_sub_episode") per episode instead of one in-process
      // sequential ffmpeg chain (`submitSequentialAssemblyJobs`, now unused
      // here). Minting/persisting every episode's pending job id stays
      // parallel across episodes (independent rows, no write conflict —
      // same as `submitSequentialAssemblyJobs`'s own up-front persist step);
      // the ACTUAL ffmpeg runs are serialized later by the executor's
      // concurrency cap (plan §4.3), not by this router.
      const submitted = await Promise.all(
        specs.map(async spec => {
          const renderFeed = {
            owner: spec.owner,
            clips: spec.clips,
            internalBaseUrl,
            filename: spec.filename,
            ...(spec.dialogueAudio
              ? { dialogueAudio: spec.dialogueAudio }
              : {}),
            ...(spec.subtitles ? { subtitles: spec.subtitles } : {}),
            ...(spec.watermarkImages
              ? { watermarkImages: spec.watermarkImages }
              : {}),
          };
          const { job } = await queueVerticalDramaFfmpegAssemblyJob({
            tenantId,
            requestedByUserId: userId,
            kind: "season_sub_episode",
            contractVersion: 1,
            owner: {
              tenantId,
              userId: String(userId),
              seriesId: String(seriesId),
              episodeId: String(spec.owner.episodeId),
            },
            renderFeed,
            display: {
              seriesTitle: seriesRow.title ?? undefined,
              label: spec.filename,
            },
          });
          await persistCompiledVideoState(spec.owner, {
            pendingJobId: job.id,
            status: "pending",
            error: undefined,
          });
          return { episodeId: spec.owner.episodeId, jobId: job.id as string };
        })
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
        // Legacy FFmpeg callers may still send 5/10. The Remotion path uses
        // the explicit range fields below and accepts the same 3-50 bound.
        groupSize: z.number().int().min(3).max(50).optional(),
        renderEngine: z.enum(["ffmpeg", "remotion"]).optional(),
        startSubEpisode: z.number().int().min(1).optional(),
        endSubEpisode: z.number().int().min(1).optional(),
        subEpisodesPerProductionEpisode: z
          .number()
          .int()
          .min(3)
          .max(50)
          .optional(),
        remainderPolicy: z.enum(["create", "skip"]).optional(),
        sourceMode: z
          .enum(["auto", "compiled_only", "shot_assembly"])
          .optional(),
        showEpisodeIndicator: z.boolean().optional(),
        showSeriesTitle: z.boolean().optional(),
        useSeriesWatermarks: z.boolean().optional(),
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
          .union([
            z.object({
              url: z.string().min(1).max(2048),
              volumePercent: z.number().min(1).max(100).default(35),
              duckUnderVideoAudio: z.boolean().default(true),
            }),
            z.object({
              tracks: z
                .array(
                  z.object({
                    id: z.string().min(1).max(64).optional(),
                    url: z.string().min(1).max(2048),
                    startSeconds: z.number().min(0).max(3600).default(0),
                    endSeconds: z
                      .number()
                      .min(0)
                      .max(3600)
                      .nullable()
                      .optional(),
                    volumePercent: z.number().min(1).max(100).default(35),
                    loopUntilEnd: z.boolean().default(true),
                    duckUnderVideoAudio: z.boolean().default(true),
                  })
                )
                .max(10),
            }),
          ])
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

      const useRemotion =
        input.renderEngine === "remotion" ||
        input.startSubEpisode !== undefined ||
        input.endSubEpisode !== undefined ||
        input.subEpisodesPerProductionEpisode !== undefined ||
        input.sourceMode !== undefined;

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl =
        runtimeConfig.internalNodeUrl ||
        ctx.publicUrl ||
        "http://localhost:3000";

      if (useRemotion) {
        if (
          input.startSubEpisode === undefined ||
          input.endSubEpisode === undefined ||
          input.subEpisodesPerProductionEpisode === undefined
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "startSubEpisode, endSubEpisode, and subEpisodesPerProductionEpisode are required for Remotion Production Episode assembly",
          });
        }
        const { assembleProductionEpisodesWithRemotion } =
          await import("../services/verticalDramaProductionEpisodeRemotion");
        try {
          const result = await assembleProductionEpisodesWithRemotion({
            tenantId,
            userId,
            seriesId,
            startSubEpisode: input.startSubEpisode,
            endSubEpisode: input.endSubEpisode,
            subEpisodesPerProductionEpisode:
              input.subEpisodesPerProductionEpisode,
            remainderPolicy: input.remainderPolicy ?? "create",
            sourceMode: input.sourceMode ?? "auto",
            showEpisodeIndicator: input.showEpisodeIndicator ?? true,
            showSeriesTitle: input.showSeriesTitle ?? true,
            useSeriesWatermarks: input.useSeriesWatermarks ?? true,
            bgm: input.bgm,
            credits: input.credits,
            overlays: input.overlays,
            internalBaseUrl,
            publicBaseUrl: ctx.publicUrl,
          });
          return result;
        } catch (err) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              err instanceof Error
                ? err.message
                : "Production Episode Remotion assembly precondition failed",
          });
        }
      }

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
          groupSize: input.groupSize ?? 10,
          allowPartial: input.allowPartial,
          internalBaseUrl,
          seriesTitle: seriesRow.title ?? undefined,
          renderOptions: input.renderOptions,
          bgm: input.bgm && "tracks" in input.bgm ? undefined : input.bgm,
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
    .input(
      adBannerScopeInput.extend({
        // Feature 135 — Hermes Grok media worker (section 09, remediation
        // row 10). This surface gains MCP support as a side effect of the
        // shared transport-decision helper — `mcpConnectionId`/
        // `sharedGroupId` are new for the banner picker (section 10 wires
        // the UI); `hermesConnectionId` is required only when the resolved
        // model is Hermes-transport and the caller has no default Hermes
        // connection for images.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        hermesConnectionId: z.string().max(64).optional(),
      })
    )
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

      // Feature 135 — Hermes Grok media worker (section 09, remediation row
      // 10): fail-closed guard — the silent `DEFAULT_MODELS.image` fallback
      // is gone. An empty `banner.generation.modelId` now throws BAD_REQUEST
      // instead of silently substituting a system default the user never
      // picked (same fail-closed convention as `resolveCharacterImageModelId`).
      const modelId = banner.generation.modelId?.trim();
      if (!modelId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "เลือกโมเดลภาพก่อนสร้างแบนเนอร์ / Select an image model before generating the banner.",
        });
      }
      const pricing = await resolveAdBannerImageModelPricing(modelId);
      const shouldChargeImageCredits = pricing.creditCost > 0;

      const referenceImageUrls = await resolveAdBannerProductReferenceImageUrls(
        rawProductTieIn,
        {
          userId,
          tenantId,
        }
      );

      // Route through the shared transport-decision helper — gateway_api
      // (byte-identical to before), mcp (this surface gains MCP support as
      // a side effect — pricing/charge stays identical, only the submit
      // path's `transportMetadata` changes), or hermes (no platform-credit
      // charge; submits straight to `queueHermesMediaJob`). Resolved BEFORE
      // the credit check/reserve below (not after) — structurally
      // guarantees "no platform-credit reserve for hermes". Reuses
      // `pricing.configJson` (the SAME `media_models` row
      // `resolveAdBannerImageModelPricing` already read above) — never a
      // second DB read for the same row.
      const { resolveVdCharacterMediaTransportDecision } =
        await import("./verticalDramaCharacters");
      const transportDecision = await resolveVdCharacterMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId,
        configJson: pricing.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
      });

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasCredits = await hasEnoughCredits(userId, pricing.creditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for banner image render. Required: ${pricing.creditCost}`,
          });
        }
      }

      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } =
          await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const { resolveMediaModelTransportConfig } =
          await import("../../shared/mediaModelTransport");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } =
          await resolveHermesOrderedRefsFromUrls({
            tenantId,
            userId,
            urls: referenceImageUrls.slice(0, pricing.maxReferenceImages),
            traceId: hermesTraceId,
            connectionId: transportDecision.connectionId,
            requireAll: referenceImageUrls.length > 0,
            roleFor: () => "product",
          });
        const references = await buildHermesMediaReferences({
          tenantId,
          userId,
          orderedRefs,
        });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId,
            configJson: pricing.configJson,
          }).providerModelId ?? modelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: promptText,
          settings: {
            model: hermesProviderModelId,
            ...(banner.generation.aspectRatio
              ? { aspectRatio: banner.generation.aspectRatio }
              : {}),
            outputCount: 1,
          },
          references,
          entity: { type: "vertical_drama_ad_banner", id: banner.id },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: promptText,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_ad_banner_id: banner.id,
          },
          droppedReferenceCount,
        });
        const hermesNextBanner: VdAdBannerDesign = {
          ...banner,
          status: "generating",
          pendingTaskId: hermesTask.id,
        };
        const hermesNextBanners = banners.slice();
        hermesNextBanners[bannerIndex] = hermesNextBanner;
        await persistAdBannerDesigns(
          tenantId,
          userId,
          seriesId,
          rawProductTieIn,
          hermesNextBanners
        );
        return {
          taskId: hermesTask.id,
          creditCost: 0,
          banner: hermesNextBanner,
          droppedReferenceCount,
        };
      }

      const transportMetadata =
        transportDecision.kind === "mcp"
          ? transportDecision.transportMetadata
          : undefined;

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
          ...(transportMetadata ? { transportMetadata } : {}),
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
   * generation task, reusing the shared task-polling boundary behind
   * `media.ts`'s own `getTask` query. On a terminal state, persists the
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
      let task;
      try {
        task = await getUnifiedMediaTask({
          taskId: banner.pendingTaskId,
          userId,
          userToken,
          tenantId,
          auditContext: {
            userId,
            source: "trpc.verticalDramaSeries.getAdBannerImageStatus",
            stage: "poll",
          },
        });
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
        const durable = await ingestVerticalDramaMediaAsset({
          tenantId,
          userId,
          seriesId,
          mediaType: "image",
          sourceUrl: task.resultUrl,
          mimeType: "image/png",
          identity: task.id,
          purpose: "ad_banner",
        });
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
            url: durable.url,
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
