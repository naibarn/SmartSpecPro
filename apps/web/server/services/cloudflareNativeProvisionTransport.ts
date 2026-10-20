import { z } from "zod";
import { nativeProvisionGrantSchema, nativeResourceNames, type NativeProvisionGrant } from "./cloudflareNativeProvisionContract";

const resource = z.object({ name: z.string().min(1), id: z.string().optional() }).strict();
export const nativeProvisionCheckpointSchema = z.object({
  planDigest: z.string(), preflightComplete: z.boolean().optional(),
  pending: z.enum(["queue", "bucket", "vector", "metadata:tenantId", "metadata:sourceJobId", "workflow"]).optional(),
  queue: resource.optional(), bucket: resource.optional(), vector: resource.optional(),
  workflow: z.object({ name: z.string(), id: z.string().uuid(), scriptName: z.literal("smartspec-cloudflare-staging"), className: z.literal("CanonicalJobWorkflow") }).strict().optional(),
  metadata: z.array(z.enum(["tenantId", "sourceJobId"])).default([]),
  metadataMutations: z.record(z.enum(["tenantId", "sourceJobId"]), z.string().uuid()).optional(),
}).strict();
export type NativeProvisionCheckpoint = z.infer<typeof nativeProvisionCheckpointSchema>;

export class NativeProvisionError extends Error {
  readonly class = "permanent";
  constructor(readonly diagnosticCode: string) { super(diagnosticCode); }
}

/** Only isolated metadata creation. No delete/adopt, IAM, DB, consumer or cron API. */
export async function provisionCloudflareNative(input: {
  grant: NativeProvisionGrant; token: string; checkpoint: NativeProvisionCheckpoint;
  assertAuthorized: () => Promise<void>; saveCheckpoint: (state: NativeProvisionCheckpoint) => Promise<void>;
  fetchImpl?: typeof fetch;
  waitForMetadata?: () => Promise<void>;
  readOnly?: boolean;
}) {
  const grant = nativeProvisionGrantSchema.parse(input.grant);
  const state = nativeProvisionCheckpointSchema.parse(input.checkpoint);
  if (state.planDigest !== grant.planDigest) throw new NativeProvisionError("NATIVE_PLAN_CHECKPOINT_MISMATCH");
  const names = nativeResourceNames(grant.plan), base = `https://api.cloudflare.com/client/v4/accounts/${grant.accountRef}`;
  let requests = 0;
  const api = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
    await input.assertAuthorized();
    if (++requests > 40) throw new NativeProvisionError("NATIVE_PROVIDER_REQUEST_BUDGET_EXCEEDED");
    let response: Response;
    try {
      response = await (input.fetchImpl ?? fetch)(base + path, {
        method, headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new NativeProvisionError("NATIVE_PROVIDER_RESPONSE_UNCERTAIN"); }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 1024 * 1024) throw new NativeProvisionError("NATIVE_PROVIDER_RESPONSE_INVALID");
    let value: any;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new NativeProvisionError("NATIVE_PROVIDER_RESPONSE_INVALID"); }
    if (response.status === 404 && body === undefined) return null;
    if (!response.ok || value.success !== true) throw new NativeProvisionError(`NATIVE_PROVIDER_HTTP_${response.status}`);
    return value;
  };
  const persist = () => input.saveCheckpoint(nativeProvisionCheckpointSchema.parse(state));
  const queueList = async () => {
    const result = await api("/queues?per_page=100");
    if (!Array.isArray(result?.result) || result.result.length >= 100 || (result.result_info?.total_pages ?? 1) > 1)
      throw new NativeProvisionError("NATIVE_QUEUE_INVENTORY_INCOMPLETE");
    return result.result as Array<{ queue_id?: string; queue_name?: string; consumers_total_count?: number }>;
  };
  if (state.pending) throw new NativeProvisionError("NATIVE_PROVISION_UNCERTAIN_RECONCILIATION_REQUIRED");
  if (input.readOnly && (!state.preflightComplete || !state.queue || !state.bucket || !state.vector
    || (grant.plan.workflow && !state.workflow)
    || !["tenantId", "sourceJobId"].every(name => state.metadata.includes(name as "tenantId" | "sourceJobId"))))
    throw new NativeProvisionError("NATIVE_READ_ONLY_CHECKPOINT_INCOMPLETE");
  if (!state.preflightComplete) {
    if (state.queue || state.bucket || state.vector) throw new NativeProvisionError("NATIVE_CHECKPOINT_INVALID");
    const queue = (await queueList()).find(item => item.queue_name === names.queue);
    const bucket = await api(`/r2/buckets/${names.bucket}`), vector = await api(`/vectorize/v2/indexes/${names.vector}`);
    if (queue || bucket || vector) throw new NativeProvisionError("NATIVE_UNOWNED_RESOURCE_COLLISION");
    state.preflightComplete = true; await persist();
  }
  for (const kind of ["queue", "bucket", "vector"] as const) {
    if (!state[kind]) {
      state.pending = kind; await persist();
      const created = kind === "queue" ? await api("/queues", { queue_name: names.queue })
        : kind === "bucket" ? await api("/r2/buckets", { name: names.bucket })
          : await api("/vectorize/v2/indexes", { name: names.vector,
            description: `Canonical staging provision ${grant.jobId}`, config: { dimensions: 768, metric: "cosine" } });
      const actual = created?.result;
      if ((kind === "queue" ? actual?.queue_name : actual?.name) !== names[kind]
        || (kind === "queue" && (typeof actual?.queue_id !== "string" || !/^[a-f0-9]{32}$/.test(actual.queue_id))))
        throw new NativeProvisionError("NATIVE_CREATED_RESOURCE_INVALID");
      state[kind] = { name: names[kind], ...(kind === "queue" ? { id: actual.queue_id } : {}) };
      delete state.pending; await persist();
    }
    if (state[kind]?.name !== names[kind]) throw new NativeProvisionError("NATIVE_RESOURCE_SCOPE_MISMATCH");
  }
  for (const propertyName of ["tenantId", "sourceJobId"] as const) {
    if (state.metadata.includes(propertyName)) continue;
    const before = await api(`/vectorize/v2/indexes/${names.vector}/metadata_index/list`);
    const indexes = before?.result?.metadataIndexes;
    if (!Array.isArray(indexes)) throw new NativeProvisionError("NATIVE_METADATA_INVENTORY_INVALID");
    const existing = indexes.find((item: any) => item.propertyName === propertyName);
    if (existing && !["string", "String"].includes(existing.indexType)) throw new NativeProvisionError("NATIVE_METADATA_TYPE_MISMATCH");
    if (!existing) {
      state.pending = `metadata:${propertyName}`; await persist();
      const mutation = await api(`/vectorize/v2/indexes/${names.vector}/metadata_index/create`, { propertyName, indexType: "string" });
      const mutationId = z.string().uuid().safeParse(mutation?.result?.mutationId);
      if (!mutationId.success) throw new NativeProvisionError("NATIVE_METADATA_MUTATION_INVALID");
      state.metadataMutations = { ...state.metadataMutations, [propertyName]: mutationId.data };
      delete state.pending;
    }
    state.metadata.push(propertyName); await persist();
  }
  const queues = await queueList(), queue = queues.find(item => item.queue_id === state.queue?.id);
  const bucket = await api(`/r2/buckets/${names.bucket}`), vector = await api(`/vectorize/v2/indexes/${names.vector}`);
  if (queue?.queue_name !== names.queue || (queue.consumers_total_count ?? 0) !== 0
    || bucket?.result?.name !== names.bucket || vector?.result?.name !== names.vector
    || vector.result.config?.dimensions !== 768 || vector.result.config?.metric !== "cosine")
    throw new NativeProvisionError("NATIVE_PROVIDER_READBACK_MISMATCH");
  // Metadata mutations are asynchronous. The provider currently returns
  // capitalized types in readback, although creation accepts lowercase types.
  let metadataReady = false;
  for (let attempt = 0; attempt < 19; attempt++) {
    const metadata = await api(`/vectorize/v2/indexes/${names.vector}/metadata_index/list`);
    if (!Array.isArray(metadata?.result?.metadataIndexes)) throw new NativeProvisionError("NATIVE_METADATA_INVENTORY_INVALID");
    metadataReady = ["tenantId", "sourceJobId"].every(name => metadata.result.metadataIndexes
      .some((item: any) => item.propertyName === name && ["string", "String"].includes(item.indexType)));
    if (metadataReady) break;
    if (attempt < 18) {
      await input.assertAuthorized();
      await (input.waitForMetadata ?? (() => new Promise(resolve => setTimeout(resolve, 10_000))))();
    }
  }
  if (!metadataReady) throw new NativeProvisionError("NATIVE_METADATA_PROPAGATION_PENDING");
  if (grant.plan.workflow) {
    const path = `/workflows/${names.workflow}`;
    let workflow = (await api(path))?.result;
    if (!state.workflow) {
      if (workflow) throw new NativeProvisionError("NATIVE_UNOWNED_WORKFLOW_COLLISION");
      state.pending = "workflow"; await persist();
      workflow = (await api(path, { class_name: "CanonicalJobWorkflow", script_name: "smartspec-cloudflare-staging",
        concurrency: { limit: 1 }, limits: { steps: 1 }, schedules: [],
        default_retention: { success_retention: "1 day", error_retention: "1 day" } }, "PUT"))?.result;
      if (!z.string().uuid().safeParse(workflow?.id).success || workflow.name !== names.workflow ||
          workflow.script_name !== "smartspec-cloudflare-staging" || workflow.class_name !== "CanonicalJobWorkflow" || workflow.is_deleted !== 0)
        throw new NativeProvisionError("NATIVE_CREATED_WORKFLOW_INVALID");
      state.workflow = { id: workflow.id, name: workflow.name, scriptName: "smartspec-cloudflare-staging", className: "CanonicalJobWorkflow" };
      delete state.pending; await persist();
      workflow = (await api(path))?.result;
    }
    if (workflow?.id !== state.workflow.id || workflow.name !== names.workflow || workflow.script_name !== state.workflow.scriptName ||
        workflow.class_name !== state.workflow.className || workflow.is_deleted !== 0)
      throw new NativeProvisionError("NATIVE_WORKFLOW_READBACK_MISMATCH");
  } else if (state.workflow) throw new NativeProvisionError("NATIVE_UNAUTHORIZED_WORKFLOW_CHECKPOINT");
  await input.assertAuthorized();
  return { namespace: grant.plan.namespace, accountRef: grant.accountRef, queue: state.queue!, bucket: state.bucket!, vector: state.vector!,
    metadataIndexes: state.metadata, ...(state.workflow ? { workflow: state.workflow } : {}),
    providerConfigurationVerified: true, activation: "disabled", jobHandlerQualified: false };
}
