import crypto from "node:crypto";
import { and, desc, eq, lt, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  verticalDramaSpecialTieInDebugEvents,
  type InsertVerticalDramaSpecialTieInDebugEventRow,
} from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";

export type SpecialTieInForensicEventType =
  | "job_queued" | "job_started" | "skill_loaded" | "input_captured"
  | "llm_request_started" | "llm_response_received" | "json_parse_failed"
  | "schema_validation_failed" | "semantic_validation_failed" | "retry_decided"
  | "output_accepted" | "output_rejected" | "persistence_started"
  | "persistence_succeeded" | "persistence_failed" | "job_succeeded"
  | "job_failed" | "fallback_materialized" | "heartbeat";

export type SpecialTieInForensicContext = {
  tenantId: string; userId: number; seriesId: number; episodeId: number;
  jobId: string; traceId: string; createIntentId?: string; inputVersion?: number;
  skillSlug?: string; skillVersion?: string;
};

export type ForensicPayload = {
  text: string; sha256: string; charCount: number; redacted: boolean;
};

const SECRET_KEY = /(authorization|api[-_]?key|secret|password|cookie|credential|signature|signed|access[-_]?token|refresh[-_]?token|id[-_]?token|(^|[_-])tokens?$)/i;
const INLINE_SECRET = /\b(Bearer\s+|sk-[A-Za-z0-9_-]{12,}|token[=:]\s*)[^\s,;"']+/gi;
const SIGNED_QUERY = /^(x-amz-|x-goog-|sig$|signature$|token$|expires$|exp$|se$|auth)/i;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function redactString(value: string): { value: string; changed: boolean } {
  let changed = false;
  let output = value.replace(INLINE_SECRET, match => {
    changed = true;
    return `[REDACTED_SECRET:${hash(match).slice(0, 12)}]`;
  });
  output = output.replace(/https?:\/\/[^\s"'<>]+/gi, match => {
    try {
      const url = new URL(match);
      if (!["http:", "https:"].includes(url.protocol)) return match;
      if (![...url.searchParams.keys()].some(k => SIGNED_QUERY.test(k))) return match;
      const queryHash = hash(url.search);
      url.search = `?redacted_query_hash=${queryHash}`;
      changed = true;
      return url.toString();
    } catch {
      return match;
    }
  });
  return { value: output, changed };
}

export function redactForensicValue(value: unknown, key?: string): { value: unknown; changed: boolean } {
  if (key && SECRET_KEY.test(key)) {
    return { value: "[REDACTED_SECRET]", changed: true };
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map(item => {
      const redacted = redactForensicValue(item);
      changed ||= redacted.changed;
      return redacted.value;
    });
    return { value: result, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const redacted = redactForensicValue(childValue, childKey);
      changed ||= redacted.changed;
      result[childKey] = redacted.value;
    }
    return { value: result, changed };
  }
  return { value, changed: false };
}

export function serializeForensicPayload(value: unknown): ForensicPayload {
  const redacted = redactForensicValue(value);
  const text = typeof redacted.value === "string"
    ? redacted.value
    : JSON.stringify(redacted.value ?? null);
  return { text, sha256: hash(text), charCount: text.length, redacted: redacted.changed };
}

export type SpecialTieInForensicEvent = Partial<Omit<InsertVerticalDramaSpecialTieInDebugEventRow, "id" | "createdAt" | "expiresAt" | "sequence" | "eventType">> & {
  eventType: SpecialTieInForensicEventType;
  expiresAt?: Date;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

export function createSpecialTieInForensicRecorder(
  context: SpecialTieInForensicContext,
  deps: {
    persist?: (row: InsertVerticalDramaSpecialTieInDebugEventRow) => Promise<unknown>;
    audit?: (event: Record<string, unknown>) => void;
    now?: () => Date;
  } = {},
) {
  let sequence = 0;
  const now = deps.now ?? (() => new Date());
  const persist = deps.persist ?? (async (row: InsertVerticalDramaSpecialTieInDebugEventRow) => {
    const db = await getDb();
    if (!db) return;
    await db.insert(verticalDramaSpecialTieInDebugEvents).values(row);
  });
  const audit = deps.audit ?? ((event: Record<string, unknown>) => {
    auditLogger.log({
      eventType: "vd_special_tie_in_event",
      userId: context.userId,
      traceId: context.traceId,
      metadata: event,
    });
  });

  return {
    async emit(input: SpecialTieInForensicEvent): Promise<{ sequence: number } | null> {
      const createdAt = now();
      const request = input.requestPayload === undefined ? undefined : serializeForensicPayload(input.requestPayload);
      const response = input.responsePayload === undefined ? undefined : serializeForensicPayload(input.responsePayload);
      const parsed = input.parsedOutput === undefined ? undefined : redactForensicValue(input.parsedOutput);
      const schemaIssues = input.schemaIssues === undefined ? undefined : redactForensicValue(input.schemaIssues);
      const metadata = input.metadata === undefined ? undefined : redactForensicValue(input.metadata);
      const eventSequence = ++sequence;
      const row = {
        ...context,
        ...input,
        sequence: eventSequence,
        requestPayload: request?.text ?? input.requestPayload,
        responsePayload: response?.text ?? input.responsePayload,
        requestHash: request?.sha256 ?? input.requestHash,
        responseHash: response?.sha256 ?? input.responseHash,
        requestCharCount: request?.charCount ?? input.requestCharCount,
        responseCharCount: response?.charCount ?? input.responseCharCount,
        requestRedacted: request?.redacted ?? input.requestRedacted ?? false,
        responseRedacted: response?.redacted ?? input.responseRedacted ?? false,
        parsedOutput: parsed?.value,
        schemaIssues: schemaIssues?.value,
        metadata: metadata?.value,
        expiresAt: input.expiresAt ?? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        createdAt,
      } as InsertVerticalDramaSpecialTieInDebugEventRow;
      try {
        await persist(row);
      } catch (error) {
        console.error("[VD_SPECIAL_FORENSICS] persist_failed", { eventType: input.eventType, message: error instanceof Error ? error.message : String(error) });
      }
      try {
        audit({ eventType: input.eventType, sequence: eventSequence, episodeId: context.episodeId, jobId: context.jobId, traceId: context.traceId, outcome: input.outcome, retryCategory: input.retryCategory });
      } catch (error) {
        console.error("[VD_SPECIAL_FORENSICS] audit_failed", { eventType: input.eventType, message: error instanceof Error ? error.message : String(error) });
      }
      return { sequence: eventSequence };
    },
  };
}

export async function listSpecialTieInForensicEvents(input: {
  episodeId?: number; jobId?: string; traceId?: string; tenantId?: string; userId?: number; limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const conditions = [];
  if (input.episodeId !== undefined) conditions.push(eq(verticalDramaSpecialTieInDebugEvents.episodeId, input.episodeId));
  if (input.jobId) conditions.push(eq(verticalDramaSpecialTieInDebugEvents.jobId, input.jobId));
  if (input.traceId) conditions.push(eq(verticalDramaSpecialTieInDebugEvents.traceId, input.traceId));
  if (input.tenantId) conditions.push(eq(verticalDramaSpecialTieInDebugEvents.tenantId, input.tenantId));
  if (input.userId !== undefined) conditions.push(eq(verticalDramaSpecialTieInDebugEvents.userId, input.userId));
  return db.select().from(verticalDramaSpecialTieInDebugEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(verticalDramaSpecialTieInDebugEvents.createdAt)).limit(limit);
}

export async function getSpecialTieInForensicEvent(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(verticalDramaSpecialTieInDebugEvents).where(eq(verticalDramaSpecialTieInDebugEvents.id, id)).limit(1);
  return row ?? null;
}

export async function purgeExpiredSpecialTieInForensicEvents(now = new Date(), limit = 500) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: verticalDramaSpecialTieInDebugEvents.id })
    .from(verticalDramaSpecialTieInDebugEvents)
    .where(lt(verticalDramaSpecialTieInDebugEvents.expiresAt, now))
    .limit(Math.min(Math.max(limit, 1), 2000));
  if (!rows.length) return 0;
  await db.delete(verticalDramaSpecialTieInDebugEvents).where(inArray(verticalDramaSpecialTieInDebugEvents.id, rows.map(row => row.id)));
  return rows.length;
}
