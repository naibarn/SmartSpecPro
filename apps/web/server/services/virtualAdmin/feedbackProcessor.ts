import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db";
import { feedbackTickets, virtualAdminIncidents, users } from "../../../drizzle/schema";
import { createNotification } from "../notificationService";

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
  if (tenantId) conditions.push(eq(feedbackTickets.tenantId, tenantId));

  const existing = await db
    .select({ id: feedbackTickets.id })
    .from(feedbackTickets)
    .where(and(...conditions))
    .limit(1);

  return existing[0]?.id ?? null;
}

// Correlate: find related open incidents by keyword match
async function findRelatedIncident(title: string, tenantId?: string | null): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const keywords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
  if (keywords.length === 0) return null;

  const conditions = [eq(virtualAdminIncidents.status, "open")];
  if (tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, tenantId));

  const incidents = await db
    .select({ id: virtualAdminIncidents.id, title: virtualAdminIncidents.title })
    .from(virtualAdminIncidents)
    .where(and(...conditions))
    .orderBy(desc(virtualAdminIncidents.createdAt))
    .limit(20);

  for (const inc of incidents) {
    const incTitle = inc.title.toLowerCase();
    if (keywords.some((k) => incTitle.includes(k))) {
      return inc.id;
    }
  }
  return null;
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
  const relatedIncidentId = await findRelatedIncident(ticket.title, ticket.tenantId);

  const result: ProcessedTicket = {
    autoCategory: category,
    autoPriority: priority,
    autoSummary: `Auto-classified as ${category} (${priority} priority)`,
    duplicateOf: duplicateOf && duplicateOf !== ticketId ? duplicateOf : null,
    relatedIncidentId,
  };

  // Update ticket with processing results
  await db
    .update(feedbackTickets)
    .set({
      autoCategory: result.autoCategory,
      autoPriority: result.autoPriority,
      autoSummary: result.autoSummary,
      duplicateOf: result.duplicateOf,
      relatedIncidentId: result.relatedIncidentId,
      status: result.duplicateOf ? "duplicate" : "triaged",
      triagedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(feedbackTickets.id, ticketId));

  // Notify all admins about the new feedback ticket
  try {
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} IN ('admin', 'domain_admin')`);

    const priorityMap: Record<string, "low" | "normal" | "high" | "critical"> = {
      high: "high",
      normal: "normal",
      low: "low",
    };

    for (const admin of adminRows) {
      if (admin.id === ticket.submittedBy) continue;
      const hasIncident = result.relatedIncidentId != null;
      await createNotification({
        db,
        userId: admin.id,
        type: "alert",
        title: `New Feedback: ${ticket.title.slice(0, 80)}`,
        content: `[${ticket.ticketType}] ${result.autoSummary ?? ticket.title}\nTicket #${ticketId}`,
        priority: priorityMap[result.autoPriority ?? "normal"] ?? "normal",
        relatedResourceType: hasIncident ? "incident" : "feedback",
        relatedResourceId: String(ticketId),
        actionUrl: hasIncident
          ? `/admin/system-guardian?incident=${result.relatedIncidentId}`
          : `/admin/feedback-hub?ticketId=${ticketId}`,
        actionLabel: "View Feedback",
        metadata: {
          source: "guardian.feedbackProcessor",
          eventId: String(ticketId),
          relatedItems: {
            ruleId: result.relatedIncidentId != null ? String(result.relatedIncidentId) : "",
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
