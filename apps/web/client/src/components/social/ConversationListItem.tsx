import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatConversationStatus,
  formatRelativeTime,
  getConversationStatusDot,
  getConversationStatusTone,
  truncateText,
  type SocialInboxConversationSummary,
} from "@/types/social";

interface ConversationListItemProps {
  conversation: SocialInboxConversationSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationListItem({ conversation, isSelected, onClick }: ConversationListItemProps) {
  const statusLabel = formatConversationStatus(conversation.status);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-3 text-left transition-all",
        "hover:border-slate-300 hover:bg-slate-50",
        isSelected
          ? "border-slate-300 bg-slate-100 shadow-sm"
          : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", getConversationStatusDot(conversation.status))} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {conversation.customerDisplayName || "Unknown"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {conversation.channelType}
                {conversation.pageName ? ` · ${conversation.pageName}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {conversation.unreadCount > 0 ? (
                <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">
                  {conversation.unreadCount}
                </Badge>
              ) : null}
              <span className="text-[11px] text-slate-500">
                {formatRelativeTime(conversation.lastMessageAt)}
              </span>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-slate-600">
            {conversation.lastMessagePreview
              ? truncateText(conversation.lastMessagePreview, 60)
              : "No message preview yet"}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {statusLabel}
            </span>
            {conversation.lastMessageAt ? (
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", getConversationStatusTone(conversation.status))}>
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
