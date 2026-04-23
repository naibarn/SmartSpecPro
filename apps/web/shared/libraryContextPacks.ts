import { z } from "zod";

export const libraryContextPackStatusValues = [
  "draft",
  "active",
  "archived",
] as const;
export const libraryContextPackSourceModeValues = [
  "manual",
  "view_backed",
  "snapshot",
] as const;
export const libraryContextPackMemberModeValues = [
  "include",
  "exclude",
  "pin",
] as const;
export const libraryContextPackRuntimeTierValues = [
  "durable_memory",
  "retrieved_evidence",
] as const;
export const libraryContextPackReadinessStatusValues = [
  "draft",
  "review_pending",
  "trusted",
  "stale",
] as const;
export const libraryContextPackRelationPolicyValues = [
  "none",
  "manual_only",
  "one_hop_gated",
] as const;
export const libraryContextPackBudgetProfileValues = [
  "balanced",
  "follow_up",
  "personalized",
  "retrieval",
] as const;
export const libraryContextPackResolutionStatusValues = [
  "complete",
  "partial",
  "empty",
] as const;
export const libraryContextPackDiagnosticSeverityValues = [
  "info",
  "warning",
  "error",
] as const;
export const libraryContextPackReviewActionValues = [
  "submit_for_review",
  "approve_trusted",
  "approve_for_agents",
  "revoke_agent_approval",
  "mark_stale",
  "request_re_review",
  "archive",
] as const;
export const libraryContextPackDiagnosticCodeValues = [
  "PACK_ARCHIVED",
  "PACK_NOT_FOUND",
  "PACK_UNREADABLE",
  "PRIVATE_VAULT_LOCKED",
  "ITEM_UNREADABLE",
  "ITEM_UNINDEXED",
  "ITEM_DELETED",
  "SNAPSHOT_CONTENT_DRIFT",
  "SNAPSHOT_METADATA_DRIFT",
  "TOKEN_BUDGET_CLAMPED",
] as const;

export const libraryContextPackStatusSchema = z.enum(
  libraryContextPackStatusValues,
);
export const libraryContextPackSourceModeSchema = z.enum(
  libraryContextPackSourceModeValues,
);
export const libraryContextPackMemberModeSchema = z.enum(
  libraryContextPackMemberModeValues,
);
export const libraryContextPackRuntimeTierSchema = z.enum(
  libraryContextPackRuntimeTierValues,
);
export const libraryContextPackReadinessStatusSchema = z.enum(
  libraryContextPackReadinessStatusValues,
);
export const libraryContextPackRelationPolicySchema = z.enum(
  libraryContextPackRelationPolicyValues,
);
export const libraryContextPackBudgetProfileSchema = z.enum(
  libraryContextPackBudgetProfileValues,
);
export const libraryContextPackResolutionStatusSchema = z.enum(
  libraryContextPackResolutionStatusValues,
);
export const libraryContextPackDiagnosticSeveritySchema = z.enum(
  libraryContextPackDiagnosticSeverityValues,
);
export const libraryContextPackReviewActionSchema = z.enum(
  libraryContextPackReviewActionValues,
);
export const libraryContextPackDiagnosticCodeSchema = z.enum(
  libraryContextPackDiagnosticCodeValues,
);

export const libraryContextPackRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({ slug: z.string().min(1).max(160) }),
]);

export const libraryContextPackMetadataSchema = z
  .record(z.unknown())
  .default({});

export const libraryContextPackMemberCountsSchema = z.object({
  included: z.number().int().nonnegative().default(0),
  excluded: z.number().int().nonnegative().default(0),
  pinned: z.number().int().nonnegative().default(0),
  dynamicCandidates: z.number().int().nonnegative().nullable().default(null),
});

export const libraryContextPackSummarySchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(255),
  status: libraryContextPackStatusSchema,
  sourceMode: libraryContextPackSourceModeSchema,
  approvedForAgents: z.boolean(),
  readinessStatus: libraryContextPackReadinessStatusSchema,
  defaultRuntimeTier: libraryContextPackRuntimeTierSchema,
  memberCounts: libraryContextPackMemberCountsSchema,
  estimatedTokenHint: z.number().int().nonnegative().nullable().default(null),
  updatedAt: z.coerce.date(),
});

export const libraryContextPackDiagnosticSchema = z.object({
  code: libraryContextPackDiagnosticCodeSchema,
  severity: libraryContextPackDiagnosticSeveritySchema,
  itemId: z.number().int().positive().optional(),
  message: z.string().min(1),
});

export const libraryContextPackMemberPreviewSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  memberMode: libraryContextPackMemberModeSchema,
});

export const libraryContextPackReviewEventSchema = z.object({
  id: z.number().int().positive(),
  contextPackId: z.number().int().positive(),
  actorUserId: z.number().int().positive().nullable().default(null),
  action: libraryContextPackReviewActionSchema,
  previousReadinessStatus: libraryContextPackReadinessStatusSchema.nullable().default(null),
  nextReadinessStatus: libraryContextPackReadinessStatusSchema.nullable().default(null),
  previousApprovedForAgents: z.boolean(),
  nextApprovedForAgents: z.boolean(),
  reason: z.string().nullable().default(null),
  metadata: libraryContextPackMetadataSchema,
  createdAt: z.coerce.date(),
});

export const libraryContextPackDetailSchema =
  libraryContextPackSummarySchema.extend({
    description: z.string().nullable().default(null),
    relationExpansionPolicy: libraryContextPackRelationPolicySchema,
    budgetProfile: libraryContextPackBudgetProfileSchema,
    sourceMode: libraryContextPackSourceModeSchema,
    maxNoteCount: z.number().int().positive().nullable().default(null),
    maxTokenHint: z.number().int().positive().nullable().default(null),
    freshnessExpectation: z.string().nullable().default(null),
    savedViewId: z.number().int().positive().nullable().default(null),
    submittedForReviewAt: z.coerce.date().nullable().default(null),
    reviewedAt: z.coerce.date().nullable().default(null),
    approvedAt: z.coerce.date().nullable().default(null),
    reviewerUserId: z.number().int().positive().nullable().default(null),
    lastSourceMutationAt: z.coerce.date().nullable().default(null),
    freshUntil: z.coerce.date().nullable().default(null),
    archivedAt: z.coerce.date().nullable().default(null),
    createdAt: z.coerce.date(),
    metadata: libraryContextPackMetadataSchema,
    memberPreview: z.array(libraryContextPackMemberPreviewSchema).default([]),
    reviewHistory: z.array(libraryContextPackReviewEventSchema).default([]),
    lastResolutionDiagnostics: z
      .array(libraryContextPackDiagnosticSchema)
      .default([]),
  });

const createMembershipArraysSchema = z.object({
  includeItemIds: z.array(z.number().int().positive()).max(200).default([]),
  excludeItemIds: z.array(z.number().int().positive()).max(200).default([]),
  pinnedItemIds: z.array(z.number().int().positive()).max(100).default([]),
});

export const libraryContextPackListInputSchema = z.object({
  query: z.string().max(255).optional(),
  status: libraryContextPackStatusSchema.optional(),
  sourceMode: libraryContextPackSourceModeSchema.optional(),
  approvedForAgents: z.boolean().optional(),
  readinessStatus: libraryContextPackReadinessStatusSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export const libraryGetContextPackInputSchema = libraryContextPackRefSchema;

export const libraryCreateContextPackInputSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  sourceMode: libraryContextPackSourceModeSchema,
  savedViewId: z.number().int().positive().optional(),
  relationExpansionPolicy: libraryContextPackRelationPolicySchema.default(
    "none",
  ),
  defaultRuntimeTier: libraryContextPackRuntimeTierSchema.default(
    "retrieved_evidence",
  ),
  budgetProfile: libraryContextPackBudgetProfileSchema.default("retrieval"),
  maxNoteCount: z.number().int().min(1).max(500).optional(),
  maxTokenHint: z.number().int().min(256).max(200_000).optional(),
  readinessStatus: libraryContextPackReadinessStatusSchema.default("draft"),
  approvedForAgents: z.boolean().default(false),
  metadata: libraryContextPackMetadataSchema.optional(),
}).merge(createMembershipArraysSchema);

export const libraryUpdateContextPackInputSchema = z
  .object({
    ref: libraryContextPackRefSchema,
    expectedUpdatedAt: z.coerce.date().optional(),
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    relationExpansionPolicy: libraryContextPackRelationPolicySchema.optional(),
    defaultRuntimeTier: libraryContextPackRuntimeTierSchema.optional(),
    budgetProfile: libraryContextPackBudgetProfileSchema.optional(),
    maxNoteCount: z.number().int().min(1).max(500).nullable().optional(),
    maxTokenHint: z.number().int().min(256).max(200_000).nullable().optional(),
    readinessStatus: libraryContextPackReadinessStatusSchema.optional(),
    approvedForAgents: z.boolean().optional(),
    metadata: libraryContextPackMetadataSchema.optional(),
  })
  .merge(createMembershipArraysSchema.partial());

export const libraryArchiveContextPackInputSchema =
  libraryContextPackRefSchema;

const libraryContextPackWorkflowBaseSchema = z.object({
  ref: libraryContextPackRefSchema,
  expectedUpdatedAt: z.coerce.date().optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  metadata: libraryContextPackMetadataSchema.optional(),
});

export const librarySubmitContextPackForReviewInputSchema =
  libraryContextPackWorkflowBaseSchema;

export const libraryApproveContextPackInputSchema =
  libraryContextPackWorkflowBaseSchema;

export const libraryApproveContextPackForAgentsInputSchema =
  libraryContextPackWorkflowBaseSchema;

export const libraryRevokeContextPackAgentApprovalInputSchema =
  libraryContextPackWorkflowBaseSchema;

export const libraryMarkContextPackStaleInputSchema =
  libraryContextPackWorkflowBaseSchema.extend({
    reason: z.string().trim().min(1).max(500),
  });

export const libraryRequestContextPackReReviewInputSchema =
  libraryContextPackWorkflowBaseSchema;

export const libraryConvertContextPackToSnapshotInputSchema =
  libraryContextPackWorkflowBaseSchema.extend({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
  });

export const libraryDuplicateContextPackAsSnapshotInputSchema =
  libraryContextPackWorkflowBaseSchema.extend({
    title: z.string().min(1).max(255).optional(),
    slug: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).optional(),
    defaultRuntimeTier: libraryContextPackRuntimeTierSchema.optional(),
  });

export const libraryPublishSavedViewAsContextPackInputSchema = z.object({
  savedViewId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  snapshot: z.boolean().default(false),
  pinnedItemIds: z.array(z.number().int().positive()).max(100).default([]),
  excludedItemIds: z.array(z.number().int().positive()).max(200).default([]),
  defaultRuntimeTier: libraryContextPackRuntimeTierSchema.default(
    "retrieved_evidence",
  ),
  approvedForAgents: z.boolean().default(false),
});

export const libraryResolveContextPackInputSchema = z.object({
  ref: libraryContextPackRefSchema,
  runtimeTierOverride: libraryContextPackRuntimeTierSchema.optional(),
  maxItems: z.number().int().min(1).max(500).optional(),
  tokenBudgetHint: z.number().int().min(256).max(200_000).optional(),
  failIfPartial: z.boolean().default(false),
  includeCitations: z.boolean().default(true),
});

export const libraryContextPackResolveCitationSchema = z.object({
  sourceRef: z.string().min(1),
  chunkId: z.number().int().positive().optional(),
  excerpt: z.string().min(1).optional(),
});

export const libraryContextPackResolveItemSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  logicalPath: z.string().nullable().default(null),
  runtimeTier: libraryContextPackRuntimeTierSchema,
  freshness: z.enum(["fresh", "recent", "stale"]),
  includedReason: z.string().min(1),
  citations: z.array(libraryContextPackResolveCitationSchema).default([]),
});

export const libraryContextPackResolveTotalsSchema = z.object({
  candidateCount: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
});

export const libraryContextPackResolvePackSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(255),
  sourceMode: libraryContextPackSourceModeSchema,
  defaultRuntimeTier: libraryContextPackRuntimeTierSchema,
  approvedForAgents: z.boolean(),
  readinessStatus: libraryContextPackReadinessStatusSchema,
});

export const libraryContextPackResolveResultSchema = z.object({
  pack: libraryContextPackResolvePackSchema,
  status: libraryContextPackResolutionStatusSchema,
  relationExpansionApplied: z.literal(false),
  totals: libraryContextPackResolveTotalsSchema,
  items: z.array(libraryContextPackResolveItemSchema),
  diagnostics: z.array(libraryContextPackDiagnosticSchema).default([]),
});

export const libraryContextPackMutationResultSchema = z.object({
  success: z.literal(true),
});

export type LibraryContextPackStatus = z.infer<
  typeof libraryContextPackStatusSchema
>;
export type LibraryContextPackSourceMode = z.infer<
  typeof libraryContextPackSourceModeSchema
>;
export type LibraryContextPackMemberMode = z.infer<
  typeof libraryContextPackMemberModeSchema
>;
export type LibraryContextPackRuntimeTier = z.infer<
  typeof libraryContextPackRuntimeTierSchema
>;
export type LibraryContextPackReadinessStatus = z.infer<
  typeof libraryContextPackReadinessStatusSchema
>;
export type LibraryContextPackRelationPolicy = z.infer<
  typeof libraryContextPackRelationPolicySchema
>;
export type LibraryContextPackBudgetProfile = z.infer<
  typeof libraryContextPackBudgetProfileSchema
>;
export type LibraryContextPackRef = z.infer<
  typeof libraryContextPackRefSchema
>;
export type LibraryContextPackSummary = z.infer<
  typeof libraryContextPackSummarySchema
>;
export type LibraryContextPackDetail = z.infer<
  typeof libraryContextPackDetailSchema
>;
export type LibraryContextPackReviewAction = z.infer<
  typeof libraryContextPackReviewActionSchema
>;
export type LibraryContextPackReviewEvent = z.infer<
  typeof libraryContextPackReviewEventSchema
>;
export type LibraryContextPackDiagnostic = z.infer<
  typeof libraryContextPackDiagnosticSchema
>;
export type LibraryContextPackListInput = z.infer<
  typeof libraryContextPackListInputSchema
>;
export type LibraryGetContextPackInput = z.infer<
  typeof libraryGetContextPackInputSchema
>;
export type LibraryCreateContextPackInput = z.infer<
  typeof libraryCreateContextPackInputSchema
>;
export type LibraryUpdateContextPackInput = z.infer<
  typeof libraryUpdateContextPackInputSchema
>;
export type LibraryArchiveContextPackInput = z.infer<
  typeof libraryArchiveContextPackInputSchema
>;
export type LibrarySubmitContextPackForReviewInput = z.infer<
  typeof librarySubmitContextPackForReviewInputSchema
>;
export type LibraryApproveContextPackInput = z.infer<
  typeof libraryApproveContextPackInputSchema
>;
export type LibraryApproveContextPackForAgentsInput = z.infer<
  typeof libraryApproveContextPackForAgentsInputSchema
>;
export type LibraryRevokeContextPackAgentApprovalInput = z.infer<
  typeof libraryRevokeContextPackAgentApprovalInputSchema
>;
export type LibraryMarkContextPackStaleInput = z.infer<
  typeof libraryMarkContextPackStaleInputSchema
>;
export type LibraryRequestContextPackReReviewInput = z.infer<
  typeof libraryRequestContextPackReReviewInputSchema
>;
export type LibraryConvertContextPackToSnapshotInput = z.infer<
  typeof libraryConvertContextPackToSnapshotInputSchema
>;
export type LibraryDuplicateContextPackAsSnapshotInput = z.infer<
  typeof libraryDuplicateContextPackAsSnapshotInputSchema
>;
export type LibraryPublishSavedViewAsContextPackInput = z.infer<
  typeof libraryPublishSavedViewAsContextPackInputSchema
>;
export type LibraryResolveContextPackInput = z.infer<
  typeof libraryResolveContextPackInputSchema
>;
export type LibraryContextPackResolveResult = z.infer<
  typeof libraryContextPackResolveResultSchema
>;
