/**
 * Runner script for multi-provider seed
 */

import {
  seedZenProvider,
  seedKieAiProvider,
  seedNvidiaNimProvider,
  seedAssistantTeamTemplates,
} from "../drizzle/seed";

async function main() {
  console.log("[Seed] Starting multi-provider seed...");
  await seedZenProvider();
  await seedKieAiProvider();
  await seedNvidiaNimProvider();
  await seedAssistantTeamTemplates();
  console.log("[Seed] Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
