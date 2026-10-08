import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("../db", () => ({
  db: { select: mockSelect },
}));

import { contentQualityRouter } from "./contentQuality";

function createContext(role: string): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "admin-7",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "email",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    tenantId: "tenant-7",
  };
}

function statusQuery(rows: unknown[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    groupBy: vi.fn().mockResolvedValue(rows),
  };
  return query;
}

function metricQuery(row: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([row]),
    })),
  };
}

describe("contentQuality.getOverview structured data metrics", () => {
  beforeEach(() => mockSelect.mockReset());

  it("returns tenant overview including valid and invalid structured-data counts", async () => {
    mockSelect
      .mockReturnValueOnce(statusQuery([
        { status: "active", count: 3 },
        { status: "stale", count: 1 },
      ]))
      .mockReturnValueOnce(metricQuery({
        avg_coverage: 0.82,
        structured_data_valid_count: 2,
        structured_data_invalid_count: 1,
      }));

    const caller = contentQualityRouter.createCaller(createContext("admin"));
    const result = await caller.getOverview();

    expect(result).toMatchObject({
      total_artifacts: 4,
      active: 3,
      stale: 1,
      avg_citation_coverage: 0.82,
      structured_data_valid_count: 2,
      structured_data_invalid_count: 1,
    });
  });

  it("keeps overview restricted to admins", async () => {
    const caller = contentQualityRouter.createCaller(createContext("user"));

    await expect(caller.getOverview()).rejects.toThrow("required permission");
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
