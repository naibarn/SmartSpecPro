import { z } from "zod";

export const VideoSegmentStructureModeSchema = z.enum([
  "per_shot",
  "adaptive_multi_shot",
  "compact_multi_shot",
  "manual_group_size",
]);

export const VideoSegmentTransportSchema = z.enum(["gateway_api", "mcp"]);

export const VideoSegmentAudioStrategySchema = z.enum([
  "auto",
  "native_video_audio",
  "separate_tts_voiceover",
  "silent",
]);

export const VideoSegmentReferenceModeSchema = z.enum([
  "single_storyboard_frame",
  "start_stop",
  "segment_start_end",
]);

export const VideoSegmentWarningSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
]);

export const VideoSegmentWarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: VideoSegmentWarningSeveritySchema.default("warning"),
    source: z
      .enum(["planner", "capability", "reference", "audio", "fallback"])
      .default("planner"),
    segmentId: z.string().min(1).optional(),
    shotIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const VideoSegmentPlanWarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: VideoSegmentWarningSeveritySchema.default("warning"),
    source: z.enum([
      "planner",
      "creative_brief",
      "access",
      "credit",
      "fallback",
    ]),
    segmentId: z.string().min(1).optional(),
    shotIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const VideoSegmentCreativePresetSchema = z
  .object({
    presetId: z.string().min(1).max(120),
    family: z.string().min(1).max(120),
  })
  .strict();

export const VideoSegmentCreativeBriefSchema = z
  .object({
    text: z.string().trim().max(2_000).optional(),
    normalizedText: z.string().trim().max(2_000).optional(),
    warnings: z.array(VideoSegmentPlanWarningSchema).default([]),
  })
  .strict();

export const VideoSegmentPlannerShotSchema = z
  .object({
    shotId: z.string().min(1),
    index: z.number().int().min(0),
    title: z.string().max(180).optional(),
    visualPrompt: z.string().max(6_000).optional(),
    voiceover: z.string().max(2_000).optional(),
    durationSeconds: z.number().positive().max(60).default(5),
    storyboardFrameUrl: z.string().min(1).optional(),
    startFrameUrl: z.string().min(1).optional(),
    stopFrameUrl: z.string().min(1).optional(),
  })
  .strict();

export const VideoModelSegmentCapabilitySchema = z
  .object({
    modelId: z.string().min(1),
    provider: z.string().min(1).optional(),
    transport: VideoSegmentTransportSchema.default("gateway_api"),
    supportsMultiShotPrompt: z.boolean().default(false),
    maxSubShotsPerSegment: z.number().int().min(1).max(12).default(1),
    maxSegmentDurationSeconds: z.number().positive().max(120).default(8),
    maxReferenceImagesPerSegment: z.number().int().min(0).max(20).default(2),
    supportsNativeAudio: z.boolean().default(false),
    supportsThaiNativeAudio: z.boolean().default(false),
    reviewed: z.boolean().default(false),
    source: z
      .enum(["unknown", "media_model_config", "provider_template", "heuristic"])
      .default("unknown"),
  })
  .strict();

export const VideoSegmentSubShotSchema = z
  .object({
    shotId: z.string().min(1),
    index: z.number().int().min(0),
    durationSeconds: z.number().positive().max(60),
    title: z.string().max(180).optional(),
    visualPrompt: z.string().max(6_000).optional(),
    voiceover: z.string().max(2_000).optional(),
  })
  .strict();

export const VideoSegmentSchema = z
  .object({
    segmentId: z.string().min(1),
    index: z.number().int().min(0),
    shotIds: z.array(z.string().min(1)).min(1),
    durationSeconds: z.number().positive().max(120),
    referenceMode: VideoSegmentReferenceModeSchema,
    referenceImageUrls: z.array(z.string().min(1)).default([]),
    startFrameUrl: z.string().min(1).optional(),
    stopFrameUrl: z.string().min(1).optional(),
    subShots: z.array(VideoSegmentSubShotSchema).min(1),
    warnings: z.array(VideoSegmentWarningSchema).default([]),
  })
  .strict();

export const VideoSegmentPlanSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    sourceSurface: z.enum([
      "marketplace_capture",
      "storyboard_review",
      "media_studio",
      "production",
      "unknown",
    ]),
    mode: VideoSegmentStructureModeSchema,
    effectiveMode: VideoSegmentStructureModeSchema,
    manualGroupSize: z.number().int().min(1).max(12).optional(),
    videoModelId: z.string().min(1),
    provider: z.string().min(1).optional(),
    transport: VideoSegmentTransportSchema.default("gateway_api"),
    audioStrategy: VideoSegmentAudioStrategySchema,
    referenceMode: VideoSegmentReferenceModeSchema,
    creativeBrief: VideoSegmentCreativeBriefSchema.optional(),
    creativePresets: z.array(VideoSegmentCreativePresetSchema).default([]),
    segments: z.array(VideoSegmentSchema),
    fallbackReason: z.string().min(1).optional(),
    warnings: z.array(VideoSegmentWarningSchema).default([]),
    planHash: z.string().min(8),
  })
  .strict();

export const VideoSegmentPlannerInputSchema = z
  .object({
    sourceSurface: VideoSegmentPlanSchema.shape.sourceSurface,
    mode: VideoSegmentStructureModeSchema.default("per_shot"),
    manualGroupSize: z.number().int().min(1).max(12).optional(),
    videoModelId: z.string().min(1),
    provider: z.string().min(1).optional(),
    transport: VideoSegmentTransportSchema.default("gateway_api"),
    audioStrategy: VideoSegmentAudioStrategySchema.default("auto"),
    referenceMode: VideoSegmentReferenceModeSchema.default(
      "single_storyboard_frame"
    ),
    creativeBrief: VideoSegmentCreativeBriefSchema.optional(),
    creativePresets: z.array(VideoSegmentCreativePresetSchema).default([]),
    shots: z.array(VideoSegmentPlannerShotSchema).min(1).max(60),
    capability: VideoModelSegmentCapabilitySchema.optional(),
  })
  .strict();

export type VideoSegmentStructureMode = z.infer<
  typeof VideoSegmentStructureModeSchema
>;
export type VideoSegmentTransport = z.infer<typeof VideoSegmentTransportSchema>;
export type VideoSegmentAudioStrategy = z.infer<
  typeof VideoSegmentAudioStrategySchema
>;
export type VideoSegmentReferenceMode = z.infer<
  typeof VideoSegmentReferenceModeSchema
>;
export type VideoSegmentWarning = z.infer<typeof VideoSegmentWarningSchema>;
export type VideoSegmentPlanWarning = z.infer<
  typeof VideoSegmentPlanWarningSchema
>;
export type VideoSegmentCreativeBrief = z.infer<
  typeof VideoSegmentCreativeBriefSchema
>;
export type VideoSegmentPlannerShot = z.infer<
  typeof VideoSegmentPlannerShotSchema
>;
export type VideoModelSegmentCapability = z.infer<
  typeof VideoModelSegmentCapabilitySchema
>;
export type VideoSegmentSubShot = z.infer<typeof VideoSegmentSubShotSchema>;
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;
export type VideoSegmentPlan = z.infer<typeof VideoSegmentPlanSchema>;
export type VideoSegmentPlannerInput = z.infer<
  typeof VideoSegmentPlannerInputSchema
>;
