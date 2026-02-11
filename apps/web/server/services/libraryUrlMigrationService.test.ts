import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildLibraryUrlMigrationPlan,
  runLibraryUrlMigration,
  type LibraryUrlMigrationItem,
} from "./libraryUrlMigrationService";

function createMockDb(rows: LibraryUrlMigrationItem[]) {
  const updatePayloads: any[] = [];

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
    update: vi.fn().mockImplementation(() => ({
      set: (payload: any) => {
        updatePayloads.push(payload);
        return {
          where: vi.fn().mockResolvedValue([{ id: 1 }]),
        };
      },
    })),
  };

  return {
    db,
    updatePayloads,
  };
}

const FIXTURE_ROWS: LibraryUrlMigrationItem[] = [
  {
    id: 1,
    tenantId: "tenant-a",
    itemType: "image",
    sourceUrl: "https://cdn.example.com/a.png",
    thumbnailUrl: "https://cdn.example.com/a-thumb.png",
    metadata: {},
  },
  {
    id: 2,
    tenantId: "tenant-a",
    itemType: "image",
    sourceUrl: " https://cdn.example.com/needs-trim.png ",
    thumbnailUrl: null,
    metadata: {},
  },
  {
    id: 3,
    tenantId: "tenant-b",
    itemType: "md",
    sourceUrl: "javascript:alert(1)",
    thumbnailUrl: null,
    metadata: {},
  },
];

describe("buildLibraryUrlMigrationPlan", () => {
  it("classifies rows into valid, needs_normalization, blocked with deterministic summary", () => {
    const result = buildLibraryUrlMigrationPlan(FIXTURE_ROWS);
    expect(result.summary).toEqual({
      total: 3,
      valid: 1,
      needs_normalization: 1,
      blocked: 1,
      by_tenant: {
        "tenant-a": {
          total: 2,
          valid: 1,
          needs_normalization: 1,
          blocked: 0,
        },
        "tenant-b": {
          total: 1,
          valid: 0,
          needs_normalization: 0,
          blocked: 1,
        },
      },
      by_item_type: {
        image: {
          total: 2,
          valid: 1,
          needs_normalization: 1,
          blocked: 0,
        },
        md: {
          total: 1,
          valid: 0,
          needs_normalization: 0,
          blocked: 1,
        },
      },
    });

    const valid = result.rows.find((row) => row.item.id === 1);
    const normalize = result.rows.find((row) => row.item.id === 2);
    const blocked = result.rows.find((row) => row.item.id === 3);

    expect(valid?.classification).toBe("valid");
    expect(normalize?.classification).toBe("needs_normalization");
    expect(blocked?.classification).toBe("blocked");
    expect(blocked?.reasons).toEqual(["blocked_scheme"]);
  });
});

describe("runLibraryUrlMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-run reports classification with no DB mutations", async () => {
    const { db } = createMockDb(FIXTURE_ROWS);
    const result = await runLibraryUrlMigration(db as any, {
      mode: "dry-run",
      snapshotRef: "snapshot-dry-run.json",
    });

    expect(result.mode).toBe("dry-run");
    expect(result.summary.total).toBe(3);
    expect(result.normalized_updates).toBe(0);
    expect(result.enforcement_updates).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
    expect(result.snapshot_ref).toBe("snapshot-dry-run.json");
  });

  it("normalization mode updates only needs_normalization rows", async () => {
    const { db, updatePayloads } = createMockDb(FIXTURE_ROWS);
    const result = await runLibraryUrlMigration(db as any, {
      mode: "normalize",
      snapshotRef: "snapshot-normalize.json",
    });

    expect(result.normalized_updates).toBe(1);
    expect(result.enforcement_updates).toBe(0);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/needs-trim.png",
      }),
    );
    expect(updatePayloads[0]).not.toHaveProperty("thumbnailUrl");
  });

  it("enforcement mode quarantines blocked URLs and preserves valid external https rows", async () => {
    const { db, updatePayloads } = createMockDb(FIXTURE_ROWS);
    const result = await runLibraryUrlMigration(db as any, {
      mode: "enforce",
      snapshotRef: "snapshot-enforce.json",
    });

    expect(result.enforcement_updates).toBe(1);
    expect(result.normalized_updates).toBe(0);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        sourceUrl: null,
      }),
    );
    expect(updatePayloads[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          security_url_migration: expect.objectContaining({
            source: "library_url_migration",
            blocked_reasons: ["blocked_scheme"],
          }),
        }),
      }),
    );

    const validRow = result.rows.find((row) => row.item.id === 1);
    expect(validRow?.classification).toBe("valid");
    expect(validRow?.source.normalized).toBe("https://cdn.example.com/a.png");
  });
});
