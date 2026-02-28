diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index e7c5f4c..e611040 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -87,6 +87,8 @@ const BlogPost = lazy(() => import("./pages/BlogPost"));
 const DomainBlogAdmin = lazy(() => import("./pages/DomainBlogAdmin"));
 const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
 const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
+const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
+const AgencyChat = lazy(() => import("./pages/AgencyChat"));
 const Workflows = lazy(() => import("./pages/Workflows"));
 const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
 const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
@@ -159,6 +161,8 @@ function Router() {
         <Route path="/signup" component={Signup} />
         <Route path="/forgot-password" component={ForgotPassword} />
         <Route path="/chat" component={Chat} />
+        <Route path="/agencies" component={AgencyBrowser} />
+        <Route path="/agencies/:id" component={AgencyChat} />
         <Route path="/workflows" component={Workflows} />
         <Route path="/workflows/editor" component={WorkflowEditor} />
         <Route path="/workflows/gallery" component={WorkflowGallery} />
diff --git a/apps/web/client/src/components/agency/AgencyActivityPanel.tsx b/apps/web/client/src/components/agency/AgencyActivityPanel.tsx
new file mode 100644
index 0000000..a0ed51c
--- /dev/null
+++ b/apps/web/client/src/components/agency/AgencyActivityPanel.tsx
@@ -0,0 +1,116 @@
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { X, Activity, ArrowRight, Wrench, Loader2 } from "lucide-react";
+import { cn } from "@/lib/utils";
+import type { AgencyActivityEvent } from "@/hooks/useAgencyStream";
+
+interface AgencyActivityPanelProps {
+  activityEvents: AgencyActivityEvent[];
+  activeAgent: string | null;
+  isStreaming: boolean;
+  onClose: () => void;
+}
+
+const AGENT_COLORS = [
+  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
+  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
+  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
+  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
+  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
+];
+
+function getAgentColor(name: string): string {
+  let hash = 0;
+  for (let i = 0; i < name.length; i++) {
+    hash = (hash << 5) - hash + name.charCodeAt(i);
+  }
+  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
+}
+
+export default function AgencyActivityPanel({
+  activityEvents,
+  activeAgent,
+  isStreaming,
+  onClose,
+}: AgencyActivityPanelProps) {
+  return (
+    <div className="flex h-full flex-col border-l bg-muted/30">
+      <div className="flex items-center justify-between border-b px-4 py-3">
+        <div className="flex items-center gap-2">
+          <Activity className="h-4 w-4" />
+          <span className="text-sm font-medium">Agent Activity</span>
+          {isStreaming && (
+            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
+          )}
+        </div>
+        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
+          <X className="h-4 w-4" />
+        </Button>
+      </div>
+
+      {activeAgent && (
+        <div className="border-b px-4 py-2">
+          <div className="flex items-center gap-2 text-xs text-muted-foreground">
+            <span>Active:</span>
+            <Badge variant="secondary" className={cn("text-xs", getAgentColor(activeAgent))}>
+              {activeAgent}
+            </Badge>
+          </div>
+        </div>
+      )}
+
+      <ScrollArea className="flex-1 px-4 py-2">
+        <div className="space-y-3">
+          {activityEvents.length === 0 && (
+            <p className="py-8 text-center text-xs text-muted-foreground">
+              Agent activity will appear here during a run.
+            </p>
+          )}
+
+          {activityEvents.map((evt, i) => (
+            <div key={i} className="flex gap-2 text-xs">
+              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
+                {evt.type === "agent_switch" && (
+                  <ArrowRight className="h-3 w-3 text-blue-500" />
+                )}
+                {evt.type === "tool_call" && (
+                  <Wrench className="h-3 w-3 text-amber-500" />
+                )}
+                {evt.type === "tool_result" && (
+                  <Activity className="h-3 w-3 text-green-500" />
+                )}
+                {evt.type === "handoff" && (
+                  <ArrowRight className="h-3 w-3 text-purple-500" />
+                )}
+              </div>
+              <div className="min-w-0 flex-1">
+                <div className="flex items-center gap-1">
+                  <Badge
+                    variant="secondary"
+                    className={cn("text-[10px] px-1 py-0", getAgentColor(evt.agentName))}
+                  >
+                    {evt.agentName}
+                  </Badge>
+                  <span className="text-muted-foreground">
+                    {evt.type === "agent_switch" && "switched to active"}
+                    {evt.type === "tool_call" &&
+                      `called ${(evt.data as any).toolName || (evt.data as any).tool_name || "tool"}`}
+                    {evt.type === "tool_result" &&
+                      `result from ${(evt.data as any).toolName || (evt.data as any).tool_name || "tool"}`}
+                    {evt.type === "handoff" && "handed off"}
+                  </span>
+                </div>
+                {evt.type === "tool_result" && (evt.data as any).duration_ms && (
+                  <span className="text-muted-foreground">
+                    {((evt.data as any).duration_ms / 1000).toFixed(1)}s
+                  </span>
+                )}
+              </div>
+            </div>
+          ))}
+        </div>
+      </ScrollArea>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts b/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts
new file mode 100644
index 0000000..c5fcce5
--- /dev/null
+++ b/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts
@@ -0,0 +1,179 @@
+/**
+ * @vitest-environment jsdom
+ */
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+import { renderHook, act } from "@testing-library/react";
+import { useAgencyStream } from "../useAgencyStream";
+
+function makeSSEResponse(events: string): Response {
+  const enc = new TextEncoder();
+  const stream = new ReadableStream<Uint8Array>({
+    start(controller) {
+      controller.enqueue(enc.encode(events));
+      controller.close();
+    },
+  });
+  return new Response(stream, {
+    status: 200,
+    headers: { "content-type": "text/event-stream" },
+  });
+}
+
+describe("useAgencyStream", () => {
+  const originalFetch = globalThis.fetch;
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  afterEach(() => {
+    globalThis.fetch = originalFetch;
+    vi.restoreAllMocks();
+  });
+
+  it("connects to stream endpoint with correct method and credentials", async () => {
+    const fetchSpy = vi.fn().mockResolvedValue(
+      makeSSEResponse(`event: run_finished\ndata: {"creditsUsed":0}\n\n`),
+    );
+    globalThis.fetch = fetchSpy;
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({
+        agencyId: "ag-1",
+        conversationId: "conv-1",
+        message: "hello",
+      });
+      // Let the async stream processing complete
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    expect(fetchSpy).toHaveBeenCalledWith(
+      "/api/v1/agency/stream",
+      expect.objectContaining({
+        method: "POST",
+        credentials: "include",
+        headers: { "Content-Type": "application/json" },
+      }),
+    );
+  });
+
+  it("parses SSE token events and accumulates content", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: run_started\ndata: {"runId":"r1"}\n\n` +
+        `event: agent_switch\ndata: {"agentName":"Researcher"}\n\n` +
+        `event: token\ndata: {"token":"Hello","agentName":"Researcher"}\n\n` +
+        `event: token\ndata: {"token":" world","agentName":"Researcher"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0.5}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({
+        agencyId: "ag-1",
+        message: "test",
+      });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    // Should have user message + assistant message
+    expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
+    const assistantMsg = result.current.messages.find(
+      (m) => m.role === "assistant",
+    );
+    expect(assistantMsg?.content).toBe("Hello world");
+    expect(assistantMsg?.agentName).toBe("Researcher");
+  });
+
+  it("handles keepalive comments without state change", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `: keepalive\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    // Only user message, no phantom messages from keepalive
+    const assistantMsgs = result.current.messages.filter(
+      (m) => m.role === "assistant",
+    );
+    expect(assistantMsgs.length).toBe(0);
+  });
+
+  it("handles HTTP error from stream endpoint", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      new Response(JSON.stringify({ error: "Insufficient credits" }), {
+        status: 402,
+        headers: { "content-type": "application/json" },
+      }),
+    );
+
+    const onError = vi.fn();
+    const { result } = renderHook(() => useAgencyStream({ onError }));
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    expect(result.current.error).toBe("Insufficient credits");
+    expect(result.current.isStreaming).toBe(false);
+    expect(onError).toHaveBeenCalledWith("Insufficient credits");
+  });
+
+  it("tracks active agent via agent_switch events", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: agent_switch\ndata: {"agentName":"Writer"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    // activeAgent may have been set then cleared on run_finished
+    // Check activity events instead
+    const switchEvents = result.current.activityEvents.filter(
+      (e) => e.type === "agent_switch",
+    );
+    expect(switchEvents.length).toBe(1);
+    expect(switchEvents[0].agentName).toBe("Writer");
+  });
+
+  it("calls onRunFinished with credits used", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: run_finished\ndata: {"creditsUsed":1.25}\n\n`,
+      ),
+    );
+
+    const onRunFinished = vi.fn();
+    const { result } = renderHook(() =>
+      useAgencyStream({ onRunFinished }),
+    );
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    expect(onRunFinished).toHaveBeenCalledWith(1.25);
+    expect(result.current.creditsUsed).toBe(1.25);
+  });
+});
diff --git a/apps/web/client/src/hooks/useAgencyQuery.ts b/apps/web/client/src/hooks/useAgencyQuery.ts
new file mode 100644
index 0000000..f40f25b
--- /dev/null
+++ b/apps/web/client/src/hooks/useAgencyQuery.ts
@@ -0,0 +1,32 @@
+import { trpc } from "@/lib/trpc";
+
+export function useAgencyList() {
+  return trpc.agency.list.useQuery();
+}
+
+export function useAgencyById(agencyId: string | undefined) {
+  return trpc.agency.getById.useQuery(
+    { agencyId: agencyId! },
+    { enabled: !!agencyId },
+  );
+}
+
+export function useAgencyConversations(agencyId: string | undefined) {
+  return trpc.agency.listConversations.useQuery(
+    { agencyId: agencyId! },
+    { enabled: !!agencyId },
+  );
+}
+
+export function useCreateAgency() {
+  const utils = trpc.useUtils();
+  return trpc.agency.create.useMutation({
+    onSuccess: () => {
+      utils.agency.list.invalidate();
+    },
+  });
+}
+
+export function useSendAgencyMessage() {
+  return trpc.agency.sendMessage.useMutation();
+}
diff --git a/apps/web/client/src/hooks/useAgencyStream.ts b/apps/web/client/src/hooks/useAgencyStream.ts
new file mode 100644
index 0000000..582bc91
--- /dev/null
+++ b/apps/web/client/src/hooks/useAgencyStream.ts
@@ -0,0 +1,318 @@
+import { useState, useCallback, useRef } from "react";
+
+export interface AgencyStreamMessage {
+  id: string;
+  role: "user" | "assistant";
+  content: string;
+  agentName?: string;
+  isStreaming?: boolean;
+  creditsUsed?: number;
+}
+
+export interface AgencyActivityEvent {
+  type: "agent_switch" | "tool_call" | "tool_result" | "handoff";
+  agentName: string;
+  timestamp: number;
+  data: Record<string, unknown>;
+}
+
+export interface UseAgencyStreamOptions {
+  onRunFinished?: (creditsUsed: number) => void;
+  onError?: (error: string) => void;
+}
+
+export interface UseAgencyStreamReturn {
+  messages: AgencyStreamMessage[];
+  activeAgent: string | null;
+  isStreaming: boolean;
+  error: string | null;
+  creditsUsed: number;
+  activityEvents: AgencyActivityEvent[];
+  connect: (params: {
+    agencyId: string;
+    conversationId?: string;
+    message: string;
+  }) => void;
+  disconnect: () => void;
+}
+
+function parseSSEEvents(
+  buffer: string,
+): { events: Array<{ type: string; data: string }>; remaining: string } {
+  const events: Array<{ type: string; data: string }> = [];
+  const blocks = buffer.split("\n\n");
+  // Last element may be incomplete
+  const remaining = blocks.pop() || "";
+
+  for (const block of blocks) {
+    if (!block.trim()) continue;
+    let eventType = "message";
+    let dataLines: string[] = [];
+
+    for (const line of block.split("\n")) {
+      if (line.startsWith(":")) continue; // comment/keepalive
+      if (line.startsWith("event: ")) {
+        eventType = line.slice(7).trim();
+      } else if (line.startsWith("data: ")) {
+        dataLines.push(line.slice(6));
+      } else if (line.startsWith("data:")) {
+        dataLines.push(line.slice(5));
+      }
+    }
+
+    if (dataLines.length > 0) {
+      events.push({ type: eventType, data: dataLines.join("\n") });
+    }
+  }
+
+  return { events, remaining };
+}
+
+export function useAgencyStream(
+  options?: UseAgencyStreamOptions,
+): UseAgencyStreamReturn {
+  const [messages, setMessages] = useState<AgencyStreamMessage[]>([]);
+  const [activeAgent, setActiveAgent] = useState<string | null>(null);
+  const [isStreaming, setIsStreaming] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const [creditsUsed, setCreditsUsed] = useState(0);
+  const [activityEvents, setActivityEvents] = useState<
+    AgencyActivityEvent[]
+  >([]);
+
+  const abortRef = useRef<AbortController | null>(null);
+  const streamingMsgRef = useRef<string>("");
+  const streamingAgentRef = useRef<string>("");
+
+  const disconnect = useCallback(() => {
+    if (abortRef.current) {
+      abortRef.current.abort();
+      abortRef.current = null;
+    }
+    setIsStreaming(false);
+  }, []);
+
+  const connect = useCallback(
+    (params: {
+      agencyId: string;
+      conversationId?: string;
+      message: string;
+    }) => {
+      // Reset state
+      disconnect();
+      setError(null);
+      setCreditsUsed(0);
+      streamingMsgRef.current = "";
+      streamingAgentRef.current = "";
+
+      // Add user message
+      const userMsg: AgencyStreamMessage = {
+        id: `user-${Date.now()}`,
+        role: "user",
+        content: params.message,
+      };
+      setMessages((prev) => [...prev, userMsg]);
+      setIsStreaming(true);
+
+      const controller = new AbortController();
+      abortRef.current = controller;
+
+      (async () => {
+        try {
+          const res = await fetch("/api/v1/agency/stream", {
+            method: "POST",
+            headers: { "Content-Type": "application/json" },
+            credentials: "include",
+            body: JSON.stringify({
+              agencyId: params.agencyId,
+              conversationId: params.conversationId,
+              message: params.message,
+            }),
+            signal: controller.signal,
+          });
+
+          if (!res.ok) {
+            const err = await res.json().catch(() => ({ error: "Stream error" }));
+            setError(err.error || `HTTP ${res.status}`);
+            setIsStreaming(false);
+            options?.onError?.(err.error || `HTTP ${res.status}`);
+            return;
+          }
+
+          if (!res.body) {
+            setError("No response body");
+            setIsStreaming(false);
+            return;
+          }
+
+          const reader = res.body.getReader();
+          const decoder = new TextDecoder();
+          let buffer = "";
+
+          while (true) {
+            const { done, value } = await reader.read();
+            if (done) break;
+
+            buffer += decoder.decode(value, { stream: true });
+            const { events, remaining } = parseSSEEvents(buffer);
+            buffer = remaining;
+
+            for (const evt of events) {
+              handleSSEEvent(evt.type, evt.data);
+            }
+          }
+
+          // Process any remaining buffer
+          if (buffer.trim()) {
+            const { events } = parseSSEEvents(buffer + "\n\n");
+            for (const evt of events) {
+              handleSSEEvent(evt.type, evt.data);
+            }
+          }
+
+          setIsStreaming(false);
+        } catch (err: any) {
+          if (err.name === "AbortError") return;
+          setError(err.message || "Connection lost");
+          setIsStreaming(false);
+          options?.onError?.(err.message || "Connection lost");
+        }
+      })();
+
+      function handleSSEEvent(type: string, rawData: string) {
+        let data: any;
+        try {
+          data = JSON.parse(rawData);
+        } catch {
+          return;
+        }
+
+        switch (type) {
+          case "run_started":
+            setIsStreaming(true);
+            break;
+
+          case "agent_switch":
+            setActiveAgent(data.agentName || data.agent_name || null);
+            streamingAgentRef.current =
+              data.agentName || data.agent_name || "";
+            setActivityEvents((prev) => [
+              ...prev,
+              {
+                type: "agent_switch",
+                agentName: data.agentName || data.agent_name || "",
+                timestamp: Date.now(),
+                data,
+              },
+            ]);
+            break;
+
+          case "token": {
+            const token = data.token || data.content || "";
+            streamingMsgRef.current += token;
+            const currentContent = streamingMsgRef.current;
+            const agent =
+              data.agentName ||
+              data.agent_name ||
+              streamingAgentRef.current;
+            const streamId = `stream-${agent}`;
+
+            setMessages((prev) => {
+              const existing = prev.find(
+                (m) => m.id === streamId && m.isStreaming,
+              );
+              if (existing) {
+                return prev.map((m) =>
+                  m.id === streamId
+                    ? { ...m, content: currentContent }
+                    : m,
+                );
+              }
+              return [
+                ...prev,
+                {
+                  id: streamId,
+                  role: "assistant",
+                  content: currentContent,
+                  agentName: agent,
+                  isStreaming: true,
+                },
+              ];
+            });
+            break;
+          }
+
+          case "tool_call":
+            setActivityEvents((prev) => [
+              ...prev,
+              {
+                type: "tool_call",
+                agentName:
+                  data.agentName || data.agent_name || "",
+                timestamp: Date.now(),
+                data,
+              },
+            ]);
+            break;
+
+          case "tool_result":
+            setActivityEvents((prev) => [
+              ...prev,
+              {
+                type: "tool_result",
+                agentName:
+                  data.agentName || data.agent_name || "",
+                timestamp: Date.now(),
+                data,
+              },
+            ]);
+            break;
+
+          case "run_finished": {
+            const credits = data.creditsUsed ?? data.total_credits ?? 0;
+            setCreditsUsed(credits);
+            setIsStreaming(false);
+            // Finalize streaming message
+            setMessages((prev) =>
+              prev.map((m) =>
+                m.isStreaming ? { ...m, isStreaming: false } : m,
+              ),
+            );
+            streamingMsgRef.current = "";
+            streamingAgentRef.current = "";
+            options?.onRunFinished?.(credits);
+            break;
+          }
+
+          case "run_error":
+          case "error":
+            setError(
+              data.message || data.error || "Agency run failed",
+            );
+            setIsStreaming(false);
+            setMessages((prev) =>
+              prev.map((m) =>
+                m.isStreaming ? { ...m, isStreaming: false } : m,
+              ),
+            );
+            options?.onError?.(
+              data.message || data.error || "Agency run failed",
+            );
+            break;
+        }
+      }
+    },
+    [disconnect, options],
+  );
+
+  return {
+    messages,
+    activeAgent,
+    isStreaming,
+    error,
+    creditsUsed,
+    activityEvents,
+    connect,
+    disconnect,
+  };
+}
diff --git a/apps/web/client/src/pages/AgencyBrowser.tsx b/apps/web/client/src/pages/AgencyBrowser.tsx
new file mode 100644
index 0000000..b4aeeb6
--- /dev/null
+++ b/apps/web/client/src/pages/AgencyBrowser.tsx
@@ -0,0 +1,159 @@
+import { useEffect, useState } from "react";
+import { useLocation } from "wouter";
+import { useAuth } from "@/contexts/AuthContext";
+import { useAgencyList } from "@/hooks/useAgencyQuery";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Badge } from "@/components/ui/badge";
+import {
+  Users,
+  Plus,
+  Search,
+  Loader2,
+  MessageSquare,
+  Edit,
+} from "lucide-react";
+import { cn } from "@/lib/utils";
+
+const STATUS_STYLES: Record<string, string> = {
+  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
+  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
+  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
+};
+
+export default function AgencyBrowser() {
+  const { isLoading: authLoading, isAuthenticated } = useAuth();
+  const [, setLocation] = useLocation();
+  const [search, setSearch] = useState("");
+
+  const { data: agencies, isLoading } = useAgencyList();
+
+  useEffect(() => {
+    if (!authLoading && !isAuthenticated) {
+      setLocation("/login");
+    }
+  }, [authLoading, isAuthenticated, setLocation]);
+
+  if (authLoading || isLoading) {
+    return (
+      <div className="flex h-full items-center justify-center">
+        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  const filtered = (agencies || []).filter(
+    (a: any) =>
+      !search ||
+      a.name?.toLowerCase().includes(search.toLowerCase()) ||
+      a.description?.toLowerCase().includes(search.toLowerCase()),
+  );
+
+  return (
+    <div className="mx-auto max-w-6xl px-4 py-6">
+      {/* Header */}
+      <div className="mb-6 flex items-center justify-between">
+        <div className="flex items-center gap-3">
+          <Users className="h-6 w-6" />
+          <h1 className="text-2xl font-bold">Agencies</h1>
+        </div>
+        <Button onClick={() => setLocation("/agencies/new/edit")}>
+          <Plus className="mr-2 h-4 w-4" />
+          Create Agency
+        </Button>
+      </div>
+
+      {/* Search */}
+      <div className="relative mb-6">
+        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
+        <Input
+          value={search}
+          onChange={(e) => setSearch(e.target.value)}
+          placeholder="Search agencies..."
+          className="pl-9"
+        />
+      </div>
+
+      {/* Grid */}
+      {filtered.length === 0 ? (
+        <div className="py-16 text-center text-muted-foreground">
+          <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
+          <p className="text-lg font-medium">No agencies found</p>
+          <p className="text-sm">
+            {search
+              ? "Try a different search term."
+              : "Create your first agency to get started."}
+          </p>
+        </div>
+      ) : (
+        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
+          {filtered.map((agency: any) => (
+            <div
+              key={agency.id}
+              className="group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50"
+              onClick={() => setLocation(`/agencies/${agency.id}`)}
+            >
+              <div className="mb-2 flex items-start justify-between">
+                <h3 className="font-semibold">{agency.name}</h3>
+                <Badge
+                  variant="secondary"
+                  className={cn(
+                    "text-xs",
+                    STATUS_STYLES[agency.status] || "",
+                  )}
+                >
+                  {agency.status || "draft"}
+                </Badge>
+              </div>
+
+              {agency.description && (
+                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
+                  {agency.description}
+                </p>
+              )}
+
+              <div className="flex items-center justify-between text-xs text-muted-foreground">
+                <div className="flex items-center gap-3">
+                  <span className="flex items-center gap-1">
+                    <Users className="h-3 w-3" />
+                    {agency.agentCount ?? 0} agents
+                  </span>
+                  {agency.creditMultiplier > 1 && (
+                    <span className="text-amber-500">
+                      {agency.creditMultiplier}x credits
+                    </span>
+                  )}
+                </div>
+
+                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
+                  <Button
+                    variant="ghost"
+                    size="icon"
+                    className="h-7 w-7"
+                    onClick={(e) => {
+                      e.stopPropagation();
+                      setLocation(`/agencies/${agency.id}`);
+                    }}
+                  >
+                    <MessageSquare className="h-3 w-3" />
+                  </Button>
+                  <Button
+                    variant="ghost"
+                    size="icon"
+                    className="h-7 w-7"
+                    onClick={(e) => {
+                      e.stopPropagation();
+                      setLocation(`/agencies/${agency.id}/edit`);
+                    }}
+                  >
+                    <Edit className="h-3 w-3" />
+                  </Button>
+                </div>
+              </div>
+            </div>
+          ))}
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/AgencyChat.tsx b/apps/web/client/src/pages/AgencyChat.tsx
new file mode 100644
index 0000000..a1449cb
--- /dev/null
+++ b/apps/web/client/src/pages/AgencyChat.tsx
@@ -0,0 +1,285 @@
+import { useEffect, useState, useRef } from "react";
+import { useRoute, useLocation } from "wouter";
+import { useAuth } from "@/contexts/AuthContext";
+import { useAgencyStream } from "@/hooks/useAgencyStream";
+import { useAgencyById, useAgencyConversations } from "@/hooks/useAgencyQuery";
+import AgencyActivityPanel from "@/components/agency/AgencyActivityPanel";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { ScrollArea } from "@/components/ui/scroll-area";
+import { Textarea } from "@/components/ui/textarea";
+import {
+  Send,
+  Loader2,
+  PanelRightClose,
+  PanelRightOpen,
+  AlertCircle,
+  Users,
+  CreditCard,
+} from "lucide-react";
+import { cn } from "@/lib/utils";
+
+const AGENT_COLORS = [
+  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
+  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
+  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
+  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
+  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
+];
+
+function getAgentColor(name: string): string {
+  let hash = 0;
+  for (let i = 0; i < name.length; i++) {
+    hash = (hash << 5) - hash + name.charCodeAt(i);
+  }
+  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
+}
+
+export default function AgencyChat() {
+  const { isLoading: authLoading, isAuthenticated } = useAuth();
+  const [, setLocation] = useLocation();
+  const [matched, params] = useRoute("/agencies/:id");
+  const agencyId = (params as any)?.id as string | undefined;
+
+  const [input, setInput] = useState("");
+  const [panelOpen, setPanelOpen] = useState(
+    () => window.innerWidth >= 1024,
+  );
+  const [conversationId, setConversationId] = useState<string | undefined>();
+  const scrollRef = useRef<HTMLDivElement>(null);
+
+  const { data: agency, isLoading: agencyLoading } =
+    useAgencyById(agencyId);
+
+  const stream = useAgencyStream({
+    onRunFinished: () => {
+      // Could invalidate conversations here
+    },
+  });
+
+  // Auth redirect
+  useEffect(() => {
+    if (!authLoading && !isAuthenticated) {
+      setLocation("/login");
+    }
+  }, [authLoading, isAuthenticated, setLocation]);
+
+  // Auto-scroll on new messages
+  useEffect(() => {
+    if (scrollRef.current) {
+      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
+    }
+  }, [stream.messages]);
+
+  const handleSend = () => {
+    if (!input.trim() || !agencyId || stream.isStreaming) return;
+    stream.connect({
+      agencyId,
+      conversationId,
+      message: input.trim(),
+    });
+    setInput("");
+  };
+
+  const handleKeyDown = (e: React.KeyboardEvent) => {
+    if (e.key === "Enter" && !e.shiftKey) {
+      e.preventDefault();
+      handleSend();
+    }
+  };
+
+  if (authLoading || agencyLoading) {
+    return (
+      <div className="flex h-full items-center justify-center">
+        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (!matched || !agencyId) {
+    return (
+      <div className="flex h-full items-center justify-center">
+        <p className="text-muted-foreground">Agency not found</p>
+      </div>
+    );
+  }
+
+  return (
+    <div className="flex h-full flex-col">
+      {/* Header */}
+      <div className="flex items-center justify-between border-b px-4 py-3">
+        <div className="flex items-center gap-3">
+          <Users className="h-5 w-5 text-muted-foreground" />
+          <div>
+            <h1 className="text-lg font-semibold">
+              {agency?.name || "Agency"}
+            </h1>
+            {stream.activeAgent && (
+              <div className="flex items-center gap-1 text-xs text-muted-foreground">
+                <span>Active:</span>
+                <Badge
+                  variant="secondary"
+                  className={cn(
+                    "text-[10px] px-1 py-0",
+                    getAgentColor(stream.activeAgent),
+                  )}
+                >
+                  {stream.activeAgent}
+                </Badge>
+              </div>
+            )}
+          </div>
+        </div>
+
+        <div className="flex items-center gap-2">
+          {stream.creditsUsed > 0 && (
+            <div className="flex items-center gap-1 text-xs text-muted-foreground">
+              <CreditCard className="h-3 w-3" />
+              <span>{stream.creditsUsed.toFixed(2)} credits</span>
+            </div>
+          )}
+          <Button
+            variant="ghost"
+            size="icon"
+            onClick={() => setPanelOpen(!panelOpen)}
+          >
+            {panelOpen ? (
+              <PanelRightClose className="h-4 w-4" />
+            ) : (
+              <PanelRightOpen className="h-4 w-4" />
+            )}
+          </Button>
+        </div>
+      </div>
+
+      {/* Main Content */}
+      <div className="flex flex-1 overflow-hidden">
+        {/* Conversation Thread */}
+        <div className="flex flex-1 flex-col">
+          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
+            <div className="mx-auto max-w-3xl space-y-4">
+              {stream.messages.length === 0 && !stream.isStreaming && (
+                <div className="py-16 text-center text-muted-foreground">
+                  <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
+                  <p className="text-lg font-medium">
+                    Start a conversation
+                  </p>
+                  <p className="text-sm">
+                    Send a message to begin interacting with this
+                    agency.
+                  </p>
+                </div>
+              )}
+
+              {stream.messages.map((msg) => (
+                <div
+                  key={msg.id}
+                  className={cn(
+                    "flex",
+                    msg.role === "user"
+                      ? "justify-end"
+                      : "justify-start",
+                  )}
+                >
+                  <div
+                    className={cn(
+                      "max-w-[80%] rounded-lg px-4 py-2",
+                      msg.role === "user"
+                        ? "bg-primary text-primary-foreground"
+                        : "bg-muted",
+                    )}
+                  >
+                    {msg.role === "assistant" && msg.agentName && (
+                      <Badge
+                        variant="secondary"
+                        className={cn(
+                          "mb-1 text-[10px] px-1 py-0",
+                          getAgentColor(msg.agentName),
+                        )}
+                      >
+                        {msg.agentName}
+                      </Badge>
+                    )}
+                    <p className="whitespace-pre-wrap text-sm">
+                      {msg.content}
+                      {msg.isStreaming && (
+                        <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />
+                      )}
+                    </p>
+                  </div>
+                </div>
+              ))}
+
+              {stream.error && (
+                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
+                  <AlertCircle className="h-4 w-4 shrink-0" />
+                  <span>{stream.error}</span>
+                  <Button
+                    variant="outline"
+                    size="sm"
+                    className="ml-auto"
+                    onClick={() => {
+                      if (stream.messages.length > 0) {
+                        const lastUserMsg = [...stream.messages]
+                          .reverse()
+                          .find((m) => m.role === "user");
+                        if (lastUserMsg && agencyId) {
+                          stream.connect({
+                            agencyId,
+                            conversationId,
+                            message: lastUserMsg.content,
+                          });
+                        }
+                      }
+                    }}
+                  >
+                    Retry
+                  </Button>
+                </div>
+              )}
+            </div>
+          </ScrollArea>
+
+          {/* Input Bar */}
+          <div className="border-t p-4">
+            <div className="mx-auto flex max-w-3xl gap-2">
+              <Textarea
+                value={input}
+                onChange={(e) => setInput(e.target.value)}
+                onKeyDown={handleKeyDown}
+                placeholder="Send a message..."
+                className="min-h-[44px] max-h-[120px] resize-none"
+                rows={1}
+                disabled={stream.isStreaming}
+              />
+              <Button
+                onClick={handleSend}
+                disabled={!input.trim() || stream.isStreaming}
+                size="icon"
+                className="shrink-0"
+              >
+                {stream.isStreaming ? (
+                  <Loader2 className="h-4 w-4 animate-spin" />
+                ) : (
+                  <Send className="h-4 w-4" />
+                )}
+              </Button>
+            </div>
+          </div>
+        </div>
+
+        {/* Activity Panel */}
+        {panelOpen && (
+          <div className="hidden w-80 lg:block">
+            <AgencyActivityPanel
+              activityEvents={stream.activityEvents}
+              activeAgent={stream.activeAgent}
+              isStreaming={stream.isStreaming}
+              onClose={() => setPanelOpen(false)}
+            />
+          </div>
+        )}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/__tests__/AgencyChat.test.tsx b/apps/web/client/src/pages/__tests__/AgencyChat.test.tsx
new file mode 100644
index 0000000..7ff0fe7
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/AgencyChat.test.tsx
@@ -0,0 +1,134 @@
+/**
+ * @vitest-environment jsdom
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen } from "@testing-library/react";
+
+// Mock wouter
+vi.mock("wouter", () => ({
+  useRoute: vi.fn(() => [true, { id: "agency-1" }]),
+  useLocation: vi.fn(() => ["/agencies/agency-1", vi.fn()]),
+}));
+
+// Mock auth
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: vi.fn(() => ({
+    isLoading: false,
+    isAuthenticated: true,
+    user: { id: "42", name: "Test" },
+  })),
+}));
+
+// Mock tRPC hooks
+vi.mock("@/hooks/useAgencyQuery", () => ({
+  useAgencyById: vi.fn(() => ({
+    data: { id: "agency-1", name: "Test Agency" },
+    isLoading: false,
+  })),
+  useAgencyConversations: vi.fn(() => ({
+    data: [],
+    isLoading: false,
+  })),
+}));
+
+// Mock stream hook
+const mockConnect = vi.fn();
+const mockDisconnect = vi.fn();
+vi.mock("@/hooks/useAgencyStream", () => ({
+  useAgencyStream: vi.fn(() => ({
+    messages: [],
+    activeAgent: null,
+    isStreaming: false,
+    error: null,
+    creditsUsed: 0,
+    activityEvents: [],
+    connect: mockConnect,
+    disconnect: mockDisconnect,
+  })),
+}));
+
+import AgencyChat from "../AgencyChat";
+
+describe("AgencyChat", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("renders agency name in header", () => {
+    render(<AgencyChat />);
+    expect(screen.getByText("Test Agency")).toBeTruthy();
+  });
+
+  it("renders empty state when no messages", () => {
+    render(<AgencyChat />);
+    expect(screen.getByText("Start a conversation")).toBeTruthy();
+  });
+
+  it("renders message input area", () => {
+    render(<AgencyChat />);
+    expect(
+      screen.getByPlaceholderText("Send a message..."),
+    ).toBeTruthy();
+  });
+
+  it("renders with messages from stream", async () => {
+    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
+    (useAgencyStream as any).mockReturnValue({
+      messages: [
+        { id: "u1", role: "user", content: "Hello" },
+        {
+          id: "a1",
+          role: "assistant",
+          content: "Hi there!",
+          agentName: "Researcher",
+        },
+      ],
+      activeAgent: "Researcher",
+      isStreaming: false,
+      error: null,
+      creditsUsed: 0.5,
+      activityEvents: [],
+      connect: mockConnect,
+      disconnect: mockDisconnect,
+    });
+
+    render(<AgencyChat />);
+    expect(screen.getByText("Hello")).toBeTruthy();
+    expect(screen.getByText("Hi there!")).toBeTruthy();
+    expect(screen.getAllByText("Researcher").length).toBeGreaterThanOrEqual(1);
+  });
+
+  it("shows error message when stream errors", async () => {
+    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
+    (useAgencyStream as any).mockReturnValue({
+      messages: [],
+      activeAgent: null,
+      isStreaming: false,
+      error: "Connection lost",
+      creditsUsed: 0,
+      activityEvents: [],
+      connect: mockConnect,
+      disconnect: mockDisconnect,
+    });
+
+    render(<AgencyChat />);
+    expect(screen.getByText("Connection lost")).toBeTruthy();
+  });
+
+  it("shows credit usage when available", async () => {
+    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
+    (useAgencyStream as any).mockReturnValue({
+      messages: [{ id: "u1", role: "user", content: "test" }],
+      activeAgent: null,
+      isStreaming: false,
+      error: null,
+      creditsUsed: 1.25,
+      activityEvents: [],
+      connect: mockConnect,
+      disconnect: mockDisconnect,
+    });
+
+    render(<AgencyChat />);
+    expect(screen.getByText("1.25 credits")).toBeTruthy();
+  });
+});
diff --git a/packages/shared/src/constants/menu.ts b/packages/shared/src/constants/menu.ts
index 2d76f48..e1f8a11 100644
--- a/packages/shared/src/constants/menu.ts
+++ b/packages/shared/src/constants/menu.ts
@@ -26,6 +26,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'media',         label: 'Media Studio',   labelTh: 'สตูดิโอ',       icon: 'Sparkles',        path: '/media-studio',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 2 },
   { id: 'skills',        label: 'Skills',         labelTh: 'ทักษะ',         icon: 'Sparkles',        path: '/settings/skills', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3 },
   { id: 'workflows',     label: 'Workflows',      labelTh: 'เวิร์กโฟลว์',    icon: 'GitBranch',       path: '/workflows',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.5 },
+  { id: 'agencies',      label: 'Agencies',       labelTh: 'เอเจนซี่',       icon: 'Users',           path: '/agencies',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.7, requiresFeature: 'AGENCY_SWARM_ENABLED' },
   { id: 'media-history', label: 'Media History',  labelTh: 'ประวัติมีเดีย',  icon: 'Clock',           path: '/media-history',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 4 },
   { id: 'document-management', label: 'Document Management', labelTh: 'จัดการเอกสาร', icon: 'FileText', path: '/document-management', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.2 },
   { id: 'presentations', label: 'Presentations', labelTh: 'พรีเซนเทชัน', icon: 'GalleryHorizontal', path: '/presentations', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.25 },
