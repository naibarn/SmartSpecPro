/**
 * Errors shared by credit settlement boundaries.
 *
 * Credit ledger failures must never be presented as an account-balance
 * failure. The database driver often wraps the PostgreSQL error several
 * levels deep, so keep a small, dependency-free extractor here for retry,
 * logging, and classification decisions.
 */

type ErrorLike = {
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  table?: unknown;
  column?: unknown;
  schema?: unknown;
  message?: unknown;
  cause?: unknown;
};

const CREDIT_TRANSACTION_DESCRIPTION_MAX_LENGTH = 512;
const CREDIT_DESCRIPTION_TRUNCATION_SUFFIX = "… [truncated]";

export type CreditDatabaseErrorDetails = {
  code: string | null;
  constraint: string | null;
  detail: string | null;
  table: string | null;
  column: string | null;
  schema: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Keep the human-readable ledger column within its PostgreSQL varchar(512)
 * contract. Callers can still keep the full prompt/context in metadata.
 */
export function normalizeCreditTransactionDescription(
  description: unknown
): string {
  const value = typeof description === "string" ? description : String(description ?? "");
  if (value.length <= CREDIT_TRANSACTION_DESCRIPTION_MAX_LENGTH) return value;
  const prefixLength =
    CREDIT_TRANSACTION_DESCRIPTION_MAX_LENGTH -
    CREDIT_DESCRIPTION_TRUNCATION_SUFFIX.length;
  return `${Array.from(value).slice(0, prefixLength).join("")}${CREDIT_DESCRIPTION_TRUNCATION_SUFFIX}`;
}

function isPostgresSqlState(value: string): boolean {
  return /^[0-9A-Z]{5}$/.test(value);
}

/** Read the first useful PostgreSQL field from an Error/cause chain. */
export function extractCreditDatabaseErrorDetails(
  error: unknown
): CreditDatabaseErrorDetails {
  const details: CreditDatabaseErrorDetails = {
    code: null,
    constraint: null,
    detail: null,
    table: null,
    column: null,
    schema: null,
  };
  let current: unknown = error;
  const visited = new Set<unknown>();
  for (
    let depth = 0;
    depth < 6 && current && !visited.has(current);
    depth += 1
  ) {
    visited.add(current);
    if (typeof current !== "object") break;
    const candidate = current as ErrorLike;
    const candidateCode = asString(candidate.code);
    if (
      candidateCode &&
      (!details.code ||
        details.code === "INTERNAL_SERVER_ERROR" ||
        details.code === "CREDIT_LEDGER_WRITE_FAILED") &&
      (isPostgresSqlState(candidateCode) || !details.code)
    ) {
      details.code = candidateCode;
    }
    details.constraint ??= asString(candidate.constraint);
    details.detail ??= asString(candidate.detail);
    details.table ??= asString(candidate.table);
    details.column ??= asString(candidate.column);
    details.schema ??= asString(candidate.schema);
    current = candidate.cause;
  }
  return details;
}

export function creditErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = asString((error as ErrorLike).message);
    if (message) return message;
  }
  return String(error ?? "Unknown credit billing error");
}

export class CreditLedgerPersistenceError extends Error {
  readonly code = "CREDIT_LEDGER_WRITE_FAILED" as const;
  readonly operation: string;
  readonly database: CreditDatabaseErrorDetails;

  constructor(operation: string, cause: unknown) {
    super(`CREDIT_LEDGER_WRITE_FAILED: ${operation}`, { cause });
    this.name = "CreditLedgerPersistenceError";
    this.operation = operation;
    this.database = extractCreditDatabaseErrorDetails(cause);
  }
}

/**
 * These PostgreSQL classes indicate a transaction/connection that is safe to
 * retry. The settlement transaction is idempotent by runId, so retrying it
 * cannot create a second charge.
 */
export function isRetryableCreditDatabaseError(error: unknown): boolean {
  const details = extractCreditDatabaseErrorDetails(error);
  if (
    new Set([
      "40001", // serialization_failure
      "40P01", // deadlock_detected
      "08000",
      "08001",
      "08003",
      "08004",
      "08006",
      "08007",
      "08P01",
      "53300", // too_many_connections
      "57014", // query_canceled / statement timeout
      "57P01",
      "57P02", // admin_shutdown / crash_shutdown
    ]).has(details.code ?? "")
  )
    return true;

  const message = creditErrorMessage(error).toLowerCase();
  return /(?:connection (?:terminated|reset|closed| refused)|deadlock detected|could not serialize|too many clients|connection timed out|statement timeout)/i.test(
    message
  );
}

/** Identify a database/driver failure without mislabeling domain errors. */
export function isCreditDatabaseError(error: unknown): boolean {
  const details = extractCreditDatabaseErrorDetails(error);
  if (
    details.code ||
    details.constraint ||
    details.detail ||
    details.table ||
    details.column
  )
    return true;
  return /(?:failed query|postgres|database|relation .* does not exist|constraint|connection|serialization|deadlock|timeout)/i.test(
    creditErrorMessage(error)
  );
}

export function isInsufficientCreditError(error: unknown): boolean {
  const message = creditErrorMessage(error);
  return (
    /(?:insufficient credits|not enough credits|credit balance is too low)/i.test(
      message
    ) &&
    !/credit_transactions|skill_revenue_settlements|credit ledger/i.test(
      message
    )
  );
}
