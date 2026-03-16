/**
 * JSONL Audit Logger for API request/response tracking.
 *
 * - Buffered, non-blocking writes (fire-and-forget from callers)
 * - Date-based file rotation (one file per day)
 * - Payload sanitization (strips secrets, truncates large message arrays)
 * - Auto-cleanup of old log files
 */
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { getTraceId } from "./traceContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditEventType =
  | "llm_request"
  | "llm_response"
  | "llm_stream_end"
  | "media_request"
  | "media_response"
  | "library_mutation"
  | "rollout_gate"
  | "skill_detect"
  | "skill_execute"
  | "gdrive_api_call"
  | "google_drive_connect"
  | "google_drive_disconnect"
  | "google_drive_token_refresh"
  | "google_drive_data_access"
  | "google_drive_sync"
  | "google_drive_webhook"
  | "google_drive_edit"
  | "onedrive_connect"
  | "onedrive_disconnect"
  | "onedrive_token_refresh"
  | "onedrive_data_access"
  | "onedrive_sync"
  | "onedrive_edit"
  | "funnel_scope_fallback"
  | "funnel_export"
  | "funnel_raw_events_query"
  | "agency_created"
  | "agency_updated"
  | "agency_deleted"
  | "agency_run_started"
  | "agency_run_completed"
  | "agency_run_failed"
  | "agency_credit_reserved"
  | "agency_credit_deducted"
  | "agency_credit_refunded"
  | "agency_tool_called"
  | "agency_tool_failed"
  | "agency_archival"
  | "creator_fee_settled"
  | "telegram_webhook_secret_invalid"
  | "telegram_webhook_dedupe_failed"
  | "telegram_webhook_audit_failed"
  | "telegram_webhook_processing_error"
  | "telegram_webhook_reply_failed"
  | "channel_gateway_agency_error"
  | "channel_gateway_ingest_error"
  | "channel_gateway_skip_null_ref"
  | "channel_gateway_egress_error"
  | "channel_gateway_invalid_conversation_id"
  | "channel_gateway_llm_error"
  | "channel_gateway_chat_error"
  | "channel_gateway_no_adapter"
  | "channel_router_match"
  | "channel_router_agency_error"
  | "channel_router_unknown_operator"
  | "channel_webhook_validation_failed"
  | "channel_webhook_dedup_failed"
  | "channel_webhook_no_active_channel"
  | "channel_webhook_ingest_error"
  | "channel_adapter_registered"
  | "responses_api_call"
  | "web_search_call"
  | "browser_tool_call"
  | "widget_origin_rejected"
  | "widget_init_error"
  | "widget_ingest_error"
  | "model_suggest_response"
  | "auto_draft.model_selected"
  | "orchestration_classify"
  | "orchestration_pipeline"
  | "orchestration_agent_step"
  | "orchestration_quality_gate"
  | "orchestration_param_extract"
  | "orchestration_fallback"
  | "error";

export interface AuditLogEntry {
  traceId: string;
  timestamp: string;
  eventType: AuditEventType;
  userId: number | null;
  providerId?: number | null;
  providerName?: string | null;
  model?: string | null;
  endpoint?: string;
  requestType?: string;

  timing?: {
    queueWaitMs?: number;
    networkMs?: number;
    parseMs?: number;
    totalMs: number;
  };

  requestPayload?: unknown;
  responsePayload?: unknown;

  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  creditsCharged?: number;
  costCalculationMethod?: "provider_reported" | "model_lookup" | "default_rate";

  statusCode?: number;
  errorType?: string;
  errorMessage?: string;

  wasFallback?: boolean;
  fallbackAttempt?: number;
  fallbackFromProviderId?: number;

  skillSlug?: string;
  skillDetectionConfidence?: number;
  skillParams?: Record<string, unknown>;

  mediaType?: "image" | "video" | "audio";
  mediaTaskId?: string;

  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "authorization",
  "x-api-key",
  "apikey",
  "api_key",
  "apikeyencrypted",
  "password",
  "secret",
  "token",
  "cookie",
  "accesstoken",
  "access_token",
]);

const MAX_ENTRY_BYTES = 32_768; // 32 KB

function sanitizeValue(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeValue(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitizeValue(val, depth + 1);
    }
  }
  return result;
}

/**
 * Truncate a messages array for logging: keep system message (first 500 chars),
 * last 2 user/assistant messages (first 1000 chars each), replace middle with placeholder.
 */
function truncateMessages(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages) || messages.length <= 3) return messages;

  const truncated: unknown[] = [];

  // Keep first message (usually system) — truncate content
  const first = messages[0] as Record<string, unknown>;
  if (first && typeof first.content === "string" && first.content.length > 500) {
    truncated.push({ ...first, content: first.content.slice(0, 500) + `... [TRUNCATED ${first.content.length} chars]` });
  } else {
    truncated.push(first);
  }

  // Placeholder for middle messages
  if (messages.length > 3) {
    truncated.push({ role: "system", content: `[${messages.length - 3} messages truncated for audit log]` });
  }

  // Keep last 2 messages — truncate content
  const lastTwo = messages.slice(-2);
  for (const msg of lastTwo) {
    const m = msg as Record<string, unknown>;
    if (m && typeof m.content === "string" && m.content.length > 1000) {
      truncated.push({ ...m, content: m.content.slice(0, 1000) + `... [TRUNCATED ${m.content.length} chars]` });
    } else {
      truncated.push(m);
    }
  }

  return truncated;
}

function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;

  const obj = payload as Record<string, unknown>;
  const sanitized = sanitizeValue(obj) as Record<string, unknown>;

  // Truncate messages array if present
  if (Array.isArray(sanitized.messages)) {
    sanitized.messages = truncateMessages(sanitized.messages);
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// AuditLoggerService
// ---------------------------------------------------------------------------

class AuditLoggerService {
  private buffer: string[] = [];
  private stream: fs.WriteStream | null = null;
  private currentDate: string = "";
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private logDir: string;
  private retentionDays: number;
  private initialized = false;

  constructor() {
    this.logDir = process.env.AUDIT_LOG_DIR || path.resolve(process.cwd(), "logs", "audit");
    this.retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "30", 10);
  }

  /** Initialize the logger: create directory, open stream, start timers */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      fs.mkdirSync(this.logDir, { recursive: true });
    } catch {
      console.warn("[AuditLogger] Failed to create log directory:", this.logDir);
      return;
    }

    this.openStream();

    // Flush buffer every 500ms
    this.flushTimer = setInterval(() => {
      this.flushSync();
    }, 500);

    // Cleanup old files every hour
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldFiles();
    }, 60 * 60 * 1000);

    // Run initial cleanup
    this.cleanupOldFiles();
  }

  /** Generate a new trace ID */
  createTrace(): string {
    return nanoid(21);
  }

  /**
   * Enqueue an audit log entry. Non-blocking — returns immediately.
   * The entry will be written to the JSONL file on the next flush cycle.
   */
  log(entry: Partial<AuditLogEntry>): void {
    if (!this.initialized) return;

    const full: AuditLogEntry = {
      traceId: entry.traceId || getTraceId() || "unknown",
      timestamp: new Date().toISOString(),
      eventType: entry.eventType || "error",
      userId: entry.userId ?? null,
      ...entry,
    } as AuditLogEntry;

    // Sanitize payloads
    if (full.requestPayload) {
      full.requestPayload = sanitizePayload(full.requestPayload);
    }
    if (full.responsePayload) {
      full.responsePayload = sanitizePayload(full.responsePayload);
    }

    let line: string;
    try {
      line = JSON.stringify(full);
    } catch {
      // If serialization fails, log without payloads
      full.requestPayload = "[SERIALIZATION_ERROR]";
      full.responsePayload = "[SERIALIZATION_ERROR]";
      line = JSON.stringify(full);
    }

    // Cap at 32KB
    if (line.length > MAX_ENTRY_BYTES) {
      full.requestPayload = "[PAYLOAD_EXCEEDED_32KB]";
      full.responsePayload = "[PAYLOAD_EXCEEDED_32KB]";
      line = JSON.stringify(full);
    }

    // Drop if buffer is too large (backpressure)
    if (this.buffer.length >= 200) return;

    this.buffer.push(line);

    // Eager flush if buffer is large
    if (this.buffer.length >= 50) {
      this.flushSync();
    }
  }

  /** Synchronously drain the buffer to the write stream */
  private flushSync(): void {
    if (this.buffer.length === 0) return;

    // Check if we need to rotate to a new date
    const today = this.getDateString();
    if (today !== this.currentDate) {
      this.openStream();
    }

    if (!this.stream) return;

    const lines = this.buffer.splice(0, this.buffer.length);
    const data = lines.join("\n") + "\n";

    // Write without waiting — if backpressure, data is buffered by Node.js stream
    this.stream.write(data);
  }

  /** Force flush (async — waits for drain) */
  async flush(): Promise<void> {
    this.flushSync();
    return new Promise<void>((resolve) => {
      if (!this.stream) return resolve();
      if (this.stream.writableNeedDrain) {
        this.stream.once("drain", resolve);
      } else {
        resolve();
      }
    });
  }

  /** Graceful shutdown: flush buffer, close stream, clear timers */
  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.flushTimer = null;
    this.cleanupTimer = null;

    await this.flush();

    return new Promise<void>((resolve) => {
      if (this.stream) {
        this.stream.end(resolve);
      } else {
        resolve();
      }
    });
  }

  /** Get the file path for a given date */
  getLogFilePath(date?: Date): string {
    const d = date || new Date();
    return path.join(this.logDir, `audit-${this.getDateString(d)}.jsonl`);
  }

  /**
   * Read audit log entries for a given date, optionally filtered.
   * Used by the admin API for payload retrieval.
   */
  async readEntries(opts: {
    date: Date;
    traceId?: string;
    userId?: number;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const filePath = this.getLogFilePath(opts.date);

    // Flush current buffer first so reads are consistent
    await this.flush();

    if (!fs.existsSync(filePath)) return [];

    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    let entries: AuditLogEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditLogEntry;

        if (opts.traceId && entry.traceId !== opts.traceId) continue;
        if (opts.userId && entry.userId !== opts.userId) continue;
        if (opts.eventType && entry.eventType !== opts.eventType) continue;

        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }

    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 100;
    entries = entries.slice(offset, offset + limit);

    return entries;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getDateString(date?: Date): string {
    const d = date || new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private openStream(): void {
    if (this.stream) {
      this.stream.end();
    }

    this.currentDate = this.getDateString();
    const filePath = this.getLogFilePath();

    try {
      this.stream = fs.createWriteStream(filePath, { flags: "a", encoding: "utf-8" });
      this.stream.on("error", (err) => {
        console.warn("[AuditLogger] Write stream error:", err.message);
      });
    } catch (err) {
      console.warn("[AuditLogger] Failed to open log file:", filePath);
      this.stream = null;
    }
  }

  private cleanupOldFiles(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.retentionDays);
      const cutoffStr = this.getDateString(cutoff);

      for (const file of files) {
        if (!file.startsWith("audit-") || !file.endsWith(".jsonl")) continue;
        const dateStr = file.slice(6, 16); // "audit-YYYY-MM-DD.jsonl" → "YYYY-MM-DD"
        if (dateStr < cutoffStr) {
          fs.unlinkSync(path.join(this.logDir, file));
        }
      }
    } catch {
      // Cleanup is best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const auditLogger = new AuditLoggerService();

/** Initialize the audit logger (call at server startup) */
export function initAuditLogger(): void {
  auditLogger.init();
}
