/**
 * Report-first bridge for legacy Product tie-in JSON.
 *
 * The default mode is read-only. `--apply` creates only catalog rows for
 * records with a reliable product name and preserves the original JSON in the
 * series row; it never guesses an image asset from an unmanaged URL.
 */
import "dotenv/config";
import postgres from "postgres";

export type LegacyProductTieInRow = {
  id: number;
  tenantId: string;
  userId: number;
  productTieIn: unknown;
  featureFlags?: unknown;
};

export type ObjectReferenceBackfillCandidate = {
  seriesId: number;
  tenantId: string;
  userId: number;
  name: string;
  marketplaceCaptureId?: string;
  marketplaceProductId?: string;
  hasUnmanagedImageUrl: boolean;
};

export function isObjectReferenceLegacyBackfillEnabled(
  featureFlags: unknown
): boolean {
  return Boolean(
    featureFlags &&
    typeof featureFlags === "object" &&
    (featureFlags as Record<string, unknown>)
      .verticalDramaObjectLegacyBackfill === true
  );
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function planObjectReferenceBackfill(
  rows: LegacyProductTieInRow[]
): ObjectReferenceBackfillCandidate[] {
  return rows.flatMap(row => {
    const config =
      row.productTieIn && typeof row.productTieIn === "object"
        ? (row.productTieIn as Record<string, unknown>)
        : {};
    const name =
      text(config.productName) ?? text(config.name) ?? text(config.title);
    if (!name) return [];
    return [
      {
        seriesId: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        name,
        marketplaceCaptureId: text(config.marketplaceCaptureId),
        marketplaceProductId: text(config.marketplaceProductId),
        hasUnmanagedImageUrl: Boolean(text(config.productImageUrl)),
      },
    ];
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const apply = process.argv.includes("--apply");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<LegacyProductTieInRow[]>`
      SELECT s.id, s."tenantId", s."userId", s."productTieIn",
             t."featureFlags"
      FROM vertical_drama_series s
      INNER JOIN tenants t ON t.id = s."tenantId"
      WHERE s."productTieIn" IS NOT NULL
      ORDER BY s.id
    `;
    const enabledRows = rows.filter(row =>
      isObjectReferenceLegacyBackfillEnabled(row.featureFlags)
    );
    const candidates = planObjectReferenceBackfill(enabledRows);
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "report",
          scanned: rows.length,
          featureDisabled: rows.length - enabledRows.length,
          candidates: candidates.length,
          unmanagedImageUrls: candidates.filter(row => row.hasUnmanagedImageUrl)
            .length,
        },
        null,
        2
      )
    );
    if (!apply) return;

    let applied = 0;
    await sql.begin(async tx => {
      for (const candidate of candidates) {
        const stableKey = candidate.marketplaceCaptureId
          ? `capture:${candidate.marketplaceCaptureId}:${candidate.marketplaceProductId ?? "default"}`
          : `story:${candidate.name.toLocaleLowerCase()}`;
        await tx`
          INSERT INTO vertical_drama_object_references
            ("tenantId", "userId", "seriesId", name, mode, source,
             "marketplaceCaptureId", "marketplaceProductId", "stableKey",
             "commercialTieInEnabled")
          VALUES
            (${candidate.tenantId}, ${candidate.userId}, ${candidate.seriesId},
             ${candidate.name}, 'commercial_tie_in', 'legacy_product_tie_in',
             ${candidate.marketplaceCaptureId ?? null},
             ${candidate.marketplaceProductId ?? null}, ${stableKey}, true)
          ON CONFLICT ("seriesId", "stableKey") DO UPDATE
            SET name = EXCLUDED.name,
                "updatedAt" = now(),
                status = 'active',
                "archivedAt" = NULL
        `;
        applied += 1;
      }
    });
    console.log(JSON.stringify({ applied }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("[backfill-vertical-drama-object-references] failed:", error);
    process.exitCode = 1;
  });
}
