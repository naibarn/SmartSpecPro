import { randomUUID } from "node:crypto";

export type EconomicHoldStatus =
  | "held"
  | "partially_captured"
  | "captured"
  | "released"
  | "reconciliation_required";

export type EconomicHoldState = {
  id: string;
  tenantId: string;
  intentId: string;
  currency: string;
  amountMinorUnits: number;
  capturedMinorUnits: number;
  releasedMinorUnits: number;
  status: EconomicHoldStatus;
  replayed?: boolean;
  reasonCode?: string;
};

type EconomicControlPlaneErrorCode =
  | "RESERVE_INVALID"
  | "RESERVE_IDEMPOTENCY_CONFLICT"
  | "RECEIPT_REQUIRED"
  | "CAPTURE_EXCEEDS_HOLD"
  | "HOLD_TERMINAL"
  | "RELEASE_TERMINAL";

export class EconomicControlPlaneError extends Error {
  readonly code: EconomicControlPlaneErrorCode;

  constructor(code: EconomicControlPlaneErrorCode, message = code) {
    super(message);
    this.name = "EconomicControlPlaneError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type ReserveHoldInput = {
  tenantId: string;
  intentId: string;
  currency: string;
  amountMinorUnits: number;
  idempotencyKey: string;
};

const reserveReplay = new Map<
  string,
  { request: ReserveHoldInput; hold: EconomicHoldState }
>();

function assertAmount(amountMinorUnits: number): void {
  if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) {
    throw new EconomicControlPlaneError("RESERVE_INVALID");
  }
}

export function reserveHold(input: ReserveHoldInput): EconomicHoldState {
  const currency = input.currency.trim().toUpperCase();
  if (
    !input.tenantId ||
    !input.intentId ||
    !/^[A-Z]{3}$/.test(currency) ||
    input.idempotencyKey.length < 8
  ) {
    throw new EconomicControlPlaneError("RESERVE_INVALID");
  }
  assertAmount(input.amountMinorUnits);
  const previous = reserveReplay.get(
    `${input.tenantId}:${input.idempotencyKey}`
  );
  if (previous) {
    if (
      previous.request.intentId !== input.intentId ||
      previous.request.amountMinorUnits !== input.amountMinorUnits ||
      previous.request.currency.trim().toUpperCase() !== currency
    ) {
      throw new EconomicControlPlaneError("RESERVE_IDEMPOTENCY_CONFLICT");
    }
    return { ...previous.hold, replayed: true };
  }
  const hold: EconomicHoldState = {
    id: randomUUID(),
    tenantId: input.tenantId,
    intentId: input.intentId,
    currency,
    amountMinorUnits: input.amountMinorUnits,
    capturedMinorUnits: 0,
    releasedMinorUnits: 0,
    status: "held",
    replayed: false,
  };
  reserveReplay.set(`${input.tenantId}:${input.idempotencyKey}`, {
    request: input,
    hold,
  });
  return hold;
}

export type CaptureHoldInput = {
  amountMinorUnits: number;
  receiptVerified: boolean;
  receiptStatus?: "succeeded" | "pending" | "failed";
};

export function captureHold(
  hold: EconomicHoldState,
  input: CaptureHoldInput
): EconomicHoldState {
  if (hold.status === "released" || hold.status === "captured") {
    throw new EconomicControlPlaneError("HOLD_TERMINAL");
  }
  if (!input.receiptVerified) {
    throw new EconomicControlPlaneError("RECEIPT_REQUIRED");
  }
  if (input.receiptStatus === "pending") {
    return {
      ...hold,
      status: "reconciliation_required",
      reasonCode: "EXTERNAL_RECEIPT_PENDING",
    };
  }
  assertAmount(input.amountMinorUnits);
  const remaining =
    hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
  if (input.amountMinorUnits > remaining) {
    throw new EconomicControlPlaneError("CAPTURE_EXCEEDS_HOLD");
  }
  const capturedMinorUnits = hold.capturedMinorUnits + input.amountMinorUnits;
  return {
    ...hold,
    capturedMinorUnits,
    status:
      capturedMinorUnits === hold.amountMinorUnits
        ? "captured"
        : "partially_captured",
    replayed: false,
  };
}

export function releaseHold(hold: EconomicHoldState): EconomicHoldState {
  if (hold.status === "released") return { ...hold, replayed: true };
  if (hold.status === "captured") {
    throw new EconomicControlPlaneError("RELEASE_TERMINAL");
  }
  const remaining =
    hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
  return {
    ...hold,
    releasedMinorUnits: hold.releasedMinorUnits + remaining,
    status: "released",
    replayed: false,
  };
}
