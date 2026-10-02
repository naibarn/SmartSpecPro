import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDb, mockCompareToken, mockCreateControlPlaneJob } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockGetDb: vi.fn(),
  mockCompareToken: vi.fn(),
  mockCreateControlPlaneJob: vi.fn(),
}));

vi.mock("../db", () => ({ db: mockDb, getDb: mockGetDb }));
vi.mock("../services/appRuntimeConfig", () => ({ compareCachedInternalToken: mockCompareToken }));
vi.mock("../services/jobControlPlane", () => ({
  createJobControlPlane: vi.fn(),
  recordAuthenticatedJobCallback: vi.fn(),
}));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateControlPlaneJob }));
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
    mockCreateControlPlaneJob.mockResolvedValue({ jobId: "job-1", created: true });
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

  it("passes durable admission from the authenticated internal dispatcher", async () => {
    const { registerJobControlPlaneRoutes } = await import("./jobControlPlane");
    const app = express();
    app.use(express.json());
    registerJobControlPlaneRoutes(app);

    await request(app)
      .post("/api/internal/job-control-plane/create")
      .set("x-internal-token", "test-token")
      .send({
        context: {
          tenantId: "tenant-a",
          actorType: "user",
          actorId: 7,
          authorizationScope: "python.job-dispatch",
          correlationId: "media:image:task-1",
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "python.legacy_task",
          executionClass: "long",
          input: { queue: "media" },
          retryPolicy: {
            maxAttempts: 3,
            baseDelayMs: 1000,
            maxDelayMs: 900000,
            jitter: "bounded",
            deadlineMs: 600000,
            allowedErrorClasses: ["retryable"],
          },
          timeoutPolicy: { softTimeoutMs: 300000, hardTimeoutMs: 600000 },
        },
        runtimeType: "python_job_worker",
        admissionMode: "durable_queue",
      })
      .expect(200);

    expect(mockCreateControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      createOptions: { runtimeType: "python_job_worker", admissionMode: "durable_queue" },
    }));
  });
});
