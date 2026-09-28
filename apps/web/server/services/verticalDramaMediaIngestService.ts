import { verticalDramaMediaAssets, verticalDramaMediaIndexRecords } from "../../drizzle/schema";
import { getDb } from "../db";
import { mediaSourceManifestSchema } from "../../shared/verticalDramaMedia/contracts";
import { processVerticalDramaMediaIndexRecord } from "./verticalDramaMediaIndexWorker";

/** Persists only bounded source metadata returned by the native Worker.
 * Raw footage and local host paths never enter this table. */
export async function persistVerticalDramaMediaInventory(input: { job: { tenantId: string; workerSeriesBindingId: string | null; workerSeriesBindingRevision: number | null }; seriesId: number; inventory: unknown }): Promise<number> {
  const db = getDb();
  if (!Array.isArray(input.inventory)) throw new Error("media_inventory_invalid");
  let persisted = 0;
  for (const item of input.inventory.slice(0, 5000)) {
    const source = mediaSourceManifestSchema.parse(item);
    const [asset] = await db.insert(verticalDramaMediaAssets).values({
      tenantId: input.job.tenantId,
      seriesId: input.seriesId,
      bindingId: input.job.workerSeriesBindingId,
      sourceAssetId: source.assetId,
      sourceRevision: source.sourceRevision,
      sourceFingerprint: source.sourceFingerprint,
      assetKind: source.kind,
      pipelineState: "discovered",
      sourceMetadataJson: { fileName: source.fileName, relativeName: source.relativeName ?? null, sizeBytes: source.sizeBytes, durationMs: source.durationMs, bindingRevision: input.job.workerSeriesBindingRevision },
      vectorIndexStatus: "queued",
    }).onConflictDoNothing().returning({ id: verticalDramaMediaAssets.id });
    if (!asset) continue;
    const [indexRecord] = await db.insert(verticalDramaMediaIndexRecords).values({ tenantId: input.job.tenantId, seriesId: input.seriesId, mediaAssetId: asset.id, artifactRevision: source.sourceRevision, searchableText: `${source.fileName} ${source.kind}`, tagsJson: [source.kind, "local-source"], status: "queued" }).onConflictDoNothing().returning({ id: verticalDramaMediaIndexRecords.id });
    if (indexRecord) void processVerticalDramaMediaIndexRecord(indexRecord.id).catch(() => undefined);
    persisted += 1;
  }
  return persisted;
}
