import { randomUUID } from "node:crypto";
import type { Message } from "../../_core/llm";
import { getCreditBalance } from "../creditService";
import {
  createDurableInferenceCreditReservation,
  closeDurableInferenceCreditReservation,
} from "./durableCreditReservation";
import { planInferenceRouteForRequest } from "./inferencePlanningService";
import { selectInferenceRoute } from "./policyResolver";
import { buildChatInferenceIntent } from "./chatInferenceIntent";
import { getInferenceRolloutBundleStatus } from "./rolloutBundle";
import { loadInferenceProfileRegistry } from "./profileRegistry";
import { executePolicyRoutedInference } from "./automaticInferenceRequest";
import { inferenceCostMicrosToCreditUnits } from "./creditReservationAuthority";
import type {
  ChatModelSelection,
  ChatSelectionContext,
} from "../chatModelSelection";
import type { InferencePlanContext } from "./planFactory";
import type { InferencePlanningSourceOwners } from "./inferencePlanningService";

const MICROS_PER_CREDIT = 1_000;
const MAX_CHAT_RESERVATION_CREDITS = 100_000;
const DEFAULT_CHAT_OUTPUT_TOKEN_RESERVE = 1_024;

export type ChatInferenceGatewayInput = {
  userId: number;
  tenantId: string;
  conversationId?: number;
  skillUsed?: string;
  messages: Message[];
  selection: ChatModelSelection;
  selectionContext?: ChatSelectionContext | null;
  resolvedModelMappingId?: number;
  resolvedProviderId?: number;
  idempotencyKey?: string;
  traceId?: string;
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type ChatInferenceGatewayResult =
  | { status: "blocked"; reason: string }
  | {
      status: "executed";
      result: Awaited<ReturnType<typeof executePolicyRoutedInference>>;
      creditsReserved: number;
    };

function trustedIdempotencyKey(input: ChatInferenceGatewayInput, traceId: string): string {
  const supplied = input.idempotencyKey?.trim();
  if (supplied && supplied.length <= 200) return supplied;
  return `server:${traceId}`;
}

async function resolveExplicitModelProfileId(
  input: ChatInferenceGatewayInput,
  now: Date
): Promise<{ ok: true; modelProfileId: string } | { ok: false; reason: string }> {
  if (input.selection.mode !== "explicit") {
    return { ok: false, reason: "EXPLICIT_MODEL_SELECTION_REQUIRED" };
  }
  const mappingId = input.resolvedModelMappingId;
  const providerId = input.resolvedProviderId;
  if (
    !Number.isSafeInteger(mappingId) ||
    mappingId! <= 0 ||
    !Number.isSafeInteger(providerId) ||
    providerId! <= 0 ||
    (input.selection.providerId != null &&
      input.selection.providerId !== providerId)
  ) {
    return { ok: false, reason: "EXPLICIT_MODEL_MAPPING_UNAVAILABLE" };
  }
  const registry = await loadInferenceProfileRegistry(now);
  if (!registry.ok) {
    return { ok: false, reason: "EXPLICIT_MODEL_PROFILE_REGISTRY_UNAVAILABLE" };
  }
  const logicalModelIds = new Set(
    registry.profiles
      .filter(
        profile =>
          profile.deployment.runtimeBinding?.modelMappingId === mappingId &&
          profile.deployment.runtimeBinding.providerRecordId === providerId
      )
      .map(profile => profile.model.logicalModelId)
  );
  const [modelProfileId] = logicalModelIds;
  if (logicalModelIds.size !== 1 || !modelProfileId) {
    return {
      ok: false,
      reason:
        logicalModelIds.size === 0
          ? "EXPLICIT_MODEL_NOT_CERTIFIED"
          : "EXPLICIT_MODEL_MAPPING_AMBIGUOUS",
    };
  }
  return { ok: true, modelProfileId };
}

/**
 * Routes non-explicit chat through Spec 231 only under a verified platform
 * rollout. Missing or invalid rollout state fails closed; callers must not
 * silently interpret absent R4 evidence as permission for legacy routing.
 */
export async function executeChatThroughInferenceGateway(
  input: ChatInferenceGatewayInput
): Promise<ChatInferenceGatewayResult> {
  const rollout = await getInferenceRolloutBundleStatus();
  if (!rollout.activeBundle) {
    return { status: "blocked", reason: "ACTIVE_ROLLOUT_MISSING" };
  }
  if (
    rollout.keyringStatus !== "ready" ||
    rollout.activeBundle.signatureStatus !== "valid" ||
    !rollout.activeBundle.payload
  ) {
    return { status: "blocked", reason: "ACTIVE_ROLLOUT_NOT_VERIFIABLE" };
  }

  const tenantId = input.tenantId.trim();
  const principalId = `user:${input.userId}`;
  const now = new Date();
  const nowMs = now.getTime();
  let resolvedModelProfileId: string | undefined;
  if (input.selection.mode === "explicit") {
    const lockedProfile = await resolveExplicitModelProfileId(input, now);
    if (!lockedProfile.ok) {
      return { status: "blocked", reason: lockedProfile.reason };
    }
    resolvedModelProfileId = lockedProfile.modelProfileId;
  }
  const balance = await getCreditBalance(input.userId);
  if (
    !tenantId ||
    !balance ||
    !Number.isSafeInteger(balance.credits) ||
    balance.credits <= 0
  ) {
    return { status: "blocked", reason: "CREDIT_BUDGET_UNAVAILABLE" };
  }
  const walletBudgetMicros = balance.credits * MICROS_PER_CREDIT;
  if (!Number.isSafeInteger(walletBudgetMicros) || walletBudgetMicros <= 0) {
    return { status: "blocked", reason: "CREDIT_BUDGET_INVALID" };
  }

  const traceId = input.traceId?.trim() || randomUUID();
  const idempotencyKey = trustedIdempotencyKey(input, traceId);
  const maxTokens = input.maxTokens ?? DEFAULT_CHAT_OUTPUT_TOKEN_RESERVE;
  const intent = buildChatInferenceIntent({
    messages: input.messages,
    selection: input.selection,
    selectionContext: input.selectionContext,
    tenantId,
    userId: input.userId,
    traceId,
    idempotencyKey,
    availableBudgetMicros: walletBudgetMicros,
    maxTokens,
    resolvedModelProfileId,
  });
  if (!intent.ok)
    return {
      status: "blocked",
      reason: `INVALID_CHAT_INTENT:${intent.reason}`,
    };

  const quoteOwners: InferencePlanningSourceOwners = {
    budget: {
      tenantId,
      principalId,
      revision: `wallet:${traceId}`,
      observedAtMs: nowMs,
      ready: true,
      availableBudgetMicros: walletBudgetMicros,
    },
    requestContext: {
      tenantId,
      principalId,
      traceId,
      budgetScopeRef: `tenant:${tenantId}`,
      idempotencyKey: intent.request.idempotencyKey,
      effectivePrivacyClass: "tenant-confidential",
      effectiveRisk: "medium",
    },
  };
  const quote = await planInferenceRouteForRequest({
    request: intent.request,
    owners: quoteOwners,
    now,
  });
  if (quote.status !== "planned" || quote.route.status !== "selected") {
    return { status: "blocked", reason: "NO_POLICY_QUALIFIED_ROUTE" };
  }

  const selectedCandidate = quote.route.candidate;
  let approvedFallbackDeploymentIds: string[] = [];
  let reserveEstimateMicros = selectedCandidate.estimatedCostMicros;
  if (
    quote.boundIntent.selection.mode === "AUTO" &&
    quote.route.eligibleCandidates.length > 1
  ) {
    // AUTO authorizes deterministic failover only to another candidate already
    // admitted by the same policy/registry snapshot. User-locked routes retain
    // their explicit ask/deny contract.
    const fallbackRoute = selectInferenceRoute(
      quote.boundIntent,
      quote.route.eligibleCandidates.filter(
        candidate =>
          candidate.deploymentId !== selectedCandidate.deploymentId &&
          Number.isSafeInteger(candidate.estimatedCostMicros) &&
          candidate.estimatedCostMicros >= 0 &&
          candidate.estimatedCostMicros <=
            walletBudgetMicros - selectedCandidate.estimatedCostMicros
      ),
      quote.authority
    );
    if (fallbackRoute.status === "selected") {
      const combinedEstimate =
        selectedCandidate.estimatedCostMicros +
        fallbackRoute.candidate.estimatedCostMicros;
      if (
        Number.isSafeInteger(combinedEstimate) &&
        combinedEstimate <= walletBudgetMicros
      ) {
        reserveEstimateMicros = combinedEstimate;
        approvedFallbackDeploymentIds = [fallbackRoute.candidate.deploymentId];
      }
    }
  }
  let creditsToReserve = inferenceCostMicrosToCreditUnits(
    reserveEstimateMicros
  );
  if (
    approvedFallbackDeploymentIds.length > 0 &&
    (!creditsToReserve ||
      creditsToReserve > MAX_CHAT_RESERVATION_CREDITS ||
      creditsToReserve > balance.credits)
  ) {
    approvedFallbackDeploymentIds = [];
    reserveEstimateMicros = selectedCandidate.estimatedCostMicros;
    creditsToReserve = inferenceCostMicrosToCreditUnits(reserveEstimateMicros);
  }
  if (
    !creditsToReserve ||
    creditsToReserve > MAX_CHAT_RESERVATION_CREDITS ||
    creditsToReserve > balance.credits
  ) {
    return {
      status: "blocked",
      reason: "ROUTE_BUDGET_EXCEEDS_RESERVATION_LIMIT",
    };
  }
  const durableReservation = await createDurableInferenceCreditReservation({
    userId: input.userId,
    tenantId,
    principalRef: principalId,
    amount: creditsToReserve,
    idempotencyKey: `spec231:chat:${intent.request.idempotencyKey}`,
  });
  if (!durableReservation.ok)
    return { status: "blocked", reason: durableReservation.reason };

  const availableBudgetMicros =
    durableReservation.authority.availableBudgetMicros;
  if (quote.route.candidate.estimatedCostMicros > availableBudgetMicros) {
    await closeDurableInferenceCreditReservation({
      reservationId: durableReservation.reservationId,
    });
    return {
      status: "blocked",
      reason: "QUOTED_ROUTE_EXCEEDS_RESERVED_BUDGET",
    };
  }
  const boundedRequest = {
    ...intent.request,
    maxEstimatedCostMicros: availableBudgetMicros,
  };
  const context: InferencePlanContext = {
    planId: `chat-plan:${randomUUID()}`,
    attemptBudget: approvedFallbackDeploymentIds.length > 0 ? 2 : 1,
    startedAtMs: nowMs,
    overallDeadlineAt: new Date(nowMs + 120_000).toISOString(),
    fallbackPermission:
      approvedFallbackDeploymentIds.length > 0
        ? "preapproved"
        : input.selection.mode === "auto-provider"
          ? "ask"
          : "none",
    preapprovedFallbackDeploymentIds: approvedFallbackDeploymentIds,
    cachePolicyId: "cache:no-store-private",
    creditReservationId: durableReservation.reservationId,
    parentCostCeilingMicros: availableBudgetMicros,
    routePolicyRevision: quote.authority.routerPolicyRevision,
    specRevision: "R4",
    rolloutBundleHash: rollout.activeBundle.bundleHash,
    logicalCallId: `chat-call:${randomUUID()}`,
    attemptOwnershipEpoch: 1,
    residencyPolicySnapshotRef: `policy:${quote.authority.policyRevision}`,
    routerFeatureProvenanceRef: `router:${quote.authority.routerPolicyRevision}`,
  };
  const owners: InferencePlanningSourceOwners = {
    ...quoteOwners,
    budget: {
      tenantId,
      principalId,
      revision: `reservation:${durableReservation.reservationId}`,
      observedAtMs: nowMs,
      ready: true,
      availableBudgetMicros,
    },
  };

  let result: Awaited<ReturnType<typeof executePolicyRoutedInference>>;
  try {
    const persistResponseDelivery = input.conversationId && Number.isSafeInteger(input.conversationId)
      ? async (delivery: {
          attemptId: string;
          receipt: { usage?: { input: number; output: number }; chargedCostMicros?: number };
          response: unknown;
        }) => {
          const response = delivery.response as Record<string, any> | null;
          const content = response?.choices?.[0]?.message?.content;
          if (typeof content !== "string" || content.length === 0) return;
          const creditsUsed = inferenceCostMicrosToCreditUnits(delivery.receipt.chargedCostMicros ?? 0);
          if (creditsUsed === null) throw new Error("INFERENCE_RESPONSE_CREDIT_AMOUNT_INVALID");
          const { sanitizeMessageRuntimeMetadata } = await import("../localAiRuntimeMetadata");
          const { stageInferenceChatResponseDelivery } = await import("../chatService");
          await stageInferenceChatResponseDelivery({
            attemptId: delivery.attemptId,
            tenantId,
            userId: input.userId,
            idempotencyKey,
            message: {
              conversationId: input.conversationId!,
              role: "assistant",
              content,
              inputTokens: delivery.receipt.usage?.input ?? 0,
              outputTokens: delivery.receipt.usage?.output ?? 0,
              creditsUsed: String(creditsUsed),
              modelUsed: response?.model ?? selectedCandidate.providerModelId ?? selectedCandidate.modelProfileId,
              skillUsed: input.skillUsed,
              traceId,
              runtimeMetadata: sanitizeMessageRuntimeMetadata({
                source: "cloud",
                model: response?.model ?? selectedCandidate.providerModelId ?? selectedCandidate.modelProfileId,
              }),
            },
          });
        }
      : undefined;
    result = await executePolicyRoutedInference({
      request: boundedRequest,
      owners,
      context,
      reservation: durableReservation.authority,
      userId: input.userId,
      messages: input.messages,
      stream: input.stream,
      attemptOwnershipEpoch: 1,
      ownerToken: `chat-owner:${randomUUID()}`,
      maxTokens,
      temperature: input.temperature,
      persistResponseDelivery,
      now,
    });
  } catch {
    // Release only if the durable attempt fence proves no submitted or active
    // provider work needs settlement; close() enforces that guard itself.
    await closeDurableInferenceCreditReservation({
      reservationId: durableReservation.reservationId,
    });
    return { status: "blocked", reason: "INFERENCE_GATEWAY_FAILED" };
  }
  if (result.status === "not_executable") {
    await closeDurableInferenceCreditReservation({
      reservationId: durableReservation.reservationId,
    });
    return { status: "blocked", reason: "INFERENCE_PLAN_NOT_EXECUTABLE" };
  }
  if (
    input.conversationId && result.status === "executed" &&
    result.execution.status === "completed"
  ) {
    try {
      const { deliverSettledInferenceChatResponse } = await import("../chatService");
      const delivery = await deliverSettledInferenceChatResponse(result.execution.receipt.attemptId);
      if (delivery !== "delivered" && delivery !== "already_delivered") {
        return { status: "blocked", reason: "INFERENCE_RESPONSE_DELIVERY_PENDING" };
      }
    } catch {
      return { status: "blocked", reason: "INFERENCE_RESPONSE_DELIVERY_PENDING" };
    }
  }
  return { status: "executed", result, creditsReserved: creditsToReserve };
}
