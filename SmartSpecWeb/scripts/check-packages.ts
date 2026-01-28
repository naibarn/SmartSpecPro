/**
 * Check packages in database
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

async function checkPackages() {
  const sql = postgres(DATABASE_URL);

  try {
    const packages = await sql`
      SELECT id, name, "packageType", credits, "priceUsd", "isActive", "isFeatured"
      FROM credit_packages
      ORDER BY "sortOrder", "priceUsd"
    `;

    console.log("\nAll packages in database:");
    console.log("=".repeat(80));
    packages.forEach(p => {
      console.log(`[${p.id}] ${p.name}`);
      console.log(`    Type: ${p.packageType}, Credits: ${p.credits.toLocaleString()}, Price: $${p.priceUsd}`);
      console.log(`    Active: ${p.isActive}, Featured: ${p.isFeatured}`);
      console.log();
    });

    const agencyPackages = packages.filter(p => p.packageType === 'agency');
    console.log(`\nFound ${agencyPackages.length} Agency package(s)`);

  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

checkPackages().catch((e) => {
  console.error(e);
  process.exit(1);
});
