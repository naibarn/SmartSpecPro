import { registerActuator } from "../actuatorRegistry";
import type { ActuatorFn } from "../types";

const notifyAdmin: ActuatorFn = async (params, incident) => {
  try {
    const { dispatchNotification } = await import("../notifier");
    await dispatchNotification({
      tenantId: incident.tenantId ?? undefined,
      incidentId: incident.id,
      severity: incident.severity as any,
      title: (params.message as string) || `Incident #${incident.id}`,
      message: (params.message as string) || "Admin notification",
      ruleId: "manual_notify",
      sensorId: "manual",
    });
    return { success: true, message: "Admin notified" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Notification failed" };
  }
};

const notifyUser: ActuatorFn = async (params) => {
  const userId = params.userId as number;
  if (!userId) return { success: false, message: "No userId provided" };
  try {
    const { getDb } = await import("../../../db");
    const { userNotifications } = await import("../../../../drizzle/schema");
    const db = await getDb();
    if (!db) return { success: false, message: "DB unavailable" };
    await db.insert(userNotifications).values({
      userId,
      type: "system",
      title: (params.title as string) || "System Notification",
      content: (params.message as string) || "",
      priority: "normal",
    });
    return { success: true, message: `User ${userId} notified` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failed" };
  }
};

const notifySlack: ActuatorFn = async (params) => {
  const webhookUrl = (params.webhookUrl as string) || process.env.VIRTUAL_ADMIN_SLACK_WEBHOOK;
  if (!webhookUrl) return { success: false, message: "No Slack webhook configured" };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: (params.message as string) || "System notification" }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok
      ? { success: true, message: "Slack notification sent" }
      : { success: false, message: `Slack returned ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Slack failed" };
  }
};

registerActuator("notify_admin", notifyAdmin);
registerActuator("notify_user", notifyUser);
registerActuator("notify_slack", notifySlack);
