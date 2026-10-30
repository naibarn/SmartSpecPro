import { CLOUDFLARE_CONTAINER_ON_DEMAND, isCloudflareMediaProbeImage } from "./cloudflareMediaProbeContracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parseCloudflarePublicOrigin, parseCloudflarePublicOrigins } from "./cloudflareOriginContracts";
import { cloudflareNativeBindingDescriptorSchema, validateNativeBindingScope } from "./cloudflareNativeBindingDescriptor";
import { cloudflareHttpApplicationSettingsSchema, cloudflareHttpApplicationSecretsSchema,
  validateHttpApplicationSettings, httpApplicationVersionBindings } from "./cloudflareHttpApplicationBindings";

const credential = z.string().min(16).max(4096).regex(/^[\x21-\x7e]+$/);
export const cloudflareOriginSecretsSchema = z.object({ token: credential.min(32), clientId: credential, secret: credential,
  workflowRuntimeToken: credential.min(32).optional(), controlPlaneToken: credential.min(32).optional(),
  retentionToken: credential.min(32).optional(),
  applicationHttp: cloudflareHttpApplicationSecretsSchema.optional(),
  applicationCanaryToken: credential.min(32).optional(),
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
  /** Narrow staging intake capability; other consumers require separate scope. */
  workflowExecution: z.literal("emergency-intake").optional(),
  /** Opt-in domain SQL only; canonical admission/lease/settlement stay on Node. */
  workflowDatabase: z.literal("hyperdrive-intake").optional(),
  /** Public read capability, independent of job/Container activation. */
  runnerReleaseCatalog: z.literal("hyperdrive").optional(),
  jobTransport: z.enum(["workflows", "queues"]).optional(),
  retentionSchedule: z.literal("evidence-retention").optional(),
  mediaProbe: z.object({ containerPolicy: z.literal(CLOUDFLARE_CONTAINER_ON_DEMAND), capability: z.literal("container-media-probe-v1"),
    imageRef: z.string().refine(value => isCloudflareMediaProbeImage(value)) }).strict().optional(),
  applicationHttp: cloudflareHttpApplicationSettingsSchema.optional(),
  /** M2 ingress preserves the Linux HTTP authority without activating job or Container workloads. */
  ingressMode: z.literal("production-origin-bridge-v1").optional(),
  /** Provision class namespaces without API bindings, runtime secrets or VM access. */
  applicationHttpPhase: z.literal("namespace-only").optional(),
}).strict();
export const cloudflareOriginDescriptorSchema = cloudflareOriginSettingsSchema.extend({
  schemaVersion: z.literal("cloudflare.origin-configuration.v1"),
  versionId: z.string().uuid(),
  tenantId: z.string().min(1).max(36), projectId: z.string().min(1).max(100),
  environment: z.enum(["staging", "production"]), provider: z.literal("cloudflare"),
  accountRef: z.string().regex(/^[a-f0-9]{32}$/), targetId: z.enum(["smartspec-cloudflare-staging", "smartspec-cloudflare-runtime"]),
}).strict().superRefine((value, ctx) => {
  const expectedTarget = value.environment === "staging" ? "smartspec-cloudflare-staging" : "smartspec-cloudflare-runtime";
  if (value.targetId !== expectedTarget) ctx.addIssue({ code: "custom", message: "Origin target/environment mismatch" });
  if (value.ingressMode && (value.environment !== "production" || value.applicationHttp || value.nativeResources ||
      value.workflowExecution || value.retentionSchedule || value.runnerReleaseCatalog || value.jobTransport || value.mediaProbe)) {
    ctx.addIssue({ code: "custom", message: "Origin bridge requires production HTTP-only scope" });
  }
  if (value.environment === "production" && (value.nativeResources || value.workflowExecution ||
      value.workflowDatabase || value.runnerReleaseCatalog || value.jobTransport || value.retentionSchedule || value.mediaProbe)) {
    ctx.addIssue({ code: "custom", message: "Production background capabilities require separate admission" });
  }
});
export type CloudflareOriginDescriptor = z.infer<typeof cloudflareOriginDescriptorSchema>;
export type CloudflareOriginVersionBindings = Readonly<{
  configurationRef: string;
  configurationDigest: string;
  descriptor: CloudflareOriginDescriptor;
  secrets: z.infer<typeof cloudflareOriginSecretsSchema>;
}>;

export function assertCloudflareWorkflowConfiguration(settings: z.infer<typeof cloudflareOriginSettingsSchema>, secrets: z.infer<typeof cloudflareOriginSecretsSchema>): void {
  const namespaceOnly = settings.applicationHttpPhase === "namespace-only";
  const requiresWorkflowBinding = settings.jobTransport !== "queues";
  if (Boolean(settings.workflowExecution) !== Boolean(secrets.workflowRuntimeToken && secrets.controlPlaneToken) ||
      (settings.workflowExecution && ((requiresWorkflowBinding && !settings.nativeResources?.plan.workflow) || !settings.nativeResources.privateDatabase)) ||
      ((settings.workflowDatabase || settings.jobTransport || settings.mediaProbe) && !settings.workflowExecution) ||
      Boolean(settings.retentionSchedule) !== Boolean(secrets.retentionToken) ||
      (namespaceOnly && !settings.applicationHttp) ||
      Boolean(settings.applicationHttp && !namespaceOnly) !== Boolean(secrets.applicationHttp) ||
      Boolean((settings.applicationHttp && !namespaceOnly) || settings.ingressMode) !== Boolean(secrets.applicationCanaryToken) ||
      (settings.applicationHttpPhase && (settings.applicationHttp?.traffic !== undefined || settings.applicationHttp?.realtime !== undefined)) ||
      (secrets.applicationHttp?.node.CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT === "private-vpc-websocket-v1" &&
        (settings.applicationHttp?.traffic !== "staging-full-http-v1" ||
          !settings.nativeResources?.privateDatabase || settings.nativeResources.privateDatabase.plan.databaseName !== "smartspec")) ||
      (settings.applicationHttp && (settings.mediaProbe || Date.parse(settings.applicationHttp.expiresAt) > Date.parse(settings.expiresAt))) ||
      (settings.runnerReleaseCatalog && !settings.nativeResources?.privateDatabase?.plan.publicRunnerCatalogSourceJobId)) {
    throw new Error("CLOUDFLARE_WORKFLOW_CONFIGURATION_DENIED");
  }
}

/** Values are injected only from the exact immutable configuration authorized
 * by the deployment grant, never inferred from a caller's runtime flags. */
export function cloudflareWorkflowVersionBindings(value: CloudflareOriginVersionBindings) {
  assertCloudflareWorkflowConfiguration(value.descriptor, value.secrets);
  return [
    // This immutable allowlist is part of every origin configuration, including
    // namespace-only Container preparation. Keep it in the readback contract
    // exactly once rather than duplicating it in uploadVersion's base bindings.
    { name: "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS", type: "plain_text", text: JSON.stringify(value.descriptor.allowedPublicOrigins) },
    ...(value.descriptor.ingressMode ? [{ name: "CLOUDFLARE_INGRESS_MODE", type: "plain_text", text: value.descriptor.ingressMode },
      { name: "CLOUDFLARE_APPLICATION_CANARY_TOKEN", type: "secret_text", text: value.secrets.applicationCanaryToken! }] : []),
    ...(value.descriptor.applicationHttp && !value.descriptor.applicationHttpPhase ? httpApplicationVersionBindings(value.descriptor.applicationHttp,
      { ...value.descriptor, configurationRef: value.configurationRef }, value.secrets.applicationHttp!) : []),
    ...(value.descriptor.applicationHttp && !value.descriptor.applicationHttpPhase &&
      value.secrets.applicationHttp?.node.CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT === "private-vpc-websocket-v1" ? (() => {
        if (value.descriptor.environment !== "staging") throw new Error("CLOUDFLARE_STAGING_DATABASE_NETWORK_REQUIRED");
        const database = value.descriptor.nativeResources?.privateDatabase;
        if (!database || database.plan.databaseName !== "smartspec") throw new Error("CLOUDFLARE_STAGING_DATABASE_NETWORK_REQUIRED");
        const policy = { transport: "private-vpc-websocket-v1", environment: "staging", targetId: value.descriptor.targetId,
          configurationRef: value.configurationRef, namespace: value.descriptor.applicationHttp!.namespace,
          tunnelId: database.plan.tunnelId, hostname: database.plan.hostname, port: 5432,
          expiresAt: value.descriptor.applicationHttp!.expiresAt };
        return [
          { name: "CLOUDFLARE_APPLICATION_DATABASE_POLICY", type: "plain_text", text: JSON.stringify(policy) },
          { name: "DATABASE_NETWORK", type: "vpc_network", tunnel_id: database.plan.tunnelId },
        ];
      })() : []),
    ...(value.descriptor.applicationHttp && !value.descriptor.applicationHttpPhase ? [{ name: "CLOUDFLARE_APPLICATION_CANARY_TOKEN", type: "secret_text", text: value.secrets.applicationCanaryToken! }] : []),
    ...(value.descriptor.runnerReleaseCatalog ? [
      { name: "CLOUDFLARE_RUNNER_RELEASE_CATALOG", type: "plain_text", text: value.descriptor.runnerReleaseCatalog },
      { name: "CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt },
      { name: "CLOUDFLARE_RUNNER_RELEASE_NAMESPACE", type: "plain_text", text: value.descriptor.nativeResources!.privateDatabase!.plan.namespace },
    ] : []),
    ...((value.descriptor.workflowExecution || value.descriptor.retentionSchedule) ? [
      { name: "PLATFORM_EDGE_ORIGIN", type: "plain_text", text: value.descriptor.origin },
      { name: "PLATFORM_EDGE_PRIVATE_HOST", type: "plain_text", text: new URL(value.descriptor.origin).host },
    ] : []),
    ...(value.descriptor.workflowExecution ? [
      { name: "CLOUDFLARE_JOB_TRANSPORT", type: "plain_text", text: value.descriptor.jobTransport ?? "workflows" },
      { name: "CLOUDFLARE_WORKFLOW_TENANT_ID", type: "plain_text", text: value.descriptor.tenantId },
      { name: "CLOUDFLARE_WORKFLOW_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt },
      ...(value.descriptor.mediaProbe ? [
        { name: "CLOUDFLARE_CONTAINER_POLICY", type: "plain_text", text: value.descriptor.mediaProbe.containerPolicy },
        { name: "CLOUDFLARE_MEDIA_PROBE", type: "plain_text", text: value.descriptor.mediaProbe.capability },
        { name: "CLOUDFLARE_RUNNER_IMAGE_REF", type: "plain_text", text: value.descriptor.mediaProbe.imageRef },
      ] : []),
      ...(value.descriptor.workflowDatabase ? [{ name: "CLOUDFLARE_WORKFLOW_DATABASE", type: "plain_text", text: value.descriptor.workflowDatabase }] : []),
      { name: "CLOUDFLARE_RUNTIME_TOKEN", type: "secret_text", text: value.secrets.workflowRuntimeToken! },
      { name: "CLOUDFLARE_CONTROL_PLANE_TOKEN", type: "secret_text", text: value.secrets.controlPlaneToken! },
    ] : []),
    ...(value.descriptor.retentionSchedule ? [
      { name: "CLOUDFLARE_RETENTION_SCHEDULE", type: "plain_text", text: value.descriptor.retentionSchedule },
      { name: "CLOUDFLARE_RETENTION_TENANT_ID", type: "plain_text", text: value.descriptor.tenantId },
      { name: "CLOUDFLARE_RETENTION_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt },
      { name: "PLATFORM_EDGE_TOKEN", type: "secret_text", text: value.secrets.retentionToken! },
    ] : []),
  ];
}

export function assertCloudflareWorkflowVersionBindings(actual: unknown, value: CloudflareOriginVersionBindings): void {
  const expected = cloudflareWorkflowVersionBindings(value);
  if (!Array.isArray(actual) || expected.some(binding => {
    const matches = actual.filter(item => item?.name === binding.name);
    return matches.length !== 1 || matches[0].type !== binding.type ||
      (binding.type === "plain_text" && matches[0].text !== binding.text) ||
      (binding.type === "vpc_network" && matches[0].tunnel_id !== binding.tunnel_id);
  }) || actual.some(binding => (binding?.name?.startsWith("CLOUDFLARE_RUNNER_RELEASE_") || binding?.name === "CLOUDFLARE_WORKFLOW_DATABASE" || binding?.name === "CLOUDFLARE_MEDIA_PROBE" || binding?.name === "CLOUDFLARE_CONTAINER_POLICY" || binding?.name === "CLOUDFLARE_RUNNER_IMAGE_REF" ||
    binding?.name?.startsWith("CLOUDFLARE_NODE_HTTP_") || binding?.name?.startsWith("CLOUDFLARE_PYTHON_HTTP_") ||
    binding?.name === "CLOUDFLARE_APPLICATION_CANARY_TOKEN" ||
    binding?.name === "CLOUDFLARE_APPLICATION_HTTP_TRAFFIC" || binding?.name === "CLOUDFLARE_INGRESS_MODE" ||
    binding?.name === "CLOUDFLARE_APPLICATION_DATABASE_POLICY" || binding?.name === "DATABASE_NETWORK" ||
    binding?.name === "CLOUDFLARE_CONTAINER_REALTIME_ROUTES" || binding?.name === "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS" ||
    binding?.name?.startsWith("CLOUDFLARE_RETENTION_") || binding?.name === "PLATFORM_EDGE_TOKEN") &&
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
  if (descriptor.applicationHttp) {
    try { validateHttpApplicationSettings(descriptor.applicationHttp, descriptor, now, descriptor.applicationHttpPhase === "namespace-only"); } catch { return denied(); }
  }
  if ((descriptor.mediaProbe && !isCloudflareMediaProbeImage(descriptor.mediaProbe.imageRef, descriptor.accountRef)) || !origin || !allowed || allowed.includes(origin.origin) || Date.parse(descriptor.expiresAt) <= now ||
      descriptor.tenantId !== target.tenantId || descriptor.projectId !== target.projectId ||
      descriptor.accountRef !== target.accountRef || descriptor.targetId !== target.targetId ||
      descriptor.environment !== target.environment ||
      value.configurationDigest !== cloudflareOriginDescriptorDigest(descriptor) ||
      value.configurationRef !== `cf-origin:${value.configurationDigest}` || target.runtimePolicy !== value.configurationRef) denied();
  // Parsing snapshots the caller's object so asynchronous uploads cannot observe
  // mutable caller-owned settings or secret substitutions after validation.
  return { configurationRef: value.configurationRef, configurationDigest: value.configurationDigest, descriptor, secrets };
}
