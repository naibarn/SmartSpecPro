/**
 * TeamRoomView — multi-agent conversation room view.
 *
 * Renders multi-avatar messages, system bubbles, and agent status indicators.
 * Integrates with useRunStream for live updates.
 */

import React, { useState, useEffect } from "react";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";

interface TeamRoomViewProps {
  roomId: string;
  runId?: string;
  viewMode?: "transparent" | "milestone" | "summary";
}

export function TeamRoomView({ roomId, runId, viewMode = "transparent" }: TeamRoomViewProps) {
  const [events, setEvents] = useState<RunStreamEvent[]>([]);

  const { connected, lastEvent } = useRunStream({
    runId,
    enabled: !!runId,
    onEvent: (event) => {
      setEvents((prev) => [...prev, event]);
    },
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">Team Room</h2>
        <span className="text-xs text-muted-foreground">Room: {roomId}</span>
        {runId && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {connected ? "Live" : "Disconnected"}
          </span>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {runId ? "Waiting for agent activity..." : "No active run. Start a run to begin."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <div
                key={event.eventId}
                className={`rounded-lg p-3 text-sm ${
                  event.actorType === "system"
                    ? "bg-yellow-50 border border-yellow-200"
                    : event.actorType === "assistant"
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-gray-50 border border-gray-200"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium capitalize">{event.actorType}</span>
                  <span className="text-xs text-muted-foreground">{event.actorId}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(event.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm">
                  {(event.data as any)?.content ?? event.eventType}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
