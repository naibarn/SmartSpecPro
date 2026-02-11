import { getDb } from "../server/db";
import {
  runLibraryUrlMigration,
  type LibraryUrlMigrationMode,
} from "../server/services/libraryUrlMigrationService";

function parseMode(): LibraryUrlMigrationMode {
  const arg = process.argv.find((entry) => entry.startsWith("--mode="));
  const mode = arg?.split("=")[1]?.trim();

  if (mode === "normalize" || mode === "enforce") {
    return mode;
  }

  return "dry-run";
}

async function main(): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const mode = parseMode();
  const snapshotRef = `library-url-migration-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const report = await runLibraryUrlMigration(db as any, {
    mode,
    snapshotRef,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[migrate-library-urls] failed:", error);
  process.exit(1);
});
