import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
  CLOUDFLARE_STAGING_TARGET_ID,
  CloudflareStagingDeploymentError,
  createCloudflareStagingDeploymentExecutor,
  type CloudflareStagingDeploymentRuntime,
} from "./cloudflareStagingDeploymentExecutor";
import {
  createJobExecutorRegistry,
  defaultJobExecutorRegistry,
} from "./jobExecutorRegistry";
import { executeCanonicalJobEnvelope } from "../jobs/unifiedJobConsumer";

const sourceSha = "a".repeat(40);
const buildDigest = "b".repeat(64);
const rollbackSha = "c".repeat(40);
const rollbackDigest = "d".repeat(64);
const target = {
  targetId: CLOUDFLARE_STAGING_TARGET_ID,
  environment: "staging",
  accountRef: "account-staging",
  workerRef: "smartspec-cloudflare-staging",
  credentialRef: "cloudflare:deployment:tenant-a:smartspec:staging",
  enabled: true,
  tenantId: "tenant-a",
  projectId: "smartspec",
} as const;
const grant = {
  grantRef: "grant:staging:1",
  tenantId: "tenant-a",
  requesterUserId: 41,
  projectId: "smartspec",
  executorId: "executor:staging:1",
  targetId: CLOUDFLARE_STAGING_TARGET_ID,
  environment: "staging",
  artifactRef: "artifact:sha256:1",
  sourceSha,
  buildDigest,
  actions: ["deploy", "rollback"] as const,
  rollbackDeploymentId: "deployment:known-good",
  rollbackArtifactRef: "artifact:rollback:sha-c",
  rollbackSourceSha: rollbackSha,
  rollbackBuildDigest: rollbackDigest,
  expiresAt: "2030-01-01T00:00:00.000Z",
  revoked: false as const,
};
const artifact = {
  artifactRef: grant.artifactRef,
  sourceSha,
  buildDigest,
  immutable: true as const,
};

function runtime(overrides: Partial<CloudflareStagingDeploymentRuntime> = {}) {
  const cloudflare = {
    deploy: vi.fn(
      async (_input: { token: string; idempotencyKey: string }) => ({
        deploymentId: "deployment:new",
        url: "https://smartspec-cloudflare-staging.account.workers.dev",
        sourceSha,
        buildDigest,
      })
    ),
    verifyRuntime: vi.fn(
      async ({
        deploymentId,
        sourceSha: sha,
        buildDigest: digest,
      }: {
        deploymentId: string;
        sourceSha: string;
        buildDigest: string;
      }) => ({
        reachable: true,
        deploymentId,
        sourceSha: sha,
        buildDigest: digest,
      })
    ),
    rollback: vi.fn(
      async (_input: {
        token: string;
        deploymentId: string;
        idempotencyKey: string;
      }) => ({
        deploymentId: "deployment:known-good",
        sourceSha: rollbackSha,
        buildDigest: rollbackDigest,
      })
    ),
  };
  const dependencies: CloudflareStagingDeploymentRuntime = {
    executorIdentity: async () => ({
      registered: true,
      executorId: grant.executorId,
    }),
    resolveTarget: async () => target,
    resolveGrant: async () => grant,
    resolveArtifact: async () => artifact,
    withCredential: async ({ operation }) => ({
      status: "CONFIGURED",
      value: await operation("secret-token-for-test"),
    }),
    cloudflare,
    now: () => new Date("2029-01-01T00:00:00.000Z"),
    ...overrides,
  };
  return { dependencies, cloudflare };
}

function invocation(
  input: Record<string, unknown> = {},
  options: {
    jobType?: string;
    tenantId?: string;
    requesterUserId?: number;
  } = {}
) {
  const reporter = { assertActive: vi.fn(async () => undefined) };
  return {
    reporter,
    payload: {
      context: {
        jobId: "job-1",
        jobType: options.jobType ?? CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
        contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
        tenantId: options.tenantId ?? "tenant-a",
        requestedByUserId: options.requesterUserId ?? 41,
        projectId: "ignored-caller-project",
        input: {
          contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
          action: "deploy",
          targetId: CLOUDFLARE_STAGING_TARGET_ID,
          environment: "staging",
          grantRef: grant.grantRef,
          artifactRef: artifact.artifactRef,
          sourceSha,
          buildDigest,
          ...input,
        },
      },
      lease: { jobId: "job-1" },
      reporter,
    } as never,
  };
}

describe("Cloudflare staging deployment executor", () => {
  it("permits exclusive bootstrap with an absent baseline and rejects job/account replay before credentials", async () => {
    const bootstrap = { ...grant, actions: ["bootstrap"] as const, rollbackDeploymentId: null, rollbackArtifactRef: null, rollbackSourceSha: null, rollbackBuildDigest: null, jobId: "job-1", accountRef: target.accountRef };
    const state = runtime({ resolveGrant: async () => bootstrap });
    const call = invocation({ action: "bootstrap" });
    const result = await createCloudflareStagingDeploymentExecutor(state.dependencies)(call.payload);
    expect(result.output).toMatchObject({ action: "bootstrap", rollbackDeploymentId: null, runtimeVerified: true });
    expect(state.cloudflare.deploy).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: true }));
    expect(state.cloudflare.rollback).not.toHaveBeenCalled();
    for (const changed of [{ jobId: "another-job" }, { accountRef: "foreign-account" }, { rollbackDeploymentId: "invented-baseline" }, { actions: ["bootstrap", "deploy"] as const }]) {
      const withCredential = vi.fn();
      const invalid = runtime({ resolveGrant: async () => ({ ...bootstrap, ...changed }), withCredential });
      await expect(createCloudflareStagingDeploymentExecutor(invalid.dependencies)(invocation({ action: "bootstrap" }).payload)).rejects.toBeInstanceOf(CloudflareStagingDeploymentError);
      expect(withCredential).not.toHaveBeenCalled();
    }
  });

  it("completes the canonical worker job envelope through the existing registry and runtime receipt", async () => {
    const state = runtime();
    const lease = {
      jobId: "job-1",
      attemptId: "attempt-1",
      runnerId: "runner:staging",
      fencingVersion: 1,
      leaseToken: "lease-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    const context = {
      jobId: "job-1",
      jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
      tenantId: "tenant-a",
      requestedByUserId: 41,
      input: {
        contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
        action: "deploy",
        targetId: CLOUDFLARE_STAGING_TARGET_ID,
        environment: "staging",
        grantRef: grant.grantRef,
        artifactRef: artifact.artifactRef,
        sourceSha,
        buildDigest,
      },
      attempt: 1,
      status: "queued",
      executionClass: "long",
    };
    const completed: unknown[] = [];
    const controlPlane = {
      getContext: vi.fn(async () => context),
      claim: vi.fn(async () => lease),
      start: vi.fn(async () => undefined),
      assertActive: vi.fn(async () => undefined),
      complete: vi.fn(async (_lease: unknown, result: unknown) => {
        completed.push(result);
      }),
      fail: vi.fn(async () => undefined),
      rejectUnsupportedDelivery: vi.fn(async () => undefined),
    };
    const registry = createJobExecutorRegistry([
      {
        jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
        contractVersions: new Set([CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT]),
        executionClass: "long",
        executor: createCloudflareStagingDeploymentExecutor(state.dependencies),
      },
    ]);

    const result = await executeCanonicalJobEnvelope(
      {
        jobId: "job-1",
        contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
        businessAttempt: 1,
      },
      {
        controlPlane: controlPlane as never,
        executorRegistry: registry,
        runnerId: "runner:staging",
        adapter: "postgres-pull",
      }
    );

    expect(result).toMatchObject({ state: "succeeded", jobId: "job-1" });
    expect(controlPlane.claim).toHaveBeenCalledWith({
      jobId: "job-1",
      runnerId: "runner:staging",
      adapter: "postgres-pull",
      attemptId: undefined,
    });
    expect(state.cloudflare.deploy).toHaveBeenCalledTimes(1);
    expect(completed).toHaveLength(1);
    expect(JSON.stringify(completed[0])).toContain('"runtimeVerified":true');
    expect(JSON.stringify(completed[0])).not.toContain("secret-token-for-test");
  });

  it("registers only on the existing canonical worker job registry and remains closed without runtime authorities", async () => {
    const registration = defaultJobExecutorRegistry.resolve(
      CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT
    );
    expect(registration).toMatchObject({
      jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      executionClass: "long",
    });
    await expect(
      registration!.executor(invocation().payload)
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_RUNTIME_NOT_CONFIGURED",
    });
  });

  it("deploys only the fixed staging target and returns a runtime verified receipt without credentials", async () => {
    const state = runtime();
    const call = invocation();
    const result = await createCloudflareStagingDeploymentExecutor(
      state.dependencies
    )(call.payload);
    expect(state.cloudflare.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        target,
        artifact,
        idempotencyKey: "cloudflare-staging:job-1",
      })
    );
    expect(state.cloudflare.verifyRuntime).toHaveBeenCalledTimes(1);
    expect(result.output).toMatchObject({
      deploymentId: "deployment:new",
      runtimeVerified: true,
      sourceSha,
      buildDigest,
    });
    expect(JSON.stringify(result)).not.toContain("secret-token-for-test");
    expect(JSON.stringify(result)).not.toContain(grant.grantRef);
  });

  it("fails closed when runtime, authority, or grant is unavailable, expired, unauthorized, or scoped to another target", async () => {
    await expect(
      createCloudflareStagingDeploymentExecutor()(invocation().payload)
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_RUNTIME_NOT_CONFIGURED",
    });
    const noRunner = runtime({
      executorIdentity: async () => ({
        registered: false,
        executorId: "executor:staging:1",
      }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(noRunner.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_EXECUTOR_UNREGISTERED",
    });
    const expired = runtime({
      now: () => new Date("2031-01-01T00:00:00.000Z"),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(expired.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_GRANT_EXPIRED_OR_REVOKED",
    });
    const wrongTarget = runtime({
      resolveTarget: async () => ({ ...target, targetId: "production-worker" }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(wrongTarget.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_TARGET_DENIED",
    });
    const wrongGrant = runtime({
      resolveGrant: async () => ({ ...grant, requesterUserId: 99 }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(wrongGrant.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED",
    });
    const crossTenant = runtime({
      resolveGrant: async () => ({ ...grant, tenantId: "tenant-b" }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(crossTenant.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED",
    });
    const wrongExecutor = runtime({
      resolveGrant: async () => ({ ...grant, executorId: "executor:other" }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(wrongExecutor.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_GRANT_SCOPE_DENIED",
    });
  });

  it("rejects production, wrong-target, and artifact mismatch payloads before Cloudflare is called", async () => {
    const state = runtime();
    const execute = createCloudflareStagingDeploymentExecutor(
      state.dependencies
    );
    await expect(
      execute(invocation({ targetId: "production-worker" }).payload)
    ).rejects.toBeInstanceOf(CloudflareStagingDeploymentError);
    await expect(
      execute(invocation({ environment: "production" }).payload)
    ).rejects.toBeInstanceOf(CloudflareStagingDeploymentError);
    await expect(
      execute(invocation({ buildDigest: "e".repeat(64) }).payload)
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_ARTIFACT_MISMATCH",
    });
    expect(state.cloudflare.deploy).not.toHaveBeenCalled();
    const unsafeUrl = runtime({
      cloudflare: {
        ...state.cloudflare,
        deploy: vi.fn(async () => ({
          deploymentId: "deployment:new",
          url: "https://attacker.example/",
          sourceSha,
          buildDigest,
        })),
      },
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(unsafeUrl.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_DEPLOYMENT_RECEIPT_INVALID",
    });
  });

  it("uses canonical idempotency keys on retries and does not report success on a partial deployment failure", async () => {
    const state = runtime();
    const execute = createCloudflareStagingDeploymentExecutor(
      state.dependencies
    );
    const call = invocation();
    await execute(call.payload);
    await execute(call.payload);
    expect(state.cloudflare.deploy).toHaveBeenCalledTimes(2);
    expect(
      state.cloudflare.deploy.mock.calls.map(([input]) => input.idempotencyKey)
    ).toEqual(["cloudflare-staging:job-1", "cloudflare-staging:job-1"]);

    const partialApi = {
      ...state.cloudflare,
      verifyRuntime: vi
        .fn()
        .mockResolvedValueOnce({
          reachable: false,
          deploymentId: "deployment:new",
          sourceSha,
          buildDigest,
        })
        .mockResolvedValueOnce({
          reachable: true,
          deploymentId: "deployment:known-good",
          sourceSha: rollbackSha,
          buildDigest: rollbackDigest,
        }),
    };
    const partial = runtime({ cloudflare: partialApi });
    await expect(
      createCloudflareStagingDeploymentExecutor(partial.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_RUNTIME_VERIFICATION_FAILED",
    });
    expect(partialApi.rollback).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: grant.rollbackDeploymentId,
        idempotencyKey: "cloudflare-staging:job-1:auto-rollback",
      })
    );
  });

  it("verifies an explicit rollback receipt and rejects credential failure", async () => {
    const state = runtime();
    const rollbackArtifact = {
      artifactRef: grant.rollbackArtifactRef,
      sourceSha: rollbackSha,
      buildDigest: rollbackDigest,
      immutable: true as const,
    };
    const rollbackRuntime = runtime({
      resolveArtifact: async () => rollbackArtifact,
    });
    const rollbackInput = invocation({
      artifactRef: grant.rollbackArtifactRef,
      sourceSha: rollbackSha,
      buildDigest: rollbackDigest,
      action: "rollback",
    }).payload;
    const result = await createCloudflareStagingDeploymentExecutor(
      rollbackRuntime.dependencies
    )(rollbackInput);
    expect(rollbackRuntime.cloudflare.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: grant.rollbackDeploymentId })
    );
    expect(result.output).toMatchObject({
      action: "rollback",
      runtimeVerified: true,
      sourceSha: rollbackSha,
      buildDigest: rollbackDigest,
    });
    const noCredential = runtime({
      withCredential: async () => ({ status: "REVOKED" }),
    });
    await expect(
      createCloudflareStagingDeploymentExecutor(noCredential.dependencies)(
        invocation().payload
      )
    ).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_CREDENTIAL_REVOKED",
    });
    expect(state.cloudflare.deploy).not.toHaveBeenCalled();
  });
});
