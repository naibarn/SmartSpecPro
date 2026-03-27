/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const invalidateListConversations = vi.fn();
  const invalidateGetConversation = vi.fn();
  const invalidateListMessages = vi.fn();
  const generateDraftMutateAsync = vi.fn();
  const sendReplyMutateAsync = vi.fn();
  const updateStatusMutateAsync = vi.fn();
  const useInfiniteQueryMock = vi.fn();
  const useQueryMock = vi.fn();
  const mockUseUtils = vi.fn(() => ({
    socialInbox: {
      listConversations: { invalidate: invalidateListConversations },
      getConversation: { invalidate: invalidateGetConversation },
      listMessages: { invalidate: invalidateListMessages },
    },
  }));

  return {
    invalidateListConversations,
    invalidateGetConversation,
    invalidateListMessages,
    generateDraftMutateAsync,
    sendReplyMutateAsync,
    updateStatusMutateAsync,
    useInfiniteQueryMock,
    useQueryMock,
    mockUseUtils,
  };
});

let currentGenerateDraftResult: {
  draft: string;
  confidence: number;
  autoSent?: boolean;
  approvalId?: number;
} = {
  draft: "AI generated reply",
  confidence: 0.92,
  autoSent: false,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    socialInbox: {
      listConversations: { useInfiniteQuery: (...args: any[]) => mocks.useInfiniteQueryMock(...args) },
      getConversation: { useQuery: (...args: any[]) => mocks.useQueryMock(...args) },
      listMessages: { useQuery: (...args: any[]) => mocks.useQueryMock(...args) },
      sendReply: {
        useMutation: (opts?: any) => ({
          mutateAsync: mocks.sendReplyMutateAsync.mockImplementation(async (variables: any) => {
            await opts?.onSuccess?.({ success: true }, variables, undefined);
            return { success: true };
          }),
          isPending: false,
        }),
      },
      generateDraft: {
        useMutation: (opts?: any) => ({
          mutateAsync: mocks.generateDraftMutateAsync.mockImplementation(async (variables: any) => {
            const result = currentGenerateDraftResult;
            await opts?.onSuccess?.(result, variables, undefined);
            return result;
          }),
          isPending: false,
          onError: opts?.onError,
        }),
      },
      updateConversationStatus: {
        useMutation: (opts?: any) => ({
          mutateAsync: mocks.updateStatusMutateAsync.mockImplementation(async (variables: any) => {
            await opts?.onSuccess?.({ success: true }, variables, undefined);
            return { success: true };
          }),
          isPending: false,
        }),
      },
    },
  },
}));

import { useSocialInbox } from "../useSocialInbox";

const conversation = {
  id: 7,
  customerDisplayName: "Nina",
  customerExternalId: "psid-7",
  channelType: "messenger",
  status: "open",
  unreadCount: 3,
  lastMessagePreview: "Can you help me with my order?",
  lastMessageAt: "2026-03-24T06:00:00.000Z",
  lastInboundAt: "2026-03-24T06:00:00.000Z",
  lastOutboundAt: null,
  pageId: 101,
  pageName: "Main Page",
  pageStatus: "active",
};

const selectedConversation = {
  ...conversation,
  status: "open",
  labels: [],
  assignedToUserId: null,
  priority: null,
};

const messages = [
  {
    id: 1,
    direction: "inbound",
    senderType: "customer",
    body: "Hello there",
    messageType: "text",
    sentAt: null,
    receivedAt: "2026-03-24T06:01:00.000Z",
    deliveryStatus: "sent",
    createdAt: "2026-03-24T06:01:00.000Z",
  },
  {
    id: 2,
    direction: "outbound",
    senderType: "agent",
    body: "We can help!",
    messageType: "text",
    sentAt: "2026-03-24T06:02:00.000Z",
    receivedAt: null,
    deliveryStatus: "sent",
    createdAt: "2026-03-24T06:02:00.000Z",
  },
];

function setupMocks() {
  mocks.invalidateListConversations.mockClear();
  mocks.invalidateGetConversation.mockClear();
  mocks.invalidateListMessages.mockClear();
  mocks.useInfiniteQueryMock.mockReset();
  mocks.useInfiniteQueryMock.mockReturnValue({
    data: { pages: [{ items: [conversation], nextCursor: "cursor-1", hasMore: true }] },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: vi.fn(),
    error: null,
  });
  mocks.useQueryMock.mockReset();
  mocks.useQueryMock.mockImplementation((input: any) => {
    if (input && "limit" in input) {
      return {
        data: { items: messages, nextCursor: null, hasMore: false },
        isLoading: false,
        error: null,
      };
    }

    return {
      data: {
        conversation: selectedConversation,
        page: {
          id: 101,
          pageName: "Main Page",
          providerPageId: "page-101",
          status: "active",
        },
        recentMessages: messages,
      },
      isLoading: false,
      error: null,
    };
  });
  mocks.sendReplyMutateAsync.mockReset();
  mocks.updateStatusMutateAsync.mockReset();
  mocks.generateDraftMutateAsync.mockReset();
  currentGenerateDraftResult = {
    draft: "AI generated reply",
    confidence: 0.92,
    autoSent: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe("useSocialInbox", () => {
  it("returns conversations, selectedConversation, messages, filters, and actions", () => {
    const { result } = renderHook(() => useSocialInbox());

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.selectedConversation).toBeNull();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.statusFilter).toBe("open");
    expect(result.current.pageFilter).toBeUndefined();
  });

  it("passes the default open filter and polling config to listConversations", () => {
    renderHook(() => useSocialInbox());

    expect(mocks.useInfiniteQueryMock).toHaveBeenCalled();
    const [input, options] = mocks.useInfiniteQueryMock.mock.calls[0]!;
    expect(input).toEqual({ status: "open", pageId: undefined, limit: 30 });
    expect(options.refetchInterval).toBe(10_000);
    expect(options.refetchIntervalInBackground).toBe(false);
  });

  it("setStatusFilter updates the status parameter and refetches", () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.setStatusFilter("resolved");
    });

    const lastCall = mocks.useInfiniteQueryMock.mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({ status: "closed", pageId: undefined, limit: 30 });
  });

  it("setPageFilter updates the pageId parameter and refetches", () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.setPageFilter(22);
    });

    const lastCall = mocks.useInfiniteQueryMock.mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({ status: "open", pageId: 22, limit: 30 });
  });

  it("selectConversation sets selectedConversationId and triggers getConversation query", () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.selectConversation(7);
    });

    const lastCall = mocks.useQueryMock.mock.calls.at(-1)!;
    expect(lastCall[0]).toEqual({ conversationId: 7, limit: 50 });
  });

  it("sendReply calls mutation and invalidates conversation queries on success", async () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.selectConversation(7);
    });

    await act(async () => {
      await result.current.sendReply("Hello team");
    });

    expect(mocks.invalidateListConversations).toHaveBeenCalled();
    expect(mocks.invalidateGetConversation).toHaveBeenCalledWith({ conversationId: 7 });
    expect(mocks.invalidateListMessages).toHaveBeenCalledWith({ conversationId: 7 });
  });

  it("generateDraft calls mutation and returns draft text + confidence", async () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.selectConversation(7);
    });

    await expect(result.current.generateDraft()).resolves.toEqual({
      draft: "AI generated reply",
      confidence: 0.92,
      autoSent: false,
    });
  });

  it("generateDraft invalidates queries when the reply is auto-sent", async () => {
    currentGenerateDraftResult = {
      draft: "Auto sent reply",
      confidence: 0.96,
      autoSent: true,
    };

    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.selectConversation(7);
    });

    await act(async () => {
      await result.current.generateDraft();
    });

    expect(mocks.invalidateListConversations).toHaveBeenCalled();
    expect(mocks.invalidateGetConversation).toHaveBeenCalledWith({ conversationId: 7 });
    expect(mocks.invalidateListMessages).toHaveBeenCalledWith({ conversationId: 7 });
  });

  it("updateStatus maps resolved to closed before calling the mutation", async () => {
    const { result } = renderHook(() => useSocialInbox());

    act(() => {
      result.current.selectConversation(7);
    });

    await act(async () => {
      await result.current.updateStatus("resolved");
    });

    expect(mocks.updateStatusMutateAsync).toHaveBeenCalledWith({
      conversationId: 7,
      status: "closed",
    });
    expect(mocks.invalidateListConversations).toHaveBeenCalled();
  });

  it("fetchNextPage delegates to the infinite query fetcher", () => {
    const { result } = renderHook(() => useSocialInbox());
    const fetchNextPage = mocks.useInfiniteQueryMock.mock.results[0]?.value.fetchNextPage;
    result.current.fetchNextPage();

    expect(fetchNextPage).toHaveBeenCalled();
  });
});
