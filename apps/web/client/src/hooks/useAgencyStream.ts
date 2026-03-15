import { useState, useCallback, useRef, useEffect } from "react";

import {
  parseBrowserSessionArtifact,
  type BrowserSessionArtifact,
} from "@shared/browserSession";

export interface AgencyStreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  isStreaming?: boolean;
  creditsUsed?: number;
}

export interface AgencyActivityEvent {
  type: "agent_switch" | "tool_call" | "tool_result" | "handoff";
  agentName: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface UseAgencyStreamOptions {
  onRunFinished?: (creditsUsed: number) => void;
  onError?: (error: string) => void;
  onBrowserSession?: (artifact: BrowserSessionArtifact) => void;
  onPreviewReady?: (preview: {
    runId: string;
    previewArtifactIds: string[];
    intent: string | null;
    summary: string | null;
  }) => void;
}

export interface UseAgencyStreamReturn {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  connect: (params: {
    agencyId: string;
    conversationId?: string;
    message: string;
    modelOverride?: string;
    /** v1.8: Target a specific agent by name */
    recipientAgent?: string;
    /** v1.8: File IDs to include */
    fileIds?: string[];
    /** v1.8: Per-run instruction override */
    additionalInstructions?: string;
  }) => void;
  disconnect: () => void;
}

function parseSSEEvents(
  buffer: string,
): { events: Array<{ type: string; data: string }>; remaining: string } {
  const events: Array<{ type: string; data: string }> = [];
  const blocks = buffer.split("\n\n");
  // Last element may be incomplete
  const remaining = blocks.pop() || "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    let dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment/keepalive
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }

    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join("\n") });
    }
  }

  return { events, remaining };
}

export function useAgencyStream(
  options?: UseAgencyStreamOptions,
): UseAgencyStreamReturn {
  const [messages, setMessages] = useState<AgencyStreamMessage[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [activityEvents, setActivityEvents] = useState<
    AgencyActivityEvent[]
  >([]);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgRef = useRef<string>("");
  const streamingAgentRef = useRef<string>("");
  const runCounterRef = useRef(0);

  // Store callbacks in refs to avoid stale closures (H3 fix)
  const onRunFinishedRef = useRef(options?.onRunFinished);
  const onErrorRef = useRef(options?.onError);
  const onBrowserSessionRef = useRef(options?.onBrowserSession);
  const onPreviewReadyRef = useRef(options?.onPreviewReady);
  useEffect(() => {
    onRunFinishedRef.current = options?.onRunFinished;
    onErrorRef.current = options?.onError;
    onBrowserSessionRef.current = options?.onBrowserSession;
    onPreviewReadyRef.current = options?.onPreviewReady;
  }, [options?.onRunFinished, options?.onError, options?.onBrowserSession, options?.onPreviewReady]);

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // H2 fix: cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const connect = useCallback(
    (params: {
      agencyId: string;
      conversationId?: string;
      message: string;
      modelOverride?: string;
      recipientAgent?: string;
      fileIds?: string[];
      additionalInstructions?: string;
    }) => {
      // Reset state
      disconnect();
      setError(null);
      setCreditsUsed(0);
      streamingMsgRef.current = "";
      streamingAgentRef.current = "";
      runCounterRef.current += 1;
      const runId = runCounterRef.current;

      // Add user message
      const userMsg: AgencyStreamMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: params.message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const res = await fetch("/api/v1/agency/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              agencyId: params.agencyId,
              conversationId: params.conversationId,
              message: params.message,
              ...(params.modelOverride ? { modelOverride: params.modelOverride } : {}),
              ...(params.recipientAgent ? { recipientAgent: params.recipientAgent } : {}),
              ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
              ...(params.additionalInstructions ? { additionalInstructions: params.additionalInstructions } : {}),
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Stream error" }));
            const errMsg = err.error || `HTTP ${res.status}`;
            setError(errMsg);
            setIsStreaming(false);
            onErrorRef.current?.(errMsg);
            return;
          }

          if (!res.body) {
            setError("No response body");
            setIsStreaming(false);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const { events, remaining } = parseSSEEvents(buffer);
            buffer = remaining;

            for (const evt of events) {
              handleSSEEvent(evt.type, evt.data);
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const { events } = parseSSEEvents(buffer + "\n\n");
            for (const evt of events) {
              handleSSEEvent(evt.type, evt.data);
            }
          }

          setIsStreaming(false);
        } catch (err: any) {
          if (err.name === "AbortError") return;
          const errMsg = err.message || "Connection lost";
          setError(errMsg);
          setIsStreaming(false);
          onErrorRef.current?.(errMsg);
        }
      })();

      function handleSSEEvent(type: string, rawData: string) {
        let data: any;
        try {
          data = JSON.parse(rawData);
        } catch {
          return;
        }

        switch (type) {
          case "run_started":
            setIsStreaming(true);
            break;

          case "agent_switch": {
            const newAgent = data.agentName || data.agent_name || "";
            setActiveAgent(newAgent || null);

            // M6 fix: finalize previous agent's streaming message and reset buffer
            if (streamingMsgRef.current) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.isStreaming ? { ...m, isStreaming: false } : m,
                ),
              );
              streamingMsgRef.current = "";
            }

            streamingAgentRef.current = newAgent;
            setActivityEvents((prev) => [
              ...prev,
              {
                type: "agent_switch",
                agentName: newAgent,
                timestamp: Date.now(),
                data,
              },
            ]);
            break;
          }

          case "token": {
            const token = data.token || data.content || "";
            streamingMsgRef.current += token;
            const currentContent = streamingMsgRef.current;
            const agent =
              data.agentName ||
              data.agent_name ||
              streamingAgentRef.current;
            // M5 fix: include runId to prevent key collisions across agent switches
            const streamId = `stream-${runId}-${agent}`;

            setMessages((prev) => {
              const existing = prev.find(
                (m) => m.id === streamId && m.isStreaming,
              );
              if (existing) {
                return prev.map((m) =>
                  m.id === streamId
                    ? { ...m, content: currentContent }
                    : m,
                );
              }
              return [
                ...prev,
                {
                  id: streamId,
                  role: "assistant",
                  content: currentContent,
                  agentName: agent,
                  isStreaming: true,
                },
              ];
            });
            break;
          }

          case "tool_call":
            setActivityEvents((prev) => [
              ...prev,
              {
                type: "tool_call",
                agentName:
                  data.agentName || data.agent_name || "",
                timestamp: Date.now(),
                data,
              },
            ]);
            break;

          case "tool_result":
            setActivityEvents((prev) => [
              ...prev,
              {
                type: "tool_result",
                agentName:
                  data.agentName || data.agent_name || "",
                timestamp: Date.now(),
                data,
              },
            ]);
            break;

          case "browser_session": {
            const artifact = parseBrowserSessionArtifact(data);
            if (artifact) {
              onBrowserSessionRef.current?.(artifact);
            }
            break;
          }

          case "preview_ready":
            onPreviewReadyRef.current?.({
              runId: typeof data.run_id === "string" ? data.run_id : "",
              previewArtifactIds: Array.isArray(data.preview_artifact_ids)
                ? data.preview_artifact_ids.filter((value: unknown): value is string => typeof value === "string")
                : [],
              intent: typeof data.intent === "string" ? data.intent : null,
              summary: typeof data.summary === "string" ? data.summary : null,
            });
            break;

          case "run_finished": {
            const credits = data.creditsUsed ?? data.total_credits ?? 0;
            setCreditsUsed(credits);
            setIsStreaming(false);
            // Finalize streaming message
            setMessages((prev) =>
              prev.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              ),
            );
            streamingMsgRef.current = "";
            streamingAgentRef.current = "";
            onRunFinishedRef.current?.(credits);
            break;
          }

          case "run_error":
          case "error": {
            const errMsg =
              data.message || data.error || "Agency run failed";
            setError(errMsg);
            setIsStreaming(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              ),
            );
            onErrorRef.current?.(errMsg);
            break;
          }
        }
      }
    },
    [disconnect],
  );

  return {
    messages,
    activeAgent,
    isStreaming,
    error,
    creditsUsed,
    activityEvents,
    connect,
    disconnect,
  };
}
