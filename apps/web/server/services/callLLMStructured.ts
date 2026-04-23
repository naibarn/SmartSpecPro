import { z } from "zod";
import type { Message } from "../_core/llm";
import { executeWithFallback, resolveProviders } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { auditLogger } from "./auditLogger";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { resolveStructuredAutoChatModelSelection } from "./chatModelSelection";
import { executeResponsesRuntimeTurn } from "./agentRuntime/responsesRuntimeOrchestrator";
import {
  buildRuntimeModelConfig,
  executeSharedSkillRuntime,
  type SharedSkillRuntimeRecursionConfig,
} from "./agentRuntime/skillRuntimeOrchestrator";
import type {
  AgentRuntimeEntryPoint,
  AgentRuntimeOriginSurface,
} from "../../shared/agentRuntime/types";
import type { OpenAiAgentsRuntimeFlagSnapshot } from "./agentRuntime/runtimeSelection";
import type { SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import type { SkillLlmResult } from "./skillModelFallback";
import type { ProviderCandidate } from "./llmRouter";

// ── Types ────────────────────────────────────────────────────

export interface CallLLMStructuredParams<T> {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  disableProviderFallbacks?: boolean;
  zodSchema: z.ZodType<T, any, unknown>;
  maxRetries?: number; // default 1
  userId: number;
  tenantId: string;
  billingDescription?: string;
  billingMetadata?: Record<string, unknown>;
  /** Max output tokens forwarded to the provider. */
  maxTokens?: number;
  runtimeOptions?: CallLLMStructuredRuntimeOptions | null;
}

export interface CallLLMStructuredResult<T> {
  data: T;
  tokensUsed: number;
  creditsUsed: number;
  providerName: string | null;
  modelId: string | null;
}

export interface CallLLMStructuredRuntimeOptions {
  skillSlugs: string[];
  originSurface?: AgentRuntimeOriginSurface;
  entryPoint?: AgentRuntimeEntryPoint;
  objective?: string;
  requestLabel?: string;
  featureFlags?: Partial<OpenAiAgentsRuntimeFlagSnapshot> | null;
  approvalGranted?: boolean;
  recursion?: SharedSkillRuntimeRecursionConfig | null;
}

// ── Error class ──────────────────────────────────────────────

export class LLMStructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawResponse: string,
    public readonly zodErrors?: z.ZodError,
    public readonly tokensUsed?: number,
    public readonly creditsUsed?: number,
  ) {
    super(message);
    this.name = "LLMStructuredOutputError";
  }
}

// ── Helpers ──────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1].trim() : text.trim();
}

function getResponseKeys(response: unknown): string[] {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return [];
  }
  return Object.keys(response as Record<string, unknown>).slice(0, 20);
}

function safeResponsePreview(response: unknown): string {
  try {
    return JSON.stringify(response, (_key, value) => {
      if (typeof value === "string" && value.length > 800) {
        return `${value.slice(0, 800)}...`;
      }
      return value;
    }).slice(0, 2000);
  } catch {
    return "[unserializable provider response]";
  }
}

function formatZodIssuePath(path: Array<string | number>): string {
  return path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number") {
      return `${accumulator}[${segment}]`;
    }
    return accumulator ? `${accumulator}.${segment}` : segment;
  }, "");
}

function getSchemaHint<T>(schema: z.ZodType<T, any, unknown>) {
  if (schema instanceof z.ZodObject) {
    return {
      name: "structured_output",
      requiredFields: Object.keys(schema.shape),
      validationMode: "structured_json" as const,
    };
  }

  return {
    name: "structured_output",
    requiredFields: [],
    validationMode: "structured_json" as const,
  };
}

function extractUsageSummary(value: unknown): {
  promptTokens: number;
  completionTokens: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { promptTokens: 0, completionTokens: 0 };
  }

  const record = value as Record<string, unknown>;
  const promptTokens = Number(
    record.promptTokens ?? record.prompt_tokens ?? record.inputTokens ?? 0,
  );
  const completionTokens = Number(
    record.completionTokens ??
      record.completion_tokens ??
      record.outputTokens ??
      0,
  );

  return {
    promptTokens:
      Number.isFinite(promptTokens) && promptTokens >= 0
        ? Math.floor(promptTokens)
        : 0,
    completionTokens:
      Number.isFinite(completionTokens) && completionTokens >= 0
        ? Math.floor(completionTokens)
        : 0,
  };
}

function extractStructuredRuntimePayload(
  finalOutput: unknown,
): {
  payload: unknown;
  tokensUsed: number;
  creditsUsed: number;
  providerName: string | null;
  modelId: string | null;
} {
  let candidatePayload: unknown = finalOutput;
  let usageSummary = { promptTokens: 0, completionTokens: 0 };
  let creditsUsed = 0;
  let providerName: string | null = null;
  let modelId: string | null = null;

  if (typeof finalOutput === "string") {
    candidatePayload = finalOutput;
  } else if (finalOutput && typeof finalOutput === "object" && !Array.isArray(finalOutput)) {
    const record = finalOutput as Record<string, unknown>;
    usageSummary =
      record.usage && typeof record.usage === "object"
        ? extractUsageSummary(record.usage)
        : extractUsageSummary(record);
    const creditsCandidate = Number(record.creditsUsed ?? record.credits ?? 0);
    creditsUsed =
      Number.isFinite(creditsCandidate) && creditsCandidate >= 0
        ? creditsCandidate
        : 0;
    providerName =
      typeof record.providerName === "string" && record.providerName.trim()
        ? record.providerName.trim()
        : null;
    modelId =
      typeof record.modelId === "string" && record.modelId.trim()
        ? record.modelId.trim()
        : typeof record.resolvedGatewayModelId === "string" &&
            record.resolvedGatewayModelId.trim()
          ? record.resolvedGatewayModelId.trim()
          : null;

    candidatePayload =
      record.data ??
      record.json ??
      record.payload ??
      record.output ??
      record.content ??
      finalOutput;
  }

  if (typeof candidatePayload === "string") {
    const cleaned = stripMarkdownFences(candidatePayload);
    candidatePayload = JSON.parse(cleaned);
  }

  return {
    payload: candidatePayload,
    tokensUsed: usageSummary.promptTokens + usageSummary.completionTokens,
    creditsUsed,
    providerName,
    modelId,
  };
}

function synthesizeProviderCandidate(input: {
  modelId: string;
  providerName: string;
}): ProviderCandidate {
  return {
    providerId: 0,
    providerName: input.providerName,
    baseUrl: "",
    apiKey: "",
    providerModelId: input.modelId,
    apiStyle: "responses",
    supportsResponses: true,
    pricingInput: 0,
    pricingOutput: 0,
    isFree: false,
    priority: 0,
  };
}

function toSkillLlmResult(input: {
  content: string;
  modelId: string | null;
  providerName: string | null;
  tokensUsed: number;
  creditsUsed: number;
  skillSlug: string;
}): SkillLlmResult {
  const modelId = input.modelId ?? "runtime-model";
  const providerName = input.providerName ?? "runtime";
  return {
    success: true,
    skillId: input.skillSlug,
    type: "text",
    content: input.content,
    modelId,
    provider: synthesizeProviderCandidate({
      modelId,
      providerName,
    }),
    inputTokens: input.tokensUsed,
    outputTokens: 0,
    creditsUsed: input.creditsUsed,
    attempts: [
      {
        attempt: 1,
        modelId,
        providerName,
        statusCode: null,
        errorType: null,
        errorMessage: null,
        durationMs: 0,
        success: true,
      },
    ],
    totalDurationMs: 0,
    rawData: {
      source: "callLLMStructuredLegacy",
    },
  };
}

function shouldUseResponsesRuntime(
  runtimeOptions: CallLLMStructuredRuntimeOptions | null | undefined,
): boolean {
  return (
    runtimeOptions?.originSurface === "responses"
    || runtimeOptions?.entryPoint === "responses_call"
  ) && (runtimeOptions?.skillSlugs?.length ?? 0) > 0;
}

// ── Main function ────────────────────────────────────────────

export async function callLLMStructured<T>(
  params: CallLLMStructuredParams<T>,
): Promise<CallLLMStructuredResult<T>> {
  if (shouldUseResponsesRuntime(params.runtimeOptions)) {
    return callLLMStructuredWithResponsesRuntime(params);
  }

  if (params.runtimeOptions?.skillSlugs?.length) {
    return callLLMStructuredWithRuntime(params);
  }

  return callLLMStructuredLegacy(params);
}

async function callLLMStructuredWithRuntime<T>(
  params: CallLLMStructuredParams<T>,
): Promise<CallLLMStructuredResult<T>> {
  const {
    model,
    preferredProviderId,
    strictProviderPin,
    zodSchema,
    runtimeOptions,
  } = params;
  const requestedModel =
    typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : null;
  const autoStructuredSelection = requestedModel
    ? null
    : await resolveStructuredAutoChatModelSelection();
  const resolvedModel =
    requestedModel ?? autoStructuredSelection?.resolvedModelId ?? null;

  if (!resolvedModel) {
    throw new Error("No structured LLM model could be resolved");
  }

  const effectivePreferredProviderId =
    strictProviderPin
      ? preferredProviderId
      : autoStructuredSelection?.preferredProviderId;

  const runtimeResult = await executeSharedSkillRuntime<
    CallLLMStructuredResult<T>,
    CallLLMStructuredResult<T>
  >({
    tenantId: params.tenantId,
    userId: params.userId,
    objective: runtimeOptions?.objective ?? params.userMessage,
    originSurface: runtimeOptions?.originSurface,
    entryPoint: runtimeOptions?.entryPoint ?? "system",
    skillSlugs: runtimeOptions?.skillSlugs ?? [],
    systemPrompt: params.systemPrompt,
    userPrompt: params.userMessage,
    requestLabel:
      runtimeOptions?.requestLabel ??
      params.billingDescription ??
      "structured_output",
    featureFlags: runtimeOptions?.featureFlags,
    approvalGranted: runtimeOptions?.approvalGranted ?? true,
    recursion: runtimeOptions?.recursion,
    schemaHint: getSchemaHint(zodSchema),
    planContext: {
      billingDescription: params.billingDescription ?? null,
      billingMetadata: params.billingMetadata ?? null,
      maxTokens: params.maxTokens ?? null,
      strictProviderPin: params.strictProviderPin ?? false,
      disableProviderFallbacks: params.disableProviderFallbacks ?? false,
    },
    modelConfig: buildRuntimeModelConfig({
      modelId: resolvedModel,
      providerId: effectivePreferredProviderId ?? null,
      gatewayRouteId: autoStructuredSelection?.routeFamily ?? null,
      resolvedGatewayModelId: resolvedModel,
    }),
    legacyExecute: () =>
      callLLMStructuredLegacy({
        ...params,
        runtimeOptions: null,
      }),
    activeTransform: response => {
      let extracted;
      try {
        extracted = extractStructuredRuntimePayload(response.finalOutput);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new LLMStructuredOutputError(
            "Runtime returned invalid JSON for structured output.",
            String(response.finalOutput ?? ""),
            undefined,
          );
        }
        throw error;
      }

      const validation = zodSchema.safeParse(extracted.payload);
      if (!validation.success) {
        throw new LLMStructuredOutputError(
          `Runtime structured output failed schema validation: ${validation.error.message}`,
          typeof response.finalOutput === "string"
            ? response.finalOutput
            : safeResponsePreview(response.finalOutput),
          validation.error,
          extracted.tokensUsed,
          extracted.creditsUsed,
        );
      }

      return {
        data: validation.data,
        tokensUsed: extracted.tokensUsed,
        creditsUsed: extracted.creditsUsed,
        providerName: extracted.providerName ?? response.providerId ?? null,
        modelId:
          extracted.modelId ??
          response.resolvedGatewayModelId ??
          response.modelId ??
          null,
      };
    },
    shadowCompare: (legacyValue, runtimeValue) => ({
      sameStructuredPayload:
        JSON.stringify(legacyValue.data) === JSON.stringify(runtimeValue.data),
      runtimeSchemaValid: true,
    }),
  });

  return runtimeResult.value as CallLLMStructuredResult<T>;
}

async function callLLMStructuredWithResponsesRuntime<T>(
  params: CallLLMStructuredParams<T>,
): Promise<CallLLMStructuredResult<T>> {
  const {
    model,
    preferredProviderId,
    strictProviderPin,
    zodSchema,
    runtimeOptions,
  } = params;
  const requestedModel =
    typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : null;
  const autoStructuredSelection = requestedModel
    ? null
    : await resolveStructuredAutoChatModelSelection();
  const resolvedModel =
    requestedModel ?? autoStructuredSelection?.resolvedModelId ?? null;

  if (!resolvedModel) {
    throw new Error("No structured LLM model could be resolved");
  }

  const effectivePreferredProviderId =
    strictProviderPin
      ? preferredProviderId
      : autoStructuredSelection?.preferredProviderId;
  const responsesSkillSlug = runtimeOptions?.skillSlugs?.[0];
  if (!responsesSkillSlug) {
    return callLLMStructuredWithRuntime(params);
  }

  const executionPolicy: SkillExecutionPolicyResult = {
    modelId: resolvedModel,
    allowFreeModels: true,
    preferredProviderId: effectivePreferredProviderId ?? undefined,
    strictProviderPin: strictProviderPin ?? false,
    modelSource: requestedModel ? "skill_llmModelId" : "system_default",
  };

  const runtimeResult = await executeResponsesRuntimeTurn({
    tenantId: params.tenantId,
    userId: params.userId,
    objective: runtimeOptions?.objective ?? params.userMessage,
    skillSlug: responsesSkillSlug,
    executionPolicy,
    contextPackRequest: undefined,
    legacyExecute: async () => {
      const legacyResult = await callLLMStructuredLegacy({
        ...params,
        runtimeOptions: null,
      });
      return toSkillLlmResult({
        content: JSON.stringify(legacyResult.data),
        modelId: legacyResult.modelId,
        providerName: legacyResult.providerName,
        tokensUsed: legacyResult.tokensUsed,
        creditsUsed: legacyResult.creditsUsed,
        skillSlug: responsesSkillSlug,
      });
    },
    requestLabel:
      runtimeOptions?.requestLabel ??
      params.billingDescription ??
      "structured_output",
    featureFlags: runtimeOptions?.featureFlags,
    approvalGranted: runtimeOptions?.approvalGranted ?? true,
    recursion: runtimeOptions?.recursion,
    modelConfig: buildRuntimeModelConfig({
      modelId: resolvedModel,
      providerId: effectivePreferredProviderId ?? null,
      gatewayRouteId: autoStructuredSelection?.routeFamily ?? null,
      resolvedGatewayModelId: resolvedModel,
    }),
  });

  const skillRuntimeValue = runtimeResult.value;
  let extracted;
  try {
    extracted = extractStructuredRuntimePayload({
      data: skillRuntimeValue.content,
      usage: {
        promptTokens: skillRuntimeValue.inputTokens ?? 0,
        completionTokens: skillRuntimeValue.outputTokens ?? 0,
      },
      creditsUsed: skillRuntimeValue.creditsUsed ?? 0,
      providerName: skillRuntimeValue.provider?.providerName ?? null,
      modelId: skillRuntimeValue.modelId ?? null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LLMStructuredOutputError(
        "Runtime returned invalid JSON for structured output.",
        String(skillRuntimeValue.content ?? ""),
        undefined,
      );
    }
    throw error;
  }

  const validation = zodSchema.safeParse(extracted.payload);
  if (!validation.success) {
    throw new LLMStructuredOutputError(
      `Runtime structured output failed schema validation: ${validation.error.message}`,
      typeof skillRuntimeValue.content === "string"
        ? skillRuntimeValue.content
        : safeResponsePreview(skillRuntimeValue.content),
      validation.error,
      extracted.tokensUsed,
      extracted.creditsUsed,
    );
  }

  return {
    data: validation.data,
    tokensUsed: extracted.tokensUsed,
    creditsUsed: extracted.creditsUsed,
    providerName:
      extracted.providerName ?? skillRuntimeValue.provider?.providerName ?? null,
    modelId: extracted.modelId ?? skillRuntimeValue.modelId ?? null,
  };
}

async function callLLMStructuredLegacy<T>(
  params: CallLLMStructuredParams<T>,
): Promise<CallLLMStructuredResult<T>> {
  const {
    systemPrompt,
    userMessage,
    model,
    preferredProviderId,
    strictProviderPin,
    disableProviderFallbacks,
    zodSchema,
    maxRetries = 1,
    userId,
    tenantId,
    billingDescription,
    billingMetadata,
    maxTokens,
  } = params;
  const requestedModel =
    typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : null;
  const autoStructuredSelection = requestedModel
    ? null
    : await resolveStructuredAutoChatModelSelection();
  const resolvedModel =
    requestedModel ?? autoStructuredSelection?.resolvedModelId ?? null;

  const augmentedSystemPrompt = `${systemPrompt}

You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanatory text, no trailing commas.
The JSON must strictly conform to the expected schema.`;

  let totalTokens = 0;
  let totalCredits = 0;
  let lastRawResponse = "";
  let lastZodError: z.ZodError | undefined;

  if (!resolvedModel) {
    throw new Error("No structured LLM model could be resolved");
  }

  if (strictProviderPin && preferredProviderId) {
    const candidates = await resolveProviders(resolvedModel).catch(() => []);
    const providerMatched = candidates.some((c) => c.providerId === preferredProviderId);
    if (!providerMatched) {
      throw new Error(`No providers available for model: ${resolvedModel} with preferred provider ${preferredProviderId}`);
    }
  }

  // Wire task planner ONCE before the retry loop
  const plannerResult = await runPlanner({
    sourceType: "skill",
    userId,
    tenantId,
    conversationModel: resolvedModel,
    skillSlug: (billingMetadata?.skillSlug as string) ?? undefined,
    executionPolicy: {
      requirements: {
        supportsStructuredOutputs: true,
      },
    },
  });

  let effectiveModel = resolvedModel;
  const effectivePreferredProviderId =
    strictProviderPin
      ? preferredProviderId
      : autoStructuredSelection?.preferredProviderId;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0;

    const messages: Message[] = [
      { role: "system", content: augmentedSystemPrompt },
      {
        role: "user",
        content: isRetry
          ? `${userMessage}\n\nYour previous response was invalid JSON or did not match the expected schema. The error was: ${lastZodError ? lastZodError.message : "Invalid JSON syntax"}. Raw response (truncated): "${lastRawResponse.slice(0, 500)}". Please try again and return ONLY valid JSON.`
          : userMessage,
      },
    ];

    const result = await executeWithFallback({
      model: effectiveModel,
      messages,
      stream: false,
      userId,
      preferredProvider: effectivePreferredProviderId,
      strictProviderPin,
      disableProviderFallbacks,
      maxTokens,
    });

    if (result.type === "error") {
      throw new Error(result.error);
    }

    if (result.type === "fallback_required") {
      throw new Error(
        "LLM provider requires fallback consent, which is not supported in structured output mode",
      );
    }

    // Extract content and usage
    const usage = result.response?.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const costUsd = usage.cost ?? undefined;
    totalTokens += inputTokens + outputTokens;

    const choices = result.response?.choices;
    if (!Array.isArray(choices)) {
      const responseKeys = getResponseKeys(result.response);
      console.warn("[callLLMStructured] Provider returned no chat choices", {
        provider: result.providerName,
        model: effectiveModel,
        attempt: attempt + 1,
        billingDescription,
        workflow: billingMetadata?.workflow,
        disableProviderFallbacks,
        responseKeys,
      });
      const error = new LLMStructuredOutputError(
        `LLM provider returned a 200 response without chat choices for structured output (provider=${result.providerName}, model=${effectiveModel}, workflow=${String(billingMetadata?.workflow ?? billingDescription ?? "unknown")}, responseKeys=${responseKeys.join(",") || "none"})`,
        safeResponsePreview(result.response),
        undefined,
        totalTokens,
        totalCredits,
      );
      if (attempt < maxRetries) {
        lastRawResponse = error.rawResponse;
        lastZodError = undefined;
        continue;
      }
      throw error;
    }

    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      console.warn("[callLLMStructured] Provider returned empty structured content", {
        provider: result.providerName,
        model: effectiveModel,
        attempt: attempt + 1,
        billingDescription,
        workflow: billingMetadata?.workflow,
        disableProviderFallbacks,
        choiceCount: choices.length,
        responseKeys: getResponseKeys(result.response),
      });
      const error = new LLMStructuredOutputError(
        `LLM provider returned empty structured output (provider=${result.providerName}, model=${effectiveModel}, workflow=${String(billingMetadata?.workflow ?? billingDescription ?? "unknown")}, choiceCount=${choices.length})`,
        safeResponsePreview(result.response),
        undefined,
        totalTokens,
        totalCredits,
      );
      if (attempt < maxRetries) {
        lastRawResponse = error.rawResponse;
        lastZodError = undefined;
        continue;
      }
      throw error;
    }

    // Deduct credits for this attempt
    const { creditsUsed } = await deductCreditsForModel({
      userId,
      model: effectiveModel,
      provider: result.providerName,
      inputTokens,
      outputTokens,
      costUsd,
      tenantId,
      description: billingDescription,
      metadata: {
        requestType: "structured_llm",
        structured: true,
        attempt: attempt + 1,
        ...(billingMetadata ?? {}),
      },
      sourceType: "skill",
    });
    totalCredits += creditsUsed;

    // Record step attempt for each retry (per-attempt tracking)
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: effectiveModel,
        provider: result.providerName,
        inputTokens,
        outputTokens,
        costUsd: costUsd?.toString(),
        snapshot: null,
        creditsUsed,
      }).catch(() => {});
    }

    lastRawResponse = content;

    // Strip markdown fences and attempt JSON parse
    const cleaned = stripMarkdownFences(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn("[callLLMStructured] Structured output returned invalid JSON", {
        provider: result.providerName,
        model: effectiveModel,
        attempt: attempt + 1,
        billingDescription,
        workflow: billingMetadata?.workflow,
        disableProviderFallbacks,
        responsePreview: cleaned.slice(0, 1200),
      });
      auditLogger.log({
        eventType: "error",
        userId,
        tenantId,
        providerName: result.providerName ?? null,
        model: effectiveModel,
        errorType: "structured_output_invalid_json",
        errorMessage: `Invalid structured JSON on attempt ${attempt + 1}`,
        metadata: {
          attempt: attempt + 1,
          workflow: billingMetadata?.workflow ?? billingDescription ?? null,
          disableProviderFallbacks: disableProviderFallbacks ?? false,
          responsePreview: cleaned.slice(0, 1200),
        },
      });
      // JSON parse failed — retry if we have attempts left
      lastZodError = undefined;
      if (attempt < maxRetries) continue;
      throw new LLMStructuredOutputError(
        `LLM returned invalid JSON after ${attempt + 1} attempt(s)`,
        content,
        undefined,
        totalTokens,
        totalCredits,
      );
    }

    // Validate against Zod schema
    const validation = zodSchema.safeParse(parsed);
    if (!validation.success) {
      lastZodError = validation.error;
      const validationPaths = Array.from(
        new Set(
          validation.error.issues
            .map(issue => formatZodIssuePath(issue.path))
            .filter(Boolean),
        ),
      );
      console.warn("[callLLMStructured] Structured output failed schema validation", {
        provider: result.providerName,
        model: effectiveModel,
        attempt: attempt + 1,
        billingDescription,
        workflow: billingMetadata?.workflow,
        disableProviderFallbacks,
        parsedKeys: getResponseKeys(parsed),
        validationPaths,
        responsePreview: cleaned.slice(0, 1200),
      });
      auditLogger.log({
        eventType: "error",
        userId,
        tenantId,
        providerName: result.providerName ?? null,
        model: effectiveModel,
        errorType: "structured_output_schema_validation_failed",
        errorMessage: `Structured schema validation failed on attempt ${attempt + 1}`,
        metadata: {
          attempt: attempt + 1,
          workflow: billingMetadata?.workflow ?? billingDescription ?? null,
          disableProviderFallbacks: disableProviderFallbacks ?? false,
          parsedKeys: getResponseKeys(parsed),
          validationPaths,
          responsePreview: cleaned.slice(0, 1200),
        },
      });
      if (attempt < maxRetries) continue;
      throw new LLMStructuredOutputError(
        `LLM response failed schema validation after ${attempt + 1} attempt(s): ${validation.error.message}`,
        content,
        validation.error,
        totalTokens,
        totalCredits,
      );
    }

    // Success
    auditLogger.log({
      eventType: "llm_response",
      userId,
      model: effectiveModel,
      metadata: {
        structured: true,
        attempts: attempt + 1,
        tenantId,
      },
    });

    return {
      data: validation.data,
      tokensUsed: totalTokens,
      creditsUsed: totalCredits,
      providerName: result.providerName ?? null,
      modelId: effectiveModel,
    };
  }

  // This should be unreachable, but TypeScript needs it
  throw new LLMStructuredOutputError(
    "LLM structured output failed",
    lastRawResponse,
    lastZodError,
    totalTokens,
    totalCredits,
  );
}
