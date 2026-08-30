import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  adminProcedure,
  rateLimitedAdminProcedure,
  router,
} from "../_core/trpc";
import {
  createDatabaseBackupInputSchema,
  DATABASE_BACKUP_MAX_LIST,
} from "../services/databaseBackupContracts";
import {
  createDatabaseBackupJob,
  getDatabaseBackupJob,
  listDatabaseBackupJobs,
  markDatabaseBackupFailed,
  toDatabaseBackupSummary,
} from "../services/databaseBackupService";
import { enqueueDatabaseBackup } from "../jobs/databaseBackupJob";

export const databaseBackupsRouter = router({
  create: rateLimitedAdminProcedure
    .input(createDatabaseBackupInputSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await createDatabaseBackupJob({
        createdByUserId: ctx.user.id,
        mode: input.mode,
      });
      try {
        await enqueueDatabaseBackup({ backupJobId: job.id, mode: input.mode });
      } catch (error) {
        await markDatabaseBackupFailed(
          job.id,
          error instanceof Error ? error.message : "Backup queue is unavailable"
        );
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Backup queue is unavailable",
        });
      }
      return job;
    }),

  list: adminProcedure
    .input(
      z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(DATABASE_BACKUP_MAX_LIST)
            .default(20),
        })
        .optional()
    )
    .query(async ({ input }) => listDatabaseBackupJobs(input?.limit)),

  get: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const job = await getDatabaseBackupJob(input.id);
      return job ? toDatabaseBackupSummary(job) : null;
    }),
});
