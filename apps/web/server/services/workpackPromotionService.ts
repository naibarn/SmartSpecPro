import {
  benchmarkPackSchema,
  getMostRestrictiveTrustTag,
  isBenchmarkShareableOutsideTenant,
  workpackPromotionRecordSchema,
} from "../../shared/workpackPromotion";
import { deriveWorkpackImprovementProposals } from "./workpackLearningService";
import {
  createWorkpackId,
  getPromotionRecord,
  getWorkpackDetail,
  saveBenchmarkPack,
  savePromotionRecord,
  saveTelemetryEvent,
  updateBenchmarkPack,
  updatePromotionRecord,
  updateWorkpack,
} from "./workpackPersistence";

export interface WorkpackPromotionEligibility {
  eligible: boolean;
  reasonCode: string;
  publicationScope: "tenant_local" | "tenant_template" | "cross_tenant";
  trustTags: string[];
  evidenceCompleteness: number;
  benchmarkCandidate: boolean;
  rollbackAvailable: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function evaluateWorkpackPromotionEligibility(workpackId: string): WorkpackPromotionEligibility {
  const detail = getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const learningBundle = deriveWorkpackImprovementProposals(workpackId);
  const unresolvedExceptions = detail.exceptions.filter((record) => !record.resolvedAt);
  const passedSimulationCount = detail.simulations.filter((simulation) => simulation.status === "passed").length;
  const successfulRunCount = detail.runs.filter((run) => run.status === "succeeded").length;
  const benchmarkCandidate = learningBundle.benchmarkCandidate;
  const connectorHealthy = detail.version.connectorMaps.length === 0
    || detail.version.connectorMaps.every((map) => map.validationStatus === "validated");
  const evidenceCompleteness = Math.min(
    1,
    (passedSimulationCount > 0 ? 0.45 : 0)
      + (successfulRunCount > 0 ? 0.35 : 0)
      + (connectorHealthy ? 0.2 : 0),
  );
  const trustTags = Array.from(new Set(learningBundle.proposals.flatMap((proposal) => proposal.trustTags)));

  if (!detail.version.executionPlan) {
    return {
      eligible: false,
      reasonCode: "execution_plan_missing",
      publicationScope: "tenant_local",
      trustTags,
      evidenceCompleteness,
      benchmarkCandidate: false,
      rollbackAvailable: false,
    };
  }

  if (unresolvedExceptions.some((record) => record.riskClass === "critical" || record.riskClass === "high")) {
    return {
      eligible: false,
      reasonCode: "exception_burden_high",
      publicationScope: "tenant_local",
      trustTags,
      evidenceCompleteness,
      benchmarkCandidate,
      rollbackAvailable: false,
    };
  }

  if (!connectorHealthy) {
    return {
      eligible: false,
      reasonCode: "connector_validation_incomplete",
      publicationScope: "tenant_local",
      trustTags,
      evidenceCompleteness,
      benchmarkCandidate,
      rollbackAvailable: false,
    };
  }

  if (!benchmarkCandidate) {
    return {
      eligible: false,
      reasonCode: "benchmark_candidate_missing",
      publicationScope: "tenant_local",
      trustTags,
      evidenceCompleteness,
      benchmarkCandidate,
      rollbackAvailable: false,
    };
  }

  return {
    eligible: true,
    reasonCode: "eligible",
    publicationScope: "tenant_local",
    trustTags,
    evidenceCompleteness,
    benchmarkCandidate,
    rollbackAvailable: detail.promotionRecords.length > 0,
  };
}

export function publishBenchmarkPack(input: {
  workpackId: string;
  publicationScope?: "tenant_local" | "tenant_template" | "cross_tenant";
  publisherId?: number | null;
}): {
  benchmarkPack: ReturnType<typeof benchmarkPackSchema.parse> | null;
  promotionRecord: ReturnType<typeof workpackPromotionRecordSchema.parse>;
  eligibility: WorkpackPromotionEligibility;
} {
  const detail = getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const eligibility = evaluateWorkpackPromotionEligibility(input.workpackId);
  const createdAt = nowIso();
  const previousActive = detail.promotionRecords.find((record) => record.state === "active") ?? null;

  if (!eligibility.eligible) {
    const blockedRecord = savePromotionRecord(workpackPromotionRecordSchema.parse({
      id: createWorkpackId("prom"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      benchmarkPackId: null,
      previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
      state: "blocked",
      reasonCode: eligibility.reasonCode,
      evidenceCapturedAt: createdAt,
      rollbackAvailable: Boolean(previousActive),
    }));
    saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "promotion_blocked",
      detail: `Promotion blocked: ${eligibility.reasonCode}`,
      createdAt,
    });
    updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      promotionState: "blocked",
      updatedAt: createdAt,
    }));
    return {
      benchmarkPack: null,
      promotionRecord: blockedRecord,
      eligibility,
    };
  }

  const requestedScope = input.publicationScope ?? eligibility.publicationScope;
  const fixturesDeidentified = detail.version.fixtureCatalog.every((fixture) => fixture.governance.redactionState === "de_identified");
  const outputsDeidentified = detail.runs.every((run) => run.artifactReferences.every((artifact) => artifact.governance.redactionState === "de_identified"));
  const benchmarkPack = benchmarkPackSchema.parse({
    id: createWorkpackId("bench"),
    sourceWorkpackId: detail.workpack.id,
    sourceVersionId: detail.version.id,
    title: `${detail.workpack.title} benchmark`,
    clonedFromBenchmarkId: previousActive?.benchmarkPackId ?? null,
    lineage: detail.benchmarks.map((benchmark) => benchmark.id),
    fixtureIds: detail.version.fixtureCatalog.map((fixture) => fixture.id),
    evaluationRules: [
      "Replay must remain inspection-only",
      "Connector mappings must stay validated",
      "Exception burden must stay below high severity",
    ],
    trustTags: eligibility.trustTags as any,
    publicationScope: requestedScope,
    publicationStatus: "published",
    fixturesDeidentified,
    outputsDeidentified,
    publishedAt: createdAt,
  });

  if (requestedScope !== "tenant_local" && !isBenchmarkShareableOutsideTenant(benchmarkPack)) {
    const blockedRecord = savePromotionRecord(workpackPromotionRecordSchema.parse({
      id: createWorkpackId("prom"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      benchmarkPackId: null,
      previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
      state: "blocked",
      reasonCode: "benchmark_not_shareable",
      evidenceCapturedAt: createdAt,
      rollbackAvailable: Boolean(previousActive),
    }));
    saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "promotion_blocked",
      detail: "Promotion blocked because the benchmark cannot cross trust boundaries yet",
      createdAt,
    });
    return {
      benchmarkPack: null,
      promotionRecord: blockedRecord,
      eligibility: {
        ...eligibility,
        eligible: false,
        reasonCode: "benchmark_not_shareable",
      },
    };
  }

  saveBenchmarkPack(benchmarkPack);
  const promotionRecord = savePromotionRecord(workpackPromotionRecordSchema.parse({
    id: createWorkpackId("prom"),
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    benchmarkPackId: benchmarkPack.id,
    previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
    state: "active",
    reasonCode: "promotion_active",
    evidenceCapturedAt: createdAt,
    rollbackAvailable: true,
  }));
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: "promotion_approved",
    detail: `Benchmark published in ${requestedScope} scope`,
    createdAt,
  });
  updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    promotionState: "promoted",
    updatedAt: createdAt,
  }));

  return {
    benchmarkPack,
    promotionRecord,
    eligibility,
  };
}

export function rollbackWorkpackPromotion(promotionRecordId: string): ReturnType<typeof workpackPromotionRecordSchema.parse> {
  const record = getPromotionRecord(promotionRecordId);
  if (!record) {
    throw new Error(`Unknown promotion record: ${promotionRecordId}`);
  }
  const detail = getWorkpackDetail(record.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack for promotion record: ${promotionRecordId}`);
  }

  const updatedRecord = updatePromotionRecord(promotionRecordId, (current) => ({
    ...current,
    state: "rolled_back",
    reasonCode: "rollback_requested",
    rollbackAvailable: false,
  }));
  if (!updatedRecord) {
    throw new Error(`Failed to update promotion record: ${promotionRecordId}`);
  }

  if (record.benchmarkPackId) {
    updateBenchmarkPack(record.benchmarkPackId, (benchmarkPack) => ({
      ...benchmarkPack,
      publicationStatus: "rolled_back",
    }));
  }

  updateWorkpack(detail.workpack.id, (workpack) => ({
    ...workpack,
    promotionState: "reverted",
    updatedAt: nowIso(),
  }));
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    eventName: "promotion_reverted",
    detail: `Promotion rolled back from ${getMostRestrictiveTrustTag((detail.benchmarks[0]?.trustTags ?? ["verified"]) as any)}`,
    createdAt: nowIso(),
  });

  return updatedRecord;
}
