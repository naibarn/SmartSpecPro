export type OrcaOperationsProjection = {
  status: "empty" | "blocked" | "running" | "success" | "error";
  reasonCode: string;
  receiptLabel:
    | "none"
    | "ack_pending_effect_receipt"
    | "effect_verified"
    | "effect_unknown";
  generation: number | null;
  recoverable: boolean;
};

export function buildOrcaOperationsProjection(input: {
  readiness: {
    status:
      | "ready"
      | "setup_required"
      | "auth_required"
      | "unsupported"
      | "stale"
      | "disabled";
    reasonCode: string;
  };
  session: {
    state:
      | "created"
      | "attached"
      | "running"
      | "waiting_input"
      | "completed"
      | "failed"
      | "cancelled";
    generation: number;
  } | null;
  receipt: {
    kind: "ack" | "effect";
    status: "accepted" | "verified" | "failed" | "unknown";
    effectVerified: boolean;
  } | null;
  reconciliation: {
    status: "reconciliation_required";
    reasonCode: string;
  } | null;
}): OrcaOperationsProjection {
  if (input.readiness.status !== "ready") {
    return {
      status: input.reconciliation ? "blocked" : "empty",
      reasonCode: input.readiness.reasonCode,
      receiptLabel: "none",
      generation: input.session?.generation ?? null,
      recoverable: false,
    };
  }
  if (input.reconciliation) {
    return {
      status: "error",
      reasonCode: input.reconciliation.reasonCode,
      receiptLabel: "effect_unknown",
      generation: input.session?.generation ?? null,
      recoverable: true,
    };
  }
  if (!input.session)
    return {
      status: "empty",
      reasonCode: "ORCA_SESSION_NOT_STARTED",
      receiptLabel: "none",
      generation: null,
      recoverable: true,
    };
  const receiptLabel = input.receipt?.effectVerified
    ? "effect_verified"
    : input.receipt?.kind === "ack"
      ? "ack_pending_effect_receipt"
      : input.receipt
        ? "effect_unknown"
        : "none";
  const status =
    input.session.state === "completed" && input.receipt?.effectVerified
      ? "success"
      : input.session.state === "failed" || input.session.state === "cancelled"
        ? "error"
        : "running";
  return {
    status,
    reasonCode:
      status === "success" ? "ORCA_EFFECT_VERIFIED" : "ORCA_SESSION_ACTIVE",
    receiptLabel,
    generation: input.session.generation,
    recoverable: status !== "success",
  };
}
