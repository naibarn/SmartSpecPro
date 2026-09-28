export type OrcaCanonicalStatus =
  | "queued"
  | "running"
  | "waiting_external"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "reconciliation_required";

export type OrcaJobReceiptState = {
  jobId: string;
  attemptId: string;
  generation: number;
  status: OrcaCanonicalStatus;
};
export type OrcaReceiptInput = {
  eventId: string;
  jobId: string;
  attemptId: string;
  generation: number;
  kind: "ack" | "effect";
  phase:
    | "accepted"
    | "started"
    | "waiting_input"
    | "completed"
    | "failed"
    | "cancelled"
    | "unknown";
  payload: Record<string, unknown>;
};

export type OrcaReceiptResult = {
  disposition: "accepted" | "duplicate" | "stale";
  status: OrcaCanonicalStatus;
  effectVerified: boolean;
  eventId: string;
  reasonCode?: string;
  payload: Record<string, unknown>;
};

const seenEventIds = new Set<string>();

export function canonicalStatusForOrcaPhase(
  phase: OrcaReceiptInput["phase"],
  kind: OrcaReceiptInput["kind"]
): OrcaCanonicalStatus {
  if (kind === "ack") return "running";
  switch (phase) {
    case "accepted":
    case "started":
      return "running";
    case "waiting_input":
      return "waiting_external";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "reconciliation_required";
  }
}

export function normalizeOrcaReceipt(
  state: OrcaJobReceiptState,
  input: OrcaReceiptInput
): OrcaReceiptResult {
  if (
    input.jobId !== state.jobId ||
    input.attemptId !== state.attemptId ||
    input.generation !== state.generation
  ) {
    return {
      disposition: "stale",
      status: state.status,
      effectVerified: false,
      eventId: input.eventId,
      reasonCode: "STALE_ATTEMPT",
      payload: {},
    };
  }
  const eventKey = `${input.jobId}:${input.attemptId}:${input.generation}:${input.eventId}`;
  if (seenEventIds.has(eventKey)) {
    return {
      disposition: "duplicate",
      status: state.status,
      effectVerified: false,
      eventId: input.eventId,
      payload: {},
    };
  }
  seenEventIds.add(eventKey);
  const effectVerified = input.kind === "effect" && input.phase === "completed";
  return {
    disposition: "accepted",
    status: canonicalStatusForOrcaPhase(input.phase, input.kind),
    effectVerified,
    eventId: input.eventId,
    payload: input.payload,
  };
}
