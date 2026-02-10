import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  createLibraryOpsRepository,
  getLibraryOpsSummary,
  reprocessCallbackDlqEntry,
  retryFailedLibraryIndexJobs,
} from "../services/libraryOpsService";

export const libraryOpsRouter = router({
  getSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }
    return getLibraryOpsSummary(db);
  }),

  reprocessCallbackDlq: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const result = await reprocessCallbackDlqEntry(
        createLibraryOpsRepository(db),
        input.id,
      );
      if (!result.success && result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "DLQ entry not found" });
      }

      return result;
    }),

  retryFailedIndexJobs: adminProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).max(500).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      return retryFailedLibraryIndexJobs(db, input);
    }),
});

