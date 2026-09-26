import { randomUUID } from "node:crypto";

export type CurrencyCode = string;

export type MoneyInput = {
  minorUnits: number;
  currency: string;
};

export type Money = {
  minorUnits: number;
  currency: CurrencyCode;
};

export type EconomicContractErrorCode =
  | "ECONOMIC_MONEY_INVALID"
  | "ECONOMIC_TENANT_MISMATCH"
  | "ECONOMIC_ACTOR_MISMATCH"
  | "ECONOMIC_CORRELATION_REQUIRED"
  | "ECONOMIC_IDEMPOTENCY_INVALID";

export class EconomicContractError extends Error {
  constructor(
    public readonly code: EconomicContractErrorCode,
    message: string
  ) {
    super(message);
    this.name = "EconomicContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type EconomicAuthorityContext = {
  tenantId: string;
  actorId: string;
  actorType: "user" | "agent" | "system";
  policyVersion: string;
};

export type EconomicIntentRequest = {
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
  amount: MoneyInput;
  effectType: "workflow_run" | "tool_call" | "provider_charge";
  resourceRef: string;
  claimedTenantId?: string;
  claimedActorId?: string;
};

export type EconomicAdmissionInput = {
  context: EconomicAuthorityContext;
  request: EconomicIntentRequest;
  now?: Date;
};

export type EconomicIntent = {
  intentId: string;
  tenantId: string;
  actorId: string;
  actorType: EconomicAuthorityContext["actorType"];
  policyVersion: string;
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
  amount: Money;
  effectType: EconomicIntentRequest["effectType"];
  resourceRef: string;
  createdAt: string;
};

export type EconomicAdmissionResult = {
  intent: EconomicIntent;
  decision: {
    status: "accepted";
    reasonCode: "ECONOMIC_INTENT_ACCEPTED";
    policyVersion: string;
  };
};

const MAX_MINOR_UNITS = Number.MAX_SAFE_INTEGER;

function requireNonEmpty(
  value: string,
  code: EconomicContractErrorCode,
  label: string
): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new EconomicContractError(code, `${label} is required`);
  }
  return normalized;
}

export function createMoney(input: MoneyInput): Money {
  if (
    !Number.isSafeInteger(input.minorUnits) ||
    input.minorUnits < 0 ||
    input.minorUnits > MAX_MINOR_UNITS ||
    !/^[A-Za-z]{3}$/.test(input.currency.trim())
  ) {
    throw new EconomicContractError(
      "ECONOMIC_MONEY_INVALID",
      "Money must use non-negative safe integer minor units and a three-letter currency"
    );
  }

  return {
    minorUnits: input.minorUnits,
    currency: input.currency.trim().toUpperCase(),
  };
}

export function admitEconomicIntent(
  input: EconomicAdmissionInput
): EconomicAdmissionResult {
  const tenantId = requireNonEmpty(
    input.context.tenantId,
    "ECONOMIC_CORRELATION_REQUIRED",
    "tenantId"
  );
  const actorId = requireNonEmpty(
    input.context.actorId,
    "ECONOMIC_CORRELATION_REQUIRED",
    "actorId"
  );

  if (
    input.request.claimedTenantId !== undefined &&
    input.request.claimedTenantId !== tenantId
  ) {
    throw new EconomicContractError(
      "ECONOMIC_TENANT_MISMATCH",
      "Request tenant does not match server-derived tenant authority"
    );
  }

  if (
    input.request.claimedActorId !== undefined &&
    input.request.claimedActorId !== actorId
  ) {
    throw new EconomicContractError(
      "ECONOMIC_ACTOR_MISMATCH",
      "Request actor does not match server-derived actor authority"
    );
  }

  const jobId = input.request.jobId.trim();
  const attemptId = input.request.attemptId.trim();
  if (!jobId || !attemptId) {
    throw new EconomicContractError(
      "ECONOMIC_CORRELATION_REQUIRED",
      "Economic effects require a canonical Job and attempt correlation"
    );
  }

  const idempotencyKey = input.request.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new EconomicContractError(
      "ECONOMIC_IDEMPOTENCY_INVALID",
      "Economic idempotency keys must contain between 8 and 128 characters"
    );
  }

  const resourceRef = requireNonEmpty(
    input.request.resourceRef,
    "ECONOMIC_CORRELATION_REQUIRED",
    "resourceRef"
  );
  const policyVersion = requireNonEmpty(
    input.context.policyVersion,
    "ECONOMIC_CORRELATION_REQUIRED",
    "policyVersion"
  );

  const createdAt = (input.now ?? new Date()).toISOString();
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new EconomicContractError(
      "ECONOMIC_CORRELATION_REQUIRED",
      "Economic intent timestamp is invalid"
    );
  }

  return {
    intent: {
      intentId: randomUUID(),
      tenantId,
      actorId,
      actorType: input.context.actorType,
      policyVersion,
      jobId,
      attemptId,
      idempotencyKey,
      amount: createMoney(input.request.amount),
      effectType: input.request.effectType,
      resourceRef,
      createdAt,
    },
    decision: {
      status: "accepted",
      reasonCode: "ECONOMIC_INTENT_ACCEPTED",
      policyVersion,
    },
  };
}
