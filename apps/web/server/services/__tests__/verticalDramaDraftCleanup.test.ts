import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb, predicateSpies } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  predicateSpies: {
    eq: vi.fn(),
    inArray: vi.fn(),
    isNull: vi.fn(),
    lt: vi.fn(),
  },
}));

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("drizzle-orm", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (...args: Parameters<typeof actual.eq>) => {
      predicateSpies.eq(...args);
      return actual.eq(...args);
    },
    inArray: (...args: Parameters<typeof actual.inArray>) => {
      predicateSpies.inArray(...args);
      return actual.inArray(...args);
    },
    isNull: (...args: Parameters<typeof actual.isNull>) => {
      predicateSpies.isNull(...args);
      return actual.isNull(...args);
    },
    lt: (...args: Parameters<typeof actual.lt>) => {
      predicateSpies.lt(...args);
      return actual.lt(...args);
    },
  };
});

import { verticalDramaDraftLedgers } from "../../../drizzle/schema";
import {
  VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS,
  VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES,
  archiveVerticalDramaStaleDraftJobs,
  getVerticalDramaStaleDraftCounts,
  verticalDramaStaleDraftDaysSchema,
  verticalDramaStaleDraftCutoff,
} from "../verticalDramaDraftCleanup";

describe("vertical drama stale Draft cleanup", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    vi.clearAllMocks();
  });

  it("validates mutation thresholds from the same fixed service contract", () => {
    for (const days of VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS) {
      expect(verticalDramaStaleDraftDaysSchema.safeParse(days).success).toBe(
        true
      );
    }
    for (const days of [0, 5, 6, 8, 30, "7"]) {
      expect(verticalDramaStaleDraftDaysSchema.safeParse(days).success).toBe(
        false
      );
    }
  });

  it("keeps the cleanup thresholds and pre-series terminal states allowlisted", () => {
    expect(VERTICAL_DRAMA_STALE_DRAFT_DAY_OPTIONS).toEqual([7, 10]);
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).toEqual([
      "ready_for_qc",
      "passed",
      "failed",
      "cancelled",
    ]);
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).not.toContain(
      "queued"
    );
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).not.toContain(
      "composing"
    );
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).not.toContain(
      "qc_running"
    );
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).not.toContain(
      "applied"
    );
    expect(VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES).not.toContain(
      "archived"
    );
  });

  it("uses an exact server-time cutoff for each allowed day bucket", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    expect(verticalDramaStaleDraftCutoff(7, now).toISOString()).toBe(
      "2026-08-10T12:00:00.000Z"
    );
    expect(verticalDramaStaleDraftCutoff(10, now).toISOString()).toBe(
      "2026-08-07T12:00:00.000Z"
    );
  });

  it("normalizes aggregate counts returned by the database", async () => {
    const where = vi
      .fn()
      .mockResolvedValue([{ olderThan7Days: 8n, olderThan10Days: 3 }]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    mockGetDb.mockResolvedValue({ select });

    await expect(
      getVerticalDramaStaleDraftCounts(
        { tenantId: "tenant-1", userId: 42 },
        new Date("2026-08-17T12:00:00.000Z")
      )
    ).resolves.toEqual({ 7: 8, 10: 3 });
    expect(select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(predicateSpies.eq).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.tenantId,
      "tenant-1"
    );
    expect(predicateSpies.eq).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.userId,
      42
    );
    expect(predicateSpies.isNull).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.archivedAt
    );
    expect(predicateSpies.inArray).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.jobStatus,
      VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES
    );
    expect(predicateSpies.lt).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.updatedAt,
      new Date("2026-08-10T12:00:00.000Z")
    );
    expect(predicateSpies.lt).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.updatedAt,
      new Date("2026-08-07T12:00:00.000Z")
    );
  });

  it("returns zero counts when the aggregate query has no row", async () => {
    const where = vi.fn().mockResolvedValue([]);
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
    });

    await expect(
      getVerticalDramaStaleDraftCounts({ tenantId: "tenant-1", userId: 42 })
    ).resolves.toEqual({ 7: 0, 10: 0 });
  });

  it("returns the number of rows archived by the guarded bulk update", async () => {
    const execute = vi.fn().mockResolvedValue([{ archivedCount: "2" }]);
    mockGetDb.mockResolvedValue({ execute });

    await expect(
      archiveVerticalDramaStaleDraftJobs(
        { tenantId: "tenant-1", userId: 42 },
        7,
        new Date("2026-08-17T12:00:00.000Z")
      )
    ).resolves.toBe(2);
    expect(execute).toHaveBeenCalledOnce();
    const compiled = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    const sqlText = compiled.sql.toLowerCase();
    expect(sqlText).toContain('update "vertical_drama_draft_ledgers"');
    expect(sqlText).toContain(
      'select count(*)::int as "archivedcount" from archived'
    );
    expect(sqlText).not.toContain('returning "id"');
    expect(predicateSpies.eq).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.tenantId,
      "tenant-1"
    );
    expect(predicateSpies.eq).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.userId,
      42
    );
    expect(predicateSpies.isNull).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.archivedAt
    );
    expect(predicateSpies.inArray).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.jobStatus,
      VERTICAL_DRAMA_STALE_DRAFT_ELIGIBLE_STATUSES
    );
    expect(predicateSpies.lt).toHaveBeenCalledWith(
      verticalDramaDraftLedgers.updatedAt,
      new Date("2026-08-10T12:00:00.000Z")
    );
  });
});
