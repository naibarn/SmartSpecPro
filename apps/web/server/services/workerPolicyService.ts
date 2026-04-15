import {
  getWorkerRuntimeDefinition,
  summarizeHermesProviderRouting,
} from "../../shared/workerRuntime";
import type { WorkerAccessAuthContext } from "./workerAuthService";
import {
  WorkerRuntimeServiceError,
  getDefaultWorkerRuntimeRepository,
  type WorkerRuntimeRepository,
} from "./workerRegistryService";

export async function getWorkerPolicySnapshot(
  input: {
    auth: WorkerAccessAuthContext;
    workerId: string;
  },
  deps: { repo?: WorkerRuntimeRepository } = {},
): Promise<Record<string, unknown>> {
  const repo = deps.repo ?? getDefaultWorkerRuntimeRepository();
  const worker = await repo.getWorkerById(input.auth.tenantId, input.workerId);
  if (!worker) {
    throw new WorkerRuntimeServiceError(
      "not_found",
      404,
      `Worker ${input.workerId} was not found`,
      "not_found_error",
    );
  }
  if (worker.id !== input.auth.workerId) {
    throw new WorkerRuntimeServiceError(
      "worker_scope_mismatch",
      403,
      "Worker token does not match the requested worker",
      "auth_error",
    );
  }

  const policy = worker.policyProfileId
    ? await repo.getWorkerPolicyById(worker.policyProfileId)
    : null;
  const runtimeProfile = worker.runtimeProfileId
    ? await repo.getRuntimeProfileById(worker.runtimeProfileId)
    : null;
  const runtimeDefinition = getWorkerRuntimeDefinition(worker.runtimeType);
  const controlPlane = worker.healthSummaryJson && typeof worker.healthSummaryJson === "object"
    ? (worker.healthSummaryJson as Record<string, unknown>).controlPlane
    : null;
  const compatibility = controlPlane && typeof controlPlane === "object"
    ? (controlPlane as Record<string, unknown>).compatibility ?? null
    : null;
  const runtimeMetadata = worker.capabilitiesJson && typeof worker.capabilitiesJson === "object"
    ? (worker.capabilitiesJson as Record<string, unknown>).runtimeMetadata ?? null
    : null;
  const providerRouting = worker.runtimeType === "hermes_agent_gateway"
    ? summarizeHermesProviderRouting(runtimeMetadata as Record<string, unknown> | null | undefined)
    : null;

  return {
    workerId: worker.id,
    runtimeType: worker.runtimeType,
    status: worker.status,
    teamId: worker.teamId ?? null,
    fileScopeMode: worker.fileScopeMode,
    capabilities: worker.capabilitiesJson ?? {},
    policy: policy?.rulesJson ?? {},
    runtimeProfile: runtimeProfile
      ? {
          id: runtimeProfile.id,
          name: runtimeProfile.name,
          profileJson: runtimeProfile.profileJson,
        }
      : null,
    gatewayCompatibility: runtimeDefinition.gatewayCompatibility,
    compatibility,
    runtimeMetadata: {
      displayName: runtimeDefinition.displayName,
      familyName: runtimeDefinition.familyName,
      featureFlag: runtimeDefinition.featureFlag,
      registrationSupport: runtimeDefinition.registrationSupport,
      dispatchSupport: runtimeDefinition.dispatchSupport,
      runtimeMetadata,
      providerRouting,
    },
  };
}
