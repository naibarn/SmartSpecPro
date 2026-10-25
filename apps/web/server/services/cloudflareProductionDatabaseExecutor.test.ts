import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT,
  CLOUDFLARE_PRODUCTION_DATABASE_JOB,
  createCloudflareProductionDatabaseExecutor,
  createProductionDatabaseGrant,
  type CloudflareProductionDatabaseRuntime,
} from "./cloudflareProductionDatabaseExecutor";
import {
  productionDatabaseResourcePlanDigest,
  type ProductionDatabaseResourcePlan,
} from "./cloudflareProductionDatabaseProvision";

const jobId = "12345678-1234-4234-8234-123456789abc";
const tenantId = "tenant-1",
  projectId = "project-1";
const accountRef = "f3fb0b6858e186fcc36be105bfa00243";
const target = {
  targetId: "smartspec-cloudflare-runtime",
  tenantId,
  projectId,
  environment: "production",
  accountRef,
  workerRef: "smartspec-cloudflare-runtime",
  credentialRef: `cloudflare:deployment:${tenantId}:${projectId}:production`,
  enabled: true,
} as const;
const plan: ProductionDatabaseResourcePlan = {
  tunnelId: "87654321-4321-4321-8321-cba987654321",
  databaseHostname: "db.smartaihub.app",
  databaseName: "smartspec",
  databaseUser: "sah_cf_prod_0123456789ab",
  connectionLimit: 5,
  tlsVerification: "verify_full",
};
const response = (result: unknown) =>
  new Response(JSON.stringify({ success: true, result }), { status: 200 });

function fixture() {
  const { grant, databasePassword } = createProductionDatabaseGrant({
    jobId,
    tenantId,
    projectId,
    requesterUserId: 9,
    accountRef,
    plan,
  });
  const planDigest = productionDatabaseResourcePlanDigest(plan);
  const service = {
    service_id: "12345678-1234-4234-8234-123456789abc",
    name: `smartspec-production-postgres-${planDigest.slice(0, 12)}`,
    type: "tcp",
    app_protocol: "postgresql",
    tcp_port: 5432,
    host: {
      hostname: plan.databaseHostname,
      resolver_network: { tunnel_id: plan.tunnelId },
    },
    tls_settings: { cert_verification_mode: "verify_full" },
  };
  const hyperdrive = {
    id: "abcdefabcdefabcdefabcdefabcdefab",
    name: `smartspec-production-database-${planDigest.slice(0, 12)}`,
    origin: {
      service_id: service.service_id,
      database: plan.databaseName,
      user: plan.databaseUser,
      scheme: "postgres",
    },
    caching: { disabled: true },
    origin_connection_limit: 5,
  };
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ service_id: service.service_id }))
    .mockResolvedValueOnce(response(service))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ id: hyperdrive.id }))
    .mockResolvedValueOnce(response(hyperdrive));
  const runtime: CloudflareProductionDatabaseRuntime = {
    db: {} as never,
    fetchImpl,
    resolveTarget: vi.fn(async () => target),
    resolveGrant: vi.fn(async () => ({ grant, databasePassword })),
    withCredential: vi.fn(async (_project, _tenant, _ref, operation) =>
      operation("cloudflare-token-long-enough-for-tests")
    ),
    checkpoint: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
  };
  const context = {
    jobId,
    tenantId,
    projectId,
    requestedByUserId: 9,
    jobType: CLOUDFLARE_PRODUCTION_DATABASE_JOB,
    contractVersion: CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT,
    attempt: 1,
    createdAt: new Date().toISOString(),
    retryPolicy: {
      maxAttempts: 2,
      baseDelayMs: 2_000,
      maxDelayMs: 5_000,
      jitter: "bounded",
      deadlineMs: 12 * 60_000,
      allowedErrorClasses: ["retryable"],
    },
    input: {
      contractVersion: CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT,
      projectId,
      targetId: target.targetId,
      environment: "production",
      grantRef: grant.grantRef,
      planDigest,
    },
  };
  const lease = {
    jobId,
    tenantId,
    attempt: 1,
    attemptId: "attempt-1",
    ownerToken: "owner",
    fencingVersion: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const reporter = { assertActive: vi.fn(async () => undefined) };
  const controlPlane = {
    getStatus: vi.fn(async () => ({
      status: "running",
      attempt: 1,
      lease: {
        active: true,
        stale: false,
        expiresAt: lease.expiresAt,
        fencingVersion: 2,
      },
    })),
  };
  return {
    runtime,
    context,
    lease,
    reporter,
    controlPlane,
    fetchImpl,
    grant,
    databasePassword,
    run: () =>
      createCloudflareProductionDatabaseExecutor(runtime)({
        context,
        lease,
        reporter,
        controlPlane,
      } as never),
  };
}

describe("canonical Cloudflare production database job", () => {
  it("executes only the exact job grant and returns a sanitized provider receipt", async () => {
    const f = fixture();
    const result = await f.run();
    expect(f.fetchImpl).toHaveBeenCalledTimes(7);
    expect(f.reporter.assertActive).toHaveBeenCalled();
    expect(result.output).toMatchObject({
      providerConfigurationVerified: true,
      workerBound: false,
      activation: "disabled",
      jobId,
      grantRef: f.grant.grantRef,
      projectId,
      targetId: target.targetId,
    });
    expect(JSON.stringify(result)).not.toContain(f.databasePassword);
    expect(JSON.stringify(result)).not.toContain(
      "cloudflare-token-long-enough-for-tests"
    );
  });

  it("fails before provider access when the canonical attempt does not hold a live fence", async () => {
    const f = fixture();
    f.controlPlane.getStatus.mockResolvedValue({
      status: "running",
      attempt: 1,
      lease: {
        active: false,
        stale: true,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        fencingVersion: 1,
      },
    } as never);
    await expect(f.run()).rejects.toThrow(
      "CLOUDFLARE_PRODUCTION_DATABASE_LEASE_EXPIRED"
    );
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it("does not create VPC or Hyperdrive resources when the selected Tunnel is unhealthy", async () => {
    const f = fixture();
    f.fetchImpl.mockReset();
    f.fetchImpl.mockResolvedValueOnce(response({ id: plan.tunnelId, status: "inactive" }));
    await expect(f.run()).rejects.toThrow(
      "CLOUDFLARE_PRODUCTION_DATABASE_TUNNEL_NOT_HEALTHY"
    );
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
