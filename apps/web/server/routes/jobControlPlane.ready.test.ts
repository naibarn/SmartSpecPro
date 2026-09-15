import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDb, mockCompareToken } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockGetDb: vi.fn(),
  mockCompareToken: vi.fn(),
}));

vi.mock("../db", () => ({ db: mockDb, getDb: mockGetDb }));
vi.mock("../services/appRuntimeConfig", () => ({ compareCachedInternalToken: mockCompareToken }));
vi.mock("../services/jobControlPlane", () => ({
  createJobControlPlane: vi.fn(),
  recordAuthenticatedJobCallback: vi.fn(),
}));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: vi.fn() }));
vi.mock("../../drizzle/schema", () => ({
  workerJobAttempts: { id: "attempt.id", workerJobId: "attempt.workerJobId", attempt: "attempt.attempt" },
  workerJobDispatches: { workerJobId: "dispatch.workerJobId", referenceNamespace: "dispatch.referenceNamespace", publicationStatus: "dispatch.publicationStatus", consumedAt: "dispatch.consumedAt", dedupeKey: "dispatch.dedupeKey" },
  workerJobs: { id: "job.id", attempt: "job.attempt", runtimeType: "job.runtimeType", status: "job.status", operatorReviewRequired: "job.operatorReviewRequired", priority: "job.priority", createdAt: "job.createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

describe("job control-plane ready route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.FEATURE_186_POSTGRES_PYTHON_WORKER = "true";
    mockCompareToken.mockReturnValue(true);
    mockGetDb.mockReturnValue(undefined);
  });

  it("keeps initial published jobs visible before claim creates their attempt", async () => {
    const chain = {
      from: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.limit.mockResolvedValue([
      { jobId: "job-1", attempt: 1, attemptId: null },
    ]);
    mockDb.select.mockReturnValue(chain);

    const { registerJobControlPlaneRoutes } = await import("./jobControlPlane");
    const app = express();
    app.use(express.json());
    registerJobControlPlaneRoutes(app);

    const response = await request(app)
      .post("/api/internal/job-control-plane/ready")
      .set("x-internal-token", "test-token")
      .send({ runtimeType: "python_job_worker", limit: 1 })
      .expect(200);

    expect(chain.leftJoin).toHaveBeenCalledTimes(1);
    expect(response.body).toEqual({
      jobs: [{ jobId: "job-1", attempt: 1, attemptId: null }],
    });
  });
});
