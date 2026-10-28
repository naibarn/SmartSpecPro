import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { workerJobs } from "../../drizzle/schema";
import { CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT, CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB } from "./cloudflareProductionDeploymentContract";

/** Build a real Drizzle query so schema-backed tests can validate the selected projection. */
export function buildLatestCloudflareProductionWorkerCanaryJobQuery(db: DrizzleDB, input: {
  tenantId: string;
  projectId: string;
}) {
  return db.select({
    jobId: workerJobs.id,
    status: workerJobs.status,
    errorCode: workerJobs.errorCode,
    output: workerJobs.outputJson,
    input: workerJobs.inputJson,
    progress: workerJobs.progressJson,
    attempt: workerJobs.attempt,
    maxAttempts: workerJobs.maxAttempts,
    requesterUserId: workerJobs.requestedByUserId,
    createdAt: workerJobs.createdAt,
    heartbeatAt: workerJobs.heartbeatAt,
    leaseExpiresAt: workerJobs.leaseExpiresAt,
  }).from(workerJobs).where(and(
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.jobType, CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB),
    eq(workerJobs.contractVersion, CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT),
    sql`${workerJobs.inputJson}->>'projectId' = ${input.projectId}`,
  )).orderBy(desc(workerJobs.createdAt)).limit(1);
}

/** Read only the newest canonical Worker canary job within the selected tenant and project. */
export async function readLatestCloudflareProductionWorkerCanaryJob(db: DrizzleDB, input: {
  tenantId: string;
  projectId: string;
}) {
  const [job] = await buildLatestCloudflareProductionWorkerCanaryJobQuery(db, input);

  if (!job) return null;
  // Keep nullable JSONB columns explicit for tRPC/JSON consumers.
  return { ...job, errorCode: job.errorCode ?? null, output: job.output ?? null,
    input: job.input ?? null, progress: job.progress ?? null,
    heartbeatAt: job.heartbeatAt ?? null, leaseExpiresAt: job.leaseExpiresAt ?? null };
}
