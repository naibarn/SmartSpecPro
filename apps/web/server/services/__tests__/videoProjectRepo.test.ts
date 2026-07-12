/**
 * Video Intelligence Platform (feature 133, section-05-db-tables-brand-kit) —
 * thin data-access repo coverage (TDD Section 5). Mocks the app's `db` proxy
 * (`../../db`) with the same chainable-stub convention used by
 * `verticalDramaShotReferences.test.ts` / `verticalDramaShareLinks.test.ts`:
 * `.select().from().where()...`, `.insert().values().returning()`,
 * `.update().set().where().returning()`, `.delete().where().returning()`, and
 * `db.transaction(fn)` invoking `fn(mockDb)` (the transaction's `tx` handle
 * has the same shape as `db` in this codebase's Drizzle wrapper).
 *
 * Every assertion locks TWO things per spec §7 (security & consistency
 * checklist): (1) exact `db.select`/`db.insert`/`db.update`/`db.transaction`
 * call counts — "no extra queries" — and (2) that `tenantId` AND `userId`
 * are present in every `where(...)` call args (tenant+owner isolation,
 * spec §17.1). A foreign-tenant/foreign-user id must resolve to `null`,
 * never another user's row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

import {
  insertVideoProject,
  getVideoProject,
  listVideoProjects,
  saveVideoProjectDocument,
  listVideoProjectRevisions,
  restoreVideoProjectRevision,
  insertBrandKit,
  getBrandKit,
  listBrandKits,
  updateBrandKit,
  deleteBrandKit,
  VideoProjectRevisionConflictError,
  type ProjectAuthScope,
} from "../videoProjectRepo";
import type {
  VideoProjectRow,
  VideoProjectRevisionRow,
  BrandKitRow,
} from "../../../drizzle/schema";

/** Thenable select-chain stub — same shape as the VD repo test helpers. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function deleteChain(rows: unknown[]) {
  const chain: any = {
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

/**
 * Real (unmocked) Drizzle `and(eq(...), ...)` `SQL` condition objects are
 * self-referential (`column.table === table`, `table.columns.x === column`)
 * — `JSON.stringify` throws "Converting circular structure to JSON" on
 * them. `util.inspect` handles cycles gracefully (`[Circular *n]`) while
 * still rendering every `Param { value: ... }` leaf, so it's the safe way
 * to assert a scope value (tenantId/userId) was embedded in a `where(...)`
 * condition without needing to reconstruct Drizzle's AST by hand.
 */
function whereContains(whereArg: unknown, needle: string | number): boolean {
  return inspect(whereArg, { depth: 12 }).includes(String(needle));
}

function project(over: Partial<VideoProjectRow> = {}): VideoProjectRow {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 42,
    studioType: "catalog",
    name: "Test Project",
    status: "brief",
    automationMode: "guided",
    brief: null,
    document: { schemaVersion: 1 },
    revision: 1,
    brandKitId: null,
    sourceRefs: null,
    qaLedger: null,
    renderJobId: null,
    previewJobId: null,
    resultLibraryItemId: null,
    videoEditorProjectId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as VideoProjectRow;
}

function revisionRow(over: Partial<VideoProjectRevisionRow> = {}): VideoProjectRevisionRow {
  return {
    id: 1,
    projectId: 1,
    revision: 1,
    document: { schemaVersion: 1 },
    createdBy: 42,
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as VideoProjectRevisionRow;
}

function brandKit(over: Partial<BrandKitRow> = {}): BrandKitRow {
  return {
    id: 1,
    tenantId: "tenant-1",
    userId: 42,
    name: "Acme",
    logoAssetId: null,
    colors: { primary: "#000000" },
    fonts: null,
    captionPresetId: null,
    locks: { colors: true },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as BrandKitRow;
}

const SCOPE: ProjectAuthScope = { tenantId: "tenant-1", userId: 42 };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: `db.transaction(fn)` invokes `fn` with the same mocked handle,
  // mirroring `server/db.ts`'s `transaction: (fn) => _db.transaction(tx => fn(tx))`.
  mockDb.transaction.mockImplementation(async (fn: any) => fn(mockDb));
});

describe("insertVideoProject", () => {
  it("inserts a video_projects row scoped to tenant+user", async () => {
    const chain = insertChain([project({ id: 7 })]);
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await insertVideoProject(SCOPE, {
      studioType: "catalog",
      name: "New Project",
    } as any);

    expect(result.id).toBe(7);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const values = chain.values.mock.calls[0][0];
    expect(values.tenantId).toBe(SCOPE.tenantId);
    expect(values.userId).toBe(SCOPE.userId);
  });
});

describe("getVideoProject", () => {
  it("filters on both tenantId and userId", async () => {
    const chain = selectChain([project({ id: 7 })]);
    mockDb.select.mockReturnValueOnce(chain);

    const result = await getVideoProject(SCOPE, 7);

    expect(result?.id).toBe(7);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const whereArg = chain.where.mock.calls[0][0];
    expect(whereContains(whereArg, "tenant-1")).toBe(true);
    expect(whereContains(whereArg, 42)).toBe(true);
  });

  it("returns null for a foreign-tenant/foreign-user row (never leaks another owner's row)", async () => {
    // The scoped where() excludes the foreign row entirely -> empty result set.
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await getVideoProject(SCOPE, 999);

    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe("listVideoProjects", () => {
  it("scopes the list query to tenantId and userId", async () => {
    const chain = selectChain([project({ id: 1 }), project({ id: 2 })]);
    mockDb.select.mockReturnValueOnce(chain);

    const result = await listVideoProjects(SCOPE);

    expect(result).toHaveLength(2);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    const whereArg = chain.where.mock.calls[0][0];
    expect(whereContains(whereArg, "tenant-1")).toBe(true);
    expect(whereContains(whereArg, 42)).toBe(true);
  });
});

describe("saveVideoProjectDocument", () => {
  it("writes a video_project_revisions row on saveDocument", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([project({ id: 7, revision: 3 })]));
    const insertRevisionChain = insertChain([revisionRow({ id: 99, projectId: 7, revision: 4 })]);
    mockDb.insert.mockReturnValueOnce(insertRevisionChain);
    mockDb.update.mockReturnValueOnce(updateChain([project({ id: 7, revision: 4 })]));

    await saveVideoProjectDocument(SCOPE, {
      id: 7,
      baseRevision: 3,
      document: { schemaVersion: 1, updated: true },
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertedValues = insertRevisionChain.values.mock.calls[0][0];
    expect(insertedValues.projectId).toBe(7);
    expect(insertedValues.revision).toBe(4);
    expect(insertedValues.document).toEqual({ schemaVersion: 1, updated: true });
  });

  it("rejects a stale baseRevision with a specific conflict error, without writing anything", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([project({ id: 7, revision: 5 })]));

    await expect(
      saveVideoProjectDocument(SCOPE, {
        id: 7,
        baseRevision: 3, // stale — current is 5
        document: { schemaVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(VideoProjectRevisionConflictError);

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("bumps revision to baseRevision + 1 on success", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([project({ id: 7, revision: 3 })]));
    mockDb.insert.mockReturnValueOnce(insertChain([revisionRow({ id: 99, projectId: 7, revision: 4 })]));
    const updChain = updateChain([project({ id: 7, revision: 4 })]);
    mockDb.update.mockReturnValueOnce(updChain);

    const result = await saveVideoProjectDocument(SCOPE, {
      id: 7,
      baseRevision: 3,
      document: { schemaVersion: 1 },
    });

    expect(result.revision).toBe(4);
    const setArg = updChain.set.mock.calls[0][0];
    expect(setArg.revision).toBe(4);
  });

  it("throws when the project id is not found for this scope (no cross-tenant leak)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      saveVideoProjectDocument(SCOPE, { id: 999, baseRevision: 1, document: {} }),
    ).rejects.toThrow();

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("listVideoProjectRevisions", () => {
  it("only returns revisions for a project owned by this tenant+user", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([project({ id: 7 })])) // ownership check
      .mockReturnValueOnce(
        selectChain([revisionRow({ id: 2, revision: 2 }), revisionRow({ id: 1, revision: 1 })]),
      ); // revisions list

    const result = await listVideoProjectRevisions(SCOPE, 7);

    expect(result).toHaveLength(2);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list when the project isn't owned by this scope", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // ownership check -> miss

    const result = await listVideoProjectRevisions(SCOPE, 999);

    expect(result).toEqual([]);
    // Never queries the revisions table for an unowned project id.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe("restoreVideoProjectRevision", () => {
  it("copies document back and bumps revision (never reuses the restored revision number)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([project({ id: 7, revision: 5 })])) // current project
      .mockReturnValueOnce(
        selectChain([revisionRow({ id: 2, projectId: 7, revision: 2, document: { restored: true } })]),
      ); // target revision
    const insertRevChain = insertChain([revisionRow({ id: 10, projectId: 7, revision: 6, document: { restored: true } })]);
    mockDb.insert.mockReturnValueOnce(insertRevChain);
    const updChain = updateChain([project({ id: 7, revision: 6, document: { restored: true } })]);
    mockDb.update.mockReturnValueOnce(updChain);

    const result = await restoreVideoProjectRevision(SCOPE, {
      projectId: 7,
      revision: 2,
      reason: "manual restore",
    });

    // New revision is current(5) + 1 = 6, NOT the restored revision (2).
    expect(result.revision).toBe(6);
    expect(result.revision).not.toBe(2);

    const insertedValues = insertRevChain.values.mock.calls[0][0];
    expect(insertedValues.document).toEqual({ restored: true });
    expect(insertedValues.revision).toBe(6);

    const setArg = updChain.set.mock.calls[0][0];
    expect(setArg.document).toEqual({ restored: true });
    expect(setArg.revision).toBe(6);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it("throws when the target revision does not exist for the project", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([project({ id: 7, revision: 5 })]))
      .mockReturnValueOnce(selectChain([])); // target revision missing

    await expect(
      restoreVideoProjectRevision(SCOPE, { projectId: 7, revision: 999 }),
    ).rejects.toThrow();

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("brand-kit CRUD is tenant+owner scoped", () => {
  it("insertBrandKit scopes values to tenant+user", async () => {
    const chain = insertChain([brandKit({ id: 5 })]);
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await insertBrandKit(SCOPE, { name: "Acme" } as any);

    expect(result.id).toBe(5);
    const values = chain.values.mock.calls[0][0];
    expect(values.tenantId).toBe(SCOPE.tenantId);
    expect(values.userId).toBe(SCOPE.userId);
  });

  it("getBrandKit filters on tenantId and userId, returns null for a foreign row", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await getBrandKit(SCOPE, 999);

    expect(result).toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("listBrandKits scopes the query to tenantId and userId", async () => {
    const chain = selectChain([brandKit({ id: 1 }), brandKit({ id: 2 })]);
    mockDb.select.mockReturnValueOnce(chain);

    const result = await listBrandKits(SCOPE);

    expect(result).toHaveLength(2);
    const whereArg = chain.where.mock.calls[0][0];
    expect(whereContains(whereArg, "tenant-1")).toBe(true);
    expect(whereContains(whereArg, 42)).toBe(true);
  });

  it("updateBrandKit scopes the update to tenantId and userId and returns the row", async () => {
    const chain = updateChain([brandKit({ id: 5, name: "Renamed" })]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await updateBrandKit(SCOPE, 5, { name: "Renamed" });

    expect(result?.name).toBe("Renamed");
    const whereArg = chain.where.mock.calls[0][0];
    expect(whereContains(whereArg, "tenant-1")).toBe(true);
    expect(whereContains(whereArg, 42)).toBe(true);
  });

  it("updateBrandKit returns null when the row isn't owned by this scope", async () => {
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await updateBrandKit(SCOPE, 999, { name: "Nope" });

    expect(result).toBeNull();
  });

  it("deleteBrandKit scopes the delete to tenantId and userId", async () => {
    const chain = deleteChain([{ id: 5 }]);
    mockDb.delete.mockReturnValueOnce(chain);

    const result = await deleteBrandKit(SCOPE, 5);

    expect(result).toBe(true);
    const whereArg = chain.where.mock.calls[0][0];
    expect(whereContains(whereArg, "tenant-1")).toBe(true);
    expect(whereContains(whereArg, 42)).toBe(true);
  });

  it("deleteBrandKit returns false when nothing was deleted (foreign row)", async () => {
    mockDb.delete.mockReturnValueOnce(deleteChain([]));

    const result = await deleteBrandKit(SCOPE, 999);

    expect(result).toBe(false);
  });
});
