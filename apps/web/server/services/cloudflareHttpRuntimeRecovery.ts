import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { decrypt } from "./crypto";
import { createJobControlPlane } from "./jobControlPlane";
import { readHttpRuntimeIntent } from "./cloudflareHttpRuntimeAdmission";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { getHttpRuntimePlan } from "./cloudflareHttpRuntimePlan";
import { HTTP_RUNTIME_JOB, HTTP_RUNTIME_CONTRACT } from "./cloudflareHttpRuntimeContract";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Existing canonical recovery, using only the unchanged unexpired Owner
 * intent. This specific failure occurred on GET of paginated M2 history,
 * before role creation, provider writes or paid compute. Unknown outcomes and
 * any nonempty execution checkpoint are reconciliation-only, never retried. */
export async function recoverHttpRuntimePrewrite(db: DrizzleDB, jobId: string) {
  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
  if (!job || job.jobType !== HTTP_RUNTIME_JOB || job.contractVersion !== HTTP_RUNTIME_CONTRACT || !job.requestedByUserId ||
      job.status !== "failed" || job.attempt !== 1 || job.maxAttempts !== 1 || job.fencingVersion !== 1 ||
      job.leaseOwnerToken || job.leaseExpiresAt || job.errorCode !== "HTTP_RUNTIME_PROVIDER_HTTP_200")
    throw Error("HTTP_RUNTIME_PREWRITE_RECOVERY_JOB_DENIED");
  const scope = { tenantId: job.tenantId, projectId: String(job.inputJson.projectId), actorUserId: job.requestedByUserId };
  await assertHttpCandidateOwner(db, scope);
  const row = await readHttpRuntimeIntent(db, jobId), intent = row?.valueJson;
  if (!intent || row?.updatedBy !== scope.actorUserId || intent.actorUserId !== scope.actorUserId || intent.tenantId !== scope.tenantId ||
      intent.projectId !== scope.projectId || intent.submissionId !== jobId || intent.revokedAt !== null ||
      intent.authority !== "existing-candidate-bounded-runtime-test-v1" || intent.planDigest !== job.inputJson.planDigest ||
      digest(intent.plan) !== intent.planDigest || intent.plan.candidateJobId !== job.inputJson.candidateJobId ||
      intent.trafficMutation !== false || intent.dnsMutation !== false || intent.applicationCreation !== false ||
      intent.imagePublication !== false || intent.fixtureCreation !== false || !Number.isFinite(Date.parse(intent.expiresAt)) ||
      Date.parse(intent.expiresAt) <= Date.now() + 15 * 60_000 || new Date(job.createdAt).getTime() + 30 * 60_000 <= Date.now() + 15 * 60_000)
    throw Error("HTTP_RUNTIME_PREWRITE_RECOVERY_AUTHORITY_DENIED");
  const checkpoints = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_production_native_runtime_checkpoints"),
    eq(systemSettings.key, jobId))).limit(2);
  let checkpoint: Record<string, any> | undefined;
  try { if (checkpoints.length === 1 && checkpoints[0].isSensitive && checkpoints[0].updatedBy === scope.actorUserId && checkpoints[0].value)
    checkpoint = JSON.parse(decrypt(checkpoints[0].value)); } catch { /* Never disclose encrypted execution material. */ }
  if (!checkpoint || checkpoint.jobId !== jobId || checkpoint.tenantId !== scope.tenantId || checkpoint.projectId !== scope.projectId ||
      checkpoint.actorUserId !== scope.actorUserId || checkpoint.planDigest !== intent.planDigest || checkpoint.stage !== "PREPARING" ||
      checkpoint.rolePrepared !== false || checkpoint.providerWriteIntent !== false || checkpoint.roleSecret || checkpoint.configurationRef || checkpoint.deploymentId)
    throw Error("HTTP_RUNTIME_PREWRITE_RECOVERY_CHECKPOINT_DENIED");
  const preflight = await getHttpRuntimePlan(db, scope, String(job.inputJson.candidateJobId), intent.plan);
  if (preflight.planDigest !== intent.planDigest) throw Error("HTTP_RUNTIME_PREWRITE_RECOVERY_PLAN_CHANGED");
  const actionId = `native-runtime-prewrite:${jobId}`;
  const accepted = await createJobControlPlane().recoverReviewGatedJob(jobId, actionId, "verified_m2_deployment_history_pagination_repaired",
    { disposition: "pre_submission_failure", knownRuntime: "cloudflare_native_runtime_prewrite",
      operationKey: `native-runtime-prewrite:${jobId}:${intent.planDigest}`, replacementGrantRef: jobId, replacementGrantExpiresAt: intent.expiresAt },
    undefined, { tenantId: scope.tenantId, requestedByUserId: scope.actorUserId,
      authorizationScope: "infrastructure.cloudflare_native_runtime_technical_recovery" });
  return { jobId, accepted, originalIntentId: jobId, newIntentIssued: false, reviewedArtifact: intent.plan.artifactRef,
    trafficMutation: false, paidStartsAdded: 0 };
}
