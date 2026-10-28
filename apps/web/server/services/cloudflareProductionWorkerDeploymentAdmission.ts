import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { resolveCloudflareProductionDeploymentTarget, cloudflareProductionDeploymentGrantSchema,
  cloudflareProductionDeploymentJobSchema, CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB } from "./cloudflareProductionDeploymentContract";
import { resolveLatestPublishedCloudflareStagingArtifact } from "./cloudflareStagingArtifactAuthority";
import { getCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";
import { probeCloudflareProductionProviderInventory } from "./cloudflareProductionProviderInventory";
import { createControlPlaneJob } from "./jobControlPlaneGateway";

const SUBMISSIONS = "cloudflare_production_worker_deployment_submissions";
const ROUTE_PATTERN = "smartaihub.app/*" as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

type Scope = { tenantId: string; projectId: string };

async function approvalContractReady(fetchImpl: typeof fetch = fetch) {
  const config = await getAppRuntimeConfig();
  if (!config.webGatewayToken) return false;
  try {
    const response = await fetchImpl(`${config.pythonBackendUrl}/api/v1/approvals/internal/cloudflare-production-capabilities`, {
      headers: { "x-internal-token": config.webGatewayToken, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as { grantSchemas?: unknown };
    return response.ok && Array.isArray(body.grantSchemas) && body.grantSchemas.includes("cloudflare.production-deployment-grant.v2");
  } catch { return false; }
}

/** Read-only plan for uploading one immutable version and shifting only 1% to it. */
export async function getProductionWorkerCanaryPreflight(db: DrizzleDB, scope: Scope) {
  const blocked = (reason: string) => ({ ready: false as const, reason });
  const target = await resolveCloudflareProductionDeploymentTarget({ db, ...scope });
  if (!target) return blocked("PRODUCTION_TARGET_NOT_CONFIGURED");
  const executorId = process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim();
  if (!executorId) return blocked("PRODUCTION_EXECUTOR_ID_NOT_CONFIGURED");
  if (!(await approvalContractReady())) return blocked("PRODUCTION_APPROVAL_CONTRACT_UNAVAILABLE");

  const inventory = await probeCloudflareProductionProviderInventory({ db, ...scope });
  if (!("accessChecks" in inventory)) return blocked("PRODUCTION_PROVIDER_INVENTORY_UNAVAILABLE");
  if (!inventory.accessChecks.zone.complete) return blocked(inventory.accessChecks.zone.httpStatus === 403
    ? "WORKER_ZONE_PERMISSION_DENIED_HTTP_403" : inventory.accessChecks.zone.httpStatus === 401
      ? "WORKER_ZONE_PERMISSION_DENIED_HTTP_401" : `WORKER_ZONE_READ_HTTP_${inventory.accessChecks.zone.httpStatus ?? "UNAVAILABLE"}`);
  if (!inventory.accessChecks.routes.complete) return blocked(inventory.accessChecks.routes.httpStatus === 403
    ? "WORKER_ROUTE_PERMISSION_DENIED_HTTP_403" : inventory.accessChecks.routes.httpStatus === 401
      ? "WORKER_ROUTE_PERMISSION_DENIED_HTTP_401" : `WORKER_ROUTE_READ_HTTP_${inventory.accessChecks.routes.httpStatus ?? "UNAVAILABLE"}`);
  if (!inventory.domainRoute.zoneId) return blocked("WORKER_ZONE_SMARTAIHUB_APP_NOT_FOUND");
  if (!inventory.worker.deploymentInventoryComplete || inventory.worker.readbackReason) {
    return blocked(inventory.worker.readbackReason ?? "WORKER_DEPLOYMENT_READBACK_INCOMPLETE");
  }
  if (inventory.worker.versions.length !== 1 || inventory.worker.versions.some(item => item.checked !== true)) {
    return blocked("WORKER_ACTIVE_VERSION_READBACK_INCOMPLETE");
  }
  if (inventory.domainRoute.conflicting || !inventory.domainRoute.attached ||
      inventory.domainRoute.script !== target.targetId || !inventory.domainRoute.routeId) return blocked("M2_ROUTE_BASELINE_MISMATCH");
  if (!inventory.worker.activeDeploymentId || inventory.worker.versions.length !== 1) return blocked("WORKER_BASELINE_NOT_SINGLE_VERSION");
  const baseline = inventory.worker.versions[0];
  if (!baseline || baseline.deploymentId !== inventory.worker.activeDeploymentId || baseline.percentage !== 100 ||
      !baseline.hasVerifiedReleaseIdentity || !baseline.sourceSha || !baseline.buildDigest || !baseline.configurationDigest) {
    return blocked("WORKER_BASELINE_RELEASE_IDENTITY_UNVERIFIED");
  }
  // The currently accepted M2 version predates the Queue-enabled candidate.
  // Queue/metadata bindings are required on the new immutable version and are
  // checked by upload readback; requiring them on the rollback baseline would
  // make the first safe transition impossible.
  const queue = inventory.productionQueueConsumerInventory;
  if (!queue.complete || queue.consumers.length !== 1 || queue.consumers[0]?.scriptName !== target.workerRef ||
      queue.consumers[0]?.queueName !== "smartspec-canonical-job-queue-production" || !queue.consumers[0]?.deadLetterQueueName) {
    return blocked(queue.reason ?? "PRODUCTION_QUEUE_CONSUMER_NOT_VERIFIED");
  }
  if (!target.runtimePolicy) return blocked("PRODUCTION_ORIGIN_CONFIGURATION_NOT_BOUND");
  const origin = await getCloudflareOriginConfiguration(db, { identity: { tenantId: scope.tenantId,
    projectId: scope.projectId, environment: "production", provider: "cloudflare" }, configurationRef: target.runtimePolicy }).catch(() => null);
  if (!origin || origin.status !== "STORED" || origin.configurationDigest !== baseline.configurationDigest ||
      Date.parse(origin.descriptor.expiresAt) <= Date.now() + 20 * 60_000) return blocked("PRODUCTION_ORIGIN_CONFIGURATION_NOT_VALID_FOR_BASELINE");
  const artifact = await resolveLatestPublishedCloudflareStagingArtifact();
  if (!artifact) return blocked("PUBLISHED_IMMUTABLE_ARTIFACT_UNAVAILABLE");
  if (artifact.sourceSha.toLowerCase() === baseline.sourceSha.toLowerCase() &&
      artifact.buildDigest.toLowerCase() === baseline.buildDigest.toLowerCase()) return blocked("ARTIFACT_ALREADY_ACTIVE");

  const plan = {
    tenantId: scope.tenantId, projectId: scope.projectId, targetId: target.targetId, environment: "production" as const,
    accountRef: target.accountRef, executorId, zoneId: inventory.domainRoute.zoneId, routePattern: ROUTE_PATTERN,
    expectedRouteId: inventory.domainRoute.routeId, expectedRouteScript: target.targetId,
    rolloutStage: "canary" as const, canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null,
    candidateVersionId: null,
    artifact: { artifactRef: artifact.artifactRef, sourceSha: artifact.sourceSha, buildDigest: artifact.buildDigest },
    configurationRef: target.runtimePolicy, configurationDigest: origin.configurationDigest,
    rollback: { deploymentId: inventory.worker.activeDeploymentId, versionId: baseline.versionId,
      artifactRef: `sha256:${baseline.buildDigest}`, sourceSha: baseline.sourceSha, buildDigest: baseline.buildDigest,
      configurationRef: target.runtimePolicy, configurationDigest: baseline.configurationDigest },
    routePreserved: true as const, candidateTrafficPercent: 1 as const,
    queue: { name: queue.consumers[0]!.queueName, consumerId: queue.consumers[0]!.consumerId,
      scriptName: queue.consumers[0]!.scriptName, deadLetterQueueName: queue.consumers[0]!.deadLetterQueueName },
  };
  return { ready: true as const, reason: null, ...plan,
    planDigest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") };
}

function sameScope(job: typeof workerJobs.$inferSelect, scope: Scope, actorUserId: number) {
  return job.tenantId === scope.tenantId && job.requestedByUserId === actorUserId &&
    job.jobType === CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB &&
    job.contractVersion === CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT && job.inputJson?.projectId === scope.projectId;
}

export async function queueProductionWorkerCanary(db: DrizzleDB, input: Scope & {
  actorUserId: number; userToken: string; submissionId: string; planDigest: string; correlationId: string;
}) {
  if (!UUID.test(input.submissionId)) throw new Error("PRODUCTION_WORKER_SUBMISSION_ID_INVALID");
  const readJob = async () => {
    const [job] = await db.select().from(workerJobs).where(eq(workerJobs.id, input.submissionId)).limit(1);
    if (!job) return null;
    if (!sameScope(job, input, input.actorUserId)) throw new Error("PRODUCTION_WORKER_JOB_SCOPE_MISMATCH");
    return { jobId: job.id, status: job.status };
  };
  const existingJob = await readJob();
  if (existingJob) return existingJob;

  const executionReadiness = await (await import("./cloudflareExecutionReadiness")).checkCloudflareExecutionReadiness(db);
  if (!executionReadiness.ready) throw new Error(executionReadiness.reason);
  const checkpoint = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`production-worker-canary:${input.submissionId}`}))`);
    const [prior] = await tx.select().from(systemSettings).where(and(eq(systemSettings.category, SUBMISSIONS),
      eq(systemSettings.key, input.submissionId))).limit(1);
    if (prior) {
      const value = prior.valueJson as { tenantId?: string; projectId?: string; actorUserId?: number; planDigest?: string; request?: Record<string, unknown> };
      if (prior.updatedBy !== input.actorUserId || value?.tenantId !== input.tenantId || value.projectId !== input.projectId ||
          value.actorUserId !== input.actorUserId || value.planDigest !== input.planDigest || !value.request) {
        throw new Error("PRODUCTION_WORKER_SUBMISSION_SCOPE_OR_PLAN_MISMATCH");
      }
      return value.request;
    }
    const scope = { tenantId: input.tenantId, projectId: input.projectId };
    const plan = await getProductionWorkerCanaryPreflight(tx as unknown as DrizzleDB, scope);
    if (!plan.ready) throw new Error(plan.reason);
    if (plan.planDigest !== input.planDigest) throw new Error("PRODUCTION_WORKER_PLAN_CHANGED");
    const job = { contractVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT, action: "deploy" as const,
      targetId: plan.targetId, environment: "production" as const, zoneId: plan.zoneId, routePattern: plan.routePattern,
      expectedRouteId: plan.expectedRouteId, expectedRouteScript: plan.expectedRouteScript, rolloutStage: plan.rolloutStage,
      canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null, candidateVersionId: null,
      grantRef: input.submissionId, projectId: plan.projectId, ...plan.artifact,
      configurationRef: plan.configurationRef, configurationDigest: plan.configurationDigest };
    const grantRequest = { idempotencyKey: `cf-production-worker-canary:${input.submissionId}`,
      projectId: plan.projectId, executorId: plan.executorId, targetId: plan.targetId, environment: "production",
      accountRef: plan.accountRef, zoneId: plan.zoneId, routePattern: plan.routePattern,
      expectedRouteId: plan.expectedRouteId, expectedRouteScript: plan.expectedRouteScript, rolloutStage: plan.rolloutStage,
      canaryGrantRef: null, canaryDeploymentId: null, canaryVerifiedAt: null, candidateVersionId: null,
      jobId: input.submissionId, ...plan.artifact, configurationRef: plan.configurationRef,
      configurationDigest: plan.configurationDigest, actions: ["deploy"], rollbackDeploymentId: plan.rollback.deploymentId,
      rollbackArtifactRef: plan.rollback.artifactRef, rollbackSourceSha: plan.rollback.sourceSha,
      rollbackBuildDigest: plan.rollback.buildDigest, rollbackConfigurationRef: plan.rollback.configurationRef,
      rollbackConfigurationDigest: plan.rollback.configurationDigest, canaryRequired: true,
      maxDurationSeconds: 900, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    const request = { job, grantRequest, planDigest: plan.planDigest };
    await tx.insert(systemSettings).values({ category: SUBMISSIONS, key: input.submissionId,
      valueJson: { tenantId: input.tenantId, projectId: input.projectId, actorUserId: input.actorUserId,
        planDigest: input.planDigest, request }, isSensitive: false, updatedBy: input.actorUserId,
      description: "Exact production Worker canary submission checkpoint; approval payload contains immutable scope only" });
    return request;
  });
  const stored = checkpoint as { job?: unknown; grantRequest?: Record<string, unknown>; planDigest?: string };
  if (!stored.grantRequest || stored.planDigest !== input.planDigest) throw new Error("PRODUCTION_WORKER_SUBMISSION_CHECKPOINT_INVALID");
  const config = await getAppRuntimeConfig();
  const response = await fetch(`${config.pythonBackendUrl}/api/v1/approvals/cloudflare-production-grants`, {
    method: "POST", headers: { Authorization: `Bearer ${input.userToken}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(stored.grantRequest), redirect: "error", signal: AbortSignal.timeout(20_000),
  });
  const approval = await response.json().catch(() => null) as { payload?: unknown } | null;
  if (!response.ok) throw new Error(`PRODUCTION_WORKER_APPROVAL_HTTP_${response.status}`);
  const parsedGrant = cloudflareProductionDeploymentGrantSchema.safeParse(approval?.payload);
  if (!parsedGrant.success || parsedGrant.data.jobId !== input.submissionId || parsedGrant.data.requesterUserId !== input.actorUserId ||
      parsedGrant.data.tenantId !== input.tenantId || parsedGrant.data.projectId !== input.projectId) {
    throw new Error("PRODUCTION_WORKER_APPROVAL_GRANT_INVALID");
  }
  const jobInput = { ...(stored.job as Record<string, unknown>), grantRef: parsedGrant.data.grantRef };
  const parsedJob = cloudflareProductionDeploymentJobSchema.safeParse(jobInput);
  if (!parsedJob.success) throw new Error("PRODUCTION_WORKER_JOB_CONTRACT_INVALID");
  try {
    await createControlPlaneJob({
      context: { tenantId: input.tenantId, actorType: "user", actorId: input.actorUserId,
        authorizationScope: "infrastructure.cloudflare_production_worker_deployment", correlationId: input.correlationId,
        idempotencyKey: `cf-production-worker-canary:${input.submissionId}` },
      definition: { contractVersion: CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
        jobType: CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB, executionClass: "long", priority: 50,
        input: parsedJob.data, idempotencyKey: `cf-production-worker-canary:${input.submissionId}`,
        activeDedupeKey: `cf-production-worker-canary:${input.tenantId}:${input.projectId}`,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: "none", deadlineMs: 900_000,
          deadlineMode: "fixed", allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 900_000 } },
      createOptions: { canonicalJobId: input.submissionId, runtimeType: "node_job_worker", admissionMode: "durable_queue" },
    });
  } catch {
    const reconciled = await readJob();
    if (reconciled) return reconciled;
    throw new Error("PRODUCTION_WORKER_ADMISSION_UNKNOWN");
  }
  const accepted = await readJob();
  if (!accepted) throw new Error("PRODUCTION_WORKER_ADMISSION_UNKNOWN");
  return accepted;
}
