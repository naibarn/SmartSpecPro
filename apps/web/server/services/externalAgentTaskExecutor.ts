import { JobControlPlaneError, type JobResult } from "./jobControlPlaneTypes";
import type { JobExecutor } from "./jobExecutor";
import {
  validateAgentTaskManifest,
  type AgentTaskManifest,
} from "./agentControlPlaneContracts";
import { commitSpec224ProtectedExecutionStart } from "./spec224RuntimeAdmission";
import type { Spec224ProtectedExecutionStartResult } from "./spec224RuntimeAdmission";
import { commitSpec224GoalDelegatedExecutionStart, type Spec224GoalExecutionStart } from "./jobControlPlane";

export type ExternalAgentTaskDispatchInput = {
  manifest: AgentTaskManifest;
  context: Parameters<JobExecutor>[0]["context"];
  lease: Parameters<JobExecutor>[0]["lease"];
  reporter: Parameters<JobExecutor>[0]["reporter"];
  controlPlane: Parameters<JobExecutor>[0]["controlPlane"];
  protectedExecutionStart?: Extract<
    Spec224ProtectedExecutionStartResult,
    { outcome: "STARTED" | "ALREADY_STARTED" }
  >;
  goalExecutionStart?: Spec224GoalExecutionStart;
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
  const requiresProtectedStart = input.context.requiresSpec224ProtectedExecutionStart === true;
  const requiresGoalStart = input.context.requiresSpec224GoalExecutionStart === true;
  if (input.context.requiresSpec224Admission && requiresProtectedStart === requiresGoalStart) {
    throw new JobControlPlaneError(
      "SPEC224_RUNTIME_SCOPE_UNRESOLVED",
      "DevelopmentRun dispatch requires exactly one canonical execution-start authority"
    );
  }
  let protectedExecutionStart: ExternalAgentTaskDispatchInput["protectedExecutionStart"];
  let goalExecutionStart: Spec224GoalExecutionStart | undefined;
  if (requiresProtectedStart || requiresGoalStart) {
    if (
      !input.context.spec224AdmissionBindingValid ||
      input.lease.jobId !== input.context.jobId ||
      input.lease.fencingVersion !== input.context.workerJobFencingVersion
    ) {
      throw new JobControlPlaneError(
        "SPEC224_RUNTIME_BINDING_STALE",
        "DevelopmentRun projection does not match the current canonical worker fence"
      );
    }
    if (requiresProtectedStart) {
      const start = await commitSpec224ProtectedExecutionStart({
        tenantId: input.context.tenantId,
        workerJobId: input.context.jobId,
        lease: input.lease,
      });
      if (start.outcome === "DENIED") {
        throw new JobControlPlaneError(
          start.reason,
          "Platform Engineering dispatch requires canonical protected execution-start admission"
        );
      }
      protectedExecutionStart = start;
    } else {
      if (input.context.requestedByUserId === undefined) {
        throw new JobControlPlaneError("SPEC224_GOAL_START_ACTOR_REQUIRED", "Owner-scoped Goal start requires its authenticated actor");
      }
      const start = await commitSpec224GoalDelegatedExecutionStart({
        tenantId: input.context.tenantId,
        requestedByUserId: input.context.requestedByUserId,
        lease: input.lease,
      });
      if (start.outcome === "DENIED") {
        throw new JobControlPlaneError(start.reason, "Owner-scoped Goal Grant is no longer valid for this Runner attempt");
      }
      goalExecutionStart = start;
    }
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
      ...(protectedExecutionStart ? { protectedExecutionStart } : {}),
      ...(goalExecutionStart ? { goalExecutionStart } : {}),
    });
  }
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
