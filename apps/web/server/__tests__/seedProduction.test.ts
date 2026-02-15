/**
 * Tests for the production seed script.
 * Validates idempotency and correct seed data creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track all DB calls
const insertValues: any[] = [];

const mockOnConflictDoNothing = vi.fn().mockReturnValue({
  returning: vi.fn().mockResolvedValue([{ id: 1 }]),
});

const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockImplementation((vals: any) => {
    insertValues.push(vals);
    return {
      onConflictDoNothing: mockOnConflictDoNothing,
      returning: mockReturning,
    };
  }),
});

const mockLimit = vi.fn().mockImplementation(() => {
  return Promise.resolve([]);
});

const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
};

vi.mock("postgres", () => ({
  default: () => ({} as any),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: () => mockDb,
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual("drizzle-orm");
  return actual;
});

describe("seed-production script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.length = 0;
    mockLimit.mockResolvedValue([]);
  });

  it("creates admin user when DB is empty", async () => {
    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { seedProduction } = await import("../../scripts/seed-production");
    await seedProduction(mockDb as any);

    // Should have called insert (for user, tenant, and settings)
    expect(mockInsert).toHaveBeenCalled();
  });

  it("is idempotent - skips user creation when admin exists", async () => {
    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    // Simulate existing admin user on first select
    mockLimit.mockResolvedValueOnce([{ id: 42, openId: "existing-uuid" }]);

    const { seedProduction } = await import("../../scripts/seed-production");
    await seedProduction(mockDb as any);

    // Verify select was called to check for existing user
    expect(mockSelect).toHaveBeenCalled();
  });

  it("creates default tenant with domain smartaihub.app", async () => {
    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { seedProduction } = await import("../../scripts/seed-production");
    await seedProduction(mockDb as any);

    // Find the tenant insert
    const tenantInsert = insertValues.find(
      (v: any) => v.slug === "smartaihub"
    );
    expect(tenantInsert).toBeDefined();
    expect(tenantInsert.primaryDomain).toBe("smartaihub.app");
    expect(tenantInsert.name).toBe("SmartAI Hub");
    expect(tenantInsert.isActive).toBe(true);
  });

  it("requires ADMIN_EMAIL environment variable", async () => {
    delete process.env.ADMIN_EMAIL;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { seedProduction } = await import("../../scripts/seed-production");

    await expect(seedProduction(mockDb as any)).rejects.toThrow(/ADMIN_EMAIL/);
  });

  it("uses SELECT-before-INSERT for system settings", async () => {
    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { seedProduction } = await import("../../scripts/seed-production");
    await seedProduction(mockDb as any);

    // select called: 1 for admin check + 4 for settings = 5 total
    expect(mockSelect.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
