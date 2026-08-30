import { z } from "zod";

/**
 * Feature 165 server/Worker boundary. These schemas deliberately contain
 * references and redacted metadata, never credentials or Worker-local paths.
 */
export const comfyJobTypeValues = [
  "comfy_image_generation",
  "comfy_video_generation",
  "shot_video_generation",
  "comfy_workflow_run",
] as const;
export const comfyJobTypeSchema = z.enum(comfyJobTypeValues);
export type ComfyJobType = z.infer<typeof comfyJobTypeSchema>;

export const comfyTransportValues = [
  "local_stdio",
  "self_hosted_stdio_bridge",
  "self_hosted_http_mcp",
  "comfy_cloud",
  "ssh_tunnel",
] as const;
export const comfyTransportSchema = z.enum(comfyTransportValues);

const safeId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const revision = safeId;

export const comfyConnectionProfileSchema = z.object({
  profileId: safeId,
  workerId: safeId,
  displayName: z.string().trim().min(1).max(160),
  transport: comfyTransportSchema,
  endpointLabel: z.string().trim().min(1).max(240),
  endpointOrigin: z.string().url().nullable(),
  credentialKind: z.enum(["none", "api_key", "oauth", "ssh_keychain_ref"]),
  credentialState: z.enum(["not_required", "available", "expired", "revoked", "missing"]),
  profileRevision: revision,
  permissionRevision: revision,
  policyRevision: revision,
  projectionRevision: revision,
  enabled: z.boolean(),
  lastProbeAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.transport === "comfy_cloud" && value.endpointOrigin !== "https://cloud.comfy.org") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endpointOrigin"], message: "comfy cloud endpoint is not allowlisted" });
  }
  if (value.credentialKind === "none" && value.credentialState !== "not_required") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credentialState"], message: "credential state is invalid for a credential-free profile" });
  }
});
export type ComfyConnectionProfile = z.infer<typeof comfyConnectionProfileSchema>;

export const comfyCapabilitySnapshotSchema = z.object({
  snapshotId: safeId,
  profileId: safeId,
  profileRevision: revision,
  protocolVersion: z.string().trim().min(1).max(64),
  serverName: z.string().trim().min(1).max(160),
  tools: z.array(z.object({ name: safeId, inputSchemaHash: sha256 }).strict()).max(256),
  workflowIds: z.array(safeId).max(512),
  capabilities: z.array(safeId).max(512),
  snapshotHash: sha256,
  checkedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type ComfyCapabilitySnapshot = z.infer<typeof comfyCapabilitySnapshotSchema>;

export const comfyWorkflowVersionSchema = z.object({
  workflowId: safeId,
  version: safeId,
  checksum: sha256,
  displayName: z.string().trim().min(1).max(240),
  workflowFamily: safeId,
  sourceRef: safeId,
  schemaVersion: revision,
  inputSchema: z.record(z.string(), z.unknown()),
  outputTypes: z.array(z.enum(["image", "video", "audio", "file", "text"])).min(1).max(8),
  status: z.enum(["discovered", "review", "approved", "deprecated", "disabled"]),
  registryRevision: revision,
}).strict();
export type ComfyWorkflowVersion = z.infer<typeof comfyWorkflowVersionSchema>;

export const comfyConnectionResolutionSchema = z.object({
  selectedProfileId: safeId.nullable(),
  profileRevision: revision.nullable(),
  permissionRevision: revision.nullable(),
  policyRevision: revision.nullable(),
}).strict().superRefine((value, ctx) => {
  const fields = [value.selectedProfileId, value.profileRevision, value.permissionRevision, value.policyRevision];
  if (fields.some(Boolean) && fields.some(field => !field)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedProfileId"], message: "connection resolution fields must be all null or all populated" });
  }
});

export const comfyWorkflowResolutionSchema = z.object({
  workflowId: safeId,
  version: safeId,
  checksum: sha256,
  bindingRevision: revision,
  registryRevision: revision,
}).strict();

export const comfyInputResolutionSchema = z.object({
  mode: z.enum(["manual", "guided_ai", "automated_ai"]),
  evidenceId: safeId.nullable(),
  resolvedInputHash: sha256.nullable(),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "automated_ai" && (!value.evidenceId || !value.resolvedInputHash || !value.approvedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceId"], message: "automated AI jobs require immutable resolution evidence" });
  }
});

export const comfyFrameInputSchema = z.object({
  assetId: safeId,
  revision,
  fingerprint: sha256,
  role: z.enum(["start_frame", "last_frame", "reference"]),
  order: z.number().int().min(0).max(31),
}).strict();

export const comfyOutputPolicySchema = z.object({
  saveLocally: z.literal(true),
  uploadLibrary: z.boolean(),
  libraryTargetId: safeId.nullable(),
  maxOutputs: z.number().int().min(1).max(64),
}).strict().superRefine((value, ctx) => {
  if (value.uploadLibrary && !value.libraryTargetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["libraryTargetId"], message: "Library target is required when publication is enabled" });
  }
  if (!value.uploadLibrary && value.libraryTargetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["libraryTargetId"], message: "local-only output cannot carry a Library target" });
  }
});

export const comfyRenderJobEnvelopeSchema = z.object({
  jobId: safeId,
  tenantId: safeId,
  ownerUserId: z.number().int().positive(),
  jobType: comfyJobTypeSchema,
  requestedAt: z.string().datetime({ offset: true }),
  deadlineAt: z.string().datetime({ offset: true }),
  idempotencyKey: safeId,
  connectionResolution: comfyConnectionResolutionSchema,
  workflowResolution: comfyWorkflowResolutionSchema,
  inputResolution: comfyInputResolutionSchema,
  frames: z.array(comfyFrameInputSchema).max(34),
  durationMs: z.number().int().min(1_000).max(90_000).nullable(),
  outputPolicy: comfyOutputPolicySchema,
  remoteConsent: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const orders = new Set<number>();
  for (const frame of value.frames) {
    if (orders.has(frame.order)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: "frame order must be unique" });
    orders.add(frame.order);
  }
  if (value.jobType === "shot_video_generation" && value.durationMs === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["durationMs"], message: "shot video jobs require duration" });
  }
});
export type ComfyRenderJobEnvelope = z.infer<typeof comfyRenderJobEnvelopeSchema>;

/**
 * Queue-time envelope for the desktop MCP lane. The surrounding worker job
 * metadata (tenant, billing, lease) stays server-owned; this schema validates
 * only the user/workflow portion before it is persisted in inputJson.
 */
export const comfyMcpDispatchInputSchema = z.object({
  adapter: z.literal("comfy_mcp"),
  workflowId: safeId.optional(),
  workflowResolution: comfyWorkflowResolutionSchema.optional(),
  connectionResolution: comfyConnectionResolutionSchema.optional(),
  inputResolution: comfyInputResolutionSchema.optional(),
  frames: z.array(comfyFrameInputSchema).max(34).optional(),
  mcpArguments: z.record(z.string(), z.unknown()).optional(),
  outputPolicy: z.object({
    saveLocally: z.literal(true).optional(),
    uploadLibrary: z.boolean().optional(),
    libraryTargetId: safeId.nullable().optional(),
    maxOutputs: z.number().int().min(1).max(64).optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.uploadLibrary === true && !value.libraryTargetId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["libraryTargetId"], message: "Library target is required when publication is enabled" });
    }
    if (value.uploadLibrary === false && value.libraryTargetId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["libraryTargetId"], message: "local-only output cannot carry a Library target" });
    }
  }).optional(),
}).passthrough().superRefine((value, ctx) => {
  const workflowId = value.workflowId ?? value.workflowResolution?.workflowId;
  if (!workflowId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["workflowId"], message: "MCP jobs require a resolved workflowId" });
  }
  const inspect = (candidate: unknown, path: string[] = []) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => inspect(item, [...path, String(index)]));
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (/(?:password|secret|private.?key|access.?token|refresh.?token|bearer)/i.test(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mcpArguments", ...path, key], message: "MCP job input must not contain credentials" });
      }
      inspect(nested, [...path, key]);
    }
  };
  const forbiddenTransportKeys = /^(?:endpoint|endpointUrl|baseUrl|command|args|headers?|toolName|toolNames|outputDir|outputPath|localPath|absolutePath|providerUrl)$/i;
  const forbiddenServerOwnedKeys = /^(?:jobId|tenantId|ownerId|ownerUserId|projectId|requestedAt|deadlineAt|workerId|workerResolution|billing|billingMetadata|costEstimate|inputResolutionEvidence|consent|serverPolicy|lease|assignment|attempt)$/i;
  const inspectEnvelope = (candidate: unknown, path: string[] = []) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => inspectEnvelope(item, [...path, String(index)]));
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (forbiddenTransportKeys.test(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "MCP job transport and output destinations are server/Worker-owned" });
      }
      if (forbiddenServerOwnedKeys.test(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "MCP job server-owned fields cannot be supplied by the browser" });
      }
      inspectEnvelope(nested, [...path, key]);
    }
  };
  inspect(value.mcpArguments);
  inspectEnvelope(value);
});
export type ComfyMcpDispatchInput = z.infer<typeof comfyMcpDispatchInputSchema>;

export const comfyJobSummarySchema = z.object({
  jobId: safeId,
  // The projection is shared by Comfy, Remotion, Hermes, media, and future
  // Worker lanes. Comfy job envelopes remain restricted by comfyJobTypeSchema;
  // this monitor shape must not drop non-Comfy jobs from Overview.
  jobType: z.string().trim().min(1).max(100),
  jobTypeLabelKey: z.string().trim().min(1).max(160).optional(),
  status: z.string().trim().min(1).max(64),
  phase: z.string().trim().min(1).max(80),
  progressPercent: z.number().int().min(0).max(100),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  queuedAt: z.string().datetime({ offset: true }).nullable().optional(),
  claimedAt: z.string().datetime({ offset: true }).nullable().optional(),
  terminalAt: z.string().datetime({ offset: true }).nullable().optional(),
  workerId: safeId.nullable(),
  workerDisplayName: z.string().trim().max(160).nullable(),
  workerMachineName: z.string().trim().max(255).nullable().optional(),
  capacitySlot: z.string().trim().max(120).nullable().optional(),
  resourceProfile: z.string().trim().max(80).nullable().optional(),
  seriesId: safeId.nullable(),
  seriesTitle: z.string().trim().max(240).nullable(),
  episodeId: safeId.nullable(),
  shotId: safeId.nullable(),
  workflowId: safeId.nullable(),
  workflowVersion: safeId.nullable(),
  connectionProfileId: safeId.nullable().optional(),
  remoteExecutionId: safeId.nullable().optional(),
  queuePosition: z.number().int().nonnegative().nullable(),
  waitReason: z.string().trim().max(240).nullable(),
  statusReason: z.string().trim().max(240).nullable().optional(),
  failureReason: z.string().trim().max(500).nullable().optional(),
  latestEventType: z.string().trim().max(120).nullable().optional(),
  latestEventMessage: z.string().trim().max(500).nullable().optional(),
  retryable: z.boolean().optional(),
  cacheHit: z.boolean().nullable().optional(),
  nextAction: z.string().trim().max(240).nullable().optional(),
  recoveryState: z.string().trim().max(80).nullable().optional(),
  canCancel: z.boolean().optional(),
  cancellationState: z.string().trim().max(80).nullable().optional(),
  outputCount: z.number().int().nonnegative().optional(),
  eventSequence: z.number().int().nonnegative(),
  projectionRevision: revision,
  lastEventSequence: z.number().int().nonnegative().optional(),
  observedAt: z.string().datetime({ offset: true }).optional(),
  staleAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export type ComfyJobSummary = z.infer<typeof comfyJobSummarySchema>;

export const comfyJobSummaryResponseSchema = z.object({
  projectionRevision: revision,
  serverNow: z.string().datetime({ offset: true }),
  staleAfterSeconds: z.number().int().positive().max(300),
  active: z.array(comfyJobSummarySchema).max(100),
  waiting: z.array(comfyJobSummarySchema).max(100),
  recent: z.array(comfyJobSummarySchema).max(100),
  counts: z.object({ active: z.number().int().nonnegative(), waiting: z.number().int().nonnegative(), recent: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
  nextCursor: safeId.optional(),
  items: z.array(comfyJobSummarySchema).max(100),
  serverTime: z.string().datetime({ offset: true }).optional(),
}).passthrough();
export type ComfyJobSummaryResponse = z.infer<typeof comfyJobSummaryResponseSchema>;
