export type MigrationAttemptReceipt = Record<string, unknown>;
export type MigrationAttemptDecision = "START" | "RESUME_STALE" | "RETRY_FAILED" | "ALREADY_SUCCEEDED" | "ALREADY_FAILED" | "IN_PROGRESS" | "IDEMPOTENCY_CONFLICT";

/** Deterministic retry policy for a stable migration idempotency key. */
export function evaluateMigrationAttempt(input: {
  receipts: MigrationAttemptReceipt[];
  payload: { environment: string; databaseTargetId: string; sourceSha: string; expectedMigrationHead: string | null; requestedMigrationSet: string[] };
  now?: Date;
  staleAfterMs?: number;
}): MigrationAttemptDecision {
  const start = [...input.receipts].filter(receipt => receipt.phase === "STARTED")
    .sort((a, b) => Date.parse(String(a.startedAt ?? "")) - Date.parse(String(b.startedAt ?? ""))).at(-1);
  if (!start) return input.receipts.length ? "IDEMPOTENCY_CONFLICT" : "START";
  const samePayload = start.environment === input.payload.environment && start.databaseTargetId === input.payload.databaseTargetId &&
    start.sourceSha === input.payload.sourceSha && start.expectedMigrationHead === input.payload.expectedMigrationHead &&
    JSON.stringify(start.requestedMigrationSet) === JSON.stringify(input.payload.requestedMigrationSet);
  if (!samePayload) return "IDEMPOTENCY_CONFLICT";
  const startTime = Date.parse(String(start.startedAt));
  const settled = input.receipts.filter(receipt => receipt.phase === "SETTLED" &&
    Date.parse(String(receipt.completedAt ?? "")) >= startTime)
    .sort((a, b) => Date.parse(String(a.completedAt ?? "")) - Date.parse(String(b.completedAt ?? "")))[0];
  if (settled) return settled.result === "SUCCEEDED" || settled.result === "RECOVERED" ? "ALREADY_SUCCEEDED" : settled.result === "FAILED" || settled.result === "INTERRUPTED" ? "RETRY_FAILED" : "ALREADY_FAILED";
  const startedAt = typeof start.startedAt === "string" ? Date.parse(start.startedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) return "IDEMPOTENCY_CONFLICT";
  return (input.now ?? new Date()).getTime() - startedAt >= (input.staleAfterMs ?? 15 * 60_000) ? "RESUME_STALE" : "IN_PROGRESS";
}
