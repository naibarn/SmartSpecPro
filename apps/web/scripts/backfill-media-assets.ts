/**
 * Backfill Script: Create media_assets rows for existing image attachments (Section 12)
 *
 * Processes messages with image attachments in batches, creating media_assets rows
 * and optionally dispatching vision analysis for each.
 *
 * Usage:
 *   npx tsx scripts/backfill-media-assets.ts
 *
 * Environment flags:
 *   BACKFILL_DISPATCH_VISION=true   Also dispatch vision analysis (default: false)
 *   BACKFILL_BATCH_SIZE=100         Messages per batch (default: 100)
 *   BACKFILL_DRY_RUN=true           Log without writing (default: false)
 */

export interface Attachment {
  type: string;
  url: string;
  key?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
  assetId?: number | null;
}

/**
 * Extract image-type attachments from an attachments array.
 * Returns empty array for null/undefined/empty input.
 */
export function extractImageAttachments(attachments: Attachment[] | null | undefined): Attachment[] {
  if (!attachments || attachments.length === 0) return [];
  return attachments.filter((a) => a.type === "image");
}

/**
 * Build the storage key for an attachment.
 * Prefers attachment.key; falls back to parsing from URL; falls back to the URL itself.
 */
export function buildAssetStorageKey(attachment: Pick<Attachment, "url" | "key">): string {
  if (attachment.key) return attachment.key;
  try {
    const parsed = new URL(attachment.url);
    // Return pathname without leading slash
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return attachment.url;
  }
}

/**
 * Returns true if the attachment already has a valid assetId (already backfilled).
 */
export function isAlreadyBackfilled(attachment: Attachment): boolean {
  return typeof attachment.assetId === "number" && attachment.assetId > 0;
}

/**
 * Build the vision dispatch request payload for the Python backend.
 * Field names are snake_case to match the Pydantic VisionAnalyzeRequest model
 * in python-backend/app/api/vision.py.
 */
export function buildVisionPayload(
  assetId: number,
  imageUrl: string,
  tenantId: string,
  userId: number,
  systemCost = true,
): Record<string, unknown> {
  return {
    asset_id: assetId,
    image_url: imageUrl,
    tenant_id: tenantId,
    user_id: userId,
    system_cost: systemCost,
  };
}

// ---------------------------------------------------------------------------
// Main script (only runs when executed directly, not during tests)
// ---------------------------------------------------------------------------

async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(
    process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec"
  );

  const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || "100", 10);
  const DRY_RUN = process.env.BACKFILL_DRY_RUN === "true";
  const DISPATCH_VISION = process.env.BACKFILL_DISPATCH_VISION === "true";
  const PYTHON_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
  const PROXY_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";

  console.log(`[backfill] Starting. batch=${BATCH_SIZE} dryRun=${DRY_RUN} dispatchVision=${DISPATCH_VISION}`);

  let offset = 0;
  let totalAssetsCreated = 0;
  let totalSkipped = 0;
  let totalMessages = 0;

  while (true) {
    const rows = await sql<{
      id: number;
      conversationId: number;
      attachments: Attachment[];
      userId: number;
      tenantId: string;
      projectId: string | null;
    }[]>`
      SELECT m.id, m."conversationId", m.attachments,
             c."userId", c."tenantId", c."projectId"
      FROM messages m
      JOIN conversations c ON m."conversationId" = c.id
      WHERE m.attachments IS NOT NULL
        AND m.attachments::text != '[]'
      ORDER BY m.id ASC
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `;

    if (rows.length === 0) break;

    for (const row of rows) {
      totalMessages++;
      const imageAttachments = extractImageAttachments(row.attachments);
      if (imageAttachments.length === 0) continue;

      let modified = false;
      const updatedAttachments = [...row.attachments];

      for (let i = 0; i < updatedAttachments.length; i++) {
        const att = updatedAttachments[i];
        if (att.type !== "image") continue;
        if (isAlreadyBackfilled(att)) {
          totalSkipped++;
          continue;
        }

        const storageKey = buildAssetStorageKey(att);
        const mimeType = att.mimeType || "image/jpeg";
        const now = new Date().toISOString();

        if (DRY_RUN) {
          console.log(`[DRY RUN] Would create asset for message ${row.id}, url=${att.url}`);
          totalAssetsCreated++;
          continue;
        }

        try {
          const [asset] = await sql<{ id: number }[]>`
            INSERT INTO media_assets
              ("tenantId", "userId", "projectId", "conversationId", "messageId",
               "sourceType", status, "storageKey", "originalUrl", "mimeType",
               "createdAt", "updatedAt")
            VALUES
              (${row.tenantId}, ${row.userId}, ${row.projectId}, ${row.conversationId}, ${row.id},
               'chat_attachment', 'pending', ${storageKey}, ${att.url}, ${mimeType},
               ${now}, ${now})
            RETURNING id
          `;

          updatedAttachments[i] = { ...att, assetId: asset.id };
          modified = true;
          totalAssetsCreated++;

          if (DISPATCH_VISION) {
            await fetch(`${PYTHON_URL}/api/v1/vision/analyze`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-proxy-token": PROXY_TOKEN,
              },
              body: JSON.stringify({
                asset_id: asset.id,
                image_url: att.url,
                tenant_id: row.tenantId,
                user_id: row.userId,
                system_cost: true,
              }),
            }).catch((err) => {
              console.warn(`[backfill] Vision dispatch failed for asset ${asset.id}: ${err.message}`);
            });
          }
        } catch (err) {
          console.error(`[backfill] Failed to process attachment in message ${row.id}: ${(err as Error).message}`);
        }
      }

      if (modified && !DRY_RUN) {
        await sql`
          UPDATE messages SET attachments = ${JSON.stringify(updatedAttachments)}::jsonb WHERE id = ${row.id}
        `;
      }
    }

    offset += BATCH_SIZE;
    console.log(`[backfill] Batch ${Math.ceil(offset / BATCH_SIZE)}: processed ${Math.min(offset, totalMessages)} messages (assets created: ${totalAssetsCreated}, skipped: ${totalSkipped})`);
  }

  console.log(`\n[backfill] Complete. Messages scanned: ${totalMessages}, Assets created: ${totalAssetsCreated}, Skipped: ${totalSkipped}`);
  await sql.end();
}

// Only run main() when executed directly (not imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  });
}
