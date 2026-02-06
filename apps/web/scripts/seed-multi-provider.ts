/**
 * Runner script for multi-provider seed
 */

import { seedZenProvider } from "../drizzle/seed";

async function main() {
  console.log("[Seed] Starting multi-provider seed...");
  await seedZenProvider();
  console.log("[Seed] Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
