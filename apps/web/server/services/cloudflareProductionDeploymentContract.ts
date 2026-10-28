import { z } from "zod";
import type { DrizzleDB } from "../db";
import { authorizeDeploymentTarget, deploymentCredentialRef, resolveProviderDeploymentTarget } from "./providerDeploymentTargetAuthority";

/** Production has its own immutable contract; staging grants cannot cross this boundary. */
export const CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT = "cloudflare-production-deploy-v1" as const;
export const CLOUDFLARE_PRODUCTION_DEPLOYMENT_JOB = "cloudflare.production.deploy" as const;
export const CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT = "cloudflare.production-deployment-grant.v2" as const;
export const CLOUDFLARE_PRODUCTION_TARGET_ID = "smartspec-cloudflare-runtime" as const;

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifactRef = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const cloudflareProductionDeploymentGrantSchema = z.object({
  schemaVersion: z.literal(CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT),
  grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36),
  requesterUserId: z.number().int().positive(),
  projectId: z.string().min(1).max(36),
  executorId: z.string().min(1).max(200),
  targetId: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID),
  environment: z.literal("production"),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  zoneId: z.string().regex(/^[a-f0-9]{32}$/),
  routePattern: z.literal("smartaihub.app/*"),
  expectedRouteId: z.string().min(1).max(32).nullable(),
  expectedRouteScript: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID).nullable(),
  rolloutStage: z.enum(["canary", "promote", "rollback"]),
  canaryGrantRef: z.string().uuid().nullable(),
  canaryDeploymentId: z.string().uuid().nullable(),
  canaryVerifiedAt: z.string().datetime({ offset: true }).nullable(),
  candidateVersionId: z.string().uuid().nullable(),
  jobId: z.string().uuid(),
  artifactRef,
  sourceSha: sha,
  buildDigest: digest,
  configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/),
  configurationDigest: digest,
  actions: z.array(z.enum(["deploy", "rollback"])).length(1),
  rollbackDeploymentId: z.string().uuid(),
  rollbackArtifactRef: artifactRef,
  rollbackSourceSha: sha,
  rollbackBuildDigest: digest,
  rollbackConfigurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/),
  rollbackConfigurationDigest: digest,
  canaryRequired: z.literal(true),
  maxDurationSeconds: z.number().int().min(1).max(900),
  expiresAt: z.string().datetime({ offset: true }),
  revokedAt: z.null(),
}).strict().superRefine((grant, ctx) => {
  if (grant.artifactRef !== `sha256:${grant.buildDigest}` ||
      grant.rollbackArtifactRef !== `sha256:${grant.rollbackBuildDigest}` ||
      grant.configurationRef !== `cf-origin:${grant.configurationDigest}` ||
      grant.rollbackConfigurationRef !== `cf-origin:${grant.rollbackConfigurationDigest}`) {
    ctx.addIssue({ code: "custom", message: "Production grant digest binding invalid" });
  }
  if ((grant.expectedRouteId === null) !== (grant.expectedRouteScript === null) ||
      (grant.rolloutStage === "rollback") !== (grant.actions[0] === "rollback") ||
      (grant.rolloutStage === "canary" || grant.rolloutStage === "promote") !== (grant.actions[0] === "deploy") ||
      (grant.rolloutStage === "promote") !== (grant.canaryGrantRef !== null) ||
      (grant.rolloutStage === "promote") !== (grant.canaryDeploymentId !== null) ||
      (grant.rolloutStage === "promote") !== (grant.canaryVerifiedAt !== null) ||
      (grant.rolloutStage === "promote") !== (grant.candidateVersionId !== null)) {
    ctx.addIssue({ code: "custom", message: "Production route or rollout stage binding invalid" });
  }
});

export type CloudflareProductionDeploymentGrant =
  z.infer<typeof cloudflareProductionDeploymentGrantSchema> & { revoked: false };

export const cloudflareProductionDeploymentJobSchema = z.object({
  contractVersion: z.literal(CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT),
  action: z.enum(["deploy", "rollback"]),
  targetId: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID),
  environment: z.literal("production"),
  zoneId: z.string().regex(/^[a-f0-9]{32}$/),
  routePattern: z.literal("smartaihub.app/*"),
  expectedRouteId: z.string().min(1).max(32).nullable(),
  expectedRouteScript: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID).nullable(),
  rolloutStage: z.enum(["canary", "promote", "rollback"]),
  canaryGrantRef: z.string().uuid().nullable(),
  canaryDeploymentId: z.string().uuid().nullable(),
  canaryVerifiedAt: z.string().datetime({ offset: true }).nullable(),
  candidateVersionId: z.string().uuid().nullable(),
  grantRef: z.string().uuid(),
  mandateGrantRef: z.string().uuid().optional(),
  mandateOperation: z.enum(["deploy_worker", "worker_canary", "rollback"]).optional(),
  mandatePlanDigest: digest.optional(),
  mandateRollback: z.object({
    deploymentId: z.string().uuid(), artifactRef, sourceSha: sha, buildDigest: digest,
    configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/), configurationDigest: digest,
  }).strict().optional(),
  projectId: z.string().min(1).max(36),
  artifactRef,
  sourceSha: sha,
  buildDigest: digest,
  configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/),
  configurationDigest: digest,
}).strict().superRefine((job, ctx) => {
  if (job.artifactRef !== `sha256:${job.buildDigest}` ||
      job.configurationRef !== `cf-origin:${job.configurationDigest}`) {
    ctx.addIssue({ code: "custom", message: "Production job digest binding invalid" });
  }
  if ((job.expectedRouteId === null) !== (job.expectedRouteScript === null) ||
      (job.rolloutStage === "rollback") !== (job.action === "rollback") ||
      (job.rolloutStage === "promote") !== (job.canaryGrantRef !== null) ||
      (job.rolloutStage === "promote") !== (job.canaryDeploymentId !== null) ||
      (job.rolloutStage === "promote") !== (job.canaryVerifiedAt !== null) ||
      (job.rolloutStage === "promote") !== (job.candidateVersionId !== null)) {
    ctx.addIssue({ code: "custom", message: "Production job route or rollout stage binding invalid" });
  }
  const mandateFields = [job.mandateGrantRef, job.mandateOperation, job.mandatePlanDigest, job.mandateRollback];
  if (mandateFields.some(value => value !== undefined) && mandateFields.some(value => value === undefined)) {
    ctx.addIssue({ code: "custom", message: "Production mandate binding must be complete" });
  }
  if (job.mandateOperation && ((job.mandateOperation === "rollback") !== (job.action === "rollback") ||
      (job.mandateOperation === "worker_canary" || job.mandateOperation === "deploy_worker") !== (job.action === "deploy"))) {
    ctx.addIssue({ code: "custom", message: "Production mandate operation does not match deployment action" });
  }
});

export type CloudflareProductionDeploymentJob = z.infer<typeof cloudflareProductionDeploymentJobSchema>;

export type CloudflareProductionDeploymentTarget = Readonly<{
  targetId: typeof CLOUDFLARE_PRODUCTION_TARGET_ID;
  tenantId: string;
  projectId: string;
  environment: "production";
  accountRef: string;
  workerRef: typeof CLOUDFLARE_PRODUCTION_TARGET_ID;
  credentialRef: string;
  runtimePolicy?: string;
  enabled: true;
}>;

/** Resolve only the exact production Worker target; no provider request is made here. */
export async function resolveCloudflareProductionDeploymentTarget(input: {
  db: DrizzleDB;
  tenantId: string;
  projectId: string;
}): Promise<CloudflareProductionDeploymentTarget | null> {
  const identity = { ...input, environment: "production", provider: "cloudflare" } as const;
  const resolution = await resolveProviderDeploymentTarget(input.db, identity);
  if (resolution.status !== "CONFIGURED") return null;
  const row = resolution.target;
  if (row.deploymentTargetId !== CLOUDFLARE_PRODUCTION_TARGET_ID ||
      row.environment !== "production" || row.provider !== "cloudflare" ||
      row.workerRef !== CLOUDFLARE_PRODUCTION_TARGET_ID || !row.accountRef ||
      row.credentialRef !== deploymentCredentialRef(identity) ||
      authorizeDeploymentTarget({ target: row, callerTenantId: input.tenantId, projectId: input.projectId,
        environment: "production", provider: "cloudflare" }) !== "AUTHORIZED") return null;
  return { targetId: row.deploymentTargetId, tenantId: row.tenantId, projectId: row.projectId,
    environment: "production", accountRef: row.accountRef, workerRef: row.workerRef,
    credentialRef: row.credentialRef, enabled: true, ...(row.runtimePolicy ? { runtimePolicy: row.runtimePolicy } : {}) };
}

export function cloudflareProductionGrantAllowsJob(
  grant: CloudflareProductionDeploymentGrant,
  job: CloudflareProductionDeploymentJob,
  binding: { tenantId: string; jobId: string; executorId: string; accountRef: string; now: Date },
): boolean {
  const { revoked, ...document } = grant;
  const parsed = cloudflareProductionDeploymentGrantSchema.safeParse(document);
  if (!parsed.success || revoked !== false) return false;
  const expected = job.action === "deploy"
    ? { artifactRef: grant.artifactRef, sourceSha: grant.sourceSha, buildDigest: grant.buildDigest, configurationRef: grant.configurationRef, configurationDigest: grant.configurationDigest }
    : { artifactRef: grant.rollbackArtifactRef, sourceSha: grant.rollbackSourceSha, buildDigest: grant.rollbackBuildDigest, configurationRef: grant.rollbackConfigurationRef, configurationDigest: grant.rollbackConfigurationDigest };
  return grant.targetId === job.targetId && grant.environment === job.environment &&
    grant.tenantId === binding.tenantId && grant.projectId === job.projectId &&
    grant.zoneId === job.zoneId && grant.routePattern === job.routePattern &&
    grant.expectedRouteId === job.expectedRouteId && grant.expectedRouteScript === job.expectedRouteScript &&
    grant.rolloutStage === job.rolloutStage &&
    grant.canaryGrantRef === job.canaryGrantRef && grant.canaryDeploymentId === job.canaryDeploymentId &&
    grant.canaryVerifiedAt === job.canaryVerifiedAt &&
    grant.candidateVersionId === job.candidateVersionId &&
    grant.jobId === binding.jobId && job.grantRef === grant.grantRef &&
    grant.executorId === binding.executorId && grant.accountRef === binding.accountRef &&
    grant.actions[0] === job.action && Date.parse(grant.expiresAt) > binding.now.getTime() &&
    expected.artifactRef === job.artifactRef && expected.sourceSha === job.sourceSha &&
    expected.buildDigest === job.buildDigest && expected.configurationRef === job.configurationRef &&
    expected.configurationDigest === job.configurationDigest;
}
