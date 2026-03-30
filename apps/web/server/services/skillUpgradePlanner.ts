import { and, desc, eq, inArray } from "drizzle-orm";

import {
  skillContractSnapshots,
  skillImprovementRecommendations,
  skillImprovementRuns,
  type Skill,
  type SkillContractSnapshot,
  type SkillImprovementRecommendation,
  type SkillImprovementRun,
} from "../../drizzle/schema";
import {
  analyzeSkillForMaintenance,
  type SkillMaintenanceAnalysisResult,
} from "./skillMaintenanceAnalyzer";

type DbLike = any;

const ACTIVE_RECOMMENDATION_STATUSES = [
  "pending_review",
  "approved",
  "blocked",
  "failed",
] as const;

function sanitizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function persistSkillMaintenanceAnalysis(params: {
  db: DbLike;
  skill: Skill;
  requestedBy?: number | null;
  scheduleId?: number | null;
  triggerSource?: string;
}): Promise<{
  analysis: SkillMaintenanceAnalysisResult;
  run: SkillImprovementRun;
  recommendations: SkillImprovementRecommendation[];
  snapshots: SkillContractSnapshot[];
}> {
  const {
    db,
    skill,
    requestedBy = null,
    scheduleId = null,
    triggerSource = "manual",
  } = params;

  const analysis = analyzeSkillForMaintenance({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    folderPath: skill.folderPath,
    executionMode: skill.executionMode,
    configJson: (skill.configJson as Record<string, unknown> | null) ?? null,
    sandboxProfileSlug: skill.sandboxProfileSlug,
    requiresNetwork: skill.requiresNetwork,
    requiresBrowser: skill.requiresBrowser,
  });

  const [run] = await db
    .insert(skillImprovementRuns)
    .values({
      skillId: skill.id,
      tenantId: skill.tenantId,
      scheduleId,
      runType: "analysis",
      status: "running",
      triggerSource,
      requestedBy,
      summary: `Analyzing ${skill.slug}`,
      scopeJson: {
        skillSlug: skill.slug,
      },
      metricsJson: {},
      logsJson: {},
      verificationJson: {},
      diffSummaryJson: {},
      startedAt: new Date(),
    })
    .returning();

  const persistedRecommendations: SkillImprovementRecommendation[] = [];
  const persistedSnapshots: SkillContractSnapshot[] = [];

  for (const recommendation of analysis.recommendations) {
    const [existing] = await db
      .select()
      .from(skillImprovementRecommendations)
      .where(and(
        eq(skillImprovementRecommendations.skillId, skill.id),
        eq(skillImprovementRecommendations.recommendationType, recommendation.recommendationType),
        inArray(skillImprovementRecommendations.status, [...ACTIVE_RECOMMENDATION_STATUSES]),
      ))
      .orderBy(desc(skillImprovementRecommendations.updatedAt))
      .limit(1);

    const baseValues = {
      tenantId: skill.tenantId,
      scheduleId,
      title: recommendation.title,
      summary: recommendation.summary,
      rationale: sanitizeNullableText(typeof recommendation.details?.rationale === "string" ? recommendation.details.rationale : null),
      status: "pending_review" as const,
      riskLevel: recommendation.riskLevel,
      compatibilityStatus: recommendation.compatibilityStatus,
      qualityScore: analysis.qualityScore,
      confidenceScore: analysis.genjsCandidateScore > 0 ? Math.min(100, analysis.genjsCandidateScore * 10) : null,
      currentRuntime: analysis.currentRuntime,
      proposedRuntime: recommendation.proposedRuntime ?? null,
      proposedAction: recommendation.proposedAction ?? null,
      isAutoApplySafe: recommendation.isAutoApplySafe,
      isGenjsCandidate: recommendation.isGenjsCandidate,
      recommendationJson: {
        affectedFiles: recommendation.affectedFiles,
        details: recommendation.details,
        facts: analysis.facts,
      },
      contractDeltaJson: {
        contractHash: analysis.snapshot.contractHash,
        inputRequiredFields: analysis.snapshot.schemaSummary.input.requiredFields,
        outputRequiredFields: analysis.snapshot.schemaSummary.output.requiredFields,
      },
      analyzedAt: new Date(),
      updatedAt: new Date(),
    };

    let persistedRecommendation: SkillImprovementRecommendation;
    if (existing) {
      const [updated] = await db
        .update(skillImprovementRecommendations)
        .set(baseValues)
        .where(eq(skillImprovementRecommendations.id, existing.id))
        .returning();
      persistedRecommendation = updated;
    } else {
      const [created] = await db
        .insert(skillImprovementRecommendations)
        .values({
          skillId: skill.id,
          recommendationType: recommendation.recommendationType,
          createdAt: new Date(),
          ...baseValues,
        })
        .returning();
      persistedRecommendation = created;
    }

    persistedRecommendations.push(persistedRecommendation);

    const [snapshot] = await db
      .insert(skillContractSnapshots)
      .values({
        skillId: skill.id,
        tenantId: skill.tenantId,
        recommendationId: persistedRecommendation.id,
        runId: run.id,
        snapshotType: "baseline",
        executionMode: analysis.snapshot.executionMode,
        runtimeProfile: analysis.snapshot.runtimeProfile,
        manifestPath: analysis.snapshot.manifestPath,
        manifestHash: analysis.snapshot.manifestHash,
        inputSchemaHash: analysis.snapshot.inputSchemaHash,
        outputSchemaHash: analysis.snapshot.outputSchemaHash,
        fixtureHash: analysis.snapshot.fixtureHash,
        testsHash: analysis.snapshot.testsHash,
        contractHash: analysis.snapshot.contractHash,
        schemaSummaryJson: analysis.snapshot.schemaSummary,
        sampleInputsJson: [],
        sampleOutputsJson: [],
        compatibilityNotesJson: {
          fileInventory: analysis.snapshot.fileInventory,
        },
        snapshotJson: {
          fileInventory: analysis.snapshot.fileInventory,
          facts: analysis.facts,
        },
        capturedAt: new Date(),
        createdAt: new Date(),
      })
      .returning();

    persistedSnapshots.push(snapshot);
  }

  const [completedRun] = await db
    .update(skillImprovementRuns)
    .set({
      status: "completed",
      summary: `Analyzed ${skill.slug} (${persistedRecommendations.length} recommendation${persistedRecommendations.length === 1 ? "" : "s"})`,
      metricsJson: {
        qualityScore: analysis.qualityScore,
        recommendationCount: persistedRecommendations.length,
        genjsCandidateScore: analysis.genjsCandidateScore,
      },
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(skillImprovementRuns.id, run.id))
    .returning();

  return {
    analysis,
    run: completedRun,
    recommendations: persistedRecommendations,
    snapshots: persistedSnapshots,
  };
}
