/**
 * Migration script: agencyAgents.mcpServers JSONB → mcp_servers + mcp_server_assignments tables.
 *
 * Reads each agency_agents row where mcpServers IS NOT NULL, deduplicates by URL
 * within a tenant, creates mcp_servers rows, and links via mcp_server_assignments.
 *
 * This script is idempotent — it skips servers that already exist (by tenant + slug).
 *
 * Usage:
 *   npx tsx server/scripts/migrate-mcp-jsonb.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { mcpServers, mcpServerAssignments } from "../../drizzle/schema";
import { encrypt, decrypt } from "../services/crypto";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL!;

interface LegacyMcpEntry {
  url?: string;
  name?: string;
  transport?: string;
  enabled?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log("Starting MCP JSONB → mcp_servers migration...");

  // Step 1: Query all agents with mcpServers JSONB
  const rows = await db.execute<{
    id: string;
    agencyId: string;
    tenantId: string;
    mcpServers: LegacyMcpEntry[] | null;
    mcpServerTokensEncrypted: string | null;
  }>(sql`
    SELECT
      a.id,
      a."agencyId",
      ag."tenantId",
      a."mcpServers",
      a."mcpServerTokensEncrypted"
    FROM agency_agents a
    JOIN agencies ag ON ag.id = a."agencyId"
    WHERE a."mcpServers" IS NOT NULL
  `);

  console.log(`Found ${rows.rows.length} agents with mcpServers JSONB`);

  // Step 2: Deduplicate by URL per tenant
  const tenantServers = new Map<
    string,
    Map<string, { entry: LegacyMcpEntry; token?: string; serverId?: number }>
  >();

  for (const row of rows.rows) {
    const entries = row.mcpServers;
    if (!entries || !Array.isArray(entries)) continue;

    let tokens: Record<string, string> = {};
    if (row.mcpServerTokensEncrypted) {
      try {
        const decrypted = decrypt(row.mcpServerTokensEncrypted);
        tokens = JSON.parse(decrypted);
      } catch {
        console.warn(`  Failed to decrypt tokens for agent ${row.id}, skipping tokens`);
      }
    }

    if (!tenantServers.has(row.tenantId)) {
      tenantServers.set(row.tenantId, new Map());
    }
    const serverMap = tenantServers.get(row.tenantId)!;

    for (const entry of entries) {
      const url = entry.url || entry.name || "";
      if (!url) continue;

      const key = url.toLowerCase();
      if (!serverMap.has(key)) {
        const token = tokens[url] || tokens[entry.name || ""];
        serverMap.set(key, { entry, token });
      }
    }
  }

  // Step 3: Create mcp_servers rows
  let serversCreated = 0;
  let assignmentsCreated = 0;

  for (const [tenantId, serverMap] of tenantServers) {
    for (const [, data] of serverMap) {
      const name = data.entry.name || data.entry.url || "unnamed";
      const slug = slugify(name);

      // Check if already exists (idempotent)
      const existing = await db.execute(sql`
        SELECT id FROM mcp_servers WHERE "tenantId" = ${tenantId} AND slug = ${slug}
      `);

      let serverId: number;
      if (existing.rows.length > 0) {
        serverId = (existing.rows[0] as { id: number }).id;
        data.serverId = serverId;
        console.log(`  Server "${name}" already exists for tenant ${tenantId} (id=${serverId})`);
        continue;
      }

      const configHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(data.entry))
        .digest("hex");

      const result = await db
        .insert(mcpServers)
        .values({
          tenantId,
          name: name.slice(0, 100),
          slug,
          transportType: data.entry.transport || "http",
          enabled: data.entry.enabled !== false,
          config: { url: data.entry.url },
          oauthAccessTokenEncrypted: data.token ? encrypt(data.token) : null,
          configHash,
          riskLevel: "high",
        })
        .returning({ id: mcpServers.id });

      serverId = result[0].id;
      data.serverId = serverId;
      serversCreated++;
      console.log(`  Created server "${name}" (id=${serverId}) for tenant ${tenantId}`);
    }
  }

  // Step 4: Create mcp_server_assignments
  for (const row of rows.rows) {
    const entries = row.mcpServers;
    if (!entries || !Array.isArray(entries)) continue;

    const serverMap = tenantServers.get(row.tenantId);
    if (!serverMap) continue;

    for (const entry of entries) {
      const url = entry.url || entry.name || "";
      if (!url) continue;

      const key = url.toLowerCase();
      const data = serverMap.get(key);
      if (!data?.serverId) continue;

      // Check if assignment already exists (idempotent)
      const existing = await db.execute(sql`
        SELECT id FROM mcp_server_assignments
        WHERE mcp_server_id = ${data.serverId}
          AND target_type = 'agent'
          AND target_id = ${row.id}
      `);

      if (existing.rows.length > 0) continue;

      await db.insert(mcpServerAssignments).values({
        mcpServerId: data.serverId,
        targetType: "agent",
        targetId: row.id,
      });

      assignmentsCreated++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Servers created: ${serversCreated}`);
  console.log(`  Assignments created: ${assignmentsCreated}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
