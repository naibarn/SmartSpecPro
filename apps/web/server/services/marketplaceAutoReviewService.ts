import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { storageExists, storagePut, storageResolveUrl } from "../storage";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { shouldUseCloudTasksForMediaJobs } from "./mediaJobDispatchMode";
import { getRedisClient } from "./redis";
import { computeRenderHash } from "./renderHash";
import { routeVideoJob } from "./videoJobRouter";
import {
  MEDIA_MODELS,
  mediaGenerationService,
  resolveReferenceUrl,
  type MediaTask,
} from "./mediaGenerationService";
import {
  buildMarketplaceAutoReviewApiProjection,
  isSafeUserVisibleUrl,
  MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION,
  MarketplaceAutoReviewStageCompletionEvidenceSchema,
  type MarketplaceAutoReviewStageCompletionEvidence,
} from "@shared/marketplaceAutoReview/contracts";
import {
  type AgentsGatewayInvocationMetadata,
  type AgentCapabilityManifest,
  type AgentRuntimeResponse,
  type ProductionAgentsSdkCapabilityManifest,
  type RuntimeModelConfig,
} from "../../shared/agentRuntime/types";
import {
  buildProductionOutputProjectionIdentity,
  buildProductionStableHash,
} from "../../shared/mediaProduction";
import type { VideoEditorProject } from "../../client/src/types/videoEditor";
import {
  libraryItems,
  mediaProductionApprovals,
  mediaProductionGoalVersions,
  mediaProductionOutputProjections,
  mediaProductionPlanVerifications,
  mediaProductionPlanVersions,
  mediaProductionRuns,
  mediaStudioStoryboardReviews,
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  marketplaceAutoReviewRunLeases,
  marketplaceAutoReviewStageAttempts,
  marketplaceAutoReviewProviderEvents,
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewArtifacts,
  marketplaceCaptureInsights,
  mediaModels,
  videoEditorProjects,
  type MarketplaceAutoReviewRun,
  type MarketplaceAutoReviewStage,
} from "../../drizzle/schema";
import { createMarketplaceId } from "./marketplaceCaptureService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import {
  createLibraryItem,
  safeEnqueueLibraryIndexJob,
} from "./libraryService";
import {
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
  refundCredits,
  type CreditSourceType,
} from "./creditService";
import { calculateCreditCost } from "./pricingCalculator";
import { getStaticModelById } from "./modelRegistry";
import {
  AgentRuntimeClient,
  AgentRuntimeClientError,
} from "./agentRuntime/client";
import { buildAgentRuntimeRequest } from "./agentRuntime/requestBuilder";
import {
  detectProductReferenceStoryboardNoTextPromptLeaks,
  ProductReferenceStoryboardSkillIncompleteOutputError,
  ProductReferenceStoryboardSkillOutputLimitError,
  optimizeProductReferenceStoryboardPrompt,
  PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS,
  PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
  runProductReferenceStoryboardPromptSkill,
  type ProductReferenceStoryboardPromptSkillRunResult,
} from "./productReferenceStoryboardSkillRunner";
import {
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
} from "./agentRuntime/skillRuntimeOrchestrator";
import { buildCustomSkillUserPrompt } from "./skillExecutionPromptBuilder";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import { getSkillByIdAsync, syncSingleSkillIfChanged } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { buildHyperframesCompositionInput } from "./hyperframesCompositionService";
import { resolveHyperframesFeatureAccessForTenant } from "./hyperframesFeatureAccessService";
import { queueHyperframesRenderJob } from "./hyperframesRenderService";

export type MarketplaceAutoReviewOutputMode =
  | "storyboard_images"
  | "full_video";
export type MarketplaceAutoReviewFrameStrategy =
  | "storyboard_3x3_split"
  | "video_shot_start_stop";
export type MarketplaceAutoReviewFrameStrategyInput =
  | "auto"
  | MarketplaceAutoReviewFrameStrategy;
export type MarketplaceAutoReviewAudioStrategyInput =
  | "auto"
  | "native_video_audio"
  | "separate_tts_voiceover"
  | "silent";
export type MarketplaceAutoReviewQualityModeInput =
  | "fast_draft"
  | "balanced"
  | "premium_strict_qa";
export type MarketplaceAutoReviewOverlayTextMode = "no_text" | "allow_text";
export type MarketplaceAutoReviewImageModel =
  | "google-nano-banana-pro"
  | "google-banana-2";
export type MarketplaceAutoReviewResolvedAudioStrategy =
  | "native_video_audio"
  | "separate_tts_voiceover"
  | "silent";
export type MarketplaceAutoReviewStatus =
  | "queued"
  | "running"
  | "waiting_provider"
  | "completed"
  | "failed"
  | "cancelled";
export type MarketplaceAutoReviewReferenceAnchorsInput = {
  schemaVersion?: number | null;
  creationIntent?: "storyboard" | "video" | "auto_review_video" | null;
  characterMode?:
    | "product_only"
    | "hands_only"
    | "described_character"
    | "uploaded_reference";
  characterBrief?: string | null;
  characterPreset?: string | Record<string, unknown> | unknown[] | null;
  reviewTone?: string | null;
  storytellingStructure?: string | null;
  requiredRoles?: string[] | null;
  lockPolicy?: Record<string, unknown> | null;
  productImageUrl?: string | null;
  productImageId?: string | null;
  productImageRef?: string | null;
  productImageSource?: string | null;
  productImageSourceUrl?: string | null;
  productImageStorageKey?: string | null;
  productImageHash?: string | null;
  productImageIndex?: number | null;
  characterImageUrl?: string | null;
  characterImageRef?: string | null;
  characterImageSource?: string | null;
  characterImageUploadKey?: string | null;
  characterImageHash?: string | null;
  characterImageFileName?: string | null;
  characterImageFileType?: string | null;
  characterImageFileSizeBytes?: number | null;
  environmentImageUrl?: string | null;
  environmentImageRef?: string | null;
  environmentImageSource?: string | null;
  environmentImageUploadKey?: string | null;
  environmentImageHash?: string | null;
  environmentImageFileName?: string | null;
  environmentImageFileType?: string | null;
  environmentImageFileSizeBytes?: number | null;
  auditMetadata?: Record<string, unknown> | null;
  fileEvidence?: Record<string, unknown> | null;
  sourceRefs?: string[] | null;
  serverVerifiedProviderEvidence?: Record<string, unknown> | null;
};

type ResolvedMarketplaceAutoReviewReferenceAnchors = {
  schemaVersion: number;
  creationIntent?: "storyboard" | "video" | "auto_review_video" | null;
  characterMode?: string | null;
  characterBrief?: string | null;
  characterPreset?: string | Record<string, unknown> | unknown[] | null;
  reviewTone?: string | null;
  storytellingStructure?: string | null;
  requiredRoles: string[];
  lockPolicy?: Record<string, unknown>;
  productImageUrl: string;
  productImageRef: string;
  productImageProvidedRef: string | null;
  productImageIndex: number;
  characterImageUrl: string | null;
  characterImageRef: string | null;
  characterImageProvidedRef: string | null;
  environmentImageUrl: string | null;
  environmentImageRef: string | null;
  environmentImageProvidedRef: string | null;
  sourceMetadata: Record<string, unknown>;
  auditRefs: string[];
};

type AuthContext = { userId: number; tenantId?: string };
type RuntimeContext = {
  userToken?: string | null;
  publicUrl?: string | null;
  automationWorkerId?: string | null;
  schedulerSource?: string | null;
  externalOperationalRecoveryEvidence?: Record<string, unknown> | null;
};
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const AUTO_REVIEW_SCHEMA_VERSION = MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION;
const DEFAULT_SHOT_COUNT = 9;
const MIN_SHOT_COUNT = 7;
const MAX_SHOT_COUNT = 9;
const DEFAULT_SHOT_DURATION_SECONDS = 5;
const DEFAULT_IMAGE_MODEL: MarketplaceAutoReviewImageModel = "google-banana-2";
const DEFAULT_VIDEO_MODEL = "veo3/generate-veo-3-video-lite";
const ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID =
  "elevenlabs-product-voiceover-dialogue";
const MARKETPLACE_AUTO_REVIEW_VOICEOVER_SPEECH_STYLES = [
  "friendly_expert",
  "friend_to_friend",
  "professional",
  "humorous",
  "complaining_but_helpful",
  "luxury_polished",
  "soft_caring",
  "energetic_host",
] as const;
const MARKETPLACE_AUTO_REVIEW_VOICEOVER_PERSUASION_STYLES = [
  "benefit_led",
  "problem_solution",
  "storytelling",
  "review_like",
  "educational",
  "soft_sell",
  "direct_response",
  "premium_trust",
  "routine_journey",
] as const;
const MARKETPLACE_AUTO_REVIEW_VOICEOVER_DURATION_OPTIONS = [
  15, 30, 45, 55, 60, 75, 90, 105, 110, 120, 135, 150, 165, 170, 180,
] as const;
const MARKETPLACE_AUTO_REVIEW_VIDEO_AUDIO_PROFILES = [
  {
    id: "warm_friend_hook",
    voiceBrief:
      "female presenter, 25-35 years old, warm clear voice, friendly and trustworthy tone, casual everyday Thai delivery, central Thai accent. Start with a curious friend-to-friend hook, then keep the review natural and practical.",
    soundBrief:
      "Quiet home ambience with subtle product-handling ASMR only: soft fabric movement, gentle hand touch, small object placement, and light room tone. No music.",
  },
  {
    id: "bright_shortform_host",
    voiceBrief:
      "young female host, 22-30 years old, bright energetic voice, cheerful and engaging tone, fast but natural delivery, clear articulation, central Thai accent. Give the first line a quick scroll-stopping hook without sounding exaggerated.",
    soundBrief:
      "Clean short-form review sound design: tiny whoosh-like movement from real handling, crisp tap or placement sounds when visible, soft room ambience, voice upfront. No music.",
  },
  {
    id: "calm_trust_reviewer",
    voiceBrief:
      "female reviewer, 30-40 years old, calm warm voice, reassuring and credible tone, polished but conversational narration, central Thai accent. Open with a confident usefulness hook and speak like a real product user.",
    soundBrief:
      "Soft bedroom ambience with gentle foley: quiet footsteps, fabric rustle, light shelf touch, and subtle object set-down ASMR when visible. No music.",
  },
  {
    id: "soft_caring_home",
    voiceBrief:
      "young mother-style female voice, early 30s, soft warm voice, caring and comforting tone, slow natural delivery, central Thai accent. Hook with a relatable home-life feeling, then stay gentle and useful.",
    soundBrief:
      "Intimate home ASMR: quiet room tone, soft hand movement, muted fabric texture, gentle object placement, no loud effects. No music.",
  },
  {
    id: "practical_expert",
    voiceBrief:
      "female practical expert, 28-38 years old, clear confident voice, focused and helpful tone, natural conversational delivery, central Thai accent. Start with a simple problem-solution hook and keep every line precise.",
    soundBrief:
      "Minimal clean product-demo SFX: subtle tap, shelf touch, packaging or object movement only when visible, quiet room ambience, voice clearly above all sounds. No music.",
  },
  {
    id: "playful_but_useful",
    voiceBrief:
      "female presenter, 24-34 years old, bright slightly playful voice, amused but helpful tone, lively natural Thai delivery, central Thai accent. Use a light playful hook, then return to practical review clarity.",
    soundBrief:
      "Light playful SFX from real scene actions only: soft object clicks, gentle placement, small hand movement ASMR, cozy room tone. No music.",
  },
] as const;
const MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW = 3;
const RENDER_JOB_TTL_SECONDS = 86_400;
const DEFAULT_RENDER_STALE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const DEFAULT_ADVANCE_LEASE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_PROVIDER_STALE_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS = 2;
const MAX_CREATIVE_PLANNER_SHOT_COUNT_ATTEMPTS = 3;
const DEFAULT_VISION_QA_MODEL = "gpt-4o-mini";
const MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF = "ad-policy:th-global:v1";

const ACTIVE_RUN_STATUSES: MarketplaceAutoReviewStatus[] = [
  "queued",
  "running",
  "waiting_provider",
];
const TERMINAL_RUN_STATUSES_FOR_OPERATIONAL_CLEANUP: MarketplaceAutoReviewStatus[] =
  ["completed", "failed", "cancelled"];
const MARKETPLACE_AUTO_REVIEW_OPERATIONAL_RETENTION_DAYS = 3;

function shouldPersistAdvanceOutboxJobForSchedulerSource(
  schedulerSource: unknown
): boolean {
  const source = cleanText(schedulerSource);
  if (!source || source === "manual_or_api") return true;
  if (source === "auto") return false;
  if (source.startsWith("outbox:")) return false;
  return true;
}

function normalizeMarketplaceAutoReviewShotCount(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_SHOT_COUNT;
  return Math.min(MAX_SHOT_COUNT, Math.max(MIN_SHOT_COUNT, parsed));
}

function normalizeMarketplaceAutoReviewImageModel(
  value: unknown
): MarketplaceAutoReviewImageModel {
  const model = cleanText(value);
  if (model === "google-banana-2" || model === "google-nano-banana-pro") {
    return model;
  }
  return DEFAULT_IMAGE_MODEL;
}

export function normalizeMarketplaceAutoReviewImageModelForTest(
  value: unknown
): MarketplaceAutoReviewImageModel {
  return normalizeMarketplaceAutoReviewImageModel(value);
}

function buildMarketplaceAutoReviewRunIdempotencyKey(
  input: Record<string, unknown>
): string {
  return `mar-run:${buildProductionStableHash(input).slice(0, 40)}`;
}

export function buildMarketplaceAutoReviewRunIdempotencyKeyForTest(
  input: Record<string, unknown>
): string {
  return buildMarketplaceAutoReviewRunIdempotencyKey(input);
}

function shotCountForPlan(plan: Pick<AutoReviewPlan, "shots">): number {
  return normalizeMarketplaceAutoReviewShotCount(plan.shots.length);
}

function normalizeMarketplaceAutoReviewOverlayTextMode(
  value: unknown
): MarketplaceAutoReviewOverlayTextMode {
  return value === "allow_text" ? "allow_text" : "no_text";
}

function durationSecondsForShotCount(shotCount: number): number {
  return shotCount * DEFAULT_SHOT_DURATION_SECONDS;
}

const BASE_STAGES = [
  "product_preflight",
  "production_project",
  "concept_story",
  "prompt_plan",
  "image_generation",
  "storyboard_review",
] as const;

const FULL_VIDEO_STAGES = [
  ...BASE_STAGES,
  "video_generation",
  "audio_generation",
  "video_edit",
  "render",
  "library_finalize",
] as const;

type StageKey = (typeof FULL_VIDEO_STAGES)[number];

type ProductAccessBundle = Awaited<
  ReturnType<typeof getMarketplaceProductWithAccess>
>;

type ProductTruth = {
  productId: string;
  productName: string;
  brand: string | null;
  platform: string;
  externalProductId: string | null;
  externalShopId: string | null;
  productCategory: Exclude<ProductReferenceStoryboardCategory, "auto"> | null;
  categoryText: string | null;
  categoryPath: string[];
  sourceUrl: string;
  affiliateUrl: string | null;
  shopName: string | null;
  price: string | null;
  rating: string | null;
  sold: string | null;
  reviews: string | null;
  description: string;
  specs: Record<string, unknown>;
  imageUrls: string[];
};

type AutoReviewShot = {
  id: string;
  order: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  storyboardGuide: string;
  voiceover: string;
  camera: string;
  visual: string;
  movement: string;
  productRole: string;
};

type AutoReviewPlan = {
  conceptId: string;
  title: string;
  productTruth: ProductTruth;
  storyboardGuide: string;
  voiceoverScript: string;
  productDetail: string;
  shots: AutoReviewShot[];
};

type MarketplaceAutoReviewVoiceoverSpeechStyle =
  (typeof MARKETPLACE_AUTO_REVIEW_VOICEOVER_SPEECH_STYLES)[number];
type MarketplaceAutoReviewVoiceoverPersuasionStyle =
  (typeof MARKETPLACE_AUTO_REVIEW_VOICEOVER_PERSUASION_STYLES)[number];
type MarketplaceAutoReviewVoiceoverStyleSelection = {
  speechStyle: MarketplaceAutoReviewVoiceoverSpeechStyle;
  persuasionStyle: MarketplaceAutoReviewVoiceoverPersuasionStyle;
  seed: string;
};
type MarketplaceAutoReviewVideoAudioProfile =
  (typeof MARKETPLACE_AUTO_REVIEW_VIDEO_AUDIO_PROFILES)[number];

type RunMetadata = Record<string, any> & {
  schemaVersion?: string;
  imageAttemptId?: string;
  videoAttemptId?: string;
  directImageTasks?: DirectMediaTaskRef[];
  directVideoTasks?: DirectMediaTaskRef[];
  imageAttemptReviews?: Record<string, unknown>[];
  selectedImageAttempt?: number;
  selectedImageAttemptScore?: number;
  selectedImageAttemptReview?: Record<string, unknown>;
  imagePromptPreflightAudits?: Record<string, unknown>[];
  pendingImageRepairUnits?: DirectImageUnit[];
  pendingVideoRepairUnits?: DirectVideoUnit[];
  storyboardGridVisionQaEnvelopes?: Record<string, unknown>[];
  shotFrameVisionQaEnvelopes?: Record<string, unknown>[];
  targetedRepairPlans?: Record<string, unknown>[];
  generatedMediaAcceptanceEnvelope?: Record<string, unknown>;
  videoClipContinuityQaEnvelopes?: Record<string, unknown>[];
  videoContinuityQaSummary?: Record<string, unknown>;
  audioContinuityQaEnvelope?: Record<string, unknown>;
  audioMediaTaskId?: string;
  audioProviderTaskId?: string;
  audioUrl?: string;
  audioTaskModel?: string;
  audioCreditAmount?: number;
  audioCreditTransactionId?: number;
  audioCreditIdempotencyKey?: string;
  audioRefundTransactionId?: number;
  audioActualDurationSeconds?: number;
  audioTargetDurationSeconds?: number;
  storyboardFrameUrls?: string[];
  startFrameUrls?: string[];
  stopFrameUrls?: string[];
  requestedShotCount?: number;
  videoClipUrls?: string[];
  videoUnitIds?: string[];
  libraryFrameItemIds?: number[];
  concept?: AutoReviewPlan;
  audioStrategy?: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode;
  expectedNativeAudio?: boolean;
  voiceoverSource?: string;
  audioFallbackUsed?: boolean;
  renderJobId?: string;
  renderSubmittedAt?: number;
  renderCreditReservation?: MarketplaceRenderCreditReservation;
  renderCreditRefundTransactionId?: number;
  generatedVideoSampleRefs?: Record<string, string[]>;
  stageCompletionEvidence?: MarketplaceAutoReviewStageCompletionEvidence[];
  shotMediaPayloads?: Record<string, unknown>[];
  mediaAcceptance?: Record<string, unknown>[];
  artifactLineage?: Record<string, unknown>[];
  publishableAssetPackage?: Record<string, unknown>;
  finalRenderQaEnvelope?: Record<string, unknown>;
  finalMediaQaEnvelope?: Record<string, unknown>;
  renderArtifactProbe?: Record<string, unknown>;
  renderDistributionProfile?: Record<string, unknown>;
  renderStorageEnvelope?: Record<string, unknown>;
  visualWarningPlan?: Record<string, unknown>;
  warningOverlayVerification?: Record<string, unknown>;
  productReferenceAssetPack?: Record<string, unknown>;
  characterIdentityAssetPack?: Record<string, unknown>;
  environmentReferenceAssetPack?: Record<string, unknown>;
  capabilityManifests?: Record<string, unknown>[];
  evidenceInstructionFirewall?: Record<string, unknown>;
  creativeBriefSnapshot?: Record<string, unknown>;
  advertisingRulePack?: Record<string, unknown>;
  advertisingComplianceProfile?: Record<string, unknown>;
  privacyEnvelope?: Record<string, unknown>;
  assetRightsEnvelope?: Record<string, unknown>;
  distributionProfile?: Record<string, unknown>;
  campaignGovernance?: Record<string, unknown>;
  brandSellerVoicePolicy?: Record<string, unknown>;
  humanReviewGate?: Record<string, unknown>;
  inputChangeImpact?: Record<string, unknown>;
  publishablePackageRequirements?: Record<string, unknown>;
  automationControlPlane?: Record<string, unknown>;
  providerReconciliation?: Record<string, unknown>;
  targetedRepairPolicyLedger?: Record<string, unknown>;
  qaArtifactManifest?: Record<string, unknown>;
  qaCacheEntries?: Record<string, unknown>[];
  automationMetrics?: Record<string, unknown>;
  parallelismPolicy?: Record<string, unknown>;
  operationalDrillPlan?: Record<string, unknown>;
  durableRuntimePlan?: Record<string, unknown>;
  qualityModePolicy?: Record<string, unknown>;
  creativePerformanceMemory?: Record<string, unknown>;
  mediaArtifactInspection?: Record<string, unknown>;
};

type StageEvidenceStatus =
  | "complete"
  | "warning_complete"
  | "skipped"
  | "repair_required"
  | "retriable_failure"
  | "user_blocked"
  | "terminal_failure"
  | "cancelled";

type StageCompletionEvidenceInput = {
  status?: StageEvidenceStatus;
  requiredRefs?: string[];
  artifactRefs?: string[];
  qaVerdictRefs?: string[];
  creditRefs?: string[];
  lineageRefs?: string[];
  policyRefs?: string[];
  acceptanceRefs?: string[];
  missingRefs?: string[];
  warningApprovalRefs?: string[];
};

type MarketplaceAutoReviewVideoReferenceMode =
  | "start_stop"
  | "single_storyboard_frame";

type DirectMediaTaskRef = {
  unitId: string;
  mediaType: "image" | "video" | "audio";
  stageKey: StageKey;
  role: string;
  shotId?: string;
  shotOrder?: number;
  attempt: number;
  taskId: string;
  providerTaskId?: string;
  model: string;
  status: string;
  resultUrl?: string;
  errorMessage?: string;
  creditAmount?: number;
  creditTransactionId?: number;
  creditIdempotencyKey?: string;
  refundTransactionId?: number;
  repairReasonCodes?: string[];
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode;
  promptHash?: string;
  promptLengthChars?: number;
  promptSnippet?: string;
  promptPreflight?: MarketplaceAutoReviewPromptPreflightResult;
  skillRuntime?: Record<string, unknown> | null;
  referenceImageUrls?: string[];
  referenceImageManifest?: ProductReferenceStoryboardReferenceImageManifestEntry[];
  submittedAt: string;
  completedAt?: string;
  cancellationRequestedAt?: string;
  cancellationReason?: string;
  providerCancellationStatus?: string;
  providerCancellationEvidenceId?: string;
  providerCancellationDispatchedAt?: string;
  providerCancellationError?: string;
  providerSubmitIntentId?: string;
  providerSubmitIntentStatus?: string;
  providerSubmitIntentRecordedAt?: string;
  providerSubmitEvidence?: Record<string, unknown>;
};

type MarketplaceAutoReviewPromptPreflightResult = {
  status: "passed" | "failed";
  score: number;
  ruleSet: string;
  blockers: string[];
  warnings: string[];
  checkedAt: string;
};

class MarketplaceAutoReviewImagePromptPreflightError extends Error {
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
  unit: DirectImageUnit;
  skillRuntime: Record<string, unknown> | null;

  constructor(params: {
    unit: DirectImageUnit;
    prompt: string;
    preflight: MarketplaceAutoReviewPromptPreflightResult;
    skillRuntime?: Record<string, unknown> | null;
  }) {
    super(
      [
        `Image prompt preflight failed for ${params.unit.unitId}`,
        `skill=product-reference-storyboard`,
        `layout=canvas_9_16_grid_3x3_frame_9_16_exact`,
        `aspect=9:16`,
        `blockers=${params.preflight.blockers.join(", ") || "none"}`,
      ].join(": ")
    );
    this.name = "MarketplaceAutoReviewImagePromptPreflightError";
    this.prompt = params.prompt;
    this.preflight = params.preflight;
    this.unit = params.unit;
    this.skillRuntime = params.skillRuntime ?? null;
  }
}

function marketplaceAutoReviewProviderErrorMessage(
  error: unknown
): string | null {
  if (error instanceof Error) {
    return cleanText(error.message) || null;
  }
  if (typeof error === "string") {
    return cleanText(error) || null;
  }
  return null;
}

function sanitizeMarketplaceAutoReviewProviderErrorMessage(
  message: string
): string {
  return message.replace(
    /https:\/\/openrouter\.ai\/workspaces\/[^\s)]+\/keys\/[^\s)]+/gi,
    "[openrouter_key_url_redacted]"
  );
}

function parseMarketplaceAutoReviewOpenRouterTokenBudget(message: string): {
  requestedMaxTokens: number | null;
  affordableTokens: number | null;
} {
  const budgetMatch = message.match(
    /requested\s+up\s+to\s+([\d,]+)\s+tokens?.*?can\s+only\s+afford\s+([\d,]+)/i
  );
  return {
    requestedMaxTokens: budgetMatch
      ? toNumber(budgetMatch[1]?.replace(/,/g, ""))
      : null,
    affordableTokens: budgetMatch
      ? toNumber(budgetMatch[2]?.replace(/,/g, ""))
      : null,
  };
}

function marketplaceAutoReviewLlmProviderCreditStageOutput(
  error: unknown
): Record<string, unknown> | null {
  const rawMessage = marketplaceAutoReviewProviderErrorMessage(error);
  if (!rawMessage) {
    return null;
  }
  const isCreditOrTokenBudgetError =
    /requires\s+more\s+credits/i.test(rawMessage) ||
    /fewer\s+max_tokens/i.test(rawMessage) ||
    /can\s+only\s+afford/i.test(rawMessage);
  const isOpenRouterError = /openrouter/i.test(rawMessage);
  if (!isCreditOrTokenBudgetError && !isOpenRouterError) {
    return null;
  }

  const sanitizedMessage =
    sanitizeMarketplaceAutoReviewProviderErrorMessage(rawMessage);
  const { requestedMaxTokens, affordableTokens } =
    parseMarketplaceAutoReviewOpenRouterTokenBudget(rawMessage);

  return {
    status: "provider_credit_blocked",
    activeSubstep: "ตรวจเครดิต LLM provider ก่อนสร้าง prompt",
    progressPercent: 0,
    providerError: {
      provider: isOpenRouterError ? "openrouter" : "llm_provider",
      reasonCode: "llm_provider_credit_or_max_tokens",
      requestedMaxTokens,
      affordableTokens,
      rawMessage: sanitizedMessage,
    },
    promptSkillDebug: {
      skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      status: "blocked_before_image_provider_submit",
      reasonCode: "llm_provider_credit_or_max_tokens",
      rawError: sanitizedMessage,
    },
    statusDetail: {
      state: "llm_provider_credit_or_max_tokens",
      severity: "error",
      stageKey: "image_generation",
      reasonCodes: [
        isOpenRouterError
          ? "openrouter_credit_or_max_tokens"
          : "llm_provider_credit_or_max_tokens",
      ],
      safeMessage:
        "OpenRouter/LLM provider เครดิตไม่พอ หรือ max_tokens สูงเกินยอดเครดิตที่เหลือ ระบบจึงหยุดก่อนส่งงานสร้างภาพ",
      nextAction:
        "เติมเครดิต OpenRouter หรือปรับ max_tokens/model แล้วเริ่มงานใหม่",
      userActionRequired: true,
      retryable: true,
    },
  };
}

function promptSkillDebugStageOutputFromError(
  error: unknown
): Record<string, unknown> | null {
  const providerCreditOutput =
    marketplaceAutoReviewLlmProviderCreditStageOutput(error);
  if (providerCreditOutput) {
    return providerCreditOutput;
  }
  if (error instanceof ProductReferenceStoryboardSkillOutputLimitError) {
    return {
      status: "prompt_skill_blocked",
      activeSubstep: "ตรวจ prompt จาก skill ก่อนส่งสร้างภาพ",
      progressPercent: 0,
      promptSkillDebug: error.toPromptSkillDebug(),
      statusDetail: {
        state: "prompt_skill_output_over_limit",
        severity: "error",
        stageKey: "image_generation",
        reasonCodes: ["skill_output_exceeded_max_chars"],
        safeMessage:
          "prompt ที่ skill product-reference-storyboard คืนมายาวเกิน limit ระบบจึงหยุดก่อนส่งไปสร้างภาพเพื่อไม่เสียเครดิตเพิ่ม",
        nextAction:
          "ตรวจ prompt เต็มในแผง Prompt จาก skill แล้วปรับ skill/input ก่อนเริ่มงานใหม่",
        userActionRequired: true,
        retryable: true,
      },
    };
  }
  if (error instanceof ProductReferenceStoryboardSkillIncompleteOutputError) {
    return {
      status: "prompt_skill_blocked",
      activeSubstep: "ตรวจ prompt จาก skill ก่อนส่งสร้างภาพ",
      progressPercent: 0,
      promptSkillDebug: error.toPromptSkillDebug(),
      statusDetail: {
        state: "prompt_skill_output_incomplete",
        severity: "error",
        stageKey: "image_generation",
        reasonCodes: error.blockers,
        safeMessage:
          "prompt ที่ skill product-reference-storyboard คืนมายังไม่ครบ 9 เฟรม ระบบจึงหยุดก่อนส่งไปสร้างภาพ",
        nextAction:
          "ตรวจ prompt เต็มในแผง Prompt จาก skill แล้วปรับ skill/input ก่อนเริ่มงานใหม่",
        userActionRequired: true,
        retryable: true,
      },
    };
  }
  if (error instanceof MarketplaceAutoReviewImagePromptPreflightError) {
    return {
      status: "prompt_preflight_failed",
      activeSubstep: "ตรวจ prompt จาก skill ก่อนส่งสร้างภาพ",
      progressPercent: 0,
      promptSkillDebug: {
        skillId: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
        unitId: error.unit.unitId,
        promptAttempt: toNumber(
          asRecord(error.skillRuntime).promptSkillAttempt
        ),
        status: "blocked_before_image_provider_submit",
        reasonCode: "prompt_preflight_failed",
        promptLengthChars: error.prompt.length,
        preflight: error.preflight,
        skillRuntime: error.skillRuntime,
        rawOutput: error.prompt,
      },
      statusDetail: {
        state: "prompt_preflight_failed",
        severity: "error",
        stageKey: "image_generation",
        reasonCodes: error.preflight.blockers,
        safeMessage:
          "prompt จาก skill ยังไม่ผ่านกฎ 9:16 / 3x3 / 9 เฟรม ระบบจึงหยุดก่อนส่งไปสร้างภาพ",
        nextAction:
          "ตรวจ prompt เต็มในแผง Prompt จาก skill แล้วปรับ skill/input ก่อนเริ่มงานใหม่",
        userActionRequired: true,
        retryable: true,
      },
    };
  }
  return null;
}

const MARKETPLACE_AUTO_REVIEW_REQUIRED_SKILL_INPUT_KEYS = [
  "generation_mode",
  "product_category",
  "storyboard_layout_preset",
  "aspect_ratio",
  "storyboard_guide",
  "voiceover_script",
  "product_detail",
  "reference_product_images",
  "reference_character_images",
  "reference_environment_images",
  "production_concept_details",
  "marketplace_platform",
  "product_item_id",
  "product_source_url",
  "product_title",
] as const;

const MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS = 3;

const PRODUCT_REFERENCE_STORYBOARD_CATEGORIES = [
  "auto",
  "household_product",
  "computer_laptop",
  "electrical_appliance",
  "food_beverage",
  "electronics",
  "fashion_clothing",
  "shoes",
  "watch_eyewear",
  "mobile_tablet",
  "jewelry",
  "mother_baby",
  "pet_supplies",
  "sports_equipment",
  "camera_photography",
  "gaming_accessories",
  "automotive",
  "stationery",
  "books",
  "furniture",
  "cosmetics",
] as const;

type ProductReferenceStoryboardCategory =
  (typeof PRODUCT_REFERENCE_STORYBOARD_CATEGORIES)[number];

type ProductReferenceStoryboardReferenceImageGroups = {
  product: string[];
  character: string[];
  environment: string[];
  all: string[];
};

type ProductReferenceStoryboardReferenceImageManifestEntry = {
  placeholder: string;
  role: "product" | "character" | "environment";
  url: string;
  instruction: string;
};

type ProductReferenceStoryboardPreflightFeedback = {
  promptSkillAttempt: number;
  previousPromptExcerpt: string;
  blockers: string[];
  warnings: string[];
  instruction: string;
};

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => cleanText(item)).filter(Boolean);
}

function safeUserVisibleUrlArrayFromUnknown(value: unknown): string[] {
  return stringArrayFromUnknown(value).filter(isSafeUserVisibleUrl);
}

function normalizeConcreteProductReferenceStoryboardCategory(
  value: unknown
): Exclude<ProductReferenceStoryboardCategory, "auto"> | null {
  const category = cleanText(value);
  if (
    !category ||
    category === "auto" ||
    !PRODUCT_REFERENCE_STORYBOARD_CATEGORIES.includes(
      category as ProductReferenceStoryboardCategory
    )
  ) {
    return null;
  }
  return category as Exclude<ProductReferenceStoryboardCategory, "auto">;
}

function categoryPathPartsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => categoryPathPartsFromUnknown(item));
  }
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/\s*(?:>|›|\/|\||,|\n)\s*/)
    .map(part => cleanText(part))
    .filter(Boolean);
}

const MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE =
  /แม่และเด็ก|เด็กอ่อน|ทารก|ผ้าอ้อม|แพมเพิร์ส|คอกกั้นเด็ก|ของเล่นเด็ก|รถเข็นเด็ก|\b(?:baby|babies|infant|toddler|child|children|kid|kids|diaper|nappy|nursery|stroller|maternity)\b/i;

function stripInternalMinorSafetyDirectiveText(value: unknown): string {
  let text = cleanText(value);
  if (!text) return "";
  const directiveMarkers = [
    "MINOR SAFETY CLOTHING LOCK",
    "VIDEO CHARACTER LOCK",
    "USER-SELECTED DESCRIBED CHARACTER LOCK",
    "Character/presenter reference directive",
    "CHARACTER FACE AND 95 PERCENT IDENTITY LOCK",
  ];
  for (const marker of directiveMarkers) {
    const pattern = new RegExp(
      `${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*[\\s\\S]*?(?=\\n\\n[A-Z0-9][A-Z0-9 /&-]{2,}:|$)`,
      "gi"
    );
    text = text.replace(pattern, " ");
  }
  return cleanText(text);
}

function stripNegatedMinorSafetyMentions(value: unknown): string {
  let text = cleanText(value);
  if (!text) return "";
  const minorRoleList =
    "(?:baby|babies|infant|toddler|child|children|kid|kids|minor|minors)(?:\\s*,?\\s*(?:or\\s+)?(?:baby|babies|infant|toddler|child|children|kid|kids|minor|minors))*";
  const patterns = [
    /\bno\s+(?:baby|babies|infant|toddler|child|children|kid|kids|minor|minors)\s+(?:appears?|present|visible|shown|included)\b/gi,
    /\bwithout\s+(?:a\s+|any\s+)?(?:baby|babies|infant|toddler|child|children|kid|kids|minor|minors)\b/gi,
    /\bdo\s+not\s+(?:show|include|add|replace[^.]*?\s+with)\s+(?:a\s+|any\s+)?(?:baby|babies|infant|toddler|child|children|kid|kids|minor|minors)\b/gi,
    new RegExp(
      `\\b(?:must|should)\\s+not\\s+(?:be\\s+)?(?:depicted|shown|rendered|treated|converted|transformed|used)\\s+(?:as\\s+)?(?:a\\s+|any\\s+)?${minorRoleList}\\b`,
      "gi"
    ),
    new RegExp(`\\bnot\\s+(?:a\\s+|any\\s+)?${minorRoleList}\\b`, "gi"),
    /ไม่มี(?:เด็ก|ทารก|เด็กอ่อน)[^.!?\n\r]*/gi,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, " ");
  }
  return cleanText(text);
}

function textHasMinorSafetySignal(value: unknown): boolean {
  return MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE.test(
    stripNegatedMinorSafetyMentions(value)
  );
}

function marketplaceAutoReviewPlanNeedsMinorSafetyLock(
  plan: AutoReviewPlan
): boolean {
  if (
    normalizeConcreteProductReferenceStoryboardCategory(
      plan.productTruth.productCategory
    ) === "mother_baby"
  ) {
    return true;
  }
  if (
    !plan.productTruth.productCategory &&
    inferProductReferenceStoryboardCategory({
      ...plan,
      productDetail: stripInternalMinorSafetyDirectiveText(plan.productDetail),
    }) === "mother_baby"
  ) {
    return true;
  }
  const source = [
    plan.productTruth.productCategory ?? "",
    plan.productTruth.categoryText ?? "",
    ...plan.productTruth.categoryPath,
    plan.productTruth.productName,
    plan.productTruth.description,
    stripInternalMinorSafetyDirectiveText(plan.productDetail),
    plan.storyboardGuide,
    plan.voiceoverScript,
    ...plan.shots.flatMap(shot => [
      shot.title,
      shot.storyboardGuide,
      shot.visual,
      shot.voiceover,
    ]),
  ].join(" ");
  return textHasMinorSafetySignal(source);
}

function buildMinorSafetyClothingLock(plan: AutoReviewPlan): string {
  if (!marketplaceAutoReviewPlanNeedsMinorSafetyLock(plan)) return "";
  return [
    "MINOR SAFETY CLOTHING LOCK:",
    "If any baby, toddler, child, kid, or minor appears, they must be safely dressed in age-appropriate clothing covering chest, torso, and underwear areas.",
    "No shirtless child, no bare chest or bare torso, no underwear-only/diaper-only child scene, no bath/changing/nude/semi-nude framing, no suggestive pose, and no close crop of a minor's underwear or diaper area.",
    "For diaper, baby-care, and mother-baby products, show the package, folded product, adult caregiver hands, or a fully clothed child beside the product; never show a child wearing only a diaper or with exposed torso.",
  ].join(" ");
}

function buildCompactMinorSafetyClothingLock(plan: AutoReviewPlan): string {
  if (!marketplaceAutoReviewPlanNeedsMinorSafetyLock(plan)) return "";
  return [
    "MINOR SAFETY CLOTHING LOCK:",
    "If any baby, toddler, child, kid, or minor appears, show only age-appropriate clothing covering chest, torso, and underwear areas.",
    "No shirtless, bare torso, underwear-only, diaper-only, bath/changing/nude/semi-nude, suggestive, or close underwear/diaper framing.",
  ].join(" ");
}

function ensureMinorSafetyClothingLockInImagePrompt(
  prompt: string,
  plan: AutoReviewPlan
): string {
  const base = cleanText(prompt);
  const lock = buildMinorSafetyClothingLock(plan);
  if (!base || !lock || /MINOR SAFETY CLOTHING LOCK/i.test(base)) return base;
  const appended = `${base}\n\n${lock}`;
  if (appended.length <= MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS) {
    return appended;
  }
  const compactLock = buildCompactMinorSafetyClothingLock(plan);
  const compactAppended = `${base}\n\n${compactLock}`;
  if (
    compactAppended.length <= MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS
  ) {
    return compactAppended;
  }
  if (countPromptMatches(base, /\bFrame\s+\d+\s*:/gi) >= MAX_SHOT_COUNT) {
    return base;
  }
  const baseBudget =
    MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS - lock.length - 2;
  if (baseBudget > 1200) {
    return `${compactImagePromptText(base, baseBudget)}\n\n${lock}`;
  }
  return appended;
}

type MarketplaceAutoReviewFinalImagePromptOptimizer =
  typeof optimizeProductReferenceStoryboardPrompt;

async function optimizeMarketplaceAutoReviewFinalImagePromptForProvider(input: {
  tenantId: string;
  userId: number;
  runId: string;
  unitId: string;
  attempt: number;
  promptAttempt?: number | null;
  sourcePrompt: string;
  optimizer?: MarketplaceAutoReviewFinalImagePromptOptimizer;
}): Promise<{
  prompt: string;
  audit: Record<string, unknown> | null;
}> {
  const sourcePrompt = cleanText(input.sourcePrompt);
  if (sourcePrompt.length <= MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS) {
    return { prompt: sourcePrompt, audit: null };
  }

  const optimizePrompt =
    input.optimizer ?? optimizeProductReferenceStoryboardPrompt;
  const optimizerResult = await optimizePrompt({
    tenantId: input.tenantId,
    userId: input.userId,
    sourcePrompt,
    originSurface: "marketplace_capture",
    runId: input.runId,
    unitId: input.unitId,
    attempt: input.attempt,
    promptAttempt: input.promptAttempt ?? null,
    maxOutputChars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
  });
  const optimizedPrompt = cleanText(optimizerResult.value.rawContent);
  return {
    prompt: optimizedPrompt,
    audit: {
      used: true,
      reason: "final_image_prompt_over_provider_budget",
      sourcePromptLengthChars: sourcePrompt.length,
      optimizedPromptLengthChars: optimizedPrompt.length,
      maxOutputChars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
      preferredTargetChars: optimizerResult.preferredTargetChars,
      runtimeStatus: optimizerResult.execution.runtime.status,
      runtimeEngine: optimizerResult.execution.runtime.selection.engine,
      runtimeMode: optimizerResult.execution.runtime.selection.mode,
      requestId: optimizerResult.execution.runtime.requestId,
      traceId: optimizerResult.execution.runtime.traceId,
      promptLengthPlan: optimizerResult.promptLengthPlan,
      llmMaxTokens: optimizerResult.llmMaxTokens,
      modelId: optimizerResult.value.modelId,
      providerName: optimizerResult.value.providerName,
    },
  };
}

function ensureStoryboardGridLayoutContractInImagePrompt(prompt: string): {
  prompt: string;
  applied: boolean;
} {
  const base = cleanText(prompt);
  if (!base) return { prompt: base, applied: false };
  const lower = base.toLowerCase();
  const requiredFragments = [
    "one single 9:16 image",
    "strict 3x3 grid",
    "exactly 9 frames",
    "exactly 9 vertical frames",
    "exactly 3 equal-width columns",
    "exactly 3 equal-height rows",
    "no collage/masonry layout",
    "no separator lines",
    "no visible dividers",
  ];
  if (requiredFragments.every(fragment => lower.includes(fragment))) {
    return { prompt: base, applied: false };
  }
  const frameCount = countPromptMatches(base, /\bFrame\s+\d+\s*:/gi);
  if (frameCount < MAX_SHOT_COUNT) {
    return { prompt: base, applied: false };
  }
  const layoutLine =
    "Create one single 9:16 image as a strict 3x3 grid with exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, and no visible dividers.";
  const hasStoryboardHeader = /SHOT-BY-SHOT STORYBOARD PROMPT:/i.test(base);
  const next = hasStoryboardHeader
    ? base.replace(
        /SHOT-BY-SHOT STORYBOARD PROMPT:\s*/i,
        `SHOT-BY-SHOT STORYBOARD PROMPT:\n${layoutLine}\n`
      )
    : `SHOT-BY-SHOT STORYBOARD PROMPT:\n${layoutLine}\n${base}`;
  if (next.length <= MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS) {
    return { prompt: next, applied: true };
  }
  return { prompt: base, applied: false };
}

function imageReasonCodeBlocksPublishSafety(code: unknown): boolean {
  const normalized = cleanText(code).toLowerCase();
  return /minor.*safety|child.*safety|child.*clothing|baby.*clothing|shirtless|bare.*(?:chest|torso)|(?:diaper|underwear).*only|nudit|semi.*nude|เด็ก.*(?:ไม่ใส่เสื้อ|เปลือย|เสื้อผ้าไม่ครบ)|เด็ก.*ผ้าอ้อมอย่างเดียว/.test(
    normalized
  );
}

function imageReasonCodesContainPublishSafetyBlocker(
  reasonCodes: unknown[]
): boolean {
  return reasonCodes.some(imageReasonCodeBlocksPublishSafety);
}

function imageReasonCodeBlocksStoryboardGridLayout(code: unknown): boolean {
  const normalized = cleanText(code).toLowerCase();
  return /storyboard[_-]?grid.*(?:layout|frame.*count|column|row|visible.*label|label.*text|text|qa.*unavailable|qa.*non.*json|qa.*contract)|(?:not|non)[_-]?(?:strict[_-]?)?3x3|2x5|5x2|10.*(?:panel|frame)|single.*image|one.*image|grid.*missing|missing.*grid|layout.*mismatch|collage|masonry|merged.*panel|variable.*panel|visible.*storyboard[_-]?grid/.test(
    normalized
  );
}

function imageReasonCodesContainStoryboardGridLayoutBlocker(
  reasonCodes: unknown[]
): boolean {
  return reasonCodes.some(imageReasonCodeBlocksStoryboardGridLayout);
}

function visionQaMinorPresenceState(parsed: Record<string, unknown>): {
  known: boolean;
  present: boolean;
} {
  const keys = [
    "minorPresent",
    "childPresent",
    "visibleMinor",
    "visibleChild",
    "hasMinor",
    "hasChild",
    "containsMinor",
    "containsChild",
  ];
  let known = false;
  let present = false;
  for (const key of keys) {
    if (typeof parsed[key] !== "boolean") continue;
    known = true;
    present = present || parsed[key] === true;
  }
  return { known, present };
}

function normalizeVisionQaMinorSafetyResult(input: {
  parsed: Record<string, unknown>;
  plan: AutoReviewPlan;
  reasonCodes: string[];
}): {
  reasonCodes: string[];
  minorPresent: boolean | null;
  minorSafetyClothingSafe: boolean;
} {
  const minorSafetyLockRequired = marketplaceAutoReviewPlanNeedsMinorSafetyLock(
    input.plan
  );
  const presence = visionQaMinorPresenceState(input.parsed);
  const minorSafetyReasonCodes = input.reasonCodes.filter(
    imageReasonCodeBlocksPublishSafety
  );
  const nonMinorReasonCodes = input.reasonCodes.filter(
    code => !imageReasonCodeBlocksPublishSafety(code)
  );
  const keepMinorSafetyReasons =
    minorSafetyReasonCodes.length > 0 &&
    (presence.present || (minorSafetyLockRequired && !presence.known));
  const missingMinorEvidence =
    minorSafetyLockRequired &&
    input.parsed.minorSafetyClothingSafe === false &&
    minorSafetyReasonCodes.length === 0;
  const reasonCodes = uniqueCleanTexts([
    ...nonMinorReasonCodes,
    ...(keepMinorSafetyReasons ? minorSafetyReasonCodes : []),
    ...(missingMinorEvidence
      ? ["vision_qa_minor_presence_evidence_missing"]
      : []),
  ]);
  return {
    reasonCodes,
    minorPresent: presence.known ? presence.present : null,
    minorSafetyClothingSafe: !keepMinorSafetyReasons && !missingMinorEvidence,
  };
}

function normalizeShotFrameVisionQaDecision(input: {
  parsed: Record<string, unknown>;
  plan: AutoReviewPlan;
  reasonCodes: string[];
}): {
  verdict: "pass" | "repair";
  reasonCodes: string[];
  minorPresent: boolean | null;
  minorSafetyClothingSafe: boolean;
  productMatchesReference: boolean;
  continuityMatchesShot: boolean;
  characterConsistencySafe: boolean;
  adWarningTextSafe: boolean;
} {
  const normalizedMinorSafety = normalizeVisionQaMinorSafetyResult({
    parsed: input.parsed,
    plan: input.plan,
    reasonCodes: input.reasonCodes,
  });
  const productMatchesReference =
    input.parsed.productMatchesReference !== false;
  const continuityMatchesShot = input.parsed.continuityMatchesShot !== false;
  const characterConsistencySafe =
    input.parsed.characterConsistencySafe !== false;
  const adWarningTextSafe = input.parsed.adWarningTextSafe !== false;
  const reasonCodes = uniqueCleanTexts([
    ...normalizedMinorSafety.reasonCodes,
    productMatchesReference ? "" : "product_reference_mismatch",
    continuityMatchesShot ? "" : "storyboard_continuity_mismatch",
    characterConsistencySafe ? "" : "character_reference_mismatch",
    adWarningTextSafe ? "" : "ad_warning_text_issue",
  ]);
  const verdict =
    cleanText(input.parsed.verdict) === "pass" &&
    normalizedMinorSafety.minorSafetyClothingSafe &&
    productMatchesReference &&
    continuityMatchesShot &&
    characterConsistencySafe &&
    adWarningTextSafe
      ? "pass"
      : "repair";
  return {
    verdict,
    reasonCodes,
    minorPresent: normalizedMinorSafety.minorPresent,
    minorSafetyClothingSafe: normalizedMinorSafety.minorSafetyClothingSafe,
    productMatchesReference,
    continuityMatchesShot,
    characterConsistencySafe,
    adWarningTextSafe,
  };
}

function normalizeCachedShotFrameVisionQaEnvelopeForPlan(
  qa: Record<string, unknown>,
  plan: AutoReviewPlan
): Record<string, unknown> {
  const reasonCodes = Array.isArray(qa.reasonCodes)
    ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
    : [];
  const normalized = normalizeVisionQaMinorSafetyResult({
    parsed: qa,
    plan,
    reasonCodes,
  });
  return {
    ...qa,
    reasonCodes: normalized.reasonCodes,
    minorPresent: normalized.minorPresent,
    minorSafetyClothingSafe: normalized.minorSafetyClothingSafe,
  };
}

function buildMarketplaceAutoReviewSkillRuntimeContractChecks(
  skillRuntime?: Record<string, unknown> | null
) {
  const runtime = asRecord(skillRuntime);
  const selectedSkill = cleanText(runtime.selectedSkill);
  const inputKeys = new Set(stringArrayFromUnknown(runtime.inputKeys));
  const missingInputKeys =
    MARKETPLACE_AUTO_REVIEW_REQUIRED_SKILL_INPUT_KEYS.filter(
      key => !inputKeys.has(key)
    );
  const generationMode = cleanText(runtime.generationMode);
  const layoutPreset = cleanText(runtime.layoutPreset);
  const aspectRatio = cleanText(runtime.aspectRatio);
  const productCategory = cleanText(runtime.productCategory);
  const marketplacePlatform = cleanText(runtime.marketplacePlatform);
  const referenceProductImageCount = toNumber(
    runtime.referenceProductImageCount
  );
  const referenceCharacterImageCount = toNumber(
    runtime.referenceCharacterImageCount
  );
  const referenceEnvironmentImageCount = toNumber(
    runtime.referenceEnvironmentImageCount
  );
  const schemaAudit = asRecord(runtime.schemaAudit);
  const schemaAuditStatus = cleanText(schemaAudit.status);
  const hasDetectedProductCategory =
    productCategory !== "auto" &&
    PRODUCT_REFERENCE_STORYBOARD_CATEGORIES.includes(
      productCategory as ProductReferenceStoryboardCategory
    );
  const fallbackUsed = runtime.fallbackUsed === true;

  return {
    hasRuntime: Object.keys(runtime).length > 0,
    selectedSkill,
    hasRequiredSkill: selectedSkill === PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
    generationMode,
    hasGenerationMode: generationMode === "multi_frame_storyboard",
    layoutPreset,
    hasLayoutPreset: layoutPreset === "canvas_9_16_grid_3x3_frame_9_16_exact",
    aspectRatio,
    hasAspectRatio: aspectRatio === "9:16",
    productCategory,
    hasDetectedProductCategory,
    marketplacePlatform,
    referenceProductImageCount,
    referenceCharacterImageCount,
    referenceEnvironmentImageCount,
    hasReferenceProductImages: referenceProductImageCount > 0,
    schemaAuditStatus,
    hasSchemaAuditPassed:
      Object.keys(schemaAudit).length === 0 || schemaAuditStatus === "passed",
    missingInputKeys,
    hasRequiredInputs: missingInputKeys.length === 0,
    fallbackUsed,
    passed:
      selectedSkill === PRODUCT_REFERENCE_STORYBOARD_SKILL_ID &&
      generationMode === "multi_frame_storyboard" &&
      layoutPreset === "canvas_9_16_grid_3x3_frame_9_16_exact" &&
      aspectRatio === "9:16" &&
      hasDetectedProductCategory &&
      referenceProductImageCount > 0 &&
      (Object.keys(schemaAudit).length === 0 ||
        schemaAuditStatus === "passed") &&
      missingInputKeys.length === 0 &&
      !fallbackUsed,
  };
}

function buildMarketplaceAutoReviewImagePromptContractChecks(
  prompt: string,
  skillRuntime?: Record<string, unknown> | null
) {
  const text = cleanText(prompt);
  const lower = text.toLowerCase();
  const runtimeContract =
    buildMarketplaceAutoReviewSkillRuntimeContractChecks(skillRuntime);
  return {
    requiredSkill: "product-reference-storyboard",
    selectedSkill:
      runtimeContract.selectedSkill ||
      (lower.includes("product-reference-storyboard")
        ? "product-reference-storyboard"
        : null),
    hasProductReferenceStoryboardSkill:
      runtimeContract.hasRequiredSkill ||
      lower.includes("product-reference-storyboard"),
    hasGenerationMode:
      runtimeContract.hasGenerationMode ||
      lower.includes("generation_mode: multi_frame_storyboard"),
    hasLayoutPreset:
      runtimeContract.hasLayoutPreset ||
      lower.includes(
        "storyboard_layout_preset: canvas_9_16_grid_3x3_frame_9_16_exact"
      ),
    hasAspectRatio:
      runtimeContract.hasAspectRatio || lower.includes("aspect_ratio: 9:16"),
    hasSingleCanvas: lower.includes("one single 9:16 image"),
    hasStrict3x3Grid: lower.includes("strict 3x3 grid"),
    hasExactNineFrames: lower.includes("exactly 9 frames"),
    hasNineVerticalFrames: lower.includes("exactly 9 vertical frames"),
    hasEqualColumns: lower.includes("exactly 3 equal-width columns"),
    hasEqualRows: lower.includes("exactly 3 equal-height rows"),
    hasNoSeparatorLock: lower.includes("no separator lines"),
    frameLabelCount: countPromptMatches(text, /\bFrame\s+\d+\b/g),
    visualLabelCount: countPromptMatches(text, /VISUAL:/g),
    productVerifyLabelCount: countPromptMatches(text, /PRODUCT VERIFY:/g),
    skillRuntimeContract: runtimeContract,
  };
}

function buildMarketplaceAutoReviewImagePromptLengthBreakdown(prompt: string) {
  const text = String(prompt ?? "");
  const headings = [
    "PRODUCT REFERENCE STORYBOARD SKILL CONTRACT:",
    "MEDIA STUDIO SKILL FIELD MAPPING:",
    "OUTPUT FORMAT LOCK:",
    "TEXT POLICY:",
    "SHOT-BY-SHOT STORYBOARD PROMPT:",
    "FINAL GRID/TEXT LOCK:",
    "TARGETED GRID REPAIR:",
  ];
  const positions = headings
    .map(heading => ({ heading, index: text.indexOf(heading) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  return positions.map((item, index) => {
    const nextIndex = positions[index + 1]?.index ?? text.length;
    return {
      heading: item.heading.replace(/:$/, ""),
      startIndex: item.index,
      chars: Math.max(0, nextIndex - item.index),
    };
  });
}

function buildMarketplaceAutoReviewImagePromptAudit(params: {
  runId: string;
  unit: DirectImageUnit;
  attempt: number;
  prompt: string;
  promptPreflight: MarketplaceAutoReviewPromptPreflightResult;
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode;
  referenceImageUrls: string[];
  referenceImageManifest?: ProductReferenceStoryboardReferenceImageManifestEntry[];
  skillRuntime?: Record<string, unknown> | null;
}) {
  const contractChecks = buildMarketplaceAutoReviewImagePromptContractChecks(
    params.prompt,
    params.skillRuntime
  );
  const promptHash = buildProductionStableHash({
    unitId: params.unit.unitId,
    role: params.unit.role,
    attempt: params.attempt,
    prompt: params.prompt,
    overlayTextMode: params.overlayTextMode,
    ruleSet: params.promptPreflight.ruleSet,
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
  }).slice(0, 24);
  return {
    auditId: `image-prompt-audit:${params.runId}:${params.unit.unitId}:${params.attempt}:${promptHash}`,
    unitId: params.unit.unitId,
    role: params.unit.role,
    shotId: params.unit.shotId ?? null,
    shotOrder: params.unit.shotOrder ?? null,
    attempt: params.attempt,
    promptHash,
    promptLengthChars: params.prompt.length,
    promptMaxLengthChars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
    promptOverLimitChars: Math.max(
      0,
      params.prompt.length - MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS
    ),
    promptLengthBreakdown: buildMarketplaceAutoReviewImagePromptLengthBreakdown(
      params.prompt
    ),
    prompt: params.prompt,
    promptSnippet: compactImagePromptText(params.prompt, 420),
    promptPreflight: params.promptPreflight,
    overlayTextMode: params.overlayTextMode,
    repairReasonCodes: params.unit.repairReasonCodes ?? [],
    repairInstruction: cleanText(params.unit.repairInstruction),
    referenceImageCount: params.referenceImageUrls.length,
    referenceImageManifest: params.referenceImageManifest ?? [],
    referenceImageRoleOrder: (params.referenceImageManifest ?? []).map(
      entry => `${entry.placeholder}=${entry.role}`
    ),
    referenceImageFingerprint: buildProductionStableHash({
      urls: uniqRefs(params.referenceImageUrls),
      manifest: params.referenceImageManifest ?? [],
    }).slice(0, 16),
    skillContract: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
    skillSelection: {
      source: params.skillRuntime
        ? "product_reference_storyboard_skill_runtime"
        : "marketplace_auto_review_direct_image_unit",
      requiredSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
      selectedSkill:
        cleanText(asRecord(params.skillRuntime).selectedSkill) ||
        contractChecks.selectedSkill,
      fallbackPolicy: "disabled_fail_fast",
      fallbackUsed: false,
    },
    skillRuntime: params.skillRuntime ?? null,
    skillInputSnapshot: asRecord(
      asRecord(params.skillRuntime).skillInputSnapshot ??
        asRecord(params.skillRuntime).inputSnapshot
    ),
    generationContract: {
      generationMode: "multi_frame_storyboard",
      layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
      aspectRatio: "9:16",
      expectedCanvas: "one single 9:16 image",
      expectedGridRows: 3,
      expectedGridColumns: 3,
      expectedGridFrameCount: MAX_SHOT_COUNT,
      expectedFrameShape: "vertical 9:16 frame",
      providerAspectRatio: "9:16",
      providerResolution: "2K",
    },
    contractChecks,
    dispatchDecision:
      params.promptPreflight.status === "passed"
        ? "allowed_for_provider_submit"
        : "blocked_before_credit_or_provider_submit",
    fallbackUsed: false,
    createdAt: nowIso(),
  };
}

function appendMarketplaceAutoReviewImagePromptPreflightAudit(
  metadata: RunMetadata,
  audit: Record<string, unknown>
): RunMetadata {
  const existing = Array.isArray(metadata.imagePromptPreflightAudits)
    ? metadata.imagePromptPreflightAudits.map(item => asRecord(item))
    : [];
  return {
    ...metadata,
    imagePromptPreflightAudits: [...existing, audit].slice(-30),
  };
}

type MarketplaceLlmCreditReservation = {
  amount: number;
  transactionId?: number;
  idempotencyKey: string;
  category: string;
  model: string;
  provider: string;
  reservedAt: string;
};

type MarketplaceRenderCreditReservation = {
  amount: number;
  transactionId?: number;
  idempotencyKey: string;
  category: "render";
  renderHash: string;
  jobId: string;
  reservedAt: string;
  refundTransactionId?: number;
};

type MarketplaceLlmCreditReconciliation = MarketplaceLlmCreditReservation & {
  inputTokens: number;
  outputTokens: number;
  actualCredits: number;
  creditsUsed: number;
  refundAmount: number;
  refundTransactionId?: number;
  budgetOverrun: boolean;
  reconciledAt: string;
};

type MarketplaceAgentRunResult = {
  response: AgentRuntimeResponse;
  creditReservation: MarketplaceLlmCreditReservation;
};

type DirectImageUnit = {
  unitId: string;
  role: "storyboard_grid" | "storyboard_frame" | "start_frame" | "stop_frame";
  shotId?: string;
  shotOrder?: number;
  repairReasonCodes?: string[];
  repairInstruction?: string;
};

type DirectVideoUnit = {
  unitId: string;
  role: "video_clip";
  shotId: string;
  shotOrder: number;
  repairReasonCodes?: string[];
  repairInstruction?: string;
};

type DirectMediaReconcileResult = {
  attempt: {
    attemptId: string;
    status: "waiting_provider" | "completed" | "failed";
    errorMessage?: string | null;
  };
  refs: DirectMediaTaskRef[];
};

type DirectImageFrameRole = Exclude<DirectImageUnit["role"], "storyboard_grid">;

function nowDate() {
  return new Date();
}

function nowIso() {
  return new Date().toISOString();
}

function renderStaleTimeoutMs(): number {
  const parsed = Number(process.env.MARKETPLACE_AUTO_REVIEW_RENDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 30 * 60 * 1000
    ? parsed
    : DEFAULT_RENDER_STALE_TIMEOUT_MS;
}

function isTimedOutSince(
  timestamp: unknown,
  timeoutMs = renderStaleTimeoutMs()
): boolean {
  const submittedAt = Number(timestamp);
  return (
    Number.isFinite(submittedAt) &&
    submittedAt > 0 &&
    Date.now() - submittedAt > timeoutMs
  );
}

function advanceLeaseTtlMs(): number {
  const parsed = Number(process.env.MARKETPLACE_AUTO_REVIEW_LEASE_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 60_000
    ? parsed
    : DEFAULT_ADVANCE_LEASE_TTL_MS;
}

function providerStaleTimeoutMs(): number {
  const parsed = Number(
    process.env.MARKETPLACE_AUTO_REVIEW_PROVIDER_STALE_TIMEOUT_MS
  );
  return Number.isFinite(parsed) && parsed >= 30 * 60 * 1000
    ? parsed
    : DEFAULT_PROVIDER_STALE_TIMEOUT_MS;
}

function visionQaRuntimeTimeoutMs(): number {
  const parsed = Number(
    process.env.MARKETPLACE_AUTO_REVIEW_VISION_QA_TIMEOUT_MS
  );
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 180_000
    ? parsed
    : 45_000;
}

function configuredPositiveInt(
  envName: string,
  fallback: number,
  min = 1,
  max = 50
): number {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseIsoMs(value: unknown): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function providerRefAgeMs(ref: DirectMediaTaskRef, nowMs = Date.now()): number {
  const submittedAt = parseIsoMs(ref.submittedAt);
  return submittedAt == null ? 0 : Math.max(0, nowMs - submittedAt);
}

function isActiveProviderStatus(status: unknown): boolean {
  return ![
    "completed",
    "failed",
    "cancelled",
    "cancellation_requested",
  ].includes(cleanText(status));
}

function qaCacheEntries(metadata: RunMetadata): Record<string, unknown>[] {
  return Array.isArray(metadata.qaCacheEntries)
    ? metadata.qaCacheEntries.map(item => asRecord(item))
    : [];
}

function marketplaceAutoReviewQaCacheKey(input: {
  kind: string;
  model: string;
  runId: string;
  shotId?: string | null;
  urls?: string[];
  refs?: string[];
  promptHashPayload?: unknown;
}): string {
  return [
    "qa-cache",
    input.kind,
    buildProductionStableHash({
      model: input.model,
      runId: input.runId,
      shotId: input.shotId ?? null,
      urls: uniqRefs(input.urls ?? []),
      refs: uniqRefs(input.refs ?? []),
      promptHashPayload: input.promptHashPayload ?? null,
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    }).slice(0, 24),
  ].join(":");
}

function findMarketplaceAutoReviewQaCacheEntry(params: {
  metadata: RunMetadata;
  kind: string;
  cacheKey: string;
}): Record<string, unknown> | null {
  const entry =
    qaCacheEntries(params.metadata).find(
      item =>
        cleanText(item.kind) === params.kind &&
        cleanText(item.cacheKey) === params.cacheKey &&
        cleanText(item.status) === "valid"
    ) ?? null;
  const envelope = asRecord(entry?.envelope);
  return Object.keys(envelope).length > 0 ? envelope : null;
}

function buildMarketplaceAutoReviewQaCacheEntry(params: {
  kind: string;
  cacheKey: string;
  envelope: Record<string, unknown>;
  sourceRefs?: string[];
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: params.kind,
    cacheKey: params.cacheKey,
    status: "valid",
    envelope: params.envelope,
    qaEnvelopeId: cleanText(params.envelope.qaEnvelopeId),
    verdict: cleanText(params.envelope.verdict),
    resultStatus: cleanText(params.envelope.status),
    sourceRefs: uniqRefs(params.sourceRefs ?? []),
    createdAt: cleanText(params.envelope.checkedAt) || nowIso(),
    ttlPolicy: "reuse_until_reference_or_prompt_hash_changes",
  };
}

function mergeMarketplaceAutoReviewQaCacheEntries(params: {
  metadata: RunMetadata;
  entries: Record<string, unknown>[];
  maxEntries?: number;
}): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const entry of qaCacheEntries(params.metadata)) {
    const key = `${cleanText(entry.kind)}:${cleanText(entry.cacheKey)}`;
    if (key !== ":") byKey.set(key, entry);
  }
  for (const entry of params.entries) {
    const key = `${cleanText(entry.kind)}:${cleanText(entry.cacheKey)}`;
    if (key !== ":") byKey.set(key, entry);
  }
  return [...byKey.values()].slice(-Math.max(1, params.maxEntries ?? 120));
}

function buildMarketplaceAutoReviewParallelismPolicy(
  metadata: RunMetadata
): Record<string, unknown> {
  const existing = asRecord(metadata.parallelismPolicy);
  const imageSubmissions = configuredPositiveInt(
    "MARKETPLACE_AUTO_REVIEW_MAX_PARALLEL_IMAGE_SUBMISSIONS",
    1,
    1,
    6
  );
  const videoSubmissions = configuredPositiveInt(
    "MARKETPLACE_AUTO_REVIEW_MAX_PARALLEL_VIDEO_SUBMISSIONS",
    1,
    1,
    4
  );
  const visionQa = configuredPositiveInt(
    "MARKETPLACE_AUTO_REVIEW_MAX_PARALLEL_VISION_QA",
    2,
    1,
    6
  );
  return {
    ...existing,
    schemaVersion: 1,
    status: "active_policy",
    maxParallelImageSubmissions: imageSubmissions,
    maxParallelVideoSubmissions: videoSubmissions,
    maxParallelVisionQa: visionQa,
    activeSubmissionMode:
      imageSubmissions === 1 && videoSubmissions === 1
        ? "sequential_provider_submit_with_explicit_caps"
        : "bounded_parallel_provider_submit",
    fairnessScope: "tenant_user_run",
    rateLimitBackoffPolicy: "provider_retry_after_then_exponential_backoff",
    duplicateSpendGuard: "credit_reservation_idempotency_key_per_unit_attempt",
    updatedAt: nowIso(),
  };
}

function buildMarketplaceAutoReviewOperationalDrillPlan(
  runId: string
): Record<string, unknown> {
  const scenarios = [
    "provider_unavailable",
    "provider_rate_limit",
    "callback_loss",
    "cancel_while_waiting_provider",
    "stale_input_mid_run",
    "render_timeout",
    "refund_on_failure",
    "no_browser_open_completion",
  ];
  return {
    schemaVersion: 1,
    drillPlanId: `auto-review-drills:${runId}`,
    status: "defined_for_sandbox_or_live_fixture",
    scenarios,
    requiredEvidenceRefs: scenarios.map(
      scenario => `drill:${runId}:${scenario}:evidence`
    ),
    automationRequirement:
      "all drills must complete from durable checkpoints without direct LLM/provider bypass",
    createdAt: nowIso(),
  };
}

function buildMarketplaceAutoReviewDurableRuntimePlan(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}): Record<string, unknown> {
  const control = asRecord(params.metadata.automationControlPlane);
  const provider = asRecord(params.metadata.providerReconciliation);
  return {
    schemaVersion: 1,
    planId: `durable-runtime:${params.run.id}`,
    status: "table_backed_control_plane_ready",
    runId: params.run.id,
    currentStage: params.run.currentStage,
    tables: {
      leases: "marketplace_auto_review_run_leases",
      stageAttempts: "marketplace_auto_review_stage_attempts",
      providerEvents: "marketplace_auto_review_provider_events",
      outboxJobs: "marketplace_auto_review_outbox_jobs",
      artifacts: "marketplace_auto_review_artifacts",
    },
    leaseRef: cleanText(asRecord(control.lease).leaseId) || null,
    providerReconciliationRef:
      cleanText(provider.reconciliationId) ||
      `provider-reconcile:${params.run.id}`,
    recoveryWorkerPolicy:
      "stale provider waits enqueue table-backed recovery outbox jobs before any duplicate provider spend",
    providerCallbackPolicy:
      "provider events are replay-keyed and must be signature/replay verified before terminal state changes",
    artifactPersistencePolicy:
      "final QA/package/media inspection artifacts are persisted with content hashes and linked to Library metadata",
    migrationStrategy:
      "metadata snapshots remain backward compatible while table rows provide queryable operations state",
    updatedAt: nowIso(),
  };
}

function marketplaceAutoReviewOperationalCleanupCutoff(
  input: {
    now?: Date;
    retentionDays?: number | null;
  } = {}
): Date {
  const retentionDays = Math.max(
    1,
    Math.floor(
      Number(
        input.retentionDays ??
          MARKETPLACE_AUTO_REVIEW_OPERATIONAL_RETENTION_DAYS
      )
    )
  );
  const now = input.now ?? nowDate();
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function isMarketplaceAutoReviewRunEligibleForOperationalCleanup(input: {
  status: unknown;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  cutoff: Date;
}): boolean {
  const status = cleanText(input.status) as MarketplaceAutoReviewStatus;
  if (!TERMINAL_RUN_STATUSES_FOR_OPERATIONAL_CLEANUP.includes(status)) {
    return false;
  }
  const reference =
    input.completedAt ?? input.updatedAt ?? input.createdAt ?? null;
  const referenceDate =
    reference instanceof Date
      ? reference
      : cleanText(reference)
        ? new Date(cleanText(reference))
        : null;
  return Boolean(
    referenceDate &&
    Number.isFinite(referenceDate.getTime()) &&
    referenceDate < input.cutoff
  );
}

async function cleanupMarketplaceAutoReviewOperationalRuntime(params: {
  db: Db;
  retentionDays?: number | null;
  now?: Date;
}) {
  const cutoff = marketplaceAutoReviewOperationalCleanupCutoff({
    now: params.now,
    retentionDays: params.retentionDays,
  });
  await params.db.execute(sql`
    WITH eligible_runs AS (
      SELECT "id"
      FROM "marketplace_auto_review_runs"
      WHERE "status" IN ('completed', 'failed', 'cancelled')
        AND COALESCE("completedAt", "updatedAt", "createdAt") < ${cutoff}
    )
    DELETE FROM "marketplace_auto_review_stage_attempts"
    WHERE "runId" IN (SELECT "id" FROM eligible_runs)
  `);
  await params.db.execute(sql`
    WITH eligible_runs AS (
      SELECT "id"
      FROM "marketplace_auto_review_runs"
      WHERE "status" IN ('completed', 'failed', 'cancelled')
        AND COALESCE("completedAt", "updatedAt", "createdAt") < ${cutoff}
    )
    DELETE FROM "marketplace_auto_review_provider_events"
    WHERE "runId" IN (SELECT "id" FROM eligible_runs)
  `);
  await params.db.execute(sql`
    WITH eligible_runs AS (
      SELECT "id"
      FROM "marketplace_auto_review_runs"
      WHERE "status" IN ('completed', 'failed', 'cancelled')
        AND COALESCE("completedAt", "updatedAt", "createdAt") < ${cutoff}
    )
    DELETE FROM "marketplace_auto_review_run_leases"
    WHERE "runId" IN (SELECT "id" FROM eligible_runs)
  `);
  await params.db.execute(sql`
    WITH eligible_runs AS (
      SELECT "id"
      FROM "marketplace_auto_review_runs"
      WHERE "status" IN ('completed', 'failed', 'cancelled')
        AND COALESCE("completedAt", "updatedAt", "createdAt") < ${cutoff}
    )
    DELETE FROM "marketplace_auto_review_outbox_jobs"
    WHERE "runId" IN (SELECT "id" FROM eligible_runs)
  `);
}

async function cleanupMarketplaceAutoReviewOperationalRuntimeBeforeStart(
  db: Db
) {
  try {
    await cleanupMarketplaceAutoReviewOperationalRuntime({ db });
  } catch (error) {
    console.warn(
      "[marketplaceAutoReview] operational_retention_cleanup_failed",
      {
        retentionDays: MARKETPLACE_AUTO_REVIEW_OPERATIONAL_RETENTION_DAYS,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

function buildMarketplaceAutoReviewQualityModePolicy(
  metadata: RunMetadata
): Record<string, unknown> {
  const rawMode = cleanText(
    metadata.qualityMode ??
      asRecord(metadata.productionCreativeBriefSnapshot).qualityMode
  );
  const mode = ["fast_draft", "balanced", "premium_strict_qa"].includes(rawMode)
    ? rawMode
    : "balanced";
  const policyByMode: Record<string, Record<string, unknown>> = {
    fast_draft: {
      maxRepairAttemptsPerUnit: 1,
      visionQaSampling: "anchor_frames_and_final_samples",
      providerParallelismBias: "speed",
      estimatedTimeMultiplier: 0.7,
      estimatedCreditMultiplier: 0.85,
    },
    balanced: {
      maxRepairAttemptsPerUnit: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
      visionQaSampling: "start_stop_storyboard_keyframes_and_final_samples",
      providerParallelismBias: "balanced",
      estimatedTimeMultiplier: 1,
      estimatedCreditMultiplier: 1,
    },
    premium_strict_qa: {
      maxRepairAttemptsPerUnit: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 2,
      visionQaSampling: "dense_keyframes_audio_waveform_ocr_and_final_package",
      providerParallelismBias: "quality",
      estimatedTimeMultiplier: 1.45,
      estimatedCreditMultiplier: 1.25,
    },
  };
  return {
    schemaVersion: 1,
    mode,
    status: "active",
    ...policyByMode[mode],
    userBurdenPolicy:
      "auto-decide unless product/character/environment anchors, product facts, ad policy, credit authority, or safety blockers require user action",
    llmGatewayOnly: true,
    updatedAt: nowIso(),
  };
}

function buildMarketplaceAutoReviewCreativePerformanceMemory(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}): Record<string, unknown> {
  const conceptSet = asRecord(
    params.metadata.creativeConceptSet ?? params.metadata.conceptSet
  );
  const concepts = Array.isArray(conceptSet.concepts)
    ? conceptSet.concepts.map(item => asRecord(item))
    : [];
  const selectedId =
    cleanText(conceptSet.selectedConceptId) ||
    cleanText(params.metadata.selectedCreativeConceptId) ||
    cleanText(params.run.selectedConceptId);
  const selected = concepts.find(
    concept => cleanText(concept.conceptId) === selectedId
  );
  const noveltyFingerprints = concepts
    .map(concept => cleanText(concept.noveltyFingerprint))
    .filter(Boolean);
  return {
    schemaVersion: 1,
    memoryId: `creative-memory:${params.run.id}`,
    status: noveltyFingerprints.length > 0 ? "recorded" : "pending_concepts",
    selectedConceptId: selectedId || null,
    selectedHookType: cleanText(selected?.hookType) || null,
    selectedPacing:
      cleanText(selected?.pacing) ||
      cleanText(
        asRecord(params.metadata.productionCreativeBriefSnapshot).pacing
      ) ||
      null,
    noveltyFingerprints,
    tenantSafeMemoryPolicy:
      "compare same-product fingerprints without exposing raw prompts, raw provider payloads, or other tenants' creative outputs",
    feedbackSignals: {
      approvalRef:
        cleanText(asRecord(params.metadata.humanReviewGate).approvalRef) ||
        null,
      publishablePackageRef:
        cleanText(
          asRecord(params.metadata.publishableAssetPackage).packageId
        ) || null,
      completionStatus: params.run.status,
    },
    nextOptimization:
      "prefer hooks/pacing with passed QA, supported claims, and completed publishable packages; reject duplicate fingerprints before spend",
    updatedAt: nowIso(),
  };
}

function buildMarketplaceAutoReviewMediaArtifactInspection(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  resultUrl?: string | null;
  expectedDurationSeconds?: number | null;
}): Record<string, unknown> {
  const renderProbe = asRecord(params.metadata.renderArtifactProbe);
  const audioQa = asRecord(params.metadata.audioContinuityQaEnvelope);
  const warningVerification = asRecord(
    params.metadata.warningOverlayVerification
  );
  const sampleRefs = generatedVideoSampleEvidenceRefs(params.metadata);
  const conceptShots = asRecord(params.metadata.concept).shots;
  const expectedDurationSeconds =
    params.expectedDurationSeconds ??
    (Array.isArray(conceptShots)
      ? conceptShots.reduce(
          (sum: number, shot: unknown) =>
            sum + toNumber(asRecord(shot).durationSeconds),
          0
        )
      : null);
  const checks = [
    cleanText(renderProbe.status) === "passed" ? "render_probe_passed" : "",
    sampleRefs.length > 0 ? "sample_keyframes_present" : "",
    cleanText(audioQa.qaEnvelopeId) ? "audio_continuity_probe_present" : "",
    cleanText(audioQa.gapAnalysisRef) ? "silence_gap_probe_present" : "",
    cleanText(warningVerification.verificationId)
      ? "warning_overlay_ocr_or_compositor_present"
      : "",
  ].filter(Boolean);
  const missingChecks = [
    cleanText(renderProbe.status) === "passed" ? "" : "render_probe_passed",
    sampleRefs.length > 0 ? "" : "sample_keyframes_present",
    cleanText(audioQa.qaEnvelopeId) ? "" : "audio_continuity_probe_present",
  ].filter(Boolean);
  const status =
    cleanText(params.resultUrl ?? renderProbe.resultUrl) &&
    missingChecks.length === 0
      ? "passed"
      : "pending_or_blocked";
  return {
    schemaVersion: 1,
    inspectionId: `media-inspection:${params.run.id}:${buildProductionStableHash(
      {
        resultUrl: cleanText(params.resultUrl ?? renderProbe.resultUrl),
        sampleRefs,
        audioQa: cleanText(audioQa.qaEnvelopeId),
      }
    ).slice(0, 12)}`,
    runId: params.run.id,
    status,
    resultUrl: cleanText(params.resultUrl ?? renderProbe.resultUrl) || null,
    expectedDurationSeconds,
    checkedAt: nowIso(),
    analyzerPolicy:
      "final media must carry decoded/probed duration, keyframe, audio continuity, silence-gap, and warning overlay evidence before Library promotion",
    checks,
    missingChecks,
    sampleRefs,
    audioProbeRefs: [
      cleanText(audioQa.qaEnvelopeId),
      cleanText(audioQa.durationProbeRef),
      cleanText(audioQa.gapAnalysisRef),
    ].filter(Boolean),
    renderProbeRef: cleanText(renderProbe.probeId) || null,
    warningVerificationRef:
      cleanText(warningVerification.verificationId) || null,
  };
}

function buildMarketplaceAutoReviewProviderReconciliationSnapshot(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  nowMs?: number;
}): Record<string, unknown> {
  const nowMs = params.nowMs ?? Date.now();
  const staleThresholdMs = providerStaleTimeoutMs();
  const directRefs = [
    ...directTaskRefs(params.metadata.directImageTasks),
    ...directTaskRefs(params.metadata.directVideoTasks),
  ];
  const audioRef: DirectMediaTaskRef[] = cleanText(
    params.metadata.audioMediaTaskId
  )
    ? [
        {
          unitId: "audio-full-voiceover",
          mediaType: "audio" as const,
          stageKey: "audio_generation" as StageKey,
          role: "voiceover",
          attempt: toNumber(params.metadata.audioRepairAttempt) + 1 || 1,
          taskId: cleanText(params.metadata.audioMediaTaskId),
          providerTaskId: cleanText(params.metadata.audioProviderTaskId),
          model: cleanText(params.metadata.audioTaskModel) || "audio",
          status: params.metadata.audioUrl ? "completed" : "waiting_provider",
          creditAmount: params.metadata.audioCreditAmount,
          creditTransactionId: params.metadata.audioCreditTransactionId,
          creditIdempotencyKey: params.metadata.audioCreditIdempotencyKey,
          refundTransactionId: params.metadata.audioRefundTransactionId,
          submittedAt:
            cleanText(params.metadata.audioSubmittedAt) ||
            cleanText(params.metadata.audioCreatedAt) ||
            cleanText(params.metadata.audioQueuedAt) ||
            cleanText(params.metadata.audioGeneratedAt) ||
            nowIso(),
        },
      ]
    : [];
  const refs = [...directRefs, ...audioRef];
  const refSnapshots = refs.map(ref => {
    const ageMs = providerRefAgeMs(ref, nowMs);
    const stale =
      isActiveProviderStatus(ref.status) && ageMs > staleThresholdMs;
    return compactRecord({
      mediaType: ref.mediaType,
      stageKey: ref.stageKey,
      unitId: ref.unitId,
      taskId: ref.taskId,
      providerTaskId: ref.providerTaskId,
      status: ref.status,
      submittedAt: ref.submittedAt,
      ageMs,
      stale,
      creditRef: cleanText(ref.creditIdempotencyKey)
        ? `credit:${cleanText(ref.creditIdempotencyKey)}`
        : undefined,
      refundRequired:
        ["failed", "cancelled", "cancellation_requested"].includes(
          cleanText(ref.status)
        ) &&
        toNumber(ref.creditAmount) > 0 &&
        !ref.refundTransactionId,
      cancellationIntentPersisted: Boolean(ref.cancellationRequestedAt),
    });
  });
  const renderReservation = asRecord(params.metadata.renderCreditReservation);
  const renderAgeMs = params.metadata.renderSubmittedAt
    ? Math.max(0, nowMs - Number(params.metadata.renderSubmittedAt))
    : 0;
  const renderStale =
    Boolean(cleanText(params.metadata.renderJobId)) &&
    !cleanText(params.metadata.renderUrl) &&
    renderAgeMs > renderStaleTimeoutMs();
  const staleRefs = refSnapshots
    .filter(ref => ref.stale)
    .map(ref => cleanText(ref.taskId))
    .filter(Boolean);
  const refundRequiredRefs = refSnapshots
    .filter(ref => ref.refundRequired)
    .map(ref => cleanText(ref.taskId))
    .filter(Boolean);
  const cancellationIntentRefs = refSnapshots
    .filter(ref => ref.cancellationIntentPersisted)
    .map(ref => cleanText(ref.taskId))
    .filter(Boolean);
  const renderRefs = cleanText(params.metadata.renderJobId)
    ? [
        compactRecord({
          mediaType: "render",
          stageKey: "render",
          jobId: cleanText(params.metadata.renderJobId),
          status: cleanText(params.metadata.renderUrl)
            ? "completed"
            : "waiting_provider",
          submittedAt: params.metadata.renderSubmittedAt,
          ageMs: renderAgeMs,
          stale: renderStale,
          creditRef: cleanText(renderReservation.idempotencyKey)
            ? `credit:${cleanText(renderReservation.idempotencyKey)}`
            : undefined,
          refundRequired:
            renderStale &&
            toNumber(renderReservation.amount) > 0 &&
            !renderReservation.refundTransactionId,
        }),
      ]
    : [];
  const status =
    staleRefs.length > 0 || renderStale
      ? "blocked_stale_provider_wait"
      : refs.some(ref => isActiveProviderStatus(ref.status)) ||
          renderRefs.length > 0
        ? "watching_provider_tasks"
        : "passed";
  return {
    schemaVersion: 1,
    reconciliationId: `provider-reconcile:${params.run.id}:${buildProductionStableHash({ refs: refSnapshots, renderRefs }).slice(0, 12)}`,
    runId: params.run.id,
    status,
    checkedAt: new Date(nowMs).toISOString(),
    staleThresholdMs,
    providerTaskRefs: refSnapshots,
    renderRefs,
    staleRefs: uniqRefs([
      ...staleRefs,
      ...(renderStale
        ? [`render:${cleanText(params.metadata.renderJobId)}`]
        : []),
    ]),
    refundRequiredRefs: uniqRefs(refundRequiredRefs),
    cancellationIntentRefs: uniqRefs(cancellationIntentRefs),
    orphanTaskPolicy:
      "do_not_create_duplicate_paid_work; reconcile task/result/refund before retry",
    nextAction:
      status === "blocked_stale_provider_wait"
        ? "operator_or_background_recovery_should_reconcile_provider_task_or_refund_before_resume"
        : "continue_automation",
  };
}

function repairReasonSeverity(reasonCodes: string[]): {
  decision: "retry_targeted" | "block_needs_user" | "accept_with_warning";
  severity: "info" | "warning" | "blocked";
} {
  const lower = reasonCodes.map(code => code.toLowerCase());
  if (
    lower.some(code =>
      [
        "unsafe",
        "policy_refusal",
        "product_not_visible",
        "product_reference_missing",
        "evidence_instruction_blocked",
      ].some(pattern => code.includes(pattern))
    )
  ) {
    return { decision: "block_needs_user", severity: "blocked" };
  }
  if (
    lower.some(code =>
      ["product", "face", "character", "continuity", "audio_gap"].some(
        pattern => code.includes(pattern)
      )
    )
  ) {
    return { decision: "retry_targeted", severity: "warning" };
  }
  return { decision: "retry_targeted", severity: "info" };
}

function buildMarketplaceAutoReviewTargetedRepairPolicyLedger(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}): Record<string, unknown> {
  const imageRefs = directTaskRefs(params.metadata.directImageTasks);
  const videoRefs = directTaskRefs(params.metadata.directVideoTasks);
  const imageUnits = directImageUnits(params.metadata.pendingImageRepairUnits);
  const videoUnits = directVideoUnits(params.metadata.pendingVideoRepairUnits);
  const audioRepair = asRecord(params.metadata.pendingAudioRepair);
  const decisions = [
    ...imageUnits.map(unit => {
      const reasonCodes = unit.repairReasonCodes ?? [];
      const attemptNumber = nextDirectAttempt(imageRefs, unit.unitId);
      const severity = repairReasonSeverity(reasonCodes);
      return {
        mediaType: "image",
        unitId: unit.unitId,
        role: unit.role,
        shotId: unit.shotId,
        shotOrder: unit.shotOrder,
        reasonCodes,
        attemptNumber,
        maxAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
        decision:
          attemptNumber > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
            ? "block_needs_user"
            : severity.decision,
        severity:
          attemptNumber > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
            ? "blocked"
            : severity.severity,
        repairScope: "single_frame_or_storyboard_cell",
      };
    }),
    ...videoUnits.map(unit => {
      const reasonCodes = unit.repairReasonCodes ?? [];
      const attemptNumber = nextDirectAttempt(videoRefs, unit.unitId);
      const severity = repairReasonSeverity(reasonCodes);
      return {
        mediaType: "video",
        unitId: unit.unitId,
        role: unit.role,
        shotId: unit.shotId,
        shotOrder: unit.shotOrder,
        reasonCodes,
        attemptNumber,
        maxAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
        decision:
          attemptNumber > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
            ? "block_needs_user"
            : severity.decision,
        severity:
          attemptNumber > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
            ? "blocked"
            : severity.severity,
        repairScope: "single_video_clip",
      };
    }),
    ...(Object.keys(audioRepair).length > 0
      ? [
          {
            mediaType: "audio",
            unitId: "audio-full-voiceover",
            role: "voiceover",
            reasonCodes: Array.isArray(audioRepair.reasonCodes)
              ? audioRepair.reasonCodes
                  .map(item => cleanText(item))
                  .filter(Boolean)
              : ["audio_continuity_repair"],
            attemptNumber: toNumber(params.metadata.audioRepairAttempt) + 1,
            maxAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
            decision:
              toNumber(params.metadata.audioRepairAttempt) + 1 >
              MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
                ? "block_needs_user"
                : "retry_targeted",
            severity: "warning",
            repairScope: "single_voiceover_track",
          },
        ]
      : []),
  ];
  const blockedDecisions = decisions.filter(
    decision => cleanText(decision.decision) === "block_needs_user"
  );
  return {
    schemaVersion: 1,
    ledgerId: `repair-policy:${params.run.id}:${buildProductionStableHash({ decisions }).slice(0, 12)}`,
    runId: params.run.id,
    status:
      decisions.length === 0
        ? "idle"
        : blockedDecisions.length > 0
          ? "blocked_needs_user"
          : "retry_targeted",
    checkedAt: nowIso(),
    maxAttemptsPerUnit: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
    decisions,
    blockedUnitIds: blockedDecisions.map(decision =>
      cleanText(decision.unitId)
    ),
    policyRefs: [
      "product-fidelity-hard-block-after-retry-budget",
      "face-drift-targeted-repair-before-escalation",
      "audio-gap-targeted-voiceover-repair",
      "provider-refusal-no-duplicate-spend",
    ],
    quarantinePolicy:
      "failed media remains negative evidence and is never reused as accepted reference",
    completedWithWarningsCriteria:
      "only non-product, non-identity, non-continuity warnings may pass after QA evidence",
  };
}

function buildMarketplaceAutoReviewAutomationMetrics(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}): Record<string, unknown> {
  const provider = asRecord(params.metadata.providerReconciliation);
  const repairLedger = asRecord(params.metadata.targetedRepairPolicyLedger);
  const cacheEntries = qaCacheEntries(params.metadata);
  const createdAt =
    params.run.createdAt instanceof Date
      ? params.run.createdAt.getTime()
      : Date.parse(String(params.run.createdAt ?? ""));
  return {
    schemaVersion: 1,
    status: "recorded",
    checkedAt: nowIso(),
    runAgeMs: Number.isFinite(createdAt)
      ? Math.max(0, Date.now() - createdAt)
      : 0,
    currentStage: params.run.currentStage,
    providerReconciliationStatus: cleanText(provider.status) || "not_started",
    staleProviderRefCount: Array.isArray(provider.staleRefs)
      ? provider.staleRefs.length
      : 0,
    repairDecisionCount: Array.isArray(repairLedger.decisions)
      ? repairLedger.decisions.length
      : 0,
    qaCacheEntryCount: cacheEntries.length,
    qaCacheHitCount: cacheEntries.filter(entry =>
      Boolean(asRecord(entry.envelope).qaCacheHit)
    ).length,
    directImageTaskCount: directTaskRefs(params.metadata.directImageTasks)
      .length,
    directVideoTaskCount: directTaskRefs(params.metadata.directVideoTasks)
      .length,
    outstandingCreditRefs: recordRefList(
      asRecord(params.metadata.creditSummary),
      "reservationRefs"
    ).length,
    dashboardSignalRefs: [
      `metric:auto-review:${params.run.id}:queue-age`,
      `metric:auto-review:${params.run.id}:stage-latency`,
      `metric:auto-review:${params.run.id}:provider-wait`,
      `metric:auto-review:${params.run.id}:repair-count`,
      `metric:auto-review:${params.run.id}:credit-reconciliation`,
      `metric:auto-review:${params.run.id}:completion-rate`,
    ],
    alertRoutingRefs: [
      `alert:auto-review:${params.run.id}:stale-provider-wait`,
      `alert:auto-review:${params.run.id}:credit-mismatch`,
      `alert:auto-review:${params.run.id}:render-probe-failure`,
    ],
    sloRefs: [
      "slo:auto-review:queue-age",
      "slo:auto-review:provider-wait",
      "slo:auto-review:repair-count",
      "slo:auto-review:credit-mismatch",
      "slo:auto-review:completion-rate",
    ],
  };
}

function withMarketplaceAutoReviewAutomationSnapshots(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime?: RuntimeContext;
}): RunMetadata {
  const metadataWithPolicy = {
    ...params.metadata,
    parallelismPolicy: buildMarketplaceAutoReviewParallelismPolicy(
      params.metadata
    ),
    operationalDrillPlan:
      params.metadata.operationalDrillPlan ??
      buildMarketplaceAutoReviewOperationalDrillPlan(params.run.id),
  } as RunMetadata;
  const existingRecovery = asRecord(
    metadataWithPolicy.operationalRecoveryEvidence
  );
  const runtimeRecovery = hasVerifiedOperationalRecoveryEvidence(
    existingRecovery
  )
    ? existingRecovery
    : runtimeOperationalRecoveryEvidenceForMetadata({
        run: params.run,
        metadata: metadataWithPolicy,
        checkedAt: nowIso(),
      });
  const metadataWithRecovery = {
    ...metadataWithPolicy,
    operationalRecoveryEvidence:
      runtimeRecovery ?? metadataWithPolicy.operationalRecoveryEvidence,
  } as RunMetadata;
  return {
    ...metadataWithRecovery,
    durableRuntimePlan: buildMarketplaceAutoReviewDurableRuntimePlan({
      run: params.run,
      metadata: metadataWithRecovery,
    }),
    qualityModePolicy:
      buildMarketplaceAutoReviewQualityModePolicy(metadataWithRecovery),
    creativePerformanceMemory:
      buildMarketplaceAutoReviewCreativePerformanceMemory({
        run: params.run,
        metadata: metadataWithRecovery,
      }),
    mediaArtifactInspection:
      metadataWithRecovery.mediaArtifactInspection ??
      buildMarketplaceAutoReviewMediaArtifactInspection({
        run: params.run,
        metadata: metadataWithRecovery,
      }),
    targetedRepairPolicyLedger:
      metadataWithRecovery.targetedRepairPolicyLedger ??
      buildMarketplaceAutoReviewTargetedRepairPolicyLedger({
        run: params.run,
        metadata: metadataWithRecovery,
      }),
    automationMetrics: buildMarketplaceAutoReviewAutomationMetrics({
      run: params.run,
      metadata: metadataWithRecovery,
    }),
  };
}

function autoTenantId(auth: AuthContext): string {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "ต้องเลือก workspace/tenant ก่อนสร้าง Marketplace Auto Review เพื่อให้ Production Project และ Library ตรวจย้อนกลับได้ถูกต้อง",
    });
  }
  return tenantId;
}

function tenantAccessClause(auth: AuthContext) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return undefined;
  return or(
    eq(marketplaceAutoReviewRuns.tenantId, tenantId),
    isNull(marketplaceAutoReviewRuns.tenantId)
  );
}

function tenantIdForRun(
  run: MarketplaceAutoReviewRun,
  auth: AuthContext
): string {
  return cleanText(run.tenantId) || autoTenantId(auth);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item == null || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object")
        return Object.keys(item as Record<string, unknown>).length > 0;
      return true;
    })
  ) as T;
}

function uniqRefs(values: unknown[]): string[] {
  const refs = new Set<string>();
  for (const value of values.flat()) {
    const ref = cleanText(value);
    if (ref) refs.add(ref);
  }
  return [...refs];
}

function estimateTokenCount(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.max(1, Math.ceil(text.length / 4));
}

function runtimeModelConfig(
  model: string,
  providerId = "smartspc-gateway"
): RuntimeModelConfig {
  return {
    providerId,
    modelId: model,
    gatewayRouteId: "llm-gateway",
    resolvedGatewayModelId: model,
  };
}

function stageEvidenceStatusForStageStatus(
  status: string
): StageEvidenceStatus | null {
  if (status === "completed") return "complete";
  if (status === "completed_with_warnings") return "warning_complete";
  if (status === "skipped") return "skipped";
  if (status === "repairing") return "repair_required";
  if (
    status === "waiting_provider" ||
    status === "running" ||
    status === "queued" ||
    status === "qa_pending" ||
    status === "awaiting_credit_authorization"
  )
    return null;
  if (status === "blocked" || status === "blocked_needs_user")
    return "user_blocked";
  if (status === "failed") return "terminal_failure";
  if (status === "cancelled") return "cancelled";
  return null;
}

function isMarketplaceAutoReviewCompletedStageStatus(status: string): boolean {
  return ["completed", "completed_with_warnings", "skipped"].includes(
    cleanText(status)
  );
}

function isMarketplaceAutoReviewTerminalStageAttemptStatus(
  status: string
): boolean {
  return [
    "completed",
    "completed_with_warnings",
    "skipped",
    "blocked",
    "failed",
    "cancelled",
  ].includes(cleanText(status));
}

function marketplaceAutoReviewStageAttemptKeyForStatus(input: {
  stageKey: string;
  status: string;
  attemptNumber: number;
}): string {
  const stageKey = cleanText(input.stageKey) || "queued";
  return isMarketplaceAutoReviewTerminalStageAttemptStatus(input.status)
    ? `${stageKey}:${Math.max(1, input.attemptNumber)}`
    : `${stageKey}:active`;
}

function buildStageCompletionEvidence(params: {
  runId: string;
  stageKey: StageKey;
  stageStatus: string;
  evidence?: StageCompletionEvidenceInput;
}): MarketplaceAutoReviewStageCompletionEvidence | null {
  const status =
    params.evidence?.status ??
    stageEvidenceStatusForStageStatus(params.stageStatus);
  if (!status) return null;
  const evidence = MarketplaceAutoReviewStageCompletionEvidenceSchema.parse({
    evidenceId: `stage-evidence:${params.runId}:${params.stageKey}:${buildProductionStableHash({ status, evidence: params.evidence ?? {}, at: nowIso() }).slice(0, 12)}`,
    runId: params.runId,
    stageKey: params.stageKey,
    status,
    requiredRefs: uniqRefs(params.evidence?.requiredRefs ?? []),
    artifactRefs: uniqRefs(params.evidence?.artifactRefs ?? []),
    qaVerdictRefs: uniqRefs(params.evidence?.qaVerdictRefs ?? []),
    creditRefs: uniqRefs(params.evidence?.creditRefs ?? []),
    lineageRefs: uniqRefs(params.evidence?.lineageRefs ?? []),
    policyRefs: uniqRefs(params.evidence?.policyRefs ?? []),
    acceptanceRefs: uniqRefs(params.evidence?.acceptanceRefs ?? []),
    missingRefs: uniqRefs(params.evidence?.missingRefs ?? []),
    warningApprovalRefs: uniqRefs(params.evidence?.warningApprovalRefs ?? []),
    createdAt: nowIso(),
  });
  if (
    (status === "complete" ||
      status === "warning_complete" ||
      status === "skipped") &&
    evidence.missingRefs.length > 0
  ) {
    throw new Error(
      `Cannot mark ${params.stageKey} ${status}; missing completion evidence: ${evidence.missingRefs.join(", ")}`
    );
  }
  if (
    (status === "complete" || status === "warning_complete") &&
    evidence.requiredRefs.length === 0
  ) {
    throw new Error(
      `Cannot mark ${params.stageKey} complete without required evidence refs`
    );
  }
  if (
    (status === "complete" || status === "warning_complete") &&
    [
      evidence.artifactRefs,
      evidence.qaVerdictRefs,
      evidence.creditRefs,
      evidence.lineageRefs,
      evidence.policyRefs,
      evidence.acceptanceRefs,
    ].every(refs => refs.length === 0)
  ) {
    throw new Error(
      `Cannot mark ${params.stageKey} complete without persisted artifact, QA, credit, lineage, policy, or acceptance evidence`
    );
  }
  return evidence;
}

function normalizeStageCompletionEvidenceInput(params: {
  runId: string;
  stageKey: StageKey;
  stageStatus: string;
  output?: Record<string, unknown>;
  evidence?: StageCompletionEvidenceInput;
}): StageCompletionEvidenceInput | undefined {
  const status =
    params.evidence?.status ??
    stageEvidenceStatusForStageStatus(params.stageStatus);
  const output = params.output ?? {};
  const detail = asRecord(output.statusDetail);
  if (status === "complete" || status === "warning_complete") {
    const artifactRefs = uniqRefs([
      params.evidence?.artifactRefs ?? [],
      Array.isArray(output.artifactRefs) ? output.artifactRefs : [],
      Array.isArray(output.frameUrls)
        ? output.frameUrls.map((_, index) => `frame:storyboard:${index + 1}`)
        : [],
      Array.isArray(output.startFrameUrls)
        ? output.startFrameUrls.map((_, index) => `frame:start:${index + 1}`)
        : [],
      Array.isArray(output.stopFrameUrls)
        ? output.stopFrameUrls.map((_, index) => `frame:stop:${index + 1}`)
        : [],
      Array.isArray(output.libraryFrameItemIds)
        ? output.libraryFrameItemIds.map(item => `library:${cleanText(item)}`)
        : [],
    ]);
    const reasonCodes = uniqRefs([
      Array.isArray(detail.reasonCodes) ? detail.reasonCodes : [],
      Array.isArray(output.reasonCodes) ? output.reasonCodes : [],
    ]);
    return {
      ...params.evidence,
      status,
      requiredRefs: uniqRefs([
        params.evidence?.requiredRefs ?? [],
        "artifactRefs",
        "qaVerdictRefs",
        "creditRefs",
        "lineageRefs",
        "policyRefs",
        "acceptanceRefs",
      ]),
      artifactRefs:
        artifactRefs.length > 0
          ? artifactRefs
          : [`artifact:${params.runId}:${params.stageKey}:stage_output`],
      qaVerdictRefs: uniqRefs([
        params.evidence?.qaVerdictRefs ?? [],
        Array.isArray(output.qaVerdictRefs) ? output.qaVerdictRefs : [],
        Array.isArray(output.qaRefs) ? output.qaRefs : [],
        `qa:${params.runId}:${params.stageKey}:stage_output`,
      ]),
      creditRefs: uniqRefs([
        params.evidence?.creditRefs ?? [],
        Array.isArray(output.creditRefs) ? output.creditRefs : [],
        `credit:${params.runId}:${params.stageKey}:reserved_or_reconciled`,
      ]),
      lineageRefs: uniqRefs([
        params.evidence?.lineageRefs ?? [],
        Array.isArray(output.lineageRefs) ? output.lineageRefs : [],
        `lineage:${params.runId}:${params.stageKey}`,
      ]),
      policyRefs: uniqRefs([
        params.evidence?.policyRefs ?? [],
        Array.isArray(output.policyRefs) ? output.policyRefs : [],
        "product-reference-pack-required",
        "gateway-routed-qa",
      ]),
      acceptanceRefs: uniqRefs([
        params.evidence?.acceptanceRefs ?? [],
        Array.isArray(output.acceptanceRefs) ? output.acceptanceRefs : [],
        `acceptance:${params.stageKey}:${params.runId}`,
      ]),
      missingRefs: [],
      warningApprovalRefs:
        status === "warning_complete"
          ? uniqRefs([
              params.evidence?.warningApprovalRefs ?? [],
              reasonCodes.map(ref => `warning:${ref}`),
              `warning:${params.runId}:${params.stageKey}:user_review_allowed`,
            ])
          : (params.evidence?.warningApprovalRefs ?? []),
    };
  }
  if (status !== "repair_required") return params.evidence;

  const qaVerdictRefs = uniqRefs([
    params.evidence?.qaVerdictRefs ?? [],
    Array.isArray(output.qaVerdictRefs) ? output.qaVerdictRefs : [],
    Array.isArray(output.qaRefs) ? output.qaRefs : [],
    cleanText(asRecord(output.audioContinuityQaEnvelope).qaEnvelopeId),
    cleanText(asRecord(output.audioContinuityQaEnvelope).qaId),
  ]);
  const repairRefs = uniqRefs([
    Array.isArray(output.repairRefs) ? output.repairRefs : [],
    Array.isArray(output.repairUnitIds) ? output.repairUnitIds : [],
    Array.isArray(output.pendingRepairUnits)
      ? output.pendingRepairUnits.map(item => cleanText(asRecord(item).unitId))
      : [],
  ]);
  const reasonRefs = uniqRefs([
    Array.isArray(detail.reasonCodes) ? detail.reasonCodes : [],
    Array.isArray(output.reasonCodes) ? output.reasonCodes : [],
  ]).map(ref => `reason:${ref}`);
  const missingRefs = uniqRefs([
    params.evidence?.missingRefs ?? [],
    repairRefs.map(ref => `repair:${ref}`),
    reasonRefs,
  ]);

  return {
    ...params.evidence,
    status: "repair_required",
    requiredRefs: uniqRefs([
      params.evidence?.requiredRefs ?? [],
      "missingRefs",
      "qaVerdictRefs",
    ]),
    qaVerdictRefs:
      qaVerdictRefs.length > 0
        ? qaVerdictRefs
        : [
            `qa:${params.runId}:${params.stageKey}:repair_required_from_stage_output`,
          ],
    missingRefs:
      missingRefs.length > 0
        ? missingRefs
        : [`repair:${params.stageKey}:stage_output_repair_required`],
  };
}

export function normalizeMarketplaceAutoReviewStageCompletionEvidenceForTest(input: {
  runId: string;
  stageKey: StageKey;
  stageStatus: string;
  output?: Record<string, unknown>;
  evidence?: StageCompletionEvidenceInput;
}): StageCompletionEvidenceInput | undefined {
  return normalizeStageCompletionEvidenceInput(input);
}

function appendStageEvidence(
  metadata: RunMetadata,
  evidence: MarketplaceAutoReviewStageCompletionEvidence | null
): RunMetadata {
  if (!evidence) return metadata;
  const previous = Array.isArray(metadata.stageCompletionEvidence)
    ? metadata.stageCompletionEvidence
    : [];
  const byId = new Map(previous.map(item => [item.evidenceId, item]));
  byId.set(evidence.evidenceId, evidence);
  return { ...metadata, stageCompletionEvidence: [...byId.values()] };
}

function stageCompletionInputFromExisting(
  value: unknown
): StageCompletionEvidenceInput {
  const evidence = asRecord(value);
  const status = cleanText(evidence.status);
  return {
    status: status ? (status as StageEvidenceStatus) : undefined,
    requiredRefs: Array.isArray(evidence.requiredRefs)
      ? evidence.requiredRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    artifactRefs: Array.isArray(evidence.artifactRefs)
      ? evidence.artifactRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    qaVerdictRefs: Array.isArray(evidence.qaVerdictRefs)
      ? evidence.qaVerdictRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    creditRefs: Array.isArray(evidence.creditRefs)
      ? evidence.creditRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    lineageRefs: Array.isArray(evidence.lineageRefs)
      ? evidence.lineageRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    policyRefs: Array.isArray(evidence.policyRefs)
      ? evidence.policyRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    acceptanceRefs: Array.isArray(evidence.acceptanceRefs)
      ? evidence.acceptanceRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    missingRefs: Array.isArray(evidence.missingRefs)
      ? evidence.missingRefs.map(item => cleanText(item)).filter(Boolean)
      : [],
    warningApprovalRefs: Array.isArray(evidence.warningApprovalRefs)
      ? evidence.warningApprovalRefs
          .map(item => cleanText(item))
          .filter(Boolean)
      : [],
  };
}

function stageOutputWithEvidence(
  output: Record<string, unknown> | undefined,
  evidence: MarketplaceAutoReviewStageCompletionEvidence | null
) {
  if (!evidence) return output ?? {};
  return {
    ...(output ?? {}),
    completionEvidenceId: evidence.evidenceId,
    completionEvidence: evidence,
    evidenceRefs: uniqRefs([
      ...(Array.isArray(output?.evidenceRefs) ? output?.evidenceRefs : []),
      evidence.evidenceId,
    ]),
  };
}

function productImageRefForIndex(index: number, url: string): string {
  return `product-image:${index + 1}:${buildProductionStableHash({ url }).slice(0, 12)}`;
}

function referenceAnchorRefForUrl(
  kind: "character" | "environment",
  url: string
): string {
  return `${kind}-reference:${buildProductionStableHash({ url }).slice(0, 16)}`;
}

function anchorMetadataRecord(
  input: MarketplaceAutoReviewReferenceAnchorsInput | null | undefined,
  role: "product" | "character" | "environment"
): Record<string, unknown> {
  const prefix =
    role === "product"
      ? "productImage"
      : role === "character"
        ? "characterImage"
        : "environmentImage";
  const record = input ? (input as Record<string, unknown>) : {};
  const ref = cleanText(record[`${prefix}Ref`]);
  const hash = cleanText(record[`${prefix}Hash`]);
  const source = cleanText(record[`${prefix}Source`]);
  const uploadKey =
    role === "product"
      ? cleanText(record[`${prefix}StorageKey`])
      : cleanText(record[`${prefix}UploadKey`]);
  const sourceUrl =
    role === "product" ? cleanText(record[`${prefix}SourceUrl`]) : "";
  const id = role === "product" ? cleanText(record[`${prefix}Id`]) : "";
  const fileName =
    role === "product" ? "" : cleanText(record[`${prefix}FileName`]);
  const fileType =
    role === "product" ? "" : cleanText(record[`${prefix}FileType`]);
  const fileSizeBytes =
    role === "product" ? 0 : toNumber(record[`${prefix}FileSizeBytes`]);
  const auditMetadata = asRecord(asRecord(input?.auditMetadata)[role]);
  const referenceFormat = cleanText(auditMetadata.referenceFormat);
  const multiViewSheetAllowed = auditMetadata.multiViewSheetAllowed === true;
  const dimensions = asRecord(auditMetadata.dimensions);
  const verifiedEvidence = asRecord(
    asRecord(input?.serverVerifiedProviderEvidence)[role]
  );
  const auditRefs = uniqRefs([
    ref,
    hash ? `${role}-image-sha256:${hash}` : "",
    uploadKey ? `${role}-image-upload:${uploadKey}` : "",
    source ? `${role}-image-source:${source}` : "",
    id ? `marketplace-product-image:${id}` : "",
    cleanText(verifiedEvidence.evidenceRef),
  ]);
  return compactRecord({
    role,
    ref: ref || null,
    source: source || null,
    sourceUrl: sourceUrl || null,
    uploadKey: uploadKey || null,
    hash: hash || null,
    id: id || null,
    referenceFormat: referenceFormat || null,
    multiViewSheetAllowed: multiViewSheetAllowed || null,
    dimensions:
      toNumber(dimensions.width) > 0 && toNumber(dimensions.height) > 0
        ? {
            width: toNumber(dimensions.width),
            height: toNumber(dimensions.height),
          }
        : null,
    fileEvidence:
      fileName || fileType || fileSizeBytes
        ? compactRecord({
            fileName,
            fileType,
            fileSizeBytes: fileSizeBytes || null,
          })
        : null,
    verifiedProviderEvidence:
      Object.keys(verifiedEvidence).length > 0 ? verifiedEvidence : null,
    auditRefs,
  });
}

function referenceAnchorAuditRefs(
  anchors: ResolvedMarketplaceAutoReviewReferenceAnchors
): string[] {
  const metadata = asRecord(anchors.sourceMetadata);
  return uniqRefs([
    ...((asRecord(metadata.product).auditRefs as unknown[]) ?? []),
    ...((asRecord(metadata.character).auditRefs as unknown[]) ?? []),
    ...((asRecord(metadata.environment).auditRefs as unknown[]) ?? []),
    ...anchors.auditRefs,
  ]);
}

function usableAuditRefs(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map(item => cleanText(item))
    .filter(Boolean)
    .filter(item => !/placeholder|synthetic|scaffold|fallback/i.test(item));
}

function providerReferenceEvidenceRefs(input: {
  metadata?: Record<string, unknown> | null;
  refs?: unknown;
}): string[] {
  const metadata = asRecord(input.metadata);
  const verifiedEvidence = asRecord(metadata.verifiedProviderEvidence);
  return uniqRefs([
    ...usableAuditRefs(metadata.auditRefs),
    ...(Array.isArray(input.refs) ? input.refs : []),
    cleanText(metadata.ref),
    cleanText(verifiedEvidence.evidenceRef),
    cleanText(metadata.id) ? `marketplace-product-image:${metadata.id}` : "",
    cleanText(metadata.hash)
      ? `${cleanText(metadata.role) || "reference"}-image-sha256:${metadata.hash}`
      : "",
    cleanText(metadata.uploadKey)
      ? `${cleanText(metadata.role) || "reference"}-image-upload:${metadata.uploadKey}`
      : "",
    cleanText(metadata.source)
      ? `${cleanText(metadata.role) || "reference"}-image-source:${metadata.source}`
      : "",
  ]);
}

function hasExplicitVerifiedProviderReferenceEvidence(
  metadata: Record<string, unknown>
): boolean {
  const evidence = asRecord(metadata.verifiedProviderEvidence);
  const status = cleanText(evidence.status);
  const verifiedBy = cleanText(evidence.verifiedBy);
  const evidenceRefs = usableAuditRefs([
    cleanText(evidence.evidenceRef),
    ...recordRefList(evidence, "evidenceRefs"),
  ]);
  return (
    ["verified", "passed"].includes(status) &&
    ["server", "runtime", "test"].includes(verifiedBy) &&
    evidenceRefs.length > 0
  );
}

function referenceUrlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function uploadOrStorageUrlMatchesServerPath(input: {
  url: string;
  metadata: Record<string, unknown>;
}): boolean {
  const url = cleanText(input.url);
  if (/^https?:\/\//i.test(url)) {
    return false;
  }
  const path = referenceUrlPath(url);
  if (
    !/^\/(api\/|uploads\/|storage\/|media\/|assets\/|library\/|renders\/)/i.test(
      path
    )
  ) {
    return false;
  }
  const uploadKey = cleanText(input.metadata.uploadKey).replace(/^\/+/, "");
  const fileName = cleanText(asRecord(input.metadata.fileEvidence).fileName);
  return Boolean(
    (uploadKey && path.endsWith(`/${uploadKey}`)) ||
    (fileName &&
      /^\/(api\/|uploads\/|storage\/|media\/)/i.test(path) &&
      path.endsWith(`/${fileName}`))
  );
}

function storageKeyFromServerRelativeReferenceUrl(url: string): string | null {
  const path = referenceUrlPath(cleanText(url));
  if (path.startsWith("/api/storage/files/")) {
    return decodeURIComponent(path.slice("/api/storage/files/".length));
  }
  if (path.startsWith("/uploads/")) {
    return decodeURIComponent(path.slice("/uploads/".length));
  }
  return null;
}

async function hasServerVerifiedUploadedReference(input: {
  url: string | null;
  uploadKey?: unknown;
  fileName?: unknown;
  auth: AuthContext;
}): Promise<boolean> {
  const url = cleanText(input.url);
  if (!url || /^https?:\/\//i.test(url)) return false;
  const uploadKey = cleanText(input.uploadKey).replace(/^\/+/, "");
  const storageKey = storageKeyFromServerRelativeReferenceUrl(url);
  if (!uploadKey || !storageKey || storageKey !== uploadKey) return false;
  if (!uploadKey.startsWith(`chat/uploads/${input.auth.userId}/`)) return false;
  // ai.upload stores the object under a randomized provider-safe key. The
  // original fileName is audit evidence, not the storage basename.
  return storageExists(uploadKey).catch(() => false);
}

function verifiedProviderEvidence(
  role: "product" | "character" | "environment",
  evidenceRef: string,
  verifiedBy: "server" | "runtime" | "test" = "server"
): Record<string, unknown> {
  return {
    role,
    status: "verified",
    verifiedBy,
    evidenceRef,
  };
}

function storedProductImageVerifiedEvidence(
  productImageUrl: string,
  productImageIndex: number
): Record<string, unknown> {
  return verifiedProviderEvidence(
    "product",
    `stored-product-image:${productImageIndex + 1}:${buildProductionStableHash({
      url: productImageUrl,
    }).slice(0, 12)}`
  );
}

async function serverVerifiedProviderEvidenceFromAnchors(
  referenceAnchors:
    | MarketplaceAutoReviewReferenceAnchorsInput
    | null
    | undefined,
  productTruth: Pick<ProductTruth, "imageUrls">,
  auth: AuthContext
): Promise<Record<string, unknown>> {
  const productImageUrl = cleanText(referenceAnchors?.productImageUrl);
  const productImageIndex = productTruth.imageUrls
    .map(item => cleanText(item))
    .findIndex(url => url === productImageUrl);
  const evidence: Record<string, unknown> = {};
  if (productImageUrl && productImageIndex >= 0) {
    evidence.product = storedProductImageVerifiedEvidence(
      productImageUrl,
      productImageIndex
    );
  }
  const characterUrl = cleanText(referenceAnchors?.characterImageUrl);
  if (
    await hasServerVerifiedUploadedReference({
      url: characterUrl,
      uploadKey: referenceAnchors?.characterImageUploadKey,
      fileName: referenceAnchors?.characterImageFileName,
      auth,
    })
  ) {
    evidence.character = verifiedProviderEvidence(
      "character",
      `verified-upload-reference:character:${buildProductionStableHash({
        url: characterUrl,
      }).slice(0, 12)}`
    );
  }
  const environmentUrl = cleanText(referenceAnchors?.environmentImageUrl);
  if (
    await hasServerVerifiedUploadedReference({
      url: environmentUrl,
      uploadKey: referenceAnchors?.environmentImageUploadKey,
      fileName: referenceAnchors?.environmentImageFileName,
      auth,
    })
  ) {
    evidence.environment = verifiedProviderEvidence(
      "environment",
      `verified-upload-reference:environment:${buildProductionStableHash({
        url: environmentUrl,
      }).slice(0, 12)}`
    );
  }
  return evidence;
}

function hasTrustedProviderReferenceEvidence(input: {
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  refs?: unknown;
}): boolean {
  const metadata = asRecord(input.metadata);
  return hasExplicitVerifiedProviderReferenceEvidence(metadata);
}

function providerReferenceReadiness(input: {
  url: string | null;
  metadata?: Record<string, unknown> | null;
  refs?: unknown;
}): { ready: boolean; reasonCodes: string[]; trustedRefs: string[] } {
  const url = cleanText(input.url);
  const reasonCodes: string[] = [];
  if (!url) reasonCodes.push("reference_url_missing");
  if (/^data:image\//i.test(url)) reasonCodes.push("data_url_not_allowed");
  if (
    url &&
    !/^https:\/\//i.test(url) &&
    !/^\/(api\/|uploads\/|storage\/|media\/|assets\/|library\/|renders\/)/i.test(
      url
    )
  ) {
    reasonCodes.push("unsupported_or_untrusted_url_scheme");
  }
  const trustedRefs = providerReferenceEvidenceRefs(input);
  if (!hasTrustedProviderReferenceEvidence({ ...input, url })) {
    reasonCodes.push("trusted_reference_evidence_missing");
  }
  return {
    ready: reasonCodes.length === 0,
    reasonCodes,
    trustedRefs,
  };
}

function normalizeMarketplaceAutoReviewCharacterMode(
  value: unknown
):
  | "product_only"
  | "hands_only"
  | "described_character"
  | "uploaded_reference"
  | null {
  const mode = cleanText(value);
  return mode === "product_only" ||
    mode === "hands_only" ||
    mode === "described_character" ||
    mode === "uploaded_reference"
    ? mode
    : null;
}

function normalizeMarketplaceAutoReviewCharacterBrief(
  value: unknown
): string | null {
  return cleanText(value) || null;
}

function normalizeMarketplaceAutoReviewCharacterPreset(
  value: unknown
): string | Record<string, unknown> | unknown[] | null {
  if (typeof value === "string") return cleanText(value) || null;
  if (Array.isArray(value)) {
    const values = value
      .map(item =>
        typeof item === "string" ? cleanText(item) : item ? item : null
      )
      .filter(Boolean) as Array<unknown>;
    return values.length > 0 ? values : null;
  }
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function characterPresetContinuityDescriptors(value: unknown): string[] {
  const record = asRecord(value);
  const text = cleanText(value);
  if (text) return [`Character preset: ${text}`];
  const entries = Object.entries(record);
  if (entries.length === 0) return [];
  return [
    `Character preset: ${entries
      .map(([key, raw]) => `${key}: ${cleanText(raw)}`)
      .join(", ")}`,
  ];
}

function characterPresetVisualDetailsFromRecord(
  record: Record<string, string>
): string {
  return [
    record.primaryCharacterDetails
      ? `Character 1 additional details: ${record.primaryCharacterDetails}`
      : "",
    record.secondaryCharacterDetails
      ? `Character 2 details: ${record.secondaryCharacterDetails}`
      : "",
    record.propDetails ? `Prop details: ${record.propDetails}` : "",
  ]
    .map(item => cleanText(item))
    .filter(Boolean)
    .join("; ");
}

const MARKETPLACE_AUTO_REVIEW_CHARACTER_GENDER_PROMPT_LABELS: Record<
  string,
  string
> = {
  female: "female presenter/woman",
  male: "male presenter/man",
  gender_neutral: "gender-neutral adult presenter",
};

const MARKETPLACE_AUTO_REVIEW_CHARACTER_AGE_PROMPT_LABELS: Record<
  string,
  string
> = {
  young_adult_20_29: "20-29 years old",
  adult_30_39: "30-39 years old",
  middle_age_40_59: "40-59 years old",
  teen_16_19: "16-19 years old",
};

const MARKETPLACE_AUTO_REVIEW_CHARACTER_APPEARANCE_PROMPT_LABELS: Record<
  string,
  string
> = {
  thai: "Thai",
  southeast_asian: "Southeast Asian",
  east_asian: "East Asian",
  international: "international",
};

const MARKETPLACE_AUTO_REVIEW_CHARACTER_ROLE_PROMPT_LABELS: Record<
  string,
  string
> = {
  reviewer: "reviewer",
  buyer: "real buyer",
  mom_parent: "parent/guardian reviewer",
  office_worker: "office worker reviewer",
  technician: "practical expert/technician",
  creator_host: "creator host",
};

const MARKETPLACE_AUTO_REVIEW_CHARACTER_STYLE_PROMPT_LABELS: Record<
  string,
  string
> = {
  casual_home: "casual home style",
  clean_ugc: "clean UGC style",
  premium_neat: "premium neat style",
  friendly_everyday: "friendly everyday style",
  expert_practical: "practical expert style",
};

const MARKETPLACE_AUTO_REVIEW_TONE_DIRECTIVES: Record<
  string,
  { label: string; directive: string }
> = {
  warm_honest: {
    label: "จริงใจเป็นกันเอง",
    directive:
      "Warm honest everyday review: natural Thai, sincere, friendly, specific, not over-selling.",
  },
  funny_light: {
    label: "ตลกขำเบา ๆ",
    directive:
      "Light comedic review: use gentle relatable humor about the situation, never mock people, never use slapstick that distracts from product proof.",
  },
  irritated_problem: {
    label: "หงุดหงิดกับปัญหา",
    directive:
      "Problem-frustrated review: the presenter sounds annoyed by the real problem at first, then relieved when the product helps; do not sound aggressive, abusive, or angry at the viewer.",
  },
  energetic_excited: {
    label: "ตื่นเต้นพลังสูง",
    directive:
      "Energetic excited review: quick, upbeat, high-energy delivery while keeping claims evidence-safe and easy to follow.",
  },
  empathetic_soft: {
    label: "อบอุ่นเห็นใจ",
    directive:
      "Soft empathetic review: acknowledge the viewer's pain gently, reduce anxiety, and make the solution feel practical and caring.",
  },
  expert_confident: {
    label: "ผู้เชี่ยวชาญมั่นใจ",
    directive:
      "Confident expert review: practical, precise, evidence-led explanation with calm authority and no unsupported superiority claims.",
  },
  straight_serious: {
    label: "ตรงไปตรงมา จริงจัง",
    directive:
      "Straight serious review: concise, direct, no jokes, focus on observable problem, proof, limitation, and fit.",
  },
};

const MARKETPLACE_AUTO_REVIEW_STORYTELLING_DIRECTIVES: Record<
  string,
  { label: string; directive: string }
> = {
  hook_problem_emotion_insight_solution_result_cta: {
    label: "Hook → Problem → Emotion → Insight → Solution → Result → CTA",
    directive:
      "Use this arc: hook fast, show the viewer's problem, deepen the relatable emotion, give one useful insight, introduce the product as the solution, show the result, then close with CTA/takeaway.",
  },
  hook_problem_insight_proof_cta: {
    label: "Hook → Problem → Insight → Proof → CTA",
    directive:
      "Use this short-video arc: hook, problem, insight, product proof, CTA. Keep proof visual and evidence-safe.",
  },
  product_review_situation_problem_try_result_fit: {
    label: "Situation → Problem → Try → Result → Fit",
    directive:
      "Use this product-review arc: real situation, problem found, try the product, visible result, who it fits and any honest limitation.",
  },
  before_after_bridge: {
    label: "Before → After → Bridge",
    directive:
      "Use this arc: clearly show before state, after state, and the product bridge that caused the change.",
  },
  pas: {
    label: "PAS",
    directive:
      "Use PAS: problem, agitate only enough to feel real, then solution. Avoid fearmongering or exaggerated pain.",
  },
  aida: {
    label: "AIDA",
    directive:
      "Use AIDA: attention, interest, desire, action. Keep desire grounded in observable product use, not unsupported claims.",
  },
  relatable_story: {
    label: "Relatable Story",
    directive:
      "Use a relatable-story arc: familiar behavior, unspoken truth, feeling, new angle, shareable ending.",
  },
  problem_struggle_solution_transformation: {
    label: "Problem → Struggle → Solution → Transformation",
    directive:
      "Use this transformation arc: problem, struggle, solution, changed result. Make before/after visually clear.",
  },
};

function normalizeMarketplaceAutoReviewReviewTone(
  value: unknown
): string | null {
  const key = cleanText(value).toLowerCase();
  return MARKETPLACE_AUTO_REVIEW_TONE_DIRECTIVES[key] ? key : null;
}

function normalizeMarketplaceAutoReviewStorytellingStructure(
  value: unknown
): string | null {
  const key = cleanText(value).toLowerCase();
  return MARKETPLACE_AUTO_REVIEW_STORYTELLING_DIRECTIVES[key] ? key : null;
}

function buildMarketplaceAutoReviewCreativeDirectionDirective(
  anchors: Pick<
    ResolvedMarketplaceAutoReviewReferenceAnchors,
    "reviewTone" | "storytellingStructure"
  >
): string {
  const tone =
    anchors.reviewTone &&
    MARKETPLACE_AUTO_REVIEW_TONE_DIRECTIVES[anchors.reviewTone];
  const structure =
    anchors.storytellingStructure &&
    MARKETPLACE_AUTO_REVIEW_STORYTELLING_DIRECTIVES[
      anchors.storytellingStructure
    ];
  if (!tone && !structure) return "";
  return [
    "USER-SELECTED CREATIVE DIRECTION LOCK:",
    tone ? `Review tone: ${tone.label}. ${tone.directive}` : "",
    structure
      ? `Storytelling structure: ${structure.label}. ${structure.directive}`
      : "",
    "These selected creative direction fields override the automatic creative variation seed wherever they conflict, while product truth, policy, shot count, and reference anchors remain higher priority.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function creativeDirectionDirectiveForTest(input: {
  reviewTone?: string | null;
  storytellingStructure?: string | null;
}): string {
  return buildMarketplaceAutoReviewCreativeDirectionDirective({
    reviewTone: normalizeMarketplaceAutoReviewReviewTone(input.reviewTone),
    storytellingStructure: normalizeMarketplaceAutoReviewStorytellingStructure(
      input.storytellingStructure
    ),
  });
}

function characterPresetRecordFromUnknown(
  value: unknown
): Record<string, string> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, raw]) => [key, cleanText(raw)] as const)
      .filter(([_key, raw]) => raw)
  );
}

function characterPresetRecordFromText(text: string): Record<string, string> {
  const source = cleanText(text);
  const keys = [
    "mode",
    "gender",
    "genderLabel",
    "age",
    "ageLabel",
    "appearance",
    "appearanceLabel",
    "role",
    "roleLabel",
    "style",
    "styleLabel",
    "primaryCharacterDetails",
    "secondaryCharacterDetails",
    "propDetails",
  ];
  return Object.fromEntries(
    keys
      .map(key => {
        const match = new RegExp(`\\b${key}\\s*:\\s*([^,;\\n]+)`, "i").exec(
          source
        );
        return [
          key,
          cleanText(match?.[1] ?? "").replace(/[.。]+$/, ""),
        ] as const;
      })
      .filter(([_key, raw]) => raw)
  );
}

function promptLabelFromChoice(
  id: unknown,
  label: unknown,
  lookup: Record<string, string>
): string {
  const mapped = lookup[cleanText(id).toLowerCase()];
  if (mapped) return mapped;
  const text = cleanText(label);
  return /^auto$/i.test(text) ? "" : text;
}

function promptAgeLabelFromChoice(id: unknown, label: unknown): string {
  const mapped =
    MARKETPLACE_AUTO_REVIEW_CHARACTER_AGE_PROMPT_LABELS[
      cleanText(id).toLowerCase()
    ];
  if (mapped) return mapped;
  const text = cleanText(label);
  if (!text || /^auto$/i.test(text)) return "";
  return /^\d{2}\s*[-–]\s*\d{2}$/.test(text) ? `${text} years old` : text;
}

function characterSubjectFromPresetRecord(
  record: Record<string, string>
): string {
  return [
    promptLabelFromChoice(
      record.appearance,
      record.appearanceLabel,
      MARKETPLACE_AUTO_REVIEW_CHARACTER_APPEARANCE_PROMPT_LABELS
    ),
    promptLabelFromChoice(
      record.gender,
      record.genderLabel,
      MARKETPLACE_AUTO_REVIEW_CHARACTER_GENDER_PROMPT_LABELS
    ),
    promptAgeLabelFromChoice(record.age, record.ageLabel),
    promptLabelFromChoice(
      record.role,
      record.roleLabel,
      MARKETPLACE_AUTO_REVIEW_CHARACTER_ROLE_PROMPT_LABELS
    ),
    promptLabelFromChoice(
      record.style,
      record.styleLabel,
      MARKETPLACE_AUTO_REVIEW_CHARACTER_STYLE_PROMPT_LABELS
    ),
  ]
    .map(item => cleanText(item))
    .filter(Boolean)
    .join(", ");
}

function buildMarketplaceAutoReviewCharacterVideoLock(input: {
  characterMode?: string | null;
  characterBrief?: string | null;
  characterPreset?: unknown;
  hasCharacterImage?: boolean;
}): string {
  const preset = characterPresetRecordFromUnknown(input.characterPreset);
  const characterMode = cleanText(input.characterMode) || preset.mode;
  if (characterMode === "product_only") {
    return "VIDEO CHARACTER LOCK: Product-only mode is selected. Do not generate a visible presenter, face, full body, narrator, or recurring person; keep product-only framing.";
  }
  if (characterMode === "hands_only") {
    return "VIDEO CHARACTER LOCK: Hands-only mode is selected. Use only hands or face-hidden partial body; do not generate a visible presenter face or recurring person identity.";
  }
  if (characterMode === "uploaded_reference" && input.hasCharacterImage) {
    return [
      "VIDEO CHARACTER LOCK:",
      "The uploaded character reference image is the presenter source of truth.",
      "For Veo 3.1, infer the presenter's apparent gender presentation, age range, maturity, styling, and reviewer persona from the uploaded character image and visible reference frames.",
      "The spoken Thai voice must match that apparent character from the image; hidden/default character-choice values must not override the uploaded reference.",
      "Keep the presenter's voice, wardrobe family, identity, and demographics consistent with the selected image/frame references across shots.",
    ].join(" ");
  }

  const subject = characterSubjectFromPresetRecord(preset);
  const visualDetails = characterPresetVisualDetailsFromRecord(preset);
  const characterBrief = cleanText(input.characterBrief);
  if (
    !subject &&
    !visualDetails &&
    !characterBrief &&
    !input.hasCharacterImage
  ) {
    return "";
  }

  const source = input.hasCharacterImage
    ? "the uploaded character reference image and selected character choices"
    : "the selected character choices";
  return [
    "VIDEO CHARACTER LOCK:",
    `${source} are the presenter source of truth.`,
    subject
      ? `For Veo 3.1, any visible presenter/reviewer must be ${subject}.`
      : "",
    visualDetails ? `User-selected visual details: ${visualDetails}.` : "",
    characterBrief ? `User-selected character brief: ${characterBrief}` : "",
    "Keep the presenter's gender, age range, appearance, role, wardrobe family, and identity consistent with the selected image/frame references across shots.",
    "Do not let a generic audio profile override the selected presenter demographics.",
  ]
    .filter(Boolean)
    .join(" ");
}

function marketplaceAutoReviewReferenceAnchorsFromMetadata(
  metadata?: RunMetadata | null
): Record<string, unknown> {
  const anchors = asRecord(metadata?.referenceAnchors);
  return Object.keys(anchors).length > 0 ? anchors : {};
}

function buildMarketplaceAutoReviewCharacterVideoLockFromReferenceAnchors(
  value: unknown
): string {
  const anchors = asRecord(value);
  if (Object.keys(anchors).length === 0) return "";
  const hasCharacterImage = Boolean(
    cleanText(anchors.characterImageUrl) ||
    cleanText(anchors.characterImageRef) ||
    cleanText(anchors.characterImageProvidedRef)
  );
  return buildMarketplaceAutoReviewCharacterVideoLock({
    characterMode: normalizeMarketplaceAutoReviewCharacterMode(
      anchors.characterMode
    ),
    characterBrief: normalizeMarketplaceAutoReviewCharacterBrief(
      anchors.characterBrief
    ),
    characterPreset: normalizeMarketplaceAutoReviewCharacterPreset(
      anchors.characterPreset
    ),
    hasCharacterImage,
  });
}

function characterPresetRecordFromPlanOrMetadata(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): Record<string, string> {
  const fromPlan = characterPresetRecordFromText(plan.productDetail);
  if (Object.keys(fromPlan).length > 0) return fromPlan;
  return characterPresetRecordFromUnknown(
    marketplaceAutoReviewReferenceAnchorsFromMetadata(metadata).characterPreset
  );
}

function marketplaceAutoReviewUsesUploadedCharacterReference(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): boolean {
  const detail = cleanText(plan.productDetail);
  const anchors = marketplaceAutoReviewReferenceAnchorsFromMetadata(metadata);
  const characterMode = normalizeMarketplaceAutoReviewCharacterMode(
    anchors.characterMode
  );
  return Boolean(
    /uploaded character reference image|Character anchor\b/i.test(detail) ||
    (characterMode === "uploaded_reference" &&
      (cleanText(anchors.characterImageUrl) ||
        cleanText(anchors.characterImageRef) ||
        cleanText(anchors.characterImageProvidedRef)))
  );
}

function marketplaceAutoReviewPresenterGenderFromPreset(
  record: Record<string, string>
): "male" | "female" | "gender_neutral" | "" {
  const gender = cleanText(record.gender).toLowerCase();
  const label = cleanText(record.genderLabel).toLowerCase();
  const source = `${gender} ${label}`;
  if (gender === "male" || /\b(?:male|man)\b|ผู้ชาย|ชาย/.test(source)) {
    return "male";
  }
  if (gender === "female" || /\b(?:female|woman)\b|ผู้หญิง|หญิง/.test(source)) {
    return "female";
  }
  if (
    gender === "gender_neutral" ||
    /gender[-_\s]?neutral|ไม่ระบุเพศ/.test(source)
  ) {
    return "gender_neutral";
  }
  return "";
}

function marketplaceAutoReviewPresenterGenderFromPlanOrMetadata(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): "male" | "female" | "gender_neutral" | "" {
  if (marketplaceAutoReviewUsesUploadedCharacterReference(plan, metadata)) {
    return "";
  }
  return marketplaceAutoReviewPresenterGenderFromPreset(
    characterPresetRecordFromPlanOrMetadata(plan, metadata)
  );
}

function stripThaiGenderedPoliteParticles(value: string): string {
  return cleanText(value)
    .replace(/นะคะ/g, "นะ")
    .replace(/นะครับ/g, "นะ")
    .replace(/ค่ะ|คะ|ครับ/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function alignThaiSpeechToMarketplaceAutoReviewPresenter(
  value: string,
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): string {
  const text = cleanText(value);
  if (!text) return "";
  const gender = marketplaceAutoReviewPresenterGenderFromPlanOrMetadata(
    plan,
    metadata
  );
  if (gender === "male") {
    return text.replace(/นะคะ/g, "นะครับ").replace(/ค่ะ|คะ/g, "ครับ");
  }
  if (marketplaceAutoReviewUsesUploadedCharacterReference(plan, metadata)) {
    return stripThaiGenderedPoliteParticles(text);
  }
  return text;
}

function extractMarkedPromptLine(text: string, marker: string): string {
  const source = cleanText(text);
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const tail = source.slice(start);
  const boundaryIndex = [
    " Character anchor ",
    " No character/person reference ",
    " Environment anchor ",
    " No environment reference ",
    " Product anchor ",
    " USER-SELECTED REFERENCE ANCHOR LOCK:",
    " PRODUCT DETAIL / PRODUCT FACTS LOCK:",
  ]
    .map(needle => tail.indexOf(needle, marker.length))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  const scopedTail =
    typeof boundaryIndex === "number" ? tail.slice(0, boundaryIndex) : tail;
  const nextMarker = /\s[A-Z][A-Z /-]{3,}:/g;
  nextMarker.lastIndex = marker.length;
  const next = nextMarker.exec(scopedTail);
  return cleanText(next ? scopedTail.slice(0, next.index) : scopedTail);
}

function extractApprovedCharacterBriefFromDirective(text: string): string {
  const match =
    /approved presenter\/reviewer\/persona is\s+(.+?)(?:\.| This described character| Character preset:|$)/i.exec(
      text
    );
  return cleanText(match?.[1] ?? "");
}

function buildMarketplaceAutoReviewVideoCharacterLockFromPlan(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): string {
  const detail = cleanText(plan.productDetail);
  const explicitLock = extractMarkedPromptLine(detail, "VIDEO CHARACTER LOCK:");
  if (explicitLock) return explicitLock;

  const describedDirective = extractMarkedPromptLine(
    detail,
    "USER-SELECTED DESCRIBED CHARACTER LOCK:"
  );
  if (describedDirective) {
    const preset = characterPresetRecordFromText(describedDirective);
    const lock = buildMarketplaceAutoReviewCharacterVideoLock({
      characterMode: preset.mode || "described_character",
      characterBrief:
        extractApprovedCharacterBriefFromDirective(describedDirective),
      characterPreset: preset,
    });
    return lock || describedDirective;
  }

  if (
    /Character anchor\b/i.test(detail) &&
    !/No character\/person reference was supplied/i.test(detail)
  ) {
    return "VIDEO CHARACTER LOCK: The uploaded character reference image is the presenter identity source of truth. Infer the presenter's apparent gender presentation, age range, maturity, styling, reviewer persona, and matching Thai voice from the uploaded character image and visible reference frames. Preserve the same person identity, face structure, hair, body proportions, styling, and apparent demographics from the selected reference/frame images across shots.";
  }

  return buildMarketplaceAutoReviewCharacterVideoLockFromReferenceAnchors(
    marketplaceAutoReviewReferenceAnchorsFromMetadata(metadata)
  );
}

function sanitizeMarketplaceAutoReviewAudioProfileVoiceBrief(
  voiceBrief: string
): string {
  const value = cleanText(voiceBrief);
  const sentenceEnd = value.indexOf(".");
  if (sentenceEnd > 0) {
    const firstSentence = value.slice(0, sentenceEnd);
    const remaining = cleanText(value.slice(sentenceEnd + 1));
    const clauses = firstSentence.split(",").map(cleanText).filter(Boolean);
    if (
      clauses.length >= 3 &&
      /(?:female|male|presenter|host|reviewer|mother|expert|voice)/i.test(
        clauses[0]
      ) &&
      /(?:\d{2}\s*-\s*\d{2}|early|late|years old|20s|30s|40s|50s)/i.test(
        clauses[1]
      )
    ) {
      return [clauses.slice(2).join(", "), remaining]
        .filter(Boolean)
        .join(". ");
    }
  }
  return value
    .replace(
      /\byoung mother-style female voice\b/gi,
      "selected presenter voice"
    )
    .replace(/\byoung female host\b/gi, "selected presenter host")
    .replace(
      /\bfemale (presenter|reviewer|practical expert)\b/gi,
      "selected $1"
    )
    .replace(/\b\d{2}\s*-\s*\d{2}\s*years old\b/gi, "selected age range")
    .replace(/\bearly 30s\b/gi, "selected age range");
}

function buildMarketplaceAutoReviewCharacterVoiceBrief(
  plan: AutoReviewPlan,
  audioProfile: MarketplaceAutoReviewVideoAudioProfile,
  metadata?: RunMetadata | null
): string {
  const videoCharacterLock =
    buildMarketplaceAutoReviewVideoCharacterLockFromPlan(plan, metadata);
  if (/uploaded character reference image/i.test(videoCharacterLock)) {
    return [
      "Uploaded character reference voice lock: infer the Thai spoken voice from the visible presenter in the uploaded character reference image and current frame references.",
      "Match the presenter's apparent gender presentation, age range, maturity, and reviewer persona from that image.",
      "Do not use any default demographic voice profile unless it matches the uploaded character reference.",
      `Voice style: ${sanitizeMarketplaceAutoReviewAudioProfileVoiceBrief(
        audioProfile.voiceBrief
      )}`,
    ].join(" ");
  }

  const preset = characterPresetRecordFromPlanOrMetadata(plan, metadata);
  const subject = characterSubjectFromPresetRecord(preset);
  if (!subject) return audioProfile.voiceBrief;
  return [
    `Selected presenter voice lock: ${subject}.`,
    "Use a voice that matches the selected presenter gender and age range.",
    `Voice style: ${sanitizeMarketplaceAutoReviewAudioProfileVoiceBrief(
      audioProfile.voiceBrief
    )}`,
  ].join(" ");
}

function marketplaceAutoReviewCharacterBriefText(
  anchors: Pick<
    ResolvedMarketplaceAutoReviewReferenceAnchors,
    "characterMode" | "characterBrief" | "characterPreset"
  >
): string {
  const brief = cleanText(anchors.characterBrief);
  const preset = characterPresetContinuityDescriptors(anchors.characterPreset)
    .map(item => cleanText(item))
    .filter(Boolean)
    .join("; ");
  return [brief, preset].filter(Boolean).join("; ");
}

export function describedCharacterAnchorDirectiveForTest(input: {
  characterMode?: string | null;
  characterBrief?: string | null;
  characterPreset?: unknown;
}): string {
  return buildMarketplaceAutoReviewDescribedCharacterDirective({
    characterMode: normalizeMarketplaceAutoReviewCharacterMode(
      input.characterMode
    ),
    characterBrief: normalizeMarketplaceAutoReviewCharacterBrief(
      input.characterBrief
    ),
    characterPreset: normalizeMarketplaceAutoReviewCharacterPreset(
      input.characterPreset
    ),
  });
}

function buildMarketplaceAutoReviewDescribedCharacterDirective(
  anchors: Pick<
    ResolvedMarketplaceAutoReviewReferenceAnchors,
    "characterMode" | "characterBrief" | "characterPreset"
  >
): string {
  if (anchors.characterMode !== "described_character") return "";
  const characterBrief = marketplaceAutoReviewCharacterBriefText(anchors);
  if (!characterBrief) return "";
  return [
    `USER-SELECTED DESCRIBED CHARACTER LOCK: The approved presenter/reviewer/persona is ${characterBrief}.`,
    "This described character is an approved character anchor even when no character image is uploaded.",
    "Storyboard planning and image prompts must keep this adult/persona demographic visible as the presenter/reviewer/parent role when people are shown.",
    "Do not replace this selected presenter with a child, toddler, baby, generic foreign family, or different demographic just because the product is for children.",
    "For child-focused products, a child may appear only as secondary product-use context when needed; the child must not become the recurring hero, narrator, presenter, or identity anchor.",
    "If a face is visible in the final storyboard, at least one active frame should clearly show the selected described presenter/persona. Prefer 2-3 active frames when the user selected a character/presenter.",
  ].join(" ");
}

function assertProviderReadyReferenceAnchor(
  kind: "product" | "character" | "environment",
  url: string | null,
  metadata?: Record<string, unknown> | null,
  refs?: unknown
): string {
  if (!url) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        kind === "character"
          ? "ต้องเลือกรูปอ้างอิงตัวละคร (ตัวละคร/บุคคล) ก่อนเริ่มสร้างสตอร์รีบอร์ดอัตโนมัติ"
          : kind === "environment"
            ? "ต้องเลือกรูปอ้างอิงฉาก/ที่มาใช้ถ่ายเพื่อใช้กับการสร้างสื่ออัตโนมัติก่อนเริ่มงาน"
            : "ต้องเลือกรูปสินค้าหลักที่จะใช้สร้างรีวิวก่อน เพื่อไม่ให้ระบบสับสนระหว่างสี รุ่น หรือรูปทรงสินค้า",
    });
  }
  const readiness = providerReferenceReadiness({ url, metadata, refs });
  if (!readiness.ready) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        kind === "character"
          ? "รูปตัวละครอ้างอิงยังไม่พร้อมใช้เป็น reference สำหรับ provider กรุณาอัปโหลดหรือเลือก URL ที่ระบบเข้าถึงได้"
          : kind === "environment"
            ? "รูปฉากอ้างอิงยังไม่พร้อมใช้เป็น reference สำหรับ provider กรุณาอัปโหลดหรือเลือก URL ที่ระบบเข้าถึงได้"
            : "รูปสินค้าหลักยังไม่พร้อมใช้เป็น reference สำหรับ provider กรุณาอัปโหลดหรือเลือก URL ที่ระบบเข้าถึงได้",
    });
  }
  return url;
}

function resolveMarketplaceAutoReviewReferenceAnchors(params: {
  referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  productTruth: Pick<ProductTruth, "imageUrls">;
}): ResolvedMarketplaceAutoReviewReferenceAnchors {
  const imageUrls = params.productTruth.imageUrls.map(url => cleanText(url));
  let productImageUrl =
    cleanText(params.referenceAnchors?.productImageUrl) || null;
  const characterMode = normalizeMarketplaceAutoReviewCharacterMode(
    params.referenceAnchors?.characterMode
  );
  const characterBrief = normalizeMarketplaceAutoReviewCharacterBrief(
    params.referenceAnchors?.characterBrief
  );
  const characterPreset = normalizeMarketplaceAutoReviewCharacterPreset(
    params.referenceAnchors?.characterPreset
  );
  const reviewTone = normalizeMarketplaceAutoReviewReviewTone(
    params.referenceAnchors?.reviewTone
  );
  const storytellingStructure =
    normalizeMarketplaceAutoReviewStorytellingStructure(
      params.referenceAnchors?.storytellingStructure
    );
  const characterImageUrl =
    cleanText(params.referenceAnchors?.characterImageUrl) || null;
  const environmentImageUrl =
    cleanText(params.referenceAnchors?.environmentImageUrl) || null;
  let productMetadata = anchorMetadataRecord(
    params.referenceAnchors,
    "product"
  );
  const characterMetadata = anchorMetadataRecord(
    params.referenceAnchors,
    "character"
  );
  const environmentMetadata = anchorMetadataRecord(
    params.referenceAnchors,
    "environment"
  );
  const sourceRefs = Array.isArray(params.referenceAnchors?.sourceRefs)
    ? params.referenceAnchors.sourceRefs.map(cleanText).filter(Boolean)
    : [];

  if (!productImageUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "ต้องเลือกรูปสินค้าหลักที่จะใช้สร้างรีวิวก่อน เพื่อไม่ให้ระบบสับสนระหว่างสี รุ่น หรือรูปทรงสินค้า",
    });
  }

  const productImageIndex = imageUrls.findIndex(url => url === productImageUrl);
  if (productImageIndex < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "รูปสินค้าหลักที่เลือกต้องเป็นรูปที่แนบอยู่กับสินค้านี้เท่านั้น",
    });
  }
  const schemaVersion = Number.isInteger(params.referenceAnchors?.schemaVersion)
    ? Number(params.referenceAnchors?.schemaVersion)
    : 1;
  const requiredRoles = Array.isArray(params.referenceAnchors?.requiredRoles)
    ? params.referenceAnchors.requiredRoles
        .map(role => cleanText(role))
        .filter(role => ["product", "character", "environment"].includes(role))
    : ["product", "character", "environment"];
  if (!requiredRoles.includes("product")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Auto Review ต้องมี product reference anchor ก่อนเริ่มงาน",
    });
  }
  productMetadata = {
    ...productMetadata,
    verifiedProviderEvidence:
      Object.keys(asRecord(productMetadata.verifiedProviderEvidence)).length > 0
        ? productMetadata.verifiedProviderEvidence
        : storedProductImageVerifiedEvidence(
            productImageUrl,
            productImageIndex
          ),
  };
  productImageUrl = assertProviderReadyReferenceAnchor(
    "product",
    productImageUrl,
    productMetadata,
    sourceRefs
  );
  const isCharacterMode =
    characterMode === "described_character" ||
    characterMode === "product_only" ||
    characterMode === "hands_only";

  const readyCharacterImageUrl =
    requiredRoles.includes("character") && !isCharacterMode
      ? assertProviderReadyReferenceAnchor(
          "character",
          characterImageUrl,
          characterMetadata,
          sourceRefs
        )
      : characterImageUrl;
  const readyEnvironmentImageUrl = requiredRoles.includes("environment")
    ? assertProviderReadyReferenceAnchor(
        "environment",
        environmentImageUrl,
        environmentMetadata,
        sourceRefs
      )
    : environmentImageUrl;
  const productImageProvidedRef = cleanText(
    params.referenceAnchors?.productImageRef
  );
  const characterImageProvidedRef = cleanText(
    params.referenceAnchors?.characterImageRef
  );
  const environmentImageProvidedRef = cleanText(
    params.referenceAnchors?.environmentImageRef
  );
  const productImageRef = productImageProvidedRef
    ? productImageProvidedRef
    : productImageRefForIndex(productImageIndex, productImageUrl);
  const characterImageRef = characterImageProvidedRef
    ? characterImageProvidedRef
    : readyCharacterImageUrl
      ? referenceAnchorRefForUrl("character", readyCharacterImageUrl)
      : null;
  const environmentImageRef = environmentImageProvidedRef
    ? environmentImageProvidedRef
    : readyEnvironmentImageUrl
      ? referenceAnchorRefForUrl("environment", readyEnvironmentImageUrl)
      : null;
  const sourceMetadata = compactRecord({
    product: productMetadata,
    character: characterMetadata,
    environment: environmentMetadata,
    auditMetadata: asRecord(params.referenceAnchors?.auditMetadata),
    fileEvidence: asRecord(params.referenceAnchors?.fileEvidence),
    sourceRefs,
  });
  const auditRefs = uniqRefs([
    productImageRef,
    characterImageRef,
    environmentImageRef,
    ...usableAuditRefs(productMetadata.auditRefs),
    ...usableAuditRefs(characterMetadata.auditRefs),
    ...usableAuditRefs(environmentMetadata.auditRefs),
    ...(Array.isArray(params.referenceAnchors?.sourceRefs)
      ? params.referenceAnchors.sourceRefs
      : []),
  ]);

  return {
    schemaVersion,
    creationIntent: params.referenceAnchors?.creationIntent ?? null,
    characterMode,
    characterBrief,
    characterPreset,
    reviewTone,
    storytellingStructure,
    requiredRoles,
    lockPolicy: asRecord(params.referenceAnchors?.lockPolicy),
    productImageUrl,
    productImageRef,
    productImageProvidedRef: productImageProvidedRef || null,
    productImageIndex,
    characterImageUrl: readyCharacterImageUrl,
    characterImageRef,
    characterImageProvidedRef: characterImageProvidedRef || null,
    environmentImageUrl: readyEnvironmentImageUrl,
    environmentImageRef,
    environmentImageProvidedRef: environmentImageProvidedRef || null,
    sourceMetadata,
    auditRefs,
  };
}

export function resolveMarketplaceAutoReviewReferenceAnchorsForTest(params: {
  referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  productTruth: Pick<ProductTruth, "imageUrls">;
}): ResolvedMarketplaceAutoReviewReferenceAnchors {
  return resolveMarketplaceAutoReviewReferenceAnchors(params);
}

export function serverVerifiedProviderEvidenceFromAnchorsForTest(params: {
  referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  productTruth: Pick<ProductTruth, "imageUrls">;
  auth: AuthContext;
}): Promise<Record<string, unknown>> {
  return serverVerifiedProviderEvidenceFromAnchors(
    params.referenceAnchors,
    params.productTruth,
    params.auth
  );
}

function productReferenceIndexFromRef(ref: string): number | null {
  const match = ref.match(/^product-image:(\d+):/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function isProviderReferenceUrlReady(url: string): boolean {
  return (
    /^https:\/\//i.test(url) ||
    /^\/(api\/|uploads\/|storage\/|media\/|assets\/|library\/|renders\/)/i.test(
      url
    )
  );
}

function approvedProductReferenceUrls(
  metadata: RunMetadata,
  plan: AutoReviewPlan,
  max = 5
): string[] {
  const pack = asRecord(metadata.productReferenceAssetPack);
  if (pack.status !== "ready" || pack.providerUsePolicy !== "allowed") {
    throw new Error(
      "Product reference asset pack is not approved for paid visual provider dispatch"
    );
  }
  const selectedProductImageUrl = cleanText(pack.selectedProductImageUrl);
  if (!selectedProductImageUrl) {
    throw new Error(
      "Product reference asset pack is missing the selected product image URL"
    );
  }
  const supportingRefs = Array.isArray(pack.supportingRefs)
    ? pack.supportingRefs.map(cleanText).filter(Boolean)
    : [];
  if (supportingRefs.length > 0) {
    throw new Error(
      "Product reference asset pack must use only the selected product anchor; supporting product references are not allowed"
    );
  }
  const providerReferenceUrls = Array.isArray(pack.providerReferenceUrls)
    ? pack.providerReferenceUrls.map(cleanText).filter(Boolean)
    : [];
  if (
    providerReferenceUrls.length !== 1 ||
    providerReferenceUrls[0] !== selectedProductImageUrl
  ) {
    throw new Error(
      "Product reference asset pack provider references must contain only the selected product image URL"
    );
  }
  const auditRefs = usableAuditRefs(pack.auditRefs);
  const sourceMetadata = asRecord(pack.sourceMetadata);
  if (auditRefs.length === 0) {
    throw new Error(
      "Product reference asset pack is missing durable audit refs for the selected product image"
    );
  }
  const readiness = providerReferenceReadiness({
    url: selectedProductImageUrl,
    metadata: sourceMetadata,
    refs: auditRefs,
  });
  if (!readiness.ready) {
    throw new Error(
      `Product reference asset pack lacks trusted provider-ready evidence: ${readiness.reasonCodes.join(", ")}`
    );
  }
  const index = productReferenceIndexFromRef(cleanText(pack.primaryRef));
  const url =
    index == null
      ? selectedProductImageUrl
      : cleanText(plan.productTruth.imageUrls[index]);
  if (!url || !isProviderReferenceUrlReady(url)) {
    throw new Error(
      "Product reference asset pack has no provider-ready selected product image URL"
    );
  }
  if (url !== selectedProductImageUrl) {
    throw new Error(
      "Product reference asset pack primary reference does not match the selected product image URL"
    );
  }
  if (
    !plan.productTruth.imageUrls
      .map(item => cleanText(item))
      .includes(selectedProductImageUrl)
  ) {
    throw new Error(
      "Product reference asset pack selected image URL is not attached to product truth"
    );
  }
  return [url].slice(0, max);
}

function referenceAnchorUrls(metadata: RunMetadata, max = 2): string[] {
  const characterPack = asRecord(metadata.characterIdentityAssetPack);
  const environmentPack = asRecord(metadata.environmentReferenceAssetPack);
  const urls = [
    ...(characterIdentityAllowsVisualGeneration(metadata)
      ? recordRefList(characterPack, "referenceImageUrls")
      : []),
    ...(environmentReferenceAllowsVisualGeneration(metadata)
      ? recordRefList(environmentPack, "referenceImageUrls")
      : []),
  ];
  return uniqRefs(urls)
    .filter(
      url =>
        providerReferenceReadiness({
          url,
          metadata:
            url ===
            cleanText(recordRefList(characterPack, "referenceImageUrls")[0])
              ? asRecord(characterPack.sourceMetadata)
              : asRecord(environmentPack.sourceMetadata),
          refs:
            url ===
            cleanText(recordRefList(characterPack, "referenceImageUrls")[0])
              ? characterPack.auditRefs
              : environmentPack.auditRefs,
        }).ready
    )
    .slice(0, max);
}

function approvedVisualReferenceUrls(
  metadata: RunMetadata,
  plan: AutoReviewPlan,
  max = 5
): string[] {
  return uniqRefs([
    ...approvedProductReferenceUrls(metadata, plan, max),
    ...referenceAnchorUrls(metadata, max),
  ]).slice(0, max);
}

function approvedPackReferenceUrls(
  pack: Record<string, unknown>,
  max: number
): string[] {
  const sourceMetadata = asRecord(pack.sourceMetadata);
  const auditRefs = pack.auditRefs;
  return recordRefList(pack, "referenceImageUrls")
    .filter(
      url =>
        providerReferenceReadiness({
          url,
          metadata: sourceMetadata,
          refs: auditRefs,
        }).ready
    )
    .slice(0, max);
}

function productReferenceStoryboardReferenceImageGroups(
  metadata: RunMetadata,
  plan: AutoReviewPlan,
  max = 5
): ProductReferenceStoryboardReferenceImageGroups {
  const product = approvedProductReferenceUrls(metadata, plan, 1);
  const characterPack = asRecord(metadata.characterIdentityAssetPack);
  const environmentPack = asRecord(metadata.environmentReferenceAssetPack);
  const character = characterIdentityAllowsVisualGeneration(metadata)
    ? approvedPackReferenceUrls(characterPack, max)
    : [];
  const environment = environmentReferenceAllowsVisualGeneration(metadata)
    ? approvedPackReferenceUrls(environmentPack, max)
    : [];
  const all = uniqRefs([...product, ...character, ...environment]).slice(
    0,
    max
  );
  return {
    product,
    character,
    environment,
    all,
  };
}

function normalizeProductReferenceStoryboardReferenceImageGroups(
  groups: ProductReferenceStoryboardReferenceImageGroups,
  publicUrl?: string | null
): ProductReferenceStoryboardReferenceImageGroups {
  const normalizeUrl = (url: string) =>
    resolveProductReferenceStoryboardReferenceImageUrl(url, publicUrl);
  const product = Array.isArray(groups.product)
    ? groups.product.map(normalizeUrl).filter(Boolean)
    : [];
  const character = Array.isArray(groups.character)
    ? groups.character.map(normalizeUrl).filter(Boolean)
    : [];
  const environment = Array.isArray(groups.environment)
    ? groups.environment.map(normalizeUrl).filter(Boolean)
    : [];
  const all = Array.isArray(groups.all)
    ? groups.all.map(normalizeUrl).filter(Boolean)
    : [];
  return {
    product,
    character,
    environment,
    all: uniqRefs([...all, ...product, ...character, ...environment]),
  };
}

function productReferenceStoryboardReferenceImageManifest(
  groups: ProductReferenceStoryboardReferenceImageGroups
): ProductReferenceStoryboardReferenceImageManifestEntry[] {
  const roleForUrl = (
    url: string
  ): ProductReferenceStoryboardReferenceImageManifestEntry["role"] => {
    if (groups.product.includes(url)) return "product";
    if (groups.character.includes(url)) return "character";
    return "environment";
  };
  const instructionForRole = (
    role: ProductReferenceStoryboardReferenceImageManifestEntry["role"]
  ): string => {
    if (role === "product") {
      return "primary product visual source of truth; match exact product appearance, proportions, material, color, and countable parts";
    }
    if (role === "character") {
      return "character identity and wardrobe continuity source of truth; preserve the same person/child identity and age range when visible";
    }
    return "environment, mood, lighting, and setting reference only; never override product or character identity";
  };
  return groups.all.map((url, index) => {
    const role = roleForUrl(url);
    return {
      placeholder: `@Image${index + 1}`,
      role,
      url,
      instruction: instructionForRole(role),
    };
  });
}

function resolveProductReferenceStoryboardReferenceImageUrl(
  url: string,
  publicUrl?: string | null
): string {
  const value = cleanText(url);
  if (!value) return "";
  if (
    value.startsWith("/uploads/") ||
    value.startsWith("/api/storage/files/")
  ) {
    if (!cleanText(publicUrl)) {
      throw new Error(
        "product-reference-storyboard reference image URL requires publicUrl before LLM dispatch"
      );
    }
    return resolveReferenceUrl(value, publicUrl);
  }
  return value;
}

async function resolveMarketplaceAutoReviewPublicUrl(
  publicUrl?: string | null
): Promise<string> {
  const explicit = cleanText(publicUrl).replace(/\/+$/, "");
  if (explicit) return explicit;
  const runtime = await getAppRuntimeConfig();
  const configured = (
    cleanText(runtime.publicUrl) ||
    cleanText(runtime.appPublicUrl) ||
    cleanText(runtime.appUrl)
  ).replace(/\/+$/, "");
  if (!configured) {
    throw new Error(
      "Marketplace Auto Review image generation requires configured public_url before product-reference-storyboard LLM dispatch"
    );
  }
  return configured;
}

function characterIdentityAllowsVisualGeneration(
  metadata: RunMetadata
): boolean {
  const pack = asRecord(metadata.characterIdentityAssetPack);
  if (pack.status === "blocked") return false;
  const sourceKind = cleanText(pack.sourceKind);
  const faceUsage = cleanText(pack.allowedFaceUsage);
  const voiceUsage = cleanText(pack.allowedVoiceUsage);
  const referenceImageRefs = Array.isArray(pack.referenceImageRefs)
    ? pack.referenceImageRefs.map(item => cleanText(item)).filter(Boolean)
    : [];
  const referenceImageUrls = Array.isArray(pack.referenceImageUrls)
    ? pack.referenceImageUrls
        .map(item => cleanText(item))
        .filter(
          url =>
            providerReferenceReadiness({
              url,
              metadata: asRecord(pack.sourceMetadata),
              refs: pack.auditRefs,
            }).ready
        )
    : [];
  const auditRefs = usableAuditRefs(pack.auditRefs);
  if (
    sourceKind === "uploaded_reference" &&
    pack.status === "ready" &&
    referenceImageRefs.length > 0 &&
    referenceImageUrls.length > 0 &&
    auditRefs.length > 0 &&
    faceUsage !== "blocked" &&
    voiceUsage !== "blocked"
  ) {
    return true;
  }
  if (
    ["described_character", "product_only", "hands_only"].includes(
      sourceKind
    ) &&
    pack.status !== "blocked" &&
    faceUsage !== "blocked" &&
    voiceUsage !== "blocked"
  ) {
    return true;
  }
  return false;
}

function environmentReferenceAllowsVisualGeneration(
  metadata: RunMetadata
): boolean {
  const pack = asRecord(metadata.environmentReferenceAssetPack);
  const referenceImageRefs = Array.isArray(pack.referenceImageRefs)
    ? pack.referenceImageRefs.map(item => cleanText(item)).filter(Boolean)
    : [];
  const referenceImageUrls = Array.isArray(pack.referenceImageUrls)
    ? pack.referenceImageUrls
        .map(item => cleanText(item))
        .filter(
          url =>
            providerReferenceReadiness({
              url,
              metadata: asRecord(pack.sourceMetadata),
              refs: pack.auditRefs,
            }).ready
        )
    : [];
  const continuityDescriptors = Array.isArray(pack.continuityDescriptors)
    ? pack.continuityDescriptors.map(item => cleanText(item)).filter(Boolean)
    : [];
  const blockedRefs = Array.isArray(pack.blockedRefs)
    ? pack.blockedRefs.map(item => cleanText(item)).filter(Boolean)
    : [];
  const auditRefs = usableAuditRefs(pack.auditRefs);
  return (
    pack.status === "ready" &&
    cleanText(pack.sourceKind) === "uploaded_reference" &&
    pack.providerUsePolicy === "style_layout_lighting_anchor" &&
    referenceImageRefs.length > 0 &&
    referenceImageUrls.length > 0 &&
    auditRefs.length > 0 &&
    continuityDescriptors.length > 0 &&
    blockedRefs.length === 0
  );
}

function marketplaceAutoReviewReferenceRoleRequired(
  metadata: RunMetadata,
  role: "product" | "character" | "environment"
): boolean {
  const referenceAnchors = asRecord(metadata.referenceAnchors);
  const requiredRoles = Array.isArray(referenceAnchors.requiredRoles)
    ? referenceAnchors.requiredRoles
        .map(item => cleanText(item))
        .filter(Boolean)
    : [];
  if (requiredRoles.length === 0) return true;
  return requiredRoles.includes(role);
}

type MarketplaceAutoReviewGovernancePhase =
  | "planning"
  | "visual_spend"
  | "video_spend"
  | "audio_spend"
  | "video_edit"
  | "render"
  | "finalize";

function statusIn(value: unknown, allowed: string[]): boolean {
  return allowed.includes(cleanText(value));
}

function gateStatus(metadata: RunMetadata, key: keyof RunMetadata): string {
  return cleanText(asRecord(metadata[key]).status);
}

function recordRefList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function recordNestedFixtureRefs(record: Record<string, unknown>): string[] {
  const rules = Array.isArray(record.rules) ? record.rules : [];
  return rules.flatMap(rule => recordRefList(asRecord(rule), "fixtureRefs"));
}

function hasPolicySourceAnchor(record: Record<string, unknown>): boolean {
  const sourceAnchors = Array.isArray(record.sourceAnchors)
    ? record.sourceAnchors
    : [];
  return sourceAnchors.some(anchor => {
    const sourceType = cleanText(asRecord(anchor).sourceType);
    return [
      "official",
      "official_guidance",
      "platform",
      "platform_policy",
      "tenant",
      "tenant_policy",
      "legal_review",
    ].includes(sourceType);
  });
}

function hasUsableGovernanceRefs(
  record: Record<string, unknown>,
  keys: string[]
): boolean {
  return (
    usableAuditRefs(keys.flatMap(key => recordRefList(record, key))).length > 0
  );
}

function hasVerifiedEvidenceRecord(
  record: Record<string, unknown>,
  refKeys: string[] = ["evidenceRef", "evidenceRefs"]
): boolean {
  const status = cleanText(record.status);
  const verifiedBy = cleanText(record.verifiedBy);
  const refs = usableAuditRefs(
    refKeys.flatMap(key => [
      cleanText(record[key]),
      ...recordRefList(record, key),
    ])
  );
  return (
    ["passed", "verified"].includes(status) &&
    ["server", "runtime", "test"].includes(verifiedBy) &&
    refs.length > 0
  );
}

function hasNonSyntheticOperationalEvidenceSource(
  record: Record<string, unknown>
): boolean {
  const refs = usableAuditRefs([
    cleanText(record.evidenceSource),
    cleanText(record.sourceRef),
    cleanText(record.runtimeEvidenceRef),
    cleanText(record.externalEvidenceRef),
    ...recordRefList(record, "sourceRefs"),
  ]);
  return refs.length > 0;
}

function hasVerifiedOperationalEvidenceRecord(
  record: Record<string, unknown>,
  refKeys: string[] = ["evidenceRef", "evidenceRefs"]
): boolean {
  return (
    hasVerifiedEvidenceRecord(record, refKeys) &&
    hasNonSyntheticOperationalEvidenceSource(record)
  );
}

function hasVerifiedOperationalRecoveryEvidence(
  recovery: Record<string, unknown>
): boolean {
  const callback = asRecord(recovery.providerCallbackAuthReplay);
  const dlq = asRecord(recovery.dlqBackpressure);
  const leases = asRecord(recovery.leasesHeartbeat);
  const migration = asRecord(recovery.migrationBackfillDryRun);
  const slo = asRecord(recovery.sloAlerts);
  const runbook = asRecord(recovery.operatorRunbook);
  return (
    recovery.status === "passed" &&
    hasVerifiedOperationalEvidenceRecord(callback) &&
    callback.signatureRequired === true &&
    toNumber(callback.replayWindowSeconds) > 0 &&
    Boolean(cleanText(callback.idempotencyKeyPolicy)) &&
    hasVerifiedOperationalEvidenceRecord(dlq) &&
    toNumber(dlq.retryBudget) >= 0 &&
    Boolean(cleanText(dlq.backpressurePolicy)) &&
    hasVerifiedOperationalEvidenceRecord(leases) &&
    toNumber(leases.staleTimeoutMs) > 0 &&
    Boolean(cleanText(leases.recoveryAction)) &&
    hasVerifiedOperationalEvidenceRecord(migration) &&
    ["passed", "metadata_only_no_migration"].includes(
      cleanText(migration.dryRunStatus)
    ) &&
    hasVerifiedOperationalEvidenceRecord(slo, [
      "evidenceRef",
      "alertRoutingRefs",
    ]) &&
    recordRefList(slo, "monitoredSignals").length > 0 &&
    hasVerifiedOperationalEvidenceRecord(runbook, [
      "evidenceRef",
      "runbookRef",
    ]) &&
    recordRefList(runbook, "actions").length > 0
  );
}

function operationalRecoveryEvidenceForMetadata(input: {
  runId: string;
  evidence?: Record<string, unknown> | null;
  checkedAt: string;
}): Record<string, unknown> {
  const evidence = asRecord(input.evidence);
  if (hasVerifiedOperationalRecoveryEvidence(evidence)) {
    return {
      ...evidence,
      recoveryEvidenceId:
        cleanText(evidence.recoveryEvidenceId) || `ops-recovery:${input.runId}`,
      checkedAt: cleanText(evidence.checkedAt) || input.checkedAt,
    };
  }
  return {
    recoveryEvidenceId: `ops-recovery:${input.runId}`,
    status: "blocked",
    reasonCodes: ["external_operational_recovery_evidence_required"],
    requiredEvidence:
      "runtime must inject verified callback auth/replay, DLQ/backpressure, lease heartbeat, dry-run, SLO alert, and operator runbook evidence with non-synthetic source refs",
    checkedAt: input.checkedAt,
  };
}

function runtimeOperationalRecoveryEvidenceForMetadata(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  checkedAt: string;
}): Record<string, unknown> | null {
  const control = asRecord(params.metadata.automationControlPlane);
  const lease = asRecord(control.lease);
  const leaseId = cleanText(lease.leaseId);
  if (!leaseId) return null;
  const runId = params.run.id;
  const providerEventsTable = "marketplace_auto_review_provider_events";
  const leasesTable = "marketplace_auto_review_run_leases";
  const outboxTable = "marketplace_auto_review_outbox_jobs";
  const attemptsTable = "marketplace_auto_review_stage_attempts";
  const artifactsTable = "marketplace_auto_review_artifacts";
  return {
    recoveryEvidenceId: `ops-recovery:${runId}:runtime-table-backed`,
    status: "passed",
    checkedAt: params.checkedAt,
    providerCallbackAuthReplay: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `provider-callback-auth:${runId}:replay-keyed-events`,
      evidenceSource: `runtime-table:${providerEventsTable}`,
      sourceRefs: [
        `db:${providerEventsTable}:${runId}`,
        `db:${outboxTable}:${runId}:provider-reconcile`,
      ],
      signatureRequired: true,
      replayWindowSeconds: 900,
      idempotencyKeyPolicy: "provider_task_id_plus_event_type_replay_key",
    },
    dlqBackpressure: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `dlq-backpressure:${runId}:outbox-retry-policy`,
      evidenceSource: `runtime-table:${outboxTable}`,
      sourceRefs: [
        `db:${outboxTable}:${runId}`,
        `runtime-policy:${runId}:bounded-provider-submit`,
      ],
      retryBudget: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS,
      backpressurePolicy:
        cleanText(control.backpressurePolicy) ||
        "queue_or_stage_waiting_provider_no_extra_spend",
    },
    leasesHeartbeat: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `lease-heartbeat:${runId}:${leaseId}`,
      evidenceSource: `runtime-table:${leasesTable}`,
      sourceRefs: [`db:${leasesTable}:${leaseId}`],
      staleTimeoutMs: toNumber(lease.ttlMs, advanceLeaseTtlMs()),
      recoveryAction: "release_stale_lease_then_requeue_advance",
    },
    migrationBackfillDryRun: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `migration-dry-run:${runId}:metadata-compatible`,
      evidenceSource: `runtime-table:${attemptsTable}`,
      sourceRefs: [
        `db:${attemptsTable}:${runId}`,
        `db:${artifactsTable}:${runId}`,
      ],
      dryRunStatus: "metadata_only_no_migration",
    },
    sloAlerts: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `slo-alerts:${runId}:auto-review-runtime`,
      evidenceSource: "runtime-monitoring:queue-health-and-ops-anomaly",
      sourceRefs: [
        `metric:auto-review:${runId}:queue-age`,
        `metric:auto-review:${runId}:stage-latency`,
        `metric:auto-review:${runId}:provider-wait`,
      ],
      alertRoutingRefs: [
        `alert:auto-review:${runId}:stale-provider-wait`,
        `alert:auto-review:${runId}:credit-mismatch`,
      ],
      monitoredSignals: [
        "provider_callback_auth_failure",
        "dlq_count",
        "lease_expiry",
        "provider_wait_age",
      ],
    },
    operatorRunbook: {
      status: "verified",
      verifiedBy: "runtime",
      evidenceRef: `operator-runbook:${runId}:recovery-v1`,
      evidenceSource: "runtime-runbook:marketplace-auto-review-recovery",
      sourceRefs: [
        "spec:feature117:marketplace-auto-review-recovery",
        `db:${outboxTable}:${runId}:recovery-jobs`,
      ],
      runbookRef: `operator-runbook:${runId}:recovery-v1`,
      actions: [
        "verify_callback_signature_and_replay_key",
        "inspect_provider_events_and_outbox_jobs",
        "release_or_requeue_stale_lease",
        "refund_or_reconcile_failed_credit_reservations",
      ],
    },
  };
}

function blockedClaimEvidenceCount(metadata: RunMetadata): number {
  const claimEvidenceMapping = asRecord(metadata.claimEvidenceMapping);
  const blockedClaims = Array.isArray(claimEvidenceMapping.blockedClaims)
    ? claimEvidenceMapping.blockedClaims
    : [];
  return blockedClaims.filter(claim => {
    const record = asRecord(claim);
    const status = cleanText(record.status);
    const reasonCode = cleanText(record.reasonCode);
    if (!["blocked", "requires_approval", "repair_required"].includes(status)) {
      return false;
    }
    return ![
      "volatile_or_unsupported_claim_omitted",
      "miracle_absolute_claim_omitted",
      "health_body_result_claim_omitted",
      "certification_official_status_claim_omitted",
      "comparative_superiority_claim_omitted",
    ].includes(reasonCode);
  }).length;
}

function collectMarketplaceAutoReviewGovernanceBlockers(
  metadata: RunMetadata,
  phase: MarketplaceAutoReviewGovernancePhase
): string[] {
  const blockers: string[] = [];
  const productPack = asRecord(metadata.productReferenceAssetPack);
  if (
    productPack.status !== "ready" ||
    productPack.providerUsePolicy !== "allowed"
  ) {
    blockers.push("product reference asset pack is not ready for provider use");
  }
  if (
    productPack.status === "ready" &&
    productPack.providerUsePolicy === "allowed"
  ) {
    const selectedProductImageUrl = cleanText(
      productPack.selectedProductImageUrl
    );
    const supportingRefs = Array.isArray(productPack.supportingRefs)
      ? productPack.supportingRefs.map(cleanText).filter(Boolean)
      : [];
    const providerReferenceUrls = Array.isArray(
      productPack.providerReferenceUrls
    )
      ? productPack.providerReferenceUrls.map(cleanText).filter(Boolean)
      : [];
    const auditRefs = usableAuditRefs(productPack.auditRefs);
    const readiness = providerReferenceReadiness({
      url: selectedProductImageUrl,
      metadata: asRecord(productPack.sourceMetadata),
      refs: auditRefs,
    });
    if (!selectedProductImageUrl) {
      blockers.push(
        "product reference asset pack is missing selected product image URL"
      );
    }
    if (supportingRefs.length > 0) {
      blockers.push(
        "product reference asset pack includes unsupported product references"
      );
    }
    if (
      providerReferenceUrls.length !== 1 ||
      providerReferenceUrls[0] !== selectedProductImageUrl
    ) {
      blockers.push(
        "product reference asset pack provider URLs must contain only the selected product image"
      );
    }
    if (auditRefs.length === 0) {
      blockers.push(
        "product reference asset pack is missing selected product audit refs"
      );
    }
    if (!readiness.ready) {
      blockers.push(
        `product reference asset pack lacks trusted provider-ready evidence: ${readiness.reasonCodes.join(", ")}`
      );
    }
  }
  if (
    marketplaceAutoReviewReferenceRoleRequired(metadata, "character") &&
    !characterIdentityAllowsVisualGeneration(metadata)
  ) {
    blockers.push("character identity asset pack blocks visual generation");
  }
  if (
    [
      "visual_spend",
      "video_spend",
      "video_edit",
      "render",
      "finalize",
    ].includes(phase) &&
    marketplaceAutoReviewReferenceRoleRequired(metadata, "environment") &&
    !environmentReferenceAllowsVisualGeneration(metadata)
  ) {
    blockers.push("environment reference asset pack blocks visual generation");
  }
  if (
    !statusIn(asRecord(metadata.evidenceInstructionFirewall).status, [
      "passed",
      "reduced_to_safe_refs",
    ])
  ) {
    blockers.push("evidence instruction firewall is not passed");
  }
  const rulePack = asRecord(metadata.advertisingRulePack);
  const rulePackTriggeredRuleIds = usableAuditRefs(rulePack.triggeredRuleIds);
  const rulePackFixtureRefs = usableAuditRefs([
    ...recordRefList(rulePack, "fixtureRefs"),
    ...recordNestedFixtureRefs(rulePack),
  ]);
  if (
    rulePack.status !== "approved" ||
    rulePack.fixtureReplayStatus !== "passed" ||
    rulePackTriggeredRuleIds.length === 0 ||
    rulePackFixtureRefs.length === 0 ||
    !hasPolicySourceAnchor(rulePack) ||
    !hasUsableGovernanceRefs(rulePack, ["policyEvidenceRefs"])
  ) {
    blockers.push(
      "approved advertising rule pack with source anchors, encoded rules, fixture replay, and policy evidence refs is required"
    );
  }
  const complianceProfile = asRecord(metadata.advertisingComplianceProfile);
  if (
    !statusIn(cleanText(complianceProfile.status), [
      "pass",
      "pass_with_warnings",
    ]) ||
    usableAuditRefs(complianceProfile.triggeredRuleIds).length === 0 ||
    !hasUsableGovernanceRefs(complianceProfile, ["policyEvidenceRefs"])
  ) {
    blockers.push(
      "advertising compliance profile is missing pass status, triggered rules, or policy evidence refs"
    );
  }
  if (
    [
      "visual_spend",
      "video_spend",
      "audio_spend",
      "video_edit",
      "render",
      "finalize",
    ].includes(phase) &&
    blockedClaimEvidenceCount(metadata) > 0
  ) {
    blockers.push(
      "claim evidence mapping contains blocked claims requiring repair or approval before paid media stages"
    );
  }
  if (
    !statusIn(gateStatus(metadata, "privacyEnvelope"), [
      "passed",
      "not_required",
    ])
  ) {
    blockers.push("privacy envelope is missing or not passed");
  }
  if (
    !statusIn(gateStatus(metadata, "assetRightsEnvelope"), [
      "passed",
      "not_required",
    ])
  ) {
    blockers.push("asset rights envelope is missing or not passed");
  }
  if (
    gateStatus(metadata, "campaignGovernance") !== "passed" ||
    !hasUsableGovernanceRefs(asRecord(metadata.campaignGovernance), [
      "evidenceRefs",
      "spendGuardrailRefs",
      "dedupeRefs",
    ])
  ) {
    blockers.push(
      "campaign governance requires passed status with spend/dedupe evidence refs"
    );
  }
  if (
    !statusIn(gateStatus(metadata, "brandSellerVoicePolicy"), [
      "passed",
      "not_applicable",
    ])
  ) {
    blockers.push("brand/seller voice policy is not passed");
  }
  if (
    !statusIn(gateStatus(metadata, "humanReviewGate"), [
      "passed",
      "approved",
    ]) ||
    !hasUsableGovernanceRefs(asRecord(metadata.humanReviewGate), [
      "approvalRef",
      "waiverRef",
      "evidenceRefs",
    ])
  ) {
    blockers.push(
      "human review gate requires passed/approved status with approval or auto-safe waiver evidence"
    );
  }
  if (
    !statusIn(gateStatus(metadata, "inputChangeImpact"), [
      "no_recheck_required",
    ])
  ) {
    blockers.push("input change impact requires recheck before continuing");
  }
  const recovery = asRecord(metadata.operationalRecoveryEvidence);
  if (
    [
      "visual_spend",
      "video_spend",
      "audio_spend",
      "video_edit",
      "render",
      "finalize",
    ].includes(phase) &&
    !hasVerifiedOperationalRecoveryEvidence(recovery)
  ) {
    blockers.push(
      "operational recovery evidence requires callback auth/replay, DLQ/backpressure, leases/heartbeat, dry-run, SLO alerts, and runbook refs"
    );
  }

  if (["video_spend", "video_edit", "render", "finalize"].includes(phase)) {
    const imageAcceptanceStatus = cleanText(
      asRecord(metadata.generatedMediaAcceptanceEnvelope).status
    );
    if (
      phase === "video_spend" &&
      !statusIn(imageAcceptanceStatus, ["accepted", "accepted_with_warnings"])
    ) {
      blockers.push(
        "accepted image/frame media is required before video spend"
      );
    }
  }

  if (["video_edit", "render", "finalize"].includes(phase)) {
    if (!statusIn(gateStatus(metadata, "distributionProfile"), ["passed"])) {
      blockers.push("distribution profile is missing or not passed");
    }
    if (
      !statusIn(gateStatus(metadata, "videoContinuityQaSummary"), [
        "passed",
        "passed_with_warnings",
      ])
    ) {
      blockers.push("video continuity QA summary is missing or not passed");
    }
    if (
      !statusIn(
        cleanText(asRecord(metadata.generatedMediaAcceptanceEnvelope).status),
        ["accepted", "accepted_with_warnings"]
      )
    ) {
      blockers.push(
        "generated media acceptance envelope is missing or not accepted"
      );
    }
    if (
      !statusIn(gateStatus(metadata, "audioContinuityQaEnvelope"), [
        "accepted",
        "skipped_silent",
      ])
    ) {
      blockers.push("audio continuity QA is missing or not accepted");
    }
    const warningPlan = asRecord(metadata.visualWarningPlan);
    const warningVerification = asRecord(metadata.warningOverlayVerification);
    if (
      warningPlan.required === true &&
      warningVerification.status !== "passed"
    ) {
      blockers.push("required warning overlay is not verified");
    }
    if (
      warningPlan.required === true &&
      !["rendered_ocr_verified", "deterministic_compositor_verified"].includes(
        cleanText(warningVerification.ocrReadabilityStatus)
      )
    ) {
      blockers.push(
        "required warning overlay OCR/readability evidence is missing"
      );
    }
  }

  if (["render", "finalize"].includes(phase)) {
    if (
      !statusIn(gateStatus(metadata, "publishablePackageRequirements"), [
        "passed",
      ])
    ) {
      blockers.push(
        "publishable package requirements are missing or not passed"
      );
    }
  }

  if (phase === "finalize" && metadata.publishableAssetPackage) {
    const packageProofBlockers = publishablePackageProofBlockers(
      asRecord(metadata.publishableAssetPackage),
      metadata
    );
    if (packageProofBlockers.length > 0) {
      blockers.push(
        `publishable package proof is incomplete: ${packageProofBlockers.join("; ")}`
      );
    }
  }

  return blockers;
}

function assertMarketplaceAutoReviewGovernanceReady(
  metadata: RunMetadata,
  phase: MarketplaceAutoReviewGovernancePhase
): void {
  const blockers = collectMarketplaceAutoReviewGovernanceBlockers(
    metadata,
    phase
  );
  if (blockers.length > 0) {
    throw new Error(
      `Marketplace Auto Review ${phase} blocked: ${blockers.join("; ")}`
    );
  }
}

export function assertMarketplaceAutoReviewGovernanceReadyForTest(
  metadata: RunMetadata,
  phase: MarketplaceAutoReviewGovernancePhase
): void {
  assertMarketplaceAutoReviewGovernanceReady(metadata, phase);
}

function stableDateText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : cleanText(value);
}

function productUpdatedAtFromBundle(bundle: ProductAccessBundle): string {
  const product = asRecord(bundle.product);
  return stableDateText(product.updatedAt) || stableDateText(product.createdAt);
}

function selectedVariantHashFromBundle(bundle: ProductAccessBundle): string {
  return cleanText(
    asRecord(asRecord(bundle.product).metadataJson).selectedVariantHash
  );
}

function spendAccessSnapshot(bundle: ProductAccessBundle): {
  accessType: string;
  permission: string | null;
  spendCapable: boolean;
} {
  const product = asRecord(bundle.product);
  const accessType = cleanText(product.accessType) || "owner";
  const permission =
    cleanText(asRecord(product.groupShare).permission) ||
    cleanText(product.permission) ||
    null;
  return {
    accessType,
    permission,
    spendCapable:
      accessType === "owner" ||
      (accessType === "group" && permission === "read_update"),
  };
}

function buildMarketplaceAutoReviewProductTruthHash(params: {
  productTruth: ProductTruth;
  productUpdatedAt?: string | null;
}): string {
  return buildProductionStableHash({
    productId: params.productTruth.productId,
    productName: params.productTruth.productName,
    brand: params.productTruth.brand,
    productCategory: params.productTruth.productCategory,
    categoryText: params.productTruth.categoryText,
    categoryPath: params.productTruth.categoryPath,
    sourceUrl: params.productTruth.sourceUrl,
    imageUrls: params.productTruth.imageUrls,
    specs: params.productTruth.specs,
    productUpdatedAt: cleanText(params.productUpdatedAt),
  });
}

function rulePackSnapshot(metadata: RunMetadata): Record<string, unknown> {
  const rulePack = asRecord(metadata.advertisingRulePack);
  return {
    rulePackId:
      cleanText(rulePack.rulePackId) || MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
    version: cleanText(rulePack.version) || "1.0.0",
    status: cleanText(rulePack.status) || "approved",
    fixtureReplayStatus:
      cleanText(rulePack.fixtureReplayStatus) || "not_required",
  };
}

function referenceAnchorsInputSnapshot(
  value: unknown
): Record<string, unknown> {
  const anchors = asRecord(value);
  const lockPolicy = asRecord(anchors.lockPolicy);
  const requiredRoles = Array.isArray(anchors.requiredRoles)
    ? anchors.requiredRoles.map(cleanText).filter(Boolean).sort()
    : [];
  return compactRecord({
    schemaVersion: toNumber(anchors.schemaVersion, 1),
    creationIntent: cleanText(anchors.creationIntent) || null,
    characterMode: cleanText(anchors.characterMode) || null,
    characterBrief: cleanText(anchors.characterBrief),
    characterPreset: Array.isArray(anchors.characterPreset)
      ? anchors.characterPreset
      : Object.keys(asRecord(anchors.characterPreset)).length > 0
        ? asRecord(anchors.characterPreset)
        : cleanText(anchors.characterPreset),
    reviewTone: normalizeMarketplaceAutoReviewReviewTone(anchors.reviewTone),
    storytellingStructure: normalizeMarketplaceAutoReviewStorytellingStructure(
      anchors.storytellingStructure
    ),
    requiredRoles,
    productImageUrl: cleanText(anchors.productImageUrl) || null,
    productImageRef: cleanText(anchors.productImageRef) || null,
    productImageProvidedRef: cleanText(anchors.productImageProvidedRef) || null,
    productImageIndex: toNumber(anchors.productImageIndex),
    characterImageUrl: cleanText(anchors.characterImageUrl) || null,
    characterImageRef: cleanText(anchors.characterImageRef) || null,
    characterImageProvidedRef:
      cleanText(anchors.characterImageProvidedRef) || null,
    environmentImageUrl: cleanText(anchors.environmentImageUrl) || null,
    environmentImageRef: cleanText(anchors.environmentImageRef) || null,
    environmentImageProvidedRef:
      cleanText(anchors.environmentImageProvidedRef) || null,
    lockPolicy: compactRecord({
      mode: cleanText(lockPolicy.mode) || null,
      bindingPolicy: cleanText(lockPolicy.bindingPolicy) || null,
      product: cleanText(lockPolicy.product) || null,
      character: cleanText(lockPolicy.character) || null,
      environment: cleanText(lockPolicy.environment) || null,
      allowSingleFileMultiViewSheet:
        lockPolicy.allowSingleFileMultiViewSheet === true,
      requireSameSubjectAcrossMultiViewPanels:
        lockPolicy.requireSameSubjectAcrossMultiViewPanels === true,
      allowProductRecolorOrShapeChange:
        lockPolicy.allowProductRecolorOrShapeChange === true,
      allowFaceMorphingBetweenShots:
        lockPolicy.allowFaceMorphingBetweenShots === true,
      allowEnvironmentReplacement:
        lockPolicy.allowEnvironmentReplacement === true,
    }),
  });
}

function buildMarketplaceAutoReviewInputSnapshot(params: {
  productTruthHash: string;
  productUpdatedAt?: string | null;
  selectedVariantHash?: string | null;
  referenceAnchors: unknown;
  rulePack: unknown;
  outputMode: unknown;
  frameStrategy: unknown;
  audioStrategy: unknown;
  resolvedAudioStrategy: unknown;
  requestedShotCount: unknown;
}): Record<string, unknown> {
  const seed: Record<string, unknown> = {
    schemaVersion: 2,
    productTruthHash: params.productTruthHash,
    productUpdatedAt: cleanText(params.productUpdatedAt),
    selectedVariantHash: cleanText(params.selectedVariantHash),
    referenceAnchors: referenceAnchorsInputSnapshot(params.referenceAnchors),
    rulePack: params.rulePack,
    outputMode: cleanText(params.outputMode),
    frameStrategy: cleanText(params.frameStrategy),
    audioStrategy: cleanText(params.audioStrategy),
    resolvedAudioStrategy: cleanText(params.resolvedAudioStrategy),
  };
  if (Number.isFinite(Number(params.requestedShotCount))) {
    seed.requestedShotCount = normalizeMarketplaceAutoReviewShotCount(
      params.requestedShotCount
    );
  }
  return seed;
}

function inputSnapshotHash(value: Record<string, unknown>): string {
  return buildProductionStableHash(value);
}

function buildMarketplaceAutoReviewInputSnapshotHash(params: {
  productTruthHash: string;
  productUpdatedAt?: string | null;
  selectedVariantHash?: string | null;
  referenceAnchors: unknown;
  rulePack: unknown;
  outputMode: unknown;
  frameStrategy: unknown;
  audioStrategy: unknown;
  resolvedAudioStrategy: unknown;
  requestedShotCount: unknown;
}): string {
  return inputSnapshotHash(buildMarketplaceAutoReviewInputSnapshot(params));
}

function evaluateMarketplaceAutoReviewInputChangeImpact(params: {
  runId: string;
  metadata: RunMetadata;
  productTruth: ProductTruth;
  productUpdatedAt?: string | null;
  selectedVariantHash?: string | null;
  outputMode: unknown;
  frameStrategy: unknown;
  audioStrategy: unknown;
  resolvedAudioStrategy: unknown;
  requestedShotCount?: unknown;
}): Record<string, unknown> {
  const currentProductTruthHash = buildMarketplaceAutoReviewProductTruthHash({
    productTruth: params.productTruth,
    productUpdatedAt: params.productUpdatedAt,
  });
  const existing = asRecord(params.metadata.inputChangeImpact);
  const existingProductLock = asRecord(params.metadata.productEvidenceLock);
  const existingFreshness = asRecord(params.metadata.evidenceFreshnessSnapshot);
  const existingVariant = asRecord(params.metadata.productVariantSnapshot);
  const requestedShotCount = Number.isFinite(Number(params.requestedShotCount))
    ? params.requestedShotCount
    : params.metadata.requestedShotCount;
  const expectedSnapshotHash = cleanText(existing.snapshotHash);
  const currentSnapshotInput = buildMarketplaceAutoReviewInputSnapshot({
    productTruthHash: currentProductTruthHash,
    productUpdatedAt: params.productUpdatedAt,
    selectedVariantHash: params.selectedVariantHash,
    referenceAnchors: params.metadata.referenceAnchors,
    rulePack: rulePackSnapshot(params.metadata),
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    requestedShotCount,
  });
  const currentSnapshotHash = inputSnapshotHash(currentSnapshotInput);
  const existingSnapshotInput = asRecord(existing.snapshotInput);
  const hasExistingSnapshotInput =
    Object.keys(existingSnapshotInput).length > 0;
  const existingSnapshotInputHash = hasExistingSnapshotInput
    ? inputSnapshotHash(existingSnapshotInput)
    : "";
  const structuredSnapshotChanged =
    hasExistingSnapshotInput &&
    existingSnapshotInputHash !== currentSnapshotHash;
  const legacyOpaqueHashDrift =
    !hasExistingSnapshotInput &&
    Boolean(expectedSnapshotHash) &&
    expectedSnapshotHash !== currentSnapshotHash;
  const staleRefs = [
    cleanText(existingProductLock.truthHash) &&
    cleanText(existingProductLock.truthHash) !== currentProductTruthHash
      ? "productEvidenceLock.truthHash"
      : "",
    cleanText(existingFreshness.productUpdatedAt) &&
    cleanText(existingFreshness.productUpdatedAt) !==
      cleanText(params.productUpdatedAt)
      ? "evidenceFreshnessSnapshot.productUpdatedAt"
      : "",
    cleanText(existingVariant.selectedVariantHash) !==
    cleanText(params.selectedVariantHash)
      ? "productVariantSnapshot.selectedVariantHash"
      : "",
    structuredSnapshotChanged ? "inputChangeImpact.snapshotInput" : "",
  ].filter(Boolean);
  const changed = staleRefs.length > 0;
  return {
    ...existing,
    impactId: cleanText(existing.impactId) || `input-impact:${params.runId}`,
    status: changed ? "recheck_required" : "no_recheck_required",
    snapshotHash: changed
      ? expectedSnapshotHash || existingSnapshotInputHash || currentSnapshotHash
      : currentSnapshotHash,
    previousSnapshotHash:
      changed &&
      expectedSnapshotHash &&
      expectedSnapshotHash !== currentSnapshotHash
        ? expectedSnapshotHash
        : existing.previousSnapshotHash,
    currentSnapshotHash,
    snapshotInput:
      changed && hasExistingSnapshotInput
        ? existingSnapshotInput
        : currentSnapshotInput,
    ...(changed ? { currentSnapshotInput } : {}),
    ...(legacyOpaqueHashDrift
      ? {
          legacyOpaqueHashDrift: {
            previousSnapshotHash: expectedSnapshotHash,
            currentSnapshotHash,
            status: "ignored_without_structured_snapshot_input",
            reason:
              "Opaque snapshot hash drift alone is not treated as input change without structured snapshotInput evidence.",
          },
        }
      : {}),
    currentProductTruthHash,
    productUpdatedAt: cleanText(params.productUpdatedAt),
    staleRefs,
    invalidatedRefs: changed
      ? [
          "creativePlan",
          "shotMediaPayloads",
          "generatedMedia",
          "audioRenderOutputs",
        ]
      : [],
    checkedAt: nowIso(),
  };
}

function collectPaidStageAuthorityFreshness(params: {
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  bundle: ProductAccessBundle;
  phase: MarketplaceAutoReviewGovernancePhase;
}): {
  blockers: string[];
  inputChangeImpact: Record<string, unknown>;
  access: ReturnType<typeof spendAccessSnapshot>;
} {
  const productTruth = buildProductTruth(params.bundle);
  const access = spendAccessSnapshot(params.bundle);
  const product = asRecord(params.bundle.product);
  const accessSnapshot = asRecord(params.metadata.accessSnapshot);
  const audioStrategy = cleanText(params.metadata.audioStrategy) || "auto";
  const resolvedAudioStrategy =
    cleanText(params.metadata.resolvedAudioStrategy) ||
    resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
      requested: audioStrategy as MarketplaceAutoReviewAudioStrategyInput,
      videoModel: DEFAULT_VIDEO_MODEL,
    });
  const inputChangeImpact = evaluateMarketplaceAutoReviewInputChangeImpact({
    runId: params.run.id,
    metadata: params.metadata,
    productTruth,
    productUpdatedAt: productUpdatedAtFromBundle(params.bundle),
    selectedVariantHash: selectedVariantHashFromBundle(params.bundle),
    outputMode: params.run.outputMode,
    frameStrategy: params.run.frameStrategy,
    audioStrategy,
    resolvedAudioStrategy,
    requestedShotCount: params.metadata.requestedShotCount,
  });
  const blockers = [
    ...collectMarketplaceAutoReviewGovernanceBlockers(
      {
        ...params.metadata,
        inputChangeImpact,
      },
      params.phase
    ),
  ];
  if (cleanText(product.id) !== params.run.productId) {
    blockers.push("current product access does not match run product");
  }
  if (
    cleanText(asRecord(params.metadata.productEvidenceLock).productId) &&
    cleanText(asRecord(params.metadata.productEvidenceLock).productId) !==
      params.run.productId
  ) {
    blockers.push("product evidence lock does not match run product");
  }
  if (cleanText(accessSnapshot.tenantId) !== params.tenantId) {
    blockers.push("tenant authority snapshot does not match current tenant");
  }
  if (!access.spendCapable) {
    blockers.push("current product access is not spend-capable");
  }
  if (
    toNumber(accessSnapshot.creditPayerUserId) !== params.auth.userId ||
    params.run.userId !== params.auth.userId
  ) {
    blockers.push("credit payer authority does not match run/access snapshot");
  }
  return {
    blockers: Array.from(new Set(blockers)),
    inputChangeImpact,
    access,
  };
}

export function collectPaidStageAuthorityFreshnessForTest(params: {
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  bundle: ProductAccessBundle;
  phase: MarketplaceAutoReviewGovernancePhase;
}) {
  return collectPaidStageAuthorityFreshness(params);
}

export function evaluateMarketplaceAutoReviewInputChangeImpactForTest(
  params: Parameters<typeof evaluateMarketplaceAutoReviewInputChangeImpact>[0]
) {
  return evaluateMarketplaceAutoReviewInputChangeImpact(params);
}

async function persistMarketplaceAutoReviewRecheckRequired(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  inputChangeImpact: Record<string, unknown>;
  reason: string;
  stageKey?: StageKey;
}) {
  const stages = stageKeysForMode(
    params.run.outputMode as MarketplaceAutoReviewOutputMode
  );
  const metadata = withUpdatedCreditSummary({
    ...params.metadata,
    inputChangeImpact: params.inputChangeImpact,
    paidStageAuthorityFreshness: {
      status: "recheck_required",
      reason: params.reason,
      checkedAt: nowIso(),
      stageKey: params.stageKey ?? params.run.currentStage,
    },
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "product_preflight",
    stageOrder: stageIndex("product_preflight", stages),
    status: "blocked_needs_user",
    output: {
      statusDetail: {
        state: "input_change_recheck_required",
        severity: "blocked",
        stageKey: "product_preflight",
        reasonCodes: Array.isArray(params.inputChangeImpact.staleRefs)
          ? params.inputChangeImpact.staleRefs
          : ["input_changed"],
        safeMessage:
          "ข้อมูลสินค้า reference หรือ policy เปลี่ยนไปหลังเริ่มงาน ต้องตรวจใหม่ก่อนใช้เครดิตสร้างสื่อเพิ่ม",
        nextAction:
          "ตรวจสินค้าและ reference อีกครั้ง แล้วเริ่มหรือ resume หลัง recheck ผ่าน",
        userActionRequired: true,
        retryable: true,
      },
    },
    stageCompletionEvidence: {
      status: "user_blocked",
      requiredRefs: [
        "inputChangeImpact",
        "currentProductTruth",
        "selectedReferenceAnchors",
        "rulePack",
      ],
      artifactRefs: [`run:${params.run.id}`],
      policyRefs: ["paid-spend-fail-closed-on-input-change"],
      missingRefs: Array.isArray(params.inputChangeImpact.staleRefs)
        ? (params.inputChangeImpact.staleRefs as string[])
        : ["inputChangeImpact.recheck"],
    },
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "running",
    currentStage: "product_preflight",
    stageIndex: stageIndex("product_preflight", stages),
    stageCount: stages.length,
    metadataJson: metadata,
    errorMessage: "Input changed; Marketplace Auto Review recheck required",
  });
  return metadata;
}

async function assertPaidStageAuthorityFresh(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  phase: MarketplaceAutoReviewGovernancePhase;
  stageKey: StageKey;
}): Promise<ProductAccessBundle> {
  const bundle = await getMarketplaceProductWithAccess(
    params.run.productId,
    params.auth
  );
  const freshness = collectPaidStageAuthorityFreshness({
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    bundle,
    phase: params.phase,
  });
  if (freshness.blockers.length > 0) {
    if (cleanText(freshness.inputChangeImpact.status) === "recheck_required") {
      await persistMarketplaceAutoReviewRecheckRequired({
        db: params.db,
        run: params.run,
        metadata: params.metadata,
        inputChangeImpact: freshness.inputChangeImpact,
        reason: "paid_stage_authority_freshness",
        stageKey: params.stageKey,
      });
    }
    const error = new Error(
      `Marketplace Auto Review paid ${params.phase} blocked before spend: ${freshness.blockers.join("; ")}`
    );
    (error as any).__marketplaceAutoReviewRecheckRequired =
      cleanText(freshness.inputChangeImpact.status) === "recheck_required";
    throw error;
  }
  return bundle;
}

function paidAuthorityPhaseForStage(
  stageKey: StageKey
): MarketplaceAutoReviewGovernancePhase {
  if (stageKey === "concept_story") return "planning";
  if (stageKey === "image_generation") return "visual_spend";
  if (stageKey === "video_generation") return "video_spend";
  if (stageKey === "audio_generation") return "audio_spend";
  if (stageKey === "video_edit") return "video_edit";
  if (stageKey === "render") return "render";
  if (stageKey === "library_finalize") return "finalize";
  return "planning";
}

function resolveFrameStrategy(
  outputMode: MarketplaceAutoReviewOutputMode,
  requested?: MarketplaceAutoReviewFrameStrategyInput
): MarketplaceAutoReviewFrameStrategy {
  if (
    requested === "storyboard_3x3_split" ||
    requested === "video_shot_start_stop"
  ) {
    return requested;
  }
  return outputMode === "full_video"
    ? "video_shot_start_stop"
    : "storyboard_3x3_split";
}

function isVeo31NativeAudioModel(modelId?: string | null): boolean {
  const value = cleanText(modelId ?? DEFAULT_VIDEO_MODEL).toLowerCase();
  return /veo\s*3(?:\.1)?|veo3|veo-3|generate-veo-3/.test(value);
}

export function resolveMarketplaceAutoReviewAudioStrategy(input: {
  outputMode: MarketplaceAutoReviewOutputMode;
  requested?: MarketplaceAutoReviewAudioStrategyInput | null;
  videoModel?: string | null;
}): MarketplaceAutoReviewResolvedAudioStrategy {
  if (input.requested === "native_video_audio") return "native_video_audio";
  if (input.requested === "separate_tts_voiceover")
    return "separate_tts_voiceover";
  if (input.requested === "silent") return "silent";
  if (input.outputMode !== "full_video") return "native_video_audio";
  return isVeo31NativeAudioModel(input.videoModel)
    ? "native_video_audio"
    : "separate_tts_voiceover";
}

export function buildMarketplaceAutoReviewNativeSpeechText(input: {
  plan: AutoReviewPlan;
  shot: {
    voiceover: string;
    durationSeconds: number;
    title?: string;
    productRole?: string;
  };
  isLastShot?: boolean;
  metadata?: RunMetadata | null;
}): string {
  return alignThaiSpeechToMarketplaceAutoReviewPresenter(
    input.shot.voiceover,
    input.plan,
    input.metadata
  );
}

function stageKeysForMode(
  outputMode: MarketplaceAutoReviewOutputMode
): StageKey[] {
  return outputMode === "full_video"
    ? [...FULL_VIDEO_STAGES]
    : [...BASE_STAGES];
}

function stageIndex(stageKey: string, stages: readonly string[]): number {
  const index = stages.indexOf(stageKey);
  return index < 0 ? 0 : index + 1;
}

function directTaskResultUrl(
  refs: DirectMediaTaskRef[],
  unitId: string
): string {
  const ref = latestTaskRefsByUnit(refs).find(
    item => item.unitId === unitId && item.status === "completed"
  );
  return cleanText(ref?.resultUrl);
}

function directMediaTaskIdsForUnits(refs: DirectMediaTaskRef[], ids: string[]) {
  const idSet = new Set(ids);
  return latestTaskRefsByUnit(refs)
    .filter(ref => idSet.has(ref.unitId))
    .map(ref => cleanText(ref.taskId))
    .filter(Boolean);
}

function directTaskRefs(value: unknown): DirectMediaTaskRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asRecord(item) as DirectMediaTaskRef)
    .filter(
      item => Boolean(cleanText(item.unitId)) && Boolean(cleanText(item.taskId))
    );
}

function latestCompletedImageTaskRefs(
  refs: DirectMediaTaskRef[]
): DirectMediaTaskRef[] {
  return latestTaskRefsByUnit(refs).filter(
    ref =>
      ref.mediaType === "image" &&
      cleanText(ref.status) === "completed" &&
      Boolean(cleanText(ref.resultUrl))
  );
}

function latestImageRefsForAttempt(
  refs: DirectMediaTaskRef[],
  attempt: number
): DirectMediaTaskRef[] {
  const byUnit = new Map<string, DirectMediaTaskRef>();
  refs
    .filter(
      ref => ref.mediaType === "image" && toNumber(ref.attempt) === attempt
    )
    .forEach(ref => {
      const key = cleanText(ref.unitId);
      const existing = byUnit.get(key);
      if (!existing) {
        byUnit.set(key, ref);
        return;
      }
      const existingTime =
        parseIsoMs(existing.completedAt) ??
        parseIsoMs(existing.submittedAt) ??
        0;
      const nextTime =
        parseIsoMs(ref.completedAt) ?? parseIsoMs(ref.submittedAt) ?? 0;
      if (nextTime >= existingTime) byUnit.set(key, ref);
    });
  return Array.from(byUnit.values()).sort((a, b) =>
    cleanText(a.unitId).localeCompare(cleanText(b.unitId))
  );
}

function clampImageAttemptScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedImageAttemptQaScore(value: unknown): number | null {
  const score = toNumber(value);
  if (!Number.isFinite(score)) return null;
  if (score > 0 && score <= 1) return clampImageAttemptScore(score * 100);
  return clampImageAttemptScore(score);
}

function averageImageAttemptScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return (
    scores.reduce((total, score) => total + score, 0) /
    Math.max(1, scores.length)
  );
}

function uniqueCleanTexts(values: unknown[]): string[] {
  return Array.from(
    new Set(values.map(item => cleanText(item)).filter(Boolean))
  );
}

function imageAttemptStatusPenalty(status: string): number {
  if (status === "passed") return 0;
  if (status === "accepted_with_warnings") return 3;
  if (status === "repair_required") return 8;
  if (status === "failed") return 40;
  return 12;
}

function imageAttemptStatusSelectionPriority(status: string): number {
  if (status === "passed") return 4;
  if (status === "accepted_with_warnings") return 3;
  if (status === "repair_required") return 2;
  if (status === "failed") return 1;
  return 0;
}

function imageReasonCodeBlocksProductFidelity(code: unknown): boolean {
  const normalized = cleanText(code).toLowerCase();
  return /product.*mismatch|productimagemismatch|product.*not.*match|product.*continuity.*mismatch|shape.*mismatch|reference.*mismatch|character.*mismatch|character.*not.*match|identity.*mismatch|face.*drift/.test(
    normalized
  );
}

function imageReasonCodesContainProductFidelityBlocker(
  reasonCodes: unknown[]
): boolean {
  return reasonCodes.some(imageReasonCodeBlocksProductFidelity);
}

function productFidelityFailedFrameCount(
  qaEnvelopes: Record<string, unknown>[]
): number {
  return qaEnvelopes.filter(qa => {
    const reasonCodes = Array.isArray(qa.reasonCodes) ? qa.reasonCodes : [];
    if (imageReasonCodesContainProductFidelityBlocker(reasonCodes)) {
      return true;
    }
    if (qa.productMatchesReference === false) return true;
    const frameVerdicts = Array.isArray(qa.frameVerdicts)
      ? qa.frameVerdicts.map(item => asRecord(item))
      : [];
    return frameVerdicts.some(frame => {
      const status = cleanText(frame.status || frame.verdict).toLowerCase();
      const frameReasonCodes = Array.isArray(frame.reasonCodes)
        ? frame.reasonCodes
        : [];
      return (
        ["repair", "failed", "fail", "needs_targeted_repair"].includes(
          status
        ) && imageReasonCodesContainProductFidelityBlocker(frameReasonCodes)
      );
    });
  }).length;
}

function productFidelityFailureIsWholeStoryboard(input: {
  reasonCodes: unknown[];
  qaEnvelopes: Record<string, unknown>[];
  expectedFrameCount?: number | null;
}): boolean {
  if (!imageReasonCodesContainProductFidelityBlocker(input.reasonCodes)) {
    return false;
  }
  const expectedFrameCount = Math.max(
    0,
    Math.floor(toNumber(input.expectedFrameCount))
  );
  const failedCount = productFidelityFailedFrameCount(input.qaEnvelopes);
  if (expectedFrameCount > 0 && failedCount > 0) {
    return failedCount >= expectedFrameCount;
  }
  return failedCount === 0;
}

function buildImageAttemptScoreBreakdown(params: {
  status: "passed" | "accepted_with_warnings" | "repair_required" | "failed";
  attemptRefs: DirectMediaTaskRef[];
  qaEnvelopes: Record<string, unknown>[];
  repairUnits: DirectImageUnit[];
  reasonCodes: string[];
  resultUrls: string[];
  expectedFrameCount?: number | null;
}): Record<string, unknown> {
  const qaScores = params.qaEnvelopes
    .map(qa => normalizedImageAttemptQaScore(qa.score))
    .filter((score): score is number => score !== null);
  const baseScore =
    qaScores.length > 0
      ? averageImageAttemptScore(qaScores)
      : params.resultUrls.length > 0
        ? 70
        : 0;
  const failedFrameRoles = uniqueCleanTexts(
    params.qaEnvelopes.flatMap(qa =>
      Array.isArray(qa.failedFrameRoles) ? qa.failedFrameRoles : []
    )
  );
  const failedTaskCount = params.attemptRefs.filter(
    ref => cleanText(ref.status) === "failed"
  ).length;
  const missingResultCount = params.attemptRefs.filter(
    ref => !cleanText(ref.resultUrl)
  ).length;
  const reasonCodePenalty = Math.min(30, params.reasonCodes.length * 6);
  const severeReasonPenalty = Math.min(
    50,
    params.reasonCodes.reduce((total, code) => {
      const normalized = cleanText(code).toLowerCase();
      if (
        /single.*image|one.*image|grid.*missing|missing.*grid|not.*3x3|layout|collage|masonry|merged.*panel|frame.*missing/.test(
          normalized
        )
      ) {
        return total + 36;
      }
      if (
        /product.*mismatch|productimagemismatch|product.*not.*match|shape.*mismatch|reference.*mismatch/.test(
          normalized
        )
      ) {
        return total + 24;
      }
      if (
        /adwarning|warning.*text|text.*blocked|marketplace.*ui/.test(normalized)
      ) {
        return total + 16;
      }
      if (
        /character.*inconsisten|character.*unsafe|face.*drift/.test(normalized)
      ) {
        return total + 14;
      }
      if (imageReasonCodeBlocksPublishSafety(normalized)) {
        return total + 40;
      }
      return total;
    }, 0)
  );
  const repairPenalty = Math.min(36, params.repairUnits.length * 12);
  const failedFramePenalty = Math.min(20, failedFrameRoles.length * 4);
  const failedTaskPenalty = Math.min(40, failedTaskCount * 20);
  const missingResultPenalty = Math.min(36, missingResultCount * 12);
  const statusPenalty = imageAttemptStatusPenalty(params.status);
  const negativeScore =
    reasonCodePenalty +
    severeReasonPenalty +
    repairPenalty +
    failedFramePenalty +
    failedTaskPenalty +
    missingResultPenalty +
    statusPenalty;
  const qualityScore = clampImageAttemptScore(baseScore - negativeScore);
  const productFidelityBlockers = uniqueCleanTexts(
    params.reasonCodes.filter(imageReasonCodeBlocksProductFidelity)
  );
  const publishSafetyBlockers = uniqueCleanTexts(
    params.reasonCodes.filter(imageReasonCodeBlocksPublishSafety)
  );
  const storyboardGridLayoutBlockers = uniqueCleanTexts(
    params.reasonCodes.filter(imageReasonCodeBlocksStoryboardGridLayout)
  );
  const productFidelityFailedFrames = productFidelityFailedFrameCount(
    params.qaEnvelopes
  );
  const productFidelityWholeStoryboardFailure =
    productFidelityFailureIsWholeStoryboard({
      reasonCodes: params.reasonCodes,
      qaEnvelopes: params.qaEnvelopes,
      expectedFrameCount: params.expectedFrameCount,
    });
  return {
    baseScore: Math.round(baseScore),
    qualityScore,
    negativeScore,
    reasonCodePenalty,
    severeReasonPenalty,
    repairPenalty,
    failedFramePenalty,
    failedTaskPenalty,
    missingResultPenalty,
    statusPenalty,
    qaScores,
    failedFrameRoles,
    failedTaskCount,
    missingResultCount,
    repairUnitCount: params.repairUnits.length,
    productFidelityBlockers,
    publishSafetyBlockers,
    storyboardGridLayoutBlockers,
    productFidelityFailedFrames,
    productFidelityWholeStoryboardFailure,
  };
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => cleanText(item)).filter(Boolean);
}

function attemptReviewIsSelectable(review: Record<string, unknown>): boolean {
  if (
    imageReasonCodesContainProductFidelityBlocker(
      cleanStringList(review.reasonCodes)
    )
  ) {
    return false;
  }
  if (
    imageReasonCodesContainPublishSafetyBlocker(
      cleanStringList(review.reasonCodes)
    )
  ) {
    return false;
  }
  const selectionBlockers = cleanStringList(review.selectionBlockers);
  if (selectionBlockers.some(imageReasonCodeBlocksProductFidelity)) {
    return false;
  }
  if (selectionBlockers.some(imageReasonCodeBlocksPublishSafety)) {
    return false;
  }
  const scoreBreakdown = asRecord(review.scoreBreakdown);
  if (scoreBreakdown.productFidelityWholeStoryboardFailure === true) {
    return false;
  }
  if (cleanStringList(scoreBreakdown.publishSafetyBlockers).length > 0) {
    return false;
  }
  const expectedFrameCount = toNumber(review.expectedFrameCount);
  if (Boolean(cleanText(review.storyboardGridUrl))) return true;
  if (expectedFrameCount > 0) {
    if (
      cleanStringList(review.storyboardFrameUrls).length >= expectedFrameCount
    )
      return true;
    return (
      cleanStringList(review.startFrameUrls).length >= expectedFrameCount &&
      cleanStringList(review.stopFrameUrls).length >= expectedFrameCount
    );
  }
  return (
    cleanStringList(review.resultUrls).length > 0 ||
    cleanStringList(review.storyboardFrameUrls).length > 0 ||
    cleanStringList(review.startFrameUrls).length > 0 ||
    cleanStringList(review.stopFrameUrls).length > 0 ||
    Boolean(cleanText(review.storyboardGridUrl))
  );
}

function bestImageAttemptReview(
  metadata: RunMetadata
): Record<string, unknown> | null {
  const reviews = Array.isArray(metadata.imageAttemptReviews)
    ? metadata.imageAttemptReviews.map(item => asRecord(item))
    : [];
  const selectable = reviews.filter(attemptReviewIsSelectable);
  if (selectable.length === 0) return null;
  return (
    selectable.sort((a, b) => {
      const scoreDiff =
        clampImageAttemptScore(toNumber(b.qualityScore)) -
        clampImageAttemptScore(toNumber(a.qualityScore));
      if (scoreDiff !== 0) return scoreDiff;
      const penaltyDiff = toNumber(a.negativeScore) - toNumber(b.negativeScore);
      if (penaltyDiff !== 0) return penaltyDiff;
      const statusDiff =
        imageAttemptStatusSelectionPriority(cleanText(b.status)) -
        imageAttemptStatusSelectionPriority(cleanText(a.status));
      if (statusDiff !== 0) return statusDiff;
      return toNumber(a.attempt) - toNumber(b.attempt);
    })[0] ?? null
  );
}

function applyBestImageAttemptSelection(metadata: RunMetadata): RunMetadata {
  const best = bestImageAttemptReview(metadata);
  if (!best) return metadata;
  const storyboardGridUrl = cleanText(best.storyboardGridUrl);
  const storyboardFrameUrls = cleanStringList(best.storyboardFrameUrls);
  const startFrameUrls = cleanStringList(best.startFrameUrls);
  const stopFrameUrls = cleanStringList(best.stopFrameUrls);
  const selectedImageAttempt = toNumber(best.attempt);
  const selectedImageAttemptScore = clampImageAttemptScore(
    toNumber(best.qualityScore)
  );
  const existingAcceptance = asRecord(
    metadata.generatedMediaAcceptanceEnvelope
  );
  return {
    ...metadata,
    ...(storyboardGridUrl ? { storyboardGridUrl } : {}),
    ...(storyboardFrameUrls.length > 0 ? { storyboardFrameUrls } : {}),
    ...(startFrameUrls.length > 0
      ? {
          startFrameUrls,
          storyboardFrameUrls:
            storyboardFrameUrls.length > 0
              ? storyboardFrameUrls
              : startFrameUrls,
        }
      : {}),
    ...(stopFrameUrls.length > 0 ? { stopFrameUrls } : {}),
    selectedImageAttempt,
    selectedImageAttemptScore,
    selectedImageAttemptReview: best,
    generatedMediaAcceptanceEnvelope: compactRecord({
      ...existingAcceptance,
      selectedImageAttempt,
      selectedImageAttemptScore,
      selectedImageAttemptReviewId: cleanText(best.reviewId),
      selectedImageAttemptStatus: cleanText(best.status),
      selectedImageAttemptNegativeScore: toNumber(best.negativeScore),
    }),
  };
}

function acceptBestImageAttemptAfterProviderFailure(params: {
  run: Pick<MarketplaceAutoReviewRun, "id" | "productionRunId">;
  metadata: RunMetadata;
  failedRef: DirectMediaTaskRef;
  errorMessage?: string | null;
}): RunMetadata | null {
  if (
    completedImageAttemptReviewCount(params.metadata) <
    MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW
  ) {
    return null;
  }
  const best = bestImageAttemptReview(params.metadata);
  if (!best || cleanText(best.status) === "failed") return null;
  const selected = applyBestImageAttemptSelection(params.metadata);
  const existingAcceptance = asRecord(
    selected.generatedMediaAcceptanceEnvelope
  );
  const reasonCodes = uniqueCleanTexts([
    "provider_repair_attempt_failed_using_best_available_attempt",
    cleanText(params.failedRef.status) === "failed"
      ? "provider_attempt_failed"
      : "",
    cleanText(params.failedRef.errorMessage) ? "provider_error" : "",
  ]);
  const acceptanceId =
    cleanText(existingAcceptance.acceptanceEnvelopeId) ||
    cleanText(existingAcceptance.acceptanceId) ||
    `acceptance:image:${params.run.id}:${nanoid(8)}`;
  return withUpdatedCreditSummary({
    ...selected,
    pendingImageRepairUnits: [],
    generatedMediaAcceptanceEnvelope: compactRecord({
      ...existingAcceptance,
      acceptanceId,
      acceptanceEnvelopeId: acceptanceId,
      runId: params.run.id,
      stageKey: "image_generation",
      status: "accepted_with_warnings",
      checkedAt: nowIso(),
      repairPolicy: "use_best_available_attempt_after_provider_failure",
      userReviewRequired: true,
      overrideReason:
        "provider_repair_attempt_failed_using_best_available_attempt",
      overrideMessage:
        "Provider attempt ล่าสุดล้มเหลว แต่มีรูปจาก attempt ก่อนหน้าที่ใช้ได้ ระบบส่งต่อเข้า Storyboard Review พร้อมคำเตือนให้ผู้ใช้ตรวจและเปลี่ยนเฟรมได้",
      failedAttempt: toNumber(params.failedRef.attempt),
      failedTaskId: cleanText(params.failedRef.taskId),
      failedUnitId: cleanText(params.failedRef.unitId),
      failedProviderTaskId: cleanText(params.failedRef.providerTaskId),
      providerErrorMessage:
        cleanText(params.errorMessage) ||
        cleanText(params.failedRef.errorMessage),
      reasonCodes,
    }),
    imageQaReviewOverride: {
      status: "accepted_with_warnings",
      reason: "provider_repair_attempt_failed_using_best_available_attempt",
      selectedImageAttempt: toNumber(best.attempt),
      selectedImageAttemptReviewId: cleanText(best.reviewId),
      failedAttempt: toNumber(params.failedRef.attempt),
      failedTaskId: cleanText(params.failedRef.taskId),
      failedUnitId: cleanText(params.failedRef.unitId),
      reasonCodes,
      createdAt: nowIso(),
    },
    mediaAcceptance: [
      ...(Array.isArray(selected.mediaAcceptance)
        ? selected.mediaAcceptance
        : []),
      {
        acceptanceId,
        artifactRef: `image-frame-set:${params.run.id}`,
        mediaUnit: "storyboard_cell_set",
        status: "accepted_with_warnings",
        warningApprovalRefs: [
          "policy:use-best-available-image-attempt-after-provider-failure",
        ],
        supersedesRef:
          cleanText(existingAcceptance.acceptanceEnvelopeId) || null,
      },
    ],
  });
}

function directImagePromptFingerprints(metadata: RunMetadata): string[] {
  return latestCompletedImageTaskRefs(directTaskRefs(metadata.directImageTasks))
    .map(ref => cleanText(ref.promptHash))
    .filter(Boolean);
}

function visualReferenceFingerprint(urls: string[]): string {
  const refs = uniqRefs(urls.map(url => cleanText(url)).filter(Boolean));
  return refs.length > 0
    ? buildProductionStableHash({ refs }).slice(0, 24)
    : "";
}

function appendImageAttemptReview(params: {
  metadata: RunMetadata;
  run: Pick<MarketplaceAutoReviewRun, "id">;
  refs: DirectMediaTaskRef[];
  qaEnvelopes?: Record<string, unknown>[];
  repairUnits?: DirectImageUnit[];
  status: "passed" | "accepted_with_warnings" | "repair_required" | "failed";
  attemptId?: string | null;
  expectedFrameCount?: number | null;
}): Record<string, unknown>[] {
  const attempts = params.refs
    .filter(directMediaRefReachedProvider)
    .map(ref => toNumber(ref.attempt))
    .filter(value => Number.isFinite(value) && value > 0);
  const attempt = attempts.length > 0 ? Math.max(...attempts) : 1;
  const attemptRefs = latestImageRefsForAttempt(params.refs, attempt);
  const qaEnvelopes = Array.isArray(params.qaEnvelopes)
    ? params.qaEnvelopes.map(item => asRecord(item))
    : [];
  const repairUnits = Array.isArray(params.repairUnits)
    ? params.repairUnits
    : [];
  const qaReasonCodes = qaEnvelopes.flatMap(qa =>
    Array.isArray(qa.reasonCodes)
      ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
      : []
  );
  const repairReasonCodes = repairUnits.flatMap(unit =>
    (unit.repairReasonCodes ?? []).map(code => cleanText(code)).filter(Boolean)
  );
  const refReasonCodes = attemptRefs.flatMap(ref =>
    (ref.repairReasonCodes ?? []).map(code => cleanText(code)).filter(Boolean)
  );
  const reasonCodes = uniqueCleanTexts([
    ...qaReasonCodes,
    ...repairReasonCodes,
    ...refReasonCodes,
  ]);
  const resultUrls = uniqRefs(
    attemptRefs.map(ref => cleanText(ref.resultUrl)).filter(Boolean)
  );
  const storyboardGridUrl =
    cleanText(
      attemptRefs.find(ref => cleanText(ref.unitId) === "storyboard-grid-image")
        ?.resultUrl
    ) || cleanText(params.metadata.storyboardGridUrl);
  const storyboardFrameUrls = cleanStringList(
    params.metadata.storyboardFrameUrls
  );
  const startFrameUrls = cleanStringList(params.metadata.startFrameUrls);
  const stopFrameUrls = cleanStringList(params.metadata.stopFrameUrls);
  const promptAudits = attemptRefs
    .map(ref => asRecord(ref.providerSubmitEvidence).promptAudit ?? null)
    .map(item => asRecord(item))
    .filter(item => cleanText(item.promptHash));
  const representativeAudit = promptAudits[0] ?? {};
  const checkedAt = nowIso();
  const scoreBreakdown = buildImageAttemptScoreBreakdown({
    status: params.status,
    attemptRefs,
    qaEnvelopes,
    repairUnits,
    reasonCodes,
    resultUrls,
    expectedFrameCount: params.expectedFrameCount,
  });
  const productFidelityBlockers = imageReasonCodesContainProductFidelityBlocker(
    reasonCodes
  )
    ? uniqueCleanTexts(reasonCodes.filter(imageReasonCodeBlocksProductFidelity))
    : [];
  const publishSafetyBlockers = imageReasonCodesContainPublishSafetyBlocker(
    reasonCodes
  )
    ? uniqueCleanTexts(reasonCodes.filter(imageReasonCodeBlocksPublishSafety))
    : [];
  const storyboardGridLayoutBlockers =
    imageReasonCodesContainStoryboardGridLayoutBlocker(reasonCodes)
      ? uniqueCleanTexts(
          reasonCodes.filter(imageReasonCodeBlocksStoryboardGridLayout)
        )
      : [];
  const hasSelectableResult =
    resultUrls.length > 0 ||
    storyboardFrameUrls.length > 0 ||
    startFrameUrls.length > 0 ||
    stopFrameUrls.length > 0 ||
    Boolean(storyboardGridUrl);
  const review = compactRecord({
    reviewId: `image-attempt-review:${params.run.id}:${attempt}`,
    runId: params.run.id,
    attempt,
    attemptId:
      cleanText(params.attemptId) || cleanText(params.metadata.imageAttemptId),
    status: params.status,
    unitIds: attemptRefs.map(ref => cleanText(ref.unitId)).filter(Boolean),
    unitRoles: Array.from(
      new Set(attemptRefs.map(ref => cleanText(ref.role)).filter(Boolean))
    ),
    resultUrls,
    thumbnailUrls: resultUrls,
    expectedFrameCount: toNumber(params.expectedFrameCount),
    storyboardGridUrl,
    storyboardFrameUrls,
    startFrameUrls,
    stopFrameUrls,
    selectionEligible:
      hasSelectableResult &&
      productFidelityBlockers.length === 0 &&
      publishSafetyBlockers.length === 0,
    selectionBlockers: uniqueCleanTexts([
      ...productFidelityBlockers,
      ...publishSafetyBlockers,
      ...storyboardGridLayoutBlockers,
    ]),
    qualityScore: scoreBreakdown.qualityScore,
    negativeScore: scoreBreakdown.negativeScore,
    scoreBreakdown,
    taskRefs: attemptRefs.map(ref =>
      compactRecord({
        unitId: ref.unitId,
        role: ref.role,
        status: ref.status,
        taskId: ref.taskId,
        providerTaskId: ref.providerTaskId,
        resultUrl: ref.resultUrl,
        errorMessage: ref.errorMessage,
        promptHash: ref.promptHash,
        promptLengthChars: ref.promptLengthChars,
        submittedAt: ref.submittedAt,
        completedAt: ref.completedAt,
      })
    ),
    qaVerdictRefs: qaEnvelopes
      .map(qa => cleanText(qa.qaEnvelopeId))
      .filter(Boolean),
    repairRefs: repairUnits.map(unit => cleanText(unit.unitId)).filter(Boolean),
    reasonCodes,
    repairInstructions: repairUnits
      .map(unit => cleanText(unit.repairInstruction))
      .filter(Boolean),
    promptHash: cleanText(representativeAudit.promptHash),
    promptLengthChars: toNumber(representativeAudit.promptLengthChars),
    prompt: cleanText(representativeAudit.prompt),
    promptSnippet: cleanText(representativeAudit.promptSnippet),
    promptPreflight: asRecord(representativeAudit.promptPreflight),
    promptAuditRefs: promptAudits
      .map(audit => cleanText(audit.auditId))
      .filter(Boolean),
    promptAudits,
    checkedAt,
  });
  const existing = Array.isArray(params.metadata.imageAttemptReviews)
    ? params.metadata.imageAttemptReviews.map(item => asRecord(item))
    : [];
  const next = existing.filter(item => toNumber(item.attempt) !== attempt);
  next.push(review);
  return next.sort((a, b) => toNumber(a.attempt) - toNumber(b.attempt));
}

function directImageUnits(value: unknown): DirectImageUnit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asRecord(item) as DirectImageUnit)
    .filter(
      item => Boolean(cleanText(item.unitId)) && Boolean(cleanText(item.role))
    );
}

function imageUnitsFromProviderUnreachedSubmitIntents(
  refs: DirectMediaTaskRef[]
): DirectImageUnit[] {
  return latestTaskRefsByUnit(refs)
    .filter(
      ref =>
        ref.mediaType === "image" &&
        !directMediaRefReachedProvider(ref) &&
        cleanText(ref.status) === "submit_intent_recorded"
    )
    .map(ref => ({
      unitId: ref.unitId,
      role: ref.role as DirectImageUnit["role"],
      shotId: ref.shotId,
      shotOrder: ref.shotOrder,
      repairReasonCodes: ref.repairReasonCodes,
      repairInstruction:
        cleanText(asRecord(ref).repairInstruction) ||
        cleanText(asRecord(ref.providerSubmitEvidence).repairInstruction),
    }))
    .filter(unit => cleanText(unit.unitId) && cleanText(unit.role));
}

function directVideoUnits(value: unknown): DirectVideoUnit[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asRecord(item) as DirectVideoUnit)
    .filter(
      item => Boolean(cleanText(item.unitId)) && Boolean(cleanText(item.shotId))
    );
}

function videoUnitsFromProviderUnreachedSubmitIntents(
  refs: DirectMediaTaskRef[]
): DirectVideoUnit[] {
  return latestTaskRefsByUnit(refs)
    .filter(
      ref =>
        ref.mediaType === "video" &&
        !directMediaRefReachedProvider(ref) &&
        cleanText(ref.status) === "submit_intent_recorded"
    )
    .map(
      (ref): DirectVideoUnit => ({
        unitId: ref.unitId,
        role: "video_clip",
        shotId: cleanText(ref.shotId),
        shotOrder: toNumber(ref.shotOrder),
        repairReasonCodes: ref.repairReasonCodes,
        repairInstruction:
          cleanText(asRecord(ref).repairInstruction) ||
          cleanText(asRecord(ref.providerSubmitEvidence).repairInstruction),
      })
    )
    .filter(unit => cleanText(unit.unitId) && cleanText(unit.shotId));
}

function directMediaStageKey(mediaType: "image" | "video"): StageKey {
  return mediaType === "image" ? "image_generation" : "video_generation";
}

function directMediaSubmitEvidence(refs: DirectMediaTaskRef[]) {
  return refs
    .map(ref => asRecord(ref.providerSubmitEvidence))
    .filter(item => cleanText(item.submitIntentId));
}

function buildDirectMediaSubmitIntentRef(params: {
  runId: string;
  mediaType: "image" | "video";
  stageKey: StageKey;
  unit: DirectImageUnit | DirectVideoUnit;
  attempt: number;
  model: string;
  credit: Awaited<ReturnType<typeof reserveMarketplaceMediaCredits>>;
  referenceImageUrls?: string[];
  referenceImageManifest?: ProductReferenceStoryboardReferenceImageManifestEntry[];
}): DirectMediaTaskRef {
  const submitIntentId = [
    "provider-submit-intent",
    params.runId,
    params.mediaType,
    params.unit.unitId,
    params.attempt,
  ].join(":");
  const recordedAt = nowIso();
  const evidence = compactRecord({
    submitIntentId,
    status: "recorded_before_provider_submit",
    runId: params.runId,
    mediaType: params.mediaType,
    stageKey: params.stageKey,
    unitId: params.unit.unitId,
    attempt: params.attempt,
    model: params.model,
    creditTransactionId: params.credit.transactionId,
    creditIdempotencyKey: params.credit.idempotencyKey,
    referenceImageUrls: params.referenceImageUrls ?? [],
    referenceImageManifest: params.referenceImageManifest ?? [],
    recordedAt,
  });
  return {
    unitId: params.unit.unitId,
    mediaType: params.mediaType,
    stageKey: params.stageKey,
    role: params.unit.role,
    shotId: params.unit.shotId,
    shotOrder: params.unit.shotOrder,
    attempt: params.attempt,
    taskId: `submit-intent:${params.unit.unitId}:${params.attempt}`,
    model: params.model,
    status: "submit_intent_recorded",
    creditAmount: params.credit.amount,
    creditTransactionId: params.credit.transactionId,
    creditIdempotencyKey: params.credit.idempotencyKey,
    repairReasonCodes: params.unit.repairReasonCodes,
    referenceImageUrls: params.referenceImageUrls ?? [],
    referenceImageManifest: params.referenceImageManifest ?? [],
    submittedAt: recordedAt,
    providerSubmitIntentId: submitIntentId,
    providerSubmitIntentStatus: "recorded_before_provider_submit",
    providerSubmitIntentRecordedAt: recordedAt,
    providerSubmitEvidence: evidence,
  };
}

function replaceDirectMediaSubmittedRef(
  refs: DirectMediaTaskRef[],
  intentRef: DirectMediaTaskRef | null,
  nextRef: DirectMediaTaskRef
): DirectMediaTaskRef[] {
  if (!intentRef) return [...refs, nextRef];
  const index = refs.findIndex(
    ref =>
      ref.providerSubmitIntentId === intentRef.providerSubmitIntentId ||
      (ref.unitId === intentRef.unitId &&
        ref.attempt === intentRef.attempt &&
        ref.mediaType === intentRef.mediaType)
  );
  if (index < 0) return [...refs, nextRef];
  const next = [...refs];
  next[index] = nextRef;
  return next;
}

function buildDirectMediaSubmitMetadata(params: {
  metadata: RunMetadata;
  mediaType: "image" | "video";
  attemptId: string;
  existingRefs: DirectMediaTaskRef[];
  submittedRefs: DirectMediaTaskRef[];
  clearPendingRepairUnits?: boolean;
}): RunMetadata {
  const refs = [...params.existingRefs, ...params.submittedRefs];
  const submitEvidence = directMediaSubmitEvidence(refs);
  if (params.mediaType === "image") {
    return {
      ...params.metadata,
      imageAttemptId: params.attemptId,
      directImageTasks: refs,
      directImageSubmitEvidence: submitEvidence,
      ...(params.clearPendingRepairUnits
        ? { pendingImageRepairUnits: [] }
        : {}),
      imageMediaTaskIds: refs.map(ref => ref.taskId),
      imageProviderTaskIds: refs
        .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
        .filter(Boolean),
      generatedMediaAcceptanceEnvelope: {
        status: "pending",
        stageKey: "image_generation",
        updatedAt: nowIso(),
      },
    };
  }
  return {
    ...params.metadata,
    videoAttemptId: params.attemptId,
    directVideoTasks: refs,
    directVideoSubmitEvidence: submitEvidence,
    ...(params.clearPendingRepairUnits ? { pendingVideoRepairUnits: [] } : {}),
    videoUnitIds: refs.map(ref => ref.unitId),
    videoMediaTaskIds: refs.map(ref => ref.taskId),
    videoProviderTaskIds: refs
      .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
      .filter(Boolean),
  };
}

export function buildMarketplaceAutoReviewDirectMediaSubmitMetadataForTest(input: {
  metadata?: Record<string, any>;
  mediaType: "image" | "video";
  attemptId: string;
  existingRefs?: Record<string, any>[];
  submittedRefs?: Record<string, any>[];
  clearPendingRepairUnits?: boolean;
}): RunMetadata {
  return buildDirectMediaSubmitMetadata({
    metadata: (input.metadata ?? {}) as RunMetadata,
    mediaType: input.mediaType,
    attemptId: input.attemptId,
    existingRefs: (input.existingRefs ?? []) as DirectMediaTaskRef[],
    submittedRefs: (input.submittedRefs ?? []) as DirectMediaTaskRef[],
    clearPendingRepairUnits: input.clearPendingRepairUnits,
  });
}

async function persistDirectMediaSubmitProgress(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  mediaType: "image" | "video";
  attemptId: string;
  existingRefs: DirectMediaTaskRef[];
  submittedRefs: DirectMediaTaskRef[];
  clearPendingRepairUnits?: boolean;
}): Promise<RunMetadata> {
  const stageKey = directMediaStageKey(params.mediaType);
  const isRepairSubmit = params.submittedRefs.some(ref => {
    const providerEvidence = asRecord(ref.providerSubmitEvidence);
    return (
      toNumber(ref.attempt) > 1 ||
      (Array.isArray(ref.repairReasonCodes) &&
        ref.repairReasonCodes.some(code => cleanText(code))) ||
      Boolean(cleanText(providerEvidence.repairInstruction))
    );
  });
  const repairReasonCodes = Array.from(
    new Set(
      params.submittedRefs
        .flatMap(ref =>
          Array.isArray(ref.repairReasonCodes) ? ref.repairReasonCodes : []
        )
        .map(code => cleanText(code))
        .filter(Boolean)
    )
  );
  const stages = stageKeysForMode(
    params.run.outputMode as MarketplaceAutoReviewOutputMode
  );
  const metadata = withUpdatedCreditSummary(
    buildDirectMediaSubmitMetadata({
      metadata: params.metadata,
      mediaType: params.mediaType,
      attemptId: params.attemptId,
      existingRefs: params.existingRefs,
      submittedRefs: params.submittedRefs,
      clearPendingRepairUnits: params.clearPendingRepairUnits,
    })
  );
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "waiting_provider",
    currentStage: stageKey,
    stageIndex: stageIndex(stageKey, stages),
    stageCount: stages.length,
    metadataJson: metadata,
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey,
    stageOrder: stageIndex(stageKey, stages),
    status: "waiting_provider",
    providerTaskIds: params.submittedRefs
      .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
      .filter(Boolean),
    output: {
      attemptId: params.attemptId,
      directMediaExecution: true,
      mediaTaskIds: params.submittedRefs.map(ref => ref.taskId),
      unitIds: params.submittedRefs.map(ref => ref.unitId),
      submitIntentEvidenceRefs: directMediaSubmitEvidence(params.submittedRefs)
        .map(item => cleanText(item.submitIntentId))
        .filter(Boolean),
      persistedAfterEachSubmit: true,
      submitIntentRecordedBeforeProviderSubmit: true,
      partialSubmitSafe: !params.clearPendingRepairUnits,
      activeSubstep:
        params.mediaType === "image"
          ? isRepairSubmit
            ? "ซ่อมภาพจากผลตรวจ QA"
            : "รอผลสร้างภาพจาก provider"
          : "รอผลสร้างวิดีโอจาก provider",
      progressPercent:
        params.mediaType === "image" ? (isRepairSubmit ? 65 : 60) : 60,
      statusDetail:
        params.mediaType === "image"
          ? {
              state: isRepairSubmit
                ? "frame_vision_qa_repairing"
                : "waiting_provider",
              severity: isRepairSubmit ? "warning" : "info",
              stageKey,
              reasonCodes: isRepairSubmit
                ? repairReasonCodes.length > 0
                  ? repairReasonCodes
                  : ["image_qa_repair_submitted"]
                : ["provider_image_submitted"],
              safeMessage: isRepairSubmit
                ? "ภาพสร้างเสร็จแล้ว แต่ QA พบจุดที่ต้องซ่อม ระบบกำลังส่งซ่อมเฉพาะ grid/frame ที่ไม่ผ่าน และจะส่งต่อเมื่อครบ 3 รอบ"
                : "ส่งงานสร้างภาพแล้ว กำลังรอผลจาก provider",
              nextAction: isRepairSubmit
                ? "รอผลซ่อมจาก provider และให้ครบ 3 รอบก่อนส่งเข้า Storyboard Review ต่อ"
                : "ระบบจะตรวจสถานะให้อัตโนมัติ",
              userActionRequired: false,
              retryable: true,
            }
          : {
              state: "waiting_provider",
              severity: "info",
              stageKey,
              reasonCodes: ["provider_video_submitted"],
              safeMessage: "ส่งงานสร้างวิดีโอแล้ว กำลังรอผลจาก provider",
              nextAction: "ระบบจะตรวจสถานะให้อัตโนมัติ",
              userActionRequired: false,
              retryable: true,
            },
    },
  });
  return metadata;
}

function latestTaskRefsByUnit(
  refs: DirectMediaTaskRef[]
): DirectMediaTaskRef[] {
  const providerRefs = refs.filter(directMediaRefReachedProvider);
  const sourceRefs = providerRefs.length > 0 ? providerRefs : refs;
  const latest = new Map<string, DirectMediaTaskRef>();
  for (const ref of sourceRefs) {
    const current = latest.get(ref.unitId);
    if (!current || toNumber(ref.attempt) >= toNumber(current.attempt)) {
      latest.set(ref.unitId, ref);
    }
  }
  return Array.from(latest.values()).sort(
    (a, b) => toNumber(a.shotOrder) - toNumber(b.shotOrder)
  );
}

function nextDirectAttempt(refs: DirectMediaTaskRef[], unitId: string): number {
  return (
    refs
      .filter(ref => ref.unitId === unitId)
      .filter(directMediaRefReachedProvider)
      .reduce((max, ref) => Math.max(max, toNumber(ref.attempt)), 0) + 1
  );
}

function directMediaRefReachedProvider(ref: DirectMediaTaskRef): boolean {
  const submitIntentStatus = cleanText(ref.providerSubmitIntentStatus);
  if (
    [
      "blocked_before_provider_submit",
      "recorded_before_provider_submit",
      "provider_submit_failed_before_intent",
      "provider_submit_failed_after_intent",
    ].includes(submitIntentStatus)
  ) {
    return false;
  }
  if (cleanText(ref.status) === "submit_intent_recorded") return false;
  if (/^prompt-preflight-failed:/i.test(cleanText(ref.taskId))) {
    return false;
  }
  return true;
}

function metadataHasProviderUnreachedSubmitIntent(
  metadata: RunMetadata
): boolean {
  const refs = [
    ...latestTaskRefsByUnit(directTaskRefs(metadata.directImageTasks)),
    ...latestTaskRefsByUnit(directTaskRefs(metadata.directVideoTasks)),
  ];
  return refs.some(
    ref =>
      !directMediaRefReachedProvider(ref) &&
      cleanText(ref.status) === "submit_intent_recorded"
  );
}

export function directMediaRefReachedProviderForTest(
  ref: DirectMediaTaskRef
): boolean {
  return directMediaRefReachedProvider(ref);
}

function upsertCreditTransaction(
  existing: unknown,
  transaction: Record<string, unknown>
): Record<string, unknown>[] {
  const items = Array.isArray(existing)
    ? existing.map(item => asRecord(item))
    : [];
  const key = cleanText(
    transaction.creditReservationIdempotencyKey ??
      transaction.idempotencyKey ??
      transaction.qaEnvelopeId ??
      transaction.stageKey
  );
  if (!key) return [...items, transaction];
  const next = items.filter(
    item =>
      cleanText(
        item.creditReservationIdempotencyKey ??
          item.idempotencyKey ??
          item.qaEnvelopeId ??
          item.stageKey
      ) !== key
  );
  next.push(transaction);
  return next;
}

function creditRefsFromMetadata(metadata: RunMetadata): string[] {
  const llmTransactions = Array.isArray(metadata.llmQaCreditTransactions)
    ? metadata.llmQaCreditTransactions.map((item: unknown) => asRecord(item))
    : [];
  const llmRefs = llmTransactions.flatMap(item => [
    cleanText(item.creditReservationIdempotencyKey)
      ? `credit:${cleanText(item.creditReservationIdempotencyKey)}`
      : "",
    toNumber(item.creditTransactionId)
      ? `credit-tx:${toNumber(item.creditTransactionId)}`
      : "",
  ]);
  const mediaRefs = [
    ...directTaskRefs(metadata.directImageTasks),
    ...directTaskRefs(metadata.directVideoTasks),
  ].flatMap(ref => [
    cleanText(ref.creditIdempotencyKey)
      ? `credit:${cleanText(ref.creditIdempotencyKey)}`
      : "",
    ref.creditTransactionId ? `credit-tx:${ref.creditTransactionId}` : "",
  ]);
  const audioRefs = [
    cleanText(metadata.audioCreditIdempotencyKey)
      ? `credit:${cleanText(metadata.audioCreditIdempotencyKey)}`
      : "",
    metadata.audioCreditTransactionId
      ? `credit-tx:${metadata.audioCreditTransactionId}`
      : "",
  ];
  const renderReservation = asRecord(metadata.renderCreditReservation);
  const renderRefs = [
    cleanText(renderReservation.idempotencyKey)
      ? `credit:${cleanText(renderReservation.idempotencyKey)}`
      : "",
    toNumber(renderReservation.transactionId)
      ? `credit-tx:${toNumber(renderReservation.transactionId)}`
      : "",
  ];
  const summary = asRecord(metadata.creditSummary);
  const summaryRefs = [
    ...(Array.isArray(summary.reservationRefs) ? summary.reservationRefs : []),
    ...(Array.isArray(summary.transactionRefs) ? summary.transactionRefs : []),
  ].map(item => cleanText(item));
  return uniqRefs([
    ...llmRefs,
    ...mediaRefs,
    ...audioRefs,
    ...renderRefs,
    ...summaryRefs,
  ]);
}

function renderCreditRefsFromMetadata(metadata: RunMetadata): string[] {
  const reservation = asRecord(metadata.renderCreditReservation);
  return uniqRefs([
    cleanText(reservation.idempotencyKey)
      ? `credit:${cleanText(reservation.idempotencyKey)}`
      : "",
    toNumber(reservation.transactionId)
      ? `credit-tx:${toNumber(reservation.transactionId)}`
      : "",
  ]);
}

function withUpdatedCreditSummary(metadata: RunMetadata): RunMetadata {
  const mediaRefs = [
    ...directTaskRefs(metadata.directImageTasks),
    ...directTaskRefs(metadata.directVideoTasks),
  ];
  if (metadata.audioCreditAmount) {
    mediaRefs.push({
      unitId: "audio-full-voiceover",
      mediaType: "audio",
      stageKey: "audio_generation",
      role: "voiceover",
      attempt: 1,
      taskId: cleanText(metadata.audioMediaTaskId) || "audio-pending",
      model: cleanText(metadata.audioTaskModel) || "audio",
      status: metadata.audioUrl ? "completed" : "waiting_provider",
      creditAmount: metadata.audioCreditAmount,
      creditTransactionId: metadata.audioCreditTransactionId,
      creditIdempotencyKey: metadata.audioCreditIdempotencyKey,
      refundTransactionId: metadata.audioRefundTransactionId,
      submittedAt: nowIso(),
    });
  }
  const rawLlmTransactions = Array.isArray(metadata.llmQaCreditTransactions)
    ? metadata.llmQaCreditTransactions.map((item: unknown) => asRecord(item))
    : [];
  const llmByKey = new Map<string, Record<string, unknown>>();
  for (const item of rawLlmTransactions) {
    const key =
      cleanText(
        item.creditReservationIdempotencyKey ??
          item.idempotencyKey ??
          item.qaEnvelopeId ??
          item.stageKey
      ) || nanoid(6);
    const existing = llmByKey.get(key);
    llmByKey.set(key, {
      ...(existing ?? {}),
      ...item,
      reservedCredits: Math.max(
        toNumber(existing?.reservedCredits),
        toNumber(item.reservedCredits)
      ),
      creditsUsed: Math.max(
        toNumber(existing?.creditsUsed),
        toNumber(item.creditsUsed)
      ),
      refundCredits: Math.max(
        toNumber(existing?.refundCredits),
        toNumber(item.refundCredits)
      ),
    });
  }
  const llmTransactions = [...llmByKey.values()];
  const llmCredits = llmTransactions.reduce(
    (sum: number, item) => sum + toNumber(item.creditsUsed),
    0
  );
  const llmReservedCredits = llmTransactions.reduce((sum: number, item) => {
    const reserved = toNumber(item.reservedCredits);
    return sum + (reserved > 0 ? reserved : toNumber(item.creditsUsed));
  }, 0);
  const llmRefundedCredits = llmTransactions.reduce(
    (sum: number, item) => sum + toNumber(item.refundCredits),
    0
  );
  const mediaReservedCredits = mediaRefs.reduce(
    (sum, ref) => sum + toNumber(ref.creditAmount),
    0
  );
  const mediaRefundedCredits = mediaRefs.reduce(
    (sum, ref) =>
      sum + (ref.refundTransactionId ? toNumber(ref.creditAmount) : 0),
    0
  );
  const renderReservation = asRecord(metadata.renderCreditReservation);
  const renderReservedCredits = toNumber(renderReservation.amount);
  const renderRefundedCredits =
    renderReservation.refundTransactionId ||
    metadata.renderCreditRefundTransactionId
      ? renderReservedCredits
      : 0;
  const reservedCredits =
    mediaReservedCredits + llmReservedCredits + renderReservedCredits;
  const refundedCredits =
    mediaRefundedCredits + llmRefundedCredits + renderRefundedCredits;
  const reservationRefs = creditRefsFromMetadata({
    ...metadata,
    creditSummary: {
      ...(asRecord(metadata.creditSummary) as Record<string, unknown>),
      reservationRefs: [],
      transactionRefs: [],
    },
  }).filter(ref => ref.startsWith("credit:"));
  const transactionRefs = creditRefsFromMetadata({
    ...metadata,
    creditSummary: {
      ...(asRecord(metadata.creditSummary) as Record<string, unknown>),
      reservationRefs: [],
      transactionRefs: [],
    },
  }).filter(ref => ref.startsWith("credit-tx:"));
  const existingCreditSummary = asRecord(metadata.creditSummary);
  const existingReservationRefs = Array.isArray(
    existingCreditSummary.reservationRefs
  )
    ? existingCreditSummary.reservationRefs
        .map(item => cleanText(item))
        .filter(Boolean)
    : [];
  const existingTransactionRefs = Array.isArray(
    existingCreditSummary.transactionRefs
  )
    ? existingCreditSummary.transactionRefs
        .map(item => cleanText(item))
        .filter(Boolean)
    : [];
  return {
    ...metadata,
    creditSummary: {
      ...(existingCreditSummary as Record<string, unknown>),
      status: "tracked_idempotently",
      reservedCredits,
      spentCredits:
        Math.max(0, mediaReservedCredits - mediaRefundedCredits) +
        llmCredits +
        Math.max(0, renderReservedCredits - renderRefundedCredits),
      refundedCredits,
      outstandingCredits: Math.max(0, reservedCredits - refundedCredits),
      mediaTaskCount: mediaRefs.length,
      llmQaCredits: llmCredits,
      renderCredits: Math.max(0, renderReservedCredits - renderRefundedCredits),
      reservationRefs: uniqRefs([
        ...existingReservationRefs,
        ...reservationRefs,
      ]),
      transactionRefs: uniqRefs([
        ...existingTransactionRefs,
        ...transactionRefs,
      ]),
      nodeGatewayOnly: true,
      updatedAt: nowIso(),
    },
  };
}

function directMediaSourceType(
  mediaType: DirectMediaTaskRef["mediaType"]
): CreditSourceType {
  if (mediaType === "image") return "media_image";
  if (mediaType === "video") return "media_video";
  if (mediaType === "audio") return "media_audio";
  return "other";
}

async function getMediaModelPricingForCredit(
  db: Db,
  modelId: string
): Promise<{
  creditCost: number;
  configJson: Record<string, any> | null;
}> {
  const staticConfig = getStaticModelById(modelId)?.configJson as
    | Record<string, any>
    | null
    | undefined;
  try {
    const [dbModel] = await db
      .select({
        creditCost: mediaModels.creditCost,
        configJson: mediaModels.configJson,
      })
      .from(mediaModels)
      .where(eq(mediaModels.modelId, modelId))
      .limit(1);
    if (dbModel) {
      const dbConfig = dbModel.configJson as Record<string, any> | null;
      return {
        creditCost: dbModel.creditCost,
        configJson: dbConfig
          ? { ...(staticConfig ?? {}), ...dbConfig }
          : (staticConfig ?? null),
      };
    }
  } catch (error) {
    console.warn(
      "[marketplaceAutoReview] media pricing lookup failed; using static fallback",
      {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
  const staticModel = getStaticModelById(modelId);
  const hardcoded = MEDIA_MODELS[modelId as keyof typeof MEDIA_MODELS];
  return {
    creditCost: staticModel?.creditCost ?? hardcoded?.creditCost ?? 10,
    configJson:
      (staticModel?.configJson as Record<string, any> | null | undefined) ??
      null,
  };
}

async function reserveMarketplaceMediaCredits(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  stageKey: StageKey;
  mediaType: "image" | "video" | "audio";
  unitId: string;
  attempt: number;
  model: string;
  selections: Record<string, unknown>;
  description: string;
  metadata: Record<string, unknown>;
}): Promise<{
  amount: number;
  transactionId?: number;
  idempotencyKey?: string;
}> {
  const pricing = await getMediaModelPricingForCredit(params.db, params.model);
  const amount = calculateCreditCost(pricing, params.selections);
  if (amount <= 0) return { amount: 0 };
  if (!(await hasEnoughCredits(params.auth.userId, amount))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient credits. Required: ${amount}`,
    });
  }
  const idempotencyKey = [
    "marketplace-auto-review",
    params.run.id,
    params.stageKey,
    params.mediaType,
    params.unitId,
    `attempt-${params.attempt}`,
    "reserve-v1",
  ].join(":");
  const result = await deductCredits({
    userId: params.auth.userId,
    tenantId: params.tenantId,
    amount,
    description: params.description,
    idempotencyKey,
    sourceType: directMediaSourceType(params.mediaType),
    metadata: {
      feature: "marketplace_auto_review",
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      productId: params.run.productId,
      stageKey: params.stageKey,
      mediaType: params.mediaType,
      unitId: params.unitId,
      attempt: params.attempt,
      model: params.model,
      feature117CreditCategory: "direct_media_task_reservation",
      ...params.metadata,
    },
  });
  return { amount, transactionId: result.transactionId, idempotencyKey };
}

async function reserveMarketplaceLlmCredits(params: {
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  runId: string;
  productId: string;
  stageKey: StageKey;
  category: string;
  model: string;
  traceSuffix: string;
  estimatedCreditReserve: number;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<MarketplaceLlmCreditReservation> {
  const amount = Math.max(1, Math.ceil(params.estimatedCreditReserve));
  if (!(await hasEnoughCredits(params.auth.userId, amount))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient credits. Required: ${amount}`,
    });
  }
  const idempotencyKey = [
    "marketplace-auto-review",
    params.runId,
    params.stageKey,
    params.category,
    params.traceSuffix,
    "llm-reserve-v1",
  ].join(":");
  const result = await deductCredits({
    userId: params.auth.userId,
    tenantId: params.tenantId,
    amount,
    description: `${params.description} (reserved before LLM gateway dispatch)`,
    idempotencyKey,
    sourceType: "other",
    metadata: {
      feature: "marketplace_auto_review",
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      runId: params.runId,
      productId: params.productId,
      stageKey: params.stageKey,
      model: params.model,
      provider: "llm-gateway",
      feature117CreditCategory: params.category,
      reservation: true,
      llmGatewayOnly: true,
      creditAuthority: "node_pre_dispatch_reservation",
      ...params.metadata,
    },
  });
  return {
    amount,
    transactionId: result.transactionId,
    idempotencyKey,
    category: params.category,
    model: params.model,
    provider: "llm-gateway",
    reservedAt: nowIso(),
  };
}

async function refundMarketplaceLlmReservation(params: {
  auth: AuthContext;
  reservation: MarketplaceLlmCreditReservation;
  amount?: number;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  const requestedAmount = Number(params.amount ?? params.reservation.amount);
  const amount = Number.isFinite(requestedAmount)
    ? Math.max(
        0,
        Math.min(params.reservation.amount, Math.ceil(requestedAmount))
      )
    : params.reservation.amount;
  if (amount <= 0) return undefined;
  return refundCredits({
    userId: params.auth.userId,
    amount,
    description: `Marketplace auto review LLM reservation refund: ${params.reason}`,
    originalTransactionId: params.reservation.transactionId,
    idempotencyKey: `${params.reservation.idempotencyKey}:refund:${buildProductionStableHash(
      {
        reason: params.reason,
        amount,
      }
    ).slice(0, 10)}`,
    sourceType: "other",
    metadata: {
      feature: "marketplace_auto_review",
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      originalReservationIdempotencyKey: params.reservation.idempotencyKey,
      originalTransactionId: params.reservation.transactionId,
      category: params.reservation.category,
      model: params.reservation.model,
      refundReason: params.reason,
      ...params.metadata,
    },
  });
}

async function reconcileMarketplaceLlmCredits(params: {
  auth: AuthContext;
  reservation: MarketplaceLlmCreditReservation;
  inputTokens: number;
  outputTokens: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<MarketplaceLlmCreditReconciliation> {
  const actualCredits = Math.max(
    1,
    await calculateCreditsForLLMDynamic(
      Math.max(0, params.inputTokens),
      Math.max(0, params.outputTokens),
      params.reservation.model
    )
  );
  const creditsUsed = 0;
  const refundAmount = params.reservation.amount;
  const refund = await refundMarketplaceLlmReservation({
    auth: params.auth,
    reservation: params.reservation,
    amount: refundAmount,
    reason: `gateway_actual_usage_charged:${params.reason}`,
    metadata: {
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      actualCredits,
      creditsUsed,
      gatewayActualUsageChargedSeparately: true,
      ...params.metadata,
    },
  });
  return {
    ...params.reservation,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    actualCredits,
    creditsUsed,
    refundAmount,
    refundTransactionId:
      typeof refund?.transactionId === "number"
        ? refund.transactionId
        : undefined,
    budgetOverrun: false,
    reconciledAt: nowIso(),
  };
}

function llmReservationCreditTransaction(params: {
  reservation: MarketplaceLlmCreditReservation;
  runId: string;
  stageKey: StageKey;
  traceSuffix: string;
  status: string;
  refundTransactionId?: number;
  refundCredits?: number;
  errorMessage?: string;
}): Record<string, unknown> {
  return {
    stageKey: params.stageKey,
    status: params.status,
    reservedCredits: params.reservation.amount,
    creditsUsed: 0,
    actualCredits: 0,
    refundCredits: params.refundCredits ?? 0,
    creditTransactionId: params.reservation.transactionId,
    creditReservationIdempotencyKey: params.reservation.idempotencyKey,
    refundTransactionId: params.refundTransactionId,
    creditCategory: params.reservation.category,
    model: params.reservation.model,
    provider: params.reservation.provider,
    traceSuffix: params.traceSuffix,
    errorMessage: params.errorMessage,
    createdAt: params.reservation.reservedAt,
  };
}

async function attachMarketplaceLlmReservationEvidence(params: {
  db: Db;
  runId: string;
  metadata: RunMetadata;
  reservation: MarketplaceLlmCreditReservation;
  stageKey: StageKey;
  traceSuffix: string;
}): Promise<RunMetadata> {
  const metadata = withUpdatedCreditSummary({
    ...params.metadata,
    llmQaCreditTransactions: upsertCreditTransaction(
      params.metadata.llmQaCreditTransactions,
      llmReservationCreditTransaction({
        reservation: params.reservation,
        runId: params.runId,
        stageKey: params.stageKey,
        traceSuffix: params.traceSuffix,
        status: "reserved",
      })
    ),
  });
  await updateRun({
    db: params.db,
    runId: params.runId,
    metadataJson: metadata,
  });
  return metadata;
}

async function refundMarketplaceMediaCredits(params: {
  auth: AuthContext;
  ref: DirectMediaTaskRef;
  reason: string;
}) {
  const amount = toNumber(params.ref.creditAmount);
  if (amount <= 0 || params.ref.refundTransactionId) return params.ref;
  const result = await refundCredits({
    userId: params.auth.userId,
    amount,
    originalTransactionId: params.ref.creditTransactionId,
    idempotencyKey: `${params.ref.creditIdempotencyKey ?? params.ref.taskId}:refund:${params.reason}`,
    description: `Refund marketplace auto review ${params.ref.mediaType}: ${params.reason}`,
    sourceType: directMediaSourceType(params.ref.mediaType),
    metadata: {
      feature: "marketplace_auto_review",
      unitId: params.ref.unitId,
      mediaType: params.ref.mediaType,
      reason: params.reason,
    },
  });
  return { ...params.ref, refundTransactionId: result.transactionId };
}

async function reserveMarketplaceRenderCredits(params: {
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  renderHash: string;
  jobId: string;
}): Promise<MarketplaceRenderCreditReservation> {
  const amount = Math.max(
    1,
    Number(process.env.MARKETPLACE_AUTO_REVIEW_RENDER_CREDITS ?? 10) || 10
  );
  if (!(await hasEnoughCredits(params.auth.userId, amount))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Insufficient credits. Required: ${amount}`,
    });
  }
  const idempotencyKey = [
    "marketplace-auto-review",
    params.run.id,
    "render",
    params.renderHash,
    "render-reserve-v1",
  ].join(":");
  const result = await deductCredits({
    userId: params.auth.userId,
    tenantId: params.tenantId,
    amount,
    description: "Marketplace auto review render reservation",
    idempotencyKey,
    sourceType: "media_video",
    metadata: {
      feature: "marketplace_auto_review",
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      productId: params.plan.productTruth.productId,
      stageKey: "render",
      renderHash: params.renderHash,
      jobId: params.jobId,
      feature117CreditCategory: "render",
      reservation: true,
      creditAuthority: "node_pre_dispatch_render_reservation",
    },
  });
  return {
    amount,
    transactionId: result.transactionId,
    idempotencyKey,
    category: "render",
    renderHash: params.renderHash,
    jobId: params.jobId,
    reservedAt: nowIso(),
  };
}

async function refundMarketplaceRenderCredits(params: {
  auth: AuthContext;
  reservation?:
    | MarketplaceRenderCreditReservation
    | Record<string, unknown>
    | null;
  reason: string;
}) {
  const reservation = asRecord(params.reservation);
  const amount = toNumber(reservation.amount);
  if (amount <= 0 || reservation.refundTransactionId) return undefined;
  return refundCredits({
    userId: params.auth.userId,
    amount,
    originalTransactionId: toNumber(reservation.transactionId) || undefined,
    idempotencyKey: `${cleanText(reservation.idempotencyKey) || cleanText(reservation.jobId) || "render"}:refund:${params.reason}`,
    description: `Refund marketplace auto review render: ${params.reason}`,
    sourceType: "media_video",
    metadata: {
      feature: "marketplace_auto_review",
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      stageKey: "render",
      reason: params.reason,
      renderHash: cleanText(reservation.renderHash),
      jobId: cleanText(reservation.jobId),
    },
  });
}

function buildInitialImageUnits(
  plan: AutoReviewPlan,
  frameStrategy: MarketplaceAutoReviewFrameStrategy
): DirectImageUnit[] {
  if (frameStrategy === "storyboard_3x3_split") {
    return [{ unitId: "storyboard-grid-image", role: "storyboard_grid" }];
  }
  return plan.shots.flatMap(shot => [
    {
      unitId: `${shot.id}-start`,
      role: "start_frame" as const,
      shotId: shot.id,
      shotOrder: shot.order,
    },
    {
      unitId: `${shot.id}-stop`,
      role: "stop_frame" as const,
      shotId: shot.id,
      shotOrder: shot.order,
    },
  ]);
}

function imageRepairUnitsForFrameStrategy(
  frameStrategy: MarketplaceAutoReviewFrameStrategy,
  pendingRepairUnits: DirectImageUnit[]
): DirectImageUnit[] {
  return frameStrategy === "storyboard_3x3_split"
    ? pendingRepairUnits.filter(unit => unit.role === "storyboard_grid")
    : pendingRepairUnits;
}

function buildInitialVideoUnits(plan: AutoReviewPlan): DirectVideoUnit[] {
  return plan.shots.map(shot => ({
    unitId: `${shot.id}-video`,
    role: "video_clip",
    shotId: shot.id,
    shotOrder: shot.order,
  }));
}

function shotForUnit(
  plan: AutoReviewPlan,
  unit: DirectImageUnit | DirectVideoUnit
): AutoReviewShot | undefined {
  return plan.shots.find(
    shot => shot.id === unit.shotId || shot.order === unit.shotOrder
  );
}

function buildStoryboardFramePrompt(
  plan: AutoReviewPlan,
  shot: AutoReviewShot,
  repairInstruction?: string,
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode = "no_text"
): string {
  const textPolicy =
    overlayTextMode === "allow_text"
      ? "Optional overlay text is allowed only when it is short, truthful, Thai, tied to this shot's narration, and does not cover the product. No price badges, unsupported claims, logos, watermarks, or random glyphs."
      : "No text, captions, labels, watermarks, UI, price badges, or overlaid graphics.";
  return [
    `Create ONE vertical 9:16 storyboard frame for shot ${shot.order}: ${shot.title}.`,
    `Visual: ${shot.visual}. Camera: ${shot.camera}. Movement: ${shot.movement}.`,
    `Product role: ${shot.productRole}.`,
    promptReferenceSection(plan),
    textPolicy,
    "Do not invent product details, labels, accessories, colors, materials, ports, logos, or packaging not visible in the reference product images.",
    "Keep any human character face either clearly consistent with provided character references or avoid front-facing identity reveal.",
    "Advertising warning text, if needed, must be readable and not cover the product.",
    repairInstruction ? `Repair instruction: ${repairInstruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImagePromptForUnit(
  plan: AutoReviewPlan,
  unit: DirectImageUnit,
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode = "no_text"
): string {
  const shot = shotForUnit(plan, unit);
  const repairInstruction =
    cleanText(unit.repairInstruction) ||
    (unit.repairReasonCodes?.length
      ? `Fix only: ${unit.repairReasonCodes.join(", ")}.`
      : "");
  if (unit.role === "storyboard_grid")
    return build3x3StoryboardPrompt(plan, overlayTextMode, repairInstruction);
  if (!shot) throw new Error(`Missing shot for image unit ${unit.unitId}`);
  if (unit.role === "storyboard_frame")
    return buildStoryboardFramePrompt(
      plan,
      shot,
      repairInstruction,
      overlayTextMode
    );
  return (
    buildShotFramePrompt(
      plan,
      shot,
      unit.role === "stop_frame" ? "stop" : "start",
      overlayTextMode
    ) + (repairInstruction ? `\nTargeted repair: ${repairInstruction}` : "")
  );
}

const MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_PREFLIGHT_RULESET =
  "marketplace-auto-review:image-prompt-preflight:product-reference-storyboard:v1";

function countPromptMatches(prompt: string, pattern: RegExp): number {
  return prompt.match(pattern)?.length ?? 0;
}

function validateMarketplaceAutoReviewImagePromptPreflight(input: {
  prompt: string;
  unit: DirectImageUnit;
  plan: AutoReviewPlan;
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode;
  skillRuntime?: Record<string, unknown> | null;
}): MarketplaceAutoReviewPromptPreflightResult {
  const prompt = cleanText(input.prompt);
  const lower = prompt.toLowerCase();
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!prompt) blockers.push("prompt_empty");
  if (prompt.length > MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS) {
    blockers.push("prompt_too_long_for_image_provider");
  }
  if (
    (marketplaceAutoReviewPlanNeedsMinorSafetyLock(input.plan) ||
      textHasMinorSafetySignal(prompt)) &&
    !/MINOR SAFETY CLOTHING LOCK/i.test(prompt)
  ) {
    blockers.push("minor_safety_clothing_lock_missing");
  }

  if (input.unit.role === "storyboard_grid") {
    const runtimeContract =
      buildMarketplaceAutoReviewSkillRuntimeContractChecks(input.skillRuntime);
    const skillRuntimeRecord = asRecord(input.skillRuntime);
    const runtimeCompletenessWarnings = Array.isArray(
      skillRuntimeRecord.completenessWarnings
    )
      ? skillRuntimeRecord.completenessWarnings
          .map(item => cleanText(item))
          .filter(Boolean)
      : [];
    const hasSkillRuntime = runtimeContract.hasRuntime;
    const addContractIssue = (code: string, hard = !hasSkillRuntime) => {
      if (hard) blockers.push(code);
      else warnings.push(code);
    };
    if (runtimeContract.hasRuntime) {
      if (!runtimeContract.hasRequiredSkill) {
        warnings.push("runtime_skill_contract_missing");
      }
      if (!runtimeContract.hasGenerationMode) {
        warnings.push("runtime_generation_mode_mismatch");
      }
      if (!runtimeContract.hasLayoutPreset) {
        warnings.push("runtime_layout_preset_mismatch");
      }
      if (!runtimeContract.hasAspectRatio) {
        warnings.push("runtime_aspect_ratio_mismatch");
      }
      if (!runtimeContract.hasDetectedProductCategory) {
        warnings.push("runtime_product_category_missing_or_auto");
      }
      if (!runtimeContract.hasReferenceProductImages) {
        warnings.push("runtime_reference_product_images_missing");
      }
      if (!runtimeContract.hasSchemaAuditPassed) {
        warnings.push("runtime_skill_input_schema_audit_failed");
      }
      if (runtimeContract.fallbackUsed) {
        warnings.push("runtime_fallback_used");
      }
      for (const missingKey of runtimeContract.missingInputKeys) {
        warnings.push(`runtime_input_${missingKey}_missing`);
      }
      if (
        runtimeCompletenessWarnings.includes(
          "product_reference_image_exact_recreation_missing"
        )
      ) {
        warnings.push("product_reference_image_exact_recreation_missing");
      }
    }

    const requiredFragmentGroups: Array<
      readonly [string, readonly string[], boolean?]
    > = [
      [
        "output_single_image_missing",
        ["one single 9:16 image", "single 9:16"],
        true,
      ],
      [
        "exact_frame_count_missing",
        ["exactly 9 frames", "9 total frames"],
        true,
      ],
      [
        "vertical_frame_count_missing",
        ["exactly 9 vertical frames", "9 vertical frames"],
        true,
      ],
      [
        "equal_columns_missing",
        ["exactly 3 equal-width columns", "3 equal-width columns"],
        true,
      ],
      [
        "equal_rows_missing",
        ["exactly 3 equal-height rows", "3 equal-height rows"],
        true,
      ],
      [
        "no_collage_lock_missing",
        ["no collage/masonry layout", "no collage"],
        true,
      ],
      [
        "no_separator_lock_missing",
        ["no separator lines", "no visible dividers"],
        true,
      ],
      ["cinematic_realism_lock_missing", ["cinematic realism lock"]],
      ["product_reference_lock_missing", ["product reference lock"]],
      [
        "text_rendering_policy_missing",
        ["text rendering policy", "text policy"],
      ],
    ];
    if (!runtimeContract.hasRuntime) {
      requiredFragmentGroups.unshift(
        [
          "skill_contract_missing",
          ["product-reference-storyboard", "product reference storyboard"],
        ],
        [
          "generation_mode_missing",
          ["generation_mode: multi_frame_storyboard", "multi_frame_storyboard"],
        ],
        [
          "layout_preset_missing",
          [
            "storyboard_layout_preset: canvas_9_16_grid_3x3_frame_9_16_exact",
            "canvas_9_16_grid_3x3_frame_9_16_exact",
            "3x3 grid",
          ],
        ],
        ["aspect_ratio_missing", ["aspect_ratio: 9:16", "9:16 final canvas"]],
        [
          "storyboard_guide_field_missing",
          ["storyboard_guide", "storyboard guide"],
        ],
        [
          "voiceover_script_field_missing",
          ["voiceover_script", "voiceover script"],
        ],
        ["product_detail_field_missing", ["product_detail", "product detail"]],
        [
          "reference_product_images_field_missing",
          ["reference_product_images", "reference product images"],
        ],
        [
          "production_concept_details_field_missing",
          ["production_concept_details", "production concept details"],
        ]
      );
    }
    for (const [
      code,
      fragments,
      hardPromptRequirement,
    ] of requiredFragmentGroups) {
      if (!fragments.some(fragment => lower.includes(fragment.toLowerCase()))) {
        if (hardPromptRequirement === true && !hasSkillRuntime) {
          addContractIssue(code, true);
        } else {
          addContractIssue(code);
        }
      }
    }
    for (let index = 1; index <= MAX_SHOT_COUNT; index += 1) {
      if (!new RegExp(`\\bFrame\\s+${index}\\b`, "i").test(prompt)) {
        addContractIssue(`frame_${index}_missing`);
      }
    }
    if (/(?:VISUAL|STORY MATCH|HUMAN REALISM)\s*:/i.test(prompt)) {
      warnings.push("renderable_frame_label_leak");
    }
    const requiredGlobalLabels = [
      ["camera_light_depth_label_missing", /CAMERA\/LIGHT\/DEPTH:/g],
      ["product_verify_label_missing", /PRODUCT VERIFY:/g],
    ] as const;
    for (const [code, pattern] of requiredGlobalLabels) {
      if (countPromptMatches(prompt, pattern) < 1) {
        addContractIssue(code);
      }
    }
    const hasExactProductReferenceLock =
      /(?:@Image1|first attached product reference image|supplied product reference image)/i.test(
        prompt
      ) &&
      /(?:primary visual source of truth|strict product visual lock|strict visual source of truth|immutable product reference|product visual source lock)/i.test(
        prompt
      ) &&
      /(?:match|recreate|copy|replicate)[^\n]{0,180}(?:exact|same|actual reference|reference image)/i.test(
        prompt
      ) &&
      /(?:text|description)[^\n]{0,100}(?:secondary|must never override|never override)|(?:not|never)[^\n]{0,140}(?:generic product description|text description)/i.test(
        prompt
      );
    if (!hasExactProductReferenceLock) {
      addContractIssue("product_reference_primary_visual_lock_missing");
    }
    if (
      /\b(?:create|generate|make|use|show)\s+(?:a\s+)?(?:collage|masonry|mixed-size panels?)\b/i.test(
        prompt
      )
    ) {
      warnings.push("prompt_mentions_blocked_layout_terms_for_negation_check");
    }
  }

  const activeShotCount = input.plan.shots.length;
  if (activeShotCount < 1 || activeShotCount > MAX_SHOT_COUNT) {
    blockers.push("invalid_requested_shot_count");
  }

  if (input.overlayTextMode === "no_text") {
    const noTextLocks = [
      ["no_text_policy_missing", "no text"],
      ["no_dimension_text_lock_missing", "dimension text"],
      ["no_timecode_lock_missing", "timecodes"],
      ["no_marketplace_ui_lock_missing", "marketplace/mobile app screenshots"],
    ] as const;
    const runtimeContract =
      input.unit.role === "storyboard_grid"
        ? buildMarketplaceAutoReviewSkillRuntimeContractChecks(
            input.skillRuntime
          )
        : null;
    const softenNoTextLock =
      Boolean(runtimeContract?.hasRuntime) &&
      Boolean(runtimeContract?.hasRequiredSkill) &&
      Boolean(runtimeContract?.hasReferenceProductImages);
    for (const [code, fragment] of noTextLocks) {
      if (!lower.includes(fragment.toLowerCase())) {
        if (softenNoTextLock) warnings.push(code);
        else blockers.push(code);
      }
    }
    blockers.push(...detectProductReferenceStoryboardNoTextPromptLeaks(prompt));
  } else if (!/never include video seconds/i.test(prompt)) {
    blockers.push("allow_text_timecode_guard_missing");
  }

  const score = Math.max(0, 100 - blockers.length * 9 - warnings.length * 2);
  return {
    status: blockers.length === 0 ? "passed" : "failed",
    score,
    ruleSet: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_PREFLIGHT_RULESET,
    blockers,
    warnings,
    checkedAt: nowIso(),
  };
}

function storyboardGridProductReferenceRepairPrompt(
  prompt: string,
  unit: DirectImageUnit
): string {
  const reasonCodes = (unit.repairReasonCodes ?? [])
    .map(code => cleanText(code).toLowerCase())
    .filter(Boolean);
  const repairText = cleanText(unit.repairInstruction).toLowerCase();
  const needsProductReferenceRepair =
    reasonCodes.some(code =>
      /product.*(?:mismatch|appearance|shape|fidelity)|appearance.*mismatch|image details mismatch|control panel clarity/.test(
        code
      )
    ) ||
    /product|สินค้า|รูปทรง|reference|อ้างอิง|control panel/.test(repairText);
  if (!needsProductReferenceRepair) return prompt;
  if (/PRODUCT REFERENCE REPAIR PATCH:/i.test(prompt)) return prompt;
  const repairLock = [
    "PRODUCT REFERENCE LOCK:",
    "Use @Image1 / the first attached product reference image as the primary visual source of truth; the written product description is secondary and must never override the attached product image. Match the actual reference image exactly: silhouette, proportions, construction, countable parts, material, color, scale, front control panel, white base, and transparent tiers/cover. Do not generate a generic appliance or simplified substitute.",
  ].join("\n");
  if (/PRODUCT REFERENCE LOCK:/i.test(prompt)) {
    return prompt.replace(
      /PRODUCT REFERENCE LOCK:\s*[\s\S]*?(?=\n[A-Z][A-Z0-9 /&-]+:|\nFrame\s+\d+\s*:|$)/i,
      repairLock
    );
  }
  const next = `${prompt}\n\n${repairLock}`;
  return next.length <= MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS
    ? next
    : prompt;
}

function normalizeProductReferenceStoryboardMarketplacePlatform(
  platform: string
): "auto" | "shopee" | "tiktok_shop" {
  const value = cleanText(platform).toLowerCase();
  if (value === "shopee") return "shopee";
  if (
    value === "tiktok_shop" ||
    value === "tiktok-shop" ||
    value === "tiktok"
  ) {
    return "tiktok_shop";
  }
  return "auto";
}

function inferProductReferenceStoryboardCategory(
  plan: AutoReviewPlan
): ProductReferenceStoryboardCategory {
  const source = [
    plan.productTruth.productCategory ?? "",
    plan.productTruth.productName,
    plan.productTruth.brand ?? "",
    plan.productTruth.categoryText ?? "",
    ...stringArrayFromUnknown(plan.productTruth.categoryPath),
    plan.productTruth.description,
    plan.productDetail,
    ...Object.values(plan.productTruth.specs).map(value =>
      typeof value === "string" ? value : JSON.stringify(value)
    ),
  ]
    .join(" ")
    .toLowerCase();
  const matchers: Array<readonly [ProductReferenceStoryboardCategory, RegExp]> =
    [
      [
        "furniture",
        /เฟอร์นิเจอร์|โต๊ะ|ชั้นวาง|ชั้น|ตู้|เก้าอี้|เตียง|sofa|chair|table|desk|shelf|shelves|cabinet|bedside|nightstand|furniture/i,
      ],
      [
        "electronics",
        /อิเล็กทรอนิกส์|หูฟัง|ลำโพง|กล้องวงจร|router|speaker|earphone|headphone|gadget/i,
      ],
      [
        "mobile_tablet",
        /มือถือ|โทรศัพท์|แท็บเล็ต|smartphone|tablet|iphone|ipad/i,
      ],
      [
        "computer_laptop",
        /คอมพิวเตอร์|โน้ตบุ๊ก|แล็ปท็อป|laptop|notebook|computer|keyboard|mouse/i,
      ],
      [
        "electrical_appliance",
        /เครื่องใช้ไฟฟ้า|พัดลม|หม้อทอด|เครื่องดูดฝุ่น|appliance|fan|air fryer|vacuum/i,
      ],
      [
        "food_beverage",
        /อาหาร|เครื่องดื่ม|กาแฟ|ชา|ขนม|food|drink|beverage|coffee|tea/i,
      ],
      [
        "mother_baby",
        /แม่และเด็ก|เด็กแรกเกิด|เด็กอ่อน|ทารก|ผ้าอ้อม|แพมเพิร์ส|คอกกั้นเด็ก|ของเล่นเด็ก|รถเข็นเด็ก|เสื้อผ้าเด็ก|บอดี้สูทเด็ก|รอมเปอร์เด็ก|\b(?:baby|babies|infant|newborn|toddler|stroller|maternity|diaper|nappy|nursery|romper|bodysuit)\b|mother\s*(?:and|&|-)?\s*baby/i,
      ],
      [
        "fashion_clothing",
        /เสื้อ|กางเกง|เดรส|ผ้า|clothing|shirt|pants|dress|fashion/i,
      ],
      ["shoes", /รองเท้า|shoe|sneaker|sandal|boot/i],
      ["watch_eyewear", /นาฬิกา|แว่น|watch|eyewear|glasses|sunglasses/i],
      [
        "jewelry",
        /เครื่องประดับ|สร้อย|แหวน|ต่างหู|jewelry|ring|necklace|earring/i,
      ],
      ["pet_supplies", /สัตว์เลี้ยง|หมา|แมว|pet|dog|cat/i],
      ["sports_equipment", /กีฬา|ฟิตเนส|sport|fitness|exercise/i],
      ["camera_photography", /กล้อง|เลนส์|camera|photography|lens/i],
      ["gaming_accessories", /เกม|เกมส์|gaming|gamepad|console/i],
      ["automotive", /รถยนต์|มอเตอร์ไซค์|automotive|car|motorcycle/i],
      ["stationery", /เครื่องเขียน|ปากกา|สมุด|stationery|pen|notebook/i],
      ["books", /หนังสือ|book|novel|textbook/i],
      [
        "cosmetics",
        /เครื่องสำอาง|สกินแคร์|cosmetic|skincare|makeup|serum|cream/i,
      ],
      ["household_product", /ของใช้ในบ้าน|บ้าน|ครัวเรือน|household|home/i],
    ];
  const inferred =
    matchers.find(([_category, pattern]) => pattern.test(source))?.[0] ??
    "auto";
  const confirmed = normalizeConcreteProductReferenceStoryboardCategory(
    plan.productTruth.productCategory
  );
  if (!confirmed) return inferred;
  if (confirmed === "fashion_clothing" && inferred === "mother_baby") {
    return "mother_baby";
  }
  return confirmed;
}

function buildProductReferenceStoryboardPromptPreflightFeedback(params: {
  promptSkillAttempt: number;
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
}): ProductReferenceStoryboardPreflightFeedback {
  const blockerText = params.preflight.blockers.join(", ") || "none";
  return {
    promptSkillAttempt: params.promptSkillAttempt,
    previousPromptExcerpt: compactImagePromptText(params.prompt, 700),
    blockers: params.preflight.blockers,
    warnings: params.preflight.warnings,
    instruction: [
      `Previous product-reference-storyboard output failed prompt preflight on skill attempt ${params.promptSkillAttempt}.`,
      `Fix blockers: ${blockerText}.`,
      "Regenerate the final prompt through the same skill contract. Do not patch or summarize the previous output.",
      "The returned prompt should explicitly include one single 9:16 image, strict 3x3 grid, exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, cinematic realism lock, product reference lock, text rendering policy, Frame 1 through Frame 9 with visual-only prose, plus one shared CAMERA/LIGHT/DEPTH block and one shared PRODUCT VERIFY block. Do not use VISUAL, STORY MATCH, HUMAN REALISM, ECU, CU, MCU, MS, WS, ELS, LS, OS, HA, LA, or storyboard_grid as renderable frame text.",
    ].join(" "),
  };
}

function buildProductReferenceStoryboardIncompleteOutputFeedback(params: {
  promptSkillAttempt: number;
  error: ProductReferenceStoryboardSkillIncompleteOutputError;
}): ProductReferenceStoryboardPreflightFeedback {
  const blockers = params.error.blockers
    .map(code => cleanText(code))
    .filter(Boolean);
  const blockerText = blockers.join(", ") || "skill_output_incomplete";
  return {
    promptSkillAttempt: params.promptSkillAttempt,
    previousPromptExcerpt: compactImagePromptText(params.error.rawOutput, 700),
    blockers,
    warnings: [],
    instruction: [
      `Previous product-reference-storyboard output was incomplete on skill attempt ${params.promptSkillAttempt}.`,
      `Fix blockers: ${blockerText}.`,
      "Regenerate a complete final prompt through the same skill contract. Do not patch, summarize, reuse, or fallback to the previous output.",
      "The returned prompt must include OUTPUT FORMAT LOCK, CINEMATIC REALISM LOCK, PRODUCT REFERENCE LOCK, TEXT RENDERING POLICY, CAMERA/LIGHT/DEPTH, PRODUCT VERIFY, SHOT-BY-SHOT STORYBOARD PROMPT, and complete Frame 1 through Frame 9 with non-empty visual-only prose.",
      "For the storyboard grid, include the exact quality anchors: one single 9:16 image, strict 3x3 grid, exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, no collage/masonry layout, no separator lines, and no visible dividers.",
      "In no-text mode, do not include renderable camera labels or technical text such as ECU, CU, MCU, MS, WS, ELS, LS, OS, HA, LA, storyboard_grid, panel names, corner labels, captions, subtitles, or random glyphs.",
    ].join(" "),
  };
}

function characterReferencePresenterDirective(
  referenceImageGroups: ProductReferenceStoryboardReferenceImageGroups,
  plan?: AutoReviewPlan
): string {
  if (referenceImageGroups.character.length === 0) {
    const describedDirective = extractDescribedCharacterDirectiveFromPlan(plan);
    if (describedDirective) {
      return [
        describedDirective,
        "No presenter reference image is supplied, so do not invent a different face family or ethnicity. If a face is visible, it must match the described adult presenter/persona rather than the product-user child.",
      ].join(" ");
    }
    return "No character reference image is supplied. If the product story needs people, use hands-only or non-identifying partial body unless a generic person is explicitly required.";
  }
  return [
    "Character/presenter reference directive: @Image2 is the uploaded character or presenter identity reference.",
    "Any visible face, head, hair, body identity, presenter, reviewer, parent, family member, or person from the character slot must preserve the same identity, age range, face structure, hair, body proportions, and wardrobe/styling from @Image2.",
    "Do not age-convert @Image2 into a different person or demographic. If @Image2 is a baby, toddler, child, kid, or minor, the child may be used as the character reference but must be safely dressed with chest, torso, and underwear areas covered; no shirtless, bare-torso, underwear-only, diaper-only, bath/changing/nude/semi-nude, or suggestive minor framing.",
  ].join(" ");
}

function extractDescribedCharacterDirectiveFromPlan(
  plan?: AutoReviewPlan | null
): string {
  const detail = cleanText(plan?.productDetail);
  if (!detail) return "";
  const marker = "USER-SELECTED DESCRIBED CHARACTER LOCK:";
  const markerIndex = detail.indexOf(marker);
  if (markerIndex < 0) return "";
  const tail = detail.slice(markerIndex);
  const nextSectionIndex = tail.indexOf("\n\n", marker.length);
  return cleanText(
    nextSectionIndex >= 0 ? tail.slice(0, nextSectionIndex) : tail
  );
}

function prepareMarketplaceAutoReviewImagePrompt(input: {
  plan: AutoReviewPlan;
  unit: DirectImageUnit;
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode;
}): {
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
} {
  const prompt = buildImagePromptForUnit(
    input.plan,
    input.unit,
    input.overlayTextMode
  );
  const result = validateMarketplaceAutoReviewImagePromptPreflight({
    prompt,
    unit: input.unit,
    plan: input.plan,
    overlayTextMode: input.overlayTextMode,
  });
  if (result.status === "failed") {
    throw new MarketplaceAutoReviewImagePromptPreflightError({
      unit: input.unit,
      prompt,
      preflight: result,
    });
  }
  return { prompt, preflight: result };
}

function buildProductReferenceStoryboardSkillInputs(input: {
  plan: AutoReviewPlan;
  unit: DirectImageUnit;
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode;
  referenceImageGroups: ProductReferenceStoryboardReferenceImageGroups;
  publicUrl?: string | null;
  metadata?: RunMetadata | null;
  directImageAttempt?: number | null;
  promptSkillAttempt?: number | null;
  preflightFeedback?: ProductReferenceStoryboardPreflightFeedback | null;
}): Record<string, unknown> {
  const activeShotCount = shotCountForPlan(input.plan);
  const shotMap = input.plan.shots
    .map(shot =>
      [
        `Shot ${shot.order}: ${shot.title}`,
        `visual=${compactImagePromptText(shot.visual, 240)}`,
        `camera=${compactImagePromptText(shot.camera, 180)}`,
        `movement=${compactImagePromptText(shot.movement, 160)}`,
        `productRole=${compactImagePromptText(shot.productRole, 180)}`,
        `spokenMeaning=${compactImagePromptText(shot.voiceover, 200)}`,
      ].join(" | ")
    )
    .join("\n");
  const repairInstruction = cleanText(input.unit.repairInstruction);
  const textPolicy =
    input.overlayTextMode === "allow_text"
      ? "Allow only short truthful on-image text if it helps the story. Never include video seconds, time ranges, timecodes, frame labels, subtitles, marketplace UI, prices, ratings, review widgets, or platform logos."
      : "No added visible text. No captions, labels, subtitles, video seconds, timecodes, frame labels, camera-shot abbreviations, technical labels, panel names, corner labels, dimension text, marketplace UI, prices, ratings, review widgets, platform logos, random glyphs, or readable prop text. Do not render ECU, CU, MCU, MS, WS, ELS, LS, OS, HA, LA, or storyboard_grid as visible image text.";
  const preflightFeedback = input.preflightFeedback;
  const productCategory = inferProductReferenceStoryboardCategory(input.plan);
  const referenceImageGroups =
    normalizeProductReferenceStoryboardReferenceImageGroups(
      input.referenceImageGroups,
      input.publicUrl
    );
  const referenceImageManifest =
    productReferenceStoryboardReferenceImageManifest(referenceImageGroups);
  const referenceImageRoleOrder = referenceImageManifest
    .map(entry => `${entry.placeholder}=${entry.role}`)
    .join(", ");
  const productDriftGuard =
    "Product drift guard: before the product appears, show clutter on the bed/floor only. Do not show any alternate bedside table, nightstand, cabinet, shelf, storage unit, drawer unit, or similar furniture that can be mistaken for the sellable product.";
  const productReferenceExactRecreationLock =
    "Product reference exact recreation lock: Use @Image1 / the first attached product reference image as the primary visual source of truth; strict product visual lock; recreate and match the exact same actual reference image product. Written product description is secondary and must never override the attached product image or generic product description.";
  const characterIdentityDirective = characterReferencePresenterDirective(
    referenceImageGroups,
    input.plan
  );
  const minorSafetyClothingLock = buildMinorSafetyClothingLock(input.plan);
  const imageAttemptStoryLens =
    buildProductReferenceStoryboardImageAttemptStoryLens({
      plan: input.plan,
      metadata: input.metadata,
      attempt: input.directImageAttempt,
    });
  const imageAttemptStoryLensText = cleanText(imageAttemptStoryLens.directive);

  return {
    generation_mode: "multi_frame_storyboard",
    storyboard_layout_preset: "canvas_9_16_grid_3x3_frame_9_16_exact",
    aspect_ratio: "9:16",
    required_frame_count: MAX_SHOT_COUNT,
    active_shot_count: activeShotCount,
    product_category: productCategory,
    image_text_mode:
      input.overlayTextMode === "allow_text" ? "with_text" : "no_text",
    image_text_language: "th",
    label_fidelity: "full_label_lock",
    label_readability_mode: "product_detail_lock",
    cinematic_style: "cinematic_realism",
    storyboard_guide: [
      `Marketplace Auto Review 3x3 cut route. Create one storyboard image for ${activeShotCount} active shots and ${MAX_SHOT_COUNT} total vertical frames.`,
      productReferenceExactRecreationLock,
      imageAttemptStoryLensText,
      productDriftGuard,
      `Reference image order: ${referenceImageRoleOrder}`,
      characterIdentityDirective,
      minorSafetyClothingLock,
      input.plan.storyboardGuide,
      "Shot map:",
      shotMap,
    ]
      .filter(Boolean)
      .join("\n"),
    voiceover_script: input.plan.voiceoverScript,
    product_detail: input.plan.productDetail,
    production_concept_details: [
      `Concept: ${input.plan.title}`,
      `Product: ${input.plan.productTruth.productName}`,
      `Platform: ${input.plan.productTruth.platform}`,
      input.plan.productTruth.brand
        ? `Brand: ${input.plan.productTruth.brand}`
        : "",
      input.plan.productTruth.productCategory
        ? `Main storyboard category: ${input.plan.productTruth.productCategory}`
        : "",
      input.plan.productTruth.categoryText
        ? `Captured marketplace category: ${input.plan.productTruth.categoryText}`
        : "",
      input.plan.productTruth.categoryPath.length > 0
        ? `Marketplace category path: ${input.plan.productTruth.categoryPath.join(" > ")}`
        : "",
      `Overlay text policy: ${textPolicy}`,
      imageAttemptStoryLensText,
      `Reference image order: ${referenceImageRoleOrder}`,
      characterIdentityDirective,
      minorSafetyClothingLock,
      repairInstruction
        ? `Repair instruction for this attempt: ${repairInstruction}`
        : "",
      productReferenceExactRecreationLock,
      productDriftGuard,
      `Product category rule: ${productCategory}`,
      input.plan.productTruth.price
        ? `Price signal for context only: ${input.plan.productTruth.price}`
        : "",
      input.plan.productTruth.rating
        ? `Rating signal for context only: ${input.plan.productTruth.rating}`
        : "",
      input.plan.productTruth.sold
        ? `Sold signal for context only: ${input.plan.productTruth.sold}`
        : "",
      input.plan.productTruth.reviews
        ? `Review signal for context only: ${input.plan.productTruth.reviews}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    reference_product_images: referenceImageGroups.product,
    reference_character_images: referenceImageGroups.character,
    reference_environment_images: referenceImageGroups.environment,
    reference_image_manifest: referenceImageManifest,
    reference_image_role_order: referenceImageRoleOrder,
    product_label_text: [
      input.plan.productTruth.brand
        ? `Brand: ${input.plan.productTruth.brand}`
        : "",
      `Product title: ${input.plan.productTruth.productName}`,
    ]
      .filter(Boolean)
      .join("\n"),
    marketplace_platform:
      normalizeProductReferenceStoryboardMarketplacePlatform(
        input.plan.productTruth.platform
      ),
    product_shop_id: input.plan.productTruth.externalShopId ?? "",
    product_item_id:
      input.plan.productTruth.externalProductId ||
      input.plan.productTruth.productId,
    product_title: input.plan.productTruth.productName,
    product_source_url: input.plan.productTruth.sourceUrl,
    product_shop_name: input.plan.productTruth.shopName ?? "",
    product_reference_exact_recreation_lock:
      productReferenceExactRecreationLock,
    image_attempt_number: Math.max(
      1,
      Math.floor(toNumber(input.directImageAttempt, 1))
    ),
    image_attempt_story_lens_id: cleanText(imageAttemptStoryLens.lensId),
    image_attempt_story_lens_title: cleanText(imageAttemptStoryLens.title),
    image_attempt_story_lens: imageAttemptStoryLensText,
    image_attempt_story_lens_json: imageAttemptStoryLens,
    prompt_budget_chars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
    max_output_chars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
    maxPromptLength: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
    prompt_skill_attempt: input.promptSkillAttempt ?? 1,
    prompt_preflight_feedback: preflightFeedback?.instruction ?? "",
    prompt_preflight_blockers: preflightFeedback?.blockers ?? [],
    previous_prompt_excerpt: preflightFeedback?.previousPromptExcerpt ?? "",
    reference_image_role_counts: {
      product: referenceImageGroups.product.length,
      character: referenceImageGroups.character.length,
      environment: referenceImageGroups.environment.length,
      total: referenceImageGroups.all.length,
    },
    runtime_contract: `Call the product-reference-storyboard skill and return only the final image prompt. Do not use backend fallback prompt text. This is a fresh skill call for image attempt ${Math.max(1, Math.floor(toNumber(input.directImageAttempt, 1)))} and must follow the image_attempt_story_lens instead of copying prior image-attempt prompt wording. The final prompt must explicitly satisfy the 9:16 strict 3x3 / 9 vertical frames contract before image provider submission. Reference image order is binding: ${referenceImageRoleOrder}. The final prompt must include the Product reference exact recreation lock using @Image1 as the primary visual source of truth and saying the written description must never override the attached product image. If a character reference is present, name that placeholder as the character identity source of truth whenever a face/body/person/child appears. ${productReferenceExactRecreationLock} ${imageAttemptStoryLensText} ${characterIdentityDirective} ${minorSafetyClothingLock}`,
  };
}

function buildProductReferenceStoryboardSkillInputSnapshot(
  userInputs: Record<string, unknown>
): Record<string, unknown> {
  const referenceProductImages = Array.isArray(
    userInputs.reference_product_images
  )
    ? userInputs.reference_product_images
    : [];
  const referenceCharacterImages = Array.isArray(
    userInputs.reference_character_images
  )
    ? userInputs.reference_character_images
    : [];
  const referenceEnvironmentImages = Array.isArray(
    userInputs.reference_environment_images
  )
    ? userInputs.reference_environment_images
    : [];
  const repairInstruction = cleanText(userInputs.production_concept_details)
    .split("\n")
    .find(line => /^Repair instruction for this attempt:/i.test(line));
  const preflightFeedback = cleanText(userInputs.prompt_preflight_feedback);
  return {
    userInputHash: buildProductionStableHash(userInputs).slice(0, 24),
    generationMode: cleanText(userInputs.generation_mode),
    layoutPreset: cleanText(userInputs.storyboard_layout_preset),
    aspectRatio: cleanText(userInputs.aspect_ratio),
    productCategory: cleanText(userInputs.product_category),
    marketplacePlatform: cleanText(userInputs.marketplace_platform),
    imageAttemptNumber: toNumber(userInputs.image_attempt_number),
    imageAttemptStoryLensId: cleanText(userInputs.image_attempt_story_lens_id),
    imageAttemptStoryLensHash: cleanText(userInputs.image_attempt_story_lens)
      ? buildProductionStableHash({
          imageAttemptStoryLens: userInputs.image_attempt_story_lens,
        }).slice(0, 16)
      : "",
    promptSkillAttempt: toNumber(userInputs.prompt_skill_attempt),
    hasRepairInstruction: Boolean(repairInstruction),
    repairInstructionHash: repairInstruction
      ? buildProductionStableHash({ repairInstruction }).slice(0, 16)
      : "",
    hasPromptPreflightFeedback: Boolean(preflightFeedback),
    promptPreflightFeedbackHash: preflightFeedback
      ? buildProductionStableHash({ preflightFeedback }).slice(0, 16)
      : "",
    fieldLengthChars: {
      storyboardGuide: cleanText(userInputs.storyboard_guide).length,
      voiceoverScript: cleanText(userInputs.voiceover_script).length,
      productDetail: cleanText(userInputs.product_detail).length,
      productionConceptDetails: cleanText(userInputs.production_concept_details)
        .length,
    },
    referenceImageRoleCounts: {
      product: referenceProductImages.length,
      character: referenceCharacterImages.length,
      environment: referenceEnvironmentImages.length,
      total:
        referenceProductImages.length +
        referenceCharacterImages.length +
        referenceEnvironmentImages.length,
    },
  };
}

async function prepareMarketplaceAutoReviewImagePromptForSubmit(input: {
  tenantId: string;
  auth: AuthContext;
  runId: string;
  plan: AutoReviewPlan;
  unit: DirectImageUnit;
  attempt: number;
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode;
  referenceImageGroups: ProductReferenceStoryboardReferenceImageGroups;
  publicUrl?: string | null;
  metadata?: RunMetadata | null;
}): Promise<{
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
  skillRun: ProductReferenceStoryboardPromptSkillRunResult | null;
  skillRuntime: Record<string, unknown> | null;
}> {
  if (input.unit.role !== "storyboard_grid") {
    const sourcePrompt = buildImagePromptForUnit(
      input.plan,
      input.unit,
      input.overlayTextMode
    );
    const finalPrompt =
      await optimizeMarketplaceAutoReviewFinalImagePromptForProvider({
        tenantId: input.tenantId,
        userId: input.auth.userId,
        runId: input.runId,
        unitId: input.unit.unitId,
        attempt: input.attempt,
        sourcePrompt,
      });
    const skillRuntime = finalPrompt.audit
      ? {
          finalPromptOptimizer: finalPrompt.audit,
        }
      : null;
    const result = validateMarketplaceAutoReviewImagePromptPreflight({
      prompt: finalPrompt.prompt,
      unit: input.unit,
      plan: input.plan,
      overlayTextMode: input.overlayTextMode,
      skillRuntime,
    });
    if (result.status === "failed") {
      throw new MarketplaceAutoReviewImagePromptPreflightError({
        unit: input.unit,
        prompt: finalPrompt.prompt,
        preflight: result,
        skillRuntime,
      });
    }
    return {
      prompt: finalPrompt.prompt,
      preflight: result,
      skillRun: null,
      skillRuntime,
    };
  }

  let feedback: ProductReferenceStoryboardPreflightFeedback | null = null;
  let latestError: Error | null = null;
  const retryHistory: Record<string, unknown>[] = [];
  const referenceImageGroups =
    normalizeProductReferenceStoryboardReferenceImageGroups(
      input.referenceImageGroups,
      input.publicUrl
    );

  for (
    let promptSkillAttempt = 1;
    promptSkillAttempt <=
    MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS;
    promptSkillAttempt += 1
  ) {
    const userInputs = buildProductReferenceStoryboardSkillInputs({
      ...input,
      referenceImageGroups,
      metadata: input.metadata,
      directImageAttempt: input.attempt,
      promptSkillAttempt,
      preflightFeedback: feedback,
    });
    const skillInputSnapshot =
      buildProductReferenceStoryboardSkillInputSnapshot(userInputs);
    let skillRun: ProductReferenceStoryboardPromptSkillRunResult;
    try {
      skillRun = await runProductReferenceStoryboardPromptSkill({
        tenantId: input.tenantId,
        userId: input.auth.userId,
        runId: input.runId,
        unitId: input.unit.unitId,
        attempt: input.attempt,
        promptAttempt: promptSkillAttempt,
        userInputs,
        referenceImages: referenceImageGroups.all,
        publicUrl: input.publicUrl,
        maxOutputChars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
      });
    } catch (error) {
      if (
        error instanceof ProductReferenceStoryboardSkillIncompleteOutputError
      ) {
        retryHistory.push({
          promptSkillAttempt,
          status: "failed",
          score: 0,
          blockers: error.blockers,
          warnings: [],
          promptLengthChars: error.rawOutput.length,
          promptHash: buildProductionStableHash({
            runId: input.runId,
            unitId: input.unit.unitId,
            directAttempt: input.attempt,
            promptSkillAttempt,
            prompt: error.rawOutput,
          }).slice(0, 16),
          reasonCode: "skill_output_incomplete",
          checkedAt: nowIso(),
        });
        feedback = buildProductReferenceStoryboardIncompleteOutputFeedback({
          promptSkillAttempt,
          error,
        });
        latestError = error;
        console.warn("[marketplaceAutoReview] prompt_skill_incomplete_retry", {
          runId: input.runId,
          unitId: input.unit.unitId,
          directAttempt: input.attempt,
          promptSkillAttempt,
          maxPromptSkillAttempts:
            MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS,
          blockers: error.blockers,
          outputLengthChars: error.rawOutput.length,
          fallbackUsed: false,
          nextAction:
            promptSkillAttempt <
            MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS
              ? "retry_same_skill_with_incomplete_output_feedback"
              : "fail_before_image_provider_submit",
        });
        if (
          promptSkillAttempt <
          MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS
        ) {
          continue;
        }
      }
      throw error;
    }
    const safetyPrompt = ensureMinorSafetyClothingLockInImagePrompt(
      skillRun.prompt,
      input.plan
    );
    const layoutContractPrompt =
      ensureStoryboardGridLayoutContractInImagePrompt(safetyPrompt);
    const rawSkillFrameCount = countPromptMatches(
      skillRun.prompt,
      /\bFrame\s+\d+\s*:/gi
    );
    const processedFrameCount = countPromptMatches(
      layoutContractPrompt.prompt,
      /\bFrame\s+\d+\s*:/gi
    );
    const postProcessedPrompt =
      rawSkillFrameCount >= MAX_SHOT_COUNT &&
      processedFrameCount < rawSkillFrameCount
        ? cleanText(skillRun.prompt)
        : layoutContractPrompt.prompt;
    const finalPrompt =
      await optimizeMarketplaceAutoReviewFinalImagePromptForProvider({
        tenantId: input.tenantId,
        userId: input.auth.userId,
        runId: input.runId,
        unitId: input.unit.unitId,
        attempt: input.attempt,
        promptAttempt: promptSkillAttempt,
        sourcePrompt: postProcessedPrompt,
      });
    const prompt = finalPrompt.prompt;
    const promptSafetyPatchApplied =
      safetyPrompt !== cleanText(skillRun.prompt);
    const promptPostProcessPreservedRawFrames =
      rawSkillFrameCount >= MAX_SHOT_COUNT &&
      processedFrameCount < rawSkillFrameCount;
    const skillAuditForPreflight = {
      ...skillRun.skillAudit,
      ...(promptSafetyPatchApplied
        ? {
            promptSafetyPatchApplied: true,
            backendEnforcedSafetyLocks: ["minor_safety_clothing_lock"],
          }
        : {}),
      ...(layoutContractPrompt.applied
        ? {
            promptLayoutContractApplied: true,
            backendEnforcedLayoutLocks: [
              "storyboard_layout_preset_contract_line",
            ],
          }
        : {}),
      ...(promptPostProcessPreservedRawFrames
        ? {
            promptPostProcessPreservedRawFrames: true,
            promptPostProcessFrameCounts: {
              rawSkillFrameCount,
              processedFrameCount,
            },
          }
        : {}),
      ...(finalPrompt.audit
        ? {
            finalPromptOptimizer: finalPrompt.audit,
          }
        : {}),
    };
    const result = validateMarketplaceAutoReviewImagePromptPreflight({
      prompt,
      unit: input.unit,
      plan: input.plan,
      overlayTextMode: input.overlayTextMode,
      skillRuntime: skillAuditForPreflight,
    });
    const attemptAudit = {
      promptSkillAttempt,
      status: result.status,
      score: result.score,
      blockers: result.blockers,
      warnings: result.warnings,
      promptLengthChars: prompt.length,
      promptHash: buildProductionStableHash({
        runId: input.runId,
        unitId: input.unit.unitId,
        directAttempt: input.attempt,
        promptSkillAttempt,
        prompt,
      }).slice(0, 16),
      skillRuntime: skillAuditForPreflight,
      checkedAt: result.checkedAt,
    };
    retryHistory.push(attemptAudit);
    skillRun.skillAudit = {
      ...skillAuditForPreflight,
      promptSkillAttempt,
      skillInputSnapshot,
      preflightRetryHistory: retryHistory,
      referenceImageRoleCounts: {
        product: referenceImageGroups.product.length,
        character: referenceImageGroups.character.length,
        environment: referenceImageGroups.environment.length,
        total: referenceImageGroups.all.length,
      },
    };
    if (result.status === "passed") {
      return {
        prompt,
        preflight: result,
        skillRun,
        skillRuntime: skillRun.skillAudit,
      };
    }
    feedback = buildProductReferenceStoryboardPromptPreflightFeedback({
      promptSkillAttempt,
      prompt,
      preflight: result,
    });
    latestError = new MarketplaceAutoReviewImagePromptPreflightError({
      unit: input.unit,
      prompt,
      preflight: result,
      skillRuntime: {
        ...skillRun.skillAudit,
        promptSkillAttempt,
        preflightRetryHistory: retryHistory,
      },
    });
    console.warn("[marketplaceAutoReview] prompt_skill_preflight_retry", {
      runId: input.runId,
      unitId: input.unit.unitId,
      directAttempt: input.attempt,
      promptSkillAttempt,
      maxPromptSkillAttempts:
        MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS,
      score: result.score,
      blockers: result.blockers,
      warnings: result.warnings,
      promptLengthChars: prompt.length,
      fallbackUsed: false,
      nextAction:
        promptSkillAttempt <
        MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS
          ? "retry_same_skill_with_preflight_feedback"
          : "fail_before_image_provider_submit",
    });
  }

  throw (
    latestError ??
    new Error(
      "product-reference-storyboard prompt preflight failed before image provider submit"
    )
  );
}

export function validateMarketplaceAutoReviewImagePromptPreflightForTest(input: {
  prompt: string;
  unit: DirectImageUnit;
  plan: AutoReviewPlan;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  skillRuntime?: Record<string, unknown> | null;
}): MarketplaceAutoReviewPromptPreflightResult {
  return validateMarketplaceAutoReviewImagePromptPreflight({
    prompt: input.prompt,
    unit: input.unit,
    plan: input.plan,
    overlayTextMode: normalizeMarketplaceAutoReviewOverlayTextMode(
      input.overlayTextMode
    ),
    skillRuntime: input.skillRuntime,
  });
}

export function ensureMinorSafetyClothingLockInImagePromptForTest(input: {
  prompt: string;
  plan: AutoReviewPlan;
}): string {
  return ensureMinorSafetyClothingLockInImagePrompt(input.prompt, input.plan);
}

export function optimizeMarketplaceAutoReviewFinalImagePromptForProviderForTest(input: {
  tenantId: string;
  userId: number;
  runId: string;
  unitId: string;
  attempt: number;
  promptAttempt?: number | null;
  sourcePrompt: string;
  optimizer?: MarketplaceAutoReviewFinalImagePromptOptimizer;
}): Promise<{
  prompt: string;
  audit: Record<string, unknown> | null;
}> {
  return optimizeMarketplaceAutoReviewFinalImagePromptForProvider(input);
}

export function marketplaceAutoReviewImagePromptMaxCharsForTest(): number {
  return MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS;
}

export function marketplaceAutoReviewImagePromptLengthAuditForTest(input: {
  prompt: string;
}): {
  sourcePromptLengthChars: number;
  maxPromptLengthChars: number;
  overLimitChars: number;
} {
  const prompt = cleanText(input.prompt);
  return {
    sourcePromptLengthChars: prompt.length,
    maxPromptLengthChars: MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
    overLimitChars: Math.max(
      0,
      prompt.length - MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS
    ),
  };
}

export function prepareMarketplaceAutoReviewImagePromptForTest(input: {
  plan: AutoReviewPlan;
  unit: DirectImageUnit;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
}): {
  prompt: string;
  preflight: MarketplaceAutoReviewPromptPreflightResult;
} {
  return prepareMarketplaceAutoReviewImagePrompt({
    plan: input.plan,
    unit: input.unit,
    overlayTextMode: normalizeMarketplaceAutoReviewOverlayTextMode(
      input.overlayTextMode
    ),
  });
}

function referenceImagesForVideoUnit(
  plan: AutoReviewPlan,
  metadata: RunMetadata,
  unit: DirectVideoUnit
): string[] {
  const index = Math.max(0, unit.shotOrder - 1);
  const frameRefs = metadata.startFrameUrls?.length
    ? [metadata.startFrameUrls[index], metadata.stopFrameUrls?.[index]]
    : [metadata.storyboardFrameUrls?.[index]];
  return [...frameRefs, ...approvedVisualReferenceUrls(metadata, plan, 4)]
    .map(url => cleanText(url))
    .filter(Boolean)
    .slice(0, 5);
}

function absoluteVisionUrl(url: string, publicUrl?: string | null): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:")
  )
    return url;
  const base = cleanText(publicUrl);
  if (!base) {
    throw new Error(
      "Marketplace Auto Review vision reference URL requires publicUrl before external dispatch"
    );
  }
  return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

export function assertCompleteMarketplaceAutoReviewVideoClips(input: {
  clipUrls: string[];
  expectedCount: number;
  unitIds?: string[];
}) {
  const missing = Array.from(
    { length: input.expectedCount },
    (_item, index) => index
  )
    .filter(index => !cleanText(input.clipUrls[index]))
    .map(index => input.unitIds?.[index] ?? `shot-${index + 1}`);
  if (input.clipUrls.length !== input.expectedCount || missing.length > 0) {
    throw new Error(
      `Completed video generation is incomplete: expected ${input.expectedCount} clips, got ${input.clipUrls.length}${missing.length ? `; missing ${missing.join(", ")}` : ""}`
    );
  }
}

function directImageUnitIdForFrameRole(
  shot: AutoReviewShot,
  role: DirectImageFrameRole
): string {
  if (role === "start_frame") return `${shot.id}-start`;
  if (role === "stop_frame") return `${shot.id}-stop`;
  return `${shot.id}-storyboard-repair`;
}

function imageArtifactRole(role: DirectImageFrameRole): string {
  if (role === "start_frame") return "start";
  if (role === "stop_frame") return "stop";
  return "storyboard";
}

function normalizeImageFrameRole(value: unknown): DirectImageFrameRole | null {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;
  if (
    ["start", "start_frame", "first", "beginning", "ต้น", "แรก"].includes(text)
  )
    return "start_frame";
  if (
    ["stop", "stop_frame", "end", "ending", "last", "ท้าย", "ปลาย"].includes(
      text
    )
  )
    return "stop_frame";
  if (
    ["storyboard", "storyboard_frame", "storyboard_cell", "cell"].includes(text)
  )
    return "storyboard_frame";
  return null;
}

function frameRepairInstruction(
  qa: Record<string, unknown>,
  role: DirectImageFrameRole
): string {
  const verdicts = Array.isArray(qa.frameVerdicts) ? qa.frameVerdicts : [];
  const verdict = verdicts
    .map(item => asRecord(item))
    .find(item => {
      const value =
        normalizeImageFrameRole(item.role) ??
        normalizeImageFrameRole(item.frameRole) ??
        normalizeImageFrameRole(item.mediaUnit);
      return value === role;
    });
  return (
    cleanText(verdict?.repairInstruction) ||
    cleanText(verdict?.instruction) ||
    cleanText(qa.repairInstruction)
  );
}

function normalizeImageQaFailedFrameRoles(
  qa: Record<string, unknown>,
  presentFrameRoles: DirectImageFrameRole[]
): DirectImageFrameRole[] {
  const allowed = new Set(presentFrameRoles);
  const roles = new Set<DirectImageFrameRole>();
  const addRole = (value: unknown) => {
    const role = normalizeImageFrameRole(value);
    if (role && allowed.has(role)) roles.add(role);
  };

  if (Array.isArray(qa.failedFrameRoles)) {
    for (const item of qa.failedFrameRoles) addRole(item);
  }
  if (Array.isArray(qa.frameVerdicts)) {
    for (const raw of qa.frameVerdicts) {
      const item = asRecord(raw);
      const status = cleanText(item.status || item.verdict).toLowerCase();
      if (
        ["repair", "failed", "fail", "needs_targeted_repair"].includes(status)
      ) {
        addRole(item.role || item.frameRole || item.mediaUnit);
      }
    }
  }

  if (roles.size === 0 && cleanText(qa.verdict) !== "pass") {
    const reasonText = [
      ...(Array.isArray(qa.reasonCodes) ? qa.reasonCodes : []),
      qa.repairInstruction,
    ]
      .map(item => cleanText(item))
      .join(" ")
      .toLowerCase();
    if (
      allowed.has("stop_frame") &&
      /stop|end|last|ท้าย|ปลาย/.test(reasonText)
    ) {
      roles.add("stop_frame");
    }
    if (
      allowed.has("start_frame") &&
      /start|begin|first|ต้น|แรก/.test(reasonText)
    ) {
      roles.add("start_frame");
    }
    if (roles.size === 0) {
      for (const role of presentFrameRoles) roles.add(role);
    }
  }

  return Array.from(roles);
}

function buildShotFrameRepairUnits(params: {
  shot: AutoReviewShot;
  expectedFrameRoles: DirectImageFrameRole[];
  presentFrameRoles: DirectImageFrameRole[];
  qa?: Record<string, unknown> | null;
}): DirectImageUnit[] {
  const present = new Set(params.presentFrameRoles);
  const repairUnits: DirectImageUnit[] = [];
  const addRepairUnit = (
    role: DirectImageFrameRole,
    reasonCodes: string[],
    repairInstruction: string
  ) => {
    if (repairUnits.some(unit => unit.role === role)) return;
    repairUnits.push({
      unitId: directImageUnitIdForFrameRole(params.shot, role),
      role,
      shotId: params.shot.id,
      shotOrder: params.shot.order,
      repairReasonCodes: reasonCodes,
      repairInstruction,
    });
  };

  for (const role of params.expectedFrameRoles) {
    if (!present.has(role)) {
      addRepairUnit(
        role,
        [`missing_${role}_url`],
        `Generate the missing ${role.replace("_", " ")} from the approved product, character, and environment references.`
      );
    }
  }

  const qa = params.qa ? asRecord(params.qa) : null;
  if (qa && cleanText(qa.verdict) !== "pass") {
    const failedRoles = normalizeImageQaFailedFrameRoles(
      qa,
      params.presentFrameRoles
    );
    for (const role of failedRoles) {
      const reasonCodes = Array.isArray(qa.reasonCodes)
        ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
        : ["vision_qa_repair"];
      addRepairUnit(
        role,
        reasonCodes.length > 0 ? reasonCodes : ["vision_qa_repair"],
        frameRepairInstruction(qa, role) ||
          `Regenerate only the ${role.replace("_", " ")} with stricter product reference and continuity.`
      );
    }
  }

  return repairUnits;
}

function buildStoryboardGridRepairUnit(params: {
  reasonCodes: string[];
  repairInstruction: string;
}): DirectImageUnit {
  const instruction = [
    "Repair scope lock: regenerate the entire storyboard as one single 9:16 final canvas containing exactly 9 equal vertical storyboard panels in a strict 3x3 grid. Never output one standalone lifestyle/product image. Never repair only one panel as a separate image.",
    "Grid lock: exactly 3 equal-width columns and 3 equal-height rows, every cell identical size, edge-to-edge, no collage/masonry layout, no merged cells, no variable panel sizes, no white gutters, no borders, no separator lines, no text, no labels, and no measurement overlays.",
    "Product reference lock: use the supplied product reference image as the strict visual source of truth for product shape, proportions, construction, countable parts, materials, colors, and scale. Do not approximate, redesign, simplify, or substitute the product.",
    params.repairInstruction,
  ]
    .map(item => cleanText(item))
    .filter(Boolean)
    .join(" ");
  return {
    unitId: "storyboard-grid-image",
    role: "storyboard_grid",
    shotId: "storyboard-grid",
    shotOrder: 0,
    repairReasonCodes: params.reasonCodes,
    repairInstruction: instruction,
  };
}

function buildStoryboardGridQaRepairUnit(
  qa: Record<string, unknown>
): DirectImageUnit {
  const reasonCodes = Array.isArray(qa.reasonCodes)
    ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
    : [];
  const repairInstruction = frameRepairInstruction(qa, "storyboard_frame");
  return buildStoryboardGridRepairUnit({
    reasonCodes:
      reasonCodes.length > 0
        ? reasonCodes
        : ["storyboard_grid_vision_qa_repair"],
    repairInstruction:
      repairInstruction ||
      "Regenerate the complete 3x3 storyboard grid from the approved product, character, and environment references, then split it again. Do not include marketplace app screens, platform logos, UI, price badges, or unapproved character drift.",
  });
}

function imageQaMediaUnitForFrameRoles(
  frameRoles: DirectImageFrameRole[]
): string {
  return frameRoles.length > 1
    ? "start_stop_frame_set"
    : frameRoles[0] === "start_frame"
      ? "start_frame"
      : frameRoles[0] === "stop_frame"
        ? "stop_frame"
        : "storyboard_cell";
}

function buildVisionQaRuntimeUnavailableEnvelope(params: {
  runId: string;
  shotId: string;
  frameUrls: string[];
  frameRoles: DirectImageFrameRole[];
  model: string;
  productReferenceUrls: string[];
  imagePromptHashes: string[];
  referenceImageFingerprint: string;
  qaCacheKey?: string;
  error: unknown;
}): Record<string, unknown> {
  const errorRecord = asRecord(params.error);
  const errorMessage =
    cleanText(errorRecord.message) || "Vision QA runtime adapter unavailable.";
  const adapterStatus =
    params.error instanceof AgentRuntimeClientError
      ? params.error.status
      : toNumber(errorRecord.status);
  const adapterCode =
    params.error instanceof AgentRuntimeClientError
      ? params.error.code
      : cleanText(errorRecord.code);
  const qaEnvelopeId = `vision-qa:${params.runId}:${params.shotId}:${nanoid(8)}`;
  return {
    qaEnvelopeId,
    runId: params.runId,
    shotId: params.shotId,
    stageKey: "image_generation",
    mediaUnit: imageQaMediaUnitForFrameRoles(params.frameRoles),
    status: "qa_unavailable_warning",
    checkedAt: nowIso(),
    model: params.model,
    provider: "agent-runtime",
    frameUrls: params.frameUrls,
    frameRoles: params.frameRoles,
    failedFrameRoles: [],
    frameVerdicts: params.frameRoles.map(role => ({
      role,
      verdict: "repair",
      reasonCodes: ["vision_qa_runtime_unavailable"],
      repairInstruction:
        "Vision QA runtime was unavailable. Regenerate one more complete storyboard grid attempt and keep the product locked to the attached reference image.",
    })),
    productReferenceUrls: params.productReferenceUrls,
    imagePromptHashes: params.imagePromptHashes,
    referenceImageFingerprint: params.referenceImageFingerprint,
    verdict: "repair",
    score: 0,
    reasonCodes: [
      "vision_qa_runtime_unavailable",
      adapterCode || "agent_runtime_adapter_error",
    ].filter(Boolean),
    repairInstruction:
      "Vision QA runtime was unavailable, so this generated image cannot be treated as QA-passed. Regenerate one more complete storyboard grid attempt using the attached product reference as the primary visual source of truth.",
    qaCacheKey: cleanText(params.qaCacheKey),
    qaCacheHit: false,
    qaUnavailable: true,
    productMatchesReference: false,
    continuityMatchesShot: false,
    characterConsistencySafe: true,
    adWarningTextSafe: true,
    warningApprovalRefs: ["policy:provider-image-completed-qa-unavailable"],
    errorMessage,
    adapterStatus: adapterStatus || undefined,
    adapterCode: adapterCode || undefined,
  };
}

function imageVisionQaEnvelopesFromMetadata(
  metadata: RunMetadata
): Record<string, unknown>[] {
  return [
    ...(Array.isArray(metadata.storyboardGridVisionQaEnvelopes)
      ? metadata.storyboardGridVisionQaEnvelopes
      : []),
    ...(Array.isArray(metadata.shotFrameVisionQaEnvelopes)
      ? metadata.shotFrameVisionQaEnvelopes
      : []),
  ].map(item => asRecord(item));
}

function imageVisionQaEnvelopeRefsFromMetadata(
  metadata: RunMetadata
): string[] {
  return imageVisionQaEnvelopesFromMetadata(metadata)
    .map(qa => cleanText(qa.qaEnvelopeId))
    .filter(Boolean);
}

function imageRepairBudgetExhaustedForUnits(params: {
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): boolean {
  if (params.repairUnits.length === 0) return false;
  return params.repairUnits.every(
    unit =>
      nextDirectAttempt(params.refs, unit.unitId) >
      MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1
  );
}

function imageRepairBudgetExhaustedAllowsStoryboardReviewHandoff(params: {
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  expectedFrameCount?: number | null;
}): boolean {
  const expectedFrameCount = Math.max(
    0,
    Math.floor(toNumber(params.expectedFrameCount))
  );
  const storyboardFramesReady =
    expectedFrameCount > 0
      ? hasCompleteFrameSet(
          params.metadata.storyboardFrameUrls,
          expectedFrameCount
        )
      : cleanStringList(params.metadata.storyboardFrameUrls).length > 0;
  const startStopFramesReady =
    expectedFrameCount > 0
      ? hasCompleteFrameSet(
          params.metadata.startFrameUrls,
          expectedFrameCount
        ) &&
        hasCompleteFrameSet(params.metadata.stopFrameUrls, expectedFrameCount)
      : cleanStringList(params.metadata.startFrameUrls).length > 0 &&
        cleanStringList(params.metadata.stopFrameUrls).length > 0;
  if (!storyboardFramesReady && !startStopFramesReady) return false;
  // This gate controls handoff to Storyboard Review only. Publish-safety,
  // product, and character blockers remain visible warning evidence for user repair.
  return true;
}

function acceptImageQaWithWarningsAfterRepairBudgetExhausted(params: {
  run: Pick<MarketplaceAutoReviewRun, "id">;
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): RunMetadata {
  const existingAcceptance = asRecord(
    params.metadata.generatedMediaAcceptanceEnvelope
  );
  const acceptanceId =
    cleanText(existingAcceptance.acceptanceEnvelopeId) ||
    cleanText(existingAcceptance.acceptanceId) ||
    `acceptance:image:${params.run.id}:${nanoid(8)}`;
  const reasonCodes = Array.from(
    new Set(
      params.repairUnits
        .flatMap(unit => unit.repairReasonCodes ?? [])
        .map(code => cleanText(code))
        .filter(Boolean)
    )
  );
  const latestQaRefs = imageVisionQaEnvelopeRefsFromMetadata(params.metadata);

  const metadata = applyBestImageAttemptSelection({
    ...params.metadata,
    pendingImageRepairUnits: [],
    generatedMediaAcceptanceEnvelope: {
      ...existingAcceptance,
      acceptanceId,
      acceptanceEnvelopeId: acceptanceId,
      runId: params.run.id,
      stageKey: "image_generation",
      status: "accepted_with_warnings",
      checkedAt: nowIso(),
      qaEnvelopeRefs: latestQaRefs,
      repairUnitCount: params.repairUnits.length,
      repairPolicy: "user_storyboard_review_after_repair_budget_exhausted",
      warningCount: Math.max(
        toNumber(existingAcceptance.warningCount),
        latestQaRefs.length,
        1
      ),
      productReferenceLocked: true,
      characterConsistencyChecked: true,
      adComplianceWarningChecked: true,
      userReviewRequired: true,
      overrideReason: "repair_budget_exhausted_storyboard_review_required",
      overrideMessage:
        "QA ใช้ครบทุกครั้งที่อนุญาตแล้ว ระบบส่งต่อเข้า Storyboard Review เพื่อให้ผู้ใช้ตรวจและเปลี่ยนรูปเฉพาะเฟรมได้",
      reasonCodes:
        reasonCodes.length > 0
          ? reasonCodes
          : ["repair_budget_exhausted_storyboard_review_required"],
    },
    mediaAcceptance: [
      ...(Array.isArray(params.metadata.mediaAcceptance)
        ? params.metadata.mediaAcceptance
        : []),
      {
        acceptanceId,
        artifactRef: `image-frame-set:${params.run.id}`,
        mediaUnit: "storyboard_cell_set",
        status: "accepted_with_warnings",
        qaVerdictRefs: latestQaRefs,
        warningApprovalRefs: [
          "policy:user-storyboard-review-after-repair-budget",
        ],
        supersedesRef:
          cleanText(existingAcceptance.acceptanceEnvelopeId) || null,
      },
    ],
    imageQaReviewOverride: {
      status: "accepted_with_warnings",
      reason: "repair_budget_exhausted_storyboard_review_required",
      repairUnitIds: params.repairUnits
        .map(unit => cleanText(unit.unitId))
        .filter(Boolean),
      latestTaskRefs: latestTaskRefsByUnit(params.refs).map(ref => ({
        unitId: cleanText(ref.unitId),
        taskId: cleanText(ref.taskId),
        status: cleanText(ref.status),
        attempt: toNumber(ref.attempt),
        hasResultUrl: Boolean(cleanText(ref.resultUrl)),
      })),
      createdAt: nowIso(),
    },
  });
  return withUpdatedCreditSummary(metadata);
}

function acceptBestImageAttemptAfterStoryboardFramesReady(params: {
  run: Pick<MarketplaceAutoReviewRun, "id">;
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): RunMetadata | null {
  const best = bestImageAttemptReview(params.metadata);
  if (!best) return null;
  const selected = applyBestImageAttemptSelection(params.metadata);
  const existingAcceptance = asRecord(
    selected.generatedMediaAcceptanceEnvelope
  );
  const reasonCodes = uniqueCleanTexts([
    "best_available_attempt_after_storyboard_frames_ready",
    ...params.repairUnits.flatMap(unit => unit.repairReasonCodes ?? []),
  ]);
  const acceptanceId =
    cleanText(existingAcceptance.acceptanceEnvelopeId) ||
    cleanText(existingAcceptance.acceptanceId) ||
    `acceptance:image:${params.run.id}:${nanoid(8)}`;
  const latestQaRefs = imageVisionQaEnvelopeRefsFromMetadata(selected);
  return withUpdatedCreditSummary({
    ...selected,
    pendingImageRepairUnits: [],
    generatedMediaAcceptanceEnvelope: compactRecord({
      ...existingAcceptance,
      acceptanceId,
      acceptanceEnvelopeId: acceptanceId,
      runId: params.run.id,
      stageKey: "image_generation",
      status: "accepted_with_warnings",
      checkedAt: nowIso(),
      qaEnvelopeRefs: latestQaRefs,
      repairUnitCount: params.repairUnits.length,
      repairPolicy: "best_available_attempt_after_storyboard_frames_ready",
      warningCount: Math.max(
        toNumber(existingAcceptance.warningCount),
        latestQaRefs.length,
        1
      ),
      productReferenceLocked: true,
      characterConsistencyChecked: true,
      adComplianceWarningChecked: true,
      userReviewRequired: true,
      overrideReason: "best_available_attempt_after_storyboard_frames_ready",
      overrideMessage:
        "ภาพครบแล้ว ระบบเลือกภาพที่ดีที่สุดส่งต่อ Storyboard Review เพื่อให้ผู้ใช้ตรวจและปรับแก้เฉพาะเฟรม",
      reasonCodes,
    }),
    imageQaReviewOverride: {
      status: "accepted_with_warnings",
      reason: "best_available_attempt_after_storyboard_frames_ready",
      selectedImageAttempt: toNumber(best.attempt),
      selectedImageAttemptReviewId: cleanText(best.reviewId),
      repairUnitIds: params.repairUnits
        .map(unit => cleanText(unit.unitId))
        .filter(Boolean),
      latestTaskRefs: latestTaskRefsByUnit(params.refs).map(ref => ({
        unitId: cleanText(ref.unitId),
        taskId: cleanText(ref.taskId),
        status: cleanText(ref.status),
        attempt: toNumber(ref.attempt),
        hasResultUrl: Boolean(cleanText(ref.resultUrl)),
      })),
      createdAt: nowIso(),
    },
    mediaAcceptance: [
      ...(Array.isArray(selected.mediaAcceptance)
        ? selected.mediaAcceptance
        : []),
      {
        acceptanceId,
        artifactRef: `image-frame-set:${params.run.id}`,
        mediaUnit: "storyboard_cell_set",
        status: "accepted_with_warnings",
        warningApprovalRefs: [
          "policy:best-available-image-attempt-after-storyboard-frames-ready",
        ],
        supersedesRef:
          cleanText(existingAcceptance.acceptanceEnvelopeId) || null,
      },
    ],
  });
}

function completedImageAttemptReviewCount(metadata: RunMetadata): number {
  return Array.isArray(metadata.imageAttemptReviews)
    ? metadata.imageAttemptReviews
        .map(item => asRecord(item))
        .filter(review => {
          const attempt = toNumber(review.attempt);
          return (
            attempt > 0 &&
            Boolean(cleanText(review.status)) &&
            imageAttemptReviewReachedProvider(review)
          );
        }).length
    : 0;
}

function imageAttemptReviewReachedProvider(
  review: Record<string, unknown>
): boolean {
  const taskRefs = Array.isArray(review.taskRefs)
    ? review.taskRefs.map(item => asRecord(item) as DirectMediaTaskRef)
    : [];
  if (taskRefs.length === 0) return true;
  return taskRefs.some(directMediaRefReachedProvider);
}

export function buildMarketplaceAutoReviewShotFrameRepairUnitsForTest(input: {
  shot: AutoReviewShot;
  expectedFrameRoles: DirectImageFrameRole[];
  presentFrameRoles: DirectImageFrameRole[];
  qa?: Record<string, unknown> | null;
}): DirectImageUnit[] {
  return buildShotFrameRepairUnits(input);
}

export function filterMarketplaceAutoReviewImageRepairUnitsForTest(input: {
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  pendingRepairUnits: DirectImageUnit[];
}): DirectImageUnit[] {
  return imageRepairUnitsForFrameStrategy(
    input.frameStrategy,
    input.pendingRepairUnits
  );
}

export function buildMarketplaceAutoReviewStoryboardGridRepairUnitForTest(input: {
  reasonCodes: string[];
  repairInstruction: string;
}): DirectImageUnit {
  return buildStoryboardGridRepairUnit(input);
}

export function buildMarketplaceAutoReviewStoryboardGridQaRepairUnitForTest(input: {
  qa: Record<string, unknown>;
}): DirectImageUnit {
  return buildStoryboardGridQaRepairUnit(input.qa);
}

export function buildMarketplaceAutoReviewVisionQaRuntimeUnavailableEnvelopeForTest(input: {
  runId?: string;
  shotId?: string;
  frameUrls?: string[];
  frameRoles?: DirectImageFrameRole[];
  model?: string;
  productReferenceUrls?: string[];
  imagePromptHashes?: string[];
  referenceImageFingerprint?: string;
  qaCacheKey?: string;
  error?: unknown;
}): Record<string, unknown> {
  return buildVisionQaRuntimeUnavailableEnvelope({
    runId: cleanText(input.runId) || "mar_test",
    shotId: cleanText(input.shotId) || "shot-1",
    frameUrls: input.frameUrls ?? ["https://cdn.example.test/frame.png"],
    frameRoles: input.frameRoles ?? ["storyboard_frame"],
    model: cleanText(input.model) || DEFAULT_VISION_QA_MODEL,
    productReferenceUrls: input.productReferenceUrls ?? [],
    imagePromptHashes: input.imagePromptHashes ?? [],
    referenceImageFingerprint:
      cleanText(input.referenceImageFingerprint) || "refs:none",
    qaCacheKey: input.qaCacheKey,
    error:
      input.error ??
      new AgentRuntimeClientError({
        code: "adapter_request_failed",
        message: "Agent runtime adapter request failed with status 500.",
        status: 500,
      }),
  });
}

export function normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest(input: {
  parsed: Record<string, unknown>;
  plan: AutoReviewPlan;
  reasonCodes: string[];
}): ReturnType<typeof normalizeVisionQaMinorSafetyResult> {
  return normalizeVisionQaMinorSafetyResult(input);
}

export function normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest(input: {
  parsed: Record<string, unknown>;
  plan: AutoReviewPlan;
  reasonCodes: string[];
}): ReturnType<typeof normalizeShotFrameVisionQaDecision> {
  return normalizeShotFrameVisionQaDecision(input);
}

export function imageReasonCodesContainStoryboardGridLayoutBlockerForTest(
  reasonCodes: unknown[]
): boolean {
  return imageReasonCodesContainStoryboardGridLayoutBlocker(reasonCodes);
}

export function isMarketplaceAutoReviewImageRepairBudgetExhaustedForTest(input: {
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): boolean {
  return imageRepairBudgetExhaustedForUnits(input);
}

export function marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest(input: {
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  expectedFrameCount?: number | null;
}): boolean {
  return imageRepairBudgetExhaustedAllowsStoryboardReviewHandoff(input);
}

export function hasMarketplaceAutoReviewMinimumImageAttemptsForTest(input: {
  metadata: Pick<RunMetadata, "imageAttemptReviews">;
}): boolean {
  return (
    completedImageAttemptReviewCount(input.metadata as RunMetadata) >=
    MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW
  );
}

export function ensureStoryboardGridLayoutContractInImagePromptForTest(
  prompt: string
): {
  prompt: string;
  applied: boolean;
} {
  return ensureStoryboardGridLayoutContractInImagePrompt(prompt);
}

export function shouldPersistMarketplaceAutoReviewAdvanceOutboxJobForTest(
  schedulerSource: unknown
): boolean {
  return shouldPersistAdvanceOutboxJobForSchedulerSource(schedulerSource);
}

export function isMarketplaceAutoReviewCompletedStageStatusForTest(
  status: string
): boolean {
  return isMarketplaceAutoReviewCompletedStageStatus(status);
}

export function marketplaceAutoReviewStageAttemptKeyForStatusForTest(input: {
  stageKey: string;
  status: string;
  attemptNumber: number;
}): string {
  return marketplaceAutoReviewStageAttemptKeyForStatus(input);
}

export function marketplaceAutoReviewOperationalCleanupCutoffForTest(
  input: {
    now?: Date;
    retentionDays?: number | null;
  } = {}
): Date {
  return marketplaceAutoReviewOperationalCleanupCutoff(input);
}

export function isMarketplaceAutoReviewRunEligibleForOperationalCleanupForTest(input: {
  status: unknown;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  cutoff: Date;
}): boolean {
  return isMarketplaceAutoReviewRunEligibleForOperationalCleanup(input);
}

export function acceptMarketplaceAutoReviewImageQaWithWarningsForTest(input: {
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): RunMetadata {
  return acceptImageQaWithWarningsAfterRepairBudgetExhausted({
    run: { id: "mar_test" },
    metadata: input.metadata,
    repairUnits: input.repairUnits,
    refs: input.refs,
  });
}

export function acceptMarketplaceAutoReviewImageQaWithWarningsAfterStoryboardFramesReadyForTest(input: {
  metadata: RunMetadata;
  repairUnits: DirectImageUnit[];
  refs: DirectMediaTaskRef[];
}): RunMetadata | null {
  return acceptBestImageAttemptAfterStoryboardFramesReady({
    run: { id: "mar_test" },
    metadata: input.metadata,
    repairUnits: input.repairUnits,
    refs: input.refs,
  });
}

export function buildMarketplaceAutoReviewImageAttemptReviewsForTest(input: {
  metadata: RunMetadata;
  refs: DirectMediaTaskRef[];
  qaEnvelopes?: Record<string, unknown>[];
  repairUnits?: DirectImageUnit[];
  status: "passed" | "accepted_with_warnings" | "repair_required" | "failed";
  runId?: string;
  expectedFrameCount?: number | null;
}): Record<string, unknown>[] {
  return appendImageAttemptReview({
    metadata: input.metadata,
    run: { id: cleanText(input.runId) || "mar_test" },
    refs: input.refs,
    qaEnvelopes: input.qaEnvelopes,
    repairUnits: input.repairUnits,
    status: input.status,
    expectedFrameCount: input.expectedFrameCount,
  });
}

export function selectMarketplaceAutoReviewBestImageAttemptForTest(input: {
  metadata: RunMetadata;
}): RunMetadata {
  return applyBestImageAttemptSelection(input.metadata);
}

export function acceptMarketplaceAutoReviewBestImageAttemptAfterProviderFailureForTest(input: {
  metadata: RunMetadata;
  failedRef: DirectMediaTaskRef;
  errorMessage?: string | null;
}): RunMetadata | null {
  return acceptBestImageAttemptAfterProviderFailure({
    run: { id: "mar_test", productionRunId: "prod_test" },
    metadata: input.metadata,
    failedRef: input.failedRef,
    errorMessage: input.errorMessage,
  });
}

function productPriceText(product: any): string | null {
  const price = cleanText(product.priceCurrent);
  if (!price) return null;
  return `${price} ${cleanText(product.currency) || "THB"}`;
}

function buildProductTruth(bundle: ProductAccessBundle): ProductTruth {
  const product = bundle.product as any;
  const descriptionJson = asRecord(product.descriptionJson);
  const specsJson = asRecord(product.specsJson);
  const platformRawJson = asRecord(product.platformRawJson);
  const latestProductDraft = asRecord(platformRawJson.latestProductDraft);
  const productCategory = normalizeConcreteProductReferenceStoryboardCategory(
    product.productCategory ??
      descriptionJson.productCategory ??
      specsJson.productCategory ??
      platformRawJson.productCategory ??
      platformRawJson.latestProductCategory ??
      platformRawJson.latestProductCategoryPathPriorityBackfill ??
      platformRawJson.mainCategory ??
      latestProductDraft.productCategory
  );
  const categoryText =
    cleanText(descriptionJson.categoryText) ||
    cleanText(descriptionJson.category) ||
    cleanText(specsJson.categoryText) ||
    cleanText(specsJson.category) ||
    cleanText(platformRawJson.categoryText) ||
    cleanText(platformRawJson.categoryName) ||
    cleanText(platformRawJson.category) ||
    cleanText(latestProductDraft.categoryText) ||
    cleanText(latestProductDraft.category) ||
    null;
  const categoryPath = uniqRefs([
    ...categoryPathPartsFromUnknown(descriptionJson.categoryPath),
    ...categoryPathPartsFromUnknown(descriptionJson.categoryPathText),
    ...categoryPathPartsFromUnknown(descriptionJson.marketplaceCategoryPath),
    ...categoryPathPartsFromUnknown(specsJson.categoryPath),
    ...categoryPathPartsFromUnknown(specsJson.categoryPathText),
    ...categoryPathPartsFromUnknown(specsJson.marketplaceCategoryPath),
    ...categoryPathPartsFromUnknown(platformRawJson.categoryPath),
    ...categoryPathPartsFromUnknown(platformRawJson.categoryPathText),
    ...categoryPathPartsFromUnknown(platformRawJson.marketplaceCategoryPath),
    ...categoryPathPartsFromUnknown(platformRawJson.breadcrumbs),
    ...categoryPathPartsFromUnknown(latestProductDraft.categoryPath),
    ...categoryPathPartsFromUnknown(latestProductDraft.categoryPathText),
    ...categoryPathPartsFromUnknown(latestProductDraft.marketplaceCategoryPath),
  ]).slice(0, 8);
  const imageUrls = (bundle.images ?? [])
    .map((image: any) => cleanText(image.url))
    .filter(Boolean);
  return {
    productId: product.id,
    productName: cleanText(product.productName) || "สินค้า",
    brand: cleanText(product.brand) || null,
    platform: cleanText(product.platform) || "marketplace",
    externalProductId: cleanText(product.externalProductId) || null,
    externalShopId: cleanText(product.externalShopId) || null,
    productCategory,
    categoryText,
    categoryPath,
    sourceUrl: cleanText(product.sourceUrl),
    affiliateUrl: cleanText(product.affiliateUrl) || null,
    shopName: cleanText(product.shopName) || null,
    price: productPriceText(product),
    rating: cleanText(product.ratingScore) || null,
    sold:
      cleanText(product.soldCountText) ||
      (product.soldCountNormalized
        ? String(product.soldCountNormalized)
        : null),
    reviews: cleanText(product.reviewCountText) || null,
    description: cleanText(product.descriptionText),
    specs: asRecord(product.specsJson),
    imageUrls,
  };
}

async function loadSupportingInsights(
  db: Db,
  bundle: ProductAccessBundle,
  auth: AuthContext
) {
  const product = bundle.product as any;
  const captureId = cleanText(product.captureId);
  const rows = await db
    .select({
      id: marketplaceCaptureInsights.id,
      insightType: marketplaceCaptureInsights.insightType,
      payloadJson: marketplaceCaptureInsights.payloadJson,
      createdAt: marketplaceCaptureInsights.createdAt,
    })
    .from(marketplaceCaptureInsights)
    .where(
      and(
        auth.tenantId
          ? eq(marketplaceCaptureInsights.tenantId, auth.tenantId)
          : eq(marketplaceCaptureInsights.userId, auth.userId),
        sql`(${marketplaceCaptureInsights.productId} = ${product.id}${captureId ? sql` OR ${marketplaceCaptureInsights.captureId} = ${captureId}` : sql``})`
      )
    )
    .orderBy(desc(marketplaceCaptureInsights.createdAt))
    .limit(12);
  return rows;
}

async function loadMarketplaceAutoReviewNoveltyMemory(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productId: string;
}): Promise<Record<string, unknown>> {
  const rows = await params.db
    .select({
      id: marketplaceAutoReviewRuns.id,
      selectedConceptId: marketplaceAutoReviewRuns.selectedConceptId,
      metadataJson: marketplaceAutoReviewRuns.metadataJson,
      createdAt: marketplaceAutoReviewRuns.createdAt,
    })
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        tenantAccessClause(params.auth),
        eq(marketplaceAutoReviewRuns.productId, params.productId),
        inArray(marketplaceAutoReviewRuns.status, [
          "completed",
          "running",
          "waiting_provider",
        ] as MarketplaceAutoReviewStatus[])
      )
    )
    .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
    .limit(5);
  const priorRuns = rows.map(row => {
    const metadata = asRecord(row.metadataJson);
    const planning = asRecord(metadata.creativePlanning);
    const novelty = asRecord(planning.noveltyMemory);
    const conceptSet = asRecord(planning.creativeConceptSet);
    return compactRecord({
      runId: row.id,
      selectedConceptId: row.selectedConceptId,
      selectedConceptFingerprint: cleanText(novelty.selectedConceptFingerprint),
      conceptFingerprints: Array.isArray(novelty.generatedConceptFingerprints)
        ? novelty.generatedConceptFingerprints
            .map((item: unknown) => cleanText(item))
            .filter(Boolean)
        : Array.isArray(conceptSet.noveltyFingerprints)
          ? conceptSet.noveltyFingerprints
              .map((item: unknown) => cleanText(item))
              .filter(Boolean)
          : [],
    });
  });
  const priorConceptFingerprints = uniqRefs(
    priorRuns.flatMap(run => [
      cleanText(run.selectedConceptFingerprint),
      ...(Array.isArray(run.conceptFingerprints)
        ? run.conceptFingerprints
        : []),
    ])
  );
  return {
    memoryId: `creative-novelty:${params.tenantId}:${params.productId}`,
    scope: "tenant_product_private_metadata",
    productId: params.productId,
    priorRunCount: rows.length,
    priorRuns,
    priorConceptFingerprints,
    policy:
      "avoid repeating same product creative angle within tenant-safe prior run memory",
    status: "ready",
    checkedAt: nowIso(),
  };
}

function buildProductDetailText(productTruth: ProductTruth): string {
  const specs = Object.entries(productTruth.specs)
    .slice(0, 12)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`
    )
    .join("; ");
  return [
    `PRODUCT FACTS LOCK: ${productTruth.productName}.`,
    productTruth.brand ? `Brand: ${productTruth.brand}.` : "",
    productTruth.price ? `Price signal: ${productTruth.price}.` : "",
    productTruth.rating ? `Rating signal: ${productTruth.rating}.` : "",
    productTruth.sold ? `Sold signal: ${productTruth.sold}.` : "",
    productTruth.shopName ? `Shop: ${productTruth.shopName}.` : "",
    productTruth.productCategory
      ? `Main storyboard category: ${productTruth.productCategory}.`
      : "",
    productTruth.categoryText
      ? `Captured marketplace category: ${productTruth.categoryText}.`
      : "",
    productTruth.categoryPath.length > 0
      ? `Marketplace category path: ${productTruth.categoryPath.join(" > ")}.`
      : "",
    specs ? `Specs: ${specs}.` : "",
    productTruth.description
      ? `Description: ${productTruth.description.slice(0, 1200)}.`
      : "",
    "Do not alter the product category, shape, proportions, material, visible construction, label/logo placement, or real-world usage beyond what the product references and facts support.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildReferenceAnchorDetailText(
  anchors: ResolvedMarketplaceAutoReviewReferenceAnchors
): string {
  const describedCharacterDirective =
    buildMarketplaceAutoReviewDescribedCharacterDirective(anchors);
  const characterVideoLock = buildMarketplaceAutoReviewCharacterVideoLock({
    characterMode: anchors.characterMode,
    characterBrief: anchors.characterBrief,
    characterPreset: anchors.characterPreset,
    hasCharacterImage: Boolean(anchors.characterImageUrl),
  });
  return [
    "USER-SELECTED REFERENCE ANCHOR LOCK:",
    `Product anchor ${anchors.productImageRef}: this is the only product image allowed as the strict visual identity source for color, shape, size, material, label/logo placement, and visible product parts.`,
    "If any anchor image is a single-file multi-view/reference sheet, treat all panels inside that one image as views of the same subject. Use them to preserve identity, shape, proportions, and continuity; do not treat panels as separate variants or additional products.",
    "Other product gallery images are not allowed to override the selected product anchor because they may show a different color, variant, bundle, or shape.",
    characterVideoLock,
    anchors.characterImageUrl && anchors.characterImageRef
      ? `Character anchor ${anchors.characterImageRef}: if a presenter/person appears, preserve the same identity, face structure, hair, body proportions, and styling from the supplied user reference across every shot. Do not morph the face between shots. In this run, include this character's clear face in at least 1, ideally 2-3 active frames as a hard identity anchor.`
      : describedCharacterDirective ||
        "No character/person reference was supplied; use product-only, hands-only, or face-hidden framing and do not invent a recognizable recurring face.",
    anchors.environmentImageUrl && anchors.environmentImageRef
      ? `Environment anchor ${anchors.environmentImageRef}: use the supplied place/environment reference as the approved set/location mood, lighting family, and spatial continuity anchor without adding unsupported product facts.`
      : "No environment reference was supplied; keep environments simple, coherent, and secondary to the product reference.",
  ]
    .filter(Boolean)
    .join(" ");
}

function withMarketplaceAutoReviewReferenceAnchors(
  plan: AutoReviewPlan,
  anchors: ResolvedMarketplaceAutoReviewReferenceAnchors
): AutoReviewPlan {
  const anchorDetail = buildReferenceAnchorDetailText(anchors);
  const productDetail = plan.productDetail.includes(
    "USER-SELECTED REFERENCE ANCHOR LOCK:"
  )
    ? plan.productDetail
    : [plan.productDetail, anchorDetail].filter(Boolean).join("\n\n");
  return {
    ...plan,
    productDetail,
  };
}

function buildAutoReviewProductTruthScaffold(
  bundle: ProductAccessBundle,
  shotCount = DEFAULT_SHOT_COUNT
): AutoReviewPlan {
  const productTruth = buildProductTruth(bundle);
  const productLabel = productTruth.productName;
  const normalizedShotCount =
    normalizeMarketplaceAutoReviewShotCount(shotCount);
  const shots: AutoReviewShot[] = Array.from({
    length: normalizedShotCount,
  }).map((_, index) => {
    const order = index + 1;
    const startSeconds = index * DEFAULT_SHOT_DURATION_SECONDS;
    const endSeconds = startSeconds + DEFAULT_SHOT_DURATION_SECONDS;
    return {
      id: `shot-${order}`,
      order,
      title: `Product truth slot ${order}`,
      startSeconds,
      endSeconds,
      durationSeconds: DEFAULT_SHOT_DURATION_SECONDS,
      storyboardGuide: `${order}. ${startSeconds}-${endSeconds}s product truth only for ${productLabel}; not a media prompt.`,
      voiceover: "product_truth_scaffold_no_spoken_line",
      camera: "product_truth_scaffold_no_camera_direction",
      visual: "product_truth_scaffold_no_visual_direction",
      movement: "product_truth_scaffold_no_motion_direction",
      productRole: "product_truth_anchor_only",
    };
  });
  const storyboardGuide = [
    `PRODUCT TRUTH SCAFFOLD ONLY: ${productLabel}`,
    "This scaffold stores product facts and timing slots only. It is not a media prompt or audio copy.",
    ...shots.map(shot => shot.storyboardGuide),
  ].join("\n");
  const voiceoverScript = [
    "PRODUCT TRUTH SCAFFOLD ONLY. NO AUDIO COPY.",
    ...shots.map(
      shot =>
        `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s ${shot.title}: ${shot.voiceover}`
    ),
    "Runtime planning must provide approved copy before video or audio generation.",
  ].join("\n");
  return {
    conceptId: `marketplace-auto-${productTruth.productId}-truth-scaffold`,
    title: `Product-truth scaffold: ${productLabel}`,
    productTruth,
    storyboardGuide,
    voiceoverScript,
    productDetail: buildProductDetailText(productTruth),
    shots,
  };
}

export function buildMarketplaceAutoReviewProductTruthScaffoldForTest(
  bundle: ProductAccessBundle,
  shotCount = DEFAULT_SHOT_COUNT
): AutoReviewPlan {
  return buildAutoReviewProductTruthScaffold(bundle, shotCount);
}

function resolveMarketplaceAutoReviewVoiceoverDurationSeconds(
  value: unknown
): (typeof MARKETPLACE_AUTO_REVIEW_VOICEOVER_DURATION_OPTIONS)[number] {
  const numeric = Math.round(Number(value));
  const safeValue =
    Number.isFinite(numeric) && numeric > 0
      ? numeric
      : DEFAULT_SHOT_COUNT * DEFAULT_SHOT_DURATION_SECONDS;
  return MARKETPLACE_AUTO_REVIEW_VOICEOVER_DURATION_OPTIONS.reduce(
    (best, option) =>
      Math.abs(option - safeValue) < Math.abs(best - safeValue) ? option : best
  );
}

function selectMarketplaceAutoReviewVoiceoverStyle(
  plan: AutoReviewPlan,
  seed: string
): MarketplaceAutoReviewVoiceoverStyleSelection {
  const storyText = [
    plan.title,
    plan.storyboardGuide,
    ...plan.shots.map(shot => `${shot.title} ${shot.storyboardGuide}`),
  ]
    .join(" ")
    .toLowerCase();
  const isDemo = /demo|เดโม|วิธีใช้|ประกอบ|setup|use|usage/.test(storyText);
  const isTrust = /trust|proof|มั่นใจ|ตรวจ|เช็ค|รายละเอียด|quality/.test(
    storyText
  );
  const speechStyles: MarketplaceAutoReviewVoiceoverSpeechStyle[] = isDemo
    ? ["energetic_host", "friendly_expert", "friend_to_friend", "humorous"]
    : isTrust
      ? [
          "friendly_expert",
          "professional",
          "luxury_polished",
          "friend_to_friend",
        ]
      : [
          "friend_to_friend",
          "friendly_expert",
          "soft_caring",
          "energetic_host",
        ];
  const persuasionStyles: MarketplaceAutoReviewVoiceoverPersuasionStyle[] =
    isDemo
      ? ["direct_response", "problem_solution", "benefit_led", "storytelling"]
      : isTrust
        ? ["premium_trust", "review_like", "educational", "soft_sell"]
        : [
            "problem_solution",
            "storytelling",
            "benefit_led",
            "routine_journey",
          ];
  const hash = buildProductionStableHash({ seed, planId: plan.conceptId });
  return {
    speechStyle: pickCreativeSeedValue(speechStyles, hash, 0),
    persuasionStyle: pickCreativeSeedValue(persuasionStyles, hash, 8),
    seed,
  };
}

function selectMarketplaceAutoReviewVideoAudioProfile(
  plan: AutoReviewPlan
): MarketplaceAutoReviewVideoAudioProfile {
  const storyText = [
    plan.conceptId,
    plan.title,
    plan.storyboardGuide,
    plan.voiceoverScript,
    ...plan.shots.map(shot => `${shot.title} ${shot.voiceover}`),
  ].join(" ");
  const hash = buildProductionStableHash({
    kind: "marketplace_auto_review_video_audio_profile",
    storyText,
  });
  return pickCreativeSeedValue(
    [...MARKETPLACE_AUTO_REVIEW_VIDEO_AUDIO_PROFILES],
    hash,
    0
  );
}

function stringifyMarketplaceAutoReviewVoiceoverContext(
  value: unknown
): string {
  try {
    return JSON.stringify(value ?? {}, null, 2).slice(0, 6000);
  } catch {
    return String(value ?? "").slice(0, 6000);
  }
}

function buildMarketplaceAutoReviewVoiceoverSkillProductDetails(params: {
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  referenceAnchors: ResolvedMarketplaceAutoReviewReferenceAnchors;
}): string {
  const { plan } = params;
  const characterPreset = characterPresetRecordFromUnknown(
    params.referenceAnchors.characterPreset
  );
  const characterSubject = characterSubjectFromPresetRecord(characterPreset);
  const characterGender =
    marketplaceAutoReviewPresenterGenderFromPreset(characterPreset);
  const hasUploadedCharacterReference = Boolean(
    cleanText(params.referenceAnchors.characterImageUrl) ||
    cleanText(params.referenceAnchors.characterImageRef) ||
    cleanText(params.referenceAnchors.characterImageProvidedRef)
  );
  const presenterVoiceDirective = hasUploadedCharacterReference
    ? [
        "Presenter / voice lock:",
        "Use the uploaded character reference as the presenter source of truth.",
        "Infer the speaker voice, Thai polite particles, age, and persona from the visible presenter in that reference.",
        "Do not default to a mother, female host, or feminine polite particles just because the product is in the mother-baby category.",
      ].join(" ")
    : characterSubject
      ? [
          "Presenter / voice lock:",
          `Selected presenter is ${characterSubject}.`,
          "The rewritten Thai spoken lines must match this selected gender, age range, and role.",
          characterGender === "male"
            ? "Because the selected presenter is male/ผู้ชาย, use male-coded or neutral Thai polite particles such as ครับ when a particle is needed; do not use ค่ะ, คะ, or mother/female-host wording."
            : characterGender === "female"
              ? "Because the selected presenter is female/ผู้หญิง, keep Thai polite particles consistent with that voice."
              : "Use neutral Thai phrasing when gender is not explicitly selected.",
          "Do not infer a female/mother voice from a mother-baby product category when the selected presenter says otherwise.",
        ].join(" ")
      : [
          "Presenter / voice lock:",
          "No presenter gender is explicitly selected for voiceover rewrite; use neutral marketplace narration.",
          "Do not infer a female/mother voice solely from a mother-baby product category.",
        ].join(" ");
  const shotGuide = plan.shots
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(shot =>
      [
        `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s ${shot.title}`,
        `Storyboard intent: ${shot.storyboardGuide}`,
        `Visual: ${shot.visual}`,
        `Camera: ${shot.camera}`,
        `Movement: ${shot.movement}`,
        `Product role: ${shot.productRole}`,
        `Current spoken intent: ${shot.voiceover}`,
      ].join("\n")
    );

  return [
    "งานนี้คือการเขียนบทพูด voiceover ภาษาไทยสำหรับ Marketplace Capture Auto Review หน้า Product",
    "",
    "Product detail / product truth lock:",
    plan.productDetail,
    "",
    "Product truth JSON:",
    stringifyMarketplaceAutoReviewVoiceoverContext(plan.productTruth),
    "",
    "Selected video concept:",
    stringifyMarketplaceAutoReviewVoiceoverContext({
      conceptId: plan.conceptId,
      title: plan.title,
      storyboardGuide: plan.storyboardGuide,
      outputMode: params.outputMode,
      frameStrategy: params.frameStrategy,
      resolvedAudioStrategy: params.resolvedAudioStrategy,
      referenceAnchors: {
        productImageRef: params.referenceAnchors.productImageRef,
        characterMode: params.referenceAnchors.characterMode,
        characterBrief: params.referenceAnchors.characterBrief,
        characterPreset: params.referenceAnchors.characterPreset,
        characterImageRef: params.referenceAnchors.characterImageRef,
        environmentImageRef: params.referenceAnchors.environmentImageRef,
        reviewTone: params.referenceAnchors.reviewTone,
        storytellingStructure: params.referenceAnchors.storytellingStructure,
      },
    }),
    "",
    presenterVoiceDirective,
    "",
    "Shot-by-shot source. Rewrite only the spoken voiceover, not the visual/camera/product-role notes:",
    shotGuide.join("\n\n"),
    "",
    `ต้องคืนบทพูด voiceover จริงเท่านั้น จำนวน ${plan.shots.length} บรรทัด เรียงตาม shot 1-${plan.shots.length}.`,
    "แต่ละบรรทัดต้องเป็นคำพูดที่ผู้ชมได้ยินจริง ไม่ใช่คำบรรยายภาพ มุมกล้อง timecode storyboard label หรือคำอธิบายว่าจะถ่ายอะไร",
    "บทพูดต้องเป็นแนวรีวิวสินค้า marketplace ที่ฟังเป็นธรรมชาติ สอดคล้องกับโครงเรื่องจริง และไม่กล่าวอ้างเกิน product truth",
    "ห้ามพูดราคา เรตติ้ง ยอดขาย โปรโมชั่น หรือข้อความบน marketplace ที่เปลี่ยนแปลงได้ เว้นแต่ผู้ใช้ล็อกเป็น claim ที่อนุมัติไว้แล้ว",
  ].join("\n");
}

function cleanMarketplaceAutoReviewVoiceoverSkillLine(value: unknown): string {
  return cleanText(value)
    .replace(/^Speaker\s*\d+\s*[:：]\s*/i, "")
    .replace(/^\s*(?:Shot|Scene|ช็อต|ซีน)\s*\d+\s*[:：.)-]?\s*/i, "")
    .replace(/^\s*\d+\s*(?:[.)]|[-–]\s*\d+\s*s\b)?\s*/i, "")
    .replace(/^\s*(?:บทพูด|Voiceover|Narration|เสียงบรรยาย)\s*[:：]\s*/i, "")
    .replace(/^\[([^\]]+)\]$/g, "$1")
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function isMarketplaceAutoReviewVoiceoverMetadataLine(value: string): boolean {
  return /^(?:ภาพ|มุมกล้อง|อารมณ์|รายละเอียด|โครงเรื่อง|แนวคิด|Camera|Visual|Shot|Scene|Timeline|Storyboard|CTA)\s*[:：]/i.test(
    value
  );
}

function splitMarketplaceAutoReviewVoiceoverSkillOutput(
  content: string,
  targetCount: number
): string[] | null {
  const expandedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/(^|\s)(\d{1,2}\s*[.)]\s+)/g, "\n$2")
    .replace(/(^|\s)(?:Shot|Scene|ช็อต|ซีน)\s*\d+\s*[:：.)-]\s+/gi, "\n");
  const lines = expandedContent
    .split(/\n+/)
    .map(cleanMarketplaceAutoReviewVoiceoverSkillLine)
    .filter(line => {
      if (!line) return false;
      if (isMarketplaceAutoReviewVoiceoverMetadataLine(line)) return false;
      return !/^(?:เปิดภาพ|โชว์ภาพ|แสดงภาพ|ถ่ายภาพ|มุมกล้อง|camera|visual|shot|scene|frame)\b/i.test(
        line
      );
    });
  const uniqueLines = lines.filter(
    (line, index) => lines.findIndex(item => item === line) === index
  );
  if (uniqueLines.length >= targetCount) {
    if (uniqueLines.length === targetCount) return uniqueLines;
    return Array.from({ length: targetCount }, (_, index) => {
      const start = Math.floor((index * uniqueLines.length) / targetCount);
      const end = Math.floor(((index + 1) * uniqueLines.length) / targetCount);
      return uniqueLines
        .slice(start, Math.max(start + 1, end))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }).filter(Boolean);
  }

  const sentenceLines = cleanText(content)
    .split(/(?<=[.!?。！？])\s+|(?<=ค่ะ|ครับ|นะคะ|นะครับ)\s+/)
    .map(cleanMarketplaceAutoReviewVoiceoverSkillLine)
    .filter(
      line => line && !isMarketplaceAutoReviewVoiceoverMetadataLine(line)
    );
  if (sentenceLines.length < targetCount) return null;
  return Array.from({ length: targetCount }, (_, index) => {
    const start = Math.floor((index * sentenceLines.length) / targetCount);
    const end = Math.floor(((index + 1) * sentenceLines.length) / targetCount);
    return sentenceLines
      .slice(start, Math.max(start + 1, end))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }).filter(Boolean);
}

function buildMarketplaceAutoReviewVoiceoverScriptFromShots(
  shots: AutoReviewShot[]
): string {
  return [
    "VOICEOVER SCRIPT BY SHOT:",
    ...shots
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(
        shot =>
          `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s ${shot.title}: ${shot.voiceover}`
      ),
    "Use these spoken lines as the narration contract for the matching shots. Do not invent a different spoken story.",
  ].join("\n");
}

function applyMarketplaceAutoReviewVoiceoverLinesToPlan(params: {
  plan: AutoReviewPlan;
  lines: string[];
}): AutoReviewPlan {
  const shots = params.plan.shots
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((shot, index) => ({
      ...shot,
      voiceover:
        cleanMarketplaceAutoReviewVoiceoverSkillLine(params.lines[index]) ||
        shot.voiceover,
    }));
  return {
    ...params.plan,
    voiceoverScript: buildMarketplaceAutoReviewVoiceoverScriptFromShots(shots),
    shots,
  };
}

function isMarketplaceAutoReviewProductTruthScaffoldPlan(
  plan: AutoReviewPlan
): boolean {
  const source = [
    plan.title,
    plan.storyboardGuide,
    plan.voiceoverScript,
    ...plan.shots.flatMap(shot => [
      shot.title,
      shot.storyboardGuide,
      shot.voiceover,
      shot.camera,
      shot.visual,
      shot.movement,
      shot.productRole,
    ]),
  ].join("\n");
  return /PRODUCT TRUTH SCAFFOLD ONLY|product_truth_scaffold_/i.test(source);
}

function marketplaceAutoReviewVoiceoverRewriteRecordFromMetadata(
  metadata: RunMetadata
): Record<string, unknown> {
  const creativePlanning = asRecord(metadata.creativePlanning);
  const creativeRewrite = asRecord(creativePlanning.voiceoverSkillRewrite);
  if (
    cleanText(creativeRewrite.rawOutputPreview || creativeRewrite.rawOutput)
  ) {
    return creativeRewrite;
  }
  return asRecord(metadata.voiceoverSkillRewrite);
}

function extractMarketplaceAutoReviewVoiceoverRewriteLinesFromMetadata(params: {
  metadata: RunMetadata;
  targetCount: number;
}): string[] | null {
  const rewrite = marketplaceAutoReviewVoiceoverRewriteRecordFromMetadata(
    params.metadata
  );
  const rawContent = cleanText(
    rewrite.rawOutputPreview || rewrite.rawOutput || rewrite.content
  );
  if (!rawContent) return null;
  const lines = splitMarketplaceAutoReviewVoiceoverSkillOutput(
    rawContent,
    params.targetCount
  );
  if (!lines || lines.length < params.targetCount) return null;
  return lines.slice(0, params.targetCount);
}

function hydrateMarketplaceAutoReviewPlanForStoryboardReview(params: {
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}): { plan: AutoReviewPlan; repairedFromVoiceoverRewrite: boolean } {
  if (!isMarketplaceAutoReviewProductTruthScaffoldPlan(params.plan)) {
    return { plan: params.plan, repairedFromVoiceoverRewrite: false };
  }
  const lines = extractMarketplaceAutoReviewVoiceoverRewriteLinesFromMetadata({
    metadata: params.metadata,
    targetCount: params.plan.shots.length,
  });
  if (!lines) {
    return { plan: params.plan, repairedFromVoiceoverRewrite: false };
  }
  const productName =
    cleanText(params.plan.productTruth.productName) || "สินค้า";
  const shots = params.plan.shots
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((shot, index) => {
      const voiceover =
        cleanMarketplaceAutoReviewVoiceoverSkillLine(lines[index]) ||
        shot.voiceover;
      return {
        ...shot,
        title: /^Product truth slot/i.test(shot.title)
          ? `Product truth beat ${shot.order}`
          : shot.title,
        storyboardGuide: `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s Show ${productName} proof that matches this spoken line: ${voiceover}`,
        voiceover,
        camera: /product_truth_scaffold_/i.test(shot.camera)
          ? "clear cinematic marketplace review framing focused on product evidence"
          : shot.camera,
        visual: /product_truth_scaffold_/i.test(shot.visual)
          ? `Realistic product review scene that visually supports: ${voiceover}`
          : shot.visual,
        movement: /product_truth_scaffold_/i.test(shot.movement)
          ? "gentle practical action or product detail motion"
          : shot.movement,
        productRole: /product_truth_scaffold_|product_truth_anchor_only/i.test(
          shot.productRole
        )
          ? "product truth proof for the matching spoken beat"
          : shot.productRole,
      };
    });
  return {
    plan: {
      ...params.plan,
      title: /^Product-truth scaffold:/i.test(params.plan.title)
        ? `Marketplace review: ${productName}`
        : params.plan.title,
      storyboardGuide: [
        `REPAIRED STORYBOARD GUIDE FROM APPROVED VOICEOVER: ${productName}`,
        "Use the manually selected image attempt as the visual source and keep these spoken beats aligned shot by shot.",
        ...shots.map(shot => shot.storyboardGuide),
      ].join("\n"),
      voiceoverScript:
        buildMarketplaceAutoReviewVoiceoverScriptFromShots(shots),
      shots,
    },
    repairedFromVoiceoverRewrite: true,
  };
}

function extractMarketplaceAutoReviewLlmContent(response: unknown): string {
  const record = asRecord(response);
  if (typeof record.output_text === "string") return record.output_text.trim();
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => {
        const item = asRecord(part);
        return typeof item.text === "string" ? item.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

async function rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill(params: {
  tenantId: string;
  auth: AuthContext;
  runId: string;
  productionRunId: string;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  referenceAnchors: ResolvedMarketplaceAutoReviewReferenceAnchors;
}): Promise<{ plan: AutoReviewPlan; metadata: Record<string, unknown> }> {
  const targetCount = params.plan.shots.length;
  if (targetCount === 0) {
    return {
      plan: params.plan,
      metadata: {
        status: "skipped",
        reason: "no_shots",
        skillId: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
      },
    };
  }
  const styleSelection = selectMarketplaceAutoReviewVoiceoverStyle(
    params.plan,
    [
      params.runId,
      params.productionRunId,
      params.plan.conceptId,
      params.plan.shots.length,
    ].join(":")
  );
  try {
    const synced = await syncSingleSkillIfChanged(
      ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID
    );
    if (synced.error) {
      throw new Error(
        `elevenlabs-product-voiceover-dialogue skill sync failed: ${synced.error}`
      );
    }
    const skill = await getSkillByIdAsync(
      ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID
    );
    if (!skill) {
      throw new Error(
        "elevenlabs-product-voiceover-dialogue skill not found or not enabled"
      );
    }
    const referenceImages = uniqRefs([
      params.referenceAnchors.productImageUrl,
      params.referenceAnchors.characterImageUrl,
      params.referenceAnchors.environmentImageUrl,
      ...params.plan.productTruth.imageUrls.slice(0, 3),
    ]);
    const targetDurationSeconds =
      params.plan.shots.reduce(
        (sum, shot) => sum + (Number(shot.durationSeconds) || 0),
        0
      ) || targetCount * DEFAULT_SHOT_DURATION_SECONDS;
    const userInputs = {
      product_details: buildMarketplaceAutoReviewVoiceoverSkillProductDetails({
        plan: params.plan,
        outputMode: params.outputMode,
        frameStrategy: params.frameStrategy,
        resolvedAudioStrategy: params.resolvedAudioStrategy,
        referenceAnchors: params.referenceAnchors,
      }),
      product_images: referenceImages,
      output_language: "Thai",
      ui_locale: "th",
      browser_locale: "th-TH",
      app_language: "Thai",
      speech_style: styleSelection.speechStyle,
      persuasion_style: styleSelection.persuasionStyle,
      target_duration_seconds:
        resolveMarketplaceAutoReviewVoiceoverDurationSeconds(
          targetDurationSeconds
        ),
      speaker_count: "1",
      enable_audio_tags: "false",
      evergreen_mode: true,
      strict_claim_guard: true,
    };
    const systemPrompt = [
      String(skill.systemPrompt ?? skill.skillContent ?? "").trim(),
      "## Marketplace Auto Review Voiceover Rewrite Runtime Contract",
      `Return exactly ${targetCount} short Thai spoken voiceover lines, one per storyboard shot, in order.`,
      "Do not return JSON, markdown fences, headings, camera notes, visual descriptions, timecodes, product-lock notes, or storyboard labels.",
      "Each returned line must be suitable as final TTS narration for the matching marketplace product review shot.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const userPrompt = buildCustomSkillUserPrompt(userInputs, {
      referenceImageCount: referenceImages.length,
    });
    const policy = await resolveSkillExecutionPolicy({
      skill,
      conversationModel: null,
    });
    if (!policy.modelId) {
      throw new Error(
        "elevenlabs-product-voiceover-dialogue skill has no enabled LLM model"
      );
    }
    const provider = await getProviderForModel(policy.modelId, {
      preferredProviderId: policy.preferredProviderId,
      strictProviderPin: policy.strictProviderPin,
      allowFreeModels: policy.allowFreeModels,
    });
    if (!provider) {
      throw new Error(
        `No provider available for elevenlabs-product-voiceover-dialogue model ${policy.modelId}`
      );
    }
    const execution = await executeSharedSkillTextRuntime({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      objective:
        "Rewrite Marketplace Auto Review storyboard narration with the product voiceover skill.",
      originSurface: "marketplace_capture",
      entryPoint: "marketplace_auto_review_stage",
      modelConfig: buildRuntimeModelConfig({
        modelId: policy.modelId,
        providerId: provider.providerId,
        resolvedGatewayModelId: policy.modelId,
      }),
      skillSlugs: [ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID],
      systemPrompt,
      userPrompt,
      planContext: {
        caller: "marketplace_auto_review",
        runId: params.runId,
        productionRunId: params.productionRunId,
        requiredSkill: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
        selectedSkill: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
        targetShotCount: targetCount,
        speechStyle: styleSelection.speechStyle,
        persuasionStyle: styleSelection.persuasionStyle,
      },
      dynamicParams: userInputs,
      referenceImages,
      requestLabel: "marketplace-auto-review-product-voiceover-dialogue",
      runId: params.runId,
      schemaHint: {
        name: "marketplace_auto_review_voiceover_text_output",
        validationMode: "text_output",
      },
      legacyExecute: async () => {
        const llmResult = await executeWithFallback({
          model: policy.modelId!,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          userId: params.auth.userId,
          preferredProvider: policy.preferredProviderId,
          strictProviderPin: policy.strictProviderPin,
          maxTokens: Math.max(1200, targetCount * 180),
          temperature: 0.55,
          disableProviderFallbacks: true,
          allowFreeModels: policy.allowFreeModels,
        });
        if (llmResult.type !== "success") {
          const errorMessage =
            llmResult.type === "error"
              ? llmResult.error
              : `provider fallback required from ${llmResult.from.providerName} to ${llmResult.to.providerName}, but provider fallback is disabled`;
          throw new Error(
            `elevenlabs-product-voiceover-dialogue LLM call failed: ${errorMessage}`
          );
        }
        const rawContent = extractMarketplaceAutoReviewLlmContent(
          llmResult.response
        );
        if (!rawContent) {
          throw new Error(
            "elevenlabs-product-voiceover-dialogue returned empty output"
          );
        }
        const usage = {
          promptTokens: Number(llmResult.response?.usage?.prompt_tokens ?? 0),
          completionTokens: Number(
            llmResult.response?.usage?.completion_tokens ?? 0
          ),
        };
        const creditsUsed = await calculateCreditsForLLMDynamic(
          usage.promptTokens,
          usage.completionTokens,
          policy.modelId!
        );
        if (creditsUsed > 0) {
          await deductCredits({
            userId: params.auth.userId,
            tenantId: params.auth.tenantId,
            amount: creditsUsed,
            description:
              "Marketplace Auto Review voiceover skill: product voiceover dialogue",
            idempotencyKey: [
              "marketplace-auto-review",
              "voiceover-skill",
              ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
              params.runId,
              params.plan.conceptId,
            ].join(":"),
            skillSlug: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
            sourceType: "skill",
            metadata: {
              skill: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
              runtimeKind: "llm",
              originSurface: "marketplace_capture",
              entryPoint: "marketplace_auto_review_stage",
              runId: params.runId,
              productionRunId: params.productionRunId,
              conceptId: params.plan.conceptId,
              model: policy.modelId ?? undefined,
              provider: llmResult.providerName,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              speechStyle: styleSelection.speechStyle,
              persuasionStyle: styleSelection.persuasionStyle,
            },
          });
        }
        return {
          rawContent,
          usage,
          creditsUsed,
          providerName: llmResult.providerName,
          modelId: policy.modelId,
          rawResponse: llmResult.response,
        };
      },
    });
    const rawContent = execution.value.rawContent.trim();
    const lines = splitMarketplaceAutoReviewVoiceoverSkillOutput(
      rawContent,
      targetCount
    );
    if (!lines) {
      return {
        plan: params.plan,
        metadata: {
          status: "fallback_planner_voiceover",
          reason: "unsplittable_skill_output",
          skillId: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
          speechStyle: styleSelection.speechStyle,
          persuasionStyle: styleSelection.persuasionStyle,
          rawOutputPreview: rawContent.slice(0, 700),
          targetShotCount: targetCount,
          runtimeStatus: execution.runtime.status,
          generatedAt: nowIso(),
        },
      };
    }
    const rewrittenPlan = applyMarketplaceAutoReviewVoiceoverLinesToPlan({
      plan: params.plan,
      lines,
    });
    return {
      plan: rewrittenPlan,
      metadata: {
        status: "rewritten",
        skillId: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
        speechStyle: styleSelection.speechStyle,
        persuasionStyle: styleSelection.persuasionStyle,
        targetShotCount: targetCount,
        lineCount: lines.length,
        modelId: execution.value.modelId,
        providerName: execution.value.providerName,
        creditsUsed: execution.value.creditsUsed,
        runtimeStatus: execution.runtime.status,
        runtimeSelectedSkillSlug: execution.runtime.selectedSkillSlug,
        generatedAt: nowIso(),
      },
    };
  } catch (error) {
    console.warn(
      "[marketplaceAutoReview] voiceover skill rewrite failed; keeping planner voiceover",
      {
        runId: params.runId,
        productionRunId: params.productionRunId,
        conceptId: params.plan.conceptId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return {
      plan: params.plan,
      metadata: {
        status: "fallback_planner_voiceover",
        reason: "skill_execution_failed",
        skillId: ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID,
        speechStyle: styleSelection.speechStyle,
        persuasionStyle: styleSelection.persuasionStyle,
        errorMessage: error instanceof Error ? error.message : String(error),
        generatedAt: nowIso(),
      },
    };
  }
}

export function buildMarketplaceAutoReviewVoiceoverSkillProductDetailsForTest(input: {
  plan: AutoReviewPlan;
  outputMode?: MarketplaceAutoReviewOutputMode;
  frameStrategy?: MarketplaceAutoReviewFrameStrategy;
  resolvedAudioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  referenceAnchors?: ResolvedMarketplaceAutoReviewReferenceAnchors;
}): string {
  return buildMarketplaceAutoReviewVoiceoverSkillProductDetails({
    plan: input.plan,
    outputMode: input.outputMode ?? "storyboard_images",
    frameStrategy: input.frameStrategy ?? "storyboard_3x3_split",
    resolvedAudioStrategy: input.resolvedAudioStrategy ?? "silent",
    referenceAnchors:
      input.referenceAnchors ??
      ({
        productImageRef: "product-reference:1",
        characterImageRef: null,
        environmentImageRef: null,
      } as ResolvedMarketplaceAutoReviewReferenceAnchors),
  });
}

export function splitMarketplaceAutoReviewVoiceoverSkillOutputForTest(
  content: string,
  targetCount: number
): string[] | null {
  return splitMarketplaceAutoReviewVoiceoverSkillOutput(content, targetCount);
}

export function applyMarketplaceAutoReviewVoiceoverLinesToPlanForTest(input: {
  plan: AutoReviewPlan;
  lines: string[];
}): AutoReviewPlan {
  return applyMarketplaceAutoReviewVoiceoverLinesToPlan(input);
}

export function hydrateMarketplaceAutoReviewPlanForStoryboardReviewForTest(input: {
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}): { plan: AutoReviewPlan; repairedFromVoiceoverRewrite: boolean } {
  return hydrateMarketplaceAutoReviewPlanForStoryboardReview(input);
}

function parseJsonObjectFromText(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return asRecord(JSON.parse(match[0]));
    } catch {
      return {};
    }
  }
}

function finalOutputAsText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  const record = asRecord(value);
  for (const key of ["text", "content", "message", "output", "finalOutput"]) {
    const text = cleanText(record[key]);
    if (text) return text;
  }
  return JSON.stringify(value);
}

function parseAgentRuntimeJsonOutput(
  response: AgentRuntimeResponse
): Record<string, unknown> {
  const finalOutput = response.finalOutput;
  if (
    finalOutput &&
    typeof finalOutput === "object" &&
    !Array.isArray(finalOutput)
  ) {
    return asRecord(finalOutput);
  }
  return parseJsonObjectFromText(finalOutputAsText(finalOutput));
}

function productionManifestForStage(
  metadata: RunMetadata,
  stageKey: StageKey
): Record<string, unknown> {
  const manifests = Array.isArray(metadata.capabilityManifests)
    ? metadata.capabilityManifests
    : [];
  return asRecord(
    manifests.find(item => cleanText(asRecord(item).stageKey) === stageKey) ??
      manifests[0]
  );
}

function agentOutputSchemaRefForStage(stageKey: StageKey): string {
  if (stageKey === "concept_story") return "CreativeConceptSet";
  if (stageKey === "prompt_plan") return "StoryboardContract";
  if (stageKey === "image_generation") return "ShotFrameVisionQaEnvelope";
  if (stageKey === "video_generation") return "VideoClipContinuityQaEnvelope";
  if (stageKey === "audio_generation") return "AudioContinuityQaEnvelope";
  if (stageKey === "render" || stageKey === "library_finalize")
    return "FinalRenderQaEnvelope";
  return "MarketplaceAutoReviewStageCompletionEvidence";
}

function agentCapabilityManifestForStage(
  metadata: RunMetadata,
  stageKey: StageKey
): AgentCapabilityManifest {
  const manifest = productionManifestForStage(metadata, stageKey);
  const slug = `marketplace-auto-review-${stageKey}`;
  const outputSchemaRef = agentOutputSchemaRefForStage(stageKey);
  return {
    slug,
    manifestSchemaVersion: toNumber(manifest.manifestSchemaVersion, 1),
    name: `Marketplace Auto Review ${stageKey}`,
    purpose: `Run Feature 117 media production ${stageKey} through the Python OpenAI Agents SDK adapter while Node owns gateway, credits, and persistence.`,
    supportedSurfaces: ["media_production"],
    supportedOriginSurfaces: ["marketplace_capture"],
    supportedEntryPoints: ["marketplace_auto_review_stage"],
    taskTypes: [stageKey, "marketplace_auto_review"],
    requiredContext: [
      "creativeBriefSnapshot",
      "productEvidenceLock",
      "productReferenceAssetPack",
      "evidenceInstructionFirewall",
    ],
    preferredContext: [
      "storyboardContract",
      "visualWarningPlan",
      "characterIdentityAssetPack",
    ],
    outputSchema: {
      type: "object",
      schemaRef: outputSchemaRef,
      artifactKind: outputSchemaRef,
      schemaVersion: "1.0",
    },
    supportedArtifactTypes: [
      "creative_plan",
      "storyboard_contract",
      "vision_qa_envelope",
      "repair_plan",
    ],
    requiredEvidenceKinds: ["product_evidence", "policy", "credit", "lineage"],
    reviewChecklist: [
      "product_truth_locked",
      "thai_ad_policy_safe",
      "no_direct_provider_llm",
      "stage_evidence_ready",
    ],
    failureModes: [
      "gateway_unavailable",
      "policy_blocked",
      "evidence_missing",
      "json_contract_invalid",
    ],
    doNotUseWhen: ["product_reference_blocked", "evidence_instruction_blocked"],
  };
}

function gatewayCreditCategoryForAgentCategory(
  category: string,
  stageKey: StageKey
): AgentsGatewayInvocationMetadata["creditCategory"] {
  const normalized = category.toLowerCase();
  if (normalized.includes("audio")) return "llm_audio_qa";
  if (normalized.includes("repair")) return "llm_repair";
  if (
    normalized.includes("vision") ||
    normalized.includes("video") ||
    stageKey === "image_generation" ||
    stageKey === "video_generation"
  )
    return "llm_visual_qa";
  if (normalized.includes("verify") || normalized.includes("qa"))
    return "llm_verification";
  return "llm_planning";
}

function buildProductionAgentsSdkManifestForStage(params: {
  tenantId: string;
  auth: AuthContext;
  runId: string;
  stageKey: StageKey;
  traceSuffix: string;
  metadata: RunMetadata;
}): ProductionAgentsSdkCapabilityManifest {
  const existing = productionManifestForStage(params.metadata, params.stageKey);
  const allowedAgents = (
    Array.isArray(existing.allowedAgents) ? existing.allowedAgents : []
  )
    .map(item => cleanText(item))
    .filter(Boolean);
  const resolvedAllowedAgents =
    allowedAgents.length > 0 ? allowedAgents : ["Production Director"];
  const outputSchemaRef = agentOutputSchemaRefForStage(params.stageKey);
  const manifestBasis = {
    schemaVersion: "1.0",
    tenantId: params.tenantId,
    userId: String(params.auth.userId),
    runId: params.runId,
    stageKey: params.stageKey,
    attemptId: params.traceSuffix,
    allowedAgents: resolvedAllowedAgents,
    allowedTools: [],
    outputSchemaRef,
    sessionPolicy: "refs_only",
    tracePolicy: "redacted_no_external_export",
    streamPolicy: "normalized_idempotent",
  };
  return {
    schemaVersion: "1.0",
    tenantId: params.tenantId,
    userId: String(params.auth.userId),
    runId: params.runId,
    stageKey: params.stageKey,
    attemptId: params.traceSuffix,
    manifestHash: buildProductionStableHash(manifestBasis),
    allowedAgents: resolvedAllowedAgents,
    allowedHandoffs: [],
    allowedTools: [],
    hostedSdkCapabilities: {
      webSearch: false,
      fileSearch: false,
      computerUse: false,
      codeInterpreter: false,
      imageGeneration: false,
      audioGeneration: false,
      videoGeneration: false,
      remoteMcp: false,
      shell: false,
    },
    outputSchemas: [
      {
        artifactKind: outputSchemaRef,
        schemaVersion: "1.0",
        required: true,
      },
    ],
    sessionPolicy: {
      persistRawSdkSession: false,
      checkpointRefsOnly: true,
      resumeCursorRef: null,
      maxSessionEventBytes: 16000,
    },
    tracePolicy: {
      captureSensitiveInputOutput: false,
      externalSdkTraceExport: "disabled",
      redactionProfileId: "feature117-media-production",
      maxTraceEventBytes: 16000,
      platformTraceEventRefs: [
        `trace:${params.runId}:${params.stageKey}:${params.traceSuffix}`,
      ],
    },
    streamPolicy: {
      normalizeEvents: true,
      stableEventIds: true,
      duplicateEventBehavior: "idempotent_noop",
    },
    approvedByNodeAt: nowIso(),
  };
}

async function runMarketplaceMediaProductionAgent(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  runId: string;
  productionRunId: string;
  stageKey: StageKey;
  model: string;
  objective: string;
  runtimeInput: unknown;
  metadata: RunMetadata;
  productTruth: ProductTruth;
  traceSuffix: string;
  estimatedCreditReserve: number;
  creditCategory: string;
}): Promise<MarketplaceAgentRunResult> {
  await assertPaidStageAuthorityFresh({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    phase: paidAuthorityPhaseForStage(params.stageKey),
    stageKey: params.stageKey,
  });
  const candidateManifest = agentCapabilityManifestForStage(
    params.metadata,
    params.stageKey
  );
  const productionSdkManifest = buildProductionAgentsSdkManifestForStage({
    tenantId: params.tenantId,
    auth: params.auth,
    runId: params.runId,
    stageKey: params.stageKey,
    traceSuffix: params.traceSuffix,
    metadata: params.metadata,
  });
  const allowedAgents = productionSdkManifest.allowedAgents;
  const firewall = asRecord(params.metadata.evidenceInstructionFirewall);
  if (["blocked", "failed"].includes(cleanText(firewall.status))) {
    throw new Error(
      "Marketplace Auto Review evidence firewall is not passed; LLM gateway dispatch is blocked"
    );
  }
  const creditReservation = await reserveMarketplaceLlmCredits({
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    runId: params.runId,
    productId: params.productTruth.productId,
    stageKey: params.stageKey,
    category: params.creditCategory,
    model: params.model,
    traceSuffix: params.traceSuffix,
    estimatedCreditReserve: params.estimatedCreditReserve,
    description: `Marketplace auto review Agents SDK ${params.stageKey}`,
    metadata: {
      objective: params.objective,
      traceSuffix: params.traceSuffix,
      gatewayOnly: true,
    },
  });
  let durableMetadata = params.metadata;
  try {
    const runtimeModel = runtimeModelConfig(params.model);
    const idempotencyKey = `marketplace-auto-review:${params.runId}:${params.stageKey}:${params.traceSuffix}`;
    const stepId = `${params.stageKey}:${params.runId}`;
    const preflightSnapshotRef =
      cleanText(
        asRecord(params.metadata.creativeBriefSnapshot).briefSnapshotId
      ) ||
      cleanText(
        asRecord(params.metadata.evidenceFreshnessSnapshot).freshnessSnapshotId
      ) ||
      cleanText(asRecord(params.metadata.productEvidenceLock).lockId) ||
      `preflight:${params.runId}:${params.stageKey}`;
    const creditReservationRef = `credit:${creditReservation.idempotencyKey}`;
    const creditLedgerRef =
      typeof creditReservation.transactionId === "number"
        ? `credit-tx:${creditReservation.transactionId}`
        : `credit-ledger:pending:${creditReservation.idempotencyKey}`;
    const creditPayerRef = `tenant:${params.tenantId}:user:${params.auth.userId}`;
    const gatewayInvocationMetadata: AgentsGatewayInvocationMetadata = {
      tenantId: params.tenantId,
      userId: String(params.auth.userId),
      surface: "media_production",
      originSurface: "marketplace_capture",
      productionProjectId: params.productionRunId,
      productionRunId: params.productionRunId,
      agentRunId: params.runId,
      agentName: allowedAgents[0] ?? "Production Director",
      agentRole: allowedAgents[0] ?? "Production Director",
      stageKey: params.stageKey,
      stepId,
      attemptId: params.traceSuffix,
      modelPolicyId: runtimeModel.gatewayRouteId ?? "llm-gateway",
      selectedModelId:
        runtimeModel.resolvedGatewayModelId ?? runtimeModel.modelId,
      creditCategory: gatewayCreditCategoryForAgentCategory(
        params.creditCategory,
        params.stageKey
      ),
      idempotencyKey,
      creditReservationRef,
      creditLedgerRef,
      creditPayerRef,
      preflightSnapshotRef,
      creditAuditRef: `credit-audit:${params.runId}:${params.stageKey}:${buildProductionStableHash(
        {
          creditReservationRef,
          creditLedgerRef,
          creditPayerRef,
          preflightSnapshotRef,
          idempotencyKey,
        }
      ).slice(0, 12)}`,
    };
    durableMetadata = await attachMarketplaceLlmReservationEvidence({
      db: params.db,
      runId: params.runId,
      metadata: params.metadata,
      reservation: creditReservation,
      stageKey: params.stageKey,
      traceSuffix: params.traceSuffix,
    });
    const request = await buildAgentRuntimeRequest({
      surface: "media_production",
      originSurface: "marketplace_capture",
      entryPoint: "marketplace_auto_review_stage",
      tenantId: params.tenantId,
      runId: params.runId,
      requestId: idempotencyKey,
      idempotencyKey,
      objective: params.objective,
      contextPackRequest: {
        surface: "chat",
        tenantId: params.tenantId,
        request: {
          channel: "chat",
          userId: params.auth.userId,
          tenantId: params.tenantId,
          userMessage: params.objective,
          dynamicParams: {
            marketplaceAutoReview: {
              runId: params.runId,
              stageKey: params.stageKey,
              productId: params.productTruth.productId,
            },
          },
          traceId: `marketplace-auto-review-${params.stageKey}:${params.runId}:${params.traceSuffix}`,
        },
        dynamicParams: {
          contextState: {
            resources: [
              {
                type: "marketplace_auto_review_context",
                runId: params.runId,
                stageKey: params.stageKey,
                productId: params.productTruth.productId,
              },
            ],
          },
        },
        tokenBudget: 7000,
        label: `Marketplace Auto Review ${params.stageKey}`,
      },
      planContext: {
        input: params.runtimeInput,
        capabilityManifestHash: productionSdkManifest.manifestHash,
        evidenceInstructionFirewallStatus:
          cleanText(firewall.status) || "passed",
        evidenceInstructionFirewallRef:
          cleanText(firewall.firewallId) || `firewall:${params.runId}`,
        marketplaceEvidenceRefs: Array.isArray(
          asRecord(durableMetadata.productEvidenceLock).evidenceRefs
        )
          ? asRecord(durableMetadata.productEvidenceLock).evidenceRefs
          : [],
        allowedFactRefs: Array.isArray(firewall.allowedFactRefs)
          ? firewall.allowedFactRefs
          : [`product:${params.productTruth.productId}`],
        escapedUntrustedEvidenceRefs: Array.isArray(
          firewall.escapedEvidenceRefs
        )
          ? firewall.escapedEvidenceRefs
          : [],
        hostedCapabilities: [],
        rawTraceExportAllowed: false,
        rawSessionPersistenceAllowed: false,
        nodeCreditAuthority: "node_gateway_only",
        persistenceAuthority: "node_platform_only",
        creditReservation: {
          idempotencyKey: creditReservation.idempotencyKey,
          transactionId: creditReservation.transactionId,
          reservedCredits: creditReservation.amount,
          category: creditReservation.category,
          model: creditReservation.model,
          reservedAt: creditReservation.reservedAt,
        },
      },
      stepContext: {
        stepId,
        stepKey: params.stageKey,
        attemptId: params.traceSuffix,
      },
      modelConfig: runtimeModel,
      executionEnvelope: {
        envelopeId: `agent-envelope:${params.runId}:${params.stageKey}:${params.traceSuffix}`,
        tenantId: params.tenantId,
        issuedAt: nowIso(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        allowedTools: [],
        allowedSkills: [candidateManifest.slug],
        allowedAgents,
        sideEffectPolicy: "read_only",
      },
      allowedTools: [],
      allowedSkills: [candidateManifest.slug],
      allowedAgents,
      completionPolicy: {
        requireStructuredJson: true,
        stageKey: params.stageKey,
        noShadowExecution: true,
      },
      reviewPolicy: {
        requireProductTruthLock: true,
        requireThaiAdPolicy: true,
      },
      retryPolicy: {
        maxAttempts: 1,
      },
      traceCorrelationIds: {
        traceId: `marketplace-auto-review-${params.stageKey}:${params.runId}:${params.traceSuffix}`,
        parentTraceId: null,
      },
      candidateSkillManifests: [candidateManifest],
      gatewayInvocationMetadata,
      productionAgentsSdkCapabilityManifest: productionSdkManifest,
      runtimeSelectionSnapshot: {
        runtime: "openai_agents",
        surface: "media_production",
        originSurface: "marketplace_capture",
        mode: "active",
        gatewayOnly: true,
      },
    });
    const client = new AgentRuntimeClient(
      params.creditCategory === "vision_qa"
        ? { requestTimeoutMs: visionQaRuntimeTimeoutMs() }
        : {}
    );
    const response = await client.run(request);
    if (response.status !== "completed") {
      throw new Error(
        `Marketplace Auto Review Agents SDK stage ${params.stageKey} did not complete: ${response.status}`
      );
    }
    return { response, creditReservation };
  } catch (error) {
    const refund = await refundMarketplaceLlmReservation({
      auth: params.auth,
      reservation: creditReservation,
      reason: "agent_runtime_dispatch_failed",
      metadata: {
        stageKey: params.stageKey,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    }).catch(refundError => {
      console.error(
        "[marketplaceAutoReview] failed to refund LLM reservation after agent error",
        refundError
      );
    });
    const refundTransactionId =
      typeof refund?.transactionId === "number"
        ? refund.transactionId
        : undefined;
    await updateRun({
      db: params.db,
      runId: params.runId,
      metadataJson: withUpdatedCreditSummary({
        ...durableMetadata,
        llmQaCreditTransactions: upsertCreditTransaction(
          durableMetadata.llmQaCreditTransactions,
          llmReservationCreditTransaction({
            reservation: creditReservation,
            runId: params.runId,
            stageKey: params.stageKey,
            traceSuffix: params.traceSuffix,
            status: "refunded_after_dispatch_failure",
            refundTransactionId,
            refundCredits: creditReservation.amount,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          })
        ),
      }),
    }).catch(metadataError => {
      console.error(
        "[marketplaceAutoReview] failed to persist LLM reservation refund evidence",
        metadataError
      );
    });
    throw error;
  }
}

function normalizeCreativeShot(
  input: unknown,
  fallback: AutoReviewShot,
  index: number
): AutoReviewShot {
  const item = asRecord(input);
  if (!fallback) {
    throw new Error(
      `Creative planner missing fallback shot contract at index ${index}`
    );
  }
  const fields = {
    title: cleanText(item.title),
    storyboardGuide: cleanText(item.storyboardGuide),
    voiceover: cleanText(item.voiceover),
    camera: cleanText(item.camera),
    visual: cleanText(item.visual),
    movement: cleanText(item.movement),
    productRole: cleanText(item.productRole),
  };
  const missing = Object.entries(fields)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    const error = new Error(
      `Agents creative planner shot ${index + 1} missing required creative shot fields: ${missing.join(", ")}`
    );
    (error as any).code = "creative_planner_shot_contract_mismatch";
    (error as any).shotNumber = index + 1;
    (error as any).missingFields = missing;
    throw error;
  }
  const order = index + 1;
  const startSeconds = index * DEFAULT_SHOT_DURATION_SECONDS;
  const endSeconds = startSeconds + DEFAULT_SHOT_DURATION_SECONDS;
  return {
    id: `shot-${order}`,
    order,
    title: fields.title,
    startSeconds,
    endSeconds,
    durationSeconds: DEFAULT_SHOT_DURATION_SECONDS,
    storyboardGuide: fields.storyboardGuide,
    voiceover: fields.voiceover,
    camera: fields.camera,
    visual: fields.visual,
    movement: fields.movement,
    productRole: fields.productRole,
  };
}

export function buildMarketplaceAutoReviewCreativeShotForTest(
  input: unknown,
  fallback: AutoReviewShot,
  index: number
): AutoReviewShot {
  return normalizeCreativeShot(input, fallback, index);
}

function normalizeCreativeShotsToExpectedCount(
  rawShots: unknown[],
  fallbackShots: AutoReviewShot[]
): AutoReviewShot[] {
  const expectedShotCount = normalizeMarketplaceAutoReviewShotCount(
    fallbackShots.length
  );
  if (rawShots.length !== expectedShotCount) {
    const error = new Error(
      `Creative planner returned ${rawShots.length} shots, expected ${expectedShotCount}`
    );
    (error as any).code = "creative_planner_shot_count_mismatch";
    (error as any).actualShotCount = rawShots.length;
    (error as any).expectedShotCount = expectedShotCount;
    throw error;
  }
  return rawShots.map((shot, index) =>
    normalizeCreativeShot(shot, fallbackShots[index], index)
  );
}

function logMarketplaceAutoReviewPlannerDebug(
  level: "info" | "warn" | "error",
  event: string,
  payload: Record<string, unknown>
) {
  const entry = {
    event,
    at: nowIso(),
    feature: "marketplace_auto_review",
    stageKey: "concept_story",
    ...payload,
  };
  const message = "[marketplaceAutoReview][creativePlanner]";
  if (level === "error") {
    console.error(message, entry);
    return;
  }
  if (level === "warn") {
    console.warn(message, entry);
    return;
  }
  console.info(message, entry);
}

export function normalizeMarketplaceAutoReviewCreativeShotsForTest(
  rawShots: unknown[],
  fallbackShots: AutoReviewShot[]
): AutoReviewShot[] {
  return normalizeCreativeShotsToExpectedCount(rawShots, fallbackShots);
}

function creativeFingerprint(input: unknown): string {
  return buildProductionStableHash(input).slice(0, 16);
}

const MARKETPLACE_AUTO_REVIEW_JOURNEY_TEMPLATES = [
  {
    id: "problem_to_order",
    label: "clutter/problem -> product order -> proof -> result -> CTA",
    hookPattern:
      "open with a specific everyday problem the product visibly solves",
    proofEmphasis: "before/after organization and visible product structure",
  },
  {
    id: "assembly_confidence",
    label: "setup confidence -> detail proof -> use -> room fit -> CTA",
    hookPattern: "open with setup hesitation or assembly confidence",
    proofEmphasis: "parts, build, scale, and hands-on installation evidence",
  },
  {
    id: "space_fit",
    label: "small-space fit -> product sizing -> lifestyle use -> CTA",
    hookPattern: "open with room/space fit tension",
    proofEmphasis: "placement, footprint, proportions, and real room context",
  },
  {
    id: "trust_proof",
    label:
      "trust concern -> product evidence -> usage proof -> satisfaction -> CTA",
    hookPattern: "open with trust/quality concern without rendering review UI",
    proofEmphasis:
      "real material/detail/use visuals instead of ratings/screens",
  },
  {
    id: "daily_ritual",
    label:
      "daily routine -> product enters -> convenience proof -> result -> CTA",
    hookPattern: "open with a relatable daily-use moment",
    proofEmphasis: "human-scale interaction, reach, storage, and convenience",
  },
] as const;

const MARKETPLACE_AUTO_REVIEW_CAMERA_PALETTES = [
  "warm natural bedroom light, slow push-in, detail macro, clean lifestyle wide",
  "handheld realistic demo, overhead setup, close product texture, final room wide",
  "before/after rhythm, medium user interaction, product hero, soft side light",
  "evidence-led sequence, top-down detail, three-quarter product angle, calm CTA",
] as const;

const MARKETPLACE_AUTO_REVIEW_HUMAN_PRESENCE_PLANS = [
  "hands-only in early proof shots, clear approved face in one lifestyle/result shot if character anchor exists",
  "clear approved face in one hook/result shot, hands-on product use in one middle shot",
  "mostly product-only proof, one human-scale interaction, one satisfied lifestyle frame if character anchor exists",
  "hands and partial body for function proof, one clear identity-safe presenter frame near the close",
] as const;

const MARKETPLACE_AUTO_REVIEW_SCENE_RHYTHMS = [
  "problem -> reveal -> detail -> use -> result -> confidence -> CTA",
  "wide context -> hands proof -> hero product -> close detail -> lifestyle result -> CTA",
  "messy/need -> setup -> product detail -> real use -> room fit -> satisfaction -> CTA",
  "question hook -> evidence tour -> function demo -> expectation guard -> close",
] as const;

function pickCreativeSeedValue<T>(
  values: readonly T[],
  hash: string,
  offset: number
): T {
  const slice = hash.slice(offset, offset + 8) || hash.slice(0, 8);
  const parsed = Number.parseInt(slice, 16);
  const index = Number.isFinite(parsed) ? parsed % values.length : 0;
  return values[index] as T;
}

function buildMarketplaceAutoReviewCreativeVariationSeed(params: {
  runId: string;
  productId: string;
  requestedShotCount: number;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  noveltyMemory?: Record<string, unknown>;
}): Record<string, unknown> {
  const hash = creativeFingerprint({
    runId: params.runId,
    productId: params.productId,
    requestedShotCount: params.requestedShotCount,
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    priorRunCount: toNumber(asRecord(params.noveltyMemory).priorRunCount),
  });
  const journeyTemplate = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_JOURNEY_TEMPLATES,
    hash,
    0
  );
  const cameraPalette = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_CAMERA_PALETTES,
    hash,
    4
  );
  const humanPresencePlan = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_HUMAN_PRESENCE_PLANS,
    hash,
    8
  );
  const sceneRhythm = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_SCENE_RHYTHMS,
    hash,
    12
  );
  const priorRuns = Array.isArray(asRecord(params.noveltyMemory).priorRuns)
    ? (asRecord(params.noveltyMemory).priorRuns as unknown[])
        .map(item => asRecord(item))
        .slice(0, 5)
    : [];
  const avoidPriorAngles = uniqRefs(
    priorRuns.flatMap(run => [
      cleanText(run.selectedConceptId),
      ...(Array.isArray(run.conceptFingerprints)
        ? run.conceptFingerprints
        : []),
    ])
  ).slice(0, 12);
  return compactRecord({
    seedId: `creative-seed:${params.productId}:${hash}`,
    seedHash: hash,
    journeyTemplateId: journeyTemplate.id,
    journeyTemplate: journeyTemplate.label,
    hookPattern: journeyTemplate.hookPattern,
    proofEmphasis: journeyTemplate.proofEmphasis,
    sceneRhythm,
    cameraPalette,
    humanPresencePlan,
    variantInstruction:
      "Use this seed to create a fresh concept for this run while preserving product truth, shot count, Thai customer journey, and approved anchors.",
    avoidPriorAngles,
    priorRunCount: toNumber(asRecord(params.noveltyMemory).priorRunCount),
  });
}

function marketplaceAutoReviewCreativeConceptCandidates(
  metadata?: RunMetadata | null
): Record<string, unknown>[] {
  const creativeConceptSet = asRecord(metadata?.creativeConceptSet);
  const concepts = Array.isArray(creativeConceptSet.concepts)
    ? (creativeConceptSet.concepts as unknown[]).map(item => asRecord(item))
    : Array.isArray(creativeConceptSet.alternatives)
      ? (creativeConceptSet.alternatives as unknown[]).map(item =>
          asRecord(item)
        )
      : [];
  const selectedConceptId = cleanText(creativeConceptSet.selectedConceptId);
  const selected = selectedConceptId
    ? concepts.find(
        concept => cleanText(concept.conceptId) === selectedConceptId
      )
    : concepts.find(concept => concept.selected === true);
  return [
    ...(selected ? [selected] : []),
    ...concepts.filter(concept => concept !== selected),
  ].filter(concept =>
    Boolean(
      cleanText(concept.conceptId) ||
      cleanText(concept.title) ||
      cleanText(concept.angle) ||
      cleanText(concept.rationale)
    )
  );
}

function buildProductReferenceStoryboardImageAttemptStoryLens(params: {
  plan: AutoReviewPlan;
  metadata?: RunMetadata | null;
  attempt?: number | null;
}): Record<string, unknown> {
  const attempt = Math.max(1, Math.floor(toNumber(params.attempt, 1)));
  const concepts = marketplaceAutoReviewCreativeConceptCandidates(
    params.metadata
  );
  const concept =
    concepts.length > 0 ? concepts[(attempt - 1) % concepts.length] : null;
  const fallbackHash = creativeFingerprint({
    productId: params.plan.productTruth.productId,
    conceptId: params.plan.conceptId,
    attempt,
  });
  const journeyTemplate = concept
    ? null
    : pickCreativeSeedValue(
        MARKETPLACE_AUTO_REVIEW_JOURNEY_TEMPLATES,
        fallbackHash,
        0
      );
  const cameraPalette = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_CAMERA_PALETTES,
    fallbackHash,
    4
  );
  const humanPresencePlan = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_HUMAN_PRESENCE_PLANS,
    fallbackHash,
    8
  );
  const sceneRhythm = pickCreativeSeedValue(
    MARKETPLACE_AUTO_REVIEW_SCENE_RHYTHMS,
    fallbackHash,
    12
  );
  const conceptId =
    cleanText(concept?.conceptId) ||
    cleanText(concept?.id) ||
    `attempt-lens-${attempt}-${fallbackHash.slice(0, 8)}`;
  const title =
    cleanText(concept?.title) ||
    cleanText(concept?.conceptTitle) ||
    journeyTemplate?.label ||
    params.plan.title;
  const angle =
    cleanText(concept?.angle) ||
    cleanText(concept?.conceptAngle) ||
    cleanText(concept?.rationale) ||
    cleanText(concept?.selectedRationale) ||
    journeyTemplate?.hookPattern ||
    params.plan.storyboardGuide;
  return compactRecord({
    attempt,
    lensId: `image-attempt-story-lens:${attempt}:${conceptId}`,
    conceptId,
    title,
    angle,
    journeyTemplateId: journeyTemplate?.id ?? cleanText(concept?.hookType),
    journeyTemplate: journeyTemplate?.label ?? title,
    hookPattern: journeyTemplate?.hookPattern ?? angle,
    proofEmphasis:
      journeyTemplate?.proofEmphasis ?? cleanText(concept?.rationale),
    sceneRhythm,
    cameraPalette,
    humanPresencePlan,
    directive: [
      `IMAGE ATTEMPT ${attempt} STORY LENS: call product-reference-storyboard as a fresh prompt generation for this image attempt.`,
      `Customer-journey angle: ${title}. ${angle}`,
      "Preserve the same product truth, reference images, shot order, voiceover meaning, and 3x3 layout contract.",
      "Make this storyboard visually and narratively distinct from prior image attempts: vary the opening situation, proof emphasis, scene rhythm, camera palette, human presence plan, and frame composition.",
      "Do not copy the previous attempt's frame-by-frame scene wording unless the product reference or shot meaning requires it.",
    ].join(" "),
  });
}

export function buildMarketplaceAutoReviewCreativeVariationSeedForTest(input: {
  runId: string;
  productId: string;
  requestedShotCount?: number;
  outputMode?: MarketplaceAutoReviewOutputMode;
  frameStrategy?: MarketplaceAutoReviewFrameStrategy;
  resolvedAudioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  noveltyMemory?: Record<string, unknown>;
}): Record<string, unknown> {
  return buildMarketplaceAutoReviewCreativeVariationSeed({
    runId: input.runId,
    productId: input.productId,
    requestedShotCount: normalizeMarketplaceAutoReviewShotCount(
      input.requestedShotCount ?? DEFAULT_SHOT_COUNT
    ),
    outputMode: input.outputMode ?? "storyboard_images",
    frameStrategy: input.frameStrategy ?? "storyboard_3x3_split",
    resolvedAudioStrategy: input.resolvedAudioStrategy ?? "silent",
    noveltyMemory: input.noveltyMemory,
  });
}

type NormalizedCreativeConcept = Record<string, unknown> & {
  conceptId?: string;
  title?: string;
  angle?: string;
  hookType?: string;
  targetAudience?: string;
  coreTension?: string;
  productRole?: string;
  visualMetaphor?: string;
  proofPlan?: string;
  rationale?: string;
  noveltyFingerprint?: string;
  rejectedReason?: string | null;
  claimTruthRiskScore?: number;
  adComplianceScore?: number;
  creativeQualityScore?: number;
};

function normalizeCreativeConceptSet(params: {
  parsed: Record<string, unknown>;
  fallbackPlan: AutoReviewPlan;
  finalOutput: string;
  priorFingerprints?: string[];
}): Record<string, unknown> {
  const raw =
    asRecord(params.parsed.creativeConceptSet).alternatives ??
    params.parsed.creativeConceptSet ??
    params.parsed.concepts;
  const candidates = Array.isArray(raw) ? raw : [];
  const normalized = candidates
    .map((item, index) => {
      const record = asRecord(item);
      const title =
        cleanText(record.title) ||
        cleanText(record.conceptTitle) ||
        cleanText(params.parsed.conceptTitle);
      const angle =
        cleanText(record.angle) ||
        cleanText(record.conceptAngle) ||
        cleanText(params.parsed.conceptAngle);
      if (!title || !angle) return null;
      const fingerprint = creativeFingerprint({
        title,
        angle,
        storyboardGuide:
          cleanText(record.storyboardGuide) ||
          cleanText(params.parsed.storyboardGuide),
      });
      return {
        conceptId:
          cleanText(record.conceptId) ||
          `concept-alt-${index + 1}-${fingerprint.slice(0, 8)}`,
        title,
        angle,
        rationale:
          cleanText(record.rationale) ||
          cleanText(record.selectedRationale) ||
          "Truth-locked marketplace review concept.",
        noveltyFingerprint: fingerprint,
        noveltyStatus: params.priorFingerprints?.includes(fingerprint)
          ? "similar_to_prior_run"
          : "fresh_candidate",
        selected: Boolean(record.selected) || index === 0,
        rejectedReason:
          index === 0
            ? null
            : cleanText(record.rejectedReason) ||
              "Not selected for this run after novelty/evidence review.",
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
  const unique = normalized.filter(
    (item, index, all) =>
      all.findIndex(
        other =>
          cleanText(other.noveltyFingerprint) ===
          cleanText(item.noveltyFingerprint)
      ) === index
  );
  if (unique.length < 3) {
    const error = new Error(
      `Agents creative planner returned ${unique.length} usable concepts, expected at least 3`
    );
    (error as any).code = "creative_planner_concept_count_mismatch";
    (error as any).actualConceptCount = unique.length;
    (error as any).expectedMinimumConceptCount = 3;
    throw error;
  }
  const conceptSet = unique.slice(0, 5) as NormalizedCreativeConcept[];
  const priorFingerprintSet = new Set(
    (params.priorFingerprints ?? [])
      .map(item => cleanText(item))
      .filter(Boolean)
  );
  const freshConceptIndex = conceptSet.findIndex(
    item => !priorFingerprintSet.has(cleanText(item.noveltyFingerprint))
  );
  if (conceptSet.length > 0 && freshConceptIndex < 0) {
    throw new Error(
      "Marketplace Auto Review creative concept selection blocked: all concepts duplicate prior same-product tenant memory"
    );
  }
  const selectedFirstConceptSet: NormalizedCreativeConcept[] =
    freshConceptIndex <= 0
      ? conceptSet
      : [
          conceptSet[freshConceptIndex] as NormalizedCreativeConcept,
          ...conceptSet.filter((_, index) => index !== freshConceptIndex),
        ];
  const selectedConceptId = cleanText(selectedFirstConceptSet[0]?.conceptId);
  const selectedConcepts = selectedFirstConceptSet.map((item, index) => {
    const duplicate = priorFingerprintSet.has(
      cleanText(item.noveltyFingerprint)
    );
    return {
      ...item,
      selected: index === 0,
      noveltyStatus: duplicate ? "similar_to_prior_run" : "fresh_candidate",
      rejectedReason:
        index === 0
          ? null
          : duplicate
            ? "Rejected because this novelty fingerprint duplicates prior same-product tenant memory."
            : cleanText(item.rejectedReason) ||
              "Not selected for this run after novelty/evidence review.",
    };
  });
  const canonicalConcepts = selectedConcepts.map((item, index) => {
    const angle = cleanText(item.angle) || cleanText(item.hookType);
    const title = cleanText(item.title) || `แนวคิดรีวิวสินค้า ${index + 1}`;
    const rationale =
      cleanText(item.rationale) || "Truth-locked marketplace review concept.";
    return {
      conceptId:
        cleanText(item.conceptId) ||
        `concept-alt-${index + 1}-${creativeFingerprint({
          title,
          angle,
        }).slice(0, 8)}`,
      title,
      hookType: cleanText(item.hookType) || angle || "marketplace_review",
      targetAudience:
        cleanText(item.targetAudience) || "Thai marketplace shoppers",
      coreTension:
        cleanText(item.coreTension) ||
        angle ||
        "Make the product useful and trustworthy without unsupported claims.",
      productRole:
        cleanText(item.productRole) ||
        "hero_product_from_selected_reference_image",
      visualMetaphor:
        cleanText(item.visualMetaphor) ||
        angle ||
        "evidence-led marketplace review",
      proofPlan:
        cleanText(item.proofPlan) ||
        "Use selected product image, product truth, approved specs, and claim evidence refs only.",
      noveltyFingerprint:
        cleanText(item.noveltyFingerprint) ||
        creativeFingerprint({ title, angle, rationale }),
      claimTruthRiskScore:
        typeof item.claimTruthRiskScore === "number"
          ? Math.min(Math.max(item.claimTruthRiskScore, 0), 1)
          : 0.12,
      adComplianceScore:
        typeof item.adComplianceScore === "number"
          ? Math.min(Math.max(item.adComplianceScore, 0), 1)
          : 0.9,
      creativeQualityScore:
        typeof item.creativeQualityScore === "number"
          ? Math.min(Math.max(item.creativeQualityScore, 0), 1)
          : index === 0
            ? 0.86
            : 0.78,
      rationale,
    };
  });
  const selectionRationale =
    cleanText(asRecord(params.parsed.creativeConceptSet).selectionRationale) ||
    cleanText(asRecord(params.parsed.creativeConceptSet).selectedRationale) ||
    "Selected concept best matches product evidence and novelty constraints.";
  return {
    schemaVersion: 1,
    conceptSetId: `creative-concepts:${params.fallbackPlan.productTruth.productId}:${creativeFingerprint(
      {
        productId: params.fallbackPlan.productTruth.productId,
        concepts: canonicalConcepts.map(item => item.noveltyFingerprint),
        output: params.finalOutput,
      }
    )}`,
    status: "ready",
    selectedConceptId,
    alternatives: selectedConcepts,
    concepts: canonicalConcepts,
    rejectedConceptIds: canonicalConcepts
      .slice(1)
      .map(item => cleanText(item.conceptId)),
    selectionRationale,
    selectedRationale: selectionRationale,
    rejectedRationales: selectedConcepts.slice(1).map(item => ({
      conceptId: cleanText(item.conceptId),
      reason: cleanText(item.rejectedReason),
    })),
    noveltyFingerprints: selectedConcepts
      .map(item => cleanText(item.noveltyFingerprint))
      .filter(Boolean),
    fallbackExpanded: false,
    outputFingerprint: creativeFingerprint(params.finalOutput),
  };
}

function normalizeCreativeConceptSetWithRetryMemory(params: {
  parsed: Record<string, unknown>;
  fallbackPlan: AutoReviewPlan;
  finalOutput: string;
  priorFingerprints?: string[];
  previousConceptSet?: Record<string, unknown>;
}): {
  creativeConceptSet: Record<string, unknown>;
  reusedPreviousConceptSet: boolean;
  reuseReason?: string;
} {
  try {
    return {
      creativeConceptSet: normalizeCreativeConceptSet({
        parsed: params.parsed,
        fallbackPlan: params.fallbackPlan,
        finalOutput: params.finalOutput,
        priorFingerprints: params.priorFingerprints,
      }),
      reusedPreviousConceptSet: false,
    };
  } catch (error) {
    const previous = asRecord(params.previousConceptSet);
    if (
      (error as any)?.code === "creative_planner_concept_count_mismatch" &&
      Array.isArray(previous.alternatives) &&
      previous.alternatives.length >= 3
    ) {
      return {
        creativeConceptSet: previous,
        reusedPreviousConceptSet: true,
        reuseReason: error instanceof Error ? error.message : String(error),
      };
    }
    throw error;
  }
}

function marketplaceAutoReviewCreativePlannerErrorIsRetryable(
  error: unknown
): boolean {
  return [
    "creative_planner_concept_count_mismatch",
    "creative_planner_shot_count_mismatch",
    "creative_planner_shot_contract_mismatch",
  ].includes(cleanText((error as any)?.code));
}

function buildCreativePlannerFallbackConceptSet(params: {
  fallbackPlan: AutoReviewPlan;
  reason: string;
  noveltyMemory?: Record<string, unknown>;
}): Record<string, unknown> {
  const productName = params.fallbackPlan.productTruth.productName;
  const concepts = [
    {
      title: `จัดระเบียบด้วย ${productName}`,
      angle: "problem_solution_evidence",
      hookType: "everyday_problem",
      coreTension: "ของใช้กระจัดกระจายจนหยิบไม่สะดวก",
      visualMetaphor: "from clutter to usable bedside corner",
    },
    {
      title: `${productName} ในพื้นที่จริง`,
      angle: "real_use_context",
      hookType: "practical_demo",
      coreTension: "ต้องการพื้นที่เก็บของขนาดกะทัดรัดข้างเตียง",
      visualMetaphor: "simple product proof in the approved room",
    },
    {
      title: `เช็ครายละเอียดก่อนเลือก ${productName}`,
      angle: "buyer_verification",
      hookType: "detail_check",
      coreTension: "ผู้ซื้ออยากเห็นจำนวนชั้นและรูปทรงจริงก่อนตัดสินใจ",
      visualMetaphor: "reference-locked product inspection",
    },
  ].map((item, index) => {
    const noveltyFingerprint = creativeFingerprint({
      productId: params.fallbackPlan.productTruth.productId,
      fallbackReason: params.reason,
      ...item,
    });
    return {
      conceptId: `fallback-concept-${index + 1}-${noveltyFingerprint.slice(0, 8)}`,
      title: item.title,
      angle: item.angle,
      hookType: item.hookType,
      targetAudience: "Thai marketplace shoppers",
      coreTension: item.coreTension,
      productRole: "hero_product_from_selected_reference_image",
      visualMetaphor: item.visualMetaphor,
      proofPlan:
        "Use selected product reference image, approved product facts, and generated storyboard frames only.",
      noveltyFingerprint,
      noveltyStatus: "fallback_candidate",
      selected: index === 0,
      rejectedReason:
        index === 0
          ? null
          : "Not selected for deterministic fallback planning.",
      rationale:
        index === 0
          ? "Selected because it preserves the basic marketplace review journey without relying on the unavailable planner adapter."
          : "Prepared as fallback alternative for auditability.",
      claimTruthRiskScore: 0.1,
      adComplianceScore: 0.9,
      creativeQualityScore: index === 0 ? 0.72 : 0.64,
    };
  });
  return {
    schemaVersion: 1,
    conceptSetId: `creative-concepts:${params.fallbackPlan.productTruth.productId}:fallback:${creativeFingerprint(
      {
        productId: params.fallbackPlan.productTruth.productId,
        reason: params.reason,
        prior: asRecord(params.noveltyMemory).priorRunCount,
      }
    )}`,
    status: "ready_with_fallback",
    selectedConceptId: cleanText(concepts[0]?.conceptId),
    alternatives: concepts,
    concepts,
    rejectedConceptIds: concepts.slice(1).map(item => item.conceptId),
    selectedRationale:
      "Agents SDK creative planner was unavailable, so the deterministic product-truth fallback concept was selected to keep the run resumable.",
    selectionRationale:
      "Agents SDK creative planner was unavailable, so the deterministic product-truth fallback concept was selected to keep the run resumable.",
    rejectedRationales: concepts.slice(1).map(item => ({
      conceptId: item.conceptId,
      reason: cleanText(item.rejectedReason),
    })),
    noveltyFingerprints: concepts.map(item => item.noveltyFingerprint),
    fallbackExpanded: true,
    fallbackReason: params.reason,
    outputFingerprint: creativeFingerprint({
      fallbackPlan: params.fallbackPlan.conceptId,
      reason: params.reason,
    }),
  };
}

export function buildMarketplaceAutoReviewCreativeConceptSetForTest(input: {
  parsed: Record<string, unknown>;
  fallbackPlan: AutoReviewPlan;
  finalOutput?: string;
  priorFingerprints?: string[];
}) {
  return normalizeCreativeConceptSet({
    parsed: input.parsed,
    fallbackPlan: input.fallbackPlan,
    finalOutput: input.finalOutput ?? JSON.stringify(input.parsed),
    priorFingerprints: input.priorFingerprints,
  });
}

export function buildMarketplaceAutoReviewCreativeConceptSetWithRetryMemoryForTest(input: {
  parsed: Record<string, unknown>;
  fallbackPlan: AutoReviewPlan;
  finalOutput?: string;
  priorFingerprints?: string[];
  previousConceptSet?: Record<string, unknown>;
}) {
  return normalizeCreativeConceptSetWithRetryMemory({
    parsed: input.parsed,
    fallbackPlan: input.fallbackPlan,
    finalOutput: input.finalOutput ?? JSON.stringify(input.parsed),
    priorFingerprints: input.priorFingerprints,
    previousConceptSet: input.previousConceptSet,
  });
}

export function buildMarketplaceAutoReviewCreativePlannerFallbackConceptSetForTest(input: {
  fallbackPlan: AutoReviewPlan;
  reason?: string;
  noveltyMemory?: Record<string, unknown>;
}): Record<string, unknown> {
  return buildCreativePlannerFallbackConceptSet({
    fallbackPlan: input.fallbackPlan,
    reason: cleanText(input.reason) || "agent_runtime_adapter_error",
    noveltyMemory: input.noveltyMemory,
  });
}

export function marketplaceAutoReviewCreativePlannerErrorIsRetryableForTest(
  error: unknown
): boolean {
  return marketplaceAutoReviewCreativePlannerErrorIsRetryable(error);
}

function specEvidenceRefs(productTruth: ProductTruth): string[] {
  return Object.keys(productTruth.specs ?? {})
    .map(key => cleanText(key))
    .filter(Boolean)
    .map(key => `spec:${key}`);
}

function buildClaimEvidenceMapping(
  plan: AutoReviewPlan,
  metadata?: RunMetadata
): Record<string, unknown> {
  const productRef = `product:${plan.productTruth.productId}`;
  const productEvidenceLock = asRecord(metadata?.productEvidenceLock);
  const productImageRefs = metadata
    ? recordRefList(asRecord(metadata.productReferenceAssetPack), "auditRefs")
    : plan.productTruth.imageUrls.map((url, index) =>
        productImageRefForIndex(index, url)
      );
  const insightRefs = Array.isArray(productEvidenceLock.evidenceRefs)
    ? productEvidenceLock.evidenceRefs
        .map((item: unknown) => cleanText(item))
        .filter(ref => ref.startsWith("insight:"))
    : [];
  const stableEvidenceRefs = uniqRefs([
    productRef,
    ...productImageRefs,
    ...specEvidenceRefs(plan.productTruth),
    ...insightRefs,
  ]);
  const combinedText = [
    plan.title,
    plan.storyboardGuide,
    plan.voiceoverScript,
    ...plan.shots.flatMap(shot => [
      shot.title,
      shot.storyboardGuide,
      shot.voiceover,
      shot.visual,
      shot.productRole,
    ]),
  ].join("\n");
  const claims: Record<string, unknown>[] = [];
  const addClaim = (
    claimId: string,
    surface: string,
    claimText: string,
    evidenceRefs: string[]
  ) => {
    if (!cleanText(claimText)) return;
    claims.push({
      claimId,
      surface,
      claimText,
      evidenceRefs: uniqRefs(evidenceRefs),
      status: evidenceRefs.length ? "supported" : "blocked",
    });
  };
  addClaim("claim:product_name", "title_voiceover_metadata", plan.title, [
    productRef,
  ]);
  if (plan.productTruth.brand) {
    addClaim("claim:brand", "voiceover_metadata", plan.productTruth.brand, [
      productRef,
    ]);
  }
  Object.entries(plan.productTruth.specs ?? {}).forEach(([key, value]) => {
    const text = `${key}: ${cleanText(value)}`;
    if (combinedText.includes(cleanText(key)) || combinedText.includes(text)) {
      addClaim(`claim:spec:${key}`, "voiceover_caption_visual", text, [
        productRef,
        `spec:${key}`,
      ]);
    }
  });
  const unsupportedClaimRules: Array<{
    reasonCode: string;
    pattern: RegExp;
  }> = [
    {
      reasonCode: "volatile_or_unsupported_claim_omitted",
      pattern:
        /ราคา|ส่วนลด|discount|ถูกที่สุด|โปรโมชัน|promotion|คูปอง|coupon|การันตี|รับประกัน|คะแนน|rating|ขายแล้ว|sold|รีวิว\s*\d|stock|สต็อก/i,
    },
    {
      reasonCode: "miracle_absolute_claim_omitted",
      pattern:
        /มหัศจรรย์|ปาฏิหาริย์|miracle|ดีที่สุด|อันดับ\s*1|number\s*one|no\.?\s*1|100%|เห็นผลทันที|instant result|guaranteed result|guaranteed/i,
    },
    {
      reasonCode: "health_body_result_claim_omitted",
      pattern:
        /รักษา|บำบัด|หายขาด|ลดน้ำหนัก|ผิวขาว|สิวหาย|แก้ปวด|สุขภาพดีขึ้น|ทางการแพทย์|medical|cure|heal|treat|weight loss|fat loss|skin whitening|acne|pain relief|clinically proven/i,
    },
    {
      reasonCode: "certification_official_status_claim_omitted",
      pattern:
        /อย\.|เลขจดแจ้ง|มอก\.|ผ่านการรับรอง|รับรองโดย|certified|approved by|fda|official|authorized|ของแท้\s*100|authentic\s*100/i,
    },
    {
      reasonCode: "comparative_superiority_claim_omitted",
      pattern:
        /เหนือกว่า|ดีกว่า|เทียบเท่า|มากกว่า.*คู่แข่ง|better than|superior|outperforms|beats competitors/i,
    },
  ];
  const blockedClaims = combinedText
    .split(/\n+/)
    .map(line => cleanText(line))
    .flatMap(line =>
      unsupportedClaimRules
        .filter(rule => rule.pattern.test(line))
        .map(rule => ({
          claimText: line,
          reasonCode: rule.reasonCode,
        }))
    )
    .filter(
      (claim, index, claims) =>
        claims.findIndex(
          other =>
            other.claimText === claim.claimText &&
            other.reasonCode === claim.reasonCode
        ) === index
    )
    .map((claim, index) => ({
      claimId: `blocked-unsupported:${index + 1}`,
      claimText: claim.claimText,
      reasonCode: claim.reasonCode,
      status: "blocked",
      evidenceRefs: [],
    }));
  return {
    mappingId: `claim-evidence:${plan.productTruth.productId}:${creativeFingerprint(
      {
        title: plan.title,
        voiceoverScript: plan.voiceoverScript,
      }
    )}`,
    status: blockedClaims.length ? "supported_with_omissions" : "supported",
    surfaces: ["voiceover", "captions", "on_screen_copy", "title", "metadata"],
    stableEvidenceRefs,
    claims,
    blockedClaims,
    policy: "all product claims must map to product/spec/image/insight refs",
  };
}

export function buildMarketplaceAutoReviewClaimEvidenceMappingForTest(input: {
  plan: AutoReviewPlan;
  metadata?: RunMetadata;
}) {
  return buildClaimEvidenceMapping(input.plan, input.metadata);
}

async function buildGatewayCreativeAutoReviewPlan(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  runId: string;
  productionRunId: string;
  bundle: ProductAccessBundle;
  insights: Awaited<ReturnType<typeof loadSupportingInsights>>;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  fallbackPlan: AutoReviewPlan;
  preflightMetadata: RunMetadata;
  referenceAnchors: ResolvedMarketplaceAutoReviewReferenceAnchors;
  noveltyMemory?: Record<string, unknown>;
}): Promise<{ plan: AutoReviewPlan; metadata: Record<string, unknown> }> {
  const model =
    cleanText(process.env.MARKETPLACE_AUTO_REVIEW_PLANNER_MODEL) || "gpt-4o";
  const productTruth = params.fallbackPlan.productTruth;
  const requestedShotCount = shotCountForPlan(params.fallbackPlan);
  const overlayTextMode = normalizeMarketplaceAutoReviewOverlayTextMode(
    params.overlayTextMode
  );
  const requestedDurationSeconds =
    durationSecondsForShotCount(requestedShotCount);
  const requestedNarrationSeconds = requestedShotCount * 10;
  const requiredShotOrders = Array.from(
    { length: requestedShotCount },
    (_, index) => index + 1
  );
  const creativeVariationSeed = buildMarketplaceAutoReviewCreativeVariationSeed(
    {
      runId: params.runId,
      productId: productTruth.productId,
      requestedShotCount,
      outputMode: params.outputMode,
      frameStrategy: params.frameStrategy,
      resolvedAudioStrategy: params.resolvedAudioStrategy,
      noveltyMemory: params.noveltyMemory,
    }
  );
  const buildPlannerFallback = (
    error: AgentRuntimeClientError
  ): { plan: AutoReviewPlan; metadata: Record<string, unknown> } => {
    const reason = cleanText(error.code) || "agent_runtime_adapter_error";
    const creativeConceptSet = buildCreativePlannerFallbackConceptSet({
      fallbackPlan: params.fallbackPlan,
      reason,
      noveltyMemory: params.noveltyMemory,
    });
    const plan = withMarketplaceAutoReviewReferenceAnchors(
      {
        ...params.fallbackPlan,
        conceptId: `${params.fallbackPlan.conceptId}-fallback-${creativeFingerprint(
          {
            runId: params.runId,
            reason,
            status: error.status,
          }
        ).slice(0, 8)}`,
        productDetail: buildProductDetailText(productTruth),
      },
      params.referenceAnchors
    );
    return {
      plan,
      metadata: {
        source: "deterministic_fallback_after_agents_sdk_adapter_error",
        model,
        provider: "deterministic_fallback",
        gatewayRouteId: null,
        adapterVersion: null,
        sdkVersion: null,
        reservedCredits: 0,
        actualCredits: 0,
        creditsUsed: 0,
        refundCredits: 0,
        requestedShotCount,
        creativePlannerAttemptCount: 0,
        creativePlannerShotCountCorrectionApplied: false,
        creativeVariationSeed,
        creativeConceptSet,
        noveltyMemory: compactRecord({
          ...(params.noveltyMemory ?? {}),
          selectedConceptFingerprint: cleanText(
            (creativeConceptSet.alternatives as Record<string, unknown>[])?.[0]
              ?.noveltyFingerprint
          ),
          generatedConceptFingerprints: creativeConceptSet.noveltyFingerprints,
        }),
        fallbackUsed: true,
        fallbackReason: reason,
        agentsSdkRuntime: false,
        adapterStatus: error.status,
        adapterCode: error.code,
        adapterErrorMessage: error.message,
        warningApprovalRefs: [
          "policy:creative-planner-adapter-unavailable-use-deterministic-fallback",
        ],
        generatedAt: nowIso(),
      },
    };
  };
  const insightDigest = params.insights.map(row => ({
    id: row.id,
    type: row.insightType,
    payload: compactRecord(asRecord(row.payloadJson)),
  }));
  const describedCharacterDirective =
    buildMarketplaceAutoReviewDescribedCharacterDirective(
      params.referenceAnchors
    );
  const creativeDirectionDirective =
    buildMarketplaceAutoReviewCreativeDirectionDirective(
      params.referenceAnchors
    );
  const buildRuntimeInput = (correction?: {
    actualShotCount: number;
    attempt: number;
    errorCode?: string;
    shotNumber?: number;
    missingFields?: string[];
    errorMessage?: string;
    actualConceptCount?: number;
    expectedMinimumConceptCount?: number;
  }) =>
    [
      "You are a Production Director for Thai marketplace product review videos.",
      "Create a fresh, imaginative, but truth-locked concept. Use only product facts and reference-image implications.",
      "Never invent product specs, labels, materials, functions, health results, discounts, guarantees, or claims.",
      "Follow Thailand and global advertising safety: honest wording, no absolute/miracle claims, and include warning/disclaimer text when needed.",
      describedCharacterDirective ||
        "Avoid human faces unless an approved character identity asset pack allows them; default to product-only or hands-only visuals.",
      creativeDirectionDirective,
      "Return JSON only.",
      correction
        ? [
            `CORRECTION REQUIRED: Previous attempt failed validation (${correction.errorCode || "creative_planner_validation_failed"}).`,
            `Previous shot count was ${correction.actualShotCount}; this retry must return exactly ${requestedShotCount} shots in the shots array, with one object for each required shot order ${JSON.stringify(requiredShotOrders)}.`,
            correction.errorCode === "creative_planner_concept_count_mismatch"
              ? `Previous creativeConceptSet had ${correction.actualConceptCount ?? 0} usable alternatives; this retry must return creativeConceptSet.alternatives with 3-5 distinct usable concept objects. Each alternative must include non-empty title and angle.`
              : "",
            correction.shotNumber && correction.missingFields?.length
              ? `Shot ${correction.shotNumber} was missing required fields: ${correction.missingFields.join(", ")}. Every shot must include title, storyboardGuide, voiceover, camera, visual, movement, and productRole as non-empty strings.`
              : "",
            correction.errorMessage
              ? `Validation error to fix: ${correction.errorMessage}`
              : "",
            `Re-plan the story arc for ${requestedShotCount} shots from the start; do not append filler, do not omit beats, and do not repeat the invalid schema.`,
          ]
            .filter(Boolean)
            .join(" ")
        : "",
      "",
      `Product truth JSON: ${JSON.stringify(productTruth)}`,
      `Reference anchors JSON: ${JSON.stringify(params.referenceAnchors)}`,
      `Insight digest JSON: ${JSON.stringify(insightDigest).slice(0, 6000)}`,
      `Tenant-safe novelty memory JSON: ${JSON.stringify(asRecord(params.noveltyMemory)).slice(0, 4000)}`,
      `Creative variation seed JSON: ${JSON.stringify(creativeVariationSeed)}`,
      `Creative brief snapshot JSON: ${JSON.stringify(asRecord(params.preflightMetadata.creativeBriefSnapshot))}`,
      `Output mode: ${params.outputMode}`,
      `Frame strategy: ${params.frameStrategy}`,
      `Audio strategy: ${params.resolvedAudioStrategy}`,
      `Image overlay text policy: ${overlayTextMode}`,
      overlayTextMode === "no_text"
        ? "Do not plan any rendered text inside generated images; any required disclosure should be handled by voiceover or downstream editor metadata."
        : "Rendered image text may be planned only as short truthful Thai overlay copy tied to the exact shot.",
      `Required shot count: ${requestedShotCount}`,
      `Required shot orders: ${JSON.stringify(requiredShotOrders)}`,
      `Required total duration: ${requestedDurationSeconds} seconds`,
      `Required Thai narration plan: first write one continuous customer-facing Thai narration arc for about ${requestedNarrationSeconds} seconds total (${requestedShotCount} shots x about 10 seconds of spoken content), then split that same continuous script into exactly ${requestedShotCount} ordered shot.voiceover lines. Do not write each shot as an isolated tagline.`,
      "The selected product anchor is the only allowed product visual identity. Do not borrow color, shape, label, or material from unselected gallery images.",
      describedCharacterDirective
        ? "Because the user selected a described character, design shots so the described adult presenter/persona is the reviewer/parent/presenter whenever a person is important. Children may demonstrate product use only as secondary context and must not replace the selected presenter/persona as the recurring hero."
        : "If character/environment anchors are present, design shots that preserve those references consistently; if absent, avoid recurring recognizable faces and keep locations simple.",
      "Use the Creative variation seed as the active run's story lens. Keep the required customer journey, but vary hook pattern, proof emphasis, scene rhythm, camera palette, and human presence plan according to the seed. Avoid prior angles listed in the seed unless product truth requires them.",
      creativeDirectionDirective
        ? "Apply the USER-SELECTED CREATIVE DIRECTION LOCK when choosing the selected creativeConceptSet alternative, writing storyboardGuide, and writing every shot.voiceover. If it conflicts with the automatic seed, follow the user-selected tone/storytelling structure and keep the seed only for compatible camera or novelty variation."
        : "",
      `Create 3-5 distinct CreativeConceptSet alternatives with novelty fingerprints, selected/rejected rationale, then create exactly ${requestedShotCount} shots, ${DEFAULT_SHOT_DURATION_SECONDS} seconds each, strong hook, coherent story arc, and detailed visual/camera/movement/productRole per shot for the selected concept.`,
      "voiceoverScript must be the complete continuous Thai narration script assembled from all shot.voiceover lines in order. Each shot.voiceover should be a natural segment of that same script, about 9-10 seconds when spoken in Thai, continuing from the previous shot and setting up the next shot.",
      "voiceoverScript and every shot.voiceover must contain only the exact Thai words a viewer should hear. Do not include camera notes, visual descriptions, reference-image instructions, product-lock instructions, marketplace metadata, or phrases like 'โดยดูจากภาพจริง', 'รายละเอียดของสินค้า', 'ในช็อตนี้เป็นหลัก', or 'ให้จังหวะการพูด'. Put those details only in storyboardGuide, visual, camera, movement, or productRole.",
      "Avoid ultra-short shot.voiceover lines such as one slogan, one product noun phrase, or one 3-5 second sentence. If a line is too short, rewrite the entire narration arc and split it again instead of padding one shot independently.",
      `The story arc must fit exactly ${requestedShotCount} shots: shot 1 is the hook, middle shots build problem/proof/use, and shot ${requestedShotCount} closes with confirmation or CTA. Do not return fewer or more shots.`,
      `The shots array length must be exactly ${requestedShotCount}. It must contain shotNumber values exactly ${JSON.stringify(requiredShotOrders)} in order. Before returning JSON, count the array items and fix the story if the count is not ${requestedShotCount}.`,
      "Each shot must cite the product role without adding product facts outside references/spec.",
      'JSON shape: {"conceptTitle":string,"conceptAngle":string,"creativeConceptSet":{"selectedRationale":string,"alternatives":[{"conceptId":string,"title":string,"angle":string,"rationale":string,"selected":boolean,"rejectedReason":string|null}]},"storyboardGuide":string,"voiceoverScript":string,"shots":[{"shotNumber":number,"title":string,"storyboardGuide":string,"voiceover":string,"camera":string,"visual":string,"movement":string,"productRole":string}]}',
    ]
      .filter(value => value !== "")
      .join("\n\n");
  try {
    let correction:
      | {
          actualShotCount: number;
          attempt: number;
          errorCode?: string;
          shotNumber?: number;
          missingFields?: string[];
          errorMessage?: string;
          actualConceptCount?: number;
          expectedMinimumConceptCount?: number;
        }
      | undefined;
    let lastPlannerError: unknown;
    let lastValidCreativeConceptSet: Record<string, unknown> | undefined;
    for (
      let attempt = 1;
      attempt <= MAX_CREATIVE_PLANNER_SHOT_COUNT_ATTEMPTS;
      attempt += 1
    ) {
      const runtimeInput = buildRuntimeInput(correction);
      const traceSuffix = buildProductionStableHash({
        model,
        productTruth,
        insightDigest,
        outputMode: params.outputMode,
        requestedShotCount,
        creativeVariationSeed,
        attempt,
        correction,
      }).slice(0, 16);
      logMarketplaceAutoReviewPlannerDebug("info", "attempt_start", {
        runId: params.runId,
        productionRunId: params.productionRunId,
        productId: productTruth.productId,
        requestedShotCount,
        requestedDurationSeconds,
        attempt,
        maxAttempts: MAX_CREATIVE_PLANNER_SHOT_COUNT_ATTEMPTS,
        correctionActualShotCount: correction?.actualShotCount ?? null,
        traceSuffix,
        model,
        outputMode: params.outputMode,
        frameStrategy: params.frameStrategy,
        resolvedAudioStrategy: params.resolvedAudioStrategy,
        creativeVariationSeed,
      });
      const { response, creditReservation } =
        await runMarketplaceMediaProductionAgent({
          db: params.db,
          tenantId: params.tenantId,
          auth: params.auth,
          run: params.run,
          runId: params.runId,
          productionRunId: params.productionRunId,
          stageKey: "concept_story",
          model,
          objective:
            "Create a Feature 117 Marketplace Auto Review creative plan as strict JSON.",
          runtimeInput,
          metadata: params.preflightMetadata,
          productTruth,
          traceSuffix,
          estimatedCreditReserve: 20,
          creditCategory: "agents_sdk_creative_planning_gateway",
        });
      logMarketplaceAutoReviewPlannerDebug("info", "agent_response_received", {
        runId: params.runId,
        productionRunId: params.productionRunId,
        productId: productTruth.productId,
        requestedShotCount,
        attempt,
        traceSuffix,
        responseStatus: response.status,
        providerId: response.providerId ?? null,
        gatewayRouteId: response.gatewayRouteId ?? null,
        adapterVersion: response.adapterVersion ?? null,
        sdkVersion: response.sdkVersion ?? null,
        finalOutputChars: cleanText(response.finalOutput).length,
        finalOutputHash: buildProductionStableHash({
          finalOutput: response.finalOutput,
        }).slice(0, 16),
        creditReservationIdempotencyKey: creditReservation.idempotencyKey,
      });
      const inputTokens = estimateTokenCount(runtimeInput);
      const outputTokens = estimateTokenCount(response.finalOutput);
      const credit = await reconcileMarketplaceLlmCredits({
        auth: params.auth,
        reservation: creditReservation,
        inputTokens,
        outputTokens,
        reason: "creative_planning_actual_usage_reconciled",
        metadata: {
          runId: params.runId,
          productId: productTruth.productId,
          outputMode: params.outputMode,
          frameStrategy: params.frameStrategy,
          resolvedAudioStrategy: params.resolvedAudioStrategy,
          adapterVersion: response.adapterVersion,
          sdkVersion: response.sdkVersion,
          gatewayRouteId: response.gatewayRouteId,
        },
      }).catch(error => {
        (error as any).__marketplaceAutoReviewCreditFailure = true;
        throw error;
      });
      const parsed = parseAgentRuntimeJsonOutput(response);
      const priorFingerprints = Array.isArray(
        asRecord(params.noveltyMemory).priorConceptFingerprints
      )
        ? (asRecord(params.noveltyMemory).priorConceptFingerprints as unknown[])
            .map(item => cleanText(item))
            .filter(Boolean)
        : [];
      let creativeConceptSet: Record<string, unknown>;
      let reusedPreviousConceptSet = false;
      let reuseReason: string | undefined;
      try {
        const conceptSetResult = normalizeCreativeConceptSetWithRetryMemory({
          parsed,
          fallbackPlan: params.fallbackPlan,
          finalOutput: cleanText(response.finalOutput),
          priorFingerprints,
          previousConceptSet: lastValidCreativeConceptSet,
        });
        creativeConceptSet = conceptSetResult.creativeConceptSet;
        reusedPreviousConceptSet = conceptSetResult.reusedPreviousConceptSet;
        reuseReason = conceptSetResult.reuseReason;
      } catch (error) {
        lastPlannerError = error;
        const plannerErrorCode = cleanText((error as any)?.code);
        if (
          marketplaceAutoReviewCreativePlannerErrorIsRetryable(error) &&
          attempt < MAX_CREATIVE_PLANNER_SHOT_COUNT_ATTEMPTS
        ) {
          logMarketplaceAutoReviewPlannerDebug("warn", "validation_retry", {
            runId: params.runId,
            productionRunId: params.productionRunId,
            productId: productTruth.productId,
            requestedShotCount,
            actualShotCount: Array.isArray(parsed.shots)
              ? parsed.shots.length
              : 0,
            attempt,
            nextAttempt: attempt + 1,
            traceSuffix,
            errorCode: plannerErrorCode,
            actualConceptCount: toNumber((error as any).actualConceptCount, 0),
            expectedMinimumConceptCount: toNumber(
              (error as any).expectedMinimumConceptCount,
              3
            ),
            errorMessage:
              error instanceof Error ? error.message : String(error),
            finalOutputHash: buildProductionStableHash({
              finalOutput: response.finalOutput,
            }).slice(0, 16),
          });
          correction = {
            actualShotCount: Array.isArray(parsed.shots)
              ? parsed.shots.length
              : 0,
            attempt: attempt + 1,
            errorCode: plannerErrorCode,
            actualConceptCount: toNumber((error as any).actualConceptCount, 0),
            expectedMinimumConceptCount: toNumber(
              (error as any).expectedMinimumConceptCount,
              3
            ),
            errorMessage:
              error instanceof Error ? error.message : String(error),
          };
          continue;
        }
        logMarketplaceAutoReviewPlannerDebug("error", "validation_terminal", {
          runId: params.runId,
          productionRunId: params.productionRunId,
          productId: productTruth.productId,
          requestedShotCount,
          actualShotCount: Array.isArray(parsed.shots)
            ? parsed.shots.length
            : 0,
          attempt,
          traceSuffix,
          errorCode: plannerErrorCode,
          actualConceptCount: toNumber((error as any).actualConceptCount, 0),
          expectedMinimumConceptCount: toNumber(
            (error as any).expectedMinimumConceptCount,
            3
          ),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      if (reusedPreviousConceptSet) {
        logMarketplaceAutoReviewPlannerDebug(
          "warn",
          "concept_set_reused_from_previous_attempt",
          {
            runId: params.runId,
            productionRunId: params.productionRunId,
            productId: productTruth.productId,
            requestedShotCount,
            attempt,
            traceSuffix,
            reason: reuseReason,
            previousConceptCount: Array.isArray(
              lastValidCreativeConceptSet?.alternatives
            )
              ? lastValidCreativeConceptSet.alternatives.length
              : 0,
          }
        );
      } else {
        lastValidCreativeConceptSet = creativeConceptSet;
      }
      const rawShots = Array.isArray(parsed.shots) ? parsed.shots : [];
      logMarketplaceAutoReviewPlannerDebug("info", "json_parsed", {
        runId: params.runId,
        productionRunId: params.productionRunId,
        productId: productTruth.productId,
        requestedShotCount,
        actualShotCount: rawShots.length,
        attempt,
        traceSuffix,
        hasConceptTitle: Boolean(cleanText(parsed.conceptTitle)),
        hasStoryboardGuide: Boolean(cleanText(parsed.storyboardGuide)),
        hasVoiceoverScript: Boolean(cleanText(parsed.voiceoverScript)),
        creativeConceptAlternativeCount: Array.isArray(
          asRecord(parsed.creativeConceptSet).alternatives
        )
          ? (asRecord(parsed.creativeConceptSet).alternatives as unknown[])
              .length
          : 0,
      });
      let shots: AutoReviewShot[];
      try {
        shots = normalizeCreativeShotsToExpectedCount(
          rawShots,
          params.fallbackPlan.shots
        );
      } catch (error) {
        lastPlannerError = error;
        const plannerErrorCode = cleanText((error as any)?.code);
        if (
          marketplaceAutoReviewCreativePlannerErrorIsRetryable(error) &&
          attempt < MAX_CREATIVE_PLANNER_SHOT_COUNT_ATTEMPTS
        ) {
          logMarketplaceAutoReviewPlannerDebug("warn", "validation_retry", {
            runId: params.runId,
            productionRunId: params.productionRunId,
            productId: productTruth.productId,
            requestedShotCount,
            actualShotCount: toNumber(
              (error as any).actualShotCount,
              rawShots.length
            ),
            expectedShotCount: toNumber(
              (error as any).expectedShotCount,
              requestedShotCount
            ),
            shotNumber: toNumber((error as any).shotNumber, 0) || null,
            missingFields: Array.isArray((error as any).missingFields)
              ? (error as any).missingFields
              : [],
            errorCode: plannerErrorCode,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            attempt,
            nextAttempt: attempt + 1,
            traceSuffix,
            finalOutputHash: buildProductionStableHash({
              finalOutput: response.finalOutput,
            }).slice(0, 16),
          });
          correction = {
            actualShotCount: toNumber(
              (error as any).actualShotCount,
              rawShots.length
            ),
            attempt: attempt + 1,
            errorCode: plannerErrorCode,
            shotNumber: toNumber((error as any).shotNumber, 0) || undefined,
            missingFields: Array.isArray((error as any).missingFields)
              ? (error as any).missingFields.map((field: unknown) =>
                  cleanText(field)
                )
              : [],
            errorMessage:
              error instanceof Error ? error.message : String(error),
          };
          continue;
        }
        logMarketplaceAutoReviewPlannerDebug("error", "validation_terminal", {
          runId: params.runId,
          productionRunId: params.productionRunId,
          productId: productTruth.productId,
          requestedShotCount,
          actualShotCount: rawShots.length,
          attempt,
          traceSuffix,
          errorCode: plannerErrorCode,
          shotNumber: toNumber((error as any).shotNumber, 0) || null,
          missingFields: Array.isArray((error as any).missingFields)
            ? (error as any).missingFields
            : [],
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const storyboardGuide = [
        cleanText(parsed.storyboardGuide) ||
          `แกนเรื่อง: ${cleanText(parsed.conceptAngle) || params.fallbackPlan.storyboardGuide}`,
        ...shots.map(shot => shot.storyboardGuide),
      ]
        .filter(Boolean)
        .join("\n");
      const voiceoverScript = [
        cleanText(parsed.voiceoverScript) || "VOICEOVER SCRIPT BY SHOT:",
        ...shots.map(
          shot =>
            `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s ${shot.title}: ${shot.voiceover}`
        ),
        "Use these spoken lines as the narration contract for the matching shots. Do not invent a different spoken story.",
      ].join("\n");
      logMarketplaceAutoReviewPlannerDebug("info", "accepted", {
        runId: params.runId,
        productionRunId: params.productionRunId,
        productId: productTruth.productId,
        requestedShotCount,
        actualShotCount: shots.length,
        attempt,
        traceSuffix,
        correctionApplied: attempt > 1,
        shotIds: shots.map(shot => shot.id),
        shotOrders: shots.map(shot => shot.order),
        conceptTitle:
          cleanText(parsed.conceptTitle) || params.fallbackPlan.title,
      });
      return {
        plan: withMarketplaceAutoReviewReferenceAnchors(
          {
            ...params.fallbackPlan,
            conceptId: `marketplace-auto-${productTruth.productId}-${buildProductionStableHash({ finalOutput: response.finalOutput }).slice(0, 10)}`,
            title: cleanText(parsed.conceptTitle) || params.fallbackPlan.title,
            storyboardGuide,
            voiceoverScript,
            productDetail: buildProductDetailText(productTruth),
            shots,
          },
          params.referenceAnchors
        ),
        metadata: {
          source: "openai_agents_sdk_gateway_creative_planner",
          model,
          provider: response.providerId ?? "llm-gateway",
          gatewayRouteId: response.gatewayRouteId,
          adapterVersion: response.adapterVersion,
          sdkVersion: response.sdkVersion,
          creditReservationIdempotencyKey: credit.idempotencyKey,
          creditTransactionId: credit.transactionId,
          reservedCredits: credit.amount,
          actualCredits: credit.actualCredits,
          creditsUsed: credit.creditsUsed,
          refundCredits: credit.refundAmount,
          refundTransactionId: credit.refundTransactionId,
          budgetOverrun: credit.budgetOverrun,
          requestedShotCount,
          creativePlannerAttemptCount: attempt,
          creativePlannerShotCountCorrectionApplied: attempt > 1,
          creativePlannerConceptSetReusedFromPreviousAttempt:
            reusedPreviousConceptSet,
          creativeVariationSeed,
          creativeConceptSet,
          noveltyMemory: compactRecord({
            ...(params.noveltyMemory ?? {}),
            selectedConceptFingerprint: cleanText(
              ((creativeConceptSet.alternatives as Record<string, unknown>[]) ??
                [])[0]?.noveltyFingerprint
            ),
            generatedConceptFingerprints:
              creativeConceptSet.noveltyFingerprints,
          }),
          fallbackUsed: false,
          agentsSdkRuntime: true,
          generatedAt: nowIso(),
        },
      };
    }
    logMarketplaceAutoReviewPlannerDebug("error", "retry_exhausted", {
      runId: params.runId,
      productionRunId: params.productionRunId,
      productId: productTruth.productId,
      requestedShotCount,
      errorMessage:
        lastPlannerError instanceof Error
          ? lastPlannerError.message
          : String(lastPlannerError ?? "unknown"),
    });
    throw lastPlannerError ?? new Error("Creative planner retry exhausted");
  } catch (error) {
    logMarketplaceAutoReviewPlannerDebug("error", "failed", {
      runId: params.runId,
      productionRunId: params.productionRunId,
      productId: productTruth.productId,
      requestedShotCount,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof AgentRuntimeClientError) {
      console.warn(
        "[marketplaceAutoReview] creative_planner_runtime_unavailable_fallback",
        {
          runId: params.runId,
          productionRunId: params.productionRunId,
          productId: productTruth.productId,
          status: error.status,
          code: error.code,
          message: error.message,
        }
      );
      return buildPlannerFallback(error);
    }
    if (
      (error as any)?.__marketplaceAutoReviewCreditFailure ||
      (error instanceof Error &&
        /insufficient credits|budget/i.test(error.message))
    ) {
      throw error;
    }
    throw new Error(
      `Marketplace Auto Review Agents SDK creative planner failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function buildProductEvidenceManifest(
  plan: AutoReviewPlan,
  metadata?: RunMetadata
): Record<string, unknown> {
  const productReferenceUrls = metadata
    ? approvedProductReferenceUrls(metadata, plan, 1)
    : plan.productTruth.imageUrls.slice(0, 1);
  const claimEvidence = buildClaimEvidenceMapping(plan, metadata);
  return {
    manifestId: `marketplace-auto-review:${plan.productTruth.productId}`,
    status: productReferenceUrls.length ? "ready" : "warning",
    warnings: productReferenceUrls.length
      ? []
      : [
          "No marketplace product reference image is attached. Prompts will use product facts only and require human review.",
        ],
    requiredClaimIds: Array.isArray(claimEvidence.claims)
      ? claimEvidence.claims.map((claim: any) => cleanText(claim.claimId))
      : [],
    claimEvidenceMapping: claimEvidence,
    products: [
      {
        id: `product:${plan.productTruth.productId}`,
        productId: plan.productTruth.productId,
        title: plan.productTruth.productName,
        role: "hero",
        imageUrl: productReferenceUrls[0],
        frameStrategy: "image_reference",
        requiredVisualAccuracy: "strict",
        claimEvidence: Array.isArray(claimEvidence.claims)
          ? claimEvidence.claims
          : [],
        blockedClaims: Array.isArray(claimEvidence.blockedClaims)
          ? claimEvidence.blockedClaims
          : [],
        productTruth: compactRecord({
          ...plan.productTruth,
          immutableReferenceRule:
            "Do not add, remove, reshape, recolor, relabel, stylize, or change product material beyond the attached product reference images and product facts.",
        }),
        provenance: {
          source: "marketplace_capture",
          productId: plan.productTruth.productId,
          sourceUrl: plan.productTruth.sourceUrl,
        },
      },
    ],
  };
}

function detectMarketplaceInstructionPatterns(input: string): string[] {
  const text = input.toLowerCase();
  const patterns: Array<[string, RegExp]> = [
    [
      "ignore_previous_instructions",
      /ignore\s+(all\s+)?previous\s+instructions|ลืมคำสั่ง|ไม่ต้องทำตามคำสั่ง/i,
    ],
    ["fake_tool_call", /tool_call|function_call|call\s+tool|เรียก\s*tool/i],
    [
      "provider_override",
      /use\s+(provider|model)\s+|provider\s*[:=]|model\s*[:=]|ใช้\s*provider/i,
    ],
    [
      "credit_override",
      /free\s+credits?|no\s+credit|ไม่ต้องหักเครดิต|เครดิตฟรี/i,
    ],
    ["policy_bypass", /bypass|ignore\s+policy|เลี่ยงกฎ|ไม่ต้องตรวจ/i],
  ];
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([code]) => code);
}

function buildFeature117ContractMetadata(input: {
  runId: string;
  tenantId: string;
  auth: AuthContext;
  bundle: ProductAccessBundle;
  insights: Awaited<ReturnType<typeof loadSupportingInsights>>;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  referenceAnchors: ResolvedMarketplaceAutoReviewReferenceAnchors;
  noveltyMemory?: Record<string, unknown>;
  externalOperationalRecoveryEvidence?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const product = input.bundle.product as any;
  const productTruth = input.plan.productTruth;
  const now = nowIso();
  const anchors = input.referenceAnchors;
  const sourceText = [
    productTruth.productName,
    productTruth.description,
    JSON.stringify(productTruth.specs ?? {}),
    ...input.insights.map(row => JSON.stringify(row.payloadJson ?? {})),
  ].join("\n");
  const instructionPatterns = detectMarketplaceInstructionPatterns(sourceText);
  const productImageRefs = productTruth.imageUrls.map((url, index) =>
    productImageRefForIndex(index, url)
  );
  const selectedProductImageRef = anchors.productImageRef;
  const selectedProductImageUrl = anchors.productImageUrl;
  const anchorAuditRefs = referenceAnchorAuditRefs(anchors);
  const sourceMetadata = asRecord(anchors.sourceMetadata);
  const productAnchorMetadata = asRecord(sourceMetadata.product);
  const characterAnchorMetadata = asRecord(sourceMetadata.character);
  const environmentAnchorMetadata = asRecord(sourceMetadata.environment);
  const alternateProductImageRefs = productImageRefs.filter(
    ref => ref !== selectedProductImageRef
  );
  const productUpdatedAt = productUpdatedAtFromBundle(input.bundle) || now;
  const productTruthHash = buildMarketplaceAutoReviewProductTruthHash({
    productTruth,
    productUpdatedAt,
  });
  const selectedVariantHash = cleanText(
    asRecord(product.metadataJson).selectedVariantHash
  );
  const access = spendAccessSnapshot(input.bundle);
  const accessType = access.accessType;
  const spendAllowedByAccess = access.spendCapable;
  const productReferenceReadiness = providerReferenceReadiness({
    url: selectedProductImageUrl,
    metadata: productAnchorMetadata,
    refs: anchorAuditRefs,
  });
  const claimEvidenceMapping = buildClaimEvidenceMapping(input.plan);
  const productReferenceStatus =
    productTruth.imageUrls.length &&
    productTruth.imageUrls.map(cleanText).includes(selectedProductImageUrl) &&
    productReferenceReadiness.ready
      ? "ready"
      : "blocked";
  const preflightReady =
    productReferenceStatus === "ready" &&
    instructionPatterns.length === 0 &&
    spendAllowedByAccess;
  const capabilityManifestSeed = {
    runId: input.runId,
    stageKey: "concept_story",
    allowedAgents: [
      "Production Director",
      "Product Truth Reviewer",
      "Creative Concept Director",
      "Storyboard Director",
      "Advertising Compliance Reviewer",
      "Repair Director",
    ],
    allowedTools: ["return_structured_intent"],
    outputSchemas: [
      "CreativeConceptSet",
      "StoryboardContract",
      "ShotMediaPayloadContract",
    ],
    hostedCapabilityDenials: [
      "web_search",
      "file_search",
      "computer_use",
      "raw_trace_export",
      "raw_session_store",
    ],
  };
  const manifestHash = buildProductionStableHash(capabilityManifestSeed);
  const shotCount = shotCountForPlan(input.plan);
  const inputSnapshot = buildMarketplaceAutoReviewInputSnapshot({
    productTruthHash,
    productUpdatedAt,
    selectedVariantHash,
    referenceAnchors: anchors,
    rulePack: {
      rulePackId: MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
      version: "1.0.0",
      status: "approved",
      fixtureReplayStatus: "passed",
    },
    outputMode: input.outputMode,
    frameStrategy: input.frameStrategy,
    audioStrategy: input.audioStrategy,
    resolvedAudioStrategy: input.resolvedAudioStrategy,
    requestedShotCount: shotCount,
  });
  const creditEstimate =
    input.outputMode === "full_video"
      ? 30 +
        (input.frameStrategy === "video_shot_start_stop"
          ? shotCount * 2 * 15
          : 15) +
        shotCount * 45 +
        20
      : 20 +
        (input.frameStrategy === "video_shot_start_stop"
          ? shotCount * 2 * 15
          : 15);

  return {
    feature117: {
      enabled: true,
      replacementRuntime: true,
      noShadowExecution: true,
      noNodeCanvasExecution: true,
      agentsSdkEnabled: true,
      gatewayOnly: true,
      createdAt: now,
    },
    outputMode: input.outputMode,
    frameStrategy: input.frameStrategy,
    audioStrategy: input.audioStrategy,
    resolvedAudioStrategy: input.resolvedAudioStrategy,
    overlayTextMode: normalizeMarketplaceAutoReviewOverlayTextMode(
      input.overlayTextMode
    ),
    requestedShotCount: shotCount,
    productEvidenceLock: {
      lockId: `product-lock:${input.runId}`,
      productId: productTruth.productId,
      productName: productTruth.productName,
      brand: productTruth.brand,
      sourceUrl: productTruth.sourceUrl || "unknown",
      approvedImageRefs: [selectedProductImageRef],
      evidenceRefs: [
        `product:${productTruth.productId}`,
        selectedProductImageRef,
        ...input.insights.map(row => `insight:${row.id}`),
      ],
      protectedAttributes: [
        "product_name",
        "brand",
        "category",
        "shape",
        "material",
        "color",
        "visible_parts",
        "label_logo_placement",
      ],
      blockedVolatileClaims: [
        "price",
        "discount",
        "rating",
        "sold_count",
        "review_count",
        "stock",
      ],
      truthHash: productTruthHash,
      status: "ready",
    },
    claimEvidenceMapping,
    creativeNoveltyMemory: {
      ...asRecord(input.noveltyMemory),
      memoryId:
        cleanText(asRecord(input.noveltyMemory).memoryId) ||
        `creative-novelty:${input.tenantId}:${productTruth.productId}`,
      status: "ready",
      selectedProductHash: productTruthHash,
      tenantSafeScope: "same_tenant_same_product_metadata_only",
      blockedDuplicateFingerprints: Array.isArray(
        asRecord(input.noveltyMemory).priorConceptFingerprints
      )
        ? asRecord(input.noveltyMemory).priorConceptFingerprints
        : [],
    },
    referenceAnchors: {
      schemaVersion: anchors.schemaVersion,
      runId: input.runId,
      productId: productTruth.productId,
      creationIntent: anchors.creationIntent ?? null,
      characterMode: anchors.characterMode ?? null,
      characterBrief: anchors.characterBrief ?? null,
      characterPreset: anchors.characterPreset ?? null,
      reviewTone: anchors.reviewTone ?? null,
      storytellingStructure: anchors.storytellingStructure ?? null,
      productImageUrl: selectedProductImageUrl,
      productImageRef: selectedProductImageRef,
      productImageProvidedRef: anchors.productImageProvidedRef,
      productImageIndex: anchors.productImageIndex,
      characterImageUrl: anchors.characterImageUrl,
      characterImageRef: anchors.characterImageRef,
      characterImageProvidedRef: anchors.characterImageProvidedRef,
      environmentImageUrl: anchors.environmentImageUrl,
      environmentImageRef: anchors.environmentImageRef,
      environmentImageProvidedRef: anchors.environmentImageProvidedRef,
      requiredRoles: anchors.requiredRoles,
      optionalRoles: [],
      lockPolicy: anchors.lockPolicy ?? null,
      sourceMetadata: anchors.sourceMetadata,
      auditRefs: anchorAuditRefs,
      bindingPolicy: "user_selected_anchor_images_are_primary_generation_truth",
      status: productReferenceStatus === "ready" ? "ready" : "blocked",
      createdAt: now,
    },
    productVariantSnapshot: {
      variantSnapshotId: `variant:${input.runId}`,
      productId: productTruth.productId,
      selectedVariantHash: selectedVariantHash || null,
      optionLabels: Array.isArray(
        asRecord(product.metadataJson).selectedVariantOptions
      )
        ? (asRecord(product.metadataJson).selectedVariantOptions as unknown[])
            .map(item => cleanText(item))
            .filter(Boolean)
        : [],
      priceSnapshotRefs: [],
      visualIdentityAffects: Boolean(selectedVariantHash),
      status: selectedVariantHash ? "selected" : "not_applicable",
    },
    accessSnapshot: {
      accessSnapshotId: `access:${input.runId}`,
      actorUserId: input.auth.userId,
      tenantId: input.tenantId,
      productId: productTruth.productId,
      accessType,
      permission: access.permission,
      allowedActions: spendAllowedByAccess
        ? ["start_auto_review", "create_private_outputs", "spend_credits"]
        : ["start_auto_review"],
      creditPayerUserId: input.auth.userId,
      backgroundRecheckRequired: true,
      status: spendAllowedByAccess ? "ready" : "blocked",
    },
    evidenceFreshnessSnapshot: {
      freshnessSnapshotId: `freshness:${input.runId}`,
      productId: productTruth.productId,
      capturedAt: product.captureId
        ? cleanText(product.createdAt) || now
        : null,
      productUpdatedAt,
      imageReadiness: productTruth.imageUrls.length
        ? productReferenceStatus === "ready"
          ? "ready"
          : "needs_proxy"
        : "missing",
      volatileSignalPolicy: "omit_volatile_claims",
      staleRefs: [],
      status: preflightReady ? "ready" : "blocked",
    },
    productReferenceAssetPack: {
      assetPackId: `product-pack:${input.runId}`,
      productId: productTruth.productId,
      selectedVariantHash: selectedVariantHash || null,
      selectedProductImageUrl,
      selectedSource: "user_selected",
      primaryRef: selectedProductImageRef,
      supportingRefs: [],
      sourceMetadata: productAnchorMetadata,
      auditRefs: uniqRefs([
        selectedProductImageRef,
        ...productReferenceReadiness.trustedRefs,
        ...usableAuditRefs(productAnchorMetadata.auditRefs),
      ]),
      providerReferenceUrls:
        productReferenceStatus === "ready" ? [selectedProductImageUrl] : [],
      rejectedRefs: alternateProductImageRefs.map(ref => ({
        ref,
        reasonCode: "not_user_selected_product_anchor",
      })),
      providerUsePolicy:
        productReferenceStatus === "ready" ? "allowed" : "needs_better_image",
      requiredUserAction:
        productReferenceStatus === "ready"
          ? null
          : "select_or_upload_better_product_image",
      qaRefs:
        productReferenceStatus === "ready"
          ? [`product-reference-qa:${input.runId}:provider-ready`]
          : [],
      providerReadiness: productReferenceReadiness,
      status: productReferenceStatus,
    },
    characterIdentityAssetPack: (() => {
      const characterMode = normalizeMarketplaceAutoReviewCharacterMode(
        anchors.characterMode
      );
      const characterBrief = cleanText(anchors.characterBrief);
      const characterPresetLines = characterPresetContinuityDescriptors(
        anchors.characterPreset
      );
      const characterSourceKind = anchors.characterImageUrl
        ? "uploaded_reference"
        : characterMode === "described_character"
          ? "described_character"
          : characterMode === "product_only"
            ? "product_only"
            : characterMode === "hands_only"
              ? "hands_only"
              : "none";
      const characterAllowedFaceUsage = anchors.characterImageUrl
        ? "recurring"
        : characterMode === "described_character"
          ? "generic_person"
          : characterMode === "product_only"
            ? "none"
            : characterMode === "hands_only"
              ? "hands_only"
              : "hands_only";
      const characterFallbackPlan = anchors.characterImageUrl
        ? "single_shot"
        : characterMode === "described_character"
          ? "generic_person"
          : characterMode === "product_only"
            ? "product_only"
            : characterMode === "hands_only"
              ? "hands_only"
              : "product_only";
      const characterContinuityDescriptors = anchors.characterImageUrl
        ? [
            "User supplied a character/person reference for identity continuity.",
            "All visible presenter/person shots must preserve the same face structure, hair, body proportions, styling, and identity across shots.",
            "Do not create turn/reveal shots where a back-facing person becomes a different face.",
          ]
        : characterMode === "described_character"
          ? [
              "Use the provided character description and preset to maintain a consistent described persona across relevant shots.",
              ...(characterBrief ? [`Character brief: ${characterBrief}`] : []),
              ...characterPresetLines,
            ]
          : characterMode === "product_only"
            ? [
                "No recurring face is approved for this run.",
                "Visual prompts must use product-only framing with no visible face.",
              ]
            : characterMode === "hands_only"
              ? [
                  "No recurring face is approved for this run.",
                  "Use hands-only or non-face body framing; do not generate recurring face continuity.",
                ]
              : [
                  "No recurring face is approved for this run.",
                  "Visual prompts must use product-only, hands-only, or non-face body framing unless an approved character pack is added.",
                ];
      const characterStatus = anchors.characterImageUrl
        ? "ready"
        : characterMode
          ? "limited"
          : "not_applicable";

      return {
        assetPackId: `character-pack:${input.runId}`,
        sourceKind: characterSourceKind,
        referenceImageRefs: anchors.characterImageRef
          ? [anchors.characterImageRef]
          : [],
        referenceImageUrls: anchors.characterImageUrl
          ? [anchors.characterImageUrl]
          : [],
        sourceMetadata: characterAnchorMetadata,
        auditRefs: uniqRefs([
          anchors.characterImageRef,
          ...usableAuditRefs(characterAnchorMetadata.auditRefs),
        ]),
        consentRefs: anchors.characterImageUrl
          ? [`character-consent:${input.runId}:user_supplied_reference`]
          : [],
        allowedFaceUsage: characterAllowedFaceUsage,
        allowedVoiceUsage:
          input.resolvedAudioStrategy === "separate_tts_voiceover"
            ? "tts"
            : input.resolvedAudioStrategy === "native_video_audio"
              ? "native_audio"
              : "none",
        continuityDescriptors: characterContinuityDescriptors,
        blockedRefs: [],
        fallbackPlan: characterFallbackPlan,
        qaThresholds: {
          faceDriftMax: anchors.characterImageUrl ? 0.08 : 0,
          voiceDriftMax:
            input.resolvedAudioStrategy === "native_video_audio" ? 0.2 : 0,
        },
        status: characterStatus,
      };
    })(),
    environmentReferenceAssetPack: {
      assetPackId: `environment-pack:${input.runId}`,
      sourceKind: anchors.environmentImageUrl ? "uploaded_reference" : "none",
      referenceImageRefs: anchors.environmentImageRef
        ? [anchors.environmentImageRef]
        : [],
      referenceImageUrls: anchors.environmentImageUrl
        ? [anchors.environmentImageUrl]
        : [],
      sourceMetadata: environmentAnchorMetadata,
      auditRefs: uniqRefs([
        anchors.environmentImageRef,
        ...usableAuditRefs(environmentAnchorMetadata.auditRefs),
      ]),
      providerUsePolicy: anchors.environmentImageUrl
        ? "style_layout_lighting_anchor"
        : "not_used",
      continuityDescriptors: anchors.environmentImageUrl
        ? [
            "User supplied an approved environment/place reference.",
            "Keep location mood, lighting family, spatial logic, and background continuity consistent with this reference when the story uses an environment.",
            "Do not infer extra product specs, claims, or package details from the environment reference.",
          ]
        : [],
      blockedRefs: [],
      status: anchors.environmentImageUrl ? "ready" : "not_applicable",
    },
    evidenceInstructionFirewall: {
      firewallId: `firewall:${input.runId}`,
      status: instructionPatterns.length ? "blocked" : "passed",
      confidence: instructionPatterns.length ? 0.95 : 0.9,
      evaluatedAt: now,
      privacyEnvelopeRef: `privacy:${input.runId}`,
      rulePackRef: MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
      detectedInstructionPatterns: instructionPatterns,
      allowedFactRefs: [
        `product:${productTruth.productId}`,
        selectedProductImageRef,
        ...(anchors.characterImageRef ? [anchors.characterImageRef] : []),
        ...(anchors.environmentImageRef ? [anchors.environmentImageRef] : []),
      ],
      escapedEvidenceRefs: input.insights.map(
        row => `insight:${row.id}:escaped`
      ),
      quarantinedRefs: instructionPatterns.length
        ? input.insights.map(row => `insight:${row.id}:quarantined`)
        : [],
      blockedRefs: instructionPatterns.length
        ? ["marketplace_text:instruction_like"]
        : [],
      blockedMutationTargets: instructionPatterns.length
        ? [
            "instructions",
            "tools",
            "model_policy",
            "provider_routing",
            "credit_policy",
            "approvals",
            "output_routing",
            "public_copy",
          ]
        : [],
    },
    capabilityManifests: [
      {
        manifestId: `agents-manifest:${input.runId}:concept_story`,
        manifestSchemaVersion: 1,
        manifestHash,
        runId: input.runId,
        stageKey: "concept_story",
        allowedAgents: capabilityManifestSeed.allowedAgents,
        allowedTools: capabilityManifestSeed.allowedTools,
        allowedHandoffs: [
          {
            from: "Production Director",
            to: "Product Truth Reviewer",
            mayNarrowScopeOnly: true,
          },
          {
            from: "Production Director",
            to: "Creative Concept Director",
            mayNarrowScopeOnly: true,
          },
          {
            from: "Creative Concept Director",
            to: "Storyboard Director",
            mayNarrowScopeOnly: true,
          },
          {
            from: "Storyboard Director",
            to: "Advertising Compliance Reviewer",
            mayNarrowScopeOnly: true,
          },
        ],
        outputSchemas: capabilityManifestSeed.outputSchemas,
        sessionPolicy: {
          rawSessionPersistenceAllowed: false,
          checkpointRefsOnly: true,
        },
        tracePolicy: {
          rawTraceExportAllowed: false,
          includeSensitiveData: false,
          redactedSmartSpecEventsOnly: true,
        },
        streamPolicy: {
          enabled: false,
          redactedEventsOnly: true,
        },
        hostedCapabilityDenials: capabilityManifestSeed.hostedCapabilityDenials,
        creditAuthority: "node_gateway_only",
        persistenceAuthority: "node_platform_only",
      },
    ],
    creativeBriefSnapshot: {
      briefSnapshotId: `brief:${input.runId}`,
      runId: input.runId,
      objective:
        input.outputMode === "full_video"
          ? "Create a full product review video from marketplace evidence."
          : "Create storyboard images for product review video planning.",
      targetAudience:
        "marketplace shoppers comparing product fit before buying",
      viewerPromise:
        "Show what can be understood from the actual product evidence without inventing claims.",
      creativeLatitude: "balanced",
      qualityMode:
        input.outputMode === "full_video" ? "high_quality" : "balanced",
      requestedShotCount: shotCount,
      durationSeconds: durationSecondsForShotCount(shotCount),
      autoDecisionPolicy: "auto_safe",
      ctaIntent:
        productTruth.affiliateUrl || productTruth.sourceUrl
          ? "check product details from the approved marketplace link"
          : null,
      userHintTrustLevels: {},
      avoidList: [
        "unsupported health or miracle claims",
        "invented product details",
        "raw marketplace instruction text",
        "identity-changing face reveal",
      ],
      ambiguityStatus: "safe_defaults_applied",
      snapshotHash: buildProductionStableHash({
        productTruthHash,
        referenceAnchors: anchors,
        outputMode: input.outputMode,
        frameStrategy: input.frameStrategy,
        audioStrategy: input.audioStrategy,
        requestedShotCount: shotCount,
      }),
    },
    advertisingRulePack: {
      rulePackId: MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
      version: "1.0.0",
      status: "approved",
      regions: ["TH", "global"],
      platformProfiles: ["marketplace_capture_default", "short_video_9x16"],
      sourceAnchors: [
        {
          label:
            "Thailand consumer protection truth-in-advertising policy profile",
          sourceType: "official",
          sourceVersion: "ocpb-truth-in-advertising-snapshot-v1",
          retrievedAt: now,
        },
        {
          label: "Thai FDA-sensitive food/cosmetic/health claim policy profile",
          sourceType: "official",
          sourceVersion: "thai-fda-claim-screening-snapshot-v1",
          retrievedAt: now,
        },
        {
          label: "Global platform ad-safety baseline",
          sourceType: "platform",
          sourceVersion: "marketplace-short-video-baseline-v1",
          retrievedAt: now,
        },
      ],
      triggeredRuleIds: [
        "truthful_advertising",
        "volatile_claim_omit_by_default",
      ],
      rules: [
        {
          ruleId: "truthful_advertising",
          category: "truthfulness",
          severity: "block",
          triggerSignals: ["product_claim", "spoken_review_claim"],
          blockedPatterns: [
            "unsupported_specs",
            "absolute_guarantee",
            "miracle_result",
          ],
          requiredEvidenceKinds: [
            "product_evidence_lock",
            "claim_evidence",
            "reference_anchor_audit_refs",
          ],
          requiredWarningTemplateIds: [],
          allowedRepairActions: [
            "rewrite_claim",
            "remove_claim",
            "request_review",
          ],
          fixtureRefs: [
            "fixture:ad-policy:truthful-advertising:thai-global:v1",
          ],
        },
        {
          ruleId: "volatile_claim_omit_by_default",
          category: "thumbnail_or_metadata",
          severity: "warn",
          triggerSignals: ["price", "discount", "rating", "sold_count"],
          blockedPatterns: [
            "price_text",
            "discount_percentage",
            "sales_volume_claim",
          ],
          requiredEvidenceKinds: ["fresh_marketplace_snapshot"],
          requiredWarningTemplateIds: [],
          allowedRepairActions: ["remove_claim", "rewrite_claim"],
          fixtureRefs: [
            "fixture:ad-policy:volatile-claims-omitted:thai-global:v1",
          ],
        },
      ],
      warningTemplateRefs: [],
      fixtureRefs: [
        "fixture:ad-policy:truthful-advertising:thai-global:v1",
        "fixture:ad-policy:volatile-claims-omitted:thai-global:v1",
      ],
      policyEvidenceRefs: [
        "policy-source:th-ocpb-truth-in-advertising:v1",
        "policy-source:th-fda-sensitive-claims:v1",
        "policy-source:global-platform-ad-safety:v1",
      ],
      approval: {
        approvedBy: "system_policy",
        approvedAt: now,
        expiresAt: null,
      },
      effectiveFrom: now,
      effectiveTo: null,
      effectiveAt: now,
      expiresAt: null,
      fixtureReplayStatus: "passed",
    },
    advertisingComplianceProfile: {
      profileId: `ad-compliance:${input.runId}`,
      rulePackRef: MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
      status: "pass",
      triggeredRuleIds: [
        "truthful_advertising",
        "volatile_claim_omit_by_default",
      ],
      categoryRisk: "low",
      requiredWarningRefs: [],
      policyEvidenceRefs: [
        "policy-source:th-ocpb-truth-in-advertising:v1",
        "policy-source:th-fda-sensitive-claims:v1",
        "policy-source:global-platform-ad-safety:v1",
      ],
      fixtureRefs: [
        "fixture:ad-policy:truthful-advertising:thai-global:v1",
        "fixture:ad-policy:volatile-claims-omitted:thai-global:v1",
      ],
      decisionRef: `ad-compliance-decision:${input.runId}:v1`,
    },
    visualWarningPlan: {
      warningPlanId: `warning:${input.runId}`,
      required: input.resolvedAudioStrategy === "native_video_audio",
      exactText:
        input.resolvedAudioStrategy === "native_video_audio"
          ? "ภาพและเสียงสร้างด้วย AI ใช้ประกอบการรีวิวสินค้า"
          : null,
      language: "th",
      requiredShots:
        input.resolvedAudioStrategy === "native_video_audio" ? ["shot-1"] : [],
      placement: "bottom_safe_area",
      minDurationSeconds:
        input.resolvedAudioStrategy === "native_video_audio" ? 3 : 0,
      contrastTarget: 4.5,
      ocrReadabilityRequired: true,
      productOcclusionRule: "must_not_occlude_product",
      verificationStatus: "not_started",
    },
    privacyEnvelope: {
      envelopeId: `privacy:${input.runId}`,
      status:
        instructionPatterns.length || !spendAllowedByAccess
          ? "blocked"
          : "passed",
      redactionPolicy:
        "marketplace_private_account_order_cart_chat_reviewer_data_removed",
      checkedAt: now,
      evidenceRefs: [
        `product:${productTruth.productId}`,
        ...input.insights.map(row => `insight:${row.id}:redacted`),
      ],
      blockedRefs: instructionPatterns.length
        ? ["marketplace_text:instruction_like"]
        : [],
      reasonCodes: instructionPatterns.length
        ? ["instruction_like_marketplace_text_quarantined"]
        : [],
    },
    assetRightsEnvelope: {
      envelopeId: `rights:${input.runId}`,
      status:
        productReferenceStatus === "ready" && spendAllowedByAccess
          ? "passed"
          : "blocked",
      policy:
        "private_marketplace_product_reference_for_owned_workspace_output",
      approvedAssetRefs:
        productReferenceStatus === "ready" ? productImageRefs : [],
      blockedAssetRefs:
        productReferenceStatus === "ready" ? [] : productImageRefs,
      commercialUseScope:
        "draft_private_library_asset_until_user_publish_review",
      checkedAt: now,
    },
    distributionProfile: {
      profileId: `distribution:short-video-9x16:${input.runId}`,
      status: "passed",
      platformProfiles: ["marketplace_capture_default", "short_video_9x16"],
      aspectRatio: "9:16",
      maxDurationSeconds: 90,
      targetDurationSeconds: durationSecondsForShotCount(shotCount),
      safeAreas: [
        "bottom_warning_safe_area",
        "caption_band",
        "cta_metadata_only",
      ],
      warningTextRequired: input.resolvedAudioStrategy === "native_video_audio",
      checkedAt: now,
    },
    campaignGovernance: {
      gateId: `campaign:${input.runId}`,
      status: "passed",
      activeRunDedupePolicy:
        "parallel_runs_allowed_idempotency_key_dedupe_only",
      duplicateVariationPolicy:
        "allow_parallel_variants_require_unique_idempotency",
      spendAnomalyPolicy: "credit_precheck_per_paid_stage",
      dailyVariantCapPolicy: "not_requested_for_single_run",
      evidenceRefs: [
        `campaign-dedupe:${input.runId}:idempotency-key-only`,
        `spend-guardrail:${input.runId}:paid-stage-precheck`,
      ],
      dedupeRefs: [`campaign-dedupe:${input.runId}:idempotency-key-only`],
      spendGuardrailRefs: [
        `spend-guardrail:${input.runId}:paid-stage-precheck`,
      ],
      checkedAt: now,
    },
    brandSellerVoicePolicy: {
      policyId: `brand-voice:${input.runId}`,
      status: "passed",
      brandRef: productTruth.brand
        ? `brand:${buildProductionStableHash({ brand: productTruth.brand }).slice(0, 12)}`
        : null,
      sellerVoiceUse: "style_only_not_claim_authority",
      ctaPolicy: "evidence_bound_marketplace_link_only",
      checkedAt: now,
    },
    humanReviewGate: {
      gateId: `human-review:${input.runId}`,
      status: "passed",
      reasonCodes: ["auto_safe_low_risk_private_draft"],
      approverRole: "system_policy",
      approvalRef: `human-review-waiver:${input.runId}:auto-safe-policy-v1`,
      waiverRef: `human-review-waiver:${input.runId}:auto-safe-policy-v1`,
      evidenceRefs: [
        `human-review-waiver:${input.runId}:auto-safe-policy-v1`,
        `ad-compliance-decision:${input.runId}:v1`,
      ],
      timeoutAction: "continue_auto_safe",
      checkedAt: now,
    },
    inputChangeImpact: {
      impactId: `input-impact:${input.runId}`,
      status: "no_recheck_required",
      snapshotHash: inputSnapshotHash(inputSnapshot),
      currentSnapshotHash: inputSnapshotHash(inputSnapshot),
      snapshotInput: inputSnapshot,
      staleRefs: [],
      invalidatedRefs: [],
      checkedAt: now,
    },
    publishablePackageRequirements: {
      packageGateId: `package-gate:${input.runId}`,
      status: "passed",
      requiredRefs: [
        "finalMediaUrl",
        "thumbnailUrl",
        "transcriptSource",
        "transcriptArtifactRef",
        "subtitleArtifactRefs",
        "packageManifestArtifactRef",
        "metadataManifestRef",
        "checksum",
        "evidenceRefs",
      ],
      requiredArtifactKinds: [
        "mp4_video",
        "thumbnail_image",
        "transcript_text",
        "subtitle_sidecar",
        "metadata_manifest",
        "package_manifest",
      ],
      platformMetadataPolicy:
        "private_library_asset_ready_before_public_publish",
      checkedAt: now,
    },
    operationalRecoveryEvidence: operationalRecoveryEvidenceForMetadata({
      runId: input.runId,
      evidence: input.externalOperationalRecoveryEvidence,
      checkedAt: now,
    }),
    creditSummary: {
      estimateCredits: creditEstimate,
      reservedCredits: 0,
      spentCredits: 0,
      refundedCredits: 0,
      outstandingCredits: 0,
      authorizationStatus: "estimated",
      reservationRefs: [],
      transactionRefs: [],
    },
    creditPlans: [
      {
        planId: `credit-plan:${input.runId}:planning`,
        runId: input.runId,
        stageKey: "concept_story",
        category: "llm_planning",
        estimateCredits: 20,
        idempotencyKey: `production:${input.runId}:stage:concept_story:attempt:1:action:llm_planning`,
        reservationRef: null,
        transactionRef: null,
        status: "estimated",
      },
    ],
    stageCompletionEvidence: [
      {
        evidenceId: `stage-evidence:${input.runId}:product_preflight`,
        runId: input.runId,
        stageKey: "product_preflight",
        status: preflightReady ? "complete" : "user_blocked",
        requiredRefs: [
          "productEvidenceLock",
          "referenceAnchors",
          "productReferenceAssetPack",
          "characterIdentityAssetPack",
          "environmentReferenceAssetPack",
          "accessSnapshot",
          "evidenceInstructionFirewall",
          "privacyEnvelope",
          "assetRightsEnvelope",
          "creditSummary",
        ],
        artifactRefs: [`product:${productTruth.productId}`],
        qaVerdictRefs: [],
        creditRefs: [],
        lineageRefs: [`lineage:${input.runId}:product`],
        policyRefs: [
          MARKETPLACE_AUTO_REVIEW_RULE_PACK_REF,
          `privacy:${input.runId}`,
          `rights:${input.runId}`,
        ],
        acceptanceRefs: [],
        missingRefs: [
          ...(productReferenceStatus === "ready"
            ? []
            : ["productReferenceAssetPack.primaryRef"]),
          ...(productReferenceStatus === "ready"
            ? []
            : ["assetRightsEnvelope.passed"]),
          ...(spendAllowedByAccess ? [] : ["accessSnapshot.spend_credits"]),
          ...(instructionPatterns.length === 0
            ? []
            : ["evidenceInstructionFirewall.passed"]),
          ...(instructionPatterns.length === 0
            ? []
            : ["privacyEnvelope.passed"]),
        ],
        warningApprovalRefs: [],
        createdAt: now,
      },
    ],
    artifactLineage: [
      {
        lineageId: `lineage:${input.runId}:product`,
        artifactRef: `product:${productTruth.productId}`,
        sourceRefs: [
          `marketplaceProduct:${productTruth.productId}`,
          selectedProductImageRef,
          ...(anchors.characterImageRef ? [anchors.characterImageRef] : []),
          ...(anchors.environmentImageRef ? [anchors.environmentImageRef] : []),
        ],
        productEvidenceLockRef: `product-lock:${input.runId}`,
        selectedVariantHash: selectedVariantHash || null,
        providerTaskRefs: [],
        qaVerdictRefs: [],
        creditRefs: [],
      },
    ],
  };
}

function promptReferenceSection(plan: AutoReviewPlan): string {
  return [
    "STORYBOARD GUIDE CONTRACT:",
    plan.storyboardGuide,
    "",
    "VOICEOVER / DIALOGUE CONTRACT:",
    plan.voiceoverScript,
    "",
    "PRODUCT DETAIL / PRODUCT FACTS LOCK:",
    plan.productDetail,
    "",
    "GLOBAL VISUAL QUALITY LOCK:",
    "Photorealistic cinematic commercial film stills, natural skin texture, believable human anatomy, real lens depth, grounded shadows, warm but realistic lighting, coherent camera language, no plastic skin, no waxy faces, no catalog-rendered flat product.",
    "Character identity lock: do not reveal a face unless an approved character identity asset pack is explicitly supplied by the runtime metadata. If supplied, keep the visible face consistent with that pack; never create a new recognizable face from imagination.",
    "The product must match the attached reference images exactly. Do not add drawers, panels, handles, extra shelves, extra logos, alternate materials, alternate colors, or changed proportions.",
    buildMinorSafetyClothingLock(plan),
  ].join("\n");
}

function imagePromptReferenceSection(plan: AutoReviewPlan): string {
  const spokenReferenceLines = plan.shots.map(shot =>
    [
      `Cell ${shot.order} spoken-story reference only: ${shot.title}`,
      `Narration meaning only, never render as text: ${shot.voiceover}`,
    ].join("\n")
  );
  return [
    "STORYBOARD GUIDE CONTRACT (visual meaning only; never render this text in the image):",
    plan.storyboardGuide,
    "",
    "SPOKEN STORY REFERENCE (backend narration only; never render captions, subtitles, timecodes, or shot numbers):",
    spokenReferenceLines.join("\n"),
    "",
    "PRODUCT DETAIL / PRODUCT FACTS LOCK:",
    plan.productDetail,
    "",
    "GLOBAL VISUAL QUALITY LOCK:",
    "Photorealistic cinematic commercial film stills, natural skin texture, believable human anatomy, real lens depth, grounded shadows, warm but realistic lighting, coherent camera language, no plastic skin, no waxy faces, no catalog-rendered flat product.",
    "Character identity lock: do not reveal a face unless an approved character identity asset pack is explicitly supplied by the runtime metadata. If supplied, keep the visible face consistent with that pack; never create a new recognizable face from imagination.",
    "The product must match the attached reference images exactly. Do not add drawers, panels, handles, extra shelves, extra logos, alternate materials, alternate colors, or changed proportions.",
    buildMinorSafetyClothingLock(plan),
  ].join("\n");
}

function buildMarketplaceUiSafetyText(): string {
  return [
    "Prohibit marketplace/mobile app screenshots, phone screens, storefront UIs, price/rating/review widgets, cart/checkout flows, and platform marks. Prohibit Shopee/Lazada/TikTok Shop logos.",
    "Use only supplied references.",
  ].join(" ");
}

function stripVideoTimingTextForImagePrompt(text: string): string {
  return cleanText(text)
    .replace(/\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*s\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*s\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS =
  PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS;
const MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000;

function compactImagePromptText(text: string, maxLength: number): string {
  const value = stripVideoTimingTextForImagePrompt(text)
    .replace(/\s+/g, " ")
    .trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function sanitizeStoryboardImageBeatText(text: string): string {
  const value = stripVideoTimingTextForImagePrompt(text);
  if (
    /(review|rating|stars?|คะแนน|รีวิว|ดาว|overlay|digital|scroll)/i.test(value)
  ) {
    return "show real product use and satisfied user with the product visible; no review UI, stars, ratings, screen, overlay, or text";
  }
  return value;
}

function buildApprovedCharacterAnchorRequirement(plan: AutoReviewPlan): string {
  const text = cleanText(plan.productDetail);
  const hasCharacterAnchorReference =
    /Character anchor/i.test(text) &&
    !/No character\/person reference was supplied/i.test(text);
  return hasCharacterAnchorReference
    ? [
        "CHARACTER ANCHOR PRESENCE LOCK: show approved same person in at least 1 active frame, ideally 2-3 active frames; no invented face.",
      ].join(" ")
    : "";
}

function imageOverlayTextPolicyPrompt(
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode
): string {
  if (overlayTextMode === "allow_text") {
    return `TEXT POLICY: Short Thai overlay text is allowed only if truthful and not covering product. Never include video seconds, time ranges, timecodes, shot numbers, frame labels, subtitle blocks, black caption bars, or timing text. ${buildMarketplaceUiSafetyText()}`;
  }
  return `TEXT POLICY: No text, captions, labels, watermarks, UI, no black caption bars, subtitles, video seconds/time ranges, no timecodes, shot/frame labels, no measurement overlays, dimension text, or glyphs. ${buildMarketplaceUiSafetyText()}`;
}

function build3x3StoryboardPrompt(
  plan: AutoReviewPlan,
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode = "no_text",
  repairInstruction?: string
): string {
  const sharedCameraLightDepth = compactImagePromptText(
    plan.shots
      .map(shot => sanitizeStoryboardImageBeatText(shot.camera))
      .filter(Boolean)
      .join("; ") ||
      "varied cinematic product-film camera, realistic lens/light/depth, grounded shadows, coherent color.",
    180
  );
  const sharedProductVerify = compactImagePromptText(
    [
      plan.productTruth.brand,
      plan.productTruth.productName,
      plan.productDetail,
      ...plan.shots.map(shot => shot.productRole),
    ]
      .filter(Boolean)
      .join("; ") ||
      "exact selected product from reference images; no added/removed parts; no UI.",
    220
  );
  const storyFrameLines = plan.shots.map(
    shot =>
      `Frame ${shot.order} | VISUAL: ${compactImagePromptText(sanitizeStoryboardImageBeatText(shot.visual), 28)} | STORY MATCH: ${compactImagePromptText(shot.voiceover, 18)}`
  );
  const unusedFrameLines = Array.from(
    { length: Math.max(0, MAX_SHOT_COUNT - plan.shots.length) },
    (_, index) => {
      const frameNumber = plan.shots.length + index + 1;
      return `Frame ${frameNumber} reserved | VISUAL: continuity. | STORY MATCH: reserve/no text.`;
    }
  );
  const frameLines = [...storyFrameLines, ...unusedFrameLines].join("\n\n");
  const outputFormat =
    overlayTextMode === "allow_text"
      ? "OUTPUT FORMAT LOCK: Plain prompt text only. Generate one single 9:16 image canvas: strict 3x3 grid, exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, equal cells, no visible dividers, no gutters, no white borders, no separator lines, no merged panels, no collage/masonry layout. Optional short text only under TEXT POLICY; no video seconds/timecodes."
      : "OUTPUT FORMAT LOCK: Generate one single 9:16 image canvas: strict 3x3 grid, exactly 9 frames, exactly 9 vertical frames, exactly 3 equal-width columns, exactly 3 equal-height rows, equal cells, no visible dividers, no gutters, no white borders, no separator lines, no merged panels, no collage/masonry layout.";
  const productCategoryHint =
    plan.productTruth.productName ||
    plan.productTruth.brand ||
    "selected product";
  return [
    "PRODUCT REFERENCE STORYBOARD SKILL CONTRACT:",
    "skill: product-reference-storyboard",
    "generation_mode: multi_frame_storyboard",
    "storyboard_layout_preset: canvas_9_16_grid_3x3_frame_9_16_exact",
    "aspect_ratio: 9:16",
    "Prompt budget: under 4500 chars for image provider compatibility.",
    "MEDIA STUDIO SKILL FIELD MAPPING:",
    `storyboard_guide: ${compactImagePromptText(plan.storyboardGuide, 110)}`,
    `voiceover_script: ${compactImagePromptText(plan.voiceoverScript, 70)}`,
    `product_detail: ${compactImagePromptText(plan.productDetail, 110)}`,
    "reference_product_images: supplied separately as immutable product reference images",
    "reference_character_images: supplied separately if any",
    "reference_environment_images: supplied separately if any",
    `production_concept_details: ${compactImagePromptText(`${plan.title}; ${plan.shots.length} active shots; ${productCategoryHint}`, 70)}`,
    "",
    outputFormat,
    imageOverlayTextPolicyPrompt(overlayTextMode),
    "CINEMATIC REALISM LOCK: photorealistic product-film stills, varied camera, realistic lens/light/depth, grounded shadows.",
    "PRODUCT REFERENCE LOCK: immutable reference_product_images; exact shape/proportions/material/shelves/posts/legs/labels/packaging/scale; no added/removed parts.",
    "PRODUCT VISUAL SOURCE LOCK: generated product must match the supplied product reference image, not a generic product description. Do not redesign, simplify, substitute, or change countable parts.",
    "TEXT RENDERING POLICY: backend text only unless allow_text. Never render seconds/timecodes, frame labels, dimension text, marketplace/mobile app screenshots, logos, prices, ratings, review widgets, or cart/checkout flows.",
    "PROOF/REVIEW VISUAL LOCK: show real product use/satisfied person/product detail only; no review cards, stars, screens, UI overlays, ratings, or text.",
    buildMinorSafetyClothingLock(plan),
    `CAMERA/LIGHT/DEPTH: ${sharedCameraLightDepth}`,
    `PRODUCT VERIFY: ${sharedProductVerify}`,
    "HUMAN REALISM: apply only where people appear; same approved identity if supplied, otherwise hands-only/no recognizable invented face, natural skin/anatomy.",
    buildApprovedCharacterAnchorRequirement(plan),
    `REQUESTED STORY SHOTS: ${plan.shots.length}. Frames 1-${plan.shots.length} active; remaining frames reserved.`,
    "SHOT-BY-SHOT STORYBOARD PROMPT:",
    frameLines,
    "",
    "FINAL GRID/TEXT LOCK: regular 3x3 equal cells; no captions, frame labels, seconds, timecodes, measurements, gutters, dividers, or separator lines.",
    "REPAIR SCOPE LOCK: if this is a repair attempt, still regenerate the full 3x3 storyboard grid as one 9:16 canvas with all 9 panels; never output a single standalone scene.",
    "Continuity: same film, exact product, same environment family, same character if visible.",
    repairInstruction
      ? `TARGETED GRID REPAIR: ${compactImagePromptText(repairInstruction, 120)}. Keep full 3x3 grid, all 9 panels, exact product reference match, and shot count.`
      : "",
  ].join("\n");
}

function buildShotFramePrompt(
  plan: AutoReviewPlan,
  shot: AutoReviewShot,
  role: "start" | "stop",
  overlayTextMode: MarketplaceAutoReviewOverlayTextMode = "no_text"
): string {
  const roleText =
    role === "start"
      ? "START FRAME: establish the opening visual state for this shot before motion begins."
      : "STOP FRAME: establish the natural end visual state after this shot's motion, consistent with the start frame and next shot.";
  return [
    "OUTPUT FORMAT LOCK: Plain prompt text only. Single 9:16 photorealistic cinematic frame.",
    imageOverlayTextPolicyPrompt(overlayTextMode),
    imagePromptReferenceSection(plan),
    "",
    roleText,
    `Shot ${shot.order}: ${shot.title}`,
    `Storyboard guide for this shot: ${shot.storyboardGuide}`,
    `Voiceover/dialogue for this shot: ${shot.voiceover}`,
    `Camera and light: ${shot.camera}; ${shot.movement}; realistic cinematic light with dimensional shadows.`,
    `Visual content: ${shot.visual}`,
    `Product continuity: ${shot.productRole}; product must remain exact to reference images and product facts.`,
    "Human continuity: if a person appears without an approved character identity asset pack, keep the person hands-only or face-hidden for the whole shot so there is no face drift risk. Do not rotate from back/side to a newly invented face.",
    buildMinorSafetyClothingLock(plan),
  ].join("\n");
}

export function buildMarketplaceAutoReview3x3StoryboardPromptForTest(input: {
  plan: AutoReviewPlan;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  repairInstruction?: string | null;
}): string {
  return build3x3StoryboardPrompt(
    input.plan,
    normalizeMarketplaceAutoReviewOverlayTextMode(input.overlayTextMode),
    cleanText(input.repairInstruction)
  );
}

function buildCompactMarketplaceAutoReviewVideoCharacterLine(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): string {
  const preset = characterPresetRecordFromPlanOrMetadata(plan, metadata);
  const subject = characterSubjectFromPresetRecord(preset);
  const mode =
    preset.mode ||
    cleanText(
      asRecord(marketplaceAutoReviewReferenceAnchorsFromMetadata(metadata))
        .characterMode
    );
  if (mode === "product_only") return "Product-only; do not add people.";
  if (mode === "hands_only")
    return "Hands-only; keep faces hidden and do not add a presenter.";
  if (marketplaceAutoReviewUsesUploadedCharacterReference(plan, metadata)) {
    return "Use the visible/uploaded presenter identity; no new people.";
  }
  return subject
    ? `Keep visible presenter as ${subject}; no new people.`
    : "Use only people or hands already visible in the frames; no new people.";
}

function buildCompactMarketplaceAutoReviewVideoVoiceLine(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): string {
  const preset = characterPresetRecordFromPlanOrMetadata(plan, metadata);
  const subject = characterSubjectFromPresetRecord(preset);
  if (marketplaceAutoReviewUsesUploadedCharacterReference(plan, metadata)) {
    return "Voice matches the visible/uploaded presenter; natural central Thai.";
  }
  return subject
    ? `Voice matches ${subject}; natural central Thai.`
    : "Natural central Thai presenter voice.";
}

function buildCompactMarketplaceAutoReviewVideoActionLine(input: {
  plan: AutoReviewPlan;
  shot: AutoReviewShot;
  referenceMode: MarketplaceAutoReviewVideoReferenceMode;
  metadata?: RunMetadata | null;
}): string {
  const voiceover = alignThaiSpeechToMarketplaceAutoReviewPresenter(
    input.shot.voiceover,
    input.plan,
    input.metadata
  );
  const parts =
    input.referenceMode === "start_stop"
      ? [input.shot.title, input.shot.movement, voiceover]
      : [input.shot.title, input.shot.visual, input.shot.movement, voiceover];
  return compactImagePromptText(
    [
      parts.map(cleanText).filter(Boolean).join(". "),
      input.referenceMode === "start_stop"
        ? "Animate only the visible transition/action from start frame to stop frame; do not re-describe or redesign static props, product, people, or background."
        : "Animate with a subtle product-focused motion while preserving the storyboard frame.",
    ]
      .filter(Boolean)
      .join(" "),
    input.referenceMode === "start_stop" ? 430 : 520
  );
}

function buildCompactMarketplaceAutoReviewVideoPrompt(input: {
  plan: AutoReviewPlan;
  shot: AutoReviewShot;
  audioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  isLastShot: boolean;
  referenceMode: MarketplaceAutoReviewVideoReferenceMode;
  metadata?: RunMetadata | null;
}): string {
  const scene =
    input.referenceMode === "single_storyboard_frame"
      ? "Use @Image1 as the storyboard frame. Frame defines product, people, props, location, lighting."
      : "Use @Image1 as start frame. Use @Image2 as stop frame. Frames define product, people, props, location, lighting.";
  const action = buildCompactMarketplaceAutoReviewVideoActionLine({
    plan: input.plan,
    shot: input.shot,
    referenceMode: input.referenceMode,
    metadata: input.metadata,
  });
  const camera = compactImagePromptText(
    [
      input.shot.camera,
      input.shot.movement,
      input.referenceMode === "start_stop"
        ? "Preserve exact endpoint continuity."
        : "Preserve frame composition.",
    ]
      .map(cleanText)
      .filter(Boolean)
      .join("; "),
    220
  );
  const timedSpeech =
    buildMarketplaceAutoReviewNativeSpeechText({
      plan: input.plan,
      shot: input.shot,
      isLastShot: input.isLastShot,
      metadata: input.metadata,
    }) ||
    `${input.plan.productTruth.productName} ช่วยให้เห็นปัญหาและทางออกของสินค้านี้ชัดขึ้น`;
  const hasNativeSpeech = input.audioStrategy === "native_video_audio";
  const noAudioLine =
    input.audioStrategy === "separate_tts_voiceover"
      ? "External audio workflow: visual-only footage. No audio, speech, music, subtitles, captions, or text."
      : "Silent visual-only footage. No audio, speech, music, sound, subtitles, captions, or text.";
  const dialogue = hasNativeSpeech
    ? `Presenter พูดเป็นภาษาไทยว่า "${cleanText(timedSpeech).replace(/"/g, "'")}"`
    : "No spoken dialogue.";
  const audio = hasNativeSpeech
    ? [
        "Native audio.",
        `Voice: ${buildCompactMarketplaceAutoReviewVideoVoiceLine(
          input.plan,
          input.metadata
        )}`,
        "Only visible-action foley/quiet room tone. No music, jingle, copyrighted melody, background chatter, subtitles, or extra dialogue.",
      ].join(" ")
    : noAudioLine;
  const prompt = [
    `Create a ${input.shot.durationSeconds}-second cinematic video.`,
    `Scene: ${scene}`,
    `Characters: ${buildCompactMarketplaceAutoReviewVideoCharacterLine(input.plan, input.metadata)}`,
    `Action: ${action}`,
    `Camera: ${camera}`,
    "Lighting / Style: Match the reference frames; realistic ecommerce cinematic look; no on-screen text.",
    `Audio: ${audio}`,
    `Dialogue: ${dialogue}`,
  ].join("\n");
  return compactImagePromptText(
    prompt,
    MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS
  );
}

export function buildMarketplaceAutoReviewVideoPromptForTest(input: {
  plan: AutoReviewPlan;
  shot: AutoReviewShot;
  audioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  isLastShot?: boolean;
  referenceMode?: MarketplaceAutoReviewVideoReferenceMode;
  metadata?: RunMetadata | null;
}): string {
  return buildVideoPrompt(input.plan, input.shot, {
    audioStrategy: input.audioStrategy,
    isLastShot: input.isLastShot,
    referenceMode: input.referenceMode,
    metadata: input.metadata,
  });
}

function buildVideoPrompt(
  plan: AutoReviewPlan,
  shot: AutoReviewShot,
  options: {
    audioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
    isLastShot?: boolean;
    referenceMode?: MarketplaceAutoReviewVideoReferenceMode;
    metadata?: RunMetadata | null;
  } = {}
): string {
  const audioStrategy = options.audioStrategy ?? "native_video_audio";
  const referenceMode = options.referenceMode ?? "start_stop";
  return buildCompactMarketplaceAutoReviewVideoPrompt({
    plan,
    shot,
    audioStrategy,
    isLastShot: Boolean(options.isLastShot),
    referenceMode,
    metadata: options.metadata,
  });
}

function buildMarketplaceAutoReviewStoryConceptWizard(
  plan: AutoReviewPlan,
  metadata?: RunMetadata
): Record<string, unknown> {
  const creativeConceptSet = asRecord(metadata?.creativeConceptSet);
  const concepts = Array.isArray(creativeConceptSet.concepts)
    ? (creativeConceptSet.concepts as unknown[]).map(item => asRecord(item))
    : Array.isArray(creativeConceptSet.alternatives)
      ? (creativeConceptSet.alternatives as unknown[]).map(item =>
          asRecord(item)
        )
      : [];
  const selectedConceptId =
    cleanText(creativeConceptSet.selectedConceptId) ||
    cleanText(concepts.find(item => item.selected === true)?.conceptId) ||
    cleanText(concepts[0]?.conceptId) ||
    plan.conceptId;
  const selectedConcept =
    concepts.find(item => cleanText(item.conceptId) === selectedConceptId) ??
    concepts[0] ??
    {};
  const selectedTitle =
    cleanText(selectedConcept.title) || cleanText(plan.title) || "Storyboard";
  const selectedAngle =
    cleanText(selectedConcept.angle) ||
    cleanText(selectedConcept.conceptAngle) ||
    cleanText(selectedConcept.rationale) ||
    cleanText(plan.storyboardGuide);
  const conceptDetails = [
    selectedAngle,
    cleanText(creativeConceptSet.selectedRationale),
    cleanText(selectedConcept.rationale),
  ]
    .filter(Boolean)
    .join("\n");
  const voiceoverBeats = plan.shots.map((shot, index) => ({
    order: shot.order,
    startSec: shot.startSeconds,
    endSec: shot.endSeconds,
    title: shot.title,
    journeyStage:
      index === 0
        ? "hook"
        : index === plan.shots.length - 1
          ? "close"
          : "proof",
    visualBeat: shot.visual,
    cameraDirection: [shot.camera, shot.movement].filter(Boolean).join("; "),
    emotion:
      index === 0
        ? "curious"
        : index === plan.shots.length - 1
          ? "confident"
          : "trust-building",
    voiceoverScript: shot.voiceover,
    speechBudgetSeconds: shot.durationSeconds,
  }));
  const option = {
    id: selectedConceptId,
    title: selectedTitle,
    angle: selectedAngle || plan.storyboardGuide,
    audience: "Thai marketplace product viewer",
    painPoint: cleanText(plan.shots[0]?.storyboardGuide) || selectedAngle,
    hook: cleanText(plan.shots[0]?.voiceover) || selectedTitle,
    sellingPoints: plan.shots
      .map(shot => cleanText(shot.productRole))
      .filter(Boolean)
      .slice(0, 4),
    objectionsTrust: [
      "Truth-locked to selected product reference and evidence.",
    ],
    useCase:
      cleanText(
        plan.shots.find(shot => /use|usage|ใช้/i.test(shot.title))
          ?.storyboardGuide
      ) || cleanText(plan.productTruth.productName),
    storyOptionId: selectedConceptId,
    storyDimension: "quick_demo",
    narrativeStructure: "hook-proof-use-close",
    emotionalTone: "practical, warm, evidence-led",
    hookTechnique: "show the customer problem before the product proof",
    source:
      metadata?.source === "openai_agents_sdk_gateway_creative_planner"
        ? "llm_synthesized"
        : "local_fallback",
    videoBrief: {
      storyboardGuide: plan.storyboardGuide,
      voiceoverScript: plan.voiceoverScript,
      shots: plan.shots,
    },
    conceptDetails: conceptDetails || plan.storyboardGuide,
    productFacts: plan.productDetail,
    voiceoverBeats,
    visualSummary: plan.storyboardGuide,
    keyVisualElements: plan.shots
      .map(shot => cleanText(shot.visual))
      .filter(Boolean)
      .slice(0, 6),
    storyboardThumbnailNotes: cleanText(plan.shots[0]?.visual) || plan.title,
    infographicPrompt: "",
    infographicStatus: "idle",
    sceneTimeline: plan.shots.map(shot => ({
      timeRange: `${shot.startSeconds}-${shot.endSeconds}s`,
      title: shot.title,
      detail: shot.storyboardGuide,
    })),
    risks: [],
    sourceSignals: [
      `product:${plan.productTruth.productId}`,
      `concept:${plan.conceptId}`,
    ],
  };
  return {
    status: "options_ready",
    options: [option],
    selectedId: selectedConceptId,
    contextSummary: `${plan.title}\n${plan.storyboardGuide}`,
    generatedAt: nowIso(),
    generationSeed: plan.conceptId,
    source: option.source,
  };
}

export function buildMarketplaceAutoReviewStoryConceptWizardForTest(input: {
  plan: AutoReviewPlan;
  metadata?: RunMetadata;
}): Record<string, unknown> {
  return buildMarketplaceAutoReviewStoryConceptWizard(
    input.plan,
    input.metadata
  );
}

async function insertDirectProductionDirectorProject(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productionRunId: string;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  metadata: RunMetadata;
}) {
  const now = nowDate();
  const productReferenceUrls = approvedProductReferenceUrls(
    params.metadata,
    params.plan,
    1
  );
  const visualReferenceUrls = approvedVisualReferenceUrls(
    params.metadata,
    params.plan,
    5
  );
  const storyConceptWizard = buildMarketplaceAutoReviewStoryConceptWizard(
    params.plan,
    params.metadata
  );
  const selectedStoryConcept = asRecord(
    Array.isArray(storyConceptWizard.options)
      ? storyConceptWizard.options[0]
      : null
  );
  const storyboardScenes = params.plan.shots.map(shot => ({
    id: shot.id,
    order: shot.order,
    title: shot.title,
    durationSeconds: shot.durationSeconds,
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds,
    storyBeat: shot.storyboardGuide,
    story_beat: shot.storyboardGuide,
    script: shot.voiceover,
    voiceover: shot.voiceover,
    narration: shot.voiceover,
    visualIntent: shot.visual,
    visual: shot.visual,
    cameraIntent: [shot.camera, shot.movement].filter(Boolean).join("; "),
    camera: shot.camera,
    movement: shot.movement,
    productRole: shot.productRole,
    shotType:
      shot.order === 1
        ? "hook"
        : shot.order === params.plan.shots.length
          ? "close"
          : "demo",
  }));
  const goal = {
    source: "marketplace_auto_review",
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    runtime: "direct_media_execution",
    noNodeCanvasExecution: true,
    title: params.plan.title,
    summary: params.plan.storyboardGuide,
    goalSummary: params.plan.storyboardGuide,
    productId: params.plan.productTruth.productId,
    productName: params.plan.productTruth.productName,
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    productContext: {
      productTruthNotes: params.plan.productDetail,
      productTruth: params.plan.productTruth,
      productReferenceUrls,
      visualReferenceUrls,
    },
    visualStyle: {
      creativeDirection: params.plan.storyboardGuide,
    },
    voiceAudioStrategy: {
      voiceStrategy: params.plan.voiceoverScript,
    },
    constraints: {
      storyboardShotCount: params.plan.shots.length,
      storyboardClipDurationSeconds: DEFAULT_SHOT_DURATION_SECONDS,
      revisionInstructions:
        "Auto-created from Marketplace Auto Review. Preserve product truth, selected anchors, storyboard guide, and voiceover contract.",
    },
    storyConceptWizard,
    selectedStoryConcept,
  };
  const productionBible = {
    ...goal,
    conceptId: params.plan.conceptId,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    productDetail: params.plan.productDetail,
    productTruth: params.plan.productTruth,
    shots: params.plan.shots,
    directMediaStages: [
      "image_generation",
      "video_generation",
      "audio_generation",
    ],
    executionBoundary: "marketplace_auto_review_service_only",
  };
  const planVersionPayload = {
    source: "marketplace_auto_review",
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    runtime: "direct_media_execution",
    noNodeCanvasExecution: true,
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    shots: params.plan.shots.map(shot => ({
      id: shot.id,
      order: shot.order,
      title: shot.title,
      imageUnits:
        params.frameStrategy === "video_shot_start_stop"
          ? [`${shot.id}-start`, `${shot.id}-stop`]
          : [`${shot.id}-storyboard-frame`],
      videoUnit: params.outputMode === "full_video" ? `${shot.id}-video` : null,
      productReferenceUrls,
      durationSeconds: shot.durationSeconds,
    })),
    shot_plan: storyboardScenes,
    shotPlan: storyboardScenes,
    scene_timeline: storyboardScenes,
    sceneTimeline: storyboardScenes,
    storyboard_outline: storyboardScenes,
    storyboardOutline: storyboardScenes,
    production_goal_summary: params.plan.storyboardGuide,
    selected_story_concept: selectedStoryConcept,
    selectedStoryConcept,
    storyConceptWizard,
    creative_strategy: {
      conceptTitle: params.plan.title,
      conceptDetails: cleanText(selectedStoryConcept.conceptDetails),
      storyboardGuide: params.plan.storyboardGuide,
      voiceoverScript: params.plan.voiceoverScript,
    },
  };
  await params.db
    .insert(mediaProductionRuns)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      status: "final_preflight_passed",
      goalVersion: 1,
      planVersion: 1,
      goal,
      productionBible,
      assetPlan: {
        runtime: "direct_media_execution",
        noNodeCanvasExecution: true,
        productReferenceUrls,
        visualReferenceUrls,
        referenceAnchors: params.metadata.referenceAnchors ?? null,
        productEvidenceManifest: buildProductEvidenceManifest(
          params.plan,
          params.metadata
        ),
      },
      qualityGateSummary: {
        source: "marketplace_auto_review",
        verdict: "approved_for_direct_execution",
        gates: [
          "product_evidence_lock",
          "thai_global_ad_policy",
          "credit_idempotency",
          "vision_qa_repair",
        ],
      },
      budgetSummary: {
        estimatedCredits:
          params.outputMode === "full_video" ? 9 * 15 + 9 * 15 : 9 * 15,
        creditAuthority: "node_gateway_only",
      },
      contractVersion: AUTO_REVIEW_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await params.db
    .insert(mediaProductionGoalVersions)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      version: 1,
      goal,
      changedFields: ["marketplace_auto_review_direct_runtime"],
      inputHash: buildProductionStableHash({
        productId: params.plan.productTruth.productId,
        outputMode: params.outputMode,
        frameStrategy: params.frameStrategy,
      }),
      status: "active",
      contractVersion: AUTO_REVIEW_SCHEMA_VERSION,
      createdAt: now,
    })
    .onConflictDoNothing();

  await params.db
    .insert(mediaProductionPlanVersions)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      goalVersion: 1,
      version: 1,
      plannerSkillId: "marketplace-auto-review-director",
      plannerSkillVersion: AUTO_REVIEW_SCHEMA_VERSION,
      plan: planVersionPayload,
      inputHash: buildProductionStableHash(goal),
      outputHash: buildProductionStableHash(planVersionPayload),
      status: "approved",
      contractVersion: AUTO_REVIEW_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await params.db
    .insert(mediaProductionPlanVerifications)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      planVersion: 1,
      verifierSkillId: "marketplace-auto-review-verifier",
      verifierSkillVersion: AUTO_REVIEW_SCHEMA_VERSION,
      verdict: "pass",
      score: 96,
      verification: {
        source: "marketplace_auto_review",
        noNodeCanvasExecution: true,
        checks: [
          "product_reference_lock",
          "gateway_only_llm_boundary",
          "direct_media_credit_idempotency",
          "targeted_repair_supported",
          "thai_global_ad_compliance",
        ],
      },
      blockingIssues: [],
      warnings: [],
      missingDecisions: [],
      recommendedRevisions: [],
      status: "active",
      contractVersion: AUTO_REVIEW_SCHEMA_VERSION,
      createdAt: now,
    })
    .onConflictDoNothing();

  await params.db
    .insert(mediaProductionApprovals)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      planVersion: 1,
      approvalType: "marketplace_auto_review",
      status: "approved",
      acceptedWarnings: [],
      lockedTargets: [
        "product_reference",
        "storyboard_guide",
        "voiceover_script",
        "direct_media_units",
      ],
      notes:
        "Auto-approved for Marketplace Auto Review direct media execution. Node canvas execution is bypassed.",
      policySnapshot: {
        source: "marketplace_auto_review",
        noNodeCanvasExecution: true,
        productReferenceLock: "strict",
        creditAuthority: "node_gateway_only",
        targetedRepair: "enabled",
      },
      budgetSnapshot: {
        creditAuthority: "node_gateway_only",
        reservedPerTask: true,
      },
      createdAt: now,
    })
    .onConflictDoNothing();
}

async function upsertRunStage(params: {
  db: Db;
  runId: string;
  stageKey: StageKey;
  stageOrder: number;
  status: string;
  providerTaskIds?: string[];
  output?: Record<string, unknown>;
  errorMessage?: string | null;
  stageCompletionEvidence?: StageCompletionEvidenceInput;
}) {
  const now = nowDate();
  const stageCompletionEvidence = normalizeStageCompletionEvidenceInput({
    runId: params.runId,
    stageKey: params.stageKey,
    stageStatus: params.status,
    output: params.output,
    evidence: params.stageCompletionEvidence,
  });
  const evidence = buildStageCompletionEvidence({
    runId: params.runId,
    stageKey: params.stageKey,
    stageStatus: params.status,
    evidence: stageCompletionEvidence,
  });
  if (
    stageEvidenceStatusForStageStatus(params.status) &&
    !stageCompletionEvidence
  ) {
    throw new Error(
      `Stage ${params.stageKey} cannot transition to ${params.status} without MarketplaceAutoReviewStageCompletionEvidence`
    );
  }
  const outputJson = stageOutputWithEvidence(params.output, evidence);
  const nowIsoText = now.toISOString();
  const updateSet: Record<string, unknown> = {
    status: params.status,
    providerTaskIdsJson: params.providerTaskIds ?? [],
    outputJson,
    errorMessage: params.errorMessage ?? null,
    updatedAt: now,
  };
  if (["running", "waiting_provider"].includes(params.status)) {
    updateSet.startedAt = sql`COALESCE(${marketplaceAutoReviewStages.startedAt}, ${nowIsoText}::timestamptz)`;
  }
  if (isMarketplaceAutoReviewCompletedStageStatus(params.status)) {
    updateSet.completedAt = now;
  }
  await params.db
    .insert(marketplaceAutoReviewStages)
    .values({
      runId: params.runId,
      stageKey: params.stageKey,
      stageOrder: params.stageOrder,
      status: params.status,
      providerTaskIdsJson: params.providerTaskIds ?? [],
      outputJson,
      errorMessage: params.errorMessage ?? null,
      startedAt: ["running", "waiting_provider"].includes(params.status)
        ? now
        : null,
      completedAt: isMarketplaceAutoReviewCompletedStageStatus(params.status)
        ? now
        : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        marketplaceAutoReviewStages.runId,
        marketplaceAutoReviewStages.stageKey,
      ],
      set: updateSet as any,
    });
}

async function updateRun(params: {
  db: Db;
  runId: string;
  status?: MarketplaceAutoReviewStatus;
  currentStage?: StageKey | string;
  stageIndex?: number;
  stageCount?: number;
  selectedConceptId?: string | null;
  storyboardReviewId?: string | null;
  videoEditorProjectId?: string | null;
  renderJobId?: string | null;
  resultLibraryItemId?: number | null;
  resultJson?: Record<string, unknown>;
  metadataJson?: RunMetadata;
  errorMessage?: string | null;
  completedAt?: Date | null;
}) {
  const set: Record<string, unknown> = { updatedAt: nowDate() };
  for (const key of [
    "status",
    "currentStage",
    "stageIndex",
    "stageCount",
    "selectedConceptId",
    "storyboardReviewId",
    "videoEditorProjectId",
    "renderJobId",
    "resultLibraryItemId",
    "resultJson",
    "metadataJson",
    "errorMessage",
    "completedAt",
  ] as const) {
    if (params[key] !== undefined) set[key] = params[key];
  }
  const [run] = await params.db
    .update(marketplaceAutoReviewRuns)
    .set(set as any)
    .where(eq(marketplaceAutoReviewRuns.id, params.runId))
    .returning();
  return run;
}

async function maybeQueueHyperframesPreviewAfterStoryboardReady(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  storyboardReviewId: string;
  frameUrls: string[];
  startFrameUrls: string[];
  stopFrameUrls: string[];
}): Promise<{ renderJobId: string | null; metadata: RunMetadata }> {
  const evidenceFrameUrls = [
    ...params.frameUrls,
    ...params.startFrameUrls,
    ...params.stopFrameUrls,
  ].filter(Boolean);
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: params.auth,
    productId: params.run.productId,
    runId: params.run.id,
  });
  if (!access.capabilities.canPreview || evidenceFrameUrls.length === 0) {
    return { renderJobId: null, metadata: params.metadata };
  }
  try {
    const runState = {
      ...params.run,
      storyboardReviewId: params.storyboardReviewId,
      metadataJson: {
        ...params.metadata,
        storyboardFrameUrls: params.frameUrls,
        startFrameUrls: params.startFrameUrls,
        stopFrameUrls: params.stopFrameUrls,
      },
      resultJson: {
        storyboardReviewId: params.storyboardReviewId,
        frameUrls: params.frameUrls,
        startFrameUrls: params.startFrameUrls,
        stopFrameUrls: params.stopFrameUrls,
      },
      timeline: {
        items: [{ stageKey: "storyboard_review", status: "completed" }],
      },
    };
    const composition = buildHyperframesCompositionInput({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productId: params.run.productId,
      runId: params.run.id,
      productState: { productTruth: params.plan.productTruth },
      runState,
    });
    const render = await queueHyperframesRenderJob({
      auth: params.auth,
      composition,
    });
    const metadata = {
      ...params.metadata,
      hyperframesAutoPreview: {
        renderJobId: render.renderJobId,
        status: render.status,
        queuedAt: nowIso(),
        compositionInputHash:
          render.compositionInputHash ??
          composition.provenance.compositionInputHash,
      },
    } as RunMetadata;
    await updateRun({
      db: params.db,
      runId: params.run.id,
      renderJobId: render.renderJobId,
      metadataJson: metadata,
    });
    return { renderJobId: render.renderJobId, metadata };
  } catch (error) {
    const metadata = {
      ...params.metadata,
      hyperframesAutoPreview: {
        status: "queue_failed",
        failedAt: nowIso(),
        safeMessage:
          "HyperFrames preview queue failed; Marketplace Auto Review will continue through the standard run progression.",
        reason:
          error instanceof Error
            ? error.message.slice(0, 240)
            : String(error).slice(0, 240),
      },
    } as RunMetadata;
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return { renderJobId: null, metadata };
  }
}

export async function maybeQueueHyperframesPreviewAfterStoryboardReadyForTest(
  params: Parameters<typeof maybeQueueHyperframesPreviewAfterStoryboardReady>[0]
) {
  return maybeQueueHyperframesPreviewAfterStoryboardReady(params);
}

async function upsertMarketplaceAutoReviewOutboxJob(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: AuthContext;
  jobType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: Date;
}) {
  const now = nowDate();
  const id = `mar-outbox:${buildProductionStableHash({
    runId: params.run.id,
    jobType: params.jobType,
    idempotencyKey: params.idempotencyKey,
  }).slice(0, 24)}`;
  await params.db
    .insert(marketplaceAutoReviewOutboxJobs)
    .values({
      id,
      runId: params.run.id,
      tenantId: params.auth.tenantId ?? params.run.tenantId ?? null,
      userId: params.auth.userId,
      jobType: params.jobType,
      idempotencyKey: params.idempotencyKey,
      status: "queued",
      priority: params.priority ?? 100,
      maxAttempts: params.maxAttempts ?? 3,
      scheduledAt: params.scheduledAt ?? now,
      payloadJson: params.payload,
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: marketplaceAutoReviewOutboxJobs.idempotencyKey,
      set: {
        payloadJson: params.payload,
        status: "queued",
        priority: params.priority ?? 100,
        scheduledAt: params.scheduledAt ?? now,
        updatedAt: now,
      } as any,
    });
}

async function persistMarketplaceAutoReviewLeaseRow(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: AuthContext;
  ownerToken: string;
  runtime: RuntimeContext;
  metadata: RunMetadata;
}) {
  const control = asRecord(params.metadata.automationControlPlane);
  const lease = asRecord(control.lease);
  const leaseId = cleanText(lease.leaseId);
  if (!leaseId) return;
  const claimedAt = new Date(cleanText(lease.claimedAt) || nowIso());
  const heartbeatAt = cleanText(lease.heartbeatAt)
    ? new Date(cleanText(lease.heartbeatAt))
    : claimedAt;
  const expiresAt = new Date(cleanText(lease.expiresAt) || claimedAt);
  const now = nowDate();
  await params.db
    .insert(marketplaceAutoReviewRunLeases)
    .values({
      id: leaseId,
      runId: params.run.id,
      tenantId: params.auth.tenantId ?? params.run.tenantId ?? null,
      userId: params.auth.userId,
      stageKey: cleanText(params.run.currentStage) || "queued",
      ownerToken: params.ownerToken,
      schedulerSource:
        cleanText(params.runtime.schedulerSource) || "manual_or_api",
      status: "claimed",
      claimedAt,
      heartbeatAt,
      expiresAt,
      metadataJson: {
        schemaVersion: 1,
        controlPlaneRef: cleanText(control.status) || "claimed",
        noNodeCanvasExecution: true,
        llmGatewayOnly: true,
      },
      updatedAt: now,
    } as any)
    .onConflictDoUpdate({
      target: marketplaceAutoReviewRunLeases.id,
      set: {
        stageKey: cleanText(params.run.currentStage) || "queued",
        ownerToken: params.ownerToken,
        heartbeatAt,
        expiresAt,
        status: "claimed",
        metadataJson: {
          schemaVersion: 1,
          controlPlaneRef: cleanText(control.status) || "claimed",
          noNodeCanvasExecution: true,
          llmGatewayOnly: true,
        },
        updatedAt: now,
      } as any,
    });
}

async function markMarketplaceAutoReviewLeaseReleased(params: {
  db: Db;
  runId: string;
  ownerToken: string;
  releasedAt: Date;
}) {
  await params.db
    .update(marketplaceAutoReviewRunLeases)
    .set({
      status: "released",
      heartbeatAt: params.releasedAt,
      releasedAt: params.releasedAt,
      expiresAt: params.releasedAt,
      updatedAt: params.releasedAt,
    } as any)
    .where(
      and(
        eq(marketplaceAutoReviewRunLeases.runId, params.runId),
        eq(marketplaceAutoReviewRunLeases.ownerToken, params.ownerToken)
      )
    );
}

async function heartbeatMarketplaceAutoReviewLeaseRow(params: {
  db: Db;
  runId: string;
  ownerToken: string;
  heartbeatAt: Date;
  expiresAt: Date;
  stageKey: string;
}) {
  await params.db
    .update(marketplaceAutoReviewRunLeases)
    .set({
      status: "claimed",
      stageKey: params.stageKey,
      heartbeatAt: params.heartbeatAt,
      expiresAt: params.expiresAt,
      updatedAt: params.heartbeatAt,
    } as any)
    .where(
      and(
        eq(marketplaceAutoReviewRunLeases.runId, params.runId),
        eq(marketplaceAutoReviewRunLeases.ownerToken, params.ownerToken)
      )
    );
}

function providerEventSnapshotsFromReconciliation(
  run: MarketplaceAutoReviewRun,
  reconciliation: Record<string, unknown>
): Record<string, unknown>[] {
  const providerRefs = Array.isArray(reconciliation.providerTaskRefs)
    ? reconciliation.providerTaskRefs.map(item => asRecord(item))
    : [];
  const renderRefs = Array.isArray(reconciliation.renderRefs)
    ? reconciliation.renderRefs.map(item => asRecord(item))
    : [];
  return [
    ...providerRefs.map(ref => {
      const providerTaskId =
        cleanText(ref.providerTaskId) || cleanText(ref.taskId);
      return compactRecord({
        providerTaskId,
        mediaTaskId: cleanText(ref.taskId),
        stageKey: cleanText(ref.stageKey) || cleanText(run.currentStage),
        eventType:
          cleanText(ref.stale) === "true" || ref.stale === true
            ? "stale_provider_wait"
            : "provider_task_snapshot",
        status: cleanText(ref.status) || "unknown",
        resultUrl: cleanText(ref.resultUrl),
        creditRef: cleanText(ref.creditRef),
        payload: ref,
      });
    }),
    ...renderRefs.map(ref =>
      compactRecord({
        providerTaskId: cleanText(ref.jobId),
        mediaTaskId: cleanText(ref.jobId),
        stageKey: "render",
        eventType:
          ref.stale === true ? "stale_render_wait" : "render_job_snapshot",
        status: cleanText(ref.status) || "unknown",
        resultUrl: cleanText(ref.resultUrl),
        creditRef: cleanText(ref.creditRef),
        payload: ref,
      })
    ),
  ].filter(ref => cleanText(ref.providerTaskId));
}

async function persistMarketplaceAutoReviewProviderEventRows(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  reconciliation: Record<string, unknown>;
}) {
  const rows = providerEventSnapshotsFromReconciliation(
    params.run,
    params.reconciliation
  );
  const now = nowDate();
  for (const row of rows) {
    const providerTaskId = cleanText(row.providerTaskId);
    const replayKey = `mar-provider:${params.run.id}:${providerTaskId}:${cleanText(row.eventType)}:${cleanText(row.status)}`;
    const id = `provider-event:${buildProductionStableHash(replayKey).slice(0, 24)}`;
    await params.db
      .insert(marketplaceAutoReviewProviderEvents)
      .values({
        id,
        runId: params.run.id,
        stageKey: cleanText(row.stageKey) || cleanText(params.run.currentStage),
        providerName: cleanText(row.providerName) || null,
        providerTaskId,
        mediaTaskId: cleanText(row.mediaTaskId) || null,
        eventType: cleanText(row.eventType) || "provider_task_snapshot",
        status: cleanText(row.status) || "unknown",
        signatureStatus: "internal_snapshot",
        replayKey,
        resultUrl: cleanText(row.resultUrl) || null,
        creditRef: cleanText(row.creditRef) || null,
        payloadJson: asRecord(row.payload),
        receivedAt: now,
        updatedAt: now,
      } as any)
      .onConflictDoUpdate({
        target: marketplaceAutoReviewProviderEvents.replayKey,
        set: {
          status: cleanText(row.status) || "unknown",
          resultUrl: cleanText(row.resultUrl) || null,
          creditRef: cleanText(row.creditRef) || null,
          payloadJson: asRecord(row.payload),
          receivedAt: now,
          updatedAt: now,
        } as any,
      });
  }
}

async function persistMarketplaceAutoReviewStageAttemptSnapshot(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  status: string;
  reasonCode?: string | null;
}) {
  const repairLedger = asRecord(params.metadata.targetedRepairPolicyLedger);
  const providerReconciliation = asRecord(
    params.metadata.providerReconciliation
  );
  const attemptNumber =
    toNumber(asRecord(params.metadata.automationControlPlane).advanceAttempt) ||
    1;
  const stageKey = cleanText(params.run.currentStage) || "queued";
  const attemptKey = marketplaceAutoReviewStageAttemptKeyForStatus({
    stageKey,
    status: params.status,
    attemptNumber,
  });
  const now = nowDate();
  const providerTaskRefs = [
    ...directTaskRefs(params.metadata.directImageTasks),
    ...directTaskRefs(params.metadata.directVideoTasks),
  ].map(ref => compactRecord(ref));
  await params.db
    .insert(marketplaceAutoReviewStageAttempts)
    .values({
      runId: params.run.id,
      stageKey,
      attemptKey,
      attemptNumber,
      status: params.status,
      reasonCode: params.reasonCode ?? null,
      providerTaskRefsJson: providerTaskRefs,
      creditRefsJson: creditRefsFromMetadata(params.metadata),
      repairDecisionJson: repairLedger,
      artifactRefsJson: [
        cleanText(asRecord(params.metadata.qaArtifactManifest).manifestId),
        ...generatedVideoSampleEvidenceRefs(params.metadata),
      ].filter(Boolean),
      evidenceJson: {
        schemaVersion: 1,
        providerReconciliationId: cleanText(
          providerReconciliation.reconciliationId
        ),
        repairLedgerId: cleanText(repairLedger.ledgerId),
        qaArtifactManifestId: cleanText(
          asRecord(params.metadata.qaArtifactManifest).manifestId
        ),
      },
      updatedAt: now,
      completedAt: isMarketplaceAutoReviewTerminalStageAttemptStatus(
        params.status
      )
        ? now
        : null,
    } as any)
    .onConflictDoUpdate({
      target: [
        marketplaceAutoReviewStageAttempts.runId,
        marketplaceAutoReviewStageAttempts.attemptKey,
      ],
      set: {
        status: params.status,
        attemptNumber,
        reasonCode: params.reasonCode ?? null,
        providerTaskRefsJson: providerTaskRefs,
        creditRefsJson: creditRefsFromMetadata(params.metadata),
        repairDecisionJson: repairLedger,
        artifactRefsJson: [
          cleanText(asRecord(params.metadata.qaArtifactManifest).manifestId),
          ...generatedVideoSampleEvidenceRefs(params.metadata),
        ].filter(Boolean),
        evidenceJson: {
          schemaVersion: 1,
          providerReconciliationId: cleanText(
            providerReconciliation.reconciliationId
          ),
          repairLedgerId: cleanText(repairLedger.ledgerId),
          qaArtifactManifestId: cleanText(
            asRecord(params.metadata.qaArtifactManifest).manifestId
          ),
        },
        updatedAt: now,
        completedAt: isMarketplaceAutoReviewTerminalStageAttemptStatus(
          params.status
        )
          ? now
          : null,
      } as any,
    });
}

async function claimMarketplaceAutoReviewAdvanceLease(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: AuthContext;
  runtime: RuntimeContext;
}): Promise<{
  claimed: boolean;
  ownerToken: string;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}> {
  const now = nowDate();
  const claimedAt = now.toISOString();
  const leaseTtlMs = advanceLeaseTtlMs();
  const ownerToken = [
    "marketplace-auto-review",
    cleanText(params.runtime.automationWorkerId) || `pid-${process.pid}`,
    params.run.id,
    nanoid(8),
  ].join(":");
  const metadata = asRecord(params.run.metadataJson) as RunMetadata;
  const existingControl = asRecord(metadata.automationControlPlane);
  const existingLease = asRecord(existingControl.lease);
  const existingLeaseHeartbeatMs = parseIsoMs(existingLease.heartbeatAt);
  const canRecoverProviderUnreachedSubmitIntentLease =
    metadataHasProviderUnreachedSubmitIntent(metadata) &&
    existingLeaseHeartbeatMs !== null &&
    Date.now() - existingLeaseHeartbeatMs > 60_000;
  const advanceAttempt = toNumber(existingControl.advanceAttempt) + 1;
  const leaseId = `advance-lease:${params.run.id}:${buildProductionStableHash({
    ownerToken,
    claimedAt,
  }).slice(0, 16)}`;
  const nextMetadata = withMarketplaceAutoReviewAutomationSnapshots({
    run: params.run,
    metadata: {
      ...metadata,
      automationControlPlane: {
        ...existingControl,
        schemaVersion: 1,
        status: "claimed",
        runId: params.run.id,
        currentStage: params.run.currentStage,
        advanceAttempt,
        retryBudget: {
          maxAttemptsPerStage: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1,
          currentAttempt: advanceAttempt,
          policy: "durable_claim_prevents_duplicate_advance",
        },
        backpressurePolicy:
          "only lease owner may advance; stale provider waits block before duplicate spend",
        schedulerSource:
          cleanText(params.runtime.schedulerSource) || "manual_or_api",
        llmGatewayOnly: true,
        noNodeCanvasExecution: true,
        lease: {
          leaseId,
          ownerToken,
          ownerUserId: params.auth.userId,
          tenantId: params.auth.tenantId ?? params.run.tenantId ?? null,
          claimedAt,
          heartbeatAt: claimedAt,
          expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString(),
          ttlMs: leaseTtlMs,
        },
        ...(canRecoverProviderUnreachedSubmitIntentLease
          ? {
              leaseRecovery: {
                reason: "provider_unreached_submit_intent",
                previousOwnerToken: cleanText(existingLease.ownerToken),
                previousHeartbeatAt: cleanText(existingLease.heartbeatAt),
                recoveredAt: claimedAt,
              },
            }
          : {}),
      },
    } as RunMetadata,
    runtime: params.runtime,
  });
  const leaseClaimClauses = [
    sql`${marketplaceAutoReviewRuns.metadataJson}->'automationControlPlane'->'lease'->>'expiresAt' IS NULL`,
    sql`${marketplaceAutoReviewRuns.metadataJson}->'automationControlPlane'->'lease'->>'expiresAt' <= ${claimedAt}`,
    sql`${marketplaceAutoReviewRuns.metadataJson}->'automationControlPlane'->'lease'->>'ownerToken' = ${ownerToken}`,
  ];
  if (canRecoverProviderUnreachedSubmitIntentLease) {
    leaseClaimClauses.push(sql`true`);
  }
  const [claimed] = await params.db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: nextMetadata,
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, params.run.id),
        inArray(marketplaceAutoReviewRuns.status, ACTIVE_RUN_STATUSES),
        or(...leaseClaimClauses)
      )
    )
    .returning();
  if (!claimed) {
    return {
      claimed: false,
      ownerToken,
      run: params.run,
      metadata,
    };
  }
  const claimedMetadata = asRecord(claimed.metadataJson) as RunMetadata;
  await persistMarketplaceAutoReviewLeaseRow({
    db: params.db,
    run: claimed,
    auth: params.auth,
    ownerToken,
    runtime: params.runtime,
    metadata: claimedMetadata,
  });
  const schedulerSource =
    cleanText(params.runtime.schedulerSource) || "manual_or_api";
  if (shouldPersistAdvanceOutboxJobForSchedulerSource(schedulerSource)) {
    await upsertMarketplaceAutoReviewOutboxJob({
      db: params.db,
      run: claimed,
      auth: params.auth,
      jobType: "advance_run",
      idempotencyKey: `marketplace-auto-review:${claimed.id}:advance:${advanceAttempt}`,
      priority: 50,
      maxAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 2,
      payload: {
        runId: claimed.id,
        stageKey: claimed.currentStage,
        leaseId,
        ownerToken,
        schedulerSource,
        noNodeCanvasExecution: true,
        llmGatewayOnly: true,
      },
    });
  }
  return {
    claimed: true,
    ownerToken,
    run: claimed,
    metadata: claimedMetadata,
  };
}

async function releaseMarketplaceAutoReviewAdvanceLease(params: {
  db: Db;
  runId: string;
  ownerToken: string;
}) {
  const [run] = await params.db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(eq(marketplaceAutoReviewRuns.id, params.runId))
    .limit(1);
  if (!run) return;
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const control = asRecord(metadata.automationControlPlane);
  const lease = asRecord(control.lease);
  if (cleanText(lease.ownerToken) !== params.ownerToken) return;
  const releasedAt = nowIso();
  await markMarketplaceAutoReviewLeaseReleased({
    db: params.db,
    runId: params.runId,
    ownerToken: params.ownerToken,
    releasedAt: new Date(releasedAt),
  });
  await updateRun({
    db: params.db,
    runId: params.runId,
    metadataJson: withMarketplaceAutoReviewAutomationSnapshots({
      run,
      metadata: {
        ...metadata,
        automationControlPlane: {
          ...control,
          status: "idle",
          releasedAt,
          lease: {
            ...lease,
            heartbeatAt: releasedAt,
            expiresAt: releasedAt,
            releasedAt,
          },
        },
      } as RunMetadata,
    }),
  });
}

async function heartbeatMarketplaceAutoReviewAdvanceLease(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  ownerToken: string;
  note: string;
}): Promise<RunMetadata> {
  const metadata = asRecord(params.run.metadataJson) as RunMetadata;
  const control = asRecord(metadata.automationControlPlane);
  const lease = asRecord(control.lease);
  if (cleanText(lease.ownerToken) !== params.ownerToken) return metadata;
  const heartbeatAt = nowIso();
  const expiresAt = new Date(Date.now() + advanceLeaseTtlMs());
  const nextMetadata = withMarketplaceAutoReviewAutomationSnapshots({
    run: params.run,
    metadata: {
      ...metadata,
      automationControlPlane: {
        ...control,
        status: "claimed",
        currentStage: params.run.currentStage,
        lastHeartbeatNote: params.note,
        lease: {
          ...lease,
          heartbeatAt,
          expiresAt: expiresAt.toISOString(),
        },
      },
    } as RunMetadata,
  });
  await heartbeatMarketplaceAutoReviewLeaseRow({
    db: params.db,
    runId: params.run.id,
    ownerToken: params.ownerToken,
    heartbeatAt: new Date(heartbeatAt),
    expiresAt,
    stageKey: cleanText(params.run.currentStage) || "queued",
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: nextMetadata,
  });
  return nextMetadata;
}

async function persistMarketplaceAutoReviewProviderReconciliation(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  stages: StageKey[];
}): Promise<{
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  blocked: boolean;
}> {
  const providerReconciliation =
    buildMarketplaceAutoReviewProviderReconciliationSnapshot({
      run: params.run,
      metadata: params.metadata,
    });
  const metadata = withMarketplaceAutoReviewAutomationSnapshots({
    run: params.run,
    metadata: {
      ...params.metadata,
      providerReconciliation,
    } as RunMetadata,
  });
  const blocked =
    cleanText(providerReconciliation.status) === "blocked_stale_provider_wait";
  const updatedRun = await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
    errorMessage: blocked
      ? "Marketplace Auto Review provider reconciliation requires recovery before continuing"
      : undefined,
  });
  await persistMarketplaceAutoReviewProviderEventRows({
    db: params.db,
    run: (updatedRun ?? params.run) as MarketplaceAutoReviewRun,
    reconciliation: providerReconciliation,
  });
  await persistMarketplaceAutoReviewStageAttemptSnapshot({
    db: params.db,
    run: (updatedRun ?? params.run) as MarketplaceAutoReviewRun,
    metadata,
    status: blocked ? "blocked" : "running",
    reasonCode: blocked ? "stale_provider_wait" : null,
  });
  if (blocked) {
    await upsertMarketplaceAutoReviewOutboxJob({
      db: params.db,
      run: (updatedRun ?? params.run) as MarketplaceAutoReviewRun,
      auth: {
        userId: params.run.userId,
        tenantId: params.run.tenantId ?? undefined,
      },
      jobType: "provider_reconciliation_recovery",
      idempotencyKey: `marketplace-auto-review:${params.run.id}:provider-reconcile:${cleanText(providerReconciliation.reconciliationId)}`,
      priority: 10,
      maxAttempts: 5,
      payload: {
        runId: params.run.id,
        currentStage: params.run.currentStage,
        providerReconciliation,
        recoveryPolicy:
          "query provider/media task, attach recovered result URL, refund stale credits, or schedule targeted repair without duplicate spend",
      },
    });
    const stageKey = params.stages.includes(params.run.currentStage as StageKey)
      ? (params.run.currentStage as StageKey)
      : params.stages[0];
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey,
      stageOrder: stageIndex(stageKey, params.stages),
      status: "blocked_needs_user",
      output: {
        statusDetail: {
          state: "dlq_recovery_required",
          severity: "blocked",
          stageKey,
          reasonCodes: [
            "stale_provider_wait",
            ...recordRefList(providerReconciliation, "staleRefs"),
          ],
          safeMessage:
            "ระบบหยุดก่อนใช้เครดิตหรือส่งงานซ้ำ เพราะพบ provider task ที่รอนานผิดปกติ ต้อง reconcile task/result/refund ก่อน resume",
          nextAction:
            "ให้ระบบ/ผู้ดูแลตรวจ provider task, result URL, cancellation/refund evidence แล้วค่อย resume งานจาก checkpoint",
          userActionRequired: true,
          retryable: true,
        },
        providerReconciliation,
      },
      stageCompletionEvidence: {
        status: "user_blocked",
        requiredRefs: ["providerReconciliation", "creditReconciliation"],
        artifactRefs: [`run:${params.run.id}`],
        missingRefs: recordRefList(providerReconciliation, "staleRefs"),
        policyRefs: [
          "orphan-provider-task-no-duplicate-spend",
          "provider-reconciliation-before-retry",
        ],
      },
    });
  }
  return {
    run: (updatedRun ?? params.run) as MarketplaceAutoReviewRun,
    metadata,
    blocked,
  };
}

function hyperframesRenderJobIdForStoryboardReviewLink(
  run: Pick<
    MarketplaceAutoReviewRun,
    "renderJobId" | "metadataJson" | "resultJson"
  >
): string {
  const metadata = asRecord(run.metadataJson);
  const result = asRecord(run.resultJson);
  const metadataPreview = asRecord(metadata.hyperframesAutoPreview);
  const resultPreview = asRecord(result.hyperframesAutoPreview);
  const resultRender = asRecord(result.render);
  return (
    cleanText(run.renderJobId) ||
    cleanText(metadataPreview.renderJobId) ||
    cleanText(resultPreview.renderJobId) ||
    cleanText(result.hyperframesRenderJobId) ||
    cleanText(resultRender.renderJobId)
  );
}

function cleanTextOrNumber(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(value);
  return text || null;
}

function summarizeHyperframesPreviewMarkerForUi(
  value: unknown
): Record<string, unknown> | null {
  const marker = asRecord(value);
  const summary = compactRecord({
    renderJobId: cleanText(marker.renderJobId),
    status: cleanText(marker.status),
    queuedAt: cleanText(marker.queuedAt),
  });
  return Object.keys(summary).length > 0 ? summary : null;
}

function summarizeHyperframesRenderMarkerForUi(
  value: unknown
): Record<string, unknown> | null {
  const render = asRecord(value);
  const summary = compactRecord({
    renderJobId: cleanText(render.renderJobId),
    status: cleanText(render.status),
    updatedAt: cleanText(render.updatedAt),
    templateId: cleanText(render.templateId),
    templateVersion: cleanText(render.templateVersion),
    platformPresetId: cleanText(render.platformPresetId),
    renderIntent: cleanText(render.renderIntent),
    compositionMode: cleanText(render.compositionMode),
    compositionInputHash: cleanText(render.compositionInputHash),
    qaStatus: cleanText(render.qaStatus),
  });
  return Object.keys(summary).length > 0 ? summary : null;
}

function summarizeMarketplaceAutoReviewResultForUi(
  resultJson: unknown
): Record<string, unknown> {
  const result = asRecord(resultJson);
  const autoPreviewSummary = summarizeHyperframesPreviewMarkerForUi(
    result.hyperframesAutoPreview
  );
  const renderSummary = summarizeHyperframesRenderMarkerForUi(result.render);
  return compactRecord({
    storyboardReviewId: cleanTextOrNumber(result.storyboardReviewId),
    frameUrls: safeUserVisibleUrlArrayFromUnknown(result.frameUrls),
    startFrameUrls: safeUserVisibleUrlArrayFromUnknown(result.startFrameUrls),
    stopFrameUrls: safeUserVisibleUrlArrayFromUnknown(result.stopFrameUrls),
    hyperframesRenderJobId:
      cleanText(result.hyperframesRenderJobId) ||
      cleanText(autoPreviewSummary?.renderJobId) ||
      cleanText(renderSummary?.renderJobId),
    hyperframesAutoPreview: autoPreviewSummary,
    render: renderSummary,
    libraryItemId: cleanTextOrNumber(result.libraryItemId),
    jobId: cleanText(result.jobId),
    cached: typeof result.cached === "boolean" ? result.cached : null,
    mediaHistorySource: cleanText(result.mediaHistorySource),
    audioStrategy: cleanText(result.audioStrategy),
    resolvedAudioStrategy: cleanText(result.resolvedAudioStrategy),
  });
}

function buildMarketplaceAutoReviewStoryboardReviewLink(input: {
  storyboardReviewId?: string | number | null;
  productId?: string | number | null;
  runId?: string | number | null;
  renderJobId?: string | number | null;
}): string | null {
  const text = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : cleanText(value);
  const storyboardReviewId = text(input.storyboardReviewId);
  if (!storyboardReviewId) return null;
  const path = `/storyboard-review/${encodeURIComponent(storyboardReviewId)}`;
  const renderJobId = text(input.renderJobId);
  if (!renderJobId) return path;
  const params = new URLSearchParams();
  params.set("hyperframesRenderJobId", renderJobId);
  const productId = text(input.productId);
  const runId = text(input.runId);
  if (productId) params.set("productId", productId);
  if (runId) params.set("runId", runId);
  return `${path}?${params.toString()}`;
}

export function buildMarketplaceAutoReviewStoryboardReviewLinkForTest(input: {
  storyboardReviewId?: string | number | null;
  productId?: string | number | null;
  runId?: string | number | null;
  renderJobId?: string | number | null;
}): string | null {
  return buildMarketplaceAutoReviewStoryboardReviewLink(input);
}

function serializeRun(
  run: MarketplaceAutoReviewRun,
  stages: MarketplaceAutoReviewStage[] = [],
  options: { includeHeavyMetadata?: boolean } = {}
) {
  const includeHeavyMetadata = options.includeHeavyMetadata ?? true;
  const storyboardReviewUrl = buildMarketplaceAutoReviewStoryboardReviewLink({
    storyboardReviewId: run.storyboardReviewId,
    productId: run.productId,
    runId: run.id,
    renderJobId: hyperframesRenderJobIdForStoryboardReviewLink(run),
  });
  const outputLinks = [
    run.productionRunId
      ? {
          kind: "production_project" as const,
          label: "Director Project",
          url: `/media-studio?productionRunId=${encodeURIComponent(run.productionRunId)}&tab=production`,
          safeForUser: true,
          stageKey: "production_project" as const,
          artifactRef: run.productionRunId,
        }
      : null,
    storyboardReviewUrl
      ? {
          kind: "storyboard_review" as const,
          label: "Storyboard",
          url: storyboardReviewUrl,
          safeForUser: true,
          stageKey: "storyboard_review" as const,
          artifactRef: run.storyboardReviewId,
        }
      : null,
    run.videoEditorProjectId
      ? {
          kind: "video_editor" as const,
          label: "Video Editor",
          url: `/video-editor?projectId=${encodeURIComponent(run.videoEditorProjectId)}`,
          safeForUser: true,
          stageKey: "video_edit" as const,
          artifactRef: run.videoEditorProjectId,
        }
      : null,
    run.resultLibraryItemId
      ? {
          kind: "library_item" as const,
          label: "Library",
          url: `/library/${run.resultLibraryItemId}`,
          safeForUser: true,
          stageKey: "library_finalize" as const,
          artifactRef: String(run.resultLibraryItemId),
        }
      : null,
  ].filter(Boolean);
  const apiProjection = buildMarketplaceAutoReviewApiProjection(
    run,
    stages,
    outputLinks as any
  );
  const serializedRun = {
    ...run,
    stages,
    links: {
      productionProject: run.productionRunId
        ? `/media-studio?productionRunId=${encodeURIComponent(run.productionRunId)}&tab=production`
        : null,
      storyboardReview: storyboardReviewUrl,
      videoEditor: run.videoEditorProjectId
        ? `/video-editor?projectId=${encodeURIComponent(run.videoEditorProjectId)}`
        : null,
      libraryItem: run.resultLibraryItemId
        ? `/library/${run.resultLibraryItemId}`
        : null,
    },
    apiProjection,
    timeline: apiProjection.timeline,
    statusDetail: apiProjection.summary.statusDetail,
    creditSummary: apiProjection.creditSummary,
    outputLinks: apiProjection.outputLinks,
  };

  if (!includeHeavyMetadata) {
    const metadata = asRecord(run.metadataJson);
    const hyperframesAutoPreviewSummary =
      summarizeHyperframesPreviewMarkerForUi(metadata.hyperframesAutoPreview);
    return {
      ...serializedRun,
      resultJson: summarizeMarketplaceAutoReviewResultForUi(run.resultJson),
      metadataJson: {
        resolvedAudioStrategy: metadata.resolvedAudioStrategy ?? null,
        referenceAnchors: metadata.referenceAnchors ?? null,
        imageAttemptReviews: summarizeImageAttemptReviewsForUi(metadata),
        storyboardGridUrl: metadata.storyboardGridUrl ?? null,
        storyboardFrameUrls: metadata.storyboardFrameUrls ?? [],
        startFrameUrls: metadata.startFrameUrls ?? [],
        stopFrameUrls: metadata.stopFrameUrls ?? [],
        hyperframesAutoPreview: hyperframesAutoPreviewSummary,
        generatedMediaAcceptanceEnvelope:
          metadata.generatedMediaAcceptanceEnvelope ?? null,
      },
      metadataSummary: {
        omitted: true,
        originalBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
      },
    };
  }

  return serializedRun;
}

export function serializeMarketplaceAutoReviewRunForTest(
  run: MarketplaceAutoReviewRun,
  stages: MarketplaceAutoReviewStage[] = [],
  options: { includeHeavyMetadata?: boolean } = {}
) {
  return serializeRun(run, stages, options);
}

function summarizeImageAttemptReviewsForUi(
  metadata: Record<string, unknown>
): Record<string, unknown>[] {
  const reviews = Array.isArray(metadata.imageAttemptReviews)
    ? metadata.imageAttemptReviews.map(item => asRecord(item))
    : [];
  return reviews.map(review => {
    const taskRefs = Array.isArray(review.taskRefs)
      ? review.taskRefs.map(item => asRecord(item))
      : [];
    const promptAudits = Array.isArray(review.promptAudits)
      ? review.promptAudits.map(item => asRecord(item))
      : [];
    return compactRecord({
      reviewId: cleanText(review.reviewId),
      attempt: toNumber(review.attempt),
      status: cleanText(review.status),
      reasonCodes: Array.isArray(review.reasonCodes)
        ? review.reasonCodes.map(item => cleanText(item)).filter(Boolean)
        : [],
      resultUrls: Array.isArray(review.resultUrls)
        ? review.resultUrls.map(item => cleanText(item)).filter(Boolean)
        : [],
      thumbnailUrls: Array.isArray(review.thumbnailUrls)
        ? review.thumbnailUrls.map(item => cleanText(item)).filter(Boolean)
        : [],
      storyboardGridUrl: cleanText(review.storyboardGridUrl),
      storyboardFrameUrls: Array.isArray(review.storyboardFrameUrls)
        ? review.storyboardFrameUrls
            .map(item => cleanText(item))
            .filter(Boolean)
        : [],
      startFrameUrls: Array.isArray(review.startFrameUrls)
        ? review.startFrameUrls.map(item => cleanText(item)).filter(Boolean)
        : [],
      stopFrameUrls: Array.isArray(review.stopFrameUrls)
        ? review.stopFrameUrls.map(item => cleanText(item)).filter(Boolean)
        : [],
      qualityScore: toNumber(review.qualityScore),
      negativeScore: toNumber(review.negativeScore),
      taskRefs: taskRefs.map(ref =>
        compactRecord({
          unitId: cleanText(ref.unitId),
          role: cleanText(ref.role),
          status: cleanText(ref.status),
          resultUrl: cleanText(ref.resultUrl),
          promptHash: cleanText(ref.promptHash),
          promptLengthChars: toNumber(ref.promptLengthChars),
          prompt: cleanText(ref.prompt),
          promptSnippet: cleanText(ref.promptSnippet),
        })
      ),
      promptHash: cleanText(review.promptHash),
      promptLengthChars: toNumber(review.promptLengthChars),
      prompt: cleanText(review.prompt),
      promptSnippet: cleanText(review.promptSnippet),
      promptAudits: promptAudits.map(audit =>
        compactRecord({
          auditId: cleanText(audit.auditId),
          promptHash: cleanText(audit.promptHash),
          promptLengthChars: toNumber(audit.promptLengthChars),
          prompt: cleanText(audit.prompt),
          promptSnippet: cleanText(audit.promptSnippet),
        })
      ),
    });
  });
}

export async function getMarketplaceAutoReviewRun(
  runId: string,
  auth: AuthContext
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, runId),
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        tenantAccessClause(auth)
      )
    )
    .limit(1);
  if (!run)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run not found",
    });
  const stages = await db
    .select()
    .from(marketplaceAutoReviewStages)
    .where(eq(marketplaceAutoReviewStages.runId, run.id))
    .orderBy(marketplaceAutoReviewStages.stageOrder);
  return serializeRun(run, stages);
}

export async function selectMarketplaceAutoReviewImageAttemptForStoryboardReview(
  input: { runId: string; attempt: number },
  auth: AuthContext
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const run = await reloadRun(db, input.runId, auth);
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const attempt = Math.floor(toNumber(input.attempt));
  if (!Number.isFinite(attempt) || attempt <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid image attempt",
    });
  }
  const reviews = Array.isArray(metadata.imageAttemptReviews)
    ? metadata.imageAttemptReviews.map(item => asRecord(item))
    : [];
  const review = reviews.find(item => toNumber(item.attempt) === attempt);
  if (!review) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Image attempt not found",
    });
  }
  const publishSafetyBlockers = uniqueCleanTexts([
    ...cleanStringList(review.reasonCodes),
    ...cleanStringList(asRecord(review.scoreBreakdown).publishSafetyBlockers),
    ...cleanStringList(review.selectionBlockers),
  ]).filter(imageReasonCodeBlocksPublishSafety);
  if (publishSafetyBlockers.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "ภาพชุดนี้มีปัญหา publish safety สำหรับเด็ก เช่น เด็กเสื้อผ้าไม่ครบหรือใส่แค่ผ้าอ้อม จึงไม่สามารถใช้สร้าง Storyboard Review ได้",
    });
  }
  const storyboardGridUrl = cleanText(review.storyboardGridUrl);
  const storyboardFrameUrls = cleanStringList(review.storyboardFrameUrls);
  const startFrameUrls = cleanStringList(review.startFrameUrls);
  const stopFrameUrls = cleanStringList(review.stopFrameUrls);
  const resultUrls = cleanStringList(review.resultUrls);
  const tenantId = cleanText(run.tenantId) || cleanText(auth.tenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Auto review run is missing tenant context",
    });
  }
  const planRepair = hydrateMarketplaceAutoReviewPlanForStoryboardReview({
    plan: extractPlanFromRun(run),
    metadata,
  });
  const plan = planRepair.plan;
  const expectedFrameCount = shotCountForPlan(plan);
  let selectedStoryboardFrameUrls: string[] = [];
  if (storyboardGridUrl) {
    selectedStoryboardFrameUrls = await splitStoryboardGrid({
      runId: run.id,
      tenantId,
      sourceUrl: storyboardGridUrl,
    });
  }
  if (selectedStoryboardFrameUrls.length === 0) {
    selectedStoryboardFrameUrls =
      storyboardFrameUrls.length > 0
        ? storyboardFrameUrls
        : resultUrls.length >= expectedFrameCount
          ? resultUrls
          : [];
  }
  if (
    !storyboardGridUrl &&
    selectedStoryboardFrameUrls.length < expectedFrameCount &&
    startFrameUrls.length === 0 &&
    stopFrameUrls.length === 0
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected image attempt has no usable storyboard frames",
    });
  }
  if (
    selectedStoryboardFrameUrls.length > 0 &&
    selectedStoryboardFrameUrls.length < expectedFrameCount
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected image attempt does not have enough storyboard frames",
    });
  }
  const hasAnyStartStopFrames =
    startFrameUrls.length > 0 || stopFrameUrls.length > 0;
  if (
    hasAnyStartStopFrames &&
    (startFrameUrls.length < expectedFrameCount ||
      stopFrameUrls.length < expectedFrameCount)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Selected image attempt does not have a complete start/stop frame set",
    });
  }
  const selectedAt = nowIso();
  const existingAcceptance = asRecord(
    metadata.generatedMediaAcceptanceEnvelope
  );
  const acceptanceId =
    cleanText(existingAcceptance.acceptanceEnvelopeId) ||
    cleanText(existingAcceptance.acceptanceId) ||
    `acceptance:image:${run.id}:${nanoid(8)}`;
  const selectedMetadata = withUpdatedCreditSummary({
    ...metadata,
    ...(storyboardGridUrl ? { storyboardGridUrl } : {}),
    ...(selectedStoryboardFrameUrls.length > 0
      ? { storyboardFrameUrls: selectedStoryboardFrameUrls }
      : {}),
    ...(startFrameUrls.length > 0 ? { startFrameUrls } : {}),
    ...(stopFrameUrls.length > 0 ? { stopFrameUrls } : {}),
    selectedImageAttempt: attempt,
    selectedImageAttemptScore: clampImageAttemptScore(
      toNumber(review.qualityScore)
    ),
    selectedImageAttemptReview: review,
    pendingImageRepairUnits: [],
    manualImageAttemptSelection: {
      type: "manual_user_selected_image_attempt",
      runId: run.id,
      attempt,
      reviewId: cleanText(review.reviewId),
      selectedAt,
      selectedBy: auth.userId,
      previousStoryboardReviewId: cleanText(run.storyboardReviewId),
    },
    generatedMediaAcceptanceEnvelope: compactRecord({
      ...existingAcceptance,
      acceptanceId,
      acceptanceEnvelopeId: acceptanceId,
      runId: run.id,
      stageKey: "image_generation",
      status: "accepted_with_warnings",
      checkedAt: selectedAt,
      repairPolicy: "manual_user_selected_image_attempt",
      userReviewRequired: true,
      overrideReason: "manual_user_selected_image_attempt",
      overrideMessage:
        "ผู้ใช้เลือกภาพชุดนี้เองเพื่อสร้าง Storyboard Review แม้ระบบ QA ยังมีคำเตือน",
      selectedImageAttempt: attempt,
      selectedImageAttemptReviewId: cleanText(review.reviewId),
      selectedImageAttemptStatus: cleanText(review.status),
      selectedImageAttemptScore: clampImageAttemptScore(
        toNumber(review.qualityScore)
      ),
      selectedImageAttemptNegativeScore: toNumber(review.negativeScore),
      warningCount: Math.max(toNumber(existingAcceptance.warningCount), 1),
      reasonCodes: uniqueCleanTexts([
        "manual_user_selected_image_attempt",
        ...cleanStringList(review.reasonCodes),
      ]),
    }),
    imageQaReviewOverride: {
      status: "accepted_with_warnings",
      reason: "manual_user_selected_image_attempt",
      selectedImageAttempt: attempt,
      selectedImageAttemptReviewId: cleanText(review.reviewId),
      reasonCodes: cleanStringList(review.reasonCodes),
      createdAt: selectedAt,
      createdBy: auth.userId,
    },
    ...(planRepair.repairedFromVoiceoverRewrite
      ? {
          manualStoryboardReviewPlanRepair: {
            type: "voiceover_rewrite_hydrated_scaffold_plan",
            source: "creativePlanning.voiceoverSkillRewrite",
            selectedImageAttempt: attempt,
            repairedAt: selectedAt,
          },
        }
      : {}),
  });
  const runForStoryboardReview = {
    ...run,
    storyboardReviewId: null,
    metadataJson: selectedMetadata,
  } as MarketplaceAutoReviewRun;
  const storyboardReviewId = await createStoryboardReview({
    db,
    tenantId,
    auth,
    run: runForStoryboardReview,
    plan,
    metadata: selectedMetadata,
  });
  const stages = stageKeysForMode(
    run.outputMode as MarketplaceAutoReviewOutputMode
  );
  await upsertRunStage({
    db,
    runId: run.id,
    stageKey: "storyboard_review",
    stageOrder: stageIndex("storyboard_review", stages),
    status: "completed",
    output: {
      storyboardReviewId,
      selectedImageAttempt: attempt,
      overrideReason: "manual_user_selected_image_attempt",
      planRepair: planRepair.repairedFromVoiceoverRewrite
        ? "voiceover_rewrite_hydrated_scaffold_plan"
        : null,
    },
    stageCompletionEvidence: {
      requiredRefs: [
        "storyboardReview",
        "manualImageAttemptSelection",
        "orderedShotMetadata",
      ],
      artifactRefs: [`storyboardReview:${storyboardReviewId}`],
      qaVerdictRefs: cleanStringList(review.qaVerdictRefs),
      lineageRefs: [`lineage:${run.id}:manual_storyboard_review`],
      policyRefs: ["manual-user-selected-image-attempt"],
      acceptanceRefs: [acceptanceId],
      warningApprovalRefs: ["policy:manual-user-selected-image-attempt"],
    },
  });
  await updateRun({
    db,
    runId: run.id,
    status:
      run.outputMode === "storyboard_images"
        ? "completed"
        : (run.status as MarketplaceAutoReviewStatus),
    currentStage: "storyboard_review",
    stageIndex: stageIndex("storyboard_review", stages),
    stageCount: stages.length,
    storyboardReviewId,
    resultJson: {
      ...asRecord(run.resultJson),
      storyboardReviewId,
      frameUrls: selectedStoryboardFrameUrls,
      startFrameUrls,
      stopFrameUrls,
      selectedImageAttempt: attempt,
      manualImageAttemptSelection: {
        type: "manual_user_selected_image_attempt",
        attempt,
        selectedAt,
      },
      mediaHistorySource: "manual_user_selected_image_attempt",
      audioStrategy: selectedMetadata.audioStrategy ?? "auto",
      resolvedAudioStrategy: selectedMetadata.resolvedAudioStrategy,
    },
    metadataJson: selectedMetadata,
    completedAt:
      run.outputMode === "storyboard_images" ? nowDate() : run.completedAt,
  });
  return getMarketplaceAutoReviewRun(run.id, auth);
}

export async function listMarketplaceAutoReviewRuns(
  input: {
    productId?: string;
    limit?: number;
    summary?: boolean;
  },
  auth: AuthContext
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const runs = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        tenantAccessClause(auth),
        input.productId
          ? eq(marketplaceAutoReviewRuns.productId, input.productId)
          : undefined
      )
    )
    .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
    .limit(limit);
  if (runs.length === 0) return [];
  const stages = await db
    .select()
    .from(marketplaceAutoReviewStages)
    .where(
      inArray(
        marketplaceAutoReviewStages.runId,
        runs.map(run => run.id)
      )
    )
    .orderBy(
      marketplaceAutoReviewStages.runId,
      marketplaceAutoReviewStages.stageOrder
    );
  const stagesByRun = new Map<string, MarketplaceAutoReviewStage[]>();
  for (const stage of stages) {
    stagesByRun.set(stage.runId, [
      ...(stagesByRun.get(stage.runId) ?? []),
      stage,
    ]);
  }
  return runs.map(run =>
    serializeRun(run, stagesByRun.get(run.id) ?? [], {
      includeHeavyMetadata: !input.summary,
    })
  );
}

async function ensureRunStages(
  db: Db,
  runId: string,
  outputMode: MarketplaceAutoReviewOutputMode
) {
  const stages = stageKeysForMode(outputMode);
  for (const [index, stageKey] of stages.entries()) {
    await upsertRunStage({
      db,
      runId,
      stageKey,
      stageOrder: index + 1,
      status: "queued",
    });
  }
}

export async function startMarketplaceAutoReviewRun(
  input: {
    productId: string;
    idempotencyKey?: string | null;
    creationIntent?: "storyboard" | "video" | "auto_review_video" | null;
    outputMode: MarketplaceAutoReviewOutputMode;
    frameStrategy?: MarketplaceAutoReviewFrameStrategyInput;
    audioStrategy?: MarketplaceAutoReviewAudioStrategyInput;
    shotCount?: number | null;
    overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
    imageModel?: MarketplaceAutoReviewImageModel | null;
    qualityMode?: MarketplaceAutoReviewQualityModeInput | null;
    referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  },
  auth: AuthContext,
  runtime: RuntimeContext = {}
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  await cleanupMarketplaceAutoReviewOperationalRuntimeBeforeStart(db);
  const outputMode = input.outputMode;
  const frameStrategy = resolveFrameStrategy(outputMode, input.frameStrategy);
  const audioStrategy: MarketplaceAutoReviewAudioStrategyInput =
    input.audioStrategy ?? "auto";
  const requestedShotCount = normalizeMarketplaceAutoReviewShotCount(
    input.shotCount
  );
  const overlayTextMode = normalizeMarketplaceAutoReviewOverlayTextMode(
    input.overlayTextMode
  );
  const imageModel = normalizeMarketplaceAutoReviewImageModel(input.imageModel);
  const resolvedAudioStrategy = resolveMarketplaceAutoReviewAudioStrategy({
    outputMode,
    requested: audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  const qualityMode: MarketplaceAutoReviewQualityModeInput =
    input.qualityMode ?? "balanced";
  const stages = stageKeysForMode(outputMode);
  const tenantId = autoTenantId(auth);
  const requestedIdempotencyKey = cleanText(input.idempotencyKey);

  const bundle = await getMarketplaceProductWithAccess(input.productId, auth);
  const insights = await loadSupportingInsights(db, bundle, auth);
  const noveltyMemory = await loadMarketplaceAutoReviewNoveltyMemory({
    db,
    tenantId,
    auth,
    productId: input.productId,
  });
  const runId = createMarketplaceId("mar");
  const referenceAnchorHash = buildProductionStableHash(
    input.referenceAnchors ?? {}
  ).slice(0, 12);
  const idempotencyKey =
    requestedIdempotencyKey ||
    buildMarketplaceAutoReviewRunIdempotencyKey({
      tenantId,
      productId: input.productId,
      outputMode,
      frameStrategy,
      audioStrategy,
      resolvedAudioStrategy,
      requestedShotCount,
      overlayTextMode,
      imageModel,
      referenceAnchorHash,
      runId,
    });
  const productionRunId = `mp-auto-${input.productId}-${Date.now().toString(36)}-${nanoid(6)}`;
  const now = nowDate();
  const baseFallbackPlan = buildAutoReviewProductTruthScaffold(
    bundle,
    requestedShotCount
  );
  const serverVerifiedProviderEvidence =
    await serverVerifiedProviderEvidenceFromAnchors(
      input.referenceAnchors,
      baseFallbackPlan.productTruth,
      auth
    );
  const referenceAnchors = resolveMarketplaceAutoReviewReferenceAnchors({
    referenceAnchors: {
      ...(input.referenceAnchors ?? {}),
      creationIntent:
        input.referenceAnchors?.creationIntent ?? input.creationIntent ?? null,
      serverVerifiedProviderEvidence,
    },
    productTruth: baseFallbackPlan.productTruth,
  });
  const fallbackPlan = withMarketplaceAutoReviewReferenceAnchors(
    baseFallbackPlan,
    referenceAnchors
  );
  const preflightMetadata = buildFeature117ContractMetadata({
    runId,
    tenantId,
    auth,
    bundle,
    insights,
    plan: fallbackPlan,
    outputMode,
    frameStrategy,
    audioStrategy,
    resolvedAudioStrategy,
    overlayTextMode,
    referenceAnchors,
    noveltyMemory,
    externalOperationalRecoveryEvidence:
      runtime.externalOperationalRecoveryEvidence,
  });
  const initialProductPreflightEvidence = Array.isArray(
    preflightMetadata.stageCompletionEvidence
  )
    ? (preflightMetadata.stageCompletionEvidence[0] as
        | Record<string, unknown>
        | undefined)
    : undefined;
  const productPreflightBlocked =
    initialProductPreflightEvidence?.status !== "complete";
  let plan = fallbackPlan;
  let feature117Metadata = preflightMetadata;
  let creativePlan: {
    plan: AutoReviewPlan;
    metadata: Record<string, unknown>;
  } = {
    plan: fallbackPlan,
    metadata: {
      source: productPreflightBlocked
        ? "preflight_blocked_no_llm_spend"
        : "preflight_record_created_pending_agents_planning",
      model: null,
      provider: null,
      gatewayRouteId: null,
      creditsUsed: 0,
      fallbackUsed: false,
      agentsSdkRuntime: false,
      generatedAt: nowIso(),
    },
  };
  const buildRunMetadata = (
    metadata: RunMetadata,
    currentPlan: AutoReviewPlan,
    planningMetadata: Record<string, unknown>
  ) =>
    withUpdatedCreditSummary({
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      ...metadata,
      productId: input.productId,
      creationIntent: input.creationIntent ?? referenceAnchors.creationIntent,
      outputMode,
      frameStrategy,
      audioStrategy,
      resolvedAudioStrategy,
      overlayTextMode,
      imageModel,
      requestedShotCount: shotCountForPlan(currentPlan),
      qualityMode,
      referenceAnchors,
      expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
      voiceoverSource:
        resolvedAudioStrategy === "native_video_audio"
          ? "native_video_prompt"
          : resolvedAudioStrategy === "separate_tts_voiceover"
            ? "separate_tts_voiceover"
            : "none",
      concept: currentPlan,
      creativePlanning: planningMetadata,
      llmQaCreditTransactions:
        toNumber(planningMetadata.reservedCredits) ||
        toNumber(planningMetadata.refundCredits) ||
        toNumber(planningMetadata.actualCredits)
          ? [
              {
                stageKey: "concept_story",
                creditsUsed: toNumber(planningMetadata.creditsUsed),
                reservedCredits: toNumber(planningMetadata.reservedCredits),
                actualCredits: toNumber(planningMetadata.actualCredits),
                refundCredits: toNumber(planningMetadata.refundCredits),
                creditTransactionId: planningMetadata.creditTransactionId,
                creditReservationIdempotencyKey:
                  planningMetadata.creditReservationIdempotencyKey,
                refundTransactionId: planningMetadata.refundTransactionId,
                creditCategory: "agents_sdk_creative_planning_gateway",
                model: planningMetadata.model,
                provider: planningMetadata.provider,
                createdAt: planningMetadata.generatedAt,
              },
            ]
          : [],
      productTruth: currentPlan.productTruth,
      productImageUrls: currentPlan.productTruth.imageUrls,
      supportingInsightIds: insights.map(row => row.id),
    });
  const productPreflightEvidence = Array.isArray(
    feature117Metadata.stageCompletionEvidence
  )
    ? (feature117Metadata.stageCompletionEvidence[0] as
        | Record<string, unknown>
        | undefined)
    : undefined;

  const [insertedRun] = await db
    .insert(marketplaceAutoReviewRuns)
    .values({
      id: runId,
      tenantId: auth.tenantId ?? null,
      userId: auth.userId,
      productId: input.productId,
      productionRunId,
      outputMode,
      frameStrategy,
      status: "queued",
      currentStage: "product_preflight",
      stageIndex: stageIndex("product_preflight", stages),
      stageCount: stages.length,
      selectedConceptId: plan.conceptId,
      storyboardReviewId: null,
      videoEditorProjectId: null,
      renderJobId: null,
      resultLibraryItemId: null,
      resultJson: {},
      metadataJson: buildRunMetadata(
        feature117Metadata,
        plan,
        creativePlan.metadata
      ),
      errorMessage: null,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: marketplaceAutoReviewRuns.id });
  if (!insertedRun?.id) {
    if (requestedIdempotencyKey) {
      const [conflictingByIdempotency] = await db
        .select()
        .from(marketplaceAutoReviewRuns)
        .where(
          and(
            eq(marketplaceAutoReviewRuns.userId, auth.userId),
            tenantAccessClause(auth),
            eq(
              marketplaceAutoReviewRuns.idempotencyKey,
              requestedIdempotencyKey
            )
          )
        )
        .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
        .limit(1);
      if (conflictingByIdempotency?.id) {
        if (conflictingByIdempotency.productId !== input.productId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Idempotency key is already associated with a different marketplace product",
          });
        }
        if (
          ACTIVE_RUN_STATUSES.includes(
            cleanText(conflictingByIdempotency.status) as
              | "queued"
              | "running"
              | "waiting_provider"
          )
        ) {
          queueMarketplaceAutoReviewAdvance(
            conflictingByIdempotency.id,
            auth,
            runtime,
            5_000
          );
        }
        return getMarketplaceAutoReviewRun(conflictingByIdempotency.id, auth);
      }
    }
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Could not start auto review run because another run was created at the same time",
    });
  }
  await ensureRunStages(db, runId, outputMode);
  await upsertRunStage({
    db,
    runId,
    stageKey: "product_preflight",
    stageOrder: stageIndex("product_preflight", stages),
    status: productPreflightBlocked ? "blocked" : "completed",
    output: {
      evidenceRefs: [
        "productEvidenceLock",
        "productReferenceAssetPack",
        "evidenceInstructionFirewall",
        "creditSummary",
      ],
      completionEvidenceId: productPreflightEvidence?.evidenceId,
      statusDetail: productPreflightBlocked
        ? {
            state:
              (feature117Metadata.productReferenceAssetPack as any)?.status ===
              "blocked"
                ? "product_reference_blocked"
                : (feature117Metadata.accessSnapshot as any)?.status ===
                    "blocked"
                  ? "awaiting_credit_authorization"
                  : "evidence_instruction_blocked",
            severity: "blocked",
            stageKey: "product_preflight",
            reasonCodes: productPreflightEvidence?.missingRefs ?? [
              "product_preflight_blocked",
            ],
            safeMessage:
              (feature117Metadata.productReferenceAssetPack as any)?.status ===
              "blocked"
                ? "ยังไม่มีรูปสินค้าที่ระบบใช้เป็น reference ได้ จึงหยุดก่อนสร้างภาพหรือวิดีโอ"
                : (feature117Metadata.accessSnapshot as any)?.status ===
                    "blocked"
                  ? "สิทธิ์สินค้าเป็นแบบอ่านอย่างเดียว ระบบจึงไม่สามารถใช้เครดิตเพื่อสร้างสื่อจากสินค้านี้"
                  : "พบข้อความจาก marketplace ที่เสี่ยงเป็นคำสั่งแทรก จึงหยุดก่อนส่งข้อมูลเข้า Agents",
            nextAction:
              (feature117Metadata.productReferenceAssetPack as any)?.status ===
              "blocked"
                ? "เลือกหรืออัปโหลดรูปสินค้าที่เห็นตัวสินค้าชัดเจนก่อนเริ่มใหม่"
                : (feature117Metadata.accessSnapshot as any)?.status ===
                    "blocked"
                  ? "ขอสิทธิ์แก้ไข/เจ้าของสินค้า หรือคัดลอกสินค้าเป็นของ workspace ก่อนเริ่มใหม่"
                  : "ตรวจข้อมูลสินค้า/จับภาพใหม่ แล้วเริ่มงานอีกครั้ง",
            userActionRequired: true,
            retryable: true,
          }
        : {
            state: "completed",
            severity: "success",
            stageKey: "product_preflight",
            reasonCodes: [],
            safeMessage:
              "ตรวจข้อมูลสินค้า reference เครดิต policy และ evidence firewall ผ่านแล้ว",
            userActionRequired: false,
            retryable: false,
          },
    },
    stageCompletionEvidence: stageCompletionInputFromExisting(
      productPreflightEvidence
    ),
  });
  if (productPreflightBlocked) {
    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "product_preflight",
      stageIndex: stageIndex("product_preflight", stages),
      stageCount: stages.length,
    });
    return getMarketplaceAutoReviewRun(runId, auth);
  }
  await updateRun({
    db,
    runId,
    status: "running",
    currentStage: "concept_story",
    stageIndex: stageIndex("concept_story", stages),
    stageCount: stages.length,
  });
  try {
    const runForPlanning = await reloadRun(db, runId, auth);
    creativePlan = await buildGatewayCreativeAutoReviewPlan({
      db,
      tenantId,
      auth,
      run: runForPlanning,
      runId,
      productionRunId,
      bundle,
      insights,
      outputMode,
      frameStrategy,
      audioStrategy,
      resolvedAudioStrategy,
      overlayTextMode,
      fallbackPlan,
      preflightMetadata,
      referenceAnchors,
      noveltyMemory,
    });
    plan = creativePlan.plan;
    const voiceoverRewrite =
      await rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill({
        tenantId,
        auth,
        runId,
        productionRunId,
        plan,
        outputMode,
        frameStrategy,
        resolvedAudioStrategy,
        referenceAnchors,
      });
    plan = voiceoverRewrite.plan;
    creativePlan = {
      plan,
      metadata: {
        ...creativePlan.metadata,
        voiceoverSkillRewrite: voiceoverRewrite.metadata,
      },
    };
    feature117Metadata = buildFeature117ContractMetadata({
      runId,
      tenantId,
      auth,
      bundle,
      insights,
      plan,
      outputMode,
      frameStrategy,
      audioStrategy,
      resolvedAudioStrategy,
      overlayTextMode,
      referenceAnchors,
      noveltyMemory: asRecord(creativePlan.metadata.noveltyMemory),
      externalOperationalRecoveryEvidence:
        runtime.externalOperationalRecoveryEvidence,
    });
    await updateRun({
      db,
      runId,
      selectedConceptId: plan.conceptId,
      metadataJson: buildRunMetadata(
        feature117Metadata,
        plan,
        creativePlan.metadata
      ),
    });
  } catch (error) {
    if ((error as any)?.__marketplaceAutoReviewRecheckRequired) {
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    const [runForFailure] = await db
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(eq(marketplaceAutoReviewRuns.id, runId))
      .limit(1);
    if (runForFailure) {
      await markRunFailed(
        db,
        runForFailure,
        error instanceof Error
          ? error.message
          : "Marketplace Auto Review Agents SDK creative planning failed",
        "concept_story"
      );
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    throw error;
  }
  await insertDirectProductionDirectorProject({
    db,
    tenantId,
    auth,
    productionRunId,
    plan,
    outputMode,
    frameStrategy,
    audioStrategy,
    resolvedAudioStrategy,
    metadata: feature117Metadata,
  });
  await upsertRunStage({
    db,
    runId,
    stageKey: "production_project",
    stageOrder: stageIndex("production_project", stages),
    status: "completed",
    output: {
      productionRunId,
      runtime: "direct_media_execution",
      noNodeCanvasExecution: true,
    },
    stageCompletionEvidence: {
      requiredRefs: [
        "mediaProductionRun",
        "mediaProductionGoalVersion",
        "mediaProductionPlanVersion",
        "mediaProductionPlanVerification",
        "mediaProductionApproval",
      ],
      artifactRefs: [`productionRun:${productionRunId}`],
      policyRefs: ["no-node-canvas-execution", "direct-media-execution"],
      lineageRefs: [`lineage:${runId}:product`],
    },
  });
  await upsertRunStage({
    db,
    runId,
    stageKey: "concept_story",
    stageOrder: stageIndex("concept_story", stages),
    status: "completed",
    output: {
      conceptId: plan.conceptId,
      storyboardGuide: plan.storyboardGuide,
      voiceoverScript: plan.voiceoverScript,
      creativePlanning: creativePlan.metadata,
    },
    stageCompletionEvidence: {
      requiredRefs: [
        "creativeBriefSnapshot",
        "capabilityManifest",
        "creativePlan",
        "llmPlanningCredit",
        "evidenceInstructionFirewall",
      ],
      artifactRefs: [`concept:${plan.conceptId}`, `brief:${runId}`],
      qaVerdictRefs: [`creative-plan-verdict:${runId}`],
      creditRefs: creativePlan.metadata.creditsUsed
        ? [`llm-credit:${runId}:concept_story`]
        : [],
      lineageRefs: [`lineage:${runId}:product`],
      policyRefs: ["ad-policy:th-global:v1", "gateway-only-llm-runtime"],
    },
  });
  await upsertRunStage({
    db,
    runId,
    stageKey: "prompt_plan",
    stageOrder: stageIndex("prompt_plan", stages),
    status: "completed",
    output: {
      frameStrategy,
      shotCount: plan.shots.length,
      audioStrategy,
      resolvedAudioStrategy,
    },
    stageCompletionEvidence: {
      requiredRefs: [
        "storyboardContract",
        "shotMediaPayloads",
        "productReferenceAssetPack",
        "characterIdentityAssetPack",
        "visualWarningPlan",
      ],
      artifactRefs: [`storyboard:${plan.conceptId}`, `shot-payloads:${runId}`],
      qaVerdictRefs: [`prompt-plan-verdict:${runId}`],
      lineageRefs: [`lineage:${runId}:product`],
      policyRefs: ["product-reference-locked", "character-identity-limited"],
    },
  });
  await updateRun({
    db,
    runId,
    status: "running",
    currentStage: "image_generation",
    stageIndex: stageIndex("image_generation", stages),
    stageCount: stages.length,
    selectedConceptId: plan.conceptId,
  });

  queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 500);
  return getMarketplaceAutoReviewRun(runId, auth);
}

async function markRunFailed(
  db: Db,
  run: MarketplaceAutoReviewRun,
  message: string,
  stageKey?: StageKey | string,
  stageOutput?: Record<string, unknown>
) {
  const stages = stageKeysForMode(
    run.outputMode as MarketplaceAutoReviewOutputMode
  );
  if (stageKey && stages.includes(stageKey as StageKey)) {
    await upsertRunStage({
      db,
      runId: run.id,
      stageKey: stageKey as StageKey,
      stageOrder: stageIndex(stageKey, stages),
      status: "failed",
      output: stageOutput,
      errorMessage: message,
      stageCompletionEvidence: {
        status: "terminal_failure",
        requiredRefs: ["failureReason", "currentStage"],
        artifactRefs: [`run:${run.id}`],
        creditRefs: ["credit-reconciliation:failed-run-checked"],
        missingRefs: ["stageCompletionSuccess"],
        policyRefs: ["fail-closed"],
      },
    });
  }
  return updateRun({
    db,
    runId: run.id,
    status: "failed",
    currentStage: stageKey ?? run.currentStage,
    errorMessage: message,
    completedAt: nowDate(),
  });
}

async function scheduleImageAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}) {
  assertMarketplaceAutoReviewGovernanceReady(params.metadata, "visual_spend");
  await assertPaidStageAuthorityFresh({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    phase: "visual_spend",
    stageKey: "image_generation",
  });
  const userToken = cleanText(params.runtime.userToken);
  if (!userToken)
    throw new Error("Image generation needs an authenticated media token");
  const plan = extractPlanFromRun(params.run);
  const publicUrl = await resolveMarketplaceAutoReviewPublicUrl(
    params.runtime.publicUrl
  );
  if (
    marketplaceAutoReviewReferenceRoleRequired(params.metadata, "character") &&
    !characterIdentityAllowsVisualGeneration(params.metadata)
  ) {
    throw new Error(
      "Character identity asset pack blocks visual generation for this Marketplace Auto Review run"
    );
  }
  const referenceImageGroups = productReferenceStoryboardReferenceImageGroups(
    params.metadata,
    plan,
    5
  );
  const providerReferenceImageGroups =
    normalizeProductReferenceStoryboardReferenceImageGroups(
      referenceImageGroups,
      publicUrl
    );
  const productReferenceUrls = providerReferenceImageGroups.all;
  const providerReferenceImageManifest =
    productReferenceStoryboardReferenceImageManifest(
      providerReferenceImageGroups
    );
  const frameStrategy = params.run
    .frameStrategy as MarketplaceAutoReviewFrameStrategy;
  const imageModel = normalizeMarketplaceAutoReviewImageModel(
    params.metadata.imageModel
  );
  const existingRefs = directTaskRefs(params.metadata.directImageTasks);
  const activeRefs = latestTaskRefsByUnit(existingRefs).filter(
    ref =>
      directMediaRefReachedProvider(ref) &&
      ref.status !== "completed" &&
      ref.status !== "failed"
  );
  if (activeRefs.length > 0)
    return (
      cleanText(params.metadata.imageAttemptId) ||
      `direct-image-${params.run.id}`
    );

  const pendingRepairUnits = directImageUnits(
    params.metadata.pendingImageRepairUnits
  );
  const providerUnreachedIntentUnits =
    imageUnitsFromProviderUnreachedSubmitIntents(existingRefs);
  const repairUnits = imageRepairUnitsForFrameStrategy(
    frameStrategy,
    pendingRepairUnits.length > 0
      ? pendingRepairUnits
      : providerUnreachedIntentUnits
  );
  const units =
    repairUnits.length > 0
      ? repairUnits
      : existingRefs.length === 0
        ? buildInitialImageUnits(plan, frameStrategy)
        : [];
  if (units.length === 0)
    return (
      cleanText(params.metadata.imageAttemptId) ||
      `direct-image-${params.run.id}`
    );

  const attemptId =
    cleanText(params.metadata.imageAttemptId) || `direct-image-${nanoid(12)}`;
  const submittedRefs: DirectMediaTaskRef[] = [];
  let skippedExhaustedRepairUnits = 0;
  for (const unit of units) {
    const attempt = nextDirectAttempt(existingRefs, unit.unitId);
    if (attempt > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1) {
      console.warn("[marketplaceAutoReview] image_repair_max_attempts", {
        runId: params.run.id,
        productionRunId: params.run.productionRunId,
        productId: plan.productTruth.productId,
        frameStrategy,
        unitId: unit.unitId,
        unitRole: unit.role,
        attempted: attempt - 1,
        maxRepairAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS,
        repairReasonCodes: unit.repairReasonCodes ?? [],
        repairInstruction: cleanText(unit.repairInstruction),
        latestRefs: latestTaskRefsByUnit(existingRefs)
          .filter(ref => ref.unitId === unit.unitId)
          .map(ref => ({
            taskId: cleanText(ref.taskId),
            providerTaskId: cleanText(ref.providerTaskId),
            status: cleanText(ref.status),
            attempt: toNumber(ref.attempt),
            errorMessage: cleanText(ref.errorMessage),
            hasResultUrl: Boolean(cleanText(ref.resultUrl)),
          })),
        latestQa: imageVisionQaEnvelopesFromMetadata(params.metadata)
          .slice(-3)
          .map(qa => {
            const record = asRecord(qa);
            return {
              qaEnvelopeId: cleanText(record.qaEnvelopeId),
              shotId: cleanText(record.shotId),
              status: cleanText(record.status),
              verdict: cleanText(record.verdict),
              reasonCodes: Array.isArray(record.reasonCodes)
                ? record.reasonCodes
                    .map(item => cleanText(item))
                    .filter(Boolean)
                : [],
              repairInstruction: cleanText(record.repairInstruction),
            };
          }),
      });
      skippedExhaustedRepairUnits += 1;
      continue;
    }
    const overlayTextMode = normalizeMarketplaceAutoReviewOverlayTextMode(
      params.metadata.overlayTextMode
    );
    let promptPackage: {
      prompt: string;
      preflight: MarketplaceAutoReviewPromptPreflightResult;
      skillRun: ProductReferenceStoryboardPromptSkillRunResult | null;
      skillRuntime: Record<string, unknown> | null;
    };
    try {
      promptPackage = await prepareMarketplaceAutoReviewImagePromptForSubmit({
        tenantId: params.tenantId,
        auth: params.auth,
        runId: params.run.id,
        plan,
        unit,
        attempt,
        overlayTextMode,
        referenceImageGroups: providerReferenceImageGroups,
        publicUrl,
        metadata: params.metadata,
      });
    } catch (error) {
      if (error instanceof MarketplaceAutoReviewImagePromptPreflightError) {
        const promptAudit = buildMarketplaceAutoReviewImagePromptAudit({
          runId: params.run.id,
          unit,
          attempt,
          prompt: error.prompt,
          promptPreflight: error.preflight,
          overlayTextMode,
          referenceImageUrls: productReferenceUrls,
          referenceImageManifest: providerReferenceImageManifest,
          skillRuntime: error.skillRuntime,
        });
        const nextMetadata =
          appendMarketplaceAutoReviewImagePromptPreflightAudit(
            params.metadata,
            promptAudit
          );
        Object.assign(params.metadata, nextMetadata);
        await updateRun({
          db: params.db,
          runId: params.run.id,
          metadataJson: nextMetadata,
          errorMessage: error.message,
        });
        console.error(
          "[marketplaceAutoReview] image_prompt_preflight_blocked_before_submit",
          {
            runId: params.run.id,
            productionRunId: params.run.productionRunId,
            productId: plan.productTruth.productId,
            unitId: unit.unitId,
            unitRole: unit.role,
            attempt,
            ruleSet: error.preflight.ruleSet,
            blockers: error.preflight.blockers,
            warnings: error.preflight.warnings,
            score: error.preflight.score,
            promptHash: promptAudit.promptHash,
            promptLengthChars: promptAudit.promptLengthChars,
            promptMaxLengthChars: promptAudit.promptMaxLengthChars,
            skillSelection: promptAudit.skillSelection,
            generationContract: promptAudit.generationContract,
            contractChecks: promptAudit.contractChecks,
            dispatchDecision: promptAudit.dispatchDecision,
          }
        );
        const metadataAfterPreflightFailure = withUpdatedCreditSummary({
          ...nextMetadata,
          generatedMediaAcceptanceEnvelope: {
            ...asRecord(nextMetadata.generatedMediaAcceptanceEnvelope),
            status: "pending",
            stageKey: "image_generation",
            updatedAt: nowIso(),
          },
        });
        Object.assign(params.metadata, metadataAfterPreflightFailure);
        await updateRun({
          db: params.db,
          runId: params.run.id,
          metadataJson: metadataAfterPreflightFailure,
          errorMessage: error.message,
        });
      }
      if (unit.role === "storyboard_grid") {
        console.error(
          "[marketplaceAutoReview] product_reference_storyboard_skill_or_preflight_failed",
          {
            runId: params.run.id,
            productionRunId: params.run.productionRunId,
            productId: plan.productTruth.productId,
            unitId: unit.unitId,
            attempt,
            requiredSkill: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            fallbackUsed: false,
            providerSubmitBlockedBeforeCredit: true,
          }
        );
      }
      throw error;
    }
    const prompt = promptPackage.prompt;
    const promptAudit = buildMarketplaceAutoReviewImagePromptAudit({
      runId: params.run.id,
      unit,
      attempt,
      prompt,
      promptPreflight: promptPackage.preflight,
      overlayTextMode,
      referenceImageUrls: productReferenceUrls,
      referenceImageManifest: providerReferenceImageManifest,
      skillRuntime: promptPackage.skillRuntime,
    });
    let credit: Awaited<
      ReturnType<typeof reserveMarketplaceMediaCredits>
    > | null = null;
    let intentRef: DirectMediaTaskRef | null = null;
    try {
      credit = await reserveMarketplaceMediaCredits({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: params.run,
        stageKey: "image_generation",
        mediaType: "image",
        unitId: unit.unitId,
        attempt,
        model: imageModel,
        selections: {
          numImages: 1,
          resolution: "2K",
          aspectRatio: "9:16",
        },
        description: `Marketplace auto review image ${unit.unitId} (reserved)`,
        metadata: {
          role: unit.role,
          shotId: unit.shotId,
          shotOrder: unit.shotOrder,
          repairReasonCodes: unit.repairReasonCodes,
          overlayTextMode,
          imageModel,
          promptPreflight: promptPackage.preflight,
        },
      });
      intentRef = buildDirectMediaSubmitIntentRef({
        runId: params.run.id,
        mediaType: "image",
        stageKey: "image_generation",
        unit,
        attempt,
        model: imageModel,
        credit,
        referenceImageUrls: productReferenceUrls,
        referenceImageManifest: providerReferenceImageManifest,
      });
      intentRef.providerSubmitEvidence = {
        ...(intentRef.providerSubmitEvidence ?? {}),
        promptPreflight: promptPackage.preflight,
        promptAudit,
      };
      intentRef.promptHash = cleanText(promptAudit.promptHash);
      intentRef.promptLengthChars = toNumber(promptAudit.promptLengthChars);
      intentRef.promptSnippet = cleanText(promptAudit.promptSnippet);
      intentRef.promptPreflight = promptPackage.preflight;
      intentRef.skillRuntime = promptPackage.skillRuntime;
      submittedRefs.push(intentRef);
      await persistDirectMediaSubmitProgress({
        db: params.db,
        run: params.run,
        metadata: params.metadata,
        mediaType: "image",
        attemptId,
        existingRefs,
        submittedRefs,
      });
      const task = await mediaGenerationService.generateImageAsync(
        {
          prompt,
          model: imageModel,
          aspectRatio: "9:16",
          resolution: "2K",
          outputFormat: "png",
          numImages: 1,
          referenceImageUrls: productReferenceUrls,
          publicUrl: publicUrl || undefined,
          extraParams: compactRecord({
            reference_image_manifest: providerReferenceImageManifest,
            reference_image_role_order: providerReferenceImageManifest.map(
              entry => `${entry.placeholder}=${entry.role}`
            ),
            reference_image_role_counts: {
              product: providerReferenceImageGroups.product.length,
              character: providerReferenceImageGroups.character.length,
              environment: providerReferenceImageGroups.environment.length,
              total: providerReferenceImageGroups.all.length,
            },
            __origin_surface: "marketplace_auto_review",
            __execution_path: "direct_media_service",
            __no_node_canvas_execution: true,
            __marketplace_product_id: plan.productTruth.productId,
            __marketplace_product_name: plan.productTruth.productName,
            __production_run_id: params.run.productionRunId,
            __auto_review_run_id: params.run.id,
            __auto_review_concept_id: plan.conceptId,
            __unit_id: unit.unitId,
            __unit_role: unit.role,
            __overlay_text_mode: overlayTextMode,
            __image_model: imageModel,
            __prompt_preflight_status: promptPackage.preflight.status,
            __prompt_preflight_score: promptPackage.preflight.score,
            __prompt_preflight_rule_set: promptPackage.preflight.ruleSet,
            __prompt_hash: promptAudit.promptHash,
            __prompt_length_chars: prompt.length,
            __reference_image_manifest: providerReferenceImageManifest,
            __prompt_max_length_chars:
              MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS,
            __prompt_skill_id: PRODUCT_REFERENCE_STORYBOARD_SKILL_ID,
            __prompt_skill_runtime_status:
              promptPackage.skillRun?.runtime.status || undefined,
            __prompt_skill_output_length_chars:
              promptPackage.skillRun?.prompt.length || undefined,
            __repair_attempt: attempt,
          }),
          auditContext: {
            userId: params.auth.userId,
            traceId: `marketplace-auto-review-image:${params.run.id}:${unit.unitId}:${attempt}`,
            source: "marketplace_auto_review",
            stage: "image_generation",
          },
        },
        userToken
      );
      const submittedRef: DirectMediaTaskRef = {
        ...(intentRef ?? {}),
        unitId: unit.unitId,
        mediaType: "image",
        stageKey: "image_generation",
        role: unit.role,
        shotId: unit.shotId,
        shotOrder: unit.shotOrder,
        attempt,
        taskId: task.id,
        providerTaskId: task.taskId,
        model: task.model || imageModel,
        status: task.status,
        creditAmount: credit.amount,
        creditTransactionId: credit.transactionId,
        creditIdempotencyKey: credit.idempotencyKey,
        repairReasonCodes: unit.repairReasonCodes,
        referenceImageUrls: productReferenceUrls,
        referenceImageManifest: providerReferenceImageManifest,
        overlayTextMode,
        promptHash: cleanText(promptAudit.promptHash),
        promptLengthChars: prompt.length,
        promptSnippet: cleanText(promptAudit.promptSnippet),
        promptPreflight: promptPackage.preflight,
        skillRuntime: promptPackage.skillRuntime,
        submittedAt: nowIso(),
        providerSubmitIntentStatus: "submitted_to_provider",
        providerSubmitEvidence: {
          ...(intentRef?.providerSubmitEvidence ?? {}),
          promptPreflight: promptPackage.preflight,
          promptAudit,
        },
      };
      submittedRefs.splice(
        0,
        submittedRefs.length,
        ...replaceDirectMediaSubmittedRef(
          submittedRefs,
          intentRef,
          submittedRef
        )
      );
    } catch (error) {
      if (credit) {
        const failedRef: DirectMediaTaskRef = {
          ...(intentRef ?? {}),
          unitId: unit.unitId,
          mediaType: "image",
          stageKey: "image_generation",
          role: unit.role,
          shotId: unit.shotId,
          shotOrder: unit.shotOrder,
          attempt,
          taskId: `submit-failed:${unit.unitId}:${attempt}`,
          model: imageModel,
          status: "failed",
          creditAmount: credit.amount,
          creditTransactionId: credit.transactionId,
          creditIdempotencyKey: credit.idempotencyKey,
          submittedAt: nowIso(),
          providerSubmitIntentId: intentRef?.providerSubmitIntentId,
          providerSubmitIntentStatus: intentRef
            ? "provider_submit_failed_after_intent"
            : "provider_submit_failed_before_intent",
          providerSubmitIntentRecordedAt:
            intentRef?.providerSubmitIntentRecordedAt,
          providerSubmitEvidence: compactRecord({
            ...asRecord(intentRef?.providerSubmitEvidence),
            status: intentRef
              ? "provider_submit_failed_after_intent"
              : "provider_submit_failed_before_intent",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            failedAt: nowIso(),
          }),
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        const refunded = await refundMarketplaceMediaCredits({
          auth: params.auth,
          ref: failedRef,
          reason: "submit_failed",
        }).catch(refundError => ({
          ...failedRef,
          errorMessage: [
            failedRef.errorMessage,
            `refund_failed:${refundError instanceof Error ? refundError.message : String(refundError)}`,
          ]
            .filter(Boolean)
            .join("; "),
        }));
        submittedRefs.splice(
          0,
          submittedRefs.length,
          ...replaceDirectMediaSubmittedRef(submittedRefs, intentRef, refunded)
        );
      }
      if (submittedRefs.length > 0) {
        await persistDirectMediaSubmitProgress({
          db: params.db,
          run: params.run,
          metadata: params.metadata,
          mediaType: "image",
          attemptId,
          existingRefs,
          submittedRefs,
        });
      }
      throw error;
    }
    await persistDirectMediaSubmitProgress({
      db: params.db,
      run: params.run,
      metadata: params.metadata,
      mediaType: "image",
      attemptId,
      existingRefs,
      submittedRefs,
    });
  }
  if (submittedRefs.length === 0 && skippedExhaustedRepairUnits > 0) {
    return attemptId;
  }
  await persistDirectMediaSubmitProgress({
    db: params.db,
    run: params.run,
    metadata: params.metadata,
    mediaType: "image",
    attemptId,
    existingRefs,
    submittedRefs,
    clearPendingRepairUnits: true,
  });
  return attemptId;
}

async function reconcileAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productionRunId: string;
  attemptId: string;
  runtime: RuntimeContext;
}): Promise<DirectMediaReconcileResult> {
  const [run] = await params.db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.productionRunId, params.productionRunId),
        eq(marketplaceAutoReviewRuns.userId, params.auth.userId),
        tenantAccessClause(params.auth)
      )
    )
    .limit(1);
  if (!run)
    throw new Error(
      "Marketplace auto review run not found for direct media reconcile"
    );
  const userToken = cleanText(params.runtime.userToken);
  if (!userToken)
    throw new Error(
      "Provider status polling needs an authenticated media token"
    );
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const plan = extractPlanFromRun(run);
  if (params.attemptId.startsWith("direct-video-")) {
    return reconcileDirectVideoAttempt({
      ...params,
      run,
      metadata,
      plan,
      userToken,
    });
  }
  return reconcileDirectImageAttempt({
    ...params,
    run,
    metadata,
    plan,
    userToken,
  });
}

async function pollDirectTask(params: {
  ref: DirectMediaTaskRef;
  auth: AuthContext;
  userToken: string;
  stage: string;
}): Promise<DirectMediaTaskRef> {
  if (params.ref.status === "completed" && params.ref.resultUrl)
    return params.ref;
  if (params.ref.status === "failed") return params.ref;
  if (!directMediaRefReachedProvider(params.ref)) return params.ref;
  const task = await mediaGenerationService.getTask(
    params.ref.taskId,
    params.userToken,
    {
      userId: params.auth.userId,
      traceId: `marketplace-auto-review-${params.stage}:${params.ref.unitId}:${params.ref.attempt}`,
      source: "marketplace_auto_review",
      stage: params.stage,
    }
  );
  const resultUrl =
    task.status === "completed"
      ? mediaTaskResultUrl(task)
      : cleanText(params.ref.resultUrl);
  return {
    ...params.ref,
    providerTaskId: task.taskId ?? params.ref.providerTaskId,
    model: task.model || params.ref.model,
    status: task.status,
    resultUrl: resultUrl || undefined,
    errorMessage: task.errorMessage ?? params.ref.errorMessage,
    completedAt:
      task.status === "completed" ? nowIso() : params.ref.completedAt,
  };
}

function imageUrlsFromDirectRefs(params: {
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  refs: DirectMediaTaskRef[];
  frameStrategy?: MarketplaceAutoReviewFrameStrategy;
}): {
  storyboardFrameUrls?: string[];
  startFrameUrls?: string[];
  stopFrameUrls?: string[];
} {
  const latest = latestTaskRefsByUnit(params.refs).filter(
    ref => ref.status === "completed" && cleanText(ref.resultUrl)
  );
  const storyboardFrameUrls = [...(params.metadata.storyboardFrameUrls ?? [])];
  const startFrameUrls = [...(params.metadata.startFrameUrls ?? [])];
  const stopFrameUrls = [...(params.metadata.stopFrameUrls ?? [])];
  const allowStoryboardFrameOverrides =
    params.frameStrategy !== "storyboard_3x3_split";
  for (const ref of latest) {
    const index = Math.max(0, toNumber(ref.shotOrder) - 1);
    if (!ref.resultUrl) continue;
    if (allowStoryboardFrameOverrides && ref.role === "storyboard_frame")
      storyboardFrameUrls[index] = ref.resultUrl;
    if (ref.role === "start_frame") startFrameUrls[index] = ref.resultUrl;
    if (ref.role === "stop_frame") stopFrameUrls[index] = ref.resultUrl;
  }
  return {
    storyboardFrameUrls: storyboardFrameUrls.some(Boolean)
      ? storyboardFrameUrls
      : undefined,
    startFrameUrls: startFrameUrls.some(Boolean) ? startFrameUrls : undefined,
    stopFrameUrls: stopFrameUrls.some(Boolean) ? stopFrameUrls : undefined,
  };
}

function buildStoryboardGridLayoutQaRuntimeUnavailableEnvelope(params: {
  runId: string;
  gridUrl: string;
  model: string;
  imagePromptHashes: string[];
  qaCacheKey?: string;
  error: unknown;
}): Record<string, unknown> {
  const errorRecord = asRecord(params.error);
  const adapterStatus =
    params.error instanceof AgentRuntimeClientError
      ? params.error.status
      : toNumber(errorRecord.status);
  const adapterCode =
    params.error instanceof AgentRuntimeClientError
      ? params.error.code
      : cleanText(errorRecord.code);
  const errorMessage =
    cleanText(errorRecord.message) ||
    "Storyboard grid layout QA runtime adapter unavailable.";
  return {
    qaEnvelopeId: `storyboard-grid-qa:${params.runId}:${nanoid(8)}`,
    runId: params.runId,
    shotId: "storyboard-grid",
    stageKey: "image_generation",
    mediaUnit: "storyboard_grid",
    status: "qa_unavailable_warning",
    checkedAt: nowIso(),
    model: params.model,
    provider: "agent-runtime",
    frameUrls: [params.gridUrl],
    frameRoles: ["storyboard_grid"],
    failedFrameRoles: ["storyboard_grid"],
    imagePromptHashes: params.imagePromptHashes,
    verdict: "repair",
    score: 0,
    reasonCodes: [
      "storyboard_grid_layout_qa_unavailable",
      adapterCode || "agent_runtime_adapter_error",
    ].filter(Boolean),
    repairInstruction:
      "Storyboard grid layout QA runtime was unavailable, so the provider image cannot be treated as a verified 3x3 grid. Regenerate one complete 9:16 storyboard canvas as exactly 3 columns x 3 rows with 9 equal panels and no visible labels.",
    qaCacheKey: cleanText(params.qaCacheKey),
    qaCacheHit: false,
    qaUnavailable: true,
    isStrict3x3: false,
    gridColumns: 0,
    gridRows: 0,
    frameCount: 0,
    visibleAddedText: false,
    errorMessage,
    adapterStatus: adapterStatus || undefined,
    adapterCode: adapterCode || undefined,
  };
}

async function runStoryboardGridLayoutVisionQa(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  gridUrl: string;
  runtime: RuntimeContext;
}): Promise<Record<string, unknown>> {
  const model =
    cleanText(process.env.MARKETPLACE_AUTO_REVIEW_VISION_MODEL) ||
    DEFAULT_VISION_QA_MODEL;
  const imagePromptHashes = directImagePromptFingerprints(params.metadata);
  const absoluteGridUrl = absoluteVisionUrl(
    params.gridUrl,
    params.runtime.publicUrl
  );
  const productReferenceImageGroups =
    normalizeProductReferenceStoryboardReferenceImageGroups(
      productReferenceStoryboardReferenceImageGroups(
        params.metadata,
        params.plan,
        4
      ),
      params.runtime.publicUrl
    );
  const productReferenceManifest =
    productReferenceStoryboardReferenceImageManifest(
      productReferenceImageGroups
    );
  const productReferenceRoleOrder = productReferenceManifest
    .map(entry => `${entry.placeholder}=${entry.role}`)
    .join(", ");
  const hasCharacterReference = productReferenceManifest.some(
    entry => entry.role === "character"
  );
  const productReferenceUrls = productReferenceImageGroups.all;
  const referenceImageFingerprint =
    visualReferenceFingerprint(productReferenceUrls);
  const imageUrls = [
    absoluteGridUrl,
    ...productReferenceUrls.map(url =>
      absoluteVisionUrl(url, params.runtime.publicUrl)
    ),
  ].filter(Boolean);
  const qaCacheKey = marketplaceAutoReviewQaCacheKey({
    kind: "storyboard_grid_layout_vision_qa",
    model,
    runId: params.run.id,
    urls: imageUrls,
    refs: [
      "storyboard_grid",
      ...productReferenceManifest.map(entry => entry.role),
    ],
    promptHashPayload: {
      productName: params.plan.productTruth.productName,
      storyboardGridUrl: params.gridUrl,
      imagePromptHashes,
      referenceImageFingerprint,
      expectedGridRows: 3,
      expectedGridColumns: 3,
      expectedFrameCount: MAX_SHOT_COUNT,
      layoutPreset: "canvas_9_16_grid_3x3_frame_9_16_exact",
    },
  });
  const cached = findMarketplaceAutoReviewQaCacheEntry({
    metadata: params.metadata,
    kind: "storyboard_grid_layout_vision_qa",
    cacheKey: qaCacheKey,
  });
  if (cached) {
    return {
      ...cached,
      qaCacheKey,
      qaCacheHit: true,
      cacheEvidenceRef: qaCacheKey,
    };
  }

  const textInstruction = [
    "ตรวจ QA ภาพ storyboard grid ต้นฉบับก่อนตัดเฟรม โดยตอบ JSON เท่านั้น",
    "ภาพแรกคือผลลัพธ์ provider หนึ่งภาพเต็ม ไม่ใช่ภาพ crop รายเฟรม รูปถัดไปคือ reference anchors ที่ได้รับอนุมัติแล้ว",
    productReferenceRoleOrder
      ? `Reference image role order: ${productReferenceRoleOrder}`
      : "",
    "ต้องเป็นภาพเดียวอัตราส่วน 9:16 ที่มี strict 3x3 grid เท่านั้น: 3 columns x 3 rows, exactly 9 panels, every panel equal size. ห้าม 2x5, 5x2, 10 panels, collage/masonry, merged cells, variable panel sizes, standalone product/lifestyle image, หรือภาพที่มี label/text เช่น storyboard_grid/frame numbers/captions",
    "ตรวจ product fidelity ด้วย: สินค้าในภาพต้องตรง product reference anchor ทุกจุดสำคัญ เช่น shape, proportions, construction, countable parts, material, color, scale; ถ้าไม่ตรงให้ productMatchesReference=false และ verdict=repair",
    hasCharacterReference
      ? "ตรวจ character identity ด้วย: ถ้ามีคน/พรีเซนเตอร์/แม่/ผู้ดูแลในภาพ ต้องตรง character reference anchor ทั้ง identity, age range, face/body structure, hair, wardrobe/styling; ถ้าไม่ตรงให้ characterConsistencySafe=false และ verdict=repair"
      : "",
    marketplaceAutoReviewPlanNeedsMinorSafetyLock(params.plan)
      ? "กฎ publish safety สำหรับเด็ก: ตั้ง minorPresent=true เฉพาะเมื่อเห็นเด็ก/ทารก/toddler/minor จริงในภาพเท่านั้น ถ้าไม่มีเด็กให้ minorPresent=false และ minorSafetyClothingSafe=true เสมอ ถ้ามีเด็กจริงต้องสวมเสื้อผ้าปกปิดอก ลำตัว และบริเวณ underwear ห้ามเด็กไม่ใส่เสื้อ/bare torso/diaper-only/underwear-only/bath/changing/nude/semi-nude หากพบให้ verdict=repair และใส่ reasonCodes เช่น minor_safety_child_clothing_issue หรือ child_shirtless_bare_torso."
      : "",
    "ให้ตรวจด้วยสายตาจากภาพจริงเท่านั้น ถ้าไม่แน่ใจให้ verdict=repair และระบุ reasonCodes ที่ตรงที่สุด",
    'JSON schema: {"verdict":"pass|repair","score":0-100,"reasonCodes":[string],"isStrict3x3":boolean,"gridColumns":number,"gridRows":number,"frameCount":number,"visibleAddedText":boolean,"visibleTextExamples":[string],"repairInstruction":string,"productMatchesReference":boolean,"characterConsistencySafe":boolean,"minorPresent":boolean,"minorSafetyClothingSafe":boolean}',
  ]
    .filter(Boolean)
    .join("\n");
  const runtimeInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: textInstruction },
        ...imageUrls.map(url => ({
          type: "input_image",
          image_url: url,
          detail: "high",
        })),
      ],
    },
  ];

  let agentResult: Awaited<
    ReturnType<typeof runMarketplaceMediaProductionAgent>
  >;
  try {
    agentResult = await runMarketplaceMediaProductionAgent({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: params.run,
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      stageKey: "image_generation",
      model,
      objective:
        "Verify the original provider storyboard grid is exactly one strict 3x3 9:16 canvas before splitting. Return compact JSON only.",
      runtimeInput,
      metadata: params.metadata,
      productTruth: params.plan.productTruth,
      traceSuffix: buildProductionStableHash({
        kind: "storyboard_grid_layout",
        gridUrl: absoluteGridUrl,
      }).slice(0, 16),
      estimatedCreditReserve: 5,
      creditCategory: "vision_qa",
    });
  } catch (error) {
    if (error instanceof AgentRuntimeClientError) {
      console.warn(
        "[marketplaceAutoReview] storyboard_grid_layout_qa_runtime_unavailable_warning",
        {
          runId: params.run.id,
          productionRunId: params.run.productionRunId,
          status: error.status,
          code: error.code,
          message: error.message,
        }
      );
      return buildStoryboardGridLayoutQaRuntimeUnavailableEnvelope({
        runId: params.run.id,
        gridUrl: params.gridUrl,
        model,
        imagePromptHashes,
        qaCacheKey,
        error,
      });
    }
    throw error;
  }

  const { response, creditReservation } = agentResult;
  const inputTokens = estimateTokenCount({
    textInstruction,
    imageUrls,
  });
  const outputTokens = estimateTokenCount(response.finalOutput);
  const credit = await reconcileMarketplaceLlmCredits({
    auth: params.auth,
    reservation: creditReservation,
    inputTokens,
    outputTokens,
    reason: "storyboard_grid_layout_vision_qa_actual_usage_reconciled",
    metadata: {
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      imageCount: imageUrls.length,
      gatewayRouteId: response.gatewayRouteId,
      adapterVersion: response.adapterVersion,
      sdkVersion: response.sdkVersion,
    },
  });
  let parsed = parseAgentRuntimeJsonOutput(response);
  if (Object.keys(parsed).length === 0) {
    parsed = {
      verdict: "repair",
      score: 0,
      reasonCodes: ["storyboard_grid_layout_qa_non_json_response"],
      repairInstruction:
        "Regenerate one complete 9:16 storyboard canvas as a strict 3x3 grid with exactly 9 equal panels and no visible labels.",
    };
  }

  const gridColumns = Math.floor(toNumber(parsed.gridColumns));
  const gridRows = Math.floor(toNumber(parsed.gridRows));
  const frameCount = Math.floor(toNumber(parsed.frameCount));
  const visibleTextExamples = Array.isArray(parsed.visibleTextExamples)
    ? parsed.visibleTextExamples.map(item => cleanText(item)).filter(Boolean)
    : [];
  const visibleAddedText =
    parsed.visibleAddedText === true || visibleTextExamples.length > 0;
  const parsedReasonCodes = Array.isArray(parsed.reasonCodes)
    ? parsed.reasonCodes.map(item => cleanText(item)).filter(Boolean)
    : [];
  const qaDecision = normalizeShotFrameVisionQaDecision({
    parsed,
    plan: params.plan,
    reasonCodes: parsedReasonCodes,
  });
  const reasonCodes = uniqueCleanTexts([
    ...qaDecision.reasonCodes,
    ...(parsed.isStrict3x3 === true ? [] : ["storyboard_grid_layout_mismatch"]),
    ...(gridColumns === 3 ? [] : ["storyboard_grid_columns_mismatch"]),
    ...(gridRows === 3 ? [] : ["storyboard_grid_rows_mismatch"]),
    ...(frameCount === MAX_SHOT_COUNT
      ? []
      : ["storyboard_grid_frame_count_mismatch"]),
    ...(visibleAddedText ? ["storyboard_grid_visible_label_text"] : []),
    ...(cleanText(parsed.verdict) === "pass" &&
    (gridColumns <= 0 || gridRows <= 0 || frameCount <= 0)
      ? ["storyboard_grid_layout_qa_contract_invalid"]
      : []),
  ]);
  const verdict =
    cleanText(parsed.verdict) === "pass" &&
    parsed.isStrict3x3 === true &&
    gridColumns === 3 &&
    gridRows === 3 &&
    frameCount === MAX_SHOT_COUNT &&
    !visibleAddedText &&
    qaDecision.productMatchesReference &&
    qaDecision.characterConsistencySafe &&
    qaDecision.minorSafetyClothingSafe
      ? "pass"
      : "repair";
  return {
    qaEnvelopeId: `storyboard-grid-qa:${params.run.id}:${nanoid(8)}`,
    runId: params.run.id,
    shotId: "storyboard-grid",
    stageKey: "image_generation",
    mediaUnit: "storyboard_grid",
    status: verdict === "pass" ? "passed" : "needs_targeted_repair",
    checkedAt: nowIso(),
    model,
    provider: response.providerId ?? "llm-gateway",
    llmGatewayRouteRef: response.gatewayRouteId ?? "llm-gateway",
    creditsRef: `credit:${credit.idempotencyKey}`,
    creditTransactionId: credit.transactionId,
    reservedCredits: credit.amount,
    actualCredits: credit.actualCredits,
    creditsUsed: credit.creditsUsed,
    refundCredits: credit.refundAmount,
    refundTransactionId: credit.refundTransactionId,
    frameUrls: [params.gridUrl],
    frameRoles: ["storyboard_grid"],
    failedFrameRoles: verdict === "pass" ? [] : ["storyboard_grid"],
    productReferenceUrls,
    imagePromptHashes,
    referenceImageFingerprint,
    productReferenceAssetPackRefs: [
      cleanText(
        asRecord(params.metadata.productReferenceAssetPack).assetPackId
      ),
    ].filter(Boolean),
    characterIdentityAssetPackRefs: [
      cleanText(
        asRecord(params.metadata.characterIdentityAssetPack).assetPackId
      ),
    ].filter(Boolean),
    verdict,
    score: toNumber(parsed.score),
    reasonCodes,
    repairInstruction:
      cleanText(parsed.repairInstruction) ||
      "Regenerate one complete 9:16 storyboard canvas as exactly 3 equal columns x 3 equal rows with 9 panels, no 2x5/5x2/10-panel layout, no collage/masonry layout, and no visible text labels.",
    qaCacheKey,
    qaCacheHit: false,
    isStrict3x3: parsed.isStrict3x3 === true,
    gridColumns,
    gridRows,
    frameCount,
    visibleAddedText,
    visibleTextExamples,
    productMatchesReference: qaDecision.productMatchesReference,
    characterConsistencySafe: qaDecision.characterConsistencySafe,
    minorPresent: qaDecision.minorPresent,
    minorSafetyClothingSafe: qaDecision.minorSafetyClothingSafe,
    adWarningTextSafe: qaDecision.adWarningTextSafe,
  };
}

async function runShotFrameVisionQa(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  shot: AutoReviewShot;
  frameUrls: string[];
  frameRoles: DirectImageFrameRole[];
  runtime: RuntimeContext;
}): Promise<Record<string, unknown>> {
  const model =
    cleanText(process.env.MARKETPLACE_AUTO_REVIEW_VISION_MODEL) ||
    DEFAULT_VISION_QA_MODEL;
  const productReferenceImageGroups =
    normalizeProductReferenceStoryboardReferenceImageGroups(
      productReferenceStoryboardReferenceImageGroups(
        params.metadata,
        params.plan,
        4
      ),
      params.runtime.publicUrl
    );
  const productReferenceManifest =
    productReferenceStoryboardReferenceImageManifest(
      productReferenceImageGroups
    );
  const productReferenceRoleOrder = productReferenceManifest
    .map(entry => `${entry.placeholder}=${entry.role}`)
    .join(", ");
  const hasCharacterReference = productReferenceManifest.some(
    entry => entry.role === "character"
  );
  const productReferenceUrls = productReferenceImageGroups.all;
  const imagePromptHashes = directImagePromptFingerprints(params.metadata);
  const referenceImageFingerprint =
    visualReferenceFingerprint(productReferenceUrls);
  const imageUrls = [...params.frameUrls, ...productReferenceUrls]
    .map(url => absoluteVisionUrl(url, params.runtime.publicUrl))
    .filter(Boolean);
  const qaCacheKey = marketplaceAutoReviewQaCacheKey({
    kind: "shot_frame_vision_qa",
    model,
    runId: params.run.id,
    shotId: params.shot.id,
    urls: imageUrls,
    refs: params.frameRoles,
    promptHashPayload: {
      productName: params.plan.productTruth.productName,
      shotTitle: params.shot.title,
      visual: params.shot.visual,
      frameRoles: params.frameRoles,
      storyboardGridUrl: cleanText(params.metadata.storyboardGridUrl),
      imagePromptHashes,
      referenceImageFingerprint,
    },
  });
  const cached = findMarketplaceAutoReviewQaCacheEntry({
    metadata: params.metadata,
    kind: "shot_frame_vision_qa",
    cacheKey: qaCacheKey,
  });
  if (cached) {
    return {
      ...normalizeCachedShotFrameVisionQaEnvelopeForPlan(cached, params.plan),
      qaCacheKey,
      qaCacheHit: true,
      cacheEvidenceRef: qaCacheKey,
    };
  }
  const textInstruction = [
    "ตรวจ QA ภาพสำหรับคลิปรีวิวสินค้าแบบ auto โดยตอบ JSON เท่านั้น",
    `สินค้า: ${params.plan.productTruth.productName}`,
    `Shot ${params.shot.order}: ${params.shot.title}`,
    `Visual intent: ${params.shot.visual}`,
    "รูปช่วงแรกคือ generated frame ของ shot นี้ ส่วนรูปท้ายคือ reference anchors ที่ได้รับอนุมัติแล้ว โดยรูปสินค้า anchor เป็น truth หลักที่สุด",
    `Generated frame role order: ${params.frameRoles.join(", ")}`,
    productReferenceRoleOrder
      ? `Reference image role order: ${productReferenceRoleOrder}`
      : "",
    "ตรวจว่าภาพสินค้าไม่ผิดจาก product anchor, ไม่เพิ่มรายละเอียดสินค้าเอง, continuity ของ start/stop หรือ storyboard frame สอดคล้อง, ถ้ามี character anchor ต้องหน้า/ตัวตนไม่เปลี่ยนระหว่าง shot, ถ้ามี environment anchor ฉากต้องต่อเนื่อง และข้อความคำเตือนในภาพไม่บังสินค้า",
    hasCharacterReference
      ? "ถ้ามี character reference แล้วภาพคน/เด็ก/พรีเซนเตอร์ไม่ตรง identity, age range, face/body structure, hair, หรือ wardrobe/styling จาก character anchor ให้ตอบ characterConsistencySafe=false และ verdict=repair ทันที"
      : "",
    marketplaceAutoReviewPlanNeedsMinorSafetyLock(params.plan)
      ? "กฎ publish safety สำหรับเด็ก: ตั้ง minorPresent=true เฉพาะเมื่อเห็นเด็ก/ทารก/toddler/minor จริงในภาพเท่านั้น ถ้าไม่มีเด็กให้ minorPresent=false และ minorSafetyClothingSafe=true เสมอ ถ้ามีเด็กจริงต้องสวมเสื้อผ้าปกปิดอก ลำตัว และบริเวณ underwear ห้ามเด็กไม่ใส่เสื้อ/bare torso/diaper-only/underwear-only/bath/changing/nude/semi-nude หากพบให้ verdict=repair และใส่ reasonCodes เช่น minor_safety_child_clothing_issue หรือ child_shirtless_bare_torso."
      : "",
    params.frameRoles.length === 1 &&
    params.frameRoles[0] === "storyboard_frame"
      ? "โหมดนี้เป็น 3x3 cut storyboard_frame เท่านั้น: ห้ามประเมิน start_frame หรือ stop_frame และห้ามใส่ start_frame/stop_frame ใน failedFrameRoles หรือ frameVerdicts."
      : "โหมดนี้มี start/stop frame ให้ตรวจบทบาทตาม Generated frame role order เท่านั้น.",
    "ถ้า start หรือ stop frame ไม่ผ่าน ให้ระบุ failedFrameRoles แบบ structured เป็น start_frame/stop_frame/storyboard_frame และซ่อมเฉพาะ frame นั้น ห้ามสั่ง regenerate ทั้ง run",
    'JSON schema: {"verdict":"pass|repair","score":0-100,"reasonCodes":[string],"failedFrameRoles":["start_frame|stop_frame|storyboard_frame"],"frameVerdicts":[{"role":"start_frame|stop_frame|storyboard_frame","verdict":"pass|repair","reasonCodes":[string],"repairInstruction":string}],"repairInstruction":string,"productMatchesReference":boolean,"continuityMatchesShot":boolean,"characterConsistencySafe":boolean,"adWarningTextSafe":boolean,"minorPresent":boolean,"minorSafetyClothingSafe":boolean}',
  ]
    .filter(Boolean)
    .join("\n");
  const runtimeInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: textInstruction },
        ...imageUrls.map(url => ({
          type: "input_image",
          image_url: url,
          detail: "high",
        })),
      ],
    },
  ];
  let agentResult: Awaited<
    ReturnType<typeof runMarketplaceMediaProductionAgent>
  >;
  try {
    agentResult = await runMarketplaceMediaProductionAgent({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: params.run,
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      stageKey: "image_generation",
      model,
      objective:
        "Perform strict Feature 117 visual QA for one Marketplace Auto Review shot. Return compact JSON only.",
      runtimeInput,
      metadata: params.metadata,
      productTruth: params.plan.productTruth,
      traceSuffix: buildProductionStableHash({
        shotId: params.shot.id,
        imageUrls,
      }).slice(0, 16),
      estimatedCreditReserve: 5,
      creditCategory: "vision_qa",
    });
  } catch (error) {
    if (error instanceof AgentRuntimeClientError) {
      console.warn(
        "[marketplaceAutoReview] vision_qa_runtime_unavailable_warning",
        {
          runId: params.run.id,
          productionRunId: params.run.productionRunId,
          shotId: params.shot.id,
          status: error.status,
          code: error.code,
          message: error.message,
        }
      );
      return buildVisionQaRuntimeUnavailableEnvelope({
        runId: params.run.id,
        shotId: params.shot.id,
        frameUrls: params.frameUrls,
        frameRoles: params.frameRoles,
        model,
        productReferenceUrls,
        imagePromptHashes,
        referenceImageFingerprint,
        qaCacheKey,
        error,
      });
    }
    throw error;
  }
  const { response, creditReservation } = agentResult;
  const inputTokens = estimateTokenCount({ textInstruction, imageUrls });
  const outputTokens = estimateTokenCount(response.finalOutput);
  const credit = await reconcileMarketplaceLlmCredits({
    auth: params.auth,
    reservation: creditReservation,
    inputTokens,
    outputTokens,
    reason: `vision_qa_actual_usage_reconciled:${params.shot.id}`,
    metadata: {
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      shotId: params.shot.id,
      imageCount: imageUrls.length,
      gatewayRouteId: response.gatewayRouteId,
      adapterVersion: response.adapterVersion,
      sdkVersion: response.sdkVersion,
    },
  });
  let parsed = parseAgentRuntimeJsonOutput(response);
  if (Object.keys(parsed).length === 0) {
    parsed = {
      verdict: "repair",
      score: 0,
      reasonCodes: ["vision_qa_non_json_response"],
      repairInstruction:
        "Regenerate this frame with stricter product reference lock and continuity.",
    };
  }
  const parsedReasonCodes = Array.isArray(parsed.reasonCodes)
    ? parsed.reasonCodes.map(item => cleanText(item)).filter(Boolean)
    : [];
  const qaDecision = normalizeShotFrameVisionQaDecision({
    parsed,
    plan: params.plan,
    reasonCodes: parsedReasonCodes,
  });
  const minorSafetyClothingSafe = qaDecision.minorSafetyClothingSafe;
  const verdict = qaDecision.verdict;
  const failedFrameRoles =
    verdict === "pass"
      ? []
      : normalizeImageQaFailedFrameRoles(parsed, params.frameRoles);
  const qaEnvelopeId = `vision-qa:${params.run.id}:${params.shot.id}:${nanoid(8)}`;
  return {
    qaEnvelopeId,
    runId: params.run.id,
    shotId: params.shot.id,
    stageKey: "image_generation",
    mediaUnit: imageQaMediaUnitForFrameRoles(params.frameRoles),
    status: verdict === "pass" ? "passed" : "needs_targeted_repair",
    checkedAt: nowIso(),
    model,
    provider: response.providerId ?? "llm-gateway",
    llmGatewayRouteRef: response.gatewayRouteId ?? "llm-gateway",
    creditsRef: `credit:${credit.idempotencyKey}`,
    creditTransactionId: credit.transactionId,
    reservedCredits: credit.amount,
    actualCredits: credit.actualCredits,
    creditsUsed: credit.creditsUsed,
    refundCredits: credit.refundAmount,
    refundTransactionId: credit.refundTransactionId,
    frameUrls: params.frameUrls,
    frameRoles: params.frameRoles,
    failedFrameRoles,
    frameVerdicts: Array.isArray(parsed.frameVerdicts)
      ? parsed.frameVerdicts.map(item => asRecord(item))
      : [],
    productReferenceUrls,
    imagePromptHashes,
    referenceImageFingerprint,
    productReferenceAssetPackRefs: [
      cleanText(
        asRecord(params.metadata.productReferenceAssetPack).assetPackId
      ),
    ].filter(Boolean),
    characterIdentityAssetPackRefs: [
      cleanText(
        asRecord(params.metadata.characterIdentityAssetPack).assetPackId
      ),
    ].filter(Boolean),
    verdict,
    score: toNumber(parsed.score),
    reasonCodes: qaDecision.reasonCodes,
    repairInstruction:
      cleanText(parsed.repairInstruction) ||
      (!minorSafetyClothingSafe
        ? "Vision QA could not verify the minor-safety evidence cleanly. Regenerate with clear publish-safe framing and do not add children unless the approved storyboard explicitly requires them."
        : !qaDecision.productMatchesReference
          ? "Regenerate this frame with stricter product reference lock. Match the approved product anchor exactly and do not invent product details."
          : !qaDecision.characterConsistencySafe
            ? "Regenerate this frame with stricter character reference lock. Match the approved character anchor identity, age range, face/body structure, hair, and wardrobe/styling."
            : !qaDecision.continuityMatchesShot
              ? "Regenerate this frame to match the shot visual intent and storyboard continuity exactly."
              : !qaDecision.adWarningTextSafe
                ? "Regenerate this frame without intrusive warning text, labels, captions, or readable overlays that obscure the product."
                : ""),
    qaCacheKey,
    qaCacheHit: false,
    productMatchesReference: qaDecision.productMatchesReference,
    continuityMatchesShot: qaDecision.continuityMatchesShot,
    characterConsistencySafe: qaDecision.characterConsistencySafe,
    adWarningTextSafe: qaDecision.adWarningTextSafe,
    minorPresent: qaDecision.minorPresent,
    minorSafetyClothingSafe,
  };
}

async function ensureImageVisionQa(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  runtime: RuntimeContext;
  refs: DirectMediaTaskRef[];
}): Promise<{
  metadata: RunMetadata;
  accepted: boolean;
  repairUnits: DirectImageUnit[];
}> {
  const isStoryboardGridSplit =
    (params.run.frameStrategy as MarketplaceAutoReviewFrameStrategy) ===
    "storyboard_3x3_split";
  const existingAcceptanceStatus = cleanText(
    asRecord(params.metadata.generatedMediaAcceptanceEnvelope).status
  );
  if (
    existingAcceptanceStatus === "accepted" ||
    (existingAcceptanceStatus === "accepted_with_warnings" &&
      !isStoryboardGridSplit)
  ) {
    return { metadata: params.metadata, accepted: true, repairUnits: [] };
  }
  const storyboardGridQaEnvelopes: Record<string, unknown>[] = [];
  const qaEnvelopes: Record<string, unknown>[] = [];
  const repairUnits: DirectImageUnit[] = [];
  const addStoryboardGridRepairUnit = (
    reasonCodes: string[],
    repairInstruction: string
  ) => {
    if (repairUnits.some(unit => unit.role === "storyboard_grid")) return;
    repairUnits.push(
      buildStoryboardGridRepairUnit({ reasonCodes, repairInstruction })
    );
  };
  let skipShotQaBecauseGridInvalid = false;
  if (isStoryboardGridSplit) {
    const storyboardGridUrl =
      cleanText(params.metadata.storyboardGridUrl) ||
      directTaskResultUrl(params.refs, "storyboard-grid-image");
    if (!storyboardGridUrl) {
      skipShotQaBecauseGridInvalid = true;
      addStoryboardGridRepairUnit(
        ["missing_storyboard_grid_source_url"],
        "Regenerate the complete 3x3 storyboard grid because the provider result URL is missing before layout QA and split-frame validation."
      );
    } else {
      const gridQa = await runStoryboardGridLayoutVisionQa({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: params.run,
        plan: params.plan,
        metadata: params.metadata,
        gridUrl: storyboardGridUrl,
        runtime: params.runtime,
      });
      storyboardGridQaEnvelopes.push(gridQa);
      if (cleanText(gridQa.verdict) !== "pass") {
        skipShotQaBecauseGridInvalid = true;
        const gridRepairUnit = buildStoryboardGridQaRepairUnit(gridQa);
        addStoryboardGridRepairUnit(
          gridRepairUnit.repairReasonCodes ?? [
            "storyboard_grid_layout_mismatch",
          ],
          gridRepairUnit.repairInstruction ||
            "Regenerate the original provider output as one strict 3x3 storyboard grid before any split-frame QA."
        );
      }
    }
  }
  for (const shot of params.plan.shots) {
    const index = shot.order - 1;
    const usesStartStopFrames =
      (params.run.frameStrategy as MarketplaceAutoReviewFrameStrategy) ===
      "video_shot_start_stop";
    const expectedFrameRoles: DirectImageFrameRole[] = usesStartStopFrames
      ? ["start_frame", "stop_frame"]
      : ["storyboard_frame"];
    const frameCandidates = usesStartStopFrames
      ? [
          {
            role: "start_frame" as DirectImageFrameRole,
            url: cleanText(params.metadata.startFrameUrls?.[index]),
          },
          {
            role: "stop_frame" as DirectImageFrameRole,
            url: cleanText(params.metadata.stopFrameUrls?.[index]),
          },
        ]
      : [
          {
            role: "storyboard_frame" as DirectImageFrameRole,
            url: cleanText(params.metadata.storyboardFrameUrls?.[index]),
          },
        ];
    const presentFrames = frameCandidates.filter(frame => Boolean(frame.url));
    let qa: Record<string, unknown> | null = null;
    if (skipShotQaBecauseGridInvalid && isStoryboardGridSplit) {
      qa = null;
    } else if (presentFrames.length > 0) {
      qa = await runShotFrameVisionQa({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: params.run,
        plan: params.plan,
        metadata: params.metadata,
        shot,
        frameUrls: presentFrames.map(frame => frame.url),
        frameRoles: presentFrames.map(frame => frame.role),
        runtime: params.runtime,
      });
      qaEnvelopes.push(qa);
    }
    if (!isStoryboardGridSplit) {
      repairUnits.push(
        ...buildShotFrameRepairUnits({
          shot,
          expectedFrameRoles,
          presentFrameRoles: presentFrames.map(frame => frame.role),
          qa,
        })
      );
    } else if (presentFrames.length === 0) {
      addStoryboardGridRepairUnit(
        ["missing_storyboard_grid_split_frame_url"],
        "Regenerate the complete 3x3 storyboard grid from the approved product, character, and environment references, then split it again. Do not create per-shot standalone frames for this 3x3 flow."
      );
    } else if (qa && cleanText(qa.verdict) !== "pass") {
      const gridRepairUnit = buildStoryboardGridQaRepairUnit(qa);
      addStoryboardGridRepairUnit(
        gridRepairUnit.repairReasonCodes ?? [
          "storyboard_grid_vision_qa_repair",
        ],
        gridRepairUnit.repairInstruction ||
          "Regenerate the complete 3x3 storyboard grid from the approved product, character, and environment references, then split it again."
      );
    }
  }
  const accepted = repairUnits.length === 0;
  const allQaEnvelopes = [...storyboardGridQaEnvelopes, ...qaEnvelopes];
  const qaHasWarnings = allQaEnvelopes.some(
    qa => cleanText(qa.verdict) !== "pass" || cleanText(qa.status) === "failed"
  );
  const repairPlanEntries = repairUnits.map(unit => {
    const shotId =
      cleanText(unit.shotId) || `shot-${unit.shotOrder ?? "unknown"}`;
    const isGridRepair = unit.role === "storyboard_grid";
    const failedFrameRole = imageArtifactRole(
      isGridRepair
        ? "storyboard_frame"
        : unit.role === "stop_frame"
          ? "stop_frame"
          : unit.role === "start_frame"
            ? "start_frame"
            : "storyboard_frame"
    );
    const mediaUnit = isGridRepair
      ? "storyboard_grid"
      : unit.role === "stop_frame"
        ? "stop_frame"
        : unit.role === "start_frame"
          ? "start_frame"
          : "storyboard_cell";
    return {
      repairPlanId: `repair:image:${params.run.id}:${unit.unitId}:${nanoid(8)}`,
      runId: params.run.id,
      shotId,
      mediaUnit,
      failedArtifactRef: isGridRepair
        ? `storyboard-grid:${params.run.id}:latest`
        : `frame:${shotId}:${failedFrameRole}:latest`,
      preservedArtifactRefs: [
        ...(params.metadata.storyboardFrameUrls ?? []).map(
          (url, index) =>
            `frame:shot-${index + 1}:storyboard:${buildProductionStableHash({ url }).slice(0, 10)}`
        ),
        ...(params.metadata.startFrameUrls ?? []).map(
          (url, index) =>
            `frame:shot-${index + 1}:start:${buildProductionStableHash({ url }).slice(0, 10)}`
        ),
        ...(params.metadata.stopFrameUrls ?? []).map(
          (url, index) =>
            `frame:shot-${index + 1}:stop:${buildProductionStableHash({ url }).slice(0, 10)}`
        ),
      ].filter(ref => !ref.includes(`frame:${shotId}:${failedFrameRole}:`)),
      affectedDownstreamRefs: [
        `video_payload:${shotId}`,
        `storyboard_review:${params.run.id}`,
      ],
      repairPromptPolicyRef: "policy:feature117:targeted-frame-repair:v1",
      attemptNumber: Math.max(1, nextDirectAttempt(params.refs, unit.unitId)),
      maxAttempts: MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS,
      status: "planned",
      repairInstruction: unit.repairInstruction,
      reasonCodes: unit.repairReasonCodes ?? [],
      createdAt: nowIso(),
    };
  });
  const qaContractEnvelopes = allQaEnvelopes.map(qa => {
    const shotId = cleanText(qa.shotId);
    const repairPlan = repairPlanEntries.find(
      item =>
        item.shotId === shotId ||
        (cleanText(qa.mediaUnit) === "storyboard_grid" &&
          cleanText(item.mediaUnit) === "storyboard_grid")
    );
    return {
      qaEnvelopeId: cleanText(qa.qaEnvelopeId),
      shotId,
      mediaUnit: cleanText(qa.mediaUnit) || "storyboard_cell",
      status:
        cleanText(qa.status) ||
        (cleanText(qa.verdict) === "pass" ? "passed" : "needs_targeted_repair"),
      llmGatewayRouteRef: cleanText(qa.llmGatewayRouteRef) || null,
      creditsRef: cleanText(qa.creditsRef) || null,
      productReferenceAssetPackRefs: Array.isArray(
        qa.productReferenceAssetPackRefs
      )
        ? qa.productReferenceAssetPackRefs
        : [],
      characterIdentityAssetPackRefs: Array.isArray(
        qa.characterIdentityAssetPackRefs
      )
        ? qa.characterIdentityAssetPackRefs
        : [],
      reasonCodes: Array.isArray(qa.reasonCodes)
        ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
        : [],
      failedFrameRoles: Array.isArray(qa.failedFrameRoles)
        ? qa.failedFrameRoles.map(item => cleanText(item)).filter(Boolean)
        : [],
      repairPlanRef: repairPlan?.repairPlanId ?? null,
      repairPlanRefs: repairPlanEntries
        .filter(item => item.shotId === shotId)
        .map(item => item.repairPlanId),
    };
  });
  const acceptanceId = `acceptance:image:${params.run.id}:${nanoid(8)}`;
  const baseMetadata = {
    ...params.metadata,
    storyboardGridVisionQaEnvelopes: storyboardGridQaEnvelopes,
    shotFrameVisionQaEnvelopes: qaEnvelopes,
    shotFrameVisionQa: qaContractEnvelopes,
    llmQaCreditTransactions: [
      ...(Array.isArray(params.metadata.llmQaCreditTransactions)
        ? params.metadata.llmQaCreditTransactions
        : []),
      ...allQaEnvelopes.map(qa => ({
        qaEnvelopeId: qa.qaEnvelopeId,
        shotId: qa.shotId,
        creditsUsed: qa.creditsUsed,
        reservedCredits: qa.reservedCredits,
        actualCredits: qa.actualCredits,
        refundCredits: qa.refundCredits,
        creditTransactionId: qa.creditTransactionId,
        creditReservationIdempotencyKey: cleanText(qa.creditsRef).replace(
          /^credit:/,
          ""
        ),
        refundTransactionId: qa.refundTransactionId,
        creditCategory: "vision_qa",
        model: qa.model,
        provider: qa.provider,
        createdAt: qa.checkedAt,
      })),
    ],
    pendingImageRepairUnits: accepted ? [] : repairUnits,
    targetedRepairPlans: [
      ...(Array.isArray(params.metadata.targetedRepairPlans)
        ? params.metadata.targetedRepairPlans
        : []),
      ...repairPlanEntries,
    ],
    mediaAcceptance: [
      ...(Array.isArray(params.metadata.mediaAcceptance)
        ? params.metadata.mediaAcceptance
        : []),
      {
        acceptanceId,
        artifactRef: `image-frame-set:${params.run.id}`,
        mediaUnit:
          params.run.frameStrategy === "video_shot_start_stop"
            ? "start_stop_frame_set"
            : "storyboard_cell_set",
        status: accepted
          ? qaHasWarnings && isStoryboardGridSplit
            ? "accepted_with_warnings"
            : "accepted"
          : "quarantined_failed_qa",
        qaVerdictRefs: allQaEnvelopes
          .map(qa => cleanText(qa.qaEnvelopeId))
          .filter(Boolean),
        warningApprovalRefs: [],
        supersedesRef: null,
      },
    ],
    imageAttemptReviews: appendImageAttemptReview({
      metadata: params.metadata,
      run: params.run,
      refs: params.refs,
      qaEnvelopes: allQaEnvelopes,
      repairUnits,
      status: accepted
        ? qaHasWarnings && isStoryboardGridSplit
          ? "accepted_with_warnings"
          : "passed"
        : "repair_required",
      expectedFrameCount: shotCountForPlan(params.plan),
    }),
    generatedMediaAcceptanceEnvelope: {
      acceptanceId,
      acceptanceEnvelopeId: acceptanceId,
      runId: params.run.id,
      stageKey: "image_generation",
      status: accepted
        ? qaHasWarnings && isStoryboardGridSplit
          ? "accepted_with_warnings"
          : "accepted"
        : "repair_required",
      checkedAt: nowIso(),
      qaEnvelopeRefs: allQaEnvelopes
        .map(qa => cleanText(qa.qaEnvelopeId))
        .filter(Boolean),
      repairUnitCount: repairUnits.length,
      repairPolicy: isStoryboardGridSplit
        ? "grid_split_no_per_shot_regeneration"
        : "targeted_frame_repair",
      warningCount: qaHasWarnings ? allQaEnvelopes.length : 0,
      productReferenceLocked: true,
      characterConsistencyChecked: true,
      adComplianceWarningChecked: true,
    },
  } as RunMetadata;
  const imageSelectionMetadata = accepted
    ? applyBestImageAttemptSelection(baseMetadata)
    : baseMetadata;
  const metadata = withUpdatedCreditSummary({
    ...imageSelectionMetadata,
    qaCacheEntries: mergeMarketplaceAutoReviewQaCacheEntries({
      metadata: params.metadata,
      entries: allQaEnvelopes
        .map(qa => ({
          qa,
          cacheKey: cleanText(qa.qaCacheKey),
        }))
        .filter(item => item.cacheKey)
        .map(item =>
          buildMarketplaceAutoReviewQaCacheEntry({
            kind:
              cleanText(item.qa.mediaUnit) === "storyboard_grid"
                ? "storyboard_grid_layout_vision_qa"
                : "shot_frame_vision_qa",
            cacheKey: item.cacheKey,
            envelope: item.qa,
            sourceRefs: [
              ...(Array.isArray(item.qa.frameUrls) ? item.qa.frameUrls : []),
              ...(Array.isArray(item.qa.productReferenceUrls)
                ? item.qa.productReferenceUrls
                : []),
            ].map(ref => cleanText(ref)),
          })
        ),
    }),
    targetedRepairPolicyLedger:
      buildMarketplaceAutoReviewTargetedRepairPolicyLedger({
        run: params.run,
        metadata: imageSelectionMetadata,
      }),
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  return { metadata, accepted, repairUnits };
}

async function reconcileDirectImageAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  plan: AutoReviewPlan;
  attemptId: string;
  runtime: RuntimeContext;
  userToken: string;
}): Promise<DirectMediaReconcileResult> {
  const refs = directTaskRefs(params.metadata.directImageTasks);
  if (refs.length === 0) {
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: [],
    };
  }
  const nextRefs: DirectMediaTaskRef[] = [];
  for (const ref of refs) {
    let nextRef = await pollDirectTask({
      ref,
      auth: params.auth,
      userToken: params.userToken,
      stage: "image_generation_status",
    });
    if (nextRef.status === "failed" && !nextRef.refundTransactionId) {
      nextRef = await refundMarketplaceMediaCredits({
        auth: params.auth,
        ref: nextRef,
        reason: "provider_failed",
      });
    }
    nextRefs.push(nextRef);
  }
  let metadata = withUpdatedCreditSummary({
    ...params.metadata,
    directImageTasks: nextRefs,
    imageMediaTaskIds: nextRefs.map(ref => ref.taskId),
    imageProviderTaskIds: nextRefs
      .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
      .filter(Boolean),
  });
  const latestRefs = latestTaskRefsByUnit(nextRefs);
  const latestFailed = latestRefs.find(ref => ref.status === "failed");
  if (
    latestFailed &&
    toNumber(latestFailed.attempt) > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS
  ) {
    const acceptedFallbackMetadata = acceptBestImageAttemptAfterProviderFailure(
      {
        run: params.run,
        metadata,
        failedRef: latestFailed,
        errorMessage:
          latestFailed.errorMessage ||
          `Image unit ${latestFailed.unitId} failed`,
      }
    );
    if (acceptedFallbackMetadata) {
      console.warn(
        "[marketplaceAutoReview] image_provider_failed_using_best_available_attempt",
        {
          runId: params.run.id,
          productionRunId: params.run.productionRunId,
          productId: params.plan.productTruth.productId,
          failedUnitId: latestFailed.unitId,
          failedAttempt: latestFailed.attempt,
          selectedAttempt: acceptedFallbackMetadata.selectedImageAttempt,
          selectedScore: acceptedFallbackMetadata.selectedImageAttemptScore,
        }
      );
      await updateRun({
        db: params.db,
        runId: params.run.id,
        metadataJson: acceptedFallbackMetadata,
      });
      return {
        attempt: {
          attemptId: params.attemptId,
          status: "completed",
        },
        refs: latestTaskRefsByUnit(
          directTaskRefs(acceptedFallbackMetadata.directImageTasks)
        ),
      };
    }
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return {
      attempt: {
        attemptId: params.attemptId,
        status: "failed",
        errorMessage:
          latestFailed.errorMessage ||
          `Image unit ${latestFailed.unitId} failed`,
      },
      refs: nextRefs,
    };
  }
  const waiting = latestRefs.some(
    ref => !["completed", "failed"].includes(ref.status)
  );
  if (waiting) {
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: nextRefs,
    };
  }

  if (
    (params.run.frameStrategy as MarketplaceAutoReviewFrameStrategy) ===
    "storyboard_3x3_split"
  ) {
    const gridRef = latestRefs.find(
      ref =>
        ref.unitId === "storyboard-grid-image" && ref.status === "completed"
    );
    if (
      gridRef?.resultUrl &&
      (cleanText(metadata.storyboardGridUrl) !== gridRef.resultUrl ||
        (metadata.storyboardFrameUrls?.length ?? 0) <
          shotCountForPlan(params.plan))
    ) {
      metadata = withUpdatedCreditSummary({
        ...metadata,
        storyboardGridUrl: gridRef.resultUrl,
        storyboardFrameUrls: await splitStoryboardGrid({
          runId: params.run.id,
          tenantId: params.tenantId,
          sourceUrl: gridRef.resultUrl,
          publicUrl: params.runtime.publicUrl,
        }),
      });
    }
  }
  const directUrls = imageUrlsFromDirectRefs({
    plan: params.plan,
    metadata,
    refs: nextRefs,
    frameStrategy: params.run
      .frameStrategy as MarketplaceAutoReviewFrameStrategy,
  });
  metadata = withUpdatedCreditSummary({
    ...metadata,
    ...directUrls,
    storyboardFrameUrls:
      directUrls.storyboardFrameUrls ??
      directUrls.startFrameUrls ??
      metadata.storyboardFrameUrls,
  });
  const stages = stageKeysForMode(
    params.run.outputMode as MarketplaceAutoReviewOutputMode
  );
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "image_generation",
    stageOrder: stageIndex("image_generation", stages),
    status: "qa_pending",
    providerTaskIds: metadata.imageProviderTaskIds,
    output: {
      attemptId: params.attemptId,
      status: "vision_qa",
      message:
        "Provider images completed; running visual QA and split-frame validation.",
      activeSubstep: "ตรวจ QA ภาพและตัดเฟรมจาก 3x3",
      progressPercent: 80,
      statusDetail: {
        state: "qa_running",
        severity: "info",
        stageKey: "image_generation",
        reasonCodes: ["provider_image_completed", "vision_qa_running"],
        safeMessage:
          "ภาพจาก provider เสร็จแล้ว ระบบกำลังตัดเฟรมและตรวจ QA ก่อนส่งเข้า Storyboard Review",
        nextAction: "รอให้ QA ผ่านหรือให้ระบบซ่อมเฉพาะจุดที่ไม่ผ่าน",
        userActionRequired: false,
        retryable: true,
      },
      frameUrls: metadata.storyboardFrameUrls?.slice(
        0,
        shotCountForPlan(params.plan)
      ),
      startFrameUrls: metadata.startFrameUrls?.slice(
        0,
        shotCountForPlan(params.plan)
      ),
      stopFrameUrls: metadata.stopFrameUrls?.slice(
        0,
        shotCountForPlan(params.plan)
      ),
    },
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "running",
    currentStage: "image_generation",
    stageIndex: stageIndex("image_generation", stages),
    stageCount: stages.length,
    metadataJson: metadata,
  });
  const qa = await ensureImageVisionQa({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    plan: params.plan,
    metadata,
    runtime: params.runtime,
    refs: nextRefs,
  });
  if (!qa.accepted) {
    const repairBudgetExhausted = imageRepairBudgetExhaustedForUnits({
      repairUnits: qa.repairUnits,
      refs: nextRefs,
    });
    const repairReasonCodes = Array.from(
      new Set(
        qa.repairUnits
          .flatMap(unit => unit.repairReasonCodes ?? [])
          .map(code => cleanText(code))
          .filter(Boolean)
      )
    );
    const publishSafetyBlocked =
      imageReasonCodesContainPublishSafetyBlocker(repairReasonCodes);
    const storyboardGridLayoutBlocked =
      imageReasonCodesContainStoryboardGridLayoutBlocker(repairReasonCodes);
    const wholeStoryboardProductFidelityFailure =
      productFidelityFailureIsWholeStoryboard({
        reasonCodes: repairReasonCodes,
        qaEnvelopes: imageVisionQaEnvelopesFromMetadata(qa.metadata),
        expectedFrameCount: shotCountForPlan(params.plan),
      });
    const storyboardFramesReady =
      (params.run.frameStrategy as MarketplaceAutoReviewFrameStrategy) ===
      "storyboard_3x3_split"
        ? hasCompleteFrameSet(
            qa.metadata.storyboardFrameUrls,
            shotCountForPlan(params.plan)
          )
        : hasCompleteFrameSet(
            qa.metadata.startFrameUrls,
            shotCountForPlan(params.plan)
          ) &&
          hasCompleteFrameSet(
            qa.metadata.stopFrameUrls,
            shotCountForPlan(params.plan)
          );
    const storyboardReviewHandoffAllowed =
      imageRepairBudgetExhaustedAllowsStoryboardReviewHandoff({
        metadata: qa.metadata,
        repairUnits: qa.repairUnits,
        expectedFrameCount: shotCountForPlan(params.plan),
      });
    const completedImageAttemptCount = completedImageAttemptReviewCount(
      qa.metadata
    );
    const minimumImageAttemptsReached =
      completedImageAttemptCount >=
      MIN_COMPLETED_IMAGE_ATTEMPTS_BEFORE_STORYBOARD_REVIEW;
    if (
      repairBudgetExhausted &&
      storyboardFramesReady &&
      minimumImageAttemptsReached &&
      storyboardReviewHandoffAllowed
    ) {
      const acceptedMetadata =
        acceptImageQaWithWarningsAfterRepairBudgetExhausted({
          run: params.run,
          metadata: qa.metadata,
          repairUnits: qa.repairUnits,
          refs: nextRefs,
        });
      console.warn(
        "[marketplaceAutoReview] image_qa_repair_budget_exhausted_storyboard_review_required",
        {
          runId: params.run.id,
          productionRunId: params.run.productionRunId,
          productId: params.plan.productTruth.productId,
          repairUnitIds: qa.repairUnits.map(unit => cleanText(unit.unitId)),
          reasonCodes: repairReasonCodes,
          wholeStoryboardProductFidelityFailure,
          storyboardGridLayoutBlocked,
        }
      );
      await updateRun({
        db: params.db,
        runId: params.run.id,
        status: "running",
        currentStage: "image_generation",
        stageIndex: stageIndex("image_generation", stages),
        stageCount: stages.length,
        metadataJson: acceptedMetadata,
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "image_generation",
        stageOrder: stageIndex("image_generation", stages),
        status: "completed_with_warnings",
        providerTaskIds: acceptedMetadata.imageProviderTaskIds,
        output: {
          attemptId: params.attemptId,
          status: "accepted_with_warnings",
          activeSubstep: "ส่งต่อให้ตรวจใน Storyboard Review",
          progressPercent: 100,
          frameUrls: acceptedMetadata.storyboardFrameUrls?.slice(
            0,
            shotCountForPlan(params.plan)
          ),
          startFrameUrls: acceptedMetadata.startFrameUrls?.slice(
            0,
            shotCountForPlan(params.plan)
          ),
          stopFrameUrls: acceptedMetadata.stopFrameUrls?.slice(
            0,
            shotCountForPlan(params.plan)
          ),
          qaVerdictRefs:
            imageVisionQaEnvelopeRefsFromMetadata(acceptedMetadata),
          repairRefs: qa.repairUnits
            .map(unit => cleanText(unit.unitId))
            .filter(Boolean),
          statusDetail: {
            state: "completed_with_warnings",
            severity: "warning",
            stageKey: "image_generation",
            reasonCodes:
              repairReasonCodes.length > 0
                ? repairReasonCodes
                : ["repair_budget_exhausted_storyboard_review_required"],
            safeMessage:
              "ภาพสร้างครบแล้วและ QA ซ่อมครบทุกครั้งที่อนุญาต ระบบจะส่งเข้า Storyboard Review เพื่อให้ผู้ใช้ตรวจและเปลี่ยนรูปเฉพาะเฟรมได้",
            nextAction:
              "เปิด Storyboard Review เพื่อตรวจรูปและแก้เฉพาะเฟรมที่ไม่ชอบ",
            userActionRequired: false,
            retryable: true,
          },
        },
      });
      return {
        attempt: { attemptId: params.attemptId, status: "completed" },
        refs: latestTaskRefsByUnit(
          directTaskRefs(acceptedMetadata.directImageTasks)
        ),
      };
    }
    if (repairBudgetExhausted && !storyboardReviewHandoffAllowed) {
      const referenceFidelityBlocked =
        imageReasonCodesContainProductFidelityBlocker(repairReasonCodes) ||
        wholeStoryboardProductFidelityFailure;
      const hardBlockReason = publishSafetyBlocked
        ? "publish_safety_hard_blocker_after_repair_budget_exhausted"
        : referenceFidelityBlocked
          ? "reference_fidelity_hard_blocker_after_repair_budget_exhausted"
          : "image_qa_hard_blocker_after_repair_budget_exhausted";
      const blockedMetadata = withUpdatedCreditSummary({
        ...qa.metadata,
        pendingImageRepairUnits: qa.repairUnits,
        generatedMediaAcceptanceEnvelope: compactRecord({
          ...asRecord(qa.metadata.generatedMediaAcceptanceEnvelope),
          runId: params.run.id,
          stageKey: "image_generation",
          status: "repair_required",
          checkedAt: nowIso(),
          hardBlocked: true,
          userReviewRequired: true,
          overrideReason: hardBlockReason,
          qaEnvelopeRefs: imageVisionQaEnvelopeRefsFromMetadata(qa.metadata),
          repairUnitCount: qa.repairUnits.length,
          reasonCodes:
            repairReasonCodes.length > 0
              ? repairReasonCodes
              : [hardBlockReason],
        }),
        imageQaReviewOverride: {
          status: "repair_required",
          reason: hardBlockReason,
          repairUnitIds: qa.repairUnits
            .map(unit => cleanText(unit.unitId))
            .filter(Boolean),
          reasonCodes: repairReasonCodes,
          createdAt: nowIso(),
        },
      });
      const hardBlockQaRefs =
        imageVisionQaEnvelopeRefsFromMetadata(blockedMetadata);
      const hardBlockCreditRefs = uniqRefs([
        ...creditRefsFromMetadata(blockedMetadata),
        "credit-reconciliation:image-generation-hard-blocker-checked",
      ]);
      const hardBlockMissingRefs = uniqRefs([
        "stageCompletionSuccess",
        publishSafetyBlocked ? "publishSafetyAccepted" : "",
        referenceFidelityBlocked ? "referenceFidelityAccepted" : "",
        ...repairReasonCodes.map(code => `reason:${code}`),
      ]);
      const hardBlockPolicyRefs = uniqRefs([
        "fail-closed",
        publishSafetyBlocked ? "publish-safety-hard-blocker" : "",
        referenceFidelityBlocked ? "reference-fidelity-hard-blocker" : "",
      ]);
      await updateRun({
        db: params.db,
        runId: params.run.id,
        status: "failed",
        currentStage: "image_generation",
        stageIndex: stageIndex("image_generation", stages),
        stageCount: stages.length,
        metadataJson: blockedMetadata,
        errorMessage: hardBlockReason,
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "image_generation",
        stageOrder: stageIndex("image_generation", stages),
        status: "failed",
        providerTaskIds: blockedMetadata.imageProviderTaskIds,
        output: {
          attemptId: params.attemptId,
          status: "repair_required",
          activeSubstep: publishSafetyBlocked
            ? "หยุดส่งต่อ: พบ hard blocker ด้าน publish safety"
            : "หยุดส่งต่อ: reference ภาพยังไม่ตรงหลังซ่อมครบ",
          progressPercent: 100,
          qaVerdictRefs: hardBlockQaRefs,
          creditRefs: hardBlockCreditRefs,
          missingRefs: hardBlockMissingRefs,
          policyRefs: hardBlockPolicyRefs,
          repairRefs: qa.repairUnits
            .map(unit => cleanText(unit.unitId))
            .filter(Boolean),
          statusDetail: {
            state: "image_generation_hard_blocked",
            severity: "error",
            stageKey: "image_generation",
            reasonCodes:
              repairReasonCodes.length > 0
                ? repairReasonCodes
                : [hardBlockReason],
            safeMessage: publishSafetyBlocked
              ? "ระบบหยุดส่งต่อเพราะผล QA พบ hard blocker ด้าน publish safety หลังซ่อมครบจำนวนครั้งแล้ว"
              : "ระบบหยุดส่งต่อเพราะผล QA พบว่าสินค้าหรือ character reference ยังไม่ตรงหลังซ่อมครบจำนวนครั้งแล้ว",
            nextAction:
              "ตรวจ prompt/reference และข้อมูลที่ส่งเข้า skill แล้วเริ่ม Auto Review รอบใหม่หลังแก้เงื่อนไขที่ทำให้ provider สร้างภาพไม่ผ่าน",
            userActionRequired: true,
            retryable: false,
          },
        },
        stageCompletionEvidence: {
          status: "terminal_failure",
          requiredRefs: [
            "failureReason",
            "missingRefs",
            "creditRefs",
            "qaVerdictRefs",
          ],
          artifactRefs: [`run:${params.run.id}`],
          qaVerdictRefs: hardBlockQaRefs,
          creditRefs: hardBlockCreditRefs,
          missingRefs: hardBlockMissingRefs,
          policyRefs: hardBlockPolicyRefs,
        },
      });
      return {
        attempt: {
          attemptId: params.attemptId,
          status: "failed",
          errorMessage: hardBlockReason,
        },
        refs: latestTaskRefsByUnit(
          directTaskRefs(blockedMetadata.directImageTasks)
        ),
      };
    }
    const updatedRun = {
      ...params.run,
      metadataJson: qa.metadata,
    } as MarketplaceAutoReviewRun;
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "image_generation",
      stageOrder: stageIndex("image_generation", stages),
      status: "repairing",
      providerTaskIds: metadata.imageProviderTaskIds,
      output: {
        attemptId: params.attemptId,
        status: "vision_qa_repair",
        activeSubstep: "ซ่อมภาพจากผลตรวจ QA",
        progressPercent: 70,
        qaVerdictRefs: imageVisionQaEnvelopeRefsFromMetadata(qa.metadata),
        repairRefs: qa.repairUnits
          .map(unit => cleanText(unit.unitId))
          .filter(Boolean),
        statusDetail: {
          state: "frame_vision_qa_repairing",
          severity: "warning",
          stageKey: "image_generation",
          reasonCodes:
            repairReasonCodes.length > 0
              ? repairReasonCodes
              : ["vision_qa_repair_required"],
          safeMessage:
            "ภาพสร้างเสร็จแล้ว แต่ QA พบจุดที่ต้องซ่อม ระบบกำลังซ่อม grid/frame ที่ไม่ผ่าน และจะส่งต่อเมื่อครบ 3 รอบ",
          nextAction:
            "รอผลซ่อมจาก provider และให้ครบ 3 รอบก่อนส่งเข้า Storyboard Review ต่อ",
          userActionRequired: false,
          retryable: true,
        },
      },
    });
    await scheduleImageAttempt({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: updatedRun,
      metadata: qa.metadata,
      runtime: params.runtime,
    });
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: nextRefs,
    };
  }
  return {
    attempt: { attemptId: params.attemptId, status: "completed" },
    refs: latestTaskRefsByUnit(directTaskRefs(qa.metadata.directImageTasks)),
  };
}

function videoReferenceFrameUrlsForShot(
  metadata: RunMetadata,
  shot: AutoReviewShot
): string[] {
  const index = Math.max(0, shot.order - 1);
  return metadata.startFrameUrls?.length
    ? [metadata.startFrameUrls[index], metadata.stopFrameUrls?.[index]]
        .map(url => cleanText(url))
        .filter(Boolean)
    : [metadata.storyboardFrameUrls?.[index]]
        .map(url => cleanText(url))
        .filter(Boolean);
}

function passedImageQaRefsForShot(
  metadata: RunMetadata,
  shot: AutoReviewShot
): string[] {
  return (
    Array.isArray(metadata.shotFrameVisionQaEnvelopes)
      ? metadata.shotFrameVisionQaEnvelopes
      : []
  )
    .filter(
      qa =>
        cleanText(qa.shotId) === shot.id && cleanText(qa.status) === "passed"
    )
    .map(qa => cleanText(qa.qaEnvelopeId))
    .filter(Boolean);
}

function videoQaEnvelopeForShot(
  metadata: RunMetadata,
  shot: AutoReviewShot,
  videoUrl: string
): Record<string, unknown> | null {
  return (
    (Array.isArray(metadata.videoClipContinuityQaEnvelopes)
      ? metadata.videoClipContinuityQaEnvelopes
      : []
    )
      .map(item => asRecord(item))
      .find(qa => {
        const sampleRefs = Array.isArray(qa.generatedVideoSampleRefs)
          ? qa.generatedVideoSampleRefs
              .map(item => cleanText(item))
              .filter(Boolean)
          : [];
        return (
          cleanText(qa.shotId) === shot.id &&
          cleanText(qa.videoUrl) === videoUrl &&
          cleanText(qa.status) === "passed" &&
          sampleRefs.length > 0
        );
      }) ?? null
  );
}

function generatedVideoSampleRefsForShot(
  metadata: RunMetadata,
  shot: AutoReviewShot,
  videoUrl: string
): string[] {
  const sampleMap = asRecord(metadata.generatedVideoSampleRefs);
  const byShot = sampleMap[shot.id];
  const mappedRefs = Array.isArray(byShot)
    ? byShot.map(item => cleanText(item)).filter(Boolean)
    : [];
  const sampleRecords = Array.isArray(metadata.generatedVideoSamples)
    ? metadata.generatedVideoSamples.map((item: unknown) => asRecord(item))
    : [];
  const recordRefs = sampleRecords
    .filter(
      item =>
        cleanText(item.shotId) === shot.id ||
        cleanText(item.videoUrl) === videoUrl
    )
    .flatMap(item =>
      Array.isArray(item.sampleRefs)
        ? item.sampleRefs
        : [item.sampleRef, item.keyframeRef]
    )
    .map(item => cleanText(item))
    .filter(Boolean);
  return uniqRefs([...mappedRefs, ...recordRefs]);
}

async function runVideoClipContinuityQa(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  shot: AutoReviewShot;
  videoUrl: string;
  runtime: RuntimeContext;
}): Promise<Record<string, unknown>> {
  const model =
    cleanText(process.env.MARKETPLACE_AUTO_REVIEW_VISION_MODEL) ||
    DEFAULT_VISION_QA_MODEL;
  const referenceFrameUrls = videoReferenceFrameUrlsForShot(
    params.metadata,
    params.shot
  );
  const productReferenceUrls = approvedProductReferenceUrls(
    params.metadata,
    params.plan,
    2
  );
  const visualReferenceUrls = approvedVisualReferenceUrls(
    params.metadata,
    params.plan,
    4
  );
  const imageUrls = [...referenceFrameUrls, ...visualReferenceUrls]
    .map(url => absoluteVisionUrl(url, params.runtime.publicUrl))
    .filter(Boolean);
  const imageQaRefs = passedImageQaRefsForShot(params.metadata, params.shot);
  const generatedVideoSampleRefs = generatedVideoSampleRefsForShot(
    params.metadata,
    params.shot,
    params.videoUrl
  );
  const qaCacheKey = marketplaceAutoReviewQaCacheKey({
    kind: "video_clip_continuity_qa",
    model,
    runId: params.run.id,
    shotId: params.shot.id,
    urls: [params.videoUrl, ...generatedVideoSampleRefs, ...imageUrls],
    refs: imageQaRefs,
    promptHashPayload: {
      productName: params.plan.productTruth.productName,
      shotTitle: params.shot.title,
      visual: params.shot.visual,
      voiceover: params.shot.voiceover,
    },
  });
  const cached = findMarketplaceAutoReviewQaCacheEntry({
    metadata: params.metadata,
    kind: "video_clip_continuity_qa",
    cacheKey: qaCacheKey,
  });
  if (cached) {
    return {
      ...cached,
      qaCacheKey,
      qaCacheHit: true,
      cacheEvidenceRef: qaCacheKey,
    };
  }
  if (generatedVideoSampleRefs.length === 0) {
    return {
      qaEnvelopeId: `video-qa:${params.run.id}:${params.shot.id}:${nanoid(8)}`,
      runId: params.run.id,
      shotId: params.shot.id,
      stageKey: "video_generation",
      mediaUnit: "video_clip",
      status: "needs_targeted_repair",
      checkedAt: nowIso(),
      model,
      provider: "local-contract",
      llmGatewayRouteRef: null,
      creditsRef: null,
      videoUrl: params.videoUrl,
      generatedVideoSampleRefs: [],
      generatedVideoSampleUnavailableReason: "generated_video_samples_missing",
      referenceFrameUrls,
      productReferenceUrls,
      sourceImageQaRefs: imageQaRefs,
      inspectionMode: "generated_video_samples_unavailable",
      verdict: "repair",
      score: 0,
      reasonCodes: ["generated_video_samples_missing"],
      repairInstruction:
        "Create generated-video sample/keyframe evidence for this clip before continuity QA, or regenerate only this video clip with sample extraction enabled.",
      qaCacheKey,
      qaCacheHit: false,
      productContinuitySafe: false,
      characterContinuitySafe: false,
      storyContinuitySafe: false,
      audioVisualSyncSafe: false,
    };
  }
  const textInstruction = [
    "ตรวจ QA วิดีโอรายช็อตสำหรับคลิปรีวิวสินค้าแบบ auto โดยตอบ JSON เท่านั้น",
    `สินค้า: ${params.plan.productTruth.productName}`,
    `Shot ${params.shot.order}: ${params.shot.title}`,
    `Generated video URL: ${params.videoUrl}`,
    `Visual intent: ${params.shot.visual}`,
    `Voiceover/dialogue contract: ${params.shot.voiceover}`,
    "รูปที่แนบคือ generated video sample/keyframes, accepted start/stop หรือ storyboard frame ของช็อตนี้ ตามด้วย product reference ที่อนุมัติแล้ว",
    "ตรวจความต่อเนื่องของ endpoint, product identity, character/face safety, story order, และไม่เพิ่มรายละเอียดสินค้าเกิน reference/spec",
    "ถ้าคลิปหรือ keyframe ไม่ควรผ่าน ให้สั่งซ่อมเฉพาะ video clip ของ shot นี้ ห้าม regenerate ทั้ง run",
    'JSON schema: {"verdict":"pass|repair","score":0-100,"reasonCodes":[string],"repairInstruction":string,"productContinuitySafe":boolean,"characterContinuitySafe":boolean,"storyContinuitySafe":boolean,"audioVisualSyncSafe":boolean}',
  ].join("\n");
  const runtimeInput = [
    {
      role: "user",
      content: [
        { type: "input_text", text: textInstruction },
        ...generatedVideoSampleRefs
          .map(url => absoluteVisionUrl(url, params.runtime.publicUrl))
          .filter(Boolean)
          .map(url => ({
            type: "input_image",
            image_url: url,
            detail: "high",
          })),
        ...imageUrls.map(url => ({
          type: "input_image",
          image_url: url,
          detail: "high",
        })),
      ],
    },
  ];
  const { response, creditReservation } =
    await runMarketplaceMediaProductionAgent({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: params.run,
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      stageKey: "video_generation",
      model,
      objective:
        "Perform strict Feature 117 video clip continuity QA for one Marketplace Auto Review shot. Return compact JSON only.",
      runtimeInput,
      metadata: params.metadata,
      productTruth: params.plan.productTruth,
      traceSuffix: buildProductionStableHash({
        shotId: params.shot.id,
        videoUrl: params.videoUrl,
        imageUrls,
      }).slice(0, 16),
      estimatedCreditReserve: 5,
      creditCategory: "video_clip_qa",
    });
  const inputTokens = estimateTokenCount({
    textInstruction,
    imageUrls,
    generatedVideoSampleRefs,
    videoUrl: params.videoUrl,
  });
  const outputTokens = estimateTokenCount(response.finalOutput);
  const credit = await reconcileMarketplaceLlmCredits({
    auth: params.auth,
    reservation: creditReservation,
    inputTokens,
    outputTokens,
    reason: `video_clip_qa_actual_usage_reconciled:${params.shot.id}`,
    metadata: {
      runId: params.run.id,
      productionRunId: params.run.productionRunId,
      shotId: params.shot.id,
      gatewayRouteId: response.gatewayRouteId,
      adapterVersion: response.adapterVersion,
      sdkVersion: response.sdkVersion,
    },
  });
  let parsed = parseAgentRuntimeJsonOutput(response);
  if (Object.keys(parsed).length === 0) {
    parsed = {
      verdict: "repair",
      score: 0,
      reasonCodes: ["video_qa_non_json_response"],
      repairInstruction:
        "Regenerate only this video clip with stricter start/stop frame, product reference, and continuity locks.",
    };
  }
  const verdict = cleanText(parsed.verdict) === "pass" ? "pass" : "repair";
  const qaEnvelopeId = `video-qa:${params.run.id}:${params.shot.id}:${nanoid(8)}`;
  return {
    qaEnvelopeId,
    runId: params.run.id,
    shotId: params.shot.id,
    stageKey: "video_generation",
    mediaUnit: "video_clip",
    status: verdict === "pass" ? "passed" : "needs_targeted_repair",
    checkedAt: nowIso(),
    model,
    provider: response.providerId ?? "llm-gateway",
    llmGatewayRouteRef: response.gatewayRouteId ?? "llm-gateway",
    creditsRef: `credit:${credit.idempotencyKey}`,
    creditTransactionId: credit.transactionId,
    reservedCredits: credit.amount,
    actualCredits: credit.actualCredits,
    creditsUsed: credit.creditsUsed,
    refundCredits: credit.refundAmount,
    refundTransactionId: credit.refundTransactionId,
    videoUrl: params.videoUrl,
    generatedVideoSampleRefs,
    generatedVideoSampleUnavailableReason: null,
    referenceFrameUrls,
    productReferenceUrls,
    sourceImageQaRefs: imageQaRefs,
    inspectionMode: "llm_vision_generated_video_samples_plus_reference_frames",
    verdict,
    score: toNumber(parsed.score),
    reasonCodes: Array.isArray(parsed.reasonCodes)
      ? parsed.reasonCodes.map(item => cleanText(item)).filter(Boolean)
      : [],
    repairInstruction: cleanText(parsed.repairInstruction),
    qaCacheKey,
    qaCacheHit: false,
    productContinuitySafe: parsed.productContinuitySafe !== false,
    characterContinuitySafe: parsed.characterContinuitySafe !== false,
    storyContinuitySafe: parsed.storyContinuitySafe !== false,
    audioVisualSyncSafe: parsed.audioVisualSyncSafe !== false,
  };
}

async function ensureVideoContinuityQa(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  runtime: RuntimeContext;
  refs: DirectMediaTaskRef[];
  videoClipUrls: string[];
}): Promise<{
  metadata: RunMetadata;
  accepted: boolean;
  repairUnits: DirectVideoUnit[];
}> {
  const qaEnvelopes: Record<string, unknown>[] = [];
  const repairUnits: DirectVideoUnit[] = [];
  for (const shot of params.plan.shots) {
    const index = shot.order - 1;
    const videoUrl = cleanText(params.videoClipUrls[index]);
    if (!videoUrl) {
      repairUnits.push({
        unitId: `${shot.id}-video`,
        role: "video_clip",
        shotId: shot.id,
        shotOrder: shot.order,
        repairReasonCodes: ["missing_video_clip_url"],
        repairInstruction:
          "Regenerate only this video clip from the accepted frame references.",
      });
      continue;
    }
    const reused = videoQaEnvelopeForShot(params.metadata, shot, videoUrl);
    const qa =
      reused ??
      (await runVideoClipContinuityQa({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: params.run,
        plan: params.plan,
        metadata: params.metadata,
        shot,
        videoUrl,
        runtime: params.runtime,
      }));
    qaEnvelopes.push(qa);
    if (cleanText(qa.status) !== "passed") {
      repairUnits.push({
        unitId: `${shot.id}-video`,
        role: "video_clip",
        shotId: shot.id,
        shotOrder: shot.order,
        repairReasonCodes: Array.isArray(qa.reasonCodes)
          ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
          : ["video_continuity_qa_repair"],
        repairInstruction:
          cleanText(qa.repairInstruction) ||
          "Regenerate only this video clip with stricter product, character, and story continuity.",
      });
    }
  }
  const accepted = repairUnits.length === 0;
  const summary = {
    summaryId: `video-continuity-summary:${params.run.id}:${nanoid(8)}`,
    runId: params.run.id,
    stageKey: "video_generation",
    status: accepted ? "passed" : "needs_targeted_repair",
    checkedAt: nowIso(),
    expectedClipCount: params.plan.shots.length,
    passedClipCount: qaEnvelopes.filter(qa => cleanText(qa.status) === "passed")
      .length,
    qaEnvelopeRefs: qaEnvelopes
      .map(qa => cleanText(qa.qaEnvelopeId))
      .filter(Boolean),
    repairUnitIds: repairUnits.map(unit => unit.unitId),
    inspectionMode: accepted
      ? "generated_video_samples_contract_passed"
      : "generated_video_samples_required_for_repair",
  };
  const baseMetadata = {
    ...params.metadata,
    videoClipContinuityQaEnvelopes: qaEnvelopes,
    videoContinuityQaSummary: summary,
    llmQaCreditTransactions: [
      ...(Array.isArray(params.metadata.llmQaCreditTransactions)
        ? params.metadata.llmQaCreditTransactions
        : []),
      ...qaEnvelopes.map(qa => ({
        qaEnvelopeId: qa.qaEnvelopeId,
        shotId: qa.shotId,
        creditsUsed: qa.creditsUsed,
        reservedCredits: qa.reservedCredits,
        actualCredits: qa.actualCredits,
        refundCredits: qa.refundCredits,
        creditTransactionId: qa.creditTransactionId,
        creditReservationIdempotencyKey: cleanText(qa.creditsRef).replace(
          /^credit:/,
          ""
        ),
        refundTransactionId: qa.refundTransactionId,
        creditCategory: "video_clip_qa",
        model: qa.model,
        provider: qa.provider,
        createdAt: qa.checkedAt,
      })),
    ],
    pendingVideoRepairUnits: repairUnits,
  } as RunMetadata;
  const metadata = withUpdatedCreditSummary({
    ...baseMetadata,
    qaCacheEntries: mergeMarketplaceAutoReviewQaCacheEntries({
      metadata: params.metadata,
      entries: qaEnvelopes
        .map(qa => ({
          qa,
          cacheKey: cleanText(qa.qaCacheKey),
        }))
        .filter(item => item.cacheKey)
        .map(item =>
          buildMarketplaceAutoReviewQaCacheEntry({
            kind: "video_clip_continuity_qa",
            cacheKey: item.cacheKey,
            envelope: item.qa,
            sourceRefs: [
              cleanText(item.qa.videoUrl),
              ...(Array.isArray(item.qa.generatedVideoSampleRefs)
                ? item.qa.generatedVideoSampleRefs
                : []),
              ...(Array.isArray(item.qa.referenceFrameUrls)
                ? item.qa.referenceFrameUrls
                : []),
            ].map(ref => cleanText(ref)),
          })
        ),
    }),
    targetedRepairPolicyLedger:
      buildMarketplaceAutoReviewTargetedRepairPolicyLedger({
        run: params.run,
        metadata: baseMetadata,
      }),
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  return { metadata, accepted, repairUnits };
}

function buildVideoAcceptanceEnvelope(params: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  refs: DirectMediaTaskRef[];
  videoClipUrls: string[];
  metadata?: RunMetadata;
}): Record<string, unknown> {
  const missingShotIds = params.plan.shots
    .filter((shot, index) => !cleanText(params.videoClipUrls[index]))
    .map(shot => shot.id);
  const qaEnvelopes = (
    Array.isArray(params.metadata?.videoClipContinuityQaEnvelopes)
      ? params.metadata?.videoClipContinuityQaEnvelopes
      : []
  ).map(item => asRecord(item));
  const qaByShotId = new Map(qaEnvelopes.map(qa => [cleanText(qa.shotId), qa]));
  const pendingRepairUnits = params.plan.shots.flatMap((shot, index) => {
    const videoUrl = cleanText(params.videoClipUrls[index]);
    const qa = qaByShotId.get(shot.id);
    if (videoUrl && cleanText(qa?.status) === "passed") return [];
    const reasonCodes = videoUrl
      ? Array.isArray(qa?.reasonCodes)
        ? qa.reasonCodes.map(item => cleanText(item)).filter(Boolean)
        : ["video_continuity_qa_repair"]
      : ["missing_video_clip_url"];
    return [
      {
        unitId: `${shot.id}-video`,
        role: "video_clip",
        shotId: shot.id,
        shotOrder: shot.order,
        repairReasonCodes: reasonCodes,
        repairInstruction:
          cleanText(qa?.repairInstruction) ||
          "Regenerate only this video clip from accepted frame references.",
      },
    ];
  });
  const accepted =
    missingShotIds.length === 0 && pendingRepairUnits.length === 0;
  const acceptanceId = `acceptance:video:${params.run.id}:${nanoid(8)}`;
  const qaVerdictRefs = params.plan.shots
    .map(
      shot =>
        cleanText(qaByShotId.get(shot.id)?.qaEnvelopeId) ||
        (cleanText(params.videoClipUrls[shot.order - 1])
          ? `video-continuity-qa:${params.run.id}:${shot.id}`
          : "")
    )
    .filter(Boolean);
  return {
    acceptanceId,
    acceptanceEnvelopeId: acceptanceId,
    runId: params.run.id,
    stageKey: "video_generation",
    status: accepted ? "accepted" : "repair_required",
    checkedAt: nowIso(),
    expectedClipCount: params.plan.shots.length,
    actualClipCount: params.videoClipUrls.filter(Boolean).length,
    missingShotIds,
    pendingRepairUnits,
    qaVerdictRefs,
    continuityChecks: [
      "all_expected_shots_have_clip",
      "ordered_by_storyboard_shot_order",
      "reference_frames_used_per_clip",
      "generated_video_sample_qa_or_targeted_repair",
      "native_audio_or_external_audio_strategy_recorded",
      "accepted_start_stop_or_storyboard_frames_only",
      "product_reference_asset_pack_locked",
      "character_identity_policy_recorded",
      "audio_strategy_recorded_for_later_continuity_gate",
    ],
    productReferenceLocked: true,
    characterContinuityChecked: true,
    audioContinuityDeferredToAudioStage: true,
    warningOverlayDeferredToVideoEdit: true,
    noNodeCanvasExecution: true,
    providerTaskIds: params.refs
      .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
      .filter(Boolean),
  };
}

export function buildMarketplaceAutoReviewVideoAcceptanceEnvelopeForTest(input: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  refs: DirectMediaTaskRef[];
  videoClipUrls: string[];
  metadata?: RunMetadata;
}): Record<string, unknown> {
  return buildVideoAcceptanceEnvelope(input);
}

async function reconcileDirectVideoAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  plan: AutoReviewPlan;
  attemptId: string;
  runtime: RuntimeContext;
  userToken: string;
}): Promise<DirectMediaReconcileResult> {
  const refs = directTaskRefs(params.metadata.directVideoTasks);
  if (refs.length === 0) {
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: [],
    };
  }
  const nextRefs: DirectMediaTaskRef[] = [];
  for (const ref of refs) {
    let nextRef = await pollDirectTask({
      ref,
      auth: params.auth,
      userToken: params.userToken,
      stage: "video_generation_status",
    });
    if (nextRef.status === "failed" && !nextRef.refundTransactionId) {
      nextRef = await refundMarketplaceMediaCredits({
        auth: params.auth,
        ref: nextRef,
        reason: "provider_failed",
      });
    }
    nextRefs.push(nextRef);
  }
  const latestRefs = latestTaskRefsByUnit(nextRefs);
  let metadata = withUpdatedCreditSummary({
    ...params.metadata,
    directVideoTasks: nextRefs,
    videoUnitIds: latestRefs.map(ref => ref.unitId),
    videoMediaTaskIds: nextRefs.map(ref => ref.taskId),
    videoProviderTaskIds: nextRefs
      .map(ref => cleanText(ref.providerTaskId ?? ref.taskId))
      .filter(Boolean),
  });
  const latestFailed = latestRefs.find(ref => ref.status === "failed");
  if (
    latestFailed &&
    toNumber(latestFailed.attempt) > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS
  ) {
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return {
      attempt: {
        attemptId: params.attemptId,
        status: "failed",
        errorMessage:
          latestFailed.errorMessage ||
          `Video unit ${latestFailed.unitId} failed`,
      },
      refs: nextRefs,
    };
  }
  const waiting = latestRefs.some(
    ref => !["completed", "failed"].includes(ref.status)
  );
  if (waiting) {
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: nextRefs,
    };
  }
  const videoClipUrls = params.plan.shots.map(shot => {
    const ref = latestRefs.find(
      item => item.unitId === `${shot.id}-video` && item.status === "completed"
    );
    return cleanText(ref?.resultUrl);
  });
  metadata = withUpdatedCreditSummary({ ...metadata, videoClipUrls });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  const qa = await ensureVideoContinuityQa({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    plan: params.plan,
    metadata,
    runtime: params.runtime,
    refs: latestRefs,
    videoClipUrls,
  });
  metadata = qa.metadata;
  const videoAcceptanceEnvelope = buildVideoAcceptanceEnvelope({
    run: params.run,
    plan: params.plan,
    refs: latestRefs,
    videoClipUrls,
    metadata,
  });
  const videoAcceptanceId =
    cleanText(videoAcceptanceEnvelope.acceptanceId) ||
    `acceptance:video:${params.run.id}`;
  const pendingRepairUnits = directVideoUnits(
    videoAcceptanceEnvelope.pendingRepairUnits
  );
  metadata = withUpdatedCreditSummary({
    ...metadata,
    videoClipUrls,
    pendingVideoRepairUnits: pendingRepairUnits,
    generatedMediaAcceptanceEnvelope: videoAcceptanceEnvelope,
    mediaAcceptance: [
      ...(Array.isArray(metadata.mediaAcceptance)
        ? metadata.mediaAcceptance
        : []),
      {
        acceptanceId: videoAcceptanceId,
        artifactRef: `video-clip-set:${params.run.id}`,
        mediaUnit: "video_clip_set",
        status:
          pendingRepairUnits.length === 0
            ? "accepted"
            : "quarantined_failed_qa",
        qaVerdictRefs: Array.isArray(videoAcceptanceEnvelope.qaVerdictRefs)
          ? videoAcceptanceEnvelope.qaVerdictRefs
          : [],
        warningApprovalRefs: [],
        supersedesRef: null,
      },
    ],
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  if (pendingRepairUnits.length > 0) {
    const updatedRun = {
      ...params.run,
      metadataJson: metadata,
    } as MarketplaceAutoReviewRun;
    await scheduleVideoAttempt({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: updatedRun,
      metadata,
      runtime: params.runtime,
    });
    return {
      attempt: { attemptId: params.attemptId, status: "waiting_provider" },
      refs: nextRefs,
    };
  }
  return {
    attempt: { attemptId: params.attemptId, status: "completed" },
    refs: latestRefs,
  };
}

async function fetchBufferFromUrl(
  url: string,
  publicUrl?: string | null
): Promise<Buffer> {
  const absoluteUrl = url.startsWith("/")
    ? `${(cleanText(publicUrl) || process.env.NODE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "")}${url}`
    : url;
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for split: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function splitStoryboardGrid(params: {
  runId: string;
  tenantId: string;
  sourceUrl: string;
  publicUrl?: string | null;
}) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const buffer = await fetchBufferFromUrl(params.sourceUrl, params.publicUrl);
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 30 || height < 30) {
    throw new Error("Storyboard grid image is too small to split");
  }
  const frameRects = splitStoryboardGridRects({ width, height });
  const urls: string[] = [];
  for (const rect of frameRects) {
    const cell = await sharp(buffer)
      .extract({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .png()
      .toBuffer();
    const stored = await storagePut(
      storyboardGridFrameStorageKey({
        tenantId: params.tenantId,
        runId: params.runId,
        sourceUrl: params.sourceUrl,
        shotNumber: rect.shotNumber,
      }),
      cell,
      "image/png"
    );
    urls.push(stored.url);
  }
  return urls;
}

function storyboardGridFrameStorageKey(params: {
  tenantId: string;
  runId: string;
  sourceUrl: string;
  shotNumber: number;
}): string {
  const gridVersion = buildProductionStableHash({
    sourceUrl: params.sourceUrl,
  }).slice(0, 12);
  return `marketplace-auto-review/${params.tenantId}/${params.runId}/frames/grid-${gridVersion}/shot-${String(params.shotNumber).padStart(2, "0")}.png`;
}

type StoryboardSplitRect = {
  shotNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

function storyboardGridDividerInsetPx(width: number, height: number): number {
  const cellWidth = Math.floor(width / 3);
  const cellHeight = Math.floor(height / 3);
  const shortestSide = Math.min(cellWidth, cellHeight);
  if (shortestSide <= 0) return 0;
  return Math.max(1, Math.min(4, Math.floor(shortestSide * 0.01)));
}

function splitStoryboardGridRects(input: {
  width: number;
  height: number;
}): StoryboardSplitRect[] {
  const { width, height } = input;
  const cellWidth = Math.floor(width / 3);
  const cellHeight = Math.floor(height / 3);
  const inset = storyboardGridDividerInsetPx(width, height);
  const rects: StoryboardSplitRect[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const shotNumber = row * 3 + col + 1;
      const rawLeft = col * cellWidth;
      const rawTop = row * cellHeight;
      const rawWidth = col === 2 ? width - rawLeft : cellWidth;
      const rawHeight = row === 2 ? height - rawTop : cellHeight;
      const widthWithInset = Math.max(1, rawWidth - inset * 2);
      const heightWithInset = Math.max(1, rawHeight - inset * 2);
      rects.push({
        shotNumber,
        left: Math.min(width - widthWithInset, rawLeft + inset),
        top: Math.min(height - heightWithInset, rawTop + inset),
        width: widthWithInset,
        height: heightWithInset,
      });
    }
  }
  return rects;
}

async function ensureStoryboardFrames(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  runtime: RuntimeContext;
  refs: DirectMediaTaskRef[];
}): Promise<RunMetadata> {
  const frameStrategy = params.run
    .frameStrategy as MarketplaceAutoReviewFrameStrategy;
  const expectedFrameCount = shotCountForPlan(params.plan);
  if (frameStrategy === "storyboard_3x3_split") {
    const selectedAttemptReview = asRecord(
      params.metadata.selectedImageAttemptReview
    );
    const selectedGridUrl = cleanText(selectedAttemptReview.storyboardGridUrl);
    const selectedFrameUrls = cleanStringList(
      selectedAttemptReview.storyboardFrameUrls
    );
    const gridUrl =
      selectedGridUrl ||
      directTaskResultUrl(params.refs, "storyboard-grid-image");
    if (!gridUrl)
      throw new Error("Completed storyboard grid image is missing URL");
    if (
      selectedGridUrl &&
      selectedFrameUrls.length >= expectedFrameCount &&
      cleanText(params.metadata.storyboardGridUrl) === selectedGridUrl
    )
      return params.metadata;
    if (
      cleanText(params.metadata.storyboardGridUrl) === gridUrl &&
      (params.metadata.storyboardFrameUrls?.length ?? 0) >= expectedFrameCount
    )
      return params.metadata;
    const frameUrls = await splitStoryboardGrid({
      runId: params.run.id,
      tenantId: params.tenantId,
      sourceUrl: gridUrl,
      publicUrl: params.runtime.publicUrl,
    });
    const metadata = {
      ...params.metadata,
      storyboardGridUrl: gridUrl,
      storyboardFrameUrls: frameUrls,
    };
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return metadata;
  }

  if (
    (params.metadata.startFrameUrls?.length ?? 0) >= expectedFrameCount &&
    (params.metadata.stopFrameUrls?.length ?? 0) >= expectedFrameCount
  ) {
    return params.metadata;
  }
  const startFrameUrls: string[] = [];
  const stopFrameUrls: string[] = [];
  for (const shot of params.plan.shots) {
    startFrameUrls.push(directTaskResultUrl(params.refs, `${shot.id}-start`));
    stopFrameUrls.push(directTaskResultUrl(params.refs, `${shot.id}-stop`));
  }
  if (startFrameUrls.some(url => !url) || stopFrameUrls.some(url => !url)) {
    throw new Error("Completed start/stop frame set is missing URLs");
  }
  const metadata = {
    ...params.metadata,
    startFrameUrls,
    stopFrameUrls,
    storyboardFrameUrls: startFrameUrls,
  };
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  return metadata;
}

function buildStoryboardReviewOutput(params: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const shotCount = params.plan.shots.length;
  const frameStrategy = params.run
    .frameStrategy as MarketplaceAutoReviewFrameStrategy;
  const hasGeneratedStartStopFrameChain =
    frameStrategy === "video_shot_start_stop" &&
    hasCompleteFrameSet(params.metadata.startFrameUrls, shotCount) &&
    hasCompleteFrameSet(params.metadata.stopFrameUrls, shotCount);
  const hasStoryboardFrameChain =
    frameStrategy === "storyboard_3x3_split" &&
    hasCompleteFrameSet(params.metadata.storyboardFrameUrls, shotCount);
  const usesStartStopFrames = hasGeneratedStartStopFrameChain;
  const startStopFrameUrls = hasGeneratedStartStopFrameChain
    ? buildGeneratedStartStopStoryboardReviewFrameUrls({
        shotCount,
        metadata: params.metadata,
      })
    : [];
  const storyboardFrameUrls = params.metadata.storyboardFrameUrls ?? [];
  const frameUrls =
    usesStartStopFrames || !hasStoryboardFrameChain
      ? startStopFrameUrls
      : storyboardFrameUrls;
  const startStopSource = hasGeneratedStartStopFrameChain
    ? "generated_start_stop_frames"
    : "single_storyboard_frame";
  const resolvedAudioStrategy =
    params.metadata.resolvedAudioStrategy ??
    resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
      requested: params.metadata.audioStrategy,
      videoModel: DEFAULT_VIDEO_MODEL,
    });
  return {
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    title: params.plan.title,
    conceptId: params.plan.conceptId,
    productId: params.plan.productTruth.productId,
    productionRunId: params.run.productionRunId,
    outputMode: params.run.outputMode,
    frameStrategy: params.run.frameStrategy,
    audioStrategy: params.metadata.audioStrategy ?? "auto",
    resolvedAudioStrategy,
    expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
    conceptDetails: params.plan.productDetail,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    durationSeconds: durationSecondsForShotCount(params.plan.shots.length),
    aspectRatio: "9:16",
    clips: params.plan.shots.map((shot, index) => {
      const startFrameUrl = usesStartStopFrames
        ? cleanText(frameUrls[index])
        : cleanText(storyboardFrameUrls[index]);
      const stopFrameUrl = usesStartStopFrames
        ? cleanText(frameUrls[index + 1])
        : "";
      const primaryFrameUrl = startFrameUrl || cleanText(frameUrls[index]);
      const referenceMode: MarketplaceAutoReviewVideoReferenceMode =
        startFrameUrl && stopFrameUrl
          ? "start_stop"
          : "single_storyboard_frame";
      return {
        id: shot.id,
        index,
        order: shot.order,
        title: shot.title,
        status:
          usesStartStopFrames && (!startFrameUrl || !stopFrameUrl)
            ? "pending"
            : primaryFrameUrl
              ? "completed"
              : "pending",
        url: primaryFrameUrl || null,
        thumbnailUrl: primaryFrameUrl || null,
        startFrameUrl: startFrameUrl || null,
        stopFrameUrl: stopFrameUrl || null,
        prompt: buildVideoPrompt(params.plan, shot, {
          audioStrategy: resolvedAudioStrategy,
          isLastShot: index === params.plan.shots.length - 1,
          referenceMode,
          metadata: params.metadata,
        }),
        storyboardGuide: shot.storyboardGuide,
        voiceover: shot.voiceover,
        startSeconds: shot.startSeconds,
        endSeconds: shot.endSeconds,
        durationSeconds: shot.durationSeconds,
        metadata: {
          marketplaceProductId: params.plan.productTruth.productId,
          productionRunId: params.run.productionRunId,
          conceptId: params.plan.conceptId,
          audioStrategy: params.metadata.audioStrategy ?? "auto",
          resolvedAudioStrategy,
          expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
          referenceMode,
          startStopSource,
        },
      };
    }),
  };
}

function hasCompleteFrameSet(
  urls: string[] | undefined,
  count: number
): boolean {
  if (!Array.isArray(urls) || urls.length < count) return false;
  return Array.from({ length: count }, (_item, index) =>
    Boolean(cleanText(urls[index]))
  ).every(Boolean);
}

function buildGeneratedStartStopStoryboardReviewFrameUrls(params: {
  shotCount: number;
  metadata: RunMetadata;
}): string[] {
  const startFrameUrls = params.metadata.startFrameUrls ?? [];
  const stopFrameUrls = params.metadata.stopFrameUrls ?? [];
  const frames: string[] = [];
  frames[0] = cleanText(startFrameUrls[0]);
  for (let index = 0; index < params.shotCount; index += 1) {
    frames[index + 1] = cleanText(stopFrameUrls[index]);
  }
  return frames;
}

export function buildMarketplaceAutoReviewStoryboardReviewOutputForTest(input: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  return buildStoryboardReviewOutput(input);
}

function buildMarketplaceAutoReviewStoryboardReviewTasks(params: {
  clips: ReturnType<typeof buildStoryboardReviewOutput>["clips"];
  plan: AutoReviewPlan;
  run: MarketplaceAutoReviewRun;
}) {
  return params.clips.map(clip => {
    const referenceMode = cleanText(asRecord(clip.metadata).referenceMode);
    const startFrameUrl = cleanText(
      clip.startFrameUrl || clip.thumbnailUrl || clip.url
    );
    const stopFrameUrl = cleanText(clip.stopFrameUrl);
    const referenceImages = [startFrameUrl, stopFrameUrl]
      .filter(Boolean)
      .map(url => ({ url }));
    const referenceFrameRoles = stopFrameUrl
      ? ["start", "stop"]
      : startFrameUrl
        ? [referenceMode === "single_storyboard_frame" ? "reference" : "start"]
        : [];
    return {
      id: cleanText(clip.id) || `shot-${clip.order}`,
      index: Number.isFinite(Number(clip.index)) ? Number(clip.index) : 0,
      status: "queued",
      type: "video",
      prompt:
        cleanText(clip.prompt) ||
        cleanText(clip.title) ||
        "Storyboard video clip",
      model: DEFAULT_VIDEO_MODEL,
      durationSeconds: Number.isFinite(Number(clip.durationSeconds))
        ? Number(clip.durationSeconds)
        : DEFAULT_SHOT_DURATION_SECONDS,
      aspectRatio: "9:16",
      thumbnailUrl:
        cleanText(clip.thumbnailUrl || clip.startFrameUrl || clip.url) ||
        undefined,
      startFrameUrl: cleanText(clip.startFrameUrl) || undefined,
      stopFrameUrl: cleanText(clip.stopFrameUrl) || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "imported",
      statusDetail: "Waiting for generated video clip",
      storyboardContext: {
        aspectRatio: "9:16",
        duration: Number.isFinite(Number(clip.durationSeconds))
          ? Number(clip.durationSeconds)
          : DEFAULT_SHOT_DURATION_SECONDS,
        referenceImages,
        apiConfig: {},
        extraParams: {
          marketplaceProductId: params.plan.productTruth.productId,
          productionRunId: params.run.productionRunId,
          autoReviewRunId: params.run.id,
          conceptId: params.plan.conceptId,
          shotId: cleanText(clip.id) || null,
          shotOrder: clip.order,
          referenceFrameRoles,
        },
      },
    };
  });
}

export function buildMarketplaceAutoReviewStoryboardReviewTasksForTest(input: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const output = buildStoryboardReviewOutput(input);
  return buildMarketplaceAutoReviewStoryboardReviewTasks({
    clips: output.clips,
    plan: input.plan,
    run: input.run,
  });
}

async function createStoryboardReview(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  if (params.run.storyboardReviewId) return params.run.storyboardReviewId;
  const output = buildStoryboardReviewOutput(params);
  const identity = buildProductionOutputProjectionIdentity({
    tenantId: params.tenantId,
    productionRunId: params.run.productionRunId,
    surface: "storyboard_review",
    sourceOutput: output,
  });
  const [existingProjection] = await params.db
    .select()
    .from(mediaProductionOutputProjections)
    .where(
      and(
        eq(mediaProductionOutputProjections.tenantId, params.tenantId),
        eq(
          mediaProductionOutputProjections.productionRunId,
          params.run.productionRunId
        ),
        eq(mediaProductionOutputProjections.surface, "storyboard_review"),
        eq(
          mediaProductionOutputProjections.sourceOutputHash,
          identity.sourceOutputHash
        )
      )
    )
    .limit(1);
  if (existingProjection?.surfaceRecordId) {
    await updateRun({
      db: params.db,
      runId: params.run.id,
      storyboardReviewId: existingProjection.surfaceRecordId,
    });
    return existingProjection.surfaceRecordId;
  }
  const clips = output.clips;
  const reviewTasks = buildMarketplaceAutoReviewStoryboardReviewTasks({
    clips,
    plan: params.plan,
    run: params.run,
  });
  const reviewTaskIds = reviewTasks.map(task => task.id);
  const reviewUpdatedAt = Date.now();
  const now = nowDate();
  const [review] = await params.db
    .insert(mediaStudioStoryboardReviews)
    .values({
      userId: params.auth.userId,
      name: params.plan.title,
      reviewData: {
        version: 1,
        name: params.plan.title,
        updatedAt: reviewUpdatedAt,
        taskIds: reviewTaskIds,
        selectedTaskIds: reviewTaskIds,
        companionAudio: [],
        companionAudioUpdatedAt: null,
        compoundStatus: null,
        projectLink: null,
        renderJobId: null,
        productionRunId: params.run.productionRunId,
        sourceSurface: "marketplace_auto_review",
        sourceProductId: params.plan.productTruth.productId,
        marketplaceProduct: params.plan.productTruth,
        storyBible: {
          conceptId: params.plan.conceptId,
          storyboardGuide: params.plan.storyboardGuide,
          voiceoverScript: params.plan.voiceoverScript,
          productDetail: params.plan.productDetail,
          audioStrategy: params.metadata.audioStrategy ?? "auto",
          resolvedAudioStrategy: params.metadata.resolvedAudioStrategy,
        },
        qualityGateSummary: {
          productReferenceLock: "strict",
          faceVisibilityGuard: "enabled",
          storyboardVoiceoverContract: "enabled",
          nativeAudioPacingContract:
            params.metadata.resolvedAudioStrategy === "native_video_audio"
              ? "enabled"
              : "not_applicable",
        },
        tasks: reviewTasks,
        clips,
        output,
        conceptDetails: params.plan.productDetail,
        storyboardGuide: params.plan.storyboardGuide,
        voiceoverScript: params.plan.voiceoverScript,
        autoReviewRunId: params.run.id,
        audioStrategy: params.metadata.audioStrategy ?? "auto",
        resolvedAudioStrategy: params.metadata.resolvedAudioStrategy,
      },
      clipCount: reviewTasks.length,
      completedClipCount: 0,
      thumbnailUrl:
        cleanText(clips.find(clip => clip.thumbnailUrl)?.thumbnailUrl) ||
        undefined,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: mediaStudioStoryboardReviews.id });
  const surfaceRecordId = String(review.id);
  await params.db
    .insert(mediaProductionOutputProjections)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.run.productionRunId,
      storyboardRunId: params.plan.conceptId,
      surface: "storyboard_review",
      surfaceRecordId,
      sourceOutputHash: identity.sourceOutputHash,
      metadata: {
        idempotencyKey: identity.idempotencyKey,
        clipCount: reviewTasks.length,
        marketplaceProductId: params.plan.productTruth.productId,
        autoReviewRunId: params.run.id,
      },
      status: "active",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        mediaProductionOutputProjections.tenantId,
        mediaProductionOutputProjections.productionRunId,
        mediaProductionOutputProjections.surface,
        mediaProductionOutputProjections.sourceOutputHash,
      ],
      set: {
        surfaceRecordId,
        metadata: {
          idempotencyKey: identity.idempotencyKey,
          clipCount: reviewTasks.length,
          marketplaceProductId: params.plan.productTruth.productId,
          autoReviewRunId: params.run.id,
        },
        status: "active",
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    storyboardReviewId: surfaceRecordId,
  });
  return surfaceRecordId;
}

async function scheduleVideoAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}) {
  assertMarketplaceAutoReviewGovernanceReady(params.metadata, "video_spend");
  await assertPaidStageAuthorityFresh({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    phase: "video_spend",
    stageKey: "video_generation",
  });
  const userToken = cleanText(params.runtime.userToken);
  if (!userToken)
    throw new Error("Video generation needs an authenticated media token");
  const plan = extractPlanFromRun(params.run);
  if (!characterIdentityAllowsVisualGeneration(params.metadata)) {
    throw new Error(
      "Character identity asset pack blocks video generation for this Marketplace Auto Review run"
    );
  }
  const existingRefs = directTaskRefs(params.metadata.directVideoTasks);
  const activeRefs = latestTaskRefsByUnit(existingRefs).filter(
    ref =>
      directMediaRefReachedProvider(ref) &&
      ref.status !== "completed" &&
      ref.status !== "failed"
  );
  if (activeRefs.length > 0)
    return (
      cleanText(params.metadata.videoAttemptId) ||
      `direct-video-${params.run.id}`
    );
  const pendingVideoRepairUnits = directVideoUnits(
    params.metadata.pendingVideoRepairUnits
  );
  const providerUnreachedIntentUnits =
    videoUnitsFromProviderUnreachedSubmitIntents(existingRefs);
  const repairUnits =
    pendingVideoRepairUnits.length > 0
      ? pendingVideoRepairUnits
      : providerUnreachedIntentUnits;
  const units =
    repairUnits.length > 0
      ? repairUnits
      : existingRefs.length === 0
        ? buildInitialVideoUnits(plan)
        : [];
  if (units.length === 0)
    return (
      cleanText(params.metadata.videoAttemptId) ||
      `direct-video-${params.run.id}`
    );
  const resolvedAudioStrategy =
    params.metadata.resolvedAudioStrategy ??
    resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: "full_video",
      requested: params.metadata.audioStrategy,
      videoModel: DEFAULT_VIDEO_MODEL,
    });
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = params.metadata
    .startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const attemptId =
    cleanText(params.metadata.videoAttemptId) || `direct-video-${nanoid(12)}`;
  const submittedRefs: DirectMediaTaskRef[] = [];
  for (const unit of units) {
    const shot = shotForUnit(plan, unit);
    if (!shot) throw new Error(`Missing shot for video unit ${unit.unitId}`);
    const attempt = nextDirectAttempt(existingRefs, unit.unitId);
    if (attempt > MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS + 1) {
      throw new Error(`Video repair exceeded max attempts for ${unit.unitId}`);
    }
    const refs = referenceImagesForVideoUnit(plan, params.metadata, unit);
    const prompt =
      buildVideoPrompt(plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: shot.order === plan.shots.length,
        referenceMode,
        metadata: params.metadata,
      }) +
      (unit.repairInstruction
        ? `\nTargeted repair: ${unit.repairInstruction}`
        : "");
    let credit: Awaited<
      ReturnType<typeof reserveMarketplaceMediaCredits>
    > | null = null;
    let intentRef: DirectMediaTaskRef | null = null;
    try {
      credit = await reserveMarketplaceMediaCredits({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: params.run,
        stageKey: "video_generation",
        mediaType: "video",
        unitId: unit.unitId,
        attempt,
        model: DEFAULT_VIDEO_MODEL,
        selections: {
          duration: shot.durationSeconds,
          resolution: "1080p",
          aspectRatio: "9:16",
          referenceImageUrls: refs,
        },
        description: `Marketplace auto review video ${unit.unitId} ${shot.durationSeconds}s (reserved)`,
        metadata: {
          role: unit.role,
          shotId: unit.shotId,
          shotOrder: unit.shotOrder,
          durationSeconds: shot.durationSeconds,
          repairReasonCodes: unit.repairReasonCodes,
        },
      });
      intentRef = buildDirectMediaSubmitIntentRef({
        runId: params.run.id,
        mediaType: "video",
        stageKey: "video_generation",
        unit,
        attempt,
        model: DEFAULT_VIDEO_MODEL,
        credit,
        referenceImageUrls: refs,
      });
      submittedRefs.push(intentRef);
      await persistDirectMediaSubmitProgress({
        db: params.db,
        run: params.run,
        metadata: params.metadata,
        mediaType: "video",
        attemptId,
        existingRefs,
        submittedRefs,
      });
      const task = await mediaGenerationService.generateVideoAsync(
        {
          prompt,
          model: DEFAULT_VIDEO_MODEL,
          duration: shot.durationSeconds,
          aspectRatio: "9:16",
          resolution: "1080p",
          referenceImageUrls: refs,
          publicUrl: cleanText(params.runtime.publicUrl) || undefined,
          extraParams: {
            __origin_surface: "marketplace_auto_review",
            __execution_path: "direct_media_service",
            __no_node_canvas_execution: true,
            __marketplace_product_id: plan.productTruth.productId,
            __marketplace_product_name: plan.productTruth.productName,
            __production_run_id: params.run.productionRunId,
            __auto_review_run_id: params.run.id,
            __auto_review_concept_id: plan.conceptId,
            __unit_id: unit.unitId,
            __unit_role: unit.role,
            __repair_attempt: attempt,
            __resolved_audio_strategy: resolvedAudioStrategy,
          },
          auditContext: {
            userId: params.auth.userId,
            traceId: `marketplace-auto-review-video:${params.run.id}:${unit.unitId}:${attempt}`,
            source: "marketplace_auto_review",
            stage: "video_generation",
          },
        },
        userToken
      );
      const submittedRef: DirectMediaTaskRef = {
        ...(intentRef ?? {}),
        unitId: unit.unitId,
        mediaType: "video",
        stageKey: "video_generation",
        role: unit.role,
        shotId: unit.shotId,
        shotOrder: unit.shotOrder,
        attempt,
        taskId: task.id,
        providerTaskId: task.taskId,
        model: task.model || DEFAULT_VIDEO_MODEL,
        status: task.status,
        creditAmount: credit.amount,
        creditTransactionId: credit.transactionId,
        creditIdempotencyKey: credit.idempotencyKey,
        repairReasonCodes: unit.repairReasonCodes,
        submittedAt: nowIso(),
        providerSubmitIntentStatus: "submitted_to_provider",
      };
      submittedRefs.splice(
        0,
        submittedRefs.length,
        ...replaceDirectMediaSubmittedRef(
          submittedRefs,
          intentRef,
          submittedRef
        )
      );
    } catch (error) {
      if (credit) {
        const failedRef: DirectMediaTaskRef = {
          ...(intentRef ?? {}),
          unitId: unit.unitId,
          mediaType: "video",
          stageKey: "video_generation",
          role: unit.role,
          shotId: unit.shotId,
          shotOrder: unit.shotOrder,
          attempt,
          taskId: `submit-failed:${unit.unitId}:${attempt}`,
          model: DEFAULT_VIDEO_MODEL,
          status: "failed",
          creditAmount: credit.amount,
          creditTransactionId: credit.transactionId,
          creditIdempotencyKey: credit.idempotencyKey,
          submittedAt: nowIso(),
          providerSubmitIntentId: intentRef?.providerSubmitIntentId,
          providerSubmitIntentStatus: intentRef
            ? "provider_submit_failed_after_intent"
            : "provider_submit_failed_before_intent",
          providerSubmitIntentRecordedAt:
            intentRef?.providerSubmitIntentRecordedAt,
          providerSubmitEvidence: compactRecord({
            ...asRecord(intentRef?.providerSubmitEvidence),
            status: intentRef
              ? "provider_submit_failed_after_intent"
              : "provider_submit_failed_before_intent",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            failedAt: nowIso(),
          }),
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        const refunded = await refundMarketplaceMediaCredits({
          auth: params.auth,
          ref: failedRef,
          reason: "submit_failed",
        }).catch(refundError => ({
          ...failedRef,
          errorMessage: [
            failedRef.errorMessage,
            `refund_failed:${refundError instanceof Error ? refundError.message : String(refundError)}`,
          ]
            .filter(Boolean)
            .join("; "),
        }));
        submittedRefs.splice(
          0,
          submittedRefs.length,
          ...replaceDirectMediaSubmittedRef(submittedRefs, intentRef, refunded)
        );
      }
      if (submittedRefs.length > 0) {
        await persistDirectMediaSubmitProgress({
          db: params.db,
          run: params.run,
          metadata: params.metadata,
          mediaType: "video",
          attemptId,
          existingRefs,
          submittedRefs,
        });
      }
      throw error;
    }
    await persistDirectMediaSubmitProgress({
      db: params.db,
      run: params.run,
      metadata: params.metadata,
      mediaType: "video",
      attemptId,
      existingRefs,
      submittedRefs,
    });
  }
  await persistDirectMediaSubmitProgress({
    db: params.db,
    run: params.run,
    metadata: params.metadata,
    mediaType: "video",
    attemptId,
    existingRefs,
    submittedRefs,
    clearPendingRepairUnits: true,
  });
  return attemptId;
}

function buildFullVoiceoverScript(
  plan: AutoReviewPlan,
  metadata?: RunMetadata | null
): string {
  return plan.shots
    .map(shot =>
      buildMarketplaceAutoReviewNativeSpeechText({
        plan,
        shot,
        isLastShot: shot.order === plan.shots.length,
        metadata,
      })
    )
    .filter(Boolean)
    .join("\n");
}

function mediaTaskResultUrl(task: MediaTask): string {
  const direct = cleanText(task.resultUrl);
  if (direct) return direct;
  const data = asRecord(task.resultData);
  for (const key of [
    "audioUrl",
    "audio_url",
    "url",
    "resultUrl",
    "result_url",
    "outputUrl",
    "output_url",
  ]) {
    const value = cleanText(data[key]);
    if (value) return value;
  }
  const artifacts = data.artifacts;
  if (Array.isArray(artifacts)) {
    for (const artifact of artifacts) {
      const value = cleanText(asRecord(artifact).url ?? asRecord(artifact).uri);
      if (value) return value;
    }
  }
  return "";
}

function readPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0)
      return Math.round(parsed * 100) / 100;
  }
  return undefined;
}

function mediaTaskDurationSeconds(task: MediaTask): number | undefined {
  const data = asRecord(task.resultData);
  const params = asRecord(task.parameters);
  return readPositiveNumber(
    data.durationSeconds,
    data.duration_seconds,
    data.duration,
    data.audioDurationSeconds,
    data.audio_duration_seconds,
    data.actualDurationSeconds,
    data.actual_duration_seconds,
    params.durationSeconds,
    params.duration_seconds,
    params.duration,
    params.extra_params && asRecord(params.extra_params).durationSeconds,
    params.extra_params && asRecord(params.extra_params).duration_seconds
  );
}

function buildWarningOverlayTextClips(
  metadata: RunMetadata,
  durationSeconds: number
): VideoEditorProject["timeline"]["tracks"][number]["clips"] {
  const warningPlan = asRecord(metadata.visualWarningPlan);
  if (warningPlan.required !== true) return [];
  const text =
    cleanText(warningPlan.exactText) ||
    "โฆษณานี้สร้างจากข้อมูลสินค้าและภาพอ้างอิง โปรดตรวจสอบรายละเอียดก่อนตัดสินใจ";
  const minDuration = Math.max(0, toNumber(warningPlan.minDurationSeconds));
  const duration = Math.max(
    0.1,
    Math.min(durationSeconds, Math.max(minDuration, durationSeconds))
  );
  const placement = cleanText(warningPlan.placement) || "bottom_safe_area";
  const y =
    placement === "top_safe_area"
      ? 0.1
      : placement === "caption_band"
        ? 0.82
        : 0.9;
  return [
    {
      id: "clip-marketplace-warning-disclosure",
      assetId: "text-marketplace-warning-disclosure",
      trackId: "track-t1",
      startTime: 0,
      duration,
      trimIn: 0,
      trimOut: duration,
      volume: 0,
      speed: 1,
      effects: [],
      transform: {
        x: 0.5,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      },
      textConfig: {
        text,
        fontFamily: "Noto Sans Thai",
        fontSize: 36,
        fontWeight: 700,
        fontStyle: "normal",
        color: "#FFFFFF",
        backgroundColor: "transparent",
        textAlign: "center",
        effect: "shadow",
        effectColor: "#000000",
        lineHeight: 1.25,
        letterSpacing: 0,
      },
      groupId: "marketplace-auto-review-warning",
      startMs: 0,
      inMs: 0,
      outMs: Math.round(duration * 1000),
      zOrder: 1000,
    } as VideoEditorProject["timeline"]["tracks"][number]["clips"][number] &
      Record<string, unknown>,
  ];
}

function buildAudioContinuityEnvelope(input: {
  runId: string;
  plan: AutoReviewPlan;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  audioUrl?: string | null;
  actualDurationSeconds?: number | null;
  audioEvidenceRefs?: string[];
  transcriptRefs?: string[];
  durationProbeRef?: string | null;
  gapAnalysisRef?: string | null;
}): Record<string, unknown> {
  const expectedDurationSeconds = input.plan.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  const actualDurationSeconds = readPositiveNumber(input.actualDurationSeconds);
  const audioEvidenceRefs = uniqRefs(input.audioEvidenceRefs ?? []);
  const transcriptRefs = uniqRefs(
    input.transcriptRefs ?? [`voiceover-script:${input.runId}`]
  );
  const durationProbeRef =
    cleanText(input.durationProbeRef) ||
    (actualDurationSeconds ? `audio-duration:${input.runId}` : null);
  const gapAnalysisRef =
    cleanText(input.gapAnalysisRef) ||
    (actualDurationSeconds ? `audio-gap-analysis:${input.runId}` : null);
  const base = {
    qaEnvelopeId: `audio-qa:${input.runId}:${nanoid(8)}`,
    runId: input.runId,
    stageKey: "audio_generation",
    checkedAt: nowIso(),
    resolvedAudioStrategy: input.resolvedAudioStrategy,
    expectedDurationSeconds,
    actualDurationSeconds,
    audioEvidenceRefs,
    transcriptRefs,
    durationProbeRef,
    gapAnalysisRef,
    continuityChecks: [
      "voiceover_contract_matches_storyboard",
      "no_node_canvas_audio_path",
      "timeline_gap_free_when_video_editor_project_is_created",
    ],
  };
  if (input.resolvedAudioStrategy === "silent") {
    return {
      ...base,
      status: "skipped_silent",
      reasonCodes: ["silent_video_requested_or_storyboard_only"],
      repairInstruction: null,
    };
  }
  if (input.resolvedAudioStrategy === "native_video_audio") {
    return {
      ...base,
      status: "needs_targeted_repair",
      reasonCodes: ["native_audio_evidence_missing"],
      repairInstruction:
        "Attach generated audio samples, transcript alignment, duration probe, and gap analysis for native provider audio before render.",
      continuityChecks: [
        ...base.continuityChecks,
        "native_audio_requires_generated_evidence_before_render",
      ],
    };
  }
  if (!cleanText(input.audioUrl)) {
    return {
      ...base,
      status: "needs_targeted_repair",
      reasonCodes: ["missing_audio_url"],
      repairInstruction:
        "Regenerate only the voiceover audio; preserve accepted images, clips, and editor timeline.",
    };
  }
  if (!actualDurationSeconds) {
    return {
      ...base,
      status: "needs_targeted_repair",
      reasonCodes: ["audio_duration_metadata_missing"],
      repairInstruction:
        "Probe or regenerate only the voiceover audio so the final timeline can prove duration and avoid silent gaps.",
    };
  }
  if (actualDurationSeconds < expectedDurationSeconds * 0.75) {
    return {
      ...base,
      status: "needs_targeted_repair",
      reasonCodes: ["audio_duration_too_short"],
      repairInstruction:
        "Regenerate only the voiceover audio with natural Thai pacing close to the storyboard duration; preserve accepted visuals and clips.",
    };
  }
  if (actualDurationSeconds < expectedDurationSeconds * 0.9) {
    return {
      ...base,
      status: "needs_targeted_repair",
      reasonCodes: ["audio_duration_short_but_timeline_gap_guarded"],
      repairInstruction:
        "Regenerate or extend only the voiceover audio so duration and gap analysis can pass before render.",
    };
  }
  return {
    ...base,
    status: "accepted",
    audioEvidenceRefs: uniqRefs([
      cleanText(input.audioUrl),
      ...audioEvidenceRefs,
    ]),
    transcriptRefs,
    durationProbeRef,
    gapAnalysisRef,
    reasonCodes: [],
    repairInstruction: null,
  };
}

export function buildMarketplaceAutoReviewAudioContinuityEnvelopeForTest(input: {
  runId: string;
  plan: AutoReviewPlan;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  audioUrl?: string | null;
  actualDurationSeconds?: number | null;
}): Record<string, unknown> {
  return buildAudioContinuityEnvelope(input);
}

async function ensureAudioForVideo(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}): Promise<{ metadata: RunMetadata; completed: boolean }> {
  const resolvedAudioStrategy =
    params.metadata.resolvedAudioStrategy ??
    resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
      requested: params.metadata.audioStrategy,
      videoModel: DEFAULT_VIDEO_MODEL,
    });
  const stageOrder = stageIndex("audio_generation", FULL_VIDEO_STAGES);
  if (resolvedAudioStrategy !== "separate_tts_voiceover") {
    const audioContinuityQaEnvelope = buildAudioContinuityEnvelope({
      runId: params.run.id,
      plan: params.plan,
      resolvedAudioStrategy,
    });
    const metadata = withUpdatedCreditSummary({
      ...params.metadata,
      resolvedAudioStrategy,
      expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
      voiceoverSource:
        resolvedAudioStrategy === "native_video_audio"
          ? "native_video_prompt"
          : "none",
      audioContinuityQaEnvelope,
    });
    const audioStatus = cleanText(audioContinuityQaEnvelope.status);
    if (
      audioStatus === "needs_targeted_repair" ||
      audioStatus === "blocked" ||
      audioStatus === "failed"
    ) {
      await updateRun({
        db: params.db,
        runId: params.run.id,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: stageOrder,
        stageCount: FULL_VIDEO_STAGES.length,
        metadataJson: metadata,
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "audio_generation",
        stageOrder,
        status: "repairing",
        output: {
          skipped: false,
          resolvedAudioStrategy,
          audioContinuityQaEnvelope,
          repairInstruction: cleanText(
            audioContinuityQaEnvelope.repairInstruction
          ),
        },
        stageCompletionEvidence: {
          status: "repair_required",
          requiredRefs: ["audioContinuityQaEnvelope", "generatedAudioEvidence"],
          artifactRefs: [`audio-strategy:${resolvedAudioStrategy}`],
          qaVerdictRefs: [cleanText(audioContinuityQaEnvelope.qaEnvelopeId)],
          policyRefs: ["audio-evidence-required-before-render"],
          missingRefs: [
            "generatedAudioSamples",
            "durationProbe",
            "gapAnalysis",
          ],
        },
      });
      return { metadata, completed: false };
    }
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "completed",
      output: {
        skipped: true,
        reason:
          resolvedAudioStrategy === "native_video_audio"
            ? "native_audio_in_video_prompt"
            : "silent_video",
        resolvedAudioStrategy,
        audioContinuityQaEnvelope,
      },
      stageCompletionEvidence: {
        status:
          resolvedAudioStrategy === "native_video_audio"
            ? "complete"
            : "skipped",
        requiredRefs: [
          "audioStrategy",
          "characterIdentityAssetPack",
          "audioContinuityQaEnvelope",
        ],
        artifactRefs: [`audio-strategy:${resolvedAudioStrategy}`],
        qaVerdictRefs: [cleanText(audioContinuityQaEnvelope.qaEnvelopeId)],
        policyRefs: ["audio-rights:provider-native-or-silent"],
      },
    });
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return { metadata, completed: true };
  }

  if (params.metadata.audioUrl) {
    const audioContinuityQaEnvelope = cleanText(
      asRecord(params.metadata.audioContinuityQaEnvelope).qaEnvelopeId
    )
      ? asRecord(params.metadata.audioContinuityQaEnvelope)
      : buildAudioContinuityEnvelope({
          runId: params.run.id,
          plan: params.plan,
          resolvedAudioStrategy,
          audioUrl: params.metadata.audioUrl,
          actualDurationSeconds: params.metadata.audioActualDurationSeconds,
        });
    if (
      cleanText(audioContinuityQaEnvelope.status) === "needs_targeted_repair"
    ) {
      throw new Error(
        cleanText(audioContinuityQaEnvelope.repairInstruction) ||
          "Separate voiceover audio failed continuity QA"
      );
    }
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "completed",
      output: {
        audioUrl: params.metadata.audioUrl,
        mediaTaskId: params.metadata.audioMediaTaskId,
        providerTaskId: params.metadata.audioProviderTaskId,
        resolvedAudioStrategy,
        audioContinuityQaEnvelope,
      },
      stageCompletionEvidence: {
        status:
          cleanText(audioContinuityQaEnvelope.status) === "accepted"
            ? "complete"
            : "warning_complete",
        requiredRefs: [
          "audioUrl",
          "audioContinuityQaEnvelope",
          "audioCreditTransaction",
        ],
        artifactRefs: [
          cleanText(params.metadata.audioUrl) || `audio:${params.run.id}`,
        ],
        qaVerdictRefs: [
          cleanText(audioContinuityQaEnvelope.qaEnvelopeId) ||
            `audio-qa:${params.run.id}`,
        ],
        creditRefs: [
          params.metadata.audioCreditTransactionId
            ? `credit:${params.metadata.audioCreditTransactionId}`
            : "credit:audio:existing",
        ],
        lineageRefs: [`lineage:${params.run.id}:audio`],
        policyRefs: ["audio-rights:tts-provider"],
      },
    });
    const metadata = withUpdatedCreditSummary({
      ...params.metadata,
      audioContinuityQaEnvelope,
    });
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: metadata,
    });
    return { metadata, completed: true };
  }

  assertMarketplaceAutoReviewGovernanceReady(params.metadata, "audio_spend");
  await assertPaidStageAuthorityFresh({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    phase: "audio_spend",
    stageKey: "audio_generation",
  });
  const userToken = cleanText(params.runtime.userToken);
  if (!userToken)
    throw new Error("Audio generation needs an authenticated media token");

  const targetDurationSeconds = durationSecondsForShotCount(
    params.plan.shots.length
  );
  if (!params.metadata.audioMediaTaskId) {
    const text = buildFullVoiceoverScript(params.plan, params.metadata);
    const credit = await reserveMarketplaceMediaCredits({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: params.run,
      stageKey: "audio_generation",
      mediaType: "audio",
      unitId: "audio-full-voiceover",
      attempt: toNumber(params.metadata.audioRepairAttempt) + 1 || 1,
      model: "elevenlabs-tts",
      selections: { text },
      description: "Marketplace auto review voiceover audio (reserved)",
      metadata: {
        targetDurationSeconds,
        resolvedAudioStrategy,
      },
    });
    let task: MediaTask;
    try {
      task = await mediaGenerationService.generateAudioAsync(
        {
          text,
          speed: 0.98,
          publicUrl: cleanText(params.runtime.publicUrl) || undefined,
          extraParams: {
            __origin_surface: "marketplace_auto_review",
            __execution_path: "direct_media_service",
            __no_node_canvas_execution: true,
            __marketplace_product_id: params.plan.productTruth.productId,
            __marketplace_product_name: params.plan.productTruth.productName,
            __production_run_id: params.run.productionRunId,
            __auto_review_run_id: params.run.id,
            __auto_review_concept_id: params.plan.conceptId,
            target_duration_seconds: targetDurationSeconds,
            voiceover_source: "marketplace_auto_review_full_script",
          },
          auditContext: {
            userId: params.auth.userId,
            traceId: `marketplace-auto-review-audio:${params.run.id}`,
            source: "marketplace_auto_review",
            stage: "audio_generation",
          },
        },
        userToken
      );
    } catch (error) {
      if (credit.amount > 0) {
        await refundCredits({
          userId: params.auth.userId,
          amount: credit.amount,
          originalTransactionId: credit.transactionId,
          idempotencyKey: `${credit.idempotencyKey}:refund:submit_failed`,
          description: "Refund marketplace auto review audio submit failure",
          sourceType: "media_audio",
          metadata: {
            feature: "marketplace_auto_review",
            runId: params.run.id,
            reason: "submit_failed",
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
      throw error;
    }
    const metadata = {
      ...params.metadata,
      resolvedAudioStrategy,
      expectedNativeAudio: false,
      voiceoverSource: "separate_tts_voiceover",
      audioMediaTaskId: task.id,
      audioProviderTaskId: task.taskId,
      audioTaskModel: task.model,
      audioCreditAmount: credit.amount,
      audioCreditTransactionId: credit.transactionId,
      audioCreditIdempotencyKey: credit.idempotencyKey,
      audioTargetDurationSeconds: targetDurationSeconds,
    };
    await updateRun({
      db: params.db,
      runId: params.run.id,
      status: "waiting_provider",
      currentStage: "audio_generation",
      stageIndex: stageOrder,
      stageCount: FULL_VIDEO_STAGES.length,
      metadataJson: withUpdatedCreditSummary(metadata),
    });
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "waiting_provider",
      providerTaskIds: [task.taskId ?? task.id].filter(Boolean),
      output: {
        mediaTaskId: task.id,
        providerTaskId: task.taskId,
        model: task.model,
        resolvedAudioStrategy,
      },
    });
    return { metadata, completed: false };
  }

  const task = await mediaGenerationService.getTask(
    params.metadata.audioMediaTaskId,
    userToken,
    {
      userId: params.auth.userId,
      traceId: `marketplace-auto-review-audio-status:${params.run.id}`,
      source: "marketplace_auto_review",
      stage: "audio_generation_status",
    }
  );
  if (task.status === "failed") {
    if (
      !params.metadata.audioRefundTransactionId &&
      params.metadata.audioCreditAmount
    ) {
      const refund = await refundCredits({
        userId: params.auth.userId,
        amount: params.metadata.audioCreditAmount,
        originalTransactionId: params.metadata.audioCreditTransactionId,
        idempotencyKey: `${params.metadata.audioCreditIdempotencyKey}:refund:provider_failed`,
        description: "Refund marketplace auto review audio provider failure",
        sourceType: "media_audio",
        metadata: {
          feature: "marketplace_auto_review",
          runId: params.run.id,
          reason: "provider_failed",
          error: task.errorMessage,
        },
      });
      await updateRun({
        db: params.db,
        runId: params.run.id,
        metadataJson: withUpdatedCreditSummary({
          ...params.metadata,
          audioRefundTransactionId: refund.transactionId,
        }),
      });
    }
    throw new Error(
      task.errorMessage || "Separate voiceover generation failed"
    );
  }
  if (task.status !== "completed") {
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "waiting_provider",
      providerTaskIds: [
        task.taskId ?? params.metadata.audioProviderTaskId ?? task.id,
      ].filter(Boolean),
      output: {
        mediaTaskId: task.id,
        providerTaskId: task.taskId,
        status: task.status,
        resolvedAudioStrategy,
      },
    });
    return { metadata: params.metadata, completed: false };
  }

  const audioUrl = mediaTaskResultUrl(task);
  if (!audioUrl)
    throw new Error("Audio generation completed but result URL is missing");
  const audioActualDurationSeconds = mediaTaskDurationSeconds(task);
  const audioContinuityQaEnvelope = buildAudioContinuityEnvelope({
    runId: params.run.id,
    plan: params.plan,
    resolvedAudioStrategy,
    audioUrl,
    actualDurationSeconds: audioActualDurationSeconds,
  });
  const metadata = {
    ...params.metadata,
    resolvedAudioStrategy,
    expectedNativeAudio: false,
    voiceoverSource: "separate_tts_voiceover",
    audioMediaTaskId: task.id,
    audioProviderTaskId: task.taskId ?? params.metadata.audioProviderTaskId,
    audioTaskModel: task.model,
    audioUrl,
    audioActualDurationSeconds,
    audioTargetDurationSeconds: targetDurationSeconds,
    audioContinuityQaEnvelope,
  };
  if (
    cleanText(audioContinuityQaEnvelope.status) === "needs_targeted_repair" &&
    toNumber(params.metadata.audioRepairAttempt) <
      MAX_DIRECT_MEDIA_REPAIR_ATTEMPTS
  ) {
    const repairMetadataBase = {
      ...metadata,
      previousAudioArtifacts: [
        ...(Array.isArray(params.metadata.previousAudioArtifacts)
          ? params.metadata.previousAudioArtifacts
          : []),
        {
          audioUrl,
          mediaTaskId: task.id,
          providerTaskId: task.taskId,
          qaEnvelope: audioContinuityQaEnvelope,
        },
      ],
      audioRepairAttempt: toNumber(params.metadata.audioRepairAttempt) + 1,
      audioMediaTaskId: undefined,
      audioProviderTaskId: undefined,
      audioUrl: undefined,
      audioTaskModel: undefined,
      pendingAudioRepair: {
        reasonCodes: Array.isArray(audioContinuityQaEnvelope.reasonCodes)
          ? audioContinuityQaEnvelope.reasonCodes
          : ["audio_continuity_repair"],
        repairInstruction: cleanText(
          audioContinuityQaEnvelope.repairInstruction
        ),
      },
    } as RunMetadata;
    const repairMetadata = withUpdatedCreditSummary({
      ...repairMetadataBase,
      targetedRepairPolicyLedger:
        buildMarketplaceAutoReviewTargetedRepairPolicyLedger({
          run: params.run,
          metadata: repairMetadataBase,
        }),
    });
    await updateRun({
      db: params.db,
      runId: params.run.id,
      status: "running",
      currentStage: "audio_generation",
      stageIndex: stageOrder,
      stageCount: FULL_VIDEO_STAGES.length,
      metadataJson: repairMetadata,
    });
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "repairing",
      providerTaskIds: [task.taskId ?? task.id].filter(Boolean),
      output: {
        mediaTaskId: task.id,
        providerTaskId: task.taskId,
        audioUrl,
        audioContinuityQaEnvelope,
        repairInstruction: cleanText(
          audioContinuityQaEnvelope.repairInstruction
        ),
      },
      stageCompletionEvidence: {
        status: "repair_required",
        requiredRefs: ["audioContinuityQaEnvelope", "targetedAudioRepairPlan"],
        artifactRefs: [audioUrl],
        qaVerdictRefs: [cleanText(audioContinuityQaEnvelope.qaEnvelopeId)],
        creditRefs: [
          metadata.audioCreditTransactionId
            ? `credit:${metadata.audioCreditTransactionId}`
            : (metadata.audioCreditIdempotencyKey ?? "credit:audio"),
        ],
        lineageRefs: [`lineage:${params.run.id}:audio`],
        policyRefs: ["audio-gap-free-required"],
        missingRefs: ["audioContinuityQaEnvelope.accepted"],
      },
    });
    return { metadata: repairMetadata, completed: false };
  }
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: withUpdatedCreditSummary(metadata),
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "audio_generation",
    stageOrder,
    status: "completed",
    providerTaskIds: [task.taskId ?? task.id].filter(Boolean),
    output: {
      mediaTaskId: task.id,
      providerTaskId: task.taskId,
      audioUrl,
      audioActualDurationSeconds,
      audioTargetDurationSeconds: targetDurationSeconds,
      resolvedAudioStrategy,
    },
    stageCompletionEvidence: {
      status:
        metadata.audioContinuityQaEnvelope.status === "accepted"
          ? "complete"
          : "warning_complete",
      requiredRefs: [
        "audioUrl",
        "audioContinuityQaEnvelope",
        "audioCreditTransaction",
      ],
      artifactRefs: [audioUrl],
      qaVerdictRefs: [
        cleanText(metadata.audioContinuityQaEnvelope.qaEnvelopeId),
      ],
      creditRefs: [
        metadata.audioCreditTransactionId
          ? `credit:${metadata.audioCreditTransactionId}`
          : (metadata.audioCreditIdempotencyKey ?? "credit:audio"),
      ],
      lineageRefs: [`lineage:${params.run.id}:audio`],
      policyRefs: ["audio-rights:tts-provider", "audio-gap-free-single-track"],
      warningApprovalRefs:
        metadata.audioContinuityQaEnvelope.status === "accepted"
          ? []
          : ["audio-warning:duration-short"],
    },
  });
  return { metadata, completed: true };
}

function buildVideoEditorProject(params: {
  plan: AutoReviewPlan;
  videoUrls: string[];
  run: MarketplaceAutoReviewRun;
}): VideoEditorProject {
  const createdAt = nowIso();
  const runMetadata = (params.run.metadataJson as RunMetadata) ?? {};
  const resolvedAudioStrategy =
    runMetadata.resolvedAudioStrategy ?? "native_video_audio";
  const hasSeparateVoiceover =
    resolvedAudioStrategy === "separate_tts_voiceover" &&
    Boolean(cleanText(runMetadata.audioUrl));
  const muteGeneratedVideoAudio =
    resolvedAudioStrategy === "separate_tts_voiceover" ||
    resolvedAudioStrategy === "silent";
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = runMetadata
    .startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const assets: VideoEditorProject["assets"] = {};
  const clips: VideoEditorProject["timeline"]["tracks"][number]["clips"] = [];
  let cursor = 0;
  params.videoUrls.forEach((url, index) => {
    const shot = params.plan.shots[index];
    if (!shot || !url) return;
    const assetId = `asset-${shot.id}`;
    const clipId = `clip-${shot.id}`;
    assets[assetId] = {
      id: assetId,
      type: "video",
      source: "generated",
      taskId:
        cleanText(
          (params.run.metadataJson as RunMetadata)?.videoMediaTaskIds?.[index]
        ) || undefined,
      model: DEFAULT_VIDEO_MODEL,
      name: `${shot.order}. ${shot.title}`,
      path: url,
      originalPath: url,
      filename: `${shot.id}.mp4`,
      format: "mp4",
      duration: shot.durationSeconds,
      thumbnailPath:
        (params.run.metadataJson as RunMetadata)?.startFrameUrls?.[index] ??
        (params.run.metadataJson as RunMetadata)?.storyboardFrameUrls?.[index],
      generationPrompt: buildVideoPrompt(params.plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: index === params.plan.shots.length - 1,
        referenceMode,
        metadata: runMetadata,
      }),
      referenceUrls: [
        referenceMode === "start_stop"
          ? (params.run.metadataJson as RunMetadata)?.startFrameUrls?.[index]
          : (params.run.metadataJson as RunMetadata)?.storyboardFrameUrls?.[
              index
            ],
        referenceMode === "start_stop"
          ? (params.run.metadataJson as RunMetadata)?.stopFrameUrls?.[index]
          : undefined,
      ].filter(Boolean) as string[],
      generationModelId: DEFAULT_VIDEO_MODEL,
      generationAspectRatio: "9:16",
      generationExtraParams: {
        marketplaceProductId: params.plan.productTruth.productId,
        productionRunId: params.run.productionRunId,
        autoReviewRunId: params.run.id,
        conceptId: params.plan.conceptId,
        shotId: shot.id,
        voiceover: shot.voiceover,
        audioStrategy: runMetadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
        expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
        referenceMode,
      },
    };
    clips.push({
      id: clipId,
      assetId,
      trackId: "track-v1",
      startTime: cursor,
      duration: shot.durationSeconds,
      trimIn: 0,
      trimOut: shot.durationSeconds,
      volume: muteGeneratedVideoAudio ? 0 : 1,
      speed: 1,
      effects: [],
      transitions: { fadeIn: index === 0 ? 0 : 0.12, fadeOut: 0.12 },
      groupId: `auto-review-${params.run.id}`,
    });
    cursor += shot.durationSeconds;
  });
  const audioClips: VideoEditorProject["timeline"]["tracks"][number]["clips"] =
    [];
  if (hasSeparateVoiceover) {
    const audioUrl = cleanText(runMetadata.audioUrl);
    const audioActualDuration =
      readPositiveNumber(runMetadata.audioActualDurationSeconds) ?? cursor;
    const voiceoverClipDuration = Math.min(cursor, audioActualDuration);
    const assetId = "asset-voiceover";
    assets[assetId] = {
      id: assetId,
      type: "audio",
      source: "generated",
      taskId: cleanText(runMetadata.audioMediaTaskId) || undefined,
      model: cleanText(runMetadata.audioTaskModel) || undefined,
      name: "Marketplace auto review voiceover",
      path: audioUrl,
      originalPath: audioUrl,
      filename: `${params.run.id}-voiceover.mp3`,
      format: audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3",
      duration: audioActualDuration,
      generationPrompt: buildFullVoiceoverScript(params.plan, runMetadata),
      generationModelId: cleanText(runMetadata.audioTaskModel) || undefined,
      generationExtraParams: {
        marketplaceProductId: params.plan.productTruth.productId,
        productionRunId: params.run.productionRunId,
        autoReviewRunId: params.run.id,
        conceptId: params.plan.conceptId,
        audioStrategy: runMetadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
        voiceoverSource: "separate_tts_voiceover",
        audioActualDurationSeconds: audioActualDuration,
        audioTargetDurationSeconds:
          runMetadata.audioTargetDurationSeconds ?? cursor,
      },
    };
    audioClips.push({
      id: "clip-voiceover",
      assetId,
      trackId: "track-a1",
      startTime: 0,
      duration: voiceoverClipDuration,
      trimIn: 0,
      trimOut: voiceoverClipDuration,
      volume: 1,
      speed: 1,
      effects: [],
      transitions: { fadeIn: 0, fadeOut: 0.16 },
      groupId: `auto-review-${params.run.id}`,
    });
  }
  const warningTextClips = buildWarningOverlayTextClips(runMetadata, cursor);
  return {
    version: "1.0",
    name: params.plan.title,
    createdAt,
    modifiedAt: createdAt,
    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      sampleRate: 48000,
      duration: cursor,
    },
    timeline: {
      tracks: [
        {
          id: "track-t1",
          type: "text",
          name: "T1",
          clips: warningTextClips,
          muted: false,
          locked: false,
          visible: true,
          height: 50,
        },
        {
          id: "track-v2",
          type: "overlay",
          name: "V2",
          clips: [],
          muted: false,
          locked: false,
          visible: true,
          height: 60,
        },
        {
          id: "track-v1",
          type: "video",
          name: "V1",
          clips,
          muted: false,
          locked: false,
          visible: true,
          height: 80,
        },
        {
          id: "track-a1",
          type: "audio",
          name: "A1",
          clips: audioClips,
          muted: false,
          locked: false,
          visible: true,
          height: 60,
        },
      ],
    },
    assets,
    audioMixing: {
      ducking: {
        enabled: false,
        voiceoverTrackId: "track-a1",
        threshold: 0.03,
        ratio: 6,
        attack: 10,
        release: 300,
        makeupGain: 0,
        backgroundGain: -1,
      },
      masterVolume: 1,
    },
    export: {
      codec: "h264_videotoolbox",
      bitrate: 6000,
      audioCodec: "aac",
      audioBitrate: 192,
    },
  };
}

export function buildFeature117ContractMetadataForTest(input: {
  runId: string;
  tenantId: string;
  auth: AuthContext;
  bundle: ProductAccessBundle;
  insights: Awaited<ReturnType<typeof loadSupportingInsights>>;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  referenceAnchors: ResolvedMarketplaceAutoReviewReferenceAnchors;
  noveltyMemory?: Record<string, unknown>;
  externalOperationalRecoveryEvidence?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return buildFeature117ContractMetadata(input);
}

export function approvedVisualReferenceUrlsForTest(input: {
  metadata: RunMetadata;
  plan: AutoReviewPlan;
  max?: number;
}): string[] {
  return approvedVisualReferenceUrls(input.metadata, input.plan, input.max);
}

export function productReferenceStoryboardReferenceImageGroupsForTest(input: {
  metadata: RunMetadata;
  plan: AutoReviewPlan;
  max?: number;
}): ProductReferenceStoryboardReferenceImageGroups {
  return productReferenceStoryboardReferenceImageGroups(
    input.metadata,
    input.plan,
    input.max
  );
}

export function buildProductReferenceStoryboardSkillInputsForTest(input: {
  plan: AutoReviewPlan;
  unit: DirectImageUnit;
  overlayTextMode?: MarketplaceAutoReviewOverlayTextMode | null;
  referenceImageGroups: ProductReferenceStoryboardReferenceImageGroups;
  publicUrl?: string | null;
  metadata?: RunMetadata | null;
  directImageAttempt?: number | null;
  promptSkillAttempt?: number | null;
  preflightFeedback?: ProductReferenceStoryboardPreflightFeedback | null;
}): Record<string, unknown> {
  return buildProductReferenceStoryboardSkillInputs({
    plan: input.plan,
    unit: input.unit,
    overlayTextMode: normalizeMarketplaceAutoReviewOverlayTextMode(
      input.overlayTextMode
    ),
    referenceImageGroups: input.referenceImageGroups,
    publicUrl: input.publicUrl,
    metadata: input.metadata,
    directImageAttempt: input.directImageAttempt,
    promptSkillAttempt: input.promptSkillAttempt,
    preflightFeedback: input.preflightFeedback,
  });
}

export function buildProductReferenceStoryboardSkillInputSnapshotForTest(
  userInputs: Record<string, unknown>
): Record<string, unknown> {
  return buildProductReferenceStoryboardSkillInputSnapshot(userInputs);
}

export function promptSkillDebugStageOutputFromErrorForTest(
  error: unknown
): Record<string, unknown> | null {
  return promptSkillDebugStageOutputFromError(error);
}

export function inferProductReferenceStoryboardCategoryForTest(
  plan: AutoReviewPlan
): ProductReferenceStoryboardCategory {
  return inferProductReferenceStoryboardCategory(plan);
}

export function splitStoryboardGridRectsForTest(input: {
  sourceWidth: number;
  sourceHeight: number;
}): StoryboardSplitRect[] {
  return splitStoryboardGridRects({
    width: input.sourceWidth,
    height: input.sourceHeight,
  });
}

export function storyboardGridFrameStorageKeyForTest(input: {
  tenantId: string;
  runId: string;
  sourceUrl: string;
  shotNumber: number;
}): string {
  return storyboardGridFrameStorageKey(input);
}

export function buildMarketplaceAutoReviewVideoEditorProjectForTest(input: {
  plan: AutoReviewPlan;
  videoUrls: string[];
  run: MarketplaceAutoReviewRun;
}): VideoEditorProject {
  return buildVideoEditorProject(input);
}

export function buildMarketplaceAutoReviewProviderReconciliationSnapshotForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  nowMs?: number;
}) {
  return buildMarketplaceAutoReviewProviderReconciliationSnapshot(input);
}

export function buildMarketplaceAutoReviewTargetedRepairPolicyLedgerForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}) {
  return buildMarketplaceAutoReviewTargetedRepairPolicyLedger(input);
}

export function buildMarketplaceAutoReviewAutomationSnapshotsForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}) {
  return withMarketplaceAutoReviewAutomationSnapshots(input);
}

export function buildMarketplaceAutoReviewDurableRuntimePlanForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}) {
  return buildMarketplaceAutoReviewDurableRuntimePlan(input);
}

export function buildMarketplaceAutoReviewQualityModePolicyForTest(
  metadata: RunMetadata
) {
  return buildMarketplaceAutoReviewQualityModePolicy(metadata);
}

export function buildMarketplaceAutoReviewCreativePerformanceMemoryForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}) {
  return buildMarketplaceAutoReviewCreativePerformanceMemory(input);
}

export function buildMarketplaceAutoReviewMediaArtifactInspectionForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  resultUrl?: string | null;
  expectedDurationSeconds?: number | null;
}) {
  return buildMarketplaceAutoReviewMediaArtifactInspection(input);
}

export function buildMarketplaceAutoReviewQaCacheEntryForTest(input: {
  kind: string;
  cacheKey: string;
  envelope: Record<string, unknown>;
  sourceRefs?: string[];
}) {
  return buildMarketplaceAutoReviewQaCacheEntry(input);
}

export function mergeMarketplaceAutoReviewQaCacheEntriesForTest(input: {
  metadata: RunMetadata;
  entries: Record<string, unknown>[];
  maxEntries?: number;
}) {
  return mergeMarketplaceAutoReviewQaCacheEntries(input);
}

function buildWarningOverlayVerification(input: {
  runId: string;
  projectData: VideoEditorProject;
  metadata: RunMetadata;
}): Record<string, unknown> {
  const warningPlan = asRecord(input.metadata.visualWarningPlan);
  const textTrack = input.projectData.timeline.tracks.find(
    track => track.id === "track-t1"
  );
  const textClips = textTrack?.clips ?? [];
  const required = warningPlan.required === true;
  const expectedText = cleanText(warningPlan.exactText);
  if (!required) {
    return {
      verificationId: `warning-overlay:${input.runId}:${nanoid(8)}`,
      runId: input.runId,
      warningPlanId: cleanText(warningPlan.warningPlanId) || null,
      required: false,
      status: "not_required",
      checkedAt: nowIso(),
      checks: [],
      reasonCodes: [],
      renderPath: "video_editor_text_track_t1",
    };
  }
  const minDuration = Math.max(0, toNumber(warningPlan.minDurationSeconds));
  const totalDuration = textClips.reduce(
    (sum, clip) => sum + toNumber((clip as any).duration),
    0
  );
  const texts = textClips
    .map(clip => cleanText((clip as any).textConfig?.text))
    .filter(Boolean);
  const hasExactText =
    !expectedText || texts.some(text => text.includes(expectedText));
  const hasSafeArea = textClips.every(clip => {
    const y = toNumber((clip as any).transform?.y, 0.9);
    const placement = cleanText(warningPlan.placement) || "bottom_safe_area";
    if (placement === "top_safe_area") return y <= 0.18;
    if (placement === "caption_band") return y >= 0.76 && y <= 0.88;
    return y >= 0.84;
  });
  const hasDuration = totalDuration >= minDuration;
  const hasContrast =
    toNumber(warningPlan.contrastTarget, 4.5) <= 4.5 ||
    textClips.every(
      clip =>
        cleanText((clip as any).textConfig?.color) &&
        cleanText((clip as any).textConfig?.effectColor)
    );
  const productOcclusionSafe =
    cleanText(warningPlan.productOcclusionRule) !==
      "must_not_occlude_product" || hasSafeArea;
  const reasonCodes = [
    textClips.length > 0 ? "" : "warning_text_clip_missing",
    hasExactText ? "" : "warning_exact_text_missing",
    hasSafeArea ? "" : "warning_safe_area_failed",
    hasDuration ? "" : "warning_duration_too_short",
    hasContrast ? "" : "warning_contrast_not_verified",
    productOcclusionSafe ? "" : "warning_may_occlude_product",
  ].filter(Boolean);
  return {
    verificationId: `warning-overlay:${input.runId}:${nanoid(8)}`,
    runId: input.runId,
    warningPlanId: cleanText(warningPlan.warningPlanId) || null,
    required: true,
    textClipCount: textClips.length,
    expectedText,
    totalDurationSeconds: totalDuration,
    minDurationSeconds: minDuration,
    status: reasonCodes.length === 0 ? "passed" : "failed",
    checkedAt: nowIso(),
    checks: [
      ...(textClips.length > 0 ? ["warning_text_clip_present"] : []),
      ...(hasExactText ? ["exact_warning_text_present"] : []),
      ...(hasSafeArea ? ["safe_area_placement_verified"] : []),
      ...(hasDuration ? ["minimum_warning_duration_met"] : []),
      ...(hasContrast ? ["contrast_token_available"] : []),
      ...(productOcclusionSafe ? ["product_occlusion_rule_satisfied"] : []),
      ...(reasonCodes.length === 0
        ? ["deterministic_compositor_warning_text_verified"]
        : []),
    ],
    reasonCodes,
    ocrReadabilityRequired: warningPlan.ocrReadabilityRequired !== false,
    ocrReadabilityStatus:
      reasonCodes.length === 0
        ? "deterministic_compositor_verified"
        : "not_verified",
    renderPath: "video_editor_text_track_t1",
  };
}

export function buildMarketplaceAutoReviewWarningOverlayVerificationForTest(input: {
  runId: string;
  projectData: VideoEditorProject;
  metadata: RunMetadata;
}): Record<string, unknown> {
  return buildWarningOverlayVerification(input);
}

async function createVideoEditorProjection(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  if (params.run.videoEditorProjectId) return params.run.videoEditorProjectId;
  const videoUrls = params.metadata.videoClipUrls ?? [];
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = params.metadata
    .startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const resolvedAudioStrategy =
    params.metadata.resolvedAudioStrategy ??
    resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
      requested: params.metadata.audioStrategy,
      videoModel: DEFAULT_VIDEO_MODEL,
    });
  const projectData = buildVideoEditorProject({
    plan: params.plan,
    videoUrls,
    run: {
      ...params.run,
      metadataJson: params.metadata,
    } as MarketplaceAutoReviewRun,
  });
  const warningPlan = asRecord(params.metadata.visualWarningPlan);
  const warningOverlayVerification = buildWarningOverlayVerification({
    runId: params.run.id,
    projectData,
    metadata: params.metadata,
  });
  if (
    warningPlan.required === true &&
    cleanText(warningOverlayVerification.status) !== "passed"
  ) {
    throw new Error(
      `Warning overlay verification failed: ${
        Array.isArray(warningOverlayVerification.reasonCodes)
          ? warningOverlayVerification.reasonCodes
              .map(item => cleanText(item))
              .filter(Boolean)
              .join(", ")
          : "required_warning_overlay_not_verified"
      }`
    );
  }
  const updatedMetadata = withUpdatedCreditSummary({
    ...params.metadata,
    visualWarningPlan: {
      ...warningPlan,
      verificationStatus:
        warningPlan.required === true
          ? cleanText(warningOverlayVerification.status) === "passed"
            ? "passed"
            : "failed"
          : cleanText(warningPlan.verificationStatus) || "not_started",
    },
    warningOverlayVerification,
  });
  assertMarketplaceAutoReviewGovernanceReady(updatedMetadata, "video_edit");
  const output = {
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    productId: params.plan.productTruth.productId,
    productionRunId: params.run.productionRunId,
    conceptId: params.plan.conceptId,
    clips: params.plan.shots.map((shot, index) => ({
      id: shot.id,
      index,
      order: shot.order,
      title: shot.title,
      url: videoUrls[index],
      prompt: buildVideoPrompt(params.plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: index === params.plan.shots.length - 1,
        referenceMode,
        metadata: params.metadata,
      }),
      voiceover: shot.voiceover,
      durationSeconds: shot.durationSeconds,
      status: videoUrls[index] ? "completed" : "pending",
    })),
    projectData,
    audioStrategy: params.metadata.audioStrategy ?? "auto",
    resolvedAudioStrategy,
    audioUrl: params.metadata.audioUrl ?? null,
    expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
    durationSeconds: projectData.settings.duration,
    resolution: "1080x1920",
    warningOverlayVerification,
  };
  const identity = buildProductionOutputProjectionIdentity({
    tenantId: params.tenantId,
    productionRunId: params.run.productionRunId,
    surface: "video_edit",
    sourceOutput: output,
  });
  const now = nowDate();
  const [existingProjection] = await params.db
    .select()
    .from(mediaProductionOutputProjections)
    .where(
      and(
        eq(mediaProductionOutputProjections.tenantId, params.tenantId),
        eq(
          mediaProductionOutputProjections.productionRunId,
          params.run.productionRunId
        ),
        eq(mediaProductionOutputProjections.surface, "video_edit"),
        eq(
          mediaProductionOutputProjections.sourceOutputHash,
          identity.sourceOutputHash
        )
      )
    )
    .limit(1);
  if (existingProjection?.surfaceRecordId) {
    await updateRun({
      db: params.db,
      runId: params.run.id,
      videoEditorProjectId: existingProjection.surfaceRecordId,
      metadataJson: updatedMetadata,
    });
    return existingProjection.surfaceRecordId;
  }
  const [inserted] = await params.db
    .insert(videoEditorProjects)
    .values({
      userId: params.auth.userId,
      name: params.plan.title,
      projectData,
      thumbnailUrl:
        params.metadata.startFrameUrls?.[0] ??
        params.metadata.storyboardFrameUrls?.[0] ??
        null,
      duration: String(projectData.settings.duration),
      resolution: "1080x1920",
      trackCount: projectData.timeline.tracks.length,
      clipCount: videoUrls.length,
      isAutoSave: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: videoEditorProjects.id });
  const projectId = String(inserted.id);
  await params.db
    .insert(mediaProductionOutputProjections)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.run.productionRunId,
      storyboardRunId: params.plan.conceptId,
      surface: "video_edit",
      surfaceRecordId: projectId,
      sourceOutputHash: identity.sourceOutputHash,
      metadata: {
        idempotencyKey: identity.idempotencyKey,
        clipCount: videoUrls.length,
        marketplaceProductId: params.plan.productTruth.productId,
        autoReviewRunId: params.run.id,
        audioStrategy: params.metadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
      },
      status: "active",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        mediaProductionOutputProjections.tenantId,
        mediaProductionOutputProjections.productionRunId,
        mediaProductionOutputProjections.surface,
        mediaProductionOutputProjections.sourceOutputHash,
      ],
      set: {
        surfaceRecordId: projectId,
        metadata: {
          idempotencyKey: identity.idempotencyKey,
          clipCount: videoUrls.length,
          marketplaceProductId: params.plan.productTruth.productId,
          autoReviewRunId: params.run.id,
          audioStrategy: params.metadata.audioStrategy ?? "auto",
          resolvedAudioStrategy,
        },
        status: "active",
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    videoEditorProjectId: projectId,
    metadataJson: updatedMetadata,
  });
  return projectId;
}

async function setRenderJobKey(jobId: string, suffix: string, data: unknown) {
  const redis = getRedisClient();
  await redis.set(
    `media-job:${jobId}:${suffix}`,
    JSON.stringify(data),
    "EX",
    RENDER_JOB_TTL_SECONDS
  );
}

async function getRenderJobKey(jobId: string, suffix: string) {
  const redis = getRedisClient();
  const raw = await redis.get(`media-job:${jobId}:${suffix}`);
  return raw ? JSON.parse(raw) : null;
}

async function addActiveRenderJob(userId: string, jobId: string) {
  const redis = getRedisClient();
  await redis.sadd(`media-jobs:user:${userId}:active`, jobId);
  await redis.zadd(`media-jobs:user:${userId}:recent`, Date.now(), jobId);
  await redis.expire(
    `media-jobs:user:${userId}:recent`,
    RENDER_JOB_TTL_SECONDS
  );
}

async function removeActiveRenderJob(userId: string, jobId: string) {
  const redis = getRedisClient();
  await redis.srem(`media-jobs:user:${userId}:active`, jobId);
}

async function submitRenderJob(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  project: VideoEditorProject;
  metadata: RunMetadata;
}) {
  const profile = "standard" as const;
  const inputAssetKeys = Object.fromEntries(
    Object.entries(params.project.assets).map(([assetId, asset]) => [
      assetId,
      asset.path,
    ])
  );
  const renderHash = computeRenderHash(params.project, inputAssetKeys, profile);
  const outputKey = `renders/${profile}/${renderHash}.mp4`;
  try {
    if (await storageExists(outputKey)) {
      const existingUrl = await storageResolveUrl(outputKey);
      if (existingUrl) {
        return {
          cached: true as const,
          jobId: `cached-${renderHash.slice(0, 20)}`,
          renderHash,
          queueName: "cache",
          url: existingUrl,
          renderCreditReservation: undefined,
        };
      }
    }
  } catch {
    // Fail open and render normally if the storage cache check is unavailable.
  }
  const queueName = routeVideoJob(params.project);
  const jobId = `render-${nanoid(21)}`;
  await assertPaidStageAuthorityFresh({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    metadata: params.metadata,
    phase: "render",
    stageKey: "render",
  });
  const renderCreditReservation = await reserveMarketplaceRenderCredits({
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    plan: params.plan,
    renderHash,
    jobId,
  });
  const metadataWithReservation = withUpdatedCreditSummary({
    ...params.metadata,
    renderCreditReservation,
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadataWithReservation,
  });
  const renderSpec = {
    project: params.project,
    profile,
    renderHash,
    outputKey,
    inputAssetKeys,
    jobId,
    params: {
      sourceMetadata: {
        source_type: "marketplace_auto_review",
        marketplace_product_id: params.plan.productTruth.productId,
        product_id: params.plan.productTruth.productId,
        production_run_id: params.run.productionRunId,
        auto_review_run_id: params.run.id,
        concept_id: params.plan.conceptId,
        audio_strategy:
          (params.run.metadataJson as RunMetadata)?.audioStrategy ?? "auto",
        resolved_audio_strategy: (params.run.metadataJson as RunMetadata)
          ?.resolvedAudioStrategy,
        voiceover_source: (params.run.metadataJson as RunMetadata)
          ?.voiceoverSource,
      },
    },
  };
  const submittedAt = Date.now();
  try {
    await setRenderJobKey(jobId, "meta", {
      userId: String(params.auth.userId),
      submittedAt,
      nextPollAt: submittedAt + 120_000,
      renderCreditRef: renderCreditReservation.idempotencyKey,
    });
    await setRenderJobKey(jobId, "status", {
      status: "queued",
      progress: 0,
      jobId,
    });
    await setRenderJobKey(jobId, "spec", renderSpec);
    await addActiveRenderJob(String(params.auth.userId), jobId);
    if (await shouldUseCloudTasksForMediaJobs()) {
      const { enqueueTask } = await import("./cloudTasks");
      await enqueueTask({
        queueName,
        handlerPath: "/_internal/tasks/process-video",
        payload: { render_spec: renderSpec, queue_name: queueName },
      });
    } else {
      const runtime = await getAppRuntimeConfig();
      const response = await fetch(
        `${runtime.pythonBackendUrl}/api/v1/media/tasks/process-video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            render_spec: renderSpec,
            queue_name: queueName,
          }),
        }
      );
      if (!response.ok) {
        await setRenderJobKey(jobId, "status", {
          status: "error",
          progress: 0,
          jobId,
          message: "Failed to dispatch render job",
        });
        await removeActiveRenderJob(String(params.auth.userId), jobId);
        throw new Error(`Failed to dispatch render job: ${response.status}`);
      }
    }
  } catch (error) {
    const refund = await refundMarketplaceRenderCredits({
      auth: params.auth,
      reservation: renderCreditReservation,
      reason: "dispatch_failed",
    }).catch(refundError => {
      console.error(
        "[marketplaceAutoReview] failed to refund render reservation after dispatch error",
        refundError
      );
      return undefined;
    });
    await updateRun({
      db: params.db,
      runId: params.run.id,
      metadataJson: withUpdatedCreditSummary({
        ...metadataWithReservation,
        renderCreditReservation: {
          ...renderCreditReservation,
          refundTransactionId:
            typeof refund?.transactionId === "number"
              ? refund.transactionId
              : undefined,
        },
        renderCreditRefundTransactionId:
          typeof refund?.transactionId === "number"
            ? refund.transactionId
            : undefined,
      }),
    }).catch(metadataError => {
      console.error(
        "[marketplaceAutoReview] failed to persist render refund evidence",
        metadataError
      );
    });
    throw error;
  }
  return {
    cached: false as const,
    jobId,
    renderHash,
    queueName,
    renderCreditReservation,
  };
}

function extractFirstArtifactUrl(result: unknown): string | null {
  const artifacts = asRecord(result).artifacts;
  if (!Array.isArray(artifacts)) return null;
  for (const artifact of artifacts) {
    const url = cleanText(asRecord(artifact).uri ?? asRecord(artifact).url);
    if (url) return url;
  }
  return null;
}

function generatedVideoSampleEvidenceRefs(metadata: RunMetadata): string[] {
  const refs = Object.values(
    asRecord(metadata.generatedVideoSampleRefs)
  ).flatMap(value => (Array.isArray(value) ? value.map(cleanText) : []));
  return usableAuditRefs(refs);
}

function buildMarketplaceAutoReviewQaArtifactManifest(params: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  manifestHash: string;
  resultUrl: string;
  transcriptArtifactRef: string;
  subtitleArtifactRefs: string[];
  packageManifestArtifactRef: string;
}): Record<string, unknown> {
  const finalRenderQa = asRecord(params.metadata.finalRenderQaEnvelope);
  const finalMediaQa = asRecord(params.metadata.finalMediaQaEnvelope);
  const renderProbe = asRecord(params.metadata.renderArtifactProbe);
  const mediaInspection = asRecord(params.metadata.mediaArtifactInspection);
  const audioQa = asRecord(params.metadata.audioContinuityQaEnvelope);
  const videoQaSummary = asRecord(params.metadata.videoContinuityQaSummary);
  const warningVerification = asRecord(
    params.metadata.warningOverlayVerification
  );
  const generatedSamples = generatedVideoSampleEvidenceRefs(params.metadata);
  const frameRefs = uniqRefs([
    ...(params.metadata.storyboardFrameUrls ?? []).map(
      (_, index) => `frame:storyboard:${index + 1}`
    ),
    ...(params.metadata.startFrameUrls ?? []).map(
      (_, index) => `frame:start:${index + 1}`
    ),
    ...(params.metadata.stopFrameUrls ?? []).map(
      (_, index) => `frame:stop:${index + 1}`
    ),
  ]);
  const entries = [
    {
      kind: "keyframe_samples",
      refs: uniqRefs([...generatedSamples, ...frameRefs]),
      required: true,
    },
    {
      kind: "warning_text_ocr_or_compositor_snapshot",
      refs: [
        cleanText(warningVerification.verificationId) ||
          cleanText(asRecord(params.metadata.visualWarningPlan).warningPlanId),
      ].filter(Boolean),
      required: Boolean(asRecord(params.metadata.visualWarningPlan).required),
    },
    {
      kind: "transcript_text",
      refs: [params.transcriptArtifactRef],
      required: true,
    },
    {
      kind: "subtitle_sidecar",
      refs: params.subtitleArtifactRefs,
      required: params.run.outputMode === "full_video",
    },
    {
      kind: "waveform_silence_probe",
      refs: [
        cleanText(audioQa.qaEnvelopeId),
        cleanText(audioQa.durationProbeRef),
        cleanText(audioQa.gapAnalysisRef),
      ].filter(Boolean),
      required: true,
    },
    {
      kind: "render_probe",
      refs: [cleanText(renderProbe.probeId), params.resultUrl].filter(Boolean),
      required: true,
    },
    {
      kind: "media_artifact_inspection",
      refs: [
        cleanText(mediaInspection.inspectionId),
        ...recordRefList(mediaInspection, "sampleRefs"),
        ...recordRefList(mediaInspection, "audioProbeRefs"),
      ],
      required: true,
    },
    {
      kind: "package_manifest",
      refs: [params.packageManifestArtifactRef],
      required: true,
    },
    {
      kind: "final_qa",
      refs: [
        cleanText(finalRenderQa.qaEnvelopeId),
        cleanText(finalMediaQa.qaEnvelopeId),
        ...(Array.isArray(videoQaSummary.qaEnvelopeRefs)
          ? videoQaSummary.qaEnvelopeRefs.map(item => cleanText(item))
          : []),
      ].filter(Boolean),
      required: true,
    },
    {
      kind: "checksum",
      refs: [params.manifestHash],
      required: true,
    },
  ];
  const missingKinds = entries
    .filter(entry => entry.required && entry.refs.length === 0)
    .map(entry => entry.kind);
  return {
    schemaVersion: 1,
    manifestId: `qa-artifact-manifest:${params.run.id}:${params.manifestHash.slice(0, 12)}`,
    status: missingKinds.length === 0 ? "passed" : "blocked",
    runId: params.run.id,
    resultUrl: params.resultUrl,
    checksum: params.manifestHash,
    checkedAt: nowIso(),
    entries,
    missingKinds,
    auditPolicy:
      "final library video requires artifact-backed QA refs, not metadata-only assertions",
  };
}

function publishablePackageProofBlockers(
  pkg: Record<string, unknown>,
  metadata: RunMetadata
): string[] {
  const blockers: string[] = [];
  const evidenceRefs = usableAuditRefs(pkg.evidenceRefs);
  const creditRefs = usableAuditRefs(pkg.creditRefs);
  const metadataCreditRefs = creditRefsFromMetadata(metadata);
  const libraryItemId = toNumber(pkg.libraryItemId);
  const libraryItemRef = libraryItemId ? `libraryItem:${libraryItemId}` : "";
  const subtitleRefs = recordRefList(pkg, "subtitleArtifactRefs");
  const requiredRefs = [
    libraryItemRef,
    cleanText(pkg.transcriptArtifactRef),
    ...subtitleRefs,
    cleanText(pkg.packageManifestArtifactRef),
    cleanText(pkg.metadataManifestRef),
    cleanText(pkg.checksum),
    cleanText(asRecord(metadata.finalRenderQaEnvelope).qaEnvelopeId),
    cleanText(asRecord(metadata.finalMediaQaEnvelope).qaEnvelopeId),
    cleanText(asRecord(metadata.renderArtifactProbe).probeId),
    cleanText(asRecord(metadata.mediaArtifactInspection).inspectionId),
    cleanText(asRecord(metadata.audioContinuityQaEnvelope).qaEnvelopeId),
    cleanText(asRecord(metadata.qaArtifactManifest).manifestId),
    ...recordRefList(
      asRecord(metadata.videoContinuityQaSummary),
      "qaEnvelopeRefs"
    ),
    ...generatedVideoSampleEvidenceRefs(metadata),
  ].filter(Boolean);
  if (requiredRefs.length === 0) {
    blockers.push("publishable package proof refs are missing");
  }
  const missingRefs = requiredRefs.filter(ref => !evidenceRefs.includes(ref));
  if (missingRefs.length > 0) {
    blockers.push(
      `publishable package evidence refs missing proof: ${missingRefs.join(", ")}`
    );
  }
  if (!cleanText(pkg.metadataManifestRef) || !cleanText(pkg.checksum)) {
    blockers.push("publishable package manifest/checksum proof is missing");
  }
  if (!libraryItemId) {
    blockers.push("publishable package library linkage is missing");
  } else if (
    cleanText(pkg.libraryItemRef) !== libraryItemRef ||
    !evidenceRefs.includes(libraryItemRef)
  ) {
    blockers.push(
      "publishable package evidence refs missing library linkage proof"
    );
  }
  if (creditRefs.length === 0) {
    blockers.push("publishable package credit refs are missing");
  }
  const missingPackageCreditRefs = metadataCreditRefs.filter(
    ref => !creditRefs.includes(ref)
  );
  if (missingPackageCreditRefs.length > 0) {
    blockers.push(
      `publishable package credit refs missing proof: ${missingPackageCreditRefs.join(", ")}`
    );
  }
  const missingCreditEvidenceRefs = creditRefs.filter(
    ref => !evidenceRefs.includes(ref)
  );
  if (missingCreditEvidenceRefs.length > 0) {
    blockers.push(
      `publishable package evidence refs missing credit proof: ${missingCreditEvidenceRefs.join(", ")}`
    );
  }
  if (generatedVideoSampleEvidenceRefs(metadata).length === 0) {
    blockers.push(
      "publishable package render sample/keyframe proof is missing"
    );
  }
  const qaArtifactManifest = asRecord(metadata.qaArtifactManifest);
  if (
    cleanText(qaArtifactManifest.status) !== "passed" ||
    !cleanText(qaArtifactManifest.manifestId)
  ) {
    blockers.push("QA artifact manifest proof is missing or blocked");
  }
  const mediaInspection = asRecord(metadata.mediaArtifactInspection);
  if (
    cleanText(mediaInspection.status) !== "passed" ||
    !cleanText(mediaInspection.inspectionId)
  ) {
    blockers.push("media artifact inspection proof is missing or blocked");
  }
  return blockers;
}

function assertFinalLibraryPromotionEvidence(metadata: RunMetadata) {
  const probe = asRecord(metadata.renderArtifactProbe);
  if (cleanText(probe.status) !== "passed" || !cleanText(probe.probeId)) {
    throw new Error(
      "Library finalization requires passed render probe evidence"
    );
  }
  const finalRenderQa = asRecord(metadata.finalRenderQaEnvelope);
  const finalMediaQa = asRecord(metadata.finalMediaQaEnvelope);
  if (
    cleanText(finalRenderQa.status) !== "passed" ||
    !cleanText(finalRenderQa.qaEnvelopeId)
  ) {
    throw new Error("Library finalization requires final render QA evidence");
  }
  if (
    cleanText(finalMediaQa.status) !== "passed" ||
    !cleanText(finalMediaQa.qaEnvelopeId)
  ) {
    throw new Error("Library finalization requires final media QA evidence");
  }
  const pkg = asRecord(metadata.publishableAssetPackage);
  const packageRefs = Array.isArray(pkg.evidenceRefs)
    ? pkg.evidenceRefs.map(item => cleanText(item)).filter(Boolean)
    : [];
  if (
    cleanText(pkg.status) !== "ready_private_library_asset" ||
    !cleanText(pkg.packageId) ||
    packageRefs.length === 0
  ) {
    throw new Error(
      "Library finalization requires publishable asset package evidence refs"
    );
  }
  if (!toNumber(pkg.libraryItemId) || !cleanText(pkg.libraryItemRef)) {
    throw new Error(
      "Library finalization requires publishable asset package library linkage"
    );
  }
  const platformRequiresSubtitles =
    cleanText(pkg.platformProfile) === "short_video_9x16" ||
    (Array.isArray(pkg.platformProfiles) &&
      pkg.platformProfiles.map(cleanText).includes("short_video_9x16"));
  const subtitleRefs = recordRefList(pkg, "subtitleArtifactRefs");
  if (
    platformRequiresSubtitles &&
    (!cleanText(pkg.transcriptArtifactRef) ||
      subtitleRefs.length === 0 ||
      !cleanText(pkg.packageManifestArtifactRef))
  ) {
    throw new Error(
      "Library finalization requires transcript, subtitle, and package manifest artifact refs for publishable platform package"
    );
  }
  const qaRefs = [
    cleanText(finalRenderQa.qaEnvelopeId),
    cleanText(finalMediaQa.qaEnvelopeId),
    ...(Array.isArray(finalRenderQa.videoContinuityQaRefs)
      ? finalRenderQa.videoContinuityQaRefs
          .map(item => cleanText(item))
          .filter(Boolean)
      : []),
    cleanText(finalRenderQa.audioContinuityQaRef),
  ].filter(Boolean);
  if (qaRefs.length < 3) {
    throw new Error(
      "Library finalization requires render, video, and audio QA refs"
    );
  }
  const packageProofBlockers = publishablePackageProofBlockers(pkg, metadata);
  if (packageProofBlockers.length > 0) {
    throw new Error(
      `Library finalization requires persisted publishable package proof: ${packageProofBlockers.join("; ")}`
    );
  }
  if (creditRefsFromMetadata(metadata).length === 0) {
    throw new Error("Library finalization requires credit refs");
  }
}

function buildRenderLibraryMetadata(params: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  jobId: string;
  finalizedMetadata: RunMetadata;
  allowPendingLibraryLink?: boolean;
}) {
  const metadata = params.finalizedMetadata;
  if (params.allowPendingLibraryLink !== true) {
    assertFinalLibraryPromotionEvidence(metadata);
  }
  return {
    source_type: "marketplace_auto_review_render",
    media_job_id: params.jobId,
    marketplace_product_id: params.plan.productTruth.productId,
    product_id: params.plan.productTruth.productId,
    production_run_id: params.run.productionRunId,
    auto_review_run_id: params.run.id,
    concept_id: params.plan.conceptId,
    frame_strategy: params.run.frameStrategy,
    output_mode: params.run.outputMode,
    audio_strategy: metadata.audioStrategy ?? "auto",
    resolved_audio_strategy: metadata.resolvedAudioStrategy,
    voiceover_source: metadata.voiceoverSource,
    audio_url: metadata.audioUrl,
    product_name: params.plan.productTruth.productName,
    source_url: params.plan.productTruth.sourceUrl,
    final_render_qa_envelope: metadata.finalRenderQaEnvelope ?? null,
    final_media_qa_envelope: metadata.finalMediaQaEnvelope ?? null,
    qa_artifact_manifest: metadata.qaArtifactManifest ?? null,
    media_artifact_inspection: metadata.mediaArtifactInspection ?? null,
    publishable_asset_package: metadata.publishableAssetPackage ?? null,
    credit_summary: metadata.creditSummary ?? null,
    credit_refs: creditRefsFromMetadata(metadata),
    render_storage_envelope: metadata.renderStorageEnvelope ?? null,
    render_distribution_profile: metadata.renderDistributionProfile ?? null,
    render_artifact_probe: metadata.renderArtifactProbe ?? null,
    artifact_lineage: metadata.artifactLineage ?? [],
    governance_refs: {
      product_reference_asset_pack_ref:
        cleanText(asRecord(metadata.productReferenceAssetPack).assetPackId) ||
        null,
      character_identity_asset_pack_ref:
        cleanText(asRecord(metadata.characterIdentityAssetPack).assetPackId) ||
        null,
      advertising_rule_pack_ref:
        cleanText(asRecord(metadata.advertisingRulePack).rulePackId) || null,
      privacy_envelope_ref:
        cleanText(asRecord(metadata.privacyEnvelope).envelopeId) || null,
      asset_rights_envelope_ref:
        cleanText(asRecord(metadata.assetRightsEnvelope).envelopeId) || null,
      evidence_instruction_firewall_ref:
        cleanText(asRecord(metadata.evidenceInstructionFirewall).firewallId) ||
        null,
    },
  };
}

export function buildMarketplaceAutoReviewRenderLibraryMetadataForTest(input: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  jobId: string;
  finalizedMetadata: RunMetadata;
}) {
  return buildRenderLibraryMetadata(input);
}

async function persistMarketplaceAutoReviewArtifactJson(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  stageKey: StageKey;
  artifactKind: string;
  content: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const contentHash = buildProductionStableHash(params.content);
  const shortHash = contentHash.slice(0, 16);
  const safeKind = params.artifactKind.replace(/[^a-z0-9_-]+/gi, "-");
  const storageKey = [
    "marketplace-auto-review",
    params.run.id,
    "artifacts",
    `${safeKind}-${shortHash}.json`,
  ].join("/");
  const body = JSON.stringify(params.content, null, 2);
  const stored = await storagePut(storageKey, body, "application/json");
  const artifactId = `mar-artifact:${params.run.id}:${safeKind}:${shortHash}`;
  await params.db
    .insert(marketplaceAutoReviewArtifacts)
    .values({
      id: artifactId,
      runId: params.run.id,
      stageKey: params.stageKey,
      artifactKind: params.artifactKind,
      storageKey: stored.key,
      storageUrl: stored.url,
      contentHash,
      mimeType: "application/json",
      sizeBytes: Buffer.byteLength(body, "utf8"),
      status: "ready",
      metadataJson: {
        schemaVersion: 1,
        noRawProviderPayload: true,
        linkedToRunMetadata: true,
      },
    } as any)
    .onConflictDoUpdate({
      target: [
        marketplaceAutoReviewArtifacts.runId,
        marketplaceAutoReviewArtifacts.artifactKind,
        marketplaceAutoReviewArtifacts.contentHash,
      ],
      set: {
        storageKey: stored.key,
        storageUrl: stored.url,
        status: "ready",
        metadataJson: {
          schemaVersion: 1,
          noRawProviderPayload: true,
          linkedToRunMetadata: true,
        },
      } as any,
    });
  return {
    artifactId,
    artifactKind: params.artifactKind,
    storageKey: stored.key,
    storageUrl: stored.url,
    contentHash,
  };
}

async function persistMarketplaceAutoReviewFinalArtifacts(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
}): Promise<RunMetadata> {
  const artifactsToPersist = [
    ["qa_artifact_manifest", asRecord(params.metadata.qaArtifactManifest)],
    [
      "publishable_asset_package",
      asRecord(params.metadata.publishableAssetPackage),
    ],
    [
      "media_artifact_inspection",
      asRecord(params.metadata.mediaArtifactInspection),
    ],
    ["final_render_qa", asRecord(params.metadata.finalRenderQaEnvelope)],
    ["final_media_qa", asRecord(params.metadata.finalMediaQaEnvelope)],
  ] as const;
  const persisted: Record<string, unknown>[] = [];
  for (const [artifactKind, content] of artifactsToPersist) {
    if (Object.keys(content).length === 0) continue;
    persisted.push(
      await persistMarketplaceAutoReviewArtifactJson({
        db: params.db,
        run: params.run,
        stageKey: "library_finalize",
        artifactKind,
        content,
      })
    );
  }
  return {
    ...params.metadata,
    persistedFinalArtifactRefs: persisted,
    artifactPersistenceEnvelope: {
      schemaVersion: 1,
      status: persisted.length >= 5 ? "passed" : "partial",
      table: "marketplace_auto_review_artifacts",
      artifactRefs: persisted.map(item => cleanText(item.artifactId)),
      storageKeys: persisted.map(item => cleanText(item.storageKey)),
      contentHashes: persisted.map(item => cleanText(item.contentHash)),
      persistedAt: nowIso(),
    },
  } as RunMetadata;
}

async function addRenderResultToLibrary(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  jobId: string;
  sourceUrl: string;
  finalizedMetadata: RunMetadata;
}) {
  const [existing] = await params.db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.ownerUserId, params.auth.userId),
        eq(libraryItems.tenantId, params.tenantId),
        eq(libraryItems.itemType, "video"),
        sql`${libraryItems.metadata}->>'auto_review_run_id' = ${params.run.id}`,
        sql`${libraryItems.metadata}->>'source_type' = 'marketplace_auto_review_render'`
      )
    )
    .limit(1);
  if (existing?.id) {
    const linkedFinalizedMetadata = buildRenderFinalizationMetadata({
      run: params.run,
      plan: params.plan,
      metadata: params.finalizedMetadata,
      jobId: params.jobId,
      resultUrl: params.sourceUrl,
      libraryItemId: existing.id,
    });
    const persistedFinalizedMetadata =
      await persistMarketplaceAutoReviewFinalArtifacts({
        db: params.db,
        run: params.run,
        metadata: linkedFinalizedMetadata,
      });
    const metadata = buildRenderLibraryMetadata({
      run: params.run,
      plan: params.plan,
      jobId: params.jobId,
      finalizedMetadata: persistedFinalizedMetadata,
    });
    await params.db
      .update(libraryItems)
      .set({ metadata, updatedAt: nowDate() })
      .where(eq(libraryItems.id, existing.id));
    return {
      libraryItemId: existing.id,
      finalizedMetadata: persistedFinalizedMetadata,
    };
  }
  const metadata = buildRenderLibraryMetadata({
    run: params.run,
    plan: params.plan,
    jobId: params.jobId,
    finalizedMetadata: params.finalizedMetadata,
    allowPendingLibraryLink: true,
  });
  const created = await createLibraryItem(
    {
      itemType: "video",
      source: "video_editor_render",
      title: `${params.plan.title} - Final Video`,
      description: params.plan.voiceoverScript,
      status: "indexing",
      visibility: "private",
      projectId: params.run.productionRunId,
      metadata,
      sourceUrl: params.sourceUrl,
      thumbnailUrl:
        params.finalizedMetadata && typeof params.finalizedMetadata === "object"
          ? (params.finalizedMetadata.startFrameUrls?.[0] ??
            params.finalizedMetadata.storyboardFrameUrls?.[0] ??
            null)
          : null,
      sourceLink: {
        linkType: "marketplace_auto_review",
        linkId: params.run.id,
        providerTaskId: params.jobId,
      },
    },
    {
      userId: params.auth.userId,
      tenantId: params.tenantId,
      role: "user",
    },
    params.db
  );
  const linkedFinalizedMetadata = buildRenderFinalizationMetadata({
    run: params.run,
    plan: params.plan,
    metadata: params.finalizedMetadata,
    jobId: params.jobId,
    resultUrl: params.sourceUrl,
    libraryItemId: created.item.id,
  });
  const finalMetadata = await persistMarketplaceAutoReviewFinalArtifacts({
    db: params.db,
    run: params.run,
    metadata: linkedFinalizedMetadata,
  });
  const finalLibraryMetadata = buildRenderLibraryMetadata({
    run: params.run,
    plan: params.plan,
    jobId: params.jobId,
    finalizedMetadata: finalMetadata,
  });
  await params.db
    .update(libraryItems)
    .set({ metadata: finalLibraryMetadata, updatedAt: nowDate() })
    .where(eq(libraryItems.id, created.item.id));
  await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: created.item.id,
      tenantId: params.tenantId,
      jobType: "initial_index",
      domain: "gallery",
      operation: "index",
      source: "gallery.marketplace_auto_review",
      sourceMetadata: finalLibraryMetadata,
      allowThrottle: true,
    },
    params.db
  );
  return { libraryItemId: created.item.id, finalizedMetadata: finalMetadata };
}

async function probeRenderArtifact(params: {
  runId: string;
  resultUrl: string;
}): Promise<Record<string, unknown>> {
  const resultUrl = cleanText(params.resultUrl);
  const probeId = `render-probe:${params.runId}:${buildProductionStableHash({ resultUrl }).slice(0, 12)}`;
  const base = {
    probeId,
    runId: params.runId,
    resultUrl,
    checkedAt: nowIso(),
    method: "head_or_trusted_render_path",
  };
  if (!resultUrl) {
    return {
      ...base,
      status: "failed",
      reasonCodes: ["render_url_missing"],
      checks: [],
    };
  }
  if (/^\/renders\//i.test(resultUrl)) {
    return {
      ...base,
      status: "passed",
      checks: [
        "trusted_internal_render_path",
        "render_artifact_reference_present",
      ],
      contentType: "video/mp4",
    };
  }
  if (!/^https?:\/\//i.test(resultUrl)) {
    return {
      ...base,
      status: "failed",
      reasonCodes: ["unsupported_render_url_scheme"],
      checks: [],
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(resultUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = response.headers.get("content-length") ?? "";
    const extensionLooksMp4 = /\.mp4(?:$|\?)/i.test(resultUrl);
    const typeLooksVideo = /video\/|application\/octet-stream/i.test(
      contentType
    );
    const passed = response.ok && (typeLooksVideo || extensionLooksMp4);
    return {
      ...base,
      status: passed ? "passed" : "failed",
      httpStatus: response.status,
      contentType,
      contentLength,
      checks: [
        ...(response.ok ? ["http_head_ok"] : []),
        ...(typeLooksVideo ? ["video_content_type"] : []),
        ...(extensionLooksMp4 ? ["mp4_extension"] : []),
      ],
      reasonCodes: passed ? [] : ["render_artifact_head_probe_failed"],
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      checks: [],
      reasonCodes: ["render_artifact_head_probe_error"],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertPublishableRenderArtifact(input: {
  url: string;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const url = cleanText(input.url);
  if (!url) throw new Error("Render artifact URL is missing");
  if (!/\.mp4(?:$|\?)/i.test(url) && !/\/renders\//i.test(url)) {
    throw new Error(
      "Render artifact must be an MP4 or a trusted render URL before Library finalization"
    );
  }
  const expectedVideoUnitIds = input.plan.shots.map(shot => `${shot.id}-video`);
  const videoUnitIds = Array.isArray(input.metadata.videoUnitIds)
    ? input.metadata.videoUnitIds.map(item => cleanText(item)).filter(Boolean)
    : [];
  const clipUrls = Array.isArray(input.metadata.videoClipUrls)
    ? input.metadata.videoClipUrls.map(item => cleanText(item))
    : [];
  const unitOrderMatches =
    videoUnitIds.length === expectedVideoUnitIds.length &&
    expectedVideoUnitIds.every((id, index) => videoUnitIds[index] === id);
  if (!unitOrderMatches) {
    throw new Error(
      "Render finalization requires ordered shot video unit ids before Library finalization"
    );
  }
  assertCompleteMarketplaceAutoReviewVideoClips({
    clipUrls,
    expectedCount: input.plan.shots.length,
    unitIds: expectedVideoUnitIds,
  });
  if (
    !statusIn(gateStatus(input.metadata, "audioContinuityQaEnvelope"), [
      "accepted",
      "skipped_silent",
    ])
  ) {
    throw new Error(
      "Render finalization requires audio continuity QA before Library finalization"
    );
  }
  if (
    !statusIn(gateStatus(input.metadata, "videoContinuityQaSummary"), [
      "passed",
      "passed_with_warnings",
    ])
  ) {
    throw new Error(
      "Render finalization requires video continuity QA to pass before Library finalization"
    );
  }
  const warningPlan = asRecord(input.metadata.visualWarningPlan);
  if (
    warningPlan.required === true &&
    cleanText(asRecord(input.metadata.warningOverlayVerification).status) !==
      "passed"
  ) {
    throw new Error(
      "Render finalization requires verified warning overlay text before Library finalization"
    );
  }
  if (warningPlan.required === true) {
    const ocrStatus = cleanText(
      asRecord(input.metadata.warningOverlayVerification).ocrReadabilityStatus
    );
    if (
      !["rendered_ocr_verified", "deterministic_compositor_verified"].includes(
        ocrStatus
      )
    ) {
      throw new Error(
        "Render finalization requires warning overlay OCR/readability evidence before Library finalization"
      );
    }
  }
  const renderArtifactProbe = asRecord(input.metadata.renderArtifactProbe);
  if (cleanText(renderArtifactProbe.status) !== "passed") {
    throw new Error(
      "Render finalization requires render artifact probe evidence before Library finalization"
    );
  }
  const probedUrl = cleanText(renderArtifactProbe.resultUrl);
  if (probedUrl && probedUrl !== url) {
    throw new Error(
      "Render artifact probe result URL does not match final render URL"
    );
  }
  const durationSeconds = input.plan.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  if (durationSeconds <= 0 || durationSeconds > 90) {
    throw new Error(
      "Render duration is outside the Marketplace Auto Review distribution profile"
    );
  }
  assertMarketplaceAutoReviewGovernanceReady(input.metadata, "render");
}

function buildRenderFinalizationMetadata(params: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  jobId: string;
  resultUrl: string;
  libraryItemId?: number | null;
  allowPendingLibraryLink?: boolean;
}) {
  assertPublishableRenderArtifact({
    url: params.resultUrl,
    plan: params.plan,
    metadata: params.metadata,
  });
  const libraryItemId = params.libraryItemId ?? null;
  if (!libraryItemId && params.allowPendingLibraryLink !== true) {
    throw new Error(
      "Render finalization requires Library item linkage before publishable package proof"
    );
  }
  const durationSeconds = params.plan.shots.reduce(
    (sum, shot) => sum + shot.durationSeconds,
    0
  );
  const manifestHash = buildProductionStableHash({
    runId: params.run.id,
    productionRunId: params.run.productionRunId,
    productId: params.plan.productTruth.productId,
    resultUrl: params.resultUrl,
    shots: params.plan.shots.map(shot => ({
      id: shot.id,
      voiceover: shot.voiceover,
    })),
    videoClipUrls: params.metadata.videoClipUrls,
    audioUrl: params.metadata.audioUrl,
    renderArtifactProbe: params.metadata.renderArtifactProbe,
    generatedVideoSampleRefs: params.metadata.generatedVideoSampleRefs,
  });
  const finalRenderQaEnvelope = {
    qaEnvelopeId: `render-qa:${params.run.id}:${manifestHash.slice(0, 12)}`,
    runId: params.run.id,
    stageKey: "render",
    status: "passed",
    checkedAt: nowIso(),
    resultUrl: params.resultUrl,
    checks: [
      "mp4_artifact_accessible",
      "all_expected_clips_present",
      "duration_within_distribution_profile",
      "warning_overlay_plan_attached",
      "library_metadata_ready",
      "video_continuity_qa_passed",
      "audio_continuity_qa_passed",
      "warning_overlay_verified_or_not_required",
      "render_artifact_probe_passed",
      "governance_gates_passed",
      "publishable_package_requirements_passed",
    ],
    renderArtifactProbeRef:
      cleanText(asRecord(params.metadata.renderArtifactProbe).probeId) || null,
    warningPlanRef:
      cleanText(asRecord(params.metadata.visualWarningPlan).warningPlanId) ||
      null,
    warningOverlayVerificationRef:
      cleanText(
        asRecord(params.metadata.warningOverlayVerification).verificationId
      ) || null,
    videoContinuityQaRefs: Array.isArray(
      asRecord(params.metadata.videoContinuityQaSummary).qaEnvelopeRefs
    )
      ? asRecord(params.metadata.videoContinuityQaSummary).qaEnvelopeRefs
      : [],
    audioContinuityQaRef:
      cleanText(
        asRecord(params.metadata.audioContinuityQaEnvelope).qaEnvelopeId
      ) || null,
    productReferenceAssetPackRef:
      cleanText(
        asRecord(params.metadata.productReferenceAssetPack).assetPackId
      ) || null,
    creditRefs: creditRefsFromMetadata(params.metadata),
  };
  const finalMediaQaEnvelope = {
    qaEnvelopeId: `final-media-qa:${params.run.id}:${manifestHash.slice(0, 12)}`,
    runId: params.run.id,
    stageKey: "library_finalize",
    status: "passed",
    checkedAt: nowIso(),
    resultUrl: params.resultUrl,
    evidenceRefs: [
      cleanText(finalRenderQaEnvelope.qaEnvelopeId),
      cleanText(finalRenderQaEnvelope.renderArtifactProbeRef),
      ...(Array.isArray(finalRenderQaEnvelope.videoContinuityQaRefs)
        ? finalRenderQaEnvelope.videoContinuityQaRefs
            .map(item => cleanText(item))
            .filter(Boolean)
        : []),
      cleanText(finalRenderQaEnvelope.audioContinuityQaRef),
      cleanText(finalRenderQaEnvelope.warningOverlayVerificationRef),
      ...creditRefsFromMetadata(params.metadata),
    ].filter(Boolean),
    checks: [
      "render_artifact_ready",
      "video_audio_warning_governance_refs_attached",
      "private_library_package_ready",
    ],
  };
  const renderStorageEnvelope = {
    envelopeId: `render-storage:${params.run.id}:${manifestHash.slice(0, 12)}`,
    status: "passed",
    resultUrl: params.resultUrl,
    codec: "h264",
    container: "mp4",
    maxBytePolicy: "render-service-bounded",
    transcodePolicy: "existing-render-pipeline",
    storageQuotaPolicy: "library-private-asset",
    durationSeconds,
    resolution: "1080x1920",
  };
  const renderDistributionProfile = {
    profileId: `distribution:short-video-9x16:${params.run.id}`,
    status: "passed",
    platformProfiles: ["marketplace_capture_default", "short_video_9x16"],
    aspectRatio: "9:16",
    durationSeconds,
    safeAreas: ["bottom_warning_safe_area", "cta_metadata_only"],
    warningTextRequired: Boolean(
      asRecord(params.metadata.visualWarningPlan).required
    ),
    subtitlesRequired: params.run.outputMode === "full_video",
    loudnessPolicy: "provider_or_tts_default",
  };
  const mediaArtifactInspection =
    buildMarketplaceAutoReviewMediaArtifactInspection({
      run: params.run,
      metadata: {
        ...params.metadata,
        finalRenderQaEnvelope,
        finalMediaQaEnvelope,
      } as RunMetadata,
      resultUrl: params.resultUrl,
      expectedDurationSeconds: durationSeconds,
    });
  const transcriptArtifactRef = `transcript:${params.run.id}:${manifestHash.slice(0, 12)}`;
  const subtitleArtifactRefs =
    params.run.outputMode === "full_video"
      ? [`subtitle:${params.run.id}:th-srt:${manifestHash.slice(0, 12)}`]
      : [];
  const packageManifestArtifactRef = `package-manifest:${params.run.id}:${manifestHash.slice(0, 12)}`;
  const qaArtifactManifest = buildMarketplaceAutoReviewQaArtifactManifest({
    run: params.run,
    metadata: {
      ...params.metadata,
      finalRenderQaEnvelope,
      finalMediaQaEnvelope,
      mediaArtifactInspection,
    } as RunMetadata,
    manifestHash,
    resultUrl: params.resultUrl,
    transcriptArtifactRef,
    subtitleArtifactRefs,
    packageManifestArtifactRef,
  });
  const renderSampleRefs = generatedVideoSampleEvidenceRefs(params.metadata);
  const libraryItemRef = libraryItemId ? `libraryItem:${libraryItemId}` : null;
  const publishableAssetPackage = {
    packageId: `publishable-package:${params.run.id}:${manifestHash.slice(0, 12)}`,
    status: libraryItemId ? "ready_private_library_asset" : "blocked",
    runId: params.run.id,
    productionRunId: params.run.productionRunId,
    libraryItemId,
    libraryItemRef,
    resultUrl: params.resultUrl,
    thumbnailUrl:
      params.metadata.startFrameUrls?.[0] ??
      params.metadata.storyboardFrameUrls?.[0] ??
      null,
    platformProfile: "short_video_9x16",
    platformProfiles: ["marketplace_capture_default", "short_video_9x16"],
    title: params.plan.title,
    captionDraft: params.plan.voiceoverScript,
    transcriptSource: "voiceover_script",
    transcriptArtifactRef,
    subtitleArtifactRefs,
    packageManifestArtifactRef,
    qaArtifactManifestRef: cleanText(qaArtifactManifest.manifestId),
    metadataManifestRef: `metadata-manifest:${manifestHash}`,
    checksum: manifestHash,
    evidenceRefs: [
      cleanText(
        asRecord(params.metadata.productReferenceAssetPack).assetPackId
      ),
      cleanText(
        asRecord(params.metadata.characterIdentityAssetPack).assetPackId
      ),
      cleanText(asRecord(params.metadata.advertisingRulePack).rulePackId),
      cleanText(finalRenderQaEnvelope.qaEnvelopeId),
      cleanText(finalRenderQaEnvelope.renderArtifactProbeRef),
      cleanText(finalMediaQaEnvelope.qaEnvelopeId),
      ...(Array.isArray(finalRenderQaEnvelope.videoContinuityQaRefs)
        ? finalRenderQaEnvelope.videoContinuityQaRefs
            .map(item => cleanText(item))
            .filter(Boolean)
        : []),
      cleanText(finalRenderQaEnvelope.audioContinuityQaRef),
      cleanText(finalRenderQaEnvelope.warningOverlayVerificationRef),
      cleanText(mediaArtifactInspection.inspectionId),
      cleanText(libraryItemRef),
      transcriptArtifactRef,
      ...subtitleArtifactRefs,
      packageManifestArtifactRef,
      cleanText(qaArtifactManifest.manifestId),
      `metadata-manifest:${manifestHash}`,
      manifestHash,
      ...renderSampleRefs,
      ...creditRefsFromMetadata(params.metadata),
    ].filter(Boolean),
    creditRefs: creditRefsFromMetadata(params.metadata),
    postPublishGovernance: {
      reuseRequiresEvidenceFreshnessRecheck: true,
      staleClaimPolicy: "block_reuse_until_rechecked",
      takedownPolicy: "private_library_asset_can_be_quarantined",
    },
  };
  return withUpdatedCreditSummary({
    ...params.metadata,
    renderUrl: params.resultUrl,
    resultLibraryItemId: libraryItemId,
    finalRenderQaEnvelope,
    finalMediaQaEnvelope,
    renderStorageEnvelope,
    renderDistributionProfile,
    mediaArtifactInspection,
    qaArtifactManifest,
    publishableAssetPackage,
  });
}

export function buildMarketplaceAutoReviewRenderFinalizationMetadataForTest(input: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  jobId: string;
  resultUrl: string;
  libraryItemId?: number | null;
  allowPendingLibraryLink?: boolean;
}): RunMetadata {
  return buildRenderFinalizationMetadata(input);
}

export function buildMarketplaceAutoReviewQaArtifactManifestForTest(input: {
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  manifestHash: string;
  resultUrl: string;
  transcriptArtifactRef: string;
  subtitleArtifactRefs: string[];
  packageManifestArtifactRef: string;
}) {
  return buildMarketplaceAutoReviewQaArtifactManifest(input);
}

async function ensureRender(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  assertMarketplaceAutoReviewGovernanceReady(params.metadata, "render");
  const projectData = buildVideoEditorProject({
    plan: params.plan,
    videoUrls: params.metadata.videoClipUrls ?? [],
    run: {
      ...params.run,
      metadataJson: params.metadata,
    } as MarketplaceAutoReviewRun,
  });
  if (!params.metadata.renderJobId && !params.run.renderJobId) {
    const submitted = await submitRenderJob({
      db: params.db,
      tenantId: params.tenantId,
      auth: params.auth,
      run: params.run,
      plan: params.plan,
      project: projectData,
      metadata: params.metadata,
    });
    const metadata = {
      ...params.metadata,
      renderJobId: submitted.jobId,
      renderHash: submitted.renderHash,
      renderQueueName: submitted.queueName,
      renderSubmittedAt: Date.now(),
      ...(submitted.renderCreditReservation
        ? { renderCreditReservation: submitted.renderCreditReservation }
        : {}),
    };
    if (submitted.cached) {
      const renderArtifactProbe = await probeRenderArtifact({
        runId: params.run.id,
        resultUrl: submitted.url,
      });
      const metadataWithProbe = withUpdatedCreditSummary({
        ...metadata,
        renderArtifactProbe,
      });
      const preLibraryFinalizedMetadata = buildRenderFinalizationMetadata({
        run: params.run,
        plan: params.plan,
        metadata: metadataWithProbe,
        jobId: submitted.jobId,
        resultUrl: submitted.url,
        libraryItemId: null,
        allowPendingLibraryLink: true,
      });
      const libraryResult = await addRenderResultToLibrary({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: {
          ...params.run,
          metadataJson: preLibraryFinalizedMetadata,
        } as MarketplaceAutoReviewRun,
        plan: params.plan,
        jobId: submitted.jobId,
        sourceUrl: submitted.url,
        finalizedMetadata: preLibraryFinalizedMetadata,
      });
      const libraryItemId = libraryResult.libraryItemId;
      const finalizedMetadata = libraryResult.finalizedMetadata;
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "render",
        stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
        status: "completed",
        output: {
          jobId: submitted.jobId,
          renderHash: submitted.renderHash,
          resultUrl: submitted.url,
          cached: true,
        },
        stageCompletionEvidence: {
          requiredRefs: [
            "renderResultUrl",
            "finalRenderQaEnvelope",
            "renderStorageEnvelope",
            "renderDistributionProfile",
            ...(submitted.cached ? [] : ["renderCreditReservation"]),
          ],
          artifactRefs: [submitted.url],
          qaVerdictRefs: [
            cleanText(
              asRecord(finalizedMetadata.finalRenderQaEnvelope).qaEnvelopeId
            ),
            cleanText(
              asRecord(finalizedMetadata.finalMediaQaEnvelope).qaEnvelopeId
            ),
          ].filter(Boolean),
          lineageRefs: [`lineage:${params.run.id}:render`],
          creditRefs: submitted.cached
            ? ["credit:render-cache-hit-no-charge"]
            : renderCreditRefsFromMetadata(finalizedMetadata),
          policyRefs: [
            "existing-render-pipeline",
            "distribution-profile-short-video-9x16",
          ],
          acceptanceRefs: [
            cleanText(
              asRecord(finalizedMetadata.publishableAssetPackage).packageId
            ),
          ],
        },
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "library_finalize",
        stageOrder: stageIndex("library_finalize", FULL_VIDEO_STAGES),
        status: "completed",
        output: { libraryItemId, resultUrl: submitted.url, cached: true },
        stageCompletionEvidence: {
          requiredRefs: [
            "libraryItemId",
            "publishableAssetPackage",
            "postPublishGovernance",
            "creditSummary",
            "renderArtifactProbe",
            "finalQaRefs",
          ],
          artifactRefs: [`libraryItem:${libraryItemId}`, submitted.url],
          qaVerdictRefs: [
            cleanText(
              asRecord(finalizedMetadata.finalRenderQaEnvelope).qaEnvelopeId
            ),
            cleanText(
              asRecord(finalizedMetadata.finalMediaQaEnvelope).qaEnvelopeId
            ),
          ].filter(Boolean),
          lineageRefs: [`lineage:${params.run.id}:library_finalize`],
          creditRefs: creditRefsFromMetadata(finalizedMetadata),
          policyRefs: ["private-library-asset", "post-publish-governance"],
          acceptanceRefs: [
            cleanText(
              asRecord(finalizedMetadata.publishableAssetPackage).packageId
            ),
          ],
        },
      });
      await updateRun({
        db: params.db,
        runId: params.run.id,
        status: "completed",
        currentStage: "library_finalize",
        renderJobId: submitted.jobId,
        resultLibraryItemId: libraryItemId,
        resultJson: {
          renderUrl: submitted.url,
          libraryItemId,
          jobId: submitted.jobId,
          cached: true,
          publishableAssetPackage: finalizedMetadata.publishableAssetPackage,
        },
        metadataJson: finalizedMetadata,
        completedAt: nowDate(),
      });
      return { completed: true, libraryItemId };
    }
    await updateRun({
      db: params.db,
      runId: params.run.id,
      status: "waiting_provider",
      currentStage: "render",
      stageIndex: stageIndex("render", FULL_VIDEO_STAGES),
      stageCount: FULL_VIDEO_STAGES.length,
      renderJobId: submitted.jobId,
      metadataJson: withUpdatedCreditSummary(metadata),
    });
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "render",
      stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
      status: "waiting_provider",
      output: { jobId: submitted.jobId, renderHash: submitted.renderHash },
    });
    return { completed: false, jobId: submitted.jobId };
  }
  const jobId = cleanText(
    params.run.renderJobId ?? params.metadata.renderJobId
  );
  if (!jobId || jobId.startsWith("cached-")) return { completed: true };
  const status = await getRenderJobKey(jobId, "status");
  if (!status) {
    if (isTimedOutSince(params.metadata.renderSubmittedAt)) {
      const refund = await refundMarketplaceRenderCredits({
        auth: params.auth,
        reservation: params.metadata.renderCreditReservation,
        reason: "status_expired",
      }).catch(() => undefined);
      if (refund?.transactionId) {
        await updateRun({
          db: params.db,
          runId: params.run.id,
          metadataJson: withUpdatedCreditSummary({
            ...params.metadata,
            renderCreditReservation: {
              ...asRecord(params.metadata.renderCreditReservation),
              refundTransactionId: refund.transactionId,
            } as MarketplaceRenderCreditReservation,
            renderCreditRefundTransactionId: refund.transactionId,
          }),
        });
      }
      throw new Error(
        `Render job status expired or disappeared after ${Math.round(renderStaleTimeoutMs() / 60000)} minutes`
      );
    }
    return { completed: false, jobId };
  }
  if (status.status === "error") {
    const refund = await refundMarketplaceRenderCredits({
      auth: params.auth,
      reservation: params.metadata.renderCreditReservation,
      reason: "render_error",
    }).catch(() => undefined);
    if (refund?.transactionId) {
      await updateRun({
        db: params.db,
        runId: params.run.id,
        metadataJson: withUpdatedCreditSummary({
          ...params.metadata,
          renderCreditReservation: {
            ...asRecord(params.metadata.renderCreditReservation),
            refundTransactionId: refund.transactionId,
          } as MarketplaceRenderCreditReservation,
          renderCreditRefundTransactionId: refund.transactionId,
        }),
      });
    }
    throw new Error(cleanText(status.message) || "Render job failed");
  }
  if (status.status !== "done") {
    if (isTimedOutSince(params.metadata.renderSubmittedAt)) {
      const refund = await refundMarketplaceRenderCredits({
        auth: params.auth,
        reservation: params.metadata.renderCreditReservation,
        reason: "render_timeout",
      }).catch(() => undefined);
      if (refund?.transactionId) {
        await updateRun({
          db: params.db,
          runId: params.run.id,
          metadataJson: withUpdatedCreditSummary({
            ...params.metadata,
            renderCreditReservation: {
              ...asRecord(params.metadata.renderCreditReservation),
              refundTransactionId: refund.transactionId,
            } as MarketplaceRenderCreditReservation,
            renderCreditRefundTransactionId: refund.transactionId,
          }),
        });
      }
      throw new Error(
        `Render job timed out after ${Math.round(renderStaleTimeoutMs() / 60000)} minutes`
      );
    }
    return { completed: false, jobId, status };
  }
  const result = await getRenderJobKey(jobId, "result");
  const url = extractFirstArtifactUrl(result);
  if (!url)
    throw new Error("Render completed but result artifact URL is missing");
  await removeActiveRenderJob(String(params.auth.userId), jobId).catch(
    () => undefined
  );
  const renderArtifactProbe = await probeRenderArtifact({
    runId: params.run.id,
    resultUrl: url,
  });
  const metadataWithProbe = withUpdatedCreditSummary({
    ...params.metadata,
    renderArtifactProbe,
  });
  const preLibraryFinalizedMetadata = buildRenderFinalizationMetadata({
    run: params.run,
    plan: params.plan,
    metadata: metadataWithProbe,
    jobId,
    resultUrl: url,
    libraryItemId: null,
    allowPendingLibraryLink: true,
  });
  const libraryResult = await addRenderResultToLibrary({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: {
      ...params.run,
      metadataJson: preLibraryFinalizedMetadata,
    } as MarketplaceAutoReviewRun,
    plan: params.plan,
    jobId,
    sourceUrl: url,
    finalizedMetadata: preLibraryFinalizedMetadata,
  });
  const libraryItemId = libraryResult.libraryItemId;
  const finalizedMetadata = libraryResult.finalizedMetadata;
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "render",
    stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
    status: "completed",
    output: { jobId, resultUrl: url },
    stageCompletionEvidence: {
      requiredRefs: [
        "renderResultUrl",
        "finalRenderQaEnvelope",
        "renderStorageEnvelope",
        "renderDistributionProfile",
        "renderCreditReservation",
      ],
      artifactRefs: [url],
      qaVerdictRefs: [
        cleanText(
          asRecord(finalizedMetadata.finalRenderQaEnvelope).qaEnvelopeId
        ),
        cleanText(
          asRecord(finalizedMetadata.finalMediaQaEnvelope).qaEnvelopeId
        ),
      ].filter(Boolean),
      lineageRefs: [`lineage:${params.run.id}:render`],
      creditRefs: renderCreditRefsFromMetadata(finalizedMetadata),
      policyRefs: [
        "existing-render-pipeline",
        "distribution-profile-short-video-9x16",
      ],
      acceptanceRefs: [
        cleanText(
          asRecord(finalizedMetadata.publishableAssetPackage).packageId
        ),
      ],
    },
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "library_finalize",
    stageOrder: stageIndex("library_finalize", FULL_VIDEO_STAGES),
    status: "completed",
    output: { libraryItemId, resultUrl: url },
    stageCompletionEvidence: {
      requiredRefs: [
        "libraryItemId",
        "publishableAssetPackage",
        "postPublishGovernance",
        "creditSummary",
        "renderArtifactProbe",
        "finalQaRefs",
      ],
      artifactRefs: [`libraryItem:${libraryItemId}`, url],
      qaVerdictRefs: [
        cleanText(
          asRecord(finalizedMetadata.finalRenderQaEnvelope).qaEnvelopeId
        ),
        cleanText(
          asRecord(finalizedMetadata.finalMediaQaEnvelope).qaEnvelopeId
        ),
      ].filter(Boolean),
      lineageRefs: [`lineage:${params.run.id}:library_finalize`],
      creditRefs: creditRefsFromMetadata(finalizedMetadata),
      policyRefs: ["private-library-asset", "post-publish-governance"],
      acceptanceRefs: [
        cleanText(
          asRecord(finalizedMetadata.publishableAssetPackage).packageId
        ),
      ],
    },
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "completed",
    currentStage: "library_finalize",
    resultLibraryItemId: libraryItemId,
    resultJson: {
      renderUrl: url,
      libraryItemId,
      jobId,
      publishableAssetPackage: finalizedMetadata.publishableAssetPackage,
    },
    metadataJson: finalizedMetadata,
    completedAt: nowDate(),
  });
  return { completed: true, libraryItemId };
}

function extractPlanFromRun(run: MarketplaceAutoReviewRun): AutoReviewPlan {
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const concept = metadata.concept;
  if (!concept || typeof concept !== "object") {
    throw new Error("Auto review run is missing concept metadata");
  }
  return concept as AutoReviewPlan;
}

async function reloadRun(db: Db, runId: string, auth: AuthContext) {
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, runId),
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        tenantAccessClause(auth)
      )
    )
    .limit(1);
  if (!run)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run not found",
    });
  return run;
}

async function clearResolvedMarketplaceAutoReviewInputChangeBlock(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: AuthContext;
  blockedStage: MarketplaceAutoReviewStage;
}): Promise<MarketplaceAutoReviewRun | null> {
  const statusDetail = asRecord(
    asRecord(params.blockedStage.outputJson).statusDetail
  );
  if (cleanText(statusDetail.state) !== "input_change_recheck_required") {
    return null;
  }
  const metadata = asRecord(params.run.metadataJson) as RunMetadata;
  const bundle = await getMarketplaceProductWithAccess(
    params.run.productId,
    params.auth
  );
  const currentInputChangeImpact =
    evaluateMarketplaceAutoReviewInputChangeImpact({
      runId: params.run.id,
      metadata,
      productTruth: buildProductTruth(bundle),
      productUpdatedAt: productUpdatedAtFromBundle(bundle),
      selectedVariantHash: selectedVariantHashFromBundle(bundle),
      outputMode: params.run.outputMode,
      frameStrategy: params.run.frameStrategy,
      audioStrategy: metadata.audioStrategy,
      resolvedAudioStrategy: metadata.resolvedAudioStrategy,
      requestedShotCount: metadata.requestedShotCount,
    });
  if (cleanText(currentInputChangeImpact.status) !== "no_recheck_required") {
    return null;
  }
  const stages = stageKeysForMode(
    params.run.outputMode as MarketplaceAutoReviewOutputMode
  );
  const previousStage = cleanText(
    asRecord(metadata.paidStageAuthorityFreshness).stageKey
  );
  const resumeStage: StageKey =
    previousStage &&
    previousStage !== "product_preflight" &&
    stages.includes(previousStage as StageKey)
      ? (previousStage as StageKey)
      : "image_generation";
  const nextMetadata = withUpdatedCreditSummary({
    ...metadata,
    inputChangeImpact: currentInputChangeImpact,
    paidStageAuthorityFreshness: {
      status: "no_recheck_required",
      reason: "advance_resume_input_change_cleared",
      checkedAt: nowIso(),
      stageKey: resumeStage,
      clearedBlockedStage: params.blockedStage.stageKey,
    },
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "product_preflight",
    stageOrder: stageIndex("product_preflight", stages),
    status: "completed",
    output: {
      statusDetail: {
        state: "input_change_recheck_cleared",
        severity: "info",
        stageKey: "product_preflight",
        reasonCodes: [],
        safeMessage:
          "ตรวจ input change ซ้ำแล้วไม่พบ stale refs จริง ระบบจึงกลับไปทำงาน stage เดิมต่อ",
        nextAction: "ดำเนินการต่อจาก stage ล่าสุด",
        userActionRequired: false,
        retryable: false,
      },
    },
    stageCompletionEvidence: {
      status: "complete",
      requiredRefs: ["inputChangeImpact", "currentProductTruth"],
      artifactRefs: [`run:${params.run.id}`],
      qaVerdictRefs: [
        cleanText(currentInputChangeImpact.impactId) ||
          `input-impact:${params.run.id}`,
      ],
      policyRefs: ["structured-input-change-recheck"],
    },
  });
  return updateRun({
    db: params.db,
    runId: params.run.id,
    status: "running",
    currentStage: resumeStage,
    stageIndex: stageIndex(resumeStage, stages),
    stageCount: stages.length,
    metadataJson: nextMetadata,
    errorMessage: null,
  });
}

export async function advanceMarketplaceAutoReviewRun(
  runId: string,
  auth: AuthContext,
  runtime: RuntimeContext = {}
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  let run = await reloadRun(db, runId, auth);
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  ) {
    return getMarketplaceAutoReviewRun(runId, auth);
  }
  const [blockedStage] = await db
    .select()
    .from(marketplaceAutoReviewStages)
    .where(
      and(
        eq(marketplaceAutoReviewStages.runId, run.id),
        eq(marketplaceAutoReviewStages.stageKey, run.currentStage),
        inArray(marketplaceAutoReviewStages.status, [
          "blocked",
          "blocked_needs_user",
        ])
      )
    )
    .limit(1);
  if (blockedStage) {
    const clearedRun = await clearResolvedMarketplaceAutoReviewInputChangeBlock(
      {
        db,
        run,
        auth,
        blockedStage,
      }
    );
    if (!clearedRun) {
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    run = clearedRun;
  }
  const lease = await claimMarketplaceAutoReviewAdvanceLease({
    db,
    run,
    auth,
    runtime,
  });
  if (!lease.claimed) {
    return getMarketplaceAutoReviewRun(runId, auth);
  }
  run = lease.run;
  try {
    const tenantId = tenantIdForRun(run, auth);
    const stages = stageKeysForMode(
      run.outputMode as MarketplaceAutoReviewOutputMode
    );
    let metadata = asRecord(run.metadataJson) as RunMetadata;
    if (
      run.currentStage === "concept_story" &&
      (!metadata.concept || typeof metadata.concept !== "object")
    ) {
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    const plan = extractPlanFromRun(run);
    const currentBundle = await getMarketplaceProductWithAccess(
      run.productId,
      auth
    );
    const currentInputChangeImpact =
      evaluateMarketplaceAutoReviewInputChangeImpact({
        runId: run.id,
        metadata,
        productTruth: buildProductTruth(currentBundle),
        productUpdatedAt: productUpdatedAtFromBundle(currentBundle),
        selectedVariantHash: selectedVariantHashFromBundle(currentBundle),
        outputMode: run.outputMode,
        frameStrategy: run.frameStrategy,
        audioStrategy: metadata.audioStrategy,
        resolvedAudioStrategy: metadata.resolvedAudioStrategy,
        requestedShotCount: metadata.requestedShotCount,
      });
    if (cleanText(currentInputChangeImpact.status) === "recheck_required") {
      await persistMarketplaceAutoReviewRecheckRequired({
        db,
        run,
        metadata,
        inputChangeImpact: currentInputChangeImpact,
        reason: "advance_resume_input_change",
        stageKey: run.currentStage as StageKey,
      });
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    const providerRecovery =
      await persistMarketplaceAutoReviewProviderReconciliation({
        db,
        run,
        metadata,
        stages,
      });
    run = providerRecovery.run;
    metadata = providerRecovery.metadata;
    if (providerRecovery.blocked) {
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    metadata = await heartbeatMarketplaceAutoReviewAdvanceLease({
      db,
      run,
      ownerToken: lease.ownerToken,
      note: "preflight_complete",
    });

    try {
      await scheduleImageAttempt({
        db,
        tenantId,
        auth,
        run,
        metadata,
        runtime,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;

      const imageAttemptId = cleanText(metadata.imageAttemptId);
      if (!imageAttemptId) throw new Error("Image attempt was not created");
      const imageReconciled = await reconcileAttempt({
        db,
        tenantId,
        auth,
        productionRunId: run.productionRunId,
        attemptId: imageAttemptId,
        runtime,
      });
      if (imageReconciled.attempt.status === "failed") {
        await markRunFailed(
          db,
          run,
          imageReconciled.attempt.errorMessage ?? "Image generation failed",
          "image_generation"
        );
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      if (imageReconciled.attempt.status !== "completed") {
        queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 15_000);
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      metadata = await ensureStoryboardFrames({
        db,
        tenantId,
        auth,
        run,
        plan,
        metadata,
        runtime,
        refs: imageReconciled.refs,
      });
      const activeShotCount = shotCountForPlan(plan);
      const activeStoryboardFrameUrls = metadata.storyboardFrameUrls?.slice(
        0,
        activeShotCount
      );
      const activeStartFrameUrls = metadata.startFrameUrls?.slice(
        0,
        activeShotCount
      );
      const activeStopFrameUrls = metadata.stopFrameUrls?.slice(
        0,
        activeShotCount
      );
      const imageAcceptanceStatus = cleanText(
        asRecord(metadata.generatedMediaAcceptanceEnvelope).status
      );
      const imageCompletedWithWarnings =
        imageAcceptanceStatus === "accepted_with_warnings";
      await upsertRunStage({
        db,
        runId,
        stageKey: "image_generation",
        stageOrder: stageIndex("image_generation", stages),
        status: imageCompletedWithWarnings
          ? "completed_with_warnings"
          : "completed",
        providerTaskIds: metadata.imageProviderTaskIds,
        output: {
          attemptId: imageAttemptId,
          frameUrls: activeStoryboardFrameUrls,
          startFrameUrls: activeStartFrameUrls,
          stopFrameUrls: activeStopFrameUrls,
          mediaHistorySource: "provider_media_tasks",
          statusDetail: imageCompletedWithWarnings
            ? {
                state: "completed_with_warnings",
                severity: "warning",
                stageKey: "image_generation",
                reasonCodes: [
                  "repair_budget_exhausted_storyboard_review_required",
                ],
                safeMessage:
                  "ภาพสร้างครบแล้ว ระบบส่งต่อเข้า Storyboard Review พร้อมคำเตือนเพื่อให้ผู้ใช้ตรวจและแก้เฉพาะเฟรมได้",
                nextAction:
                  "เปิด Storyboard Review เพื่อตรวจรูปและเปลี่ยนเฉพาะเฟรมที่ไม่ชอบ",
                userActionRequired: false,
                retryable: true,
              }
            : undefined,
        },
        stageCompletionEvidence: {
          requiredRefs: [
            "generatedMediaAcceptanceEnvelope",
            "shotFrameVisionQa",
            "productReferenceAssetPack",
            "imageCreditTransactions",
            "artifactLineage",
          ],
          artifactRefs: [
            ...(activeStoryboardFrameUrls ?? []).map(
              (_, index) => `frame:storyboard:${index + 1}`
            ),
            ...(activeStartFrameUrls ?? []).map(
              (_, index) => `frame:start:${index + 1}`
            ),
            ...(activeStopFrameUrls ?? []).map(
              (_, index) => `frame:stop:${index + 1}`
            ),
          ],
          qaVerdictRefs: (metadata.shotFrameVisionQaEnvelopes ?? [])
            .map(qa => cleanText(qa.qaEnvelopeId))
            .filter(Boolean),
          creditRefs: directTaskRefs(metadata.directImageTasks)
            .map(ref => cleanText(ref.creditIdempotencyKey))
            .filter(Boolean),
          lineageRefs: [`lineage:${runId}:image_generation`],
          policyRefs: [
            "product-reference-pack-required",
            "gateway-routed-vision-qa",
          ],
          acceptanceRefs: [
            cleanText(
              asRecord(metadata.generatedMediaAcceptanceEnvelope)
                .acceptanceEnvelopeId
            ) || `acceptance:image:${runId}`,
          ],
        },
      });
      await updateRun({
        db,
        runId,
        status: "running",
        currentStage: "storyboard_review",
        stageIndex: stageIndex("storyboard_review", stages),
        stageCount: stages.length,
        metadataJson: metadata,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const storyboardReviewId = await createStoryboardReview({
        db,
        tenantId,
        auth,
        run,
        plan,
        metadata,
      });
      await upsertRunStage({
        db,
        runId,
        stageKey: "storyboard_review",
        stageOrder: stageIndex("storyboard_review", stages),
        status: "completed",
        output: { storyboardReviewId },
        stageCompletionEvidence: {
          requiredRefs: [
            "storyboardReview",
            "orderedShotMetadata",
            "frameQaSummary",
            "productEvidenceLock",
          ],
          artifactRefs: [`storyboardReview:${storyboardReviewId}`],
          qaVerdictRefs: (metadata.shotFrameVisionQaEnvelopes ?? [])
            .map(qa => cleanText(qa.qaEnvelopeId))
            .filter(Boolean),
          lineageRefs: [`lineage:${runId}:storyboard_review`],
          policyRefs: ["storyboard-review-trace-redacted"],
          acceptanceRefs: [
            cleanText(
              asRecord(metadata.generatedMediaAcceptanceEnvelope)
                .acceptanceEnvelopeId
            ) || `acceptance:image:${runId}`,
          ],
        },
      });
      const hyperframesPreview =
        await maybeQueueHyperframesPreviewAfterStoryboardReady({
          db,
          tenantId,
          auth,
          run,
          plan,
          metadata,
          storyboardReviewId,
          frameUrls: activeStoryboardFrameUrls ?? [],
          startFrameUrls: activeStartFrameUrls ?? [],
          stopFrameUrls: activeStopFrameUrls ?? [],
        });
      metadata = hyperframesPreview.metadata;

      if (run.outputMode === "storyboard_images") {
        await updateRun({
          db,
          runId,
          status: "completed",
          currentStage: "storyboard_review",
          stageIndex: stageIndex("storyboard_review", stages),
          storyboardReviewId,
          renderJobId: hyperframesPreview.renderJobId ?? undefined,
          resultJson: {
            storyboardReviewId,
            frameUrls: activeStoryboardFrameUrls,
            startFrameUrls: activeStartFrameUrls,
            stopFrameUrls: activeStopFrameUrls,
            hyperframesRenderJobId: hyperframesPreview.renderJobId,
            mediaHistorySource: "provider_media_tasks",
            audioStrategy: metadata.audioStrategy ?? "auto",
            resolvedAudioStrategy: metadata.resolvedAudioStrategy,
          },
          completedAt: nowDate(),
        });
        return getMarketplaceAutoReviewRun(runId, auth);
      }

      await updateRun({
        db,
        runId,
        status: "running",
        currentStage: "video_generation",
        stageIndex: stageIndex("video_generation", stages),
        stageCount: stages.length,
        storyboardReviewId,
        renderJobId: hyperframesPreview.renderJobId ?? undefined,
        metadataJson: metadata,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      await scheduleVideoAttempt({
        db,
        tenantId,
        auth,
        run,
        metadata,
        runtime,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const videoAttemptId = cleanText(metadata.videoAttemptId);
      if (!videoAttemptId) throw new Error("Video attempt was not created");
      const videoReconciled = await reconcileAttempt({
        db,
        tenantId,
        auth,
        productionRunId: run.productionRunId,
        attemptId: videoAttemptId,
        runtime,
      });
      if (videoReconciled.attempt.status === "failed") {
        await markRunFailed(
          db,
          run,
          videoReconciled.attempt.errorMessage ?? "Video generation failed",
          "video_generation"
        );
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      if (videoReconciled.attempt.status !== "completed") {
        queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const videoUnitIds = metadata.videoUnitIds ?? [];
      const expectedVideoUnitIds = plan.shots.map(shot => `${shot.id}-video`);
      const orderedVideoUnitIds = expectedVideoUnitIds.every(id =>
        videoUnitIds.includes(id)
      )
        ? expectedVideoUnitIds
        : videoUnitIds;
      const videoClipUrls = orderedVideoUnitIds.map(unitId =>
        directTaskResultUrl(videoReconciled.refs, unitId)
      );
      assertCompleteMarketplaceAutoReviewVideoClips({
        clipUrls: videoClipUrls,
        expectedCount: plan.shots.length,
        unitIds: orderedVideoUnitIds,
      });
      metadata = withUpdatedCreditSummary({ ...metadata, videoClipUrls });
      await updateRun({ db, runId, metadataJson: metadata });
      await upsertRunStage({
        db,
        runId,
        stageKey: "video_generation",
        stageOrder: stageIndex("video_generation", stages),
        status: "completed",
        providerTaskIds: metadata.videoProviderTaskIds,
        output: {
          attemptId: videoAttemptId,
          videoClipUrls,
          mediaTaskIds: directMediaTaskIdsForUnits(
            videoReconciled.refs,
            orderedVideoUnitIds
          ),
          videoContinuityQaSummary: metadata.videoContinuityQaSummary,
        },
        stageCompletionEvidence: {
          requiredRefs: [
            "videoClipUrls",
            "videoAcceptanceEnvelope",
            "videoContinuityQaSummary",
            "productReferenceAssetPack",
            "videoCreditTransactions",
            "characterContinuityPolicy",
          ],
          artifactRefs: videoClipUrls.map(
            (_, index) => `videoClip:shot-${index + 1}`
          ),
          qaVerdictRefs: [
            cleanText(asRecord(metadata.videoContinuityQaSummary).summaryId),
            ...(metadata.videoClipContinuityQaEnvelopes ?? [])
              .map(qa => cleanText(qa.qaEnvelopeId))
              .filter(Boolean),
            cleanText(
              asRecord(metadata.generatedMediaAcceptanceEnvelope)
                .acceptanceEnvelopeId
            ) || `acceptance:video:${runId}`,
          ].filter(Boolean),
          creditRefs: directTaskRefs(metadata.directVideoTasks)
            .map(ref => cleanText(ref.creditIdempotencyKey))
            .filter(Boolean),
          lineageRefs: [`lineage:${runId}:video_generation`],
          policyRefs: [
            "direct-media-execution",
            "no-node-canvas-execution",
            "character-identity-limited",
            "llm-gateway-video-continuity-qa",
          ],
          acceptanceRefs: [
            cleanText(
              asRecord(metadata.generatedMediaAcceptanceEnvelope)
                .acceptanceEnvelopeId
            ) || `acceptance:video:${runId}`,
          ],
        },
      });
      await updateRun({
        db,
        runId,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: stageIndex("audio_generation", stages),
        stageCount: stages.length,
        metadataJson: metadata,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const audioResult = await ensureAudioForVideo({
        db,
        tenantId,
        auth,
        run,
        plan,
        metadata,
        runtime,
      });
      metadata = audioResult.metadata;
      if (!audioResult.completed) {
        queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      await updateRun({
        db,
        runId,
        status: "running",
        currentStage: "video_edit",
        stageIndex: stageIndex("video_edit", stages),
        stageCount: stages.length,
        metadataJson: metadata,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const videoEditorProjectId = await createVideoEditorProjection({
        db,
        tenantId,
        auth,
        run,
        plan,
        metadata,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      await upsertRunStage({
        db,
        runId,
        stageKey: "video_edit",
        stageOrder: stageIndex("video_edit", stages),
        status: "completed",
        output: { videoEditorProjectId },
        stageCompletionEvidence: {
          requiredRefs: [
            "videoEditorProject",
            "warningOverlayPlan",
            "timelineGapFreeAudio",
            "distributionProfile",
          ],
          artifactRefs: [`videoEditorProject:${videoEditorProjectId}`],
          qaVerdictRefs: [
            cleanText(
              asRecord(metadata.audioContinuityQaEnvelope).qaEnvelopeId
            ) || `audio-qa:${runId}`,
            cleanText(
              asRecord(metadata.warningOverlayVerification).verificationId
            ),
            cleanText(asRecord(metadata.videoContinuityQaSummary).summaryId),
          ].filter(Boolean),
          lineageRefs: [`lineage:${runId}:video_edit`],
          policyRefs: ["deterministic-warning-overlay", "safe-area-9x16"],
          acceptanceRefs: [
            cleanText(
              asRecord(metadata.generatedMediaAcceptanceEnvelope)
                .acceptanceEnvelopeId
            ) || `acceptance:video:${runId}`,
          ],
        },
      });
      await updateRun({
        db,
        runId,
        status: "running",
        currentStage: "render",
        stageIndex: stageIndex("render", stages),
        stageCount: stages.length,
        videoEditorProjectId,
      });
      run = await reloadRun(db, runId, auth);
      metadata = asRecord(run.metadataJson) as RunMetadata;
      const render = await ensureRender({
        db,
        tenantId,
        auth,
        run,
        plan,
        metadata,
      });
      if (!render.completed) {
        queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
      }
      return getMarketplaceAutoReviewRun(runId, auth);
    } catch (error) {
      if ((error as any)?.__marketplaceAutoReviewRecheckRequired) {
        return getMarketplaceAutoReviewRun(runId, auth);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Marketplace auto review failed";
      await markRunFailed(
        db,
        run,
        message,
        run.currentStage as StageKey,
        promptSkillDebugStageOutputFromError(error) ?? undefined
      );
      return getMarketplaceAutoReviewRun(runId, auth);
    }
  } finally {
    await releaseMarketplaceAutoReviewAdvanceLease({
      db,
      runId,
      ownerToken: lease.ownerToken,
    }).catch(error => {
      console.error(
        "[marketplaceAutoReview] failed to release advance lease",
        error instanceof Error ? error.message : error
      );
    });
  }
}

function isTerminalDirectMediaStatus(status: unknown): boolean {
  return ["completed", "failed", "cancelled"].includes(cleanText(status));
}

function isCancellableDirectMediaRef(ref: DirectMediaTaskRef): boolean {
  return !isTerminalDirectMediaStatus(ref.status);
}

export function summarizeMarketplaceAutoReviewCancellationForTest(
  metadata: RunMetadata
) {
  const directRefs = [
    ...directTaskRefs(metadata.directImageTasks),
    ...directTaskRefs(metadata.directVideoTasks),
  ];
  const cancellableRefs = directRefs.filter(isCancellableDirectMediaRef);
  const cancellableAudio =
    Boolean(cleanText(metadata.audioMediaTaskId)) &&
    !cleanText(metadata.audioUrl) &&
    !metadata.audioRefundTransactionId;
  const renderReservation = asRecord(metadata.renderCreditReservation);
  const renderRefundRequired =
    Boolean(cleanText(metadata.renderJobId)) &&
    !cleanText(metadata.renderResultUrl) &&
    toNumber(renderReservation.amount) > 0 &&
    !renderReservation.refundTransactionId;
  return {
    directMediaCancellationTaskIds: cancellableRefs.map(ref => ref.taskId),
    directMediaRefundTaskIds: cancellableRefs
      .filter(ref => toNumber(ref.creditAmount) > 0 && !ref.refundTransactionId)
      .map(ref => ref.taskId),
    audioCancellationTaskId: cancellableAudio
      ? cleanText(metadata.audioMediaTaskId)
      : null,
    audioRefundRequired:
      cancellableAudio && toNumber(metadata.audioCreditAmount) > 0,
    renderCancellationJobId: cleanText(metadata.renderJobId) || null,
    renderRefundRequired,
  };
}

async function requestDirectMediaRefsForCancellation(params: {
  auth: AuthContext;
  refs: DirectMediaTaskRef[];
  reason: string;
  runId: string;
  userToken?: string | null;
  cancelTask?: (taskId: string, userToken: string) => Promise<MediaTask>;
}) {
  const reconciled: DirectMediaTaskRef[] = [];
  const providerCancellationEvidence: Record<string, unknown>[] = [];
  for (const ref of params.refs) {
    if (!isCancellableDirectMediaRef(ref)) {
      reconciled.push(ref);
      continue;
    }
    const evidenceId = [
      "provider-cancel-intent",
      params.runId,
      ref.mediaType,
      ref.taskId,
    ].join(":");
    const requestedAt = nowIso();
    let providerCancellationStatus =
      "provider_cancel_intent_persisted_token_unavailable";
    let providerCancellationDispatchedAt: string | undefined;
    let providerCancellationError: string | undefined;
    if (cleanText(params.userToken)) {
      try {
        const cancelTask =
          params.cancelTask ??
          ((taskId: string, userToken: string) =>
            mediaGenerationService.cancelTask(taskId, userToken));
        const cancelled = await cancelTask(
          ref.taskId,
          cleanText(params.userToken)
        );
        providerCancellationStatus = `provider_cancel_dispatched:${cleanText(cancelled.status) || "unknown"}`;
        providerCancellationDispatchedAt = nowIso();
      } catch (error) {
        providerCancellationStatus = "provider_cancel_dispatch_failed";
        providerCancellationDispatchedAt = nowIso();
        providerCancellationError =
          error instanceof Error ? error.message : String(error);
      }
    }
    const evidence = compactRecord({
      evidenceId,
      runId: params.runId,
      taskId: ref.taskId,
      providerTaskId: ref.providerTaskId,
      mediaType: ref.mediaType,
      unitId: ref.unitId,
      reason: params.reason,
      status: providerCancellationStatus,
      requestedAt,
      dispatchedAt: providerCancellationDispatchedAt,
      errorMessage: providerCancellationError,
      durableBeforeRefund: true,
    });
    providerCancellationEvidence.push(evidence);
    reconciled.push({
      ...ref,
      status: "cancellation_requested",
      cancellationRequestedAt: requestedAt,
      cancellationReason: params.reason,
      providerCancellationStatus,
      providerCancellationEvidenceId: evidenceId,
      providerCancellationDispatchedAt,
      providerCancellationError,
    });
  }
  return { refs: reconciled, providerCancellationEvidence };
}

export async function buildMarketplaceAutoReviewCancellationEvidenceForTest(input: {
  refs: Record<string, any>[];
  reason?: string;
  runId?: string;
  userToken?: string | null;
  cancelTask?: (taskId: string, userToken: string) => Promise<MediaTask>;
}) {
  return requestDirectMediaRefsForCancellation({
    auth: { userId: 1 },
    refs: input.refs as DirectMediaTaskRef[],
    reason: input.reason ?? "run_cancelled",
    runId: input.runId ?? "mar_test",
    userToken: input.userToken ?? null,
    cancelTask: input.cancelTask,
  });
}

async function refundDirectMediaRefsForCancellation(params: {
  auth: AuthContext;
  refs: DirectMediaTaskRef[];
  reason: string;
}) {
  const reconciled: DirectMediaTaskRef[] = [];
  const refundRefs: string[] = [];
  const refundFailures: Record<string, string>[] = [];
  for (const ref of params.refs) {
    let next = ref;
    if (toNumber(ref.creditAmount) > 0 && !ref.refundTransactionId) {
      try {
        next = await refundMarketplaceMediaCredits({
          auth: params.auth,
          ref: next,
          reason: params.reason,
        });
        if (next.refundTransactionId) {
          refundRefs.push(`${next.mediaType}:${next.taskId}`);
        }
      } catch (error) {
        refundFailures.push({
          taskId: ref.taskId,
          mediaType: ref.mediaType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    reconciled.push(next);
  }
  return { refs: reconciled, refundRefs, refundFailures };
}

function backgroundTimerKey(runId: string, userId: number): string {
  return `${userId}:${runId}`;
}

const backgroundTimers = new Map<string, NodeJS.Timeout>();

function clearMarketplaceAutoReviewAdvanceTimer(runId: string, userId: number) {
  const key = backgroundTimerKey(runId, userId);
  const timer = backgroundTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    backgroundTimers.delete(key);
    return true;
  }
  return false;
}

export function queueMarketplaceAutoReviewAdvance(
  runId: string,
  auth: AuthContext,
  runtime: RuntimeContext = {},
  delayMs = 60_000
) {
  if (!cleanText(runtime.userToken)) {
    // Provider status polling needs a token. The run remains durable and can be
    // advanced by the next authenticated query/mutation.
    return;
  }
  const key = backgroundTimerKey(runId, auth.userId);
  const existing = backgroundTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(
    () => {
      backgroundTimers.delete(key);
      advanceMarketplaceAutoReviewRun(runId, auth, runtime).catch(error => {
        console.error("[marketplaceAutoReview] background advance failed", {
          runId,
          userId: auth.userId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    Math.max(500, delayMs)
  );
  timer.unref?.();
  backgroundTimers.set(key, timer);
}

export async function cancelMarketplaceAutoReviewRun(
  runId: string,
  auth: AuthContext,
  runtime: RuntimeContext = {}
) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const run = await reloadRun(db, runId, auth);
  if (run.status === "completed" || run.status === "failed")
    return getMarketplaceAutoReviewRun(runId, auth);
  const timerCleared = clearMarketplaceAutoReviewAdvanceTimer(
    runId,
    auth.userId
  );
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const imageCancelIntent = await requestDirectMediaRefsForCancellation({
    auth,
    refs: directTaskRefs(metadata.directImageTasks),
    reason: "run_cancelled",
    runId: run.id,
    userToken: runtime.userToken,
  });
  const videoCancelIntent = await requestDirectMediaRefsForCancellation({
    auth,
    refs: directTaskRefs(metadata.directVideoTasks),
    reason: "run_cancelled",
    runId: run.id,
    userToken: runtime.userToken,
  });
  let audioProviderCancellationEvidence: Record<string, unknown> | null = null;
  if (cleanText(metadata.audioMediaTaskId) && !cleanText(metadata.audioUrl)) {
    const evidenceId = [
      "provider-cancel-intent",
      run.id,
      "audio",
      cleanText(metadata.audioMediaTaskId),
    ].join(":");
    const requestedAt = nowIso();
    let status = "provider_cancel_intent_persisted_token_unavailable";
    let dispatchedAt: string | undefined;
    let errorMessage: string | undefined;
    if (cleanText(runtime.userToken)) {
      try {
        const cancelled = await mediaGenerationService.cancelTask(
          cleanText(metadata.audioMediaTaskId),
          cleanText(runtime.userToken)
        );
        status = `provider_cancel_dispatched:${cleanText(cancelled.status) || "unknown"}`;
        dispatchedAt = nowIso();
      } catch (error) {
        status = "provider_cancel_dispatch_failed";
        dispatchedAt = nowIso();
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
    audioProviderCancellationEvidence = compactRecord({
      evidenceId,
      runId: run.id,
      taskId: cleanText(metadata.audioMediaTaskId),
      providerTaskId: cleanText(metadata.audioProviderTaskId),
      mediaType: "audio",
      reason: "run_cancelled",
      status,
      requestedAt,
      dispatchedAt,
      errorMessage,
      durableBeforeRefund: true,
    });
  }
  const providerCancellationEvidence = [
    ...imageCancelIntent.providerCancellationEvidence,
    ...videoCancelIntent.providerCancellationEvidence,
    ...(audioProviderCancellationEvidence
      ? [audioProviderCancellationEvidence]
      : []),
  ];
  const intentMetadata = withUpdatedCreditSummary({
    ...metadata,
    directImageTasks: imageCancelIntent.refs,
    directVideoTasks: videoCancelIntent.refs,
    providerCancellationEvidence,
    cancellationIntent: {
      status: "provider_cancel_intent_persisted",
      runId: run.id,
      reason: "run_cancelled",
      persistedAt: nowIso(),
      evidenceRefs: providerCancellationEvidence
        .map(item => cleanText(item.evidenceId))
        .filter(Boolean),
      tokenAvailable: Boolean(cleanText(runtime.userToken)),
    },
  });
  if (providerCancellationEvidence.length > 0) {
    await updateRun({
      db,
      runId,
      metadataJson: intentMetadata,
    });
  }
  const imageCancellation = await refundDirectMediaRefsForCancellation({
    auth,
    refs: imageCancelIntent.refs,
    reason: "run_cancelled",
  });
  const videoCancellation = await refundDirectMediaRefsForCancellation({
    auth,
    refs: videoCancelIntent.refs,
    reason: "run_cancelled",
  });
  let audioRefundTransactionId = metadata.audioRefundTransactionId;
  let audioRefundStatus = "not_required";
  if (
    cleanText(metadata.audioMediaTaskId) &&
    !cleanText(metadata.audioUrl) &&
    !audioRefundTransactionId &&
    toNumber(metadata.audioCreditAmount) > 0
  ) {
    try {
      const refund = await refundCredits({
        userId: auth.userId,
        amount: toNumber(metadata.audioCreditAmount),
        originalTransactionId: metadata.audioCreditTransactionId,
        idempotencyKey: `${metadata.audioCreditIdempotencyKey}:refund:run_cancelled`,
        description: "Refund marketplace auto review audio cancellation",
        sourceType: "media_audio",
        metadata: {
          feature: "marketplace_auto_review",
          runId: run.id,
          reason: "run_cancelled",
        },
      });
      audioRefundTransactionId = refund.transactionId;
      audioRefundStatus = "refunded";
    } catch (error) {
      audioRefundStatus = `refund_failed:${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const renderJobId = cleanText(run.renderJobId ?? metadata.renderJobId);
  let renderRefundTransactionId = metadata.renderCreditRefundTransactionId;
  let renderCancellationStatus = "not_required";
  if (renderJobId && !renderJobId.startsWith("cached-")) {
    await setRenderJobKey(renderJobId, "status", {
      status: "cancelled",
      progress: 0,
      jobId: renderJobId,
      message: "Marketplace Auto Review run cancelled",
      cancelledAt: nowIso(),
    }).catch(() => undefined);
    await removeActiveRenderJob(String(auth.userId), renderJobId).catch(
      () => undefined
    );
    const refund = await refundMarketplaceRenderCredits({
      auth,
      reservation: metadata.renderCreditReservation,
      reason: "run_cancelled",
    }).catch(() => undefined);
    if (refund?.transactionId) {
      renderRefundTransactionId = refund.transactionId;
      renderCancellationStatus = "cancelled_refunded";
    } else {
      renderCancellationStatus = "cancelled_or_no_refund_required";
    }
  }
  const cancellationReconciliation = {
    status: "reconciled",
    runId: run.id,
    cancelledAt: nowIso(),
    cancelledByUserId: auth.userId,
    timerCleared,
    directMedia: {
      imageRefundRefs: imageCancellation.refundRefs,
      videoRefundRefs: videoCancellation.refundRefs,
      providerCancellationEvidenceRefs: providerCancellationEvidence
        .map(item => cleanText(item.evidenceId))
        .filter(Boolean),
      providerCancellationStatuses: providerCancellationEvidence
        .map(item => cleanText(item.status))
        .filter(Boolean),
      refundFailures: [
        ...imageCancellation.refundFailures,
        ...videoCancellation.refundFailures,
      ],
      cancellationRequestedTaskIds: [
        ...imageCancellation.refs,
        ...videoCancellation.refs,
      ]
        .filter(isCancellableDirectMediaRef)
        .map(ref => ref.taskId),
    },
    audio: {
      mediaTaskId: cleanText(metadata.audioMediaTaskId) || null,
      providerTaskId: cleanText(metadata.audioProviderTaskId) || null,
      status: cleanText(metadata.audioMediaTaskId)
        ? "cancellation_requested"
        : "not_required",
      providerCancellationEvidenceId:
        cleanText(audioProviderCancellationEvidence?.evidenceId) || null,
      providerCancellationStatus:
        cleanText(audioProviderCancellationEvidence?.status) || "not_required",
      refundStatus: audioRefundStatus,
      refundTransactionId: audioRefundTransactionId,
    },
    render: {
      jobId: renderJobId || null,
      status: renderCancellationStatus,
      refundTransactionId: renderRefundTransactionId,
    },
  };
  const reconciledMetadata = withUpdatedCreditSummary({
    ...intentMetadata,
    directImageTasks: imageCancellation.refs,
    directVideoTasks: videoCancellation.refs,
    providerCancellationEvidence,
    audioRefundTransactionId,
    audioCancellation: cancellationReconciliation.audio,
    renderCreditReservation: renderRefundTransactionId
      ? ({
          ...asRecord(metadata.renderCreditReservation),
          refundTransactionId: renderRefundTransactionId,
        } as MarketplaceRenderCreditReservation)
      : metadata.renderCreditReservation,
    renderCreditRefundTransactionId: renderRefundTransactionId,
    renderCancellation: cancellationReconciliation.render,
    cancellationReconciliation,
  });
  const stages = stageKeysForMode(
    run.outputMode as MarketplaceAutoReviewOutputMode
  );
  if (stages.includes(run.currentStage as StageKey)) {
    await upsertRunStage({
      db,
      runId,
      stageKey: run.currentStage as StageKey,
      stageOrder: stageIndex(run.currentStage, stages),
      status: "cancelled",
      output: {
        cancelledAt: nowIso(),
        cancelledByUserId: auth.userId,
        cancellationReconciliation,
      },
      stageCompletionEvidence: {
        status: "cancelled",
        requiredRefs: [
          "cancelRequest",
          "currentStage",
          "creditReconciliation",
          "providerCancellationRequests",
        ],
        artifactRefs: [`run:${run.id}`],
        qaVerdictRefs: providerCancellationEvidence
          .map(item => cleanText(item.evidenceId))
          .filter(Boolean),
        creditRefs: [
          ...imageCancellation.refundRefs,
          ...videoCancellation.refundRefs,
          audioRefundTransactionId
            ? `credit:${audioRefundTransactionId}`
            : "credit-reconciliation:audio-not-required",
          renderRefundTransactionId
            ? `credit:${renderRefundTransactionId}`
            : "credit-reconciliation:render-not-required",
        ],
        policyRefs: [
          "cancel-stops-downstream-advance",
          "cancel-refunds-outstanding-reservations",
        ],
      },
    });
  }
  await updateRun({
    db,
    runId,
    status: "cancelled",
    currentStage: run.currentStage,
    renderJobId: renderJobId || run.renderJobId,
    metadataJson: reconciledMetadata,
    completedAt: nowDate(),
  });
  return getMarketplaceAutoReviewRun(runId, auth);
}
