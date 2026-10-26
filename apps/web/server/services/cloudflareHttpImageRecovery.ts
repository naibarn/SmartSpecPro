import { and, eq } from "drizzle-orm";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { createJobControlPlane } from "./jobControlPlane";
import { createCloudflareHttpImageProvisionRuntime } from "./cloudflareHttpImageProvisionExecutor";
import { httpImageProvisionGrantSchema } from "./cloudflareHttpImageProvisionContract";

/** Trusted service repair, not Owner impersonation or new approval issuance.
 * Only the unused second attempt of the same live image grant can resume.
 * The diagnosed first attempt stopped during build, before a publication
 * checkpoint. Unknown or persisted publication intents remain reconciliation-only.
 */
export async function recoverHttpImagePrebuildRateLimit(db: DrizzleDB, jobId: string) {
  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
  if (!job || job.jobType !== "cloudflare.staging.http.image.provision" ||
      job.contractVersion !== "cloudflare-staging-http-image-v1" || !job.requestedByUserId ||
      job.status !== "failed" || job.attempt !== 1 || job.maxAttempts !== 2 ||
      job.errorCode !== "CloudflareHttpImageError" || job.errorMessage !== "HTTP_IMAGE_AUTHORITY_DENIED" ||
      job.leaseExpiresAt || job.leaseOwnerToken) throw Error("HTTP_IMAGE_RECOVERY_JOB_DENIED");
  const runtime = createCloudflareHttpImageProvisionRuntime();
  const grant = httpImageProvisionGrantSchema.parse(await runtime.resolveGrant(String(job.inputJson.grantRef)));
  if (grant.jobId !== job.id || grant.tenantId !== job.tenantId || grant.requesterUserId !== job.requestedByUserId ||
      grant.projectId !== job.inputJson.projectId || grant.planDigest !== job.inputJson.planDigest ||
      Math.min(Date.parse(grant.expiresAt), Date.parse(grant.plan.configurationExpiresAt)) <= Date.now()+8*60_000)
    throw Error("HTTP_IMAGE_RECOVERY_GRANT_DENIED");
  if (await runtime.loadCheckpoint(grant)) throw Error("HTTP_IMAGE_RECOVERY_PUBLICATION_RECONCILIATION_REQUIRED");
  const existing = await db.select({ id: systemSettings.id }).from(systemSettings).where(and(
    eq(systemSettings.category, "cloudflare_http_image_runs"), eq(systemSettings.key, jobId))).limit(1);
  if (existing.length) throw Error("HTTP_IMAGE_RECOVERY_PUBLICATION_RECONCILIATION_REQUIRED");
  const identity = { tenantId: grant.tenantId, projectId: grant.projectId, provider: "cloudflare", environment: "staging" };
  if (await runtime.resolveAccount(identity) !== grant.accountRef || await runtime.verifyExecutor(grant) !== grant.executorId)
    throw Error("HTTP_IMAGE_RECOVERY_EXECUTOR_DENIED");
  await runtime.withCredential(identity, async () => undefined);
  const accepted = await createJobControlPlane().recoverReviewGatedJob(jobId, `http-image-prebuild:${jobId}`, "verified_internal_grant_lookup_rate_limit_repaired",
    { disposition: "pre_submission_failure", knownRuntime: "cloudflare_http_image_prebuild_rate_limit",
      operationKey: `http-image-prebuild:${jobId}:${grant.planDigest}`, replacementGrantRef: grant.grantRef,
      replacementGrantExpiresAt: new Date(Math.min(Date.parse(grant.expiresAt), Date.parse(grant.plan.configurationExpiresAt))).toISOString() },
    undefined, { tenantId: job.tenantId, requestedByUserId: job.requestedByUserId,
      authorizationScope: "infrastructure.cloudflare_http_image_technical_recovery" });
  return { jobId, accepted, originalGrantRef: grant.grantRef, maxAttempts: job.maxAttempts, newGrantIssued: false, trafficMutation: false };
}
