import { createHash } from "node:crypto";
import { z } from "zod";

export const CLOUDFLARE_MIGRATION_MANDATE_SCHEMA = "cloudflare.first-migration-mandate.v1" as const;
export const CLOUDFLARE_MIGRATION_TARGET = "smartspec-cloudflare-runtime" as const;

export const cloudflareMigrationMandateEnvelopeSchema = z.object({
  schemaVersion: z.literal(CLOUDFLARE_MIGRATION_MANDATE_SCHEMA),
  missionId: z.string().regex(/^cf-migration:[a-f0-9]{32}$/),
  tenantId: z.string().min(1).max(36),
  ownerUserId: z.number().int().positive(),
  projectId: z.string().min(1).max(36),
  environment: z.literal("production"),
  targetId: z.literal(CLOUDFLARE_MIGRATION_TARGET),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/),
  zoneId: z.string().regex(/^[a-f0-9]{32}$/),
  routePattern: z.literal("smartaihub.app/*"),
  resourceIds: z.object({
    queueId: z.string().regex(/^[a-f0-9]{32}$/),
    deadLetterQueueId: z.string().regex(/^[a-f0-9]{32}$/),
    vpcServiceId: z.string().min(1).max(128),
    hyperdriveId: z.string().regex(/^[a-f0-9]{32}$/),
    nodeApplicationId: z.string().min(1).max(128),
    pythonApplicationId: z.string().min(1).max(128),
  }).strict(),
  actions: z.array(z.enum([
    "rotate_origin_configuration", "deploy_worker", "worker_canary", "synthetic_credit_billing",
    "synthetic_queue_recovery", "native_runtime_activation", "rollback",
  ])).min(1).max(7),
  resourceBudget: z.object({
    maxProviderWrites: z.number().int().min(1).max(40),
    maxWorkerDeployments: z.number().int().min(8).max(8),
    maxContainerStarts: z.number().int().min(0).max(8),
    maxContainerReservedSeconds: z.number().int().min(0).max(3600),
    maxQueueMessages: z.number().int().min(0).max(500),
    maxSyntheticCredits: z.number().int().min(0).max(300),
    syntheticFinancialMinorUnits: z.literal(0),
  }).strict(),
  rollbackPolicy: z.object({
    preserveM2Ingress: z.literal(true),
    preserveLinuxFallback: z.literal(true),
    containersOnDemand: z.literal(true),
    rollbackOnFailedAcceptance: z.literal(true),
    requireOwnerForOutOfScopeAction: z.literal(true),
  }).strict(),
}).strict();

export type CloudflareMigrationMandateEnvelope = z.infer<typeof cloudflareMigrationMandateEnvelopeSchema>;

/** Stable JSON encoding for reviewed Cloudflare plan digests. Keep in sync with
 * Python's json.dumps(value, sort_keys=True, separators=(",", ":")). */
export function cloudflareCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(cloudflareCanonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${cloudflareCanonicalJson(child)}`).join(",")}}`;
}

export function cloudflarePlanDigest(value: unknown): string {
  return createHash("sha256").update(cloudflareCanonicalJson(value)).digest("hex");
}

export function cloudflareMigrationMandateEnrollmentPayload(plan: CloudflareMigrationMandateEnvelope, idempotencyKey: string) {
  return { idempotencyKey, ...plan };
}

export function cloudflareMigrationMissionId(tenantId: string, projectId: string): string {
  const digest = createHash("sha256").update(`${tenantId}|${projectId}|production|${CLOUDFLARE_MIGRATION_TARGET}`).digest("hex").slice(0, 32);
  return `cf-migration:${digest}`;
}

export function verifyCloudflareMigrationMandateEnvelope(value: unknown, expected: {
  tenantId: string; projectId: string; ownerUserId: number;
}): CloudflareMigrationMandateEnvelope {
  const mandate = cloudflareMigrationMandateEnvelopeSchema.parse(value);
  if (mandate.tenantId !== expected.tenantId || mandate.projectId !== expected.projectId ||
      mandate.ownerUserId !== expected.ownerUserId || mandate.missionId !== cloudflareMigrationMissionId(expected.tenantId, expected.projectId)) {
    throw new Error("CLOUDFLARE_MIGRATION_MANDATE_SCOPE_MISMATCH");
  }
  return mandate;
}
