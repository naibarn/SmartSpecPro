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
  type: "agent_switch" | "tool_call" | "tool_result" | "handoff" | "tool_start" | "tool_end" | "tool_progress" | "guardrail_trigger" | "approval_required";
  agentName: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  agentName: string;
  status: "running" | "success" | "error";
  progressMessage?: string;
  result?: string;
  startedAt: number;
  endedAt?: number;
}

export interface GuardrailEvent {
  type: "input" | "output";
  guardrailName: string;
  action: string;
  timestamp: number;
}

export interface ApprovalRequest {
  approvalKey: string;
  step: string;
  summary: string;
  agentName: string;
  timestamp: number;
}

export interface UseAgencyStreamOptions {
  onRunFinished?: (creditsUsed: number, runId: string | null) => void;
  onError?: (error: string) => void;
  onBrowserSession?: (artifact: BrowserSessionArtifact) => void;
  onPreviewReady?: (preview: {
    runId: string;
    previewArtifactIds: string[];
    intent: string | null;
    summary: string | null;
  }) => void;
  onGuardrailTrigger?: (event: GuardrailEvent) => void;
  onApprovalRequired?: (request: ApprovalRequest) => void;
}

export interface UseAgencyStreamReturn {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  toolCalls: ToolCallState[];
  guardrailEvents: GuardrailEvent[];
  pendingApproval: ApprovalRequest | null;
  isPollingFallback: boolean;
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
  cancel: (mode: "immediate" | "after_turn") => void;
}

function parseSSEEvents(
  buffer: string,
): { events: Array<{ type: string; data: string; id?: string }>; remaining: string } {
  const events: Array<{ type: string; data: string; id?: string }> = [];
  const blocks = buffer.split("\n\n");
  // Last element may be incomplete
  const remaining = blocks.pop() || "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    let dataLines: string[] = [];
    let eventId: string | undefined;

    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment/keepalive
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("id: ")) {
        eventId = line.slice(4).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }

    if (dataLines.length > 0) {
      events.push({ type: eventType, data: dataLines.join("\n"), id: eventId });
    }
  }

  return { events, remaining };
}

/** Max SSE reconnect failures within the window before falling back to polling */
const MAX_SSE_FAILURES = 3;
/** Time window (ms) for counting SSE failures */
const SSE_FAILURE_WINDOW_MS = 60_000;
/** Polling interval (ms) for fallback mode */
const POLLING_INTERVAL_MS = 3_000;

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
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);
  const [guardrailEvents, setGuardrailEvents] = useState<GuardrailEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [isPollingFallback, setIsPollingFallback] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgRef = useRef<string>("");
  const streamingAgentRef = useRef<string>("");
  const runCounterRef = useRef(0);
  const runIdRef = useRef<string | null>(null);
  const currentAgencyIdRef = useRef<string | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const failTimestampsRef = useRef<number[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store callbacks in refs to avoid stale closures (H3 fix)
  const onRunFinishedRef = useRef(options?.onRunFinished);
  const onErrorRef = useRef(options?.onError);
  const onBrowserSessionRef = useRef(options?.onBrowserSession);
  const onPreviewReadyRef = useRef(options?.onPreviewReady);
  const onGuardrailTriggerRef = useRef(options?.onGuardrailTrigger);
  const onApprovalRequiredRef = useRef(options?.onApprovalRequired);
  useEffect(() => {
    onRunFinishedRef.current = options?.onRunFinished;
    onErrorRef.current = options?.onError;
    onBrowserSessionRef.current = options?.onBrowserSession;
    onPreviewReadyRef.current = options?.onPreviewReady;
    onGuardrailTriggerRef.current = options?.onGuardrailTrigger;
    onApprovalRequiredRef.current = options?.onApprovalRequired;
  }, [
    options?.onRunFinished,
    options?.onError,
    options?.onBrowserSession,
    options?.onPreviewReady,
    options?.onGuardrailTrigger,
    options?.onApprovalRequired,
  ]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPollingInterval = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearReconnectTimer();
    clearPollingInterval();
    setIsStreaming(false);
  }, [clearReconnectTimer, clearPollingInterval]);

  // H2 fix: cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const cancel = useCallback(
    async (mode: "immediate" | "after_turn") => {
      if (mode === "immediate") {
        abortRef.current?.abort();
      }
      const runId = runIdRef.current;
      const agencyId = currentAgencyIdRef.current;
      if (!runId || !agencyId) return;
      try {
        await fetch(`/api/agency/${agencyId}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ runId, mode }),
        });
      } catch {
        // Best-effort cancel
      }
    },
    [],
  );

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
      setToolCalls([]);
      setGuardrailEvents([]);
      setPendingApproval(null);
      setIsPollingFallback(false);
      streamingMsgRef.current = "";
      streamingAgentRef.current = "";
      runCounterRef.current += 1;
      const runCounter = runCounterRef.current;
      runIdRef.current = null;
      currentAgencyIdRef.current = params.agencyId;
      lastEventIdRef.current = null;
      failTimestampsRef.current = [];

      // Add user message
      const userMsg: AgencyStreamMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: params.message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      startSSEConnection(params, runCounter);
    },
    [disconnect],
  );

  function startSSEConnection(
    params: {
      agencyId: string;
      conversationId?: string;
      message: string;
      modelOverride?: string;
      recipientAgent?: string;
      fileIds?: string[];
      additionalInstructions?: string;
    },
    runCounter: number,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (lastEventIdRef.current) {
          headers["Last-Event-ID"] = lastEventIdRef.current;
        }

        const res = await fetch("/api/v1/agency/stream", {
          method: "POST",
          headers,
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

        // Reset fail count on successful connection
        failTimestampsRef.current = [];

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
            if (evt.id) {
              lastEventIdRef.current = evt.id;
            }
            handleSSEEvent(evt.type, evt.data, runCounter);
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const { events } = parseSSEEvents(buffer + "\n\n");
          for (const evt of events) {
            if (evt.id) {
              lastEventIdRef.current = evt.id;
            }
            handleSSEEvent(evt.type, evt.data, runCounter);
          }
        }

        setIsStreaming(false);
      } catch (err: any) {
        if (err.name === "AbortError") return;

        // Attempt reconnection
        const now = Date.now();
        failTimestampsRef.current = failTimestampsRef.current.filter(
          (ts) => now - ts < SSE_FAILURE_WINDOW_MS,
        );
        failTimestampsRef.current.push(now);

        if (failTimestampsRef.current.length >= MAX_SSE_FAILURES) {
          // Switch to polling fallback — consumer should handle polling
          // via tRPC agency.getRun when isPollingFallback is true
          setIsPollingFallback(true);
          setIsStreaming(false);
          return;
        }

        // Exponential backoff: 1s, 2s, 4s
        const attempt = failTimestampsRef.current.length;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        reconnectTimerRef.current = setTimeout(() => {
          // Guard: skip reconnect if a new connect() was called or hook unmounted
          if (abortRef.current?.signal.aborted) return;
          if (runCounterRef.current !== runCounter) return;
          startSSEConnection(params, runCounter);
        }, delay);
      }
    })();
  }

  function handleSSEEvent(type: string, rawData: string, runCounter: number) {
    let data: any;
    try {
      data = JSON.parse(rawData);
    } catch {
      return;
    }

    switch (type) {
      case "meta":
      case "run_started": {
        const metaRunId = data.runId || data.run_id;
        if (metaRunId) {
          runIdRef.current = metaRunId;
        }
        setIsStreaming(true);
        break;
      }

      case "agent_switch": {
        // Support both new format (data.to) and legacy (data.agentName)
        const newAgent = data.to || data.agentName || data.agent_name || "";
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

      case "text_delta": {
        // New event: text_delta uses `delta` field
        const token = data.delta || "";
        streamingMsgRef.current += token;
        const currentContent = streamingMsgRef.current;
        const agent = data.agentName || data.agent_name || streamingAgentRef.current;
        const streamId = `stream-${runCounter}-${agent}`;

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

      case "token": {
        // Legacy event: token uses `token` field
        const token = data.token || data.content || "";
        streamingMsgRef.current += token;
        const currentContent = streamingMsgRef.current;
        const agent =
          data.agentName ||
          data.agent_name ||
          streamingAgentRef.current;
        const streamId = `stream-${runCounter}-${agent}`;

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

      case "tool_start": {
        const toolCallId = data.toolCallId || data.tool_call_id || "";
        const toolName = data.toolName || data.tool_name || "";
        const agentName = data.agentName || data.agent_name || streamingAgentRef.current;

        setToolCalls((prev) => [
          ...prev,
          {
            toolCallId,
            toolName,
            agentName,
            status: "running",
            startedAt: Date.now(),
          },
        ]);

        setActivityEvents((prev) => [
          ...prev,
          {
            type: "tool_start",
            agentName,
            timestamp: Date.now(),
            data,
          },
        ]);
        break;
      }

      case "tool_progress": {
        const toolCallId = data.toolCallId || data.tool_call_id || "";
        const progressMessage = data.message || data.status || "";

        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.toolCallId === toolCallId
              ? { ...tc, progressMessage }
              : tc,
          ),
        );

        setActivityEvents((prev) => [
          ...prev,
          {
            type: "tool_progress",
            agentName: streamingAgentRef.current,
            timestamp: Date.now(),
            data,
          },
        ]);
        break;
      }

      case "tool_end": {
        const toolCallId = data.toolCallId || data.tool_call_id || "";
        const status = data.status === "error" ? "error" : "success";

        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.toolCallId === toolCallId
              ? { ...tc, status, result: data.result, endedAt: Date.now() }
              : tc,
          ),
        );

        setActivityEvents((prev) => [
          ...prev,
          {
            type: "tool_end",
            agentName: streamingAgentRef.current,
            timestamp: Date.now(),
            data,
          },
        ]);
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

      case "guardrail_trigger": {
        const evt: GuardrailEvent = {
          type: data.type || "input",
          guardrailName: data.guardrailName || data.guardrail_name || "",
          action: data.action || "",
          timestamp: Date.now(),
        };
        setGuardrailEvents((prev) => [...prev, evt]);
        setActivityEvents((prev) => [
          ...prev,
          {
            type: "guardrail_trigger",
            agentName: streamingAgentRef.current,
            timestamp: Date.now(),
            data,
          },
        ]);
        onGuardrailTriggerRef.current?.(evt);
        break;
      }

      case "approval_required": {
        const req: ApprovalRequest = {
          approvalKey: data.approvalKey || data.approval_key || "",
          step: data.step || "",
          summary: data.summary || "",
          agentName: data.agentName || data.agent_name || streamingAgentRef.current,
          timestamp: Date.now(),
        };
        setPendingApproval(req);
        setActivityEvents((prev) => [
          ...prev,
          {
            type: "approval_required",
            agentName: req.agentName,
            timestamp: Date.now(),
            data,
          },
        ]);
        onApprovalRequiredRef.current?.(req);
        break;
      }

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

      case "run_complete":
      case "run_finished": {
        const credits = data.creditsUsed ?? data.total_credits ?? data.usage?.cost ?? 0;
        setCreditsUsed(credits);
        setIsStreaming(false);
        setPendingApproval(null);
        // Finalize streaming message
        setMessages((prev) =>
          prev.map((m) =>
            m.isStreaming ? { ...m, isStreaming: false } : m,
          ),
        );
        streamingMsgRef.current = "";
        streamingAgentRef.current = "";
        onRunFinishedRef.current?.(credits, runIdRef.current);
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

  return {
    messages,
    activeAgent,
    isStreaming,
    error,
    creditsUsed,
    activityEvents,
    toolCalls,
    guardrailEvents,
    pendingApproval,
    isPollingFallback,
    connect,
    disconnect,
    cancel,
  };
}
