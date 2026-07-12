import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-worker-registry-service";

  return {
    mockGetDb: vi.fn(),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

/**
 * Drives the private `assertRuntimeSpecificJobEventContract` (workerRegistryService.ts)
 * through the exported `recordWorkerJobEvent` seam, mirroring the existing
 * comfy and hyperframes test pattern in `workerRegistryService.test.ts`.
 */
describe("assertRuntimeSpecificJobEventContract — remotion_render_video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildRepo(jobOverrides: Record<string, unknown> = {}) {
    const baseJob = {
      id: "job-remotion-1",
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "desktop_zeroclaw_managed",
      jobType: "remotion_render_video",
      status: "running",
      leaseOwnerToken: "lease-1",
      leaseExpiresAt: new Date("2030-04-06T00:05:00.000Z"),
      ...jobOverrides,
    };

    return {
      job: baseJob,
      repo: {
        getJobById: vi.fn().mockResolvedValue(baseJob),
        listJobEvents: vi.fn().mockResolvedValue([]),
        insertJobEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
        updateJob: vi.fn().mockImplementation(async (_jobId, values) => ({
          ...baseJob,
          ...values,
        })),
      },
    };
  }

  function auth() {
    return {
      tenantId: "tenant-1",
      workerId: "worker-1",
      runtimeType: "desktop_zeroclaw_managed",
    } as any;
  }

  it("accepts a progress event whose stage ∈ REMOTION_RENDER_VIDEO_PROGRESS_STAGES", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");
    const { repo } = buildRepo();

    const result = await recordWorkerJobEvent({
      auth: auth(),
      jobId: "job-remotion-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          stage: "render_frames",
          percent: 42,
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      } as any,
    }, { repo } as any);

    expect(result.accepted).toBe(true);
    expect(repo.insertJobEvent).toHaveBeenCalledWith(
      "job-remotion-1",
      "job.progress",
      expect.objectContaining({ sequenceNumber: 1 }),
    );
  });

  it("rejects an off-contract stage", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");
    const { repo } = buildRepo();

    await expect(recordWorkerJobEvent({
      auth: auth(),
      jobId: "job-remotion-1",
      payload: {
        eventType: "job.progress",
        payloadJson: {
          stage: "invent_new_stage",
          percent: 10,
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      } as any,
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });

  it("accepts a failure event whose code ∈ REMOTION_RENDER_VIDEO_FAILURE_CODES", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");
    const { repo } = buildRepo();

    const result = await recordWorkerJobEvent({
      auth: auth(),
      jobId: "job-remotion-1",
      payload: {
        eventType: "job.failed",
        payloadJson: {
          failureCode: "render_failed",
          message: "Chromium render crashed",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      } as any,
    }, { repo } as any);

    expect(result.accepted).toBe(true);
    expect(repo.updateJob).toHaveBeenCalledWith(
      "job-remotion-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("rejects a blanket/unknown failure code", async () => {
    const { recordWorkerJobEvent } = await import("../workerRegistryService");
    const { repo } = buildRepo();

    await expect(recordWorkerJobEvent({
      auth: auth(),
      jobId: "job-remotion-1",
      payload: {
        eventType: "job.failed",
        payloadJson: {
          failureCode: "invent_new_failure",
        },
        sequenceNumber: 1,
        leaseOwnerToken: "lease-1",
      } as any,
    }, { repo } as any)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400,
    });
  });
});
