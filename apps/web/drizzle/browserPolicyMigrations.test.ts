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
});
