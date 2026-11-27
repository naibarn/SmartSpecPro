import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";

import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  type MarketplaceAutoReviewRun,
} from "../../drizzle/schema";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  StagedSequentialStoryboardMetadataV1Schema,
  type HumanApprovalCheckpointV1,
  type StagedCheckpointApprovalExpectationV1,
  type StagedSequentialStoryboardMetadataV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { createMarketplaceDraftQcState } from "@shared/marketplaceAutoReview/draftQualityQc";
import {
  assessStagedPlanAdherence,
  buildStagedCheckpoint,
  buildStagedPlanView,
  generateStagedStoryArcPlanWithLLM,
  isStagedCastMemberMinor,
  isStagedProductVisibleInShot,
  removeStagedMinorDialogueLines,
  type StagedCastMember,
  type StagedStoryArcLanguagePlan,
  type StagedStoryArcPlan,
  type StagedStoryConceptOption,
} from "./marketplaceAutoReviewStoryArcPlanner";
import {
  findConfirmedStagedReviewConcept,
  loadUsedReviewConcepts,
  rememberUsedReviewConcept,
} from "./marketplaceAutoReviewUsedConcepts";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  isCompleteStagedImagePrompt,
} from "./marketplaceAutoReviewStagedPromptCompiler";
// Safe as a normal top-level import: `productReviewSequentialStoryboardSkillRunner.ts`
// does not import anything from this module, so there is no circular edge
// here (unlike `buildStagedSingleShotRefreshInput` below, which does need a
// lazy import — see the comment on that call site).
import { refreshSequentialShotPromptWithSkillDirect } from "./productReviewSequentialStoryboardSkillRunner";
import {
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
} from "./marketplaceAutoReviewStagedAudioAssembly";
import { buildStagedSafeEvidenceEvent } from "./marketplaceAutoReviewStagedObservability";
import {
  assignMarketplaceCastRoles,
  MARKETPLACE_CHARACTER_CAST_MAX,
} from "../../shared/hyperframes/characterCast";
import {
  buildShotOrderedReferenceItems,
  type ShotCastLook,
} from "../../shared/marketplaceAutoReview/shotCast";
import {
  assertStagedProviderSpendAllowed,
  transitionStagedCheckpoint,
} from "./marketplaceAutoReviewStagedCheckpointService";
import {
  mediaGenerationService,
  stageMarketplaceInlineImageReferences,
} from "./mediaGenerationService";
import {
  getTransientMediaPollRetryHint,
  getUnifiedMediaTask,
} from "./mediaTaskPollingService";
import { ensureMarketplaceAutoReviewMediaUrlDurable } from "./marketplaceAutoReviewMediaAssetService";
import { getModelById, deriveModelResolutionOptions } from "./modelRegistry";
import {
  deductCredits,
  hasEnoughCredits,
  refundCredits,
} from "./creditService";
// NOTE: marketplaceAutoReviewService.ts already imports from this module, so
// this creates a circular import edge. Safe under ESM (this repo's
// "type": "module") because `recordStagedProviderFailureAndRefund` is only
// invoked from inside async function bodies below, at runtime, long after
// both modules have finished evaluating — never at module-top-level, which
// is the only case circular ESM imports can break. Do not call it (or
// anything else imported from that module) at the top level of this file.
import { recordStagedProviderFailureAndRefund } from "./marketplaceAutoReviewService";
import { selectMarketplaceAutoReviewTargetShots } from "./marketplaceAutoReviewTargetShotScope";
import {
  MarketplaceAutoReviewStateWriteConflict,
  isMarketplaceAutoReviewStateWriteConflict,
} from "./marketplaceAutoReviewStagedConcurrency";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Auth = { userId: number; tenantId?: string };
type Runtime = { userToken?: string | null; publicUrl?: string | null };

const STAGED_AUDIO_MODEL = "elevenlabs-tts";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireStagedTenantId(
  authTenantId?: string | null,
  runTenantId?: string | null
): string {
  const authTenant = text(authTenantId);
  const runTenant = text(runTenantId);
  if (!authTenant || !runTenant) {
    throw new Error("STAGED_TENANT_CONTEXT_REQUIRED");
  }
  if (authTenant !== runTenant) {
    throw new Error("STAGED_TENANT_CONTEXT_MISMATCH");
  }
  return authTenant;
}

async function resolveStagedUserToken(
  userToken: string | null | undefined,
  userId: number
): Promise<string> {
  let token = text(userToken);
  if (!token || token === "internal") {
    const { signBearerToken } = await import("../_core/tokens");
    token = signBearerToken(
      {
        sub: String(userId),
        user_id: userId,
        type: "access",
        tokenUse: "marketplace_auto_review_background",
        scopes: ["media:generate"],
        jti: `staged_auto_review_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      },
      "30m"
    );
  }
  return token;
}

export function requireStagedLanguagePlanFromMetadata(
  metadata: Record<string, any>
): StagedStoryArcLanguagePlan {
  const languagePlan = record(
    record(metadata.sequentialStoryboard).languagePlan
  );
  if (
    (languagePlan.summaryLanguage !== "en" &&
      languagePlan.summaryLanguage !== "th") ||
    (languagePlan.dialogueLanguage !== "en" &&
      languagePlan.dialogueLanguage !== "th") ||
    (languagePlan.promptLanguage !== "en" &&
      languagePlan.promptLanguage !== "th")
  ) {
    throw new Error("STAGED_LANGUAGE_PLAN_REQUIRED");
  }
  return {
    summaryLanguage: languagePlan.summaryLanguage,
    dialogueLanguage: languagePlan.dialogueLanguage,
    promptLanguage: languagePlan.promptLanguage,
  };
}

export function modelProvider(modelId: string): string {
  const provider = text(getModelById(modelId)?.provider);
  if (!provider)
    throw new Error(`STAGED_MODEL_PROVIDER_NOT_CONFIGURED:${modelId}`);
  return provider;
}

export function modelCost(modelId: string): number {
  const cost = Number(getModelById(modelId)?.creditCost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error(`STAGED_MODEL_CREDIT_COST_NOT_CONFIGURED:${modelId}`);
  }
  return cost;
}

function requireStagedModel(value: unknown, stage: "image" | "video"): string {
  const model = text(value);
  if (!model) throw new Error(`STAGED_${stage.toUpperCase()}_MODEL_REQUIRED`);
  return model;
}

// The review UI selects a video model but has no resolution control. Use
// 1080p only when that exact option is declared by the model; otherwise fail
// before dispatch instead of silently choosing another quality.
function resolveVideoResolution(modelId: string): string {
  const model = getModelById(modelId);
  const options = model ? deriveModelResolutionOptions(model) : undefined;
  if (options?.some(o => o.value === "1080p")) return "1080p";
  throw new Error(`STAGED_VIDEO_RESOLUTION_1080P_NOT_SUPPORTED:${modelId}`);
}

function resolveStagedModelDurationOptions(
  model: ReturnType<typeof getModelById>
): number[] {
  const columnOptions = model?.durations;
  if (Array.isArray(columnOptions) && columnOptions.length > 0) {
    return columnOptions;
  }
  const durationField = (
    Array.isArray(model?.configJson?.inputFields)
      ? (model.configJson.inputFields as unknown[])
      : []
  ).find(
    entry =>
      Boolean(entry) &&
      typeof entry === "object" &&
      String((entry as Record<string, unknown>).key ?? "").trim() === "duration"
  ) as Record<string, unknown> | undefined;
  if (!Array.isArray(durationField?.options)) return [];
  return durationField.options
    .map(option => {
      if (!option || typeof option !== "object") return null;
      const parsed = Number((option as Record<string, unknown>).value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })
    .filter((value): value is number => value !== null);
}

function resolveStagedVideoDuration(
  modelId: string,
  requestedSeconds: number
): { duration: number; fitted: boolean } {
  const model = getModelById(modelId);
  if (!model) throw new Error(`STAGED_VIDEO_MODEL_NOT_CONFIGURED:${modelId}`);
  const options = resolveStagedModelDurationOptions(model);
  if (!options.length) {
    throw new Error(`STAGED_VIDEO_DURATION_OPTIONS_MISSING:${modelId}`);
  }
  if (options.includes(requestedSeconds))
    return { duration: requestedSeconds, fitted: false };
  throw new Error(
    `STAGED_VIDEO_DURATION_NOT_SUPPORTED:${modelId}:${requestedSeconds}:${options.join(",")}`
  );
}

function stagedPlanFromMetadata(
  metadata: Record<string, any>
): StagedStoryArcPlan | null {
  const plan = record(metadata.stagedPipeline).plan;
  if (!plan || !Array.isArray(plan.shots)) return null;
  return plan as StagedStoryArcPlan;
}

export function isAwaitingStagedStoryConceptSelection(
  metadata: Record<string, unknown>
): boolean {
  const plan = stagedPlanFromMetadata(metadata);
  return Boolean(
    plan &&
      plan.shots.length === 0 &&
      plan.conceptOptions?.length &&
      !plan.selectedConceptId
  );
}

function buildProductFromMetadata(
  run: MarketplaceAutoReviewRun,
  metadata: Record<string, any>
) {
  const truth = record(metadata.productTruth);
  const productName = text(truth.productName);
  if (!productName) throw new Error("STAGED_PRODUCT_NAME_MISSING");
  if (!Array.isArray(metadata.productImageUrls)) {
    throw new Error("STAGED_PRODUCT_IMAGE_URLS_MISSING");
  }
  const urls = metadata.productImageUrls.map((value: unknown) => {
    const url = text(value);
    if (!url) throw new Error("STAGED_PRODUCT_IMAGE_URL_INVALID");
    return url;
  });
  if (urls.length === 0 || urls.length > 5) {
    throw new Error(`STAGED_PRODUCT_IMAGE_URL_COUNT_INVALID:${urls.length}`);
  }
  return {
    productId: run.productId,
    productName,
    description: text(truth.description) || null,
    specs: record(truth.specs),
    imageUrls: urls,
  };
}

// Derives the two-person "cast" roster from the run's custom reference
// manifest (`customReferenceManifest`, persisted by
// `updateStagedAutoReviewReferenceManifest` in the checkpoint router
// service). Only manifest entries with `role === "character"` count toward
// cast; the first two (by manifest order) become cast-1/cast-2.
// `resolveStagedConversationMode` (in the planner file) derives the actual
// conversation mode from `cast.length` — passing 0 or 1 cast members here
// reproduces today's solo-narrator output byte-for-byte, since the planner
// only switches into `two_person_conversation` at length >= 2.
export function deriveStagedCastFromManifest(
  manifest:
    | Array<{
        url?: unknown;
        role?: unknown;
        label?: unknown;
        active?: unknown;
        characterName?: unknown;
        characterRole?: unknown;
        vdCharacterId?: unknown;
        vdSeriesId?: unknown;
        ageRange?: unknown;
        depictsMinor?: unknown;
        descriptor?: unknown;
      }>
    | undefined
): StagedCastMember[] {
  if (!Array.isArray(manifest)) {
    throw new Error("STAGED_REFERENCE_MANIFEST_REQUIRED");
  }
  for (const [index, item] of manifest.entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`STAGED_REFERENCE_MANIFEST_ENTRY_INVALID:${index + 1}`);
    }
    if (typeof item.url !== "string" || !item.url.trim()) {
      throw new Error(`STAGED_REFERENCE_URL_REQUIRED:${index + 1}`);
    }
    if (!["product", "character", "environment"].includes(String(item.role))) {
      throw new Error(`STAGED_REFERENCE_ROLE_INVALID:${index + 1}`);
    }
    if (typeof item.active !== "boolean") {
      throw new Error(`STAGED_REFERENCE_ACTIVE_REQUIRED:${index + 1}`);
    }
  }
  const active = manifest.filter(item => item.active);
  const productCount = active.filter(item => item.role !== "character").length;
  if (productCount === 0)
    throw new Error("STAGED_ACTIVE_PRODUCT_REFERENCE_REQUIRED");
  const characterItems = active.filter(item => item.role === "character");
  if (characterItems.length > MARKETPLACE_CHARACTER_CAST_MAX) {
    throw new Error(
      `STAGED_CAST_LIMIT_EXCEEDED:${characterItems.length}:${MARKETPLACE_CHARACTER_CAST_MAX}`
    );
  }
  // Assign speaking roles among adults only. Under-18 characters always stay
  // in the silent supporting tier even when the selected manifest says host
  // or guest; this also ensures two adult speakers remain available in a
  // three-character cast.
  const adultEntries = characterItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) =>
      !isStagedCastMemberMinor({
        ageRange: typeof item.ageRange === "string" ? item.ageRange : null,
        depictsMinor:
          typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
      })
    );
  const adultRoles = assignMarketplaceCastRoles(
    adultEntries.map(({ item }) => ({
      characterRole:
        typeof item.characterRole === "string" ? item.characterRole : undefined,
    }))
  );
  const roleByIndex = new Map(
    adultEntries.map(({ index }, roleIndex) => [
      index,
      adultRoles[roleIndex]?.characterRole,
    ])
  );
  return characterItems.map((item, i) => {
    const name = text(item.characterName) || text(item.label);
    if (!name) {
      throw new Error(`STAGED_CAST_CHARACTER_NAME_REQUIRED:${i + 1}`);
    }
    return {
      castId: `cast-${i + 1}`,
      name,
      source: text(item.vdCharacterId)
        ? ("vd_character" as const)
        : ("uploaded" as const),
      vdCharacterId: text(item.vdCharacterId) || undefined,
      vdSeriesId: text(item.vdSeriesId) || undefined,
      role: (() => {
        const isMinor = isStagedCastMemberMinor({
          ageRange: typeof item.ageRange === "string" ? item.ageRange : null,
          depictsMinor:
            typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
        });
        if (isMinor) return "support" as const;
        const role = roleByIndex.get(i);
        if (role !== "host" && role !== "guest" && role !== "support") {
          throw new Error(`STAGED_CAST_ROLE_REQUIRED:${i + 1}`);
        }
        return role;
      })(),
      descriptor: text(item.descriptor) || undefined,
      ageRange:
        item.ageRange === null
          ? null
          : typeof item.ageRange === "string" && item.ageRange.trim()
            ? item.ageRange.trim()
            : null,
      // Minor grounding rides along so the guardian resolver never has to
      // guess (`project_marketplace_minor_safety_qa_grounding`).
      depictsMinor:
        typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
      imageIndex: productCount + i + 1,
    };
  });
}

/**
 * This shot's cast selection, read from wherever it actually lives
 * (`planning/marketplace-four-character-cast/plan.md` §2/§4).
 *
 * `castInShot` is authored by the story planner onto the PLAN shot, but the
 * user can override it per shot, and that override is persisted onto the STATE
 * shot — so **state wins over plan**, the same precedence Vertical Drama uses
 * (`frame.requiredCharacterRefs` overrides the storyboard's own list). A user
 * who removes someone from a shot must not have the planner put them back.
 * `castLooks` is user-only and lives on the state shot.
 *
 * Callers should never reach into either shape directly — the two are merged
 * here so the dispatch path and both prompt builders cannot drift.
 *
 * Missing cast selections are errors when the plan contains a cast roster.
 */
export function resolveShotCastSelectionFromMetadata(params: {
  metadata: Record<string, any> | null | undefined;
  plan:
    | {
        cast?: Array<{ castId: string }>;
        shots?: Array<{ shotId?: number; castInShot?: string[] }>;
      }
    | null
    | undefined;
  shotId: number;
}): {
  castInShot: string[];
  castLooks: Record<string, ShotCastLook> | undefined;
} {
  const planShot = (params.plan?.shots ?? []).find(
    shot => Number(shot?.shotId) === Number(params.shotId)
  );
  const stateShots = Array.isArray(
    (params.metadata as any)?.stagedSequentialStoryboard?.shots
  )
    ? ((params.metadata as any).stagedSequentialStoryboard.shots as Array<any>)
    : [];
  const stateShot = stateShots.find(
    shot => Number(shot?.shotId) === Number(params.shotId)
  );

  let castInShot: string[];
  if (
    stateShot &&
    Object.prototype.hasOwnProperty.call(stateShot, "castInShot")
  ) {
    if (!Array.isArray(stateShot.castInShot)) {
      throw new Error(
        `STAGED_SHOT_CAST_SELECTION_INVALID:shot-${params.shotId}`
      );
    }
    castInShot = stateShot.castInShot as string[];
  } else if (Array.isArray(planShot?.castInShot)) {
    castInShot = planShot.castInShot;
  } else if (params.plan?.cast?.length) {
    throw new Error(
      `STAGED_SHOT_CAST_SELECTION_REQUIRED:shot-${params.shotId}`
    );
  } else {
    castInShot = [];
  }

  if (castInShot.some(castId => typeof castId !== "string" || !castId.trim())) {
    throw new Error(`STAGED_SHOT_CAST_SELECTION_INVALID:shot-${params.shotId}`);
  }
  if (new Set(castInShot).size !== castInShot.length) {
    throw new Error(
      `STAGED_SHOT_CAST_SELECTION_DUPLICATE:shot-${params.shotId}`
    );
  }
  const castIds = new Set(
    (params.plan?.cast ?? []).map(member => member.castId)
  );
  const invalidCastId = castInShot.find(castId => !castIds.has(castId));
  if (invalidCastId) {
    throw new Error(
      `STAGED_SHOT_CAST_NOT_IN_ROSTER:shot-${params.shotId}:${invalidCastId}`
    );
  }

  const rawLooks = stateShot?.castLooks;
  if (
    rawLooks !== undefined &&
    (!rawLooks || typeof rawLooks !== "object" || Array.isArray(rawLooks))
  ) {
    throw new Error(`STAGED_SHOT_CAST_LOOKS_INVALID:shot-${params.shotId}`);
  }
  const castLooks = rawLooks as Record<string, ShotCastLook> | undefined;
  if (castLooks) {
    for (const [castId, look] of Object.entries(castLooks)) {
      if (!castIds.has(castId)) {
        throw new Error(
          `STAGED_SHOT_CAST_LOOK_NOT_IN_ROSTER:shot-${params.shotId}:${castId}`
        );
      }
      if (!look || typeof look !== "object" || Array.isArray(look)) {
        throw new Error(
          `STAGED_SHOT_CAST_LOOK_INVALID:shot-${params.shotId}:${castId}`
        );
      }
    }
  }

  return { castInShot, castLooks };
}

export function buildLegacyConcept(plan: StagedStoryArcPlan) {
  const truth = {
    productId: plan.product.productId,
    productName: plan.product.productName,
    brand: null,
    platform: "marketplace",
    externalProductId: null,
    externalShopId: null,
    productCategory: null,
    categoryText: null,
    categoryPath: [],
    sourceUrl: "",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: plan.product.description,
    specs: plan.product.specs ?? {},
    imageUrls: plan.product.imageUrls,
  };
  let nextStartSeconds = 0;
  const shots = plan.shots.map(shot => {
    const startSeconds = nextStartSeconds;
    const durationSeconds = shot.durationSeconds;
    nextStartSeconds += durationSeconds;
    return {
      id: `shot-${shot.shotId}`,
      order: shot.shotId,
      title: shot.title,
      startSeconds,
      endSeconds: nextStartSeconds,
      durationSeconds,
      storyboardGuide: shot.storySummary,
      voiceover: removeStagedMinorDialogueLines(shot.dialogue, plan.cast),
      camera:
        shot.cameraDirection ||
        `Use a shot-specific framing and angle that makes this action clear: ${shot.visualSummary}`,
      visual: shot.visualSummary,
      movement:
        shot.movementDirection ||
        `Show the action described for this shot: ${shot.visualSummary}`,
      ...(shot.transition ? { transition: shot.transition } : {}),
      productRole: "evidence-grounded product presentation",
    };
  });
  return {
    conceptId: `staged-${plan.product.productId}-${plan.planRevision}`,
    title: plan.title,
    productTruth: truth,
    storyboardGuide: plan.storySummary,
    voiceoverScript: plan.shots
      .map(shot => removeStagedMinorDialogueLines(shot.dialogue, plan.cast))
      .filter(Boolean)
      .join("\n"),
    productDetail: plan.product.description,
    shots,
  };
}

function checkpointFor(
  state: StagedSequentialStoryboardMetadataV1,
  kind: HumanApprovalCheckpointV1["kind"],
  shotId?: number
) {
  return state.stagedSequentialStoryboard.reviewCheckpoints.find(
    checkpoint =>
      checkpoint.kind === kind &&
      checkpoint.shotId === (shotId ?? null) &&
      checkpoint.state !== "superseded"
  );
}

/** A prompt checkpoint is dispatchable only after an explicit media action.
 *  Automatic prompt generation and checkpoint approval do not authorize spend. */
export function hasExplicitStagedMediaDispatchIntent(
  checkpoint:
    | {
        mediaDispatchIntent?: { requestedByUserId?: number } | null;
      }
    | null
    | undefined
) {
  return (
    Number.isSafeInteger(checkpoint?.mediaDispatchIntent?.requestedByUserId) &&
    Number(checkpoint?.mediaDispatchIntent?.requestedByUserId) > 0
  );
}

export function hasExplicitStagedMediaDispatchIntentForTest(
  checkpoint:
    | {
        mediaDispatchIntent?: { requestedByUserId?: number } | null;
      }
    | null
    | undefined
) {
  return hasExplicitStagedMediaDispatchIntent(checkpoint);
}

function finalAssemblyFor(
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>,
  plan: StagedStoryArcPlan
) {
  const configured = record(metadata).stagedPipeline?.finalAssembly;
  if (
    !configured ||
    !Array.isArray(configured.shots) ||
    configured.planRevision !== plan.planRevision ||
    configured.shots.length !== plan.shots.length ||
    typeof configured.includeAudio !== "boolean"
  ) {
    throw new Error("STAGED_FINAL_ASSEMBLY_CONFIGURATION_MISSING_OR_INVALID");
  }
  const actualShotIds = metadata.stagedSequentialStoryboard.shots.map(
    shot => shot.shotId
  );
  const configuredShotIds = configured.shots.map((shot: any) => shot.shotId);
  if (
    configuredShotIds.some(
      (shotId: unknown, index: number) => shotId !== actualShotIds[index]
    )
  ) {
    throw new Error("STAGED_FINAL_ASSEMBLY_SHOT_ORDER_MISMATCH");
  }
  const { contentHash: _contentHash, ...assembly } = configured;
  return assembly;
}

function withCheckpoint(
  metadata: StagedSequentialStoryboardMetadataV1,
  checkpoint: HumanApprovalCheckpointV1
): StagedSequentialStoryboardMetadataV1 {
  const existing = metadata.stagedSequentialStoryboard.reviewCheckpoints;
  const index = existing.findIndex(
    item => item.checkpointId === checkpoint.checkpointId
  );
  const next = existing.slice();
  if (index >= 0) next[index] = checkpoint;
  else next.push(checkpoint);
  return {
    ...metadata,
    stagedSequentialStoryboard: {
      ...metadata.stagedSequentialStoryboard,
      reviewCheckpoints: next,
    },
  };
}

function replaceCheckpoint(
  metadata: StagedSequentialStoryboardMetadataV1,
  checkpoint: HumanApprovalCheckpointV1
) {
  return withCheckpoint(metadata, checkpoint);
}

function updateShot(
  metadata: StagedSequentialStoryboardMetadataV1,
  shotId: number,
  patch: Record<string, unknown>
): StagedSequentialStoryboardMetadataV1 {
  return {
    ...metadata,
    stagedSequentialStoryboard: {
      ...metadata.stagedSequentialStoryboard,
      shots: metadata.stagedSequentialStoryboard.shots.map(shot =>
        shot.shotId === shotId ? { ...shot, ...patch } : shot
      ),
    },
  };
}

async function persistRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: Record<string, any>;
  status?: string;
  currentStage?: string;
  stageIndex?: number;
  resultJson?: Record<string, unknown>;
  completedAt?: Date | null;
  expectedUpdatedAt?: Date;
}) {
  const [next] = await params.db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: params.metadata,
      ...(params.status ? { status: params.status } : {}),
      ...(params.currentStage ? { currentStage: params.currentStage } : {}),
      ...(params.stageIndex !== undefined
        ? { stageIndex: params.stageIndex }
        : {}),
      ...(params.resultJson ? { resultJson: params.resultJson } : {}),
      ...(params.completedAt !== undefined
        ? { completedAt: params.completedAt }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, params.run.id),
        params.expectedUpdatedAt
          ? eq(marketplaceAutoReviewRuns.updatedAt, params.expectedUpdatedAt)
          : undefined
      )
    )
    .returning();
  if (!next && params.expectedUpdatedAt) {
    throw new MarketplaceAutoReviewStateWriteConflict();
  }
  if (!next) throw new Error(`STAGED_RUN_PERSIST_FAILED:${params.run.id}`);
  return next;
}

async function upsertStage(params: {
  db: Db;
  runId: string;
  stageKey: string;
  status: string;
  output?: Record<string, unknown>;
}) {
  const [existing] = await params.db
    .select({ id: marketplaceAutoReviewStages.id })
    .from(marketplaceAutoReviewStages)
    .where(
      and(
        eq(marketplaceAutoReviewStages.runId, params.runId),
        eq(marketplaceAutoReviewStages.stageKey, params.stageKey)
      )
    )
    .limit(1);
  const now = new Date();
  if (existing) {
    await params.db
      .update(marketplaceAutoReviewStages)
      .set({
        status: params.status,
        outputJson: params.output ?? {},
        updatedAt: now,
        ...(params.status === "waiting_provider" ? { startedAt: now } : {}),
        ...(params.status === "completed" ? { completedAt: now } : {}),
      })
      .where(eq(marketplaceAutoReviewStages.id, existing.id));
    return;
  }
  await params.db.insert(marketplaceAutoReviewStages).values({
    runId: params.runId,
    stageKey: params.stageKey,
    stageOrder: 0,
    status: params.status,
    outputJson: params.output ?? {},
    createdAt: now,
    updatedAt: now,
  });
}

function checkpointExpectation(
  checkpoint: HumanApprovalCheckpointV1
): StagedCheckpointApprovalExpectationV1 {
  if (
    !checkpoint.approvedModel?.trim() ||
    !checkpoint.approvedProvider?.trim() ||
    !checkpoint.approvedSafetyVerdict?.trim() ||
    !checkpoint.approvedReferenceManifestHash?.trim() ||
    checkpoint.estimatedCredits === null
  ) {
    throw new Error(
      `STAGED_CHECKPOINT_APPROVAL_PROVENANCE_MISSING:${checkpoint.checkpointId}`
    );
  }
  return {
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    model: checkpoint.approvedModel,
    provider: checkpoint.approvedProvider,
    safetyVerdict: checkpoint.approvedSafetyVerdict,
    referenceManifestHash: checkpoint.approvedReferenceManifestHash,
    estimatedCredits: checkpoint.estimatedCredits,
  };
}

async function consumeCheckpoint(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1;
  checkpoint: HumanApprovalCheckpointV1;
  operationId: string;
}) {
  const expected = checkpointExpectation(params.checkpoint);
  const guard = assertStagedProviderSpendAllowed(params.checkpoint, expected);
  if (!guard.ok) throw new Error(guard.reasonCode);
  // Re-verify against the database's current state immediately before
  // spending. `params.checkpoint` (and `expected`, derived from it) reflects
  // metadata read once at the top of this advance pass. Recheck against
  // the current checkpoint, then consume it using the same row version.
  const [freshRow] = await params.db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(eq(marketplaceAutoReviewRuns.id, params.run.id))
    .limit(1);
  const freshParsed = freshRow
    ? StagedSequentialStoryboardMetadataV1Schema.safeParse(
        freshRow.metadataJson
      )
    : null;
  const freshCheckpoint = freshParsed?.success
    ? freshParsed.data.stagedSequentialStoryboard.reviewCheckpoints.find(
        item => item.checkpointId === params.checkpoint.checkpointId
      )
    : undefined;
  if (!freshRow || !freshParsed?.success || !freshCheckpoint) {
    throw new Error("checkpoint_revision_mismatch");
  }
  const freshGuard = assertStagedProviderSpendAllowed(
    freshCheckpoint,
    expected
  );
  if (!freshGuard.ok) throw new Error(freshGuard.reasonCode);
  const transitioned = transitionStagedCheckpoint(params.checkpoint, {
    type: "consume",
    operationId: params.operationId,
    consumedAt: new Date().toISOString(),
  });
  if (!transitioned.ok) throw new Error(transitioned.reasonCode);
  const next = appendSafeEvidence(
    replaceCheckpoint(freshParsed.data, transitioned.checkpoint),
    buildStagedSafeEvidenceEvent({
      runId: params.run.id,
      operation: "checkpoint_consumed",
      checkpointKind: transitioned.checkpoint.kind,
      shotId: transitioned.checkpoint.shotId,
      state: transitioned.checkpoint.state,
      model: transitioned.checkpoint.approvedModel,
      provider: transitioned.checkpoint.approvedProvider,
      estimatedCredits: transitioned.checkpoint.estimatedCredits,
      contentHash: transitioned.checkpoint.contentHash,
    })
  );
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as unknown as Record<string, any>,
    expectedUpdatedAt: freshRow.updatedAt,
  });
  return next;
}

async function reserveAndSubmit(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  mediaType: "image" | "video" | "audio";
  unitId: string;
  model: string;
  estimatedCredits: number;
  description: string;
  request: Record<string, unknown>;
}) {
  const token = await resolveStagedUserToken(
    params.runtime.userToken,
    params.auth.userId
  );
  const amount = Math.max(0, Math.ceil(params.estimatedCredits));
  if (amount > 0 && !(await hasEnoughCredits(params.auth.userId, amount))) {
    throw new Error("staged_insufficient_credits");
  }
  let credit: { transactionId?: number } | null = null;
  if (amount > 0) {
    credit = await deductCredits({
      userId: params.auth.userId,
      tenantId: requireStagedTenantId(
        params.auth.tenantId,
        params.run.tenantId
      ),
      amount,
      description: params.description,
      idempotencyKey: `staged:${params.run.id}:${params.mediaType}:${params.unitId}`,
      sourceType:
        params.mediaType === "image"
          ? "media_image"
          : params.mediaType === "video"
            ? "media_video"
            : "media_audio",
      metadata: {
        feature: "marketplace_auto_review",
        planningArchitecture: "staged_two_skill_v2",
        runId: params.run.id,
        unitId: params.unitId,
        mediaType: params.mediaType,
      },
    });
  }
  let task;
  try {
    task =
      params.mediaType === "image"
        ? await mediaGenerationService.generateImageAsync(
            params.request as any,
            token
          )
        : params.mediaType === "video"
          ? await mediaGenerationService.generateVideoAsync(
              params.request as any,
              token
            )
          : await mediaGenerationService.generateAudioAsync(
              params.request as any,
              token
            );
  } catch (error) {
    if (credit?.transactionId && amount > 0) {
      try {
        await refundCredits({
          userId: params.auth.userId,
          amount,
          originalTransactionId: credit.transactionId,
          idempotencyKey: `staged:${params.run.id}:${params.mediaType}:${params.unitId}:refund`,
          description: `Marketplace staged ${params.mediaType} provider submission failed`,
          sourceType:
            params.mediaType === "image"
              ? "media_image"
              : params.mediaType === "video"
                ? "media_video"
                : "media_audio",
          metadata: {
            runId: params.run.id,
            unitId: params.unitId,
            reason: "provider_submit_failed",
          },
        });
      } catch (refundError) {
        throw new AggregateError(
          [error, refundError],
          `MARKETPLACE_STAGED_${params.mediaType.toUpperCase()}_SUBMISSION_AND_REFUND_FAILED:${params.unitId}`
        );
      }
    }
    throw error;
  }
  return {
    task,
    amount,
    transactionId: credit?.transactionId,
    creditIdempotencyKey:
      amount > 0
        ? `staged:${params.run.id}:${params.mediaType}:${params.unitId}`
        : undefined,
  };
}

function taskRecord(
  metadata: Record<string, any>,
  shotId: number,
  mediaType: string
) {
  return record(record(metadata.stagedPipeline).tasks)[
    `${mediaType}:${shotId}`
  ];
}

function setTaskRecord(
  metadata: Record<string, any>,
  key: string,
  value: Record<string, any>
) {
  const pipeline = record(metadata.stagedPipeline);
  const taskRecord = { ...value, stagedTaskKey: key };
  const taskHistory = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory
    : [];
  return updateStagedTaskCreditSummary({
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      tasks: { ...record(pipeline.tasks), [key]: taskRecord },
      taskHistory: [...taskHistory, taskRecord].slice(-200),
    },
  });
}

function updateTaskRecord<T extends Record<string, any>>(
  metadata: T,
  key: string,
  patch: Record<string, any>
): T {
  const pipeline = record(metadata.stagedPipeline);
  const tasks = record(pipeline.tasks);
  if (!tasks[key]) return metadata;
  const currentTask = record(tasks[key]);
  const taskId = text(currentTask.taskId);
  const taskHistory = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory.map((item: unknown) => {
        const historyTask = record(item);
        return taskId && text(historyTask.taskId) === taskId
          ? { ...historyTask, ...patch, stagedTaskKey: key }
          : item;
      })
    : pipeline.taskHistory;
  return {
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      tasks: {
        ...tasks,
        [key]: { ...currentTask, ...patch, stagedTaskKey: key },
      },
      taskHistory,
    },
  } as T;
}

function appendSafeEvidence(
  metadata: Record<string, any>,
  event: ReturnType<typeof buildStagedSafeEvidenceEvent>
) {
  const pipeline = record(metadata.stagedPipeline);
  const events = Array.isArray(pipeline.safeEvidenceEvents)
    ? pipeline.safeEvidenceEvents
    : [];
  return {
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      safeEvidenceEvents: [...events, event].slice(-100),
    },
  } as Record<string, any>;
}

function updateStagedTaskCreditSummary<T extends Record<string, any>>(
  metadata: T
): T {
  const pipeline = record(metadata.stagedPipeline);
  const history = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory
    : [];
  const activeTasks = Object.values(record(pipeline.tasks));
  const byTaskId = new Map<string, Record<string, any>>();
  for (const rawTask of [...history, ...activeTasks]) {
    const task = record(rawTask);
    const taskId = text(task.taskId);
    if (taskId) byTaskId.set(taskId, task);
  }
  const tasks = [...byTaskId.values()];
  const creditAmountForTask = (task: Record<string, any>) => {
    const amount = task.creditAmount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`STAGED_TASK_CREDIT_AMOUNT_INVALID:${text(task.taskId)}`);
    }
    return amount;
  };
  const reservedCredits = tasks.reduce(
    (sum, task) => sum + creditAmountForTask(task),
    0
  );
  const refundedCredits = tasks.reduce(
    (sum, task) =>
      sum + (task.refundTransactionId ? creditAmountForTask(task) : 0),
    0
  );
  const previous = record(metadata.creditSummary);
  const stagedReservationRefs = tasks
    .map(task => {
      const key = text(task.creditIdempotencyKey);
      return key ? `credit:${key}` : "";
    })
    .filter(Boolean);
  const stagedTransactionRefs = tasks
    .map(task => {
      const transactionId = Number(task.creditTransactionId);
      return transactionId > 0 ? `credit-tx:${transactionId}` : "";
    })
    .filter(Boolean);
  return {
    ...metadata,
    creditSummary: {
      ...previous,
      status: "tracked_idempotently",
      reservedCredits,
      spentCredits: Math.max(0, reservedCredits - refundedCredits),
      refundedCredits,
      outstandingCredits: Math.max(0, reservedCredits - refundedCredits),
      mediaTaskCount: tasks.length,
      reservationRefs: [
        ...new Set([
          ...(Array.isArray(previous.reservationRefs)
            ? previous.reservationRefs
            : []),
          ...stagedReservationRefs,
        ]),
      ],
      transactionRefs: [
        ...new Set([
          ...(Array.isArray(previous.transactionRefs)
            ? previous.transactionRefs
            : []),
          ...stagedTransactionRefs,
        ]),
      ],
    },
  } as T;
}

// Additive (feature/marketplace-flexible-shots): shared read of the story-arc
// planning context (tone/structure/duration/shot-count) from the run's
// canonical `referenceAnchors` for LLM authoring and redrafts.
function stagedPlanContextFromMetadataBase(base: Record<string, any>) {
  const anchors = record(base.referenceAnchors);
  const reviewFormat =
    typeof anchors.reviewFormat === "string" ? anchors.reviewFormat : undefined;
  const reviewTone =
    typeof anchors.reviewTone === "string" ? anchors.reviewTone : undefined;
  const storytellingStructure =
    typeof anchors.storytellingStructure === "string"
      ? anchors.storytellingStructure
      : undefined;
  // User-chosen per-shot duration (advanced overrides). Omitted -> undefined
  // -> buildStagedStoryArcPlan's default of 10. Video generation later
  // requires the selected model to support this exact duration.
  const shotDurationSecondsRaw = anchors.shotDurationSeconds;
  const shotDurationSeconds =
    typeof shotDurationSecondsRaw === "number" &&
    Number.isFinite(shotDurationSecondsRaw)
      ? shotDurationSecondsRaw
      : undefined;
  // Additive (feature/marketplace-flexible-shots). Omitted -> undefined ->
  // every downstream default of a fixed 9 shots, byte-identical to before
  // this field existed.
  const shotCountRaw = anchors.shotCount;
  const shotCount: number | "auto" | undefined =
    shotCountRaw === "auto"
      ? "auto"
      : typeof shotCountRaw === "number" && Number.isFinite(shotCountRaw)
        ? shotCountRaw
        : undefined;
  // User-chosen story/skill LLM (advanced overrides). Absent -> undefined ->
  // `generateStagedStoryArcPlanWithLLM`'s own "อัตโนมัติ" resolution, which
  // now draws from the admin-curated recommended set. Stored alongside
  // `shotCount`/`shotDurationSeconds` because it is the same kind of
  // creation-time planning choice.
  const storyPlanningModel =
    typeof anchors.storyPlanningModel === "string" &&
    anchors.storyPlanningModel.trim()
      ? anchors.storyPlanningModel.trim()
      : undefined;
  const excludePromotionalContent =
    anchors.excludePromotionalContent !== false;
  const cast = deriveStagedCastFromManifest(base.customReferenceManifest);
  return {
    reviewFormat,
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    excludePromotionalContent,
    cast,
  };
}

// Builds fresh run metadata from the single LLM-authored plan.
function buildFreshStagedMetadataFromPlan(input: {
  run: MarketplaceAutoReviewRun;
  base: Record<string, any>;
  plan: StagedStoryArcPlan;
  reviewTone?: string;
  storytellingStructure?: string;
}) {
  const { run, base, plan, reviewTone, storytellingStructure } = input;
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${run.id}:r${plan.planRevision}`,
    kind: "story_plan",
    revision: plan.planRevision,
    contentHash: plan.storyPlanHash,
    model: plan.authoring.model,
    provider: plan.authoring.provider,
    estimatedCredits: 0,
    referenceManifestHash: plan.referenceManifestHash,
    adherenceWarnings:
      plan.shots.length === 0
        ? []
        : assessStagedPlanAdherence(plan, {
            reviewTone,
            storytellingStructure,
          }).warnings,
  });
  const metadata = {
    ...base,
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    concept: buildLegacyConcept(plan),
    stagedPipeline: {
      plan,
      planView: buildStagedPlanView(plan),
      tasks: {},
      audioPlan: null,
      finalAssembly: null,
    },
    planReview: {
      required: true as const,
      status: "awaiting" as const,
      planRevision: plan.planRevision,
      approvedRevision: null,
      redraftCount: 0,
      lastOperationId: null,
    },
    creativeQc: createMarketplaceDraftQcState(),
    stagedSequentialStoryboard: {
      storyPlanStatus: "awaiting" as const,
      planRevision: plan.planRevision,
      storyPlanHash: plan.storyPlanHash,
      referenceManifestHash: plan.referenceManifestHash,
      shots: plan.shots.map(shot => ({
        shotId: shot.shotId,
        revision: plan.planRevision,
        state: "story_awaiting",
        storySummary: shot.storySummary,
        dialogue: shot.dialogue,
        imagePromptHash: null,
        imageArtifactHash: null,
        videoPromptHash: null,
        videoArtifactHash: null,
        title: shot.title,
        visualSummary: shot.visualSummary,
        durationSeconds: shot.durationSeconds,
      })),
      reviewCheckpoints: [storyCheckpoint],
    },
  };
  return metadata as StagedSequentialStoryboardMetadataV1 & Record<string, any>;
}

export function planAndMetadataFromRun(run: MarketplaceAutoReviewRun): {
  plan: StagedStoryArcPlan;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
} {
  const base = record(run.metadataJson);
  const existingPlan = stagedPlanFromMetadata(base);
  if (!existingPlan) {
    throw new Error("STAGED_PERSISTED_STORY_PLAN_REQUIRED");
  }
  const existing = StagedSequentialStoryboardMetadataV1Schema.safeParse(base);
  if (!existing.success) {
    throw new Error("STAGED_PERSISTED_METADATA_INVALID");
  }
  return {
    plan: existingPlan,
    metadata: existing.data as typeof existing.data & Record<string, any>,
  };
}

// Additive (feature/marketplace-flexible-shots): async LLM plan builder for a
// BRAND NEW run (i.e. `base` does not yet parse as staged metadata). An
// already-persisted plan is reused only when its full metadata is valid.
// Used only by `initializeStagedMarketplaceAutoReviewRun` and
// `redraftStagedMarketplaceAutoReviewRun`.
export async function buildStagedPlanAndMetadataForInit(
  run: MarketplaceAutoReviewRun,
  options?: { revision?: number; previousStorySummary?: string | null; db?: Db }
): Promise<{
  plan: StagedStoryArcPlan;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
}> {
  const base = record(run.metadataJson);
  const {
    reviewFormat,
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    excludePromotionalContent,
    cast,
  } = stagedPlanContextFromMetadataBase(base);
  const existingPlan = stagedPlanFromMetadata(base);
  if (existingPlan) {
    const existing = StagedSequentialStoryboardMetadataV1Schema.safeParse(base);
    if (!existing.success) {
      throw new Error("STAGED_PERSISTED_METADATA_INVALID");
    }
    return {
      plan: existingPlan,
      metadata: existing.data as typeof existing.data & Record<string, any>,
    };
  }
  const product = buildProductFromMetadata(run, base);
  const referenceManifestHash = buildProductionStableHash({
    referenceAnchors: base.referenceAnchors ?? {},
    productImageUrls: base.productImageUrls ?? [],
  });
  const languagePlan = requireStagedLanguagePlanFromMetadata(base);
  const usedReviewConcepts = options?.db
    ? await loadUsedReviewConcepts(options.db, run)
    : [];
  const plan = await generateStagedStoryArcPlanWithLLM({
    runId: run.id,
    userId: run.userId ?? undefined,
    tenantId: run.tenantId ?? undefined,
    product,
    referenceManifestHash,
    revision: options?.revision,
    previousStorySummary: options?.previousStorySummary,
    languagePlan,
    reviewFormat,
    reviewTone,
    storytellingStructure,
    excludePromotionalContent,
    cast,
    shotDurationSeconds,
    shotCount,
    model: storyPlanningModel,
    conceptsOnly: true,
    usedReviewConcepts,
  });
  const metadata = buildFreshStagedMetadataFromPlan({
    run,
    base,
    plan,
    reviewTone,
    storytellingStructure,
  });
  return { plan, metadata };
}

function stagedMetadataForPlan(input: {
  run: MarketplaceAutoReviewRun;
  base: Record<string, any>;
  plan: StagedStoryArcPlan;
  redraftCount: number;
  reviewTone?: string;
  storytellingStructure?: string;
  previousPlan: StagedStoryArcPlan;
}) {
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${input.run.id}:r${input.plan.planRevision}`,
    kind: "story_plan",
    revision: input.plan.planRevision,
    contentHash: input.plan.storyPlanHash,
    model: input.plan.authoring.model,
    provider: input.plan.authoring.provider,
    estimatedCredits: 0,
    referenceManifestHash: input.plan.referenceManifestHash,
    adherenceWarnings:
      input.plan.shots.length === 0
        ? []
        : assessStagedPlanAdherence(input.plan, {
            reviewTone: input.reviewTone,
            storytellingStructure: input.storytellingStructure,
          }).warnings,
  });
  const metadata = {
    ...input.base,
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    concept: buildLegacyConcept(input.plan),
    stagedPipeline: {
      ...record(input.base.stagedPipeline),
      usedReviewConcepts: rememberUsedReviewConcept(
        record(input.base.stagedPipeline).usedReviewConcepts,
        findConfirmedStagedReviewConcept(input.previousPlan)
      ),
      plan: input.plan,
      planView: buildStagedPlanView(input.plan),
      tasks: {},
      audioPlan: null,
      finalAssembly: null,
    },
    planReview: {
      ...record(input.base.planReview),
      required: true as const,
      status: "awaiting" as const,
      planRevision: input.plan.planRevision,
      approvedRevision: null,
      redraftCount: input.redraftCount,
      lastOperationId: null,
    },
    creativeQc: createMarketplaceDraftQcState(),
    stagedSequentialStoryboard: {
      ...record(input.base.stagedSequentialStoryboard),
      storyPlanStatus: "awaiting" as const,
      planRevision: input.plan.planRevision,
      storyPlanHash: input.plan.storyPlanHash,
      referenceManifestHash: input.plan.referenceManifestHash,
      shots: input.plan.shots.map(shot => {
        const existingShot = record(
          input.base.stagedSequentialStoryboard
        ).shots?.find?.((s: any) => s.shotId === shot.shotId);
        const next = {
          ...existingShot,
          shotId: shot.shotId,
          revision: input.plan.planRevision,
          state: "story_awaiting",
          storySummary: shot.storySummary,
          dialogue: shot.dialogue,
          title: shot.title,
          visualSummary: shot.visualSummary,
          durationSeconds: shot.durationSeconds,
        };
        // A redraft re-authors WHO is in each shot, and
        // `resolveShotCastSelectionFromMetadata` lets the state shot override
        // the plan. Carrying the previous revision's manual `castInShot` over
        // would therefore pin the new story to the OLD cast — a character the
        // user just added could never appear in a shot they had once edited
        // by hand (`planning/marketplace-four-character-cast/plan.md`). The
        // fresh plan is the authority; per-shot look overrides survive,
        // because a look is about a person, not about the story.
        delete (next as Record<string, unknown>).castInShot;
        return next;
      }),
      reviewCheckpoints: [
        storyCheckpoint,
        ...(Array.isArray(
          record(input.base.stagedSequentialStoryboard).reviewCheckpoints
        )
          ? record(
              input.base.stagedSequentialStoryboard
            ).reviewCheckpoints.filter((cp: any) => cp.kind !== "story_plan")
          : []),
      ],
    },
  };
  return metadata as StagedSequentialStoryboardMetadataV1 & Record<string, any>;
}

export async function redraftStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  notes?: string | null;
  selectedConcept?: StagedStoryConceptOption;
}) {
  const base = record(params.run.metadataJson);
  const {
    reviewFormat,
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    excludePromotionalContent,
    cast,
  } = stagedPlanContextFromMetadataBase(base);
  const current = stagedPlanFromMetadata(base);
  if (!current) {
    throw new Error("STAGED_PERSISTED_STORY_PLAN_REQUIRED");
  }
  const notes = text(params.notes).slice(0, 1200);
  const resolvedShotDurationSeconds =
    shotDurationSeconds ?? current.shots[0]?.durationSeconds;
  const sharedPlanInput = {
    runId: params.run.id,
    product: current.product,
    referenceManifestHash: current.referenceManifestHash,
    revision: current.planRevision + 1,
    languagePlan: current.languagePlan
      ? requireStagedLanguagePlanFromMetadata({
          sequentialStoryboard: { languagePlan: current.languagePlan },
        })
      : (() => {
          throw new Error("STAGED_LANGUAGE_PLAN_REQUIRED");
        })(),
    previousStorySummary: notes ? notes.slice(0, 500) : undefined,
    reviewFormat,
    reviewTone,
    storytellingStructure,
    excludePromotionalContent,
    cast,
    shotDurationSeconds: resolvedShotDurationSeconds,
  };
  // Keep redrafts on the direct LLM path so they can honor a selected review
  // idea and return a fresh set of alternatives. Fail the operation if the
  // skill call or its output is invalid.
  const nextPlan = await generateStagedStoryArcPlanWithLLM({
    ...sharedPlanInput,
    userId: params.run.userId ?? undefined,
    tenantId: params.run.tenantId ?? undefined,
    shotCount,
    selectedConcept: params.selectedConcept ?? findConfirmedStagedReviewConcept(current),
    model: storyPlanningModel,
  });
  const currentRedraftCount = record(base.planReview).redraftCount;
  if (!Number.isInteger(currentRedraftCount) || currentRedraftCount < 0) {
    throw new Error("STAGED_REDRAFT_COUNT_INVALID");
  }
  const metadata = stagedMetadataForPlan({
    run: params.run,
    base,
    plan: nextPlan,
    previousPlan: current,
    redraftCount: currentRedraftCount + 1,
    reviewTone,
    storytellingStructure,
  });
  const adherence = assessStagedPlanAdherence(nextPlan, {
    reviewTone,
    storytellingStructure,
  });
  const next = await persistRun({
    db: params.db,
    run: params.run,
    metadata,
    status: "running",
    currentStage: "concept_story",
    stageIndex: 3,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "concept_story",
    status: "blocked_needs_user",
    output: {
      planningArchitecture: "staged_two_skill_v2",
      storyPlan: buildStagedPlanView(nextPlan),
      statusDetail: {
        state: "awaiting_story_plan_review",
        severity: "info",
        reasonCodes: ["story_plan_redraft_ready", ...adherence.warnings],
        safeMessage:
          "ร่างเนื้อเรื่องใหม่พร้อมตรวจแล้ว ระบบยังไม่ใช้เครดิตสร้างภาพ",
        nextAction: "ตรวจและยืนยันเนื้อเรื่องใหม่",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

export async function initializeStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
}) {
  // Additive (feature/marketplace-flexible-shots): LLM-first story authoring
  // when cast is present (dialogue is creative content — skill-first rule)
  // or shotCount="auto" (shot count itself is LLM judgment). A skill error
  // fails initialization; deterministic story content is never substituted.
  const { plan, metadata } = await buildStagedPlanAndMetadataForInit(
    params.run,
    { db: params.db }
  );
  const anchorsForAdherence = record(
    record(params.run.metadataJson).referenceAnchors
  );
  const adherence =
    plan.shots.length > 0
      ? assessStagedPlanAdherence(plan, {
          storytellingStructure:
            typeof anchorsForAdherence.storytellingStructure === "string"
              ? anchorsForAdherence.storytellingStructure
              : undefined,
          reviewTone:
            typeof anchorsForAdherence.reviewTone === "string"
              ? anchorsForAdherence.reviewTone
              : undefined,
        })
      : { warnings: [] };
  const next = await persistRun({
    db: params.db,
    run: params.run,
    metadata,
    status: "running",
    currentStage: "concept_story",
    stageIndex: 3,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "concept_story",
    status: "blocked_needs_user",
    output: {
      planningArchitecture: "staged_two_skill_v2",
      storyPlan: buildStagedPlanView(plan),
      statusDetail: {
        state: plan.shots.length > 0 ? "awaiting_story_plan_review" : "awaiting_story_concept_selection",
        severity: "info",
        reasonCodes: [
          plan.shots.length > 0
            ? "story_plan_approval_required"
            : "story_concept_selection_required",
          ...adherence.warnings,
        ],
        safeMessage:
          plan.shots.length > 0
            ? "ตรวจเนื้อเรื่องก่อน ระบบยังไม่ใช้เครดิตสร้างภาพ"
            : "เลือกแนวคิดรีวิวก่อน ระบบจึงจะร่างช็อตและบทพูด",
        nextAction:
          plan.shots.length > 0 ? "ตรวจและยืนยันเนื้อเรื่อง" : "เลือกแนวคิดรีวิว",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function compileImagePromptCheckpoints(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  runtime: Runtime;
  auth: Auth;
}) {
  let next = params.metadata;
  let savedRun = params.run;
  const imageModel = requireStagedModel(params.metadata.imageModel, "image");
  // An awaiting checkpoint always requires an explicit user decision. This
  // worker only authors missing prompts; it never repairs approval state.
  for (const shot of params.plan.shots) {
    const shotState = next.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    const existingPrompt = checkpointFor(next, "image_prompt", shot.shotId);
    // A per-shot story/dialogue repair deliberately leaves other shots in
    // place. Preserve their existing prompt checkpoint instead of compiling
    // and re-spending the whole storyboard when the run-level story gate is
    // approved again.
    if (
      shotState?.state !== "story_awaiting" &&
      text(shotState?.imagePrompt) &&
      existingPrompt
    ) {
      continue;
    }

    // This pass has one authoritative path: call the installed storyboard
    // skill once for each missing shot and surface any error to the worker.
    const { buildStagedSingleShotRefreshInput } =
      await import("./marketplaceAutoReviewStagedCheckpointRouterService");
    const refreshInput = buildStagedSingleShotRefreshInput({
      run: params.run as any,
      metadata: next as any,
      shotId: shot.shotId,
      publicUrl: params.runtime.publicUrl,
      tenantId: params.auth.tenantId,
      stage: "image",
    });
    const referenceHash = buildProductionStableHash(
      refreshInput.referenceManifest
    );
    const requestIdempotencyKey = `marketplace-auto-review:${params.run.id}:image-prompt:shot-${shot.shotId}:r${params.plan.planRevision}:${referenceHash}`;
    const recoveryInstruction = [
      "The previous response did not pass the image-prompt validator. Regenerate the prompt from the supplied shot contract and references.",
      "Return ONLY a valid JSON object with exactly one key: start_frame_image_prompt.",
      "The prompt must be at least 80 characters and remain within the image prompt length limit.",
      "Explicitly include a vertical or 9:16 composition, a reference or @ImageN cue, camera/framing/composition or lighting/focus direction, and a clear no text/captions/subtitles instruction.",
      "Do not include markdown, commentary, video prompts, camera beats, or other keys.",
    ].join(" ");
    let prompt = "";
    let lastPromptError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const refresh = await refreshSequentialShotPromptWithSkillDirect({
          ...refreshInput,
          requestIdempotencyKey,
          ...(attempt > 1 ? { recoveryInstruction } : {}),
          skillVisionUrls: await stageMarketplaceInlineImageReferences(
            refreshInput.skillVisionUrls,
            {
              auditContext: {
                source: "marketplace_auto_review_staged",
                tenantId: refreshInput.tenantId,
                userId: refreshInput.userId,
              },
            }
          ) ?? [],
        });
        const candidate = refresh.startFrameImagePrompt.trim();
        if (!isCompleteStagedImagePrompt(candidate)) {
          throw new Error("incomplete_image_prompt");
        }
        prompt = candidate;
        break;
      } catch (error) {
        lastPromptError = error;
        const retryable = isRetryableStagedImagePromptError(error);
        console.warn(
          "[advanceStagedMarketplaceAutoReviewRun] image prompt attempt failed",
          {
            runId: params.run.id,
            shotId: shot.shotId,
            attempt,
            failureKind: stagedImagePromptFailureKind(error),
            retrying: attempt === 1 && retryable,
          }
        );
        if (attempt === 2 || !retryable) break;
      }
    }
    if (!prompt) {
      throw new Error(
        `MARKETPLACE_IMAGE_PROMPT_GENERATION_FAILED:shot:${shot.shotId}`,
        { cause: lastPromptError ?? undefined }
      );
    }
    const hash = buildStagedImagePromptContentHash({
      revision: params.plan.planRevision,
      shotId: shot.shotId,
      prompt,
      referenceManifestHash: params.plan.referenceManifestHash,
    });
    const checkpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${params.run.id}:shot-${shot.shotId}:r${params.plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot.shotId,
      revision: params.plan.planRevision,
      contentHash: hash,
      model: imageModel,
      provider: modelProvider(imageModel),
      estimatedCredits: modelCost(imageModel),
      referenceManifestHash: params.plan.referenceManifestHash,
      autoApprove: { userId: params.run.userId },
    });
    next = replaceCheckpoint(next, checkpoint);
    next = updateShot(next, shot.shotId, {
      ...(shotState?.imageArtifactHash ? {} : { state: "image_prompt_awaiting" }),
      imagePromptHash: hash,
      imagePrompt: prompt,
    });
    next = {
      ...next,
      stagedPipeline: {
        ...record(next.stagedPipeline),
        promptGeneration: {
          ...record(record(next.stagedPipeline).promptGeneration),
          [`image:${shot.shotId}`]: {
            generatedAt: new Date().toISOString(),
            source: "skill",
          },
        },
      },
      stagedSequentialStoryboard: {
        ...next.stagedSequentialStoryboard,
        storyPlanStatus: "approved",
      },
      planReview: {
        ...next.planReview,
        status: "approved",
        approvedRevision: params.plan.planRevision,
      },
    };
    // Persist each completed shot before starting another LLM call. If a
    // worker lease expires or the process restarts mid-storyboard, retries
    // can resume from the first missing shot instead of discarding all
    // prompts authored earlier in this pass.
    savedRun = await persistRun({
      db: params.db,
      run: savedRun,
      metadata: next as any,
      expectedUpdatedAt: savedRun.updatedAt,
      status: "running",
      currentStage: "prompt_plan",
      stageIndex: 4,
    });
  }
  next = {
    ...next,
    stagedSequentialStoryboard: {
      ...next.stagedSequentialStoryboard,
      storyPlanStatus: "approved",
    },
    planReview: {
      ...next.planReview,
      status: "approved",
      approvedRevision: params.plan.planRevision,
    },
  };
  await persistRun({
    db: params.db,
    run: savedRun,
    metadata: next as any,
    expectedUpdatedAt: savedRun.updatedAt,
    status: "running",
    currentStage: "prompt_plan",
    stageIndex: 4,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "prompt_plan",
    status: "blocked_needs_user",
    output: {
      statusDetail: {
        state: "awaiting_image_prompt_review",
        severity: "info",
        reasonCodes: ["image_prompt_approval_required_per_shot"],
        safeMessage:
          "ตรวจ Prompt ของแต่ละช็อตก่อนยืนยันสร้างภาพ ระบบยังไม่ใช้เครดิตภาพ",
        nextAction: "ตรวจ Prompt ช็อตที่ต้องการ แล้วกดยืนยันสร้างภาพ",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

function isRetryableStagedImagePromptError(error: unknown): boolean {
  const failureKind = stagedImagePromptFailureKind(error);
  return failureKind === "invalid_prompt_output" || failureKind === "provider_transient";
}

function stagedImagePromptFailureKind(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const invalidPromptOutput =
    /incomplete_image_prompt|MARKETPLACE_SINGLE_SHOT_SKILL_(?:OUTPUT_INVALID|INVALID_JSON|EMPTY_OUTPUT)/i.test(
      message
    ) ||
    /empty_response|empty response|no (?:final )?assistant text/i.test(message);
  if (invalidPromptOutput) {
    return "invalid_prompt_output";
  }
  if (/reference|image.*download|download.*image|PUBLIC_APP_URL/i.test(message)) {
    return "reference_unavailable";
  }
  if (
    /HTTP\s*(?:408|425|429|5\d\d)|\b(?:408|425|429|5\d\d)\s+(?:status|response)|timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|network|rate limit|temporarily unavailable|overloaded/i.test(
      message
    )
  ) {
    return "provider_transient";
  }
  if (/credit|budget/i.test(message)) return "credit_or_budget";
  if (/unauthorized|forbidden|not configured|not found|tenant.*(?:required|mismatch|scope)/i.test(message)) {
    return "configuration_or_access";
  }
  if (/HTTP\s*4\d\d|\b4\d\d\s+(?:status|response)|bad request|invalid request/i.test(message)) {
    return "provider_request_rejected";
  }
  return "skill_call_failed";
}

export function isRetryableStagedImagePromptErrorForTest(
  error: unknown
): boolean {
  return isRetryableStagedImagePromptError(error);
}

async function handleImageProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const metadata = params.metadata;
  const checkpoint = checkpointFor(metadata, "image_prompt", params.shotId);
  if (!checkpoint) throw new Error("checkpoint_not_ready");
  // Use the model/provider the user explicitly approved via the UI to avoid
  // checkpoint_model_mismatch when the UI model selection differs from metadata.imageModel.
  const model = requireStagedModel(checkpoint.approvedModel, "image");
  const provider = text(checkpoint.approvedProvider);
  if (!provider) throw new Error(`STAGED_IMAGE_PROVIDER_REQUIRED:${model}`);
  const expected = checkpointExpectation(checkpoint);
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...expected,
    model,
    provider,
    estimatedCredits: expected.estimatedCredits,
  });
  if (!guard.ok) throw new Error(guard.reasonCode);
  const prompt = text(
    record(
      metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === params.shotId
      )
    ).imagePrompt
  );
  if (
    buildStagedImagePromptContentHash({
      revision: checkpoint.revision,
      shotId: params.shotId,
      prompt,
      referenceManifestHash: expected.referenceManifestHash,
    }) !== checkpoint.contentHash
  ) {
    throw new Error(`checkpoint_hash_mismatch:shot:${params.shotId}`);
  }
  const operationId = `staged-image-${params.run.id}-${params.shotId}-${nanoid(8)}`;
  const consumed = await consumeCheckpoint({
    db: params.db,
    run: params.run,
    metadata,
    checkpoint,
    operationId,
  });
  const consumedRecord = record(consumed);
  const customManifest = Array.isArray(consumedRecord.customReferenceManifest)
    ? consumedRecord.customReferenceManifest
    : [];
  if (customManifest.length === 0) {
    throw new Error("STAGED_REFERENCE_MANIFEST_REQUIRED");
  }

  let referenceImageUrls: string[] = [];
  let characterItems: any[] = [];
  let productItems: any[] = [];

  if (customManifest.length > 0) {
    const activeItems = customManifest.filter(
      (item: any) =>
        item &&
        typeof item.url === "string" &&
        item.url.trim() &&
        item.active !== false
    );
    productItems = activeItems.filter((item: any) => item.role !== "character");
    const allCharacterItems = activeItems.filter(
      (item: any) => item.role === "character"
    );

    // Per-shot cast (`planning/marketplace-four-character-cast/plan.md` §5).
    // This used to send EVERY character in the manifest to EVERY shot, which
    // with a 4-person roster means all four people standing in every frame.
    // `resolveShotCastSelectionFromMetadata` reads this shot's own
    // `castInShot` + `castLooks`, and the SAME helper feeds the prompt
    // builders, so the `@ImageN` tags always point at the images actually
    // sent.
    const shotCastSelection = resolveShotCastSelectionFromMetadata({
      metadata: consumedRecord,
      plan: params.plan,
      shotId: params.shotId,
    });
    const { ordered: orderedItems, shotCharacterItems } =
      buildShotOrderedReferenceItems({
        productItems: isStagedProductVisibleInShot(
          shot,
          params.plan.product.productName,
        ) ? productItems : [],
        characterItems: allCharacterItems,
        castInShot: shotCastSelection.castInShot,
        castLooks: shotCastSelection.castLooks,
      });
    characterItems = shotCharacterItems;
    // Products first (@Image1, ...), then this shot's characters (@Image2, ...)
    referenceImageUrls = orderedItems.map((item: any) => item.url.trim());
  }

  // Keep managed storage references intact here. mediaGenerationService
  // resolves them with the tenant-scoped download broker before submitting to
  // Python; fetching `/api/storage/files/*` here drops that authorization and
  // makes valid product/character references look like 404s. The Python Kie
  // adapter then rehosts and normalizes provider-incompatible formats.

  // Skill-first prompt authoring (project rule: prompt creation/improvement
  // uses LLM judgment, so it must always be skill-first and TS must never
  // embellish prompt text outside the skill — see
  // `feedback_skill_first_authoring` / `project_vd_start_frame_reference_mapping`).
  // This block used to APPEND a TS-authored character-identity directive
  // onto the already-compiled prompt whenever it didn't mention the
  // expected @ImageN character tag — even when the SKILL itself wrote that
  // prompt. That is a code-append and is exactly the violation those rules
  // forbid. Replaced with a fail-closed VALIDATOR: never rewrite the
  // prompt; only detect and report a gap so it stays visible. The prompt
  // dispatched to the provider is `prompt`, byte-identical to the skill output.
  const missingCharacterReferenceTags: string[] = [];
  if (characterItems.length > 0) {
    const productCount = productItems.length > 0 ? productItems.length : 1;
    for (let i = 0; i < characterItems.length; i += 1) {
      const charTag = `@Image${productCount + i + 1}`;
      if (!prompt.includes(charTag))
        missingCharacterReferenceTags.push(charTag);
    }
  }

  const submitted = await reserveAndSubmit({
    db: params.db,
    run: params.run,
    auth: params.auth,
    runtime: params.runtime,
    mediaType: "image",
    // Scoped to this checkpoint's revision (not just the shot) so a retry
    // after a stuck/failed submission gets a fresh credit charge instead of
    // colliding with the prior attempt's idempotency key and silently
    // failing to submit at all.
    unitId: `shot-${params.shotId}-r${checkpoint.revision}`,
    model,
    estimatedCredits: modelCost(model),
    description: `Marketplace staged storyboard image shot ${params.shotId}`,
    request: {
      prompt,
      model,
      aspectRatio: "9:16",
      resolution: "2K",
      outputFormat: "png",
      numImages: 1,
      referenceImageUrls,
      publicUrl: params.runtime.publicUrl ?? undefined,
      extraParams: {
        __origin_surface: "marketplace_auto_review",
        __execution_path: "staged_two_skill_v2",
        __auto_review_run_id: params.run.id,
        __unit_id: `staged-shot-${params.shotId}`,
      },
      auditContext: {
        userId: params.auth.userId,
        tenantId: params.auth.tenantId ?? params.run.tenantId ?? undefined,
        traceId: operationId,
        source: "marketplace_auto_review_staged",
        stage: "image_generation",
      },
    },
  });
  const nextMetadata = setTaskRecord(
    consumed as any,
    `image:${params.shotId}`,
    {
      taskId: submitted.task.id,
      model,
      provider,
      operationId,
      // Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
      // shots 8/9): `status` used to be written ONLY at reconcile success
      // ("completed"), never at dispatch — so `stagedTaskStatus()` returned
      // null for an actively-processing task, the client's `isTaskInFlight()`
      // read that as "nothing in flight", and the panel showed the amber
      // "ระบบส่งงานสร้างภาพค้างอยู่ — กดสร้างใหม่" banner with an ENABLED
      // generate button while the provider was mid-generation. Users read
      // that as "the click did nothing" and clicked again — double-charging
      // credits. "submitted" is one of the client's recognized in-flight
      // values (["pending","processing","submitted"]); reconcile overwrites
      // it with "completed" on success, and the provider-failure path clears
      // the whole record, so this only ever describes a live task.
      status: "submitted",
      submittedAt: new Date().toISOString(),
      creditAmount: submitted.amount,
      creditTransactionId: submitted.transactionId,
      creditIdempotencyKey: submitted.creditIdempotencyKey,
    }
  );
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: nextMetadata,
    status: "waiting_provider",
    currentStage: "image_generation",
    stageIndex: 5,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "image_generation",
    status: "waiting_provider",
    output: {
      shotId: params.shotId,
      taskPending: true,
      ...(missingCharacterReferenceTags.length > 0
        ? {
            statusDetail: {
              state: "prompt_reference_mapping_incomplete",
              severity: "warning",
              reasonCodes: ["staged_prompt_reference_mapping_incomplete"],
              safeMessage: `Prompt ภาพช็อตที่ ${params.shotId} ไม่ได้อ้างอิงแท็กภาพตัวละคร ${missingCharacterReferenceTags.join(", ")} อย่างชัดเจน ระบบจะไม่แก้ไข prompt ให้เอง โปรดตรวจสอบว่า prompt ระบุภาพอ้างอิงตัวละครถูกต้อง`,
              userActionRequired: false,
              retryable: false,
            },
          }
        : {}),
    },
  });
  return nextMetadata;
}

async function reconcileImageProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
  runtime: Runtime;
}) {
  const taskInfo = taskRecord(params.metadata, params.shotId, "image");
  if (!taskInfo?.taskId) return null;
  const token = await resolveStagedUserToken(
    params.runtime.userToken,
    params.auth.userId
  );
  let task: Awaited<ReturnType<typeof getUnifiedMediaTask>>;
  let durableTask:
    | Awaited<ReturnType<typeof ensureMarketplaceAutoReviewMediaUrlDurable>>
    | null = null;
  try {
    task = await getUnifiedMediaTask({
      taskId: taskInfo.taskId,
      userId: params.auth.userId,
      userToken: token,
      tenantId: params.run.tenantId,
      auditContext: {
        userId: params.auth.userId,
        tenantId: params.auth.tenantId ?? params.run.tenantId ?? undefined,
        traceId: `staged-image-poll:${params.run.id}:${params.shotId}`,
        source: "marketplace_auto_review_staged",
        stage: "image_generation",
      },
    });
    durableTask =
      task.status === "completed" && text(task.resultUrl)
        ? await ensureMarketplaceAutoReviewMediaUrlDurable({
            tenantId: params.run.tenantId,
            runId: params.run.id,
            sourceUrl: text(task.resultUrl),
            mediaType: "image",
            purpose: `shot-${params.shotId}`,
            identity: taskInfo.taskId,
          })
        : null;
  } catch (error) {
    const retryHint = getTransientMediaPollRetryHint(error);
    if (!retryHint) throw error;
    // Provider status can be completed while its result CDN or the R2 copy is
    // temporarily slow. Do not mark the provider task failed or refund it:
    // keep the submitted task reference so the durable poll scheduler retries
    // the result transfer on its next pass.
    console.warn(
      `[advanceStagedMarketplaceAutoReviewRun] image result retrieval will retry for run=${params.run.id} shot=${params.shotId} kind=${retryHint.kind} after=${retryHint.retryAfterSeconds}s`
    );
    return params.metadata;
  }
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled") {
    throw new Error(`staged_image_provider_failed:shot:${params.shotId}`);
  }
  const url = text(durableTask?.durableUrl);
  if (!url)
    throw new Error(`staged_image_artifact_missing:shot:${params.shotId}`);
  const artifactHash = buildProductionStableHash({ taskId: task.id, url });
  let next = updateShot(params.metadata, params.shotId, {
    state: "image_result_approved",
    imageArtifactHash: artifactHash,
    imageArtifactUrl: url,
  });
  next = updateTaskRecord(next, `image:${params.shotId}`, {
    status: "completed",
    resultUrl: url,
    completedAt: new Date().toISOString(),
  });
  const stagedPipeline = record(next.stagedPipeline);
  const correctionRequired = record(stagedPipeline.correctionRequired);
  if (
    correctionRequired.stageKey === "image_generation" &&
    Number(correctionRequired.shotId) === params.shotId
  ) {
    next = {
      ...next,
      stagedPipeline: { ...stagedPipeline, correctionRequired: null },
    };
  }
  const imagePrompt = checkpointFor(next, "image_prompt", params.shotId);
  const imageResultCheckpoint = buildStagedCheckpoint({
    checkpointId: `image-result:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
    kind: "image_result",
    shotId: params.shotId,
    revision: params.plan.planRevision,
    contentHash: artifactHash,
    model: requireStagedModel(imagePrompt?.approvedModel, "image"),
    provider: text(imagePrompt?.approvedProvider),
    estimatedCredits: 0,
    referenceManifestHash: params.plan.referenceManifestHash,
    autoApprove: { userId: params.run.userId },
  });
  if (!imageResultCheckpoint.approvedProvider) {
    throw new Error("STAGED_IMAGE_RESULT_PROVIDER_MISSING");
  }
  next = replaceCheckpoint(next, imageResultCheckpoint);
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "storyboard_review",
    stageIndex: 6,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "storyboard_review",
    status: "running",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "image_result_auto_approved",
        severity: "info",
        safeMessage: `ภาพช็อตที่ ${params.shotId} สร้างเสร็จและอนุมัติอัตโนมัติแล้ว`,
        userActionRequired: false,
      },
    },
  });
  return next;
}

async function handleVideoProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shotState = params.metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === params.shotId
  );
  const checkpoint = checkpointFor(
    params.metadata,
    "video_prompt",
    params.shotId
  );
  if (
    !shotState?.imageArtifactUrl ||
    !shotState.imageArtifactHash ||
    !checkpoint
  )
    throw new Error(`checkpoint_not_ready:shot:${params.shotId}`);
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const model = requireStagedModel(checkpoint.approvedModel, "video");
  const provider = text(checkpoint.approvedProvider);
  if (!provider) throw new Error(`STAGED_VIDEO_PROVIDER_REQUIRED:${model}`);
  const expected = checkpointExpectation(checkpoint);
  const durationResolution = resolveStagedVideoDuration(
    model,
    shot.durationSeconds
  );
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...expected,
    model,
    provider,
    estimatedCredits: expected.estimatedCredits,
  });
  if (!guard.ok) throw new Error(guard.reasonCode);
  const prompt = text(
    record(
      params.metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === params.shotId
      )
    ).videoPrompt
  );
  if (
    buildStagedVideoPromptContentHash({
      revision: checkpoint.revision,
      shotId: params.shotId,
      prompt,
      imageArtifactHash: shotState.imageArtifactHash,
    }) !== checkpoint.contentHash
  ) {
    throw new Error(`checkpoint_hash_mismatch:shot:${params.shotId}`);
  }
  const operationId = `staged-video-${params.run.id}-${params.shotId}-${nanoid(8)}`;
  const consumed = await consumeCheckpoint({
    db: params.db,
    run: params.run,
    metadata: params.metadata,
    checkpoint,
    operationId,
  });
  const submitted = await reserveAndSubmit({
    db: params.db,
    run: params.run,
    auth: params.auth,
    runtime: params.runtime,
    mediaType: "video",
    // Scoped to this checkpoint's revision — see the image call site above
    // for why (retry must get a fresh credit charge, not collide with the
    // prior attempt's idempotency key).
    unitId: `shot-${params.shotId}-r${checkpoint.revision}`,
    model,
    estimatedCredits: modelCost(model),
    description: `Marketplace staged storyboard video shot ${params.shotId}`,
    request: {
      prompt,
      model,
      duration: durationResolution.duration,
      aspectRatio: "9:16",
      resolution: resolveVideoResolution(model),
      referenceImageUrls: [shotState.imageArtifactUrl],
      publicUrl: params.runtime.publicUrl ?? undefined,
      extraParams: {
        __origin_surface: "marketplace_auto_review",
        __execution_path: "staged_two_skill_v2",
        __auto_review_run_id: params.run.id,
        __unit_id: `staged-shot-${params.shotId}`,
      },
      auditContext: {
        userId: params.auth.userId,
        tenantId: params.auth.tenantId ?? params.run.tenantId ?? undefined,
        traceId: operationId,
        source: "marketplace_auto_review_staged",
        stage: "video_generation",
      },
    },
  });
  const next = setTaskRecord(consumed as any, `video:${params.shotId}`, {
    taskId: submitted.task.id,
    model,
    provider,
    operationId,
    // Same in-flight visibility fix as the image dispatch above (see the
    // comment there) — without this the client sees a null status while the
    // video renders and offers a second, double-charging dispatch.
    status: "submitted",
    submittedAt: new Date().toISOString(),
    creditAmount: submitted.amount,
    creditTransactionId: submitted.transactionId,
    creditIdempotencyKey: submitted.creditIdempotencyKey,
  });
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next,
    status: "waiting_provider",
    currentStage: "video_generation",
    stageIndex: 7,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    status: "waiting_provider",
    output: {
      shotId: params.shotId,
      taskPending: true,
    },
  });
  return next;
}

async function reconcileVideoProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
  runtime: Runtime;
}) {
  const taskInfo = taskRecord(params.metadata, params.shotId, "video");
  if (!taskInfo?.taskId) return null;
  const token = await resolveStagedUserToken(
    params.runtime.userToken,
    params.auth.userId
  );
  const task = await getUnifiedMediaTask({
    taskId: taskInfo.taskId,
    userId: params.auth.userId,
    userToken: token,
    tenantId: params.run.tenantId,
    auditContext: {
      userId: params.auth.userId,
      tenantId: params.auth.tenantId ?? params.run.tenantId ?? undefined,
      traceId: `staged-video-poll:${params.run.id}:${params.shotId}`,
      source: "marketplace_auto_review_staged",
      stage: "video_generation",
    },
  });
  const durableTask =
    task.status === "completed" && text(task.resultUrl)
      ? await ensureMarketplaceAutoReviewMediaUrlDurable({
          tenantId: params.run.tenantId,
          runId: params.run.id,
          sourceUrl: text(task.resultUrl),
          mediaType: "video",
          purpose: `shot-${params.shotId}`,
          identity: taskInfo.taskId,
        })
      : null;
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled")
    throw new Error(`staged_video_provider_failed:shot:${params.shotId}`);
  const url = text(durableTask?.durableUrl);
  if (!url)
    throw new Error(`staged_video_artifact_missing:shot:${params.shotId}`);
  const hash = buildProductionStableHash({ taskId: task.id, url });
  let next = {
    ...updateShot(params.metadata, params.shotId, {
      state: "video_completed",
      videoArtifactHash: hash,
      videoArtifactUrl: url,
    }),
    videoClipUrls: params.plan.shots.map(shot => {
      const current = params.metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === shot.shotId
      );
      return shot.shotId === params.shotId
        ? url
        : text(record(current).videoArtifactUrl);
    }),
  };
  next = updateTaskRecord(next, `video:${params.shotId}`, {
    status: "completed",
    resultUrl: url,
    completedAt: new Date().toISOString(),
  });
  const videoPromptCheckpoint = checkpointFor(
    next,
    "video_prompt",
    params.shotId
  );
  next = replaceCheckpoint(
    next as any,
    buildStagedCheckpoint({
      checkpointId: `video-result:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
      kind: "video_result",
      shotId: params.shotId,
      revision: params.plan.planRevision,
      contentHash: hash,
      model: requireStagedModel(videoPromptCheckpoint?.approvedModel, "video"),
      provider: text(videoPromptCheckpoint?.approvedProvider),
      estimatedCredits: 0,
      referenceManifestHash: params.plan.referenceManifestHash,
      autoApprove: { userId: params.run.userId },
    })
  ) as any;
  if (
    !record(checkpointFor(next, "video_result", params.shotId)).approvedProvider
  ) {
    throw new Error("STAGED_VIDEO_RESULT_PROVIDER_MISSING");
  }
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "video_generation",
    stageIndex: 7,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    status: "blocked_needs_user",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "awaiting_video_result_review",
        reasonCodes: ["video_result_approval_required"],
        safeMessage: `ตรวจผลวิดีโอช็อตที่ ${params.shotId} ก่อนทำงานเสียงหรือช็อตถัดไป`,
        nextAction: `ตรวจผลวิดีโอช็อตที่ ${params.shotId} แล้วกดยอมรับหรือปฏิเสธ`,
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

function allShotsHave(params: {
  metadata: StagedSequentialStoryboardMetadataV1;
  state: string;
}) {
  return params.metadata.stagedSequentialStoryboard.shots.every(
    shot => shot.state === params.state
  );
}

function allShotCheckpointsHave(
  metadata: StagedSequentialStoryboardMetadataV1,
  kind: HumanApprovalCheckpointV1["kind"],
  state: HumanApprovalCheckpointV1["state"]
) {
  const checkpoints =
    metadata.stagedSequentialStoryboard.reviewCheckpoints.filter(
      checkpoint =>
        checkpoint.kind === kind &&
        checkpoint.shotId !== null &&
        checkpoint.state !== "superseded"
    );
  // Additive (feature/marketplace-flexible-shots): shot count is variable
  // now, so the expected checkpoint count is whatever the persisted plan
  // actually has, not a hardcoded 9.
  return (
    checkpoints.length === metadata.stagedSequentialStoryboard.shots.length &&
    checkpoints.every(checkpoint => checkpoint.state === state)
  );
}

function allShotsHaveImageArtifacts(
  metadata: StagedSequentialStoryboardMetadataV1
) {
  return metadata.stagedSequentialStoryboard.shots.every(
    shot =>
      Boolean(shot.imageArtifactHash?.trim() && shot.imageArtifactUrl?.trim())
  );
}

function autoApproveAvailableImageResults(
  metadata: StagedSequentialStoryboardMetadataV1,
  userId: number
) {
  const imageHashes = new Map(
    metadata.stagedSequentialStoryboard.shots
      .filter(
        shot => shot.imageArtifactHash?.trim() && shot.imageArtifactUrl?.trim()
      )
      .map(shot => [shot.shotId, shot.imageArtifactHash])
  );
  const approvedAt = new Date().toISOString();
  let changed = false;
  const shots = metadata.stagedSequentialStoryboard.shots.map(shot => {
    if (
      !imageHashes.has(shot.shotId) ||
      shot.state !== "image_result_awaiting"
    ) {
      return shot;
    }
    changed = true;
    return { ...shot, state: "image_result_approved" };
  });
  const reviewCheckpoints =
    metadata.stagedSequentialStoryboard.reviewCheckpoints.map(checkpoint => {
      const imageHash = imageHashes.get(checkpoint.shotId ?? -1);
      if (
        checkpoint.kind !== "image_result" ||
        checkpoint.state === "approved" ||
        checkpoint.state === "consumed" ||
        checkpoint.state === "superseded" ||
        !imageHash ||
        checkpoint.contentHash !== imageHash
      ) {
        return checkpoint;
      }
      changed = true;
      return {
        ...checkpoint,
        state: "approved" as const,
        approvedHash: checkpoint.contentHash,
        approvedByUserId: userId,
        approvedAt,
        rejectionReasonCode: null,
      };
    });
  return changed
    ? {
        ...metadata,
        stagedSequentialStoryboard: {
          ...metadata.stagedSequentialStoryboard,
          shots,
          reviewCheckpoints,
        },
      }
    : null;
}

async function createFinalAssemblyCheckpoint(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
}) {
  const assembly = {
    planRevision: params.plan.planRevision,
    shots: params.metadata.stagedSequentialStoryboard.shots.map(shot => ({
      shotId: shot.shotId,
      imageArtifactHash: shot.imageArtifactHash,
      videoArtifactHash: shot.videoArtifactHash,
      dialogue: shot.dialogue,
    })),
    audio: {
      plan: record(params.metadata).stagedPipeline.audioPlan,
      artifactHash: text(record(params.metadata).stagedPipeline.audioUrl)
        ? buildProductionStableHash({
            audioUrl: text(record(params.metadata).stagedPipeline.audioUrl),
          })
        : null,
    },
    includeAudio: text(record(params.metadata).resolvedAudioStrategy) !== "silent",
  };
  const hash = buildStagedFinalAssemblyHash(assembly);
  let next = {
    ...params.metadata,
    stagedPipeline: {
      ...record(params.metadata).stagedPipeline,
      finalAssembly: { ...assembly, contentHash: hash },
    },
  };
  next = replaceCheckpoint(
    next,
    buildStagedCheckpoint({
      checkpointId: `final-assembly:${params.run.id}:r${params.plan.planRevision}`,
      kind: "final_assembly",
      revision: params.plan.planRevision,
      contentHash: hash,
      model: "remotion-render",
      provider: "remotion",
      estimatedCredits:
        params.run.outputMode === "storyboard_images"
          ? 0
          : Number(process.env.MARKETPLACE_AUTO_REVIEW_RENDER_CREDITS ?? 10) ||
            10,
      referenceManifestHash: params.plan.referenceManifestHash,
      autoApprove: { userId: params.run.userId },
    })
  ) as any;
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "render",
    stageIndex: 10,
  });
  const isStoryboardImages = params.run.outputMode === "storyboard_images";
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "render",
    status: isStoryboardImages ? "running" : "blocked_needs_user",
    output: {
      finalAssembly: record(next).stagedPipeline.finalAssembly,
      statusDetail: {
        state: isStoryboardImages
          ? "image_assembly_auto_approved"
          : "awaiting_final_assembly_review",
        severity: "info",
        ...(isStoryboardImages
          ? {
              safeMessage: "ภาพสตอรีบอร์ดผ่านการอนุมัติและประกอบอัตโนมัติแล้ว",
              userActionRequired: false,
            }
          : {
              reasonCodes: ["final_assembly_approval_required"],
              safeMessage:
                "ตรวจและยืนยันการประกอบก่อนใช้เครดิตเรนเดอร์และบันทึก Library",
              nextAction:
                "ตรวจลำดับภาพ วิดีโอ เสียง และคำเตือน แล้วกดยืนยันการประกอบ",
              userActionRequired: true,
              retryable: true,
            }),
      },
    },
  });
  return next;
}

export async function advanceStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  targetShotIds?: number[];
  reconcileOnly?: boolean;
}): Promise<{ run: MarketplaceAutoReviewRun; finalAssemblyApproved: boolean }> {
  const { plan, metadata: initialMetadata } = planAndMetadataFromRun(
    params.run
  );
  // An advance queued during initialization can arrive while the user
  // is still choosing a concept. The persisted draft already shows that state.
  if (
    params.targetShotIds === undefined &&
    !params.reconcileOnly &&
    isAwaitingStagedStoryConceptSelection(initialMetadata)
  ) {
    return { run: params.run, finalAssemblyApproved: false };
  }
  if (
    plan.shots.length === 0 ||
    (plan.conceptOptions?.length && !plan.selectedConceptId)
  ) {
    throw new Error("STAGED_STORY_CONCEPT_SELECTION_REQUIRED");
  }
  let metadata = initialMetadata;
  let currentRun = params.run;
  if (!StagedSequentialStoryboardMetadataV1Schema.safeParse(metadata).success) {
    throw new Error("staged_state_drift");
  }
  const autoApprovedImages = autoApproveAvailableImageResults(
    metadata,
    params.run.userId
  );
  if (autoApprovedImages) {
    metadata = autoApprovedImages as typeof metadata;
    currentRun = await persistRun({
      db: params.db,
      run: currentRun,
      metadata: metadata as any,
      expectedUpdatedAt: currentRun.updatedAt,
      status: "running",
      currentStage: params.run.currentStage ?? "storyboard_review",
      stageIndex: params.run.stageIndex ?? 6,
    });
    await upsertStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "storyboard_review",
      status: "running",
      output: {
        statusDetail: {
          state: "image_results_auto_approved",
          safeMessage: "ภาพที่สร้างเสร็จแล้วได้รับการอนุมัติอัตโนมัติ",
          userActionRequired: false,
        },
      },
    });
  }
  const advanceShots = selectMarketplaceAutoReviewTargetShots(
    plan.shots,
    params.targetShotIds
  );
  if (params.reconcileOnly && params.targetShotIds === undefined) {
    throw new Error("staged_provider_reconciliation_requires_target_shots");
  }
  const storyCheckpoint = checkpointFor(metadata, "story_plan");
  const storyPlanNeedsReview =
    !storyCheckpoint ||
    storyCheckpoint.state === "awaiting" ||
    storyCheckpoint.state === "rejected" ||
    storyCheckpoint.state === "superseded";
  // A shot-scoped advance is either an explicit media dispatch (the
  // checkpoint carries mediaDispatchIntent) or a poll for an existing
  // provider task. Both are independent of later story edits. The loop below
  // requires explicit intent before creating a task and reconciles a taskId
  // before considering dispatch, so a poll cannot submit duplicate media.
  if (storyPlanNeedsReview && params.targetShotIds === undefined) {
    const advanceAnchors = record(
      record(params.run.metadataJson).referenceAnchors
    );
    const advanceAdherence = assessStagedPlanAdherence(plan, {
      storytellingStructure:
        typeof advanceAnchors.storytellingStructure === "string"
          ? advanceAnchors.storytellingStructure
          : undefined,
      reviewTone:
        typeof advanceAnchors.reviewTone === "string"
          ? advanceAnchors.reviewTone
          : undefined,
    });
    await upsertStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "concept_story",
      status: "blocked_needs_user",
      output: {
        statusDetail: {
          state: "awaiting_story_plan_review",
          safeMessage: "ตรวจเนื้อเรื่องก่อน ระบบยังไม่ใช้เครดิตสร้างภาพ",
          userActionRequired: true,
          ...(advanceAdherence.warnings.length > 0
            ? { reasonCodes: advanceAdherence.warnings }
            : {}),
        },
      },
    });
    return { run: params.run, finalAssemblyApproved: false };
  }
  const hasUncompiledImagePrompt = advanceShots.some(shot => {
    const shotState = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    return (
      !checkpointFor(metadata, "image_prompt", shot.shotId) ||
      !String(shotState?.imagePrompt ?? "").trim()
    );
  });
  if (
    !params.reconcileOnly &&
    storyCheckpoint.state === "approved" &&
    hasUncompiledImagePrompt
  ) {
    metadata = await compileImagePromptCheckpoints({
      db: params.db,
      run: currentRun,
      metadata,
      plan,
      runtime: params.runtime,
      auth: params.auth,
    });
    return { run: params.run, finalAssemblyApproved: false };
  }

  for (const shot of advanceShots) {
    const imageTask = taskRecord(metadata, shot.shotId, "image");
    if (
      imageTask?.taskId &&
      !["failed", "cancelled"].includes(String(imageTask.status ?? "")) &&
      !metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === shot.shotId
      )?.imageArtifactHash
    ) {
      try {
        const reconciled = await reconcileImageProvider({
          db: params.db,
          run: params.run,
          auth: params.auth,
          metadata,
          plan,
          shotId: shot.shotId,
          runtime: params.runtime,
        });
        if (reconciled) metadata = reconciled as any;
      } catch (error) {
        if (isMarketplaceAutoReviewStateWriteConflict(error)) throw error;
        // A provider failure/throw for THIS shot must never abort the pass
        // for shots after it (see the extensive comments in this loop about
        // per-shot independence) — refund any spent credit for this stage,
        // record a per-shot correction marker for user-visible feedback, and
        // move on. See recordStagedProviderFailureAndRefund's own doc
        // comment for why this shares logic with the top-level catch in
        // advanceMarketplaceAutoReviewStagedArchitecture.
        console.warn(
          `[advanceStagedMarketplaceAutoReviewRun] reconcileImageProvider failed for run=${params.run.id} shot=${shot.shotId}: ${error instanceof Error ? error.message : String(error)}`
        );
        metadata = (await recordStagedProviderFailureAndRefund({
          db: params.db,
          run: params.run,
          auth: params.auth,
          error,
        })) as any;
      }
      // Each shot advances at most one step per pass (dispatch, reconcile,
      // or auto-approve) — move on to the next shot instead of aborting the
      // whole pass, so siblings aren't serialized behind this one.
      continue;
    }
    const shotState = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    let imagePromptCheckpoint = checkpointFor(
      metadata,
      "image_prompt",
      shot.shotId
    );
    // `consumeCheckpoint` runs before provider reference preparation and
    // submission. If either fails, the approved checkpoint stays consumed
    // while no provider task exists. A later sweep must not consume it again
    // (which only replaces the original shot failure with
    // `checkpoint_consumed`); the shot's repair button creates a fresh
    // checkpoint and dispatches it through the Worker Jobs path.
    const imageCheckpointConsumed = Boolean(
      imagePromptCheckpoint?.consumedAt ||
      imagePromptCheckpoint?.consumedByOperationId
    );
    if (
      imagePromptCheckpoint?.state === "approved" &&
      hasExplicitStagedMediaDispatchIntent(imagePromptCheckpoint) &&
      !params.reconcileOnly &&
      !imageTask?.taskId &&
      !shotState?.imageArtifactHash &&
      !imageCheckpointConsumed
    ) {
      try {
        metadata = (await handleImageProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
        if (isMarketplaceAutoReviewStateWriteConflict(error)) throw error;
        // Preserve the `:shot:<id>` suffix so recordStagedProviderFailureAndRefund
        // (which parses shotId/stageKey out of the message) attributes the
        // refund/correction to this shot specifically, then move on instead
        // of throwing — a dispatch failure for this shot must never block
        // sibling shots from being reconciled or dispatched.
        const wrapped = new Error(
          `${error instanceof Error ? error.message : "staged_image_provider_failed"}:shot:${shot.shotId}`
        );
        console.warn(
          `[advanceStagedMarketplaceAutoReviewRun] handleImageProvider failed for run=${params.run.id} shot=${shot.shotId}: ${wrapped.message}`
        );
        metadata = (await recordStagedProviderFailureAndRefund({
          db: params.db,
          run: params.run,
          auth: params.auth,
          error: wrapped,
        })) as any;
      }
      continue;
    }
    // Video prompts are generated only by the explicit per-shot prompt
    // operation. Advancing/reconciling approved images must never start
    // additional skill calls or spend credits for other shots.
    const videoTask = taskRecord(metadata, shot.shotId, "video");
    if (
      videoTask?.taskId &&
      !["failed", "cancelled"].includes(String(videoTask.status ?? "")) &&
      !shotState?.videoArtifactHash
    ) {
      try {
        const reconciled = await reconcileVideoProvider({
          db: params.db,
          run: params.run,
          auth: params.auth,
          metadata,
          plan,
          shotId: shot.shotId,
          runtime: params.runtime,
        });
        if (reconciled) metadata = reconciled as any;
      } catch (error) {
        if (isMarketplaceAutoReviewStateWriteConflict(error)) throw error;
        // This is the exact throw that reproduced the live production bug:
        // shot 1's dead failed video task made every sweep pass abort before
        // shots 2-9 (fully independent, ready to dispatch) were ever looked
        // at. Catch here so it never escapes the loop.
        console.warn(
          `[advanceStagedMarketplaceAutoReviewRun] reconcileVideoProvider failed for run=${params.run.id} shot=${shot.shotId}: ${error instanceof Error ? error.message : String(error)}`
        );
        metadata = (await recordStagedProviderFailureAndRefund({
          db: params.db,
          run: params.run,
          auth: params.auth,
          error,
        })) as any;
      }
      continue;
    }
    let videoPromptCheckpoint = checkpointFor(
      metadata,
      "video_prompt",
      shot.shotId
    );
    // Match the image guard above: don't repeatedly re-consume a checkpoint
    // whose previous provider hand-off failed before a task id was recorded.
    const videoCheckpointConsumed = Boolean(
      videoPromptCheckpoint?.consumedAt ||
      videoPromptCheckpoint?.consumedByOperationId
    );
    if (
      videoPromptCheckpoint?.state === "approved" &&
      hasExplicitStagedMediaDispatchIntent(videoPromptCheckpoint) &&
      !params.reconcileOnly &&
      !videoTask?.taskId &&
      !shotState?.videoArtifactHash &&
      !videoCheckpointConsumed
    ) {
      if (!shotState?.imageArtifactUrl) {
        await upsertStage({
          db: params.db,
          runId: params.run.id,
          stageKey: "video_generation",
          status: "running",
          output: {
            shotId: shot.shotId,
            statusDetail: {
              state: "waiting_for_image_artifact",
              safeMessage: `รอภาพช็อตที่ ${shot.shotId} สร้างเสร็จก่อนเริ่มสร้างวิดีโอ`,
              userActionRequired: false,
              retryable: true,
            },
          },
        });
        continue;
      }
      try {
        metadata = (await handleVideoProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
        if (isMarketplaceAutoReviewStateWriteConflict(error)) throw error;
        // Same pattern as the handleImageProvider catch above: preserve the
        // `:shot:<id>` suffix for correct correction attribution, then move
        // on instead of throwing — never let one shot's dispatch failure
        // block sibling shots.
        const wrapped = new Error(
          `${error instanceof Error ? error.message : "staged_video_provider_failed"}:shot:${shot.shotId}`
        );
        console.warn(
          `[advanceStagedMarketplaceAutoReviewRun] handleVideoProvider failed for run=${params.run.id} shot=${shot.shotId}: ${wrapped.message}`
        );
        metadata = (await recordStagedProviderFailureAndRefund({
          db: params.db,
          run: params.run,
          auth: params.auth,
          error: wrapped,
        })) as any;
      }
      continue;
    }
    if (params.reconcileOnly) continue;
    let videoResultCheckpoint = checkpointFor(
      metadata,
      "video_result",
      shot.shotId
    );
    if (!videoResultCheckpoint && shotState?.videoArtifactHash) {
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "video_generation",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "video_result_checkpoint_missing",
            severity: "error",
            reasonCodes: ["staged_video_result_checkpoint_missing"],
            safeMessage: `พบไฟล์วิดีโอช็อตที่ ${shot.shotId} แต่ไม่มี checkpoint สำหรับตรวจผล ระบบจึงไม่สร้างสถานะอนุมัติแทนให้อัตโนมัติ`,
            userActionRequired: true,
            retryable: false,
          },
        },
      });
      throw new Error(
        `STAGED_VIDEO_RESULT_CHECKPOINT_MISSING:shot-${shot.shotId}`
      );
    }
    if (videoResultCheckpoint && videoResultCheckpoint.state !== "approved") {
      // rejected or superseded: an explicit stop for this shot only — do
      // not auto-resolve it, but move on so sibling shots keep progressing
      // instead of being serialized behind this one.
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "video_generation",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_video_result_review",
            safeMessage: `ตรวจผลวิดีโอช็อตที่ ${shot.shotId} ก่อนทำงานต่อ`,
            userActionRequired: true,
            retryable: true,
          },
        },
      });
      continue;
    }
  }

  // A recovery dispatched for one shot must not also run final assembly or
  // advance sibling checkpoints as a side effect of that same worker job.
  if (params.targetShotIds !== undefined) {
    return { run: params.run, finalAssemblyApproved: false };
  }

  if (params.run.outputMode === "storyboard_images") {
    if (!allShotsHaveImageArtifacts(metadata)) {
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (!checkpointFor(metadata, "final_assembly")) {
      metadata = await createFinalAssemblyCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        plan,
      });
    }
    let finalImageAssemblyCheckpoint = checkpointFor(
      metadata,
      "final_assembly"
    );
    if (
      finalImageAssemblyCheckpoint &&
      finalImageAssemblyCheckpoint.state !== "approved" &&
      finalImageAssemblyCheckpoint.state !== "consumed"
    ) {
      finalImageAssemblyCheckpoint = {
        ...finalImageAssemblyCheckpoint,
        state: "approved",
        approvedHash: finalImageAssemblyCheckpoint.contentHash,
        approvedByUserId: params.run.userId,
        approvedAt: new Date().toISOString(),
        rejectionReasonCode: null,
      };
      metadata = replaceCheckpoint(
        metadata,
        finalImageAssemblyCheckpoint
      ) as typeof metadata;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "storyboard_review",
        stageIndex: 6,
      });
    }
    if (finalImageAssemblyCheckpoint?.state === "approved") {
      const imageAssembly = finalAssemblyFor(metadata, plan);
      if (
        buildStagedFinalAssemblyHash(imageAssembly) !==
        finalImageAssemblyCheckpoint.contentHash
      ) {
        throw new Error("staged_final_assembly_hash_mismatch:assembly");
      }
      metadata = (await consumeCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        checkpoint: finalImageAssemblyCheckpoint,
        operationId: `staged-final-image-assembly-${params.run.id}-${nanoid(8)}`,
      })) as typeof metadata;
      const imageUrls = imageAssembly.shots
        .map(
          (assemblyShot: any) =>
            metadata.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === assemblyShot.shotId
            )?.imageArtifactUrl
        )
        .filter(Boolean);
      const completed = await persistRun({
        db: params.db,
        run: params.run,
        metadata,
        status: "completed",
        currentStage: "storyboard_review",
        stageIndex: 6,
        resultJson: {
          outputMode: "storyboard_images",
          imageUrls,
          mediaHistorySource: "staged_provider_media_tasks",
          finalAssemblyCheckpointId: finalImageAssemblyCheckpoint.checkpointId,
        },
        completedAt: new Date(),
      });
      return { run: completed, finalAssemblyApproved: true };
    }
    return { run: params.run, finalAssemblyApproved: false };
  }

  if (
    !allShotsHave({ metadata, state: "video_completed" }) ||
    !allShotCheckpointsHave(metadata, "video_result", "approved")
  )
    return { run: params.run, finalAssemblyApproved: false };
  let resolvedAudioStrategy = text(record(metadata).resolvedAudioStrategy);
  if (
    resolvedAudioStrategy !== "silent" &&
    resolvedAudioStrategy !== "native_video_audio" &&
    resolvedAudioStrategy !== "separate_tts_voiceover"
  ) {
    throw new Error("STAGED_RESOLVED_AUDIO_STRATEGY_REQUIRED");
  }
  const safeVoiceoverText = plan.shots
    .map(shot => removeStagedMinorDialogueLines(shot.dialogue, plan.cast))
    .filter(Boolean)
    .join(" ");
  if (resolvedAudioStrategy === "separate_tts_voiceover" && !safeVoiceoverText) {
    // There is no adult dialogue left to synthesize. Keep the clip silent
    // instead of sending an under-18 line to TTS or failing on empty text.
    resolvedAudioStrategy = "silent";
    metadata = { ...metadata, resolvedAudioStrategy } as typeof metadata;
  }
  if (resolvedAudioStrategy === "separate_tts_voiceover") {
    const audioCheckpoint = checkpointFor(metadata, "audio_plan");
    if (!audioCheckpoint) {
      const audioLanguage = requireStagedLanguagePlanFromMetadata(
        metadata as Record<string, any>
      ).dialogueLanguage;
      const audioPlan = buildStagedAudioPlan({
        text: safeVoiceoverText,
        language: audioLanguage,
        model: STAGED_AUDIO_MODEL,
        provider: modelProvider(STAGED_AUDIO_MODEL),
        estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
      });
      metadata = {
        ...metadata,
        stagedPipeline: { ...record(metadata).stagedPipeline, audioPlan },
      } as any;
      metadata = replaceCheckpoint(
        metadata,
        buildStagedCheckpoint({
          checkpointId: `audio-plan:${params.run.id}:r${plan.planRevision}`,
          kind: "audio_plan",
          revision: plan.planRevision,
          contentHash: buildProductionStableHash(audioPlan),
          model: STAGED_AUDIO_MODEL,
          provider: modelProvider(STAGED_AUDIO_MODEL),
          estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
          referenceManifestHash: plan.referenceManifestHash,
          autoApprove: { userId: params.run.userId },
        })
      ) as any;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "audio_generation",
        status: "blocked_needs_user",
        output: {
          statusDetail: {
            state: "awaiting_audio_plan_review",
            safeMessage: "ตรวจสอบและยืนยันเสียงก่อนใช้เครดิตเสียง",
            userActionRequired: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    const audioTask = taskRecord(metadata, 0, "audio");
    if (audioTask?.taskId && !record(metadata).stagedPipeline.audioUrl) {
      const token = await resolveStagedUserToken(
        params.runtime.userToken,
        params.auth.userId
      );
      const task = await mediaGenerationService.getTask(
        audioTask.taskId,
        token,
        {
          userId: params.auth.userId,
          tenantId: params.auth.tenantId ?? params.run.tenantId ?? undefined,
          traceId: `staged-audio-poll:${params.run.id}`,
          source: "marketplace_auto_review_staged",
          stage: "audio_generation",
        }
      );
      if (task.status === "pending" || task.status === "processing")
        return { run: params.run, finalAssemblyApproved: false };
      if (task.status !== "completed" || !text(task.resultUrl))
        throw new Error("staged_audio_provider_failed:audio");
      metadata = {
        ...metadata,
        audioUrl: text(task.resultUrl),
        stagedPipeline: {
          ...record(metadata).stagedPipeline,
          audioUrl: text(task.resultUrl),
        },
      } as any;
      metadata = updateTaskRecord(metadata as any, "audio:0", {
        status: "completed",
        resultUrl: text(task.resultUrl),
        completedAt: new Date().toISOString(),
      }) as unknown as typeof metadata;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (audioCheckpoint.state === "awaiting")
      return { run: params.run, finalAssemblyApproved: false };
    if (audioCheckpoint.state === "approved" && !audioTask?.taskId) {
      const currentAudioPlan = record(metadata).stagedPipeline.audioPlan;
      if (
        buildStagedFinalAssemblyHash(currentAudioPlan) !==
        audioCheckpoint.contentHash
      ) {
        throw new Error("staged_audio_plan_hash_mismatch:audio");
      }
      const operationId = `staged-audio-${params.run.id}-${nanoid(8)}`;
      metadata = (await consumeCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        checkpoint: audioCheckpoint,
        operationId,
      })) as typeof metadata;
      const audioPlan = record(metadata).stagedPipeline.audioPlan;
      let submitted;
      try {
        submitted = await reserveAndSubmit({
          db: params.db,
          run: params.run,
          auth: params.auth,
          runtime: params.runtime,
          mediaType: "audio",
          // Scoped to this checkpoint's revision — see the image call site
          // in handleImageProvider for why (retry must get a fresh credit
          // charge, not collide with the prior attempt's idempotency key).
          unitId: `full-voiceover-r${audioCheckpoint.revision}`,
          model: STAGED_AUDIO_MODEL,
          estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
          description: "Marketplace staged storyboard voiceover",
          request: {
            text: audioPlan.text,
            model: STAGED_AUDIO_MODEL,
            voice: "alloy",
            speed: 1,
            auditContext: {
              userId: params.auth.userId,
              tenantId:
                params.auth.tenantId ?? params.run.tenantId ?? undefined,
              traceId: operationId,
              source: "marketplace_auto_review_staged",
              stage: "audio_generation",
            },
          },
        });
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : "staged_audio_provider_failed"}:audio`
        );
      }
      metadata = setTaskRecord(metadata as any, "audio:0", {
        taskId: submitted.task.id,
        operationId,
        // Same in-flight visibility fix as the image/video dispatches (see
        // handleImageProvider's comment).
        status: "submitted",
        submittedAt: new Date().toISOString(),
        creditAmount: submitted.amount,
        creditTransactionId: submitted.transactionId,
        creditIdempotencyKey: submitted.creditIdempotencyKey,
      }) as unknown as typeof metadata;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata,
        status: "waiting_provider",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
  }
  if (!checkpointFor(metadata, "final_assembly")) {
    metadata = await createFinalAssemblyCheckpoint({
      db: params.db,
      run: params.run,
      metadata,
      plan,
    });
    return { run: params.run, finalAssemblyApproved: false };
  }
  const finalCheckpoint = checkpointFor(metadata, "final_assembly");
  if (finalCheckpoint?.state === "awaiting")
    return { run: params.run, finalAssemblyApproved: false };
  // An ALREADY-CONSUMED final_assembly checkpoint is still "approved" — the
  // assembly is settled and the caller may reconcile an in-flight render, but
  // there is nothing left to consume. Re-running the consume below throws
  // `checkpoint_consumed`, which `recordStagedProviderFailureAndRefund`
  // then mis-attributes to `image_generation` (the message carries no
  // stage keyword), parking the whole run in a bogus
  // "correction_required / checkpoint_consumed" state.
  //
  // This was latent until the final render became user-triggered
  // (2026-07-30): before that, the very first pass consumed the checkpoint
  // AND submitted the render in one go, so no later pass ever re-entered
  // this branch with a consumed checkpoint. Now the run keeps advancing
  // while it waits for the user to press render, and re-entered it on every
  // 60s tick.
  if (finalCheckpoint?.state === "approved" && finalCheckpoint.consumedAt) {
    return { run: params.run, finalAssemblyApproved: true };
  }
  if (finalCheckpoint?.state === "approved") {
    const currentAssembly = finalAssemblyFor(metadata, plan);
    if (
      buildStagedFinalAssemblyHash(currentAssembly) !==
      finalCheckpoint.contentHash
    ) {
      throw new Error("staged_final_assembly_hash_mismatch:assembly");
    }
    metadata = (await consumeCheckpoint({
      db: params.db,
      run: params.run,
      metadata,
      checkpoint: finalCheckpoint,
      operationId: `staged-final-assembly-${params.run.id}-${nanoid(8)}`,
    })) as typeof metadata;
    metadata = {
      ...metadata,
      videoClipUrls: currentAssembly.shots
        .map(
          (assemblyShot: any) =>
            metadata.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === assemblyShot.shotId
            )?.videoArtifactUrl
        )
        .filter(Boolean),
    } as typeof metadata;
    await persistRun({
      db: params.db,
      run: params.run,
      metadata,
      status: "running",
      currentStage: "render",
      stageIndex: 10,
    });
    return { run: params.run, finalAssemblyApproved: true };
  }
  return { run: params.run, finalAssemblyApproved: false };
}

export function stagedCheckpointExpectationForTest(
  checkpoint: HumanApprovalCheckpointV1
) {
  return checkpointExpectation(checkpoint);
}

// Test-only re-exports of the two-character-conversation helpers
// (`deriveStagedCastFromManifest`/`resolveStagedVideoDuration` stay local to
// this module for every real call site) — same thin-wrapper convention as
// `stagedCheckpointExpectationForTest` above, so unit tests can exercise
// these pure functions directly instead of only indirectly through
// `planAndMetadataFromRun`/`handleVideoProvider`.
export function deriveStagedCastFromManifestForTest(
  manifest: Parameters<typeof deriveStagedCastFromManifest>[0]
): ReturnType<typeof deriveStagedCastFromManifest> {
  return deriveStagedCastFromManifest(manifest);
}

export function resolveStagedVideoDurationForTest(
  modelId: string,
  requestedSeconds: number
): ReturnType<typeof resolveStagedVideoDuration> {
  return resolveStagedVideoDuration(modelId, requestedSeconds);
}

export function resolveStagedModelDurationOptionsForTest(
  model: Parameters<typeof resolveStagedModelDurationOptions>[0]
): number[] {
  return resolveStagedModelDurationOptions(model);
}
