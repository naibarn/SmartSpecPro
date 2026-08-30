import "dotenv/config";
import { getDb } from "../server/db";
import { backfillVerticalDramaMedia } from "../server/services/verticalDramaMediaBackfillService";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const tenantId = readArg("tenant") || process.env.TENANT_ID;
  const userId = Number(readArg("user") || process.env.USER_ID);
  if (!tenantId || !Number.isInteger(userId) || userId <= 0) {
    throw new Error("Usage: npm run backfill:vertical-drama-media -- --tenant=<tenant-id> --user=<user-id> [--series=<id>] [--episode=<id>] [--apply] [--limit=<n>]");
  }
  getDb();
  const report = await backfillVerticalDramaMedia({
    tenantId,
    userId,
    seriesId: readArg("series") ? Number(readArg("series")) : undefined,
    episodeId: readArg("episode") ? Number(readArg("episode")) : undefined,
    apply: process.argv.includes("--apply"),
    limit: readArg("limit") ? Number(readArg("limit")) : undefined,
  });
  console.log(
    JSON.stringify(
      {
        ...report,
        errorCount: report.errors.length,
        errors: report.errors.slice(0, 20),
      },
      null,
      2,
    ),
  );
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Add --apply after reviewing the inventory to upload recoverable media to R2.");
  }
  process.exit(0);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
