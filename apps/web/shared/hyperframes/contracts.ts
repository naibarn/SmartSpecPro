import { z } from "zod";

export const HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION =
  "hyperframes_marketplace_auto_review_v1" as const;

export const marketplaceAutoReviewLaunchModes = [
  "auto_storyboard_review",
  "standard_order",
] as const;

export const marketplaceAutoReviewRenderEngines = [
  "existing_ffmpeg_timeline",
  "hyperframes_composition",
] as const;

export const marketplaceAutoReviewCompositionModes = [
  "storyboard_motion_preview",
  "product_card_explainer",
  "captioned_final_composite",
  "template_qa_snapshot",
] as const;

export const hyperframesRenderIntents = [
  "preview",
  "draft",
  "final",
  "variant",
  "snapshot",
] as const;

export const hyperframesPlatformPresetIds = [
  "generic_vertical_9_16",
  "tiktok_reels_shorts_9_16",
  "instagram_feed_square_1_1",
  "youtube_landscape_16_9",
] as const;

export const hyperframesRenderStatuses = [
  "not_available",
  "queued",
  "staging_assets",
  "linting",
  "snapshotting",
  "inspecting",
  "rendering",
  "qa_checking",
  "ready_for_review",
  "saving_to_library",
  "completed",
  "saved_to_library",
  "cancel_requested",
  "cancelled",
  "blocked_needs_user",
  "compliance_blocked",
  "template_disabled",
  "stale_input_hash",
  "failed_transient",
  "failed_permanent",
  "dead_lettered",
  "failed",
] as const;

export const hyperframesTerminalStatuses = [
  "completed",
  "saved_to_library",
  "cancelled",
  "failed",
  "failed_permanent",
  "dead_lettered",
  "template_disabled",
  "stale_input_hash",
] as const satisfies readonly (typeof hyperframesRenderStatuses)[number][];

export const hyperframesBlockerCodes = [
  "feature_disabled",
  "tenant_not_allowed",
  "permission_denied",
  "worker_disabled",
  "template_unavailable",
  "missing_product_anchor",
  "missing_character_anchor",
  "missing_environment_anchor",
  "insufficient_credit",
  "quota_blocked",
  "compliance_review_required",
  "active_standard_run",
  "stale_plan",
  "stale_input_hash",
  "asset_rejected",
  "qa_failed",
  "library_save_disabled",
  "operator_permission_required",
] as const;

export const hyperframesCostClasses = [
  "composition_preview",
  "composition_render",
  "composition_variant_export",
  "composition_snapshot_qa",
] as const;

export const hyperframesQuotaDecisions = [
  "allowed",
  "free_preview_allowed",
  "needs_authorization",
  "quota_blocked",
  "credit_blocked",
  "no_charge",
] as const;

export const hyperframesTemplateLifecycleStates = [
  "draft",
  "active",
  "disabled",
  "archived",
] as const;

export const hyperframesArtifactKinds = [
  "hyperframes_input_json",
  "hyperframes_composition_html",
  "hyperframes_snapshot",
  "hyperframes_render_mp4",
  "hyperframes_render_webm",
  "hyperframes_subtitle_vtt",
  "hyperframes_manifest",
  "hyperframes_sanitized_log",
] as const;

export const hyperframesRetentionClasses = [
  "temporary",
  "review",
  "library",
  "audit",
] as const;

export const MarketplaceAutoReviewLaunchModeSchema = z.enum(
  marketplaceAutoReviewLaunchModes
);
export const MarketplaceAutoReviewRenderEngineSchema = z.enum(
  marketplaceAutoReviewRenderEngines
);
export const MarketplaceAutoReviewCompositionModeSchema = z.enum(
  marketplaceAutoReviewCompositionModes
);
export const HyperframesRenderIntentSchema = z.enum(hyperframesRenderIntents);
export const HyperframesPlatformPresetIdSchema = z.enum(
  hyperframesPlatformPresetIds
);
export const HyperframesRenderStatusSchema = z.enum(hyperframesRenderStatuses);
export const HyperframesBlockerCodeSchema = z.enum(hyperframesBlockerCodes);
export const HyperframesCostClassSchema = z.enum(hyperframesCostClasses);
export const HyperframesQuotaDecisionSchema = z.enum(hyperframesQuotaDecisions);
export const HyperframesTemplateLifecycleStateSchema = z.enum(
  hyperframesTemplateLifecycleStates
);
export const HyperframesArtifactKindSchema = z.enum(hyperframesArtifactKinds);
export const HyperframesRetentionClassSchema = z.enum(
  hyperframesRetentionClasses
);

export type MarketplaceAutoReviewLaunchMode = z.infer<
  typeof MarketplaceAutoReviewLaunchModeSchema
>;
export type MarketplaceAutoReviewRenderEngine = z.infer<
  typeof MarketplaceAutoReviewRenderEngineSchema
>;
export type MarketplaceAutoReviewCompositionMode = z.infer<
  typeof MarketplaceAutoReviewCompositionModeSchema
>;
export type HyperframesRenderIntent = z.infer<
  typeof HyperframesRenderIntentSchema
>;
export type HyperframesPlatformPresetId = z.infer<
  typeof HyperframesPlatformPresetIdSchema
>;
export type HyperframesRenderStatus = z.infer<
  typeof HyperframesRenderStatusSchema
>;
export type HyperframesBlockerCode = z.infer<typeof HyperframesBlockerCodeSchema>;
export type HyperframesCostClass = z.infer<typeof HyperframesCostClassSchema>;
export type HyperframesQuotaDecision = z.infer<
  typeof HyperframesQuotaDecisionSchema
>;
export type HyperframesArtifactKind = z.infer<typeof HyperframesArtifactKindSchema>;
export type HyperframesRetentionClass = z.infer<
  typeof HyperframesRetentionClassSchema
>;

const SafeIdSchema = z.string().trim().min(1).max(160);
const SafeHashSchema = z.string().trim().min(6).max(128);
const SafeTextSchema = z.string().trim().max(1200);
const NullableSafeTextSchema = z.string().trim().max(1200).nullable().optional();

export const HyperframesSafeAreaSchema = z
  .object({
    top: z.number().int().min(0).max(1920),
    right: z.number().int().min(0).max(1920),
    bottom: z.number().int().min(0).max(1920),
    left: z.number().int().min(0).max(1920),
  })
  .strict();

export const HyperframesPlatformPresetSchema = z
  .object({
    presetId: HyperframesPlatformPresetIdSchema,
    platformPresetVersion: SafeIdSchema,
    label: SafeTextSchema,
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
    fps: z.number().int().min(12).max(60),
    durationSeconds: z.number().min(1).max(120),
    maxDurationSeconds: z.number().min(1).max(120),
    safeArea: HyperframesSafeAreaSchema,
    avoidZones: z.array(HyperframesSafeAreaSchema).default([]),
    subtitlePolicy: z
      .object({
        maxLines: z.number().int().min(1).max(4),
        placement: z.enum(["bottom", "lower_third", "center", "top"]),
        maxCharsPerLine: z.number().int().min(12).max(80),
      })
      .strict(),
    disclosurePolicy: z
      .object({
        requiredWhenClaimed: z.boolean(),
        placement: z.enum(["top", "bottom", "lower_third", "end_card"]),
        minimumVisibleSeconds: z.number().min(0).max(10),
      })
      .strict(),
    thumbnailPolicy: z.enum(["optional", "required", "not_applicable"]),
    publishableCandidate: z.boolean(),
    enabled: z.boolean(),
    rolloutState: z.enum(["enabled", "allowlist", "disabled"]),
  })
  .strict();

export type HyperframesPlatformPreset = z.infer<
  typeof HyperframesPlatformPresetSchema
>;

export const HyperframesTemplateDescriptorSchema = z
  .object({
    templateId: SafeIdSchema,
    templateVersion: SafeIdSchema,
    templateContentHash: SafeHashSchema,
    label: SafeTextSchema,
    category: z.enum([
      "storyboard_preview",
      "product_explainer",
      "final_composite",
      "social_variant",
      "qa_fixture",
    ]),
    lifecycleState: HyperframesTemplateLifecycleStateSchema,
    enabled: z.boolean(),
    supportedLaunchModes: z.array(MarketplaceAutoReviewLaunchModeSchema).min(1),
    supportedCompositionModes: z
      .array(MarketplaceAutoReviewCompositionModeSchema)
      .min(1),
    supportedRenderIntents: z.array(HyperframesRenderIntentSchema).min(1),
    supportedPlatformPresets: z.array(HyperframesPlatformPresetIdSchema).min(1),
    requiredAssetSlots: z.array(SafeIdSchema).default([]),
    requiredCopySlots: z.array(SafeIdSchema).default([]),
    maxAssets: z.number().int().min(0).max(40),
    minShots: z.number().int().min(0).max(12),
    maxShots: z.number().int().min(0).max(12),
    durationRangeSeconds: z.tuple([
      z.number().min(0).max(120),
      z.number().min(0).max(120),
    ]),
    safeAreaRequired: z.boolean(),
    disclosureRequiredWhenClaimed: z.boolean(),
    compatibilitySchemaVersion: SafeIdSchema,
    approval: z
      .object({
        status: z.enum(["approved", "pending", "rejected"]),
        approvedBy: NullableSafeTextSchema,
        approvedAt: NullableSafeTextSchema,
        snapshotFixtureRef: NullableSafeTextSchema,
      })
      .strict(),
    disabledReason: NullableSafeTextSchema,
  })
  .strict();

export type HyperframesTemplateDescriptor = z.infer<
  typeof HyperframesTemplateDescriptorSchema
>;

export const HyperframesArtifactRefSchema = z
  .object({
    artifactId: SafeIdSchema,
    kind: HyperframesArtifactKindSchema,
    storageRef: z.string().trim().min(1).max(512),
    contentHash: SafeHashSchema,
    mimeType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().nonnegative().optional(),
    retentionClass: HyperframesRetentionClassSchema,
    redacted: z.boolean().default(true),
  })
  .strict();

export type HyperframesArtifactRef = z.infer<typeof HyperframesArtifactRefSchema>;

export const HyperframesOutputRefSchema = z
  .object({
    outputId: SafeIdSchema,
    kind: z.enum(["preview_video", "final_video", "snapshot", "library_item"]),
    url: z.string().trim().max(2048).nullable().optional(),
    storageRef: z.string().trim().max(512).nullable().optional(),
    thumbnailUrl: z.string().trim().max(2048).nullable().optional(),
    contentHash: SafeHashSchema.optional(),
    libraryItemId: z.union([z.string(), z.number()]).nullable().optional(),
    accessibleLabel: SafeTextSchema,
  })
  .strict();

export type HyperframesOutputRef = z.infer<typeof HyperframesOutputRefSchema>;

export const HyperframesBlockerSchema = z
  .object({
    code: HyperframesBlockerCodeSchema,
    severity: z.enum(["info", "warning", "blocking", "critical"]),
    copyId: SafeIdSchema,
    safeMessage: SafeTextSchema,
    nextAction: SafeTextSchema.optional(),
    userActionRequired: z.boolean().default(false),
  })
  .strict();

export type HyperframesBlocker = z.infer<typeof HyperframesBlockerSchema>;

export const HyperframesCreditEstimateSchema = z
  .object({
    estimateRef: SafeIdSchema,
    tenantId: SafeIdSchema,
    userId: z.union([z.string(), z.number()]).optional(),
    runId: SafeIdSchema.optional(),
    renderIntent: HyperframesRenderIntentSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    costClass: HyperframesCostClassSchema,
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    fps: z.number().int().min(1),
    durationSeconds: z.number().min(0.1),
    estimatedFrameCount: z.number().int().min(1),
    estimatedRenderPixels: z.number().int().min(1),
    estimatedStorageBytes: z.number().int().min(0),
    profileMultiplier: z.number().min(0),
    costClassMultiplier: z.number().min(0),
    workerComplexityMultiplier: z.number().min(0),
    estimatedCredits: z.number().int().min(0),
    freePreviewApplied: z.boolean(),
    quotaDecision: HyperframesQuotaDecisionSchema,
    idempotencyKey: SafeTextSchema,
    compositionEstimateRef: SafeIdSchema,
    compositionReservationRef: SafeIdSchema.nullable().optional(),
    compositionChargeRef: SafeIdSchema.nullable().optional(),
    compositionRefundRef: SafeIdSchema.nullable().optional(),
  })
  .strict();

export type HyperframesCreditEstimate = z.infer<
  typeof HyperframesCreditEstimateSchema
>;

export const HyperframesChargeSummarySchema = z
  .object({
    chargeRequired: z.boolean(),
    creditEstimate: HyperframesCreditEstimateSchema.nullable().optional(),
    quotaDecision: HyperframesQuotaDecisionSchema.optional(),
    noChargeReason: z
      .enum([
        "duplicate_free_preview",
        "duplicate_library_finalize",
        "preview_only",
        "already_charged",
        "not_billable",
        "policy_exempt",
        "feature_disabled",
        "not_applicable",
      ])
      .nullable()
      .optional(),
    idempotencyKey: SafeTextSchema.optional(),
  })
  .strict();

export type HyperframesChargeSummary = z.infer<
  typeof HyperframesChargeSummarySchema
>;

export const HyperframesPollingGuidanceSchema = z
  .object({
    recommendedIntervalMs: z.number().int().min(1_000).max(30_000),
    maxIntervalMs: z.number().int().min(5_000).max(60_000),
    stopWhenStatus: z.array(HyperframesRenderStatusSchema).min(1),
    staleAfterMs: z.number().int().min(1_000).max(300_000),
    etag: z.string().trim().max(160).optional(),
    terminalState: z.boolean(),
  })
  .strict();

export type HyperframesPollingGuidance = z.infer<
  typeof HyperframesPollingGuidanceSchema
>;

export const HyperframesRepairActionSchema = z
  .object({
    actionId: SafeIdSchema,
    actionType: z.enum([
      "regenerate_from_current_plan",
      "recreate_snapshot",
      "retry_worker_step",
      "rerun_layout_inspect",
      "cancel_render",
      "open_standard_order",
    ]),
    label: SafeTextSchema,
    safeDescription: SafeTextSchema,
    requiresOperator: z.boolean().default(false),
    auditRequired: z.boolean().default(true),
    disabledReason: NullableSafeTextSchema,
  })
  .strict();

export type HyperframesRepairAction = z.infer<
  typeof HyperframesRepairActionSchema
>;

export const HyperframesProvenanceEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    tenantId: SafeIdSchema,
    userId: z.union([z.string(), z.number()]),
    productId: SafeIdSchema,
    runId: SafeIdSchema.optional(),
    renderJobId: SafeIdSchema.optional(),
    launchMode: MarketplaceAutoReviewLaunchModeSchema,
    renderIntent: HyperframesRenderIntentSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    templateId: SafeIdSchema,
    templateVersion: SafeIdSchema,
    templateContentHash: SafeHashSchema,
    platformPresetId: HyperframesPlatformPresetIdSchema,
    platformPresetVersion: SafeIdSchema,
    compositionInputHash: SafeHashSchema,
    builderVersion: SafeIdSchema,
    createdAt: SafeTextSchema,
  })
  .strict();

export type HyperframesProvenanceEnvelope = z.infer<
  typeof HyperframesProvenanceEnvelopeSchema
>;

export const HyperframesCompositionAssetSchema = z
  .object({
    assetId: SafeIdSchema,
    slot: SafeIdSchema,
    kind: z.enum([
      "product_image",
      "storyboard_frame",
      "generated_clip",
      "audio",
      "subtitle",
      "font",
      "thumbnail",
      "fixture",
    ]),
    ref: z.string().trim().min(1).max(1024),
    contentHash: SafeHashSchema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    ownedByTenantId: SafeIdSchema.optional(),
  })
  .strict();

export type HyperframesCompositionAsset = z.infer<
  typeof HyperframesCompositionAssetSchema
>;

export const HyperframesCompositionInputSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    launchMode: MarketplaceAutoReviewLaunchModeSchema,
    renderEngine: MarketplaceAutoReviewRenderEngineSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    renderIntent: HyperframesRenderIntentSchema,
    template: HyperframesTemplateDescriptorSchema.pick({
      templateId: true,
      templateVersion: true,
      templateContentHash: true,
      label: true,
    }),
    platformPreset: HyperframesPlatformPresetSchema,
    productTruth: z.record(z.unknown()).default({}),
    storyboard: z
      .object({
        shotCount: z.number().int().min(0).max(12),
        shots: z.array(z.record(z.unknown())).max(12).default([]),
      })
      .strict()
      .default({ shotCount: 0, shots: [] }),
    copy: z.record(z.string().max(1200)).default({}),
    assets: z.array(HyperframesCompositionAssetSchema).max(40).default([]),
    compliance: z
      .object({
        requiresDisclosure: z.boolean().default(false),
        disclosureText: z.string().max(600).nullable().optional(),
        blockedClaims: z.array(z.string().max(300)).default([]),
        warnings: z.array(z.string().max(300)).default([]),
      })
      .strict()
      .default({ requiresDisclosure: false, blockedClaims: [], warnings: [] }),
    provenance: HyperframesProvenanceEnvelopeSchema,
  })
  .strict();

export type HyperframesCompositionInput = z.infer<
  typeof HyperframesCompositionInputSchema
>;

export const HyperframesRenderStatusProjectionSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    renderJobId: SafeIdSchema,
    tenantId: SafeIdSchema,
    productId: SafeIdSchema,
    runId: SafeIdSchema,
    launchMode: MarketplaceAutoReviewLaunchModeSchema,
    status: HyperframesRenderStatusSchema,
    progressPercent: z.number().min(0).max(100),
    statusCopyId: SafeIdSchema,
    safeMessage: SafeTextSchema,
    safeDiagnostics: z.array(SafeTextSchema).default([]),
    nextAction: SafeTextSchema.optional(),
    repairActions: z.array(HyperframesRepairActionSchema).default([]),
    permissions: z
      .object({
        canCancel: z.boolean().default(false),
        canRepair: z.boolean().default(false),
      })
      .strict()
      .default({
        canCancel: false,
        canRepair: false,
      }),
    polling: HyperframesPollingGuidanceSchema,
    chargeSummary: HyperframesChargeSummarySchema.optional(),
    templateId: SafeIdSchema.optional(),
    templateVersion: SafeIdSchema.optional(),
    platformPresetId: HyperframesPlatformPresetIdSchema.optional(),
    platformPresetVersion: SafeIdSchema.optional(),
    renderIntent: HyperframesRenderIntentSchema.optional(),
    compositionMode: MarketplaceAutoReviewCompositionModeSchema.optional(),
    compositionInputHash: SafeHashSchema.optional(),
    compositionHtmlHash: SafeHashSchema.optional(),
    templateContentHash: SafeHashSchema.optional(),
    runtimeProfileHash: SafeHashSchema.optional(),
    creativePlanHash: SafeHashSchema.optional(),
    presetManifestHash: SafeHashSchema.optional(),
    audioEventMapHash: SafeHashSchema.optional(),
    fallbackQuality: z.enum(["full", "partial", "not_supported"]).optional(),
    hasAudio: z.boolean().optional(),
    hasNativeAudio: z.boolean().optional(),
    playableProbe: z.record(z.unknown()).default({}),
    audioMixReport: z.record(z.unknown()).default({}),
    qaStatus: z.enum(["passed", "passed_with_warnings", "failed"]).optional(),
    outputRefs: z.array(HyperframesOutputRefSchema).default([]),
    artifactRefs: z.array(HyperframesArtifactRefSchema).default([]),
    redaction: z
      .object({
        rawHtmlHidden: z.boolean().default(true),
        signedUrlsHidden: z.boolean().default(true),
        workerLogsHidden: z.boolean().default(true),
        storageKeysHidden: z.boolean().default(true),
      })
      .strict()
      .default({
        rawHtmlHidden: true,
        signedUrlsHidden: true,
        workerLogsHidden: true,
        storageKeysHidden: true,
      }),
    updatedAt: SafeTextSchema,
  })
  .strict();

export type HyperframesRenderStatusProjection = z.infer<
  typeof HyperframesRenderStatusProjectionSchema
>;

export const HyperframesLibraryFinalizeMetadataSchema = z
  .object({
    source: z.literal("marketplace_auto_review_hyperframes_render"),
    tenantId: SafeIdSchema,
    userId: z.union([z.string(), z.number()]),
    productId: SafeIdSchema,
    runId: SafeIdSchema,
    renderJobId: SafeIdSchema,
    templateId: SafeIdSchema,
    templateVersion: SafeIdSchema,
    platformPresetId: HyperframesPlatformPresetIdSchema,
    platformPresetVersion: SafeIdSchema,
    renderIntent: HyperframesRenderIntentSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema.optional(),
    compositionInputHash: SafeHashSchema,
    compositionHtmlHash: SafeHashSchema,
    templateContentHash: SafeHashSchema.optional(),
    runtimeProfileHash: SafeHashSchema.optional(),
    creativePlanHash: SafeHashSchema.optional(),
    presetManifestHash: SafeHashSchema.optional(),
    audioEventMapHash: SafeHashSchema.optional(),
    fallbackQuality: z.enum(["full", "partial", "not_supported"]).optional(),
    overlayPresetId: SafeIdSchema.optional(),
    subtitlePresetId: SafeIdSchema.optional(),
    audioPackPresetId: SafeIdSchema.optional(),
    musicPresetId: SafeIdSchema.optional(),
    sfxPresetIds: z.array(SafeIdSchema).default([]),
    presetVersions: z.record(SafeIdSchema).default({}),
    hasAudio: z.boolean().default(false),
    hasNativeAudio: z.boolean().default(false),
    audioMixReport: z.record(z.unknown()).default({}),
    outputProbe: z.record(z.unknown()).default({}),
    outputHash: SafeHashSchema,
    outputArtifactRef: HyperframesArtifactRefSchema,
    thumbnailRef: HyperframesArtifactRefSchema.nullable().optional(),
    subtitleRefs: z.array(HyperframesArtifactRefSchema).default([]),
    qaStatus: z.enum(["passed", "passed_with_warnings"]),
    idempotencyKey: SafeTextSchema,
    creditRefs: z.record(z.unknown()).default({}),
    trace: z.record(z.unknown()).default({}),
  })
  .strict();

export type HyperframesLibraryFinalizeMetadata = z.infer<
  typeof HyperframesLibraryFinalizeMetadataSchema
>;

export function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `hf_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isTerminalHyperframesStatus(
  status: HyperframesRenderStatus
): boolean {
  return (hyperframesTerminalStatuses as readonly string[]).includes(status);
}

export function createDefaultHyperframesPollingGuidance(
  status: HyperframesRenderStatus,
  options: Partial<HyperframesPollingGuidance> = {}
): HyperframesPollingGuidance {
  const terminalState = isTerminalHyperframesStatus(status);
  return HyperframesPollingGuidanceSchema.parse({
    recommendedIntervalMs: terminalState ? 30_000 : 5_000,
    maxIntervalMs: 30_000,
    stopWhenStatus: hyperframesTerminalStatuses,
    staleAfterMs: terminalState ? 120_000 : 15_000,
    terminalState,
    ...options,
  });
}

export function buildHyperframesCreditIdempotencyKey(input: {
  tenantId: string;
  runId: string;
  renderIntent: HyperframesRenderIntent;
  compositionInputHash: string;
  templateVersion: string;
  platformPresetId: HyperframesPlatformPresetId;
}): string {
  return [
    "hyperframes-credit",
    input.tenantId,
    input.runId,
    input.renderIntent,
    input.compositionInputHash,
    input.templateVersion,
    input.platformPresetId,
  ].join(":");
}

export function buildHyperframesRenderJobIdempotencyKey(input: {
  tenantId: string;
  runId: string;
  templateId: string;
  templateVersion: string;
  platformPresetId: HyperframesPlatformPresetId;
  renderIntent: HyperframesRenderIntent;
  compositionInputHash: string;
  runtimeProfileHash?: string;
}): string {
  return [
    "hyperframes",
    input.tenantId,
    input.runId,
    input.templateId,
    input.templateVersion,
    input.platformPresetId,
    input.renderIntent,
    input.compositionInputHash,
    ...(input.runtimeProfileHash ? [input.runtimeProfileHash] : []),
  ].join(":");
}

export function buildHyperframesLibraryIdempotencyKey(input: {
  tenantId: string;
  runId: string;
  renderIntent: HyperframesRenderIntent;
  compositionInputHash: string;
  outputHash: string;
}): string {
  return [
    "hyperframes-library",
    input.tenantId,
    input.runId,
    input.renderIntent,
    input.compositionInputHash,
    input.outputHash,
  ].join(":");
}
