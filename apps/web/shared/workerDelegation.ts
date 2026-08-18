import { z } from "zod";

import { agentRegistryVersionStatusSchema } from "./agentRegistryContracts";
import { workerCallbackMetadataSchema } from "./workerOpenClawPayloads";
import { workerRuntimeTypeSchema } from "./workerRuntime";

export const DELEGATED_WORKER_AUDIENCE = "smartspec-worker-gateway";
export const DELEGATED_WORKER_TOKEN_USE = "worker_gateway_delegate";
export const DELEGATED_SESSION_DEFAULT_TTL_SECONDS = 10 * 60;
export const DELEGATED_SESSION_MAX_TTL_SECONDS = 30 * 60;

export const delegatedWorkerScopeValues = [
  "llm:chat",
  "skills:list",
  "skills:execute",
  "agencies:list",
  "agencies:invoke",
  "media:generate",
  "media:read",
  "media:download",
  "presentations:create",
  "video_projects:create",
  "jobs:create",
  "jobs:read",
  "library:read",
  "library:search",
  "library:upload",
  "library:download",
  "rag:search",
  "rag:ingest",
  "mcp:read",
  "mcp:write",
] as const;

export const delegatedScopeProfileValues = [
  "worker_gateway_readonly",
  "worker_gateway_content_creator",
  "worker_gateway_researcher",
  "worker_gateway_media_operator",
  "worker_gateway_hybrid_executor",
] as const;

export const delegatedTaskModeValues = [
  "coordination",
  "research_summary",
  "channel_response",
  "team_update_drafting",
  "monitoring_triage",
  "generic_fallback",
] as const;

export const delegatedGrantTypeValues = [
  "skill",
  "agency",
  "library_item",
  "library_context_pack",
  "library_search_scope",
  "library_upload_policy",
  "rag_scope",
  "presentation",
  "video_project",
  "job_type",
  "mcp_server",
  "room_target",
  "workflow_target",
  "workspace_scope",
] as const;

export const delegatedRouteFamilyValues = [
  "llm",
  "skills",
  "agencies",
  "media",
  "presentations",
  "video_projects",
  "jobs",
  "library",
  "rag",
  "mcp",
  "callbacks",
] as const;

export const delegatedWorkerCallbackChannelValues = [
  "room_update",
  "workflow_update",
  "user_notification",
] as const;

export type DelegatedWorkerScope = (typeof delegatedWorkerScopeValues)[number];
export type DelegatedScopeProfile = (typeof delegatedScopeProfileValues)[number];
export type DelegatedTaskMode = (typeof delegatedTaskModeValues)[number];
export type DelegatedGrantType = (typeof delegatedGrantTypeValues)[number];
export type DelegatedRouteFamily = (typeof delegatedRouteFamilyValues)[number];
export type DelegatedWorkerCallbackChannel = (typeof delegatedWorkerCallbackChannelValues)[number];

export const delegatedWorkerScopeSchema = z.enum(delegatedWorkerScopeValues);
export const delegatedScopeProfileSchema = z.enum(delegatedScopeProfileValues);
export const delegatedTaskModeSchema = z.enum(delegatedTaskModeValues);
export const delegatedGrantTypeSchema = z.enum(delegatedGrantTypeValues);
export const delegatedRouteFamilySchema = z.enum(delegatedRouteFamilyValues);
export const delegatedWorkerCallbackChannelSchema = z.enum(delegatedWorkerCallbackChannelValues);

export const delegatedKnowledgeGrantRequestSchema = z.object({
  librarySearch: z.boolean().default(false),
  libraryUpload: z.boolean().default(false),
  ragSearch: z.boolean().default(false),
  ragIngest: z.boolean().default(false),
});

export const delegatedGrantRequestSchema = z.object({
  skills: z.array(z.string().min(1)).max(25).default([]),
  agencies: z.array(z.string().min(1)).max(25).default([]),
  libraryItemIds: z.array(z.number().int().positive()).max(50).default([]),
  libraryContextPackIds: z.array(z.number().int().positive()).max(50).default([]),
  mcpNamespaces: z.array(z.string().min(1)).max(25).default([]),
  knowledge: delegatedKnowledgeGrantRequestSchema.default({}),
});

export const delegatedManifestAvailabilitySchema = z.enum([
  "ready",
  "experimental",
  "unavailable",
]);

export const delegatedDiscoveryRouteHintSchema = z.object({
  family: delegatedRouteFamilySchema,
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1),
  availability: delegatedManifestAvailabilitySchema.default("ready"),
  purpose: z.string().min(1).max(160),
});

export const delegatedMcpToolSummarySchema = z.object({
  name: z.string().min(1),
  family: z.string().min(1),
  namespace: z.string().min(1),
  toolGroup: z.string().min(1),
  availability: delegatedManifestAvailabilitySchema.default("ready"),
  reason: z.string().min(1).nullable().default(null),
});

export const delegatedMcpFamilySummarySchema = z.object({
  family: z.string().min(1),
  enabled: z.boolean().default(false),
  availableToolCount: z.number().int().nonnegative().default(0),
  reason: z.string().min(1).nullable().default(null),
});

export const delegatedCapabilityManifestSchema = z.object({
  sessionId: z.string().min(1),
  workerId: z.string().min(1),
  workerJobId: z.string().min(1),
  tenantId: z.string().min(1),
  actingUserId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  runtimeType: workerRuntimeTypeSchema,
  scopeProfile: delegatedScopeProfileSchema,
  activeMode: z.object({
    taskMode: delegatedTaskModeSchema,
    scopeProfile: delegatedScopeProfileSchema.nullable().default(null),
    displayLabel: z.string().min(1),
  }).optional(),
  grantedScopes: z.array(delegatedWorkerScopeSchema),
  routeFamilies: z.array(delegatedRouteFamilySchema),
  allowedMcpNamespaces: z.array(z.string().min(1)).default([]),
  allowedModelAliases: z.array(z.string().min(1)).default([]),
  allowedProviderProfiles: z.array(z.string().min(1)).default([]),
  agentRegistry: z.object({
    registryId: z.string().min(1),
    registryKey: z.string().min(1),
    versionId: z.string().min(1).nullable(),
    versionStatus: agentRegistryVersionStatusSchema.nullable(),
    stableVersionId: z.string().min(1).nullable(),
    resolutionReason: z.string().min(1).nullable(),
  }).nullable().default(null),
  knowledgeAccess: z.object({
    libraryRead: z.boolean().default(false),
    librarySearch: z.boolean().default(false),
    libraryUpload: z.boolean().default(false),
    ragSearch: z.boolean().default(false),
    ragIngest: z.boolean().default(false),
  }),
  grantSummary: z.object({
    skills: z.array(z.string().min(1)).default([]),
    agencies: z.array(z.string().min(1)).default([]),
    libraryItemIds: z.array(z.number().int().positive()).default([]),
    libraryContextPackIds: z.array(z.number().int().positive()).default([]),
    mcpNamespaces: z.array(z.string().min(1)).default([]),
  }),
  uploadPolicy: z.object({
    enabled: z.boolean().default(false),
    allowedItemTypes: z.array(z.string().min(1)).default([]),
    maxFileBytes: z.number().int().positive().nullable().default(null),
  }),
  callbackTargets: z.object({
    roomUpdate: z.boolean().default(false),
    workflowUpdate: z.boolean().default(false),
    userNotification: z.boolean().default(false),
  }),
  availability: z.object({
    http: delegatedManifestAvailabilitySchema.default("ready"),
    mcp: delegatedManifestAvailabilitySchema.default("unavailable"),
    knowledge: delegatedManifestAvailabilitySchema.default("experimental"),
  }),
  mcp: z.object({
    enabled: z.boolean().default(false),
    availableFamilies: z.array(z.string().min(1)).default([]),
    families: z.array(delegatedMcpFamilySummarySchema).default([]),
    availableTools: z.array(delegatedMcpToolSummarySchema).default([]),
    experimentalTools: z.array(delegatedMcpToolSummarySchema).default([]),
    disabledTools: z.array(delegatedMcpToolSummarySchema).default([]),
    familyFlags: z.object({
      browserEnabled: z.boolean().default(false),
      workspaceEnabled: z.boolean().default(false),
      driveEnabled: z.boolean().default(false),
      orchestratorEnabled: z.boolean().default(false),
    }),
    operatorPolicy: z.object({
      enabled: z.boolean().default(true),
      disabledFamilies: z.array(z.string().min(1)).default([]),
      disabledToolGroups: z.array(z.string().min(1)).default([]),
      approvalRequiredToolGroups: z.array(z.string().min(1)).default([]),
    }),
  }),
  discovery: z.object({
    openApiUrl: z.string().min(1),
    docsUrl: z.string().min(1),
    catalogUrl: z.string().min(1),
    manifestPath: z.string().min(1),
    recommendedAuthMode: z.literal("bearer").default("bearer"),
    routeHints: z.array(delegatedDiscoveryRouteHintSchema).default([]),
  }),
  expiresAt: z.string().datetime(),
});

export const delegatedSessionRequestSchema = z.object({
  leaseOwnerToken: z.string().min(1),
  scopeProfile: delegatedScopeProfileSchema.default("worker_gateway_hybrid_executor"),
  requestedTtlSeconds: z.number().int().positive().max(DELEGATED_SESSION_MAX_TTL_SECONDS).optional(),
  grants: delegatedGrantRequestSchema.default({}),
});

export const delegatedSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  audience: z.literal(DELEGATED_WORKER_AUDIENCE),
  tokenUse: z.literal(DELEGATED_WORKER_TOKEN_USE),
  scopeProfile: delegatedScopeProfileSchema,
  activeMode: delegatedCapabilityManifestSchema.shape.activeMode.optional().nullable().default(null),
  grantedScopes: z.array(delegatedWorkerScopeSchema),
  expiresAt: z.string().datetime(),
  manifest: delegatedCapabilityManifestSchema,
});

export const delegatedWorkerCallbackLinkSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  url: z.string().min(1).max(2000),
  kind: z.enum(["artifact", "dashboard", "result", "library", "external"]).optional(),
});

export const delegatedWorkerCallbackPayloadSchema = z.object({
  summary: z.string().min(1).max(4000),
  links: z.array(delegatedWorkerCallbackLinkSchema).max(10).default([]),
  publishArtifacts: z.boolean().default(false),
  metadataJson: workerCallbackMetadataSchema.default({}),
});

export type DelegatedCapabilityManifest = z.infer<typeof delegatedCapabilityManifestSchema>;
export type DelegatedGrantRequest = z.infer<typeof delegatedGrantRequestSchema>;
export type DelegatedSessionRequest = z.infer<typeof delegatedSessionRequestSchema>;
export type DelegatedSessionResponse = z.infer<typeof delegatedSessionResponseSchema>;
export type DelegatedWorkerCallbackPayload = z.infer<typeof delegatedWorkerCallbackPayloadSchema>;
