import { getUserByEmail, verifyPassword } from "./server/db";

async function testLogin() {
  const email = "admin@smartspec.pro";
  const password = "admin123";

  console.log("Testing login for:", email);

  const user = await getUserByEmail(email);
  if (!user) {
    console.error("❌ User not found");
    return;
  }

  console.log("✓ User found:", {
    id: user.id,
    email: user.email,
    role: user.role,
    hasPassword: !!user.password,
  });

  if (!user.password) {
    console.error("❌ User has no password set");
    return;
  }

  console.log("Stored password hash:", user.password);
  console.log("Testing password:", password);

  const isValid = await verifyPassword(password, user.password);
  console.log("Password valid:", isValid ? "✓ YES" : "❌ NO");

  if (!isValid) {
    console.log("\nLet me check the password hash format...");
    const parts = user.password.split(":");
    console.log("Hash has", parts.length, "parts (should be 2)");
    if (parts.length === 2) {
      console.log("Salt length:", parts[0].length);
      console.log("Hash length:", parts[1].length);
    }
  }
}

testLogin().then(() => process.exit(0)).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
