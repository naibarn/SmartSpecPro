import { and, count, desc, eq, inArray, isNotNull, lt, isNull } from "drizzle-orm";

import { getDb } from "../db";
import {
  assistantProfiles,
  workerArtifacts,
  workerHeartbeats,
  workerJobEvents,
  workerJobs,
  workers,
} from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";
import {
  sanitizeWorkerPayload,
  sanitizeWorkerWarningFlags,
} from "./workerPayloadSanitizer";

type WorkerRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;

const STALE_WORKER_THRESHOLD_MS = 10 * 60 * 1000;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled", "expired"]);
const RECLAIMABLE_JOB_STATUSES = [
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
] as const;

export type WorkerFleetAction = "disable" | "drain" | "resume" | "revoke";

export interface WorkerFleetSummary {
  id: string;
  displayName: string;
  runtimeType: string;
  runtimeVersion: string;
  status: string;
  teamId: string | null;
  externalReference: string;
  lastSeenAt: Date | null;
  healthState: "healthy" | "stale" | "failed" | "disabled" | "draining" | "unknown";
  warningFlagsJson: string[];
  boundProfileCount: number;
  activeJobCount: number;
  diagnosticsAvailable: boolean;
  dashboardUrl: string | null;
  revokedAt: string | null;
}

export interface WorkerDiagnosticsSnapshot {
  workerId: string;
  displayName: string;
  runtimeType: string;
  status: string;
  capturedAt: string | null;
  summaryJson: Record<string, unknown>;
  detailsJson: Record<string, unknown>;
  warningFlagsJson: string[];
  dashboardUrl: string | null;
  revokedAt: string | null;
}

export interface WorkerRetentionCleanupResult {
  deletedHeartbeats: number;
  deletedJobEvents: number;
  deletedUnpublishedArtifacts: number;
  expiredJobs: number;
}

export interface WorkerLegacyRedactionResult {
  tenantId: string;
  scannedWorkers: number;
  updatedWorkers: number;
  scannedArtifacts: number;
  updatedArtifacts: number;
}

interface WorkerFleetRepository {
  cleanupHeartbeatsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  cleanupJobEventsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  cleanupUnpublishedArtifactsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  expireStaleJobsBefore: (tenantId: string, cutoff: Date) => Promise<number>;
  getWorkerById: (tenantId: string, workerId: string) => Promise<WorkerRecord | null>;
  listArtifactsByTenant: (tenantId: string) => Promise<WorkerArtifactRecord[]>;
  listActiveJobCounts: (tenantId: string) => Promise<Array<{ workerId: string | null; activeJobCount: number }>>;
  listBindingCounts: (tenantId: string) => Promise<Array<{ workerId: string | null; boundProfileCount: number }>>;
  listWorkersByTenant: (tenantId: string) => Promise<WorkerRecord[]>;
  updateArtifact: (artifactId: string, values: Record<string, unknown>) => Promise<WorkerArtifactRecord>;
  updateWorker: (workerId: string, values: Record<string, unknown>) => Promise<WorkerRecord>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeDashboardUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function readRevokedAt(worker: WorkerRecord): string | null {
  if (!isPlainObject(worker.healthSummaryJson)) {
    return null;
  }
  const controlPlane = worker.healthSummaryJson.controlPlane;
  if (!isPlainObject(controlPlane)) {
    return null;
  }
  return typeof controlPlane.revokedAt === "string" && controlPlane.revokedAt.trim()
    ? controlPlane.revokedAt
    : null;
}

function deriveHealthState(worker: WorkerRecord): WorkerFleetSummary["healthState"] {
  if (worker.status === "disabled") return "disabled";
  if (worker.status === "draining") return "draining";
  if (worker.status === "offline" || worker.status === "unhealthy") return "failed";
  if (!worker.lastSeenAt) return "unknown";
  const ageMs = Date.now() - new Date(worker.lastSeenAt).getTime();
  if (ageMs > STALE_WORKER_THRESHOLD_MS) return "stale";
  return "healthy";
}

function readAffectedRowCount(result: unknown): number {
  if (typeof result === "object" && result && "rowCount" in result) {
    const rowCount = (result as { rowCount?: unknown }).rowCount;
    return typeof rowCount === "number" ? rowCount : 0;
  }
  return 0;
}

const defaultRepo: WorkerFleetRepository = {
  async cleanupHeartbeatsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantWorkers = await db
      .select({ workerId: workers.id })
      .from(workers)
      .where(eq(workers.tenantId, tenantId));
    const workerIds = tenantWorkers.map((row) => row.workerId);
    if (!workerIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerHeartbeats)
      .where(and(inArray(workerHeartbeats.workerId, workerIds), lt(workerHeartbeats.createdAt, cutoff)));
    return readAffectedRowCount(deleted);
  },
  async cleanupJobEventsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantJobs = await db
      .select({ jobId: workerJobs.id })
      .from(workerJobs)
      .where(eq(workerJobs.tenantId, tenantId));
    const jobIds = tenantJobs.map((row) => row.jobId);
    if (!jobIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerJobEvents)
      .where(and(inArray(workerJobEvents.workerJobId, jobIds), lt(workerJobEvents.createdAt, cutoff)));
    return readAffectedRowCount(deleted);
  },
  async cleanupUnpublishedArtifactsBefore(tenantId, cutoff) {
    const db = await getDb();
    const tenantJobs = await db
      .select({ jobId: workerJobs.id })
      .from(workerJobs)
      .where(eq(workerJobs.tenantId, tenantId));
    const jobIds = tenantJobs.map((row) => row.jobId);
    if (!jobIds.length) {
      return 0;
    }

    const deleted = await db
      .delete(workerArtifacts)
      .where(
        and(
          inArray(workerArtifacts.workerJobId, jobIds),
          isNull(workerArtifacts.publishedItemId),
          lt(workerArtifacts.createdAt, cutoff),
        ),
      );
    return readAffectedRowCount(deleted);
  },
  async expireStaleJobsBefore(tenantId, cutoff) {
    const db = await getDb();
    const updated = await db
      .update(workerJobs)
      .set({
        status: "expired",
        statusReason: "Worker lease expired during retention cleanup",
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          inArray(workerJobs.status, [...RECLAIMABLE_JOB_STATUSES]),
          lt(workerJobs.leaseExpiresAt, cutoff),
          isNull(workerJobs.finishedAt),
        ),
      );
    return readAffectedRowCount(updated);
  },
  async getWorkerById(tenantId, workerId) {
    const db = await getDb();
    const [worker] = await db
      .select()
      .from(workers)
      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
      .limit(1);
    return worker ?? null;
  },
  async listArtifactsByTenant(tenantId) {
    const db = await getDb();
    return db
      .select({
        id: workerArtifacts.id,
        workerJobId: workerArtifacts.workerJobId,
        artifactType: workerArtifacts.artifactType,
        storageRef: workerArtifacts.storageRef,
        metadataJson: workerArtifacts.metadataJson,
        publishedItemId: workerArtifacts.publishedItemId,
        createdAt: workerArtifacts.createdAt,
      })
      .from(workerArtifacts)
      .innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId))
      .where(eq(workerJobs.tenantId, tenantId));
  },
  async listActiveJobCounts(tenantId) {
    const db = await getDb();
    return db
      .select({
        workerId: workerJobs.workerId,
        activeJobCount: count(),
      })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          inArray(workerJobs.status, ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"]),
        ),
      )
      .groupBy(workerJobs.workerId);
  },
  async listBindingCounts(tenantId) {
    const db = await getDb();
    return db
      .select({
        workerId: assistantProfiles.externalWorkerId,
        boundProfileCount: count(),
      })
      .from(assistantProfiles)
      .where(
        and(
          eq(assistantProfiles.tenantId, tenantId),
          eq(assistantProfiles.memberKind, "external_connector"),
          isNotNull(assistantProfiles.externalWorkerId),
        ),
      )
      .groupBy(assistantProfiles.externalWorkerId);
  },
  async listWorkersByTenant(tenantId) {
    const db = await getDb();
    return db
      .select()
      .from(workers)
      .where(eq(workers.tenantId, tenantId))
      .orderBy(desc(workers.lastSeenAt), workers.displayName);
  },
  async updateWorker(workerId, values) {
    const db = await getDb();
    const [worker] = await db
      .update(workers)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(workers.id, workerId))
      .returning();
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    return worker;
  },
  async updateArtifact(artifactId, values) {
    const db = await getDb();
    const [artifact] = await db
      .update(workerArtifacts)
      .set(values)
      .where(eq(workerArtifacts.id, artifactId))
      .returning();
    if (!artifact) {
      throw new Error(`Worker artifact ${artifactId} not found`);
    }
    return artifact;
  },
};

export function getWorkerFleetDefaultRepository(): WorkerFleetRepository {
  return defaultRepo;
}

export async function listWorkerFleet(
  tenantId: string,
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerFleetSummary[]> {
  const repo = deps.repo ?? defaultRepo;
  const [workerRows, bindingCounts, activeJobCounts] = await Promise.all([
    repo.listWorkersByTenant(tenantId),
    repo.listBindingCounts(tenantId),
    repo.listActiveJobCounts(tenantId),
  ]);

  const bindingMap = new Map(
    bindingCounts
      .filter((row) => typeof row.workerId === "string" && row.workerId.length > 0)
      .map((row) => [row.workerId, Number(row.boundProfileCount ?? 0)]),
  );
  const activeJobMap = new Map(
    activeJobCounts
      .filter((row) => typeof row.workerId === "string" && row.workerId.length > 0)
      .map((row) => [row.workerId, Number(row.activeJobCount ?? 0)]),
  );

  return workerRows.map((worker) => ({
    id: worker.id,
    displayName: worker.displayName,
    runtimeType: worker.runtimeType,
    runtimeVersion: worker.runtimeVersion,
    status: worker.status,
    teamId: worker.teamId ?? null,
    externalReference: worker.externalReference,
    lastSeenAt: worker.lastSeenAt ?? null,
    healthState: deriveHealthState(worker),
    warningFlagsJson: Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : [],
    boundProfileCount: bindingMap.get(worker.id) ?? 0,
    activeJobCount: activeJobMap.get(worker.id) ?? 0,
    diagnosticsAvailable: isPlainObject(worker.healthSummaryJson) && isPlainObject(worker.healthSummaryJson.details),
    dashboardUrl: sanitizeDashboardUrl(worker.dashboardUrl),
    revokedAt: readRevokedAt(worker),
  }));
}

export async function getWorkerDiagnosticsSnapshot(
  tenantId: string,
  workerId: string,
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerDiagnosticsSnapshot> {
  const repo = deps.repo ?? defaultRepo;
  const worker = await repo.getWorkerById(tenantId, workerId);
  if (!worker) {
    throw new Error(`Worker ${workerId} not found`);
  }

  const healthSummary = isPlainObject(worker.healthSummaryJson) ? worker.healthSummaryJson : {};

  return {
    workerId: worker.id,
    displayName: worker.displayName,
    runtimeType: worker.runtimeType,
    status: worker.status,
    capturedAt: typeof healthSummary.capturedAt === "string" ? healthSummary.capturedAt : null,
    summaryJson: sanitizeWorkerPayload(isPlainObject(healthSummary.summary) ? healthSummary.summary : {}) as Record<string, unknown>,
    detailsJson: sanitizeWorkerPayload(isPlainObject(healthSummary.details) ? healthSummary.details : {}) as Record<string, unknown>,
    warningFlagsJson: sanitizeWorkerWarningFlags(worker.warningFlagsJson),
    dashboardUrl: sanitizeDashboardUrl(worker.dashboardUrl),
    revokedAt: readRevokedAt(worker),
  };
}

export async function updateWorkerFleetState(
  input: {
    tenantId: string;
    workerId: string;
    action: WorkerFleetAction;
    actorUserId: number | null;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerRecord> {
  const repo = deps.repo ?? defaultRepo;
  const worker = await repo.getWorkerById(input.tenantId, input.workerId);
  if (!worker) {
    throw new Error(`Worker ${input.workerId} not found`);
  }

  const currentHealthSummary = isPlainObject(worker.healthSummaryJson) ? worker.healthSummaryJson : {};
  const currentControlPlane = isPlainObject(currentHealthSummary.controlPlane)
    ? currentHealthSummary.controlPlane
    : {};
  const nowIso = new Date().toISOString();

  if (input.action === "resume" && typeof currentControlPlane.revokedAt === "string" && currentControlPlane.revokedAt) {
    throw new Error("Revoked workers must be re-registered before they can resume");
  }

  const nextControlPlane = {
    ...currentControlPlane,
    lastActionAt: nowIso,
    lastActionByUserId: input.actorUserId ?? null,
    revokedAt:
      input.action === "revoke"
        ? nowIso
        : currentControlPlane.revokedAt ?? null,
    revokedByUserId:
      input.action === "revoke"
        ? input.actorUserId ?? null
        : currentControlPlane.revokedByUserId ?? null,
  };

  const nextStatus =
    input.action === "disable" || input.action === "revoke"
      ? "disabled"
      : input.action === "drain"
        ? "draining"
        : "online";

  const updatedWorker = await repo.updateWorker(worker.id, {
    status: nextStatus,
    healthSummaryJson: {
      ...currentHealthSummary,
      controlPlane: nextControlPlane,
    },
  });

  auditLogger.log({
    eventType: "worker_fleet_action",
    userId: input.actorUserId,
    metadata: {
      tenantId: input.tenantId,
      workerId: worker.id,
      runtimeType: worker.runtimeType,
      action: input.action,
      previousStatus: worker.status,
      nextStatus,
    },
  });

  return updatedWorker;
}

export async function cleanupWorkerFleetRetention(
  input: {
    tenantId: string;
    heartbeatRetentionDays?: number;
    jobEventRetentionDays?: number;
    unpublishedArtifactRetentionDays?: number;
    staleLeaseGraceHours?: number;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerRetentionCleanupResult> {
  const repo = deps.repo ?? defaultRepo;
  const heartbeatCutoff = new Date(Date.now() - (input.heartbeatRetentionDays ?? 30) * 24 * 60 * 60 * 1000);
  const jobEventCutoff = new Date(Date.now() - (input.jobEventRetentionDays ?? 30) * 24 * 60 * 60 * 1000);
  const artifactCutoff = new Date(Date.now() - (input.unpublishedArtifactRetentionDays ?? 7) * 24 * 60 * 60 * 1000);
  const staleLeaseCutoff = new Date(Date.now() - (input.staleLeaseGraceHours ?? 24) * 60 * 60 * 1000);

  const [deletedHeartbeats, deletedJobEvents, deletedUnpublishedArtifacts, expiredJobs] = await Promise.all([
    repo.cleanupHeartbeatsBefore(input.tenantId, heartbeatCutoff),
    repo.cleanupJobEventsBefore(input.tenantId, jobEventCutoff),
    repo.cleanupUnpublishedArtifactsBefore(input.tenantId, artifactCutoff),
    repo.expireStaleJobsBefore(input.tenantId, staleLeaseCutoff),
  ]);

  return {
    deletedHeartbeats,
    deletedJobEvents,
    deletedUnpublishedArtifacts,
    expiredJobs,
  };
}

export async function redactLegacyWorkerData(
  input: {
    tenantId: string;
    actorUserId: number | null;
  },
  deps: { repo?: WorkerFleetRepository } = {},
): Promise<WorkerLegacyRedactionResult> {
  const repo = deps.repo ?? defaultRepo;
  const [tenantWorkers, tenantArtifacts] = await Promise.all([
    repo.listWorkersByTenant(input.tenantId),
    repo.listArtifactsByTenant(input.tenantId),
  ]);

  let updatedWorkers = 0;
  let updatedArtifacts = 0;

  for (const worker of tenantWorkers) {
    const nextDashboardUrl = sanitizeDashboardUrl(worker.dashboardUrl);
    const nextCapabilitiesJson = sanitizeWorkerPayload(worker.capabilitiesJson ?? {}) as Record<string, unknown>;
    const nextHardwareJson = sanitizeWorkerPayload(worker.hardwareJson ?? {}) as Record<string, unknown>;
    const nextHealthSummaryJson = sanitizeWorkerPayload(worker.healthSummaryJson ?? {}) as Record<string, unknown>;
    const nextWarningFlagsJson = sanitizeWorkerWarningFlags(worker.warningFlagsJson);

    const hasWorkerChanges =
      JSON.stringify(worker.capabilitiesJson ?? {}) !== JSON.stringify(nextCapabilitiesJson)
      || JSON.stringify(worker.hardwareJson ?? {}) !== JSON.stringify(nextHardwareJson)
      || JSON.stringify(worker.healthSummaryJson ?? {}) !== JSON.stringify(nextHealthSummaryJson)
      || JSON.stringify(Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : []) !== JSON.stringify(nextWarningFlagsJson)
      || (worker.dashboardUrl ?? null) !== nextDashboardUrl;

    if (!hasWorkerChanges) {
      continue;
    }

    await repo.updateWorker(worker.id, {
      dashboardUrl: nextDashboardUrl,
      capabilitiesJson: nextCapabilitiesJson,
      hardwareJson: nextHardwareJson,
      healthSummaryJson: nextHealthSummaryJson,
      warningFlagsJson: nextWarningFlagsJson,
    });
    updatedWorkers += 1;
  }

  for (const artifact of tenantArtifacts) {
    const nextMetadataJson = sanitizeWorkerPayload(artifact.metadataJson ?? {}) as Record<string, unknown>;
    if (JSON.stringify(artifact.metadataJson ?? {}) === JSON.stringify(nextMetadataJson)) {
      continue;
    }

    await repo.updateArtifact(artifact.id, {
      metadataJson: nextMetadataJson,
    });
    updatedArtifacts += 1;
  }

  const result = {
    tenantId: input.tenantId,
    scannedWorkers: tenantWorkers.length,
    updatedWorkers,
    scannedArtifacts: tenantArtifacts.length,
    updatedArtifacts,
  } satisfies WorkerLegacyRedactionResult;

  auditLogger.log({
    eventType: "worker_legacy_data_redacted",
    userId: input.actorUserId,
    metadata: result,
  });

  return result;
}
