import {
  JobControlPlaneError,
  type JobResult,
} from "./jobControlPlaneTypes";
import type { JobExecutor } from "./jobExecutor";
import {
  validateAgentTaskManifest,
  type AgentTaskManifest,
} from "./agentControlPlaneContracts";

export type ExternalAgentTaskDispatchInput = {
  manifest: AgentTaskManifest;
  context: Parameters<JobExecutor>[0]["context"];
  lease: Parameters<JobExecutor>[0]["lease"];
  reporter: Parameters<JobExecutor>[0]["reporter"];
  controlPlane: Parameters<JobExecutor>[0]["controlPlane"];
};

export type ExternalAgentTaskDispatcher = (
  input: ExternalAgentTaskDispatchInput
) => Promise<JobResult>;

let configuredDispatcher: ExternalAgentTaskDispatcher | null = null;

/**
 * Feature 206/200 integration seam. Provider and transport adapters configure
 * this once their approved runtime is available; the canonical Job executor
 * remains registered even while the seam is unavailable and fails closed.
 */
export function configureExternalAgentTaskDispatcher(
  dispatcher: ExternalAgentTaskDispatcher
): void {
  if (configuredDispatcher && configuredDispatcher !== dispatcher) {
    throw new JobControlPlaneError(
      "JOB_EXECUTOR_ALREADY_CONFIGURED",
      "External agent task dispatcher is already configured"
    );
  }
  configuredDispatcher = dispatcher;
}

export function resetExternalAgentTaskDispatcherForTests(): void {
  configuredDispatcher = null;
}

export function isExternalAgentTaskDispatcherConfigured(): boolean {
  return configuredDispatcher !== null;
}

export const executeExternalAgentTask: JobExecutor = async input => {
  const rawInput = input.context.input;
  const manifest = validateAgentTaskManifest(
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>).manifest
      : undefined
  );

  if (
    manifest.tenantId !== input.context.tenantId ||
    input.context.requestedByUserId !== manifest.actorId
  ) {
    throw new JobControlPlaneError(
      "JOB_CONTEXT_INVALID",
      "External agent manifest identity does not match the canonical Job context"
    );
  }

  const dispatcher = configuredDispatcher;
  if (!dispatcher) {
    throw new JobControlPlaneError(
      "JOB_EXECUTOR_UNREGISTERED",
      "External agent transport dispatcher is not configured"
    );
  }

  return dispatcher({
    manifest,
    context: input.context,
    lease: input.lease,
    reporter: input.reporter,
    controlPlane: input.controlPlane,
  });
};
