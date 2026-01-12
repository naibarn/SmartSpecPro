/**
 * Credit Packages Management tRPC Router
 * Admin-only routes for managing credit packages and pricing
 */

import { z } from "zod";
import { router, adminProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { creditPackages } from "../../drizzle/schema";
import { eq, desc, asc, sql } from "drizzle-orm";

// Zod schemas
const createPackageSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  credits: z.number().min(1),
  priceUsd: z.number().min(0),
  stripePriceId: z.string().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

const updatePackageSchema = createPackageSchema.partial();

export const packagesRouter = router({
  /**
   * Public: List all active packages (for pricing page)
   */
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const packages = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.isActive, true))
      .orderBy(asc(creditPackages.sortOrder), asc(creditPackages.priceUsd));

    return packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      credits: p.credits,
      priceUsd: parseFloat(p.priceUsd),
      isFeatured: p.isFeatured,
      // Calculate price per credit
      pricePerCredit: parseFloat(p.priceUsd) / p.credits,
    }));
  }),

  /**
   * Admin: List all packages (including inactive)
   */
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const packages = await db
      .select()
      .from(creditPackages)
      .orderBy(asc(creditPackages.sortOrder), desc(creditPackages.createdAt));

    return packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      credits: p.credits,
      priceUsd: parseFloat(p.priceUsd),
      stripePriceId: p.stripePriceId,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      // Calculate price per credit
      pricePerCredit: parseFloat(p.priceUsd) / p.credits,
    }));
  }),

  /**
   * Admin: Get single package
   */
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [pkg] = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.id, input.id))
        .limit(1);

      if (!pkg) {
        throw new Error("Package not found");
      }

      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        credits: pkg.credits,
        priceUsd: parseFloat(pkg.priceUsd),
        stripePriceId: pkg.stripePriceId,
        isActive: pkg.isActive,
        isFeatured: pkg.isFeatured,
        sortOrder: pkg.sortOrder,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      };
    }),

  /**
   * Admin: Create new package
   */
  create: adminProcedure
    .input(createPackageSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.insert(creditPackages).values({
        name: input.name,
        description: input.description || null,
        credits: input.credits,
        priceUsd: input.priceUsd.toFixed(2),
        stripePriceId: input.stripePriceId || null,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder,
      });

      return {
        success: true,
        id: result[0].insertId,
      };
    }),

  /**
   * Admin: Update package
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: updatePackageSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: Record<string, any> = {};

      if (input.data.name !== undefined) updateData.name = input.data.name;
      if (input.data.description !== undefined) updateData.description = input.data.description;
      if (input.data.credits !== undefined) updateData.credits = input.data.credits;
      if (input.data.priceUsd !== undefined) updateData.priceUsd = input.data.priceUsd.toFixed(2);
      if (input.data.stripePriceId !== undefined) updateData.stripePriceId = input.data.stripePriceId;
      if (input.data.isActive !== undefined) updateData.isActive = input.data.isActive;
      if (input.data.isFeatured !== undefined) updateData.isFeatured = input.data.isFeatured;
      if (input.data.sortOrder !== undefined) updateData.sortOrder = input.data.sortOrder;

      if (Object.keys(updateData).length === 0) {
        throw new Error("No fields to update");
      }

      await db
        .update(creditPackages)
        .set(updateData)
        .where(eq(creditPackages.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: Delete package
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(creditPackages).where(eq(creditPackages.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: Toggle active status
   */
  toggleActive: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [pkg] = await db
        .select({ isActive: creditPackages.isActive })
        .from(creditPackages)
        .where(eq(creditPackages.id, input.id))
        .limit(1);

      if (!pkg) {
        throw new Error("Package not found");
      }

      await db
        .update(creditPackages)
        .set({ isActive: !pkg.isActive })
        .where(eq(creditPackages.id, input.id));

      return { success: true, isActive: !pkg.isActive };
    }),

  /**
   * Admin: Toggle featured status
   */
  toggleFeatured: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [pkg] = await db
        .select({ isFeatured: creditPackages.isFeatured })
        .from(creditPackages)
        .where(eq(creditPackages.id, input.id))
        .limit(1);

      if (!pkg) {
        throw new Error("Package not found");
      }

      await db
        .update(creditPackages)
        .set({ isFeatured: !pkg.isFeatured })
        .where(eq(creditPackages.id, input.id));

      return { success: true, isFeatured: !pkg.isFeatured };
    }),

  /**
   * Admin: Update sort order for multiple packages
   */
  updateSortOrder: adminProcedure
    .input(
      z.array(
        z.object({
          id: z.number(),
          sortOrder: z.number(),
        })
      )
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const item of input) {
        await db
          .update(creditPackages)
          .set({ sortOrder: item.sortOrder })
          .where(eq(creditPackages.id, item.id));
      }

      return { success: true };
    }),

  /**
   * Admin: Get package statistics
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [stats] = await db
      .select({
        totalPackages: sql<number>`COUNT(*)`,
        activePackages: sql<number>`SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END)`,
        featuredPackages: sql<number>`SUM(CASE WHEN isFeatured = 1 THEN 1 ELSE 0 END)`,
        minPrice: sql<number>`MIN(priceUsd)`,
        maxPrice: sql<number>`MAX(priceUsd)`,
        minCredits: sql<number>`MIN(credits)`,
        maxCredits: sql<number>`MAX(credits)`,
      })
      .from(creditPackages);

    return {
      totalPackages: Number(stats.totalPackages) || 0,
      activePackages: Number(stats.activePackages) || 0,
      featuredPackages: Number(stats.featuredPackages) || 0,
      priceRange: {
        min: Number(stats.minPrice) || 0,
        max: Number(stats.maxPrice) || 0,
      },
      creditsRange: {
        min: Number(stats.minCredits) || 0,
        max: Number(stats.maxCredits) || 0,
      },
    };
  }),

  /**
   * Admin: Duplicate package
   */
  duplicate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [pkg] = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.id, input.id))
        .limit(1);

      if (!pkg) {
        throw new Error("Package not found");
      }

      const result = await db.insert(creditPackages).values({
        name: `${pkg.name} (Copy)`,
        description: pkg.description,
        credits: pkg.credits,
        priceUsd: pkg.priceUsd,
        stripePriceId: null, // Don't copy Stripe ID
        isActive: false, // Start as inactive
        isFeatured: false,
        sortOrder: pkg.sortOrder + 1,
      });

      return {
        success: true,
        id: result[0].insertId,
      };
    }),
});
