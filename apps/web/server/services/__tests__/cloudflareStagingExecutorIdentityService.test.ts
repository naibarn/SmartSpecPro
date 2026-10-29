import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ row: null as any }));
vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (mocks.row ? [mocks.row] : []) }),
      }),
    }),
  }),
}));
vi.mock("../postgresRateLimitStore", () => ({
  claimTtlDedupeKey: vi.fn(async () => true),
}));

import {
  __clearCloudflareStagingExecutorNoncesForTests,
  cloudflareStagingExecutorProofPayload,
  createCloudflareStagingExecutorProof,
  validateCloudflareStagingExecutorRegistration,
  verifyCloudflareStagingExecutorProof,
  CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
  CLOUDFLARE_STAGING_EXECUTOR_TARGET,
} from "../cloudflareStagingExecutorIdentityService";

const binding = {
  jobId: "job-123",
  tenantId: "tenant-stage",
  target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
  artifactSha256: "a".repeat(64),
  action: "deploy" as const,
  idempotencyKey: "attempt-123",
};

describe("Cloudflare staging executor identity", () => {
  const keys = crypto.generateKeyPairSync("ed25519");
  const now = Date.parse("2026-10-17T10:00:00.000Z");
  const executorId = "cf-staging-executor:runner-a";

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    __clearCloudflareStagingExecutorNoncesForTests();
    mocks.row = {
      runnerId: executorId,
      tenantId: binding.tenantId,
      nodeKind: "service_executor",
      profile: "cloudflare_staging_executor",
      trustState: "trusted",
      status: "registered",
      revokedAt: null,
      snapshotExpiresAt: new Date(now + 60_000),
      currentSnapshotJson: {
        cloudflareStagingExecutor: {
          version: 1,
          publicKey: keys.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
          fingerprint: crypto
            .createHash("sha256")
            .update(keys.publicKey.export({ type: "spki", format: "der" }))
            .digest("hex"),
          target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
          capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
        },
      },
    };
  });

  async function signedProof(attempt = binding) {
    return createCloudflareStagingExecutorProof(attempt, {
      resolvePrivateKey: async () => ({
        executorId,
        privateKey: keys.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      }),
      now,
      nonce: crypto.randomBytes(24).toString("base64url"),
    });
  }

  it("binds native provisioning separately from protected-origin provisioning", async () => {
    const attempt = { ...binding, action: "provision" as const,
      provisionAuthority: { projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111",
        accountRef: "a".repeat(32), planDigest: binding.artifactSha256 } };
    const native = { ...attempt, provisionContract: "cloudflare-staging-native-provision-v1" as const };
    const proof = await signedProof(native as any);
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: attempt })).rejects.toThrow("executor_proof_invalid");
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: native })).resolves.toMatchObject({ registered: true });
    await expect(createCloudflareStagingExecutorProof({ ...binding, provisionContract: "cloudflare-staging-native-provision-v1" })).rejects.toThrow("executor_attempt_binding_invalid");
  });

  it("accepts the Staging database lease-renewal action during proof verification", async () => {
    const renewal = { ...binding, action: "renew_lease" as const,
      provisionContract: "cloudflare-staging-private-db-renewal-v1" as const,
      provisionAuthority: { projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111",
        accountRef: "a".repeat(32), planDigest: binding.artifactSha256 } };
    const proof = await signedProof(renewal as any);
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: renewal as any }))
      .resolves.toMatchObject({ registered: true, executorId });
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: { ...renewal, idempotencyKey: "different-attempt" } as any }))
      .rejects.toThrow("executor_proof_invalid");
  });

  it("binds HTTP image publication separately from metadata or VM provisioning", async () => {
    const attempt = { ...binding, action: "provision" as const,
      provisionContract: "cloudflare-staging-http-image-v1" as const,
      provisionAuthority: { projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111",
        accountRef: "a".repeat(32), planDigest: binding.artifactSha256 } };
    const proof = await signedProof(attempt as any);
    for (const contract of ["cloudflare-staging-native-provision-v1", undefined]) {
      await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: {
        ...attempt, provisionContract: contract as any } })).rejects.toThrow("executor_proof_invalid");
    }
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: attempt })).resolves.toMatchObject({ registered: true });
  });

  it("signs provision intent separately and rejects deploy downgrade and cross-plan replay", async () => {
    const provisionAuthority = { projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111",
      accountRef: "a".repeat(32), planDigest: binding.artifactSha256 };
    const attempt = { ...binding, action: "provision" as const, provisionAuthority };
    const proof = await signedProof(attempt as any);
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: binding })).rejects.toThrow("executor_proof_invalid");
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: { ...attempt,
      provisionAuthority: { ...provisionAuthority, projectId: "other" } } })).rejects.toThrow("executor_proof_invalid");
    await expect(createCloudflareStagingExecutorProof({ ...binding, action: "provision" })).rejects.toThrow("executor_attempt_binding_invalid");
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: attempt })).resolves.toMatchObject({ registered: true });
  });

  it("binds the complete origin transition and rejects downgrade or config/rollback/project drift", async () => {
    const originAuthority = {
      action: "deploy" as const,
      projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111", accountRef: "a".repeat(32),
      configurationRef: `cf-origin:${"b".repeat(64)}`, configurationDigest: "b".repeat(64),
      rollbackConfigurationRef: null, rollbackConfigurationDigest: null,
      rollbackDeploymentId: "22222222-2222-4222-8222-222222222222", rollbackArtifactRef: `sha256:${"c".repeat(64)}`,
      rollbackSourceSha: "d".repeat(40), rollbackBuildDigest: "c".repeat(64),
    };
    const attempt = { ...binding, originAuthority };
    const proof = await signedProof(attempt);
    for (const expectedBinding of [binding,
      { ...attempt, originAuthority: { ...originAuthority, projectId: "another-project" } },
      { ...attempt, originAuthority: { ...originAuthority, accountRef: "f".repeat(32) } },
      { ...attempt, originAuthority: { ...originAuthority, configurationRef: `cf-origin:${"f".repeat(64)}`, configurationDigest: "f".repeat(64) } },
      { ...attempt, originAuthority: { ...originAuthority, rollbackDeploymentId: "33333333-3333-4333-8333-333333333333" } },
    ]) await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding })).rejects.toThrow("executor_proof_invalid");
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: attempt })).resolves.toMatchObject({ registered: true });
    const legacy = await signedProof();
    await expect(verifyCloudflareStagingExecutorProof(legacy, { now, expectedBinding: attempt })).rejects.toThrow("executor_proof_invalid");
  });

  it("binds first-deployment bootstrap as a distinct action with no rollback baseline", async () => {
    const originAuthority = {
      action: "bootstrap" as const,
      projectId: "project-stage", grantRef: "11111111-1111-4111-8111-111111111111", accountRef: "a".repeat(32),
      configurationRef: `cf-origin:${"b".repeat(64)}`, configurationDigest: "b".repeat(64),
      rollbackConfigurationRef: null, rollbackConfigurationDigest: null,
      rollbackDeploymentId: null, rollbackArtifactRef: null, rollbackSourceSha: null, rollbackBuildDigest: null,
    };
    const attempt = { ...binding, action: "bootstrap" as const, originAuthority };
    const proof = await signedProof(attempt);
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: attempt })).resolves.toMatchObject({ registered: true });
    await expect(verifyCloudflareStagingExecutorProof(proof, { now, expectedBinding: { ...attempt,
      originAuthority: { ...originAuthority, action: "deploy" } } })).rejects.toThrow("executor_attempt_binding_invalid");
  });

  it("registers only a bounded, valid Ed25519 identity", () => {
    const registered = validateCloudflareStagingExecutorRegistration(
      {
        executorId,
        publicKey: keys.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
        expiresAt: new Date(now + 60_000),
      },
      now
    );
    expect(registered.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      validateCloudflareStagingExecutorRegistration(
        {
          executorId: "caller-picked-id",
          publicKey: keys.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
          expiresAt: new Date(now + 60_000),
        },
        now
      )
    ).toThrow("executor_id_invalid");
  });

  it("authenticates a fresh proof and returns the persisted identity", async () => {
    const proof = await signedProof();
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now,
        expectedBinding: binding,
      })
    ).resolves.toEqual({
      registered: true,
      executorId,
      tenantId: binding.tenantId,
      target: CLOUDFLARE_STAGING_EXECUTOR_TARGET,
      capability: CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY,
      expiresAt: new Date(now + 60_000).toISOString(),
    });
  });

  it("rejects target, tenant, artifact, operation and job binding mismatches", async () => {
    const proof = await signedProof();
    await expect(
      verifyCloudflareStagingExecutorProof(
        { ...proof, target: "production" },
        { now, expectedBinding: binding }
      )
    ).rejects.toThrow("executor_proof_invalid");
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now,
        expectedBinding: { ...binding, action: "rollback" },
      })
    ).rejects.toThrow("executor_proof_invalid");
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now,
        expectedBinding: { ...binding, artifactSha256: "b".repeat(64) },
      })
    ).rejects.toThrow("executor_proof_invalid");
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now,
        expectedBinding: { ...binding, jobId: "other-job" },
      })
    ).rejects.toThrow("executor_proof_invalid");
  });

  it("rejects expired, revoked, expired-registration and mismatched executor records", async () => {
    const proof = await signedProof();
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now: now + 6 * 60_000,
        expectedBinding: binding,
      })
    ).rejects.toThrow("executor_proof_expired");
    mocks.row.revokedAt = new Date(now - 1);
    await expect(
      verifyCloudflareStagingExecutorProof(await signedProof(), {
        now,
        expectedBinding: binding,
      })
    ).rejects.toThrow("executor_not_authorized");
    mocks.row.revokedAt = null;
    mocks.row.snapshotExpiresAt = new Date(now - 1);
    await expect(
      verifyCloudflareStagingExecutorProof(await signedProof(), {
        now,
        expectedBinding: binding,
      })
    ).rejects.toThrow("executor_not_authorized");
    mocks.row.snapshotExpiresAt = new Date(now + 60_000);
    mocks.row.trustState = "pending";
    await expect(
      verifyCloudflareStagingExecutorProof(await signedProof(), {
        now,
        expectedBinding: binding,
      })
    ).rejects.toThrow("executor_not_authorized");
  });

  it("rejects replayed proofs and refuses to create proofs without private configuration", async () => {
    const proof = await signedProof();
    await verifyCloudflareStagingExecutorProof(proof, {
      now,
      expectedBinding: binding,
    });
    await expect(
      verifyCloudflareStagingExecutorProof(proof, {
        now,
        expectedBinding: binding,
      })
    ).rejects.toThrow("executor_proof_replayed");
    await expect(
      createCloudflareStagingExecutorProof(binding, {
        resolvePrivateKey: async () => null,
        now,
      })
    ).rejects.toThrow("executor_private_key_unconfigured");
  });

  it("signs the canonical attempt bytes", async () => {
    const proof = await signedProof();
    const payload = cloudflareStagingExecutorProofPayload(proof);
    expect(
      crypto.verify(
        null,
        Buffer.from(payload),
        keys.publicKey,
        Buffer.from(proof.signature, "base64url")
      )
    ).toBe(true);
  });
});
