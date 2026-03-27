import { useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import type {
  DraftResult,
  PageOption,
  SocialInboxConversationSummary,
  SocialInboxFilterStatus,
  SocialInboxListResponse,
  SocialInboxMessage,
} from "@/types/social";
import { mapFilterToBackendStatus } from "@/types/social";

function flattenConversationPages(pages: SocialInboxListResponse[] | undefined): SocialInboxConversationSummary[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function useSocialInbox() {
  const utils = trpc.useUtils();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [statusFilter, setStatusFilterState] = useState<SocialInboxFilterStatus>("open");
  const [pageFilter, setPageFilterState] = useState<number | undefined>(undefined);

  const backendStatus = mapFilterToBackendStatus(statusFilter);

  const conversationsQuery = trpc.socialInbox.listConversations.useInfiniteQuery(
    {
      status: backendStatus,
      pageId: pageFilter,
      limit: 30,
    },
    {
      initialCursor: null,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const selectedConversationQuery = trpc.socialInbox.getConversation.useQuery(
    { conversationId: selectedConversationId ?? 0 },
    { enabled: selectedConversationId !== null },
  );

  const messagesQuery = trpc.socialInbox.listMessages.useQuery(
    { conversationId: selectedConversationId ?? 0, limit: 50 },
    {
      enabled: selectedConversationId !== null,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
    },
  );

  const sendReplyMutation = trpc.socialInbox.sendReply.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialInbox.listConversations.invalidate(),
        selectedConversationId !== null
          ? utils.socialInbox.getConversation.invalidate({ conversationId: selectedConversationId })
          : Promise.resolve(),
        selectedConversationId !== null
          ? utils.socialInbox.listMessages.invalidate({ conversationId: selectedConversationId })
          : Promise.resolve(),
      ]);
    },
    onError: () => {
      toast.error("Failed to send message");
    },
  });

  const generateDraftMutation = trpc.socialInbox.generateDraft.useMutation({
    onSuccess: async (result) => {
      if (!result?.autoSent || selectedConversationId === null) {
        return;
      }

      await Promise.all([
        utils.socialInbox.listConversations.invalidate(),
        utils.socialInbox.getConversation.invalidate({ conversationId: selectedConversationId }),
        utils.socialInbox.listMessages.invalidate({ conversationId: selectedConversationId }),
      ]);
    },
    onError: () => {
      toast.error("Failed to generate AI draft");
    },
  });

  const updateStatusMutation = trpc.socialInbox.updateConversationStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialInbox.listConversations.invalidate(),
        selectedConversationId !== null
          ? utils.socialInbox.getConversation.invalidate({ conversationId: selectedConversationId })
          : Promise.resolve(),
      ]);
    },
    onError: () => {
      toast.error("Failed to update conversation status");
    },
  });

  const conversations = flattenConversationPages(conversationsQuery.data?.pages as SocialInboxListResponse[] | undefined);

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;

    const fromQuery = selectedConversationQuery.data?.conversation;
    if (fromQuery) {
      return {
        id: fromQuery.id,
        customerDisplayName: fromQuery.customerDisplayName,
        customerExternalId: fromQuery.customerExternalId,
        channelType: fromQuery.channelType,
        status: fromQuery.status,
        unreadCount: fromQuery.unreadCount,
        lastMessagePreview: fromQuery.lastMessagePreview,
        lastMessageAt: fromQuery.lastMessageAt,
        lastInboundAt: fromQuery.lastInboundAt,
        lastOutboundAt: fromQuery.lastOutboundAt,
        pageId: fromQuery.pageId,
        pageName: fromQuery.pageName,
        pageStatus: fromQuery.pageStatus,
      } satisfies SocialInboxConversationSummary;
    }

    const fallbackConversation = conversations.find((conversation) => conversation.id === selectedConversationId);
    if (!fallbackConversation) return null;

    return fallbackConversation;
  }, [conversations, selectedConversationId, selectedConversationQuery.data?.conversation]);

  const messages = useMemo<SocialInboxMessage[]>(() => {
    if (messagesQuery.data?.items) {
      return messagesQuery.data.items as SocialInboxMessage[];
    }
    return selectedConversationQuery.data?.recentMessages ?? [];
  }, [messagesQuery.data?.items, selectedConversationQuery.data?.recentMessages]);

  const pages = useMemo<PageOption[]>(() => {
    const seen = new Map<number, PageOption>();
    for (const conversation of conversations) {
      if (seen.has(conversation.pageId)) continue;
      seen.set(conversation.pageId, {
        id: conversation.pageId,
        label: conversation.pageName || `Page ${conversation.pageId}`,
      });
    }

    if (pageFilter !== undefined && !seen.has(pageFilter)) {
      const label = selectedConversationQuery.data?.page.pageName || `Page ${pageFilter}`;
      seen.set(pageFilter, { id: pageFilter, label });
    }

    return Array.from(seen.values());
  }, [conversations, pageFilter, selectedConversationQuery.data?.page.pageName]);

  const setStatusFilter = (next: SocialInboxFilterStatus) => {
    setStatusFilterState(next);
  };

  const setPageFilter = (next: number | undefined) => {
    setPageFilterState(next);
  };

  const selectConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
  };

  const fetchNextPage = () => {
    if (conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      void conversationsQuery.fetchNextPage();
    }
  };

  const sendReply = async (body: string) => {
    if (selectedConversationId === null) {
      throw new Error("Select a conversation first");
    }
    await sendReplyMutation.mutateAsync({ conversationId: selectedConversationId, body });
  };

  const generateDraft = async (): Promise<DraftResult> => {
    if (selectedConversationId === null) {
      throw new Error("Select a conversation first");
    }
    return generateDraftMutation.mutateAsync({ conversationId: selectedConversationId });
  };

  const updateStatus = async (status: "open" | "pending" | "resolved") => {
    if (selectedConversationId === null) {
      throw new Error("Select a conversation first");
    }
    await updateStatusMutation.mutateAsync({
      conversationId: selectedConversationId,
      status: status === "resolved" ? "closed" : status,
    });
  };

  return {
    conversations,
    selectedConversation,
    messages,
    pages,
    error: conversationsQuery.error ?? selectedConversationQuery.error ?? messagesQuery.error,
    isLoading:
      conversationsQuery.isLoading ||
      (selectedConversationId !== null && (selectedConversationQuery.isLoading || messagesQuery.isLoading)),
    isFetchingNextPage: conversationsQuery.isFetchingNextPage,
    hasNextPage: conversationsQuery.hasNextPage ?? false,
    isSending: sendReplyMutation.isPending,
    isGeneratingDraft: generateDraftMutation.isPending,
    isUpdatingStatus: updateStatusMutation.isPending,
    statusFilter,
    setStatusFilter,
    pageFilter,
    setPageFilter,
    selectConversation,
    sendReply,
    generateDraft,
    updateStatus,
    fetchNextPage,
    selectedConversationId,
  };
}
