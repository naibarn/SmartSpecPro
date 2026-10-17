import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { TaskAcceptanceInput, AcceptanceLink, AcceptanceReference } from "@shared/taskAcceptanceProjection";
import { taskUsageEvidenceCallSchema } from "@shared/taskUsageEvidence";
import { loadCompletedAutonomousPilotFixture } from "./completedAutonomousPilot";

type JsonRecord = Readonly<Record<string, unknown>>;

export type CompletedPilotAcceptanceFixture = Readonly<{
  input: TaskAcceptanceInput;
  fixtureOnly: true;
  fixtureTrustBoundary: "TEST_ONLY trusted baseline; not a runtime producer";
  validationOnly: Readonly<{
    workUnit: string;
    sourceSha: string;
    passedTests: number;
    wholeRequirementClosed: false;
    evidencePath: string;
  }>;
  r5: Readonly<{
    status: string;
    tests: number;
    totalTests: number;
    environment: "native PostgreSQL + loopback HTTP; simulated authentication";
  }>;
  evidencePromotion: Readonly<{
    pr: 1002;
    mergeSha: "772402cdf89c921e5fdd0e8e00e3143c5e56a7d8";
    promotionEvidencePath: "/tmp/smartaihub-backlog-pilot/pr1002-protected-promotion-20261017.json";
  }>;
  staleConversationSnapshot: Readonly<{
    displayedTokens: number;
    elapsedSeconds: number;
    source: string;
  }>;
  nativeJobRunEvidence: ReturnType<typeof loadCompletedAutonomousPilotFixture>["nativeJobRunEvidence"];
}>;

const validationEvidencePath =
  "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/backlog-pilot-20261016.json#/validationOnly";

function repositoryRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (!readable(path.join(current, "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/backlog-pilot-20261016.json"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Could not locate pilot evidence from ${start}`);
    current = parent;
  }
  return current;
}

function readable(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as JsonRecord;
}

function evidenceDocument(root: string, relativePath: string): { body: JsonRecord; digest: string } {
  const bytes = readFileSync(path.join(root, relativePath));
  return { body: object(JSON.parse(bytes.toString("utf8")), relativePath), digest: sha256(bytes) };
}

function reference(
  kind: AcceptanceReference["kind"],
  id: string,
  verificationStatus: AcceptanceReference["verificationStatus"] = "verified",
  metadata: Pick<AcceptanceReference, "specId" | "requirementIds" | "sourceSha"> = {},
): AcceptanceReference {
  return Object.freeze({ kind, id, verificationStatus, ...metadata });
}

/**
 * Builds a deterministic test-only read fixture for the shared acceptance projection.
 * It adapts retained evidence and never authenticates, persists, or discovers runtime state.
 */
export function buildCompletedPilotAcceptanceFixture(
  root = repositoryRoot(),
): CompletedPilotAcceptanceFixture {
  const pilot = loadCompletedAutonomousPilotFixture(root);
  const rootJson = object(JSON.parse(readFileSync(path.join(root, pilot.evidence.pilotArtifactPath), "utf8")), "pilot artifact");
  const validation = object(rootJson.validationOnly, "validation-only evidence");
  const accounting = object(rootJson.canonicalModelAccounting, "model accounting");
  const continued = object(rootJson.continuedPilot20261017, "continued pilot");
  const nativeEvidence = pilot.nativeJobRunEvidence;

  const calls = pilot.modelUsage.rawReceipts.map((receipt) => taskUsageEvidenceCallSchema.parse({
    consumptionId: receipt.modelCallId,
    scope: `job:${receipt.jobId}`,
    revision: 0,
    asOf: receipt.observedAt,
    sourceRefs: [{
      kind: "retained_model_usage_receipt",
      reference: `${pilot.evidence.usageArtifactPath}#sha256=${pilot.evidence.usageArtifactSha256}#${receipt.modelCallId}`,
    }],
    tokens: {
      mode: "delta",
      inputTokens: receipt.inputTokens,
      cachedInputTokens: receipt.cachedInputTokens,
      outputTokens: receipt.outputTokens,
    },
    model: {
      requested: receipt.requestedModel,
      providerConfirmedEffective: receipt.effectiveModel,
    },
    coverage: { relationship: "standalone" },
  }));

  const goalRef = reference("goal", "test-only:completed-autonomous-pilot");
  const refs: AcceptanceReference[] = [goalRef];
  const links: AcceptanceLink[] = [];
  const testOnlyWorkUnit = {
    workUnitId: "SPEC161_CANONICAL_ADMISSION_VALIDATION",
    weight: 1,
  };
  const workUnits = pilot.workUnits.map((workUnit) => ({
    id: String(workUnit.workunit),
    requirementIds: Array.isArray(workUnit.requirements) ? workUnit.requirements.map(String) : [],
    pr: Number(workUnit.pr),
    mergeSha: String(workUnit.merge_sha),
    evidencePath: String(workUnit.evidence),
  }));

  const criterionIds = [...workUnits.map((workUnit) => `criterion:${workUnit.id}`), "criterion:validation-only-subset"];
  const baselineDigestPayload = {
    classification: "TEST_ONLY trusted baseline; not a runtime producer",
    pilotArtifactSha256: pilot.evidence.pilotArtifactSha256,
    usageArtifactSha256: pilot.evidence.usageArtifactSha256,
    finalSourceSha: pilot.boundedPilotGoal.finalSourceSha,
    workUnits,
    validationEvidencePath,
    validationSourceSha: validation.sourceSha,
  };
  const baselineDigest = `sha256:${sha256(Buffer.from(JSON.stringify(baselineDigestPayload)))}`;
  const baselineVersion = `fixture:${pilot.boundedPilotGoal.finalSourceSha}`;
  const acceptanceCriteria = criterionIds.map((criterionId, index) => ({
    criterionId,
    weight: 1,
    required: true,
    workUnits: index < workUnits.length ? [{ workUnitId: workUnits[index]!.id, weight: 1 }] : [testOnlyWorkUnit],
  }));
  const observations = criterionIds.map((criterionId, index) => ({
    baselineVersion,
    baselineDigest,
    criterionId,
    revision: 1,
    evidenceRef: index < workUnits.length ? workUnits[index]!.evidencePath : validationEvidencePath,
    verificationStatus: "PASS" as const,
    implemented: true,
    workComplete: true,
    workUnits: [{
      workUnitId: index < workUnits.length ? workUnits[index]!.id : testOnlyWorkUnit.workUnitId,
      implemented: true,
      workComplete: true,
      executionProgress: 1,
    }],
    executionProgress: 1,
    liveRequired: false,
    liveVerified: false,
    reopened: false,
    regressed: false,
    blockers: [],
    dependencies: [],
    nextAction: null,
  }));

  for (const workUnit of workUnits) {
    const workUnitRef = reference("work_unit", workUnit.id, "verified", {
      specId: String(pilot.workUnits.find((candidate) => candidate.workunit === workUnit.id)?.spec),
      requirementIds: workUnit.requirementIds,
      sourceSha: workUnit.mergeSha,
    });
    refs.push(workUnitRef);
    links.push({ from: goalRef, to: workUnitRef });

    const prRef = reference("pull_request", `PR-${workUnit.pr}`);
    const commitRef = reference("commit", workUnit.mergeSha);
    const evidence = evidenceDocument(root, workUnit.evidencePath);
    const evidenceRef = reference("evidence", `${workUnit.evidencePath}#sha256=${evidence.digest}`);
    refs.push(prRef, commitRef, evidenceRef);
    links.push({ from: workUnitRef, to: prRef }, { from: prRef, to: commitRef }, { from: workUnitRef, to: evidenceRef }, { from: commitRef, to: evidenceRef });

    // Only explicitly recorded assurance run identities become run references.
    const verificationValue = evidence.body.verification;
    if (verificationValue && typeof verificationValue === "object" && !Array.isArray(verificationValue)) {
      const verification = verificationValue as JsonRecord;
      for (const caseName of ["qc_blocking_case", "qc_eligible_case"]) {
        const caseEvidence = verification[caseName];
        if (caseEvidence && typeof caseEvidence === "object" && !Array.isArray(caseEvidence)) {
          const runId = (caseEvidence as JsonRecord).assurance_run_id;
          if (typeof runId === "string" && runId.length > 0) {
            const runRef = reference("run", runId);
            refs.push(runRef);
            links.push({ from: workUnitRef, to: runRef }, { from: runRef, to: prRef });
          }
        }
      }
    }
  }

  const evidencePr = reference("pull_request", "PR-1002");
  const evidenceMerge = reference("commit", "772402cdf89c921e5fdd0e8e00e3143c5e56a7d8");
  refs.push(evidencePr, evidenceMerge);
  links.push({ from: goalRef, to: evidencePr }, { from: evidencePr, to: evidenceMerge });

  const validationRef = reference("evidence", validationEvidencePath);
  const pilotVerificationRef = reference(
    "evidence",
    `${pilot.evidence.pilotArtifactPath}#/continuedPilot20261017/final_verification`,
  );
  const r5Ref = reference("evidence", `${pilot.evidence.pilotArtifactPath}#/continuedPilot20261017/final_verification/r5`);
  const scopedAcceptance = { sourceSha: pilot.verification.sourceSha, testsPassed: 295, totalTests: 295, status: pilot.verification.status, environment: "scoped tests", authentication: "simulated" as const };
  const r5Acceptance = { sourceSha: pilot.verification.sourceSha, testsPassed: 5, totalTests: 5, status: pilot.verification.r5.status, environment: pilot.verification.r5.runtime, authentication: "simulated" as const };
  refs.push(validationRef, { ...pilotVerificationRef, acceptance: scopedAcceptance }, { ...r5Ref, acceptance: r5Acceptance });
  links.push({ from: goalRef, to: validationRef }, { from: goalRef, to: pilotVerificationRef }, { from: pilotVerificationRef, to: r5Ref });

  // Keep native worker job/run observations available but unlinked to WUs: the source records
  // do not prove which SPEC WorkUnit owns each test-level job/run, and some omit run IDs.
  for (const native of nativeEvidence) {
    if (native.jobId) refs.push(reference("job", native.jobId, "unknown"));
    if (native.runId !== null) {
      const runRef = reference("run", String(native.runId), "unknown");
      refs.push(runRef);
      if (native.jobId) links.push({ from: reference("job", native.jobId, "unknown"), to: runRef });
    }
  }

  const snapshot = pilot.conversationSnapshotObservation;
  const verification = object(continued.final_verification, "final scoped verification");
  const r5 = object(verification.r5, "R5 scoped verification");
  const input: TaskAcceptanceInput = {
    scope: { kind: "pilot", id: "completed-autonomous-backlog-pilot-20261016-17" },
    reported: {
      state: "COMPLETE",
      basis: "bounded pilot acceptance from retained canonical evidence; whole SPEC closure remains open",
      evidenceStatus: "verified",
    },
    goal: {
      input: {
        baseline: {
          goalId: "test-only:completed-autonomous-pilot",
          version: baselineVersion,
          digest: baselineDigest,
          milestones: [{
            milestoneId: "test-only:bounded-acceptance",
            weight: 1,
            deliverables: [{
              deliverableId: "test-only:6-work-units-plus-validation-subset",
              weight: 1,
              acceptanceCriteria,
            }],
          }],
        },
        observations,
      },
      baselineSource: "trusted",
      scopeBinding: {
        scope: { kind: "pilot", id: "completed-autonomous-backlog-pilot-20261016-17" },
        goalId: "test-only:completed-autonomous-pilot",
        baselineVersion,
        baselineDigest,
      },
    },
    parentClosure: {
      closedCount: 0,
      totalCount: 4,
      status: "incomplete",
    },
    remainingRequirements: Object.entries(object(continued.next_eligible, "next eligible scopes"))
      .map(([spec, action]) => `${spec}: ${String(action)}`),
    graph: {
      available: [...new Map(refs.map((item) => [`${item.kind}\u0000${item.id}`, item])).values()],
      links,
    },
    verification: {
      testsPassed: verification.tests_passed as number,
      totalTests: 295,
      testFiles: verification.test_files as number,
      sourceSha: String(verification.source_sha),
      status: "passed",
    },
    acceptanceEnvironment: { kind: "simulated_auth", authStatus: "simulated" },
    sdkUsage: {
      calls,
      asOf: typeof accounting.snapshotAt === "string" ? accounting.snapshotAt : null,
      freshness: "stale",
      freshnessReason: "historical retained SDK receipt snapshot; not current usage",
    },
    assistantAndConductorUsage: {
      status: "unknown",
      reason: "canonical evidence does not expose host helper or assistant usage settlement",
    },
    goalCounter: { status: "stale", value: snapshot.displayedTokens, asOf: null },
    releaseObservations: pilot.modelUsage.rawReceipts.map((receipt) => ({
      receiptId: receipt.modelCallId,
      state: receipt.reservationStatus === "released" ? "released" as const : "unknown" as const,
      observedAt: receipt.observedAt,
    })),
  };

  return Object.freeze({
    input,
    fixtureOnly: true,
    fixtureTrustBoundary: "TEST_ONLY trusted baseline; not a runtime producer",
    validationOnly: Object.freeze({
      workUnit: String(validation.workUnit),
      sourceSha: String(validation.sourceSha),
      passedTests: Number(validation.passedTests),
      wholeRequirementClosed: false,
      evidencePath: validationEvidencePath,
    }),
    r5: Object.freeze({
      status: String(r5.status),
      tests: Number(r5.tests),
      totalTests: 5,
      environment: "native PostgreSQL + loopback HTTP; simulated authentication",
    }),
    evidencePromotion: Object.freeze({
      pr: 1002,
      mergeSha: "772402cdf89c921e5fdd0e8e00e3143c5e56a7d8",
      promotionEvidencePath: "/tmp/smartaihub-backlog-pilot/pr1002-protected-promotion-20261017.json",
    }),
    staleConversationSnapshot: Object.freeze({
      displayedTokens: snapshot.displayedTokens,
      elapsedSeconds: snapshot.elapsedSeconds,
      source: snapshot.source,
    }),
    nativeJobRunEvidence: nativeEvidence,
  });
}
