import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appendEvent: vi.fn(), inspect: vi.fn() }));
vi.mock("./jobControlPlane", () => ({ appendJobEvent: mocks.appendEvent }));
vi.mock("./cloudflareProductionDatabaseRecovery", () => ({ inspectProductionDatabaseRecovery: mocks.inspect }));
import { productionDatabaseEvidenceDigest, projectProductionDatabaseReadbackObservation, reconcileProductionDatabaseReadback } from "./cloudflareProductionDatabaseReconciliation";
function fixture() {
  const inputJson = { projectId: "project", targetId: "smartspec-cloudflare-runtime", environment: "production", planDigest: "a".repeat(64), grantRef: "original-grant" };
  const job = { id: "original-job", tenantId: "tenant", requestedByUserId: 17, jobType: "cloudflare.production.database.provision",
    contractVersion: "cloudflare-prod-db-provision-v1", status: "failed", attempt: 4, maxAttempts: 4, fencingVersion: 3,
    leaseExpiresAt: null, errorCode: "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH", inputJson };
  let current = job;
  const rows = () => ({ from: () => ({ where: () => ({ limit: async () => [job], for: async () => [current] }) }) });
  const db = { select: vi.fn(rows), transaction: vi.fn(async fn => fn({ select: rows })) };
  const grant = { grantRef: inputJson.grantRef, requesterUserId: 17, accountRef: "b".repeat(32),
    plan: { databaseName: "smartspec", databaseUser: "sah_cf_prod_0123456789ab" } };
  const runtime = { resolveGrant: vi.fn(async () => ({ grant })) };
  return { job, grant, db, runtime, changeCurrent: (next: typeof job) => { current = next; },
    input: { db: db as any, runtime: runtime as any, jobId: job.id, tenantId: job.tenantId, projectId: "project" } };
}
beforeEach(() => { vi.resetAllMocks(); mocks.inspect.mockResolvedValue({ jobId: "original-job", planDigest: "a".repeat(64),
  vpcServiceId: "existing-vpc", hyperdriveId: "existing-hyperdrive", providerReadbackVerified: true, databaseConnectionVerified: false }); });
describe("Production database read-only canonical reconciliation", () => {
  it("appends immutable readback evidence without changing the failed job, grant, attempts or dispatch", async () => {
    const f = fixture(), before = JSON.stringify(f.job);
    const result = await reconcileProductionDatabaseReadback(f.input);
    expect(result).toMatchObject({ canonicalEvidenceRecorded: true, originalStatus: "failed", originalAttempt: 4,
      providerReadOnly: true, provisioningAttemptConsumed: false, grantRenewed: false, acceptance: "NOT_ACCEPTED" });
    const payload = mocks.appendEvent.mock.calls[0][1].payloadJson;
    const { evidenceDigest, ...evidence } = payload;
    expect(evidenceDigest).toBe(productionDatabaseEvidenceDigest(evidence));
    expect(mocks.appendEvent.mock.calls[0][1].eventType).toBe("PRODUCTION_DATABASE_READBACK_RECONCILED");
    expect(JSON.stringify(f.job)).toBe(before);
    expect(f.db).not.toHaveProperty("update"); expect(f.db).not.toHaveProperty("insert");
    const scope = { jobId: f.job.id, tenantId: f.job.tenantId, projectId: "project", planDigest: "a".repeat(64) };
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    expect(projectProductionDatabaseReadbackObservation(reordered, scope)).toMatchObject({ providerReadbackVerified: true, databaseConnectionVerified: false });
    expect(projectProductionDatabaseReadbackObservation({ ...payload, tenantId: "foreign" }, scope)).toBeNull();
    expect(projectProductionDatabaseReadbackObservation({ ...payload, providerReadbackVerified: false }, scope)).toBeNull();
  });
  it.each(["actor", "project", "job_type", "contract", "attempt", "error", "lease", "grant"])("rejects changed %s identity before provider reads", async change => {
    const f = fixture();
    if (change === "actor") Object.assign(f.input, { actorUserId: 18 });
    if (change === "project") f.input.projectId = "foreign";
    if (change === "job_type") f.job.jobType = "unrelated";
    if (change === "contract") f.job.contractVersion = "old";
    if (change === "attempt") f.job.attempt = 5;
    if (change === "error") f.job.errorCode = "CF2015";
    if (change === "lease") Object.assign(f.job, { leaseExpiresAt: new Date() });
    if (change === "grant") f.grant.grantRef = "foreign";
    await expect(reconcileProductionDatabaseReadback(f.input)).rejects.toThrow("CLOUDFLARE_");
    expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
  it("does not record on provider mismatch, missing Hyperdrive or a concurrent job change", async () => {
    const f = fixture(); mocks.inspect.mockRejectedValueOnce(Error("READBACK_MISMATCH"));
    await expect(reconcileProductionDatabaseReadback(f.input)).rejects.toThrow("READBACK_MISMATCH");
    mocks.inspect.mockResolvedValueOnce({ hyperdriveId: undefined });
    await expect(reconcileProductionDatabaseReadback(f.input)).rejects.toThrow("HYPERDRIVE_REQUIRED");
    f.changeCurrent({ ...f.job, fencingVersion: 4 });
    await expect(reconcileProductionDatabaseReadback(f.input)).rejects.toThrow("JOB_CHANGED");
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
  it("records service-observed SQL separately without claiming tenant isolation or provisioning success", async () => {
    const f = fixture();
    const observation = { runtime: "cloudflare-remote-preview", colo: "CDG", cfRay: "a5085730dfb7d477-CDG",
      diagnosticBundleDigest: `sha256:${"c".repeat(64)}`, observedAt: new Date().toISOString(), planDigest: "a".repeat(64),
      vpcServiceId: "01a175b0-3c44-7131-8805-2cd56db223ac", hyperdriveId: "db6b46010af44ad381dd6e3e2674913a",
      sql: "PASS", database: f.grant.plan.databaseName, role: f.grant.plan.databaseUser, readOnly: true,
      restrictedRoleVerified: true, deniedSchemaAccessVerified: true, backendSsl: false,
      tenantIsolation: "NOT_VERIFIED_NO_AUTHORIZED_FIXTURES", businessRowsRead: 0, businessWrites: 0 };
    mocks.inspect.mockResolvedValue({ jobId: f.job.id, planDigest: "a".repeat(64), vpcServiceId: observation.vpcServiceId,
      hyperdriveId: observation.hyperdriveId, providerReadbackVerified: true, databaseConnectionVerified: false });
    const result = await reconcileProductionDatabaseReadback({ ...f.input, sqlObservation: observation });
    expect(result).toMatchObject({ acceptance: "NOT_ACCEPTED", originalStatus: "failed", sqlObservation: { sql: "PASS" } });
    await expect(reconcileProductionDatabaseReadback({ ...f.input, actorUserId: 17, sqlObservation: observation })).rejects.toThrow("SQL_OBSERVATION_SCOPE_DENIED");
    await expect(reconcileProductionDatabaseReadback({ ...f.input, sqlObservation: { ...observation, role: "superuser" } })).rejects.toThrow("SQL_OBSERVATION_SCOPE_DENIED");
    await expect(reconcileProductionDatabaseReadback({ ...f.input, sqlObservation: { ...observation, observedAt: new Date(Date.now() - 16 * 60_000).toISOString() } })).rejects.toThrow("SQL_OBSERVATION_SCOPE_DENIED");
  });
});
