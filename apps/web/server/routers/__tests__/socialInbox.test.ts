import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockResolveTenantIdVarchar,
  mockListConversationsByTenant,
  mockGetConversationWithRecentMessages,
  mockGetMessagesByConversation,
  mockUpdateConversationStatus,
  mockGenerateSocialDraft,
  mockAuditLog,
  mockSendReplyToConversation,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetTenantFeatureFlag: vi.fn(),
    mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
    mockListConversationsByTenant: vi.fn(),
    mockGetConversationWithRecentMessages: vi.fn(),
    mockGetMessagesByConversation: vi.fn(),
    mockUpdateConversationStatus: vi.fn(),
    mockGenerateSocialDraft: vi.fn(),
    mockAuditLog: vi.fn(),
    mockSendReplyToConversation: vi.fn(),
  };
});

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

vi.mock("../../services/socialInboxService", () => ({
  listConversationsByTenant: mockListConversationsByTenant,
  getConversationWithRecentMessages: mockGetConversationWithRecentMessages,
  getMessagesByConversation: mockGetMessagesByConversation,
  sendReplyToConversation: mockSendReplyToConversation,
  updateConversationStatus: mockUpdateConversationStatus,
}));

vi.mock("../../services/socialDraftService", () => ({
  generateSocialDraft: mockGenerateSocialDraft,
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

import { socialInboxRouter } from "../socialInbox";

function createCaller(user: any = {
  id: 42,
  openId: "user-open-id",
  email: "user@example.com",
  name: "Meta User",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  currentTenantId: "tenant-1",
}) {
  return socialInboxRouter.createCaller({
    user,
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

describe("socialInboxRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
  });

  it("listConversations scopes by tenantId and forwards filters", async () => {
    mockListConversationsByTenant.mockResolvedValue({
      items: [{ id: 101, pageName: "Main Page" }],
      nextCursor: "2026-03-20T00:00:00.000Z",
      hasMore: false,
    });

    const caller = createCaller();
    const result = await caller.listConversations({ pageId: 7, status: "open", limit: 10 });

    expect(result.items[0].id).toBe(101);
    expect(mockListConversationsByTenant).toHaveBeenCalledWith("tenant-1", {
      pageId: 7,
      status: "open",
      cursor: undefined,
      limit: 10,
    });
  });

  it("getConversation returns the service response", async () => {
    mockGetConversationWithRecentMessages.mockResolvedValue({
      conversation: { id: 101, pageName: "Main Page", unreadCount: 2 },
      page: { id: 7, status: "active" },
      recentMessages: [{ id: 1, body: "Hello" }],
    });

    const caller = createCaller();
    const result = await caller.getConversation({ conversationId: 101 });

    expect(result.conversation.id).toBe(101);
    expect(mockGetConversationWithRecentMessages).toHaveBeenCalledWith(101, "tenant-1");
  });

  it("listMessages returns chronological message windows", async () => {
    mockGetMessagesByConversation.mockResolvedValue({
      items: [
        { id: 1, createdAt: new Date("2026-03-20T12:00:00.000Z"), body: "Hello" },
        { id: 2, createdAt: new Date("2026-03-20T12:05:00.000Z"), body: "Hi there" },
      ],
      nextCursor: "2026-03-20T12:05:00.000Z",
      hasMore: false,
    });

    const caller = createCaller();
    const result = await caller.listMessages({ conversationId: 101, limit: 50 });

    expect(result.items[0].body).toBe("Hello");
    expect(mockGetMessagesByConversation).toHaveBeenCalledWith(101, "tenant-1", {
      cursor: undefined,
      limit: 50,
    });
  });

  it("sendReply sends through the shared reply helper", async () => {
    mockSendReplyToConversation.mockResolvedValue({
      success: true,
      messageId: 55,
      providerMessageId: "m-123",
    });

    const caller = createCaller();
    const result = await caller.sendReply({ conversationId: 101, body: "Thanks!" });

    expect(result).toEqual({
      success: true,
      messageId: 55,
      providerMessageId: "m-123",
    });
    expect(mockSendReplyToConversation).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      conversationId: 101,
      body: "Thanks!",
    });
  });

  it("sendReply rejects when the page is inactive", async () => {
    mockSendReplyToConversation.mockRejectedValue(new Error("Conversation page is not active"));

    const caller = createCaller();
    await expect(caller.sendReply({ conversationId: 101, body: "Reply" })).rejects.toThrow("Conversation page is not active");
  });

  it("generateDraft is reserved for a later section", async () => {
    mockGenerateSocialDraft.mockResolvedValue({
      draft: "Draft reply",
      confidence: 0.87,
      autoSent: false,
    });

    const caller = createCaller();
    await expect(caller.generateDraft({ conversationId: 101 })).resolves.toEqual({
      draft: "Draft reply",
      confidence: 0.87,
      autoSent: false,
    });
    expect(mockGenerateSocialDraft).toHaveBeenCalledWith({
      conversationId: 101,
      tenantId: "tenant-1",
      userId: 42,
    });
  });

  it("rejects when the feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = createCaller();

    await expect(caller.listConversations({ limit: 10 })).rejects.toThrow("Meta Channels are disabled for this tenant");
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(null);
    await expect(caller.listConversations({ limit: 10 })).rejects.toThrow();
  });
});
