import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { useTaskHarnessOutputEvents } from "@/lib/useTaskHarnessOutputEvents";

const ACTIVE_STATUSES = new Set(["running", "claimed", "leased", "preparing", "uploading", "publishing", "indexing"]);
const WAITING_STATUSES = new Set(["pending", "queued", "retry_scheduled", "waiting_external", "waiting_approval"]);

function statusLabel(status: string, t: (key: string) => string): string {
  if (ACTIVE_STATUSES.has(status)) return t("chat.executionRunning");
  if (WAITING_STATUSES.has(status)) return t("chat.executionWaiting");
  if (["completed", "succeeded"].includes(status)) return t("chat.executionCompleted");
  if (["failed", "expired"].includes(status)) return t("chat.executionAttention");
  if (status === "cancelled") return t("chat.executionCancelled");
  return t("chat.executionStatusUnknown");
}

function activityLabel(type: string, t: (key: string) => string): string {
  if (["CREATED", "QUEUED", "DISPATCH_REQUESTED"].includes(type)) return t("taskControl.activityQueued");
  if (type === "LEASE_ACQUIRED") return t("taskControl.activityAssigned");
  if (["PROGRESS", "RUNNER_STAGE_ADVANCED"].includes(type)) return t("taskControl.activityProgress");
  if (type === "HEARTBEAT") return t("taskControl.activityHeartbeat");
  if (["WAITING_APPROVAL", "AUTHORIZATION_HOLD_PLACED"].includes(type)) return t("taskControl.activityApproval");
  if (type === "WAITING_EXTERNAL") return t("taskControl.activityWaiting");
  if (["FAILED", "EXPIRED", "TIMEOUT"].includes(type)) return t("taskControl.activityProblem");
  if (type === "CANCELLED") return t("taskControl.activityCancelled");
  return t("taskControl.activityRecorded");
}

function taskControlHref(conversationId: number, threadId?: string | null): string {
  return `/chat?panel=control-plane&view=full&c=${conversationId}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`;
}

/** Safe lifecycle summary for Chat; detailed harness output stays in authorized Task Control. */
export function ConversationExecutionActivity({ conversationId, threadId = null }: { conversationId: number | null; threadId?: string | null }) {
  const { t, locale } = useScopedTranslation("chat");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const query = trpc.workerJobs.observability.useQuery(
    conversationId ? { conversationId, threadId } : {},
    {
      enabled: Boolean(conversationId),
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const selectedJob = useMemo(() => {
    const items = query.error ? [] : query.data?.items ?? [];
    return items.find(item => item.id === selectedJobId)
      ?? items.find(item => ACTIVE_STATUSES.has(item.status))
      ?? items[0]
      ?? null;
  }, [query.data?.items, query.error, selectedJobId]);
  const detailQuery = trpc.workerJobs.observabilityDetail.useQuery(
    {
      jobId: selectedJob?.id ?? "",
      ...(query.data?.snapshot.projectionToken ? { projectionToken: query.data.snapshot.projectionToken } : {}),
    },
    {
      enabled: Boolean(conversationId && selectedJob && query.data?.snapshot.projectionToken),
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const [developerDetails, setDeveloperDetails] = useState(false);
  const harnessOutput = useTaskHarnessOutputEvents(selectedJob?.id ?? null, developerDetails);
  const { events, eventsJobId, query: developerEventsQuery, hasMore } = harnessOutput;

  if (!conversationId) return null;
  const failed = Boolean(query.error || detailQuery.error);
  if (!selectedJob && !query.isLoading && !failed) return null;

  const activity = detailQuery.data?.timeline?.at(-1);
  const activityAt = activity?.at ? new Date(activity.at) : null;
  const formattedTime = activityAt && Number.isFinite(activityAt.getTime())
    ? activityAt.toLocaleString(locale === "th" ? "th-TH" : "en-US")
    : null;

  return (
    <section className="mx-auto my-3 w-full max-w-4xl rounded-[var(--radius-element)] border border-[var(--color-border)] bg-[var(--color-background-surface)] p-3 shadow-[var(--shadow-low)] sm:p-4" aria-label={t("chat.executionActivityTitle")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("chat.executionActivityTitle")}</h2>
        {selectedJob ? <Badge variant={ACTIVE_STATUSES.has(selectedJob.status) ? "secondary" : "outline"}>{statusLabel(selectedJob.status, t)}</Badge> : null}
      </header>
      {(query.data?.items.length ?? 0) > 1 ? (
        <label className="mt-2 block space-y-1">
          <span className="text-xs text-muted-foreground">{t("chat.executionSelectJob")}</span>
          <select
            aria-label={t("chat.executionSelectJob")}
            value={selectedJob?.id ?? ""}
            onChange={event => setSelectedJobId(event.target.value)}
            className="h-9 w-full rounded-[var(--radius-element)] border border-[var(--color-border)] bg-[var(--color-background-surface)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {query.data?.items.map(item => <option key={item.id} value={item.id}>{item.jobType} · {statusLabel(item.status, t)} · {item.id}</option>)}
          </select>
        </label>
      ) : null}
      {query.isLoading && !selectedJob ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">{t("chat.executionActivityLoading")}</p>
      ) : failed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground" role="alert">{t("chat.executionActivityUnavailable")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching || detailQuery.isFetching}
            onClick={() => void Promise.all([query.refetch(), detailQuery.refetch()])}
          >
            {query.isFetching || detailQuery.isFetching ? t("chat.executionActivityRetrying") : t("chat.executionActivityRetry")}
          </Button>
        </div>
      ) : selectedJob ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {activity ? activityLabel(activity.type, t) : t("chat.executionActivityRecorded")}
            {formattedTime ? ` · ${formattedTime}` : ""}
          </p>
          {detailQuery.data ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <dt className="font-medium">{t("chat.executionAgent")}</dt>
              <dd>{detailQuery.data.executionIdentity?.agent ?? t("chat.executionNotRecorded")}</dd>
              <dt className="font-medium">{t("chat.executionHarness")}</dt>
              <dd>{detailQuery.data.executionIdentity?.harness ?? t("chat.executionNotRecorded")}</dd>
              <dt className="font-medium">{t("chat.executionModel")}</dt>
              <dd>{detailQuery.data.executionIdentity?.model ?? t("chat.executionNotRecorded")}</dd>
              <dt className="font-medium">{t("chat.executionRunner")}</dt>
              <dd>{detailQuery.data.runner?.displayName ?? t("chat.executionNotRecorded")}</dd>
              <dt className="font-medium">{t("chat.executionRun")}</dt>
              <dd>{detailQuery.data.executionIdentity?.runId ?? t("chat.executionNotRecorded")}</dd>
              <dt className="font-medium">{t("chat.executionJob")}</dt>
              <dd>{selectedJob.id}</dd>
              <dt className="font-medium">{t("chat.executionWorker")}</dt>
              <dd>{detailQuery.data.worker?.displayName ?? t("chat.executionNotRecorded")}</dd>
            </dl>
          ) : null}
        </>
      ) : null}
      <Button asChild variant="link" className="mt-1 h-auto px-0 py-1 text-sm">
        <a href={taskControlHref(conversationId, threadId)}>{t("chat.executionOpenTaskControl")}</a>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-2 mt-1 h-auto px-2 py-1 text-sm"
        aria-pressed={developerDetails}
        onClick={() => setDeveloperDetails(value => !value)}
      >
        {developerDetails ? t("taskControl.simpleMode") : t("taskControl.developerMode")}
      </Button>
      {developerDetails ? (
        <section className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3" aria-label={t("taskControl.harnessOutputTitle")}>
          <h3 className="text-sm font-semibold">{t("taskControl.harnessOutputTitle")}</h3>
          {hasMore ? <p className="text-sm text-muted-foreground" role="status">{t("taskControl.harnessOutputBacklog")}</p> : null}
          {!selectedJob ? <p className="text-sm text-muted-foreground">{t("taskControl.harnessOutputNotStarted")}</p> : null}
          {selectedJob && (developerEventsQuery.isLoading || eventsJobId !== selectedJob.id) && events.length === 0 ? <p className="text-sm text-muted-foreground" role="status">{t("taskControl.harnessOutputLoading")}</p> : null}
          {selectedJob && developerEventsQuery.error ? <p className="text-sm text-destructive">{t("taskControl.harnessOutputUnavailable")}</p> : null}
          {selectedJob && !developerEventsQuery.error && !developerEventsQuery.isLoading && eventsJobId === selectedJob.id && events.length === 0 ? <p className="text-sm text-muted-foreground">{t("taskControl.harnessOutputEmpty")}</p> : null}
          {eventsJobId === selectedJob?.id && events.length > 0 ? (
            <ol className="max-h-64 space-y-3 overflow-y-auto rounded-[var(--radius-element)] border border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:max-h-96" aria-live="polite">
              {events.map(event => (
                <li key={event.id} className="space-y-1 border-b border-[var(--color-border)] pb-3 last:border-b-0 last:pb-0" data-testid="chat-harness-output-event">
                  <p className="text-xs font-medium text-muted-foreground">
                    {event.kind.replaceAll("_", " ")}{event.name ? ` · ${event.name}` : ""}{event.status ? ` · ${event.status}` : ""}{event.exitCode !== undefined ? ` · exit ${event.exitCode}` : ""} · {new Date(event.at).toLocaleTimeString(locale === "th" ? "th-TH" : "en-US")}
                  </p>
                  {event.path ? <p className="break-all font-mono text-xs">{event.path}</p> : null}
                  {event.detail ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-xs">{event.detail}</pre> : null}
                  {event.text ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-sm">{event.text}</pre> : null}
                  {event.diff ? <details><summary className="cursor-pointer text-xs">{t("taskControl.harnessOutputDiff")}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-xs">{event.diff}</pre></details> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
