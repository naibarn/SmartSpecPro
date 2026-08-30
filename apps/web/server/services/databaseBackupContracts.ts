import { z } from "zod";

export const databaseBackupModeSchema = z.enum(["safe", "full"]);
export type DatabaseBackupMode = z.infer<typeof databaseBackupModeSchema>;

export const databaseBackupStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "expired",
]);
export type DatabaseBackupStatus = z.infer<typeof databaseBackupStatusSchema>;

export const databaseBackupArtifactSchema = z.enum(["database", "application"]);
export type DatabaseBackupArtifact = z.infer<
  typeof databaseBackupArtifactSchema
>;

export const createDatabaseBackupInputSchema = z
  .object({
    mode: databaseBackupModeSchema,
    confirmedFullExport: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "full" && !value.confirmedFullExport) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedFullExport"],
        message: "Full export confirmation is required",
      });
    }
  });

export type DatabaseBackupJobSummary = {
  id: string;
  mode: DatabaseBackupMode;
  status: DatabaseBackupStatus;
  createdByUserId: number | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  errorMessage: string | null;
  databaseZipBytes: number | null;
  applicationZipBytes: number | null;
  databaseZipSha256: string | null;
  applicationZipSha256: string | null;
  databaseDownloadUrl: string | null;
  applicationDownloadUrl: string | null;
};

export const BACKUP_RETENTION_MS = 24 * 60 * 60 * 1000;
export const DATABASE_BACKUP_QUEUE_NAME = "database-backup";
export const DATABASE_BACKUP_MAX_ACTIVE = 1;
export const DATABASE_BACKUP_MAX_LIST = 50;

export function isTerminalDatabaseBackupStatus(
  status: DatabaseBackupStatus
): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}
