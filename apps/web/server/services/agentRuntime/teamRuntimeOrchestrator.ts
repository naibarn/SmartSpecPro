import type { BuildContextPackRequest } from "../contextPackBuilder";
import type { SkillLlmResult } from "../skillModelFallback";
import type { SkillExecutionPolicyResult } from "../skillExecutionPolicy";
import { getProviderForModel, type ProviderCandidate } from "../llmRouter";
import type { SkillCapabilityActivationGateResult } from "../skillCapabilityManifestService";
import type { OpenAiAgentsRuntimeFlagSnapshot } from "./runtimeSelection";
import type { ShadowEffectKind } from "./shadowPolicy";
import {
  buildRuntimeModelConfig,
  executeSharedSkillRuntime,
  extractRuntimeTextResult,
  type SharedSkillRuntimeExecutionResult,
  type SharedSkillRuntimeRecursionConfig,
} from "./skillRuntimeOrchestrator";
import type { AgentRuntimeClient } from "./client";
import type { AgentRuntimeResponse, RuntimeModelConfig } from "../../../shared/agentRuntime/types";

export interface TeamRuntimeTurnInput {
  tenantId: string;
  userId: number;
  objective: string;
  skillSlug: string;
  executionPolicy: SkillExecutionPolicyResult;
  contextPackRequest: BuildContextPackRequest;
  planContext?: Record<string, unknown> | null;
  legacyExecute: () => Promise<SkillLlmResult>;
  requestLabel?: string | null;
  featureFlags?: Partial<OpenAiAgentsRuntimeFlagSnapshot> | null;
  approvalGranted?: boolean;
  recursion?: SharedSkillRuntimeRecursionConfig | null;
  roomId?: string | null;
  runId?: string | null;
  messageId?: string | null;
  allowedTools?: string[];
  allowedAgents?: string[];
  sideEffectKind?: ShadowEffectKind | null;
  client?: Pick<AgentRuntimeClient, "run">;
  activationGate?: SkillCapabilityActivationGateResult;
  modelConfig?: RuntimeModelConfig | null;
}

export type TeamRuntimeTurnResult =
  SharedSkillRuntimeExecutionResult<SkillLlmResult>;

export interface TeamRuntimeReplaySnapshot {
  selectedSkillSlug: string | null;
  selectedModelId: string | null;
  selectedProviderName: string | null;
  reviewVerdict: string | null;
  status: string | null;
}

export interface TeamRuntimeReplayComparison {
  matches: boolean;
  mismatchCodes: Array<
    | "selected_skill_drift"
    | "model_drift"
    | "provider_drift"
    | "review_verdict_drift"
    | "status_drift"
  >;
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

function buildRuntimeAttempt(input: {
  modelId: string;
  providerName: string;
  durationMs: number;
}): SkillLlmResult["attempts"] {
  return [
    {
      attempt: 1,
      modelId: input.modelId,
      providerName: input.providerName,
      statusCode: null,
      errorType: null,
      errorMessage: null,
      durationMs: input.durationMs,
      success: true,
    },
  ];
}

function compareSkillResults(
  legacyValue: SkillLlmResult,
  runtimeValue: SkillLlmResult,
  runtimeResponse: AgentRuntimeResponse,
): Record<string, unknown> {
  const mismatchCodes: string[] = [];
  if ((legacyValue.content ?? "").trim() !== (runtimeValue.content ?? "").trim()) {
    mismatchCodes.push("content_drift");
  }
  if ((legacyValue.modelId ?? null) !== (runtimeValue.modelId ?? null)) {
    mismatchCodes.push("model_drift");
  }
  if ((legacyValue.provider?.providerName ?? null) !== (runtimeValue.provider?.providerName ?? null)) {
    mismatchCodes.push("provider_drift");
  }
  if ((legacyValue.inputTokens ?? 0) !== (runtimeValue.inputTokens ?? 0)) {
    mismatchCodes.push("input_token_drift");
  }
  if ((legacyValue.outputTokens ?? 0) !== (runtimeValue.outputTokens ?? 0)) {
    mismatchCodes.push("output_token_drift");
  }

  return {
    matches: mismatchCodes.length === 0,
    mismatchCodes,
    selectedSkillSlug: runtimeResponse.selectedSkillSlug ?? null,
    traceId: runtimeResponse.traceId ?? null,
    runtimeStatus: runtimeResponse.status,
  };
}

export function compareTeamReplaySnapshots(
  baseline: TeamRuntimeReplaySnapshot,
  candidate: TeamRuntimeReplaySnapshot,
): TeamRuntimeReplayComparison {
  const mismatchCodes: TeamRuntimeReplayComparison["mismatchCodes"] = [];

  if ((baseline.selectedSkillSlug ?? null) !== (candidate.selectedSkillSlug ?? null)) {
    mismatchCodes.push("selected_skill_drift");
  }

  if ((baseline.selectedModelId ?? null) !== (candidate.selectedModelId ?? null)) {
    mismatchCodes.push("model_drift");
  }

  if (
    (baseline.selectedProviderName ?? null) !==
    (candidate.selectedProviderName ?? null)
  ) {
    mismatchCodes.push("provider_drift");
  }

  if ((baseline.reviewVerdict ?? null) !== (candidate.reviewVerdict ?? null)) {
    mismatchCodes.push("review_verdict_drift");
  }

  if ((baseline.status ?? null) !== (candidate.status ?? null)) {
    mismatchCodes.push("status_drift");
  }

  return {
    matches: mismatchCodes.length === 0,
    mismatchCodes,
  };
}

export async function executeTeamRuntimeTurn(
  input: TeamRuntimeTurnInput,
): Promise<TeamRuntimeTurnResult> {
  const startedAt = Date.now();
  const modelId =
    input.modelConfig?.modelId ??
    input.executionPolicy.modelId ??
    "runtime-model";
  const modelConfig = input.modelConfig ?? buildRuntimeModelConfig({
    modelId,
    providerId: input.executionPolicy.preferredProviderId ?? null,
    resolvedGatewayModelId: input.executionPolicy.modelId ?? modelId,
  });

  return executeSharedSkillRuntime<SkillLlmResult, SkillLlmResult>({
    tenantId: input.tenantId,
    userId: input.userId,
    objective: input.objective,
    originSurface: "team",
    entryPoint: "team_step",
    modelConfig,
    skillSlugs: [input.skillSlug],
    buildContextPackRequest: input.contextPackRequest,
    planContext: input.planContext ?? null,
    approvalGranted: input.approvalGranted ?? true,
    requestLabel: input.requestLabel ?? `team:${input.skillSlug}`,
    roomId: input.roomId ?? null,
    runId: input.runId ?? null,
    messageId: input.messageId ?? null,
    allowedTools: input.allowedTools ?? [],
    allowedAgents: input.allowedAgents ?? [],
    sideEffectKind: input.sideEffectKind ?? undefined,
    featureFlags: input.featureFlags ?? null,
    recursion: input.recursion ?? null,
    client: input.client,
    activationGate: input.activationGate ?? undefined,
    legacyExecute: input.legacyExecute,
    activeTransform: async (runtimeResponse) => {
      const runtimeText = extractRuntimeTextResult(runtimeResponse);
      const resolvedModelId = runtimeText.modelId ?? modelId;
      let provider: ProviderCandidate | null = null;
      try {
        provider = await getProviderForModel(resolvedModelId, {
          preferredProviderId: input.executionPolicy.preferredProviderId,
          strictProviderPin: input.executionPolicy.strictProviderPin,
        });
      } catch {
        provider = null;
      }

      const resolvedProvider =
        provider ??
        synthesizeProviderCandidate({
          modelId: resolvedModelId,
          providerName: runtimeText.providerName ?? "runtime",
        });

      const durationMs = Date.now() - startedAt;

      return {
        success: true,
        skillId: input.skillSlug,
        type: "text",
        content: runtimeText.rawContent,
        modelId: resolvedModelId,
        provider: resolvedProvider,
        inputTokens: runtimeText.usage.promptTokens,
        outputTokens: runtimeText.usage.completionTokens,
        creditsUsed: runtimeText.creditsUsed,
        attempts: buildRuntimeAttempt({
          modelId: resolvedModelId,
          providerName: resolvedProvider.providerName,
          durationMs,
        }),
        totalDurationMs: durationMs,
        rawData: {
          runtimeTraceId: runtimeResponse.traceId ?? null,
          runtimeStatus: runtimeResponse.status,
          runtimeSelectedSkillSlug: runtimeResponse.selectedSkillSlug ?? null,
        },
      } satisfies SkillLlmResult;
    },
    shadowCompare: (legacyValue, runtimeValue, runtimeResponse) =>
      compareSkillResults(legacyValue, runtimeValue, runtimeResponse),
  });
}
