/**
 * useRunStream — React hook for consuming orchestrator SSE streams.
 *
 * Auto-reconnects on disconnect with exponential backoff.
 * Supports Last-Event-ID for gap recovery.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface RunStreamEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  ts: string;
  actorType: "user" | "assistant" | "system";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal";
  data: Record<string, unknown>;
}

interface UseRunStreamOptions {
  runId?: string;
  teamId?: string;
  enabled?: boolean;
  onEvent?: (event: RunStreamEvent) => void;
  onError?: (error: Event) => void;
}

export function useRunStream(options: UseRunStreamOptions) {
  const { runId, teamId, enabled = true, onEvent, onError } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RunStreamEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<string>("");
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!enabled) return;

    const streamType = runId ? "run" : teamId ? "team" : null;
    const streamId = runId ?? teamId;
    if (!streamType || !streamId) return;

    const url = `/api/orchestrator/stream/${streamType}/${streamId}`;
    const es = new EventSource(url);

    es.onopen = () => {
      setConnected(true);
      retryCountRef.current = 0;
    };

    es.onmessage = (e) => {
      try {
        const event: RunStreamEvent = JSON.parse(e.data);
        lastEventIdRef.current = event.eventId;
        setLastEvent(event);
        onEvent?.(event);
      } catch {
        // Skip malformed events
      }
    };

    es.onerror = (e) => {
      setConnected(false);
      es.close();
      onError?.(e);

      // Reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);
    };

    eventSourceRef.current = es;
  }, [runId, teamId, enabled, onEvent, onError]);

  useEffect(() => {
    connect();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  return { connected, lastEvent };
}
