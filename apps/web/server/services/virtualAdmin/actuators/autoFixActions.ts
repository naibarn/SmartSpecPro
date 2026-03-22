import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { llmProviders } from "../../../../drizzle/schema";
import { registerActuator } from "../actuatorRegistry";
import type { ActuatorFn } from "../types";
import fs from "node:fs";
import path from "node:path";

const retryFailedJob: ActuatorFn = async (params) => {
  const { taskId, queueName } = params as { taskId?: string; queueName?: string };
  if (!taskId) return { success: false, message: "No taskId provided" };

  try {
    // Try Python backend for Celery tasks
    const res = await fetch("http://localhost:8000/api/internal/virtual-admin/retry-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return { success: true, message: `Task ${taskId} retried` };
    }
    return { success: false, message: `Retry failed: ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Retry failed" };
  }
};

const cleanupTempFiles: ActuatorFn = async (params) => {
  const dir = (params.directory as string) || path.resolve("../../python-backend/media_storage");
  const maxAgeMs = (params.maxAgeMs as number) || 12 * 24 * 60 * 60 * 1000; // 12 days
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;

  try {
    if (!fs.existsSync(dir)) return { success: true, message: "Directory not found", data: { deleted: 0 } };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    }
    return { success: true, message: `Cleaned up ${deleted} files`, data: { deleted } };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Cleanup failed" };
  }
};

const clearStaleCache: ActuatorFn = async (params) => {
  const pattern = (params.pattern as string) || "cache:*";
  let deleted = 0;

  try {
    const { getRedisClient } = await import("../../redis");
    const redis = getRedisClient();
    if (!redis) return { success: false, message: "Redis not available" };

    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl <= 0) {
          await redis.del(key);
          deleted++;
        }
      }
    } while (cursor !== "0");

    return { success: true, message: `Cleared ${deleted} stale cache keys`, data: { deleted } };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Cache clear failed" };
  }
};

const failoverProvider: ActuatorFn = async (params) => {
  const providerId = params.providerId as number;
  if (!providerId) return { success: false, message: "No providerId provided" };

  try {
    const db = await getDb();
    if (!db) return { success: false, message: "Database not available" };

    // Disable the failing provider
    await db
      .update(llmProviders)
      .set({ isEnabled: false })
      .where(eq(llmProviders.id, providerId));

    // Find a healthy fallback
    const fallbacks = await db
      .select({ id: llmProviders.id, name: llmProviders.displayName })
      .from(llmProviders)
      .where(sql`${llmProviders.isEnabled} = true AND ${llmProviders.id} != ${providerId}`)
      .limit(1);

    const fallbackName = fallbacks[0]?.name ?? "none";
    return {
      success: true,
      message: `Provider ${providerId} disabled, traffic routed to ${fallbackName}`,
      data: { disabledProvider: providerId, fallback: fallbackName },
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Failover failed" };
  }
};

// Register all auto-fix actions
registerActuator("retry_failed_job", retryFailedJob);
registerActuator("cleanup_temp_files", cleanupTempFiles);
registerActuator("clear_stale_cache", clearStaleCache);
registerActuator("failover_provider", failoverProvider);
