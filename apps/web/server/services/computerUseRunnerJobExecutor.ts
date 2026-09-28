import { randomUUID } from "node:crypto";

import type { JobReporter, LeaseContext, JobResult } from "./jobControlPlaneTypes";
import type { JobExecutorContext } from "./jobExecutor";
import { getCachedRunnerControlPlaneOrigin } from "./appRuntimeConfig";
import { dispatchRunnerJobCommand } from "./runnerJobCommandClient";
import {
  buildSemanticActionCommand,
  buildSemanticObservePayload,
} from "./computerUseSemanticHandshake";
import {
  validateRunnerJobCommand,
  type RunnerJobCommand,
} from "./runnerJobCommandContracts";
import { normalizeControlPlaneOrigin } from "./runnerContracts";

type ComputerUseBrowserInput = {
  traceId: string;
  computerUseRunId: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  authorizationGrantRef: string;
  workspaceRef?: string;
  projectRef?: string;
  deadline?: string;
  payload: Record<string, unknown>;
};

type ApprovalContinuation = {
  approvalRequestId: string;
  actionId: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  fencingVersion: number;
  semanticState: Record<string, unknown>;
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`COMPUTER_USE_${field}_REQUIRED`);
  return value.trim();
}

function runnerControlPlaneOrigin(): string {
  const configured = getCachedRunnerControlPlaneOrigin();
  if (!configured) throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_NOT_CONFIGURED");
  try {
    return normalizeControlPlaneOrigin(configured);
  } catch {
    throw new Error("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredContinuationText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`COMPUTER_USE_APPROVAL_${field}_INVALID`);
  return value.trim();
}

function approvalContinuation(input: ComputerUseBrowserInput): ApprovalContinuation | null {
  const raw = input.payload.approvalContinuation;
  if (raw === undefined) return null;
  const value = record(raw);
  const semanticState = record(value.semanticState);
  const fencingVersion = value.fencingVersion;
  if (
    !requiredContinuationText(value.approvalRequestId, "REQUEST_ID")
    || !requiredContinuationText(value.actionId, "ACTION_ID")
    || !requiredContinuationText(value.runnerId, "RUNNER_ID")
    || !requiredContinuationText(value.runnerSessionId, "SESSION_ID")
    || !requiredContinuationText(value.capabilitySnapshotId, "CAPABILITY_SNAPSHOT_ID")
    || !requiredContinuationText(value.capabilitySnapshotRevision, "CAPABILITY_SNAPSHOT_REVISION")
    || !Number.isSafeInteger(fencingVersion)
    || fencingVersion < 1
    || Object.keys(semanticState).length === 0
  ) {
    throw new Error("COMPUTER_USE_APPROVAL_CONTINUATION_INVALID");
  }
  return {
    approvalRequestId: value.approvalRequestId as string,
    actionId: value.actionId as string,
    runnerId: value.runnerId as string,
    runnerSessionId: value.runnerSessionId as string,
    capabilitySnapshotId: value.capabilitySnapshotId as string,
    capabilitySnapshotRevision: value.capabilitySnapshotRevision as string,
    fencingVersion: fencingVersion as number,
    semanticState,
  };
}

function buildCommand(context: JobExecutorContext, input: ComputerUseBrowserInput, lease: { jobId: string; attemptId: string; fencingVersion: number }): RunnerJobCommand {
  const deadline = input.deadline ?? new Date(Date.now() + context.timeoutSeconds * 1000).toISOString();
  const semantic = input.payload.requiresIndependentVerification === true;
  const decisionRequest = input.payload.decisionRequest && typeof input.payload.decisionRequest === "object"
    ? input.payload.decisionRequest as Record<string, unknown>
    : null;
  const semanticPayload = semantic
    ? {
        ...buildSemanticObservePayload({
          goal: String(decisionRequest?.goal ?? "observe page"),
          allowedActionFamilies: Array.isArray(decisionRequest?.allowedActionFamilies)
            ? decisionRequest.allowedActionFamilies.map(String)
            : ["click"],
          maxCandidates: Number(decisionRequest?.maxCandidates ?? 32),
          expectedSuccessCondition: input.payload.expectedSuccessCondition && typeof input.payload.expectedSuccessCondition === "object"
            ? input.payload.expectedSuccessCondition as Record<string, unknown>
            : undefined,
        }),
        ...(input.payload.fixtureUrl ? { fixtureUrl: input.payload.fixtureUrl } : {}),
        ...(input.payload.semanticIntent ? { semanticIntent: input.payload.semanticIntent } : {}),
        correlation: input.payload.correlation ?? {},
        requiresIndependentVerification: true,
        decisionRequest,
        verification: input.payload.verification ?? {
          required: true,
          verifier: "spec208-independent-v1",
          mode: "post_observation",
        },
      }
    : input.payload;
  const baseCommand = validateRunnerJobCommand({
    commandId: randomUUID(),
    commandType: "execute",
    contractVersion: "runner-job-v1",
    jobId: context.jobId,
    attempt: context.attempt,
    leaseId: `lease:${lease.jobId}:${lease.attemptId}`,
    fencingToken: lease.fencingVersion,
    tenantId: context.tenantId,
    ...(context.requestedByUserId ? { userId: context.requestedByUserId } : {}),
    ...(input.projectRef ? { projectRef: input.projectRef } : {}),
    ...(input.workspaceRef ? { workspaceRef: input.workspaceRef } : {}),
    runnerId: requiredText(input.runnerId, "RUNNER_ID"),
    runnerSessionId: requiredText(input.runnerSessionId, "RUNNER_SESSION_ID"),
    capabilitySnapshotId: requiredText(input.capabilitySnapshotId, "CAPABILITY_SNAPSHOT_ID"),
    capabilitySnapshotRevision: requiredText(input.capabilitySnapshotRevision, "CAPABILITY_SNAPSHOT_REVISION"),
    controlPlaneOrigin: runnerControlPlaneOrigin(),
    executionKind: "computer_use.browser",
    adapterId: "browser.v1",
    adapterVersionConstraint: "0.1.0",
    browserEngineConstraint: "chromium",
    idempotencyKey: `computer-use:${context.jobId}:${context.attempt}`,
    deadline,
    authorizationGrantRef: requiredText(input.authorizationGrantRef, "AUTHORIZATION_GRANT"),
    inputRef: `runner-input:${context.jobId}:${lease.attemptId}`,
    payload: {
      ...semanticPayload,
      traceId: requiredText(input.traceId, "TRACE_ID"),
      computerUseRunId: requiredText(input.computerUseRunId, "RUN_ID"),
    },
  });
  const continuation = approvalContinuation(input);
  if (!continuation) return baseCommand;
  if (!semantic) throw new Error("COMPUTER_USE_APPROVAL_CONTINUATION_REQUIRES_SEMANTIC_MODE");
  if (
    continuation.runnerId !== input.runnerId
    || continuation.runnerSessionId !== input.runnerSessionId
    || continuation.capabilitySnapshotId !== input.capabilitySnapshotId
    || continuation.capabilitySnapshotRevision !== input.capabilitySnapshotRevision
    || continuation.fencingVersion >= lease.fencingVersion
  ) {
    throw new Error("COMPUTER_USE_APPROVAL_CONTINUATION_BINDING_STALE");
  }
  const state = continuation.semanticState;
  const semanticIntent = record(input.payload.semanticIntent);
  const action = buildSemanticActionCommand({
    baseCommand,
    observation: state.preObservation as any,
    candidateSet: state.candidateSet as any,
    decision: state.decision as any,
    policyDecision: state.policyDecision as any,
    selectedCandidate: state.selectedCandidate as any,
    actionParameters: typeof semanticIntent.text === "string" ? { text: semanticIntent.text } : undefined,
    idempotencyKey: `${baseCommand.idempotencyKey}:action:${continuation.actionId}`,
  });
  const lineage = record(action.payload.lineage);
  if (lineage.actionId !== continuation.actionId) {
    throw new Error("COMPUTER_USE_APPROVAL_ACTION_LINEAGE_MISMATCH");
  }
  return validateRunnerJobCommand({
    ...action,
    payload: {
      ...action.payload,
      approvalRequestId: continuation.approvalRequestId,
    },
  });
}

/** Feature 195 executor: dispatches to the existing Runner channel then waits
 * on the canonical external-wait lifecycle until a receipt settles the job. */
export async function executeComputerUseBrowserJob(input: {
  context: JobExecutorContext;
  lease: LeaseContext;
  reporter: Pick<JobReporter, "waitForExternal" | "assertActive">;
  controlPlane: { failExternalWait: (jobId: string, reason: string, operatorReviewRequired?: boolean, now?: Date, operationKey?: string) => Promise<"failed" | "ignored"> };
}): Promise<JobResult> {
  const payload = input.context.input as unknown as ComputerUseBrowserInput;
  const command = buildCommand(input.context, payload, input.lease);
  await input.reporter.assertActive(input.lease);
  const operationKey = `computer-use:${command.jobId}:${command.attempt}`;
  await input.reporter.waitForExternal(input.lease, {
    operationKey,
    providerReference: `runner-command:${command.commandId}`,
    resumeAfter: command.deadline,
      metadata: {
      ...payload.payload,
      traceId: payload.traceId,
      computerUseRunId: payload.computerUseRunId,
      correlation: {
        traceId: payload.traceId,
        computerUseRunId: payload.computerUseRunId,
      },
        commandId: command.commandId,
        commandStage: command.payload.stage ?? "legacy",
        commandTemplate: {
          commandId: command.commandId,
          commandType: command.commandType,
          contractVersion: command.contractVersion,
          jobId: command.jobId,
          attempt: command.attempt,
          leaseId: command.leaseId,
          // This lease fence is a non-secret scalar; use a neutral metadata
          // key so generic payload redaction does not erase follow-up state.
          fenceVersion: command.fencingToken,
          tenantId: command.tenantId,
          ...(command.userId === undefined ? {} : { userId: command.userId }),
          ...(command.projectRef ? { projectRef: command.projectRef } : {}),
          ...(command.workspaceRef ? { workspaceRef: command.workspaceRef } : {}),
          runnerId: command.runnerId,
          runnerSessionId: command.runnerSessionId,
          capabilitySnapshotId: command.capabilitySnapshotId,
          capabilitySnapshotRevision: command.capabilitySnapshotRevision,
          controlPlaneOrigin: command.controlPlaneOrigin,
          executionKind: command.executionKind,
          adapterId: command.adapterId,
          ...(command.adapterVersionConstraint ? { adapterVersionConstraint: command.adapterVersionConstraint } : {}),
          ...(command.browserEngineConstraint ? { browserEngineConstraint: command.browserEngineConstraint } : {}),
          idempotencyKey: command.idempotencyKey,
          deadline: command.deadline,
          // This is an opaque immutable evidence reference, not a reusable
          // credential. Keep it under a non-secret key so canonical job
          // redaction does not destroy semantic follow-up reconstruction.
          authEvidenceRef: command.authorizationGrantRef,
          inputRef: command.inputRef,
        },
      runnerId: command.runnerId,
      runnerSessionId: command.runnerSessionId,
      capabilitySnapshotId: command.capabilitySnapshotId,
      capabilitySnapshotRevision: command.capabilitySnapshotRevision,
      leaseId: command.leaseId,
      fencingToken: command.fencingToken,
      executionKind: command.executionKind,
      adapterId: command.adapterId,
    },
  });
  let dispatched;
  try {
    dispatched = await dispatchRunnerJobCommand(command);
  } catch (error) {
    await input.controlPlane.failExternalWait(
      command.jobId,
      error instanceof Error ? error.message : "RUNNER_COMMAND_DISPATCH_FAILED",
      true,
      new Date(),
      operationKey,
    );
    return { deferred: true, output: { commandId: command.commandId, status: "dispatch_failed" } };
  }
  return {
    deferred: true,
    output: {
      traceId: payload.traceId,
      computerUseRunId: payload.computerUseRunId,
      commandId: command.commandId,
      runnerId: command.runnerId,
      runnerSessionId: command.runnerSessionId,
      capabilitySnapshotId: command.capabilitySnapshotId,
      capabilitySnapshotRevision: command.capabilitySnapshotRevision,
      status: "waiting_for_runner_receipt",
    },
  };
}
