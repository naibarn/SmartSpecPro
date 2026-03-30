import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockListConversationsByTenant,
  mockSendMessageViaPythonBackend,
  mockResetConversationUnreadCount,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  process.env.PYTHON_BACKEND_URL = "http://python.local";
  return {
    mockGetDb: vi.fn(),
    mockListConversationsByTenant: vi.fn(),
    mockSendMessageViaPythonBackend: vi.fn(),
    mockResetConversationUnreadCount: vi.fn(),
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/socialInboxService", () => ({
  listConversationsByTenant: mockListConversationsByTenant,
  sendMessageViaPythonBackend: mockSendMessageViaPythonBackend,
  resetConversationUnreadCount: mockResetConversationUnreadCount,
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn().mockReturnValue("plain-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { handleInternalSocialTool } from "./internalSocialTool";

function makeSelectChain(queue: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => queue.shift() ?? []),
  };
  return chain;
}

function createDb(queue: any[]) {
  return {
    select: vi.fn(() => makeSelectChain(queue)),
  };
}

function createReq(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): any {
  return {
    body,
    headers,
  };
}

function createRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function invoke(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const req = createReq(body, headers);
  const res = createRes();
  await handleInternalSocialTool(req, res);
  return res;
}

describe("internalSocialTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("requires the internal token", async () => {
    const res = await invoke(
      { action: "read_inbox", pageId: 77 },
      {
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid internal tokens", async () => {
    const res = await invoke(
      { action: "read_inbox", pageId: 77 },
      {
        "x-internal-token": "wrong",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns recent conversations for read_inbox", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["read_inbox"] } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted",
            tokenExpiresAt: null,
          },
        ],
      ]),
    );
    mockListConversationsByTenant.mockResolvedValue({
      items: [
        {
          id: 9,
          customerDisplayName: "Ada",
          lastMessagePreview: "Hello there",
          status: "open",
          unreadCount: 3,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const res = await invoke(
      { action: "read_inbox", pageId: 77 },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        pageId: 77,
        conversations: [
          {
            conversationId: 9,
            customerName: "Ada",
            lastMessage: "Hello there",
            status: "open",
            unreadCount: 3,
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
    });
  });

  it("returns approval_needed for outbound send_reply actions when approval is required", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["send_reply"], requireApproval: true } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted",
            tokenExpiresAt: null,
          },
        ],
        [
          {
            id: 9,
            tenantId: "tenant-1",
            pageId: 77,
            customerExternalId: "psid-1",
            status: "open",
          },
        ],
      ]),
    );

    const res = await invoke(
      {
        action: "send_reply",
        pageId: 77,
        conversationId: 9,
        messageBody: "Thanks!",
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: false,
      status: "approval_needed",
      message: "Outbound actions require human approval",
    });
    expect(mockSendMessageViaPythonBackend).not.toHaveBeenCalled();
  });

  it("publishes a post when the tool config allows it", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["publish_post"], requireApproval: false } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted-token",
            tokenExpiresAt: null,
          },
        ],
      ]),
    );
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "published", provider_post_id: "post-123" }), { status: 200 }),
    );

    const res = await invoke(
      {
        action: "publish_post",
        pageId: 77,
        contentText: "Launch day",
        contentLink: "https://example.com/launch",
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providerPostId).toBe("post-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.local/api/internal/meta/posts/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-internal-token": "test-internal-token",
        }),
      }),
    );
  });

  it("returns recent comments for read_comments", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["read_comments"] } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted",
            tokenExpiresAt: null,
          },
        ],
        [
          {
            id: 12,
            pageId: 77,
            providerCommentId: "comment-1",
            providerObjectId: "post-1",
            authorDisplayName: "Grace",
            body: "Nice work",
            status: "visible",
            lastAction: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      ]),
    );

    const res = await invoke(
      { action: "read_comments", pageId: 77 },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0]).toMatchObject({
      commentId: 12,
      providerCommentId: "comment-1",
      authorDisplayName: "Grace",
      body: "Nice work",
      status: "visible",
    });
  });

  it("replies to a comment when permitted", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["reply_comment"], requireApproval: false } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted-token",
            tokenExpiresAt: null,
          },
        ],
        [
          {
            id: 12,
            tenantId: "tenant-1",
            pageId: 77,
            providerCommentId: "comment-1",
            providerObjectId: "post-1",
            authorDisplayName: "Grace",
            body: "Nice work",
            status: "visible",
            lastAction: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      ]),
    );
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "replied", provider_comment_id: "comment-reply-1" }), { status: 200 }),
    );

    const res = await invoke(
      {
        action: "reply_comment",
        pageId: 77,
        commentId: 12,
        messageBody: "Thanks for the feedback!",
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.data.providerCommentId).toBe("comment-reply-1");
  });

  it("rejects actions that are not allowed by the tool config", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { pageId: 77, allowedActions: ["read_inbox"] } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted-token",
            tokenExpiresAt: null,
          },
        ],
      ]),
    );

    const res = await invoke(
      {
        action: "send_reply",
        pageId: 77,
        conversationId: 9,
        messageBody: "Hello",
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("Action not permitted by tool configuration");
  });

  it("rejects missing pageId in the tool config", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
        [{ tenantId: "tenant-1", toolConfig: { allowedActions: ["read_inbox"] } }],
        [
          {
            id: 77,
            tenantId: "tenant-1",
            providerPageId: "page-77",
            pageName: "Demo Page",
            status: "active",
            selectedForInbox: true,
            selectedForPublishing: true,
            selectedForModeration: true,
            encryptedPageAccessToken: "encrypted-token",
            tokenExpiresAt: null,
          },
        ],
      ]),
    );

    const res = await invoke(
      {
        action: "read_inbox",
        pageId: 77,
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Tool configuration must include pageId");
  });
});
