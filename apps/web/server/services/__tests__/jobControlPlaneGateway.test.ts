import { describe, expect, it, vi } from "vitest";

import { createControlPlaneJob } from "../jobControlPlaneGateway";
import { createJobExecutorRegistry } from "../jobExecutorRegistry";

describe("ControlPlaneJobGateway", () => {
  const executor = vi.fn();
  const registry = createJobExecutorRegistry([{
    jobType: "maintenance.cleanup",
    executionClass: "short",
    contractVersions: new Set(["feature-186-v1"]),
    executor,
  }]);

  it("derives tenant and actor from authenticated server context", async () => {
    const create = vi.fn().mockResolvedValue({ jobId: "job-1", created: true });
    await createControlPlaneJob({
      executorRegistry: registry,
      controlPlane: { create } as any,
      context: {
        tenantId: "tenant-server",
        actorType: "user",
        actorId: 42,
        authorizationScope: "tenant:write",
        correlationId: "corr-1",
        idempotencyKey: " request-1 ",
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "maintenance.cleanup",
        executionClass: "short",
        input: { tenantId: "attacker-value", idempotencyKey: "payload-data-is-not-command-identity" },
        retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
      },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-server",
      requestedByUserId: 42,
      idempotencyKey: " request-1 ",
    }), expect.anything());
  });

  it("rejects an unregistered handler before creating a job", async () => {
    const create = vi.fn();
    await expect(createControlPlaneJob({
      executorRegistry: registry,
      controlPlane: { create } as any,
      context: { tenantId: "t", actorType: "system", authorizationScope: "system", correlationId: "c" },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "unknown.job",
        executionClass: "short",
        input: {},
        retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
      },
    })).rejects.toMatchObject({ code: "JOB_EXECUTOR_UNREGISTERED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an incomplete authenticated user context before creating a job", async () => {
    const create = vi.fn();
    await expect(createControlPlaneJob({
      executorRegistry: registry,
      controlPlane: { create } as any,
      context: { tenantId: "t", actorType: "user", authorizationScope: "tenant:write", correlationId: "c" },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "maintenance.cleanup",
        executionClass: "short",
        input: {},
        retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
      },
    })).rejects.toMatchObject({ code: "JOB_CONTEXT_INVALID" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects new jobs before persistence when hard-cutover runtime is unavailable", async () => {
    const previous = {
      hardCutover: process.env.FEATURE_186_HARD_CUTOVER,
      runtimeUrl: process.env.CLOUDFLARE_RUNTIME_URL,
      runtimeToken: process.env.CLOUDFLARE_RUNTIME_TOKEN,
      harness: process.env.FEATURE_186_POSTGRES_PULL_HARNESS,
      nodeEnv: process.env.NODE_ENV,
    };
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    delete process.env.CLOUDFLARE_RUNTIME_URL;
    delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
    delete process.env.FEATURE_186_POSTGRES_PULL_HARNESS;
    process.env.NODE_ENV = "production";
    const create = vi.fn();
    try {
      await expect(createControlPlaneJob({
        executorRegistry: registry,
        controlPlane: { create } as any,
        context: { tenantId: "t", actorType: "system", authorizationScope: "system", correlationId: "c" },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "maintenance.cleanup",
          executionClass: "short",
          input: {},
          retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
          timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
        },
      })).rejects.toMatchObject({ code: "JOB_RUNTIME_NOT_READY" });
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (previous.hardCutover === undefined) delete process.env.FEATURE_186_HARD_CUTOVER;
      else process.env.FEATURE_186_HARD_CUTOVER = previous.hardCutover;
      if (previous.runtimeUrl === undefined) delete process.env.CLOUDFLARE_RUNTIME_URL;
      else process.env.CLOUDFLARE_RUNTIME_URL = previous.runtimeUrl;
      if (previous.runtimeToken === undefined) delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
      else process.env.CLOUDFLARE_RUNTIME_TOKEN = previous.runtimeToken;
      if (previous.harness === undefined) delete process.env.FEATURE_186_POSTGRES_PULL_HARNESS;
      else process.env.FEATURE_186_POSTGRES_PULL_HARNESS = previous.harness;
      if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.nodeEnv;
    }
  });

  it("fails closed when a retired Google runtime flag is still enabled", async () => {
    const previous = {
      hardCutover: process.env.FEATURE_186_HARD_CUTOVER,
      runtimeUrl: process.env.CLOUDFLARE_RUNTIME_URL,
      runtimeToken: process.env.CLOUDFLARE_RUNTIME_TOKEN,
      legacyUrl: process.env.CLOUD_RUN_NODE_URL,
    };
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    process.env.CLOUDFLARE_RUNTIME_URL = "https://runtime.example";
    process.env.CLOUDFLARE_RUNTIME_TOKEN = "runtime-token";
    process.env.CLOUD_RUN_NODE_URL = "https://legacy.invalid";
    const create = vi.fn();
    try {
      await expect(createControlPlaneJob({
        executorRegistry: registry,
        controlPlane: { create } as any,
        context: { tenantId: "t", actorType: "system", authorizationScope: "system", correlationId: "c" },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "maintenance.cleanup",
          executionClass: "short",
          input: {},
          retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: "none", deadlineMs: 1000, allowedErrorClasses: [] },
          timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
        },
      })).rejects.toThrow("GOOGLE_CLOUD_RUNTIME_RETIRED");
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (previous.hardCutover === undefined) delete process.env.FEATURE_186_HARD_CUTOVER;
      else process.env.FEATURE_186_HARD_CUTOVER = previous.hardCutover;
      if (previous.runtimeUrl === undefined) delete process.env.CLOUDFLARE_RUNTIME_URL;
      else process.env.CLOUDFLARE_RUNTIME_URL = previous.runtimeUrl;
      if (previous.runtimeToken === undefined) delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
      else process.env.CLOUDFLARE_RUNTIME_TOKEN = previous.runtimeToken;
      if (previous.legacyUrl === undefined) delete process.env.CLOUD_RUN_NODE_URL;
      else process.env.CLOUD_RUN_NODE_URL = previous.legacyUrl;
    }
  });
});
