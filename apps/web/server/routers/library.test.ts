import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateLibraryItem,
  mockGetLibraryItemById,
  mockGetLibraryMarkdownContent,
  mockGetUserEffectivePermission,
  mockListLibraryDocuments,
  mockSaveLibraryMarkdown,
  mockSearchLibraryItems,
  mockUploadLibraryFile,
  mockUpdateLibraryItem,
  mockSoftDeleteLibraryItem,
  mockShareLibraryItem,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockCreateLibraryItem: vi.fn(),
  mockGetLibraryItemById: vi.fn(),
  mockGetLibraryMarkdownContent: vi.fn(),
  mockGetUserEffectivePermission: vi.fn(),
  mockListLibraryDocuments: vi.fn(),
  mockSaveLibraryMarkdown: vi.fn(),
  mockSearchLibraryItems: vi.fn(),
  mockUploadLibraryFile: vi.fn(),
  mockUpdateLibraryItem: vi.fn(),
  mockSoftDeleteLibraryItem: vi.fn(),
  mockShareLibraryItem: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../services/libraryService", () => ({
  createLibraryItem: mockCreateLibraryItem,
  getLibraryItemById: mockGetLibraryItemById,
  getLibraryMarkdownContent: mockGetLibraryMarkdownContent,
  getUserEffectivePermission: mockGetUserEffectivePermission,
  listLibraryDocuments: mockListLibraryDocuments,
  saveLibraryMarkdown: mockSaveLibraryMarkdown,
  searchLibraryItems: mockSearchLibraryItems,
  uploadLibraryFile: mockUploadLibraryFile,
  updateLibraryItem: mockUpdateLibraryItem,
  softDeleteLibraryItem: mockSoftDeleteLibraryItem,
  shareLibraryItem: mockShareLibraryItem,
  LibraryMarkdownVersionConflictError: class extends Error {
    currentUpdatedAt: Date;
    constructor(msg: string, currentUpdatedAt: Date) {
      super(msg);
      this.name = "LibraryMarkdownVersionConflictError";
      this.currentUpdatedAt = currentUpdatedAt;
    }
  },
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

import { libraryRouter } from "./library";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.LIBRARY_ENABLED;
  delete process.env.LIBRARY_ENABLED_TENANTS;
});

describe("libraryRouter.createItem", () => {
  it("passes resolved actor context to service", async () => {
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 1, title: "Demo" },
      idempotent: false,
    });

    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        itemType: "image",
        source: "media_history",
        title: "Demo",
      },
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Demo" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "library_mutation",
        endpoint: "library.createItem",
      }),
    );
  });

  it("rejects missing tenant context", async () => {
    const fn = libraryRouter.createItem as Function;

    await expect(
      fn({
        ctx: {
          user: { id: 9, role: "user", currentTenantId: null },
          tenantId: null,
        },
        input: {
          itemType: "image",
          source: "media_history",
          title: "Demo",
        },
      }),
    ).rejects.toThrow("Tenant context is required");
  });

  it("falls back to numeric user tenant when ctx tenant is string in mixed schema", async () => {
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 11, title: "Demo" },
      idempotent: false,
    });

    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: "tenant-ZCSKEM9s" as any,
      },
      input: {
        itemType: "image",
        source: "media_history",
        title: "Demo",
      },
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 44 }),
    );
  });

  it("prefers numeric ctx tenant when user tenant is non-numeric string", async () => {
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 13, title: "Demo" },
      idempotent: false,
    });

    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: "tenant-ZCSKEM9s" as any },
        tenantId: 44 as any,
      },
      input: {
        itemType: "image",
        source: "media_history",
        title: "Demo",
      },
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 44 }),
    );
  });

  it("uses ctx string tenant when user tenant is missing", async () => {
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 12, title: "Demo" },
      idempotent: false,
    });

    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: null },
        tenantId: "tenant-ZCSKEM9s" as any,
      },
      input: {
        itemType: "image",
        source: "media_history",
        title: "Demo",
      },
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "tenant-ZCSKEM9s" }),
    );
  });

  it("prefers request tenant when both ctx/user tenants are strings", async () => {
    mockCreateLibraryItem.mockResolvedValue({
      item: { id: 14, title: "Demo" },
      idempotent: false,
    });

    const fn = libraryRouter.createItem as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: "tenant-legacy" as any },
        tenantId: "tenant-request" as any,
      },
      input: {
        itemType: "image",
        source: "media_history",
        title: "Demo",
      },
    });

    expect(mockCreateLibraryItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 9,
        tenantId: "tenant-request",
      }),
    );
  });

  it("rejects when library feature is disabled", async () => {
    process.env.LIBRARY_ENABLED = "false";
    const fn = libraryRouter.createItem as Function;

    await expect(
      fn({
        ctx: {
          user: { id: 9, role: "user", currentTenantId: 44 },
          tenantId: null,
        },
        input: {
          itemType: "image",
          source: "media_history",
          title: "Demo",
        },
      }),
    ).rejects.toThrow("Library feature is disabled");
  });

  it("maps URL validation error to client-safe bad request", async () => {
    const error = new Error("Invalid sourceUrl: URL scheme javascript: is not allowed");
    error.name = "LibraryUrlValidationError";
    mockCreateLibraryItem.mockRejectedValue(error);

    const fn = libraryRouter.createItem as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 9, role: "user", currentTenantId: 44 },
          tenantId: null,
        },
        input: {
          itemType: "image",
          source: "media_history",
          title: "Demo",
          sourceUrl: "javascript:alert(1)",
        },
      }),
    ).rejects.toThrow("Invalid sourceUrl: URL scheme javascript: is not allowed");
  });
});

describe("libraryRouter.search", () => {
  it("returns library_search_v1 payload from service", async () => {
    mockSearchLibraryItems.mockResolvedValue({
      version: "library_search_v1",
      query: "launch",
      total: 1,
      limit: 20,
      offset: 0,
      has_more: false,
      results: [],
    });

    const fn = libraryRouter.search as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        query: "launch",
      },
    });

    expect(result.version).toBe("library_search_v1");
    expect(mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: "launch" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });

  it("passes recentDays filter to search service", async () => {
    mockSearchLibraryItems.mockResolvedValue({
      version: "library_search_v1",
      query: "",
      total: 0,
      limit: 20,
      offset: 0,
      has_more: false,
      results: [],
    });

    const fn = libraryRouter.search as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        filters: {
          recentDays: 7,
        },
      },
    });

    expect(mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          recentDays: 7,
        }),
      }),
      expect.objectContaining({ userId: 9, tenantId: "44" }),
    );
  });
});

describe("libraryRouter.listDocuments", () => {
  it("passes document scope query to service with resolved actor", async () => {
    mockListLibraryDocuments.mockResolvedValue({
      total: 1,
      limit: 20,
      offset: 0,
      has_more: false,
      scope: "my_library",
      results: [],
    });

    const fn = libraryRouter.listDocuments as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        scope: "my_library",
      },
    });

    expect(result.scope).toBe("my_library");
    expect(mockListLibraryDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "my_library" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });

  it("passes recentDays filter to listDocuments service", async () => {
    mockListLibraryDocuments.mockResolvedValue({
      total: 0,
      limit: 20,
      offset: 0,
      has_more: false,
      scope: "all",
      results: [],
    });

    const fn = libraryRouter.listDocuments as Function;
    await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        filters: {
          recentDays: 15,
        },
      },
    });

    expect(mockListLibraryDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          recentDays: 15,
        }),
      }),
      expect.objectContaining({ userId: 9, tenantId: "44" }),
    );
  });
});

describe("libraryRouter.uploadFile", () => {
  it("uploads supported file and creates indexing item", async () => {
    mockUploadLibraryFile.mockResolvedValue({
      item: {
        id: 901,
        tenantId: "44",
        ownerUserId: 9,
        itemType: "image",
        source: "document_upload",
        title: "hero.png",
        description: null,
        status: "indexing",
        visibility: "private",
        metadata: {},
        sourceUrl: "/uploads/test.png",
        thumbnailUrl: "/uploads/test.png",
        deletedAt: null,
        createdAt: new Date("2026-02-11T00:00:00.000Z"),
        updatedAt: new Date("2026-02-11T00:00:00.000Z"),
      },
      indexJob: {
        jobId: 8001,
        status: "pending",
        created: true,
      },
    });

    const fn = libraryRouter.uploadFile as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        fileName: "hero.png",
        fileType: "image/png",
        fileBase64: "data:image/png;base64,aGVsbG8=",
      },
    });

    expect(result.item.id).toBe(901);
    expect(mockUploadLibraryFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "hero.png", fileType: "image/png" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });
});

describe("libraryRouter.saveMarkdown", () => {
  it("saves markdown and returns index job metadata", async () => {
    mockSaveLibraryMarkdown.mockResolvedValue({
      item: {
        id: 5,
        tenantId: "44",
        ownerUserId: 9,
        itemType: "md",
        source: "upload",
        title: "README",
        description: null,
        status: "indexing",
        visibility: "private",
        metadata: {},
        sourceUrl: null,
        thumbnailUrl: null,
        deletedAt: null,
        createdAt: new Date("2026-02-11T00:00:00.000Z"),
        updatedAt: new Date("2026-02-11T00:00:01.000Z"),
      },
      indexJob: {
        jobId: 7001,
        status: "pending",
        created: true,
      },
    });

    const fn = libraryRouter.saveMarkdown as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        id: 5,
        content: "# Updated",
        expectedUpdatedAt: new Date("2026-02-11T00:00:00.000Z"),
      },
    });

    expect(result.indexJob.jobId).toBe(7001);
    expect(mockSaveLibraryMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 5, content: "# Updated" }),
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });
});

describe("libraryRouter.getMarkdownContent", () => {
  it("returns markdown content when item is readable", async () => {
    mockGetLibraryMarkdownContent.mockResolvedValue({
      item_id: 5,
      content: "# Hello",
      updated_at: "2026-02-11T00:00:01.000Z",
    });

    const fn = libraryRouter.getMarkdownContent as Function;
    const result = await fn({
      ctx: {
        user: { id: 9, role: "user", currentTenantId: 44 },
        tenantId: null,
      },
      input: {
        id: 5,
      },
    });

    expect(result.item_id).toBe(5);
    expect(mockGetLibraryMarkdownContent).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ userId: 9, tenantId: 44 }),
    );
  });
});

describe("libraryRouter.getItem", () => {
  it("throws NOT_FOUND when service returns null", async () => {
    mockGetLibraryItemById.mockResolvedValue(null);

    const fn = libraryRouter.getItem as Function;

    await expect(
      fn({
        ctx: {
          user: { id: 4, role: "user", currentTenantId: 2 },
          tenantId: 2,
        },
        input: { id: 123 },
      }),
    ).rejects.toThrow("Library item not found");
  });

  it("returns item with userPermissions when found", async () => {
    mockGetLibraryItemById.mockResolvedValue({ id: 123, title: "Test" });
    mockGetUserEffectivePermission.mockResolvedValue({
      effectivePermissionLevel: "write",
      sources: [{ type: "direct", permissionLevel: "write" }],
    });

    const fn = libraryRouter.getItem as Function;
    const result = await fn({
      ctx: {
        user: { id: 4, role: "user", currentTenantId: 2 },
        tenantId: 2,
      },
      input: { id: 123 },
    });

    expect(result.userPermissions).toEqual({
      effectiveLevel: "write",
      sources: [{ type: "direct", permissionLevel: "write" }],
      canRead: true,
      canWrite: true,
      canDelete: false,
      isOwner: false,
    });
  });
});

describe("libraryRouter.updateItem", () => {
  it("maps URL validation error to client-safe bad request", async () => {
    const error = new Error("Invalid thumbnailUrl: URL scheme file: is not allowed");
    error.name = "LibraryUrlValidationError";
    mockUpdateLibraryItem.mockRejectedValue(error);

    const fn = libraryRouter.updateItem as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 4, role: "user", currentTenantId: 2 },
          tenantId: 2,
        },
        input: {
          id: 123,
          thumbnailUrl: "file:///etc/passwd",
        },
      }),
    ).rejects.toThrow("Invalid thumbnailUrl: URL scheme file: is not allowed");
  });
});

describe("libraryRouter.deleteItem", () => {
  it("blocks non-admin users from deleting presentation templates", async () => {
    mockGetLibraryItemById.mockResolvedValue({
      id: 900,
      ownerUserId: 11,
      itemType: "presentation",
      source: "presentation_template",
      metadata: { is_template: true },
    });

    const fn = libraryRouter.deleteItem as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 4, role: "user", currentTenantId: 2 },
          tenantId: 2,
        },
        input: { id: 900 },
      }),
    ).rejects.toThrow("Only admin can delete presentation templates");
    expect(mockSoftDeleteLibraryItem).not.toHaveBeenCalled();
  });

  it("allows admin users to delete presentation templates", async () => {
    mockGetLibraryItemById.mockResolvedValue({
      id: 901,
      ownerUserId: 11,
      itemType: "presentation",
      source: "presentation_template",
      metadata: { is_template: true },
    });
    mockSoftDeleteLibraryItem.mockResolvedValue(true);

    const fn = libraryRouter.deleteItem as Function;
    const result = await fn({
      ctx: {
        user: { id: 1, role: "admin", currentTenantId: 2 },
        tenantId: 2,
      },
      input: { id: 901 },
    });

    expect(result).toEqual({ success: true });
    expect(mockSoftDeleteLibraryItem).toHaveBeenCalledWith(
      901,
      expect.objectContaining({ userId: 1, tenantId: "2", role: "admin" }),
    );
  });
});

describe("libraryRouter.shareItem", () => {
  it("returns success when permission share is applied", async () => {
    mockShareLibraryItem.mockResolvedValue(true);

    const fn = libraryRouter.shareItem as Function;
    const result = await fn({
      ctx: {
        user: { id: 4, role: "admin", currentTenantId: 2 },
        tenantId: 2,
      },
      input: {
        itemId: 123,
        subjectType: "user",
        subjectId: "55",
        permissionLevel: "read",
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockShareLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 123 }),
      expect.objectContaining({ userId: 4, tenantId: 2, role: "admin" }),
    );
  });
});

// ── New ShareFile procedures (section-05) ──

describe("libraryRouter.removeShare", () => {
  it.todo("removes share when actor has delete permission");
  it.todo("rejects when actor has only read/write permission");
  it.todo("throws NOT_FOUND for non-existent share");
  it.todo("logs audit event on success");
});

describe("libraryRouter.updateSharePermission", () => {
  it.todo("updates permission level when actor has manage permission");
  it.todo("rejects when actor lacks delete/owner permission");
  it.todo("throws NOT_FOUND for non-existent share");
  it.todo("logs audit event on success");
});

describe("libraryRouter.getItemShares", () => {
  it.todo("returns share list with resolved user names");
  it.todo("returns share list with resolved group names");
  it.todo("returns tenant_role shares with roleName");
  it.todo("rejects when actor has no permission on item");
});

describe("libraryRouter.listTrash", () => {
  it.todo("returns owner's deleted items with pagination");
  it.todo("calculates daysInTrash and daysUntilPurge correctly");
  it.todo("returns empty list when no trashed items");
  it.todo("applies default limit and offset");
});

describe("libraryRouter.restoreFromTrash", () => {
  it.todo("restores item when actor is the owner");
  it.todo("restores item when actor is the deleter");
  it.todo("rejects when actor is neither owner nor deleter");
  it.todo("throws NOT_FOUND for non-trashed item");
  it.todo("clears deletedAt and deletedBy, sets status to ready");
  it.todo("logs audit event on success");
});

describe("libraryRouter.permanentDelete", () => {
  it.todo("hard deletes item and cascades chunks + permissions for owner");
  it.todo("allows admin to purge items 90+ days in trash");
  it.todo("rejects non-owner non-admin permanent delete");
  it.todo("rejects admin for items < 90 days in trash");
  it.todo("throws NOT_FOUND for non-trashed item");
  it.todo("logs audit event with daysInTrash");
});
