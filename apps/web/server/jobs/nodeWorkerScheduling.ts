export const DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT = 3;
export const DEFAULT_NODE_WORKER_FAIRNESS_WAIT_MS = 2_000;

export type NodeWorkerDispatchDecisionInput = {
  activeCount: number;
  lastDispatchAt: number | null;
  now: number;
  hasQueuedWork: boolean;
  initialDispatchCount?: number;
  fairnessWaitMs?: number;
};

/**
 * Three is only the initial fairness window, never a concurrency ceiling.
 * Once that window is full, the scheduler admits one more task after the
 * fairness delay so a competing user's work has a chance to be selected.
 */
export function shouldDispatchNextNodeWorkerTask(
  input: NodeWorkerDispatchDecisionInput,
): boolean {
  if (!input.hasQueuedWork) return false;
  const initialDispatchCount = Math.max(
    1,
    Math.trunc(input.initialDispatchCount ?? DEFAULT_NODE_WORKER_INITIAL_DISPATCH_COUNT),
  );
  if (input.activeCount < initialDispatchCount) return true;
  if (input.lastDispatchAt == null) return true;
  const fairnessWaitMs = Math.max(
    0,
    Math.trunc(input.fairnessWaitMs ?? DEFAULT_NODE_WORKER_FAIRNESS_WAIT_MS),
  );
  return input.now - input.lastDispatchAt >= fairnessWaitMs;
}

export type FairNodeWorkerTask = { userKey: string | null };

export function selectFairNodeWorkerTask<T extends FairNodeWorkerTask>(
  candidates: readonly T[],
  activeUserKeys: ReadonlySet<string>,
): T | null {
  return candidates.find(candidate => (
    candidate.userKey == null || !activeUserKeys.has(candidate.userKey)
  )) ?? candidates[0] ?? null;
}
