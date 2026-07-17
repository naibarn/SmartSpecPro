import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc } from "drizzle-orm";
import { feedbackTickets } from "./drizzle/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function run(tenantId: string | null) {
  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(feedbackTickets.tenantId, tenantId));
  const query = db
    .select()
    .from(feedbackTickets)
    .orderBy(desc(feedbackTickets.createdAt))
    .limit(50)
    .offset(0);
  try {
    const rows = await (conditions.length > 0
      ? (query as any).where(and(...conditions))
      : query);
    console.log(
      `tenant=${tenantId}: ${rows.length} rows; ids=`,
      rows.slice(0, 12).map((r: any) => r.id),
    );
  } catch (e: any) {
    console.log(`tenant=${tenantId}: ERROR ->`, e.message);
  }
}
await run("tenant-ZCSKEM9s");
await run(null);
await pool.end();
