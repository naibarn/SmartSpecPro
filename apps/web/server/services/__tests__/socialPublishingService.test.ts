import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    mockGetDb: vi.fn(),
    mockVerifyPageAccess: vi.fn(),
    mockDecrypt: vi.fn(),
    mockAuditLog: vi.fn(),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../db", () => ({
  getDb: mocks.mockGetDb,
}));

vi.mock("../socialAccessService", () => ({
  verifyPageAccess: mocks.mockVerifyPageAccess,
}));

vi.mock("../crypto", () => ({
  decrypt: mocks.mockDecrypt,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mocks.mockAuditLog,
  },
}));

import {
  cancelScheduledPublishingPost,
  createPublishingDraft,
  listPublishingPages,
  listPublishingPosts,
  publishPublishingPostNow,
  schedulePublishingPost,
} from "../socialPublishingService";

function createSelectChain(rows: any[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.then = vi.fn((resolve: (value: any[]) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject),
  );
  chain.limit = vi.fn(async (count?: number) => {
    if (typeof count === "number") {
      return rows.slice(0, count);
    }
    return rows;
  });
  return chain;
}

function createInsertChain(rows: any[]) {
  const returning = vi.fn(async () => rows);
  const values = vi.fn(() => ({ returning }));
  return { values };
}

function createUpdateChain() {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  return { set };
}

describe("socialPublishingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PYTHON_BACKEND_URL = "http://python.test";
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
    mocks.mockGetDb.mockReset();
    mockFetch.mockReset();
    mocks.mockDecrypt.mockReturnValue("decrypted-token");
    mocks.mockVerifyPageAccess.mockResolvedValue({
      id: 7,
      tenantId: "tenant-1",
      connectionId: 11,
      provider: "meta",
      providerPageId: "page-7",
      pageName: "Main Page",
      pageCategory: "Business",
      status: "active",
      selectedForPublishing: true,
      encryptedPageAccessToken: "encrypted-token",
      tokenExpiresAt: null,
    });
  });

  it("createPublishingDraft inserts a draft for the tenant and logs the action", async () => {
    const db = {
      select: vi.fn(),
      insert: vi.fn(() => createInsertChain([
        {
          id: 44,
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: "https://example.com",
          mediaRefs: null,
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
    };
    mocks.mockGetDb.mockReturnValue(db);

    const result = await createPublishingDraft({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
      contentText: "Hello world",
      contentLink: "https://example.com",
    });

    expect(result.status).toBe("draft");
    expect(mocks.mockVerifyPageAccess).toHaveBeenCalledWith(7, 42, "tenant-1", "tenant-1");
    expect(db.insert).toHaveBeenCalled();
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_publishing_draft_created",
      userId: 42,
    }));
  });

  it("publishPublishingPostNow calls Python and stores the provider post id", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: "https://example.com",
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: "post-123" }), { status: 200 }));

    const result = await publishPublishingPostNow({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
    });

    expect(result.status).toBe("published");
    expect(result.providerPostId).toBe("post-123");
    expect(mocks.mockDecrypt).toHaveBeenCalledWith("encrypted-token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.test/api/internal/social/publish",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_publishing_post_published",
      userId: 42,
    }));
  });

  it("publishPublishingPostNow rejects when Facebook Page access is missing", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: "https://example.com",
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: null,
          encryptedAccessToken: "encrypted-token",
          tokenExpiresAt: null,
          connectionTokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    await expect(
      publishPublishingPostNow({
        tenantId: "tenant-1",
        userId: 42,
        postId: 44,
      }),
    ).rejects.toThrow("Facebook Page access is missing");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("publishPublishingPostNow marks the post as failed when Python rejects the publish", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: null,
          mediaRefs: null,
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Meta rejected the post" }), { status: 502 }),
    );

    await expect(
      publishPublishingPostNow({
        tenantId: "tenant-1",
        userId: 42,
        postId: 44,
      }),
    ).rejects.toThrow("Meta rejected the post");

    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_publishing_publish_failed",
    }));
  });

  it("schedulePublishingPost validates the requested window and sets the status to scheduled", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: null,
          mediaRefs: null,
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    const scheduledAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const result = await schedulePublishingPost({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
      scheduledAt,
    });

    expect(result.status).toBe("scheduled");
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_publishing_post_scheduled",
    }));
  });

  it("schedulePublishingPost rejects when Facebook Page access is missing", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: null,
          mediaRefs: null,
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: null,
          encryptedAccessToken: "encrypted-token",
          tokenExpiresAt: null,
          connectionTokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    await expect(
      schedulePublishingPost({
        tenantId: "tenant-1",
        userId: 42,
        postId: 44,
        scheduledAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow("Facebook Page access is missing");
  });

  it("schedulePublishingPost rejects a past scheduledAt", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "draft",
          contentText: "Hello world",
          contentLink: null,
          scheduledAt: null,
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    await expect(
      schedulePublishingPost({
        tenantId: "tenant-1",
        userId: 42,
        postId: 44,
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).rejects.toThrow("scheduledAt must be at least 10 minutes in the future");
  });

  it("listPublishingPosts returns a paginated history window", async () => {
    const rows = [
      {
        id: 44,
        pageId: 7,
        pageName: "Main Page",
        provider: "meta",
        status: "published",
        contentText: "Hello world",
        contentLink: "https://example.com",
        mediaRefs: null,
        providerPostId: "post-123",
        scheduledAt: null,
        publishedAt: new Date("2026-03-24T12:00:00.000Z"),
        errorMessage: null,
        createdAt: new Date("2026-03-24T12:00:00.000Z"),
        updatedAt: new Date("2026-03-24T12:00:00.000Z"),
      },
      {
        id: 43,
        pageId: 7,
        pageName: "Main Page",
        provider: "meta",
        status: "draft",
        contentText: "Draft",
        contentLink: null,
        mediaRefs: null,
        providerPostId: null,
        scheduledAt: null,
        publishedAt: null,
        errorMessage: null,
        createdAt: new Date("2026-03-24T11:00:00.000Z"),
        updatedAt: new Date("2026-03-24T11:00:00.000Z"),
      },
    ];
    const db = {
      select: vi.fn(() => createSelectChain(rows)),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    const result = await listPublishingPosts({
      tenantId: "tenant-1",
      status: "published",
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("published");
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("2026-03-24T12:00:00.000Z");
  });

  it("cancelScheduledPublishingPost resets a scheduled post back to draft", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 44,
          tenantId: "tenant-1",
          pageId: 7,
          provider: "meta",
          providerPostId: null,
          status: "scheduled",
          contentText: "Hello world",
          contentLink: null,
          mediaRefs: null,
          scheduledAt: new Date("2026-03-24T13:00:00.000Z"),
          publishedAt: null,
          errorMessage: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    const result = await cancelScheduledPublishingPost({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
    });

    expect(result.status).toBe("draft");
    expect(mocks.mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_publishing_post_canceled",
    }));
  });

  it("listPublishingPages returns only active publishing-enabled pages", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 7,
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          provider: "meta",
          status: "active",
          selectedForPublishing: true,
          encryptedPageAccessToken: "encrypted-token",
          encryptedAccessToken: "encrypted-provider-token",
          tokenExpiresAt: null,
          connectionTokenExpiresAt: null,
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(),
    };
    mocks.mockGetDb.mockReturnValue(db);

    const pages = await listPublishingPages("tenant-1", 42);

    expect(pages).toEqual([
      expect.objectContaining({
        id: 7,
        label: "Main Page",
        status: "active",
        publishingReady: true,
        publishingIssueCode: "ready",
        publishingIssue: null,
      }),
    ]);
  });
});
