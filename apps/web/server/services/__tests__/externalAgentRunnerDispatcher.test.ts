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

  it("creates an idempotent dark session projection before persisting external wait metadata", async () => {
    const state = input();
    const dispatch = vi.fn().mockResolvedValue({
      status: "accepted",
      commandId: "command-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    const createSessionProjection = vi
      .fn()
      .mockResolvedValue({ sessionId: "s278_projection_1" });
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch,
      createSessionProjection: createSessionProjection as any,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "command-1",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await dispatcher(state as any);

    expect(createSessionProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        workerJobId: "job-1",
        workerJobAttempt: 1,
        leaseFencingVersion: 2,
        runnerId: "runner-1",
        generation: 1,
        state: "starting",
        desiredState: "starting",
        continuityClass: "ephemeral",
        enforcementLevel: "COMMAND_ONLY",
        driverId: "codex.v1",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^spec278:create:s278_/),
        eventType: "projection_created",
      })
    );
    expect(state.waitForExternal).toHaveBeenCalledWith(
      state.lease,
      expect.objectContaining({
        metadata: expect.objectContaining({
          executionSessionId: "s278_projection_1",
          commandTemplate: expect.objectContaining({
            executionSession: expect.objectContaining({
              sessionId: "s278_projection_1",
              workerJobId: "job-1",
              workerJobAttempt: 1,
              leaseFencingVersion: 2,
              state: "starting",
            }),
          }),
        }),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          executionSession: expect.objectContaining({
            sessionId: "s278_projection_1",
            continuityClass: "ephemeral",
            enforcementLevel: "COMMAND_ONLY",
          }),
        }),
      })
    );
  });

  it("marks the shadow projection unknown when canonical external-wait persistence fails", async () => {
    const state = input();
    state.waitForExternal.mockRejectedValue(new Error("job store unavailable"));
    const createSessionProjection = vi
      .fn()
      .mockResolvedValue({ sessionId: "s278_projection_2" });
    const transitionSessionProjection = vi.fn().mockResolvedValue({});
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch: vi.fn(),
      createSessionProjection: createSessionProjection as any,
      transitionSessionProjection: transitionSessionProjection as any,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "command-2",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await expect(dispatcher(state as any)).rejects.toThrow(
      "job store unavailable"
    );
    expect(transitionSessionProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s278_projection_2",
        expectedRevision: 1,
        nextState: "unknown",
        event: expect.objectContaining({
          eventType: "external_wait_outcome_unknown",
        }),
      })
    );
  });

  it("marks an ambiguous dispatch outcome unknown while retaining the canonical wait", async () => {
    const state = input();
    const createSessionProjection = vi
      .fn()
      .mockResolvedValue({ sessionId: "s278_projection_3" });
    const transitionSessionProjection = vi.fn().mockResolvedValue({});
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch: vi.fn().mockRejectedValue(new Error("ack timeout")),
      createSessionProjection: createSessionProjection as any,
      transitionSessionProjection: transitionSessionProjection as any,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "command-3",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await expect(dispatcher(state as any)).resolves.toMatchObject({
      deferred: true,
      output: { commandId: "command-3", status: "dispatch_failed" },
    });
    expect(state.failExternalWait).toHaveBeenCalledOnce();
    expect(transitionSessionProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s278_projection_3",
        expectedRevision: 1,
        nextState: "unknown",
        event: expect.objectContaining({
          eventType: "dispatch_outcome_unknown",
        }),
      })
    );
    expect(
      transitionSessionProjection.mock.invocationCallOrder[0]
    ).toBeLessThan(state.failExternalWait.mock.invocationCallOrder[0]);
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

  it("uses the persisted protected-start command identity instead of minting a new command", async () => {
    const state = input();
    const dispatch = vi.fn().mockResolvedValue({
      status: "accepted",
      commandId: "authorized-command",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "should-not-be-used",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await dispatcher({
      ...state,
      protectedExecutionStart: {
        outcome: "STARTED",
        operationId: "a".repeat(64),
        eventIdempotencyKey: `spec224:protected-start:${"a".repeat(64)}`,
        authorizedCommandId: "authorized-command",
        eventSequence: 9,
      },
    } as any);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "authorized-command",
        idempotencyKey: `spec224:protected-start:${"a".repeat(64)}`,
      })
    );
    expect(state.waitForExternal).toHaveBeenCalledWith(
      state.lease,
      expect.objectContaining({
        providerReference: "runner-command:authorized-command",
      })
    );
  });

  it("dispatches staged Spec 224 input together with its immutable local-candidate policy", async () => {
    const state = input();
    const dispatch = vi.fn().mockResolvedValue({
      status: "accepted",
      commandId: "command-input-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    const bindStagedInput = vi.fn().mockResolvedValue({
      inputRef: "spec224-input:bound",
      inputFetchGrant: "g".repeat(48),
      inputDigest: "d".repeat(64),
      totalBytes: 42,
    });
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch,
      bindStagedInput,
      commandId: () => "command-input-1",
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      controlPlaneOrigin: "http://localhost:3000",
    });

    await dispatcher({
      ...state,
      manifest: {
        ...manifest,
        spec224Input: {
          inputSourceRef: "spec224-source:1",
          inputDigest: "d".repeat(64),
          totalBytes: 42,
        },
        spec224Execution: {
          sourceFingerprint: "f".repeat(64),
          mode: "work_package",
          allowedWriteSet: ["apps/web/server/auth.ts"],
        },
      },
    } as any);
    expect(bindStagedInput).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        inputRef: "spec224-input:bound",
        payload: expect.objectContaining({
          spec224Execution: {
            sourceFingerprint: "f".repeat(64),
            mode: "work_package",
            allowedWriteSet: ["apps/web/server/auth.ts"],
          },
        }),
      }),
      expect.objectContaining({ spec224InputFetchGrant: "g".repeat(48) })
    );
    expect(state.waitForExternal).toHaveBeenCalledOnce();
  });

  it("keeps canonical Runner dispatch available when the shadow projection store fails", async () => {
    const state = input();
    const dispatch = vi.fn().mockResolvedValue({
      status: "accepted",
      commandId: "command-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    const dispatcher = createExternalAgentTaskDispatcher({
      dispatch,
      createSessionProjection: vi
        .fn()
        .mockRejectedValue(new Error("RUNNER_SESSION_STORE_UNAVAILABLE")) as any,
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      commandId: () => "command-1",
      controlPlaneOrigin: "http://localhost:3000",
    });

    await expect(dispatcher(state as any)).resolves.toMatchObject({
      deferred: true,
      output: { commandId: "command-1", status: "accepted" },
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(state.waitForExternal).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].payload).not.toHaveProperty(
      "executionSession"
    );
  });
});
