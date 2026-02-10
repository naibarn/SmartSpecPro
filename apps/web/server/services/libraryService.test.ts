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

import {
  canReadLibraryItem,
  createLibraryItem,
  getLibraryItemById,
  normalizeLibraryMetadata,
  updateLibraryItem,
} from "./libraryService";

function makeSelectChain(rows: any[], withJoin = false) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });

  const fromResult: any = {
    where: whereMock,
  };

  if (withJoin) {
    fromResult.innerJoin = vi.fn().mockReturnValue({ where: whereMock });
  }

  return {
    from: vi.fn().mockReturnValue(fromResult),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(mockDb);
});

describe("normalizeLibraryMetadata", () => {
  it("normalizes metadata into consistent shape", () => {
    const normalized = normalizeLibraryMetadata({
      tags: [" video ", "video", " product "],
      providerName: "  kie.ai  ",
      ignoredNull: null,
      score: 0.8,
    });

    expect(normalized).toEqual({
      providerName: "kie.ai",
      score: 0.8,
      tags: ["video", "product"],
    });
  });
});

describe("ACL helpers", () => {
  it("rejects unauthorized read for private item", () => {
    const allowed = canReadLibraryItem(
      {
        tenantId: 10,
        ownerUserId: 1,
        visibility: "private",
      },
      {
        userId: 999,
        tenantId: 10,
        role: "user",
      },
      null,
    );

    expect(allowed).toBe(false);
  });
});

describe("createLibraryItem", () => {
  it("returns idempotent result when duplicate source link already exists", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 77,
      tenantId: 5,
      ownerUserId: 42,
      itemType: "image",
      source: "media_history",
      title: "Existing",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ item: existingItem }], true));

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Should be idempotent",
        sourceLink: {
          linkType: "media_task",
          linkId: "task-123",
        },
      },
      {
        userId: 42,
        tenantId: 5,
        role: "user",
      },
    );

    expect(result.idempotent).toBe(true);
    expect(result.item.id).toBe(77);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("tenant boundaries", () => {
  it("does not return item outside tenant scope", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const item = await getLibraryItemById(123, {
      userId: 1,
      tenantId: 99,
      role: "user",
    });

    expect(item).toBeNull();
  });

  it("blocks update when actor lacks owner/permission rights", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 18,
      tenantId: 7,
      ownerUserId: 10,
      itemType: "video",
      source: "media_studio",
      title: "Before",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.select
      .mockReturnValueOnce(makeSelectChain([existingItem]))
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await updateLibraryItem(
      18,
      { title: "After" },
      {
        userId: 100,
        tenantId: 7,
        role: "user",
      },
    );

    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
