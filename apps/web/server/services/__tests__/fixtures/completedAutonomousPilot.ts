import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const PILOT_ARTIFACT =
  "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/backlog-pilot-20261016.json";
const USAGE_ARTIFACT =
  "specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/handoff/evidence/pilot-canonical-model-usage-20261016.jsonl";

type JsonRecord = Readonly<Record<string, unknown>>;

export type CanonicalModelUsageRecord = Readonly<{
  modelCallId: string;
  jobId: string;
  role: string;
  requestedModel: string;
  effectiveModel: string | null;
  reasoningEffort: string;
  reservationStatus: string;
  usageState: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  actualTotalTokens: number;
  observedAt: string;
}>;

export type CompletedAutonomousPilotFixture = Readonly<{
  evidence: Readonly<{
    pilotArtifactPath: string;
    pilotArtifactSha256: string;
    usageArtifactPath: string;
    usageArtifactSha256: string;
  }>;
  boundedPilotGoal: Readonly<{
    status: "COMPLETE";
    statusBasis: "bounded acceptance in canonical evidence";
    wholeSpecsComplete: false;
    pilotStatus: string;
    originalSourceSha: string;
    finalSourceSha: string;
  }>;
  verification: Readonly<{
    status: string;
    testsPassed: number;
    testFiles: number;
    sourceSha: string;
    r5: Readonly<{
      status: string;
      tests: number;
      runtime: string;
      limitations: string;
    }>;
  }>;
  workUnits: readonly JsonRecord[];
  nativeJobRunEvidence: readonly Readonly<{
    sourceRecord: JsonRecord;
    jobId: string | null;
    runId: string | number | null;
    attemptId: string | null;
    attemptCount: number | null;
  }>[];
  modelUsage: Readonly<{
    receiptCount: number;
    knownReleasedCount: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    actualTotalTokens: number;
    cachedInputIsSubsetOfInput: true;
    effectiveModel: "UNKNOWN";
    billingSettlement: "UNKNOWN";
    assistantAndConductorUsage: "UNKNOWN";
    rawReceipts: readonly CanonicalModelUsageRecord[];
  }>;
  conversationSnapshotObservation: Readonly<{
    source: "conversation snapshot; not canonical SDK evidence";
    displayedTokens: 160516;
    elapsedSeconds: 224;
    classification: "stale display; excluded from SDK call totals";
  }>;
}>;

function findRepositoryRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (readable(path.join(current, PILOT_ARTIFACT))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate canonical pilot evidence from ${start}`);
    }
    current = parent;
  }
}

function readable(filePath: string): boolean {
  try {
    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} evidence record`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label} in canonical pilot evidence`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableId(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function numberField(row: JsonRecord, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key} in canonical model usage evidence`);
  }
  return value;
}

function parseUsageRecord(line: string, index: number): CanonicalModelUsageRecord {
  const row = record(JSON.parse(line), `model usage line ${index + 1}`);
  return Object.freeze({
    modelCallId: requiredString(row.modelCallId, "modelCallId"),
    jobId: requiredString(row.jobId, "jobId"),
    role: requiredString(row.role, "role"),
    requestedModel: requiredString(row.requestedModel, "requestedModel"),
    effectiveModel: nullableString(row.effectiveModel),
    reasoningEffort: requiredString(row.reasoningEffort, "reasoningEffort"),
    reservationStatus: requiredString(row.reservationStatus, "reservationStatus"),
    usageState: requiredString(row.usageState, "usageState"),
    inputTokens: numberField(row, "inputTokens"),
    cachedInputTokens: numberField(row, "cachedInputTokens"),
    outputTokens: numberField(row, "outputTokens"),
    actualTotalTokens: numberField(row, "actualTotalTokens"),
    observedAt: requiredString(row.observedAt, "observedAt"),
  });
}

/**
 * Loads the retained pilot evidence without writing or deriving additional accounting.
 * Missing run/attempt links remain null rather than being inferred from receipt IDs.
 */
export function loadCompletedAutonomousPilotFixture(
  repositoryRoot = findRepositoryRoot(),
): CompletedAutonomousPilotFixture {
  const pilotBytes = readFileSync(path.join(repositoryRoot, PILOT_ARTIFACT));
  const usageBytes = readFileSync(path.join(repositoryRoot, USAGE_ARTIFACT));
  const pilot = record(JSON.parse(pilotBytes.toString("utf8")), "pilot artifact");
  const accounting = record(pilot.canonicalModelAccounting, "model accounting");
  const totals = record(accounting.totals, "published model totals");
  const continued = record(pilot.continuedPilot20261017, "continued pilot");
  const verification = record(continued.final_verification, "final verification");
  const r5 = record(verification.r5, "R5 verification");
  const usageText = usageBytes.toString("utf8").trimEnd();
  const rawReceipts = Object.freeze(
    usageText.split("\n").map(parseUsageRecord),
  );
  const publishedDigest = requiredString(accounting.evidenceSha256, "usage evidence digest");
  if (sha256(usageBytes) !== publishedDigest) {
    throw new Error("Canonical model usage evidence digest does not match pilot artifact");
  }

  const workUnits = continued.workunits;
  const nativeEvidence = continued.native_job_run_evidence;
  if (!Array.isArray(workUnits) || !Array.isArray(nativeEvidence)) {
    throw new Error("Canonical pilot is missing work-unit or native job/run evidence");
  }
  if (continued.whole_specs_complete !== false) {
    throw new Error("Canonical pilot does not establish whole-spec incompletion");
  }
  if (continued.status !== "BOUNDED_PILOT_ACCEPTANCE_MET_BACKLOG_REMAINS_OPEN") {
    throw new Error("Canonical evidence does not establish bounded pilot completion with backlog remaining");
  }

  if (verification.status !== "PASS_SCOPED" || r5.status !== "PASS_SCOPED" || workUnits.length !== 6 ||
      verification.tests_passed !== 295 || r5.tests !== 5 || verification.source_sha !== continued.final_source_sha) {
    throw new Error("Canonical pilot acceptance evidence is incomplete or does not match its source");
  }

  return Object.freeze({
    evidence: Object.freeze({
      pilotArtifactPath: PILOT_ARTIFACT,
      pilotArtifactSha256: sha256(pilotBytes),
      usageArtifactPath: USAGE_ARTIFACT,
      usageArtifactSha256: sha256(usageBytes),
    }),
    boundedPilotGoal: Object.freeze({
      status: "COMPLETE" as const,
      statusBasis: "bounded acceptance in canonical evidence" as const,
      wholeSpecsComplete: false,
      pilotStatus: requiredString(continued.status, "continued pilot status"),
      originalSourceSha: requiredString(continued.original_source_sha, "original source SHA"),
      finalSourceSha: requiredString(continued.final_source_sha, "final source SHA"),
    }),
    verification: Object.freeze({
      status: requiredString(verification.status, "verification status"),
      testsPassed: numberField(verification, "tests_passed"),
      testFiles: numberField(verification, "test_files"),
      sourceSha: requiredString(verification.source_sha, "verification source SHA"),
      r5: Object.freeze({
        status: requiredString(r5.status, "R5 status"),
        tests: numberField(r5, "tests"),
        runtime: requiredString(r5.runtime, "R5 runtime"),
        limitations: requiredString(r5.limitations, "R5 limitations"),
      }),
    }),
    workUnits: Object.freeze(workUnits.map((item, index) => record(item, `work unit ${index}`))),
    nativeJobRunEvidence: Object.freeze(
      nativeEvidence.map((item, index) => {
        const sourceRecord = record(item, `native job/run evidence ${index}`);
        return Object.freeze({
          sourceRecord,
          jobId: nullableString(sourceRecord.jobId),
          runId: nullableId(sourceRecord.runId),
          attemptId: nullableString(sourceRecord.attemptId),
          attemptCount: typeof sourceRecord.workerAttempts === "number" ? sourceRecord.workerAttempts : null,
        });
      }),
    ),
    modelUsage: Object.freeze({
      receiptCount: numberField(totals, "calls"),
      knownReleasedCount: numberField(totals, "knownReleased"),
      inputTokens: numberField(totals, "inputTokens"),
      cachedInputTokens: numberField(totals, "cachedInputTokens"),
      outputTokens: numberField(totals, "outputTokens"),
      actualTotalTokens: numberField(totals, "actualTotalTokens"),
      cachedInputIsSubsetOfInput: true as const,
      effectiveModel: "UNKNOWN" as const,
      billingSettlement: "UNKNOWN" as const,
      assistantAndConductorUsage: "UNKNOWN" as const,
      rawReceipts,
    }),
    conversationSnapshotObservation: Object.freeze({
      source: "conversation snapshot; not canonical SDK evidence" as const,
      displayedTokens: 160516 as const,
      elapsedSeconds: 224 as const,
      classification: "stale display; excluded from SDK call totals" as const,
    }),
  });
}
