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
  storageDelete: vi.fn().mockResolvedValue(true),
}));

vi.mock("./groupsService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./groupsService")>();
  return {
    ...orig,
    getUserGroups: vi.fn().mockResolvedValue([]),
  };
});

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

  it("normalizes markdown-fenced prompt values", () => {
    const normalized = normalizeLibraryMetadata({
      prompt: "```json\n{\n  \"prompt\": \"A soft portrait\"\n}\n```",
    });

    expect(normalized).toEqual({
      prompt: "{\n  \"prompt\": \"A soft portrait\"\n}",
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

  it("preserves primary write success when enqueue fails transiently", async () => {
    mockStoragePut.mockResolvedValueOnce({
      key: "library/uploads/t-1/9/file.txt",
      url: "https://cdn.example.com/file.txt",
    });

    const now = new Date("2026-02-10T00:00:00.000Z");
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([], true))
      .mockReturnValueOnce(makeSelectChain([]));

    const insertLibraryItemValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 901,
          tenantId: "44",
          ownerUserId: 9,
          itemType: "text",
          source: "document_upload",
          title: "file.txt",
          description: null,
          status: "indexing",
          visibility: "private",
          metadata: {},
          sourceUrl: "https://cdn.example.com/file.txt",
          thumbnailUrl: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    });

    const insertLibraryLinkValues = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });

    const enqueueValues = vi.fn().mockImplementation(() => {
      throw new Error("queue timeout");
    });

    mockDb.insert
      .mockReturnValueOnce({ values: insertLibraryItemValues })
      .mockReturnValueOnce({ values: insertLibraryLinkValues })
      .mockReturnValueOnce({ values: enqueueValues });

    const result = await uploadLibraryFile(
      {
        fileName: "file.txt",
        fileType: "text/plain",
        fileBase64: Buffer.from("hello world", "utf8").toString("base64"),
      },
      {
        userId: 9,
        tenantId: 44,
        role: "user",
      },
    );

    expect(result.item.id).toBe(901);
    expect(result.indexJob.created).toBe(false);
    expect(result.indexJob.status).toBe("enqueue_error");
    expect(result.indexJob.error).toContain("queue timeout");
  });
});

// Section 03: Group Permissions Tests
describe("libraryService - Group Permissions", () => {
  describe("rankPermissionLevel", () => {
    it.todo("returns correct rank for read (1)");
    it.todo("returns correct rank for write (2)");
    it.todo("returns correct rank for delete (3)");
    it.todo("returns correct rank for owner (4)");
  });

  describe("canManageLibraryItem", () => {
    it.todo("returns true for owner permission level");
    it.todo("returns true for delete permission level");
    it.todo("returns false for write permission level");
    it.todo("returns false for read permission level");
  });

  describe("getUserEffectivePermission", () => {
    it.todo("includes group permissions in resolution");
    it.todo("returns highest permission level when multiple sources exist");
    it.todo("returns all permission sources in sources array");
    it.todo("includes direct user share in sources");
    it.todo("includes group share in sources with groupName");
    it.todo("returns null when user has no access");
    it.todo("handles user in multiple groups with different permissions");
    it.todo("prioritizes owner over all other sources");
    it.todo("prioritizes delete over write/read");
  });

  describe("shareLibraryItem", () => {
    it.todo("creates permission for subjectType = group");
    it.todo("validates group exists before creating permission");
    it.todo("validates group is in same tenant as item");
    it.todo("rejects when actor lacks delete or owner permission");
    it.todo("rejects when group is from different tenant (cross-tenant isolation)");
  });

  describe("softDeleteLibraryItem", () => {
    it.todo("sets deletedAt timestamp");
    it.todo("sets deletedBy to actor.userId");
    it.todo("existing soft deletes remain functional after update");
  });

  describe("searchLibraryWithPermissions", () => {
    it.todo("includes files shared via group permissions");
    it.todo("excludes deleted files (deletedAt IS NOT NULL)");
    it.todo("filters by owner, direct share, group share, role share, and public");
    it.todo("handles user with no groups gracefully");
    it.todo("applies group permissions for user in multiple groups");
  });
});

describe("libraryService - Pre-requisite Refactoring", () => {
  it.todo("hasTenantRoleShare (renamed from hasGroupShare) works with existing data");
  it.todo("tenantRoleMatches (renamed from groupMatches) filters correctly");
  it.todo("no references to old hasGroupShare function remain");
  it.todo("no references to old groupMatches function remain");
});

// Section 10: Caching & Performance Tests
describe("libraryService - Batch Permission Checks", () => {
  describe("getLibraryItemShares batching", () => {
    it.todo("resolves user and group names in batch queries instead of N+1");
  });

  describe("listLibraryDocuments group permissions", () => {
    it.todo("includes group permissions in batch permission query");
  });

  describe("searchLibraryItems group permissions", () => {
    it.todo("passes group IDs to getPermissionLevelForItem for correct resolution");
  });
});

describe("libraryService - Permission Resolution", () => {
  // Test getPermissionLevelForItem with group support
  // These functions are internal but tested via canReadLibraryItem

  describe("canReadLibraryItem", () => {
    it("allows admin to read any item in tenant", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t1", role: "admin" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows owner to read own item", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 42, visibility: "private" },
        { userId: 42, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows reading with permission level from group share", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t1", role: "user" },
        "read",
      );
      expect(result).toBe(true);
    });

    it("rejects cross-tenant access", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "private" },
        { userId: 99, tenantId: "t2", role: "admin" },
        "owner",
      );
      expect(result).toBe(false);
    });

    it("allows reading public items without permission", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "public" },
        { userId: 99, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });

    it("allows reading team items without permission", () => {
      const result = canReadLibraryItem(
        { tenantId: "t1", ownerUserId: 1, visibility: "team" },
        { userId: 99, tenantId: "t1", role: "user" },
        null,
      );
      expect(result).toBe(true);
    });
  });
});
