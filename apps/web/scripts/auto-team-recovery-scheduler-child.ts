import { closeDb } from "../server/db";
import postgres from "postgres";
import {
  initializeAutoTeamRecoveryScanJob,
  shutdownAutoTeamRecoveryScanJob,
} from "../server/jobs/autoTeamRecoveryScanJob";

if (!process.env.DATABASE_URL || !process.env.FEATURE_186_SYSTEM_TENANT_ID) {
  throw new Error("SPEC277_SCHEDULER_CHILD_CONTEXT_REQUIRED");
}

const mode = process.argv[2] ?? "schedule";
if (mode === "schedule") {
  initializeAutoTeamRecoveryScanJob();
  await new Promise(resolve => setTimeout(resolve, 1_000));
  shutdownAutoTeamRecoveryScanJob();
  await closeDb();
} else if (mode === "scan" || mode === "evaluate") {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
  try {
    console.error(`SPEC277_${mode.toUpperCase()}_START`);
    const jobType = mode === "scan"
      ? "auto-team.recovery.scan"
      : "auto-team.recovery.evaluate";
    const [job] = await sql<{ id: string }[]>`
      SELECT id FROM worker_jobs
      WHERE "jobType" = ${jobType} AND status = 'queued'
      ORDER BY "createdAt", id LIMIT 1
    `;
    if (!job) throw new Error(`SPEC277_${mode.toUpperCase()}_JOB_NOT_FOUND`);
    console.error(`SPEC277_${mode.toUpperCase()}_FOUND:${job.id}`);
    const [{ executeCanonicalJob }, { createJobControlPlane }, executorModule] = await Promise.all([
      import("../server/services/jobExecutor"),
      import("../server/services/jobControlPlane"),
      mode === "scan"
        ? import("../server/services/autoTeamRecoveryScanExecutor")
        : import("../server/services/autoTeamRecoveryEvaluationExecutor"),
    ]);
    const executor = mode === "scan"
      ? (executorModule as typeof import("../server/services/autoTeamRecoveryScanExecutor")).executeAutoTeamRecoveryScan
      : (executorModule as typeof import("../server/services/autoTeamRecoveryEvaluationExecutor")).executeAutoTeamRecoveryEvaluation;
    const result = await executeCanonicalJob(
      { jobId: job.id, runnerId: `spec277-${mode}-worker`, adapter: "postgres-pull" },
      { controlPlane: createJobControlPlane(), executor },
    );
    console.error(`SPEC277_${mode.toUpperCase()}_RESULT:${result.state}`);
    if (result.state !== "succeeded") throw new Error(`SPEC277_${mode.toUpperCase()}_JOB_NOT_COMPLETED`);
  } finally {
    await sql.end({ timeout: 2 });
    await closeDb();
  }
  // Runtime modules can register process-local monitors; this disposable
  // worker must terminate after its persisted canonical job is complete.
  process.exit(0);
} else if (mode === "interrupt" || mode === "recover") {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
  try {
    const [{ createJobControlPlane }, { createJobReporter }] = await Promise.all([
      import("../server/services/jobControlPlane"),
      import("../server/services/jobReporter"),
    ]);
    const controlPlane = createJobControlPlane();
    const [job] = await sql<{ id: string }[]>`
      SELECT id FROM worker_jobs
      WHERE "jobType" = 'auto-team.recovery.scan'
      ORDER BY "createdAt", id LIMIT 1
    `;
    if (!job) throw new Error(`SPEC277_${mode.toUpperCase()}_SCAN_JOB_NOT_FOUND`);
    if (mode === "interrupt") {
      const lease = await controlPlane.claim({
        jobId: job.id,
        runnerId: "spec277-interrupted-scan-worker",
        adapter: "postgres-pull",
      });
      if (!lease) throw new Error("SPEC277_INTERRUPTED_SCAN_CLAIM_FAILED");
      await controlPlane.start(lease);
      const reporter = createJobReporter(controlPlane);
      await reporter.progress(lease, {
        progress: 37,
        stage: "scan_checkpoint",
        message: "Persisted synthetic worker checkpoint before forced interruption.",
      });
      console.error("SPEC277_SCAN_CHECKPOINT_PERSISTED");
      await new Promise(resolve => setTimeout(resolve, 60_000));
    } else {
      const recovered = await controlPlane.recoverExpiredLease(job.id);
      if (recovered !== "recovered") throw new Error("SPEC277_SCAN_LEASE_RECOVERY_FAILED");
      const deadline = Date.now() + 20_000;
      let retryMadeDue = false;
      while (Date.now() < deadline) {
        const [current] = await sql<{ status: string; nextRetryAt: Date | null }[]>`
          SELECT status, "nextRetryAt" FROM worker_jobs WHERE id = ${job.id}
        `;
        if (current.status === "retry_scheduled" && current.nextRetryAt && current.nextRetryAt <= new Date()) {
          if (!await controlPlane.makeRetryDue(job.id)) throw new Error("SPEC277_SCAN_RETRY_DUE_FAILED");
          retryMadeDue = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!retryMadeDue) throw new Error("SPEC277_SCAN_RETRY_DUE_TIMEOUT");
    }
  } finally {
    await sql.end({ timeout: 2 });
    await closeDb();
  }
  if (mode === "recover") process.exit(0);
} else {
  throw new Error("SPEC277_CHILD_MODE_INVALID");
}
