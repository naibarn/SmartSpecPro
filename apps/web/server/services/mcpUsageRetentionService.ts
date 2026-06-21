import { and, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { mcpConnectionUsageEvents, mcpToolSchemaCache } from "../../drizzle/schema";
import { purgeExpiredMcpOAuthStates } from "./mcpOAuthBroker";

export async function compactMcpUsageSummaries(now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = await db
    .update(mcpConnectionUsageEvents)
    .set({ redactedSummary: sql`'{}'::jsonb` })
    .where(lt(mcpConnectionUsageEvents.occurredAt, cutoff))
    .returning({ id: mcpConnectionUsageEvents.id });
  return result.length;
}

export async function purgeExpiredMcpToolSchemas(now = new Date()) {
  const db = getDb();
  const result = await db
    .delete(mcpToolSchemaCache)
    .where(lt(mcpToolSchemaCache.expiresAt, now))
    .returning({ id: mcpToolSchemaCache.id });
  return result.length;
}

export async function runMcpUsageRetention(now = new Date()) {
  return {
    compactedUsageSummaries: await compactMcpUsageSummaries(now),
    purgedToolSchemas: await purgeExpiredMcpToolSchemas(now),
    purgedOAuthStates: purgeExpiredMcpOAuthStates(now),
  };
}
