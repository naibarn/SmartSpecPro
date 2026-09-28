import { describe, expect, it, vi } from "vitest";

import { createExternalAgentTaskDispatcher } from "../externalAgentRunnerDispatcher";
import type { AgentTaskManifest } from "../agentControlPlaneContracts";

const manifest: AgentTaskManifest = {
  taskId: "task-runner-1",
  tenantId: "tenant-1",
  actorId: 7,
  goalId: "goal-1",
  planId: "plan-1",
  planRevision: 1,
  provider: "codex",
  runtime: "local_runner",
  workspaceId: "workspace-1",
  contextPackageIds: ["context-1"],
  skillIds: [],
  mcpGrantIds: [],
  requestedCapabilities: ["code.edit"],
  policyBinding: {
    runnerId: "runner-1",
    runnerSessionId: "session-1",
    capabilitySnapshotId: "capability-1",
    capabilitySnapshotRevision: "revision-1",
    authorizationGrantRef: "grant:1",
    approvalRef: "approval:1",
    budgetReservationRef: "budget:1",
    spendCeilingMicros: 100_000,
    workspaceRef: "workspace-1",
    deadline: "2099-01-01T00:00:00.000Z",
  },
};

function input() {
  const waitForExternal = vi.fn().mockResolvedValue(undefined);
  const assertActive = vi.fn().mockResolvedValue(undefined);
  const failExternalWait = vi.fn().mockResolvedValue("failed");
  return {
    manifest,
    context: {
      jobId: "job-1",
      tenantId: "tenant-1",
      requestedByUserId: 7,
      attempt: 1,
    } as any,
    lease: {
      jobId: "job-1",
      attemptId: "attempt-1",
      leaseToken: "lease-token",
      fencingVersion: 2,
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
    reporter: { waitForExternal, assertActive } as any,
    controlPlane: { failExternalWait } as any,
    waitForExternal,
    assertActive,
    failExternalWait,
  };
}

describe("Feature 195 external-agent Runner dispatcher", () => {
  it("waits on the canonical job and dispatches a fenced provider-neutral command", async () => {
    const state = input();
    const dispatch = vi.fn().mockResolvedValue({
      status: "accepted",
      commandId: "command-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "command-1",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await expect(dispatcher(state as any)).resolves.toMatchObject({
      deferred: true,
      output: { commandId: "command-1", status: "accepted" },
    });
    expect(state.assertActive).toHaveBeenCalledOnce();
    expect(state.waitForExternal).toHaveBeenCalledWith(
      state.lease,
      expect.objectContaining({
        operationKey: "external-agent:task-runner-1:plan-1:1",
        providerReference: "runner-command:command-1",
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        executionKind: "external_agent_task",
        adapterId: "codex.v1",
        runnerId: "runner-1",
        workspaceRef: "workspace-1",
        fencingToken: 2,
        payload: expect.objectContaining({
          approvalRef: "approval:1",
          budgetReservationRef: "budget:1",
        }),
      })
    );
  });

  it("fails closed when the manifest has no immutable policy binding", async () => {
    const state = input();
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch: vi.fn(),
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      controlPlaneOrigin: "http://localhost:3000",
    });
    await expect(
      dispatcher({
        ...state,
        manifest: { ...manifest, policyBinding: undefined },
      } as any)
    ).rejects.toThrow("AGENT_POLICY_BINDING_REQUIRED");
  });
});
