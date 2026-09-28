import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaStoryGenerationRuns,
  type InsertVerticalDramaStoryGenerationRunRow,
  type VerticalDramaStoryGenerationRunRow,
} from "../../drizzle/schema";
import type {
  StoryGenerationRunContract,
  StoryGenerationStage,
  StoryGenerationStatus,
  StoryValidationReport,
} from "./verticalDramaStoryGenerationContracts";

export interface CreateStoryGenerationRunInput {
  contract: StoryGenerationRunContract;
  runKey: string;
  sourceSnapshot: unknown;
}

export async function createStoryGenerationRun(
  input: CreateStoryGenerationRunInput,
): Promise<VerticalDramaStoryGenerationRunRow> {
  const { contract } = input;
  const values: InsertVerticalDramaStoryGenerationRunRow = {
    runId: contract.runId,
    tenantId: contract.tenantId,
    userId: contract.userId,
    seriesId: contract.seriesId,
    runKey: input.runKey,
    idempotencyKey: contract.idempotencyKey,
    taskKind: contract.taskKind,
    status: "queued",
    stage: "admission",
    contractVersion: contract.contractVersion,
    contractHash: contract.contractHash,
    sourceRevision: contract.sourceRevision,
    sourceFingerprint: contract.sourceFingerprint,
    sourceSnapshotJson: input.sourceSnapshot,
    contractJson: contract,
  };

  try {
    const [row] = (await db.insert(verticalDramaStoryGenerationRuns).values(values).returning()) as VerticalDramaStoryGenerationRunRow[];
    if (!row) throw new Error("Story generation run insert returned no row");
    return row;
  } catch (error) {
    const existing = await getStoryGenerationRunByIdempotency(
      contract.tenantId,
      contract.idempotencyKey,
    );
    if (existing) return existing;
    throw error;
  }
}

export async function getStoryGenerationRunByIdempotency(
  tenantId: string,
  idempotencyKey: string,
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .select()
    .from(verticalDramaStoryGenerationRuns)
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.idempotencyKey, idempotencyKey),
    ))
    .limit(1)) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function getStoryGenerationRun(
  tenantId: string,
  runId: string,
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .select()
    .from(verticalDramaStoryGenerationRuns)
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, runId),
    ))
    .limit(1)) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function getLatestStoryGenerationRun(
  tenantId: string,
  seriesId: number,
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .select()
    .from(verticalDramaStoryGenerationRuns)
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.seriesId, seriesId),
    ))
    .orderBy(desc(verticalDramaStoryGenerationRuns.createdAt))
    .limit(1)) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function updateStoryGenerationCheckpoint(
  tenantId: string,
  runId: string,
  patch: {
    status?: StoryGenerationStatus;
    stage?: StoryGenerationStage;
    checkpoint?: unknown;
    report?: StoryValidationReport | null;
    eventCursor?: number;
    activeAttemptId?: string | null;
    leaseOwner?: string | null;
    leaseExpiresAt?: Date | null;
    fenceToken?: number;
    expectedFenceToken?: number;
    errorCode?: string | null;
  },
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .update(verticalDramaStoryGenerationRuns)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.stage ? { stage: patch.stage } : {}),
      ...(patch.checkpoint !== undefined ? { checkpointJson: patch.checkpoint } : {}),
      ...(patch.report !== undefined ? { validationReportJson: patch.report } : {}),
      ...(patch.eventCursor !== undefined ? { eventCursor: patch.eventCursor } : {}),
      ...(patch.activeAttemptId !== undefined ? { activeAttemptId: patch.activeAttemptId } : {}),
      ...(patch.leaseOwner !== undefined ? { leaseOwner: patch.leaseOwner } : {}),
      ...(patch.leaseExpiresAt !== undefined ? { leaseExpiresAt: patch.leaseExpiresAt } : {}),
      ...(patch.fenceToken !== undefined ? { fenceToken: patch.fenceToken } : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, runId),
      ...(patch.expectedFenceToken === undefined
        ? []
        : [eq(verticalDramaStoryGenerationRuns.fenceToken, patch.expectedFenceToken)]),
    ))
    .returning()) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function claimStoryGenerationLease(input: {
  tenantId: string;
  runId: string;
  workerId: string;
  leaseMs?: number;
  now?: Date;
}): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const now = input.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 60_000));
  const [row] = (await db
    .update(verticalDramaStoryGenerationRuns)
    .set({
      leaseOwner: input.workerId,
      leaseExpiresAt,
      fenceToken: sql`${verticalDramaStoryGenerationRuns.fenceToken} + 1`,
      updatedAt: now,
    })
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, input.runId),
      or(isNull(verticalDramaStoryGenerationRuns.leaseExpiresAt), lte(verticalDramaStoryGenerationRuns.leaseExpiresAt, now)),
    ))
    .returning()) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function requestStoryGenerationCancellation(
  tenantId: string,
  runId: string,
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .update(verticalDramaStoryGenerationRuns)
    .set({ cancellationRequestedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, runId),
    ))
    .returning()) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}

export async function finalizeStoryGenerationRun(
  tenantId: string,
  runId: string,
  finalizationKey: string,
  finalArtifactId?: number | null,
  expectedFenceToken?: number,
): Promise<VerticalDramaStoryGenerationRunRow | null> {
  const [row] = (await db
    .update(verticalDramaStoryGenerationRuns)
    .set({
      status: "succeeded",
      stage: "finalization",
      finalizationKey,
      finalArtifactId: finalArtifactId ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(verticalDramaStoryGenerationRuns.tenantId, tenantId),
      eq(verticalDramaStoryGenerationRuns.runId, runId),
      ...(expectedFenceToken === undefined
        ? []
        : [eq(verticalDramaStoryGenerationRuns.fenceToken, expectedFenceToken)]),
    ))
    .returning()) as VerticalDramaStoryGenerationRunRow[];
  return row ?? null;
}
