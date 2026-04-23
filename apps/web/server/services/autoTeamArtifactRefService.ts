import crypto from "crypto";
import {
  assertCanonicalArtifactRef,
  type AutoTeamArtifactRef,
  type AutoTeamArtifactType,
} from "../../shared/autoTeamExecution";
import { and, eq } from "drizzle-orm";
import { autoTeamArtifactRefs, type AutoTeamArtifactRefRow, type InsertAutoTeamArtifactRefRow } from "../../drizzle/schema";
import { getDb } from "../db";

export interface BuildAutoTeamArtifactRefInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  stageId?: string | null;
  workItemId?: string | null;
  artifactType: AutoTeamArtifactType;
  artifactRole: AutoTeamArtifactRef["artifactRole"];
  storageRef?: string | null;
  externalRef?: string | null;
  contentHash?: string | null;
  visibility?: AutoTeamArtifactRef["visibility"];
  retentionPolicyJson?: Record<string, unknown> | null;
  safetyStatus?: AutoTeamArtifactRef["safetyStatus"];
  source?: string | null;
  idempotencyKey?: string | null;
}

function now(): Date {
  return new Date();
}

function buildIdempotencyKey(input: BuildAutoTeamArtifactRefInput): string {
  return (
    input.idempotencyKey ??
    crypto
      .createHash("sha256")
      .update(
        [
          input.tenantId,
          input.runId ?? "",
          input.stageId ?? "",
          input.workItemId ?? "",
          input.artifactType,
          input.artifactRole,
          input.storageRef ?? "",
          input.externalRef ?? "",
          input.contentHash ?? "",
          input.source ?? "",
        ].join("|"),
      )
      .digest("hex")
  );
}

export async function buildCanonicalArtifactRef(
  input: BuildAutoTeamArtifactRefInput,
): Promise<AutoTeamArtifactRefRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey = buildIdempotencyKey(input);
  const conflict = await db
    .select()
    .from(autoTeamArtifactRefs)
    .where(
      and(
        eq(autoTeamArtifactRefs.tenantId, input.tenantId),
        eq(autoTeamArtifactRefs.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (conflict[0]) return conflict[0];

  const record: InsertAutoTeamArtifactRefRow = {
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId ?? null,
    stageId: input.stageId ?? null,
    workItemId: input.workItemId ?? null,
    artifactType: input.artifactType,
    artifactRole: input.artifactRole,
    storageRef: input.storageRef ?? null,
    externalRef: input.externalRef ?? null,
    contentHash: input.contentHash ?? null,
    visibility: input.visibility ?? "tenant",
    retentionPolicyJson: input.retentionPolicyJson ?? {},
    safetyStatus: input.safetyStatus ?? "unknown",
    source: input.source ?? null,
    idempotencyKey,
    createdAt: now(),
    updatedAt: now(),
  };

  const [inserted] = await db.insert(autoTeamArtifactRefs).values(record).returning();
  assertCanonicalArtifactRef({
    tenantId: inserted.tenantId,
    teamId: inserted.teamId,
    roomId: inserted.roomId,
    runId: inserted.runId,
    stageId: inserted.stageId,
    workItemId: inserted.workItemId,
    artifactType: inserted.artifactType as AutoTeamArtifactType,
    artifactRole: inserted.artifactRole as AutoTeamArtifactRef["artifactRole"],
    storageRef: inserted.storageRef,
    externalRef: inserted.externalRef,
    contentHash: inserted.contentHash,
    visibility: inserted.visibility as AutoTeamArtifactRef["visibility"],
    retentionPolicyJson: inserted.retentionPolicyJson as Record<string, unknown>,
    safetyStatus: inserted.safetyStatus as AutoTeamArtifactRef["safetyStatus"],
    source: inserted.source ?? null,
  });
  return inserted;
}

export function toArtifactRefProjection(
  artifact: AutoTeamArtifactRefRow,
  readable: boolean,
): Record<string, unknown> {
  return {
    id: artifact.id,
    tenantId: artifact.tenantId,
    teamId: artifact.teamId,
    roomId: artifact.roomId,
    runId: artifact.runId,
    stageId: artifact.stageId,
    workItemId: artifact.workItemId,
    artifactType: artifact.artifactType,
    artifactRole: artifact.artifactRole,
    visibility: artifact.visibility,
    safetyStatus: artifact.safetyStatus,
    contentHash: artifact.contentHash,
    retentionPolicyJson: artifact.retentionPolicyJson,
    source: artifact.source,
    storageRef: readable ? artifact.storageRef : null,
    externalRef: readable ? artifact.externalRef : null,
    redacted: !readable,
  };
}
