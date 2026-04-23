import { createHash } from "node:crypto";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryChunks,
  libraryItems,
  libraryKnowledgeBackfillRuns,
  libraryKnowledgeNotes,
  libraryKnowledgeRelations,
  type InsertLibraryKnowledgeNote,
  type InsertLibraryKnowledgeRelation,
} from "../../drizzle/schema";
import {
  extractLibraryMarkdownKnowledge,
  normalizeLibraryKnowledgeLogicalPath,
  resolveLibraryKnowledgeReference,
  type LibraryKnowledgeCandidate,
} from "./libraryKnowledgeGraphService";

export const libraryKnowledgeRefreshReasonValues = [
  "markdown_save",
  "item_update",
  "restore",
  "permission_change",
] as const;

export type LibraryKnowledgeRefreshReason =
  typeof libraryKnowledgeRefreshReasonValues[number];

export interface LibraryKnowledgeRefreshMetadataInput {
  reason: LibraryKnowledgeRefreshReason;
  actorUserId: number | null;
  fieldKeys?: string[];
}

export interface LibraryKnowledgeBackfillProgressInput {
  totalNotes: number;
  processedNotes: number;
  successfulNotes: number;
  failedNotes: number;
  retryCount: number;
}

export interface LibraryKnowledgeBackfillProgress {
  coveragePercent: number;
  remainingNotes: number;
  hasFailures: boolean;
  retryCount: number;
}

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

interface LibraryKnowledgeBackfillItem {
  id: number;
  tenantId: string;
  title: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
}

export interface BuildLibraryKnowledgeCacheRowsInput {
  item: LibraryKnowledgeBackfillItem;
  markdown: string;
  candidates: LibraryKnowledgeCandidate[];
  extractedAt?: Date;
}

export interface LibraryKnowledgeCacheRows {
  note: InsertLibraryKnowledgeNote;
  relations: InsertLibraryKnowledgeRelation[];
}

export interface RunLibraryKnowledgeBackfillInput {
  tenantId: string | number;
  requestedByUserId?: number | null;
  limit?: number;
  runId?: number;
  retryCount?: number;
}

export interface RunLibraryKnowledgeBackfillResult {
  runId: number;
  status: "completed" | "failed";
  processedNoteIds: number[];
  failedNotes: Array<{
    libraryItemId: number;
    error: string;
  }>;
  progress: LibraryKnowledgeBackfillProgress;
}

export interface RefreshLibraryKnowledgeItemInput {
  tenantId: string | number;
  libraryItemId: number;
}

export interface RefreshLibraryKnowledgeItemResult {
  libraryItemId: number;
  refreshed: boolean;
  relationCount: number;
  skippedReason: "not_found" | "not_markdown" | null;
}

export function buildLibraryKnowledgeRefreshMetadata(
  input: LibraryKnowledgeRefreshMetadataInput,
): Record<string, unknown> {
  const fieldKeys = Array.from(
    new Set((input.fieldKeys ?? []).map((field) => field.trim()).filter(Boolean)),
  ).sort();

  return {
    knowledgeRefresh: {
      reason: input.reason,
      actorUserId: input.actorUserId,
      ...(fieldKeys.length > 0 ? { fieldKeys } : {}),
    },
  };
}

export function summarizeLibraryKnowledgeBackfillProgress(
  input: LibraryKnowledgeBackfillProgressInput,
): LibraryKnowledgeBackfillProgress {
  const totalNotes = Math.max(0, input.totalNotes);
  const processedNotes = Math.max(0, Math.min(input.processedNotes, totalNotes));

  return {
    coveragePercent: totalNotes === 0
      ? 100
      : Math.round((processedNotes / totalNotes) * 100),
    remainingNotes: Math.max(0, totalNotes - processedNotes),
    hasFailures: input.failedNotes > 0,
    retryCount: Math.max(0, input.retryCount),
  };
}

function normalizeTenantId(tenantId: string | number): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLogicalPathFromMetadata(
  metadata: Record<string, unknown>,
): string | null {
  const raw =
    typeof metadata.logical_path === "string"
      ? metadata.logical_path
      : typeof metadata.logicalPath === "string"
        ? metadata.logicalPath
        : "";
  const normalized = normalizeLibraryKnowledgeLogicalPath(raw);
  return normalized || null;
}

function fingerprintMarkdown(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function buildLibraryKnowledgeCacheRows(
  input: BuildLibraryKnowledgeCacheRowsInput,
): LibraryKnowledgeCacheRows {
  const extractedAt = input.extractedAt ?? new Date();
  const extracted = extractLibraryMarkdownKnowledge(input.markdown);
  const logicalPath = normalizeLogicalPathFromMetadata(input.item.metadata);
  const diagnostics = {
    references: {
      total: extracted.references.length,
      unresolved: 0,
      ambiguous: 0,
      forbidden: 0,
    },
  };

  const relations = extracted.references.map((reference) => {
    const resolution = resolveLibraryKnowledgeReference(
      reference.target,
      input.candidates,
    );
    if (resolution.status === "unresolved") {
      diagnostics.references.unresolved += 1;
    } else if (resolution.status === "ambiguous") {
      diagnostics.references.ambiguous += 1;
    } else if (resolution.status === "forbidden") {
      diagnostics.references.forbidden += 1;
    }

    return {
      tenantId: input.item.tenantId,
      sourceLibraryItemId: input.item.id,
      targetLibraryItemId: resolution.targetLibraryItemId,
      relationKind: reference.kind,
      rawReference: reference.raw,
      displayText: reference.displayText,
      targetPath: reference.targetPath,
      targetHeading: reference.targetHeading,
      resolutionStatus: resolution.status,
      matchedBy: resolution.matchedBy,
      matchedValue: resolution.matchedValue,
      candidateLibraryItemIds: resolution.candidateIds,
      diagnostics: {},
      extractedAt,
      updatedAt: extractedAt,
    } satisfies InsertLibraryKnowledgeRelation;
  });

  return {
    note: {
      libraryItemId: input.item.id,
      tenantId: input.item.tenantId,
      logicalPath,
      normalizedTitle: normalizeTitle(input.item.title),
      aliases: extracted.aliases,
      tags: extracted.tags,
      properties: extracted.frontmatter,
      headings: extracted.headings,
      diagnostics,
      contentFingerprint: fingerprintMarkdown(input.markdown),
      sourceUpdatedAt: input.item.updatedAt,
      lastExtractedAt: extractedAt,
      lastVisibilityRefreshAt: extractedAt,
      lastBackfilledAt: extractedAt,
      isStale: false,
      staleReason: null,
      updatedAt: extractedAt,
    },
    relations,
  };
}

async function countTenantMarkdownNotes(
  db: DbClient,
  tenantId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, tenantId),
        eq(libraryItems.itemType, "md"),
        isNull(libraryItems.deletedAt),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

async function loadTenantMarkdownItems(
  db: DbClient,
  tenantId: string,
  limit?: number,
): Promise<LibraryKnowledgeBackfillItem[]> {
  const query = db
    .select({
      id: libraryItems.id,
      tenantId: libraryItems.tenantId,
      title: libraryItems.title,
      metadata: libraryItems.metadata,
      updatedAt: libraryItems.updatedAt,
    })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.tenantId, tenantId),
        eq(libraryItems.itemType, "md"),
        isNull(libraryItems.deletedAt),
      ),
    )
    .orderBy(asc(libraryItems.id));

  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((row) => ({
    ...row,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? row.metadata as Record<string, unknown>
        : {},
  }));
}

async function loadMarkdownSourceContent(
  db: DbClient,
  tenantId: string,
  itemIds: number[],
): Promise<Map<number, string>> {
  if (!itemIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      libraryItemId: libraryChunks.libraryItemId,
      content: libraryChunks.content,
    })
    .from(libraryChunks)
    .where(
      and(
        eq(libraryChunks.tenantId, tenantId),
        inArray(libraryChunks.libraryItemId, itemIds),
        eq(libraryChunks.chunkIndex, 0),
        eq(libraryChunks.contentType, "markdown_source"),
      ),
    );

  return new Map(rows.map((row) => [row.libraryItemId, row.content]));
}

async function loadExistingKnowledgeAliases(
  db: DbClient,
  tenantId: string,
): Promise<Map<number, string[]>> {
  const rows = await db
    .select({
      libraryItemId: libraryKnowledgeNotes.libraryItemId,
      aliases: libraryKnowledgeNotes.aliases,
    })
    .from(libraryKnowledgeNotes)
    .where(eq(libraryKnowledgeNotes.tenantId, tenantId));

  return new Map(
    rows.map((row) => [
      row.libraryItemId,
      Array.isArray(row.aliases) ? row.aliases : [],
    ]),
  );
}

async function createBackfillRun(
  db: DbClient,
  input: RunLibraryKnowledgeBackfillInput,
  tenantId: string,
  totalNotes: number,
): Promise<number> {
  if (input.runId) {
    await db
      .update(libraryKnowledgeBackfillRuns)
      .set({
        status: "running",
        totalNotes,
        retryCount: input.retryCount ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(libraryKnowledgeBackfillRuns.id, input.runId));
    return input.runId;
  }

  const [created] = await db
    .insert(libraryKnowledgeBackfillRuns)
    .values({
      tenantId,
      requestedByUserId: input.requestedByUserId ?? null,
      status: "running",
      totalNotes,
      retryCount: input.retryCount ?? 0,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: libraryKnowledgeBackfillRuns.id });

  return created?.id ?? 0;
}

async function persistKnowledgeRows(
  db: DbClient,
  rows: LibraryKnowledgeCacheRows,
): Promise<void> {
  await db
    .insert(libraryKnowledgeNotes)
    .values(rows.note)
    .onConflictDoUpdate({
      target: libraryKnowledgeNotes.libraryItemId,
      set: {
        logicalPath: rows.note.logicalPath,
        normalizedTitle: rows.note.normalizedTitle,
        aliases: rows.note.aliases,
        tags: rows.note.tags,
        properties: rows.note.properties,
        headings: rows.note.headings,
        diagnostics: rows.note.diagnostics,
        contentFingerprint: rows.note.contentFingerprint,
        sourceUpdatedAt: rows.note.sourceUpdatedAt,
        lastExtractedAt: rows.note.lastExtractedAt,
        lastVisibilityRefreshAt: rows.note.lastVisibilityRefreshAt,
        lastBackfilledAt: rows.note.lastBackfilledAt,
        isStale: false,
        staleReason: null,
        updatedAt: rows.note.updatedAt,
      },
    });

  await db
    .delete(libraryKnowledgeRelations)
    .where(
      eq(
        libraryKnowledgeRelations.sourceLibraryItemId,
        rows.note.libraryItemId,
      ),
    );

  if (rows.relations.length > 0) {
    await db.insert(libraryKnowledgeRelations).values(rows.relations);
  }
}

export async function runLibraryKnowledgeBackfill(
  input: RunLibraryKnowledgeBackfillInput,
  dbClient?: DbClient,
): Promise<RunLibraryKnowledgeBackfillResult> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(input.tenantId);
  const limit = input.limit
    ? Math.min(Math.max(input.limit, 1), 5_000)
    : undefined;
  const totalNotes = await countTenantMarkdownNotes(db, tenantId);
  const runId = await createBackfillRun(db, input, tenantId, totalNotes);
  const items = await loadTenantMarkdownItems(db, tenantId, limit);
  const itemIds = items.map((item) => item.id);
  const markdownByItemId = await loadMarkdownSourceContent(db, tenantId, itemIds);
  const existingAliases = await loadExistingKnowledgeAliases(db, tenantId);
  const extractedAliases = new Map<number, string[]>();

  for (const item of items) {
    const extracted = extractLibraryMarkdownKnowledge(
      markdownByItemId.get(item.id) ?? "",
    );
    extractedAliases.set(item.id, extracted.aliases);
  }

  const candidates: LibraryKnowledgeCandidate[] = items.map((item) => ({
    libraryItemId: item.id,
    title: item.title,
    logicalPath: normalizeLogicalPathFromMetadata(item.metadata),
    aliases: extractedAliases.get(item.id) ?? existingAliases.get(item.id) ?? [],
    isReadable: true,
  }));

  const processedNoteIds: number[] = [];
  const failedNotes: RunLibraryKnowledgeBackfillResult["failedNotes"] = [];

  for (const item of items) {
    try {
      const rows = buildLibraryKnowledgeCacheRows({
        item,
        markdown: markdownByItemId.get(item.id) ?? "",
        candidates,
      });
      await persistKnowledgeRows(db, rows);
      processedNoteIds.push(item.id);
    } catch (error) {
      failedNotes.push({
        libraryItemId: item.id,
        error: errorMessage(error),
      });
    }
  }

  const status = failedNotes.length > 0 ? "failed" : "completed";
  await db
    .update(libraryKnowledgeBackfillRuns)
    .set({
      status,
      processedNotes: processedNoteIds.length + failedNotes.length,
      successfulNotes: processedNoteIds.length,
      failedNotes: failedNotes.length,
      lastCursorLibraryItemId: itemIds.at(-1) ?? null,
      lastError: failedNotes[0]?.error ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(libraryKnowledgeBackfillRuns.id, runId));

  return {
    runId,
    status,
    processedNoteIds,
    failedNotes,
    progress: summarizeLibraryKnowledgeBackfillProgress({
      totalNotes,
      processedNotes: processedNoteIds.length + failedNotes.length,
      successfulNotes: processedNoteIds.length,
      failedNotes: failedNotes.length,
      retryCount: input.retryCount ?? 0,
    }),
  };
}

async function purgeKnowledgeRowsForItem(
  db: DbClient,
  tenantId: string,
  libraryItemId: number,
): Promise<void> {
  await db
    .delete(libraryKnowledgeRelations)
    .where(
      and(
        eq(libraryKnowledgeRelations.tenantId, tenantId),
        eq(libraryKnowledgeRelations.sourceLibraryItemId, libraryItemId),
      ),
    );

  await db
    .delete(libraryKnowledgeNotes)
    .where(
      and(
        eq(libraryKnowledgeNotes.tenantId, tenantId),
        eq(libraryKnowledgeNotes.libraryItemId, libraryItemId),
      ),
    );
}

export async function refreshLibraryKnowledgeItem(
  input: RefreshLibraryKnowledgeItemInput,
  dbClient?: DbClient,
): Promise<RefreshLibraryKnowledgeItemResult> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(input.tenantId);
  const allItems = await loadTenantMarkdownItems(db, tenantId);
  const item = allItems.find((candidate) => candidate.id === input.libraryItemId);
  if (!item) {
    const existingRows = await db
      .select({
        id: libraryItems.id,
        itemType: libraryItems.itemType,
      })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.tenantId, tenantId),
          eq(libraryItems.id, input.libraryItemId),
          isNull(libraryItems.deletedAt),
        ),
      )
      .limit(1);
    await purgeKnowledgeRowsForItem(db, tenantId, input.libraryItemId);
    return {
      libraryItemId: input.libraryItemId,
      refreshed: false,
      relationCount: 0,
      skippedReason: existingRows[0] ? "not_markdown" : "not_found",
    };
  }

  const markdownByItemId = await loadMarkdownSourceContent(
    db,
    tenantId,
    [input.libraryItemId],
  );
  const markdown = markdownByItemId.get(input.libraryItemId) ?? "";
  if (!markdown.trim()) {
    await purgeKnowledgeRowsForItem(db, tenantId, input.libraryItemId);
    return {
      libraryItemId: input.libraryItemId,
      refreshed: false,
      relationCount: 0,
      skippedReason: "not_markdown",
    };
  }
  const extracted = extractLibraryMarkdownKnowledge(markdown);
  const existingAliases = await loadExistingKnowledgeAliases(db, tenantId);
  const candidates: LibraryKnowledgeCandidate[] = allItems.map((candidate) => ({
    libraryItemId: candidate.id,
    title: candidate.title,
    logicalPath: normalizeLogicalPathFromMetadata(candidate.metadata),
    aliases:
      candidate.id === input.libraryItemId
        ? extracted.aliases
        : existingAliases.get(candidate.id) ?? [],
    isReadable: true,
  }));
  const rows = buildLibraryKnowledgeCacheRows({
    item,
    markdown,
    candidates,
  });
  await persistKnowledgeRows(db, rows);

  return {
    libraryItemId: input.libraryItemId,
    refreshed: true,
    relationCount: rows.relations.length,
    skippedReason: null,
  };
}
