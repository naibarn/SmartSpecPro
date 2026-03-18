/**
 * TeamRoomView — multi-agent conversation room view.
 *
 * Renders multi-avatar messages, system bubbles, and agent status indicators.
 * Integrates with useRunStream for live updates and tRPC for initial data.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";

interface TeamRoomViewProps {
  roomId: string;
  runId?: string;
  teamName?: string;
  viewMode?: "transparent" | "milestone" | "summary";
  onStartRun?: () => void;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onStopRun?: () => void;
  onSendMessage?: (content: string) => void;
}

const ACTOR_COLORS: Record<string, { bg: string; border: string; avatar: string }> = {
  system: { bg: "bg-amber-50", border: "border-amber-200", avatar: "bg-amber-500" },
  user: { bg: "bg-slate-50", border: "border-slate-200", avatar: "bg-slate-600" },
  assistant: { bg: "bg-blue-50", border: "border-blue-200", avatar: "bg-blue-500" },
};

const AGENT_AVATAR_COLORS = [
  "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-cyan-500",
  "bg-orange-500", "bg-indigo-500", "bg-teal-500", "bg-pink-500",
];

function getAgentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_AVATAR_COLORS[Math.abs(hash) % AGENT_AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamRoomView({
  roomId,
  runId,
  teamName,
  viewMode = "transparent",
  onStartRun,
  onPauseRun,
  onResumeRun,
  onStopRun,
  onSendMessage,
}: TeamRoomViewProps) {
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { connected } = useRunStream({
    runId,
    enabled: !!runId,
    onEvent: useCallback((event: RunStreamEvent) => {
      setEvents((prev) => [...prev.slice(-199), event]);
    }, []),
  });

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSendMessage?.(messageInput.trim());
    setMessageInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filter events by view mode
  const filteredEvents = events.filter((e) => {
    if (viewMode === "transparent") return e.visibility !== "private_internal";
    if (viewMode === "milestone") return e.visibility === "transparent" || e.visibility === "milestone";
    if (viewMode === "summary") return e.visibility === "summary_only" || e.eventType.includes("summary");
    return true;
  });

  return (
    <div className="flex flex-1 flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
            {teamName ? getInitials(teamName) : "TR"}
          </div>
          <div>
            <h2 className="text-sm font-semibold">{teamName ?? "Team Room"}</h2>
            <span className="text-xs text-muted-foreground">{roomId.slice(0, 8)}...</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Connection status */}
          {runId && (
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              connected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {connected ? "Live" : "Disconnected"}
            </div>
          )}

          {/* Run controls */}
          {runId ? (
            <div className="flex items-center gap-1">
              <button onClick={onPauseRun} className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors" title="Pause run">
                Pause
              </button>
              <button onClick={onStopRun} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors" title="Stop run">
                Stop
              </button>
            </div>
          ) : (
            <button onClick={onStartRun} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              Start Run
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {filteredEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-sm font-medium">
              {runId ? "Waiting for agent activity..." : "No active run"}
            </p>
            <p className="text-xs max-w-[300px] text-center">
              {runId
                ? "Agents will start responding shortly. Watch the conversation unfold in real-time."
                : "Start a run to begin the team conversation."}
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const colors = ACTOR_COLORS[event.actorType] ?? ACTOR_COLORS.assistant;
            const avatarColor = event.actorType === "assistant"
              ? getAgentColor(event.actorId)
              : colors.avatar;

            return (
              <div key={event.eventId} className={`flex gap-3 ${event.actorType === "user" ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div className={`h-8 w-8 shrink-0 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}>
                  {event.actorType === "system" ? "SYS" : getInitials(event.actorId)}
                </div>

                {/* Message bubble */}
                <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${colors.bg} border ${colors.border}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold capitalize">
                      {event.actorType === "assistant" ? event.actorId.slice(0, 12) : event.actorType}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(event.ts).toLocaleTimeString()}
                    </span>
                    {event.visibility !== "transparent" && (
                      <span className="rounded bg-gray-200 px-1 py-0.5 text-[9px] uppercase tracking-wider">
                        {event.visibility}
                      </span>
                    )}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {(event.data as any)?.content ?? event.eventType}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to the team..."
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!messageInput.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
