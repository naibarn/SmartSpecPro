import { projectTaskAcceptance, type AcceptanceReference, type AcceptanceLink } from "../../shared/taskAcceptanceProjection";
import { aggregateUsageEvidence, type TaskUsageEvidenceCall } from "../../shared/taskUsageEvidence";

type AuthorizedTaskFacts = {
  jobId: string;
  status: string;
  snapshotAt: string;
  freshness: "current" | "stale";
  calls: TaskUsageEvidenceCall[];
  runnerSessionId: string | null;
  reservations: { id: string; attemptId: string | null; status: string; observedAt: string | null }[];
};

/** Only called after the existing job tenant/owner check; never reads job-supplied goal authority. */
export function projectAuthorizedTaskAcceptance(facts: AuthorizedTaskFacts) {
  const job: AcceptanceReference = { kind: "job", id: facts.jobId };
  const references: AcceptanceReference[] = [job];
  const links: AcceptanceLink[] = [];
  const run: AcceptanceReference | null = facts.runnerSessionId ? { kind: "run", id: facts.runnerSessionId } : null;
  if (run) {
    references.push(run);
    links.push({ from: job, to: run });
  }
  for (const reservation of facts.reservations) {
    const attempt: AcceptanceReference | null = reservation.attemptId ? { kind: "attempt", id: reservation.attemptId } : null;
    const evidence: AcceptanceReference = { kind: "evidence", id: `worker_job_provider_reservation:${reservation.id}` };
    if (attempt) {
      references.push(attempt);
      // A job may have several runs: do not bind every attempt to its latest session.
      links.push({ from: job, to: attempt });
    }
    references.push(evidence);
    links.push({ from: attempt ?? job, to: evidence });
  }
  // Reuse the existing public receipt sanitizer before exposing source identities.
  for (const call of aggregateUsageEvidence(facts.calls).receipts) {
    for (const source of call.sourceRefs) {
      const evidence: AcceptanceReference = { kind: "evidence", id: `${source.kind}:${source.reference}` };
      references.push(evidence);
      links.push({ from: job, to: evidence });
    }
  }
  return projectTaskAcceptance({
    scope: { kind: "task", id: facts.jobId },
    reported: { state: facts.status, basis: "canonical worker_jobs status", evidenceStatus: "unverified" },
    goal: { input: { baseline: null, observations: [] }, baselineSource: "missing" },
    parentClosure: { closedCount: null, totalCount: null, status: "unknown" },
    remainingRequirements: [],
    graph: { available: references, links },
    verification: { testsPassed: null, totalTests: null, testFiles: null, sourceSha: null, status: "unknown" },
    acceptanceEnvironment: { kind: "unknown", authStatus: "unknown" },
    sdkUsage: { calls: facts.calls, asOf: facts.snapshotAt, freshness: facts.freshness, freshnessReason: "Authorized canonical job read; unlinked calls remain outside coverage." },
    assistantAndConductorUsage: { status: "unknown", reason: "No independently attributed assistant/conductor receipts are linked." },
    goalCounter: { status: "unknown", value: null, asOf: null },
    releaseObservations: facts.reservations.map((row) => ({
      receiptId: row.id,
      state: row.status === "released" ? "released" : row.status === "reserved" ? "held" : "unknown",
      observedAt: row.observedAt,
    })),
  });
}
