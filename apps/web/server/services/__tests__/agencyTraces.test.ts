/**
 * Tests for agency trace service — persistRunTrace, getRunTrace, sweepExpiredTraces.
 * Tests focus on the service functions in isolation with mocked DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Build a self-referencing chainable mock that also acts as a thenable (Promise-like).
// This handles drizzle's builder pattern where the final chain step is awaited.
function createChainableMock(defaultResult: unknown = []) {
  let _result: unknown = defaultResult;
  const mock: Record<string, ReturnType<typeof vi.fn>> & { _setResult: (v: unknown) => void } = {
    _setResult: (v: unknown) => { _result = v; },
  } as any;

  const methods = ["insert", "values", "select", "from", "where", "orderBy", "limit", "offset"];
  for (const m of methods) {
    mock[m] = vi.fn().mockImplementation(() => {
      // Return a proxy that is both chainable and thenable
      return new Proxy(mock, {
        get(target, prop) {
          if (prop === "then") {
            // Make it thenable — resolve with current _result
            return (resolve: (v: unknown) => void) => resolve(_result);
          }
          return target[prop as string];
        },
      });
    });
  }
  mock.execute = vi.fn().mockResolvedValue({ rowCount: 0 });

  return mock;
}

let mockDb: ReturnType<typeof createChainableMock>;

vi.mock("../../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("../../../drizzle/schema", () => ({
  agencyRunTraces: {
    id: "id",
    runId: "runId",
    agencyId: "agencyId",
    tenantId: "tenantId",
    createdBy: "createdBy",
    trace: "trace",
    durationMs: "durationMs",
    totalTokens: "totalTokens",
    totalCost: "totalCost",
    status: "status",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  desc: vi.fn((col: unknown) => ({ _op: "desc", col })),
  gte: vi.fn((...args: unknown[]) => ({ _op: "gte", args })),
  lte: vi.fn((...args: unknown[]) => ({ _op: "lte", args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _tag: "sql",
    strings,
    values,
  })),
}));

import {
  persistRunTrace,
  listRunTraces,
  getRunTrace,
  normalizeTraceForPersistence,
  sweepExpiredTraces,
} from "../agencyTraceService";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb = createChainableMock();
});

describe("persistRunTrace", () => {
  it("inserts a trace row with correct fields", async () => {
    await persistRunTrace({
      runId: "run-1",
      agencyId: "agency-1",
      tenantId: "tenant-A",
      createdBy: 42,
      trace: { version: 1, spans: [] },
      durationMs: 1500,
      totalTokens: 300,
      totalCost: 0.005,
      status: "completed",
    });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        agencyId: "agency-1",
        tenantId: "tenant-A",
        createdBy: 42,
        status: "completed",
      }),
    );
  });

  it("scrubs secrets and infers hybrid summary before persistence", async () => {
    await persistRunTrace({
      runId: "run-2",
      agencyId: "agency-2",
      tenantId: "tenant-B",
      trace: {
        version: 1,
        spans: [
          {
            spanId: "span-1",
            type: "bridge",
            metadata: {
              engine: "adk2",
              subgraphId: "sg_creative",
              phase: "bridge",
            },
            output: "Authorization: Bearer sk-secret-token-value",
          },
        ],
      },
      status: "completed",
    });

    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: expect.objectContaining({
          hybridSummary: expect.objectContaining({
            engineMix: ["adk2"],
            subgraphIds: ["sg_creative"],
            boundaryCount: 1,
          }),
          spans: [
            expect.objectContaining({
              output: "[REDACTED]",
            }),
          ],
        }),
      }),
    );
  });
});

describe("listRunTraces", () => {
  it("calls select, from, where, orderBy, limit, offset", async () => {
    const result = await listRunTraces({
      agencyId: "agency-1",
      tenantId: "tenant-A",
    });

    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.from).toHaveBeenCalled();
    expect(mockDb.where).toHaveBeenCalled();
    expect(result).toHaveProperty("traces");
    expect(result).toHaveProperty("total");
  });

  it("uses default limit of 20 and offset of 0", async () => {
    await listRunTraces({
      agencyId: "agency-1",
      tenantId: "tenant-A",
    });

    expect(mockDb.limit).toHaveBeenCalledWith(20);
    expect(mockDb.offset).toHaveBeenCalledWith(0);
  });

  it("clamps limit to max 100", async () => {
    await listRunTraces({
      agencyId: "agency-1",
      tenantId: "tenant-A",
      limit: 500,
    });

    expect(mockDb.limit).toHaveBeenCalledWith(100);
  });

  it("passes custom offset", async () => {
    await listRunTraces({
      agencyId: "agency-1",
      tenantId: "tenant-A",
      limit: 10,
      offset: 20,
    });

    expect(mockDb.limit).toHaveBeenCalledWith(10);
    expect(mockDb.offset).toHaveBeenCalledWith(20);
  });
});

describe("getRunTrace", () => {
  it("returns trace for matching traceId and tenantId", async () => {
    const mockTrace = {
      id: "t1",
      runId: "r1",
      tenantId: "tenant-A",
      trace: { version: 1, spans: [{ spanId: "s1" }] },
    };
    mockDb._setResult([mockTrace]);

    const result = await getRunTrace("t1", "tenant-A");
    expect(result).toEqual(mockTrace);
    expect(mockDb.where).toHaveBeenCalled();
  });

  it("returns null when trace not found", async () => {
    mockDb._setResult([]);

    const result = await getRunTrace("nonexistent", "tenant-A");
    expect(result).toBeNull();
  });
});

describe("sweepExpiredTraces", () => {
  it("deletes traces older than retention days", async () => {
    mockDb.execute.mockResolvedValueOnce({ rowCount: 5 });

    const deleted = await sweepExpiredTraces("tenant-A", 30);
    expect(deleted).toBe(5);
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("batches deletes until fewer than batch size returned", async () => {
    mockDb.execute.mockResolvedValueOnce({ rowCount: 1000 });
    mockDb.execute.mockResolvedValueOnce({ rowCount: 200 });

    const deleted = await sweepExpiredTraces("tenant-A", 7);
    expect(deleted).toBe(1200);
    expect(mockDb.execute).toHaveBeenCalledTimes(2);
  });

  it("returns 0 when no traces to delete", async () => {
    mockDb.execute.mockResolvedValueOnce({ rowCount: 0 });

    const deleted = await sweepExpiredTraces("tenant-A", 30);
    expect(deleted).toBe(0);
  });
});

describe("normalizeTraceForPersistence", () => {
  it("leaves traces without hybrid spans unchanged except for scrubbing", () => {
    const trace = normalizeTraceForPersistence({
      version: 1,
      spans: [
        {
          output: "Bearer demo-token",
        },
      ],
    });

    expect(trace).toEqual({
      version: 1,
      spans: [
        {
          output: "[REDACTED]",
        },
      ],
    });
  });
});
