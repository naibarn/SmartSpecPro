/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
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

    render(
      <ChatSidebar
        selectedConversationId={null}
        onSelectConversation={vi.fn()}
        onNewChat={vi.fn()}
        onNewPersonalChat={onNewPersonalChat}
      />,
    );

    expect(screen.getByRole("button", { name: /personal/i })).toBeInTheDocument();
    expect(screen.getByTitle("Personal scope is locked to this user")).toBeInTheDocument();
  });
});
