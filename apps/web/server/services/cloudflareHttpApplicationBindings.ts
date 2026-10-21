import { z } from "zod";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB, httpImageProvisionJobSchema } from "./cloudflareHttpImageProvisionContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";

const sha = z.string().regex(/^[a-f0-9]{40}$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const image = z.object({ provisionJobId: z.string().uuid(), planDigest: hash,
  image: z.string().regex(/^registry\.cloudflare\.com\/[a-f0-9]{32}\/smartspec-staging-[a-f0-9]{12}-(node|python)-http@sha256:[a-f0-9]{64}$/) }).strict();
/** One paired, bounded private canary capability. Public API traffic and job
 * execution are independent owners and cannot be enabled by this setting. */
export const cloudflareHttpApplicationSettingsSchema = z.object({
  mode: z.literal("private-canary"), namespace: z.string().regex(/^smartspec-staging-[a-f0-9]{12}$/), sourceSha: sha,
  /** Explicitly route API/auth/REST HTTP traffic to the paired Node Container in staging. */
  traffic: z.literal("staging-full-http-v1").optional(),
  node: image, python: image, issuedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  maxStarts: z.number().int().min(1).max(2), maxComputeSeconds: z.number().int().min(1).max(1200),
  hardLifetimeSeconds: z.number().int().min(1).max(600), idleTimeoutSeconds: z.number().int().min(1).max(30),
  instance: z.enum(["basic", "standard-1"]),
  startupDiagnostics: z.literal("container-logs").optional(),
}).strict();
export type HttpApplicationSettings = z.infer<typeof cloudflareHttpApplicationSettingsSchema>;
const environment = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(16_384)).refine(value =>
  Object.keys(value).length <= 128 && JSON.stringify(value).length <= 65_536 && Object.entries(value).every(([key, entry]) =>
    !entry.includes("\0") && !/^(?:NODE_OPTIONS|NODE_PATH|TSX_TSCONFIG_PATH|PYTHONPATH|PYTHONHOME|LD_.*|PATH|CLOUDFLARE_API_TOKEN|CLOUDFLARE_STAGING_EXECUTOR_.*)$/.test(key)));
export const cloudflareHttpApplicationSecretsSchema = z.object({ node: environment, python: environment }).strict();
type Scope = { tenantId: string; projectId: string; accountRef: string };
export function validateHttpApplicationSettings(value: HttpApplicationSettings, scope: Scope, now = Date.now(), namespaceOnly = false) {
  const parsed = cloudflareHttpApplicationSettingsSchema.parse(value), issued = Date.parse(parsed.issuedAt), expiry = Date.parse(parsed.expiresAt);
  if (parsed.namespace !== nativeProvisionNamespace(scope.tenantId, scope.projectId) || !/^[a-f0-9]{32}$/.test(scope.accountRef) ||
      issued > now || (!namespaceOnly && expiry <= now) || expiry <= issued || expiry - issued > 3600_000 || parsed.maxComputeSeconds < parsed.hardLifetimeSeconds ||
      parsed.idleTimeoutSeconds > parsed.hardLifetimeSeconds || parsed.node.provisionJobId === parsed.python.provisionJobId)
    throw new Error("CLOUDFLARE_HTTP_APPLICATION_SCOPE_DENIED");
  for (const runtime of ["node", "python"] as const) {
    const expected = `registry.cloudflare.com/${scope.accountRef}/${parsed.namespace}-${runtime}-http@sha256:`;
    if (!parsed[runtime].image.startsWith(expected)) throw new Error("CLOUDFLARE_HTTP_APPLICATION_IMAGE_DENIED");
  }
  return parsed;
}

/** Persisted successful canonical image publication is mandatory. A local
 * Docker image ID or same-name provider tag is never deployment evidence. */
export function assertHttpImageProvisionReceipt(value: HttpApplicationSettings, runtime: "node" | "python", receipt: {
  id: string; tenantId: string; requestedByUserId: number | null; jobType: string; contractVersion: string;
  status: string; operatorReviewRequired: boolean; inputJson: unknown; outputJson: unknown;
} | undefined, scope: Scope & { actorUserId: number }) {
  const expected = value[runtime], input = httpImageProvisionJobSchema.safeParse(receipt?.inputJson);
  const output = receipt?.outputJson as Record<string, unknown> | null;
  if (!receipt || receipt.id !== expected.provisionJobId || receipt.tenantId !== scope.tenantId || receipt.requestedByUserId !== scope.actorUserId ||
      receipt.jobType !== HTTP_IMAGE_PROVISION_JOB || receipt.contractVersion !== HTTP_IMAGE_PROVISION_CONTRACT || receipt.status !== "succeeded" ||
      receipt.operatorReviewRequired || !input.success || input.data.projectId !== scope.projectId || input.data.planDigest !== expected.planDigest ||
      !output || output.schemaVersion !== "cloudflare-http-image-receipt-v1" || output.jobId !== expected.provisionJobId ||
      output.planDigest !== expected.planDigest || output.sourceSha !== value.sourceSha || output.runtime !== `${runtime}-http` ||
      output.accountRef !== scope.accountRef || output.namespace !== value.namespace || output.image !== expected.image ||
      output.registryVerified !== true || output.containerStarts !== 0 || output.applicationCreated !== false || output.activation !== "disabled")
    throw new Error("CLOUDFLARE_HTTP_IMAGE_PROVISION_RECEIPT_DENIED");
}

/** Provider-shape metadata matches Wrangler's Durable Object-managed image
 * map. It declares capabilities only; no VM is prewarmed or public start route
 * added. DO name checks in the runtime bound execution to one instance/API. */
export function httpApplicationWorkerMetadata(value: HttpApplicationSettings, scope: Scope, namespaceOnly = false) {
  // A retained namespace/image declaration carries no runtime secrets or VM
  // binding. Its recovery lifetime follows the enclosing origin configuration;
  // API execution always retains the shorter, strict canary expiry.
  validateHttpApplicationSettings(value, scope, Date.now(), namespaceOnly);
  return {
    exports: {
      StagingNodeHttpContainer: { type: "durable-object", storage: "sqlite", container: `${value.namespace}-node-http` },
      StagingPythonHttpContainer: { type: "durable-object", storage: "sqlite", container: `${value.namespace}-python-http` },
      ApplicationHttpBridge: { type: "worker" },
    },
    containers: [
      { name: `${value.namespace}-node-http`, class_name: "StagingNodeHttpContainer", images: { node: value.node.image } },
      { name: `${value.namespace}-python-http`, class_name: "StagingPythonHttpContainer", images: { python: value.python.image } },
    ],
    bindings: [
      { name: "NODE_HTTP", type: "durable_object_namespace", class_name: "StagingNodeHttpContainer" },
      { name: "PYTHON_HTTP", type: "durable_object_namespace", class_name: "StagingPythonHttpContainer" },
    ],
  };
}

export function httpApplicationVersionBindings(value: HttpApplicationSettings, scope: Scope & { configurationRef: string }, secrets: z.infer<typeof cloudflareHttpApplicationSecretsSchema>) {
  validateHttpApplicationSettings(value, scope);
  const secret = cloudflareHttpApplicationSecretsSchema.parse(secrets);
  // The packaged server validates this bootstrap setting during module load.
  // Reject an incomplete API deployment before it can consume a paid VM start;
  // namespace-only preparation never injects application secrets.
  if ((secret.node.CONTROL_PLANE_API_KEY?.length ?? 0) < 24) {
    throw new Error("CLOUDFLARE_HTTP_APPLICATION_BOOTSTRAP_REQUIRED");
  }
  if (!/^cf-origin:[a-f0-9]{64}$/.test(scope.configurationRef)) throw new Error("CLOUDFLARE_HTTP_APPLICATION_SCOPE_DENIED");
  const profile = (runtime: "node" | "python") => ({ configurationRef: scope.configurationRef, sourceSha: value.sourceSha,
    targetId: "smartspec-cloudflare-staging", runtime: `${runtime}-http`, accountRef: scope.accountRef, namespace: value.namespace,
    image: value[runtime].image, issuedAt: value.issuedAt, expiresAt: value.expiresAt, maxStarts: value.maxStarts,
    maxComputeSeconds: value.maxComputeSeconds, hardLifetimeSeconds: value.hardLifetimeSeconds, idleTimeoutSeconds: value.idleTimeoutSeconds,
    instance: value.instance, networkAccess: "application-outbound" });
  return [
    { name: "CLOUDFLARE_CONTAINER_POLICY", type: "plain_text", text: "on-demand" },
    { name: "CLOUDFLARE_NODE_HTTP_PROFILE", type: "plain_text", text: JSON.stringify(profile("node")) },
    { name: "CLOUDFLARE_PYTHON_HTTP_PROFILE", type: "plain_text", text: JSON.stringify(profile("python")) },
    { name: "CLOUDFLARE_NODE_HTTP_SECRETS", type: "secret_text", text: JSON.stringify(secret.node) },
    { name: "CLOUDFLARE_PYTHON_HTTP_SECRETS", type: "secret_text", text: JSON.stringify(secret.python) },
    ...(value.traffic ? [{ name: "CLOUDFLARE_APPLICATION_HTTP_TRAFFIC", type: "plain_text", text: value.traffic }] : []),
  ];
}
