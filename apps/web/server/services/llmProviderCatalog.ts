import { z } from "zod";

export const llmApiStyleSchema = z.enum([
  "chat-completions",
  "responses",
  "messages",
  "gemini",
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
  supportsVision: z.boolean().optional(),
  supportsThinking: z.boolean().optional(),
  supportsWebSearch: z.boolean().optional(),
  supportsFunctionTools: z.boolean().optional(),
  supportsStructuredOutputs: z.boolean().optional(),
  supportsCodeExecution: z.boolean().optional(),
  supportsComputerUse: z.boolean().optional(),
  supportsBackground: z.boolean().optional(),
  supportsResponses: z.boolean().optional(),
  config: llmRequestConfigSchema.optional(),
});

export type AvailableLlmProviderModel = z.infer<typeof availableLlmProviderModelSchema>;
export type LlmRequestConfig = z.infer<typeof llmRequestConfigSchema>;
export type LlmApiStyle = z.infer<typeof llmApiStyleSchema>;

export const KIE_PROVIDER_NAME = "kie_ai";
export const SAFE_PROVIDER_MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

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
  availableModels: AvailableLlmProviderModel[] | null | undefined;
  providerModelId: string;
  pricingInput?: string | number | null;
  pricingOutput?: string | number | null;
  isFree?: boolean | null;
}): {
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  source: "mapping" | "catalog";
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

  const catalogModel = findCatalogModel(input.availableModels, input.providerModelId);
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

  return {
    pricingInput: currentInput,
    pricingOutput: currentOutput,
    isFree: Boolean(input.isFree),
    source: "mapping",
  };
}

export function buildKieLlmAvailableModels(): AvailableLlmProviderModel[] {
  const sharedResponsesConfig = {
    requestBodyFormat: "responses" as const,
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: ["tools", "tool_choice", "reasoning", "stream"],
    conflicts: [{ type: "xor" as const, fields: ["web_search", "function_tools"] }],
  };

  const sharedClaudeConfig = {
    requestBodyFormat: "anthropic-messages" as const,
    apiEndpoint: "/claude/v1/messages",
    authStrategy: "provider-default" as const,
    supportsStreaming: true,
    passthroughFields: ["tools", "thinkingFlag", "stream"],
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
      config: {
        ...sharedResponsesConfig,
        apiEndpoint: "/codex/v1/responses",
        inputFields: [
          makeField("input", "Input", "input", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
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
      config: {
        ...sharedResponsesConfig,
        apiEndpoint: "/api/v1/responses",
        inputFields: [
          makeField("input", "Input", "input", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("tool_choice", "Tool Choice", "select", { documented: true }),
          makeField("reasoning", "Reasoning", "json", { documented: true }),
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
      config: {
        ...sharedClaudeConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
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
      config: {
        ...sharedClaudeConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("thinkingFlag", "Thinking Flag", "boolean", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("output_config", "Output Config", "json", { documented: true }),
        ],
        passthroughFields: [...(sharedClaudeConfig.passthroughFields ?? []), "output_config"],
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
      config: {
        ...sharedGeminiConfig,
        inputFields: [
          makeField("messages", "Messages", "messages", { documented: true, required: true }),
          makeField("tools", "Tools", "tools", { documented: true }),
          makeField("stream", "Stream", "boolean", { documented: true }),
          makeField("include_thoughts", "Include Thoughts", "boolean", { documented: true }),
          makeField("reasoning_effort", "Reasoning Effort", "select", { documented: true }),
        ],
        conflicts: [{ type: "xor" as const, fields: ["google_search", "function_tools"] }],
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

export function canonicalModelIdForCatalogModel(
  providerName: string,
  providerModelId: string,
): string {
  if (providerName === KIE_PROVIDER_NAME && providerModelId === "gpt-5-4") {
    return "gpt-5.4";
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
