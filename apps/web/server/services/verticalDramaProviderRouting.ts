/**
 * Vertical Drama Series — provider routing + video-model resolution service
 * (spec feature 131, section-08, §7.2 / §7.4 / §9.1 / §9.2 / §11.5).
 *
 * Resolves video models from the app model registry
 * (`server/services/modelRegistry.ts`), derives a provider capability matrix,
 * enforces capability gates (first/last-frame, human-face input, native audio,
 * aspect ratio, sub-shot feasibility), and produces a normalized
 * `VideoRoutingDecision` that preserves the raw upstream provider status
 * ALONGSIDE the app-normalized status (never lossy-mapped).
 *
 * All provider I/O goes through named adapters that implement the shared
 * `VerticalDramaVideoProviderAdapter` contract (spec §9.1):
 *   - `VeoCompatibleVideoProvider`     — MVP first/last-frame bridge path.
 *   - `OpenAIVideoProvider`            — prompt-only / capability-gated fallback;
 *                                        NOT the human-face bridge default.
 *   - `ExternalImageToVideoProvider`   — requires explicit tenant config.
 *   - `MockVideoProvider`              — DETERMINISTIC placeholder artifacts for
 *                                        dry-run + tests (no provider keys).
 *
 * Fallbacks are NEVER silent: every degrade / block records a machine-readable
 * reason in `blockingReasons` / `provider_feasibility.blocking_reasons`.
 *
 * Pure planners / gates / mappers live at module scope so they are unit-testable
 * without a database or provider credentials. The registry-backed async
 * resolver + the `ProviderRoutingPort` factory wrap them for the runner.
 */

import { createHash } from "crypto";
import {
  getModelsByTypeAsync,
  getModelById,
  findModelByAlias,
  type ModelDefinition,
} from "./modelRegistry";
import {
  VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK,
  computeAutoSubShotCount,
  validateSubShotsForParent,
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  type VideoRoutingDecision,
  type VerticalDramaProviderCapabilities,
  type VerticalDramaProviderRequestSnapshot,
  type VerticalDramaVeo31RequestSnapshot,
  type VerticalDramaVideoProviderAdapter,
  type VerticalDramaVideoClipProviderRequest,
  type VerticalDramaProviderJob,
  type VerticalDramaProviderDownloadResult,
  type VerticalDramaSubShot,
  type VerticalDramaSubShotPolicy,
} from "@shared/verticalDramaSeries";
import type {
  ProviderRoutingPort,
  ProviderRoutingStageRequest,
  ProviderRoutingStageResult,
} from "./verticalDramaEpisodePipeline";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Default video model when the tenant has not chosen one (spec §7.2). */
export const VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL = "veo3/generate-veo-3-video-lite" as const;

/** Bridge profile id: 8 adjacent clip jobs bridged from 9 frames (spec §7.4). */
export const VERTICAL_DRAMA_BRIDGE_PROFILE_ID = "veo31_first_last_bridge_60s" as const;

/** The 8-clip bridge timing schedule (sums to 60s) from 9 frames (spec §7.4). */
export const VERTICAL_DRAMA_BRIDGE_TIMING_SECONDS = [8, 8, 8, 8, 8, 8, 8, 4] as const;

/** The 9-clip fallback timing schedule (sums to 60s) for providers w/o F/L (spec §7.4). */
export const VERTICAL_DRAMA_FALLBACK_TIMING_SECONDS = [8, 8, 8, 4, 8, 8, 4, 8, 4] as const;

export const VERTICAL_DRAMA_TARGET_ASPECT_RATIO = "9:16" as const;
export const VERTICAL_DRAMA_EPISODE_SECONDS = 60 as const;
export const VERTICAL_DRAMA_SHOT_COUNT = 9 as const;
export const VERTICAL_DRAMA_BRIDGE_CLIP_COUNT = 8 as const;

/** Per-provider-job timeout floor before a job is marked `timed_out` (spec §9.1). */
export const VERTICAL_DRAMA_DEFAULT_JOB_TIMEOUT_SECONDS = 15 * 60;

/** Stable app error codes so QC/repair/UI copy never depend on upstream wording. */
export const VD_PROVIDER_ERROR_CODES = {
  TIMEOUT: "VD_PROVIDER_TIMEOUT",
  RATE_LIMITED: "VD_PROVIDER_RATE_LIMITED",
  INVALID_INPUT: "VD_PROVIDER_INVALID_INPUT",
  CONTENT_BLOCKED: "VD_PROVIDER_CONTENT_BLOCKED",
  FACE_INPUT_NOT_ALLOWED: "VD_PROVIDER_FACE_INPUT_NOT_ALLOWED",
  UNSUPPORTED_DURATION: "VD_PROVIDER_UNSUPPORTED_DURATION",
  UNSUPPORTED_ASPECT_RATIO: "VD_PROVIDER_UNSUPPORTED_ASPECT_RATIO",
  PROVIDER_UNAVAILABLE: "VD_PROVIDER_UNAVAILABLE",
  STALE_JOB: "VD_PROVIDER_STALE_JOB",
  UNKNOWN: "VD_PROVIDER_UNKNOWN_ERROR",
} as const;
export type VerticalDramaProviderErrorCode =
  (typeof VD_PROVIDER_ERROR_CODES)[keyof typeof VD_PROVIDER_ERROR_CODES];

/** The six normalized motion modes (spec §7.2 / §11.5). */
export type VerticalDramaMotionMode =
  | "first_last_frame_bridge"
  | "first_frame_to_video"
  | "image_to_video"
  | "text_to_video"
  | "reference_to_video"
  | "prompt_only";

/* -------------------------------------------------------------------------- */
/* Runtime config + tenant policy (spec §9.2)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tenant-admin provider policy (policy-enforced, NOT UI branches — spec §9.2).
 * Read from flags + registry + tenant policy + secret storage; never a
 * hard-coded runtime client.
 */
export interface VerticalDramaTenantProviderPolicy {
  /** Allowed provider ids; `undefined` = all enabled providers allowed. */
  allowedProviders?: string[];
  /** Hard cap on episode count (informational for routing feasibility). */
  maxEpisodeCount?: number;
  /** Whether native audio may be requested. */
  allowNativeAudio: boolean;
  /** Regulated product categories the tenant may run. */
  allowedRegulatedCategories: string[];
  /** Whether prompt-only fallback is allowed when providers lack F/L support. */
  allowPromptOnlyFallback: boolean;
  /** Provider ids allowed to run the human-face first/last-frame bridge. */
  bridgeAllowlist: string[];
  /** Explicit external image-to-video configuration (required to select it). */
  externalImageToVideo?: {
    baseUrl: string;
    apiKeyEnv: string;
    createEndpoint: string;
    statusEndpoint: string;
    downloadEndpoint: string;
  };
  /**
   * OpenAI Sora/Videos human-face bridge stays disabled/capability-gated for MVP
   * unless a tenant explicitly opts in via policy change (spec §9.1).
   */
  openAiHumanFaceBridgeEnabled: boolean;
}

/** Beta defaults (spec §9.2). */
export const VERTICAL_DRAMA_RUNTIME_DEFAULTS = {
  defaultMode: "dry_run" as const,
  autoApproveGeneratedCharacterRefs: false,
  autoApproveStartFramesHuman: false,
  autoApproveStartFramesProduct: false,
} as const;

/** A conservative, fail-closed default policy (nothing extra allowed). */
export const VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY: VerticalDramaTenantProviderPolicy = {
  allowedProviders: undefined,
  allowNativeAudio: true,
  allowedRegulatedCategories: [],
  allowPromptOnlyFallback: true,
  bridgeAllowlist: ["kie.ai"],
  externalImageToVideo: undefined,
  openAiHumanFaceBridgeEnabled: false,
};

/* -------------------------------------------------------------------------- */
/* Capability derivation (spec §11.5)                                          */
/* -------------------------------------------------------------------------- */

const ASPECT_RATIOS: Array<"9:16" | "16:9" | "1:1"> = ["9:16", "16:9", "1:1"];

function normalizeAspectRatios(
  ratios: string[] | undefined,
): Array<"9:16" | "16:9" | "1:1"> {
  const set = new Set(ratios ?? []);
  return ASPECT_RATIOS.filter((r) => set.has(r));
}

/** True when a Veo-style config declares FIRST_AND_LAST_FRAMES_2_VIDEO support. */
function configSupportsFirstLastFrame(cfg: Record<string, unknown>): boolean {
  if (cfg.apiPayloadFormat === "veo") return true;
  const fields = (cfg.inputFields as Array<Record<string, unknown>> | undefined) ?? [];
  const fieldKeys = new Set(
    fields.map((field) => String(field.key ?? "").trim().toLowerCase()),
  );
  // Market-style providers such as Kie.ai Gemini Omni expose the two frame
  // URLs directly instead of using Veo's FIRST_AND_LAST_FRAMES_2_VIDEO mode.
  if (fieldKeys.has("first_frame_url") && fieldKeys.has("last_frame_url")) {
    return true;
  }
  for (const f of fields) {
    const options = (f.options as Array<{ value?: string }> | undefined) ?? [];
    if (options.some((o) => o.value === "FIRST_AND_LAST_FRAMES_2_VIDEO")) return true;
  }
  return false;
}

/** Best-effort provider family detection for adapter selection. */
export function detectProviderFamily(model: ModelDefinition): "veo" | "openai" | "gemini_omni" | "generic" {
  const id = model.id.toLowerCase();
  const aliases = model.aliases.map((a) => a.toLowerCase());
  const hay = [id, ...aliases].join(" ");
  if (hay.includes("sora") || hay.includes("openai") || hay.includes("openai_videos")) return "openai";
  if (id.startsWith("veo") || hay.includes(" veo") || hay.includes("veo ")) return "veo";
  if (hay.includes("gemini omni") || id.includes("gemini-omni")) return "gemini_omni";
  return "generic";
}

/**
 * Derive the provider capability matrix for a video model from the registry
 * definition + tenant policy. Pure — no registry read, no I/O.
 */
export function deriveVideoCapabilities(
  model: ModelDefinition,
  policy: VerticalDramaTenantProviderPolicy = VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
): VerticalDramaProviderCapabilities {
  const cfg = (model.configJson ?? {}) as Record<string, unknown>;
  const family = detectProviderFamily(model);
  const hasAudio = cfg.hasAudio === true;
  const maxRefImages = Number(cfg.maxReferenceImages ?? 0);
  const supportsFirstLast = configSupportsFirstLastFrame(cfg);
  const generateType = String(cfg.generateType ?? "").toLowerCase();

  // OpenAI Sora/Videos are NOT the silent human-face bridge default: face input
  // stays gated off unless the tenant explicitly opts in via policy (spec §9.1).
  const supportsHumanFaceInput =
    family === "openai"
      ? policy.openAiHumanFaceBridgeEnabled
      : maxRefImages > 0 || supportsFirstLast || generateType.includes("reference");

  const durations = (model.durations ?? []).slice().sort((a, b) => a - b);
  const sizes = deriveVideoSizes(cfg, model);

  return {
    supportsImageGeneration: false,
    supportsImageReferences: maxRefImages > 0,
    supportsVideoGeneration: model.type === "video" && model.isEnabled !== false,
    supportsVideoInputReference: generateType.includes("video") && !generateType.includes("text"),
    supportsFirstLastFrameVideo: supportsFirstLast,
    supportsHumanFaceInputReference: supportsHumanFaceInput,
    supportsHumanLikenessCharacterAsset: maxRefImages > 0 && family !== "openai",
    supportsNativeAudio: hasAudio && policy.allowNativeAudio,
    supportsThaiNativeAudio: hasAudio && policy.allowNativeAudio && family === "veo",
    supportsSeparateTts: true,
    supportsDialogueTts: true,
    supportsSubtitleBurnIn: false,
    allowedVideoSeconds: durations,
    allowedVideoSizes: sizes,
    allowedAspectRatios: normalizeAspectRatios(model.aspectRatios),
  };
}

function deriveVideoSizes(
  cfg: Record<string, unknown>,
  _model: ModelDefinition,
): Array<"720x1280" | "1024x1792" | "1080x1920" | string> {
  const res = (cfg.supportedResolutions as string[] | undefined) ?? [];
  const map: Record<string, string> = {
    "720p": "720x1280",
    "1080p": "1080x1920",
    "4K": "2160x3840",
  };
  const sizes = res.map((r) => map[r] ?? r);
  return sizes.length > 0 ? sizes : ["720x1280"];
}

/* -------------------------------------------------------------------------- */
/* Video model resolution (spec §7.2)                                          */
/* -------------------------------------------------------------------------- */

/** Alias groups that must resolve to a single canonical registry model id. */
export const VERTICAL_DRAMA_VIDEO_MODEL_ALIASES: Record<string, string[]> = {
  "veo 3.1 lite": ["veo3-lite", "veo3_lite", "veo-3.1-lite"],
  "veo 3.1 quality": ["veo 3.1", "veo3", "veo-3.1"],
  "veo 3.1 fast": ["veo3-fast", "veo3_fast", "veo-fast"],
  "gemini omni": ["gemini omni video", "gemini-omni", "gemini omni flash"],
  // "grok imagine" alone (with no version) is intentionally NOT included as a
  // canonical/alias here — the bare term also matches the unrelated `grok-imagine`
  // IMAGE model (see `modelRegistry.ts`), and `findModelByAlias(canonical,
  // "video")` below is type-scoped so it would simply resolve to nothing.
  // `grok-imagine-video-1-5-preview` (added Phase 0, kie.ai — verified
  // callable) is the real "Grok Imagine 1.5" video model.
  "grok imagine video 1.5": ["grok imagine 1.5", "grok-imagine-video-1.5", "grok video 1.5", "grok imagine video"],
  "grok video 3": ["grok-video-3"],
  // Seedance 2.0 (ByteDance, via WaveSpeed — verified callable, see
  // `mediaProviderUtils.ts` `WAVESPEED_MODEL_DEFINITIONS`). Canonical points at
  // the image-to-video variant since Vertical Drama always renders from an
  // approved start-frame image.
  seedance: ["seedance", "bytedance seedance", "seedance 2.0", "seedance 2.0 image to video"],
};

export interface VerticalDramaResolvedVideoModel {
  id: string;
  name: string;
  provider: string;
  providerFamily: ReturnType<typeof detectProviderFamily>;
  creditCost: number;
  aliases: string[];
  capabilities: VerticalDramaProviderCapabilities;
  /** Motion modes this model can serve given its capabilities. */
  supportedMotionModes: VerticalDramaMotionMode[];
  /** True when the model is allowed by tenant policy. */
  policyAllowed: boolean;
  /** Non-blocking annotations (e.g. "no first/last-frame support"). */
  notes: string[];
  isDefault: boolean;
}

export interface VerticalDramaVideoModelResolution {
  defaultModelId: string;
  models: VerticalDramaResolvedVideoModel[];
}

/** Which motion modes a capability set can serve. */
export function supportedMotionModesFor(
  caps: VerticalDramaProviderCapabilities,
): VerticalDramaMotionMode[] {
  const modes: VerticalDramaMotionMode[] = ["text_to_video", "prompt_only"];
  if (caps.supportsImageReferences || caps.supportsVideoInputReference) modes.push("image_to_video", "first_frame_to_video");
  if (caps.supportsImageReferences) modes.push("reference_to_video");
  if (caps.supportsFirstLastFrameVideo) modes.push("first_last_frame_bridge");
  return Array.from(new Set(modes));
}

/** Pure resolver over a supplied model list (unit-testable without a DB read). */
export function resolveVideoModelsFromList(
  models: ModelDefinition[],
  opts: {
    defaultModelId?: string;
    policy?: VerticalDramaTenantProviderPolicy;
  } = {},
): VerticalDramaVideoModelResolution {
  const policy = opts.policy ?? VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY;
  const videoModels = models.filter((m) => m.type === "video" && m.isEnabled !== false);
  const defaultReq = opts.defaultModelId ?? VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL;
  const resolvedDefault = videoModels.some((m) => m.id === defaultReq)
    ? defaultReq
    : videoModels[0]?.id ?? defaultReq;

  const resolved: VerticalDramaResolvedVideoModel[] = videoModels.map((m) => {
    const caps = deriveVideoCapabilities(m, policy);
    const notes: string[] = [];
    if (!caps.supportsFirstLastFrameVideo) notes.push("no_first_last_frame_support");
    if (!caps.allowedAspectRatios.includes("9:16")) notes.push("no_9_16_aspect_ratio");
    if (!caps.supportsNativeAudio) notes.push("no_native_audio");
    const policyAllowed =
      policy.allowedProviders === undefined || policy.allowedProviders.includes(m.provider);
    if (!policyAllowed) notes.push("blocked_by_tenant_policy");
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      providerFamily: detectProviderFamily(m),
      creditCost: m.creditCost,
      aliases: [...m.aliases],
      capabilities: caps,
      supportedMotionModes: supportedMotionModesFor(caps),
      policyAllowed,
      notes,
      isDefault: m.id === resolvedDefault,
    };
  });

  resolved.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.policyAllowed !== b.policyAllowed) return a.policyAllowed ? -1 : 1;
    if (a.creditCost !== b.creditCost) return a.creditCost - b.creditCost;
    return a.id.localeCompare(b.id);
  });

  return { defaultModelId: resolvedDefault, models: resolved };
}

/** Registry-backed resolver: every enabled video model + capability metadata. */
export async function resolveVideoModels(
  opts: { defaultModelId?: string; policy?: VerticalDramaTenantProviderPolicy } = {},
): Promise<VerticalDramaVideoModelResolution> {
  const models = await getModelsByTypeAsync("video");
  return resolveVideoModelsFromList(models, opts);
}

/**
 * Resolve a requested video model id/alias to a canonical registry model id.
 * Falls back through the registry alias map + the section-08 alias groups.
 */
export function resolveVideoModelId(requested: string): string | undefined {
  const direct = getModelById(requested);
  if (direct) return direct.id;
  const byAlias = findModelByAlias(requested, "video");
  if (byAlias) return byAlias.id;
  const lower = requested.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(VERTICAL_DRAMA_VIDEO_MODEL_ALIASES)) {
    if (canonical === lower || aliases.some((a) => a.toLowerCase() === lower)) {
      const m = findModelByAlias(canonical, "video");
      if (m) return m.id;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Capability gating + routing (spec §11.5)                                    */
/* -------------------------------------------------------------------------- */

export interface RouteVideoInput {
  model: ModelDefinition;
  policy?: VerticalDramaTenantProviderPolicy;
  requestedMotionMode: VerticalDramaMotionMode;
  /** True when a start/last frame or reference contains a human face. */
  containsHumanFace: boolean;
  requireFirstLastFrame: boolean;
  requireNativeAudio: boolean;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  clipDurationsSeconds: number[];
  prompt: string;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  referenceAssetIds?: string[];
  /** External-provider config presence flag (spec §9.1 explicit-config gate). */
  externalConfigured?: boolean;
}

/**
 * Decide the provider path + normalized/raw status + blocking reasons for a
 * single video routing request. Pure — no I/O. Preserves raw upstream status
 * ALONGSIDE the app-normalized status (spec §7.2 / §11.5).
 */
export function routeVideo(input: RouteVideoInput): VideoRoutingDecision {
  const policy = input.policy ?? VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY;
  const caps = deriveVideoCapabilities(input.model, policy);
  const family = detectProviderFamily(input.model);
  const aspect = input.aspectRatio ?? VERTICAL_DRAMA_TARGET_ASPECT_RATIO;
  const blockingReasons: string[] = [];

  const policyAllowed =
    policy.allowedProviders === undefined || policy.allowedProviders.includes(input.model.provider);
  if (!policyAllowed) blockingReasons.push("provider_not_in_tenant_allowlist");

  // Aspect-ratio gate.
  if (!caps.allowedAspectRatios.includes(aspect)) {
    blockingReasons.push(`aspect_ratio_unsupported:${aspect}`);
  }

  // Native-audio gate.
  if (input.requireNativeAudio && !caps.supportsNativeAudio) {
    blockingReasons.push("native_audio_unsupported");
  }

  // Human-face input gate — block or reroute unsupported face refs.
  const faceBlocked = input.containsHumanFace && !caps.supportsHumanFaceInputReference;
  if (faceBlocked) {
    blockingReasons.push(
      family === "openai"
        ? "openai_human_face_bridge_gated"
        : "human_face_input_unsupported",
    );
  }

  // First/last-frame gate.
  const wantsBridge =
    input.requireFirstLastFrame || input.requestedMotionMode === "first_last_frame_bridge";
  const bridgeAllowlisted = policy.bridgeAllowlist.includes(input.model.provider);
  const canBridge = caps.supportsFirstLastFrameVideo && bridgeAllowlisted && !faceBlocked && policyAllowed;

  // Resolve recommended provider path + statuses.
  let recommendedPath: VideoRoutingDecision["recommended_provider_path"];
  let executionStatus: VideoRoutingDecision["execution_status"];
  let normalizedStatus: VideoRoutingDecision["normalizedStatus"];

  if (faceBlocked && family === "openai") {
    // OpenAI Sora/Videos never becomes a silent human-face bridge default.
    recommendedPath = "manual_review";
    executionStatus = "manual_review_required";
    normalizedStatus = "manual_review_required";
  } else if (wantsBridge && canBridge) {
    recommendedPath = "veo_first_last_frame";
    executionStatus = "ready";
    normalizedStatus = "ready";
  } else if (wantsBridge && !canBridge) {
    // Needs first/last but provider can't — reroute or degrade (never silent).
    if (input.externalConfigured && policy.externalImageToVideo) {
      recommendedPath = "external_image_to_video";
      executionStatus = "external_provider_required";
      normalizedStatus = "external_provider_required";
      blockingReasons.push("first_last_frame_rerouted_to_external");
    } else if (policy.allowPromptOnlyFallback) {
      recommendedPath = "openai_prompt_only";
      executionStatus = "fallback_text_to_video";
      normalizedStatus = "fallback_prompt_only";
      blockingReasons.push("first_last_frame_unsupported_fallback_prompt_only");
    } else {
      recommendedPath = "manual_review";
      executionStatus = "blocked";
      normalizedStatus = "blocked";
      blockingReasons.push("first_last_frame_unsupported_no_fallback");
    }
  } else if (blockingReasons.length > 0) {
    recommendedPath = "manual_review";
    executionStatus = "blocked";
    normalizedStatus = "blocked";
  } else if (family === "openai") {
    recommendedPath = "openai_prompt_only";
    executionStatus = "ready";
    normalizedStatus = "ready";
  } else {
    recommendedPath = "veo_first_last_frame";
    executionStatus = "ready";
    normalizedStatus = "ready";
  }

  // If any hard blocking reason exists but we didn't already mark blocked and
  // the path isn't an explicit degrade, force blocked (fail-closed).
  if (
    blockingReasons.some(
      (r) =>
        r.startsWith("aspect_ratio_unsupported") ||
        r === "provider_not_in_tenant_allowlist" ||
        r === "native_audio_unsupported" ||
        r === "human_face_input_unsupported",
    ) &&
    normalizedStatus === "ready"
  ) {
    executionStatus = "blocked";
    normalizedStatus = "blocked";
    recommendedPath = "manual_review";
  }

  const providerRequest = buildProviderRequestSnapshot({
    model: input.model,
    caps,
    family,
    executionStatus,
    normalizedStatus,
    input,
  });

  return {
    provider: input.model.provider,
    provider_caps: caps,
    recommended_provider_path: recommendedPath,
    execution_status: executionStatus,
    normalizedStatus,
    blockingReasons,
    provider_request: providerRequest,
  };
}

/** Build the raw+normalized provider request snapshot (redacted, no secrets). */
function buildProviderRequestSnapshot(args: {
  model: ModelDefinition;
  caps: VerticalDramaProviderCapabilities;
  family: ReturnType<typeof detectProviderFamily>;
  executionStatus: VideoRoutingDecision["execution_status"];
  normalizedStatus: VideoRoutingDecision["normalizedStatus"];
  input: RouteVideoInput;
}): VerticalDramaProviderRequestSnapshot {
  const { model, family, executionStatus, normalizedStatus, input } = args;
  const snapshot: VerticalDramaProviderRequestSnapshot = {
    provider: model.provider,
    execution_status: executionStatus,
    normalizedStatus,
  };

  if (family === "veo") {
    const veo: VerticalDramaVeo31RequestSnapshot = {
      model: model.id,
      mode:
        input.requestedMotionMode === "first_last_frame_bridge"
          ? "first_last_frame"
          : input.requestedMotionMode === "first_frame_to_video"
            ? "first_frame"
            : "text_to_video",
      prompt: input.prompt,
      first_frame: input.firstFrameAssetId ? { asset_id: input.firstFrameAssetId } : undefined,
      last_frame: input.lastFrameAssetId ? { asset_id: input.lastFrameAssetId } : null,
      reference_images: (input.referenceAssetIds ?? []).map((id) => ({ asset_id: id })),
      duration_seconds: input.clipDurationsSeconds[0] ?? 8,
      aspect_ratio: input.aspectRatio ?? VERTICAL_DRAMA_TARGET_ASPECT_RATIO,
      generate_audio: input.requireNativeAudio,
    };
    snapshot.veo31_request = veo;
  } else {
    snapshot.external_image_to_video_request = redactProviderPayload({
      model: model.id,
      provider: model.provider,
      motion_mode: input.requestedMotionMode,
      prompt: input.prompt,
      first_frame_asset_id: input.firstFrameAssetId ?? null,
      last_frame_asset_id: input.lastFrameAssetId ?? null,
      reference_asset_ids: input.referenceAssetIds ?? [],
      duration_seconds: input.clipDurationsSeconds,
      aspect_ratio: input.aspectRatio ?? VERTICAL_DRAMA_TARGET_ASPECT_RATIO,
      generate_audio: input.requireNativeAudio,
    }) as Record<string, unknown>;
  }
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Bridge / fallback clip planning (spec §7.4)                                 */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaClipJobPlan {
  clipNumber: number;
  sourceFrameNumbers: number[];
  firstFrameIndex: number;
  lastFrameIndex?: number;
  durationSeconds: number;
  motionMode: VerticalDramaMotionMode;
}

/**
 * Plan the DEFAULT bridge profile: 8 provider jobs from 9 selected frames with
 * the `8+8+8+8+8+8+8+4` timing, each job bridging frame i -> frame i+1.
 */
export function planBridgeClipJobs(frameCount = VERTICAL_DRAMA_SHOT_COUNT): VerticalDramaClipJobPlan[] {
  const timing = VERTICAL_DRAMA_BRIDGE_TIMING_SECONDS;
  const jobs: VerticalDramaClipJobPlan[] = [];
  for (let i = 0; i < frameCount - 1; i++) {
    jobs.push({
      clipNumber: i + 1,
      sourceFrameNumbers: [i + 1, i + 2],
      firstFrameIndex: i,
      lastFrameIndex: i + 1,
      durationSeconds: timing[i] ?? 8,
      motionMode: "first_last_frame_bridge",
    });
  }
  return jobs;
}

/** Plan the fallback profile: 9 clips, per-shot first-frame-or-prompt motion. */
export function planFallbackClipJobs(shotCount = VERTICAL_DRAMA_SHOT_COUNT): VerticalDramaClipJobPlan[] {
  const timing = VERTICAL_DRAMA_FALLBACK_TIMING_SECONDS;
  const jobs: VerticalDramaClipJobPlan[] = [];
  for (let i = 0; i < shotCount; i++) {
    jobs.push({
      clipNumber: i + 1,
      sourceFrameNumbers: [i + 1],
      firstFrameIndex: i,
      durationSeconds: timing[i] ?? 8,
      motionMode: "first_frame_to_video",
    });
  }
  return jobs;
}

/**
 * Choose the duration profile for a resolved model: the default first/last-frame
 * bridge when the provider supports it, else the fallback per-shot profile.
 */
export function chooseDurationProfile(caps: VerticalDramaProviderCapabilities): {
  profileId: string;
  jobs: VerticalDramaClipJobPlan[];
  motionMode: VerticalDramaMotionMode;
} {
  if (caps.supportsFirstLastFrameVideo) {
    return {
      profileId: VERTICAL_DRAMA_BRIDGE_PROFILE_ID,
      jobs: planBridgeClipJobs(),
      motionMode: "first_last_frame_bridge",
    };
  }
  return {
    profileId: VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.id,
    jobs: planFallbackClipJobs(),
    motionMode: "first_frame_to_video",
  };
}

/* -------------------------------------------------------------------------- */
/* Sub-shot decomposition + capability gate (spec §7.4)                        */
/* -------------------------------------------------------------------------- */

/** Even-split `total` into `count` parts each >= `floor`, summing exactly. */
function splitDurations(total: number, count: number, floor: number): number[] {
  const n = Math.max(1, count);
  if (n === 1) return [round2(total)];
  const base = Math.max(floor, round2(total / n));
  const parts = new Array(n - 1).fill(base);
  parts.push(round2(total - base * (n - 1)));
  return parts;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface SubShotDecomposition {
  flagOn: boolean;
  policy: VerticalDramaSubShotPolicy;
  shots: Array<{
    parentShotNumber: number;
    mainShotDurationSeconds: number;
    subShotCount: number;
    subShots: VerticalDramaSubShot[];
    /** How the resolved count was reached (auto/degraded/collapsed). */
    decision: "auto" | "fixed" | "fewer_sub_shots" | "single_clip";
  }>;
  provider_feasibility: { blocking_reasons: string[] };
  valid: boolean;
  validationErrors: string[];
}

/**
 * Decompose each main shot into provider-FEASIBLE sub-shots. The capability gate
 * enforces `minSubShotSeconds` >= the provider's clip-duration floor and the
 * resolved count <= `maxPerShot`, reducing or collapsing per
 * `fallbackOnUnsupported` and recording every degrade reason (never silent).
 */
export function decomposeSubShots(
  shots: Array<{ shotNumber: number; durationSeconds: number }>,
  policy: VerticalDramaSubShotPolicy,
  caps: VerticalDramaProviderCapabilities,
  opts: { perSubShotStartFrames?: boolean } = {},
): SubShotDecomposition {
  const blockingReasons: string[] = [];
  const validationErrors: string[] = [];
  // The provider's shortest renderable clip. If it is ABOVE the desired
  // sub-shot floor, the provider cannot render short cuts (spec §7.4 gate).
  const providerFloor =
    caps.allowedVideoSeconds.length > 0 ? Math.min(...caps.allowedVideoSeconds) : 0;
  // The floor actually applied when splitting: the stricter of the sub-shot
  // floor and what the provider can render.
  const appliedFloor = Math.max(policy.minSubShotSeconds, providerFloor);
  const outShots: SubShotDecomposition["shots"] = [];

  for (const shot of shots) {
    // Desired count assuming the provider can render down to minSubShotSeconds.
    const desiredCount =
      policy.mode === "fixed"
        ? Math.max(1, Math.min(policy.targetPerShot, policy.maxPerShot))
        : computeAutoSubShotCount(shot.durationSeconds, {
            targetPerShot: policy.targetPerShot,
            maxPerShot: policy.maxPerShot,
            minSubShotSeconds: policy.minSubShotSeconds,
          });
    // Feasible count given what the provider can actually render (applied floor).
    const feasibleByFloor = Math.max(1, Math.floor(shot.durationSeconds / appliedFloor));
    let count = Math.min(desiredCount, feasibleByFloor);

    let decision: SubShotDecomposition["shots"][number]["decision"] =
      policy.mode === "fixed" ? "fixed" : "auto";

    // Sub-shot min-duration feasibility: the provider must render cuts as short
    // as minSubShotSeconds. When its floor is higher AND that forces a reduction,
    // decomposition is reduced or collapsed — never silent (spec §7.4).
    if (providerFloor > policy.minSubShotSeconds && desiredCount > count) {
      blockingReasons.push(
        `sub_shot_min_duration_infeasible: shot ${shot.shotNumber} provider floor ${providerFloor}s exceeds minSubShotSeconds ${policy.minSubShotSeconds}s (wanted ${desiredCount}, feasible ${count})`,
      );
      decision = policy.fallbackOnUnsupported === "single_clip" ? "single_clip" : "fewer_sub_shots";
    } else if (desiredCount > count) {
      blockingReasons.push(
        `sub_shot_count_reduced_to_feasible: shot ${shot.shotNumber} floor ${appliedFloor}s allows <= ${count} cuts (wanted ${desiredCount})`,
      );
      decision = policy.fallbackOnUnsupported === "single_clip" ? "single_clip" : "fewer_sub_shots";
    }

    // Sub-shot count feasibility: never exceed maxPerShot.
    if (count > policy.maxPerShot) {
      blockingReasons.push(
        `sub_shot_count_infeasible: shot ${shot.shotNumber} count ${count} > maxPerShot ${policy.maxPerShot}`,
      );
      count = policy.maxPerShot;
      decision = "fewer_sub_shots";
    }

    // fallbackOnUnsupported === single_clip collapses any degraded shot.
    if (decision !== "auto" && decision !== "fixed" && policy.fallbackOnUnsupported === "single_clip") {
      count = 1;
      decision = "single_clip";
    }

    // Input-mode feasibility: distinct per-sub-shot start frames require image refs.
    if (opts.perSubShotStartFrames && !caps.supportsImageReferences) {
      blockingReasons.push(
        `sub_shot_input_mode_infeasible: shot ${shot.shotNumber} needs per-sub-shot start frames but provider lacks image references`,
      );
      count = 1;
      decision = "single_clip";
    }

    const durations = splitDurations(shot.durationSeconds, count, appliedFloor);
    const subShots: VerticalDramaSubShot[] = durations.map((durationSeconds, idx) => ({
      subShotNumber: idx + 1,
      parentShotNumber: shot.shotNumber,
      durationSeconds,
      cameraSetup: `sub-cut ${idx + 1}: reframe within shot ${shot.shotNumber}`,
      prompt: `Sub-shot ${idx + 1} of shot ${shot.shotNumber}`,
      transitionIn: idx === 0 ? "cut" : "match_cut",
      status: "planned",
    }));

    // A single (collapsed / non-decomposed) clip IS the parent shot, so it is
    // not validated against the sub-shot floor — that is a routing concern.
    const validation = validateSubShotsForParent(shot.durationSeconds, subShots, {
      maxPerShot: policy.maxPerShot,
      minSubShotSeconds: subShots.length > 1 ? appliedFloor : 0,
    });
    if (!validation.valid) validationErrors.push(...validation.errors);

    outShots.push({
      parentShotNumber: shot.shotNumber,
      mainShotDurationSeconds: shot.durationSeconds,
      subShotCount: subShots.length,
      subShots,
      decision,
    });
  }

  return {
    flagOn: true,
    policy,
    shots: outShots,
    provider_feasibility: { blocking_reasons: blockingReasons },
    valid: validationErrors.length === 0,
    validationErrors,
  };
}

/* -------------------------------------------------------------------------- */
/* Secret / signed-URL redaction (spec Acceptance: no secret/URL leakage)      */
/* -------------------------------------------------------------------------- */

const SECRET_KEY_RE = /(api[_-]?key|authorization|bearer|token|secret|signature|x-goog|credential|password)/i;

/** Deep-redact secrets and strip signed-URL query strings from a payload. */
export function redactProviderPayload(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactProviderPayload);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactProviderPayload(v);
      }
    }
    return out;
  }
  return value;
}

function redactString(s: string): string {
  // Strip query strings from URLs (signed-URL params must never leak).
  if (/^https?:\/\//i.test(s) && s.includes("?")) {
    return `${s.split("?")[0]}?[REDACTED]`;
  }
  return s;
}

/* -------------------------------------------------------------------------- */
/* Provider error mapping (spec §9.1)                                          */
/* -------------------------------------------------------------------------- */

/** Map a raw provider error into a stable app error code + message. */
export function mapProviderError(raw: {
  status?: number;
  code?: string;
  message?: string;
}): { errorCode: VerticalDramaProviderErrorCode; errorMessage: string } {
  const msg = (raw.message ?? "").toLowerCase();
  const code = (raw.code ?? "").toLowerCase();
  const status = raw.status;

  if (msg.includes("timed out") || msg.includes("timeout") || code.includes("timeout")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.TIMEOUT, errorMessage: "Provider job timed out." };
  }
  if (status === 429 || msg.includes("rate limit") || code.includes("rate")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.RATE_LIMITED, errorMessage: "Provider rate limit exceeded." };
  }
  if (msg.includes("face") || code.includes("face")) {
    return {
      errorCode: VD_PROVIDER_ERROR_CODES.FACE_INPUT_NOT_ALLOWED,
      errorMessage: "Human-face input reference is not allowed for this provider.",
    };
  }
  if (msg.includes("content") || msg.includes("policy") || msg.includes("blocked") || msg.includes("safety")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.CONTENT_BLOCKED, errorMessage: "Provider blocked the content." };
  }
  if (msg.includes("duration")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.UNSUPPORTED_DURATION, errorMessage: "Requested clip duration is not supported." };
  }
  if (msg.includes("aspect")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.UNSUPPORTED_ASPECT_RATIO, errorMessage: "Requested aspect ratio is not supported." };
  }
  if (status === 400 || msg.includes("invalid")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.INVALID_INPUT, errorMessage: "Provider rejected the request payload." };
  }
  if (status === 503 || status === 502 || msg.includes("unavailable")) {
    return { errorCode: VD_PROVIDER_ERROR_CODES.PROVIDER_UNAVAILABLE, errorMessage: "Provider is temporarily unavailable." };
  }
  return { errorCode: VD_PROVIDER_ERROR_CODES.UNKNOWN, errorMessage: raw.message ?? "Unknown provider error." };
}

/* -------------------------------------------------------------------------- */
/* Named provider adapters (spec §9.1)                                         */
/* -------------------------------------------------------------------------- */

function stableHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

/** Deterministic, key-free Mock adapter for dry-run + tests (spec §9.1). */
export class MockVideoProvider implements VerticalDramaVideoProviderAdapter {
  readonly providerId = "mock";
  readonly capabilities: VerticalDramaProviderCapabilities;

  constructor(capabilities?: Partial<VerticalDramaProviderCapabilities>) {
    this.capabilities = {
      supportsImageGeneration: false,
      supportsImageReferences: true,
      supportsVideoGeneration: true,
      supportsVideoInputReference: true,
      supportsFirstLastFrameVideo: true,
      supportsHumanFaceInputReference: true,
      supportsHumanLikenessCharacterAsset: true,
      supportsNativeAudio: true,
      supportsThaiNativeAudio: true,
      supportsSeparateTts: true,
      supportsDialogueTts: true,
      supportsSubtitleBurnIn: false,
      allowedVideoSeconds: [4, 8],
      allowedVideoSizes: ["720x1280", "1080x1920"],
      allowedAspectRatios: ["9:16", "16:9", "1:1"],
      ...capabilities,
    };
  }

  async createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob> {
    const id = `mock-${stableHash(request.normalized)}`;
    const now = "1970-01-01T00:00:00.000Z"; // deterministic for tests
    return {
      providerJobId: id,
      status: "queued",
      provider: this.providerId,
      createdAt: now,
      updatedAt: now,
      pollAfterSeconds: 0,
    };
  }

  async getJob(jobId: string): Promise<VerticalDramaProviderJob> {
    const now = "1970-01-01T00:00:00.000Z";
    return {
      providerJobId: jobId,
      status: "succeeded",
      provider: this.providerId,
      createdAt: now,
      updatedAt: now,
      resultUrl: `mock://vertical-drama/${jobId}.mp4`,
    };
  }

  async downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult> {
    return {
      raw: { jobId, provider: this.providerId },
      normalized: {
        providerJobId: jobId,
        resultUrl: `mock://vertical-drama/${jobId}.mp4`,
        checksumSha256: createHash("sha256").update(jobId).digest("hex"),
        contentType: "video/mp4",
      },
    };
  }

  async cancelJob(_jobId: string): Promise<void> {
    /* deterministic no-op */
  }
}

/**
 * Veo-compatible first/last-frame bridge adapter (MVP production path). Requires
 * a real runtime client to be injected; without one it stays dry-run-safe and
 * routes through the Mock deterministic behavior so nothing calls a paid API.
 */
export class VeoCompatibleVideoProvider implements VerticalDramaVideoProviderAdapter {
  readonly providerId: string;
  readonly capabilities: VerticalDramaProviderCapabilities;
  private readonly fallback = new MockVideoProvider();
  private readonly runtime?: VerticalDramaVideoProviderAdapter;

  constructor(args: {
    providerId: string;
    capabilities: VerticalDramaProviderCapabilities;
    runtime?: VerticalDramaVideoProviderAdapter;
  }) {
    this.providerId = args.providerId;
    this.capabilities = args.capabilities;
    this.runtime = args.runtime;
  }

  async createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob> {
    return (this.runtime ?? this.fallback).createClip(request);
  }
  async getJob(jobId: string): Promise<VerticalDramaProviderJob> {
    return (this.runtime ?? this.fallback).getJob(jobId);
  }
  async downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult> {
    return (this.runtime ?? this.fallback).downloadResult(jobId);
  }
  async cancelJob(jobId: string): Promise<void> {
    await (this.runtime ?? this.fallback).cancelJob?.(jobId);
  }
}

/** OpenAI (Sora/Videos) adapter — prompt-only / capability-gated fallback. */
export class OpenAIVideoProvider implements VerticalDramaVideoProviderAdapter {
  readonly providerId: string;
  readonly capabilities: VerticalDramaProviderCapabilities;
  private readonly fallback = new MockVideoProvider({ supportsFirstLastFrameVideo: false });
  private readonly runtime?: VerticalDramaVideoProviderAdapter;

  constructor(args: {
    providerId: string;
    capabilities: VerticalDramaProviderCapabilities;
    runtime?: VerticalDramaVideoProviderAdapter;
  }) {
    this.providerId = args.providerId;
    this.capabilities = args.capabilities;
    this.runtime = args.runtime;
  }

  async createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob> {
    return (this.runtime ?? this.fallback).createClip(request);
  }
  async getJob(jobId: string): Promise<VerticalDramaProviderJob> {
    return (this.runtime ?? this.fallback).getJob(jobId);
  }
  async downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult> {
    return (this.runtime ?? this.fallback).downloadResult(jobId);
  }
}

/** External image-to-video adapter — unavailable until explicit tenant config. */
export class ExternalImageToVideoProvider implements VerticalDramaVideoProviderAdapter {
  readonly providerId: string;
  readonly capabilities: VerticalDramaProviderCapabilities;
  private readonly config?: VerticalDramaTenantProviderPolicy["externalImageToVideo"];
  private readonly runtime?: VerticalDramaVideoProviderAdapter;

  constructor(args: {
    providerId: string;
    capabilities: VerticalDramaProviderCapabilities;
    config?: VerticalDramaTenantProviderPolicy["externalImageToVideo"];
    runtime?: VerticalDramaVideoProviderAdapter;
  }) {
    this.providerId = args.providerId;
    this.capabilities = args.capabilities;
    this.config = args.config;
    this.runtime = args.runtime;
  }

  /** Whether this adapter is selectable (requires complete explicit config). */
  get available(): boolean {
    const c = this.config;
    return Boolean(c?.baseUrl && c?.apiKeyEnv && c?.createEndpoint && c?.statusEndpoint && c?.downloadEndpoint);
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new Error("VD_EXTERNAL_PROVIDER_NOT_CONFIGURED");
    }
  }

  async createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob> {
    this.assertAvailable();
    if (!this.runtime) throw new Error("VD_EXTERNAL_PROVIDER_NO_RUNTIME");
    return this.runtime.createClip(request);
  }
  async getJob(jobId: string): Promise<VerticalDramaProviderJob> {
    this.assertAvailable();
    if (!this.runtime) throw new Error("VD_EXTERNAL_PROVIDER_NO_RUNTIME");
    return this.runtime.getJob(jobId);
  }
  async downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult> {
    this.assertAvailable();
    if (!this.runtime) throw new Error("VD_EXTERNAL_PROVIDER_NO_RUNTIME");
    return this.runtime.downloadResult(jobId);
  }
}

/**
 * Select the named adapter for a resolved model + policy. Dry-run/test callers
 * omit `runtime` and receive a deterministic, key-free adapter.
 */
export function selectVideoProviderAdapter(
  model: ModelDefinition,
  policy: VerticalDramaTenantProviderPolicy = VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
  opts: { runtime?: VerticalDramaVideoProviderAdapter; forceMock?: boolean } = {},
): VerticalDramaVideoProviderAdapter {
  if (opts.forceMock) return new MockVideoProvider();
  const caps = deriveVideoCapabilities(model, policy);
  const family = detectProviderFamily(model);
  if (family === "openai") {
    return new OpenAIVideoProvider({ providerId: model.provider, capabilities: caps, runtime: opts.runtime });
  }
  if (policy.externalImageToVideo && !caps.supportsFirstLastFrameVideo) {
    return new ExternalImageToVideoProvider({
      providerId: model.provider,
      capabilities: caps,
      config: policy.externalImageToVideo,
      runtime: opts.runtime,
    });
  }
  return new VeoCompatibleVideoProvider({ providerId: model.provider, capabilities: caps, runtime: opts.runtime });
}

/* -------------------------------------------------------------------------- */
/* Provider job lifecycle (spec §9.1)                                          */
/* -------------------------------------------------------------------------- */

export type VerticalDramaProviderJobStatus = VerticalDramaProviderJob["status"];

export interface ProviderJobLifecycleOptions {
  timeoutSeconds?: number;
  /** ISO timestamp used as "now" for deterministic timeout checks in tests. */
  now?: () => Date;
}

/**
 * Orchestrates the provider job lifecycle over an injected adapter:
 * create / poll / webhook / download / cancel / retry, plus timeout + stale
 * detection. Never calls a paid API directly — everything goes through the
 * adapter, so the Mock adapter makes this fully exercisable without keys.
 */
export class VerticalDramaProviderJobLifecycle {
  private readonly timeoutSeconds: number;
  private readonly now: () => Date;

  constructor(
    private readonly adapter: VerticalDramaVideoProviderAdapter,
    opts: ProviderJobLifecycleOptions = {},
  ) {
    this.timeoutSeconds = opts.timeoutSeconds ?? VERTICAL_DRAMA_DEFAULT_JOB_TIMEOUT_SECONDS;
    this.now = opts.now ?? (() => new Date());
  }

  /** Submit a provider job (only after approval/credit/QC gates upstream). */
  async create(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob> {
    return this.adapter.createClip(request);
  }

  /** Refresh provider status without mutating prompts/frames; enforces timeout. */
  async poll(job: VerticalDramaProviderJob): Promise<VerticalDramaProviderJob> {
    if (this.isTimedOut(job)) return this.markTimedOut(job);
    const refreshed = await this.adapter.getJob(job.providerJobId);
    if (this.isTimedOut(refreshed) && refreshed.status !== "succeeded") {
      return this.markTimedOut(refreshed);
    }
    return refreshed;
  }

  /** Accept a provider callback payload (verified upstream) and normalize it. */
  acceptWebhook(payload: {
    providerJobId: string;
    provider: string;
    status: VerticalDramaProviderJobStatus;
    resultUrl?: string;
    error?: { status?: number; code?: string; message?: string };
    createdAt?: string;
  }): VerticalDramaProviderJob {
    const nowIso = this.now().toISOString();
    const base: VerticalDramaProviderJob = {
      providerJobId: payload.providerJobId,
      provider: payload.provider,
      status: payload.status,
      createdAt: payload.createdAt ?? nowIso,
      updatedAt: nowIso,
      resultUrl: payload.resultUrl,
    };
    if (payload.status === "failed" && payload.error) {
      const mapped = mapProviderError(payload.error);
      base.errorCode = mapped.errorCode;
      base.errorMessage = mapped.errorMessage;
    }
    return base;
  }

  /** Stage a provider output (download/import). Returns the redacted result. */
  async download(job: VerticalDramaProviderJob): Promise<VerticalDramaProviderDownloadResult> {
    const result = await this.adapter.downloadResult(job.providerJobId);
    return { raw: redactProviderPayload(result.raw), normalized: result.normalized };
  }

  /** Cancel a queued/running job when the provider supports it; mark repairable. */
  async cancel(job: VerticalDramaProviderJob): Promise<VerticalDramaProviderJob> {
    if (this.adapter.cancelJob) await this.adapter.cancelJob(job.providerJobId);
    return { ...job, status: "cancelled", updatedAt: this.now().toISOString() };
  }

  /** Create a NEW attempt linked to the prior provider job (retry / repair). */
  async retry(
    prior: VerticalDramaProviderJob,
    request: VerticalDramaVideoClipProviderRequest,
  ): Promise<{ job: VerticalDramaProviderJob; retryOfProviderJobId: string }> {
    const next = await this.adapter.createClip(request);
    return { job: next, retryOfProviderJobId: prior.providerJobId };
  }

  /** True when a running/queued job has exceeded its timeout. */
  isTimedOut(job: VerticalDramaProviderJob): boolean {
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return false;
    const created = new Date(job.createdAt).getTime();
    if (!Number.isFinite(created)) return false;
    const ageSeconds = (this.now().getTime() - created) / 1000;
    return ageSeconds > this.timeoutSeconds;
  }

  private markTimedOut(job: VerticalDramaProviderJob): VerticalDramaProviderJob {
    return {
      ...job,
      status: "timed_out",
      updatedAt: this.now().toISOString(),
      errorCode: VD_PROVIDER_ERROR_CODES.TIMEOUT,
      errorMessage: "Provider job exceeded its timeout and was marked repairable.",
    };
  }

  /** A timed_out or failed job remains repairable. */
  static isRepairable(job: VerticalDramaProviderJob): boolean {
    return job.status === "timed_out" || job.status === "failed" || job.status === "cancelled";
  }
}

/* -------------------------------------------------------------------------- */
/* High-level routing plan (produces VideoRoutingDecision)                     */
/* -------------------------------------------------------------------------- */

export interface PlanProviderRoutingInput {
  model: ModelDefinition;
  policy?: VerticalDramaTenantProviderPolicy;
  requestedMotionMode?: VerticalDramaMotionMode;
  containsHumanFace?: boolean;
  requireFirstLastFrame?: boolean;
  requireNativeAudio?: boolean;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  prompt?: string;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  referenceAssetIds?: string[];
  externalConfigured?: boolean;
  /** Sub-shot decomposition (only when the flag is on). */
  subShots?: {
    flagOn: boolean;
    policy?: VerticalDramaSubShotPolicy;
    shots?: Array<{ shotNumber: number; durationSeconds: number }>;
    perSubShotStartFrames?: boolean;
  };
}

export interface ProviderRoutingPlan {
  decision: VideoRoutingDecision;
  durationProfileId: string;
  motionMode: VerticalDramaMotionMode;
  clipJobs: VerticalDramaClipJobPlan[];
  subShotPlan?: SubShotDecomposition;
  creditEstimate: { modelId: string; clipCount: number; estimatedCredits: number };
}

/** Produce the full provider routing plan (decision + jobs + optional sub-shots). */
export function planProviderRouting(input: PlanProviderRoutingInput): ProviderRoutingPlan {
  const policy = input.policy ?? VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY;
  const caps = deriveVideoCapabilities(input.model, policy);
  const profile = chooseDurationProfile(caps);

  const decision = routeVideo({
    model: input.model,
    policy,
    requestedMotionMode: input.requestedMotionMode ?? profile.motionMode,
    containsHumanFace: input.containsHumanFace ?? false,
    requireFirstLastFrame: input.requireFirstLastFrame ?? caps.supportsFirstLastFrameVideo,
    requireNativeAudio: input.requireNativeAudio ?? false,
    aspectRatio: input.aspectRatio ?? VERTICAL_DRAMA_TARGET_ASPECT_RATIO,
    clipDurationsSeconds: profile.jobs.map((j) => j.durationSeconds),
    prompt: input.prompt ?? "",
    firstFrameAssetId: input.firstFrameAssetId,
    lastFrameAssetId: input.lastFrameAssetId,
    referenceAssetIds: input.referenceAssetIds,
    externalConfigured: input.externalConfigured,
  });

  let subShotPlan: SubShotDecomposition | undefined;
  let clipJobs = profile.jobs;
  if (input.subShots?.flagOn) {
    const subPolicy = input.subShots.policy ?? { ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT, enabled: true };
    const shots =
      input.subShots.shots ??
      profile.jobs.map((j) => ({ shotNumber: j.clipNumber, durationSeconds: j.durationSeconds }));
    subShotPlan = decomposeSubShots(shots, subPolicy, caps, {
      perSubShotStartFrames: input.subShots.perSubShotStartFrames,
    });
    // Expand into per-sub-shot clip jobs carrying parent + sub numbers.
    clipJobs = subShotPlan.shots.flatMap((ps) =>
      ps.subShots.map((ss) => ({
        clipNumber: ps.parentShotNumber * 100 + ss.subShotNumber,
        sourceFrameNumbers: [ps.parentShotNumber],
        firstFrameIndex: ps.parentShotNumber - 1,
        durationSeconds: ss.durationSeconds,
        motionMode: profile.motionMode,
      })),
    );
  }

  const estimatedCredits = input.model.creditCost * clipJobs.length;
  return {
    decision,
    durationProfileId: profile.profileId,
    motionMode: profile.motionMode,
    clipJobs,
    subShotPlan,
    creditEstimate: { modelId: input.model.id, clipCount: clipJobs.length, estimatedCredits },
  };
}

/* -------------------------------------------------------------------------- */
/* Provider routing port (dry-run-safe seam into the runner — spec §11.5)      */
/* -------------------------------------------------------------------------- */

export interface CreateProviderRoutingPortOptions {
  policy?: VerticalDramaTenantProviderPolicy;
  /** Force the deterministic Mock adapter (default true → never spends). */
  dryRunSafe?: boolean;
  runtime?: VerticalDramaVideoProviderAdapter;
}

/**
 * Build a `ProviderRoutingPort` the section-04 runner can wire in. It NEVER
 * calls a paid API: paid stages are routed + gated, and rendering resolves
 * through the deterministic Mock adapter, so the runner stays dry-run-safe.
 */
export function createVerticalDramaProviderRoutingPort(
  opts: CreateProviderRoutingPortOptions = {},
): ProviderRoutingPort {
  const policy = opts.policy ?? VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY;
  const dryRunSafe = opts.dryRunSafe ?? true;

  return {
    async routeAndRenderStage(req: ProviderRoutingStageRequest): Promise<ProviderRoutingStageResult> {
      // Only the video-clip stage routes through provider selection here.
      if (req.stage !== "render_or_import_video_clips") {
        return { status: "skipped", mediaAssetIds: [], warnings: [], errors: [], blockingReasons: [] };
      }

      const payload = (req.payload ?? {}) as Record<string, unknown>;
      const requestedModelId = String(payload.selectedVideoModelId ?? VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL);
      const resolvedId = resolveVideoModelId(requestedModelId) ?? VERTICAL_DRAMA_DEFAULT_VIDEO_MODEL;
      const model = getModelById(resolvedId);

      if (!model) {
        return {
          status: "blocked",
          mediaAssetIds: [],
          warnings: [],
          errors: [
            {
              code: "VD_VIDEO_MODEL_NOT_FOUND",
              message: `No enabled video model resolved for "${requestedModelId}".`,
              repairable: true,
            },
          ],
          blockingReasons: ["video_model_not_found"],
        };
      }

      const plan = planProviderRouting({ model, policy });
      const status = plan.decision.normalizedStatus;

      if (status === "blocked" || status === "manual_review_required") {
        return {
          status: "blocked",
          mediaAssetIds: [],
          warnings: [
            {
              code: "VD_PROVIDER_ROUTING_BLOCKED",
              severity: "blocking",
              message: `Provider routing ${status}: ${plan.decision.blockingReasons.join("; ")}`,
              targetStage: req.stage,
              repairable: true,
            },
          ],
          errors: [],
          blockingReasons: plan.decision.blockingReasons,
        };
      }

      // Dry-run-safe: plan resolved OK; a real conductor-wired runtime performs
      // the paid render + staging. Here we render nothing and spend nothing.
      void dryRunSafe;
      return {
        status: "ready",
        mediaAssetIds: [],
        warnings: [
          {
            code: "VD_PROVIDER_ROUTING_PLANNED",
            severity: "info",
            message: `Routed to ${plan.decision.recommended_provider_path} (${plan.durationProfileId}); no paid render in dry-run-safe port.`,
            targetStage: req.stage,
            repairable: false,
          },
        ],
        errors: [],
        blockingReasons: plan.decision.blockingReasons,
      };
    },
  };
}
