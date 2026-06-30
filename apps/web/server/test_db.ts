import { getDb } from "./db/index.js";
import { workerJobs } from "../drizzle/schema.js";
import { eq, like } from "drizzle-orm";

async function run() {
  const db = await getDb();
  const jobs = await db.select().from(workerJobs).where(like(workerJobs.id, 'ced48ab9%'));
  console.log(JSON.stringify(jobs, null, 2));
}
run().catch(console.error).finally(() => process.exit(0));
