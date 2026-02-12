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

const { mockStoragePut } = vi.hoisted(() => ({
  mockStoragePut: vi.fn(),
}));

vi.mock("../storage", () => ({
  storagePut: mockStoragePut,
}));

import {
  LibraryUrlValidationError,
  canReadLibraryItem,
  createLibraryItem,
  getLibraryItemById,
  normalizeLibraryMetadata,
  uploadLibraryFile,
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

  it("rejects unsafe sourceUrl with deterministic validation error", async () => {
    await expect(
      createLibraryItem(
        {
          itemType: "image",
          source: "media_history",
          title: "Unsafe",
          sourceUrl: "javascript:alert(1)",
        },
        {
          userId: 42,
          tenantId: 5,
          role: "user",
        },
      ),
    ).rejects.toMatchObject({
      name: "LibraryUrlValidationError",
      field: "sourceUrl",
      reason: "blocked_scheme",
      message: "Invalid sourceUrl: URL scheme javascript: is not allowed",
    } satisfies Partial<LibraryUrlValidationError>);

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("persists normalized sourceUrl and thumbnailUrl values", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const valuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 88,
          tenantId: "5",
          ownerUserId: 42,
          itemType: "image",
          source: "media_history",
          title: "Normalized",
          description: null,
          status: "ready",
          visibility: "private",
          metadata: {},
          sourceUrl: "https://cdn.example.com/a.png",
          thumbnailUrl: "/uploads/thumb.png",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });
    mockDb.insert.mockReturnValueOnce({
      values: valuesMock,
    });

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Normalized",
        sourceUrl: " https://cdn.example.com/a.png ",
        thumbnailUrl: " /uploads/thumb.png ",
      },
      {
        userId: 42,
        tenantId: 5,
        role: "user",
      },
    );

    expect(result.item.sourceUrl).toBe("https://cdn.example.com/a.png");
    expect(result.item.thumbnailUrl).toBe("/uploads/thumb.png");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/a.png",
        thumbnailUrl: "/uploads/thumb.png",
      }),
    );
  });

  it("keeps string tenant id and numeric owner user id aligned on insert", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const valuesMock = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 89,
          tenantId: "tenant-ZCSKEM9s",
          ownerUserId: 42,
          itemType: "image",
          source: "media_history",
          title: "Tenant String",
          description: null,
          status: "ready",
          visibility: "private",
          metadata: {},
          sourceUrl: null,
          thumbnailUrl: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });
    mockDb.insert.mockReturnValueOnce({
      values: valuesMock,
    });

    const result = await createLibraryItem(
      {
        itemType: "image",
        source: "media_history",
        title: "Tenant String",
      },
      {
        userId: 42,
        tenantId: "tenant-ZCSKEM9s",
        role: "user",
      },
    );

    expect(result.item.tenantId).toBe("tenant-ZCSKEM9s");
    expect(result.item.ownerUserId).toBe(42);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-ZCSKEM9s",
        ownerUserId: 42,
      }),
    );
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

  it("rejects unsafe thumbnailUrl updates before DB write", async () => {
    const now = new Date("2026-02-10T00:00:00.000Z");
    const existingItem = {
      id: 19,
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
      .mockReturnValueOnce(makeSelectChain([{ permissionLevel: "owner" }]));

    await expect(
      updateLibraryItem(
        19,
        { thumbnailUrl: "file:///etc/passwd" },
        {
          userId: 10,
          tenantId: 7,
          role: "user",
        },
      ),
    ).rejects.toMatchObject({
      name: "LibraryUrlValidationError",
      field: "thumbnailUrl",
      reason: "blocked_scheme",
    } satisfies Partial<LibraryUrlValidationError>);

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("uploadLibraryFile", () => {
  it("rejects unsafe svg payload before persisting", async () => {
    const unsafeSvg = Buffer.from(`<svg><script>alert(1)</script></svg>`, "utf8").toString("base64");
    await expect(
      uploadLibraryFile(
        {
          fileName: "unsafe.svg",
          fileType: "image/svg+xml",
          fileBase64: unsafeSvg,
        },
        {
          userId: 9,
          tenantId: 44,
          role: "user",
        },
      ),
    ).rejects.toThrow("Unsafe SVG content is not allowed");

    expect(mockStoragePut).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
