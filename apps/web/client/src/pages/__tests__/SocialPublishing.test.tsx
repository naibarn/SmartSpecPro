/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  mockUseUtils: vi.fn(),
  mockListPagesQuery: vi.fn(),
  mockListPostsQuery: vi.fn(),
  mockCreateDraftMutation: vi.fn(),
  mockPublishNowMutation: vi.fn(),
  mockSchedulePostMutation: vi.fn(),
  mockCancelScheduledPostMutation: vi.fn(),
  mockUploadPostGetConnectionQuery: vi.fn(),
  mockUploadPostPublishNowMutation: vi.fn(),
  mockUploadPostScheduleMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    socialPublishing: {
      listPages: { useQuery: mocks.mockListPagesQuery },
      listPosts: { useInfiniteQuery: mocks.mockListPostsQuery },
      createDraft: { useMutation: mocks.mockCreateDraftMutation },
      publishNow: { useMutation: mocks.mockPublishNowMutation },
      schedulePost: { useMutation: mocks.mockSchedulePostMutation },
      cancelScheduledPost: { useMutation: mocks.mockCancelScheduledPostMutation },
    },
    uploadPost: {
      getConnection: { useQuery: mocks.mockUploadPostGetConnectionQuery },
      publishNow: { useMutation: mocks.mockUploadPostPublishNowMutation },
      schedulePost: { useMutation: mocks.mockUploadPostScheduleMutation },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import SocialPublishing from "../SocialPublishing";

const pages = [
  { id: 7, label: "Main Page", status: "active", provider: "meta", pageName: "Main Page", pageCategory: "Business", providerPageId: "page-7", publishingReady: true, publishingIssueCode: "ready", publishingIssue: null },
  { id: 8, label: "Support Page", status: "active", provider: "meta", pageName: "Support Page", pageCategory: "Support", providerPageId: "page-8", publishingReady: true, publishingIssueCode: "ready", publishingIssue: null },
];

const posts = [
  {
    id: 44,
    pageId: 7,
    pageName: "Main Page",
    provider: "meta",
    status: "scheduled",
    contentText: "A scheduled announcement",
    contentLink: "https://example.com",
    mediaRefs: null,
    providerPostId: null,
    scheduledAt: "2026-03-24T12:15:00.000Z",
    publishedAt: null,
    errorMessage: null,
    createdAt: "2026-03-24T12:00:00.000Z",
    updatedAt: "2026-03-24T12:00:00.000Z",
  },
];

function setup() {
  const invalidate = vi.fn();
  const refetchPages = vi.fn();
  const refetchPosts = vi.fn();
  const fetchNextPage = vi.fn();

  const createDraft = vi.fn().mockResolvedValue({ id: 91, status: "draft" });
  const publishNow = vi.fn().mockResolvedValue({ id: 91, status: "published" });
  const schedulePost = vi.fn().mockResolvedValue({ id: 91, status: "scheduled" });
  const cancelScheduledPost = vi.fn().mockResolvedValue({ id: 44, status: "draft" });
  const uploadPostPublishNow = vi.fn().mockResolvedValue({ id: 101, status: "published" });
  const uploadPostSchedule = vi.fn().mockResolvedValue({ id: 102, status: "scheduled" });

  mocks.mockUseUtils.mockReturnValue({
    socialPublishing: {
      listPages: { invalidate },
      listPosts: { invalidate },
    },
  });
  mocks.mockListPagesQuery.mockReturnValue({
    data: pages,
    isLoading: false,
    error: null,
    refetch: refetchPages,
  });
  mocks.mockListPostsQuery.mockReturnValue({
      data: { pages: [{ items: posts, nextCursor: null, hasMore: false }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: refetchPosts,
    });
  mocks.mockCreateDraftMutation.mockReturnValue({
    mutateAsync: createDraft,
    isPending: false,
  });
  mocks.mockPublishNowMutation.mockReturnValue({
    mutateAsync: publishNow,
    isPending: false,
  });
  mocks.mockSchedulePostMutation.mockReturnValue({
    mutateAsync: schedulePost,
    isPending: false,
  });
    mocks.mockCancelScheduledPostMutation.mockReturnValue({
      mutateAsync: cancelScheduledPost,
      isPending: false,
    });
    mocks.mockUploadPostGetConnectionQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.mockUploadPostPublishNowMutation.mockReturnValue({
      mutateAsync: uploadPostPublishNow,
      isPending: false,
    });
    mocks.mockUploadPostScheduleMutation.mockReturnValue({
      mutateAsync: uploadPostSchedule,
      isPending: false,
    });

  return {
    invalidate,
    refetchPages,
    refetchPosts,
    fetchNextPage,
    createDraft,
    publishNow,
    schedulePost,
    cancelScheduledPost,
    uploadPostPublishNow,
    uploadPostSchedule,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("SocialPublishing", () => {
  it("renders the composer and selects the first page", async () => {
    render(<SocialPublishing />);

    expect(await screen.findByDisplayValue("Main Page")).toBeTruthy();
    expect(screen.getByText("Post Composer")).toBeTruthy();
    expect(screen.getByText("Post History")).toBeTruthy();
    expect(screen.getByText("Connected pages")).toBeTruthy();
  });

  it("shows a readiness warning when page access is missing", async () => {
    const setupState = setup();
    mocks.mockListPagesQuery.mockReturnValue({
      data: [
        {
          id: 7,
          label: "Main Page",
          status: "active",
          provider: "meta",
          pageName: "Main Page",
          pageCategory: "Business",
          providerPageId: "page-7",
          publishingReady: false,
          publishingIssueCode: "missing_page_access",
          publishingIssue: "Facebook Page access is missing. Reconnect the Page before auto-posting.",
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SocialPublishing />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/facebook page access is missing/i);
    expect(alert).toHaveTextContent(/reconnect the page or refresh the account access before using auto-post/i);
    expect(screen.getByText("Page access missing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /publish now/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Schedule$/i })).toBeDisabled();
    expect(setupState.publishNow).toHaveBeenCalledTimes(0);
  });

  it("publishes by creating a draft first and then sending it", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    render(<SocialPublishing />);

    expect(await screen.findByDisplayValue("Main Page")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/write something thoughtful/i), "Launch day update");
    await user.click(screen.getByRole("button", { name: /publish now/i }));

    expect(setupState.createDraft).toHaveBeenCalledWith({
      pageId: 7,
      contentText: "Launch day update",
      contentLink: null,
    });
    expect(setupState.publishNow).toHaveBeenCalledWith({ postId: 91 });
  });

  it("schedules posts from the composer", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    render(<SocialPublishing />);

    expect(await screen.findByDisplayValue("Main Page")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/write something thoughtful/i), "Tomorrow's update");
    await user.click(screen.getByRole("button", { name: /^Schedule$/i }));

    expect(setupState.createDraft).toHaveBeenCalledWith({
      pageId: 7,
      contentText: "Tomorrow's update",
      contentLink: null,
    });
    expect(setupState.schedulePost).toHaveBeenCalledWith({
      postId: 91,
      scheduledAt: expect.any(String),
    });
  });

  it("switches into the Upload-Post gateway lane", async () => {
    const user = userEvent.setup();
    setup();
    render(<SocialPublishing />);

    expect(await screen.findByDisplayValue("Main Page")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Upload-Post$/i }));

    expect(screen.getByRole("button", { name: /^Upload-Post now$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Upload-Post schedule$/i })).toBeTruthy();
    expect(screen.getByText(/use the composer below, then click the upload-post publish buttons/i)).toBeTruthy();
  });

  it("cancels scheduled posts from the history table", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    render(<SocialPublishing />);

    await screen.findByText("A scheduled announcement");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(setupState.cancelScheduledPost).toHaveBeenCalledWith({ postId: 44 });
  });
});
