import { useEffect, useRef, useCallback } from "react";

export const MAX_RECONNECT_ATTEMPTS = 5;
export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30000;

interface UseSSEReconnectOptions {
  url: string;
  /** Called when a message of the given event type arrives */
  onMessage: () => void;
  /** Event type to listen for (default: "notification") */
  eventType?: string;
  /** Whether the hook is active (default: true) */
  enabled?: boolean;
}

export function useSSEReconnect({
  url,
  onMessage,
  eventType = "notification",
  enabled = true,
}: UseSSEReconnectOptions) {
  const esRef = useRef<EventSource | null>(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest onMessage in a ref to avoid stale closures
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    function connect() {
      try {
        const es = new EventSource(url, { withCredentials: true });
        esRef.current = es;

        es.addEventListener(eventType, () => {
          onMessageRef.current();
        });

        es.addEventListener("open", () => {
          attemptsRef.current = 0;
        });

        es.onerror = () => {
          es.close();
          esRef.current = null;

          if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn(
              `[useSSEReconnect] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Falling back to polling.`
            );
            return;
          }

          // Don't schedule if one is already pending
          if (reconnectTimerRef.current !== null) return;

          const delay = Math.min(
            BASE_DELAY_MS * Math.pow(2, attemptsRef.current),
            MAX_DELAY_MS
          );
          attemptsRef.current += 1;

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, delay);
        };
      } catch {
        // EventSource not supported — polling is the fallback
      }
    }

    connect();

    return cleanup;
  }, [url, eventType, enabled, cleanup]);
}
