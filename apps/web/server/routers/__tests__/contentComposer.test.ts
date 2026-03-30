import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetTenantFeatureFlag: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mocks.mockGetDb,
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mocks.mockGetTenantFeatureFlag,
}));

import { contentComposerRouter } from "../contentComposer";

function createChain(rows: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(async () => rows),
    limit: vi.fn(async () => rows),
    then: vi.fn((resolve: (value: any[]) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
  return chain;
}

function createCaller(role: string = "admin") {
  return contentComposerRouter.createCaller({
    user: {
      id: 42,
      openId: "user-open-id",
      email: "user@example.com",
      name: "Composer",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      currentTenantId: "tenant-1",
    },
    tenantId: "tenant-1",
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: {
      ip: "127.0.0.1",
      headers: {},
      protocol: "https",
    } as any,
    res: {} as any,
  });
}

describe("contentComposerRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetTenantFeatureFlag.mockResolvedValue(true);
  });

  it("lists docs targets with normalized paths", async () => {
    const rows = [
      {
        id: 11,
        title: "Docs Home",
        slug: "home",
        pageKey: "home",
        isPublished: true,
        updatedAt: new Date("2026-03-20T10:00:00.000Z"),
      },
      {
        id: 12,
        title: "API Guide",
        slug: "api-guide",
        pageKey: "docs-api",
        isPublished: false,
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ];
    mocks.mockGetDb.mockResolvedValue({
      select: vi.fn(() => createChain(rows)),
    });

    const caller = createCaller();
    const targets = await caller.listDocsTargets();

    expect(targets).toEqual([
      expect.objectContaining({ id: 11, label: "Docs Home", path: "/", isPublished: true }),
      expect.objectContaining({ id: 12, label: "API Guide", path: "/docs/api-guide", isPublished: false }),
    ]);
  });

  it("lists blog targets with blog paths", async () => {
    const rows = [
      {
        id: 21,
        title: "Launch Plan",
        slug: "launch-plan",
        excerpt: "Roadmap update",
        isPublished: true,
        updatedAt: new Date("2026-03-21T10:00:00.000Z"),
      },
    ];
    mocks.mockGetDb.mockResolvedValue({
      select: vi.fn(() => createChain(rows)),
    });

    const caller = createCaller();
    const targets = await caller.listBlogTargets();

    expect(targets).toEqual([
      expect.objectContaining({ id: 21, label: "Launch Plan", path: "/blog/launch-plan", isPublished: true }),
    ]);
  });

  it("rejects non-admin callers for target lists", async () => {
    const caller = createCaller("user");
    await expect(caller.listDocsTargets()).rejects.toThrow("This action is restricted to admins");
    await expect(caller.listBlogTargets()).rejects.toThrow("This action is restricted to admins");
  });
});
