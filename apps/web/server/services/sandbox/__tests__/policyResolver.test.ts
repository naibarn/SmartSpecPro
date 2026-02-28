import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db before importing modules that use it
vi.mock("../../../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../../../drizzle/schema", () => ({
  sandboxProfiles: {
    id: "id",
    slug: "slug",
    isActive: "isActive",
  },
  tenantSandboxPolicies: {
    tenantId: "tenantId",
    maxConcurrentSandboxes: "maxConcurrentSandboxes",
    maxDailyRuntimeSeconds: "maxDailyRuntimeSeconds",
  },
  sandboxJobs: {
    tenantId: "tenantId",
    status: "status",
    createdAt: "createdAt",
    startedAt: "startedAt",
    finishedAt: "finishedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  count: vi.fn(),
  sql: vi.fn(),
  gte: vi.fn(),
}));

import { db } from "../../../db";
import { resolveProfile, checkTenantPolicy } from "../policyResolver";

const mockDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

function createSelectChain(result: any[]) {
  const limitMock = vi.fn().mockResolvedValue(result);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

describe("resolveProfile", () => {
  it("resolves profile for given feature type", async () => {
    mockDb.select.mockReturnValue(
      createSelectChain([
        { id: 1, slug: "media-processing", name: "Media Processing" },
      ]),
    );

    const profile = await resolveProfile("media");
    expect(profile).toBeDefined();
    expect(profile?.slug).toBe("media-processing");
  });

  it("returns null when no active profile found", async () => {
    mockDb.select.mockReturnValue(createSelectChain([]));

    const profile = await resolveProfile("media");
    expect(profile).toBeNull();
  });
});

describe("checkTenantPolicy", () => {
  it("returns allowed when tenant is under limits", async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Policy query
        return createSelectChain([
          { maxConcurrentSandboxes: 5, maxDailyRuntimeSeconds: 36000 },
        ]);
      }
      if (callCount === 2) {
        // COUNT query for active jobs -- returns [{value: 2}]
        const whereMock = vi.fn().mockResolvedValue([{ value: 2 }]);
        const fromMock = vi.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      }
      // Daily runtime query -- returns [{totalSeconds: 1000}]
      const whereMock = vi.fn().mockResolvedValue([{ totalSeconds: 1000 }]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    const result = await checkTenantPolicy("tenant-1");
    expect(result.allowed).toBe(true);
  });

  it("returns denied when tenant exceeds concurrent limit", async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createSelectChain([
          { maxConcurrentSandboxes: 3, maxDailyRuntimeSeconds: 36000 },
        ]);
      }
      // COUNT query: 3 active jobs = at limit
      const whereMock = vi.fn().mockResolvedValue([{ value: 3 }]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    const result = await checkTenantPolicy("tenant-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("concurrent");
  });

  it("returns denied when tenant exceeds daily runtime", async () => {
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createSelectChain([
          { maxConcurrentSandboxes: 10, maxDailyRuntimeSeconds: 3600 },
        ]);
      }
      if (callCount === 2) {
        // COUNT query: 0 active (under concurrent limit)
        const whereMock = vi.fn().mockResolvedValue([{ value: 0 }]);
        const fromMock = vi.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      }
      // Daily runtime: 4000s > 3600s limit
      const whereMock = vi.fn().mockResolvedValue([{ totalSeconds: 4000 }]);
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      return { from: fromMock };
    });

    const result = await checkTenantPolicy("tenant-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily runtime");
  });
});
