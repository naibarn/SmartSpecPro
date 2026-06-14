import { z } from "zod";
import { ProductionAgentsSdkCapabilityManifestSchema as AgentRuntimeProductionAgentsSdkCapabilityManifestSchema } from "../agentRuntime/types";

export const MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION =
  "marketplace_auto_review_v2";

export const MARKETPLACE_AUTO_REVIEW_STAGE_KEYS = [
  "product_preflight",
  "production_project",
  "concept_story",
  "prompt_plan",
  "image_generation",
  "storyboard_review",
  "video_generation",
  "audio_generation",
  "video_edit",
  "render",
  "library_finalize",
] as const;

export const MARKETPLACE_AUTO_REVIEW_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_provider",
  "completed",
  "failed",
  "cancelled",
] as const;

export const MARKETPLACE_AUTO_REVIEW_DETAIL_STATES = [
  "idle",
  "queued",
  "running",
  "waiting_provider",
  "awaiting_credit_authorization",
  "qa_running",
  "repairing",
  "blocked_needs_user",
  "variant_selection_required",
  "provider_event_blocked",
  "payload_over_budget",
  "storage_quota_blocked",
  "dlq_recovery_required",
  "privacy_redaction_required",
  "evidence_instruction_blocked",
  "audio_rights_required",
  "distribution_profile_mismatch",
  "synthetic_disclosure_required",
  "cta_landing_blocked",
  "policy_rule_pack_blocked",
  "qa_spot_check_required",
  "reuse_recheck_required",
  "campaign_batch_queued",
  "duplicate_variation_blocked",
  "spend_anomaly_blocked",
  "brand_policy_blocked",
  "human_review_queued",
  "publish_package_blocked",
  "input_change_recheck_required",
  "frame_vision_qa_repairing",
  "media_quarantined",
  "product_reference_blocked",
  "character_identity_blocked",
  "completion_evidence_blocked",
  "capability_manifest_blocked",
  "creative_brief_needs_review",
  "cancelled",
  "skipped",
  "failed_terminal",
  "completed_with_warnings",
  "completed",
] as const;

export const MarketplaceAutoReviewStageKeySchema = z.enum(
  MARKETPLACE_AUTO_REVIEW_STAGE_KEYS
);
export const MarketplaceAutoReviewRunStatusSchema = z.enum(
  MARKETPLACE_AUTO_REVIEW_RUN_STATUSES
);
export const MarketplaceAutoReviewDetailStateSchema = z.enum(
  MARKETPLACE_AUTO_REVIEW_DETAIL_STATES
);

export const MarketplaceAutoReviewStageStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_provider",
  "qa_pending",
  "repairing",
  "awaiting_credit_authorization",
  "blocked",
  "blocked_needs_user",
  "completed",
  "completed_with_warnings",
  "skipped",
  "failed",
  "cancelled",
]);

const RecordSchema = z.record(z.unknown());
const NullableStringSchema = z.string().min(1).nullable().optional();
const RefArraySchema = z.array(z.string().min(1)).default([]);
const ReferenceAnchorRoleSchema = z.enum([
  "product",
  "character",
  "environment",
]);

function normalizedStringSet(values: string[]): Set<string> {
  return new Set(values.map(value => value.trim()).filter(Boolean));
}

function stringSetExtras(values: string[], allowedValues: string[]): string[] {
  const allowed = normalizedStringSet(allowedValues);
  return [...normalizedStringSet(values)].filter(value => !allowed.has(value));
}

function stringSetMissing(
  requiredValues: string[],
  actualValues: string[]
): string[] {
  const actual = normalizedStringSet(actualValues);
  return [...normalizedStringSet(requiredValues)].filter(
    value => !actual.has(value)
  );
}

const unsafeUserVisibleUrlQueryKeys = new Set([
  "access_token",
  "credential",
  "expires",
  "expiresat",
  "expiry",
  "key-pair-id",
  "policy",
  "se",
  "sig",
  "signature",
  "ske",
  "skoid",
  "sks",
  "skt",
  "sktid",
  "skv",
  "sp",
  "sr",
  "sv",
  "token",
]);

function compactProjectionRecord(
  value: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === null || item === undefined || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object") return Object.keys(asRecord(item)).length > 0;
      return true;
    })
  );
}

function safeProjectionText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function safeProjectionNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function hasUnsafeUserVisibleUrlMarker(url: URL): boolean {
  if (url.username || url.password) return true;
  const decodedPath = decodeURIComponent(url.pathname).toLowerCase();
  if (
    /(?:^|\/)(private|presigned|signed|raw-html|rawhtml|storage|worker-logs?)(?:\/|$)/i.test(
      decodedPath
    )
  ) {
    return true;
  }
  for (const [key, value] of url.searchParams.entries()) {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = value.trim().toLowerCase();
    if (
      normalizedKey.startsWith("x-amz-") ||
      normalizedKey.startsWith("x-goog-") ||
      unsafeUserVisibleUrlQueryKeys.has(normalizedKey) ||
      /(signed|private|storagekey|workerlogs|rawhtml)/i.test(normalizedKey) ||
      /(signed|private|storagekey|workerlogs|rawhtml)/i.test(normalizedValue)
    ) {
      return true;
    }
  }
  return false;
}

export function isSafeUserVisibleUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return !hasUnsafeUserVisibleUrlMarker(
      new URL(trimmed, "https://smartspec.local")
    );
  }
  try {
    const url = new URL(trimmed);
    if (hasUnsafeUserVisibleUrlMarker(url)) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export const MarketplaceAutoReviewReferenceAnchorsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    runId: z.string().min(1),
    productId: z.string().min(1),
    productImageUrl: z.string().min(1),
    productImageRef: z.string().min(1),
    productImageIndex: z.number().int().nonnegative(),
    characterImageUrl: NullableStringSchema,
    characterImageRef: NullableStringSchema,
    environmentImageUrl: NullableStringSchema,
    environmentImageRef: NullableStringSchema,
    reviewTone: z
      .enum([
        "warm_honest",
        "funny_light",
        "irritated_problem",
        "energetic_excited",
        "empathetic_soft",
        "expert_confident",
        "straight_serious",
      ])
      .nullable()
      .optional(),
    storytellingStructure: z
      .enum([
        "hook_problem_emotion_insight_solution_result_cta",
        "hook_problem_insight_proof_cta",
        "product_review_situation_problem_try_result_fit",
        "before_after_bridge",
        "pas",
        "aida",
        "relatable_story",
        "problem_struggle_solution_transformation",
      ])
      .nullable()
      .optional(),
    requiredRoles: z
      .array(ReferenceAnchorRoleSchema)
      .default(["product", "character", "environment"]),
    optionalRoles: z.array(z.enum(["character", "environment"])).default([]),
    bindingPolicy: z
      .enum(["user_selected_anchor_images_are_primary_generation_truth"])
      .default("user_selected_anchor_images_are_primary_generation_truth"),
    status: z.enum(["ready", "blocked"]),
    createdAt: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.requiredRoles.includes("product")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Marketplace Auto Review reference anchors must include a user-selected product image role",
        path: ["requiredRoles"],
      });
    }
    const requiredForReady: z.infer<typeof ReferenceAnchorRoleSchema>[] = [
      "product",
      "character",
      "environment",
    ];
    if (
      value.status === "ready" &&
      requiredForReady.some(role => !value.requiredRoles.includes(role))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors must include product, character, and environment roles",
        path: ["requiredRoles"],
      });
    }
    const duplicatedOptionalRoles = value.optionalRoles.filter(role =>
      value.requiredRoles.includes(role)
    );
    if (value.status === "ready" && duplicatedOptionalRoles.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors cannot mark required character or environment roles as optional",
        path: ["optionalRoles"],
      });
    }
    if (value.status === "ready" && !value.productImageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ready reference anchors require a concrete product image URL",
        path: ["productImageUrl"],
      });
    }
    if (value.status === "ready" && !value.productImageRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors require a concrete product image reference",
        path: ["productImageRef"],
      });
    }
    if (value.status === "ready" && !value.characterImageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors require a concrete character image URL",
        path: ["characterImageUrl"],
      });
    }
    if (value.status === "ready" && !value.characterImageRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors require a concrete character image reference",
        path: ["characterImageRef"],
      });
    }
    if (value.status === "ready" && !value.environmentImageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors require a concrete environment image URL",
        path: ["environmentImageUrl"],
      });
    }
    if (value.status === "ready" && !value.environmentImageRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready reference anchors require a concrete environment image reference",
        path: ["environmentImageRef"],
      });
    }
  });

type EvidenceBucket =
  | "artifactRefs"
  | "qaVerdictRefs"
  | "creditRefs"
  | "lineageRefs"
  | "policyRefs"
  | "acceptanceRefs"
  | "warningApprovalRefs";

const STAGE_SUCCESS_EVIDENCE_MATRIX: Record<
  z.infer<typeof MarketplaceAutoReviewStageKeySchema>,
  EvidenceBucket[]
> = {
  product_preflight: ["artifactRefs", "lineageRefs", "policyRefs"],
  production_project: ["artifactRefs", "lineageRefs", "policyRefs"],
  concept_story: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
  ],
  prompt_plan: ["artifactRefs", "qaVerdictRefs", "lineageRefs", "policyRefs"],
  image_generation: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
    "acceptanceRefs",
  ],
  storyboard_review: [
    "artifactRefs",
    "qaVerdictRefs",
    "lineageRefs",
    "policyRefs",
  ],
  video_generation: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
    "acceptanceRefs",
  ],
  audio_generation: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
  ],
  video_edit: [
    "artifactRefs",
    "qaVerdictRefs",
    "lineageRefs",
    "policyRefs",
    "acceptanceRefs",
  ],
  render: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
    "acceptanceRefs",
  ],
  library_finalize: [
    "artifactRefs",
    "qaVerdictRefs",
    "creditRefs",
    "lineageRefs",
    "policyRefs",
    "acceptanceRefs",
  ],
};

function missingEvidenceBuckets(
  value: {
    stageKey: z.infer<typeof MarketplaceAutoReviewStageKeySchema>;
  } & Record<EvidenceBucket, string[]>
): EvidenceBucket[] {
  return STAGE_SUCCESS_EVIDENCE_MATRIX[value.stageKey].filter(
    bucket => value[bucket].length === 0
  );
}

export const MarketplaceAutoReviewStatusDetailSchema = z.object({
  state: MarketplaceAutoReviewDetailStateSchema,
  severity: z
    .enum(["info", "success", "warning", "error", "blocked"])
    .default("info"),
  stageKey: MarketplaceAutoReviewStageKeySchema.nullable().optional(),
  reasonCodes: z.array(z.string().min(1)).default([]),
  safeMessage: z.string().min(1),
  nextAction: z.string().min(1).nullable().optional(),
  userActionRequired: z.boolean().default(false),
  retryable: z.boolean().default(false),
  technicalRef: z.string().min(1).nullable().optional(),
});

export const MarketplaceAutoReviewOutputLinkSchema = z.object({
  kind: z.enum([
    "production_project",
    "storyboard_review",
    "video_editor",
    "library_item",
    "frame",
    "clip",
    "audio",
    "render",
    "thumbnail",
    "subtitle",
    "metadata_manifest",
  ]),
  label: z.string().min(1),
  url: z.string().min(1).refine(isSafeUserVisibleUrl, {
    message: "Output link URL must use a safe user-visible scheme",
  }),
  safeForUser: z.boolean().default(true),
  stageKey: MarketplaceAutoReviewStageKeySchema.nullable().optional(),
  artifactRef: z.string().min(1).nullable().optional(),
});

export const MarketplaceAutoReviewCreditSummarySchema = z.object({
  estimateCredits: z.number().nonnegative().default(0),
  reservedCredits: z.number().nonnegative().default(0),
  spentCredits: z.number().nonnegative().default(0),
  refundedCredits: z.number().nonnegative().default(0),
  outstandingCredits: z.number().nonnegative().default(0),
  authorizationStatus: z
    .enum([
      "not_required",
      "estimated",
      "reserved",
      "awaiting_authorization",
      "authorized",
      "blocked",
      "reconciled",
    ])
    .default("not_required"),
  reservationRefs: RefArraySchema,
  transactionRefs: RefArraySchema,
});

export const MarketplaceAutoReviewTimelineItemSchema = z.object({
  stageKey: MarketplaceAutoReviewStageKeySchema,
  label: z.string().min(1),
  order: z.number().int().positive(),
  status: MarketplaceAutoReviewStageStatusSchema,
  detail: MarketplaceAutoReviewStatusDetailSchema.nullable().optional(),
  startedAt: z.string().min(1).nullable().optional(),
  completedAt: z.string().min(1).nullable().optional(),
  activeSubstep: z.string().min(1).nullable().optional(),
  progressPercent: z.number().min(0).max(100).nullable().optional(),
  qaVerdictRefs: RefArraySchema,
  repairRefs: RefArraySchema,
  evidenceRefs: RefArraySchema,
  credit: MarketplaceAutoReviewCreditSummarySchema.default({}),
  outputLinks: z.array(MarketplaceAutoReviewOutputLinkSchema).default([]),
});

export const MarketplaceAutoReviewTimelineProjectionSchema = z.object({
  schemaVersion: z.literal(MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION),
  runId: z.string().min(1),
  outputMode: z.enum(["storyboard_images", "full_video"]),
  currentStage: MarketplaceAutoReviewStageKeySchema.nullable().optional(),
  status: MarketplaceAutoReviewRunStatusSchema,
  statusDetail: MarketplaceAutoReviewStatusDetailSchema,
  progressPercent: z.number().min(0).max(100),
  nextAction: z.string().min(1).nullable().optional(),
  items: z.array(MarketplaceAutoReviewTimelineItemSchema).min(1),
  redaction: z.object({
    rawProviderPayloadHidden: z.boolean().default(true),
    rawPromptHidden: z.boolean().default(true),
    signedUrlsHidden: z.boolean().default(true),
    privateEvidenceHidden: z.boolean().default(true),
  }),
});

export const MarketplaceAutoReviewStageCompletionEvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    runId: z.string().min(1),
    stageKey: MarketplaceAutoReviewStageKeySchema,
    status: z.enum([
      "complete",
      "warning_complete",
      "skipped",
      "repair_required",
      "retriable_failure",
      "user_blocked",
      "terminal_failure",
      "cancelled",
    ]),
    requiredRefs: RefArraySchema,
    artifactRefs: RefArraySchema,
    qaVerdictRefs: RefArraySchema,
    creditRefs: RefArraySchema,
    lineageRefs: RefArraySchema,
    policyRefs: RefArraySchema,
    acceptanceRefs: RefArraySchema,
    missingRefs: RefArraySchema,
    warningApprovalRefs: RefArraySchema,
    createdAt: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const successful =
      value.status === "complete" || value.status === "warning_complete";
    if (
      (successful || value.status === "skipped") &&
      value.missingRefs.length > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cannot mark ${value.stageKey} ${value.status}; missing completion evidence: ${value.missingRefs.join(", ")}`,
        path: ["missingRefs"],
      });
    }
    if (value.status === "skipped" && value.policyRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot mark skipped without policy evidence",
        path: ["policyRefs"],
      });
    }
    if (
      value.status === "repair_required" &&
      (value.missingRefs.length === 0 || value.qaVerdictRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark repair_required without missing refs and QA evidence",
        path: ["missingRefs"],
      });
    }
    if (
      value.status === "retriable_failure" &&
      (value.missingRefs.length === 0 || value.creditRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark retriable_failure without missing refs and credit reconciliation evidence",
        path: ["creditRefs"],
      });
    }
    if (
      value.status === "user_blocked" &&
      (value.missingRefs.length === 0 || value.policyRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark user_blocked without missing refs and policy evidence",
        path: ["policyRefs"],
      });
    }
    if (
      value.status === "terminal_failure" &&
      (value.missingRefs.length === 0 || value.creditRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark terminal_failure without missing refs and credit reconciliation evidence",
        path: ["creditRefs"],
      });
    }
    if (value.status === "cancelled" && value.creditRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot mark cancelled without credit reconciliation evidence",
        path: ["creditRefs"],
      });
    }
    if (!successful) return;
    if (value.requiredRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot mark stage complete without required evidence refs",
        path: ["requiredRefs"],
      });
    }
    const missingBuckets = missingEvidenceBuckets(value);
    if (missingBuckets.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Cannot mark ${value.stageKey} complete without required evidence buckets: ${missingBuckets.join(", ")}`,
        path: [missingBuckets[0]],
      });
    }
    const supportingEvidenceCount = [
      value.artifactRefs,
      value.qaVerdictRefs,
      value.creditRefs,
      value.lineageRefs,
      value.policyRefs,
      value.acceptanceRefs,
    ].reduce((sum, refs) => sum + refs.length, 0);
    if (supportingEvidenceCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark stage complete with status only; supporting evidence refs are required",
        path: ["artifactRefs"],
      });
    }
    if (
      value.status === "warning_complete" &&
      value.warningApprovalRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Cannot mark warning_complete without warning approval evidence",
        path: ["warningApprovalRefs"],
      });
    }
  });

export const ProductEvidenceLockSchema = z.object({
  lockId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  brand: NullableStringSchema,
  sourceUrl: z.string().min(1),
  approvedImageRefs: RefArraySchema,
  evidenceRefs: RefArraySchema,
  protectedAttributes: z.array(z.string().min(1)).default([]),
  blockedVolatileClaims: z.array(z.string().min(1)).default([]),
  truthHash: z.string().min(1),
  status: z.enum(["ready", "warning", "blocked"]),
});

export const ProductVariantSnapshotSchema = z.object({
  variantSnapshotId: z.string().min(1),
  productId: z.string().min(1),
  selectedVariantHash: NullableStringSchema,
  optionLabels: z.array(z.string().min(1)).default([]),
  priceSnapshotRefs: RefArraySchema,
  visualIdentityAffects: z.boolean().default(false),
  status: z
    .enum(["not_applicable", "selected", "selection_required", "blocked"])
    .default("not_applicable"),
});

export const MarketplaceAutomationAccessSnapshotSchema = z
  .object({
    accessSnapshotId: z.string().min(1),
    actorUserId: z.number().int().positive(),
    tenantId: z.string().min(1),
    productId: z.string().min(1),
    accessType: z.enum(["owner", "read", "read_update", "admin", "blocked"]),
    allowedActions: z.array(z.string().min(1)).default([]),
    creditPayerUserId: z.number().int().positive(),
    backgroundRecheckRequired: z.boolean().default(true),
    status: z.enum(["ready", "blocked"]),
  })
  .superRefine((value, ctx) => {
    const canSpend =
      ["owner", "read_update", "admin"].includes(value.accessType) &&
      value.allowedActions.includes("spend_credits");
    if (value.status === "ready" && !canSpend) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Marketplace Auto Review spend requires owner/admin/read_update access and explicit spend_credits action",
        path: ["allowedActions"],
      });
    }
  });

export const ProductEvidenceFreshnessSnapshotSchema = z.object({
  freshnessSnapshotId: z.string().min(1),
  productId: z.string().min(1),
  capturedAt: NullableStringSchema,
  productUpdatedAt: NullableStringSchema,
  imageReadiness: z.enum(["ready", "needs_proxy", "missing", "blocked"]),
  volatileSignalPolicy: z.enum([
    "allow_current_snapshot",
    "omit_volatile_claims",
    "requires_recapture",
    "blocked",
  ]),
  staleRefs: RefArraySchema,
  status: z.enum(["ready", "warning", "blocked"]),
});

export const ProductReferenceAssetPackSchema = z
  .object({
    assetPackId: z.string().min(1),
    productId: z.string().min(1),
    selectedVariantHash: NullableStringSchema,
    selectedProductImageUrl: NullableStringSchema,
    selectedSource: z
      .enum(["user_selected", "single_image_auto", "legacy_default"])
      .default("legacy_default"),
    primaryRef: NullableStringSchema,
    supportingRefs: RefArraySchema,
    providerReferenceUrls: RefArraySchema,
    rejectedRefs: z
      .array(
        z.object({
          ref: z.string().min(1),
          reasonCode: z.string().min(1),
        })
      )
      .default([]),
    providerUsePolicy: z.enum(["allowed", "blocked", "needs_better_image"]),
    requiredUserAction: NullableStringSchema,
    qaRefs: RefArraySchema,
    status: z.enum(["ready", "warning", "blocked"]),
  })
  .superRefine((value, ctx) => {
    if (value.status === "ready" || value.providerUsePolicy === "allowed") {
      if (!value.selectedProductImageUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Product reference asset pack cannot be ready without the user-selected product image URL",
          path: ["selectedProductImageUrl"],
        });
      }
      if (!value.primaryRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Product reference asset pack cannot be ready without a primary product reference",
          path: ["primaryRef"],
        });
      }
      if (value.supportingRefs.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Product reference asset pack must use only the user-selected product anchor; supporting product references are not allowed",
          path: ["supportingRefs"],
        });
      }
      if (
        value.providerReferenceUrls.length !== 1 ||
        value.providerReferenceUrls[0] !== value.selectedProductImageUrl
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Product reference asset pack provider references must contain only the user-selected product image URL",
          path: ["providerReferenceUrls"],
        });
      }
      if (value.qaRefs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Product reference asset pack cannot be ready without product-reference QA evidence",
          path: ["qaRefs"],
        });
      }
    }
    if (value.status === "ready" && value.providerUsePolicy !== "allowed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready product reference asset packs must be allowed for provider use",
        path: ["providerUsePolicy"],
      });
    }
  });

export const CharacterIdentityAssetPackSchema = z
  .object({
    assetPackId: z.string().min(1),
    sourceKind: z.enum([
      "none",
      "uploaded_reference",
      "described_character",
      "product_only",
      "hands_only",
      "generated_character",
      "hand_model",
      "voice_persona",
      "marketplace_ref",
      "blocked",
    ]),
    referenceImageRefs: RefArraySchema,
    referenceImageUrls: RefArraySchema,
    consentRefs: RefArraySchema,
    allowedFaceUsage: z.enum([
      "none",
      "single_shot",
      "recurring",
      "hands_only",
      "generic_person",
      "blocked",
    ]),
    allowedVoiceUsage: z.enum([
      "none",
      "tts",
      "native_audio",
      "uploaded_voice",
      "blocked",
    ]),
    continuityDescriptors: z.array(z.string().min(1)).default([]),
    blockedRefs: RefArraySchema,
    fallbackPlan: z
      .enum([
        "product_only",
        "hands_only",
        "generic_person",
        "separate_tts",
        "single_shot",
        "blocked",
      ])
      .default("product_only"),
    qaThresholds: RecordSchema.default({}),
    status: z.enum(["not_applicable", "ready", "limited", "blocked"]),
  })
  .superRefine((value, ctx) => {
    const usesRecurringFace = value.allowedFaceUsage === "recurring";
    const usesReusableVoice = value.allowedVoiceUsage === "uploaded_voice";
    if (
      (usesRecurringFace || usesReusableVoice) &&
      value.consentRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Recurring character or reusable voice usage requires explicit consent evidence",
        path: ["consentRefs"],
      });
    }
    if (usesRecurringFace && value.continuityDescriptors.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recurring character usage requires continuity descriptors",
        path: ["continuityDescriptors"],
      });
    }
    if (value.status === "ready" && value.allowedFaceUsage === "blocked") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Blocked face usage cannot produce a ready character asset pack",
        path: ["allowedFaceUsage"],
      });
    }
    if (
      value.sourceKind === "uploaded_reference" &&
      value.status === "ready" &&
      value.referenceImageRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Uploaded character references must keep explicit reference image refs",
        path: ["referenceImageRefs"],
      });
    }
  });

export const EnvironmentReferenceAssetPackSchema = z
  .object({
    assetPackId: z.string().min(1),
    sourceKind: z.enum(["none", "uploaded_reference", "generated", "blocked"]),
    referenceImageRefs: RefArraySchema,
    referenceImageUrls: RefArraySchema,
    providerUsePolicy: z.enum([
      "not_used",
      "style_layout_lighting_anchor",
      "blocked",
    ]),
    continuityDescriptors: z.array(z.string().min(1)).default([]),
    blockedRefs: RefArraySchema,
    status: z.enum(["not_applicable", "ready", "limited", "blocked"]),
  })
  .superRefine((value, ctx) => {
    const isReady = value.status === "ready";
    const requiresReferences =
      isReady || value.providerUsePolicy === "style_layout_lighting_anchor";

    if (requiresReferences) {
      if (!["uploaded_reference", "generated"].includes(value.sourceKind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Environment reference pack requires uploaded_reference or generated source for use",
          path: ["sourceKind"],
        });
      }
      if (value.referenceImageRefs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Environment reference pack requires reference image refs when active",
          path: ["referenceImageRefs"],
        });
      }
      if (value.referenceImageUrls.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Environment reference pack requires reference image URLs when active",
          path: ["referenceImageUrls"],
        });
      }
      if (value.continuityDescriptors.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Environment reference pack requires continuity descriptors when active",
          path: ["continuityDescriptors"],
        });
      }
    }

    if (isReady && value.providerUsePolicy === "not_used") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ready environment reference packs cannot use `not_used` provider policy",
        path: ["providerUsePolicy"],
      });
    }
    if (value.providerUsePolicy === "blocked" && isReady) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Blocked provider policy cannot be marked ready for environment reference packs",
        path: ["providerUsePolicy"],
      });
    }
  });

export const MarketplaceEvidenceInstructionFirewallSchema = z.object({
  firewallId: z.string().min(1),
  status: z.enum(["passed", "reduced_to_safe_refs", "quarantined", "blocked"]),
  confidence: z.number().min(0).max(1),
  evaluatedAt: z.string().min(1),
  privacyEnvelopeRef: NullableStringSchema,
  rulePackRef: NullableStringSchema,
  detectedInstructionPatterns: z.array(z.string().min(1)).default([]),
  allowedFactRefs: RefArraySchema,
  escapedEvidenceRefs: RefArraySchema,
  quarantinedRefs: RefArraySchema,
  blockedRefs: RefArraySchema,
  blockedMutationTargets: z
    .array(
      z.enum([
        "instructions",
        "tools",
        "handoffs",
        "model_policy",
        "provider_routing",
        "credit_policy",
        "approvals",
        "output_routing",
        "public_copy",
      ])
    )
    .default([]),
});

export const ProductionAgentsSdkCapabilityManifestSchema = z.object({
  manifestId: z.string().min(1),
  manifestSchemaVersion: z.number().int().positive(),
  manifestHash: z.string().min(1),
  runId: z.string().min(1),
  stageKey: MarketplaceAutoReviewStageKeySchema,
  allowedAgents: z.array(z.string().min(1)).min(1),
  allowedTools: z.array(z.string().min(1)).default([]),
  allowedHandoffs: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        mayNarrowScopeOnly: z.boolean().default(true),
      })
    )
    .default([]),
  outputSchemas: z.array(z.string().min(1)).min(1),
  sessionPolicy: z.object({
    rawSessionPersistenceAllowed: z.boolean().default(false),
    checkpointRefsOnly: z.boolean().default(true),
  }),
  tracePolicy: z.object({
    rawTraceExportAllowed: z.boolean().default(false),
    includeSensitiveData: z.boolean().default(false),
    redactedSmartSpecEventsOnly: z.boolean().default(true),
  }),
  streamPolicy: z.object({
    enabled: z.boolean().default(false),
    redactedEventsOnly: z.boolean().default(true),
  }),
  hostedCapabilityDenials: z.array(z.string().min(1)).default([]),
  creditAuthority: z.literal("node_gateway_only"),
  persistenceAuthority: z.literal("node_platform_only"),
});

export const ProductionAgentsSdkAuthorityManifestSchema =
  AgentRuntimeProductionAgentsSdkCapabilityManifestSchema;

export const ProductionAgentsSdkCapabilityManifestAuthorityMappingSchema = z
  .object({
    marketplaceManifest: ProductionAgentsSdkCapabilityManifestSchema,
    agentRuntimeManifest: ProductionAgentsSdkAuthorityManifestSchema,
  })
  .superRefine((value, ctx) => {
    const marketplace = value.marketplaceManifest;
    const runtime = value.agentRuntimeManifest;
    const checks: Array<[boolean, (string | number)[], string]> = [
      [
        runtime.manifestHash === marketplace.manifestHash,
        ["agentRuntimeManifest", "manifestHash"],
        "capability_manifest_hash_mismatch",
      ],
      [
        runtime.runId === marketplace.runId,
        ["agentRuntimeManifest", "runId"],
        "capability_manifest_run_mismatch",
      ],
      [
        runtime.stageKey === marketplace.stageKey,
        ["agentRuntimeManifest", "stageKey"],
        "capability_manifest_stage_mismatch",
      ],
      [
        runtime.sessionPolicy.persistRawSdkSession === false &&
          runtime.sessionPolicy.checkpointRefsOnly === true,
        ["agentRuntimeManifest", "sessionPolicy"],
        "capability_manifest_session_policy_not_refs_only",
      ],
      [
        runtime.tracePolicy.captureSensitiveInputOutput === false &&
          runtime.tracePolicy.externalSdkTraceExport !== "development_only",
        ["agentRuntimeManifest", "tracePolicy"],
        "capability_manifest_trace_policy_not_redacted",
      ],
      [
        runtime.streamPolicy.normalizeEvents === true &&
          runtime.streamPolicy.stableEventIds === true &&
          runtime.streamPolicy.duplicateEventBehavior === "idempotent_noop",
        ["agentRuntimeManifest", "streamPolicy"],
        "capability_manifest_stream_policy_not_idempotent",
      ],
    ];
    for (const [passes, path, message] of checks) {
      if (!passes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      }
    }

    const missingAgents = stringSetMissing(
      marketplace.allowedAgents,
      runtime.allowedAgents
    );
    const extraAgents = stringSetExtras(
      runtime.allowedAgents,
      marketplace.allowedAgents
    );
    if (missingAgents.length > 0 || extraAgents.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentRuntimeManifest", "allowedAgents"],
        message: `capability_manifest_agent_authority_mismatch: missing=${missingAgents.join(",") || "none"} extra=${extraAgents.join(",") || "none"}`,
      });
    }

    const runtimeOutputSchemaRefs = runtime.outputSchemas.map(
      schema => schema.artifactKind
    );
    const missingSchemas = stringSetMissing(
      marketplace.outputSchemas,
      runtimeOutputSchemaRefs
    );
    const extraSchemas = stringSetExtras(
      runtimeOutputSchemaRefs,
      marketplace.outputSchemas
    );
    if (missingSchemas.length > 0 || extraSchemas.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentRuntimeManifest", "outputSchemas"],
        message: `capability_manifest_output_schema_authority_mismatch: missing=${missingSchemas.join(",") || "none"} extra=${extraSchemas.join(",") || "none"}`,
      });
    }

    const runtimeToolNames = new Set(
      runtime.allowedTools.map(tool => tool.name)
    );
    const missingTools = marketplace.allowedTools.filter(
      toolName => !runtimeToolNames.has(toolName)
    );
    if (missingTools.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentRuntimeManifest", "allowedTools"],
        message: `capability_manifest_runtime_tool_authority_missing: ${missingTools.join(", ")}`,
      });
    }
    const extraTools = stringSetExtras(
      runtime.allowedTools.map(tool => tool.name),
      marketplace.allowedTools
    );
    if (extraTools.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentRuntimeManifest", "allowedTools"],
        message: `capability_manifest_runtime_tool_authority_extra: ${extraTools.join(", ")}`,
      });
    }
    const toolsWithoutLimits = runtime.allowedTools.filter(
      tool =>
        !Number.isInteger(tool.maxCallsPerAttempt) ||
        tool.maxCallsPerAttempt <= 0
    );
    if (toolsWithoutLimits.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agentRuntimeManifest", "allowedTools"],
        message: "capability_manifest_tool_call_limits_required",
      });
    }
  });

export const ProductionCreativeBriefSnapshotSchema = z.object({
  briefSnapshotId: z.string().min(1),
  runId: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  viewerPromise: z.string().min(1),
  creativeLatitude: z.enum([
    "conservative",
    "balanced",
    "bold_but_evidence_bound",
  ]),
  qualityMode: z.enum(["fast", "balanced", "high_quality"]),
  autoDecisionPolicy: z.enum([
    "auto_safe",
    "auto_with_warnings",
    "human_review_required",
  ]),
  ctaIntent: z.string().min(1).nullable().optional(),
  userHintTrustLevels: z
    .record(
      z.enum(["style_only", "evidence_backed", "approval_required", "blocked"])
    )
    .default({}),
  avoidList: z.array(z.string().min(1)).default([]),
  ambiguityStatus: z.enum([
    "clear",
    "safe_defaults_applied",
    "needs_review",
    "blocked",
  ]),
  snapshotHash: z.string().min(1),
});

const CreativeConceptSchema = z
  .object({
    conceptId: z.string().min(1),
    title: z.string().min(1),
    hookType: z.string().min(1),
    targetAudience: z.string().min(1),
    coreTension: z.string().min(1),
    productRole: z.string().min(1),
    visualMetaphor: z.string().min(1),
    proofPlan: z.string().min(1),
    noveltyFingerprint: z.string().min(1),
    claimTruthRiskScore: z.number().min(0).max(1),
    adComplianceScore: z.number().min(0).max(1),
    creativeQualityScore: z.number().min(0).max(1),
    rationale: z.string().min(1),
  })
  .passthrough();

const CreativeConceptAlternativeSchema = z
  .object({
    conceptId: z.string().min(1),
    title: z.string().min(1).optional(),
    angle: z.string().min(1).optional(),
    rationale: z.string().min(1).optional(),
    selected: z.boolean().optional(),
    rejectedReason: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const CreativeConceptRejectedRationaleSchema = z
  .object({
    conceptId: z.string().min(1),
    reason: z.string().min(1),
  })
  .passthrough();

export const CreativeConceptSetSchema = z
  .object({
    conceptSetId: z.string().min(1),
    selectedConceptId: z.string().min(1),
    concepts: z.array(CreativeConceptSchema).min(3).max(5),
    alternatives: z
      .array(CreativeConceptAlternativeSchema)
      .min(3)
      .max(5)
      .optional(),
    rejectedConceptIds: RefArraySchema,
    selectionRationale: z.string().min(1),
    selectedRationale: z.string().min(1).optional(),
    rejectedRationales: z.array(CreativeConceptRejectedRationaleSchema),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const conceptIds = value.concepts.map(concept => concept.conceptId);
    const selectedConceptId = value.selectedConceptId;
    if (!conceptIds.includes(selectedConceptId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedConceptId"],
        message: "selectedConceptId must reference one generated concept",
      });
    }

    const nonSelectedConceptIds = conceptIds.filter(
      conceptId => conceptId !== selectedConceptId
    );
    const rejectedConceptIds = new Set(value.rejectedConceptIds);
    const rejectedRationaleIds = new Set(
      value.rejectedRationales.map(rationale => rationale.conceptId)
    );

    for (const conceptId of nonSelectedConceptIds) {
      if (!rejectedConceptIds.has(conceptId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejectedConceptIds"],
          message: `missing rejected concept coverage for ${conceptId}`,
        });
      }
      if (!rejectedRationaleIds.has(conceptId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejectedRationales"],
          message: `missing rejected rationale for ${conceptId}`,
        });
      }
    }

    if (rejectedConceptIds.has(selectedConceptId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedConceptIds"],
        message: "selected concept cannot also be rejected",
      });
    }
  });

export const StoryboardContractSchema = z.object({
  storyboardId: z.string().min(1),
  conceptId: z.string().min(1),
  durationSeconds: z.number().positive(),
  aspectRatio: z.string().min(1),
  shots: z
    .array(
      z.object({
        shotId: z.string().min(1),
        order: z.number().int().positive(),
        title: z.string().min(1),
        startSeconds: z.number().nonnegative(),
        endSeconds: z.number().positive(),
        visualIntent: z.string().min(1),
        voiceover: z.string().min(1),
        productReferenceAssetPackRefs: RefArraySchema,
        characterIdentityAssetPackRefs: RefArraySchema,
        warningPlanRefs: RefArraySchema,
      })
    )
    .min(1),
});

export const ShotMediaPayloadContractSchema = z.object({
  payloadId: z.string().min(1),
  shotId: z.string().min(1),
  mediaUnit: z.enum([
    "storyboard_cell",
    "start_frame",
    "stop_frame",
    "video_clip",
    "audio_segment",
    "thumbnail",
  ]),
  promptRef: z.string().min(1),
  promptHash: z.string().min(1),
  productReferenceAssetPackRefs: RefArraySchema,
  characterIdentityAssetPackRefs: RefArraySchema,
  allowedReferenceRefs: RefArraySchema,
  blockedReferenceRefs: RefArraySchema,
  selectedVariantHash: NullableStringSchema,
  providerPolicyRef: z.string().min(1),
});

export const NaturalSpeechContractSchema = z.object({
  speechId: z.string().min(1),
  language: z.literal("th"),
  style: z.enum(["natural_review", "calm_explainer", "energetic_shortform"]),
  targetDurationSeconds: z.number().positive(),
  text: z.string().min(1),
  unsupportedClaimRefs: RefArraySchema,
  rightsEnvelopeRefs: RefArraySchema,
});

export const AdvertisingPolicyRulePackSchema = z.object({
  rulePackId: z.string().min(1),
  version: z.string().min(1),
  status: z.enum([
    "draft",
    "approved",
    "pending_review",
    "deprecated",
    "expired",
    "blocked",
    "fixture_failed",
  ]),
  regions: z.array(z.string().min(1)).default(["TH", "global"]),
  platformProfiles: z.array(z.string().min(1)).default([]),
  sourceAnchors: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().min(1).optional(),
        sourceType: z.enum([
          "official",
          "platform",
          "tenant",
          "internal_policy",
        ]),
      })
    )
    .default([]),
  triggeredRuleIds: RefArraySchema,
  warningTemplateRefs: RefArraySchema,
  effectiveAt: NullableStringSchema,
  expiresAt: NullableStringSchema,
  fixtureReplayStatus: z.enum(["not_required", "passed", "failed", "pending"]),
});

export const AdvertisingComplianceProfileSchema = z.object({
  profileId: z.string().min(1),
  rulePackRef: z.string().min(1),
  status: z.enum([
    "pass",
    "pass_with_warnings",
    "approval_required",
    "blocked",
  ]),
  triggeredRuleIds: RefArraySchema,
  categoryRisk: z.enum(["low", "regulated", "high", "blocked"]).default("low"),
  requiredWarningRefs: RefArraySchema,
});

export const AdvertisingVisualWarningPlanSchema = z.object({
  warningPlanId: z.string().min(1),
  required: z.boolean(),
  exactText: z.string().min(1).nullable().optional(),
  language: z.enum(["th", "en", "mixed"]).default("th"),
  requiredShots: RefArraySchema,
  placement: z
    .enum([
      "top_safe_area",
      "bottom_safe_area",
      "caption_band",
      "metadata_only",
    ])
    .default("bottom_safe_area"),
  minDurationSeconds: z.number().nonnegative().default(0),
  contrastTarget: z.number().min(0).max(21).default(4.5),
  ocrReadabilityRequired: z.boolean().default(true),
  productOcclusionRule: z
    .enum(["must_not_occlude_product", "may_overlap_background_only"])
    .default("must_not_occlude_product"),
  verificationStatus: z
    .enum(["not_started", "pending", "passed", "failed"])
    .default("not_started"),
});

export const QAVerdictSchema = z.object({
  verdictId: z.string().min(1),
  status: z.enum(["pass", "pass_with_warnings", "needs_repair", "blocked"]),
  gate: z.string().min(1),
  score: z.number().min(0).max(1).nullable().optional(),
  reasonCodes: z.array(z.string().min(1)).default([]),
  evidenceRefs: RefArraySchema,
  repairTargets: z
    .array(
      z.object({
        targetId: z.string().min(1),
        shotId: z.string().min(1).nullable().optional(),
        mediaUnit: z.string().min(1),
        reasonCode: z.string().min(1),
      })
    )
    .default([]),
  userActionRequired: z.boolean().default(false),
});

export const ShotFrameVisionQaEnvelopeSchema = z.object({
  qaEnvelopeId: z.string().min(1),
  shotId: z.string().min(1),
  mediaUnit: z.enum([
    "storyboard_cell",
    "start_frame",
    "stop_frame",
    "video_keyframe",
    "thumbnail",
    "render_sample",
  ]),
  status: z.enum([
    "pending",
    "passed",
    "needs_targeted_repair",
    "blocked",
    "failed",
  ]),
  llmGatewayRouteRef: NullableStringSchema,
  creditsRef: NullableStringSchema,
  productReferenceAssetPackRefs: RefArraySchema,
  characterIdentityAssetPackRefs: RefArraySchema,
  reasonCodes: z.array(z.string().min(1)).default([]),
  repairPlanRef: NullableStringSchema,
});

export const TargetedMediaUnitRepairPlanSchema = z.object({
  repairPlanId: z.string().min(1),
  runId: z.string().min(1),
  shotId: z.string().min(1),
  mediaUnit: z.string().min(1),
  failedArtifactRef: z.string().min(1),
  preservedArtifactRefs: RefArraySchema,
  affectedDownstreamRefs: RefArraySchema,
  repairPromptPolicyRef: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  status: z.enum([
    "planned",
    "running",
    "succeeded",
    "blocked",
    "failed",
    "exhausted",
  ]),
});

export const GeneratedMediaAcceptanceEnvelopeSchema = z
  .object({
    acceptanceId: z.string().min(1),
    artifactRef: z.string().min(1),
    mediaUnit: z.string().min(1),
    status: z.enum([
      "candidate",
      "qa_pending",
      "accepted",
      "accepted_with_warnings",
      "quarantined_failed_qa",
      "policy_blocked",
      "superseded",
      "discarded",
    ]),
    allowedSurfaceRefs: RefArraySchema,
    blockedSurfaceRefs: RefArraySchema,
    retentionStatus: z
      .enum([
        "active_private",
        "retained_for_reuse",
        "quarantined",
        "discard_scheduled",
        "discarded",
      ])
      .default("active_private"),
    quarantineStatus: z
      .enum(["not_quarantined", "quarantined_pending_review", "quarantined"])
      .default("not_quarantined"),
    userVisibilityPolicy: z
      .enum(["private_library_only", "visible_to_user", "hidden_from_user"])
      .default("private_library_only"),
    reusePolicy: z
      .enum([
        "reuse_blocked",
        "requires_evidence_recheck",
        "allowed_same_run_only",
        "allowed_with_governance_refs",
      ])
      .default("requires_evidence_recheck"),
    qaVerdictRefs: RefArraySchema,
    warningApprovalRefs: RefArraySchema,
    supersedesRef: NullableStringSchema,
  })
  .superRefine((value, ctx) => {
    const accepted =
      value.status === "accepted" || value.status === "accepted_with_warnings";
    if (!accepted && value.status !== "quarantined_failed_qa") return;
    if (accepted && value.allowedSurfaceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowedSurfaceRefs"],
        message: "Accepted media must declare allowed user/output surfaces",
      });
    }
    if (accepted && value.qaVerdictRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qaVerdictRefs"],
        message: "Accepted media must keep QA verdict refs",
      });
    }
    if (accepted && value.quarantineStatus !== "not_quarantined") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quarantineStatus"],
        message: "Quarantined media cannot be accepted",
      });
    }
    if (value.status === "quarantined_failed_qa") {
      if (value.quarantineStatus === "not_quarantined") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quarantineStatus"],
          message: "Failed QA media must be quarantined",
        });
      }
      if (value.userVisibilityPolicy !== "hidden_from_user") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["userVisibilityPolicy"],
          message: "Quarantined failed media must be hidden from users",
        });
      }
    }
  });

export const VideoClipContinuityQaEnvelopeSchema = z
  .object({
    qaEnvelopeId: z.string().min(1),
    runId: z.string().min(1),
    shotId: z.string().min(1),
    stageKey: z.literal("video_generation"),
    mediaUnit: z.literal("video_clip"),
    status: z.enum([
      "pending",
      "passed",
      "needs_targeted_repair",
      "blocked",
      "failed",
    ]),
    checkedAt: z.string().min(1).optional(),
    llmGatewayRouteRef: NullableStringSchema,
    creditsRef: NullableStringSchema,
    videoUrl: z.string().min(1),
    generatedVideoSampleRefs: RefArraySchema,
    generatedVideoSampleUnavailableReason: NullableStringSchema,
    referenceFrameUrls: RefArraySchema,
    productReferenceUrls: RefArraySchema,
    sourceImageQaRefs: RefArraySchema,
    inspectionMode: z.string().min(1),
    reasonCodes: z.array(z.string().min(1)).default([]),
    repairInstruction: NullableStringSchema,
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "passed" &&
      value.generatedVideoSampleRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Video continuity QA cannot pass without generated-video sample/keyframe evidence",
        path: ["generatedVideoSampleRefs"],
      });
    }
    if (
      value.status === "passed" &&
      [
        "provider_url_only",
        "llm_vision_reference_frames_plus_provider_artifact_url",
      ].includes(value.inspectionMode)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Video continuity QA cannot pass from provider URL text only",
        path: ["inspectionMode"],
      });
    }
    if (
      value.generatedVideoSampleRefs.length === 0 &&
      !value.generatedVideoSampleUnavailableReason &&
      value.status !== "pending"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Missing generated-video samples must include a targeted unavailable reason",
        path: ["generatedVideoSampleUnavailableReason"],
      });
    }
  });

export const AudioContinuityQaEnvelopeSchema = z
  .object({
    qaEnvelopeId: z.string().min(1),
    runId: z.string().min(1),
    stageKey: z.literal("audio_generation"),
    status: z.enum([
      "accepted",
      "accepted_with_native_audio_provider",
      "skipped_silent",
      "warning_duration_short",
      "warning_duration_unknown",
      "needs_targeted_repair",
      "blocked",
      "failed",
    ]),
    checkedAt: z.string().min(1).optional(),
    resolvedAudioStrategy: z.enum([
      "native_video_audio",
      "separate_tts_voiceover",
      "silent",
    ]),
    expectedDurationSeconds: z.number().nonnegative(),
    actualDurationSeconds: z.number().nonnegative().optional(),
    audioEvidenceRefs: RefArraySchema,
    transcriptRefs: RefArraySchema,
    durationProbeRef: NullableStringSchema,
    gapAnalysisRef: NullableStringSchema,
    continuityChecks: z.array(z.string().min(1)).default([]),
    reasonCodes: z.array(z.string().min(1)).default([]),
    repairInstruction: NullableStringSchema,
  })
  .superRefine((value, ctx) => {
    const accepted = value.status === "accepted";
    if (!accepted) return;
    const missing: string[] = [];
    if (value.audioEvidenceRefs.length === 0) missing.push("audioEvidenceRefs");
    if (value.transcriptRefs.length === 0) missing.push("transcriptRefs");
    if (!value.durationProbeRef) missing.push("durationProbeRef");
    if (!value.gapAnalysisRef) missing.push("gapAnalysisRef");
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Audio continuity QA cannot pass without evidence, transcript, duration, and gap refs: ${missing.join(", ")}`,
        path: [missing[0]],
      });
    }
  });

export const WarningOverlayVerificationSchema = z.object({
  verificationId: z.string().min(1),
  runId: z.string().min(1),
  warningPlanId: NullableStringSchema,
  required: z.boolean(),
  status: z.enum(["passed", "failed", "not_required"]),
  checkedAt: z.string().min(1),
  checks: z.array(z.string().min(1)).default([]),
  reasonCodes: z.array(z.string().min(1)).default([]),
  ocrReadabilityRequired: z.boolean().optional(),
  ocrReadabilityStatus: z.string().min(1).optional(),
  renderPath: z.string().min(1),
});

export const FinalRenderQaEnvelopeSchema = z
  .object({
    qaEnvelopeId: z.string().min(1),
    runId: z.string().min(1),
    stageKey: z.enum(["render", "library_finalize"]),
    status: z.enum(["passed", "failed", "blocked"]),
    checkedAt: z.string().min(1),
    resultUrl: z.string().min(1),
    checks: z.array(z.string().min(1)).default([]),
    videoContinuityQaRefs: RefArraySchema.default([]),
    audioContinuityQaRef: NullableStringSchema,
    warningOverlayVerificationRef: NullableStringSchema,
    renderArtifactProbeRef: NullableStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "passed") return;
    const missing: string[] = [];
    if (value.checks.length === 0) missing.push("checks");
    if (value.videoContinuityQaRefs.length === 0) {
      missing.push("videoContinuityQaRefs");
    }
    if (!value.audioContinuityQaRef) missing.push("audioContinuityQaRef");
    if (!value.renderArtifactProbeRef) missing.push("renderArtifactProbeRef");
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [missing[0]],
        message: `Final render QA cannot pass without finalization refs: ${missing.join(", ")}`,
      });
    }
  });

export const CreditReservationPlanSchema = z.object({
  planId: z.string().min(1),
  runId: z.string().min(1),
  stageKey: MarketplaceAutoReviewStageKeySchema,
  category: z.enum([
    "llm_planning",
    "llm_verification",
    "llm_visual_qa",
    "llm_audio_qa",
    "llm_repair",
    "media_image_generation",
    "media_video_generation",
    "media_audio_generation",
    "render",
  ]),
  estimateCredits: z.number().positive(),
  idempotencyKey: z.string().min(1),
  reservationRef: NullableStringSchema,
  transactionRef: NullableStringSchema,
  status: z.enum([
    "estimated",
    "reserved",
    "spent",
    "released",
    "refunded",
    "blocked",
  ]),
});

export const MarketplaceAutoReviewArtifactLineageSchema = z.object({
  lineageId: z.string().min(1),
  artifactRef: z.string().min(1),
  sourceRefs: RefArraySchema,
  productEvidenceLockRef: NullableStringSchema,
  selectedVariantHash: NullableStringSchema,
  providerTaskRefs: RefArraySchema,
  qaVerdictRefs: RefArraySchema,
  creditRefs: RefArraySchema,
});

const GovernanceGateStatusSchema = z.enum([
  "passed",
  "passed_with_warnings",
  "not_required",
  "not_applicable",
  "pending",
  "requires_review",
  "blocked",
  "failed",
]);

export const MarketplacePrivacyGovernanceEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    redactionPolicy: z.string().min(1),
    checkedAt: z.string().min(1),
    evidenceRefs: RefArraySchema,
    blockedRefs: RefArraySchema,
    reasonCodes: z.array(z.string().min(1)).default([]),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && value.evidenceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRefs"],
        message:
          "Privacy governance cannot pass without redacted evidence refs",
      });
    }
  });

export const MarketplaceAssetRightsEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    policy: z.string().min(1),
    approvedAssetRefs: RefArraySchema,
    blockedAssetRefs: RefArraySchema,
    commercialUseScope: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && value.approvedAssetRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvedAssetRefs"],
        message: "Asset rights cannot pass without approved asset refs",
      });
    }
  });

export const MarketplaceAudioRightsMixEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    audioStrategy: z.enum([
      "native_video_audio",
      "separate_tts_voiceover",
      "silent",
    ]),
    rightsRefs: RefArraySchema,
    mixRefs: RefArraySchema,
    transcriptRefs: RefArraySchema,
    loudnessPolicy: z.string().min(1).nullable().optional(),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      value.status === "passed" &&
      value.audioStrategy !== "silent" &&
      (value.rightsRefs.length === 0 || value.mixRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rightsRefs"],
        message: "Audio rights/mix cannot pass without rights and mix refs",
      });
    }
  });

export const MarketplaceDistributionProfileEnvelopeSchema = z
  .object({
    profileId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    platformProfiles: z.array(z.string().min(1)).default([]),
    aspectRatio: z.string().min(1),
    targetDurationSeconds: z.number().positive().optional(),
    maxDurationSeconds: z.number().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    safeAreas: z.array(z.string().min(1)).default([]),
    warningTextRequired: z.boolean().default(false),
    checkedAt: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      value.status === "passed" &&
      (value.platformProfiles.length === 0 || value.safeAreas.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platformProfiles"],
        message:
          "Distribution profile cannot pass without platform profiles and safe areas",
      });
    }
  });

export const MarketplaceFeedbackMemoryEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    memoryWritePolicy: z.enum([
      "disabled",
      "refs_only",
      "redacted_summary_only",
    ]),
    feedbackRefs: RefArraySchema,
    retentionPolicyRef: NullableStringSchema,
    checkedAt: z.string().min(1),
  })
  .passthrough();

export const MarketplaceCtaLandingIntegrityEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    ctaPolicy: z.string().min(1),
    landingUrlRef: NullableStringSchema,
    landingSafetyRefs: RefArraySchema,
    blockedReasonCodes: z.array(z.string().min(1)).default([]),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && value.landingSafetyRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["landingSafetyRefs"],
        message:
          "CTA landing integrity cannot pass without landing safety refs",
      });
    }
  });

export const MarketplaceCampaignGovernanceEnvelopeSchema = z
  .object({
    gateId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    activeRunDedupePolicy: z.string().min(1),
    duplicateVariationPolicy: z.string().min(1),
    spendAnomalyPolicy: z.string().min(1),
    dailyVariantCapPolicy: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .passthrough();

export const MarketplaceBrandSellerVoiceEnvelopeSchema = z
  .object({
    policyId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    brandRef: NullableStringSchema,
    sellerVoiceUse: z.string().min(1),
    ctaPolicy: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .passthrough();

export const MarketplaceHumanReviewEnvelopeSchema = z
  .object({
    gateId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    reasonCodes: z.array(z.string().min(1)).default([]),
    approverRole: NullableStringSchema,
    approvalRef: NullableStringSchema,
    timeoutAction: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && !value.approvalRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approvalRef"],
        message: "Human review cannot pass without approval evidence",
      });
    }
  });

export const MarketplaceInputChangeImpactEnvelopeSchema = z
  .object({
    impactId: z.string().min(1),
    status: z.enum([
      "no_recheck_required",
      "recheck_required",
      "downstream_invalidated",
      "blocked",
    ]),
    snapshotHash: z.string().min(1),
    staleRefs: RefArraySchema,
    invalidatedRefs: RefArraySchema,
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      ["recheck_required", "downstream_invalidated", "blocked"].includes(
        value.status
      ) &&
      value.staleRefs.length === 0 &&
      value.invalidatedRefs.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staleRefs"],
        message: "Input-change impact requires stale or invalidated refs",
      });
    }
  });

export const MarketplaceProviderEventAuthenticityEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    providerEventRefs: RefArraySchema,
    signatureVerificationRefs: RefArraySchema,
    replayProtectionRefs: RefArraySchema,
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      value.status === "passed" &&
      (value.providerEventRefs.length === 0 ||
        value.signatureVerificationRefs.length === 0 ||
        value.replayProtectionRefs.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerEventRefs"],
        message:
          "Provider event authenticity cannot pass without event, signature, and replay refs",
      });
    }
  });

export const MarketplacePayloadBudgetEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    maxBytes: z.number().int().positive(),
    actualBytes: z.number().int().nonnegative(),
    tokenEstimate: z.number().int().nonnegative().optional(),
    overflowPolicy: z.string().min(1),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && value.actualBytes > value.maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actualBytes"],
        message:
          "Payload budget cannot pass when actual bytes exceed max bytes",
      });
    }
  });

export const MarketplaceStorageQuotaEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    quotaPolicyRef: z.string().min(1),
    storageRefs: RefArraySchema,
    bytesReserved: z.number().int().nonnegative(),
    bytesUsed: z.number().int().nonnegative(),
    checkedAt: z.string().min(1),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.status === "passed" && value.storageRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storageRefs"],
        message: "Storage quota cannot pass without storage refs",
      });
    }
  });

export const MarketplaceRetryDlqEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    retryPolicyRef: z.string().min(1),
    attemptRefs: RefArraySchema,
    dlqRefs: RefArraySchema,
    leaseRefs: RefArraySchema,
    checkedAt: z.string().min(1),
  })
  .passthrough();

export const MarketplaceRenderArtifactProbeSchema = z
  .object({
    probeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    resultUrl: z.string().min(1),
    checkedAt: z.string().min(1).optional(),
    probeRefs: RefArraySchema,
  })
  .passthrough();

export const MarketplaceRenderStorageEnvelopeSchema = z
  .object({
    envelopeId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    resultUrl: z.string().min(1),
    codec: z.string().min(1),
    container: z.string().min(1),
    storageQuotaPolicy: z.string().min(1),
    durationSeconds: z.number().positive(),
    resolution: z.string().min(1),
  })
  .passthrough();

export const MarketplacePostPublishGovernanceEnvelopeSchema = z
  .object({
    reuseRequiresEvidenceFreshnessRecheck: z.boolean(),
    staleClaimPolicy: z.string().min(1),
    takedownPolicy: z.string().min(1),
    status: GovernanceGateStatusSchema.default("passed"),
    governanceRefs: RefArraySchema,
  })
  .passthrough();

export const MarketplacePublishableAssetPackageSchema = z
  .object({
    packageId: z.string().min(1),
    status: z.enum([
      "ready_private_library_asset",
      "ready_for_publish",
      "blocked",
      "quarantined",
    ]),
    runId: z.string().min(1),
    productionRunId: NullableStringSchema,
    libraryItemId: z.union([z.string(), z.number()]).nullable().optional(),
    resultUrl: z.string().min(1),
    metadataManifestRef: z.string().min(1),
    checksum: z.string().min(1),
    evidenceRefs: RefArraySchema,
    creditRefs: RefArraySchema,
    postPublishGovernance:
      MarketplacePostPublishGovernanceEnvelopeSchema.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (
      value.status.startsWith("ready") &&
      (value.evidenceRefs.length === 0 ||
        value.creditRefs.length === 0 ||
        !value.postPublishGovernance)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRefs"],
        message:
          "Publishable package cannot be ready without evidence, credit, and post-publish governance refs",
      });
    }
  });

export const MarketplacePublishablePackageRequirementsSchema = z
  .object({
    packageGateId: z.string().min(1),
    status: GovernanceGateStatusSchema,
    checkedAt: z.string().min(1).optional(),
    requirementRefs: RefArraySchema,
  })
  .passthrough();

export const MarketplaceGovernanceEnvelopeSetSchema = z
  .object({
    privacyEnvelopeRef: NullableStringSchema,
    audioRightsMixEnvelopeRef: NullableStringSchema,
    distributionProfileRef: NullableStringSchema,
    feedbackMemoryEnvelopeRef: NullableStringSchema,
    ctaLandingIntegrityEnvelopeRef: NullableStringSchema,
    campaignGovernanceRef: NullableStringSchema,
    brandSellerVoicePolicyRef: NullableStringSchema,
    humanReviewGateRef: NullableStringSchema,
    inputChangeImpactRef: NullableStringSchema,
    providerEventAuthenticityRef: NullableStringSchema,
    payloadBudgetEnvelopeRef: NullableStringSchema,
    storageQuotaEnvelopeRef: NullableStringSchema,
    retryDlqEnvelopeRef: NullableStringSchema,
    postPublishGovernanceRef: NullableStringSchema,
  })
  .passthrough();

export const MarketplaceAutoReviewRunMetadataV2Schema = z.object({
  schemaVersion: z.literal(MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION),
  productEvidenceLock: ProductEvidenceLockSchema.optional(),
  referenceAnchors: MarketplaceAutoReviewReferenceAnchorsSchema.optional(),
  productVariantSnapshot: ProductVariantSnapshotSchema.optional(),
  accessSnapshot: MarketplaceAutomationAccessSnapshotSchema.optional(),
  evidenceFreshnessSnapshot: ProductEvidenceFreshnessSnapshotSchema.optional(),
  productReferenceAssetPack: ProductReferenceAssetPackSchema.optional(),
  characterIdentityAssetPack: CharacterIdentityAssetPackSchema.optional(),
  environmentReferenceAssetPack: EnvironmentReferenceAssetPackSchema.optional(),
  evidenceInstructionFirewall:
    MarketplaceEvidenceInstructionFirewallSchema.optional(),
  capabilityManifests: z
    .array(ProductionAgentsSdkCapabilityManifestSchema)
    .default([]),
  creativeBriefSnapshot: ProductionCreativeBriefSnapshotSchema.optional(),
  creativeConceptSet: CreativeConceptSetSchema.optional(),
  storyboardContract: StoryboardContractSchema.optional(),
  shotMediaPayloads: z.array(ShotMediaPayloadContractSchema).default([]),
  naturalSpeechContracts: z.array(NaturalSpeechContractSchema).default([]),
  advertisingRulePack: AdvertisingPolicyRulePackSchema.optional(),
  advertisingComplianceProfile: AdvertisingComplianceProfileSchema.optional(),
  visualWarningPlan: AdvertisingVisualWarningPlanSchema.optional(),
  qaVerdicts: z.array(QAVerdictSchema).default([]),
  shotFrameVisionQa: z.array(ShotFrameVisionQaEnvelopeSchema).default([]),
  videoClipContinuityQa: z
    .array(VideoClipContinuityQaEnvelopeSchema)
    .default([]),
  videoClipContinuityQaEnvelopes: z
    .array(VideoClipContinuityQaEnvelopeSchema)
    .default([]),
  videoContinuityQaSummary: RecordSchema.optional(),
  audioContinuityQaEnvelope: AudioContinuityQaEnvelopeSchema.optional(),
  warningOverlayVerification: WarningOverlayVerificationSchema.optional(),
  finalRenderQaEnvelope: FinalRenderQaEnvelopeSchema.optional(),
  finalMediaQaEnvelope: FinalRenderQaEnvelopeSchema.optional(),
  renderArtifactProbe: MarketplaceRenderArtifactProbeSchema.optional(),
  mediaArtifactInspection: RecordSchema.optional(),
  qaArtifactManifest: RecordSchema.optional(),
  renderStorageEnvelope: MarketplaceRenderStorageEnvelopeSchema.optional(),
  renderDistributionProfile:
    MarketplaceDistributionProfileEnvelopeSchema.optional(),
  publishableAssetPackage: MarketplacePublishableAssetPackageSchema.optional(),
  publishablePackageRequirements:
    MarketplacePublishablePackageRequirementsSchema.optional(),
  privacyEnvelope: MarketplacePrivacyGovernanceEnvelopeSchema.optional(),
  assetRightsEnvelope: MarketplaceAssetRightsEnvelopeSchema.optional(),
  audioRightsMixEnvelope: MarketplaceAudioRightsMixEnvelopeSchema.optional(),
  distributionProfile: MarketplaceDistributionProfileEnvelopeSchema.optional(),
  feedbackMemoryEnvelope: MarketplaceFeedbackMemoryEnvelopeSchema.optional(),
  ctaLandingIntegrityEnvelope:
    MarketplaceCtaLandingIntegrityEnvelopeSchema.optional(),
  campaignGovernance: MarketplaceCampaignGovernanceEnvelopeSchema.optional(),
  brandSellerVoicePolicy: MarketplaceBrandSellerVoiceEnvelopeSchema.optional(),
  humanReviewGate: MarketplaceHumanReviewEnvelopeSchema.optional(),
  inputChangeImpact: MarketplaceInputChangeImpactEnvelopeSchema.optional(),
  providerEventAuthenticity:
    MarketplaceProviderEventAuthenticityEnvelopeSchema.optional(),
  payloadBudgetEnvelope: MarketplacePayloadBudgetEnvelopeSchema.optional(),
  storageQuotaEnvelope: MarketplaceStorageQuotaEnvelopeSchema.optional(),
  retryDlqEnvelope: MarketplaceRetryDlqEnvelopeSchema.optional(),
  postPublishGovernance:
    MarketplacePostPublishGovernanceEnvelopeSchema.optional(),
  automationControlPlane: RecordSchema.optional(),
  providerReconciliation: RecordSchema.optional(),
  targetedRepairPolicyLedger: RecordSchema.optional(),
  automationMetrics: RecordSchema.optional(),
  parallelismPolicy: RecordSchema.optional(),
  operationalDrillPlan: RecordSchema.optional(),
  durableRuntimePlan: RecordSchema.optional(),
  qualityModePolicy: RecordSchema.optional(),
  creativePerformanceMemory: RecordSchema.optional(),
  targetedRepairPlans: z.array(TargetedMediaUnitRepairPlanSchema).default([]),
  mediaAcceptance: z.array(GeneratedMediaAcceptanceEnvelopeSchema).default([]),
  creditPlans: z.array(CreditReservationPlanSchema).default([]),
  stageCompletionEvidence: z
    .array(MarketplaceAutoReviewStageCompletionEvidenceSchema)
    .default([]),
  artifactLineage: z
    .array(MarketplaceAutoReviewArtifactLineageSchema)
    .default([]),
  policySnapshots: z.array(RecordSchema).default([]),
  capabilityManifestAuthorityMappings: z
    .array(ProductionAgentsSdkCapabilityManifestAuthorityMappingSchema)
    .default([]),
  governance: MarketplaceGovernanceEnvelopeSetSchema.default({}),
});

export const MarketplaceAutoReviewApiProjectionSchema = z.object({
  schemaVersion: z.literal(MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION),
  runId: z.string().min(1),
  summary: z.object({
    productId: z.string().min(1),
    outputMode: z.enum(["storyboard_images", "full_video"]),
    status: MarketplaceAutoReviewRunStatusSchema,
    currentStage: MarketplaceAutoReviewStageKeySchema.nullable().optional(),
    statusDetail: MarketplaceAutoReviewStatusDetailSchema,
    progressPercent: z.number().min(0).max(100),
    createdAt: z.string().min(1).nullable().optional(),
    updatedAt: z.string().min(1).nullable().optional(),
  }),
  timeline: MarketplaceAutoReviewTimelineProjectionSchema,
  creditSummary: MarketplaceAutoReviewCreditSummarySchema,
  outputLinks: z.array(MarketplaceAutoReviewOutputLinkSchema).default([]),
  automation: RecordSchema.default({}),
  redaction: MarketplaceAutoReviewTimelineProjectionSchema.shape.redaction,
});

export type MarketplaceAutoReviewStageKey = z.infer<
  typeof MarketplaceAutoReviewStageKeySchema
>;
export type MarketplaceAutoReviewStatusDetail = z.infer<
  typeof MarketplaceAutoReviewStatusDetailSchema
>;
export type MarketplaceAutoReviewTimelineProjection = z.infer<
  typeof MarketplaceAutoReviewTimelineProjectionSchema
>;
export type MarketplaceAutoReviewTimelineItem = z.infer<
  typeof MarketplaceAutoReviewTimelineItemSchema
>;
export type MarketplaceAutoReviewRunMetadataV2 = z.infer<
  typeof MarketplaceAutoReviewRunMetadataV2Schema
>;
export type MarketplaceAutoReviewApiProjection = z.infer<
  typeof MarketplaceAutoReviewApiProjectionSchema
>;
export type MarketplaceAutoReviewStageCompletionEvidence = z.infer<
  typeof MarketplaceAutoReviewStageCompletionEvidenceSchema
>;
export type ProductReferenceAssetPack = z.infer<
  typeof ProductReferenceAssetPackSchema
>;
export type CharacterIdentityAssetPack = z.infer<
  typeof CharacterIdentityAssetPackSchema
>;
export type MarketplaceAutoReviewReferenceAnchors = z.infer<
  typeof MarketplaceAutoReviewReferenceAnchorsSchema
>;
export type EnvironmentReferenceAssetPack = z.infer<
  typeof EnvironmentReferenceAssetPackSchema
>;
export type QAVerdict = z.infer<typeof QAVerdictSchema>;
export type ShotFrameVisionQaEnvelope = z.infer<
  typeof ShotFrameVisionQaEnvelopeSchema
>;
export type VideoClipContinuityQaEnvelope = z.infer<
  typeof VideoClipContinuityQaEnvelopeSchema
>;
export type AudioContinuityQaEnvelope = z.infer<
  typeof AudioContinuityQaEnvelopeSchema
>;
export type WarningOverlayVerification = z.infer<
  typeof WarningOverlayVerificationSchema
>;
export type FinalRenderQaEnvelope = z.infer<typeof FinalRenderQaEnvelopeSchema>;
export type TargetedMediaUnitRepairPlan = z.infer<
  typeof TargetedMediaUnitRepairPlanSchema
>;
export type GeneratedMediaAcceptanceEnvelope = z.infer<
  typeof GeneratedMediaAcceptanceEnvelopeSchema
>;
export type CreditReservationPlan = z.infer<typeof CreditReservationPlanSchema>;
export type ProductionAgentsSdkCapabilityManifestAuthorityMapping = z.infer<
  typeof ProductionAgentsSdkCapabilityManifestAuthorityMappingSchema
>;
export type MarketplacePrivacyGovernanceEnvelope = z.infer<
  typeof MarketplacePrivacyGovernanceEnvelopeSchema
>;
export type MarketplaceAudioRightsMixEnvelope = z.infer<
  typeof MarketplaceAudioRightsMixEnvelopeSchema
>;
export type MarketplaceDistributionProfileEnvelope = z.infer<
  typeof MarketplaceDistributionProfileEnvelopeSchema
>;
export type MarketplaceInputChangeImpactEnvelope = z.infer<
  typeof MarketplaceInputChangeImpactEnvelopeSchema
>;
export type MarketplacePublishableAssetPackage = z.infer<
  typeof MarketplacePublishableAssetPackageSchema
>;

const STAGE_LABELS: Record<MarketplaceAutoReviewStageKey, string> = {
  product_preflight: "ตรวจข้อมูลสินค้า",
  production_project: "เตรียมโปรเจกต์การผลิต",
  concept_story: "สร้างแนวคิดและโครงเรื่อง",
  prompt_plan: "วางแผนช็อต บทพูด และสื่อ",
  image_generation: "สร้างภาพและเฟรมอ้างอิง",
  storyboard_review: "ส่งเข้า Storyboard Review",
  video_generation: "สร้างวิดีโอรายช็อต",
  audio_generation: "เตรียมเสียงและจังหวะพูด",
  video_edit: "ประกอบไทม์ไลน์วิดีโอ",
  render: "เรนเดอร์วิดีโอ",
  library_finalize: "บันทึกเข้า Library",
};

type RunLike = {
  id: string;
  productId: string;
  outputMode: string;
  status: string;
  currentStage?: string | null;
  stageIndex?: number | null;
  stageCount?: number | null;
  errorMessage?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  metadataJson?: unknown;
};

type StageLike = {
  stageKey: string;
  stageOrder: number;
  status: string;
  outputJson?: unknown;
  errorMessage?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(item => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function evidenceByStageFromMetadata(
  metadata: Record<string, unknown>
): Map<
  MarketplaceAutoReviewStageKey,
  MarketplaceAutoReviewStageCompletionEvidence
> {
  const entries = Array.isArray(metadata.stageCompletionEvidence)
    ? metadata.stageCompletionEvidence
    : [];
  const byStage = new Map<
    MarketplaceAutoReviewStageKey,
    MarketplaceAutoReviewStageCompletionEvidence
  >();
  for (const entry of entries) {
    const parsed =
      MarketplaceAutoReviewStageCompletionEvidenceSchema.safeParse(entry);
    if (parsed.success) byStage.set(parsed.data.stageKey, parsed.data);
  }
  return byStage;
}

function statusFromCompletionEvidence(
  evidence: MarketplaceAutoReviewStageCompletionEvidence | undefined,
  fallback: z.infer<typeof MarketplaceAutoReviewStageStatusSchema>
): z.infer<typeof MarketplaceAutoReviewStageStatusSchema> {
  if (!evidence) return fallback;
  if (evidence.status === "complete") return "completed";
  if (evidence.status === "warning_complete") return "completed_with_warnings";
  if (evidence.status === "skipped") return "skipped";
  if (evidence.status === "repair_required") return "repairing";
  if (evidence.status === "user_blocked") return "blocked_needs_user";
  if (evidence.status === "terminal_failure") return "failed";
  if (evidence.status === "cancelled") return "cancelled";
  if (evidence.status === "retriable_failure") return "waiting_provider";
  return fallback;
}

function progressFromEvidenceAndStatus(input: {
  evidence?: MarketplaceAutoReviewStageCompletionEvidence;
  status: z.infer<typeof MarketplaceAutoReviewStageStatusSchema>;
  output: Record<string, unknown>;
  isCurrent: boolean;
}): number {
  const explicitProgress = Number(input.output.progressPercent);
  if (Number.isFinite(explicitProgress)) {
    return Math.max(0, Math.min(100, explicitProgress));
  }
  if (
    input.evidence?.status === "complete" ||
    input.evidence?.status === "warning_complete" ||
    input.evidence?.status === "skipped" ||
    ["completed", "completed_with_warnings", "skipped"].includes(input.status)
  ) {
    return 100;
  }
  if (input.status === "repairing") return 70;
  if (input.status === "qa_pending") return 80;
  if (input.status === "waiting_provider") return 60;
  if (
    input.status === "blocked" ||
    input.status === "blocked_needs_user" ||
    input.status === "failed" ||
    input.status === "cancelled"
  ) {
    return 0;
  }
  return input.isCurrent ? 50 : 0;
}

function isStageKey(
  value: string | null | undefined
): value is MarketplaceAutoReviewStageKey {
  return MARKETPLACE_AUTO_REVIEW_STAGE_KEYS.includes(
    value as MarketplaceAutoReviewStageKey
  );
}

function stageKeysForMode(outputMode: string): MarketplaceAutoReviewStageKey[] {
  return outputMode === "full_video"
    ? [...MARKETPLACE_AUTO_REVIEW_STAGE_KEYS]
    : MARKETPLACE_AUTO_REVIEW_STAGE_KEYS.slice(0, 6);
}

function normalizeStageStatus(
  value: string
): z.infer<typeof MarketplaceAutoReviewStageStatusSchema> {
  if (MarketplaceAutoReviewStageStatusSchema.safeParse(value).success) {
    return value as z.infer<typeof MarketplaceAutoReviewStageStatusSchema>;
  }
  if (value === "waiting") return "waiting_provider";
  return "queued";
}

function shouldSkipQueuedStageAfterTerminalRun(input: {
  runStatus: string;
  stageOrder: number;
  currentStageOrder: number;
  status: z.infer<typeof MarketplaceAutoReviewStageStatusSchema>;
}): boolean {
  return (
    (input.runStatus === "failed" || input.runStatus === "cancelled") &&
    input.status === "queued" &&
    input.stageOrder > input.currentStageOrder
  );
}

function detailFor(input: {
  state: z.infer<typeof MarketplaceAutoReviewDetailStateSchema>;
  stageKey?: MarketplaceAutoReviewStageKey | null;
  safeMessage: string;
  severity?: z.infer<
    typeof MarketplaceAutoReviewStatusDetailSchema
  >["severity"];
  reasonCodes?: string[];
  nextAction?: string | null;
  userActionRequired?: boolean;
  retryable?: boolean;
  technicalRef?: string | null;
}): MarketplaceAutoReviewStatusDetail {
  return MarketplaceAutoReviewStatusDetailSchema.parse({
    severity: input.severity ?? "info",
    reasonCodes: input.reasonCodes ?? [],
    userActionRequired: input.userActionRequired ?? false,
    retryable: input.retryable ?? false,
    ...input,
  });
}

function detailFromStage(
  stage: StageLike | undefined,
  fallbackStage: MarketplaceAutoReviewStageKey | null
): MarketplaceAutoReviewStatusDetail {
  const output = asRecord(stage?.outputJson);
  const rawDetail = asRecord(output.statusDetail);
  const parsed = MarketplaceAutoReviewStatusDetailSchema.safeParse(rawDetail);
  if (parsed.success) return parsed.data;

  const outputStatus =
    typeof output.status === "string" ? output.status : undefined;
  if (outputStatus === "vision_qa") {
    return detailFor({
      state: "qa_running",
      stageKey: fallbackStage,
      reasonCodes: ["provider_image_completed", "vision_qa_running"],
      safeMessage:
        "ภาพจาก provider เสร็จแล้ว ระบบกำลังตัดเฟรมและตรวจ QA ก่อนส่งเข้า Storyboard Review",
      nextAction:
        "รอให้ QA ผ่านหรือให้ระบบซ่อมเฉพาะจุดที่ไม่ผ่าน",
      retryable: true,
    });
  }
  if (outputStatus === "vision_qa_repair") {
    return detailFor({
      state: "frame_vision_qa_repairing",
      stageKey: fallbackStage,
      severity: "warning",
      reasonCodes: asStringArray(output.repairRefs).length
        ? asStringArray(output.repairRefs)
        : ["vision_qa_repair_required"],
      safeMessage:
        "ภาพสร้างเสร็จแล้ว แต่ QA พบจุดที่ต้องซ่อม ระบบกำลังซ่อม grid/frame ที่ไม่ผ่าน",
      nextAction:
        "รอผลซ่อมจาก provider แล้วระบบจะตรวจ QA และส่งเข้า Storyboard Review ต่อ",
      retryable: true,
    });
  }

  const blockerCode =
    typeof output.blockerCode === "string" ? output.blockerCode : undefined;
  if (
    blockerCode &&
    MarketplaceAutoReviewDetailStateSchema.safeParse(blockerCode).success
  ) {
    return detailFor({
      state: blockerCode as z.infer<
        typeof MarketplaceAutoReviewDetailStateSchema
      >,
      stageKey: fallbackStage,
      severity: "blocked",
      reasonCodes: [blockerCode],
      safeMessage:
        typeof output.safeMessage === "string"
          ? output.safeMessage
          : "ระบบหยุดรอการแก้ไขก่อนทำงานต่อ",
      nextAction:
        typeof output.nextAction === "string"
          ? output.nextAction
          : "ตรวจรายละเอียดและแก้ไขข้อมูลที่ระบบแจ้ง",
      userActionRequired: true,
      retryable: false,
    });
  }

  const status = String(stage?.status ?? "");
  if (status === "cancelled") {
    return detailFor({
      state: "cancelled",
      stageKey: fallbackStage,
      severity: "warning",
      reasonCodes: ["cancelled"],
      safeMessage: "ขั้นตอนนี้ถูกยกเลิกแล้ว",
      nextAction: "เริ่มงานใหม่ได้เมื่อพร้อม",
      retryable: true,
    });
  }
  if (status === "failed") {
    return detailFor({
      state: "failed_terminal",
      stageKey: fallbackStage,
      severity: "error",
      reasonCodes: ["stage_failed"],
      safeMessage: stage?.errorMessage || "ขั้นตอนนี้ล้มเหลว",
      nextAction:
        "ตรวจรายละเอียดแล้วเริ่มงานใหม่หรือให้ระบบกู้คืนจาก checkpoint",
      retryable: true,
    });
  }
  if (status === "waiting_provider") {
    return detailFor({
      state: "waiting_provider",
      stageKey: fallbackStage,
      safeMessage: "รอผลจาก provider หรือระบบประมวลผลสื่อ",
      nextAction: "ระบบจะตรวจสถานะให้อัตโนมัติ",
    });
  }
  if (status === "repairing") {
    return detailFor({
      state: "frame_vision_qa_repairing",
      stageKey: fallbackStage,
      safeMessage: "กำลังซ่อมเฉพาะส่วนที่ QA ไม่ผ่าน",
      nextAction: "รอให้ระบบสร้างและตรวจเฉพาะชิ้นงานนั้นใหม่",
    });
  }
  if (status === "completed_with_warnings") {
    return detailFor({
      state: "completed_with_warnings",
      stageKey: fallbackStage,
      severity: "warning",
      safeMessage: "ขั้นตอนเสร็จพร้อมคำเตือนที่มีขอบเขตชัดเจน",
      nextAction: "ตรวจคำเตือนก่อนนำงานไปใช้ต่อ",
    });
  }
  if (status === "completed") {
    return detailFor({
      state: "completed",
      stageKey: fallbackStage,
      severity: "success",
      safeMessage: "ขั้นตอนนี้เสร็จแล้ว",
    });
  }
  if (status === "running") {
    return detailFor({
      state: "running",
      stageKey: fallbackStage,
      safeMessage: "ระบบกำลังทำขั้นตอนนี้",
    });
  }
  return detailFor({
    state: "queued",
    stageKey: fallbackStage,
    safeMessage: "รอทำขั้นตอนนี้",
  });
}

function buildOutputLinksFromStage(
  stageKey: MarketplaceAutoReviewStageKey,
  output: Record<string, unknown>
): z.infer<typeof MarketplaceAutoReviewOutputLinkSchema>[] {
  const links: z.infer<typeof MarketplaceAutoReviewOutputLinkSchema>[] = [];
  const storyboardReviewId =
    typeof output.storyboardReviewId === "string"
      ? output.storyboardReviewId
      : "";
  if (storyboardReviewId) {
    links.push({
      kind: "storyboard_review",
      label: "Storyboard Review",
      url: `/storyboard-review?reviewId=${encodeURIComponent(storyboardReviewId)}`,
      safeForUser: true,
      stageKey,
      artifactRef: storyboardReviewId,
    });
  }
  const videoEditorProjectId =
    typeof output.videoEditorProjectId === "string"
      ? output.videoEditorProjectId
      : "";
  if (videoEditorProjectId) {
    links.push({
      kind: "video_editor",
      label: "Video Editor",
      url: `/video-editor?projectId=${encodeURIComponent(videoEditorProjectId)}`,
      safeForUser: true,
      stageKey,
      artifactRef: videoEditorProjectId,
    });
  }
  const libraryItemId =
    typeof output.libraryItemId === "number" ||
    typeof output.libraryItemId === "string"
      ? String(output.libraryItemId)
      : "";
  if (libraryItemId) {
    links.push({
      kind: "library_item",
      label: "Library",
      url: `/library/${encodeURIComponent(libraryItemId)}`,
      safeForUser: true,
      stageKey,
      artifactRef: libraryItemId,
    });
  }
  const resultUrl =
    typeof output.resultUrl === "string" ? output.resultUrl : "";
  if (
    resultUrl &&
    !resultUrl.includes("task_id=") &&
    isSafeUserVisibleUrl(resultUrl)
  ) {
    links.push({
      kind: stageKey === "render" ? "render" : "frame",
      label: stageKey === "render" ? "Render output" : "Generated output",
      url: resultUrl,
      safeForUser: true,
      stageKey,
      artifactRef: resultUrl,
    });
  }
  return links;
}

function creditSummaryFrom(
  output: Record<string, unknown>,
  metadata: Record<string, unknown>
): z.infer<typeof MarketplaceAutoReviewCreditSummarySchema> {
  const credit = asRecord(output.creditSummary);
  const metadataCredit = asRecord(metadata.creditSummary);
  return MarketplaceAutoReviewCreditSummarySchema.parse({
    estimateCredits:
      Number(credit.estimateCredits ?? metadataCredit.estimateCredits ?? 0) ||
      0,
    reservedCredits:
      Number(credit.reservedCredits ?? metadataCredit.reservedCredits ?? 0) ||
      0,
    spentCredits:
      Number(credit.spentCredits ?? metadataCredit.spentCredits ?? 0) || 0,
    refundedCredits:
      Number(credit.refundedCredits ?? metadataCredit.refundedCredits ?? 0) ||
      0,
    outstandingCredits:
      Number(
        credit.outstandingCredits ?? metadataCredit.outstandingCredits ?? 0
      ) || 0,
    authorizationStatus:
      typeof credit.authorizationStatus === "string"
        ? credit.authorizationStatus
        : "not_required",
    reservationRefs: asStringArray(
      credit.reservationRefs ?? metadataCredit.reservationRefs
    ),
    transactionRefs: asStringArray(
      credit.transactionRefs ?? metadataCredit.transactionRefs
    ),
  });
}

function automationSummaryFrom(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const controlPlane = asRecord(metadata.automationControlPlane);
  const lease = asRecord(controlPlane.lease);
  const metrics = asRecord(metadata.automationMetrics);
  const parallelismPolicy = asRecord(metadata.parallelismPolicy);
  const operationalDrillPlan = asRecord(metadata.operationalDrillPlan);
  return {
    controlPlane: compactProjectionRecord({
      status: safeProjectionText(controlPlane.status),
      backpressurePolicy: safeProjectionText(controlPlane.backpressurePolicy),
      lease: compactProjectionRecord({
        leaseId: safeProjectionText(lease.leaseId),
      }),
    }),
    providerReconciliation: compactProjectionRecord({
      status: safeProjectionText(asRecord(metadata.providerReconciliation).status),
    }),
    targetedRepairPolicyLedger: compactProjectionRecord({
      status: safeProjectionText(
        asRecord(metadata.targetedRepairPolicyLedger).status
      ),
    }),
    qaArtifactManifest: compactProjectionRecord({
      status: safeProjectionText(asRecord(metadata.qaArtifactManifest).status),
      manifestId: safeProjectionText(asRecord(metadata.qaArtifactManifest).manifestId),
    }),
    mediaArtifactInspection: compactProjectionRecord({
      status: safeProjectionText(asRecord(metadata.mediaArtifactInspection).status),
      inspectionId: safeProjectionText(
        asRecord(metadata.mediaArtifactInspection).inspectionId
      ),
    }),
    durableRuntimePlan: compactProjectionRecord({
      status: safeProjectionText(asRecord(metadata.durableRuntimePlan).status),
    }),
    qualityModePolicy: compactProjectionRecord({
      mode: safeProjectionText(asRecord(metadata.qualityModePolicy).mode),
      status: safeProjectionText(asRecord(metadata.qualityModePolicy).status),
    }),
    creativePerformanceMemory: compactProjectionRecord({
      status: safeProjectionText(asRecord(metadata.creativePerformanceMemory).status),
    }),
    metrics: compactProjectionRecord({
      qaCacheEntryCount: safeProjectionNumber(metrics.qaCacheEntryCount),
      repairCacheEntryCount: safeProjectionNumber(metrics.repairCacheEntryCount),
    }),
    parallelismPolicy: compactProjectionRecord({
      status: safeProjectionText(parallelismPolicy.status),
      maxParallelImageSubmissions: safeProjectionNumber(
        parallelismPolicy.maxParallelImageSubmissions
      ),
      maxParallelVideoSubmissions: safeProjectionNumber(
        parallelismPolicy.maxParallelVideoSubmissions
      ),
      maxParallelVisionQa: safeProjectionNumber(
        parallelismPolicy.maxParallelVisionQa
      ),
    }),
    operationalDrillPlan: compactProjectionRecord({
      status: safeProjectionText(operationalDrillPlan.status),
      scenarioCount: Array.isArray(operationalDrillPlan.scenarios)
        ? operationalDrillPlan.scenarios.length
        : null,
    }),
  };
}

function activeDetailForRun(
  run: RunLike,
  currentStage: StageLike | undefined,
  currentStageKey: MarketplaceAutoReviewStageKey | null
): MarketplaceAutoReviewStatusDetail {
  if (run.status === "completed") {
    return detailFor({
      state: "completed",
      stageKey: currentStageKey,
      severity: "success",
      safeMessage: "งานสร้างอัตโนมัติเสร็จแล้ว",
    });
  }
  if (run.status === "failed") {
    return detailFor({
      state: "failed_terminal",
      stageKey: currentStageKey,
      severity: "error",
      reasonCodes: ["run_failed"],
      safeMessage:
        run.errorMessage ||
        currentStage?.errorMessage ||
        "งานสร้างอัตโนมัติล้มเหลว",
      nextAction:
        "ตรวจ blocker แล้วเริ่มใหม่หรือให้ผู้ดูแลกู้คืนจาก checkpoint",
      retryable: true,
    });
  }
  if (run.status === "cancelled") {
    return detailFor({
      state: "cancelled",
      stageKey: currentStageKey,
      severity: "warning",
      reasonCodes: ["cancelled"],
      safeMessage: "งานนี้ถูกยกเลิกแล้ว",
    });
  }
  return detailFromStage(currentStage, currentStageKey);
}

export function buildMarketplaceAutoReviewTimelineProjection(
  run: RunLike,
  stages: StageLike[] = []
): MarketplaceAutoReviewTimelineProjection {
  const keys = stageKeysForMode(run.outputMode);
  const metadata = asRecord(run.metadataJson);
  const stageByKey = new Map(stages.map(stage => [stage.stageKey, stage]));
  const completionEvidenceByStage = evidenceByStageFromMetadata(metadata);
  const currentStageKey = isStageKey(run.currentStage ?? null)
    ? (run.currentStage as MarketplaceAutoReviewStageKey)
    : (keys.find(
        key =>
          stageByKey.get(key)?.status === "running" ||
          stageByKey.get(key)?.status === "waiting_provider"
      ) ?? keys[0]);
  const currentStage = currentStageKey
    ? stageByKey.get(currentStageKey)
    : undefined;
  const currentStageOrder =
    Number(run.stageIndex) ||
    currentStage?.stageOrder ||
    (currentStageKey ? keys.indexOf(currentStageKey) + 1 : 1) ||
    1;
  const items = keys.map((stageKey, index) => {
    const stage = stageByKey.get(stageKey);
    const output = asRecord(stage?.outputJson);
    let detail = detailFromStage(stage, stageKey);
    const rawStatus = normalizeStageStatus(
      String(stage?.status ?? (index === 0 ? "queued" : "queued"))
    );
    const evidence = completionEvidenceByStage.get(stageKey);
    let status = statusFromCompletionEvidence(evidence, rawStatus);
    const order = stage?.stageOrder || index + 1;
    if (
      shouldSkipQueuedStageAfterTerminalRun({
        runStatus: run.status,
        stageOrder: order,
        currentStageOrder,
        status,
      })
    ) {
      status = "skipped";
      detail = detailFor({
        state: "skipped",
        stageKey,
        severity: "info",
        reasonCodes: [`run_${run.status}_before_stage`],
        safeMessage: "ข้ามขั้นตอนนี้ เพราะงานหยุดก่อนถึงขั้นตอนนี้",
        nextAction: "ตรวจขั้นตอนที่ล้มเหลวหรือถูกยกเลิกก่อนหน้า",
      });
    }
    return MarketplaceAutoReviewTimelineItemSchema.parse({
      stageKey,
      label: STAGE_LABELS[stageKey],
      order,
      status,
      detail,
      startedAt: toIso(stage?.startedAt),
      completedAt: toIso(stage?.completedAt),
      activeSubstep:
        typeof output.activeSubstep === "string" ? output.activeSubstep : null,
      progressPercent: progressFromEvidenceAndStatus({
        evidence,
        status,
        output,
        isCurrent: stageKey === currentStageKey,
      }),
      qaVerdictRefs: evidence?.qaVerdictRefs.length
        ? evidence.qaVerdictRefs
        : asStringArray(output.qaVerdictRefs),
      repairRefs: asStringArray(output.repairRefs),
      evidenceRefs: evidence
        ? [
            evidence.evidenceId,
            ...evidence.artifactRefs,
            ...evidence.lineageRefs,
            ...evidence.policyRefs,
            ...evidence.acceptanceRefs,
          ]
        : asStringArray(output.evidenceRefs),
      credit: creditSummaryFrom(output, metadata),
      outputLinks: buildOutputLinksFromStage(stageKey, output),
    });
  });
  const completedCount = items.filter(
    item =>
      item.status === "completed" ||
      item.status === "completed_with_warnings" ||
      item.status === "skipped"
  ).length;
  const progressPercent =
    run.status === "completed"
      ? 100
      : Math.max(
          0,
          Math.min(
            99,
            Math.round((completedCount / Math.max(1, items.length)) * 100)
          )
        );
  const statusDetail = activeDetailForRun(
    run,
    currentStage,
    currentStageKey ?? null
  );
  return MarketplaceAutoReviewTimelineProjectionSchema.parse({
    schemaVersion: MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION,
    runId: run.id,
    outputMode:
      run.outputMode === "full_video" ? "full_video" : "storyboard_images",
    currentStage: currentStageKey ?? null,
    status: MarketplaceAutoReviewRunStatusSchema.safeParse(run.status).success
      ? run.status
      : "running",
    statusDetail,
    progressPercent,
    nextAction: statusDetail.nextAction ?? null,
    items,
    redaction: {
      rawProviderPayloadHidden: true,
      rawPromptHidden: true,
      signedUrlsHidden: true,
      privateEvidenceHidden: true,
    },
  });
}

export function buildMarketplaceAutoReviewApiProjection(
  run: RunLike,
  stages: StageLike[] = [],
  outputLinks: z.infer<typeof MarketplaceAutoReviewOutputLinkSchema>[] = []
): MarketplaceAutoReviewApiProjection {
  const timeline = buildMarketplaceAutoReviewTimelineProjection(run, stages);
  const creditSummary = MarketplaceAutoReviewCreditSummarySchema.parse(
    asRecord(asRecord(run.metadataJson).creditSummary)
  );
  return MarketplaceAutoReviewApiProjectionSchema.parse({
    schemaVersion: MARKETPLACE_AUTO_REVIEW_CONTRACT_VERSION,
    runId: run.id,
    summary: {
      productId: run.productId,
      outputMode:
        run.outputMode === "full_video" ? "full_video" : "storyboard_images",
      status: MarketplaceAutoReviewRunStatusSchema.safeParse(run.status).success
        ? run.status
        : "running",
      currentStage: timeline.currentStage ?? null,
      statusDetail: timeline.statusDetail,
      progressPercent: timeline.progressPercent,
      createdAt: toIso(run.createdAt),
      updatedAt: toIso(run.updatedAt),
    },
    timeline,
    creditSummary,
    outputLinks,
    automation: automationSummaryFrom(asRecord(run.metadataJson)),
    redaction: timeline.redaction,
  });
}
