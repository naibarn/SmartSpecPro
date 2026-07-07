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
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaEpisodes,
  verticalDramaApprovalCheckpoints,
  verticalDramaRunArtifacts,
  verticalDramaEpisodeRuns,
  verticalDramaCharacters,
  mediaAssets,
  mediaModels,
} from "../../drizzle/schema";
import { mediaGenerationService, DEFAULT_MODELS } from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import {
  getModelsByTypeAsync,
  resolveVerticalDramaCapabilities,
  deriveModelResolutionOptions,
} from "../services/modelRegistry";
import { hasEnoughCredits, deductCredits, refundCredits } from "../services/creditService";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import { resolveMediaTransport } from "../services/mediaTransportResolver";
import { normalizeMcpProviderModelIdForProvider } from "../services/mcpProviderModelAliases";
import { resolveMcpRouteFromModelId, defaultMcpArgumentShape } from "../services/mcpModelRouteResolver";
import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { verticalDramaCharacterStockService } from "../services/verticalDramaCharacterStock";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  verticalDramaShotReferencesService,
  VerticalDramaShotReferenceError,
  type VerticalDramaShotReferenceRole,
  type VerticalDramaShotReferenceSource,
} from "../services/verticalDramaShotReferences";
import {
  runVerticalDramaEpisodeQualityReview,
  InsufficientCreditsError as QualityReviewInsufficientCreditsError,
  VdSchemaValidationError as QualityReviewVdSchemaValidationError,
  RateLimitExceededError as QualityReviewRateLimitExceededError,
  type EpisodeQualityReviewOutput,
} from "../services/verticalDramaEpisodeQualityReview";
import {
  groupQualityReviewIssuesByStage,
  composeQualityReviewRepairInstruction,
} from "../services/verticalDramaQualityReviewApply";
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
import { generateVerticalDramaShotVideoPrompt } from "../services/verticalDramaVideoMotionPromptGeneration";
import {
  extractShotProductPlacements,
  findPlacementForShot,
  mergeAndTrimReferenceImageUrls,
  mergeProductLockNegativePrompt,
  sanitizeBrandMentionsInPrompt,
  VD_PRODUCT_LOCK_INSTRUCTION,
} from "../services/verticalDramaProductTieIn";
import {
  softenCharacterLockPrompt,
  softenCharacterLockNegativePrompt,
  VD_CHARACTER_LOCK_INSTRUCTION,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
} from "@shared/verticalDramaSeries/characterLock";
import { ensurePromptWithinLimit } from "../services/verticalDramaPromptQc";
import {
  buildCharacterIdentityMapBlock,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
import {
  VERTICAL_DRAMA_MEMORY_KINDS,
  VERTICAL_DRAMA_PROMPT_LANGUAGES,
  VERTICAL_DRAMA_DIALOGUE_LANGUAGES,
  VERTICAL_DRAMA_THAI_ACCENTS,
} from "@shared/verticalDramaSeries";
import type {
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaSubShotPolicy,
  VerticalDramaStartFramePlan,
  VerticalDramaMotionPromptPack,
  VerticalDramaShotgrid,
} from "@shared/verticalDramaSeries";
import {
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  normalizeVerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import {
  buildTargetAudienceRegionInstruction,
  readTargetAudienceRegionFromBible,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  verticalDramaEpisodePipeline,
  VerticalDramaEpisodePipeline,
  VERTICAL_DRAMA_PIPELINE_STAGES,
  VERTICAL_DRAMA_RUNNER_MODES,
  type EpisodeRunOwner,
} from "../services/verticalDramaEpisodePipeline";
import { createVerticalDramaProviderRoutingPort } from "../services/verticalDramaProviderRouting";
import {
  verticalDramaSeriesMemoryService,
  memoryRowToEvent,
} from "../services/verticalDramaSeriesMemory";
import {
  extractClipSourcesFromMotionPromptPack,
  resolveClipsForAssembly,
  submitAssemblyJob,
  compiledVideoFilename,
  type EpisodeClipSource,
} from "../services/verticalDramaEpisodeVideoAssembly";
import { getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";
import {
  generateNextEpisodesViaLlm,
  InsufficientCreditsError as EpisodeContinuationInsufficientCreditsError,
  VdSchemaValidationError as EpisodeContinuationSchemaValidationError,
  type ExistingEpisodeContext,
  type EpisodeBreakdownItem,
} from "../services/verticalDramaEpisodeContinuation";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                         */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
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
const VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG = "episode_quality_review" as const;

/**
 * Load the most recently written episode-quality-review artifact's JSON
 * payload (see `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`), or `null` if the
 * review has never been run for this episode. Tenant + user + series +
 * episode scoped.
 */
async function loadLatestQualityReview(
  owner: EpisodeRunOwner,
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
        eq(verticalDramaRunArtifacts.stage, VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG),
      ),
    )
    .orderBy(desc(verticalDramaRunArtifacts.id))
    .limit(1);
  if (!row?.jsonPayload) return null;
  return row.jsonPayload as EpisodeQualityReviewOutput;
}

/**
 * Persist a freshly-generated quality-review payload via the existing
 * run/artifact ledger tables (see `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s
 * doc comment) — extracted so both `runEpisodeQualityReview` and
 * `applyQualityReviewSuggestions`'s auto re-review share the exact same
 * persistence path (one ledger row shape, one place to change it).
 */
async function persistQualityReviewArtifact(
  owner: EpisodeRunOwner,
  review: EpisodeQualityReviewOutput,
): Promise<void> {
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Referenced media asset not found" });
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
  motionPromptPack: unknown,
): Promise<Record<string, { url: string; thumbnailUrl: string | null }>> {
  const ids = new Set<string>();
  const frames = (startFramePlan as VerticalDramaStartFramePlan | null)?.frames ?? [];
  for (const frame of frames) {
    if (frame?.approvedMediaAssetId) ids.add(String(frame.approvedMediaAssetId));
  }
  const clips = (motionPromptPack as VerticalDramaMotionPromptPack | null)?.clips ?? [];
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
        eq(mediaAssets.userId, userId),
      ),
    );

  const result: Record<string, { url: string; thumbnailUrl: string | null }> = {};
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
  assetIds: number[],
): Promise<Map<number, string>> {
  const uniqueIds = Array.from(new Set(assetIds)).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({ id: mediaAssets.id, originalUrl: mediaAssets.originalUrl })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, uniqueIds),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId),
      ),
    );
  const map = new Map<number, string>();
  for (const row of rows) {
    if (row.originalUrl) map.set(row.id, row.originalUrl);
  }
  return map;
}

/**
 * Resolve every character in the series to its current approved primary
 * portrait (if any), keyed by `characterKey` — the same key storyboard shots
 * reference in `characters`/`required_character_refs`. Lets the client show
 * "which character(s) does this shot need" directly on the shot card, so
 * identity-lock is visible/correctable per shot instead of only happening
 * invisibly inside generation calls.
 */
async function resolveSeriesCharacterPortraits(
  tenantId: string,
  userId: number,
  seriesId: number,
): Promise<
  Record<string, { characterId: string; name: string; portraitUrl: string | null }>
> {
  const characterRows = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    );

  const portraitUrls = await Promise.all(
    characterRows.map((c: { id: number }) =>
      verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        c.id,
      ),
    ),
  );

  const result: Record<string, { characterId: string; name: string; portraitUrl: string | null }> = {};
  characterRows.forEach(
    (c: { id: number; characterKey: string; name: string }, i: number) => {
      result[c.characterKey] = {
        characterId: String(c.id),
        name: c.name,
        portraitUrl: portraitUrls[i],
      };
    },
  );
  return result;
}

/**
 * Resolve a shot's `requiredCharacterRefs` (character keys) to their approved
 * primary-portrait URLs — the identity-lock reference set for one image
 * generation call. Shared by `generateStartFrameImage` and
 * `generateStartFrameAngleVariations` (previously duplicated inline).
 */
async function resolveShotCharacterReferenceUrls(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterKeys: string[] | undefined,
): Promise<string[]> {
  if (!characterKeys?.length) return [];
  const characterRows = await db
    .select({ id: verticalDramaCharacters.id })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.seriesId, seriesId),
        inArray(verticalDramaCharacters.characterKey, characterKeys),
      ),
    );
  const urls = await Promise.all(
    characterRows.map((c: { id: number }) =>
      verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        { tenantId, userId, seriesId },
        c.id,
      ),
    ),
  );
  return urls.filter((u): u is string => Boolean(u));
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
  characterKeys: string[] | undefined,
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
        inArray(verticalDramaCharacters.characterKey, characterKeys),
      ),
    );
  return rows.map((row: (typeof rows)[number]) => ({
    characterKey: row.characterKey,
    name: row.name,
    role: row.role,
    description:
      typeof (row.data as Record<string, unknown> | null)?.description === "string"
        ? ((row.data as Record<string, unknown>).description as string)
        : undefined,
  }));
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
function resolveShotProductReferenceUrls(productReferenceAssetIds: string[] | undefined): string[] {
  if (!productReferenceAssetIds?.length) return [];
  return productReferenceAssetIds.filter(
    (u): u is string => typeof u === "string" && /^https?:\/\//.test(u),
  );
}

type ShotDialogueLine = {
  characterKey?: string;
  lineTh: string;
  emotion?: string;
  delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
  subtext?: string;
};

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
 * 3. `script.scene_dialogue_summary[].dialogue_lines[]` — the script stage's
 *    per-scene dialogue (always populated once the script exists, well
 *    before dialogue-planning or storyboard runs). There is no persisted
 *    shot→scene index, so the shot is mapped onto the scene list
 *    proportionally by its position among the episode's shots (best-effort;
 *    good enough to recover real Thai dialogue instead of silence).
 *
 * Returns `[]` (never throws) when none of the three sources has anything
 * usable for this shot — the caller/skill then decides whether to write a
 * short line itself (only when the shot's description implies speech).
 */
export function resolveShotDialogueLines(params: {
  shotNumber: number;
  matchingClip?: { dialogue?: ShotDialogueLine[]; clipNumber: number };
  dialogueAudioPlan: { dialogue_lines?: Array<Record<string, unknown>> } | null;
  script: Record<string, unknown> | null;
  storyboardShotCount: number | undefined;
}): ShotDialogueLine[] {
  const { shotNumber, matchingClip, dialogueAudioPlan, script, storyboardShotCount } = params;

  // 1. Already-synced clip dialogue — most authoritative.
  if (matchingClip?.dialogue && matchingClip.dialogue.length > 0) {
    return matchingClip.dialogue.filter((l) => l.lineTh?.trim().length > 0);
  }

  // 2. `dialogueAudioPlan.dialogue_lines[]` (pre-existing logic, unchanged).
  const rawDialogueLines = Array.isArray(dialogueAudioPlan?.dialogue_lines)
    ? (dialogueAudioPlan!.dialogue_lines as Array<Record<string, unknown>>)
    : [];
  const planLines = rawDialogueLines
    .filter((line) => {
      const lineShotNumber = line.shot_number;
      const clipNumber = line.clip_number;
      if (typeof lineShotNumber === "number" && lineShotNumber === shotNumber) return true;
      if (
        matchingClip &&
        typeof clipNumber === "number" &&
        clipNumber === matchingClip.clipNumber
      )
        return true;
      return false;
    })
    .map((line) => ({
      characterKey:
        typeof line.speaker_character_id === "string" ? line.speaker_character_id : undefined,
      lineTh: typeof line.dialogue_line === "string" ? line.dialogue_line : "",
      emotion: typeof line.emotion === "string" ? line.emotion : undefined,
      delivery: line.delivery as
        | { tone?: string; pace?: string; pauses?: string; texture?: string }
        | undefined,
      subtext: typeof line.subtext === "string" ? line.subtext : undefined,
    }))
    .filter((l) => l.lineTh.trim().length > 0);
  if (planLines.length > 0) return planLines;

  // 3. Script's `scene_dialogue_summary[].dialogue_lines[]` — proportional
  // shot→scene mapping (no persisted index exists).
  const sceneDialogueSummary = Array.isArray(script?.scene_dialogue_summary)
    ? (script!.scene_dialogue_summary as Array<Record<string, unknown>>)
    : [];
  if (sceneDialogueSummary.length === 0) return [];

  const shotCount = storyboardShotCount && storyboardShotCount > 0 ? storyboardShotCount : 9;
  const sceneIndex = Math.min(
    sceneDialogueSummary.length - 1,
    Math.floor(((shotNumber - 1) / shotCount) * sceneDialogueSummary.length),
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
          lineTh: raw.slice(colonIndex + 1).trim().replace(/^[""]|[""]$/g, ""),
        };
      }
      return { lineTh: raw.trim() };
    })
    .filter((l): l is ShotDialogueLine => l !== null && l.lineTh.length > 0);
}

/**
 * Resolve the effective image model for a start-frame generation call:
 * episode-level `startFramePlan.selectedImageModelId` (Phase 1.2 resolution
 * order: episode selection → `DEFAULT_MODELS`), falling back to
 * `DEFAULT_MODELS.image` when the plan has no selection yet OR the selected
 * model is no longer enabled (fails closed to a known-good default rather
 * than submitting a generation call with a dead model id). Shared by
 * `generateStartFrameImage` and `generateStartFrameAngleVariations` so both
 * call sites — and their credit pricing — stay in sync with the same
 * resolution.
 */
export async function resolveEpisodeImageModelId(
  plan: VerticalDramaStartFramePlan | null,
): Promise<string> {
  const requested = plan?.selectedImageModelId?.trim();
  if (!requested) return DEFAULT_MODELS.image;
  const models = await getModelsByTypeAsync("image");
  const model = models.find(m => m.id === requested);
  if (!model || model.isEnabled === false) return DEFAULT_MODELS.image;
  return model.id;
}

/**
 * Resolve the effective video model DEFINITION (not just the id) for a video
 * clip generation call: episode-level `motionPromptPack.selectedVideoModelId`
 * (Phase 1.2 resolution order: episode selection → `DEFAULT_MODELS`), falling
 * back to `DEFAULT_MODELS.video` when the pack has no selection yet OR the
 * selected model is no longer enabled — same fail-closed convention as
 * `resolveEpisodeImageModelId`. Returns the full `ModelDefinition` (not just
 * the id) because `formatVideoClipRequest` needs the capability metadata
 * (`configJson`/`aspectRatios`/`provider`/`aliases`) to resolve
 * `nativeAudioDialogue`/`maxReferenceImages` for the requested model — a
 * second lookup by id would risk resolving a DIFFERENT model if the catalog
 * changed between the two calls.
 */
export async function resolveEpisodeVideoModel(
  pack: VerticalDramaMotionPromptPack | null,
): Promise<import("../services/modelRegistry").ModelDefinition> {
  const models = await getModelsByTypeAsync("video");
  const requested = pack?.selectedVideoModelId?.trim();
  if (requested) {
    const model = models.find(m => m.id === requested);
    if (model && model.isEnabled !== false) return model;
  }
  const fallback = models.find(m => m.id === DEFAULT_MODELS.video);
  if (fallback) return fallback;
  // Extremely defensive last resort — the catalog should always contain
  // `DEFAULT_MODELS.video`, but never throw out of a resolution helper.
  return {
    id: DEFAULT_MODELS.video,
    type: "video",
    name: DEFAULT_MODELS.video,
    provider: "unknown",
    description: "",
    aliases: [],
    creditCost: 10,
  };
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
  idempotencyKey?: string;
}): Promise<MediaTaskTransportMetadata | null> {
  const modelTransport = resolveMediaModelTransportConfig({
    modelId: params.modelId,
    configJson: params.configJson,
  });
  const modelRoute = resolveMcpRouteFromModelId(params.modelId);
  const shouldUseMcpTransport = modelTransport.transport === "mcp" || Boolean(modelRoute.providerKey);
  if (!shouldUseMcpTransport) return null;

  const providerKey = modelTransport.providerKey ?? modelRoute.providerKey;
  if (!providerKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `MCP provider route metadata is missing for model "${params.modelId}". Re-select an MCP media model and try again.`,
    });
  }
  const rawProviderModelId = modelTransport.providerModelId ?? modelRoute.providerModelId;
  const argumentShape = modelTransport.argumentShape ?? defaultMcpArgumentShape(providerKey, params.assetType);
  const providerModelId = normalizeMcpProviderModelIdForProvider({
    providerKey,
    providerModelId: rawProviderModelId,
    assetType: params.assetType,
    argumentShape,
  }) ?? rawProviderModelId;

  if (!params.mcpConnectionId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${params.modelId}" requires a connected MCP provider account. Connect a ${providerKey} MCP account first, then re-select this model.`,
    });
  }

  return resolveMediaTransport({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    originSurface: "media_studio",
    assetType: params.assetType,
    requestedTransport: "mcp",
    mcpConnectionId: params.mcpConnectionId,
    providerKey,
    providerModelId,
    model: providerModelId ?? params.modelId,
    toolName: modelTransport.toolName,
    argumentShape,
    idempotencyKey: params.idempotencyKey,
  });
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
  mediaType: "image" | "video",
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
  resolution: string | undefined,
): void {
  if (!resolution) return;
  const options = deriveModelResolutionOptions(pricingModel);
  if (!options || options.length === 0) return;
  const match = options.find((o) => o.value === resolution);
  if (!match) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid resolution "${resolution}" — supported values: ${options.map(o => o.value).join(", ")}`,
    });
  }
}

/** Resolve the effective sub-shot policy for a tenant (flag-gated, fail-closed). */
async function resolveSubShotPolicy(
  tenantId: string,
  override?: Partial<VerticalDramaSubShotPolicy>
): Promise<{ flagOn: boolean; policy: VerticalDramaSubShotPolicy }> {
  const flags = await getTenantFeatureFlags(tenantId);
  const flagOn = flags.verticalDramaSeriesSubShots === true;
  const policy: VerticalDramaSubShotPolicy = {
    ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    ...(override ?? {}),
    enabled: flagOn && (override?.enabled ?? true),
  };
  return { flagOn, policy };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const idempotencyKey = z.string().trim().min(1).max(128).optional();
/**
 * Character-lock auto-soften level (2026-07-06 prompt-safety upgrade) — 0/
 * absent = full lock (default/first attempt), 1 = softened wording, 2 =
 * minimal lock. The client resubmits the SAME mutation with `softenLevel + 1`
 * (capped at `VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL`) when a generation task
 * fails with a policy/content/safety-category provider error — see
 * `isCharacterLockPolicyFailureMessage` / `softenCharacterLockPrompt` in
 * `@shared/verticalDramaSeries/characterLock`.
 */
const softenLevel = z.number().int().min(0).max(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL).optional();
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
        count: z.number().int().min(1).max(5).default(1),
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
        episodeNumber: number;
        title: string | null;
        script: unknown;
      }> = await db
        .select({
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
      let remaining = input.count;
      let creditsUsed = 0;
      let usedModeA = false;
      let usedModeB = false;

      // Mode A — materialize unused planned breakdown entries (free, no LLM call).
      const unusedPlanned = episodeBreakdown
        .filter(b => b.episodeNumber > maxEpisodeNumber)
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

      // Append (never overwrite) the newly-generated entries into the
      // series' bible.episodeBreakdown so future calls see them as
      // "existing episodes" too.
      if (appendedBreakdown.length > 0) {
        const updatedBible = {
          ...bible,
          episodeBreakdown: [...episodeBreakdown, ...appendedBreakdown],
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
      await loadOwnedEpisode(owner);

      const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.script !== undefined) updates.script = input.script;
      if (input.storyboard !== undefined) updates.storyboard = input.storyboard;
      if (input.startFramePlan !== undefined)
        updates.startFramePlan = input.startFramePlan;
      if (input.dialogueAudioPlan !== undefined)
        updates.dialogueAudioPlan = input.dialogueAudioPlan;
      if (input.motionPromptPack !== undefined)
        updates.motionPromptPack = input.motionPromptPack;
      if (input.assemblyManifest !== undefined)
        updates.assemblyManifest = input.assemblyManifest;

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
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      const outcome = await pipelineForMode(input.mode).runStage(
        owner,
        input.stage,
        {
          mode: input.mode as never,
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
          idempotencyKey: input.idempotencyKey,
        }
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
      await loadOwnedEpisode(owner);

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
      // artifact tables just deleted above, and were the actual cause of the
      // "says regenerated but still shows the same old data" bug: the UI's
      // storyboard panel (and equivalents) key off THIS column's content
      // directly, regardless of whether a run/checkpoint still backs it.
      // The clicked stage's own column is deliberately left alone — `runStage`
      // below overwrites it immediately with fresh content.
      const downstreamColumnByStage: Partial<
        Record<VerticalDramaPipelineStage, keyof typeof verticalDramaEpisodes.$inferInsert>
      > = {
        plan_episode_script: "script",
        storyboard_shotgrid: "storyboard",
        start_frame_render_plan: "startFramePlan",
        dialogue_audio_plan: "dialogueAudioPlan",
        video_motion_prompt_pack: "motionPromptPack",
        assemble_episode_manifest: "assemblyManifest",
      };
      const downstream = VerticalDramaEpisodePipeline.downstreamStages(input.stage);
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

      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      const outcome = await pipelineForMode("full").runStage(
        owner,
        input.stage,
        {
          mode: "full",
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
          idempotencyKey: input.idempotencyKey,
        }
      );
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
      await loadOwnedEpisode(owner);
      const { flagOn, policy } = await resolveSubShotPolicy(
        tenantId,
        input.subShotPolicy
      );
      return pipelineForMode(input.mode).runEpisode(owner, {
        mode: input.mode as never,
        fromStage: input.fromStage,
        subShotFlagOn: flagOn,
        subShotPolicy: policy,
        idempotencyKey: input.idempotencyKey,
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
      const outcome = await verticalDramaEpisodePipeline.repairStage(
        owner,
        input.stage,
        {
          sourceArtifactId: input.artifactId,
          target: input.target,
          instruction: input.instruction,
          subShotFlagOn: flagOn,
          subShotPolicy: policy,
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
        const supersededEvents = await verticalDramaSeriesMemoryService.listEvents(
          {
            tenantId,
            userId,
            seriesId,
            kind: "canonical_fact",
            limit: 1000,
          }
        );
        contradictedFact = supersededEvents
          .filter((ev) => input.supersedesEventIds!.includes(ev.memoryEventId))
          .map((ev) => ev.summaryText || String(ev.payload?.fact ?? ""))
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
      const row = await loadOwnedEpisode({
        tenantId,
        userId,
        seriesId,
        episodeId,
      });
      const [assetUrls, characterPortraits, qualityReview] = await Promise.all([
        resolveEpisodePlanAssetUrls(
          tenantId,
          userId,
          row.startFramePlan,
          row.motionPromptPack,
        ),
        resolveSeriesCharacterPortraits(tenantId, userId, seriesId),
        loadLatestQualityReview({ tenantId, userId, seriesId, episodeId }),
      ]);
      return {
        script: row.script as Record<string, unknown> | null,
        dialogueAudioPlan: row.dialogueAudioPlan as Record<
          string,
          unknown
        > | null,
        storyboard: row.storyboard as Record<string, unknown> | null,
        storyboardReviewId: row.storyboardReviewId as string | null,
        startFramePlan: row.startFramePlan as VerticalDramaStartFramePlan | null,
        motionPromptPack: row.motionPromptPack as VerticalDramaMotionPromptPack | null,
        assemblyManifest: row.assemblyManifest as Record<string, unknown> | null,
        qualityReview,
        assetUrls,
        characterPortraits,
      };
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid media asset id" });
      }
      const [asset] = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, numericAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, userId),
          ),
        )
        .limit(1);
      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media asset not found" });
      }

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      if (!plan || !Array.isArray(plan.frames)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No start-frame plan exists yet for this episode",
        });
      }
      const frameIndex = plan.frames.findIndex(f => f.shotNumber === input.shotNumber);
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
        previousAssetIdRaw != null && Number.isInteger(Number(previousAssetIdRaw))
          ? Number(previousAssetIdRaw)
          : null;

      const updatedFrames = plan.frames.slice();
      updatedFrames[frameIndex] = {
        ...updatedFrames[frameIndex],
        approvedMediaAssetId: input.mediaAssetId,
      };
      const updatedPlan: VerticalDramaStartFramePlan = { ...plan, frames: updatedFrames };

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
          numericAssetId,
        );
      }

      const assetUrls = await resolveEpisodePlanAssetUrls(
        tenantId,
        userId,
        updatedPlan,
        row.motionPromptPack,
      );
      return { startFramePlan: updatedPlan, assetUrls };
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
          message: "Provide at least one of selectedImageModelId or selectedVideoModelId",
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

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
          ? { ...updatedStartFramePlan, selectedImageModelId: input.selectedImageModelId }
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
          ? { ...updatedMotionPromptPack, selectedVideoModelId: input.selectedVideoModelId }
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
          .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
          .from(mediaModels)
          .where(eq(mediaModels.modelId, input.selectedImageModelId))
          .limit(1);
        const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
        imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });
      }

      let videoCreditCost: number | undefined;
      if (input.selectedVideoModelId) {
        const [pricingRow] = await db
          .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
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
      if (!input.promptLanguage && !input.dialogueLanguage && !input.thaiAccent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide at least one of promptLanguage, dialogueLanguage, or thaiAccent",
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      // Hygiene rule: `thaiAccent` is only meaningful when the effective
      // dialogue language is Thai. If the caller explicitly sets a
      // non-Thai `dialogueLanguage`, drop any existing `thaiAccent` from
      // the persisted pack entirely rather than leave a stale accent value
      // that would silently apply if the language were ever switched back.
      const shouldClearThaiAccent =
        Boolean(input.dialogueLanguage) && input.dialogueLanguage !== "th";

      const existingPack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const updatedPack: VerticalDramaMotionPromptPack = existingPack
        ? {
            ...existingPack,
            ...(input.promptLanguage ? { promptLanguage: input.promptLanguage } : {}),
            ...(input.dialogueLanguage ? { dialogueLanguage: input.dialogueLanguage } : {}),
            ...(input.thaiAccent ? { thaiAccent: input.thaiAccent } : {}),
          }
        : {
            selectedVideoModelId: DEFAULT_MODELS.video,
            durationProfileId:
              row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
            motionMode: "first_frame_to_video",
            clips: [],
            warnings: [],
            ...(input.promptLanguage ? { promptLanguage: input.promptLanguage } : {}),
            ...(input.dialogueLanguage ? { dialogueLanguage: input.dialogueLanguage } : {}),
            ...(input.thaiAccent ? { thaiAccent: input.thaiAccent } : {}),
          };

      if (shouldClearThaiAccent) {
        delete updatedPack.thaiAccent;
      }

      const [updatedRow] = await db
        .update(verticalDramaEpisodes)
        .set({ motionPromptPack: updatedPack, updatedAt: new Date() })
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
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex = plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
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

      // Character-lock auto-soften (2026-07-06 prompt-safety upgrade) — a
      // no-op at `softenLevel` 0/absent (the default/first attempt). Applied
      // to the STORED prompt text before any further appends below, so a
      // softened retry also carries through to the product-lock/QC steps
      // untouched.
      const effectiveSoftenLevel = input.softenLevel ?? 0;
      const softenedImagePrompt = softenCharacterLockPrompt(frame.imagePrompt, effectiveSoftenLevel);
      const softenedNegativePrompt = softenCharacterLockNegativePrompt(
        frame.negativePrompt,
        effectiveSoftenLevel,
      );

      // Identity-lock references — resolve each required character's
      // approved portrait, same lookup `generateRealStoryboard` uses.
      const characterRefUrls = await resolveShotCharacterReferenceUrls(
        tenantId,
        userId,
        seriesId,
        frame.requiredCharacterRefs,
      );
      // Product tie-in reference (spec: the product must physically appear
      // in the shot, not just be described in text) — appended AFTER
      // character refs so identity-lock always takes priority when a model's
      // `maxReferenceImages` forces trimming.
      const productRefUrls = resolveShotProductReferenceUrls(frame.productReferenceAssetIds);

      // Resolution order (spec Phase 1.2): episode-level selection →
      // `DEFAULT_MODELS`. Pricing AND the actual generation call below both
      // use this same resolved model id — previously this always priced +
      // generated with `DEFAULT_MODELS.image`, silently ignoring the
      // episode's `selectedImageModelId` entirely.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCapabilities = resolveVerticalDramaCapabilities(resolvedImageModelId, {
        type: "image",
        configJson: pricingModel.configJson ?? undefined,
      });
      const { urls: referenceImageUrls, trimmedCount: trimmedProductReferenceCount } =
        mergeAndTrimReferenceImageUrls(
          characterRefUrls,
          productRefUrls,
          imageCapabilities.maxReferenceImages,
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
      if (shouldChargeImageCredits) {
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

      // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
      // dispatched through the service's MCP branch, not the default
      // gateway_api/Python-backend path — see `resolveVdMcpTransportMetadata`.
      const transportMetadata = await resolveVdMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        idempotencyKey: input.idempotencyKey,
      });

      // Final-prompt QC (hard length cap) — enforced right before the
      // outgoing image render call. No-op (zero LLM calls / zero credits)
      // when the stored prompt is already within `VD_IMAGE_PROMPT_MAX`.
      const imagePromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: softenedImagePrompt,
        userId,
        tenantId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `start-frame image prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

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
              productRefUrls.length > 0,
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
          message: err instanceof Error ? err.message : "Start-frame image generation failed to submit",
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
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frameIndex = plan?.frames?.findIndex(f => f.shotNumber === input.shotNumber) ?? -1;
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

      // Character-lock auto-soften — same convention as `generateStartFrameImage`.
      const effectiveSoftenLevel = input.softenLevel ?? 0;
      const softenedImagePrompt = softenCharacterLockPrompt(frame.imagePrompt, effectiveSoftenLevel);
      const softenedNegativePrompt = softenCharacterLockNegativePrompt(
        frame.negativePrompt,
        effectiveSoftenLevel,
      );

      const characterRefUrls = await resolveShotCharacterReferenceUrls(
        tenantId,
        userId,
        seriesId,
        frame.requiredCharacterRefs,
      );
      const productRefUrls = resolveShotProductReferenceUrls(frame.productReferenceAssetIds);

      // Character identity map (2026-07-07 non-human-character-vanishing
      // fix) — re-injected directly into the grid prompt (not just relying
      // on the base `imagePrompt` already carrying it) since
      // `softenCharacterLockPrompt` may progressively relax identity-lock
      // wording on repeated policy-failure retries. See
      // `@shared/verticalDramaSeries/characterIdentityMap.ts`.
      const angleGridCharacterIdentitySources = await resolveShotCharacterIdentitySources(
        tenantId,
        seriesId,
        frame.requiredCharacterRefs,
      );
      const angleGridCharacterIdentityMapBlock = buildCharacterIdentityMapBlock(
        frame.requiredCharacterRefs ?? [],
        angleGridCharacterIdentitySources,
      );

      // Resolution order (spec Phase 1.2): episode-level selection →
      // `DEFAULT_MODELS` — same resolver `generateStartFrameImage` uses, so
      // both call sites for this shot always price + generate with the same
      // model.
      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);

      // 9 cells at ~2x the per-shot credit cost (one grid render, not nine) —
      // matches how the pre-existing contact-sheet planner prices a sheet.
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const angleImageCapabilities = resolveVerticalDramaCapabilities(resolvedImageModelId, {
        type: "image",
        configJson: pricingModel.configJson ?? undefined,
      });
      const { urls: referenceImageUrls, trimmedCount: trimmedProductReferenceCount } =
        mergeAndTrimReferenceImageUrls(
          characterRefUrls,
          productRefUrls,
          angleImageCapabilities.maxReferenceImages,
        );
      assertResolutionOption(pricingModel, input.resolution);
      const gridCreditCost = calculateCreditCost(pricingModel, {
        numImages: 2,
        ...(input.resolution ? { resolution: input.resolution } : {}),
      });
      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
      // entirely — see the matching comment in `generateStartFrameImage`.
      const shouldChargeGridCredits = gridCreditCost > 0;
      if (shouldChargeGridCredits) {
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

      // Series-level target-audience region — continuity-only note (the
      // region is already baked into `frame.imagePrompt` by the start-frame
      // planner; this is just a reminder so the 9-panel grid never drifts
      // the region/ethnicity across panels).
      const gridRegion = await loadSeriesTargetAudienceRegion(tenantId, userId, seriesId);

      // Storyboard-complete plan Phase 6.3: the previous prompt listed each
      // angle by NAME ("wide establishing shot", "close-up (pan)", etc.)
      // inside the same sentence the image model renders — several image
      // models interpret that as an instruction to actually PRINT that label
      // as on-image text/caption per panel, producing burned-in text that
      // makes the grid unusable as a Veo start frame (start frames must be
      // pure photographic content, no overlay text). Fix: keep the angle
      // DIVERSITY instruction (still lists example angles so the model still
      // varies framing) but make the "no text anywhere in the image" rule
      // extremely explicit and repeated, and mirror it into the negative
      // prompt too so it's enforced on both sides of the request.
      const gridPrompt = [
        softenedImagePrompt,
        "",
        "Render this EXACT same scene, subject, wardrobe, lighting, and moment as a single image containing a 3x3 grid of 9 panels — 3 rows, 3 columns, each panel a full 9:16 vertical frame with a thin visible divider between panels.",
        "Each of the 9 panels must show the SAME moment from a DIFFERENT camera angle/framing (for example: wide establishing shot, medium shot, close-up, over-the-shoulder, low angle, high angle, dutch angle, extreme close-up, three-quarter profile) — vary ONLY the camera position/framing per panel, purely through the photographed composition itself.",
        "Keep character identity, wardrobe, and lighting perfectly consistent across all 9 panels — only the camera position/framing changes.",
        `Continuity note (region/ethnicity): ${buildTargetAudienceRegionInstruction(gridRegion)}`,
        angleGridCharacterIdentityMapBlock,
        "ABSOLUTELY NO TEXT ANYWHERE IN THE IMAGE: do not render any captions, labels, titles, shot-type names, camera-angle names, panel numbers, watermarks, logos, subtitles, or any other typography or lettering in any panel or in the grid dividers. The grid must contain photographic content ONLY — no on-image text of any kind, in any language, anywhere in the frame.",
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      // Final-prompt QC (hard length cap) — enforced on the FINAL grid
      // prompt (base imagePrompt + fixed grid instructions), since that
      // concatenated string is what actually gets sent to the provider.
      const gridPromptQc = await ensurePromptWithinLimit({
        kind: "image",
        prompt: gridPrompt,
        userId,
        tenantId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `multi-angle grid prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });
      // Product lock (spec follow-up to tie-in) — same negative-prompt guard
      // as `generateStartFrameImage`, applied only when this shot actually
      // has product reference image(s) attached to the grid call.
      const gridNegativePrompt = [
        mergeProductLockNegativePrompt(softenedNegativePrompt, productRefUrls.length > 0),
        "text, caption, captions, label, labels, title, titles, watermark, watermarks, logo, subtitle, subtitles, typography, lettering, writing, words, on-screen text, panel numbers, shot names, camera angle names",
      ]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(", ");

      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
      const transportMetadata = await resolveVdMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        idempotencyKey: input.idempotencyKey,
      });

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
              source: "trpc.verticalDramaEpisodes.generateStartFrameAngleVariations",
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
          message: err instanceof Error ? err.message : "Multi-angle grid generation failed to submit",
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
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

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
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [currentAssetId]);
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
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };

      // Require the resolved model to actually accept an image input
      // (`maxReferenceImages >= 1`, e.g. img2img/i2i) OR be an MCP-transport
      // model whose provider supports image input — otherwise the "repair"
      // request would silently be treated as pure text-to-image and ignore
      // the current image entirely, which is worse than failing loudly.
      const capabilities = resolveVerticalDramaCapabilities(resolvedImageModelId, {
        type: "image",
        configJson: pricingModel.configJson ?? undefined,
      });
      const modelSupportsImageInput = (capabilities.maxReferenceImages ?? 0) >= 1;
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
          .filter((m) => {
            const caps = resolveVerticalDramaCapabilities(m.id, {
              type: "image",
              configJson: m.configJson ?? undefined,
            });
            return (caps.maxReferenceImages ?? 0) >= 1 && m.isEnabled !== false;
          })
          .map((m) => m.name);
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
      if (shouldChargeImageCredits) {
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

      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
      const transportMetadata = await resolveVdMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        idempotencyKey: input.idempotencyKey,
      });

      // Series-level target-audience region — preservation directive so an
      // image-to-image repair never drifts the character's region/ethnicity
      // away from the series' configured default (the character's own
      // description, already baked into the reference image, still wins).
      const repairRegion = await loadSeriesTargetAudienceRegion(tenantId, userId, seriesId);

      // Product lock (spec follow-up to tie-in) — this shot's tie-in product
      // reference(s), if any, must never be redesigned by the repair edit
      // either (e.g. an instruction like "change the lighting" must not also
      // let the model reinterpret the product sitting in frame).
      const repairIsTieInShot = Boolean(frame.productReferenceAssetIds?.length);

      const repairPrompt = [
        input.instruction.trim(),
        VD_CHARACTER_LOCK_INSTRUCTION,
        "Pose, composition, and framing should follow the requested change; apply ONLY the requested change beyond the identity lock above.",
        `Preservation directive (region/ethnicity): ${buildTargetAudienceRegionInstruction(repairRegion)}`,
        repairIsTieInShot ? VD_PRODUCT_LOCK_INSTRUCTION : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" ");

      // Character-lock auto-soften — same convention as `generateStartFrameImage`.
      const effectiveSoftenLevel = input.softenLevel ?? 0;
      const softenedRepairPrompt = softenCharacterLockPrompt(repairPrompt, effectiveSoftenLevel);

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
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `image repair prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });

      const userToken = getStartFrameMediaUserToken(ctx);
      try {
        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: repairPromptQc.prompt,
            negativePrompt: mergeProductLockNegativePrompt(undefined, repairIsTieInShot),
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
        return { taskId: task.id, modelId: resolvedImageModelId, creditCost: imageCreditCost };
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
          message: err instanceof Error ? err.message : "Image repair generation failed to submit",
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
        // Optional output resolution (storyboard-complete plan Phase
        // 6.2b) — e.g. "720p"/"1080p"/"4K" per Veo's tiers. Same convention
        // as `generateStartFrameImage`.
        resolution: z.string().trim().max(32).optional(),
        idempotencyKey,
      }),
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
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const clip = pack?.clips?.find((c) => c.clipNumber === input.clipNumber);
      if (!pack || !clip) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No motion prompt for clip ${input.clipNumber} yet — generate the video motion prompt pack first`,
        });
      }
      if (!clip.prompt?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Clip ${input.clipNumber} has no motion prompt yet`,
        });
      }

      // Resolution order (Phase 1.2): episode-level selection -> DEFAULT_MODELS.
      const model = await resolveEpisodeVideoModel(pack);

      // Shot references (Phase 2.6): gather the clip's shot(s) linked
      // reference images, trimmed to this model's `maxReferenceImages` by
      // `sortOrder` (lowest kept first) — never silently drop without
      // reporting: `trimmedReferenceCount` is always returned.
      const primaryShotNumber = clip.parentShotNumber ?? clip.sourceShotNumbers[0];
      const shotReferences = primaryShotNumber
        ? await verticalDramaShotReferencesService.listForShot(
            { tenantId, userId, seriesId },
            episodeId,
            primaryShotNumber,
          )
        : [];

      const capabilities = resolveVerticalDramaCapabilities(model.id, {
        type: model.type,
        aspectRatios: model.aspectRatios,
        configJson: model.configJson,
      });
      const maxReferenceImages = capabilities.maxReferenceImages ?? 0;
      const orderedReferenceAssetIds = shotReferences
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => Number(r.mediaAssetId));
      const trimmedReferenceCount = Math.max(
        0,
        orderedReferenceAssetIds.length - maxReferenceImages,
      );
      const keptReferenceAssetIds =
        maxReferenceImages > 0
          ? orderedReferenceAssetIds.slice(0, maxReferenceImages)
          : [];

      // Resolve the approved start frame + kept reference assets to URLs in
      // one batch. The approved start frame goes first in the array so a
      // model that only reads `referenceImageUrls[0]` as its start/first
      // frame (the generic "market" dispatch convention — see
      // `modelRegistry.ts`'s `grok-imagine-video-1-5-preview`/HappyHorse
      // entries) still gets the right image first.
      const startFrameAssetId = clip.startFrameAssetId
        ? Number(clip.startFrameAssetId)
        : undefined;
      const idsToResolve = [
        ...(startFrameAssetId ? [startFrameAssetId] : []),
        ...keptReferenceAssetIds,
      ];
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, idsToResolve);
      const referenceImageUrls = idsToResolve
        .map((id) => urlsByAssetId.get(id))
        .filter((u): u is string => Boolean(u));

      // Dialogue (Phase 3.1/3.3): resolve this clip's dialogue lines (synced
      // onto `clip.dialogue` by `syncDialogueOntoMotionPromptClips` when the
      // motion pack was generated) and format the final model-aware prompt.
      const dialogueLines: VerticalDramaClipDialogueLine[] = (clip.dialogue ?? []).map((d) => ({
        characterKey: d.characterKey,
        lineTh: d.lineTh,
        emotion: d.emotion,
        delivery: d.delivery,
        subtext: d.subtext,
      }));
      const formatted = formatVideoClipRequest({
        clip: {
          clipNumber: clip.clipNumber,
          prompt: clip.prompt,
          negativeMotionPrompt: clip.negativeMotionPrompt,
          durationSeconds: clip.durationSeconds,
          startFrameAssetId: clip.startFrameAssetId,
          endFrameAssetId: clip.endFrameAssetId,
        },
        dialogueLines,
        dialogueLanguage: pack.dialogueLanguage,
        thaiAccent: pack.thaiAccent,
        modelId: model.id,
        model,
        aspectRatio: "9:16",
      });

      // Final-prompt QC (hard length cap) — the formatter folds
      // dialogue/delivery/acting direction text INTO `clip.prompt`, so the
      // final string must be re-checked here (the base motion prompt alone
      // may already be within cap, but the formatted result can exceed it).
      // Zero-cost no-op when the formatted prompt is already within
      // `VD_VIDEO_PROMPT_MAX`.
      const videoPromptQc = await ensurePromptWithinLimit({
        kind: "video",
        prompt: formatted.prompt,
        userId,
        tenantId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `video clip prompt (episode #${episodeId}, clip ${input.clipNumber})`,
      });
      formatted.prompt = videoPromptQc.prompt;

      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, model.id))
        .limit(1);
      const videoPricingModel = pricingRow ?? { creditCost: model.creditCost ?? 10, configJson: model.configJson ?? null };
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
      if (shouldChargeVideoCredits) {
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

      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
      const transportMetadata = await resolveVdMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "video",
        modelId: model.id,
        configJson: pricingRow?.configJson ?? model.configJson ?? null,
        mcpConnectionId: input.mcpConnectionId,
        idempotencyKey: input.idempotencyKey,
      });

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
              ...(formatted.negativePrompt ? { negative_prompt: formatted.negativePrompt } : {}),
              // Series provenance tag — see generateStartFrameImage's comment.
              __vd_series_id: String(seriesId),
              __vd_episode_id: String(episodeId),
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
          userToken,
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
          message: err instanceof Error ? err.message : "Video clip generation failed to submit",
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
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
      const frame = plan?.frames?.find((f) => f.shotNumber === input.shotNumber);
      const approvedMediaAssetId = frame?.approvedMediaAssetId
        ? Number(frame.approvedMediaAssetId)
        : undefined;
      if (!approvedMediaAssetId || !Number.isInteger(approvedMediaAssetId) || approvedMediaAssetId <= 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องมีภาพหลักของช็อตก่อน",
        });
      }
      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [approvedMediaAssetId]);
      const imageUrl = urlsByAssetId.get(approvedMediaAssetId);
      if (!imageUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องมีภาพหลักของช็อตก่อน",
        });
      }

      // Shot context: description/camera/emotion from the storyboard shot.
      const storyboard = row.storyboard as VerticalDramaShotgrid | null;
      const storyboardShot = storyboard?.shots?.find((s) => s.shotNumber === input.shotNumber);

      // Product tie-in context (spec §13) — present only when this shot
      // carries a placement per the script stage's normalized
      // `product_tie_in_plan.tie_ins[]`. Drives the mandatory natural
      // product/benefit mention in `generateVerticalDramaShotVideoPrompt`.
      const scriptPayload = row.script as Record<string, unknown> | null;
      const tieInPlacements = extractShotProductPlacements(scriptPayload?.product_tie_in_plan);
      const tieInPlacement = findPlacementForShot(tieInPlacements, input.shotNumber);
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
              eq(verticalDramaSeries.userId, userId),
            ),
          )
          .limit(1);
        const rawProductTieIn =
          (tieInSeriesRow?.productTieIn as Record<string, unknown> | null) ?? null;
        tieInProductName =
          typeof rawProductTieIn?.productName === "string" ? rawProductTieIn.productName : undefined;
        tieInProductCategory =
          typeof rawProductTieIn?.productCategory === "string" ? rawProductTieIn.productCategory : undefined;
      }

      // Dialogue lines matching this shot — fallback chain (2026-07-06 fix:
      // dialogue was silently dropped whenever the `dialogue_audio_plan`
      // pipeline stage was never run, even though the script already has
      // dialogue for every scene — see `resolveShotDialogueLines`'s doc
      // comment for the full chain order).
      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const matchingClip = pack?.clips?.find((c) =>
        c.sourceShotNumbers?.includes(input.shotNumber),
      );
      const dialogueLines = resolveShotDialogueLines({
        shotNumber: input.shotNumber,
        matchingClip,
        dialogueAudioPlan: row.dialogueAudioPlan as
          | { dialogue_lines?: Array<Record<string, unknown>> }
          | null,
        script: row.script as Record<string, unknown> | null,
        storyboardShotCount: storyboard?.shots?.length,
      });

      // Resolve the episode-selected video model (Phase 1.2 resolution order).
      const selectedVideoModel = await resolveEpisodeVideoModel(pack);

      // Character identity map (2026-07-07 non-human-character-vanishing
      // fix) — same descriptor block the start-frame planner/grid prompts
      // use, so the shot-video-prompt service also knows a required
      // character's real identity (species/age) instead of a bare
      // `characterKey` when it writes motion/acting direction for them. See
      // `@shared/verticalDramaSeries/characterIdentityMap.ts`.
      const shotVideoCharacterIdentitySources = await resolveShotCharacterIdentitySources(
        tenantId,
        seriesId,
        frame?.requiredCharacterRefs,
      );
      const shotVideoCharacterIdentityMapBlock = buildCharacterIdentityMapBlock(
        frame?.requiredCharacterRefs ?? [],
        shotVideoCharacterIdentitySources,
      );

      const [localeSeriesRow] = await db
        .select({ locale: verticalDramaSeries.locale })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId),
          ),
        )
        .limit(1);

      const result = await generateVerticalDramaShotVideoPrompt({
        userId,
        tenantId,
        seriesId,
        episodeId,
        shotNumber: input.shotNumber,
        imageUrl,
        imagePrompt: frame?.imagePrompt,
        shotContext: {
          description: storyboardShot?.description,
          camera: storyboardShot?.cameraSetup,
          emotion: undefined,
          dialogueLines: dialogueLines.length ? dialogueLines : undefined,
          characterIdentityMap: shotVideoCharacterIdentityMapBlock,
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
        locale: normalizeVerticalDramaSeriesLocale(localeSeriesRow?.locale),
        promptLanguage: pack?.promptLanguage,
        dialogueLanguage: pack?.dialogueLanguage,
        thaiAccent: pack?.thaiAccent,
        idempotencyKey: input.idempotencyKey,
      });

      // Brand/public-figure sanitize pass (Thai ad-compliance + video-policy
      // guard, 2026-07-06) — provider-facing VIDEO prompts must never contain
      // the product/brand name; identity comes from the locked reference
      // image, not prompt text. Run BEFORE the length-cap QC below so the
      // sanitized (shorter) text is what gets capped, never the reverse.
      if (tieInPlacement) {
        result.prompt = sanitizeBrandMentionsInPrompt(
          result.prompt,
          [tieInProductName],
          tieInProductCategory,
        );
        if (result.negativeMotionPrompt) {
          result.negativeMotionPrompt = sanitizeBrandMentionsInPrompt(
            result.negativeMotionPrompt,
            [tieInProductName],
            tieInProductCategory,
          );
        }
      }

      // Final-prompt QC (hard length cap) — enforced BEFORE this prompt is
      // persisted onto `motionPromptPack.clips[]` below. Zero-cost no-op
      // when the generated prompt is already within `VD_VIDEO_PROMPT_MAX`.
      const shotVideoPromptQc = await ensurePromptWithinLimit({
        kind: "video",
        prompt: result.prompt,
        userId,
        tenantId,
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:prompt-qc`
          : undefined,
        label: `shot video prompt (episode #${episodeId}, shot ${input.shotNumber})`,
      });
      result.prompt = shotVideoPromptQc.prompt;

      // Persist onto the matching clip — create a minimal clip entry if the
      // pack exists but has no matching clip, or a minimal pack if the pack
      // itself is entirely absent (mirrors `setEpisodeModelSelection`'s
      // create-minimal-pack convention so the user's selected video model
      // stays intact).
      let updatedPack: VerticalDramaMotionPromptPack;
      if (pack) {
        const existingIndex = pack.clips.findIndex((c) =>
          c.sourceShotNumbers?.includes(input.shotNumber),
        );
        const updatedClips = pack.clips.slice();
        if (existingIndex === -1) {
          updatedClips.push({
            clipNumber: input.shotNumber,
            sourceShotNumbers: [input.shotNumber],
            prompt: result.prompt,
            negativeMotionPrompt: result.negativeMotionPrompt,
            durationSeconds: storyboardShot?.durationSeconds ?? 8,
            dialogue: result.dialogue,
            requiredDisclosure: result.requiredDisclosure,
          });
        } else {
          updatedClips[existingIndex] = {
            ...updatedClips[existingIndex],
            prompt: result.prompt,
            negativeMotionPrompt: result.negativeMotionPrompt,
            dialogue: result.dialogue,
            requiredDisclosure: result.requiredDisclosure,
          };
        }
        updatedPack = { ...pack, clips: updatedClips };
      } else {
        updatedPack = {
          selectedVideoModelId: selectedVideoModel.id,
          durationProfileId: row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
          motionMode: "first_frame_to_video",
          clips: [
            {
              clipNumber: input.shotNumber,
              sourceShotNumbers: [input.shotNumber],
              prompt: result.prompt,
              negativeMotionPrompt: result.negativeMotionPrompt,
              durationSeconds: storyboardShot?.durationSeconds ?? 8,
              dialogue: result.dialogue,
              requiredDisclosure: result.requiredDisclosure,
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
            eq(verticalDramaEpisodes.seriesId, seriesId),
          ),
        );

      return {
        prompt: result.prompt,
        dialogue: result.dialogue,
        creditsUsed: result.creditsUsed,
        usedVision: result.usedVision,
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
    .input(z.object({ seriesId: z.string().min(1), episodeId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      try {
        const references = await verticalDramaShotReferencesService.listForEpisode(
          { tenantId, userId, seriesId },
          episodeId,
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
        source: z.enum(["generated", "grid_cut", "history", "library", "upload", "previous_main"]),
        sortOrder: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const mediaAssetId = parseId(input.mediaAssetId, "media asset id");
      try {
        const reference = await verticalDramaShotReferencesService.linkReference({
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
      }),
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
          referenceId,
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const orderedReferenceIds = input.orderedReferenceIds.map((id) =>
        parseId(id, "reference id"),
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const script = row.script as Record<string, unknown> | null;
      const storyboard = row.storyboard as Record<string, unknown> | null;
      if (!script || !storyboard) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Episode needs a generated script and storyboard before it can be quality-reviewed",
        });
      }
      const dialoguePlan = row.dialogueAudioPlan as Record<string, unknown> | null;

      // Only consulted when `avoidPrevious` is set — loaded BEFORE the LLM
      // call so a "no previous review yet" case degrades gracefully to a
      // normal (non-avoid) review instead of erroring.
      const previousReviewForAvoid = input.avoidPrevious
        ? await loadLatestQualityReview({ tenantId, userId, seriesId, episodeId })
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
          message: "Episode script/storyboard/dialogue plan is too large to quality-review",
        });
      }

      const [qualityReviewSeriesRow] = await db
        .select({ locale: verticalDramaSeries.locale })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, userId),
          ),
        )
        .limit(1);

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
          locale: normalizeVerticalDramaSeriesLocale(qualityReviewSeriesRow?.locale),
          script,
          storyboard,
          dialoguePlan,
          avoidPrevious: input.avoidPrevious && previousReviewForAvoid != null,
          previousIssues: previousReviewForAvoid?.issues,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof QualityReviewInsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof QualityReviewVdSchemaValidationError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
        if (err instanceof QualityReviewRateLimitExceededError) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Episode quality review failed",
        });
      }

      // Persist via the existing run/artifact ledger tables (see
      // `VERTICAL_DRAMA_QUALITY_REVIEW_STAGE_TAG`'s doc comment) so the
      // scorecard survives reload — `getEpisodeDetail` reads it back via
      // `loadLatestQualityReview`.
      await persistQualityReviewArtifact({ tenantId, userId, seriesId, episodeId }, outcome.review);

      return { review: outcome.review, creditsUsed: outcome.creditsUsed };
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
        idempotencyKey,
      }),
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

      const grouped = groupQualityReviewIssuesByStage(latestReview.issues ?? []);
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
      for (const group of grouped) {
        const instruction = composeQualityReviewRepairInstruction(group.issues);
        const outcome = await verticalDramaEpisodePipeline.repairStage(owner, group.stage, {
          instruction,
        });
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
        const storyboard = refreshedRow.storyboard as Record<string, unknown> | null;
        const dialoguePlan = refreshedRow.dialogueAudioPlan as Record<string, unknown> | null;
        if (script && storyboard) {
          const [seriesRow] = await db
            .select({ locale: verticalDramaSeries.locale })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, seriesId),
                eq(verticalDramaSeries.tenantId, tenantId),
                eq(verticalDramaSeries.userId, userId),
              ),
            )
            .limit(1);
          const reReviewOutcome = await runVerticalDramaEpisodeQualityReview({
            userId,
            tenantId,
            seriesId,
            episodeId,
            episodeTitle: refreshedRow.title ?? `Episode ${refreshedRow.episodeNumber}`,
            locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
            script,
            storyboard,
            dialoguePlan,
            idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}-rereview` : undefined,
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

      return {
        stagesRepaired,
        staleStages: Array.from(staleStagesSet),
        newReview,
        warning,
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const row = await loadOwnedEpisode({ tenantId, userId, seriesId, episodeId });

      const script = row.script as Record<string, unknown> | null;
      const storyboard = row.storyboard as Record<string, unknown> | null;
      if (!script || !storyboard) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ตอนนี้ต้องมีบทและสตอรี่บอร์ดที่สร้างแล้วก่อน จึงจะสรุปความจำเข้าซีรีย์ได้",
        });
      }
      const dialoguePlan = row.dialogueAudioPlan as Record<string, unknown> | null;

      // Detect whether this episode was already manually summarized — scoped
      // to THIS episode's own `episode_summary` events tagged `source:
      // "manual"` (the checkpoint-approval path's events never carry that
      // tag, so a pipeline-run summarization does not block/require `force`
      // here, and vice versa — the two paths append to the same durable
      // event stream but track their own "already ran" state independently).
      const priorManualSummaries = await verticalDramaSeriesMemoryService.listEvents({
        tenantId,
        userId,
        seriesId,
        kind: "episode_summary",
        episodeId,
        limit: 50,
      });
      const alreadySummarized = priorManualSummaries.some(
        (ev) => ev.payload?.source === "manual",
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
            eq(verticalDramaSeries.userId, userId),
          ),
        )
        .limit(1);

      const priorMemoryBundle = await verticalDramaSeriesMemoryService.buildEpisodeMemoryBundle(
        { tenantId, userId, seriesId },
        row.episodeNumber,
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
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
        if (err instanceof MemoryPlanningRateLimitExceededError) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Episode memory summarization failed",
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
        keySuffix: string,
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
        { summary: planned.episode_recap, memoryCompactionSummary: planned.memory_compaction_summary },
        planned.episode_recap,
        "episode-summary",
      );

      const asArray = (value: unknown): Array<Record<string, unknown>> =>
        Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

      const appendKindArray = async (
        memoryKind: VerticalDramaMemoryKind,
        items: Array<Record<string, unknown>>,
        summaryOf: (item: Record<string, unknown>) => string,
        keySuffix: string,
      ) => {
        for (const [index, item] of items.entries()) {
          await appendManual(memoryKind, item, summaryOf(item), `${keySuffix}-${index}`);
        }
      };

      await appendKindArray(
        "hook_opened",
        asArray(planned.unresolved_hooks),
        (item) => String(item.description ?? item.hook ?? item.hookId ?? "hook opened"),
        "hook-opened",
      );
      await appendKindArray(
        "hook_resolved",
        asArray(planned.resolved_hooks),
        (item) => String(item.description ?? item.hook ?? item.hookId ?? "hook resolved"),
        "hook-resolved",
      );
      await appendKindArray(
        "character_delta",
        asArray(planned.character_emotional_state),
        (item) =>
          String(item.state ?? item.change ?? `${item.character_id ?? "character"} state change`),
        "character-delta",
      );
      await appendKindArray(
        "relationship_delta",
        asArray(planned.relationship_state_changes),
        (item) => String(item.change ?? `${JSON.stringify(item.pair ?? [])} relationship change`),
        "relationship-delta",
      );
      await appendKindArray(
        "continuity_warning",
        asArray(planned.continuity_risks),
        (item) => String(item.risk ?? item.warning ?? "continuity risk"),
        "continuity-warning",
      );
      await appendKindArray(
        "product_tie_in_usage",
        asArray(planned.product_tie_in_history),
        (item) => String(item.productName ?? item.product_name ?? "product tie-in usage"),
        "product-tie-in",
      );
      await appendKindArray(
        "canonical_fact",
        asArray(planned.canonical_facts),
        (item) => String(item.statement ?? item.fact ?? "canonical fact"),
        "canonical-fact",
      );

      return {
        alreadySummarized: false,
        eventsAppended,
        creditsUsed: outcome.creditsUsed,
      };
    }),

  /**
   * Compound episode video (2026-07-06 download + assembly upgrade) —
   * concatenates every completed shot clip (`motionPromptPack.clips[].videoTask.videoUrl`,
   * in shot/clip order) into ONE mp4 for the whole episode.
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
   */
  assembleEpisodeVideo: verticalDramaProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        allowPartial: z.boolean().optional(),
        idempotencyKey,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const episodeId = parseId(input.episodeId, "episode id");
      const owner = { tenantId, userId, seriesId, episodeId };
      const row = await loadOwnedEpisode(owner);

      const pack = row.motionPromptPack as VerticalDramaMotionPromptPack | null;
      const clipSources: EpisodeClipSource[] = extractClipSourcesFromMotionPromptPack(pack);
      if (clipSources.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No video clips exist for this episode yet — generate the video motion prompt pack and render clips first.",
        });
      }

      let resolved: { ordered: EpisodeClipSource[]; missing: { clipNumber: number }[] };
      try {
        resolved = resolveClipsForAssembly(clipSources, { allowPartial: input.allowPartial });
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err instanceof Error ? err.message : "Episode video assembly precondition failed",
        });
      }

      const runtimeConfig = getCachedAppRuntimeConfig();
      const internalBaseUrl = runtimeConfig.internalNodeUrl || ctx.publicUrl || "http://localhost:3000";
      const filename = compiledVideoFilename({
        seriesId,
        episodeNumber: row.episodeNumber ?? episodeId,
      });

      const { jobId } = await submitAssemblyJob({
        owner,
        clips: resolved.ordered,
        internalBaseUrl,
        filename,
      });

      return {
        jobId,
        shotCount: resolved.ordered.length,
        missingClipNumbers: resolved.missing.map((m) => m.clipNumber),
        partial: resolved.missing.length > 0,
      };
    }),
});

export type VerticalDramaEpisodesRouter = typeof verticalDramaEpisodesRouter;

// Re-export for symmetry with the memory row mapper used by callers/tests.
export { memoryRowToEvent };
