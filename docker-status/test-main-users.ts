import { getUserByEmail } from "./server/db";

async function testMainUsers() {
  console.log("Testing access to SmartSpec main users table...\n");

  const testEmails = [
    "admin@smartspec.local",
    "admin@smartspec.pro"
  ];

  for (const email of testEmails) {
    console.log(`Checking: ${email}`);
    const user = await getUserByEmail(email);
    if (user) {
      console.log("✓ Found:", {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasPassword: !!user.password,
        credits: user.credits,
        plan: user.plan,
      });
    } else {
      console.log("✗ Not found");
    }
    console.log("");
  }
}

testMainUsers().then(() => process.exit(0)).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
