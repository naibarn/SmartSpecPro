/**
 * seed-production.ts
 *
 * Bootstrap a fresh production database with minimum required data.
 * Fully idempotent -- safe to run multiple times.
 *
 * Usage: ADMIN_EMAIL=admin@example.com DATABASE_URL=... npx tsx scripts/seed-production.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { users, tenants, systemSettings } from "../drizzle/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import type { DrizzleDB } from "../server/db";

export async function seedProduction(db: DrizzleDB): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL environment variable is required");
  }

  const tempPassword = process.env.ADMIN_TEMP_PASSWORD || randomUUID();

  console.log("[Seed] Starting production seed...");

  // 1. Check if admin user already exists by email
  const existingUsers = await db
    .select({ id: users.id, openId: users.openId })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let adminId: number | undefined;

  if (existingUsers.length > 0) {
    adminId = existingUsers[0].id;
    console.log("[Seed] Admin user already exists, skipping creation.");
  } else {
    const adminOpenId = randomUUID();
    const password = await bcrypt.hash(tempPassword, 10);

    console.log("[Seed] Creating admin user...");
    const insertedUsers = await db
      .insert(users)
      .values({
        openId: adminOpenId,
        email: adminEmail,
        name: "Admin",
        role: "admin",
        password,
      })
      .returning({ id: users.id });

    adminId = insertedUsers[0]?.id;
    console.log("[Seed] Admin user created. IMPORTANT: Change password on first login!");
    if (!process.env.ADMIN_TEMP_PASSWORD) {
      console.log(`[Seed] Generated temp password: ${tempPassword}`);
    }
  }

  // 2. Insert default tenant (ON CONFLICT DO NOTHING on slug)
  console.log("[Seed] Creating default tenant: smartaihub");
  await db
    .insert(tenants)
    .values({
      id: randomUUID(),
      slug: "smartaihub",
      name: "SmartAI Hub",
      primaryDomain: "smartaihub.app",
      isActive: true,
      ...(adminId ? { ownerId: adminId } : {}),
    })
    .onConflictDoNothing({ target: tenants.slug });

  // 3. Insert system settings (SELECT-before-INSERT since no unique constraint on category+key)
  const settingsToSeed = [
    { category: "email", key: "smtp_host", value: "", description: "SMTP server host" },
    { category: "email", key: "smtp_port", value: "587", description: "SMTP server port" },
    { category: "llm", key: "default_provider", value: "openrouter", description: "Default LLM provider" },
    { category: "llm", key: "default_model", value: "gpt-4o-mini", description: "Default LLM model" },
  ];

  console.log("[Seed] Creating system settings...");
  for (const setting of settingsToSeed) {
    const existing = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, setting.category),
          eq(systemSettings.key, setting.key),
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(systemSettings).values(setting);
    }
  }

  console.log("[Seed] Production seed complete.");
}

// Run directly when executed as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  seedProduction(db as DrizzleDB)
    .then(async () => {
      console.log("[Seed] Done.");
      await client.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[Seed] Failed:", err);
      await client.end();
      process.exit(1);
    });
}
