import type { ProductionIngressGrant } from "./cloudflareProductionIngressContract";
import type { JobExecutor } from "./jobExecutor";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";
import {
  cloudflareProductionDeploymentGrantSchema,
  cloudflareProductionDeploymentJobSchema,
  cloudflareProductionGrantAllowsJob,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB,
  type CloudflareProductionDeploymentGrant,
  type CloudflareProductionDeploymentTarget,
  type CloudflareProductionDeploymentJob,
} from "./cloudflareProductionDeploymentContract";
import type { CloudflareStagingArtifact } from "./cloudflareStagingDeploymentExecutor";
import type { CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import type { CloudflareProductionVersion } from "./cloudflareProductionCanary";
import { assertCloudflareMigrationOperationGrant } from "./cloudflareProductionMigrationMandate";

export { CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB };

export class CloudflareProductionDeploymentError extends Error {
  constructor(readonly diagnosticCode: string) {
    super(diagnosticCode);
    this.name = "CloudflareProductionDeploymentError";
  }
}

type CredentialStatus = "CONFIGURED" | "NOT_CONFIGURED" | "PERMISSION_DENIED" | "REVOKED" | "UNAVAILABLE";

export type CloudflareProductionDeploymentRuntime = Readonly<{
  resolveExecutorId: () => string | null;
  resolveIngressGrant?: (grantRef: string) => Promise<ProductionIngressGrant | null>;
  ingress?: ReturnType<typeof import("./cloudflareProductionIngressTransport").createCloudflareProductionIngressTransport>;
  waitForIngressAcceptance?: (input: Parameters<typeof import("./cloudflareProductionIngressAcceptance").waitForIngressBrowserAcceptance>[1]) => ReturnType<typeof import("./cloudflareProductionIngressAcceptance").waitForIngressBrowserAcceptance>;

  resolveGrant: (grantRef: string) => Promise<CloudflareProductionDeploymentGrant | null>;
  resolveTarget: (input: { tenantId: string; projectId: string }) => Promise<CloudflareProductionDeploymentTarget | null>;
  resolveArtifact: (artifactRef: string, sourceSha: string) => Promise<CloudflareStagingArtifact | null>;
  withOriginConfiguration: <T>(input: {
    target: CloudflareProductionDeploymentTarget; configurationRef: string; configurationDigest: string;
    operation: (value: CloudflareOriginVersionBindings) => Promise<T>;
  }) => Promise<T>;
  withCredential: <T>(input: { target: CloudflareProductionDeploymentTarget; operation: (token: string) => Promise<T> }) => Promise<{ status: CredentialStatus; value?: T }>;
  prepareVersion: (input: { token: string; target: CloudflareProductionDeploymentTarget; artifact: CloudflareStagingArtifact;
    originConfiguration: CloudflareOriginVersionBindings; purpose?: "worker-deployment";
    assertMutationAuthorized: () => Promise<void> }) => Promise<{
      versionId: string; sourceSha: string; buildDigest: string; configurationDigest: string; trafficShifted: false;
    }>;
  canary: (input: { token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
    candidate: CloudflareProductionVersion; assertMutationAuthorized: () => Promise<void> }) => Promise<{ deploymentId: string; versions: unknown[];
      queueConsumer: { queueId: string; consumerId: string; queueName: string; scriptName: string; deadLetterQueueName: string } }>;
  promote: (input: { token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
    candidate: CloudflareProductionVersion; canaryDeploymentId: string; assertMutationAuthorized: () => Promise<void> }) => Promise<{ deploymentId: string; versions: unknown[] }>;
  rollback: (input: { token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
    assertMutationAuthorized: () => Promise<void> }) => Promise<{ deploymentId: string; versions: unknown[] }>;
  now: () => Date;
}>;

function matchesExpectedGrant(grant: CloudflareProductionDeploymentGrant | null, job: CloudflareProductionDeploymentJob,
  binding: { tenantId: string; jobId: string; executorId: string; accountRef: string; now: Date }) {
  return Boolean(grant && cloudflareProductionGrantAllowsJob(grant, job, binding));
}

function mandateGrantAsProductionGrant(input: {
  mandateGrant: Record<string, any>; job: CloudflareProductionDeploymentJob; executorId: string; jobId: string; tenantId: string;
}): CloudflareProductionDeploymentGrant | null {
  const { mandateGrant: mandate, job, executorId, jobId, tenantId } = input;
  if (!job.mandateGrantRef || !job.mandateOperation || !job.mandatePlanDigest || !job.mandateRollback ||
      mandate.grantRef !== job.mandateGrantRef || mandate.jobId !== jobId ||
      mandate.planDigest !== job.mandatePlanDigest || mandate.projectId !== job.projectId ||
      mandate.tenantId !== tenantId || mandate.targetId !== job.targetId || mandate.environment !== job.environment ||
      mandate.zoneId !== job.zoneId || mandate.routePattern !== job.routePattern) return null;
  const rollback = job.mandateRollback;
  const rollbackTarget = rollback;
  const value = {
    schemaVersion: "cloudflare.production-deployment-grant.v2" as const,
    grantRef: mandate.grantRef, tenantId: mandate.tenantId, requesterUserId: mandate.ownerUserId,
    projectId: mandate.projectId, executorId, targetId: job.targetId, environment: job.environment,
    accountRef: mandate.accountRef, zoneId: job.zoneId, routePattern: job.routePattern,
    expectedRouteId: job.expectedRouteId, expectedRouteScript: job.expectedRouteScript,
    rolloutStage: job.rolloutStage, canaryGrantRef: job.canaryGrantRef, canaryDeploymentId: job.canaryDeploymentId,
    canaryVerifiedAt: job.canaryVerifiedAt, candidateVersionId: job.candidateVersionId, jobId: mandate.jobId,
    artifactRef: job.artifactRef, sourceSha: job.sourceSha, buildDigest: job.buildDigest,
    configurationRef: job.configurationRef, configurationDigest: job.configurationDigest,
    actions: [job.action], rollbackDeploymentId: rollbackTarget.deploymentId,
    rollbackArtifactRef: rollbackTarget.artifactRef, rollbackSourceSha: rollbackTarget.sourceSha,
    rollbackBuildDigest: rollbackTarget.buildDigest, rollbackConfigurationRef: rollbackTarget.configurationRef,
    rollbackConfigurationDigest: rollbackTarget.configurationDigest, canaryRequired: true as const,
    maxDurationSeconds: 900, expiresAt: mandate.expiresAt, revokedAt: null,
  };
  const parsed = cloudflareProductionDeploymentGrantSchema.safeParse(value);
  return parsed.success ? { ...parsed.data, revoked: false } : null;
}

/** Production deployment consumes only canonical worker_jobs plus an independently approved, stage-specific grant. */
export function createCloudflareProductionDeploymentExecutor(
  runtime?: CloudflareProductionDeploymentRuntime | (() => CloudflareProductionDeploymentRuntime | undefined),
): JobExecutor {
  return withCloudflareStagingLeaseHeartbeat(async ({ context, lease, reporter }) => {
    if (context.jobType !== CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB ||
        context.contractVersion !== CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_JOB_INVALID");
    }
    const parsedJob = cloudflareProductionDeploymentJobSchema.safeParse(context.input);
    if (!parsedJob.success) throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_JOB_INVALID");
    const job = parsedJob.data;
    const activeRuntime = typeof runtime === "function" ? runtime() : runtime;
    if (!activeRuntime) throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_RUNTIME_NOT_CONFIGURED");
    const executorId = activeRuntime.resolveExecutorId();
    if (!executorId) throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_EXECUTOR_ID_NOT_CONFIGURED");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(context.jobId) ||
        !Number.isFinite(Date.parse(context.createdAt)) ||
        Date.parse(context.createdAt) + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= activeRuntime.now().getTime()) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_JOB_DEADLINE_EXPIRED");
    }

    const target = await activeRuntime.resolveTarget({ tenantId: context.tenantId, projectId: job.projectId });
    let grant: CloudflareProductionDeploymentGrant | null = null;
    if (job.mandateGrantRef && job.mandateOperation && job.mandatePlanDigest) {
      const mandateGrant = await assertCloudflareMigrationOperationGrant({ grantRef: job.mandateGrantRef,
        tenantId: context.tenantId, projectId: job.projectId, jobId: context.jobId, operation: job.mandateOperation,
        planDigest: job.mandatePlanDigest, expectedAccountRef: target?.accountRef, expectedZoneId: job.zoneId });
      grant = mandateGrantAsProductionGrant({ mandateGrant, job, executorId, jobId: context.jobId, tenantId: context.tenantId });
    } else {
      grant = await activeRuntime.resolveGrant(job.grantRef);
    }
    const binding = { tenantId: context.tenantId, jobId: context.jobId, executorId,
      accountRef: target?.accountRef ?? "", now: activeRuntime.now() };
    const artifact = job.rolloutStage === "rollback" ? null : await activeRuntime.resolveArtifact(job.artifactRef, job.sourceSha);
    if (!grant || grant.grantRef !== job.grantRef || grant.requesterUserId !== context.requestedByUserId ||
        (job.rolloutStage !== "rollback" && (!artifact || artifact.artifactRef !== job.artifactRef ||
          artifact.sourceSha.toLowerCase() !== job.sourceSha.toLowerCase() || artifact.buildDigest.toLowerCase() !== job.buildDigest.toLowerCase()))) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_GRANT_OR_ARTIFACT_MISSING");
    }
    if (!target || !target.enabled || target.targetId !== job.targetId || target.environment !== "production" ||
        target.tenantId !== context.tenantId || target.projectId !== job.projectId || target.accountRef !== grant.accountRef ||
        target.workerRef !== job.targetId || !target.credentialRef || target.runtimePolicy !== grant.configurationRef) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_TARGET_DENIED");
    }
    binding.accountRef = target.accountRef;
    if (!matchesExpectedGrant(grant, job, binding)) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_GRANT_SCOPE_DENIED");
    }
    await reporter.assertActive(lease);

    const assertMutationAuthorized = async () => {
      const now = activeRuntime.now();
      if (Date.parse(context.createdAt) + getEffectiveWorkerJobDeadlineMs({ ...context, runtimeType: "node_job_worker" }) <= now.getTime()) {
        throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_JOB_DEADLINE_EXPIRED");
      }
      await reporter.assertActive(lease);
      const [currentTarget, currentGrant] = await Promise.all([
        activeRuntime.resolveTarget({ tenantId: context.tenantId, projectId: job.projectId }),
        job.mandateGrantRef && job.mandateOperation && job.mandatePlanDigest
          ? assertCloudflareMigrationOperationGrant({ grantRef: job.mandateGrantRef, tenantId: context.tenantId,
              projectId: job.projectId, jobId: context.jobId, operation: job.mandateOperation,
              planDigest: job.mandatePlanDigest, expectedAccountRef: target.accountRef, expectedZoneId: job.zoneId, renew: true })
          : activeRuntime.resolveGrant(job.grantRef),
      ]);
      const currentExecutorId = activeRuntime.resolveExecutorId();
      const effectiveGrant = job.mandateGrantRef && currentGrant
        ? mandateGrantAsProductionGrant({ mandateGrant: currentGrant as unknown as Record<string, any>, job, executorId,
            jobId: context.jobId, tenantId: context.tenantId })
        : currentGrant as CloudflareProductionDeploymentGrant | null;
      if (currentExecutorId !== executorId || !matchesExpectedGrant(effectiveGrant, job, {
        tenantId: context.tenantId, jobId: context.jobId, executorId, accountRef: target.accountRef, now,
      }) || !currentTarget ||
          (["targetId", "environment", "tenantId", "projectId", "accountRef", "workerRef", "credentialRef", "enabled", "runtimePolicy"] as const)
            .some(key => currentTarget[key] !== target[key])) {
        throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_AUTHORITY_CHANGED");
      }
      await reporter.assertActive(lease);
    };

    const credential = await activeRuntime.withCredential({ target, operation: async token => {
      let candidate: CloudflareProductionVersion | undefined;
      if (job.rolloutStage !== "rollback") {
        if (!artifact) throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_ARTIFACT_MISSING");
        if (job.rolloutStage === "canary") {
          if (job.candidateVersionId !== null || grant.candidateVersionId !== null) {
            throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_CANDIDATE_VERSION_SCOPE_INVALID");
          }
          const prepared = await activeRuntime.withOriginConfiguration({ target, configurationRef: grant.configurationRef,
            configurationDigest: grant.configurationDigest, operation: origin => activeRuntime.prepareVersion({
              token, target, artifact, originConfiguration: origin, purpose: "worker-deployment", assertMutationAuthorized,
            }) });
          if (prepared.sourceSha !== job.sourceSha || prepared.buildDigest !== job.buildDigest ||
              prepared.configurationDigest !== job.configurationDigest || prepared.trafficShifted !== false) {
            throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_VERSION_RECEIPT_MISMATCH");
          }
          candidate = { versionId: prepared.versionId, sourceSha: prepared.sourceSha,
            buildDigest: prepared.buildDigest, configurationDigest: prepared.configurationDigest };
        } else {
          if (!job.candidateVersionId || job.candidateVersionId !== grant.candidateVersionId) {
            throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_CANDIDATE_VERSION_SCOPE_INVALID");
          }
          candidate = { versionId: job.candidateVersionId, sourceSha: job.sourceSha,
            buildDigest: job.buildDigest, configurationDigest: job.configurationDigest };
        }
      }

      await assertMutationAuthorized();
      if (job.rolloutStage === "canary") return { ok: true as const, receipt: {
        ...await activeRuntime.canary({ token, target, grant, candidate: candidate!, assertMutationAuthorized }),
        candidateVersionId: candidate!.versionId,
      } };
      if (job.rolloutStage === "promote") return { ok: true as const, receipt: {
        ...await activeRuntime.promote({ token, target, grant, candidate: candidate!,
          canaryDeploymentId: grant.canaryDeploymentId!, assertMutationAuthorized }),
        candidateVersionId: candidate!.versionId,
      } };
      return { ok: true as const, receipt: await activeRuntime.rollback({ token, target, grant, assertMutationAuthorized }) };
    } });
    if (credential.status !== "CONFIGURED" || !credential.value) {
      throw new CloudflareProductionDeploymentError(`CLOUDFLARE_PRODUCTION_CREDENTIAL_${credential.status}`);
    }
    if (!credential.value.ok) throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_PROVIDER_OPERATION_FAILED");
    await reporter.assertActive(lease);
    return { output: { action: job.action, rolloutStage: job.rolloutStage, grantRef: grant.grantRef,
      targetId: target.targetId, artifactRef: job.artifactRef, ...credential.value.receipt } };
  });
}
