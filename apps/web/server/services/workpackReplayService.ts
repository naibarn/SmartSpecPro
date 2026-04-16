import type { ReplayDiffCategory } from "../../shared/workpackContracts";
import { getWorkpackDetail, getWorkpackRun, getSimulationRun, saveTelemetryEvent } from "./workpackPersistence";

export interface WorkpackReplayDiff {
  category: ReplayDiffCategory;
  stepId: string | null;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  remediationPointer: string;
}

export interface WorkpackReplayResult {
  workpackId: string;
  versionId: string;
  runId: string | null;
  simulationRunId: string | null;
  inspectionMode: "inspection_only";
  diffs: WorkpackReplayDiff[];
  gateStatus: "clean" | "review_required" | "blocked";
  canReemitSideEffects: false;
  nextAction: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hasMeaningfulOutputDrift(expectedOutcome: string, actualSummary: string): boolean {
  const expectedTokens = expectedOutcome.toLowerCase().split(/\W+/).filter(Boolean);
  const actual = actualSummary.toLowerCase();
  return expectedTokens.length > 0 && expectedTokens.every((token) => !actual.includes(token));
}

function severityForCategory(category: ReplayDiffCategory): WorkpackReplayDiff["severity"] {
  if (category === "policy_boundary_violation" || category === "incident_interrupted") return "critical";
  if (category === "connector_auth_mismatch" || category === "schema_mismatch" || category === "missing_step") return "high";
  if (category === "approval_drift" || category === "output_drift" || category === "browser_layout_instability") return "medium";
  return "low";
}

function remediationPointerForCategory(workpackId: string, category: ReplayDiffCategory): string {
  if (category === "connector_auth_mismatch" || category === "schema_mismatch") {
    return `/workpacks/${workpackId}/connectors`;
  }
  if (category === "approval_drift" || category === "policy_boundary_violation") {
    return `/workpacks/${workpackId}`;
  }
  return `/workpacks/${workpackId}/replay`;
}

function buildDiff(workpackId: string, stepId: string | null, category: ReplayDiffCategory, summary: string): WorkpackReplayDiff {
  return {
    category,
    stepId,
    severity: severityForCategory(category),
    summary,
    remediationPointer: remediationPointerForCategory(workpackId, category),
  };
}

export async function analyzeWorkpackReplay(input: {
  workpackId: string;
  runId?: string | null;
  simulationRunId?: string | null;
}): Promise<WorkpackReplayResult> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const run = input.runId
    ? await getWorkpackRun(input.runId)
    : input.simulationRunId
      ? null
      : detail.runs[0] ?? null;
  const simulationRun = input.simulationRunId
    ? await getSimulationRun(input.simulationRunId)
    : input.runId
      ? null
      : detail.simulations[0] ?? null;

  const expectedSteps = simulationRun?.expectedSteps ?? run?.plannedSteps ?? detail.version.executionPlan?.steps ?? detail.playbook.steps;
  const actualSteps = simulationRun?.simulatedSteps ?? run?.actualSteps ?? [];
  const approvalCheckpoints = run?.approvalCheckpoints ?? [];
  const connectorSummaries = run?.connectorSummaries ?? [];
  const diffs: WorkpackReplayDiff[] = [];

  const expectedByStep = new Map(expectedSteps.map((step, index) => [step.id, { step, index }] as const));
  const actualByStep = new Map(actualSteps.map((step, index) => [step.stepId, { step, index }] as const));
  const expectedOrder = expectedSteps.map((step) => step.id).join(">");
  const actualOrder = actualSteps.map((step) => step.stepId).join(">");

  if (expectedOrder !== actualOrder && expectedSteps.length === actualSteps.length) {
    diffs.push(buildDiff(
      detail.workpack.id,
      null,
      "step_order_drift",
      "Observed step order drifted from the planned sequence.",
    ));
  }

  for (const expected of expectedSteps) {
    if (!actualByStep.has(expected.id)) {
      diffs.push(buildDiff(
        detail.workpack.id,
        expected.id,
        "missing_step",
        `Expected step ${expected.title} was not observed during replay.`,
      ));
    }
  }

  for (const actual of actualSteps) {
    if (!expectedByStep.has(actual.stepId)) {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "extra_step",
        `Observed unexpected step ${actual.title}.`,
      ));
      continue;
    }

    const expectedMeta = expectedByStep.get(actual.stepId)!;
    if (expectedMeta.index !== actualByStep.get(actual.stepId)?.index) {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "step_order_drift",
        `Step ${actual.title} executed in a different order than planned.`,
      ));
    }

    if (hasMeaningfulOutputDrift(expectedMeta.step.expectedOutcome, actual.outputSummary)) {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "output_drift",
        `Step ${actual.title} produced output that differs from the expected outcome.`,
      ));
    }

    if (actual.outputSummary.toLowerCase().includes("layout") || actual.outputSummary.toLowerCase().includes("dom")) {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "browser_layout_instability",
        `Browser/layout instability was observed for step ${actual.title}.`,
      ));
    }

    if (actual.status === "failed") {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "transient_failure",
        `Step ${actual.title} failed during replay inspection.`,
      ));
    }

    if (actual.status === "blocked") {
      diffs.push(buildDiff(
        detail.workpack.id,
        actual.stepId,
        "policy_boundary_violation",
        `Step ${actual.title} was blocked by a policy or runtime boundary.`,
      ));
    }
  }

  for (const step of expectedSteps) {
    if (!step.requiresApproval) continue;
    const checkpoint = approvalCheckpoints.find((item) => item.stepId === step.id);
    if (!checkpoint || checkpoint.approved !== false) continue;
    diffs.push(buildDiff(
      detail.workpack.id,
      step.id,
      "approval_drift",
      `Approval checkpoint for ${step.title} remains unresolved in the replay evidence.`,
    ));
  }

  for (const summary of connectorSummaries) {
    if (summary.status === "blocked") {
      diffs.push(buildDiff(
        detail.workpack.id,
        null,
        "connector_auth_mismatch",
        `Connector ${summary.connectorFamily} is blocked in replay evidence.`,
      ));
    } else if (summary.status === "stale") {
      diffs.push(buildDiff(
        detail.workpack.id,
        null,
        "schema_mismatch",
        `Connector ${summary.connectorFamily} is stale and needs revalidation.`,
      ));
    }
  }

  if ((run?.status === "cancelled" || run?.notes.toLowerCase().includes("incident"))) {
    diffs.push(buildDiff(
      detail.workpack.id,
      null,
      "incident_interrupted",
      "Replay was interrupted by an incident control or cancellation event.",
    ));
  }

  const gateStatus = diffs.some((diff) => diff.severity === "critical" || diff.severity === "high")
    ? "blocked"
    : diffs.length > 0
      ? "review_required"
      : "clean";
  const nextAction = gateStatus === "clean"
    ? "Replay evidence is clean. Safe to continue with readiness review."
    : diffs[0]?.remediationPointer
      ? `Inspect ${diffs[0].remediationPointer} before rerunning a fresh execution.`
      : "Inspect replay evidence before rerunning a fresh execution.";

  return {
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    runId: run?.id ?? null,
    simulationRunId: simulationRun?.id ?? null,
    inspectionMode: "inspection_only",
    diffs,
    gateStatus,
    canReemitSideEffects: false,
    nextAction,
  };
}

export async function replayWorkpackRun(input: {
  workpackId: string;
  runId?: string | null;
  simulationRunId?: string | null;
}): Promise<WorkpackReplayResult> {
  const replay = await analyzeWorkpackReplay(input);
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  await saveTelemetryEvent({
    id: `evt_${Date.now().toString(36)}`,
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: replay.gateStatus === "clean" ? "simulation_passed" : "simulation_failed",
    detail: `Inspection-only replay produced ${replay.diffs.length} diff markers`,
    createdAt: nowIso(),
  });

  return replay;
}
