import { createHash } from "node:crypto";

import type { WorkerJob } from "../../drizzle/schema";
import {
  validateRunnerJobCommand,
  type RunnerJobCommand,
} from "./runnerJobCommandContracts";

type CommandTemplate = Record<string, unknown>;

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`RUNNER_CANCEL_${field}_REQUIRED`);
  }
  return value;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 48)}`;
}

/** Build a repeatable cancel command from the exact persisted execute binding. */
export function buildRunnerCancellationCommand(input: {
  job: Pick<WorkerJob, "id" | "tenantId" | "attempt" | "fencingVersion">;
  operationKey: string;
  template: CommandTemplate;
}): { operationId: string; command: RunnerJobCommand } {
  const template = input.template;
  const targetCommandId = required(template.commandId, "TARGET_COMMAND_ID");
  const operationId = stableId(
    "spec224-cancel",
    `${input.job.id}\0${input.job.attempt}\0${input.operationKey}\0${targetCommandId}`
  );
  const command = validateRunnerJobCommand({
    commandId: stableId("cancel", operationId),
    commandType: "cancel",
    contractVersion: "runner-job-v1",
    jobId: input.job.id,
    attempt: input.job.attempt,
    leaseId: required(template.leaseId, "LEASE_ID"),
    fencingToken: input.job.fencingVersion,
    tenantId: input.job.tenantId,
    ...(Number.isSafeInteger(template.userId)
      ? { userId: Number(template.userId) }
      : {}),
    ...(typeof template.projectRef === "string"
      ? { projectRef: template.projectRef }
      : {}),
    ...(typeof template.workspaceRef === "string"
      ? { workspaceRef: template.workspaceRef }
      : {}),
    runnerId: required(template.runnerId, "RUNNER_ID"),
    runnerSessionId: required(template.runnerSessionId, "SESSION_ID"),
    capabilitySnapshotId: required(
      template.capabilitySnapshotId,
      "CAPABILITY_ID"
    ),
    capabilitySnapshotRevision: required(
      template.capabilitySnapshotRevision,
      "CAPABILITY_REVISION"
    ),
    controlPlaneOrigin: required(template.controlPlaneOrigin, "CONTROL_PLANE"),
    executionKind: required(template.executionKind, "EXECUTION_KIND"),
    adapterId: required(template.adapterId, "ADAPTER"),
    ...(typeof template.adapterVersionConstraint === "string"
      ? { adapterVersionConstraint: template.adapterVersionConstraint }
      : {}),
    ...(typeof template.browserEngineConstraint === "string"
      ? { browserEngineConstraint: template.browserEngineConstraint }
      : {}),
    idempotencyKey: `spec224-cancel:${operationId}`,
    deadline: required(template.deadline, "DEADLINE"),
    authorizationGrantRef: required(
      template.authEvidenceRef ?? template.authorizationGrantRef,
      "AUTHORIZATION_REF"
    ),
    inputRef: `runner-cancel:${operationId}`,
    payload: { cancellationOperationId: operationId, targetCommandId },
  });
  if (
    template.commandType !== "execute" ||
    template.tenantId !== input.job.tenantId
  ) {
    throw new Error("RUNNER_CANCEL_EXECUTE_BINDING_MISMATCH");
  }
  if (template.fenceVersion !== input.job.fencingVersion) {
    throw new Error("RUNNER_CANCEL_FENCE_STALE");
  }
  return { operationId, command };
}
