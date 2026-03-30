/**
 * Seed the first intent-sliced page manifest for smartaihub.app.
 * This focuses on FAQ, image, video, SEO, and content-factory pages so each
 * page owns a distinct keyword cluster and can be expanded over time.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { smartaihubIntentPagesManifest } from "./smartaihub-intent-pages-manifest";
import { importSmartAiHubContentManifest } from "../server/services/smartaihubContentImport";
import { pingSmartAiHubSearchEngines } from "../server/services/sitemapPing";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

async function main() {
  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    const result = await importSmartAiHubContentManifest(db, smartaihubIntentPagesManifest, smartaihubIntentPagesManifest.tenantDomain || "smartaihub.app");
    console.log(JSON.stringify({ success: true, result }, null, 2));
    await pingSmartAiHubSearchEngines(smartaihubIntentPagesManifest.tenantDomain || "smartaihub.app").catch(() => {});
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Seed error:", error);
  process.exit(1);
});
