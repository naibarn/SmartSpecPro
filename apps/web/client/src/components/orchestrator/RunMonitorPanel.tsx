/**
 * RunMonitorPanel — live run monitoring dashboard panel.
 *
 * Shows agent roster with status, timeline of events,
 * and run controls (pause/resume/stop).
 */

import React, { useState } from "react";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";

interface RunMonitorPanelProps {
  runId: string;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export function RunMonitorPanel({ runId, onPause, onResume, onStop }: RunMonitorPanelProps) {
  const [timeline, setTimeline] = useState<RunStreamEvent[]>([]);

  const { connected } = useRunStream({
    runId,
    enabled: true,
    onEvent: (event) => {
      setTimeline((prev) => [...prev.slice(-99), event]); // Keep last 100
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Run Monitor</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ${connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={onPause}
          className="rounded-md bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-800 hover:bg-yellow-200"
        >
          Pause
        </button>
        <button
          onClick={onResume}
          className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-200"
        >
          Resume
        </button>
        <button
          onClick={onStop}
          className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200"
        >
          Stop
        </button>
      </div>

      {/* Event timeline */}
      <div className="max-h-[400px] overflow-y-auto">
        <div className="flex flex-col gap-1">
          {timeline.map((event) => (
            <div key={event.eventId} className="flex items-start gap-2 rounded px-2 py-1 text-xs hover:bg-accent">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
              <div className="flex-1">
                <span className="font-medium">{event.eventType}</span>
                <span className="ml-2 text-muted-foreground">
                  {new Date(event.ts).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {timeline.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No events yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
