import "dotenv/config";

import { backfillMarketplaceProductImageVectors } from "../server/services/marketplaceProductService";
import type { MarketplacePlatform } from "@shared/marketplaceCapture";

function readArg(prefix: string): string | null {
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw?.slice(prefix.length).trim();
  return value || null;
}

function readPositiveInt(prefix: string): number | undefined {
  const raw = readArg(prefix);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readNonNegativeInt(prefix: string): number | undefined {
  const raw = readArg(prefix);
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readPlatform(): MarketplacePlatform | "all" | undefined {
  const raw = readArg("--platform=");
  if (!raw || raw === "all" || raw === "shopee" || raw === "tiktok_shop") {
    return raw as MarketplacePlatform | "all" | undefined;
  }
  throw new Error("Invalid --platform. Use all, shopee, or tiktok_shop.");
}

async function main() {
  const dryRun = process.argv.includes("--apply") ? false : true;
  const tenantId = readArg("--tenant-id=") ?? undefined;
  const userId = readPositiveInt("--user-id=");
  const limit = readPositiveInt("--limit=");
  const offset = readNonNegativeInt("--offset=");
  const platform = readPlatform();

  const result = await backfillMarketplaceProductImageVectors({
    tenantId,
    userId,
    platform,
    limit,
    offset,
    dryRun,
  });
  const nextCommand = result.nextOffset == null
    ? null
    : `npx tsx apps/web/scripts/backfill-marketplace-product-image-vectors.ts ${dryRun ? "" : "--apply "}${tenantId ? `--tenant-id=${tenantId} ` : ""}${userId ? `--user-id=${userId} ` : ""}${platform ? `--platform=${platform} ` : ""}--limit=${limit ?? 100} --offset=${result.nextOffset}`.trim();

  console.log(JSON.stringify({
    mode: "marketplace_product_image_vector_backfill",
    tenantId,
    userId,
    platform: platform ?? "all",
    limit: limit ?? 100,
    offset: offset ?? 0,
    result,
    nextCommand,
    nextStep: dryRun ? "Re-run with --apply to index these images." : "Backfill batch complete.",
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[backfill-marketplace-product-image-vectors] failed:", error);
    process.exit(1);
  });
}
