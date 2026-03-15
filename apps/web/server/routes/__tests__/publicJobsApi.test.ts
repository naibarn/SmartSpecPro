import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicJobsRouter } from "../publicJobsApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../services/jobAutomationService", () => ({
  VALID_JOB_TYPES: [
    "skill_execution",
    "media_generation",
    "agency_run",
    "batch_skill",
    "presentation_create",
    "video_project_create",
    "pipeline",
  ],
  MAX_SINGLE_JOB_CREDITS: 10_000,
  createJob: vi.fn(),
  cancelJob: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
}));

import {
  createJob,
  cancelJob,
  listJobs,
  getJob,
} from "../../services/jobAutomationService";

const mockCreateJob = vi.mocked(createJob);
const mockCancelJob = vi.mocked(cancelJob);
const mockListJobs = vi.mocked(listJobs);
const mockGetJob = vi.mocked(getJob);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pendingJob = {
  id: "job-1",
  tenantId: "tenant-1",
  userId: 1,
  apiKeyId: "key-1",
  type: "skill_execution",
  status: "pending",
  params: { skill_id: "abc", inputs: {} },
  result: null,
  error: null,
  progress: 0,
  creditsReserved: 10,
  creditsUsed: 0,
  callbackUrl: null,
  idempotencyKey: null,
  parentJobId: null,
  stepIndex: null,
  traceId: "trace-1",
  startedAt: null,
  completedAt: null,
  createdAt: new Date("2026-01-01"),
  expiresAt: new Date("2026-01-08"),
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["jobs:create", "jobs:read"]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes,
    };
    next();
  });
  app.use("/v1/jobs", createPublicJobsRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateJob.mockResolvedValue(pendingJob as any);
  mockCancelJob.mockResolvedValue({ ...pendingJob, status: "cancelled" } as any);
  mockListJobs.mockResolvedValue({ jobs: [pendingJob] as any, total: 1 });
  mockGetJob.mockResolvedValue(pendingJob as any);
});

// ---------------------------------------------------------------------------
// POST /v1/jobs
// ---------------------------------------------------------------------------

describe("POST /v1/jobs", () => {
  it("creates job and returns 201 with job object", async () => {
    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "skill_execution", params: { skill_id: "abc", inputs: {} } });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.status).toBe("pending");
    expect(res.body).toHaveProperty("credits_reserved");
  });

  it("requires jobs:create scope", async () => {
    const res = await request(makeApp(["jobs:read"]))
      .post("/v1/jobs")
      .send({ type: "skill_execution", params: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns 400 for invalid job type", async () => {
    const err: any = new Error("Invalid type");
    err.code = "invalid_job_type";
    mockCreateJob.mockRejectedValue(err);

    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "invalid_type", params: {} });
    // Zod catches enum violation before calling service
    expect(res.status).toBe(400);
  });

  it("returns 400 when credits exceed MAX_SINGLE_JOB_CREDITS", async () => {
    const err: any = new Error("Credit overflow");
    err.code = "credit_overflow";
    mockCreateJob.mockRejectedValue(err);

    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "skill_execution", params: {}, max_credits: 10001 });
    // Zod validates max_credits <= 10000
    expect(res.status).toBe(400);
  });

  it("validates callback_url format", async () => {
    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "skill_execution", params: {}, callback_url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("returns 400 for pipeline with empty steps", async () => {
    const err: any = new Error("Pipeline must have at least one step");
    err.code = "invalid_request";
    mockCreateJob.mockRejectedValue(err);

    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "pipeline", params: { steps: [] } });
    expect(res.status).toBe(400);
  });

  it("returns 400 for circular pipeline reference", async () => {
    const err: any = new Error("Circular reference");
    err.code = "circular_pipeline_reference";
    mockCreateJob.mockRejectedValue(err);

    const res = await request(makeApp())
      .post("/v1/jobs")
      .send({ type: "pipeline", params: { steps: [{ id: "a", type: "skill_execution", params: {} }] } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("circular_pipeline_reference");
  });
});

// ---------------------------------------------------------------------------
// GET /v1/jobs
// ---------------------------------------------------------------------------

describe("GET /v1/jobs", () => {
  it("returns paginated job list", async () => {
    const res = await request(makeApp()).get("/v1/jobs?status=pending&page=1&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
  });

  it("requires jobs:read scope", async () => {
    const res = await request(makeApp(["jobs:create"])).get("/v1/jobs");
    expect(res.status).toBe(403);
  });

  it("respects tenant isolation (service called with tenant from auth)", async () => {
    await request(makeApp()).get("/v1/jobs");
    expect(mockListJobs).toHaveBeenCalledWith("tenant-1", expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// GET /v1/jobs/:jobId
// ---------------------------------------------------------------------------

describe("GET /v1/jobs/:jobId", () => {
  it("returns full job detail", async () => {
    const res = await request(makeApp()).get("/v1/jobs/job-1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("job-1");
    expect(res.body).toHaveProperty("result");
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 for non-existent or different tenant job", async () => {
    mockGetJob.mockResolvedValue(null);
    const res = await request(makeApp()).get("/v1/jobs/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires jobs:read scope", async () => {
    const res = await request(makeApp([])).get("/v1/jobs/job-1");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/jobs/:jobId
// ---------------------------------------------------------------------------

describe("DELETE /v1/jobs/:jobId", () => {
  it("cancels pending job and returns 200", async () => {
    const res = await request(makeApp()).delete("/v1/jobs/job-1");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("returns 409 when trying to cancel completed job", async () => {
    const err: any = new Error("Cannot cancel completed job");
    err.code = "job_not_cancellable";
    mockCancelJob.mockRejectedValue(err);

    const res = await request(makeApp()).delete("/v1/jobs/job-1");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("job_not_cancellable");
  });

  it("requires jobs:create scope", async () => {
    const res = await request(makeApp(["jobs:read"])).delete("/v1/jobs/job-1");
    expect(res.status).toBe(403);
  });
});
