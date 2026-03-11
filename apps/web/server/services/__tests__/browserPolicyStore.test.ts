import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

function createDbMock(responses: Array<unknown>) {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const next = responses.shift();
        const run = () => {
          if (next instanceof Error) {
            return Promise.reject(next);
          }
          return Promise.resolve(next ?? []);
        };

        return {
          limit: vi.fn(run),
          orderBy: vi.fn(run),
        };
      }),
    })),
  }));

  return { db: { select } };
}

describe("browserPolicyStore.loadTenantBrowserPolicyConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetDb.mockReset();
  });

  it("falls back to seeded config when tenant browser policy schema is missing", async () => {
    const schemaError = Object.assign(
      new Error('column "metadata" does not exist'),
      { code: "42703" },
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetDb.mockResolvedValue(createDbMock([schemaError, []]).db);

    const { loadTenantBrowserPolicyConfig } = await import("../browserPolicyStore");

    const result = await loadTenantBrowserPolicyConfig({
      tenantId: "tenant-1",
      seededConfig: {
        allowedDomains: ["example.com"],
        visionModel: "gpt-4o-mini",
      },
    });

    expect(result.source).toBe("seeded");
    expect(result.storageStatus).toBe("schema_missing");
    expect(result.rules).toEqual([]);
    expect(result.metadata).toEqual({});
    expect(result.config).toMatchObject({
      allowedDomains: ["example.com"],
      visionModel: "gpt-4o-mini",
      seededDefault: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[BrowserPolicy] Tenant policy schema not ready, falling back to seeded config",
      expect.objectContaining({
        tenantId: "tenant-1",
      }),
    );

    warnSpy.mockRestore();
  });

  it("rethrows non-schema database errors", async () => {
    const dbError = new Error("connection terminated unexpectedly");
    mockGetDb.mockResolvedValue(createDbMock([dbError, []]).db);

    const { loadTenantBrowserPolicyConfig } = await import("../browserPolicyStore");

    await expect(
      loadTenantBrowserPolicyConfig({
        tenantId: "tenant-1",
        seededConfig: {
          allowedDomains: ["example.com"],
        },
      }),
    ).rejects.toThrow("connection terminated unexpectedly");
  });
});
