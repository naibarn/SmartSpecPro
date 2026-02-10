import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateLibraryItem,
  mockGetLibraryItemById,
  mockUpdateLibraryItem,
  mockSoftDeleteLibraryItem,
  mockShareLibraryItem,
} = vi.hoisted(() => ({
  mockCreateLibraryItem: vi.fn(),
  mockGetLibraryItemById: vi.fn(),
  mockUpdateLibraryItem: vi.fn(),
  mockSoftDeleteLibraryItem: vi.fn(),
  mockShareLibraryItem: vi.fn(),
}));

vi.mock("../services/libraryService", () => ({
  createLibraryItem: mockCreateLibraryItem,
  getLibraryItemById: mockGetLibraryItemById,
  updateLibraryItem: mockUpdateLibraryItem,
  softDeleteLibraryItem: mockSoftDeleteLibraryItem,
  shareLibraryItem: mockShareLibraryItem,
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
