import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockDb } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
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
  createLibraryItem: vi.fn(),
  getLibraryItemById: vi.fn(),
  getUserEffectivePermission: vi.fn(),
  updateLibraryItem: vi.fn(),
}));

vi.mock("./libraryService", () => ({
  createLibraryItem: libraryServiceMocks.createLibraryItem,
  getLibraryItemById: libraryServiceMocks.getLibraryItemById,
  getUserEffectivePermission: libraryServiceMocks.getUserEffectivePermission,
  updateLibraryItem: libraryServiceMocks.updateLibraryItem,
}));

import {
  createLibraryCanvasBoard,
  getLibraryCanvasBoard,
} from "./libraryCanvasService";

function makeSelectWithLimit(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
});

describe("libraryCanvasService", () => {
  it("creates durable canvas boards as library-managed records", async () => {
    libraryServiceMocks.createLibraryItem.mockResolvedValue({
      item: {
        id: 301,
      },
    });
    libraryServiceMocks.getLibraryItemById.mockResolvedValue({
      id: 301,
      itemType: "canvas_board",
      title: "Strategy Canvas",
      description: "Q2 mapping",
      visibility: "private",
      updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    });
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([
        {
          content: JSON.stringify({
            version: "v1",
            nodes: [{ id: "n1", type: "note", x: 0, y: 0 }],
            edges: [],
          }),
        },
      ]),
    );

    const result = await createLibraryCanvasBoard(
      {
        title: "Strategy Canvas",
        description: "Q2 mapping",
        visibility: "private",
        board: {
          version: "v1",
          nodes: [{ id: "n1", type: "note", x: 0, y: 0 }],
          edges: [],
        },
      },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result).toMatchObject({
      itemId: 301,
      title: "Strategy Canvas",
    });
  });

  it("reopens persisted canvas board JSON safely", async () => {
    libraryServiceMocks.getLibraryItemById.mockResolvedValue({
      id: 302,
      itemType: "canvas_board",
      title: "Canvas",
      description: null,
      visibility: "team",
      updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    });
    mockDb.select.mockReturnValueOnce(
      makeSelectWithLimit([
        {
          content: JSON.stringify({
            version: "v1",
            nodes: [{ id: "n1", type: "evidence", x: 10, y: 20 }],
            edges: [],
          }),
        },
      ]),
    );

    const result = await getLibraryCanvasBoard(
      { itemId: 302 },
      { userId: 5, tenantId: "tenant-1", role: "user" },
    );

    expect(result.board.nodes).toEqual([
      expect.objectContaining({
        id: "n1",
        type: "evidence",
      }),
    ]);
  });
});
