import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Section } from "@astryxdesign/core/Section";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { Link } from "@astryxdesign/core/Link";
import { trpc } from "@/lib/trpc";
import { TaskAcceptanceEvidence } from "@/components/task-control/TaskAcceptanceEvidence";
import { formatVerifiedPercentLabel } from "@shared/taskAcceptanceProjection";
import { useTranslation } from "react-i18next";

const metricLabel = (value: number | null): string => value === null ? "Unknown" : `${value.toFixed(1)}%`;
const tokenLabel = (value: number | null): string => value === null ? "Unknown" : value.toLocaleString();
const simpleStatusLabels: Record<string, string> = { running: "In progress", queued: "Waiting to start", completed: "Completed", failed: "Needs attention", cancelled: "Cancelled", waiting_approval: "Waiting for your review", retry_scheduled: "Retry scheduled" };
const simpleStatusLabel = (status: string): string => simpleStatusLabels[status] ?? status.replaceAll("_", " ");
const simpleStepLabel = (step: string | null): string => step ? step.toLowerCase().replaceAll("_", " ") : "Not reported";
const threadOverviewFallbacks: Record<string, string> = {
  "taskControl.threadOverviewTitle": "Project and thread correlation",
  "taskControl.threadOverviewDescription": "Read-only links from authorized task records. A thread can contain multiple Jobs; each link keeps the exact Chat and task context.",
  "taskControl.threadOverviewPageLimit": "Showing threads represented in this task snapshot page. Load the next task page to see older work.",
  "taskControl.threadOverviewEmpty": "No linked work is available in this task snapshot.",
  "taskControl.threadOverviewUnknownTitle": "Thread title unavailable",
  "taskControl.threadOverviewConversationUnknown": "Conversation title unavailable",
  "taskControl.threadOverviewOpenChatThread": "Open this thread in Chat",
  "taskControl.threadOverviewOpenChat": "Open this conversation in Chat",
  "taskControl.threadOverviewChatUnavailable": "No authorized Chat binding is available for this Job.",
  "taskControl.threadOverviewAttempt": "Attempt {{attempt}} of {{maxAttempts}}",
  "taskControl.threadOverviewStageUnknown": "Stage unavailable",
  "taskControl.threadOverviewRunnerUnverified": "Runner identity unverified",
  "taskControl.threadOverviewRunnerUnknown": "Runner unavailable",
  "taskControl.threadOverviewOpenTask": "Open exact task",
};
const chatHref = (conversationId: number, threadId: string | null): string => {
  const params = new URLSearchParams({ c: String(conversationId) });
  if (threadId) params.set("t", threadId);
  return `/chat?${params.toString()}`;
};
const taskHref = (item: { id: string; conversationId: number | null; threadId: string | null }): string => {
  const params = new URLSearchParams({ jobId: item.id });
  if (item.conversationId) {
    params.set("conversationId", String(item.conversationId));
    params.set("threadId", item.threadId ?? "main");
  }
  return `/agent-monitor?${params.toString()}`;
};

export default function TaskObservabilityMonitor() {
  const { t: translate } = useTranslation("chat", { useSuspense: false });
  const t = (key: string, params?: Record<string, string | number>) => translate(key, { ns: "chat", defaultValue: threadOverviewFallbacks[key] ?? key, ...params }) as string;
  const [mode, setMode] = useState("simple");
  const initialParams = new URLSearchParams(window.location.search);
  const requestedJobId = initialParams.get("jobId");
  const jobId = requestedJobId && requestedJobId.length <= 36 ? requestedJobId : undefined;
  const [projectionToken, setProjectionToken] = useState(() => initialParams.get("projectionToken"));
  const [cursor, setCursor] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [specDraft, setSpecDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(jobId ?? null);
  const conversationCandidate = Number(initialParams.get("conversationId"));
  const conversationId = Number.isSafeInteger(conversationCandidate) && conversationCandidate > 0 ? conversationCandidate : undefined;
  const threadScopeParam = initialParams.get("threadId");
  const threadId = threadScopeParam === "main" ? null : threadScopeParam;
  const query = trpc.workerJobs.observability.useQuery({
    cursor,
    ...(projectionToken ? { projectionToken } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(threadScopeParam !== null ? { threadId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(specFilter ? { specId: specFilter } : {}),
  }, { staleTime: 15_000, refetchInterval: 15_000, retry: false });
  const runnerQuery = trpc.runnerNodes.list.useQuery(undefined, { staleTime: 15_000, refetchInterval: 15_000, retry: false });
  const aggregateQuery = trpc.workerJobs.observabilityAggregate.useQuery({
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(specFilter ? { specId: specFilter } : {}),
    ...((query.data?.snapshot.projectionToken ?? projectionToken) ? { projectionToken: query.data?.snapshot.projectionToken ?? projectionToken! } : {}),
  }, { enabled: Boolean((projectFilter || specFilter) && (query.data?.snapshot.projectionToken || projectionToken)), staleTime: 60_000, retry: false });
  const items = query.error ? [] : query.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const detailQuery = trpc.workerJobs.observabilityDetail.useQuery(
    { jobId: selected?.id ?? "", ...((query.data?.snapshot.projectionToken ?? projectionToken) ? { projectionToken: query.data?.snapshot.projectionToken ?? projectionToken! } : {}) },
    { enabled: Boolean(selected), staleTime: 15_000, refetchInterval: 15_000, retry: false },
  );
  const detail = detailQuery.error ? undefined : detailQuery.data;
  const runners = runnerQuery.error ? [] : runnerQuery.data?.runners ?? [];
  const aggregate = aggregateQuery.error ? undefined : aggregateQuery.data;
  const filtered = projectFilter || specFilter;
  const snapshotExpired = query.error?.data?.code === "PRECONDITION_FAILED";
  const threadGroups = new Map<string, { title: string; conversationTitle: string | null; conversationId: number | null; threadId: string | null; jobs: typeof items }>();
  for (const item of items) {
    const key = item.conversationId ? `${item.conversationId}:${item.threadId ?? "main"}` : `unlinked:${item.id}`;
    const existing = threadGroups.get(key);
    if (existing) existing.jobs.push(item);
    else threadGroups.set(key, {
      title: item.threadTitle ?? t("taskControl.threadOverviewUnknownTitle"),
      conversationTitle: item.conversationTitle,
      conversationId: item.conversationId,
      threadId: item.threadId,
      jobs: [item],
    });
  }

  return (
    <VStack as="main" gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>{mode === "simple" ? "Task Control" : "Task Control and Agent Monitor"}</Heading>
        <Text type="supporting">{mode === "simple" ? "See what is happening, what is verified, and whether anything needs your attention." : "Canonical task, runner, goal, model and resource evidence. Missing evidence remains unknown."}</Text>
        <SegmentedControl label="Task Control view" value={mode} onChange={setMode}>
          <SegmentedControlItem value="simple" label="Simple" />
          <SegmentedControlItem value="developer" label="Developer" />
        </SegmentedControl>
      </VStack>

      {mode === "simple" && items.length > 0 ? <Section>
        <VStack gap={2}>
          <Heading level={2}>Your tasks</Heading>
          {items.map((item) => (
            <HStack as="article" key={item.id} gap={2} wrap="wrap" padding={2}>
              <Button label={`${item.threadTitle ?? item.jobType} · ${simpleStatusLabel(item.status)}`} variant={selected?.id === item.id ? "primary" : "secondary"} onClick={() => setSelectedId(item.id)} />
              {item.operatorAttention.required ? <Badge variant="warning" label="Action needed" /> : null}
              <Text type="supporting">Current step: {simpleStepLabel(item.stage)}</Text>
              {item.conversationTitle ? <Text type="supporting">Chat: {item.conversationTitle}</Text> : null}
              {item.conversationId ? <Link href={chatHref(item.conversationId, item.threadId)} isStandalone>
                {item.threadId ? "Open in Chat thread" : "Open conversation in Chat"}
              </Link> : null}
            </HStack>
          ))}
        </VStack>
      </Section> : null}

      {mode === "simple" && (query.isLoading || query.error || items.length === 0) ? <Section>
        <VStack gap={2}>
          {query.isLoading ? <Text>Loading your tasks…</Text> : null}
          {query.error ? <Text>{snapshotExpired ? "This task snapshot expired. Refresh to load current information." : "Your tasks could not be refreshed. Check your access and try again."}</Text> : null}
          {!query.isLoading && !query.error && items.length === 0 ? <Text>No tasks are available in this account scope.</Text> : null}
          {query.error || items.length === 0 ? <Button label="Refresh tasks" variant="secondary" onClick={() => { setProjectionToken(null); setCursor(null); setSelectedId(null); void query.refetch(); }} /> : null}
        </VStack>
      </Section> : null}

      {mode === "developer" ? <Section>
        <VStack gap={3}>
          <Heading level={2}>{conversationId ? `Chat ${conversationId} evidence` : query.data?.scope === "tenant_fleet" ? "Tenant fleet and project scope" : "My tasks and project scope"}</Heading>
          {conversationId ? <Text type="supporting">{threadId ? "Thread and conversation scope are bound by the authenticated read API to the conversation owner and current tenant." : "Conversation scope is bound by the authenticated read API to the conversation owner and current tenant."}</Text> : null}
          <HStack gap={2} wrap="wrap">
            <TextInput label="Project ID" value={projectDraft} onChange={setProjectDraft} placeholder="Canonical project ID" />
            <TextInput label="SPEC ID" value={specDraft} onChange={setSpecDraft} placeholder="SPEC-###" />
            <Button label="Apply scope" variant="secondary" onClick={() => { setProjectFilter(projectDraft.trim()); setSpecFilter(specDraft.trim()); setCursor(null); setSelectedId(null); }} />
            {filtered ? <Button label="Clear scope" variant="ghost" onClick={() => { setProjectDraft(""); setSpecDraft(""); setProjectFilter(""); setSpecFilter(""); setCursor(null); setSelectedId(null); }} /> : null}
            <Text type="supporting">Snapshot {query.data?.snapshot.asOf ?? "loading"} · {query.data?.snapshot.consistency ?? "consistency unknown"}; mutable task state can remain live.</Text>
          </HStack>
          {snapshotExpired ? <Text>Snapshot expired. Refresh snapshot to load current evidence.</Text> : null}
          {query.error && !snapshotExpired ? <Text>Task list could not be refreshed. Check access and retry the snapshot.</Text> : null}
          {query.isLoading ? <Text>Loading owned jobs…</Text> : null}
          {!query.isLoading && items.length === 0 ? <Text>No matching canonical jobs are available in this account scope.</Text> : null}
          <VStack as="ol" gap={1}>
            {items.map((item) => (
              <HStack as="li" key={item.id} gap={3} wrap="wrap" padding={2}>
                <Button
                  label={`${item.jobType} · ${item.status} · ${item.id}`}
                  variant={selected?.id === item.id ? "primary" : "secondary"}
                  onClick={() => setSelectedId(item.id)}
                />
                {item.operatorAttention.required ? <Badge variant="warning" label="Action required" /> : null}
                <Text type="supporting">{item.stage ?? "stage unknown"} · attempt {item.attempt}/{item.maxAttempts}</Text>
                <Text type="supporting">Worker {item.workerId ?? "unassigned"}</Text>
                {query.data?.scope === "tenant_fleet" ? <Text type="supporting">Owner {item.ownerUserId}</Text> : null}
                {item.conversationId ? <Link href={chatHref(item.conversationId, item.threadId)} isStandalone>
                  {item.threadId ? "Open in Chat thread" : "Open conversation in Chat"}
                </Link> : null}
              </HStack>
            ))}
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Refresh snapshot" variant="secondary" onClick={() => { setProjectionToken(null); setCursor(null); setSelectedId(null); }} />
            {cursor ? <Button label="Previous page" variant="secondary" onClick={() => { setCursor(null); setSelectedId(null); }} /> : null}
            {query.data?.nextCursor ? <Button label="Next page" variant="secondary" onClick={() => { setCursor(query.data!.nextCursor); setSelectedId(null); }} /> : null}
            <Text type="supporting">Projection snapshot expires {query.data?.snapshot.expiresAt ?? "unknown"}; refresh to start a new snapshot shared with aggregate and detail reads.</Text>
          </HStack>
        </VStack>
      </Section> : null}

      {mode === "developer" && (projectFilter || specFilter) ? (
        <Section>
          <VStack gap={2}>
            <Heading level={2}>Project / SPEC usage union</Heading>
            {aggregateQuery.isLoading ? <Text>Loading bounded aggregate…</Text> : null}
            {aggregateQuery.error ? <Text>Aggregate is unavailable in the current account scope.</Text> : null}
            {aggregate ? <>
              <Text>{aggregate.scope} · {aggregate.projectId ?? "project unknown"} · {aggregate.specId ?? "SPEC unknown"} · binding {aggregate.scopeBinding.status} · {aggregate.observedJobCount} observed jobs · as of {aggregate.asOf} · {aggregate.consistency}</Text>
              <Text type="supporting">{aggregate.scopeBinding.reason}</Text>
              <Text>Goal coverage {aggregate.goalCoverage.status} · baseline candidates {aggregate.goalCoverage.baselineCandidateCount} · {aggregate.goalCoverage.reason}</Text>
              <Text>Unique linked calls {aggregate.usage.counts.unique}; corrections {aggregate.usage.counts.corrections}; replayed {aggregate.usage.counts.replayed}; missing {aggregate.usage.counts.missing}; overlap {aggregate.usage.counts.overlap}</Text>
              <Text>Complete linked token total {tokenLabel(aggregate.usage.completeTotalTokens)} · known subtotal {aggregate.usage.knownSubtotalTokens.toLocaleString()} · {aggregate.usage.coverage.reason}</Text>
              <Text>Reservation estimate {tokenLabel(aggregate.resourceEstimates.reservedTokenEstimate)} tokens across {aggregate.resourceEstimates.observedReservationCount} distinct receipts · missing/conflicting estimates {aggregate.resourceEstimates.missingReservationTokenEstimateCount} · known inference cost estimate {aggregate.resourceEstimates.inferenceCostEstimateMicros.toLocaleString()} micro-USD · missing estimates {aggregate.resourceEstimates.missingInferenceCostEstimateCount} · quota {aggregate.quotaCoverage.status}</Text>
              <Text>Canonical job settlement markers {aggregate.jobSettlementMarkers?.observedCount ?? "Unknown"} · {aggregate.jobSettlementMarkers?.byType?.map((item) => `${item.type}: ${item.count}`).join(", ") ?? "type coverage unknown"} · marker-only, no monetary amount asserted</Text>
              <Text>Bound runner accounting evidence {aggregate.economicSettlementEvidence?.observedEventCount ?? "Unknown"} events · settled {aggregate.economicSettlementEvidence?.settledCount ?? "Unknown"} · reconciliation required {aggregate.economicSettlementEvidence?.reconciliationRequiredCount ?? "Unknown"} · classifications {aggregate.economicSettlementEvidence?.byClassification?.map((item) => `${item.classification}: ${item.count}`).join(", ") ?? "Unknown"} · provider capture subtotals {aggregate.economicSettlementEvidence?.capturedProviderAmounts?.map((item) => `${item.capturedMinorUnits ?? "Unknown"} ${item.currency} minor units`).join(", ") ?? "Unknown"} · missing capture values {aggregate.economicSettlementEvidence?.missingProviderCaptureValueCount ?? "Unknown"} · {aggregate.economicSettlementEvidence?.meaning ?? "coverage unknown"}</Text>
              {aggregate.usage.settlements.slice(0, 10).map((settlement) => <Text key={`${settlement.identity.scope}:${settlement.identity.consumptionId}`}>Settlement: {settlement.amount ?? "Unknown"} {settlement.currency ?? "currency unknown"} · {settlement.funding ?? "funding unknown"} · {settlement.identity.consumptionId}</Text>)}
              {aggregate.usage.settlements.length > 10 ? <Text type="supporting">Showing 10 of {aggregate.usage.settlements.length} settlement receipts.</Text> : null}
              <Text type="supporting">Sources: {aggregate.usage.coverage.sources.join(", ")} · uncovered: {aggregate.usage.coverage.missingSources.join(", ")}</Text>
            </> : null}
          </VStack>
        </Section>
      ) : null}

      {mode === "developer" ? <Section>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={2}>{t("taskControl.threadOverviewTitle")}</Heading>
            <Text type="supporting">{t("taskControl.threadOverviewDescription")}</Text>
            {query.data?.nextCursor ? <Text type="supporting">{t("taskControl.threadOverviewPageLimit")}</Text> : null}
          </VStack>
          {!query.isLoading && !query.error && threadGroups.size === 0 ? <Text>{t("taskControl.threadOverviewEmpty")}</Text> : null}
          {[...threadGroups.entries()].map(([key, group]) => (
            <VStack as="article" key={key} gap={1} padding={2}>
              <Heading level={3}>{group.title}</Heading>
              <Text type="supporting">{group.conversationTitle ?? t("taskControl.threadOverviewConversationUnknown")}</Text>
              {group.conversationId ? <Link href={chatHref(group.conversationId, group.threadId)} isStandalone>
                {group.threadId ? t("taskControl.threadOverviewOpenChatThread") : t("taskControl.threadOverviewOpenChat")}
              </Link> : <Text type="supporting">{t("taskControl.threadOverviewChatUnavailable")}</Text>}
              <VStack as="ol" gap={1}>
                {group.jobs.map((item) => (
                  <HStack as="li" key={item.id} gap={2} wrap="wrap" padding={1}>
                    <Button label={`${item.jobType} · ${simpleStatusLabel(item.status)} · ${item.id}`} variant={selected?.id === item.id ? "primary" : "secondary"} onClick={() => setSelectedId(item.id)} />
                    <Text type="supporting">{t("taskControl.threadOverviewAttempt", { attempt: item.attempt, maxAttempts: item.maxAttempts })} · {item.stage ?? t("taskControl.threadOverviewStageUnknown")}</Text>
                    <Text type="supporting">{item.runnerId ? runners.find(runner => runner.runnerId === item.runnerId)?.displayName ?? t("taskControl.threadOverviewRunnerUnverified") : t("taskControl.threadOverviewRunnerUnknown")}</Text>
                    <Link href={taskHref(item)} isStandalone>{t("taskControl.threadOverviewOpenTask")}</Link>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          ))}
        </VStack>
      </Section> : null}

      {mode === "developer" ? <Section>
        <VStack gap={2}>
          <Heading level={2}>Available runner fleet</Heading>
          {runnerQuery.error ? <Text>Runner fleet is unavailable in this account scope.</Text> : null}
          {runnerQuery.isLoading ? <Text>Loading runner observations…</Text> : null}
          {!runnerQuery.isLoading && !runnerQuery.error && runners.length === 0 ? <Text>No registered runner is visible in this account scope.</Text> : null}
          {runners.map((runner) => (
            <HStack as="article" key={runner.runnerId} gap={3} wrap="wrap" padding={2}>
              <Text>{runner.displayName ?? runner.runnerId}</Text>
              <Badge label={runner.displayState} variant={runner.displayState === "ready" ? "success" : "neutral"} />
              <Text type="supporting">Trust {runner.trustState} · status {runner.status} · last seen {runner.lastSeenAt ?? "unknown"} · snapshot expires {runner.snapshotExpiresAt ?? "unknown"}</Text>
              <Text type="supporting">{runner.workspaceCount} workspace(s) · {runner.toolCount} tools · {runner.capabilityCount} capabilities</Text>
            </HStack>
          ))}
          <Heading level={3}>Observed runner to task topology</Heading>
          {runners.map((runner) => {
            const linkedJobs = items.filter((item) => item.runnerId === runner.runnerId);
            return (
              <VStack as="article" key={`topology-${runner.runnerId}`} gap={1} padding={2}>
                <Text>{runner.displayName ?? runner.runnerId} · {runner.displayState}</Text>
                {linkedJobs.length ? linkedJobs.map((item) => (
                  <HStack as="article" key={item.id} gap={2} wrap="wrap" padding={2}>
                    <Button label={`↳ ${item.jobType} · ${item.status} · ${item.id}`} variant="ghost" onClick={() => setSelectedId(item.id)} />
                    <Text type="supporting">{item.stage ?? "stage unknown"} · attempt {item.attempt}/{item.maxAttempts}</Text>
                  </HStack>
                )) : <Text type="supporting">No linked task in this page snapshot.</Text>}
              </VStack>
            );
          })}
          {items.some((item) => item.runnerId && !runners.some((runner) => runner.runnerId === item.runnerId)) ? (
            <VStack gap={1} padding={2}>
              <Text>Runner observation unavailable</Text>
              {items.filter((item) => item.runnerId && !runners.some((runner) => runner.runnerId === item.runnerId)).map((item) => <Text key={`unbound-${item.id}`}>↳ {item.jobType} · {item.status} · runner {item.runnerId} (inventory unverified)</Text>)}
            </VStack>
          ) : null}
        </VStack>
      </Section> : null}

      {selected ? (
        <VStack gap={3}>
          {detailQuery.isLoading ? <Section><Text>Loading task detail…</Text></Section> : null}
          {detailQuery.error ? <Section><Text>Task detail is unavailable in the current account scope.</Text></Section> : null}
          {detail && mode === "simple" ? <Section>
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap">
                <Heading level={2}>Your task</Heading>
                <Badge label={simpleStatusLabel(selected.status)} variant={selected.operatorAttention.required ? "warning" : "neutral"} />
              </HStack>
              <Text>Goal summary is not included in this task view.</Text>
              <Text>Current step: {simpleStepLabel(selected.stage)}</Text>
              <Text>Job status: {simpleStatusLabel(selected.status)} · Runner status: {detail.runner?.status ? simpleStatusLabel(detail.runner.status) : "Unknown"} · verification: {detail.goal.status === "PROJECTED" ? (detail.goal.verifiedGoalCompletion.percent === 100 ? "verified complete" : "in progress or pending evidence") : "Unknown"}</Text>
              {detail.goal.status === "PROJECTED" && detail.goal.verifiedGoalCompletion.percent !== null ? (
                <ProgressBar label="Verified progress" value={detail.goal.verifiedGoalCompletion.percent} hasValueLabel formatValueLabel={() => formatVerifiedPercentLabel(detail.goal)} variant={detail.goal.verifiedGoalCompletion.percent === 100 ? "success" : "accent"} />
              ) : <Text>Verified progress: Unknown · {detail.goal.reason ?? "No trusted goal baseline or evidence is available."}</Text>}
              <Heading level={3}>Next step</Heading>
              {detail.operatorAttention.required ? <Text>Please review this task before it can continue.</Text> : detail.goal.status === "PROJECTED" && detail.goal.remainingScope[0]?.nextAction ? <Text>{detail.goal.remainingScope[0].nextAction}</Text> : <Text>No next step is recorded.</Text>}
              <Heading level={3}>Blockers and your action</Heading>
              {detail.goal.status === "PROJECTED" && detail.goal.blockedScope.length ? <Text>A blocker has been recorded for this task.</Text> : <Text>No verified blocker is recorded.</Text>}
              <Text>{detail.operatorAttention.required ? "Action needed: Please review this task." : "No user action is recorded as required."}</Text>
              <Heading level={3}>Deliverables</Heading>
              {detail.acceptance?.graph.references.some((reference) => reference.kind === "evidence") ? <Text>{detail.acceptance.graph.references.filter((reference) => reference.kind === "evidence").length} evidence item(s) recorded. Open Developer mode for their source and verification details.</Text> : <Text>No final deliverable references are recorded in this task view.</Text>}
            </VStack>
          </Section> : null}
          {detail ? <>
          {mode === "developer" ? <Text type="supporting">Developer telemetry refreshes from the canonical read model every 15 seconds. A live terminal stream, file diffs and harness identity are not exposed by this view; unavailable telemetry is not inferred.</Text> : null}
          {mode === "developer" ? <>
          <Section>
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap">
                <Heading level={2}>Task detail</Heading>
                <Badge label={selected.status} variant={selected.operatorAttention.required ? "warning" : "neutral"} />
                <Text type="supporting">{selected.id} · {selected.jobType} · {selected.updatedAt}</Text>
              </HStack>
              <HStack gap={4} wrap="wrap">
                <Text>Stage: {selected.stage ?? "Unknown"}</Text>
                <Text>Heartbeat: {detail.heartbeatAt ?? "Unknown"} · {detail.heartbeatFreshness}</Text>
                <Text>Project: {detail.projectId ?? "Unbound"} · binding {detail.identityBinding.status}</Text>
                <Text>SPEC: {detail.specId ?? "Unbound"} · binding {detail.identityBinding.status}</Text>
                <Text>Runner: {detail.runner?.displayName ?? detail.runner?.status ?? "Unknown"} · freshness {detail.runner?.freshness ?? "unknown"}</Text>
              </HStack>
              <HStack gap={4} wrap="wrap">
                <Text>Agent: {detail.executionIdentity?.agent ?? "Not recorded"}</Text>
                <Text>Harness: {detail.executionIdentity?.harness ?? "Not recorded"}</Text>
                <Text>Model: {detail.executionIdentity?.model ?? "Not recorded"}</Text>
                <Text>Reasoning effort: {detail.executionIdentity?.reasoningEffort ?? "Not recorded"}</Text>
                <Text>Run: {detail.executionIdentity?.runId ?? "Not linked"}</Text>
                <Text>Job: {selected.id}</Text>
                <Text>Worker: {detail.worker?.displayName ?? "Not assigned"}</Text>
              </HStack>
              {detail.operatorAttention.required ? <Text>Human attention: {detail.operatorAttention.reason ?? "required; reason unavailable"}</Text> : null}
              <Text>Recovery: {detail.recovery.retryEligible ? `retry scheduled for ${detail.recovery.nextRetryAt}` : detail.recovery.runnerSessionState ?? "no recovery action recorded"}</Text>
              <Heading level={3}>Goal progress</Heading>
              {detail.goal.status !== "PROJECTED" ? <Text>Unknown · {detail.goal.reason ?? "goal baseline or evidence is unavailable"}.</Text> : (
                <VStack gap={2}>
                  <ProgressBar label="Verified goal completion" value={detail.goal.verifiedGoalCompletion.percent ?? 0} hasValueLabel formatValueLabel={() => formatVerifiedPercentLabel(detail.goal)} variant={detail.goal.verifiedGoalCompletion.percent === 100 ? "success" : "accent"} />
                  <HStack gap={3} wrap="wrap">
                    <Text>Execution {metricLabel(detail.goal.executionProgress.percent)}</Text>
                    <Text>Implementation {metricLabel(detail.goal.implementationCompletion.percent)}</Text>
                    <Text>Work complete {metricLabel(detail.goal.workCompletion.percent)}</Text>
                    <Text>Evidence {detail.goal.evidenceCoverage.coveredCriteria}/{detail.goal.evidenceCoverage.totalCriteria}</Text>
                  </HStack>
                  <Text>Remaining criteria: {detail.goal.remainingScope.map((item) => item.criterionId).join(", ") || "none"}</Text>
                  <Text>Blocked: {detail.goal.blockedScope.map((item) => `${item.criterionId} (${item.blockers.join(", ")})`).join("; ") || "none"}</Text>
                </VStack>
              )}
            </VStack>
          </Section>

          {detail.acceptance ? <TaskAcceptanceEvidence key={detail.id} projection={detail.acceptance} /> : null}

          <Section>
            <VStack gap={3}>
              <Heading level={3}>Model identity and usage</Heading>
              <Text type="supporting">Coverage {detail.usage.coverage.status}: {detail.usage.coverage.reason}</Text>
              <Text>Current UI Session Model: {detail.modelSelection.uiSessionModel ?? "Unknown"} · source {detail.modelSelection.source} · observed {detail.modelSelection.asOf}</Text>
              <Text>Current selection rationale: {detail.modelSelection.rationale?.mode ?? "Unknown"} · requested {detail.modelSelection.rationale?.selectedModel ?? "Unknown"} · resolved {detail.modelSelection.rationale?.lastResolvedModel ?? "Unknown"} · provider {detail.modelSelection.rationale?.provider ?? "Unknown"} · changed {detail.modelSelection.rationale?.updatedAt ?? "Unknown"}</Text>
              <Text>Unique model calls {detail.usage.counts.unique}; corrections {detail.usage.counts.corrections}; retries/replays {detail.usage.counts.replayed}; missing {detail.usage.counts.missing}; conflicts {detail.usage.counts.conflicts}; overlap {detail.usage.counts.overlap}</Text>
              <Text>Observed receipt total: {tokenLabel(detail.usage.completeTotalTokens)} · known subtotal {detail.usage.knownSubtotalTokens.toLocaleString()} · {detail.usage.coverageReason ?? "totals describe linked observed receipts only"}</Text>
              <Text>Provider quota observation: {detail.quotaCoverage.status} · {detail.quotaCoverage.reason}</Text>
              {detail.usage.receipts.map((receipt) => (
                <Section key={`${receipt.identity.scope}:${receipt.identity.consumptionId}`} variant="transparent" padding={2} dividers={["bottom"]}>
                  <VStack gap={1}>
                    <Text type="label">Call {receipt.identity.consumptionId} · {receipt.asOf}</Text>
                    <Text>UI Session {receipt.model.uiSession ?? "Unknown"} (call-time binding unverified) · Worker requested {receipt.model.requested ?? "Unknown"} (source refs below) · Provider effective {receipt.model.effective ?? "Unknown"} ({receipt.model.effective ? "provider receipt" : "unverified"}) · External helper {receipt.model.helper ?? "Unknown"} (independent call binding unverified)</Text>
                    <Text>Call selection: {receipt.selection?.phase ?? "Unknown phase"} · role {receipt.selection?.role ?? "Unknown role"} · effort {receipt.selection?.effort ?? "Unknown"} · policy {receipt.selection?.policyProfile ?? "Unknown"} · rationale {receipt.selection?.rationale ?? "Not recorded"}</Text>
                    <Text>Input {tokenLabel(receipt.tokens.inputTokens)} (cached subset {tokenLabel(receipt.tokens.cachedInputTokens)}) · Output {tokenLabel(receipt.tokens.outputTokens)} · total {tokenLabel(receipt.tokens.totalTokens)} · {receipt.tokens.reason ?? "measured"}</Text>
                    <Text type="supporting">Evidence: {receipt.sourceRefs.map((source) => `${source.kind}:${source.reference}`).join(" · ") || "not recorded"}</Text>
                  </VStack>
                </Section>
              ))}
              {detail.usage.reservations.map((reservation, index) => <Text key={`${reservation.kind}-${index}`}>Resource reservation estimate: {reservation.estimateTokens ?? "Unknown"} tokens · {reservation.estimatedCostMicros === null ? "" : `${reservation.estimatedCostMicros} micro-USD estimated · `}{reservation.kind} · {reservation.modelCallId ?? "no call identity"} · {reservation.status} · {reservation.provider ?? "provider unknown"} · observed {reservation.observedAt ?? "unknown"}</Text>)}
              {(detail.usage.settlementMarkers ?? []).map((marker) => <Text key={marker.source.reference}>Canonical job settlement marker: {marker.type} · attempt {marker.attemptId ?? "unknown"} · {marker.committedAt} · marker only; no amount included · source {marker.source.reference}</Text>)}
              {(detail.usage.economicSettlements ?? []).map((event) => <Text key={event.source.reference}>Runner accounting evidence: {event.status} · {event.classification} · {event.reasonCode ? `reason ${event.reasonCode}` : event.meaning} · {event.capturedMinorUnits === null ? event.meaning : `${event.capturedMinorUnits} ${event.currency ?? "currency unknown"} minor units · ${event.meaning}`} · attempt {event.attemptId ?? "unknown"} · {event.createdAt} · source {event.source.reference}</Text>)}
              {detail.usage.settlements.map((settlement) => <Text key={`${settlement.identity.scope}:${settlement.identity.consumptionId}`}>Settlement evidence: {settlement.amount ?? "Unknown"} {settlement.currency ?? "currency unknown"} · funding {settlement.funding ?? "unknown"}</Text>)}
            </VStack>
          </Section>

          <Section>
            <VStack gap={2}>
              <Heading level={3}>Job and bound Runner session timeline</Heading>
              {detail.timeline.length ? detail.timeline.map((event) => <Text key={event.id}>{event.at} · {event.type} · attempt {event.attempt ?? "unknown"}{"source" in event && event.source ? ` · ${event.source.kind} ${event.source.reference} · sequence ${event.source.sequence}` : ""} · {event.phase ?? event.reasonCode ?? "no detail recorded"}{event.correction ? ` · usage corrected ${event.correction.previousUsage.inputTokens ?? "Unknown"}/${event.correction.previousUsage.outputTokens ?? "Unknown"} → ${event.correction.correctedUsage.inputTokens ?? "Unknown"}/${event.correction.correctedUsage.outputTokens ?? "Unknown"}; additional ${event.correction.additionalCharge ?? "Unknown"} tokens` : ""}</Text>) : <Text>Timeline unavailable.</Text>}
            </VStack>
          </Section>
          </> : null}
          </> : null}
        </VStack>
      ) : null}
    </VStack>
  );
}
