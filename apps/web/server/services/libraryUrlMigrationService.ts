import { eq, isNull } from "drizzle-orm";

import { libraryItems } from "../../drizzle/schema";
import {
  validateLibraryUrl,
  type LibraryUrlPolicyContext,
  type LibraryUrlRejectReason,
} from "./libraryUrlPolicy";

export type LibraryUrlMigrationMode = "dry-run" | "normalize" | "enforce";
export type LibraryUrlMigrationClassification = "valid" | "needs_normalization" | "blocked";

export interface LibraryUrlMigrationItem {
  id: number;
  tenantId: string;
  itemType: string;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
}

export interface LibraryUrlFieldOutcome {
  original: string | null;
  normalized: string | null;
  classification: LibraryUrlMigrationClassification;
  reason: LibraryUrlRejectReason | null;
}

export interface LibraryUrlRowOutcome {
  item: LibraryUrlMigrationItem;
  classification: LibraryUrlMigrationClassification;
  source: LibraryUrlFieldOutcome;
  thumbnail: LibraryUrlFieldOutcome;
  reasons: LibraryUrlRejectReason[];
}

export interface LibraryUrlMigrationSummary {
  total: number;
  valid: number;
  needs_normalization: number;
  blocked: number;
  by_tenant: Record<string, Pick<LibraryUrlMigrationSummary, "total" | "valid" | "needs_normalization" | "blocked">>;
  by_item_type: Record<string, Pick<LibraryUrlMigrationSummary, "total" | "valid" | "needs_normalization" | "blocked">>;
}

export interface LibraryUrlMigrationReport {
  mode: LibraryUrlMigrationMode;
  summary: LibraryUrlMigrationSummary;
  rows: LibraryUrlRowOutcome[];
  normalized_updates: number;
  enforcement_updates: number;
  snapshot_ref: string;
}

type DbClient = {
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

function emptySummary(): LibraryUrlMigrationSummary {
  return {
    total: 0,
    valid: 0,
    needs_normalization: 0,
    blocked: 0,
    by_tenant: {},
    by_item_type: {},
  };
}

function incrementSummaryBucket(
  bucket: Pick<LibraryUrlMigrationSummary, "total" | "valid" | "needs_normalization" | "blocked">,
  classification: LibraryUrlMigrationClassification,
): void {
  bucket.total += 1;
  if (classification === "valid") bucket.valid += 1;
  if (classification === "needs_normalization") bucket.needs_normalization += 1;
  if (classification === "blocked") bucket.blocked += 1;
}

function ensureBucket(
  target: Record<string, Pick<LibraryUrlMigrationSummary, "total" | "valid" | "needs_normalization" | "blocked">>,
  key: string,
): Pick<LibraryUrlMigrationSummary, "total" | "valid" | "needs_normalization" | "blocked"> {
  if (!target[key]) {
    target[key] = {
      total: 0,
      valid: 0,
      needs_normalization: 0,
      blocked: 0,
    };
  }
  return target[key];
}

function normalizeRawUrl(rawUrl: string | null): string | null {
  if (rawUrl === null || rawUrl === undefined) return null;
  const trimmed = rawUrl.trim();
  return trimmed.length ? trimmed : null;
}

function classifyUrlField(
  rawUrl: string | null,
  context: LibraryUrlPolicyContext,
): LibraryUrlFieldOutcome {
  const normalizedRaw = normalizeRawUrl(rawUrl);
  if (!normalizedRaw) {
    return {
      original: rawUrl,
      normalized: null,
      classification: "valid",
      reason: null,
    };
  }

  const result = validateLibraryUrl(normalizedRaw, context);
  if (!result.ok) {
    return {
      original: rawUrl,
      normalized: null,
      classification: "blocked",
      reason: result.reason,
    };
  }

  const originalComparable = rawUrl === null ? null : rawUrl;
  const needsNormalization = originalComparable !== result.normalizedUrl;
  return {
    original: rawUrl,
    normalized: result.normalizedUrl,
    classification: needsNormalization ? "needs_normalization" : "valid",
    reason: null,
  };
}

export function classifyLibraryUrlRow(item: LibraryUrlMigrationItem): LibraryUrlRowOutcome {
  const source = classifyUrlField(item.sourceUrl, "library_source_url");
  const thumbnail = classifyUrlField(item.thumbnailUrl, "library_thumbnail_url");

  const reasons = [source.reason, thumbnail.reason].filter((value): value is LibraryUrlRejectReason => Boolean(value));

  let classification: LibraryUrlMigrationClassification = "valid";
  if (source.classification === "blocked" || thumbnail.classification === "blocked") {
    classification = "blocked";
  } else if (
    source.classification === "needs_normalization" ||
    thumbnail.classification === "needs_normalization"
  ) {
    classification = "needs_normalization";
  }

  return {
    item,
    classification,
    source,
    thumbnail,
    reasons,
  };
}

export function buildLibraryUrlMigrationPlan(items: LibraryUrlMigrationItem[]): {
  rows: LibraryUrlRowOutcome[];
  summary: LibraryUrlMigrationSummary;
} {
  const summary = emptySummary();
  const rows = items.map((item) => classifyLibraryUrlRow(item));

  for (const row of rows) {
    summary.total += 1;
    if (row.classification === "valid") summary.valid += 1;
    if (row.classification === "needs_normalization") summary.needs_normalization += 1;
    if (row.classification === "blocked") summary.blocked += 1;

    incrementSummaryBucket(ensureBucket(summary.by_tenant, row.item.tenantId), row.classification);
    incrementSummaryBucket(ensureBucket(summary.by_item_type, row.item.itemType), row.classification);
  }

  return {
    rows,
    summary,
  };
}

async function fetchLibraryItemsForMigration(db: DbClient): Promise<LibraryUrlMigrationItem[]> {
  const rows = await db
    .select({
      id: libraryItems.id,
      tenantId: libraryItems.tenantId,
      itemType: libraryItems.itemType,
      sourceUrl: libraryItems.sourceUrl,
      thumbnailUrl: libraryItems.thumbnailUrl,
      metadata: libraryItems.metadata,
    })
    .from(libraryItems)
    .where(isNull(libraryItems.deletedAt));

  return rows.map((row: any) => ({
    id: row.id,
    tenantId: row.tenantId,
    itemType: row.itemType,
    sourceUrl: row.sourceUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));
}

async function applyNormalizationPass(db: DbClient, rows: LibraryUrlRowOutcome[]): Promise<number> {
  const targets = rows.filter((row) => row.classification === "needs_normalization");
  let count = 0;

  for (const row of targets) {
    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (row.source.classification === "needs_normalization") {
      payload.sourceUrl = row.source.normalized;
    }
    if (row.thumbnail.classification === "needs_normalization") {
      payload.thumbnailUrl = row.thumbnail.normalized;
    }

    await db
      .update(libraryItems)
      .set(payload)
      .where(eq(libraryItems.id, row.item.id));

    count += 1;
  }

  return count;
}

async function applyEnforcementPass(db: DbClient, rows: LibraryUrlRowOutcome[]): Promise<number> {
  const targets = rows.filter((row) => row.classification === "blocked");
  let count = 0;

  for (const row of targets) {
    const migrationMeta = {
      blocked_reasons: row.reasons,
      enforced_at: new Date().toISOString(),
      source: "library_url_migration",
    };
    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
      metadata: {
        ...(row.item.metadata || {}),
        security_url_migration: migrationMeta,
      },
    };

    if (row.source.classification === "blocked") {
      payload.sourceUrl = null;
    }
    if (row.thumbnail.classification === "blocked") {
      payload.thumbnailUrl = null;
    }

    await db
      .update(libraryItems)
      .set(payload)
      .where(eq(libraryItems.id, row.item.id));

    count += 1;
  }

  return count;
}

export async function runLibraryUrlMigration(
  db: DbClient,
  options: {
    mode: LibraryUrlMigrationMode;
    snapshotRef?: string;
  },
): Promise<LibraryUrlMigrationReport> {
  const mode = options.mode;
  const snapshotRef =
    options.snapshotRef ||
    `library-url-migration-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

  const items = await fetchLibraryItemsForMigration(db);
  const plan = buildLibraryUrlMigrationPlan(items);

  let normalizedUpdates = 0;
  let enforcementUpdates = 0;

  if (mode === "normalize") {
    normalizedUpdates = await applyNormalizationPass(db, plan.rows);
  } else if (mode === "enforce") {
    enforcementUpdates = await applyEnforcementPass(db, plan.rows);
  }

  return {
    mode,
    summary: plan.summary,
    rows: plan.rows,
    normalized_updates: normalizedUpdates,
    enforcement_updates: enforcementUpdates,
    snapshot_ref: snapshotRef,
  };
}
