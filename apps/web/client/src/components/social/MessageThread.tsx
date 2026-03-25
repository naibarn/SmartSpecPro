import { useEffect, useRef } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatConversationStatus,
  formatRelativeTime,
  normalizeConversationStatus,
  type SocialInboxConversationSummary,
  type SocialInboxMessage,
} from "@/types/social";
import { ReplyComposer } from "./ReplyComposer";

interface MessageThreadProps {
  conversation: SocialInboxConversationSummary | null;
  messages: SocialInboxMessage[];
  isLoading: boolean;
  onSendReply: (body: string) => Promise<void> | void;
  onGenerateDraft: () => Promise<{ draft: string; confidence: number }>;
  onUpdateStatus: (status: "open" | "pending" | "resolved") => Promise<void> | void;
  isSending: boolean;
  isUpdatingStatus?: boolean;
}

function getSenderLabel(senderType: string): string {
  switch (senderType) {
    case "customer":
      return "Customer";
    case "agent":
      return "Agent";
    case "ai":
      return "AI";
    case "system":
      return "System";
    default:
      return senderType;
  }
}

export function MessageThread({
  conversation,
  messages,
  isLoading,
  onSendReply,
  onGenerateDraft,
  onUpdateStatus,
  isSending,
  isUpdatingStatus = false,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <div className="max-w-md rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center shadow-sm">
          <MessageCircle className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Select a conversation</h2>
          <p className="mt-2 text-sm text-slate-500">Choose a conversation from the inbox to view messages and reply.</p>
        </div>
      </div>
    );
  }

  const normalizedStatus = normalizeConversationStatus(conversation.status);
  const canMarkResolved = normalizedStatus !== "resolved";
  const canMarkPending = normalizedStatus !== "pending";

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-slate-50/70">
      <header className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {conversation.customerDisplayName || "Unknown"}
              </h2>
              <Badge className={cn("rounded-full border", normalizedStatus === "open" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : normalizedStatus === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200")}>
                {formatConversationStatus(conversation.status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Page {conversation.pageId}
              {conversation.pageName ? ` · ${conversation.pageName}` : ""}
              {conversation.channelType ? ` · ${conversation.channelType}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onUpdateStatus("pending")}
              disabled={isUpdatingStatus || !canMarkPending}
            >
              Mark Pending
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onUpdateStatus("resolved")}
              disabled={isUpdatingStatus || !canMarkResolved}
            >
              Mark Resolved
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" role="log" aria-live="polite" aria-relevant="additions text">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-full items-center justify-center">
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-10 text-center shadow-sm">
              <MessageCircle className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No messages yet</p>
              <p className="mt-1 text-xs text-slate-500">Start the conversation with a reply.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isOutbound = message.direction === "outbound";
              const bubbleTone = isOutbound
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-900 border border-slate-200";

              return (
                <div
                  key={message.id}
                  className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
                >
                  <div className={cn("max-w-[min(42rem,92%)] rounded-3xl px-4 py-3 shadow-sm", bubbleTone)}>
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.body || ""}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="outline" className={cn("rounded-full", isOutbound ? "border-white/20 bg-white/10 text-white" : "bg-slate-50 text-slate-600")}>
                        {getSenderLabel(message.senderType)}
                      </Badge>
                      <span className={cn(isOutbound ? "text-white/70" : "text-slate-500")}>
                        {formatRelativeTime(message.sentAt || message.receivedAt || message.createdAt)}
                      </span>
                      <span className={cn(isOutbound ? "text-white/50" : "text-slate-400")}>
                        {message.deliveryStatus}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <ReplyComposer
          onSend={onSendReply}
          onGenerateDraft={onGenerateDraft}
          isSending={isSending}
        />
      </div>
    </section>
  );
}
