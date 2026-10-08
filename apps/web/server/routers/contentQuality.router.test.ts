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

function structuredDataIssueQuery(rows: unknown[]) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return query;
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

describe("contentQuality.getStructuredDataIssues", () => {
  beforeEach(() => mockSelect.mockReset());

  it("returns tenant-scoped actionable failures with the requested result limit", async () => {
    const issueRows = [{
      id: 42,
      title: "Review: Example Product",
      skill_slug: "product-reviewer",
      output_format: "cms_review",
      created_at: new Date("2026-10-08T10:00:00Z"),
      structured_data_errors: ["Missing required field: author"],
    }];
    const query = structuredDataIssueQuery(issueRows);
    mockSelect.mockReturnValueOnce(query);

    const caller = contentQualityRouter.createCaller(createContext("admin"));
    const result = await caller.getStructuredDataIssues({ limit: 10 });

    expect(result).toEqual(issueRows);
    expect(query.where).toHaveBeenCalledOnce();
    expect(query.orderBy).toHaveBeenCalledOnce();
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  it("uses the bounded default limit and rejects non-admin callers", async () => {
    const query = structuredDataIssueQuery([]);
    mockSelect.mockReturnValueOnce(query);
    const adminCaller = contentQualityRouter.createCaller(createContext("admin"));

    await expect(adminCaller.getStructuredDataIssues()).resolves.toEqual([]);
    expect(query.limit).toHaveBeenCalledWith(25);

    const userCaller = contentQualityRouter.createCaller(createContext("user"));
    await expect(userCaller.getStructuredDataIssues()).rejects.toThrow("required permission");
    expect(mockSelect).toHaveBeenCalledOnce();
  });
});
