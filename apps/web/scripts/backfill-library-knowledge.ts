import "dotenv/config";

import {
  refreshLibraryKnowledgeItem,
  runLibraryKnowledgeBackfill,
} from "../server/services/libraryKnowledgeBackfillService";

interface BackfillLibraryKnowledgeOptions {
  tenantId: string;
  requestedByUserId: number | null;
  limit: number | null;
  itemId: number | null;
}

function readArg(prefix: string): string | null {
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw?.slice(prefix.length).trim();
  return value || null;
}

function readPositiveIntArg(prefix: string): number | null {
  const raw = readArg(prefix);
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptions(): BackfillLibraryKnowledgeOptions {
  const tenantId = readArg("--tenant-id=") ?? process.env.TENANT_ID ?? "";
  if (!tenantId.trim()) {
    throw new Error("Missing --tenant-id=<tenant-id>");
  }

  return {
    tenantId: tenantId.trim(),
    requestedByUserId: readPositiveIntArg("--user-id="),
    limit: readPositiveIntArg("--limit="),
    itemId: readPositiveIntArg("--item-id="),
  };
}

async function main(): Promise<void> {
  const options = parseOptions();

  if (options.itemId) {
    const result = await refreshLibraryKnowledgeItem({
      tenantId: options.tenantId,
      libraryItemId: options.itemId,
    });
    console.log(JSON.stringify({
      mode: "single_item_refresh",
      tenantId: options.tenantId,
      result,
    }, null, 2));
    return;
  }

  const result = await runLibraryKnowledgeBackfill({
    tenantId: options.tenantId,
    requestedByUserId: options.requestedByUserId,
    limit: options.limit ?? undefined,
  });
  console.log(JSON.stringify({
    mode: "tenant_backfill",
    tenantId: options.tenantId,
    result,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[backfill-library-knowledge] failed:", error);
    process.exit(1);
  });
}
