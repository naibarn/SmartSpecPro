/**
 * Import SmartAIHub content from a JSON manifest produced by a skill.
 * Usage:
 *   tsx scripts/seed-smartaihub-content-import.ts --manifest=/path/to/manifest.json
 *   SMARTAIHUB_CONTENT_MANIFEST=/path/to/manifest.json tsx scripts/seed-smartaihub-content-import.ts
 *   SMARTAIHUB_CONTENT_MANIFEST_JSON='{"tenantDomain":"smartaihub.app"}' tsx scripts/seed-smartaihub-content-import.ts
 *   cat manifest.json | tsx scripts/seed-smartaihub-content-import.ts
 */

import fs from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { SmartAiHubContentManifestSchema } from "../shared/smartaihubContentManifest";
import { importSmartAiHubContentManifest } from "../server/services/smartaihubContentImport";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

function getManifestPath(): string | undefined {
  const arg = process.argv.slice(2).find((value) => value.startsWith("--manifest="));
  const envPath = process.env.SMARTAIHUB_CONTENT_MANIFEST;
  return (arg ? arg.split("=", 2)[1] : envPath)?.trim() || undefined;
}

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) {
    return undefined;
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      resolve(raw.trim() || undefined);
    });
    process.stdin.on("error", reject);
  });
}

async function readManifestRaw(): Promise<string> {
  const manifestPath = getManifestPath();
  if (manifestPath) {
    return fs.readFileSync(path.resolve(manifestPath), "utf8");
  }

  const envJson = process.env.SMARTAIHUB_CONTENT_MANIFEST_JSON?.trim();
  if (envJson) {
    return envJson;
  }

  const stdinJson = await readStdin();
  if (stdinJson) {
    return stdinJson;
  }

  throw new Error("Provide --manifest=/path/to/manifest.json, SMARTAIHUB_CONTENT_MANIFEST, SMARTAIHUB_CONTENT_MANIFEST_JSON, or pipe JSON via stdin");
}

async function main() {
  const raw = await readManifestRaw();
  const parsed = SmartAiHubContentManifestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid manifest: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
  }

  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    const result = await importSmartAiHubContentManifest(db, parsed.data, parsed.data.tenantDomain || "smartaihub.app");
    console.log(JSON.stringify({ success: true, result }, null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Import error:", error);
  process.exit(1);
});
