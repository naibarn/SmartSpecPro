/**
 * Add 'agency' value to package_type enum
 * Run with: npx tsx scripts/add-agency-enum.ts
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

async function addAgencyEnum() {
  console.log("Adding 'agency' to package_type enum...\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Check current enum values
    const currentValues = await sql`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'package_type')
      ORDER BY enumsortorder
    `;

    console.log("Current enum values:", currentValues.map(v => v.enumlabel).join(", "));

    // Check if 'agency' already exists
    const hasAgency = currentValues.some(v => v.enumlabel === 'agency');

    if (hasAgency) {
      console.log("\n'agency' value already exists in package_type enum.");
    } else {
      // Add 'agency' value
      await sql`ALTER TYPE package_type ADD VALUE 'agency'`;
      console.log("\n'agency' value added successfully!");
    }

    // Verify
    const newValues = await sql`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'package_type')
      ORDER BY enumsortorder
    `;
    console.log("\nUpdated enum values:", newValues.map(v => v.enumlabel).join(", "));

  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

addAgencyEnum().catch((e) => {
  console.error(e);
  process.exit(1);
});
