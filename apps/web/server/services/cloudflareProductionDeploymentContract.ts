import { z } from "zod";
import type { DrizzleDB } from "../db";
import { authorizeDeploymentTarget, deploymentCredentialRef, resolveProviderDeploymentTarget } from "./providerDeploymentTargetAuthority";

/** Production has its own immutable contract; staging grants cannot cross this boundary. */
export const CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT = "cloudflare-production-deploy-v1" as const;
export const CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT = "cloudflare.production-deployment-grant.v1" as const;
export const CLOUDFLARE_PRODUCTION_TARGET_ID = "smartspec-cloudflare-runtime" as const;

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifactRef = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const cloudflareProductionDeploymentGrantSchema = z.object({
  schemaVersion: z.literal(CLOUDFLARE_PRODUCTION_DEPLOYMENT_GRANT),
  grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36),
  requesterUserId: z.number().int().positive(),
  projectId: z.string().min(1).max(100),
  executorId: z.string().min(1).max(200),
  targetId: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID),
  environment: z.literal("production"),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/),
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
});

export type CloudflareProductionDeploymentGrant =
  z.infer<typeof cloudflareProductionDeploymentGrantSchema> & { revoked: false };

export const cloudflareProductionDeploymentJobSchema = z.object({
  contractVersion: z.literal(CLOUDFLARE_PRODUCTION_DEPLOYMENT_CONTRACT),
  action: z.enum(["deploy", "rollback"]),
  targetId: z.literal(CLOUDFLARE_PRODUCTION_TARGET_ID),
  environment: z.literal("production"),
  grantRef: z.string().uuid(),
  projectId: z.string().min(1).max(100),
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
    credentialRef: row.credentialRef, enabled: true };
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
    grant.jobId === binding.jobId && job.grantRef === grant.grantRef &&
    grant.executorId === binding.executorId && grant.accountRef === binding.accountRef &&
    grant.actions[0] === job.action && Date.parse(grant.expiresAt) > binding.now.getTime() &&
    expected.artifactRef === job.artifactRef && expected.sourceSha === job.sourceSha &&
    expected.buildDigest === job.buildDigest && expected.configurationRef === job.configurationRef &&
    expected.configurationDigest === job.configurationDigest;
}
