import { Heading, HStack, Section, Text, VStack } from "@/components/AppPage";
import { Link } from "wouter";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type WorkItem = { id: string; status: string; operatorAttention?: { required: boolean } };

/** A bounded, conversation-scoped view of the existing authorized job projection. */
export function WorkOverview({ items, state, hasContext, fleetScope, hasMore, hasWorkspace, monitorHref }: {
  items: WorkItem[];
  state: "loading" | "unavailable" | "ready";
  hasContext: boolean;
  fleetScope: boolean;
  hasMore: boolean;
  hasWorkspace: boolean;
  monitorHref: string;
}) {
  const { t } = useScopedTranslation("chat");
  const attention = items.filter(item => item.operatorAttention?.required || ["failed", "expired"].includes(item.status));
  const active = items.filter(item => !attention.includes(item) && ["running", "claimed", "leased", "preparing", "uploading", "publishing", "indexing"].includes(item.status));
  const waiting = items.filter(item => !attention.includes(item) && ["pending", "queued", "retry_scheduled", "waiting_external"].includes(item.status));
  const completed = items.filter(item => ["completed", "succeeded"].includes(item.status));
  const other = items.filter(item => !attention.includes(item) && !active.includes(item) && !waiting.includes(item) && !completed.includes(item));
  const count = (value: number) => state === "ready" ? String(value) : "—";

  return (
    <Section padding={4}>
      <VStack as="section" gap={3}>
        <Heading level={3}>{t(hasContext ? "taskControl.overviewTitle" : fleetScope ? "taskControl.overviewFleetTitle" : "taskControl.overviewAllTitle")}</Heading>
        <Text as="p" type="supporting">
          {!hasContext ? t("taskControl.overviewNoContext") : hasWorkspace ? t("taskControl.overviewWorkspace") : t("taskControl.overviewChat")}
        </Text>
        {state === "loading" ? <Text as="p">{t("taskControl.overviewLoading")}</Text> : null}
        {state === "unavailable" ? <Text as="p">{t("taskControl.overviewUnavailable")}</Text> : null}
        <HStack as="section" gap={4} wrap="wrap" aria-label={t("taskControl.overviewTitle")}>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.attention")}</Heading><Text as="p">{count(attention.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.running")}</Heading><Text as="p">{count(active.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.waiting")}</Heading><Text as="p">{count(waiting.length)}</Text></VStack>
          <VStack as="section" gap={1}><Heading level={4}>{t("taskControl.recentCompleted")}</Heading><Text as="p">{count(completed.length)}</Text></VStack>
        </HStack>
        {state === "ready" && attention.length > 0 ? <Text as="p">{t("taskControl.attentionNextStep")}</Text> : null}
        {state === "ready" && active.length > 0 ? <Text as="p" type="supporting">{t("taskControl.activityUnknown")}</Text> : null}
        {state === "ready" && other.length > 0 ? <Text as="p" type="supporting">{t("taskControl.otherStatuses")}</Text> : null}
        <Text as="p" type="supporting">{state === "ready" && completed.length ? t("taskControl.completedUnverified") : t("taskControl.resultsUnknown")}</Text>
        {hasMore && state === "ready" ? <Text as="p" type="supporting">{t("taskControl.overviewPartial")}</Text> : null}
        {monitorHref ? <Link href={monitorHref}>{t("taskControl.openWorkDetails")}</Link> : null}
      </VStack>
    </Section>
  );
}
