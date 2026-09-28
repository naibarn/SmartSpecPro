import { describe, expect, it, vi } from "vitest";

import {
  CloudflareContainersJobTransportAdapter,
  CloudflareCronSchedulerAdapter,
  CloudflareQueuesJobTransportAdapter,
  CloudflareWorkerAppJobTransportAdapter,
  CloudflareWorkflowsJobTransportAdapter,
  createCloudflareTransportAdapters,
  getCloudflareLocalContractReadiness,
} from "../cloudflareJobAdapters";

const baseRequest = {
  jobId: "canonical-cloudflare-job",
  businessAttempt: 1,
  outboxId: "outbox-cloudflare-1",
  dedupeKey: "job:canonical-cloudflare-job:attempt:1",
  contractVersion: "feature-186-v1",
  routingMetadata: {
    queue: "feature-186",
    requiredCapabilities: { ffmpeg: true },
  },
};

describe("Cloudflare job adapter contracts", () => {
  it("publishes a canonical Queues envelope and stays unknown without provider evidence", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const adapter = new CloudflareQueuesJobTransportAdapter({ send });

    const first = await adapter.publish(baseRequest);
    const second = await adapter.publish(baseRequest);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      job_id: baseRequest.jobId,
      business_attempt: 1,
      attempt_id: null,
      contract_version: baseRequest.contractVersion,
      dispatch_id: baseRequest.outboxId,
      dedupe_key: baseRequest.dedupeKey,
      routing_metadata: baseRequest.routingMetadata,
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      adapter: "cloudflare-queues",
      referenceNamespace: "cloudflare-queues",
      dispatchId: baseRequest.outboxId,
      dedupeKey: baseRequest.dedupeKey,
    });
    expect(first.queueJobId).toBeUndefined();
    expect(await adapter.inspect(first)).toBe("unknown");
  });

  it("uses injected queue inspection as an observation only", async () => {
    const inspectPublication = vi.fn().mockResolvedValue("consumed");
    const adapter = new CloudflareQueuesJobTransportAdapter({ send: vi.fn().mockResolvedValue(undefined) }, inspectPublication);
    const reference = await adapter.publish(baseRequest);

    expect(await adapter.inspect(reference)).toBe("consumed");
    expect(inspectPublication).toHaveBeenCalledWith(reference);
  });

  it("uses a deterministic workflow instance and resolves a lost create response", async () => {
    const handle = { status: "running" as const };
    const get = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(handle)
      .mockResolvedValue(handle);
    const create = vi.fn().mockRejectedValue(new Error("response_lost_after_create"));
    const adapter = new CloudflareWorkflowsJobTransportAdapter({ get, create });

    const reference = await adapter.publish(baseRequest);

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].id).toBe(reference.workflowInstanceId);
    expect(reference.workflowInstanceId).toMatch(/^cfw-[a-f0-9]{64}$/);
    expect(await adapter.inspect(reference)).toBe("published");
  });

  it("deduplicates container start through a stable instance identity", async () => {
    const find = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValue({ status: "running" });
    const start = vi.fn().mockResolvedValue({ id: "provider-container-id", status: "running" });
    const adapter = new CloudflareContainersJobTransportAdapter({ find, start });

    const first = await adapter.publish({ ...baseRequest, routingMetadata: { containerClass: "cpu" } });
    const second = await adapter.publish({ ...baseRequest, routingMetadata: { containerClass: "cpu" } });

    expect(start).toHaveBeenCalledOnce();
    expect(first.containerInstanceId).toBe(second.containerInstanceId);
    expect(first.containerInstanceId).toMatch(/^cfc-[a-f0-9]{64}$/);
    expect(await adapter.inspect(first)).toBe("published");
  });

  it("routes only supported execution classes to Containers and rejects secret metadata", async () => {
    const adapter = new CloudflareContainersJobTransportAdapter({ start: vi.fn() });

    expect(adapter.supports({ jobType: "video", executionClass: "cpu", contractVersion: "feature-186-v1" })).toBe(true);
    expect(adapter.supports({ jobType: "video", executionClass: "short", contractVersion: "feature-186-v1" })).toBe(false);
    await expect(new CloudflareQueuesJobTransportAdapter({ send: vi.fn().mockResolvedValue(undefined) }).publish({
      ...baseRequest,
      routingMetadata: { token: "must-not-cross-runtime-boundary" },
    })).rejects.toMatchObject({ code: "CLOUDFLARE_ADAPTER_INVALID_REQUEST" });
    await expect(new CloudflareQueuesJobTransportAdapter({ send: vi.fn().mockResolvedValue(undefined) }).publish({
      ...baseRequest,
      contractVersion: "unsupported-contract",
    })).rejects.toMatchObject({ code: "JOB_ADAPTER_UNSUPPORTED" });
    await expect(new CloudflareQueuesJobTransportAdapter({ send: vi.fn().mockResolvedValue(undefined) }).publish({
      ...baseRequest,
      routingMetadata: { region: "https://signed.example.invalid/object" },
    })).rejects.toMatchObject({ code: "CLOUDFLARE_ADAPTER_INVALID_REQUEST" });
  });

  it("reconciles Worker App publication by the same dedupe key", async () => {
    const findByDedupeKey = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ referenceId: "worker-app-1" });
    const dispatch = vi.fn().mockRejectedValue(new Error("worker_response_lost"));
    const adapter = new CloudflareWorkerAppJobTransportAdapter({ findByDedupeKey, dispatch });

    const reference = await adapter.publish(baseRequest);
    expect(reference.providerJobId).toBe("worker-app-1");
    expect(findByDedupeKey).toHaveBeenCalledTimes(2);
  });

  it("uses optional transport cancellation without mutating canonical state", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    const workflow = new CloudflareWorkflowsJobTransportAdapter({
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ status: "running" }),
      terminate,
    });
    const workflowReference = await workflow.publish(baseRequest);
    await workflow.cancel?.(workflowReference);

    const stop = vi.fn().mockResolvedValue(undefined);
    const container = new CloudflareContainersJobTransportAdapter({
      start: vi.fn().mockResolvedValue({ status: "running" }),
      stop,
    });
    const containerReference = await container.publish({ ...baseRequest, routingMetadata: { containerClass: "cpu" } });
    await container.cancel?.(containerReference);

    expect(terminate).toHaveBeenCalledWith(workflowReference.workflowInstanceId);
    expect(stop).toHaveBeenCalledWith(containerReference.containerInstanceId);
  });

  it("creates a timezone-validated Cron job intent without executing business logic", async () => {
    const createJob = vi.fn().mockResolvedValue({ jobId: "scheduled-job-1", created: true });
    const adapter = new CloudflareCronSchedulerAdapter(createJob, "tenant-1");

    const result = await adapter.createOccurrence({
      tenantId: "tenant-1",
      scheduleId: "cleanup",
      scheduleVersion: "v1",
      timezone: "Asia/Bangkok",
      missedOccurrencePolicy: "coalesce",
      occurrenceAt: "2026-09-14T01:00:00.000Z",
      jobType: "database.backup.maintenance",
      executionClass: "scheduled",
      input: { scope: "tenant" },
    });

    expect(result).toEqual({ jobId: "scheduled-job-1", created: true });
    expect(createJob).toHaveBeenCalledOnce();
    expect(createJob.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      jobType: "database.backup.maintenance",
      schedule: {
        scheduleId: "cleanup",
        scheduleVersion: "v1",
        timezone: "Asia/Bangkok",
        missedOccurrencePolicy: "coalesce",
      },
    });
  });

  it("rejects a Cron occurrence whose tenant is not the authenticated tenant", async () => {
    const adapter = new CloudflareCronSchedulerAdapter(vi.fn(), "tenant-owner");

    await expect(adapter.createOccurrence({
      tenantId: "tenant-attacker",
      scheduleId: "cleanup",
      scheduleVersion: "v1",
      timezone: "UTC",
      missedOccurrencePolicy: "skip",
      occurrenceAt: "2026-09-14T01:00:00.000Z",
      jobType: "cleanup",
      executionClass: "scheduled",
      input: {},
    })).rejects.toMatchObject({ code: "SCHEDULE_TENANT_MISMATCH" });
  });

  it("reports local contract readiness separately from production proof", () => {
    expect(getCloudflareLocalContractReadiness()).toEqual({
      localContractReady: true,
      productionProof: false,
      targetAccountProof: false,
      components: {
        queues: true,
        workflows: true,
        containers: true,
        cron: true,
        workerApp: true,
      },
    });
  });

  it("creates a provider registry only for injected bindings", () => {
    const adapters = createCloudflareTransportAdapters({ queues: { send: vi.fn().mockResolvedValue(undefined) } });

    expect([...adapters.keys()]).toEqual(["cloudflare-queues"]);
  });
});
