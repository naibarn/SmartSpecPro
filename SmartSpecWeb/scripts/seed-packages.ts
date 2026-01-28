/**
 * Seed script for Credit Packages
 *
 * Pricing Formula:
 * - Base rate: 1 credit = $0.001 USD
 * - Markup: 15-25% depending on package size (volume discounts)
 *
 * Run with: npx tsx scripts/seed-packages.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { creditPackages } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

interface PackageSeed {
  name: string;
  description: string;
  credits: number;
  priceUsd: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

/**
 * Package definitions with markup calculations
 *
 * | Package    | Credits  | Base Cost | Markup | Final Price | $/credit |
 * |------------|----------|-----------|--------|-------------|----------|
 * | Starter    | 1,000    | $1.00     | 25%    | $1.25       | 0.00125  |
 * | Basic      | 5,000    | $5.00     | 20%    | $5.99       | 0.00120  |
 * | Standard   | 10,000   | $10.00    | 20%    | $11.99      | 0.00120  |
 * | Pro        | 25,000   | $25.00    | 20%    | $29.99      | 0.00120  |
 * | Business   | 50,000   | $50.00    | 18%    | $59.00      | 0.00118  |
 * | Enterprise | 100,000  | $100.00   | 15%    | $115.00     | 0.00115  |
 */
const packages: PackageSeed[] = [
  {
    name: "Starter",
    description: `<div class="space-y-2">
  <p class="font-medium">Perfect for trying out our AI services</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>1,000 credits</li>
    <li>~100 basic image generations</li>
    <li>~50 high-quality images</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 1000,
    priceUsd: "1.25",
    isActive: true,
    isFeatured: false,
    sortOrder: 1,
  },
  {
    name: "Basic",
    description: `<div class="space-y-2">
  <p class="font-medium">Great for casual creators</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>5,000 credits</li>
    <li>~500 basic image generations</li>
    <li>~5 short video clips</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 5000,
    priceUsd: "5.99",
    isActive: true,
    isFeatured: false,
    sortOrder: 2,
  },
  {
    name: "Standard",
    description: `<div class="space-y-2">
  <p class="font-medium text-primary">Most Popular - Best value for regular users</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>10,000 credits</li>
    <li>~1,000 basic image generations</li>
    <li>~10 short video clips</li>
    <li>~100 audio generations</li>
    <li>Priority support</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 10000,
    priceUsd: "11.99",
    isActive: true,
    isFeatured: true,
    sortOrder: 3,
  },
  {
    name: "Pro",
    description: `<div class="space-y-2">
  <p class="font-medium">For professional creators & small teams</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>25,000 credits</li>
    <li>~2,500 basic image generations</li>
    <li>~25 short video clips</li>
    <li>~250 audio generations</li>
    <li>Priority processing queue</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 25000,
    priceUsd: "29.99",
    isActive: true,
    isFeatured: false,
    sortOrder: 4,
  },
  {
    name: "Business",
    description: `<div class="space-y-2">
  <p class="font-medium">For agencies & growing businesses</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>50,000 credits</li>
    <li>~5,000 basic image generations</li>
    <li>~50 short video clips</li>
    <li>~500 audio generations</li>
    <li>Priority processing queue</li>
    <li>Dedicated support</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 50000,
    priceUsd: "59.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 5,
  },
  {
    name: "Enterprise",
    description: `<div class="space-y-2">
  <p class="font-medium text-green-600">Best Value - Save 15%</p>
  <ul class="list-disc list-inside text-sm text-muted-foreground">
    <li>100,000 credits</li>
    <li>~10,000 basic image generations</li>
    <li>~100 short video clips</li>
    <li>~1,000 audio generations</li>
    <li>Highest priority queue</li>
    <li>Dedicated account manager</li>
    <li>Custom integrations support</li>
    <li>No expiration</li>
  </ul>
</div>`,
    credits: 100000,
    priceUsd: "115.00",
    isActive: true,
    isFeatured: false,
    sortOrder: 6,
  },
];

async function seed() {
  console.log("🌱 Seeding credit packages...\n");

  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    for (const pkg of packages) {
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

    console.log("\n📊 Pricing Summary:");
    console.log("─".repeat(60));
    console.log("Package      | Credits    | Price    | $/1000 cr | Markup");
    console.log("─".repeat(60));

    for (const pkg of packages) {
      const baseCost = pkg.credits * 0.001;
      const price = parseFloat(pkg.priceUsd);
      const markup = ((price / baseCost - 1) * 100).toFixed(0);
      const per1000 = (price / pkg.credits * 1000).toFixed(2);

      console.log(
        `${pkg.name.padEnd(12)} | ${pkg.credits.toLocaleString().padStart(10)} | $${pkg.priceUsd.padStart(7)} | $${per1000.padStart(8)} | ${markup}%`
      );
    }

    console.log("─".repeat(60));
    console.log("\n✨ Seed completed successfully!");

  } catch (error) {
    console.error("❌ Error seeding packages:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
