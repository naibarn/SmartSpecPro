/**
 * Memory Archive Service
 *
 * Persists raw chat turns to encrypted JSONL archives for later search and
 * recovery. Archives are file-backed and tracked in memory_archive_metadata.
 */

import { and, desc, eq, gte, lte, lt } from "drizzle-orm";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDb } from "../db";
import { encrypt, decrypt } from "./crypto";
import { memoryArchiveMetadata } from "../../drizzle/schema";

export interface ArchiveMessageInput {
  tenantId: string;
  userId: number;
  conversationId: number;
  messageId: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: Date | string;
  projectId?: string | null;
  personaId?: string | null;
}

export interface ArchiveRecord {
  messageId: number;
  tenantId: string;
  userId: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  projectId?: string | null;
  personaId?: string | null;
}

export interface ArchiveSearchResult {
  record: ArchiveRecord;
  score: number;
}

export interface ArchiveLookupParams {
  tenantId?: string;
  userId?: number;
  conversationId: number;
  dateFrom?: string;
  dateTo?: string;
  archiveDate?: string;
}

const ARCHIVE_ENCRYPTION_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 7;

function getArchiveRootDir(): string {
  return path.resolve(process.env.CHAT_MEMORY_ARCHIVE_DIR || path.join(process.cwd(), "data", "chat-memory-archives"));
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolveArchivePath(tenantId: string, userId: number, conversationId: number, archiveDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) {
    throw new Error(`Invalid archive date: ${archiveDate}`);
  }

  const root = getArchiveRootDir();
  const resolved = path.resolve(
    root,
    sanitizeSegment(tenantId),
    String(userId),
    String(conversationId),
    `${archiveDate}.jsonl`,
  );

  if (!resolved.startsWith(root + path.sep) && resolved !== path.join(root, `${archiveDate}.jsonl`)) {
    throw new Error("Archive path traversal detected");
  }

  return resolved;
}

function toArchiveDate(value?: Date | string): string {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
}

function toArchiveRecord(input: ArchiveMessageInput): ArchiveRecord {
  return {
    messageId: input.messageId,
    tenantId: input.tenantId,
    userId: input.userId,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: new Date(input.createdAt ?? Date.now()).toISOString(),
    projectId: input.projectId ?? null,
    personaId: input.personaId ?? null,
  };
}

function encodeLine(record: ArchiveRecord): string {
  const encrypted = encrypt(JSON.stringify(record));
  return JSON.stringify({
    version: ARCHIVE_ENCRYPTION_VERSION,
    ciphertext: encrypted,
  });
}

function decodeLine(line: string): ArchiveRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { version?: number; ciphertext?: string };
    if (typeof parsed.ciphertext !== "string") return null;
    const decrypted = decrypt(parsed.ciphertext);
    if (!decrypted) return null;
    const record = JSON.parse(decrypted) as ArchiveRecord;
    if (!record || typeof record.messageId !== "number") return null;
    return record;
  } catch {
    return null;
  }
}

async function loadArchiveRecords(filePath: string): Promise<ArchiveRecord[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .map(decodeLine)
      .filter((item): item is ArchiveRecord => item !== null);
  } catch {
    return [];
  }
}

async function listArchiveFilePaths(params: ArchiveLookupParams): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const filters = [eq(memoryArchiveMetadata.conversationId, params.conversationId)];
  if (typeof params.userId === "number") {
    filters.push(eq(memoryArchiveMetadata.userId, params.userId));
  }
  if (typeof params.tenantId === "string" && params.tenantId.length > 0) {
    filters.push(eq(memoryArchiveMetadata.tenantId, params.tenantId));
  }
  if (params.archiveDate) {
    filters.push(eq(memoryArchiveMetadata.archiveDate, params.archiveDate));
  } else {
    if (params.dateFrom) {
      filters.push(gte(memoryArchiveMetadata.archiveDate, params.dateFrom.slice(0, 10)));
    }
    if (params.dateTo) {
      filters.push(lte(memoryArchiveMetadata.archiveDate, params.dateTo.slice(0, 10)));
    }
  }

  const rows = await db
    .select({
      filePath: memoryArchiveMetadata.filePath,
      archiveDate: memoryArchiveMetadata.archiveDate,
    })
    .from(memoryArchiveMetadata)
    .where(and(...filters))
    .orderBy(desc(memoryArchiveMetadata.archiveDate));

  return rows.map((row) => row.filePath).filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function writeArchiveRecords(filePath: string, records: ArchiveRecord[]): Promise<number> {
  await mkdir(path.dirname(filePath), { recursive: true });

  const lines = records.map(encodeLine).join("\n");
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, lines ? `${lines}\n` : "", "utf-8");
  await rename(tmpPath, filePath);
  const fileStat = await stat(filePath);
  return fileStat.size;
}

async function upsertArchiveMetadata(params: {
  tenantId: string;
  userId: number;
  conversationId: number;
  archiveDate: string;
  filePath: string;
  messageCount: number;
  fileSizeBytes: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(memoryArchiveMetadata)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      conversationId: params.conversationId,
      archiveDate: params.archiveDate,
      filePath: params.filePath,
      messageCount: params.messageCount,
      fileSizeBytes: params.fileSizeBytes,
      encryptionVersion: ARCHIVE_ENCRYPTION_VERSION,
    })
    .onConflictDoUpdate({
      target: [memoryArchiveMetadata.conversationId, memoryArchiveMetadata.archiveDate],
      set: {
        filePath: params.filePath,
        messageCount: params.messageCount,
        fileSizeBytes: params.fileSizeBytes,
        encryptionVersion: ARCHIVE_ENCRYPTION_VERSION,
      },
    });
}

export async function archiveMessages(messages: ArchiveMessageInput[]): Promise<void> {
  if (messages.length === 0) return;

  const grouped = new Map<string, ArchiveRecord[]>();
  for (const message of messages) {
    const archiveDate = toArchiveDate(message.createdAt);
    const filePath = resolveArchivePath(message.tenantId, message.userId, message.conversationId, archiveDate);
    const existing = grouped.get(filePath) ?? [];
    existing.push(toArchiveRecord(message));
    grouped.set(filePath, existing);
  }

  for (const [filePath, nextRecords] of grouped.entries()) {
    const existingRecords = await loadArchiveRecords(filePath);
    const recordMap = new Map(existingRecords.map((record) => [record.messageId, record]));
    for (const record of nextRecords) {
      recordMap.set(record.messageId, record);
    }

    const merged = [...recordMap.values()].sort((a, b) => a.messageId - b.messageId);
    const fileSizeBytes = await writeArchiveRecords(filePath, merged);
    const sample = merged[0];
    if (!sample) continue;

    await upsertArchiveMetadata({
      tenantId: sample.tenantId,
      userId: sample.userId,
      conversationId: sample.conversationId,
      archiveDate: path.basename(filePath, ".jsonl"),
      filePath,
      messageCount: merged.length,
      fileSizeBytes,
    });
  }
}

export async function archiveMessage(message: ArchiveMessageInput): Promise<void> {
  await archiveMessages([message]);
}

export async function readArchive(
  conversationIdOrParams: number | ArchiveLookupParams,
  archiveDate?: string,
): Promise<ArchiveRecord[]> {
  const params: ArchiveLookupParams = typeof conversationIdOrParams === "number"
    ? { conversationId: conversationIdOrParams, archiveDate }
    : conversationIdOrParams;

  const filePaths = await listArchiveFilePaths(params);
  if (filePaths.length === 0) {
    return [];
  }

  const records: ArchiveRecord[] = [];
  for (const filePath of filePaths) {
    const next = await loadArchiveRecords(filePath);
    records.push(...next);
  }

  return records.sort((a, b) => a.messageId - b.messageId);
}

export async function searchArchive(
  conversationIdOrParams: number | (ArchiveLookupParams & { query: string; limit?: number }),
  queryOrArchiveDate?: string,
  archiveDateOrLimit?: string | number,
): Promise<ArchiveSearchResult[]> {
  let params: ArchiveLookupParams;
  let query: string;
  let limit: number | undefined;

  if (typeof conversationIdOrParams === "number") {
    if (typeof queryOrArchiveDate !== "string") {
      return [];
    }
    params = { conversationId: conversationIdOrParams, archiveDate: typeof archiveDateOrLimit === "string" ? archiveDateOrLimit : undefined };
    query = queryOrArchiveDate;
    limit = typeof archiveDateOrLimit === "number" ? archiveDateOrLimit : undefined;
  } else {
    params = conversationIdOrParams;
    query = conversationIdOrParams.query;
    limit = typeof archiveDateOrLimit === "number"
      ? archiveDateOrLimit
      : conversationIdOrParams.limit;
  }

  const records = await readArchive(params);
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    const scored = records.map((record) => ({ record, score: 1 }));
    return typeof limit === "number" ? scored.slice(0, limit) : scored;
  }

  const scored = records
    .map((record) => {
      const haystack = `${record.role} ${record.content}`.toLowerCase();
      const score = haystack.includes(normalizedQuery)
        ? 1 + Math.max(0, 1 - haystack.indexOf(normalizedQuery) / Math.max(haystack.length, 1))
        : 0;
      return { record, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return typeof limit === "number" ? scored.slice(0, limit) : scored;
}

export async function cleanupExpiredArchives(retentionDays?: number): Promise<number>;
export async function cleanupExpiredArchives(tenantId: string, retentionDays?: number): Promise<number>;
export async function cleanupExpiredArchives(
  tenantIdOrRetentionDays?: string | number,
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const tenantId = typeof tenantIdOrRetentionDays === "string" ? tenantIdOrRetentionDays : undefined;
  const effectiveRetentionDays = typeof tenantIdOrRetentionDays === "number"
    ? tenantIdOrRetentionDays
    : retentionDays;

  const cutoff = new Date(Date.now() - Math.max(effectiveRetentionDays, DEFAULT_RETENTION_DAYS) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const filters = [lt(memoryArchiveMetadata.archiveDate, cutoff)];
  if (tenantId) {
    filters.push(eq(memoryArchiveMetadata.tenantId, tenantId));
  }

  const rows = await db
    .select({
      id: memoryArchiveMetadata.id,
      filePath: memoryArchiveMetadata.filePath,
    })
    .from(memoryArchiveMetadata)
    .where(and(...filters));

  for (const row of rows) {
    await rm(row.filePath, { force: true }).catch(() => {});
  }

  if (rows.length > 0) {
    await db.delete(memoryArchiveMetadata).where(lt(memoryArchiveMetadata.archiveDate, cutoff));
  }

  return rows.length;
}

export async function deleteUserArchives(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({
      id: memoryArchiveMetadata.id,
      filePath: memoryArchiveMetadata.filePath,
    })
    .from(memoryArchiveMetadata)
    .where(eq(memoryArchiveMetadata.userId, userId));

  for (const row of rows) {
    await rm(row.filePath, { force: true }).catch(() => {});
  }

  if (rows.length > 0) {
    await db.delete(memoryArchiveMetadata).where(eq(memoryArchiveMetadata.userId, userId));
  }

  return rows.length;
}

export function _resolveArchivePathForTest(
  tenantId: string,
  userId: number,
  conversationId: number,
  archiveDate: string,
): string {
  return resolveArchivePath(tenantId, userId, conversationId, archiveDate);
}
