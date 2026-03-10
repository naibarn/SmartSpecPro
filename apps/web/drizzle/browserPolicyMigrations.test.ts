import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  browserPolicyMigrationPlan,
  evaluateBrowserPolicyPartitionReadiness,
} from "./browserPolicyMigrationPlan";

describe("browser policy migrations", () => {
  it("keeps migration ownership additive and partition-aware", () => {
    expect(browserPolicyMigrationPlan.additiveOnly).toBe(true);
    expect(browserPolicyMigrationPlan.ddlOwner).toBe("raw_sql");
    expect(browserPolicyMigrationPlan.partitionedTables).toContain(
      "browser_policy_decisions",
    );
    expect(browserPolicyMigrationPlan.migrationTag).toBe(
      "0060_browser_policy_decision_partitions",
    );
    expect(browserPolicyMigrationPlan.maintenance.primary).toBe("pg_partman");
    expect(browserPolicyMigrationPlan.maintenance.fallback).toBe("celery_beat");
  });

  it("reports missing future partitions as a readiness failure", () => {
    expect(
      evaluateBrowserPolicyPartitionReadiness({
        hasCurrentPartition: true,
        hasFuturePartition: false,
        retentionHealthy: true,
      }),
    ).toEqual({
      ready: false,
      failures: ["future_partition_missing"],
    });
  });

  it("ships the raw SQL migration for the partitioned decision table", () => {
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      `${browserPolicyMigrationPlan.migrationTag}.sql`,
    );
    const sqlText = fs.readFileSync(migrationPath, "utf8");

    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "browser_policy_decisions"');
    expect(sqlText).toContain("PARTITION BY RANGE");
    expect(sqlText).toContain("pg_partman");
    expect(sqlText).toContain("browser_policy_decisions_2026_03");
    expect(sqlText).toContain("browser_policy_decisions_2026_04");
  });
});
