/**
 * Seed subscription packages with billing period support
 * Run with: npx tsx scripts/seed-subscription-packages.ts
 *
 * Base credit rate: 1 credit = $0.001 USD
 * Subscription markup: 20-25% (better value than one-time for loyal customers)
 *
 * Billing period discounts:
 * - Monthly: 0% (base price)
 * - Quarterly: 5% off
 * - Semi-Annual: 7% off
 * - Yearly: 10% off
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

// Subscription plans with monthly credits and pricing
// Markup is 20% from base rate ($0.001/credit)
const SUBSCRIPTION_PACKAGES = [
  {
    name: "Starter Plan",
    description: `<ul class="space-y-1">
      <li>5,000 credits/month</li>
      <li>Basic support</li>
      <li>Access to standard models</li>
    </ul>`,
    credits: 5000,        // Per month
    priceUsd: 5.99,       // Monthly base ($0.0012/credit = 20% markup)
    sortOrder: 100,
  },
  {
    name: "Professional Plan",
    description: `<ul class="space-y-1">
      <li>25,000 credits/month</li>
      <li>Priority support</li>
      <li>Access to all standard models</li>
      <li>API access</li>
    </ul>`,
    credits: 25000,
    priceUsd: 24.99,      // Monthly base ($0.001/credit = 0% markup - volume discount)
    sortOrder: 101,
    isFeatured: true,
  },
  {
    name: "Business Plan",
    description: `<ul class="space-y-1">
      <li>100,000 credits/month</li>
      <li>24/7 priority support</li>
      <li>Access to all models including premium</li>
      <li>Advanced API features</li>
      <li>Team collaboration tools</li>
    </ul>`,
    credits: 100000,
    priceUsd: 89.99,      // Monthly base ($0.0009/credit = -10% volume discount)
    sortOrder: 102,
  },
  {
    name: "Enterprise Plan",
    description: `<ul class="space-y-1">
      <li>500,000 credits/month</li>
      <li>Dedicated support manager</li>
      <li>All models + early access to new features</li>
      <li>Custom integrations</li>
      <li>SLA guarantee</li>
      <li>Volume discounts on additional credits</li>
    </ul>`,
    credits: 500000,
    priceUsd: 399.99,     // Monthly base ($0.0008/credit = -20% volume discount)
    sortOrder: 103,
  },
];

async function seed() {
  console.log("Seeding subscription packages...\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Clear existing subscription packages
    await sql`DELETE FROM credit_packages WHERE "packageType" = 'subscription'`;
    console.log("Cleared existing subscription packages\n");

    // Insert new packages
    for (const pkg of SUBSCRIPTION_PACKAGES) {
      await sql`
        INSERT INTO credit_packages (
          name, description, credits, "priceUsd",
          "packageType", "billingPeriod", "discountPercent",
          "isActive", "isFeatured", "sortOrder",
          "stripeProductId", "stripePriceIds"
        ) VALUES (
          ${pkg.name},
          ${pkg.description},
          ${pkg.credits},
          ${pkg.priceUsd.toFixed(2)},
          'subscription',
          'monthly',
          0,
          true,
          ${pkg.isFeatured || false},
          ${pkg.sortOrder},
          NULL,
          NULL
        )
      `;

      // Calculate billing period prices
      const quarterly = (pkg.priceUsd * 3 * 0.95).toFixed(2);
      const semiAnnual = (pkg.priceUsd * 6 * 0.93).toFixed(2);
      const yearly = (pkg.priceUsd * 12 * 0.90).toFixed(2);

      console.log(`Created: ${pkg.name}`);
      console.log(`  Credits: ${pkg.credits.toLocaleString()}/month`);
      console.log(`  Monthly: $${pkg.priceUsd.toFixed(2)}`);
      console.log(`  Quarterly (5% off): $${quarterly}`);
      console.log(`  Semi-Annual (7% off): $${semiAnnual}`);
      console.log(`  Yearly (10% off): $${yearly}`);
      console.log(`  Price/credit: $${(pkg.priceUsd / pkg.credits).toFixed(5)}`);
      console.log();
    }

    console.log("\nSubscription packages seeded successfully!");
    console.log("\nNote: Stripe Product IDs and Price IDs need to be configured manually");
    console.log("in the admin panel after creating corresponding products in Stripe Dashboard.");

  } catch (error) {
    console.error("Error seeding packages:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
