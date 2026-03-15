import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// Note: vi.mock factories are hoisted — no module-level variables inside them.
// Use vi.mocked() after import to get typed access.
// ---------------------------------------------------------------------------

vi.mock("../creditService", () => ({
  deductCredits: vi.fn().mockResolvedValue({ success: true }),
  addCredits: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../redis", () => ({
  getRedisClient: () => ({
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

// db mock uses a getter that reads a module-level var updated in beforeEach
vi.mock("../../db", () => {
  const state = { instance: null as any };
  return {
    db: {
      get instance() { return state.instance; },
    },
    __state: state,
  };
});

import { deductCredits, addCredits } from "../creditService";
import {
  createJob,
  cancelJob,
  listJobs,
  getJob,
  VALID_JOB_TYPES,
  MAX_SINGLE_JOB_CREDITS,
} from "../jobAutomationService";

// Access the internal state holder to set mockDbInstance
import * as dbModule from "../../db";

const mockDeductCredits = vi.mocked(deductCredits);
const mockAddCredits = vi.mocked(addCredits);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockJob = {
  id: "job-1",
  tenantId: "tenant-1",
  userId: 1,
  apiKeyId: "key-1",
  type: "skill_execution",
  status: "pending",
  params: {},
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
// Mock DB factory
// ---------------------------------------------------------------------------

function makeMockDb(existingJob?: any) {
  const theJob = existingJob;
  const rows = theJob ? [theJob] : [];

  const offsetFn = vi.fn().mockResolvedValue(rows);
  const limitAfterOrder = vi.fn().mockReturnValue({ offset: offsetFn });
  const orderByAfterWhere = vi.fn().mockReturnValue({ limit: limitAfterOrder });

  const whereResult = {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: orderByAfterWhere,
  };

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereResult),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue(rows) }) }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockJob]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
}

function setDb(existingJob?: any) {
  (dbModule as any).__state.instance = makeMockDb(existingJob);
}

beforeEach(() => {
  vi.clearAllMocks();
  setDb();
  mockDeductCredits.mockResolvedValue({ success: true } as any);
  mockAddCredits.mockResolvedValue({ success: true } as any);
});

// ---------------------------------------------------------------------------
// Job type validation
// ---------------------------------------------------------------------------

describe("createJob — type validation", () => {
  it("accepts all valid job types", async () => {
    const paramsMap: Record<string, Record<string, unknown>> = {
      pipeline: { steps: [{ id: "s1", type: "skill_execution", params: {} }] },
    };
    for (const type of VALID_JOB_TYPES) {
      setDb();
      const params = paramsMap[type] ?? {};
      const job = await createJob({ type, params }, { userId: 1, tenantId: "t1", apiKeyId: "k1" });
      expect(job).toBeDefined();
    }
  });

  it("rejects unknown job type", async () => {
    await expect(
      createJob({ type: "foo_bar" as any, params: {} }, { userId: 1, tenantId: "t1", apiKeyId: "k1" }),
    ).rejects.toMatchObject({ code: "invalid_job_type" });
  });
});

// ---------------------------------------------------------------------------
// Credit overflow guard
// ---------------------------------------------------------------------------

describe("createJob — credit overflow guard", () => {
  it("rejects max_credits exceeding MAX_SINGLE_JOB_CREDITS", async () => {
    await expect(
      createJob(
        { type: "skill_execution", params: {}, maxCredits: MAX_SINGLE_JOB_CREDITS + 1 },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).rejects.toMatchObject({ code: "credit_overflow" });
  });

  it("accepts max_credits at exactly MAX_SINGLE_JOB_CREDITS", async () => {
    const job = await createJob(
      { type: "skill_execution", params: {}, maxCredits: MAX_SINGLE_JOB_CREDITS },
      { userId: 1, tenantId: "t1", apiKeyId: "k1" },
    );
    expect(job).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Credit reservation
// ---------------------------------------------------------------------------

describe("createJob — credit reservation", () => {
  it("reserves credits before enqueueing", async () => {
    await createJob({ type: "skill_execution", params: {} }, { userId: 1, tenantId: "t1", apiKeyId: "k1" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "api_job" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("createJob — idempotency", () => {
  it("returns existing job for duplicate idempotency key without deducting credits", async () => {
    setDb(mockJob); // DB returns existing job

    const job = await createJob(
      { type: "skill_execution", params: {}, idempotencyKey: "key-123" },
      { userId: 1, tenantId: "tenant-1", apiKeyId: "k1" },
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(job.id).toBe("job-1");
  });
});

// ---------------------------------------------------------------------------
// Pipeline validation
// ---------------------------------------------------------------------------

describe("createJob — pipeline validation", () => {
  it("rejects empty steps array", async () => {
    await expect(
      createJob(
        { type: "pipeline", params: { steps: [] } },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects more than 20 steps", async () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({
      id: `step_${i}`,
      type: "skill_execution",
      params: {},
    }));
    await expect(
      createJob(
        { type: "pipeline", params: { steps } },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("accepts a valid two-step pipeline with template reference", async () => {
    const steps = [
      { id: "a", type: "skill_execution", params: {} },
      { id: "b", type: "skill_execution", params: { input: "{{steps.a.result.output}}" } },
    ];
    await expect(
      createJob(
        { type: "pipeline", params: { steps } },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).resolves.toBeDefined();
  });

  it("rejects circular step references", async () => {
    const steps = [
      { id: "a", type: "skill_execution", params: { input: "{{steps.b.result.output}}" } },
      { id: "b", type: "skill_execution", params: { input: "{{steps.a.result.output}}" } },
    ];
    await expect(
      createJob(
        { type: "pipeline", params: { steps } },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).rejects.toMatchObject({ code: "circular_pipeline_reference" });
  });

  it("rejects step referencing non-existent step ID", async () => {
    const steps = [
      { id: "a", type: "skill_execution", params: { input: "{{steps.nonexistent.result.output}}" } },
    ];
    await expect(
      createJob(
        { type: "pipeline", params: { steps } },
        { userId: 1, tenantId: "t1", apiKeyId: "k1" },
      ),
    ).rejects.toMatchObject({ code: "invalid_pipeline" });
  });
});

// ---------------------------------------------------------------------------
// cancelJob
// ---------------------------------------------------------------------------

describe("cancelJob", () => {
  it("cancels a pending job and refunds credits", async () => {
    const pendingJob = { ...mockJob, status: "pending", creditsReserved: 10 };
    setDb(pendingJob);

    const result = await cancelJob("job-1", "tenant-1", 1);
    expect(result.status).toBe("cancelled");
    expect(mockAddCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
    );
  });

  it("throws job_not_cancellable for completed job", async () => {
    const completedJob = { ...mockJob, status: "completed" };
    setDb(completedJob);

    await expect(cancelJob("job-1", "tenant-1", 1)).rejects.toMatchObject({
      code: "job_not_cancellable",
    });
  });

  it("throws not_found for job belonging to different tenant", async () => {
    setDb(); // no rows returned
    await expect(cancelJob("job-1", "different-tenant", 1)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// listJobs / getJob
// ---------------------------------------------------------------------------

describe("listJobs", () => {
  it("returns jobs and total", async () => {
    const result = await listJobs("tenant-1", { page: 1, limit: 10 });
    expect(result).toHaveProperty("jobs");
    expect(result).toHaveProperty("total");
  });
});

describe("getJob", () => {
  it("returns null for non-existent job", async () => {
    const result = await getJob("nonexistent", "tenant-1");
    expect(result).toBeNull();
  });

  it("returns job for valid id and tenant", async () => {
    setDb(mockJob);
    const result = await getJob("job-1", "tenant-1");
    expect(result).toBeDefined();
    expect(result?.id).toBe("job-1");
  });
});
