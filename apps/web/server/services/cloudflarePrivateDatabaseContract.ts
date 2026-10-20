import { createHash } from "node:crypto";
import { z } from "zod";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";

export const PRIVATE_DATABASE_CONTRACT = "cloudflare-staging-private-db-v1";
export const PRIVATE_DATABASE_JOB = "cloudflare.staging.private_database.provision";
export const PRIVATE_DATABASE_GRANT = "cloudflare.staging-private-database-provision-grant.v1";
export const privateDatabaseRole = (namespace: string) => `sah_cf_staging_${namespace.slice(-12)}`;
export const privateDatabasePlanSchema = z.object({
  namespace: z.string().regex(/^smartspec-staging-[a-f0-9]{12}$/),
  hostname: z.literal("db-staging.smartaihub.app"),
  zoneId: z.string().regex(/^[a-f0-9]{32}$/), tunnelId: z.string().uuid(),
  databaseName: z.string().regex(/^[a-zA-Z0-9_]{1,63}$/),
  caSha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** Add public-view access only by reusing one exact successful probe receipt. */
  publicRunnerCatalogSourceJobId: z.string().uuid().optional(),
  connectionLimit: z.literal(5), configurationExpiresAt: z.string().datetime({ offset: true }),
}).strict();
export type PrivateDatabasePlan = z.infer<typeof privateDatabasePlanSchema>;
export const privateDatabasePlanDigest = (plan: PrivateDatabasePlan) =>
  createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(plan).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
/** Provider resource names keep the original immutable connection-plan digest. */
export const privateDatabaseResourceDigest = (plan: PrivateDatabasePlan) => {
  const { publicRunnerCatalogSourceJobId: _source, ...connection } = plan;
  return privateDatabasePlanDigest(connection);
};
export const privateDatabaseGrantSchema = z.object({
  schemaVersion: z.literal(PRIVATE_DATABASE_GRANT), grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), requesterUserId: z.number().int().positive(),
  executorId: z.string().min(1).max(200), jobId: z.string().uuid(), accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  actions: z.tuple([z.literal("provision")]), plan: privateDatabasePlanSchema,
  planDigest: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.string().datetime({ offset: true }), revokedAt: z.null(),
}).strict().refine(value => value.planDigest === privateDatabasePlanDigest(value.plan)
  && value.plan.namespace === nativeProvisionNamespace(value.tenantId, value.projectId));
export type PrivateDatabaseGrant = z.infer<typeof privateDatabaseGrantSchema>;
export const privateDatabaseJobSchema = z.object({
  contractVersion: z.literal(PRIVATE_DATABASE_CONTRACT), grantRef: z.string().uuid(),
  projectId: z.string().min(1).max(36), planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  resumeFromJobId: z.string().uuid().optional(),
}).strict();
export const certificateDigest = (der: Uint8Array) => createHash("sha256").update(der).digest("hex");
