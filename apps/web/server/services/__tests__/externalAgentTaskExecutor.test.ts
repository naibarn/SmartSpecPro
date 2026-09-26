import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import type { JobExecutorContext } from "../jobExecutor";
import {
  configureExternalAgentTaskDispatcher,
  resetExternalAgentTaskDispatcherForTests,
} from "../externalAgentTaskExecutor";

const context = {
  jobId: "job-1",
  tenantId: "tenant-1",
  requestedByUserId: 7,
  jobType: "external_agent_task",
  executionClass: "external",
  contractVersion: "feature-186-v1",
  input: {
    manifest: {
      taskId: "task-1",
      tenantId: "tenant-1",
      actorId: 7,
      goalId: "goal-1",
      planId: "plan-1",
      planRevision: 1,
      provider: "codex",
      runtime: "local_runner",
      workspaceId: "workspace-1",
      contextPackageIds: [],
      skillIds: [],
      mcpGrantIds: [],
      requestedCapabilities: ["code.edit"],
    },
  },
  instructions: {},
  requiredCapabilities: {},
  attempt: 1,
  maxAttempts: 1,
  timeoutSeconds: 60,
  timeoutPolicy: { softTimeoutMs: 1_000, hardTimeoutMs: 60_000 },
  statusReason: null,
} satisfies JobExecutorContext;

describe("Feature 206 external agent executor registration", () => {
  afterEach(() => {
    resetExternalAgentTaskDispatcherForTests();
  });

  it("registers one canonical external_agent_task entry", () => {
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );

    expect(registration).toMatchObject({
      jobType: "external_agent_task",
      executionClass: "external",
    });
  });

  it("fails closed until an approved transport dispatcher is configured", async () => {
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );
    expect(registration).toBeDefined();

    await expect(
      registration!.executor({
        context,
        lease: {} as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "JOB_EXECUTOR_UNREGISTERED" });
  });

  it("does not allow a configured dispatcher to cross tenant or actor identity", async () => {
    const dispatcher = vi.fn().mockResolvedValue({ output: { accepted: true } });
    configureExternalAgentTaskDispatcher(dispatcher);
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );
    expect(registration).toBeDefined();

    await expect(
      registration!.executor({
        context: {
          ...context,
          tenantId: "different-tenant",
        },
        lease: {} as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "JOB_CONTEXT_INVALID" });
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("passes only the validated manifest to the configured dispatcher", async () => {
    const dispatcher = vi.fn().mockResolvedValue({ output: { accepted: true } });
    configureExternalAgentTaskDispatcher(dispatcher);
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );
    await expect(
      registration!.executor({
        context,
        lease: {} as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).resolves.toEqual({ output: { accepted: true } });
    expect(dispatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          tenantId: "tenant-1",
          actorId: 7,
        }),
      })
    );
  });
});
