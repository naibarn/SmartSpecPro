import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { McpToolSession } from "../_core/mcpRegistry";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function saveMcpSession(
  id: string,
  session: McpToolSession,
  ttlSeconds: number,
): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO mcp_http_sessions (id, session, expires_at, updated_at)
    VALUES (${id}::uuid, ${JSON.stringify(session)}::jsonb, now() + (${ttlSeconds} * interval '1 second'), now())
    ON CONFLICT (id) DO UPDATE SET
      session = EXCLUDED.session,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
  `);
}

export async function loadMcpSession(id: string, ttlSeconds: number): Promise<McpToolSession | null> {
  const result = await getDb().execute(sql<Array<{ session: McpToolSession }>>`
    UPDATE mcp_http_sessions
    SET expires_at = now() + (${ttlSeconds} * interval '1 second'), updated_at = now()
    WHERE id = ${id}::uuid AND expires_at > now()
    RETURNING session
  `);
  return result[0]?.session ?? null;
}

export async function deleteMcpSession(id: string): Promise<void> {
  await getDb().execute(sql`DELETE FROM mcp_http_sessions WHERE id = ${id}::uuid`);
}

export async function loadMcpToolReplay(
  tenantId: string,
  userId: number,
  toolName: string,
  idempotencyKey: string,
): Promise<unknown | null> {
  const keyHash = hash([tenantId, userId, toolName, idempotencyKey].join("\0"));
  const result = await getDb().execute(sql<Array<{ result: unknown }>>`
    SELECT result FROM mcp_tool_idempotency
    WHERE key_hash = ${keyHash} AND expires_at > now()
  `);
  return result[0]?.result ?? null;
}

export async function saveMcpToolReplay(
  tenantId: string,
  userId: number,
  toolName: string,
  idempotencyKey: string,
  result: unknown,
  ttlSeconds: number,
): Promise<void> {
  const keyHash = hash([tenantId, userId, toolName, idempotencyKey].join("\0"));
  await getDb().execute(sql`
    INSERT INTO mcp_tool_idempotency (key_hash, result, expires_at)
    VALUES (${keyHash}, ${JSON.stringify(result)}::jsonb, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (key_hash) DO UPDATE SET
      result = EXCLUDED.result,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
  `);
}

export async function saveMcpDownloadGrant(
  tokenHash: string,
  grant: Record<string, unknown>,
  ttlSeconds: number,
): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO mcp_download_grants (token_hash, "grant", expires_at)
    VALUES (${tokenHash}, ${JSON.stringify(grant)}::jsonb, now() + (${ttlSeconds} * interval '1 second'))
    ON CONFLICT (token_hash) DO UPDATE SET
      "grant" = EXCLUDED."grant",
      expires_at = EXCLUDED.expires_at
  `);
}

export async function loadMcpDownloadGrant(tokenHash: string): Promise<Record<string, unknown> | null> {
  const result = await getDb().execute(sql<Array<{ grant: Record<string, unknown> }>>`
    SELECT "grant" FROM mcp_download_grants
    WHERE token_hash = ${tokenHash} AND expires_at > now()
  `);
  return result[0]?.grant ?? null;
}
