import { z } from "zod";

export const CLOUDFLARE_STAGING_ORIGIN_CONTRACT = "cloudflare-staging-origin-v2" as const;
export const CLOUDFLARE_STAGING_ORIGIN_GRANT = "cloudflare.staging-origin-grant.v2" as const;
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.string().regex(/^cf-origin:[a-f0-9]{64}$/);
const artifactRef = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const cloudflareStagingOriginAuthoritySchema = z.object({
  // Optional only for already-signed pre-action authority receipts. New receipts
  // always bind it; the outer executor attempt also binds its action.
  action: z.enum(["deploy", "rollback", "bootstrap"]).optional(),
  projectId: z.string().min(1).max(100), grantRef: z.string().uuid(),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  configurationRef: ref, configurationDigest: digest,
  rollbackConfigurationRef: ref.nullable(), rollbackConfigurationDigest: digest.nullable(),
  rollbackDeploymentId: z.string().uuid().nullable(), rollbackArtifactRef: artifactRef.nullable(),
  rollbackSourceSha: sha.nullable(), rollbackBuildDigest: digest.nullable(),
}).strict().superRefine((v, ctx) => {
  const rollbackFields = [v.rollbackDeploymentId, v.rollbackArtifactRef, v.rollbackSourceSha, v.rollbackBuildDigest];
  if (v.configurationRef !== `cf-origin:${v.configurationDigest}` ||
      (v.rollbackConfigurationRef === null) !== (v.rollbackConfigurationDigest === null) ||
      (v.rollbackConfigurationRef !== null && v.rollbackConfigurationRef !== `cf-origin:${v.rollbackConfigurationDigest}`) ||
      (v.action === "bootstrap"
        ? rollbackFields.some(value => value !== null) || v.rollbackConfigurationRef !== null
        : rollbackFields.some(value => value === null) || v.rollbackArtifactRef !== `sha256:${v.rollbackBuildDigest}`)) {
    ctx.addIssue({ code: "custom", message: "Origin authority binding invalid" });
  }
});
export type CloudflareStagingOriginAuthority = z.infer<typeof cloudflareStagingOriginAuthoritySchema>;

export const cloudflareStagingOriginGrantSchema = z.object({
  schemaVersion: z.literal(CLOUDFLARE_STAGING_ORIGIN_GRANT),
  grantRef: z.string().uuid(), tenantId: z.string().min(1).max(36), requesterUserId: z.number().int().positive(),
  projectId: z.string().min(1).max(100), executorId: z.string().min(1).max(200),
  targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  artifactRef, sourceSha: sha, buildDigest: digest,
  actions: z.array(z.enum(["deploy", "rollback", "bootstrap"])).length(1),
  rollbackDeploymentId: z.string().uuid().nullable(), rollbackArtifactRef: artifactRef.nullable(),
  rollbackSourceSha: sha.nullable(), rollbackBuildDigest: digest.nullable(),
  expiresAt: z.string().datetime({ offset: true }), revokedAt: z.null(),
  jobId: z.string().uuid(), accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  configurationRef: ref, configurationDigest: digest,
  rollbackConfigurationRef: ref.nullable(), rollbackConfigurationDigest: digest.nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.artifactRef !== `sha256:${v.buildDigest}` || !cloudflareStagingOriginAuthoritySchema.safeParse({
    action: v.actions[0], projectId: v.projectId, grantRef: v.grantRef, accountRef: v.accountRef,
    configurationRef: v.configurationRef, configurationDigest: v.configurationDigest,
    rollbackConfigurationRef: v.rollbackConfigurationRef, rollbackConfigurationDigest: v.rollbackConfigurationDigest,
    rollbackDeploymentId: v.rollbackDeploymentId, rollbackArtifactRef: v.rollbackArtifactRef,
    rollbackSourceSha: v.rollbackSourceSha, rollbackBuildDigest: v.rollbackBuildDigest,
  }).success) ctx.addIssue({ code: "custom", message: "Origin grant binding invalid" });
});
export type CloudflareStagingOriginGrant = z.infer<typeof cloudflareStagingOriginGrantSchema> & { revoked: false };

export const cloudflareStagingOriginJobSchema = z.object({
  contractVersion: z.literal(CLOUDFLARE_STAGING_ORIGIN_CONTRACT),
  action: z.enum(["deploy", "rollback", "bootstrap"]), targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  grantRef: z.string().uuid(), projectId: z.string().min(1).max(100), artifactRef, sourceSha: sha, buildDigest: digest,
  configurationRef: ref.nullable(), configurationDigest: digest.nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.artifactRef !== `sha256:${v.buildDigest}` ||
      (v.configurationRef === null) !== (v.configurationDigest === null) ||
      (v.configurationRef !== null && v.configurationRef !== `cf-origin:${v.configurationDigest}`) ||
      (v.action !== "rollback" && v.configurationRef === null)) ctx.addIssue({ code: "custom", message: "Origin job binding invalid" });
});
export type CloudflareStagingOriginJob = z.infer<typeof cloudflareStagingOriginJobSchema>;

export function cloudflareStagingOriginAuthority(grant: CloudflareStagingOriginGrant): CloudflareStagingOriginAuthority {
  return cloudflareStagingOriginAuthoritySchema.parse({
    action: grant.actions[0],
    projectId: grant.projectId, grantRef: grant.grantRef, accountRef: grant.accountRef,
    configurationRef: grant.configurationRef, configurationDigest: grant.configurationDigest,
    rollbackConfigurationRef: grant.rollbackConfigurationRef, rollbackConfigurationDigest: grant.rollbackConfigurationDigest,
    rollbackDeploymentId: grant.rollbackDeploymentId, rollbackArtifactRef: grant.rollbackArtifactRef,
    rollbackSourceSha: grant.rollbackSourceSha, rollbackBuildDigest: grant.rollbackBuildDigest,
  });
}
