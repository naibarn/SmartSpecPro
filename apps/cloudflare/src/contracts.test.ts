import { describe, expect, it, vi } from "vitest";

import { inspectBindingReadiness } from "./bindings";
import { putVerifiedArtifact, validateArtifactManifest, validateVectorRecord } from "./artifacts";
import { CANONICAL_TRANSACTION_POLICY, canonicalReadOptions, createHyperdriveClient, runCanonicalWriteThenExternal } from "./hyperdrive";
import { deleteCanonicalVectors, dispatchCanonicalWorkerApp, publishCanonicalQueueMessage, upsertCanonicalVectors } from "./nativeAdapters";
import { LocalRecoveryHarness } from "./recoveryHarness";
import { CloudflareQueueConsumer, parseCanonicalEnvelope, processCanonicalQueueMessage } from "./queueConsumer";
import { createCloudflareWorker } from "./index";
import { createCanonicalControlPlaneHandler } from "./controlPlaneHandler";

const envelope = {
  job_id: "job-1",
  business_attempt: 1,
  attempt_id: "attempt-1",
  contract_version: "feature-186-v1",
  dispatch_id: "dispatch-1",
  dedupe_key: "job-1:1",
  routing_metadata: { queue: "canonical" },
};

function message(body: unknown) {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

describe("Cloudflare local runtime contracts", () => {
  it("executes the injected canonical handler with authoritative job and lease fencing", async () => {
    const repository = {
      loadJob: vi.fn().mockResolvedValue({ jobId: "job-1", tenantId: "tenant-1", contractVersion: "feature-186-v1", businessAttempt: 1, status: "queued", operatorReviewRequired: false }),
      recordDispatch: vi.fn().mockResolvedValue("recorded" as const),
      claim: vi.fn().mockResolvedValue({ attemptId: "attempt-1", leaseToken: "opaque", fencingVersion: 2 }),
      complete: vi.fn().mockResolvedValue("completed" as const),
      retry: vi.fn(),
    };
    const execute = vi.fn().mockResolvedValue("completed" as const);
    const handler = createCanonicalControlPlaneHandler({ repository, execute });
    await expect(handler(envelope, {})).resolves.toBe("completed");
    expect(repository.loadJob).toHaveBeenCalledWith({ jobId: "job-1", cache: "no-store" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ claim: expect.objectContaining({ fencingVersion: 2 }) }));
    expect(repository.complete).toHaveBeenCalledOnce();
  });

  it("treats terminal canonical state as a late-delivery no-op", async () => {
    const repository = {
      loadJob: vi.fn().mockResolvedValue({ jobId: "job-1", tenantId: "tenant-1", contractVersion: "feature-186-v1", businessAttempt: 1, status: "cancelled", operatorReviewRequired: false }),
      recordDispatch: vi.fn(),
      claim: vi.fn(),
      complete: vi.fn(),
      retry: vi.fn(),
    };
    const handler = createCanonicalControlPlaneHandler({ repository, execute: vi.fn() });
    await expect(handler(envelope, {})).resolves.toBe("completed");
    expect(repository.claim).not.toHaveBeenCalled();
  });
  it("fails closed until all account bindings are injected and activation is enabled", () => {
    const disabled = inspectBindingReadiness({ CLOUDFLARE_ACTIVATION: "disabled" });
    expect(disabled.ready).toBe(false);
    expect(disabled.missing).toHaveLength(7);
    const enabled = inspectBindingReadiness({ CLOUDFLARE_ACTIVATION: "enabled", HYPERDRIVE: { connectionString: "postgres://target-placeholder" }, JOB_QUEUE: { send: vi.fn() }, JOB_WORKFLOW: { get: vi.fn(), create: vi.fn() }, JOB_CONTAINERS: { start: vi.fn() }, WORKER_APP: { dispatch: vi.fn() }, MEDIA_BUCKET: { put: vi.fn(), head: vi.fn(), delete: vi.fn() }, VECTOR_INDEX: { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } });
    expect(enabled.ready).toBe(true);
  });

  it("parses only bounded canonical envelopes", () => {
    expect(parseCanonicalEnvelope(envelope)).toEqual(envelope);
    expect(() => parseCanonicalEnvelope({ ...envelope, routing_metadata: { signedUrl: "https://bad.invalid" } })).toThrow("CANONICAL_ENVELOPE_INVALID");
    expect(() => parseCanonicalEnvelope({ ...envelope, routing_metadata: { requiredCapabilities: { token: "secret" } } })).toThrow("CANONICAL_ENVELOPE_INVALID");
    expect(() => parseCanonicalEnvelope({ ...envelope, routing_metadata: { requiredCapabilities: { nested: { deeper: { tooDeep: { value: { oneMore: true } } } } } } })).toThrow("CANONICAL_ENVELOPE_INVALID");
    expect(() => parseCanonicalEnvelope({ ...envelope, business_attempt: 0 })).toThrow("CANONICAL_ENVELOPE_INVALID");
    expect(() => parseCanonicalEnvelope({ ...envelope, routing_metadata: "mutable status" })).toThrow("CANONICAL_ENVELOPE_INVALID");
  });

  it("acks only after the canonical handler succeeds and retries on database/control-plane loss", async () => {
    const successful = message(envelope);
    const handler = vi.fn().mockResolvedValue("completed" as const);
    const quarantine = vi.fn().mockResolvedValue(false);
    expect(await processCanonicalQueueMessage(successful, {}, handler, quarantine)).toBe("ack");
    expect(successful.ack).not.toHaveBeenCalled();

    const failed = message(envelope);
    const failing = vi.fn().mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    expect(await processCanonicalQueueMessage(failed, {}, failing, quarantine)).toBe("retry");
    expect(quarantine).not.toHaveBeenCalled();

    const poison = message({ ...envelope, contract_version: "unsupported" });
    const poisonHandler = vi.fn().mockRejectedValue(new Error("CANONICAL_ENVELOPE_INVALID"));
    await processCanonicalQueueMessage(poison, {}, poisonHandler, quarantine);
    expect(quarantine).toHaveBeenCalledWith({ envelope: { ...envelope, contract_version: "unsupported" }, reason: "UNSUPPORTED_CONTRACT_VERSION" }, {});
  });

  it("allows duplicate delivery while requiring the canonical handler to deduplicate side effects", async () => {
    const sideEffectKeys = new Set<string>();
    let sideEffectCount = 0;
    const handler = vi.fn(async (incoming: typeof envelope) => {
      if (!sideEffectKeys.has(incoming.dedupe_key)) {
        sideEffectKeys.add(incoming.dedupe_key);
        sideEffectCount += 1;
      }
      return "completed" as const;
    });
    const quarantine = vi.fn().mockResolvedValue(false);
    expect(await processCanonicalQueueMessage(message(envelope), {}, handler, quarantine)).toBe("ack");
    expect(await processCanonicalQueueMessage(message(envelope), {}, handler, quarantine)).toBe("ack");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sideEffectCount).toBe(1);
    expect(sideEffectKeys).toEqual(new Set([envelope.dedupe_key]));
  });

  it("quarantines poison messages only when durable quarantine succeeds", async () => {
    const poison = message({ ...envelope, contract_version: "unsupported" });
    const quarantine = vi.fn().mockResolvedValue(true);
    expect(await processCanonicalQueueMessage(poison, {}, vi.fn(), quarantine)).toBe("ack");
    expect(quarantine).toHaveBeenCalledWith({ envelope: { ...envelope, contract_version: "unsupported" }, reason: "UNSUPPORTED_CONTRACT_VERSION" }, {});
  });

  it("does not ack a disabled or incompletely bound batch", async () => {
    const disabledMessage = message(envelope);
    await new CloudflareQueueConsumer(vi.fn()).handleBatch({ messages: [disabledMessage] }, { CLOUDFLARE_ACTIVATION: "disabled" });
    expect(disabledMessage.ack).not.toHaveBeenCalled();
    expect(disabledMessage.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("exposes liveness separately from readiness without leaking binding values", async () => {
    const worker = createCloudflareWorker();
    const response = await worker.fetch(new Request("https://runtime.invalid/readyz"), {
      CLOUDFLARE_ACTIVATION: "disabled",
      HYPERDRIVE: { connectionString: "do-not-return-this" },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("do-not-return-this");
  });

  it("does not claim readiness when the canonical job handler is not wired", async () => {
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
      JOB_WORKFLOW: { get: vi.fn(), create: vi.fn() },
      JOB_CONTAINERS: { start: vi.fn() },
      WORKER_APP: { dispatch: vi.fn() },
      MEDIA_BUCKET: { put: vi.fn(), head: vi.fn(), delete: vi.fn() },
      VECTOR_INDEX: { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() },
    };
    const response = await createCloudflareWorker().fetch(new Request("https://runtime.invalid/readyz"), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, readiness: { jobHandlerConfigured: false } });
  });

  it("accepts only authenticated canonical publishes at the Queue boundary", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const worker = createCloudflareWorker();
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      CLOUDFLARE_RUNTIME_TOKEN: "runtime-token",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send },
    };
    const payload = JSON.stringify(envelope);

    const unauthorized = await worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
    }), env);
    expect(unauthorized.status).toBe(401);
    expect(send).not.toHaveBeenCalled();

    const accepted = await worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST",
      body: payload,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer runtime-token",
      },
    }), env);
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toEqual({ accepted: true, dispatchId: envelope.dedupe_key });
    expect(send).toHaveBeenCalledWith(envelope);
  });

  it("deduplicates publication through the injected durable-registry contract and rejects oversized bodies", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const seen = new Set<string>();
    const registry = {
      has: vi.fn(async (key: string) => seen.has(key)),
      record: vi.fn(async (key: string) => { seen.add(key); }),
    };
    const worker = createCloudflareWorker(undefined, undefined, undefined, undefined, undefined, registry);
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      CLOUDFLARE_RUNTIME_TOKEN: "runtime-token",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send },
    };
    const request = () => new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST",
      body: JSON.stringify(envelope),
      headers: { "content-type": "application/json", authorization: "Bearer runtime-token" },
    });
    expect((await worker.fetch(request(), env)).status).toBe(202);
    expect((await worker.fetch(request(), env)).status).toBe(200);
    expect(send).toHaveBeenCalledOnce();

    const oversized = await worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST",
      body: JSON.stringify({ ...envelope, routing_metadata: { queue: "x".repeat(20_000) } }),
      headers: { "content-type": "application/json", authorization: "Bearer runtime-token" },
    }), env);
    expect(oversized.status).toBe(413);
  });

  it("returns a bounded client error for malformed canonical publish payloads", async () => {
    const worker = createCloudflareWorker();
    const response = await worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST",
      body: JSON.stringify({ ...envelope, job_id: "" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer runtime-token",
      },
    }), {
      CLOUDFLARE_ACTIVATION: "enabled",
      CLOUDFLARE_RUNTIME_TOKEN: "runtime-token",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "CANONICAL_ENVELOPE_INVALID" });
  });

  it("runs provider polling only as a bounded durable sweep after activation", async () => {
    const sweep = vi.fn().mockResolvedValue("completed" as const);
    const worker = createCloudflareWorker(undefined, undefined, sweep);
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
      JOB_WORKFLOW: { get: vi.fn(), create: vi.fn() },
      JOB_CONTAINERS: { start: vi.fn() },
      WORKER_APP: { dispatch: vi.fn() },
      MEDIA_BUCKET: { put: vi.fn(), head: vi.fn(), delete: vi.fn() },
      VECTOR_INDEX: { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() },
    };
    await worker.scheduled({ scheduledTime: 123 }, env);
    expect(sweep).toHaveBeenCalledWith({ scheduledTime: 123, maxRows: 100 }, env);
  });

  it("allows a queue-only capability slice without requiring artifact/search bindings", async () => {
    const queued = message(envelope);
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
    };
    await new CloudflareQueueConsumer(vi.fn().mockResolvedValue("completed" as const)).handleBatch({ messages: [queued] }, env);
    expect(queued.ack).toHaveBeenCalledOnce();
    expect(queued.retry).not.toHaveBeenCalled();
  });

  it("uses fresh canonical reads and bounded transactions before external work", async () => {
    const transaction = { unsafe: vi.fn().mockResolvedValue([{ id: "job-1" }]), begin: vi.fn() };
    const client = { unsafe: vi.fn(), begin: vi.fn(async (callback: any) => callback(transaction)) };
    const factory = vi.fn().mockReturnValue(client);
    const created = createHyperdriveClient({ connectionString: "postgres://injected-only" }, factory);
    expect(created).toBe(client);
    expect(factory).toHaveBeenCalledWith("postgres://injected-only", { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 20 });
    expect(canonicalReadOptions()).toEqual({ cache: "no-store", consistency: "strong" });
    expect(CANONICAL_TRANSACTION_POLICY).toMatchObject({ isolation: "read committed", maxRetries: 3, externalCallsAllowedInsideTransaction: false });
    const external = vi.fn();
    await runCanonicalWriteThenExternal(client, async tx => tx.unsafe("update worker_jobs set status = $1", ["queued"]), external);
    expect(external).toHaveBeenCalledOnce();
    expect(client.begin).toHaveBeenCalledOnce();
  });

  it("retries only serializable/deadlock database failures and performs external work once", async () => {
    let transactions = 0;
    const client = {
      unsafe: vi.fn(),
      begin: vi.fn(async (callback: any) => {
        transactions += 1;
        if (transactions === 1) throw Object.assign(new Error("serialization_failure"), { code: "40001" });
        return callback({ unsafe: vi.fn().mockResolvedValue("committed"), begin: vi.fn() });
      }),
    };
    const write = vi.fn(async (tx: any) => tx.unsafe("insert event with idempotency key", ["event:1"]));
    const external = vi.fn();
    await runCanonicalWriteThenExternal(client, write, external);
    expect(transactions).toBe(2);
    expect(write).toHaveBeenCalledTimes(1);
    expect(external).toHaveBeenCalledOnce();
  });

  it("protects immutable artifacts and tenant-scoped rebuildable vectors", () => {
    expect(validateArtifactManifest({ tenantId: "tenant-1", jobId: "job-1", objectKey: "prod/tenant-1/job-1/result.mp4", sizeBytes: 10, checksumSha256: "a".repeat(64), contentType: "video/mp4", immutable: true }).objectKey).toContain("prod/");
    expect(() => validateArtifactManifest({ tenantId: "tenant-1", jobId: "job-1", objectKey: "https://signed.invalid", sizeBytes: 10, checksumSha256: "a".repeat(64), contentType: "video/mp4", immutable: true })).toThrow("ARTIFACT_OBJECT_KEY_UNSAFE");
    expect(() => validateArtifactManifest({ tenantId: "tenant-1", jobId: "job-1", objectKey: "prod/tenant-2/job-1/result.mp4", sizeBytes: 10, checksumSha256: "a".repeat(64), contentType: "video/mp4", immutable: true })).toThrow("ARTIFACT_OBJECT_KEY_SCOPE_INVALID");
    expect(() => validateArtifactManifest({ tenantId: "tenant/escape", jobId: "job-1", objectKey: "prod/tenant/escape/job-1/result.mp4", sizeBytes: 10, checksumSha256: "a".repeat(64), contentType: "video/mp4", immutable: true })).toThrow("ARTIFACT_TENANT_ID_INVALID");
    expect(validateVectorRecord({ id: "v-1", values: Array.from({ length: 768 }, () => 0.1), metadata: { tenantId: "tenant-1", sourceJobId: "job-1", sourceRevision: "r1" } }).metadata.tenantId).toBe("tenant-1");
    expect(() => validateVectorRecord({ id: "v-1", values: [Number.NaN], metadata: { tenantId: "tenant-1", sourceJobId: "job-1", sourceRevision: "r1" } })).toThrow("VECTOR_VALUES_INVALID");

    const head = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ customMetadata: { checksumSha256: "a".repeat(64) } })
      .mockResolvedValueOnce({ customMetadata: { checksumSha256: "a".repeat(64) } });
    const put = vi.fn().mockResolvedValue(undefined);
    const manifest = { tenantId: "tenant-1", jobId: "job-1", objectKey: "prod/tenant-1/job-1/result.mp4", sizeBytes: 10, checksumSha256: "a".repeat(64), contentType: "video/mp4", immutable: true as const };
    const bucket = { put, head, delete: vi.fn() };
    return putVerifiedArtifact(bucket, manifest, "bytes").then(async () => {
      await putVerifiedArtifact(bucket, manifest, "duplicate-by-key");
      expect(put).toHaveBeenCalledOnce();
      await expect(putVerifiedArtifact(bucket, { ...manifest, checksumSha256: "b".repeat(64) }, "changed")).rejects.toThrow("ARTIFACT_IMMUTABLE_CONFLICT");
      await expect(putVerifiedArtifact({ put, head: vi.fn().mockResolvedValue({ etag: "provider-etag-without-checksum" }), delete: vi.fn() }, manifest, "unknown-existing-bytes")).rejects.toThrow("ARTIFACT_IMMUTABLE_EVIDENCE_MISSING");
    });
  });

  it("keeps native binding calls behind activation and the canonical envelope", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const dispatch = vi.fn().mockResolvedValue({ referenceId: "worker-ref-1" });
    const upsert = vi.fn().mockResolvedValue(undefined);
    const env = {
      CLOUDFLARE_ACTIVATION: "enabled",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send },
      JOB_WORKFLOW: { get: vi.fn(), create: vi.fn() },
      JOB_CONTAINERS: { start: vi.fn() },
      WORKER_APP: { dispatch },
      MEDIA_BUCKET: { put: vi.fn(), head: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      VECTOR_INDEX: { upsert, query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() },
    };
    await publishCanonicalQueueMessage(env, envelope);
    expect(await dispatchCanonicalWorkerApp(env, envelope)).toEqual({ referenceId: "worker-ref-1" });
    await upsertCanonicalVectors(env, "tenant-1", [{ id: "v-1", values: Array.from({ length: 768 }, () => 0.1), metadata: { tenantId: "tenant-1", sourceJobId: "job-1", sourceRevision: "r1" } }]);
    await expect(upsertCanonicalVectors(env, "tenant-2", [{ id: "v-1", values: Array.from({ length: 768 }, () => 0.1), metadata: { tenantId: "tenant-1", sourceJobId: "job-1", sourceRevision: "r1" } }])).rejects.toThrow("VECTOR_TENANT_SCOPE_INVALID");
    const getByIds = vi.fn().mockResolvedValue([{ id: "v-1", metadata: { tenantId: "tenant-1" } }]);
    const deleteByIds = vi.fn().mockResolvedValue(undefined);
    const deleteEnv = { ...env, VECTOR_INDEX: { upsert, query: vi.fn(), getByIds, deleteByIds } };
    await deleteCanonicalVectors(deleteEnv, "tenant-1", ["v-1"]);
    expect(deleteByIds).toHaveBeenCalledWith(["v-1"]);
    getByIds.mockResolvedValue([{ id: "v-1", metadata: { tenantId: "tenant-2" } }]);
    await expect(deleteCanonicalVectors(deleteEnv, "tenant-1", ["v-1"])).rejects.toThrow("VECTOR_TENANT_SCOPE_INVALID");
    expect(send).toHaveBeenCalledWith(envelope);
    expect(dispatch).toHaveBeenCalledWith({ envelope });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("replays outbox and callback/settlement evidence idempotently after restore", async () => {
    const harness = new LocalRecoveryHarness();
    harness.create("job-1", envelope);
    expect(harness.appendEvent("job-1", "queued:1", "QUEUED")).toBe(true);
    expect(harness.appendEvent("job-1", "queued:1", "QUEUED")).toBe(false);
    expect(harness.acceptCallback("provider", "event-1")).toBe(true);
    expect(harness.acceptCallback("provider", "event-1")).toBe(false);
    expect(harness.recordSettlement("billing:job-1")).toBe(true);
    expect(harness.recordSettlement("billing:job-1")).toBe(false);
    expect(harness.recordCheckpoint("projection:job-1", 1, "digest-1")).toBe(true);
    expect(harness.recordCheckpoint("projection:job-1", 1, "digest-1")).toBe(false);

    const publishedDedupeKeys = new Set<string>();
    const publish = vi.fn(async (item: typeof envelope) => { publishedDedupeKeys.add(item.dedupe_key); });
    await harness.replayOutbox(publish);
    const restored = LocalRecoveryHarness.restore(harness.snapshot());
    await restored.replayOutbox(publish);
    expect(publish).toHaveBeenCalledOnce();
    expect(publishedDedupeKeys).toEqual(new Set([envelope.dedupe_key]));
    expect(() => restored.recordCheckpoint("projection:job-1", 2, "changed")).toThrow("CHECKPOINT_CONFLICT");
  });
});
