import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { backupJobs, type BackupJobRow } from "../../drizzle/schema";
import {
  BACKUP_RETENTION_MS,
  DATABASE_BACKUP_MAX_LIST,
  type DatabaseBackupArtifact,
  type DatabaseBackupMode,
  type DatabaseBackupJobSummary,
  type DatabaseBackupStatus,
} from "./databaseBackupContracts";

const DEFAULT_BACKUP_ROOT = path.join(
  tmpdir(),
  "smartspecpro-database-backups"
);
export const DATABASE_BACKUP_STALE_RUNNING_MS = 15 * 60 * 1000;

export function getDatabaseBackupRoot(): string {
  return path.resolve(process.env.DATABASE_BACKUP_ROOT || DEFAULT_BACKUP_ROOT);
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function getDatabaseBackupJobDirectory(jobId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) {
    throw new Error("Invalid database backup job id");
  }
  const root = getDatabaseBackupRoot();
  const directory = path.resolve(root, jobId);
  if (!isWithinRoot(directory, root) || directory === root) {
    throw new Error("Invalid database backup job path");
  }
  return directory;
}

export async function ensureDatabaseBackupRoot(): Promise<string> {
  const root = getDatabaseBackupRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

function toDownloadUrl(
  jobId: string,
  artifact: DatabaseBackupArtifact
): string {
  return `/api/admin/database-backups/${encodeURIComponent(jobId)}/${artifact}/download`;
}

export function toDatabaseBackupSummary(
  row: BackupJobRow
): DatabaseBackupJobSummary {
  const completed = row.status === "completed";
  return {
    id: row.id,
    mode: row.mode as DatabaseBackupMode,
    status: row.status as DatabaseBackupStatus,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    expiresAt: row.expiresAt,
    errorMessage: row.errorMessage ?? null,
    databaseZipBytes: row.databaseZipBytes ?? null,
    applicationZipBytes: row.applicationZipBytes ?? null,
    databaseZipSha256: row.databaseZipSha256 ?? null,
    applicationZipSha256: row.applicationZipSha256 ?? null,
    databaseDownloadUrl:
      completed && row.databaseZipPath
        ? toDownloadUrl(row.id, "database")
        : null,
    applicationDownloadUrl:
      completed && row.applicationZipPath
        ? toDownloadUrl(row.id, "application")
        : null,
  };
}

export async function createDatabaseBackupJob(input: {
  createdByUserId: number;
  mode: DatabaseBackupMode;
}): Promise<DatabaseBackupJobSummary> {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date();
  const row = {
    id,
    createdByUserId: input.createdByUserId,
    mode: input.mode,
    status: "queued",
    expiresAt: new Date(now.getTime() + BACKUP_RETENTION_MS),
    createdAt: now,
    updatedAt: now,
  } satisfies typeof backupJobs.$inferInsert;
  const [created] = await db.insert(backupJobs).values(row).returning();
  if (!created) throw new Error("Failed to create database backup job");
  return toDatabaseBackupSummary(created);
}

export async function listDatabaseBackupJobs(
  limit = DATABASE_BACKUP_MAX_LIST
): Promise<DatabaseBackupJobSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(backupJobs)
    .orderBy(desc(backupJobs.createdAt))
    .limit(Math.min(Math.max(limit, 1), DATABASE_BACKUP_MAX_LIST));
  return rows.map(toDatabaseBackupSummary);
}

export async function getDatabaseBackupJob(
  id: string
): Promise<BackupJobRow | null> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.id, id))
    .limit(1);
  return row ?? null;
}

export async function markDatabaseBackupRunning(id: string): Promise<void> {
  const db = await getDb();
  await db
    .update(backupJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(and(eq(backupJobs.id, id), eq(backupJobs.status, "queued")));
}

export async function markDatabaseBackupCompleted(input: {
  id: string;
  databaseZipPath: string;
  databaseZipBytes: number;
  databaseZipSha256: string;
  applicationZipPath: string;
  applicationZipBytes: number;
  applicationZipSha256: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(backupJobs)
    .set({
      status: "completed",
      databaseZipPath: input.databaseZipPath,
      databaseZipBytes: input.databaseZipBytes,
      databaseZipSha256: input.databaseZipSha256,
      applicationZipPath: input.applicationZipPath,
      applicationZipBytes: input.applicationZipBytes,
      applicationZipSha256: input.applicationZipSha256,
      completedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(and(eq(backupJobs.id, input.id), eq(backupJobs.status, "running")));
}

export async function markDatabaseBackupFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  const db = await getDb();
  const safeMessage = errorMessage
    .replace(/[\r\n]+/g, " ")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database connection]")
    .replace(/(?:^|\s)(?:\/|[A-Za-z]:\\)[^\s]+/g, " [redacted path]")
    .slice(0, 500);
  await db
    .update(backupJobs)
    .set({
      status: "failed",
      errorMessage: safeMessage || "Database backup failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backupJobs.id, id),
        inArray(backupJobs.status, ["queued", "running"])
      )
    );
}

export async function reconcileStaleDatabaseBackupJobs(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - DATABASE_BACKUP_STALE_RUNNING_MS);
  await db
    .update(backupJobs)
    .set({
      status: "failed",
      errorMessage: "Backup worker stopped before completing the job",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backupJobs.status, "running"),
        or(isNull(backupJobs.startedAt), lt(backupJobs.startedAt, cutoff))
      )
    );
}

async function removeJobDirectory(jobId: string): Promise<void> {
  const directory = getDatabaseBackupJobDirectory(jobId);
  const root = getDatabaseBackupRoot();
  if (!isWithinRoot(directory, root) || directory === root) return;
  await fs.rm(directory, { recursive: true, force: true });
}

export async function cleanupExpiredDatabaseBackups(
  now = new Date()
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(backupJobs)
    .where(lt(backupJobs.expiresAt, now));
  let cleaned = 0;
  for (const row of rows) {
    await removeJobDirectory(row.id);
    await db
      .update(backupJobs)
      .set({
        status: "expired",
        databaseZipPath: null,
        databaseZipBytes: null,
        databaseZipSha256: null,
        applicationZipPath: null,
        applicationZipBytes: null,
        applicationZipSha256: null,
        updatedAt: now,
      })
      .where(eq(backupJobs.id, row.id));
    cleaned += 1;
  }
  return cleaned;
}

export async function resolveDatabaseBackupArtifactPath(
  row: BackupJobRow,
  artifact: DatabaseBackupArtifact
): Promise<string | null> {
  if (row.status !== "completed" || row.expiresAt.getTime() <= Date.now())
    return null;
  const rawPath =
    artifact === "database" ? row.databaseZipPath : row.applicationZipPath;
  if (!rawPath) return null;

  const root = path.resolve(getDatabaseBackupRoot());
  const candidate = path.resolve(rawPath);
  if (!isWithinRoot(candidate, root)) return null;
  try {
    const [rootReal, candidateReal] = await Promise.all([
      fs.realpath(root),
      fs.realpath(candidate),
    ]);
    if (!isWithinRoot(candidateReal, rootReal)) return null;
    const stat = await fs.stat(candidateReal);
    if (!stat.isFile() || stat.size <= 0) return null;
    return candidateReal;
  } catch {
    return null;
  }
}
