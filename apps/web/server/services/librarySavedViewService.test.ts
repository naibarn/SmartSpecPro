import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

const libraryServiceMocks = vi.hoisted(() => ({
  listLibraryDocuments: vi.fn(),
}));

vi.mock("./libraryService", () => ({
  listLibraryDocuments: libraryServiceMocks.listLibraryDocuments,
}));

import {
  createLibrarySavedView,
  executeLibrarySavedView,
} from "./librarySavedViewService";

function makeSelectWithLimit(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithOrder(rows: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeSelectWithWhere(rows: any[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
});

describe("librarySavedViewService", () => {
  it("creates a durable saved view with server-side query definitions", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectWithWhere([]));
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 12,
            tenantId: "tenant-1",
            ownerUserId: 5,
            managingGroupId: null,
            slug: "ops-view",
            title: "Ops View",
            description: "Important notes",
            visibilityMode: "private",
            scopeMode: "all",
            queryDefinition: { scope: "all", query: "ops" },
            presentationDefinition: { columns: ["title"], defaultLayout: "table" },
            archivedAt: null,
            createdAt: new Date("2026-04-21T00:00:00.000Z"),
            updatedAt: new Date("2026-04-21T00:00:00.000Z"),
          },
        ]),
      }),
    });

    const result = await createLibrarySavedView(
      {
        title: "Ops View",
        slug: "ops-view",
        visibilityMode: "private",
        scopeMode: "all",
        queryDefinition: {
          scope: "all",
          query: "ops",
        },
        presentationDefinition: {
          columns: ["title"],
          defaultLayout: "table",
        },
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result).toMatchObject({
      id: 12,
      slug: "ops-view",
      title: "Ops View",
    });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("executes saved views through listLibraryDocuments with server-side filters", async () => {
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([
        {
          id: 22,
          tenantId: "tenant-1",
          ownerUserId: 5,
          managingGroupId: null,
          slug: "ops-view",
          title: "Ops View",
          description: null,
          visibilityMode: "private",
          scopeMode: "all",
          queryDefinition: {
            query: "ops",
            scope: "all",
            sort: "updated_desc",
            filters: { itemType: "md" },
          },
          presentationDefinition: { columns: ["title"], defaultLayout: "table" },
          archivedAt: null,
          createdAt: new Date("2026-04-21T00:00:00.000Z"),
          updatedAt: new Date("2026-04-21T00:00:00.000Z"),
        },
      ]),
    );

    libraryServiceMocks.listLibraryDocuments.mockResolvedValue({
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
      scope: "all",
      results: [
        {
          id: 99,
          title: "Ops Runbook",
          item_type: "md",
          status: "ready",
          visibility: "private",
          updated_at: "2026-04-21T00:00:00.000Z",
        },
      ],
    });

    const result = await executeLibrarySavedView(
      {
        ref: { slug: "ops-view" },
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(libraryServiceMocks.listLibraryDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "ops",
        scope: "all",
        filters: { itemType: "md" },
      }),
      expect.objectContaining({
        userId: 5,
        tenantId: "tenant-1",
      }),
      undefined,
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 99,
        title: "Ops Runbook",
      }),
    ]);
  });
});
