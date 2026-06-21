import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { mcpToolSchemaCache } from "../../drizzle/schema";
import { projectMcpToolInputSchema } from "../../shared/mcpToolSchemaProjection";

export async function getCachedMcpToolSchema(params: {
  tenantId: string;
  providerTemplateId: string;
  connectionId?: string;
  toolName: string;
}) {
  const db = getDb();
  const conditions = [
    eq(mcpToolSchemaCache.tenantId, params.tenantId),
    eq(mcpToolSchemaCache.providerTemplateId, params.providerTemplateId),
    eq(mcpToolSchemaCache.toolName, params.toolName),
    gt(mcpToolSchemaCache.expiresAt, new Date()),
  ];
  if (params.connectionId) conditions.push(eq(mcpToolSchemaCache.connectionId, params.connectionId));
  const [row] = await db.select().from(mcpToolSchemaCache).where(and(...conditions)).limit(1);
  return row ?? null;
}

export async function upsertMcpToolSchemaCache(params: {
  tenantId: string;
  providerTemplateId: string;
  connectionId?: string | null;
  toolName: string;
  inputSchema: Record<string, unknown>;
  ttlSeconds: number;
}) {
  const projection = projectMcpToolInputSchema({ toolName: params.toolName, inputSchema: params.inputSchema });
  const db = getDb();
  const [row] = await db.insert(mcpToolSchemaCache).values({
    tenantId: params.tenantId,
    providerTemplateId: params.providerTemplateId,
    connectionId: params.connectionId ?? null,
    toolName: params.toolName,
    schemaHash: projection.schemaHash,
    inputSchema: params.inputSchema,
    safeProjection: projection as unknown as Record<string, unknown>,
    expiresAt: new Date(Date.now() + params.ttlSeconds * 1000),
  }).returning();
  return row;
}
