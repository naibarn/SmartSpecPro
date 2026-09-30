import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import type { JobExecutorContext } from "../jobExecutor";
import {
  configureExternalAgentTaskDispatcher,
  resetExternalAgentTaskDispatcherForTests,
} from "../externalAgentTaskExecutor";
import {
  resetSpec224AdmissionSnapshotLoaderForTests,
  setSpec224AdmissionSnapshotLoaderForTests,
} from "../spec224RuntimeAdmission";

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
  requiresSpec224Admission: false,
  spec224AdmissionBindingValid: false,
  workerJobFencingVersion: 0,
  statusReason: null,
} satisfies JobExecutorContext;

describe("Feature 206 external agent executor registration", () => {
  afterEach(() => {
    resetExternalAgentTaskDispatcherForTests();
    resetSpec224AdmissionSnapshotLoaderForTests();
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
        lease: {
          jobId: context.jobId,
          fencingVersion: context.workerJobFencingVersion,
        } as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "JOB_EXECUTOR_UNREGISTERED" });
  });

  it("does not allow a configured dispatcher to cross tenant or actor identity", async () => {
    const dispatcher = vi
      .fn()
      .mockResolvedValue({ output: { accepted: true } });
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
        lease: {
          jobId: context.jobId,
          fencingVersion: context.workerJobFencingVersion,
        } as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "JOB_CONTEXT_INVALID" });
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("fails closed for a DevelopmentRun even when caller input contains a forged grant reference", async () => {
    const dispatcher = vi
      .fn()
      .mockResolvedValue({ output: { accepted: true } });
    configureExternalAgentTaskDispatcher(dispatcher);
    setSpec224AdmissionSnapshotLoaderForTests(async () => ({
      tenantId: "tenant-1",
      tenantOwnerId: 7,
      workerJobId: "job-1",
      jobStatus: "running",
      jobStatusReason: null,
      actorId: 7,
      attempt: 1,
      currentAttemptId: "attempt-1",
      workerJobFencingVersion: 0,
      leaseValid: true,
      lease: { jobId: "job-1", attemptId: "attempt-1", fencingVersion: 0 },
      run: {
        runId: "run-1",
        tenantId: "tenant-1",
        workerJobId: "job-1",
        actorId: 7,
        workPackageId: "WP-REQ-01",
        attempt: 1,
        revision: 2,
        developmentRunFencingVersion: 1,
      },
      grantBinding: null,
      runnerBindingValid: false,
      attestation: {
        schemaVersion: "spec224.trusted-source-attestation.v1",
        attestationId: "a".repeat(64),
        trustClass: "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        trustLevel: "REMOTE_TEST_TRUSTED",
        status: "ACTIVE",
        actorId: 7,
        tenantId: "tenant-1",
        runId: "run-1",
        workerJobId: "job-1",
        workPackageId: "WP-REQ-01",
        attempt: 1,
        projectionRevision: 2,
        workerJobFencingVersion: 0,
        developmentRunFencingVersion: 1,
      },
    }));
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );

    await expect(
      registration!.executor({
        context: {
          ...context,
          input: {
            ...context.input,
            spec224RecoveryGrant: {
              grantId: "caller-controlled-grant",
              sourceSha256: "f".repeat(64),
              runtimeBinding: {
                tenantId: context.tenantId,
                workerJobId: context.jobId,
              },
            },
          },
          requiresSpec224Admission: true,
          spec224AdmissionBindingValid: true,
        },
        lease: {
          jobId: context.jobId,
          fencingVersion: context.workerJobFencingVersion,
        } as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "DENIED_NO_GRANT" });
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("passes only the validated manifest to the configured dispatcher", async () => {
    const dispatcher = vi
      .fn()
      .mockResolvedValue({ output: { accepted: true } });
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

  it("does not infer a protected run from a generic input field collision", async () => {
    const dispatcher = vi
      .fn()
      .mockResolvedValue({ output: { accepted: true } });
    configureExternalAgentTaskDispatcher(dispatcher);
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );
    await expect(
      registration!.executor({
        context: {
          ...context,
          input: {
            ...context.input,
            spec224Run: { note: "unrelated caller data" },
          },
        },
        lease: {} as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).resolves.toEqual({ output: { accepted: true } });
    expect(dispatcher).toHaveBeenCalledOnce();
  });

  it("rejects a protected run when the actual lease fence differs from the canonical job fence", async () => {
    const dispatcher = vi
      .fn()
      .mockResolvedValue({ output: { accepted: true } });
    configureExternalAgentTaskDispatcher(dispatcher);
    const registration = defaultJobExecutorRegistry.resolve(
      "external_agent_task",
      "feature-186-v1"
    );
    await expect(
      registration!.executor({
        context: {
          ...context,
          requiresSpec224Admission: true,
          spec224AdmissionBindingValid: true,
        },
        lease: {
          jobId: context.jobId,
          fencingVersion: context.workerJobFencingVersion + 1,
        } as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "SPEC224_RUNTIME_BINDING_STALE" });
    expect(dispatcher).not.toHaveBeenCalled();
  });
});
