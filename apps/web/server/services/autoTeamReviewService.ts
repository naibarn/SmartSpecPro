import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  assistantProfiles,
  autoTeamExecutionStages,
  autoTeamReviewRecords,
  type AutoTeamReviewRecordRow,
  type InsertAutoTeamReviewRecordRow,
  type AutoTeamRouteDecisionRow,
  type AutoTeamExecutionStageRow,
  type AutoTeamArtifactRefRow,
  type AutoTeamMediaJobRefRow,
} from "../../drizzle/schema";

export interface AutoTeamReviewInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  stageId?: string | null;
  workItemId?: string | null;
  routeDecision: Pick<AutoTeamRouteDecisionRow, "routeClass" | "language" | "selectedOrchestratorPersonaId">;
  completedStages?: AutoTeamExecutionStageRow[] | null;
  artifactRefs?: AutoTeamArtifactRefRow[] | null;
  mediaJobRefs?: AutoTeamMediaJobRefRow[] | null;
  objective?: string | null;
  language?: "en" | "th" | null;
  priorRepairAttempts?: number | null;
  reviewerPersonaId?: string | null;
  reviewType?: string;
  passThreshold?: number;
  finalCandidateResult?: {
    summary?: string | null;
    blockedReason?: string | null;
  } | null;
}

export interface AutoTeamReviewResult {
  reviewerPersonaId: string | null;
  reviewType: string;
  score: number;
  passThreshold: number;
  passed: boolean;
  comments: string | null;
  repairInstructions: string | null;
  reviewedArtifactRefsJson: string[];
  reviewedJobRefIdsJson: string[];
}

function now(): Date {
  return new Date();
}

function scoreEvidence(input: AutoTeamReviewInput): number {
  const routeClass = input.routeDecision.routeClass;
  const artifactCount = input.artifactRefs?.length ?? 0;
  const jobCount = input.mediaJobRefs?.length ?? 0;
  const stageCount = input.completedStages?.length ?? 0;
  const repairPenalty = Math.min(0.25, (input.priorRepairAttempts ?? 0) * 0.08);
  const hasBlockedReason = Boolean(input.finalCandidateResult?.blockedReason);

  let score = 0.35 + Math.min(0.25, artifactCount * 0.08) + Math.min(0.2, jobCount * 0.08) + Math.min(0.1, stageCount * 0.02);
  if (routeClass === "media.video" || routeClass === "media.image") {
    score += jobCount > 0 ? 0.15 : -0.15;
    score += artifactCount >= 2 ? 0.1 : 0;
  } else if (routeClass === "agency.swarm") {
    score += artifactCount > 0 ? 0.15 : 0;
  } else {
    score += artifactCount > 0 ? 0.08 : 0;
  }
  if (hasBlockedReason) score -= 0.2;
  return Math.max(0, Math.min(1, score - repairPenalty));
}

export function selectReviewerPersona(
  input: AutoTeamReviewInput & { teamPersonas?: Array<{ id: string; isLead?: boolean | null; memberRole?: string | null; displayName?: string | null }> | null },
): string | null {
  if (input.reviewerPersonaId) return input.reviewerPersonaId;
  const personas = input.teamPersonas ?? [];
  const preferred = personas.find((persona) =>
    Boolean(persona.isLead) ||
    /review|qa|publisher/i.test(persona.memberRole ?? "") ||
    /review|qa|publisher/i.test(persona.displayName ?? ""),
  );
  return preferred?.id ?? input.routeDecision.selectedOrchestratorPersonaId ?? null;
}

export function buildReviewPrompt(input: AutoTeamReviewInput): string {
  const artifactSummary = (input.artifactRefs ?? [])
    .map((artifact) => `- ${artifact.artifactType}/${artifact.artifactRole}: ${artifact.safetyStatus}`)
    .join("\n");
  const jobSummary = (input.mediaJobRefs ?? [])
    .map((job) => `- ${job.mediaType}:${job.provider}/${job.model} ${job.providerStatus}`)
    .join("\n");
  return [
    `Route: ${input.routeDecision.routeClass}`,
    `Language: ${input.language ?? input.routeDecision.language}`,
    `Objective: ${input.objective ?? ""}`.trim(),
    artifactSummary ? `Artifacts:\n${artifactSummary}` : null,
    jobSummary ? `Media jobs:\n${jobSummary}` : null,
    input.finalCandidateResult?.summary ? `Candidate result: ${input.finalCandidateResult.summary}` : null,
    input.finalCandidateResult?.blockedReason ? `Blocked reason: ${input.finalCandidateResult.blockedReason}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runAutomaticReview(
  input: AutoTeamReviewInput,
): Promise<AutoTeamReviewResult> {
  const score = scoreEvidence(input);
  const passThreshold = input.passThreshold ?? (input.routeDecision.routeClass === "media.video" || input.routeDecision.routeClass === "media.image" ? 0.75 : 0.6);
  const passed = score >= passThreshold && !(input.finalCandidateResult?.blockedReason);
  const reviewerPersonaId = input.reviewerPersonaId ?? input.routeDecision.selectedOrchestratorPersonaId ?? null;
  const reviewedArtifactRefsJson = (input.artifactRefs ?? []).map((artifact) => artifact.id).filter((value): value is string => Boolean(value));
  const reviewedJobRefIdsJson = (input.mediaJobRefs ?? []).map((job) => job.id).filter((value): value is string => Boolean(value));

  return {
    reviewerPersonaId,
    reviewType: input.reviewType ?? "auto_team_final_review",
    score,
    passThreshold,
    passed,
    comments: passed
      ? "Evidence is sufficient to pass this route."
      : "Evidence is incomplete or below the pass threshold.",
    repairInstructions: passed
      ? null
      : "Use the reviewer comments and missing evidence to repair the route before finalization.",
    reviewedArtifactRefsJson,
    reviewedJobRefIdsJson,
  };
}

export async function persistReviewRecord(
  input: AutoTeamReviewInput & { result: AutoTeamReviewResult; idempotencyKey?: string | null },
): Promise<AutoTeamReviewRecordRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey =
    input.idempotencyKey ??
    crypto
      .createHash("sha256")
      .update(
        [
          input.tenantId,
          input.runId,
          input.stageId ?? "",
          input.reviewType ?? "auto_team_final_review",
          input.result.reviewerPersonaId ?? "",
          input.result.score.toFixed(4),
          input.result.passThreshold.toFixed(4),
        ].join("|"),
      )
      .digest("hex");

  const [existing] = await db
    .select()
    .from(autoTeamReviewRecords)
    .where(
      and(
        eq(autoTeamReviewRecords.tenantId, input.tenantId),
        eq(autoTeamReviewRecords.runId, input.runId),
        eq(autoTeamReviewRecords.reviewType, input.reviewType ?? "auto_team_final_review"),
        eq(autoTeamReviewRecords.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const payload: InsertAutoTeamReviewRecordRow = {
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    stageId: input.stageId ?? null,
    workItemId: input.workItemId ?? null,
    reviewerPersonaId: input.result.reviewerPersonaId,
    reviewType: input.reviewType ?? "auto_team_final_review",
    score: input.result.score,
    passThreshold: input.result.passThreshold,
    passed: input.result.passed,
    reviewedArtifactRefsJson: input.result.reviewedArtifactRefsJson,
    reviewedJobRefIdsJson: input.result.reviewedJobRefIdsJson,
    comments: input.result.comments,
    repairInstructions: input.result.repairInstructions,
    idempotencyKey,
    createdAt: now(),
  };

  const [inserted] = await db.insert(autoTeamReviewRecords).values(payload).returning();
  return inserted;
}

export async function createRepairStageFromReview(
  input: AutoTeamReviewInput & { result: AutoTeamReviewResult },
): Promise<AutoTeamExecutionStageRow | null> {
  if (input.result.passed) return null;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [stage] = await db
    .insert(autoTeamExecutionStages)
    .values({
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      roomId: input.roomId ?? null,
      runId: input.runId,
      routeDecisionId: null,
      workItemId: input.workItemId ?? null,
      planStepKey: `repair:${input.stageId ?? "review"}`,
      stageType: "repair",
      status: "queued",
      expectedCapabilityFamily: null,
      selectedSkillId: null,
      selectedProvider: null,
      inputArtifactRefsJson: input.artifactRefs?.map((artifact) => artifact.id).filter((value): value is string => Boolean(value)) ?? [],
      outputArtifactRefsJson: [],
      jobRefIdsJson: input.mediaJobRefs?.map((job) => job.id).filter((value): value is string => Boolean(value)) ?? [],
      attempt: (input.priorRepairAttempts ?? 0) + 1,
      maxAttempts: 3,
      blockedReason: input.result.comments ?? null,
      errorCode: "review_repair_required",
      errorMessage: input.result.repairInstructions ?? null,
      idempotencyKey: crypto.createHash("sha256").update([input.tenantId, input.runId, input.stageId ?? "", input.result.comments ?? ""].join("|")).digest("hex"),
      metadataJson: {
        reviewRecord: input.result,
        reviewerPersonaId: input.result.reviewerPersonaId,
      },
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();

  return stage ?? null;
}

export function isReviewPassing(result: AutoTeamReviewResult): boolean {
  return result.passed;
}
