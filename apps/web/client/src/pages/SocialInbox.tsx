import { useMemo } from "react";
import { MessageCircle, RefreshCcw, ServerCrash } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSocialInbox } from "@/hooks/useSocialInbox";
import { ConversationList } from "@/components/social/ConversationList";
import { MessageThread } from "@/components/social/MessageThread";
import { SocialPageShell } from "@/components/social/SocialPageShell";
import { formatConversationStatus } from "@/types/social";

export default function SocialInbox() {
  const inbox = useSocialInbox();

  const pageOptions = useMemo(() => inbox.pages, [inbox.pages]);
  const selectedPageLabel = useMemo(() => {
    if (inbox.pageFilter === undefined) return "All pages";
    return pageOptions.find((page) => page.id === inbox.pageFilter)?.label ?? `Page ${inbox.pageFilter}`;
  }, [inbox.pageFilter, pageOptions]);
  const totalUnread = inbox.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const activeConversations = inbox.conversations.filter((conversation) => {
    const status = conversation.status.toLowerCase();
    return status === "open" || status === "pending";
  }).length;
  const coveredPages = new Set(inbox.conversations.map((conversation) => conversation.pageId)).size;
  const inboxStats = [
    { label: "Unread", value: totalUnread, color: "bg-cyan-500" },
    { label: "Active", value: activeConversations, color: "bg-emerald-500" },
    { label: "Pages", value: coveredPages, color: "bg-sky-500" },
  ];
  const inboxMax = Math.max(...inboxStats.map((stat) => stat.value), 1);
  const hero = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-cyan-600 shadow-sm shadow-cyan-200/60">
            <MessageCircle className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Conversation flow
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {inbox.conversations.length} conversation{inbox.conversations.length === 1 ? "" : "s"} in view
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Reply faster, filter by page or status, and keep the team focused on the threads that still need attention.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPageLabel}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {activeConversations} active
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {inboxStats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{ width: `${Math.max((stat.value / inboxMax) * 100, stat.value > 0 ? 28 : 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Unread messages</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{totalUnread}</p>
        <p className="mt-2 text-sm text-slate-500">Messages waiting for a response.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-cyan-700">
          <MessageCircle className="h-4 w-4" />
          Fast response queue
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pages covered</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{coveredPages}</p>
        <p className="mt-2 text-sm text-slate-500">Channels currently contributing conversations.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-sky-700">
          <MessageCircle className="h-4 w-4" />
          Multi-page view
        </div>
      </div>
    </div>
  );

  return (
    <SocialPageShell
      icon={MessageCircle}
      title="Social Inbox"
      eyebrow="Conversation triage"
      description="Track Messenger threads, manage replies, and keep an eye on unread conversations."
      tone="inbox"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {inbox.statusFilter === "all" ? "All" : formatConversationStatus(inbox.statusFilter)}
        </Badge>
      }
      actions={
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Page</span>
            <span className="text-sm text-slate-600">{selectedPageLabel}</span>
            <Select
              value={inbox.pageFilter === undefined ? "all" : String(inbox.pageFilter)}
              onValueChange={(value) => inbox.setPageFilter(value === "all" ? undefined : Number(value))}
            >
              <SelectTrigger aria-label="Page filter" className="w-[220px] rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pages</SelectItem>
                {pageOptions.map((page) => (
                  <SelectItem key={page.id} value={String(page.id)}>
                    {page.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl border-slate-200 bg-white"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </>
      }
      hero={hero}
    >
      {inbox.error ? (
        <Alert className="border-rose-200 bg-rose-50 text-rose-900">
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Unable to load Social Inbox</AlertTitle>
          <AlertDescription>
            {inbox.error instanceof Error ? inbox.error.message : "The inbox is currently unavailable."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
        <ConversationList
          className="w-full max-w-[360px] shrink-0"
          conversations={inbox.conversations}
          selectedId={inbox.selectedConversationId}
          statusFilter={inbox.statusFilter}
          onStatusFilterChange={inbox.setStatusFilter}
          onSelect={inbox.selectConversation}
          isLoading={inbox.isLoading}
          hasNextPage={inbox.hasNextPage}
          onLoadMore={inbox.fetchNextPage}
          isLoadingMore={inbox.isFetchingNextPage}
        />
        <div className="min-w-0 flex-1">
          <MessageThread
            conversation={inbox.selectedConversation}
            messages={inbox.messages}
            isLoading={inbox.isLoading && inbox.selectedConversationId !== null}
            onSendReply={inbox.sendReply}
            onGenerateDraft={inbox.generateDraft}
            onUpdateStatus={inbox.updateStatus}
            isSending={inbox.isSending}
            isUpdatingStatus={inbox.isUpdatingStatus}
          />
        </div>
      </div>
    </SocialPageShell>
  );
}
