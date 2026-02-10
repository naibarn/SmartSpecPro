#!/usr/bin/env tsx
/**
 * Reset admin password - SmartSpec Pro
 */
import { getDb } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@smartspec.pro";
const NEW_PASSWORD = "admin123"; // Change this!

async function resetPassword() {
  console.log("🔐 Resetting admin password...");

  const db = await getDb();
  if (!db) {
    console.error("❌ Database connection failed");
    process.exit(1);
  }

  // Hash new password
  const bcrypt = await import("bcrypt");
  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);

  // Update password
  await db
    .update(users)
    .set({ password: hashedPassword })
    .where(eq(users.email, ADMIN_EMAIL));

  console.log("✅ Admin password reset successfully!");
  console.log(`📧 Email: ${ADMIN_EMAIL}`);
  console.log(`🔑 Password: ${NEW_PASSWORD}`);
  console.log("\n⚠️  IMPORTANT: Change this password after logging in!");

  process.exit(0);
}

resetPassword().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
