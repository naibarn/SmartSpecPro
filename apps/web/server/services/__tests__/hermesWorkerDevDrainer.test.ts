/**
 * Feature 135 — Hermes Grok media worker (section 07): `hermesWorkerDevDrainer.ts`
 * unit tests. Fully injected repo/flag/handle — no real DB/network/Hermes.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createDirectDbControlPlaneClient,
  runHermesWorkerDevDrainerTick,
  type HermesDevDrainerRepo,
} from "../hermesWorkerDevDrainer";
import { HERMES_MEDIA_IMAGE_JOB_TYPE } from "../../../shared/workerRuntime";
import type { WorkerJob } from "../../../drizzle/schema";

function fakeRow(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    tenantId: "tenant-1",
    teamId: null,
    workerId: null,
    runtimeType: "hermes_agent_gateway",
    workflowRunId: null,
    requestedByUserId: 1,
    requestedByPersonaId: null,
    requestedBySystemComponent: null,
    jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
    status: "queued",
    statusReason: null,
    priority: 0,
    resourceProfile: "cpu_light",
    capabilityRequirementsJson: {},
    inputJson: { operation: "image.generate", references: [] },
    instructionsJson: {},
    timeoutSeconds: 600,
    retryPolicyJson: null,
    idempotencyKey: null,
    leaseOwnerToken: "lease-x",
    leaseExpiresAt: null,
    startedAt: null,
    finishedAt: null,
    outputJson: {},
    failureReason: null,
    createdAt: new Date(),
    ...overrides,
  } as unknown as WorkerJob;
}

describe("runHermesWorkerDevDrainerTick", () => {
  it("does nothing when the flag is OFF", async () => {
    const claimNextJob = vi.fn(async () => fakeRow());
    const handle = vi.fn(async () => {});
    const repo: HermesDevDrainerRepo = {
      claimNextJob,
      insertJobEvent: vi.fn(async () => {}),
      updateJobTerminal: vi.fn(async () => {}),
      insertArtifact: vi.fn(async () => {}),
      mintReferenceUrls: vi.fn(async () => []),
    };

    await runHermesWorkerDevDrainerTick({ repo, getEnabled: async () => false, handle });

    expect(claimNextJob).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("claims a job and delegates to the handler when the flag is ON", async () => {
    const row = fakeRow();
    const claimNextJob = vi.fn(async () => row);
    const handle = vi.fn(async () => {});
    const repo: HermesDevDrainerRepo = {
      claimNextJob,
      insertJobEvent: vi.fn(async () => {}),
      updateJobTerminal: vi.fn(async () => {}),
      insertArtifact: vi.fn(async () => {}),
      mintReferenceUrls: vi.fn(async () => []),
    };

    await runHermesWorkerDevDrainerTick({ repo, getEnabled: async () => true, handle });

    expect(claimNextJob).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][0]).toMatchObject({ id: "job-1", jobType: HERMES_MEDIA_IMAGE_JOB_TYPE });
  });

  it("is a no-op when nothing is queued", async () => {
    const claimNextJob = vi.fn(async () => null);
    const handle = vi.fn(async () => {});
    const repo: HermesDevDrainerRepo = {
      claimNextJob,
      insertJobEvent: vi.fn(async () => {}),
      updateJobTerminal: vi.fn(async () => {}),
      insertArtifact: vi.fn(async () => {}),
      mintReferenceUrls: vi.fn(async () => []),
    };

    await runHermesWorkerDevDrainerTick({ repo, getEnabled: async () => true, handle });
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("createDirectDbControlPlaneClient", () => {
  it("transitions the job to completed/failed only on the matching postEvent eventType", async () => {
    const updateJobTerminal = vi.fn(async () => {});
    const insertJobEvent = vi.fn(async () => {});
    const repo: HermesDevDrainerRepo = {
      claimNextJob: vi.fn(async () => null),
      insertJobEvent,
      updateJobTerminal,
      insertArtifact: vi.fn(async () => {}),
      mintReferenceUrls: vi.fn(async () => []),
    };
    const client = createDirectDbControlPlaneClient(repo);

    await client.postEvent("job-1", { eventType: "generating", payloadJson: {}, leaseOwnerToken: "lease" });
    expect(updateJobTerminal).not.toHaveBeenCalled();

    await client.postEvent("job-1", { eventType: "job.completed", payloadJson: {}, leaseOwnerToken: "lease" });
    expect(updateJobTerminal).toHaveBeenCalledWith("job-1", "completed");

    await client.postEvent("job-1", { eventType: "job.failed", payloadJson: { failureReason: "boom" }, leaseOwnerToken: "lease" });
    expect(updateJobTerminal).toHaveBeenCalledWith("job-1", "failed", "boom");

    expect(insertJobEvent).toHaveBeenCalledTimes(3);
  });
});
