import { getDb, hashPassword } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function updateAdminLocal() {
  const email = "admin@smartspec.local";
  const password = "admin123";

  console.log("Updating admin@smartspec.local with password...");

  const hashedPassword = await hashPassword(password);
  console.log("Hashed password:", hashedPassword);

  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    process.exit(1);
  }

  try {
    await db.update(users)
      .set({
        password: hashedPassword,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    console.log("✓ Admin user updated successfully!");
    console.log("\nYou can now login with:");
    console.log("  Email:", email);
    console.log("  Password:", password);
    process.exit(0);
  } catch (error) {
    console.error("Failed to update admin user:", error);
    process.exit(1);
  }
}

updateAdminLocal();
