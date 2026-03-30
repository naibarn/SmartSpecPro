import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockResolveTenantIdVarchar,
  mockListModerationPages,
  mockListModerationComments,
  mockReplyToModerationComment,
  mockHideModerationComment,
  mockDeleteModerationComment,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetTenantFeatureFlag: vi.fn(),
    mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
    mockListModerationPages: vi.fn(),
    mockListModerationComments: vi.fn(),
    mockReplyToModerationComment: vi.fn(),
    mockHideModerationComment: vi.fn(),
    mockDeleteModerationComment: vi.fn(),
  };
});

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

vi.mock("../../services/socialModerationService", () => ({
  listModerationPages: mockListModerationPages,
  listModerationComments: mockListModerationComments,
  replyToModerationComment: mockReplyToModerationComment,
  hideModerationComment: mockHideModerationComment,
  deleteModerationComment: mockDeleteModerationComment,
}));

import { socialModerationRouter } from "../socialModeration";

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
  return socialModerationRouter.createCaller({
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

describe("socialModerationRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    mockListModerationPages.mockResolvedValue([]);
    mockListModerationComments.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockReplyToModerationComment.mockResolvedValue({ success: true, commentId: 91, providerCommentId: "comment-1" });
    mockHideModerationComment.mockResolvedValue({ success: true, commentId: 91, status: "hidden" });
    mockDeleteModerationComment.mockResolvedValue({ success: true, commentId: 91, status: "deleted" });
  });

  it("lists moderation pages for the tenant", async () => {
    const caller = createCaller();
    await caller.listPages();

    expect(mockListModerationPages).toHaveBeenCalledWith("tenant-1", 42);
  });

  it("lists comments for a selected page", async () => {
    const caller = createCaller();
    await caller.listComments({
      pageId: 7,
      limit: 20,
    });

    expect(mockListModerationComments).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
      cursor: undefined,
      limit: 20,
    });
  });

  it("replies to a comment", async () => {
    const caller = createCaller();
    await caller.replyToComment({
      commentId: 91,
      body: "Thanks!",
    });

    expect(mockReplyToModerationComment).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
      body: "Thanks!",
    });
  });

  it("hides a comment", async () => {
    const caller = createCaller();
    await caller.hideComment({ commentId: 91 });

    expect(mockHideModerationComment).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
    });
  });

  it("deletes a comment", async () => {
    const caller = createCaller();
    await caller.deleteComment({ commentId: 91 });

    expect(mockDeleteModerationComment).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      commentId: 91,
    });
  });

  it("blocks access when the feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = createCaller();

    await expect(caller.listPages()).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.listComments({ pageId: 7 })).rejects.toThrow("Meta Channels are disabled for this tenant");
  });
});
