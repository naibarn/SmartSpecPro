import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  autoTeamExecutionStages,
  autoTeamFinalResults,
  autoTeamMediaJobRefs,
  autoTeamReviewRecords,
  type AutoTeamFinalResultRow,
  type AutoTeamRouteDecisionRow,
} from "../../drizzle/schema";
import { getRequiredEvidenceForRoute, type AutoTeamArtifactRef, type AutoTeamFinalResultStatus, type AutoTeamRouteClass } from "../../shared/autoTeamExecution";

export interface AutoTeamCompletionEvidenceInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  routeDecision: Pick<AutoTeamRouteDecisionRow, "id" | "routeClass" | "language">;
  artifactRefs?: AutoTeamArtifactRef[] | null;
  mediaJobRefs?: Array<{ id?: string; providerStatus: string; resultArtifactRefsJson?: string[] | null; stageId?: string | null }> | null;
  reviewRecords?: Array<{ id: string; passed: boolean; reviewType: string }> | null;
  humanApprovalStatus?: "not_required" | "pending" | "approved" | "rejected";
  finalCandidateStageId?: string | null;
}

export interface AutoTeamCompletionEvidenceResult {
  ok: boolean;
  routeClass: AutoTeamRouteClass;
  missingEvidence: string[];
  blockingStageIds: string[];
  userMessage: string;
  diagnostics: Record<string, unknown>;
}

function now(): Date {
  return new Date();
}

export function evaluateCompletionEvidence(
  input: AutoTeamCompletionEvidenceInput,
): AutoTeamCompletionEvidenceResult {
  const required = getRequiredEvidenceForRoute(input.routeDecision.routeClass);
  const artifactTypes = new Set((input.artifactRefs ?? []).map((artifact) => artifact.artifactType));
  const mediaJobs = input.mediaJobRefs ?? [];
  const reviewPassed = Boolean((input.reviewRecords ?? []).find((review) => review.passed));
  const humanApproved = input.humanApprovalStatus === "approved" || !required.requiresHumanApproval;

  const missingEvidence: string[] = [];
  if (required.requiresPromptArtifact && !artifactTypes.has("media_prompt") && !artifactTypes.has("storyboard")) {
    missingEvidence.push("prompt_artifact");
  }
  if (required.requiresMediaJob && mediaJobs.length === 0) {
    missingEvidence.push("media_job");
  }
  if (required.requiresAgencyHandle && mediaJobs.length === 0) {
    missingEvidence.push("agency_handle");
  }
  if (required.requiresReview && !reviewPassed) {
    missingEvidence.push("review");
  }
  if (required.requiresHumanApproval && !humanApproved) {
    missingEvidence.push("human_approval");
  }
  if (required.requiresFinalArtifact && (input.artifactRefs ?? []).length === 0) {
    missingEvidence.push("final_artifact");
  }

  const blockingStageIds = input.finalCandidateStageId ? [input.finalCandidateStageId] : [];
  const ok = missingEvidence.length === 0;

  return {
    ok,
    routeClass: input.routeDecision.routeClass,
    missingEvidence,
    blockingStageIds: ok ? [] : blockingStageIds,
    userMessage: ok
      ? "Completion evidence is sufficient."
      : `Missing required evidence: ${missingEvidence.join(", ")}`,
    diagnostics: {
      required,
      artifactCount: (input.artifactRefs ?? []).length,
      mediaJobCount: mediaJobs.length,
      reviewCount: (input.reviewRecords ?? []).length,
      humanApprovalStatus: input.humanApprovalStatus,
    },
  };
}

export function summarizeMissingEvidence(input: AutoTeamCompletionEvidenceResult): string {
  return input.missingEvidence.length > 0 ? input.missingEvidence.join(", ") : "none";
}

export async function assertCanCreateFinalResult(
  input: AutoTeamCompletionEvidenceInput,
): Promise<AutoTeamCompletionEvidenceResult> {
  const result = evaluateCompletionEvidence(input);
  if (!result.ok) {
    throw new Error(result.userMessage);
  }
  return result;
}

export async function createFinalResult(
  input: AutoTeamCompletionEvidenceInput & {
    summary?: string | null;
    idempotencyKey?: string | null;
    status?: AutoTeamFinalResultStatus;
  },
): Promise<AutoTeamFinalResultRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const evidence = await assertCanCreateFinalResult(input);
  const idempotencyKey =
    input.idempotencyKey ??
    crypto
      .createHash("sha256")
      .update([input.tenantId, input.runId, input.routeDecision.id ?? "", input.summary ?? "", evidence.ok ? "ok" : "blocked"].join("|"))
      .digest("hex");

  const [existing] = await db
    .select()
    .from(autoTeamFinalResults)
    .where(
      and(
        eq(autoTeamFinalResults.tenantId, input.tenantId),
        eq(autoTeamFinalResults.runId, input.runId),
        eq(autoTeamFinalResults.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db.insert(autoTeamFinalResults).values({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    routeDecisionId: input.routeDecision.id ?? null,
    status: input.status ?? "completed",
    finalArtifactRefsJson: (input.artifactRefs ?? []).map((artifact) => artifact.source ?? artifact.storageRef ?? artifact.externalRef ?? artifact.artifactType),
    mediaJobRefIdsJson: (input.mediaJobRefs ?? []).flatMap((job) => job.id ? [job.id] : []),
    reviewRecordRefIdsJson: (input.reviewRecords ?? []).map((review) => review.id),
    humanApprovalStatus: input.humanApprovalStatus ?? "not_required",
    summary: input.summary ?? null,
    failureReason: null,
    blockedReason: null,
    idempotencyKey,
    createdAt: now(),
    updatedAt: now(),
  }).returning();

  return inserted;
}

export async function createFailureFinalResult(
  input: AutoTeamCompletionEvidenceInput & {
    failureReason: string;
    blockedReason?: string | null;
    idempotencyKey?: string | null;
    summary?: string | null;
  },
): Promise<AutoTeamFinalResultRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey =
    input.idempotencyKey ??
    crypto
      .createHash("sha256")
      .update([input.tenantId, input.runId, input.routeDecision.id ?? "", input.failureReason].join("|"))
      .digest("hex");

  const [existing] = await db
    .select()
    .from(autoTeamFinalResults)
    .where(
      and(
        eq(autoTeamFinalResults.tenantId, input.tenantId),
        eq(autoTeamFinalResults.runId, input.runId),
        eq(autoTeamFinalResults.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db.insert(autoTeamFinalResults).values({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    routeDecisionId: input.routeDecision.id ?? null,
    status: "failed",
    finalArtifactRefsJson: [],
    mediaJobRefIdsJson: (input.mediaJobRefs ?? []).flatMap((job) => job.id ? [job.id] : []),
    reviewRecordRefIdsJson: (input.reviewRecords ?? []).map((review) => review.id),
    humanApprovalStatus: input.humanApprovalStatus ?? "not_required",
    summary: input.summary ?? null,
    failureReason: input.failureReason,
    blockedReason: input.blockedReason ?? null,
    idempotencyKey,
    createdAt: now(),
    updatedAt: now(),
  }).returning();

  return inserted;
}
