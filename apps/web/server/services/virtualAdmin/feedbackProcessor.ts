import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { feedbackTickets, users } from "../../../drizzle/schema";
import { createNotification } from "../notificationService";
import {
  extractAffectedUserIds,
  formatAffectedUsersForText,
  resolveAffectedUsers,
  type AffectedUser,
} from "../feedbackAffectedUsers";

interface ProcessedTicket {
  autoCategory: string | null;
  autoPriority: string | null;
  autoSummary: string | null;
  duplicateOf: number | null;
  relatedIncidentId: number | null;
}

// Keyword-based classification (no LLM needed for MVP)
function classifyByKeywords(title: string, description?: string | null): { category: string; priority: string } {
  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (/error|crash|bug|broken|fail|exception/.test(text)) {
    return { category: "bug", priority: "high" };
  }
  if (/slow|performance|latency|timeout/.test(text)) {
    return { category: "performance", priority: "normal" };
  }
  if (/suggest|feature|wish|request|improve|enhancement/.test(text)) {
    return { category: "feature_request", priority: "normal" };
  }
  if (/question|how|help|guide/.test(text)) {
    return { category: "question", priority: "low" };
  }
  return { category: "general", priority: "normal" };
}

// Dedup: check for similar open tickets by title similarity
async function findDuplicate(title: string, tenantId?: string | null): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Simple title-match dedup (first 50 chars)
  const prefix = title.slice(0, 50).toLowerCase();
  const conditions = [
    sql`LOWER(LEFT(${feedbackTickets.title}, 50)) = ${prefix}`,
    sql`${feedbackTickets.status} NOT IN ('resolved', 'closed', 'duplicate')`,
  ];
  conditions.push(tenantId ? eq(feedbackTickets.tenantId, tenantId) : isNull(feedbackTickets.tenantId));

  const existing = await db
    .select({ id: feedbackTickets.id })
    .from(feedbackTickets)
    .where(and(...conditions))
    .limit(1);

  return existing[0]?.id ?? null;
}

/**
 * Return an incident reference only when the producer supplied one explicitly.
 * Title keyword matching caused unrelated feedback (for example, any error
 * containing "media") to deep-link to an arbitrary open incident.
 */
export function extractExplicitRelatedIncidentId(contextJson: unknown): number | null {
  if (!contextJson || typeof contextJson !== "object" || Array.isArray(contextJson)) {
    return null;
  }

  const context = contextJson as Record<string, unknown>;
  const extra = context.extra && typeof context.extra === "object" && !Array.isArray(context.extra)
    ? context.extra as Record<string, unknown>
    : null;

  for (const candidate of [
    context.relatedIncidentId,
    context.incidentId,
    extra?.relatedIncidentId,
    extra?.incidentId,
  ]) {
    const id = typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && /^\d+$/.test(candidate.trim())
        ? Number(candidate)
        : NaN;
    if (Number.isSafeInteger(id) && id > 0) return id;
  }

  return null;
}

export function shouldNotifyAdminForTicket(
  submittedByType: string | null | undefined,
  duplicateOf: number | null,
): boolean {
  return submittedByType === "human" || duplicateOf == null;
}

/**
 * Admin notifications for auto-filed (system) tickets share a groupKey so
 * repeats of the same error merge into one notification (occurrenceCount++)
 * instead of flooding the admin inbox. Human feedback always notifies fresh.
 * The 50-char title prefix mirrors findDuplicate's dedup window.
 */
export function adminNotificationGroupKey(ticket: {
  submittedByType: string | null;
  title: string;
}): string | undefined {
  if (ticket.submittedByType === "human") return undefined;
  return `feedback-auto:${ticket.title.slice(0, 50).toLowerCase()}`;
}

export function buildAdminNotificationContent(params: {
  ticketType: string;
  autoSummary: string | null;
  title: string;
  ticketId: number;
  reporter?: AffectedUser | null;
  affectedUsers?: AffectedUser[];
}): string {
  const lines = [
    `[${params.ticketType}] ${params.autoSummary ?? params.title}`,
    `Ticket #${params.ticketId}`,
  ];
  if (params.reporter) {
    lines.push(`Reporter: ${formatAffectedUsersForText([params.reporter])}`);
  }
  if (params.affectedUsers && params.affectedUsers.length > 0) {
    lines.push(`Affected user(s): ${formatAffectedUsersForText(params.affectedUsers)}`);
  }
  return lines.join("\n");
}

export function resolveAdminNotificationPriority(
  ticketPriority: string | null | undefined,
  autoPriority: string | null | undefined,
): "low" | "normal" | "high" | "critical" {
  if (ticketPriority === "critical") return "critical";
  if (autoPriority === "high") return "high";
  if (autoPriority === "low") return "low";
  return "normal";
}

/**
 * Auto-process a newly submitted feedback ticket.
 * Updates the ticket with classification, dedup, and correlation results.
 */
export async function processTicket(ticketId: number): Promise<ProcessedTicket> {
  const db = await getDb();
  if (!db) return { autoCategory: null, autoPriority: null, autoSummary: null, duplicateOf: null, relatedIncidentId: null };

  const tickets = await db
    .select()
    .from(feedbackTickets)
    .where(eq(feedbackTickets.id, ticketId))
    .limit(1);

  if (tickets.length === 0) return { autoCategory: null, autoPriority: null, autoSummary: null, duplicateOf: null, relatedIncidentId: null };

  const ticket = tickets[0];
  const { category, priority } = classifyByKeywords(ticket.title, ticket.description);
  const duplicateOf = await findDuplicate(ticket.title, ticket.tenantId);
  const relatedIncidentId = extractExplicitRelatedIncidentId(ticket.contextJson);

  const result: ProcessedTicket = {
    autoCategory: category,
    autoPriority: priority,
    autoSummary: `Auto-classified as ${category} (${priority} priority)`,
    duplicateOf: duplicateOf && duplicateOf !== ticketId ? duplicateOf : null,
    relatedIncidentId,
  };

  // Update ticket with processing results.
  // Human-submitted feedback must stay in "new" status until a real admin
  // acts on it — auto-flipping it to triaged/duplicate made the admin hub
  // permanently show "0 new" and hid genuine user reports behind auto noise.
  // Classification/dedup results are still recorded as advisory metadata.
  const isHuman = ticket.submittedByType === "human";
  await db
    .update(feedbackTickets)
    .set({
      autoCategory: result.autoCategory,
      autoPriority: result.autoPriority,
      autoSummary: result.autoSummary,
      duplicateOf: result.duplicateOf,
      relatedIncidentId: result.relatedIncidentId,
      ...(isHuman
        ? {}
        : {
            status: result.duplicateOf ? "duplicate" : "triaged",
            triagedAt: new Date(),
          }),
      updatedAt: new Date(),
    })
    .where(eq(feedbackTickets.id, ticketId));

  // Repeated system diagnostics are already represented by the original
  // ticket. Keep the duplicate record for auditability, but do not turn it
  // into another high-priority modal notification.
  if (!shouldNotifyAdminForTicket(ticket.submittedByType, result.duplicateOf)) {
    return result;
  }

  // Notify all admins about the new feedback ticket
  try {
    const affectedUserIds = extractAffectedUserIds(ticket.contextJson);
    const reporterId = typeof ticket.submittedBy === "number" ? ticket.submittedBy : null;
    let affectedUsers: AffectedUser[] = affectedUserIds.map((id) => ({
      id,
      email: null,
    }));
    let reporter: AffectedUser | null = reporterId != null
      ? { id: reporterId, email: null }
      : null;
    const userIdsToResolve = [
      ...affectedUserIds,
      ...(reporterId != null ? [reporterId] : []),
    ];
    if (userIdsToResolve.length > 0) {
      try {
        const resolvedUsers = await resolveAffectedUsers(
          db,
          userIdsToResolve,
          ticket.tenantId,
          userIdsToResolve.length,
        );
        affectedUsers = resolvedUsers.filter((user) => affectedUserIds.includes(user.id));
        reporter = reporterId != null
          ? resolvedUsers.find((user) => user.id === reporterId) ?? { id: reporterId, email: null }
          : null;
      } catch (err) {
        console.error("[Feedback] Failed to resolve reporter/affected user emails:", err);
      }
    }

    const adminConditions = [sql`${users.role} IN ('admin', 'domain_admin')`];
    if (ticket.tenantId) {
      adminConditions.push(sql`${users.currentTenantId}::text = ${ticket.tenantId}`);
    }
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...adminConditions));

    const notificationPriority = resolveAdminNotificationPriority(
      ticket.priority,
      result.autoPriority,
    );

    for (const admin of adminRows) {
      if (admin.id === ticket.submittedBy) continue;
      const reporterPrefix = reporter
        ? `[${reporter.email ?? `user #${reporter.id}`}] `
        : "";
      const displayTitle = reporterPrefix && !ticket.title.startsWith(reporterPrefix)
        ? `${reporterPrefix}${ticket.title}`
        : ticket.title;
      await createNotification({
        db,
        userId: admin.id,
        groupKey: adminNotificationGroupKey(ticket),
        type: "alert",
        title: `New Feedback: ${displayTitle.slice(0, 80)}`,
        content: buildAdminNotificationContent({
          ticketType: ticket.ticketType,
          autoSummary: result.autoSummary,
          title: ticket.title,
          ticketId,
          reporter,
          affectedUsers,
        }),
        priority: notificationPriority,
        relatedResourceType: "feedback",
        relatedResourceId: String(ticketId),
        actionUrl: `/admin/feedback-hub?ticketId=${ticketId}`,
        actionLabel: "View Feedback",
        metadata: {
          source: "guardian.feedbackProcessor",
          eventId: String(ticketId),
          relatedItems: {
            incidentId: result.relatedIncidentId != null ? String(result.relatedIncidentId) : "",
            sensorId: "feedbackProcessor",
            actionTaken: result.duplicateOf ? "duplicate_detected" : "triaged",
          },
        },
      });
    }
  } catch (err) {
    console.error("[Feedback] Failed to notify admins:", err);
  }

  return result;
}

export { classifyByKeywords };
