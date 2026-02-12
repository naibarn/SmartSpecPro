/**
 * Credit Packages Management tRPC Router
 * Admin-only routes for managing credit packages and pricing
 */

import { z } from "zod";
import { router, adminProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { creditPackages } from "../../drizzle/schema";
import { eq, desc, asc, sql } from "drizzle-orm";

// Billing period discounts (from base monthly price)
const BILLING_DISCOUNTS = {
  monthly: 0,       // No discount
  quarterly: 5,     // 5% discount
  semi_annual: 7,   // 7% discount
  yearly: 10,       // 10% discount
} as const;

// Zod schemas
const packageTypeSchema = z.enum(["one_time", "subscription", "agency"]);
const billingPeriodSchema = z.enum(["monthly", "quarterly", "semi_annual", "yearly"]);

const stripePriceIdsSchema = z.object({
  monthly: z.string().optional(),
  quarterly: z.string().optional(),
  semi_annual: z.string().optional(),
  yearly: z.string().optional(),
}).optional();

const createPackageSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  credits: z.number().min(1),
  priceUsd: z.number().min(0),
  packageType: packageTypeSchema.default("one_time"),
  billingPeriod: billingPeriodSchema.optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  stripePriceId: z.string().optional(),
  stripeProductId: z.string().optional(),
  stripePriceIds: stripePriceIdsSchema,
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

const updatePackageSchema = createPackageSchema.partial();

// Helper to calculate price for different billing periods
function calculatePeriodPrice(baseMonthlyPrice: number, period: keyof typeof BILLING_DISCOUNTS): number {
  const discount = BILLING_DISCOUNTS[period];
  const months = period === "monthly" ? 1 : period === "quarterly" ? 3 : period === "semi_annual" ? 6 : 12;
  const totalPrice = baseMonthlyPrice * months;
  return totalPrice * (1 - discount / 100);
}

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

    return packages.map((p) => {
      const basePrice = parseFloat(p.priceUsd);
      const isRecurring = p.packageType === "subscription" || p.packageType === "agency";

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        credits: p.credits,
        priceUsd: basePrice,
        packageType: p.packageType,
        billingPeriod: p.billingPeriod,
        isFeatured: p.isFeatured,
        // Calculate price per credit
        pricePerCredit: basePrice / p.credits,
        // For subscriptions and agency, include pricing for all billing periods
        ...(isRecurring && {
          billingPrices: {
            monthly: basePrice,
            quarterly: calculatePeriodPrice(basePrice, "quarterly"),
            semi_annual: calculatePeriodPrice(basePrice, "semi_annual"),
            yearly: calculatePeriodPrice(basePrice, "yearly"),
          },
          billingDiscounts: BILLING_DISCOUNTS,
        }),
      };
    });
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

    return packages.map((p) => {
      const basePrice = parseFloat(p.priceUsd);
      const isSubscription = p.packageType === "subscription";

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        credits: p.credits,
        priceUsd: basePrice,
        packageType: p.packageType,
        billingPeriod: p.billingPeriod,
        discountPercent: p.discountPercent,
        stripePriceId: p.stripePriceId,
        stripeProductId: p.stripeProductId,
        stripePriceIds: p.stripePriceIds,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        // Calculate price per credit
        pricePerCredit: basePrice / p.credits,
        // For subscriptions, include pricing for all billing periods
        ...(isSubscription && {
          billingPrices: {
            monthly: basePrice,
            quarterly: calculatePeriodPrice(basePrice, "quarterly"),
            semi_annual: calculatePeriodPrice(basePrice, "semi_annual"),
            yearly: calculatePeriodPrice(basePrice, "yearly"),
          },
        }),
      };
    });
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

      const basePrice = parseFloat(pkg.priceUsd);
      const isSubscription = pkg.packageType === "subscription";

      return {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        credits: pkg.credits,
        priceUsd: basePrice,
        packageType: pkg.packageType,
        billingPeriod: pkg.billingPeriod,
        discountPercent: pkg.discountPercent,
        stripePriceId: pkg.stripePriceId,
        stripeProductId: pkg.stripeProductId,
        stripePriceIds: pkg.stripePriceIds,
        isActive: pkg.isActive,
        isFeatured: pkg.isFeatured,
        sortOrder: pkg.sortOrder,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        // For subscriptions, include pricing for all billing periods
        ...(isSubscription && {
          billingPrices: {
            monthly: basePrice,
            quarterly: calculatePeriodPrice(basePrice, "quarterly"),
            semi_annual: calculatePeriodPrice(basePrice, "semi_annual"),
            yearly: calculatePeriodPrice(basePrice, "yearly"),
          },
        }),
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

      const [created] = await db.insert(creditPackages).values({
        name: input.name,
        description: input.description || null,
        credits: input.credits,
        priceUsd: input.priceUsd.toFixed(2),
        packageType: input.packageType,
        billingPeriod: input.packageType === "subscription" ? (input.billingPeriod || "monthly") : null,
        discountPercent: input.discountPercent || 0,
        stripePriceId: input.stripePriceId || null,
        stripeProductId: input.stripeProductId || null,
        stripePriceIds: input.stripePriceIds || null,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder,
      }).returning({ id: creditPackages.id });

      return {
        success: true,
        id: created.id,
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
      if (input.data.packageType !== undefined) updateData.packageType = input.data.packageType;
      if (input.data.billingPeriod !== undefined) updateData.billingPeriod = input.data.billingPeriod;
      if (input.data.discountPercent !== undefined) updateData.discountPercent = input.data.discountPercent;
      if (input.data.stripePriceId !== undefined) updateData.stripePriceId = input.data.stripePriceId;
      if (input.data.stripeProductId !== undefined) updateData.stripeProductId = input.data.stripeProductId;
      if (input.data.stripePriceIds !== undefined) updateData.stripePriceIds = input.data.stripePriceIds;
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
        activePackages: sql<number>`SUM(CASE WHEN "isActive" = true THEN 1 ELSE 0 END)`,
        featuredPackages: sql<number>`SUM(CASE WHEN "isFeatured" = true THEN 1 ELSE 0 END)`,
        oneTimePackages: sql<number>`SUM(CASE WHEN "packageType" = 'one_time' THEN 1 ELSE 0 END)`,
        subscriptionPackages: sql<number>`SUM(CASE WHEN "packageType" = 'subscription' THEN 1 ELSE 0 END)`,
        minPrice: sql<number>`MIN("priceUsd")`,
        maxPrice: sql<number>`MAX("priceUsd")`,
        minCredits: sql<number>`MIN(credits)`,
        maxCredits: sql<number>`MAX(credits)`,
      })
      .from(creditPackages);

    return {
      totalPackages: Number(stats.totalPackages) || 0,
      activePackages: Number(stats.activePackages) || 0,
      featuredPackages: Number(stats.featuredPackages) || 0,
      oneTimePackages: Number(stats.oneTimePackages) || 0,
      subscriptionPackages: Number(stats.subscriptionPackages) || 0,
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

      const [created] = await db.insert(creditPackages).values({
        name: `${pkg.name} (Copy)`,
        description: pkg.description,
        credits: pkg.credits,
        priceUsd: pkg.priceUsd,
        packageType: pkg.packageType,
        billingPeriod: pkg.billingPeriod,
        discountPercent: pkg.discountPercent,
        stripePriceId: null, // Don't copy Stripe ID
        stripeProductId: null, // Don't copy Stripe Product ID
        stripePriceIds: null, // Don't copy Stripe Price IDs
        isActive: false, // Start as inactive
        isFeatured: false,
        sortOrder: pkg.sortOrder + 1,
      }).returning({ id: creditPackages.id });

      return {
        success: true,
        id: created.id,
      };
    }),
});
