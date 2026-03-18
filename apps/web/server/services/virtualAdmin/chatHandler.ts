import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { virtualAdminIncidents, virtualAdminApprovals, conversations, messages } from "../../../drizzle/schema";
import { getSensors, collectSafe } from "./sensorRegistry";
import { executeAction, decideApproval } from "./actuatorRegistry";

const HELP_TEXT = `## System Guardian Commands

- **status** — Show current sensor health summary
- **incidents** — List open incidents
- **retry <job_id>** — Retry a failed job
- **approve <approval_id>** — Approve a pending action
- **queue** — Show queue health details
- **help** — Show this help menu

Type any command to get started.`;

export async function handleGuardianMessage(
  adminUserId: number,
  message: string,
  tenantId: string | null,
): Promise<{ conversationId: number; response: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find or create guardian conversation
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, adminUserId),
        sql`${conversations.systemPrompt} LIKE '%[system_guardian]%'`,
        isNull(conversations.trashedAt),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  let conversationId: number;
  if (existing.length > 0) {
    conversationId = existing[0].id;
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({
        userId: adminUserId,
        title: "System Guardian",
        systemPrompt: "[system_guardian] You are the System Guardian assistant.",
      })
      .returning({ id: conversations.id });
    conversationId = conv.id;
  }

  // Save admin's message
  await db.insert(messages).values({
    conversationId,
    role: "user",
    content: message,
  });

  // Parse command and generate response
  let response: string;
  try {
    response = await routeCommand(message.trim().toLowerCase(), tenantId, adminUserId);
  } catch (err) {
    response = `Failed to execute command: ${err instanceof Error ? err.message : "Unknown error"}. Please try again or check the dashboard.`;
  }

  // Save response
  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content: response,
  });

  return { conversationId, response };
}

async function routeCommand(
  input: string,
  tenantId: string | null,
  adminUserId: number,
): Promise<string> {
  if (input.startsWith("status") || input.startsWith("health")) {
    return handleStatusCommand();
  }
  if (input.startsWith("incidents") || input.startsWith("problems")) {
    return handleIncidentsCommand(tenantId);
  }
  const retryMatch = input.match(/^retry\s+(\d+)/);
  if (retryMatch) {
    return handleRetryCommand(retryMatch[1], tenantId);
  }
  const approveMatch = input.match(/^approve\s+(\d+)/);
  if (approveMatch) {
    return handleApproveCommand(parseInt(approveMatch[1], 10), adminUserId);
  }
  if (input.startsWith("queue")) {
    return handleQueueCommand();
  }
  return HELP_TEXT;
}

async function handleStatusCommand(): Promise<string> {
  const sensors = getSensors();
  if (sensors.length === 0) {
    return "No sensors registered yet. Sensors initialize on guardian startup.";
  }

  const readings = await Promise.all(
    sensors.map(async (s) => {
      const r = await collectSafe(s);
      const icon = r.status === "healthy" ? "✅" : r.status === "degraded" ? "⚠️" : r.status === "critical" ? "🔴" : "❓";
      return `| ${icon} ${s.name} | ${r.status} | ${r.message} |`;
    }),
  );

  return `## System Health\n\n| Sensor | Status | Message |\n|--------|--------|----------|\n${readings.join("\n")}`;
}

async function handleIncidentsCommand(tenantId: string | null): Promise<string> {
  const db = await getDb();
  if (!db) return "Database unavailable.";

  const conditions = [eq(virtualAdminIncidents.status, "open")];
  if (tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, tenantId));

  const incidents = await db
    .select()
    .from(virtualAdminIncidents)
    .where(and(...conditions))
    .orderBy(desc(virtualAdminIncidents.severity), desc(virtualAdminIncidents.createdAt))
    .limit(25);

  if (incidents.length === 0) return "No open incidents. All systems operating normally.";

  const lines = incidents.map((i) => {
    const age = Math.round((Date.now() - new Date(i.createdAt).getTime()) / 60000);
    return `- **#${i.id}** [${i.severity}] ${i.title} (${age}min ago)`;
  });

  return `## Open Incidents (${incidents.length})\n\n${lines.join("\n")}`;
}

async function handleRetryCommand(jobId: string, tenantId: string | null): Promise<string> {
  const result = await executeAction(
    "retry_failed_job",
    { taskId: jobId },
    { id: 0, severity: "info", tenantId },
    tenantId ?? undefined,
  );
  return result.success ? `Job ${jobId} retried successfully.` : `Retry failed: ${result.message}`;
}

async function handleApproveCommand(approvalId: number, adminUserId: number): Promise<string> {
  const result = await decideApproval(approvalId, "approved", adminUserId, "Approved via chat");
  if (result.success) return `Approval #${approvalId} approved and action executed.`;
  if (result.message.includes("already decided")) return "Already decided by another admin.";
  return `Approval failed: ${result.message}`;
}

async function handleQueueCommand(): Promise<string> {
  try {
    const { getQueueHealthStatus } = await import("../queueHealthMonitor");
    const status = await getQueueHealthStatus();
    if (!status) return "Queue health monitor not available.";

    const queues = status.queues as Record<string, any> ?? {};
    const lines = Object.entries(queues).map(
      ([name, info]) => `| ${name} | ${(info as any)?.waiting ?? 0} | ${(info as any)?.active ?? 0} |`,
    );

    const alerts = (status.activeAlerts as any[]) ?? [];
    const alertLine = alerts.length > 0 ? `\n\n⚠️ ${alerts.length} active alert(s)` : "\n\n✅ No active alerts";

    return `## Queue Health\n\n| Queue | Waiting | Active |\n|-------|---------|--------|\n${lines.join("\n")}${alertLine}`;
  } catch {
    return "Queue health data unavailable.";
  }
}
