import { createHash } from "node:crypto";
import { z } from "zod";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "../../../../packages/shared/src/cloudflareOrigin";

const credential = z.string().min(16).max(4096).regex(/^[\x21-\x7e]+$/);
export const cloudflareOriginSecretsSchema = z.object({ token: credential.min(32), clientId: credential, secret: credential }).strict()
  .refine(value => new Set([value.token, value.clientId, value.secret]).size === 3, "Origin and Access credentials must be separate");
export const cloudflareOriginSettingsSchema = z.object({
  origin: z.string().max(2048),
  allowedPublicOrigins: z.array(z.string().max(2048)).min(1).max(32),
  accessApplicationId: z.string().uuid(),
  accessTeamName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  accessAudience: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export const cloudflareOriginDescriptorSchema = cloudflareOriginSettingsSchema.extend({
  schemaVersion: z.literal("cloudflare.origin-configuration.v1"),
  versionId: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(100),
  environment: z.literal("staging"), provider: z.literal("cloudflare"),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/), targetId: z.literal("smartspec-cloudflare-staging"),
}).strict();
export type CloudflareOriginDescriptor = z.infer<typeof cloudflareOriginDescriptorSchema>;
export type CloudflareOriginVersionBindings = Readonly<{
  configurationRef: string;
  configurationDigest: string;
  descriptor: CloudflareOriginDescriptor;
  secrets: z.infer<typeof cloudflareOriginSecretsSchema>;
}>;

export function cloudflareOriginDescriptorDigest(descriptor: CloudflareOriginDescriptor) {
  const canonical = Object.fromEntries(Object.entries(descriptor).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Pure validation only: this does not confer deployment or provider authority. */
export function validateCloudflareOriginVersionBindings(value: CloudflareOriginVersionBindings, target: {
  tenantId: string; projectId: string; accountRef: string; targetId: string; environment: string; runtimePolicy?: string;
}, now = Date.now()): CloudflareOriginVersionBindings {
  function denied(): never { throw new Error("CLOUDFLARE_ORIGIN_CONFIGURATION_DENIED"); }
  let descriptor: CloudflareOriginDescriptor;
  let secrets: z.infer<typeof cloudflareOriginSecretsSchema>;
  try {
    descriptor = cloudflareOriginDescriptorSchema.parse(value?.descriptor);
    secrets = cloudflareOriginSecretsSchema.parse(value?.secrets);
  } catch { return denied(); }
  const origin = parseCloudflarePublicOrigin(descriptor.origin);
  const allowed = parseCloudflarePublicOrigins(JSON.stringify(descriptor.allowedPublicOrigins));
  if (!origin || !allowed || allowed.includes(origin.origin) || Date.parse(descriptor.expiresAt) <= now ||
      descriptor.tenantId !== target.tenantId || descriptor.projectId !== target.projectId ||
      descriptor.accountRef !== target.accountRef || descriptor.targetId !== target.targetId ||
      descriptor.environment !== target.environment ||
      value.configurationDigest !== cloudflareOriginDescriptorDigest(descriptor) ||
      value.configurationRef !== `cf-origin:${value.configurationDigest}` || target.runtimePolicy !== value.configurationRef) denied();
  // Parsing snapshots the caller's object so asynchronous uploads cannot observe
  // mutable caller-owned settings or secret substitutions after validation.
  return { configurationRef: value.configurationRef, configurationDigest: value.configurationDigest, descriptor, secrets };
}
