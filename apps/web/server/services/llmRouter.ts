import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { isAvailable, recordSuccess, recordFailure } from "./providerHealth";
import { logRequest, calculateCost, type CostMethod } from "./costTracker";
import { auditLogger } from "./auditLogger";
import { decrypt } from "./crypto";
import { getTraceId } from "./traceContext";
import { calculateCreditsFromCost } from "./creditService";
import { buildModelProviderMapLookupCondition } from "./modelLookup";
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

interface AttemptFailureDetail {
  providerId: number;
  providerName: string;
  providerModelId: string;
  statusCode: number;
  errorType: string;
  errorMessage: string;
}

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
  if (!db) return { candidates: [], maxFallbacks: 0 };
  const lookupCondition = buildModelProviderMapLookupCondition(modelId);

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
        lookupCondition,
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

function compactText(text: string, max = 180): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseProviderErrorMessage(raw: string): { code?: string; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { message: "Unknown provider error" };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const nestedError = parsed.error && typeof parsed.error === "object"
      ? parsed.error as Record<string, unknown>
      : undefined;

    const code = nestedError?.code ?? parsed.code;
    const message =
      nestedError?.message
      ?? parsed.message
      ?? parsed.detail
      ?? parsed.error
      ?? trimmed;

    return {
      code: typeof code === "string" ? compactText(code, 80) : undefined,
      message: compactText(String(message), 240),
    };
  } catch {
    return { message: compactText(trimmed, 240) };
  }
}

function buildAggregatedFailureMessage(details: AttemptFailureDetail[]): string {
  if (details.length === 0) {
    return "All providers failed";
  }

  const summary = details
    .map((d, index) => {
      const base = `attempt ${index + 1} ${d.providerName}(${d.providerModelId})`;
      const codePart = d.errorType === `http_${d.statusCode}`
        ? `HTTP ${d.statusCode}`
        : d.errorType;
      return `${base}: ${codePart} - ${compactText(d.errorMessage, 120)}`;
    })
    .join("; ");

  return `All providers failed after ${details.length} attempt(s): ${summary}`;
}

function toAuditMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return compactText(content, 4000);
  }
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "type" in item && (item as { type?: unknown }).type === "text") {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return compactText(textParts, 4000);
  }
  return compactText(String(content ?? ""), 4000);
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
  const failureDetails: AttemptFailureDetail[] = [];

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

      // Log LLM request to JSONL audit trail (scrub message content for PII safety)
      auditLogger.log({
        eventType: "llm_request",
        userId: params.userId,
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        model: candidate.providerModelId,
        requestType: "chat",
        requestPayload: {
          messageCount: params.messages.length,
          messages: params.messages.map((m) => {
            const content = toAuditMessageContent(m.content);
            return {
              role: m.role,
              content,
              contentLength: content.length,
            };
          }),
          model: candidate.providerModelId,
          stream: params.stream,
        },
      });

      const fetchStart = Date.now();
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
      const networkMs = Date.now() - fetchStart;

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        recordSuccess(candidate.providerId);

        const parseStart = Date.now();
        const data = await response.json();
        const parseMs = Date.now() - parseStart;
        const inputTokens = data?.usage?.prompt_tokens ?? 0;
        const outputTokens = data?.usage?.completion_tokens ?? 0;

        const { cost: costUsd, method: costMethod } = await calculateCost({
          providerReportedCost: data?.usage?.cost,
          modelId: params.model,
          inputTokens,
          outputTokens,
        });
        const creditsCharged =
          params.userId > 0 && Number.isFinite(costUsd) && costUsd > 0
            ? calculateCreditsFromCost(costUsd)
            : 0;

        logRequest({
          userId: params.userId,
          providerId: candidate.providerId,
          modelUsed: candidate.providerModelId,
          inputTokens,
          outputTokens,
          costUsd,
          creditsCharged,
          responseTimeMs,
          statusCode: 200,
          wasFallback: i > 0,
          fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
          traceId: getTraceId(),
        }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));

        // Log LLM response to JSONL audit trail (with full payload for transparency)
        auditLogger.log({
          eventType: "llm_response",
          userId: params.userId,
          providerId: candidate.providerId,
          providerName: candidate.providerName,
          model: candidate.providerModelId,
          inputTokens,
          outputTokens,
          costUsd,
          creditsCharged,
          costCalculationMethod: costMethod,
          timing: { networkMs, parseMs, totalMs: responseTimeMs },
          wasFallback: i > 0,
          fallbackAttempt: i,
          fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
          statusCode: 200,
          responsePayload: {
            usage: {
              prompt_tokens: data?.usage?.prompt_tokens,
              completion_tokens: data?.usage?.completion_tokens,
              total_tokens: data?.usage?.total_tokens,
            },
            choiceCount: data?.choices?.length ?? 0,
            finishReason: data?.choices?.[0]?.finish_reason ?? null,
            assistantPreview: toAuditMessageContent(data?.choices?.[0]?.message?.content ?? ""),
          },
        });

        return { type: "success", response: data, providerId: candidate.providerId, providerName: candidate.providerName };
      }

      // Error handling
      const statusCode = response.status;
      const errorText = await response.text().catch(() => "Unknown error");
      const parsedProviderError = parseProviderErrorMessage(errorText);
      const parsedErrorMessage = parsedProviderError.code
        ? `${parsedProviderError.code}: ${parsedProviderError.message}`
        : parsedProviderError.message;

      recordFailure(candidate.providerId, `http_${statusCode}`);
      failureDetails.push({
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        providerModelId: candidate.providerModelId,
        statusCode,
        errorType: `http_${statusCode}`,
        errorMessage: parsedErrorMessage,
      });

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
        traceId: getTraceId(),
      }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));

      // Log LLM error to JSONL audit trail
      auditLogger.log({
        eventType: "llm_response",
        userId: params.userId,
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        model: candidate.providerModelId,
        statusCode,
        errorType: `http_${statusCode}`,
        errorMessage: parsedErrorMessage.slice(0, 500),
        timing: { networkMs, totalMs: Date.now() - startTime },
        wasFallback: i > 0,
        fallbackAttempt: i,
        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
      });

      // Non-retriable client error — truncate error text to avoid leaking provider internals
      if (!isFallbackEligible(statusCode)) {
        return { type: "error", error: parsedErrorMessage.slice(0, 500), statusCode };
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
      const networkMessage = compactText(
        err instanceof Error ? err.message : String(err ?? "Unknown network error"),
        240,
      );
      failureDetails.push({
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        providerModelId: candidate.providerModelId,
        statusCode: 0,
        errorType: "network_error",
        errorMessage: networkMessage,
      });

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
        traceId: getTraceId(),
      }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));

      auditLogger.log({
        eventType: "llm_response",
        userId: params.userId,
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        model: candidate.providerModelId,
        statusCode: 0,
        errorType: "network_error",
        errorMessage: networkMessage.slice(0, 500),
        timing: { totalMs: Date.now() - startTime },
        wasFallback: i > 0,
        fallbackAttempt: i,
        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
      });

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

  const aggregatedError = buildAggregatedFailureMessage(failureDetails);
  auditLogger.log({
    eventType: "llm_response",
    userId: params.userId,
    model: params.model,
    statusCode: 502,
    errorType: "all_providers_failed",
    errorMessage: aggregatedError.slice(0, 500),
    metadata: {
      attempts: failureDetails.map((detail, index) => ({
        attempt: index + 1,
        providerId: detail.providerId,
        providerName: detail.providerName,
        providerModelId: detail.providerModelId,
        statusCode: detail.statusCode,
        errorType: detail.errorType,
        errorMessage: detail.errorMessage,
      })),
    },
  });
  return { type: "error", error: aggregatedError, statusCode: 502 };
}
