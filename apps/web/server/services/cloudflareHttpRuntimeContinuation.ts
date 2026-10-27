import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { decrypt } from "./crypto";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest, applicationDatabaseRolePlanSchema } from "./cloudflareApplicationDatabaseRole";
import { HTTP_RUNTIME_CATEGORY, HTTP_RUNTIME_CONTRACT, HTTP_RUNTIME_JOB } from "./cloudflareHttpRuntimeContract";

type Scope = { tenantId: string; projectId: string; actorUserId: number };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Historical evidence is NOT renewed execution authority. A fresh reviewed
 * Owner intent may reuse only an exactly owned, fully compensated Candidate.
 * No secret, expired grant or old attempt budget leaves this resolver. */
export async function readCompensatedHttpRuntime(db: DrizzleDB, scope: Scope, candidateJobId: string, jobId?: string) {
  const [job] = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    eq(workerJobs.requestedByUserId, scope.actorUserId), eq(workerJobs.jobType, HTTP_RUNTIME_JOB),
    eq(workerJobs.contractVersion, HTTP_RUNTIME_CONTRACT), sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`,
    ...(jobId ? [eq(workerJobs.id, jobId)] : []))).orderBy(sql`${workerJobs.createdAt} DESC`).limit(1);
  if (!job && !jobId) return null;
  const deny = (): never => { throw Error("HTTP_RUNTIME_PREVIOUS_EXECUTION_RECONCILE_REQUIRED"); };
  if (!job || job.status !== "failed" || job.operatorReviewRequired || job.leaseExpiresAt || !job.finishedAt ||
      job.inputJson?.candidateJobId !== candidateJobId) return deny();
  const [intent] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, HTTP_RUNTIME_CATEGORY), eq(systemSettings.key, job.id))).limit(1);
  const [saved] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_production_native_runtime_checkpoints"), eq(systemSettings.key, job.id))).limit(1);
  const value = intent?.valueJson;
  if (intent?.updatedBy !== scope.actorUserId || value?.tenantId !== scope.tenantId || value.projectId !== scope.projectId ||
      value.actorUserId !== scope.actorUserId || value.submissionId !== job.id || value.planDigest !== job.inputJson.planDigest ||
      value.authority !== "existing-candidate-bounded-runtime-test-v1" || value.revokedAt !== null || value.trafficMutation !== false ||
      value.dnsMutation !== false || value.imagePublication !== false || value.applicationCreation !== false || value.fixtureCreation !== false ||
      hash(value.plan) !== value.planDigest || value.plan.candidateJobId !== candidateJobId ||
      saved?.updatedBy !== scope.actorUserId || !saved.isSensitive || !saved.value) return deny();
  let state: Record<string, any>;
  try { state = JSON.parse(decrypt(saved.value)); } catch { return deny(); }
  if (!state || state.jobId !== job.id || state.tenantId !== scope.tenantId || state.projectId !== scope.projectId || state.actorUserId !== scope.actorUserId ||
      state.planDigest !== value.planDigest || state.stage !== "FAILED" || !state.rolePrepared ||
      !["nodeStopped", "pythonStopped", "candidateRestored", "roleLoginRevoked", "m2Preserved"].every(key => state.cleanup?.[key] === true) ||
      state.cleanup.candidateVersionId !== value.plan.candidate.versionId ||
      !/^[a-f0-9-]{36}$/.test(state.cleanup.candidateDeploymentId ?? "")) return deny();
  const rolePlan = applicationDatabaseRolePlanSchema.safeParse(state.rolePlan);
  if (!rolePlan.success || rolePlan.data.tenantId !== scope.tenantId || rolePlan.data.projectId !== scope.projectId ||
      state.roleSecret?.role !== applicationDatabaseRoleName(scope) || state.roleSecret?.planDigest !== applicationDatabaseRolePlanDigest(rolePlan.data) ||
      JSON.stringify(rolePlan.data.tables) !== JSON.stringify(value.plan.relations.tables) ||
      JSON.stringify(rolePlan.data.sequences) !== JSON.stringify(value.plan.relations.sequences)) return deny();
  return { jobId: job.id, planDigest: value.planDigest, rolePlan: rolePlan.data, relationsDigest: hash(value.plan.relations),
    imageSourceSha: String(value.plan.publication?.sourceSha ?? value.plan.candidate.imageSourceSha), workerSourceSha: String(value.plan.workerSourceSha),
    restoredBaseline: { deploymentId: String(state.cleanup.candidateDeploymentId), versionId: String(state.cleanup.candidateVersionId) } };
}

/** A failed synthetic application pass may be followed by a fresh Owner
 * action only when its exact canonical job is terminal and every mutation was
 * compensated. Its old intent and attempt budget are evidence only. */
export async function readCompensatedHttpApplicationAcceptance(db: DrizzleDB, scope: Scope, candidateJobId: string, jobId?: string) {
  const [job] = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    eq(workerJobs.requestedByUserId, scope.actorUserId), eq(workerJobs.jobType, HTTP_RUNTIME_JOB),
    eq(workerJobs.contractVersion, HTTP_RUNTIME_CONTRACT), eq(workerJobs.status, "failed"), sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`,
    sql`${workerJobs.inputJson}->>'operation'='application'`,
    sql`${workerJobs.inputJson}->>'candidateJobId'=${candidateJobId}`,
    ...(jobId ? [eq(workerJobs.id, jobId)] : []))).orderBy(sql`${workerJobs.createdAt} DESC`).limit(1);
  if (!job && !jobId) return null;
  const deny = (): never => { throw Error("HTTP_APPLICATION_PREVIOUS_EXECUTION_RECONCILE_REQUIRED"); };
  if (!job || job.status !== "failed" || job.attempt !== 1 || job.maxAttempts !== 1 || job.operatorReviewRequired || job.leaseExpiresAt || !job.finishedAt ||
      job.inputJson?.candidateJobId !== candidateJobId || job.inputJson?.operation !== "application") return deny();
  const [intent] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, HTTP_RUNTIME_CATEGORY), eq(systemSettings.key, job.id))).limit(1);
  const [saved] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_production_native_runtime_checkpoints"), eq(systemSettings.key, job.id))).limit(1);
  const value = intent?.valueJson;
  if (intent?.updatedBy !== scope.actorUserId || value?.tenantId !== scope.tenantId || value.projectId !== scope.projectId ||
      value.actorUserId !== scope.actorUserId || value.submissionId !== job.id || value.planDigest !== job.inputJson.planDigest ||
      value.operation !== "application" || value.authority !== "existing-candidate-bounded-application-acceptance-v1" ||
      value.revokedAt !== null || value.trafficMutation !== false || value.dnsMutation !== false || value.imagePublication !== false ||
      value.applicationCreation !== false || value.fixtureCreation !== true || hash(value.plan) !== value.planDigest ||
      value.plan.candidateJobId !== candidateJobId || value.plan.applicationAcceptance !== true ||
      saved?.updatedBy !== scope.actorUserId || !saved.isSensitive || !saved.value) return deny();
  let state: Record<string, any>;
  try { state = JSON.parse(decrypt(saved.value)); } catch { return deny(); }
  if (!state || state.jobId !== job.id || state.tenantId !== scope.tenantId || state.projectId !== scope.projectId || state.actorUserId !== scope.actorUserId ||
      state.planDigest !== value.planDigest || state.operation !== "application" || state.stage !== "FAILED" || !state.rolePrepared ||
      state.applicationFixtureCredentials || (Array.isArray(state.applicationFixtureUsers) && state.applicationFixtureUsers.length > 0) ||
      !["nodeStopped", "pythonStopped", "candidateRestored", "roleLoginRevoked", "applicationFixturesRemoved", "m2Preserved"]
        .every(key => state.cleanup?.[key] === true) || state.cleanup.candidateVersionId !== value.plan.candidate.versionId ||
      !/^[a-f0-9-]{36}$/.test(state.cleanup.candidateDeploymentId ?? "")) return deny();
  const rolePlan = applicationDatabaseRolePlanSchema.safeParse(state.rolePlan);
  if (!rolePlan.success || rolePlan.data.tenantId !== scope.tenantId || rolePlan.data.projectId !== scope.projectId ||
      state.roleSecret?.role !== applicationDatabaseRoleName(scope) || state.roleSecret?.planDigest !== applicationDatabaseRolePlanDigest(rolePlan.data) ||
      JSON.stringify(rolePlan.data.tables) !== JSON.stringify(value.plan.relations.tables) ||
      JSON.stringify(rolePlan.data.sequences) !== JSON.stringify(value.plan.relations.sequences)) return deny();
  return { jobId: job.id, planDigest: value.planDigest, rolePlan: rolePlan.data, relationsDigest: hash(value.plan.relations),
    imageSourceSha: String(value.plan.publication?.sourceSha ?? value.plan.candidate.imageSourceSha), workerSourceSha: String(value.plan.workerSourceSha),
    restoredBaseline: { deploymentId: String(state.cleanup.candidateDeploymentId), versionId: String(state.cleanup.candidateVersionId) } };
}
