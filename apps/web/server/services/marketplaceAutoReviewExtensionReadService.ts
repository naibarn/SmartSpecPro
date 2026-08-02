/**
 * Marketplace Auto Review — read-only extension-facing service.
 *
 * Backs the Chrome extension side panel's "Auto Review" tab. Mirrors the
 * Drama Series extension read pattern in `verticalDramaExtensionReadService.ts`
 * and `server/routes/marketplaceCapture.ts`: every query is scoped to the
 * caller's `(tenantId, userId)`, ownership is verified before returning any
 * row, and an unowned id resolves to a 404 (never a 403, to avoid disclosing
 * existence of another tenant's/user's data).
 *
 * This service is READ-ONLY — it never inserts, updates, or deletes rows.
 */

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import {
  marketplaceAutoReviewRuns,
  marketplaceCaptureAssets,
  marketplaceProductImages,
  marketplaceProducts,
} from "../../drizzle/schema";
import { StagedSequentialStoryboardMetadataV1Schema } from "@shared/marketplaceAutoReview/stagedContracts";
import { getStagedAutoReviewCheckpointState } from "./marketplaceAutoReviewStagedCheckpointRouterService";

interface ExtensionAuth {
  userId: number;
  tenantId?: string;
}

function tenantAccessClause(auth: ExtensionAuth) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return undefined;
  return or(
    eq(marketplaceAutoReviewRuns.tenantId, tenantId),
    isNull(marketplaceAutoReviewRuns.tenantId),
  );
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Resolve a scoped set of productIds -> { productName, thumbnailUrl }, in a small fixed number of queries. */
async function loadProductSummaries(
  db: DrizzleDB,
  auth: ExtensionAuth,
  productIds: string[],
): Promise<Map<string, { productName: string; thumbnailUrl: string | null }>> {
  const map = new Map<string, { productName: string; thumbnailUrl: string | null }>();
  const uniqueProductIds = Array.from(new Set(productIds));
  if (uniqueProductIds.length === 0) return map;

  const productRows = await db
    .select({
      id: marketplaceProducts.id,
      productName: marketplaceProducts.productName,
      coverImageAssetId: marketplaceProducts.coverImageAssetId,
    })
    .from(marketplaceProducts)
    .where(and(
      inArray(marketplaceProducts.id, uniqueProductIds),
      eq(marketplaceProducts.userId, auth.userId),
    ));

  const coverAssetIds = productRows
    .map((row) => row.coverImageAssetId)
    .filter((id): id is string => Boolean(id));
  const coverUrlByAssetId = new Map<string, string | null>();
  if (coverAssetIds.length > 0) {
    const assetRows = await db
      .select({ id: marketplaceCaptureAssets.id, url: marketplaceCaptureAssets.url })
      .from(marketplaceCaptureAssets)
      .where(and(
        inArray(marketplaceCaptureAssets.id, coverAssetIds),
        eq(marketplaceCaptureAssets.userId, auth.userId),
      ));
    for (const row of assetRows) coverUrlByAssetId.set(row.id, row.url ?? null);
  }

  const productIdsMissingCover = productRows
    .filter((row) => !row.coverImageAssetId || !coverUrlByAssetId.get(row.coverImageAssetId))
    .map((row) => row.id);
  const fallbackUrlByProductId = new Map<string, string | null>();
  if (productIdsMissingCover.length > 0) {
    const imageRows = await db
      .select({
        productId: marketplaceProductImages.productId,
        url: marketplaceProductImages.url,
      })
      .from(marketplaceProductImages)
      .where(inArray(marketplaceProductImages.productId, productIdsMissingCover))
      .orderBy(asc(marketplaceProductImages.productId), asc(marketplaceProductImages.sortOrder));
    for (const row of imageRows) {
      if (!fallbackUrlByProductId.has(row.productId)) fallbackUrlByProductId.set(row.productId, row.url ?? null);
    }
  }

  for (const row of productRows) {
    const coverUrl = row.coverImageAssetId ? coverUrlByAssetId.get(row.coverImageAssetId) ?? null : null;
    const thumbnailUrl = coverUrl ?? fallbackUrlByProductId.get(row.id) ?? null;
    map.set(row.id, { productName: row.productName, thumbnailUrl });
  }
  return map;
}

function countReadyShots(metadataJson: unknown): { shotsReadyCount: number | null; shotsTotal: number } {
  const parsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(metadataJson);
  if (!parsed.success) return { shotsReadyCount: null, shotsTotal: 9 };
  const shots = parsed.data.stagedSequentialStoryboard.shots;
  return {
    shotsReadyCount: shots.filter((shot) => shot.state === "approved").length,
    shotsTotal: shots.length,
  };
}

/* -------------------------------------------------------------------------- */
/* 1. List auto review projects                                              */
/* -------------------------------------------------------------------------- */

export interface AutoReviewProjectSummary {
  id: string;
  productId: string;
  productName: string;
  thumbnailUrl: string | null;
  status: string;
  shotsReadyCount: number | null;
  shotsTotal: number;
  updatedAt: Date;
  createdAt: Date;
}

export async function listMarketplaceAutoReviewProjectsForExtension(
  auth: ExtensionAuth,
  input: { query?: string; limit?: number },
): Promise<{ projects: AutoReviewProjectSummary[] }> {
  const db = getDb();
  const limit = Math.min(Math.max(Number(input.limit ?? 30) || 30, 1), 50);

  const runRows = await db
    .select({
      id: marketplaceAutoReviewRuns.id,
      productId: marketplaceAutoReviewRuns.productId,
      status: marketplaceAutoReviewRuns.status,
      metadataJson: marketplaceAutoReviewRuns.metadataJson,
      updatedAt: marketplaceAutoReviewRuns.updatedAt,
      createdAt: marketplaceAutoReviewRuns.createdAt,
    })
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.userId, auth.userId),
      tenantAccessClause(auth),
    ))
    .orderBy(desc(marketplaceAutoReviewRuns.updatedAt));

  const productSummaryById = await loadProductSummaries(
    db,
    auth,
    runRows.map((row) => row.productId),
  );

  const query = String(input.query ?? "").trim().toLowerCase();
  const projects = runRows
    .map((row): AutoReviewProjectSummary => {
      const product = productSummaryById.get(row.productId);
      const { shotsReadyCount, shotsTotal } = countReadyShots(row.metadataJson);
      return {
        id: row.id,
        productId: row.productId,
        productName: product?.productName ?? "",
        thumbnailUrl: product?.thumbnailUrl ?? null,
        status: row.status,
        shotsReadyCount,
        shotsTotal,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      };
    })
    .filter((project) => !query || [
      project.productName,
      project.id,
      project.status,
    ].join(" ").toLowerCase().includes(query))
    .slice(0, limit);

  return { projects };
}

/* -------------------------------------------------------------------------- */
/* 2. Single project shot detail                                             */
/* -------------------------------------------------------------------------- */

export interface AutoReviewShot {
  shotId: number;
  title: string | null;
  storySummary: string | null;
  dialogue: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  imageArtifactUrl: string | null;
  videoArtifactUrl: string | null;
  state: string;
}

export interface AutoReviewProjectDetail {
  id: string;
  productId: string;
  productName: string;
  status: string;
  updatedAt: Date;
  shots: AutoReviewShot[];
}

export async function getMarketplaceAutoReviewProjectForExtension(
  auth: ExtensionAuth,
  runId: string,
): Promise<{ project: AutoReviewProjectDetail }> {
  const db = getDb();

  const [run] = await db
    .select({
      id: marketplaceAutoReviewRuns.id,
      productId: marketplaceAutoReviewRuns.productId,
      status: marketplaceAutoReviewRuns.status,
      updatedAt: marketplaceAutoReviewRuns.updatedAt,
    })
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.id, runId),
      eq(marketplaceAutoReviewRuns.userId, auth.userId),
      tenantAccessClause(auth),
    ))
    .limit(1);
  if (!run) {
    throw Object.assign(new Error("Auto review project not found"), { status: 404, code: "not_found" });
  }

  const [productRow] = await db
    .select({ productName: marketplaceProducts.productName })
    .from(marketplaceProducts)
    .where(and(
      eq(marketplaceProducts.id, run.productId),
      eq(marketplaceProducts.userId, auth.userId),
    ))
    .limit(1);

  const checkpointState = await getStagedAutoReviewCheckpointState(runId, {
    userId: auth.userId,
    tenantId: auth.tenantId,
  });

  const shots: AutoReviewShot[] = checkpointState.shots.map((shot): AutoReviewShot => ({
    shotId: Number(shot.shotId),
    title: toStringOrNull(shot.title),
    storySummary: toStringOrNull(shot.storySummary),
    dialogue: toStringOrNull(shot.dialogue),
    imagePrompt: toStringOrNull(shot.imagePrompt),
    videoPrompt: toStringOrNull(shot.videoPrompt),
    imageArtifactUrl: toStringOrNull(shot.imageArtifactUrl),
    videoArtifactUrl: toStringOrNull(shot.videoArtifactUrl),
    state: String(shot.state),
  }));

  return {
    project: {
      id: run.id,
      productId: run.productId,
      productName: productRow?.productName ?? "",
      status: run.status,
      updatedAt: run.updatedAt,
      shots,
    },
  };
}
