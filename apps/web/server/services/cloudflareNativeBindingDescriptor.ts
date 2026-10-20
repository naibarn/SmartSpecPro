import { z } from "zod";
import { privateDatabaseBindingSchema, validatePrivateDatabaseBinding, verifyPrivateDatabaseProviderResources } from "./cloudflarePrivateDatabaseBinding";
import { NATIVE_PROVISION_CONTRACT, NATIVE_PROVISION_JOB, nativeProvisionJobSchema,
  nativeProvisionNamespace, nativeProvisionPlanDigest, nativeProvisionPlanSchema, nativeResourceNames } from "./cloudflareNativeProvisionContract";

/** Included in the immutable configuration digest, never deployment authority by itself. */
export const cloudflareNativeBindingDescriptorSchema = z.object({
  provisionJobId: z.string().uuid(), plan: nativeProvisionPlanSchema,
  planDigest: z.string().regex(/^[a-f0-9]{64}$/), queueId: z.string().regex(/^[a-f0-9]{32}$/),
  privateDatabase: privateDatabaseBindingSchema.optional(),
  workflowId: z.string().uuid().optional(),
}).strict().refine(value => value.planDigest === nativeProvisionPlanDigest(value.plan) && Boolean(value.plan.workflow) === Boolean(value.workflowId));
export type CloudflareNativeBindingDescriptor = z.infer<typeof cloudflareNativeBindingDescriptorSchema>;
function denied(code: string): never { throw Object.assign(new Error(code), { diagnosticCode: code, class: "permanent" }); }

export function validateNativeBindingScope(value: CloudflareNativeBindingDescriptor, scope: {
  tenantId: string; projectId: string; expiresAt: string;
}, now = Date.now()) {
  const descriptor = cloudflareNativeBindingDescriptorSchema.parse(value);
  if (descriptor.plan.namespace !== nativeProvisionNamespace(scope.tenantId, scope.projectId)
    || Date.parse(descriptor.plan.configurationExpiresAt) <= now
    || Date.parse(descriptor.plan.configurationExpiresAt) < Date.parse(scope.expiresAt))
    denied("CLOUDFLARE_NATIVE_BINDING_SCOPE_DENIED");
  if (descriptor.privateDatabase) validatePrivateDatabaseBinding(descriptor.privateDatabase, scope, now);
  return descriptor;
}

export function assertNativeProvisionReceipt(value: CloudflareNativeBindingDescriptor, receipt: {
  id: string; tenantId: string; requestedByUserId: number | null; jobType: string; contractVersion: string;
  status: string; operatorReviewRequired: boolean; inputJson: unknown; outputJson: unknown;
} | undefined, scope: { tenantId: string; projectId: string; accountRef: string; actorUserId: number }) {
  const descriptor = cloudflareNativeBindingDescriptorSchema.parse(value);
  const job = nativeProvisionJobSchema.safeParse(receipt?.inputJson);
  const output = receipt?.outputJson as Record<string, any> | null;
  const names = nativeResourceNames(descriptor.plan);
  if (!receipt || receipt.id !== descriptor.provisionJobId || receipt.tenantId !== scope.tenantId
    || receipt.requestedByUserId !== scope.actorUserId || receipt.jobType !== NATIVE_PROVISION_JOB
    || receipt.contractVersion !== NATIVE_PROVISION_CONTRACT || receipt.status !== "succeeded" || receipt.operatorReviewRequired
    || !job.success || job.data.projectId !== scope.projectId || job.data.planDigest !== descriptor.planDigest
    || !output || output.accountRef !== scope.accountRef || output.namespace !== descriptor.plan.namespace
    || output.queue?.name !== names.queue || output.queue?.id !== descriptor.queueId
    || output.bucket?.name !== names.bucket || output.vector?.name !== names.vector
    || (descriptor.plan.workflow && (!output.workflow || output.workflow.id !== descriptor.workflowId ||
      output.workflow.name !== names.workflow || output.workflow.scriptName !== "smartspec-cloudflare-staging" || output.workflow.className !== "CanonicalJobWorkflow"))
    || output.providerConfigurationVerified !== true || output.activation !== "disabled" || output.jobHandlerQualified !== false
    || !Array.isArray(output.metadataIndexes) || output.metadataIndexes.length !== 2
    || !["tenantId", "sourceJobId"].every(field => output.metadataIndexes.includes(field)))
    denied("CLOUDFLARE_NATIVE_PROVISION_RECEIPT_DENIED");
}

export function nativeWorkerBindings(value: CloudflareNativeBindingDescriptor) {
  const descriptor = cloudflareNativeBindingDescriptorSchema.parse(value), names = nativeResourceNames(descriptor.plan);
  return [
    { name: "JOB_QUEUE", type: "queue", queue_name: names.queue },
    { name: "MEDIA_BUCKET", type: "r2_bucket", bucket_name: names.bucket },
    { name: "VECTOR_INDEX", type: "vectorize", index_name: names.vector },
    ...(descriptor.privateDatabase ? [{ name: "HYPERDRIVE", type: "hyperdrive", id: descriptor.privateDatabase.hyperdriveId }] : []),
    ...(descriptor.plan.workflow ? [{ name: "JOB_WORKFLOW", type: "workflow", workflow_name: names.workflow, class_name: "CanonicalJobWorkflow", script_name: "smartspec-cloudflare-staging" }] : []),
  ];
}

/** Check the immutable uploaded version before activating it, including retries. */
export function assertNativeWorkerBindings(actual: unknown, value: CloudflareNativeBindingDescriptor, workflowExecution = false) {
  const expected = nativeWorkerBindings(value);
  if (!Array.isArray(actual) || expected.some(binding => {
    const matches = actual.filter(item => item?.name === binding.name);
    return matches.length !== 1 || Object.entries(binding).some(([key, field]) => matches[0][key] !== field);
  }) || actual.some(item => ["queue", "r2_bucket", "vectorize", "hyperdrive", "workflow"].includes(item?.type)
    && !expected.some(binding => binding.name === item.name))
    || actual.filter(item => item?.name === "CLOUDFLARE_ACTIVATION").length !== 1
    || (workflowExecution && !value.plan.workflow)
    || !actual.some(item => item?.name === "CLOUDFLARE_ACTIVATION" && item.type === "plain_text" && item.text === (workflowExecution ? "enabled" : "disabled")))
    denied("CLOUDFLARE_NATIVE_VERSION_BINDINGS_MISMATCH");
}

/** Read-only provider preflight; the scoped provision credential stays in its callback. */
export async function verifyNativeProviderResources(input: {
  descriptor: CloudflareNativeBindingDescriptor; accountRef: string; token: string; fetchImpl?: typeof fetch;
}) {
  const descriptor = cloudflareNativeBindingDescriptorSchema.parse(input.descriptor);
  if (!/^[a-f0-9]{32}$/.test(input.accountRef) || Date.parse(descriptor.plan.configurationExpiresAt) <= Date.now())
    denied("CLOUDFLARE_NATIVE_BINDING_SCOPE_DENIED");
  const names = nativeResourceNames(descriptor.plan);
  const get = async (path: string) => {
    let response: Response, body: any;
    try {
      response = await (input.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${input.accountRef}${path}`, {
        headers: { authorization: `Bearer ${input.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 1024 * 1024) denied("CLOUDFLARE_NATIVE_PROVIDER_RESPONSE_INVALID");
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return denied("CLOUDFLARE_NATIVE_PROVIDER_READ_UNAVAILABLE"); }
    if (!response.ok || body.success !== true) denied(`CLOUDFLARE_NATIVE_PROVIDER_READ_HTTP_${response.status}`);
    return body.result;
  };
  const [queue, bucket, vector, metadata] = await Promise.all([
    get(`/queues/${descriptor.queueId}`), get(`/r2/buckets/${names.bucket}`),
    get(`/vectorize/v2/indexes/${names.vector}`), get(`/vectorize/v2/indexes/${names.vector}/metadata_index/list`),
  ]);
  if (queue?.queue_id !== descriptor.queueId || queue.queue_name !== names.queue || queue.consumers_total_count !== 0
    || bucket?.name !== names.bucket || vector?.name !== names.vector || vector.config?.dimensions !== 768 || vector.config?.metric !== "cosine"
    || !Array.isArray(metadata?.metadataIndexes) || !["tenantId", "sourceJobId"].every(field => metadata.metadataIndexes
      .some((item: any) => item.propertyName === field && ["string", "String"].includes(item.indexType))))
    denied("CLOUDFLARE_NATIVE_PROVIDER_RESOURCE_DRIFT");
  if (descriptor.privateDatabase) await verifyPrivateDatabaseProviderResources({ ...input, descriptor: descriptor.privateDatabase });
  if (descriptor.plan.workflow) {
    const workflow = await get(`/workflows/${names.workflow}`);
    if (workflow?.id !== descriptor.workflowId || workflow.name !== names.workflow || workflow.script_name !== "smartspec-cloudflare-staging" ||
        workflow.class_name !== "CanonicalJobWorkflow" || workflow.is_deleted !== 0) denied("CLOUDFLARE_NATIVE_PROVIDER_WORKFLOW_DRIFT");
  }
}
