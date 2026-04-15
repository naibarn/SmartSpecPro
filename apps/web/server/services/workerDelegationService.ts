import crypto from "crypto";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  workerDelegatedSessions,
  workerJobGrants,
  workerJobs,
  workers,
} from "../../drizzle/schema";
import { signBearerToken, verifyBearerToken } from "../_core/tokens";
import type { WorkerAccessAuthContext } from "./workerAuthService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import type { TenantFeatureFlags } from "../../shared/featureFlags";
import {
  DELEGATED_SESSION_DEFAULT_TTL_SECONDS,
  DELEGATED_SESSION_MAX_TTL_SECONDS,
  DELEGATED_WORKER_AUDIENCE,
  DELEGATED_WORKER_TOKEN_USE,
  delegatedSessionRequestSchema,
  type DelegatedCapabilityManifest,
  type DelegatedGrantRequest,
  type DelegatedGrantType,
  type DelegatedRouteFamily,
  type DelegatedScopeProfile,
  type DelegatedSessionRequest,
  type DelegatedSessionResponse,
  type DelegatedWorkerScope,
} from "../../shared/workerDelegation";
import {
  getWorkerRuntimeDefinition,
  isWorkerLoopbackUrl,
  isWorkerHttpsUrl,
  summarizeHermesTaskMode,
  type WorkerRuntimeType,
} from "../../shared/workerRuntime";
import {
  getWorkerAccessPermissionScopesForPreset,
  normalizeWorkerAccessPermissionScopes,
  type WorkerAccessPermissionPreset,
  type WorkerAccessPermissionScope,
} from "../../shared/workerAccessKeys";

const ACTIVE_JOB_STATUSES = new Set([
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
]);

const KNOWLEDGE_UPLOAD_ITEM_TYPES = ["document", "image", "audio", "video"] as const;
const MAX_LIBRARY_UPLOAD_BYTES = 50 * 1024 * 1024;

type WorkerRecord = Record<string, any>;
type WorkerJobRecord = Record<string, any>;
type SessionRecord = Record<string, any>;
type GrantRecord = Record<string, any>;
type RuntimeDelegationCapabilities = {
  supportsDelegatedHttp: boolean;
  supportsDelegatedMcp: boolean;
  supportsCallbacks: boolean;
  apiServerEnabled: boolean;
  apiServerBaseUrl: string | null;
  remoteEndpointPolicyExceptionId: string | null;
};

type ProfileDefinition = {
  scopes: DelegatedWorkerScope[];
  routeFamilies: DelegatedRouteFamily[];
  allowedModelAliases: string[];
  allowedProviderProfiles: string[];
  knowledgeDefaults: {
    libraryRead: boolean;
    librarySearch: boolean;
    libraryUpload: boolean;
    ragSearch: boolean;
    ragIngest: boolean;
  };
};

type WorkerAccessPolicyRecord = {
  permissionPreset: string | null;
  permissionScopes: string[];
  quotaHourly: number | null;
  quotaDaily: number | null;
  quotaWeekly: number | null;
  quotaMonthly: number | null;
};

const DEFAULT_LLM_MODEL_ALLOWLIST = [
  "gpt-4.1-mini",
  "gpt-5.4-mini",
  "gpt-5.4",
] as const;

const PROFILE_DEFINITIONS: Record<DelegatedScopeProfile, ProfileDefinition> = {
  worker_gateway_readonly: {
    scopes: ["llm:chat", "skills:list", "agencies:list", "jobs:read", "library:read", "library:search", "mcp:read"],
    routeFamilies: ["llm", "skills", "agencies", "jobs", "library", "mcp"],
    allowedModelAliases: [...DEFAULT_LLM_MODEL_ALLOWLIST],
    allowedProviderProfiles: [],
    knowledgeDefaults: {
      libraryRead: true,
      librarySearch: true,
      libraryUpload: false,
      ragSearch: false,
      ragIngest: false,
    },
  },
  worker_gateway_content_creator: {
    scopes: [
      "llm:chat",
      "skills:list",
      "skills:execute",
      "agencies:list",
      "agencies:invoke",
      "media:generate",
      "presentations:create",
      "video_projects:create",
      "jobs:create",
      "jobs:read",
      "library:read",
      "library:search",
      "library:upload",
      "mcp:read",
      "mcp:write",
    ],
    routeFamilies: ["llm", "skills", "agencies", "media", "presentations", "video_projects", "jobs", "library", "mcp"],
    allowedModelAliases: [...DEFAULT_LLM_MODEL_ALLOWLIST],
    allowedProviderProfiles: [],
    knowledgeDefaults: {
      libraryRead: true,
      librarySearch: true,
      libraryUpload: true,
      ragSearch: false,
      ragIngest: false,
    },
  },
  worker_gateway_researcher: {
    scopes: [
      "llm:chat",
      "skills:list",
      "skills:execute",
      "agencies:list",
      "agencies:invoke",
      "jobs:create",
      "jobs:read",
      "library:read",
      "library:search",
      "rag:search",
      "mcp:read",
      "mcp:write",
    ],
    routeFamilies: ["llm", "skills", "agencies", "jobs", "library", "rag", "mcp"],
    allowedModelAliases: [...DEFAULT_LLM_MODEL_ALLOWLIST],
    allowedProviderProfiles: [],
    knowledgeDefaults: {
      libraryRead: true,
      librarySearch: true,
      libraryUpload: false,
      ragSearch: true,
      ragIngest: false,
    },
  },
  worker_gateway_media_operator: {
    scopes: [
      "llm:chat",
      "media:generate",
      "presentations:create",
      "video_projects:create",
      "jobs:create",
      "jobs:read",
      "library:upload",
      "mcp:read",
      "mcp:write",
    ],
    routeFamilies: ["llm", "media", "presentations", "video_projects", "jobs", "library", "mcp"],
    allowedModelAliases: [...DEFAULT_LLM_MODEL_ALLOWLIST],
    allowedProviderProfiles: [],
    knowledgeDefaults: {
      libraryRead: false,
      librarySearch: false,
      libraryUpload: true,
      ragSearch: false,
      ragIngest: false,
    },
  },
  worker_gateway_hybrid_executor: {
    scopes: [
      "llm:chat",
      "skills:list",
      "skills:execute",
      "agencies:list",
      "agencies:invoke",
      "media:generate",
      "presentations:create",
      "video_projects:create",
      "jobs:create",
      "jobs:read",
      "library:read",
      "library:search",
      "library:upload",
      "rag:search",
      "rag:ingest",
      "mcp:read",
      "mcp:write",
    ],
    routeFamilies: ["llm", "skills", "agencies", "media", "presentations", "video_projects", "jobs", "library", "rag", "mcp", "callbacks"],
    allowedModelAliases: [...DEFAULT_LLM_MODEL_ALLOWLIST],
    allowedProviderProfiles: [],
    knowledgeDefaults: {
      libraryRead: true,
      librarySearch: true,
      libraryUpload: true,
      ragSearch: true,
      ragIngest: true,
    },
  },
};

export type DelegatedWorkerAuthContext = {
  audience: string;
  tenantId: string;
  teamId: string | null;
  userId: number;
  ownerUserId: number;
  workerId: string;
  workerJobId: string;
  delegatedSessionId: string;
  runtimeType: WorkerRuntimeType;
  scopeProfile: DelegatedScopeProfile;
  scopes: DelegatedWorkerScope[];
  subject: string;
  tokenUse: typeof DELEGATED_WORKER_TOKEN_USE;
};

export class WorkerDelegationError extends Error {
  code: string;
  statusCode: number;
  type: string;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    type = "auth_error",
  ) {
    super(message);
    this.name = "WorkerDelegationError";
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

function normalizeScopes(scopes: string[]): DelegatedWorkerScope[] {
  return scopes.filter((scope): scope is DelegatedWorkerScope =>
    (PROFILE_DEFINITIONS.worker_gateway_hybrid_executor.scopes as string[]).includes(scope),
  );
}

function randomJti(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`;
}

function getProfileDefinition(profile: DelegatedScopeProfile): ProfileDefinition {
  return PROFILE_DEFINITIONS[profile];
}

export function getDelegatedScopeProfilePolicy(profile: DelegatedScopeProfile): {
  scopes: DelegatedWorkerScope[];
  routeFamilies: DelegatedRouteFamily[];
  allowedModelAliases: string[];
  allowedProviderProfiles: string[];
} {
  const definition = getProfileDefinition(profile);
  return {
    scopes: [...definition.scopes],
    routeFamilies: [...definition.routeFamilies],
    allowedModelAliases: [...definition.allowedModelAliases],
    allowedProviderProfiles: [...definition.allowedProviderProfiles],
  };
}

function buildGrantRows(
  sessionId: string,
  tenantId: string,
  workerJobId: string,
  job: WorkerJobRecord,
  grants: DelegatedGrantRequest,
  expiresAt: Date,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const jobInput = job.inputJson && typeof job.inputJson === "object"
    ? job.inputJson as Record<string, unknown>
    : {};

  for (const skillId of grants.skills) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "skill",
      resourceId: skillId,
      resourceScopeJson: {},
      expiresAt,
    });
  }

  for (const agencyId of grants.agencies) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "agency",
      resourceId: agencyId,
      resourceScopeJson: {},
      expiresAt,
    });
  }

  for (const libraryItemId of grants.libraryItemIds) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "library_item",
      resourceId: String(libraryItemId),
      resourceScopeJson: {},
      expiresAt,
    });
  }

  for (const namespace of grants.mcpNamespaces) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "mcp_server",
      resourceId: namespace,
      resourceScopeJson: {},
      expiresAt,
    });
  }

  if (grants.knowledge.librarySearch) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "library_search_scope",
      resourceId: null,
      resourceScopeJson: { scope: "owner_library" },
      expiresAt,
    });
  }

  if (grants.knowledge.libraryUpload) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "library_upload_policy",
      resourceId: null,
      resourceScopeJson: {
        scope: "owner_library",
        allowedItemTypes: [...KNOWLEDGE_UPLOAD_ITEM_TYPES],
      },
      expiresAt,
    });
  }

  if (grants.knowledge.ragSearch || grants.knowledge.ragIngest) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "rag_scope",
      resourceId: null,
      resourceScopeJson: {
        search: grants.knowledge.ragSearch,
        ingest: grants.knowledge.ragIngest,
        scope: "owner_library",
      },
      expiresAt,
    });
  }

  const roomId = typeof jobInput.roomId === "string" && jobInput.roomId.trim()
    ? jobInput.roomId.trim()
    : "";
  if (roomId) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "room_target",
      resourceId: roomId,
      resourceScopeJson: {},
      expiresAt,
    });
  }

  const workflowTargetId = typeof jobInput.runId === "string" && jobInput.runId.trim()
    ? jobInput.runId.trim()
    : typeof job.workflowRunId === "string" && job.workflowRunId.trim()
      ? job.workflowRunId.trim()
      : "";
  if (workflowTargetId) {
    rows.push({
      delegatedSessionId: sessionId,
      tenantId,
      workerJobId,
      grantType: "workflow_target",
      resourceId: workflowTargetId,
      resourceScopeJson: {},
      expiresAt,
    });
  }

  return rows;
}

function readGrantIds(grants: GrantRecord[], grantType: DelegatedGrantType): string[] {
  return grants
    .filter((grant) => grant.grantType === grantType && typeof grant.resourceId === "string" && grant.resourceId.trim())
    .map((grant) => grant.resourceId as string);
}

function hasScopedGrant(grants: GrantRecord[], grantType: DelegatedGrantType, key?: string): boolean {
  return grants.some((grant) => {
    if (grant.grantType !== grantType) {
      return false;
    }
    if (!key) {
      return true;
    }
    const scope = grant.resourceScopeJson;
    return Boolean(scope && typeof scope === "object" && (scope as Record<string, unknown>)[key] === true);
  });
}

function hasGrantResource(grants: GrantRecord[], grantType: DelegatedGrantType): boolean {
  return grants.some((grant) =>
    grant.grantType === grantType
    && typeof grant.resourceId === "string"
    && grant.resourceId.trim().length > 0,
  );
}

function readRuntimeMetadata(worker: WorkerRecord | null | undefined): Record<string, unknown> {
  if (!worker || !worker.capabilitiesJson || typeof worker.capabilitiesJson !== "object") {
    return {};
  }
  const runtimeMetadata = (worker.capabilitiesJson as Record<string, unknown>).runtimeMetadata;
  return runtimeMetadata && typeof runtimeMetadata === "object" && !Array.isArray(runtimeMetadata)
    ? runtimeMetadata as Record<string, unknown>
    : {};
}

function readWorkerAccessPolicy(worker: WorkerRecord | null | undefined): WorkerAccessPolicyRecord | null {
  const metadata = readRuntimeMetadata(worker);
  const rawPolicy = metadata.workerAccessPolicy;
  if (!rawPolicy || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
    return null;
  }
  const policy = rawPolicy as Record<string, unknown>;
  const permissionPreset = typeof policy.permissionPreset === "string" && policy.permissionPreset.trim().length > 0
    ? policy.permissionPreset.trim()
    : null;
  const permissionScopes = normalizeWorkerAccessPermissionScopes(policy.permissionScopes);
  const readQuota = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : null;
  return {
    permissionPreset,
    permissionScopes,
    quotaHourly: readQuota(policy.quotaHourly),
    quotaDaily: readQuota(policy.quotaDaily),
    quotaWeekly: readQuota(policy.quotaWeekly),
    quotaMonthly: readQuota(policy.quotaMonthly),
  };
}

function getRequiredDelegatedSessionScopes(
  scopeProfile: DelegatedScopeProfile,
  grants: DelegatedGrantRequest,
  runtimeCapabilities: RuntimeDelegationCapabilities,
  job?: WorkerJobRecord | null,
): WorkerAccessPermissionScope[] {
  const profileDefinition = getProfileDefinition(scopeProfile);
  const required = new Set<WorkerAccessPermissionScope>(profileDefinition.scopes);

  if (grants.skills.length > 0) {
    required.add("skills:execute");
  }
  if (grants.agencies.length > 0) {
    required.add("agents:execute");
  }
  if (grants.libraryItemIds.length > 0) {
    required.add("library:read");
  }
  if (grants.knowledge.librarySearch) {
    required.add("library:read");
  }
  if (grants.knowledge.libraryUpload) {
    required.add("library:write");
  }
  if (grants.knowledge.ragSearch) {
    required.add("rag:read");
  }
  if (grants.knowledge.ragIngest) {
    required.add("rag:write");
  }
  if (grants.mcpNamespaces.length > 0) {
    required.add("delegate:mcp");
  }
  if (runtimeCapabilities.supportsCallbacks && profileDefinition.routeFamilies.includes("callbacks")) {
    required.add("callbacks:publish");
  }
  const jobInput = job && job.inputJson && typeof job.inputJson === "object" && !Array.isArray(job.inputJson)
    ? job.inputJson as Record<string, unknown>
    : {};
  const roomId = typeof jobInput.roomId === "string" && jobInput.roomId.trim()
    ? jobInput.roomId.trim()
    : "";
  const workflowTargetId = typeof jobInput.runId === "string" && jobInput.runId.trim()
    ? jobInput.runId.trim()
    : typeof job?.workflowRunId === "string" && job.workflowRunId.trim()
      ? job.workflowRunId.trim()
      : "";
  if (roomId || workflowTargetId) {
    required.add("callbacks:publish");
  }

  return [...required];
}

function assertWorkerAccessPolicyAllowsDelegatedSession(
  worker: WorkerRecord,
  scopeProfile: DelegatedScopeProfile,
  grants: DelegatedGrantRequest,
  runtimeCapabilities: RuntimeDelegationCapabilities,
  job?: WorkerJobRecord | null,
): void {
  const policy = readWorkerAccessPolicy(worker);
  if (!policy) {
    return;
  }

  const configuredPreset = policy.permissionPreset === "custom"
    ? "custom"
    : policy.permissionPreset && (policy.permissionPreset === "readonly"
      || policy.permissionPreset === "operator_basic"
      || policy.permissionPreset === "content_worker"
      || policy.permissionPreset === "knowledge_worker"
      || policy.permissionPreset === "work_os_worker"
      || policy.permissionPreset === "full_personal_worker")
      ? policy.permissionPreset as WorkerAccessPermissionPreset
      : null;
  const allowedScopes = new Set<WorkerAccessPermissionScope>(
    configuredPreset && configuredPreset !== "custom"
      ? getWorkerAccessPermissionScopesForPreset(configuredPreset)
      : policy.permissionScopes,
  );
  const requiredScopes = getRequiredDelegatedSessionScopes(scopeProfile, grants, runtimeCapabilities, job);
  const missingScopes = requiredScopes.filter((scope) => !allowedScopes.has(scope));
  if (missingScopes.length > 0) {
    throw new WorkerDelegationError(
      "worker_access_policy_denied",
      403,
      `Worker access policy does not allow delegated session scopes: ${missingScopes.join(", ")}`,
    );
  }
}

function readBooleanCapability(metadata: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = metadata[key];
  return typeof value === "boolean" ? value : fallback;
}

function readStringCapability(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRuntimeDelegationCapabilities(worker: WorkerRecord): RuntimeDelegationCapabilities {
  const metadata = readRuntimeMetadata(worker);
  const runtimeType = worker.runtimeType as WorkerRuntimeType;

  if (runtimeType === "hermes_agent_gateway") {
    return {
      supportsDelegatedHttp: readBooleanCapability(metadata, "supportsDelegatedHttp", false),
      supportsDelegatedMcp: readBooleanCapability(metadata, "supportsDelegatedMcp", false),
      supportsCallbacks: readBooleanCapability(metadata, "supportsCallbacks", false),
      apiServerEnabled: readBooleanCapability(metadata, "apiServerEnabled", true),
      apiServerBaseUrl: readStringCapability(metadata, "apiServerBaseUrl"),
      remoteEndpointPolicyExceptionId: readStringCapability(metadata, "remoteEndpointPolicyExceptionId"),
    };
  }

  return {
    supportsDelegatedHttp: true,
    supportsDelegatedMcp: true,
    supportsCallbacks: true,
    apiServerEnabled: false,
    apiServerBaseUrl: null,
    remoteEndpointPolicyExceptionId: null,
  };
}

function assertRuntimeDelegationCapabilities(worker: WorkerRecord): RuntimeDelegationCapabilities {
  const capabilities = getRuntimeDelegationCapabilities(worker);

  if (!capabilities.supportsDelegatedHttp) {
    throw new WorkerDelegationError(
      "runtime_capability_unavailable",
      409,
      "Worker runtime does not advertise delegated HTTP support",
    );
  }

  if (worker.runtimeType === "hermes_agent_gateway") {
    if (!capabilities.apiServerEnabled) {
      throw new WorkerDelegationError(
        "runtime_capability_unavailable",
        409,
        "Hermes bridge API-server transport is disabled for this worker",
      );
    }
    if (!capabilities.apiServerBaseUrl) {
      throw new WorkerDelegationError(
        "runtime_capability_unavailable",
        409,
        "Hermes bridge API-server base URL is required before delegated sessions can be issued",
      );
    }
    if (
      !isWorkerLoopbackUrl(capabilities.apiServerBaseUrl)
      && !capabilities.remoteEndpointPolicyExceptionId
    ) {
      throw new WorkerDelegationError(
        "runtime_capability_unavailable",
        409,
        "Hermes bridge API-server base URL must resolve to loopback unless an audited remote-endpoint policy exception is present",
      );
    }
    if (
      !isWorkerLoopbackUrl(capabilities.apiServerBaseUrl)
      && capabilities.remoteEndpointPolicyExceptionId
      && !isWorkerHttpsUrl(capabilities.apiServerBaseUrl)
    ) {
      throw new WorkerDelegationError(
        "runtime_capability_unavailable",
        409,
        "Hermes bridge API-server base URL must use https when an audited remote-endpoint policy exception is present",
      );
    }
  }

  return capabilities;
}

function buildDiscoveryRouteHints(
  session: {
    workerJobId: string;
    grantedScopes: DelegatedWorkerScope[];
    scopeProfile: DelegatedScopeProfile;
  },
  grants: GrantRecord[],
  runtimeCapabilities: RuntimeDelegationCapabilities,
): Array<{
  family: DelegatedRouteFamily;
  method: "GET" | "POST";
  path: string;
  availability: "ready" | "experimental" | "unavailable";
  purpose: string;
}> {
  const profile = getProfileDefinition(session.scopeProfile);
  const hints: Array<{
    family: DelegatedRouteFamily;
    method: "GET" | "POST";
    path: string;
    availability: "ready" | "experimental" | "unavailable";
    purpose: string;
  }> = [];

  const addHint = (
    family: DelegatedRouteFamily,
    method: "GET" | "POST",
    path: string,
    purpose: string,
    availability: "ready" | "experimental" | "unavailable" = "ready",
  ) => {
    if (!profile.routeFamilies.includes(family)) {
      return;
    }
    hints.push({ family, method, path, purpose, availability });
  };

  if (runtimeCapabilities.supportsDelegatedHttp) {
    addHint("llm", "GET", "/v1/models", "List gateway models allowed for this worker session");
    addHint("llm", "GET", "/v1/credits", "Read the owner's current SmartAIHub credit balance");
  }
  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("llm:chat")) {
    addHint("llm", "POST", "/v1/chat/completions", "Run OpenAI-compatible chat completions");
    addHint("llm", "POST", "/v1/responses", "Run Responses API style multi-turn execution");
  }
  if (runtimeCapabilities.supportsDelegatedMcp && session.grantedScopes.includes("mcp:read")) {
    const allowedNamespaces = readGrantIds(grants, "mcp_server");
    const mcpAvailability = allowedNamespaces.length > 0 ? "ready" : "experimental";
    addHint(
      "mcp",
      "POST",
      "/v1/mcp",
      allowedNamespaces.length > 0
        ? "Use the authenticated MCP endpoint with the worker-scoped tool namespaces granted for this job"
        : "MCP is enabled for this session but no tool namespaces were granted yet",
      mcpAvailability,
    );
    addHint("mcp", "GET", "/v1/mcp/catalog", "Read the static MCP tool catalog for developer guidance", "ready");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("skills:list")) {
    addHint("skills", "GET", "/v1/skills", "List skills visible to the worker owner");
    addHint("skills", "GET", "/v1/skills/{skillId}", "Inspect a specific skill before execution");
  }
  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("skills:execute")) {
    addHint("skills", "POST", "/v1/skills/{skillId}/execute", "Run an allowed skill for this job");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("agencies:list")) {
    addHint("agencies", "GET", "/v1/agencies", "List agencies visible to the worker owner");
  }
  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("agencies:invoke")) {
    addHint("agencies", "POST", "/v1/agencies/{agencyId}/invoke", "Invoke an allowed agency");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("media:generate")) {
    addHint("media", "POST", "/v1/media/images/generate", "Generate images through the platform media stack");
    addHint("media", "POST", "/v1/media/videos/generate", "Generate videos through the platform media stack");
    addHint("media", "POST", "/v1/media/audio/generate", "Generate audio through the platform media stack");
    addHint("media", "GET", "/v1/media/{taskId}/status", "Check asynchronous media generation status");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("presentations:create")) {
    addHint("presentations", "POST", "/v1/presentations", "Create a presentation for the owner");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("video_projects:create")) {
    addHint("video_projects", "POST", "/v1/video-projects", "Create a video project for the owner");
  }

  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("jobs:create")) {
    addHint("jobs", "POST", "/v1/jobs", "Create an asynchronous platform job");
  }
  if (runtimeCapabilities.supportsDelegatedHttp && session.grantedScopes.includes("jobs:read")) {
    addHint("jobs", "GET", "/v1/jobs", "List jobs created by the owner");
    addHint("jobs", "GET", "/v1/jobs/{jobId}", "Inspect a specific asynchronous job");
  }

  if (
    runtimeCapabilities.supportsDelegatedHttp
    && session.grantedScopes.includes("library:search")
    && hasScopedGrant(grants, "library_search_scope")
  ) {
    addHint("library", "POST", "/v1/knowledge/library/search", "Search the owner's private library scope");
  }
  if (
    runtimeCapabilities.supportsDelegatedHttp
    && session.grantedScopes.includes("library:upload")
    && hasScopedGrant(grants, "library_upload_policy")
  ) {
    addHint("library", "POST", "/v1/knowledge/library/upload", "Upload a file into the owner's library");
  }
  if (
    runtimeCapabilities.supportsDelegatedHttp
    && session.grantedScopes.includes("rag:search")
    && hasScopedGrant(grants, "rag_scope", "search")
  ) {
    addHint("rag", "POST", "/v1/knowledge/rag/search", "Run semantic search over the owner's indexed knowledge");
  }
  if (
    runtimeCapabilities.supportsDelegatedHttp
    && session.grantedScopes.includes("rag:ingest")
    && hasScopedGrant(grants, "rag_scope", "ingest")
  ) {
    addHint("rag", "POST", "/v1/knowledge/rag/ingest", "Upload or re-index owner files for RAG ingestion");
  }

  if (
    runtimeCapabilities.supportsCallbacks
    && profile.routeFamilies.includes("callbacks")
    && hasGrantResource(grants, "room_target")
  ) {
    addHint("callbacks", "POST", `/api/worker-jobs/${session.workerJobId}/publish-room-update`, "Send a room update back into SmartAIHub");
  }
  if (
    runtimeCapabilities.supportsCallbacks
    && profile.routeFamilies.includes("callbacks")
    && hasGrantResource(grants, "workflow_target")
  ) {
    addHint("callbacks", "POST", `/api/worker-jobs/${session.workerJobId}/publish-workflow-update`, "Send a workflow update back into SmartAIHub");
  }
  if (
    runtimeCapabilities.supportsCallbacks
    && profile.routeFamilies.includes("callbacks")
    && session.grantedScopes.includes("llm:chat")
  ) {
    addHint("callbacks", "POST", `/api/worker-jobs/${session.workerJobId}/publish-user-notification`, "Notify the owner when delegated work completes");
  }

  return hints;
}

async function buildManifest(
  session: {
    id: string;
    tenantId: string;
    teamId: string | null;
    workerId: string;
    workerJobId: string;
    actingUserId: number;
    ownerUserId: number;
    runtimeType: WorkerRuntimeType;
    scopeProfile: DelegatedScopeProfile;
    activeMode: ReturnType<typeof summarizeHermesTaskMode>;
    grantedScopes: DelegatedWorkerScope[];
    expiresAt: Date;
  },
  grants: GrantRecord[],
  runtimeCapabilities: RuntimeDelegationCapabilities,
): Promise<DelegatedCapabilityManifest> {
  const profile = getProfileDefinition(session.scopeProfile);
  const hasLibrarySearch = session.grantedScopes.includes("library:search") && hasScopedGrant(grants, "library_search_scope");
  const hasLibraryUpload = session.grantedScopes.includes("library:upload") && hasScopedGrant(grants, "library_upload_policy");
  const hasRagSearch = session.grantedScopes.includes("rag:search") && hasScopedGrant(grants, "rag_scope", "search");
  const hasRagIngest = session.grantedScopes.includes("rag:ingest") && hasScopedGrant(grants, "rag_scope", "ingest");
  const allowedMcpNamespaces = readGrantIds(grants, "mcp_server");
  const hasMcpReadScope = session.grantedScopes.includes("mcp:read");
  const hasMcpWriteScope = session.grantedScopes.includes("mcp:write");
  const mcpAvailability =
    runtimeCapabilities.supportsDelegatedMcp && hasMcpReadScope && allowedMcpNamespaces.length > 0
      ? "ready"
      : runtimeCapabilities.supportsDelegatedMcp && (hasMcpReadScope || hasMcpWriteScope)
        ? "experimental"
        : "unavailable";

  const manifestPreview: DelegatedCapabilityManifest = {
    sessionId: session.id,
    workerId: session.workerId,
    workerJobId: session.workerJobId,
    tenantId: session.tenantId,
    actingUserId: session.actingUserId,
    ownerUserId: session.ownerUserId,
    runtimeType: session.runtimeType,
    scopeProfile: session.scopeProfile,
    activeMode: session.activeMode,
    grantedScopes: session.grantedScopes,
    routeFamilies: profile.routeFamilies,
    allowedMcpNamespaces,
    allowedModelAliases: profile.allowedModelAliases,
    allowedProviderProfiles: profile.allowedProviderProfiles,
    knowledgeAccess: {
      libraryRead: session.grantedScopes.includes("library:read"),
      librarySearch: hasLibrarySearch,
      libraryUpload: hasLibraryUpload,
      ragSearch: hasRagSearch,
      ragIngest: hasRagIngest,
    },
    grantSummary: {
      skills: readGrantIds(grants, "skill"),
      agencies: readGrantIds(grants, "agency"),
      libraryItemIds: readGrantIds(grants, "library_item").map((value) => Number(value)).filter(Number.isFinite),
      mcpNamespaces: allowedMcpNamespaces,
    },
    uploadPolicy: {
      enabled: hasLibraryUpload,
      allowedItemTypes: hasLibraryUpload ? [...KNOWLEDGE_UPLOAD_ITEM_TYPES] : [],
      maxFileBytes: hasLibraryUpload ? MAX_LIBRARY_UPLOAD_BYTES : null,
    },
    callbackTargets: {
      roomUpdate: runtimeCapabilities.supportsCallbacks && profile.routeFamilies.includes("callbacks") && hasGrantResource(grants, "room_target"),
      workflowUpdate: runtimeCapabilities.supportsCallbacks && profile.routeFamilies.includes("callbacks") && hasGrantResource(grants, "workflow_target"),
      userNotification: runtimeCapabilities.supportsCallbacks && profile.routeFamilies.includes("callbacks") && session.actingUserId > 0,
    },
    availability: {
      http: runtimeCapabilities.supportsDelegatedHttp ? "ready" : "unavailable",
      mcp: mcpAvailability,
      knowledge:
        runtimeCapabilities.supportsDelegatedHttp
        && (hasLibrarySearch || hasLibraryUpload || hasRagSearch || hasRagIngest)
          ? "ready"
          : "unavailable",
    },
    mcp: {
      enabled: false,
      availableFamilies: [],
      families: [],
      availableTools: [],
      experimentalTools: [],
      disabledTools: [],
      familyFlags: {
        browserEnabled: false,
        workspaceEnabled: false,
        driveEnabled: false,
        orchestratorEnabled: false,
      },
      operatorPolicy: {
        enabled: true,
        disabledFamilies: [],
        disabledToolGroups: [],
        approvalRequiredToolGroups: [],
      },
    },
    discovery: {
      openApiUrl: "/v1/openapi.json",
      docsUrl: "/v1/docs",
      catalogUrl: "/v1/mcp/catalog",
      manifestPath: `/api/worker-jobs/${session.workerJobId}/delegated-manifest`,
      recommendedAuthMode: "bearer",
      routeHints: buildDiscoveryRouteHints(session, grants, runtimeCapabilities),
    },
    expiresAt: session.expiresAt.toISOString(),
  };

  const {
    describeDelegatedMcpSurface,
  } = await import("../_core/mcpRegistry");
  const mcpSurface = await describeDelegatedMcpSurface({
    tenantId: session.tenantId,
    teamId: session.teamId,
    actingUserId: session.actingUserId,
    ownerUserId: session.ownerUserId,
    workerId: session.workerId,
    workerJobId: session.workerJobId,
    delegatedSessionId: session.id,
    runtimeType: session.runtimeType,
    scopeProfile: session.scopeProfile,
    grantedScopes: session.grantedScopes,
    manifestPreview,
  });

  return {
    ...manifestPreview,
    availability: {
      ...manifestPreview.availability,
      mcp: mcpSurface.operatorPolicy.enabled
        ? manifestPreview.availability.mcp
        : "unavailable",
    },
    mcp: {
      enabled:
        mcpSurface.operatorPolicy.enabled
        && manifestPreview.availability.mcp === "ready"
        && mcpSurface.availableTools.length > 0,
      availableFamilies: mcpSurface.availableFamilies,
      families: mcpSurface.families,
      availableTools: mcpSurface.availableTools,
      experimentalTools: mcpSurface.experimentalTools,
      disabledTools: mcpSurface.disabledTools,
      familyFlags: mcpSurface.familyFlags,
      operatorPolicy: mcpSurface.operatorPolicy,
    },
  };
}

export interface WorkerDelegationRepository {
  getWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  getWorkerJobById: (tenantId: string, jobId: string) => Promise<WorkerJobRecord | null>;
  revokeActiveSessionsForJob: (workerJobId: string, workerId: string) => Promise<void>;
  insertDelegatedSession: (values: Record<string, unknown>) => Promise<SessionRecord>;
  insertWorkerJobGrants: (values: Array<Record<string, unknown>>) => Promise<void>;
  getDelegatedSessionById: (sessionId: string) => Promise<SessionRecord | null>;
  listActiveGrantsForSession: (sessionId: string) => Promise<GrantRecord[]>;
  getLatestActiveSessionForJob: (workerJobId: string, workerId: string) => Promise<SessionRecord | null>;
}

const defaultRepo: WorkerDelegationRepository = {
  async getWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },
  async getWorkerJobById(tenantId, jobId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.id, jobId)))
      .limit(1);
    return job ?? null;
  },
  async revokeActiveSessionsForJob(workerJobId, workerId) {
    const db = await getDb();
    await db
      .update(workerDelegatedSessions)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workerDelegatedSessions.workerJobId, workerJobId),
          eq(workerDelegatedSessions.workerId, workerId),
          isNull(workerDelegatedSessions.revokedAt),
          gt(workerDelegatedSessions.expiresAt, new Date()),
        ),
      );
  },
  async insertDelegatedSession(values) {
    const db = await getDb();
    const [session] = await db.insert(workerDelegatedSessions).values(values as any).returning();
    return session;
  },
  async insertWorkerJobGrants(values) {
    if (!values.length) {
      return;
    }
    const db = await getDb();
    await db.insert(workerJobGrants).values(values as any);
  },
  async getDelegatedSessionById(sessionId) {
    const db = await getDb();
    const [session] = await db
      .select()
      .from(workerDelegatedSessions)
      .where(eq(workerDelegatedSessions.id, sessionId))
      .limit(1);
    return session ?? null;
  },
  async listActiveGrantsForSession(sessionId) {
    const db = await getDb();
    return db
      .select()
      .from(workerJobGrants)
      .where(
        and(
          eq(workerJobGrants.delegatedSessionId, sessionId),
          or(isNull(workerJobGrants.expiresAt), gt(workerJobGrants.expiresAt, new Date())),
        ),
      );
  },
  async getLatestActiveSessionForJob(workerJobId, workerId) {
    const db = await getDb();
    const [session] = await db
      .select()
      .from(workerDelegatedSessions)
      .where(
        and(
          eq(workerDelegatedSessions.workerJobId, workerJobId),
          eq(workerDelegatedSessions.workerId, workerId),
          isNull(workerDelegatedSessions.revokedAt),
          gt(workerDelegatedSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(workerDelegatedSessions.createdAt))
      .limit(1);
    return session ?? null;
  },
};

function assertWorkerFeatureEnabled(flags: { openClawExternalRuntime?: boolean }, tenantId: string): void {
  if (!flags.openClawExternalRuntime) {
    throw new WorkerDelegationError(
      "feature_disabled",
      403,
      `OpenClaw external runtime is disabled for tenant ${tenantId}`,
    );
  }
}

function assertRuntimeFeatureEnabled(
  runtimeType: WorkerRuntimeType,
  flags: Record<string, unknown> | TenantFeatureFlags,
  tenantId: string,
): void {
  const runtimeDefinition = getWorkerRuntimeDefinition(runtimeType);
  const featureFlag = runtimeDefinition.featureFlag;
  const featureValue = (flags as unknown as Record<string, unknown>)[featureFlag];
  if (featureValue !== true) {
    throw new WorkerDelegationError(
      "feature_disabled",
      403,
      `${runtimeDefinition.displayName} is disabled for tenant ${tenantId}`,
      "feature_disabled_error",
    );
  }
}

function isDelegatedWorkerAccessEnabled(): boolean {
  return process.env.OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED !== "false";
}

function assertDelegatedWorkerAccessEnabled(): void {
  if (!isDelegatedWorkerAccessEnabled()) {
    throw new WorkerDelegationError(
      "dispatch_disabled",
      503,
      "Delegated worker platform access is disabled by operator kill switch",
      "feature_disabled_error",
    );
  }
}

function requireOwnerAligned(
  worker: WorkerRecord | null,
  job: WorkerJobRecord | null,
): {
  worker: WorkerRecord & { registeredByUserId: number };
  job: WorkerJobRecord & { requestedByUserId: number };
} {
  if (!worker || !job) {
    throw new WorkerDelegationError("not_found", 404, "Worker or worker job was not found", "not_found_error");
  }
  if (!worker.registeredByUserId || !job.requestedByUserId) {
    throw new WorkerDelegationError(
      "owner_alignment_required",
      409,
      "Personal workers require both owner and acting user binding",
    );
  }
  if (worker.registeredByUserId !== job.requestedByUserId) {
    throw new WorkerDelegationError(
      "owner_mismatch",
      403,
      "Delegated session issuance requires the acting user to match the worker owner",
    );
  }
  return {
    worker: worker as WorkerRecord & { registeredByUserId: number },
    job: job as WorkerJobRecord & { requestedByUserId: number },
  };
}

function assertLeaseAndJobState(
  auth: WorkerAccessAuthContext,
  job: WorkerJobRecord,
  leaseOwnerToken: string,
): void {
  if (!ACTIVE_JOB_STATUSES.has(String(job.status || ""))) {
    throw new WorkerDelegationError(
      "worker_state_invalid",
      409,
      `Worker job ${job.id} is not in a delegatable state`,
    );
  }
  if (job.workerId !== auth.workerId) {
    throw new WorkerDelegationError("worker_scope_mismatch", 403, "Worker token does not own the requested job");
  }
  if (job.leaseOwnerToken !== leaseOwnerToken) {
    throw new WorkerDelegationError("stale_worker_lease", 409, "Worker lease token is stale or invalid");
  }
  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
    throw new WorkerDelegationError("stale_worker_lease", 409, "Worker lease has expired");
  }
}

export async function createDelegatedWorkerSession(
  input: {
    auth: WorkerAccessAuthContext;
    jobId: string;
    payload: DelegatedSessionRequest;
  },
  deps: {
    repo?: WorkerDelegationRepository;
    getFeatureFlags?: typeof getTenantFeatureFlags;
  } = {},
): Promise<DelegatedSessionResponse> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;

  const [flags, worker, job] = await Promise.all([
    getFeatureFlags(input.auth.tenantId),
    repo.getWorkerById(input.auth.tenantId, input.auth.workerId),
    repo.getWorkerJobById(input.auth.tenantId, input.jobId),
  ]);

  assertDelegatedWorkerAccessEnabled();
  assertRuntimeFeatureEnabled(input.auth.runtimeType, flags, input.auth.tenantId);
  const aligned = requireOwnerAligned(worker, job);
  const runtimeCapabilities = assertRuntimeDelegationCapabilities(aligned.worker);
  assertLeaseAndJobState(input.auth, aligned.job, input.payload.leaseOwnerToken);
  assertWorkerAccessPolicyAllowsDelegatedSession(
    aligned.worker,
    input.payload.scopeProfile,
    input.payload.grants,
    runtimeCapabilities,
    aligned.job,
  );

  const profile = getProfileDefinition(input.payload.scopeProfile);
  const activeMode = summarizeHermesTaskMode(input.payload.scopeProfile);
  const grantedScopes = [...profile.scopes];
  const expiresAt = new Date(
    Date.now()
      + Math.min(
        input.payload.requestedTtlSeconds ?? DELEGATED_SESSION_DEFAULT_TTL_SECONDS,
        DELEGATED_SESSION_MAX_TTL_SECONDS,
      ) * 1000,
  );
  const sessionId = crypto.randomUUID();
  const tokenJti = randomJti("worker_delegate");

  await repo.revokeActiveSessionsForJob(aligned.job.id, aligned.worker.id);

  const grantRows = buildGrantRows(
    sessionId,
    input.auth.tenantId,
    aligned.job.id,
    aligned.job,
    input.payload.grants,
    expiresAt,
  );

  const manifest = await buildManifest(
    {
      id: sessionId,
      tenantId: input.auth.tenantId,
      teamId: aligned.job.teamId ? String(aligned.job.teamId) : null,
      workerId: aligned.worker.id,
      workerJobId: aligned.job.id,
      actingUserId: Number(aligned.job.requestedByUserId),
      ownerUserId: Number(aligned.worker.registeredByUserId),
      runtimeType: input.auth.runtimeType,
      scopeProfile: input.payload.scopeProfile,
      activeMode,
      grantedScopes,
      expiresAt,
    },
    grantRows as GrantRecord[],
    runtimeCapabilities,
  );

  await repo.insertDelegatedSession({
    id: sessionId,
    tenantId: input.auth.tenantId,
    teamId: aligned.job.teamId ?? null,
    workerId: aligned.worker.id,
    workerJobId: aligned.job.id,
    actingUserId: aligned.job.requestedByUserId,
    ownerUserId: aligned.worker.registeredByUserId,
    runtimeType: input.auth.runtimeType,
    scopeProfile: input.payload.scopeProfile,
    activeMode,
    grantedScopesJson: grantedScopes,
    manifestJson: manifest,
    leaseOwnerToken: input.payload.leaseOwnerToken,
    tokenJti,
    expiresAt,
  });
  await repo.insertWorkerJobGrants(grantRows);

  const token = signBearerToken(
    {
      sub: `worker-delegate:${sessionId}`,
      type: "access",
      aud: DELEGATED_WORKER_AUDIENCE,
      tokenUse: DELEGATED_WORKER_TOKEN_USE,
      tenantId: input.auth.tenantId,
      teamId: aligned.job.teamId ?? undefined,
      workerId: aligned.worker.id,
      workerJobId: aligned.job.id,
      runtimeType: input.auth.runtimeType,
      userId: aligned.job.requestedByUserId,
      ownerUserId: aligned.worker.registeredByUserId,
      delegatedSessionId: sessionId,
      scopeProfile: input.payload.scopeProfile,
      scopes: grantedScopes,
      jti: tokenJti,
    } as any,
    `${Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}s`,
  );

  return {
    sessionId,
    token,
    audience: DELEGATED_WORKER_AUDIENCE,
    tokenUse: DELEGATED_WORKER_TOKEN_USE,
    scopeProfile: input.payload.scopeProfile,
    activeMode,
    grantedScopes,
    expiresAt: expiresAt.toISOString(),
    manifest,
  };
}

export async function getDelegatedWorkerManifest(
  input: {
    auth: WorkerAccessAuthContext;
    jobId: string;
  },
  deps: {
    repo?: WorkerDelegationRepository;
  } = {},
): Promise<DelegatedCapabilityManifest> {
  const repo = deps.repo ?? defaultRepo;
  const [worker, job, session] = await Promise.all([
    repo.getWorkerById(input.auth.tenantId, input.auth.workerId),
    repo.getWorkerJobById(input.auth.tenantId, input.jobId),
    repo.getLatestActiveSessionForJob(input.jobId, input.auth.workerId),
  ]);

  const aligned = requireOwnerAligned(worker, job);
  if (!session) {
    throw new WorkerDelegationError("not_found", 404, "No active delegated session exists for this worker job", "not_found_error");
  }
  const runtimeCapabilities = assertRuntimeDelegationCapabilities(aligned.worker);
  const sessionGrants = await repo.listActiveGrantsForSession(session.id);
  assertWorkerAccessPolicyAllowsDelegatedSession(
    aligned.worker,
    session.scopeProfile as DelegatedScopeProfile,
    {
      skills: readGrantIds(sessionGrants, "skill"),
      agencies: readGrantIds(sessionGrants, "agency"),
      libraryItemIds: readGrantIds(sessionGrants, "library_item").map((value) => Number(value)).filter(Number.isFinite),
      mcpNamespaces: readGrantIds(sessionGrants, "mcp_server"),
      knowledge: {
        librarySearch: hasScopedGrant(sessionGrants, "library_search_scope"),
        libraryUpload: hasScopedGrant(sessionGrants, "library_upload_policy"),
        ragSearch: hasScopedGrant(sessionGrants, "rag_scope", "search"),
        ragIngest: hasScopedGrant(sessionGrants, "rag_scope", "ingest"),
      },
    },
    runtimeCapabilities,
    aligned.job,
  );
  return buildManifest(
    {
      id: session.id,
      tenantId: session.tenantId,
      teamId: session.teamId ? String(session.teamId) : null,
      workerId: session.workerId,
      workerJobId: session.workerJobId,
      actingUserId: Number(session.actingUserId),
      ownerUserId: Number(session.ownerUserId),
      runtimeType: session.runtimeType as WorkerRuntimeType,
      scopeProfile: session.scopeProfile as DelegatedScopeProfile,
      activeMode: summarizeHermesTaskMode(session.scopeProfile as DelegatedScopeProfile),
      grantedScopes: normalizeScopes(Array.isArray(session.grantedScopesJson) ? session.grantedScopesJson : []),
      expiresAt: new Date(session.expiresAt),
    },
    sessionGrants,
    runtimeCapabilities,
  );
}

export async function getDelegatedWorkerManifestBySessionId(
  input: { delegatedSessionId: string },
  deps: {
    repo?: WorkerDelegationRepository;
    getFeatureFlags?: typeof getTenantFeatureFlags;
  } = {},
): Promise<DelegatedCapabilityManifest> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;
  const session = await repo.getDelegatedSessionById(input.delegatedSessionId);
  if (!session) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session is invalid");
  }
  if (session.revokedAt) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session has been revoked");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session has expired");
  }

  assertDelegatedWorkerAccessEnabled();
  const flags = await getFeatureFlags(String(session.tenantId));
  assertRuntimeFeatureEnabled(session.runtimeType as WorkerRuntimeType, flags, String(session.tenantId));

  const [worker, job] = await Promise.all([
    repo.getWorkerById(String(session.tenantId), String(session.workerId)),
    repo.getWorkerJobById(String(session.tenantId), String(session.workerJobId)),
  ]);
  const aligned = requireOwnerAligned(worker, job);
  const runtimeCapabilities = assertRuntimeDelegationCapabilities(aligned.worker);
  assertLeaseAndJobState(
    {
      audience: "",
      runtimeType: session.runtimeType as WorkerRuntimeType,
      scopes: [],
      subject: "",
      teamId: session.teamId ? String(session.teamId) : null,
      tenantId: String(session.tenantId),
      tokenUse: "worker_execution",
      workerId: String(session.workerId),
    },
    job as WorkerJobRecord,
    String(session.leaseOwnerToken),
  );

  const grants = await repo.listActiveGrantsForSession(session.id);
  return buildManifest(
    {
      id: session.id,
      tenantId: String(session.tenantId),
      teamId: session.teamId ? String(session.teamId) : null,
      workerId: String(session.workerId),
      workerJobId: String(session.workerJobId),
      actingUserId: Number(session.actingUserId),
      ownerUserId: Number(session.ownerUserId),
      runtimeType: session.runtimeType as WorkerRuntimeType,
      scopeProfile: session.scopeProfile as DelegatedScopeProfile,
      activeMode: summarizeHermesTaskMode(session.scopeProfile as DelegatedScopeProfile),
      grantedScopes: normalizeScopes(Array.isArray(session.grantedScopesJson) ? session.grantedScopesJson : []),
      expiresAt: new Date(session.expiresAt),
    },
    grants,
    runtimeCapabilities,
  );
}

export async function verifyDelegatedWorkerBearerToken(
  token: string,
  deps: {
    repo?: WorkerDelegationRepository;
    getFeatureFlags?: typeof getTenantFeatureFlags;
  } = {},
): Promise<DelegatedWorkerAuthContext> {
  const repo = deps.repo ?? defaultRepo;
  const getFeatureFlags = deps.getFeatureFlags ?? getTenantFeatureFlags;
  const claims = await verifyBearerToken(token);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(DELEGATED_WORKER_AUDIENCE)) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker token audience is invalid");
  }
  if ((claims as any).tokenUse !== DELEGATED_WORKER_TOKEN_USE) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker token use is invalid");
  }

  const delegatedSessionId = String((claims as any).delegatedSessionId || "");
  const tokenJti = String(claims.jti || "");
  if (!delegatedSessionId || !tokenJti) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker token is missing session binding");
  }

  const session = await repo.getDelegatedSessionById(delegatedSessionId);
  if (!session || session.tokenJti !== tokenJti) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session is invalid");
  }
  if (session.revokedAt) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session has been revoked");
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new WorkerDelegationError("worker_auth_invalid", 401, "Delegated worker session has expired");
  }

  assertDelegatedWorkerAccessEnabled();
  const flags = await getFeatureFlags(String(session.tenantId));
  assertRuntimeFeatureEnabled(session.runtimeType as WorkerRuntimeType, flags, String(session.tenantId));

  const [worker, job] = await Promise.all([
    repo.getWorkerById(String(session.tenantId), String(session.workerId)),
    repo.getWorkerJobById(String(session.tenantId), String(session.workerJobId)),
  ]);
  requireOwnerAligned(worker, job);
  assertLeaseAndJobState(
    {
      audience: "",
      runtimeType: session.runtimeType as WorkerRuntimeType,
      scopes: [],
      subject: "",
      teamId: session.teamId ? String(session.teamId) : null,
      tenantId: String(session.tenantId),
      tokenUse: "worker_execution",
      workerId: String(session.workerId),
    },
    job as WorkerJobRecord,
    String(session.leaseOwnerToken),
  );

  return {
    audience: DELEGATED_WORKER_AUDIENCE,
    tenantId: String(session.tenantId),
    teamId: session.teamId ? String(session.teamId) : null,
    userId: Number(session.actingUserId),
    ownerUserId: Number(session.ownerUserId),
    workerId: String(session.workerId),
    workerJobId: String(session.workerJobId),
    delegatedSessionId,
    runtimeType: session.runtimeType as WorkerRuntimeType,
    scopeProfile: session.scopeProfile as DelegatedScopeProfile,
    scopes: normalizeScopes(Array.isArray(session.grantedScopesJson) ? session.grantedScopesJson : []),
    subject: String(claims.sub || ""),
    tokenUse: DELEGATED_WORKER_TOKEN_USE,
  };
}

export async function assertDelegatedWorkerGrant(
  auth: { mode?: string; delegatedSessionId?: string; workerJobId?: string } | null | undefined,
  input: {
    grantType: DelegatedGrantType;
    resourceId?: string | number | null;
    requireScopeFlag?: string;
  },
  deps: {
    repo?: WorkerDelegationRepository;
  } = {},
): Promise<void> {
  if (!auth || auth.mode !== "delegated_worker" || !auth.delegatedSessionId) {
    return;
  }

  const repo = deps.repo ?? defaultRepo;
  const grants = await repo.listActiveGrantsForSession(auth.delegatedSessionId);
  const resourceId = input.resourceId == null ? null : String(input.resourceId);

  const matches = grants.some((grant) => {
    if (grant.grantType !== input.grantType) {
      return false;
    }
    if (resourceId == null) {
      if (!input.requireScopeFlag) {
        return true;
      }
      const scope = grant.resourceScopeJson;
      return Boolean(scope && typeof scope === "object" && (scope as Record<string, unknown>)[input.requireScopeFlag] === true);
    }
    return String(grant.resourceId || "") === resourceId;
  });

  if (!matches) {
    throw new WorkerDelegationError(
      "delegated_grant_required",
      403,
      `Delegated worker grant ${input.grantType}${resourceId ? `:${resourceId}` : ""} is required`,
    );
  }
}

export function parseDelegatedSessionRequest(input: unknown): DelegatedSessionRequest {
  return delegatedSessionRequestSchema.parse(input ?? {});
}
