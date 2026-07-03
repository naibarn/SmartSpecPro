/**
 * Vertical Drama Series — Provider routing & video-model capability contracts.
 *
 * Pure field-only TypeScript contracts (spec §7.2, §9.1, §11.5). No server/db
 * imports so the client can import these directly.
 *
 * These types deliberately preserve the upstream GitHub guide's snake_case
 * payload shapes ("raw upstream") alongside SmartSpecPro's normalized app
 * status so the two round-trip together and never get lossy-mapped on import.
 */

/** Upstream (GitHub guide) per-asset reference shape carried through provider payloads. */
export type VerticalDramaUpstreamAssetReference = {
  asset_id?: string;
  file_id?: string;
  image_url?: string;
  local_path?: string;
  contains_human_face?: boolean;
  openai_input_reference_allowed?: boolean;
};

/** Raw Veo 3.1 request skeleton preserved verbatim from the upstream guide. */
export type VerticalDramaVeo31RequestSnapshot = {
  model?: string;
  mode?: "first_last_frame" | "first_frame" | "text_to_video" | string;
  prompt: string;
  first_frame?: VerticalDramaUpstreamAssetReference | Record<string, unknown>;
  last_frame?: VerticalDramaUpstreamAssetReference | Record<string, unknown> | null;
  reference_images?: Array<VerticalDramaUpstreamAssetReference | Record<string, unknown>>;
  duration_seconds: number;
  aspect_ratio: "9:16" | string;
  resolution?: string;
  generate_audio?: boolean;
};

/**
 * Provider request snapshot — stores the raw upstream snake_case `execution_status`
 * AND the SmartSpecPro normalized status together (spec §7.2, §11.5).
 */
export type VerticalDramaProviderRequestSnapshot = {
  provider: string;
  execution_status:
    | "ready"
    | "blocked"
    | "fallback_text_to_video"
    | "manual_review_required"
    | "external_provider_required"
    | string;
  normalizedStatus:
    | "ready"
    | "blocked"
    | "fallback_prompt_only"
    | "manual_review_required"
    | "external_provider_required";
  external_image_to_video_request?: Record<string, unknown>;
  veo31_request?: VerticalDramaVeo31RequestSnapshot;
};

/** Provider capability matrix used to gate routing, durations, and audio (spec §11.5). */
export type VerticalDramaProviderCapabilities = {
  supportsImageGeneration: boolean;
  supportsImageReferences: boolean;
  supportsVideoGeneration: boolean;
  supportsVideoInputReference: boolean;
  supportsFirstLastFrameVideo: boolean;
  supportsHumanFaceInputReference: boolean;
  supportsHumanLikenessCharacterAsset: boolean;
  supportsNativeAudio: boolean;
  supportsThaiNativeAudio: boolean;
  supportsSeparateTts: boolean;
  supportsDialogueTts: boolean;
  supportsSubtitleBurnIn: boolean;
  allowedVideoSeconds: number[];
  allowedVideoSizes: Array<"720x1280" | "1024x1792" | "1080x1920" | string>;
  allowedAspectRatios: Array<"9:16" | "16:9" | "1:1">;
};

/**
 * VideoRoutingDecision — app-normalized routing outcome for a video stage (spec §11.5).
 * `provider_request` holds raw upstream snake_case AND normalized status together.
 */
export type VideoRoutingDecision = {
  provider: string;
  provider_caps: VerticalDramaProviderCapabilities;
  recommended_provider_path:
    | "veo_first_last_frame"
    | "external_image_to_video"
    | "openai_prompt_only"
    | "manual_review";
  execution_status:
    | "ready"
    | "blocked"
    | "fallback_text_to_video"
    | "manual_review_required"
    | "external_provider_required";
  normalizedStatus:
    | "ready"
    | "blocked"
    | "fallback_prompt_only"
    | "manual_review_required"
    | "external_provider_required";
  blockingReasons: string[];
  provider_request: VerticalDramaProviderRequestSnapshot;
};

/** Provider adapter clip request (spec §9.1). `raw` preserves unknown upstream fields. */
export type VerticalDramaVideoClipProviderRequest = {
  raw: unknown;
  normalized: {
    provider: string;
    motionMode: string;
    prompt: string;
    durationSeconds: number;
    aspectRatio: "9:16" | string;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
    referenceAssetIds?: string[];
    generateAudio?: boolean;
  };
};

/** Provider adapter download result (spec §9.1). */
export type VerticalDramaProviderDownloadResult = {
  raw: unknown;
  normalized: {
    providerJobId: string;
    resultUrl?: string;
    stagedMediaAssetId?: string;
    checksumSha256?: string;
    contentType?: string;
  };
};

/** Provider job lifecycle (spec §9.1). */
export type VerticalDramaProviderJob = {
  providerJobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  provider: string;
  createdAt: string;
  updatedAt: string;
  pollAfterSeconds?: number;
  resultUrl?: string;
  stagedMediaAssetId?: string;
  errorCode?: string;
  errorMessage?: string;
};

/** Video model routing plan produced by the motion-prompt stage (spec §9.1). */
export type VerticalDramaVideoModelRoutingPlan = {
  selectedVideoModelId: string;
  resolvedProvider: string;
  resolvedApiModelId: string;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  durationProfileId: string;
  supportsSelectedStartFrames: boolean;
  supportsNativeAudio: boolean;
  providerInputFields: Record<string, unknown>;
  promptPackArtifactId: string;
  clipRequests: VerticalDramaProviderRequestSnapshot[];
  creditEstimate: {
    modelId: string;
    clipCount: number;
    estimatedCredits: number;
  };
};

/** Provider adapter contract (spec §9.1). Kept for shared reference by services. */
export type VerticalDramaVideoProviderAdapter = {
  providerId: string;
  capabilities: VerticalDramaProviderCapabilities;
  createClip(request: VerticalDramaVideoClipProviderRequest): Promise<VerticalDramaProviderJob>;
  getJob(jobId: string): Promise<VerticalDramaProviderJob>;
  downloadResult(jobId: string): Promise<VerticalDramaProviderDownloadResult>;
  cancelJob?(jobId: string): Promise<void>;
};
