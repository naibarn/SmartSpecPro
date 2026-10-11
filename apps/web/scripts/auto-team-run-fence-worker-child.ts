import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../server/db";
import { teamRuns } from "../drizzle/schema";
import { withAutoTeamRunMutationFence } from "../server/services/autoTeamRunMutationFence";
import { withAutoTeamRunMutationFenceContext } from "../server/services/autoTeamRunMutationFence";
import * as runEngine from "../server/services/runEngine";
import { createJobControlPlane } from "../server/services/jobControlPlane";

type FenceInput = {
  role: "stale-worker" | "reclaiming-worker";
  tenantId: string;
  runId: string;
  jobId: string;
};

const input = JSON.parse(
  process.env.SPEC277_FENCE_INPUT ?? "null"
) as FenceInput | null;
if (!input || !process.env.DATABASE_URL)
  throw new Error("SPEC277_FENCE_CHILD_INPUT_INVALID");

async function run() {
  const db = getDb();
  await db.execute((await import("drizzle-orm")).sql`SELECT 1`);

  if (input.role === "stale-worker") {
    const controlPlane = createJobControlPlane();
    const lease = await controlPlane.claim({
      jobId: input.jobId,
      runnerId: "r7-stale-worker",
      adapter: "postgres-pull",
    });
    if (!lease) throw new Error("SPEC277_STALE_WORKER_CLAIM_FAILED");
    await controlPlane.start(lease);
    process.stdout.write(
      `SPEC277_FENCE_WORKER_READY ${JSON.stringify(lease)}\n`
    );
    await new Promise<void>(resolve => {
      const readline = createInterface({
        input: process.stdin,
        terminal: false,
      });
      readline.once("line", () => {
        readline.close();
        resolve();
      });
    });
    try {
      await withAutoTeamRunMutationFenceContext(
        {
          lease,
          tenantId: input.tenantId,
          runId: input.runId,
        },
        () => runEngine.stopRun(input.runId, "stale_worker", input.tenantId)
      );
      process.stdout.write("SPEC277_FENCE_MUTATION_ACCEPTED\n");
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code !== "AUTO_TEAM_RUN_MUTATION_FENCE_REJECTED") throw error;
      process.stdout.write("SPEC277_FENCE_MUTATION_REJECTED\n");
    }
    return;
  }

  const controlPlane = createJobControlPlane();
  process.stdout.write("SPEC277_FENCE_RECOVERY_START\n");
  const recovered = await controlPlane.recoverExpiredLease(
    input.jobId,
    new Date()
  );
  if (recovered !== "recovered")
    throw new Error("SPEC277_FENCE_RECLAIM_NOT_RECOVERED");
  process.stdout.write("SPEC277_FENCE_RECOVERY_DONE\n");
  if (!(await controlPlane.makeRetryDue(input.jobId))) {
    throw new Error("SPEC277_FENCE_RETRY_NOT_DUE");
  }
  process.stdout.write("SPEC277_FENCE_RETRY_DUE\n");
  const nextLease = await controlPlane.claim({
    jobId: input.jobId,
    runnerId: "r7-reclaim-worker",
    adapter: "postgres-pull",
  });
  if (!nextLease) throw new Error("SPEC277_FENCE_RECLAIM_CLAIM_FAILED");
  process.stdout.write("SPEC277_FENCE_CLAIMED\n");
  await controlPlane.start(nextLease);
  process.stdout.write("SPEC277_FENCE_STARTED\n");
  await withAutoTeamRunMutationFence({
    lease: nextLease,
    tenantId: input.tenantId,
    runId: input.runId,
    mutate: tx =>
      tx
        .update(teamRuns)
        .set({
          runtimeStateJson: {
            lastAcceptedWorkerGeneration: nextLease.fencingVersion,
          },
          stopReason: null,
        })
        .where(eq(teamRuns.id, input.runId)),
  });
  process.stdout.write("SPEC277_FENCE_RECLAIM_MUTATION_ACCEPTED\n");
}

let exitCode = 0;
try {
  await run();
} catch (error) {
  exitCode = 1;
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
} finally {
  await closeDb();
}
await new Promise<void>(resolve => process.stdout.write("", resolve));
process.exit(exitCode);
