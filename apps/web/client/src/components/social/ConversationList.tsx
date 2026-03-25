import { useEffect, useRef } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type SocialInboxConversationSummary, type SocialInboxFilterStatus } from "@/types/social";
import { ConversationListItem } from "./ConversationListItem";

interface ConversationListProps {
  conversations: SocialInboxConversationSummary[];
  selectedId: number | null;
  statusFilter: SocialInboxFilterStatus;
  onStatusFilterChange: (status: SocialInboxFilterStatus) => void;
  onSelect: (conversationId: number) => void;
  isLoading: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  isLoadingMore?: boolean;
  className?: string;
}

const FILTERS: Array<{ label: string; value: SocialInboxFilterStatus }> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Resolved", value: "resolved" },
];

export function ConversationList({
  conversations,
  selectedId,
  statusFilter,
  onStatusFilterChange,
  onSelect,
  isLoading,
  hasNextPage,
  onLoadMore,
  isLoadingMore = false,
  className,
}: ConversationListProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage) return;
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry?.isIntersecting) {
        onLoadMore();
      }
    }, { rootMargin: "120px" });

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore, conversations.length, isLoadingMore]);

  const showLoading = isLoading && conversations.length === 0;
  const showEmpty = !isLoading && conversations.length === 0;

  return (
    <aside className={cn("flex min-h-0 flex-col border-r border-slate-200 bg-white/90", className)}>
      <div className="border-b border-slate-200 px-4 py-3">
        <div role="tablist" aria-label="Conversation filters" className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.value}
              variant={statusFilter === filter.value ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-8 rounded-full px-3 text-xs",
                statusFilter === filter.value
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
              onClick={() => onStatusFilterChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" role="listbox" aria-label="Conversations">
        {showLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <MessageCircle className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">No conversations</p>
            <p className="mt-1 text-xs text-slate-500">Try a different filter or page.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onClick={() => onSelect(conversation.id)}
              />
            ))}

            <div ref={loadMoreRef} className="flex items-center justify-center py-4">
              {isLoadingMore ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : hasNextPage ? (
                <span className="text-xs text-slate-400">Scroll for more</span>
              ) : (
                <span className="text-xs text-slate-400">End of list</span>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
