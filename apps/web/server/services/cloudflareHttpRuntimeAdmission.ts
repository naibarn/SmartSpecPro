import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { assertHttpCandidateOwner } from "./cloudflareHttpCandidatePreparation";
import { getHttpRuntimePlan } from "./cloudflareHttpRuntimePlan";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { HTTP_RUNTIME_CATEGORY, HTTP_RUNTIME_CONTRACT, HTTP_RUNTIME_JOB, httpRuntimeDiagnosticSchema } from "./cloudflareHttpRuntimeContract";
import { decrypt } from "./crypto";

type Scope = { tenantId: string; projectId: string; actorUserId: number };
export const httpRuntimeIntentWhere = (id: string) => and(eq(systemSettings.category, HTTP_RUNTIME_CATEGORY), eq(systemSettings.key, id));
export async function readHttpRuntimeIntent(db: DrizzleDB, id: string) {
  const [row] = await db.select().from(systemSettings).where(httpRuntimeIntentWhere(id)).limit(1); return row;
}
export async function readHttpRuntimeOperation(db: DrizzleDB, scope: Scope) {
  await assertHttpCandidateOwner(db, scope);
  const [job] = await db.select().from(workerJobs).where(and(eq(workerJobs.tenantId, scope.tenantId),
    eq(workerJobs.jobType, HTTP_RUNTIME_JOB), eq(workerJobs.contractVersion, HTTP_RUNTIME_CONTRACT),
    eq(workerJobs.requestedByUserId, scope.actorUserId), sql`${workerJobs.inputJson}->>'projectId'=${scope.projectId}`))
    .orderBy(sql`${workerJobs.createdAt} DESC`).limit(1);
  if (!job) return null;
  let checkpoint: { stage: string; failure?: string; deploymentId?: string; versionId?: string; rolePrepared: boolean; probes: unknown; cleanup: unknown; runtimeDiagnostics?: unknown } | null = null;
  const [saved] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, "cloudflare_production_native_runtime_checkpoints"), eq(systemSettings.key, job.id))).limit(1);
  if (saved?.isSensitive && saved.value && saved.updatedBy === scope.actorUserId) {
    try { const value = JSON.parse(decrypt(saved.value));
      if (value.jobId === job.id && value.tenantId === scope.tenantId && value.projectId === scope.projectId && value.actorUserId === scope.actorUserId)
        checkpoint = { stage: value.stage, failure: value.failure, deploymentId: value.deploymentId, versionId: value.versionId,
          rolePrepared: value.rolePrepared === true, probes: value.probes, cleanup: value.cleanup,
          runtimeDiagnostics: Array.isArray(value.runtimeDiagnostics) ? value.runtimeDiagnostics.slice(0, 2).flatMap((entry: unknown) => {
            const parsed = httpRuntimeDiagnosticSchema.safeParse(entry); return parsed.success ? [parsed.data] : [];
          }) : undefined };
    } catch { /* No ciphertext/driver error is exposed through diagnostics. */ }
  }
  return { jobId: job.id, candidateJobId: String(job.inputJson?.candidateJobId), status: job.status, attempt: job.attempt, maxAttempts: job.maxAttempts,
    errorCode: job.errorCode, receipt: job.outputJson, heartbeatAt: job.heartbeatAt, checkpoint };
}

export async function readPendingHttpRuntimeIntent(db: DrizzleDB, scope: Scope) {
  await assertHttpCandidateOwner(db, scope);
  const [row] = await db.select().from(systemSettings).where(and(eq(systemSettings.category, HTTP_RUNTIME_CATEGORY),
    eq(systemSettings.updatedBy, scope.actorUserId), sql`${systemSettings.valueJson}->>'tenantId'=${scope.tenantId}`,
    sql`${systemSettings.valueJson}->>'projectId'=${scope.projectId}`)).orderBy(sql`${systemSettings.createdAt} DESC`).limit(1);
  const value = row?.valueJson;
  if (!value || value.actorUserId !== scope.actorUserId) return null;
  return { submissionId: row.key, planDigest: String(value.planDigest), candidateJobId: String(value.plan.candidateJobId),
    artifactRef: String(value.plan.artifactRef), workerSourceSha: String(value.plan.workerSourceSha),
    expiresAt: String(value.expiresAt), revoked: value.revokedAt !== null };
}

/** One normal authenticated Owner operation through the existing canonical
 * control plane. No new scheduler/approval engine or ambient CLI authority.
 * Stable submission ID survives uncertain admission; NEVER delete its intent
 * or submit another job to compensate for a lost HTTP response. */
export async function prepareHttpRuntime(db: DrizzleDB, input: Scope & { candidateJobId: string; submissionId: string;
  planDigest: string; artifactRef: string; workerSourceSha: string; correlationId: string }) {
  await assertHttpCandidateOwner(db, input);
  const intent = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`native-runtime:${input.tenantId}:${input.projectId}`}))`);
    const old = await readHttpRuntimeIntent(tx as unknown as DrizzleDB, input.submissionId);
    if (old) {
      const value = old.valueJson as Record<string, any>;
      if (old.updatedBy !== input.actorUserId || value.actorUserId !== input.actorUserId || value.tenantId !== input.tenantId ||
          value.projectId !== input.projectId || value.planDigest !== input.planDigest || value.plan.candidateJobId !== input.candidateJobId)
        throw Error("HTTP_RUNTIME_SUBMISSION_SCOPE_DENIED");
      return value;
    }
    const [previous] = await tx.select().from(systemSettings).where(and(eq(systemSettings.category, HTTP_RUNTIME_CATEGORY),
      sql`${systemSettings.valueJson}->>'tenantId'=${input.tenantId}`, sql`${systemSettings.valueJson}->>'projectId'=${input.projectId}`)).limit(1);
    if (previous) throw Error("HTTP_RUNTIME_EXISTING_SUBMISSION_RECONCILE_REQUIRED");
    const preflight = await getHttpRuntimePlan(db, input, input.candidateJobId, input);
    if (preflight.planDigest !== input.planDigest) throw Error("HTTP_RUNTIME_REVIEWED_PLAN_CHANGED");
    const value = { tenantId: input.tenantId, projectId: input.projectId, actorUserId: input.actorUserId,
      submissionId: input.submissionId, planDigest: preflight.planDigest, plan: preflight.plan,
      issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(), revokedAt: null,
      authority: "existing-candidate-bounded-runtime-test-v1", trafficMutation: false, dnsMutation: false,
      imagePublication: false, applicationCreation: false, fixtureCreation: false };
    await tx.insert(systemSettings).values({ category: HTTP_RUNTIME_CATEGORY, key: input.submissionId,
      valueJson: value, updatedBy: input.actorUserId,
      description: "Owner: exact existing Candidate role/bindings, bounded Container tests and compensation; no production traffic" });
    return value;
  });
  const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, input.submissionId)).limit(1);
  if (job) {
    if (job.tenantId !== input.tenantId || job.requestedByUserId !== input.actorUserId || job.jobType !== HTTP_RUNTIME_JOB ||
        job.contractVersion !== HTTP_RUNTIME_CONTRACT || job.inputJson?.planDigest !== input.planDigest ||
        job.inputJson?.candidateJobId !== input.candidateJobId) throw Error("HTTP_RUNTIME_CANONICAL_JOB_SCOPE_DENIED");
    return { jobId: job.id, status: job.status };
  }
  if (intent.revokedAt !== null || !Number.isFinite(Date.parse(intent.expiresAt)) || Date.parse(intent.expiresAt) <= Date.now())
    throw Error("HTTP_RUNTIME_AUTHORIZATION_EXPIRED");
  return createControlPlaneJob({ context: { tenantId: input.tenantId, actorType: "user", actorId: input.actorUserId,
    authorizationScope: "infrastructure.cloudflare_production_native_runtime_verify", correlationId: input.correlationId,
    idempotencyKey: `native-runtime:${input.submissionId}` }, definition: {
      jobType: HTTP_RUNTIME_JOB, contractVersion: HTTP_RUNTIME_CONTRACT, executionClass: "long", priority: 45,
      input: { contractVersion: HTTP_RUNTIME_CONTRACT, projectId: input.projectId, candidateJobId: input.candidateJobId,
        submissionId: input.submissionId, planDigest: input.planDigest },
      idempotencyKey: `native-runtime:${input.submissionId}`, activeDedupeKey: `native-runtime:${input.tenantId}:${input.projectId}`,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 2000, maxDelayMs: 5000, jitter: "bounded", deadlineMs: 30 * 60_000, allowedErrorClasses: [] },
      timeoutPolicy: { softTimeoutMs: 20 * 60_000, hardTimeoutMs: 30 * 60_000 } },
    createOptions: { canonicalJobId: input.submissionId, runtimeType: "node_job_worker" } });
}
