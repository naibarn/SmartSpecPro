import { getDb, hashPassword } from "./server/db";
import { users } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function createAdmin() {
  const email = "admin@smartspec.pro";
  const password = "admin123"; // Change this to your desired password
  const name = "Admin";

  console.log("Creating admin user...");
  console.log("Email:", email);
  console.log("Password:", password);

  const hashedPassword = await hashPassword(password);
  console.log("Hashed password:", hashedPassword);

  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    process.exit(1);
  }

  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existing.length > 0) {
      console.log("Admin user already exists, updating password...");
      await db.update(users)
        .set({
          password: hashedPassword,
          role: "admin",
          updatedAt: new Date(),
        })
        .where(eq(users.email, email));
    } else {
      console.log("Creating new admin user...");
      await db.insert(users).values({
        email,
        password: hashedPassword,
        name,
        role: "admin",
        loginMethod: "email",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      });
    }

    console.log("✓ Admin user created successfully!");
    console.log("\nYou can now login with:");
    console.log("  Email:", email);
    console.log("  Password:", password);
    process.exit(0);
  } catch (error) {
    console.error("Failed to create admin user:", error);
    process.exit(1);
  }
}

createAdmin();
