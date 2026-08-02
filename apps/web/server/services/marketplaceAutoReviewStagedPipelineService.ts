import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { getDb } from "../db";
import { storagePut } from "../storage";

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
import {
  assessStagedPlanAdherence,
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
  generateStagedStoryArcPlanWithLLM,
  type StagedCastMember,
  type StagedStoryArcLanguagePlan,
  type StagedStoryArcPlan,
} from "./marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  compileStagedImagePrompt,
  compileStagedVideoPrompt,
} from "./marketplaceAutoReviewStagedPromptCompiler";
// Safe as a normal top-level import: `productReviewSequentialStoryboardSkillRunner.ts`
// does not import anything from this module, so there is no circular edge
// here (unlike `buildStagedSingleShotRefreshInput` below, which does need a
// lazy import — see the comment on that call site).
import { refreshSequentialShotPromptWithSkill } from "./productReviewSequentialStoryboardSkillRunner";
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
import { mediaGenerationService } from "./mediaGenerationService";
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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Auth = { userId: number; tenantId?: string };
type Runtime = { userToken?: string | null; publicUrl?: string | null };

const STAGED_IMAGE_MODEL = "google-banana-2";
const STAGED_VIDEO_MODEL = "veo3/generate-veo-3-video-lite";
const STAGED_AUDIO_MODEL = "elevenlabs-tts";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
        userId: userId,
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

function stagedLanguagePlanFromMetadata(
  metadata: Record<string, any>
): StagedStoryArcLanguagePlan {
  const languagePlan = record(
    record(metadata.sequentialStoryboard).languagePlan
  );
  return {
    summaryLanguage: languagePlan.summaryLanguage === "en" ? "en" : "th",
    dialogueLanguage: languagePlan.dialogueLanguage === "en" ? "en" : "th",
    promptLanguage: languagePlan.promptLanguage === "th" ? "th" : "en",
  };
}

export function modelProvider(modelId: string): string {
  // `getModelById` is the DB-merged registry (same source the model-picker
  // dropdown and reference-image caps use); `mediaGenerationService.getModel`
  // only knows the older hardcoded catalog and is missing newer DB-only
  // models entirely (e.g. gpt-image-2-*), which made every caller of this
  // function fall through to the generic "media-provider" placeholder for
  // them — including `isKieAiProvider`, which then skipped Kie.ai-specific
  // reference-image handling for those models.
  return (
    text(getModelById(modelId)?.provider) ||
    text(mediaGenerationService.getModel(modelId)?.provider) ||
    "media-provider"
  );
}

export function modelCost(modelId: string): number {
  const registryValue = Number(getModelById(modelId)?.creditCost);
  if (Number.isFinite(registryValue) && registryValue >= 0) return registryValue;
  const value = Number(mediaGenerationService.getModel(modelId)?.creditCost);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

// Video dispatch used to hardcode `resolution: "1080p"` for every model.
// Kie.ai rejects the whole task submission for models whose config doesn't
// list 1080p as a supported option (e.g. grok-imagine-video-1-5-preview only
// supports 480p/720p — confirmed via a live "resolution is not within the
// range of allowed options" failure). Prefer 1080p when the model actually
// supports it, otherwise fall back to whatever its highest supported option
// is; models with no resolution config at all keep the old "1080p" default.
function resolveVideoResolution(modelId: string): string {
  const model = getModelById(modelId);
  const options = model ? deriveModelResolutionOptions(model) : undefined;
  if (!options || options.length === 0) return "1080p";
  if (options.some(o => o.value === "1080p")) return "1080p";
  return options[options.length - 1].value;
}

// Video dispatch used to hardcode `duration: 10` for every model. Some
// models (e.g. Veo 3.1 Lite) only support a fixed duration list that may not
// include the story plan's requested `shot.durationSeconds` (now a
// model-flexible 4-20s range, not a hardcoded 10 — see
// `STAGED_SHOT_DURATION_MIN/MAX_SECONDS` in stagedContracts.ts), which would
// make the whole task submission fail the same way an unsupported resolution
// does. Snap the requested duration to the closest value the selected
// model's `durations` list actually supports (nearest by absolute
// difference; the larger value wins on a tie). Models with no `durations`
// list at all (unconstrained) keep the requested value as-is, mirroring
// `resolveVideoResolution`'s "no config at all" fallback.
/**
 * A model's supported durations live in TWO independent places and the two
 * disagree for most rows: the `media_models.durations` column (what this
 * fitter used to read exclusively) and `configJson.inputFields[key=duration]
 * .options` (what `server/routers/media.ts`'s request validator reads). Field
 * incident 2026-07-30: `veo3/generate-veo-3-video-lite` had neither, so a
 * 10-second shot sailed past both checks and Kie.ai rejected the submission
 * with "Duration must be 4, 6 or 8 seconds" — a burnt dispatch (refunded, but
 * the shot simply never rendered) that repeated on every retry.
 *
 * Reading the column first and falling back to configJson means a model only
 * escapes fitting when NEITHER source declares anything, and it can no longer
 * matter which of the two an operator happened to fill in.
 */
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
  const options = resolveStagedModelDurationOptions(model);
  if (!options || options.length === 0)
    return { duration: requestedSeconds, fitted: false };
  if (options.includes(requestedSeconds))
    return { duration: requestedSeconds, fitted: false };
  let closest = options[0];
  let closestDiff = Math.abs(options[0] - requestedSeconds);
  for (const candidate of options.slice(1)) {
    const diff = Math.abs(candidate - requestedSeconds);
    if (diff < closestDiff || (diff === closestDiff && candidate > closest)) {
      closest = candidate;
      closestDiff = diff;
    }
  }
  return { duration: closest, fitted: true };
}

/**
 * Kie.ai rejects WebP reference images (and raw `data:` URIs, which aren't
 * fetchable by Kie.ai's servers at all — those come from the staged review
 * UI's character/product drag-drop uploader, which stores whatever
 * `FileReader.readAsDataURL()` produces rather than uploading to storage).
 * For anything Kie.ai can't consume directly, decode/fetch the source bytes,
 * re-encode as JPEG, and upload to our own storage so Kie.ai gets a real,
 * fetchable https:// URL. A prior version of this routed through an
 * `/api/media/image-convert` endpoint that was never actually implemented —
 * every "conversion" 404'd, and Kie.ai correctly reported that as
 * "File type not supported".
 */
const KIE_AI_SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function isKieAiProvider(provider: string, model?: string): boolean {
  const normP = (provider || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normP === "kieai" || normP === "kie") return true;
  if (model) {
    const derived = modelProvider(model).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (derived === "kieai" || derived === "kie") return true;
    const normM = model.toLowerCase();
    if (normM.includes("banana") || normM.includes("veo") || normM.includes("flux") || normM.includes("grok")) return true;
  }
  return false;
}

async function convertReferenceImageForKieAi(params: {
  source: string;
  runId: string;
}): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (params.source.startsWith("data:")) {
      const match = params.source.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) return null;
      buffer = Buffer.from(match[1], "base64");
    } else {
      const response = await fetch(params.source);
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
    }
    const converted = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    const key = `marketplace-auto-review/${params.runId}/reference-uploads/${nanoid(12)}.jpg`;
    const stored = await storagePut(key, converted, "image/jpeg");
    return stored.url;
  } catch (error) {
    console.warn(
      `[staged-pipeline] failed to convert reference image for kie.ai (run ${params.runId}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function sanitizeReferenceUrlsForProvider(
  provider: string,
  urls: string[],
  publicUrl: string | null | undefined,
  model: string | undefined,
  runId: string,
): Promise<string[]> {
  if (!isKieAiProvider(provider, model)) return urls;

  const result: string[] = [];
  for (const raw of urls) {
    if (raw.startsWith("data:")) {
      const converted = await convertReferenceImageForKieAi({ source: raw, runId });
      // On failed conversion, still push the raw value: Kie.ai will reject it
      // with a clear error rather than the shot silently losing a reference.
      result.push(converted ?? raw);
      continue;
    }
    try {
      const url = new URL(raw);
      const pathname = url.pathname;
      const extMatch = pathname.match(/\.([a-z0-9]+)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : "";

      if (KIE_AI_SUPPORTED_EXTENSIONS.has(ext)) {
        result.push(raw);
        continue;
      }

      const converted = await convertReferenceImageForKieAi({ source: raw, runId });
      result.push(converted ?? raw);
    } catch {
      result.push(raw);
    }
  }
  return result;
}

function stagedPlanFromMetadata(
  metadata: Record<string, any>
): StagedStoryArcPlan | null {
  const plan = record(metadata.stagedPipeline).plan;
  if (!plan || !Array.isArray(plan.shots)) return null;
  return plan as StagedStoryArcPlan;
}

function buildProductFromMetadata(
  run: MarketplaceAutoReviewRun,
  metadata: Record<string, any>
) {
  const truth = record(metadata.productTruth);
  const urls = Array.isArray(metadata.productImageUrls)
    ? metadata.productImageUrls.map(text).filter(Boolean)
    : [];
  return {
    productId: run.productId,
    productName: text(truth.productName) || run.productId,
    description: text(truth.description) || null,
    imageUrls: urls.slice(0, 5),
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
function deriveStagedCastFromManifest(
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
      }>
    | undefined
): StagedCastMember[] {
  const active = (manifest ?? []).filter(
    (item): item is Record<string, any> =>
      !!item && typeof item.url === "string" && item.url.trim() !== "" && item.active !== false
  );
  const productCount = Math.max(
    1,
    active.filter(item => item.role !== "character").length
  );
  const characterItems = active
    .filter(item => item.role === "character")
    .slice(0, MARKETPLACE_CHARACTER_CAST_MAX);
  // Roles come from the shared assigner, not from index position — with a
  // 4-person roster the old `i === 0 ? host : guest` produced three guests
  // (`planning/marketplace-four-character-cast/plan.md` P1).
  const rolled = assignMarketplaceCastRoles(
    characterItems.map(item => ({
      characterRole:
        typeof item.characterRole === "string" ? item.characterRole : undefined,
    })),
  );
  return characterItems.map((item, i) => {
    return {
      castId: `cast-${i + 1}`,
      name: text(item.characterName) || text(item.label) || `Person ${i + 1}`,
      source: text(item.vdCharacterId) ? ("vd_character" as const) : ("uploaded" as const),
      vdCharacterId: text(item.vdCharacterId) || undefined,
      vdSeriesId: text(item.vdSeriesId) || undefined,
      role: rolled[i]?.characterRole ?? "support",
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
 * Both fields absent is the legacy state and means "everyone, default looks".
 */
export function resolveShotCastSelectionFromMetadata(params: {
  metadata: Record<string, any> | null | undefined;
  plan: { shots?: Array<{ shotId?: number; castInShot?: string[] }> } | null | undefined;
  shotId: number;
}): { castInShot: string[] | undefined; castLooks: Record<string, ShotCastLook> | undefined } {
  const planShot = (params.plan?.shots ?? []).find(
    shot => Number(shot?.shotId) === Number(params.shotId),
  );
  const stateShots = Array.isArray(
    (params.metadata as any)?.stagedSequentialStoryboard?.shots,
  )
    ? ((params.metadata as any).stagedSequentialStoryboard.shots as Array<any>)
    : [];
  const stateShot = stateShots.find(
    shot => Number(shot?.shotId) === Number(params.shotId),
  );

  const castInShot = Array.isArray(stateShot?.castInShot)
    ? (stateShot.castInShot as string[])
    : Array.isArray(planShot?.castInShot)
    ? planShot!.castInShot
    : undefined;

  const rawLooks = stateShot?.castLooks;
  const castLooks =
    rawLooks && typeof rawLooks === "object" && !Array.isArray(rawLooks)
      ? (rawLooks as Record<string, ShotCastLook>)
      : undefined;

  return { castInShot, castLooks };
}

function buildLegacyConcept(plan: StagedStoryArcPlan) {
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
    description: plan.product.description || "",
    specs: {},
    imageUrls: plan.product.imageUrls,
  };
  return {
    conceptId: `staged-${plan.product.productId}-${plan.planRevision}`,
    title: plan.title,
    productTruth: truth,
    storyboardGuide: plan.storySummary,
    voiceoverScript: plan.shots.map(shot => shot.dialogue).join("\n"),
    productDetail: plan.product.description || plan.product.productName,
    shots: plan.shots.map(shot => ({
      id: `shot-${shot.shotId}`,
      order: shot.shotId,
      title: shot.title,
      startSeconds: (shot.shotId - 1) * 10,
      endSeconds: shot.shotId * 10,
      durationSeconds: 10,
      storyboardGuide: shot.storySummary,
      voiceover: shot.dialogue,
      camera: "stable vertical product-review framing",
      visual: shot.visualSummary,
      movement: "restrained continuity-preserving motion",
      productRole: "evidence-grounded product presentation",
    })),
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

function finalAssemblyFor(
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>,
  plan: StagedStoryArcPlan
) {
  const configured = record(metadata).stagedPipeline?.finalAssembly;
  if (
    configured &&
    Array.isArray(configured.shots) &&
    configured.shots.length === plan.shots.length
  ) {
    const { contentHash: _contentHash, ...assembly } = configured;
    return assembly;
  }
  return {
    planRevision: plan.planRevision,
    shots: metadata.stagedSequentialStoryboard.shots.map(shot => ({
      shotId: shot.shotId,
      imageArtifactHash: shot.imageArtifactHash,
      videoArtifactHash: shot.videoArtifactHash,
      dialogue: shot.dialogue,
    })),
    audio: {
      plan: record(metadata).stagedPipeline?.audioPlan ?? null,
      artifactHash: text(record(metadata).stagedPipeline?.audioUrl)
        ? buildProductionStableHash({
            audioUrl: text(record(metadata).stagedPipeline?.audioUrl),
          })
        : null,
    },
    includeAudio: true,
  };
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
    .where(eq(marketplaceAutoReviewRuns.id, params.run.id))
    .returning();
  return (
    next ??
    ({
      ...params.run,
      metadataJson: params.metadata,
    } as MarketplaceAutoReviewRun)
  );
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
  return {
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    model: checkpoint.approvedModel || "internal",
    provider: checkpoint.approvedProvider || "internal",
    safetyVerdict: checkpoint.approvedSafetyVerdict || "passed",
    referenceManifestHash: checkpoint.approvedReferenceManifestHash || "none",
    estimatedCredits: checkpoint.estimatedCredits ?? 0,
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
  // metadata read once at the top of this advance pass, and persistRun
  // writes with no optimistic-concurrency check — so a concurrent prompt
  // edit landing mid-pass could otherwise be silently overwritten here, and
  // the stale pre-edit prompt would get dispatched and charged. Re-fetching
  // the run and re-running the same guard against the fresh checkpoint
  // closes that window right before the actual spend.
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
  if (!freshCheckpoint) throw new Error("checkpoint_revision_mismatch");
  const freshGuard = assertStagedProviderSpendAllowed(freshCheckpoint, expected);
  if (!freshGuard.ok) throw new Error(freshGuard.reasonCode);
  const transitioned = transitionStagedCheckpoint(params.checkpoint, {
    type: "consume",
    operationId: params.operationId,
    consumedAt: new Date().toISOString(),
  });
  if (!transitioned.ok) throw new Error(transitioned.reasonCode);
  const next = appendSafeEvidence(
    replaceCheckpoint(params.metadata, transitioned.checkpoint),
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
      tenantId: params.auth.tenantId ?? params.run.tenantId ?? "default",
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
      }).catch(() => undefined);
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
  const reservedCredits = tasks.reduce(
    (sum, task) => sum + Math.max(0, Number(task.creditAmount) || 0),
    0
  );
  const refundedCredits = tasks.reduce(
    (sum, task) =>
      sum +
      (task.refundTransactionId
        ? Math.max(0, Number(task.creditAmount) || 0)
        : 0),
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
// planning context (tone/structure/duration/shot-count) off a run's
// persisted `metadataJson`. Used by both the sync deterministic path
// (`planAndMetadataFromRun`) and the async LLM-first path
// (`buildStagedPlanAndMetadataForInit`) so the two never drift.
function stagedPlanContextFromMetadataBase(base: Record<string, any>) {
  const anchors = record(base.referenceAnchors);
  const reviewTone =
    typeof anchors.reviewTone === "string"
      ? anchors.reviewTone
      : typeof base.reviewTone === "string"
      ? base.reviewTone
      : undefined;
  const storytellingStructure =
    typeof anchors.storytellingStructure === "string"
      ? anchors.storytellingStructure
      : typeof base.storytellingStructure === "string"
      ? base.storytellingStructure
      : undefined;
  // User-chosen per-shot duration (advanced overrides). Omitted -> undefined
  // -> buildStagedStoryArcPlan's own default of 10, i.e. byte-identical to
  // before this field existed. The dispatch-time model-fit snap in
  // handleVideoProvider (resolveStagedVideoDuration) still applies on top of
  // whatever value is used here, so the plan's prompt text and the actual
  // submitted duration stay as close as the selected model allows.
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
  const cast = deriveStagedCastFromManifest(base.customReferenceManifest);
  return {
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    cast,
  };
}

// Additive (feature/marketplace-flexible-shots): extracted from
// `planAndMetadataFromRun` so the async LLM-first path
// (`buildStagedPlanAndMetadataForInit`) can build the same fresh-run
// metadata shape from whatever plan it produced (LLM or deterministic).
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
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: plan.referenceManifestHash,
    adherenceWarnings: assessStagedPlanAdherence(plan, {
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
  const {
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    cast,
  } = stagedPlanContextFromMetadataBase(base);
  const existingPlan = stagedPlanFromMetadata(base);
  const plan =
    existingPlan ||
    buildStagedStoryArcPlan({
      runId: run.id,
      product: buildProductFromMetadata(run, base),
      referenceManifestHash: buildProductionStableHash({
        referenceAnchors: base.referenceAnchors ?? {},
        productImageUrls: base.productImageUrls ?? [],
      }),
      languagePlan: stagedLanguagePlanFromMetadata(base),
      reviewTone,
      storytellingStructure,
      cast,
      shotDurationSeconds,
      // Deterministic-only path: "auto" cannot be honored without LLM
      // judgment, so it falls back to the default (undefined -> 9), same as
      // every other caller of this sync deterministic builder.
      shotCount: typeof shotCount === "number" ? shotCount : undefined,
    });
  const existing = StagedSequentialStoryboardMetadataV1Schema.safeParse(base);
  if (existing.success)
    return {
      plan,
      metadata: existing.data as typeof existing.data & Record<string, any>,
    };
  const metadata = buildFreshStagedMetadataFromPlan({
    run,
    base,
    plan,
    reviewTone,
    storytellingStructure,
  });
  return { plan, metadata };
}

// Additive (feature/marketplace-flexible-shots): async LLM-first plan
// builder for a BRAND NEW run (i.e. `base` does not yet parse as staged
// metadata — mirrors `planAndMetadataFromRun`'s cold-start branch exactly,
// including returning an ALREADY-PERSISTED plan as-is when one exists).
// Used only by `initializeStagedMarketplaceAutoReviewRun` and
// `redraftStagedMarketplaceAutoReviewRun`, which are both already async —
// `planAndMetadataFromRun` itself stays sync/deterministic for its other
// (synchronous) call sites (`advanceStagedMarketplaceAutoReviewRun`'s
// self-heal fallback and the checkpoint router's fallback), which only ever
// re-derive metadata for a run that already has a persisted plan (returned
// as-is, no new plan is ever built there) or fall back deterministically —
// never a fresh-run LLM call.
export async function buildStagedPlanAndMetadataForInit(
  run: MarketplaceAutoReviewRun,
  options?: { revision?: number; previousStorySummary?: string | null }
): Promise<{
  plan: StagedStoryArcPlan;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  usedSkillFallback: boolean;
}> {
  const base = record(run.metadataJson);
  const {
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    cast,
  } = stagedPlanContextFromMetadataBase(base);
  const existingPlan = stagedPlanFromMetadata(base);
  if (existingPlan) {
    const existing = StagedSequentialStoryboardMetadataV1Schema.safeParse(base);
    if (existing.success) {
      return {
        plan: existingPlan,
        metadata: existing.data as typeof existing.data & Record<string, any>,
        usedSkillFallback: false,
      };
    }
  }
  const shouldUseLLM = cast.length >= 1 || shotCount === "auto";
  const product = buildProductFromMetadata(run, base);
  const referenceManifestHash = buildProductionStableHash({
    referenceAnchors: base.referenceAnchors ?? {},
    productImageUrls: base.productImageUrls ?? [],
  });
  const languagePlan = stagedLanguagePlanFromMetadata(base);
  let plan: StagedStoryArcPlan;
  if (shouldUseLLM) {
    plan = await generateStagedStoryArcPlanWithLLM({
      runId: run.id,
      userId: run.userId ?? undefined,
      tenantId: run.tenantId ?? undefined,
      product,
      referenceManifestHash,
      revision: options?.revision,
      previousStorySummary: options?.previousStorySummary,
      languagePlan,
      reviewTone,
      storytellingStructure,
      cast,
      shotDurationSeconds,
      shotCount,
      model: storyPlanningModel,
    });
  } else {
    plan = buildStagedStoryArcPlan({
      runId: run.id,
      product,
      referenceManifestHash,
      revision: options?.revision,
      previousStorySummary: options?.previousStorySummary ?? undefined,
      languagePlan,
      reviewTone,
      storytellingStructure,
      cast,
      shotDurationSeconds,
      shotCount: typeof shotCount === "number" ? shotCount : undefined,
    });
  }
  // `generateStagedStoryArcPlanWithLLM` never throws — on any failure it
  // internally falls back to `buildStagedStoryArcPlan` and stamps
  // `source: "bounded_story_arc_fallback"`. That's how we detect the
  // fallback happened without duplicating its try/catch here.
  const usedSkillFallback =
    shouldUseLLM && plan.source !== "llm_story_arc";
  const metadata = buildFreshStagedMetadataFromPlan({
    run,
    base,
    plan,
    reviewTone,
    storytellingStructure,
  });
  return { plan, metadata, usedSkillFallback };
}

function stagedMetadataForPlan(input: {
  run: MarketplaceAutoReviewRun;
  base: Record<string, any>;
  plan: StagedStoryArcPlan;
  redraftCount: number;
  reviewTone?: string;
  storytellingStructure?: string;
}) {
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${input.run.id}:r${input.plan.planRevision}`,
    kind: "story_plan",
    revision: input.plan.planRevision,
    contentHash: input.plan.storyPlanHash,
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: input.plan.referenceManifestHash,
    adherenceWarnings: assessStagedPlanAdherence(input.plan, {
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
          ? record(input.base.stagedSequentialStoryboard).reviewCheckpoints.filter(
              (cp: any) => cp.kind !== "story_plan"
            )
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
}) {
  const base = record(params.run.metadataJson);
  const {
    reviewTone,
    storytellingStructure,
    shotDurationSeconds,
    shotCount,
    storyPlanningModel,
    cast,
  } = stagedPlanContextFromMetadataBase(base);
  const current =
    stagedPlanFromMetadata(base) || planAndMetadataFromRun(params.run).plan;
  const notes = text(params.notes).slice(0, 1200);
  const resolvedShotDurationSeconds =
    shotDurationSeconds ?? current.shots[0]?.durationSeconds;
  const sharedPlanInput = {
    runId: params.run.id,
    product: current.product,
    referenceManifestHash: current.referenceManifestHash,
    revision: current.planRevision + 1,
    languagePlan: current.languagePlan ?? stagedLanguagePlanFromMetadata(base),
    previousStorySummary: notes ? notes.slice(0, 500) : undefined,
    reviewTone,
    storytellingStructure,
    cast,
    shotDurationSeconds: resolvedShotDurationSeconds,
  };
  // Additive (feature/marketplace-flexible-shots): LLM-first redraft when
  // cast is present (dialogue is creative content) or shotCount="auto" (shot
  // count is LLM judgment) — mirrors the init path in
  // `buildStagedPlanAndMetadataForInit`. `generateStagedStoryArcPlanWithLLM`
  // falls back to `buildStagedStoryArcPlan` internally on any failure.
  const shouldUseLLM = cast.length >= 1 || shotCount === "auto";
  const nextPlan = shouldUseLLM
    ? await generateStagedStoryArcPlanWithLLM({
        ...sharedPlanInput,
        userId: params.run.userId ?? undefined,
        tenantId: params.run.tenantId ?? undefined,
        shotCount,
        // Honor the run's own creation-time model choice on a redraft too, so
        // a redraft cannot silently fall back to a weaker model than the one
        // that authored revision 1.
        model: storyPlanningModel,
      })
    : buildStagedStoryArcPlan({
        ...sharedPlanInput,
        shotCount: typeof shotCount === "number" ? shotCount : undefined,
      });
  const usedSkillFallback = shouldUseLLM && nextPlan.source !== "llm_story_arc";
  const currentRedraftCount = Number(record(base.planReview).redraftCount) || 0;
  const metadata = stagedMetadataForPlan({
    run: params.run,
    base,
    plan: nextPlan,
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
        reasonCodes: [
          "story_plan_redraft_ready",
          ...(usedSkillFallback ? ["staged_story_skill_fallback"] : []),
          ...adherence.warnings,
        ],
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
  // or shotCount="auto" (shot count itself is LLM judgment). Falls back to
  // the bounded deterministic planner internally on failure; see
  // `buildStagedPlanAndMetadataForInit`'s doc comment for why this is the
  // only place (besides redraft) this async path is used.
  const { plan, metadata, usedSkillFallback } =
    await buildStagedPlanAndMetadataForInit(params.run);
  const anchorsForAdherence = record(record(params.run.metadataJson).referenceAnchors);
  const adherence = assessStagedPlanAdherence(plan, {
    storytellingStructure:
      typeof anchorsForAdherence.storytellingStructure === "string"
        ? anchorsForAdherence.storytellingStructure
        : undefined,
    reviewTone:
      typeof anchorsForAdherence.reviewTone === "string"
        ? anchorsForAdherence.reviewTone
        : undefined,
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
      storyPlan: buildStagedPlanView(plan),
      statusDetail: {
        state: "awaiting_story_plan_review",
        severity: "info",
        reasonCodes: [
          "story_plan_approval_required",
          ...(usedSkillFallback ? ["staged_story_skill_fallback"] : []),
          ...adherence.warnings,
        ],
        safeMessage: "ตรวจเนื้อเรื่องก่อน ระบบยังไม่ใช้เครดิตสร้างภาพ",
        nextAction: "ตรวจและยืนยันเนื้อเรื่อง",
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
  // Same read-and-filter pattern as `handleImageProvider` below: the
  // manifest lives at the metadata top level (or, as a fallback, mirrored
  // onto `stagedSequentialStoryboard.referenceManifest`). Read it once here
  // so every shot's compiled prompt (and its content hash) reflects the same
  // character reference set the actual image generation call will use.
  const customManifest = Array.isArray((params.metadata as any).customReferenceManifest)
    ? (params.metadata as any).customReferenceManifest
    : Array.isArray(
        (params.metadata as any).stagedSequentialStoryboard?.referenceManifest
      )
    ? (params.metadata as any).stagedSequentialStoryboard.referenceManifest
    : [];
  // Shots whose skill-authored attempt failed and fell back to the
  // deterministic compiler this pass — surfaced non-blockingly on the
  // `prompt_plan` stage below (`staged_prompt_skill_fallback`).
  const skillFallbackShotIds: number[] = [];
  for (const shot of params.plan.shots) {
    const shotState = next.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    const existingPrompt = checkpointFor(next, "image_prompt", shot.shotId);
    // A per-shot story/dialogue repair deliberately leaves other shots in
    // place. Preserve their existing prompt checkpoint instead of compiling
    // and re-spending the whole storyboard when the run-level story gate is
    // approved again.
    if (shotState?.state !== "story_awaiting" && existingPrompt) continue;

    // Skill-first prompt authoring (project rule — see
    // `feedback_skill_first_authoring`): both
    // `marketplace-auto-review-story-arc` and
    // `marketplace-auto-review-shot-video-director` declare
    // `execution_mode: llm-only` + `fallback_policy: bounded_server_fallback`,
    // meaning the LLM must author the prompt and the deterministic TS
    // template (`compileStagedImagePrompt`) is only the bounded fallback.
    // Try the exact same single-shot skill seam the per-shot "Generate
    // Prompt" button already uses (`generateStagedAutoReviewShotPrompt`)
    // before falling back. One shot's failure must never abort the others
    // — each attempt is independently try/caught.
    let prompt: string;
    let hash: string;
    let authoringSource: "skill" | "deterministic_fallback" = "deterministic_fallback";
    try {
      // `buildStagedSingleShotRefreshInput` lives in
      // `marketplaceAutoReviewStagedCheckpointRouterService.ts`, which
      // already imports FROM this module at the top level (see the
      // `recordStagedProviderFailureAndRefund` comment near the top of this
      // file for the general circular-import precedent in the other
      // direction). Importing it back here as a normal top-level import
      // would create the same circular edge a second time, in the
      // direction that module doesn't already tolerate — so this import
      // MUST stay a lazy dynamic import inside the function body, resolved
      // at runtime long after both modules have finished evaluating, never
      // at module-top-level.
      const { buildStagedSingleShotRefreshInput } = await import(
        "./marketplaceAutoReviewStagedCheckpointRouterService"
      );
      const refreshInput = buildStagedSingleShotRefreshInput({
        run: params.run as any,
        metadata: next as any,
        shotId: shot.shotId,
        publicUrl: params.runtime.publicUrl,
        tenantId: params.auth.tenantId,
        stage: "image",
      });
      const refresh = await refreshSequentialShotPromptWithSkill(refreshInput);
      const skillPrompt = String(refresh.startFrameImagePrompt ?? "").trim();
      if (!skillPrompt) {
        throw new Error("staged_prompt_skill_authoring_empty");
      }
      prompt = skillPrompt;
      hash = buildStagedImagePromptContentHash({
        revision: params.plan.planRevision,
        shotId: shot.shotId,
        prompt,
        referenceManifestHash: params.plan.referenceManifestHash,
      });
      authoringSource = "skill";
    } catch (error) {
      console.warn(
        `[compileImagePromptCheckpoints] skill authoring failed for run=${params.run.id} shot=${shot.shotId}, falling back to deterministic compiler: ${error instanceof Error ? error.message : String(error)}`
      );
      const compiled = compileStagedImagePrompt({
        plan: params.plan,
        shot,
        customManifest,
      });
      prompt = compiled.prompt;
      hash = compiled.contentHash;
      skillFallbackShotIds.push(shot.shotId);
    }
    console.info(
      `[compileImagePromptCheckpoints] run=${params.run.id} shot=${shot.shotId} authoringSource=${authoringSource}`
    );
    const checkpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${params.run.id}:shot-${shot.shotId}:r${params.plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot.shotId,
      revision: params.plan.planRevision,
      contentHash: hash,
      model: text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL,
      provider: modelProvider(
        text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL
      ),
      estimatedCredits: modelCost(
        text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL
      ),
      referenceManifestHash: params.plan.referenceManifestHash,
      autoApprove: { userId: params.run.userId },
    });
    next = replaceCheckpoint(next, checkpoint);
    next = updateShot(next, shot.shotId, {
      state: "image_prompt_awaiting",
      imagePromptHash: hash,
      imagePrompt: prompt,
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
    run: params.run,
    metadata: next as any,
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
        reasonCodes: [
          "image_prompt_approval_required_per_shot",
          ...(skillFallbackShotIds.length > 0
            ? ["staged_prompt_skill_fallback"]
            : []),
        ],
        safeMessage:
          skillFallbackShotIds.length > 0
            ? `ตรวจ Prompt ของแต่ละช็อตก่อนยืนยันสร้างภาพ ระบบยังไม่ใช้เครดิตภาพ (ช็อตที่ ${skillFallbackShotIds.join(", ")} ใช้ prompt สำรองเนื่องจาก skill เขียน prompt ไม่สำเร็จ)`
            : "ตรวจ Prompt ของแต่ละช็อตก่อนยืนยันสร้างภาพ ระบบยังไม่ใช้เครดิตภาพ",
        nextAction: "ตรวจ Prompt ช็อตที่ต้องการ แล้วกดยืนยันสร้างภาพ",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
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
  const model = text(checkpoint.approvedModel) || text(record(metadata).imageModel) || STAGED_IMAGE_MODEL;
  const provider = text(checkpoint.approvedProvider) || modelProvider(model);
  const expected = checkpointExpectation(checkpoint);
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...expected,
    model,
    provider,
    estimatedCredits: checkpoint.estimatedCredits ?? modelCost(model),
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
      referenceManifestHash:
        checkpoint.approvedReferenceManifestHash ||
        params.plan.referenceManifestHash,
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
    : Array.isArray((consumedRecord as any).stagedSequentialStoryboard?.referenceManifest)
    ? (consumedRecord as any).stagedSequentialStoryboard.referenceManifest
    : [];

  let referenceImageUrls: string[] = [];
  let characterItems: any[] = [];
  let productItems: any[] = [];

  if (customManifest.length > 0) {
    const activeItems = customManifest.filter(
      (item: any) => item && typeof item.url === "string" && item.url.trim() && item.active !== false
    );
    productItems = activeItems.filter((item: any) => item.role !== "character");
    const allCharacterItems = activeItems.filter((item: any) => item.role === "character");

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
        productItems,
        characterItems: allCharacterItems,
        castInShot: shotCastSelection.castInShot,
        castLooks: shotCastSelection.castLooks,
      });
    characterItems = shotCharacterItems;
    // Products first (@Image1, ...), then this shot's characters (@Image2, ...)
    referenceImageUrls = orderedItems.map((item: any) => item.url.trim());
  }

  if (referenceImageUrls.length === 0) {
    // No manifest customization at all yet: default to just the hero
    // product image, matching the same "hero only by default" the review
    // UI shows — sending every product angle shot here would silently
    // contradict what the checkboxes just displayed as selected.
    referenceImageUrls = buildProductFromMetadata(params.run, consumedRecord)
      .imageUrls.filter(Boolean)
      .slice(0, 1);
  }
  if (referenceImageUrls.length === 0)
    throw new Error("staged_reference_missing");

  // Sanitize URLs for the target provider (e.g. Kie.ai rejects .webp files
  // and can't fetch raw data: URIs at all)
  referenceImageUrls = await sanitizeReferenceUrlsForProvider(
    provider,
    referenceImageUrls,
    params.runtime.publicUrl,
    model,
    params.run.id
  );
  if (referenceImageUrls.length === 0)
    throw new Error(
      `staged_reference_unsupported_format: all reference images were in a format unsupported by provider "${provider}"`
    );

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
  // dispatched to the provider is `prompt`, byte-identical to whatever the
  // skill (or its bounded deterministic fallback) compiled.
  const missingCharacterReferenceTags: string[] = [];
  if (characterItems.length > 0) {
    const productCount = productItems.length > 0 ? productItems.length : 1;
    for (let i = 0; i < characterItems.length; i += 1) {
      const charTag = `@Image${productCount + i + 1}`;
      if (!prompt.includes(charTag)) missingCharacterReferenceTags.push(charTag);
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
  const task = await mediaGenerationService.getTask(taskInfo.taskId, token, {
    userId: params.auth.userId,
    traceId: `staged-image-poll:${params.run.id}:${params.shotId}`,
    source: "marketplace_auto_review_staged",
    stage: "image_generation",
  });
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled") {
    throw new Error(`staged_image_provider_failed:shot:${params.shotId}`);
  }
  const url = text(task.resultUrl);
  if (!url)
    throw new Error(`staged_image_artifact_missing:shot:${params.shotId}`);
  const artifactHash = buildProductionStableHash({ taskId: task.id, url });
  let next = updateShot(params.metadata, params.shotId, {
    state: "image_result_awaiting",
    imageArtifactHash: artifactHash,
    imageArtifactUrl: url,
  });
  next = updateTaskRecord(next, `image:${params.shotId}`, {
    status: "completed",
    resultUrl: url,
    completedAt: new Date().toISOString(),
  });
  const imagePrompt = checkpointFor(next, "image_prompt", params.shotId);
  const imageResultCheckpoint = buildStagedCheckpoint({
    checkpointId: `image-result:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
    kind: "image_result",
    shotId: params.shotId,
    revision: params.plan.planRevision,
    contentHash: artifactHash,
    model:
      imagePrompt?.approvedModel ||
      text(record(params.metadata).imageModel) ||
      STAGED_IMAGE_MODEL,
    provider:
      imagePrompt?.approvedProvider || modelProvider(STAGED_IMAGE_MODEL),
    estimatedCredits: 0,
    referenceManifestHash: params.plan.referenceManifestHash,
    autoApprove: { userId: params.run.userId },
  });
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
    status: "blocked_needs_user",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "awaiting_image_result_review",
        severity: "info",
        reasonCodes: ["image_result_approval_required"],
        safeMessage: `ตรวจผลภาพช็อตที่ ${params.shotId} ก่อนเริ่มงานวิดีโอ ระบบยังไม่ใช้เครดิตวิดีโอ`,
        nextAction: `ตรวจผลภาพช็อตที่ ${params.shotId} แล้วกดยอมรับหรือปฏิเสธ`,
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function compileVideoPrompt(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const imageArtifactHash =
    params.metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === params.shotId
    )?.imageArtifactHash;
  if (!imageArtifactHash) throw new Error("staged_image_artifact_missing");
  const compiled = compileStagedVideoPrompt({
    plan: params.plan,
    shot,
    imageArtifactHash,
  });
  const prompt = compiled.prompt;
  const hash = compiled.contentHash;
  const model = text(record(params.metadata).videoModel) || STAGED_VIDEO_MODEL;
  const checkpoint = buildStagedCheckpoint({
    checkpointId: `video-prompt:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
    kind: "video_prompt",
    shotId: params.shotId,
    revision: params.plan.planRevision,
    contentHash: hash,
    model,
    provider: modelProvider(model),
    estimatedCredits: modelCost(model),
    referenceManifestHash: params.plan.referenceManifestHash,
    autoApprove: { userId: params.run.userId },
  });
  let next = updateShot(params.metadata, params.shotId, {
    state: "video_prompt_awaiting",
    videoPromptHash: hash,
    videoPrompt: prompt,
  });
  next = replaceCheckpoint(next, checkpoint);
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
        state: "awaiting_video_prompt_review",
        severity: "info",
        reasonCodes: ["video_prompt_approval_required"],
        safeMessage: `ยืนยัน Prompt วิดีโอช็อตที่ ${params.shotId} ก่อนใช้เครดิตวิดีโอ`,
        nextAction: `ตรวจ Prompt วิดีโอช็อตที่ ${params.shotId} แล้วกดยืนยัน`,
        userActionRequired: true,
        retryable: true,
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
  if (!shotState?.imageArtifactUrl || !checkpoint)
    throw new Error(`checkpoint_not_ready:shot:${params.shotId}`);
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const model = text(checkpoint.approvedModel) || text(record(params.metadata).videoModel) || STAGED_VIDEO_MODEL;
  const provider = text(checkpoint.approvedProvider) || modelProvider(model);
  const durationResolution = resolveStagedVideoDuration(
    model,
    shot.durationSeconds
  );
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...checkpointExpectation(checkpoint),
    model,
    provider,
    estimatedCredits: checkpoint.estimatedCredits ?? modelCost(model),
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
      imageArtifactHash: shotState.imageArtifactHash || "",
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
      ...(durationResolution.fitted
        ? {
            statusDetail: {
              state: "video_duration_fitted_to_model",
              severity: "info",
              reasonCodes: ["staged_video_duration_fitted_to_model"],
              safeMessage: `ปรับความยาววิดีโอช็อตที่ ${params.shotId} จาก ${shot.durationSeconds} วินาที เป็น ${durationResolution.duration} วินาที ให้ตรงกับความยาวที่โมเดลรองรับ`,
              userActionRequired: false,
              retryable: false,
            },
          }
        : {}),
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
  const task = await mediaGenerationService.getTask(taskInfo.taskId, token, {
    userId: params.auth.userId,
    traceId: `staged-video-poll:${params.run.id}:${params.shotId}`,
    source: "marketplace_auto_review_staged",
    stage: "video_generation",
  });
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled")
    throw new Error(`staged_video_provider_failed:shot:${params.shotId}`);
  const url = text(task.resultUrl);
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
      model: videoPromptCheckpoint?.approvedModel ?? STAGED_VIDEO_MODEL,
      provider:
        videoPromptCheckpoint?.approvedProvider ??
        modelProvider(STAGED_VIDEO_MODEL),
      estimatedCredits: 0,
      referenceManifestHash: params.plan.referenceManifestHash,
      autoApprove: { userId: params.run.userId },
    })
  ) as any;
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
    includeAudio: true,
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
      model: "assembly",
      provider: "internal",
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
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "render",
    status: "blocked_needs_user",
    output: {
      finalAssembly: record(next).stagedPipeline.finalAssembly,
      statusDetail: {
        state: "awaiting_final_assembly_review",
        severity: "info",
        reasonCodes: ["final_assembly_approval_required"],
        safeMessage:
          params.run.outputMode === "storyboard_images"
            ? "ตรวจและยืนยันลำดับภาพก่อนปิดงานภาพสตอรีบอร์ด"
            : "ตรวจและยืนยันการประกอบก่อนใช้เครดิตเรนเดอร์และบันทึก Library",
        nextAction:
          params.run.outputMode === "storyboard_images"
            ? "ตรวจลำดับภาพและคำเตือน แล้วกดยืนยันการประกอบ"
            : "ตรวจลำดับภาพ วิดีโอ เสียง และคำเตือน แล้วกดยืนยันการประกอบ",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

/**
 * Auto-approves a checkpoint still sitting in `awaiting`. Every non-story
 * checkpoint is now born already `approved` (see `buildStagedCheckpoint`'s
 * `autoApprove` param), so this branch can only be reached by a checkpoint
 * that predates this change. `expected` is derived from the checkpoint's own
 * current fields via `checkpointExpectation`, so this mirrors the checkpoint
 * back at itself and cannot legitimately fail.
 */
function selfHealAwaitingCheckpoint(
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>,
  checkpoint: HumanApprovalCheckpointV1,
  userId: number
): StagedSequentialStoryboardMetadataV1 & Record<string, any> {
  const transitioned = transitionStagedCheckpoint(checkpoint, {
    type: "approve",
    expected: checkpointExpectation(checkpoint),
    userId,
    approvedAt: new Date().toISOString(),
  });
  if (!transitioned.ok) {
    // Should be unreachable (see above) — log loudly instead of silently
    // leaving the shot blocked, so a call site this fallback doesn't cover
    // stays visible instead of masked.
    console.warn(
      `[advanceStagedMarketplaceAutoReviewRun] self-heal could not approve checkpoint ${checkpoint.checkpointId}: ${transitioned.reasonCode}`
    );
    return metadata;
  }
  console.warn(
    `[advanceStagedMarketplaceAutoReviewRun] self-healed awaiting checkpoint ${checkpoint.checkpointId} (kind=${checkpoint.kind}, shotId=${checkpoint.shotId ?? "run"}) — predates the auto-approve change`
  );
  return replaceCheckpoint(metadata, transitioned.checkpoint) as any;
}

export async function advanceStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
}): Promise<{ run: MarketplaceAutoReviewRun; finalAssemblyApproved: boolean }> {
  const { plan, metadata: initialMetadata } = planAndMetadataFromRun(
    params.run
  );
  let metadata = initialMetadata;
  if (!StagedSequentialStoryboardMetadataV1Schema.safeParse(metadata).success) {
    throw new Error("staged_state_drift");
  }
  const storyCheckpoint = checkpointFor(metadata, "story_plan");
  if (
    !storyCheckpoint ||
    storyCheckpoint.state === "awaiting" ||
    storyCheckpoint.state === "rejected" ||
    storyCheckpoint.state === "superseded"
  ) {
    const advanceAnchors = record(record(params.run.metadataJson).referenceAnchors);
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
  if (
    storyCheckpoint.state === "approved" &&
    !checkpointFor(metadata, "image_prompt", 1)
  ) {
    metadata = await compileImagePromptCheckpoints({
      db: params.db,
      run: params.run,
      metadata,
      plan,
      runtime: params.runtime,
      auth: params.auth,
    });
    return { run: params.run, finalAssemblyApproved: false };
  }

  for (const shot of plan.shots) {
    const imageTask = taskRecord(metadata, shot.shotId, "image");
    if (
      imageTask?.taskId &&
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
    if (imagePromptCheckpoint?.state === "awaiting") {
      // Every non-story checkpoint is now born already `approved` (see
      // buildStagedCheckpoint's autoApprove param); a checkpoint can only
      // land here in "awaiting" if it predates that change. Heal it and
      // persist immediately, then move on to the next shot instead of
      // falling through to dispatch in this same pass — consumeCheckpoint
      // re-fetches the run fresh from the database right before spending,
      // and would still see this checkpoint as "awaiting" there since the
      // heal above only exists in memory until persisted, aborting the
      // whole pass. Dispatch happens on the next pass instead, seconds
      // later via the existing sweep/debounce/poll triggers.
      const healed = selfHealAwaitingCheckpoint(
        metadata,
        imagePromptCheckpoint,
        params.auth.userId
      );
      if (healed !== metadata) {
        metadata = healed;
        await persistRun({
          db: params.db,
          run: params.run,
          metadata: metadata as any,
          status: "running",
          currentStage: "prompt_plan",
          stageIndex: 4,
        });
        continue;
      }
      imagePromptCheckpoint = checkpointFor(
        metadata,
        "image_prompt",
        shot.shotId
      );
    }
    if (imagePromptCheckpoint?.state === "approved" && !imageTask?.taskId) {
      try {
        metadata = (await handleImageProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
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
    let imageResultCheckpoint = checkpointFor(
      metadata,
      "image_result",
      shot.shotId
    );
    if (imageResultCheckpoint?.state === "awaiting") {
      // Same self-heal race described above for image_prompt: persist
      // before moving on instead of falling through to the same-pass
      // video-prompt compile below.
      const healed = selfHealAwaitingCheckpoint(
        metadata,
        imageResultCheckpoint,
        params.auth.userId
      );
      if (healed !== metadata) {
        metadata = healed;
        await persistRun({
          db: params.db,
          run: params.run,
          metadata: metadata as any,
          status: "running",
          currentStage: "storyboard_review",
          stageIndex: 6,
        });
        continue;
      }
      imageResultCheckpoint = checkpointFor(
        metadata,
        "image_result",
        shot.shotId
      );
    }
    if (
      imageResultCheckpoint?.state === "approved" &&
      !checkpointFor(metadata, "video_prompt", shot.shotId)
    ) {
      try {
        metadata = await compileVideoPrompt({
          db: params.db,
          run: params.run,
          metadata,
          plan,
          shotId: shot.shotId,
        });
      } catch (error) {
        // compileVideoPrompt's own throws don't embed a shot id — append one
        // so recordStagedProviderFailureAndRefund attributes the correction
        // to this shot, then move on instead of aborting the pass.
        const wrapped = new Error(
          `${error instanceof Error ? error.message : "staged_video_prompt_compile_failed"}:shot:${shot.shotId}`
        );
        console.warn(
          `[advanceStagedMarketplaceAutoReviewRun] compileVideoPrompt failed for run=${params.run.id} shot=${shot.shotId}: ${wrapped.message}`
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
    const videoTask = taskRecord(metadata, shot.shotId, "video");
    if (videoTask?.taskId && !shotState?.videoArtifactHash) {
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
    if (videoPromptCheckpoint?.state === "awaiting") {
      // Same self-heal race described above for image_prompt: persist
      // before moving on instead of falling through to the same-pass
      // handleVideoProvider dispatch (which also calls consumeCheckpoint's
      // fresh-DB guard).
      const healed = selfHealAwaitingCheckpoint(
        metadata,
        videoPromptCheckpoint,
        params.auth.userId
      );
      if (healed !== metadata) {
        metadata = healed;
        await persistRun({
          db: params.db,
          run: params.run,
          metadata: metadata as any,
          status: "running",
          currentStage: "video_generation",
          stageIndex: 7,
        });
        continue;
      }
      videoPromptCheckpoint = checkpointFor(
        metadata,
        "video_prompt",
        shot.shotId
      );
    }
    if (videoPromptCheckpoint?.state === "approved" && !videoTask?.taskId) {
      try {
        metadata = (await handleVideoProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
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
    let videoResultCheckpoint = checkpointFor(
      metadata,
      "video_result",
      shot.shotId
    );
    if (!videoResultCheckpoint && shotState?.videoArtifactHash) {
      const replacement = buildStagedCheckpoint({
        checkpointId: `video-result:${params.run.id}:shot-${shot.shotId}:r${plan.planRevision}:recovered`,
        kind: "video_result",
        shotId: shot.shotId,
        revision: shotState.revision,
        contentHash: shotState.videoArtifactHash,
        model: videoPromptCheckpoint?.approvedModel ?? STAGED_VIDEO_MODEL,
        provider:
          videoPromptCheckpoint?.approvedProvider ??
          modelProvider(STAGED_VIDEO_MODEL),
        estimatedCredits: 0,
        referenceManifestHash: plan.referenceManifestHash,
        autoApprove: { userId: params.run.userId },
      });
      metadata = replaceCheckpoint(metadata, replacement) as any;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
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
    if (videoResultCheckpoint?.state === "awaiting") {
      // Same self-heal race described above for image_prompt: persist
      // before moving on so the heal isn't silently discarded if a later
      // shot in this same pass throws (e.g. its own consumeCheckpoint
      // guard) and aborts the pass before anything else gets persisted.
      const healed = selfHealAwaitingCheckpoint(
        metadata,
        videoResultCheckpoint,
        params.auth.userId
      );
      if (healed !== metadata) {
        metadata = healed;
        await persistRun({
          db: params.db,
          run: params.run,
          metadata: metadata as any,
          status: "running",
          currentStage: "video_generation",
          stageIndex: 7,
        });
        continue;
      }
      videoResultCheckpoint = checkpointFor(
        metadata,
        "video_result",
        shot.shotId
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

  if (params.run.outputMode === "storyboard_images") {
    if (!allShotCheckpointsHave(metadata, "image_result", "approved")) {
      return { run: params.run, finalAssemblyApproved: false };
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
    const finalImageAssemblyCheckpoint = checkpointFor(
      metadata,
      "final_assembly"
    );
    if (finalImageAssemblyCheckpoint?.state === "awaiting")
      return { run: params.run, finalAssemblyApproved: false };
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
  const resolvedAudioStrategy =
    text(record(metadata).resolvedAudioStrategy) || "silent";
  if (resolvedAudioStrategy === "separate_tts_voiceover") {
    const audioCheckpoint = checkpointFor(metadata, "audio_plan");
    if (!audioCheckpoint) {
      const textContent = plan.shots.map(shot => shot.dialogue).join(" ");
      const audioPlan = buildStagedAudioPlan({
        text: textContent,
        language: "th",
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
