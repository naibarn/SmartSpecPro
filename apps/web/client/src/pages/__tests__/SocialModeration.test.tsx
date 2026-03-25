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
  mockListCommentsQuery: vi.fn(),
  mockReplyMutation: vi.fn(),
  mockHideMutation: vi.fn(),
  mockDeleteMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    socialModeration: {
      listPages: { useQuery: mocks.mockListPagesQuery },
      listComments: { useInfiniteQuery: mocks.mockListCommentsQuery },
      replyToComment: { useMutation: mocks.mockReplyMutation },
      hideComment: { useMutation: mocks.mockHideMutation },
      deleteComment: { useMutation: mocks.mockDeleteMutation },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import SocialModeration from "../SocialModeration";

const pages = [
  { id: 7, label: "Main Page", status: "active", pageName: "Main Page", pageCategory: "Business", providerPageId: "page-7" },
  { id: 8, label: "Support Page", status: "active", pageName: "Support Page", pageCategory: "Support", providerPageId: "page-8" },
];

const comments = [
  {
    id: 91,
    pageId: 7,
    pageName: "Main Page",
    providerCommentId: "comment-1",
    providerObjectId: "post-1",
    authorDisplayName: "Ada",
    body: "This looks great, but I have one question about pricing.",
    status: "visible",
    lastAction: null,
    createdAt: "2026-03-24T12:00:00.000Z",
    updatedAt: "2026-03-24T12:00:00.000Z",
  },
];

function setup() {
  const invalidate = vi.fn();
  const refetchPages = vi.fn();
  const refetchComments = vi.fn();
  const fetchNextPage = vi.fn();

  const replyToComment = vi.fn().mockResolvedValue({ success: true, commentId: 91 });
  const hideComment = vi.fn().mockResolvedValue({ success: true, commentId: 91, status: "hidden" });
  const deleteComment = vi.fn().mockResolvedValue({ success: true, commentId: 91, status: "deleted" });

  mocks.mockUseUtils.mockReturnValue({
    socialModeration: {
      listPages: { invalidate },
      listComments: { invalidate },
    },
  });
  mocks.mockListPagesQuery.mockReturnValue({
    data: pages,
    isLoading: false,
    error: null,
    refetch: refetchPages,
  });
  mocks.mockListCommentsQuery.mockReturnValue({
    data: { pages: [{ items: comments, nextCursor: null, hasMore: false }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch: refetchComments,
  });
  mocks.mockReplyMutation.mockReturnValue({
    mutateAsync: replyToComment,
    isPending: false,
  });
  mocks.mockHideMutation.mockReturnValue({
    mutateAsync: hideComment,
    isPending: false,
  });
  mocks.mockDeleteMutation.mockReturnValue({
    mutateAsync: deleteComment,
    isPending: false,
  });

  return {
    invalidate,
    refetchPages,
    refetchComments,
    fetchNextPage,
    replyToComment,
    hideComment,
    deleteComment,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("SocialModeration", () => {
  it("renders the moderation table and selects the first page", async () => {
    render(<SocialModeration />);

    expect(await screen.findByDisplayValue("Main Page")).toBeTruthy();
    expect(screen.getByText("Comment Moderation")).toBeTruthy();
    expect(screen.getByText("Reply")).toBeTruthy();
  });

  it("opens the reply composer and sends a reply", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    render(<SocialModeration />);

    await screen.findByText("This looks great, but I have one question about pricing.");
    await user.click(screen.getByRole("button", { name: /reply/i }));
    await user.type(screen.getByLabelText(/reply message/i), "Thanks for the question!");
    await user.click(screen.getByRole("button", { name: /^Send reply$/i }));

    expect(setupState.replyToComment).toHaveBeenCalledWith({
      commentId: 91,
      body: "Thanks for the question!",
    });
  });

  it("hides comments after confirmation", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SocialModeration />);

    await screen.findByText("This looks great, but I have one question about pricing.");
    await user.click(screen.getByRole("button", { name: /hide/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(setupState.hideComment).toHaveBeenCalledWith({ commentId: 91 });
    confirmSpy.mockRestore();
  });

  it("deletes comments after confirmation", async () => {
    const user = userEvent.setup();
    const setupState = setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SocialModeration />);

    await screen.findByText("This looks great, but I have one question about pricing.");
    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(setupState.deleteComment).toHaveBeenCalledWith({ commentId: 91 });
    confirmSpy.mockRestore();
  });
});
