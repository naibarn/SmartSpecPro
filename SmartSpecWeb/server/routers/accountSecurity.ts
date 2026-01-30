/**
 * Account Security Router
 * Admin endpoints for reviewing flagged registrations and managing blocked patterns.
 */

import { adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { registrationEvents, deviceFingerprints, blockedPatterns, users } from "../../drizzle/schema";
import { eq, and, sql, lt, desc, asc } from "drizzle-orm";

export const accountSecurityRouter = router({
  /**
   * Get flagged registrations (trust score < 70), paginated.
   */
  getFlaggedRegistrations: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const offset = (input.page - 1) * input.limit;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrationEvents)
        .where(lt(registrationEvents.trustScore, 70));

      const items = await db
        .select()
        .from(registrationEvents)
        .where(lt(registrationEvents.trustScore, 70))
        .orderBy(desc(registrationEvents.createdAt))
        .limit(input.limit)
        .offset(offset);

      return { items, total: countResult?.count || 0 };
    }),

  /**
   * Get registration clusters grouped by normalizedEmail.
   */
  getRegistrationClusters: adminProcedure
    .input(z.object({
      groupBy: z.enum(["normalizedEmail", "fingerprintHash", "ipAddress"]).default("normalizedEmail"),
      minCount: z.number().min(2).default(2),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const col = input.groupBy === "normalizedEmail"
        ? registrationEvents.normalizedEmail
        : input.groupBy === "fingerprintHash"
        ? registrationEvents.fingerprintHash
        : registrationEvents.ipAddress;

      const clusters = await db
        .select({
          key: col,
          count: sql<number>`count(*)::int`,
          emails: sql<string>`string_agg(distinct ${registrationEvents.email}, ', ')`,
          minScore: sql<number>`min(${registrationEvents.trustScore})`,
          maxScore: sql<number>`max(${registrationEvents.trustScore})`,
          latestAt: sql<Date>`max(${registrationEvents.createdAt})`,
        })
        .from(registrationEvents)
        .groupBy(col)
        .having(sql`count(*) >= ${input.minCount}`)
        .orderBy(desc(sql`count(*)`))
        .limit(50);

      return clusters;
    }),

  /**
   * Get blocked patterns.
   */
  getBlockedPatterns: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(blockedPatterns)
      .orderBy(desc(blockedPatterns.createdAt));
  }),

  /**
   * Add a blocked pattern.
   */
  addBlockedPattern: adminProcedure
    .input(z.object({
      patternType: z.enum(["email_domain", "email", "ip", "fingerprint"]),
      pattern: z.string().min(1).max(320),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [result] = await db.insert(blockedPatterns).values({
        patternType: input.patternType,
        pattern: input.pattern,
        reason: input.reason,
        createdBy: ctx.user.id,
        isActive: true,
      }).returning();

      return result;
    }),

  /**
   * Remove (deactivate) a blocked pattern.
   */
  removeBlockedPattern: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(blockedPatterns)
        .set({ isActive: false })
        .where(eq(blockedPatterns.id, input.id));

      return { success: true };
    }),

  /**
   * Approve a flagged user — grant withheld signup credits.
   */
  approveUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(users)
        .set({
          trustScore: 100,
          credits: sql`${users.credits} + 100`,
        })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * Ban a user — disable their account.
   */
  banUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(users)
        .set({ isDisabled: true })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),
});
