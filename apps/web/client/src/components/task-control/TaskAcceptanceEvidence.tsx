import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { observeTaskAcceptanceSnapshot, type AcceptanceReference, type TaskAcceptanceProjection } from "@shared/taskAcceptanceProjection";

const keyOf = (ref: AcceptanceReference) => `${ref.kind}:${ref.id}`;
const count = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();

/** Read-only shared evidence surface; navigation never creates execution authority. */
export function TaskAcceptanceEvidence({ projection: sourceProjection }: { projection: TaskAcceptanceProjection }) {
  const [observedAt, setObservedAt] = useState(() => Date.now());
  useEffect(() => {
    setObservedAt(Date.now());
    const timer = setInterval(() => setObservedAt(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [sourceProjection.sdkUsage.asOf]);
  const projection = observeTaskAcceptanceSnapshot(sourceProjection, observedAt);
  const [selection, setSelection] = useState<string | null>(null);
  const graph = projection.graph;
  const selected = graph.references.find((ref) => keyOf(ref) === selection);
  const children = selected ? graph.links.filter((link) => keyOf(link.from) === keyOf(selected)) : [];
  const targets = new Set(graph.links.map((link) => keyOf(link.to)));
  const visible = selected
    ? graph.references.filter((ref) => children.some((link) => keyOf(link.to) === keyOf(ref)))
    : graph.references.filter((ref) => !targets.has(keyOf(ref)));
  const verifiedUnits = graph.references.filter((ref) => ref.kind === "work_unit" && ref.verificationStatus === "verified");
  const allUnits = graph.references.filter((ref) => ref.kind === "work_unit");
  return (
    <Section>
      <VStack gap={3} style={{ overflowWrap: "anywhere" }}>
        <Heading level={3}>Acceptance evidence</Heading>
        <Text>{projection.scope.kind} {projection.scope.id} · reported {projection.reported.state} · verified scope {projection.scopeCompletionStatus}</Text>
        <Text>Verified Goal: {projection.goal.verifiedPercentLabel} · required acceptance {projection.goal.requiredCriteriaComplete ? "passed" : "pending or unknown"}</Text>
        <Text>Parent SPEC/Project closure: {projection.parentClosure.status} · {count(projection.parentClosure.closedCount)}/{count(projection.parentClosure.totalCount)}</Text>
        <Text>Verified WorkUnits: {allUnits.length ? `${verifiedUnits.length}/${allUnits.length}` : "Unknown"}</Text>
        <Text>Remaining requirements: {projection.remainingRequirements.join("; ") || (projection.parentClosure.status === "complete" ? "none" : "Unknown; no complete parent requirement inventory bound")}</Text>
        <Text>Test pass rate: {projection.verification.testPassRate === null ? "Unknown" : `${projection.verification.testPassRate}%`} ({count(projection.verification.testsPassed)}/{count(projection.verification.totalTests)}) · source {projection.verification.sourceSha ?? "Unknown"}</Text>
        <Text>Acceptance environment: {projection.acceptanceEnvironment.kind} · authentication {projection.acceptanceEnvironment.authStatus} · live production acceptance {projection.verifiedLiveAcceptance ? "verified" : "not verified"}</Text>
        <Text>SDK current-snapshot linked total: {count(projection.sdkUsage.current?.completeTotalTokens)} tokens · snapshot {projection.sdkUsage.freshness} · observed {projection.sdkUsage.asOf ?? "Unknown"}</Text>
        <Text>SDK retained receipt total: {count(projection.sdkUsage.historical.completeTotalTokens)} tokens · {projection.sdkUsage.historical.counts.unique} unique calls · cached input is included in input</Text>
        <Text>Assistant/conductor usage: {projection.assistantAndConductorUsage.status} · {projection.assistantAndConductorUsage.reason ?? "No independent evidence"}</Text>
        <Text>Goal counter: {count(projection.goalCounter.value)} · {projection.goalCounter.status} · observed {projection.goalCounter.asOf ?? "Unknown"}</Text>
        <Text>Resource releases: {projection.releaseObservations.filter((row) => row.state === "released").length}/{projection.releaseObservations.length} observed · billing settlement {projection.billingSettlement.status}</Text>
        {projection.billingSettlement.receipts.map((receipt) => <Text key={`${receipt.identity.scope}:${receipt.identity.consumptionId}`}>Settled receipt {receipt.identity.consumptionId}: {count(receipt.amount)} {receipt.currency ?? "currency Unknown"} · funding {receipt.funding ?? "Unknown"}</Text>)}
        <Heading level={4}>Goal → WorkUnit → Run/Attempt → PR/Commit → Evidence</Heading>
        <Text type="supporting">Missing bindings: {graph.missingKinds.join(", ") || "none"} · unresolved links {graph.missingLinks.length}</Text>
        <HStack gap={2} wrap="wrap">
          <Button label="Evidence roots" size="sm" variant="ghost" onClick={() => setSelection(null)} />
          {selected ? graph.references.filter((ref) => graph.links.some((link) => keyOf(link.to) === keyOf(selected) && keyOf(link.from) === keyOf(ref))).map((ref) => <Button key={keyOf(ref)} label={`Back to ${ref.kind}: ${ref.id}`} size="sm" variant="ghost" style={{ whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%" }} onClick={() => setSelection(keyOf(ref))} />) : null}
        </HStack>
        {selected ? <VStack gap={1}>
          <Text>Selected {selected.kind}: {selected.id} · {selected.verificationStatus ?? "verification unknown"}</Text>
          {selected.acceptance ? <Text>Selected acceptance: {selected.acceptance.testsPassed}/{selected.acceptance.totalTests} · {selected.acceptance.status} · source {selected.acceptance.sourceSha} · {selected.acceptance.environment} · authentication {selected.acceptance.authentication}</Text> : null}
          {selected.specId ? <Text>SPEC: {selected.specId} · requirements {selected.requirementIds?.join(", ") || "Unknown"} · commit binding {selected.sourceSha ?? "Unknown"}</Text> : null}
        </VStack> : null}
        {visible.map((ref) => (
          <HStack key={keyOf(ref)} gap={2} wrap="wrap">
            <Button label={`Open ${ref.kind}: ${ref.id}`} size="sm" variant="ghost" style={{ whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%" }} onClick={() => setSelection(keyOf(ref))} />
            <Text type="supporting">{ref.verificationStatus ?? "verification unknown"}</Text>
          </HStack>
        ))}
        {selected && !visible.length ? <Text>End of recorded evidence. Missing run or attempt identities are not inferred.</Text> : null}
      </VStack>
    </Section>
  );
}
