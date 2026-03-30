import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockListConversationsByTenant,
  mockResetConversationUnreadCount,
  mockSendMessageViaPythonBackend,
  mockDecrypt,
} = vi.hoisted(() => {
  process.env.PYTHON_BACKEND_URL = "http://python.local";
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetDb: vi.fn(),
    mockListConversationsByTenant: vi.fn(),
    mockResetConversationUnreadCount: vi.fn(),
    mockSendMessageViaPythonBackend: vi.fn(),
    mockDecrypt: vi.fn().mockReturnValue("plain-page-token"),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../socialInboxService", () => ({
  listConversationsByTenant: mockListConversationsByTenant,
  resetConversationUnreadCount: mockResetConversationUnreadCount,
  sendMessageViaPythonBackend: mockSendMessageViaPythonBackend,
}));

vi.mock("../../../drizzle/schema", () => ({
  socialComments: {
    id: "id",
    tenantId: "tenantId",
    pageId: "pageId",
    providerCommentId: "providerCommentId",
    providerObjectId: "providerObjectId",
    authorDisplayName: "authorDisplayName",
    body: "body",
    status: "status",
    lastAction: "lastAction",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  socialConversations: {
    id: "id",
    tenantId: "tenantId",
    pageId: "pageId",
    customerExternalId: "customerExternalId",
    status: "status",
  },
  socialPages: {
    id: "id",
    tenantId: "tenantId",
    providerPageId: "providerPageId",
    pageName: "pageName",
    status: "status",
    selectedForInbox: "selectedForInbox",
    selectedForPublishing: "selectedForPublishing",
    selectedForModeration: "selectedForModeration",
    encryptedPageAccessToken: "encryptedPageAccessToken",
    tokenExpiresAt: "tokenExpiresAt",
  },
  socialProviderConnections: {
    id: "id",
    tenantId: "tenantId",
    provider: "provider",
    providerUserId: "providerUserId",
    encryptedAccessToken: "encryptedAccessToken",
    encryptedRefreshToken: "encryptedRefreshToken",
    tokenExpiresAt: "tokenExpiresAt",
    status: "status",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    connectionType: "connectionType",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  executeSocialAction,
  listSocialProviders,
} from "../socialBackgroundFacade";

function createSelectChain(queue: any[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => queue.shift() ?? []),
  };
  return chain;
}

function createDb(queue: any[]) {
  return {
    select: vi.fn(() => createSelectChain(queue)),
  };
}

describe("socialBackgroundFacade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("lists the registered Meta provider", () => {
    const providers = listSocialProviders();
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "meta",
          label: "Meta",
          status: "available",
          actions: expect.arrayContaining(["read_inbox", "send_reply", "publish_post"]),
        }),
        expect.objectContaining({
          providerId: "tiktok",
          label: "TikTok",
          status: "available",
          actions: ["publish_post"],
        }),
        expect.objectContaining({
          providerId: "youtube",
          label: "YouTube",
          status: "available",
          actions: ["publish_post"],
        }),
      ]),
    );
  });

  it("reads inbox messages in the background", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
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
            provider: "meta",
            encryptedPageAccessToken: "encrypted",
            tokenExpiresAt: null,
            encryptedAccessToken: null,
            encryptedRefreshToken: null,
            connectionTokenExpiresAt: null,
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

    const result = await executeSocialAction({
      provider: "meta",
      action: "read_inbox",
      tenantId: "tenant-1",
      pageId: 77,
    });

    expect(result).toEqual({
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
    });
    expect(mockListConversationsByTenant).toHaveBeenCalledWith("tenant-1", {
      pageId: 77,
      limit: 10,
    });
  });

  it("publishes posts in the background", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
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
            provider: "meta",
            encryptedPageAccessToken: "encrypted",
            tokenExpiresAt: null,
            encryptedAccessToken: null,
            encryptedRefreshToken: null,
            connectionTokenExpiresAt: null,
          },
        ],
      ]),
    );
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "published", provider_post_id: "post-123" }), {
        status: 200,
      }),
    );

    const result = await executeSocialAction({
      provider: "meta",
      action: "publish_post",
      tenantId: "tenant-1",
      pageId: 77,
      contentText: "Hello from the swarm",
      contentLink: "https://example.com/post",
    });

    expect(mockDecrypt).toHaveBeenCalledWith("encrypted");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.local/api/internal/social/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-internal-token": "test-internal-token",
        }),
      }),
    );
    const fetchArgs = mockFetch.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(JSON.parse(fetchArgs?.body ?? "{}")).toEqual(
      expect.objectContaining({
        provider: "meta",
        page_id: "page-77",
        access_token: "plain-page-token",
        message: "Hello from the swarm",
        link: "https://example.com/post",
        media_urls: [],
        tags: [],
      }),
    );
    expect(result).toMatchObject({
      pageId: 77,
      status: "published",
      providerPostId: "post-123",
    });
  });

  it("publishes TikTok posts through the provider-aware backend", async () => {
    mockGetDb.mockResolvedValue(
      createDb([
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
            provider: "tiktok",
            encryptedPageAccessToken: null,
            encryptedAccessToken: "encrypted-provider-token",
            encryptedRefreshToken: null,
            tokenExpiresAt: null,
            connectionTokenExpiresAt: null,
          },
        ],
      ]),
    );
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "published", provider_post_id: "tt-123" }), {
        status: 200,
      }),
    );

    const result = await executeSocialAction({
      provider: "tiktok",
      action: "publish_post",
      tenantId: "tenant-1",
      pageId: 77,
      contentText: "A short-form post",
      mediaRefs: ["https://cdn.example.com/video.mp4"],
    });

    expect(mockDecrypt).toHaveBeenCalledWith("encrypted-provider-token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://python.local/api/internal/social/publish",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const tiktokBody = mockFetch.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(JSON.parse(tiktokBody?.body ?? "{}")).toEqual(
      expect.objectContaining({
        provider: "tiktok",
        page_id: "page-77",
        access_token: "plain-page-token",
        message: "A short-form post",
        media_urls: ["https://cdn.example.com/video.mp4"],
        title: "A short-form post",
        description: "A short-form post",
      }),
    );
    expect(result).toMatchObject({
      pageId: 77,
      status: "published",
      providerPostId: "tt-123",
    });
  });

  it("rejects actions unsupported by a registered provider", async () => {
    await expect(
      executeSocialAction({
        provider: "tiktok",
        action: "read_inbox",
        tenantId: "tenant-1",
        pageId: 77,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Action 'read_inbox' is not supported by provider 'tiktok'",
    });
  });
});
