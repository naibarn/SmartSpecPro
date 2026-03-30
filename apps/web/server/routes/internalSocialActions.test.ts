import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecuteSocialAction,
  mockListSocialProviders,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockExecuteSocialAction: vi.fn(),
    mockListSocialProviders: vi.fn(),
  };
});

vi.mock("../services/socialBackgroundFacade", () => ({
  executeSocialAction: mockExecuteSocialAction,
  listSocialProviders: mockListSocialProviders,
  SocialBackgroundError: class SocialBackgroundError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
      this.name = "SocialBackgroundError";
    }
  },
  SOCIAL_ACTIONS: ["read_inbox", "send_reply", "publish_post", "read_comments", "reply_comment"],
}));

vi.mock("../services/social/providerCatalog", () => ({
  listPlannedSocialProviderScaffolds: () => [
    {
      providerId: "tiktok",
      label: "TikTok",
      summary: "Planned short-form social provider for background inbox, comment, and publishing actions.",
      status: "planned",
      actions: [],
      notes: "Adapter stub only. Register a real provider implementation when TikTok support is added.",
    },
    {
      providerId: "youtube",
      label: "YouTube",
      summary: "Planned video and community provider for background moderation and publishing actions.",
      status: "planned",
      actions: [],
      notes: "Adapter stub only. Register a real provider implementation when YouTube support is added.",
    },
  ],
}));

import { handleInternalSocialActions, handleListInternalSocialProviders } from "./internalSocialActions";

function createReq(body: Record<string, unknown> = {}, headers: Record<string, string> = {}, method = "POST"): any {
  return {
    body,
    headers,
    method,
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

async function invoke(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = createReq(body, headers);
  const res = createRes();
  await handleInternalSocialActions(req, res);
  return res;
}

describe("internalSocialActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSocialAction.mockReset();
    mockListSocialProviders.mockReset();
  });

  it("lists provider capabilities", async () => {
    mockListSocialProviders.mockReturnValue([
      {
        providerId: "meta",
        label: "Meta",
        summary: "Background Meta actions",
        actions: ["read_inbox", "publish_post"],
        status: "available",
      },
    ]);

    const res = createRes();
    await handleListInternalSocialProviders(
      createReq(
        {},
        {
          "x-internal-token": "test-internal-token",
          "x-agent-id": "agent-1",
          "x-agent-tool-id": "tool-1",
        },
        "GET",
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        providers: [
          {
            providerId: "meta",
            label: "Meta",
            summary: "Background Meta actions",
            actions: ["read_inbox", "publish_post"],
            status: "available",
          },
        ],
        plannedProviders: [
          {
            providerId: "tiktok",
            label: "TikTok",
            summary: "Planned short-form social provider for background inbox, comment, and publishing actions.",
            status: "planned",
            actions: [],
            notes: "Adapter stub only. Register a real provider implementation when TikTok support is added.",
          },
          {
            providerId: "youtube",
            label: "YouTube",
            summary: "Planned video and community provider for background moderation and publishing actions.",
            status: "planned",
            actions: [],
            notes: "Adapter stub only. Register a real provider implementation when YouTube support is added.",
          },
        ],
      },
    });
  });

  it("requires the internal token", async () => {
    const res = await invoke(
      {
        provider: "meta",
        action: "read_inbox",
        tenantId: "tenant-1",
        pageId: 77,
      },
      {
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: "Unauthorized",
    });
  });

  it("executes a background social action through the facade", async () => {
    mockExecuteSocialAction.mockResolvedValue({
      pageId: 77,
      conversations: [],
      nextCursor: null,
      hasMore: false,
    });

    const res = await invoke(
      {
        provider: "meta",
        action: "read_inbox",
        tenantId: "tenant-1",
        pageId: 77,
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      provider: "meta",
      action: "read_inbox",
      data: {
        pageId: 77,
        conversations: [],
        nextCursor: null,
        hasMore: false,
      },
    });
    expect(mockExecuteSocialAction).toHaveBeenCalledWith({
      provider: "meta",
      action: "read_inbox",
      tenantId: "tenant-1",
      pageId: 77,
    });
  });

  it("maps freeform query text into messageBody for reply actions", async () => {
    mockExecuteSocialAction.mockResolvedValue({
      pageId: 77,
      conversationId: 9,
      providerMessageId: "msg-123",
      deliveryStatus: "sent",
    });

    const res = await invoke(
      {
        provider: "meta",
        action: "send_reply",
        tenantId: "tenant-1",
        pageId: 77,
        conversationId: 9,
        query: "Thanks for reaching out!",
      },
      {
        "x-internal-token": "test-internal-token",
        "x-agent-id": "agent-1",
        "x-agent-tool-id": "tool-1",
      },
    );

    expect(res.statusCode).toBe(200);
    expect(mockExecuteSocialAction).toHaveBeenCalledWith({
      provider: "meta",
      action: "send_reply",
      tenantId: "tenant-1",
      pageId: 77,
      conversationId: 9,
      query: "Thanks for reaching out!",
      messageBody: "Thanks for reaching out!",
    });
  });
});
