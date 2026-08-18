import "dotenv/config";
import { backfillLibraryMedia } from "../server/services/libraryMediaBackfillService";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const report = await backfillLibraryMedia({
    tenantId: readArg("tenant"),
    limit: readArg("limit") ? Number(readArg("limit")) : undefined,
    apply: process.argv.includes("--apply"),
  });
  console.log(JSON.stringify({ ...report, errorCount: report.errors.length }, null, 2));
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Add --apply to copy reachable external images into durable storage.");
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
