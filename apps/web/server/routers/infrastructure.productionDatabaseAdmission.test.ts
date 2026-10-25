import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  resolveTarget: vi.fn(),
  getCredentialState: vi.fn(),
  readGrant: vi.fn(),
  saveGrant: vi.fn(),
  renewGrant: vi.fn(),
  createJob: vi.fn(),
  recoverJob: vi.fn(),
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
  renewCloudflareProductionDatabaseGrant: mocks.renewGrant,
}));
vi.mock("../services/jobControlPlane", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/jobControlPlane")>()),
  createJobControlPlane: () => ({ recoverReviewGatedJob: mocks.recoverJob }),
}));
vi.mock("../services/jobControlPlaneGateway", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/jobControlPlaneGateway")>()),
  createControlPlaneJob: mocks.createJob,
}));

import { infrastructureRouter } from "./infrastructure";
import { validateJobDefinition } from "../services/jobCanonicalization";
import { systemSettings, workerJobDispatches, workerJobOutbox, workerJobs } from "../../drizzle/schema";

const tenantId = "tenant-ZCSKEM9s";
const projectId = "2fe8a309-8be6-4370-9813-8fb9cc4645a0";
const tunnelId = "191d047e-674a-48f4-b105-b37269c2dad6";
const submissionId = "55555555-5555-4555-8555-555555555555";
const target = { targetId: "smartspec-cloudflare-runtime", credentialRef: "credential-ref", accountRef: "a".repeat(32) };

function setup() {
  const jobs = new Map<string, Record<string, unknown>>();
  const grants = new Map<string, Record<string, unknown>>();
  const rowsForWhere = (table: unknown, condition: any) => {
    if (table === workerJobOutbox) return Array.from(outboxes.values());
    if (table === workerJobDispatches) return [];
    if (table === systemSettings) return [];
    const values: unknown[] = [];
    let filtersByJobId = false;
    const visit = (chunk: any) => {
      if (!chunk || typeof chunk !== "object") return;
      if (Array.isArray(chunk)) return chunk.forEach(visit);
      if (chunk.constructor?.name === "Param") values.push(chunk.value);
      if (chunk.name === "id" && chunk.table) filtersByJobId = true;
      if (Array.isArray(chunk.queryChunks)) chunk.queryChunks.forEach(visit);
    };
    visit(condition);
    if (filtersByJobId) {
      const requestedJobId = values.find(value => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value));
      const exactJob = requestedJobId ? jobs.get(requestedJobId) : null;
      return exactJob ? [exactJob] : [];
    }
    return Array.from(jobs.values());
  };
  const outboxes = new Map<string, Record<string, unknown>>();
  const db = {
    select: vi.fn(() => ({ from: vi.fn((table: unknown) => ({ where: vi.fn((condition: any) => {
      const rows = rowsForWhere(table, condition);
      return Object.assign(Promise.resolve(rows), {
        limit: async () => rows,
        orderBy: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }),
      });
    }) })) })),
  };
  mocks.getDb.mockResolvedValue(db);
  mocks.resolveTarget.mockResolvedValue(target);
  mocks.getCredentialState.mockResolvedValue({ status: "CONFIGURED" });
  mocks.readGrant.mockImplementation(async (_db, jobId: string) => grants.get(jobId) ?? null);
  mocks.saveGrant.mockImplementation(async (_db, grant: Record<string, unknown>) => {
    grants.set(grant.jobId as string, grant);
  });
  mocks.renewGrant.mockImplementation(async input => ({
    ...grants.get(input.jobId), grantRef: input.replacementGrantRef, expiresAt: input.expiresAt,
  }));
  mocks.recoverJob.mockResolvedValue(true);
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
  const submit = (requestId = submissionId) => caller.prepareCloudflareProductionDatabase({
    tenantId, projectId, environment: "production", tunnelId, submissionId: requestId,
  });
  return { db, jobs, grants, outboxes, caller, submit };
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

  it("submits a production database contract accepted by the canonical job definition validator", async () => {
    const f = setup();
    mocks.createJob.mockImplementationOnce(async (input: any) => {
      expect(() => validateJobDefinition({
        ...input.definition,
        tenantId: input.context.tenantId,
        requestedByUserId: input.context.actorId,
        idempotencyKey: input.context.idempotencyKey,
      })).not.toThrow();
      const jobId = input.createOptions.canonicalJobId as string;
      f.jobs.set(jobId, { id: jobId, jobType: input.definition.jobType,
        contractVersion: input.definition.contractVersion, requestedByUserId: input.context.actorId,
        status: "queued", inputJson: input.definition.input });
      return { jobId, created: true };
    });

    await expect(f.submit()).resolves.toMatchObject({ jobId: submissionId, status: "queued" });
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

  it("reconciles an active job before creating a grant for a different submission ID", async () => {
    const f = setup();
    await f.submit();
    await expect(f.submit("66666666-6666-4666-8666-666666666666"))
      .resolves.toMatchObject({ jobId: submissionId, status: "queued" });
    expect(f.grants).toHaveProperty("size", 1);
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

  it("renews authority and resumes the exact quarantined job only after proving no provider write began", async () => {
    const f = setup();
    const jobId = "77777777-7777-4777-8777-777777777777";
    const planDigest = "a".repeat(64);
    const originalGrantRef = "88888888-8888-4888-8888-888888888888";
    f.jobs.set(jobId, { id: jobId, tenantId, projectId, jobType: "cloudflare.production.database.provision",
      contractVersion: "cloudflare-prod-db-provision-v1", requestedByUserId: 91, status: "expired",
      errorCode: "JOB_DEADLINE_EXPIRED", operatorReviewRequired: true, operatorReviewReason: "adapter_contract_unsupported",
      attempt: 1, maxAttempts: 2, startedAt: null, heartbeatAt: null, fencingVersion: 0,
      inputJson: { projectId, targetId: "smartspec-cloudflare-runtime", environment: "production", planDigest, grantRef: originalGrantRef } });
    f.grants.set(jobId, { jobId, grantRef: originalGrantRef, tenantId, projectId, requesterUserId: 91,
      targetId: "smartspec-cloudflare-runtime", environment: "production", accountRef: target.accountRef,
      plan: { tunnelId }, planDigest, expiresAt: new Date(Date.now() - 60_000).toISOString(), revokedAt: null });
    f.outboxes.set("outbox-1", { workerJobId: jobId, envelopeVersion: "cloudflare-prod-db-provision-v1",
      publishedAt: null, quarantinedAt: new Date(), failedReason: "adapter_contract_unsupported" });

    await expect(f.caller.resumeExpiredCloudflareProductionDatabaseJob({ tenantId, projectId, jobId, tunnelId, environment: "production" }))
      .resolves.toMatchObject({ jobId, status: "queued", attempt: 2, planDigest });
    expect(mocks.renewGrant).toHaveBeenCalledWith(expect.objectContaining({
      db: expect.anything(), jobId, requesterUserId: 91, expectedGrantRef: originalGrantRef, replacementGrantRef: jobId,
    }));
    expect(mocks.recoverJob).toHaveBeenCalledWith(jobId, jobId, expect.any(String), expect.objectContaining({
      knownRuntime: "cloudflare_production_database_dispatch_quarantine", replacementGrantRef: jobId,
    }), 91, expect.objectContaining({ authorizationScope: "infrastructure.cloudflare_production_database_recover" }));
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});
