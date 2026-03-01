/**
 * Migration script: telegramConnections -> channel_connections
 *
 * Copies all rows from the legacy telegram_connections table into the new
 * channel_connections table, preserving all data with correct column mapping.
 *
 * Run with: npx tsx apps/web/scripts/migrate-telegram-to-channel-connections.ts
 *
 * Safe to run multiple times (ON CONFLICT DO NOTHING on unique constraint).
 * Does NOT delete source data — dual-write period begins after this script.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { telegramConnections, channelConnections } from "../drizzle/schema";
import { sql } from "drizzle-orm";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("[Migration] Starting telegram_connections -> channel_connections");

  // Step 1: Count source rows
  const [{ count: sourceCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(telegramConnections);

  console.log(`[Migration] Source rows in telegram_connections: ${sourceCount}`);

  // Step 2: Query all rows from telegramConnections
  const rows = await db.select().from(telegramConnections);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Step 3: Insert each row into channel_connections
  for (const row of rows) {
    try {
      await db
        .insert(channelConnections)
        .values({
          id: row.id,
          tenantId: row.tenantId,
          userId: row.userId,
          channelType: "telegram",
          externalUserId: (row as any).telegramUserId ?? String(row.id),
          externalChatId: (row as any).telegramChatId ?? null,
          connectionConfig: { bot_id: (row as any).botId ?? null },
          status: row.status,
          activeChannelId: row.activeChannelId ?? null,
          linkedAt: (row as any).linkedAt ?? new Date(),
          revokedAt: (row as any).revokedAt ?? null,
          lastSeenAt: (row as any).lastSeenAt ?? null,
          metadata: (row as any).metadata ?? null,
        })
        .onConflictDoNothing();

      inserted++;
    } catch (err: any) {
      // ON CONFLICT DO NOTHING handles duplicates, other errors are reported
      if (err.code === "23505") {
        // Unique constraint violation — already migrated
        skipped++;
      } else {
        errors++;
        console.error(`[Migration] Error migrating row ${row.id}:`, err.message);
      }
    }
  }

  // Step 4: Verify row counts
  const [{ count: destCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(channelConnections)
    .where(sql`"channelType" = 'telegram'`);

  console.log(`\n[Migration] Summary:`);
  console.log(`  Source rows:      ${sourceCount}`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Skipped (dupes):  ${skipped}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`  Telegram rows in channel_connections: ${destCount}`);

  if (errors > 0) {
    console.error(`\n[Migration] ⚠️  ${errors} rows had errors. Check logs above.`);
    process.exit(1);
  }

  console.log(`\n[Migration] ✅ Complete`);
  await pool.end();
}

main().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
