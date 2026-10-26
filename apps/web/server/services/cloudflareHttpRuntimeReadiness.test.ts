import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTP_CANDIDATE_CONTRACT, HTTP_CANDIDATE_JOB } from "./cloudflareHttpCandidateContract";

const mock = vi.hoisted(() => ({ owner: vi.fn(), resolve: vi.fn(), verify: vi.fn(), credential: vi.fn() }));
vi.mock("./cloudflareHttpDatabaseNetwork", () => ({ readHttpDatabaseNetwork: vi.fn(async () => ({ transport: "private-vpc-websocket-v1", dnsRequired: false, accessApplicationRequired: false })) }));
vi.mock("./cloudflareHttpCandidatePreparation", () => ({ assertHttpCandidateOwner: mock.owner, resolveHttpCandidatePackage: mock.resolve }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareDeploymentCredential: mock.credential }));
vi.mock("./cloudflareHttpCandidateReadback", async original => ({ ...(await original<any>()), verifyHttpCandidateProviderReceipt: mock.verify }));
import { getHttpRuntimeReadiness } from "./cloudflareHttpRuntimeReadiness";

const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 1 };
function fixture() {
  const receipt = { schemaVersion: "cloudflare-production-native-preparation-receipt-v1", accountRef: "a".repeat(32),
    workerName: `smartspec-production-${"b".repeat(12)}-candidate`, deploymentId: "00000000-0000-4000-8000-000000000001",
    versionId: "00000000-0000-4000-8000-000000000002", workerSourceSha: "c".repeat(40), imageSourceSha: "d".repeat(40), manifestDigest: "e".repeat(64),
    applications: ["node", "python"].map((runtime, index) => ({ applicationId: String(index + 1).repeat(32), namespaceId: String(index + 1).repeat(32),
      name: runtime, images: { [runtime]: "fixture-image" } })),
    containerStarts: 0, runtimeConfigured: false, runtimeAcceptance: false, dnsMutation: false, trafficMutation: false, m2Preserved: true };
  const job = { ...scope, requestedByUserId: 1, jobType: HTTP_CANDIDATE_JOB, contractVersion: HTTP_CANDIDATE_CONTRACT,
    status: "succeeded", operatorReviewRequired: false, inputJson: { projectId: scope.projectId }, outputJson: receipt };
  const db = { execute: vi.fn().mockResolvedValueOnce([job]).mockResolvedValueOnce([]) };
  mock.resolve.mockResolvedValue({ target: { accountRef: receipt.accountRef, credentialRef: "fixture-credential" },
    packet: { config: { name: receipt.workerName }, manifestDigest: receipt.manifestDigest, imageSourceSha: receipt.imageSourceSha } });
  mock.verify.mockResolvedValue({ verified: true, runtimeBindingsConfigured: false, runtimeAcceptance: false });
  mock.credential.mockImplementation(async (_db, _identity, operation) => ({ status: "CONFIGURED", value: await operation("private-fixture-token") }));
  const fetch = vi.fn(async (url: any, init: any) => {
    expect(init.method).toBe("GET");
    if (String(url).endsWith("/zones/9acd8fe46851607de0919f2b6a462911")) return Response.json({ success: true,
      result: { id: "9acd8fe46851607de0919f2b6a462911", name: "smartaihub.app", account: { id: receipt.accountRef } } });
    return String(url).includes("/dns_records") ? Response.json({ success: false, errors: [{ code: 10000, message: "private provider detail" }] }, { status: 403 })
      : Response.json({ success: true, result: [], result_info: { total_pages: 1 } });
  });
  vi.stubGlobal("fetch", fetch);
  return { job, receipt, db, fetch };
}
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("successful native Candidate runtime inspection", () => {
  it("reports exact connector blockers and sanitized DNS permission evidence without a write or Container start", async () => {
    const f = fixture(), result = await getHttpRuntimeReadiness(f.db as any, scope, "exact-job");
    expect(result).toMatchObject({ candidateJobId: "exact-job", ready: false, runtimeAcceptance: false, activationAuthorized: false,
      providerMutations: 0, databaseMutations: 0, containerStarts: 0 });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PRODUCTION_DATABASE_DNS", status: "UNVERIFIED", required: false, http: 403, providerCodes: [10000], permission: expect.stringContaining("DNS · Read") }),
      expect.objectContaining({ code: "PRODUCTION_DATABASE_ACCESS_CONNECTOR", status: "MISSING" }),
      expect.objectContaining({ code: "APPLICATION_DATABASE_ROLE", status: "MISSING" }),
    ]));
    expect(f.db.execute).toHaveBeenCalledTimes(2); expect(f.fetch).toHaveBeenCalledTimes(3);
    expect(result.databaseNetwork).toMatchObject({ dnsRequired: false, accessApplicationRequired: false });
    expect(JSON.stringify(result)).not.toContain("DNS · Edit");
    expect(JSON.stringify(result)).not.toMatch(/private-fixture-token|private provider detail/);
  });
  it.each(["tenant", "owner", "project", "contract", "status", "review"])("rejects a mismatched %s before provider credential access", async kind => {
    const f = fixture();
    if (kind === "tenant") f.job.tenantId = "foreign";
    if (kind === "owner") f.job.requestedByUserId = 2;
    if (kind === "project") f.job.inputJson.projectId = "foreign";
    if (kind === "contract") f.job.contractVersion = "foreign";
    if (kind === "status") f.job.status = "running";
    if (kind === "review") f.job.operatorReviewRequired = true;
    await expect(getHttpRuntimeReadiness(f.db as any, scope, "exact-job")).rejects.toThrow("JOB_DENIED");
    expect(mock.credential).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("preserves real Owner authorization before any registry read", async () => {
    const f = fixture(); mock.owner.mockRejectedValueOnce(Error("OWNER_SCOPE_DENIED"));
    await expect(getHttpRuntimeReadiness(f.db as any, scope, "exact-job")).rejects.toThrow("OWNER_SCOPE_DENIED");
    expect(f.db.execute).not.toHaveBeenCalled();
  });
  it("rejects a substituted immutable manifest before any credential access", async () => {
    const f = fixture(); f.receipt.manifestDigest = "f".repeat(64);
    await expect(getHttpRuntimeReadiness(f.db as any, scope, "exact-job")).rejects.toThrow("RECEIPT_DENIED");
    expect(mock.credential).not.toHaveBeenCalled();
  });
  it("treats incomplete Access inventory as unknown rather than a missing or ready connector", async () => {
    const f = fixture(), original = f.fetch.getMockImplementation()!;
    f.fetch.mockImplementation(async (url, init) => String(url).endsWith("/zones/9acd8fe46851607de0919f2b6a462911") ? original(url, init)
      : Response.json({ success: true, result: [], result_info: { total_pages: 2 } }));
    const result = await getHttpRuntimeReadiness(f.db as any, scope, "exact-job");
    expect(result.checks.find(c => c.code === "PRODUCTION_DATABASE_ACCESS_CONNECTOR")?.status).toBe("UNVERIFIED");
    expect(result.ready).toBe(false);
  });
  it("rejects a wrong authoritative zone/account rather than recommending broader permissions", async () => {
    const f = fixture(); f.fetch.mockImplementation(async () => Response.json({ success: true, result: {
      id: "9acd8fe46851607de0919f2b6a462911", name: "foreign.example", account: { id: "f".repeat(32) } } }));
    await expect(getHttpRuntimeReadiness(f.db as any, scope, "exact-job")).rejects.toThrow("ZONE_IDENTITY_DENIED");
  });
});
