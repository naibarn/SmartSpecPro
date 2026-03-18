import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface CriticalIncident {
  id: number;
  title: string;
  message: string;
}

interface UseGuardianEventsReturn {
  isConnected: boolean;
  latestCriticalIncident: CriticalIncident | null;
  disconnect: () => void;
}

export function useGuardianEvents(enabled = true): UseGuardianEventsReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [latestCriticalIncident, setLatestCriticalIncident] = useState<CriticalIncident | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let retryCount = 0;

    function connect() {
      const es = new EventSource("/api/virtual-admin/events");
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        retryCount = 0;
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;
        // Exponential backoff
        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      const eventTypes = [
        "incident.created",
        "incident.updated",
        "incident.resolved",
        "approval.requested",
        "approval.decided",
        "sensor.alert",
        "feedback.new",
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (event) => {
          try {
            const data = JSON.parse(event.data);

            // Invalidate relevant queries
            if (type.startsWith("incident.")) {
              queryClient.invalidateQueries({ queryKey: ["guardian", "incidents"] });
              queryClient.invalidateQueries({ queryKey: ["guardian", "dashboard"] });
            }
            if (type.startsWith("approval.")) {
              queryClient.invalidateQueries({ queryKey: ["guardian", "approvals"] });
            }
            if (type === "sensor.alert") {
              queryClient.invalidateQueries({ queryKey: ["guardian", "sensors"] });
            }
            if (type === "feedback.new") {
              queryClient.invalidateQueries({ queryKey: ["feedback", "tickets"] });
            }

            // Track critical incidents
            if (type === "incident.created" && data.severity === "critical") {
              setLatestCriticalIncident({
                id: data.incidentId,
                title: data.title,
                message: data.message,
              });
            }
            if (type === "incident.resolved" && data.incidentId === latestCriticalIncident?.id) {
              setLatestCriticalIncident(null);
            }
          } catch {
            // Skip malformed events
          }
        });
      }
    }

    connect();

    return () => {
      disconnect();
    };
  }, [enabled, disconnect, queryClient]);

  return { isConnected, latestCriticalIncident, disconnect };
}
