import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() },
  plane: { getContext: vi.fn(), claim: vi.fn(), start: vi.fn(), complete: vi.fn(), heartbeat: vi.fn(), assertActive: vi.fn() },
  resolve: vi.fn(), execute: vi.fn(), prepareMedia: vi.fn(),
}));
vi.mock("../db", () => ({ db: mocks.db, getDb: () => mocks.db }));
vi.mock("../services/appRuntimeConfig", () => ({ compareCachedInternalToken: () => false }));
vi.mock("../services/jobControlPlane", () => ({ createJobControlPlane: () => mocks.plane, recordAuthenticatedJobCallback: vi.fn() }));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: vi.fn() }));
vi.mock("../services/cloudflareMediaProbe", () => ({ prepareCloudflareMediaProbe: mocks.prepareMedia }));
vi.mock("../services/jobExecutorRegistry", () => ({ defaultJobExecutorRegistry: { resolve: mocks.resolve } }));
vi.mock("../../drizzle/schema", () => ({ workerJobs: {}, workerJobDispatches: {}, workerJobAttempts: {} }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), asc: vi.fn(), desc: vi.fn(), eq: vi.fn(), sql: vi.fn() }));

const envelope = {
  job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
  dispatch_id: "dispatch-1", dedupe_key: "job:job-1:attempt:1", routing_metadata: {},
};
const claim = { jobId: "job-1", attemptId: "attempt-1", leaseToken: "test-lease", fencingVersion: 1 };
const context = {
  jobId: "job-1", tenantId: "tenant-a", attempt: 1, contractVersion: "feature-186-v1",
  jobType: "emergency.report.intake", executionClass: "short", input: { reportId: "report-1", tenantId: "tenant-a" },
};
let row: Record<string, unknown>;
let app: express.Express;
const send = (action: string, extra: Record<string, unknown> = {}) => request(app)
  .post(`/api/internal/cloudflare-job-control/${action}`)
  .set("x-cloudflare-control-plane-token", "test-control-plane-token")
  .send({ jobId: "job-1", envelope, ...extra });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_CONTROL_PLANE_TOKEN", "test-control-plane-token");
  vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "tenant-a");
  vi.stubEnv("CLOUDFLARE_WORKFLOW_EXPIRES_AT", new Date(Date.now() + 60_000).toISOString());
  row = { ...context, requestedByUserId: 7, runtimeType: "node_job_worker", status: "running", operatorReviewRequired: false,
    dispatchId: envelope.dispatch_id, dispatchAttemptId: null, dispatchDedupeKey: envelope.dedupe_key,
    dispatchAdapter: "cloudflare-workflows", publicationStatus: "published", publishedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) };
  mocks.db.select.mockImplementation(() => {
    const chain = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn(async () => [row]) };
    chain.from.mockReturnValue(chain); chain.innerJoin.mockReturnValue(chain); chain.where.mockReturnValue(chain);
    return chain;
  });
  mocks.plane.getContext.mockResolvedValue(context);
  mocks.plane.claim.mockResolvedValue({ ...claim, expiresAt: "" });
  mocks.plane.start.mockResolvedValue(undefined);
  mocks.plane.complete.mockResolvedValue(undefined);
  mocks.plane.heartbeat.mockResolvedValue(undefined);
  mocks.plane.assertActive.mockResolvedValue(undefined);
  mocks.resolve.mockReturnValue({ executionClass: "short", executor: mocks.execute });
  mocks.execute.mockResolvedValue({ output: { reportId: "report-1", status: "triage" } });
  const { registerJobControlPlaneRoutes } = await import("./jobControlPlane");
  app = express(); app.use(express.json()); registerJobControlPlaneRoutes(app);
});
afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare canonical job boundary", () => {
  it("prepares an owned media reference through the same claimed boundary without invoking a Node business executor", async () => {
    const input = { taskName: "app.tasks.media_job_worker.execute_media_job", taskImportPath: "app.tasks.media_job_worker.execute_media_job",
      args: [JSON.stringify({ jobId: "external-1", jobType: "probe", inputs: { assets: [{ uri: "r2://uploads/7/input.wav" }] } }), "7", "external-1"], kwargs: {}, queue: null, legacyUserId: "7" };
    Object.assign(row, { runtimeType: "python_job_worker", jobType: "python.legacy_task", executionClass: "long", input });
    const prepared = { mediaSource: { tenantId: "tenant-a", userId: 7, objectKey: "uploads/7/input.wav" } };
    mocks.prepareMedia.mockResolvedValue(prepared);
    expect((await send("execute", { claim }).expect(200)).body).toEqual(prepared);
    expect(mocks.prepareMedia).toHaveBeenCalledWith(row, expect.objectContaining(claim), mocks.plane);
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
    input.taskImportPath = "app.tasks.arbitrary";
    await send("execute", { claim }).expect(409); expect(mocks.prepareMedia).toHaveBeenCalledOnce();
  });

  it("executes Queue intake only under the exact selected transport, preserving the tenant fence", async () => {
    row.dispatchAdapter = "cloudflare-queues";
    await send("execute", { claim }).expect(409);
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TRANSPORT", "queues");
    await send("execute", { claim }).expect(200);
    row.tenantId = "tenant-b";await send("execute", { claim }).expect(409);
    row.tenantId = "tenant-a";vi.stubEnv("CLOUDFLARE_WORKFLOW_TRANSPORT", "unknown");
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it.each(["context", "claim", "execute", "complete", "fail"])("requires its dedicated credential for %s", async action => {
    await request(app).post(`/api/internal/cloudflare-job-control/${action}`)
      .set("x-internal-token", "test-control-plane-token").send({ jobId: "job-1", envelope, claim }).expect(401);
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["cloudflare-queues", "cloudflare-workflows"])("accepts the real node runtime with published %s delivery", async adapter => {
    row.dispatchAdapter = adapter;
    await send("context").expect(200);
    await send("claim").expect(200);
    expect(mocks.plane.claim).toHaveBeenCalledWith(expect.objectContaining({ adapter, runnerId: expect.stringMatching(new RegExp(`^${adapter}:`)) }));
  });

  it.each([
    { runtimeType: "cloudflare" }, { runtimeType: "external_agent" }, { dispatchAdapter: "postgres-pull" },
    { publicationStatus: "pending" }, { publishedAt: null }, { dispatchAttemptId: "another-attempt" },
  ])("rejects incompatible or unpublished dispatches: %j", async change => {
    Object.assign(row, change);
    await send("context").expect(409);
    await send("claim").expect(409);
    await send("complete", { claim, result: {} }).expect(409);
    expect(mocks.plane.complete).not.toHaveBeenCalled();
  });

  it("preserves the actual executor result when settling a valid dispatch", async () => {
    const result = { resultRef: "reports/report-1", output: { status: "triage", count: 1 } };
    await send("complete", { claim, result }).expect(200);
    expect(mocks.plane.complete).toHaveBeenCalledWith(expect.objectContaining(claim), result);
  });

  it("continues execution and settlement after claim marks the dispatch consumed", async () => {
    row.publicationStatus = "consumed";
    row.consumedAt = new Date();
    await send("execute", { claim }).expect(200);
    await send("complete", { claim, result: { output: { status: "triage" } } }).expect(200);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.plane.complete).toHaveBeenCalledOnce();
  });

  it("cannot replay an old initial dispatch as a newer business attempt", async () => {
    row.attempt = 2;
    await send("claim", { envelope: { ...envelope, business_attempt: 2 } }).expect(409);
    expect(mocks.plane.claim).not.toHaveBeenCalled();
  });

  it("rejects superseded business attempts at completion", async () => {
    row.attempt = 2;
    await send("complete", { claim, result: {} }).expect(409);
    expect(mocks.plane.complete).not.toHaveBeenCalled();
  });

  it("rejects missing and oversized results instead of silently recording an empty output", async () => {
    await send("complete", { claim }).expect(400);
    await send("complete", { claim, result: { output: { text: "x".repeat(32 * 1024) } } }).expect(400);
    expect(mocks.plane.complete).not.toHaveBeenCalled();
  });

  it("executes the registered intake handler with canonical context and an active fenced lease", async () => {
    const response = await send("execute", { claim }).expect(200);
    expect(mocks.plane.heartbeat).toHaveBeenCalledWith(expect.objectContaining(claim));
    expect(mocks.plane.assertActive).toHaveBeenCalledWith(expect.objectContaining(claim));
    expect(mocks.resolve).toHaveBeenCalledWith("emergency.report.intake", "feature-186-v1");
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ context, lease: expect.objectContaining(claim), controlPlane: mocks.plane }));
    expect(response.body).toEqual({ result: { output: { reportId: "report-1", status: "triage" } } });
    expect(mocks.plane.complete).not.toHaveBeenCalled();
  });

  it.each([
    { jobType: "database.backup" }, { runtimeType: "python_job_worker" }, { attempt: 2 },
    { executionClass: "long" }, { operatorReviewRequired: true }, { status: "succeeded" },
    { leaseExpiresAt: new Date(0) }, { leaseExpiresAt: null }, { dispatchAdapter: "cloudflare-queues" },
  ])("never executes unallowlisted, stale or terminal work: %j", async change => {
    Object.assign(row, change);
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant business payload even with a valid transport credential", async () => {
    mocks.plane.getContext.mockResolvedValue({ ...context, input: { reportId: "report-1", tenantId: "tenant-b" } });
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not admit another tenant or an unconfigured deployment scope", async () => {
    row.tenantId = "tenant-b";
    await send("context").expect(409);
    await send("claim").expect(409);
    await send("execute", { claim }).expect(409);
    row.tenantId = "tenant-a";
    vi.stubEnv("CLOUDFLARE_WORKFLOW_TENANT_ID", "");
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a stale lease before dispatching business work", async () => {
    mocks.plane.assertActive.mockRejectedValue(Object.assign(new Error("stale"), { code: "JOB_LEASE_STALE" }));
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a registry entry with a different execution class", async () => {
    mocks.resolve.mockReturnValue({ executionClass: "long", executor: mocks.execute });
    await send("execute", { claim }).expect(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not report success when the lease is superseded during execution", async () => {
    mocks.plane.assertActive.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("stale"), { code: "JOB_LEASE_STALE" }));
    await send("execute", { claim }).expect(409);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
