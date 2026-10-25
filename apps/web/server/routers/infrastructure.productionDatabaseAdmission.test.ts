import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  resolveTarget: vi.fn(),
  getCredentialState: vi.fn(),
  readGrant: vi.fn(),
  saveGrant: vi.fn(),
  createJob: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: mocks.getDb }));
vi.mock("../services/cloudflareProductionDeploymentContract", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/cloudflareProductionDeploymentContract")>()),
  resolveCloudflareProductionDeploymentTarget: mocks.resolveTarget,
}));
vi.mock("../services/cloudflareCredentialCenter", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/cloudflareCredentialCenter")>()),
  getCloudflareDeploymentCredentialState: mocks.getCredentialState,
}));
vi.mock("../services/cloudflareProductionDatabaseExecutor", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/cloudflareProductionDatabaseExecutor")>()),
  readCloudflareProductionDatabaseGrant: mocks.readGrant,
  saveCloudflareProductionDatabaseGrant: mocks.saveGrant,
}));
vi.mock("../services/jobControlPlaneGateway", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/jobControlPlaneGateway")>()),
  createControlPlaneJob: mocks.createJob,
}));

import { infrastructureRouter } from "./infrastructure";

const tenantId = "tenant-ZCSKEM9s";
const projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";
const tunnelId = "191d047e-674a-48f4-b105-b37269c2dad6";
const submissionId = "55555555-5555-4555-8555-555555555555";
const target = { targetId: "smartspec-cloudflare-runtime", credentialRef: "credential-ref", accountRef: "a".repeat(32) };

function setup() {
  const jobs = new Map<string, Record<string, unknown>>();
  const grants = new Map<string, Record<string, unknown>>();
  const db = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({
      limit: vi.fn(async () => Array.from(jobs.values())),
    })) })) })),
  };
  mocks.getDb.mockResolvedValue(db);
  mocks.resolveTarget.mockResolvedValue(target);
  mocks.getCredentialState.mockResolvedValue({ status: "CONFIGURED" });
  mocks.readGrant.mockImplementation(async (_db, jobId: string) => grants.get(jobId) ?? null);
  mocks.saveGrant.mockImplementation(async (_db, grant: Record<string, unknown>) => {
    grants.set(grant.jobId as string, grant);
  });
  mocks.createJob.mockImplementation(async (input: any) => {
    const jobId = input.createOptions.canonicalJobId as string;
    jobs.set(jobId, { id: jobId, jobType: input.definition.jobType,
      contractVersion: input.definition.contractVersion, requestedByUserId: input.context.actorId,
      status: "queued", inputJson: input.definition.input });
    return { jobId, created: true };
  });
  const caller = infrastructureRouter.createCaller({
    user: { id: 91, role: "admin", currentTenantId: tenantId },
    tenantId,
    req: { requestId: "request-admission-test" },
  } as any);
  const submit = () => caller.prepareCloudflareProductionDatabase({
    tenantId, projectId, environment: "production", tunnelId, submissionId,
  });
  return { db, jobs, grants, caller, submit };
}

describe("Production database canonical admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the encrypted grant and verifies the canonical job before returning accepted", async () => {
    const f = setup();
    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued", targetId: target.targetId });
    expect(f.grants.size).toBe(1);
    expect(f.jobs.size).toBe(1);
    expect(mocks.createJob).toHaveBeenCalledOnce();
    expect(f.db.select).toHaveBeenCalled();
  });

  it("reconciles a Control Plane timeout after commit and preserves the valid grant", async () => {
    const f = setup();
    mocks.createJob.mockImplementationOnce(async (input: any) => {
      const jobId = input.createOptions.canonicalJobId as string;
      f.jobs.set(jobId, { id: jobId, jobType: input.definition.jobType,
        contractVersion: input.definition.contractVersion, requestedByUserId: input.context.actorId,
        status: "queued", inputJson: input.definition.input });
      throw new Error("socket timeout after transaction commit");
    });

    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued" });
    expect(f.jobs).toHaveProperty("size", 1);
    expect(f.grants).toHaveProperty("size", 1);
  });

  it("reuses the same submission grant and avoids duplicate job/grant writes", async () => {
    const f = setup();
    await f.submit();
    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued" });
    expect(mocks.saveGrant).toHaveBeenCalledOnce();
    expect(mocks.createJob).toHaveBeenCalledOnce();
  });

  it("retains a grant when admission is not confirmed and admits it on same-ID retry", async () => {
    const f = setup();
    mocks.createJob.mockRejectedValueOnce(new Error("database connection reset"));
    await expect(f.submit()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN",
    });
    expect(f.grants).toHaveProperty("size", 1);
    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued" });
    expect(mocks.saveGrant).toHaveBeenCalledOnce();
    expect(f.jobs).toHaveProperty("size", 1);
  });

  it("reuses a grant when persistence committed before the database call timed out", async () => {
    const f = setup();
    mocks.saveGrant.mockImplementationOnce(async (_db, grant: Record<string, unknown>) => {
      f.grants.set(grant.jobId as string, grant);
      throw new Error("database response lost after commit");
    });
    await expect(f.submit()).rejects.toMatchObject({ message: "CLOUDFLARE_PRODUCTION_DATABASE_ADMISSION_UNKNOWN" });
    expect(f.grants).toHaveProperty("size", 1);
    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued" });
    expect(mocks.saveGrant).toHaveBeenCalledOnce();
    expect(mocks.createJob).toHaveBeenCalledOnce();
  });

  it("does not touch the database for an unauthorized or wrong-tenant request", async () => {
    const f = setup();
    const unauthorized = infrastructureRouter.createCaller({
      user: { id: 92, role: "user", currentTenantId: tenantId }, tenantId,
    } as any);
    await expect(unauthorized.prepareCloudflareProductionDatabase({ tenantId, projectId, environment: "production", tunnelId, submissionId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.caller.prepareCloudflareProductionDatabase({ tenantId: "tenant-other", projectId, environment: "production", tunnelId, submissionId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects missing Production target or credential before grant/job creation", async () => {
    const f = setup();
    mocks.resolveTarget.mockResolvedValueOnce(null);
    await expect(f.submit()).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_TARGET_NOT_CONFIGURED" });
    mocks.resolveTarget.mockResolvedValue(target);
    mocks.getCredentialState.mockResolvedValueOnce({ status: "MISSING" });
    await expect(f.submit()).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "CLOUDFLARE_PRODUCTION_CREDENTIAL_NOT_CONFIGURED" });
    expect(mocks.saveGrant).not.toHaveBeenCalled();
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});
