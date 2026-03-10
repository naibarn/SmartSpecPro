export const browserPolicyMigrationPlan = {
  additiveOnly: true,
  ddlOwner: "raw_sql",
  partitionedTables: ["browser_policy_decisions"],
  maintenance: {
    primary: "pg_partman",
    fallback: "celery_beat",
  },
} as const;

export function evaluateBrowserPolicyPartitionReadiness(input: {
  hasCurrentPartition: boolean;
  hasFuturePartition: boolean;
  retentionHealthy: boolean;
}): { ready: boolean; failures: string[] } {
  const failures: string[] = [];

  if (!input.hasCurrentPartition) {
    failures.push("current_partition_missing");
  }

  if (!input.hasFuturePartition) {
    failures.push("future_partition_missing");
  }

  if (!input.retentionHealthy) {
    failures.push("retention_drift_detected");
  }

  return {
    ready: failures.length === 0,
    failures,
  };
}
