import { createHash } from "node:crypto";
import { z } from "zod";

export const NATIVE_PROVISION_CONTRACT = "cloudflare-staging-native-provision-v1";
export const NATIVE_PROVISION_JOB = "cloudflare.staging.native.provision";
export const NATIVE_PROVISION_GRANT = "cloudflare.staging-native-provision-grant.v1";
export const nativeProvisionPlanSchema = z.object({
  namespace: z.string().regex(/^smartspec-staging-[a-f0-9]{12}$/),
  vectorDimensions: z.literal(768), vectorMetric: z.literal("cosine"),
  configurationExpiresAt: z.string().datetime({ offset: true }),
  /** Add Workflow metadata only to a previously proven, same-scope native set. */
  workflow: z.literal(true).optional(), reuseProvisionJobId: z.string().uuid().optional(),
}).strict().refine(value => Boolean(value.workflow) === Boolean(value.reuseProvisionJobId));
export type NativeProvisionPlan = z.infer<typeof nativeProvisionPlanSchema>;
export const nativeProvisionNamespace = (tenantId: string, projectId: string) =>
  `smartspec-staging-${createHash("sha256").update(`${tenantId}|${projectId}`).digest("hex").slice(0, 12)}`;
export const nativeProvisionPlanDigest = (plan: NativeProvisionPlan) =>
  createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(plan).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
export const nativeProvisionGrantSchema = z.object({
  schemaVersion: z.literal(NATIVE_PROVISION_GRANT), grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), requesterUserId: z.number().int().positive(),
  executorId: z.string().min(1).max(200), jobId: z.string().uuid(), accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  actions: z.tuple([z.literal("provision")]), plan: nativeProvisionPlanSchema, planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime({ offset: true }), revokedAt: z.null(),
}).strict().refine(value => value.planDigest === nativeProvisionPlanDigest(value.plan)
  && value.plan.namespace === nativeProvisionNamespace(value.tenantId, value.projectId));
export type NativeProvisionGrant = z.infer<typeof nativeProvisionGrantSchema>;
export const nativeProvisionJobSchema = z.object({
  contractVersion: z.literal(NATIVE_PROVISION_CONTRACT), grantRef: z.string().uuid(),
  projectId: z.string().min(1).max(36), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const nativeResourceNames = (plan: NativeProvisionPlan) => ({
  queue: `${plan.namespace}-jobs`, bucket: `${plan.namespace}-media`, vector: `${plan.namespace}-vectors`,
  workflow: `${plan.namespace}-workflow`,
});
