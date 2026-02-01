/**
 * Apply billing period migration to credit_packages table
 * Run with: npx tsx scripts/apply-billing-migration.ts
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

async function migrate() {
  console.log("🔄 Applying billing period migration...\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Check if enums already exist
    const existingEnums = await sql`
      SELECT typname FROM pg_type WHERE typname IN ('package_type', 'billing_period')
    `;
    const existingEnumNames = existingEnums.map((e: any) => e.typname);

    // Create package_type enum if not exists
    if (!existingEnumNames.includes('package_type')) {
      console.log("Creating package_type enum...");
      await sql`CREATE TYPE package_type AS ENUM ('one_time', 'subscription')`;
      console.log("✅ Created package_type enum");
    } else {
      console.log("⏭️  package_type enum already exists");
    }

    // Create billing_period enum if not exists
    if (!existingEnumNames.includes('billing_period')) {
      console.log("Creating billing_period enum...");
      await sql`CREATE TYPE billing_period AS ENUM ('monthly', 'quarterly', 'semi_annual', 'yearly')`;
      console.log("✅ Created billing_period enum");
    } else {
      console.log("⏭️  billing_period enum already exists");
    }

    // Check existing columns
    const columns = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'credit_packages'
    `;
    const existingColumns = columns.map((c: any) => c.column_name);

    // Add packageType column if not exists
    if (!existingColumns.includes('packageType')) {
      console.log("Adding packageType column...");
      await sql`ALTER TABLE credit_packages ADD COLUMN "packageType" package_type DEFAULT 'one_time' NOT NULL`;
      console.log("✅ Added packageType column");
    } else {
      console.log("⏭️  packageType column already exists");
    }

    // Add billingPeriod column if not exists
    if (!existingColumns.includes('billingPeriod')) {
      console.log("Adding billingPeriod column...");
      await sql`ALTER TABLE credit_packages ADD COLUMN "billingPeriod" billing_period`;
      console.log("✅ Added billingPeriod column");
    } else {
      console.log("⏭️  billingPeriod column already exists");
    }

    // Add discountPercent column if not exists
    if (!existingColumns.includes('discountPercent')) {
      console.log("Adding discountPercent column...");
      await sql`ALTER TABLE credit_packages ADD COLUMN "discountPercent" integer DEFAULT 0`;
      console.log("✅ Added discountPercent column");
    } else {
      console.log("⏭️  discountPercent column already exists");
    }

    // Add stripeProductId column if not exists
    if (!existingColumns.includes('stripeProductId')) {
      console.log("Adding stripeProductId column...");
      await sql`ALTER TABLE credit_packages ADD COLUMN "stripeProductId" varchar(128)`;
      console.log("✅ Added stripeProductId column");
    } else {
      console.log("⏭️  stripeProductId column already exists");
    }

    // Add stripePriceIds column if not exists
    if (!existingColumns.includes('stripePriceIds')) {
      console.log("Adding stripePriceIds column...");
      await sql`ALTER TABLE credit_packages ADD COLUMN "stripePriceIds" json`;
      console.log("✅ Added stripePriceIds column");
    } else {
      console.log("⏭️  stripePriceIds column already exists");
    }

    console.log("\n✨ Migration completed successfully!");

    // Show current schema
    const finalColumns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'credit_packages'
      ORDER BY ordinal_position
    `;

    console.log("\n📋 Current credit_packages schema:");
    console.log("─".repeat(70));
    for (const col of finalColumns) {
      console.log(
        `${col.column_name.padEnd(20)} | ${col.data_type.padEnd(20)} | ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`
      );
    }
    console.log("─".repeat(70));

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
