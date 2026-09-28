import {
  getCachedInternalNodeUrl,
  getCachedPreferredInternalToken,
  getCachedRunnerControlPlaneOrigin,
} from "./appRuntimeConfig";
import {
  validateRunnerJobCommand,
  type RunnerJobCommand,
} from "./runnerJobCommandContracts";
import { normalizeControlPlaneOrigin } from "./runnerContracts";

export type RunnerJobCommandDispatchResult = {
  status: "accepted" | "duplicate";
  commandId: string;
  runnerId: string;
  runnerSessionId: string;
};

/**
 * Feature 195's Node worker is a separate process from the Web origin. This
 * client crosses the existing authenticated internal Web boundary; the Web
 * process owns the live Runner socket and receipt normalization.
 */
export async function dispatchRunnerJobCommand(
  command: RunnerJobCommand,
): Promise<RunnerJobCommandDispatchResult> {
  const normalized = validateRunnerJobCommand(command);
  const baseUrl = getCachedInternalNodeUrl();
  const token = getCachedPreferredInternalToken();
  if (!baseUrl || !token) throw new Error("RUNNER_INTERNAL_GATEWAY_NOT_CONFIGURED");
  const configuredOrigin = getCachedRunnerControlPlaneOrigin();
  if (!configuredOrigin) throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_NOT_CONFIGURED");
  let expectedOrigin: string;
  try {
    expectedOrigin = normalizeControlPlaneOrigin(configuredOrigin);
  } catch {
    throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
  }
  if (normalized.controlPlaneOrigin !== expectedOrigin)
    throw new Error("RUNNER_CONTROL_PLANE_MISMATCH");
  const response = await fetch(
    `${baseUrl}/api/internal/runners/${encodeURIComponent(normalized.runnerId)}/job-command`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify(normalized),
    },
  );
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof body.error === "string" ? body.error : "RUNNER_COMMAND_DISPATCH_FAILED";
    throw new Error(code);
  }
  if (body.status !== "accepted" && body.status !== "duplicate")
    throw new Error("RUNNER_COMMAND_DISPATCH_RESPONSE_INVALID");
  return {
    status: body.status,
    commandId: String(body.commandId ?? normalized.commandId),
    runnerId: String(body.runnerId ?? normalized.runnerId),
    runnerSessionId: String(body.runnerSessionId ?? normalized.runnerSessionId),
  };
}
