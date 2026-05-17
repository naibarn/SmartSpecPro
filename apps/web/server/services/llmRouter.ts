import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { isAvailable, recordSuccess, recordFailure } from "./providerHealth";
import { logRequest, calculateCost, type CostMethod } from "./costTracker";
import { auditLogger } from "./auditLogger";
import { decrypt } from "./crypto";
import { getTraceId } from "./traceContext";
import { calculateCreditsFromCost, calculateCreditsForLLMDynamic } from "./creditService";
import { isFreeModelIdentifier, resolveEnabledLlmModelId } from "./enabledLlmModels";
import { buildModelProviderMapLookupCondition } from "./modelLookup";
import { resolveCatalogBackedPricing } from "./llmProviderCatalog";
import type { Message } from "../_core/llm";

// --- Types ---

export interface ProviderCandidate {
  providerId: number;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  providerModelId: string;
  apiStyle?: "chat-completions" | "responses" | "messages" | "gemini";
  supportsResponses?: boolean;
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  priority: number;
}

type NormalizedResponsesInputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: unknown }
  | { type: "input_file"; file_url: string };

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

export interface ProviderHints {
  /** Prefer this provider ID if available among candidates */
  preferredProviderId?: number;
  /** If true and preferredProviderId is set, return null when the pinned provider is unavailable */
  strictProviderPin?: boolean;
  /** If false, free provider mappings are not eligible. */
  allowFreeModels?: boolean;
}

/**
 * Get the first available provider for a model.
 * Tries model_provider_map first, falls back to legacy first-enabled provider.
 * This is a drop-in replacement for the old getActiveLlmProvider() pattern.
 *
 * When `hints.preferredProviderId` is set, that provider is preferred among candidates.
 * When `hints.strictProviderPin` is also true, no other provider will be returned.
 */
export async function getProviderForModel(
  modelId: string,
  hints?: ProviderHints,
): Promise<ProviderCandidate | null> {
  const resolvedModelId = await resolveEnabledLlmModelId([modelId]);
  if (!resolvedModelId) {
    return null;
  }

  // 1. Try multi-provider routing
  const candidates = await resolveProviders(resolvedModelId);
  const eligibleCandidates = hints?.allowFreeModels === false
    ? candidates.filter((candidate) => candidate.isFree !== true && !isFreeModelIdentifier(candidate.providerModelId))
    : candidates;
  if (eligibleCandidates.length > 0) {
    // Apply provider pinning hints
    if (hints?.preferredProviderId) {
      const pinned = eligibleCandidates.find((c) => c.providerId === hints.preferredProviderId);
      if (pinned) return pinned;
      if (hints.strictProviderPin) return null; // strict pin: no fallback
    }
    return eligibleCandidates[0];
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
    providerModelId: resolvedModelId,
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
      availableModels: llmProviders.availableModels,
      supportsResponses: modelProviderMap.supportsResponses,
      providerModelId: modelProviderMap.providerModelId,
      apiStyle: modelProviderMap.apiStyle,
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
  const candidates = healthy.map((r) => {
    const effectivePricing = resolveCatalogBackedPricing({
      providerName: r.providerName,
      availableModels: r.availableModels,
      providerModelId: r.providerModelId,
      pricingInput: r.pricingInput,
      pricingOutput: r.pricingOutput,
      isFree: r.isFree,
    });
    return {
      providerId: r.providerId,
      providerName: r.providerName ?? "Unknown",
      baseUrl: r.baseUrl ?? "",
      apiKey: r.apiKeyEncrypted ? decrypt(r.apiKeyEncrypted) : "",
      providerModelId: r.providerModelId,
      apiStyle: r.apiStyle ?? undefined,
      supportsResponses: r.supportsResponses ?? undefined,
      pricingInput: effectivePricing.pricingInput,
      pricingOutput: effectivePricing.pricingOutput,
      isFree: effectivePricing.isFree,
      priority: r.priority,
    };
  });

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

function isFallbackEligible(statusCode: number, errorMessage?: string): boolean {
  if (statusCode === 429 || statusCode >= 500) {
    return true;
  }

  if (statusCode !== 400 || !errorMessage) {
    return false;
  }

  const normalized = errorMessage.toLowerCase();
  return [
    "invalid model",
    "not a valid model",
    "unsupported request fields",
    "unsupported field",
    "response_format",
    "does not allow",
    "invalid_request_error",
    "unknown model",
    "model not found",
  ].some((pattern) => normalized.includes(pattern));
}

function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function resolveResponsesUrl(baseUrl: string, providerName: string, modelId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const providerLower = providerName.toLowerCase();

  if (providerLower === "kie_ai") {
    if (modelId === "gpt-5-4") {
      return `${base}/codex/v1/responses`;
    }
    return `${base}/api/v1/responses`;
  }

  if (base.includes("/v1")) return `${base}/responses`;
  return `${base}/v1/responses`;
}

function normalizeResponsesInputContent(
  content: unknown,
): string | NormalizedResponsesInputPart[] {
  if (typeof content === "string") {
    const text = content.trim();
    return text;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") {
          const text = part.trim();
          return text ? { type: "input_text", text } : null;
        }
        if (!part || typeof part !== "object") {
          return null;
        }
        const record = part as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return { type: "input_text", text: record.text };
        }
        if (record.type === "input_text" && typeof record.text === "string") {
          return { type: "input_text", text: record.text };
        }
        if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
          const imageUrl = (record.image_url as Record<string, unknown>).url;
          if (typeof imageUrl === "string" && imageUrl.trim()) {
            return {
              type: "input_image",
              image_url: imageUrl,
              ...(typeof (record.image_url as Record<string, unknown>).detail === "string"
                ? { detail: (record.image_url as Record<string, unknown>).detail }
                : {}),
            };
          }
        }
        if (record.type === "file_url" && record.file_url && typeof record.file_url === "object") {
          const fileUrl = (record.file_url as Record<string, unknown>).url;
          if (typeof fileUrl === "string" && fileUrl.trim()) {
            return {
              type: "input_file",
              file_url: fileUrl,
            };
          }
        }
        return null;
      })
        .filter((part): part is NormalizedResponsesInputPart => part !== null);

    if (parts.length === 0) {
      return "";
    }

    if (parts.every((part) => part.type === "input_text")) {
      const textParts = parts as Array<{ type: "input_text"; text: string }>;
      return textParts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .filter((part) => part.length > 0)
        .join("\n");
    }
    return parts;
  }

  if (content && typeof content === "object") {
    return normalizeResponsesInputContent([content]);
  }

  return "";
}

function extractResponsesTextFromContent(content: unknown): string {
  const normalized = normalizeResponsesInputContent(content);
  if (typeof normalized === "string") {
    return normalized;
  }
  return normalized
    .map((part) => (part.type === "input_text" && typeof part.text === "string" ? part.text : ""))
    .filter((part) => part.length > 0)
    .join("\n");
}

function extractPlainTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    if (content && typeof content === "object") {
      const record = content as Record<string, unknown>;
      if (typeof record.text === "string") {
        return record.text.trim();
      }
      if (typeof record.content === "string") {
        return record.content.trim();
      }
    }
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part.trim();
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") {
        return record.text.trim();
      }
      if (typeof record.content === "string") {
        return record.content.trim();
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
}

function toAnthropicTextBlocks(content: unknown): Array<Record<string, unknown>> {
  const text = extractPlainTextContent(content);
  return text.length > 0 ? [{ type: "text", text }] : [];
}

function buildAnthropicMessages(messages: Array<{ role?: string; content?: unknown }>): Array<Record<string, unknown>> {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: toAnthropicTextBlocks(message.content),
    }))
    .filter((message) => Array.isArray(message.content) && message.content.length > 0);
}

function resolveMessagesUrl(baseUrl: string, providerName: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const providerLower = providerName.toLowerCase();

  if (providerLower === "kie_ai") {
    return `${base}/claude/v1/messages`;
  }
  if (providerLower === "anthropic") {
    return base.includes("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  }
  return base.includes("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

function resolveGeminiUrl(baseUrl: string, modelId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/models/${modelId}:generateContent`;
}

function extractResponsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const record = item as Record<string, unknown>;
      if (record.type === "message" && Array.isArray(record.content)) {
        return record.content.flatMap((part) => {
          if (!part || typeof part !== "object") {
            return [];
          }
          const contentPart = part as Record<string, unknown>;
          if (typeof contentPart.text === "string") {
            return [contentPart.text];
          }
          if (typeof contentPart.content === "string") {
            return [contentPart.content];
          }
          return [];
        });
      }
      if (record.type === "message" && typeof record.content === "string") {
        return [record.content];
      }
      if (record.type === "output_text" && typeof record.text === "string") {
        return [record.text];
      }
      return [];
    })
    .join("");
}

function extractAnyAssistantText(rawData: any): string {
  const directOutputText = typeof rawData?.output_text === "string"
    ? rawData.output_text
    : typeof rawData?.response?.output_text === "string"
      ? rawData.response.output_text
      : "";
  if (directOutputText) {
    return directOutputText;
  }

  const responsesOutputText = extractResponsesOutputText(rawData?.output ?? rawData?.response?.output);
  if (responsesOutputText) {
    return responsesOutputText;
  }

  const chatLikeMessageContent = rawData?.choices?.[0]?.message?.content;
  if (typeof chatLikeMessageContent === "string") {
    return chatLikeMessageContent;
  }
  if (Array.isArray(chatLikeMessageContent)) {
    return chatLikeMessageContent
      .flatMap((part) => {
        if (typeof part === "string") return [part];
        if (!part || typeof part !== "object") return [];
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") return [record.text];
        if (typeof record.content === "string") return [record.content];
        return [];
      })
      .join("");
  }

  if (typeof rawData?.content === "string") {
    return rawData.content;
  }
  if (typeof rawData?.response?.content === "string") {
    return rawData.response.content;
  }

  return "";
}

function normalizeResponsesApiResponseToChatCompletion(rawData: any, requestedModelId: string) {
  const inputTokens = Number(rawData?.usage?.input_tokens ?? rawData?.usage?.prompt_tokens ?? 0);
  const outputTokens = Number(rawData?.usage?.output_tokens ?? rawData?.usage?.completion_tokens ?? 0);
  const totalTokens = Number(rawData?.usage?.total_tokens ?? (inputTokens + outputTokens));

  return {
    id: rawData?.id ?? `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: rawData?.model ?? requestedModelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: extractAnyAssistantText(rawData),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      ...(rawData?.usage?.cost !== undefined ? { cost: rawData.usage.cost } : {}),
    },
  };
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

function buildProviderErrorSummary(args: {
  statusCode: number;
  contentType: string;
  rawErrorText: string;
  parsedErrorMessage: string;
}): string {
  const preview = compactText(args.rawErrorText.replace(/\s+/g, " "), 240);
  const parsed = compactText(args.parsedErrorMessage, 240);

  if (parsed && parsed !== "Provider returned error") {
    return parsed;
  }

  const previewPart = preview ? `: ${preview}` : "";
  return `HTTP ${args.statusCode} from provider${previewPart}`;
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
  strictProviderPin?: boolean;
  /** When true, sends reasoning.effort="high" for thinking mode (OpenRouter) */
  enableThinking?: boolean;
  /** Max output tokens. When omitted the provider uses its own default. */
  maxTokens?: number;
  /** Sampling temperature. When omitted the provider uses its own default. */
  temperature?: number;
  /** Extra body params forwarded verbatim to the provider (e.g. response_format). */
  extraBodyParams?: Record<string, unknown>;
  /** When true, only the first resolved provider is attempted. */
  disableProviderFallbacks?: boolean;
  /** If false, free provider mappings are filtered out before routing. */
  allowFreeModels?: boolean;
}): Promise<ExecuteResult> {
  const resolvedModel = await resolveEnabledLlmModelId([params.model]);
  if (!resolvedModel) {
    return { type: "error", error: "No enabled LLM model configured", statusCode: 503 };
  }

  const resolvedProviderSet = await resolveProvidersWithRule(resolvedModel);
  const candidates = params.allowFreeModels === false
    ? resolvedProviderSet.candidates.filter((candidate) => (
      candidate.isFree !== true && !isFreeModelIdentifier(candidate.providerModelId)
    ))
    : resolvedProviderSet.candidates;
  const maxFallbacks = resolvedProviderSet.maxFallbacks;
  const failureDetails: AttemptFailureDetail[] = [];

  // If preferredProvider, filter to just that one
  let targets: ProviderCandidate[];
  if (params.preferredProvider != null) {
    const preferred = candidates.find((c) => c.providerId === params.preferredProvider);
    if (preferred) {
      targets = [preferred];
    } else if (params.strictProviderPin) {
      return {
        type: "error",
        error: "Pinned provider is not available for the selected model",
        statusCode: 503,
      };
    } else {
      targets = candidates;
    }
  } else {
    targets = candidates;
  }

  if (targets.length === 0) {
    return { type: "error", error: "No providers available for model", statusCode: 503 };
  }

  // 1 primary + optional provider fallbacks.
  const maxAttempts = params.disableProviderFallbacks
    ? 1
    : Math.min(targets.length, maxFallbacks + 1);

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = targets[i];
    const startTime = Date.now();

    try {
      const requestApiStyle = candidate.apiStyle ?? "chat-completions";
      const shouldUseResponses =
        requestApiStyle === "responses" && candidate.supportsResponses !== false;
      const shouldUseMessages =
        requestApiStyle === "messages" || candidate.providerName.toLowerCase() === "anthropic";
      const shouldUseGemini =
        requestApiStyle === "gemini"
        || candidate.providerName.toLowerCase() === "google"
        || candidate.providerName.toLowerCase().includes("gemini");
      const url = shouldUseResponses
        ? resolveResponsesUrl(candidate.baseUrl, candidate.providerName, candidate.providerModelId)
        : shouldUseMessages
          ? resolveMessagesUrl(candidate.baseUrl, candidate.providerName)
          : shouldUseGemini
            ? resolveGeminiUrl(candidate.baseUrl, candidate.providerModelId)
            : resolveChatUrl(candidate.baseUrl);

      const requestBody = shouldUseResponses
        ? {
            model: candidate.providerModelId,
            input: params.messages
              .filter((message) => message.role !== "system")
              .map((message) => ({
                role: message.role === "assistant" ? "assistant" : "user",
                content: normalizeResponsesInputContent(message.content),
              })),
            ...(params.messages
              .filter((message) => message.role === "system")
              .length > 0
              ? {
                  instructions: params.messages
                    .filter((message) => message.role === "system")
                    .map((message) => extractResponsesTextFromContent(message.content))
                    .filter((part) => part.length > 0)
                    .join("\n\n"),
                }
              : {}),
            stream: params.stream,
            ...(params.maxTokens != null ? { max_output_tokens: params.maxTokens } : {}),
            ...(params.temperature != null ? { temperature: params.temperature } : {}),
            ...(params.enableThinking ? { reasoning: { effort: "high" } } : {}),
            ...(() => {
              const incomingText =
                params.extraBodyParams?.text !== undefined
                && typeof params.extraBodyParams.text === "object"
                && !Array.isArray(params.extraBodyParams.text)
                  ? { ...(params.extraBodyParams.text as Record<string, unknown>) }
                  : undefined;

              if (params.extraBodyParams?.response_format !== undefined) {
                return {
                  text: {
                    ...(incomingText ?? {}),
                    format: params.extraBodyParams.response_format,
                  },
                };
              }

              return incomingText ? { text: incomingText } : {};
            })(),
          }
        : shouldUseMessages
          ? {
              model: candidate.providerModelId,
              max_tokens: params.maxTokens != null ? params.maxTokens : 4096,
              stream: params.stream,
              ...(params.messages
                .filter((message) => message.role === "system")
                .length > 0
                ? {
                    system: params.messages
                      .filter((message) => message.role === "system")
                      .map((message) => extractPlainTextContent(message.content))
                      .filter((part) => part.length > 0)
                      .join("\n\n"),
                  }
                : {}),
              messages: buildAnthropicMessages(params.messages),
              ...(params.temperature != null ? { temperature: params.temperature } : {}),
              ...(params.extraBodyParams?.metadata !== undefined ? { metadata: params.extraBodyParams.metadata } : {}),
              ...(params.extraBodyParams?.tools !== undefined ? { tools: params.extraBodyParams.tools } : {}),
              ...(params.extraBodyParams?.tool_choice !== undefined ? { tool_choice: params.extraBodyParams.tool_choice } : {}),
              ...(params.enableThinking ? { thinkingFlag: true } : {}),
            }
          : shouldUseGemini
            ? {
                contents: params.messages
                  .filter((message) => message.role !== "system")
                  .map((message) => ({
                    role: message.role === "assistant" ? "model" : "user",
                    parts: [{ text: extractPlainTextContent(message.content) }],
                  })),
                ...(params.messages
                  .filter((message) => message.role === "system")
                  .length > 0
                  ? {
                      systemInstruction: {
                        parts: [{
                          text: params.messages
                            .filter((message) => message.role === "system")
                            .map((message) => extractPlainTextContent(message.content))
                            .filter((part) => part.length > 0)
                            .join("\n\n"),
                        }],
                      },
                    }
                  : {}),
                generationConfig: {
                  maxOutputTokens: params.maxTokens != null ? params.maxTokens : 8192,
                  temperature: params.temperature ?? 1.0,
                },
              }
            : {
                model: candidate.providerModelId,
                messages: params.messages,
                stream: params.stream,
                ...(params.maxTokens != null ? { max_tokens: params.maxTokens } : {}),
                ...(params.temperature != null ? { temperature: params.temperature } : {}),
                ...(params.enableThinking ? { reasoning: { effort: "high" } } : {}),
                ...(() => {
                  const extraBodyParams = params.extraBodyParams ?? {};
                  const { provider: providerFromExtra, ...restExtraBodyParams } = extraBodyParams as Record<string, unknown>;
                  const openRouterNeedsProviderGuard =
                    candidate.providerName.toLowerCase() === "openrouter"
                    && restExtraBodyParams.response_format !== undefined;
                  const providerFromRequest =
                    providerFromExtra && typeof providerFromExtra === "object" && !Array.isArray(providerFromExtra)
                      ? (providerFromExtra as Record<string, unknown>)
                      : undefined;
                  const provider = openRouterNeedsProviderGuard
                    ? { ...(providerFromRequest ?? {}), require_parameters: true }
                    : providerFromRequest;

                  return {
                    ...(provider ? { provider } : {}),
                    ...restExtraBodyParams,
                  };
                })(),
              };

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
      const abortController = new AbortController();
      const fetchTimeout = setTimeout(() => abortController.abort(), 120_000); // 2 min timeout
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });
      clearTimeout(fetchTimeout);
      const networkMs = Date.now() - fetchStart;

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        recordSuccess(candidate.providerId);

        const parseStart = Date.now();
        let responseText = "";
        if (typeof response.text === "function") {
          responseText = await response.text();
        } else if (typeof response.json === "function") {
          responseText = JSON.stringify(await response.json());
        }
        let data: any;
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          const contentType = response.headers?.get?.("content-type") || "unknown";
          const responsePreview = compactText(responseText.replace(/\s+/g, " "), 240);
          throw new Error(
            `Provider returned ${contentType.includes("json") ? "malformed JSON" : "non-JSON response"} (${contentType})${responsePreview ? `: ${responsePreview}` : ""}`,
          );
        }
        if (requestApiStyle === "responses") {
          data = normalizeResponsesApiResponseToChatCompletion(data, candidate.providerModelId);
        }
        const parseMs = Date.now() - parseStart;
        const inputTokens = data?.usage?.prompt_tokens ?? 0;
        const outputTokens = data?.usage?.completion_tokens ?? 0;

        const { cost: costUsd, method: costMethod } = await calculateCost({
          providerReportedCost: data?.usage?.cost,
          modelId: params.model,
          inputTokens,
          outputTokens,
        });
        const creditsCharged = params.userId > 0
          ? Number.isFinite(costUsd) && costUsd > 0
            ? calculateCreditsFromCost(costUsd)
            : Math.max(1, await calculateCreditsForLLMDynamic(inputTokens, outputTokens, params.model))
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
      const contentType = response.headers?.get?.("content-type") || "unknown";
      const parsedProviderError = parseProviderErrorMessage(errorText);
      const parsedErrorMessage = parsedProviderError.code
        ? `${parsedProviderError.code}: ${parsedProviderError.message}`
        : parsedProviderError.message;
      const detailedErrorMessage = buildProviderErrorSummary({
        statusCode,
        contentType,
        rawErrorText: errorText,
        parsedErrorMessage,
      });

      failureDetails.push({
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        providerModelId: candidate.providerModelId,
        statusCode,
        errorType: `http_${statusCode}`,
        errorMessage: detailedErrorMessage,
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
        errorMessage: detailedErrorMessage.slice(0, 500),
        timing: { networkMs, totalMs: Date.now() - startTime },
        wasFallback: i > 0,
        fallbackAttempt: i,
        fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
        responsePayload: {
          contentType,
          bodyPreview: compactText(errorText.replace(/\s+/g, " "), 400),
          bodyLength: errorText.length,
        },
      });

      // Non-retriable client error — truncate error text to avoid leaking provider internals
      if (!isFallbackEligible(statusCode, detailedErrorMessage)) {
        return { type: "error", error: detailedErrorMessage.slice(0, 500), statusCode };
      }

      recordFailure(candidate.providerId, `http_${statusCode}`);

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
    model: resolvedModel,
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
