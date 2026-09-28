import { promises as fs } from "node:fs";
import {
  type DatabaseBackupMode,
} from "../services/databaseBackupContracts";
import {
  cleanupExpiredDatabaseBackups,
  getDatabaseBackupJob,
  getDatabaseBackupJobDirectory,
  markDatabaseBackupCompleted,
  markDatabaseBackupFailed,
  markDatabaseBackupRunning,
  DATABASE_BACKUP_STALE_RUNNING_MS,
  reconcileStaleDatabaseBackupJobs,
} from "../services/databaseBackupService";
import { createDatabaseBackupArtifacts } from "../services/databaseBackupExportService";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { startFeature186SystemSchedule, stopFeature186SystemSchedule, utcMinuteOccurrence } from "./feature186SystemScheduler";

type DatabaseBackupJobData = {
  backupJobId: string;
  mode: DatabaseBackupMode;
  tenantId?: string;
  requestedByUserId?: number;
};

export async function enqueueDatabaseBackup(
  input: DatabaseBackupJobData
): Promise<void> {
  if (!input.tenantId) throw new Error("Backup control-plane tenant is required");
  await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "admin",
        actorId: input.requestedByUserId,
        authorizationScope: "admin:database-backup",
        correlationId: `database-backup:${input.backupJobId}`,
        idempotencyKey: `database-backup:${input.tenantId}:${input.backupJobId}`,
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "database.backup",
        executionClass: "long",
        input: { backupJobId: input.backupJobId, mode: input.mode },
        retryPolicy: { maxAttempts: 2, baseDelayMs: 5000, maxDelayMs: 120000, jitter: "bounded", deadlineMs: 8 * 60 * 60 * 1000, allowedErrorClasses: ["retryable", "timeout", "unavailable"] },
        timeoutPolicy: { softTimeoutMs: 30 * 60_000, hardTimeoutMs: 2 * 60 * 60_000 },
      },
  });
}

export async function runDatabaseBackupJob(
  data: DatabaseBackupJobData
): Promise<void> {
  const row = await getDatabaseBackupJob(data.backupJobId);
  if (!row) return;
  if (row.status === "running") {
    const startedAt = row.startedAt?.getTime() ?? 0;
    if (Date.now() - startedAt >= DATABASE_BACKUP_STALE_RUNNING_MS) {
      await markDatabaseBackupFailed(
        data.backupJobId,
        "Backup worker restarted after the previous attempt became stale"
      );
    }
    return;
  }
  if (row.status !== "queued") return;
  await markDatabaseBackupRunning(data.backupJobId);
  try {
    const artifacts = await createDatabaseBackupArtifacts({
      jobId: data.backupJobId,
      mode: data.mode,
    });
    await markDatabaseBackupCompleted({ id: data.backupJobId, ...artifacts });
  } catch (error) {
    await markDatabaseBackupFailed(
      data.backupJobId,
      error instanceof Error ? error.message : "Database backup failed"
    );
    try {
      await fs.rm(getDatabaseBackupJobDirectory(data.backupJobId), {
        recursive: true,
        force: true,
      });
    } catch {
      // The job is already failed; cleanup is best-effort and scoped to this job directory.
    }
    throw error;
  }
}

export async function initializeDatabaseBackupJob(): Promise<void> {
  startFeature186SystemSchedule({
      scheduleId: "database-backup-maintenance",
      jobType: "database.backup.maintenance",
      executionClass: "short",
      scheduleVersion: "1",
      timezone: "UTC",
      missedOccurrencePolicy: "coalesce",
      isDue: now => now.getUTCMinutes() % 15 === 0,
      occurrenceKey: now => utcMinuteOccurrence(now, 15),
      intervalMs: 60_000,
  });
  console.info("[DatabaseBackup] canonical maintenance schedule active");
}

export async function shutdownDatabaseBackupJob(): Promise<void> {
  stopFeature186SystemSchedule("database-backup-maintenance");
}
