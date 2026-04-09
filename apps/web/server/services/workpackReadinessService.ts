import { workpackReadinessSummarySchema, type WorkpackReadinessSummary } from "../../shared/workpackTelemetry";
import { evaluateWorkpackPromotionEligibility } from "./workpackPromotionService";
import { evaluateWorkpackRolloutGate } from "./workpackRolloutGateService";
import { getWorkpackDetail, listWorkpackDetailsByTenant } from "./workpackPersistence";
import { captureWorkpackMetricSnapshot, getLatestMetricSnapshot } from "./workpackTelemetryService";

function nowIso(): string {
  return new Date().toISOString();
}

function deriveTrustStatus(detail: NonNullable<ReturnType<typeof getWorkpackDetail>>): WorkpackReadinessSummary["trustStatus"] {
  if (detail.version.fixtureCatalog.some((fixture) => fixture.governance.redactionState === "unscrubbed")) {
    return "restricted";
  }
  if (detail.version.fixtureCatalog.some((fixture) => fixture.governance.redactionState !== "de_identified")) {
    return "tainted";
  }
  return "verified";
}

function deriveConnectorHealth(detail: NonNullable<ReturnType<typeof getWorkpackDetail>>): WorkpackReadinessSummary["connectorHealth"] {
  if (detail.version.connectorMaps.some((map) => map.validationStatus === "blocked")) return "blocked";
  if (detail.version.connectorMaps.some((map) => map.validationStatus === "stale")) return "stale";
  return "healthy";
}

function deriveExceptionSeverity(detail: NonNullable<ReturnType<typeof getWorkpackDetail>>): WorkpackReadinessSummary["exceptionSeverity"] {
  if (detail.exceptions.some((record) => !record.resolvedAt && record.riskClass === "critical")) return "critical";
  if (detail.exceptions.some((record) => !record.resolvedAt && record.riskClass === "high")) return "high";
  if (detail.exceptions.some((record) => !record.resolvedAt && record.riskClass === "medium")) return "medium";
  if (detail.exceptions.some((record) => !record.resolvedAt)) return "low";
  return "none";
}

export async function getWorkpackReadinessSummary(workpackId: string): Promise<WorkpackReadinessSummary> {
  const detail = getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  const gate = await evaluateWorkpackRolloutGate({ workpackId, targetMode: "autonomous" });
  const promotionEligibility = evaluateWorkpackPromotionEligibility(workpackId);
  const snapshot = getLatestMetricSnapshot(workpackId) ?? captureWorkpackMetricSnapshot(workpackId);

  return workpackReadinessSummarySchema.parse({
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    rolloutPhase: gate.rolloutPhase,
    gateResult: gate.gateResult,
    reasonCode: gate.reasonCode,
    evidenceCompleteness: promotionEligibility.evidenceCompleteness,
    exceptionSeverity: deriveExceptionSeverity(detail),
    trustStatus: deriveTrustStatus(detail),
    connectorHealth: deriveConnectorHealth(detail),
    benchmarkAvailable: detail.benchmarks.some((benchmark) => benchmark.publicationStatus === "published"),
    rollbackAvailable: detail.promotionRecords.some((record) => record.rollbackAvailable),
    nextAction: gate.nextAction || `Latest completion rate ${snapshot.completionRate}`,
    updatedAt: nowIso(),
  });
}

export async function listWorkpackReadinessSummaries(tenantId: string): Promise<WorkpackReadinessSummary[]> {
  const details = listWorkpackDetailsByTenant(tenantId);
  const summaries = await Promise.all(details.map((detail) => getWorkpackReadinessSummary(detail.workpack.id)));
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
