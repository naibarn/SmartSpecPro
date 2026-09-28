import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeDb, mockDrizzle } = vi.hoisted(() => {
  const database = {
    delete: vi.fn(),
  };
  return {
    fakeDb: database,
    mockDrizzle: vi.fn(() => database),
  };
});

vi.mock("../../drizzle/schema", () => ({
  users: { id: "users.id" },
  galleryItems: { id: "gallery.id", tenantId: "gallery.tenantId" },
  creditTransactions: {},
  creditPackages: {},
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn((column: unknown) => ({ kind: "asc", column })),
  desc: vi.fn((column: unknown) => ({ kind: "desc", column })),
  and: vi.fn((...conditions: unknown[]) => ({ kind: "and", conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({
    kind: "eq",
    column,
    value,
  })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    kind: "inArray",
    column,
    values,
  })),
  isNull: vi.fn((column: unknown) => ({ kind: "isNull", column })),
  like: vi.fn((column: unknown, value: unknown) => ({
    kind: "like",
    column,
    value,
  })),
  or: vi.fn((...conditions: unknown[]) => ({ kind: "or", conditions })),
  sql: vi.fn(),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mockDrizzle,
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

vi.mock("../_core/env", () => ({ ENV: {} }));

import { deleteGalleryItem } from "../db";

describe("deleteGalleryItem tenant scope", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://gallery-test";
    vi.clearAllMocks();
  });

  it("deletes only the requested row within the current tenant", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 17 }]);
    const where = vi.fn().mockReturnValue({ returning });
    fakeDb.delete.mockReturnValue({ where });

    await deleteGalleryItem(17, "tenant-42");

    expect(where).toHaveBeenCalledWith({
      kind: "and",
      conditions: [
        { kind: "eq", column: "gallery.id", value: 17 },
        { kind: "eq", column: "gallery.tenantId", value: "tenant-42" },
      ],
    });
    expect(returning).toHaveBeenCalled();
  });

  it("targets global and legacy NaN rows when no tenant is present", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 18 }]);
    const where = vi.fn().mockReturnValue({ returning });
    fakeDb.delete.mockReturnValue({ where });

    await deleteGalleryItem(18, null);

    expect(where).toHaveBeenCalledWith({
      kind: "and",
      conditions: [
        { kind: "eq", column: "gallery.id", value: 18 },
        {
          kind: "or",
          conditions: [
            { kind: "isNull", column: "gallery.tenantId" },
            { kind: "eq", column: "gallery.tenantId", value: "NaN" },
          ],
        },
      ],
    });
  });

  it("reports false when the scoped delete matches no row", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    fakeDb.delete.mockReturnValue({ where });

    await expect(deleteGalleryItem(19, "tenant-missing")).resolves.toBe(false);
  });
});
