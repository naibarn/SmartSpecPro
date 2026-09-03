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
  | "vd_special_tie_in_event"
  | "llm_request"
  | "llm_response"
  | "llm_stream_end"
  | "chat_context_timing"
  | "media_request"
  | "media_response"
  | "library_mutation"
  | "rollout_gate"
  | "hyperframes_operator_action"
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
  | "team_created"
  | "team_blueprint_created"
  | "team_template_cloned"
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
  | "social_inbox_reply_sent"
  | "social_inbox_reply_failed"
  | "social_inbox_status_updated"
  | "social_ai_draft_generated"
  | "social_ai_draft_auto_sent"
  | "social_ai_draft_approval_created"
  | "social.approval.approved"
  | "social.approval.rejected"
  | "social_comment_replied"
  | "social_comment_hidden"
  | "social_comment_deleted"
  | "social_publishing_draft_created"
  | "social_publishing_post_published"
  | "social_publishing_post_scheduled"
  | "social_publishing_post_canceled"
  | "social_publishing_publish_failed"
  | "upload_post_connection_connected"
  | "upload_post_connection_disconnected"
  | "upload_post_profile_created"
  | "upload_post_profile_deleted"
  | "finance_draft_created"
  | "finance_draft_confirmed"
  | "finance_draft_cancelled"
  | "finance_draft_restored"
  | "finance_transaction_voided"
  | "finance_recurring_rule_failed"
  | "finance_semantic_duplicate_reused"
  | "finance_document_ocr_started"
  | "finance_document_ocr_completed"
  | "finance_document_ocr_failed"
  | "finance_report_exported"
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
  | "orchestration_agent_loop_summary"
  | "orchestration_quality_gate"
  | "orchestration_param_extract"
  | "orchestration_fallback"
  | "agency_result_routed"
  | "agent_registry_created"
  | "agent_registry_version_published"
  | "agent_registry_version_selected"
  | "agent_registry_promotion_reviewed"
  | "agent_registry_version_frozen"
  | "agent_registry_version_rolled_back"
  | "agent_registry_memory_recorded"
  | "desktop_host_device_enrolled"
  | "desktop_host_policy_refreshed"
  | "desktop_host_device_policy_overrides_updated"
  | "desktop_host_package_sync"
  | "desktop_host_local_root_registered"
  | "desktop_host_device_action_queued"
  | "desktop_host_root_action_queued"
  | "desktop_host_runtime_selected"
  | "desktop_host_outbound_policy_decision"
  | "desktop_host_device_offboarded"
  | "desktop_host_update_verified"
  | "invite_code_used"
  | "user_disabled_inactive"
  | "user_reactivated"
  | "age_safety_policy_decision"
  | "age_safety_observe_would_block"
  | "age_safety_unlock"
  | "age_safety_admin_update"
  | "age_safety_profile_change"
  | "age_safety_review_required"
  | "age_safety_appeal_created"
  | "age_safety_operational_degraded"
  | "user_llm_key_set"
  | "user_llm_key_deleted"
  | "unified_route"
  | "unified_credit"
  | "unified_error"
  | "mcp_tool_call"
  | "mcp_connect_provider_config_updated"
  | "mcp_server_created"
  | "mcp_server_updated"
  | "mcp_server_deleted"
  | "mcp_server_assigned"
  | "worker_registered"
  | "worker_job_claimed"
  | "worker_job_completed"
  | "worker_job_failed"
  | "worker_job_canceled"
  | "worker_job_requeued"
  | "worker_job_watchdog_dead_letter"
  | "connected_device_revoked"
  | "connected_device_permissions_updated"
  | "worker_diagnostics_received"
  | "worker_artifact_published"
  | "worker_fleet_action"
  | "worker_budget_updated"
  | "worker_callback_published"
  | "worker_media_workflow_policy_updated"
  | "worker_legacy_data_redacted"
  | "hermes_connection_connect_started"
  | "hermes_connection_authorized"
  | "hermes_connection_disconnected"
  | "hermes_connection_revoked"
  | "hermes_connection_entitlement_restricted"
  | "hermes_connection_reauth_required"
  | "hermes_media_job_submitted"
  | "hermes_media_admission_rejected"
  | "hermes_media_usage_recorded"
  | "vertical_drama_season_critique_apply_error"
  | "vertical_drama_deep_generate_error"
  | "vd_motion_contract_generated"
  | "vd_scene_state_planned"
  | "vd_scene_neighbor_anchor_attached"
  | "vd_frame_continuity_qc"
  | "vd_series_look_lock_changed"
  | "vd_series_look_lock_applied"
  // Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard)
  // section 12 §5.1/§5.3 — frozen 7-name observability event catalog.
  // Additive only; see `marketplaceAutoReviewObservability.ts`.
  | "sequential_skill_plan_round"
  | "sequential_prompt_degraded_fallback"
  | "final_image_prompt_over_provider_budget"
  | "final_video_prompt_over_provider_budget"
  | "sequential_reference_angles_trimmed"
  | "marketplace_review_evidence_guard_occurrence"
  | "marketplace_review_mode_metrics"
  | "error";

export interface AuditLogEntry {
  traceId: string;
  timestamp: string;
  eventType: AuditEventType;
  userId: number | null;
  tenantId?: string | null;
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
  /** Cross-model recovery metadata; distinct from provider fallback fields. */
  modelFallbackFrom?: string;
  modelFallbackReason?: string;

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
  "reference_audio_base64",
  "referenceaudiobase64",
  "reference_audio_url",
  "referenceaudiourl",
  "prompt",
  "negative_prompt",
  "negativeprompt",
  "reference_image_urls",
  "referenceimageurls",
  "reference_image_manifest",
  "referenceimagemanifest",
  "reference_video_urls",
  "referencevideourls",
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

export function sanitizePayload(payload: unknown): unknown {
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
    limit?: number | null;
    offset?: number;
    sortOrder?: "asc" | "desc";
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

    entries.sort((a, b) => {
      const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return (opts.sortOrder ?? "asc") === "desc" ? tb - ta : ta - tb;
    });

    const offset = opts.offset ?? 0;
    if (opts.limit == null) {
      entries = entries.slice(offset);
    } else {
      entries = entries.slice(offset, offset + opts.limit);
    }

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
