import { useCallback, useEffect, useRef } from "react";
import {
  liveBrowserEventEnvelopeSchema,
  type LiveBrowserEventEnvelope,
} from "@shared/liveBrowser";
import type { LiveReconnectState } from "@/lib/liveBrowserStream";

export interface LiveBrowserEventStreamOptions {
  enabled: boolean;
  sessionId: string | null;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  onEvent: (event: LiveBrowserEventEnvelope) => void;
  onReconnectStateChange?: (state: LiveReconnectState) => void;
}

function safeParseEvent(data: string): LiveBrowserEventEnvelope | null {
  try {
    const parsed = JSON.parse(data);
    const validated = liveBrowserEventEnvelopeSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export function useLiveBrowserEventStream(
  options: LiveBrowserEventStreamOptions,
): void {
  const {
    enabled,
    sessionId,
    reconnectDelayMs = 1500,
    maxReconnectAttempts = 8,
    onEvent,
    onReconnectStateChange,
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [clearReconnectTimeout]);

  const connect = useCallback(() => {
    if (!enabled || !sessionId) {
      return;
    }

    disconnect();
    let url = `/api/live-browser/sessions/${encodeURIComponent(sessionId)}/stream`;
    if (lastEventIdRef.current) {
      url += `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
      onReconnectStateChange?.("connected");
    });

    eventSource.addEventListener("live_browser_event", (event: MessageEvent) => {
      const parsed = safeParseEvent(event.data);
      if (!parsed) {
        return;
      }
      lastEventIdRef.current = parsed.cursor || event.lastEventId || lastEventIdRef.current;
      onEvent(parsed);
      onReconnectStateChange?.("connected");
    });

    eventSource.addEventListener("stream_error", () => {
      onReconnectStateChange?.("reconnecting");
    });

    eventSource.addEventListener("error", () => {
      disconnect();
      reconnectAttemptsRef.current += 1;
      if (
        maxReconnectAttempts > 0
        && reconnectAttemptsRef.current > maxReconnectAttempts
      ) {
        onReconnectStateChange?.("stream_unavailable");
        return;
      }

      onReconnectStateChange?.("reconnecting");
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectDelayMs);
    });
  }, [
    disconnect,
    enabled,
    maxReconnectAttempts,
    onEvent,
    onReconnectStateChange,
    reconnectDelayMs,
    sessionId,
  ]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      lastEventIdRef.current = null;
      reconnectAttemptsRef.current = 0;
      disconnect();
      return;
    }
    lastEventIdRef.current = null;
    reconnectAttemptsRef.current = 0;
    connect();
    return disconnect;
  }, [connect, disconnect, enabled, sessionId]);

  useEffect(() => () => disconnect(), [disconnect]);
}
