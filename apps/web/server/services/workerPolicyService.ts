import { DEFAULT_CLAW_GATEWAY_COMPATIBILITY } from "../../shared/workerRuntime";
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
    gatewayCompatibility: DEFAULT_CLAW_GATEWAY_COMPATIBILITY,
  };
}
