import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetTenantFeatureFlag,
  mockResolveTenantIdVarchar,
  mockListPublishingPages,
  mockCreatePublishingDraft,
  mockPublishPublishingPostNow,
  mockSchedulePublishingPost,
  mockListPublishingPosts,
  mockCancelScheduledPublishingPost,
} = vi.hoisted(() => {
  process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token";
  return {
    mockGetTenantFeatureFlag: vi.fn(),
    mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
    mockListPublishingPages: vi.fn(),
    mockCreatePublishingDraft: vi.fn(),
    mockPublishPublishingPostNow: vi.fn(),
    mockSchedulePublishingPost: vi.fn(),
    mockListPublishingPosts: vi.fn(),
    mockCancelScheduledPublishingPost: vi.fn(),
  };
});

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

vi.mock("../../services/socialPublishingService", () => ({
  listPublishingPages: mockListPublishingPages,
  createPublishingDraft: mockCreatePublishingDraft,
  publishPublishingPostNow: mockPublishPublishingPostNow,
  schedulePublishingPost: mockSchedulePublishingPost,
  listPublishingPosts: mockListPublishingPosts,
  cancelScheduledPublishingPost: mockCancelScheduledPublishingPost,
}));

import { socialPublishingRouter } from "../socialPublishing";

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
  return socialPublishingRouter.createCaller({
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

describe("socialPublishingRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlag.mockResolvedValue(true);
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
    mockListPublishingPages.mockResolvedValue([]);
    mockCreatePublishingDraft.mockResolvedValue({ id: 44, status: "draft" });
    mockPublishPublishingPostNow.mockResolvedValue({ id: 44, status: "published" });
    mockSchedulePublishingPost.mockResolvedValue({ id: 44, status: "scheduled" });
    mockListPublishingPosts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mockCancelScheduledPublishingPost.mockResolvedValue({ id: 44, status: "draft" });
  });

  it("lists publishing pages for the tenant", async () => {
    const caller = createCaller();
    await caller.listPages();

    expect(mockListPublishingPages).toHaveBeenCalledWith("tenant-1", 42);
  });

  it("creates drafts with tenant-scoped identity", async () => {
    const caller = createCaller();
    await caller.createDraft({
      pageId: 7,
      contentText: "Hello world",
      contentLink: "https://example.com",
    });

    expect(mockCreatePublishingDraft).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      pageId: 7,
      contentText: "Hello world",
      contentLink: "https://example.com",
    });
  });

  it("publishes an existing draft now", async () => {
    const caller = createCaller();
    await caller.publishNow({ postId: 44 });

    expect(mockPublishPublishingPostNow).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
    });
  });

  it("schedules a post", async () => {
    const caller = createCaller();
    await caller.schedulePost({
      postId: 44,
      scheduledAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    expect(mockSchedulePublishingPost).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
      scheduledAt: expect.any(String),
    });
  });

  it("lists posts with filters", async () => {
    const caller = createCaller();
    await caller.listPosts({
      pageId: 7,
      status: "published",
      limit: 10,
    });

    expect(mockListPublishingPosts).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      pageId: 7,
      status: "published",
      cursor: undefined,
      limit: 10,
    });
  });

  it("cancels a scheduled post", async () => {
    const caller = createCaller();
    await caller.cancelScheduledPost({ postId: 44 });

    expect(mockCancelScheduledPublishingPost).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      postId: 44,
    });
  });

  it("rejects callers when the feature flag is disabled", async () => {
    mockGetTenantFeatureFlag.mockResolvedValue(false);
    const caller = createCaller();

    await expect(caller.listPages()).rejects.toThrow("Meta Channels are disabled for this tenant");
    await expect(caller.createDraft({ pageId: 7, contentText: "Hello" })).rejects.toThrow("Meta Channels are disabled for this tenant");
  });
});
