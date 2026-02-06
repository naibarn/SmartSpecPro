import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { isAvailable, recordSuccess, recordFailure } from "./providerHealth";
import { logRequest, calculateCost } from "./costTracker";
import { decrypt } from "./crypto";
import type { Message } from "../_core/llm";

// --- Types ---

export interface ProviderCandidate {
  providerId: number;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  providerModelId: string;
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  priority: number;
}

export type ExecuteResult =
  | { type: "success"; response: any; providerId: number; providerName: string }
  | { type: "fallback_required"; from: ProviderCandidate; to: ProviderCandidate; estimatedCredits: number }
  | { type: "error"; error: string; statusCode: number };

// --- Constants ---

const DEFAULT_MAX_FALLBACKS = 3;
const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 10_000;

// --- Provider Resolution ---

export interface ResolveResult {
  candidates: ProviderCandidate[];
  maxFallbacks: number;
}

export async function resolveProviders(modelId: string): Promise<ProviderCandidate[]> {
  const result = await resolveProvidersWithRule(modelId);
  return result.candidates;
}

/**
 * Get the first available provider for a model.
 * Tries model_provider_map first, falls back to legacy first-enabled provider.
 * This is a drop-in replacement for the old getActiveLlmProvider() pattern.
 */
export async function getProviderForModel(modelId: string): Promise<ProviderCandidate | null> {
  // 1. Try multi-provider routing
  const candidates = await resolveProviders(modelId);
  if (candidates.length > 0) {
    return candidates[0];
  }

  // 2. Fall back to legacy: first enabled provider
  const db = await getDb();
  if (!db) return null;

  const [provider] = await db
    .select({
      id: llmProviders.id,
      providerName: llmProviders.providerName,
      baseUrl: llmProviders.baseUrl,
      apiKeyEncrypted: llmProviders.apiKeyEncrypted,
      defaultModel: llmProviders.defaultModel,
    })
    .from(llmProviders)
    .where(eq(llmProviders.isEnabled, true))
    .orderBy(llmProviders.sortOrder)
    .limit(1);

  if (!provider?.apiKeyEncrypted || !provider?.baseUrl) return null;

  const apiKey = decrypt(provider.apiKeyEncrypted);
  if (!apiKey) return null;

  return {
    providerId: provider.id,
    providerName: provider.providerName,
    baseUrl: provider.baseUrl,
    apiKey,
    providerModelId: modelId || provider.defaultModel || "gpt-4o-mini",
    pricingInput: 0,
    pricingOutput: 0,
    isFree: false,
    priority: 0,
  };
}

async function resolveProvidersWithRule(modelId: string): Promise<ResolveResult> {
  const db = await getDb();
  if (!db) return [];

  // 1. Query model_provider_map JOIN llm_providers
  const rows = await db
    .select({
      providerId: modelProviderMap.providerId,
      providerName: llmProviders.providerName,
      baseUrl: llmProviders.baseUrl,
      apiKeyEncrypted: llmProviders.apiKeyEncrypted,
      providerModelId: modelProviderMap.providerModelId,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
      isFree: modelProviderMap.isFree,
      priority: modelProviderMap.priority,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(
      and(
        eq(modelProviderMap.modelId, modelId),
        eq(modelProviderMap.isEnabled, true),
        eq(llmProviders.isEnabled, true),
      )
    );

  // 2. Filter by health
  const healthy = rows.filter((r) => isAvailable(r.providerId));

  // 3. Load routing rules and find best match
  const rules = await db
    .select({
      modelPattern: routingRules.modelPattern,
      routingMode: routingRules.routingMode,
      maxFallbacks: routingRules.maxFallbacks,
      isActive: routingRules.isActive,
      providerOrder: routingRules.providerOrder,
    })
    .from(routingRules)
    .where(eq(routingRules.isActive, true));

  const rule = matchRoutingRule(modelId, rules);
  const mode = rule?.routingMode ?? "cost";

  // 4. Sort candidates
  const candidates = healthy.map((r) => ({
    providerId: r.providerId,
    providerName: r.providerName ?? "Unknown",
    baseUrl: r.baseUrl ?? "",
    apiKey: r.apiKeyEncrypted ? decrypt(r.apiKeyEncrypted) : "",
    providerModelId: r.providerModelId,
    pricingInput: Number(r.pricingInput),
    pricingOutput: Number(r.pricingOutput),
    isFree: r.isFree,
    priority: r.priority,
  }));

  sortCandidates(candidates, mode, rule?.providerOrder);

  return { candidates, maxFallbacks: rule?.maxFallbacks ?? DEFAULT_MAX_FALLBACKS };
}

function matchRoutingRule(
  modelId: string,
  rules: Array<{ modelPattern: string; routingMode: string; maxFallbacks: number; isActive: boolean; providerOrder: any }>,
): typeof rules[number] | null {
  let exactMatch: typeof rules[number] | null = null;
  let globMatch: typeof rules[number] | null = null;
  let wildcardMatch: typeof rules[number] | null = null;

  for (const rule of rules) {
    if (!rule.isActive) continue;

    if (rule.modelPattern === modelId) {
      exactMatch = rule;
    } else if (rule.modelPattern === "*") {
      wildcardMatch = rule;
    } else if (rule.modelPattern.includes("*")) {
      const prefix = rule.modelPattern.replace("*", "");
      if (modelId.startsWith(prefix)) {
        globMatch = rule;
      }
    }
  }

  return exactMatch ?? globMatch ?? wildcardMatch ?? null;
}

function sortCandidates(
  candidates: ProviderCandidate[],
  mode: string,
  providerOrder?: any,
): void {
  if (mode === "priority" && providerOrder) {
    const order: number[] = typeof providerOrder === "string" ? JSON.parse(providerOrder) : providerOrder;
    candidates.sort((a, b) => {
      const aIdx = order.indexOf(a.providerId);
      const bIdx = order.indexOf(b.providerId);
      return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
    });
  } else {
    // Default: cost mode — free first, then by total pricing ascending
    candidates.sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return (a.pricingInput + a.pricingOutput) - (b.pricingInput + b.pricingOutput);
    });
  }
}

// --- Request Execution ---

function isFallbackEligible(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

export async function executeWithFallback(params: {
  model: string;
  messages: Message[];
  stream: boolean;
  userId: number;
  conversationId?: number;
  preferredProvider?: number;
}): Promise<ExecuteResult> {
  const { candidates, maxFallbacks } = await resolveProvidersWithRule(params.model);

  // If preferredProvider, filter to just that one
  let targets: ProviderCandidate[];
  if (params.preferredProvider != null) {
    const preferred = candidates.find((c) => c.providerId === params.preferredProvider);
    targets = preferred ? [preferred] : candidates;
  } else {
    targets = candidates;
  }

  if (targets.length === 0) {
    return { type: "error", error: "No providers available for model", statusCode: 503 };
  }

  // 1 primary + maxFallbacks retries
  const maxAttempts = Math.min(targets.length, maxFallbacks + 1);

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = targets[i];
    const startTime = Date.now();

    try {
      const url = resolveChatUrl(candidate.baseUrl);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidate.providerModelId,
          messages: params.messages,
          stream: params.stream,
        }),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        recordSuccess(candidate.providerId);

        const data = await response.json();
        const inputTokens = data?.usage?.prompt_tokens ?? 0;
        const outputTokens = data?.usage?.completion_tokens ?? 0;

        const costUsd = await calculateCost({
          providerReportedCost: data?.usage?.cost,
          modelId: params.model,
          inputTokens,
          outputTokens,
        });

        logRequest({
          userId: params.userId,
          providerId: candidate.providerId,
          modelUsed: candidate.providerModelId,
          inputTokens,
          outputTokens,
          costUsd,
          creditsCharged: 0,
          responseTimeMs,
          statusCode: 200,
          wasFallback: i > 0,
          fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
        }).catch(() => {});

        return { type: "success", response: data, providerId: candidate.providerId, providerName: candidate.providerName };
      }

      // Error handling
      const statusCode = response.status;
      const errorText = await response.text().catch(() => "Unknown error");

      recordFailure(candidate.providerId, `http_${statusCode}`);

      logRequest({
        userId: params.userId,
        providerId: candidate.providerId,
        modelUsed: candidate.providerModelId,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        creditsCharged: 0,
        responseTimeMs: Date.now() - startTime,
        statusCode,
        errorType: `http_${statusCode}`,
        wasFallback: i > 0,
        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
      }).catch(() => {});

      // Non-retriable client error
      if (!isFallbackEligible(statusCode)) {
        return { type: "error", error: errorText, statusCode };
      }

      // Check free->paid boundary before fallback
      const nextCandidate = targets[i + 1];
      if (nextCandidate && candidate.isFree && !nextCandidate.isFree) {
        const estimatedCredits = Math.ceil(
          ((nextCandidate.pricingInput + nextCandidate.pricingOutput) / 2) * 1000
        );
        return {
          type: "fallback_required",
          from: candidate,
          to: nextCandidate,
          estimatedCredits,
        };
      }

      // Continue to next candidate
    } catch (err: any) {
      recordFailure(candidate.providerId, "network_error");

      logRequest({
        userId: params.userId,
        providerId: candidate.providerId,
        modelUsed: candidate.providerModelId,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        creditsCharged: 0,
        responseTimeMs: Date.now() - startTime,
        statusCode: 0,
        errorType: "network_error",
        wasFallback: i > 0,
        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
      }).catch(() => {});

      // Check free->paid boundary
      const nextCandidate = targets[i + 1];
      if (nextCandidate && candidate.isFree && !nextCandidate.isFree) {
        const estimatedCredits = Math.ceil(
          ((nextCandidate.pricingInput + nextCandidate.pricingOutput) / 2) * 1000
        );
        return { type: "fallback_required", from: candidate, to: nextCandidate, estimatedCredits };
      }
    }
  }

  return { type: "error", error: "All providers failed", statusCode: 502 };
}
