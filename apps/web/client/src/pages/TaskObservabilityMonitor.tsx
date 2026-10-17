import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { trpc } from "@/lib/trpc";
import { TaskAcceptanceEvidence } from "@/components/task-control/TaskAcceptanceEvidence";
import { formatVerifiedPercentLabel } from "@shared/taskAcceptanceProjection";

const metricLabel = (value: number | null): string => value === null ? "Unknown" : `${value.toFixed(1)}%`;
const tokenLabel = (value: number | null): string => value === null ? "Unknown" : value.toLocaleString();

export default function TaskObservabilityMonitor() {
  const [projectionToken, setProjectionToken] = useState(() => new URLSearchParams(window.location.search).get("projectionToken"));
  const [cursor, setCursor] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [specDraft, setSpecDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conversationCandidate = Number(new URLSearchParams(window.location.search).get("conversationId"));
  const conversationId = Number.isSafeInteger(conversationCandidate) && conversationCandidate > 0 ? conversationCandidate : undefined;
  const query = trpc.workerJobs.observability.useQuery({
    cursor,
    ...(projectionToken ? { projectionToken } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(specFilter ? { specId: specFilter } : {}),
  }, { staleTime: 15_000, refetchInterval: 15_000, retry: false });
  const runnerQuery = trpc.runnerNodes.list.useQuery(undefined, { staleTime: 15_000, refetchInterval: 15_000, retry: false });
  const aggregateQuery = trpc.workerJobs.observabilityAggregate.useQuery({
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(specFilter ? { specId: specFilter } : {}),
    ...((query.data?.snapshot.projectionToken ?? projectionToken) ? { projectionToken: query.data?.snapshot.projectionToken ?? projectionToken! } : {}),
  }, { enabled: Boolean((projectFilter || specFilter) && (query.data?.snapshot.projectionToken || projectionToken)), staleTime: 60_000, retry: false });
  const items = query.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const detailQuery = trpc.workerJobs.observabilityDetail.useQuery(
    { jobId: selected?.id ?? "", ...((query.data?.snapshot.projectionToken ?? projectionToken) ? { projectionToken: query.data?.snapshot.projectionToken ?? projectionToken! } : {}) },
    { enabled: Boolean(selected), staleTime: 15_000, refetchInterval: 15_000, retry: false },
  );
  const detail = detailQuery.data;
  const filtered = projectFilter || specFilter;

  return (
    <VStack as="main" gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Task Control and Agent Monitor</Heading>
        <Text type="supporting">Live task, runner, goal, model and resource evidence. Missing evidence remains unknown.</Text>
      </VStack>

      <Section>
        <VStack gap={3}>
          <Heading level={2}>{conversationId ? `Chat ${conversationId} evidence` : query.data?.scope === "tenant_fleet" ? "Tenant fleet and project scope" : "My tasks and project scope"}</Heading>
          {conversationId ? <Text type="supporting">Conversation scope is bound by the authenticated read API to the conversation owner and current tenant.</Text> : null}
          <HStack gap={2} wrap="wrap">
            <TextInput label="Project ID" value={projectDraft} onChange={setProjectDraft} placeholder="Canonical project ID" />
            <TextInput label="SPEC ID" value={specDraft} onChange={setSpecDraft} placeholder="SPEC-###" />
            <Button label="Apply scope" variant="secondary" onClick={() => { setProjectFilter(projectDraft.trim()); setSpecFilter(specDraft.trim()); setCursor(null); setSelectedId(null); }} />
            {filtered ? <Button label="Clear scope" variant="ghost" onClick={() => { setProjectDraft(""); setSpecDraft(""); setProjectFilter(""); setSpecFilter(""); setCursor(null); setSelectedId(null); }} /> : null}
            <Text type="supporting">Snapshot {query.data?.snapshot.asOf ?? "loading"} · {query.data?.snapshot.consistency ?? "consistency unknown"}; mutable task state can remain live.</Text>
          </HStack>
          {query.error ? <Text>Task list could not be refreshed. Check access and retry the snapshot.</Text> : null}
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
      </Section>

      {projectFilter || specFilter ? (
        <Section>
          <VStack gap={2}>
            <Heading level={2}>Project / SPEC usage union</Heading>
            {aggregateQuery.isLoading ? <Text>Loading bounded aggregate…</Text> : null}
            {aggregateQuery.error ? <Text>Aggregate is unavailable in the current account scope.</Text> : null}
            {aggregateQuery.data ? <>
              <Text>{aggregateQuery.data.scope} · {aggregateQuery.data.projectId ?? "project unknown"} · {aggregateQuery.data.specId ?? "SPEC unknown"} · binding {aggregateQuery.data.scopeBinding.status} · {aggregateQuery.data.observedJobCount} observed jobs · as of {aggregateQuery.data.asOf} · {aggregateQuery.data.consistency}</Text>
              <Text type="supporting">{aggregateQuery.data.scopeBinding.reason}</Text>
              <Text>Goal coverage {aggregateQuery.data.goalCoverage.status} · baseline candidates {aggregateQuery.data.goalCoverage.baselineCandidateCount} · {aggregateQuery.data.goalCoverage.reason}</Text>
              <Text>Unique linked calls {aggregateQuery.data.usage.counts.unique}; corrections {aggregateQuery.data.usage.counts.corrections}; replayed {aggregateQuery.data.usage.counts.replayed}; missing {aggregateQuery.data.usage.counts.missing}; overlap {aggregateQuery.data.usage.counts.overlap}</Text>
              <Text>Complete linked token total {tokenLabel(aggregateQuery.data.usage.completeTotalTokens)} · known subtotal {aggregateQuery.data.usage.knownSubtotalTokens.toLocaleString()} · {aggregateQuery.data.usage.coverage.reason}</Text>
              <Text>Reservation estimate {tokenLabel(aggregateQuery.data.resourceEstimates.reservedTokenEstimate)} tokens across {aggregateQuery.data.resourceEstimates.observedReservationCount} distinct receipts · missing/conflicting estimates {aggregateQuery.data.resourceEstimates.missingReservationTokenEstimateCount} · known inference cost estimate {aggregateQuery.data.resourceEstimates.inferenceCostEstimateMicros.toLocaleString()} micro-USD · missing estimates {aggregateQuery.data.resourceEstimates.missingInferenceCostEstimateCount} · quota {aggregateQuery.data.quotaCoverage.status}</Text>
              <Text>Canonical job settlement markers {aggregateQuery.data.jobSettlementMarkers?.observedCount ?? "Unknown"} · {aggregateQuery.data.jobSettlementMarkers?.byType?.map((item) => `${item.type}: ${item.count}`).join(", ") ?? "type coverage unknown"} · marker-only, no monetary amount asserted</Text>
              <Text>Bound runner accounting evidence {aggregateQuery.data.economicSettlementEvidence?.observedEventCount ?? "Unknown"} events · settled {aggregateQuery.data.economicSettlementEvidence?.settledCount ?? "Unknown"} · reconciliation required {aggregateQuery.data.economicSettlementEvidence?.reconciliationRequiredCount ?? "Unknown"} · classifications {aggregateQuery.data.economicSettlementEvidence?.byClassification?.map((item) => `${item.classification}: ${item.count}`).join(", ") ?? "Unknown"} · provider capture subtotals {aggregateQuery.data.economicSettlementEvidence?.capturedProviderAmounts?.map((item) => `${item.capturedMinorUnits ?? "Unknown"} ${item.currency} minor units`).join(", ") ?? "Unknown"} · missing capture values {aggregateQuery.data.economicSettlementEvidence?.missingProviderCaptureValueCount ?? "Unknown"} · {aggregateQuery.data.economicSettlementEvidence?.meaning ?? "coverage unknown"}</Text>
              {aggregateQuery.data.usage.settlements.slice(0, 10).map((settlement) => <Text key={`${settlement.identity.scope}:${settlement.identity.consumptionId}`}>Settlement: {settlement.amount ?? "Unknown"} {settlement.currency ?? "currency unknown"} · {settlement.funding ?? "funding unknown"} · {settlement.identity.consumptionId}</Text>)}
              {aggregateQuery.data.usage.settlements.length > 10 ? <Text type="supporting">Showing 10 of {aggregateQuery.data.usage.settlements.length} settlement receipts.</Text> : null}
              <Text type="supporting">Sources: {aggregateQuery.data.usage.coverage.sources.join(", ")} · uncovered: {aggregateQuery.data.usage.coverage.missingSources.join(", ")}</Text>
            </> : null}
          </VStack>
        </Section>
      ) : null}

      <Section>
        <VStack gap={2}>
          <Heading level={2}>Available runner fleet</Heading>
          {runnerQuery.error ? <Text>Runner fleet is unavailable in this account scope.</Text> : null}
          {runnerQuery.isLoading ? <Text>Loading runner observations…</Text> : null}
          {!runnerQuery.isLoading && !runnerQuery.error && runnerQuery.data?.runners.length === 0 ? <Text>No registered runner is visible in this account scope.</Text> : null}
          {runnerQuery.data?.runners.map((runner) => (
            <HStack as="article" key={runner.runnerId} gap={3} wrap="wrap" padding={2}>
              <Text>{runner.displayName ?? runner.runnerId}</Text>
              <Badge label={runner.displayState} variant={runner.displayState === "ready" ? "success" : "neutral"} />
              <Text type="supporting">Trust {runner.trustState} · status {runner.status} · last seen {runner.lastSeenAt ?? "unknown"} · snapshot expires {runner.snapshotExpiresAt ?? "unknown"}</Text>
              <Text type="supporting">{runner.workspaceIds.length} workspace(s) · {runner.toolCount} tools · {runner.capabilityCount} capabilities</Text>
            </HStack>
          ))}
          <Heading level={3}>Observed runner to task topology</Heading>
          {runnerQuery.data?.runners.map((runner) => {
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
          {items.some((item) => item.runnerId && !runnerQuery.data?.runners.some((runner) => runner.runnerId === item.runnerId)) ? (
            <VStack gap={1} padding={2}>
              <Text>Runner observation unavailable</Text>
              {items.filter((item) => item.runnerId && !runnerQuery.data?.runners.some((runner) => runner.runnerId === item.runnerId)).map((item) => <Text key={`unbound-${item.id}`}>↳ {item.jobType} · {item.status} · runner {item.runnerId} (inventory unverified)</Text>)}
            </VStack>
          ) : null}
        </VStack>
      </Section>

      {selected ? (
        <VStack gap={3}>
          {detailQuery.isLoading ? <Section><Text>Loading task detail…</Text></Section> : null}
          {detailQuery.error ? <Section><Text>Task detail is unavailable in the current account scope.</Text></Section> : null}
          {detail ? <>
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
        </VStack>
      ) : null}
    </VStack>
  );
}
