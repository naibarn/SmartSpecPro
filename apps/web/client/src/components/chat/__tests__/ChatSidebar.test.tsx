/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  return {
    mockUseUtils: vi.fn(() => ({
      chat: {
        listConversations: { invalidate: noop },
        listTrashedConversations: { invalidate: noop },
      },
    })),
    mockListConversationsQuery: vi.fn(),
    mockListTrashedConversationsQuery: vi.fn(),
    mockMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "sidebar.title": "Chats",
        "sidebar.startHere": "Start here",
        "sidebar.startHint": "New Chat starts a normal conversation. Personal Chat is locked to you and is best for receipts, bills, and private notes.",
        "sidebar.search": "Search chats...",
        "sidebar.select": "Select",
        "sidebar.selected": `${params?.count ?? 0} selected`,
        "sidebar.selectAll": "All",
        "sidebar.selectNone": "None",
        "sidebar.trash": "Trash",
        "startNewChat": "Start New Chat",
        "startPersonalChat": "Start Personal Chat",
        "sidebar.personalChatHint": "Personal chats stay private to you.",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    chat: {
      listConversations: { useQuery: mocks.mockListConversationsQuery },
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
      data: {
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
      },
      isLoading: false,
    });
    mocks.mockListTrashedConversationsQuery.mockReturnValue({
      data: { conversations: [] },
      isLoading: false,
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
    expect(screen.getByTitle("Personal scope is locked to this user")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start new chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /start personal chat/i }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onNewPersonalChat).toHaveBeenCalledTimes(1);
  });
});
