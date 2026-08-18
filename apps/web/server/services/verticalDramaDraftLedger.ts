import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  verticalDramaDraftLedgers,
  verticalDramaDraftVersions,
} from "../../drizzle/schema";
import { storagePut } from "../storage";

export type VerticalDramaDraftLedgerStage =
  | "foundation"
  | "compose"
  | "completion"
  | "validation"
  | "qc-baseline"
  | "qc-revision"
  | "qc-final";

export type VerticalDramaDraftJobStatus =
  | "queued"
  | "composing"
  | "ready_for_qc"
  | "qc_running"
  | "passed"
  | "failed"
  | "cancelled"
  | "applied"
  | "archived";

export interface VerticalDramaDraftLedgerOwner {
  tenantId: string;
  userId: number;
}

export interface AppendVerticalDramaDraftVersionInput extends VerticalDramaDraftLedgerOwner {
  draftId: string;
  draftSessionId: string;
  stage: VerticalDramaDraftLedgerStage;
  content: Record<string, unknown>;
  parentVersion?: number;
  jobId?: string;
  runId?: string;
  changedPaths?: string[];
  metadata?: Record<string, unknown>;
}

export interface VerticalDramaDraftVersionRef {
  draftId: string;
  version: number;
  contentHash: string;
  jsonStorageKey: string;
  markdownStorageKey: string;
}

export type PersistVerticalDramaDraftVersion = (
  input: AppendVerticalDramaDraftVersionInput
) => Promise<VerticalDramaDraftVersionRef>;

export interface VerticalDramaDraftJobPatch {
  jobStatus?: VerticalDramaDraftJobStatus;
  compositionJobId?: string | null;
  qcRunId?: string | null;
  lastError?: string | null;
  lastQcScore?: number | null;
  lastQcPassed?: boolean | null;
  archivedAt?: Date | null;
}

const MAX_DRAFT_CONTENT_BYTES = 220_000;

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function contentHash(content: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(content)).digest("hex");
}

function markdownValue(value: unknown, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map(
        item =>
          `${indent}- ${markdownValue(item, depth + 1).replace(/^\s+/, "")}`
      )
      .join("\n");
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => {
      const rendered = markdownValue(item, depth + 1);
      if (rendered.includes("\n")) {
        return `${indent}- **${key}**\n${rendered}`;
      }
      return `${indent}- **${key}:** ${rendered}`;
    })
    .join("\n");
}

/** Render a readable projection without making Markdown the parse contract. */
export function renderVerticalDramaDraftMarkdown(params: {
  draftId: string;
  version: number;
  stage: VerticalDramaDraftLedgerStage;
  contentHash: string;
  content: Record<string, unknown>;
  changedPaths?: string[];
}): string {
  const sections = Object.entries(params.content);
  const body = sections
    .map(([key, value]) => `## ${key}\n\n${markdownValue(value)}\n`)
    .join("\n");
  return [
    "# Vertical Drama Draft",
    "",
    `- draft_id: ${params.draftId}`,
    `- version: ${params.version}`,
    `- stage: ${params.stage}`,
    `- content_hash: ${params.contentHash}`,
    `- changed_paths: ${JSON.stringify(params.changedPaths ?? [])}`,
    "",
    "> This file is an immutable readable projection. The structured JSON snapshot is the system source of truth.",
    "",
    body,
  ].join("\n");
}

/** Create the durable Job Inbox row before a worker is admitted. */
export async function ensureVerticalDramaDraftJob(
  input: AppendVerticalDramaDraftVersionInput & {
    requestJson?: unknown;
    synthesis?: unknown;
  }
): Promise<void> {
  const db = await getDb();
  const requestJson = (input.requestJson ??
    (input.synthesis ? { synthesis: input.synthesis } : {})) as Record<
    string,
    unknown
  >;
  await db
    .insert(verticalDramaDraftLedgers)
    .values({
      id: input.draftId,
      tenantId: input.tenantId,
      userId: input.userId,
      draftSessionId: input.draftSessionId,
      compositionJobId: input.jobId ?? input.draftId,
      jobStatus: "queued",
      requestJson,
      currentVersion: 0,
      currentStage: "created",
      currentJson: {},
    })
    .onConflictDoNothing();
}

export async function updateVerticalDramaDraftJob(
  draftId: string,
  owner: VerticalDramaDraftLedgerOwner,
  patch: VerticalDramaDraftJobPatch
): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .update(verticalDramaDraftLedgers)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaDraftLedgers.id, draftId),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .returning({ id: verticalDramaDraftLedgers.id });
  return Boolean(row);
}

async function lockLedger(
  tx: any,
  input: AppendVerticalDramaDraftVersionInput
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT "tenantId", "userId", "currentVersion"
    FROM "vertical_drama_draft_ledgers"
    WHERE "id" = ${input.draftId}
    FOR UPDATE
  `)) as Array<{ tenantId: string; userId: number; currentVersion: number }>;

  if (rows.length === 0) {
    await tx
      .insert(verticalDramaDraftLedgers)
      .values({
        id: input.draftId,
        tenantId: input.tenantId,
        userId: input.userId,
        draftSessionId: input.draftSessionId,
        currentVersion: 0,
        currentStage: "created",
        currentJson: {},
      })
      .onConflictDoNothing();
    const afterInsert = (await tx.execute(sql`
      SELECT "tenantId", "userId", "currentVersion"
      FROM "vertical_drama_draft_ledgers"
      WHERE "id" = ${input.draftId}
      FOR UPDATE
    `)) as Array<{ tenantId: string; userId: number; currentVersion: number }>;
    if (afterInsert.length === 0)
      throw new Error("Draft ledger could not be created");
    const row = afterInsert[0];
    if (
      row.tenantId !== input.tenantId ||
      Number(row.userId) !== input.userId
    ) {
      throw new Error("Draft ledger ownership conflict");
    }
    return Number(row.currentVersion);
  }

  const row = rows[0];
  if (row.tenantId !== input.tenantId || Number(row.userId) !== input.userId) {
    throw new Error("Draft ledger ownership conflict");
  }
  return Number(row.currentVersion);
}

/**
 * Append one complete snapshot. The database row is advanced only after both
 * immutable storage objects have been written, and the row is locked for the
 * whole sequence allocation. A concurrent worker therefore gets a new version
 * instead of overwriting an earlier draft.
 */
export async function appendVerticalDramaDraftVersion(
  input: AppendVerticalDramaDraftVersionInput
): Promise<VerticalDramaDraftVersionRef> {
  const jsonText = JSON.stringify(input.content);
  if (Buffer.byteLength(jsonText, "utf8") > MAX_DRAFT_CONTENT_BYTES) {
    throw new Error(
      `Draft ledger content exceeds ${MAX_DRAFT_CONTENT_BYTES} bytes`
    );
  }
  if (!input.draftId || !input.draftSessionId) {
    throw new Error("Draft ledger requires draftId and draftSessionId");
  }

  const hash = contentHash(input.content);
  const db = await getDb();
  return db.transaction(async tx => {
    const currentVersion = await lockLedger(tx, input);
    const version = currentVersion + 1;
    const prefix = `vertical-drama-drafts/${safeSegment(input.tenantId)}/${safeSegment(input.draftId)}/versions`;
    const suffix = `v${String(version).padStart(6, "0")}-${safeSegment(input.stage)}`;
    const jsonStorageKey = `${prefix}/${suffix}.json`;
    const markdownStorageKey = `${prefix}/${suffix}.md`;
    const markdown = renderVerticalDramaDraftMarkdown({
      draftId: input.draftId,
      version,
      stage: input.stage,
      contentHash: hash,
      content: input.content,
      changedPaths: input.changedPaths,
    });

    await storagePut(jsonStorageKey, jsonText, "application/json");
    await storagePut(
      markdownStorageKey,
      markdown,
      "text/markdown; charset=utf-8"
    );

    await tx.insert(verticalDramaDraftVersions).values({
      id: randomUUID(),
      draftId: input.draftId,
      version,
      stage: input.stage,
      contentJson: input.content,
      markdown,
      contentHash: hash,
      jsonStorageKey,
      markdownStorageKey,
      parentVersion: input.parentVersion ?? (currentVersion || null),
      jobId: input.jobId,
      runId: input.runId,
      changedPaths: input.changedPaths ?? [],
      metadata: input.metadata ?? {},
    });
    await tx
      .update(verticalDramaDraftLedgers)
      .set({
        currentVersion: version,
        currentStage: input.stage,
        currentJson: input.content,
        currentMarkdownKey: markdownStorageKey,
        currentJsonKey: jsonStorageKey,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaDraftLedgers.id, input.draftId),
          eq(verticalDramaDraftLedgers.currentVersion, currentVersion)
        )
      );

    return {
      draftId: input.draftId,
      version,
      contentHash: hash,
      jsonStorageKey,
      markdownStorageKey,
    };
  });
}

export async function getVerticalDramaDraftLedger(
  draftId: string,
  owner: VerticalDramaDraftLedgerOwner
) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(verticalDramaDraftLedgers)
    .where(
      and(
        eq(verticalDramaDraftLedgers.id, draftId),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getVerticalDramaDraftLedgerBySession(
  draftSessionId: string,
  owner: VerticalDramaDraftLedgerOwner
) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(verticalDramaDraftLedgers)
    .where(
      and(
        eq(verticalDramaDraftLedgers.draftSessionId, draftSessionId),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .orderBy(desc(verticalDramaDraftLedgers.updatedAt))
    .limit(1);
  return row ?? null;
}

/** Durable lookup used when the short-lived Redis QC record has expired. */
export async function getVerticalDramaDraftLedgerByQcRunId(
  qcRunId: string,
  owner: VerticalDramaDraftLedgerOwner
) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(verticalDramaDraftLedgers)
    .where(
      and(
        eq(verticalDramaDraftLedgers.qcRunId, qcRunId),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .orderBy(desc(verticalDramaDraftLedgers.updatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * QC results are immutable Draft-version snapshots. Redis only carries live
 * queue state, so these lookups remain available after Redis TTL expiry or a
 * worker restart.
 */
export async function getVerticalDramaDraftQcSnapshotsByRunId(
  runId: string,
  owner: VerticalDramaDraftLedgerOwner,
  limit = 1
) {
  const db = await getDb();
  return db
    .select({
      draftId: verticalDramaDraftVersions.draftId,
      runId: verticalDramaDraftVersions.runId,
      contentJson: verticalDramaDraftVersions.contentJson,
      metadata: verticalDramaDraftVersions.metadata,
      createdAt: verticalDramaDraftVersions.createdAt,
    })
    .from(verticalDramaDraftVersions)
    .innerJoin(
      verticalDramaDraftLedgers,
      eq(verticalDramaDraftVersions.draftId, verticalDramaDraftLedgers.id)
    )
    .where(
      and(
        eq(verticalDramaDraftVersions.runId, runId),
        eq(verticalDramaDraftVersions.stage, "qc-final"),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .orderBy(desc(verticalDramaDraftVersions.createdAt))
    .limit(Math.max(1, Math.min(limit, 20)));
}

export async function getVerticalDramaDraftQcSnapshotsByDraftId(
  draftId: string,
  owner: VerticalDramaDraftLedgerOwner,
  limit = 10
) {
  const db = await getDb();
  return db
    .select({
      draftId: verticalDramaDraftVersions.draftId,
      runId: verticalDramaDraftVersions.runId,
      contentJson: verticalDramaDraftVersions.contentJson,
      metadata: verticalDramaDraftVersions.metadata,
      createdAt: verticalDramaDraftVersions.createdAt,
    })
    .from(verticalDramaDraftVersions)
    .innerJoin(
      verticalDramaDraftLedgers,
      eq(verticalDramaDraftVersions.draftId, verticalDramaDraftLedgers.id)
    )
    .where(
      and(
        eq(verticalDramaDraftVersions.draftId, draftId),
        eq(verticalDramaDraftVersions.stage, "qc-final"),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .orderBy(desc(verticalDramaDraftVersions.createdAt))
    .limit(Math.max(1, Math.min(limit, 20)));
}

/** Load one immutable Draft candidate with owner scoping for QC selection. */
export async function getVerticalDramaDraftVersion(
  draftId: string,
  version: number,
  owner: VerticalDramaDraftLedgerOwner
) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: verticalDramaDraftVersions.id,
      draftId: verticalDramaDraftVersions.draftId,
      version: verticalDramaDraftVersions.version,
      stage: verticalDramaDraftVersions.stage,
      contentJson: verticalDramaDraftVersions.contentJson,
      contentHash: verticalDramaDraftVersions.contentHash,
      runId: verticalDramaDraftVersions.runId,
      metadata: verticalDramaDraftVersions.metadata,
      createdAt: verticalDramaDraftVersions.createdAt,
    })
    .from(verticalDramaDraftVersions)
    .innerJoin(
      verticalDramaDraftLedgers,
      eq(verticalDramaDraftVersions.draftId, verticalDramaDraftLedgers.id)
    )
    .where(
      and(
        eq(verticalDramaDraftVersions.draftId, draftId),
        eq(verticalDramaDraftVersions.version, version),
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Lightweight server-owned recovery index; the full draft is loaded only after selection. */
export async function listVerticalDramaDraftLedgers(
  owner: VerticalDramaDraftLedgerOwner,
  limit = 50,
  includeArchived = false
) {
  const db = await getDb();
  const rows = await db
    .select({
      id: verticalDramaDraftLedgers.id,
      jobCode: verticalDramaDraftLedgers.jobCode,
      draftSessionId: verticalDramaDraftLedgers.draftSessionId,
      jobStatus: verticalDramaDraftLedgers.jobStatus,
      compositionJobId: verticalDramaDraftLedgers.compositionJobId,
      qcRunId: verticalDramaDraftLedgers.qcRunId,
      lastError: verticalDramaDraftLedgers.lastError,
      lastQcScore: verticalDramaDraftLedgers.lastQcScore,
      lastQcPassed: verticalDramaDraftLedgers.lastQcPassed,
      currentVersion: verticalDramaDraftLedgers.currentVersion,
      currentStage: verticalDramaDraftLedgers.currentStage,
      // Keep the recovery index metadata-only. The full request/current Draft
      // snapshots are loaded by getDraftJob after the user selects a row.
      title: sql<
        string | null
      >`${verticalDramaDraftLedgers.currentJson}->>'title'`,
      logline: sql<
        string | null
      >`${verticalDramaDraftLedgers.currentJson}->>'logline'`,
      updatedAt: verticalDramaDraftLedgers.updatedAt,
      archivedAt: verticalDramaDraftLedgers.archivedAt,
    })
    .from(verticalDramaDraftLedgers)
    .where(
      and(
        eq(verticalDramaDraftLedgers.tenantId, owner.tenantId),
        eq(verticalDramaDraftLedgers.userId, owner.userId),
        ...(includeArchived
          ? []
          : [isNull(verticalDramaDraftLedgers.archivedAt)])
      )
    )
    .orderBy(desc(verticalDramaDraftLedgers.updatedAt))
    .limit(Math.max(1, Math.min(limit, 50)));

  return rows.map(row => {
    return {
      id: row.id,
      jobCode: row.jobCode,
      draftSessionId: row.draftSessionId,
      jobStatus: row.jobStatus,
      compositionJobId: row.compositionJobId,
      qcRunId: row.qcRunId,
      lastError: row.lastError,
      lastQcScore: row.lastQcScore,
      lastQcPassed: row.lastQcPassed,
      currentVersion: row.currentVersion,
      currentStage: row.currentStage,
      title: row.title,
      logline: row.logline,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
    };
  });
}

export async function archiveVerticalDramaDraftJob(
  draftId: string,
  owner: VerticalDramaDraftLedgerOwner
): Promise<boolean> {
  return updateVerticalDramaDraftJob(draftId, owner, {
    jobStatus: "archived",
    archivedAt: new Date(),
  });
}
