import { Heading, HStack, Section, Text, VStack } from "@/components/AppPage";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type WorkItem = { id: string; status: string; operatorAttention?: { required: boolean } };
type Activity = { id: string; type: string; at: string; source?: { kind: string } };

function activityLabel(type: string): string {
  if (["CREATED", "QUEUED", "DISPATCH_REQUESTED"].includes(type)) return "taskControl.activityQueued";
  if (type === "LEASE_ACQUIRED") return "taskControl.activityAssigned";
  if (["PROGRESS", "RUNNER_STAGE_ADVANCED"].includes(type)) return "taskControl.activityProgress";
  if (type === "HEARTBEAT") return "taskControl.activityHeartbeat";
  if (["WAITING_APPROVAL", "AUTHORIZATION_HOLD_PLACED"].includes(type)) return "taskControl.activityApproval";
  if (type === "WAITING_EXTERNAL") return "taskControl.activityWaiting";
  if (["FAILED", "EXPIRED", "TIMEOUT"].includes(type)) return "taskControl.activityProblem";
  if (type === "CANCELLED") return "taskControl.activityCancelled";
  return "taskControl.activityRecorded";
}

/** A bounded, conversation-scoped view of the existing authorized job projection. */
export function WorkOverview({ items, state, hasContext, fleetScope, hasMore, hasWorkspace, monitorHref, activity, activityState, snapshotAt, developer, onRefresh, refreshing }: {
  items: WorkItem[];
  state: "loading" | "unavailable" | "ready";
  hasContext: boolean;
  fleetScope: boolean;
  hasMore: boolean;
  hasWorkspace: boolean;
  monitorHref: string;
  activity: Activity[];
  activityState: "no-task" | "loading" | "unavailable" | "ready";
  snapshotAt: string | null;
  developer: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t, locale } = useScopedTranslation("chat");
  const attention = items.filter(item => item.operatorAttention?.required || ["failed", "expired"].includes(item.status));
  const active = items.filter(item => !attention.includes(item) && ["running", "claimed", "leased", "preparing", "uploading", "publishing", "indexing"].includes(item.status));
  const waiting = items.filter(item => !attention.includes(item) && ["pending", "queued", "retry_scheduled", "waiting_external"].includes(item.status));
  const completed = items.filter(item => ["completed", "succeeded"].includes(item.status));
  const other = items.filter(item => !attention.includes(item) && !active.includes(item) && !waiting.includes(item) && !completed.includes(item));
  const count = (value: number) => state === "ready" ? String(value) : "—";
  const recentActivity = [...new Map(activity.map(event => [event.id, event])).values()]
    .sort((left, right) => right.at.localeCompare(left.at) || right.id.localeCompare(left.id)).slice(0, 3);
  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale === "th" ? "th-TH" : "en-US") : t("taskControl.timeUnknown");
  };

  return (
    <Section padding={4}>
      <VStack as="section" gap={3}>
        <Heading level={3}>{t(hasContext ? "taskControl.overviewTitle" : fleetScope ? "taskControl.overviewFleetTitle" : "taskControl.overviewAllTitle")}</Heading>
        <Text as="p" type="supporting">
          {!hasContext ? t("taskControl.overviewNoContext") : hasWorkspace ? t("taskControl.overviewWorkspace") : t("taskControl.overviewChat")}
        </Text>
        {state === "loading" ? <Text as="p">{t("taskControl.overviewLoading")}</Text> : null}
        {state === "unavailable" ? <HStack gap={2} wrap="wrap">
          <Text as="p" role="alert">{t("taskControl.overviewUnavailable")}</Text>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? t("taskControl.refreshing") : t("taskControl.retryWorkStatus")}
          </Button>
        </HStack> : null}
        <HStack as="section" gap={4} wrap="wrap" aria-label={t("taskControl.overviewTitle")}>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.attention")}</Heading><Text as="p">{count(attention.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.running")}</Heading><Text as="p">{count(active.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.waiting")}</Heading><Text as="p">{count(waiting.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.recentCompleted")}</Heading><Text as="p">{count(completed.length)}</Text></VStack>
        </HStack>
        {state === "ready" && attention.length > 0 ? <Text as="p">{t("taskControl.attentionNextStep")}</Text> : null}
        <VStack as="section" gap={1}>
          <Heading level={4}>{t("taskControl.currentActivity")}</Heading>
          {activityState === "loading" ? <Text as="p" type="supporting">{t("taskControl.activityLoading")}</Text> : null}
          {activityState === "unavailable" ? <Text as="p" type="supporting">{t("taskControl.activityUnavailable")}</Text> : null}
          {activityState === "no-task" || (activityState === "ready" && !recentActivity.length) ? <Text as="p" type="supporting">{t("taskControl.activityUnknown")}</Text> : null}
          {activityState === "ready" && recentActivity.length ? (
            <VStack as="ol" gap={1}>
              {recentActivity.map(event => <li key={event.id}><Text as="p" type="supporting">{t(activityLabel(event.type))} · {formatTime(event.at)}{developer ? ` · ${event.type} · ${event.source?.kind ?? "worker_job_event"}` : ""}</Text></li>)}
            </VStack>
          ) : null}
          {snapshotAt ? <Text as="p" type="supporting">{t("taskControl.snapshotAsOf", { time: formatTime(snapshotAt) })}</Text> : null}
        </VStack>
        {state === "ready" && other.length > 0 ? <Text as="p" type="supporting">{t("taskControl.otherStatuses")}</Text> : null}
        <Text as="p" type="supporting">{state === "ready" && completed.length ? t("taskControl.completedUnverified") : t("taskControl.resultsUnknown")}</Text>
        {hasMore && state === "ready" ? <Text as="p" type="supporting">{t("taskControl.overviewPartial")}</Text> : null}
        {monitorHref ? <Link href={monitorHref}>{t("taskControl.openWorkDetails")}</Link> : null}
      </VStack>
    </Section>
  );
}
