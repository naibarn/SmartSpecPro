export interface OrchestraAssuranceEvent {
  executionId: string;
  attemptId: string;
  sequence: number;
  state: string;
  parentAttemptId?: string | null;
  previousState?: string | null;
  nextState?: string;
  code?: string;
  payload?: Record<string, unknown>;
}

export const VERTICAL_DRAMA_ASSURANCE_TRANSITIONS: Record<
  string,
  readonly string[]
> = {
  queued: ["running", "cancelled", "stale", "fatal_failed"],
  running: [
    "succeeded",
    "recovered",
    "awaiting_action",
    "retryable_failed",
    "fatal_failed",
    "cancelled",
    "stale",
    "reconciliation_required",
  ],
  awaiting_action: [],
  succeeded: [],
  recovered: [],
  retryable_failed: [],
  fatal_failed: [],
  cancelled: [],
  stale: [],
  reconciliation_required: [],
};

export interface VerticalDramaAssuranceReplayProjection {
  executionId: string;
  activeAttemptId: string | null;
  acceptedAttemptId: string | null;
  eventCursor: number;
  state: string | null;
  events: OrchestraAssuranceEvent[];
}

export function appendAssuranceEvent(
  events: OrchestraAssuranceEvent[],
  event: OrchestraAssuranceEvent
): OrchestraAssuranceEvent[] {
  const last = events[events.length - 1];
  if (last && event.sequence <= last.sequence)
    throw new Error("event_cursor_replay_or_out_of_order");
  if (
    events.some(
      existing =>
        existing.executionId !== event.executionId ||
        existing.attemptId !== event.attemptId
    )
  ) {
    throw new Error("event_execution_identity_mismatch");
  }
  return [
    ...events,
    { ...event, payload: redactAssurancePayload(event.payload) },
  ];
}

export function redactAssurancePayload(
  payload?: Record<string, unknown>
): Record<string, unknown> {
  if (!payload) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      /(token|secret|password|api[-_]?key|prompt|raw|content|signed|url|evidence)/i.test(
        key
      )
    ) {
      result[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactAssurancePayload(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isAllowedTransition(
  previousState: string | null,
  nextState: string
): boolean {
  if (previousState === null) return nextState === "queued";
  return (
    VERTICAL_DRAMA_ASSURANCE_TRANSITIONS[previousState]?.includes(nextState) ??
    false
  );
}

/**
 * Pure durable replay. It accepts child attempts but rejects reordered events,
 * illegal state edges, and attempts that are not explicitly parented after a
 * terminal/retryable parent state.
 */
export function replayVerticalDramaAssuranceEvents(
  input: OrchestraAssuranceEvent[],
  fromCursor = 0
): VerticalDramaAssuranceReplayProjection {
  const events = input
    .filter(event => event.sequence > fromCursor)
    .sort((left, right) => left.sequence - right.sequence);
  let executionId: string | null = null;
  let cursor = fromCursor;
  let activeAttemptId: string | null = null;
  let acceptedAttemptId: string | null = null;
  let state: string | null = null;
  const states = new Map<string, string>();
  const replayed: OrchestraAssuranceEvent[] = [];

  for (const event of events) {
    if (executionId && executionId !== event.executionId) {
      throw new Error("VD_ASSURANCE_REPLAY_EXECUTION_MISMATCH");
    }
    executionId = event.executionId;
    if (event.sequence <= cursor)
      throw new Error("event_cursor_replay_or_out_of_order");
    const nextState = event.nextState ?? event.state;
    const previousState =
      event.previousState === undefined
        ? (states.get(event.attemptId) ?? null)
        : event.previousState;
    const knownState = states.get(event.attemptId) ?? null;
    if (previousState !== knownState)
      throw new Error("VD_ASSURANCE_REPLAY_PRIOR_STATE_MISMATCH");
    if (previousState === null && event.parentAttemptId) {
      const parentState = states.get(event.parentAttemptId);
      if (
        !parentState ||
        ![
          "recovered",
          "awaiting_action",
          "retryable_failed",
          "stale",
          "reconciliation_required",
          "succeeded",
        ].includes(parentState)
      ) {
        throw new Error("VD_ASSURANCE_CHILD_ATTEMPT_PARENT_INVALID");
      }
    }
    if (!isAllowedTransition(previousState, nextState))
      throw new Error("VD_ASSURANCE_TRANSITION_INVALID");
    const redacted = {
      ...event,
      state: nextState,
      previousState,
      nextState,
      payload: redactAssurancePayload(event.payload),
    };
    replayed.push(redacted);
    states.set(event.attemptId, nextState);
    cursor = event.sequence;
    activeAttemptId = event.attemptId;
    state = nextState;
    if (nextState === "succeeded") acceptedAttemptId = event.attemptId;
  }

  return {
    executionId: executionId ?? "",
    activeAttemptId,
    acceptedAttemptId,
    eventCursor: cursor,
    state,
    events: replayed,
  };
}

export function beginCorrectionAttempt(
  previousAttemptId: string,
  nextAttemptId: string
): { previousAttemptId: string; nextAttemptId: string; immutable: true } {
  if (
    !previousAttemptId ||
    !nextAttemptId ||
    previousAttemptId === nextAttemptId
  )
    throw new Error("correction_attempt_must_be_new");
  return { previousAttemptId, nextAttemptId, immutable: true };
}
