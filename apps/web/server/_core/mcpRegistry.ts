import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  agencies,
  agencyConversations,
  llmProviders,
  modelProviderMap,
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
} from "../services/libraryService";
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
import { detectSkill } from "../services/skillDetector";
import { agencyBridge } from "../services/agencyBridge";
import { mediaGenerationService } from "../services/mediaGenerationService";
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

export type McpSessionMode = "api_key" | "session" | "bearer" | "delegated_worker";
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
  if (!ctx.session.scopes.includes(tool.requiredScope)) {
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
      throw new Error(result.error);
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

async function searchOwnerLibrary(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  await assertDelegatedWorkerGrant(ctx.session as any, { grantType: "library_search_scope" });
  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "read",
  }, async () =>
    searchLibraryItems(
      {
        query: typeof args.query === "string" ? args.query : undefined,
        limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
        offset: Number.isFinite(Number(args.offset)) ? Number(args.offset) : undefined,
        itemType: typeof args.item_type === "string" ? args.item_type : undefined,
        scope: "my_library",
        filters: {
          ownerUserId: ctx.session.userId,
        },
      } as any,
      {
        userId: ctx.session.userId,
        tenantId: ctx.session.tenantId,
        role: "user",
      } as any,
    ));
}

async function getOwnerLibraryItem(
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const itemId = Number(args.library_item_id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("library_item_id must be a positive integer");
  }
  await assertDelegatedWorkerGrant(ctx.session as any, {
    grantType: "library_item",
    resourceId: itemId,
  });
  const item = await getLibraryItemById(itemId, {
    userId: ctx.session.userId,
    tenantId: ctx.session.tenantId,
    role: "user",
  } as any);
  if (!item) {
    throw new Error("Library item not found");
  }
  return item;
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
  const estimatedCost = Math.ceil((skill.creditMultiplier ?? 1) * 2);

  return runWithDelegatedWorkerExecution({
    auth: ctx.session as any,
    actionClass: "compute",
    estimatedCredits: estimatedCost,
    idempotencyKey: ctx.idempotencyKey,
  }, async () => {
    if (!(await hasEnoughCredits(ctx.session.userId, estimatedCost))) {
      throw new Error("Your account has insufficient credits for this request");
    }
    await deductCredits({
      userId: ctx.session.userId,
      amount: estimatedCost,
      sourceType: "api_skill",
      description: `Skill execution: ${skill.id}`,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.skills.execute", {
        endpoint: "/v1/mcp",
        toolName: "smartspec.skills.execute",
        skillId: skill.id,
      }),
    } as any);

    const prompt = typeof inputs.prompt === "string" ? inputs.prompt : "";
    const { prompt: _prompt, ...rest } = inputs;
    const result = await executeSkill(
      skill,
      {
        prompt,
        model: model ?? skill.defaultModel,
        extraParams: rest,
      } as any,
      ctx.session.userId,
      createInternalTokenFromAuth({ userId: ctx.session.userId }),
      ctx.session.tenantId,
    );

    return {
      result,
      creditsUsed: estimatedCost,
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
        userToken: createInternalTokenFromAuth({ userId: ctx.session.userId }),
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
    createInternalTokenFromAuth({ userId: ctx.session.userId }),
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

async function generateMedia(
  kind: "image" | "video" | "audio",
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<unknown> {
  const userToken = createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate"]);
  const idempotencyKey = ctx.idempotencyKey ?? undefined;
  if (kind === "image") {
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    if (!prompt) {
      throw new Error("prompt is required");
    }
    return runWithDelegatedWorkerExecution({
      auth: ctx.session as any,
      actionClass: "media",
      estimatedCredits: 1,
      idempotencyKey,
    }, async () => {
      const task = await mediaGenerationService.generateImageAsync({
        prompt,
        model: typeof args.model === "string" ? args.model : undefined,
        size:
          Number.isFinite(Number(args.width)) && Number.isFinite(Number(args.height))
            ? `${Number(args.width)}x${Number(args.height)}`
            : undefined,
        aspectRatio: typeof args.aspect_ratio === "string" ? args.aspect_ratio : undefined,
        referenceImageUrls: Array.isArray(args.reference_image_urls)
          ? args.reference_image_urls.filter((item): item is string => typeof item === "string")
          : undefined,
        auditContext: { userId: ctx.session.userId, source: "mcp" },
      }, userToken);

      await deductCredits({
        userId: ctx.session.userId,
        amount: 1,
        sourceType: "api_media",
        description: `Image generation: ${prompt.slice(0, 50)}`,
        idempotencyKey,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.media.generate_image", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.media.generate_image",
        }),
      } as any);

      return { task_id: task.id, status: task.status };
    });
  }

  if (kind === "video") {
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    if (!prompt) {
      throw new Error("prompt is required");
    }
    return runWithDelegatedWorkerExecution({
      auth: ctx.session as any,
      actionClass: "media",
      estimatedCredits: 2,
      idempotencyKey,
    }, async () => {
      const task = await mediaGenerationService.generateVideoAsync({
        prompt,
        model: typeof args.model === "string" ? args.model : undefined,
        duration: Number.isFinite(Number(args.duration_seconds)) ? Number(args.duration_seconds) : undefined,
        aspectRatio: typeof args.aspect_ratio === "string" ? args.aspect_ratio : undefined,
        referenceImageUrls: Array.isArray(args.reference_image_urls)
          ? args.reference_image_urls.filter((item): item is string => typeof item === "string")
          : undefined,
        auditContext: { userId: ctx.session.userId, source: "mcp" },
      }, userToken);

      await deductCredits({
        userId: ctx.session.userId,
        amount: 2,
        sourceType: "api_media",
        description: `Video generation: ${prompt.slice(0, 50)}`,
        idempotencyKey,
        metadata: buildDelegatedWorkerOriginMetadata(ctx.session as any, "mcp.media.generate_video", {
          endpoint: "/v1/mcp",
          toolName: "smartspec.media.generate_video",
        }),
      } as any);

      return { task_id: task.id, status: task.status };
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
      auditContext: { userId: ctx.session.userId, source: "mcp" },
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
    createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate"]),
  );
  return {
    id: task.id,
    status: task.status,
    media_type: task.mediaType,
    result_url: task.resultUrl ?? null,
    credits_used: task.creditsUsed ?? null,
    error: task.errorMessage ?? null,
  };
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
      createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate", "presentation:export"]),
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
    { userToken: createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate", "presentation:export"]) } as any,
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
    createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate", "presentation:export"]),
  );
  if (!status || (status as any).status !== "done") {
    throw new Error("Export not ready");
  }
  const outputUrl = (status as any).outputUrl ?? (status as any).downloadUrl;
  const downloadTarget = resolveExportDownloadTarget(outputUrl);
  if (!downloadTarget) {
    throw new Error("Export file not available");
  }
  return {
    status: (status as any).status,
    format: (status as any).format ?? "pptx",
    output_url: outputUrl,
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
      createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate"]),
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
    createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate"]),
  );
  return {
    id: task.id,
    status: task.status,
    media_type: task.mediaType,
    model: task.model,
    result_url: task.resultUrl ?? null,
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
    createInternalTokenFromAuth({ userId: ctx.session.userId }, ["media:generate"]),
  );
  if (task.status !== "completed" || !task.resultUrl) {
    throw new Error("Export not ready");
  }
  const downloadTarget = resolveExportDownloadTarget(task.resultUrl);
  if (!downloadTarget) {
    throw new Error("Export file not available");
  }
  return {
    id: task.id,
    status: task.status,
    result_url: task.resultUrl,
    download: downloadTarget,
  };
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

const TOOL_REGISTRY: McpToolDefinition[] = [
  {
    name: "smartspec.marketplace_intelligence.search_snapshot.save",
    family: "marketplace_intelligence",
    namespace: "marketplace_intelligence",
    toolGroup: "marketplace_intelligence_write",
    description: "Save Shopee search results obtained by the OpenAI-hosted Shopee app into SmartSpecPro Marketplace Intelligence. Call this only after the upstream Shopee app has returned real search result items.",
    requiredScope: "mcp:write",
    readWrite: "Write",
    delegatedWorkerEligible: false,
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
    description: "Search the owner-bound Library scope granted to this worker job",
    requiredScope: "library:search",
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
        limit: { type: "integer" },
        offset: { type: "integer" },
        item_type: { type: "string" },
      },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) => Boolean(ctx.delegatedManifest?.knowledgeAccess.librarySearch || ctx.session.authMode !== "delegated_worker"),
    execute: searchOwnerLibrary,
  },
  {
    name: "smartspec.knowledge.library.get",
    family: "knowledge",
    namespace: "knowledge",
    toolGroup: "knowledge_read",
    description: "Read a specific owner Library item already granted to this worker job",
    requiredScope: "library:read",
    readWrite: "Read",
    delegatedWorkerEligible: true,
    executionMode: "implemented",
    resultSafetyClass: "structured_json",
    idempotencyMode: "none",
    actionClass: "read",
    inputSchema: {
      type: "object",
      required: ["library_item_id"],
      properties: { library_item_id: { type: "integer" } },
      additionalProperties: false,
    },
    listVisibleWhen: (ctx) =>
      ctx.session.authMode !== "delegated_worker"
      || ((ctx.delegatedManifest?.grantSummary.libraryItemIds?.length ?? 0) > 0 || ctx.delegatedManifest?.knowledgeAccess.libraryRead === true),
    execute: getOwnerLibraryItem,
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
    description: "Generate an image through the platform media stack",
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
      properties: { prompt: { type: "string" }, model: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => generateMedia("image", args, ctx),
  },
  {
    name: "smartspec.media.generate_video",
    family: "media",
    namespace: "media",
    toolGroup: "media_generation",
    description: "Generate a video through the platform media stack",
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
      properties: { prompt: { type: "string" }, model: { type: "string" } },
      additionalProperties: false,
    },
    execute: (args, ctx) => generateMedia("video", args, ctx),
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

function toolAnnotations(tool: McpCatalogTool) {
  return {
    readOnlyHint: tool.readWrite === "Read",
    destructiveHint: tool.readWrite === "Write" && tool.family === "workspace",
    idempotentHint: tool.readWrite === "Read" || tool.idempotencyMode !== "none",
  };
}

export function getMcpRegistryTools(): McpCatalogTool[] {
  return TOOL_REGISTRY.map((tool) => ({
    name: tool.name,
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
    inputSchema: tool.inputSchema,
  }));
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
      annotations: toolAnnotations(tool),
    });
  }

  return { tools, hidden };
}

export async function executeMcpToolByName(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpExecutionContext,
): Promise<{ result: unknown; idempotencyRequired: boolean }> {
  const tool = TOOL_REGISTRY.find((entry) => entry.name === toolName);
  if (!tool) {
    throw Object.assign(new Error("Tool not implemented"), { code: -32601 });
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

  const rawResult = await tool.execute(args, ctx);
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
      resources: false,
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
