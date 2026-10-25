import type { JobExecutor } from "./jobExecutor";
import type { CloudflareProductionDeploymentRuntime } from "./cloudflareProductionDeploymentExecutor";
import {
  productionIngressJobSchema,
  productionIngressGrantAllowsJob,
  PRODUCTION_INGRESS_CONTRACT,
} from "./cloudflareProductionIngressContract";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";
import { getEffectiveWorkerJobDeadlineMs } from "./workerJobDeadlinePolicy";

const deny = (code: string): never => {
  throw new Error(`CLOUDFLARE_PRODUCTION_INGRESS_${code}`);
};
/** Reuse the production grant resolver, canonical lease, artifact and target authorities. */
export function createCloudflareProductionIngressExecutor(
  factory: () => CloudflareProductionDeploymentRuntime | undefined
): JobExecutor {
  return withCloudflareStagingLeaseHeartbeat(
    async ({ context, lease, reporter }) => {
      const parsed = productionIngressJobSchema.safeParse(context.input);
      if (
        context.jobType !== "cloudflare.production.deploy" ||
        context.contractVersion !== PRODUCTION_INGRESS_CONTRACT ||
        context.executionClass !== "long" ||
        !parsed.success
      )
        deny("JOB_INVALID");
      const job = parsed.data,
        runtime = factory();
      if (!runtime?.resolveIngressGrant || !runtime.ingress)
        deny("RUNTIME_UNAVAILABLE");
      const executorId = runtime.resolveExecutorId();
      if (!executorId) deny("EXECUTOR_UNAVAILABLE");
      const grant = await runtime.resolveIngressGrant(job.grantRef);
      if (!grant) deny("GRANT_UNAVAILABLE");
      const target = await runtime.resolveTarget({
        tenantId: context.tenantId,
        projectId: job.projectId,
      });
      if (
        !target ||
        target.targetId !== job.targetId ||
        target.workerRef !== job.targetId ||
        target.tenantId !== context.tenantId ||
        target.environment !== "production" ||
        target.projectId !== job.projectId ||
        target.runtimePolicy !== job.configurationRef
      )
        deny("TARGET_DENIED");
      const assertMutationAuthorized = async () => {
        const now = runtime.now(),
          created = Date.parse(context.createdAt);
        if (
          !Number.isFinite(created) ||
          now.getTime() >=
            created +
              Math.min(
                grant.maxDurationSeconds * 1000,
                getEffectiveWorkerJobDeadlineMs({
                  ...context,
                  runtimeType: "node_job_worker",
                })
              )
        )
          deny("DEADLINE_EXPIRED");
        await reporter.assertActive(lease);
        const [currentGrant, currentTarget] = await Promise.all([
          runtime.resolveIngressGrant!(job.grantRef),
          runtime.resolveTarget({
            tenantId: context.tenantId,
            projectId: job.projectId,
          }),
        ]);
        if (
          runtime.resolveExecutorId() !== executorId ||
          !currentGrant ||
          !productionIngressGrantAllowsJob(currentGrant, job, {
            jobId: context.jobId,
            tenantId: context.tenantId,
            requesterUserId: context.requestedByUserId,
            executorId,
            accountRef: target.accountRef,
            now,
          }) ||
          !currentTarget ||
          (
            [
              "targetId",
              "workerRef",
              "tenantId",
              "projectId",
              "environment",
              "accountRef",
              "credentialRef",
              "runtimePolicy",
              "enabled",
            ] as const
          ).some(key => currentTarget[key] !== target[key])
        )
          deny("AUTHORITY_CHANGED");
        await reporter.assertActive(lease);
      };
      await assertMutationAuthorized();
      const result = await runtime.withCredential({
        target,
        operation: async token => {
          let candidate;
          let probeToken: string | undefined;
          if (job.action === "ingress-canary") {
            const artifact = await runtime.resolveArtifact(
              job.artifactRef,
              job.sourceSha
            );
            if (
              !artifact ||
              artifact.artifactRef !== job.artifactRef ||
              artifact.sourceSha !== job.sourceSha ||
              artifact.buildDigest !== job.buildDigest
            )
              deny("ARTIFACT_MISSING");
            candidate = await runtime.withOriginConfiguration({
              target,
              configurationRef: job.configurationRef,
              configurationDigest: job.configurationDigest,
              operation: async origin => {
                if (
                  origin.descriptor.ingressMode !==
                    "production-origin-bridge-v1" ||
                  ![
                    "https://smartaihub.app",
                    "https://runtime.smartaihub.app",
                  ].every(o =>
                    origin.descriptor.allowedPublicOrigins.includes(o)
                  )
                )
                  deny("ORIGIN_CONFIG_INVALID");
                probeToken = origin.secrets.applicationCanaryToken;
                if (!probeToken || probeToken.length < 32)
                  deny("PROBE_CREDENTIAL_REQUIRED");
                const prepared = await runtime.prepareVersion({
                  token,
                  target,
                  artifact,
                  originConfiguration: origin,
                  assertMutationAuthorized,
                });
                if (
                  prepared.trafficShifted !== false ||
                  prepared.sourceSha !== job.sourceSha ||
                  prepared.buildDigest !== job.buildDigest ||
                  prepared.configurationDigest !== job.configurationDigest
                )
                  deny("VERSION_RECEIPT_MISMATCH");
                return prepared;
              },
            });
          }
          return runtime.ingress!({
            token,
            target,
            grant,
            candidate,
            probeToken,
            assertMutationAuthorized,
          });
        },
      });
      if (result.status !== "CONFIGURED" || !result.value)
        deny("CREDENTIAL_UNAVAILABLE");
      return {
        output: {
          ...result.value,
          jobId: context.jobId,
          action: job.action,
          artifactRef: job.artifactRef,
          configurationRef: job.configurationRef,
        },
      };
    }
  );
}
