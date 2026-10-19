import { createHash } from "node:crypto";
import { z } from "zod";

export const ORIGIN_PROVISION_CONTRACT = "cloudflare-staging-origin-provision-v1";
export const ORIGIN_PROVISION_JOB = "cloudflare.staging.origin.provision";
export const ORIGIN_PROVISION_GRANT = "cloudflare.staging-origin-provision-grant.v1";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const originProvisionPlanSchema = z.object({
  hostname: z.literal("origin-staging.smartaihub.app"), zoneId: z.string().regex(/^[a-f0-9]{32}$/),
  tunnelId: z.string().uuid(), teamName: z.string().regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/),
  publicOrigin: z.string().regex(/^https:\/\/smartspec-cloudflare-staging\.[a-z0-9-]+\.workers\.dev$/),
  configurationExpiresAt: z.string().datetime({ offset: true }),
}).strict();
export type OriginProvisionPlan = z.infer<typeof originProvisionPlanSchema>;
export function originProvisionPlanDigest(plan: OriginProvisionPlan) {
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(plan).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
}
export const originProvisionAuthoritySchema = z.object({
  projectId: z.string().min(1).max(36), grantRef: z.string().uuid(),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/), planDigest: digest,
}).strict();
export type OriginProvisionAuthority = z.infer<typeof originProvisionAuthoritySchema>;
export const originProvisionGrantSchema = z.object({
  schemaVersion: z.literal(ORIGIN_PROVISION_GRANT), grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), requesterUserId: z.number().int().positive(),
  executorId: z.string().min(1).max(200), jobId: z.string().uuid(), accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  actions: z.tuple([z.literal("provision")]), plan: originProvisionPlanSchema, planDigest: digest,
  expiresAt: z.string().datetime({ offset: true }), revokedAt: z.null(),
}).strict().refine(v => v.planDigest === originProvisionPlanDigest(v.plan));
export type OriginProvisionGrant = z.infer<typeof originProvisionGrantSchema>;
export const originProvisionJobSchema = z.object({
  contractVersion: z.literal(ORIGIN_PROVISION_CONTRACT), grantRef: z.string().uuid(),
  projectId: z.string().min(1).max(36), planDigest: digest,
}).strict();
