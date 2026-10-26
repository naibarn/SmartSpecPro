import { readFile, readlink } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";

/** JIT readiness, not authority: shared Python admission counts cannot consume
 * a migration grant before the actual Node executor can accept it. */
export async function checkCloudflareExecutionReadiness(db: DrizzleDB) {
  const path = process.env.FEATURE_186_NODE_WORKER_HEARTBEAT_FILE ??
    "/home/dev/projects/SmartSpecPro/logs/smartspec-node-worker.heartbeat";
  let heartbeat: string;
  try { heartbeat = await readFile(path, "utf8"); }
  catch { return { ready: false as const, reason: "MIGRATION_WORKER_HEARTBEAT_UNAVAILABLE" }; }
  const [timestamp, phase, pid] = heartbeat.trim().split("\t");
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < -5000 || age > 30000 || !["alive", "polling"].includes(phase) || !/^[1-9][0-9]*$/.test(pid))
    return { ready: false as const, reason: "MIGRATION_WORKER_NOT_READY" };
  try {
    const workerPath = await readlink(`/proc/${pid}/cwd`);
    if (workerPath !== process.cwd()) return { ready: false as const, reason: "MIGRATION_WORKER_RELEASE_MISMATCH" };
  } catch { return { ready: false as const, reason: "MIGRATION_WORKER_NOT_READY" }; }
  const rows = await db.execute(sql`SELECT count(*)::int AS count FROM worker_jobs
    WHERE "runtimeType"='node_job_worker' AND status='queued'
    AND "createdAt" < now() - interval '30 seconds' AND "operatorReviewRequired"=false`);
  if (Number(rows[0]?.count ?? 0) > 0) return { ready: false as const, reason: "MIGRATION_WAITING_WORKER_CAPACITY" };
  return { ready: true as const, reason: null };
}
