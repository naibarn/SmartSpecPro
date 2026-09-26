import { admitEconomicIntent } from "./economicControlPlaneTypes";
import {
  releaseHold,
  reserveHold,
  type EconomicHoldState,
} from "./economicControlPlane";

const workflowEconomicReplay = new Map<string, EconomicHoldState>();

export function admitWorkflowRunEconomics(input: {
  tenantId: string;
  actorId: string;
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
  estimateMinorUnits: number;
  currency: string;
  workflowVersionId: string;
}): {
  status: "reserved";
  correlation: { jobId: string; attemptId: string; workflowVersionId: string };
  reservation: EconomicHoldState;
} {
  const key = `${input.tenantId}:${input.idempotencyKey}`;
  const existing = workflowEconomicReplay.get(key);
  if (existing)
    return {
      status: "reserved",
      correlation: {
        jobId: input.jobId,
        attemptId: input.attemptId,
        workflowVersionId: input.workflowVersionId,
      },
      reservation: { ...existing, replayed: true },
    };
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
      amount: {
        minorUnits: input.estimateMinorUnits,
        currency: input.currency,
      },
      effectType: "workflow_run",
      resourceRef: `workflow-version:${input.workflowVersionId}`,
    },
  });
  const reservation = reserveHold({
    tenantId: input.tenantId,
    intentId: intent.intent.intentId,
    currency: input.currency,
    amountMinorUnits: input.estimateMinorUnits,
    idempotencyKey: `workflow-run:${input.idempotencyKey}`,
  });
  workflowEconomicReplay.set(key, reservation);
  return {
    status: "reserved",
    correlation: {
      jobId: input.jobId,
      attemptId: input.attemptId,
      workflowVersionId: input.workflowVersionId,
    },
    reservation,
  };
}

export function releaseWorkflowRunEconomics(
  reservation: EconomicHoldState
): EconomicHoldState {
  return releaseHold(reservation);
}
export function buildWorkflowCostProjection(input: {
  estimateMinorUnits: number;
  capturedMinorUnits: number;
  currency: string;
  state:
    | "estimated"
    | "reserved"
    | "captured"
    | "released"
    | "reconciliation_required";
}): {
  label: typeof input.state;
  amountMinorUnits: number;
  currency: string;
  explainable: true;
} {
  return {
    label: input.state,
    amountMinorUnits:
      input.state === "captured"
        ? input.capturedMinorUnits
        : input.estimateMinorUnits,
    currency: input.currency.toUpperCase(),
    explainable: true,
  };
}
