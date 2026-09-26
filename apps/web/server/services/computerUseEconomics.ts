import { admitEconomicIntent } from "./economicControlPlaneTypes";
import {
  reserveHold,
  releaseHold,
  type EconomicHoldState,
} from "./economicControlPlane";

export class ComputerUseEconomicsError extends Error {
  readonly code: "AMOUNT_INVALID";
  constructor(code: "AMOUNT_INVALID", message = code) {
    super(message);
    this.name = "ComputerUseEconomicsError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const computerUseReplay = new Map<string, EconomicHoldState>();

export function evaluateComputerUseEffect(input: {
  tenantId: string;
  actorId: string;
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
  policy: "allowed" | "denied";
  approval: boolean;
  routeReady: boolean;
  amountMinorUnits: number;
  currency: string;
}): {
  decision: "approved" | "denied" | "approval_required";
  fallbackEligible: boolean;
  reasonCode: string;
  reservation?: EconomicHoldState;
} {
  if (
    !Number.isSafeInteger(input.amountMinorUnits) ||
    input.amountMinorUnits < 0
  )
    throw new ComputerUseEconomicsError("AMOUNT_INVALID");
  if (input.policy === "denied")
    return {
      decision: "denied",
      fallbackEligible: false,
      reasonCode: "POLICY_DENIED",
    };
  if (!input.approval)
    return {
      decision: "approval_required",
      fallbackEligible: false,
      reasonCode: "APPROVAL_REQUIRED",
    };
  const replay = computerUseReplay.get(
    `${input.tenantId}:${input.idempotencyKey}`
  );
  if (replay) {
    return {
      decision: "approved",
      fallbackEligible: !input.routeReady,
      reasonCode: input.routeReady
        ? "ROUTE_READY"
        : "TECHNICAL_FALLBACK_ELIGIBLE",
      reservation: { ...replay, replayed: true },
    };
  }
  const intent = admitEconomicIntent({
    context: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: "user",
      policyVersion: "economic-control-plane-v1",
    },
    request: {
      jobId: input.jobId,
      attemptId: input.attemptId,
      idempotencyKey: input.idempotencyKey,
      amount: { minorUnits: input.amountMinorUnits, currency: input.currency },
      effectType: "tool_call",
      resourceRef: "computer-use",
    },
  });
  const reservation = reserveHold({
    tenantId: input.tenantId,
    intentId: intent.intent.intentId,
    currency: input.currency,
    amountMinorUnits: input.amountMinorUnits,
    idempotencyKey: `computer-use:${input.idempotencyKey}`,
  });
  const result = {
    decision: "approved",
    fallbackEligible: !input.routeReady,
    reasonCode: input.routeReady
      ? "ROUTE_READY"
      : "TECHNICAL_FALLBACK_ELIGIBLE",
    reservation,
  };
  computerUseReplay.set(
    `${input.tenantId}:${input.idempotencyKey}`,
    reservation
  );
  return result;
}

export function releaseFailedComputerUse(
  hold: EconomicHoldState
): EconomicHoldState {
  return releaseHold(hold);
}
