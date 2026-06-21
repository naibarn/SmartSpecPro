import {
  VideoModelSegmentCapabilitySchema,
  type VideoModelSegmentCapability,
  type VideoSegmentTransport,
} from "./contracts";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (typeof value === "string" && value.trim()) {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

export const UNKNOWN_VIDEO_SEGMENT_CAPABILITY =
  VideoModelSegmentCapabilitySchema.parse({
    modelId: "unknown",
    transport: "gateway_api",
    supportsMultiShotPrompt: false,
    maxSubShotsPerSegment: 1,
    maxSegmentDurationSeconds: 8,
    maxReferenceImagesPerSegment: 2,
    supportsNativeAudio: false,
    supportsThaiNativeAudio: false,
    reviewed: false,
    source: "unknown",
  });

export function capabilityFromMediaModelConfig(input: {
  modelId?: string | null;
  provider?: string | null;
  transport?: VideoSegmentTransport | null;
  configJson?: unknown;
  metadata?: unknown;
}): VideoModelSegmentCapability | null {
  const config = asRecord(input.configJson);
  const metadata = asRecord(input.metadata);
  const capabilities = asRecord(config.capabilities ?? metadata.capabilities);
  const videoSegment = asRecord(
    capabilities.videoSegment ?? config.videoSegment ?? metadata.videoSegment
  );
  if (!Object.keys(videoSegment).length) return null;

  return VideoModelSegmentCapabilitySchema.parse({
    modelId:
      asString(videoSegment.modelId) ??
      asString(config.modelId) ??
      input.modelId ??
      "unknown",
    provider:
      asString(videoSegment.provider) ??
      asString(config.provider) ??
      input.provider ??
      undefined,
    transport:
      videoSegment.transport === "mcp" || input.transport === "mcp"
        ? "mcp"
        : "gateway_api",
    supportsMultiShotPrompt:
      asBoolean(videoSegment.supportsMultiShotPrompt) ?? false,
    maxSubShotsPerSegment:
      asNumber(videoSegment.maxSubShotsPerSegment) ??
      asNumber(videoSegment.maxShotsPerSegment) ??
      1,
    maxSegmentDurationSeconds:
      asNumber(videoSegment.maxSegmentDurationSeconds) ??
      asNumber(videoSegment.maxDurationSeconds) ??
      8,
    maxReferenceImagesPerSegment:
      asNumber(videoSegment.maxReferenceImagesPerSegment) ?? 2,
    supportsNativeAudio: asBoolean(videoSegment.supportsNativeAudio) ?? false,
    supportsThaiNativeAudio:
      asBoolean(videoSegment.supportsThaiNativeAudio) ?? false,
    reviewed: asBoolean(videoSegment.reviewed) ?? true,
    source: "media_model_config",
  });
}

function providerTemplateCapability(input: {
  modelId: string;
  provider?: string | null;
  transport?: VideoSegmentTransport | null;
}): VideoModelSegmentCapability | null {
  const provider = (input.provider ?? "").toLowerCase();
  const modelId = input.modelId.toLowerCase();
  if (!["higgsfield", "magnific"].includes(provider)) return null;
  const isSeedance = /seedance/.test(modelId);
  const isVeo = /veo/.test(modelId);
  const isKling = /kling/.test(modelId);
  const isWan = /wan/.test(modelId);
  const isGrok = /grok/.test(modelId);
  const isVideoLike =
    modelId.includes("video") ||
    isSeedance ||
    isVeo ||
    isKling ||
    isWan ||
    isGrok;
  if (!isVideoLike) {
    return null;
  }
  if (isSeedance) {
    return VideoModelSegmentCapabilitySchema.parse({
      modelId: input.modelId,
      provider: input.provider ?? undefined,
      transport: input.transport === "mcp" ? "mcp" : "gateway_api",
      supportsMultiShotPrompt: true,
      maxSubShotsPerSegment: 6,
      maxSegmentDurationSeconds: 15,
      maxReferenceImagesPerSegment: 5,
      supportsNativeAudio: true,
      supportsThaiNativeAudio: false,
      reviewed: true,
      source: "provider_template",
    });
  }
  if (isVeo || isKling) {
    return VideoModelSegmentCapabilitySchema.parse({
      modelId: input.modelId,
      provider: input.provider ?? undefined,
      transport: input.transport === "mcp" ? "mcp" : "gateway_api",
      supportsMultiShotPrompt: true,
      maxSubShotsPerSegment: 3,
      maxSegmentDurationSeconds: 10,
      maxReferenceImagesPerSegment: 5,
      supportsNativeAudio: isVeo,
      supportsThaiNativeAudio: isVeo,
      reviewed: true,
      source: "provider_template",
    });
  }
  return VideoModelSegmentCapabilitySchema.parse({
    modelId: input.modelId,
    provider: input.provider ?? undefined,
    transport: input.transport === "mcp" ? "mcp" : "gateway_api",
    supportsMultiShotPrompt: false,
    maxSubShotsPerSegment: 1,
    maxSegmentDurationSeconds: 8,
    maxReferenceImagesPerSegment: 2,
    supportsNativeAudio: false,
    supportsThaiNativeAudio: false,
    reviewed: true,
    source: "provider_template",
  });
}

export function resolveVideoModelSegmentCapability(input: {
  modelId: string;
  provider?: string | null;
  transport?: VideoSegmentTransport | null;
  configJson?: unknown;
  metadata?: unknown;
}): VideoModelSegmentCapability {
  const configured = capabilityFromMediaModelConfig(input);
  if (configured) return configured;

  const template = providerTemplateCapability(input);
  if (template) return template;

  return {
    ...UNKNOWN_VIDEO_SEGMENT_CAPABILITY,
    modelId: input.modelId,
    provider: input.provider ?? undefined,
    transport: input.transport === "mcp" ? "mcp" : "gateway_api",
  };
}
