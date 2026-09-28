import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../../db";
import { llmInferenceProbeRuns } from "../../../drizzle/schema";
import { executeWithFallback } from "../llmRouter";
import type { Message } from "../../_core/llm";
import {
  resolveInferenceProbeTarget,
  type ConnectivityProbeTarget,
  type InferenceProbeTargetResolution,
} from "./connectivityProbe";
import { requiredProbeChecksForModel } from "./qualification";

const PROBE_SUITE_REVISION = "capability:1";
const BASIC_MARKER = "SAH_CAPABILITY_TEXT_V1";
const JSON_MARKER = "SAH_CAPABILITY_JSON_V1";
const CONTEXT_START_MARKER = "SAH_CONTEXT_START_V1";
const CONTEXT_END_MARKER = "SAH_CONTEXT_END_V1";
const CONTEXT_RESPONSE_MARKER = `${CONTEXT_START_MARKER}|${CONTEXT_END_MARKER}`;
const PROBE_TIMEOUT_MS = 12_000;
const MAX_LIMIT_PROBE_TIMEOUT_MS = 120_000;
const DEFAULT_PROBE_COST_BUDGET_USD_MICROS = 250_000;
const MAX_PROBE_COST_BUDGET_USD_MICROS = 5_000_000;
const MAX_CONTEXT_PROBE_INPUT_CHARS = 2_000_000;
const MAX_OUTPUT_PROBE_TOKENS = 65_536;
const CONTEXT_PROMPT_OVERHEAD_TOKENS = 64;

export type CapabilityProbeTarget = ConnectivityProbeTarget;

type ProbeCheckName =
  | "basicRequestResponse"
  | "chatResponsesParity"
  | "streamingCancellation"
  | "toolsContinuation"
  | "strictSchema"
  | "reasoningUsage"
  | "multimodal"
  | "contextOutputLimits"
  | "regionRetention"
  | "credentialOwnership";

type CapabilityProbeDependencies = {
  resolveTarget?: (
    deploymentId: string
  ) => Promise<InferenceProbeTargetResolution>;
  execute?: typeof executeWithFallback;
  persist?: (row: typeof llmInferenceProbeRuns.$inferInsert) => Promise<void>;
  now?: () => Date;
};

type LimitProbePlan = {
  contextPrompt: string;
  contextInputTargetTokens: number;
  maximumOutputTokens: number;
  estimatedCostUsdMicros: number;
  budgetUsdMicros: number;
};

type LimitProbePlanResult =
  | { ok: true; plan: LimitProbePlan }
  | { ok: false; reasonCode: string; evidence?: Record<string, number> };

export type CapabilityProbeResult =
  | {
      runId: string;
      evidenceRef: string;
      deploymentId: string;
      deploymentRevision: string;
      status: "passed" | "failed" | "incomplete";
      reasonCode?: string;
      checks: Record<ProbeCheckName, boolean>;
      probedCapabilityRefs: string[];
      parallelToolCallsVerified: boolean;
      responseLatencyMs: number;
    }
  | { status: "blocked"; reasonCode: string };

function assistantText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object")
    return "";
  const message = (choices[0] as { message?: unknown }).message;
  const content =
    message && typeof message === "object"
      ? (message as { content?: unknown }).content
      : undefined;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { text: string } =>
      Boolean(
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      )
    )
    .map(part => part.text)
    .join("");
}

function assistantMessage(
  response: unknown
): Record<string, unknown> | undefined {
  if (!response || typeof response !== "object") return undefined;
  const choices = (response as { choices?: unknown }).choices;
  if (
    !Array.isArray(choices) ||
    !choices[0] ||
    typeof choices[0] !== "object"
  ) {
    return undefined;
  }
  const message = (choices[0] as { message?: unknown }).message;
  return message && typeof message === "object"
    ? (message as Record<string, unknown>)
    : undefined;
}

function parseUsage(response: unknown) {
  if (!response || typeof response !== "object") return undefined;
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  const promptTokens = value.prompt_tokens ?? value.input_tokens;
  const completionTokens = value.completion_tokens ?? value.output_tokens;
  const reasoningDetails = value.completion_tokens_details;
  const reasoningTokens =
    value.reasoning_tokens ??
    (reasoningDetails && typeof reasoningDetails === "object"
      ? (reasoningDetails as Record<string, unknown>).reasoning_tokens
      : undefined);
  return {
    promptTokens,
    completionTokens,
    totalTokens: value.total_tokens,
    reasoningTokens,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readProbeCostBudgetUsdMicros(): number | null {
  const raw = process.env.INFERENCE_CAPABILITY_PROBE_MAX_COST_USD_MICROS;
  if (!raw?.trim()) return DEFAULT_PROBE_COST_BUDGET_USD_MICROS;
  if (!/^\d+$/.test(raw.trim())) return null;
  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) &&
    parsed <= MAX_PROBE_COST_BUDGET_USD_MICROS
    ? parsed
    : null;
}

function estimateMicros(tokens: number, priceMicrosPerMillion: number): bigint {
  return (
    (BigInt(tokens) * BigInt(priceMicrosPerMillion) + 999_999n) / 1_000_000n
  );
}

/** Build the exact-profile limits request before any potentially large provider call. */
function buildLimitProbePlan(
  target: CapabilityProbeTarget
): LimitProbePlanResult {
  const budgetUsdMicros = readProbeCostBudgetUsdMicros();
  if (budgetUsdMicros === null) {
    return { ok: false, reasonCode: "PROBE_COST_BUDGET_CONFIGURATION_INVALID" };
  }
  const model = target.profile.model.capabilities;
  const price = target.probePricing;
  const maximumOutputTokens = model.maxOutputTokens;
  const contextInputTargetTokens =
    model.maxContextTokens -
    maximumOutputTokens -
    CONTEXT_PROMPT_OVERHEAD_TOKENS;
  if (contextInputTargetTokens <= 0) {
    return { ok: false, reasonCode: "CONTEXT_OUTPUT_BUDGET_INVALID" };
  }
  if (maximumOutputTokens > MAX_OUTPUT_PROBE_TOKENS) {
    return {
      ok: false,
      reasonCode: "MAX_OUTPUT_PROBE_EXCEEDS_SAFE_LIMIT",
      evidence: {
        maximumOutputTokens,
        maximumOutputProbeTokens: MAX_OUTPUT_PROBE_TOKENS,
      },
    };
  }
  const prefix = `Read all padding and reply exactly ${CONTEXT_RESPONSE_MARKER}. Start marker: ${CONTEXT_START_MARKER}.\n`;
  const suffix = `\nEnd marker: ${CONTEXT_END_MARKER}.`;
  const contextPromptChars =
    prefix.length + contextInputTargetTokens * 2 + suffix.length;
  if (contextPromptChars > MAX_CONTEXT_PROBE_INPUT_CHARS) {
    return {
      ok: false,
      reasonCode: "CONTEXT_PROBE_EXCEEDS_SAFE_INPUT_LIMIT",
      evidence: {
        contextInputChars: contextPromptChars,
        maximumContextProbeInputChars: MAX_CONTEXT_PROBE_INPUT_CHARS,
      },
    };
  }
  // ASCII " x" is used so the provider's own usage count can confirm the
  // realized token count. Markers at both ends detect truncation. The payload
  // is hard-capped independently of the profile's price estimate.
  const contextPrompt = prefix + " x".repeat(contextInputTargetTokens) + suffix;
  // Reserve for the maximum response in both the context and output probes,
  // plus the small baseline/schema/reasoning probes. ASCII input characters
  // are a conservative upper bound on provider input tokens.
  const worstCaseInputTokens = contextPrompt.length + 256;
  const worstCaseOutputTokens = maximumOutputTokens * 2 + 256;
  const estimatedCost =
    estimateMicros(worstCaseInputTokens, price.inputMicrosPerMillion) +
    estimateMicros(worstCaseOutputTokens, price.outputMicrosPerMillion);
  if (estimatedCost > BigInt(budgetUsdMicros)) {
    return {
      ok: false,
      reasonCode: "PROBE_COST_BUDGET_EXCEEDED",
      evidence: {
        estimatedCostUsdMicros: Number(estimatedCost),
        budgetUsdMicros,
      },
    };
  }
  return {
    ok: true,
    plan: {
      contextPrompt,
      contextInputTargetTokens,
      maximumOutputTokens,
      estimatedCostUsdMicros: Number(estimatedCost),
      budgetUsdMicros,
    },
  };
}

function outputMatchesSyntheticLimitProbe(response: unknown): boolean {
  const text = assistantText(response).trim();
  return text.length > 0 && /^(?:x\s*)+$/i.test(text);
}

function matchesChatCapability(value: string): boolean {
  const label = (value.split(/[:/#]/).pop() ?? value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return label === "chat" || label === "text_chat" || label === "basic_chat";
}

function hashEvidence(value: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function allChecksFalse(): Record<ProbeCheckName, boolean> {
  return {
    basicRequestResponse: false,
    chatResponsesParity: false,
    streamingCancellation: false,
    toolsContinuation: false,
    strictSchema: false,
    reasoningUsage: false,
    multimodal: false,
    contextOutputLimits: false,
    regionRetention: false,
    credentialOwnership: false,
  };
}

export async function runInferenceCapabilityProbe(
  input: { deploymentId: string; actorUserId: number },
  dependencies: CapabilityProbeDependencies = {}
): Promise<CapabilityProbeResult> {
  const resolveTarget =
    dependencies.resolveTarget ?? resolveInferenceProbeTarget;
  const execute = dependencies.execute ?? executeWithFallback;
  const targetResult = await resolveTarget(input.deploymentId);
  if (!targetResult.ok)
    return { status: "blocked", reasonCode: targetResult.reason };
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) {
    return { status: "blocked", reasonCode: "INVALID_ACTOR" };
  }

  const { target } = targetResult;
  const startedAt = (dependencies.now ?? (() => new Date()))();
  const startedMs = startedAt.getTime();
  const checks = allChecksFalse();
  const reasonCodes = new Set<string>();
  const limitPlanResult = buildLimitProbePlan(target);
  const executePinned = async (options: {
    prompt?: string;
    messages?: Message[];
    maxTokens: number;
    timeoutMs?: number;
    enableThinking?: boolean;
    extraBodyParams?: Record<string, unknown>;
  }) => {
    let result: Awaited<ReturnType<typeof executeWithFallback>>;
    try {
      result = await execute({
        model: target.profile.model.logicalModelId,
        messages: options.messages ?? [
          { role: "user", content: options.prompt ?? "" },
        ],
        stream: false,
        userId: 0,
        preferredProvider: target.providerRecordId,
        strictProviderPin: true,
        expectedProviderModelId: target.providerModelId,
        expectedApiStyle: target.apiStyle,
        expectedModelMappingId: target.modelMappingId,
        disableProviderFallbacks: true,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs ?? PROBE_TIMEOUT_MS,
        ...(options.enableThinking ? { enableThinking: true } : {}),
        ...(options.extraBodyParams
          ? { extraBodyParams: options.extraBodyParams }
          : {}),
      });
    } catch {
      return { ok: false, reason: "PROVIDER_CALL_FAILED" };
    }
    if (result.type !== "success") {
      return {
        ok: false,
        reason:
          result.type === "error"
            ? "PROVIDER_CALL_FAILED"
            : "PROBE_EXECUTION_UNSUPPORTED",
      };
    }
    if (result.providerId !== target.providerRecordId) {
      return { ok: false, reason: "OBSERVED_PROVIDER_MISMATCH" };
    }
    const response = result.response as { model?: unknown } | null;
    if (response?.model !== target.providerModelId) {
      return { ok: false, reason: "OBSERVED_MODEL_MISMATCH" };
    }
    return { ok: true, response };
  };

  const basic = await executePinned({
    prompt: `Reply with exactly this marker and nothing else: ${BASIC_MARKER}`,
    maxTokens: 16,
  });
  checks.basicRequestResponse =
    basic.ok && assistantText(basic.response).trim() === BASIC_MARKER;
  if (!checks.basicRequestResponse)
    reasonCodes.add(basic.ok ? "BASIC_RESPONSE_INVALID" : basic.reason);
  const abortFurtherProviderCalls = !checks.basicRequestResponse;
  const observedTargetMismatch =
    !basic.ok &&
    ["OBSERVED_PROVIDER_MISMATCH", "OBSERVED_MODEL_MISMATCH"].includes(
      basic.reason
    );

  let contextLimitVerified = false;
  let maximumOutputLimitVerified = false;
  let observedContextPromptTokens: number | undefined;
  let observedMaximumOutputTokens: number | undefined;
  let contextProbeExecuted = false;
  let outputProbeExecuted = false;
  if (!limitPlanResult.ok) {
    reasonCodes.add(limitPlanResult.reasonCode);
  } else if (abortFurtherProviderCalls) {
    reasonCodes.add("LIMIT_PROBES_ABORTED_AFTER_BASELINE_FAILURE");
  } else {
    const limitPlan = limitPlanResult.plan;
    const limitProbeTimeoutMs = Math.min(
      MAX_LIMIT_PROBE_TIMEOUT_MS,
      PROBE_TIMEOUT_MS +
        Math.ceil(
          (limitPlan.contextInputTargetTokens + limitPlan.maximumOutputTokens) /
            20
        ) *
          1_000
    );
    const context = await executePinned({
      prompt: limitPlan.contextPrompt,
      maxTokens: limitPlan.maximumOutputTokens,
      timeoutMs: limitProbeTimeoutMs,
    });
    contextProbeExecuted = true;
    const contextUsage = context.ok ? parseUsage(context.response) : undefined;
    observedContextPromptTokens = isNonNegativeInteger(
      contextUsage?.promptTokens
    )
      ? contextUsage.promptTokens
      : undefined;
    contextLimitVerified = Boolean(
      context.ok &&
      assistantText(context.response).trim() === CONTEXT_RESPONSE_MARKER &&
      observedContextPromptTokens !== undefined &&
      observedContextPromptTokens >= limitPlan.contextInputTargetTokens &&
      observedContextPromptTokens + limitPlan.maximumOutputTokens <=
        target.profile.model.capabilities.maxContextTokens
    );
    if (!contextLimitVerified) {
      reasonCodes.add(
        context.ok
          ? "CONTEXT_WINDOW_LIMIT_EVIDENCE_MISSING"
          : "CONTEXT_WINDOW_LIMIT_PROBE_FAILED"
      );
    }

    const output = await executePinned({
      prompt: `Output only the character x, separated by spaces, until the requested output limit is reached. Do not explain.`,
      maxTokens: limitPlan.maximumOutputTokens,
      timeoutMs: limitProbeTimeoutMs,
    });
    outputProbeExecuted = true;
    const outputUsage = output.ok ? parseUsage(output.response) : undefined;
    observedMaximumOutputTokens = isNonNegativeInteger(
      outputUsage?.completionTokens
    )
      ? outputUsage.completionTokens
      : undefined;
    maximumOutputLimitVerified = Boolean(
      output.ok &&
      outputMatchesSyntheticLimitProbe(output.response) &&
      observedMaximumOutputTokens !== undefined &&
      observedMaximumOutputTokens === limitPlan.maximumOutputTokens
    );
    if (!maximumOutputLimitVerified) {
      reasonCodes.add(
        output.ok
          ? "MAXIMUM_OUTPUT_LIMIT_EVIDENCE_MISSING"
          : "MAXIMUM_OUTPUT_LIMIT_PROBE_FAILED"
      );
    }
    checks.contextOutputLimits =
      contextLimitVerified && maximumOutputLimitVerified;
  }

  const strict = abortFurtherProviderCalls
    ? { ok: false, reason: "PROBE_ABORTED_AFTER_BASELINE_FAILURE" }
    : await executePinned({
        prompt: `Return a JSON object with marker set to ${JSON.stringify(JSON_MARKER)}.`,
        maxTokens: 32,
        extraBodyParams: {
          response_format: {
            ...(target.apiStyle === "responses"
              ? {
                  type: "json_schema",
                  name: "sah_capability_probe",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      marker: { type: "string", const: JSON_MARKER },
                    },
                    required: ["marker"],
                    additionalProperties: false,
                  },
                }
              : {
                  type: "json_schema",
                  json_schema: {
                    name: "sah_capability_probe",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        marker: { type: "string", const: JSON_MARKER },
                      },
                      required: ["marker"],
                      additionalProperties: false,
                    },
                  },
                }),
          },
        },
      });
  let parsedStrict: unknown;
  if (strict.ok) {
    try {
      parsedStrict = JSON.parse(assistantText(strict.response));
    } catch {
      /* failed schema evidence */
    }
  }
  checks.strictSchema = Boolean(
    strict.ok &&
    parsedStrict &&
    typeof parsedStrict === "object" &&
    (parsedStrict as { marker?: unknown }).marker === JSON_MARKER &&
    Object.keys(parsedStrict).length === 1
  );
  if (!checks.strictSchema)
    reasonCodes.add(
      strict.ok ? "STRICT_SCHEMA_EVIDENCE_MISSING" : strict.reason
    );

  const reasoning = abortFurtherProviderCalls
    ? { ok: false, reason: "PROBE_ABORTED_AFTER_BASELINE_FAILURE" }
    : await executePinned({
        prompt: "Reply with the single letter R and nothing else.",
        maxTokens: 16,
        enableThinking: true,
      });
  const reasoningUsage = reasoning.ok
    ? parseUsage(reasoning.response)
    : undefined;
  const reasoningPromptTokens = reasoningUsage?.promptTokens;
  const reasoningCompletionTokens = reasoningUsage?.completionTokens;
  const reasoningTotalTokens = reasoningUsage?.totalTokens;
  const reasoningTokenCount = reasoningUsage?.reasoningTokens;
  checks.reasoningUsage = Boolean(
    reasoning.ok &&
    assistantText(reasoning.response).trim() === "R" &&
    isNonNegativeInteger(reasoningPromptTokens) &&
    isNonNegativeInteger(reasoningCompletionTokens) &&
    isNonNegativeInteger(reasoningTotalTokens) &&
    isNonNegativeInteger(reasoningTokenCount) &&
    reasoningTotalTokens === reasoningPromptTokens + reasoningCompletionTokens
  );
  if (!checks.reasoningUsage)
    reasonCodes.add(
      reasoning.ok ? "REASONING_USAGE_EVIDENCE_MISSING" : reasoning.reason
    );

  const requiredChecks = requiredProbeChecksForModel(target.profile.model);
  const toolCheckRequired = requiredChecks.includes("toolsContinuation");
  let parallelToolCallsVerified = false;
  if (
    toolCheckRequired &&
    target.apiStyle === "chat-completions" &&
    !abortFurtherProviderCalls
  ) {
    const toolDefinitions = [
      {
        type: "function",
        function: {
          name: "sah_capability_probe_a",
          description:
            "Return fixed marker A for the SmartAIHub qualification probe.",
          parameters: {
            type: "object",
            properties: {
              marker: { type: "string", const: "SAH_TOOL_ARGUMENT_A_V1" },
            },
            required: ["marker"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "sah_capability_probe_b",
          description:
            "Return fixed marker B for the SmartAIHub qualification probe.",
          parameters: {
            type: "object",
            properties: {
              marker: { type: "string", const: "SAH_TOOL_ARGUMENT_B_V1" },
            },
            required: ["marker"],
            additionalProperties: false,
          },
        },
      },
    ];
    const userMessage: Message = {
      role: "user",
      content:
        "Call both qualification probe functions, one with marker A and one with marker B.",
    };
    const toolCallResult = await executePinned({
      messages: [userMessage],
      maxTokens: 64,
      extraBodyParams: {
        tools: toolDefinitions,
        tool_choice: "required",
        parallel_tool_calls: true,
      },
    });
    const toolMessage = toolCallResult.ok
      ? assistantMessage(toolCallResult.response)
      : undefined;
    const toolCalls = toolMessage?.tool_calls;
    const parsedToolCalls = Array.isArray(toolCalls)
      ? toolCalls.map(rawCall => {
          if (!rawCall || typeof rawCall !== "object") return undefined;
          const call = rawCall as Record<string, unknown>;
          const fn =
            call.function && typeof call.function === "object"
              ? (call.function as Record<string, unknown>)
              : undefined;
          let args: unknown;
          if (typeof fn?.arguments === "string") {
            try {
              args = JSON.parse(fn.arguments);
            } catch {
              /* invalid tool JSON */
            }
          }
          return { call, fn, args };
        })
      : [];
    const expectedArguments = new Map([
      ["sah_capability_probe_a", "SAH_TOOL_ARGUMENT_A_V1"],
      ["sah_capability_probe_b", "SAH_TOOL_ARGUMENT_B_V1"],
    ]);
    const callIds = parsedToolCalls.map(item => item?.call.id);
    const validToolCalls = Boolean(
      toolCallResult.ok &&
      parsedToolCalls.length === 2 &&
      new Set(callIds).size === 2 &&
      parsedToolCalls.every(item => {
        if (!item) return false;
        const id = item.call.id;
        const name = item.fn?.name;
        const expectedMarker =
          typeof name === "string" ? expectedArguments.get(name) : undefined;
        return (
          typeof id === "string" &&
          id.length > 0 &&
          id.length <= 256 &&
          expectedMarker !== undefined &&
          item.args &&
          typeof item.args === "object" &&
          (item.args as { marker?: unknown }).marker === expectedMarker &&
          Object.keys(item.args).length === 1
        );
      })
    );

    if (validToolCalls) {
      const assistantToolMessage: Message = {
        role: "assistant",
        content: assistantText(toolCallResult.response),
        tool_calls: toolCalls as NonNullable<Message["tool_calls"]>,
      };
      const toolResultMessages: Message[] = parsedToolCalls.flatMap(item => {
        if (!item) return [];
        const toolName = item.fn?.name;
        const toolCallId = item.call.id;
        if (typeof toolName !== "string" || typeof toolCallId !== "string")
          return [];
        const resultMarker =
          expectedArguments.get(toolName) === "SAH_TOOL_ARGUMENT_A_V1"
            ? "SAH_TOOL_RESULT_A_V1"
            : "SAH_TOOL_RESULT_B_V1";
        return [
          { role: "tool", tool_call_id: toolCallId, content: resultMarker },
        ];
      });
      const continuation = await executePinned({
        messages: [userMessage, assistantToolMessage, ...toolResultMessages],
        maxTokens: 16,
        extraBodyParams: {
          tools: toolDefinitions,
          tool_choice: "none",
          parallel_tool_calls: true,
        },
      });
      checks.toolsContinuation = Boolean(
        continuation.ok &&
        assistantText(continuation.response).trim() ===
          "SAH_TOOL_RESULT_A_V1|SAH_TOOL_RESULT_B_V1"
      );
      parallelToolCallsVerified = checks.toolsContinuation;
      if (!checks.toolsContinuation) {
        reasonCodes.add(
          continuation.ok
            ? "TOOL_CONTINUATION_RESPONSE_INVALID"
            : continuation.reason
        );
      }
      if (target.profile.model.capabilities.toolContractRefs.length > 0) {
        reasonCodes.add("TOOL_CONTRACT_PARITY_UNVERIFIED");
      }
    } else {
      reasonCodes.add(
        toolCallResult.ok ? "TOOL_CALL_CONTRACT_INVALID" : toolCallResult.reason
      );
    }
  }

  const deployment = target.profile.deployment;
  checks.credentialOwnership =
    !observedTargetMismatch &&
    Boolean(
      target.providerRecordId > 0 &&
      target.modelMappingId > 0 &&
      deployment.runtimeBinding?.providerRecordId === target.providerRecordId &&
      deployment.runtimeBinding?.modelMappingId === target.modelMappingId &&
      deployment.credentialOwnerRef.trim().length > 0 &&
      deployment.providerId ===
        `provider:llm-provider:${target.providerRecordId}`
    );
  if (!checks.credentialOwnership)
    reasonCodes.add("CREDENTIAL_OWNERSHIP_UNVERIFIED");

  const probedCapabilityRefs = checks.basicRequestResponse
    ? target.profile.model.capabilityRefs.filter(matchesChatCapability).sort()
    : [];
  const implementedChecks = new Set<ProbeCheckName>([
    "basicRequestResponse",
    "strictSchema",
    "reasoningUsage",
    "credentialOwnership",
  ]);
  if (contextProbeExecuted && outputProbeExecuted) {
    implementedChecks.add("contextOutputLimits");
  }
  if (target.apiStyle === "chat-completions") {
    implementedChecks.add("toolsContinuation");
  }
  const failedImplementedRequiredCheck = requiredChecks.some(
    check => implementedChecks.has(check) && !checks[check]
  );
  const unsupportedRequiredChecks = requiredChecks.filter(
    check => !implementedChecks.has(check) && !checks[check]
  );
  const unprobedCapabilityRefs = target.profile.model.capabilityRefs.filter(
    ref => !probedCapabilityRefs.includes(ref)
  );
  if (unsupportedRequiredChecks.includes("regionRetention")) {
    reasonCodes.add("REGION_RETENTION_VERIFIER_UNAVAILABLE");
  }
  if (unsupportedRequiredChecks.includes("contextOutputLimits")) {
    reasonCodes.add("CONTEXT_WINDOW_PROBE_UNAVAILABLE");
  }
  if (unsupportedRequiredChecks.includes("streamingCancellation")) {
    reasonCodes.add("STREAMING_CANCELLATION_PROBE_UNAVAILABLE");
  }
  if (unsupportedRequiredChecks.includes("chatResponsesParity")) {
    reasonCodes.add("CROSS_SURFACE_PARITY_PROBE_UNAVAILABLE");
  }
  if (
    unsupportedRequiredChecks.includes("toolsContinuation") &&
    target.apiStyle !== "chat-completions"
  ) {
    reasonCodes.add("TOOL_CONTINUATION_PROBE_UNAVAILABLE_FOR_SURFACE");
  }
  if (unsupportedRequiredChecks.includes("multimodal")) {
    reasonCodes.add("MULTIMODAL_PROBE_UNAVAILABLE");
  }
  if (unprobedCapabilityRefs.length > 0) {
    reasonCodes.add("CAPABILITY_EVIDENCE_INCOMPLETE");
  }
  const latestTarget = await resolveTarget(input.deploymentId);
  if (
    !latestTarget.ok ||
    latestTarget.target.profileVersionId !== target.profileVersionId ||
    latestTarget.target.runtimeBindingHash !== target.runtimeBindingHash
  ) {
    return {
      status: "blocked",
      reasonCode: "PROBE_TARGET_CHANGED_DURING_EXECUTION",
    };
  }

  const finishedAt = (dependencies.now ?? (() => new Date()))();
  const responseLatencyMs = Math.max(0, finishedAt.getTime() - startedMs);
  const runId = randomUUID();
  const status = failedImplementedRequiredCheck
    ? ("failed" as const)
    : unsupportedRequiredChecks.length > 0 ||
        unprobedCapabilityRefs.length > 0 ||
        reasonCodes.has("TOOL_CONTRACT_PARITY_UNVERIFIED")
      ? ("incomplete" as const)
      : ("passed" as const);
  const reasonCodeList = [...reasonCodes].filter(Boolean).sort();
  const safeResult = {
    qualificationStatus: status,
    checks,
    contextLimitVerified,
    maximumOutputLimitVerified,
    limitProbeEvidence: {
      executed: contextProbeExecuted && outputProbeExecuted,
      ...(limitPlanResult.ok
        ? {
            contextInputTargetTokens:
              limitPlanResult.plan.contextInputTargetTokens,
            observedContextPromptTokens: observedContextPromptTokens ?? null,
            maximumOutputTokens: limitPlanResult.plan.maximumOutputTokens,
            observedMaximumOutputTokens: observedMaximumOutputTokens ?? null,
            estimatedCostUsdMicros: limitPlanResult.plan.estimatedCostUsdMicros,
            budgetUsdMicros: limitPlanResult.plan.budgetUsdMicros,
          }
        : (limitPlanResult.evidence ?? {})),
    },
    probedCapabilityRefs,
    parallelToolCallsVerified,
    runtimeBindingHash: target.runtimeBindingHash,
    responseLatencyMs,
    reasonCodes: reasonCodeList,
  };
  const evidenceRef = hashEvidence({
    runId,
    deploymentId: deployment.deploymentId,
    deploymentRevision: deployment.revision,
    profileVersionId: target.profileVersionId,
    probeSuiteRevision: PROBE_SUITE_REVISION,
    status,
    result: safeResult,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });
  const row: typeof llmInferenceProbeRuns.$inferInsert = {
    runId,
    profileVersionId: target.profileVersionId,
    deploymentId: deployment.deploymentId,
    deploymentRevision: deployment.revision,
    providerRecordId: target.providerRecordId,
    modelMappingId: target.modelMappingId,
    actorUserId: input.actorUserId,
    probeKind: "capability_suite",
    probeSuiteRevision: PROBE_SUITE_REVISION,
    status,
    resultJson: { ...safeResult, evidenceRef },
    startedAt,
    finishedAt,
  };

  try {
    if (dependencies.persist) await dependencies.persist(row);
    else await getDb().insert(llmInferenceProbeRuns).values(row);
  } catch {
    return { status: "blocked", reasonCode: "PROBE_EVIDENCE_PERSIST_FAILED" };
  }

  return {
    runId,
    evidenceRef,
    deploymentId: deployment.deploymentId,
    deploymentRevision: deployment.revision,
    status,
    ...(reasonCodeList.length ? { reasonCode: reasonCodeList.join(",") } : {}),
    checks,
    probedCapabilityRefs,
    parallelToolCallsVerified,
    responseLatencyMs,
  };
}
