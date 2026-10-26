import type { HyperdriveSqlClient } from "./hyperdrive";

export type ProductionTenantIsolationFixtures = {
  tenantId: string; foreignTestTenantId: string; reportA: string; reportB: string; caseA: string; caseB: string;
};
export function validProductionTenantFixtures(value: ProductionTenantIsolationFixtures) {
  return /^[A-Za-z0-9_.-]{1,36}$/.test(value.tenantId) && /^tenant-codex-[a-z0-9-]+$/.test(value.foreignTestTenantId) && value.foreignTestTenantId.length <= 36 &&
    value.foreignTestTenantId !== value.tenantId && [value.reportA, value.reportB, value.caseA, value.caseB].every(id =>
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) && value.reportA !== value.reportB && value.caseA !== value.caseB;
}

/** Only exact synthetic fixture IDs from the Owner's preparation receipt. No
 * arbitrary SQL, tenant-wide scan, live business rows, writes, or local mode. */
export async function probeProductionTenantIsolation(client: HyperdriveSqlClient, scope: ProductionTenantIsolationFixtures) {
  if (!validProductionTenantFixtures(scope)) throw Error("M1_ISOLATION_FIXTURE_SCOPE_INVALID");
  const checks = [];
  for (const [label, context] of [["tenant-a", scope.tenantId], ["missing", ""], ["invalid", "invalid-context"],
    ["cross-tenant", scope.foreignTestTenantId]] as const) {
    const rows = await client.begin(async tx => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout = '5000ms'");
      await tx.unsafe("SELECT set_config('smartspec.tenant_id', $1, true)", [context]);
      const results = [];
      for (const [table, column, a, b] of [["emergency_reports", "id", scope.reportA, scope.reportB],
        ["emergency_cases", "id", scope.caseA, scope.caseB], ["emergency_case_events", "caseId", scope.caseA, scope.caseB]]) {
        const records = await tx.unsafe<Array<{ tenantId: string }>>(
          `SELECT "tenantId" FROM public."${table}" WHERE "${column}" IN ($1,$2) LIMIT 3`, [a, b]);
        const own = records.filter(row => row.tenantId === scope.tenantId).length;
        const foreign = records.filter(row => row.tenantId !== scope.tenantId).length;
        results.push({ table, own, foreign, passed: label === "tenant-a" ? own === 1 && foreign === 0 : own === 0 && foreign === 0 });
      }
      return results;
    });
    checks.push({ context: label, tables: rows, passed: rows.every(row => row.passed) });
  }
  return { schemaVersion: "cloudflare-production-tenant-isolation-probe-v1", ...scope, checks,
    passed: checks.every(check => check.passed), fixtureOnly: true, syntheticRowsWritten: 0, businessRowsRead: 0, businessWrites: 0 };
}
