/**
 * Seed script for Credit Top-up Packages
 *
 * Fixed dollar amounts with 15% markup:
 * - Base rate: 1 credit = $0.001 USD
 * - Credits = (Price USD / 0.001) / 1.15
 *
 * Run with: npx tsx scripts/seed-topup-packages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { creditPackages } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

interface TopupPackage {
  name: string;
  description: string;
  credits: number;
  priceUsd: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

/**
 * Top-up Package Calculations (15% markup)
 *
 * Formula: Credits = Floor(Price / 0.001 / 1.15)
 *
 * | Price  | Base Credits | After 15% Markup | Actual Markup |
 * |--------|--------------|------------------|---------------|
 * | $10    | 10,000       | 8,700            | 14.94%        |
 * | $20    | 20,000       | 17,400           | 14.94%        |
 * | $30    | 30,000       | 26,000           | 15.38%        |
 * | $50    | 50,000       | 43,500           | 14.94%        |
 * | $100   | 100,000      | 87,000           | 14.94%        |
 * | $200   | 200,000      | 174,000          | 14.94%        |
 * | $300   | 300,000      | 261,000          | 14.94%        |
 * | $500   | 500,000      | 435,000          | 14.94%        |
 * | $900   | 900,000      | 783,000          | 14.94%        |
 * | $1000  | 1,000,000    | 870,000          | 14.94%        |
 */
const topupPackages: TopupPackage[] = [
  {
    name: "Top-up $10",
    description: "Quick top-up for light usage",
    credits: 8700,
    priceUsd: "10.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 10,
  },
  {
    name: "Top-up $20",
    description: "Small top-up for regular users",
    credits: 17400,
    priceUsd: "20.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 11,
  },
  {
    name: "Top-up $30",
    description: "Medium top-up for active creators",
    credits: 26000,
    priceUsd: "30.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 12,
  },
  {
    name: "Top-up $50",
    description: "Popular choice for frequent users",
    credits: 43500,
    priceUsd: "50.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 13,
  },
  {
    name: "Top-up $100",
    description: "Best seller - Great value for power users",
    credits: 87000,
    priceUsd: "100.00",
    isActive: true,
    isFeatured: true,
    sortOrder: 14,
  },
  {
    name: "Top-up $200",
    description: "Professional choice for heavy usage",
    credits: 174000,
    priceUsd: "200.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 15,
  },
  {
    name: "Top-up $300",
    description: "Team-friendly package",
    credits: 261000,
    priceUsd: "300.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 16,
  },
  {
    name: "Top-up $500",
    description: "Business package for agencies",
    credits: 435000,
    priceUsd: "500.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 17,
  },
  {
    name: "Top-up $900",
    description: "Enterprise-grade credit bundle",
    credits: 783000,
    priceUsd: "900.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 18,
  },
  {
    name: "Top-up $1000",
    description: "Maximum value - Best for large projects",
    credits: 870000,
    priceUsd: "1000.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 19,
  },
];

async function seed() {
  console.log("🌱 Seeding top-up credit packages...\n");

  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    for (const pkg of topupPackages) {
      // Check if package with this name already exists
      const [existing] = await db
        .select()
        .from(creditPackages)
        .where(eq(creditPackages.name, pkg.name))
        .limit(1);

      if (existing) {
        console.log(`⏭️  Skipping "${pkg.name}" - already exists (ID: ${existing.id})`);
        continue;
      }

      // Insert new package
      const [result] = await db.insert(creditPackages).values({
        name: pkg.name,
        description: pkg.description,
        credits: pkg.credits,
        priceUsd: pkg.priceUsd,
        isActive: pkg.isActive,
        isFeatured: pkg.isFeatured,
        sortOrder: pkg.sortOrder,
      }).returning();

      const pricePerCredit = (parseFloat(pkg.priceUsd) / pkg.credits * 1000).toFixed(3);
      console.log(`✅ Created "${pkg.name}": ${pkg.credits.toLocaleString()} credits @ $${pkg.priceUsd} ($${pricePerCredit}/1000 credits)`);
    }

    console.log("\n📊 Top-up Pricing Summary (15% Markup):");
    console.log("═".repeat(70));
    console.log("Package       | Credits     | Price     | $/1000 cr | Actual Markup");
    console.log("═".repeat(70));

    for (const pkg of topupPackages) {
      const baseCost = pkg.credits * 0.001;
      const price = parseFloat(pkg.priceUsd);
      const markup = ((price / baseCost - 1) * 100).toFixed(2);
      const per1000 = (price / pkg.credits * 1000).toFixed(3);

      console.log(
        `${pkg.name.padEnd(13)} | ${pkg.credits.toLocaleString().padStart(11)} | $${pkg.priceUsd.padStart(8)} | $${per1000.padStart(8)} | ${markup}%`
      );
    }

    console.log("═".repeat(70));
    console.log("\n✨ Top-up packages seed completed successfully!");

  } catch (error) {
    console.error("❌ Error seeding top-up packages:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
