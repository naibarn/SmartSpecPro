import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export type TaskHarnessOutputEvent = {
  id: string;
  sequence: number;
  at: string;
  attempt: number | null;
  kind: string;
  text?: string;
  detail?: string;
  diff?: string;
  path?: string;
  name?: string;
  status?: string;
  exitCode?: number;
  chunkIndex: number;
  chunkCount: number;
};

export function mergeTaskHarnessOutputEvents(
  current: TaskHarnessOutputEvent[],
  incoming: TaskHarnessOutputEvent[],
  limit = 500
): TaskHarnessOutputEvent[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map(event => [event.id, event]));
  let changed = false;
  for (const event of incoming) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...byId.values()]
    .sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id)
    )
    .slice(-limit);
}

/** Shared durable harness-event replay for Chat and Task Control. */
export function useTaskHarnessOutputEvents(
  jobId: string | null,
  enabled: boolean
) {
  const [state, setState] = useState<{
    jobId: string | null;
    cursor: number;
    events: TaskHarnessOutputEvent[];
  }>({ jobId: null, cursor: 0, events: [] });

  const cursor = state.jobId === jobId ? state.cursor : 0;
  const query = trpc.workerJobs.developerExecutionEvents.useQuery(
    { jobId: jobId ?? "", afterSequence: cursor, limit: 50 },
    {
      enabled: enabled && Boolean(jobId),
      staleTime: 0,
      refetchInterval: enabled && jobId ? 2_000 : false,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );

  useEffect(() => {
    if (state.jobId === jobId) return;
    setState({ jobId, cursor: 0, events: [] });
  }, [jobId, state.jobId]);

  useEffect(() => {
    const page = query.data;
    if (!enabled || !jobId || page?.jobId !== jobId) return;
    setState(current => {
      const sameJob = current.jobId === jobId;
      const currentEvents = sameJob ? current.events : [];
      const currentCursor = sameJob ? current.cursor : 0;
      const events = mergeTaskHarnessOutputEvents(
        currentEvents,
        page.events as TaskHarnessOutputEvent[]
      );
      const nextCursor = Math.max(currentCursor, page.nextSequence);
      if (sameJob && events === current.events && nextCursor === current.cursor)
        return current;
      return { jobId, cursor: nextCursor, events };
    });
  }, [enabled, jobId, query.data]);

  return {
    query,
    events: state.jobId === jobId ? state.events : [],
    eventsJobId: state.jobId,
    eventCursor: cursor,
    hasMore: query.data?.jobId === jobId ? query.data.hasMore : false,
  };
}
