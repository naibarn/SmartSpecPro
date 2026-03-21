import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  notificationPreferences,
  NOTIFICATION_CATEGORIES,
} from "../../drizzle/schema";
import { getRedisClient } from "../services/redis";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

const categorySchema = z.enum(NOTIFICATION_CATEGORIES);

const upsertPreferenceInput = z.object({
  category: categorySchema,
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  telegram: z.boolean().optional(),
  minSeverity: z.enum(["low", "normal", "high", "critical"]).nullable().optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
  emailDigestFrequency: z.enum(["hourly", "daily"]).nullable().optional(),
  emailDigestHour: z.number().int().min(0).max(23).nullable().optional(),
});

const snoozeCategoryInput = z.object({
  category: categorySchema,
  mutedUntil: z.string().datetime().nullable(),
});

async function requirePreferencesEnabled(tenantId: string | null): Promise<void> {
  if (!tenantId) return;
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.notificationPreferencesEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Notification preferences feature is not enabled for this tenant",
    });
  }
}

export const notificationPreferencesRouter = router({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    await requirePreferencesEnabled(ctx.tenantId);
    const db = getDb();
    return db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, ctx.user.id));
  }),

  upsertPreference: protectedProcedure
    .input(upsertPreferenceInput)
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      const db = getDb();
      const values: Record<string, unknown> = {
        userId: ctx.user.id,
        category: input.category,
        updatedAt: new Date(),
      };
      if (input.inApp !== undefined) values.inApp = input.inApp;
      if (input.email !== undefined) values.email = input.email;
      if (input.telegram !== undefined) values.telegram = input.telegram;
      if (input.minSeverity !== undefined) values.minSeverity = input.minSeverity;
      if (input.mutedUntil !== undefined) {
        values.mutedUntil = input.mutedUntil ? new Date(input.mutedUntil) : null;
      }
      if (input.emailDigestFrequency !== undefined) {
        values.emailDigestFrequency = input.emailDigestFrequency;
      }
      if (input.emailDigestHour !== undefined) {
        values.emailDigestHour = input.emailDigestHour;
      }

      const [result] = await db
        .insert(notificationPreferences)
        .values(values as any)
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.category,
          ],
          set: values as any,
        })
        .returning();

      // Invalidate Redis preference cache
      try {
        const redis = getRedisClient();
        await redis.del(`notification:prefs:${ctx.user.id}:${input.category}`);
      } catch {
        // Redis unavailable — preference will be re-read from DB
      }

      return result;
    }),

  snoozeCategory: protectedProcedure
    .input(snoozeCategoryInput)
    .mutation(async ({ ctx, input }) => {
      await requirePreferencesEnabled(ctx.tenantId);
      if (input.mutedUntil && new Date(input.mutedUntil) <= new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "mutedUntil must be in the future",
        });
      }

      const db = getDb();
      const mutedValue = input.mutedUntil ? new Date(input.mutedUntil) : null;

      // Upsert — create with defaults if no preference row exists
      const [result] = await db
        .insert(notificationPreferences)
        .values({
          userId: ctx.user.id,
          category: input.category,
          mutedUntil: mutedValue,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.category,
          ],
          set: { mutedUntil: mutedValue, updatedAt: new Date() },
        })
        .returning();

      // Invalidate Redis preference cache
      try {
        const redis = getRedisClient();
        await redis.del(`notification:prefs:${ctx.user.id}:${input.category}`);
      } catch {
        // Redis unavailable — preference will be re-read from DB
      }

      return result;
    }),
});
