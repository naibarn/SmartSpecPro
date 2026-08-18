/**
 * System auto-report service — files a feedback ticket automatically when
 * the SYSTEM detects a failure (async job failure, internal tRPC error)
 * instead of waiting for a human to notice and type up a bug report.
 *
 * Design goals (mirrors `routers/feedback.ts`'s `submit` + `processTicket`
 * flow — the closest existing precedent for "insert a feedback ticket, then
 * fan out admin notifications"):
 *  - Best-effort, fire-and-forget: every public entrypoint here swallows its
 *    own errors. A failure while filing a diagnostic ticket must NEVER
 *    surface to (or fail) the caller — that would turn an observability
 *    feature into a new source of outages.
 *  - Fingerprint-based dedup: repeated occurrences of "the same" failure
 *    (same source + normalized error message) within a rolling 24h window
 *    update the existing ticket's `contextJson` (occurrence count, last-seen
 *    timestamp, affected users) instead of flooding the queue with one
 *    ticket per event.
 *  - Flood guard: even with dedup, a burst of NEW distinct fingerprints
 *    (e.g. a bad deploy causing 30 different error shapes) is capped at 20
 *    new tickets/hour. Dedup-updates to already-known fingerprints are never
 *    throttled by this guard.
 *  - No secrets: `extra` is whitelisted to primitive/short-string values and
 *    any key that looks like it holds a credential is dropped before it ever
 *    reaches `contextJson` (which is admin-visible and may be copy/pasted
 *    into an LLM via AdminFeedbackHub's "Copy for AI" button).
 *
 * Dynamic imports for `db`/schema throughout (matches `notifyJobFailure` in
 * `routers/mediaJobs.ts` and `notifyStoryJobTerminal` in
 * `services/verticalDramaStoryJobs.ts`) to avoid pulling this file into the
 * `_core/*` import graph — this module must stay a leaf that anything
 * (including `_core/index.ts`'s tRPC `onError`) can safely dynamic-import
 * without creating a cycle.
 */
import crypto from "crypto";
import { eq, and, isNull, like, sql } from "drizzle-orm";
import { debugError, debugLog } from "../_core/logger";
import type { DrizzleDB } from "../db";
import {
  classifyCreditFailure,
  type CreditFailureClassification,
  type CreditFailureContext,
} from "./creditFailurePolicy";

export interface ReportSystemFailureParams {
  /** Short machine-readable origin tag, e.g. "trpc", "media_jobs", "vertical_drama_story_jobs". */
  source: string;
  userId?: number | string | null;
  tenantId?: string | null;
  /** Human-readable one-line summary, used to build the ticket title. */
  title: string;
  errorMessage: string;
  stack?: string;
  path?: string;
  jobId?: string;
  traceId?: string;
  /** Structured credit/provider context from an authoritative billing boundary. */
  creditContext?: CreditFailureContext;
  /** Extra diagnostic fields — whitelisted/sanitized before storage, see `sanitizeExtra`. */
  extra?: Record<string, unknown>;
}

const TICKET_TITLE_MAX_LEN = 255;
// Statuses that mean "this ticket is done" — a fresh occurrence of the same
// fingerprint should open a NEW ticket rather than reviving a closed one.
// Matches `virtualAdmin/feedbackProcessor.ts`'s `findDuplicate` terminal set
// (kept as a literal SQL fragment below, same convention as that file).

// ── Flood guard: max NEW tickets (distinct fingerprints) per rolling hour ──
// Dedup-updates to an already-known fingerprint are NOT subject to this cap.
const NEW_TICKET_WINDOW_MS = 60 * 60 * 1000;
const MAX_NEW_TICKETS_PER_HOUR = 20;
const newTicketTimestamps: number[] = [];

function floodGuardAllowsNewTicket(): boolean {
  const now = Date.now();
  while (newTicketTimestamps.length > 0 && newTicketTimestamps[0]! < now - NEW_TICKET_WINDOW_MS) {
    newTicketTimestamps.shift();
  }
  if (newTicketTimestamps.length >= MAX_NEW_TICKETS_PER_HOUR) return false;
  newTicketTimestamps.push(now);
  return true;
}

/** Lowercase, collapse whitespace, and blank out digits/uuids/hex-ids so that
 *  "job 4f9c... failed at row 883" and "job a1b2... failed at row 12" hash to
 *  the same fingerprint. */
function normalizeErrorMessage(message: string): string {
  let s = message.toLowerCase();
  // UUIDs (v1-v5, any case already lowered above)
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "#");
  // Long hex-looking ids (nanoid/hex hashes etc.) — 6+ hex chars as a whole word
  s = s.replace(/\b[0-9a-f]{6,}\b/g, "#");
  // Any remaining runs of digits (row numbers, ports, ids, counts...)
  s = s.replace(/\d+/g, "#");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 300);
}

function computeFingerprint(source: string, errorMessage: string): { fingerprint: string; fp8: string } {
  const normalized = normalizeErrorMessage(errorMessage);
  const fingerprint = crypto.createHash("sha256").update(`${source}|${normalized}`).digest("hex");
  return { fingerprint, fp8: fingerprint.slice(0, 8) };
}

function buildTicketTitle(fp8: string, title: string): string {
  const prefix = `[Auto][${fp8}] `;
  const maxTitleLen = Math.max(0, TICKET_TITLE_MAX_LEN - prefix.length);
  return `${prefix}${title.slice(0, maxTitleLen)}`.slice(0, TICKET_TITLE_MAX_LEN);
}

/** Names that must never appear in the admin-visible `extra` diagnostics bag. */
const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization|auth\b/i;

/** Shallow-copy only primitive/short-string values, dropping anything whose
 *  key name looks like it might hold a credential, and anything whose value
 *  isn't a primitive (objects/arrays could smuggle nested secrets). */
function sanitizeExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!extra) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (value === null) {
      out[key] = null;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = value.slice(0, 500);
    }
    // Objects/arrays/functions/symbols: dropped — not primitive/short-string.
  }
  return Object.keys(out).length > 0 ? out : null;
}

function resolveNumericUserId(userId: number | string | null | undefined): number | null {
  if (typeof userId === "number" && Number.isFinite(userId)) return userId;
  if (typeof userId === "string") {
    const parsed = parseInt(userId, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function creditContextForStorage(classification: CreditFailureClassification) {
  return {
    route: classification.route,
    source: classification.source,
    modelKind: classification.modelKind,
    requestedCredits: classification.requestedCredits,
    threshold: classification.threshold,
    provider: classification.provider,
  };
}

async function notifyCreditFailureUser(params: {
  db: DrizzleDB;
  userId: number;
  classification: CreditFailureClassification;
  source: string;
  traceId?: string;
}): Promise<void> {
  if (!params.db) return;
  const { createNotification } = await import("./notificationService");
  const isPurchase = params.classification.route === "user_purchase";
  const isReview = params.classification.route === "admin_suspicious";
  const isProvider = params.classification.route === "admin_provider";
  const title = isPurchase
    ? "เครดิตไม่เพียงพอ"
    : isReview
      ? "กำลังตรวจสอบคำขอใช้เครดิต"
      : "ผู้ให้บริการ AI ขัดข้อง";
  const content = isPurchase
    ? "เครดิตของคุณไม่เพียงพอสำหรับคำขอนี้ กรุณาซื้อเครดิตเพิ่มเพื่อดำเนินการต่อ"
    : isReview
      ? "ระบบไม่สามารถดำเนินการคำขอนี้ได้ เนื่องจากจำนวนเครดิตที่ขอสูงผิดปกติ ทีมงานกำลังตรวจสอบ"
      : "ผู้ให้บริการ AI มีเครดิตหรือโควตาไม่เพียงพอ ทีมงานกำลังเร่งตรวจสอบให้คุณ";
  const metadataItems: Record<string, string> = {
    route: params.classification.route,
    modelKind: params.classification.modelKind,
  };
  if (params.classification.provider) metadataItems.provider = params.classification.provider;
  if (params.classification.requestedCredits != null) {
    metadataItems.requestedCredits = String(params.classification.requestedCredits);
  }
  await createNotification({
    db: params.db,
    userId: params.userId,
    type: "alert",
    title,
    content,
    priority: isProvider ? "critical" : isReview ? "high" : "normal",
    relatedResourceType: isPurchase ? "system_health" : "feedback",
    actionUrl: isPurchase ? "/credits" : undefined,
    actionLabel: isPurchase ? "ซื้อเครดิตเพิ่ม" : undefined,
    groupKey: `credit-failure:${params.classification.route}:${params.userId}`,
    metadata: {
      source: params.source,
      eventId: params.traceId,
      errorDetails: { errorCode: "INSUFFICIENT_CREDITS", errorMessage: content },
      relatedItems: metadataItems,
    },
  });
}

/**
 * File (or update) a system-generated feedback ticket for a detected
 * failure. Best-effort — NEVER throws; every failure path is logged via
 * `debugError`/`debugLog` and swallowed.
 */
export async function reportSystemFailure(params: ReportSystemFailureParams): Promise<void> {
  try {
    const errorMessage = params.errorMessage || "Unknown error";
    const { fingerprint, fp8 } = computeFingerprint(params.source, errorMessage);
    const numericUserId = resolveNumericUserId(params.userId);
    const creditClassification = classifyCreditFailure({
      errorMessage,
      path: params.path,
      context: params.creditContext,
    });
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();

    const { getDb } = await import("../db");
    const { feedbackTickets, users } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) {
      debugLog("SystemAutoReport", "DB unavailable — dropping auto-report", { source: params.source, fp8 });
      return;
    }

    let tenantId = params.tenantId ?? null;
    let affectedUserEmail: string | null = null;
    if (!tenantId && numericUserId != null) {
      const [owner] = await db
        .select({ tenantId: users.currentTenantId, email: users.email })
        .from(users)
        .where(eq(users.id, numericUserId))
        .limit(1);
      tenantId = owner?.tenantId != null ? String(owner.tenantId) : null;
      affectedUserEmail = owner?.email ?? null;
    } else if (numericUserId != null) {
      try {
        const [owner] = await db
          .select({ email: users.email })
          .from(users)
          .where(
            and(
              eq(users.id, numericUserId),
              eq(users.currentTenantId, tenantId!),
            ),
          )
          .limit(1);
        affectedUserEmail = owner?.email ?? null;
      } catch (err) {
        debugLog("SystemAutoReport", "Could not resolve affected user email", {
          userId: numericUserId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Ordinary user-credit failures are a billing UX event, not a system bug.
    // Notify the affected owner and stop before inserting an admin ticket.
    if (creditClassification.isCreditFailure && numericUserId != null) {
      await notifyCreditFailureUser({
        db,
        userId: numericUserId,
        classification: creditClassification,
        source: params.source,
        traceId: params.traceId,
      });
      if (creditClassification.route === "user_purchase") return;
    }

    // If a user cannot be resolved, do not silently drop a credit anomaly.
    // Escalate it as a high-priority diagnostic ticket instead.
    const effectiveCreditRoute =
      creditClassification.isCreditFailure &&
      creditClassification.route === "user_purchase" &&
      numericUserId == null
        ? "admin_suspicious"
        : creditClassification.route;
    const creditPriority =
      effectiveCreditRoute === "admin_provider"
        ? "critical"
        : effectiveCreditRoute === "admin_suspicious"
          ? "high"
          : null;
    const storedCreditContext = creditClassification.isCreditFailure
      ? { ...creditContextForStorage(creditClassification), route: effectiveCreditRoute }
      : null;

    // ── Dedup: is there already an open ticket for this fingerprint in the
    // last 24h? Its title always starts with the stable "[Auto][<fp8>] " tag. ──
    const tenantCondition = tenantId
      ? eq(feedbackTickets.tenantId, tenantId)
      : isNull(feedbackTickets.tenantId);
    const existingRows = await db
      .select({ id: feedbackTickets.id, contextJson: feedbackTickets.contextJson })
      .from(feedbackTickets)
      .where(
        and(
          like(feedbackTickets.title, `[Auto][${fp8}]%`),
          sql`${feedbackTickets.createdAt} > now() - interval '24 hours'`,
          sql`${feedbackTickets.status} NOT IN ('resolved', 'closed', 'duplicate')`,
          tenantCondition,
        ),
      )
      .limit(1);

    const existing = existingRows[0];

    if (existing) {
      const existingContext = (existing.contextJson ?? {}) as Record<string, unknown>;
      const occurrences =
        (typeof existingContext.occurrences === "number" ? existingContext.occurrences : 1) + 1;
      const affectedUserIds: number[] = Array.isArray(existingContext.affectedUserIds)
        ? [...(existingContext.affectedUserIds as unknown[])].filter(
            (v): v is number => typeof v === "number",
          )
        : [];
      if (numericUserId != null) {
        const idx = affectedUserIds.indexOf(numericUserId);
        if (idx !== -1) affectedUserIds.splice(idx, 1);
        affectedUserIds.push(numericUserId);
      }
      while (affectedUserIds.length > 5) affectedUserIds.shift();

      await db
        .update(feedbackTickets)
        .set({
          ...(creditPriority ? { priority: creditPriority, severity: creditPriority } : {}),
          contextJson: {
            ...existingContext,
            kind: "system_auto_report",
            source: params.source,
            fingerprint,
            fp8,
            occurrences,
            firstSeenAt: existingContext.firstSeenAt ?? nowIso,
            lastSeenAt: nowIso,
            traceId: params.traceId ?? existingContext.traceId ?? null,
            path: params.path ?? existingContext.path ?? null,
            jobId: params.jobId ?? existingContext.jobId ?? null,
            errorMessage: errorMessage.slice(0, 2000),
            stack: params.stack ? params.stack.slice(0, 4000) : (existingContext.stack ?? null),
            affectedUserIds,
            creditFailure: storedCreditContext ?? existingContext.creditFailure ?? null,
            extra: sanitizeExtra(params.extra) ?? existingContext.extra ?? null,
          },
          updatedAt: nowDate,
        })
        .where(eq(feedbackTickets.id, existing.id));

      debugLog("SystemAutoReport", "Deduped into existing ticket", {
        ticketId: existing.id,
        fp8,
        source: params.source,
        occurrences,
      });
      return;
    }

    // ── No existing ticket for this fingerprint — flood-guard, then create. ──
    if (!floodGuardAllowsNewTicket()) {
      debugLog("SystemAutoReport", "Flood guard dropped new fingerprint (>20 new/hr)", {
        source: params.source,
        fp8,
      });
      return;
    }

    const title = buildTicketTitle(fp8, params.title);
    const descriptionLines = [
      `ระบบตรวจพบความผิดพลาดโดยอัตโนมัติและสร้าง feedback นี้ขึ้นเอง`,
      `แหล่งที่มา (source): ${params.source}`,
      `ข้อความ error: ${errorMessage.slice(0, 500)}`,
    ];
    if (params.traceId) descriptionLines.push(`Trace ID: ${params.traceId}`);
    if (params.path) descriptionLines.push(`Path: ${params.path}`);
    if (params.jobId) descriptionLines.push(`Job ID: ${params.jobId}`);
    if (numericUserId != null) {
      descriptionLines.push(
        `Affected user: ${affectedUserEmail ? `${affectedUserEmail} (user #${numericUserId})` : `user #${numericUserId}`}`,
      );
    }
    const description = descriptionLines.join("\n");

    const contextJson = {
      kind: "system_auto_report",
      source: params.source,
      fingerprint,
      fp8,
      occurrences: 1,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      traceId: params.traceId ?? null,
      path: params.path ?? null,
      jobId: params.jobId ?? null,
      errorMessage: errorMessage.slice(0, 2000),
      stack: params.stack ? params.stack.slice(0, 4000) : null,
      affectedUserIds: numericUserId != null ? [numericUserId] : [],
      creditFailure: storedCreditContext,
      extra: sanitizeExtra(params.extra),
    };

    const [ticket] = await db
      .insert(feedbackTickets)
      .values({
        tenantId,
        submittedBy: numericUserId,
        submittedByType: "system",
        ticketType: "bug",
        priority: creditPriority ?? "high",
        severity: creditPriority ?? "high",
        category: params.source.slice(0, 64),
        title,
        description,
        actualBehavior: errorMessage.slice(0, 2000),
        contextJson,
      })
      .returning({ id: feedbackTickets.id });

    debugLog("SystemAutoReport", "Created new auto-report ticket", {
      ticketId: ticket?.id,
      fp8,
      source: params.source,
    });

    // Reuse the exact same post-insert fan-out as a human-submitted ticket
    // (classification + admin notifications) — see `routers/feedback.ts`'s
    // `submit` mutation for the identical call pattern.
    if (ticket?.id != null) {
      const { processTicket } = await import("./virtualAdmin/feedbackProcessor");
      processTicket(ticket.id).catch((err) =>
        debugError("SystemAutoReport", `processTicket failed for auto ticket ${ticket.id}`, err),
      );
    }
  } catch (err) {
    debugError("SystemAutoReport", "reportSystemFailure failed (best-effort, swallowed)", err);
  }
}
