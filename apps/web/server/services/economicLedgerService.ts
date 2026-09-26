import { and, eq } from "drizzle-orm";
import {
  economicJournalEntries,
  economicJournalLines,
  type InsertEconomicJournalEntryRow,
  type InsertEconomicJournalLineRow,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";

export type EconomicJournalLineInput = {
  accountId: string;
  tenantId: string;
  currency: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type EconomicJournalEntryInput = {
  tenantId: string;
  idempotencyKey: string;
  correlation?: { jobId?: string; attemptId?: string };
  description: string;
  lines: EconomicJournalLineInput[];
};

export type EconomicJournalEntryResult = {
  id: string;
  replayed: boolean;
  currency: string;
  totalMinorUnits: number;
};

export type EconomicLedgerErrorCode =
  | "LEDGER_UNBALANCED"
  | "LEDGER_CURRENCY_MISMATCH"
  | "LEDGER_TENANT_MISMATCH"
  | "LEDGER_LINE_INVALID"
  | "LEDGER_IDEMPOTENCY_INVALID";

export class EconomicLedgerError extends Error {
  readonly code: EconomicLedgerErrorCode;

  constructor(code: EconomicLedgerErrorCode, message = code) {
    super(message);
    this.name = "EconomicLedgerError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EconomicLedgerError("LEDGER_LINE_INVALID");
  }
}

export function assertBalancedJournalLines(lines: EconomicJournalLineInput[]): {
  currency: string;
  totalMinorUnits: number;
} {
  if (lines.length < 2) {
    throw new EconomicLedgerError("LEDGER_UNBALANCED");
  }

  const tenantId = lines[0]?.tenantId;
  const currency = lines[0]?.currency?.trim().toUpperCase();
  if (!tenantId || !currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new EconomicLedgerError("LEDGER_LINE_INVALID");
  }

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (line.tenantId !== tenantId) {
      throw new EconomicLedgerError("LEDGER_TENANT_MISMATCH");
    }
    if (line.currency.trim().toUpperCase() !== currency) {
      throw new EconomicLedgerError("LEDGER_CURRENCY_MISMATCH");
    }
    assertMinorUnits(line.debitMinorUnits);
    assertMinorUnits(line.creditMinorUnits);
    if (line.debitMinorUnits > 0 === line.creditMinorUnits > 0) {
      throw new EconomicLedgerError("LEDGER_LINE_INVALID");
    }
    debit += line.debitMinorUnits;
    credit += line.creditMinorUnits;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
      throw new EconomicLedgerError("LEDGER_LINE_INVALID");
    }
  }
  if (debit !== credit) {
    throw new EconomicLedgerError("LEDGER_UNBALANCED");
  }
  return { currency, totalMinorUnits: debit };
}

type LedgerTransaction = Pick<NonNullable<DrizzleDB>, "select" | "insert">;

export async function recordJournalEntry(
  tx: LedgerTransaction,
  input: EconomicJournalEntryInput
): Promise<EconomicJournalEntryResult> {
  if (
    !input.tenantId ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 200
  ) {
    throw new EconomicLedgerError("LEDGER_IDEMPOTENCY_INVALID");
  }
  const summary = assertBalancedJournalLines(input.lines);
  const existing = await (tx as any)
    .select()
    .from(economicJournalEntries)
    .where(
      and(
        eq(economicJournalEntries.tenantId, input.tenantId),
        eq(economicJournalEntries.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (existing[0]) {
    return { id: existing[0].id, replayed: true, ...summary };
  }

  const entryValues: InsertEconomicJournalEntryRow = {
    tenantId: input.tenantId,
    workerJobId: input.correlation?.jobId,
    attemptId: input.correlation?.attemptId,
    idempotencyKey: input.idempotencyKey,
    description: input.description,
    status: "posted",
  };
  const inserted = await (tx as any)
    .insert(economicJournalEntries)
    .values(entryValues)
    .returning({ id: economicJournalEntries.id });
  const entryId = inserted[0]?.id;
  if (!entryId) {
    throw new EconomicLedgerError(
      "LEDGER_IDEMPOTENCY_INVALID",
      "Journal entry insert did not return an id"
    );
  }

  const lineValues: InsertEconomicJournalLineRow[] = input.lines.map(line => ({
    tenantId: input.tenantId,
    entryId,
    accountId: line.accountId,
    currency: summary.currency,
    debitMinorUnits: line.debitMinorUnits,
    creditMinorUnits: line.creditMinorUnits,
  }));
  await (tx as any).insert(economicJournalLines).values(lineValues);
  return { id: entryId, replayed: false, ...summary };
}

export async function recordJournalEntryInTransaction(
  database: DrizzleDB,
  input: EconomicJournalEntryInput
): Promise<EconomicJournalEntryResult> {
  return database.transaction(tx => recordJournalEntry(tx, input));
}
