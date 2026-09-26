import { describe, expect, it } from "vitest";

import {
  assertRunnerExecutionEligibility,
  acceptRunnerJobReceipt,
  shouldDeferRunnerExecutionCompletion,
  validateRunnerJobCommand,
  type RunnerJobCommand,
  type RunnerJobReceipt,
} from "../runnerJobCommandContracts";

const command = (): RunnerJobCommand => ({
  commandId: "command-p213-1",
  commandType: "execute",
  contractVersion: "runner-job-v1",
  jobId: "job-p213-1",
  attempt: 1,
  leaseId: "lease:job-p213-1:attempt-1",
  fencingToken: 3,
  tenantId: "tenant-p213",
  userId: 109,
  projectRef: "project:p213",
  workspaceRef: "workspace:p213",
  runnerId: "runner-p213",
  runnerSessionId: "session-p213",
  capabilitySnapshotId: "capability:p213:1",
  capabilitySnapshotRevision: "snapshot:p213:1",
  controlPlaneOrigin: "http://localhost:3000",
  executionKind: "computer_use.browser",
  adapterId: "browser.v1",
  adapterVersionConstraint: "0.1.0",
  browserEngineConstraint: "chromium",
  idempotencyKey: "computer-use:job-p213-1:1",
  deadline: "2099-01-01T00:00:00.000Z",
  authorizationGrantRef: "runner-auth:sha256:grant",
  inputRef: "runner-input:sha256:input",
  payload: {
    operation: "observe_and_click",
    fixtureUrl: "https://smartaihub.app/healthz",
    target: { role: "link", name: "health" },
  },
});

const receipt = (
  kind: RunnerJobReceipt["eventType"],
  sequence: number
): RunnerJobReceipt => ({
  eventId: `event-p213-${sequence}`,
  eventType: kind,
  commandId: "command-p213-1",
  jobId: "job-p213-1",
  runnerId: "runner-p213",
  runnerSessionId: "session-p213",
  sequence,
  observedAt: "2026-09-20T16:00:00.000Z",
  status: kind === "EXECUTION_COMPLETED" ? "completed" : "accepted",
  resultRef: kind === "EXECUTION_COMPLETED" ? "result:sha256:done" : undefined,
  evidenceRefs:
    kind === "EVIDENCE_CREATED" ? ["evidence:sha256:one"] : undefined,
});

describe("Runner Job Command/Receipt contract", () => {
  it("validates the generic fenced browser command without accepting reusable secrets", () => {
    expect(validateRunnerJobCommand(command())).toMatchObject({
      commandId: "command-p213-1",
      executionKind: "computer_use.browser",
      adapterId: "browser.v1",
    });
    expect(() =>
      validateRunnerJobCommand({ ...command(), payload: { token: "secret" } })
    ).toThrow("RUNNER_COMMAND_SECRET_FIELD");
  });

  it("accepts a policy-bound external-agent command without weakening browser validation", () => {
    const external = {
      ...command(),
      executionKind: "external_agent_task",
      adapterId: "codex.v1",
      idempotencyKey: "agent:task-p213:plan:plan-p213:1",
      payload: {
        taskId: "task-p213",
        planId: "plan-p213",
        planRevision: 1,
        workspaceId: "workspace:p213",
        capability: "code.edit",
      },
    };
    expect(validateRunnerJobCommand(external)).toMatchObject({
      executionKind: "external_agent_task",
      adapterId: "codex.v1",
    });
    expect(() =>
      validateRunnerJobCommand({
        ...external,
        adapterId: "browser.v1",
      })
    ).toThrow("RUNNER_COMMAND_ADAPTER_UNSUPPORTED");
  });

  it("requires an advertised external-agent capability before dispatch", () => {
    const external = {
      ...command(),
      executionKind: "external_agent_task",
      adapterId: "codex.v1",
    };
    expect(() =>
      assertRunnerExecutionEligibility({
        command: external,
        runner: {
          runnerId: "runner-p213",
          tenantId: "tenant-p213",
          trustState: "trusted",
          status: "online",
          activeSessionId: "session-p213",
          revokedAt: null,
        },
        capability: {
          runnerSessionId: "session-p213",
          tenantId: "tenant-p213",
          capabilitySnapshotId: "capability:p213:1",
          revision: "snapshot:p213:1",
          controlPlaneOrigin: "http://localhost:3000",
          observedAt: "2026-09-20T15:55:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          browserReady: false,
          authorizationEvidenceRef: "runner-auth:sha256:grant",
        },
        now: new Date("2026-09-20T16:00:00.000Z"),
      })
    ).toThrow("RUNNER_EXTERNAL_AGENT_NOT_READY");

    expect(() =>
      assertRunnerExecutionEligibility({
        command: external,
        runner: {
          runnerId: "runner-p213",
          tenantId: "tenant-p213",
          trustState: "trusted",
          status: "online",
          activeSessionId: "session-p213",
          revokedAt: null,
        },
        capability: {
          runnerSessionId: "session-p213",
          tenantId: "tenant-p213",
          capabilitySnapshotId: "capability:p213:1",
          revision: "snapshot:p213:1",
          controlPlaneOrigin: "http://localhost:3000",
          observedAt: "2026-09-20T15:55:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          browserReady: false,
          externalAgentAdapters: ["codex.v1"],
          authorizationEvidenceRef: "runner-auth:sha256:grant",
        },
        now: new Date("2026-09-20T16:00:00.000Z"),
      })
    ).not.toThrow();
  });

  it("requires the current runner/session/tenant/fresh capability and authorization grant", () => {
    expect(() =>
      assertRunnerExecutionEligibility({
        command: command(),
        runner: {
          runnerId: "runner-p213",
          tenantId: "tenant-p213",
          trustState: "trusted",
          status: "online",
          activeSessionId: "session-p213",
          revokedAt: null,
        },
        capability: {
          runnerSessionId: "session-p213",
          tenantId: "tenant-p213",
          capabilitySnapshotId: "capability:p213:1",
          revision: "snapshot:p213:1",
          controlPlaneOrigin: "http://localhost:3000",
          observedAt: "2026-09-20T15:55:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          browserReady: true,
          authorizationEvidenceRef: "runner-auth:sha256:grant",
        },
        now: new Date("2026-09-20T16:00:00.000Z"),
      })
    ).not.toThrow();

    expect(() =>
      assertRunnerExecutionEligibility({
        command: command(),
        runner: {
          runnerId: "runner-p213",
          tenantId: "tenant-p213",
          trustState: "trusted",
          status: "online",
          activeSessionId: "old-session",
          revokedAt: null,
        },
        capability: {
          runnerSessionId: "session-p213",
          tenantId: "tenant-p213",
          capabilitySnapshotId: "capability:p213:1",
          revision: "snapshot:p213:1",
          controlPlaneOrigin: "http://localhost:3000",
          observedAt: "2026-09-20T15:55:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          browserReady: true,
          authorizationEvidenceRef: "runner-auth:sha256:grant",
        },
        now: new Date("2026-09-20T16:00:00.000Z"),
      })
    ).toThrow("RUNNER_SESSION_STALE");
  });

  it("fails closed when the command has no valid control-plane origin", () => {
    expect(() =>
      validateRunnerJobCommand({
        ...command(),
        controlPlaneOrigin: undefined as unknown as string,
      })
    ).toThrow("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
    expect(() =>
      validateRunnerJobCommand({
        ...command(),
        controlPlaneOrigin: "https://localhost:3000/api/internal",
      })
    ).toThrow("RUNNER_CONTROL_PLANE_ORIGIN_INVALID");
  });

  it("rejects a capability snapshot from a different control plane", () => {
    expect(() =>
      assertRunnerExecutionEligibility({
        command: command(),
        runner: {
          runnerId: "runner-p213",
          tenantId: "tenant-p213",
          trustState: "trusted",
          status: "online",
          activeSessionId: "session-p213",
          revokedAt: null,
        },
        capability: {
          runnerSessionId: "session-p213",
          tenantId: "tenant-p213",
          capabilitySnapshotId: "capability:p213:1",
          revision: "snapshot:p213:1",
          controlPlaneOrigin: "https://smartaihub.app",
          observedAt: "2026-09-20T15:55:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          browserReady: true,
          authorizationEvidenceRef: "runner-auth:sha256:grant",
        },
        now: new Date("2026-09-20T16:00:00.000Z"),
      })
    ).toThrow("RUNNER_CONTROL_PLANE_MISMATCH");
  });

  it("accepts receipts in order, deduplicates exact replay, and rejects late/out-of-order receipts", () => {
    const state = { lastSequence: 0, terminal: false };
    expect(
      acceptRunnerJobReceipt(state, receipt("COMMAND_ACCEPTED", 1))
    ).toEqual("accepted");
    expect(
      acceptRunnerJobReceipt(state, receipt("COMMAND_ACCEPTED", 1))
    ).toEqual("duplicate");
    expect(
      acceptRunnerJobReceipt(state, receipt("COMMAND_RECEIVED", 0))
    ).toEqual("out_of_order");
    state.terminal = true;
    expect(acceptRunnerJobReceipt(state, receipt("PROGRESS", 2))).toEqual(
      "late"
    );
  });

  it("keeps semantic Computer Use completion pending until an independent verifier settles it", () => {
    expect(
      shouldDeferRunnerExecutionCompletion(receipt("EXECUTION_COMPLETED", 2))
    ).toBe(false);
    expect(
      shouldDeferRunnerExecutionCompletion({
        ...receipt("EXECUTION_COMPLETED", 2),
        payload: { requiresIndependentVerification: true },
      })
    ).toBe(true);
    expect(
      shouldDeferRunnerExecutionCompletion({
        ...receipt("EXECUTION_COMPLETED", 2),
        payload: { requiresIndependentVerification: "true" },
      })
    ).toBe(false);
  });
});
