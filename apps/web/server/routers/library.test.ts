import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateLibraryItem,
  mockGetLibraryItemById,
  mockGetLibraryMarkdownContent,
  mockListLibraryDocuments,
  mockSaveLibraryMarkdown,
  mockSearchLibraryItems,
  mockUpdateLibraryItem,
  mockSoftDeleteLibraryItem,
  mockShareLibraryItem,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockCreateLibraryItem: vi.fn(),
  mockGetLibraryItemById: vi.fn(),
  mockGetLibraryMarkdownContent: vi.fn(),
  mockListLibraryDocuments: vi.fn(),
  mockSaveLibraryMarkdown: vi.fn(),
  mockSearchLibraryItems: vi.fn(),
  mockUpdateLibraryItem: vi.fn(),
  mockSoftDeleteLibraryItem: vi.fn(),
  mockShareLibraryItem: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../services/libraryService", () => ({
  createLibraryItem: mockCreateLibraryItem,
  getLibraryItemById: mockGetLibraryItemById,
  getLibraryMarkdownContent: mockGetLibraryMarkdownContent,
  listLibraryDocuments: mockListLibraryDocuments,
  saveLibraryMarkdown: mockSaveLibraryMarkdown,
  searchLibraryItems: mockSearchLibraryItems,
  updateLibraryItem: mockUpdateLibraryItem,
  softDeleteLibraryItem: mockSoftDeleteLibraryItem,
  shareLibraryItem: mockShareLibraryItem,
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
