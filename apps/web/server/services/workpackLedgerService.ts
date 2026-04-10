import {
  buildDefaultEvidenceGovernance,
  sanitizeSensitiveRecord,
  type EvidenceGovernance,
  type Workpack,
  type WorkpackApprovalCheckpoint,
  type WorkpackArtifactReference,
  type WorkpackConnectorSummary,
  type WorkpackRun,
  type WorkpackRunStatus,
  type WorkpackRunStep,
  workpackArtifactReferenceSchema,
  workpackConnectorSummarySchema,
  workpackRunSchema,
  workpackRunStepSchema,
} from "../../shared/workpackContracts";
import { createWorkpackId, getWorkpackDetail, getWorkpackRun, saveTelemetryEvent, saveWorkpackRun, updateWorkpackRun } from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

function buildRunEventName(status: WorkpackRunStatus): "run_started" | "run_blocked" | "run_succeeded" {
  if (status === "blocked" || status === "cancelled" || status === "failed") {
    return "run_blocked";
  }
  if (status === "succeeded") {
    return "run_succeeded";
  }
  return "run_started";
}

export function openLedgerRun(input: {
  workpack: Workpack;
  versionId: string;
  plannedSteps: WorkpackRun["plannedSteps"];
  autonomyMode: WorkpackRun["autonomyMode"];
  trigger?: WorkpackRun["trigger"];
  triggerSource?: string;
  scheduleId?: string | null;
  status?: WorkpackRunStatus;
  notes?: string;
}): WorkpackRun {
  const startedAt = nowIso();
  const run = workpackRunSchema.parse({
    id: createWorkpackId("wpr"),
    workpackId: input.workpack.id,
    versionId: input.versionId,
    tenantId: input.workpack.tenantId,
    trigger: input.trigger ?? "manual",
    triggerSource: input.triggerSource ?? "control_plane",
    scheduleId: input.scheduleId ?? null,
    startedAt,
    endedAt: null,
    status: input.status ?? "running",
    autonomyMode: input.autonomyMode,
    plannedSteps: input.plannedSteps,
    actualSteps: [],
    approvalCheckpoints: [],
    artifactReferences: [],
    connectorSummaries: [],
    notes: input.notes ?? "",
  });

  saveWorkpackRun(run);
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: input.workpack.tenantId,
    workpackId: input.workpack.id,
    versionId: input.versionId,
    eventName: "run_started",
    detail: `Ledger run opened in ${input.autonomyMode} mode`,
    createdAt: startedAt,
  });

  return run;
}

export function finalizeLedgerRun(input: {
  runId: string;
  status: WorkpackRunStatus;
  actualSteps: WorkpackRunStep[];
  approvalCheckpoints?: WorkpackApprovalCheckpoint[];
  artifactReferences?: WorkpackArtifactReference[];
  connectorSummaries?: WorkpackConnectorSummary[];
  notes?: string;
}): WorkpackRun {
  const existing = getWorkpackRun(input.runId);
  if (!existing) {
    throw new Error(`Unknown workpack run: ${input.runId}`);
  }

  const endedAt = nowIso();
  const next = workpackRunSchema.parse({
    ...existing,
    status: input.status,
    endedAt,
    actualSteps: input.actualSteps.map((step) => workpackRunStepSchema.parse(step)),
    approvalCheckpoints: input.approvalCheckpoints ?? existing.approvalCheckpoints,
    artifactReferences: input.artifactReferences ?? existing.artifactReferences,
    connectorSummaries: input.connectorSummaries ?? existing.connectorSummaries,
    notes: input.notes ?? existing.notes,
  });
  saveWorkpackRun(next);

  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: next.tenantId,
    workpackId: next.workpackId,
    versionId: next.versionId,
    eventName: buildRunEventName(next.status),
    detail: `Ledger run ${next.status} with ${next.actualSteps.length} observed steps`,
    createdAt: endedAt,
  });

  return next;
}

export function appendLedgerArtifacts(runId: string, artifacts: WorkpackArtifactReference[]): WorkpackRun {
  const updated = updateWorkpackRun(runId, (run) => ({
    ...run,
    artifactReferences: [...run.artifactReferences, ...artifacts.map((artifact) => workpackArtifactReferenceSchema.parse(artifact))],
  }));
  if (!updated) {
    throw new Error(`Unknown workpack run: ${runId}`);
  }
  return updated;
}

export function appendConnectorSummaries(runId: string, connectorSummaries: WorkpackConnectorSummary[]): WorkpackRun {
  const updated = updateWorkpackRun(runId, (run) => ({
    ...run,
    connectorSummaries: [
      ...run.connectorSummaries,
      ...connectorSummaries.map((summary) => workpackConnectorSummarySchema.parse(summary)),
    ],
  }));
  if (!updated) {
    throw new Error(`Unknown workpack run: ${runId}`);
  }
  return updated;
}

export function buildArtifactReference(input: {
  label: string;
  summary: string | Record<string, unknown>;
  governance?: Partial<EvidenceGovernance>;
}): WorkpackArtifactReference {
  return workpackArtifactReferenceSchema.parse({
    artifactId: createWorkpackId("artifact"),
    label: input.label,
    governance: buildDefaultEvidenceGovernance(input.governance),
    summary: typeof input.summary === "string"
      ? input.summary
      : JSON.stringify(sanitizeSensitiveRecord(input.summary)),
  });
}

export function createReplayGradeLedger(input: {
  workpackId: string;
  autonomyMode?: WorkpackRun["autonomyMode"];
  trigger?: WorkpackRun["trigger"];
  triggerSource?: string;
  scheduleId?: string | null;
  notes?: string;
}): WorkpackRun {
  const detail = getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  return openLedgerRun({
    workpack: detail.workpack,
    versionId: detail.version.id,
    plannedSteps: detail.version.executionPlan?.steps ?? detail.version.playbook.steps,
    autonomyMode: input.autonomyMode ?? "supervised",
    trigger: input.trigger,
    triggerSource: input.triggerSource,
    scheduleId: input.scheduleId,
    notes: input.notes,
  });
}
