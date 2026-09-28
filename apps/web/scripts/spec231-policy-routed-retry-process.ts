import { executePolicyRoutedInference } from "../server/services/inference/automaticInferenceRequest";
import { planInferenceRouteForRequest } from "../server/services/inference/inferencePlanningService";

type Input = {
  request: unknown;
  owners: Parameters<typeof planInferenceRouteForRequest>[0]["owners"];
  context: Parameters<typeof executePolicyRoutedInference>[0]["context"];
  reservation: Parameters<typeof executePolicyRoutedInference>[0]["reservation"];
  userId: number;
  messages: Parameters<typeof executePolicyRoutedInference>[0]["messages"];
  stream: boolean;
  attemptOwnershipEpoch: number;
  ownerToken: string;
  workerJobId?: string;
  workerJobAttemptId?: string;
  now: string;
};

async function main() {
  const encoded = process.env.SPEC231_POLICY_ROUTED_INPUT;
  if (!encoded) throw new Error("SPEC231_POLICY_ROUTED_INPUT is required");
  const input = JSON.parse(encoded) as Input;
  const now = new Date(input.now);
  const route = await planInferenceRouteForRequest({
    request: input.request,
    owners: input.owners,
    now,
  });
  if (route.status !== "planned" || route.route.status !== "selected") {
    throw new Error("Retry process could not resolve the persisted AUTO route");
  }

  let providerInvoked = false;
  const result = await executePolicyRoutedInference({
    ...input,
    now,
  }, {
    createExecutionBindings: () => ({
      resolveCandidate: async () => ({
        candidate: route.route.candidate,
        authority: route.authority,
      }),
      loadReservationAuthority: async () => input.reservation,
      settleCompletedAttempt: async () => true,
      providerIdempotencyCertified: () => false,
      executeAttempt: async ({ candidate }) => {
        providerInvoked = true;
        return {
          observation: {
            outcome: "completed",
            submissionState: "submitted",
            streamCommitted: false,
            chargedCostMicros: 10,
            observedExecution: {
              model: candidate.providerModelId ?? "native:auto-test-model",
              providerId: candidate.providerId,
              credentialOwnerRef: candidate.credentialOwnerRef,
              deploymentId: candidate.deploymentId,
              endpointSurface: candidate.endpointSurface,
            },
          },
          response: { text: "retry-process-response" },
        };
      },
    }),
  });

  const execution = result.status === "executed" ? result.execution : null;
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    planId: result.status === "executed" ? result.planning.planId : null,
    planCreated: result.status === "executed" ? result.planning.created : null,
    executionStatus: execution?.status ?? null,
    attemptId:
      execution && "attemptId" in execution
        ? execution.attemptId
        : execution && "receipt" in execution
          ? execution.receipt.attemptId
          : null,
    existingStatus:
      execution && "existingStatus" in execution
        ? execution.existingStatus
        : null,
    providerInvoked,
  })}\n`);
}

void main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
