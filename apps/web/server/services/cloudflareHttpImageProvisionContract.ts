import { createHash } from "node:crypto";
import { z } from "zod";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";

/** One fixed canonical image recipe/publication, never VM activation or
 * arbitrary commands. Uses the existing staging policy and worker_jobs. */
export const HTTP_IMAGE_PROVISION_CONTRACT = "cloudflare-staging-http-image-v1";
export const HTTP_IMAGE_PROVISION_JOB = "cloudflare.staging.http.image.provision";
export const HTTP_IMAGE_PROVISION_GRANT = "cloudflare.staging-http-image-provision-grant.v1";
export const HTTP_IMAGE_BASES = {
  "node-http": "docker.io/library/node@sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09",
  "python-http": "docker.io/library/python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a",
} as const;
export const HTTP_IMAGE_CONNECTOR = "docker.io/cloudflare/cloudflared@sha256:e6aba36f47b17ba21c62404f826e7be09f089dc0d8978732752204a75d9d7375";

export const httpImageProvisionPlanSchema = z.object({
  namespace: z.string().regex(/^smartspec-staging-[a-f0-9]{12}$/),
  runtime: z.enum(["node-http", "python-http"]), sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  buildId: z.string().regex(/^[a-f0-9]{40}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/),
  configurationExpiresAt: z.string().datetime({ offset: true }),
  buildBudgetSeconds: z.union([z.literal(180), z.literal(360)]), maxImageBytes: z.literal(1_073_741_824), maxPublishedImages: z.literal(1),
}).strict().refine(value => value.buildId.startsWith(value.sourceSha + "-"));
export type HttpImageProvisionPlan = z.infer<typeof httpImageProvisionPlanSchema>;
export const httpImageProvisionPlanDigest = (plan: HttpImageProvisionPlan) => createHash("sha256")
  .update(JSON.stringify(Object.fromEntries(Object.entries(plan).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");

export const httpImageProvisionGrantSchema = z.object({
  schemaVersion: z.literal(HTTP_IMAGE_PROVISION_GRANT), grantRef: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(36), requesterUserId: z.number().int().positive(),
  executorId: z.string().min(1).max(200), jobId: z.string().uuid(), accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  targetId: z.literal("smartspec-cloudflare-staging"), environment: z.literal("staging"),
  actions: z.tuple([z.literal("provision")]), plan: httpImageProvisionPlanSchema, planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime({ offset: true }), revokedAt: z.null(),
}).strict().refine(value => value.planDigest === httpImageProvisionPlanDigest(value.plan) &&
  value.plan.namespace === nativeProvisionNamespace(value.tenantId, value.projectId));
export type HttpImageProvisionGrant = z.infer<typeof httpImageProvisionGrantSchema>;
export const httpImageProvisionJobSchema = z.object({
  contractVersion: z.literal(HTTP_IMAGE_PROVISION_CONTRACT), grantRef: z.string().uuid(), projectId: z.string().min(1).max(36),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export function httpImageRegistryRepository(grant: HttpImageProvisionGrant) {
  return `registry.cloudflare.com/${grant.accountRef}/${grant.plan.namespace}-${grant.plan.runtime}`;
}
