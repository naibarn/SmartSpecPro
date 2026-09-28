import type { Message } from "../../_core/llm";
import {
  executeWithFallback,
  type PhysicalLlmAttemptEvent,
} from "../llmRouter";
import type { ProviderAttemptObservation } from "./executionCoordinator";
import type { InferenceIntentV2 } from "./contracts";
import type { RouteCandidate } from "./policyResolver";
import type { ExecuteInferencePlanInput } from "./executionCoordinator";
import type { InferencePlanningSourceOwners } from "./inferencePlanningService";
import { createCreditReservationSettlement } from "./creditReservationAuthority";
import {
  resolveCurrentInferenceDeployment,
} from "./runtimeDeploymentResolver";

function safeInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function mapFailure(event: PhysicalLlmAttemptEvent | undefined) {
  if (!event) {
    return {
      outcome: "failed" as const,
      submissionState: "not_submitted" as const,
      normalizedFailure: "provider_unavailable" as const,
    };
  }
  if (event.outcome === "unknown" || event.statusCode === 0) {
    return {
      outcome: "unknown" as const,
      submissionState: "unknown" as const,
      normalizedFailure: "unknown_outcome" as const,
    };
  }
  const normalizedFailure =
    event.statusCode === 429
      ? "rate_limited"
      : event.statusCode === 401 || event.statusCode === 403
        ? "authentication_failed"
        : event.statusCode === 400
          ? "invalid_request"
          : event.statusCode >= 500
            ? "provider_unavailable"
            : "connection_failed";
  return {
    outcome: "failed" as const,
    submissionState: "submitted" as const,
    normalizedFailure,
  };
}

/** Direct-provider adapter with an exact provider, native-model and API-surface pin. */
export async function executePinnedLlmRouterAttempt(input: {
  intent: InferenceIntentV2;
  candidate: RouteCandidate;
  runtime: {
    providerRecordId: number;
    modelMappingId: number;
    providerModelId: string;
    apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  };
  messages: Message[];
  userId: number;
  stream: boolean;
  signal: AbortSignal;
  deadlineAt: string;
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
}) {
  const remainingMs = Date.parse(input.deadlineAt) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return {
      observation: {
        outcome: "failed",
        submissionState: "not_submitted",
        streamCommitted: false,
        normalizedFailure: "provider_unavailable",
      } satisfies ProviderAttemptObservation,
    };
  }

  let lastPhysicalEvent: PhysicalLlmAttemptEvent | undefined;
  const result = await executeWithFallback({
    model: input.candidate.modelProfileId,
    messages: input.messages,
    stream: input.stream,
    userId: input.userId,
    tenantId: input.intent.tenantId,
    preferredProvider: input.runtime.providerRecordId,
    strictProviderPin: true,
    expectedProviderModelId: input.runtime.providerModelId,
    expectedApiStyle: input.runtime.apiStyle,
    expectedModelMappingId: input.runtime.modelMappingId,
    disableProviderFallbacks: true,
    maxTokens: input.maxTokens ?? input.intent.outputTokenReserve,
    temperature: input.temperature,
    extraBodyParams: input.extraBodyParams,
    timeoutMs: Math.max(1, Math.floor(remainingMs)),
    signal: input.signal,
    physicalAttemptObserver: event => {
      lastPhysicalEvent = event;
    },
  });

  if (result.type !== "success") {
    return {
      observation: {
        ...mapFailure(lastPhysicalEvent),
        streamCommitted: false,
      } satisfies ProviderAttemptObservation,
    };
  }

  const response = result.response as Record<string, unknown> | null;
  const actualModel =
    response && typeof response.model === "string" ? response.model : null;
  if (!actualModel) {
    return {
      observation: {
        outcome: "unknown",
        submissionState: "unknown",
        streamCommitted: false,
        normalizedFailure: "unknown_outcome",
      } satisfies ProviderAttemptObservation,
    };
  }

  const usage = response?.usage as Record<string, unknown> | undefined;
  const inputTokens = safeInteger(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = safeInteger(
    usage?.completion_tokens ?? usage?.output_tokens
  );
  const providerId = `provider:llm-provider:${result.providerId}`;
  const providerRequestId =
    typeof response?.id === "string" && response.id.length > 0
      ? response.id.slice(0, 256)
      : undefined;
  const usdCost = Number(usage?.cost);
  const chargedCostMicros = Number.isFinite(usdCost) && usdCost >= 0
    ? Math.ceil(usdCost * 1_000_000)
    : undefined;

  return {
    observation: {
      outcome: "completed",
      submissionState: "submitted",
      streamCommitted: input.stream,
      observedExecution: {
        model: actualModel.slice(0, 256),
        providerId,
        credentialOwnerRef: `credential-owner:llm-provider:${result.providerId}`,
        deploymentId: input.candidate.deploymentId,
        endpointSurface: input.candidate.endpointSurface,
      },
      ...(inputTokens !== undefined && outputTokens !== undefined
        ? {
            usage: {
              input: inputTokens,
              output: outputTokens,
            },
          }
        : {}),
      ...(chargedCostMicros !== undefined ? { chargedCostMicros } : {}),
      ...(providerRequestId ? { providerRequestId } : {}),
    } satisfies ProviderAttemptObservation,
    response: result.response,
  };
}

/** Supplies the coordinator callbacks for the certified llm_provider_map surface. */
export function createLlmRouterExecutionBindings(input: {
  intent: InferenceIntentV2;
  owners: InferencePlanningSourceOwners;
  expectedRegistryRevision: string;
  expectedRouterPolicyRevision: string;
  messages: Message[];
  userId: number;
  stream: boolean;
  /** Live current-state lookup implemented by the canonical credit owner. */
  loadReservationAuthority: ExecuteInferencePlanInput["loadReservationAuthority"];
  /** Optional owner override for tests or a future canonical settlement backend. */
  settleCompletedAttempt?: ExecuteInferencePlanInput["settleCompletedAttempt"];
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
}) {
  const resolveCandidate: ExecuteInferencePlanInput["resolveCandidate"] =
    async deploymentId => {
      const resolution = await resolveCurrentInferenceDeployment({
        deploymentId,
        intent: input.intent,
        owners: input.owners,
        expectedRegistryRevision: input.expectedRegistryRevision,
        expectedRouterPolicyRevision: input.expectedRouterPolicyRevision,
      });
      if (!resolution.ok) {
        return null;
      }
      return {
        candidate: resolution.candidate,
        authority: resolution.authority,
      };
    };

  const executeAttempt: ExecuteInferencePlanInput["executeAttempt"] = async (
    attempt
  ) => {
    const latest = await resolveCurrentInferenceDeployment({
      deploymentId: attempt.candidate.deploymentId,
      intent: attempt.intent,
      owners: input.owners,
      expectedRegistryRevision: attempt.plan.registryRevision,
      expectedRouterPolicyRevision: attempt.plan.routePolicyRevision,
    });
    if (
      !latest.ok ||
      latest.candidate.providerId !== attempt.candidate.providerId ||
      latest.candidate.providerModelId !== attempt.candidate.providerModelId ||
      latest.candidate.credentialOwnerRef !==
        attempt.candidate.credentialOwnerRef ||
      latest.candidate.deploymentId !== attempt.candidate.deploymentId
    ) {
      return {
        observation: {
          outcome: "failed",
          submissionState: "not_submitted",
          streamCommitted: false,
          normalizedFailure: "provider_unavailable",
        },
      };
    }
    return executePinnedLlmRouterAttempt({
      intent: attempt.intent,
      candidate: attempt.candidate,
      runtime: latest.runtime,
      messages: input.messages,
      userId: input.userId,
      stream: input.stream,
      signal: attempt.signal,
      deadlineAt: attempt.deadlineAt,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      extraBodyParams: input.extraBodyParams,
    });
  };

  return {
    resolveCandidate,
    loadReservationAuthority: input.loadReservationAuthority,
    settleCompletedAttempt:
      input.settleCompletedAttempt ??
      createCreditReservationSettlement({
        expectedUserId: input.userId,
        expectedTenantId: input.intent.tenantId,
        trustedPrincipalRef: input.intent.principalId,
      }),
    executeAttempt,
    // The current llmRouter API does not provide an idempotency certification,
    // so the coordinator must not replay a submitted request automatically.
    providerIdempotencyCertified: () => false,
  };
}
