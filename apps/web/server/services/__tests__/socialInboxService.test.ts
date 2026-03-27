import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockGetCacheClient,
} = vi.hoisted(() => {
  const mockGetDb = vi.fn();
  const mockGetCacheClient = vi.fn();
  return { mockGetDb, mockGetCacheClient };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../redisClients", () => ({
  getCacheClient: mockGetCacheClient,
}));

import {
  createOutboundMessage,
  getConversationWithRecentMessages,
  getMessagesByConversation,
  getPageForConversation,
  listConversationsByTenant,
  sendMessageViaPythonBackend,
} from "../socialInboxService";

function createSelectChain(rows: any[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async () => rows);
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

describe("socialInboxService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PYTHON_BACKEND_URL = "http://python.test";
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
    mockFetch.mockReset();
  });

  it("listConversationsByTenant returns paginated conversations joined with page names", async () => {
    const rows = [
      {
        id: 101,
        tenantId: "tenant-1",
        pageId: 7,
        providerConversationId: "conv-1",
        channelType: "messenger",
        customerExternalId: "psid-1",
        customerDisplayName: "Ada",
        status: "open",
        assignedToUserId: null,
        priority: 0,
        lastMessageAt: new Date("2026-03-20T12:00:00.000Z"),
        lastInboundAt: new Date("2026-03-20T12:00:00.000Z"),
        lastOutboundAt: null,
        unreadCount: 2,
        labels: [],
        createdAt: new Date("2026-03-20T11:00:00.000Z"),
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
        pageName: "Main Page",
        pageStatus: "active",
      },
      {
        id: 102,
        tenantId: "tenant-1",
        pageId: 7,
        providerConversationId: "conv-2",
        channelType: "messenger",
        customerExternalId: "psid-2",
        customerDisplayName: "Bea",
        status: "open",
        assignedToUserId: null,
        priority: 0,
        lastMessageAt: new Date("2026-03-19T12:00:00.000Z"),
        lastInboundAt: new Date("2026-03-19T12:00:00.000Z"),
        lastOutboundAt: null,
        unreadCount: 1,
        labels: [],
        createdAt: new Date("2026-03-19T11:00:00.000Z"),
        updatedAt: new Date("2026-03-19T12:00:00.000Z"),
        pageName: "Main Page",
        pageStatus: "active",
      },
    ];
    const mockDbSelect = vi.fn(() => createSelectChain(rows));
    mockGetDb.mockResolvedValue({
      select: mockDbSelect,
    });
    const mockRedis = {
      mget: vi.fn().mockResolvedValue(["5", "7"]),
    };
    mockGetCacheClient.mockReturnValue(mockRedis);

    const result = await listConversationsByTenant("tenant-1", {
      pageId: 7,
      status: "open",
      cursor: "2026-03-21T00:00:00.000Z",
      limit: 1,
    });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("2026-03-20T12:00:00.000Z");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].pageName).toBe("Main Page");
    expect(result.items[0].unreadCount).toBe(5);
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockRedis.mget).toHaveBeenCalled();
  });

  it("getMessagesByConversation rejects cross-tenant access", async () => {
    const mockDbSelect = vi.fn(() => createSelectChain([]));
    mockGetDb.mockResolvedValue({
      select: mockDbSelect,
    });

    await expect(
      getMessagesByConversation(999, "tenant-1", { limit: 20 }),
    ).rejects.toThrow("Conversation not found");
  });

  it("getConversationWithRecentMessages returns a conversation with recent messages", async () => {
    const conversationRow = {
      id: 101,
      tenantId: "tenant-1",
      pageId: 7,
      providerConversationId: "conv-1",
      channelType: "messenger",
      customerExternalId: "psid-1",
      customerDisplayName: "Ada",
      status: "open",
      assignedToUserId: null,
      priority: 0,
      lastMessageAt: new Date("2026-03-20T12:00:00.000Z"),
      lastInboundAt: new Date("2026-03-20T12:00:00.000Z"),
      lastOutboundAt: null,
      unreadCount: 2,
      labels: [],
      createdAt: new Date("2026-03-20T11:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      pageName: "Main Page",
      pageStatus: "active",
      pageTokenExpiresAt: null,
      pageProviderPageId: "page-7",
      pageConnectionId: 77,
    };
    const messages = [
      {
        id: 2,
        tenantId: "tenant-1",
        conversationId: 101,
        pageId: 7,
        providerMessageId: "m-2",
        direction: "outbound",
        senderType: "agent",
        senderExternalId: null,
        senderUserId: 42,
        messageType: "text",
        body: "Hi there",
        payload: null,
        deliveryStatus: "sent",
        errorMessage: null,
        sentAt: new Date("2026-03-20T12:05:00.000Z"),
        receivedAt: null,
        workflowTriggerStatus: null,
        createdAt: new Date("2026-03-20T12:05:00.000Z"),
      },
      {
        id: 1,
        tenantId: "tenant-1",
        conversationId: 101,
        pageId: 7,
        providerMessageId: "m-1",
        direction: "inbound",
        senderType: "customer",
        senderExternalId: "psid-1",
        senderUserId: null,
        messageType: "text",
        body: "Hello",
        payload: null,
        deliveryStatus: "sent",
        errorMessage: null,
        sentAt: null,
        receivedAt: new Date("2026-03-20T12:00:00.000Z"),
        workflowTriggerStatus: null,
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    ];
    const mockDbSelect = vi.fn()
      .mockImplementationOnce(() => createSelectChain([conversationRow]))
      .mockImplementationOnce(() => createSelectChain(messages));
    mockGetDb.mockResolvedValue({
      select: mockDbSelect,
    });
    mockGetCacheClient.mockReturnValue({
      mget: vi.fn().mockResolvedValue(["2"]),
    });

    const result = await getConversationWithRecentMessages(101, "tenant-1");

    expect(result.conversation.pageName).toBe("Main Page");
    expect(result.recentMessages).toHaveLength(2);
    expect(result.recentMessages[0].body).toBe("Hello");
    expect(result.recentMessages[1].body).toBe("Hi there");
  });

  it("sendMessageViaPythonBackend sends only page_id, recipient_id, and text", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: "m-123" }), { status: 200 }),
    );

    const result = await sendMessageViaPythonBackend(7, "psid-1", "Hello");

    expect(result.providerMessageId).toBe("m-123");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      page_id: 7,
      recipient_id: "psid-1",
      text: "Hello",
    });
    expect(String(options.body)).not.toContain("encrypted");
  });

  it("getPageForConversation rejects inactive or expired pages", async () => {
    const expired = new Date("2025-01-01T00:00:00.000Z");
    const conversationRow = {
      id: 101,
      tenantId: "tenant-1",
      pageId: 7,
      providerConversationId: "conv-1",
      channelType: "messenger",
      customerExternalId: "psid-1",
      customerDisplayName: "Ada",
      status: "open",
      assignedToUserId: null,
      priority: 0,
      lastMessageAt: new Date("2026-03-20T12:00:00.000Z"),
      lastInboundAt: new Date("2026-03-20T12:00:00.000Z"),
      lastOutboundAt: null,
      unreadCount: 2,
      labels: [],
      createdAt: new Date("2026-03-20T11:00:00.000Z"),
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      pageName: "Main Page",
      pageStatus: "disconnected",
      pageTokenExpiresAt: expired,
      pageProviderPageId: "page-7",
      pageConnectionId: 77,
    };
    const mockDbSelect = vi.fn(() => createSelectChain([conversationRow]));
    mockGetDb.mockResolvedValue({
      select: mockDbSelect,
    });
    mockGetCacheClient.mockReturnValue({
      mget: vi.fn().mockResolvedValue([null]),
    });

    await expect(getPageForConversation(101, "tenant-1")).rejects.toThrow("Conversation page is not active");
  });

  it("createOutboundMessage stores the outbound row and updates the conversation", async () => {
    const mockDbInsert = vi.fn().mockReturnValue(
      createInsertChain([{ id: 55, providerMessageId: "m-123" }]),
    );
    const mockDbUpdate = vi.fn().mockReturnValue(createUpdateChain());
    mockGetDb.mockResolvedValue({
      insert: mockDbInsert,
      update: mockDbUpdate,
    });

    const result = await createOutboundMessage({
      tenantId: "tenant-1",
      conversationId: 101,
      pageId: 7,
      userId: 42,
      body: "Reply",
      providerMessageId: "m-123",
    });

    expect(result).toEqual({ id: 55, providerMessageId: "m-123" });
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});
