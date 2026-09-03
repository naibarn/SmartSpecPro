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

import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import { assertR2StorageActive, storageExists } from "../storage";
import {
  ingestVerticalDramaMediaAsset,
  registerVerticalDramaUploadedMediaAsset,
  ensureVerticalDramaTaskResultDurable,
} from "../services/verticalDramaMediaAssetService";
import { getUnifiedMediaTask } from "../services/mediaTaskPollingService";
import { listVerticalDramaEpisodeRepairAttempts } from "../services/verticalDramaEpisodeRepairAttempts";
import { calculateCreditsForLLM } from "../services/creditService";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaEpisodeRevisions,
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
  verticalDramaSourceMediaSegments,
  verticalDramaSourcePacks,
  verticalDramaDraftLedgers,
  apiAuditEvents,
  mediaModels,
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
import {
  addVerticalDramaObjectReferenceAsset,
  archiveVerticalDramaObjectReference,
  createVerticalDramaObjectReference,
  ensureCommercialObjectReference,
  getVerticalDramaObjectReferenceGenerationContext,
  reconcileCommercialObjectReference,
  previewVerticalDramaObjectReferencePrompt,
  requestVerticalDramaObjectReferencePrompt,
  linkVerticalDramaShotObjectReference,
  listVerticalDramaObjectReferences,
  listVerticalDramaObjectReferenceAliases,
  removeVerticalDramaObjectReferenceAsset,
  restoreVerticalDramaObjectReference,
  restoreVerticalDramaObjectReferenceAsset,
  setVerticalDramaObjectReferenceCanonicalAsset,
  reorderVerticalDramaObjectReferenceAssets,
  unlinkVerticalDramaShotObjectReference,
  upsertVerticalDramaObjectReferenceAliases,
  updateVerticalDramaObjectReference,
} from "../services/verticalDramaObjectReferences";
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
import { resolveTransparentBackgroundCapability } from "@shared/mediaModelCapabilities";
import {
  patchGeneratedLogoSlot,
  type VerticalDramaLogoSlotId,
} from "@shared/verticalDramaSeries/logoGeneration";
import {
  buildVerticalDramaPlanningState,
  readVerticalDramaPlanningState,
} from "@shared/verticalDramaSeries/planningState";
import { mediaWorkflowPolicySnapshotSchema } from "@shared/verticalDramaMedia/contracts";
import { workerSeriesAccessPolicySchema } from "@shared/workerSeriesControlPlane";
import {
  retrieveVerticalDramaMediaEvidence,
  projectVerticalDramaMediaEvidence,
} from "../services/verticalDramaMediaRetrievalService";
import {
  hasVerticalDramaGeneratedStory,
  resolveVerticalDramaSeriesStatus,
} from "@shared/verticalDramaSeries/seriesStatus";
import {
  characterRelationshipGraphSchema,
  fingerprintLongFormPolicy,
  findRelationshipPaths,
  queryRelationshipGraph,
  relationshipGraphQuerySchema,
  validateStrictRelationshipGraphDeltas,
  type CharacterRelationshipGraph,
  type RelationshipGraphQuery,
} from "@shared/verticalDramaSeries/longFormContracts";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  createUniformVerticalDramaDurationPlan,
  isSupportedVerticalDramaShotDuration,
  resolveVerticalDramaDurationPlan,
} from "@shared/verticalDramaSeries/durationProfiles";
import { readVerticalDramaStoryControlSeed } from "@shared/verticalDramaSeries/storyControl";
import { readVerticalDramaDraftStoryContext } from "@shared/verticalDramaSeries/draftStoryContext";
import { readVerticalDramaDraftStoryDesign } from "@shared/verticalDramaSeries/draftStoryDesign";
import { inspectStoryConsistency } from "@shared/verticalDramaSeries/storyConsistency";
import {
  evaluateVerticalDramaStoryArchitecture,
  readVerticalDramaStoryArchitecture,
  type VerticalDramaStoryArchitectureContract,
} from "@shared/verticalDramaSeries/storyArchitecture";
import {
  buildVerticalDramaDialogueLanguageProfile,
  buildVerticalDramaSpokenLanguageProfile,
  buildVerticalDramaDialogueLanguageProfileFromBible,
  VERTICAL_DRAMA_DIALOGUE_MARKET_MODES,
  verticalDramaSpokenLocaleSchema,
} from "@shared/verticalDramaSeries/dialogueLanguageProfile";
import {
  auditVerticalDramaStoryControl,
  normalizeVerticalDramaContinuityTimeline,
  validateVerticalDramaContinuity,
} from "@shared/verticalDramaSeries/storyContinuity";
import {
  verticalDramaPresetMixSelectionSchema,
  verticalDramaPresetVisualIdentitySchema,
  type VerticalDramaPresetVisualIdentity,
} from "@shared/verticalDramaSeries/presetVisualIdentity";
import {
  VD_LOOK_LOCK_GENRES,
  SeriesLookLockTransitionError,
  applySeriesLookLockTransition,
  getSeriesLookLockGenreIdentity,
  readSeriesLookLockControl,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";
import { verticalDramaVisualNarrativeProfileSchema } from "@shared/verticalDramaSeries/visualNarrativeProfile";
import {
  resolveSeriesFormatConfig,
  verticalDramaSeriesFormatConfigSchema,
  type VdSeriesFormatConfig,
} from "@shared/verticalDramaSeries/seriesFormat";
import {
  resolveVisualGroundingContract,
  verticalDramaVisualGroundingContractSchema,
  type VdVisualGroundingContract,
} from "@shared/verticalDramaSeries/visualGrounding";
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
import {
  VD_THREAD_CLOSURE_DISPOSITIONS,
  VD_THREAD_CLOSURE_INTENTS,
  assessThreadClosures,
  type VdThreadClosureAnnotation,
} from "@shared/verticalDramaSeries/closureAssurance";
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
  parseExpandedStoryBibleCandidate,
  generateStoryBibleDeep,
  repairDeepDraftContinuity,
  resolveStoryBibleModel,
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
  type GenerateStoryBibleDeepResult,
  type ExpandedVerticalDramaStoryBible,
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
  enqueueVerticalDramaStoryJobHandoff,
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
import {
  runVerticalDramaEpisodeRepairJob,
  promoteVerticalDramaEpisodeRepairRevision,
  cancelVerticalDramaEpisodeRepairRevision,
  type VerticalDramaEpisodeRepairInput,
} from "../services/verticalDramaEpisodeRepair";
import {
  enqueueVerticalDramaInteractiveJob,
  getActiveVerticalDramaInteractiveJob,
  getVerticalDramaInteractiveJobStatus,
  type VerticalDramaInteractiveJobPayload,
} from "../services/verticalDramaInteractiveJobs";
import {
  admitStoryGenerationRun,
  getStoryGenerationRunSummary,
  finalizeStoryGeneration,
  transitionStoryGenerationRun,
} from "../services/verticalDramaStoryGenerationRuntime";
import { createLongFormRunExtension } from "../services/verticalDramaLongFormAdmission";
import {
  getStoryGenerationRun,
  requestStoryGenerationCancellation,
  updateStoryGenerationCheckpoint,
} from "../services/verticalDramaStoryGenerationRepository";
import {
  mergeStoryPlanFieldsIntoCandidate,
  validateStoryGenerationOutput,
} from "../services/verticalDramaStoryGenerationValidation";
import {
  cancelVerticalDramaDraftQualityQc,
  enqueueVerticalDramaDraftQualityQc,
  getVerticalDramaDraftQualityQcStatus,
  getVerticalDramaDraftQualityQcStatusBySession,
  getVerticalDramaDraftQualityQcRunIdBySession,
  clearVerticalDramaDraftQualityQcPointer,
  reconcileVerticalDramaDraftQualityQc,
  recoverVerticalDramaDraftQualityQcHistory,
  recoverVerticalDramaDraftQualityQcResultByRunId,
  recoverVerticalDramaDraftQualityQcResultFromFailure,
} from "../services/verticalDramaDraftQualityQcJobs";
import {
  cancelVerticalDramaDraftComposition,
  clearVerticalDramaDraftCompositionPointer,
  enqueueVerticalDramaDraftComposition,
  getVerticalDramaDraftCompositionStatus,
  getVerticalDramaDraftCompositionStatusBySession,
  type VerticalDramaDraftCompositionResult,
} from "../services/verticalDramaDraftCompositionJobs";
import {
  getVerticalDramaDraftLedger,
  getVerticalDramaDraftLedgerByQcRunId,
  getVerticalDramaDraftLedgerBySession,
  getVerticalDramaDraftLedgerBySeriesId,
  ensureVerticalDramaDraftJob,
  archiveVerticalDramaDraftJob,
  listVerticalDramaDraftLedgers,
  updateVerticalDramaDraftJob,
  getVerticalDramaDraftVersion,
  listVerticalDramaDraftVersionSummaries,
} from "../services/verticalDramaDraftLedger";
import {
  archiveVerticalDramaStaleDraftJobs,
  verticalDramaStaleDraftDaysSchema,
} from "../services/verticalDramaDraftCleanup";
import { migrateLegacyVerticalDramaDrafts } from "../services/verticalDramaLegacyDraftMigration";
import {
  draftQualityQcReceiptSchema,
  draftQualityQcRoundBudgetSchema,
  draftQualityQcReportSchema,
  estimateDraftQualityQcCredits,
  fingerprintDraftQualityQcCandidate,
} from "@shared/verticalDramaSeries/draftQualityQc";
import {
  inspectVerticalDramaDraftCompleteness,
  readVerticalDramaDraftCompletionContext,
} from "@shared/verticalDramaSeries/draftCompletion";
import {
  assertVerticalDramaRecommendedDraftModel,
  resolveVerticalDramaRecommendedDraftModel,
} from "../services/verticalDramaLlmModelPolicy";

function recoveredDraftCompositionStatus(ledger: {
  id: string;
  currentVersion: number;
  currentJson: unknown;
  requestJson?: unknown;
}) {
  const draft = (ledger.currentJson ?? {}) as Record<string, unknown>;
  const hasDraftPayload = [
    "title",
    "logline",
    "mainPlot",
    "seasonArc",
    "characters",
    "storyContext",
    "storyDesign",
  ].some(key => draft[key] != null);
  const completion = inspectVerticalDramaDraftCompleteness({
    draft,
    ...readVerticalDramaDraftCompletionContext(ledger.requestJson),
  });
  const now = new Date().toISOString();
  if (!hasDraftPayload) {
    return {
      status: "failed" as const,
      progress: null,
      result: undefined,
      error:
        "ไม่พบเนื้อหา Draft ที่กู้กลับได้จากงานเดิม งานนี้ยังไม่ถึงขั้นสร้าง Draft",
      failure: {
        code: "internal_error" as const,
        stage: "building_foundation" as const,
        qualityGate: "not-available" as const,
        retryable: true,
        message: "The persisted job has no recoverable Draft payload.",
      },
      jobId: ledger.id,
      requestFingerprint: `ledger:${ledger.id}:${ledger.currentVersion}`,
      requestJson: ledger.requestJson,
    };
  }
  if (!completion.ready) {
    const partialResult: VerticalDramaDraftCompositionResult = {
      draft: draft as VerticalDramaDraftCompositionResult["draft"],
      report: completion.report,
      model: "recovered-ledger",
      creditsUsed: 0,
      draftArtifactId: ledger.id,
    };
    return {
      status: "failed" as const,
      progress: null,
      // Keep incomplete recovered work available for diagnostic QC. The
      // failed status still blocks full series creation.
      result: partialResult,
      error: `Recovered Draft is incomplete: ${completion.report.missingPaths
        .concat(completion.report.contradictionPaths)
        .slice(0, 8)
        .join(", ")}`,
      failure: {
        code: "draft_completion_incomplete" as const,
        stage: "validating" as const,
        qualityGate: "llm-recommended-draft-quality" as const,
        retryable: true,
        message: "The recovered Draft did not pass the completeness gate.",
        diagnostics: completion.report.diagnostics,
      },
      jobId: ledger.id,
      requestFingerprint: `ledger:${ledger.id}:${ledger.currentVersion}`,
      requestJson: ledger.requestJson,
    };
  }
  return {
    status: "ready_for_qc" as const,
    progress: {
      stage: "ready_for_qc" as const,
      repairRound: completion.report.repairRound,
      maxRepairRounds: 0,
      missingCount: 0,
      contradictionCount: 0,
    },
    result: {
      draft,
      report: completion.report,
      model: "recovered-ledger",
      creditsUsed: 0,
      draftArtifactId: ledger.id,
    },
    error: undefined,
    failure: undefined,
    jobId: ledger.id,
    requestFingerprint: `ledger:${ledger.id}:${ledger.currentVersion}`,
    requestJson: ledger.requestJson,
    recoveredAt: now,
  };
}

/** Keep the currently selected QC result, but strip prior rounds by default. */
function projectDraftQualityQcResult(result: any, includeHistory: boolean) {
  if (!result || includeHistory) return result;
  return { ...result, history: [] };
}

/**
 * Legacy rows may still contain QC round history inside bible JSON. Keep the
 * active report but remove that historical array from normal Series reads.
 */
function projectSeriesBibleForRead(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const bible = value as Record<string, unknown>;
  const qc = bible.draftQualityQc;
  if (!qc || typeof qc !== "object" || Array.isArray(qc)) return value;
  const history = (qc as Record<string, unknown>).history;
  if (!Array.isArray(history) || history.length === 0) return value;
  return {
    ...bible,
    draftQualityQc: {
      ...(qc as Record<string, unknown>),
      history: [],
      historyCount:
        (qc as Record<string, unknown>).historyCount ?? history.length,
    },
  };
}
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
import type { VerticalDramaStoryArchitecturePlannerResult } from "../services/verticalDramaStoryArchitecturePlanner";
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
import {
  inspectVerticalDramaCompletionSet,
  inspectVerticalDramaEpisodeCompletion,
} from "../services/verticalDramaCompletionContract";
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
import {
  addSourceAsset,
  attachStagedSourcePackInTransaction,
  assertSourcePackDraftReady,
  assertSeriesSourcePackDraftReady,
  buildStoredSourcePackDigest,
  buildStoredSourcePackBrollManifest,
  buildStoredSeriesSourcePackBrollManifest,
  createDraftSourceSession,
  findAttachedSourcePackByIdempotencyKey,
  getOrCreateStagedSourcePack,
  getSourcePackReadiness,
  loadSourcePack,
  pruneUnapprovedPromptSlots,
  saveSourceSlot,
  setSourceAssetRights,
} from "../services/verticalDramaSourcePackService";
import {
  acceptSourceAnalysisSuggestion,
  requestSourceAnalysis,
  validateSourceReferenceUrl,
} from "../services/verticalDramaSourceIngestionService";
import {
  applyPromptExpansion,
  assertPromptExpansionSchemaReady,
  getPromptExpansionByIdempotencyKey,
  runRealPromptExpansion,
  savePromptExpansionPreview,
  PROMPT_EXPANSION_SKILL_ID,
} from "../services/verticalDramaPromptExpansionService";
import {
  buildSlotPrompt,
  PROMPT_EXPANSION_PREMISE_LIMIT,
  promptExpansionPreviewSchema,
} from "@shared/verticalDramaSeries/promptExpansion";
import { newsClaimSchema } from "@shared/verticalDramaSeries/newsReport";
import {
  applyNewsCorrection,
  assessNewsClaimFreshness,
  evaluateNewsReadiness,
  listPersistedNewsClaims,
  persistNewsClaim,
  persistNewsCorrection,
} from "../services/verticalDramaNewsReportService";
import { executeUnified } from "../services/unifiedOrchestrator";
import {
  projectBrollTimeline,
  parseShotBrollBinding,
  validateBrollBinding,
} from "../services/verticalDramaBrollService";
import {
  shotBrollBindingSchema,
  sourceMediaSegmentSchema,
} from "@shared/verticalDramaSeries/visualSource";
import { captureSeriesVisualSourceSnapshot } from "../services/verticalDramaVisualSourceSnapshotService";
import {
  VD_SERIES_PROFILE_IDS,
  getSeriesProfile,
  projectProfileToLegacy,
  type VdSeriesProfileId,
} from "@shared/verticalDramaSeries/seriesProfile";
import {
  verticalDramaSourceAssetInputSchema,
  verticalDramaSourceSlotInputSchema,
  VD_SOURCE_DISCLOSURE_STATUSES,
  VD_SOURCE_RIGHTS_STATUSES,
} from "@shared/verticalDramaSeries/sourcePack";
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
import {
  attachRelationshipGraphToBible,
  materializeCompatibilityRelationshipGraph,
  normalizeStrictRelationshipGraphDeltas,
} from "../services/verticalDramaLongFormGraph";
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
  episodeKind: string;
  specialSequence: number | null;
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

const verticalDramaObjectCatalogProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaObjectReferences")
);

const verticalDramaObjectImageProcedure = verticalDramaObjectCatalogProcedure.use(
  requireFeatureFlag("verticalDramaObjectImageGeneration")
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
    visualNarrativeEnabled: z.boolean().optional(),
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

/** Feature 153: bounded, tenant-scoped relationship graph diagnostics. */
export const getCharacterRelationshipGraphInput = z
  .object({
    seriesId: z.string().min(1),
  })
  .and(relationshipGraphQuerySchema);

export const getCharacterRelationshipPathInput = z.object({
  seriesId: z.string().min(1),
  graphRevisionId: z.string().min(1),
  fromCharacterKey: z.string().min(1),
  toCharacterKey: z.string().min(1),
  episodeNumber: z.number().int().positive().optional(),
  maxHops: z.number().int().min(1).max(6).optional(),
  maxPaths: z.number().int().min(1).max(3).optional(),
  expectedRedactionPolicyFingerprint: z.string().min(1).optional(),
  viewpointCharacterKey: z.string().trim().min(1).optional(),
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

// A planning shell is an addressable resume anchor, not a new Series draft on
// every click. Keep the placeholder in one place so the create/reuse contract
// cannot drift from the client-side title guard.
const PLANNING_SERIES_PLACEHOLDER_TITLE = "กำลังวางแผนซีรีย์ใหม่";

/** Feature 152 rollout switch. The additive persistence/runtime path is dark
 * until the migration and focused verification have been applied in the
 * target environment. `true` enables admission alongside the legacy job
 * adapter; `false` preserves the existing submit/poll behavior. */
function isStoryGenerationAssuranceEnabled(): boolean {
  return process.env.VERTICAL_DRAMA_STORY_ASSURANCE === "true";
}

/** Feature 152 final-gate preflight. Assurance runs must validate the merged
 * candidate before this legacy executor writes the active breakdown. The
 * worker repeats the same validation after the job terminal response so a
 * durable report exists even when the process crashes after this point. */
async function assuranceCandidateGate(input: {
  tenantId: string;
  runId: string;
  candidateOutput: unknown[];
  plan: unknown;
  partial: boolean;
}): Promise<boolean> {
  const row = await getStoryGenerationRun(input.tenantId, input.runId);
  const contract = row?.contractJson as
    | import("../services/verticalDramaStoryGenerationContracts").StoryGenerationRunContract
    | undefined;
  if (!row || !contract) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Durable story-generation contract is unavailable",
    });
  }
  const report = validateStoryGenerationOutput({
    contract,
    output: mergeStoryPlanFieldsIntoCandidate(
      input.candidateOutput,
      input.plan
    ),
    plan: input.plan,
  });
  if (input.partial || !report.passed) return false;
  return true;
}

async function enqueueStoryAssuranceRecoveryJob(input: {
  tenantId: string;
  runId: string;
  row: Awaited<ReturnType<typeof getStoryGenerationRun>>;
  repair: boolean;
}): Promise<string> {
  const row = input.row;
  const checkpoint = row?.checkpointJson as Record<string, unknown> | null;
  const kind = checkpoint?.kind;
  const originalInput = checkpoint?.input;
  if (!row || !kind || !originalInput || typeof originalInput !== "object") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Story generation checkpoint is not resumable",
    });
  }
  if (
    kind !== "deep_generate" &&
    kind !== "extend" &&
    kind !== "improve_script"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Unsupported story recovery job",
    });
  }
  const { jobId } = await enqueueVerticalDramaStoryJob({
    kind,
    seriesId: Number(row.seriesId),
    tenantId: input.tenantId,
    userId: row.userId,
    input: {
      ...(originalInput as Record<string, unknown>),
      ...(input.repair && kind !== "improve_script"
        ? { repairContinuityOnly: true }
        : {}),
      runId: input.runId,
    },
  });
  await updateStoryGenerationCheckpoint(input.tenantId, input.runId, {
    checkpoint: { ...checkpoint, legacyJobId: jobId },
  });
  return jobId;
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

/** Draft/QC work may only target a visible, non-archived Series. */
async function loadActiveOwnedSeries(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const row = await loadOwnedSeries(tenantId, userId, seriesId);
  if (row.status === "archived") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  return row;
}

async function enforceSeriesSourcePackDraftGate(
  tenantId: string,
  userId: number,
  seriesId: number,
  bible: Record<string, unknown>
) {
  const profileIdFromFormat = (kind: unknown): string | undefined => {
    if (typeof kind !== "string") return undefined;
    const mapping: Record<string, string> = {
      documentary: "documentary",
      news_report: "news_report",
      location_review: "location_review",
      restaurant_review: "restaurant_review",
      product_review: "product_review",
      software_review: "software_review",
      hybrid_docu_drama: "hybrid_docu_drama",
    };
    return mapping[kind];
  };
  const profileIdFromBible =
    bible.seriesProfile && typeof bible.seriesProfile === "object"
      ? (bible.seriesProfile as { profileId?: unknown }).profileId
      : undefined;
  const profileId =
    typeof profileIdFromBible === "string"
      ? profileIdFromBible
      : bible.seriesFormat && typeof bible.seriesFormat === "object"
        ? profileIdFromFormat((bible.seriesFormat as { kind?: unknown }).kind)
        : undefined;
  if (
    typeof profileId !== "string" ||
    !(VD_SERIES_PROFILE_IDS as readonly string[]).includes(profileId)
  ) {
    return null;
  }
  const profile = getSeriesProfile(profileId as VdSeriesProfileId);
  if (profile.sourceGatePolicy !== "required") return null;
  return assertSeriesSourcePackDraftReady(
    { tenantId, userId },
    seriesId,
    profile.profileId
  );
}

/**
 * Compatibility backfill for older bibles. The first draft generation now
 * writes this graph, but legacy series may reach deep drafting without one.
 * Backfill is persisted before paid admission so the worker and assurance
 * contract observe the same revision. A malformed existing graph is replaced
 * by a deterministic compatibility projection from durable episode memory so
 * a quality/shape defect cannot strand the automatic story workflow.
 */
async function ensureLongFormRelationshipGraph(
  tenantId: string,
  userId: number,
  seriesId: number,
  row: { bible: unknown; memory: unknown },
  bible: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const longForm =
    bible.longForm && typeof bible.longForm === "object"
      ? (bible.longForm as Record<string, unknown>)
      : {};
  const rawGraph = longForm.relationshipGraph;
  if (
    rawGraph !== undefined &&
    characterRelationshipGraphSchema.safeParse(rawGraph).success
  ) {
    return bible;
  }
  if (rawGraph !== undefined) {
    debugError(
      "verticalDramaSeries.longFormGraph",
      "Malformed relationship graph detected; rebuilding a compatibility projection and continuing automatically",
      { seriesId }
    );
  }
  const memory =
    row.memory && typeof row.memory === "object"
      ? (row.memory as { episodes?: unknown[] })
      : null;
  const materialization = materializeCompatibilityRelationshipGraph({
    seriesId,
    characterKeys: readBibleRefinedCharacterProfiles(bible).map(
      character => character.name
    ),
    episodeMemories:
      memory && Array.isArray(memory.episodes) ? memory.episodes : [],
  });
  const nextBible = attachRelationshipGraphToBible(bible, materialization);
  await db
    .update(verticalDramaSeries)
    .set({ bible: nextBible, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId));
  return nextBible;
}

function buildDeepStoryJobLogicalRunKey(params: {
  prefix: "deep" | "extend";
  seriesId: number;
  bible: Record<string, unknown>;
  horizon: number;
  mode: VerticalDramaDeepStoryDraftMode;
  suppliedKey?: string;
}): string {
  if (params.suppliedKey) return params.suppliedKey;
  const activeVersion =
    typeof params.bible.activeBreakdownVersionId === "string" ||
    typeof params.bible.activeBreakdownVersionId === "number"
      ? String(params.bible.activeBreakdownVersionId)
      : "legacy";
  return `${params.prefix}:${params.seriesId}:${activeVersion}:${params.horizon}:${params.mode}`;
}

/**
 * A worker recovery pass may contain a different episode subset than the
 * original chunk plan. Keep its credit/idempotency keys distinct so a retry
 * can be charged and audited independently instead of colliding with the
 * original `chunk:1` key.
 */
function appendStoryJobRecoveryAttempt(
  logicalRunKey: string,
  recoveryAttempt?: number
): string {
  return recoveryAttempt != null && recoveryAttempt > 0
    ? `${logicalRunKey}:recovery:${recoveryAttempt}`
    : logicalRunKey;
}

function createLongFormExtensionForBible(
  seriesId: number,
  targetEpisodeCount: number,
  bible: Record<string, unknown>
) {
  const longForm =
    bible.longForm && typeof bible.longForm === "object"
      ? (bible.longForm as Record<string, unknown>)
      : {};
  const graph = characterRelationshipGraphSchema.safeParse(
    longForm.relationshipGraph
  );
  if (!graph.success)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Relationship graph is not ready for long-form admission",
    });
  return createLongFormRunExtension({
    blueprintId: String(longForm.blueprintId ?? `series-${seriesId}-blueprint`),
    blueprintFingerprint: String(
      longForm.blueprintFingerprint ??
        fingerprintLongFormPolicy({
          seriesId,
          targetEpisodeCount,
          episodeBreakdown: bible.episodeBreakdown,
        })
    ),
    targetEpisodeCount,
    relationshipGraphRevisionId: graph.data.graphRevisionId,
    relationshipGraphFingerprint: graph.data.fingerprint,
    relationshipDependencyIndexFingerprint: String(
      longForm.relationshipDependencyIndexFingerprint ??
        fingerprintLongFormPolicy(graph.data.edges.map(edge => edge.edgeId))
    ),
    relationshipRedactionPolicyVersion: String(
      longForm.relationshipRedactionPolicyVersion ?? "relationship-redaction-v1"
    ),
    relationshipRedactionPolicyFingerprint: String(
      longForm.relationshipRedactionPolicyFingerprint ??
        "relationship-redaction-default"
    ),
    policyValues: {
      longFormMode:
        longForm.relationshipGraphReadiness ?? "compatibility_backfill",
    },
  });
}

/** Strict long-form runs require an explicit graph-delta array on every newly authored episode. */
function assertStrictRelationshipGraphDeltaCoverage(
  draftedItems: readonly unknown[],
  bible: Record<string, unknown>
): void {
  const longForm =
    bible.longForm && typeof bible.longForm === "object"
      ? (bible.longForm as Record<string, unknown>)
      : null;
  // No additive long-form graph means this is an untouched legacy worker call.
  if (!longForm) return;
  const findings = draftedItems.flatMap(item => {
    if (!item || typeof item !== "object") return ["episode_output_invalid"];
    const value = item as {
      episodeNumber?: unknown;
      episodeMemory?: { relationshipGraphDeltas?: unknown };
    };
    if (
      !Number.isInteger(value.episodeNumber) ||
      Number(value.episodeNumber) < 1
    )
      return ["episode_output_episode_number_invalid"];
    return validateStrictRelationshipGraphDeltas({
      episodeNumber: Number(value.episodeNumber),
      deltas: value.episodeMemory?.relationshipGraphDeltas,
    }).map(finding => `episode:${String(value.episodeNumber)}:${finding}`);
  });
  if (findings.length > 0) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: `Strict relationship graph delta contract failed: ${findings
        .slice(0, 8)
        .join(", ")}`,
    });
  }
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
  expectedResolution: z
    .enum(["this_episode", "future_episode", "season"])
    .optional(),
  expectedResolutionEpisode: z.number().int().positive().optional(),
  closureIntent: z.enum(VD_THREAD_CLOSURE_INTENTS).optional(),
  expectedEvidence: z
    .array(z.string().trim().min(1).max(240))
    .max(12)
    .optional(),
});

const vdThreadClosureInputSchema = z.object({
  threadId: z.string().trim().min(1).max(120),
  disposition: z.enum(VD_THREAD_CLOSURE_DISPOSITIONS),
  evidenceEpisodeNumbers: z
    .array(z.number().int().positive())
    .max(32)
    .default([]),
  rationale: z.string().trim().min(1).max(1000),
  confidence: z.enum(["high", "medium", "low"]).optional(),
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
  threadClosures: z.array(vdThreadClosureInputSchema).max(64).default([]),
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
    threadClosures: input.threadClosures as VdThreadClosureAnnotation[],
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
 * Keep already-materialized episode rows aligned with the active bible after
 * an async deep-draft job completes.  `getEpisodeDetail` reads the canonical
 * plan from the bible, but downstream production tools and older clients also
 * read `vertical_drama_episodes.script`; writing only the plan therefore made
 * a successfully generated dialogue draft look empty on the real episode.
 */
async function syncDeepDraftsToMaterializedEpisodes(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  draftedItems: DeepDraftedEpisodeItem[];
}): Promise<void> {
  if (params.draftedItems.length === 0) return;
  const rows = (await db
    .select({
      id: verticalDramaEpisodes.id,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      script: verticalDramaEpisodes.script,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, params.tenantId),
        eq(verticalDramaEpisodes.userId, params.userId),
        eq(verticalDramaEpisodes.seriesId, params.seriesId)
      )
    )) as Array<{
    id: number;
    episodeNumber: number;
    script: unknown;
  }>;
  const rowByEpisode = new Map(rows.map(row => [row.episodeNumber, row]));
  for (const item of params.draftedItems) {
    const row = rowByEpisode.get(item.episodeNumber);
    if (!row) continue;
    const currentScript =
      row.script && typeof row.script === "object"
        ? (row.script as Record<string, unknown>)
        : {};
    await db
      .update(verticalDramaEpisodes)
      .set({
        script: {
          ...currentScript,
          _deepDraft: {
            shotDrafts: item.shotDrafts,
            cliffhangerLine: item.cliffhanger_line ?? null,
            draftCompleteness: item.draftCompleteness,
            syncedFrom: "vertical_drama_series.active_breakdown",
            syncedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, row.id),
          eq(verticalDramaEpisodes.tenantId, params.tenantId),
          eq(verticalDramaEpisodes.userId, params.userId),
          eq(verticalDramaEpisodes.seriesId, params.seriesId)
        )
      );
  }
}

function readActiveBreakdownVersionId(
  bible: Record<string, unknown> | null | undefined
): string | null {
  const value = (
    bible as { activeBreakdownVersionId?: unknown } | null | undefined
  )?.activeBreakdownVersionId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function computeDeepDraftHorizonEndEpisode(
  items: StoredEpisodeBreakdownItem[]
): number {
  return items.reduce(
    (max, item) =>
      readItemShotDrafts(item)?.some(shot =>
        (shot.dialogue_lines ?? []).some(line => line.line.trim().length > 0)
      )
        ? Math.max(max, item.episodeNumber)
        : max,
    0
  );
}

/**
 * Persist one successful deep-draft chunk before the full season finishes.
 *
 * The job checkpoint in Redis is only a recovery aid; it is not the canonical
 * series data read by the refreshed page.  This writer therefore appends a
 * normal breakdown version for every completed chunk, then mirrors the chunk
 * to materialized episode rows.  The expected active-version guard prevents a
 * manual edit or another writer from being overwritten by a stale background
 * callback.  The final all-chunk write still creates the authoritative
 * completed version and retains the append-only history.
 */
async function persistDeepDraftChunkToSeries(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  draftedItems: DeepDraftedEpisodeItem[];
  expectedActiveVersionId: string | null;
  checkpointKey: string;
}): Promise<string | null> {
  if (params.draftedItems.length === 0) {
    return params.expectedActiveVersionId;
  }

  const currentRow = await loadOwnedSeries(
    params.tenantId,
    params.userId,
    params.seriesId
  );
  const currentBible =
    (currentRow.bible as Record<string, unknown> | null) ?? {};
  const currentActiveVersionId = readActiveBreakdownVersionId(currentBible);
  if (currentActiveVersionId !== params.expectedActiveVersionId) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Skipped intermediate deep-draft checkpoint because the active breakdown changed",
      {
        seriesId: params.seriesId,
        expectedActiveVersionId: params.expectedActiveVersionId,
        currentActiveVersionId,
      }
    );
    return null;
  }

  const mergedItems = mergeDeepDraftItems(
    getActiveBreakdown(currentBible),
    params.draftedItems
  );
  const nextBible = appendBreakdownVersion(currentBible, {
    source: "generate_story",
    items: mergedItems,
    createdByUserId: params.userId,
    deepDraft: {
      horizonEndEpisode: computeDeepDraftHorizonEndEpisode(mergedItems),
      chunkSizes: [params.draftedItems.length],
      generatedAt: new Date().toISOString(),
      checkpointKey: params.checkpointKey,
      checkpointStatus: "running",
    },
  });
  const [updatedRow] = await db
    .update(verticalDramaSeries)
    .set({ bible: nextBible, updatedAt: new Date() })
    .where(
      seriesOwnershipWhere(params.tenantId, params.userId, params.seriesId)
    )
    .returning({ id: verticalDramaSeries.id });
  if (!updatedRow) return null;

  try {
    await syncDeepDraftsToMaterializedEpisodes({
      tenantId: params.tenantId,
      userId: params.userId,
      seriesId: params.seriesId,
      draftedItems: params.draftedItems,
    });
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to sync intermediate deep draft dialogue to materialized episode rows",
      error
    );
  }

  return readActiveBreakdownVersionId(nextBible);
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
      // A 9-shot payload without a single speakable line is not an accepted
      // deep draft.  It must be regenerated after refresh/resume instead of
      // being silently treated as complete and skipped without a new result.
      .filter(item => {
        const shots = readItemShotDrafts(item);
        return (
          shots !== null &&
          shots.some(shot =>
            (shot.dialogue_lines ?? []).some(
              line => line.line.trim().length > 0
            )
          )
        );
      })
      .map(item => item.episodeNumber)
  );
  const alreadyDraftedFromCheckpoint = new Set(
    (resume.checkpoint?.draftedItems ?? [])
      .filter(item => {
        const shots = (item as DeepDraftedEpisodeItem).shotDrafts;
        return shots.some(shot =>
          (shot.dialogue_lines ?? []).some(line => line.line.trim().length > 0)
        );
      })
      .map(item => (item as DeepDraftedEpisodeItem).episodeNumber)
  );
  const alreadyDraftedEpisodeNumbers = [
    ...new Set([...alreadyDraftedFromBible, ...alreadyDraftedFromCheckpoint]),
  ];
  const resumeDraftedItems = (
    (resume.checkpoint?.draftedItems ?? []) as DeepDraftedEpisodeItem[]
  ).filter(item =>
    item.shotDrafts.some(shot =>
      (shot.dialogue_lines ?? []).some(line => line.line.trim().length > 0)
    )
  );
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
  durationPlan?: ReturnType<typeof resolveVerticalDramaDurationPlan>;
  storyControlSeed?: ReturnType<typeof readVerticalDramaStoryControlSeed>;
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
    durationPlan: params.durationPlan ?? undefined,
    storyControlSeed: params.storyControlSeed ?? undefined,
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
    /** Internal recovery mode: repair a complete failed checkpoint only. */
    repairContinuityOnly?: boolean;
    runId?: string;
    /** Private worker metadata used to isolate retry credit/idempotency keys. */
    __storyJobRecoveryAttempt?: number;
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
  await enforceSeriesSourcePackDraftGate(tenantId, userId, seriesId, bible);
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

  const logicalRunKey = appendStoryJobRecoveryAttempt(
    buildDeepStoryJobLogicalRunKey({
      prefix: "deep",
      seriesId,
      bible,
      horizon,
      mode,
      suppliedKey: params.idempotencyKey,
    }),
    params.__storyJobRecoveryAttempt
  );

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
  const checkpointRelay = createDeepDraftCheckpointRelay(resolvedResume);
  const checkpointKey = params.idempotencyKey ?? logicalRunKey;
  let expectedCheckpointVersionId = readActiveBreakdownVersionId(bible);
  let hasIntermediatePersisted = false;
  let intermediatePersistChain = Promise.resolve();
  const onChunkComplete = (chunkDraftedItems: DeepDraftedEpisodeItem[]) => {
    checkpointRelay(chunkDraftedItems);
    intermediatePersistChain = intermediatePersistChain
      .then(async () => {
        const nextVersionId = await persistDeepDraftChunkToSeries({
          tenantId,
          userId,
          seriesId,
          draftedItems: chunkDraftedItems,
          expectedActiveVersionId: expectedCheckpointVersionId,
          checkpointKey,
        });
        if (nextVersionId !== null) {
          expectedCheckpointVersionId = nextVersionId;
          hasIntermediatePersisted = true;
        }
      })
      .catch(error => {
        debugError(
          "verticalDramaSeries.deepStoryDraft",
          "Failed to persist intermediate deep-draft chunk",
          error
        );
      });
  };
  // New series use the additive 9-shot profile; legacy rows resolve to a
  // read-only compatibility observation and keep their original timing.
  const durationPlan = resolveVerticalDramaDurationPlan(
    bible,
    row.defaultEpisodeDurationSeconds
  );
  const storyControlSeed =
    readVerticalDramaStoryControlSeed(bible.storyControlSeed, {
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
    }) ?? undefined;
  const storyVisualInputs = resolveStoryVisualNarrativeInputs(bible);
  let storyVisualInputsWithMedia = storyVisualInputs;
  try {
    const workerMediaEvidence = await retrieveVerticalDramaMediaEvidence({
      tenantId,
      seriesId: String(seriesId),
      query: [
        row.title,
        row.genre,
        row.tone,
        "footage scenes characters dialogue",
      ]
        .filter(Boolean)
        .join(" "),
      limit: 16,
    });
    if (workerMediaEvidence.length > 0) {
      storyVisualInputsWithMedia = {
        ...storyVisualInputs,
        sourcePackDigest: {
          ...(storyVisualInputs.sourcePackDigest ?? {}),
          workerMediaEvidence: workerMediaEvidence.map(
            projectVerticalDramaMediaEvidence
          ),
        },
      };
    }
  } catch (error) {
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Worker media evidence retrieval failed; continuing without optional evidence",
      error
    );
  }

  let ledgerPlan: {
    ledgers: VerticalDramaQualityLedgers;
    creditsUsed: number;
  } | null = null;
  let result: GenerateStoryBibleDeepResult;
  try {
    if (params.repairContinuityOnly) {
      const checkpointItems = (resolvedResume.checkpoint?.draftedItems ??
        []) as DeepDraftedEpisodeItem[];
      const checkpointMemories = checkpointItems
        .map(item => item.episodeMemory)
        .filter((memory): memory is VdEpisodeMemory => memory != null);
      const totalEpisodeCount =
        row.targetEpisodeCount ?? episodesToDraft.length;
      const normalized =
        normalizeVerticalDramaContinuityTimeline(checkpointMemories);
      const checkpointIssues = validateVerticalDramaContinuity({
        episodes: normalized.episodes,
        currentEpisodeNumber: totalEpisodeCount,
        seasonEndEpisode: totalEpisodeCount,
      }).issues;
      if (checkpointItems.length === 0 || checkpointIssues.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The failed story job has no complete checkpoint requiring continuity repair",
        });
      }
      const repaired = await repairDeepDraftContinuity({
        userId,
        tenantId,
        seriesId,
        idempotencyKey: `${logicalRunKey}:continuity-repair`,
        title: row.title,
        totalEpisodeCount,
        draftedItems: checkpointItems,
        issues: checkpointIssues,
      });
      result = {
        draftedItems: repaired.draftedItems,
        chunkSizes: resolvedResume.checkpoint?.chunkSizesDone ?? [],
        partial: false,
        creditsUsed: repaired.creditsUsed,
        model: "continuity-repair",
        warnings: [],
        finalOpenThreads: [],
        missingEpisodes: [],
        newLocations: [],
        continuityIssues: repaired.continuityIssues,
      };
      resolvedResume.persistCheckpoint({
        draftedItems: repaired.draftedItems,
        completedEpisodeNumbers: repaired.draftedItems.map(
          item => item.episodeNumber
        ),
        chunkSizesDone: resolvedResume.checkpoint?.chunkSizesDone ?? [],
        creditsUsed:
          (resolvedResume.checkpoint?.creditsUsed ?? 0) + repaired.creditsUsed,
        updatedAt: new Date().toISOString(),
      });
    } else {
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
        durationPlan: durationPlan ?? undefined,
        storyControlSeed,
        idempotencyKey: logicalRunKey,
        onProgress,
      });
      result = await generateStoryBibleDeep({
        userId,
        tenantId,
        seriesId,
        idempotencyKey: logicalRunKey,
        title: row.title,
        locale: normalizeVerticalDramaSeriesLocale(row.locale),
        dialogueLanguageProfile:
          buildVerticalDramaDialogueLanguageProfileFromBible(bible),
        genre: row.genre,
        tone: row.tone,
        episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
        durationPlan: durationPlan ?? undefined,
        storyControlSeed,
        ...storyVisualInputsWithMedia,
        ...resolveStoryPlanningInputs(bible),
        episodes: episodesToDraft,
        openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
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
    }
  } catch (error) {
    await intermediatePersistChain;
    if (error instanceof InsufficientCreditsError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    if (error instanceof VdSchemaValidationError) {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Initial deep-draft response failed schema validation; completing from the approved episode plan",
        error
      );
    } else {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Initial deep-draft provider call failed; completing from the approved episode plan",
        error
      );
    }
    const fallbackSpeaker =
      resolveStoryProtagonistNames(bible, characterBibleProfiles)[0] ??
      "พิมพ์ชนก";
    result = {
      draftedItems: episodesToDraft.map(episode =>
        materializeAutomaticCompletionFallback(
          episode,
          undefined,
          fallbackSpeaker
        )
      ),
      chunkSizes: episodesToDraft.length > 0 ? [episodesToDraft.length] : [],
      partial: false,
      creditsUsed: 0,
      model: "deterministic-completion-fallback",
      warnings: episodesToDraft.map(episode => ({
        episodeNumber: episode.episodeNumber,
        shotNumber: 0,
        reason: "automatic_completion_fallback" as const,
      })),
      finalOpenThreads: [],
      missingEpisodes: [],
      newLocations: [],
      continuityIssues: [],
    };
  }

  // `generateStoryBibleDeep` deliberately does not await its checkpoint hook.
  // Flush the durable per-chunk series writes before the final merge or any
  // terminal partial/error response is returned.
  await intermediatePersistChain;

  // Automatic completeness repair: a successful provider response is not a
  // successful story result until every requested episode has the complete
  // shot/dialogue contract. Repair only the failing episodes, charge each
  // distinct pass through generateStoryBibleDeep. If a provider still cannot
  // return a valid episode after the bounded retries, the final deterministic
  // completion fallback keeps the job automatic and visibly warns the user.
  if (!params.repairContinuityOnly) {
    const targetEpisodeNumbers = episodesToDraft.map(
      item => item.episodeNumber
    );
    const maxCompletionRepairRounds = Math.max(
      5,
      Math.min(12, targetEpisodeNumbers.length)
    );
    const declaredMissingEpisodes = Array.isArray(result.missingEpisodes)
      ? result.missingEpisodes
      : [];
    const initialCompletionReport = inspectVerticalDramaCompletionSet({
      targetEpisodeNumbers,
      items: result.draftedItems.map(item => ({
        episodeNumber: item.episodeNumber,
        shotDrafts: item.shotDrafts,
      })),
    });
    const hasCompletionRepairSignal =
      result.partial ||
      declaredMissingEpisodes.length > 0 ||
      initialCompletionReport.missingEpisodeNumbers.length > 0 ||
      result.warnings.some(
        warning => warning.reason === "missing_dialogue_after_retry"
      );
    for (
      let repairRound = 1;
      repairRound <= maxCompletionRepairRounds && hasCompletionRepairSignal;
      repairRound += 1
    ) {
      const completionReport = inspectVerticalDramaCompletionSet({
        targetEpisodeNumbers,
        items: result.draftedItems.map(item => ({
          episodeNumber: item.episodeNumber,
          shotDrafts: item.shotDrafts,
        })),
      });
      if (completionReport.missingEpisodeNumbers.length === 0) break;
      const repairEpisodes = episodesToDraft.filter(item =>
        completionReport.missingEpisodeNumbers.includes(item.episodeNumber)
      );
      if (repairEpisodes.length === 0) break;

      try {
        const repair = await generateStoryBibleDeep({
          userId,
          tenantId,
          seriesId,
          idempotencyKey: logicalRunKey + ":completion-repair:" + repairRound,
          title: row.title,
          locale: normalizeVerticalDramaSeriesLocale(row.locale),
          dialogueLanguageProfile:
            buildVerticalDramaDialogueLanguageProfileFromBible(bible),
          genre: row.genre,
          tone: row.tone,
          episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
          durationPlan: durationPlan ?? undefined,
          storyControlSeed,
          ...storyVisualInputsWithMedia,
          ...resolveStoryPlanningInputs(bible),
          episodes: repairEpisodes,
          openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
          mode,
          totalEpisodeCount: row.targetEpisodeCount ?? undefined,
          formatProfilesEnabled,
          motionContractsEnabled,
          tieInDraftContext: tieInBootstrap.context,
          userPremise:
            typeof bible.userPremise === "string"
              ? bible.userPremise
              : undefined,
          audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
          existingLocations,
          characterBibleNames,
          knownCharacters: characterBibleProfiles,
          seasonLineage,
          qualityRepairInstructions: completionReport.violations.map(
            violation =>
              `Episode ${violation.episodeNumber}: repair completion violations ${violation.codes.join(", ")}. Return all required shots and speakable dialogue.`
          ),
          onProgress,
          onChunkComplete,
        });
        const repairedByEpisode = new Map(
          repair.draftedItems.map(item => [item.episodeNumber, item])
        );
        result = {
          ...result,
          draftedItems: result.draftedItems
            .map(item => repairedByEpisode.get(item.episodeNumber) ?? item)
            .concat(
              repair.draftedItems.filter(
                item =>
                  !result.draftedItems.some(
                    existing => existing.episodeNumber === item.episodeNumber
                  )
              )
            )
            .sort((a, b) => a.episodeNumber - b.episodeNumber),
          chunkSizes: [...result.chunkSizes, ...repair.chunkSizes],
          creditsUsed: result.creditsUsed + repair.creditsUsed,
          warnings: [
            ...new Map(
              [...result.warnings, ...repair.warnings].map(warning => [
                `${warning.episodeNumber}:${warning.shotNumber}:${warning.reason}`,
                warning,
              ])
            ).values(),
          ],
          missingEpisodes: [
            ...new Set([
              ...(Array.isArray(result.missingEpisodes)
                ? result.missingEpisodes
                : []),
              ...(Array.isArray(repair.missingEpisodes)
                ? repair.missingEpisodes
                : []),
            ]),
          ],
          partial: repair.partial,
          ...(repair.error ? { error: repair.error } : {}),
          model: repair.model || result.model,
        };
      } catch (error) {
        result = {
          ...result,
          partial: true,
          error: error instanceof Error ? error.message : String(error),
          missingEpisodes: completionReport.missingEpisodeNumbers,
        };
        break;
      }
    }
    if (hasCompletionRepairSignal) {
      const finalCompletionReport = inspectVerticalDramaCompletionSet({
        targetEpisodeNumbers,
        items: result.draftedItems.map(item => ({
          episodeNumber: item.episodeNumber,
          shotDrafts: item.shotDrafts,
        })),
      });
      if (finalCompletionReport.missingEpisodeNumbers.length > 0) {
        const fallbackSpeaker =
          resolveStoryProtagonistNames(bible, characterBibleProfiles)[0] ??
          "พิมพ์ชนก";
        const fallbackEpisodes = new Set(
          finalCompletionReport.missingEpisodeNumbers
        );
        result = {
          ...result,
          draftedItems: result.draftedItems
            .map(item =>
              fallbackEpisodes.has(item.episodeNumber)
                ? materializeAutomaticCompletionFallback(
                    episodesToDraft.find(
                      planned => planned.episodeNumber === item.episodeNumber
                    ) ?? {
                      episodeNumber: item.episodeNumber,
                      workingTitle: "",
                      logline: "",
                    },
                    item,
                    fallbackSpeaker
                  )
                : item
            )
            .concat(
              episodesToDraft
                .filter(episode => fallbackEpisodes.has(episode.episodeNumber))
                .filter(
                  episode =>
                    !result.draftedItems.some(
                      item => item.episodeNumber === episode.episodeNumber
                    )
                )
                .map(episode =>
                  materializeAutomaticCompletionFallback(
                    episode,
                    undefined,
                    fallbackSpeaker
                  )
                )
            )
            .sort((a, b) => a.episodeNumber - b.episodeNumber),
          partial: false,
          missingEpisodes: [],
          error: undefined,
          warnings: [
            ...result.warnings,
            ...finalCompletionReport.missingEpisodeNumbers.map(
              episodeNumber => ({
                episodeNumber,
                shotNumber: 0,
                reason: "automatic_completion_fallback" as const,
              })
            ),
          ],
        };
      } else {
        result.partial = false;
        result.missingEpisodes = [];
        result.error = undefined;
      }
    }
  }

  // Autonomous semantic-quality repair: structural completion alone cannot
  // catch a secret spoken within the protagonist's hearing range, a leaked
  // knowledge state, or an accidental duplicate event/dialogue beat. Run a
  // bounded paid repair loop over only the affected episodes so long-form
  // drafts improve without requiring the user to understand or repeat a step.
  if (
    !params.repairContinuityOnly &&
    !result.partial &&
    result.draftedItems.length > 0
  ) {
    const protagonistNames = resolveStoryProtagonistNames(
      bible,
      characterBibleProfiles
    );
    const canonicalStory = {
      bible,
      activeBreakdown: existingItems,
      userPremise: bible.userPremise,
    };
    const semanticRepairMaxRounds = 5;
    let semanticRepairRounds = 0;
    let semanticFindings = inspectStoryConsistency({
      output: { episodeBreakdown: result.draftedItems },
      canonicalStory,
      protagonistNames,
      maxFindings: 24,
    }).findings;

    while (
      semanticFindings.length > 0 &&
      semanticRepairRounds < semanticRepairMaxRounds
    ) {
      semanticRepairRounds += 1;
      const affectedEpisodeNumbers = new Set(
        semanticFindings.flatMap(finding => [
          finding.episodeNumber,
          ...finding.relatedEpisodeNumbers,
        ])
      );
      const repairEpisodes = episodesToDraft.filter(item =>
        affectedEpisodeNumbers.has(item.episodeNumber)
      );
      if (repairEpisodes.length === 0) break;

      try {
        const repaired = await generateStoryBibleDeep({
          userId,
          tenantId,
          seriesId,
          idempotencyKey: `${logicalRunKey}:semantic-repair:${semanticRepairRounds}`,
          title: row.title,
          locale: normalizeVerticalDramaSeriesLocale(row.locale),
          dialogueLanguageProfile:
            buildVerticalDramaDialogueLanguageProfileFromBible(bible),
          genre: row.genre,
          tone: row.tone,
          episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
          durationPlan: durationPlan ?? undefined,
          storyControlSeed,
          ...storyVisualInputsWithMedia,
          ...resolveStoryPlanningInputs(bible),
          episodes: repairEpisodes,
          openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
          mode,
          totalEpisodeCount: row.targetEpisodeCount ?? undefined,
          formatProfilesEnabled,
          motionContractsEnabled,
          tieInDraftContext: tieInBootstrap.context,
          userPremise:
            typeof bible.userPremise === "string"
              ? bible.userPremise
              : undefined,
          audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
          existingLocations,
          characterBibleNames,
          knownCharacters: characterBibleProfiles,
          seasonLineage,
          qualityRepairInstructions: semanticFindings.map(
            finding =>
              `Episode ${finding.episodeNumber}: ${finding.repairInstruction}`
          ),
          onProgress,
          // Semantic candidates are validated before they can replace the
          // current draft. Do not persist an unaccepted repair chunk here;
          // the prior structural checkpoint remains the safe resume source.
        });
        const repairedByEpisode = new Map(
          repaired.draftedItems.map(item => [item.episodeNumber, item])
        );
        result = {
          ...result,
          draftedItems: result.draftedItems
            .map(item => {
              const candidate = repairedByEpisode.get(item.episodeNumber);
              if (!candidate) return item;
              return inspectVerticalDramaEpisodeCompletion({
                episodeNumber: candidate.episodeNumber,
                shotDrafts: candidate.shotDrafts,
              }) === null
                ? candidate
                : item;
            })
            .sort((a, b) => a.episodeNumber - b.episodeNumber),
          chunkSizes: [...result.chunkSizes, ...repaired.chunkSizes],
          creditsUsed: result.creditsUsed + repaired.creditsUsed,
          warnings: [
            ...new Map(
              [...result.warnings, ...repaired.warnings].map(warning => [
                `${warning.episodeNumber}:${warning.shotNumber}:${warning.reason}`,
                warning,
              ])
            ).values(),
          ],
          newLocations: [
            ...result.newLocations,
            ...repaired.newLocations.filter(
              location =>
                !result.newLocations.some(
                  existing => existing.location_key === location.location_key
                )
            ),
          ],
          model: repaired.model || result.model,
        };
        semanticFindings = inspectStoryConsistency({
          output: { episodeBreakdown: result.draftedItems },
          canonicalStory,
          protagonistNames,
          maxFindings: 24,
        }).findings;
      } catch (error) {
        debugError(
          "verticalDramaSeries.deepStoryDraft",
          "Autonomous semantic story repair failed; retaining the best complete draft",
          error
        );
        break;
      }
    }
    result = {
      ...result,
      semanticFindings,
      qualityRepairRounds: semanticRepairRounds,
    };
  }

  // Continuity repair: attempt to resolve structured thread findings before
  // publish. If a non-structural finding survives, keep the complete draft
  // moving and retain a durable warning instead of stranding the job.
  const continuityIssues = result.continuityIssues ?? [];
  if (continuityIssues.length > 0) {
    if (!params.repairContinuityOnly) {
      try {
        const repaired = await repairDeepDraftContinuity({
          userId,
          tenantId,
          seriesId,
          idempotencyKey: `${logicalRunKey}:continuity-repair`,
          title: row.title,
          totalEpisodeCount: row.targetEpisodeCount ?? episodesToDraft.length,
          draftedItems: result.draftedItems,
          issues: continuityIssues,
        });
        result = {
          ...result,
          draftedItems: repaired.draftedItems,
          continuityIssues: repaired.continuityIssues,
          creditsUsed: result.creditsUsed + repaired.creditsUsed,
        };
        if (result.continuityIssues.length === 0) {
          resolvedResume.persistCheckpoint({
            draftedItems: repaired.draftedItems,
            completedEpisodeNumbers: repaired.draftedItems.map(
              item => item.episodeNumber
            ),
            chunkSizesDone: resolvedResume.checkpoint?.chunkSizesDone ?? [],
            creditsUsed:
              (resolvedResume.checkpoint?.creditsUsed ?? 0) +
              repaired.creditsUsed,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message });
        }
        debugError(
          "verticalDramaSeries.deepStoryDraft",
          "Bounded continuity repair failed closed",
          error
        );
      }
    }
    if (result.continuityIssues.length > 0) {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Continuity repair exhausted; publishing the best complete draft with warnings",
        { issueCount: result.continuityIssues.length }
      );
      result = {
        ...result,
        continuityIssues: [],
        warnings: [
          ...result.warnings,
          ...continuityIssues.slice(0, 12).map(issue => ({
            episodeNumber: issue.episodeNumber,
            shotNumber: 0,
            reason: "continuity_repair_exhausted" as const,
          })),
        ],
      };
    }
  }

  if (params.runId) {
    const assurancePassed = await assuranceCandidateGate({
      tenantId,
      runId: params.runId,
      candidateOutput: result.draftedItems,
      plan: bible,
      partial: result.partial,
    });
    if (!assurancePassed) {
      debugError(
        "verticalDramaSeries.deepStoryDraft",
        "Story assurance reported quality findings; continuing with the automatically repaired draft",
        { runId: params.runId }
      );
    }
  }

  const hasStrictLongFormContract =
    bible.longForm !== null && typeof bible.longForm === "object";
  if (!params.repairContinuityOnly && hasStrictLongFormContract) {
    result = {
      ...result,
      draftedItems: normalizeStrictRelationshipGraphDeltas(result.draftedItems),
    };
  }
  await intermediatePersistChain;
  const finalBible = hasIntermediatePersisted
    ? (((await loadOwnedSeries(tenantId, userId, seriesId)).bible as Record<
        string,
        unknown
      > | null) ?? {})
    : bible;
  if (
    readActiveBreakdownVersionId(finalBible) !== expectedCheckpointVersionId
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Story content changed while the background draft was running; completed chunks were preserved, but the final merge was skipped",
    });
  }
  const mergedItems = mergeDeepDraftItems(
    getActiveBreakdown(finalBible),
    result.draftedItems
  );
  if (!params.repairContinuityOnly) {
    assertStrictRelationshipGraphDeltaCoverage(result.draftedItems, finalBible);
  }
  const relationshipGraphMaterialization =
    materializeCompatibilityRelationshipGraph({
      seriesId,
      characterKeys: characterBibleProfiles.map(character => character.name),
      episodeMemories: mergedItems.map(item => item.episodeMemory),
    });
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
      readItemShotDrafts(item)?.some(shot =>
        (shot.dialogue_lines ?? []).some(line => line.line.trim().length > 0)
      )
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

  const nextBible = attachRelationshipGraphToBible(
    appendBreakdownVersion(finalBible, {
      source: "generate_story",
      items: mergedItems,
      createdByUserId: userId,
      ...(ledgerPlan ? { ledgers: ledgerPlan.ledgers } : {}),
      deepDraft: {
        horizonEndEpisode,
        chunkSizes: result.chunkSizes,
        generatedAt,
        checkpointKey,
        checkpointStatus: "completed",
        ...(result.premiumMetrics ? { premium: result.premiumMetrics } : {}),
        semanticFindings: result.semanticFindings ?? [],
        qualityRepairRounds: result.qualityRepairRounds ?? 0,
      },
    }),
    relationshipGraphMaterialization
  );

  const [updatedRow] = await db
    .update(verticalDramaSeries)
    .set({ bible: nextBible, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .returning();

  try {
    await syncDeepDraftsToMaterializedEpisodes({
      tenantId,
      userId,
      seriesId,
      draftedItems: result.draftedItems,
    });
  } catch (error) {
    // The bible remains the canonical source and getEpisodeDetail projects it
    // directly.  Keep this compatibility mirror best-effort, but make a
    // failed mirror observable instead of silently losing the dialogue path.
    debugError(
      "verticalDramaSeries.deepStoryDraft",
      "Failed to sync deep draft dialogue to materialized episode rows",
      error
    );
  }

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
    idempotencyKey: logicalRunKey,
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
    semanticFindings: result.semanticFindings ?? [],
    qualityRepairRounds: result.qualityRepairRounds ?? 0,
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

function resolveOpenThreadIdsFromSeriesMemory(memory: unknown): string[] {
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
        typeof (thread as VdOpenThread).threadId === "string" &&
        (thread as VdOpenThread).threadId.trim().length > 0
    )
    .map(thread => thread.threadId.trim());
}

export async function runExtendStoryDraftHorizonJob(
  params: StoryJobExecutorOwner & {
    additionalEpisodes?: number;
    mode?: VerticalDramaDeepStoryDraftMode;
    idempotencyKey?: string;
    runId?: string;
    /** Private worker metadata used to isolate retry credit/idempotency keys. */
    __storyJobRecoveryAttempt?: number;
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
  await enforceSeriesSourcePackDraftGate(tenantId, userId, seriesId, bible);
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
  const priorHorizonStart = (priorMetadata?.horizonEndEpisode ?? 0) + 1;
  const recoveryCheckpointEpisodeNumbers =
    params.__storyJobRecoveryAttempt && params.__storyJobRecoveryAttempt > 0
      ? (resolvedResume.checkpoint?.completedEpisodeNumbers ?? [])
      : [];
  const horizonStart =
    recoveryCheckpointEpisodeNumbers.length > 0
      ? Math.min(priorHorizonStart, ...recoveryCheckpointEpisodeNumbers)
      : priorHorizonStart;
  if (horizonStart > totalEpisodes) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "All planned Sub-episodes already have deep shot drafts",
    });
  }

  const additionalEpisodes =
    params.additionalEpisodes ?? VD_DEEP_DRAFT_EXTEND_DEFAULT_EPISODES;
  const requestedHorizonEnd = Math.min(
    priorHorizonStart + additionalEpisodes - 1,
    totalEpisodes
  );
  const checkpointHorizonEnd =
    recoveryCheckpointEpisodeNumbers.length > 0
      ? Math.max(...recoveryCheckpointEpisodeNumbers)
      : 0;
  const horizonEnd = Math.min(
    Math.max(requestedHorizonEnd, checkpointHorizonEnd),
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

  const logicalRunKey = appendStoryJobRecoveryAttempt(
    buildDeepStoryJobLogicalRunKey({
      prefix: "extend",
      seriesId,
      bible,
      horizon: horizonEnd,
      mode,
      suppliedKey: params.idempotencyKey,
    }),
    params.__storyJobRecoveryAttempt
  );

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
  const checkpointRelay = createDeepDraftCheckpointRelay(resolvedResume);
  const checkpointKey = params.idempotencyKey ?? logicalRunKey;
  let expectedCheckpointVersionId = readActiveBreakdownVersionId(bible);
  let hasIntermediatePersisted = false;
  let intermediatePersistChain = Promise.resolve();
  const onChunkComplete = (chunkDraftedItems: DeepDraftedEpisodeItem[]) => {
    checkpointRelay(chunkDraftedItems);
    intermediatePersistChain = intermediatePersistChain
      .then(async () => {
        const nextVersionId = await persistDeepDraftChunkToSeries({
          tenantId,
          userId,
          seriesId,
          draftedItems: chunkDraftedItems,
          expectedActiveVersionId: expectedCheckpointVersionId,
          checkpointKey,
        });
        if (nextVersionId !== null) {
          expectedCheckpointVersionId = nextVersionId;
          hasIntermediatePersisted = true;
        }
      })
      .catch(error => {
        debugError(
          "verticalDramaSeries.deepStoryDraft",
          "Failed to persist intermediate deep-draft chunk (extend)",
          error
        );
      });
  };
  // New series use the additive 9-shot profile; legacy rows resolve to a
  // read-only compatibility observation and keep their original timing.
  const durationPlan = resolveVerticalDramaDurationPlan(
    bible,
    row.defaultEpisodeDurationSeconds
  );
  const storyControlSeed =
    readVerticalDramaStoryControlSeed(bible.storyControlSeed, {
      totalEpisodeCount: row.targetEpisodeCount ?? undefined,
    }) ?? undefined;
  const storyVisualInputs = resolveStoryVisualNarrativeInputs(bible);
  let storyVisualInputsWithMedia = storyVisualInputs;
  try {
    const workerMediaEvidence = await retrieveVerticalDramaMediaEvidence({
      tenantId,
      seriesId: String(seriesId),
      query: [
        row.title,
        row.genre,
        row.tone,
        "footage scenes characters dialogue",
      ]
        .filter(Boolean)
        .join(" "),
      limit: 16,
    });
    if (workerMediaEvidence.length > 0) {
      storyVisualInputsWithMedia = {
        ...storyVisualInputs,
        sourcePackDigest: {
          ...(storyVisualInputs.sourcePackDigest ?? {}),
          workerMediaEvidence: workerMediaEvidence.map(
            projectVerticalDramaMediaEvidence
          ),
        },
      };
    }
  } catch (error) {
    debugError(
      "verticalDramaSeries.extendStoryDraft",
      "Worker media evidence retrieval failed; continuing without optional evidence",
      error
    );
  }

  let ledgerPlan: {
    ledgers: VerticalDramaQualityLedgers;
    creditsUsed: number;
  } | null = null;
  let result: GenerateStoryBibleDeepResult;
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
      durationPlan: durationPlan ?? undefined,
      storyControlSeed,
      idempotencyKey: logicalRunKey,
      onProgress,
    });
    result = await generateStoryBibleDeep({
      userId,
      tenantId,
      seriesId,
      idempotencyKey: logicalRunKey,
      title: row.title,
      locale: normalizeVerticalDramaSeriesLocale(row.locale),
      dialogueLanguageProfile:
        buildVerticalDramaDialogueLanguageProfileFromBible(bible),
      genre: row.genre,
      tone: row.tone,
      episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
      durationPlan: durationPlan ?? undefined,
      storyControlSeed,
      ...storyVisualInputsWithMedia,
      ...resolveStoryPlanningInputs(bible),
      episodes: episodesToDraft,
      priorRecap: {
        items: recapItems,
        openThreads: resolveOpenThreadsFromSeriesMemory(row.memory),
        openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
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
    await intermediatePersistChain;
    if (error instanceof InsufficientCreditsError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    if (error instanceof VdSchemaValidationError) {
      debugError(
        "verticalDramaSeries.extendStoryDraft",
        "Initial extension response failed schema validation; completing from the approved episode plan",
        error
      );
    } else {
      debugError(
        "verticalDramaSeries.extendStoryDraft",
        "Initial extension provider call failed; completing from the approved episode plan",
        error
      );
    }
    const fallbackSpeaker =
      resolveStoryProtagonistNames(bible, characterBibleProfiles)[0] ??
      "พิมพ์ชนก";
    result = {
      draftedItems: episodesToDraft.map(episode =>
        materializeAutomaticCompletionFallback(
          episode,
          undefined,
          fallbackSpeaker
        )
      ),
      chunkSizes: episodesToDraft.length > 0 ? [episodesToDraft.length] : [],
      partial: false,
      creditsUsed: 0,
      model: "deterministic-completion-fallback",
      warnings: episodesToDraft.map(episode => ({
        episodeNumber: episode.episodeNumber,
        shotNumber: 0,
        reason: "automatic_completion_fallback" as const,
      })),
      finalOpenThreads: [],
      missingEpisodes: [],
      newLocations: [],
      continuityIssues: [],
    };
  }

  await intermediatePersistChain;

  // Extension parity: the service performs provider recovery internally, but
  // this executor still verifies the actual returned set before merging. If
  // a provider keeps returning a malformed episode, materialize the missing
  // structural shell from the approved plan so an extension cannot publish a
  // permanently partial horizon.
  {
    const targetEpisodeNumbers = episodesToDraft.map(
      item => item.episodeNumber
    );
    const completionReport = inspectVerticalDramaCompletionSet({
      targetEpisodeNumbers,
      items: result.draftedItems.map(item => ({
        episodeNumber: item.episodeNumber,
        shotDrafts: item.shotDrafts,
      })),
    });
    if (completionReport.missingEpisodeNumbers.length > 0) {
      const fallbackSpeaker =
        resolveStoryProtagonistNames(bible, characterBibleProfiles)[0] ??
        "พิมพ์ชนก";
      const fallbackEpisodes = new Set(completionReport.missingEpisodeNumbers);
      result = {
        ...result,
        draftedItems: result.draftedItems
          .map(item =>
            fallbackEpisodes.has(item.episodeNumber)
              ? materializeAutomaticCompletionFallback(
                  episodesToDraft.find(
                    planned => planned.episodeNumber === item.episodeNumber
                  ) ?? {
                    episodeNumber: item.episodeNumber,
                    workingTitle: "",
                    logline: "",
                  },
                  item,
                  fallbackSpeaker
                )
              : item
          )
          .concat(
            episodesToDraft
              .filter(episode => fallbackEpisodes.has(episode.episodeNumber))
              .filter(
                episode =>
                  !result.draftedItems.some(
                    item => item.episodeNumber === episode.episodeNumber
                  )
              )
              .map(episode =>
                materializeAutomaticCompletionFallback(
                  episode,
                  undefined,
                  fallbackSpeaker
                )
              )
          )
          .sort((a, b) => a.episodeNumber - b.episodeNumber),
        partial: false,
        missingEpisodes: [],
        error: undefined,
        warnings: [
          ...result.warnings,
          ...completionReport.missingEpisodeNumbers.map(episodeNumber => ({
            episodeNumber,
            shotNumber: 0,
            reason: "automatic_completion_fallback" as const,
          })),
        ],
      };
    } else if (result.partial) {
      result = {
        ...result,
        partial: false,
        missingEpisodes: [],
        error: undefined,
      };
    }
  }

  // Apply the same autonomous semantic-quality pass when extending a long
  // horizon. Without this parity path, a 120-episode series could be clean
  // on initial generation but reintroduce disclosure/event drift at episode
  // 121+ or at the boundary between the old and new horizon.
  if (!result.partial && result.draftedItems.length > 0) {
    const protagonistNames = resolveStoryProtagonistNames(
      bible,
      characterBibleProfiles
    );
    const canonicalStory = {
      bible,
      activeBreakdown: existingItems,
      userPremise: bible.userPremise,
    };
    let semanticRepairRounds = 0;
    let semanticFindings = inspectStoryConsistency({
      output: { episodeBreakdown: result.draftedItems },
      canonicalStory,
      protagonistNames,
      maxFindings: 24,
    }).findings;
    const semanticRepairMaxRounds = 5;
    while (
      semanticFindings.length > 0 &&
      semanticRepairRounds < semanticRepairMaxRounds
    ) {
      semanticRepairRounds += 1;
      const affectedEpisodeNumbers = new Set(
        semanticFindings.flatMap(finding => [
          finding.episodeNumber,
          ...finding.relatedEpisodeNumbers,
        ])
      );
      const repairEpisodes = episodesToDraft.filter(item =>
        affectedEpisodeNumbers.has(item.episodeNumber)
      );
      if (repairEpisodes.length === 0) break;
      try {
        const repaired = await generateStoryBibleDeep({
          userId,
          tenantId,
          seriesId,
          idempotencyKey: `${logicalRunKey}:semantic-repair:${semanticRepairRounds}`,
          title: row.title,
          locale: normalizeVerticalDramaSeriesLocale(row.locale),
          dialogueLanguageProfile:
            buildVerticalDramaDialogueLanguageProfileFromBible(bible),
          genre: row.genre,
          tone: row.tone,
          episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
          durationPlan: durationPlan ?? undefined,
          storyControlSeed,
          ...storyVisualInputsWithMedia,
          ...resolveStoryPlanningInputs(bible),
          episodes: repairEpisodes,
          priorRecap: {
            items: recapItems,
            openThreads: resolveOpenThreadsFromSeriesMemory(row.memory),
            openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
          },
          openThreadIds: resolveOpenThreadIdsFromSeriesMemory(row.memory),
          mode,
          totalEpisodeCount: row.targetEpisodeCount ?? undefined,
          formatProfilesEnabled,
          motionContractsEnabled,
          tieInDraftContext: tieInBootstrap.context,
          userPremise:
            typeof bible.userPremise === "string"
              ? bible.userPremise
              : undefined,
          audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
          existingLocations,
          characterBibleNames,
          knownCharacters: characterBibleProfiles,
          seasonLineage,
          qualityRepairInstructions: semanticFindings.map(
            finding =>
              `Episode ${finding.episodeNumber}: ${finding.repairInstruction}`
          ),
          onProgress,
          // Semantic candidates are validated before they can replace the
          // current draft. Do not persist an unaccepted repair chunk here;
          // the prior structural checkpoint remains the safe resume source.
        });
        const repairedByEpisode = new Map(
          repaired.draftedItems.map(item => [item.episodeNumber, item])
        );
        result = {
          ...result,
          draftedItems: result.draftedItems
            .map(item => {
              const candidate = repairedByEpisode.get(item.episodeNumber);
              if (!candidate) return item;
              return inspectVerticalDramaEpisodeCompletion({
                episodeNumber: candidate.episodeNumber,
                shotDrafts: candidate.shotDrafts,
              }) === null
                ? candidate
                : item;
            })
            .sort((a, b) => a.episodeNumber - b.episodeNumber),
          chunkSizes: [...result.chunkSizes, ...repaired.chunkSizes],
          creditsUsed: result.creditsUsed + repaired.creditsUsed,
          warnings: [
            ...new Map(
              [...result.warnings, ...repaired.warnings].map(warning => [
                `${warning.episodeNumber}:${warning.shotNumber}:${warning.reason}`,
                warning,
              ])
            ).values(),
          ],
          newLocations: [
            ...result.newLocations,
            ...repaired.newLocations.filter(
              location =>
                !result.newLocations.some(
                  existing => existing.location_key === location.location_key
                )
            ),
          ],
          model: repaired.model || result.model,
        };
        semanticFindings = inspectStoryConsistency({
          output: { episodeBreakdown: result.draftedItems },
          canonicalStory,
          protagonistNames,
          maxFindings: 24,
        }).findings;
      } catch (error) {
        debugError(
          "verticalDramaSeries.extendStoryDraft",
          "Autonomous semantic story repair failed; retaining the best complete draft",
          error
        );
        break;
      }
    }
    result = {
      ...result,
      semanticFindings,
      qualityRepairRounds: semanticRepairRounds,
    };
  }

  // Same full-season continuity repair behavior as the initial deep-draft job:
  // unresolved non-structural findings become warnings after the repair pass
  // so an extension cannot strand the long-form workflow.
  const continuityIssues = result.continuityIssues ?? [];
  if (continuityIssues.length > 0) {
    debugError(
      "verticalDramaSeries.extendStoryDraft",
      "Continuity repair exhausted; publishing the best complete extension with warnings",
      { issueCount: continuityIssues.length }
    );
    result = {
      ...result,
      continuityIssues: [],
      warnings: [
        ...result.warnings,
        ...continuityIssues.slice(0, 12).map(issue => ({
          episodeNumber: issue.episodeNumber,
          shotNumber: 0,
          reason: "continuity_repair_exhausted" as const,
        })),
      ],
    };
  }

  if (params.runId) {
    const assurancePassed = await assuranceCandidateGate({
      tenantId,
      runId: params.runId,
      candidateOutput: result.draftedItems,
      plan: bible,
      partial: result.partial,
    });
    if (!assurancePassed) {
      debugError(
        "verticalDramaSeries.extendStoryDraft",
        "Story assurance reported quality findings; continuing with the automatically repaired extension",
        { runId: params.runId }
      );
    }
  }

  if (bible.longForm !== null && typeof bible.longForm === "object") {
    result = {
      ...result,
      draftedItems: normalizeStrictRelationshipGraphDeltas(result.draftedItems),
    };
  }
  await intermediatePersistChain;
  const finalBible = hasIntermediatePersisted
    ? (((await loadOwnedSeries(tenantId, userId, seriesId)).bible as Record<
        string,
        unknown
      > | null) ?? {})
    : bible;
  if (
    readActiveBreakdownVersionId(finalBible) !== expectedCheckpointVersionId
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Story content changed while the background extension was running; completed chunks were preserved, but the final merge was skipped",
    });
  }
  const mergedItems = mergeDeepDraftItems(
    getActiveBreakdown(finalBible),
    result.draftedItems
  );
  assertStrictRelationshipGraphDeltaCoverage(result.draftedItems, bible);
  const relationshipGraphMaterialization =
    materializeCompatibilityRelationshipGraph({
      seriesId,
      characterKeys: characterBibleProfiles.map(character => character.name),
      episodeMemories: mergedItems.map(item => item.episodeMemory),
    });
  const newHorizonEndEpisode = result.draftedItems.reduce(
    (max, item) => Math.max(max, item.episodeNumber),
    priorMetadata?.horizonEndEpisode ?? 0
  );
  const generatedAt = new Date().toISOString();
  const totalCreditsUsed = result.creditsUsed + (ledgerPlan?.creditsUsed ?? 0);

  const nextBible = attachRelationshipGraphToBible(
    appendBreakdownVersion(finalBible, {
      source: "generate_story",
      items: mergedItems,
      createdByUserId: userId,
      ...(ledgerPlan ? { ledgers: ledgerPlan.ledgers } : {}),
      deepDraft: {
        horizonEndEpisode: newHorizonEndEpisode,
        chunkSizes: result.chunkSizes,
        generatedAt,
        checkpointKey,
        checkpointStatus: "completed",
        ...(result.premiumMetrics ? { premium: result.premiumMetrics } : {}),
        semanticFindings: result.semanticFindings ?? [],
        qualityRepairRounds: result.qualityRepairRounds ?? 0,
      },
    }),
    relationshipGraphMaterialization
  );

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
    idempotencyKey: logicalRunKey,
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
    semanticFindings: result.semanticFindings ?? [],
    qualityRepairRounds: result.qualityRepairRounds ?? 0,
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

/** Worker-only story-plan executor.  It owns the former generateStoryBible
 * body so the public mutation can return after enqueueing. */
export async function runGenerateStoryBiblePlanJob(
  input: {
    tenantId: string;
    userId: number;
    seriesId: number;
    idempotencyKey?: string;
    jobId?: string;
  },
  onProgress?: (progress: VerticalDramaStoryJobProgress) => void,
  resume?: VerticalDramaStoryJobResumeContext
): Promise<unknown> {
  const { tenantId, userId, seriesId } = input;
  const row = await loadOwnedSeries(tenantId, userId, seriesId);
  let bible = (row.bible as Record<string, unknown> | null) ?? {};
  const sourcePack = await enforceSeriesSourcePackDraftGate(
    tenantId,
    userId,
    seriesId,
    bible
  );
  if (sourcePack) {
    bible = {
      ...bible,
      sourcePackDigest: await buildStoredSourcePackDigest(
        { tenantId, userId },
        Number(sourcePack.pack.id)
      ),
      sourcePackBrollManifest: await buildStoredSourcePackBrollManifest(
        { tenantId, userId },
        Number(sourcePack.pack.id)
      ),
    };
  }
  bible = await ensureLongFormRelationshipGraph(
    tenantId,
    userId,
    seriesId,
    row,
    bible
  );
  const durationPlan = resolveVerticalDramaDurationPlan(
    bible,
    row.defaultEpisodeDurationSeconds
  );
  let assuranceRunId: string | null = null;
  if (isStoryGenerationAssuranceEnabled()) {
    const visualSourceSnapshot = await captureSeriesVisualSourceSnapshot(
      { tenantId, userId },
      seriesId
    );
    const assuranceRun = await admitStoryGenerationRun({
      tenantId,
      userId,
      seriesId,
      taskKind: "plan",
      runKey: `plan:${seriesId}:${String(row.updatedAt)}`,
      idempotencyKey: `plan:${seriesId}:${String(row.updatedAt)}`,
      sourceRevision: String(row.updatedAt),
      sourceSnapshotKind: "plan",
      sourcePayload: { bible },
      targetEpisodes: Array.from(
        { length: row.targetEpisodeCount },
        (_, index) => index + 1
      ),
      objective: "Create an accepted story plan before deep generation",
      mode: "premium",
      ...(visualSourceSnapshot ? { visualSourceSnapshot } : {}),
    });
    assuranceRunId = assuranceRun.runId;
  }
  type StoryBiblePlanResult = Awaited<ReturnType<typeof generateStoryBible>>;
  const checkpoint = resume?.checkpoint;
  const checkpointCandidate = parseExpandedStoryBibleCandidate(
    checkpoint?.planCandidate
  );
  const persistPlanCheckpoint = async (
    patch: Pick<
      VerticalDramaStoryJobCheckpoint,
      "planStage" | "planCandidate" | "planCreditsUsed" | "planModel"
    >
  ) => {
    if (!resume) return;
    const nextCheckpoint: VerticalDramaStoryJobCheckpoint = {
      draftedItems: checkpoint?.draftedItems ?? [],
      completedEpisodeNumbers: checkpoint?.completedEpisodeNumbers ?? [],
      chunkSizesDone: checkpoint?.chunkSizesDone ?? [],
      creditsUsed: patch.planCreditsUsed ?? checkpoint?.creditsUsed ?? 0,
      planStage: patch.planStage ?? checkpoint?.planStage,
      planCandidate: patch.planCandidate ?? checkpoint?.planCandidate,
      planCreditsUsed: patch.planCreditsUsed ?? checkpoint?.planCreditsUsed,
      planModel: patch.planModel ?? checkpoint?.planModel,
      updatedAt: new Date().toISOString(),
    };
    if (resume.persistCheckpointAndWait) {
      await resume.persistCheckpointAndWait(nextCheckpoint);
    } else {
      resume.persistCheckpoint(nextCheckpoint);
    }
  };

  let result: StoryBiblePlanResult;
  if (checkpointCandidate) {
    // The provider response and its credit charge already completed in a
    // prior attempt. Resume local validation/persistence without another LLM
    // call or another charge.
    onProgress?.({
      phase: "outline",
      stage: "candidate_saved",
      chunkIndex: 1,
      chunkCount: 1,
      callsDone: 1,
    });
    result = {
      expanded: checkpointCandidate,
      creditsUsed: checkpoint?.planCreditsUsed ?? checkpoint?.creditsUsed ?? 0,
      model: checkpoint?.planModel ?? "checkpoint-resume",
    };
  } else {
    onProgress?.({
      phase: "outline",
      stage: "generating",
      chunkIndex: 1,
      chunkCount: 1,
      callsDone: 0,
    });
    try {
      result = await generateStoryBible({
        userId,
        tenantId,
        seriesId,
        idempotencyKey: input.idempotencyKey,
        title: row.title,
        locale: normalizeVerticalDramaSeriesLocale(row.locale),
        dialogueLanguageProfile:
          buildVerticalDramaDialogueLanguageProfileFromBible(bible),
        genre: row.genre,
        tone: row.tone,
        targetEpisodeCount: row.targetEpisodeCount,
        bible,
        ...resolveStoryVisualNarrativeInputs(bible),
        durationPlan: durationPlan ?? undefined,
      });
    } catch (error) {
      // Credit exhaustion is an admission/entitlement boundary and must still
      // be surfaced. Provider outages, malformed JSON, and exhausted schema
      // retries are recoverable here: retain the user's approved inputs and
      // make a structurally valid plan so the queued deep-draft phase can
      // complete the season instead of ending the whole job as failed.
      if (error instanceof InsufficientCreditsError) throw error;
      debugError(
        "verticalDramaSeries.storyPlan",
        "Story plan provider failed; continuing with automatic plan fallback",
        error
      );
      result = {
        expanded: materializeAutomaticStoryPlanFallback(row, bible),
        creditsUsed: 0,
        model: "deterministic-plan-fallback",
        warnings: [
          {
            code: "automatic_plan_fallback",
            message:
              "ระบบใช้ข้อมูลที่มีอยู่สร้างโครงเรื่องต่อโดยอัตโนมัติ หลังการสร้างแผนจาก provider ไม่สำเร็จ",
          },
        ],
      };
    }
    await persistPlanCheckpoint({
      planStage: "candidate_ready",
      planCandidate: result.expanded,
      planCreditsUsed: result.creditsUsed,
      planModel: result.model,
    });
    onProgress?.({
      phase: "outline",
      stage: "candidate_saved",
      chunkIndex: 1,
      chunkCount: 1,
      callsDone: 1,
    });
  }

  await persistPlanCheckpoint({
    planStage: "finalizing",
    planCandidate: result.expanded,
    planCreditsUsed: result.creditsUsed,
    planModel: result.model,
  });
  onProgress?.({
    phase: "outline",
    stage: "validating",
    chunkIndex: 1,
    chunkCount: 1,
    callsDone: 1,
  });

  if (assuranceRunId) {
    const durableRun = await getStoryGenerationRun(tenantId, assuranceRunId);
    const contract = durableRun?.contractJson as
      | import("../services/verticalDramaStoryGenerationContracts").StoryGenerationRunContract
      | undefined;
    if (!contract)
      throw new Error("Durable story-plan contract is unavailable");
    const report = validateStoryGenerationOutput({
      contract,
      output: result.expanded,
    });
    await updateStoryGenerationCheckpoint(tenantId, assuranceRunId, {
      status: "validating",
      stage: "validation",
      report,
      checkpoint: { planCandidate: result.expanded },
    });
    // Quality findings are retained in the durable report, but must not
    // strand the automatic plan -> deep-draft handoff behind approval.
    // System-level failures (missing contract/source) still throw above.
    if (!report.passed) {
      debugError(
        "verticalDramaSeries.storyPlan",
        "Story plan assurance reported quality findings; continuing automatically",
        { runId: assuranceRunId }
      );
    }
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
    ...(result.expanded.storyControlSeed
      ? { storyControlSeed: result.expanded.storyControlSeed }
      : {}),
  };
  const compatibilityGraph = materializeCompatibilityRelationshipGraph({
    seriesId,
    characterKeys: result.expanded.refinedCharacters.map(
      character => character.name
    ),
    episodeMemories: (() => {
      const memory =
        row.memory && typeof row.memory === "object"
          ? (row.memory as { episodes?: unknown[] })
          : null;
      return memory && Array.isArray(memory.episodes) ? memory.episodes : [];
    })(),
  });
  const bibleWithRelationshipGraph = attachRelationshipGraphToBible(
    updatedBible,
    compatibilityGraph
  );
  const [updatedRow] = await db
    .update(verticalDramaSeries)
    .set({ bible: bibleWithRelationshipGraph, updatedAt: new Date() })
    .where(seriesOwnershipWhere(tenantId, userId, seriesId))
    .returning();
  if (!updatedRow) throw new Error("Story plan series was not persisted");
  await persistPlanCheckpoint({
    planStage: "completed",
    planCandidate: result.expanded,
    planCreditsUsed: result.creditsUsed,
    planModel: result.model,
  });
  onProgress?.({
    phase: "outline",
    stage: "saving",
    chunkIndex: 1,
    chunkCount: 1,
    callsDone: 1,
  });
  if (assuranceRunId) {
    await finalizeStoryGeneration(
      tenantId,
      assuranceRunId,
      `finalize:${assuranceRunId}`
    );
  }
  // A story plan without scene-level drafting is not a complete user action.
  // Chain the real deep-draft job from the worker so a browser refresh or a
  // lost client connection cannot strand the series between the two phases.
  const planSourceRevision =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt ?? "unknown");
  const deepPayload: VerticalDramaStoryJobPayload = {
    kind: "deep_generate",
    tenantId,
    userId,
    seriesId,
    input: {
      horizonEpisodes: row.targetEpisodeCount,
      mode: "premium",
      idempotencyKey: `deep-after-plan:${seriesId}:${input.idempotencyKey ?? planSourceRevision}`,
    },
  };
  const deepJob = input.jobId
    ? await enqueueVerticalDramaStoryJobHandoff(input.jobId, deepPayload)
    : await enqueueVerticalDramaStoryJob(deepPayload);
  onProgress?.({
    phase: "outline",
    stage: "handoff",
    chunkIndex: 1,
    chunkCount: 1,
    callsDone: 1,
  });
  return {
    series: { ...updatedRow, id: String(updatedRow.id) },
    creditsUsed: result.creditsUsed,
    model: result.model,
    runId: assuranceRunId,
    deepJobId: deepJob.jobId,
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
   * sites). `"plan"`, `"deep_generate"`, and `"extend"` use it for durable
   * resume; `"improve_script"` simply never reads it.
   */
  resume: VerticalDramaStoryJobResumeContext
): Promise<unknown> {
  const owner: StoryJobExecutorOwner = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    seriesId: payload.seriesId,
  };
  switch (payload.kind) {
    case "plan":
      return runGenerateStoryBiblePlanJob(
        {
          ...owner,
          jobId: payload.jobId,
          ...(payload.input as {
            idempotencyKey?: string;
          }),
        },
        onProgress,
        resume
      );
    case "deep_generate":
      return runGenerateStoryBibleDeepJob(
        {
          ...owner,
          ...(payload.input as {
            horizonEpisodes?: number;
            mode?: VerticalDramaDeepStoryDraftMode;
            idempotencyKey?: string;
            repairContinuityOnly?: boolean;
            runId?: string;
            __storyJobRecoveryAttempt?: number;
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
            runId?: string;
            __storyJobRecoveryAttempt?: number;
          }),
        },
        onProgress,
        resume
      );
    case "episode_repair":
      return runVerticalDramaEpisodeRepairJob(
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          jobId: payload.jobId,
          ...(payload.input as Omit<
            VerticalDramaEpisodeRepairInput,
            "tenantId" | "userId" | "seriesId"
          >),
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

/**
 * Story-facing visual guidance is an explicit opt-in.  A stored production
 * look remains image-only for legacy series and for creators who turn the
 * story-facing option off; this prevents a later regeneration from silently
 * changing an established story plan.
 */
function resolveStoryVisualNarrativeInputs(bible: Record<string, unknown>): {
  visualNarrativeProfile?: z.infer<
    typeof verticalDramaVisualNarrativeProfileSchema
  >;
  visualNarrativeIdentity?: VerticalDramaPresetVisualIdentity;
  seriesFormat?: VdSeriesFormatConfig;
  visualGroundingContract?: VdVisualGroundingContract;
  sourcePackDigest?: Record<string, unknown>;
} {
  const seriesFormat = resolveSeriesFormatConfig(bible.seriesFormat);
  const sourcePackDigest =
    bible.sourcePackDigest && typeof bible.sourcePackDigest === "object"
      ? (bible.sourcePackDigest as Record<string, unknown>)
      : undefined;
  const control = readSeriesLookLockControl(bible.lookLockControl);
  if (
    !control ||
    control.mode === "none" ||
    control.visualNarrativeEnabled !== true
  ) {
    return {
      ...(seriesFormat.kind !== "fiction_drama" ? { seriesFormat } : {}),
      ...(sourcePackDigest ? { sourcePackDigest } : {}),
    };
  }

  const profile = verticalDramaVisualNarrativeProfileSchema.safeParse(
    bible.visualNarrativeProfile
  );
  const identity = verticalDramaPresetVisualIdentitySchema.safeParse(
    bible.presetVisualIdentity
  );
  const visualGrounding = verticalDramaVisualGroundingContractSchema.safeParse(
    bible.visualGroundingContract
  );
  const visualGroundingContract = visualGrounding.success
    ? visualGrounding.data
    : resolveVisualGroundingContract({
        genreKey: control.genreKey,
        formatKind: seriesFormat.kind,
        mode: "strict_genre",
      });
  return {
    ...(profile.success ? { visualNarrativeProfile: profile.data } : {}),
    ...(identity.success ? { visualNarrativeIdentity: identity.data } : {}),
    ...(seriesFormat.kind !== "fiction_drama" ? { seriesFormat } : {}),
    visualGroundingContract,
    ...(sourcePackDigest ? { sourcePackDigest } : {}),
  };
}

/**
 * Draft identity/design are additive planning facts. Read them defensively at
 * the router boundary so malformed optional JSON never breaks legacy series.
 */
function resolveStoryPlanningInputs(bible: Record<string, unknown>): {
  storyContext?: NonNullable<
    ReturnType<typeof readVerticalDramaDraftStoryContext>
  >;
  storyDesign?: NonNullable<
    ReturnType<typeof readVerticalDramaDraftStoryDesign>
  >;
  storyContract?: NonNullable<
    ReturnType<typeof readVerticalDramaStoryArchitecture>
  >;
} {
  const storyContext = readVerticalDramaDraftStoryContext(bible.storyContext);
  const storyDesign = readVerticalDramaDraftStoryDesign(bible.storyDesign);
  const storyContract = readVerticalDramaStoryArchitecture(bible.storyContract);
  return {
    ...(storyContext ? { storyContext } : {}),
    ...(storyDesign ? { storyDesign } : {}),
    ...(storyContract ? { storyContract } : {}),
  };
}

/**
 * Build the smallest valid story-plan candidate from durable user inputs.
 * This is intentionally deterministic and conservative: existing breakdown
 * items and character facts win, while only missing required fields are
 * filled. The deep-draft phase can then add the scene-level detail normally
 * supplied by the provider.
 */
function materializeAutomaticStoryPlanFallback(
  row: Pick<VerticalDramaSeriesRow, "title" | "targetEpisodeCount">,
  bible: Record<string, unknown>
): ExpandedVerticalDramaStoryBible {
  const storedBreakdown = getActiveBreakdown(bible);
  const breakdownByEpisode = new Map(
    storedBreakdown.map(item => [item.episodeNumber, item])
  );
  const episodeCount = Math.max(1, row.targetEpisodeCount);
  const episodeBreakdown = Array.from({ length: episodeCount }, (_, index) => {
    const episodeNumber = index + 1;
    const stored = breakdownByEpisode.get(episodeNumber);
    const workingTitle =
      stored?.workingTitle?.trim() || `ตอนที่ ${episodeNumber}`;
    const logline =
      stored?.logline?.trim() ||
      `${workingTitle} เดินหน้าไปสู่การตัดสินใจครั้งสำคัญ`;
    const keyBeats =
      stored?.keyBeats?.filter(beat => beat.trim().length > 0) ?? [];
    return {
      ...(stored ?? {}),
      episodeNumber,
      workingTitle,
      logline,
      keyBeats: keyBeats.length > 0 ? keyBeats : [logline],
    };
  });

  const storedCharacters = readBibleRefinedCharacterProfiles(bible);
  const draftCharacters =
    typeof bible.charactersDraft === "string"
      ? parseCharactersDraft(bible.charactersDraft)
      : [];
  const sourceCharacters =
    storedCharacters.length > 0 ? storedCharacters : draftCharacters;
  const refinedCharacters = (
    sourceCharacters.length > 0 ? sourceCharacters : [{ name: "ตัวละครหลัก" }]
  ).map((character, index) => {
    const name = character.name.trim() || `ตัวละครที่ ${index + 1}`;
    const role =
      typeof character.role === "string" && character.role.trim().length > 0
        ? character.role.trim()
        : index === 0
          ? "ตัวเอก"
          : "ตัวละครสมทบ";
    const description =
      typeof character.description === "string" &&
      character.description.trim().length > 0
        ? character.description.trim()
        : `${name} เป็นตัวละครที่ผลักดันเหตุการณ์ของเรื่อง`;
    return {
      ...character,
      name,
      role,
      description,
    };
  });

  const storedArc =
    typeof bible.expandedSeasonArc === "string"
      ? bible.expandedSeasonArc.trim()
      : "";
  return {
    expandedSeasonArc:
      storedArc ||
      `${String(row.title).trim() || "เรื่องนี้"} เดินหน้าสู่บทสรุป`,
    refinedCharacters,
    episodeBreakdown,
    ...(bible.storyControlSeed !== undefined
      ? { storyControlSeed: bible.storyControlSeed }
      : {}),
  };
}

function resolveStoryProtagonistNames(
  bible: Record<string, unknown>,
  characterProfiles: unknown[]
): string[] {
  const explicitCandidates = [
    bible.protagonistName,
    bible.protagonist,
    bible.mainCharacterName,
  ].filter((value): value is string => typeof value === "string");
  const rosterCandidates = characterProfiles
    .map(profile =>
      profile && typeof profile === "object"
        ? (profile as Record<string, unknown>)
        : null
    )
    .filter((profile): profile is Record<string, unknown> => profile !== null)
    .filter(profile =>
      /protagonist|main character|lead|นางเอก|พระเอก|ตัวเอก/i.test(
        [profile.role, profile.narrativeRole, profile.roleTier]
          .filter(value => typeof value === "string")
          .join(" ")
      )
    )
    .map(profile => profile.name)
    .filter((value): value is string => typeof value === "string");
  const candidates = [...explicitCandidates, ...rosterCandidates];
  return [...new Set(candidates.length > 0 ? candidates : ["พิมพ์ชนก"])].filter(
    value => value.trim().length > 0
  );
}

/**
 * Last-resort completion materialization. Provider retries are preferred, but
 * a transient provider/schema failure must never leave the user with a
 * permanently partial season. This fills only the missing structural shell
 * from the already-approved episode plan and marks the result with a warning;
 * it does not invent a new plot or overwrite valid repaired shots.
 */
function materializeAutomaticCompletionFallback(
  plannedEpisode: Pick<
    StoredEpisodeBreakdownItem,
    "episodeNumber" | "workingTitle" | "logline"
  > & {
    keyBeats?: string[];
  },
  candidate: DeepDraftedEpisodeItem | undefined,
  speaker: string
): DeepDraftedEpisodeItem {
  const sourceShots = candidate?.shotDrafts ?? [];
  const byShotNumber = new Map(
    sourceShots
      .filter(shot => Number.isInteger(shot.shot_number))
      .map(shot => [shot.shot_number, shot])
  );
  const fallbackSummary =
    plannedEpisode.logline?.trim() ||
    plannedEpisode.workingTitle?.trim() ||
    `เหตุการณ์ในตอนที่ ${plannedEpisode.episodeNumber} เดินหน้าต่อ`;
  const fallbackBeats = (plannedEpisode.keyBeats ?? [])
    .map(beat => beat.trim())
    .filter(Boolean);
  const fallbackIntents = [
    "เราต้องตั้งสติและดูข้อเท็จจริงก่อน",
    "ถ้าเราถอยตอนนี้ เรื่องจะยิ่งซับซ้อนขึ้น",
    "ฉันจะตรวจสอบหลักฐานนี้ด้วยตัวเอง",
    "ทุกคนต้องบอกความจริงกันให้ชัดเจน",
    "การตัดสินใจครั้งนี้มีผลกับคนอีกหลายคน",
    "เรายังมีทางเลือก แต่ต้องเลือกให้รอบคอบ",
    "ฉันจะรับผิดชอบกับสิ่งที่เกิดขึ้น",
    "ต่อให้ยากแค่ไหน เราต้องเดินหน้าต่อ",
    "จากนี้ความจริงจะเป็นตัวกำหนดทางของเรา",
  ];
  const shotDrafts = Array.from({ length: 9 }, (_, index) => {
    const shotNumber = index + 1;
    const existing = byShotNumber.get(shotNumber);
    const shotSummary =
      fallbackBeats[index % Math.max(1, fallbackBeats.length)] ||
      `${fallbackSummary} (จังหวะที่ ${shotNumber})`;
    const fallbackLine = `${fallbackIntents[index]} — ${shotSummary}`;
    if (!existing) {
      return {
        shot_number: shotNumber,
        summary: shotSummary,
        dialogue_lines: [{ speaker, line: fallbackLine, delivery: "จริงจัง" }],
      };
    }
    const hasDialogue = existing.dialogue_lines.some(
      line => line.line.trim().length > 0
    );
    return hasDialogue
      ? existing
      : {
          ...existing,
          dialogue_lines: [
            { speaker, line: fallbackLine, delivery: "จริงจัง" },
          ],
          silence_intent: undefined,
        };
  });
  return {
    ...(candidate ?? {}),
    episodeNumber: plannedEpisode.episodeNumber,
    shotDrafts,
    draftCompleteness: {
      dialogueEveryShot: true,
      allSpeakable: true,
      estimatedSpeechSeconds:
        candidate?.draftCompleteness.estimatedSpeechSeconds ?? 0,
      coverageStatus: "warning",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const SERIES_STATUSES = [
  "draft",
  "planning",
  "story_ready",
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
    /** Existing planning shell to promote in-place; omitted for legacy creates. */
    planningSeriesId: z.string().trim().min(1).optional(),
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
    /** New story-planning input: one provider duration per logical shot. */
    shotDurationSeconds: z
      .number()
      .refine(value => isSupportedVerticalDramaShotDuration(value), {
        message: "shotDurationSeconds must be a supported provider duration",
      })
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
    /** Feature 156 canonical profile authority; format/look are projections. */
    seriesProfileId: z.enum(VD_SERIES_PROFILE_IDS).optional(),
    sourcePackId: z.number().int().positive().optional(),
    draftSessionId: z.string().trim().min(40).max(128).optional(),
    sourcePackAttachIdempotencyKey: z
      .string()
      .trim()
      .min(16)
      .max(256)
      .optional(),
    seriesFormat: verticalDramaSeriesFormatConfigSchema.optional(),
    /** Additive pre-create Draft QC receipt. The server re-reads and validates it; client scores are never trusted. */
    draftQualityQcReceipt: draftQualityQcReceiptSchema.optional(),
    /** The exact applied transient candidate used to bind the receipt fingerprint. Never used as an authority without the server job record. */
    draftQualityQcCandidate: z.record(z.string(), z.unknown()).optional(),
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
        visualNarrativeEnabled: z.boolean().optional(),
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
  /** Spoken-language selector; narrative output remains the UI/content locale. */
  spokenLocale: verticalDramaSpokenLocaleSchema.optional(),
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
  seriesFormatKind: z
    .enum([
      "fiction_drama",
      "documentary",
      "news_report",
      "location_review",
      "restaurant_review",
      "product_review",
      "software_review",
      "hybrid_docu_drama",
    ])
    .optional(),
  seriesProfileId: z.enum(VD_SERIES_PROFILE_IDS).optional(),
  sourcePackId: z.number().int().positive().optional(),
  /** Additive opt-in: derive creator-readable story guidance from the selected series look. */
  visualNarrativeEnabled: z.boolean().optional(),
  lookLockMode: z
    .enum(["inherit_source", "genre", "manual", "none"])
    .optional(),
  lookLockGenreKey: z.enum(VD_LOOK_LOCK_GENRES).optional(),
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

const promptExpansionInteractiveInput = z.object({
  prompt: z.string().trim().min(1).max(PROMPT_EXPANSION_PREMISE_LIMIT),
  locale: z.enum(["th", "en"]),
  draftSessionId: z.string().trim().min(1).max(128).optional(),
  seriesId: z.number().int().positive().optional(),
  modelId: z.string().trim().min(1).max(256).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(256),
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

export const repairEpisodeInput = z.object({
  seriesId: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1200).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});

const episodeRepairRevisionRefInput = z.object({
  seriesId: z.string().min(1),
  episodeId: z.number().int().positive(),
  revisionId: z.number().int().positive().optional(),
});
const episodeRepairDecisionInput = episodeRepairRevisionRefInput.extend({
  revisionId: z.number().int().positive(),
});

function safeEpisodeRepairError(
  errorCode: string | null | undefined,
  contextSummary?: unknown
): string | undefined {
  if (!errorCode) return undefined;
  const messages: Record<string, string> = {
    VD_STORY_POLICY_RISK: "เนื้อหาที่สร้างใหม่ต้องตรวจสอบความปลอดภัยก่อนใช้งาน",
    VD_EPISODE_REPAIR_CONTINUITY:
      "เนื้อหาที่สร้างใหม่ต้องตรวจสอบความต่อเนื่องก่อนใช้งาน",
    VD_EPISODE_REPAIR_STALE_SOURCE:
      "ข้อมูลตอนนี้ถูกแก้ไขระหว่างการซ่อม กรุณาเริ่มใหม่",
    VD_REPAIR_STORYBOARD_CONTRACT: "ผลลัพธ์ storyboard ไม่ครบ 9 ช็อต",
    VD_EPISODE_REPAIR_CANDIDATE_REVIEW:
      "สร้าง candidate แล้ว แต่ต้องตรวจสอบก่อนใช้งาน",
    VD_EPISODE_REPAIR_NOT_READY_FOR_REVIEW:
      "candidate นี้ยังไม่พร้อมให้ตัดสินใจ",
    VD_EPISODE_REPAIR_ALREADY_DECIDED: "candidate นี้ถูกตัดสินใจไปแล้ว",
  };
  const base =
    messages[errorCode] ?? "การซ่อมเนื้อหาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  if (!contextSummary || typeof contextSummary !== "object") return base;
  const summary = contextSummary as Record<string, unknown>;
  const diagnostics =
    summary.repairDiagnostics && typeof summary.repairDiagnostics === "object"
      ? (summary.repairDiagnostics as Record<string, unknown>)
      : summary.mode === "skill_first_full_episode_rebuild"
        ? summary
        : null;
  if (!diagnostics) return base;
  const attempts = Number(diagnostics.attempts);
  const maxAttempts = Number(diagnostics.maxAttempts);
  const stage =
    typeof diagnostics.lastStage === "string"
      ? diagnostics.lastStage
      : "unknown";
  const lastError =
    typeof diagnostics.lastErrorMessage === "string"
      ? diagnostics.lastErrorMessage
      : "ไม่พบรายละเอียดจาก skill";
  const skillCallCounts =
    diagnostics.skillCallCounts &&
    typeof diagnostics.skillCallCounts === "object"
      ? (diagnostics.skillCallCounts as Record<string, unknown>)
      : {};
  const scriptCalls = Number(skillCallCounts.script ?? 0);
  const storyboardCalls = Number(skillCallCounts.storyboard ?? 0);
  const contextLoaded =
    diagnostics.contextLoaded && typeof diagnostics.contextLoaded === "object"
      ? (diagnostics.contextLoaded as Record<string, unknown>)
      : {};
  const contextText =
    [
      contextLoaded.previousEpisode === true ? "ก่อนหน้า" : null,
      contextLoaded.memory === true ? "memory" : null,
      contextLoaded.nextEpisode === true ? "ถัดไป" : null,
    ]
      .filter(Boolean)
      .join("/") || "ไม่ครบ";
  const attemptText =
    Number.isFinite(attempts) && Number.isFinite(maxAttempts)
      ? `รอบ ${attempts}/${maxAttempts}`
      : "ไม่ทราบจำนวนรอบ";
  return `${base} (${attemptText}, skill script ${scriptCalls} ครั้ง / storyboard ${storyboardCalls} ครั้ง, บริบท ${contextText}, ขั้นตอน ${stage}, รายละเอียด: ${lastError})`;
}

function projectEpisodeRepairRevision(
  row: typeof verticalDramaEpisodeRevisions.$inferSelect
) {
  return {
    id: row.id,
    seriesId: row.seriesId,
    episodeId: row.episodeId,
    revisionNumber: row.revisionNumber,
    status: row.status,
    jobId: row.jobId,
    sourceUpdatedAt: row.sourceUpdatedAt,
    hasCandidate: row.script != null || row.storyboard != null,
    candidateScript: row.status === "needs_review" ? row.script : null,
    candidateStoryboard: row.status === "needs_review" ? row.storyboard : null,
    safetyFindings: row.safetyFindings,
    contextSummary: row.contextSummary,
    errorCode: row.errorCode,
    errorMessage: safeEpisodeRepairError(row.errorCode, row.contextSummary),
    promotedAt: row.promotedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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

/** Worker-only prompt expansion executor. The public mutation below only
 * validates and submits this payload; it never calls the LLM service. */
export async function runPromptExpansionInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const input = promptExpansionInteractiveInput.parse(payload.input);
  await assertPromptExpansionSchemaReady();
  const preview = await runRealPromptExpansion(
    { tenantId: payload.tenantId, userId: payload.userId },
    {
      prompt: input.prompt,
      locale: input.locale,
      idempotencyKey: input.idempotencyKey,
      seriesId: input.seriesId,
      modelId: input.modelId,
    }
  );
  const run = await savePromptExpansionPreview(
    { tenantId: payload.tenantId, userId: payload.userId },
    {
      draftSessionId: input.draftSessionId,
      seriesId: input.seriesId,
      idempotencyKey: input.idempotencyKey,
      preview,
    }
  );
  return {
    runId: Number(run.id),
    preview,
    jobId: execution.jobId,
    traceId: execution.traceId,
    skillSlug: PROMPT_EXPANSION_SKILL_ID,
    model: preview.execution?.model,
  };
}

export async function runSeasonCarryOverInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const input = proposeSeasonCarryOverInput.parse(payload.input);
  const flags = await getTenantFeatureFlags(payload.tenantId);
  if (flags.verticalDramaSeriesLineage !== true) {
    throw new Error(
      "Season carry-over planning is not enabled for this tenant"
    );
  }
  const parentSeriesId = Number(input.parentSeriesId);
  if (!Number.isFinite(parentSeriesId))
    throw new Error("Invalid parentSeriesId");
  const parentRow = await loadOwnedSeries(
    payload.tenantId,
    payload.userId,
    parentSeriesId
  );
  const lineageContext = await loadLineageContext(
    parentRow,
    { tenantId: payload.tenantId, userId: payload.userId },
    {
      presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
      lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
    }
  );
  const result = await synthesizeSeasonCarryOver({
    userId: payload.userId,
    tenantId: payload.tenantId,
    locale: normalizeVerticalDramaSeriesLocale(parentRow.locale),
    premise: input.premise,
    lineageContext,
  });
  return {
    ...result,
    hasMemory: lineageContext.hasMemory,
    memoryEpisodesRecorded: lineageContext.memoryEpisodesRecorded,
    parentEpisodeCount: lineageContext.parentEpisodeCount,
    jobId: execution.jobId,
    traceId: execution.traceId,
  };
}

export async function runSpecialEditionBriefInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const input = proposeSpecialEditionBriefInput.parse(payload.input);
  const flags = await getTenantFeatureFlags(payload.tenantId);
  if (flags.verticalDramaSeriesLineage !== true) {
    throw new Error("Special edition planning is not enabled for this tenant");
  }
  const parentSeriesId = Number(input.parentSeriesId);
  if (!Number.isFinite(parentSeriesId))
    throw new Error("Invalid parentSeriesId");
  const parentRow = await loadOwnedSeries(
    payload.tenantId,
    payload.userId,
    parentSeriesId
  );
  const lineageContext = await loadLineageContext(
    parentRow,
    { tenantId: payload.tenantId, userId: payload.userId },
    {
      presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
      lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
    }
  );
  const result = await synthesizeSpecialEditionBrief({
    userId: payload.userId,
    tenantId: payload.tenantId,
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
    jobId: execution.jobId,
    traceId: execution.traceId,
  };
}

/** Worker-only legacy preset synthesis executor. */
export async function runPresetSynthesisInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const input = synthesizeGenrePresetInput.parse(payload.input);
  const locale = input.locale ?? "th";
  const flags = await getTenantFeatureFlags(payload.tenantId);
  const selectedPresetIds = Array.from(new Set(input.selectedPresetIds ?? []));
  const selectedCategories = Array.from(
    new Set(
      (input.selectedCategories ?? [])
        .map(category => category.trim())
        .filter(Boolean)
    )
  );
  const visualNarrativeEnabled =
    flags.verticalDramaSeriesLookLock === true &&
    input.visualNarrativeEnabled === true &&
    input.lookLockMode !== "none";
  const visualNarrativeIdentity =
    visualNarrativeEnabled &&
    input.lookLockMode === "genre" &&
    input.lookLockGenreKey
      ? getSeriesLookLockGenreIdentity(input.lookLockGenreKey)
      : undefined;
  const basicsOnlyContext =
    selectedPresetIds.length === 0 &&
    (input.selections?.length ?? 0) === 0 &&
    !input.userPremise?.trim()
      ? {
          seriesTitleHint: input.seriesTitleHint,
          genreHint: input.genreHint,
          audienceAgeRating: input.audienceAgeRating,
        }
      : {};
  const lineageContext = input.lineageContext
    ? { lineageContext: input.lineageContext as VerticalDramaSeriesLineage }
    : {};
  const selectionIds = Array.from(
    new Set((input.selections ?? []).map(selection => selection.presetId))
  );
  const allPresetIds = Array.from(
    new Set([...selectedPresetIds, ...selectionIds])
  );
  const numericIds = allPresetIds.map(Number);
  if (numericIds.some(id => !Number.isFinite(id)))
    throw new Error("Invalid preset id");
  const visibleRows: VerticalDramaGenrePresetRow[] = await db
    .select()
    .from(verticalDramaGenrePresets)
    .where(
      and(
        eq(verticalDramaGenrePresets.locale, locale),
        or(
          eq(verticalDramaGenrePresets.scope, "global"),
          and(
            eq(verticalDramaGenrePresets.scope, "private"),
            eq(verticalDramaGenrePresets.tenantId, payload.tenantId),
            eq(verticalDramaGenrePresets.userId, payload.userId)
          )
        )
      )
    )
    .orderBy(asc(verticalDramaGenrePresets.sortOrder));
  const rowsById = new Map(visibleRows.map(row => [String(row.id), row]));
  const selectedRows = allPresetIds
    .map(id => rowsById.get(id))
    .filter((row): row is VerticalDramaGenrePresetRow => Boolean(row));
  if (selectedRows.length !== allPresetIds.length)
    throw new Error("Preset not found");
  const shared = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    locale: normalizeVerticalDramaSeriesLocale(locale),
    selectedPresetIds,
    selectedPresets: selectedRows.map(row => ({
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
    userPremise:
      flags.verticalDramaUserPremise === true ? input.userPremise : undefined,
    dialogueLanguageProfile: input.spokenLocale
      ? buildVerticalDramaSpokenLanguageProfile(input.spokenLocale)
      : undefined,
    visualNarrativeEnabled,
    visualNarrativeIdentity,
  };
  const model = await resolveVerticalDramaRecommendedDraftModel();
  const result =
    flags.verticalDramaSeriesPresetMixV2 === true
      ? await synthesizeVerticalDramaPresetV2({
          ...shared,
          selections: input.selections,
        })
      : await synthesizeVerticalDramaPreset(shared);
  return {
    ...result,
    jobId: execution.jobId,
    traceId: execution.traceId,
    model,
  };
}

export const verticalDramaSeriesRouter = router({
  setSeriesLookLock: verticalDramaSeriesLookLockProcedure
    .input(setSeriesLookLockInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
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
            visualNarrativeEnabled: input.visualNarrativeEnabled,
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

      const rows: Array<
        Pick<
          VerticalDramaSeriesRow,
          | "id"
          | "title"
          | "status"
          | "locale"
          | "aspectRatio"
          | "genre"
          | "tone"
          | "targetEpisodeCount"
          | "productTieIn"
          | "bible"
          | "createMode"
          | "seasonNumber"
          | "parentSeriesId"
          | "lineage"
          | "createdAt"
          | "updatedAt"
        >
      > = await db
        .select({
          id: verticalDramaSeries.id,
          title: verticalDramaSeries.title,
          status: verticalDramaSeries.status,
          locale: verticalDramaSeries.locale,
          aspectRatio: verticalDramaSeries.aspectRatio,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          targetEpisodeCount: verticalDramaSeries.targetEpisodeCount,
          productTieIn: verticalDramaSeries.productTieIn,
          // The list payload still exposes deepDraftSummary for compatibility,
          // but avoids loading unrelated JSON columns from the full row.
          bible: verticalDramaSeries.bible,
          createMode: verticalDramaSeries.createMode,
          seasonNumber: verticalDramaSeries.seasonNumber,
          parentSeriesId: verticalDramaSeries.parentSeriesId,
          lineage: verticalDramaSeries.lineage,
          createdAt: verticalDramaSeries.createdAt,
          updatedAt: verticalDramaSeries.updatedAt,
        })
        .from(verticalDramaSeries)
        .where(and(...conditions))
        .orderBy(desc(verticalDramaSeries.updatedAt))
        .limit(opts.limit ?? 100);

      const seriesIds = rows.map(r => r.id);

      // Per-series normal-episode aggregates (max episode number + count) in one query.
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
                  inArray(verticalDramaEpisodes.seriesId, seriesIds),
                  eq(verticalDramaEpisodes.episodeKind, "normal")
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
            status: resolveVerticalDramaSeriesStatus({
              status: row.status,
              bible: row.bible,
            }),
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

  /** Feature 156 — server-owned staging session for Story Sources & Media. */
  createSourcePackSession: verticalDramaProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return createDraftSourceSession({ tenantId, userId: ctx.user.id });
    }),

  /**
   * Create the lightweight Series identity before any Draft/QC work starts.
   * This is deliberately free and metadata-only: it gives the Planning route a
   * durable URL without loading or persisting a full candidate body.
   */
  createPlanningSeriesShell: verticalDramaProcedure
    .input(
      z.object({
        title: z
          .string()
          .trim()
          .max(CREATE_SERIES_FIELD_LIMITS.title)
          .optional(),
        locale: z.enum(VERTICAL_DRAMA_SERIES_LOCALES).optional(),
        targetEpisodeCount: z.number().int().positive().max(1000).optional(),
        seriesProfileId: z.enum(VD_SERIES_PROFILE_IDS).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const requestedTitle = input.title?.trim();
      const [row] = await db.transaction(async tx => {
        // There is no row to lock when the first placeholder is being created.
        // Serialize this owner-scoped decision as well, otherwise two concurrent
        // retries could both observe an empty result and insert twin shells.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`vertical-drama-planning-shell:${tenantId}:${userId}`}))`
        );
        // The blank New flow creates its title only after the wizard has a
        // durable Series id. Reuse the caller's newest unfinished placeholder
        // so a retry, refresh, or repeated click cannot create twin shells with
        // the same title and split the Draft/QC session across both rows.
        if (!requestedTitle) {
          const existing = await tx
            .select()
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.tenantId, tenantId),
                eq(verticalDramaSeries.userId, userId),
                eq(verticalDramaSeries.status, "planning"),
                eq(verticalDramaSeries.title, PLANNING_SERIES_PLACEHOLDER_TITLE)
              )
            )
            .orderBy(
              desc(verticalDramaSeries.updatedAt),
              desc(verticalDramaSeries.id)
            )
            .limit(1);
          if (existing[0]) return existing;
        }

        const now = new Date().toISOString();
        return tx
          .insert(verticalDramaSeries)
          .values({
            tenantId,
            userId,
            title: requestedTitle || PLANNING_SERIES_PLACEHOLDER_TITLE,
            locale: input.locale ?? "th",
            aspectRatio: "9:16",
            status: "planning",
            targetEpisodeCount: input.targetEpisodeCount ?? 10,
            defaultEpisodeDurationSeconds: 60,
            bible: {
              planningState: buildVerticalDramaPlanningState({
                now,
                activeStep: "basic",
              }),
              ...(input.seriesProfileId
                ? { seriesProfile: { profileId: input.seriesProfileId } }
                : {}),
            },
          })
          .returning();
      });
      return { series: { ...row, id: String(row.id) } };
    }),

  /** Create or retrieve the one active staged pack for this owner/session. */
  getOrCreateSourcePack: verticalDramaProcedure
    .input(
      z.object({
        draftSessionId: z.string().trim().min(40).max(128),
        profileId: z.enum(VD_SERIES_PROFILE_IDS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return getOrCreateStagedSourcePack({
        tenantId,
        userId: ctx.user.id,
        draftSessionId: input.draftSessionId,
        profileId: input.profileId as VdSeriesProfileId,
      });
    }),

  getSourcePack: verticalDramaProcedure
    .input(z.object({ packId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return loadSourcePack({ tenantId, userId: ctx.user.id }, input.packId);
    }),

  /**
   * Return only the Series-owned source-pack identity. The source pack itself
   * remains lazy and is fetched by pack id, so switching Planning tabs never
   * reloads Draft/QC bodies or silently falls back to a new default pack.
   */
  getPlanningSourcePackPointer: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const row = await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      const state = readVerticalDramaPlanningState(row.bible);
      return {
        seriesId: input.seriesId,
        title: row.title,
        targetEpisodeCount: row.targetEpisodeCount,
        planningState: state,
        pointer: state?.sourcePackPointer ?? null,
      };
    }),

  /**
   * Persist the staged source-pack identity on the Series row. This is a
   * metadata-only read-modify-write and deliberately does not copy source
   * assets, Draft candidates, or QC history into the Series bible.
   */
  persistPlanningSourcePackPointer: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        draftSessionId: z.string().trim().min(1).max(128).optional(),
        sourcePackId: z.number().int().positive().optional(),
        profileId: z.enum(VD_SERIES_PROFILE_IDS).optional(),
        clear: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }

      // A client may only persist a pack that belongs to this owner and is
      // either still staged or already attached to this same Series. This
      // keeps the recovery pointer tenant-safe and prevents cross-series
      // attachments from being resurrected after a remount.
      if (input.sourcePackId !== undefined) {
        // Do not hydrate the full pack here. `loadSourcePack` also reads the
        // prompt-expansion run table, but this metadata-only pointer write
        // must remain usable while that optional feature migration is being
        // rolled out. The source-pack row is sufficient for every ownership
        // and identity check performed by this procedure.
        const [pack] = await db
          .select({
            id: verticalDramaSourcePacks.id,
            seriesId: verticalDramaSourcePacks.seriesId,
            draftSessionId: verticalDramaSourcePacks.draftSessionId,
            profileId: verticalDramaSourcePacks.profileId,
          })
          .from(verticalDramaSourcePacks)
          .where(
            and(
              eq(verticalDramaSourcePacks.id, input.sourcePackId),
              eq(verticalDramaSourcePacks.tenantId, tenantId),
              eq(verticalDramaSourcePacks.userId, userId),
              isNull(verticalDramaSourcePacks.deletedAt)
            )
          )
          .limit(1);
        if (!pack) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Source pack not found",
          });
        }
        const attachedSeriesId =
          pack.seriesId == null ? null : Number(pack.seriesId);
        if (attachedSeriesId !== null && attachedSeriesId !== seriesId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Source pack belongs to another series",
          });
        }
        if (
          input.draftSessionId &&
          pack.draftSessionId &&
          input.draftSessionId !== pack.draftSessionId
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Source pack session does not match",
          });
        }
        if (
          input.profileId &&
          pack.profileId &&
          input.profileId !== pack.profileId
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Source pack profile does not match",
          });
        }
      }

      // The session and pack mutations can finish back-to-back. Read and
      // merge the latest Series state under one row lock so those partial
      // pointer updates cannot overwrite each other with a stale bible.
      const pointer = await db.transaction(async tx => {
        const ownershipWhere = seriesOwnershipWhere(tenantId, userId, seriesId);
        const [current] = await tx
          .select({ bible: verticalDramaSeries.bible })
          .from(verticalDramaSeries)
          .where(ownershipWhere)
          .for("update");
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Series not found",
          });
        }

        const currentBible =
          (current.bible as Record<string, unknown> | null) ?? {};
        const currentState =
          readVerticalDramaPlanningState(currentBible) ??
          buildVerticalDramaPlanningState({});
        const now = new Date().toISOString();
        const nextState = input.clear
          ? (() => {
              const {
                sourcePackPointer: _sourcePackPointer,
                ...withoutPointer
              } = currentState;
              return {
                ...withoutPointer,
                revision: currentState.revision + 1,
                lastSavedAt: now,
              };
            })()
          : {
              ...currentState,
              sourcePackPointer: {
                ...currentState.sourcePackPointer,
                ...(input.sourcePackId !== undefined
                  ? { sourcePackId: input.sourcePackId }
                  : {}),
                ...(input.draftSessionId !== undefined
                  ? { draftSessionId: input.draftSessionId }
                  : {}),
                ...(input.profileId !== undefined
                  ? { profileId: input.profileId }
                  : {}),
                savedAt: now,
              },
              revision: currentState.revision + 1,
              lastSavedAt: now,
            };

        const [updated] = await tx
          .update(verticalDramaSeries)
          .set({
            bible: { ...currentBible, planningState: nextState },
            updatedAt: new Date(),
          })
          .where(ownershipWhere)
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Planning series changed",
          });
        }

        return "sourcePackPointer" in nextState
          ? (nextState.sourcePackPointer ?? null)
          : null;
      });

      return { seriesId: input.seriesId, pointer };
    }),

  saveSourceSlot: verticalDramaProcedure
    .input(
      verticalDramaSourceSlotInputSchema.extend({
        packId: z.number().int().positive(),
        expectedPackVersion: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return saveSourceSlot({ tenantId, userId: ctx.user.id }, input);
    }),

  addSourceAsset: verticalDramaProcedure
    .input(
      verticalDramaSourceAssetInputSchema.extend({
        packId: z.number().int().positive(),
        expectedPackVersion: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const referenceUrl = input.provenance.referenceUrl;
      if (typeof referenceUrl === "string" && referenceUrl.trim()) {
        validateSourceReferenceUrl(referenceUrl);
      }
      return addSourceAsset({ tenantId, userId: ctx.user.id }, input);
    }),

  registerUploadedSourceMedia: verticalDramaProcedure
    .input(
      z.object({
        storageKey: z.string().trim().min(1).max(1024),
        mediaType: z.enum(["image", "video"]),
        mimeType: z.string().trim().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return registerVerticalDramaUploadedMediaAsset({
        tenantId,
        userId: ctx.user.id,
        storageKey: input.storageKey,
        mediaType: input.mediaType,
        mimeType: input.mimeType,
      });
    }),

  /** Feature 160 — settle an AI result into the managed-media ledger before
   * attaching it to Story Sources & Media. Provider URLs are provenance only;
   * source-pack assets must reference owner-scoped durable storage. */
  createGeneratedSourceAsset: verticalDramaProcedure
    .input(
      verticalDramaSourceAssetInputSchema.extend({
        packId: z.number().int().positive(),
        expectedPackVersion: z.number().int().positive(),
        taskId: z.string().trim().min(1).max(255),
        seriesId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const pack = await loadSourcePack({ tenantId, userId }, input.packId);
      const userToken = await getAdBannerMediaUserToken(ctx);
      let task;
      try {
        task = await getUnifiedMediaTask({
          taskId: input.taskId,
          userId,
          userToken,
          tenantId,
          auditContext: {
            userId,
            tenantId,
            source: "trpc.verticalDramaSeries.createGeneratedSourceAsset",
            stage: "settle_source_asset",
          },
        });
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            error instanceof Error ? error.message : "Generated task not found",
        });
      }
      if (task.status !== "completed" || !task.resultUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Generated image is not ready yet",
        });
      }
      const durable = await ingestVerticalDramaMediaAsset({
        tenantId,
        userId,
        seriesId: input.seriesId ?? Number(pack.pack.seriesId ?? input.packId),
        mediaType: "image",
        sourceUrl: task.resultUrl,
        mimeType: "image/png",
        identity: task.id,
        purpose: "source_pack_generated_reference",
      });
      return addSourceAsset(
        { tenantId, userId },
        {
          ...input,
          mediaAssetId: durable.mediaAssetId,
          provenance: {
            ...input.provenance,
            source: "generated_reference",
            taskId: task.id,
            managed: true,
            storageKey: durable.storageKey,
            uploadedUrl: durable.url,
            generatedUrl: task.resultUrl,
          },
        }
      );
    }),

  setSourceAssetRights: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive(),
        expectedPackVersion: z.number().int().positive(),
        rightsStatus: z.enum(VD_SOURCE_RIGHTS_STATUSES),
        disclosureStatus: z.enum(VD_SOURCE_DISCLOSURE_STATUSES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return setSourceAssetRights({ tenantId, userId: ctx.user.id }, input);
    }),

  getSourcePackReadiness: verticalDramaProcedure
    .input(z.object({ packId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return getSourcePackReadiness(
        { tenantId, userId: ctx.user.id },
        input.packId
      );
    }),

  getSourcePackDigest: verticalDramaProcedure
    .input(z.object({ packId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return buildStoredSourcePackDigest(
        { tenantId, userId: ctx.user.id },
        input.packId
      );
    }),

  getSourcePackBrollManifest: verticalDramaProcedure
    .input(z.object({ packId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return buildStoredSourcePackBrollManifest(
        { tenantId, userId: ctx.user.id },
        input.packId
      );
    }),

  getSeriesSourcePackBrollManifest: verticalDramaProcedure
    .input(z.object({ seriesId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return buildStoredSeriesSourcePackBrollManifest(
        { tenantId, userId: ctx.user.id },
        input.seriesId
      );
    }),

  requestSourceAnalysis: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive(),
        policyVersion: z.string().trim().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return requestSourceAnalysis({ tenantId, userId: ctx.user.id }, input);
    }),

  suggestSourceDescription: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const pack = await loadSourcePack(
        { tenantId, userId: ctx.user.id },
        input.packId
      );
      const asset = pack.assets.find(
        (item: {
          id: number;
          title: string;
          provenanceJson: Record<string, unknown> | null;
          description: string | null;
          mediaAssetId: number | null;
        }) => item.id === input.sourceAssetId
      );
      if (!asset)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Source asset not found",
        });
      const analysis = await requestSourceAnalysis(
        { tenantId, userId: ctx.user.id },
        { packId: input.packId, sourceAssetId: asset.id }
      );
      return {
        ...analysis,
        sourceAssetId: asset.id,
        requiresVisionReview: Boolean(
          asset.mediaAssetId ||
          (asset.provenanceJson &&
            (typeof asset.provenanceJson.uploadedUrl === "string" ||
              typeof asset.provenanceJson.url === "string" ||
              typeof asset.provenanceJson.referenceUrl === "string"))
        ),
      };
    }),

  acceptSourceDescriptionSuggestion: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive(),
        suggestion: z.string().trim().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return acceptSourceAnalysisSuggestion(
        { tenantId, userId: ctx.user.id },
        input
      );
    }),

  validateSourceUrl: verticalDramaProcedure
    .input(z.object({ url: z.string().trim().min(1).max(2048) }))
    .query(({ input }) => {
      const url = validateSourceReferenceUrl(input.url);
      return { origin: url.origin, pathname: url.pathname };
    }),

  /** Feature 160 — optional dialog-first prompt interpretation. It never
   * mutates the premise; the client must show/edit/apply the returned preview. */
  previewPromptExpansion: verticalDramaProcedure
    .input(
      promptExpansionInteractiveInput.extend({
        locale: z.enum(["th", "en"]).default("th"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      await assertPromptExpansionSchemaReady();
      const existing = await getPromptExpansionByIdempotencyKey(
        { tenantId, userId: ctx.user.id },
        input.idempotencyKey
      );
      if (existing) {
        return {
          jobId: null,
          status: "succeeded" as const,
          deduped: true,
          runId: Number(existing.row.id),
          preview: existing.preview,
        };
      }

      const scopeKey = input.seriesId
        ? `series:${input.seriesId}`
        : `prompt:${input.draftSessionId ?? input.idempotencyKey}`;
      const job = await enqueueVerticalDramaInteractiveJob({
        kind: "prompt_expansion",
        tenantId,
        userId: ctx.user.id,
        scopeKey,
        skillSlug: PROMPT_EXPANSION_SKILL_ID,
        modelId: input.modelId,
        idempotencyKey: input.idempotencyKey,
        input,
      });
      return { ...job, preview: undefined };
    }),

  getInteractiveJobStatus: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        scopeKey: z.string().trim().min(1).max(256),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const record = await getVerticalDramaInteractiveJobStatus(input.jobId, {
        tenantId,
        userId: ctx.user.id,
        scopeKey: input.scopeKey,
      });
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Interactive job not found",
        });
      return {
        kind: record.kind,
        status: record.status,
        progress: record.progress,
        result: record.status === "succeeded" ? record.result : undefined,
        error:
          record.status === "failed" ? (record.error ?? undefined) : undefined,
        traceId: record.traceId,
      };
    }),

  getActiveInteractiveJob: verticalDramaProcedure
    .input(z.object({ scopeKey: z.string().trim().min(1).max(256) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const record = await getActiveVerticalDramaInteractiveJob({
        tenantId,
        userId: ctx.user.id,
        scopeKey: input.scopeKey,
      });
      if (!record) return null;
      return {
        jobId: record.jobId,
        kind: record.kind,
        status: record.status,
        progress: record.progress,
        traceId: record.traceId,
      };
    }),

  applyPromptExpansion: verticalDramaProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        expectedRevision: z.number().int().positive(),
        originalPromptHash: z.string().regex(/^[a-f0-9]{64}$/),
        approved: promptExpansionPreviewSchema,
        packId: z.number().int().positive().optional(),
        expectedPackVersion: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const row = await applyPromptExpansion(
        { tenantId, userId: ctx.user.id },
        input
      );
      let sourcePackVersion: number | null = null;
      if (input.packId) {
        let currentPack = await loadSourcePack(
          { tenantId, userId: ctx.user.id },
          input.packId
        );
        let expectedPackVersion =
          input.expectedPackVersion ?? currentPack.pack.version;
        currentPack = await pruneUnapprovedPromptSlots(
          { tenantId, userId: ctx.user.id },
          {
            packId: input.packId,
            expectedPackVersion,
            approvedSlotKeys: input.approved.slots.map(slot => slot.slotKey),
          }
        );
        expectedPackVersion = currentPack.pack.version;
        for (const [index, slot] of input.approved.slots.entries()) {
          const existing = currentPack.slots.find(
            (candidate: { slotKey: string }) =>
              candidate.slotKey === slot.slotKey
          ) as
            | {
                id: number;
                version: number;
                sortOrder: number;
                sourceAssetId: number | null;
              }
            | undefined;
          const sourceKind =
            slot.semanticRole === "scene_anchor"
              ? "known_place"
              : slot.semanticRole === "reference"
                ? input.approved.brief.profile === "software_review"
                  ? "software_review"
                  : "product_snapshot"
                : slot.mediaType === "video" ||
                    slot.semanticRole === "b_roll_footage"
                  ? "upload_video"
                  : "upload_image";
          const usagePolicy =
            slot.semanticRole === "scene_anchor" ||
            slot.semanticRole === "reference"
              ? "reference"
              : "broll";
          currentPack = await saveSourceSlot(
            { tenantId, userId: ctx.user.id },
            {
              packId: input.packId,
              expectedPackVersion,
              slotId: existing?.id,
              version: existing?.version,
              slotKey: slot.slotKey,
              title: slot.title,
              narrativeDescription: slot.description,
              sourceKind,
              required: slot.required,
              usagePolicy,
              sortOrder: existing?.sortOrder ?? index,
              sourceAssetId: existing?.sourceAssetId ?? null,
            }
          );
          expectedPackVersion = currentPack.pack.version;
        }
        sourcePackVersion = currentPack.pack.version;
      }
      return {
        runId: Number(row.id),
        status: row.status,
        approved: row.approvedJson,
        sourcePackVersion,
      };
    }),

  generateSourceSlotPrompt: verticalDramaProcedure
    .input(
      z.object({
        slot: z.object({
          slotKey: z.string().min(1),
          title: z.string().min(1),
          description: z.string().min(1),
          semanticRole: z.enum([
            "scene_anchor",
            "reference",
            "b_roll_still",
            "b_roll_footage",
          ]),
          mediaType: z.enum(["image", "video", "mixed"]),
          required: z.boolean(),
          evidenceStatus: z.enum([
            "not_applicable",
            "illustrative",
            "needs_verification",
            "verified",
          ]),
        }),
        brief: z.object({
          title: z.string().min(1),
          oneLineSummary: z.string().min(1),
          profile: z.enum([
            "review",
            "documentary",
            "news_report",
            "software_review",
            "story",
          ]),
          angle: z.string().min(1),
          scope: z.array(z.string()),
          factualClaims: z.array(z.string()),
          creativeAssumptions: z.array(z.string()),
          exclusions: z.array(z.string()),
        }),
      })
    )
    .mutation(({ input }) => ({
      prompt: buildSlotPrompt(input.slot, input.brief, "en"),
    })),

  evaluateNewsReport: verticalDramaProcedure
    .input(
      z.object({
        claims: z.array(newsClaimSchema).max(200),
        now: z.string().datetime().optional(),
      })
    )
    .mutation(({ input }) => {
      const claims = input.claims.map(claim =>
        assessNewsClaimFreshness({
          claim,
          now: input.now ? new Date(input.now) : undefined,
        })
      );
      return { claims, readiness: evaluateNewsReadiness(claims) };
    }),

  listNewsClaims: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      return listPersistedNewsClaims(
        { tenantId, userId: ctx.user.id },
        seriesId
      );
    }),

  saveNewsClaim: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1), claim: newsClaimSchema }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      return persistNewsClaim(
        { tenantId, userId: ctx.user.id },
        { seriesId, claim: input.claim }
      );
    }),

  correctNewsClaim: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        claimId: z.string().trim().min(1).max(128),
        nextEvidence: newsClaimSchema.shape.evidenceRefs,
        note: z.string().trim().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      try {
        return await persistNewsCorrection(
          { tenantId, userId: ctx.user.id },
          {
            seriesId,
            claimId: input.claimId,
            nextEvidence: input.nextEvidence,
            note: input.note,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "News claim not found"
        ) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  previewNewsCorrection: verticalDramaProcedure
    .input(
      z.object({
        claim: newsClaimSchema,
        nextEvidence: newsClaimSchema.shape.evidenceRefs,
        note: z.string().trim().min(1).max(1000),
      })
    )
    .mutation(({ input }) => applyNewsCorrection(input)),

  validateBrollTimeline: verticalDramaProcedure
    .input(
      z.object({
        snapshotRevision: z.number().int().positive(),
        snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        maxDurationSeconds: z.number().positive().max(86_400).optional(),
        items: z
          .array(
            z.object({
              binding: shotBrollBindingSchema,
              segment: sourceMediaSegmentSchema.nullable().optional(),
            })
          )
          .max(200),
      })
    )
    .mutation(({ input }) => {
      const bindings = input.items.map(item =>
        validateBrollBinding(parseShotBrollBinding(item.binding), {
          snapshotRevision: input.snapshotRevision,
          snapshotFingerprint: input.snapshotFingerprint,
          segment: item.segment ?? null,
        })
      );
      return projectBrollTimeline(bindings, input.maxDurationSeconds);
    }),

  createSourceMediaSegment: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive(),
        segmentKey: z.string().trim().min(1).max(128),
        inSeconds: z.number().finite().min(0).max(86_400),
        outSeconds: z.number().finite().min(0).max(86_400),
        label: z.string().trim().min(1).max(180),
        description: z.string().trim().max(5000).optional(),
        evidenceScope: z
          .array(z.string().trim().min(1).max(128))
          .max(32)
          .default([]),
        sourceLabel: z.string().trim().max(240).optional(),
        locationLabel: z.string().trim().max(240).optional(),
        audioPolicy: z.enum(["keep", "mute", "replace"]).default("keep"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      if (input.outSeconds <= input.inSeconds)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "outSeconds must be greater than inSeconds",
        });
      assertR2StorageActive();
      const pack = await loadSourcePack(
        { tenantId, userId: ctx.user.id },
        input.packId
      );
      const asset = pack.assets.find(
        (item: {
          id: number;
          sourceKind: string;
          mediaAssetId?: number | null;
        }) => Number(item.id) === input.sourceAssetId
      );
      if (!asset || asset.sourceKind !== "upload_video")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A video source asset is required",
        });
      if (!asset.mediaAssetId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Video source is not registered in managed media",
        });
      const [mediaAsset] = await db
        .select({
          status: mediaAssets.status,
          storageKey: mediaAssets.storageKey,
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, asset.mediaAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (
        !mediaAsset ||
        mediaAsset.status !== "ready" ||
        !mediaAsset.storageKey ||
        !(await storageExists(mediaAsset.storageKey))
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Video source must be present in owner-scoped R2 storage",
        });
      }
      const [latest] = await db
        .select({ revision: verticalDramaSourceMediaSegments.revision })
        .from(verticalDramaSourceMediaSegments)
        .where(
          and(
            eq(verticalDramaSourceMediaSegments.tenantId, tenantId),
            eq(
              verticalDramaSourceMediaSegments.sourceAssetId,
              input.sourceAssetId
            ),
            eq(verticalDramaSourceMediaSegments.segmentKey, input.segmentKey)
          )
        )
        .orderBy(desc(verticalDramaSourceMediaSegments.revision))
        .limit(1);
      const [segment] = await db
        .insert(verticalDramaSourceMediaSegments)
        .values({
          tenantId,
          userId: ctx.user.id,
          packId: input.packId,
          sourceAssetId: input.sourceAssetId,
          segmentKey: input.segmentKey,
          revision: (latest?.revision ?? 0) + 1,
          mediaType: "video",
          inSeconds: input.inSeconds,
          outSeconds: input.outSeconds,
          displayDurationSeconds: null,
          label: input.label,
          description: input.description ?? null,
          evidenceScopeJson: input.evidenceScope,
          sourceLabel: input.sourceLabel ?? null,
          locationLabel: input.locationLabel ?? null,
          audioPolicy: input.audioPolicy,
          status: "ready",
        })
        .returning();
      return { segment };
    }),

  listSourceMediaSegments: verticalDramaProcedure
    .input(
      z.object({
        packId: z.number().int().positive(),
        sourceAssetId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      await loadSourcePack({ tenantId, userId: ctx.user.id }, input.packId);
      return db
        .select()
        .from(verticalDramaSourceMediaSegments)
        .where(
          and(
            eq(verticalDramaSourceMediaSegments.tenantId, tenantId),
            eq(verticalDramaSourceMediaSegments.userId, ctx.user.id),
            eq(verticalDramaSourceMediaSegments.packId, input.packId),
            ...(input.sourceAssetId !== undefined
              ? [
                  eq(
                    verticalDramaSourceMediaSegments.sourceAssetId,
                    input.sourceAssetId
                  ),
                ]
              : [])
          )
        )
        .orderBy(
          asc(verticalDramaSourceMediaSegments.sourceAssetId),
          asc(verticalDramaSourceMediaSegments.segmentKey),
          desc(verticalDramaSourceMediaSegments.revision)
        );
    }),

  /**
   * Create a series SHELL in dry-run mode. This persists metadata only and
   * does not trigger episode/story generation. A stale or incomplete Story
   * Architecture may invoke one bounded, separately charged repair so the
   * submitted metadata can be made valid without creator intervention.
   * Ownership is stamped from the authenticated context (never client-
   * supplied).
   */
  create: verticalDramaProcedure
    .input(createSeriesInput)
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;

      const planningSeriesNumber = input.planningSeriesId
        ? Number(input.planningSeriesId)
        : null;
      if (
        input.planningSeriesId &&
        (planningSeriesNumber === null ||
          !Number.isFinite(planningSeriesNumber))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid planning series id",
        });
      }
      const planningSeriesRow = planningSeriesNumber
        ? await loadOwnedSeries(tenantId, userId, planningSeriesNumber)
        : null;
      if (input.planningSeriesId && !planningSeriesRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planning series not found",
        });
      }
      if (planningSeriesRow && planningSeriesRow.status !== "planning") {
        if (input.sourcePackAttachIdempotencyKey) {
          const attached = await findAttachedSourcePackByIdempotencyKey(
            { tenantId, userId },
            input.sourcePackAttachIdempotencyKey
          );
          if (attached?.seriesId === planningSeriesRow.id) {
            return {
              series: {
                ...planningSeriesRow,
                id: String(planningSeriesRow.id),
              },
            };
          }
        }
        const state = readVerticalDramaPlanningState(planningSeriesRow.bible);
        if (
          state?.finalizedDraftSessionId &&
          state.finalizedDraftSessionId === input.draftSessionId
        ) {
          return {
            series: { ...planningSeriesRow, id: String(planningSeriesRow.id) },
          };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "This planning series has already been finalized",
        });
      }

      // Feature 156 gate: enforce the new Source Pack contract at the server
      // boundary. A retry with the same attach key is idempotent and returns
      // the already-created shell before any paid repair work is attempted.
      if (input.sourcePackAttachIdempotencyKey) {
        const attached = await findAttachedSourcePackByIdempotencyKey(
          { tenantId, userId },
          input.sourcePackAttachIdempotencyKey
        );
        if (attached?.seriesId != null) {
          const existingSeries = await loadOwnedSeries(
            tenantId,
            userId,
            attached.seriesId
          );
          return {
            series: { ...existingSeries, id: String(existingSeries.id) },
          };
        }
      }
      const formatProfileId =
        input.seriesFormat?.kind && input.seriesFormat.kind !== "fiction_drama"
          ? (input.seriesFormat.kind as VdSeriesProfileId)
          : undefined;
      const effectiveProfile = input.seriesProfileId
        ? getSeriesProfile(input.seriesProfileId)
        : formatProfileId
          ? getSeriesProfile(formatProfileId)
          : undefined;
      if (effectiveProfile?.sourceGatePolicy === "required") {
        if (
          !input.sourcePackId ||
          !input.draftSessionId ||
          !input.sourcePackAttachIdempotencyKey
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "เตรียมเรื่องและสื่อประกอบให้พร้อมก่อนร่างเรื่อง",
          });
        }
        const stagedPack = await loadSourcePack(
          { tenantId, userId },
          input.sourcePackId
        );
        if (stagedPack.pack.profileId !== effectiveProfile.profileId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Source Pack profile does not match the selected Series Profile",
          });
        }
        if (
          stagedPack.pack.seriesId == null &&
          stagedPack.pack.draftSessionId !== input.draftSessionId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Source Pack session does not belong to this draft",
          });
        }
        if (!stagedPack.readiness.textDraftAllowed) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Story Sources & Media is not ready",
            cause: stagedPack.readiness,
          });
        }
      } else if (input.sourcePackId) {
        const stagedPack = await loadSourcePack(
          { tenantId, userId },
          input.sourcePackId
        );
        if (stagedPack.profile.sourceGatePolicy === "required") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Source Pack requires its matching documentary/review profile",
          });
        }
      }

      // New synthesized drafts carry a foundation contract. Re-evaluate it at
      // the server boundary before persistence. This validation is about the
      // saved Draft's story structure, not its optional QC result, so skipping
      // or failing QC never becomes a confirmation gate.
      const candidateStoryContract =
        input.bible?.storyContract ??
        input.draftQualityQcCandidate?.storyContract;
      const shouldAutoRepairStoryArchitecture =
        candidateStoryContract !== undefined;
      let repairedStoryContract:
        | VerticalDramaStoryArchitectureContract
        | undefined;
      let storyArchitectureRepairAudit: Record<string, unknown> | undefined;
      if (shouldAutoRepairStoryArchitecture) {
        const architecture = evaluateVerticalDramaStoryArchitecture({
          contract: candidateStoryContract,
          genre: input.genre,
          userPremise: input.userPremise,
          targetEpisodeCount: input.targetEpisodeCount,
        });
        if (architecture.ready && architecture.contract) {
          // Transport self-healing: a valid candidate contract may be present
          // in the QC payload but omitted from bible by an older client.
          if (input.bible?.storyContract === undefined) {
            repairedStoryContract = architecture.contract;
          }
        } else {
          const bibleRecord = (input.bible ?? {}) as Record<string, unknown>;
          const candidateRecord = (input.draftQualityQcCandidate ??
            {}) as Record<string, unknown>;
          const premise = [
            input.userPremise,
            typeof bibleRecord.userPremise === "string"
              ? bibleRecord.userPremise
              : undefined,
            typeof candidateRecord.userPremise === "string"
              ? candidateRecord.userPremise
              : undefined,
            typeof candidateRecord.logline === "string"
              ? candidateRecord.logline
              : undefined,
            typeof candidateRecord.mainPlot === "string"
              ? candidateRecord.mainPlot
              : undefined,
            typeof candidateRecord.seasonArc === "string"
              ? candidateRecord.seasonArc
              : undefined,
          ]
            .map(value => value?.trim())
            .filter((value): value is string => Boolean(value))
            .join("\n\n")
            .slice(0, CREATE_SERIES_FIELD_LIMITS.userPremise);

          let repairResult: VerticalDramaStoryArchitecturePlannerResult;
          const repairIdempotencySeed =
            input.draftQualityQcReceipt?.candidateFingerprint ??
            createHash("sha256")
              .update(
                JSON.stringify({
                  userId,
                  tenantId,
                  title: input.title,
                  genre: input.genre,
                  targetEpisodeCount: input.targetEpisodeCount,
                  candidateStoryContract,
                })
              )
              .digest("hex");
          try {
            const { planVerticalDramaStoryArchitecture } =
              await import("../services/verticalDramaStoryArchitecturePlanner");
            repairResult = await planVerticalDramaStoryArchitecture({
              userId,
              tenantId,
              billingRunKey: `vd-story-architecture-repair:${userId}:${repairIdempotencySeed}`,
              model: input.defaultModelId ?? undefined,
              locale: input.locale === "en" ? "en" : "th",
              userPremise: premise || input.title,
              genreHint: input.genre,
              seriesTitleHint: input.title,
              toneHint: input.tone,
              selectedCategories: input.genre ? [input.genre] : [],
              selectedPresets: [],
              targetEpisodeCount: input.targetEpisodeCount,
              audienceAgeRating: resolveAudienceAgeRating(
                input.audienceAgeRating
              ),
              existingContract: candidateStoryContract,
            });
          } catch (error) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                (input.locale === "en" ? "en" : "th") === "th"
                  ? "ระบบพยายามซ่อมโครงสร้างเรื่องอัตโนมัติแล้ว แต่ยังไม่สำเร็จ"
                  : "The system attempted to repair Story Architecture automatically but could not complete it.",
              cause: error,
            });
          }

          const repairedArchitecture = evaluateVerticalDramaStoryArchitecture({
            contract: repairResult.contract,
            genre: input.genre,
            userPremise: premise || input.userPremise,
            targetEpisodeCount: input.targetEpisodeCount,
          });
          if (!repairedArchitecture.ready || !repairedArchitecture.contract) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                (input.locale === "en" ? "en" : "th") === "th"
                  ? "ระบบพยายามซ่อมโครงสร้างเรื่องอัตโนมัติแล้ว แต่ยังตรวจสอบไม่ผ่าน"
                  : "The system attempted to repair Story Architecture automatically but validation still failed.",
              cause: repairedArchitecture.diagnostics,
            });
          }

          repairedStoryContract = repairedArchitecture.contract;
          const repairCreditAmount = repairResult.creditsUsed;
          storyArchitectureRepairAudit = {
            applied: true,
            model: repairResult.model,
            repairRounds: repairResult.repairRounds,
            promptTokens: repairResult.promptTokens,
            completionTokens: repairResult.completionTokens,
            creditAmount: repairCreditAmount,
          };
        }
      }

      // Draft QC is advisory metadata only. Legacy/manual create payloads and
      // confirmations with skipped, failed, stale, or edited QC remain valid.
      // When the optional receipt still matches the owner-scoped candidate, we
      // re-read it only to preserve an audit trail.
      let validatedDraftQualityQcAudit: Record<string, unknown> | undefined;
      let confirmedDraftFingerprint: string | undefined;
      if (input.draftQualityQcReceipt) {
        const parsedReceipt = draftQualityQcReceiptSchema.safeParse(
          input.draftQualityQcReceipt
        );
        const receipt = parsedReceipt.success ? parsedReceipt.data : undefined;
        const candidate = input.draftQualityQcCandidate;
        const receiptCanBeUsedForAudit = Boolean(
          parsedReceipt.success &&
          planningSeriesRow &&
          receipt &&
          candidate &&
          receipt.seriesId === planningSeriesRow.id &&
          fingerprintDraftQualityQcCandidate(candidate) ===
            receipt.candidateFingerprint
        );
        if (receiptCanBeUsedForAudit && receipt && candidate) {
          try {
            confirmedDraftFingerprint = receipt.candidateFingerprint;
            const qcRecord = await getVerticalDramaDraftQualityQcStatus(
              receipt.runId,
              { tenantId, userId },
              receipt.seriesId
            );
            // A completed run is intentionally also recoverable from the durable
            // ledger after Redis/BullMQ expiry. The receipt still has to identify
            // the exact owner-scoped run and candidate fingerprint; this fallback
            // only prevents a refresh/TTL boundary from making a valid Draft
            // impossible to confirm.
            const durableQcLedger = !qcRecord?.result
              ? await getVerticalDramaDraftLedgerByQcRunId(
                  receipt.runId,
                  { tenantId, userId },
                  receipt.seriesId
                )
              : null;
            const qcResult =
              qcRecord?.result ??
              (qcRecord?.status === "failed" && qcRecord.failure
                ? await recoverVerticalDramaDraftQualityQcResultFromFailure(
                    qcRecord,
                    qcRecord.failure
                  )
                : qcRecord?.status === "succeeded"
                  ? qcRecord.result
                  : durableQcLedger
                    ? await recoverVerticalDramaDraftQualityQcResultByRunId(
                        receipt.runId,
                        { tenantId, userId },
                        receipt.seriesId
                      )
                    : null);
            if (qcResult) {
              const selectedHistoryEntry =
                qcResult.history.find(
                  entry =>
                    entry.candidateFingerprint === receipt.candidateFingerprint
                ) ??
                (receipt.candidateFingerprint === qcResult.best.fingerprint
                  ? {
                      report: qcResult.best.report,
                      score: qcResult.best.report.overallScore,
                      status: qcResult.best.report.status,
                    }
                  : undefined);
              const selectedReport = selectedHistoryEntry?.report;
              if (selectedReport) {
                // QC is advisory. Preserve an audit only when the owner-scoped
                // receipt can be matched to a report; missing/failed/incomplete
                // QC never blocks Draft confirmation.
                const candidateBible = input.bible ?? {};
                const appliedCandidateMatches =
                  (["logline", "mainPlot", "seasonArc"] as const).every(key => {
                    const candidateValue = candidate[key];
                    const appliedValue = candidateBible[key];
                    return (
                      typeof candidateValue !== "string" ||
                      typeof appliedValue !== "string" ||
                      candidateValue === appliedValue
                    );
                  }) &&
                  (
                    [
                      "storyContext",
                      "storyDesign",
                      "storyContract",
                      "visualNarrativeProfile",
                    ] as const
                  ).every(key =>
                    candidate[key] === undefined ||
                    candidateBible[key] === undefined
                      ? true
                      : fingerprintDraftQualityQcCandidate(candidate[key]) ===
                        fingerprintDraftQualityQcCandidate(candidateBible[key])
                  );
                if (appliedCandidateMatches) {
                  validatedDraftQualityQcAudit = {
                    contractVersion: "vd-draft-qc-v1",
                    runId: receipt.runId,
                    candidateFingerprint: receipt.candidateFingerprint,
                    overallScore: selectedReport.overallScore,
                    status: selectedReport.status,
                    pass: selectedReport.pass,
                    explicitOverride: receipt.explicitOverride === true,
                    appliedTitle: input.title.trim(),
                    bestRound: qcResult.best.round,
                    stopReason: qcResult.stopReason,
                    ...(qcResult.draftArtifactId
                      ? { draftId: qcResult.draftArtifactId }
                      : {}),
                    // Keep the Series projection compact. Immutable round history
                    // stays in the Draft ledger and is exposed only by getDraftHistory.
                    historyCount: qcResult.history.length,
                    creditEstimate: qcResult.creditEstimate,
                    evaluatedAt: qcResult.best.report.evaluatedAt,
                  };
                }
              }
            }
          } catch (error) {
            // QC is optional metadata. Redis/ledger outages must never turn
            // into a Draft confirmation failure.
            debugError(
              "verticalDramaSeries.create",
              "Optional Draft QC audit unavailable; confirmation continues",
              error
            );
          }
        }
      }
      if (!confirmedDraftFingerprint && input.draftQualityQcCandidate) {
        confirmedDraftFingerprint = fingerprintDraftQualityQcCandidate(
          input.draftQualityQcCandidate
        );
      }
      if (validatedDraftQualityQcAudit && storyArchitectureRepairAudit) {
        validatedDraftQualityQcAudit = {
          ...validatedDraftQualityQcAudit,
          storyArchitectureAutoRepair: storyArchitectureRepairAudit,
        };
      }

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
      const profileProjection = effectiveProfile
        ? projectProfileToLegacy(effectiveProfile.profileId)
        : undefined;
      let initialBible: Record<string, unknown> = {
        ...(input.userPremise
          ? { ...(input.bible ?? {}), userPremise: input.userPremise }
          : (input.bible ?? {})),
        audienceAgeRating: resolveAudienceAgeRating(input.audienceAgeRating),
        ...(profileProjection
          ? {
              seriesProfile: {
                profileId: effectiveProfile?.profileId,
                version: effectiveProfile?.version,
                visualVersion: effectiveProfile?.visualVersion,
              },
              seriesFormat: profileProjection.seriesFormat,
              visualGroundingContract: effectiveProfile?.grounding,
            }
          : input.seriesFormat
            ? { seriesFormat: input.seriesFormat }
            : {}),
        ...(input.lookLock?.visualNarrativeEnabled === true
          ? {
              visualGroundingContract: resolveVisualGroundingContract({
                genreKey: input.lookLock.genreKey,
                formatKind: input.seriesFormat?.kind,
                mode: "strict_genre",
              }),
            }
          : {}),
        ...(validatedDraftQualityQcAudit
          ? { draftQualityQc: validatedDraftQualityQcAudit }
          : {}),
        ...(input.shotDurationSeconds !== undefined
          ? {
              durationProfile: createUniformVerticalDramaDurationPlan(
                input.shotDurationSeconds,
                { source: "user_selected" }
              ),
            }
          : {}),
        ...(repairedStoryContract
          ? { storyContract: repairedStoryContract }
          : {}),
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

      if (planningSeriesRow) {
        const previousPlanningState = readVerticalDramaPlanningState(
          planningSeriesRow.bible
        );
        const now = new Date().toISOString();
        initialBible = {
          ...initialBible,
          planningState: {
            ...(previousPlanningState ??
              buildVerticalDramaPlanningState({ now })),
            version: 1 as const,
            revision: (previousPlanningState?.revision ?? 0) + 1,
            status: "confirmed" as const,
            ...(input.draftSessionId
              ? { draftSessionId: input.draftSessionId }
              : {}),
            activeDraft: confirmedDraftFingerprint
              ? {
                  ...(validatedDraftQualityQcAudit?.draftId
                    ? {
                        draftId: validatedDraftQualityQcAudit.draftId as string,
                      }
                    : {}),
                  fingerprint: confirmedDraftFingerprint,
                  confirmedAt: now,
                }
              : (previousPlanningState?.activeDraft ?? null),
            activeQc: validatedDraftQualityQcAudit
              ? {
                  runId: input.draftQualityQcReceipt?.runId,
                  score: validatedDraftQualityQcAudit.overallScore as number,
                  status: validatedDraftQualityQcAudit.status as string,
                  confirmedAt: now,
                }
              : (previousPlanningState?.activeQc ?? null),
            lastSavedAt: now,
            ...(input.draftSessionId
              ? { finalizedDraftSessionId: input.draftSessionId }
              : {}),
          },
        };
      }

      const insertValues: InsertVerticalDramaSeriesRow = {
        tenantId,
        userId,
        title: input.title,
        locale: input.locale ?? "th",
        aspectRatio: input.aspectRatio ?? "9:16",
        status: hasVerticalDramaGeneratedStory(initialBible)
          ? "story_ready"
          : planningSeriesRow
            ? "planning"
            : "draft",
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

      if (
        input.sourcePackId &&
        (!input.draftSessionId || !input.sourcePackAttachIdempotencyKey)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Source Pack attach requires a server-issued session and idempotency key",
        });
      }

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
        if (planningSeriesRow) {
          return db.transaction(async tx => {
            const [updatedRow] = await tx
              .update(verticalDramaSeries)
              .set(insertValues)
              .where(
                seriesOwnershipWhere(tenantId, userId, planningSeriesRow.id)
              )
              .returning();
            if (!updatedRow) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Planning series changed before confirmation",
              });
            }
            if (parentSeriesRow) {
              await cloneSeriesCastForLineage(
                {
                  tenantId,
                  userId,
                  parentSeriesId: parentSeriesRow.id,
                  childSeriesId: Number(updatedRow.id),
                  lineage: input.lineage as
                    | VerticalDramaSeriesLineage
                    | undefined,
                },
                tx
              );
            }
            if (
              input.sourcePackId &&
              input.draftSessionId &&
              input.sourcePackAttachIdempotencyKey
            ) {
              await attachStagedSourcePackInTransaction(tx, {
                tenantId,
                userId,
                packId: input.sourcePackId,
                draftSessionId: input.draftSessionId,
                seriesId: Number(updatedRow.id),
                idempotencyKey: input.sourcePackAttachIdempotencyKey,
              });
            }
            return updatedRow;
          });
        }
        if (!parentSeriesRow && !input.sourcePackId) {
          const [insertedRow] = await db
            .insert(verticalDramaSeries)
            .values(insertValues)
            .returning();
          return insertedRow;
        }

        const parentSeriesIdForClone = parentSeriesRow?.id;
        try {
          return await db.transaction(async tx => {
            const [insertedRow] = await tx
              .insert(verticalDramaSeries)
              .values(insertValues)
              .returning();
            if (parentSeriesRow) {
              await cloneSeriesCastForLineage(
                {
                  tenantId,
                  userId,
                  parentSeriesId: parentSeriesRow.id,
                  childSeriesId: Number(insertedRow.id),
                  lineage: input.lineage as
                    | VerticalDramaSeriesLineage
                    | undefined,
                },
                tx
              );
            }
            if (
              input.sourcePackId &&
              input.draftSessionId &&
              input.sourcePackAttachIdempotencyKey
            ) {
              await attachStagedSourcePackInTransaction(tx, {
                tenantId,
                userId,
                packId: input.sourcePackId,
                draftSessionId: input.draftSessionId,
                seriesId: Number(insertedRow.id),
                idempotencyKey: input.sourcePackAttachIdempotencyKey,
              });
            }
            return insertedRow;
          });
        } catch (error) {
          debugError(
            "verticalDramaSeries.create",
            `Failed to finalize atomic series create/Source Pack attach for parent ${parentSeriesIdForClone ?? "none"} — series creation rolled back`,
            error
          );
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to finalize series creation. No series was created — please try again.",
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

      return {
        series: {
          ...finalRow,
          id: String(finalRow.id),
          status: resolveVerticalDramaSeriesStatus({
            status: finalRow.status,
            bible: finalRow.bible,
          }),
        },
      };
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
          episodeKind: verticalDramaEpisodes.episodeKind,
          specialSequence: verticalDramaEpisodes.specialSequence,
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
          status: resolveVerticalDramaSeriesStatus({
            status: row.status,
            bible: row.bible,
          }),
          bible: projectSeriesBibleForRead(row.bible),
          // Expose only the Worker workflow policy needed by Settings; do not
          // project the entire free-form policy JSONB to the browser.
          workerMediaWorkflowPolicy:
            row.policy &&
            typeof row.policy === "object" &&
            !Array.isArray(row.policy)
              ? ((row.policy as Record<string, unknown>)
                  .workerMediaWorkflowPolicy ?? null)
              : null,
          workerAccessPolicy:
            row.policy &&
            typeof row.policy === "object" &&
            !Array.isArray(row.policy)
              ? workerSeriesAccessPolicySchema.safeParse(
                  (row.policy as Record<string, unknown>).workerAccess
                ).success
                ? (row.policy as Record<string, unknown>).workerAccess
                : null
              : null,
          // Explicitly project the legacy value for the settings UI. It is
          // read-only compatibility metadata; new profiles live in bible.
          defaultEpisodeDurationSeconds: row.defaultEpisodeDurationSeconds,
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
  /** Feature 174 — one catalog for story props and Special Tie-in objects. */
  listObjectReferences: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        includeArchived: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) =>
      listVerticalDramaObjectReferences(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.seriesId,
        { includeArchived: input.includeArchived }
      )
    ),

  createObjectReference: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        name: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2000).optional(),
        canonicalPrompt: z.string().trim().max(4000).optional(),
        objectType: z.string().trim().max(32).optional(),
        narrativeRole: z.string().trim().max(160).optional(),
        continuityNotes: z.string().trim().max(2000).optional(),
        commercialTieInEnabled: z.boolean().optional(),
        aliases: z.array(z.string().trim().min(2).max(160)).max(24).optional(),
        mode: z
          .enum(["story_object", "commercial_tie_in"])
          .default("story_object"),
        source: z
          .enum([
            "manual",
            "uploaded",
            "library",
            "marketplace_capture",
            "generated",
            "legacy_product_tie_in",
          ])
          .default("uploaded"),
        marketplaceCaptureId: z.string().trim().max(128).optional(),
        marketplaceProductId: z.string().trim().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      createVerticalDramaObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  updateObjectReference: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        name: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        canonicalPrompt: z.string().trim().max(4000).nullable().optional(),
        mode: z.enum(["story_object", "commercial_tie_in"]).optional(),
        objectType: z.string().trim().max(32).optional(),
        narrativeRole: z.string().trim().max(160).nullable().optional(),
        continuityNotes: z.string().trim().max(2000).nullable().optional(),
        commercialTieInEnabled: z.boolean().optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      updateVerticalDramaObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  archiveObjectReference: verticalDramaObjectCatalogProcedure
    .input(z.object({ objectReferenceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      archiveVerticalDramaObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.objectReferenceId
      )
    ),

  restoreObjectReference: verticalDramaObjectCatalogProcedure
    .input(z.object({ objectReferenceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      restoreVerticalDramaObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.objectReferenceId
      )
    ),

  addObjectReferenceAsset: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        mediaAssetId: z.string().min(1),
        role: z.enum(["primary", "canonical", "alternate"]).default("alternate"),
        source: z
          .enum([
            "manual",
            "uploaded",
            "library",
            "marketplace_capture",
            "generated",
            "legacy_product_tie_in",
          ])
          .default("library"),
        label: z.string().trim().max(160).optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      addVerticalDramaObjectReferenceAsset(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  removeObjectReferenceAsset: verticalDramaObjectCatalogProcedure
    .input(z.object({ assetId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      removeVerticalDramaObjectReferenceAsset(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.assetId
      )
    ),

  restoreObjectReferenceAsset: verticalDramaObjectCatalogProcedure
    .input(z.object({ assetId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      restoreVerticalDramaObjectReferenceAsset(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.assetId
      )
    ),

  setObjectReferenceCanonicalAsset: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        assetId: z.string().min(1),
        expectedRevision: z.number().int().nonnegative().optional(),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      setVerticalDramaObjectReferenceCanonicalAsset(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  reorderObjectReferenceAssets: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        assetIds: z.array(z.string().min(1)).max(20),
      })
    )
    .mutation(async ({ ctx, input }) =>
      reorderVerticalDramaObjectReferenceAssets(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  listObjectReferenceAliases: verticalDramaProcedure
    .input(z.object({ objectReferenceId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      listVerticalDramaObjectReferenceAliases(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.objectReferenceId
      )
    ),

  upsertObjectReferenceAliases: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        aliases: z.array(z.string().trim().min(2).max(160)).max(24),
      })
    )
    .mutation(async ({ ctx, input }) =>
      upsertVerticalDramaObjectReferenceAliases(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  objectReferenceCapabilities: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      try {
        const flags = await getTenantFeatureFlags(tenantId);
        return {
          objectCatalog: flags.verticalDramaObjectReferences === true,
          objectDetection: flags.verticalDramaObjectDetection === true,
          objectImageGeneration:
            flags.verticalDramaObjectImageGeneration === true,
          objectLegacyBackfill:
            flags.verticalDramaObjectLegacyBackfill === true,
        } as const;
      } catch {
        return {
          objectCatalog: false,
          objectDetection: false,
          objectImageGeneration: false,
          objectLegacyBackfill: false,
        } as const;
      }
    }),

  previewObjectReferencePrompt: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        sceneContext: z.string().trim().max(4000).optional(),
      })
    )
    .query(async ({ ctx, input }) =>
      previewVerticalDramaObjectReferencePrompt(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  requestObjectReferencePrompt: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        sceneContext: z.string().trim().max(4000).optional(),
        idempotencyKey: z.string().trim().min(8).max(128),
      })
    )
    .mutation(async ({ ctx, input }) =>
      requestVerticalDramaObjectReferencePrompt(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  /** Submit an explicitly confirmed, credit-admitted object image task. */
  generateObjectReferenceImage: verticalDramaObjectImageProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        objectReferenceId: z.string().min(1),
        selectedImageModelId: z.string().trim().min(1).max(128),
        sceneContext: z.string().trim().max(4000).optional(),
        negativePrompt: z.string().trim().max(1000).optional(),
        confirmation: z.literal(true),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const context = await getVerticalDramaObjectReferenceGenerationContext(
        { tenantId, userId: ctx.user.id },
        input
      );
      if (context.seriesId !== input.seriesId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Object reference not found",
        });
      }
      const { mediaRouter } = await import("./media");
      return mediaRouter.createCaller(ctx).generateImageAsync({
        prompt: context.prompt,
        model: input.selectedImageModelId,
        aspectRatio: "1:1",
        ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
        ...(context.referenceImageUrls.length > 0
          ? { referenceImageUrls: context.referenceImageUrls }
          : {}),
        originSurface: "media_studio",
        idempotencyKey: input.idempotencyKey,
        extraParams: {
          __vd_series_id: input.seriesId,
          __vd_object_reference_id: input.objectReferenceId,
          __vd_object_reference_revision: context.revision,
          __vd_purpose: "object_reference",
        },
      });
    }),

  /** Convert only a completed owned task into a draft catalog asset. */
  applyGeneratedObjectReferenceImage: verticalDramaObjectImageProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        objectReferenceId: z.string().min(1),
        taskId: z.string().trim().min(1).max(256),
        role: z.enum(["canonical", "detail", "alternate"]).default("alternate"),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const context = await getVerticalDramaObjectReferenceGenerationContext(
        { tenantId, userId: ctx.user.id },
        { objectReferenceId: input.objectReferenceId }
      );
      if (context.seriesId !== input.seriesId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Object reference not found" });
      }
      const { mediaRouter } = await import("./media");
      let task;
      try {
        task = await mediaRouter.createCaller(ctx).getTask({ taskId: input.taskId });
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "Generated object task not found",
        });
      }
      const parameters = (task?.parameters ?? {}) as Record<string, unknown>;
      const rawExtra = parameters.extra_params ?? parameters.extraParams ?? task?.resultData?.extra_params;
      const extra = rawExtra && typeof rawExtra === "object" && !Array.isArray(rawExtra)
        ? (rawExtra as Record<string, unknown>)
        : {};
      if (
        task?.mediaType !== "image" ||
        task.status !== "completed" ||
        !task.resultUrl?.startsWith("/api/storage/files/") ||
        String(extra.__vd_series_id ?? "") !== input.seriesId ||
        String(extra.__vd_object_reference_id ?? "") !== input.objectReferenceId ||
        extra.__vd_purpose !== "object_reference"
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The generated object image is not ready to apply.",
        });
      }
      const durable = await ensureVerticalDramaTaskResultDurable({
        tenantId,
        userId: ctx.user.id,
        task: task as any,
      });
      if (!durable) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The generated object image is not available in managed storage.",
        });
      }
      const asset = await addVerticalDramaObjectReferenceAsset(
        { tenantId, userId: ctx.user.id },
        {
          objectReferenceId: input.objectReferenceId,
          mediaAssetId: String(durable.mediaAssetId),
          role: input.role,
          source: "generated",
          label: `Generated from ${input.taskId}`,
        }
      );
      if (input.role === "canonical") {
        await setVerticalDramaObjectReferenceCanonicalAsset(
          { tenantId, userId: ctx.user.id },
          { objectReferenceId: input.objectReferenceId, assetId: asset.id }
        );
      }
      return { ...asset, taskId: input.taskId, revision: context.revision };
    }),

  linkShotObjectReference: verticalDramaObjectCatalogProcedure
    .input(
      z.object({
        objectReferenceId: z.string().min(1),
        episodeId: z.string().min(1),
        shotNumber: z.number().int().min(1).max(100),
        assignmentSource: z
          .enum(["manual", "detected", "special_tie_in"])
          .default("manual"),
        confidence: z.number().min(0).max(1).optional(),
        locked: z.boolean().default(false),
        selectedMediaAssetId: z.string().min(1).optional(),
        expectedRevision: z.number().int().nonnegative().optional(),
        idempotencyKey: z.string().trim().min(8).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      linkVerticalDramaShotObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  unlinkShotObjectReference: verticalDramaProcedure
    .input(z.object({ linkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      unlinkVerticalDramaShotObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input.linkId
      )
    ),

  /** Idempotent bridge used when an existing Special/Product tie-in selects a product. */
  ensureCommercialObjectReference: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        name: z.string().trim().min(1).max(160),
        marketplaceCaptureId: z.string().trim().max(128).optional(),
        marketplaceProductId: z.string().trim().max(128).optional(),
        mediaAssetIds: z.array(z.string().min(1)).max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      ensureCommercialObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

  reconcileCommercialObjectReference: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        name: z.string().trim().min(1).max(160),
        marketplaceCaptureId: z.string().trim().max(128).optional(),
        marketplaceProductId: z.string().trim().max(128).optional(),
        mediaAssetIds: z.array(z.string().min(1)).max(20).optional(),
        reviewedSnapshot: z.unknown().optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      reconcileCommercialObjectReference(
        { tenantId: requireTenantId(ctx.tenantId), userId: ctx.user.id },
        input
      )
    ),

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

      // Ensure the caller owns it (throws NOT_FOUND otherwise), and use the
      // current bible as the source of truth when this is a metadata-only
      // status update. A generated story must never be written back as draft.
      const currentRow = await loadOwnedSeries(tenantId, userId, seriesId);
      const effectiveBible = input.bible ?? currentRow.bible;

      const updates: Partial<typeof verticalDramaSeries.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.status !== undefined || input.bible !== undefined) {
        updates.status = resolveVerticalDramaSeriesStatus({
          status: input.status ?? currentRow.status,
          bible: effectiveBible,
        }) as typeof updates.status;
      }
      if (input.bible !== undefined) updates.bible = input.bible;
      if (input.policy !== undefined) updates.policy = input.policy;
      if (input.productTieIn !== undefined)
        updates.productTieIn = input.productTieIn;

      const [row] = await db
        .update(verticalDramaSeries)
        .set(updates)
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return {
        series: {
          ...row,
          id: String(row.id),
          status: resolveVerticalDramaSeriesStatus({
            status: row.status,
            bible: row.bible,
          }),
        },
      };
    }),

  /**
   * Free, compact Planning autosave. It never stores Draft/QC bodies. When a
   * caller supplies expectedRevision it remains a compare-and-swap guard;
   * browser autosave may omit it because the row lock serializes metadata-only
   * writes while the wizard is recovering from a refresh.
   */
  updatePlanningSeriesSnapshot: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        /** Optional for the autosave path; the row lock still serializes writes. */
        expectedRevision: z.number().int().nonnegative().optional(),
        title: z
          .string()
          .trim()
          .max(CREATE_SERIES_FIELD_LIMITS.title)
          .optional(),
        activeStep: z.string().trim().max(64).optional(),
        draftSessionId: z.string().trim().min(1).max(128).optional(),
        targetEpisodeCount: z.number().int().positive().max(1000).optional(),
        userPremise: z
          .string()
          .max(CREATE_SERIES_FIELD_LIMITS.userPremise)
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
      const result = await db.transaction(async tx => {
        const ownershipWhere = seriesOwnershipWhere(tenantId, userId, seriesId);
        const [current] = await tx
          .select({ bible: verticalDramaSeries.bible })
          .from(verticalDramaSeries)
          .where(ownershipWhere)
          .for("update");
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Planning series not found",
          });
        }
        const currentBible =
          (current.bible as Record<string, unknown> | null) ?? {};
        const currentState =
          readVerticalDramaPlanningState(currentBible) ??
          buildVerticalDramaPlanningState({});
        if (
          input.expectedRevision !== undefined &&
          currentState.revision !== input.expectedRevision
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Planning snapshot is stale; reload revision ${currentState.revision}`,
          });
        }
        const now = new Date().toISOString();
        const nextState = {
          ...currentState,
          revision: currentState.revision + 1,
          ...(input.activeStep ? { activeStep: input.activeStep } : {}),
          ...(input.draftSessionId
            ? { draftSessionId: input.draftSessionId }
            : {}),
          ...(input.userPremise !== undefined
            ? { userPremise: input.userPremise }
            : {}),
          lastSavedAt: now,
        };
        const [row] = await tx
          .update(verticalDramaSeries)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.targetEpisodeCount !== undefined
              ? { targetEpisodeCount: input.targetEpisodeCount }
              : {}),
            bible: { ...currentBible, planningState: nextState },
            updatedAt: new Date(),
          })
          .where(ownershipWhere)
          .returning();
        if (!row) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Planning series changed",
          });
        }
        return { row, nextState };
      });
      return {
        series: { ...result.row, id: String(result.row.id) },
        planningState: result.nextState,
      };
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
   * Persist the spoken-language/market profile inside the existing bible JSONB.
   * This is read-modify-write so changing it cannot erase duration, audience,
   * continuity, or any older story-bible fields. Missing legacy values remain
   * equivalent to `auto` and this mutation never regenerates existing content.
   */
  setSeriesDialogueLanguageProfile: verticalDramaProcedure
    .input(
      z
        .object({
          seriesId: z.string().min(1),
          /** New selector. */
          spokenLocale: verticalDramaSpokenLocaleSchema.optional(),
          /** Legacy selector accepted for old clients. */
          marketMode: z.enum(VERTICAL_DRAMA_DIALOGUE_MARKET_MODES).optional(),
        })
        .refine(value => Boolean(value.spokenLocale || value.marketMode), {
          message: "spokenLocale or marketMode is required",
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
        existing.bible && typeof existing.bible === "object"
          ? (existing.bible as Record<string, unknown>)
          : {};
      const nextBible = {
        ...existingBible,
        dialogueLanguageProfile: input.spokenLocale
          ? buildVerticalDramaSpokenLanguageProfile(input.spokenLocale)
          : buildVerticalDramaDialogueLanguageProfile(input.marketMode),
      };

      const [row] = await db
        .update(verticalDramaSeries)
        .set({ bible: nextBible, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning();

      return { series: { ...row, id: String(row.id) } };
    }),

  /**
   * Persist the new story-planning duration profile inside the existing bible
   * JSONB. This is additive and intentionally does not rewrite the legacy
   * `defaultEpisodeDurationSeconds` column, so old episodes keep their exact
   * production interpretation.
   */
  setSeriesDurationProfile: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        shotDurationSeconds: z
          .number()
          .refine(value => isSupportedVerticalDramaShotDuration(value), {
            message:
              "shotDurationSeconds must be a supported provider duration",
          }),
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
        existing.bible && typeof existing.bible === "object"
          ? (existing.bible as Record<string, unknown>)
          : {};
      const nextBible = {
        ...existingBible,
        durationProfile: createUniformVerticalDramaDurationPlan(
          input.shotDurationSeconds,
          { source: "user_selected" }
        ),
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
      const storyControlSeed = readVerticalDramaStoryControlSeed(
        (series.bible as Record<string, unknown> | null)?.storyControlSeed,
        { totalEpisodeCount: series.targetEpisodeCount ?? undefined }
      );
      const currentEpisode = Math.max(
        memory.lastFoldedEpisode,
        ...episodeRows.map(row => row.episodeNumber)
      );
      const horizonEpisode = Math.max(
        currentEpisode,
        series.targetEpisodeCount ?? 0
      );

      return {
        memory,
        closureAudit: assessThreadClosures({
          episodes: memory.episodes,
          horizonEpisode,
          seasonComplete:
            series.targetEpisodeCount != null &&
            currentEpisode >= series.targetEpisodeCount,
        }),
        storyControlSeed,
        storyControlAudit: auditVerticalDramaStoryControl({
          seed: storyControlSeed,
          episodes: memory.episodes,
          currentEpisode,
        }),
        durationPlan: resolveVerticalDramaDurationPlan(
          series.bible,
          series.defaultEpisodeDurationSeconds
        ),
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
   * Worker media workflow policy is explicit and durable. Series owners may
   * set it for their own Series; tenant admins may set it for any Series in
   * their tenant. The policy is stored under the existing JSON policy column
   * so this remains additive and does not rewrite unrelated settings.
   */
  setSeriesWorkerMediaWorkflowPolicy: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        policy: z.unknown(),
        expectedRevision: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .nullable()
          .optional()
          .default(null),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const submittedPolicy = mediaWorkflowPolicySnapshotSchema.parse(
        input.policy
      );
      const isAdmin = ctx.user.role === "admin";
      const [adminRow] = isAdmin
        ? await db
            .select()
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId)
              )
            )
            .limit(1)
        : [];
      const currentRow = isAdmin
        ? adminRow
        : await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      if (!currentRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
      }
      const currentPolicy =
        currentRow.policy &&
        typeof currentRow.policy === "object" &&
        !Array.isArray(currentRow.policy)
          ? (currentRow.policy as Record<string, unknown>)
          : {};
      const currentWorkerPolicy = mediaWorkflowPolicySnapshotSchema.safeParse(
        currentPolicy.workerMediaWorkflowPolicy
      );
      const currentRevision = currentWorkerPolicy.success
        ? currentWorkerPolicy.data.policyRevision
        : null;
      if (
        input.expectedRevision !== null &&
        input.expectedRevision !== currentRevision
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Worker media workflow policy changed; reload before saving",
        });
      }
      const policy = mediaWorkflowPolicySnapshotSchema.parse({
        ...submittedPolicy,
        policyRevision: `worker-media-policy-${Date.now()}-${randomUUID().slice(0, 8)}`,
      });
      const nextPolicy = {
        ...currentPolicy,
        workerMediaWorkflowPolicy: policy,
      };
      const [row] = await db
        .update(verticalDramaSeries)
        .set({ policy: nextPolicy, updatedAt: new Date() })
        .where(
          and(
            isAdmin
              ? and(
                  eq(verticalDramaSeries.id, seriesId),
                  eq(verticalDramaSeries.tenantId, tenantId)
                )
              : seriesOwnershipWhere(tenantId, ctx.user.id, seriesId),
            ...(input.expectedRevision !== null
              ? [
                  sql`(${verticalDramaSeries.policy}->'workerMediaWorkflowPolicy'->>'policyRevision') = ${input.expectedRevision}`,
                ]
              : [])
          )
        )
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Worker media workflow policy changed; reload before saving",
        });
      }
      auditLogger.log({
        traceId: auditLogger.createTrace(),
        eventType: "worker_media_workflow_policy_updated",
        userId: ctx.user.id,
        tenantId,
        metadata: {
          seriesId: String(seriesId),
          policyRevision: policy.policyRevision,
          defaultWorkflowId: policy.defaultWorkflowId,
          allowedWorkflowIds: policy.allowedWorkflowIds,
          workflowDefaults: policy.workflowDefaults,
          allowUserOverride: policy.allowUserOverride,
        },
      });
      return { series: { ...row, id: String(row.id) }, policy };
    }),

  /**
   * Configure which authenticated Worker principals may see and operate a
   * Series. This is additive to the existing JSON policy column and uses an
   * optimistic revision so a stale Worker/Admin screen cannot overwrite a
   * newer sharing decision.
   */
  setSeriesWorkerAccessPolicy: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        mode: z.enum(["private", "group", "tenant"]),
        userIds: z.array(z.number().int().positive()).max(100).default([]),
        groupIds: z
          .array(z.string().trim().min(1).max(128))
          .max(100)
          .default([]),
        expectedRevision: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .nullable()
          .default(null),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const isAdmin = ctx.user.role === "admin";
      const [adminRow] = isAdmin
        ? await db
            .select()
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId)
              )
            )
            .limit(1)
        : [];
      const currentRow = isAdmin
        ? adminRow
        : await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      if (!currentRow)
        throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });

      const currentPolicy =
        currentRow.policy && typeof currentRow.policy === "object"
          ? (currentRow.policy as Record<string, unknown>)
          : {};
      const currentAccess = workerSeriesAccessPolicySchema.safeParse(
        currentPolicy.workerAccess
      );
      const currentRevision = currentAccess.success
        ? currentAccess.data.revision
        : "worker-access-v1";
      if (
        input.expectedRevision !== null &&
        input.expectedRevision !== currentRevision
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Worker access policy changed; reload before saving",
        });
      }

      const accessPolicy = workerSeriesAccessPolicySchema.parse({
        mode: input.mode,
        userIds: [...new Set(input.userIds)].slice(0, 100),
        groupIds: [...new Set(input.groupIds.map(id => id.trim()))].slice(
          0,
          100
        ),
        revision: `worker-access-${Date.now()}-${randomUUID().slice(0, 8)}`,
      });
      const nextPolicy = { ...currentPolicy, workerAccess: accessPolicy };
      const [row] = await db
        .update(verticalDramaSeries)
        .set({ policy: nextPolicy, updatedAt: new Date() })
        .where(
          isAdmin
            ? and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId)
              )
            : seriesOwnershipWhere(tenantId, ctx.user.id, seriesId)
        )
        .returning();
      return { series: { ...row, id: String(row.id) }, accessPolicy };
    }),

  /**
   * Return bounded, Series-filtered media evidence for draft/B-roll planning.
   * The query is deliberately read-only and returns no storage URL or local
   * path; the downstream planner receives only grounded asset/time metadata.
   */
  searchSeriesMediaEvidence: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        query: z.string().trim().min(1).max(2000),
        limit: z.number().int().min(1).max(32).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, ctx.user.id, seriesId);
      const evidence = await retrieveVerticalDramaMediaEvidence({
        tenantId,
        seriesId: String(seriesId),
        query: input.query,
        limit: input.limit,
      });
      return {
        seriesId: String(seriesId),
        items: evidence.map(projectVerticalDramaMediaEvidence),
      };
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
      const { assertR2StorageActive, storagePut } = await import("../storage");
      await assertR2StorageActive();
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
   * Enabled image models with a provider-verified native transparent PNG
   * contract. The capability is checked here and again at submit time so a
   * stale client list can never make an unsupported provider request.
   */
  listLogoGenerationModels: verticalDramaProcedure
    .input(z.object({ seriesId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadOwnedSeries(tenantId, ctx.user.id, seriesId);

      const rows = await db
        .select({
          modelId: mediaModels.modelId,
          name: mediaModels.name,
          provider: mediaModels.provider,
          description: mediaModels.description,
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(
          and(
            eq(mediaModels.modelType, "image"),
            eq(mediaModels.isEnabled, true)
          )
        )
        .orderBy(
          asc(mediaModels.sortOrder),
          asc(mediaModels.priority),
          asc(mediaModels.id)
        );

      return {
        models: rows.flatMap(
          (row: {
            modelId: string;
            name: string;
            provider: string;
            description: string | null;
            creditCost: number;
            configJson: unknown;
          }) => {
            const capability = resolveTransparentBackgroundCapability(
              row.configJson
            );
            if (!capability || capability.outputFormat.toLowerCase() !== "png")
              return [];
            return [
              {
                modelId: row.modelId,
                name: row.name,
                provider: row.provider,
                description: row.description,
                creditCost: row.creditCost,
                transparentBackground: capability,
              },
            ];
          }
        ),
      };
    }),

  /** Start a paid transparent logo generation task without mutating the slot. */
  generateSeriesLogo: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        slotId: z.enum(["primary", "secondary"]),
        prompt: z.string().trim().min(1).max(20_000),
        modelId: z.string().trim().min(1).max(128),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);

      const [model] = await db
        .select({
          modelId: mediaModels.modelId,
          modelType: mediaModels.modelType,
          isEnabled: mediaModels.isEnabled,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId))
        .limit(1);
      const capability =
        model && model.isEnabled && model.modelType === "image"
          ? resolveTransparentBackgroundCapability(model.configJson)
          : null;
      if (!capability || capability.outputFormat.toLowerCase() !== "png") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The selected model does not support native transparent PNG output.",
        });
      }

      const { mediaRouter } = await import("./media");
      const caller = mediaRouter.createCaller(ctx);
      return caller.generateImageAsync({
        prompt: input.prompt,
        model: input.modelId,
        outputFormat: "png",
        originSurface: "media_studio",
        idempotencyKey: input.idempotencyKey,
        extraParams: {
          [capability.inputKey]: capability.enabledValue,
          __vd_series_id: String(seriesId),
          __vd_purpose: "series_logo",
          __vd_logo_slot: input.slotId,
        },
      });
    }),

  /** Apply only a completed, durable logo task that belongs to this slot. */
  applyGeneratedSeriesLogo: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        slotId: z.enum(["primary", "secondary"]),
        taskId: z.string().trim().min(1).max(256),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isSafeInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const series = await loadActiveOwnedSeries(tenantId, userId, seriesId);
      let task;
      try {
        // Use the exact same media router boundary as the browser poll. This
        // keeps token creation, task-source selection, and durability behavior
        // identical between preview and apply.
        const { mediaRouter } = await import("./media");
        task = await mediaRouter
          .createCaller(ctx)
          .getTask({ taskId: input.taskId });
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            error instanceof Error
              ? error.message
              : "Generated logo task not found",
        });
      }

      const params = task?.parameters ?? {};
      const rawExtra =
        params.extra_params ??
        params.extraParams ??
        task?.resultData?.extra_params;
      const extra =
        rawExtra && typeof rawExtra === "object" && !Array.isArray(rawExtra)
          ? (rawExtra as Record<string, unknown>)
          : {};
      const resultUrl =
        typeof task?.resultUrl === "string" ? task.resultUrl.trim() : "";
      // Tasks created before __vd_logo_slot was added remain valid when their
      // series/purpose provenance is correct. New tasks always carry the slot
      // and must match it, preventing accidental cross-slot application.
      const logoSlotMatches =
        extra.__vd_logo_slot == null || extra.__vd_logo_slot === input.slotId;
      if (
        !task ||
        task.mediaType !== "image" ||
        task.status !== "completed" ||
        String(extra.__vd_series_id ?? "") !== String(seriesId) ||
        extra.__vd_purpose !== "series_logo" ||
        !logoSlotMatches ||
        !resultUrl.startsWith("/api/storage/files/")
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The generated logo is not ready to apply.",
        });
      }

      const current = parseSeriesWatermarkConfig(series.watermark);
      const watermark = patchGeneratedLogoSlot(
        current,
        input.slotId as VerticalDramaLogoSlotId,
        resultUrl
      );
      const [row] = await db
        .update(verticalDramaSeries)
        .set({ watermark, updatedAt: new Date() })
        .where(seriesOwnershipWhere(tenantId, userId, seriesId))
        .returning({ watermark: verticalDramaSeries.watermark });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
      }
      return {
        taskId: input.taskId,
        imageUrl: resultUrl,
        watermark: row.watermark as VdSeriesWatermarkConfig,
      };
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
      const tenantId = requireTenantId(ctx.tenantId);
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
   * Pre-create Draft QC — submit, poll, and cancel a skill-first quality run.
   * This intentionally uses a draft session rather than a series id because
   * the wizard has not persisted a series yet.
   */
  getDraftQualityQcEstimate: verticalDramaProcedure
    .input(
      z.object({
        maxImprovementRounds: draftQualityQcRoundBudgetSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      const model = await resolveVerticalDramaRecommendedDraftModel();
      const perCallCredits = calculateCreditsForLLM(6000, 7000, model);
      return {
        model,
        ...estimateDraftQualityQcCredits({
          maxImprovementRounds: input.maxImprovementRounds ?? 2,
          perCallCredits,
        }),
      };
    }),

  startDraftQualityQc: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().trim().min(1),
        draftSessionId: z.string().trim().min(1).max(120),
        draftId: z.string().uuid(),
        draft: z.record(z.string(), z.unknown()),
        immutableConstraints: z.record(z.string(), z.unknown()).optional(),
        maxImprovementRounds: draftQualityQcRoundBudgetSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const draftLedger = await getVerticalDramaDraftLedger(input.draftId, {
        tenantId,
        userId: ctx.user.id,
      });
      if (
        !draftLedger ||
        draftLedger.seriesId !== seriesId ||
        draftLedger.seriesDeletedAt
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Draft does not belong to the selected Series",
        });
      }
      // The Draft ledger is the authoritative identity after refresh. The
      // client may still hold the planning/browser session from before the
      // Series-owned ledger was restored, so never pass that stale value into
      // append/enqueue validation. Ownership and Series checks above still
      // prevent a cross-Series Draft from being accepted.
      const ledgerDraftSessionId = draftLedger.draftSessionId;
      const constraints = input.immutableConstraints ?? {};
      const durableCompletionContext = readVerticalDramaDraftCompletionContext(
        draftLedger.requestJson
      );
      const targetEpisodeCount =
        typeof constraints.targetEpisodeCount === "number" &&
        Number.isInteger(constraints.targetEpisodeCount) &&
        constraints.targetEpisodeCount > 0
          ? constraints.targetEpisodeCount
          : durableCompletionContext.targetEpisodeCount;
      const genre =
        typeof constraints.genre === "string" && constraints.genre.trim()
          ? constraints.genre
          : durableCompletionContext.genre;
      const userPremise =
        typeof constraints.userPremise === "string" &&
        constraints.userPremise.trim()
          ? constraints.userPremise
          : durableCompletionContext.userPremise;
      const locale =
        typeof constraints.narrativeLocale === "string" &&
        constraints.narrativeLocale.toLowerCase().startsWith("en")
          ? ("en" as const)
          : ("th" as const);
      const model = await resolveVerticalDramaRecommendedDraftModel();
      const {
        repairVerticalDramaDraftBeforeQc,
        deductVerticalDramaDraftCompletionCredits,
      } = await import("../services/verticalDramaDraftCompletion");
      const repaired = await repairVerticalDramaDraftBeforeQc({
        draft: input.draft,
        model,
        userId: ctx.user.id,
        context: {
          locale,
          targetEpisodeCount,
          genre,
          userPremise,
          storyArchitecture:
            readVerticalDramaStoryArchitecture(input.draft.storyContract) ??
            undefined,
        },
        onCreditsUsed: usage =>
          deductVerticalDramaDraftCompletionCredits({
            userId: ctx.user.id,
            tenantId,
            creditsUsed: usage.creditsUsed,
            model: usage.model,
            repairRound: usage.repairRound,
          }),
      });
      let draftForQc = repaired.draft;
      const qcImmutableConstraints = {
        ...(input.immutableConstraints ?? {}),
        ...(targetEpisodeCount !== undefined ? { targetEpisodeCount } : {}),
        ...(genre !== undefined ? { genre } : {}),
        ...(userPremise !== undefined ? { userPremise } : {}),
        // QC is diagnostic here; an incomplete Draft remains blocked from
        // full series creation by the existing readiness gate.
        preQcCompleteness: {
          status: repaired.report.status,
          repairRound: repaired.report.repairRound,
          missingPaths: repaired.report.missingPaths,
          contradictionPaths: repaired.report.contradictionPaths,
          diagnostics: repaired.report.diagnostics,
        },
      };
      if (repaired.repaired && input.draftId) {
        const { appendVerticalDramaDraftVersion } =
          await import("../services/verticalDramaDraftLedger");
        await appendVerticalDramaDraftVersion({
          tenantId,
          userId: ctx.user.id,
          seriesId,
          draftId: input.draftId,
          draftSessionId: ledgerDraftSessionId,
          stage: "completion",
          content: draftForQc,
          changedPaths: [
            ...repaired.report.missingPaths,
            ...repaired.report.contradictionPaths,
          ],
          metadata: {
            source: "pre_qc_repair",
            model: repaired.model,
            creditsUsed: repaired.creditsUsed,
          },
        });
      }
      const result = await enqueueVerticalDramaDraftQualityQc(
        {
          tenantId,
          userId: ctx.user.id,
          seriesId,
          model,
          draftSessionId: ledgerDraftSessionId,
          draftId: input.draftId,
          draft: draftForQc,
          immutableConstraints: qcImmutableConstraints,
          maxImprovementRounds: input.maxImprovementRounds ?? 2,
        },
        {
          persistJobStatus: updateVerticalDramaDraftJob,
        }
      );
      return {
        ...result,
        draftSessionId: ledgerDraftSessionId,
        candidateFingerprint: fingerprintDraftQualityQcCandidate(draftForQc),
        repaired: repaired.repaired,
        repairRound: repaired.report.repairRound,
        preQcCompleteness: repaired.report,
      };
    }),

  /**
   * Start one explicit repair against a durable, already-scored QC candidate.
   * The client sends only the source fingerprint; the server reloads the
   * report, ledger version, owner, and immutable constraints before queueing.
   */
  repairDraftQualityQc: verticalDramaProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
        candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner = { tenantId, userId: ctx.user.id };
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const record = await getVerticalDramaDraftQualityQcStatus(
        input.runId,
        owner,
        seriesId
      );
      const durableRecoveredResult =
        record && record.status === "failed" && !record.result
          ? await recoverVerticalDramaDraftQualityQcResultByRunId(
              input.runId,
              owner,
              seriesId
            ).catch(() => null)
          : null;
      const effectiveResult = durableRecoveredResult
        ? {
            ...durableRecoveredResult,
            recoveredFromFailure: true,
            recoveryMessage:
              durableRecoveredResult.recoveryMessage ??
              "กู้คืนผล QC ล่าสุดที่ตรวจครบแล้วจาก Draft ledger",
          }
        : (record?.result ?? null);
      // A revision can fail after a baseline was fully scored. In that case
      // the recovery path provides a validated current candidate from the
      // ledger; it is safe to repair that candidate without pretending the
      // failed revision itself succeeded.
      const hasCompletedCurrentResult = Boolean(
        effectiveResult &&
        (record?.status === "succeeded" ||
          effectiveResult.recoveredFromFailure === true)
      );
      if (!record || !effectiveResult || !hasCompletedCurrentResult) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Draft QC repair requires a completed, current QC result",
        });
      }
      const candidate = effectiveResult.history.find(
        item => item.candidateFingerprint === input.candidateFingerprint
      );
      const report =
        candidate?.report &&
        draftQualityQcReportSchema.safeParse(candidate.report).success
          ? draftQualityQcReportSchema.parse(candidate.report)
          : effectiveResult.best.fingerprint === input.candidateFingerprint
            ? effectiveResult.best.report
            : null;
      const plan = report?.repairPlan;
      if (
        !report ||
        report.pass ||
        !plan?.available ||
        !plan.actions.some(action => action.autoRunnable)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No safe Draft QC repair plan is available for this candidate",
        });
      }
      const draftId = record.draftId;
      const draftSessionId = record.draftSessionId;
      const sourceVersion = candidate?.candidateVersion;
      if (!draftId || !draftSessionId || !sourceVersion) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This historical Draft candidate has no durable version to repair",
        });
      }
      if (record.seriesId !== seriesId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Draft QC does not belong to the selected Series",
        });
      }
      const version = await getVerticalDramaDraftVersion(
        draftId,
        sourceVersion,
        owner,
        seriesId
      );
      const sourceDraft =
        version?.contentJson &&
        typeof version.contentJson === "object" &&
        !Array.isArray(version.contentJson)
          ? (version.contentJson as Record<string, unknown>)
          : null;
      if (!version || version.runId !== input.runId || !sourceDraft) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Draft QC repair source version is stale or unavailable",
        });
      }
      if (
        fingerprintDraftQualityQcCandidate(sourceDraft) !==
        input.candidateFingerprint
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Draft QC repair source fingerprint does not match the ledger",
        });
      }
      const model =
        record.model ?? (await resolveVerticalDramaRecommendedDraftModel());
      const result = await enqueueVerticalDramaDraftQualityQc(
        {
          tenantId,
          userId: ctx.user.id,
          seriesId,
          model,
          draftSessionId,
          draftId,
          draft: sourceDraft,
          immutableConstraints: record.immutableConstraints,
          maxImprovementRounds: 1,
          operation: "repair",
          repairSourceVersion: sourceVersion,
          repairSourceFingerprint: input.candidateFingerprint,
          repairSourceReport: report,
        },
        { persistJobStatus: updateVerticalDramaDraftJob }
      );
      return {
        ...result,
        operation: "repair" as const,
        sourceFingerprint: input.candidateFingerprint,
        sourceVersion,
      };
    }),

  getDraftQualityQcStatus: verticalDramaProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
        /** Full QC round history is an explicit, lazy user action. */
        includeHistory: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const reconciliation = await reconcileVerticalDramaDraftQualityQc(
        input.runId,
        {
          tenantId,
          userId: ctx.user.id,
        },
        seriesId,
        {
          includeHistory: input.includeHistory,
        }
      );
      const record = reconciliation.record;
      if (!record) {
        if (reconciliation.stale) {
          return {
            status: "failed" as const,
            progress: null,
            result: undefined,
            error: reconciliation.message,
            failure: undefined,
            historicalResult: reconciliation.historicalResult,
            runId: input.runId,
            requestFingerprint: "",
          };
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft QC run not found",
        });
      }
      const recoverableResult =
        record.status === "failed" && record.failure && !record.result
          ? await recoverVerticalDramaDraftQualityQcResultFromFailure(
              record,
              record.failure
            )
          : null;
      return {
        status: record.status,
        progress: record.progress,
        // A failed run may still contain an immutable, fully scored candidate
        // recovered from the ledger. Expose it without changing the terminal
        // status so the UI can require an explicit warning confirmation.
        result: projectDraftQualityQcResult(
          record.result ?? recoverableResult ?? undefined,
          input.includeHistory
        ),
        historicalResult:
          input.includeHistory && record.draftId
            ? (
                await recoverVerticalDramaDraftQualityQcHistory(
                  record.draftId,
                  { tenantId, userId: ctx.user.id },
                  record.runId,
                  record.seriesId
                )
              )[0]
            : undefined,
        error:
          record.status === "failed" ? (record.error ?? undefined) : undefined,
        failure:
          record.status === "failed"
            ? (record.failure ?? undefined)
            : undefined,
        runId: record.runId,
        requestFingerprint: record.requestFingerprint,
      };
    }),

  /**
   * Return an immutable QC candidate selected from the round history. The
   * version, run and fingerprint are checked together so a client cannot mix
   * a scorecard from one run with Draft content from another run.
   */
  selectDraftQualityQcCandidate: verticalDramaProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
        draftId: z.string().uuid(),
        version: z.number().int().positive(),
        candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const owner = { tenantId, userId: ctx.user.id };
      const version = await getVerticalDramaDraftVersion(
        input.draftId,
        input.version,
        owner,
        seriesId
      );
      if (
        !version ||
        version.seriesId !== seriesId ||
        version.runId !== input.runId ||
        !["qc-baseline", "qc-revision"].includes(version.stage)
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft QC candidate version was not found",
        });
      }
      const draft =
        version.contentJson &&
        typeof version.contentJson === "object" &&
        !Array.isArray(version.contentJson)
          ? (version.contentJson as Record<string, unknown>)
          : null;
      if (!draft) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Draft QC candidate content is invalid",
        });
      }
      const fingerprint = fingerprintDraftQualityQcCandidate(draft);
      if (fingerprint !== input.candidateFingerprint) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Draft QC candidate fingerprint does not match its ledger version",
        });
      }
      return {
        draft,
        draftId: version.draftId,
        version: version.version,
        stage: version.stage,
        candidateFingerprint: fingerprint,
        runId: version.runId,
      };
    }),

  /**
   * Recover the durable Draft/QC workspace by its authoritative Series ID.
   * A browser-only session is deliberately not accepted here: it can point
   * at a previous/deleted Series and recreate the deleted-item loop.
   */
  getDraftWorkspaceStatus: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().trim().min(1),
        /** Historical QC candidates are fetched only from an explicit viewer. */
        includeHistory: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner = { tenantId, userId: ctx.user.id };
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      const series = await loadActiveOwnedSeries(
        tenantId,
        ctx.user.id,
        seriesId
      );
      const planningState = readVerticalDramaPlanningState(series.bible);
      const seriesLedger = await getVerticalDramaDraftLedgerBySeriesId(
        seriesId,
        owner
      );
      const resolvedDraftSessionId =
        seriesLedger?.draftSessionId ??
        planningState?.draftSessionId ??
        planningState?.legacyRecovery?.draftSessionId ??
        null;

      const [composition, qc, ledger, pointerRunId] = resolvedDraftSessionId
        ? await Promise.all([
            getVerticalDramaDraftCompositionStatusBySession(
              resolvedDraftSessionId,
              owner,
              seriesId
            ),
            getVerticalDramaDraftQualityQcStatusBySession(
              resolvedDraftSessionId,
              owner,
              seriesId
            ),
            seriesLedger ??
              getVerticalDramaDraftLedgerBySession(
                resolvedDraftSessionId,
                owner,
                seriesId
              ),
            getVerticalDramaDraftQualityQcRunIdBySession(
              resolvedDraftSessionId,
              owner,
              seriesId
            ),
          ])
        : [null, null, seriesLedger, null];
      let recoveredComposition = composition;
      // Redis is intentionally short-lived. The ledger is the durable recovery
      // path used after refresh, another browser, or Redis expiry.
      if (!recoveredComposition && ledger) {
        recoveredComposition = recoveredDraftCompositionStatus(ledger) as any;
      }
      const qcRunId = qc?.runId ?? ledger?.qcRunId ?? pointerRunId ?? null;
      const qcReconciliation = qcRunId
        ? await reconcileVerticalDramaDraftQualityQc(
            qcRunId,
            {
              ...owner,
            },
            seriesId,
            {
              includeHistory: input.includeHistory,
            }
          )
        : null;
      if (pointerRunId && pointerRunId !== qcRunId) {
        await clearVerticalDramaDraftQualityQcPointer(
          resolvedDraftSessionId!,
          owner,
          seriesId
        );
      }
      if (pointerRunId && !qc && !ledger) {
        await clearVerticalDramaDraftQualityQcPointer(
          resolvedDraftSessionId!,
          owner,
          seriesId
        );
      }
      const recoveredQc = qcReconciliation?.record ?? qc;
      const historicalQcResult = input.includeHistory
        ? (qcReconciliation?.historicalResult ??
          (recoveredQc?.draftId
            ? (
                await recoverVerticalDramaDraftQualityQcHistory(
                  recoveredQc.draftId,
                  owner,
                  recoveredQc.runId,
                  recoveredQc.seriesId
                )
              )[0]
            : undefined))
        : undefined;
      const recoverableQcResult =
        recoveredQc?.status === "failed" &&
        recoveredQc.failure &&
        !recoveredQc.result
          ? await recoverVerticalDramaDraftQualityQcResultFromFailure(
              recoveredQc,
              recoveredQc.failure
            )
          : null;
      return {
        draftSessionId: resolvedDraftSessionId,
        composition: recoveredComposition
          ? {
              jobId: recoveredComposition.jobId,
              status: recoveredComposition.status,
              progress: recoveredComposition.progress,
              result:
                recoveredComposition.status === "ready_for_qc"
                  ? recoveredComposition.result
                  : undefined,
              error:
                recoveredComposition.status === "failed"
                  ? (recoveredComposition.error ?? undefined)
                  : undefined,
              failure:
                recoveredComposition.status === "failed"
                  ? recoveredComposition.failure
                  : undefined,
              requestFingerprint: recoveredComposition.requestFingerprint,
              requestJson: recoveredComposition.requestJson,
            }
          : null,
        qc: recoveredQc
          ? {
              runId: recoveredQc.runId,
              status: recoveredQc.status,
              progress: recoveredQc.progress,
              result: projectDraftQualityQcResult(
                recoveredQc.result ?? recoverableQcResult ?? undefined,
                input.includeHistory
              ),
              historicalResult: historicalQcResult,
              error:
                recoveredQc.status === "failed"
                  ? (recoveredQc.error ?? undefined)
                  : undefined,
              failure:
                recoveredQc.status === "failed"
                  ? (recoveredQc.failure ?? undefined)
                  : undefined,
              requestFingerprint: recoveredQc.requestFingerprint,
            }
          : qcReconciliation?.stale
            ? {
                runId: qcRunId,
                status: "failed" as const,
                progress: null,
                error: qcReconciliation.message,
                historicalResult: historicalQcResult,
                requestFingerprint: "",
              }
            : null,
      };
    }),

  listDraftJobs: verticalDramaProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner = { tenantId, userId: ctx.user.id };
      const jobs = await listVerticalDramaDraftLedgers(
        owner,
        input?.limit ?? 50,
        input?.includeArchived ?? false
      );
      return {
        jobs,
      };
    }),

  /** One-time, owner-scoped compatibility migration for pre-Series Draft jobs. */
  migrateLegacyDraftJobs: verticalDramaProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return migrateLegacyVerticalDramaDrafts(
        { tenantId, userId: ctx.user.id },
        input?.limit ?? 50
      );
    }),

  // Compatibility alias for clients from the previous recovery implementation.
  listRecoverableDraftWorkspaces: verticalDramaProcedure.query(
    async ({ ctx }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      return {
        workspaces: await listVerticalDramaDraftLedgers({
          tenantId,
          userId: ctx.user.id,
        }),
      };
    }
  ),

  getDraftJob: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const job = await getVerticalDramaDraftLedger(input.jobId, {
        tenantId,
        userId: ctx.user.id,
      });
      if (!job || job.seriesId !== seriesId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบ Draft Job นี้ หรือคุณไม่มีสิทธิ์เข้าถึง",
        });
      }
      return { job };
    }),

  /** Explicit, metadata-only Draft history index. */
  getDraftHistory: verticalDramaProcedure
    .input(
      z.object({
        draftId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).max(1000).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner = { tenantId, userId: ctx.user.id };
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const ledger = await getVerticalDramaDraftLedger(input.draftId, owner);
      if (!ledger || ledger.seriesId !== seriesId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบ Draft history นี้ หรือคุณไม่มีสิทธิ์เข้าถึง",
        });
      }
      return {
        draftId: input.draftId,
        seriesId: input.seriesId,
        versions: await listVerticalDramaDraftVersionSummaries(
          input.draftId,
          owner,
          seriesId,
          input.limit ?? 20,
          input.offset ?? 0
        ),
      };
    }),

  /** Full Draft content is loaded only after an explicit history selection. */
  getDraftHistoryVersion: verticalDramaProcedure
    .input(
      z.object({
        draftId: z.string().uuid(),
        version: z.number().int().positive(),
        seriesId: z.string().trim().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const version = await getVerticalDramaDraftVersion(
        input.draftId,
        input.version,
        {
          tenantId,
          userId: ctx.user.id,
        },
        seriesId
      );
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบ Draft version นี้ หรือคุณไม่มีสิทธิ์เข้าถึง",
        });
      }
      return version;
    }),

  archiveDraftJob: verticalDramaProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const archived = await archiveVerticalDramaDraftJob(input.jobId, {
        tenantId,
        userId: ctx.user.id,
      });
      if (!archived) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบ Draft Job ที่ต้องการเก็บออกจากรายการ",
        });
      }
      return { ok: true };
    }),

  archiveStaleDraftJobs: verticalDramaProcedure
    .input(
      z.object({
        olderThanDays: verticalDramaStaleDraftDaysSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const archivedCount = await archiveVerticalDramaStaleDraftJobs(
        { tenantId, userId: ctx.user.id },
        input.olderThanDays
      );
      return { ok: true, archivedCount };
    }),

  cancelDraftJob: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const owner = { tenantId, userId: ctx.user.id };
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const job = await getVerticalDramaDraftLedger(input.jobId, owner);
      if (!job || job.seriesId !== seriesId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft Job not found",
        });
      }
      if (job.compositionJobId) {
        await cancelVerticalDramaDraftComposition(
          job.compositionJobId,
          owner,
          seriesId
        );
      }
      if (job.qcRunId) {
        await cancelVerticalDramaDraftQualityQc(job.qcRunId, owner, seriesId);
      }
      await updateVerticalDramaDraftJob(input.jobId, owner, {
        jobStatus: "cancelled",
        lastError: "ยกเลิกโดยผู้สร้าง",
      });
      return { ok: true };
    }),

  cancelDraftQualityQc: verticalDramaProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const cancelled = await cancelVerticalDramaDraftQualityQc(
        input.runId,
        {
          tenantId,
          userId: ctx.user.id,
        },
        seriesId
      );
      if (!cancelled) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft QC run not found",
        });
      }
      return { ok: true };
    }),

  /**
   * Durable pre-QC composition for the Create-Series Wizard. The request only
   * admits work and returns a job id; all LLM work happens in the worker so a
   * Cloudflare/HTTP timeout cannot strand a successful draft.
   */
  startDraftComposition: verticalDramaProcedure
    .input(
      synthesizeGenrePresetInput.extend({
        draftSessionId: z.string().trim().min(1).max(120),
        planningSeriesId: z.string().trim().min(1),
        /** Explicit wizard selection; null/omitted means automatic routing. */
        defaultModelId: z.string().trim().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const planningSeriesNumber = Number(input.planningSeriesId);
      if (
        !Number.isInteger(planningSeriesNumber) ||
        planningSeriesNumber <= 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid planning series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, planningSeriesNumber);
      const flags = await getTenantFeatureFlags(tenantId);
      const useV2 = flags.verticalDramaSeriesPresetMixV2 === true;
      const selectedProfile = input.seriesProfileId
        ? getSeriesProfile(input.seriesProfileId)
        : undefined;
      let sourcePackDigest: Record<string, unknown> | undefined;
      if (selectedProfile?.sourceGatePolicy === "required") {
        if (!input.sourcePackId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Complete Story Sources & Media before drafting",
          });
        }
        const sourcePack = await assertSourcePackDraftReady(
          { tenantId, userId: ctx.user.id },
          input.sourcePackId
        );
        if (sourcePack.pack.profileId !== selectedProfile.profileId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Source Pack profile does not match the selected profile",
          });
        }
        sourcePackDigest = (await buildStoredSourcePackDigest(
          { tenantId, userId: ctx.user.id },
          input.sourcePackId
        )) as unknown as Record<string, unknown>;
        sourcePackDigest = {
          ...sourcePackDigest,
          brollManifest: await buildStoredSourcePackBrollManifest(
            { tenantId, userId: ctx.user.id },
            input.sourcePackId
          ),
        };
        if (planningSeriesNumber !== undefined) {
          const visualSourceSnapshot = await captureSeriesVisualSourceSnapshot(
            { tenantId, userId: ctx.user.id },
            planningSeriesNumber
          );
          if (visualSourceSnapshot) {
            sourcePackDigest.visualSourceSnapshot = visualSourceSnapshot;
          }
        }
      }
      const selectedPresetIds = Array.from(
        new Set(input.selectedPresetIds ?? [])
      );
      const selectionIds = Array.from(
        new Set((input.selections ?? []).map(selection => selection.presetId))
      );
      const allPresetIds = Array.from(
        new Set([...selectedPresetIds, ...selectionIds])
      );
      const numericIds = allPresetIds.map(Number);
      if (numericIds.some(id => !Number.isFinite(id)))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid preset id",
        });
      const rows: VerticalDramaGenrePresetRow[] = await db
        .select()
        .from(verticalDramaGenrePresets)
        .where(
          and(
            eq(verticalDramaGenrePresets.locale, input.locale ?? "th"),
            tenantId
              ? or(
                  eq(verticalDramaGenrePresets.scope, "global"),
                  and(
                    eq(verticalDramaGenrePresets.scope, "private"),
                    eq(verticalDramaGenrePresets.tenantId, tenantId),
                    eq(verticalDramaGenrePresets.userId, ctx.user.id)
                  )
                )
              : eq(verticalDramaGenrePresets.scope, "global")
          )
        )
        .orderBy(asc(verticalDramaGenrePresets.sortOrder));
      const byId = new Map(rows.map(row => [String(row.id), row]));
      const selectedRows = allPresetIds
        .map(id => byId.get(id))
        .filter((row): row is VerticalDramaGenrePresetRow => Boolean(row));
      if (selectedRows.length !== allPresetIds.length)
        throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
      const userPremise =
        flags.verticalDramaUserPremise === true ? input.userPremise : undefined;
      const visualNarrativeEnabled =
        flags.verticalDramaSeriesLookLock === true &&
        input.visualNarrativeEnabled === true &&
        input.lookLockMode !== "none";
      const selectedPresets = selectedRows.map(row => ({
        ...toGenrePresetDto(row),
        visualIdentityJson:
          row.visualIdentityJson as VerticalDramaPresetVisualIdentity | null,
      }));
      let model: string;
      if (input.defaultModelId != null) {
        try {
          await assertVerticalDramaRecommendedDraftModel(input.defaultModelId);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : `Model "${input.defaultModelId}" is not eligible for this planning stage`,
          });
        }
        model = input.defaultModelId;
      } else {
        model = await resolveVerticalDramaRecommendedDraftModel();
      }
      const result = await enqueueVerticalDramaDraftComposition(
        {
          tenantId,
          userId: ctx.user.id,
          model,
          draftSessionId: input.draftSessionId,
          seriesId: planningSeriesNumber,
          // Persist the creator's raw source independently of feature flags.
          // `synthesis.userPremise` is intentionally server-gated for model
          // behavior, but recovery must never lose what the creator typed.
          requestJson: {
            synthesis: {
              locale: input.locale ?? "th",
              spokenLocale: input.spokenLocale ?? "auto",
              audienceAgeRating: input.audienceAgeRating,
              seriesTitleHint: input.seriesTitleHint,
              genreHint: input.genreHint,
              toneHint: input.toneHint,
              targetEpisodeCount: input.targetEpisodeCount,
              userPremise: input.userPremise ?? "",
              selectedPresetIds: allPresetIds,
              selectedCategories: input.selectedCategories ?? [],
              primarySelectionId: input.primarySelectionId,
              selections: input.selections,
              businessContext: input.businessContext,
              productContext: input.productContext,
              lineageContext: input.lineageContext,
              visualNarrativeEnabled: input.visualNarrativeEnabled,
              lookLockMode: input.lookLockMode,
              lookLockGenreKey: input.lookLockGenreKey,
              seriesProfileId: input.seriesProfileId,
              sourcePackId: input.sourcePackId,
              defaultModelId: input.defaultModelId ?? null,
            },
          },
          synthesis: {
            locale: input.locale ?? "th",
            selectedPresets,
            selectedCategories: Array.from(
              new Set(
                (input.selectedCategories ?? [])
                  .map(item => item.trim())
                  .filter(Boolean)
              )
            ),
            primarySelectionId: input.primarySelectionId,
            selections: input.selections,
            useV2,
            businessContext: input.businessContext,
            productContext: input.productContext,
            targetEpisodeCount: input.targetEpisodeCount,
            toneHint: input.toneHint,
            seriesTitleHint: input.seriesTitleHint,
            genreHint: input.genreHint,
            userPremise,
            audienceAgeRating: input.audienceAgeRating,
            dialogueLanguageProfile: input.spokenLocale
              ? buildVerticalDramaSpokenLanguageProfile(input.spokenLocale)
              : undefined,
            lineageContext: input.lineageContext,
            visualNarrativeEnabled,
            visualNarrativeIdentity:
              input.lookLockMode === "genre" && input.lookLockGenreKey
                ? getSeriesLookLockGenreIdentity(input.lookLockGenreKey)
                : undefined,
            seriesProfileId: input.seriesProfileId,
            sourcePackDigest,
          },
        },
        {
          persistJob: ensureVerticalDramaDraftJob,
          persistJobStatus: updateVerticalDramaDraftJob,
        }
      );
      return result;
    }),

  getDraftCompositionStatus: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const owner = {
        tenantId,
        userId: ctx.user.id,
      };
      const record = await getVerticalDramaDraftCompositionStatus(
        input.jobId,
        owner,
        seriesId
      );
      if (record) {
        let recoveredResult = record.result ?? undefined;
        if (!recoveredResult && record.status === "failed") {
          const ledger = await getVerticalDramaDraftLedger(input.jobId, owner);
          if (ledger) {
            recoveredResult = recoveredDraftCompositionStatus(ledger).result as
              | VerticalDramaDraftCompositionResult
              | undefined;
          }
        }
        return {
          status: record.status,
          progress: record.progress,
          // A failed composition can still have a durable partial Draft. Keep
          // it available for diagnostic QC rather than forcing regeneration.
          result: recoveredResult,
          error:
            record.status === "failed"
              ? (record.error ?? undefined)
              : undefined,
          failure: record.status === "failed" ? record.failure : undefined,
          jobId: record.jobId,
          requestFingerprint: record.requestFingerprint,
        };
      }
      const ledger = await getVerticalDramaDraftLedger(input.jobId, owner);
      if (!ledger || ledger.seriesId !== seriesId || ledger.seriesDeletedAt)
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "ไม่พบงาน Draft นี้ในคิวหรือฐานข้อมูลถาวร งานอาจยังไม่ถูกบันทึกหรือถูกลบตามนโยบายเก็บรักษา",
        });
      return recoveredDraftCompositionStatus(ledger);
    }),

  cancelDraftComposition: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        seriesId: z.string().trim().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const seriesId = Number(input.seriesId);
      if (!Number.isInteger(seriesId) || seriesId <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      }
      await loadActiveOwnedSeries(tenantId, ctx.user.id, seriesId);
      const cancelled = await cancelVerticalDramaDraftComposition(
        input.jobId,
        {
          tenantId,
          userId: ctx.user.id,
        },
        seriesId
      );
      if (!cancelled)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft composition job not found",
        });
      return { ok: true };
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
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      return enqueueVerticalDramaInteractiveJob({
        kind: "preset_synthesis",
        tenantId,
        userId,
        scopeKey: `preset:${userId}`,
        skillSlug: "vertical-drama-preset-synthesizer",
        input,
      });
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
      const lookLockEnabled = flags?.verticalDramaSeriesLookLock === true;
      const visualNarrativeEnabled =
        lookLockEnabled &&
        input.visualNarrativeEnabled === true &&
        input.lookLockMode !== "none";
      // Never trust a client-supplied visual identity. A genre look is resolved
      // from the server-owned catalog; inherited/preset looks are resolved from
      // the visible preset rows below by the synthesis service.
      const visualNarrativeIdentity =
        visualNarrativeEnabled &&
        input.lookLockMode === "genre" &&
        input.lookLockGenreKey
          ? getSeriesLookLockGenreIdentity(input.lookLockGenreKey!)
          : undefined;
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
          const model = await resolveVerticalDramaRecommendedDraftModel();
          const result = await synthesizeVerticalDramaPreset({
            userId,
            model,
            tenantId: tenantId ?? undefined,
            locale: normalizeVerticalDramaSeriesLocale(locale),
            selectedPresets: selectedRows.map(row => ({
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
            dialogueLanguageProfile: input.spokenLocale
              ? buildVerticalDramaSpokenLanguageProfile(input.spokenLocale)
              : undefined,
            visualNarrativeEnabled,
            visualNarrativeIdentity,
          });
          return result;
        } catch (error) {
          if (error instanceof PresetSynthesisInputError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: String(error),
            });
          }
          if (error instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: String(error) });
          }
          if (error instanceof VdSchemaValidationError) {
            throw new TRPCError({
              code: "UNPROCESSABLE_CONTENT",
              message: String(error),
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: String(error),
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
        const model = await resolveVerticalDramaRecommendedDraftModel();
        const result = await synthesizeVerticalDramaPresetV2({
          userId,
          model,
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
          dialogueLanguageProfile: input.spokenLocale
            ? buildVerticalDramaSpokenLanguageProfile(input.spokenLocale)
            : undefined,
          visualNarrativeEnabled,
          visualNarrativeIdentity,
        });
        return result;
      } catch (error) {
        if (error instanceof PresetSynthesisInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: String(error) });
        }
        if (error instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: String(error) });
        }
        if (error instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "UNPROCESSABLE_CONTENT",
            message: String(error),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: String(error),
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
      return enqueueVerticalDramaInteractiveJob({
        kind: "lineage_carry_over",
        tenantId,
        userId,
        scopeKey: `lineage:${parentSeriesIdNum}`,
        skillSlug: "vertical-drama-season-carry-over-planner",
        idempotencyKey: `carry-over:${parentSeriesIdNum}:${input.premise ?? ""}`,
        input,
      });
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
      return enqueueVerticalDramaInteractiveJob({
        kind: "special_edition_brief",
        tenantId,
        userId,
        scopeKey: `special:${parentSeriesIdNum}`,
        skillSlug: "vertical-drama-special-edition-planner",
        idempotencyKey: `special:${parentSeriesIdNum}:${input.targetEpisodeCount}:${input.storyFunctionChoice}:${input.marketplaceProductName ?? ""}:${input.uploadedSummary ?? ""}`,
        input,
      });
    }),

  /**
   * Expand an owned series' wizard-gathered bible into a full season/episode
   * story bible via a real LLM call. Unlike `create`/`updateSeries`, this is
   * a genuinely paid action (credit-gated) — the first real generation step
   * in this feature area. Ownership enforced; writes the result back into
   * the existing `bible` jsonb column (no schema change needed).
   */
  generateStoryBible: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
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

      // The story plan is a paid, provider-bound LLM operation. Submit it to
      // the durable story queue and return immediately; the worker owns the
      // generation, persistence, assurance validation and billing.
      await loadOwnedSeries(tenantId, userId, seriesId);
      return enqueueVerticalDramaStoryJob({
        kind: "plan",
        tenantId,
        userId,
        seriesId,
        input: { idempotencyKey: input.idempotencyKey },
      });
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
      let bible = (row.bible as Record<string, unknown> | null) ?? {};
      await enforceSeriesSourcePackDraftGate(tenantId, userId, seriesId, bible);
      bible = await ensureLongFormRelationshipGraph(
        tenantId,
        userId,
        seriesId,
        row,
        bible
      );
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
        item =>
          inspectVerticalDramaEpisodeCompletion({
            episodeNumber: item.episodeNumber,
            shotDrafts: readItemShotDrafts(item),
          }) !== null
      );
      if (remainingToDraft.length === 0) {
        // Pinned contract: this mutation's return type is now a union of
        // `{ jobId, deduped, alreadyComplete: false }` (normal path, below)
        // and `{ jobId: null, deduped: false, alreadyComplete: true }` (this
        // early-complete path). Both branches share the same three keys so
        // tRPC/TS infer one consistent object shape; the client narrows on
        // `!jobId` to detect this case and must not attempt to poll it.
        return {
          jobId: null,
          deduped: false,
          alreadyComplete: true as const,
          runId: null,
        };
      }

      await ensureStoryJobCreditsAvailable(
        userId,
        // Credit precheck scoped to REMAINING (undrafted) episodes, not the
        // full horizon — see the doc comment above. Already-drafted episodes
        // inside the horizon must never count against the user's credit
        // balance for this run.
        estimateDeepDraftJobCredits(remainingToDraft.length, mode)
      );

      let assuranceRunId: string | null = null;
      const assuranceIdempotencyKey = buildDeepStoryJobLogicalRunKey({
        prefix: "deep",
        seriesId,
        bible,
        horizon,
        mode,
        suppliedKey: input.idempotencyKey,
      });
      if (isStoryGenerationAssuranceEnabled()) {
        const visualSourceSnapshot = await captureSeriesVisualSourceSnapshot(
          { tenantId, userId },
          seriesId
        );
        const assuranceRun = await admitStoryGenerationRun({
          tenantId,
          userId,
          seriesId,
          taskKind: "deep_generate",
          runKey: `deep_generate:${seriesId}:${assuranceIdempotencyKey}`,
          idempotencyKey: assuranceIdempotencyKey,
          sourceRevision: String(row.updatedAt),
          sourcePayload: { bible, targetEpisodeCount: row.targetEpisodeCount },
          targetEpisodes: remainingToDraft.map(item => item.episodeNumber),
          mode,
          maxEstimatedCredits: estimateDeepDraftJobCredits(
            remainingToDraft.length,
            mode
          ),
          longForm: createLongFormExtensionForBible(
            seriesId,
            row.targetEpisodeCount,
            bible
          ),
          ...(visualSourceSnapshot ? { visualSourceSnapshot } : {}),
        });
        assuranceRunId = assuranceRun.runId;
      }

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "deep_generate",
        seriesId,
        tenantId,
        userId,
        input: {
          horizonEpisodes: input.horizonEpisodes,
          mode,
          idempotencyKey: assuranceIdempotencyKey,
          ...(assuranceRunId ? { runId: assuranceRunId } : {}),
        },
      });
      if (assuranceRunId) {
        await updateStoryGenerationCheckpoint(tenantId, assuranceRunId, {
          checkpoint: {
            legacyJobId: jobId,
            kind: "deep_generate",
            input: {
              horizonEpisodes: input.horizonEpisodes,
              mode,
              idempotencyKey: assuranceIdempotencyKey,
            },
          },
        });
      }
      return {
        jobId,
        deduped,
        alreadyComplete: false as const,
        runId: assuranceRunId,
      };
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
      let bible = (row.bible as Record<string, unknown> | null) ?? {};
      await enforceSeriesSourcePackDraftGate(tenantId, userId, seriesId, bible);
      bible = await ensureLongFormRelationshipGraph(
        tenantId,
        userId,
        seriesId,
        row,
        bible
      );
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

      let assuranceRunId: string | null = null;
      const assuranceIdempotencyKey = buildDeepStoryJobLogicalRunKey({
        prefix: "extend",
        seriesId,
        bible,
        horizon: horizonEnd,
        mode,
        suppliedKey: input.idempotencyKey,
      });
      if (isStoryGenerationAssuranceEnabled()) {
        const visualSourceSnapshot = await captureSeriesVisualSourceSnapshot(
          { tenantId, userId },
          seriesId
        );
        const assuranceRun = await admitStoryGenerationRun({
          tenantId,
          userId,
          seriesId,
          taskKind: "extend",
          runKey: `extend:${seriesId}:${assuranceIdempotencyKey}`,
          idempotencyKey: assuranceIdempotencyKey,
          sourceRevision: String(row.updatedAt),
          sourcePayload: { bible, horizonStart, horizonEnd },
          targetEpisodes: episodesToDraft.map(item => item.episodeNumber),
          mode,
          maxEstimatedCredits: estimateDeepDraftJobCredits(
            episodesToDraft.length,
            mode
          ),
          longForm: createLongFormExtensionForBible(
            seriesId,
            row.targetEpisodeCount,
            bible
          ),
          ...(visualSourceSnapshot ? { visualSourceSnapshot } : {}),
        });
        assuranceRunId = assuranceRun.runId;
      }

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "extend",
        seriesId,
        tenantId,
        userId,
        input: {
          additionalEpisodes: input.additionalEpisodes,
          mode,
          idempotencyKey: assuranceIdempotencyKey,
          ...(assuranceRunId ? { runId: assuranceRunId } : {}),
        },
      });
      if (assuranceRunId) {
        await updateStoryGenerationCheckpoint(tenantId, assuranceRunId, {
          checkpoint: {
            legacyJobId: jobId,
            kind: "extend",
            input: {
              additionalEpisodes: input.additionalEpisodes,
              mode,
              idempotencyKey: assuranceIdempotencyKey,
            },
          },
        });
      }
      return { jobId, deduped, runId: assuranceRunId };
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
   * Repair exactly one sub-episode as a new text/storyboard revision. The
   * worker reads prior memory and a bounded next-episode constraint, then
   * auto-promotes only after the policy/continuity gates pass.
   */
  repairEpisode: verticalDramaDeepStoryDraftsProcedure
    .input(repairEpisodeInput)
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
      const series = await loadOwnedSeries(tenantId, userId, seriesId);
      const [episode] = await db
        .select()
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId),
            eq(verticalDramaEpisodes.episodeNumber, input.episodeNumber)
          )
        )
        .limit(1);
      if (!episode)
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบตอนย่อยนี้" });
      const sourceUpdatedAt =
        episode.updatedAt instanceof Date
          ? episode.updatedAt.toISOString()
          : String(episode.updatedAt);
      const activeBreakdownItem =
        getActiveBreakdown(
          (series.bible as Record<string, unknown> | null) ?? {}
        ).find(item => item.episodeNumber === episode.episodeNumber) ?? null;
      const hasExplicitIdempotencyKey = Boolean(input.idempotencyKey?.trim());
      let idempotencyKey =
        input.idempotencyKey?.trim() ??
        `episode-repair:${episode.id}:${sourceUpdatedAt}`;
      let retryingTerminalRevision = false;
      const [existing] = await db
        .select()
        .from(verticalDramaEpisodeRevisions)
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
            eq(verticalDramaEpisodeRevisions.userId, userId),
            eq(verticalDramaEpisodeRevisions.episodeId, episode.id),
            eq(verticalDramaEpisodeRevisions.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      const existingIsActive =
        existing?.status === "queued" || existing?.status === "running";
      // A terminal revision may still have its historical jobId. Reusing it
      // would immediately return the old failure and skip the skill-first
      // rebuild entirely. Only active jobs are deduped by the default key.
      if (existing?.jobId && existingIsActive) {
        return {
          jobId: existing.jobId,
          revisionId: existing.id,
          deduped: true,
        };
      }
      if (existing && !existingIsActive && hasExplicitIdempotencyKey) {
        // An explicitly supplied key is immutable idempotency history: callers
        // must choose a new key to request a new attempt.
        return {
          jobId: existing.jobId ?? "",
          revisionId: existing.id,
          deduped: true,
        };
      }
      if (existing && !existingIsActive) {
        // The UI omits the key. Allow a failed/reviewed default-key attempt to
        // be retried instead of trapping the user on a terminal revision.
        idempotencyKey = `${idempotencyKey}:retry:${randomUUID()}`;
        retryingTerminalRevision = true;
      }
      const active = await getActiveVerticalDramaStoryJob({
        tenantId,
        seriesId,
      });
      if (active) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "มีงานเนื้อเรื่องของซีรีส์นี้กำลังทำงานอยู่",
        });
      }
      const [latest] = await db
        .select({
          revisionNumber: verticalDramaEpisodeRevisions.revisionNumber,
        })
        .from(verticalDramaEpisodeRevisions)
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
            eq(verticalDramaEpisodeRevisions.userId, userId),
            eq(verticalDramaEpisodeRevisions.seriesId, seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, episode.id)
          )
        )
        .orderBy(desc(verticalDramaEpisodeRevisions.revisionNumber))
        .limit(1);
      const sourceFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            updatedAt: sourceUpdatedAt,
            script: episode.script,
            storyboard: episode.storyboard,
            breakdown: activeBreakdownItem,
          })
        )
        .digest("hex");
      let revision = retryingTerminalRevision ? undefined : existing;
      if (!revision) {
        try {
          [revision] = await db
            .insert(verticalDramaEpisodeRevisions)
            .values({
              tenantId,
              userId,
              seriesId,
              episodeId: episode.id,
              revisionNumber: (latest?.revisionNumber ?? 0) + 1,
              status: "queued",
              idempotencyKey,
              sourceUpdatedAt: episode.updatedAt,
              sourceFingerprint,
            })
            .returning();
        } catch (error) {
          // The unique idempotency index is the authoritative race guard.
          // Re-read the owner-scoped row instead of enqueueing a duplicate.
          const [raced] = await db
            .select()
            .from(verticalDramaEpisodeRevisions)
            .where(
              and(
                eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
                eq(verticalDramaEpisodeRevisions.userId, userId),
                eq(verticalDramaEpisodeRevisions.seriesId, seriesId),
                eq(verticalDramaEpisodeRevisions.episodeId, episode.id),
                eq(verticalDramaEpisodeRevisions.idempotencyKey, idempotencyKey)
              )
            )
            .limit(1);
          if (!raced) throw error;
          revision = raced;
        }
      }
      if (!revision)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "สร้าง revision ไม่สำเร็จ",
        });
      if (revision.jobId)
        return {
          jobId: revision.jobId,
          revisionId: revision.id,
          deduped: true,
        };
      if (
        existing &&
        revision.status !== "queued" &&
        revision.status !== "running"
      ) {
        return { jobId: "", revisionId: revision.id, deduped: true };
      }
      const queued = await enqueueVerticalDramaStoryJob({
        kind: "episode_repair",
        tenantId,
        userId,
        seriesId,
        input: {
          revisionId: revision.id,
          episodeId: episode.id,
          sourceUpdatedAt,
          reason: input.reason,
        },
      });
      await db
        .update(verticalDramaEpisodeRevisions)
        .set({ jobId: queued.jobId, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.id, revision.id),
            eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
            eq(verticalDramaEpisodeRevisions.userId, userId),
            eq(verticalDramaEpisodeRevisions.seriesId, seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, episode.id)
          )
        );
      return {
        jobId: queued.jobId,
        revisionId: revision.id,
        deduped: queued.deduped,
      };
    }),

  listEpisodeRepairRevisions: verticalDramaDeepStoryDraftsProcedure
    .input(
      episodeRepairRevisionRefInput.extend({
        limit: z.number().int().min(1).max(20).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const [episode] = await db
        .select({ id: verticalDramaEpisodes.id })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.id, input.episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .limit(1);
      if (!episode)
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบตอนย่อยนี้" });
      const rows = await db
        .select()
        .from(verticalDramaEpisodeRevisions)
        .where(
          and(
            eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
            eq(verticalDramaEpisodeRevisions.userId, userId),
            eq(verticalDramaEpisodeRevisions.seriesId, seriesId),
            eq(verticalDramaEpisodeRevisions.episodeId, input.episodeId)
          )
        )
        .orderBy(desc(verticalDramaEpisodeRevisions.revisionNumber))
        .limit(input.limit ?? 10);
      return { revisions: rows.map(projectEpisodeRepairRevision) };
    }),

  getEpisodeRepairStatus: verticalDramaDeepStoryDraftsProcedure
    .input(episodeRepairRevisionRefInput)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const where = [
        eq(verticalDramaEpisodeRevisions.tenantId, tenantId),
        eq(verticalDramaEpisodeRevisions.userId, userId),
        eq(verticalDramaEpisodeRevisions.seriesId, seriesId),
        eq(verticalDramaEpisodeRevisions.episodeId, input.episodeId),
        ...(input.revisionId
          ? [eq(verticalDramaEpisodeRevisions.id, input.revisionId)]
          : []),
      ];
      const [row] = await db
        .select()
        .from(verticalDramaEpisodeRevisions)
        .where(and(...where))
        .orderBy(desc(verticalDramaEpisodeRevisions.revisionNumber))
        .limit(1);
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ไม่พบประวัติการซ่อมตอนนี้",
        });
      return projectEpisodeRepairRevision(row);
    }),

  promoteEpisodeRepairRevision: verticalDramaDeepStoryDraftsProcedure
    .input(episodeRepairDecisionInput)
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
      try {
        return await promoteVerticalDramaEpisodeRepairRevision(
          {
            tenantId,
            userId,
            seriesId,
            episodeId: input.episodeId,
          },
          input.revisionId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.includes("NOT_FOUND")
          ? "NOT_FOUND"
          : message.includes("STALE") || message.includes("ALREADY")
            ? "CONFLICT"
            : message.includes("CONTRACT") || message.includes("NOT_READY")
              ? "PRECONDITION_FAILED"
              : "INTERNAL_SERVER_ERROR";
        throw new TRPCError({
          code,
          message: safeEpisodeRepairError(message) ?? message,
        });
      }
    }),

  cancelEpisodeRepairRevision: verticalDramaDeepStoryDraftsProcedure
    .input(episodeRepairDecisionInput)
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
      try {
        return await cancelVerticalDramaEpisodeRepairRevision(
          {
            tenantId,
            userId,
            seriesId,
            episodeId: input.episodeId,
          },
          input.revisionId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new TRPCError({
          code: message.includes("ALREADY")
            ? "CONFLICT"
            : "INTERNAL_SERVER_ERROR",
          message: "candidate นี้ถูกตัดสินใจไปแล้วหรือไม่พร้อมให้ยกเลิก",
        });
      }
    }),

  /**
   * Owner-scoped forensic evidence for a repair job. Raw model output is
   * intentionally exposed only through this authenticated episode-scoped
   * query, never through the generic story-job status payload.
   */
  listEpisodeRepairAttempts: verticalDramaDeepStoryDraftsProcedure
    .input(
      episodeRepairRevisionRefInput.extend({
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
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
      const [episode] = await db
        .select({ id: verticalDramaEpisodes.id })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.id, input.episodeId),
            eq(verticalDramaEpisodes.tenantId, tenantId),
            eq(verticalDramaEpisodes.userId, userId),
            eq(verticalDramaEpisodes.seriesId, seriesId)
          )
        )
        .limit(1);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบตอนย่อยนี้" });
      }
      const rows = await listVerticalDramaEpisodeRepairAttempts({
        tenantId,
        userId,
        seriesId,
        episodeId: input.episodeId,
        revisionId: input.revisionId,
        limit: input.limit ?? 100,
      });
      return {
        attempts: rows.map(row => ({
          id: row.id,
          revisionId: row.revisionId,
          jobId: row.jobId,
          attemptNumber: row.attemptNumber,
          stage: row.stage,
          skillSlug: row.skillSlug,
          planningAttemptNumber: row.planningAttemptNumber,
          model: row.model,
          providerName: row.providerName,
          providerCallId: row.providerCallId,
          outcome: row.outcome,
          rawOutput: row.rawOutput,
          rawOutputHash: row.rawOutputHash,
          rawOutputTruncated: row.rawOutputTruncated,
          parsedOutput: row.parsedOutput,
          responseMetadata: row.responseMetadata,
          physicalAttempts: row.physicalAttempts,
          promptHash: row.promptHash,
          systemPromptLength: row.systemPromptLength,
          userPromptLength: row.userPromptLength,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          finishReason: row.finishReason,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
          safetyFindings: row.safetyFindings,
          schemaIssues: row.schemaIssues,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          createdAt: row.createdAt,
        })),
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

      let assuranceRunId: string | null = null;
      const assuranceIdempotencyKey =
        input.idempotencyKey ??
        `improve:${seriesId}:${row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)}:${draftedEpisodeCount}`;
      if (isStoryGenerationAssuranceEnabled()) {
        const visualSourceSnapshot = await captureSeriesVisualSourceSnapshot(
          { tenantId, userId },
          seriesId
        );
        const assuranceRun = await admitStoryGenerationRun({
          tenantId,
          userId,
          seriesId,
          taskKind: "repair",
          runKey: `improve_script:${seriesId}:${assuranceIdempotencyKey}`,
          idempotencyKey: assuranceIdempotencyKey,
          sourceRevision: String(row.updatedAt),
          sourcePayload: {
            bible,
            userRevisionRequest: input.userRevisionRequest,
          },
          targetEpisodes: existingItems
            .filter(item => readItemShotDrafts(item) !== null)
            .map(item => item.episodeNumber),
          objective:
            "Improve the existing story while preserving the accepted plan",
          mode: "premium",
          maxEstimatedCredits:
            estimateImproveScriptJobCredits(draftedEpisodeCount),
          ...(visualSourceSnapshot ? { visualSourceSnapshot } : {}),
        });
        assuranceRunId = assuranceRun.runId;
      }

      const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
        kind: "improve_script",
        seriesId,
        tenantId,
        userId,
        input: {
          userRevisionRequest: input.userRevisionRequest,
          idempotencyKey: input.idempotencyKey,
          ...(assuranceRunId ? { runId: assuranceRunId } : {}),
        },
      });
      if (assuranceRunId) {
        await updateStoryGenerationCheckpoint(tenantId, assuranceRunId, {
          checkpoint: {
            legacyJobId: jobId,
            kind: "improve_script",
            input: {
              userRevisionRequest: input.userRevisionRequest,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
      }
      return { jobId, deduped, runId: assuranceRunId };
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
        checkpoint: record.checkpoint
          ? {
              draftedEpisodeNumbers: record.checkpoint.completedEpisodeNumbers,
              draftedCount: record.checkpoint.completedEpisodeNumbers.length,
              planStage: record.checkpoint.planStage,
              planCandidateSaved: record.checkpoint.planCandidate !== undefined,
              updatedAt: record.checkpoint.updatedAt,
            }
          : undefined,
        recoveryAttempts: record.recoveryAttempts ?? 0,
        updatedAt: record.updatedAt,
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
   * caller must pass `confirmName` matching the series title exactly after
   * Unicode NFC normalization and outer-whitespace trimming (still
   * case-sensitive) or the mutation is rejected before any row is touched.
   * This mirrors the client's "type the series name to confirm" dialog so a
   * scripted/replayed request can't skip that guard.
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

      const normalizedConfirmName = input.confirmName.normalize("NFC").trim();
      const normalizedSeriesTitle = row.title.normalize("NFC").trim();
      if (
        normalizedConfirmName.length === 0 ||
        normalizedConfirmName !== normalizedSeriesTitle
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Series name confirmation does not match — deletion aborted",
        });
      }

      const counts = await db.transaction(async tx => {
        const draftsToCancel = await tx
          .select({
            id: verticalDramaDraftLedgers.id,
            compositionJobId: verticalDramaDraftLedgers.compositionJobId,
            qcRunId: verticalDramaDraftLedgers.qcRunId,
            draftSessionId: verticalDramaDraftLedgers.draftSessionId,
          })
          .from(verticalDramaDraftLedgers)
          .where(
            and(
              eq(verticalDramaDraftLedgers.tenantId, tenantId),
              eq(verticalDramaDraftLedgers.userId, userId),
              eq(verticalDramaDraftLedgers.seriesId, seriesId),
              isNull(verticalDramaDraftLedgers.seriesDeletedAt)
            )
          )
          .for("update");

        // Preserve immutable Draft/QC history while making the deletion
        // visible to legacy migration and every worker write path.
        if (draftsToCancel.length > 0) {
          await tx
            .update(verticalDramaDraftLedgers)
            .set({
              seriesId: null,
              seriesDeletedAt: new Date(),
              jobStatus: "cancelled",
              lastError: "Series deleted",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(verticalDramaDraftLedgers.tenantId, tenantId),
                eq(verticalDramaDraftLedgers.userId, userId),
                eq(verticalDramaDraftLedgers.seriesId, seriesId),
                isNull(verticalDramaDraftLedgers.seriesDeletedAt)
              )
            );
        }

        const detachedSourcePacks = await tx
          .update(verticalDramaSourcePacks)
          .set({
            seriesId: null,
            attachedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaSourcePacks.tenantId, tenantId),
              eq(verticalDramaSourcePacks.userId, userId),
              eq(verticalDramaSourcePacks.seriesId, seriesId),
              isNull(verticalDramaSourcePacks.deletedAt)
            )
          )
          .returning({ id: verticalDramaSourcePacks.id });

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

        // Deleting the parent row cascades to execution/content rows. Source
        // packs were detached above so their assets and analyses remain
        // recoverable after the Series is deleted.
        await tx
          .delete(verticalDramaSeries)
          .where(seriesOwnershipWhere(tenantId, userId, seriesId));

        return {
          draftsToCancel,
          draftLedgersTombstoned: draftsToCancel.length,
          sourcePacksDetached: detachedSourcePacks.length,
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

      const { draftsToCancel, ...safeCounts } = counts;
      // The database tombstone is authoritative. Queue cleanup is best effort;
      // a worker that races this transaction is rejected by its ledger guard.
      await Promise.allSettled(
        draftsToCancel.flatMap(draft => [
          draft.compositionJobId
            ? cancelVerticalDramaDraftComposition(
                draft.compositionJobId,
                {
                  tenantId,
                  userId,
                },
                seriesId
              )
            : Promise.resolve(false),
          clearVerticalDramaDraftCompositionPointer(
            draft.draftSessionId,
            {
              tenantId,
              userId,
            },
            seriesId
          ),
          draft.qcRunId
            ? cancelVerticalDramaDraftQualityQc(
                draft.qcRunId,
                {
                  tenantId,
                  userId,
                },
                seriesId
              )
            : Promise.resolve(false),
          clearVerticalDramaDraftQualityQcPointer(
            draft.draftSessionId,
            {
              tenantId,
              userId,
            },
            seriesId
          ),
        ])
      );
      return { deleted: true, seriesId: input.seriesId, ...safeCounts };
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
            bgm:
              input.bgm && "tracks" in input.bgm
                ? {
                    tracks: input.bgm.tracks.map((track, index) => ({
                      ...track,
                      id: track.id ?? `track-${index + 1}`,
                    })),
                  }
                : input.bgm,
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
          publicUrl: ctx.publicUrl,
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
          tenantId,
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
            tenantId,
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

  /** Feature 152 — durable story-generation run summary. */
  getStoryGenerationRun: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const summary = await getStoryGenerationRunSummary(tenantId, input.runId);
      if (!summary || summary.seriesId !== seriesId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      }
      return summary;
    }),

  /** Feature 152 — validation report is readable independently of polling. */
  getStoryGenerationValidation: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      return {
        runId: row.runId,
        status: row.status,
        report: row.validationReportJson ?? null,
      };
    }),

  /** Feature 152 — resume from the last durable checkpoint. */
  resumeStoryGeneration: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId || row.userId !== userId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      if (row.status !== "partial" && row.status !== "needs_repair") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Story generation run is not resumable",
        });
      }
      await transitionStoryGenerationRun({
        tenantId,
        runId: row.runId,
        to: "running",
        stage: "generation",
      });
      const jobId = await enqueueStoryAssuranceRecoveryJob({
        tenantId,
        runId: row.runId,
        row,
        repair: false,
      });
      return { runId: row.runId, jobId, status: "running" as const };
    }),

  /** Feature 152 — targeted repair reuses the bounded legacy generator adapter. */
  repairStoryGeneration: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId || row.userId !== userId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      if (row.status !== "needs_repair" && row.status !== "partial") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Story generation run has no repairable findings",
        });
      }
      await transitionStoryGenerationRun({
        tenantId,
        runId: row.runId,
        to: "repairing",
        stage: "repair",
      });
      const jobId = await enqueueStoryAssuranceRecoveryJob({
        tenantId,
        runId: row.runId,
        row,
        repair: true,
      });
      return { runId: row.runId, jobId, status: "repairing" as const };
    }),

  /** Feature 152 — explicit approval/rejection for structural repair scope. */
  approveStoryGenerationRepair: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId || row.userId !== userId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      if (row.status !== "awaiting_approval")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Story generation run is not awaiting approval",
        });
      await transitionStoryGenerationRun({
        tenantId,
        runId: row.runId,
        to: "repairing",
        stage: "repair",
      });
      const jobId = await enqueueStoryAssuranceRecoveryJob({
        tenantId,
        runId: row.runId,
        row,
        repair: true,
      });
      return { runId: row.runId, jobId, status: "repairing" as const };
    }),

  rejectStoryGenerationRepair: verticalDramaDeepStoryDraftsProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        runId: z.string().min(1),
        reason: z.string().trim().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId || row.userId !== userId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      const summary = await transitionStoryGenerationRun({
        tenantId,
        runId: row.runId,
        to: "needs_repair",
        stage: "repair",
        errorCode: input.reason,
      });
      return {
        runId: row.runId,
        status: summary?.status ?? ("needs_repair" as const),
      };
    }),

  cancelStoryGeneration: verticalDramaDeepStoryDraftsProcedure
    .input(z.object({ seriesId: z.string().min(1), runId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      await loadOwnedSeries(tenantId, userId, seriesId);
      const row = await getStoryGenerationRun(tenantId, input.runId);
      if (!row || Number(row.seriesId) !== seriesId || row.userId !== userId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      await requestStoryGenerationCancellation(tenantId, row.runId);
      const summary = await transitionStoryGenerationRun({
        tenantId,
        runId: row.runId,
        to: "cancelled",
        stage: row.stage as
          | "admission"
          | "context"
          | "generation"
          | "validation"
          | "alignment"
          | "repair"
          | "finalization",
        errorCode: "CANCELLED_BY_USER",
      });
      if (!summary)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Story generation run not found",
        });
      return summary;
    }),

  /** Feature 153: read a bounded, redacted relationship graph page. */
  getCharacterRelationshipGraph: verticalDramaProcedure
    .input(getCharacterRelationshipGraphInput)
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
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const longForm =
        bible.longForm && typeof bible.longForm === "object"
          ? (bible.longForm as Record<string, unknown>)
          : {};
      const rawGraph = longForm.relationshipGraph;
      const parsedGraph =
        rawGraph === undefined
          ? null
          : characterRelationshipGraphSchema.safeParse(rawGraph);
      if (rawGraph !== undefined && parsedGraph && !parsedGraph.success) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Relationship graph needs repair",
        });
      }
      const graph = parsedGraph?.success
        ? (parsedGraph.data as CharacterRelationshipGraph)
        : undefined;
      const parsedCandidateGraph = characterRelationshipGraphSchema.safeParse(
        longForm.candidateRelationshipGraph
      );
      const candidateGraph = parsedCandidateGraph.success
        ? (parsedCandidateGraph.data as CharacterRelationshipGraph)
        : undefined;
      if (!graph) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Relationship graph is not available; generate or repair the story draft first",
        });
      }
      const query: RelationshipGraphQuery = {
        graphRevisionId: input.graphRevisionId,
        episodeNumber: input.episodeNumber,
        episodeRange: input.episodeRange,
        familySide: input.familySide,
        familyGroupId: input.familyGroupId,
        factionId: input.factionId,
        relationTypes: input.relationTypes,
        statuses: input.statuses,
        disclosure: input.disclosure,
        arcId: input.arcId,
        candidateGraphRevisionId: input.candidateGraphRevisionId,
        includeCandidateActiveDiff: input.includeCandidateActiveDiff,
        cursor: input.cursor,
        pageSize: input.pageSize,
        expectedRedactionPolicyFingerprint:
          input.expectedRedactionPolicyFingerprint,
        viewpointCharacterKey: input.viewpointCharacterKey,
      };
      try {
        return queryRelationshipGraph(graph, query, {
          candidateGraph,
          // Secret edges are never returned by this general diagnostic read.
          // A future elevated review surface can use a separate audited scope.
          canViewSecretEdges: false,
          redactionPolicyVersion: String(
            longForm.relationshipRedactionPolicyVersion ??
              "relationship-redaction-v1"
          ),
          redactionPolicyFingerprint: String(
            longForm.relationshipRedactionPolicyFingerprint ??
              "relationship-redaction-default"
          ),
          viewpointCharacterKey: input.viewpointCharacterKey,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "stale_redaction_policy"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Relationship graph redaction policy is stale",
          });
        }
        if (
          error instanceof Error &&
          error.message === "stale_graph_revision"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Relationship graph revision is stale",
          });
        }
        throw error;
      }
    }),

  /** Feature 153: bounded, explainable pair-path inspection. */
  getCharacterRelationshipPath: verticalDramaProcedure
    .input(getCharacterRelationshipPathInput)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = Number(input.seriesId);
      if (!Number.isFinite(seriesId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid series id",
        });
      const row = await loadOwnedSeries(tenantId, userId, seriesId);
      const bible = (row.bible as Record<string, unknown> | null) ?? {};
      const longForm =
        bible.longForm && typeof bible.longForm === "object"
          ? (bible.longForm as Record<string, unknown>)
          : {};
      const parsedGraph = characterRelationshipGraphSchema.safeParse(
        longForm.relationshipGraph
      );
      const graph = parsedGraph.success
        ? (parsedGraph.data as CharacterRelationshipGraph)
        : undefined;
      if (!graph || graph.graphRevisionId !== input.graphRevisionId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Relationship graph revision is stale",
        });
      const redactionPolicyVersion = String(
        longForm.relationshipRedactionPolicyVersion ??
          "relationship-redaction-v1"
      );
      const redactionPolicyFingerprint = String(
        longForm.relationshipRedactionPolicyFingerprint ??
          "relationship-redaction-default"
      );
      if (
        input.expectedRedactionPolicyFingerprint &&
        input.expectedRedactionPolicyFingerprint !== redactionPolicyFingerprint
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Relationship graph redaction policy is stale",
        });
      }
      return findRelationshipPaths(
        graph,
        input.fromCharacterKey,
        input.toCharacterKey,
        {
          episodeNumber: input.episodeNumber,
          maxHops: input.maxHops,
          maxPaths: input.maxPaths,
          canViewSecretEdges: false,
          viewpointCharacterKey: input.viewpointCharacterKey,
          redactionPolicyVersion,
          redactionPolicyFingerprint,
        }
      );
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
