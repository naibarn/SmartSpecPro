import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { getOpsIncidentTimeline } from "../monitoringService";

describe("monitoring tenant scope", () => {
  it("executes the incident notification filter with varchar tenant IDs", async () => {
    const capturedWhereConditions: unknown[] = [];
    let selectCount = 0;

    const makeQuery = (result: unknown[]) => {
      const query: Record<string, any> = {};
      query.from = vi.fn(() => query);
      query.where = vi.fn((condition: unknown) => {
        capturedWhereConditions.push(condition);
        return query;
      });
      query.orderBy = vi.fn(() => query);
      query.limit = vi.fn(async () => result);
      return query;
    };

    mockGetDb.mockResolvedValue({
      select: vi.fn(() => {
        selectCount += 1;
        if (selectCount === 1) {
          return makeQuery([{ checkedAt: new Date("2026-08-21T00:00:00.000Z") }]);
        }
        if (selectCount === 2) {
          return makeQuery([
            {
              id: 101,
              severity: "critical",
              title: "Queue backlog",
              message: "Queue backlog is elevated",
              channel: "log",
              acknowledged: false,
              acknowledgedBy: null,
              acknowledgedAt: null,
              metadata: {
                source: "ops_overview",
                dedupeKey: "ops-overview:queue_backlog",
              },
              createdAt: new Date("2026-08-21T00:00:00.000Z"),
            },
          ]);
        }
        return makeQuery([]);
      }),
    });

    await expect(
      getOpsIncidentTimeline("tenant-ZCSKEM9s", { limit: 1 }),
    ).resolves.toMatchObject({
      lastCheckAt: "2026-08-21T00:00:00.000Z",
    });

    expect(capturedWhereConditions).toHaveLength(1);
    const compiled = new PgDialect().sqlToQuery(
      capturedWhereConditions[0] as any,
    );
    expect(compiled.sql).toContain('"currentTenantId"');
    expect(compiled.sql).not.toContain("::integer");
    expect(compiled.params).toContain("tenant-ZCSKEM9s");
  });
});
