/**
 * Seed Agency (White Label) package
 * Run with: npx tsx scripts/seed-agency-package.ts
 *
 * Agency plan: $299/month, 200,000 credits
 * Features:
 * - Custom domain support
 * - Domain admin privileges (manage users in same domain)
 * - Credit allocation to domain users
 * - White label branding capabilities
 * - Custom invoice configuration
 *
 * Billing period discounts:
 * - Monthly: 0% (base price)
 * - Quarterly: 5% off
 * - Semi-Annual: 7% off
 * - Yearly: 10% off
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

const AGENCY_PACKAGE = {
  name: "Agency White Label",
  description: `<ul class="space-y-1">
    <li>200,000 credits/month</li>
    <li>Custom domain support</li>
    <li>White label branding</li>
    <li>Domain admin privileges</li>
    <li>Manage & transfer credits to domain users</li>
    <li>Custom invoice configuration</li>
    <li>Dedicated priority support</li>
    <li>Access to all models including premium</li>
    <li>Advanced API features</li>
    <li>SLA guarantee</li>
  </ul>`,
  credits: 200000,
  priceUsd: 299.00,
  sortOrder: 200,  // Higher than regular subscriptions
  isFeatured: false,
};

async function seed() {
  console.log("Seeding Agency (White Label) package...\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Check if agency package already exists
    const existing = await sql`
      SELECT id FROM credit_packages
      WHERE "packageType" = 'agency' AND name = ${AGENCY_PACKAGE.name}
    `;

    if (existing.length > 0) {
      // Update existing package
      await sql`
        UPDATE credit_packages SET
          description = ${AGENCY_PACKAGE.description},
          credits = ${AGENCY_PACKAGE.credits},
          "priceUsd" = ${AGENCY_PACKAGE.priceUsd.toFixed(2)},
          "billingPeriod" = 'monthly',
          "discountPercent" = 0,
          "isActive" = true,
          "isFeatured" = ${AGENCY_PACKAGE.isFeatured},
          "sortOrder" = ${AGENCY_PACKAGE.sortOrder},
          "updatedAt" = NOW()
        WHERE "packageType" = 'agency' AND name = ${AGENCY_PACKAGE.name}
      `;
      console.log("Updated existing Agency package\n");
    } else {
      // Insert new package
      await sql`
        INSERT INTO credit_packages (
          name, description, credits, "priceUsd",
          "packageType", "billingPeriod", "discountPercent",
          "isActive", "isFeatured", "sortOrder",
          "stripeProductId", "stripePriceIds"
        ) VALUES (
          ${AGENCY_PACKAGE.name},
          ${AGENCY_PACKAGE.description},
          ${AGENCY_PACKAGE.credits},
          ${AGENCY_PACKAGE.priceUsd.toFixed(2)},
          'agency',
          'monthly',
          0,
          true,
          ${AGENCY_PACKAGE.isFeatured},
          ${AGENCY_PACKAGE.sortOrder},
          NULL,
          NULL
        )
      `;
      console.log("Created new Agency package\n");
    }

    // Calculate billing period prices
    const quarterly = (AGENCY_PACKAGE.priceUsd * 3 * 0.95).toFixed(2);
    const semiAnnual = (AGENCY_PACKAGE.priceUsd * 6 * 0.93).toFixed(2);
    const yearly = (AGENCY_PACKAGE.priceUsd * 12 * 0.90).toFixed(2);

    console.log(`Package: ${AGENCY_PACKAGE.name}`);
    console.log(`  Type: Agency (White Label)`);
    console.log(`  Credits: ${AGENCY_PACKAGE.credits.toLocaleString()}/month`);
    console.log(`  Monthly: $${AGENCY_PACKAGE.priceUsd.toFixed(2)}`);
    console.log(`  Quarterly (5% off): $${quarterly}`);
    console.log(`  Semi-Annual (7% off): $${semiAnnual}`);
    console.log(`  Yearly (10% off): $${yearly}`);
    console.log(`  Price/credit: $${(AGENCY_PACKAGE.priceUsd / AGENCY_PACKAGE.credits).toFixed(5)}`);
    console.log();

    console.log("Agency package seeded successfully!");
    console.log("\nNote: Stripe Product ID and Price IDs need to be configured manually");
    console.log("in the admin panel after creating corresponding products in Stripe Dashboard.");

  } catch (error) {
    console.error("Error seeding package:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
