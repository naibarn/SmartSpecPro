import { and, asc, eq, inArray } from "drizzle-orm";

import { runnerNodes, runnerReleaseAssets, runnerUpdateCommands } from "../../drizzle/schema";
import { getDb } from "../db";
import { getRunnerReleaseAssetById } from "./runnerReleaseService";

const privilegedRunnerUpdateRoles = new Set(["admin", "domain_admin", "system_agent"]);

function normalizeRunnerPlatform(snapshot: Record<string, unknown> | null | undefined): {
  platform: "windows" | "macos" | "linux" | null;
  architecture: "x64" | "arm64" | null;
} {
  const platform = snapshot?.platform;
  if (!platform || typeof platform !== "object" || Array.isArray(platform)) {
    return { platform: null, architecture: null };
  }
  const raw = platform as Record<string, unknown>;
  const os = String(raw.os ?? "").toLowerCase();
  const architecture = String(raw.architecture ?? "").toLowerCase();
  return {
    platform: os === "windows" ? "windows" : os === "macos" || os === "darwin" ? "macos" : os === "linux" ? "linux" : null,
    architecture: architecture === "x86_64" || architecture === "amd64" ? "x64" : architecture === "aarch64" || architecture === "arm64" ? "arm64" : null,
  };
}

export const runnerUpdateStatuses = [
  "queued",
  "downloading",
  "verifying",
  "replacing",
  "restarting",
  "completed",
  "failed",
  "rolled_back",
] as const;
export type RunnerUpdateStatus = (typeof runnerUpdateStatuses)[number];

export class RunnerUpdateError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) {
    super(code);
    this.name = "RunnerUpdateError";
  }
}

function mapCommand(row: typeof runnerUpdateCommands.$inferSelect, release: Awaited<ReturnType<typeof getRunnerReleaseAssetById>> | null) {
  return {
    commandId: row.id,
    runnerId: row.runnerId,
    releaseAssetId: row.releaseAssetId,
    targetVersion: release?.version ?? null,
    downloadUrl: `/api/runners/${encodeURIComponent(row.runnerId)}/update-commands/${encodeURIComponent(row.id)}/download`,
    expectedSha256: release?.fileSha256 ?? null,
    signature: release?.signature ?? null,
    signatureAlgorithm: release?.provenance.signatureAlgorithm ?? null,
    status: row.status,
    phase: row.phase,
    idempotencyKey: row.idempotencyKey,
    error: row.errorCode ? { code: row.errorCode, message: row.errorMessage ?? row.errorCode } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function getCommandRow(commandId: string) {
  const db = getDb();
  const [row] = await db.select().from(runnerUpdateCommands).where(eq(runnerUpdateCommands.id, commandId)).limit(1);
  return row ?? null;
}

export async function requestRunnerUpdate(input: {
  tenantId: string;
  runnerId: string;
  releaseAssetId: number;
  idempotencyKey: string;
  requestedBy: number;
  requesterRole?: string | null;
}) {
  const db = getDb();
  const [runner] = await db.select({
    runnerId: runnerNodes.runnerId,
    tenantId: runnerNodes.tenantId,
    ownerUserId: runnerNodes.ownerUserId,
    profile: runnerNodes.profile,
    currentSnapshotJson: runnerNodes.currentSnapshotJson,
    revokedAt: runnerNodes.revokedAt,
  })
    .from(runnerNodes)
    .where(and(eq(runnerNodes.runnerId, input.runnerId), eq(runnerNodes.tenantId, input.tenantId)))
    .limit(1);
  if (!runner || runner.revokedAt) throw new RunnerUpdateError("runner_update_runner_not_available", 404);
  if (!privilegedRunnerUpdateRoles.has(input.requesterRole ?? "") && runner.ownerUserId !== input.requestedBy) {
    throw new RunnerUpdateError("runner_update_forbidden", 403);
  }
  const release = await getRunnerReleaseAssetById(input.releaseAssetId);
  if (!release || release.assetKind !== "update_binary" || !release.isPublished || release.withdrawnAt) {
    throw new RunnerUpdateError("runner_update_release_not_available", 409);
  }
  if (release.profile !== "local_device" || runner.profile !== "local_device") {
    throw new RunnerUpdateError("runner_update_release_incompatible", 409);
  }
  const runnerPlatform = normalizeRunnerPlatform(runner.currentSnapshotJson);
  if ((runnerPlatform.platform && runnerPlatform.platform !== release.platform) ||
      (runnerPlatform.architecture && runnerPlatform.architecture !== release.architecture)) {
    throw new RunnerUpdateError("runner_update_release_incompatible", 409);
  }
  const [existing] = await db.select().from(runnerUpdateCommands).where(and(
    eq(runnerUpdateCommands.tenantId, input.tenantId),
    eq(runnerUpdateCommands.runnerId, input.runnerId),
    eq(runnerUpdateCommands.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (existing) return mapCommand(existing, release);
  try {
    const [row] = await db.insert(runnerUpdateCommands).values({
      tenantId: input.tenantId,
      runnerId: input.runnerId,
      releaseAssetId: input.releaseAssetId,
      idempotencyKey: input.idempotencyKey,
      requestedBy: input.requestedBy,
      status: "queued",
      phase: "queued",
    }).returning();
    return mapCommand(row, release);
  } catch (error) {
    if (/unique|duplicate/i.test(error instanceof Error ? error.message : String(error))) {
      const [retry] = await db.select().from(runnerUpdateCommands).where(and(
        eq(runnerUpdateCommands.tenantId, input.tenantId),
        eq(runnerUpdateCommands.runnerId, input.runnerId),
        eq(runnerUpdateCommands.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (retry) return mapCommand(retry, release);
    }
    throw error;
  }
}

export async function getRunnerUpdateStatus(input: { tenantId: string; runnerId: string; commandId: string; requestedBy?: number; requesterRole?: string | null }) {
  if (input.requestedBy !== undefined) {
    const db = getDb();
    const [runner] = await db.select({ ownerUserId: runnerNodes.ownerUserId }).from(runnerNodes).where(and(
      eq(runnerNodes.runnerId, input.runnerId),
      eq(runnerNodes.tenantId, input.tenantId),
    )).limit(1);
    if (!runner || (!privilegedRunnerUpdateRoles.has(input.requesterRole ?? "") && runner.ownerUserId !== input.requestedBy)) {
      throw new RunnerUpdateError("runner_update_forbidden", 403);
    }
  }
  const row = await getCommandRow(input.commandId);
  if (!row || row.tenantId !== input.tenantId || row.runnerId !== input.runnerId) {
    throw new RunnerUpdateError("runner_update_not_found", 404);
  }
  return mapCommand(row, await getRunnerReleaseAssetById(row.releaseAssetId, true));
}

export async function claimNextRunnerUpdate(input: { runnerId: string; tenantId: string }) {
  const db = getDb();
  const [row] = await db.select().from(runnerUpdateCommands).where(and(
    eq(runnerUpdateCommands.runnerId, input.runnerId),
    eq(runnerUpdateCommands.tenantId, input.tenantId),
    inArray(runnerUpdateCommands.status, ["queued"]),
  )).orderBy(asc(runnerUpdateCommands.createdAt)).limit(1);
  if (!row) return null;
  const [claimed] = await db.update(runnerUpdateCommands).set({
    status: "downloading",
    phase: "downloading",
    updatedAt: new Date(),
  }).where(and(eq(runnerUpdateCommands.id, row.id), eq(runnerUpdateCommands.status, "queued"))).returning();
  if (!claimed) return null;
  return mapCommand(claimed, await getRunnerReleaseAssetById(claimed.releaseAssetId));
}

export async function acknowledgeRunnerUpdate(input: {
  runnerId: string;
  commandId: string;
  status: RunnerUpdateStatus;
  phase?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const row = await getCommandRow(input.commandId);
  if (!row || row.runnerId !== input.runnerId) throw new RunnerUpdateError("runner_update_not_found", 404);
  const terminal = ["completed", "failed", "rolled_back"].includes(input.status);
  const allowed = new Set(["downloading", "verifying", "replacing", "restarting", "completed", "failed", "rolled_back"]);
  if (!allowed.has(input.status)) throw new RunnerUpdateError("runner_update_transition_invalid", 409);
  if (row.status === input.status) {
    return mapCommand(row, await getRunnerReleaseAssetById(row.releaseAssetId, true));
  }
  if (row.status === "completed" || row.status === "failed" || row.status === "rolled_back") {
    if (row.status === input.status) return mapCommand(row, await getRunnerReleaseAssetById(row.releaseAssetId, true));
    throw new RunnerUpdateError("runner_update_transition_invalid", 409);
  }
  const transitions: Record<string, string[]> = {
    queued: ["downloading", "failed"],
    downloading: ["verifying", "failed"],
    verifying: ["replacing", "failed"],
    replacing: ["restarting", "failed", "rolled_back"],
    restarting: ["completed", "failed", "rolled_back"],
  };
  if (!transitions[row.status]?.includes(input.status)) {
    throw new RunnerUpdateError("runner_update_transition_invalid", 409);
  }
  const db = getDb();
  const [updated] = await db.update(runnerUpdateCommands).set({
    status: input.status,
    phase: input.phase ?? input.status,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    completedAt: terminal ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(runnerUpdateCommands.id, input.commandId), eq(runnerUpdateCommands.runnerId, input.runnerId))).returning();
  return mapCommand(updated, await getRunnerReleaseAssetById(updated.releaseAssetId, true));
}
