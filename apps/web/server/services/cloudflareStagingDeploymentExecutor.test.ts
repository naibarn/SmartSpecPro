import { CLOUDFLARE_STAGING_ORIGIN_CONTRACT, CLOUDFLARE_STAGING_ORIGIN_GRANT } from "./cloudflareStagingOriginContract";
import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
  CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
  CLOUDFLARE_STAGING_RETRY_POLICY,
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
  const reporter = { assertActive: vi.fn(async () => undefined), heartbeat: vi.fn(async () => undefined) };
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
        createdAt: "2029-01-01T00:00:00.000Z",
        retryPolicy: { deadlineMs: 600000, deadlineMode: "fixed" },
        timeoutSeconds: 600,
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
  it("allows only one bounded retry for explicitly transient failures", () => {
    expect(CLOUDFLARE_STAGING_RETRY_POLICY).toEqual({
      maxAttempts: 2,
      baseDelayMs: 2_000,
      maxDelayMs: 5_000,
      jitter: "bounded",
      deadlineMs: 15 * 60_000,
      allowedErrorClasses: ["retryable"],
    });
  });

  it("refuses an origin-configured target under an artifact-only v1 grant before resolving credentials", async () => {
    const withCredential = vi.fn();
    const state = runtime({ resolveTarget: async () => ({ ...target, runtimePolicy: `cf-origin:${"e".repeat(64)}` }), withCredential });
    await expect(createCloudflareStagingDeploymentExecutor(state.dependencies)(invocation().payload)).rejects.toThrow("ORIGIN_GRANT_REQUIRED");
    expect(withCredential).not.toHaveBeenCalled();
    expect(state.cloudflare.deploy).not.toHaveBeenCalled();
  });

  it("blocks an elapsed creation-time deadline before a provider mutation", async () => {
    const state = runtime();
    state.cloudflare.deploy.mockImplementation(async input => {
      await (input as typeof input & { assertMutationAuthorized: () => Promise<void> }).assertMutationAuthorized();
      throw Error("PROVIDER_WRITE_MUST_NOT_RUN");
    });
    const call = invocation();
    (call.payload as any).context.createdAt = "2028-01-01T00:00:00.000Z";
    await expect(createCloudflareStagingDeploymentExecutor(state.dependencies)(call.payload)).rejects.toThrow("JOB_DEADLINE_EXPIRED");
  });

  it("checks current grant authority again at the provider mutation boundary", async () => {
    let checks = 0;
    const state = runtime({ resolveGrant: async () => ++checks === 1 ? grant : null });
    state.cloudflare.deploy.mockImplementation(async input => {
      await (input as typeof input & { assertMutationAuthorized: () => Promise<void> }).assertMutationAuthorized();
      throw Error("PROVIDER_WRITE_MUST_NOT_RUN");
    });
    await expect(createCloudflareStagingDeploymentExecutor(state.dependencies)(invocation().payload)).rejects.toThrow("GRANT_OR_ARTIFACT_MISSING");
    expect(checks).toBe(2);
  });

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
      heartbeat: vi.fn(async () => undefined),
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

  it("preserves explicit transient Cloudflare transport classification for the job control plane", async () => {
    const state = runtime();
    const error = Object.assign(new Error("Cloudflare temporarily unavailable"), {
      class: "retryable",
      diagnosticCode: "CLOUDFLARE_HTTP_503",
    });
    state.cloudflare.deploy.mockRejectedValue(error);

    await expect(createCloudflareStagingDeploymentExecutor(state.dependencies)(invocation().payload))
      .rejects.toMatchObject({ class: "retryable", diagnosticCode: "CLOUDFLARE_HTTP_503" });
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
          verificationFailure: "health",
          healthStatus: 503,
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
      diagnosticCode: "CLOUDFLARE_STAGING_HEALTH_HTTP_503_FAILED",
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


describe("explicit Cloudflare origin v2 executor", () => {
  const configurationDigest = "e".repeat(64);
  const configurationRef = `cf-origin:${configurationDigest}`;
  function originRuntime() {
    const originGrant = { ...grant, schemaVersion: CLOUDFLARE_STAGING_ORIGIN_GRANT,
      grantRef: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222",
      actions: ["deploy"] as ["deploy"], accountRef: "a".repeat(32), artifactRef: `sha256:${buildDigest}`,
      rollbackDeploymentId: "33333333-3333-4333-8333-333333333333", rollbackArtifactRef: `sha256:${rollbackDigest}`,
      configurationRef, configurationDigest, rollbackConfigurationRef: null, rollbackConfigurationDigest: null, revokedAt: null };
    const configuredTarget = { ...target, accountRef: originGrant.accountRef, runtimePolicy: configurationRef };
    const approvedArtifact = { ...artifact, artifactRef: originGrant.artifactRef };
    const baseline = { artifactRef: originGrant.rollbackArtifactRef, sourceSha: rollbackSha, buildDigest: rollbackDigest, immutable: true as const };
    const secrets = { token: "fixture-app-token".repeat(4), clientId: "fixture-access-id".repeat(2), secret: "fixture-access-secret".repeat(2) };
    const resolveGrant = vi.fn(async () => originGrant);
    const withOriginConfiguration = vi.fn(async ({ operation, configurationRef: selectedRef, configurationDigest: selectedDigest }: any) => {
      if (selectedRef !== configurationRef || selectedDigest !== configurationDigest) throw new Error("CONFIG_REVOKED");
      return operation({ configurationRef, configurationDigest, descriptor: {}, secrets });
    });
    const state = runtime({ resolveGrant, resolveTarget: async () => configuredTarget,
      resolveArtifact: async ref => ref === approvedArtifact.artifactRef ? approvedArtifact : ref === baseline.artifactRef ? baseline : null,
      withOriginConfiguration });
    state.cloudflare.deploy.mockImplementation(async input => {
      await (input as any).assertMutationAuthorized();
      return { deploymentId: "deployment:new", url: "https://smartspec-cloudflare-staging.account.workers.dev",
        sourceSha, buildDigest, configurationDigest };
    });
    state.cloudflare.rollback.mockImplementation(async input => {
      await (input as any).assertMutationAuthorized();
      return { deploymentId: "deployment:rollback", url: "https://smartspec-cloudflare-staging.account.workers.dev",
        sourceSha: rollbackSha, buildDigest: rollbackDigest };
    });
    state.cloudflare.verifyRuntime.mockImplementation(async input => ({ ...input, reachable: true }));
    const call: any = invocation().payload;
    Object.assign(call.context, { contractVersion: CLOUDFLARE_STAGING_ORIGIN_CONTRACT, jobId: originGrant.jobId, projectId: originGrant.projectId });
    Object.assign(call.context.input, { contractVersion: CLOUDFLARE_STAGING_ORIGIN_CONTRACT, grantRef: originGrant.grantRef,
      artifactRef: approvedArtifact.artifactRef, projectId: originGrant.projectId, configurationRef, configurationDigest });
    return { ...state, call, originGrant, configuredTarget, resolveGrant, withOriginConfiguration, secrets };
  }

  it("requires the exact canonical job/project/config grant and resolves secrets only inside deployment", async () => {
    const f = originRuntime();
    const identity = vi.spyOn(f.dependencies, "executorIdentity");
    const result = await createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call);
    expect(result.output).toMatchObject({ configurationRef, configurationDigest, buildDigest, grantRef: f.originGrant.grantRef,
      rollbackConfigurationRef: null, rollbackConfigurationDigest: null });
    expect(identity).toHaveBeenCalledWith(expect.objectContaining({ originAuthority: expect.objectContaining({ configurationDigest,
      rollbackDeploymentId: f.originGrant.rollbackDeploymentId, accountRef: f.originGrant.accountRef }) }));
    expect(f.cloudflare.deploy).toHaveBeenCalledWith(expect.objectContaining({ originConfiguration: expect.objectContaining({ secrets: f.secrets }) }));
    expect(JSON.stringify(result)).not.toContain(f.secrets.secret);
  });

  it("deploys with a provider-verified rollback deployment even when the historical upload bundle has aged out", async () => {
    const f = originRuntime();
    f.dependencies.resolveArtifact = vi.fn(async ref => ref === f.originGrant.artifactRef
      ? { ...artifact, artifactRef: f.originGrant.artifactRef } : null);

    const result = await createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call);

    expect(result.output).toMatchObject({ runtimeVerified: true, rollbackDeploymentId: f.originGrant.rollbackDeploymentId });
    expect(f.dependencies.resolveArtifact).toHaveBeenCalledTimes(1);
    expect(f.cloudflare.deploy).toHaveBeenCalledTimes(1);
  });

  it("executes an origin-bound first-deployment bootstrap without inventing or resolving a rollback baseline", async () => {
    const f = originRuntime();
    Object.assign(f.originGrant, { actions: ["bootstrap"], rollbackDeploymentId: null, rollbackArtifactRef: null,
      rollbackSourceSha: null, rollbackBuildDigest: null });
    Object.assign(f.call.context.input, { action: "bootstrap" });
    f.dependencies.resolveArtifact = vi.fn(async ref => ref === f.originGrant.artifactRef ? { ...artifact, artifactRef: f.originGrant.artifactRef } : null);

    const result = await createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call);

    expect(result.output).toMatchObject({ action: "bootstrap", configurationRef, configurationDigest,
      rollbackDeploymentId: null, rollbackConfigurationRef: null, runtimeVerified: true });
    expect(f.dependencies.resolveArtifact).toHaveBeenCalledTimes(1);
    expect(f.cloudflare.deploy).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: true,
      originConfiguration: expect.objectContaining({ configurationDigest }) }));
    expect(f.cloudflare.rollback).not.toHaveBeenCalled();
  });

  it.each(["jobId", "projectId", "configurationDigest", "contractVersion"])("rejects %s substitution before credentials/provider writes", async field => {
    const f = originRuntime();
    if (field === "jobId") f.call.context[field] = "foreign";
    else if (field === "projectId") f.call.context.input[field] = "foreign";
    else f.call.context.input[field] = field === "contractVersion" ? CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT : "f".repeat(64);
    const credential = vi.spyOn(f.dependencies, "withCredential");
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("CLOUDFLARE_STAGING_");
    expect(credential).not.toHaveBeenCalled();
    expect(f.cloudflare.deploy).not.toHaveBeenCalled();
  });

  it("rejects legacy grants and expired/revoked configuration before credentials", async () => {
    const f = originRuntime();
    f.withOriginConfiguration.mockRejectedValueOnce(new Error("CONFIG_REVOKED"));
    const credential = vi.spyOn(f.dependencies, "withCredential");
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("CONFIG_REVOKED");
    expect(credential).not.toHaveBeenCalled();
    f.resolveGrant.mockResolvedValue({ ...f.originGrant, schemaVersion: "cloudflare.staging-deployment-grant.v1" } as never);
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("ORIGIN_GRANT_REQUIRED");
    expect(f.cloudflare.deploy).not.toHaveBeenCalled();
  });

  it("rechecks rollback/config authority immediately before mutation", async () => {
    const f = originRuntime();
    let resolved = 0;
    f.resolveGrant.mockImplementation(async () => (++resolved === 1 ? f.originGrant : {
      ...f.originGrant, rollbackDeploymentId: "44444444-4444-4444-8444-444444444444",
    }));
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("AUTHORITY_CHANGED");
    expect(f.cloudflare.verifyRuntime).not.toHaveBeenCalled();
  });

  it("does not accept asset-only receipts when the v2 config receipt is missing", async () => {
    const f = originRuntime();
    f.cloudflare.deploy.mockResolvedValueOnce({ deploymentId: "deployment:new", url: "https://smartspec-cloudflare-staging.account.workers.dev", sourceSha, buildDigest });
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("ORIGIN_RECEIPT_MISMATCH");
  });

  it("runs pre-authorized recovery when origin verification throws after a confirmed deployment", async () => {
    const f = originRuntime();
    f.cloudflare.verifyRuntime.mockRejectedValueOnce(Object.assign(new Error("provider response must not leak"), {
      diagnosticCode: "CLOUDFLARE_STAGING_PROVIDER_READ_UNAVAILABLE",
      class: "permanent",
    }));
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_PROVIDER_READ_UNAVAILABLE",
      class: "permanent",
    });
    expect(f.cloudflare.rollback).toHaveBeenCalledOnce();
    expect(f.cloudflare.verifyRuntime).toHaveBeenCalledTimes(2);
  });

  it("classifies untyped verifier transport exceptions safely as retryable after recovery", async () => {
    const f = originRuntime();
    f.cloudflare.verifyRuntime.mockRejectedValueOnce(new Error("sensitive provider response"));
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toMatchObject({
      diagnosticCode: "CLOUDFLARE_STAGING_VERIFICATION_TRANSPORT_FAILED",
      class: "retryable",
    });
    expect(f.cloudflare.rollback).toHaveBeenCalledOnce();
  });

  it("automatically restores the explicitly origin-free recovery baseline without claiming origin health", async () => {
    const f = originRuntime();
    f.cloudflare.verifyRuntime.mockImplementation(async input => ({ ...input, reachable: input.buildDigest === rollbackDigest }));
    await expect(createCloudflareStagingDeploymentExecutor(f.dependencies)(f.call)).rejects.toThrow("RUNTIME_VERIFICATION_FAILED");
    expect(f.cloudflare.rollback).toHaveBeenCalledWith(expect.objectContaining({ deploymentId: f.originGrant.rollbackDeploymentId, buildDigest: rollbackDigest }));
    expect(f.cloudflare.rollback).not.toHaveBeenCalledWith(expect.objectContaining({ configurationDigest }));
    expect(f.cloudflare.verifyRuntime).toHaveBeenLastCalledWith(expect.not.objectContaining({ configurationDigest }));
  });
});
