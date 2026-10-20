import { createHash } from "node:crypto";
import { z } from "zod";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "@smartspec/shared/src/cloudflareOrigin";
import { cloudflareNativeBindingDescriptorSchema, validateNativeBindingScope } from "./cloudflareNativeBindingDescriptor";

const credential = z.string().min(16).max(4096).regex(/^[\x21-\x7e]+$/);
export const cloudflareOriginSecretsSchema = z.object({ token: credential.min(32), clientId: credential, secret: credential,
  workflowRuntimeToken: credential.min(32).optional(), controlPlaneToken: credential.min(32).optional(),
}).strict().refine(value => {
  const values = Object.values(value).filter(item => item !== undefined);
  return new Set(values).size === values.length && Boolean(value.workflowRuntimeToken) === Boolean(value.controlPlaneToken);
}, "Origin, Access, Workflow and control-plane credentials must be separate");
export const cloudflareOriginSettingsSchema = z.object({
  origin: z.string().max(2048),
  allowedPublicOrigins: z.array(z.string().max(2048)).min(1).max(32),
  accessApplicationId: z.string().uuid(),
  accessTeamName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  accessAudience: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/),
  expiresAt: z.string().datetime({ offset: true }),
  nativeResources: cloudflareNativeBindingDescriptorSchema.optional(),
  /** Narrow staging capability; Queue/cron/global cutover stay disabled. */
  workflowExecution: z.literal("emergency-intake").optional(),
  /** Opt-in domain SQL only; canonical admission/lease/settlement stay on Node. */
  workflowDatabase: z.literal("hyperdrive-intake").optional(),
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

export function assertCloudflareWorkflowConfiguration(settings: z.infer<typeof cloudflareOriginSettingsSchema>, secrets: z.infer<typeof cloudflareOriginSecretsSchema>): void {
  if (Boolean(settings.workflowExecution) !== Boolean(secrets.workflowRuntimeToken && secrets.controlPlaneToken) ||
      (settings.workflowExecution && (!settings.nativeResources?.plan.workflow || !settings.nativeResources.privateDatabase)) ||
      (settings.workflowDatabase && !settings.workflowExecution)) {
    throw new Error("CLOUDFLARE_WORKFLOW_CONFIGURATION_DENIED");
  }
}

/** Values are injected only from the exact immutable configuration authorized
 * by the deployment grant, never inferred from a caller's runtime flags. */
export function cloudflareWorkflowVersionBindings(value: CloudflareOriginVersionBindings) {
  assertCloudflareWorkflowConfiguration(value.descriptor, value.secrets);
  if (!value.descriptor.workflowExecution) return [];
  return [
    { name: "CLOUDFLARE_JOB_TRANSPORT", type: "plain_text", text: "workflows" },
    { name: "CLOUDFLARE_WORKFLOW_TENANT_ID", type: "plain_text", text: value.descriptor.tenantId },
    { name: "CLOUDFLARE_WORKFLOW_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt },
    ...(value.descriptor.workflowDatabase ? [{ name: "CLOUDFLARE_WORKFLOW_DATABASE", type: "plain_text", text: value.descriptor.workflowDatabase }] : []),
    { name: "PLATFORM_EDGE_ORIGIN", type: "plain_text", text: value.descriptor.origin },
    { name: "PLATFORM_EDGE_PRIVATE_HOST", type: "plain_text", text: new URL(value.descriptor.origin).host },
    { name: "CLOUDFLARE_RUNTIME_TOKEN", type: "secret_text", text: value.secrets.workflowRuntimeToken! },
    { name: "CLOUDFLARE_CONTROL_PLANE_TOKEN", type: "secret_text", text: value.secrets.controlPlaneToken! },
  ];
}

export function assertCloudflareWorkflowVersionBindings(actual: unknown, value: CloudflareOriginVersionBindings): void {
  const expected = cloudflareWorkflowVersionBindings(value);
  if (!Array.isArray(actual) || expected.some(binding => {
    const matches = actual.filter(item => item?.name === binding.name);
    return matches.length !== 1 || matches[0].type !== binding.type ||
      (binding.type === "plain_text" && matches[0].text !== binding.text);
  }) || actual.some(binding => binding?.name === "CLOUDFLARE_WORKFLOW_DATABASE" &&
    !expected.some(item => item.name === binding.name))) throw new Error("CLOUDFLARE_WORKFLOW_VERSION_BINDINGS_MISMATCH");
}

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
    assertCloudflareWorkflowConfiguration(descriptor, secrets);
  } catch { return denied(); }
  const origin = parseCloudflarePublicOrigin(descriptor.origin);
  const allowed = parseCloudflarePublicOrigins(JSON.stringify(descriptor.allowedPublicOrigins));
  if (descriptor.nativeResources) {
    try { validateNativeBindingScope(descriptor.nativeResources, descriptor, now); } catch { return denied(); }
  }
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
