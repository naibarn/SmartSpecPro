import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ evidence: vi.fn(), grant: vi.fn(), inspect: vi.fn() }));
vi.mock("./cloudflareProductionDatabaseReconciliation", () => ({ readProductionDatabaseReadbackObservation: mock.evidence }));
vi.mock("./cloudflareProductionDatabaseRecovery", () => ({ inspectProductionDatabaseRecovery: mock.inspect }));
vi.mock("./cloudflareProductionDatabaseExecutor", () => ({ CLOUDFLARE_PRODUCTION_DATABASE_JOB: "cloudflare.production.database.provision",
  CLOUDFLARE_PRODUCTION_DATABASE_CONTRACT: "cloudflare-prod-db-provision-v1", createCloudflareProductionDatabaseRuntime: () => ({ resolveGrant: mock.grant }) }));
import { readHttpDatabaseNetwork } from "./cloudflareHttpDatabaseNetwork";
const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 1 };
function fixture() {
  mock.evidence.mockResolvedValue({ acceptance: "M1_ACCEPTED", tenantIsolationVerified: true, databaseConnectionVerified: true,
    vpcServiceId: "accepted-vpc", hyperdriveId: "accepted-hyperdrive" });
  mock.grant.mockResolvedValue({ grant: { requesterUserId: 1, plan: { databaseHostname: "db.smartaihub.app", vpcTcpPort: 5433,
    tunnelId: "existing-tunnel", tlsVerification: "verify_full", databaseName: "fixture" } } });
  mock.inspect.mockResolvedValue({ vpcServiceId: "accepted-vpc", hyperdriveId: "accepted-hyperdrive", providerReadbackVerified: true });
  return { execute: vi.fn(async () => [{ id: "existing-job", requestedByUserId: 1, inputJson: { planDigest: "d".repeat(64) } }]) };
}
beforeEach(() => vi.resetAllMocks());
describe("native runtime reuses canonical accepted production database network", () => {
  it("reconciles actual existing resources without another Hyperdrive, Access app, DNS or grant", async () => {
    const db = fixture(), result = await readHttpDatabaseNetwork(db as any, scope);
    expect(result).toMatchObject({ canonicalJobId: "existing-job", vpcServiceId: "accepted-vpc", hyperdriveId: "accepted-hyperdrive",
      transport: "private-vpc-websocket-v1", dnsRequired: false, accessApplicationRequired: false, applicationRoleRequired: true });
    expect(mock.inspect).toHaveBeenCalledWith(expect.objectContaining({ tenantId: scope.tenantId, projectId: scope.projectId, requesterUserId: 1, jobId: "existing-job" }));
  });
  it("never treats provisioning success or readback alone as independent M1 acceptance", async () => {
    const db = fixture(); mock.evidence.mockResolvedValue({ acceptance: "NOT_ACCEPTED" });
    await expect(readHttpDatabaseNetwork(db as any, scope)).rejects.toThrow("ACCEPTED_DATABASE_REQUIRED");
    expect(mock.grant).not.toHaveBeenCalled(); expect(mock.inspect).not.toHaveBeenCalled();
  });
  it("rejects another Owner's checkpoint", async () => {
    const db = fixture(); mock.grant.mockResolvedValue({ grant: { requesterUserId: 2 } });
    await expect(readHttpDatabaseNetwork(db as any, scope)).rejects.toThrow("SCOPE_DENIED");
    expect(mock.inspect).not.toHaveBeenCalled();
  });
  it("rejects changed provider IDs while preserving existing resources", async () => {
    const db = fixture(); mock.inspect.mockResolvedValue({ vpcServiceId: "foreign", hyperdriveId: "accepted-hyperdrive" });
    await expect(readHttpDatabaseNetwork(db as any, scope)).rejects.toThrow("RESOURCE_CHANGED");
  });
});
