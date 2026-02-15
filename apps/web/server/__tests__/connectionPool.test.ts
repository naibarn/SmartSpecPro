/**
 * Tests for database connection pooling configuration.
 * Validates that pool size is configurable via environment variables.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("connection pooling configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("DB client respects max pool size configuration", async () => {
    // Mock postgres module to capture constructor options
    let capturedOptions: any = null;
    vi.doMock("postgres", () => ({
      default: (url: string, opts?: any) => {
        capturedOptions = opts;
        return {} as any;
      },
    }));

    // Set environment
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.DB_POOL_SIZE = "3";

    // Re-import to get fresh module with mocks
    const { getDb } = await import("../db");
    await getDb();

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.max).toBe(3);
  });

  it("DB client uses default pool size of 5 when env not set", async () => {
    let capturedOptions: any = null;
    vi.doMock("postgres", () => ({
      default: (url: string, opts?: any) => {
        capturedOptions = opts;
        return {} as any;
      },
    }));

    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    delete process.env.DB_POOL_SIZE;

    const { getDb } = await import("../db");
    await getDb();

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.max).toBe(5);
  });

  it("DB client sets idle_timeout and connect_timeout", async () => {
    let capturedOptions: any = null;
    vi.doMock("postgres", () => ({
      default: (url: string, opts?: any) => {
        capturedOptions = opts;
        return {} as any;
      },
    }));

    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { getDb } = await import("../db");
    await getDb();

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.idle_timeout).toBeDefined();
    expect(capturedOptions.connect_timeout).toBeDefined();
  });
});
