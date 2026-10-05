import { createHash, randomUUID } from "node:crypto";

import type { JobResult } from "./jobControlPlaneTypes";
import type { ExternalAgentTaskDispatchInput } from "./externalAgentTaskExecutor";
import { dispatchRunnerJobCommand } from "./runnerJobCommandClient";
import {
  validateRunnerJobCommand,
  type RunnerJobCommand,
} from "./runnerJobCommandContracts";
import {
  createExecutionSessionProjection,
  transitionExecutionSessionProjection,
} from "./runnerExecutionSessionService";
import type { ExecutionSessionEventInput } from "./runnerExecutionSessionService";
import type { ExecutionSessionProjectionInput } from "./runnerExecutionSessionContracts";
import { getCachedRunnerControlPlaneOrigin } from "./appRuntimeConfig";
import { normalizeControlPlaneOrigin } from "./runnerContracts";
import { defaultSpec224RunnerInputStagingService } from "./spec224RunnerInputStaging";

type DispatchResult = {
  status: "accepted" | "duplicate";
  commandId: string;
  runnerId: string;
  runnerSessionId: string;
};

export type ExternalAgentTaskDispatcherOptions = {
  dispatch?: (
    command: RunnerJobCommand,
    options?: { spec224InputFetchGrant?: string }
  ) => Promise<DispatchResult>;
  bindStagedInput?: typeof defaultSpec224RunnerInputStagingService.bindPreStagedRunnerInput;
  createSessionProjection?: typeof createExecutionSessionProjection;
  transitionSessionProjection?: typeof transitionExecutionSessionProjection;
  now?: () => Date;
  commandId?: () => string;
  controlPlaneOrigin?: string;
};

function requiredOrigin(): string {
  const configured = getCachedRunnerControlPlaneOrigin();
  if (!configured)
    throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_NOT_CONFIGURED");
  try {
    return normalizeControlPlaneOrigin(configured);
  } catch {
    throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
  }
}

function adapterId(provider: string): "codex.v1" | "claude.v1" {
  if (provider === "codex") return "codex.v1";
  if (provider === "claude_code") return "claude.v1";
  throw new Error("AGENT_PROVIDER_RUNNER_UNSUPPORTED");
}

/**
 * The only Web-side external-agent Runner dispatcher. It emits a normal
 * Feature 195 external wait and uses the existing authenticated Runner
 * gateway; provider processes never become a second lifecycle authority.
 */
export function createExternalAgentTaskDispatcher(
  options: ExternalAgentTaskDispatcherOptions = {}
) {
  const dispatch = options.dispatch ?? dispatchRunnerJobCommand;
  const createSessionProjection =
    options.createSessionProjection ?? createExecutionSessionProjection;
  const transitionSessionProjection =
    options.transitionSessionProjection ?? transitionExecutionSessionProjection;
  const bindStagedInput =
    options.bindStagedInput ??
    ((
      input: Parameters<
        typeof defaultSpec224RunnerInputStagingService.bindPreStagedRunnerInput
      >[0]
    ) =>
      defaultSpec224RunnerInputStagingService.bindPreStagedRunnerInput(input));
  const now = options.now ?? (() => new Date());
  const commandId = options.commandId ?? randomUUID;

  return async (input: ExternalAgentTaskDispatchInput): Promise<JobResult> => {
    const binding = input.manifest.policyBinding;
    if (!binding) throw new Error("AGENT_POLICY_BINDING_REQUIRED");
    if (input.manifest.spec224Input && !input.manifest.spec224Execution)
      throw new Error("SPEC224_EXECUTION_POLICY_REQUIRED");
    if (input.manifest.runtime !== "local_runner") {
      throw new Error("AGENT_RUNTIME_RUNNER_UNSUPPORTED");
    }
    if (binding.workspaceRef !== input.manifest.workspaceId) {
      throw new Error("AGENT_WORKSPACE_BINDING_MISMATCH");
    }
    const deadline = Date.parse(binding.deadline);
    if (!Number.isFinite(deadline) || deadline <= now().getTime()) {
      throw new Error("AGENT_POLICY_DEADLINE_EXPIRED");
    }

    const startProof = input.protectedExecutionStart;
    const commandIdentifier = startProof?.authorizedCommandId ?? commandId();
    const inputSource = input.manifest.spec224Input;
    const stagedInput = inputSource
      ? await bindStagedInput({
          inputSourceRef: inputSource.inputSourceRef,
          commandId: commandIdentifier,
          workerJobId: input.context.jobId,
          attemptId: input.lease.attemptId,
          attempt: input.context.attempt,
          leaseId: `lease:${input.lease.jobId}:${input.lease.attemptId}`,
          fencingToken: input.lease.fencingVersion,
          tenantId: input.context.tenantId,
          runnerId: binding.runnerId,
          runnerSessionId: binding.runnerSessionId,
          authorizationGrantRef: binding.authorizationGrantRef,
          workspaceRef: binding.workspaceRef,
        })
      : null;
    if (
      inputSource &&
      (stagedInput.inputDigest !== inputSource.inputDigest ||
        stagedInput.totalBytes !== inputSource.totalBytes)
    )
      throw new Error("SPEC224_RUNNER_INPUT_SOURCE_MISMATCH");
    const command = validateRunnerJobCommand({
      commandId: commandIdentifier,
      commandType: "execute",
      contractVersion: "runner-job-v1",
      jobId: input.context.jobId,
      attempt: input.context.attempt,
      leaseId: `lease:${input.lease.jobId}:${input.lease.attemptId}`,
      fencingToken: input.lease.fencingVersion,
      tenantId: input.context.tenantId,
      ...(input.context.requestedByUserId
        ? { userId: input.context.requestedByUserId }
        : {}),
      runnerId: binding.runnerId,
      runnerSessionId: binding.runnerSessionId,
      workspaceRef: binding.workspaceRef,
      capabilitySnapshotId: binding.capabilitySnapshotId,
      capabilitySnapshotRevision: binding.capabilitySnapshotRevision,
      controlPlaneOrigin: options.controlPlaneOrigin ?? requiredOrigin(),
      executionKind: "external_agent_task",
      adapterId: adapterId(input.manifest.provider),
      adapterVersionConstraint: "0.1.0",
      idempotencyKey:
        startProof?.eventIdempotencyKey ??
        `agent:${input.manifest.taskId}:plan:${input.manifest.planId}:${input.manifest.planRevision}`.slice(
          0,
          128
        ),
      deadline: binding.deadline,
      authorizationGrantRef: binding.authorizationGrantRef,
      inputRef:
        stagedInput?.inputRef ??
        `runner-input:${input.context.jobId}:${input.lease.attemptId}`,
      payload: {
        taskId: input.manifest.taskId,
        goalId: input.manifest.goalId,
        planId: input.manifest.planId,
        planRevision: input.manifest.planRevision,
        workspaceId: input.manifest.workspaceId,
        contextPackageIds: input.manifest.contextPackageIds,
        skillIds: input.manifest.skillIds,
        mcpGrantIds: input.manifest.mcpGrantIds,
        requestedCapabilities: input.manifest.requestedCapabilities,
        ...(input.manifest.spec224Execution
          ? { spec224Execution: input.manifest.spec224Execution }
          : {}),
        approvalRef: binding.approvalRef,
        budgetReservationRef: binding.budgetReservationRef,
        spendCeilingMicros: binding.spendCeilingMicros,
      },
    });

    await input.reporter.assertActive(input.lease);
    const operationKey = `external-agent:${input.manifest.taskId}:${input.manifest.planId}:${input.manifest.planRevision}`;
    const sessionId = `s278_${createHash("sha256")
      .update(
        `${command.tenantId}\0${command.jobId}\0${command.attempt}\0${command.idempotencyKey}`
      )
      .digest("hex")
      .slice(0, 40)}`;
    const sessionProjectionInput: ExecutionSessionProjectionInput = {
      sessionId,
      tenantId: command.tenantId,
      workerJobId: command.jobId,
      workerJobAttempt: command.attempt,
      leaseFencingVersion: command.fencingToken,
      runnerId: command.runnerId,
      generation: command.attempt,
      authorityEpoch: 0,
      placementEpoch: 0,
      jobControlRevision: 1,
      state: "starting",
      desiredState: "starting",
      continuityClass: "ephemeral",
      enforcementLevel: "COMMAND_ONLY",
      driverId: command.adapterId,
      driverVersion: command.adapterVersionConstraint,
    };
    const sessionProjectionEvent: ExecutionSessionEventInput = {
      idempotencyKey: `spec278:create:${sessionId}`,
      eventType: "projection_created",
      payload: { source: "external_agent_dispatch" },
    };
    const sessionProjection = await createSessionProjection(
      sessionProjectionInput,
      sessionProjectionEvent
    );
    const executionSessionId = sessionProjection?.sessionId ?? null;
    try {
      await input.reporter.waitForExternal(input.lease, {
        operationKey,
        providerReference: `runner-command:${command.commandId}`,
        resumeAfter: command.deadline,
        metadata: {
          commandId: command.commandId,
          runnerId: command.runnerId,
          runnerSessionId: command.runnerSessionId,
          ...(executionSessionId ? { executionSessionId } : {}),
          capabilitySnapshotId: command.capabilitySnapshotId,
          capabilitySnapshotRevision: command.capabilitySnapshotRevision,
          leaseId: command.leaseId,
          // Avoid the generic payload redactor's `token` key pattern; this is
          // a non-secret lease fence scalar.
          fenceVersion: command.fencingToken,
          executionKind: command.executionKind,
          adapterId: command.adapterId,
          idempotencyKey: command.idempotencyKey,
          approvalRef: binding.approvalRef,
          budgetReservationRef: binding.budgetReservationRef,
          spendCeilingMicros: binding.spendCeilingMicros,
          commandTemplate: {
            commandId: command.commandId,
            commandType: command.commandType,
            contractVersion: command.contractVersion,
            jobId: command.jobId,
            attempt: command.attempt,
            leaseId: command.leaseId,
            fenceVersion: command.fencingToken,
            tenantId: command.tenantId,
            ...(command.userId === undefined ? {} : { userId: command.userId }),
            ...(command.projectRef ? { projectRef: command.projectRef } : {}),
            workspaceRef: command.workspaceRef,
            runnerId: command.runnerId,
            runnerSessionId: command.runnerSessionId,
            ...(executionSessionId ? { executionSessionId } : {}),
            capabilitySnapshotId: command.capabilitySnapshotId,
            capabilitySnapshotRevision: command.capabilitySnapshotRevision,
            controlPlaneOrigin: command.controlPlaneOrigin,
            executionKind: command.executionKind,
            adapterId: command.adapterId,
            adapterVersionConstraint: command.adapterVersionConstraint,
            idempotencyKey: command.idempotencyKey,
            deadline: command.deadline,
            authEvidenceRef: command.authorizationGrantRef,
            inputRef: command.inputRef,
          },
        },
      });
    } catch (error) {
      if (executionSessionId) {
        try {
          await transitionSessionProjection({
            sessionId: executionSessionId,
            tenantId: command.tenantId,
            expectedRevision: sessionProjectionInput.jobControlRevision,
            nextState: "unknown",
            event: {
              idempotencyKey: `spec278:wait_unknown:${command.commandId}`,
              eventType: "external_wait_outcome_unknown",
              payload: { source: "external_agent_dispatch" },
            },
          });
        } catch {
          // Preserve the original external-wait persistence error.
        }
      }
      throw error;
    }

    let result: DispatchResult;
    try {
      result = stagedInput
        ? await dispatch(command, {
            spec224InputFetchGrant: stagedInput.inputFetchGrant,
          })
        : await dispatch(command);
    } catch (error) {
      if (executionSessionId) {
        try {
          await transitionSessionProjection({
            sessionId: executionSessionId,
            tenantId: command.tenantId,
            expectedRevision: sessionProjectionInput.jobControlRevision,
            nextState: "unknown",
            event: {
              idempotencyKey: `spec278:dispatch_unknown:${command.commandId}`,
              eventType: "dispatch_outcome_unknown",
              payload: { source: "external_agent_dispatch" },
            },
          });
        } catch {
          // The canonical job's external-wait failure is already recorded.
          // Keep the shadow projection non-authoritative if its best-effort
          // uncertainty event cannot be persisted during the same outage.
        }
      }
      await input.controlPlane.failExternalWait(
        command.jobId,
        error instanceof Error
          ? error.message
          : "RUNNER_COMMAND_DISPATCH_FAILED",
        true,
        now(),
        operationKey
      );
      return {
        deferred: true,
        output: { commandId: command.commandId, status: "dispatch_failed" },
      };
    }
    return {
      deferred: true,
      output: {
        commandId: result.commandId,
        runnerId: result.runnerId,
        runnerSessionId: result.runnerSessionId,
        status: result.status,
      },
    };
  };
}
