import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { llmProviders, systemSettings } from "../../../../drizzle/schema";
import { registerActuator } from "../actuatorRegistry";
import type { ActuatorFn } from "../types";

const pauseQueue: ActuatorFn = async (params) => {
  const queueName = params.queueName as string;
  if (!queueName) return { success: false, message: "No queueName provided" };

  try {
    const { Queue } = await import("bullmq");
    const { getRedisClient } = await import("../../redis");
    const redis = getRedisClient();
    if (!redis) return { success: false, message: "Redis not available" };

    const queue = new Queue(queueName, { connection: redis as any });
    await queue.pause();
    await queue.close();
    return { success: true, message: `Queue ${queueName} paused` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Pause failed" };
  }
};

const restartCeleryWorker: ActuatorFn = async (params) => {
  const workerName = params.workerName as string | undefined;
  try {
    const res = await fetch("http://localhost:8000/api/internal/virtual-admin/restart-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_name: workerName }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      return { success: true, message: `Worker restart initiated${workerName ? ` for ${workerName}` : ""}` };
    }
    return { success: false, message: `Restart failed: ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Restart failed" };
  }
};

const disableProvider: ActuatorFn = async (params) => {
  const providerId = params.providerId as number;
  if (!providerId) return { success: false, message: "No providerId provided" };

  try {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    await db
      .update(llmProviders)
      .set({ isEnabled: false })
      .where(eq(llmProviders.id, providerId));

    return { success: true, message: `Provider ${providerId} disabled` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Disable failed" };
  }
};

const killStuckTask: ActuatorFn = async (params) => {
  const taskId = params.taskId as string;
  if (!taskId) return { success: false, message: "No taskId provided" };

  try {
    const res = await fetch("http://localhost:8000/api/internal/virtual-admin/revoke-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, terminate: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { success: true, message: `Task ${taskId} revoked` };
    }
    return { success: false, message: `Revoke failed: ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Revoke failed" };
  }
};

const emergencyMaintenance: ActuatorFn = async (params) => {
  const reason = (params.reason as string) || "System Guardian emergency maintenance";
  try {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    const existing = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, "system"),
          eq(systemSettings.key, "maintenance_mode"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(systemSettings)
        .set({ value: "true", updatedAt: new Date() })
        .where(eq(systemSettings.id, existing[0].id));
    } else {
      await db.insert(systemSettings).values({
        category: "system",
        key: "maintenance_mode",
        value: "true",
        isSensitive: false,
      });
    }

    return { success: true, message: `Maintenance mode enabled: ${reason}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Maintenance mode failed" };
  }
};

// Register all approval-required actions
registerActuator("pause_queue", pauseQueue);
registerActuator("restart_celery_worker", restartCeleryWorker);
registerActuator("disable_provider", disableProvider);
registerActuator("kill_stuck_task", killStuckTask);
registerActuator("emergency_maintenance", emergencyMaintenance);
