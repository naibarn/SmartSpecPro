import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicAgencyRouter } from "../publicAgencyApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockDbInstance: any;

vi.mock("../../db", () => ({
  db: {
    get instance() {
      return mockDbInstance;
    },
  },
}));

vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: { executeRun: vi.fn(), getRunDetails: vi.fn() },
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
  getCreditBalance: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("mock-bearer-token"),
}));

import { agencyBridge } from "../../services/agencyBridge";
import { deductCredits, refundCredits, getCreditBalance } from "../../services/creditService";

const mockAgencyBridge = vi.mocked(agencyBridge);
const mockDeductCredits = vi.mocked(deductCredits);
const mockRefundCredits = vi.mocked(refundCredits);
const mockGetCreditBalance = vi.mocked(getCreditBalance);

// ---------------------------------------------------------------------------
// DB mock factory — thenable chaining approach
// ---------------------------------------------------------------------------

/**
 * Creates a db.instance mock where Drizzle-style chaining works.
 * Each call chain is thenable: `await db.select().from().where()` resolves
 * to the data in `resolveQueue` at index equal to how many times `then` was called.
 */
function buildMockDb(resolveQueue: any[][] = [[]]) {
  let callIdx = 0;

  const db: any = {
    then(onFulfilled: any, onRejected: any) {
      const data = resolveQueue[callIdx] ?? [];
      callIdx++;
      return Promise.resolve(data).then(onFulfilled, onRejected);
    },
    catch(onRejected: any) {
      const data = resolveQueue[callIdx] ?? [];
      callIdx++;
      return Promise.resolve(data).catch(onRejected);
    },
    finally(fn: any) {
      return Promise.resolve([]).finally(fn);
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "new-conv-1" }]),
      }),
    }),
  };

  // All select/chainable methods return `db` itself (the thenable)
  for (const m of [
    "select", "from", "innerJoin", "leftJoin", "where", "limit", "offset", "orderBy",
  ]) {
    db[m] = () => db;
  }

  return db;
}

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["agencies:list", "agencies:invoke"]) {
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
  app.use("/v1/agencies", createPublicAgencyRouter());
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const agency = {
  id: "agency-1",
  tenantId: "tenant-1",
  slug: "test-agency",
  name: "Test Agency",
  description: "A test agency",
  defaultModel: "gpt-4o-mini",
  status: "active",
  createdAt: new Date("2026-01-01"),
};

const runResult = {
  runId: "run-1",
  conversationId: "conv-1",
  status: "completed",
  response: "Done",
  creditsUsed: 10,
  durationMs: 1000,
  stepAttemptSnapshots: [],
  structuredResult: null,
  previewArtifacts: [],
};

// ---------------------------------------------------------------------------
// GET /v1/agencies
// ---------------------------------------------------------------------------

describe("GET /v1/agencies", () => {
  beforeEach(() => {
    // Single select query returns agency list
    mockDbInstance = buildMockDb([[agency]]);
  });

  it("returns agencies for the authenticated tenant", async () => {
    const res = await request(makeApp()).get("/v1/agencies");
    expect(res.status).toBe(200);
    expect(res.body.agencies).toHaveLength(1);
    expect(res.body.agencies[0].id).toBe("agency-1");
    expect(res.body.pagination).toBeDefined();
  });

  it("requires agencies:list scope", async () => {
    const res = await request(makeApp(["agencies:invoke"])).get("/v1/agencies");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns only agencies belonging to the API key tenant", async () => {
    const res = await request(makeApp()).get("/v1/agencies");
    expect(res.status).toBe(200);
    expect(res.body.agencies).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/agencies/:agencyId/invoke
// ---------------------------------------------------------------------------

describe("POST /v1/agencies/:agencyId/invoke", () => {
  beforeEach(() => {
    // Queue: 1st await → agency check [agency]; 2nd await → conv check []
    mockDbInstance = buildMockDb([[agency], []]);
    mockAgencyBridge.executeRun.mockResolvedValue(runResult as any);
    mockDeductCredits.mockResolvedValue({ success: true } as any);
    mockRefundCredits.mockResolvedValue({ success: true } as any);
    mockGetCreditBalance.mockResolvedValue({ credits: 90 } as any);
  });

  it("creates a conversation and invokes agency", async () => {
    const res = await request(makeApp())
      .post("/v1/agencies/agency-1/invoke")
      .send({ message: "Research AI trends" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("run_id");
    expect(res.body).toHaveProperty("conversation_id");
    expect(res.body.status).toBe("completed");
  });

  it("requires agencies:invoke scope", async () => {
    const res = await request(makeApp(["agencies:list"]))
      .post("/v1/agencies/agency-1/invoke")
      .send({ message: "hello" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("rejects agency from a different tenant with 404", async () => {
    mockDbInstance = buildMockDb([[]]);
    const res = await request(makeApp())
      .post("/v1/agencies/agency-999/invoke")
      .send({ message: "hello" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("deducts credits with source type api_agency", async () => {
    await request(makeApp())
      .post("/v1/agencies/agency-1/invoke")
      .send({ message: "hello" });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "api_agency" }),
    );
  });

  it("returns X-Credits-Used header", async () => {
    const res = await request(makeApp())
      .post("/v1/agencies/agency-1/invoke")
      .send({ message: "hello" });
    expect(res.headers["x-credits-used"]).toBeDefined();
  });

  it("validates agencyId format to prevent path traversal", async () => {
    const res = await request(makeApp())
      .post("/v1/agencies/invalid.id/invoke")
      .send({ message: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("enforces max_credits budget cap with refund of unused credits", async () => {
    const res = await request(makeApp())
      .post("/v1/agencies/agency-1/invoke")
      .send({ message: "hello", max_credits: 50 });
    expect(res.status).toBe(200);
    // Used 10, reserved 50 → refund 40
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 40 }),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /v1/agencies/:agencyId/runs/:runId
// ---------------------------------------------------------------------------

describe("GET /v1/agencies/:agencyId/runs/:runId", () => {
  beforeEach(() => {
    mockDbInstance = buildMockDb([[agency]]);
    mockAgencyBridge.getRunDetails.mockResolvedValue(runResult as any);
  });

  it("returns run status with messages and credits_used", async () => {
    const res = await request(makeApp()).get("/v1/agencies/agency-1/runs/run-1");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("run_id");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("credits_used");
  });

  it("requires agencies:invoke scope", async () => {
    const res = await request(makeApp(["agencies:list"])).get(
      "/v1/agencies/agency-1/runs/run-1",
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns 404 for run belonging to different tenant", async () => {
    mockDbInstance = buildMockDb([[]]);
    const res = await request(makeApp()).get("/v1/agencies/other-agency/runs/run-1");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/agencies/:agencyId/runs/:runId/stream
// ---------------------------------------------------------------------------

describe("GET /v1/agencies/:agencyId/runs/:runId/stream", () => {
  beforeEach(() => {
    mockDbInstance = buildMockDb([[agency]]);
    mockAgencyBridge.getRunDetails.mockResolvedValue(runResult as any);
  });

  it("returns SSE content-type", async () => {
    const res = await request(makeApp()).get(
      "/v1/agencies/agency-1/runs/run-1/stream",
    );
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });

  it("requires agencies:invoke scope", async () => {
    const res = await request(makeApp(["agencies:list"])).get(
      "/v1/agencies/agency-1/runs/run-1/stream",
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });
});
