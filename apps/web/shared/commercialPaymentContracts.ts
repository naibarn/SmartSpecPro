/** Versioned, provider-neutral boundary between SPEC-280 commerce and SPEC-207 economics. */
export const COMMERCIAL_PAYMENT_CONTRACT_VERSION =
  "commercial-payment/v1" as const;

export type PaymentRail = "credits" | "fiat_payg" | "x402" | "mpp";
export type PaymentOutcome =
  "authorized" | "declined" | "unknown" | "captured" | "released" | "refunded";

export interface CommercialAllocationSnapshot {
  readonly policyVersion: string;
  readonly allocations: readonly {
    beneficiaryRef: string;
    amountMinor: number;
  }[];
}

/** Immutable price + beneficiary result produced by SPEC-280. Amounts use minor units. */
export interface CommercialSnapshot {
  readonly version: 1;
  readonly snapshotId: string;
  readonly taskId: string;
  readonly tenantRef: string;
  readonly payerRef: string;
  readonly serviceRef: string;
  readonly priceBookVersion: string;
  readonly currency: string;
  readonly maxAmountMinor: number;
  readonly allocation: CommercialAllocationSnapshot;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PaymentRequest {
  readonly contractVersion: typeof COMMERCIAL_PAYMENT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly invocationId: string;
  readonly snapshot: CommercialSnapshot;
  readonly rail: PaymentRail;
  /** Ordered, server-selected adapter ids. Never accepted from an untrusted client. */
  readonly providerRoute?: readonly string[];
  readonly maxAmountMinor: number;
  readonly allowOverdraft: boolean;
  readonly overdraftLimitMinor: number;
  readonly checkpoint?: {
    readonly sequence: number;
    readonly reference: string;
  };
}

export interface PaymentAuthorization {
  readonly authorizationId: string;
  readonly requestId: string;
  readonly providerRef: string;
  readonly rail: PaymentRail;
  readonly amountMinor: number;
  readonly currency: string;
  readonly outcome: Extract<
    PaymentOutcome,
    "authorized" | "declined" | "unknown"
  >;
  readonly fencingToken: number;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
}

export interface UsageReceipt {
  readonly version: 1;
  readonly receiptId: string;
  readonly taskId: string;
  readonly invocationId: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly meter: string;
  readonly unit: string;
  readonly quantity: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly sourceAttemptRef: string;
  readonly evidenceRef: string;
  readonly occurredAt: string;
}

export interface Settlement {
  readonly settlementId: string;
  readonly taskId: string;
  readonly authorizationId: string;
  readonly usageReceiptIds: readonly string[];
  readonly capturedMinor: number;
  readonly releasedMinor: number;
  readonly currency: string;
  readonly allocation: CommercialAllocationSnapshot;
  readonly ledgerPostingRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly settledAt: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: string;
  readonly supportedRails: readonly PaymentRail[];
  authorize(
    request: PaymentRequest,
    fencingToken: number
  ): Promise<PaymentAuthorization>;
  lookup(authorization: PaymentAuthorization): Promise<PaymentAuthorization>;
  capture(
    authorization: PaymentAuthorization,
    receipts: readonly UsageReceipt[],
    idempotencyKey: string
  ): Promise<{
    outcome: "captured" | "unknown";
    capturedMinor: number;
    providerRef: string;
  }>;
  reconcileCapture(
    authorization: PaymentAuthorization,
    receipts: readonly UsageReceipt[],
    idempotencyKey: string
  ): Promise<{
    outcome: "captured" | "declined" | "unknown";
    capturedMinor: number;
    providerRef: string;
  }>;
  release(
    authorization: PaymentAuthorization,
    idempotencyKey: string
  ): Promise<{ outcome: "released" | "unknown" }>;
  reconcileRelease(
    authorization: PaymentAuthorization,
    idempotencyKey: string
  ): Promise<{ outcome: "released" | "declined" | "unknown" }>;
  refund(
    settlement: Settlement,
    amountMinor: number,
    idempotencyKey: string
  ): Promise<{ outcome: "refunded" | "unknown"; amountMinor: number }>;
  reconcileRefund(
    settlement: Settlement,
    amountMinor: number,
    idempotencyKey: string
  ): Promise<{
    outcome: "refunded" | "declined" | "unknown";
    amountMinor: number;
  }>;
}

export function assertCommercialSnapshot(snapshot: CommercialSnapshot): void {
  if (
    snapshot.version !== 1 ||
    !snapshot.snapshotId ||
    !snapshot.taskId ||
    !snapshot.tenantRef ||
    !snapshot.payerRef
  ) {
    throw new Error("Invalid commercial snapshot identity");
  }
  if (
    !Number.isSafeInteger(snapshot.maxAmountMinor) ||
    snapshot.maxAmountMinor < 0
  )
    throw new Error("Invalid commercial snapshot maximum");
  if (!/^[A-Z]{3,8}$/.test(snapshot.currency))
    throw new Error("Invalid commercial snapshot currency");
  const allocated = snapshot.allocation.allocations.reduce((sum, item) => {
    if (
      !item.beneficiaryRef ||
      !Number.isSafeInteger(item.amountMinor) ||
      item.amountMinor < 0
    )
      throw new Error("Invalid commercial allocation");
    return sum + item.amountMinor;
  }, 0);
  if (!snapshot.allocation.policyVersion)
    throw new Error("Missing revenue allocation policy version");
  if (
    new Set(snapshot.allocation.allocations.map(item => item.beneficiaryRef))
      .size !== snapshot.allocation.allocations.length
  )
    throw new Error("Duplicate commercial allocation beneficiary");
  if (allocated > snapshot.maxAmountMinor)
    throw new Error("Commercial allocation exceeds task maximum");
}
