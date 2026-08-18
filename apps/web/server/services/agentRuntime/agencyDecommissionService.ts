export type AgencyMigrationState =
  | "active"
  | "frozen"
  | "exporting"
  | "parity_review"
  | "migrated"
  | "read_only_archived"
  | "migration_required";

export interface AgencyMigrationRecord {
  agencyId: string;
  tenantId: string;
  state: AgencyMigrationState;
  sourceChecksum: string;
  exportedChecksum?: string | null;
  creditOutcomeReconciled: boolean;
  activeExecutionCount: number;
  updatedAt: string;
}

export function assertAgencyExecutionFrozen(input: {
  originSurface?: string | null;
  migrationState?: AgencyMigrationState | null;
}): void {
  if ((input.originSurface ?? "").toLowerCase() === "agency")
    throw new Error("agency_origin_forbidden");
  if (input.migrationState === "active")
    throw new Error("agency_execution_frozen");
}

export function advanceAgencyMigration(
  record: AgencyMigrationRecord,
  input: {
    exportedChecksum?: string;
    creditOutcomeReconciled?: boolean;
    activeExecutionCount?: number;
  }
): AgencyMigrationRecord {
  const next = { ...record, ...input, updatedAt: new Date().toISOString() };
  if (next.activeExecutionCount > 0)
    return { ...next, state: "migration_required" };
  if (!next.exportedChecksum) return { ...next, state: "exporting" };
  if (
    next.exportedChecksum !== next.sourceChecksum ||
    !next.creditOutcomeReconciled
  )
    return { ...next, state: "parity_review" };
  return { ...next, state: "read_only_archived" };
}
