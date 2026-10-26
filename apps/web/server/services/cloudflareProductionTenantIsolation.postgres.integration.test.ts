import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildProductionTenantIsolationPolicy } from "./cloudflareProductionTenantIsolation";
import { probeProductionTenantIsolation } from "../../../cloudflare/src/productionTenantIsolationProbe";
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("M1 immutable role/tenant RLS in disposable PostgreSQL", () => {
  let disposable: any, owner: any, runtime: any, legacy: any;
  const role = "sah_cf_prod_0123456789ab", tenantId = "tenant-a", foreignTestTenantId = "tenant-codex-123456abcdef";
  const fixture = { tenantId, foreignTestTenantId, reportA: randomUUID(), reportB: randomUUID(), caseA: randomUUID(), caseB: randomUUID() };
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    const postgres = (await import("postgres")).default;
    owner = postgres(disposable.databaseUrl, { max: 2 });
    await owner.unsafe(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE legacy_linux_fixture LOGIN NOSUPERUSER;
      CREATE TABLE emergency_reports(id text PRIMARY KEY,"tenantId" text NOT NULL,status text);
      CREATE TABLE emergency_cases(id text PRIMARY KEY,"tenantId" text NOT NULL,revision integer DEFAULT 0);
      CREATE TABLE emergency_case_events("caseId" text NOT NULL,"tenantId" text NOT NULL,"eventHash" text);
      GRANT USAGE ON SCHEMA public TO ${role},legacy_linux_fixture;
      GRANT SELECT ON emergency_reports,emergency_cases,emergency_case_events TO ${role},legacy_linux_fixture;
      GRANT UPDATE(status) ON emergency_reports TO ${role};
      GRANT INSERT("caseId","tenantId","eventHash") ON emergency_case_events TO ${role};`);
    for (const [t, r, c] of [[tenantId,fixture.reportA,fixture.caseA],[foreignTestTenantId,fixture.reportB,fixture.caseB]]) {
      await owner`INSERT INTO emergency_reports VALUES(${r},${t},'closed')`;
      await owner`INSERT INTO emergency_cases(id,"tenantId") VALUES(${c},${t})`;
      await owner`INSERT INTO emergency_case_events VALUES(${c},${t},'synthetic')`;
    }
    const runtimeUrl = new URL(disposable.databaseUrl); runtimeUrl.username = role;
    runtime = postgres(runtimeUrl.toString(), { max: 1 });
    const legacyUrl = new URL(disposable.databaseUrl); legacyUrl.username = "legacy_linux_fixture";
    legacy = postgres(legacyUrl.toString(), { max: 1 });
  }, 30_000);
  afterAll(async () => { for (const db of [runtime,legacy,owner]) if (db) await db.end({ timeout: 3 }); if (disposable) await disposable.close(); }, 20_000);
  it("detects the real pre-fix missing database isolation, then passes all four contexts with the restrictive policy", async () => {
    expect((await probeProductionTenantIsolation(runtime, fixture)).passed).toBe(false);
    const plan = buildProductionTenantIsolationPolicy({ role, tenantId, planDigest: "a".repeat(64) });
    for (const statement of plan.statements) await owner.unsafe(statement);
    const observed = await probeProductionTenantIsolation(runtime, fixture);
    expect(observed.passed).toBe(true); expect(observed.checks).toHaveLength(4);
    expect(observed.checks.every(check => check.tables.length === 3 && check.passed)).toBe(true);
    expect(await runtime`SELECT "tenantId" FROM emergency_reports`).toHaveLength(0); // pooled context did not leak
    expect(await legacy`SELECT id FROM emergency_reports`).toHaveLength(2); // prior Linux privileges preserved
    expect(await owner`SELECT id FROM emergency_reports`).toHaveLength(2);
  });
  it("rejects cross-tenant writes, cannot switch to an owner role, and cannot disable RLS", async () => {
    await expect(runtime.begin(async (tx: any) => {
      await tx`SELECT set_config('smartspec.tenant_id',${tenantId},true)`;
      await tx`INSERT INTO emergency_case_events VALUES(${fixture.caseB},${foreignTestTenantId},'must-not-write')`;
    })).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.unsafe(`SET ROLE ${disposable.username ?? "spec277_autoteam_test"}`)).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.unsafe('ALTER TABLE emergency_reports DISABLE ROW LEVEL SECURITY')).rejects.toMatchObject({ code: "42501" });
    expect(await owner`SELECT * FROM emergency_case_events`).toHaveLength(2);
  });
  it("does not widen a role even when another permissive policy is added later", async () => {
    await owner.unsafe(`CREATE POLICY another_permissive ON emergency_reports USING(true)`);
    await runtime.begin(async (tx: any) => {
      await tx`SELECT set_config('smartspec.tenant_id',${tenantId},true)`;
      const own = await tx`SELECT "tenantId" FROM emergency_reports`;
      expect(own).toEqual([{tenantId}]);
    });
  });
  it("rejects malformed tenant/role scopes before producing SQL", () => {
    expect(() => buildProductionTenantIsolationPolicy({role,tenantId:"x'; SELECT 1;--",planDigest:"a".repeat(64)})).toThrow("SCOPE_INVALID");
    expect(() => buildProductionTenantIsolationPolicy({role:"smartspec",tenantId,planDigest:"a".repeat(64)})).toThrow("SCOPE_INVALID");
  });
});
