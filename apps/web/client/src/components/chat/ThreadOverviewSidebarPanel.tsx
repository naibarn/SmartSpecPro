import { useMemo, useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";

const STATUS_GROUPS = [
  "WORKING", "WAITING_ON_YOU", "READY_FOR_REVIEW", "LANDING", "IDLE", "RESOLVED",
] as const;
const OVERVIEW_GROUPS = [...STATUS_GROUPS, "UNKNOWN", "STALE", "UNAVAILABLE", "ERROR"] as const;
const FILTER_STATUSES = ["", ...OVERVIEW_GROUPS] as const;

type ThreadStatus = typeof FILTER_STATUSES[number];

export function ThreadOverviewSidebarPanel({
  onOpenThread,
  search,
}: {
  onOpenThread: (conversationId: number, threadId: string) => void;
  search: string;
}) {
  const { t, locale } = useScopedTranslation("chat");
  const [status, setStatus] = useState<ThreadStatus>("");
  const query = trpc.chat.listRecentConversationThreads.useInfiniteQuery(
    { limit: 30, search: search.trim() || undefined, status: status || undefined },
    {
      initialCursor: null,
      getNextPageParam: page => page.nextCursor ?? undefined,
      staleTime: 10_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const items = useMemo(() => (query.data?.pages ?? []).flatMap(page => page.items), [query.data?.pages]);
  // The server orders this cursor by verified latest activity. Keep that
  // single ordering across statuses so recently active work is always first.
  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(locale === "th" ? "th-TH" : "en-US", { dateStyle: "short", timeStyle: "short" })
      : t("threads.timeUnknown");
  };

  return (
    <section className="space-y-3 p-3" aria-label={t("threads.overviewTitle")}>
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">{t("threads.overviewTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("threads.overviewDescription")}</p>
        <p className="text-xs text-muted-foreground">{t("threads.overviewHint")}</p>
      </header>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t("threads.statusFilter")}</span>
        <select
          aria-label={t("threads.statusFilter")}
          value={status}
          onChange={event => setStatus(event.target.value as ThreadStatus)}
          className="h-9 w-full rounded-[var(--radius-element)] border border-[var(--color-border)] bg-[var(--color-background-surface)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {FILTER_STATUSES.map(value => <option key={value || "all"} value={value}>{value ? t(`threads.status.${value}`) : t("threads.allStatuses")}</option>)}
        </select>
      </label>
      {query.isLoading ? <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t("threads.loading")}</p> : null}
      {query.error ? <p className="text-sm text-destructive" role="status">{t("threads.overviewUnavailable")}</p> : null}
      {!query.isLoading && !query.error && items.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("threads.overviewEmpty")}</p> : null}
      {items.length > 0 ? (
        <ol className="space-y-1" aria-label={t("threads.recentActivityOrder")}>
          {items.map(item => (
            <li key={item.threadId}>
              <button
                type="button"
                onClick={() => onOpenThread(item.conversationId, item.threadId)}
                aria-label={t("threads.openThread", { thread: item.title, conversation: item.conversationTitle })}
                className="flex min-h-12 w-full items-start gap-2 rounded-[var(--radius-element)] px-2 py-2 text-left hover:bg-[var(--color-overlay-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.conversationTitle}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatTime(item.lastActivityAt)} · {t(`threads.status.${item.status}`)}</span>
                </span>
              </button>
              {item.latestJob ? <Link
                href={`/agent-monitor?conversationId=${item.conversationId}&threadId=${encodeURIComponent(item.threadId)}&jobId=${encodeURIComponent(item.latestJob.jobId)}`}
                className="ml-8 inline-block rounded px-1 py-1 text-xs text-[var(--color-text-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >{t("threads.openTaskControl")}</Link> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {query.hasNextPage ? (
        <Button type="button" variant="ghost" size="sm" className="w-full gap-2" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {query.isFetchingNextPage ? t("threads.loadingMore") : t("threads.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
