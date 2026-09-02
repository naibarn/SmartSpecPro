import { z } from "zod";

export const WORKER_LLM_INVENTORY_SCHEMA_VERSION = "worker-llm-inventory/1" as const;
export const WORKER_LLM_INVOKE_SCHEMA_VERSION = "worker-llm-invoke/1" as const;
export const WORKER_LLM_RESULT_SCHEMA_VERSION = "worker-llm-result/1" as const;
export const WORKER_LLM_EVENT_SCHEMA_VERSION = "worker-llm-event/1" as const;
export const WORKER_LLM_JOB_TYPE = "llm_invoke" as const;

export const workerLlmProviderKindValues = [
  "ollama",
  "lm_studio",
  "localai",
  "vllm",
  "llama_cpp",
  "openai_compatible",
] as const;
export const workerLlmCapabilityValues = [
  "llm.chat",
  "llm.completion",
  "llm.vision",
  "llm.embedding",
  "llm.tools",
  "llm.json",
] as const;
export const workerLlmTaskValues = [
  "chat",
  "completion",
  "vision",
  "embedding",
] as const;
export const workerLlmReadinessValues = [
  "unknown",
  "ready",
  "blocked",
  "unavailable",
] as const;

export const workerLlmProviderKindSchema = z.enum(workerLlmProviderKindValues);
export const workerLlmCapabilitySchema = z.enum(workerLlmCapabilityValues);
export const workerLlmTaskSchema = z.enum(workerLlmTaskValues);
export const workerLlmReadinessSchema = z.enum(workerLlmReadinessValues);

const boundedId = z.string().trim().min(1).max(160);
const boundedMetadata = z.record(z.string().trim().min(1).max(64), z.unknown()).default({});

export const workerLlmModelRowSchema = z
  .object({
    localModelId: boundedId,
    providerModelId: z.string().trim().min(1).max(240),
    displayName: z.string().trim().min(1).max(240),
    capabilities: z.array(workerLlmCapabilitySchema).min(1).max(16),
    contextWindow: z.number().int().positive().max(2_000_000).nullable().optional().default(null),
    readiness: workerLlmReadinessSchema.default("unknown"),
    metadata: boundedMetadata,
  })
  .strict();

export const workerLlmProviderInventorySchema = z
  .object({
    localProviderId: boundedId,
    providerKind: workerLlmProviderKindSchema,
    displayName: z.string().trim().min(1).max(160),
    enabled: z.boolean().default(true),
    models: z.array(workerLlmModelRowSchema).max(256),
    metadata: boundedMetadata,
  })
  .strict();

const containsInventorySecret = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|bearer\s+|secret)/i.test(
    serialized
  );
};

const containsInventoryPrivateData = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return /https?:\/\/|(?:[A-Za-z]:\\|\/)(?:home|Users|var|tmp|opt)\//i.test(serialized) ||
    /"(?:prompt|messages?|content)"\s*:/i.test(serialized);
};

export const workerLlmInventorySchema = z
  .object({
    schemaVersion: z.literal(WORKER_LLM_INVENTORY_SCHEMA_VERSION),
    inventoryRevision: z.number().int().nonnegative().max(2_147_483_647),
    providers: z.array(workerLlmProviderInventorySchema).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (containsInventorySecret(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inventory must not contain secrets" });
    }
    if (containsInventoryPrivateData(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inventory must not contain endpoints, local paths, or prompts",
      });
    }
    const seenProviders = new Set<string>();
    const seenModels = new Set<string>();
    for (const provider of value.providers) {
      if (seenProviders.has(provider.localProviderId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate localProviderId" });
      }
      seenProviders.add(provider.localProviderId);
      for (const model of provider.models) {
        const key = `${provider.localProviderId}:${model.localModelId}`;
        if (seenModels.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate localModelId" });
        }
        seenModels.add(key);
      }
    }
  });

const workerLlmTextContentSchema = z.string().trim().min(1).max(64_000);
const workerLlmContentPartSchema = z
  .object({
    type: z.literal("image_ref"),
    storageRef: boundedId,
  })
  .strict();

export const workerLlmInvokeMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([
      workerLlmTextContentSchema,
      z.array(z.union([workerLlmTextContentSchema, workerLlmContentPartSchema])).min(1).max(64),
    ]),
  })
  .strict();

export const workerLlmInvokeSchema = z
  .object({
    schemaVersion: z.literal(WORKER_LLM_INVOKE_SCHEMA_VERSION),
    requestId: boundedId,
    modelRef: z.string().regex(/^wllm_[A-Za-z0-9_-]{8,128}$/),
    localProviderId: boundedId.optional(),
    localModelId: boundedId.optional(),
    inventoryRevision: z.number().int().nonnegative().max(2_147_483_647),
    task: workerLlmTaskSchema,
    requiredCapabilities: z.array(workerLlmCapabilitySchema).max(16).default([]),
    messages: z.array(workerLlmInvokeMessageSchema).min(1).max(128),
    parameters: z
      .record(z.string().trim().min(1).max(64), z.union([z.string().max(2_000), z.number(), z.boolean()]))
      .default({}),
    responseFormat: z.enum(["text", "json"]).default("text"),
    stream: z.boolean().default(false),
    privacyMode: z.enum(["local_only", "worker_relay"]).default("local_only"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const required = new Set(value.requiredCapabilities);
    const requiredCapability = value.task === "vision"
      ? "llm.vision"
      : value.task === "embedding"
        ? "llm.embedding"
        : value.task === "completion"
          ? "llm.completion"
          : "llm.chat";
    if (required.size > 0 && !required.has(requiredCapability)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredCapabilities"],
        message: `${value.task} requires ${requiredCapability}`,
      });
    }
  });

export const workerLlmUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().nullable().optional().default(null),
    outputTokens: z.number().int().nonnegative().nullable().optional().default(null),
    totalTokens: z.number().int().nonnegative().nullable().optional().default(null),
    durationMs: z.number().int().nonnegative().max(86_400_000).nullable().optional().default(null),
  })
  .strict();

export const workerLlmResultSchema = z
  .object({
    schemaVersion: z.literal(WORKER_LLM_RESULT_SCHEMA_VERSION),
    requestId: boundedId,
    modelRef: z.string().regex(/^wllm_[A-Za-z0-9_-]{8,128}$/),
    finishReason: z.enum(["stop", "length", "tool", "canceled"]),
    text: z.string().max(2_000_000).nullable().optional().default(null),
    json: z.record(z.string(), z.unknown()).nullable().optional().default(null),
    usage: workerLlmUsageSchema,
  })
  .strict();

export const workerLlmErrorSchema = z
  .object({
    code: z.enum([
      "invalid_request",
      "model_unavailable",
      "capability_unsupported",
      "provider_unavailable",
      "provider_rejected",
      "canceled",
      "lease_expired",
      "stale_inventory",
      "duplicate_request",
      "internal_error",
    ]),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean().default(false),
  })
  .strict();

export const workerLlmEventSchema = z
  .object({
    schemaVersion: z.literal(WORKER_LLM_EVENT_SCHEMA_VERSION),
    requestId: boundedId,
    assignmentId: boundedId,
    sequence: z.number().int().nonnegative(),
    type: z.enum(["started", "delta", "completed", "failed", "canceled"]),
    delta: z.string().max(64_000).nullable().optional().default(null),
    result: workerLlmResultSchema.nullable().optional().default(null),
    error: workerLlmErrorSchema.nullable().optional().default(null),
  })
  .strict();

export type WorkerLlmProviderKind = z.infer<typeof workerLlmProviderKindSchema>;
export type WorkerLlmCapability = z.infer<typeof workerLlmCapabilitySchema>;
export type WorkerLlmTask = z.infer<typeof workerLlmTaskSchema>;
export type WorkerLlmModelRow = z.infer<typeof workerLlmModelRowSchema>;
export type WorkerLlmInventory = z.infer<typeof workerLlmInventorySchema>;
export type WorkerLlmInvoke = z.infer<typeof workerLlmInvokeSchema>;
export type WorkerLlmResult = z.infer<typeof workerLlmResultSchema>;
export type WorkerLlmError = z.infer<typeof workerLlmErrorSchema>;
export type WorkerLlmEvent = z.infer<typeof workerLlmEventSchema>;
