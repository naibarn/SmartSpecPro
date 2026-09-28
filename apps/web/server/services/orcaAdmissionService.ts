import {
  admitEconomicIntent,
  type EconomicIntent,
} from "./economicControlPlaneTypes";
import {
  reserveHold,
  releaseHold,
  type EconomicHoldState,
} from "./economicControlPlane";

export class OrcaAdmissionError extends Error {
  readonly code:
    | "TENANT_AUTHORITY_MISMATCH"
    | "ACTOR_AUTHORITY_MISMATCH"
    | "AUTH_EXPIRED"
    | "AUTH_REQUIRED"
    | "APPROVAL_EXPIRED";

  constructor(code: OrcaAdmissionError["code"], message = code) {
    super(message);
    this.name = "OrcaAdmissionError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type OrcaAdmissionInput = {
  server: { tenantId: string; actorId: string; policyVersion: string };
  claims: { tenantId?: string; actorId?: string };
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
  resourceRef: string;
  amountMinorUnits: number;
  currency: string;
  auth: { status: "valid" | "expired" | "missing"; expiresAt: string | null };
  approval: { required: boolean; approved: boolean; expiresAt: string | null };
  now?: Date;
};

export type OrcaAdmissionResult = {
  decision: "approved" | "approval_required";
  reasonCode: "ORCA_ADMITTED" | "APPROVAL_REQUIRED";
  intent?: EconomicIntent;
  reservation?: EconomicHoldState;
};

const admissionReplay = new Map<string, OrcaAdmissionResult>();

export function admitOrcaEffect(
  input: OrcaAdmissionInput
): OrcaAdmissionResult {
  if (input.claims.tenantId && input.claims.tenantId !== input.server.tenantId)
    throw new OrcaAdmissionError("TENANT_AUTHORITY_MISMATCH");
  if (input.claims.actorId && input.claims.actorId !== input.server.actorId)
    throw new OrcaAdmissionError("ACTOR_AUTHORITY_MISMATCH");
  const now = (input.now ?? new Date()).getTime();
  if (input.auth.status === "missing")
    throw new OrcaAdmissionError("AUTH_REQUIRED");
  if (
    input.auth.status === "expired" ||
    (input.auth.expiresAt && Date.parse(input.auth.expiresAt) <= now)
  )
    throw new OrcaAdmissionError("AUTH_EXPIRED");
  if (input.approval.expiresAt && Date.parse(input.approval.expiresAt) <= now)
    throw new OrcaAdmissionError("APPROVAL_EXPIRED");
  if (input.approval.required && !input.approval.approved)
    return { decision: "approval_required", reasonCode: "APPROVAL_REQUIRED" };
  const replay = admissionReplay.get(
    `${input.server.tenantId}:${input.idempotencyKey}`
  );
  if (replay) {
    return {
      ...replay,
      reservation: replay.reservation
        ? { ...replay.reservation, replayed: true }
        : undefined,
    };
  }
  const admission = admitEconomicIntent({
    context: {
      tenantId: input.server.tenantId,
      actorId: input.server.actorId,
      actorType: "user",
      policyVersion: input.server.policyVersion,
    },
    request: {
      jobId: input.jobId,
      attemptId: input.attemptId,
      idempotencyKey: input.idempotencyKey,
      amount: { minorUnits: input.amountMinorUnits, currency: input.currency },
      effectType: "workflow_run",
      resourceRef: input.resourceRef,
    },
  });
  const reservation = reserveHold({
    tenantId: input.server.tenantId,
    intentId: admission.intent.intentId,
    currency: input.currency,
    amountMinorUnits: input.amountMinorUnits,
    idempotencyKey: `orca-reserve:${input.idempotencyKey}`,
  });
  const result = {
    decision: "approved",
    reasonCode: "ORCA_ADMITTED",
    intent: admission.intent,
    reservation,
  };
  admissionReplay.set(
    `${input.server.tenantId}:${input.idempotencyKey}`,
    result
  );
  return result;
}

export function releaseFailedOrcaLaunch(
  hold: EconomicHoldState
): EconomicHoldState {
  return releaseHold(hold);
}
