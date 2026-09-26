export type EconomicSettlementStatus =
  "pending" | "settled" | "reconciliation_required" | "reversed";

export type EconomicSettlementRecord = {
  id: string;
  tenantId: string;
  holdId: string;
  idempotencyKey: string;
  status: EconomicSettlementStatus;
  capturedMinorUnits: number;
  currency: string;
  reasonCode?: string;
  replayed?: boolean;
};

export class EconomicSettlementError extends Error {
  readonly code: "SETTLEMENT_TERMINAL" | "SETTLEMENT_RECEIPT_REQUIRED";

  constructor(
    code: "SETTLEMENT_TERMINAL" | "SETTLEMENT_RECEIPT_REQUIRED",
    message = code
  ) {
    super(message);
    this.name = "EconomicSettlementError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function settleEconomicReceipt(
  record: EconomicSettlementRecord,
  input: {
    receiptVerified: boolean;
    externalStatus?: "succeeded" | "unknown" | "failed";
  }
): EconomicSettlementRecord {
  if (record.status === "settled") return { ...record, replayed: true };
  if (record.status === "reversed")
    throw new EconomicSettlementError("SETTLEMENT_TERMINAL");
  if (input.externalStatus === "unknown") {
    return {
      ...record,
      status: "reconciliation_required",
      reasonCode: "EXTERNAL_STATUS_UNKNOWN",
      replayed: false,
    };
  }
  if (!input.receiptVerified)
    throw new EconomicSettlementError("SETTLEMENT_RECEIPT_REQUIRED");
  if (input.externalStatus === "failed") {
    return {
      ...record,
      status: "reconciliation_required",
      reasonCode: "EXTERNAL_RECEIPT_FAILED",
      replayed: false,
    };
  }
  return { ...record, status: "settled", replayed: false };
}
