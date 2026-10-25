import { z } from "zod";

/** An origin-route transition, not a percentage split between two Worker versions. */
export const PRODUCTION_INGRESS_CONTRACT =
  "cloudflare-production-ingress-v1" as const;
export const PRODUCTION_INGRESS_GRANT =
  "cloudflare.production-ingress-grant.v1" as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const routeId = z.string().regex(/^[a-f0-9]{32}$/);
const release = {
  artifactRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  buildDigest: digest,
  configurationRef: z.string().regex(/^cf-origin:[a-f0-9]{64}$/),
  configurationDigest: digest,
};
const receipt = z
  .object({
    grantRef: z.string().uuid(),
    deploymentId: z.string().uuid(),
    versionId: z.string().uuid(),
    routeId,
    verifiedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const productionIngressJobSchema = z
  .object({
    contractVersion: z.literal(PRODUCTION_INGRESS_CONTRACT),
    grantRef: z.string().uuid(),
    projectId: z.string().min(1).max(36),
    targetId: z.literal("smartspec-cloudflare-runtime"),
    environment: z.literal("production"),
    zoneId: z.string().regex(/^[a-f0-9]{32}$/),
    routePattern: z.literal("smartaihub.app/*"),
    action: z.enum(["ingress-canary", "ingress-rollback"]),
    runtimeBaselineDeploymentId: z.string().uuid(),
    runtimeBaselineVersionId: z.string().uuid(),
    previousRoute: z.object({ state: z.literal("absent") }).strict(),
    ingressReceipt: receipt.nullable(),
    ...release,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.artifactRef !== `sha256:${value.buildDigest}` ||
      value.configurationRef !== `cf-origin:${value.configurationDigest}` ||
      (value.action === "ingress-rollback") !== (value.ingressReceipt !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Production ingress release/rollback binding invalid",
      });
    }
  });
export const productionIngressGrantSchema = z
  .object({
    schemaVersion: z.literal(PRODUCTION_INGRESS_GRANT),
    grantRef: z.string().uuid(),
    jobId: z.string().uuid(),
    tenantId: z.string().min(1).max(36),
    requesterUserId: z.number().int().positive(),
    executorId: z.string().min(1).max(200),
    projectId: z.string().min(1).max(36),
    targetId: z.literal("smartspec-cloudflare-runtime"),
    environment: z.literal("production"),
    accountRef: z.string().regex(/^[a-f0-9]{32}$/),
    operation: productionIngressJobSchema,
    exposure: z.literal("100-percent-http-origin-bridge"),
    actions: z.tuple([z.literal("deploy"), z.literal("rollback")]),
    maxDurationSeconds: z.number().int().min(1).max(900),
    expiresAt: z.string().datetime({ offset: true }),
    revokedAt: z.null(),
  })
  .strict()
  .refine(
    value =>
      value.operation.grantRef === value.grantRef &&
      value.projectId === value.operation.projectId &&
      value.targetId === value.operation.targetId &&
      value.environment === value.operation.environment,
    "Ingress grant scope mismatch"
  );
export type ProductionIngressJob = z.infer<typeof productionIngressJobSchema>;
export type ProductionIngressGrant = z.infer<
  typeof productionIngressGrantSchema
>;

export function productionIngressGrantAllowsJob(
  grant: ProductionIngressGrant,
  job: ProductionIngressJob,
  binding: {
    jobId: string;
    tenantId: string;
    requesterUserId: number;
    executorId: string;
    accountRef: string;
    now: Date;
  }
) {
  const parsed = productionIngressGrantSchema.safeParse(grant);
  const operation = productionIngressJobSchema.safeParse(job);
  return (
    parsed.success &&
    operation.success &&
    grant.jobId === binding.jobId &&
    grant.tenantId === binding.tenantId &&
    grant.requesterUserId === binding.requesterUserId &&
    grant.executorId === binding.executorId &&
    grant.accountRef === binding.accountRef &&
    Date.parse(grant.expiresAt) > binding.now.getTime() &&
    JSON.stringify(parsed.data.operation) === JSON.stringify(operation.data)
  );
}
