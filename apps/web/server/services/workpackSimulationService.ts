import {
  type SimulationRun,
  type WorkpackApprovalCheckpoint,
  type WorkpackRunStep,
  simulationRunSchema,
} from "../../shared/workpackContracts";
import { compileWorkpackExecutionPlan } from "./workpackCompilerService";
import { getConnectorStudioView } from "./workpackConnectorService";
import { normalizeWorkpackException } from "./workpackExceptionService";
import { buildArtifactReference, createReplayGradeLedger, finalizeLedgerRun } from "./workpackLedgerService";
import { createWorkpackId, getWorkpackDetail, saveSimulationRun, saveTelemetryEvent, updateWorkpack } from "./workpackPersistence";

export interface SimulateWorkpackResult {
  simulationRun: SimulationRun;
  ledgerRunId: string;
  exceptionIds: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeFixturePayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return "No fixture payload available";
  return `Fixture seeded with ${keys.slice(0, 4).join(", ")}`;
}

export function simulateWorkpack(input: {
  workpackId: string;
  requestedBy?: number | null;
}): SimulateWorkpackResult {
  const detailBeforeCompile = getWorkpackDetail(input.workpackId);
  if (!detailBeforeCompile) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  if (!detailBeforeCompile.version.executionPlan) {
    compileWorkpackExecutionPlan({ workpackId: input.workpackId, requestedBy: input.requestedBy ?? null });
  }

  const detail = getWorkpackDetail(input.workpackId);
  if (!detail || !detail.version.executionPlan) {
    throw new Error(`Execution plan unavailable for workpack: ${input.workpackId}`);
  }

  const connectorView = getConnectorStudioView(input.workpackId);
  const ledgerRun = createReplayGradeLedger({
    workpackId: input.workpackId,
    autonomyMode: "supervised",
    notes: "fixture-backed simulation",
  });

  const firstFixture = detail.version.fixtureCatalog[0] ?? null;
  const actualSteps: WorkpackRunStep[] = [];
  const approvalCheckpoints: WorkpackApprovalCheckpoint[] = [];
  const artifactReferences = [];
  const diffSummary: string[] = [];
  const mismatchCategories = new Set<SimulationRun["mismatchCategories"][number]>();
  const remediationPointers = new Set<string>();
  const exceptionIds: string[] = [];

  for (const step of detail.version.executionPlan.steps) {
    const blockedConnector = step.requiredConnectorFamilies.find((family) => (
      connectorView.connectorMaps.some((connectorMap) => (
        connectorMap.connectorFamily === family && connectorMap.validationStatus === "blocked"
      ))
    ));

    if (!firstFixture && detail.version.executionPlan.fixtureRequirements.requiresFixtures) {
      const exceptionRecord = normalizeWorkpackException({
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        runId: ledgerRun.id,
        reasonCategory: "ambiguity",
        reasonCode: "fixture_missing",
        title: "Simulation fixture missing",
        summary: `Step ${step.title} cannot be simulated because no masked fixture is available.`,
        remediationPointer: `/workpacks/${detail.workpack.id}/replay`,
        nextAction: "Add or refresh masked fixtures before rerunning simulation.",
        riskClass: "medium",
        mismatchCategory: "fixture_unavailable",
      });
      exceptionIds.push(exceptionRecord.id);
      diffSummary.push(exceptionRecord.summary);
      mismatchCategories.add("fixture_unavailable");
      remediationPointers.add(exceptionRecord.remediationPointer);
      actualSteps.push({
        stepId: step.id,
        title: step.title,
        runtimePath: step.preferredRuntimePath,
        status: "blocked",
        sideEffectClass: step.sideEffectClass,
        effectKey: step.idempotency.effectKey ?? null,
        outputSummary: "Simulation blocked because fixtures are unavailable.",
      });
      continue;
    }

    if (blockedConnector) {
      const exceptionRecord = normalizeWorkpackException({
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        runId: ledgerRun.id,
        reasonCategory: "connector_auth",
        reasonCode: "connector_validation_blocked",
        title: "Connector validation blocked simulation",
        summary: `Step ${step.title} cannot proceed because ${blockedConnector} is not validated.`,
        remediationPointer: `/workpacks/${detail.workpack.id}/connectors`,
        nextAction: "Refresh connector mapping or narrow scopes before rerunning simulation.",
        riskClass: "high",
        mismatchCategory: "connector_auth_mismatch",
      });
      exceptionIds.push(exceptionRecord.id);
      diffSummary.push(exceptionRecord.summary);
      mismatchCategories.add("connector_auth_mismatch");
      remediationPointers.add(exceptionRecord.remediationPointer);
      actualSteps.push({
        stepId: step.id,
        title: step.title,
        runtimePath: step.preferredRuntimePath,
        status: "blocked",
        sideEffectClass: step.sideEffectClass,
        effectKey: step.idempotency.effectKey ?? null,
        outputSummary: `Simulation blocked by connector ${blockedConnector}.`,
      });
      continue;
    }

    if (step.requiresApproval) {
      approvalCheckpoints.push({
        stepId: step.id,
        reason: `Approval checkpoint preserved during simulation for ${step.title}`,
        approved: false,
      });
      diffSummary.push(`Approval checkpoint preserved for ${step.title}`);
    }

    actualSteps.push({
      stepId: step.id,
      title: step.title,
      runtimePath: step.preferredRuntimePath,
      status: "succeeded",
      sideEffectClass: step.sideEffectClass,
      effectKey: step.idempotency.effectKey ?? null,
      outputSummary: `${step.expectedOutcome}. ${summarizeFixturePayload((firstFixture?.payload as Record<string, unknown> | undefined) ?? {})}`,
    });

    artifactReferences.push(buildArtifactReference({
      label: `${step.title} evidence`,
      summary: {
        stepId: step.id,
        output: step.expectedOutcome,
        fixtureLabel: firstFixture?.label ?? "none",
      },
      governance: firstFixture?.governance ?? {},
    }));
  }

  const blockedCount = actualSteps.filter((step) => step.status === "blocked").length;
  const simulationStatus = blockedCount > 0 ? "blocked" : "passed";
  const runStatus = blockedCount > 0 ? "blocked" : "succeeded";
  const createdAt = nowIso();

  const finishedRun = finalizeLedgerRun({
    runId: ledgerRun.id,
    status: runStatus,
    actualSteps,
    approvalCheckpoints,
    artifactReferences,
    connectorSummaries: connectorView.connectorMaps.map((connectorMap) => ({
      connectorFamily: connectorMap.connectorFamily,
      status: connectorMap.validationStatus,
      summary: `Scope posture ${connectorMap.scopePosture}; missing ${connectorMap.missingFields.length}; drifted ${connectorMap.driftedFields.length}`,
    })),
    notes: blockedCount > 0 ? "simulation blocked by validation or fixture gaps" : "simulation passed",
  });

  const simulationRun = simulationRunSchema.parse({
    id: createWorkpackId("sim"),
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    tenantId: detail.workpack.tenantId,
    runId: finishedRun.id,
    status: simulationStatus,
    expectedSteps: detail.version.executionPlan.steps,
    simulatedSteps: actualSteps,
    diffSummary,
    mismatchCategories: Array.from(mismatchCategories),
    remediationPointers: Array.from(remediationPointers),
    createdAt,
  });

  saveSimulationRun(simulationRun);
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: simulationStatus === "passed" ? "simulation_passed" : "simulation_failed",
    detail: simulationStatus === "passed"
      ? "Fixture-backed simulation completed successfully"
      : `Simulation blocked with ${blockedCount} step issues`,
    createdAt,
  });

  updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    lifecycleState: simulationStatus === "passed" ? "needs_review" : "needs_review",
    updatedAt: createdAt,
  }));

  return {
    simulationRun,
    ledgerRunId: finishedRun.id,
    exceptionIds,
  };
}
