/**
 * workerJobs.list — `jobType` filter coverage (spec 143 §5 R1).
 *
 * `/render-jobs` could only filter by status, not by `jobType`, so a user
 * could not isolate their Remotion renders from other worker job types.
 * The predicate is forwarded to `listUserWorkerJobs`, which applies it in the
 * tenant/requester-scoped repository query so old jobs are not lost after an
 * arbitrary in-memory scan limit.
 *
 * Same "mock the whole module graph, call the exported procedure handler
 * directly" convention as `media.listTasks.seriesFilter.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListUserWorkerJobs = vi.fn();

vi.mock("../../services/workerJobMonitorService", () => ({
  USER_WORKER_JOB_STATUSES: [
    "queued",
    "claimed",
    "preparing",
    "running",
    "uploading",
    "publishing",
    "indexing",
    "completed",
    "failed",
    "canceled",
    "expired",
  ],
  listUserWorkerJobs: (...args: unknown[]) => mockListUserWorkerJobs(...args),
  getUserWorkerJobDetail: vi.fn(),
  cancelQueuedUserWorkerJob: vi.fn(),
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

import { workerJobsRouter } from "../workerJobs";

const CTX = { tenantId: "tenant-1", user: { id: 9 } };

function job(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "job-1",
    jobType: overrides.jobType ?? "remotion_render_video",
    status: overrides.status ?? "completed",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workerJobsRouter.list — jobType absent (backward compatible)", () => {
  it("does not page-scan and delegates straight to listUserWorkerJobs", async () => {
    mockListUserWorkerJobs.mockResolvedValue({ items: [job()] });

    const fn = workerJobsRouter.list as unknown as Function;
    const result = await fn({ ctx: CTX, input: { status: "completed", limit: 50, offset: 0 } });

    expect(mockListUserWorkerJobs).toHaveBeenCalledTimes(1);
    expect(mockListUserWorkerJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 9 },
      status: "completed",
      limit: 50,
      offset: 0,
    });
    expect(result.items).toHaveLength(1);
  });
});

describe("workerJobsRouter.list — jobType filter", () => {
  it("forwards the requested jobType to the scoped service query", async () => {
    mockListUserWorkerJobs.mockResolvedValueOnce({
      items: [
        job({ id: "a", jobType: "remotion_render_video" }),
        job({ id: "b", jobType: "hermes_media_image_generate" }),
        job({ id: "c", jobType: "remotion_render_video" }),
      ],
    });

    const fn = workerJobsRouter.list as unknown as Function;
    const result = await fn({
      ctx: CTX,
      input: { jobType: "remotion_render_video", limit: 50, offset: 0 },
    });

    expect(mockListUserWorkerJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 9 },
      jobType: "remotion_render_video",
      limit: 50,
      offset: 0,
    });
    expect(result.items.map((j: any) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("passes status through alongside jobType", async () => {
    mockListUserWorkerJobs.mockResolvedValueOnce({ items: [] });

    const fn = workerJobsRouter.list as unknown as Function;
    await fn({
      ctx: CTX,
      input: { status: "failed", jobType: "remotion_render_video", limit: 50, offset: 0 },
    });

    expect(mockListUserWorkerJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        jobType: "remotion_render_video",
        limit: 50,
        offset: 0,
      }),
    );
  });

  it("applies offset within the filtered (not raw) result set", async () => {
    mockListUserWorkerJobs.mockResolvedValueOnce({
      // The service/repository owns filtered pagination; the router must
      // return the already-paginated window without applying a second slice.
      items: [job({ id: "b", jobType: "remotion_render_video" })],
    });

    const fn = workerJobsRouter.list as unknown as Function;
    const result = await fn({
      ctx: CTX,
      input: { jobType: "remotion_render_video", limit: 1, offset: 1 },
    });

    expect(mockListUserWorkerJobs).toHaveBeenCalledWith({
      auth: { tenantId: "tenant-1", userId: 9 },
      jobType: "remotion_render_video",
      limit: 1,
      offset: 1,
    });
    expect(result.items.map((j: any) => j.id)).toEqual(["b"]);
  });
});
