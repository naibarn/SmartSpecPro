/**
 * Seed initial workflow template categories.
 * Run: cd apps/web && tsx drizzle/seed-workflow-categories.ts
 */
import { db } from "../server/_core/db";
import { templateCategories } from "./schema";

async function seedCategories() {
  console.log("Seeding workflow template categories...");

  const categories = [
    { name: "AI Workflows", slug: "ai-workflows", sortOrder: 1 },
    { name: "Automation", slug: "automation", sortOrder: 2 },
    { name: "Data Processing", slug: "data-processing", sortOrder: 3 },
    { name: "Content Generation", slug: "content-generation", sortOrder: 4 },
    { name: "Customer Support", slug: "customer-support", sortOrder: 5 },
  ];

  for (const cat of categories) {
    await db.insert(templateCategories).values(cat).onConflictDoNothing();
    console.log(`✓ ${cat.name}`);
  }

  console.log("Categories seeded successfully.");
  process.exit(0);
}

seedCategories().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
