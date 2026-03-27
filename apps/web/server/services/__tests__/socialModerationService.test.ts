import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockVerifyPageAccess,
  mockDecrypt,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockVerifyPageAccess: vi.fn(),
  mockDecrypt: vi.fn(),
  mockAuditLog: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../socialAccessService", () => ({
  verifyPageAccess: mockVerifyPageAccess,
}));

vi.mock("../crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

import {
  deleteModerationComment,
  hideModerationComment,
  listModerationComments,
  listModerationPages,
  replyToModerationComment,
} from "../socialModerationService";

function createSelectChain(rows: any[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
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

describe("socialModerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PYTHON_BACKEND_URL = "http://python.test";
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
    mockGetDb.mockReset();
    mockFetch.mockReset();
    mockDecrypt.mockReturnValue("decrypted-token");
    mockVerifyPageAccess.mockResolvedValue({
      id: 7,
      tenantId: "tenant-1",
      connectionId: 11,
      providerPageId: "page-7",
      pageName: "Main Page",
      pageCategory: "Business",
      status: "active",
      selectedForModeration: true,
      encryptedPageAccessToken: "encrypted-token",
      tokenExpiresAt: null,
    });
  });

  it("lists moderation pages for the tenant", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 7,
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          status: "active",
        },
      ])),
    };
    mockGetDb.mockResolvedValue(db);

    const result = await listModerationPages("tenant-1", 42);

    expect(result).toEqual([
      expect.objectContaining({
        id: 7,
        label: "Main Page",
        providerPageId: "page-7",
      }),
    ]);
  });

  it("lists paginated comments for an enabled page", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 91,
          pageId: 7,
          pageName: "Main Page",
          providerCommentId: "comment-1",
          providerObjectId: "post-1",
          authorDisplayName: "Ada",
          body: "Hello",
          status: "visible",
          lastAction: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
        },
      ])),
    };
    mockGetDb.mockResolvedValue(db);

    const result = await listModerationComments({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
      cursor: null,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 91,
      pageName: "Main Page",
      providerCommentId: "comment-1",
      providerObjectId: "post-1",
      authorDisplayName: "Ada",
      status: "visible",
    });
    expect(mockVerifyPageAccess).toHaveBeenCalledWith(7, 42, "tenant-1", "tenant-1");
  });

  it("replyToModerationComment calls Python and stores an action record", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 91,
          tenantId: "tenant-1",
          pageId: 7,
          providerCommentId: "comment-1",
          providerObjectId: "post-1",
          authorDisplayName: "Ada",
          body: "Hello",
          status: "visible",
          lastAction: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForModeration: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(() => createInsertChain([{}])),
    };
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: "comment-reply-1" }), { status: 200 }));

    const result = await replyToModerationComment({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
      body: "Thanks!",
    });

    expect(result).toMatchObject({
      success: true,
      commentId: 91,
      providerCommentId: "comment-reply-1",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("encrypted-token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.test/api/internal/meta/comments/reply",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_comment_replied",
    }));
  });

  it("hideModerationComment updates the comment to hidden", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 91,
          tenantId: "tenant-1",
          pageId: 7,
          providerCommentId: "comment-1",
          providerObjectId: "post-1",
          authorDisplayName: "Ada",
          body: "Hello",
          status: "visible",
          lastAction: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForModeration: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(() => createInsertChain([{}])),
    };
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: "hidden" }), { status: 200 }));

    const result = await hideModerationComment({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
    });

    expect(result.status).toBe("hidden");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.test/api/internal/meta/comments/hide",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_comment_hidden",
    }));
  });

  it("deleteModerationComment updates the comment to deleted", async () => {
    const db = {
      select: vi.fn(() => createSelectChain([
        {
          id: 91,
          tenantId: "tenant-1",
          pageId: 7,
          providerCommentId: "comment-1",
          providerObjectId: "post-1",
          authorDisplayName: "Ada",
          body: "Hello",
          status: "visible",
          lastAction: null,
          createdAt: new Date("2026-03-24T12:00:00.000Z"),
          updatedAt: new Date("2026-03-24T12:00:00.000Z"),
          pageTenantId: "tenant-1",
          providerPageId: "page-7",
          pageName: "Main Page",
          pageCategory: "Business",
          pageStatus: "active",
          selectedForModeration: true,
          encryptedPageAccessToken: "encrypted-token",
          tokenExpiresAt: new Date("2026-03-24T13:00:00.000Z"),
        },
      ])),
      update: vi.fn(() => createUpdateChain()),
      insert: vi.fn(() => createInsertChain([{}])),
    };
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: "deleted" }), { status: 200 }));

    const result = await deleteModerationComment({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
    });

    expect(result.status).toBe("deleted");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.test/api/internal/meta/comments/delete",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "social_comment_deleted",
    }));
  });
});
