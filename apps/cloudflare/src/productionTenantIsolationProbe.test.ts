import { describe, expect, it, vi } from "vitest";
import { probeProductionTenantIsolation } from "./productionTenantIsolationProbe";
const scope = { tenantId: "tenant-a", foreignTestTenantId: "tenant-codex-123456abcdef",
  reportA: "11111111-1111-4111-8111-111111111111", reportB: "22222222-2222-4222-8222-222222222222",
  caseA: "33333333-3333-4333-8333-333333333333", caseB: "44444444-4444-4444-8444-444444444444" };
describe("bounded Cloudflare tenant fixture probe", () => {
  it("reads exactly the fixture IDs in four isolated read-only transactions", async () => {
    let context = "";
    const unsafe = vi.fn(async (query: string, args?: unknown[]) => {
      if (query.includes("set_config")) { context = String(args?.[0]); return []; }
      if (query.startsWith('SELECT "tenantId"')) return context === scope.tenantId ? [{ tenantId: scope.tenantId }] : [];
      return [];
    });
    const client = { unsafe, begin: vi.fn(async work => work({ unsafe })) };
    const result = await probeProductionTenantIsolation(client, scope);
    expect(result.passed).toBe(true); expect(client.begin).toHaveBeenCalledTimes(4);
    expect(unsafe.mock.calls.filter(([q]) => q === "SET TRANSACTION READ ONLY")).toHaveLength(4);
    const reads = unsafe.mock.calls.filter(([q]) => q.startsWith('SELECT "tenantId"'));
    expect(reads).toHaveLength(12);
    expect(reads.every(([q,args]) => q.includes("IN ($1,$2) LIMIT 3") && args?.length === 2)).toBe(true);
    expect(unsafe.mock.calls.some(([q]) => /INSERT|UPDATE|DELETE|ALTER|CREATE/.test(q))).toBe(false);
  });
  it("rejects a leak, missing own fixture, and invalid tenant/ID scope", async () => {
    const unsafe = vi.fn(async () => [{tenantId:scope.foreignTestTenantId}]);
    const client = {unsafe,begin:async work => work({unsafe})};
    expect((await probeProductionTenantIsolation(client,scope)).passed).toBe(false);
    unsafe.mockResolvedValue([]);
    expect((await probeProductionTenantIsolation(client,scope)).passed).toBe(false);
    unsafe.mockClear();
    await expect(probeProductionTenantIsolation(client,{...scope,reportB:"arbitrary"})).rejects.toThrow("FIXTURE_SCOPE_INVALID");
    expect(unsafe).not.toHaveBeenCalled();
  });
});
