export interface MediaHistoryPollState {
  inFlight: boolean;
  rateLimitedUntil: number;
  nextAttemptAtByTask: Map<string, number>;
}

export const MEDIA_HISTORY_POLL_INTERVAL_MS = 15_000;

export function createMediaHistoryPollState(): MediaHistoryPollState {
  return {
    inFlight: false,
    rateLimitedUntil: 0,
    nextAttemptAtByTask: new Map(),
  };
}

export function reserveMediaHistoryPoll(
  state: MediaHistoryPollState,
  taskId: string,
  now: number,
  intervalMs = MEDIA_HISTORY_POLL_INTERVAL_MS,
): boolean {
  if (
    state.inFlight ||
    now < state.rateLimitedUntil ||
    now < (state.nextAttemptAtByTask.get(taskId) ?? 0)
  ) {
    return false;
  }
  state.nextAttemptAtByTask.set(taskId, now + intervalMs);
  return true;
}

export function setMediaHistoryRateLimit(
  state: MediaHistoryPollState,
  now: number,
  backoffMs: number,
): void {
  state.rateLimitedUntil = Math.max(
    state.rateLimitedUntil,
    now + Math.max(0, backoffMs),
  );
}
