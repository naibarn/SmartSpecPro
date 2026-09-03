/**
 * Vertical Drama Series — durable character-stock router (spec feature 131,
 * section-05, §7.1 / §7.2 / §7.3).
 *
 * Surfaces the durable per-series character roster AND its reference-asset stock
 * (approval / QC lifecycle) over tRPC. Every procedure is protected (auth
 * required), gated on the `verticalDramaSeries` tenant feature flag (fail-closed),
 * and scoped to the caller's tenant + user + series so a user can never read,
 * attach, approve, or transition another tenant's or user's character/asset.
 *
 * Cross-tenant / cross-user rows are reported as NOT_FOUND (never FORBIDDEN) so
 * the surface never discloses the existence of another owner's data. Illegal
 * state-machine transitions surface as PRECONDITION_FAILED.
 *
 * The character roster (`verticalDramaCharacters`) is owned directly here; the
 * reference-asset stock (link / manifest / approve / transition / stale) is
 * delegated to `verticalDramaCharacterStockService`.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaCharacters,
  verticalDramaEpisodes,
  mediaAssets,
  mediaModels,
  libraryItems,
  apiAuditEvents,
  type VerticalDramaCharacterRow,
} from "../../drizzle/schema";
import { repairStartFramePlanAfterLookDeletion } from "../services/verticalDramaCharacterLookDeletion";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";
import {
  verticalDramaCharacterStockService,
  VerticalDramaCharacterStockError,
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
} from "../services/verticalDramaCharacterStock";
import { isCharacterLockPolicyFailureMessage } from "@shared/verticalDramaSeries/characterLock";
import {
  VERTICAL_DRAMA_CHARACTER_ASSET_STATES,
  VERTICAL_DRAMA_CHARACTER_ANGLE_DIRECTIVES,
  VERTICAL_DRAMA_CHARACTER_ANGLE_ROLES,
  type VerticalDramaCharacterAngleRole,
  type VdCharacterNeedsSetupReason,
} from "@shared/verticalDramaSeries/characterAssets";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  readTargetAudienceRegionFromBible,
  readCharacterRegionOverrideFromData,
  resolveCharacterTargetAudienceRegion,
  isTargetAudienceRegionExplicitlySetInBible,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  verticalDramaCharacterCastingPreferencesSchema,
  buildCharacterCastingPreferencesFingerprint,
  readCharacterCastingPreferencesFromData,
} from "@shared/verticalDramaSeries/characterCasting";
import {
  mediaGenerationService,
  DEFAULT_MODELS,
  resolveExternalMediaReferenceUrls,
} from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import {
  generateCharacterVisualPrompts,
  generateCharacterPortraitCandidates,
  decideCharacterPromptSnapshotReuse,
  InsufficientCreditsError,
  VdSchemaValidationError,
  extractAgeFromDescription,
  shouldRequireAgeStageVariantForRequest,
  resolveFaceSourceReferenceForCharacter,
} from "../services/verticalDramaCharacterImageGeneration";
import {
  buildCharacterCandidateSingleImageRenderPrompt,
  generateCharacterReferenceCastingPrompt,
  CHARACTER_CANDIDATE_PROMPT_MAX_REFERENCES,
  type CharacterCandidateCameraFraming,
  type CharacterCandidatePoseMode,
} from "../services/verticalDramaCharacterReferenceCasting";
import { buildAgeStageVariantRequiredMessage } from "@shared/verticalDramaSeries/ageStageVariant";
import {
  VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION,
  VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
  isTargetVerticalDramaCharacterCapability,
  normalizeVerticalDramaCharacterPromptRequest,
  resolveVerticalDramaCharacterPromptCapability,
  VerticalDramaCharacterPromptContractError,
  type VerticalDramaCharacterPromptCapability,
} from "../services/verticalDramaCharacterPromptContract";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { verticalDramaCharacterPromptLimiter } from "../services/verticalDramaCharacterPromptRateLimiter";
import {
  enqueueVerticalDramaCharacterPromptJob,
  getActiveVerticalDramaCharacterPromptJob,
  getVerticalDramaCharacterPromptJobStatus,
  isVerticalDramaCharacterPromptWorkerExecution,
  type VerticalDramaCharacterPromptJobInput,
  type VerticalDramaCharacterPromptJobPayload,
} from "../services/verticalDramaCharacterPromptJobs";
import { createAssetFromAttachment } from "../services/mediaAssetService";
import {
  ensureVerticalDramaManagedMediaAsset,
  extractVerticalDramaManagedMediaKey,
  ingestVerticalDramaMediaAsset,
} from "../services/verticalDramaMediaAssetService";
import {
  getTransientMediaPollRetryHint,
  getUnifiedMediaTask,
} from "../services/mediaTaskPollingService";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import { resolveMediaTransport } from "../services/mediaTransportResolver";
import { normalizeMcpProviderModelIdForProvider } from "../services/mcpProviderModelAliases";
import {
  resolveMcpRouteFromModelId,
  defaultMcpArgumentShape,
} from "../services/mcpModelRouteResolver";
import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
// Feature 135 — Hermes Grok media worker (section 09). Pure string helper
// only (no DB import) — see this file's `resolveVdCharacterMediaTransportDecision`.
import { formatHermesErrorMessage } from "../../shared/hermesMedia";
import {
  getModelsByTypeAsync,
  isDbModelCatalogLoaded,
} from "../services/modelRegistry";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  applySeriesLookToImagePrompt,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  looksLikeCharacterLookStoryLeak,
  normalizeVerticalDramaCharacterLookImageBrief,
} from "@shared/verticalDramaSeries/characterLookSelection";
import {
  VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
  recordSeriesLookLockAuditEvent,
} from "../services/verticalDramaSeriesLookLockAudit";
import { verticalDramaApprovedCharacterDesignSnapshotSchema } from "@shared/verticalDramaSeries/characterProfile";
import { resolveCharacterCastingAgeProfile } from "@shared/verticalDramaSeries/characterCastingAge";
import {
  mergeCharacterIdentityDnaData,
  readCharacterIdentityDna,
  readCharacterVisualBibleAgeRange,
  readCharacterIdentityDnaRevision,
  verticalDramaCharacterIdentityDnaEditSchema,
} from "@shared/verticalDramaSeries/characterDnaEditor";
import { loadCharacterDesignContext } from "../services/verticalDramaCharacterDesignContext";
import { persistCharacterVisualBible } from "../services/verticalDramaCharacterDnaPersistence";
// `normalizeStoryCharacterName` is a lightweight, DB-free string helper (see
// its own doc comment) — safe as a static import.
import { normalizeStoryCharacterName } from "../services/verticalDramaCharacterRosterAutoRegister";
// `readBibleRefinedCharacterProfiles` is imported from
// `verticalDramaBibleRefinedCharacters.ts` (NOT `verticalDramaStoryBible.ts`
// — see that file's own header doc comment: `verticalDramaStoryBible.ts`'s
// module graph is too heavy for this router's minimal-mock test suites,
// confirmed by a real vitest run) — see `resolveEffectiveCharacterFacts`'s
// own doc comment below for the full story.
import {
  readBibleRefinedCharacterProfiles,
  type VdBibleRefinedCharacter,
} from "../services/verticalDramaBibleRefinedCharacters";
// W12-A voice chain note: `listVoiceCatalog` below reuses the EXACT
// server-side voice-option resolution `media.listModelFieldOptions` already
// implements (dynamic UVoice/provider-API fetch with its own module-level
// cache, merged with static field options) via a real in-process tRPC caller
// into `./media`'s already-exported `mediaRouter` — never a duplicated
// network-calling/caching implementation, and `media.ts` is never modified by
// this router. Imported with a DYNAMIC `import()` INSIDE that procedure
// (never a static top-level import) — `media.ts`'s own module graph pulls in
// `enabledLlmModels.ts` -> `llmProviders.ts`'s `adminProcedure`, which this
// file's existing minimal-mock test suites (`modelSelection.test.ts`,
// `extractDescription.test.ts`) do not export; a static import would break
// them the moment this file loads. Same "dynamic import, never static"
// convention `verticalDramaEpisodes.ts` already documents for the identical
// problem (see that file's Wave-7D `scriptCoverageDetail` doc comment).
import { sanitizeSpeakableLineForDelivery } from "@shared/verticalDramaSeries/dialogueQuality";
import { debugError } from "../_core/logger";
import {
  verticalDramaCharacterVoiceConfigInputSchema,
  type VerticalDramaCharacterVoiceConfig,
  type VerticalDramaVoiceCatalogEntry,
} from "@shared/verticalDramaSeries/voiceCasting";
import {
  narrativeRoleSchema,
  roleProvenanceSchema,
  roleReviewStatusSchema,
  roleTierSchema,
  roleVisualIntentSchema,
  type NarrativeRole,
  type RoleTier,
  type RoleVisualIntent,
  type RoleReviewStatus,
} from "@shared/verticalDramaSeries/narrativeRole";
// F5 manual variant/twin CRUD
// (`planning/vertical-drama-twin-variant-completeness/plan.md` W2) — TYPE-ONLY
// imports only (erased at compile time, no runtime module load) so this
// file's existing minimal-mock test suites are unaffected; the corresponding
// RUNTIME functions (`generateCharacterVariantPlan`/`reconcileCharacterVariantPlan`/
// `extractCharacterRosterDescription`/error classes, plus
// `getActiveBreakdown`/`readItemShotDrafts`/`readItemCliffhangerLine`) are
// loaded via a DYNAMIC `import()` INSIDE `detectCharacterVariantsNow` only —
// see that procedure's own doc comment for why (same convention this file's
// `listVoiceCatalog` already documents for `./media`).
import type {
  StoryScriptLang,
  StoryScriptEpisodeInput,
} from "@shared/verticalDramaSeries/storyScriptText";
import type { CharacterVariantPlannerCharacterInput } from "../services/verticalDramaCharacterVariantPlanner";
import type { VerticalDramaInteractiveJobPayload } from "../services/verticalDramaInteractiveJobs";
import { enqueueVerticalDramaInteractiveJob } from "../services/verticalDramaInteractiveJobs";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                          */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

/** Worker-only executor for the whole-season character analysis actions. */
export async function runCharacterAnalysisInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const seriesId = Number(
    payload.input.seriesId ?? payload.scopeKey.replace(/^series:/, "")
  );
  const seriesRow = await loadOwnedSeries(
    payload.tenantId,
    payload.userId,
    seriesId
  );
  const bible = (seriesRow.bible as Record<string, unknown> | null) ?? {};
  const lang: StoryScriptLang = seriesRow.locale === "th" ? "th" : "en";
  const {
    getActiveBreakdown,
    readItemShotDrafts,
    readItemCliffhangerLine,
    readBibleRefinedCharacterProfiles,
  } = await import("../services/verticalDramaStoryBible");
  const draftedItems = getActiveBreakdown(bible).filter(
    item => readItemShotDrafts(item) !== null
  );
  const episodes: StoryScriptEpisodeInput[] = draftedItems.map(item => ({
    episodeNumber: item.episodeNumber,
    workingTitle: item.workingTitle,
    logline: item.logline,
    keyBeats: item.keyBeats,
    shotDrafts: readItemShotDrafts(item),
    cliffhangerLine: readItemCliffhangerLine(item),
  }));

  if (payload.kind === "character_variants") {
    const {
      generateCharacterVariantPlan,
      reconcileCharacterVariantPlan,
      extractCharacterRosterDescription,
    } = await import("../services/verticalDramaCharacterVariantPlanner");
    const rows: VerticalDramaCharacterRow[] = await db
      .select()
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, payload.tenantId),
          eq(verticalDramaCharacters.userId, payload.userId),
          eq(verticalDramaCharacters.seriesId, seriesId)
        )
      );
    if (!rows.length)
      throw new Error(
        "No characters in the roster to detect variants/twins for"
      );
    const keyById = new Map(rows.map(row => [row.id, row.characterKey]));
    const characters: CharacterVariantPlannerCharacterInput[] = rows.map(
      row => {
        const input: CharacterVariantPlannerCharacterInput = {
          characterKey: row.characterKey,
          name: row.name,
          role: row.role ?? "",
          description: extractCharacterRosterDescription(
            (row.data as Record<string, unknown> | null) ?? null
          ),
        };
        if (row.parentCharacterId != null) {
          const parentKey = keyById.get(row.parentCharacterId);
          if (parentKey) input.existingParentCharacterKey = parentKey;
          if (row.variantLabel) input.existingVariantLabel = row.variantLabel;
        }
        if (row.sharesFaceWithCharacterId != null) {
          const sourceKey = keyById.get(row.sharesFaceWithCharacterId);
          if (sourceKey) input.existingSharesFaceWithCharacterKey = sourceKey;
        }
        return input;
      }
    );
    const plan = await generateCharacterVariantPlan({
      userId: payload.userId,
      tenantId: payload.tenantId,
      seriesId,
      lang,
      characters,
      episodes,
    });
    const summary = await reconcileCharacterVariantPlan(
      { tenantId: payload.tenantId, userId: payload.userId, seriesId },
      plan.plan
    );
    return {
      variantsCreated: summary.createdCharacters.filter(
        c => c.variantLabel !== null
      ).length,
      variantsUpdated: summary.updatedCharacters.length,
      twinsCreated: summary.createdCharacters.filter(
        c => c.variantLabel === null
      ).length,
      createdCharacters: summary.createdCharacters,
      updatedCharacters: summary.updatedCharacters,
      jobId: execution.jobId,
      traceId: execution.traceId,
    };
  }

  const { analyzeCharacterDuplicates } =
    await import("../services/verticalDramaCharacterMerge");
  const bibleCharacters = readBibleRefinedCharacterProfiles(bible).map(c => ({
    name: c.name,
    narrativeRole: c.narrativeRole ?? null,
    roleTier: c.roleTier ?? null,
    occupation: c.occupation ?? null,
  }));
  const result = await analyzeCharacterDuplicates(
    { tenantId: payload.tenantId, userId: payload.userId, seriesId },
    { lang, bibleCharacters, episodes }
  );
  return { ...result, jobId: execution.jobId, traceId: execution.traceId };
}

/**
 * Base procedure for the voice-casting/voice-chain procedures (W12-A, spec
 * feature 131 addendum): the base `verticalDramaSeries` gate PLUS the
 * dedicated `verticalDramaSeriesVoiceChain` flag — mirrors
 * `verticalDramaSeries.ts`'s established "chain a second, feature-specific
 * `requireFeatureFlag` middleware" convention (see
 * `verticalDramaDeepStoryDraftsProcedure`/`verticalDramaArcReplanProcedure`
 * there). Flags-off byte-identical: these are brand-new procedures, so "off"
 * means the procedure throws FORBIDDEN before any handler code runs at all.
 */
const verticalDramaVoiceChainProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesVoiceChain")
);

/** Feature 137 P2 — character angle-pack generation is additive and
 * fail-closed behind the existing video-safe rollout flag. */
const verticalDramaCharacterAnglePackProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaVideoSafeStartFrames")
);

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

const characterPromptLimiter = verticalDramaCharacterPromptLimiter;

function parseId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/**
 * Load the caller-owned series (tenant + user scoped) or throw NOT_FOUND.
 * NOT_FOUND (not FORBIDDEN) is deliberate — never disclose the existence of
 * another tenant's/user's series.
 */
async function loadOwnedSeries(
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
  return row;
}

/** Load a caller-owned character (tenant + user + series scoped) or NOT_FOUND. */
async function loadOwnedCharacter(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterId: number
): Promise<VerticalDramaCharacterRow> {
  const [row] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.id, characterId),
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
  return row;
}

function rejectBaseAdultChildRequest(params: {
  character: VerticalDramaCharacterRow;
  customInstruction?: string | null;
}): void {
  if (
    !shouldRequireAgeStageVariantForRequest({
      role: params.character.role,
      customInstruction: params.customInstruction,
      roleTier: params.character.roleTier as RoleTier | null | undefined,
      parentCharacterId: params.character.parentCharacterId,
      variantType: params.character.variantType as
        | "outfit"
        | "age_stage"
        | null,
    })
  ) {
    return;
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: buildAgeStageVariantRequiredMessage(
      extractAgeFromDescription(params.customInstruction)
    ),
  });
}

/**
 * All `characterKey`s already used in a series (tenant + user scoped) — the
 * dedup universe `generateUniqueCharacterKey` checks against when a manual
 * variant/twin mutation mints a new `characterKey`. Mirrors
 * `reconcileCharacterVariantPlan`'s own `usedKeys` set (built from a full
 * roster `select()` in `verticalDramaCharacterVariantPlanner.ts`), just
 * narrowed to the one column these mutations need.
 */
async function loadSeriesCharacterKeys(
  tenantId: string,
  userId: number,
  seriesId: number
): Promise<Set<string>> {
  const rows = await db
    .select({ characterKey: verticalDramaCharacters.characterKey })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId)
      )
    );
  return new Set(rows.map((row: { characterKey: string }) => row.characterKey));
}

/**
 * Slugify a variant label / twin name into a `characterKey` suffix
 * candidate (lowercase, non-alphanumeric collapsed to `-`, trimmed). Falls
 * back to `"variant"` for labels that are entirely non-alphanumeric (e.g.
 * Thai-only text). Byte-identical duplicate of
 * `verticalDramaCharacterVariantPlanner.ts`'s own `slugifyForCharacterKey` —
 * this codebase's established convention is a small local slugify per file,
 * not a shared util (see that function's own doc comment); this router
 * cannot import it anyway, since it is a private (non-exported) function of
 * that service file.
 */
function slugifyForCharacterKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "variant";
}

/**
 * Appends `-2`, `-3`, ... until `baseKey` is not already present in
 * `usedKeys`; mutates nothing, caller adds the result to `usedKeys` itself.
 * Byte-identical duplicate of `verticalDramaCharacterVariantPlanner.ts`'s own
 * helper of the same name (same non-exported-private reasoning as
 * `slugifyForCharacterKey` above).
 */
function generateUniqueCharacterKey(
  baseKey: string,
  usedKeys: Set<string>
): string {
  const base = baseKey.trim() || "character";
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  return key;
}

/**
 * Best-effort attach of a caller-supplied reference image as a newly-created
 * variant/twin character's `primary_portrait` reference, via the SAME
 * `verticalDramaCharacterStockService.linkAsset` service call the `linkAsset`
 * mutation itself uses (never a duplicated implementation). Deliberately
 * does NOT use `mapStockError` here (unlike `linkAsset`'s own mutation,
 * which propagates a mapped error to the caller) — this helper NEVER throws:
 * the created character row is always the primary result of
 * `createCharacterVariant`/`createCharacterTwin`, and a failed secondary
 * asset attach must not roll back or fail that primary mutation (same
 * "never block the primary mutation" convention as
 * `recordVoiceChainAuditEvent`). Logs via `debugError` on failure so the gap
 * stays observable.
 */
async function bestEffortLinkPrimaryPortrait(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  characterId: number;
  mediaAssetId: number;
  logSource: string;
}): Promise<void> {
  try {
    await verticalDramaCharacterStockService.linkAsset({
      tenantId: params.tenantId,
      userId: params.userId,
      seriesId: params.seriesId,
      characterId: params.characterId,
      mediaAssetId: params.mediaAssetId,
      assetType: "character_reference",
      role: "primary_portrait",
      source: "imported",
      containsHumanFace: null,
      checksumSha256: null,
      metadata: null,
    });
  } catch (error) {
    debugError(
      params.logSource,
      `Failed to auto-attach reference image for newly-created character #${params.characterId} — best-effort, does not fail the create mutation`,
      error
    );
  }
}

/**
 * Resolves the series' stamped preset visual identity for character-prompt
 * flow-through (spec §8.2.2 flow-through rule, section-15 change D) —
 * flag-gated: returns `undefined` (no flow-through, legacy-tolerant
 * behavior) unless the tenant has `verticalDramaSeriesPresetMixV2` enabled.
 * `generateCharacterVisualPrompts`/`buildUserPrompt` in
 * `verticalDramaCharacterImageGeneration.ts` do NOT know about feature
 * flags themselves (same convention as every other flag-gated field on this
 * router) — this is the ONE place the flag is consulted for all 4
 * generation call sites below.
 */
async function resolveCharacterPresetVisualIdentity(
  tenantId: string,
  bible: Record<string, unknown> | null
) {
  const flags = await getTenantFeatureFlags(tenantId);
  const lookLockEnabled = flags.verticalDramaSeriesLookLock === true;
  return {
    identity: resolveEffectiveSeriesVisualIdentity({
      bible,
      presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
      lookLockEnabled,
    }),
    lookLockEnabled,
  };
}

/**
 * Translate a service-level `VerticalDramaCharacterStockError` into the correct
 * tRPC error code. Cross-tenant / cross-user / missing rows become NOT_FOUND so
 * we never disclose another owner's data; illegal transitions surface as
 * PRECONDITION_FAILED.
 */
function mapStockError(err: unknown): never {
  if (err instanceof VerticalDramaCharacterStockError) {
    switch (err.reason) {
      case "media_asset_not_found":
      case "media_asset_cross_tenant":
      case "media_asset_cross_user":
      case "asset_not_found":
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referenced asset not found",
        });
      case "media_asset_deleted":
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      case "illegal_state_transition":
      case "candidate_batch_not_found":
      case "candidate_batch_expired":
      case "candidate_batch_claimed":
      case "candidate_not_ready":
      case "manual_primary_exists":
      case "candidate_integrity_error":
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err.message,
        });
      default:
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
  }
  throw err;
}

/**
 * Resolve the identity-lock reference-portrait URL for a character render
 * (Phase D1 reference picker,
 * `planning/vertical-drama-reference-picker-outfit-lock/plan.md`; widened by
 * Phase F1, `planning/vertical-drama-twin-variant-completeness/plan.md`
 * W1). Three tiers, checked in order:
 *
 * 1. An explicit `referenceAssetLinkId` override takes precedence when
 *    present (routed through `getReferenceImageByAssetLinkId` +
 *    `mapStockError`, same error-mapping convention every other
 *    stock-service call site in this file uses). Its TIER depends on who owns
 *    the pinned link: the render target's own row -> `"explicit"`; any other
 *    row (a look pinning its parent's portrait, a twin pinning its
 *    face-source's) -> `"inherited"`, since a borrowed image is not this
 *    character's own established likeness
 *    (`planning/vd-look-image-not-replace-primary/plan.md` §3).
 * 2. When `referencePolicy` is `"auto"`, fall back to the pre-existing
 *    auto-resolution — this character's own approved portrait via
 *    `getPrimaryPortraitUrl`.
 * 3. If auto tier 2 returns `null` (the character has no portrait of its
 *    own yet — e.g. a brand-new variant/twin on its very first render) AND
 *    `fallbackSourceCharacterId` is supplied (callers pass the character's
 *    `parentCharacterId ?? sharesFaceWithCharacterId`), fall back to that
 *    source character's own portrait via a second `getPrimaryPortraitUrl`
 *    call. A new variant/twin should default to borrowing its source's
 *    identity-lock reference rather than getting zero visual identity lock
 *    on its first render. If the source has no portrait either, returns
 *    `null` as before — nothing more to fall back to.
 *
 * Shared by `generateCharacterImage` and `generateCharacterSheet` so the
 * override contract can never drift between the two call sites. `none` is
 * used by main portrait regeneration and exits before any auto lookup.
 */
export const VERTICAL_DRAMA_CHARACTER_REFERENCE_POLICY_VALUES = [
  "none",
  "auto",
] as const;
export type VerticalDramaCharacterReferencePolicy =
  (typeof VERTICAL_DRAMA_CHARACTER_REFERENCE_POLICY_VALUES)[number];

export async function resolveReferencePortraitUrl(
  owner: { tenantId: string; userId: number; seriesId: number },
  characterId: number,
  referenceAssetLinkId: string | undefined,
  fallbackSourceCharacterId?: number | null,
  referencePolicy: VerticalDramaCharacterReferencePolicy = "auto"
): Promise<string | null> {
  const resolved = await resolveReferencePortraitSource(
    owner,
    characterId,
    referenceAssetLinkId,
    fallbackSourceCharacterId,
    referencePolicy
  );
  return resolved.url;
}

/**
 * Which of `resolveReferencePortraitUrl`'s three tiers actually produced the
 * URL. Callers need this to answer a question the URL alone cannot:
 * **is this image THIS character's own established likeness, or somebody
 * else's borrowed one?**
 *
 * - `"explicit"` — the caller's own `referenceAssetLinkId` override (tier 1),
 *   pointing at one of THIS character's own portraits. A user deliberately
 *   picked this image FOR this character.
 * - `"own"` — this character's own approved portrait (tier 2).
 * - `"inherited"` — somebody else's portrait, borrowed: either the
 *   parent/twin-source's auto-resolved portrait (tier 3, this character has
 *   none of its own yet) or a tier-1 override that points at another
 *   character's row.
 * - `null` — no reference at all.
 *
 * `planning/vd-character-full-body-framing/plan.md` RC2: the two render
 * endpoints used to collapse all three into `hasOwnReferenceImage:
 * Boolean(url)`, which told the skill that a brand-new LOOK's borrowed parent
 * portrait was the look's own definitive likeness. That flips on skill.md's
 * strictest rule — "keep outfit, clothing, accessories, and shoes IDENTICAL
 * to the reference" — for the one flow whose entire purpose is a DIFFERENT
 * outfit, and (because the borrowed portrait is a half-body crop rendered
 * through an image-EDIT call) also pins the new look to the parent's framing.
 * `faceSourceReference` is the correct channel for an inherited likeness: it
 * locks the face while deliberately leaving hair/wardrobe free to diverge.
 */
export type ReferencePortraitSource = "explicit" | "own" | "inherited";

export async function resolveReferencePortraitSource(
  owner: { tenantId: string; userId: number; seriesId: number },
  characterId: number,
  referenceAssetLinkId: string | undefined,
  fallbackSourceCharacterId?: number | null,
  referencePolicy: VerticalDramaCharacterReferencePolicy = "auto"
): Promise<{ url: string | null; source: ReferencePortraitSource | null }> {
  // An explicit asset is always user intent and therefore has precedence over
  // the policy. This is especially important for main portrait generation,
  // whose default policy is `none`: choosing/attaching a reference must still
  // send that exact asset to the provider.
  if (!referenceAssetLinkId && referencePolicy === "none") {
    return { url: null, source: null };
  }

  if (!referenceAssetLinkId) {
    const ownPortraitUrl =
      await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        owner,
        characterId
      );
    if (ownPortraitUrl) return { url: ownPortraitUrl, source: "own" };
    if (fallbackSourceCharacterId != null) {
      const inheritedUrl =
        await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
          owner,
          fallbackSourceCharacterId
        );
      return inheritedUrl
        ? { url: inheritedUrl, source: "inherited" }
        : { url: null, source: null };
    }
    return { url: null, source: null };
  }
  try {
    const override =
      await verticalDramaCharacterStockService.getReferenceImageByAssetLinkId(
        owner,
        parseId(referenceAssetLinkId, "reference asset link id")
      );
    if (!override.url) return { url: null, source: null };
    // An explicit pick of ANOTHER character row's portrait (the picker is
    // series-scoped, so a look can pin its parent's image — and the new
    // per-look re-render dialog offers exactly that as "ใช้ภาพ primary เป็น
    // reference") is a BORROWED likeness, not this character's own. Reporting
    // it as `"explicit"` would set `hasOwnReferenceImage: true`, which turns on
    // skill.md's strictest rule — "keep outfit, clothing, accessories and shoes
    // IDENTICAL to the reference" — for the one flow whose entire purpose is a
    // DIFFERENT outfit. `"inherited"` is the tier that already models exactly
    // this (see `ReferencePortraitSource`); the face stays locked through the
    // independent `faceSourceReference` channel either way.
    const belongsToAnotherCharacter =
      override.characterId != null && override.characterId !== characterId;
    return {
      url: override.url,
      source: belongsToAnotherCharacter ? "inherited" : "explicit",
    };
  } catch (err) {
    mapStockError(err);
  }
}

/**
 * `has_own_reference_image` is TRUE only when the attached reference really is
 * this character's own established likeness — never for a borrowed
 * parent/twin portrait (see `ReferencePortraitSource`). Shared by both render
 * endpoints so the contract can never drift between them.
 */
export function referenceSourceIsOwnLikeness(
  source: ReferencePortraitSource | null
): boolean {
  return source === "explicit" || source === "own";
}

/**
 * Short-lived server-to-server bearer token for the Python media-generation
 * backend, mirroring `server/routers/media.ts`'s `createMediaToken`/
 * `getUserToken` convention exactly: prefer the caller's own session token
 * (so usage attributes correctly), fall back to minting a scoped token.
 */
function createCharacterPortraitMediaToken(
  userId: number,
  tenantId?: string | null
): string {
  return signBearerToken(
    {
      sub: String(userId),
      ...(tenantId ? { tenantId } : {}),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_char_portrait_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m"
  );
}

function getCharacterPortraitUserToken(ctx: {
  userToken: string | null;
  user: { id: number };
  tenantId?: string | null;
}): string {
  return (
    ctx.userToken ||
    createCharacterPortraitMediaToken(ctx.user.id, ctx.tenantId)
  );
}

function readMediaTaskInternalParameter(
  parameters: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!parameters) return undefined;
  const direct = parameters[key];
  if (typeof direct === "string") return direct;
  for (const containerKey of ["extraParams", "extra_params"] as const) {
    const container = parameters[containerKey];
    if (!container || typeof container !== "object" || Array.isArray(container))
      continue;
    const value = (container as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

/**
 * Resolve MCP transport metadata for a character-portrait/turnaround/sheet
 * generation call when the caller-selected image model is MCP-transport
 * (e.g. `higgsfield/*`, `magnific-mcp/*` — billed via the user's connected
 * MCP provider account, not SmartSpec credits). Returns `null` for ordinary
 * gateway_api models, in which case the caller proceeds exactly as before
 * (credit reserve + `generateImageAsync` without `transportMetadata`).
 *
 * Mirrors `verticalDramaEpisodes.ts`'s private `resolveVdMcpTransportMetadata`
 * byte-for-byte (that helper isn't exported, and duplicating it here avoids a
 * cross-router coupling for what is otherwise self-contained logic) — see
 * that function's doc comment for the full rationale on each step.
 */
export async function resolveVdCharacterMcpTransportMetadata(params: {
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

  // Fail closed before calling the transport resolver. The UI requires an
  // explicit connected account for MCP models; accepting an omitted id here
  // would make a model-picker mistake look like a gateway request and could
  // bypass the user's selected transport.
  if (!params.mcpConnectionId?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `MCP connection is required for model "${params.modelId}". Select a connected MCP account and try again.`,
    });
  }
  const transportMetadata = await resolveMediaTransport({
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
  if (!transportMetadata) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `MCP connection is required for model "${params.modelId}". Select a connected MCP account and try again.`,
    });
  }
  return transportMetadata;
}

/**
 * Feature 135 — Hermes Grok media worker (section 09): transport-neutral
 * generalization of `resolveVdCharacterMcpTransportMetadata` above. Returns
 * a discriminated union instead of the old `MediaTaskTransportMetadata |
 * null` shape so a caller can route into `queueHermesMediaJob` (hermes),
 * the existing MCP submit path (mcp), or the existing gateway_api/Python
 * backend path (gateway) — all from ONE call.
 *
 * Design point (do NOT rewrite the MCP logic): this function only detects
 * `resolveMediaModelTransportConfig(...).transport === "hermes_worker"`
 * FIRST; for every other model it delegates to
 * `resolveVdCharacterMcpTransportMetadata` UNCHANGED — non-null becomes
 * `{kind:"mcp"}`, null becomes `{kind:"gateway"}`. That makes the MCP/
 * gateway arms byte-identical to today by construction; the existing
 * exported symbol (and its tests, and `verticalDramaLocations.ts`'s import)
 * are untouched.
 *
 * The episodes twin is `resolveVdMediaTransportDecision` (private) in
 * `verticalDramaEpisodes.ts`, delegating to that file's private
 * `resolveVdMcpTransportMetadata` the same way — keep the two copies
 * byte-equivalent apart from the export keyword and name prefix.
 */
export type VdTransportDecision =
  | { kind: "gateway" }
  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
  | { kind: "hermes"; connectionId: string };

export interface ResolveVdCharacterMediaTransportDecisionDeps {
  /** Injectable for tests; default lazily reads section-03's connection
   *  service so this file's module graph never statically pulls in that
   *  service's own dependencies (mirrors this file's other lazy-import
   *  conventions — see the top-of-file `listVoiceCatalog` doc comment). */
  resolveDefaultHermesConnectionId?: (params: {
    tenantId: string;
    userId: number;
    assetType: "image" | "video";
  }) => Promise<string | null>;
}

async function defaultResolveDefaultHermesConnectionId(params: {
  tenantId: string;
  userId: number;
  assetType: "image" | "video";
}): Promise<string | null> {
  const { listHermesConnections } =
    await import("../services/hermesConnectionService");
  const connections = await listHermesConnections({
    tenantId: params.tenantId,
    userId: params.userId,
    assetType: params.assetType,
  });
  const defaultConnection = connections.find(connection =>
    params.assetType === "image"
      ? connection.defaultForImage
      : connection.defaultForVideo
  );
  return defaultConnection?.id ?? null;
}

export async function resolveVdCharacterMediaTransportDecision(
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
  deps: ResolveVdCharacterMediaTransportDecisionDeps = {}
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
      deps.resolveDefaultHermesConnectionId ??
      defaultResolveDefaultHermesConnectionId;
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

  // Cross-transport rejection (mirrors `mediaTransportResolver.ts`'s
  // "hermesConnectionId requires transport=hermes_worker" rule) — a
  // hermesConnectionId supplied for a non-hermes model must never be
  // silently ignored.
  if (params.hermesConnectionId?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "hermesConnectionId requires transport=hermes_worker",
    });
  }

  const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    assetType: params.assetType,
    modelId: params.modelId,
    configJson: params.configJson,
    mcpConnectionId: params.mcpConnectionId,
    sharedGroupId: params.sharedGroupId,
    idempotencyKey: params.idempotencyKey,
  });
  return transportMetadata
    ? { kind: "mcp", transportMetadata }
    : { kind: "gateway" };
}

/**
 * Resolve the effective image model id for a character generation call:
 * caller-supplied `selectedImageModelId` (validated + must be enabled).
 * FAIL CLOSED: the caller must explicitly select a model — no silent
 * fallback to `DEFAULT_MODELS.image`. (Previously fell back silently; that
 * let generation run on a model the user never chose. See
 * `resolveEpisodeImageModelId` in verticalDramaEpisodes.ts for the same
 * fail-closed convention.) The character tab passes the model per-request,
 * so this only needs to validate, not read a persisted plan.
 */
/**
 * Pick WHICH of the caller's two image models this particular render should
 * use (`planning/vd-character-image-edit-model/plan.md`).
 *
 * A character render is one of two genuinely different jobs, and the strongest
 * model for each is a different model. With no reference image it is
 * text-to-image (kie's `gpt-image-2-text-to-image` is excellent at this). With
 * a reference attached — every look, every twin, every regeneration — the
 * provider call becomes image-to-image / `image.edit`, which that same model
 * is weak at; Seedream 5 Pro or Nano Banana Pro hold identity far better
 * there. One picker forced both jobs onto one model, so whichever the user
 * chose, half their generations ran on the wrong engine.
 *
 * Only the SERVER knows whether a reference will actually be attached (three
 * resolution tiers, incl. the parent-portrait fallback — see
 * `resolveReferencePortraitSource`), so the client sends both choices and this
 * decides. Falls back to `selectedImageModelId` whenever the caller supplied
 * no edit model, which keeps every existing single-picker client byte-identical.
 */
export function pickCharacterRenderModelId(params: {
  hasReferenceImage: boolean;
  selectedImageModelId?: string;
  selectedEditImageModelId?: string;
}): string | undefined {
  const editModelId = params.selectedEditImageModelId?.trim();
  if (params.hasReferenceImage && editModelId) return editModelId;
  return params.selectedImageModelId;
}

export async function resolveCharacterImageModelId(
  selectedImageModelId?: string
): Promise<string> {
  const requested = selectedImageModelId?.trim();
  if (!requested) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "กรุณาเลือกโมเดลภาพก่อนสร้าง / Select an image model before generating.",
    });
  }
  // Validate the caller-supplied model: must exist, must be an image model,
  // and must be enabled (same validation `verticalDramaEpisodes.ts`'s
  // `assertModelSelectable` performs — inlined here, rather than imported
  // from that router, to keep this router's own module graph/test mocks
  // self-contained; both call the same underlying `getModelsByTypeAsync`).
  const models = await getModelsByTypeAsync("image");
  const model = models.find(m => m.id === requested);
  if (!model) {
    // Cold-start / transient-DB guard: when the DB-backed model catalog is not
    // loaded, `getModelsByType` serves only the small static fallback subset
    // (no DB-only models like the higgsfield catalog). Do NOT reject a model we
    // cannot verify yet — trust the caller's selection and let the downstream
    // generation validate it, rather than falsely erroring or swapping a default.
    if (!isDbModelCatalogLoaded()) {
      return requested;
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown image model "${requested}"`,
    });
  }
  if (model.isEnabled === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Model "${requested}" is currently disabled and cannot be selected`,
    });
  }
  return requested;
}

async function resolveCharacterPromptCapabilityForModel(
  modelId: string,
  configJson?: Record<string, unknown> | null
): Promise<VerticalDramaCharacterPromptCapability> {
  let resolvedConfigJson = configJson;
  if (resolvedConfigJson === undefined) {
    const [modelRow] = await db
      .select({ configJson: mediaModels.configJson })
      .from(mediaModels)
      .where(eq(mediaModels.modelId, modelId))
      .limit(1);
    resolvedConfigJson =
      (modelRow?.configJson as Record<string, unknown> | null | undefined) ??
      undefined;
  }
  return resolveVerticalDramaCharacterPromptCapability({
    modelId,
    configJson: resolvedConfigJson,
  });
}

function mapCharacterPromptContractError(error: unknown): never {
  if (error instanceof VerticalDramaCharacterPromptContractError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

function buildCharacterPromptContext(
  capability: VerticalDramaCharacterPromptCapability,
  semanticRetryCount = 0
) {
  const target = isTargetVerticalDramaCharacterCapability(capability);
  return {
    marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
    contractVersion: target
      ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
      : "legacy",
    target,
    family: capability.family,
    maxPromptChars: capability.maxPromptChars,
    promptProfile: capability.promptProfile,
    semanticRetryCount: Math.max(0, Math.floor(semanticRetryCount)),
  } as const;
}

function normalizeCharacterRenderPrompt(params: {
  prompt: string;
  negativePrompt?: string;
  model: string;
  capability: VerticalDramaCharacterPromptCapability;
}) {
  try {
    return normalizeVerticalDramaCharacterPromptRequest(
      {
        prompt: params.prompt,
        ...(params.negativePrompt !== undefined
          ? { negativePrompt: params.negativePrompt }
          : {}),
        model: params.model,
      },
      {
        capability: params.capability,
        marker: VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
        contractVersion: isTargetVerticalDramaCharacterCapability(
          params.capability
        )
          ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
          : null,
      }
    );
  } catch (error) {
    return mapCharacterPromptContractError(error);
  }
}

/**
 * Character Design Bible sheet formats (vertical-drama-character-sheet-
 * consolidation plan) — the merged `generateCharacterSheet` mutation's
 * `sheetType` input. `"auto"` resolves to `"turnaround"` (see
 * `resolveCharacterSheetType`); `"turnaround"`/`"full_combined"` are the two
 * pre-existing formats; the other 11 are new, defined in
 * `skills/vertical-drama-character-visual-bible/skill.md`'s "Character Design
 * Bible sheet types" section.
 */
export const CHARACTER_SHEET_TYPE_VALUES = [
  "auto",
  "turnaround",
  "full_combined",
  "cover",
  "character_profile",
  "face_detail",
  "expression_12",
  "hair_reference",
  "costume_breakdown",
  "material_fabric",
  "color_palette",
  "pose_library",
  "body_proportion",
  "ai_prompt_lock",
] as const;
export type VerticalDramaCharacterSheetType =
  (typeof CHARACTER_SHEET_TYPE_VALUES)[number];
export type ResolvedVerticalDramaCharacterSheetType = Exclude<
  VerticalDramaCharacterSheetType,
  "auto"
>;

/**
 * Resolve `"auto"` (the mutation's default) to `"turnaround"` — preserves
 * today's cheaper/older default behavior for a caller that doesn't pick a
 * specific Character Design Bible format (plan Decision 2). Every other value
 * passes through unchanged.
 */
export function resolveCharacterSheetType(
  sheetType: VerticalDramaCharacterSheetType | undefined
): ResolvedVerticalDramaCharacterSheetType {
  if (!sheetType || sheetType === "auto") return "turnaround";
  return sheetType;
}

/**
 * Maps a resolved sheet type to the `verticalDramaCharacterAssets.role`/
 * `metadata` pair the caller should use once the async render task completes
 * and it calls the existing `linkAsset` mutation (plan Decision 4). Three
 * tiers:
 *  - `"turnaround"` -> the pre-existing `"character_sheet_turnaround"` role
 *    (stays inside `CHARACTER_SHEET_ROLES` in `verticalDramaCharacterStock.ts`
 *    — a real face turnaround, correct to use as a second identity-lock
 *    reference).
 *  - `"full_combined"` -> the pre-existing `"character_sheet_full"` role
 *    (same reasoning).
 *  - every other (new) format -> a brand-new `"character_design_bible"` role,
 *    deliberately OUTSIDE `CHARACTER_SHEET_ROLES` — several of these formats
 *    carry no face at all (e.g. `color_palette`, `material_fabric`), so they
 *    must never be picked as a second identity-lock reference — plus
 *    `metadata: { sheetType }` so the specific format stays recoverable.
 */
export function resolveCharacterSheetAssetTag(
  resolvedType: ResolvedVerticalDramaCharacterSheetType
): { role: string; metadata: { sheetType: string } | null } {
  if (resolvedType === "turnaround") {
    return { role: "character_sheet_turnaround", metadata: null };
  }
  if (resolvedType === "full_combined") {
    return { role: "character_sheet_full", metadata: null };
  }
  return {
    role: "character_design_bible",
    metadata: { sheetType: resolvedType },
  };
}

/**
 * Best-effort character description drawn from `verticalDramaCharacters.data`
 * (the free-form `VerticalDramaCharacter` payload — description/personality/
 * backstory/identityLock/wardrobeRules). `data.description` is the
 * authoritative source for core physical/demographic traits (age, gender,
 * defining features — e.g. "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย...") that MUST
 * reach the visual-bible/portrait prompt builder; it is deliberately placed
 * FIRST in the aggregated string so it leads (not trails) personality/
 * backstory prose, since a downstream LLM call can otherwise under-weight or
 * ignore later-listed traits and invent an unconstrained identity (e.g.
 * rendering an adult when the character is a 12-year-old boy).
 * Returns `undefined` when nothing usable is present.
 */
export function extractCharacterDescription(
  data: Record<string, unknown> | null
): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (
    typeof data.description === "string" &&
    data.description.trim() &&
    !looksLikeCharacterLookStoryLeak(data.description)
  ) {
    parts.push(`Description: ${data.description.trim()}`);
  }
  if (typeof data.personality === "string" && data.personality.trim()) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (typeof data.backstory === "string" && data.backstory.trim()) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (typeof data.identityLock === "string" && data.identityLock.trim()) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string =>
        typeof rule === "string" &&
        rule.trim().length > 0 &&
        !looksLikeCharacterLookStoryLeak(rule)
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  // System-suggested look slots carry a bounded, concrete image brief so a
  // one-line label such as "ชุดนอน" does not leave the portrait model free to
  // invent the wardrobe, crop, lighting, or identity. User-authored fields
  // above remain first and therefore retain precedence.
  const lookImageBrief = looksLikeCharacterLookStoryLeak(data.lookImageBrief)
    ? undefined
    : normalizeVerticalDramaCharacterLookImageBrief(data.lookImageBrief);
  if (lookImageBrief) {
    parts.push(`Look image brief: ${lookImageBrief}`);
  }
  // A previous review-required repair could persist the visual bible while
  // dropping the derived look fields. Keep those rows renderable until the
  // repair is run again, but only use visual-only fields; never pull story
  // relationship or narrative prose into an image prompt.
  if (!lookImageBrief) {
    const lookDesign =
      data.lookDesign &&
      typeof data.lookDesign === "object" &&
      !Array.isArray(data.lookDesign)
        ? (data.lookDesign as Record<string, unknown>)
        : null;
    const visualBible =
      data.visualBible &&
      typeof data.visualBible === "object" &&
      !Array.isArray(data.visualBible)
        ? (data.visualBible as Record<string, unknown>)
        : null;
    const visualBiblePrompt = [
      visualBible?.visualIdentitySummary,
      visualBible?.signatureWardrobe,
      visualBible?.hairMakeupNotes,
      visualBible?.consistencyStrategy,
      visualBible?.colorPalette,
      ...(Array.isArray(visualBible?.identityAnchors)
        ? visualBible?.identityAnchors
        : []),
      ...(Array.isArray(visualBible?.forbiddenDrift)
        ? visualBible.forbiddenDrift.map(value => `Avoid: ${value}`)
        : []),
    ]
      .filter((value): value is string => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean)
      .join(" ");
    const derivedLookPrompt = [
      lookDesign?.image_brief,
      lookDesign?.visual_description,
      visualBiblePrompt,
    ].find(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        !looksLikeCharacterLookStoryLeak(value)
    );
    if (derivedLookPrompt) {
      parts.push(`Look image brief: ${derivedLookPrompt.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/**
 * Merges a roster row's own `role`/`occupation`/description facts with the
 * matching entry (by name, falling back to `aliases`) in the series' story
 * bible `refinedCharacters` list. Roster values ALWAYS win when present and
 * non-empty; bible values only fill in facts the roster genuinely lacks —
 * this never overrides a role/occupation/description a user or the roster
 * auto-register flow actually set.
 *
 * Fixes the "occupation/description silently missing" bug this file's
 * `previewCharacterPrompt` / `generateCharacterImage` / `generateCharacterSheet`
 * mutations hit for story-auto-registered characters (traceId
 * Ytrq5TrfJRzyFNRLasyV8; `planning/vd-character-visual-bible-occupation-fix/plan.md`,
 * 2026-07-17): series 18 character 70's roster row had `role`/`occupation`
 * NULL and no `data.description` (only `source: "auto_registered_from_story"`),
 * so `generateCharacterVisualPrompts` had nothing but a bare name to work
 * from and guessed "pilot" for an aviation-series aircraft maintenance
 * engineer — wrong uniform baked into the approved Character DNA. The full
 * facts already live in `bible.refinedCharacters` (persisted by
 * `generateStoryBible`, read tolerantly by
 * `readBibleRefinedCharacterProfiles`); this just falls back to them.
 *
 * `readBibleRefinedCharacterProfiles` is now imported from
 * `verticalDramaBibleRefinedCharacters.ts` (a lightweight, DB/LLM-free
 * extraction — see that file's own header doc comment), so this function
 * can safely take the raw `bible` JSON and parse it itself as a plain,
 * static-import-only (no dynamic `import()`, no DB access) pure function.
 *
 * Description fallback uses the SAME `"Description: "` prefix convention as
 * `extractCharacterDescription` above. `occupation` is always passed as its
 * own separate downstream fact/param — it is deliberately never baked into
 * the description string here, matching how the roster-sourced `occupation`
 * column already flows separately from `data.description`.
 */
export function resolveEffectiveCharacterFacts(
  character: {
    name: string;
    role: string | null;
    occupation: string | null;
    data: Record<string, unknown> | null;
  },
  bible: Record<string, unknown> | null
): {
  role: string | null;
  occupation: string | null;
  description: string | undefined;
} {
  const rosterDescription = extractCharacterDescription(character.data);
  const hasRosterRole =
    typeof character.role === "string" && character.role.trim().length > 0;
  const hasRosterOccupation =
    typeof character.occupation === "string" &&
    character.occupation.trim().length > 0;

  let role = character.role;
  let occupation = character.occupation;
  let description = rosterDescription;

  if (hasRosterRole && hasRosterOccupation && description !== undefined) {
    // Nothing missing — never even look at the bible.
    return { role, occupation, description };
  }

  // Tolerant guard (same "never assume a caller-supplied string is well-formed"
  // convention `extractCharacterDescription` above follows): a falsy/blank
  // `character.name` can't be matched against anything, so skip the bible
  // lookup entirely rather than crashing `normalizeStoryCharacterName`'s
  // unconditional `.trim()`.
  if (
    typeof character.name !== "string" ||
    character.name.trim().length === 0
  ) {
    return { role, occupation, description };
  }

  const bibleCharacters: ReadonlyArray<VdBibleRefinedCharacter> =
    readBibleRefinedCharacterProfiles(bible);
  const normalizedTarget = normalizeStoryCharacterName(character.name);
  const bibleEntry = bibleCharacters.find(entry => {
    if (normalizeStoryCharacterName(entry.name) === normalizedTarget)
      return true;
    return (entry.aliases ?? []).some(
      alias => normalizeStoryCharacterName(alias) === normalizedTarget
    );
  });
  if (!bibleEntry) {
    return { role, occupation, description };
  }

  if (
    !hasRosterRole &&
    typeof bibleEntry.role === "string" &&
    bibleEntry.role.trim()
  ) {
    role = bibleEntry.role;
  }
  if (
    !hasRosterOccupation &&
    typeof bibleEntry.occupation === "string" &&
    bibleEntry.occupation.trim()
  ) {
    occupation = bibleEntry.occupation;
  }
  if (
    description === undefined &&
    typeof bibleEntry.description === "string" &&
    bibleEntry.description.trim()
  ) {
    description = `Description: ${bibleEntry.description.trim()}`;
  }

  return { role, occupation, description };
}

/**
 * Merges the two new per-character ethnicity/region override input fields
 * (`region`/`ethnicityText` — `planning/vd-per-character-ethnicity/plan.md`,
 * 2026-07-17) into a character's `data` jsonb blob, WITHOUT clobbering any
 * other keys already present (`description`, `identityLock`,
 * `wardrobeRules`, etc.) — jsonb columns are replaced wholesale on write, so
 * this must merge rather than build a bare `{ region, ethnicityText }`
 * object. `undefined` for either override field means "the caller did not
 * touch this field" (leave whatever `baseData` already has alone); an
 * explicit `null` (only reachable from `updateCharacter`, whose schema
 * marks both fields `.nullable()`) CLEARS that key — the same "undefined
 * means untouched, null means clear" convention `updateCharacter`'s other
 * nullable fields (`role`, `narrativeRole`, ...) already use.
 *
 * Returns `null` (never `{}`) when the merged object ends up empty — this
 * is the exact byte-identical fallback `createCharacter`/`updateCharacter`
 * used before this field existed (`data: input.data ?? null`), so a
 * pre-existing character (or a new one created without touching either
 * field) keeps a `data` column indistinguishable from today's (user
 * decision 2: no backfill, no forced regen).
 */
function mergeCharacterRegionOverrideIntoData(
  baseData: Record<string, unknown>,
  overrides: {
    region?: string | null;
    ethnicityText?: string | null;
    castingPreferences?: unknown | null;
  }
): Record<string, unknown> | null {
  const merged = { ...baseData };
  if (overrides.region !== undefined) {
    if (overrides.region === null) delete merged.region;
    else merged.region = overrides.region;
  }
  if (overrides.ethnicityText !== undefined) {
    if (overrides.ethnicityText === null) delete merged.ethnicityText;
    else merged.ethnicityText = overrides.ethnicityText;
  }
  if (overrides.castingPreferences !== undefined) {
    if (overrides.castingPreferences === null) {
      delete merged.castingPreferences;
    } else {
      // The tRPC input schema already validates this object. Parsing again at
      // the persistence boundary keeps this helper safe for future internal
      // callers and guarantees defaults/trim rules are stored consistently.
      const parsed = verticalDramaCharacterCastingPreferencesSchema.parse(
        overrides.castingPreferences
      );
      merged.castingPreferences = parsed;
      // New preferences are the authoritative replacement for the legacy
      // region/free-text pair. Keeping both would make an explicit Auto value
      // accidentally lose to the old resolver on a later generation.
      delete merged.region;
      delete merged.ethnicityText;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

/** Mark a JSONB character edit so automated look repair cannot overwrite it. */
function stampCharacterManualEdit(
  data: Record<string, unknown>,
  userId: number
): Record<string, unknown> {
  const existingProvenance =
    data.provenance &&
    typeof data.provenance === "object" &&
    !Array.isArray(data.provenance)
      ? (data.provenance as Record<string, unknown>)
      : {};
  const previousVersion = Number(
    existingProvenance.editVersion ?? data.editVersion ?? 0
  );
  const editVersion =
    Number.isInteger(previousVersion) && previousVersion >= 0
      ? previousVersion + 1
      : 1;
  const editedAt = new Date().toISOString();
  return {
    ...data,
    userEditedAt: editedAt,
    userEditedBy: userId,
    provenance: {
      ...existingProvenance,
      userEditedAt: editedAt,
      userEditedBy: userId,
      editVersion,
    },
  };
}

/**
 * New casting preferences supersede the legacy region/free-text pair. The
 * legacy resolver remains available for old rows, but must not reintroduce an
 * old ethnicity instruction when a user has explicitly saved Auto or a new
 * casting region in the versioned contract.
 */
function readLegacyCharacterRegionOverrideForGeneration(
  data: Record<string, unknown> | null | undefined
) {
  const hasVersionedCastingPreferences =
    verticalDramaCharacterCastingPreferencesSchema.safeParse(
      data?.castingPreferences
    ).success;
  return hasVersionedCastingPreferences
    ? undefined
    : readCharacterRegionOverrideFromData(data);
}

/**
 * Character-roster completeness signal (`vd-stuck-generation-and-lost-characters`
 * plan, Set B) — pure, unit-testable without a DB. See
 * `VdCharacterNeedsSetupReason`'s own doc comment (`@shared/verticalDramaSeries/characterAssets`)
 * for what each reason means.
 *
 * `hasApprovedOrGeneratedPortrait` is `undefined` for any caller that hasn't
 * batched a portrait lookup (see `characterRowToDto`'s own doc comment) — in
 * that case `"missing_portrait"` is deliberately NOT added, since asserting
 * "missing" without checking would be a false positive for a character that
 * actually has one. Only `listCharacters` (which already loads the full
 * asset manifest for the series) passes a real `true`/`false`.
 */
export function computeCharacterNeedsSetupReasons(params: {
  data: Record<string, unknown> | null | undefined;
  hasApprovedOrGeneratedPortrait: boolean | undefined;
}): VdCharacterNeedsSetupReason[] {
  const reasons: VdCharacterNeedsSetupReason[] = [];
  if (params.data?.source === "auto_registered_from_story") {
    reasons.push("auto_registered_from_story");
  }
  if (params.hasApprovedOrGeneratedPortrait === false) {
    reasons.push("missing_portrait");
  }
  // `description` is story context, not canonical Character DNA. A roster row
  // can legitimately have a description before its first prompt preview, so
  // only the validated persisted `visualBible.designDna` counts as DNA here.
  if (!readCharacterIdentityDna(params.data)) {
    reasons.push("missing_dna");
  }
  return reasons;
}

/** Browser-safe projection of a character roster row (never leaks internal ids as numbers). */
/**
 * `includeVoiceConfig` (W12-A, default `false`) — only set `true` by callers
 * that already confirmed the tenant's `verticalDramaSeriesVoiceChain` flag is
 * on (see `resolveVerticalDramaVoiceChainFlag`). Gating it here, not just on
 * the DB column being null, keeps read payloads flags-off byte-identical even
 * in the edge case where a tenant had the flag on, cast a character, then had
 * it turned back off — the field simply stops being surfaced.
 *
 * `hasApprovedOrGeneratedPortrait` (Set B, added 2026-07-16) — optional,
 * batched-by-the-caller signal feeding `needsSetup`/`needsSetupReasons` (see
 * `computeCharacterNeedsSetupReasons`). Only `listCharacters` currently
 * passes it (a single manifest query already loaded for the whole series —
 * no N+1); every other call site (single-row create/update mutations) omits
 * it, which safely skips the `"missing_portrait"` reason for that response
 * rather than guessing.
 */
function characterRowToDto(
  row: VerticalDramaCharacterRow,
  options: {
    includeVoiceConfig?: boolean;
    hasApprovedOrGeneratedPortrait?: boolean;
  } = {}
) {
  const data = (row.data as Record<string, unknown> | null) ?? undefined;
  const needsSetupReasons = computeCharacterNeedsSetupReasons({
    data,
    hasApprovedOrGeneratedPortrait: options.hasApprovedOrGeneratedPortrait,
  });
  return {
    characterId: String(row.id),
    seriesId: String(row.seriesId),
    characterKey: row.characterKey,
    name: row.name,
    role: row.role ?? undefined,
    narrativeRole: row.narrativeRole ?? undefined,
    roleTier: row.roleTier ?? undefined,
    occupation: row.occupation ?? row.role ?? undefined,
    roleVisualIntent:
      (row.roleVisualIntent as Record<string, unknown> | null) ?? undefined,
    roleProvenance: row.roleProvenance ?? undefined,
    roleReviewStatus: row.roleReviewStatus ?? undefined,
    data,
    // planning/vertical-drama-character-variants/plan.md Phase E — expose the
    // Phase A schema columns so the Characters tab can group variant rows
    // under their parent and badge twin (shares-face) rows.
    parentCharacterId:
      row.parentCharacterId != null ? String(row.parentCharacterId) : undefined,
    variantLabel: row.variantLabel ?? undefined,
    variantType:
      (row.variantType as "outfit" | "age_stage" | null) ?? undefined,
    sharesFaceWithCharacterId:
      row.sharesFaceWithCharacterId != null
        ? String(row.sharesFaceWithCharacterId)
        : undefined,
    createdAt: (row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt)
    ).toISOString(),
    updatedAt: (row.updatedAt instanceof Date
      ? row.updatedAt
      : new Date(row.updatedAt)
    ).toISOString(),
    // vd-stuck-generation-and-lost-characters plan, Set B — completeness
    // signal so the client can badge/filter story-introduced characters that
    // still need DNA/portrait work, independent of `roleReviewStatus` (which
    // only tracks role-tier assignment and can clear while still fully bare).
    needsSetup: needsSetupReasons.length > 0,
    needsSetupReasons,
    ...(options.includeVoiceConfig
      ? {
          voiceConfig:
            (row.voiceConfig as VerticalDramaCharacterVoiceConfig | null) ??
            undefined,
        }
      : {}),
  };
}

/** Resolve the `verticalDramaSeriesVoiceChain` tenant flag (W12-A) — same
 *  "one focused helper per flag-group" convention as
 *  `verticalDramaEpisodes.ts`'s `resolveVerticalDramaDeepStoryDraftsFlag`.
 *  Optional chaining fails closed for any pre-existing test that mocks
 *  `getTenantFeatureFlags` as a bare `vi.fn()`. */
async function resolveVerticalDramaVoiceChainFlag(
  tenantId: string
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesVoiceChain === true;
}

/* -------------------------------------------------------------------------- */
/* W12-A voice chain helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort audit record for a voice-casting/voice-chain action. Written to
 * the cross-cutting `api_audit_events` table — same "best-effort DB insert,
 * never throws" convention as `verticalDramaSeries.ts`'s
 * `recordDeepStoryDraftAuditEvent` (see that function's own doc comment for
 * the full rationale). NEVER throws — a failed audit write must not fail the
 * user-facing mutation.
 */
async function recordVoiceChainAuditEvent(params: {
  eventType: "vertical_drama_voice_cast" | "vertical_drama_voice_preview";
  endpoint: string;
  userId: number;
  seriesId: number;
  characterId: number;
  creditsCharged?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: params.eventType,
      userId: params.userId,
      endpoint: `verticalDramaCharacters.${params.endpoint}`,
      statusCode: 200,
      skillSlug: "vertical-drama-voice-chain",
      creditsCharged: Math.round(params.creditsCharged ?? 0),
      metadata: {
        seriesId: params.seriesId,
        characterId: params.characterId,
        ...(params.metadata ?? {}),
      },
    });
  } catch (error) {
    debugError(
      "verticalDramaCharacters.voiceChain",
      "Failed to record voice chain audit event",
      error
    );
  }
}

/** The subset of a media model's `configJson.inputFields[n]` entry needed to
 *  detect the voice picker field — mirrors the SAME subset
 *  `VerticalDramaSeriesTrailerPanel.tsx`'s (client-only) `ModelInputFieldConfig`
 *  reads, reimplemented here server-side since that component's helpers are
 *  not exported/shared. */
interface VoiceCatalogInputFieldConfig {
  key?: string;
  options?: unknown;
  optionsSource?: { valueField?: string; previewField?: string };
}

/**
 * Detect whether a model input field is "the voice picker" — same rule as
 * the trailer panel's `isVoiceSelectionField`: a field counts when its
 * provider-API options source targets `voice_id`/`preview_url`, OR its
 * (normalized) key is `voice`, `voiceid`, or `voiceidN` (matches UVoice's
 * `voiceID` key, not just the literal string `"voice"`).
 */
function isVoiceCatalogField(
  field: VoiceCatalogInputFieldConfig | null | undefined
): boolean {
  if (!field || typeof field !== "object") return false;
  const source = field.optionsSource;
  if (source && typeof source === "object") {
    const valueField = String(source.valueField ?? "")
      .trim()
      .toLowerCase();
    const previewField = String(source.previewField ?? "")
      .trim()
      .toLowerCase();
    if (valueField === "voice_id" || previewField === "preview_url")
      return true;
  }
  const normalizedKey = String(field.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]/g, "");
  return (
    normalizedKey === "voice" ||
    normalizedKey === "voiceid" ||
    /^voiceid\d+$/.test(normalizedKey)
  );
}

/** Resolve which `configJson.inputFields[]` key is the voice picker for a
 *  model, or `undefined` when the model has no dynamic/static voice field
 *  (e.g. models that only expose a flat `voices` column). */
function resolveVoiceCatalogFieldKey(
  configJson: Record<string, unknown> | null | undefined
): string | undefined {
  const inputFields = Array.isArray(configJson?.inputFields)
    ? (configJson!.inputFields as VoiceCatalogInputFieldConfig[])
    : [];
  return inputFields.find(field => isVoiceCatalogField(field))?.key;
}

/**
 * Best-effort `{language, ageTag}` extraction from a voice option label —
 * e.g. UVoice's `"th - ปอร์เช่ (Adult)"` -> `{language: "th", ageTag: "Adult"}`.
 * Returns an empty object when the label doesn't encode either; no source
 * this catalog reads from currently publishes an explicit `gender` field, so
 * `VerticalDramaVoiceCatalogEntry.gender` is always left unset here — it
 * exists on the shared type for forward compatibility only.
 */
function parseVoiceCatalogLabelMetadata(label: string): {
  language?: string;
  ageTag?: string;
} {
  const languageMatch = /^([a-z]{2})\s*-\s*/i.exec(label);
  const ageTagMatch = /\(([^()]+)\)\s*$/.exec(label);
  return {
    language: languageMatch?.[1]?.toLowerCase(),
    ageTag: ageTagMatch?.[1]?.trim(),
  };
}

/** Fixed Thai self-introduction sample line for `previewCharacterVoice` when
 *  the caller doesn't supply `sampleText` — always includes the character's
 *  name so the preview is recognizably about THIS character. */
function buildFixedThaiVoicePreviewSample(characterName: string): string {
  return `สวัสดีค่ะ ฉันคือ ${characterName} ยินดีที่ได้รู้จักนะคะ`;
}

/** Resolve the audio model's pricing row for credit calculation, falling back
 *  to the same `{creditCost: 10, configJson: null}` default this router
 *  already uses for image models when the row is missing (e.g. a stale/
 *  deleted model id). */
async function resolveAudioModelPricing(
  voiceModelId: string
): Promise<{ creditCost: number; configJson: Record<string, unknown> | null }> {
  const [pricingRow] = await db
    .select({
      creditCost: mediaModels.creditCost,
      configJson: mediaModels.configJson,
    })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, voiceModelId))
    .limit(1);
  return pricingRow ?? { creditCost: 10, configJson: null };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const seriesScope = z.object({ seriesId: z.string().min(1) });

const assetStateEnum = z.enum(
  VERTICAL_DRAMA_CHARACTER_ASSET_STATES as unknown as [string, ...string[]]
);

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaCharactersRouter = router({
  /**
   * List the series' character roster plus the durable reference-asset manifest
   * (approved / pending / stale counts + per-asset links). Read-only.
   */
  listCharacters: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const rows = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId)
          )
        );

      const manifest = await verticalDramaCharacterStockService.getManifest({
        tenantId,
        userId,
        seriesId,
      });

      // W12-A — additive `voiceConfig` field, flag-gated (see
      // `characterRowToDto`'s own doc comment for the byte-identical rationale).
      const voiceChainEnabled =
        await resolveVerticalDramaVoiceChainFlag(tenantId);

      // Set B (vd-stuck-generation-and-lost-characters plan) — batched
      // "has a usable portrait" signal for `needsSetup`/`needsSetupReasons`,
      // derived from the manifest ALREADY loaded above (no extra query, no
      // N+1). Same selection rule the roster card thumbnail uses
      // (`resolveCharacterCardPortraitAsset` in
      // `VerticalDramaCharacterStockPanel.tsx`): a `primary_portrait` asset
      // in `approved`/`generated`/`imported` state counts; `draft`/`rejected`/
      // `stale` do not.
      const portraitCharacterIds = new Set(
        manifest.assets
          .filter(
            asset =>
              asset.role === "primary_portrait" &&
              (asset.state === "approved" ||
                asset.state === "generated" ||
                asset.state === "imported")
          )
          .map(asset => asset.characterId)
      );

      return {
        characters: rows.map((row: VerticalDramaCharacterRow) =>
          characterRowToDto(row, {
            includeVoiceConfig: voiceChainEnabled,
            hasApprovedOrGeneratedPortrait: portraitCharacterIds.has(
              String(row.id)
            ),
          })
        ),
        manifest,
      };
    }),

  /**
   * Repair one legacy look whose visual fields contain episode/story prose or
   * pre-standard data. The repair is intentionally user-triggered and
   * owner-scoped: it calls the real LLM-only character-look skill, preserves
   * the character's canonical face/body facts. Because this is an explicit
   * owner action, it may replace derived visual fields even on an older
   * manually-edited row; automatic pipeline repair remains non-destructive.
   * Rows without storyboard provenance use an explicit legacy-source sentinel
   * and never receive a fabricated shot reference.
   */
  repairLegacyCharacterLook: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );
      const { backfillVerticalDramaCharacterLooks } =
        await import("../scripts/backfill-vertical-drama-character-looks");
      const result = await backfillVerticalDramaCharacterLooks({
        mode: "apply",
        tenantId,
        userId,
        seriesId,
        rowIds: [characterId],
        force: true,
        limit: 1,
      });
      if (result.stats.errors.length > 0) {
        const failure = result.stats.errors[0];
        debugError(
          "verticalDramaCharacters.repairLegacyCharacterLook",
          `Character-look repair failed for row ${failure.rowId}: ${failure.message}`
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ซ่อมรายละเอียดลุคไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        });
      }
      return {
        characterId: String(characterId),
        ...result,
      };
    }),

  /** Submit every server-authored first-portrait candidate as an independent image task. */
  generatePortraitCandidateBatch: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        batchId: z.string().uuid(),
        // Required — no server-side fallback; caller must explicitly select
        // an image model (fail-closed, see `resolveCharacterImageModelId`).
        selectedImageModelId: z.string().trim().min(1).max(128),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 3).
        // Required only when the resolved model is Hermes-transport and
        // the caller has no default Hermes connection for images.
        hermesConnectionId: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      const seriesRow = await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );
      const characterCastingPreferences =
        readCharacterCastingPreferencesFromData(
          (character.data as Record<string, unknown> | null) ?? null
        );
      const { identity: presetVisualIdentity, lookLockEnabled } =
        await resolveCharacterPresetVisualIdentity(
          tenantId,
          (seriesRow.bible as Record<string, unknown> | null) ?? null
        );
      const owner = { tenantId, userId, seriesId };
      const isFaceLinkedVariant =
        character.parentCharacterId != null ||
        character.sharesFaceWithCharacterId != null;
      if (isFaceLinkedVariant) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This character uses a parent/twin face source and cannot create an independent portrait candidate batch.",
        });
      }

      let candidateCount: number;
      try {
        candidateCount =
          await verticalDramaCharacterStockService.getPortraitCandidateBatchCount(
            owner,
            characterId,
            input.batchId
          );
      } catch (err) {
        mapStockError(err);
      }

      const resolvedImageModelId = await resolveCharacterImageModelId(
        input.selectedImageModelId
      );
      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      let characterPromptCapability: VerticalDramaCharacterPromptCapability;
      try {
        characterPromptCapability =
          await resolveCharacterPromptCapabilityForModel(
            resolvedImageModelId,
            (pricingModel.configJson as
              | Record<string, unknown>
              | null
              | undefined) ?? null
          );
      } catch (error) {
        return mapCharacterPromptContractError(error);
      }
      const previewCandidates =
        await verticalDramaCharacterStockService.getPortraitCandidateBatchForPreflight(
          owner,
          characterId,
          input.batchId
        );
      const referenceGuidedCandidateCount = previewCandidates.filter(
        candidate => candidate.referenceGuided
      ).length;
      if (
        referenceGuidedCandidateCount > 0 &&
        referenceGuidedCandidateCount !== previewCandidates.length
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Portrait candidate batch mixes reference-guided and standard candidates. Generate a fresh batch.",
        });
      }
      const referenceAssetLinkIds = previewCandidates[0]?.referenceGuided
        ? (previewCandidates[0].referenceAssetLinkIds ?? [])
        : [];
      if (
        referenceGuidedCandidateCount > 0 &&
        referenceAssetLinkIds.length === 0
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Reference-guided candidate metadata is incomplete. Generate a fresh batch.",
        });
      }
      const referenceImageUrls = referenceAssetLinkIds.length
        ? await verticalDramaCharacterStockService.getCharacterReferenceImageUrls(
            owner,
            characterId,
            referenceAssetLinkIds
          )
        : [];
      if (isTargetVerticalDramaCharacterCapability(characterPromptCapability)) {
        for (const candidate of previewCandidates) {
          if (candidate.referenceGuided) continue;
          const reuseDecision = decideCharacterPromptSnapshotReuse({
            imagePromptCapability: characterPromptCapability,
            snapshotContractVersion: candidate.promptContractVersion,
            snapshotPromptProfile: candidate.promptProfile,
            snapshotCastingPreferencesFingerprint:
              candidate.castingPreferencesFingerprint,
            currentCastingPreferencesFingerprint:
              buildCharacterCastingPreferencesFingerprint(
                characterCastingPreferences
              ),
            hasCharacterFacts: true,
          });
          if (reuseDecision.action !== "reuse") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "One or more portrait candidates are stale. Generate a fresh candidate batch.",
            });
          }
        }
      }
      const normalizedCandidatePrompts = new Map(
        previewCandidates.map(candidate => {
          const assembled = applySeriesLookToImagePrompt({
            prompt: candidate.portraitPrompt,
            negativePrompt: candidate.negativePrompt,
            identity: presetVisualIdentity,
          });
          return [
            candidate.candidateId,
            normalizeCharacterRenderPrompt({
              prompt: assembled.prompt,
              negativePrompt: assembled.negativePrompt,
              model: resolvedImageModelId,
              capability: characterPromptCapability,
            }),
          ] as const;
        })
      );
      const creditCostPerImage = calculateCreditCost(pricingModel, {
        numImages: 1,
      });
      const totalReservedCredits = creditCostPerImage * candidateCount;

      // Feature 135 — Hermes Grok media worker (section 09, row 3): resolve
      // the transport ONCE (not per-candidate) so every candidate in this
      // batch shares one Hermes connection. MCP/gateway models are
      // untouched below — the existing per-candidate
      // `resolveVdCharacterMcpTransportMetadata` call keeps running exactly
      // as before for those (byte-equivalent regression baseline).
      const transportDecision = await resolveVdCharacterMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
      });
      if (transportDecision.kind === "hermes" && candidateCount > 4) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hermes portrait candidate batches are capped at 4 candidates per submit.",
        });
      }
      const hermesProviderModelId =
        transportDecision.kind === "hermes"
          ? (resolveMediaModelTransportConfig({
              modelId: resolvedImageModelId,
              configJson: pricingModel.configJson,
            }).providerModelId ?? resolvedImageModelId)
          : undefined;

      if (transportDecision.kind !== "hermes" && totalReservedCredits > 0) {
        const hasCredits = await hasEnoughCredits(userId, totalReservedCredits);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for ${candidateCount} portrait candidates. Required: ${totalReservedCredits}`,
          });
        }
      }

      let candidates;
      try {
        candidates =
          await verticalDramaCharacterStockService.claimPortraitCandidateBatch(
            owner,
            characterId,
            input.batchId
          );
      } catch (err) {
        mapStockError(err);
      }

      if (transportDecision.kind !== "hermes" && totalReservedCredits > 0) {
        await deductCredits({
          userId,
          tenantId,
          amount: totalReservedCredits,
          description:
            `Vertical Drama — reserve ${candidateCount} character portrait candidates ` +
            `(character #${characterId})`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_character_portrait_candidate_batch",
            seriesId,
            characterId,
            batchId: input.batchId,
            candidateCount,
            creditCostPerImage,
            type: "reservation",
            modelId: resolvedImageModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      const submitted: Array<{
        assetLinkId: string;
        candidateId: string;
        index: number;
        status: "queued" | "failed";
        taskId?: string;
        errorMessage?: string;
      }> = [];
      for (const candidate of candidates) {
        try {
          const assembledCandidatePrompt = applySeriesLookToImagePrompt({
            prompt: candidate.portraitPrompt,
            negativePrompt: candidate.negativePrompt,
            identity: presetVisualIdentity,
          });
          const normalizedCandidatePrompt = normalizedCandidatePrompts.get(
            candidate.candidateId
          );
          if (!normalizedCandidatePrompt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Portrait candidate preflight data is incomplete; generate a fresh batch.",
            });
          }
          if (lookLockEnabled && presetVisualIdentity) {
            await recordSeriesLookLockAuditEvent({
              eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
              tenantId,
              userId,
              seriesId,
              path: "characters.generatePortraitCandidate",
            });
          }
          let taskId: string;
          if (transportDecision.kind === "hermes") {
            // Feature 135 — Hermes Grok media worker (section 09, row 3):
            // one independent `queueHermesMediaJob` call per candidate,
            // sharing `transportDecision.connectionId`, each with its own
            // `${batchId}:${candidateId}` idempotency key. No reference
            // Reference-guided candidates use the selected images only as
            // visual guidance; the prompt explicitly asks the model to cast a
            // new fictional person. Existing candidates keep the old generate
            // path and have no references.
            const { queueHermesMediaJob } =
              await import("../services/hermesMediaScheduler");
            const {
              buildHermesMediaReferences,
              resolveHermesOrderedRefsFromUrls,
            } = await import("../services/hermesMediaReferences");
            const hermesTraceId = crypto.randomUUID();
            const { orderedRefs } = await resolveHermesOrderedRefsFromUrls({
              tenantId,
              userId,
              urls: referenceImageUrls,
              traceId: hermesTraceId,
              connectionId: transportDecision.connectionId,
              roleFor: () => "identity_lock",
              requireAll: referenceImageUrls.length > 0,
            });
            const references = await buildHermesMediaReferences({
              tenantId,
              userId,
              orderedRefs,
            });
            const result = await queueHermesMediaJob({
              contractVersion: 1,
              operation:
                references.length > 0 ? "image.edit" : "image.generate",
              connectionId: transportDecision.connectionId,
              prompt: normalizedCandidatePrompt.prompt,
              settings: {
                model: hermesProviderModelId ?? resolvedImageModelId,
                aspectRatio: "9:16",
                outputCount: 1,
              },
              references,
              entity: {
                type: "vertical_drama_character_portrait_candidate",
                id: String(candidate.assetLinkId),
              },
              traceId: hermesTraceId,
              tenantId,
              requestedByUserId: userId,
              idempotencyKey: `${input.batchId}:${candidate.candidateId}`,
            });
            taskId = result.taskId;
          } else {
            const transportMetadata =
              await resolveVdCharacterMcpTransportMetadata({
                tenantId,
                actorUserId: userId,
                assetType: "image",
                modelId: resolvedImageModelId,
                configJson: pricingModel.configJson,
                mcpConnectionId: input.mcpConnectionId,
                sharedGroupId: input.sharedGroupId,
                idempotencyKey: `${input.batchId}:${candidate.candidateId}`,
              });
            const task = await mediaGenerationService.generateImageAsync(
              {
                prompt: normalizedCandidatePrompt.prompt,
                characterPromptContext: buildCharacterPromptContext(
                  characterPromptCapability,
                  candidate.semanticRetryCount
                ),
                ...(normalizedCandidatePrompt.negativePrompt !== undefined
                  ? { negativePrompt: normalizedCandidatePrompt.negativePrompt }
                  : {}),
                model: resolvedImageModelId,
                numImages: 1,
                aspectRatio: "9:16",
                ...(referenceImageUrls.length > 0
                  ? { referenceImageUrls }
                  : {}),
                extraParams: {
                  __origin_surface:
                    "vertical_drama_character_portrait_candidates",
                  __reserved_credits: creditCostPerImage,
                  __vd_character_prompt_marker:
                    VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
                  __vd_character_prompt_contract_version:
                    isTargetVerticalDramaCharacterCapability(
                      characterPromptCapability
                    )
                      ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
                      : "legacy",
                  __vd_series_id: String(seriesId),
                  __vd_character_id: String(characterId),
                  __vd_portrait_candidate_batch_id: input.batchId,
                  __vd_portrait_candidate_id: candidate.candidateId,
                  __vd_portrait_candidate_asset_link_id: String(
                    candidate.assetLinkId
                  ),
                },
                publicUrl: ctx.publicUrl ?? undefined,
                ...(transportMetadata ? { transportMetadata } : {}),
                auditContext: {
                  userId,
                  tenantId,
                  traceId: crypto.randomUUID(),
                  source:
                    "trpc.verticalDramaCharacters.generatePortraitCandidateBatch",
                  stage: "submission",
                },
              },
              userToken
            );
            taskId = task.id;
          }
          try {
            await verticalDramaCharacterStockService.recordPortraitCandidateTask(
              {
                ...owner,
                assetLinkId: candidate.assetLinkId,
                taskId,
                imageModel: resolvedImageModelId,
              }
            );
          } catch (recordError) {
            debugError(
              "verticalDramaCharacters.generatePortraitCandidateBatch",
              `Task ${taskId} submitted but candidate task metadata could not be recorded`,
              recordError
            );
          }
          submitted.push({
            assetLinkId: String(candidate.assetLinkId),
            candidateId: candidate.candidateId,
            index: candidate.index,
            status: "queued",
            taskId,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Portrait candidate failed to submit";
          await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed(
            {
              ...owner,
              assetLinkId: candidate.assetLinkId,
              errorMessage,
            }
          );
          if (transportDecision.kind !== "hermes" && creditCostPerImage > 0) {
            await refundCredits({
              userId,
              amount: creditCostPerImage,
              description:
                `Refund: portrait candidate failed to submit (character #${characterId}, ` +
                `${candidate.candidateId})`,
              sourceType: "media_image",
              metadata: {
                feature: "vertical_drama_character_portrait_candidate_batch",
                seriesId,
                characterId,
                batchId: input.batchId,
                candidateId: candidate.candidateId,
              },
            });
          }
          submitted.push({
            assetLinkId: String(candidate.assetLinkId),
            candidateId: candidate.candidateId,
            index: candidate.index,
            status: "failed",
            errorMessage,
          });
        }
      }

      return {
        batchId: input.batchId,
        model: resolvedImageModelId,
        creditsReserved: totalReservedCredits,
        candidates: submitted.sort((left, right) => left.index - right.index),
      };
    }),

  /** Poll and durably settle one candidate without round-tripping private DNA through the browser. */
  settlePortraitCandidate: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkId: z.string().min(1),
        taskId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const owner = { tenantId, userId, seriesId };
      let info;
      try {
        info =
          await verticalDramaCharacterStockService.getPortraitCandidateTaskInfo(
            owner,
            assetLinkId
          );
      } catch (err) {
        mapStockError(err);
      }
      if (info.taskId && input.taskId && info.taskId !== input.taskId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task id does not match this portrait candidate.",
        });
      }
      const taskId = info.taskId ?? input.taskId;
      if (
        taskId &&
        info.mediaAssetId != null &&
        info.imageUrl &&
        ["completed", "selected", "superseded"].includes(info.status)
      ) {
        return {
          assetLinkId: input.assetLinkId,
          taskId,
          status: "completed" as const,
          imageUrl: info.imageUrl,
        };
      }
      if (taskId && info.status === "failed") {
        return {
          assetLinkId: input.assetLinkId,
          taskId,
          status: "failed" as const,
        };
      }
      if (!taskId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Portrait candidate has no submitted media task.",
        });
      }
      let task: Awaited<ReturnType<typeof getUnifiedMediaTask>>;
      try {
        task = await getUnifiedMediaTask({
          taskId,
          userId,
          userToken: getCharacterPortraitUserToken(ctx),
          tenantId,
          auditContext: {
            userId,
            tenantId,
            source: "trpc.verticalDramaCharacters.settlePortraitCandidate",
            stage: "poll",
          },
        });
      } catch (error) {
        const transientPoll = getTransientMediaPollRetryHint(error);
        if (!transientPoll) throw error;

        // The task may still be rendering; this request only failed to read
        // its status. Return a durable non-terminal result so the browser can
        // wait/retry without creating a tRPC error or feedback report.
        return {
          assetLinkId: input.assetLinkId,
          taskId,
          status: "queued" as const,
          retryAfterMs: transientPoll.retryAfterSeconds * 1000,
        };
      }

      if (!info.taskId && info.status === "submitting") {
        const provenanceMatches =
          task.mediaType === "image" &&
          readMediaTaskInternalParameter(
            task.parameters,
            "__vd_portrait_candidate_asset_link_id"
          ) === input.assetLinkId &&
          readMediaTaskInternalParameter(
            task.parameters,
            "__vd_portrait_candidate_batch_id"
          ) === info.batchId &&
          readMediaTaskInternalParameter(
            task.parameters,
            "__vd_portrait_candidate_id"
          ) === info.candidateId &&
          readMediaTaskInternalParameter(
            task.parameters,
            "__vd_character_id"
          ) === String(info.characterId);
        if (!provenanceMatches) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Task provenance does not match this portrait candidate.",
          });
        }
        await verticalDramaCharacterStockService.recordPortraitCandidateTask({
          ...owner,
          assetLinkId,
          taskId,
          imageModel: task.model,
        });
      }

      if (task.status === "completed" || task.status === "failed") {
        const { reconcileTaskCredits } = await import("./media");
        void reconcileTaskCredits({ task: task as any, userId }).catch(
          () => {}
        );
      }
      if (task.status === "failed") {
        await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed(
          {
            ...owner,
            assetLinkId,
            errorMessage:
              task.errorMessage ?? "Portrait candidate render failed",
          }
        );
        // Set A gap 7 (server half): classify the immediate synchronous
        // response the same way `markPortraitCandidateSubmissionFailed`
        // classifies the durable row, so the client can show a clear
        // manual-retry message on THIS poll response without waiting for a
        // manifest refetch. No soften-authoring path exists for character
        // portrait-candidate prompts (unlike shot/start-frame's
        // `vertical-drama-shot-image-action` skill) — auto-soften retry for
        // candidates is deliberately deferred, see plan.md Set A.
        const policyRejected = isCharacterLockPolicyFailureMessage(
          task.errorMessage
        );
        return {
          assetLinkId: input.assetLinkId,
          taskId,
          status: "failed" as const,
          errorMessage: policyRejected
            ? VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE
            : (task.errorMessage ?? undefined),
          policyRejected,
        };
      }
      if (task.status !== "completed") {
        return { assetLinkId: input.assetLinkId, taskId, status: task.status };
      }
      if (!task.resultUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Portrait candidate completed without a result URL.",
        });
      }

      const durable = await ingestVerticalDramaMediaAsset({
        tenantId,
        userId,
        seriesId,
        mediaType: "image",
        sourceUrl: task.resultUrl,
        mimeType: "image/jpeg",
        identity: task.id,
        purpose: "character_portrait",
      });
      const assetId = durable.mediaAssetId;
      let asset;
      try {
        asset =
          await verticalDramaCharacterStockService.attachGeneratedPortraitCandidate(
            {
              ...owner,
              assetLinkId,
              mediaAssetId: assetId,
            }
          );
      } catch (err) {
        mapStockError(err);
      }
      return {
        assetLinkId: input.assetLinkId,
        taskId,
        status: "completed" as const,
        imageUrl: durable.url,
        asset,
      };
    }),

  /**
   * Poll and durably settle an ordinary character portrait. The old client
   * path fetched the provider result in the browser, then made two more
   * browser-owned mutations (import URL, link asset). If the tab was
   * backgrounded, navigated away, or either mutation hit a transient failure,
   * the provider task could complete while the look stayed image-less. Keep
   * the same owner/provenance checks as the candidate flow, but perform the
   * durable ingest and character link in this single server call.
   */
  settleCharacterImageTask: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        taskId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      let task: Awaited<ReturnType<typeof getUnifiedMediaTask>>;
      try {
        task = await getUnifiedMediaTask({
          taskId: input.taskId,
          userId,
          userToken: getCharacterPortraitUserToken(ctx),
          tenantId,
          auditContext: {
            userId,
            tenantId,
            source: "trpc.verticalDramaCharacters.settleCharacterImageTask",
            stage: "poll",
          },
        });
      } catch (error) {
        const transientPoll = getTransientMediaPollRetryHint(error);
        if (!transientPoll) throw error;
        return {
          characterId: input.characterId,
          taskId: input.taskId,
          status: "queued" as const,
          retryAfterMs: transientPoll.retryAfterSeconds * 1000,
        };
      }

      const provenanceMatches =
        task.mediaType === "image" &&
        readMediaTaskInternalParameter(task.parameters, "__vd_series_id") ===
          String(seriesId) &&
        readMediaTaskInternalParameter(task.parameters, "__vd_character_id") ===
          String(characterId);
      if (!provenanceMatches) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task provenance does not match this character image.",
        });
      }

      if (task.status === "failed") {
        const { reconcileTaskCredits } = await import("./media");
        if (typeof reconcileTaskCredits === "function") {
          void reconcileTaskCredits({
            task: task as any,
            userId,
            tenantId,
          }).catch(() => {});
        }
        return {
          characterId: input.characterId,
          taskId: input.taskId,
          status: "failed" as const,
          errorMessage: task.errorMessage ?? undefined,
        };
      }
      if (task.status !== "completed") {
        return {
          characterId: input.characterId,
          taskId: input.taskId,
          status: task.status,
          retryAfterMs: 2500,
        };
      }
      if (!task.resultUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Character image completed without a result URL.",
        });
      }

      let durable: Awaited<ReturnType<typeof ingestVerticalDramaMediaAsset>>;
      try {
        durable = await ingestVerticalDramaMediaAsset({
          tenantId,
          userId,
          seriesId,
          mediaType: "image",
          sourceUrl: task.resultUrl,
          mimeType: "image/jpeg",
          identity: task.id,
          purpose: "character_portrait",
        });
      } catch (error) {
        const transientIngest = getTransientMediaPollRetryHint(error);
        if (!transientIngest) throw error;
        return {
          characterId: input.characterId,
          taskId: input.taskId,
          status: "processing" as const,
          retryAfterMs: transientIngest.retryAfterSeconds * 1000,
        };
      }
      let asset;
      try {
        asset = await verticalDramaCharacterStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          characterId,
          mediaAssetId: durable.mediaAssetId,
          assetType: "character_reference",
          role: "primary_portrait",
          source: "generated",
        });
      } catch (err) {
        mapStockError(err);
      }

      const { reconcileTaskCredits } = await import("./media");
      if (typeof reconcileTaskCredits === "function") {
        void reconcileTaskCredits({
          task: task as any,
          userId,
          tenantId,
        }).catch(() => {});
      }
      return {
        characterId: input.characterId,
        taskId: input.taskId,
        status: "completed" as const,
        imageUrl: durable.url,
        mediaAssetId: String(durable.mediaAssetId),
        asset,
      };
    }),

  /** Select one completed candidate as the canonical portrait and Character DNA. */
  selectPortraitCandidate: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        assetLinkId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      try {
        const asset =
          await verticalDramaCharacterStockService.selectPortraitCandidate({
            tenantId,
            userId,
            seriesId,
            characterId,
            assetLinkId,
          });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Make one of this character's existing portraits the MAIN image
   * (`planning/vd-character-primary-portrait-control/plan.md`).
   *
   * Every generated portrait and every dropped reference is stored as
   * `role: "primary_portrait"`, so a character ends up with several rows that
   * all claim the title and the winner is decided implicitly by recency. This
   * is the explicit control that was missing: the user points at one image and
   * that becomes the card thumbnail AND the identity-lock reference every
   * later generation conditions on.
   *
   * Routes to `selectPortraitCandidate` for a candidate batch, because choosing
   * one of those must also lock the Character DNA snapshot that was generated
   * alongside it. Callers therefore only need this one mutation; they do not
   * have to know which kind of image they are pointing at.
   */
  setPrimaryPortrait: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        assetLinkId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      const owner = { tenantId, userId, seriesId, characterId, assetLinkId };
      try {
        const asset =
          await verticalDramaCharacterStockService.setPrimaryPortraitAsset(
            owner
          );
        return { asset, via: "direct" as const };
      } catch (err) {
        // A batch candidate must go through the DNA-locking path instead —
        // the service refuses it rather than silently skipping that write.
        if (
          err instanceof VerticalDramaCharacterStockError &&
          err.reason === "asset_wrong_role"
        ) {
          try {
            const asset =
              await verticalDramaCharacterStockService.selectPortraitCandidate(
                owner
              );
            return { asset, via: "candidate" as const };
          } catch (candidateErr) {
            mapStockError(candidateErr);
          }
        }
        mapStockError(err);
      }
    }),

  /**
   * Build the browser-safe per-series character-asset manifest (approved /
   * pending / stale reference stock). Read-only.
   */
  getManifest: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      return verticalDramaCharacterStockService.getManifest({
        tenantId,
        userId,
        seriesId,
      });
    }),

  /** Create a new character in the series roster (no paid generation). */
  createCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterKey: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(255),
        role: z.string().trim().max(100).optional(),
        narrativeRole: narrativeRoleSchema.optional(),
        roleTier: roleTierSchema.optional(),
        occupation: z.string().trim().max(160).optional(),
        roleVisualIntent: roleVisualIntentSchema.optional(),
        roleProvenance: roleProvenanceSchema.optional(),
        roleReviewStatus: roleReviewStatusSchema.optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        // Per-character ethnicity/region override (planning/vd-per-character-
        // ethnicity/plan.md, 2026-07-17) — persisted into `data.region`/
        // `data.ethnicityText` by `mergeCharacterRegionOverrideIntoData`
        // below, never a separate column (see that function's doc comment).
        // Free text wins over the dropdown when both are set — see
        // `resolveCharacterTargetAudienceRegion`'s own precedence doc
        // comment. Absent (the default for every pre-existing character):
        // `data` stays exactly what it would have been before this field
        // existed (user decision: no backfill, no forced regen).
        region: z.enum(VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS).optional(),
        ethnicityText: z.string().trim().max(80).optional(),
        castingPreferences:
          verticalDramaCharacterCastingPreferencesSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey: input.characterKey,
          name: input.name,
          role: input.role ?? null,
          narrativeRole: input.narrativeRole ?? null,
          roleTier: input.roleTier ?? null,
          occupation: input.occupation ?? input.role ?? null,
          roleVisualIntent: input.roleVisualIntent ?? null,
          roleProvenance:
            input.roleProvenance ??
            (input.narrativeRole && input.roleTier
              ? "user_confirmed"
              : "ai_assigned"),
          roleReviewStatus:
            input.roleReviewStatus ??
            (input.narrativeRole && input.roleTier
              ? "ready"
              : "needs_role_review"),
          data: mergeCharacterRegionOverrideIntoData(input.data ?? {}, {
            region: input.region,
            ethnicityText: input.ethnicityText,
            castingPreferences: input.castingPreferences,
          }),
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      return { character: characterRowToDto(row as VerticalDramaCharacterRow) };
    }),

  /** Update an existing character's editable fields (tenant + user scoped). */
  updateCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
        role: z.string().trim().max(100).nullable().optional(),
        narrativeRole: narrativeRoleSchema.nullable().optional(),
        roleTier: roleTierSchema.nullable().optional(),
        occupation: z.string().trim().max(160).nullable().optional(),
        roleVisualIntent: roleVisualIntentSchema.nullable().optional(),
        roleProvenance: roleProvenanceSchema.nullable().optional(),
        roleReviewStatus: roleReviewStatusSchema.nullable().optional(),
        data: z.record(z.string(), z.unknown()).nullable().optional(),
        // Per-character ethnicity/region override — see `createCharacter`'s
        // identical fields and `mergeCharacterRegionOverrideIntoData`'s doc
        // comment. `.nullable()` (unlike `createCharacter`'s `.optional()`
        // only) so an already-set override can be explicitly CLEARED back
        // to "inherit the series default" without the caller having to
        // resend the character's entire `data` blob.
        region: z
          .enum(VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS)
          .nullable()
          .optional(),
        ethnicityText: z.string().trim().max(80).nullable().optional(),
        castingPreferences: verticalDramaCharacterCastingPreferencesSchema
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const existingCharacter = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.role !== undefined) patch.role = input.role;
      if (input.narrativeRole !== undefined)
        patch.narrativeRole = input.narrativeRole;
      if (input.roleTier !== undefined) patch.roleTier = input.roleTier;
      if (input.occupation !== undefined) patch.occupation = input.occupation;
      if (input.roleVisualIntent !== undefined)
        patch.roleVisualIntent = input.roleVisualIntent;
      if (input.roleProvenance !== undefined)
        patch.roleProvenance = input.roleProvenance;
      if (input.roleReviewStatus !== undefined)
        patch.roleReviewStatus = input.roleReviewStatus;
      if (
        (input.narrativeRole !== undefined || input.roleTier !== undefined) &&
        input.roleProvenance === undefined
      ) {
        patch.roleProvenance =
          input.narrativeRole && input.roleTier ? "user_confirmed" : "migrated";
        patch.roleReviewStatus =
          input.narrativeRole && input.roleTier ? "ready" : "needs_role_review";
      }
      if (input.data !== undefined) {
        const mergedData = mergeCharacterRegionOverrideIntoData(
          input.data ?? {},
          {
            region: input.region,
            ethnicityText: input.ethnicityText,
            castingPreferences: input.castingPreferences,
          }
        );
        patch.data = stampCharacterManualEdit(mergedData ?? {}, userId);
      } else if (
        input.region !== undefined ||
        input.ethnicityText !== undefined ||
        input.castingPreferences !== undefined
      ) {
        // No caller-supplied `data` replacement this call — merge onto the
        // EXISTING row's `data` instead of wiping every other key (identity
        // lock, wardrobe rules, description, ...) an unrelated
        // region/ethnicityText-only edit must never touch.
        patch.data = mergeCharacterRegionOverrideIntoData(
          (existingCharacter.data as Record<string, unknown> | null) ?? {},
          {
            region: input.region,
            ethnicityText: input.ethnicityText,
            castingPreferences: input.castingPreferences,
          }
        );
      }

      const [row] = await db
        .update(verticalDramaCharacters)
        .set(patch)
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId)
          )
        )
        .returning();

      // W12-A — additive `voiceConfig` field, flag-gated (see
      // `characterRowToDto`'s own doc comment). `updateCharacter` returns the
      // full up-to-date character, so a caller relying on this response to
      // refresh its cache must still see an existing casting after an
      // unrelated name/role edit — `createCharacter` (a fresh insert, never
      // cast yet) intentionally skips this extra flag lookup.
      const voiceChainEnabled =
        await resolveVerticalDramaVoiceChainFlag(tenantId);
      return {
        character: characterRowToDto(row as VerticalDramaCharacterRow, {
          includeVoiceConfig: voiceChainEnabled,
        }),
      };
    }),

  /**
   * Update only the identity-critical portion of an approved Character DNA.
   * This is intentionally separate from `updateCharacter`: a browser must not
   * replace the whole character `data` JSONB blob just to correct a face or
   * age field. The revision predicate makes concurrent edits fail closed.
   */
  updateCharacterIdentityDna: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        expectedRevision: z.number().int().positive(),
        identityDna: verticalDramaCharacterIdentityDnaEditSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const existingCharacter = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );

      const existingData =
        (existingCharacter.data as Record<string, unknown> | null) ?? {};
      const existingVisualBible = existingData.visualBible as
        | Record<string, unknown>
        | undefined;
      const currentRevision =
        readCharacterIdentityDnaRevision(existingVisualBible);
      if (input.expectedRevision !== currentRevision) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Character DNA changed in another session. Refresh the Character tab before saving again.",
        });
      }

      let merged: ReturnType<typeof mergeCharacterIdentityDnaData>;
      try {
        merged = mergeCharacterIdentityDnaData({
          data: existingData,
          edit: input.identityDna,
          now: new Date().toISOString(),
        });
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "A valid Character DNA is required before editing identity DNA.",
        });
      }

      const [row] = await db
        .update(verticalDramaCharacters)
        .set({
          data: stampCharacterManualEdit(merged.data, userId),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
            sql`COALESCE(${verticalDramaCharacters.data}->'visualBible'->'identityDnaRevision', '1'::jsonb) = ${JSON.stringify(currentRevision)}::jsonb`
          )
        )
        .returning();

      if (!row) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Character DNA changed in another session. Refresh the Character tab before saving again.",
        });
      }

      return {
        character: characterRowToDto(row as VerticalDramaCharacterRow),
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* W2 manual CRUD (F5) — variants/twins created directly by the user, not   */
  /* only by the AI variant/twin-planning pipeline                            */
  /* (`planning/vertical-drama-twin-variant-completeness/plan.md` W2)         */
  /* ------------------------------------------------------------------------ */

  /**
   * Manually create a VARIANT of an existing character (same person, a
   * different recurring look — `"outfit"` = same age/face, different
   * clothing; `"age_stage"` = same identity, a different life-stage
   * appearance, loose face reference, NOT locked). Until this mutation, a
   * variant row could ONLY be created by the AI `detectCharacterVariantsNow`/
   * `runImproveScriptJob` pipeline (`reconcileCharacterVariantPlan`) — this
   * is the manual counterpart, using the exact same `characterKey`-
   * generation pattern and `data` shape that pipeline already writes, so a
   * manually-created variant is indistinguishable from an AI-detected one to
   * every downstream consumer (storyboard, render, reconcile).
   *
   * `data.description` is set from `customDescription`, trimmed (falling
   * back to `variantLabel` itself when omitted — `data.description` must
   * never be left empty, since `extractCharacterDescription`'s own contract
   * puts it FIRST in the aggregated prompt string). `"outfit"` variants
   * ALSO set `data.wardrobeRules` from the same text — mirrors
   * `reconcileCharacterVariantPlan`'s own `dataPatch` shape exactly.
   * `"age_stage"` intentionally does NOT lock the face 100% here — that is
   * just a data/fact difference, not a prompt-level lock; the existing
   * skill-first prompt-authoring logic already reads `variantType` to decide
   * locking behavior downstream, so no lock logic belongs in this mutation.
   *
   * `referenceMediaAssetId` (optional): best-effort attaches it as the new
   * variant's `primary_portrait` reference via
   * `bestEffortLinkPrimaryPortrait` (see that helper's doc comment for the
   * "never block the primary mutation" contract).
   */
  createCharacterVariant: verticalDramaProcedure
    .input(
      seriesScope.extend({
        parentCharacterId: z.string().min(1),
        variantLabel: z.string().trim().min(1).max(64),
        variantType: z.enum(["outfit", "age_stage"]),
        customDescription: z.string().trim().max(2000).optional(),
        referenceMediaAssetId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const parentCharacterId = parseId(
        input.parentCharacterId,
        "parent character id"
      );
      await loadOwnedSeries(tenantId, userId, seriesId);
      const parent = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        parentCharacterId
      );

      const usedKeys = await loadSeriesCharacterKeys(
        tenantId,
        userId,
        seriesId
      );
      const characterKey = generateUniqueCharacterKey(
        `${parent.characterKey}-${slugifyForCharacterKey(input.variantLabel)}`,
        usedKeys
      );

      const descriptionText =
        input.customDescription?.trim() || input.variantLabel;
      const dataPatch: Record<string, unknown> = {
        description: descriptionText,
        source: "user_created_variant",
        provenance: {
          userEditedAt: new Date().toISOString(),
          userEditedBy: userId,
          editVersion: 1,
        },
      };
      if (input.variantType === "outfit") {
        dataPatch.wardrobeRules = [descriptionText];
      }

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey,
          name: parent.name,
          role: parent.role,
          narrativeRole: parent.narrativeRole,
          // Keep the person's canonical story role on variants so an
          // outfit/age-stage render cannot silently lose heroine/hero/villain
          // visual intent. `variantType` remains the identity-lock fact.
          roleTier: parent.roleTier,
          occupation: parent.occupation ?? parent.role,
          roleVisualIntent: parent.roleVisualIntent,
          roleProvenance: parent.roleProvenance,
          roleReviewStatus: parent.roleReviewStatus,
          parentCharacterId: parent.id,
          variantLabel: input.variantLabel,
          variantType: input.variantType,
          data: dataPatch,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();
      const character = row as VerticalDramaCharacterRow;

      if (input.referenceMediaAssetId) {
        await bestEffortLinkPrimaryPortrait({
          tenantId,
          userId,
          seriesId,
          characterId: character.id,
          mediaAssetId: parseId(
            input.referenceMediaAssetId,
            "reference media asset id"
          ),
          logSource: "verticalDramaCharacters.createCharacterVariant",
        });
      }

      return { character: characterRowToDto(character) };
    }),

  /**
   * Manually create a TWIN of an existing character — a brand-new,
   * INDEPENDENT character row (its own `name`, its own `id` — NOT a variant:
   * `parentCharacterId`/`variantLabel`/`variantType` are all left null) whose
   * face reference should be resolved from `sharesFaceWithCharacterId`. Until
   * this mutation, a twin row could ONLY be created by the AI pipeline
   * (`reconcileCharacterVariantPlan`'s "identical twin" branch) — this is the
   * manual counterpart.
   *
   * `data.description` is set from `customDescription` — the "distinguishing
   * notes" text that keeps the twin visually distinct from its face-source —
   * mirroring `reconcileCharacterVariantPlan`'s own
   * `newCharacter.distinguishing_notes` -> `dataPatch.description` mapping
   * exactly (same field name/shape).
   *
   * `referenceMediaAssetId` best-effort attach: same convention as
   * `createCharacterVariant` above (see that mutation's + `bestEffortLinkPrimaryPortrait`'s
   * doc comments).
   */
  createCharacterTwin: verticalDramaProcedure
    .input(
      seriesScope.extend({
        sharesFaceWithCharacterId: z.string().min(1),
        name: z.string().trim().min(1).max(255),
        role: z.string().trim().max(100).optional(),
        narrativeRole: narrativeRoleSchema.optional(),
        roleTier: roleTierSchema.optional(),
        occupation: z.string().trim().max(160).optional(),
        customDescription: z.string().trim().max(2000).optional(),
        referenceMediaAssetId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const sourceCharacterId = parseId(
        input.sharesFaceWithCharacterId,
        "source character id"
      );
      await loadOwnedSeries(tenantId, userId, seriesId);
      const source = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        sourceCharacterId
      );

      const usedKeys = await loadSeriesCharacterKeys(
        tenantId,
        userId,
        seriesId
      );
      const characterKey = generateUniqueCharacterKey(
        `${source.characterKey}-twin`,
        usedKeys
      );

      const description = input.customDescription?.trim();

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey,
          name: input.name,
          role: input.role ?? source.role,
          narrativeRole: input.narrativeRole ?? source.narrativeRole,
          roleTier: input.roleTier ?? source.roleTier,
          occupation: input.occupation ?? source.occupation ?? source.role,
          roleProvenance:
            input.narrativeRole || input.roleTier
              ? "user_confirmed"
              : source.roleProvenance,
          roleReviewStatus: input.roleTier ? "ready" : source.roleReviewStatus,
          sharesFaceWithCharacterId: source.id,
          data: description ? { description } : null,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();
      const character = row as VerticalDramaCharacterRow;

      if (input.referenceMediaAssetId) {
        await bestEffortLinkPrimaryPortrait({
          tenantId,
          userId,
          seriesId,
          characterId: character.id,
          mediaAssetId: parseId(
            input.referenceMediaAssetId,
            "reference media asset id"
          ),
          logSource: "verticalDramaCharacters.createCharacterTwin",
        });
      }

      return { character: characterRowToDto(character) };
    }),

  /**
   * Permanently delete a character row (tenant + user + series scoped).
   * BLOCKS (never cascades) when any other row in the series still points at
   * this one via `parentCharacterId` or `sharesFaceWithCharacterId` —
   * product decision confirmed via a prior AskUserQuestion in this same plan
   * (`planning/vertical-drama-twin-variant-completeness/plan.md`): the user
   * must delete every dependent variant/twin first. This app-level
   * precondition check exists so the caller gets a clear, actionable Thai
   * message INSTEAD OF a raw Postgres FK constraint error — both self-FK
   * columns (`parentCharacterId`/`sharesFaceWithCharacterId`) have no
   * `onDelete` configured on `verticalDramaCharacters` (Postgres default
   * `NO ACTION`), so an unblocked delete attempt would throw a lower-level
   * DB error anyway.
   *
   * The character's own asset links (`vertical_drama_character_assets`) are
   * NOT explicitly deleted here first — that table's `characterId` FK is
   * declared `onDelete: "cascade"` in `drizzle/schema.ts`, so the database
   * removes them automatically; a redundant manual delete here would just be
   * dead code.
   */
  deleteCharacter: verticalDramaProcedure
    .input(seriesScope.extend({ characterId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );

      const dependents = await db
        .select({ id: verticalDramaCharacters.id })
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
            or(
              eq(verticalDramaCharacters.parentCharacterId, characterId),
              eq(verticalDramaCharacters.sharesFaceWithCharacterId, characterId)
            )
          )
        )
        .limit(1);
      if (dependents.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้",
        });
      }

      const deleteCharacterRow = async (tx: any) => {
        if (character.parentCharacterId != null) {
          const [parent] = await tx
            .select({ characterKey: verticalDramaCharacters.characterKey })
            .from(verticalDramaCharacters)
            .where(
              and(
                eq(verticalDramaCharacters.id, character.parentCharacterId),
                eq(verticalDramaCharacters.tenantId, tenantId),
                eq(verticalDramaCharacters.userId, userId),
                eq(verticalDramaCharacters.seriesId, seriesId)
              )
            )
            .limit(1);
          if (!parent) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "ไม่พบตัวละครหลักสำหรับลุคนี้ จึงยังลบลุคไม่ได้",
            });
          }

          const episodes = await tx
            .select({
              id: verticalDramaEpisodes.id,
              startFramePlan: verticalDramaEpisodes.startFramePlan,
            })
            .from(verticalDramaEpisodes)
            .where(
              and(
                eq(verticalDramaEpisodes.tenantId, tenantId),
                eq(verticalDramaEpisodes.userId, userId),
                eq(verticalDramaEpisodes.seriesId, seriesId)
              )
            );

          for (const episode of episodes) {
            const existingPlan =
              episode.startFramePlan as VerticalDramaStartFramePlan | null;
            if (!existingPlan) continue;
            const repaired = repairStartFramePlanAfterLookDeletion({
              plan: existingPlan,
              deletedLookKey: character.characterKey,
              parentCharacterKey: parent.characterKey,
            });
            if (repaired.changedShots.length === 0) continue;
            await tx
              .update(verticalDramaEpisodes)
              .set({ startFramePlan: repaired.plan, updatedAt: new Date() })
              .where(
                and(
                  eq(verticalDramaEpisodes.id, episode.id),
                  eq(verticalDramaEpisodes.tenantId, tenantId),
                  eq(verticalDramaEpisodes.userId, userId),
                  eq(verticalDramaEpisodes.seriesId, seriesId)
                )
              );
          }
        }

        await tx
          .delete(verticalDramaCharacters)
          .where(
            and(
              eq(verticalDramaCharacters.id, characterId),
              eq(verticalDramaCharacters.tenantId, tenantId),
              eq(verticalDramaCharacters.userId, userId),
              eq(verticalDramaCharacters.seriesId, seriesId)
            )
          );
      };

      await db.transaction(deleteCharacterRow);

      return { success: true };
    }),

  /**
   * Manually trigger the SAME season-wide character variant/twin detection
   * `runImproveScriptJob`'s best-effort final phase already runs
   * automatically after a script-improve pass (see
   * `verticalDramaImproveScript.ts` step (g)) — this is the direct-trigger
   * counterpart, callable on demand instead of only after an improve-script
   * run. Reuses the EXACT same roster-building (`existing*CharacterKey`
   * markers, W3 stable-ID reconcile, `extractCharacterRosterDescription`)
   * and the exact same `generateCharacterVariantPlan` ->
   * `reconcileCharacterVariantPlan` call pair, just run against the series'
   * CURRENT drafted episode content instead of a just-improved one.
   *
   * `verticalDramaCharacterVariantPlanner`/`verticalDramaStoryBible` are
   * loaded via a DYNAMIC `import()` INSIDE this procedure (never a static
   * top-level import) — same "dynamic import, never static" convention this
   * file's `listVoiceCatalog` already documents for `./media`:
   * `verticalDramaCharacterVariantPlanner.ts`'s module graph transitively
   * pulls in `verticalDramaStoryBible.ts` and `verticalDramaImproveScript.ts`
   * (a heavy, DB/skill-registry-touching service pair), which this file's
   * existing minimal-mock test suites (`modelSelection.test.ts`,
   * `extractDescription.test.ts`, `voiceChain.test.ts`) do not mock — a
   * static import would break them the moment this file loads.
   *
   * Credit-gated by `generateCharacterVariantPlan` ITSELF
   * (`hasEnoughCredits`/`deductCredits` live inside that function, exactly
   * as `runImproveScriptJob` already relies on) — this mutation invents no
   * separate credit-charging scheme of its own, matching that established
   * pattern.
   *
   * Throws `PRECONDITION_FAILED` when there is no usable episode content (no
   * drafted episode) or no character roster to plan against — unlike
   * `runImproveScriptJob`'s best-effort silent skip (appropriate there,
   * since it's a bonus final phase of a larger job), a direct user action
   * must tell the caller clearly why nothing happened.
   */
  detectCharacterVariantsNow: verticalDramaProcedure
    .input(seriesScope)
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      return enqueueVerticalDramaInteractiveJob({
        kind: "character_variants",
        tenantId,
        userId,
        scopeKey: `series:${seriesId}`,
        skillSlug: "vertical-drama-character-variant-planner",
        idempotencyKey: `character-variants:${seriesId}`,
        input: { seriesId },
      });

      const [seriesRow] = await db
        .select({
          locale: verticalDramaSeries.locale,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? {};
      const lang: StoryScriptLang = seriesRow?.locale === "th" ? "th" : "en";

      const {
        getActiveBreakdown,
        readItemShotDrafts,
        readItemCliffhangerLine,
      } = await import("../services/verticalDramaStoryBible");
      const {
        generateCharacterVariantPlan,
        reconcileCharacterVariantPlan,
        extractCharacterRosterDescription,
        InsufficientCreditsError,
        VdSchemaValidationError,
      } = await import("../services/verticalDramaCharacterVariantPlanner");

      const activeItems = getActiveBreakdown(bible);
      const draftedItems = activeItems.filter(
        item => readItemShotDrafts(item) !== null
      );
      if (draftedItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate deep story drafts first before detecting character variants/twins",
        });
      }
      const episodes: StoryScriptEpisodeInput[] = draftedItems.map(item => ({
        episodeNumber: item.episodeNumber,
        workingTitle: item.workingTitle,
        logline: item.logline,
        keyBeats: item.keyBeats,
        shotDrafts: readItemShotDrafts(item),
        cliffhangerLine: readItemCliffhangerLine(item),
      }));

      const characterRows: VerticalDramaCharacterRow[] = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId)
          )
        );
      // Same W3 stable-ID roster-building `runImproveScriptJob` step (g)
      // already does — EVERY row (base/variant/twin alike) is sent back,
      // carrying `existing*CharacterKey` markers so the skill can recognize
      // "this is already known" (see `verticalDramaCharacterVariantPlanner.ts`'s
      // `reconcileCharacterVariantPlan` doc comment for the matching side).
      const characterKeyById = new Map<number, string>(
        characterRows.map(row => [row.id, row.characterKey])
      );
      const characterInputs: CharacterVariantPlannerCharacterInput[] =
        characterRows.map(row => {
          const rowInput: CharacterVariantPlannerCharacterInput = {
            characterKey: row.characterKey,
            name: row.name,
            role: row.role ?? "",
            description: extractCharacterRosterDescription(
              (row.data as Record<string, unknown> | null) ?? null
            ),
          };
          if (row.parentCharacterId != null) {
            const parentKey = characterKeyById.get(row.parentCharacterId);
            if (parentKey) rowInput.existingParentCharacterKey = parentKey;
            if (row.variantLabel)
              rowInput.existingVariantLabel = row.variantLabel;
          }
          if (row.sharesFaceWithCharacterId != null) {
            const sourceKey = characterKeyById.get(
              row.sharesFaceWithCharacterId
            );
            if (sourceKey)
              rowInput.existingSharesFaceWithCharacterKey = sourceKey;
          }
          return rowInput;
        });

      if (characterInputs.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No characters in the roster to detect variants/twins for",
        });
      }

      let planResult: Awaited<ReturnType<typeof generateCharacterVariantPlan>>;
      try {
        planResult = await generateCharacterVariantPlan({
          userId,
          tenantId,
          seriesId,
          lang,
          characters: characterInputs,
          episodes,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: String(err),
          });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: String(err),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: String(err),
        });
      }

      const summary = await reconcileCharacterVariantPlan(
        { tenantId, userId, seriesId },
        planResult.plan
      );

      return {
        variantsCreated: summary.createdCharacters.filter(
          c => c.variantLabel !== null
        ).length,
        variantsUpdated: summary.updatedCharacters.length,
        twinsCreated: summary.createdCharacters.filter(
          c => c.variantLabel === null
        ).length,
        createdCharacters: summary.createdCharacters,
        updatedCharacters: summary.updatedCharacters,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* Character identity repair (`planning/vd-character-identity-repair/       */
  /* plan.md` Phase 3) — propose -> user confirms each group -> merge.        */
  /* NEVER auto-applied; story text is NEVER rewritten (binding user          */
  /* decisions, see that plan's "Decisions" section).                        */
  /* ------------------------------------------------------------------------ */

  /**
   * PROPOSAL ONLY — never merges/deletes/renames anything. Reads this
   * series' roster + Story Bible `refinedCharacters` cast + active
   * deep-draft season script, computes per-roster-row occurrence FACTS in
   * TS (per `feedback_skill_first_authoring` — TS computes facts, the LLM
   * judges), and invokes the `vertical-drama-character-identity-reconciler`
   * skill to decide which roster rows are the SAME person under a drifted
   * spelling/short form versus genuinely distinct characters. Returns a
   * FULL PARTITION of the roster — every character ends up in exactly one
   * returned group (a lone/non-duplicate character gets its own singleton
   * group, `isSingleton: true`).
   *
   * `verticalDramaStoryBible`/`verticalDramaCharacterMerge` are loaded via a
   * DYNAMIC `import()` INSIDE this procedure (never a static top-level
   * import) — same "dynamic import, never static" convention this file's
   * `detectCharacterVariantsNow` already documents for the identical
   * problem (this router's existing minimal-mock test suites do not mock
   * either module's heavy transitive chain).
   *
   * Credit-gated by `generateCharacterDuplicateAnalysis` ITSELF
   * (`hasEnoughCredits`/`deductCredits` live inside that function) — this
   * mutation invents no separate credit-charging scheme of its own, same
   * established pattern as `detectCharacterVariantsNow`/`detectLocationsNow`.
   *
   * Throws `PRECONDITION_FAILED` when the roster is empty — there is
   * nothing to analyze. DELIBERATE DIVERGENCE from `detectCharacterVariantsNow`:
   * an empty drafted-episode set is NOT a precondition failure here — the
   * analysis can still run on bible-name matching + existing-alias evidence
   * alone (occurrence counts simply read as zero), so a series with
   * duplicates but no deep-draft yet still gets a usable (if
   * lower-confidence) proposal instead of being blocked outright.
   */
  analyzeCharacterDuplicates: verticalDramaProcedure
    .input(seriesScope)
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      return enqueueVerticalDramaInteractiveJob({
        kind: "character_duplicates",
        tenantId,
        userId,
        scopeKey: `series:${seriesId}`,
        skillSlug: "vertical-drama-character-identity-reconciler",
        idempotencyKey: `character-duplicates:${seriesId}`,
        input: { seriesId },
      });

      const [seriesRow] = await db
        .select({
          locale: verticalDramaSeries.locale,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? {};
      const lang: StoryScriptLang = seriesRow?.locale === "th" ? "th" : "en";

      const {
        getActiveBreakdown,
        readItemShotDrafts,
        readItemCliffhangerLine,
        readBibleRefinedCharacterProfiles,
      } = await import("../services/verticalDramaStoryBible");
      const {
        analyzeCharacterDuplicates: runAnalyzeCharacterDuplicates,
        InsufficientCreditsError,
        VdSchemaValidationError,
      } = await import("../services/verticalDramaCharacterMerge");

      const activeItems = getActiveBreakdown(bible);
      const draftedItems = activeItems.filter(
        item => readItemShotDrafts(item) !== null
      );
      const episodes: StoryScriptEpisodeInput[] = draftedItems.map(item => ({
        episodeNumber: item.episodeNumber,
        workingTitle: item.workingTitle,
        logline: item.logline,
        keyBeats: item.keyBeats,
        shotDrafts: readItemShotDrafts(item),
        cliffhangerLine: readItemCliffhangerLine(item),
      }));

      const bibleCharacters = readBibleRefinedCharacterProfiles(bible).map(
        c => ({
          name: c.name,
          narrativeRole: c.narrativeRole ?? null,
          roleTier: c.roleTier ?? null,
          occupation: c.occupation ?? null,
        })
      );

      let result: Awaited<ReturnType<typeof runAnalyzeCharacterDuplicates>>;
      try {
        result = await runAnalyzeCharacterDuplicates(
          { tenantId, userId, seriesId },
          { lang, bibleCharacters, episodes }
        );
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: String(err),
          });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: String(err),
          });
        }
        if (String(err) === "no_characters") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "ยังไม่มีตัวละครในซีรีย์นี้ให้ตรวจสอบความซ้ำ",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: String(err),
        });
      }

      return {
        model: result.model,
        creditsUsed: result.creditsUsed,
        groups: result.groups.map(group => ({
          canonicalCharacterId: String(group.canonicalCharacterId),
          canonicalCharacterKey: group.canonicalCharacterKey,
          canonicalName: group.canonicalName,
          canonicalMatchesBibleCharacter: group.canonicalMatchesBibleCharacter,
          duplicateCharacterIds: group.duplicateCharacterIds.map(String),
          duplicates: group.duplicates.map(d => ({
            characterId: String(d.characterId),
            characterKey: d.characterKey,
            name: d.name,
          })),
          aliasesToRecord: group.aliasesToRecord,
          evidence: group.evidence.map(e => ({
            characterId: String(e.characterId),
            characterKey: e.characterKey,
            name: e.name,
            narrativeRole: e.narrativeRole ?? undefined,
            roleTier: e.roleTier ?? undefined,
            roleReviewStatus: e.roleReviewStatus ?? undefined,
            dataSource: e.dataSource ?? undefined,
            matchesBibleCharacterExactly: e.matchesBibleCharacterExactly,
            shotCharacterOccurrences: e.shotCharacterOccurrences,
            dialogueSpeakerOccurrences: e.dialogueSpeakerOccurrences,
            episodeNumbersSeenIn: e.episodeNumbersSeenIn,
            existingAliases: e.existingAliases,
          })),
          reasoning: group.reasoning,
          confidence: group.confidence,
          isSingleton: group.isSingleton,
          autoFallback: group.autoFallback,
        })),
      };
    }),

  /**
   * The ONLY mutation that actually merges/deletes anything for this
   * feature. Takes an explicit, user-CONFIRMED
   * `{ keepCharacterId, mergeCharacterIds[] }` — normally copied straight
   * from one of `analyzeCharacterDuplicates`'s proposed groups — and is
   * NEVER invoked automatically. Delegates the entire ordered merge
   * sequence (alias recording, self-FK repoint, asset repoint,
   * `startFramePlan` rewrite, delete) to
   * `verticalDramaCharacterMerge.ts`'s `mergeCharacters`, which runs inside
   * ONE `db.transaction` — see that function's own doc comment for the
   * exact order and why it matters (the self-FK repoint MUST precede the
   * delete, mirroring `deleteCharacter`'s own PRECONDITION_FAILED guard
   * above).
   *
   * Story text (`bible.breakdownVersions[]` shot/dialogue content) is NEVER
   * rewritten — a merged row's own name becomes a registered ALIAS of the
   * surviving row instead (binding user decision,
   * `planning/vd-character-identity-repair/plan.md` "Decisions" §2).
   */
  mergeCharacters: verticalDramaProcedure
    .input(
      seriesScope.extend({
        keepCharacterId: z.string().min(1),
        mergeCharacterIds: z.array(z.string().min(1)).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const keepCharacterId = parseId(
        input.keepCharacterId,
        "keep character id"
      );
      const mergeCharacterIds = input.mergeCharacterIds.map(id =>
        parseId(id, "merge character id")
      );

      const { mergeCharacters: runMergeCharacters, VdCharacterMergeError } =
        await import("../services/verticalDramaCharacterMerge");

      try {
        const summary = await runMergeCharacters(
          { tenantId, userId, seriesId },
          { keepCharacterId, mergeCharacterIds }
        );
        return {
          keptCharacterId: String(summary.keptCharacterId),
          mergedCharacterIds: summary.mergedCharacterIds.map(String),
          aliasesRecorded: summary.aliasesRecorded,
          aliasesCarriedOver: summary.aliasesCarriedOver,
          dependentsRepointed: summary.dependentsRepointed,
          assetsRepointed: summary.assetsRepointed,
          episodesRewritten: summary.episodesRewritten.map(e => ({
            episodeId: String(e.episodeId),
            episodeNumber: e.episodeNumber,
            shotsChanged: e.shotsChanged,
          })),
        };
      } catch (err) {
        if (err instanceof VdCharacterMergeError) {
          switch (err.reason) {
            case "keep_in_merge_list":
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "ตัวละครที่ต้องการเก็บไว้ต้องไม่อยู่ในรายการตัวละครที่จะรวมเข้าด้วยกัน",
              });
            case "empty_merge_list":
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "ต้องระบุตัวละครอย่างน้อยหนึ่งตัวที่จะรวมเข้ากับตัวละครหลัก",
              });
            case "row_not_found":
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "ไม่พบตัวละครบางตัวในซีรีย์นี้",
              });
            default:
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: err.message,
              });
          }
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Character merge failed",
        });
      }
    }),

  /**
   * Attach an existing canonical `media_assets` row as a durable character /
   * product reference. The media asset is validated for tenant + user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   * The new link starts in `generated`/`imported` — approval is never implicit.
   */
  linkAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1).optional(),
        mediaAssetId: z.string().min(1).optional(),
        assetType: z.string().min(1).max(40).default("character_reference"),
        role: z.string().max(40).optional(),
        source: z.enum(["generated", "imported"]),
        containsHumanFace: z.boolean().optional(),
        checksumSha256: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      let characterId: number | null = null;
      if (input.characterId != null) {
        characterId = parseId(input.characterId, "character id");
        await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      }

      const mediaAssetId =
        input.mediaAssetId != null
          ? parseId(input.mediaAssetId, "media asset id")
          : null;

      try {
        const asset = await verticalDramaCharacterStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          characterId,
          mediaAssetId,
          assetType: input.assetType,
          role: input.role ?? null,
          source: input.source,
          containsHumanFace: input.containsHumanFace ?? null,
          checksumSha256: input.checksumSha256 ?? null,
          metadata: input.metadata ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /** Persist one completed angle-pack render as a reviewable generated asset. */
  linkCharacterAngleAsset: verticalDramaCharacterAnglePackProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        mediaAssetId: z.string().min(1),
        role: z.enum(VERTICAL_DRAMA_CHARACTER_ANGLE_ROLES),
        anglePackId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      const mediaAssetId = parseId(input.mediaAssetId, "media asset id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      try {
        const asset = await verticalDramaCharacterStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          characterId,
          mediaAssetId,
          assetType: "character_reference",
          role: input.role,
          source: "generated",
          containsHumanFace: true,
          approvalRequired: true,
          metadata: {
            ...(input.anglePackId ? { anglePackId: input.anglePackId } : {}),
            angleRole: input.role,
          },
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Resolve a Library item or an already-hosted URL (Media History result,
   * or a client-uploaded 3x3-cutter tile via `ai.upload`) into a canonical
   * `media_assets` row, so drag-and-drop from those surfaces can call
   * `linkAsset` immediately — no manual "Media asset ID" entry required.
   *
   * Two branches only:
   *  - `"library"`: looks up the `library_items` row scoped to the caller's
   *    own tenant + ownership (NOT_FOUND if missing/not owned — never
   *    discloses another owner's row), derives a mime type from `itemType`,
   *    then registers it via `createAssetFromAttachment` (idempotent —
   *    dedupes by checksum(tenantId+userId), so re-dropping the same item
   *    is safe and returns the same asset id).
   *  - `"url"`: directly registers an already-accessible URL (a Media
   *    History task's `resultUrl`, or the `url` returned by `ai.upload`
   *    after the frontend uploads a cutter tile / data URL itself) via the
   *    SAME `createAssetFromAttachment` call. No server-side re-fetch of
   *    provider task state — the frontend already has the URL.
   *
   * This does real storage-adjacent DB writes, so it shares the same
   * `mediaGenerationLimiter` per-user cap this router already uses for its
   * paid generation mutations.
   */
  resolveMediaAssetForImport: verticalDramaProcedure
    .input(
      z.intersection(
        seriesScope,
        z.discriminatedUnion("source", [
          z.object({
            source: z.literal("library"),
            libraryItemId: z.number().int().positive(),
          }),
          z.object({
            source: z.literal("url"),
            // Not `.url()` — local storage's `ai.upload` returns a relative
            // path (`/uploads/...`), which is a valid `storageKey`/`originalUrl`
            // for `createAssetFromAttachment` below but fails a strict absolute-URL
            // check. Same fix as the gallery's URL validation (see project memory).
            url: z.string().min(1),
            mimeType: z.string().min(1),
            fileName: z.string().optional(),
          }),
        ])
      )
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      if (input.source === "library") {
        const [item] = await db
          .select({
            id: libraryItems.id,
            tenantId: libraryItems.tenantId,
            ownerUserId: libraryItems.ownerUserId,
            itemType: libraryItems.itemType,
            sourceUrl: libraryItems.sourceUrl,
          })
          .from(libraryItems)
          .where(
            and(
              eq(libraryItems.id, input.libraryItemId),
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, userId)
            )
          )
          .limit(1);
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Library item not found",
          });
        }
        if (!item.sourceUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Library item has no source URL to import",
          });
        }

        let mimeType: string;
        if (item.itemType === "image") mimeType = "image/jpeg";
        else if (item.itemType === "video") mimeType = "video/mp4";
        else if (item.itemType === "audio") mimeType = "audio/mpeg";
        else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Library item type "${item.itemType}" is not importable as a character reference`,
          });
        }

        // `createAssetFromAttachment`'s context type requires
        // conversationId/messageId/projectId (chat-attachment-shaped), but
        // those columns are nullable in `media_assets` and irrelevant here —
        // this mirrors the `as any` cast `chat.ts` itself uses at its own
        // call site rather than modifying the (out-of-scope) service file.
        const { assetId } = await createAssetFromAttachment(
          { type: item.itemType === "video" ? "video" : "image", url: item.sourceUrl, mimeType } as any,
          { tenantId, userId } as any
        );
        return { mediaAssetId: String(assetId) };
      }

      // source === "url"
      // A completed Vertical Drama task already points at an owner-scoped
      // managed object. Re-register/reuse that ready asset directly instead
      // of sending the managed URL through the generic attachment importer,
      // which would create a pending chat_attachment duplicate.
      const managedStorageKey = extractVerticalDramaManagedMediaKey(input.url);
      if (managedStorageKey) {
        const managedAsset = await ensureVerticalDramaManagedMediaAsset({
          tenantId,
          userId,
          sourceUrl: input.url,
          mediaType: input.mimeType.toLowerCase().startsWith("video/")
            ? "video"
            : "image",
          mimeType: input.mimeType,
        });
        if (managedAsset) return { mediaAssetId: String(managedAsset.mediaAssetId) };
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Managed media result is missing or expired",
        });
      }
      const { assetId } = await createAssetFromAttachment(
        {
          type: input.mimeType.toLowerCase().startsWith("video/")
            ? "video"
            : input.mimeType.toLowerCase().startsWith("audio/")
              ? "audio"
              : "image",
          url: input.url,
          mimeType: input.mimeType,
        } as any,
        { tenantId, userId } as any
      );
      return { mediaAssetId: String(assetId) };
    }),

  /**
   * Approve a pending reference asset (explicit review gate — the state machine
   * forbids skipping review). Thin wrapper over `transitionAsset(to: "approved")`.
   */
  approveAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: "approved",
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Apply an arbitrary lifecycle transition to a reference asset (draft ->
   * generated/imported -> approved / rejected / stale). Illegal transitions
   * surface as PRECONDITION_FAILED. A `rejectionReason` is recorded when
   * transitioning to `rejected`.
   */
  transitionAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkId: z.string().min(1),
        to: assetStateEnum,
        rejectionReason: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: input.to as (typeof VERTICAL_DRAMA_CHARACTER_ASSET_STATES)[number],
          rejectionReason: input.rejectionReason ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Mark a set of approved references stale (e.g. after an identity change).
   * Returns the number of assets actually transitioned to `stale`.
   */
  markStale: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkIds: z.array(z.string().min(1)).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const ids = input.assetLinkIds.map(id => parseId(id, "asset link id"));
      const staleCount = await verticalDramaCharacterStockService.markStale(
        { tenantId, userId, seriesId },
        ids
      );
      return { staleCount };
    }),

  /**
   * Permanently remove a reference asset from a character's stock (product
   * decision 2026-07-05: replaces the approve/reject/stale QC workflow for
   * character references with a plain add/delete model). Only unlinks the
   * `verticalDramaCharacterAssets` row — the underlying media asset is left
   * intact in Media History/Library.
   */
  deleteAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        await verticalDramaCharacterStockService.deleteAsset(
          { tenantId, userId, seriesId },
          assetLinkId
        );
        return { deleted: true };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Preview-only leg of the character portrait/sheet flow: runs ONLY the
   * `generateCharacterVisualPrompts` LLM call (the same step-1 credit-gated
   * call `generateCharacterImage`/`generateCharacterSheet` perform
   * internally) and returns the resulting prompt text WITHOUT rendering an
   * image. This lets the frontend show the actual prompt for user approval
   * before any image-render credit is spent. Charges exactly the one
   * prompt-generation credit (via `generateCharacterVisualPrompts` itself) —
   * the caller then passes the approved text back as `approvedPrompt` /
   * `approvedNegativePrompt` on `generateCharacterImage` or
   * `generateCharacterSheet` so that LLM leg is never re-run (and never
   * double-charged) for the same spend. This preview only ever runs the
   * plain-turnaround leg (no `requestedSheetType`) — it does not (and, per
   * the plan, need not) preview any of the 14 Character Design Bible sheet
   * formats.
   */
  previewCharacterPrompt: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
        portraitCandidateCount: z.number().int().min(1).max(5).optional(),
        castingReferenceAssetLinkIds: z
          .array(z.string().trim().min(1))
          .min(1)
          .max(CHARACTER_CANDIDATE_PROMPT_MAX_REFERENCES)
          .optional(),
        castingLockClothing: z.boolean().optional(),
        castingPoseMode: z.enum(["auto_natural", "lock_reference"]).optional(),
        castingCameraFraming: z
          .enum([
            "full_body",
            "three_quarter",
            "half_body",
            "medium_close_up",
            "close_up",
            "extreme_close_up",
            "wide_environmental",
          ])
          .optional(),
        // Free-text visual brief (framing/pose/crop/mood/outfit/setting/etc.)
        // for THIS generation only. It is passed through to
        // `generateCharacterVisualPrompts` as a raw fact, then
        // enforced in the previewed render prompt by
        // `customInstruction` is passed to the active Visual Bible Skill as
        // data; the skill owns precedence and wording for the generated
        // prompt. This is the PRIMARY path because the UI previews first.
        customInstruction: z.string().trim().max(500).optional(),
        // Internal BullMQ bridge fields. They are never accepted from a
        // browser as a synchronous bypass; the worker must prove ownership of
        // the durable job before this expensive handler is entered.
        workerJobId: z.string().uuid().optional(),
        workerExecutionToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const hasWorkerJobId = Boolean(input.workerJobId);
      const hasWorkerToken = Boolean(input.workerExecutionToken);
      const workerExecutionRequested = hasWorkerJobId || hasWorkerToken;
      if (
        process.env.NODE_ENV !== "test" &&
        workerExecutionRequested &&
        (!hasWorkerJobId ||
          !hasWorkerToken ||
          !isVerticalDramaCharacterPromptWorkerExecution(
            input.workerJobId!,
            input.workerExecutionToken!
          ))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Character prompt preview worker authorization is invalid",
        });
      }

      // Production/browser calls only submit a durable job. This is the
      // important boundary: the LLM call below is reached only by BullMQ, so
      // Cloudflare/HTTP proxy timeouts cannot turn a completed prompt into a
      // lost result or encourage the user to pay and retry twice.
      if (process.env.NODE_ENV !== "test" && !workerExecutionRequested) {
        const rateLimitKey = `user:${ctx.user.id}`;
        if (!characterPromptLimiter.isAllowed(rateLimitKey)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded for character prompt generation. Try again in ${Math.ceil(characterPromptLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
          });
        }
        const tenantId = requireTenantId(ctx.tenantId);
        const userId = ctx.user.id;
        const seriesId = parseId(input.seriesId, "series id");
        const characterId = parseId(input.characterId, "character id");
        await loadOwnedSeries(tenantId, userId, seriesId);
        const queuedCharacter = await loadOwnedCharacter(
          tenantId,
          userId,
          seriesId,
          characterId
        );
        rejectBaseAdultChildRequest({
          character: queuedCharacter,
          customInstruction: input.customInstruction,
        });
        const jobInput: VerticalDramaCharacterPromptJobInput = {
          seriesId: input.seriesId,
          characterId: input.characterId,
          ...(input.selectedImageModelId
            ? { selectedImageModelId: input.selectedImageModelId }
            : {}),
          ...(input.portraitCandidateCount
            ? { portraitCandidateCount: input.portraitCandidateCount }
            : {}),
          ...(input.customInstruction
            ? { customInstruction: input.customInstruction }
            : {}),
          ...(input.castingReferenceAssetLinkIds
            ? {
                castingReferenceAssetLinkIds:
                  input.castingReferenceAssetLinkIds,
              }
            : {}),
          ...(input.castingLockClothing !== undefined
            ? { castingLockClothing: input.castingLockClothing }
            : {}),
          ...(input.castingPoseMode
            ? { castingPoseMode: input.castingPoseMode }
            : {}),
          ...(input.castingCameraFraming
            ? { castingCameraFraming: input.castingCameraFraming }
            : {}),
        };
        const job = await enqueueVerticalDramaCharacterPromptJob({
          tenantId,
          userId,
          seriesId,
          characterId,
          publicUrl: ctx.publicUrl ?? null,
          input: jobInput,
        });
        return {
          mode: "job" as const,
          jobId: job.jobId,
          status: job.status,
          deduped: job.deduped,
        };
      }

      const rateLimitKey = `user:${ctx.user.id}`;
      if (!characterPromptLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for character prompt generation. Try again in ${Math.ceil(characterPromptLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );
      rejectBaseAdultChildRequest({
        character,
        customInstruction: input.customInstruction,
      });
      let previewPromptCapability:
        | VerticalDramaCharacterPromptCapability
        | undefined;
      if (input.selectedImageModelId) {
        try {
          const previewModelId = await resolveCharacterImageModelId(
            input.selectedImageModelId
          );
          previewPromptCapability =
            await resolveCharacterPromptCapabilityForModel(previewModelId);
        } catch (error) {
          return mapCharacterPromptContractError(error);
        }
      }

      const [seriesRow] = await db
        .select({
          id: verticalDramaSeries.id,
          title: verticalDramaSeries.title,
          locale: verticalDramaSeries.locale,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          targetAudience: verticalDramaSeries.targetAudience,
          bible: verticalDramaSeries.bible,
          updatedAt: verticalDramaSeries.updatedAt,
          // Season lineage (plan Stage 2.3) — feeds `loadCharacterDesignContext`'s
          // `crossSeriesUniqueness` parent exclusion so a sequel is never told
          // to differ from its own previous-season self.
          parentSeriesId: verticalDramaSeries.parentSeriesId,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Item 1 (planning/vd-character-prompt-followups/plan.md, 2026-07-31) —
      // was this series-level region actually CHOSEN by the series owner, as
      // opposed to the un-set global fallback nobody picked? Threaded into
      // `resolveCharacterTargetAudienceRegion` below so the D1/D2
      // deterministic enforcement layers also cover an explicit series
      // default, never a fallback nobody selected.
      const seriesRegionIsExplicit = isTargetAudienceRegionExplicitlySetInBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Per-character ethnicity/region override (planning/vd-per-character-
      // ethnicity/plan.md) — OVERRIDES the series default resolved above at
      // this call site. `isExplicit: false` (no per-character override set)
      // resolves to the exact same `targetAudienceRegion` used today, so an
      // untouched character's generation stays byte-identical.
      const resolvedCharacterRegion = resolveCharacterTargetAudienceRegion(
        readLegacyCharacterRegionOverrideForGeneration(
          (character.data as Record<string, unknown> | null) ?? null
        ),
        targetAudienceRegion,
        seriesRegionIsExplicit
      );
      const characterCastingPreferences =
        readCharacterCastingPreferencesFromData(
          (character.data as Record<string, unknown> | null) ?? null
        );
      const { identity: presetVisualIdentity, lookLockEnabled } =
        await resolveCharacterPresetVisualIdentity(
          tenantId,
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );

      // Merge the roster row's role/occupation/description with the series
      // bible's `refinedCharacters` entry for this character (see
      // `resolveEffectiveCharacterFacts`'s own doc comment — traceId
      // Ytrq5TrfJRzyFNRLasyV8 / `planning/vd-character-visual-bible-occupation-fix/plan.md`).
      const effectiveCharacterFacts = resolveEffectiveCharacterFacts(
        {
          name: character.name,
          role: character.role,
          occupation: character.occupation,
          data: (character.data as Record<string, unknown> | null) ?? null,
        },
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      const description = effectiveCharacterFacts.description;
      const faceSourceReference = await resolveFaceSourceReferenceForCharacter(
        { tenantId, userId, seriesId },
        character
      );
      const characterDesignContext = seriesRow
        ? await loadCharacterDesignContext(
            { tenantId, userId },
            seriesRow,
            character
          )
        : undefined;

      const characterData =
        (character.data as Record<string, unknown> | null) ?? {};
      const castingAgeProfile = resolveCharacterCastingAgeProfile({
        age: characterData.age,
        ageMin: characterData.ageMin,
        ageMax: characterData.ageMax,
        ageRange:
          characterData.ageRange ??
          readCharacterVisualBibleAgeRange(characterData),
        ageStage: characterData.ageStage,
        approvedDnaAgeRange:
          characterDesignContext?.approvedDesignDna?.ageRange,
        role: effectiveCharacterFacts.role,
        narrativeRole: character.narrativeRole,
        roleTier: character.roleTier,
        occupation: effectiveCharacterFacts.occupation,
        description,
      });

      const castingReferenceAssetLinkIds =
        input.castingReferenceAssetLinkIds?.map(id =>
          parseId(id, "casting reference asset link id")
        );
      if (
        input.portraitCandidateCount &&
        castingReferenceAssetLinkIds?.length
      ) {
        let castingReferenceUrls: string[];
        try {
          castingReferenceUrls =
            await verticalDramaCharacterStockService.getCharacterReferenceImageUrls(
              { tenantId, userId, seriesId },
              characterId,
              castingReferenceAssetLinkIds
            );
        } catch (err) {
          mapStockError(err);
        }
        const visionReferenceUrls =
          (await resolveExternalMediaReferenceUrls(
            castingReferenceUrls,
            { userId, tenantId },
            ctx.publicUrl
          )) ?? [];
        if (visionReferenceUrls.length !== castingReferenceUrls.length) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "One or more casting reference images could not be resolved for the prompt skill.",
          });
        }

        if (!castingAgeProfile) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "ไม่สามารถกำหนดช่วงอายุสำหรับ casting ได้จาก DNA/บทบาทของตัวละคร กรุณาเติมรายละเอียดบทบาทหรือช่วงอายุในข้อมูลตัวละครก่อน",
          });
        }
        const genderPresentation =
          typeof characterData.genderPresentation === "string" &&
          characterData.genderPresentation.trim()
            ? characterData.genderPresentation.trim()
            : typeof characterData.gender === "string" &&
                characterData.gender.trim()
              ? characterData.gender.trim()
              : "as established by the character profile";
        const ethnicity =
          resolvedCharacterRegion?.descriptor ?? "Thai / Southeast Asian";
        const castingPrompt = await generateCharacterReferenceCastingPrompt({
          userId,
          tenantId,
          referenceImages: visionReferenceUrls,
          imageCount: input.portraitCandidateCount as 1 | 2 | 3 | 4 | 5,
          genderPresentation,
          ethnicity,
          ageMin: castingAgeProfile.min,
          ageMax: castingAgeProfile.max,
          lockClothing: input.castingLockClothing ?? false,
          poseMode: (input.castingPoseMode ??
            "auto_natural") as CharacterCandidatePoseMode,
          cameraFraming: (input.castingCameraFraming ??
            "half_body") as CharacterCandidateCameraFraming,
          additionalInstructions: input.customInstruction,
          model: null,
        });
        const singleImageRenderPrompt =
          buildCharacterCandidateSingleImageRenderPrompt(castingPrompt.prompt);
        const count = input.portraitCandidateCount;
        const candidateIds = Array.from({ length: count }, () =>
          crypto.randomUUID()
        );
        let draftBatch;
        try {
          draftBatch =
            await verticalDramaCharacterStockService.createPortraitCandidateDraftBatch(
              {
                tenantId,
                userId,
                seriesId,
                characterId,
                characterKey: character.characterKey,
                sharedVisualLanguage:
                  "Reference-guided casting prompt; each candidate is a new fictional person.",
                promptModel:
                  castingPrompt.modelId ?? "character-candidate-prompt",
                referenceGuided: true,
                referenceAssetLinkIds: castingReferenceAssetLinkIds,
                castingAgeProfile,
                candidates: candidateIds.map(candidateId => ({
                  candidateId,
                  portraitPrompt: singleImageRenderPrompt,
                  visualIdentitySummary:
                    "New fictional casting candidate guided by the selected references.",
                })),
              }
            );
        } catch (err) {
          mapStockError(err);
        }
        const draftsByCandidateId = new Map(
          draftBatch.candidates.map(candidate => [
            candidate.candidateId,
            candidate,
          ])
        );
        return {
          mode: "candidate_batch" as const,
          batchId: draftBatch.batchId,
          candidateCount: count,
          sharedVisualLanguage:
            "Reference-guided casting prompt; each candidate is a new fictional person.",
          model: castingPrompt.modelId ?? "character-candidate-prompt",
          referenceGuided: true,
          castingAgeProfile,
          candidates: candidateIds.map((candidateId, index) => ({
            assetLinkId: String(
              draftsByCandidateId.get(candidateId)!.assetLinkId
            ),
            candidateId,
            index,
            portraitPrompt: singleImageRenderPrompt,
            visualIdentitySummary:
              "New fictional casting candidate guided by the selected references.",
          })),
        };
      }

      // The selected candidate count is part of the user's preview contract.
      // `castingAgeProfile` is an optional safety/consistency constraint for
      // the skill, not a reason to silently downgrade a requested batch to a
      // single prompt. The candidate generator validates age when the profile
      // is available and remains tolerant of legacy characters without one.
      if (input.portraitCandidateCount) {
        let candidateResult;
        try {
          candidateResult = await generateCharacterPortraitCandidates({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: effectiveCharacterFacts.role,
            narrativeRole: character.narrativeRole as
              | NarrativeRole
              | null
              | undefined,
            roleTier: character.roleTier as RoleTier | null | undefined,
            variantType: character.variantType as "outfit" | "age_stage" | null,
            occupation: effectiveCharacterFacts.occupation,
            roleVisualIntent: character.roleVisualIntent as
              | RoleVisualIntent
              | null
              | undefined,
            roleReviewStatus: character.roleReviewStatus as
              | RoleReviewStatus
              | null
              | undefined,
            description,
            storyContext: seriesRow
              ? {
                  title: seriesRow.title,
                  locale: seriesRow.locale,
                  genre: seriesRow.genre ?? undefined,
                  tone: seriesRow.tone ?? undefined,
                  targetAudience: seriesRow.targetAudience ?? undefined,
                }
              : undefined,
            targetAudienceRegion,
            resolvedCharacterRegion,
            castingPreferences: characterCastingPreferences,
            presetVisualIdentity,
            customInstruction: input.customInstruction,
            characterDesignContext,
            castingAgeProfile,
            portraitCandidateCount: input.portraitCandidateCount as
              | 1
              | 2
              | 3
              | 4
              | 5,
            allowLegacyApprovedDesignDnaReplacement: Boolean(
              characterDesignContext?.approvedDesignDna
            ),
            ...(previewPromptCapability
              ? {
                  imagePromptCapability: previewPromptCapability,
                  imagePromptContractMode:
                    isTargetVerticalDramaCharacterCapability(
                      previewPromptCapability
                    )
                      ? ("target" as const)
                      : ("legacy" as const),
                }
              : {}),
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Character portrait candidate generation failed",
          });
        }

        let draftBatch;
        try {
          draftBatch =
            await verticalDramaCharacterStockService.createPortraitCandidateDraftBatch(
              {
                tenantId,
                userId,
                seriesId,
                characterId,
                characterKey: character.characterKey,
                sharedVisualLanguage: candidateResult.sharedVisualLanguage,
                promptModel: candidateResult.model,
                castingAgeProfile: candidateResult.castingAgeProfile,
                candidates: candidateResult.candidates.map(candidate => ({
                  candidateId: candidate.candidateId,
                  portraitPrompt: candidate.portraitPrompt,
                  negativePrompt: candidate.negativePrompt,
                  visualIdentitySummary: candidate.visualIdentitySummary,
                  visualBibleSnapshot: candidate.visualBibleSnapshot,
                })),
              }
            );
        } catch (err) {
          mapStockError(err);
        }
        const draftsByCandidateId = new Map(
          draftBatch.candidates.map(candidate => [
            candidate.candidateId,
            candidate,
          ])
        );
        return {
          mode: "candidate_batch" as const,
          batchId: draftBatch.batchId,
          candidateCount: candidateResult.candidates.length,
          sharedVisualLanguage: candidateResult.sharedVisualLanguage,
          model: candidateResult.model,
          castingAgeProfile: candidateResult.castingAgeProfile,
          // Non-fatal lead-beauty graceful-degradation warnings (FIX A,
          // `verticalDramaCharacterImageGeneration.ts`) — surfaced so the UI can
          // tell the creator a lead portrait was accepted despite reading a
          // touch plain, instead of the previous silent hard-block. Additive +
          // conditional: absent when the strict gate passed (the common case now
          // that the visual-bible stage uses a stronger model), byte-identical
          // response otherwise.
          ...(candidateResult.warnings?.length
            ? { warnings: candidateResult.warnings }
            : {}),
          candidates: candidateResult.candidates.map(candidate => ({
            assetLinkId: String(
              draftsByCandidateId.get(candidate.candidateId)!.assetLinkId
            ),
            candidateId: candidate.candidateId,
            index: draftsByCandidateId.get(candidate.candidateId)!.index,
            portraitPrompt: candidate.portraitPrompt,
            negativePrompt: candidate.negativePrompt,
            visualIdentitySummary: candidate.visualIdentitySummary,
            ...(candidate.warnings?.length
              ? { warnings: candidate.warnings }
              : {}),
          })),
        };
      }

      let promptResult;
      try {
        promptResult = await generateCharacterVisualPrompts({
          userId,
          tenantId,
          seriesId,
          characterId,
          characterKey: character.characterKey,
          name: character.name,
          role: effectiveCharacterFacts.role,
          narrativeRole: character.narrativeRole as
            | NarrativeRole
            | null
            | undefined,
          roleTier: character.roleTier as RoleTier | null | undefined,
          variantType: character.variantType as "outfit" | "age_stage" | null,
          occupation: effectiveCharacterFacts.occupation,
          roleVisualIntent: character.roleVisualIntent as
            | RoleVisualIntent
            | null
            | undefined,
          roleReviewStatus: character.roleReviewStatus as
            | RoleReviewStatus
            | null
            | undefined,
          description,
          storyContext: seriesRow
            ? {
                title: seriesRow.title,
                locale: seriesRow.locale,
                genre: seriesRow.genre ?? undefined,
                tone: seriesRow.tone ?? undefined,
                targetAudience: seriesRow.targetAudience ?? undefined,
              }
            : undefined,
          targetAudienceRegion,
          resolvedCharacterRegion,
          castingPreferences: characterCastingPreferences,
          presetVisualIdentity,
          faceSourceReference,
          customInstruction: input.customInstruction,
          characterDesignContext,
          ...(previewPromptCapability
            ? {
                imagePromptCapability: previewPromptCapability,
                imagePromptContractMode:
                  isTargetVerticalDramaCharacterCapability(
                    previewPromptCapability
                  )
                    ? ("target" as const)
                    : ("legacy" as const),
              }
            : {}),
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Character visual prompt generation failed",
        });
      }

      const renderPrompt = promptResult.portraitPrompt;

      return {
        mode: "single" as const,
        portraitPrompt: renderPrompt,
        turnaroundPrompt: promptResult.turnaroundPrompt,
        negativePrompt: promptResult.negativePrompt,
        model: promptResult.model,
        // Non-fatal lead-beauty warnings (FIX A) — see the candidate_batch
        // branch above for the full rationale; additive + conditional.
        ...(promptResult.warnings?.length
          ? { warnings: promptResult.warnings }
          : {}),
        approvedDesignSnapshot: {
          characterKey: character.characterKey,
          portraitPrompt: renderPrompt,
          ...(promptResult.promptContractVersion
            ? { promptContractVersion: promptResult.promptContractVersion }
            : {}),
          ...(promptResult.promptProfile
            ? { promptProfile: promptResult.promptProfile }
            : {}),
          ...(promptResult.negativePrompt
            ? { negativePrompt: promptResult.negativePrompt }
            : {}),
          visualBible: promptResult.visualBibleSnapshot,
        },
      };
    }),

  /** Refresh-safe status read for the asynchronous character prompt preview. */
  getCharacterPromptJob: verticalDramaProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        seriesId: z.string().min(1),
        characterId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const job = await getVerticalDramaCharacterPromptJobStatus(input.jobId, {
        tenantId: requireTenantId(ctx.tenantId),
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        characterId: parseId(input.characterId, "character id"),
      });
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Character prompt preview job not found or expired",
        });
      }
      return {
        jobId: job.jobId,
        status: job.status,
        result: job.result,
        error: job.error,
        waitingReason: job.waitingReason,
        nextRetryAt: job.nextRetryAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    }),

  /** Load the active character prompt job after a refresh without submitting
   * another paid request. */
  getActiveCharacterPromptJob: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        characterId: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const job = await getActiveVerticalDramaCharacterPromptJob({
        tenantId: requireTenantId(ctx.tenantId),
        userId: ctx.user.id,
        seriesId: parseId(input.seriesId, "series id"),
        characterId: parseId(input.characterId, "character id"),
      });
      return job
        ? {
            jobId: job.jobId,
            status: job.status,
            result: job.result,
            error: job.error,
            waitingReason: job.waitingReason,
            nextRetryAt: job.nextRetryAt,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
          }
        : null;
    }),

  /**
   * Generate a real character reference portrait: (1) run the installed
   * `vertical-drama-character-visual-bible` skill as a direct, credit-gated
   * LLM call to produce a portrait prompt + negative prompt (see
   * `verticalDramaCharacterImageGeneration.ts`), then (2) render that prompt
   * into an actual image via `mediaGenerationService.generateImageAsync`.
   * The caller polls the returned media task, matching the rest of the
   * character-tab generation workflow. The
   * rendered image is registered as a canonical `media_assets` row (never a
   * bare provider URL, matching this table's own doc comment) and linked
   * into the durable character-asset stock via the existing
   * `verticalDramaCharacterStockService.linkAsset` path — `approved: false`
   * / `qcStatus: "pending"` — so it enters the SAME human-approval queue as
   * imported assets; nothing here bypasses review.
   *
   * Two SEPARATE credit charges occur (never double-counted for the same
   * spend): the prompt-generation LLM call is credited inside
   * `generateCharacterVisualPrompts` itself; the image render is credited
   * here, mirroring `media.ts`'s own check-credits -> call -> deduct-credits
   * convention (the media-generation service does not deduct credits itself
   * — the caller always does, using the backend-reported
   * `creditsUsed` when available).
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): when the caller
   * already ran `previewCharacterPrompt` and had the user approve the exact
   * text, pass it here to skip the internal `generateCharacterVisualPrompts`
   * call entirely — the prompt-generation credit was already charged once,
   * at preview time, and must not be charged again here. When absent,
   * behavior is unchanged from before this option existed.
   */
  generateCharacterImage: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
        approvedDesignSnapshot:
          verticalDramaApprovedCharacterDesignSnapshotSchema.optional(),
        // Caller-selected image model (character tab's own model picker) —
        // validated + must be enabled. REQUIRED — no server-side fallback;
        // throws BAD_REQUEST when absent. See `resolveCharacterImageModelId`.
        selectedImageModelId: z.string().trim().min(1).max(128),
        /** Caller-selected image-to-image / EDIT model — used instead of
         *  `selectedImageModelId` whenever this render actually attaches a
         *  reference image. Optional: omitting it keeps the previous
         *  single-model behavior exactly. See `pickCharacterRenderModelId`. */
        selectedEditImageModelId: z.string().trim().min(1).max(128).optional(),
        // Required only when the selected model is MCP-transport (e.g.
        // `higgsfield/*`, `magnific-mcp/*`) — see
        // `resolveVdCharacterMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row —
        // `generateCharacterImage`). Required only when the resolved model
        // is Hermes-transport and the caller has no default Hermes
        // connection for images.
        hermesConnectionId: z.string().max(64).optional(),
        // Explicit reference-image-picker override. When present, it always
        // wins over `referencePolicy`, including the main portrait's default
        // `none` policy. User-selected/attached references must never be
        // silently discarded.
        referenceAssetLinkId: z.string().min(1).optional(),
        // Main portrait generation is deliberately text-to-image by default;
        // callers for looks/variants/angle packs opt into `auto` explicitly.
        referencePolicy: z
          .enum(VERTICAL_DRAMA_CHARACTER_REFERENCE_POLICY_VALUES)
          .default("none"),
        // Free-text visual brief for THIS generation only. It reaches the
        // planner on the fallback path and is enforced on the exact provider
        // prompt on BOTH fallback and approved-preview paths.
        customInstruction: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting — reuses the shared `mediaGenerationLimiter` (this
      // mutation performs a paid LLM prompt-generation call PLUS a paid
      // image render, so it belongs under the same per-user cap as
      // `media.ts`'s own generation mutations). Checked first, before any
      // DB reads/writes or paid calls.
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );
      rejectBaseAdultChildRequest({
        character,
        customInstruction: input.customInstruction,
      });
      if (input.approvedDesignSnapshot && !input.approvedPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "An approved Character DNA snapshot requires its approved prompt.",
        });
      }
      if (
        input.approvedDesignSnapshot &&
        input.approvedDesignSnapshot.characterKey !== character.characterKey
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The approved Character DNA snapshot belongs to another character.",
        });
      }

      const [seriesRow] = await db
        .select({
          id: verticalDramaSeries.id,
          title: verticalDramaSeries.title,
          locale: verticalDramaSeries.locale,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          targetAudience: verticalDramaSeries.targetAudience,
          bible: verticalDramaSeries.bible,
          updatedAt: verticalDramaSeries.updatedAt,
          // Season lineage (plan Stage 2.3) — feeds `loadCharacterDesignContext`'s
          // `crossSeriesUniqueness` parent exclusion so a sequel is never told
          // to differ from its own previous-season self.
          parentSeriesId: verticalDramaSeries.parentSeriesId,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Item 1 (planning/vd-character-prompt-followups/plan.md, 2026-07-31) —
      // was this series-level region actually CHOSEN by the series owner, as
      // opposed to the un-set global fallback nobody picked? Threaded into
      // `resolveCharacterTargetAudienceRegion` below so the D1/D2
      // deterministic enforcement layers also cover an explicit series
      // default, never a fallback nobody selected.
      const seriesRegionIsExplicit = isTargetAudienceRegionExplicitlySetInBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Per-character ethnicity/region override (planning/vd-per-character-
      // ethnicity/plan.md) — see `previewCharacterPrompt`'s identical site
      // for the full contract.
      const resolvedCharacterRegion = resolveCharacterTargetAudienceRegion(
        readLegacyCharacterRegionOverrideForGeneration(
          (character.data as Record<string, unknown> | null) ?? null
        ),
        targetAudienceRegion,
        seriesRegionIsExplicit
      );
      const characterCastingPreferences =
        readCharacterCastingPreferencesFromData(
          (character.data as Record<string, unknown> | null) ?? null
        );
      const { identity: presetVisualIdentity, lookLockEnabled } =
        await resolveCharacterPresetVisualIdentity(
          tenantId,
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );

      // 0. Identity-lock reference — resolve BEFORE prompt generation (Phase
      //    D2, `planning/vertical-drama-reference-picker-outfit-lock/plan.md`
      //    section B) so its presence can be passed into
      //    `generateCharacterVisualPrompts` as the `hasOwnReferenceImage`
      //    fact — the skill (not this router) is then the sole author of the
      //    identity-lock instruction language woven into the prompt,
      //    including the outfit/clothing/accessories/shoes lock this fixes.
      //    Attaches the character's existing approved portrait (if any) as a
      //    `referenceImageUrls` input so the render is conditioned on the
      //    actual likeness. Absent on a character's very first portrait AND
      //    it has no parent/twin-source portrait to borrow either (nothing
      //    to reference yet); present on every regeneration afterward, and
      //    defaults to the parent/twin-source's portrait on a brand-new
      //    variant/twin's first render (Phase F1,
      //    `planning/vertical-drama-twin-variant-completeness/plan.md` W1).
      //    The resolved TIER matters as much as the URL — a borrowed
      //    parent/twin portrait must NOT be announced to the skill as this
      //    character's own likeness (see `ReferencePortraitSource`).
      const { url: referencePortraitUrl, source: referencePortraitSource } =
        await resolveReferencePortraitSource(
          { tenantId, userId, seriesId },
          characterId,
          input.referenceAssetLinkId,
          character.parentCharacterId ?? character.sharesFaceWithCharacterId,
          input.referencePolicy ?? "none"
        );
      const resolvedImageModelId = await resolveCharacterImageModelId(
        pickCharacterRenderModelId({
          hasReferenceImage: Boolean(referencePortraitUrl),
          selectedImageModelId: input.selectedImageModelId,
          selectedEditImageModelId: input.selectedEditImageModelId,
        })
      );
      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      let characterPromptCapability: VerticalDramaCharacterPromptCapability;
      try {
        characterPromptCapability =
          await resolveCharacterPromptCapabilityForModel(
            resolvedImageModelId,
            (pricingModel.configJson as
              | Record<string, unknown>
              | null
              | undefined) ?? null
          );
      } catch (error) {
        return mapCharacterPromptContractError(error);
      }
      const targetCharacterPrompt = isTargetVerticalDramaCharacterCapability(
        characterPromptCapability
      );
      // 1. Prompt generation — credit-gated + deducted internally. Skipped
      //    entirely when the caller already ran `previewCharacterPrompt` and
      //    supplies the user-approved text via `approvedPrompt` (that credit
      //    was already charged once, at preview time).
      let portraitPrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;
      let semanticRetryCount = 0;
      let useApprovedPortraitPrompt = Boolean(input.approvedPrompt);
      if (
        input.approvedPrompt &&
        targetCharacterPrompt &&
        !input.approvedDesignSnapshot
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A target character prompt requires a current contract snapshot. Generate a fresh prompt before rendering.",
        });
      }
      if (
        input.approvedPrompt &&
        input.approvedDesignSnapshot &&
        targetCharacterPrompt
      ) {
        const reuseDecision = decideCharacterPromptSnapshotReuse({
          imagePromptCapability: characterPromptCapability,
          snapshotContractVersion:
            input.approvedDesignSnapshot.promptContractVersion,
          snapshotPromptProfile: input.approvedDesignSnapshot.promptProfile,
          snapshotCastingPreferencesFingerprint:
            input.approvedDesignSnapshot.visualBible
              .castingPreferencesFingerprint,
          currentCastingPreferencesFingerprint:
            buildCharacterCastingPreferencesFingerprint(
              characterCastingPreferences
            ),
          hasCharacterFacts: true,
        });
        if (reuseDecision.action === "reject") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This approved character prompt is stale. Generate a fresh prompt before rendering.",
          });
        }
        useApprovedPortraitPrompt = reuseDecision.action === "reuse";
      }
      let visualBibleToPersist =
        useApprovedPortraitPrompt &&
        input.approvedDesignSnapshot &&
        input.approvedDesignSnapshot.portraitPrompt.trim() ===
          input.approvedPrompt!.trim()
          ? input.approvedDesignSnapshot.visualBible
          : undefined;

      if (useApprovedPortraitPrompt) {
        portraitPrompt = input.approvedPrompt!;
        negativePrompt = input.approvedNegativePrompt;
        semanticRetryCount =
          input.approvedDesignSnapshot?.visualBible.semanticRetryCount ?? 0;
      } else {
        const faceSourceReference =
          await resolveFaceSourceReferenceForCharacter(
            { tenantId, userId, seriesId },
            character
          );
        const characterDesignContext = seriesRow
          ? await loadCharacterDesignContext(
              { tenantId, userId },
              seriesRow,
              character
            )
          : undefined;
        // Merge roster + series-bible facts (see `resolveEffectiveCharacterFacts`'s
        // own doc comment — traceId Ytrq5TrfJRzyFNRLasyV8 /
        // `planning/vd-character-visual-bible-occupation-fix/plan.md`).
        const effectiveCharacterFacts = resolveEffectiveCharacterFacts(
          {
            name: character.name,
            role: character.role,
            occupation: character.occupation,
            data: (character.data as Record<string, unknown> | null) ?? null,
          },
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );
        const description = effectiveCharacterFacts.description;
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: effectiveCharacterFacts.role,
            narrativeRole: character.narrativeRole as
              | NarrativeRole
              | null
              | undefined,
            roleTier: character.roleTier as RoleTier | null | undefined,
            variantType: character.variantType as "outfit" | "age_stage" | null,
            occupation: effectiveCharacterFacts.occupation,
            roleVisualIntent: character.roleVisualIntent as
              | RoleVisualIntent
              | null
              | undefined,
            roleReviewStatus: character.roleReviewStatus as
              | RoleReviewStatus
              | null
              | undefined,
            description,
            storyContext: seriesRow
              ? {
                  title: seriesRow.title,
                  locale: seriesRow.locale,
                  genre: seriesRow.genre ?? undefined,
                  tone: seriesRow.tone ?? undefined,
                  targetAudience: seriesRow.targetAudience ?? undefined,
                }
              : undefined,
            targetAudienceRegion,
            resolvedCharacterRegion,
            castingPreferences: characterCastingPreferences,
            presetVisualIdentity,
            faceSourceReference,
            hasOwnReferenceImage: referenceSourceIsOwnLikeness(
              referencePortraitSource
            ),
            customInstruction: input.customInstruction,
            characterDesignContext,
            imagePromptCapability: characterPromptCapability,
            imagePromptContractMode: targetCharacterPrompt
              ? "target"
              : "legacy",
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Character visual prompt generation failed",
          });
        }
        portraitPrompt = promptResult.portraitPrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
        semanticRetryCount = promptResult.semanticRetryCount ?? 0;
        visualBibleToPersist = promptResult.visualBibleSnapshot;
      }
      ({ prompt: portraitPrompt, negativePrompt } =
        applySeriesLookToImagePrompt({
          prompt: portraitPrompt,
          negativePrompt,
          identity: presetVisualIdentity,
        }));
      if (lookLockEnabled && presetVisualIdentity) {
        await recordSeriesLookLockAuditEvent({
          eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
          tenantId,
          userId,
          seriesId,
          path: "characters.generateImage",
        });
      }
      const normalizedPortraitRequest = normalizeCharacterRenderPrompt({
        prompt: portraitPrompt,
        negativePrompt,
        model: resolvedImageModelId,
        capability: characterPromptCapability,
      });
      portraitPrompt = normalizedPortraitRequest.prompt;
      negativePrompt = normalizedPortraitRequest.negativePrompt;
      // 2. Pre-flight credit check for the image render — a SEPARATE charge
      //    from the prompt-generation LLM call above. Prices + generates
      //    against the CALLER-SELECTED model (character tab's own picker),
      //    which is now REQUIRED — `resolveCharacterImageModelId` throws
      //    BAD_REQUEST when none was selected instead of silently falling
      //    back to `DEFAULT_MODELS.image`. Which of the caller's two picks
      //    applies depends on whether a reference image is actually being
      //    attached — this render is image-to-image when one is (see
      //    `pickCharacterRenderModelId`). Pricing, credits, and transport all
      //    follow the RESOLVED model from here on, so nothing downstream
      //    needs to know which picker it came from.
      const imageCreditCost = calculateCreditCost(pricingModel, {
        numImages: 1,
      });

      // Zero-cost models (e.g. Higgsfield/Magnific MCP — billed via MCP
      // subscription, not credits) skip the reserve/refund cycle entirely —
      // same convention as `verticalDramaEpisodes.ts`'s
      // `generateStartFrameImage` (`deductCredits`/`refundCredits` throw on
      // amount <= 0 by design; see creditService.ts).
      const shouldChargeImageCredits = imageCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09): resolve the
      // transport-neutral decision BEFORE the credit check below (not
      // after) — structurally guarantees a Hermes generation is never
      // gated on the caller's SmartSpec credit balance (hermes bills
      // `provider_account`, section-05's job). `mcp`/`gateway` fall through
      // to the pre-existing code below byte-identically (via
      // `resolveVdCharacterMcpTransportMetadata`, called unchanged just
      // below); `hermes` takes a completely separate path — no platform
      // credit reserve, submits straight to `queueHermesMediaJob`, and
      // returns early with the same response shape.
      const transportDecision = await resolveVdCharacterMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
      });

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasImageCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for portrait image render. Required: ${imageCreditCost}`,
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
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } =
          await resolveHermesOrderedRefsFromUrls({
            tenantId,
            userId,
            urls: referencePortraitUrl ? [referencePortraitUrl] : [],
            traceId: hermesTraceId,
            connectionId: transportDecision.connectionId,
            roleFor: () => "identity_lock",
            requireAll: Boolean(referencePortraitUrl),
          });
        const references = await buildHermesMediaReferences({
          tenantId,
          userId,
          orderedRefs,
        });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: portraitPrompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
          },
          references,
          entity: { type: "vertical_drama_character", id: String(characterId) },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: portraitPrompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_character_id: String(characterId),
            __vd_character_prompt_marker:
              VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
            __vd_character_prompt_contract_version: targetCharacterPrompt
              ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
              : "legacy",
          },
          droppedReferenceCount,
        });

        let hermesDnaPersistenceStatus: "persisted" | "skipped" | "failed" =
          "skipped";
        let hermesDnaPersistenceWarning: string | null = null;
        if (visualBibleToPersist) {
          try {
            await persistCharacterVisualBible(
              { tenantId, userId, seriesId },
              characterId,
              visualBibleToPersist
            );
            hermesDnaPersistenceStatus = "persisted";
          } catch (error) {
            hermesDnaPersistenceStatus = "failed";
            hermesDnaPersistenceWarning =
              "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
            debugError(
              "verticalDramaCharacters.generateCharacterImage",
              `Character DNA persistence failed after media task ${hermesTask.id}`,
              error
            );
          }
        } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
          hermesDnaPersistenceWarning =
            "Character DNA was not saved because the approved prompt was edited after preview.";
        }

        return {
          taskId: hermesTask.id,
          portraitPrompt,
          negativePrompt,
          promptModel,
          visualBibleSummary,
          creditsUsed: { promptGeneration: promptCreditsUsed },
          dnaPersistenceStatus: hermesDnaPersistenceStatus,
          dnaPersistenceWarning: hermesDnaPersistenceWarning,
          droppedReferenceCount,
        };
      }

      // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
      // dispatched through the service's MCP branch, not the default
      // gateway_api/Python-backend path — see
      // `resolveVdCharacterMcpTransportMetadata` (delegated to by
      // `resolveVdCharacterMediaTransportDecision` above, unchanged).
      const transportMetadata =
        transportDecision.kind === "mcp"
          ? transportDecision.transportMetadata
          : undefined;

      // 3. Submit — async (matches `media.generateImageAsync` + `media.getTask`
      //    convention; shows in Media History; avoids a long-blocking
      //    mutation). Credits are RESERVED now; `media.getTask` reconciles
      //    against actual usage once the task completes/fails, same as
      //    `media.ts`'s own async mutations. The caller polls
      //    `media.getTask({taskId})`, then finalizes by calling
      //    `resolveMediaAssetForImport` + `linkAsset` (both already-built,
      //    already-tested procedures) — no new "finalize" endpoint needed.
      if (shouldChargeImageCredits) {
        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — generate character portrait (character #${characterId}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_character_portrait",
            seriesId,
            characterId,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: portraitPrompt,
            characterPromptContext: buildCharacterPromptContext(
              characterPromptCapability,
              semanticRetryCount
            ),
            ...(negativePrompt !== undefined ? { negativePrompt } : {}),
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl
              ? { referenceImageUrls: [referencePortraitUrl] }
              : {}),
            // Series provenance tag (project-scoped media panel filter) —
            // persisted verbatim into the media task's `parameters.extra_params`
            // (see PERSISTED_INTERNAL_EXTRA_PARAM_KEYS in mediaGenerationService.ts);
            // read back by `media.listTasks`'s optional `seriesId` filter.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_character_id: String(characterId),
              __vd_character_prompt_marker:
                VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
              __vd_character_prompt_contract_version: targetCharacterPrompt
                ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
                : "legacy",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              tenantId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterImage",
              stage: "submission",
            },
          },
          userToken
        );
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: character portrait render failed to submit (character #${characterId})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_character_portrait",
              seriesId,
              characterId,
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Character portrait image generation failed to submit",
        });
      }

      let dnaPersistenceStatus: "persisted" | "skipped" | "failed" = "skipped";
      let dnaPersistenceWarning: string | null = null;
      if (visualBibleToPersist) {
        try {
          await persistCharacterVisualBible(
            { tenantId, userId, seriesId },
            characterId,
            visualBibleToPersist
          );
          dnaPersistenceStatus = "persisted";
        } catch (error) {
          dnaPersistenceStatus = "failed";
          dnaPersistenceWarning =
            "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
          debugError(
            "verticalDramaCharacters.generateCharacterImage",
            `Character DNA persistence failed after media task ${task.id}`,
            error
          );
        }
      } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
        dnaPersistenceWarning =
          "Character DNA was not saved because the approved prompt was edited after preview.";
      }

      return {
        taskId: task.id,
        portraitPrompt,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
        dnaPersistenceStatus,
        dnaPersistenceWarning,
      };
    }),

  /**
   * Generate the three canonical identity-angle references for one character.
   * Each slot reuses the existing, credit-gated portrait generation path so
   * model selection, MCP/Hermes routing, DNA persistence, and provider safety
   * stay in one place. The client links each completed task into the existing
   * character-asset ledger with its angle role and keeps approval explicit.
   */
  generateCharacterAnglePack: verticalDramaCharacterAnglePackProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        selectedImageModelId: z.string().trim().min(1).max(128),
        selectedEditImageModelId: z.string().trim().min(1).max(128).optional(),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        hermesConnectionId: z.string().max(64).optional(),
        referenceAssetLinkId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const primaryPortraitUrl =
        await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
          { tenantId, userId, seriesId },
          characterId
        );
      if (!primaryPortraitUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "สร้างชุดมุมอ้างอิงไม่ได้จนกว่าจะมีภาพ primary portrait ที่อนุมัติแล้ว",
        });
      }

      // Calling the sibling mutation keeps all existing paid-generation
      // safeguards in one implementation. The cast is intentionally local:
      // this procedure is a thin orchestration wrapper and returns only the
      // stable task metadata needed by the browser poller.
      const routerValue = verticalDramaCharactersRouter as unknown as {
        createCaller: (context: unknown) => {
          generateCharacterImage: (value: unknown) => Promise<{
            taskId: string;
            creditsUsed?: { promptGeneration?: number };
          }>;
        };
      };
      const caller = routerValue.createCaller(ctx);
      const tasks: Array<{
        role: VerticalDramaCharacterAngleRole;
        taskId: string;
        creditsUsed?: { promptGeneration?: number };
      }> = [];
      for (const role of VERTICAL_DRAMA_CHARACTER_ANGLE_ROLES) {
        const result = await caller.generateCharacterImage({
          seriesId: input.seriesId,
          characterId: input.characterId,
          selectedImageModelId: input.selectedImageModelId,
          ...(input.selectedEditImageModelId
            ? { selectedEditImageModelId: input.selectedEditImageModelId }
            : {}),
          ...(input.mcpConnectionId
            ? { mcpConnectionId: input.mcpConnectionId }
            : {}),
          ...(input.sharedGroupId != null
            ? { sharedGroupId: input.sharedGroupId }
            : {}),
          ...(input.hermesConnectionId
            ? { hermesConnectionId: input.hermesConnectionId }
            : {}),
          ...(input.referenceAssetLinkId
            ? { referenceAssetLinkId: input.referenceAssetLinkId }
            : {}),
          referencePolicy: "auto" as const,
          customInstruction:
            `Identity angle-pack slot: ${VERTICAL_DRAMA_CHARACTER_ANGLE_DIRECTIVES[role]}. ` +
            "Use the approved primary portrait as the same-person identity anchor. " +
            "Render one clean 9:16 reference image only; no collage, no text, no extra people, no costume redesign.",
        });
        tasks.push({
          role,
          taskId: result.taskId,
          creditsUsed: result.creditsUsed,
        });
      }

      return {
        anglePackId: crypto.randomUUID(),
        characterId: input.characterId,
        tasks,
      };
    }),

  /**
   * Generate a Character Design Bible sheet — ONE reference image for
   * whichever `sheetType` the caller requests (vertical-drama-character-
   * sheet-consolidation plan, Phase B). Consolidates what used to be two
   * separate mutations (`generateCharacterTurnaround` + the original
   * `generateCharacterSheet`) into one, resolving the format via
   * `resolveCharacterSheetType`:
   *  - `"auto"` (the default) resolves to `"turnaround"` — a 360/multi-angle
   *    composition read straight off `promptResult.turnaroundPrompt` (the
   *    always-required `turnaround_prompt` skill field), preserving today's
   *    cheaper/older default behavior.
   *  - `"full_combined"` and the 11 new Character Design Bible formats
   *    (`cover`, `character_profile`, `face_detail`, `expression_12`,
   *    `hair_reference`, `costume_breakdown`, `material_fabric`,
   *    `color_palette`, `pose_library`, `body_proportion`, `ai_prompt_lock`)
   *    all render `promptResult.sheetPrompt` — a genuinely skill-authored
   *    prompt for the requested format (see `skills/vertical-drama-character-
   *    visual-bible/skill.md`'s "Character Design Bible sheet types"
   *    section). This is the exact fix for the pre-existing skill-first
   *    architecture violation this endpoint used to contain: no prompt text
   *    is authored/concatenated in this file anymore — every character-
   *    facing string comes from the skill's own response.
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): same skip-
   * regeneration contract as `generateCharacterImage` — when present, the
   * user-approved text (from `previewCharacterPrompt`) is used directly and
   * the internal `generateCharacterVisualPrompts` call (already charged once
   * at preview time) is not repeated.
   *
   * Returns `assetRole`/`assetMetadata` (via `resolveCharacterSheetAssetTag`)
   * so the caller can tag the eventual `linkAsset` call correctly once the
   * async render task completes — `"turnaround"` -> the pre-existing
   * `"character_sheet_turnaround"` role, `"full_combined"` -> the pre-
   * existing `"character_sheet_full"` role, every new format ->
   * `"character_design_bible"` (deliberately OUTSIDE
   * `CHARACTER_SHEET_ROLES` in `verticalDramaCharacterStock.ts` — several of
   * the new formats carry no face at all, so they must never be picked as a
   * second identity-lock reference for storyboard/shot generation).
   *
   * Async submit + poll, same convention as every other real generation in
   * this codebase (shows in Media History, correct credit deduction).
   */
  generateCharacterSheet: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
        approvedDesignSnapshot:
          verticalDramaApprovedCharacterDesignSnapshotSchema.optional(),
        /** Which Character Design Bible sheet format to render — `"auto"`
         *  (default) resolves to `"turnaround"`. See
         *  `resolveCharacterSheetType`/`CHARACTER_SHEET_TYPE_VALUES`. */
        sheetType: z
          .enum(CHARACTER_SHEET_TYPE_VALUES)
          .optional()
          .default("auto"),
        /** Free-text per-generation visual brief — identical field name, cap,
         *  and contract as `generateCharacterImage`'s own `customInstruction`
         *  (passed to the skill as `custom_instruction`, never appended to a
         *  code-authored prompt string). */
        customInstruction: z.string().trim().max(500).optional(),
        /** Language of the STATS TEXT/labels on the sheet — the character's
         *  own name is never translated, always rendered exactly as given.
         *  NOTE: the skill does not yet accept a language input (see
         *  `skills/vertical-drama-character-visual-bible/schemas/
         *  input.schema.json`) — kept on the input contract for API-surface
         *  stability, currently unused by the handler pending skill support;
         *  never wired into a code-authored prompt string (that would be the
         *  exact violation this endpoint used to have). */
        sheetLanguage: z.enum(["en", "th"]).optional().default("en"),
        // Caller-selected image model — see `generateCharacterImage`'s same
        // field. REQUIRED — no server-side fallback.
        selectedImageModelId: z.string().trim().min(1).max(128),
        /** Image-to-image / EDIT model — see `generateCharacterImage`'s
         *  identical field and `pickCharacterRenderModelId`. A sheet render
         *  attaches the identity-lock reference exactly like a portrait does,
         *  so it splits on the same rule. */
        selectedEditImageModelId: z.string().trim().min(1).max(128).optional(),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 135 — Hermes Grok media worker (section 09). See
        // `generateCharacterImage`'s identical field.
        hermesConnectionId: z.string().max(64).optional(),
        // Optional explicit reference-image-picker override — see
        // `generateCharacterImage`'s identical field for the full contract.
        referenceAssetLinkId: z.string().min(1).optional(),
        // Character sheets preserve the existing identity-lock behavior. Main
        // portrait regeneration uses `generateCharacterImage` with `none`.
        referencePolicy: z
          .enum(VERTICAL_DRAMA_CHARACTER_REFERENCE_POLICY_VALUES)
          .default("auto"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const resolvedSheetType = resolveCharacterSheetType(input.sheetType);

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );
      rejectBaseAdultChildRequest({
        character,
        customInstruction: input.customInstruction,
      });
      if (input.approvedDesignSnapshot && !input.approvedPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "An approved Character DNA snapshot requires its approved prompt.",
        });
      }
      if (
        input.approvedDesignSnapshot &&
        input.approvedDesignSnapshot.characterKey !== character.characterKey
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The approved Character DNA snapshot belongs to another character.",
        });
      }

      const [seriesRow] = await db
        .select({
          id: verticalDramaSeries.id,
          title: verticalDramaSeries.title,
          locale: verticalDramaSeries.locale,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          targetAudience: verticalDramaSeries.targetAudience,
          bible: verticalDramaSeries.bible,
          updatedAt: verticalDramaSeries.updatedAt,
          // Season lineage (plan Stage 2.3) — feeds `loadCharacterDesignContext`'s
          // `crossSeriesUniqueness` parent exclusion so a sequel is never told
          // to differ from its own previous-season self.
          parentSeriesId: verticalDramaSeries.parentSeriesId,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Item 1 (planning/vd-character-prompt-followups/plan.md, 2026-07-31) —
      // was this series-level region actually CHOSEN by the series owner, as
      // opposed to the un-set global fallback nobody picked? Threaded into
      // `resolveCharacterTargetAudienceRegion` below so the D1/D2
      // deterministic enforcement layers also cover an explicit series
      // default, never a fallback nobody selected.
      const seriesRegionIsExplicit = isTargetAudienceRegionExplicitlySetInBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null
      );
      // Per-character ethnicity/region override (planning/vd-per-character-
      // ethnicity/plan.md) — see `previewCharacterPrompt`'s identical site
      // for the full contract.
      const resolvedCharacterRegion = resolveCharacterTargetAudienceRegion(
        readLegacyCharacterRegionOverrideForGeneration(
          (character.data as Record<string, unknown> | null) ?? null
        ),
        targetAudienceRegion,
        seriesRegionIsExplicit
      );
      const characterCastingPreferences =
        readCharacterCastingPreferencesFromData(
          (character.data as Record<string, unknown> | null) ?? null
        );
      const { identity: presetVisualIdentity, lookLockEnabled } =
        await resolveCharacterPresetVisualIdentity(
          tenantId,
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );

      // Identity-lock reference — resolved BEFORE prompt generation (Phase
      // D2, `planning/vertical-drama-reference-picker-outfit-lock/plan.md`
      // section B) so its presence can be passed into
      // `generateCharacterVisualPrompts` as the `hasOwnReferenceImage` fact —
      // the skill (not this router) is then the sole author of the identity-
      // lock instruction language woven into the prompt, including the
      // outfit/clothing/accessories/shoes lock this fixes. Attaches the
      // character's existing approved portrait (if any) as a
      // `referenceImageUrls` input so the render is conditioned on the
      // actual likeness — same established pattern `generateCharacterImage`
      // uses, including the parent/twin-source portrait fallback for a
      // brand-new variant/twin's first render (Phase F1,
      // `planning/vertical-drama-twin-variant-completeness/plan.md` W1). Same
      // tier-aware `has_own_reference_image` contract as
      // `generateCharacterImage` above (see `ReferencePortraitSource`).
      const { url: referencePortraitUrl, source: referencePortraitSource } =
        await resolveReferencePortraitSource(
          { tenantId, userId, seriesId },
          characterId,
          input.referenceAssetLinkId,
          character.parentCharacterId ?? character.sharesFaceWithCharacterId,
          input.referencePolicy ?? "auto"
        );
      const resolvedImageModelId = await resolveCharacterImageModelId(
        pickCharacterRenderModelId({
          hasReferenceImage: Boolean(referencePortraitUrl),
          selectedImageModelId: input.selectedImageModelId,
          selectedEditImageModelId: input.selectedEditImageModelId,
        })
      );
      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      let characterPromptCapability: VerticalDramaCharacterPromptCapability;
      try {
        characterPromptCapability =
          await resolveCharacterPromptCapabilityForModel(
            resolvedImageModelId,
            (pricingModel.configJson as
              | Record<string, unknown>
              | null
              | undefined) ?? null
          );
      } catch (error) {
        return mapCharacterPromptContractError(error);
      }
      const targetCharacterPrompt = isTargetVerticalDramaCharacterCapability(
        characterPromptCapability
      );

      // Prompt generation — credit-gated + deducted internally. Skipped
      // entirely when the caller already ran `previewCharacterPrompt` and
      // supplies the user-approved text via `approvedPrompt` (that credit was
      // already charged once, at preview time) — same skip-regeneration
      // contract `generateCharacterImage` uses.
      let sheetPromptText: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;
      let semanticRetryCount = 0;
      let useApprovedSheetPrompt = Boolean(input.approvedPrompt);
      if (
        input.approvedPrompt &&
        targetCharacterPrompt &&
        !input.approvedDesignSnapshot
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "A target character prompt requires a current contract snapshot. Generate a fresh prompt before rendering.",
        });
      }
      if (
        input.approvedPrompt &&
        input.approvedDesignSnapshot &&
        targetCharacterPrompt
      ) {
        const reuseDecision = decideCharacterPromptSnapshotReuse({
          imagePromptCapability: characterPromptCapability,
          snapshotContractVersion:
            input.approvedDesignSnapshot.promptContractVersion,
          snapshotPromptProfile: input.approvedDesignSnapshot.promptProfile,
          snapshotCastingPreferencesFingerprint:
            input.approvedDesignSnapshot.visualBible
              .castingPreferencesFingerprint,
          currentCastingPreferencesFingerprint:
            buildCharacterCastingPreferencesFingerprint(
              characterCastingPreferences
            ),
          hasCharacterFacts: true,
        });
        if (reuseDecision.action === "reject") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "This approved character prompt is stale. Generate a fresh prompt before rendering.",
          });
        }
        useApprovedSheetPrompt = reuseDecision.action === "reuse";
      }
      let visualBibleToPersist =
        useApprovedSheetPrompt &&
        input.approvedDesignSnapshot &&
        input.approvedDesignSnapshot.portraitPrompt.trim() ===
          input.approvedPrompt!.trim()
          ? input.approvedDesignSnapshot.visualBible
          : undefined;

      if (useApprovedSheetPrompt) {
        sheetPromptText = input.approvedPrompt!;
        negativePrompt = input.approvedNegativePrompt;
        semanticRetryCount =
          input.approvedDesignSnapshot?.visualBible.semanticRetryCount ?? 0;
      } else {
        const faceSourceReference =
          await resolveFaceSourceReferenceForCharacter(
            { tenantId, userId, seriesId },
            character
          );
        const characterDesignContext = seriesRow
          ? await loadCharacterDesignContext(
              { tenantId, userId },
              seriesRow,
              character
            )
          : undefined;
        // Merge roster + series-bible facts (see `resolveEffectiveCharacterFacts`'s
        // own doc comment — traceId Ytrq5TrfJRzyFNRLasyV8 /
        // `planning/vd-character-visual-bible-occupation-fix/plan.md`).
        const effectiveCharacterFacts = resolveEffectiveCharacterFacts(
          {
            name: character.name,
            role: character.role,
            occupation: character.occupation,
            data: (character.data as Record<string, unknown> | null) ?? null,
          },
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );
        const description = effectiveCharacterFacts.description;
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: effectiveCharacterFacts.role,
            narrativeRole: character.narrativeRole as
              | NarrativeRole
              | null
              | undefined,
            roleTier: character.roleTier as RoleTier | null | undefined,
            variantType: character.variantType as "outfit" | "age_stage" | null,
            occupation: effectiveCharacterFacts.occupation,
            roleVisualIntent: character.roleVisualIntent as
              | RoleVisualIntent
              | null
              | undefined,
            roleReviewStatus: character.roleReviewStatus as
              | RoleReviewStatus
              | null
              | undefined,
            description,
            storyContext: seriesRow
              ? {
                  title: seriesRow.title,
                  locale: seriesRow.locale,
                  genre: seriesRow.genre ?? undefined,
                  tone: seriesRow.tone ?? undefined,
                  targetAudience: seriesRow.targetAudience ?? undefined,
                }
              : undefined,
            targetAudienceRegion,
            resolvedCharacterRegion,
            castingPreferences: characterCastingPreferences,
            presetVisualIdentity,
            faceSourceReference,
            hasOwnReferenceImage: referenceSourceIsOwnLikeness(
              referencePortraitSource
            ),
            // Same free-text visual brief the portrait endpoint accepts —
            // a sheet is just as legitimate a target for "ภาพเต็มตัว" /
            // "full-body pose sheet" as a portrait is, and dropping it here
            // was why a framing request typed in the panel had no effect on
            // the sheet button (`planning/vd-character-full-body-framing/
            // plan.md` RC5).
            customInstruction: input.customInstruction,
            // Only sent for a NON-turnaround format — plain "turnaround" is
            // already fully covered by the always-required
            // `turnaround_prompt` field, so no extra skill work is requested
            // for it (see skill.md's "Character Design Bible sheet types").
            requestedSheetType:
              resolvedSheetType === "turnaround"
                ? undefined
                : resolvedSheetType,
            characterDesignContext,
            imagePromptCapability: characterPromptCapability,
            imagePromptContractMode: targetCharacterPrompt
              ? "target"
              : "legacy",
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Character visual prompt generation failed",
          });
        }

        if (resolvedSheetType === "turnaround") {
          sheetPromptText = promptResult.turnaroundPrompt;
        } else {
          // `sheet_prompt` is schema-optional (legitimately absent when no
          // sheet type was requested) but MUST be present here since a
          // non-turnaround type was explicitly requested — surface a missing
          // value as an error (matching this file's existing
          // `VdSchemaValidationError` handling for other required-field
          // violations), never a code-authored fallback string.
          if (!promptResult.sheetPrompt) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Character visual bible skill did not return a sheet_prompt for requested sheet type "${resolvedSheetType}".`,
            });
          }
          sheetPromptText = promptResult.sheetPrompt;
        }
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
        semanticRetryCount = promptResult.semanticRetryCount ?? 0;
        visualBibleToPersist = promptResult.visualBibleSnapshot;
      }

      ({ prompt: sheetPromptText, negativePrompt } =
        applySeriesLookToImagePrompt({
          prompt: sheetPromptText,
          negativePrompt,
          identity: presetVisualIdentity,
        }));
      if (lookLockEnabled && presetVisualIdentity) {
        await recordSeriesLookLockAuditEvent({
          eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
          tenantId,
          userId,
          seriesId,
          path: "characters.generateSheet",
        });
      }
      const normalizedSheetRequest = normalizeCharacterRenderPrompt({
        prompt: sheetPromptText,
        negativePrompt,
        model: resolvedImageModelId,
        capability: characterPromptCapability,
      });
      sheetPromptText = normalizedSheetRequest.prompt;
      negativePrompt = normalizedSheetRequest.negativePrompt;

      // Pricing: the plain turnaround stays priced like a single image (same
      // as the old, now-merged `generateCharacterTurnaround`); every other
      // format (the pre-existing `full_combined` plus the 11 new Character
      // Design Bible formats) is priced like the old `generateCharacterSheet`
      // — a single, more complex multi-panel image call. Prices + generates
      // against the CALLER-SELECTED model — see generateCharacterImage's same
      // comment for rationale — including the text-to-image vs image-to-image
      // split, which applies here identically (a sheet render attaches the
      // same identity-lock reference).
      const sheetCreditCost = calculateCreditCost(pricingModel, {
        numImages: resolvedSheetType === "turnaround" ? 1 : 2,
      });
      const shouldChargeSheetCredits = sheetCreditCost > 0;

      // Feature 135 — Hermes Grok media worker (section 09): resolve the
      // transport-neutral decision BEFORE the credit check below (not
      // after) — see `generateCharacterImage`'s identical block for the
      // full rationale (a Hermes generation must never be gated on the
      // caller's SmartSpec credit balance).
      const transportDecision = await resolveVdCharacterMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
      });

      if (transportDecision.kind !== "hermes" && shouldChargeSheetCredits) {
        const hasCredits = await hasEnoughCredits(userId, sheetCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for character sheet render. Required: ${sheetCreditCost}`,
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
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } =
          await resolveHermesOrderedRefsFromUrls({
            tenantId,
            userId,
            urls: referencePortraitUrl ? [referencePortraitUrl] : [],
            traceId: hermesTraceId,
            connectionId: transportDecision.connectionId,
            roleFor: () => "identity_lock",
            requireAll: Boolean(referencePortraitUrl),
          });
        const references = await buildHermesMediaReferences({
          tenantId,
          userId,
          orderedRefs,
        });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: sheetPromptText,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "9:16",
            outputCount: 1,
          },
          references,
          entity: { type: "vertical_drama_character", id: String(characterId) },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: sheetPromptText,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_character_id: String(characterId),
            __vd_character_prompt_marker:
              VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
            __vd_character_prompt_contract_version: targetCharacterPrompt
              ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
              : "legacy",
          },
          droppedReferenceCount,
        });
        const hermesAssetTag = resolveCharacterSheetAssetTag(resolvedSheetType);

        let hermesDnaPersistenceStatus: "persisted" | "skipped" | "failed" =
          "skipped";
        let hermesDnaPersistenceWarning: string | null = null;
        if (visualBibleToPersist) {
          try {
            await persistCharacterVisualBible(
              { tenantId, userId, seriesId },
              characterId,
              visualBibleToPersist
            );
            hermesDnaPersistenceStatus = "persisted";
          } catch (error) {
            hermesDnaPersistenceStatus = "failed";
            hermesDnaPersistenceWarning =
              "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
            debugError(
              "verticalDramaCharacters.generateCharacterSheet",
              `Character DNA persistence failed after media task ${hermesTask.id}`,
              error
            );
          }
        } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
          hermesDnaPersistenceWarning =
            "Character DNA was not saved because the approved prompt was edited after preview.";
        }

        return {
          taskId: hermesTask.id,
          sheetType: resolvedSheetType,
          sheetPrompt: sheetPromptText,
          negativePrompt,
          promptModel,
          visualBibleSummary,
          creditsUsed: { promptGeneration: promptCreditsUsed },
          assetRole: hermesAssetTag.role,
          assetMetadata: hermesAssetTag.metadata,
          dnaPersistenceStatus: hermesDnaPersistenceStatus,
          dnaPersistenceWarning: hermesDnaPersistenceWarning,
          droppedReferenceCount,
        };
      }

      const transportMetadata =
        transportDecision.kind === "mcp"
          ? transportDecision.transportMetadata
          : undefined;

      if (shouldChargeSheetCredits) {
        await deductCredits({
          userId,
          tenantId,
          amount: sheetCreditCost,
          description: `Vertical Drama — generate character sheet (${resolvedSheetType}) (character #${characterId}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_character_sheet",
            seriesId,
            characterId,
            sheetType: resolvedSheetType,
            type: "reservation",
            creditCost: sheetCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: sheetPromptText,
            characterPromptContext: buildCharacterPromptContext(
              characterPromptCapability,
              semanticRetryCount
            ),
            ...(negativePrompt !== undefined ? { negativePrompt } : {}),
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl
              ? { referenceImageUrls: [referencePortraitUrl] }
              : {}),
            // Series provenance tag — see generateCharacterImage's comment.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_character_id: String(characterId),
              __vd_character_prompt_marker:
                VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER,
              __vd_character_prompt_contract_version: targetCharacterPrompt
                ? VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION
                : "legacy",
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              tenantId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterSheet",
              stage: "submission",
            },
          },
          userToken
        );
      } catch (err) {
        if (shouldChargeSheetCredits) {
          await refundCredits({
            userId,
            amount: sheetCreditCost,
            description: `Refund: character sheet render failed to submit (character #${characterId})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_character_sheet",
              seriesId,
              characterId,
              sheetType: resolvedSheetType,
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Character sheet image generation failed to submit",
        });
      }

      const assetTag = resolveCharacterSheetAssetTag(resolvedSheetType);

      let dnaPersistenceStatus: "persisted" | "skipped" | "failed" = "skipped";
      let dnaPersistenceWarning: string | null = null;
      if (visualBibleToPersist) {
        try {
          await persistCharacterVisualBible(
            { tenantId, userId, seriesId },
            characterId,
            visualBibleToPersist
          );
          dnaPersistenceStatus = "persisted";
        } catch (error) {
          dnaPersistenceStatus = "failed";
          dnaPersistenceWarning =
            "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
          debugError(
            "verticalDramaCharacters.generateCharacterSheet",
            `Character DNA persistence failed after media task ${task.id}`,
            error
          );
        }
      } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
        dnaPersistenceWarning =
          "Character DNA was not saved because the approved prompt was edited after preview.";
      }

      return {
        taskId: task.id,
        sheetType: resolvedSheetType,
        sheetPrompt: sheetPromptText,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
        assetRole: assetTag.role,
        assetMetadata: assetTag.metadata,
        dnaPersistenceStatus,
        dnaPersistenceWarning,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* W12-A voice chain — per-character voice casting                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Lock (or clear, `voiceConfig: null`) a character's voice casting. No
   * paid generation — a plain metadata write, mirroring `updateCharacter`'s
   * ownership-scoped read-modify-write convention. `lockedAt`/`lockedByUserId`
   * are ALWAYS server-stamped from request context, never taken from client
   * input (see `verticalDramaCharacterVoiceConfigInputSchema`, which omits
   * both fields from what the client can even send).
   */
  setCharacterVoiceConfig: verticalDramaVoiceChainProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        voiceConfig: verticalDramaCharacterVoiceConfigInputSchema.nullable(),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const nextVoiceConfig: VerticalDramaCharacterVoiceConfig | null =
        input.voiceConfig
          ? {
              ...input.voiceConfig,
              lockedAt: new Date().toISOString(),
              lockedByUserId: userId,
            }
          : null;

      const [row] = await db
        .update(verticalDramaCharacters)
        .set({ voiceConfig: nextVoiceConfig, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId)
          )
        )
        .returning();

      await recordVoiceChainAuditEvent({
        eventType: "vertical_drama_voice_cast",
        endpoint: "setCharacterVoiceConfig",
        userId,
        seriesId,
        characterId,
        metadata: {
          cleared: nextVoiceConfig === null,
          voiceModelId: nextVoiceConfig?.voiceModelId ?? null,
          voiceId: nextVoiceConfig?.voiceId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      return {
        character: characterRowToDto(row as VerticalDramaCharacterRow, {
          includeVoiceConfig: true,
        }),
      };
    }),

  /**
   * Flattened voice catalog for the series' voice-casting picker. Reuses the
   * EXACT machinery the series-trailer voice picker uses — the `mediaModels`
   * table (`modelType: "audio"`, enabled only) for the model list, then
   * `media.listModelFieldOptions` (via a real in-process tRPC caller into the
   * already-exported `mediaRouter` — never a duplicated network-fetch/caching
   * implementation) for each model's dynamic-or-static voice options, exactly
   * as `VerticalDramaSeriesTrailerPanel.tsx`'s `voiceOptionsQuery` does
   * client-side. Falls back to the model's own flat `voices` column when
   * neither a voice field nor dynamic options are found (the SAME final
   * fallback tier that panel's `modelVoicesColumnOptions` uses — e.g. Gemini
   * TTS models that expose no dynamic voice field at all). Read-only.
   */
  listVoiceCatalog: verticalDramaVoiceChainProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const models = await db
        .select({
          modelId: mediaModels.modelId,
          voices: mediaModels.voices,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(
          and(
            eq(mediaModels.modelType, "audio"),
            eq(mediaModels.isEnabled, true)
          )
        );

      const { mediaRouter } = await import("./media");
      const caller = mediaRouter.createCaller(ctx);
      const voices: VerticalDramaVoiceCatalogEntry[] = [];

      for (const model of models) {
        const fieldKey = resolveVoiceCatalogFieldKey(
          model.configJson as Record<string, unknown> | null
        );
        let options: Array<{
          value: string;
          label: string;
          previewUrl?: string;
        }> = [];
        if (fieldKey) {
          try {
            const result = await caller.listModelFieldOptions({
              modelId: model.modelId,
              fieldKey,
              limit: 500,
            });
            options = result.options;
          } catch (error) {
            // One model's dynamic voice-option fetch (e.g. a transient
            // network error reaching a provider) must never break the whole
            // catalog — fall through to the static `voices` column below.
            debugError(
              "verticalDramaCharacters.listVoiceCatalog",
              "Voice option fetch failed",
              error
            );
          }
        }
        if (
          options.length === 0 &&
          Array.isArray(model.voices) &&
          model.voices.length > 0
        ) {
          options = (model.voices as string[]).map(voice => ({
            value: voice,
            label: voice,
          }));
        }

        for (const option of options) {
          const { language, ageTag } = parseVoiceCatalogLabelMetadata(
            option.label
          );
          voices.push({
            voiceModelId: model.modelId,
            voiceId: option.value,
            label: option.label,
            ...(language ? { language } : {}),
            ...(ageTag ? { ageTag } : {}),
            ...(option.previewUrl ? { previewUrl: option.previewUrl } : {}),
          });
        }
      }

      return { voices };
    }),

  /**
   * Paid, credit-gated preview of a candidate (or already-cast) voice —
   * synthesizes a short sample line so the caller can hear a voice before
   * locking it in. Submitted via the SAME async submit -> `media.getTask`
   * poll -> credit reserve/reconcile machinery every other paid generation
   * mutation in this router uses (`mediaGenerationService.generateAudioAsync`
   * directly — never `media.ts`'s own procedures, same convention as
   * `generateCharacterImage`/`generateCharacterSheet` above). Never persists
   * anything — `voiceConfig`
   * here is a candidate to audition, not a cast (`setCharacterVoiceConfig` is
   * the separate, explicit lock action).
   */
  previewCharacterVoice: verticalDramaVoiceChainProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        voiceConfig: verticalDramaCharacterVoiceConfigInputSchema.optional(),
        sampleText: z.string().trim().max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(
        tenantId,
        userId,
        seriesId,
        characterId
      );

      // Caller-supplied candidate voiceConfig takes priority (auditioning a
      // NOT-YET-cast voice); falls back to the character's already-locked
      // casting so "preview the current cast voice" needs no extra input.
      const candidateVoiceConfig:
        | Partial<VerticalDramaCharacterVoiceConfig>
        | undefined =
        input.voiceConfig ??
        (character.voiceConfig as VerticalDramaCharacterVoiceConfig | null) ??
        undefined;

      if (
        !candidateVoiceConfig?.voiceModelId ||
        !candidateVoiceConfig?.voiceId
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No voice configuration to preview — cast this character first, or supply a voiceConfig to audition.",
        });
      }

      const sampleText = input.sampleText
        ? sanitizeSpeakableLineForDelivery(input.sampleText).slice(0, 120)
        : buildFixedThaiVoicePreviewSample(character.name);

      const pricingModel = await resolveAudioModelPricing(
        candidateVoiceConfig.voiceModelId
      );
      const creditCost = calculateCreditCost(pricingModel, {
        text: sampleText,
      });

      // Zero-cost models skip reserve/refund entirely — same convention as
      // `generateCharacterImage`'s matching comment.
      const shouldChargeCredits = creditCost > 0;
      if (shouldChargeCredits) {
        const hasCredits = await hasEnoughCredits(userId, creditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for voice preview. Required: ${creditCost}`,
          });
        }
        await deductCredits({
          userId,
          tenantId,
          amount: creditCost,
          description: `Vertical Drama — character voice preview (character #${characterId}, reserved)`,
          sourceType: "media_audio",
          metadata: {
            feature: "vertical_drama_character_voice_preview",
            seriesId,
            characterId,
            type: "reservation",
            creditCost,
            modelId: candidateVoiceConfig.voiceModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateAudioAsync(
          {
            text: sampleText,
            model: candidateVoiceConfig.voiceModelId,
            voice: candidateVoiceConfig.voiceId,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              tenantId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.previewCharacterVoice",
              stage: "submission",
            },
          },
          userToken
        );
      } catch (err) {
        if (shouldChargeCredits) {
          await refundCredits({
            userId,
            amount: creditCost,
            description: `Refund: character voice preview failed to submit (character #${characterId})`,
            sourceType: "media_audio",
            metadata: {
              feature: "vertical_drama_character_voice_preview",
              seriesId,
              characterId,
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Character voice preview failed to submit",
        });
      }

      await recordVoiceChainAuditEvent({
        eventType: "vertical_drama_voice_preview",
        endpoint: "previewCharacterVoice",
        userId,
        seriesId,
        characterId,
        creditsCharged: creditCost,
        metadata: {
          voiceModelId: candidateVoiceConfig.voiceModelId,
          voiceId: candidateVoiceConfig.voiceId,
          sampleTextLength: sampleText.length,
          taskId: task.id,
        },
      });

      return { taskId: task.id, creditCost };
    }),
});

/**
 * BullMQ execution bridge for `previewCharacterPrompt`. The worker calls the
 * same mature resolver through an owner-scoped server caller, preserving all
 * model capability checks, credit accounting, schema validation, and existing
 * response normalization while moving the long LLM wait outside HTTP.
 */
export async function runVerticalDramaCharacterPromptJobExecutor(
  payload: VerticalDramaCharacterPromptJobPayload,
  execution: { jobId: string; token: string }
): Promise<unknown> {
  const caller = verticalDramaCharactersRouter.createCaller({
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: payload.userId } as TrpcContext["user"],
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    tenantId: payload.tenantId,
    publicUrl: payload.publicUrl,
  });
  return caller.previewCharacterPrompt({
    ...payload.input,
    workerJobId: execution.jobId,
    workerExecutionToken: execution.token,
  });
}

export type VerticalDramaCharactersRouter =
  typeof verticalDramaCharactersRouter;
