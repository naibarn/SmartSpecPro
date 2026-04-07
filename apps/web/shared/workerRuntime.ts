import { z } from "zod";

export const WORKER_RUNTIME_PROTOCOL_VERSION = "2026-04-06";

export const workerRuntimeTypeValues = [
  "openclaw_gateway",
  "desktop_zeroclaw_managed",
  "nemoclaw_sandbox",
  "hiclaw_cluster",
] as const;

export const workerStatusValues = [
  "online",
  "offline",
  "unhealthy",
  "disabled",
  "draining",
] as const;

export const workerJobStatusValues = [
  "queued",
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
  "completed",
  "failed",
  "canceled",
  "expired",
] as const;

export const workerModeValues = [
  "per_user",
  "shared_department",
  "dedicated_gpu",
  "external_runtime",
] as const;

export const workerRuntimeModeValues = [
  "native_constrained",
  "wsl2_managed",
  "docker_isolated",
  "external_managed",
] as const;

export const workerFileScopeModeValues = [
  "workspace_scoped",
  "team_drive",
  "full_machine",
] as const;

export const workerResourceProfileValues = [
  "cpu_light",
  "cpu_heavy",
  "gpu_required",
  "large_disk_temp",
  "network_heavy",
  "long_running",
  "sandbox_required",
  "human_observable",
] as const;

export const workerScopeValues = [
  "workers:register",
  "workers:heartbeat",
  "workers:claim",
  "workers:report",
  "workers:diagnostics",
] as const;

export type WorkerRuntimeType = (typeof workerRuntimeTypeValues)[number];
export type WorkerStatus = (typeof workerStatusValues)[number];
export type WorkerJobStatus = (typeof workerJobStatusValues)[number];
export type WorkerMode = (typeof workerModeValues)[number];
export type WorkerRuntimeMode = (typeof workerRuntimeModeValues)[number];
export type WorkerFileScopeMode = (typeof workerFileScopeModeValues)[number];
export type WorkerResourceProfile = (typeof workerResourceProfileValues)[number];
export type WorkerScope = (typeof workerScopeValues)[number];

export const workerRuntimeTypeSchema = z.enum(workerRuntimeTypeValues);
export const workerStatusSchema = z.enum(workerStatusValues);
export const workerJobStatusSchema = z.enum(workerJobStatusValues);
export const workerModeSchema = z.enum(workerModeValues);
export const workerRuntimeModeSchema = z.enum(workerRuntimeModeValues);
export const workerFileScopeModeSchema = z.enum(workerFileScopeModeValues);
export const workerResourceProfileSchema = z.enum(workerResourceProfileValues);
export const workerScopeSchema = z.enum(workerScopeValues);

export const workerProtocolCompatibilitySchema = z.object({
  protocolVersion: z.string().min(1).default(WORKER_RUNTIME_PROTOCOL_VERSION),
  runtimeVersion: z.string().min(1),
  minServerProtocolVersion: z.string().min(1).nullable().optional().default(null),
  maxServerProtocolVersion: z.string().min(1).nullable().optional().default(null),
});

export const workerRegistrationPayloadSchema = z.object({
  compatibility: workerProtocolCompatibilitySchema,
  runtimeType: workerRuntimeTypeSchema,
  workerMode: workerModeSchema.default("external_runtime"),
  displayName: z.string().min(1),
  externalReference: z.string().min(1),
  runtimeMode: workerRuntimeModeSchema.default("external_managed"),
  teamId: z.string().min(1).nullable().optional().default(null),
  machineId: z.string().min(1).nullable().optional().default(null),
  machineName: z.string().min(1).nullable().optional().default(null),
  dashboardUrl: z.string().url().nullable().optional().default(null),
  capabilitiesJson: z.record(z.string(), z.unknown()).default({}),
  hardwareJson: z.record(z.string(), z.unknown()).default({}),
  healthSummaryJson: z.record(z.string(), z.unknown()).default({}),
  warningFlagsJson: z.array(z.string()).default([]),
  fileScopeMode: workerFileScopeModeSchema.default("workspace_scoped"),
  runtimeProfileName: z.string().min(1).nullable().optional().default(null),
  policyProfileName: z.string().min(1).nullable().optional().default(null),
});

export const workerHeartbeatPayloadSchema = z.object({
  compatibility: workerProtocolCompatibilitySchema,
  runtimeType: workerRuntimeTypeSchema,
  status: workerStatusSchema,
  currentJobCount: z.number().int().min(0).default(0),
  queueDepth: z.number().int().min(0).default(0),
  freeDiskBytes: z.number().int().min(0).nullable().optional().default(null),
  metricsJson: z.record(z.string(), z.unknown()).default({}),
  warningsJson: z.array(z.string()).default([]),
});

export const workerClaimRequestSchema = z.object({
  maxJobs: z.number().int().positive().max(10).default(1),
  capabilityHints: z.array(z.string()).default([]),
});

export const workerJobEventPayloadSchema = z.object({
  eventType: z.string().min(1),
  payloadJson: z.record(z.string(), z.unknown()).default({}),
  sequenceNumber: z.number().int().positive().nullable().optional().default(null),
  leaseOwnerToken: z.string().min(1),
});

export const workerArtifactInitPayloadSchema = z.object({
  artifactType: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().min(1).nullable().optional().default(null),
  leaseOwnerToken: z.string().min(1),
});

export const workerArtifactCompletePayloadSchema = z.object({
  artifactType: z.string().min(1),
  storageRef: z.string().min(1),
  checksumSha256: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentType: z.string().min(1).nullable().optional().default(null),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  leaseOwnerToken: z.string().min(1),
});

export const workerDiagnosticsPayloadSchema = z.object({
  summaryJson: z.record(z.string(), z.unknown()).default({}),
  detailsJson: z.record(z.string(), z.unknown()).default({}),
  warningFlagsJson: z.array(z.string()).default([]),
});

export const workerGatewayEndpointSchema = z.object({
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1),
  purpose: z.string().min(1),
});

export const workerGatewayCompatibilityMetadataSchema = z.object({
  contractVersion: z.string().min(1).default(WORKER_RUNTIME_PROTOCOL_VERSION),
  preferredTransport: z.literal("http").default("http"),
  authMode: z.enum(["bearer", "api_key", "internal_token"]).default("bearer"),
  embeddingsSupport: z.enum(["supported", "unsupported", "deferred"]).default("unsupported"),
  httpEndpoints: z.array(workerGatewayEndpointSchema).min(1),
});

export const DEFAULT_CLAW_GATEWAY_COMPATIBILITY = workerGatewayCompatibilityMetadataSchema.parse({
  authMode: "bearer",
  embeddingsSupport: "unsupported",
  httpEndpoints: [
    { method: "GET", path: "/v1/openapi.json", purpose: "HTTP capability discovery" },
    { method: "POST", path: "/v1/chat/completions", purpose: "OpenAI-compatible chat" },
    { method: "POST", path: "/v1/responses", purpose: "Responses API proxy" },
    { method: "GET", path: "/v1/models", purpose: "Model discovery" },
    { method: "GET", path: "/v1/credits", purpose: "Credit visibility" },
    { method: "POST", path: "/v1/knowledge/library/search", purpose: "Owner library search" },
    { method: "POST", path: "/v1/knowledge/library/upload", purpose: "Owner library upload" },
    { method: "POST", path: "/v1/knowledge/rag/search", purpose: "Owner RAG search" },
  ],
});

export type WorkerProtocolCompatibility = z.infer<typeof workerProtocolCompatibilitySchema>;
export type WorkerRegistrationPayload = z.infer<typeof workerRegistrationPayloadSchema>;
export type WorkerHeartbeatPayload = z.infer<typeof workerHeartbeatPayloadSchema>;
export type WorkerClaimRequest = z.infer<typeof workerClaimRequestSchema>;
export type WorkerJobEventPayload = z.infer<typeof workerJobEventPayloadSchema>;
export type WorkerArtifactInitPayload = z.infer<typeof workerArtifactInitPayloadSchema>;
export type WorkerArtifactCompletePayload = z.infer<typeof workerArtifactCompletePayloadSchema>;
export type WorkerDiagnosticsPayload = z.infer<typeof workerDiagnosticsPayloadSchema>;
export type WorkerGatewayCompatibilityMetadata = z.infer<typeof workerGatewayCompatibilityMetadataSchema>;
