import { describe, expect, it, vi } from "vitest";

import { createControlPlaneJob } from "../jobControlPlaneGateway";
import { createJobExecutorRegistry } from "../jobExecutorRegistry";
import {
  CLOUDFLARE_STAGING_ORIGIN_CONTRACT,
  CLOUDFLARE_STAGING_ORIGIN_GRANT,
} from "../cloudflareStagingOriginContract";
import { CLOUDFLARE_STAGING_DEPLOYMENT_JOB } from "../cloudflareStagingDeploymentExecutor";

describe("ControlPlaneJobGateway", () => {
  const executor = vi.fn();
  const registry = createJobExecutorRegistry([
    {
      jobType: "maintenance.cleanup",
      executionClass: "short",
      contractVersions: new Set(["feature-186-v1"]),
      executor,
    },
  ]);
  const stagingJobId = "819fe183-5366-4abb-85d9-d834fd0e9d61";
  const stagingGrant = {
    schemaVersion: CLOUDFLARE_STAGING_ORIGIN_GRANT,
    grantRef: "8ccc0433-6c5d-5486-848e-79d5becaecde",
    tenantId: "tenant-ZCSKEM9s",
    requesterUserId: 1,
    projectId: "44fb79ed-8d65-41b0-b04e-97f4b139430b",
    executorId: "cf-staging-executor:smartaihub-app-staging",
    targetId: "smartspec-cloudflare-staging",
    environment: "staging",
    artifactRef: `sha256:${"a".repeat(64)}`,
    sourceSha: "b".repeat(40),
    buildDigest: "a".repeat(64),
    actions: ["deploy"],
    rollbackDeploymentId: "7a7d2671-03f4-4f28-9b01-a639d359dfd6",
    rollbackArtifactRef: `sha256:${"c".repeat(64)}`,
    rollbackSourceSha: "d".repeat(40),
    rollbackBuildDigest: "c".repeat(64),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    jobId: stagingJobId,
    accountRef: "f3fb0b6858e186fcc36be105bfa00243",
    configurationRef: `cf-origin:${"e".repeat(64)}`,
    configurationDigest: "e".repeat(64),
    rollbackConfigurationRef: `cf-origin:${"e".repeat(64)}`,
    rollbackConfigurationDigest: "e".repeat(64),
    revoked: false as const,
  };
  const stagingRegistry = createJobExecutorRegistry([
    {
      jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      executionClass: "long",
      contractVersions: new Set([CLOUDFLARE_STAGING_ORIGIN_CONTRACT]),
      executor,
    },
  ]);
  const stagingDefinition = {
    contractVersion: CLOUDFLARE_STAGING_ORIGIN_CONTRACT,
    jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
    executionClass: "long" as const,
    input: {
      contractVersion: CLOUDFLARE_STAGING_ORIGIN_CONTRACT,
      action: "deploy" as const,
      targetId: "smartspec-cloudflare-staging" as const,
      environment: "staging" as const,
      grantRef: stagingGrant.grantRef,
      projectId: stagingGrant.projectId,
      artifactRef: stagingGrant.artifactRef,
      sourceSha: stagingGrant.sourceSha,
      buildDigest: stagingGrant.buildDigest,
      configurationRef: stagingGrant.configurationRef,
      configurationDigest: stagingGrant.configurationDigest,
    },
    idempotencyKey: "unstable-client-key",
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 2_000,
      maxDelayMs: 5_000,
      jitter: "bounded" as const,
      deadlineMs: 10 * 60 * 1000,
      allowedErrorClasses: ["retryable"] as string[],
    },
    timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 10 * 60 * 1000 },
  };

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
        input: {
          tenantId: "attacker-value",
          idempotencyKey: "payload-data-is-not-command-identity",
        },
        retryPolicy: {
          maxAttempts: 1,
          baseDelayMs: 1,
          maxDelayMs: 1,
          jitter: "none",
          deadlineMs: 1000,
          allowedErrorClasses: [],
        },
        timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
      },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-server",
        requestedByUserId: 42,
        idempotencyKey: " request-1 ",
      }),
      expect.anything()
    );
  });

  it("binds an owner-approved staging grant to its canonical job ID and bounded idempotent execution", async () => {
    const create = vi.fn().mockResolvedValue({ jobId: stagingJobId, created: true });
    await createControlPlaneJob({
      executorRegistry: stagingRegistry,
      controlPlane: { create } as any,
      resolveCloudflareStagingGrant: vi.fn().mockResolvedValue(stagingGrant),
      context: {
        tenantId: stagingGrant.tenantId,
        actorType: "system",
        authorizationScope: "cloudflare.staging.grant.execute",
        correlationId: "staging-grant-continuation",
      },
      definition: stagingDefinition,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: stagingGrant.tenantId,
        requestedByUserId: stagingGrant.requesterUserId,
        idempotencyKey: `cloudflare-staging-grant:${stagingGrant.grantRef}`,
        retryPolicy: expect.objectContaining({
          maxAttempts: 2,
          baseDelayMs: 2_000,
          maxDelayMs: 5_000,
          deadlineMs: 10 * 60_000,
          allowedErrorClasses: ["retryable"],
        }),
      }),
      expect.objectContaining({ canonicalJobId: stagingJobId }),
    );
  });

  it("never widens an owner-bound retry budget or deadline", async () => {
    const create = vi.fn().mockResolvedValue({ jobId: stagingJobId, created: true });
    await createControlPlaneJob({
      executorRegistry: stagingRegistry,
      controlPlane: { create } as any,
      resolveCloudflareStagingGrant: vi.fn().mockResolvedValue(stagingGrant),
      context: {
        tenantId: stagingGrant.tenantId,
        actorType: "system",
        authorizationScope: "cloudflare.staging.grant.execute",
        correlationId: "staging-grant-restrictive-policy",
      },
      definition: {
        ...stagingDefinition,
        retryPolicy: {
          maxAttempts: 1,
          baseDelayMs: 60_000,
          maxDelayMs: 120_000,
          jitter: "recorded",
          deadlineMs: 5 * 60_000,
          allowedErrorClasses: ["retryable", "timeout", "unavailable"],
        },
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        retryPolicy: {
          maxAttempts: 1,
          baseDelayMs: 2_000,
          maxDelayMs: 5_000,
          jitter: "bounded",
          deadlineMs: 5 * 60_000,
          allowedErrorClasses: ["retryable"],
        },
      }),
      expect.objectContaining({ canonicalJobId: stagingJobId }),
    );
  });

  it("fails closed when an approved staging grant does not match the submitted artifact", async () => {
    const create = vi.fn();
    await expect(createControlPlaneJob({
      executorRegistry: stagingRegistry,
      controlPlane: { create } as any,
      resolveCloudflareStagingGrant: vi.fn().mockResolvedValue(stagingGrant),
      context: {
        tenantId: stagingGrant.tenantId,
        actorType: "system",
        authorizationScope: "cloudflare.staging.grant.execute",
        correlationId: "staging-grant-mismatch",
      },
      definition: {
        ...stagingDefinition,
        input: { ...stagingDefinition.input, sourceSha: "f".repeat(40) },
      },
    })).rejects.toMatchObject({ code: "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not let a system job producer use the staging grant path under a broad scope", async () => {
    const create = vi.fn();
    const resolver = vi.fn().mockResolvedValue(stagingGrant);
    await expect(createControlPlaneJob({
      executorRegistry: stagingRegistry,
      controlPlane: { create } as any,
      resolveCloudflareStagingGrant: resolver,
      context: {
        tenantId: stagingGrant.tenantId,
        actorType: "system",
        authorizationScope: "system",
        correlationId: "staging-broad-scope",
      },
      definition: stagingDefinition,
    })).rejects.toMatchObject({ code: "CLOUDFLARE_STAGING_SYSTEM_SCOPE_DENIED" });
    expect(resolver).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an unregistered handler before creating a job", async () => {
    const create = vi.fn();
    await expect(
      createControlPlaneJob({
        executorRegistry: registry,
        controlPlane: { create } as any,
        context: {
          tenantId: "t",
          actorType: "system",
          authorizationScope: "system",
          correlationId: "c",
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "unknown.job",
          executionClass: "short",
          input: {},
          retryPolicy: {
            maxAttempts: 1,
            baseDelayMs: 1,
            maxDelayMs: 1,
            jitter: "none",
            deadlineMs: 1000,
            allowedErrorClasses: [],
          },
          timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
        },
      })
    ).rejects.toMatchObject({ code: "JOB_EXECUTOR_UNREGISTERED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an incomplete authenticated user context before creating a job", async () => {
    const create = vi.fn();
    await expect(
      createControlPlaneJob({
        executorRegistry: registry,
        controlPlane: { create } as any,
        context: {
          tenantId: "t",
          actorType: "user",
          authorizationScope: "tenant:write",
          correlationId: "c",
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "maintenance.cleanup",
          executionClass: "short",
          input: {},
          retryPolicy: {
            maxAttempts: 1,
            baseDelayMs: 1,
            maxDelayMs: 1,
            jitter: "none",
            deadlineMs: 1000,
            allowedErrorClasses: [],
          },
          timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
        },
      })
    ).rejects.toMatchObject({ code: "JOB_CONTEXT_INVALID" });
    expect(create).not.toHaveBeenCalled();
  });

  it("persists new jobs for later publication when hard-cutover runtime is unavailable", async () => {
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
    const create = vi.fn().mockResolvedValue({ jobId: "job-1", created: true });
    try {
      await createControlPlaneJob({
        executorRegistry: registry,
        controlPlane: { create } as any,
        context: {
          tenantId: "t",
          actorType: "system",
          authorizationScope: "system",
          correlationId: "c",
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "maintenance.cleanup",
          executionClass: "short",
          input: {},
          retryPolicy: {
            maxAttempts: 1,
            baseDelayMs: 1,
            maxDelayMs: 1,
            jitter: "none",
            deadlineMs: 1000,
            allowedErrorClasses: [],
          },
          timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
        },
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t",
          jobType: "maintenance.cleanup",
        }),
        expect.anything()
      );
    } finally {
      if (previous.hardCutover === undefined)
        delete process.env.FEATURE_186_HARD_CUTOVER;
      else process.env.FEATURE_186_HARD_CUTOVER = previous.hardCutover;
      if (previous.runtimeUrl === undefined)
        delete process.env.CLOUDFLARE_RUNTIME_URL;
      else process.env.CLOUDFLARE_RUNTIME_URL = previous.runtimeUrl;
      if (previous.runtimeToken === undefined)
        delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
      else process.env.CLOUDFLARE_RUNTIME_TOKEN = previous.runtimeToken;
      if (previous.harness === undefined)
        delete process.env.FEATURE_186_POSTGRES_PULL_HARNESS;
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
      await expect(
        createControlPlaneJob({
          executorRegistry: registry,
          controlPlane: { create } as any,
          context: {
            tenantId: "t",
            actorType: "system",
            authorizationScope: "system",
            correlationId: "c",
          },
          definition: {
            contractVersion: "feature-186-v1",
            jobType: "maintenance.cleanup",
            executionClass: "short",
            input: {},
            retryPolicy: {
              maxAttempts: 1,
              baseDelayMs: 1,
              maxDelayMs: 1,
              jitter: "none",
              deadlineMs: 1000,
              allowedErrorClasses: [],
            },
            timeoutPolicy: { softTimeoutMs: 100, hardTimeoutMs: 1000 },
          },
        })
      ).rejects.toThrow("GOOGLE_CLOUD_RUNTIME_RETIRED");
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (previous.hardCutover === undefined)
        delete process.env.FEATURE_186_HARD_CUTOVER;
      else process.env.FEATURE_186_HARD_CUTOVER = previous.hardCutover;
      if (previous.runtimeUrl === undefined)
        delete process.env.CLOUDFLARE_RUNTIME_URL;
      else process.env.CLOUDFLARE_RUNTIME_URL = previous.runtimeUrl;
      if (previous.runtimeToken === undefined)
        delete process.env.CLOUDFLARE_RUNTIME_TOKEN;
      else process.env.CLOUDFLARE_RUNTIME_TOKEN = previous.runtimeToken;
      if (previous.legacyUrl === undefined)
        delete process.env.CLOUD_RUN_NODE_URL;
      else process.env.CLOUD_RUN_NODE_URL = previous.legacyUrl;
    }
  });
});
