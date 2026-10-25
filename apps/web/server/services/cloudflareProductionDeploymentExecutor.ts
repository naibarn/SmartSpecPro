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

  resolveGrant: (grantRef: string) => Promise<CloudflareProductionDeploymentGrant | null>;
  resolveTarget: (input: { tenantId: string; projectId: string }) => Promise<CloudflareProductionDeploymentTarget | null>;
  resolveArtifact: (artifactRef: string, sourceSha: string) => Promise<CloudflareStagingArtifact | null>;
  withOriginConfiguration: <T>(input: {
    target: CloudflareProductionDeploymentTarget; configurationRef: string; configurationDigest: string;
    operation: (value: CloudflareOriginVersionBindings) => Promise<T>;
  }) => Promise<T>;
  withCredential: <T>(input: { target: CloudflareProductionDeploymentTarget; operation: (token: string) => Promise<T> }) => Promise<{ status: CredentialStatus; value?: T }>;
  prepareVersion: (input: { token: string; target: CloudflareProductionDeploymentTarget; artifact: CloudflareStagingArtifact;
    originConfiguration: CloudflareOriginVersionBindings; assertMutationAuthorized: () => Promise<void> }) => Promise<{
      versionId: string; sourceSha: string; buildDigest: string; configurationDigest: string; trafficShifted: false;
    }>;
  canary: (input: { token: string; target: CloudflareProductionDeploymentTarget; grant: CloudflareProductionDeploymentGrant;
    candidate: CloudflareProductionVersion; assertMutationAuthorized: () => Promise<void> }) => Promise<{ deploymentId: string; versions: unknown[] }>;
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

    const binding = { tenantId: context.tenantId, jobId: context.jobId, executorId,
      accountRef: "", now: activeRuntime.now() };
    const [grant, artifact] = await Promise.all([
      activeRuntime.resolveGrant(job.grantRef),
      job.rolloutStage === "rollback" ? Promise.resolve(null) : activeRuntime.resolveArtifact(job.artifactRef, job.sourceSha),
    ]);
    if (!grant || grant.grantRef !== job.grantRef || grant.requesterUserId !== context.requestedByUserId ||
        (job.rolloutStage !== "rollback" && (!artifact || artifact.artifactRef !== job.artifactRef ||
          artifact.sourceSha.toLowerCase() !== job.sourceSha.toLowerCase() || artifact.buildDigest.toLowerCase() !== job.buildDigest.toLowerCase()))) {
      throw new CloudflareProductionDeploymentError("CLOUDFLARE_PRODUCTION_GRANT_OR_ARTIFACT_MISSING");
    }
    const target = await activeRuntime.resolveTarget({ tenantId: context.tenantId, projectId: grant.projectId });
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
      const [currentGrant, currentTarget] = await Promise.all([
        activeRuntime.resolveGrant(job.grantRef),
        activeRuntime.resolveTarget({ tenantId: context.tenantId, projectId: job.projectId }),
      ]);
      const currentExecutorId = activeRuntime.resolveExecutorId();
      if (currentExecutorId !== executorId || !matchesExpectedGrant(currentGrant, job, {
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
              token, target, artifact, originConfiguration: origin, assertMutationAuthorized,
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
