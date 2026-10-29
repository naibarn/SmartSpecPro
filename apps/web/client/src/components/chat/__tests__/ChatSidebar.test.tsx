/**
 * @vitest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  return {
    mockUseUtils: vi.fn(() => ({
      chat: {
        listConversations: { invalidate: noop },
        listTrashedConversations: { invalidate: noop },
        listConversationThreads: { invalidate: vi.fn() },
      },
    })),
    mockListConversationsQuery: vi.fn(),
    mockListThreadsQuery: vi.fn(),
    mockRecentThreadsQuery: vi.fn(),
    mockCreateThreadMutation: vi.fn(),
    mockCreateThreadOptions: vi.fn(),
    mockFetchNextPage: vi.fn(),
    mockListTrashedConversationsQuery: vi.fn(),
    mockMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "sidebar.title": "Chats",
        "sidebar.navigationView": "Chat navigation view",
        "sidebar.sessionsView": "Sessions",
        "sidebar.threadsView": "Threads overview",
        "sidebar.startHere": "Start here",
        "sidebar.startHint": "New Chat starts a normal conversation. Personal Chat is locked to you and is best for receipts, bills, and private notes.",
        "sidebar.search": "Search chats...",
        "sidebar.openChat": `Open chat: ${params?.title ?? ""}`,
        "sidebar.selectChat": `Select chat: ${params?.title ?? ""}`,
        "sidebar.renameChat": `Rename chat: ${params?.title ?? ""}`,
        "sidebar.chatActions": `Actions for ${params?.title ?? ""}`,
        "sidebar.loadOlder": "Load older chats",
        "sidebar.loadingOlder": "Loading chats...",
        "sidebar.sessionsUnavailable": "Chat sessions could not be loaded.",
        "sidebar.retrySessions": "Retry loading sessions",
        "sidebar.refreshingSessions": "Refreshing sessions…",
        "sidebar.select": "Select",
        "sidebar.selected": `${params?.count ?? 0} selected`,
        "sidebar.selectAll": "All",
        "sidebar.selectNone": "None",
        "sidebar.trash": "Trash",
        "startNewChat": "Start New Chat",
        "startPersonalChat": "Start Personal Chat",
        "sidebar.personalChatHint": "Personal chats stay private to you.",
        "threads.title": "Threads",
        "threads.main": "Main conversation",
        "threads.new": "New task thread",
        "threads.status.WORKING": "Working",
        "threads.overviewTitle": "Thread overview",
        "threads.overviewDescription": "Recent work threads",
        "threads.overviewHint": "Choose a thread to continue focused work.",
        "threads.projectThreads": `${params?.project ?? ""} threads`,
        "threads.projectUnlinked": "Chats without a linked project",
        "threads.recentActivityOrder": "Work threads grouped by status, with the most recently active group first",
        "threads.statusFilter": "Filter by status",
        "threads.allStatuses": "All statuses",
        "threads.status.IDLE": "Idle",
        "threads.status.WAITING_ON_YOU": "Waiting on you",
        "threads.status.READY_FOR_REVIEW": "Review",
        "threads.status.LANDING": "Landing",
        "threads.status.RESOLVED": "Resolved",
        "threads.status.UNKNOWN": "Unknown",
        "threads.status.STALE": "Stale",
        "threads.status.UNAVAILABLE": "Unavailable",
        "threads.status.ERROR": "Failed",
        "threads.loading": "Loading threads…",
        "threads.overviewUnavailable": "Thread overview unavailable",
        "threads.retryOverview": "Retry loading threads",
        "threads.refreshing": "Refreshing…",
        "threads.overviewEmpty": "No work threads",
        "threads.openThread": `Open ${params?.thread ?? ""} in ${params?.conversation ?? ""}`,
        "threads.timeUnknown": "Time unavailable",
        "threads.openTaskControl": "Open Task Control",
        "threads.loadingMore": "Loading more…",
        "threads.loadMore": "Load more threads",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    chat: {
      listConversations: { useInfiniteQuery: mocks.mockListConversationsQuery },
      listConversationThreads: { useQuery: mocks.mockListThreadsQuery },
      listRecentConversationThreads: { useInfiniteQuery: mocks.mockRecentThreadsQuery },
      createConversationThread: { useMutation: (options: unknown) => {
        mocks.mockCreateThreadOptions(options);
        return { mutate: mocks.mockCreateThreadMutation, isPending: false };
      } },
      listTrashedConversations: { useQuery: mocks.mockListTrashedConversationsQuery },
      deleteConversation: { useMutation: () => mocks.mockMutation() },
      updateConversation: { useMutation: () => mocks.mockMutation() },
      deleteEmptyConversations: { useMutation: () => mocks.mockMutation() },
      deleteMultipleConversations: { useMutation: () => mocks.mockMutation() },
      restoreConversation: { useMutation: () => mocks.mockMutation() },
      permanentlyDeleteConversation: { useMutation: () => mocks.mockMutation() },
      emptyTrash: { useMutation: () => mocks.mockMutation() },
    },
  },
}));

import { ChatSidebar } from "../ChatSidebar";

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockListConversationsQuery.mockReturnValue({
      data: { pages: [{
        conversations: [
          {
            id: 1,
            title: "Personal Finance",
            messageCount: 4,
            isPinned: false,
            isArchived: false,
            totalCreditsUsed: 0,
            projectId: "personal",
            updatedAt: new Date("2026-04-09T10:00:00.000Z"),
          },
        ],
        total: 1,
        hasMore: false,
        nextCursor: null,
      }] },
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mocks.mockFetchNextPage,
    });
    mocks.mockListTrashedConversationsQuery.mockReturnValue({
      data: { conversations: [] },
      isLoading: false,
    });
    mocks.mockListThreadsQuery.mockReturnValue({
      data: { threads: [
        { threadId: null, title: "Main chat", status: "IDLE" },
        { threadId: "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1", title: "SPEC-224 Pilot", status: "WORKING" },
      ] },
      isLoading: false,
      error: null,
    });
    mocks.mockRecentThreadsQuery.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      isLoading: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
  });

  it("shows the personal chat entry point and personal badge", () => {
    const onNewPersonalChat = vi.fn();
    const onNewChat = vi.fn();

    render(
      <ChatSidebar
        selectedConversationId={null}
        onSelectConversation={vi.fn()}
        onNewChat={onNewChat}
        onNewPersonalChat={onNewPersonalChat}
      />,
    );

    expect(screen.getByRole("button", { name: /start new chat/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start personal chat/i })).toBeInTheDocument();
    expect(screen.getByTitle("Personal chats stay private to you.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /start personal chat/i }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onNewPersonalChat).toHaveBeenCalledTimes(1);
  });

  it("opens Chat on the project-aware thread overview and keeps Sessions one click away", () => {
    mocks.mockRecentThreadsQuery.mockReturnValue({
      data: { pages: [{ items: [{
        threadId: "thread-project-first",
        title: "SPEC-224 pilot",
        parentThreadId: null,
        status: "WORKING",
        lastActivityAt: "2026-10-29T10:00:00.000Z",
        conversationId: 12,
        conversationTitle: "Pilot chat",
        projectId: "platform-project",
        projectTitle: "SmartAIHub Development",
        latestJob: null,
      }], nextCursor: null }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<ChatSidebar selectedConversationId={12} onSelectConversation={vi.fn()} onSelectThread={vi.fn()} onNewChat={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Thread overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SmartAIHub Development" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SPEC-224 pilot in Pilot chat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("button", { name: "Open chat: Personal Finance" })).toBeInTheDocument();
  });

  it("opens an existing chat session and can load older sessions", () => {
    const onSelectConversation = vi.fn();
    mocks.mockListConversationsQuery.mockReturnValue({
      data: {
        pages: [
          {
            conversations: [
              {
                id: 12,
                title: "SPEC-224 Pilot",
                messageCount: 18,
                isPinned: false,
                isArchived: false,
                totalCreditsUsed: 0,
                projectId: "platform",
                updatedAt: new Date(),
              },
            ],
            total: 51,
            hasMore: true,
            nextCursor: 50,
          },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mocks.mockFetchNextPage,
    });

    render(
      <ChatSidebar
        selectedConversationId={12}
        onSelectConversation={onSelectConversation}
        onNewChat={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    const chatButton = screen.getByRole("button", { name: "Open chat: SPEC-224 Pilot" });
    expect(chatButton).toHaveAttribute("aria-current", "page");
    fireEvent.click(chatButton);
    fireEvent.click(screen.getByRole("button", { name: "Load older chats" }));

    expect(onSelectConversation).toHaveBeenCalledWith(12);
    expect(mocks.mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows persisted threads, opens the exact thread, and reuses a create idempotency key on retry", () => {
    const onSelectThread = vi.fn();
    render(
      <ChatSidebar
        selectedConversationId={12}
        onSelectConversation={vi.fn()}
        onSelectThread={onSelectThread}
        onNewChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("region", { name: "Threads" })).toBeInTheDocument();
    const threadButton = screen.getByText("SPEC-224 Pilot").closest("button");
    expect(threadButton).not.toBeNull();
    fireEvent.click(threadButton!);
    expect(onSelectThread).toHaveBeenCalledWith(12, "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1");

    fireEvent.click(screen.getByRole("button", { name: "New task thread" }));
    fireEvent.click(screen.getByRole("button", { name: "New task thread" }));
    expect(mocks.mockCreateThreadMutation).toHaveBeenCalledTimes(2);
    expect(mocks.mockCreateThreadMutation.mock.calls[0]?.[0]).toEqual(mocks.mockCreateThreadMutation.mock.calls[1]?.[0]);
    expect(mocks.mockCreateThreadMutation.mock.calls[0]?.[0]).toMatchObject({ conversationId: 12 });
  });

  it("opens a thread from the cross-session overview in its original conversation", () => {
    const onSelectThread = vi.fn();
    mocks.mockRecentThreadsQuery.mockReturnValue({
      data: { pages: [{ items: [{
        threadId: "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1",
        title: "SPEC-224 Phase 2",
        parentThreadId: null,
        status: "WORKING",
        lastActivityAt: "2026-10-29T10:00:00.000Z",
        conversationId: 42,
        conversationTitle: "SPEC-224 Pilot",
        latestJob: { jobId: "job-42", status: "running", statusReason: null, hasReviewableEvidence: false, createdAt: "2026-10-29T10:00:00.000Z", heartbeatAt: "2026-10-29T10:00:00.000Z" },
      }], nextCursor: null }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<ChatSidebar selectedConversationId={12} onSelectConversation={vi.fn()} onSelectThread={onSelectThread} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Threads overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Open SPEC-224 Phase 2 in SPEC-224 Pilot" }));
    expect(onSelectThread).toHaveBeenCalledWith(42, "c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1");
    expect(screen.getByRole("link", { name: "Open Task Control" })).toHaveAttribute("href", "/agent-monitor?conversationId=42&threadId=c5ea1c96-d20b-47b0-a74e-5c90c8ab72f1&jobId=job-42");
  });

  it("groups threads by status and puts the most recently active group first", () => {
    mocks.mockRecentThreadsQuery.mockReturnValue({
      data: { pages: [{ items: [
        { threadId: "new-error", title: "Just updated failure", parentThreadId: null, status: "ERROR", lastActivityAt: "2026-10-29T10:00:00.000Z", conversationId: 42, conversationTitle: "New chat", projectId: "project-a", projectTitle: "SmartAIHub", latestJob: null },
        { threadId: "old-working", title: "Older running work", parentThreadId: null, status: "WORKING", lastActivityAt: "2026-10-29T09:00:00.000Z", conversationId: 43, conversationTitle: "Old chat", projectId: "project-a", projectTitle: "SmartAIHub", latestJob: null },
      ], nextCursor: null }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<ChatSidebar selectedConversationId={42} selectedThreadId="new-error" onSelectConversation={vi.fn()} onSelectThread={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Threads overview" }));
    const orderedThreads = screen.getByRole("list", { name: "Work threads grouped by status, with the most recently active group first" });
    const rows = within(orderedThreads).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("Open Just updated failure in New chat");
    expect(rows[1]).toHaveAccessibleName("Open Older running work in Old chat");
    expect(screen.getAllByText("SmartAIHub", { selector: "h5" })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Working" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Failed" }).compareDocumentPosition(screen.getByRole("region", { name: "Working" })!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps an unlinked thread separate from a project with a sentinel-like title", () => {
    mocks.mockRecentThreadsQuery.mockReturnValue({
      data: { pages: [{ items: [
        { threadId: "unlinked", title: "No project", parentThreadId: null, status: "WORKING", lastActivityAt: "2026-10-29T10:00:00.000Z", conversationId: 42, conversationTitle: "Chat A", projectId: null, projectTitle: null, latestJob: null },
        { threadId: "named-project", title: "Project task", parentThreadId: null, status: "WORKING", lastActivityAt: "2026-10-29T09:00:00.000Z", conversationId: 43, conversationTitle: "Chat B", projectId: "project-sentinel", projectTitle: "__unlinked__", latestJob: null },
      ], nextCursor: null }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    render(<ChatSidebar selectedConversationId={null} onSelectConversation={vi.fn()} onSelectThread={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Threads overview" }));
    expect(screen.getByRole("heading", { name: "Chats without a linked project" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "__unlinked__" })).toBeInTheDocument();
  });

  it("offers retry instead of rendering a failed session query as an empty list", () => {
    const refetch = vi.fn();
    mocks.mockListConversationsQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error("unavailable"), isFetching: false, refetch });
    render(<ChatSidebar selectedConversationId={null} onSelectConversation={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chat sessions could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading sessions" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No conversations yet")).toBeNull();
  });

  it("keeps previously loaded sessions visible while reporting a refresh failure", () => {
    mocks.mockListConversationsQuery.mockReturnValue({
      data: { pages: [{ conversations: [{
        id: 1,
        title: "Personal Finance",
        messageCount: 4,
        isPinned: false,
        isArchived: false,
        totalCreditsUsed: 0,
        projectId: "personal",
        updatedAt: new Date("2026-04-09T10:00:00.000Z"),
      }], total: 1, hasMore: false, nextCursor: null }] },
      isLoading: false,
      error: new Error("refresh unavailable"),
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<ChatSidebar selectedConversationId={null} onSelectConversation={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chat sessions could not be loaded.");
    expect(screen.getByRole("button", { name: "Open chat: Personal Finance" })).toBeInTheDocument();
  });

  it("offers retry for an unavailable thread overview and keeps the error visible", () => {
    const refetch = vi.fn();
    mocks.mockRecentThreadsQuery.mockReturnValue({ data: undefined, isLoading: false, error: new Error("unavailable"), isFetching: false, refetch, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() });
    render(<ChatSidebar selectedConversationId={null} onSelectConversation={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Threads overview" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Thread overview unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading threads" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No work threads")).toBeNull();
  });
});
