import { promises as fs } from "node:fs";
import { Queue, Worker } from "bullmq";
import { getRealtimeClient } from "../services/redisClients";
import {
  DATABASE_BACKUP_QUEUE_NAME,
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

type DatabaseBackupJobData = {
  backupJobId: string;
  mode: DatabaseBackupMode;
};

let queue: Queue<DatabaseBackupJobData> | null = null;
let worker: Worker<DatabaseBackupJobData> | null = null;
let workerFailure: string | null = null;

function ensureQueue(): Queue<DatabaseBackupJobData> {
  if (queue) return queue;
  const redis = getRealtimeClient();
  queue = new Queue<DatabaseBackupJobData>(DATABASE_BACKUP_QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
}

export async function enqueueDatabaseBackup(
  input: DatabaseBackupJobData
): Promise<void> {
  if (!worker) {
    throw new Error("Backup worker is unavailable");
  }
  if (workerFailure) {
    throw new Error(`Backup worker is unavailable: ${workerFailure}`);
  }
  try {
    await worker.waitUntilReady();
  } catch (error) {
    throw new Error(
      `Backup worker is unavailable: ${
        error instanceof Error ? error.message : "Redis connection failed"
      }`
    );
  }
  await ensureQueue().add("create-database-backup", input);
}

async function runDatabaseBackupJob(
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
  if (worker) return;
  workerFailure = null;
  await reconcileStaleDatabaseBackupJobs();
  await cleanupExpiredDatabaseBackups();
  const redis = getRealtimeClient();
  const backupQueue = ensureQueue();
  await backupQueue.upsertJobScheduler(
    "database-backup-retention",
    { pattern: "*/15 * * * *" },
    {
      name: "database-backup-retention",
      data: { backupJobId: "retention", mode: "safe" },
    }
  );
  worker = new Worker<DatabaseBackupJobData>(
    DATABASE_BACKUP_QUEUE_NAME,
    async job => {
      if (job.name === "database-backup-retention") {
        await cleanupExpiredDatabaseBackups();
        return;
      }
      await runDatabaseBackupJob(job.data);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("ready", () => {
    workerFailure = null;
    console.info("[DatabaseBackup] worker ready");
  });
  worker.on("error", error => {
    workerFailure = error instanceof Error ? error.message : "Worker error";
    console.error("[DatabaseBackup] worker error:", error);
  });
  try {
    await worker.waitUntilReady();
  } catch (error) {
    workerFailure =
      error instanceof Error ? error.message : "Redis connection failed";
    await worker.close().catch(() => undefined);
    worker = null;
    throw error;
  }
}

export async function shutdownDatabaseBackupJob(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  workerFailure = null;
  if (queue) {
    await queue.close();
    queue = null;
  }
}
