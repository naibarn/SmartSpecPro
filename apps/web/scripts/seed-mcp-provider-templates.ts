import { seedMcpProviderTemplates } from "../server/services/mcpProviderRegistry";
import { getDb } from "../server/db";

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  await seedMcpProviderTemplates(db);
  console.log("Seeded MCP provider templates: magnific, higgsfield");
}

main().catch((error) => {
  console.error("Failed to seed MCP provider templates", error);
  process.exit(1);
});
