import { describe, expect, it, vi } from "vitest";
import { nativeProvisionGrantSchema, nativeProvisionNamespace, nativeProvisionPlanDigest, nativeResourceNames,
  type NativeProvisionGrant } from "./cloudflareNativeProvisionContract";
import { provisionCloudflareNative, type NativeProvisionCheckpoint } from "./cloudflareNativeProvisionTransport";

const plan = { namespace: nativeProvisionNamespace("tenant-1", "project-1"), vectorDimensions: 768 as const,
  vectorMetric: "cosine" as const, configurationExpiresAt: "2026-10-27T00:00:00Z" };
const grant: NativeProvisionGrant = { schemaVersion: "cloudflare.staging-native-provision-grant.v1",
  grantRef: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-1", projectId: "project-1", requesterUserId: 1,
  executorId: "cf-staging-executor:test", jobId: "22222222-2222-4222-8222-222222222222", accountRef: "a".repeat(32),
  targetId: "smartspec-cloudflare-staging", environment: "staging", actions: ["provision"], plan,
  planDigest: nativeProvisionPlanDigest(plan), expiresAt: "2026-10-20T12:00:00Z", revokedAt: null };

function fixture() {
  const names = nativeResourceNames(plan), queueId = "b".repeat(32);
  let queue: any = null, bucket: any = null, vector: any = null;
  const indexes: any[] = [], checkpoints: NativeProvisionCheckpoint[] = [];
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const path = new URL(url).pathname.split(`/accounts/${grant.accountRef}`)[1];
    const body = init.method === "POST" ? JSON.parse(init.body) : undefined;
    let result: any;
    if (path === "/queues") result = body ? (queue = { queue_name: body.queue_name, queue_id: queueId, consumers_total_count: 0 }) : queue ? [queue] : [];
    else if (path === "/r2/buckets" && body) result = bucket = { name: body.name };
    else if (path === `/r2/buckets/${names.bucket}`) result = bucket;
    else if (path === "/vectorize/v2/indexes" && body) result = vector = { name: body.name, config: body.config };
    else if (path.endsWith("/metadata_index/list")) result = { metadataIndexes: [...indexes] };
    else if (path.endsWith("/metadata_index/create")) { indexes.push(body); result = { mutationId: "33333333-3333-4333-8333-333333333333" }; }
    else if (path === `/vectorize/v2/indexes/${names.vector}`) result = vector;
    else throw new Error("Unexpected provider operation");
    return Response.json({ success: result !== null, result }, { status: result === null ? 404 : 200 });
  });
  const input = { grant, token: "private-test-fixture-token", checkpoint: { planDigest: grant.planDigest, metadata: [] } as NativeProvisionCheckpoint,
    fetchImpl: fetchImpl as typeof fetch, assertAuthorized: vi.fn(async () => {}), waitForMetadata: vi.fn(async () => {}),
    saveCheckpoint: vi.fn(async (value: NativeProvisionCheckpoint) => { checkpoints.push(structuredClone(value)); }) };
  return { input, fetchMock: fetchImpl, checkpoints, indexes, setQueue: (value: any) => { queue = value; } };
}

describe("bounded native staging provisioning", () => {
  it("creates only a project-bound queue, private bucket, vector index and metadata fields; verifies provider readback", async () => {
    const f = fixture();
    const out = await provisionCloudflareNative(f.input);
    expect(out).toMatchObject({ providerConfigurationVerified: true, activation: "disabled", jobHandlerQualified: false });
    expect(f.fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(5);
    expect(f.checkpoints.at(-1)?.metadata).toEqual(["tenantId", "sourceJobId"]);
    expect(f.input.assertAuthorized).toHaveBeenCalledTimes(f.fetchMock.mock.calls.length + 1);
    for (const [url, init] of f.fetchMock.mock.calls) {
      expect(String(url)).toMatch(new RegExp(`^https://api.cloudflare.com/client/v4/accounts/${grant.accountRef}/(?:queues|r2/buckets|vectorize/v2/indexes)`));
      expect(init.method).toMatch(/^(GET|POST)$/);
      expect(String(url)).not.toMatch(/consumers|tokens|dns|hyperdrive/);
    }
    expect(JSON.stringify(out)).not.toContain(f.input.token);
  });

  it("retries a fully persisted successful run using reads only", async () => {
    const f = fixture(); await provisionCloudflareNative(f.input);
    f.input.checkpoint = f.checkpoints.at(-1)!; f.fetchMock.mockClear();
    await expect(provisionCloudflareNative(f.input)).resolves.toMatchObject({ providerConfigurationVerified: true });
    expect(f.fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("refuses read-only recovery from an incomplete checkpoint before any provider call", async () => {
    const f = fixture();
    await expect(provisionCloudflareNative({ ...f.input, readOnly: true })).rejects.toThrow("NATIVE_READ_ONLY_CHECKPOINT_INCOMPLETE");
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it("does not adopt or overwrite an existing same-name queue", async () => {
    const f = fixture(); f.setQueue({ queue_name: nativeResourceNames(plan).queue });
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_UNOWNED_RESOURCE_COLLISION");
    expect(f.fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("waits for asynchronous metadata visibility and accepts the provider's capitalized String type", async () => {
    const f = fixture(), original = f.fetchMock.getMockImplementation()!;
    let reads = 0;
    f.fetchMock.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (String(url).endsWith("/metadata_index/list")) {
        reads++;
        return Response.json({ success: true, result: { metadataIndexes: reads < 5 ? [] : f.indexes.map(item => ({ ...item, indexType: "String" })) } });
      }
      return response;
    });
    await expect(provisionCloudflareNative(f.input)).resolves.toMatchObject({ providerConfigurationVerified: true });
    expect(f.input.waitForMetadata).toHaveBeenCalledTimes(2);
    expect(f.fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(5);
    expect(Object.keys(f.checkpoints.at(-1)!.metadataMutations!)).toEqual(["tenantId", "sourceJobId"]);
  });

  it("bounds propagation polling without repeating accepted mutations", async () => {
    const f = fixture(); await provisionCloudflareNative(f.input);
    f.input.checkpoint = f.checkpoints.at(-1)!;
    const original = f.fetchMock.getMockImplementation()!; f.fetchMock.mockClear();
    f.fetchMock.mockImplementation((url, init) => String(url).endsWith("/metadata_index/list")
      ? Promise.resolve(Response.json({ success: true, result: { metadataIndexes: [] } })) : original(url, init));
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_METADATA_PROPAGATION_PENDING");
    expect(f.input.waitForMetadata).toHaveBeenCalledTimes(18);
    expect(f.fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("preserves uncertain metadata intent rather than repeating a possibly accepted mutation", async () => {
    const f = fixture(), original = f.fetchMock.getMockImplementation()!;
    f.fetchMock.mockImplementation((url, init) => String(url).endsWith("/metadata_index/create")
      ? Promise.reject(new Error("response lost")) : original(url, init));
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVIDER_RESPONSE_UNCERTAIN");
    f.input.checkpoint = f.checkpoints.at(-1)!; f.fetchMock.mockClear();
    expect(f.input.checkpoint.pending).toBe("metadata:tenantId");
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVISION_UNCERTAIN_RECONCILIATION_REQUIRED");
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it("stops all provider calls when authorization is revoked", async () => {
    const f = fixture(); f.input.assertAuthorized.mockRejectedValue(new Error("authority revoked"));
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("authority revoked");
    expect(f.input.fetchImpl).not.toHaveBeenCalled();
  });

  it("persists uncertain create intent and never blindly repeats the write", async () => {
    const f = fixture(), original = f.fetchMock.getMockImplementation()!;
    f.fetchMock.mockImplementation(async (url, init) => {
      if (init.method === "POST") throw new Error(`lost response ${f.input.token}`);
      return original(url, init);
    });
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVIDER_RESPONSE_UNCERTAIN");
    f.input.checkpoint = f.checkpoints.at(-1)!; f.fetchMock.mockClear();
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVISION_UNCERTAIN_RECONCILIATION_REQUIRED");
    expect(f.input.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses populated queues even when created by the same run", async () => {
    const f = fixture(); await provisionCloudflareNative(f.input);
    f.input.checkpoint = f.checkpoints.at(-1)!;
    f.setQueue({ queue_name: nativeResourceNames(plan).queue, queue_id: "b".repeat(32), consumers_total_count: 1 });
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVIDER_READBACK_MISMATCH");
  });

  it("adds only bounded Workflow metadata to a proven native set and recovers with reads only", async () => {
    const f = fixture(); await provisionCloudflareNative(f.input);
    const workflowPlan = { ...plan, workflow: true as const, reuseProvisionJobId: grant.jobId };
    f.input.grant = { ...grant, jobId: "44444444-4444-4444-8444-444444444444", plan: workflowPlan, planDigest: nativeProvisionPlanDigest(workflowPlan) };
    f.input.checkpoint = { ...f.checkpoints.at(-1)!, planDigest: f.input.grant.planDigest };
    const original = f.fetchMock.getMockImplementation()!; let workflow: any = null;
    f.fetchMock.mockClear();
    f.fetchMock.mockImplementation(async (url, init) => {
      if (!String(url).includes("/workflows/")) return original(url, init);
      if (init.method === "PUT") {
        expect(JSON.parse(init.body)).toEqual({ script_name: "smartspec-cloudflare-staging", class_name: "CanonicalJobWorkflow", concurrency: { limit: 1 },
          limits: { steps: 1 }, schedules: [], default_retention: { success_retention: "1 day", error_retention: "1 day" } });
        workflow = { name: nativeResourceNames(plan).workflow, id: "77777777-7777-4777-8777-777777777777", script_name: "smartspec-cloudflare-staging", class_name: "CanonicalJobWorkflow", is_deleted: 0 };
      }
      return Response.json({ success: Boolean(workflow), result: workflow }, { status: workflow ? 200 : 404 });
    });
    await expect(provisionCloudflareNative(f.input)).resolves.toMatchObject({ workflow: { name: nativeResourceNames(plan).workflow }, activation: "disabled", jobHandlerQualified: false });
    expect(f.fetchMock.mock.calls.filter(([, init]) => init.method !== "GET")).toHaveLength(1);
    f.input.checkpoint = f.checkpoints.at(-1)!; f.fetchMock.mockClear();
    await provisionCloudflareNative({ ...f.input, readOnly: true });
    expect(f.fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    workflow.class_name = "ForeignClass";
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_WORKFLOW_READBACK_MISMATCH");
  });

  it("rejects half-specified Workflow extension authority", () => {
    for (const extra of [{ workflow: true }, { reuseProvisionJobId: grant.jobId }, { workflow: false, reuseProvisionJobId: grant.jobId }]) {
      const changed = { ...plan, ...extra };
      expect(nativeProvisionGrantSchema.safeParse({ ...grant, plan: changed, planDigest: nativeProvisionPlanDigest(changed as never) }).success).toBe(false);
    }
  });

  it.each(["collision", "lost-response"])("fences Workflow %s instead of overwriting or blindly replaying metadata", async scenario => {
    const f = fixture(); await provisionCloudflareNative(f.input);
    const workflowPlan = { ...plan, workflow: true as const, reuseProvisionJobId: grant.jobId };
    f.input.grant = { ...grant, jobId: "44444444-4444-4444-8444-444444444444", plan: workflowPlan, planDigest: nativeProvisionPlanDigest(workflowPlan) };
    f.input.checkpoint = { ...f.checkpoints.at(-1)!, planDigest: f.input.grant.planDigest };
    const original = f.fetchMock.getMockImplementation()!;
    f.fetchMock.mockClear();
    f.fetchMock.mockImplementation(async (url, init) => {
      if (!String(url).includes("/workflows/")) return original(url, init);
      if (scenario === "collision") return Response.json({ success: true, result: { name: nativeResourceNames(plan).workflow } });
      if (init.method === "PUT") throw Error("response lost after possible write");
      return Response.json({ success: false }, { status: 404 });
    });
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow(scenario === "collision" ? "NATIVE_UNOWNED_WORKFLOW_COLLISION" : "NATIVE_PROVIDER_RESPONSE_UNCERTAIN");
    if (scenario === "collision") expect(f.fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    else {
      f.input.checkpoint = f.checkpoints.at(-1)!;
      expect(f.input.checkpoint.pending).toBe("workflow"); f.fetchMock.mockClear();
      await expect(provisionCloudflareNative(f.input)).rejects.toThrow("NATIVE_PROVISION_UNCERTAIN_RECONCILIATION_REQUIRED");
      expect(f.fetchMock).not.toHaveBeenCalled();
    }
  });

  it.each([{ environment: "production" }, { tenantId: "foreign-tenant" }, { actions: ["deploy"] },
    { plan: { ...plan, vectorDimensions: 1536 } }, { planDigest: "f".repeat(64) }])("rejects changed grant scope: %j", async extra => {
    const f = fixture(); f.input.grant = { ...grant, ...extra } as NativeProvisionGrant;
    expect(nativeProvisionGrantSchema.safeParse(f.input.grant).success).toBe(false);
    await expect(provisionCloudflareNative(f.input)).rejects.toThrow();
    expect(f.input.fetchImpl).not.toHaveBeenCalled();
  });
});
