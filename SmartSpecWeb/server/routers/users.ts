/**
 * User Management tRPC Router
 * Admin-only routes for managing users
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure, domainAdminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users, creditTransactions } from "../../drizzle/schema";
import { eq, desc, like, or, sql, and } from "drizzle-orm";
import { addCredits, deductCredits, type TransactionType } from "../services/creditService";

// Zod schemas
const userFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(["user", "admin", "domain_admin"]).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  registeredDomain: z.string().optional(), // Filter by domain for domain admins
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const updateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["user", "admin", "domain_admin"]).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  registeredDomain: z.string().optional(),
  isDisabled: z.boolean().optional(),
});

const creditAdjustmentSchema = z.object({
  userId: z.number(),
  amount: z.number().min(1),
  type: z.enum(["bonus", "refund", "adjustment", "subscription"]),
  description: z.string().min(1).max(512),
  referenceId: z.string().optional(),
});

export const usersRouter = router({
  /**
   * Admin: List all users with pagination and filters
   */
  list: adminProcedure
    .input(userFiltersSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];

      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
            like(users.openId, `%${input.search}%`)
          )
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input.plan) {
        conditions.push(eq(users.plan, input.plan));
      }

      if (input.registeredDomain) {
        conditions.push(eq(users.registeredDomain, input.registeredDomain));
      }

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Get users
      let query = db.select().from(users);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const userList = await query
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        users: userList.map((u) => ({
          id: u.id,
          openId: u.openId,
          name: u.name,
          email: u.email,
          role: u.role,
          credits: u.credits,
          plan: u.plan,
          loginMethod: u.loginMethod,
          registeredDomain: u.registeredDomain,
          isDisabled: u.isDisabled,
          createdAt: u.createdAt,
          lastSignedIn: u.lastSignedIn,
        })),
        total: Number(countResult.count),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Admin: Get single user by ID
   */
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      // Get recent transactions
      const transactions = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, input.id))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(20);

      return {
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          credits: user.credits,
          plan: user.plan,
          loginMethod: user.loginMethod,
          registeredDomain: user.registeredDomain,
          isDisabled: user.isDisabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastSignedIn: user.lastSignedIn,
        },
        recentTransactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          balanceAfter: t.balanceAfter,
          referenceId: t.referenceId,
          createdAt: t.createdAt,
          metadata: t.metadata,
        })),
      };
    }),

  /**
   * Admin: Update user details
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: updateUserSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: Record<string, any> = {};

      if (input.data.name !== undefined) updateData.name = input.data.name;
      if (input.data.email !== undefined) updateData.email = input.data.email;
      if (input.data.role !== undefined) updateData.role = input.data.role;
      if (input.data.plan !== undefined) updateData.plan = input.data.plan;
      if (input.data.registeredDomain !== undefined) updateData.registeredDomain = input.data.registeredDomain;
      if (input.data.isDisabled !== undefined) updateData.isDisabled = input.data.isDisabled;

      if (Object.keys(updateData).length === 0) {
        throw new Error("No fields to update");
      }

      await db.update(users).set(updateData).where(eq(users.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: Add credits to user (with transaction logging)
   */
  addCredits: adminProcedure
    .input(creditAdjustmentSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await addCredits({
        userId: input.userId,
        amount: input.amount,
        type: input.type as TransactionType,
        description: input.description,
        referenceId: input.referenceId,
        metadata: {
          adminId: ctx.user.id,
          adminName: ctx.user.name || ctx.user.email,
          action: "admin_add_credits",
        },
      });

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    }),

  /**
   * Admin: Deduct credits from user (with transaction logging)
   * Used for corrections/adjustments
   */
  deductCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        amount: z.number().min(1),
        description: z.string().min(1).max(512),
        referenceId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await deductCredits({
        userId: input.userId,
        amount: input.amount,
        description: input.description,
        metadata: {
          adminId: ctx.user.id,
          adminName: ctx.user.name || ctx.user.email,
          action: "admin_deduct_credits",
          referenceId: input.referenceId,
        },
      });

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    }),

  /**
   * Admin: Set user credits to specific amount
   * Creates adjustment transaction to reach target balance
   */
  setCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        targetCredits: z.number().min(0),
        reason: z.string().min(1).max(512),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get current balance
      const [user] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      const currentCredits = user.credits;
      const difference = input.targetCredits - currentCredits;

      if (difference === 0) {
        return {
          success: true,
          newBalance: currentCredits,
          message: "No change needed",
        };
      }

      const description = `Admin adjustment: ${input.reason} (${currentCredits} → ${input.targetCredits})`;

      if (difference > 0) {
        // Add credits
        const result = await addCredits({
          userId: input.userId,
          amount: difference,
          type: "adjustment",
          description,
          metadata: {
            adminId: ctx.user.id,
            adminName: ctx.user.name || ctx.user.email,
            action: "admin_set_credits",
            previousBalance: currentCredits,
            targetBalance: input.targetCredits,
          },
        });
        return {
          success: true,
          newBalance: result.newBalance,
          transactionId: result.transactionId,
        };
      } else {
        // Deduct credits
        const result = await deductCredits({
          userId: input.userId,
          amount: Math.abs(difference),
          description,
          metadata: {
            adminId: ctx.user.id,
            adminName: ctx.user.name || ctx.user.email,
            action: "admin_set_credits",
            previousBalance: currentCredits,
            targetBalance: input.targetCredits,
          },
        });
        return {
          success: true,
          newBalance: result.newBalance,
          transactionId: result.transactionId,
        };
      }
    }),

  /**
   * Admin: Get user statistics
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [stats] = await db.select({
      totalUsers: sql<number>`COUNT(*)`,
      totalAdmins: sql<number>`SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END)`,
      totalCredits: sql<number>`SUM(credits)`,
      freeUsers: sql<number>`SUM(CASE WHEN plan = 'free' THEN 1 ELSE 0 END)`,
      starterUsers: sql<number>`SUM(CASE WHEN plan = 'starter' THEN 1 ELSE 0 END)`,
      proUsers: sql<number>`SUM(CASE WHEN plan = 'pro' THEN 1 ELSE 0 END)`,
      enterpriseUsers: sql<number>`SUM(CASE WHEN plan = 'enterprise' THEN 1 ELSE 0 END)`,
      activeToday: sql<number>`SUM(CASE WHEN DATE("lastSignedIn") = CURRENT_DATE THEN 1 ELSE 0 END)`,
      activeThisWeek: sql<number>`SUM(CASE WHEN "lastSignedIn" >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 ELSE 0 END)`,
      activeThisMonth: sql<number>`SUM(CASE WHEN "lastSignedIn" >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 ELSE 0 END)`,
    }).from(users);

    // Get recent signups
    const recentSignups = await db
      .select({
        date: sql<string>`DATE("createdAt")`,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(sql`"createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'`)
      .groupBy(sql`DATE("createdAt")`)
      .orderBy(desc(sql`DATE("createdAt")`));

    return {
      totalUsers: Number(stats.totalUsers) || 0,
      totalAdmins: Number(stats.totalAdmins) || 0,
      totalCredits: Number(stats.totalCredits) || 0,
      byPlan: {
        free: Number(stats.freeUsers) || 0,
        starter: Number(stats.starterUsers) || 0,
        pro: Number(stats.proUsers) || 0,
        enterprise: Number(stats.enterpriseUsers) || 0,
      },
      activity: {
        today: Number(stats.activeToday) || 0,
        thisWeek: Number(stats.activeThisWeek) || 0,
        thisMonth: Number(stats.activeThisMonth) || 0,
      },
      recentSignups: recentSignups.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }),

  /**
   * Admin: Search users by email or name
   */
  search: adminProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          credits: users.credits,
          plan: users.plan,
        })
        .from(users)
        .where(
          or(
            like(users.name, `%${input.query}%`),
            like(users.email, `%${input.query}%`)
          )
        )
        .limit(10);

      return results;
    }),

  /**
   * Get current user's profile (for any authenticated user)
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      credits: user.credits,
      plan: user.plan,
      registeredDomain: user.registeredDomain,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
    };
  }),

  /**
   * Domain Admin: Toggle user enabled/disabled status
   * Domain admins can only toggle users in their domain
   */
  toggleUserStatus: domainAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get target user
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!targetUser) {
        throw new Error("User not found");
      }

      // If domain admin (not full admin), check they can only manage users in their domain
      if (ctx.user.role === 'domain_admin') {
        if (targetUser.registeredDomain !== ctx.user.registeredDomain) {
          throw new Error("You can only manage users in your domain");
        }
        // Domain admins cannot disable other domain admins or full admins
        if (targetUser.role === 'domain_admin' || targetUser.role === 'admin') {
          throw new Error("You cannot disable other admins");
        }
      }

      // Toggle status
      await db
        .update(users)
        .set({ isDisabled: !targetUser.isDisabled })
        .where(eq(users.id, input.userId));

      return {
        success: true,
        newStatus: !targetUser.isDisabled
      };
    }),

  /**
   * Domain Admin: Get statistics for their domain
   */
  domainStats: domainAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // If domain admin, filter by their domain
    const domainFilter = ctx.user.role === 'domain_admin'
      ? eq(users.registeredDomain, ctx.user.registeredDomain || '')
      : undefined;

    const [stats] = await db.select({
      totalUsers: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`SUM(CASE WHEN "isDisabled" = false THEN 1 ELSE 0 END)`,
      disabledUsers: sql<number>`SUM(CASE WHEN "isDisabled" = true THEN 1 ELSE 0 END)`,
      totalCredits: sql<number>`SUM(credits)`,
    }).from(users).where(domainFilter);

    return {
      totalUsers: Number(stats.totalUsers) || 0,
      activeUsers: Number(stats.activeUsers) || 0,
      disabledUsers: Number(stats.disabledUsers) || 0,
      totalCredits: Number(stats.totalCredits) || 0,
      domain: ctx.user.role === 'domain_admin' ? ctx.user.registeredDomain : null,
    };
  }),
});
