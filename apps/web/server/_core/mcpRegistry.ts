import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";

import { getDb, getUserById } from "../db";
import {
  agencies,
  agencyConversations,
  llmProviders,
  mediaModels,
  modelProviderMap,
  workers,
} from "../../drizzle/schema";
import {
  marketplaceIntelligenceReportTypeSchema,
  marketplaceReportAspectRatioSchema,
} from "../../shared/marketplaceIntelligence";
import type { DelegatedCapabilityManifest } from "../../shared/workerDelegation";
import { createInternalTokenFromAuth } from "./tokens";
import {
  calculateCreditsForLLM,
  calculateLibraryUploadCreditCost,
  chargeForRagQuery,
  deductCredits,
  deductCreditsForModel,
  getCreditBalance,
  hasEnoughCredits,
  refundCredits,
} from "../services/creditService";
import { calculateCreditCost } from "../services/pricingCalculator";
import {
  inferMediaModelHintFromText,
  resolveEnabledMediaModelSelection,
} from "../services/enabledMediaModelSelection";
import { loadEnabledLlmModelRows, resolveEnabledLlmModelId } from "../services/enabledLlmModels";
import { executeWithFallback } from "../services/llmRouter";
import {
  buildDelegatedWorkerOriginMetadata,
  enforceDelegatedWorkerModelSelectionPolicy,
  runWithDelegatedWorkerExecution,
} from "../services/delegatedWorkerPlatformService";
import {
  createLibraryItem,
  getLibraryItemById,
  safeEnqueueLibraryIndexJob,
  searchLibraryItems,
  uploadLibraryFile,
  type LibraryRecentDaysFilter,
  type LibrarySearchFilters,
} from "../services/libraryService";
import {
  createLibraryDownloadRef,
  createMediaTaskDownloadRef,
} from "../services/mcpDownloadBrokerService";
import { listMcpMediaTasks, getMcpMediaTask } from "../services/mcpMediaAdapter";
import { getHermesMediaTask, listHermesMediaTasks } from "../services/hermesMediaAdapter";
import {
  getLibraryContextPack,
  listLibraryContextPacks,
  resolveLibraryContextPack,
} from "../services/libraryContextPackService";
import {
  assertKnowledgeVaultSurfaceEnabledAsync,
  isKnowledgeVaultSurfaceEnabledAsync,
} from "../services/libraryFeatureFlags";
import {
  incrementLibraryKnowledgeCounter,
  recordLibraryKnowledgeLeakageProbe,
  sanitizeLibraryKnowledgeLeakageProbe,
} from "../services/libraryKnowledgeObservabilityService";
import { getRedisClient } from "../services/redis";
import { getSkillByIdAsync, getAvailableSkillsAsync } from "../services/skillRegistry";
import { executeSkill } from "../services/skillExecutor";
import { normalizeSkillRevenuePricing } from "../services/skillRevenueBilling";
import { detectSkill } from "../services/skillDetector";
import { agencyBridge } from "../services/agencyBridge";
import { mediaGenerationService } from "../services/mediaGenerationService";
import { listDeferredMediaTasks } from "../services/deferredMediaRetryService";
import {
  cancelJob,
  createJob,
  getJob,
  listJobs,
} from "../services/jobAutomationService";
import {
  createPresentationDeckForLibraryItem,
  getPresentationDeckDetail,
} from "../services/presentationService";
import {
  getPresentationExportStatus,
  triggerPresentationExport,
} from "../services/presentationPlaybackExport";
import { resolveAutoDraftParams } from "../services/autoDraftResolver";
import { generateAIDraft } from "../services/aiPresentationService";
import { resolveExportDownloadTarget } from "../routes/exportDownloadTarget";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  assertDelegatedWorkerGrant,
  type DelegatedWorkerAuthContext,
} from "../services/workerDelegationService";
import {
  approveWorkItemByAssistant,
  advanceWorkItemByAssistant,
  promoteMessageToWorkItem,
  requestWorkItemChangesByAssistant,
} from "../services/orchestratorRoomActionsService";
import { buildContextToolStateHintsFromResult } from "../services/contextToolService";
import {
  createMarketplaceCaptureCandidateBatchFromSnapshot,
  createMarketplaceIntelligenceReport,
  createMarketplaceWatchlist,
  getMarketplaceSnapshot,
  listMarketplaceSnapshots,
  listMarketplaceWatchlists,
} from "../services/marketplaceIntelligenceService";
import { saveOpenAiHostedShopeeSearchSnapshot } from "../services/marketplaceOpenAiShopeeWritebackService";
import {
  cancelQueuedUserWorkerJob,
  getUserWorkerJobDetail,
  listUserWorkerJobs,
} from "../services/workerJobMonitorService";
import { videoProjectsRouter } from "../routers/videoProjects";
import { mediaRouter } from "../routers/media";
import { hermesConnectionsRouter } from "../routers/hermesConnections";
import { revokeHermesAgentDevice } from "../services/hermesAgentPairingService";

export type McpSessionMode = "api_key" | "session" | "bearer" | "agent_pairing" | "delegated_worker";
export type McpToolActionClass = "read" | "compute" | "media" | "mcp_write";
export type McpToolFamily =
  | "gateway"
  | "knowledge"
  | "skills"
  | "agencies"
  | "media"
  | "presentations"
  | "video_projects"
  | "jobs"
  | "workspace"
  | "drive"
  | "orchestrator"
  | "marketplace_intelligence"
  | "browser";
export type McpToolGroup =
  | "gateway_read"
  | "gateway_generation"
  | "knowledge_read"
  | "knowledge_ingest"
  | "skills_read"
  | "skills_execute"
  | "agency_read"
  | "agency_execute"
  | "media_generation"
  | "presentation_generation"
  | "video_generation"
  | "job_read"
  | "job_mutation"
  | "workspace_access"
  | "drive_access"
  | "orchestrator_write"
  | "marketplace_intelligence_read"
  | "marketplace_intelligence_write"
  | "browser_automation";
export type McpExecutionMode = "implemented" | "legacy_adapter" | "gated";
export type McpResultSafetyClass = "structured_json" | "artifact_ref" | "safe_text" | "download_ref";
export type McpIdempotencyMode = "none" | "optional" | "required";
export type McpCacheScope = "private" | "tenant" | "public" | "no-store";

export type McpToolSession = {
  state: "ready" | "error";
  authMode: McpSessionMode;
  tenantId: string;
  userId: number;
  apiKeyId: string | null;
  scopes: string[];
  createdAt: string;
  ownerUserId?: number | null;
  workerId?: string | null;
  workerJobId?: string | null;
  delegatedSessionId?: string | null;
  runtimeType?: string | null;
  scopeProfile?: string | null;
  teamId?: string | null;
  deviceIdHash?: string | null;
  legacyBroadScopeCompatibility?: boolean;
};

export type McpCatalogTool = {
  name: string;
  family: McpToolFamily;
  namespace: string;
  toolGroup: McpToolGroup;
  description: string;
  requiredScope: string;
  readWrite: "Read" | "Write";
  delegatedWorkerEligible: boolean;
  executionMode: McpExecutionMode;
  resultSafetyClass: McpResultSafetyClass;
  idempotencyMode: McpIdempotencyMode;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  aliases?: string[];
  schemaVersion?: string;
  cacheScope?: McpCacheScope;
  auditAction?: string;
};

type DelegatedManifestToolAvailability = "ready" | "experimental" | "unavailable";

type McpExecutionContext = {
  session: McpToolSession;
  delegatedManifest: DelegatedCapabilityManifest | null;
  idempotencyKey: string | null;
};

type AvailabilityResult =
  | { available: true }
  | { available: false; reason: string };

type McpToolDefinition = McpCatalogTool & {
  actionClass: McpToolActionClass;
  listVisibleWhen?: (ctx: McpExecutionContext) => boolean | Promise<boolean>;
  availability?: (ctx: McpExecutionContext) => AvailabilityResult | Promise<AvailabilityResult>;
  execute: (args: Record<string, unknown>, ctx: McpExecutionContext) => Promise<unknown>;
};

type ToolListContext = {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    requiredScope: string;
    schemaVersion: string;
    cacheScope: McpCacheScope;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
    };
  }>;
  hidden: Array<{ name: string; reason: string }>;
};

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT
  ? path.resolve(process.env.WORKSPACE_ROOT)
  : path.resolve(process.cwd(), "workspace");
const MAX_READ_BYTES = parseInt(process.env.MCP_MAX_READ_BYTES || "1048576", 10);
const MAX_WRITE_BYTES = parseInt(process.env.MCP_MAX_WRITE_BYTES || "1048576", 10);
const EXT_ALLOW = new Set(
  (process.env.MCP_EXT_ALLOWLIST ||
    ".md,.txt,.json,.yaml,.yml,.ts,.tsx,.js,.py,.css,.html")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const DRIVE_TOOL_NAMES = {
  search: "search_drive_files",
  read: "read_drive_file",
  list: "list_drive_folder",
  info: "get_drive_file_info",
} as const;
const MAX_RAG_RESULTS = 20;
const MCP_TOOL_FAMILIES: McpToolFamily[] = [
  "gateway",
  "knowledge",
  "skills",
  "agencies",
  "media",
  "presentations",
  "video_projects",
  "jobs",
  "workspace",
  "drive",
  "orchestrator",
  "marketplace_intelligence",
  "browser",
];
const MCP_TOOL_GROUPS: McpToolGroup[] = [
  "gateway_read",
  "gateway_generation",
  "knowledge_read",
  "knowledge_ingest",
  "skills_read",
  "skills_execute",
  "agency_read",
  "agency_execute",
  "media_generation",
  "presentation_generation",
  "video_generation",
  "job_read",
  "job_mutation",
  "workspace_access",
  "drive_access",
  "orchestrator_write",
  "marketplace_intelligence_read",
  "marketplace_intelligence_write",
  "browser_automation",
];

function parseCsvEnv<T extends string>(value: string | undefined, allowedValues: readonly T[]): T[] {
  if (!value) {
    return [];
  }
  const allowed = new Set<string>(allowedValues);
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is T => Boolean(entry) && allowed.has(entry));
}

export function getDelegatedMcpOperatorPolicySnapshot(): {
  enabled: boolean;
  disabledFamilies: McpToolFamily[];
  disabledToolGroups: McpToolGroup[];
  approvalRequiredToolGroups: McpToolGroup[];
} {
  return {
    enabled: process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED !== "false",
    disabledFamilies: parseCsvEnv(
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_DISABLED_FAMILIES,
      MCP_TOOL_FAMILIES,
    ),
    disabledToolGroups: parseCsvEnv(
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_DISABLED_TOOL_GROUPS,
      MCP_TOOL_GROUPS,
    ),
    approvalRequiredToolGroups: parseCsvEnv(
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_APPROVAL_REQUIRED_TOOL_GROUPS,
      MCP_TOOL_GROUPS,
    ),
  };
}

function toDelegatedAuthContext(session: McpToolSession): DelegatedWorkerAuthContext | null {
  if (session.authMode !== "delegated_worker") {
    return null;
  }
  if (
    !session.ownerUserId
    || !session.workerId
    || !session.workerJobId
    || !session.delegatedSessionId
    || !session.runtimeType
    || !session.scopeProfile
  ) {
    return null;
  }
  return {
    audience: "smartspec-worker-gateway",
    tenantId: session.tenantId,
    teamId: session.teamId ?? null,
    userId: session.userId,
    ownerUserId: session.ownerUserId,
    workerId: session.workerId,
    workerJobId: session.workerJobId,
    delegatedSessionId: session.delegatedSessionId,
    runtimeType: session.runtimeType as any,
    scopeProfile: session.scopeProfile as any,
    scopes: session.scopes as any,
    subject: String(session.userId),
    tokenUse: "worker_gateway_delegate",
  };
}

function ensureWriteAccess(session: McpToolSession, tool: McpCatalogTool): boolean {
  return tool.readWrite === "Read" || session.scopes.includes("mcp:write");
}

function namespaceAllowed(namespace: string, manifest: DelegatedCapabilityManifest | null): boolean {
  if (!manifest) {
    return true;
  }
  const allowed = manifest.allowedMcpNamespaces ?? [];
  if (!allowed.length) {
    return false;
  }
  return allowed.includes("*") || allowed.includes(namespace);
}

async function evaluateToolAvailability(
  tool: McpToolDefinition,
  ctx: McpExecutionContext,
): Promise<AvailabilityResult> {
  const hasRequiredScope = ctx.session.scopes.includes(tool.requiredScope)
    || (ctx.session.legacyBroadScopeCompatibility
      && ((tool.readWrite === "Read" && ctx.session.scopes.includes("mcp:read"))
        || (tool.readWrite === "Write" && ctx.session.scopes.includes("mcp:write"))));
  if (!hasRequiredScope) {
    return { available: false, reason: "missing_required_scope" };
  }
  if (!ensureWriteAccess(ctx.session, tool)) {
    return { available: false, reason: "mcp_write_required" };
  }
  if (ctx.session.authMode === "delegated_worker") {
    if (!ctx.delegatedManifest || ctx.delegatedManifest.availability.mcp === "unavailable") {
      return { available: false, reason: "delegated_mcp_unavailable" };
    }
    const operatorPolicy = getDelegatedMcpOperatorPolicySnapshot();
    if (!operatorPolicy.enabled) {
      return { available: false, reason: "delegated_mcp_disabled_by_operator" };
    }
    if (operatorPolicy.disabledFamilies.includes(tool.family)) {
      return { available: false, reason: "mcp_family_disabled_by_operator" };
    }
    if (operatorPolicy.disabledToolGroups.includes(tool.toolGroup)) {
      return { available: false, reason: "mcp_tool_group_disabled_by_operator" };
    }
    if (operatorPolicy.approvalRequiredToolGroups.includes(tool.toolGroup)) {
      return { available: false, reason: "approval_required_by_operator_policy" };
    }
    if (!tool.delegatedWorkerEligible) {
      return { available: false, reason: "delegated_tool_not_allowed" };
    }
    if (!namespaceAllowed(tool.namespace, ctx.delegatedManifest)) {
      return { available: false, reason: "mcp_namespace_not_granted" };
    }
  }
  if (tool.executionMode !== "implemented" && tool.executionMode !== "legacy_adapter") {
    return { available: false, reason: "tool_gated" };
  }
  if (tool.availability) {
    return tool.availability(ctx);
  }
  return { available: true };
}

function safeJoin(rel: string): string {
  const cleaned = rel.replace(/^[\\/]+/, "");
  const full = path.resolve(WORKSPACE_ROOT, cleaned);
  if (!full.startsWith(WORKSPACE_ROOT + path.sep) && full !== WORKSPACE_ROOT) {
    throw new Error("Path escapes WORKSPACE_ROOT");
  }
  return full;
}

function assertExtAllowed(p: string): void {
  const ext = path.extname(p).toLowerCase();
  if (ext && !EXT_ALLOW.has(ext)) {
    throw new Error(`Extension not allowed: ${ext}`);
  }
}

function summarizeMessageText(messages: Array<Record<string, unknown>>): string {
  return messages
    .map((message) => {
      const content = message.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") {
              return part;
            }
            if (part && typeof part === "object" && typeof (part as any).text === "string") {
              return (part as any).text;
            }
            return "";
          })
          .join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

function normalizeResponsesInput(input: unknown): Array<Record<string, unknown>> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item) => {
    if (typeof item === "string") {
      return [{ role: "user", content: item }];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    const role = typeof (item as any).role === "string" ? (item as any).role : "user";
    const content = (item as any).content;
    if (typeof content === "string") {
      return [{ role, content }];
    }
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object" && typeof (part as any).text === "string") {
            return (part as any).text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return text ? [{ role, content: text }] : [];
    }
    return [];
  });
}

function estimateGatewayCredits(
  model: string | null | undefined,
  text: string,
  maxOutputTokens?: number | null,
): number {
  const inputTokens = Math.max(1, Math.ceil(text.length / 4));
  const outputTokens = Math.max(64, Number.isFinite(Number(maxOutputTokens)) ? Number(maxOutputTokens) : 512);
  return Math.max(1, calculateCreditsForLLM(inputTokens, outputTokens, model || "gpt-5.4-mini"));
}

async function listGatewayModels(): Promise<unknown> {
  const rows = await loadEnabledLlmModelRows();
  const models: Array<{ id: string; object: string; owned_by?: string }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.modelId)) {
      continue;
    }
    seen.add(row.modelId);
    models.push({
      id: row.modelId,
      object: "model",
      owned_by: row.providerName,
    });
  }
  return { object: "list", data: models };
}

async function getOwnerCredits(session: McpToolSession): Promise<unknown> {
  const balance = await getCreditBalance(session.userId);
  return {
    credits: balance?.credits ?? 0,
    plan: balance?.plan ?? "free",
  };
}

async function estimateMcpCredits(args: Record<string, unknown>): Promise<unknown> {
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : "gpt-5.4-mini";
  const text = typeof args.prompt === "string"
    ? args.prompt.slice(0, 32_000)
    : Array.isArray(args.messages)
      ? args.messages.slice(0, 100).map((message) => {
        if (typeof message === "string") return message;
        if (!message || typeof message !== "object") return "";
        const content = (message as Record<string, unknown>).content;
        return typeof content === "string" ? content : JSON.stringify(content ?? "");
      }).join("\n").slice(0, 32_000)
      : "";
  const maxOutputTokens = Number.isFinite(Number(args.max_output_tokens))
    ? Math.min(32_000, Math.max(1, Number(args.max_output_tokens)))
    : 512;
  const inputTokens = Math.max(1, Math.ceil(text.length / 4));
  return {
    model,
    estimated_input_tokens: inputTokens,
    estimated_output_tokens: maxOutputTokens,
    estimated_credits: estimateGatewayCredits(model, text, maxOutputTokens),
    pricing_source: "server_model_catalog",
  };
}

async function executeGatewayChat(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const messages = Array.isArray(args.messages)
    ? args.messages.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const requestedModel = typeof args.model === "string" ? args.model.trim() : "";
  const preferredProviderId = Number.isFinite(Number(args.preferred_provider_id))
    ? Number(args.preferred_provider_id)
    : undefined;
  const maxOutputTokens = Number.isFinite(Number(args.max_output_tokens))
    ? Number(args.max_output_tokens)
    : undefined;

  const normalizedMessages = messages.length
    ? messages
    : prompt
      ? [{ role: "user", content: prompt }]
      : [];
  if (!normalizedMessages.length) {
    throw new Error("Either prompt or messages is required");
  }

  const resolvedModel = await resolveEnabledLlmModelId(requestedModel ? [requestedModel] : undefined);
  enforceDelegatedWorkerModelSelectionPolicy({
    auth: ctx.session as any,
    rawRequestedModel: requestedModel || null,
    resolvedModelId: resolvedModel ?? (requestedModel || null),
    preferredProviderId: preferredProviderId ?? null,
  });

  const estimatedCredits = estimateGatewayCredits(
    resolvedModel ?? requestedModel,
    summarizeMessageText(normalizedMessages),
    maxOutputTokens,
  );

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    const result = await executeWithFallback({
      model: resolvedModel ?? requestedModel ?? "gpt-5.4-mini",
      messages: normalizedMessages as any,
      stream: false,
      userId: ctx.session.userId,
      preferredProvider: preferredProviderId,
      strictProviderPin: Boolean(preferredProviderId),
    });

    if (result.type !== "success") {
      if (result.type === "fallback_required") {
        return {
          fallbackRequired: true,
          from: {
            provider: result.from.providerName,
            model: result.from.providerModelId,
          },
          to: {
            provider: result.to.providerName,
            model: result.to.providerModelId,
          },
          estimatedCredits: result.estimatedCredits,
        };
      }
      throw new Error((result as any).error ?? "LLM execution failed");
    }

    const data = result.response ?? {};
    const usage = data?.usage ?? {};
    const credits = await deductCreditsForModel({
      userId: ctx.session.userId,
      model: resolvedModel ?? requestedModel ?? "gpt-5.4-mini",
      provider: result.providerName,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      costUsd: usage.cost,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      sourceType: "worker_runtime",
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.gateway.chat.create", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.gateway.chat.create",
      }),
    });

    return {
      model: resolvedModel ?? requestedModel ?? "gpt-5.4-mini",
      provider: result.providerName,
      assistantText:
        data?.choices?.[0]?.message?.content
        ?? data?.output_text
        ?? "",
      usage,
      creditsUsed: credits.creditsUsed,
      raw: data,
    };
  });
}

async function executeGatewayResponses(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const requestedModel = typeof args.model === "string" ? args.model.trim() : "";
  const input = normalizeResponsesInput(args.input);
  const instructions = typeof args.instructions === "string" ? args.instructions.trim() : "";
  if (!input.length) {
    throw new Error("input is required");
  }

  const messages = [
    ...(instructions ? [{ role: "system", content: instructions }] : []),
    ...input,
  ];

  const result = await executeGatewayChat({
    model: requestedModel,
    messages,
    max_output_tokens: args.max_output_tokens,
    preferred_provider_id: args.preferred_provider_id,
  }, ctx);

  return {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: new Date().toISOString(),
    output_text: (result as any).assistantText ?? "",
    usage: (result as any).usage ?? {},
    creditsUsed: (result as any).creditsUsed ?? 0,
    model: (result as any).model,
    provider: (result as any).provider,
    raw: (result as any).raw,
  };
}

function normalizeLibraryItemType(rawType: unknown): string | undefined {
  if (typeof rawType !== "string" || !rawType.trim()) return undefined;
  const val = rawType.trim().toLowerCase();
  if (["image", "images", "img", "photo", "photos", "picture", "pictures", "รูป", "รูปภาพ", "ภาพ"].includes(val)) {
    return "image";
  }
  if (["video", "videos", "clip", "clips", "mp4", "movie", "วิดีโอ", "คลิป"].includes(val)) {
    return "video";
  }
  if (["audio", "sound", "music", "mp3", "voice", "เสียง", "เพลง"].includes(val)) {
    return "audio";
  }
  if (["document", "documents", "doc", "docs", "pdf", "text", "txt", "เอกสาร"].includes(val)) {
    return "document";
  }
  if (["presentation", "presentations", "ppt", "pptx", "slides", "สไลด์"].includes(val)) {
    return "presentation";
  }
  if (["folder", "folders", "directory", "โฟลเดอร์"].includes(val)) {
    return "folder";
  }
  return val;
}

function parseLibraryDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === "string" && val.trim()) {
    const d = new Date(val.trim());
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

function normalizeRecentDays(val: unknown): LibraryRecentDaysFilter | undefined {
  if (!val) return undefined;
  const num = typeof val === "number" ? val : parseInt(String(val).replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(num) || num <= 0) return undefined;
  if (num <= 1) return 1;
  if (num <= 3) return 3;
  if (num <= 7) return 7;
  if (num <= 15) return 15;
  return 30;
}

const SUPPORTED_LIBRARY_FILTERS_LIST = [
  "file_types",
  "mime_types",
  "extensions",
  "filename_contains",
  "folder_id",
  "recursive",
  "tags_all",
  "tags_any",
  "source",
  "status",
  "created_at",
  "size_bytes",
];

const ALLOWED_LIBRARY_FILTER_KEYS = new Set([
  ...SUPPORTED_LIBRARY_FILTERS_LIST,
  "fileTypes",
  "mimeTypes",
  "filenameContains",
  "folderId",
  "tagsAll",
  "tagsAny",
  "createdAt",
  "sizeBytes",
  "item_type",
  "itemType",
  "from_date",
  "fromDate",
  "to_date",
  "toDate",
  "recent_days",
  "recentDays",
  "tags",
  "model",
  "product_id",
  "productId",
  "run_id",
  "runId",
  "project_id",
  "projectId",
  "owner_user_id",
  "ownerUserId",
  "include_failed",
  "includeFailed",
]);

async function searchOwnerLibrary(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const isDelegatedWorker = ctx.session.authMode === "delegated_worker";
  if (isDelegatedWorker) {
    await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "library_search_scope" });
  }

  // Check for unsupported filters inside args.filters
  const rawFilters = args.filters && typeof args.filters === "object" && !Array.isArray(args.filters)
    ? (args.filters as Record<string, unknown>)
    : undefined;

  if (rawFilters) {
    const unsupportedKey = Object.keys(rawFilters).find((k) => !ALLOWED_LIBRARY_FILTER_KEYS.has(k));
    if (unsupportedKey) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `ไม่รองรับ filter ชื่อ ${unsupportedKey} กรุณาใช้ filter ที่รองรับ หรือดูคู่มือที่ smartaihub://help/library-search`,
          },
        ],
        structuredContent: {
          error_code: "UNSUPPORTED_FILTER",
          message: `ไม่รองรับ filter ชื่อ ${unsupportedKey}`,
          supported_filters: SUPPORTED_LIBRARY_FILTERS_LIST,
          example: {
            filters: {
              file_types: ["video"],
            },
          },
        },
      };
    }
  }

  // Text search query: query / q / search / text / prompt
  const rawQuery = args.query ?? args.q ?? args.search ?? args.text ?? args.prompt;
  const query = typeof rawQuery === "string" && rawQuery.trim().length > 0 ? rawQuery.trim() : undefined;

  // Limit / page_size (1-100, default 25)
  const rawLimit = args.page_size ?? args.pageSize ?? args.limit ?? args.count ?? args.max_items;
  const limit = Number.isFinite(Number(rawLimit)) ? Math.min(Math.max(Number(rawLimit), 1), 100) : 25;

  // Offset / cursor / skip
  const rawOffset = args.offset ?? args.skip ?? (typeof args.cursor === "string" && /^\d+$/.test(args.cursor) ? Number(args.cursor) : undefined);
  const offset = Number.isFinite(Number(rawOffset)) ? Math.max(Number(rawOffset), 0) : 0;

  // Sorting
  const rawSortBy = args.sort_by ?? args.sortBy;
  const sortBy = rawSortBy === "title" || rawSortBy === "created_at" || rawSortBy === "size_bytes" || rawSortBy === "relevance"
    ? rawSortBy
    : undefined;

  const rawSortOrder = args.sort_order ?? args.sortOrder;
  const sortOrder = rawSortOrder === "asc" || rawSortOrder === "desc" ? rawSortOrder : undefined;

  // File types / item_type
  let fileTypes: string[] | undefined;
  const rawFileTypes = rawFilters?.file_types ?? rawFilters?.fileTypes;
  if (Array.isArray(rawFileTypes)) {
    fileTypes = rawFileTypes.map((t) => normalizeLibraryItemType(t)).filter((t): t is string => Boolean(t));
  } else if (typeof rawFileTypes === "string") {
    const norm = normalizeLibraryItemType(rawFileTypes);
    if (norm) fileTypes = [norm];
  }

  const rawItemType = rawFilters?.item_type ?? rawFilters?.itemType ?? args.item_type ?? args.itemType ?? args.type ?? args.kind;
  const itemType = normalizeLibraryItemType(rawItemType);
  if (itemType && (!fileTypes || fileTypes.length === 0)) {
    fileTypes = [itemType];
  }

  // MIME types
  const rawMimeTypes = rawFilters?.mime_types ?? rawFilters?.mimeTypes;
  const mimeTypes = Array.isArray(rawMimeTypes) ? rawMimeTypes.map((m) => String(m).trim().toLowerCase()).filter(Boolean) : undefined;

  // Extensions
  const rawExtensions = rawFilters?.extensions;
  const extensions = Array.isArray(rawExtensions) ? rawExtensions.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : undefined;

  // Filename contains
  const rawFilenameContains = rawFilters?.filename_contains ?? rawFilters?.filenameContains;
  const filenameContains = typeof rawFilenameContains === "string" && rawFilenameContains.trim() ? rawFilenameContains.trim() : undefined;

  // Folder ID
  let folderId: number | null | undefined;
  const rawFolderId = rawFilters?.folder_id ?? rawFilters?.folderId ?? args.folder_id ?? args.folderId;
  if (rawFolderId !== undefined) {
    if (rawFolderId === null || rawFolderId === "root") {
      folderId = null;
    } else {
      const parsed = parseInt(String(rawFolderId).replace(/^folder_/, ""), 10);
      if (!Number.isNaN(parsed)) {
        folderId = parsed;
      }
    }
  }

  // Recursive
  const recursive = typeof rawFilters?.recursive === "boolean" ? rawFilters.recursive : undefined;

  // Tags All & Tags Any
  const rawTagsAll = rawFilters?.tags_all ?? rawFilters?.tagsAll;
  const tagsAll = Array.isArray(rawTagsAll) ? rawTagsAll.map(String).filter(Boolean) : undefined;

  const rawTagsAny = rawFilters?.tags_any ?? rawFilters?.tagsAny;
  const tagsAny = Array.isArray(rawTagsAny) ? rawTagsAny.map(String).filter(Boolean) : undefined;

  const rawTags = rawFilters?.tags;
  const tags = Array.isArray(rawTags) ? rawTags.map(String).filter(Boolean) : undefined;

  // Source (single or array)
  const rawSource = rawFilters?.source ?? args.source;
  const source = Array.isArray(rawSource)
    ? rawSource.map(String).filter(Boolean)
    : typeof rawSource === "string" && rawSource.trim() ? rawSource.trim() : undefined;

  // Status (single or array, default to ["ready", "processing"] so failed/expired items are excluded unless requested)
  const rawStatus = rawFilters?.status ?? args.status;
  const includeFailed = Boolean(rawFilters?.include_failed ?? rawFilters?.includeFailed ?? args.include_failed ?? args.includeFailed);
  const status = Array.isArray(rawStatus)
    ? (rawStatus as any[])
    : typeof rawStatus === "string" && rawStatus.trim()
      ? [rawStatus.trim() as any]
      : (includeFailed ? undefined : ["ready", "processing"]);

  // Date filters
  const rawCreatedAt = rawFilters?.created_at ?? rawFilters?.createdAt;
  const createdAtObj = rawCreatedAt && typeof rawCreatedAt === "object" ? (rawCreatedAt as Record<string, unknown>) : undefined;

  const rawFromDate = createdAtObj?.from ?? rawFilters?.from_date ?? rawFilters?.fromDate ?? args.from_date ?? args.fromDate ?? args.start_date ?? args.startDate ?? args.after;
  const fromDate = parseLibraryDate(rawFromDate);

  const rawToDate = createdAtObj?.to ?? rawFilters?.to_date ?? rawFilters?.toDate ?? args.to_date ?? args.toDate ?? args.end_date ?? args.endDate ?? args.before;
  const toDate = parseLibraryDate(rawToDate);

  const rawRecentDays = rawFilters?.recent_days ?? rawFilters?.recentDays ?? args.recent_days ?? args.recentDays ?? args.days;
  const recentDays = normalizeRecentDays(rawRecentDays);

  // Size bytes { min, max }
  const rawSizeBytes = rawFilters?.size_bytes ?? rawFilters?.sizeBytes;
  let sizeBytes: { min?: number; max?: number } | undefined;
  if (rawSizeBytes && typeof rawSizeBytes === "object") {
    const min = typeof (rawSizeBytes as any).min === "number" ? (rawSizeBytes as any).min : undefined;
    const max = typeof (rawSizeBytes as any).max === "number" ? (rawSizeBytes as any).max : undefined;
    if (min !== undefined || max !== undefined) {
      sizeBytes = { min, max };
    }
  }

  // Model, ProductId, RunId
  const model = typeof rawFilters?.model === "string" ? rawFilters.model : undefined;
  const productId = typeof rawFilters?.product_id === "string" ? rawFilters.product_id : typeof rawFilters?.productId === "string" ? rawFilters.productId : undefined;
  const runId = typeof rawFilters?.run_id === "string" ? rawFilters.run_id : typeof rawFilters?.runId === "string" ? rawFilters.runId : undefined;

  // SECURITY: Tenant and user filtering ALWAYS bound to authenticated context!
  // args.tenant_id or args.filters.tenant_id is ignored to guarantee isolation.
  const filters: LibrarySearchFilters = {
    ...(isDelegatedWorker ? { ownerUserId: ctx.session.ownerUserId ?? ctx.session.userId } : {}),
    ...(itemType ? { itemType } : {}),
    ...(fileTypes && fileTypes.length > 0 ? { fileTypes } : {}),
    ...(mimeTypes && mimeTypes.length > 0 ? { mimeTypes } : {}),
    ...(extensions && extensions.length > 0 ? { extensions } : {}),
    ...(filenameContains ? { filenameContains } : {}),
    ...(folderId !== undefined ? { folderId } : {}),
    ...(recursive !== undefined ? { recursive } : {}),
    ...(source ? { source } : {}),
    ...(status ? { status } : {}),
    ...(tagsAll && tagsAll.length > 0 ? { tagsAll } : {}),
    ...(tagsAny && tagsAny.length > 0 ? { tagsAny } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(recentDays ? { recentDays } : {}),
    ...(sizeBytes ? { sizeBytes } : {}),
    ...(model ? { model } : {}),
    ...(productId ? { productId } : {}),
    ...(runId ? { runId } : {}),
  };

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "read",
  }, async () => {
    const searchResponse = (await searchLibraryItems(
      {
        query,
        limit,
        offset,
        itemType,
        filters,
        sortBy,
        sortOrder,
        scope: isDelegatedWorker ? "my_library" : "all",
      },
      {
        userId: ctx.session.userId,
        tenantId: ctx.session.tenantId,
        role: "user",
      } as any,
    )) as any;

    const items = Array.isArray(searchResponse?.results) ? searchResponse.results : [];
    const itemsCount = items.length;
    const totalCount = typeof searchResponse?.total === "number" ? searchResponse.total : itemsCount;
    const textSummary = itemsCount === 0
      ? (query ? `ไม่พบไฟล์ที่ตรงกับคำค้นหา "${query}"` : "ไม่พบไฟล์ใน Library ตามเงื่อนไขที่ระบุ")
      : `พบไฟล์ ${itemsCount} รายการ จากทั้งหมด ${totalCount} รายการ${query ? ` สำหรับคำค้นหา "${query}"` : ""}`;
    const textLines = [
      textSummary,
      ...items.slice(0, 15).map((it: any, idx: number) => {
        const thumbUrl = it.thumbnail_url || it.source_url;
        const thumbPart = thumbUrl ? ` | 🖼️ Thumbnail: ${thumbUrl}` : "";
        return `${idx + 1}. [${it.item_type || "file"}] ${it.title} (ID: ${it.item_id}, สถานะ: ${it.status})${thumbPart}`;
      }),
    ];

    const nextCursor = searchResponse?.has_more
      ? String((searchResponse.offset ?? offset) + itemsCount)
      : null;

    return {
      content: [
        {
          type: "text",
          text: textLines.join("\n"),
        },
      ],
      structuredContent: {
        items: items.map((item: any) => ({
          item_id: item.item_id,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
          source_url: item.source_url,
          thumbnail_url: item.thumbnail_url,
          status: item.status,
          source: item.source,
          created_at: item.created_at,
          updated_at: item.updated_at,
          metadata: item.metadata,
          resource_uri: `smartaihub://library/items/${item.item_id}`,
          download_command: `smartspec.knowledge.library.download item_id=${item.item_id}`,
        })),
        total: totalCount,
        limit: searchResponse?.limit ?? limit,
        offset: searchResponse?.offset ?? offset,
        has_more: Boolean(searchResponse?.has_more),
        next_cursor: nextCursor,
        applied_filters: {
          ...(query ? { query } : {}),
          ...(fileTypes && fileTypes.length > 0 ? { file_types: fileTypes } : {}),
          ...(mimeTypes && mimeTypes.length > 0 ? { mime_types: mimeTypes } : {}),
          ...(extensions && extensions.length > 0 ? { extensions } : {}),
          ...(filenameContains ? { filename_contains: filenameContains } : {}),
          ...(folderId !== undefined ? { folder_id: folderId } : {}),
          ...(source ? { source } : {}),
          ...(status ? { status } : {}),
          ...(fromDate ? { from_date: fromDate.toISOString() } : {}),
          ...(toDate ? { to_date: toDate.toISOString() } : {}),
          ...(recentDays ? { recent_days: recentDays } : {}),
        },
        available_next_actions: [
          "เปิด metadata (smartspec.knowledge.library.get หรือ smartaihub_library_get_file)",
          "อ่าน resource (smartaihub://library/items/{item_id})",
          "ดาวน์โหลดไฟล์ (smartspec.knowledge.library.download)",
        ],
      },
    };
  });
}

async function executeSmartaihubHelp(
  args: Record<string, unknown>,
  _ctx: McpExecutionContext,
): Promise<unknown> {
  const topic = String(args.topic ?? "index").trim().toLowerCase();

  if (topic === "library.search" || topic === "library-search" || topic === "search") {
    return {
      content: [
        {
          type: "text",
          text: [
            "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server",
            "",
            "สำหรับการค้นหาไฟล์ใน Library ให้ใช้ smartaihub_library_search (หรือ smartspec.knowledge.library.search)",
            "ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง",
            "หากไม่แน่ใจเกี่ยวกับ filter ให้เรียก smartaihub_help โดยใช้ topic library.search หรือเปิด resource smartaihub://help/library-search",
            "หากต้องการเปิดไฟล์ ให้ใช้ resource URI หรือ smartaihub_library_get_file",
            "",
            "ตัวอย่าง filter ที่รองรับ:",
            JSON.stringify({
              query: "แชมพูในห้องน้ำ",
              filters: {
                file_types: ["image", "video"],
                mime_types: ["image/png", "video/mp4"],
                extensions: [".png", ".mp4"],
                filename_contains: "shampoo",
                folder_id: "folder_123",
                recursive: true,
                tags_all: ["campaign", "approved"],
                tags_any: ["product", "advertisement"],
                source: ["upload", "generated", "rendered"],
                status: ["ready"],
                created_at: {
                  from: "2026-09-01T00:00:00Z",
                  to: "2026-09-03T23:59:59Z",
                },
                size_bytes: {
                  min: 1000,
                  max: 500000000,
                },
              },
              sort_by: "created_at",
              sort_order: "desc",
              page_size: 25,
              include: ["metadata", "thumbnail"],
            }, null, 2),
            "",
            "ดูรายละเอียดเพิ่มเติมได้ที่ resource: smartaihub://help/library-search",
          ].join("\n"),
        },
      ],
      structuredContent: {
        topic: "library.search",
        canonical_tool: "smartaihub_library_search",
        supported_filters: SUPPORTED_LIBRARY_FILTERS_LIST,
        resource_uri: "smartaihub://help/library-search",
      },
    };
  }

  if (topic === "media.generate" || topic === "media-generate" || topic === "generate") {
    return {
      content: [
        {
          type: "text",
          text: [
            "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server — Media Studio Generation",
            "",
            "เครื่องมือสั่งสร้างภาพและวิดีโอ:",
            "- สร้างภาพ: smartspec.media.generate_image (หรือ alias smartaihub_media_generate_image)",
            "- สร้างวิดีโอ: smartspec.media.generate_video (หรือ alias smartaihub_media_generate_video)",
            "",
            "🌟 โมเดลแนะนำยอดนิยมในระบบ (Recommended Models):",
            "1. โมเดลสร้างภาพ (Image Models):",
            "   - GPT Image 2 (model: 'gpt-image-2-text-to-image') — คุณภาพสูงมาก เข้าใจ prompt ซับซ้อน วาดตัวอักษร Text บนภาพได้ (~70 credits)",
            "   - Nano Banana 2 Lite (model: 'google-banana-2-lite') — สไตล์สมจริง Hyper-realistic, Semantic Narrative, ไวและประหยัดเครดิต (~35 credits)",
            "   - Nano Banana Pro (model: 'google/nano-banana-pro') — สไตล์สมจริงระดับ Pro แสงเงาฟิสิกส์แม่นยำ (~90 credits)",
            "   - Seedream 5.0 Pro (model: 'seedream/5-pro-text-to-image') — ภาพคมชัดสูง สไตล์คอมเมิร์ซ โฆษณา ตัวละครเอเชีย (~70 credits)",
            "",
            "2. โมเดลสร้างวิดีโอ (Video Models):",
            "   - Grok Imagine Video 1.5 (model: 'grok-imagine-video-1-5-preview') — วิดีโอไดนามิกสูง มีชีวิตชีวา เคลื่อนไหวเร็ว (~125 credits)",
            "   - Veo 3.1 Lite / Fast (model: 'veo3/generate-veo-3-video-lite' หรือ 'veo3/generate-veo-3-video-fast') — วิดีโอ Cinematic ภาพยนตร์ ฟิสิกส์สมจริง (~150-300 credits)",
            "   - Gemini Omni Flash 1.1 (model: 'gemini-omni-flash-1-1') — ประมวลผลไว เชื่อมโยง prompt มัลติโมดอลได้ดีเยี่ยม (~315 credits)",
            "",
            "*(หากไม่ระบุ model ระบบจะเลือกโมเดลแนะนำที่เหมาะสมที่สุดให้อัตโนมัติ)*",
            "",
            "💳 หลักเกณฑ์การหักเครดิต:",
            "ระบบจะคำนวณราคาตาม Pricing Tiers ของแต่ละโมเดล อิงตาม aspect_ratio, resolution, duration_seconds และ num_images เหมือนระบบบนเว็บทุกประการ",
            "หากเครดิตไม่เพียงพอ ระบบจะแจ้งเตือนจำนวนที่ต้องการและยอดคงเหลือ",
            "",
            "ดูโมเดลทั้งหมดได้ที่ tool: smartspec.media.models.list หรือ resource: smartaihub://help/media-generate",
          ].join("\n"),
        },
      ],
      structuredContent: {
        topic: "media.generate",
        recommended_image_models: [
          { model_id: "gpt-image-2-text-to-image", name: "GPT Image 2", credit_cost: 70 },
          { model_id: "google-banana-2-lite", name: "Nano Banana 2 Lite", credit_cost: 35 },
          { model_id: "google/nano-banana-pro", name: "Nano Banana Pro", credit_cost: 90 },
          { model_id: "seedream/5-pro-text-to-image", name: "Seedream 5.0 Pro", credit_cost: 70 },
        ],
        recommended_video_models: [
          { model_id: "grok-imagine-video-1-5-preview", name: "Grok Imagine Video 1.5 Preview", credit_cost: 125 },
          { model_id: "veo3/generate-veo-3-video-lite", name: "Veo 3.1 Lite", credit_cost: 150 },
          { model_id: "gemini-omni-flash-1-1", name: "Gemini Omni Flash 1.1", credit_cost: 315 },
        ],
        resource_uri: "smartaihub://help/media-generate",
      },
    };
  }

  if (topic === "media.models" || topic === "media-models" || topic === "models") {
    return {
      content: [
        {
          type: "text",
          text: [
            "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server — Media Models",
            "",
            "สำหรับการดูโมเดลทั้งหมดในระบบ ให้เรียก tool smartspec.media.models.list (หรือ alias smartaihub_media_models_list)",
            "สามารถระบุ { type: 'image' } หรือ { type: 'video' } เพื่อกรองชนิดได้",
            "",
            "ดูรายละเอียดเพิ่มเติมได้ที่ resource: smartaihub://help/media-models",
          ].join("\n"),
        },
      ],
      structuredContent: {
        topic: "media.models",
        canonical_tool: "smartspec.media.models.list",
        resource_uri: "smartaihub://help/media-models",
      },
    };
  }

  if (topic === "media.history" || topic === "media-history" || topic === "history") {
    return {
      content: [
        {
          type: "text",
          text: [
            "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server — Media History",
            "",
            "สำหรับการค้นหาประวัติงานสร้างสื่อใน Media History ให้ใช้ smartspec.media.history.list (หรือ alias smartaihub_media_history_search)",
            "ตัวกรองที่รองรับ:",
            "- query: ค้นหาคำใน Prompt",
            "- media_type: image, video, audio (หรือ รูปภาพ, วิดีโอ)",
            "- model: กรองตามชื่อหรือรหัสโมเดล",
            "- status: completed, pending, processing, failed",
            "- from_date / to_date: ช่วงเวลา (ISO string)",
            "- recent_days: จำนวนวันที่ผ่านมา เช่น 1, 3, 7, 15, 30",
            "- limit / offset: สำหรับแบ่งหน้าผลลัพธ์",
            "",
            "การเปิดดูรายละเอียดงานรายตัว:",
            "เรียก smartspec.media.history.get (หรือ alias smartaihub_media_history_get) โดยส่ง task_id",
            "",
            "ดูรายละเอียดเพิ่มเติมได้ที่ resource: smartaihub://help/media-history",
          ].join("\n"),
        },
      ],
      structuredContent: {
        topic: "media.history",
        canonical_tool: "smartspec.media.history.list",
        supported_filters: ["query", "media_type", "model", "status", "from_date", "to_date", "recent_days", "limit", "offset"],
        resource_uri: "smartaihub://help/media-history",
      },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: [
          "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server",
          "ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง",
          "",
          "หัวข้อความช่วยเหลือที่พร้อมใช้งาน:",
          "- library.search: คู่มือและตัวอย่าง filter สำหรับ smartaihub_library_search",
          "- library.files: การเปิดไฟล์และดาวน์โหลดผ่าน smartaihub_library_get_file",
          "- media.generate: การสั่งสร้างภาพ/วิดีโอ (Media Studio), โมเดลแนะนำ และการหักเครดิต",
          "- media.models: รายการโมเดลสร้างภาพและวิดีโอ พร้อมราคาเครดิต",
          "- media.history: การค้นหาประวัติงานสร้างสื่อและดาวน์โหลดผลลัพธ์",
          "- capabilities: สรุปความสามารถของ SmartAIHub MCP Server",
          "- errors: การแก้ปัญหา error code เช่น UNSUPPORTED_FILTER หรือ Insufficient credits",
          "",
          "สามารถเรียก smartaihub_help พร้อมระบุ topic ที่ต้องการ หรือเปิด MCP Resource smartaihub://help/index",
        ].join("\n"),
      },
    ],
    structuredContent: {
      topics: [
        "library.search",
        "library.files",
        "media.generate",
        "media.models",
        "media.history",
        "capabilities",
        "errors",
      ],
      resources: [
        "smartaihub://help/index",
        "smartaihub://help/library-search",
        "smartaihub://help/library-files",
        "smartaihub://help/media-generate",
        "smartaihub://help/media-models",
        "smartaihub://help/media-history",
        "smartaihub://help/errors",
        "smartaihub://capabilities",
        "smartaihub://schema/library-search",
        "smartaihub://schema/media-generate",
      ],
    },
  };
}

function safeMediaHistoryTask(task: any): Record<string, unknown> {
  const resultData = task?.resultData && typeof task.resultData === "object" ? task.resultData : {};
  const durablePlayback = Array.isArray(task?.artifacts)
    && task.artifacts.some((artifact: any) => artifact?.r2Status === "ready" && typeof artifact?.r2Url === "string");
  const rawUrl = task.resultUrl
    || (Array.isArray(task.artifacts) ? task.artifacts.find((a: any) => typeof a?.r2Url === "string")?.r2Url : undefined)
    || (typeof resultData.url === "string" ? resultData.url : undefined);
  return {
    id: task.id,
    media_type: task.mediaType,
    status: task.status,
    model: task.model,
    prompt: typeof task.prompt === "string" ? task.prompt.slice(0, 2_000) : "",
    created_at: task.createdAt,
    started_at: task.startedAt ?? null,
    completed_at: task.completedAt ?? null,
    error: task.errorMessage ?? null,
    credits_used: task.creditsUsed ?? null,
    download_available: task.status === "completed" && Boolean(durablePlayback || task.resultUrl?.startsWith?.("/api/storage/files/")),
    resource_uri: `smartaihub://media/tasks/${task.id}`,
    result_url: task.status === "completed" ? (rawUrl ?? null) : null,
    thumbnail_url: task.status === "completed" ? (rawUrl ?? null) : null,
  };
}

function resolveMcpManagedDownloadTarget(rawTarget: unknown) {
  const target = resolveExportDownloadTarget(rawTarget);
  if (!target) return null;
  if (target.kind === "file") return target;
  if (target.kind === "storage") return target;
  try {
    const parsed = new URL(target.url);
    if (parsed.pathname.startsWith("/api/storage/files/") || parsed.pathname.startsWith("/uploads/")) {
      return target;
    }
  } catch {
    // resolveExportDownloadTarget already validated the URL; fail closed here.
  }
  return null;
}

const RECOMMENDED_MEDIA_MODELS = new Set([
  "gpt-image-2-text-to-image",
  "google-banana-2-lite",
  "google/nano-banana-pro",
  "seedream/5-pro-text-to-image",
  "grok-imagine-video-1-5-preview",
  "veo3/generate-veo-3-video-lite",
  "gemini-omni-flash-1-1",
]);

function getMediaModelRecommendationNote(modelId: string): string {
  switch (modelId) {
    case "gpt-image-2-text-to-image":
      return "โมเดลสร้างภาพคุณภาพสูงมาก เข้าใจ Prompt ซับซ้อน วาดตัวอักษร Text บนภาพได้แม่นยำ";
    case "google-banana-2-lite":
      return "โมเดลสร้างภาพสมจริง Hyper-realistic, Semantic Narrative, ทำงานรวดเร็วและประหยัดเครดิต";
    case "google/nano-banana-pro":
      return "โมเดลภาพสมจริงระดับ Pro แสงเงาฟิสิกส์แม่นยำ เหมาะกับภาพระดับ Studio";
    case "seedream/5-pro-text-to-image":
      return "โมเดลภาพความคมชัดสูง สไตล์งานโฆษณา คอมเมิร์ซ และตัวละครเอเชีย";
    case "grok-imagine-video-1-5-preview":
      return "โมเดลสร้างวิดีโอไดนามิกสูง เคลื่อนไหวเร็ว มีชีวิตชีวาและทรงพลัง";
    case "veo3/generate-veo-3-video-lite":
      return "โมเดลวิดีโอระดับ Cinematic ฟิสิกส์สมจริง มุมกล้องลื่นไหลระดับภาพยนตร์";
    case "gemini-omni-flash-1-1":
      return "โมเดลวิดีโอประมวลผลไว เชื่อมโยง prompt มัลติโมดอลได้ยอดเยี่ยม";
    default:
      return "";
  }
}

async function listMediaModels(
  args: Record<string, unknown>,
  _ctx: McpExecutionContext,
): Promise<unknown> {
  const typeFilter = typeof args.type === "string" ? args.type.trim().toLowerCase() : undefined;
  let db: any = null;
  try {
    db = getDb();
  } catch {
    db = null;
  }
  let rows: Array<any> = [];
  if (db) {
    try {
      const conditions = [eq(mediaModels.isEnabled, true)];
      if (typeFilter && ["image", "video", "audio"].includes(typeFilter)) {
        conditions.push(eq(mediaModels.modelType, typeFilter as any));
      }
      rows = await db
        .select({
          modelId: mediaModels.modelId,
          name: mediaModels.name,
          modelType: mediaModels.modelType,
          provider: mediaModels.provider,
          description: mediaModels.description,
          creditCost: mediaModels.creditCost,
          aspectRatios: mediaModels.aspectRatios,
          sizes: mediaModels.sizes,
          durations: mediaModels.durations,
          sortOrder: mediaModels.sortOrder,
          priority: mediaModels.priority,
        })
        .from(mediaModels)
        .where(and(...conditions))
        .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority), asc(mediaModels.name));
    } catch {
      rows = [];
    }
  }

  const models = rows.map((r) => ({
    model_id: r.modelId,
    name: r.name,
    type: r.modelType,
    provider: r.provider,
    credit_cost: r.creditCost,
    aspect_ratios: r.aspectRatios,
    sizes: r.sizes,
    durations: r.durations,
    is_recommended: RECOMMENDED_MEDIA_MODELS.has(r.modelId),
    recommendation_note: getMediaModelRecommendationNote(r.modelId),
  }));

  const recommendedList = models.filter((m) => m.is_recommended);

  const summaryLines = [
    "รายการโมเดลสร้างสื่อ (Media Models) ในระบบ SmartAIHub:",
    "",
    "🌟 โมเดลแนะนำยอดนิยม (Recommended Top Picks):",
    ...(recommendedList.length > 0
      ? recommendedList.map((m) => `- [${m.type.toUpperCase()}] ${m.name} (model: "${m.model_id}", cost: ~${m.credit_cost} credits)\n  ${m.recommendation_note}`)
      : [
          "- [IMAGE] GPT Image 2 (model: 'gpt-image-2-text-to-image', cost: ~70 credits) — คุณภาพสูงมาก เข้าใจ prompt ซับซ้อน วาด text ได้",
          "- [IMAGE] Nano Banana 2 Lite (model: 'google-banana-2-lite', cost: ~35 credits) — สมจริง Hyper-realistic ไวและประหยัด",
          "- [IMAGE] Seedream 5.0 Pro (model: 'seedream/5-pro-text-to-image', cost: ~70 credits) — คมชัดสูง สไตล์คอมเมิร์ซ โฆษณา",
          "- [VIDEO] Grok Imagine Video 1.5 (model: 'grok-imagine-video-1-5-preview', cost: ~125 credits) — ไดนามิกสูง เคลื่อนไหวเร็ว",
          "- [VIDEO] Veo 3.1 Lite (model: 'veo3/generate-veo-3-video-lite', cost: ~150 credits) — วิดีโอ Cinematic มุมกล้องสมจริง",
          "- [VIDEO] Gemini Omni Flash 1.1 (model: 'gemini-omni-flash-1-1', cost: ~315 credits) — ประมวลผลไว prompt มัลติโมดอล",
        ]),
    "",
    `พบโมเดลทั้งหมด ${models.length} โมเดลที่เปิดใช้งาน สามารถระบุ model ในการสั่งสร้างภาพ/วิดีโอได้`,
  ];

  return {
    content: [{ type: "text", text: summaryLines.join("\n") }],
    structuredContent: {
      total: models.length,
      recommended: recommendedList,
      models,
    },
  };
}

async function listMediaHistory(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const limit = Math.min(100, Math.max(1, Number(args.limit) || Number(args.page_size) || 50));
  const offset = Math.max(0, Number(args.offset) || Number(args.skip) || 0);

  // Normalize mediaType with Thai synonyms
  let mediaType: "image" | "video" | "audio" | undefined = undefined;
  const rawMediaType = typeof args.media_type === "string" ? args.media_type.trim().toLowerCase() : undefined;
  if (rawMediaType) {
    if (["image", "img", "รูป", "รูปภาพ", "ภาพ"].includes(rawMediaType)) mediaType = "image";
    else if (["video", "vid", "วิดีโอ", "คลิป"].includes(rawMediaType)) mediaType = "video";
    else if (["audio", "sound", "voice", "เสียง"].includes(rawMediaType)) mediaType = "audio";
  }

  const status = typeof args.status === "string" ? args.status.trim() : undefined;
  const query = typeof args.query === "string"
    ? args.query.trim().toLowerCase()
    : (typeof args.search === "string" ? args.search.trim().toLowerCase() : undefined);
  const modelFilter = typeof args.model === "string" ? args.model.trim().toLowerCase() : undefined;

  // Date filters
  let fromDate: Date | undefined;
  let toDate: Date | undefined;
  if (typeof args.from_date === "string" || typeof args.fromDate === "string") {
    const parsed = new Date((args.from_date ?? args.fromDate) as string);
    if (!Number.isNaN(parsed.getTime())) fromDate = parsed;
  }
  if (typeof args.to_date === "string" || typeof args.toDate === "string") {
    const parsed = new Date((args.to_date ?? args.toDate) as string);
    if (!Number.isNaN(parsed.getTime())) toDate = parsed;
  }
  const recentDays = Number(args.recent_days ?? args.recentDays);
  let recentCutoff: Date | undefined;
  if (Number.isFinite(recentDays) && recentDays > 0) {
    recentCutoff = new Date(Date.now() - recentDays * 86_400_000);
  }

  const tenantId = ctx.session.tenantId;
  const internalToken = createInternalTokenFromAuth(
    { userId: ctx.session.userId, tenantId },
    ["media:read"],
  );

  // Fetch from all sources
  const [providerResult, deferredTasks, mcpTasks, hermesTasks] = await Promise.all([
    mediaGenerationService.listTasks(internalToken, { mediaType, status: status as any, limit: 100 }).catch(() => ({ tasks: [] })),
    listDeferredMediaTasks(ctx.session.userId, 100, tenantId).catch(() => []),
    listMcpMediaTasks({ userId: ctx.session.userId, tenantId: ctx.session.tenantId, mediaType, status: status as any, limit: 100 }).catch(() => []),
    listHermesMediaTasks({ userId: ctx.session.userId, tenantId: ctx.session.tenantId, mediaType, status: status as any, limit: 100 }).catch(() => []),
  ]);

  const allRawTasks = [
    ...(providerResult.tasks ?? []),
    ...deferredTasks,
    ...hermesTasks,
    ...mcpTasks,
  ];

  // Filter tasks
  const filtered = allRawTasks.filter((task) => {
    if (mediaType && task.mediaType !== mediaType) return false;
    if (status && task.status !== status) return false;
    if (query) {
      const promptText = String(task.prompt ?? "").toLowerCase();
      if (!promptText.includes(query)) return false;
    }
    if (modelFilter) {
      const taskModel = String(task.model ?? "").toLowerCase();
      if (!taskModel.includes(modelFilter)) return false;
    }
    const createdAtTime = Date.parse(task.createdAt);
    if (Number.isFinite(createdAtTime)) {
      if (fromDate && createdAtTime < fromDate.getTime()) return false;
      if (toDate && createdAtTime > toDate.getTime()) return false;
      if (recentCutoff && createdAtTime < recentCutoff.getTime()) return false;
    }
    return true;
  });

  // Sort descending by createdAt
  filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit).map(safeMediaHistoryTask);
  const hasMore = offset + limit < total;

  const summaryLines = [
    `พบประวัติการสั่งสร้างสื่อ ${paged.length} รายการ (จากทั้งหมด ${total} รายการ)`,
    ...(query ? [`- คำค้นหา: "${query}"`] : []),
    ...(mediaType ? [`- ชนิด: ${mediaType}`] : []),
    ...(modelFilter ? [`- โมเดล: ${modelFilter}`] : []),
    "",
    ...paged.map((t, idx) => {
      const promptSnippet = t.prompt ? `\n   Prompt: "${(t.prompt as string).slice(0, 80)}..."` : "";
      return `${offset + idx + 1}. [${String(t.media_type).toUpperCase()}] ${t.model || "Unknown"} — สถานะ: ${t.status} (Task ID: ${t.id})${promptSnippet}`;
    }),
  ];

  return {
    content: [{ type: "text", text: summaryLines.join("\n") }],
    structuredContent: {
      tasks: paged,
      total,
      limit,
      offset,
      has_more: hasMore,
      applied_filters: {
        media_type: mediaType,
        status,
        query,
        model: modelFilter,
        from_date: fromDate?.toISOString(),
        to_date: toDate?.toISOString(),
        recent_days: Number.isFinite(recentDays) && recentDays > 0 ? recentDays : undefined,
      },
      available_next_actions: [
        "ตรวจสอบรายละเอียดงานด้วย smartspec.media.history.get หรือ smartaihub_media_history_get โดยระบุ task_id",
        "ดาวน์โหลดไฟล์ผลลัพธ์ด้วย smartspec.media.history.download โดยระบุ task_id",
      ],
    },
  };
}

async function getMediaHistoryTask(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
  if (!taskId) throw new Error("task_id is required");
  const task = taskId.startsWith("mcp_")
    ? await getMcpMediaTask(taskId, ctx.session.userId, ctx.session.tenantId)
    : taskId.startsWith("hermes_")
      ? await getHermesMediaTask(taskId, ctx.session.userId, { tenantId: ctx.session.tenantId })
      : await mediaGenerationService.getTask(
        taskId,
        createInternalTokenFromAuth(
          { userId: ctx.session.userId, tenantId: ctx.session.tenantId },
          ["media:read"],
        ),
        { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp.media.history.get" },
      ).catch(() => null);
  if (!task) throw new Error("media_task_not_found");
  const safe = safeMediaHistoryTask(task);
  return {
    content: [
      {
        type: "text",
        text: [
          `รายละเอียดงานสร้างสื่อ (Task ID: ${safe.id})`,
          `- ประเภท: ${safe.media_type}`,
          `- โมเดล: ${safe.model || "Unknown"}`,
          `- สถานะ: ${safe.status}`,
          `- เครดิตที่ใช้: ${safe.credits_used ?? "N/A"}`,
          `- วันที่สร้าง: ${safe.created_at}`,
          safe.prompt ? `- Prompt: "${safe.prompt}"` : "",
          safe.error ? `- ข้อผิดพลาด: ${safe.error}` : "",
          safe.download_available ? "- ไฟล์ผลลัพธ์พร้อมดาวน์โหลด สามารถเรียก smartspec.media.history.download ได้" : "",
        ].filter(Boolean).join("\n"),
      },
    ],
    structuredContent: safe,
  };
}

async function downloadLibraryItem(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const itemId = Number(args.library_item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("library_item_id must be a positive integer");
  if (ctx.session.authMode === "delegated_worker") {
    await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "library_item", resourceId: itemId });
  }
  return createLibraryDownloadRef(itemId, {
    tenantId: ctx.session.tenantId,
    userId: ctx.session.userId,
  });
}

async function downloadMediaHistoryTask(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
  if (!taskId) throw new Error("task_id is required");
  return createMediaTaskDownloadRef(taskId, {
    tenantId: ctx.session.tenantId,
    userId: ctx.session.userId,
  });
}

async function getOwnerLibraryItem(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const rawId = args.item_id ?? args.itemId ?? args.library_item_id ?? args.id;
  const itemId = Number(rawId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("item_id (or library_item_id) must be a positive integer");
  }
  if (ctx.session.authMode === "delegated_worker") {
    await assertDelegatedWorkerGrant(ctx.session as any, {
      grantType: "library_item",
      resourceId: itemId,
    });
  }
  const item = await getLibraryItemById(itemId, {
    userId: ctx.session.userId,
    tenantId: ctx.session.tenantId,
    role: "user",
  } as any);
  if (!item) {
    throw new Error("Library item not found");
  }
  return {
    content: [
      {
        type: "text",
        text: `ไฟล์: ${(item as any).title} (ID: ${(item as any).id}, Type: ${(item as any).itemType}, Status: ${(item as any).status})`,
      },
    ],
    structuredContent: {
      item,
      resource_uri: `smartaihub://library/items/${(item as any).id}`,
      download_command: `smartspec.knowledge.library.download item_id=${(item as any).id}`,
    },
  };
}

function isAgentReadableContextPack(detail: {
  approvedForAgents: boolean;
  readinessStatus: string;
  status?: string;
  archivedAt?: Date | string | null;
}): boolean {
  return detail.approvedForAgents === true
    && detail.readinessStatus === "trusted"
    && detail.status !== "archived"
    && !detail.archivedAt;
}

async function listOwnerLibraryContextPacks(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  await assertKnowledgeVaultSurfaceEnabledAsync(
    "contextPacksDelegatedMcp",
    ctx.session.tenantId,
  );
  try {
    await assertDelegatedWorkerGrant(ctx.session as any, {
      grantType: "library_context_pack",
    });
  } catch (error) {
    incrementLibraryKnowledgeCounter({
      tenantId: ctx.session.tenantId,
      counter: "delegatedUnauthorizedResolveCount",
    });
    recordLibraryKnowledgeLeakageProbe(
      sanitizeLibraryKnowledgeLeakageProbe({
        probeId: `delegated-context-pack-list-${Date.now()}`,
        probeType: "delegated_context_pack_without_grant",
        tenantId: ctx.session.tenantId,
        actorUserId: ctx.session.userId,
        leaked: false,
        blockedReason: "delegated_worker_grant_missing",
      }),
    );
    throw error;
  }

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "read",
  }, async () => {
    const input = {
      query: typeof args.query === "string" ? args.query : undefined,
      approvedForAgents:
        typeof args.approved_for_agents === "boolean"
          ? args.approved_for_agents
          : undefined,
      limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
      offset: Number.isFinite(Number(args.offset)) ? Number(args.offset) : undefined,
    };
    const actor = {
      userId: ctx.session.userId,
      tenantId: ctx.session.tenantId,
      role: "user",
    } as any;

    if (ctx.session.authMode !== "delegated_worker") {
      const packs = await listLibraryContextPacks(input, actor);
      return packs.filter(isAgentReadableContextPack);
    }

    const grantedIds = Array.from(
      new Set(ctx.delegatedManifest?.grantSummary.libraryContextPackIds ?? []),
    );
    const query = input.query?.trim().toLowerCase();
    const filtered = [];

    for (const contextPackId of grantedIds) {
      try {
        await assertDelegatedWorkerGrant(ctx.session as any, {
          grantType: "library_context_pack",
          resourceId: contextPackId,
        });
      } catch {
        continue;
      }

      const detail = await getLibraryContextPack({ id: contextPackId }, actor);
      if (!detail) {
        continue;
      }
      if (!isAgentReadableContextPack(detail)) {
        continue;
      }
      if (
        input.approvedForAgents !== undefined
        && detail.approvedForAgents !== input.approvedForAgents
      ) {
        continue;
      }
      if (
        query
        && !detail.title.toLowerCase().includes(query)
        && !detail.slug.toLowerCase().includes(query)
        && !(detail.description ?? "").toLowerCase().includes(query)
      ) {
        continue;
      }

      filtered.push({
        id: detail.id,
        slug: detail.slug,
        title: detail.title,
        status: detail.status,
        sourceMode: detail.sourceMode,
        approvedForAgents: detail.approvedForAgents,
        readinessStatus: detail.readinessStatus,
        defaultRuntimeTier: detail.defaultRuntimeTier,
        memberCounts: detail.memberCounts,
        estimatedTokenHint: detail.estimatedTokenHint,
        updatedAt: detail.updatedAt,
      });
    }

    const offset = Math.max(0, input.offset ?? 0);
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
    return filtered.slice(offset, offset + limit);
  });
}

async function resolveOwnerLibraryContextPack(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  await assertKnowledgeVaultSurfaceEnabledAsync(
    "contextPacksDelegatedMcp",
    ctx.session.tenantId,
  );
  const contextPackId = Number(args.context_pack_id);
  if (!Number.isInteger(contextPackId) || contextPackId <= 0) {
    throw new Error("context_pack_id must be a positive integer");
  }

  try {
    await assertDelegatedWorkerGrant(ctx.session as any, {
      grantType: "library_context_pack",
      resourceId: contextPackId,
    });
  } catch (error) {
    incrementLibraryKnowledgeCounter({
      tenantId: ctx.session.tenantId,
      counter: "delegatedUnauthorizedResolveCount",
    });
    recordLibraryKnowledgeLeakageProbe(
      sanitizeLibraryKnowledgeLeakageProbe({
        probeId: `delegated-context-pack-resolve-${contextPackId}-${Date.now()}`,
        probeType: "delegated_context_pack_without_grant",
        tenantId: ctx.session.tenantId,
        actorUserId: ctx.session.userId,
        leaked: false,
        blockedReason: "delegated_worker_grant_missing",
        hiddenResourceId: contextPackId,
      }),
    );
    throw error;
  }

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "read",
  }, async () => {
    const actor = {
      userId: ctx.session.userId,
      tenantId: ctx.session.tenantId,
      role: "user",
    } as any;
    const detail = await getLibraryContextPack({ id: contextPackId }, actor);
    if (!detail) {
      throw new Error("Context pack not found");
    }
    if (!isAgentReadableContextPack(detail)) {
      throw new Error(
        "Context pack is not trusted and approved for agent use",
      );
    }

    return resolveLibraryContextPack(
      {
        ref: { id: contextPackId },
        maxItems: Number.isFinite(Number(args.max_items))
          ? Number(args.max_items)
          : undefined,
        tokenBudgetHint: Number.isFinite(Number(args.token_budget_hint))
          ? Number(args.token_budget_hint)
          : undefined,
        includeCitations:
          typeof args.include_citations === "boolean"
            ? args.include_citations
            : true,
        failIfPartial:
          typeof args.fail_if_partial === "boolean"
            ? args.fail_if_partial
            : false,
      },
      actor,
    );
  });
}

async function uploadOwnerLibraryFile(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "library_upload_policy" });
  const fileName = typeof args.file_name === "string" ? args.file_name : "";
  const fileType = typeof args.file_type === "string" ? args.file_type : "";
  const fileBase64 = typeof args.file_base64 === "string" ? args.file_base64 : "";
  if (!fileName || !fileType || !fileBase64) {
    throw new Error("file_name, file_type, and file_base64 are required");
  }
  const normalizedBase64 = fileBase64.includes(",") ? fileBase64.split(",", 2)[1] : fileBase64;
  const estimatedSizeBytes = Buffer.byteLength(normalizedBase64, "base64");
  const estimatedBilling = await calculateLibraryUploadCreditCost(fileType, estimatedSizeBytes);

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits: estimatedBilling.totalCredits,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => uploadLibraryFile(
    {
      fileName,
      fileType,
      fileBase64,
      title: typeof args.title === "string" ? args.title : undefined,
      visibility: args.visibility === "private" || args.visibility === "team" || args.visibility === "public"
        ? args.visibility
        : undefined,
      parentId: Number.isFinite(Number(args.parent_id)) ? Number(args.parent_id) : undefined,
      metadata: {
        ...(args.metadata && typeof args.metadata === "object" ? args.metadata as Record<string, unknown> : {}),
        ownerUserId: ctx.session.userId,
      },
      billingMetadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.knowledge.library.upload", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.knowledge.library.upload",
        estimatedCredits: estimatedBilling.totalCredits,
      }),
    } as any,
    {
      userId: ctx.session.userId,
      tenantId: ctx.session.tenantId,
      role: "user",
    } as any,
  ));
}

async function runOwnerRagSearch(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    throw new Error("query is required");
  }
  await assertDelegatedWorkerGrant(ctx.session as any, {
    grantType: "rag_scope",
    requireScopeFlag: "search",
  });

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "read",
    estimatedCredits: 1,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    const result = await searchLibraryItems(
      {
        query,
        limit: Math.min(MAX_RAG_RESULTS, Math.max(1, Number(args.limit ?? 10))),
        scope: "my_library",
        filters: { ownerUserId: ctx.session.userId },
      } as any,
      {
        userId: ctx.session.userId,
        tenantId: ctx.session.tenantId,
        role: "user",
      } as any,
    );

    const billing = await chargeForRagQuery({
      userId: ctx.session.userId,
      service: "rag.semantic_search",
      tenantId: ctx.session.tenantId,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.knowledge.rag.search", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.knowledge.rag.search",
        query: query.slice(0, 200),
      }),
    });

    return {
      ...result,
      creditsUsed: billing.creditsUsed,
    };
  });
}

async function runOwnerRagIngest(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  await assertDelegatedWorkerGrant(ctx.session as any, {
    grantType: "rag_scope",
    requireScopeFlag: "ingest",
  });

  const sourceType = args.source_type === "library_item" ? "library_item" : "upload";
  if (sourceType === "library_item") {
    const libraryItemId = Number(args.library_item_id);
    if (!Number.isInteger(libraryItemId) || libraryItemId <= 0) {
      throw new Error("library_item_id must be a positive integer");
    }
    await assertDelegatedWorkerGrant(ctx.session as any, {
      grantType: "library_item",
      resourceId: libraryItemId,
    });
    return runWithDelegatedWorkerExecution({
      auth: ctx.session as any,
      actionClass: "compute",
      estimatedCredits: 1,
      idempotencyKey: ctx.idempotencyKey,
    }, async () => {
      const item = await getLibraryItemById(libraryItemId, {
        userId: ctx.session.userId,
        tenantId: ctx.session.tenantId,
        role: "user",
      } as any);
      if (!item) {
        throw new Error("Library item not found");
      }
      await safeEnqueueLibraryIndexJob({
        tenantId: ctx.session.tenantId,
        libraryItemId,
        source: "mcp_worker_rag_ingest",
        sourceMetadata: {
          traceId: crypto.randomUUID(),
          workerJobId: ctx.session.workerJobId ?? null,
          delegatedSessionId: ctx.session.delegatedSessionId ?? null,
        },
      });
      return {
        sourceType,
        library_item_id: libraryItemId,
        status: "queued",
      };
    });
  }

  const uploadResult = await uploadOwnerLibraryFile({
    file_name: args.file_name,
    file_type: args.file_type,
    file_base64: args.file_base64,
    title: args.title,
    visibility: args.visibility,
    parent_id: args.parent_id,
    metadata: args.metadata,
  }, ctx);

  const libraryItemId = Number((uploadResult as any)?.item?.id ?? (uploadResult as any)?.itemId);
  if (libraryItemId > 0) {
    await safeEnqueueLibraryIndexJob({
      tenantId: ctx.session.tenantId,
      libraryItemId,
      source: "mcp_worker_rag_ingest",
      sourceMetadata: {
        traceId: crypto.randomUUID(),
        workerJobId: ctx.session.workerJobId ?? null,
        delegatedSessionId: ctx.session.delegatedSessionId ?? null,
      },
    });
  }

  return {
    sourceType,
    status: "queued",
    upload: uploadResult,
    library_item_id: libraryItemId || null,
  };
}

async function listSkills(): Promise<unknown> {
  const skills = await getAvailableSkillsAsync();
  return {
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? "",
      category: skill.category ?? skill.type ?? null,
      tags: skill.tags ?? [],
      executionMode: skill.executionMode ?? "llm-only",
      defaultModel: skill.defaultModel ?? null,
    })),
  };
}

async function getSkill(args: Record<string, unknown>): Promise<unknown> {
  const skillId = typeof args.skill_id === "string" ? args.skill_id : "";
  if (!skillId) {
    throw new Error("skill_id is required");
  }
  const skill = await getSkillByIdAsync(skillId);
  if (!skill) {
    throw new Error("Skill not found");
  }
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? "",
    category: skill.category ?? skill.type ?? null,
    tags: skill.tags ?? [],
    executionMode: skill.executionMode ?? "llm-only",
    defaultModel: skill.defaultModel ?? null,
    creditMultiplier: skill.creditMultiplier ?? 1,
  };
}

async function detectSkillWithPrompt(args: Record<string, unknown>): Promise<unknown> {
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!prompt) {
    throw new Error("prompt is required");
  }
  return detectSkill(prompt);
}

async function executeSkillViaMcp(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const skillId = typeof args.skill_id === "string" ? args.skill_id : "";
  if (!skillId) {
    throw new Error("skill_id is required");
  }
  await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "skill", resourceId: skillId });
  const skill = await getSkillByIdAsync(skillId);
  if (!skill) {
    throw new Error("Skill not found");
  }
  const model = typeof args.model === "string" ? args.model : undefined;
  const inputs = args.inputs && typeof args.inputs === "object" ? args.inputs as Record<string, unknown> : {};
  const estimatedCost = normalizeSkillRevenuePricing(skill).totalCredits;
  const skillRunId = ctx.idempotencyKey ?? crypto.randomUUID();

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits: estimatedCost,
    idempotencyKey: skillRunId,
  }, async () => {
    if (!(await hasEnoughCredits(ctx.session.userId, estimatedCost))) {
      throw new Error("Your account has insufficient credits for this request");
    }
    const prompt = typeof inputs.prompt === "string" ? inputs.prompt : "";
    const { prompt: _prompt, ...rest } = inputs;
    const result = await executeSkill(
      skill,
      {
        prompt,
        model: model ?? skill.defaultModel,
        extraParams: rest,
        runId: skillRunId,
      } as any,
      ctx.session.userId,
      createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }),
      ctx.session.tenantId,
    );

    return {
      result,
      creditsUsed: result.creditsUsed ?? estimatedCost,
    };
  });
}

async function getOrCreateAgencyConversation(
  agencyId: string,
  session: McpToolSession,
): Promise<string> {
  const db = await getDb();
  const existing = await db
    .select({ id: agencyConversations.id })
    .from(agencyConversations)
    .innerJoin(agencies, eq(agencyConversations.agencyId, agencies.id))
    .where(
      and(
        eq(agencyConversations.agencyId, agencyId),
        eq(agencyConversations.userId, session.userId),
        eq(agencyConversations.source, "api"),
        eq(agencies.tenantId, session.tenantId),
        or(isNull(agencyConversations.expiresAt), gt(agencyConversations.expiresAt, new Date())),
      ),
    )
    .limit(1);
  if (existing.length) {
    return existing[0].id;
  }
  const id = crypto.randomUUID();
  await db.insert(agencyConversations).values({
    id,
    agencyId,
    userId: session.userId,
    tenantId: session.tenantId,
    title: "MCP Conversation",
    source: "api",
    apiKeyId: session.apiKeyId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return id;
}

async function verifyAgencyExists(agencyId: string, tenantId: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
    .limit(1);
  if (!rows.length) {
    throw new Error("Agency not found");
  }
}

async function listAgenciesForTenant(session: McpToolSession): Promise<unknown> {
  const db = await getDb();
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(agencies)
    .where(eq(agencies.tenantId, session.tenantId));
  const rows = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      description: agencies.description,
      defaultModel: agencies.defaultModel,
      createdAt: agencies.createdAt,
    })
    .from(agencies)
    .where(eq(agencies.tenantId, session.tenantId))
    .orderBy(agencies.createdAt);
  return {
    total,
    agencies: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      default_model: row.defaultModel ?? null,
      created_at: row.createdAt?.toISOString() ?? null,
    })),
  };
}

async function invokeAgency(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const agencyId = typeof args.agency_id === "string" ? args.agency_id : "";
  const message = typeof args.message === "string" ? args.message : "";
  if (!agencyId || !message) {
    throw new Error("agency_id and message are required");
  }
  await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "agency", resourceId: agencyId });
  await verifyAgencyExists(agencyId, ctx.session.tenantId);

  const maxCredits = Number.isFinite(Number(args.max_credits)) ? Number(args.max_credits) : undefined;
  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits: maxCredits ?? 1,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    const conversationId = typeof args.conversation_id === "string" && args.conversation_id
      ? args.conversation_id
      : await getOrCreateAgencyConversation(agencyId, ctx.session);

    let reservedCredits = 0;
    if (maxCredits && maxCredits > 0) {
      reservedCredits = maxCredits;
      await deductCredits({
        userId: ctx.session.userId,
        amount: reservedCredits,
        sourceType: "api_agency",
        description: `Agency invocation reservation: ${agencyId}`,
        idempotencyKey: ctx.idempotencyKey ?? undefined,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.agencies.invoke", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.agencies.invoke",
          agencyId,
          conversationId,
          reservedCredits,
        }),
      } as any);
    }

    try {
      const result = await agencyBridge.executeRun({
        agencyId,
        conversationId,
        message,
        userToken: createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }),
        tenantId: ctx.session.tenantId,
        userId: ctx.session.userId,
      });

      const creditsUsed = result.creditsUsed ?? 0;
      if (reservedCredits > 0) {
        const unused = Math.max(0, reservedCredits - creditsUsed);
        if (unused > 0) {
          await refundCredits({
            userId: ctx.session.userId,
            amount: unused,
            reason: `Agency invocation refund: used ${creditsUsed} of ${reservedCredits} reserved`,
          } as any);
        }
      } else if (creditsUsed > 0) {
        await deductCredits({
          userId: ctx.session.userId,
          amount: creditsUsed,
          sourceType: "api_agency",
          description: `Agency invocation: ${agencyId}`,
          idempotencyKey: ctx.idempotencyKey ?? undefined,
          metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.agencies.invoke", {
            endpoint: "/v1/mcp",
            toolName: "smartspec.agencies.invoke",
            agencyId,
            conversationId,
            actualCreditsUsed: creditsUsed,
          }),
        } as any);
      }

      return {
        run_id: result.runId,
        conversation_id: conversationId,
        status: result.status,
        response: result.response,
        credits_used: creditsUsed,
      };
    } catch (error) {
      if (reservedCredits > 0) {
        await refundCredits({
          userId: ctx.session.userId,
          amount: reservedCredits,
          reason: `Agency invocation failed — full reservation refund: ${agencyId}`,
        } as any).catch(() => {});
      }
      throw error;
    }
  });
}

async function getAgencyRunStatus(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const agencyId = typeof args.agency_id === "string" ? args.agency_id : "";
  const runId = typeof args.run_id === "string" ? args.run_id : "";
  if (!agencyId || !runId) {
    throw new Error("agency_id and run_id are required");
  }
  await verifyAgencyExists(agencyId, ctx.session.tenantId);
  const result = await agencyBridge.getRunDetails(
    agencyId,
    runId,
    createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }),
  );
  return {
    run_id: result.runId,
    status: result.status,
    response: result.response,
    credits_used: result.creditsUsed,
    duration_ms: result.durationMs,
    started_at: result.startedAt ?? null,
    completed_at: result.completedAt ?? null,
  };
}

async function resolveMediaModelAndPricing(
  mediaType: "image" | "video",
  requestedModel: string | undefined,
  promptText: string,
  selections: {
    aspectRatio?: string;
    size?: string;
    resolution?: string;
    numImages?: number;
    duration?: number;
  },
): Promise<{
  modelId: string;
  modelName: string;
  provider: string;
  creditCost: number;
}> {
  const modelHint = inferMediaModelHintFromText(mediaType, requestedModel || promptText);
  const selection = await resolveEnabledMediaModelSelection({
    mediaType,
    requestedModel: requestedModel || modelHint,
    requireConfiguredProvider: true,
    allowSubstitution: true,
  });

  if (selection.ok) {
    const cost = calculateCreditCost(selection.model, {
      aspectRatio: selections.aspectRatio,
      size: selections.size,
      resolution: selections.resolution,
      numImages: selections.numImages,
      duration: selections.duration,
    });
    return {
      modelId: selection.modelId,
      modelName: selection.name,
      provider: selection.provider,
      creditCost: Math.max(1, cost),
    };
  }

  if (selection.reasonCode !== "media_registry_unavailable") {
    throw new Error(`${selection.reasonCode}: ${selection.message}`);
  }

  const fallbackModel = mediaType === "image" ? "gpt-image-2-text-to-image" : "grok-imagine-video-1-5-preview";
  const fallbackName = mediaType === "image" ? "GPT Image 2" : "Grok Imagine Video 1.5 Preview";
  const defaultCost = mediaType === "image" ? 70 : 125;
  return {
    modelId: requestedModel || fallbackModel,
    modelName: fallbackName,
    provider: "kie.ai",
    creditCost: defaultCost,
  };
}

async function generateMedia(
  kind: "image" | "video" | "audio",
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const requestedHermes = args.provider === "hermes" || typeof args.connection_id === "string";
  if (requestedHermes) {
    if (kind === "audio") throw new Error("hermes_audio_not_supported");
    if (!ctx.session.scopes.includes("hermes:generate")) throw new Error("hermes_generate_scope_required");
    const references = Array.isArray(args.reference_image_urls)
      ? args.reference_image_urls.filter((value): value is string => typeof value === "string").slice(0, 9)
      : undefined;
    return executeHermesMedia({
      operation: kind === "image"
        ? (references?.length ? "image.edit" : "image.generate")
        : (references?.length ? "video.image_to_video" : "video.generate"),
      connection_id: args.connection_id,
      model: args.model,
      prompt: args.prompt,
      reference_image_urls: references,
      duration_seconds: args.duration_seconds,
    }, ctx);
  }
  const userToken = createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate"]);
  const idempotencyKey = ctx.idempotencyKey ?? undefined;
  const references = Array.isArray(args.reference_image_urls)
    ? args.reference_image_urls.filter((item): item is string => typeof item === "string")
    : undefined;

  if (kind === "image") {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      throw new Error("prompt is required");
    }
    const requestedModel = typeof args.model === "string" ? args.model.trim() : undefined;
    const aspectRatio = typeof args.aspect_ratio === "string" ? args.aspect_ratio.trim() : undefined;
    const size = typeof args.size === "string" ? args.size.trim() : (
      Number.isFinite(Number(args.width)) && Number.isFinite(Number(args.height))
        ? `${args.width}x${args.height}`
        : undefined
    );
    const resolution = typeof args.resolution === "string" ? args.resolution.trim() : undefined;
    const numImages = Number.isFinite(Number(args.num_images)) ? Math.max(1, Number(args.num_images)) : 1;

    const resolved = await resolveMediaModelAndPricing("image", requestedModel, prompt, {
      aspectRatio,
      size,
      resolution,
      numImages,
    });

    const hasCredits = await hasEnoughCredits(ctx.session.userId, resolved.creditCost);
    if (!hasCredits) {
      const balance = await getCreditBalance(ctx.session.userId).catch(() => 0);
      throw new Error(`Insufficient credits. Required: ${resolved.creditCost}, Current balance: ${balance}`);
    }

    return runWithDelegatedWorkerExecution({
      auth: ctx.session as any,
      actionClass: "media",
      estimatedCredits: resolved.creditCost,
      idempotencyKey,
    }, async () => {
      const task = await mediaGenerationService.generateImageAsync({
        prompt,
        model: resolved.modelId,
        size,
        aspectRatio,
        resolution,
        numImages,
        referenceImageUrls: references,
        auditContext: { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp" },
      }, userToken);

      await deductCredits({
        userId: ctx.session.userId,
        amount: resolved.creditCost,
        sourceType: "media_image",
        description: `Image generation: ${resolved.modelName}`,
        idempotencyKey,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.media.generate_image", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.media.generate_image",
          modelId: resolved.modelId,
          modelName: resolved.modelName,
          creditCost: resolved.creditCost,
        }),
      } as any);

      return {
        content: [
          {
            type: "text",
            text: [
              `สั่งสร้างรูปภาพสำเร็จ (Task ID: ${task.id})`,
              `- โมเดล: ${resolved.modelName} (${resolved.modelId})`,
              `- สถานะ: ${task.status}`,
              `- เครดิตที่หัก: ${resolved.creditCost} credits`,
              `สามารถตรวจสอบสถานะและดูผลลัพธ์ด้วย smartspec.media.history.get หรือ smartaihub_media_history_get โดยระบุ task_id: "${task.id}"`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          task_id: task.id,
          status: task.status,
          media_type: "image",
          model: resolved.modelId,
          model_name: resolved.modelName,
          credits_charged: resolved.creditCost,
          check_status_command: "smartspec.media.history.get",
        },
      };
    });
  }

  if (kind === "video") {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      throw new Error("prompt is required");
    }
    const requestedModel = typeof args.model === "string" ? args.model.trim() : undefined;
    const aspectRatio = typeof args.aspect_ratio === "string" ? args.aspect_ratio.trim() : undefined;
    const duration = Number.isFinite(Number(args.duration_seconds))
      ? Number(args.duration_seconds)
      : (Number.isFinite(Number(args.duration)) ? Number(args.duration) : undefined);
    const resolution = typeof args.resolution === "string" ? args.resolution.trim() : undefined;
    const fps = Number.isFinite(Number(args.fps)) ? Number(args.fps) : undefined;
    const refVideoUrls = Array.isArray(args.reference_video_urls)
      ? args.reference_video_urls.filter((item): item is string => typeof item === "string")
      : undefined;

    const resolved = await resolveMediaModelAndPricing("video", requestedModel, prompt, {
      aspectRatio,
      duration,
      resolution,
    });

    const hasCredits = await hasEnoughCredits(ctx.session.userId, resolved.creditCost);
    if (!hasCredits) {
      const balance = await getCreditBalance(ctx.session.userId).catch(() => 0);
      throw new Error(`Insufficient credits. Required: ${resolved.creditCost}, Current balance: ${balance}`);
    }

    return runWithDelegatedWorkerExecution({
      auth: ctx.session as any,
      actionClass: "media",
      estimatedCredits: resolved.creditCost,
      idempotencyKey,
    }, async () => {
      const task = await mediaGenerationService.generateVideoAsync({
        prompt,
        model: resolved.modelId,
        duration,
        aspectRatio,
        resolution,
        fps,
        referenceImageUrls: references,
        referenceVideoUrls: refVideoUrls,
        auditContext: { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp" },
      }, userToken);

      await deductCredits({
        userId: ctx.session.userId,
        amount: resolved.creditCost,
        sourceType: "media_video",
        description: `Video generation: ${resolved.modelName}`,
        idempotencyKey,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.media.generate_video", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.media.generate_video",
          modelId: resolved.modelId,
          modelName: resolved.modelName,
          creditCost: resolved.creditCost,
        }),
      } as any);

      return {
        content: [
          {
            type: "text",
            text: [
              `สั่งสร้างวิดีโอสำเร็จ (Task ID: ${task.id})`,
              `- โมเดล: ${resolved.modelName} (${resolved.modelId})`,
              `- สถานะ: ${task.status}`,
              `- เครดิตที่หัก: ${resolved.creditCost} credits`,
              `สามารถตรวจสอบสถานะและดูผลลัพธ์ด้วย smartspec.media.history.get หรือ smartaihub_media_history_get โดยระบุ task_id: "${task.id}"`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          task_id: task.id,
          status: task.status,
          media_type: "video",
          model: resolved.modelId,
          model_name: resolved.modelName,
          credits_charged: resolved.creditCost,
          check_status_command: "smartspec.media.history.get",
        },
      };
    });
  }

  const text = typeof args.text === "string" ? args.text : "";
  if (!text) {
    throw new Error("text is required");
  }
  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "media",
    estimatedCredits: 1,
    idempotencyKey,
  }, async () => {
    const task = await mediaGenerationService.generateAudioAsync({
      text,
      voice: typeof args.voice === "string" ? args.voice : undefined,
      model: typeof args.model === "string" ? args.model : undefined,
      speed: Number.isFinite(Number(args.speed)) ? Number(args.speed) : undefined,
      auditContext: { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp" },
    }, userToken);

    await deductCredits({
      userId: ctx.session.userId,
      amount: 1,
      sourceType: "api_media",
      description: `Audio generation: ${text.slice(0, 50)}`,
      idempotencyKey,
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.media.generate_audio", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.media.generate_audio",
      }),
    } as any);

    return { task_id: task.id, status: task.status };
  });
}

async function getMediaStatus(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const taskId = typeof args.task_id === "string" ? args.task_id : "";
  if (!taskId) {
    throw new Error("task_id is required");
  }
  const task = await mediaGenerationService.getTask(
    taskId,
    createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate"]),
    { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp.media.status" },
  );
  return {
    id: task.id,
    status: task.status,
    media_type: task.mediaType,
    credits_used: task.creditsUsed ?? null,
    error: task.errorMessage ?? null,
  };
}

async function cancelMediaTask(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
  if (!taskId) throw new Error("task_id is required");
  const user = await getUserById(ctx.session.userId);
  if (!user) throw new Error("user_not_found");
  const caller = mediaRouter.createCaller({
    req: { ip: "127.0.0.1", headers: {} } as any,
    res: {} as any,
    user,
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    tenantId: ctx.session.tenantId,
    publicUrl: "https://smartaihub.app",
  });
  const result = await caller.cancelTask({ taskId });
  return { task_id: taskId, status: result.status ?? "canceled" };
}

async function createMcpJob(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const type = typeof args.type === "string" ? args.type : "";
  if (!type) {
    throw new Error("type is required");
  }
  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits: Number.isFinite(Number(args.max_credits)) ? Number(args.max_credits) : 1,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    const job = await createJob(
      {
        type: type as any,
        params: args.params && typeof args.params === "object" ? args.params as Record<string, unknown> : {},
        idempotencyKey: ctx.idempotencyKey ?? undefined,
        maxCredits: Number.isFinite(Number(args.max_credits)) ? Number(args.max_credits) : undefined,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.jobs.submit", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.jobs.submit",
          jobType: type,
        }),
      } as any,
      {
        userId: ctx.session.userId,
        tenantId: ctx.session.tenantId,
        apiKeyId: ctx.session.apiKeyId ?? "",
      },
    );
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      credits_reserved: job.creditsReserved,
      created_at: job.createdAt,
    };
  });
}

async function listMcpJobs(ctx: McpExecutionContext): Promise<unknown> {
  const { jobs, total } = await listJobs(ctx.session.tenantId, {});
  return { total, jobs };
}

async function getMcpJob(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const jobId = typeof args.job_id === "string" ? args.job_id : "";
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const job = await getJob(jobId, ctx.session.tenantId);
  if (!job) {
    throw new Error("Job not found");
  }
  return job;
}

async function cancelMcpJob(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const jobId = typeof args.job_id === "string" ? args.job_id : "";
  if (!jobId) {
    throw new Error("job_id is required");
  }
  const job = await cancelJob(jobId, ctx.session.tenantId, ctx.session.userId);
  return { id: job.id, status: "cancelled" };
}

async function createPresentation(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const topic = typeof args.topic === "string" ? args.topic : typeof args.prompt === "string" ? args.prompt : "";
  const style = typeof args.style === "string" ? args.style : undefined;
  const slideCount = Number.isFinite(Number(args.slide_count)) ? Number(args.slide_count) : 5;
  if (!topic) {
    throw new Error("topic or prompt is required");
  }
  const taskId = crypto.randomUUID();

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "media",
    estimatedCredits: 5,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    const draftParams = await resolveAutoDraftParams(topic, {
      userId: ctx.session.userId,
      tenantId: ctx.session.tenantId,
      traceId: taskId,
    } as any);

    const { item } = await createLibraryItem({
      itemType: "presentation",
      source: "auto_draft",
      title: topic.slice(0, 200),
    } as any, {
      userId: ctx.session.userId,
      tenantId: ctx.session.tenantId,
    } as any);

    const { deck } = await createPresentationDeckForLibraryItem(
      { libraryItemId: item.id, title: topic.slice(0, 200) } as any,
      { userId: ctx.session.userId, tenantId: ctx.session.tenantId } as any,
    );

    await getRedisClient().set(
      `ai_draft_progress:${taskId}`,
      JSON.stringify({
        phase: 0,
        phaseLabel: "Queued",
        slidesCompleted: 0,
        totalSlides: slideCount,
        completed: false,
        userId: ctx.session.userId,
      }),
      "EX",
      300,
    );

    await deductCredits({
      userId: ctx.session.userId,
      amount: 5,
      sourceType: "api_presentation",
      description: `Presentation generation: ${topic.slice(0, 50)}`,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.presentations.create", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.presentations.create",
      }),
    } as any);

    generateAIDraft(
      { deckId: deck.id, topic, style, slideCount, ...draftParams } as any,
      { userId: ctx.session.userId, tenantId: ctx.session.tenantId } as any,
      createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate", "presentation:export"]),
      taskId,
    ).catch(() => {});

    return {
      task_id: taskId,
      deck_id: deck.id,
      status: "pending",
    };
  });
}

async function getPresentation(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const deckId = Number(args.deck_id);
  if (!Number.isInteger(deckId) || deckId <= 0) {
    throw new Error("deck_id must be a positive integer");
  }
  const detail = await getPresentationDeckDetail(deckId, {
    userId: ctx.session.userId,
    tenantId: ctx.session.tenantId,
  } as any);
  return {
    deck_id: detail.deck.id,
    title: detail.deck.title,
    slide_count: detail.slides.length,
    slides: detail.slides.map((slide: any, index: number) => ({
      index,
      content: slide.slideContent ?? {},
      notes: slide.notes ?? "",
    })),
    created_at: detail.deck.createdAt?.toISOString() ?? null,
    updated_at: detail.deck.updatedAt?.toISOString() ?? null,
  };
}

async function getPresentationProgress(args: Record<string, unknown>): Promise<unknown> {
  const taskId = typeof args.task_id === "string" ? args.task_id : "";
  if (!taskId) {
    throw new Error("task_id is required");
  }
  const raw = await getRedisClient().get(`ai_draft_progress:${taskId}`);
  if (!raw) {
    throw new Error("Task not found");
  }
  return JSON.parse(raw);
}

async function exportPresentation(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const deckId = Number(args.deck_id);
  const format = args.format === "pdf" ? "pdf" : "pptx";
  if (!Number.isInteger(deckId) || deckId <= 0) {
    throw new Error("deck_id must be a positive integer");
  }
  const result = await triggerPresentationExport(
    {
      deckId,
      format,
      idempotencyKey: ctx.idempotencyKey ?? `${deckId}-${format}-${ctx.session.userId}`,
    } as any,
    { userId: ctx.session.userId, tenantId: ctx.session.tenantId } as any,
    { userToken: createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate", "presentation:export"]) } as any,
  );
  return {
    export_id: (result as any).exportId,
    status: (result as any).status,
  };
}

async function downloadPresentation(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const deckId = Number(args.deck_id);
  if (!Number.isInteger(deckId) || deckId <= 0) {
    throw new Error("deck_id must be a positive integer");
  }
  const status = await getPresentationExportStatus(
    deckId,
    { userId: ctx.session.userId, tenantId: ctx.session.tenantId } as any,
    createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate", "presentation:export"]),
  );
  if (!status || (status as any).status !== "done") {
    throw new Error("Export not ready");
  }
  const outputUrl = (status as any).outputUrl ?? (status as any).downloadUrl;
  const downloadTarget = resolveMcpManagedDownloadTarget(outputUrl);
  if (!downloadTarget) {
    throw new Error("Export file not available");
  }
  return {
    status: (status as any).status,
    format: (status as any).format ?? "pptx",
    download: downloadTarget,
  };
}

async function createVideoProject(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const title = typeof args.title === "string" ? args.title : "";
  const durationMinutes = Number(args.duration_minutes);
  const quality = args.quality === "draft" || args.quality === "high" ? args.quality : "standard";
  if (!title || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("title and duration_minutes are required");
  }
  const creditsPerMinute = quality === "draft" ? 3 : quality === "high" ? 10 : 5;
  const estimatedCredits = Math.ceil(durationMinutes * creditsPerMinute);
  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "media",
    estimatedCredits,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    await deductCredits({
      userId: ctx.session.userId,
      amount: estimatedCredits,
      sourceType: "api_video_project",
      description: `Video project: ${title.slice(0, 50)}`,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.video_projects.create", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.video_projects.create",
      }),
    } as any);

    const task = await mediaGenerationService.generateVideoAsync(
      {
        prompt: typeof args.prompt === "string" && args.prompt ? args.prompt : title,
        model: typeof args.model === "string" ? args.model : undefined,
        duration: durationMinutes * 60,
      },
      createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate"]),
    );

    return {
      id: task.id,
      status: task.status,
      credits_reserved: estimatedCredits,
      title,
      quality,
      duration_minutes: durationMinutes,
      created_at: task.createdAt,
    };
  });
}

async function getVideoProject(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const projectId = typeof args.project_id === "string" ? args.project_id : typeof args.id === "string" ? args.id : "";
  if (!projectId) {
    throw new Error("project_id is required");
  }
  const task = await mediaGenerationService.getTask(
    projectId,
    createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate"]),
    { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp.video_project.status" },
  );
  return {
    id: task.id,
    status: task.status,
    media_type: task.mediaType,
    model: task.model,
    credits_used: task.creditsUsed ?? null,
    created_at: task.createdAt,
    completed_at: task.completedAt ?? null,
    error: task.errorMessage ?? null,
  };
}

async function downloadVideoProject(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const projectId = typeof args.project_id === "string" ? args.project_id : typeof args.id === "string" ? args.id : "";
  if (!projectId) {
    throw new Error("project_id is required");
  }
  const task = await mediaGenerationService.getTask(
    projectId,
    createInternalTokenFromAuth({ userId: ctx.session.userId, tenantId: ctx.session.tenantId }, ["media:generate"]),
    { userId: ctx.session.userId, tenantId: ctx.session.tenantId, source: "mcp.video_project.download" },
  );
  if (task.status !== "completed" || !task.resultUrl) {
    throw new Error("Export not ready");
  }
  const downloadTarget = resolveMcpManagedDownloadTarget(task.resultUrl);
  if (!downloadTarget) {
    throw new Error("Export file not available");
  }
  return {
    id: task.id,
    status: task.status,
    download: downloadTarget,
  };
}

async function getHermesConnectorStatus(ctx: McpExecutionContext): Promise<unknown> {
  const db = getDb();
  const rows = await db
    .select({
      id: workers.id,
      status: workers.status,
      runtimeVersion: workers.runtimeVersion,
      capabilitiesJson: workers.capabilitiesJson,
      healthSummaryJson: workers.healthSummaryJson,
      lastSeenAt: workers.lastSeenAt,
    })
    .from(workers)
    .where(and(
      eq(workers.tenantId, ctx.session.tenantId),
      eq(workers.runtimeType, "remotion_executor"),
      eq(workers.registeredByUserId, ctx.session.userId),
    ))
    .limit(10);

  const candidates = rows.map((row) => {
    const capabilities = row.capabilitiesJson && typeof row.capabilitiesJson === "object"
      ? row.capabilitiesJson as Record<string, unknown>
      : {};
    const metadata = capabilities.runtimeMetadata && typeof capabilities.runtimeMetadata === "object"
      ? capabilities.runtimeMetadata as Record<string, unknown>
      : {};
    const readiness = metadata.readinessStatus === "ready" ? "ready"
      : metadata.readinessStatus === "blocked" ? "blocked" : "unknown";
    return {
      worker_id: row.id,
      status: row.status,
      readiness,
      runtime_version: row.runtimeVersion,
      runtime_source: typeof metadata.runtimeSource === "string" ? metadata.runtimeSource : null,
      runtime_pack_id: typeof metadata.runtimePackId === "string" ? metadata.runtimePackId : null,
      capability_families: Array.isArray(metadata.capabilityFamilies)
        ? metadata.capabilityFamilies.filter((value): value is string => typeof value === "string").slice(0, 16)
        : [],
      doctor_summary: metadata.doctorSummary && typeof metadata.doctorSummary === "object"
        ? metadata.doctorSummary
        : null,
      last_seen_at: row.lastSeenAt,
      health: row.healthSummaryJson ?? {},
    };
  });
  const ready = candidates.find((candidate) => candidate.status === "online" && candidate.readiness === "ready");
  return {
    connected: Boolean(ready),
    worker: ready ?? candidates[0] ?? null,
    next_action: ready ? null : "Install or start the SmartAIHub Remotion Executor, then run its doctor and connect flow.",
  };
}

async function disconnectHermesAgent(_args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  if (ctx.session.authMode !== "agent_pairing" || !ctx.session.deviceIdHash) {
    throw new Error("hermes_agent_pairing_required");
  }
  await revokeHermesAgentDevice({
    tenantId: ctx.session.tenantId,
    userId: ctx.session.userId,
    deviceIdHash: ctx.session.deviceIdHash,
  });
  return {
    disconnected: true,
    device_id: "revoked",
    next_action: "Run the Hermes Connect flow again to create a new approved device session.",
  };
}

async function createHermesCaller(ctx: McpExecutionContext) {
  const user = await getUserById(ctx.session.userId);
  if (!user) throw new Error("user_not_found");
  return {
    user,
    caller: hermesConnectionsRouter.createCaller({
      req: { ip: "127.0.0.1", headers: {} } as any,
      res: {} as any,
      user,
      userToken: null,
      privateVaultToken: null,
      protectedSurfaceToken: null,
      tenantId: ctx.session.tenantId,
      publicUrl: "https://smartaihub.app",
    }),
  };
}

async function hermesCapabilities(_args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const { caller } = await createHermesCaller(ctx);
  const [availability, connections] = await Promise.all([
    caller.getAvailability(),
    caller.listConnections({}),
  ]);
  return { availability, connections };
}

async function hermesConnectionStatus(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const { caller } = await createHermesCaller(ctx);
  const connectionId = typeof args.connection_id === "string" ? args.connection_id.trim() : "";
  return connectionId
    ? caller.getConnection({ connectionId })
    : caller.listConnections({});
}

async function authorizeHermesConnection(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  if (args.consent_acknowledged !== true) throw new Error("explicit_consent_acknowledged_required");
  const scope = args.scope === "server_shared" || args.scope === "server_personal" || args.scope === "private_worker"
    ? args.scope
    : "";
  if (!scope) throw new Error("scope (server_shared|server_personal|private_worker) is required");
  const { caller } = await createHermesCaller(ctx);
  return caller.startConnect({
    scope,
    consentAcknowledged: true,
    ...(typeof args.worker_id === "string" && args.worker_id.trim() ? { workerId: args.worker_id.trim() } : {}),
    ...(typeof args.label === "string" && args.label.trim() ? { label: args.label.trim() } : {}),
  });
}

async function probeHermesConnection(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const connectionId = typeof args.connection_id === "string" ? args.connection_id.trim() : "";
  if (!connectionId) throw new Error("connection_id is required");
  const testGeneration = args.test_generation === "image" || args.test_generation === "video"
    ? args.test_generation
    : undefined;
  const { caller } = await createHermesCaller(ctx);
  return caller.probe({ connectionId, ...(testGeneration ? { testGeneration } : {}) });
}

async function disconnectHermesConnection(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const connectionId = typeof args.connection_id === "string" ? args.connection_id.trim() : "";
  if (!connectionId) throw new Error("connection_id is required");
  const { caller } = await createHermesCaller(ctx);
  return caller.disconnect({ connectionId });
}

async function executeHermesMedia(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const operation = typeof args.operation === "string" ? args.operation.trim() : "";
  const connectionId = typeof args.connection_id === "string" ? args.connection_id.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const model = typeof args.model === "string" ? args.model.trim() : "";
  if (!connectionId || !prompt) throw new Error("operation, connection_id, and prompt are required");
  const user = await getUserById(ctx.session.userId);
  if (!user) throw new Error("user_not_found");
  const caller = mediaRouter.createCaller({
    req: { ip: "127.0.0.1", headers: {} } as any,
    res: {} as any,
    user,
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    tenantId: ctx.session.tenantId,
    publicUrl: "https://smartaihub.app",
  });
  const references = Array.isArray(args.reference_image_urls)
    ? args.reference_image_urls.filter((value): value is string => typeof value === "string").slice(0, 9)
    : undefined;
  if (operation === "image.generate" || operation === "image.edit") {
    return caller.generateImageAsync({
      prompt,
      ...(model ? { model } : {}),
      transport: "hermes_worker",
      hermesConnectionId: connectionId,
      originSurface: "media_studio",
      ...(references?.length ? { referenceImageUrls: references } : {}),
      ...(ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  }
  if (operation === "video.generate" || operation === "video.image_to_video") {
    return caller.generateVideoAsync({
      prompt,
      ...(model ? { model } : {}),
      transport: "hermes_worker",
      hermesConnectionId: connectionId,
      originSurface: "media_studio",
      ...(references?.length ? { referenceImageUrls: references } : {}),
      ...(Number.isFinite(Number(args.duration_seconds)) ? { duration: Number(args.duration_seconds) } : {}),
      ...(ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  }
  throw new Error("unsupported_hermes_media_operation");
}

async function submitRemotionRender(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const projectId = Number(args.project_id);
  const profile = args.profile === "final" ? "final" : args.profile === "preview" ? "preview" : "";
  if (!Number.isInteger(projectId) || projectId <= 0 || !profile) {
    throw new Error("project_id and profile (preview|final) are required");
  }
  const connector = await getHermesConnectorStatus(ctx) as {
    connected?: boolean;
    worker?: { worker_id?: string } | null;
  };
  const workerId = connector.connected && connector.worker?.worker_id;
  if (!workerId) throw new Error("remotion_executor_not_ready");
  const user = await getUserById(ctx.session.userId);
  if (!user) throw new Error("user_not_found");
  const caller = videoProjectsRouter.createCaller({
    req: {
      ip: "127.0.0.1",
      headers: {},
      smartaihubMcpRemotionExecutor: true,
      smartaihubRemotionWorkerId: workerId,
    } as any,
    res: {} as any,
    user,
    userToken: null,
    privateVaultToken: null,
    protectedSurfaceToken: null,
    tenantId: ctx.session.tenantId,
    publicUrl: "https://smartaihub.app",
  });
  return caller.queueRender({ projectId, profile });
}

async function getRemotionJobStatus(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) throw new Error("job_id is required");
  const detail = await getUserWorkerJobDetail({
    auth: { tenantId: ctx.session.tenantId, userId: ctx.session.userId },
    jobId,
  });
  if (detail.jobType !== "remotion_render_video") throw new Error("remotion_job_not_found");
  return detail;
}

async function cancelRemotionJob(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) throw new Error("job_id is required");
  const detail = await getUserWorkerJobDetail({
    auth: { tenantId: ctx.session.tenantId, userId: ctx.session.userId },
    jobId,
  });
  if (detail.jobType !== "remotion_render_video") throw new Error("remotion_job_not_found");
  return cancelQueuedUserWorkerJob({
    auth: { tenantId: ctx.session.tenantId, userId: ctx.session.userId },
    jobId,
  });
}

async function workspaceReadFile(args: Record<string, unknown>): Promise<unknown> {
  const full = safeJoin(String(args.path || ""));
  assertExtAllowed(full);
  const stat = await fs.stat(full);
  if (!stat.isFile()) {
    throw new Error("Not a file");
  }
  if (stat.size > MAX_READ_BYTES) {
    throw new Error("File too large");
  }
  const content = await fs.readFile(full, "utf-8");
  return { path: String(args.path || ""), content };
}

async function workspaceListDirectory(args: Record<string, unknown>): Promise<unknown> {
  const full = safeJoin(String(args.path || ""));
  const stat = await fs.stat(full);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }
  const entries = await fs.readdir(full, { withFileTypes: true });
  return {
    path: String(args.path || ""),
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    })),
  };
}

async function workspaceWriteFile(args: Record<string, unknown>): Promise<unknown> {
  const full = safeJoin(String(args.path || ""));
  assertExtAllowed(full);
  const content = String(args.content ?? "");
  if (Buffer.byteLength(content, "utf-8") > MAX_WRITE_BYTES) {
    throw new Error("Content too large");
  }
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
  return { ok: true, path: String(args.path || "") };
}

async function forwardDriveTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const runtime = await getAppRuntimeConfig();
  const response = await fetch(`${runtime.pythonBackendUrl}/api/internal/mcp/tools/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(runtime.proxyToken ? { "x-proxy-token": runtime.proxyToken } : {}),
    },
    body: JSON.stringify({
      name: toolName,
      arguments: args,
      user_id: ctx.session.userId,
      tenant_id: ctx.session.tenantId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Python MCP call failed: ${response.status}`);
  }
  return response.json();
}

async function executeBrowserActions(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const enabled = await getTenantFeatureFlag("browserTool", ctx.session.tenantId);
  if (!enabled) {
    throw new Error("Browser MCP is not enabled for this tenant");
  }
  return {
    queued: true,
    message: "Browser MCP remains gated until policy parity is completed",
    actions: Array.isArray(args.actions) ? args.actions.length : 0,
  };
}

function marketplaceActorFromSession(ctx: McpExecutionContext) {
  return {
    tenantId: ctx.session.tenantId,
    userId: ctx.session.userId,
  };
}

async function assertMarketplaceMcpWriteEnabled(
  ctx: McpExecutionContext,
  specificFlag?: "marketplaceIntelligenceImportsEnabled" | "marketplaceIntelligenceReportsEnabled" | "marketplaceIntelligenceWatchlistsEnabled",
) {
  if (!process.env.DATABASE_URL) return;
  const flags = await getTenantFeatureFlags(ctx.session.tenantId);
  if (!flags.marketplaceIntelligenceMcpWritesEnabled || (specificFlag && !flags[specificFlag])) {
    throw Object.assign(new Error("Marketplace Intelligence MCP writes are not enabled for this tenant."), {
      code: -32003,
      flag: specificFlag ?? "marketplaceIntelligenceMcpWritesEnabled",
    });
  }
}

function mcpStringArg(args: Record<string, unknown>, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw Object.assign(new Error(`Missing required string argument: ${key}`), { code: -32602 });
}

function mcpIntegerArg(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = args[key];
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : fallback;
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function marketplaceSessionAuthFromMcp(ctx: McpExecutionContext) {
  return {
    ok: true as const,
    mode: "session" as const,
    user: { id: ctx.session.userId, currentTenantId: ctx.session.tenantId },
    sub: `mcp:${ctx.session.userId}`,
    scopes: ctx.session.scopes,
    tenantId: ctx.session.tenantId,
    userId: ctx.session.userId,
  };
}

function marketplaceWritebackPayloadFromArgs(args: Record<string, unknown>) {
  const nestedPayload = args.payload && typeof args.payload === "object"
    ? args.payload as Record<string, unknown>
    : null;
  if (nestedPayload) {
    return {
      sourceProvider: "openai_hosted_shopee_mcp",
      platform: "shopee",
      ...nestedPayload,
    };
  }
  return {
    sourceProvider: "openai_hosted_shopee_mcp",
    platform: "shopee",
    keyword: args.keyword,
    region: args.region ?? "TH",
    locale: args.locale ?? "th-TH",
    capturedAt: args.capturedAt,
    sourceCapturedAt: args.sourceCapturedAt,
    sourceMetadata: args.sourceMetadata ?? {
      executionHost: "openai_chatgpt",
      upstreamAppId: args.upstreamAppId,
      upstreamToolName: args.upstreamToolName,
      requestId: args.requestId,
    },
    items: args.items,
    rawPayload: args.rawPayload,
    idempotencyKey: args.idempotencyKey,
  };
}

async function marketplaceWebUrl(pathname: string): Promise<string> {
  const runtime = await getAppRuntimeConfig();
  const baseUrl = runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl;
  return baseUrl ? `${baseUrl}${pathname}` : pathname;
}

async function executeMarketplaceSnapshotSave(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  await assertMarketplaceMcpWriteEnabled(ctx, "marketplaceIntelligenceImportsEnabled");
  const result = await saveOpenAiHostedShopeeSearchSnapshot({
    auth: marketplaceSessionAuthFromMcp(ctx),
    context: { requestTenantId: ctx.session.tenantId },
    payload: marketplaceWritebackPayloadFromArgs(args),
  });
  const snapshot = result.snapshot;
  const snapshotUrl = await marketplaceWebUrl(`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshot.id)}`);
  return {
    snapshotId: snapshot.id,
    snapshotUrl,
    keyword: snapshot.keyword,
    provider: snapshot.provider,
    sourceMode: snapshot.source,
    sourceCapturedAt: snapshot.sourceCapturedAt,
    itemCount: snapshot.itemCount,
    fieldCoveragePercent: snapshot.fieldCoveragePercent,
    unknownFieldCount: snapshot.unknownFieldCount,
    metrics: snapshot.metrics,
    warnings: result.warnings,
    message: "Saved OpenAI-hosted Shopee MCP search results into SmartSpecPro Marketplace Intelligence.",
  };
}

async function executeMarketplaceSnapshotsList(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const limit = mcpIntegerArg(args, "limit", 20, 1, 100);
  const snapshots = await listMarketplaceSnapshots(marketplaceActorFromSession(ctx));
  return {
    snapshots: await Promise.all(snapshots.slice(0, limit).map(async (snapshot) => ({
      id: snapshot.id,
      url: await marketplaceWebUrl(`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshot.id)}`),
      keyword: snapshot.keyword,
      provider: snapshot.provider,
      sourceMode: snapshot.source,
      capturedAt: snapshot.capturedAt,
      itemCount: snapshot.itemCount,
      fieldCoveragePercent: snapshot.fieldCoveragePercent,
      medianPrice: snapshot.metrics.medianPrice,
      totalMonthlySold: snapshot.metrics.totalMonthlySold,
      topBrand: snapshot.metrics.shareOfShelfByBrand[0]?.brand ?? null,
      topSeller: snapshot.metrics.shareOfShelfBySeller[0]?.sellerName ?? null,
    }))),
  };
}

async function executeMarketplaceSnapshotGet(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const snapshotId = mcpStringArg(args, "snapshotId");
  const snapshot = await getMarketplaceSnapshot(marketplaceActorFromSession(ctx), snapshotId);
  return {
    snapshot,
    snapshotUrl: await marketplaceWebUrl(`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(snapshot.id)}`),
    rawPayloadStored: false,
  };
}

async function executeMarketplaceReportGenerate(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  await assertMarketplaceMcpWriteEnabled(ctx, "marketplaceIntelligenceReportsEnabled");
  const snapshotId = mcpStringArg(args, "snapshotId");
  const reportType = marketplaceIntelligenceReportTypeSchema.parse(mcpStringArg(args, "reportType", "executive_image_summary"));
  const aspectRatio = marketplaceReportAspectRatioSchema.parse(mcpStringArg(args, "aspectRatio", "1:1"));
  const imageModel = mcpStringArg(args, "imageModel", "gpt-image-2");
  const report = await createMarketplaceIntelligenceReport({
    ...marketplaceActorFromSession(ctx),
    snapshotId,
    reportType,
    aspectRatio,
    imageModel,
  });
  return {
    reportId: report.id,
    reportUrl: await marketplaceWebUrl(`/marketplace-capture/intelligence/reports/${encodeURIComponent(report.id)}`),
    snapshotId: report.snapshotId,
    snapshotUrl: await marketplaceWebUrl(`/marketplace-capture/intelligence/snapshots/${encodeURIComponent(report.snapshotId)}`),
    title: report.title,
    reportType: report.reportType,
    aspectRatio: report.aspectRatio,
    imageModel: report.imageModel,
    executiveSummary: report.executiveSummary,
    kpis: report.kpis,
    winners: report.winners,
    recommendations: report.recommendations,
    imagePrompt: report.promptPayload.prompt,
    promptPayload: report.promptPayload,
  };
}

async function executeMarketplaceCaptureBatchCreate(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  await assertMarketplaceMcpWriteEnabled(ctx, "marketplaceIntelligenceImportsEnabled");
  const snapshotId = mcpStringArg(args, "snapshotId");
  const handoff = await createMarketplaceCaptureCandidateBatchFromSnapshot(marketplaceActorFromSession(ctx), snapshotId);
  return {
    ...handoff,
    marketplaceCaptureBatchUrl: await marketplaceWebUrl(`/marketplace-capture/candidates/${encodeURIComponent(handoff.marketplaceCaptureBatchId)}`),
  };
}

async function executeMarketplaceWatchlistsList(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  const limit = mcpIntegerArg(args, "limit", 20, 1, 100);
  const watchlists = await listMarketplaceWatchlists(marketplaceActorFromSession(ctx));
  return {
    watchlists: await Promise.all(watchlists.slice(0, limit).map(async (watchlist) => ({
      ...watchlist,
      url: await marketplaceWebUrl(`/marketplace-capture/intelligence/watchlists/${encodeURIComponent(watchlist.id)}`),
    }))),
  };
}

async function executeMarketplaceWatchlistUpsert(args: Record<string, unknown>, ctx: McpExecutionContext): Promise<unknown> {
  await assertMarketplaceMcpWriteEnabled(ctx, "marketplaceIntelligenceWatchlistsEnabled");
  const keyword = mcpStringArg(args, "keyword");
  const region = mcpStringArg(args, "region", "TH");
  const cadence = mcpStringArg(args, "cadence", "daily");
  if (!["daily", "weekly", "manual"].includes(cadence)) {
    throw Object.assign(new Error("Invalid cadence. Use daily, weekly, or manual."), { code: -32602 });
  }
  const watchlist = await createMarketplaceWatchlist({
    ...marketplaceActorFromSession(ctx),
    keyword,
    region,
    cadence: cadence as "daily" | "weekly" | "manual",
  });
  return {
    watchlist,
    watchlistUrl: await marketplaceWebUrl(`/marketplace-capture/intelligence/watchlists/${encodeURIComponent(watchlist.id)}`),
  };
}

function attachContextStateToResult(
  toolName: string,
  ctx: McpExecutionContext,
  result: unknown,
): unknown {
  const ownerType = ctx.session.teamId ? "team" : "user";
  const ownerId = ctx.session.teamId ? ctx.session.teamId : String(ctx.session.userId);
  if (!ownerId) {
    return result;
  }

  const contextState = buildContextToolStateHintsFromResult({
    title: `MCP tool result: ${toolName}`,
    content: result,
    ownerType,
    ownerId,
    sourceRef: `mcp:${toolName}`,
    source: typeof result === "string" ? "semantic" : "structured",
    includedReason: `MCP tool result from ${toolName}`,
    trust: "derived",
    freshness: "recent",
  });

  if (Object.keys(contextState).length === 0) {
    return result;
  }

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    const existingMeta =
      record._meta && typeof record._meta === "object"
        ? (record._meta as Record<string, unknown>)
        : {};
    return {
      ...record,
      _meta: {
        ...existingMeta,
        contextState: existingMeta.contextState ?? contextState,
        contextSource: existingMeta.contextSource ?? "mcp_tool_result",
        toolName: existingMeta.toolName ?? toolName,
      },
    };
  }

  return {
    content: [
      {
        type: "text",
        text: typeof result === "string"
          ? result
          : (() => {
              try {
                return JSON.stringify(result);
              } catch {
                return String(result);
              }
            })(),
      },
    ],
    _meta: {
      contextState,
      contextSource: "mcp_tool_result",
      toolName,
    },
  };
}

type McpAliasDefinition = {
  name: string;
  target: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};

/**
 * Validate the bounded JSON Schemas published by the MCP registry before the
 * canonical executor runs. This deliberately implements the subset used by
 * this registry; it is not a general JSON Schema engine.
 */
function validateMcpSchema(schema: Record<string, unknown>, value: unknown, path = "arguments"): string | null {
  const type = schema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return `${path} must be an object`;
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in record)) return `${path}.${key} is required`;
    }
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(record).find((key) => !(key in properties));
      if (unknown) return `${path}.${unknown} is not allowed`;
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record && child && typeof child === "object" && !Array.isArray(child)) {
        const error = validateMcpSchema(child as Record<string, unknown>, record[key], `${path}.${key}`);
        if (error) return error;
      }
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) return `${path} must be an array`;
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return `${path} has too few items`;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return `${path} has too many items`;
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateMcpSchema(schema.items as Record<string, unknown>, value[index], `${path}[${index}]`);
        if (error) return error;
      }
    }
  } else if (type === "string") {
    if (typeof value !== "string") return `${path} must be a string`;
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return `${path} is too short`;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return `${path} is too long`;
  } else if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `${path} must be a number`;
    if (type === "integer" && !Number.isInteger(value)) return `${path} must be an integer`;
    if (typeof schema.minimum === "number" && value < schema.minimum) return `${path} is below minimum`;
    if (typeof schema.maximum === "number" && value > schema.maximum) return `${path} is above maximum`;
  } else if (type === "boolean" && typeof value !== "boolean") {
    return `${path} must be a boolean`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return `${path} has an unsupported value`;
  }
  if ("const" in schema && !Object.is(schema.const, value)) return `${path} has an unsupported value`;
  if (Array.isArray(schema.oneOf) && !schema.oneOf.some((candidate) => (
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      && validateMcpSchema(candidate as Record<string, unknown>, value) === null
  ))) {
    return `${path} has an invalid shape`;
  }
  return null;
}

const LIBRARY_SEARCH_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "ค้นหาจากชื่อไฟล์ คำอธิบาย metadata tags และข้อความ semantic vector index (เว้นว่างไว้เพื่อดูไฟล์ล่าสุด)",
    },
    filters: {
      type: "object",
      description: "ตัวกรองไฟล์ขั้นสูงตามสเปก SmartAIHub",
      properties: {
        file_types: {
          type: "array",
          description: "กรองตามประเภทไฟล์ เช่น image, video, audio, document, presentation, folder, code, archive",
          items: {
            type: "string",
            enum: ["image", "video", "audio", "document", "presentation", "folder", "code", "archive"],
          },
        },
        mime_types: {
          type: "array",
          description: "กรองตาม MIME type เช่น image/png, video/mp4, application/pdf",
          items: { type: "string" },
        },
        extensions: {
          type: "array",
          description: "กรองตามนามสกุลไฟล์ เช่น .png, .mp4, .jpg",
          items: { type: "string" },
        },
        filename_contains: {
          type: "string",
          description: "กรองคำที่ปรากฏในชื่อไฟล์",
        },
        folder_id: {
          type: "string",
          description: "ID ของโฟลเดอร์ที่ต้องการค้นหา (เช่น 'folder_123' หรือ 123)",
        },
        recursive: {
          type: "boolean",
          description: "ค้นหารวมโฟลเดอร์ย่อยหรือไม่",
        },
        tags_all: {
          type: "array",
          description: "ต้องมีทุกแท็กที่ระบุ",
          items: { type: "string" },
        },
        tags_any: {
          type: "array",
          description: "มีแท็กใดแท็กหนึ่งที่ระบุ",
          items: { type: "string" },
        },
        source: {
          type: "array",
          description: "แหล่งที่มา เช่น upload, generated, rendered, media_history",
          items: { type: "string" },
        },
        status: {
          type: "array",
          description: "สถานะของไฟล์ เช่น ready, processing, failed",
          items: {
            type: "string",
            enum: ["ready", "processing", "failed"],
          },
        },
        created_at: {
          type: "object",
          description: "ช่วงเวลาที่สร้างไฟล์ { from, to }",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
          },
        },
        size_bytes: {
          type: "object",
          description: "ขนาดไฟล์เป็นไบต์ { min, max }",
          properties: {
            min: { type: "number" },
            max: { type: "number" },
          },
        },
      },
      additionalProperties: true,
    },
    sort_by: {
      type: "string",
      description: "เรียงลำดับตาม: created_at, title, size_bytes, relevance",
      enum: ["created_at", "title", "size_bytes", "relevance"],
    },
    sort_order: {
      type: "string",
      description: "ทิศทางการเรียง: desc (ล่าสุดก่อน) หรือ asc",
      enum: ["desc", "asc"],
    },
    page_size: {
      type: "integer",
      description: "จำนวนรายการต่อหน้า (1-100, ค่าเริ่มต้น 25)",
      minimum: 1,
      maximum: 100,
      default: 25,
    },
    cursor: {
      type: "string",
      description: "Cursor หรือ offset สำหรับหน้าถัดไป",
    },
    limit: {
      type: "integer",
      description: "ชื่อพารามิเตอร์เดิมเทียบเท่า page_size",
    },
    offset: {
      type: "integer",
      description: "Offset สำหรับ pagination",
    },
    item_type: {
      type: "string",
      description: "ชื่อพารามิเตอร์เดิมเทียบเท่า filters.file_types[0]",
    },
    from_date: {
      type: "string",
      description: "ชื่อพารามิเตอร์เดิมเทียบเท่า filters.created_at.from",
    },
    to_date: {
      type: "string",
      description: "ชื่อพารามิเตอร์เดิมเทียบเท่า filters.created_at.to",
    },
    recent_days: {
      type: "string",
      description: "กรองวันย้อนหลังด่วน เช่น '1', '3', '7', '15', '30' วัน",
    },
    include: {
      type: "array",
      description: "ฟิลด์เสริมที่ต้องการรวม เช่น metadata, thumbnail",
      items: { type: "string" },
    },
  },
  additionalProperties: true,
};

const MCP_ALIAS_DEFINITIONS: McpAliasDefinition[] = [
  {
    name: "smartaihub_library_search",
    target: "smartspec.knowledge.library.search",
    description: "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server สำหรับการค้นหาไฟล์ใน Library ให้ใช้ smartaihub_library_search ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง",
    inputSchema: LIBRARY_SEARCH_INPUT_SCHEMA,
  },
  {
    name: "smartaihub_library_get_file",
    target: "smartspec.knowledge.library.get",
    description: "Read a specific owner Library item metadata and download reference",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "integer", description: "ID ของไฟล์ใน Library" },
        library_item_id: { type: "integer", description: "ID ของไฟล์ใน Library (ชื่อเดิม)" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "library.search",
    target: "smartspec.knowledge.library.search",
    description: "Search user and tenant files in SmartAIHub Library",
    inputSchema: LIBRARY_SEARCH_INPUT_SCHEMA,
  },
  {
    name: "library.get",
    target: "smartspec.knowledge.library.get",
    description: "Read a specific owner Library item metadata and download reference",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "integer", description: "ID ของไฟล์ใน Library" },
        library_item_id: { type: "integer", description: "ID ของไฟล์ใน Library (ชื่อเดิม)" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "smartaihub_media_generate_image",
    target: "smartspec.media.generate_image",
    description: "สร้างรูปภาพผ่าน SmartAIHub Media Studio ระบบจะหักเครดิตตามโมเดลและพารามิเตอร์จริง โมเดลแนะนำ: GPT Image 2 (gpt-image-2-text-to-image), Nano Banana 2 Lite (google-banana-2-lite) / Nano Banana Pro (google/nano-banana-pro), Seedream 5.0 Pro (seedream/5-pro-text-to-image) หรือเรียก smartaihub_media_models_list เพื่อดูโมเดลทั้งหมด หากไม่แน่ใจให้เรียก smartaihub_help topic media.generate",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "ข้อความ Prompt สำหรับสร้างภาพ" },
        model: { type: "string", description: "รหัสหรือชื่อโมเดล เช่น gpt-image-2-text-to-image, google-banana-2-lite, seedream/5-pro-text-to-image" },
        aspect_ratio: { type: "string", description: "สัดส่วนภาพ เช่น 1:1, 16:9, 9:16, 4:3, 3:4" },
        size: { type: "string", description: "ขนาดภาพ เช่น 1024x1024, 1280x720" },
        resolution: { type: "string", description: "ความละเอียด เช่น 1k, 2k, 4k" },
        num_images: { type: "integer", minimum: 1, maximum: 4, description: "จำนวนภาพที่ต้องการสร้าง" },
        reference_image_urls: { type: "array", items: { type: "string" }, description: "URL ภาพอ้างอิง" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "image.generate",
    target: "smartspec.media.generate_image",
    description: "Generate an image through SmartAIHub Media Studio",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        aspect_ratio: { type: "string" },
        size: { type: "string" },
        resolution: { type: "string" },
        num_images: { type: "integer" },
        reference_image_urls: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
  },
  {
    name: "smartaihub_media_generate_video",
    target: "smartspec.media.generate_video",
    description: "สร้างวิดีโอผ่าน SmartAIHub Media Studio ระบบจะหักเครดิตตามโมเดลและพารามิเตอร์จริง โมเดลแนะนำ: Grok Imagine Video 1.5 (grok-imagine-video-1-5-preview), Veo 3.1 Lite (veo3/generate-veo-3-video-lite), Gemini Omni Flash 1.1 (gemini-omni-flash-1-1) หรือเรียก smartaihub_media_models_list เพื่อดูโมเดลทั้งหมด หากไม่แน่ใจให้เรียก smartaihub_help topic media.generate",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "ข้อความ Prompt สำหรับสร้างวิดีโอ" },
        model: { type: "string", description: "รหัสหรือชื่อโมเดล เช่น grok-imagine-video-1-5-preview, veo3/generate-veo-3-video-lite, gemini-omni-flash-1-1" },
        aspect_ratio: { type: "string", description: "สัดส่วนวิดีโอ เช่น 16:9, 9:16" },
        duration_seconds: { type: "number", minimum: 1, maximum: 60, description: "ความยาววิดีโอ (วินาที)" },
        resolution: { type: "string", description: "ความละเอียด เช่น 720p, 1080p, 4k" },
        fps: { type: "number", description: "เฟรมต่อวินาที" },
        reference_image_urls: { type: "array", items: { type: "string" }, description: "URL ภาพอ้างอิง" },
        reference_video_urls: { type: "array", items: { type: "string" }, description: "URL วิดีโออ้างอิง" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "video.generate",
    target: "smartspec.media.generate_video",
    description: "Generate a video through SmartAIHub Media Studio",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string" },
        model: { type: "string" },
        aspect_ratio: { type: "string" },
        duration_seconds: { type: "number" },
        resolution: { type: "string" },
        fps: { type: "number" },
        reference_image_urls: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
  },
  {
    name: "smartaihub_media_models_list",
    target: "smartspec.media.models.list",
    description: "List available media generation models and pricing in SmartAIHub",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image", "video", "audio"], description: "กรองชนิดโมเดล" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "media.models.list",
    target: "smartspec.media.models.list",
    description: "List available media generation models and pricing in SmartAIHub",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image", "video", "audio"] },
      },
      additionalProperties: true,
    },
  },
  {
    name: "smartaihub_media_history_search",
    target: "smartspec.media.history.list",
    description: "Search and filter media generation tasks in Media History",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "ค้นหาข้อความใน Prompt" },
        media_type: { type: "string", description: "image, video, audio หรือ รูปภาพ, วิดีโอ" },
        model: { type: "string", description: "กรองตามชื่อหรือรหัสโมเดล" },
        status: { type: "string", description: "completed, pending, processing, failed" },
        from_date: { type: "string", description: "ช่วงเวลาเริ่มต้น (ISO format หรือ YYYY-MM-DD)" },
        to_date: { type: "string", description: "ช่วงเวลาสิ้นสุด" },
        recent_days: { type: "number", description: "จำนวนวันที่ผ่านมา เช่น 1, 3, 7, 15, 30" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "จำนวนรายการ" },
        offset: { type: "integer", minimum: 0, description: "ลำดับเริ่มต้น (pagination)" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "smartaihub_media_history_get",
    target: "smartspec.media.history.get",
    description: "Get detailed status and metadata of a media task",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string", description: "Task ID" } },
      additionalProperties: false,
    },
  },
  {
    name: "media.history.search",
    target: "smartspec.media.history.list",
    description: "Search media generation tasks in Media History",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        media_type: { type: "string" },
        model: { type: "string" },
        status: { type: "string" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "media.history.get",
    target: "smartspec.media.history.get",
    description: "Get detailed status of a media task",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "models.list",
    target: "smartspec.gateway.models.list",
    description: "List SmartAIHub gateway models",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "account.get_balance",
    target: "smartspec.gateway.credits.get",
    description: "Read the current SmartAIHub credit balance",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "credits.estimate",
    target: "smartspec.gateway.credits.estimate",
    description: "Estimate SmartAIHub credits without charging the account",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", maxLength: 32_000 },
        messages: { type: "array", items: { type: "object" }, maxItems: 100 },
        model: { type: "string", maxLength: 200 },
        max_output_tokens: { type: "integer", minimum: 1, maximum: 32_000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "render.get",
    target: "smartspec.remotion.job.status",
    description: "Read an owned Remotion render job; kind must be remotion",
    inputSchema: {
      type: "object",
      required: ["kind", "job_id"],
      properties: { kind: { type: "string", const: "remotion" }, job_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
  },
  {
    name: "render.list",
    target: "__smartaihub_remotion_list__",
    description: "List owned Remotion render jobs; kind must be remotion",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", const: "remotion" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "render.cancel",
    target: "smartspec.remotion.job.cancel",
    description: "Cancel an owned Remotion render job; kind must be remotion",
    inputSchema: {
      type: "object",
      required: ["kind", "job_id"],
      properties: { kind: { type: "string", const: "remotion" }, job_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
  },
];

const TOOL_REGISTRY: McpToolDefinition[] = [
  {
    name: "smartspec.marketplace_intelligence.search_snapshot.save",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_write",
    description: "Save Shopee search results obtained by the OpenAI-hosted Shopee app into SmartSpecPro Marketplace Intelligence. Call this only after the upstream Shopee app has returned real search result items.",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["keyword", "items"],
      properties: {
        keyword: { type: "string", minLength: 1, maxLength: 120 },
        region: { type: "string", default: "TH" },
        locale: { type: "string", default: "th-TH" },
        sourceProvider: { type: "string", enum: ["openai_hosted_shopee_mcp"], default: "openai_hosted_shopee_mcp" },
        capturedAt: { type: "string", description: "When the OpenAI host obtained or prepared the search result." },
        sourceCapturedAt: { type: "string", description: "When the upstream Shopee search result was captured, if known." },
        sourceMetadata: {
          type: "object",
          properties: {
            executionHost: { type: "string", enum: ["openai_chatgpt"], default: "openai_chatgpt" },
            upstreamAppId: { type: "string" },
            upstreamToolName: { type: "string" },
            requestId: { type: "string" },
            sourceUrl: { type: "string" },
          },
          additionalProperties: true,
        },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: true,
            description: "One Shopee search result item. Prefer raw nested Shopee fields when available; flattened itemid/shopid/name/price/rating fields are also accepted.",
          },
        },
        rawPayload: { type: "object", additionalProperties: true },
        idempotencyKey: { type: "string" },
      },
      additionalProperties: true,
    },
    execute: executeMarketplaceSnapshotSave,
  },
  {
    name: "smartspec.marketplace_intelligence.snapshots.list",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_read",
    description: "List saved marketplace keyword search snapshots for the current user",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceSnapshotsList,
  },
  {
    name: "smartspec.marketplace_intelligence.snapshot.get",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_read",
    description: "Read a saved marketplace keyword snapshot, normalized items, metrics, and field coverage",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["snapshotId"],
      properties: {
        snapshotId: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceSnapshotGet,
  },
  {
    name: "smartspec.marketplace_intelligence.report.generate",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_write",
    description: "Generate an evidence-bound marketplace competitive intelligence report payload",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["snapshotId"],
      properties: {
        snapshotId: { type: "string", minLength: 1 },
        reportType: { type: "string", default: "executive_image_summary" },
        aspectRatio: { type: "string", enum: ["1:1", "9:16", "16:9"], default: "1:1" },
        imageModel: { type: "string", default: "gpt-image-2" },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceReportGenerate,
  },
  {
    name: "smartspec.marketplace_intelligence.capture_batch.create",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_write",
    description: "Create a Marketplace Capture candidate batch from a keyword search snapshot",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["snapshotId"],
      properties: {
        snapshotId: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceCaptureBatchCreate,
  },
  {
    name: "smartspec.marketplace_intelligence.watchlists.list",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_read",
    description: "List saved marketplace intelligence watchlists for the current user",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceWatchlistsList,
  },
  {
    name: "smartspec.marketplace_intelligence.watchlist.upsert",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_write",
    description: "Create or update a user-scoped marketplace keyword watchlist",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["keyword"],
      properties: {
        keyword: { type: "string", minLength: 1, maxLength: 120 },
        region: { type: "string", default: "TH" },
        cadence: { type: "string", enum: ["daily", "weekly", "manual"], default: "daily" },
      },
      additionalProperties: false,
    },
    execute: executeMarketplaceWatchlistUpsert,
  },
  {
    name: "smartspec.gateway.models.list",
    family: "gateway",
    namespace: "gateway",
    toolGroup: "gateway_read",
    description: "List SmartAIHub gateway models currently enabled for the owner",
    requiredScope: "llm:chat",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => listGatewayModels(),
  },
  {
    name: "smartspec.gateway.credits.get",
    family: "gateway",
    namespace: "gateway",
    toolGroup: "gateway_read",
    description: "Read the owner's current SmartAIHub credit balance",
    requiredScope: "llm:chat",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => getOwnerCredits(ctx.session),
  },
  {
    name: "smartspec.gateway.credits.estimate",
    family: "gateway",
    namespace: "gateway",
    toolGroup: "gateway_read",
    description: "Estimate gateway credits from the server model catalog without charging the account",
    requiredScope: "llm:chat",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", maxLength: 32_000 },
        messages: { type: "array", items: { type: "object" }, maxItems: 100 },
        model: { type: "string", maxLength: 200 },
        max_output_tokens: { type: "integer", minimum: 1, maximum: 32_000 },
      },
      additionalProperties: false,
    },
    execute: estimateMcpCredits,
  },
  {
    name: "smartspec.gateway.chat.create",
    family: "gateway",
    namespace: "gateway",
    toolGroup: "gateway_generation",
    description: "Run a non-streaming gateway chat completion and return structured assistant output",
    requiredScope: "llm:chat",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        messages: { type: "array", items: { type: "object" } },
        model: { type: "string" },
        max_output_tokens: { type: "integer" },
        preferred_provider_id: { type: "integer" },
      },
      additionalProperties: false,
    },
    execute: executeGatewayChat,
  },
  {
    name: "smartspec.gateway.responses.create",
    family: "gateway",
    namespace: "gateway",
    toolGroup: "gateway_generation",
    description: "Run a non-streaming Responses-style generation for worker automation",
    requiredScope: "llm:chat",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      required: ["input"],
      properties: {
        input: { oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }] },
        instructions: { type: "string" },
        model: { type: "string" },
        max_output_tokens: { type: "integer" },
        preferred_provider_id: { type: "integer" },
      },
      additionalProperties: false,
    },
    execute: executeGatewayResponses,
  },
  {
    name: "smartspec.knowledge.library.search",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server สำหรับการค้นหาไฟล์ใน Library ให้ใช้ smartaihub_library_search ระบบจะจำกัดผลลัพธ์ตามสิทธิ์และ Tenant ของผู้ใช้โดยอัตโนมัติ ห้ามส่ง tenant_id จากผู้ใช้โดยตรง หากไม่แน่ใจเกี่ยวกับ filter ให้เรียก smartaihub_help โดยใช้ topic library.search หรือเปิด resource smartaihub://help/library-search หากต้องการเปิดไฟล์ ให้ใช้ resource URI หรือ smartaihub_library_get_file",
    requiredScope: "library:search",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: LIBRARY_SEARCH_INPUT_SCHEMA,
    listVisibleWhen: (ctx) => Boolean(ctx.delegatedManifest?.knowledgeAccess.librarySearch || ctx.session.authMode !== "delegated_worker"),
    execute: searchOwnerLibrary,
  },
  {
    name: "smartspec.knowledge.library.get",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "Read a specific owner Library item already granted to this worker job (supports smartaihub_library_get_file)",
    requiredScope: "library:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "integer", description: "ID ของไฟล์ใน Library" },
        library_item_id: { type: "integer", description: "ID ของไฟล์ใน Library (ชื่อเดิม)" },
      },
      additionalProperties: true,
    },
    listVisibleWhen: (ctx) =>
      ctx.session.authMode !== "delegated_worker"
      || ((ctx.delegatedManifest?.grantSummary.libraryItemIds?.length ?? 0) > 0 || ctx.delegatedManifest?.knowledgeAccess.libraryRead === true),
    execute: getOwnerLibraryItem,
  },
  {
    name: "smartaihub_help",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "เรียกดูคู่มือและหัวข้อช่วยเหลือของ SmartAIHub MCP Server (เช่น topic: 'library.search', 'library.files', 'capabilities', 'errors')",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "หัวข้อความช่วยเหลือ เช่น library.search, library.files, capabilities, errors",
        },
      },
      additionalProperties: true,
    },
    listVisibleWhen: () => true,
    execute: executeSmartaihubHelp,
  },
  {
    name: "smartspec.knowledge.context_packs.list",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "List Library context packs granted to this worker job",
    requiredScope: "library:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        approved_for_agents: { type: "boolean" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: async (ctx) =>
      (await isKnowledgeVaultSurfaceEnabledAsync(
        "contextPacksDelegatedMcp",
        ctx.session.tenantId,
      ))
      && (ctx.session.authMode !== "delegated_worker"
        || ((ctx.delegatedManifest?.grantSummary.libraryContextPackIds?.length ?? 0) > 0)),
    execute: listOwnerLibraryContextPacks,
  },
  {
    name: "smartspec.knowledge.library.download",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "Create a short-lived ACL-checked download reference for a visible Library file",
    requiredScope: "library:download",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "download_ref",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["library_item_id"],
      properties: { library_item_id: { type: "integer" } },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => ctx.session.authMode !== "delegated_worker"
      || Boolean(ctx.delegatedManifest?.knowledgeAccess.libraryRead),
    execute: downloadLibraryItem,
  },
  {
    name: "smartspec.knowledge.context_packs.resolve",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "Resolve a granted Library context pack into permission-filtered note context",
    requiredScope: "library:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["context_pack_id"],
      properties: {
        context_pack_id: { type: "integer" },
        max_items: { type: "integer" },
        token_budget_hint: { type: "integer" },
        include_citations: { type: "boolean" },
        fail_if_partial: { type: "boolean" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: async (ctx) =>
      (await isKnowledgeVaultSurfaceEnabledAsync(
        "contextPacksDelegatedMcp",
        ctx.session.tenantId,
      ))
      && (ctx.session.authMode !== "delegated_worker"
        || ((ctx.delegatedManifest?.grantSummary.libraryContextPackIds?.length ?? 0) > 0)),
    execute: resolveOwnerLibraryContextPack,
  },
  {
    name: "smartspec.knowledge.library.upload",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_ingest",
    description: "Upload a file into the owner Library through the normal publication pipeline",
    requiredScope: "library:upload",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      required: ["file_name", "file_type", "file_base64"],
      properties: {
        file_name: { type: "string" },
        file_type: { type: "string" },
        file_base64: { type: "string" },
        title: { type: "string" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => Boolean(ctx.delegatedManifest?.knowledgeAccess.libraryUpload || ctx.session.authMode !== "delegated_worker"),
    execute: uploadOwnerLibraryFile,
  },
  {
    name: "smartspec.knowledge.rag.search",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "Run semantic search over the owner RAG scope granted to this worker job",
    requiredScope: "rag:search",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => Boolean(ctx.delegatedManifest?.knowledgeAccess.ragSearch || ctx.session.authMode !== "delegated_worker"),
    execute: runOwnerRagSearch,
  },
  {
    name: "smartspec.knowledge.rag.ingest",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_ingest",
    description: "Upload or re-index owner content into the normal RAG ingestion pipeline",
    requiredScope: "rag:ingest",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["upload", "library_item"] },
        file_name: { type: "string" },
        file_type: { type: "string" },
        file_base64: { type: "string" },
        library_item_id: { type: "integer" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => Boolean(ctx.delegatedManifest?.knowledgeAccess.ragIngest || ctx.session.authMode !== "delegated_worker"),
    execute: runOwnerRagIngest,
  },
  {
    name: "smartspec.skills.list",
    family: "skills",
    namespace: "skills",
    toolGroup: "skills_read",
    description: "List SmartAIHub skills visible to the current owner",
    requiredScope: "skills:list",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => listSkills(),
  },
  {
    name: "smartspec.skills.get",
    family: "skills",
    namespace: "skills",
    toolGroup: "skills_read",
    description: "Inspect a specific SmartAIHub skill before execution",
    requiredScope: "skills:list",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["skill_id"],
      properties: { skill_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => getSkill(args),
  },
  {
    name: "smartspec.skills.detect",
    family: "skills",
    namespace: "skills",
    toolGroup: "skills_read",
    description: "Detect the most relevant skill for a prompt",
    requiredScope: "skills:execute",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: { prompt: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => detectSkillWithPrompt(args),
  },
  {
    name: "smartspec.skills.execute",
    family: "skills",
    namespace: "skills",
    toolGroup: "skills_execute",
    description: "Execute an allowed SmartAIHub skill on behalf of the owner",
    requiredScope: "skills:execute",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      required: ["skill_id"],
      properties: {
        skill_id: { type: "string" },
        inputs: { type: "object" },
        model: { type: "string" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => ctx.session.authMode !== "delegated_worker" || (ctx.delegatedManifest?.grantSummary.skills?.length ?? 0) > 0,
    execute: executeSkillViaMcp,
  },
  {
    name: "smartspec.agencies.list",
    family: "agencies",
    namespace: "agencies",
    toolGroup: "agency_read",
    description: "List agencies visible in the current tenant",
    requiredScope: "agencies:list",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => listAgenciesForTenant(ctx.session),
  },
  {
    name: "smartspec.agencies.invoke",
    family: "agencies",
    namespace: "agencies",
    toolGroup: "agency_execute",
    description: "Invoke an allowed agency and return the created run information",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      required: ["agency_id", "message"],
      properties: {
        agency_id: { type: "string" },
        message: { type: "string" },
        conversation_id: { type: "string" },
        max_credits: { type: "integer" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => ctx.session.authMode !== "delegated_worker" || (ctx.delegatedManifest?.grantSummary.agencies?.length ?? 0) > 0,
    execute: invokeAgency,
  },
  {
    name: "smartspec.agencies.status",
    family: "agencies",
    namespace: "agencies",
    toolGroup: "agency_read",
    description: "Read the current status of a specific agency run",
    requiredScope: "agencies:invoke",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["agency_id", "run_id"],
      properties: {
        agency_id: { type: "string" },
        run_id: { type: "string" },
      },
      additionalProperties: false,
    },
    execute: getAgencyRunStatus,
  },
  {
    name: "smartspec.media.generate_image",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Generate an image through SmartAIHub Media Studio with dynamic credit billing. Recommended top models: GPT Image 2 (gpt-image-2-text-to-image), Nano Banana 2 Lite (google-banana-2-lite) / Nano Banana Pro (google/nano-banana-pro), Seedream 5.0 Pro (seedream/5-pro-text-to-image)",
    requiredScope: "media:generate",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "ข้อความ Prompt สำหรับสร้างภาพ" },
        model: { type: "string", description: "รหัสหรือชื่อโมเดล เช่น gpt-image-2-text-to-image, google-banana-2-lite, seedream/5-pro-text-to-image" },
        aspect_ratio: { type: "string", description: "สัดส่วนภาพ เช่น 1:1, 16:9, 9:16, 4:3, 3:4" },
        size: { type: "string", description: "ขนาดภาพ เช่น 1024x1024, 1280x720" },
        resolution: { type: "string", description: "ความละเอียด เช่น 1k, 2k, 4k" },
        num_images: { type: "integer", minimum: 1, maximum: 4, description: "จำนวนภาพที่ต้องการสร้าง" },
        reference_image_urls: { type: "array", items: { type: "string" }, maxItems: 9, description: "URL ภาพอ้างอิง" },
        provider: { type: "string", enum: ["platform", "hermes"] },
        connection_id: { type: "string", minLength: 1 },
      },
      additionalProperties: true,
    },
    execute: (args, ctx) => generateMedia("image", args, ctx),
  },
  {
    name: "smartspec.media.generate_video",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Generate a video through SmartAIHub Media Studio with dynamic credit billing. Recommended top models: Grok Imagine Video 1.5 (grok-imagine-video-1-5-preview), Veo 3.1 Lite (veo3/generate-veo-3-video-lite), Gemini Omni Flash 1.1 (gemini-omni-flash-1-1)",
    requiredScope: "media:generate",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "ข้อความ Prompt สำหรับสร้างวิดีโอ" },
        model: { type: "string", description: "รหัสหรือชื่อโมเดล เช่น grok-imagine-video-1-5-preview, veo3/generate-veo-3-video-lite, gemini-omni-flash-1-1" },
        aspect_ratio: { type: "string", description: "สัดส่วนวิดีโอ เช่น 16:9, 9:16" },
        duration_seconds: { type: "number", minimum: 1, maximum: 60, description: "ความยาววิดีโอ (วินาที)" },
        resolution: { type: "string", description: "ความละเอียด เช่น 720p, 1080p, 4k" },
        fps: { type: "number", description: "เฟรมต่อวินาที" },
        reference_image_urls: { type: "array", items: { type: "string" }, maxItems: 9, description: "URL ภาพอ้างอิง" },
        reference_video_urls: { type: "array", items: { type: "string" }, description: "URL วิดีโออ้างอิง" },
        provider: { type: "string", enum: ["platform", "hermes"] },
        connection_id: { type: "string", minLength: 1 },
      },
      additionalProperties: true,
    },
    execute: (args, ctx) => generateMedia("video", args, ctx),
  },
  {
    name: "smartspec.media.models.list",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "List available media models with pricing and recommended top picks in SmartAIHub",
    requiredScope: "media:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image", "video", "audio"], description: "กรองชนิดโมเดล" },
      },
      additionalProperties: true,
    },
    execute: listMediaModels,
  },
  {
    name: "smartspec.media.generate_audio",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Generate audio through the platform media stack",
    requiredScope: "media:generate",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" }, model: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => generateMedia("audio", args, ctx),
  },
  {
    name: "smartspec.media.status",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Check the status of an asynchronous media task",
    requiredScope: "media:generate",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: getMediaStatus,
  },
  {
    name: "smartspec.media.cancel",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Cancel an owned active image/video/audio media task",
    requiredScope: "media:generate",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "required",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: cancelMediaTask,
  },
  {
    name: "smartspec.media.history.list",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "List and search the authenticated user's tenant-scoped media history by query, model, status, and date",
    requiredScope: "media:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "ค้นหาข้อความใน Prompt" },
        media_type: { type: "string", description: "image, video, audio หรือ รูปภาพ, วิดีโอ" },
        model: { type: "string", description: "กรองตามชื่อหรือรหัสโมเดล" },
        status: { type: "string", description: "completed, pending, processing, failed" },
        from_date: { type: "string", description: "ช่วงเวลาเริ่มต้น (ISO format หรือ YYYY-MM-DD)" },
        to_date: { type: "string", description: "ช่วงเวลาสิ้นสุด" },
        recent_days: { type: "number", description: "จำนวนวันที่ผ่านมา เช่น 1, 3, 7, 15, 30" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "จำนวนรายการ" },
        offset: { type: "integer", minimum: 0, description: "ลำดับเริ่มต้น (pagination)" },
      },
      additionalProperties: true,
    },
    execute: listMediaHistory,
  },
  {
    name: "smartspec.media.history.get",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Read one tenant-scoped media history task without exposing raw URLs",
    requiredScope: "media:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: getMediaHistoryTask,
  },
  {
    name: "smartspec.media.history.download",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Create a short-lived download reference for an owned completed media task",
    requiredScope: "media:download",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "download_ref",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: downloadMediaHistoryTask,
  },
  {
    name: "smartspec.presentations.create",
    family: "presentations",
    namespace: "presentations",
    toolGroup: "presentation_generation",
    description: "Create a new AI draft presentation for the owner",
    requiredScope: "presentations:create",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        prompt: { type: "string" },
        style: { type: "string" },
        slide_count: { type: "integer" },
      },
      additionalProperties: false,
    },
    execute: createPresentation,
  },
  {
    name: "smartspec.presentations.get",
    family: "presentations",
    namespace: "presentations",
    toolGroup: "presentation_generation",
    description: "Read a generated presentation deck",
    requiredScope: "presentations:create",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["deck_id"],
      properties: { deck_id: { type: "integer" } },
      additionalProperties: false,
    },
    execute: getPresentation,
  },
  {
    name: "smartspec.presentations.progress",
    family: "presentations",
    namespace: "presentations",
    toolGroup: "presentation_generation",
    description: "Read the current progress of a long-running presentation task",
    requiredScope: "presentations:create",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => getPresentationProgress(args),
  },
  {
    name: "smartspec.presentations.export",
    family: "presentations",
    namespace: "presentations",
    toolGroup: "presentation_generation",
    description: "Trigger a deck export job and return an export identifier",
    requiredScope: "presentations:create",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["deck_id"],
      properties: {
        deck_id: { type: "integer" },
        format: { type: "string", enum: ["pptx", "pdf"] },
      },
      additionalProperties: false,
    },
    execute: exportPresentation,
  },
  {
    name: "smartspec.presentations.download",
    family: "presentations",
    namespace: "presentations",
    toolGroup: "presentation_generation",
    description: "Resolve the current presentation export into a safe download target",
    requiredScope: "presentations:create",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "download_ref",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["deck_id"],
      properties: { deck_id: { type: "integer" } },
      additionalProperties: false,
    },
    execute: downloadPresentation,
  },
  {
    name: "smartspec.video_projects.create",
    family: "video_projects",
    namespace: "video_projects",
    toolGroup: "video_generation",
    description: "Create a new video project for the owner",
    requiredScope: "video_projects:create",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["title", "duration_minutes"],
      properties: {
        title: { type: "string" },
        duration_minutes: { type: "number" },
        quality: { type: "string", enum: ["draft", "standard", "high"] },
      },
      additionalProperties: false,
    },
    execute: createVideoProject,
  },
  {
    name: "smartspec.video_projects.get",
    family: "video_projects",
    namespace: "video_projects",
    toolGroup: "video_generation",
    description: "Read the current state of a video project task",
    requiredScope: "video_projects:create",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: getVideoProject,
  },
  {
    name: "smartspec.video_projects.download",
    family: "video_projects",
    namespace: "video_projects",
    toolGroup: "video_generation",
    description: "Resolve a completed video project export into a safe download target",
    requiredScope: "video_projects:create",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "download_ref",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: { project_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: downloadVideoProject,
  },
  {
    name: "smartspec.hermes.connector.status",
    family: "video_projects",
    namespace: "hermes",
    toolGroup: "video_generation",
    description: "Check whether a paired standalone Hermes/Remotion executor is online and render-ready",
    requiredScope: "hermes:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => getHermesConnectorStatus(ctx),
  },
  {
    name: "smartspec.hermes.capabilities",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "List the authenticated user's available Hermes connection and media capabilities",
    requiredScope: "hermes:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: hermesCapabilities,
  },
  {
    name: "smartspec.hermes.connection_status",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Read one owned Hermes provider connection or list all owned connections",
    requiredScope: "hermes:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: { connection_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: hermesConnectionStatus,
  },
  {
    name: "smartspec.hermes.connection_authorize",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Start an owner-consented Hermes provider authorization job",
    requiredScope: "hermes:connect",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "required",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["scope", "consent_acknowledged"],
      properties: {
        scope: { type: "string", enum: ["server_shared", "server_personal", "private_worker"] },
        worker_id: { type: "string" },
        label: { type: "string", maxLength: 120 },
        consent_acknowledged: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
    execute: authorizeHermesConnection,
  },
  {
    name: "smartspec.hermes.connection_probe",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Probe an owned Hermes connection and optionally run a bounded image/video test",
    requiredScope: "hermes:connect",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["connection_id"],
      properties: {
        connection_id: { type: "string", minLength: 1 },
        test_generation: { type: "string", enum: ["image", "video"] },
      },
      additionalProperties: false,
    },
    execute: probeHermesConnection,
  },
  {
    name: "smartspec.hermes.connection_disconnect",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Disconnect an owned Hermes provider connection",
    requiredScope: "hermes:disconnect",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["connection_id"],
      properties: { connection_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: disconnectHermesConnection,
  },
  {
    name: "smartspec.hermes.connection_test_generation",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Run the bounded Hermes image/video connection liveness test",
    requiredScope: "hermes:generate",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["connection_id", "test_generation"],
      properties: {
        connection_id: { type: "string", minLength: 1 },
        test_generation: { type: "string", enum: ["image", "video"] },
      },
      additionalProperties: false,
    },
    execute: probeHermesConnection,
  },
  {
    name: "smartspec.hermes.media_execute",
    family: "media",
    namespace: "hermes",
    toolGroup: "media_generation",
    description: "Submit a supported Hermes image/video operation through the existing server media contract",
    requiredScope: "hermes:generate",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["operation", "connection_id", "model", "prompt"],
      properties: {
        operation: { type: "string", enum: ["image.generate", "image.edit", "video.generate", "video.image_to_video"] },
        connection_id: { type: "string", minLength: 1 },
        model: { type: "string", minLength: 1 },
        prompt: { type: "string", minLength: 1 },
        reference_image_urls: { type: "array", items: { type: "string" }, maxItems: 9 },
        duration_seconds: { type: "number", minimum: 1, maximum: 60 },
      },
      additionalProperties: false,
    },
    execute: executeHermesMedia,
  },
  {
    name: "smartspec.hermes.agent.disconnect",
    family: "video_projects",
    namespace: "hermes",
    toolGroup: "gateway_generation",
    description: "Revoke the current paired Hermes MCP device session",
    requiredScope: "hermes:disconnect",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    availability: async (ctx) => ctx.session.authMode === "agent_pairing"
      ? { available: true }
      : { available: false, reason: "agent_pairing_session_required" },
    execute: disconnectHermesAgent,
  },
  {
    name: "smartspec.remotion.render_video",
    family: "video_projects",
    namespace: "remotion",
    toolGroup: "video_generation",
    description: "Queue a server-compiled Remotion video project on the approved executor lane",
    requiredScope: "remotion:submit",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "artifact_ref",
    idempotencyMode: "optional",
    actionClass: "media",
    inputSchema: {
      type: "object",
      required: ["project_id", "profile"],
      properties: {
        project_id: { type: "integer", minimum: 1 },
        profile: { type: "string", enum: ["preview", "final"] },
      },
      additionalProperties: false,
    },
    availability: async (ctx) => {
      const enabled = await getTenantFeatureFlag("remotionDedicatedExecutorEnabled", ctx.session.tenantId).catch(() => false);
      return enabled ? { available: true } : { available: false, reason: "remotion_executor_feature_disabled" };
    },
    execute: submitRemotionRender,
  },
  {
    name: "smartspec.remotion.job.status",
    family: "video_projects",
    namespace: "remotion",
    toolGroup: "video_generation",
    description: "Read the authenticated user's Remotion render job and verified output references",
    requiredScope: "remotion:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: getRemotionJobStatus,
  },
  {
    name: "smartspec.remotion.job.cancel",
    family: "video_projects",
    namespace: "remotion",
    toolGroup: "video_generation",
    description: "Cancel an owned active Remotion render job",
    requiredScope: "remotion:cancel",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: cancelRemotionJob,
  },
  {
    name: "smartspec.jobs.submit",
    family: "jobs",
    namespace: "jobs",
    toolGroup: "job_mutation",
    description: "Create a new asynchronous platform job",
    requiredScope: "jobs:create",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "compute",
    inputSchema: {
      type: "object",
      required: ["type"],
      properties: { type: { type: "string" }, params: { type: "object" }, max_credits: { type: "integer" } },
      additionalProperties: false,
    },
    execute: createMcpJob,
  },
  {
    name: "smartspec.jobs.list",
    family: "jobs",
    namespace: "jobs",
    toolGroup: "job_read",
    description: "List asynchronous jobs in the current tenant",
    requiredScope: "jobs:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_args, ctx) => listMcpJobs(ctx),
  },
  {
    name: "smartspec.jobs.get",
    family: "jobs",
    namespace: "jobs",
    toolGroup: "job_read",
    description: "Read a specific asynchronous job",
    requiredScope: "jobs:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: getMcpJob,
  },
  {
    name: "smartspec.jobs.cancel",
    family: "jobs",
    namespace: "jobs",
    toolGroup: "job_mutation",
    description: "Cancel a running asynchronous job",
    requiredScope: "jobs:create",
    readWrite: "Write",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["job_id"],
      properties: { job_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: cancelMcpJob,
  },
  {
    name: "smartspec.workspace.read_file",
    family: "workspace",
    namespace: "workspace",
    toolGroup: "workspace_access",
    description: "Read a file from the configured MCP workspace root",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "safe_text",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => workspaceReadFile(args),
  },
  {
    name: "smartspec.workspace.list_directory",
    family: "workspace",
    namespace: "workspace",
    toolGroup: "workspace_access",
    description: "List entries inside the configured MCP workspace root",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => workspaceListDirectory(args),
  },
  {
    name: "smartspec.workspace.write_file",
    family: "workspace",
    namespace: "workspace",
    toolGroup: "workspace_access",
    description: "Write a file into the configured MCP workspace root",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "safe_text",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: { path: { type: "string" }, content: { type: "string" } },
      additionalProperties: false,
    },
    execute: async (args) => workspaceWriteFile(args),
  },
  {
    name: "smartspec.drive.search",
    family: "drive",
    namespace: "drive",
    toolGroup: "drive_access",
    description: "Search files in the connected drive integration",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => forwardDriveTool(DRIVE_TOOL_NAMES.search, args, ctx),
  },
  {
    name: "smartspec.drive.read",
    family: "drive",
    namespace: "drive",
    toolGroup: "drive_access",
    description: "Read file content from the connected drive integration",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "safe_text",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["file_id"],
      properties: { file_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => forwardDriveTool(DRIVE_TOOL_NAMES.read, args, ctx),
  },
  {
    name: "smartspec.drive.list",
    family: "drive",
    namespace: "drive",
    toolGroup: "drive_access",
    description: "List the contents of a connected drive folder",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      properties: { folder_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => forwardDriveTool(DRIVE_TOOL_NAMES.list, args, ctx),
  },
  {
    name: "smartspec.drive.info",
    family: "drive",
    namespace: "drive",
    toolGroup: "drive_access",
    description: "Read metadata for a drive file",
    requiredScope: "mcp:read",
    readWrite: "Read",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["file_id"],
      properties: { file_id: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => forwardDriveTool(DRIVE_TOOL_NAMES.info, args, ctx),
  },
  {
    name: "smartspec.orchestrator.promote_message_to_work_item",
    family: "orchestrator",
    namespace: "orchestrator",
    toolGroup: "orchestrator_write",
    description: "Promote a room message into a tracked work item",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["team_id", "room_id", "message_id", "actor_assistant_id"],
      properties: {
        team_id: { type: "string" },
        room_id: { type: "string" },
        message_id: { type: "string" },
        actor_assistant_id: { type: "string" },
        title: { type: "string", maxLength: 500 },
        objective: { type: "string", maxLength: 4_000 },
        target_step: { type: "string", enum: ["research", "review", "approval"] },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => promoteMessageToWorkItem({
      tenantId: ctx.session.tenantId,
      teamId: String(args.team_id || ""),
      roomId: String(args.room_id || ""),
      messageId: String(args.message_id || ""),
      actorAssistantId: String(args.actor_assistant_id || ""),
      actorUserId: ctx.session.userId,
      title: typeof args.title === "string" ? args.title : undefined,
      objective: typeof args.objective === "string" ? args.objective : undefined,
      targetStep:
        args.target_step === "research" || args.target_step === "review" || args.target_step === "approval"
          ? args.target_step
          : undefined,
    }),
  },
  {
    name: "smartspec.orchestrator.advance_work_item",
    family: "orchestrator",
    namespace: "orchestrator",
    toolGroup: "orchestrator_write",
    description: "Advance a team work item to the next workflow stage",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["team_id", "room_id", "work_item_id", "actor_assistant_id"],
      properties: {
        team_id: { type: "string" },
        room_id: { type: "string" },
        work_item_id: { type: "string" },
        actor_assistant_id: { type: "string" },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => advanceWorkItemByAssistant({
      tenantId: ctx.session.tenantId,
      teamId: String(args.team_id || ""),
      roomId: String(args.room_id || ""),
      workItemId: String(args.work_item_id || ""),
      actorAssistantId: String(args.actor_assistant_id || ""),
      actorUserId: ctx.session.userId,
      replyToMessageId: typeof args.reply_to_message_id === "string" ? args.reply_to_message_id : undefined,
      targetStep:
        args.target_step === "research" || args.target_step === "review" || args.target_step === "approval"
          ? args.target_step
          : undefined,
    }),
  },
  {
    name: "smartspec.orchestrator.approve_work_item",
    family: "orchestrator",
    namespace: "orchestrator",
    toolGroup: "orchestrator_write",
    description: "Approve a work item from the room thread as an assistant reviewer",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["team_id", "room_id", "work_item_id", "actor_assistant_id"],
      properties: {
        team_id: { type: "string" },
        room_id: { type: "string" },
        work_item_id: { type: "string" },
        actor_assistant_id: { type: "string" },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => approveWorkItemByAssistant({
      tenantId: ctx.session.tenantId,
      teamId: String(args.team_id || ""),
      roomId: String(args.room_id || ""),
      workItemId: String(args.work_item_id || ""),
      actorAssistantId: String(args.actor_assistant_id || ""),
      actorUserId: ctx.session.userId,
      replyToMessageId: typeof args.reply_to_message_id === "string" ? args.reply_to_message_id : undefined,
    }),
  },
  {
    name: "smartspec.orchestrator.request_work_item_changes",
    family: "orchestrator",
    namespace: "orchestrator",
    toolGroup: "orchestrator_write",
    description: "Request changes on a work item and route it back into the workflow",
    requiredScope: "agencies:invoke",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "legacy_adapter",
    resultSafetyClass: "structured_json",
    idempotencyMode: "optional",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["team_id", "room_id", "work_item_id", "actor_assistant_id"],
      properties: {
        team_id: { type: "string" },
        room_id: { type: "string" },
        work_item_id: { type: "string" },
        actor_assistant_id: { type: "string" },
      },
      additionalProperties: false,
    },
    execute: async (args, ctx) => requestWorkItemChangesByAssistant({
      tenantId: ctx.session.tenantId,
      teamId: String(args.team_id || ""),
      roomId: String(args.room_id || ""),
      workItemId: String(args.work_item_id || ""),
      actorAssistantId: String(args.actor_assistant_id || ""),
      actorUserId: ctx.session.userId,
      replyToMessageId: typeof args.reply_to_message_id === "string" ? args.reply_to_message_id : undefined,
      reason: typeof args.reason === "string" ? args.reason : undefined,
    }),
  },
  {
    name: "smartspec.browser.execute_actions",
    family: "browser",
    namespace: "browser",
    toolGroup: "browser_automation",
    description: "Execute browser automation actions when browser policy parity is enabled",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
    executionMode: "gated",
    resultSafetyClass: "structured_json",
    idempotencyMode: "required",
    actionClass: "mcp_write",
    inputSchema: {
      type: "object",
      required: ["actions"],
      properties: { actions: { type: "array", items: { type: "object" } } },
      additionalProperties: false,
    },
    availability: async (ctx) => {
      const enabled = await getTenantFeatureFlag("browserTool", ctx.session.tenantId).catch(() => false);
      return enabled ? { available: false, reason: "browser_policy_parity_required" } : { available: false, reason: "browser_tool_disabled" };
    },
    execute: executeBrowserActions,
  },
];

function aliasTargetTool(alias: McpAliasDefinition): McpToolDefinition | null {
  return TOOL_REGISTRY.find((entry) => entry.name === alias.target) ?? null;
}

function aliasArguments(alias: McpAliasDefinition, args: Record<string, unknown>): Record<string, unknown> {
  if (alias.name.startsWith("render.")) {
    if (args.kind !== "remotion") {
      throw Object.assign(new Error("render aliases require kind=remotion"), { code: -32602 });
    }
    const { kind: _kind, ...rest } = args;
    return rest;
  }
  return args;
}

async function executeRemotionListAlias(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  if (args.kind !== "remotion") {
    throw Object.assign(new Error("render.list requires kind=remotion"), { code: -32602 });
  }
  const remotionStatusTool = TOOL_REGISTRY.find((entry) => entry.name === "smartspec.remotion.job.status");
  if (!remotionStatusTool) {
    throw Object.assign(new Error("Tool unavailable: remotion_status_not_configured"), { code: -32603 });
  }
  const availability = await evaluateToolAvailability(remotionStatusTool, ctx);
  if (!availability.available) {
    throw Object.assign(new Error(`Tool unavailable: ${availability.reason}`), { code: -32603 });
  }
  const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
  const offset = Math.min(10_000, Math.max(0, Number(args.offset) || 0));
  return listUserWorkerJobs({
    auth: { tenantId: ctx.session.tenantId, userId: ctx.session.userId },
    jobType: "remotion_render_video",
    limit,
    offset,
  });
}

function projectCatalogTool(tool: McpCatalogTool, name = tool.name, inputSchema = tool.inputSchema): McpCatalogTool {
  return {
    name,
    family: tool.family,
    namespace: tool.namespace,
    toolGroup: tool.toolGroup,
    description: tool.description,
    requiredScope: tool.requiredScope,
    readWrite: tool.readWrite,
    delegatedWorkerEligible: tool.delegatedWorkerEligible,
    executionMode: tool.executionMode,
    resultSafetyClass: tool.resultSafetyClass,
    idempotencyMode: tool.idempotencyMode,
    inputSchema,
    outputSchema: tool.outputSchema ?? { type: "object" },
    schemaVersion: tool.schemaVersion ?? "1",
    cacheScope: tool.cacheScope ?? (tool.readWrite === "Read" ? "private" : "no-store"),
    auditAction: tool.auditAction ?? `mcp.${name}`,
  };
}

function toolAnnotations(tool: McpCatalogTool) {
  return {
    readOnlyHint: tool.readWrite === "Read",
    destructiveHint: tool.readWrite === "Write" && tool.family === "workspace",
    idempotentHint: tool.readWrite === "Read" || tool.idempotencyMode !== "none",
  };
}

export function getMcpRegistryTools(): McpCatalogTool[] {
  const canonical = TOOL_REGISTRY.map((tool) => projectCatalogTool(tool));
  const aliases = MCP_ALIAS_DEFINITIONS.flatMap((alias) => {
    const target = aliasTargetTool(alias)
      ?? (alias.target === "__smartaihub_remotion_list__"
        ? TOOL_REGISTRY.find((entry) => entry.name === "smartspec.remotion.job.status") ?? null
        : null);
    return target ? [projectCatalogTool(target, alias.name, alias.inputSchema ?? target.inputSchema)] : [];
  });
  return [...canonical, ...aliases];
}

export async function describeDelegatedMcpSurface(input: {
  tenantId: string;
  teamId?: string | null;
  actingUserId: number;
  ownerUserId: number;
  workerId: string;
  workerJobId: string;
  delegatedSessionId: string;
  runtimeType: string;
  scopeProfile: string;
  grantedScopes: string[];
  manifestPreview: DelegatedCapabilityManifest;
}): Promise<{
  availableFamilies: string[];
  families: Array<{
    family: string;
    enabled: boolean;
    availableToolCount: number;
    reason: string | null;
  }>;
  availableTools: Array<{
    name: string;
    family: string;
    namespace: string;
    toolGroup: string;
    availability: "ready" | "experimental" | "unavailable";
    reason: string | null;
  }>;
  experimentalTools: Array<{
    name: string;
    family: string;
    namespace: string;
    toolGroup: string;
    availability: "ready" | "experimental" | "unavailable";
    reason: string | null;
  }>;
  disabledTools: Array<{
    name: string;
    family: string;
    namespace: string;
    toolGroup: string;
    availability: "ready" | "experimental" | "unavailable";
    reason: string | null;
  }>;
  familyFlags: {
    browserEnabled: boolean;
    workspaceEnabled: boolean;
    driveEnabled: boolean;
    orchestratorEnabled: boolean;
  };
  operatorPolicy: {
    enabled: boolean;
    disabledFamilies: string[];
    disabledToolGroups: string[];
    approvalRequiredToolGroups: string[];
  };
}> {
  const session: McpToolSession = {
    state: "ready",
    authMode: "delegated_worker",
    tenantId: input.tenantId,
    userId: input.actingUserId,
    apiKeyId: null,
    scopes: [...input.grantedScopes],
    createdAt: new Date().toISOString(),
    ownerUserId: input.ownerUserId,
    workerId: input.workerId,
    workerJobId: input.workerJobId,
    delegatedSessionId: input.delegatedSessionId,
    runtimeType: input.runtimeType,
    scopeProfile: input.scopeProfile,
    teamId: input.teamId ?? null,
  };

  const { tools, hidden } = await listMcpToolsForSession({
    session,
    delegatedManifest: input.manifestPreview,
    idempotencyKey: null,
  });

  const catalog = new Map(getMcpRegistryTools().map((tool) => [tool.name, tool]));
  const availableTools = tools.map((tool) => {
    const meta = catalog.get(tool.name);
    const availability: DelegatedManifestToolAvailability =
      meta?.executionMode === "legacy_adapter" ? "experimental" : "ready";
    return {
      name: tool.name,
      family: meta?.family ?? "gateway",
      namespace: meta?.namespace ?? "gateway",
      toolGroup: meta?.toolGroup ?? "gateway_read",
      availability,
      reason: null,
    };
  });

  const disabledTools = hidden.map((tool) => {
    const meta = catalog.get(tool.name);
    const availability: DelegatedManifestToolAvailability = meta?.executionMode === "gated"
      || tool.reason === "browser_policy_parity_required"
      || tool.reason === "approval_required_by_operator_policy"
      ? "experimental"
      : "unavailable";
    return {
      name: tool.name,
      family: meta?.family ?? "gateway",
      namespace: meta?.namespace ?? "gateway",
      toolGroup: meta?.toolGroup ?? "gateway_read",
      availability,
      reason: tool.reason,
    };
  });

  const experimentalTools = [
    ...availableTools.filter((tool) => tool.availability === "experimental"),
    ...disabledTools.filter((tool) => tool.availability === "experimental"),
  ];
  const availableFamilies = Array.from(new Set(availableTools.map((tool) => tool.family)));
  const families = MCP_TOOL_FAMILIES.map((family) => {
    const familyTools = availableTools.filter((tool) => tool.family === family);
    const familyDisabledReason = disabledTools.find((tool) => tool.family === family)?.reason ?? null;
    return {
      family,
      enabled: familyTools.length > 0,
      availableToolCount: familyTools.length,
      reason: familyTools.length > 0 ? null : familyDisabledReason,
    };
  });
  const operatorPolicy = getDelegatedMcpOperatorPolicySnapshot();

  return {
    availableFamilies,
    families,
    availableTools,
    experimentalTools,
    disabledTools,
    familyFlags: {
      browserEnabled: availableFamilies.includes("browser"),
      workspaceEnabled: availableFamilies.includes("workspace"),
      driveEnabled: availableFamilies.includes("drive"),
      orchestratorEnabled: availableFamilies.includes("orchestrator"),
    },
    operatorPolicy: {
      enabled: operatorPolicy.enabled,
      disabledFamilies: [...operatorPolicy.disabledFamilies],
      disabledToolGroups: [...operatorPolicy.disabledToolGroups],
      approvalRequiredToolGroups: [...operatorPolicy.approvalRequiredToolGroups],
    },
  };
}

export async function listMcpToolsForSession(
  ctx: McpExecutionContext,
): Promise<ToolListContext> {
  const tools: ToolListContext["tools"] = [];
  const hidden: ToolListContext["hidden"] = [];

  for (const tool of TOOL_REGISTRY) {
    const availability = await evaluateToolAvailability(tool, ctx);
    if (!availability.available) {
      hidden.push({ name: tool.name, reason: availability.reason });
      continue;
    }
    if (tool.listVisibleWhen && !(await tool.listVisibleWhen(ctx))) {
      hidden.push({ name: tool.name, reason: "resource_grant_unavailable" });
      continue;
    }
    tools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema ?? { type: "object" },
      requiredScope: tool.requiredScope,
      schemaVersion: tool.schemaVersion ?? "1",
      cacheScope: tool.cacheScope ?? (tool.readWrite === "Read" ? "private" : "no-store"),
      annotations: toolAnnotations(tool),
    });
  }

  const guideAliasesEnabled = await getTenantFeatureFlags(ctx.session.tenantId)
    .then((flags) => flags.mcpGuideToolAliasesEnabled)
    .catch(() => false);
  if (!guideAliasesEnabled) {
    hidden.push(...MCP_ALIAS_DEFINITIONS.map((alias) => ({
      name: alias.name,
      reason: "mcp_guide_aliases_disabled",
    })));
    return { tools, hidden };
  }

  for (const alias of MCP_ALIAS_DEFINITIONS) {
    const target = aliasTargetTool(alias);
    if (!target) {
      if (alias.target === "__smartaihub_remotion_list__") {
        const remotionTarget = TOOL_REGISTRY.find((entry) => entry.name === "smartspec.remotion.job.status");
        if (!remotionTarget) continue;
        const availability = await evaluateToolAvailability(remotionTarget, ctx);
        if (!availability.available) {
          hidden.push({ name: alias.name, reason: availability.reason });
          continue;
        }
        const schema = alias.inputSchema ?? remotionTarget.inputSchema;
        tools.push({
          name: alias.name,
          description: alias.description,
          inputSchema: schema,
          outputSchema: remotionTarget.outputSchema ?? { type: "object" },
          requiredScope: remotionTarget.requiredScope,
          schemaVersion: remotionTarget.schemaVersion ?? "1",
          cacheScope: remotionTarget.cacheScope ?? "private",
          annotations: toolAnnotations(projectCatalogTool(remotionTarget, alias.name, schema)),
        });
      }
      continue;
    }
    const availability = await evaluateToolAvailability(target, ctx);
    if (!availability.available) {
      hidden.push({ name: alias.name, reason: availability.reason });
      continue;
    }
    const schema = alias.inputSchema ?? target.inputSchema;
    tools.push({
      name: alias.name,
      description: alias.description,
      inputSchema: schema,
      outputSchema: target.outputSchema ?? { type: "object" },
      requiredScope: target.requiredScope,
      schemaVersion: target.schemaVersion ?? "1",
      cacheScope: target.cacheScope ?? (target.readWrite === "Read" ? "private" : "no-store"),
      annotations: toolAnnotations(projectCatalogTool(target, alias.name, schema)),
    });
  }

  return { tools, hidden };
}

export async function executeMcpToolByName(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<{ result: unknown; idempotencyRequired: boolean }> {
  const alias = MCP_ALIAS_DEFINITIONS.find((entry) => entry.name === toolName);
  if (alias) {
    const guideAliasesEnabled = await getTenantFeatureFlags(ctx.session.tenantId)
      .then((flags) => flags.mcpGuideToolAliasesEnabled)
      .catch(() => false);
    if (!guideAliasesEnabled) {
      throw Object.assign(new Error("Tool unavailable: mcp_guide_aliases_disabled"), { code: -32603 });
    }
  }
  if (alias?.target === "__smartaihub_remotion_list__") {
    const result = await executeRemotionListAlias(args, ctx);
    return { result: attachContextStateToResult(toolName, ctx, result), idempotencyRequired: false };
  }
  const tool = TOOL_REGISTRY.find((entry) => entry.name === (alias?.target ?? toolName));
  if (!tool) {
    throw Object.assign(new Error("Tool not implemented"), { code: -32601 });
  }

  const inputError = validateMcpSchema(alias?.inputSchema ?? tool.inputSchema, args);
  if (inputError) {
    throw Object.assign(new Error(`Invalid params: ${inputError}`), { code: -32602 });
  }

  const availability = await evaluateToolAvailability(tool, ctx);
  if (!availability.available) {
    throw Object.assign(new Error(`Tool unavailable: ${availability.reason}`), { code: -32603 });
  }

  if (tool.listVisibleWhen && !(await tool.listVisibleWhen(ctx))) {
    throw Object.assign(new Error("Tool unavailable for current grants"), { code: -32603 });
  }

  if (tool.idempotencyMode === "required" && !ctx.idempotencyKey) {
    throw Object.assign(
      new Error("This MCP tool requires params._meta.idempotencyKey"),
      { code: -32602 },
    );
  }

  const rawResult = await tool.execute(alias ? aliasArguments(alias, args) : args, ctx);
  const result = attachContextStateToResult(toolName, ctx, rawResult);
  return {
    result,
    idempotencyRequired: tool.idempotencyMode !== "none",
  };
}

export function buildStaticMcpCatalog(): Record<string, unknown> {
  const tools = getMcpRegistryTools();
  const operatorPolicy = getDelegatedMcpOperatorPolicySnapshot();
  return {
    version: "2026-04-07",
    canonicalEndpoint: "/v1/mcp",
    capabilities: {
      tools: true,
      prompts: false,
      resources: true,
      toolsListChanged: false,
    },
    families: Array.from(new Set(tools.map((tool) => tool.family))).map((family) => ({
      family,
      tools: tools.filter((tool) => tool.family === family).map((tool) => tool.name),
    })),
    operatorPolicy: {
      enabled: operatorPolicy.enabled,
      disabledFamilies: operatorPolicy.disabledFamilies,
      disabledToolGroups: operatorPolicy.disabledToolGroups,
      approvalRequiredToolGroups: operatorPolicy.approvalRequiredToolGroups,
    },
    tools,
  };
}
