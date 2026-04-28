import { z } from "zod";

export const llmApiStyleSchema = z.enum([
  "chat-completions",
  "responses",
  "messages",
  "gemini",
]);

export const modelSurfaceSchema = z.enum([
  "chat",
  "embedding",
  "parse",
  "guardrail",
  "reward",
  "translation",
  "multimodal",
  "other",
]);

export const llmCatalogExecutionModeSchema = z.enum([
  "public",
  "internal-only",
  "deferred",
]);

export const catalogEligibilitySchema = z.enum([
  "public-chat",
  "manual-only",
  "internal-only",
  "deferred",
  "invalid",
]);

export const catalogInvalidReasonSchema = z.enum([
  "missing-catalog-row",
  "surface-not-chat",
  "execution-mode-not-public",
  "provider-disabled",
  "unknown",
]);

export const llmInputFieldSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  type: z.enum([
    "boolean",
    "number",
    "text",
    "select",
    "json",
    "messages",
    "input",
    "tools",
  ]),
  required: z.boolean().optional(),
  documented: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(
    z.object({
      value: z.string().min(1).max(128),
      label: z.string().min(1).max(128),
    }),
  ).optional(),
  description: z.string().max(512).optional(),
});

export const llmRequestConflictSchema = z.object({
  type: z.literal("xor"),
  fields: z.array(z.string().min(1).max(128)).min(2).max(8),
});

const SAFE_RELATIVE_ENDPOINT_SEGMENTS_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]*$/;
const SAFE_RELATIVE_ENDPOINT_TEMPLATE_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/{}-]*$/;

export function isSafeRelativeEndpointPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  if (value.includes("://") || /[\\\s]/.test(value)) {
    return false;
  }
  return SAFE_RELATIVE_ENDPOINT_SEGMENTS_PATTERN.test(value);
}

export function isSafeRelativeEndpointTemplate(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  if (value.includes("://") || /[\\\s]/.test(value)) {
    return false;
  }
  if (!SAFE_RELATIVE_ENDPOINT_TEMPLATE_PATTERN.test(value)) {
    return false;
  }

  const placeholders = Array.from(value.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
  return placeholders.every((placeholder) => placeholder === "providerModelId");
}

export const llmRequestConfigSchema = z.object({
  requestBodyFormat: z.enum([
    "responses",
    "anthropic-messages",
    "openai-chat-completions",
  ]),
  apiEndpoint: z.string().min(1).max(256)
    .refine(isSafeRelativeEndpointPath, {
      message: "apiEndpoint must be a provider-relative path beginning with /",
    })
    .optional(),
  apiEndpointTemplate: z.string().min(1).max(256)
    .refine(isSafeRelativeEndpointTemplate, {
      message: "apiEndpointTemplate must be a safe provider-relative path template",
    })
    .optional(),
  authStrategy: z.literal("provider-default").optional(),
  supportsStreaming: z.boolean().optional(),
  inputFields: z.array(llmInputFieldSchema).optional(),
  passthroughFields: z.array(z.string().min(1).max(128)).optional(),
  conflicts: z.array(llmRequestConflictSchema).optional(),
});

export const availableLlmProviderModelSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  contextLength: z.number().int().nonnegative().optional(),
  createdAt: z.number().int().nonnegative().optional(),
  pricing: z.object({
    input: z.number().min(0),
    output: z.number().min(0),
  }).optional(),
  apiStyle: llmApiStyleSchema.optional(),
  ownedBy: z.string().min(1).max(128).optional(),
  surface: modelSurfaceSchema.optional(),
  executionMode: llmCatalogExecutionModeSchema.optional(),
  autoSelectionEligible: z.boolean().optional(),
  embeddingDimension: z.number().int().positive().optional(),
  supportsVision: z.boolean().optional(),
  supportsThinking: z.boolean().optional(),
  supportsWebSearch: z.boolean().optional(),
  supportsFunctionTools: z.boolean().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  supportsJsonMode: z.boolean().optional(),
  supportsStrictToolSchema: z.boolean().optional(),
  supportsCodeExecution: z.boolean().optional(),
  supportsComputerUse: z.boolean().optional(),
  supportsBackground: z.boolean().optional(),
  supportsResponses: z.boolean().optional(),
  config: llmRequestConfigSchema.optional(),
});

export type AvailableLlmProviderModel = z.infer<typeof availableLlmProviderModelSchema>;
export type LlmRequestConfig = z.infer<typeof llmRequestConfigSchema>;
export type LlmApiStyle = z.infer<typeof llmApiStyleSchema>;
export type ModelSurface = z.infer<typeof modelSurfaceSchema>;
export type LlmCatalogExecutionMode = z.infer<typeof llmCatalogExecutionModeSchema>;
export type CatalogEligibility = z.infer<typeof catalogEligibilitySchema>;
export type CatalogInvalidReason = z.infer<typeof catalogInvalidReasonSchema>;

export type NvidiaHostedClassification = {
  ownedBy?: string;
  surface: ModelSurface;
  executionMode: LlmCatalogExecutionMode;
  autoSelectionEligible: boolean;
  apiStyle?: "chat-completions";
};

export type NvidiaHostedCatalogModelInput = {
  id: string;
  name?: string | null;
  ownedBy?: string | null;
  contextLength?: number | null;
  createdAt?: number | null;
  pricing?: {
    input?: number | null;
    output?: number | null;
  } | null;
  embeddingDimension?: number | null;
  supportsVision?: boolean | null;
  supportsThinking?: boolean | null;
  supportsResponses?: boolean | null;
  supportsFunctionTools?: boolean | null;
};

export type CatalogEligibilitySnapshot = {
  catalogEligibility: CatalogEligibility;
  catalogInvalidReason?: CatalogInvalidReason;
  ownedBy?: string;
  surface?: ModelSurface;
  executionMode?: LlmCatalogExecutionMode;
  autoSelectionEligible?: boolean;
};

export const KIE_PROVIDER_NAME = "kie_ai";
export const KROUTER_PROVIDER_NAME = "krouter";
export const SAFE_PROVIDER_MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const DEFAULT_UNKNOWN_PAID_MODEL_PRICING = { input: 1, output: 4 };

const NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS = new Set([
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/llama3-chatqa-1.5-70b",
]);

const NVIDIA_PUBLIC_CHAT_MODEL_IDS = new Set([
  ...NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS,
  "nvidia/cosmos-reason2-8b",
  "nvidia/llama-3.1-nemotron-51b-instruct",
  "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/llama3-chatqa-1.5-8b",
  "nvidia/mistral-nemo-minitron-8b-8k-instruct",
  "nvidia/mistral-nemo-minitron-8b-base",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-4-340b-instruct",
  "nvidia/nemotron-4-mini-hindi-4b-instruct",
  "nvidia/nemotron-mini-4b-instruct",
  "nvidia/nemotron-nano-3-30b-a3b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
]);

const NVIDIA_REVIEWED_PARTNER_CHAT_MODEL_IDS = new Set([
  "meta/llama-3.3-70b-instruct",
  "mistralai/mistral-nemotron",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "deepseek-ai/deepseek-v3.1",
  "qwen/qwen3-coder-480b-a35b-instruct",
]);

const NVIDIA_EMBEDDING_MODEL_IDS = new Set([
  "nvidia/embed-qa-4",
  "nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1",
  "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v1",
  "nvidia/llama-3.2-nv-embedqa-1b-v2",
  "nvidia/llama-nemotron-embed-1b-v2",
  "nvidia/llama-nemotron-embed-vl-1b-v2",
  "nvidia/nv-embed-v1",
  "nvidia/nv-embedcode-7b-v1",
  "nvidia/nv-embedqa-e5-v5",
  "nvidia/nv-embedqa-mistral-7b-v2",
  "nvidia/nvclip",
]);

const NVIDIA_PARSE_MODEL_IDS = new Set([
  "nvidia/nemoretriever-parse",
  "nvidia/nemotron-parse",
]);

const NVIDIA_GUARDRAIL_MODEL_IDS = new Set([
  "nvidia/gliner-pii",
  "nvidia/llama-3.1-nemoguard-8b-content-safety",
  "nvidia/llama-3.1-nemoguard-8b-topic-control",
  "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  "nvidia/nemotron-content-safety-reasoning-4b",
]);

const NVIDIA_REWARD_MODEL_IDS = new Set([
  "nvidia/llama-3.1-nemotron-70b-reward",
  "nvidia/nemotron-4-340b-reward",
]);

const NVIDIA_TRANSLATION_MODEL_IDS = new Set([
  "nvidia/riva-translate-4b-instruct",
  "nvidia/riva-translate-4b-instruct-v1.1",
]);

const NVIDIA_MULTIMODAL_MODEL_IDS = new Set([
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
  "nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/neva-22b",
  "nvidia/streampetr",
  "nvidia/vila",
]);

const NVIDIA_REVIEWED_CAPABILITY_OVERLAYS: Record<string, Partial<AvailableLlmProviderModel>> = {
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": {
    apiStyle: "chat-completions",
    supportsThinking: true,
    supportsFunctionTools: true,
    supportsStructuredOutputs: true,
    supportsJsonMode: true,
    supportsStrictToolSchema: true,
  },
  "nvidia/llama-3.1-nemotron-70b-instruct": {
    apiStyle: "chat-completions",
    supportsThinking: true,
    supportsFunctionTools: true,
    supportsStructuredOutputs: true,
    supportsJsonMode: true,
    supportsStrictToolSchema: true,
  },
  "nvidia/llama-3.1-nemotron-nano-8b-v1": {
    apiStyle: "chat-completions",
    supportsThinking: true,
    supportsFunctionTools: true,
    supportsStructuredOutputs: true,
    supportsJsonMode: true,
    supportsStrictToolSchema: true,
  },
  "nvidia/llama3-chatqa-1.5-70b": {
    apiStyle: "chat-completions",
    supportsThinking: true,
    supportsFunctionTools: true,
    supportsStructuredOutputs: true,
  },
};

function trimToUndefined(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase();
}

function buildClassification(input: {
  ownedBy?: string;
  surface: ModelSurface;
  executionMode: LlmCatalogExecutionMode;
  autoSelectionEligible?: boolean;
  apiStyle?: "chat-completions";
}): NvidiaHostedClassification {
  return {
    ownedBy: trimToUndefined(input.ownedBy),
    surface: input.surface,
    executionMode: input.executionMode,
    autoSelectionEligible: input.autoSelectionEligible ?? false,
    apiStyle: input.apiStyle,
  };
}

function includesAnyHint(value: string, hints: string[]): boolean {
  return hints.some((hint) => value.includes(hint));
}

export function classifyNvidiaHostedModel(
  providerModelId: string,
  ownedBy?: string,
): NvidiaHostedClassification {
  const normalizedId = normalizeModelId(providerModelId);
  const normalizedOwner = trimToUndefined(ownedBy)?.toLowerCase();

  if (NVIDIA_EMBEDDING_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "embedding",
      executionMode: "internal-only",
    });
  }

  if (NVIDIA_PARSE_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "parse",
      executionMode: "deferred",
    });
  }

  if (NVIDIA_GUARDRAIL_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "guardrail",
      executionMode: "deferred",
    });
  }

  if (NVIDIA_REWARD_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "reward",
      executionMode: "deferred",
    });
  }

  if (NVIDIA_TRANSLATION_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "translation",
      executionMode: "deferred",
    });
  }

  if (NVIDIA_MULTIMODAL_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "multimodal",
      executionMode: "deferred",
    });
  }

  if (NVIDIA_PUBLIC_CHAT_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS.has(normalizedId),
      apiStyle: "chat-completions",
    });
  }

  if (includesAnyHint(normalizedId, ["guard", "guardian", "safety", "pii"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "guardrail",
      executionMode: "deferred",
    });
  }

  if (includesAnyHint(normalizedId, ["parse"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "parse",
      executionMode: "deferred",
    });
  }

  if (includesAnyHint(normalizedId, ["reward"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "reward",
      executionMode: "deferred",
    });
  }

  if (includesAnyHint(normalizedId, ["translate", "translation"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "translation",
      executionMode: "deferred",
    });
  }

  if (includesAnyHint(normalizedId, ["vlm-embed", "embed-vl", "-vl-", "neva", "streampetr", "vila"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "multimodal",
      executionMode: "deferred",
    });
  }

  if (includesAnyHint(normalizedId, ["embed", "embedding", "retriever", "nvclip"])) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "embedding",
      executionMode: "internal-only",
    });
  }

  if (NVIDIA_REVIEWED_PARTNER_CHAT_MODEL_IDS.has(normalizedId)) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
      apiStyle: "chat-completions",
    });
  }

  if (
    normalizedOwner === "nvidia"
    && (
      normalizedId.includes("chatqa")
      || normalizedId.includes("-instruct")
      || normalizedId.includes("cosmos-reason")
      || normalizedId.includes("/nemotron-")
      || normalizedId.includes("/nvidia-nemotron-")
      || normalizedId.includes("/mistral-nemo-minitron-")
    )
  ) {
    return buildClassification({
      ownedBy: normalizedOwner,
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: NVIDIA_AUTO_ELIGIBLE_CHAT_MODEL_IDS.has(normalizedId),
      apiStyle: "chat-completions",
    });
  }

  return buildClassification({
    ownedBy: normalizedOwner,
    surface: "other",
    executionMode: "deferred",
  });
}

export function buildNvidiaHostedCapabilityOverlay(
  providerModelId: string,
): Partial<AvailableLlmProviderModel> {
  return NVIDIA_REVIEWED_CAPABILITY_OVERLAYS[normalizeModelId(providerModelId)] ?? {};
}

export function buildProviderCatalogLookupKey(providerId: number, providerModelId: string): string {
  return `${providerId}:${providerModelId}`;
}

export function hasCatalogRolloutMetadata(
  model: Pick<AvailableLlmProviderModel, "surface" | "executionMode" | "autoSelectionEligible"> | null | undefined,
): boolean {
  return Boolean(
    model
    && (
      typeof model.surface === "string"
      || typeof model.executionMode === "string"
      || typeof model.autoSelectionEligible === "boolean"
    )
  );
}

export function resolveCatalogEligibility(input: {
  providerName: string;
  providerEnabled: boolean;
  catalogModel?: Pick<
    AvailableLlmProviderModel,
    "ownedBy" | "surface" | "executionMode" | "autoSelectionEligible"
  > | null;
  mappingExists?: boolean;
}): CatalogEligibilitySnapshot {
  const catalogModel = input.catalogModel ?? null;
  const strictCatalogRules = input.providerName === "nvidia_nim" || hasCatalogRolloutMetadata(catalogModel);

  if (!input.providerEnabled) {
    return {
      catalogEligibility: "invalid",
      catalogInvalidReason: "provider-disabled",
      ownedBy: catalogModel?.ownedBy,
      surface: catalogModel?.surface,
      executionMode: catalogModel?.executionMode,
      autoSelectionEligible: catalogModel?.autoSelectionEligible,
    };
  }

  if (!strictCatalogRules) {
    return {
      catalogEligibility: "public-chat",
      ownedBy: catalogModel?.ownedBy,
      surface: catalogModel?.surface,
      executionMode: catalogModel?.executionMode,
      autoSelectionEligible: catalogModel?.autoSelectionEligible,
    };
  }

  if (!catalogModel) {
    return {
      catalogEligibility: input.mappingExists ? "invalid" : "deferred",
      catalogInvalidReason: input.mappingExists ? "missing-catalog-row" : undefined,
    };
  }

  if (catalogModel.surface !== "chat") {
    return {
      catalogEligibility: input.mappingExists
        ? "invalid"
        : catalogModel.executionMode === "internal-only"
          ? "internal-only"
          : "deferred",
      catalogInvalidReason: input.mappingExists ? "surface-not-chat" : undefined,
      ownedBy: catalogModel.ownedBy,
      surface: catalogModel.surface,
      executionMode: catalogModel.executionMode,
      autoSelectionEligible: catalogModel.autoSelectionEligible,
    };
  }

  if (catalogModel.executionMode !== "public") {
    return {
      catalogEligibility: input.mappingExists
        ? "invalid"
        : catalogModel.executionMode === "internal-only"
          ? "internal-only"
          : "deferred",
      catalogInvalidReason: input.mappingExists ? "execution-mode-not-public" : undefined,
      ownedBy: catalogModel.ownedBy,
      surface: catalogModel.surface,
      executionMode: catalogModel.executionMode,
      autoSelectionEligible: catalogModel.autoSelectionEligible,
    };
  }

  return {
    catalogEligibility: catalogModel.autoSelectionEligible ? "public-chat" : "manual-only",
    ownedBy: catalogModel.ownedBy,
    surface: catalogModel.surface,
    executionMode: catalogModel.executionMode,
    autoSelectionEligible: catalogModel.autoSelectionEligible,
  };
}

export function normalizeNvidiaHostedCatalogModel(
  input: NvidiaHostedCatalogModelInput,
): AvailableLlmProviderModel {
  const classification = classifyNvidiaHostedModel(input.id, input.ownedBy ?? undefined);
  const overlay = buildNvidiaHostedCapabilityOverlay(input.id);
  const normalizedName = trimToUndefined(input.name) ?? input.id;
  const normalizedPricing = input.pricing
    && (Number(input.pricing.input ?? 0) > 0 || Number(input.pricing.output ?? 0) > 0)
    ? {
        input: Number(input.pricing.input ?? 0),
        output: Number(input.pricing.output ?? 0),
      }
    : undefined;

  const normalized: AvailableLlmProviderModel = {
    id: input.id,
    name: normalizedName,
    contextLength: input.contextLength ?? undefined,
    createdAt: input.createdAt ?? undefined,
    pricing: normalizedPricing,
    ownedBy: classification.ownedBy,
    surface: classification.surface,
    executionMode: classification.executionMode,
    autoSelectionEligible: classification.autoSelectionEligible,
    apiStyle: classification.apiStyle,
    embeddingDimension: input.embeddingDimension ?? undefined,
    supportsVision: input.supportsVision ?? undefined,
    supportsThinking: input.supportsThinking ?? undefined,
    supportsResponses: input.supportsResponses ?? undefined,
    supportsFunctionTools: input.supportsFunctionTools ?? undefined,
  };

  return {
    ...normalized,
    ...overlay,
    ownedBy: classification.ownedBy ?? normalized.ownedBy,
    surface: classification.surface,
    executionMode: classification.executionMode,
    autoSelectionEligible: classification.autoSelectionEligible,
    apiStyle: classification.apiStyle ?? overlay.apiStyle ?? normalized.apiStyle,
  };
}

function makeField(
  key: string,
  label: string,
  type: z.infer<typeof llmInputFieldSchema>["type"],
  options?: Partial<z.infer<typeof llmInputFieldSchema>>,
) {
  return {
    key,
    label,
    type,
    ...options,
  };
}

function makePricing(input: number, output: number) {
  return { input, output };
}

export function resolveCatalogBackedPricing(input: {
  providerName: string;
  availableModels: Array<{
    id: string;
    pricing?: {
      input?: number;
      output?: number;
    } | null;
  }> | null | undefined;
  providerModelId: string;
  pricingInput?: string | number | null;
  pricingOutput?: string | number | null;
  isFree?: boolean | null;
}): {
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  source: "mapping" | "catalog" | "default";
} {
  const currentInput = Number(input.pricingInput ?? 0);
  const currentOutput = Number(input.pricingOutput ?? 0);
  const hasMappingPricing = currentInput > 0 || currentOutput > 0;
  if (hasMappingPricing) {
    return {
      pricingInput: currentInput,
      pricingOutput: currentOutput,
      isFree: currentInput === 0 && currentOutput === 0,
      source: "mapping",
    };
  }

  const catalogModel = Array.isArray(input.availableModels)
    ? input.availableModels.find((model) => model.id === input.providerModelId) ?? null
    : null;
  const catalogInput = Number(catalogModel?.pricing?.input ?? 0);
  const catalogOutput = Number(catalogModel?.pricing?.output ?? 0);
  const hasCatalogPricing = catalogInput > 0 || catalogOutput > 0;
  if (hasCatalogPricing) {
    return {
      pricingInput: catalogInput,
      pricingOutput: catalogOutput,
      isFree: false,
      source: "catalog",
    };
  }

  if (input.isFree) {
    return {
      pricingInput: 0,
      pricingOutput: 0,
      isFree: true,
      source: "mapping",
    };
  }

  return {
    pricingInput: DEFAULT_UNKNOWN_PAID_MODEL_PRICING.input,
    pricingOutput: DEFAULT_UNKNOWN_PAID_MODEL_PRICING.output,
    isFree: false,
    source: "default",
  };
}

export function buildKieLlmAvailableModels(): AvailableLlmProviderModel[] {
  const sharedResponsesConfig = {
    requestBodyFormat: "responses" as const,
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: ["tools", "tool_choice", "reasoning", "stream", "response_format", "text"],
    conflicts: [{ type: "xor" as const, fields: ["web_search", "function_tools"] }],
  };

  const sharedClaudeConfig = {
    requestBodyFormat: "anthropic-messages" as const,
    apiEndpoint: "/claude/v1/messages",
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: ["tools", "thinkingFlag", "stream", "output_config"],
  };

  const sharedGeminiConfig = {
    requestBodyFormat: "openai-chat-completions" as const,
    apiEndpointTemplate: "/{providerModelId}/v1/chat/completions",
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: [
      "tools",
      "stream",
      "include_thoughts",
      "reasoning_effort",
      "response_format",
    ],
  };

  return [
    {
      id: "gpt-5-4",
      name: "GPT 5.4",
      pricing: makePricing(0.7, 5.6),
      apiStyle: "responses",
      supportsResponses: true,
      supportsVision: true,
      supportsThinking: true,
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: true,
      supportsStrictToolSchema: true,
      config: {
        ...sharedResponsesConfig,
        apiEndpoint: "/codex/v1/responses",
        inputFields: [
          makeField("input", "Input", "input", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
          makeField("text", "Text Config", "json", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
        ],
      },
    },
    ...["gpt-5-codex", "gpt-5.1-codex", "gpt-5.2-codex", "gpt-5.3-codex"].map((id) => ({
      id,
      name: id.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      pricing: makePricing(0.7, 5.6),
      apiStyle: "responses" as const,
      supportsResponses: true,
      supportsVision: true,
      supportsThinking: true,
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: true,
      supportsStrictToolSchema: true,
      config: {
        ...sharedResponsesConfig,
        apiEndpoint: "/api/v1/responses",
        inputFields: [
          makeField("input", "Input", "input", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
          makeField("text", "Text Config", "json", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
        ],
      },
    })),
    ...[
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    ].map((model) => ({
      ...model,
      pricing: model.id === "claude-haiku-4-5"
        ? makePricing(0.35, 1.75)
        : model.id === "claude-opus-4-6"
          ? makePricing(1.75, 8.75)
          : makePricing(1.05, 5.25),
      apiStyle: "messages" as const,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsStrictToolSchema: true,
      config: {
        ...sharedClaudeConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("output_config", "Output Config", "json", { documented: true }),
        ],
      },
    })),
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      pricing: makePricing(1.05, 5.25),
      apiStyle: "messages",
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsStrictToolSchema: true,
      config: {
        ...sharedClaudeConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("output_config", "Output Config", "json", { documented: true }),
        ],
      },
    },
    ...[
      { id: "gemini-3-flash", name: "Gemini 3 Flash" },
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
    ].map((model) => ({
      ...model,
      pricing: model.id === "gemini-3-flash"
        ? makePricing(0.15, 0.9)
        : makePricing(0.5, 3.5),
      apiStyle: "chat-completions" as const,
      supportsVision: true,
      supportsThinking: true,
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: false,
      config: {
        ...sharedGeminiConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("include_thoughts", "Include Thoughts", "boolean", { documented: true }),
          makeField("reasoning_effort", "Reasoning Effort", "select", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
        ],
        conflicts: [
          { type: "xor" as const, fields: ["google_search", "function_tools"] },
          { type: "xor" as const, fields: ["response_format", "function_tools"] },
        ],
      },
    })),
    {
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      pricing: makePricing(0.5, 3.5),
      apiStyle: "chat-completions",
      supportsVision: true,
      supportsThinking: true,
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: false,
      config: {
        ...sharedGeminiConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("include_thoughts", "Include Thoughts", "boolean", { documented: true }),
          makeField("reasoning_effort", "Reasoning Effort", "select", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
        ],
        conflicts: [
          { type: "xor" as const, fields: ["google_search", "function_tools"] },
          { type: "xor" as const, fields: ["response_format", "function_tools"] },
        ],
      },
    },
  ];
}

export function buildKRouterLlmAvailableModels(): AvailableLlmProviderModel[] {
  const sharedChatConfig = {
    requestBodyFormat: "openai-chat-completions" as const,
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: ["tools", "tool_choice", "reasoning", "stream", "response_format"],
  };

  return [
    {
      id: "gpt-5.5",
      name: "GPT 5.5",
      apiStyle: "chat-completions",
      ownedBy: "openai",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      supportsResponses: true,
      supportsVision: true,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: true,
      supportsStrictToolSchema: true,
      config: {
        ...sharedChatConfig,
        apiEndpoint: "/chat/completions",
        inputFields: [
          makeField("messages", "Messages", "json", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
        ],
      },
    },
    {
      id: "cx/gpt-5.3-codex",
      name: "GPT 5.3 Codex",
      apiStyle: "chat-completions",
      ownedBy: "openai",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: false,
      supportsResponses: true,
      supportsVision: true,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsJsonMode: true,
      supportsStrictToolSchema: true,
      supportsCodeExecution: true,
      config: {
        ...sharedChatConfig,
        apiEndpoint: "/chat/completions",
        inputFields: [
          makeField("messages", "Messages", "json", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
          makeField("response_format", "Response Format", "json", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
        ],
      },
    },
  ];
}

export function canonicalModelIdForCatalogModel(
  providerName: string,
  providerModelId: string,
): string {
  if (providerName === KIE_PROVIDER_NAME && providerModelId === "gpt-5-4") {
    return "gpt-5.4";
  }
  if (providerName === KROUTER_PROVIDER_NAME && providerModelId === "cx/gpt-5.3-codex") {
    return "gpt-5.3-codex";
  }
  return providerModelId;
}

export function findCatalogModel(
  availableModels: AvailableLlmProviderModel[] | null | undefined,
  providerModelId: string,
): AvailableLlmProviderModel | null {
  if (!Array.isArray(availableModels)) {
    return null;
  }
  return availableModels.find((model) => model.id === providerModelId) ?? null;
}

export function isSafeProviderModelId(value: string): boolean {
  return SAFE_PROVIDER_MODEL_ID_PATTERN.test(value);
}
