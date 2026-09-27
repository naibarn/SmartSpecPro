import { describe, expect, it } from "vitest";

import { buildRunnerCancellationCommand } from "../runnerCancellationCommand";

const job = {
  id: "job-cancel-1",
  tenantId: "tenant-1",
  attempt: 2,
  fencingVersion: 7,
};

const template = () => ({
  commandId: "execute-command-1",
  commandType: "execute",
  jobId: job.id,
  attempt: job.attempt,
  leaseId: "lease:job-cancel-1:attempt-2",
  fenceVersion: job.fencingVersion,
  tenantId: job.tenantId,
  runnerId: "runner-1",
  runnerSessionId: "session-1",
  capabilitySnapshotId: "capability-1",
  capabilitySnapshotRevision: "revision-1",
  controlPlaneOrigin: "http://localhost:3000",
  executionKind: "external_agent_task",
  adapterId: "codex.v1",
  idempotencyKey: "execute:job-cancel-1:2",
  deadline: "2099-01-01T00:00:00.000Z",
  authEvidenceRef: "grant-ref-1",
});

describe("Spec 224 Runner cancellation command", () => {
  it("derives a stable cancel operation fenced to the persisted execute binding", () => {
    const first = buildRunnerCancellationCommand({
      job,
      operationKey: "external-agent:task-1:plan-1:2",
      template: template(),
    });
    const retry = buildRunnerCancellationCommand({
      job,
      operationKey: "external-agent:task-1:plan-1:2",
      template: template(),
    });

    expect(first).toEqual(retry);
    expect(first.command).toMatchObject({
      commandType: "cancel",
      jobId: job.id,
      attempt: job.attempt,
      tenantId: job.tenantId,
      fencingToken: job.fencingVersion,
      payload: {
        cancellationOperationId: first.operationId,
        targetCommandId: "execute-command-1",
      },
    });
  });

  it("fails closed on tenant or stale-fence mismatch", () => {
    expect(() =>
      buildRunnerCancellationCommand({
        job,
        operationKey: "operation-1",
        template: { ...template(), tenantId: "tenant-other" },
      })
    ).toThrow("RUNNER_CANCEL_EXECUTE_BINDING_MISMATCH");
    expect(() =>
      buildRunnerCancellationCommand({
        job,
        operationKey: "operation-1",
        template: { ...template(), fenceVersion: 6 },
      })
    ).toThrow("RUNNER_CANCEL_FENCE_STALE");
  });
});
