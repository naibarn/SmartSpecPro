import {
  benchmarkPackSchema,
  getMostRestrictiveTrustTag,
  isBenchmarkShareableOutsideTenant,
  workpackPromotionRecordSchema,
} from "../../shared/workpackPromotion";
import { deriveWorkpackImprovementProposals } from "./workpackLearningService";
import {
  createWorkpackId,
  getPromotionRecordForTenant,
  getWorkpackDetail,
  saveBenchmarkPack,
  savePromotionRecord,
  saveTelemetryEvent,
  updateBenchmarkPack,
  updatePromotionRecord,
  updateWorkpack,
  withWorkpackPersistenceTransaction,
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

export async function evaluateWorkpackPromotionEligibility(workpackId: string): Promise<WorkpackPromotionEligibility> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const learningBundle = await deriveWorkpackImprovementProposals(workpackId);
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

export async function publishBenchmarkPack(input: {
  workpackId: string;
  publicationScope?: "tenant_local" | "tenant_template" | "cross_tenant";
  publisherId?: number | null;
}): Promise<{
  benchmarkPack: ReturnType<typeof benchmarkPackSchema.parse> | null;
  promotionRecord: ReturnType<typeof workpackPromotionRecordSchema.parse>;
  eligibility: WorkpackPromotionEligibility;
}> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const eligibility = await evaluateWorkpackPromotionEligibility(input.workpackId);
  const createdAt = nowIso();
  const previousActive = detail.promotionRecords.find((record) => record.state === "active") ?? null;

  if (!eligibility.eligible) {
    const promotionRecord = await withWorkpackPersistenceTransaction(async (session) => {
      const blockedRecord = await savePromotionRecord(workpackPromotionRecordSchema.parse({
        id: createWorkpackId("prom"),
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        benchmarkPackId: null,
        previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
        state: "blocked",
        reasonCode: eligibility.reasonCode,
        evidenceCapturedAt: createdAt,
        rollbackAvailable: Boolean(previousActive),
      }), session);
      await saveTelemetryEvent({
        id: createWorkpackId("evt"),
        tenantId: detail.workpack.tenantId,
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        eventName: "promotion_blocked",
        detail: `Promotion blocked: ${eligibility.reasonCode}`,
        createdAt,
      }, session);
      await updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        promotionState: "blocked",
        updatedAt: createdAt,
      }), session);
      return blockedRecord;
    });
    return {
      benchmarkPack: null,
      promotionRecord,
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
    const promotionRecord = await withWorkpackPersistenceTransaction(async (session) => {
      const blockedRecord = await savePromotionRecord(workpackPromotionRecordSchema.parse({
        id: createWorkpackId("prom"),
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        benchmarkPackId: null,
        previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
        state: "blocked",
        reasonCode: "benchmark_not_shareable",
        evidenceCapturedAt: createdAt,
        rollbackAvailable: Boolean(previousActive),
      }), session);
      await saveTelemetryEvent({
        id: createWorkpackId("evt"),
        tenantId: detail.workpack.tenantId,
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        eventName: "promotion_blocked",
        detail: "Promotion blocked because the benchmark cannot cross trust boundaries yet",
        createdAt,
      }, session);
      await updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        promotionState: "blocked",
        updatedAt: createdAt,
      }), session);
      return blockedRecord;
    });
    return {
      benchmarkPack: null,
      promotionRecord,
      eligibility: {
        ...eligibility,
        eligible: false,
        reasonCode: "benchmark_not_shareable",
      },
    };
  }

  const promotionRecord = await withWorkpackPersistenceTransaction(async (session) => {
    await saveBenchmarkPack(benchmarkPack, session);
    const record = await savePromotionRecord(workpackPromotionRecordSchema.parse({
      id: createWorkpackId("prom"),
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      benchmarkPackId: benchmarkPack.id,
      previousActiveBenchmarkPackId: previousActive?.benchmarkPackId ?? null,
      state: "active",
      reasonCode: "promotion_active",
      evidenceCapturedAt: createdAt,
      rollbackAvailable: true,
    }), session);
    await saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "promotion_approved",
      detail: `Benchmark published in ${requestedScope} scope`,
      createdAt,
    }, session);
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      promotionState: "promoted",
      updatedAt: createdAt,
    }), session);
    return record;
  });

  return {
    benchmarkPack,
    promotionRecord,
    eligibility,
  };
}

export async function rollbackWorkpackPromotion(input: {
  tenantId: string;
  promotionRecordId: string;
}): Promise<ReturnType<typeof workpackPromotionRecordSchema.parse>> {
  return withWorkpackPersistenceTransaction(async (session) => {
    const record = await getPromotionRecordForTenant(input.tenantId, input.promotionRecordId, session);
    if (!record) {
      throw new Error(`Unknown promotion record: ${input.promotionRecordId}`);
    }
    const detail = await getWorkpackDetail(record.workpackId, session);
    if (!detail || detail.workpack.tenantId !== input.tenantId) {
      throw new Error(`Unknown workpack for promotion record: ${input.promotionRecordId}`);
    }

    const updatedRecord = await updatePromotionRecord(record.id, (current) => ({
      ...current,
      state: "rolled_back",
      reasonCode: "rollback_requested",
      rollbackAvailable: false,
    }), session);
    if (!updatedRecord) {
      throw new Error(`Failed to update promotion record: ${input.promotionRecordId}`);
    }

    if (record.benchmarkPackId) {
      await updateBenchmarkPack(record.benchmarkPackId, (benchmarkPack) => ({
        ...benchmarkPack,
        publicationStatus: "rolled_back",
      }), session);
    }

    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      promotionState: "reverted",
      updatedAt: nowIso(),
    }), session);
    await saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: detail.workpack.tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      eventName: "promotion_reverted",
      detail: `Promotion rolled back from ${getMostRestrictiveTrustTag((detail.benchmarks[0]?.trustTags ?? ["verified"]) as any)}`,
      createdAt: nowIso(),
    }, session);

    return updatedRecord;
  });
}
