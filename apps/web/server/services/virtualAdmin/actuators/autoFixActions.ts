import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { llmProviders } from "../../../../drizzle/schema";
import { registerActuator } from "../actuatorRegistry";
import type { ActuatorFn } from "../types";
import fs from "node:fs";
import path from "node:path";

const retryFailedJob: ActuatorFn = async (params) => {
  const { taskId } = params as { taskId?: string };
  if (!taskId) return { success: false, message: "No taskId provided" };
  return {
    success: false,
    message: `Legacy task retry is retired for ${taskId}; use the canonical worker_jobs control plane.`,
  };
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

const clearStaleCache: ActuatorFn = async () => {
  try {
    const db = await getDb();
    if (!db) return { success: false, message: "PostgreSQL not available" };
    const expired = await db.execute(sql<Array<{ key_hash: string }>>`
      DELETE FROM runtime_ephemeral_values
      WHERE expires_at <= now()
      RETURNING key_hash
    `);
    const deleted = expired.length;
    return {
      success: true,
      message: `Cleared ${deleted} expired PostgreSQL runtime values`,
      data: { deleted },
    };
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
