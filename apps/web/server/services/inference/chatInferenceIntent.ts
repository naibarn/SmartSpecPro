import { createHash } from "node:crypto";
import type { Message } from "../../_core/llm";
import type {
  ChatModelSelection,
  ChatSelectionContext,
} from "../chatModelSelection";
import { deriveChatCapabilityRequirements } from "../chatModelSelection";
import {
  inferenceIntentV2Schema,
  type InferenceIntentV2,
} from "./contracts";

const MAX_INPUT_TOKENS = 10_000_000;
const DEFAULT_OUTPUT_TOKEN_RESERVE = 1_024;

export type ChatInferenceIntentInput = {
  messages: Message[];
  selection: ChatModelSelection;
  selectionContext?: ChatSelectionContext | null;
  tenantId: string;
  userId: number;
  traceId: string;
  idempotencyKey: string;
  availableBudgetMicros: number;
  maxTokens?: number;
  resolvedModelProfileId?: string | null;
};

export type ChatInferenceIntentResult =
  | { ok: true; request: InferenceIntentV2 }
  | {
      ok: false;
      reason:
        | "INVALID_SCOPE"
        | "INVALID_IDEMPOTENCY_KEY"
        | "INVALID_BUDGET"
        | "INVALID_TOKEN_RESERVE"
        | "INPUT_TOO_LARGE"
        | "INVALID_INFERENCE_INTENT";
      fields?: string[];
    };

function collectInputModalities(messages: Message[]): InferenceIntentV2["inputModalities"] {
  const modalities = new Set<InferenceIntentV2["inputModalities"][number]>();
  for (const message of messages) {
    if (typeof message.content === "string") {
      modalities.add("text");
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const item = part as { type?: unknown; text?: unknown };
      const type = item.type;
      if (type === "text" || typeof item.text === "string") modalities.add("text");
      if (type === "image_url") modalities.add("image");
      else if (type === "input_audio" || type === "audio" || type === "audio_url") {
        modalities.add("audio");
      } else if (type === "video" || type === "video_url") {
        modalities.add("video");
      } else if (type === "file" || type === "file_url") {
        modalities.add("file");
      }
    }
  }
  if (modalities.size === 0) modalities.add("text");
  return [...modalities].sort();
}

function estimateInputTokens(messages: Message[]): number | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(messages);
  } catch {
    return null;
  }
  const bytes = new TextEncoder().encode(serialized).length;
  const estimate = Math.ceil(bytes / 2) + messages.length * 8;
  return Number.isSafeInteger(estimate) && estimate <= MAX_INPUT_TOKENS
    ? estimate
    : null;
}

function mapSelection(input: {
  selection: ChatModelSelection;
  resolvedModelProfileId?: string | null;
}): InferenceIntentV2["selection"] | null {
  const { selection, resolvedModelProfileId } = input;
  if (selection.mode === "explicit") {
    const modelProfileId = resolvedModelProfileId?.trim();
    if (
      !modelProfileId ||
      (selection.providerId != null &&
        (!Number.isSafeInteger(selection.providerId) || selection.providerId <= 0))
    ) {
      return null;
    }
    return {
      mode: "MODEL_LOCK",
      modelProfileId,
      ...(selection.providerId
        ? { providerId: `provider:llm-provider:${selection.providerId}` }
        : {}),
      fallback: "none",
    };
  }
  if (selection.mode === "auto-global") return { mode: "AUTO" };
  if (!Number.isSafeInteger(selection.providerId) || selection.providerId <= 0) {
    return null;
  }
  return {
    mode: "PROVIDER_LOCK",
    providerId: `provider:llm-provider:${selection.providerId}`,
    fallback: "ask",
  };
}

function mapRequiredFeatures(input: {
  messages: Message[];
  selectionContext?: ChatSelectionContext | null;
}): string[] {
  const { requirements } = deriveChatCapabilityRequirements(input);
  const features = new Set<string>();
  if (requirements.supportsVision) features.add("vision");
  if (requirements.supportsWebSearch) features.add("web_search");
  if (requirements.supportsComputerUse) features.add("computer_use");
  if (requirements.supportsStructuredOutputs) features.add("structured_output");
  if (requirements.supportsFunctionTools) features.add("tool_calling");
  if (requirements.supportsBackground) features.add("background");
  if (requirements.supportsResponses) features.add("responses");
  return [...features].sort();
}

/**
 * Maps server-resolved chat selections into strict Spec 231 intents. Tenant,
 * user, trace, budget, certified model profile and runtime mapping values are
 * supplied by the authenticated server boundary; caller JSON cannot set them.
 */
export function buildChatInferenceIntent(
  input: ChatInferenceIntentInput,
): ChatInferenceIntentResult {
  const tenantId = input.tenantId.trim();
  const traceId = input.traceId.trim();
  if (
    !tenantId ||
    tenantId.length > 36 ||
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0 ||
    !traceId
  ) {
    return { ok: false, reason: "INVALID_SCOPE" };
  }
  const clientIdempotencyKey = input.idempotencyKey.trim();
  if (!clientIdempotencyKey || clientIdempotencyKey.length > 200) {
    return { ok: false, reason: "INVALID_IDEMPOTENCY_KEY" };
  }
  if (
    !Number.isSafeInteger(input.availableBudgetMicros) ||
    input.availableBudgetMicros < 0
  ) {
    return { ok: false, reason: "INVALID_BUDGET" };
  }
  const outputTokenReserve = input.maxTokens ?? DEFAULT_OUTPUT_TOKEN_RESERVE;
  if (
    !Number.isSafeInteger(outputTokenReserve) ||
    outputTokenReserve < 1 ||
    outputTokenReserve > 1_000_000
  ) {
    return { ok: false, reason: "INVALID_TOKEN_RESERVE" };
  }
  const inputTokenEstimate = estimateInputTokens(input.messages);
  if (inputTokenEstimate === null) {
    return { ok: false, reason: "INPUT_TOO_LARGE" };
  }
  const selection = mapSelection({
    selection: input.selection,
    resolvedModelProfileId: input.resolvedModelProfileId,
  });
  if (!selection) return { ok: false, reason: "INVALID_SCOPE" };

  const requestKeyDigest = createHash("sha256")
    .update(`${tenantId}\n${input.userId}\n${clientIdempotencyKey}`)
    .digest("hex");
  const candidate = {
    contract: "SAH-INFERENCE-2",
    requestId: `chat-request:${requestKeyDigest}`,
    traceId,
    tenantId,
    principalId: `user:${input.userId}`,
    consumer: "web.chat",
    taskClass: "chat.response",
    purpose: "chat_response",
    inputModalities: collectInputModalities(input.messages),
    outputModalities: ["text"],
    inputTokenEstimate,
    outputTokenReserve,
    requiredFeatures: mapRequiredFeatures({
      messages: input.messages,
      selectionContext: input.selectionContext,
    }),
    languageHints: [],
    privacyClass: "tenant-confidential",
    zdrRequired: false,
    qualityClass: "standard",
    risk: "medium",
    latencyDeadlineMs: 120_000,
    maxEstimatedCostMicros: input.availableBudgetMicros,
    selection,
    // Required by the strict untrusted-intent schema; trusted planning
    // replaces this marker with the authoritative composed policy revision.
    policyRevision: "chat-request-unbound",
    budgetScopeRef: `tenant:${tenantId}`,
    idempotencyKey: `chat:${requestKeyDigest}`,
  };
  const parsed = inferenceIntentV2Schema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "INVALID_INFERENCE_INTENT",
      fields: [...new Set(parsed.error.issues.map(issue => issue.path.join(".")))].sort(),
    };
  }
  return { ok: true, request: parsed.data };
}
