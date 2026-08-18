export interface OrchestraAssuranceEvent {
  executionId: string;
  attemptId: string;
  sequence: number;
  state: string;
  code?: string;
  payload?: Record<string, unknown>;
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
    if (/(token|secret|password|api[-_]?key|prompt|raw|content)/i.test(key)) {
      result[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactAssurancePayload(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
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
