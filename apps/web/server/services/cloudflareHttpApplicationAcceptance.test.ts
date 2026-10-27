import { describe, expect, it, vi } from "vitest";
import { createHttpApplicationAcceptanceFixtures, removeHttpApplicationAcceptanceFixtures } from "./cloudflareHttpApplicationAcceptance";

const scope = { jobId: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-primary", projectId: "project", actorUserId: 17 };
const plan = { m1JobId: "22222222-2222-4222-8222-222222222222", foreignTestTenantId: "tenant-codex-123456abcdef", evidenceDigest: "a".repeat(64) };

function fixtureDb() {
  const calls: string[] = [];
  const tx = { execute: vi.fn(async (query: any) => {
    const statement = String(query?.queryChunks?.map((chunk: any) => chunk?.value?.join?.("") ?? "").join("") ?? query);
    calls.push(statement);
    if (statement.includes("FROM tenants")) return [
      { id: scope.tenantId, ownerId: scope.actorUserId, isActive: true },
      { id: plan.foreignTestTenantId, ownerId: scope.actorUserId, isActive: false },
    ];
    if (statement.includes("INSERT INTO users")) return [{ id: 901 }];
    if (statement.includes("DELETE FROM users")) return [{ id: 901 }];
    return [];
  }) };
  const db = { transaction: async (fn: (transaction: any) => Promise<unknown>) => fn(tx) } as any;
  return { db, tx, calls };
}

describe("synthetic Cloudflare application acceptance fixtures", () => {
  it("creates one exact primary-tenant user, persists credentials through the transaction callback, and removes only that user", async () => {
    const { db, tx, calls } = fixtureDb(), persist = vi.fn(async () => {});
    const fixture = await createHttpApplicationAcceptanceFixtures(db, scope, plan, persist);
    expect(fixture.users).toHaveLength(1);
    expect(fixture.primary).toMatchObject({ tenantId: scope.tenantId, email: /^m3-accept-[a-f0-9]{16}-a@example\.invalid$/ });
    expect(fixture.primary.password).toHaveLength(46);
    expect(fixture.foreignTenantId).toBe(plan.foreignTestTenantId);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0][0]).toBeDefined();
    expect(calls.filter(statement => statement.includes("INSERT INTO users"))).toHaveLength(1);
    expect(calls.some(statement => statement.includes("credit_transactions"))).toBe(false);

    const result = await removeHttpApplicationAcceptanceFixtures(db, scope, fixture.users);
    expect(result.removed).toBe(1);
    expect(calls.filter(statement => statement.includes("DELETE FROM users"))).toHaveLength(1);
    await expect(removeHttpApplicationAcceptanceFixtures(db, scope, [{ ...fixture.users[0], tenantId: plan.foreignTestTenantId }]))
      .rejects.toThrow("HTTP_APPLICATION_FIXTURE_SCOPE_INVALID");
    expect(tx.execute).toHaveBeenCalled();
  });

  it("fails closed if either tenant is not owner-matched and active/inactive as expected", async () => {
    const { db, tx } = fixtureDb();
    tx.execute.mockImplementation(async (query: any) => String(query).includes("FROM tenants")
      ? [{ id: scope.tenantId, ownerId: 99, isActive: true }, { id: plan.foreignTestTenantId, ownerId: 17, isActive: false }] : []);
    await expect(createHttpApplicationAcceptanceFixtures(db, scope, plan)).rejects.toThrow("HTTP_APPLICATION_FIXTURE_SCOPE_INVALID");
  });
});
