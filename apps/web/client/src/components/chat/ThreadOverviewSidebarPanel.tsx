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
const STATUS_ORDER = new Map(OVERVIEW_GROUPS.map((value, index) => [value, index]));

type ThreadStatus = typeof FILTER_STATUSES[number];
type ThreadGroupItem = { lastActivityAt: string };

export function sortThreadGroupsByRecentActivity<T extends ThreadGroupItem>(
  groups: Array<[string, Map<string | null, T[]>]>,
) {
  const latestActivity = (projects: Map<string | null, T[]>) => {
    let latest = Number.NEGATIVE_INFINITY;
    for (const threads of projects.values()) {
      for (const thread of threads) {
        const activity = Date.parse(thread.lastActivityAt);
        if (Number.isFinite(activity)) latest = Math.max(latest, activity);
      }
    }
    return latest;
  };

  return [...groups].sort(([leftStatus, leftProjects], [rightStatus, rightProjects]) => {
    const leftActivity = latestActivity(leftProjects);
    const rightActivity = latestActivity(rightProjects);
    if (leftActivity !== rightActivity) {
      if (!Number.isFinite(leftActivity)) return Number.isFinite(rightActivity) ? 1 : 0;
      if (!Number.isFinite(rightActivity)) return -1;
      return rightActivity - leftActivity;
    }
    return (STATUS_ORDER.get(leftStatus as typeof OVERVIEW_GROUPS[number]) ?? Number.MAX_SAFE_INTEGER)
      - (STATUS_ORDER.get(rightStatus as typeof OVERVIEW_GROUPS[number]) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function ThreadOverviewSidebarPanel({
  onOpenThread,
  search,
  selectedConversationId,
  selectedThreadId,
}: {
  onOpenThread: (conversationId: number, threadId: string) => void;
  search: string;
  selectedConversationId: number | null;
  selectedThreadId: string | null;
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
  const groupedItems = useMemo(() => {
    const groups = new Map<string, Map<string | null, typeof items>>();
    for (const item of items) {
      const statusItems = groups.get(item.status) ?? new Map<string | null, typeof items>();
      const projectKey = item.projectTitle;
      const projectItems = statusItems.get(projectKey) ?? [];
      projectItems.push(item);
      statusItems.set(projectKey, projectItems);
      groups.set(item.status, statusItems);
    }
    return sortThreadGroupsByRecentActivity([...groups.entries()]);
  }, [items]);
  // The server orders the cursor by verified latest activity. Order status
  // groups by their newest thread too, so an active group cannot be buried
  // below an older group just because of a fixed status priority.
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
      {query.error ? <>
        <p className="text-sm text-destructive" role="alert">{t("threads.overviewUnavailable")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? t("threads.refreshing") : t("threads.retryOverview")}
        </Button>
      </> : null}
      {!query.isLoading && !query.error && items.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("threads.overviewEmpty")}</p> : null}
      {items.length > 0 ? (
        <ol className="space-y-4" aria-label={t("threads.recentActivityOrder")}>
          {groupedItems.map(([groupStatus, projects]) => (
            <li key={groupStatus}>
              <section aria-label={t(`threads.status.${groupStatus}`)} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`threads.status.${groupStatus}`)} · {Array.from(projects.values()).reduce((count, threads) => count + threads.length, 0)}</h4>
                {Array.from(projects.entries()).map(([projectKey, projectItems]) => (
                  <section key={`${groupStatus}:${projectKey}`} className="space-y-1">
                    <h5 className="px-2 text-xs font-medium text-muted-foreground">{projectKey ?? t("threads.projectUnlinked")}</h5>
                    <ol className="space-y-1" aria-label={`${t("threads.projectThreads", { project: projectKey ?? t("threads.projectUnlinked") })} · ${t(`threads.status.${groupStatus}`)}`}>
                      {projectItems.map(item => (
                        <li key={item.threadId}>
                          <button
                            type="button"
                            onClick={() => onOpenThread(item.conversationId, item.threadId)}
                            aria-current={selectedConversationId === item.conversationId && selectedThreadId === item.threadId ? "page" : undefined}
                            aria-label={t("threads.openThread", { thread: item.title, conversation: item.conversationTitle })}
                            className="flex min-h-12 w-full items-start gap-2 rounded-[var(--radius-element)] px-2 py-2 text-left hover:bg-[var(--color-overlay-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            style={selectedConversationId === item.conversationId && selectedThreadId === item.threadId ? {
                              backgroundColor: "var(--color-accent-muted)",
                              color: "var(--color-text-accent)",
                            } : undefined}
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
                  </section>
                ))}
              </section>
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
