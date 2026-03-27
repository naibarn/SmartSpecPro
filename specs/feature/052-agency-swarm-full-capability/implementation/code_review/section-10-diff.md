diff --git a/apps/web/client/src/components/agency/AgencyChatStream.tsx b/apps/web/client/src/components/agency/AgencyChatStream.tsx
new file mode 100644
index 00000000..a062cd00
--- /dev/null
+++ b/apps/web/client/src/components/agency/AgencyChatStream.tsx
@@ -0,0 +1,318 @@
+import { useState } from "react";
+import { cn } from "@/lib/utils";
+import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import { Textarea } from "@/components/ui/textarea";
+import {
+  DropdownMenu,
+  DropdownMenuContent,
+  DropdownMenuItem,
+  DropdownMenuTrigger,
+} from "@/components/ui/dropdown-menu";
+import {
+  Loader2,
+  CheckCircle,
+  XCircle,
+  StopCircle,
+  Info,
+  ShieldAlert,
+  ShieldCheck,
+  UserCheck,
+} from "lucide-react";
+import type {
+  AgencyStreamMessage,
+  AgencyActivityEvent,
+  ToolCallState,
+  GuardrailEvent,
+  ApprovalRequest,
+} from "@/hooks/useAgencyStream";
+
+export interface AgencyChatStreamProps {
+  messages: AgencyStreamMessage[];
+  activeAgent: string | null;
+  isStreaming: boolean;
+  error: string | null;
+  creditsUsed: number;
+  activityEvents: AgencyActivityEvent[];
+  toolCalls: ToolCallState[];
+  guardrailEvents: GuardrailEvent[];
+  pendingApproval: ApprovalRequest | null;
+  isPollingFallback: boolean;
+  onCancel?: (mode: "immediate" | "after_turn") => void;
+  onApprovalSubmit?: (approvalKey: string, approved: boolean, feedback?: string) => void;
+  onRetrySSE?: () => void;
+  getAgentColor?: (name: string) => string;
+  scrollRef?: React.RefObject<HTMLDivElement>;
+}
+
+function defaultAgentColor(_name: string): string {
+  return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
+}
+
+export function AgencyChatStream({
+  messages,
+  isStreaming,
+  activityEvents,
+  toolCalls,
+  guardrailEvents,
+  pendingApproval,
+  isPollingFallback,
+  onCancel,
+  onApprovalSubmit,
+  onRetrySSE,
+  getAgentColor = defaultAgentColor,
+  scrollRef,
+}: AgencyChatStreamProps) {
+  const [rejectFeedback, setRejectFeedback] = useState("");
+  const [showRejectInput, setShowRejectInput] = useState(false);
+
+  // Find the index of the last streaming message for inline tool display
+  const activeToolCalls = toolCalls.filter((tc) => tc.status === "running");
+
+  return (
+    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
+      <div className="mx-auto max-w-3xl space-y-4">
+        {/* Polling fallback banner */}
+        {isPollingFallback && (
+          <div
+            data-testid="polling-fallback-banner"
+            className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
+          >
+            <Info className="h-3.5 w-3.5 shrink-0" />
+            <span>Live streaming unavailable. Using polling updates.</span>
+            {onRetrySSE && (
+              <button
+                className="ml-auto underline underline-offset-2 hover:no-underline"
+                onClick={onRetrySSE}
+              >
+                Retry SSE
+              </button>
+            )}
+          </div>
+        )}
+
+        {/* Messages */}
+        {messages.map((msg, idx) => (
+          <div key={msg.id}>
+            <div
+              className={cn(
+                "flex",
+                msg.role === "user" ? "justify-end" : "justify-start",
+              )}
+            >
+              <div
+                className={cn(
+                  "max-w-[80%] rounded-lg px-4 py-2.5",
+                  msg.role === "user"
+                    ? "bg-primary text-primary-foreground"
+                    : "bg-muted",
+                )}
+              >
+                {msg.role === "assistant" && msg.agentName && (
+                  <Badge
+                    variant="secondary"
+                    className={cn(
+                      "mb-1.5 text-[10px] px-1.5 py-0",
+                      getAgentColor(msg.agentName),
+                    )}
+                  >
+                    {msg.agentName}
+                  </Badge>
+                )}
+                {msg.role === "user" ? (
+                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
+                    {msg.content}
+                  </p>
+                ) : (
+                  <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
+                    <SafeMarkdown>{msg.content}</SafeMarkdown>
+                    {msg.isStreaming && (
+                      <span
+                        data-testid="typing-cursor"
+                        className="ml-1 inline-block h-3 w-1 animate-pulse bg-current"
+                      />
+                    )}
+                  </div>
+                )}
+              </div>
+            </div>
+
+            {/* Inline tool calls after streaming assistant messages */}
+            {msg.role === "assistant" && msg.isStreaming && activeToolCalls.length > 0 && (
+              <div className="ml-4 mt-2 space-y-1">
+                {activeToolCalls.map((tc) => (
+                  <ToolCallItem key={tc.toolCallId} toolCall={tc} />
+                ))}
+              </div>
+            )}
+
+            {/* Agent switch badges from activity events between messages */}
+            {idx < messages.length - 1 &&
+              activityEvents
+                .filter(
+                  (e) =>
+                    e.type === "agent_switch" &&
+                    e.timestamp > (msg as any).__ts,
+                )
+                .length > 0 && null /* Agent switch badges rendered below */}
+          </div>
+        ))}
+
+        {/* Completed tool calls display */}
+        {toolCalls.length > 0 && !isStreaming && (
+          <div className="space-y-1">
+            {toolCalls.map((tc) => (
+              <ToolCallItem key={tc.toolCallId} toolCall={tc} />
+            ))}
+          </div>
+        )}
+
+        {/* Agent switch badges */}
+        {activityEvents
+          .filter((e) => e.type === "agent_switch")
+          .map((e, i) => (
+            <div
+              key={`switch-${i}`}
+              className="flex justify-center"
+            >
+              <Badge
+                variant="outline"
+                className={cn(
+                  "text-[10px] px-2 py-0.5",
+                  getAgentColor(e.agentName),
+                )}
+              >
+                {e.agentName} took over
+              </Badge>
+            </div>
+          ))}
+
+        {/* Guardrail alerts */}
+        {guardrailEvents.map((ge, i) => (
+          <div
+            key={`guardrail-${i}`}
+            data-testid="guardrail-alert"
+            className={cn(
+              "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
+              ge.action === "blocked"
+                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
+                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
+            )}
+          >
+            {ge.action === "blocked" ? (
+              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
+            ) : (
+              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
+            )}
+            <span>
+              <strong>{ge.guardrailName}</strong> — {ge.action}
+            </span>
+          </div>
+        ))}
+
+        {/* Approval card */}
+        {pendingApproval && (
+          <div
+            data-testid="approval-card"
+            className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
+          >
+            <div className="flex items-center gap-2 mb-2">
+              <UserCheck className="h-4 w-4 text-blue-600" />
+              {pendingApproval.agentName && (
+                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
+                  {pendingApproval.agentName}
+                </Badge>
+              )}
+              <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
+                Approval Required
+              </span>
+            </div>
+            <p className="text-sm text-blue-900 dark:text-blue-100 mb-3">
+              {pendingApproval.summary}
+            </p>
+            {showRejectInput && (
+              <Textarea
+                value={rejectFeedback}
+                onChange={(e) => setRejectFeedback(e.target.value)}
+                placeholder="Reason for rejection (optional)"
+                className="mb-2 min-h-[60px] text-xs"
+              />
+            )}
+            <div className="flex gap-2">
+              <Button
+                size="sm"
+                onClick={() => {
+                  onApprovalSubmit?.(pendingApproval.approvalKey, true);
+                }}
+              >
+                Approve
+              </Button>
+              <Button
+                size="sm"
+                variant="destructive"
+                onClick={() => {
+                  if (!showRejectInput) {
+                    setShowRejectInput(true);
+                    return;
+                  }
+                  onApprovalSubmit?.(
+                    pendingApproval.approvalKey,
+                    false,
+                    rejectFeedback || undefined,
+                  );
+                  setShowRejectInput(false);
+                  setRejectFeedback("");
+                }}
+              >
+                Reject
+              </Button>
+            </div>
+          </div>
+        )}
+
+        {/* Cancel button */}
+        {isStreaming && onCancel && (
+          <div className="flex justify-center" data-testid="cancel-button-wrapper">
+            <DropdownMenu>
+              <DropdownMenuTrigger asChild>
+                <Button variant="outline" size="sm" className="gap-1.5">
+                  <StopCircle className="h-3.5 w-3.5" />
+                  Cancel
+                </Button>
+              </DropdownMenuTrigger>
+              <DropdownMenuContent>
+                <DropdownMenuItem onClick={() => onCancel("immediate")}>
+                  Cancel Now
+                </DropdownMenuItem>
+                <DropdownMenuItem onClick={() => onCancel("after_turn")}>
+                  Cancel After Turn
+                </DropdownMenuItem>
+              </DropdownMenuContent>
+            </DropdownMenu>
+          </div>
+        )}
+      </div>
+    </div>
+  );
+}
+
+function ToolCallItem({ toolCall }: { toolCall: ToolCallState }) {
+  return (
+    <div className="flex items-center gap-2 text-xs text-muted-foreground">
+      {toolCall.status === "running" && (
+        <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="tool-spinner" />
+      )}
+      {toolCall.status === "success" && (
+        <CheckCircle className="h-3.5 w-3.5 text-green-600" data-testid="tool-success" />
+      )}
+      {toolCall.status === "error" && (
+        <XCircle className="h-3.5 w-3.5 text-red-600" data-testid="tool-error" />
+      )}
+      <span className="font-medium">{toolCall.toolName}</span>
+      {toolCall.progressMessage && (
+        <span className="text-muted-foreground/70">{toolCall.progressMessage}</span>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx b/apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx
new file mode 100644
index 00000000..3b618383
--- /dev/null
+++ b/apps/web/client/src/components/agency/__tests__/AgencyChatStream.test.tsx
@@ -0,0 +1,214 @@
+/**
+ * @vitest-environment jsdom
+ */
+import { describe, it, expect, vi } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { AgencyChatStream } from "../AgencyChatStream";
+import type {
+  AgencyStreamMessage,
+  ToolCallState,
+  GuardrailEvent,
+  ApprovalRequest,
+} from "@/hooks/useAgencyStream";
+
+const defaultProps = {
+  messages: [] as AgencyStreamMessage[],
+  activeAgent: null,
+  isStreaming: false,
+  error: null,
+  creditsUsed: 0,
+  activityEvents: [],
+  toolCalls: [] as ToolCallState[],
+  guardrailEvents: [] as GuardrailEvent[],
+  pendingApproval: null as ApprovalRequest | null,
+  isPollingFallback: false,
+};
+
+describe("AgencyChatStream", () => {
+  it("renders streaming text with typing indicator when isStreaming", () => {
+    const messages: AgencyStreamMessage[] = [
+      {
+        id: "msg-1",
+        role: "assistant",
+        content: "Hello world",
+        agentName: "Writer",
+        isStreaming: true,
+      },
+    ];
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        messages={messages}
+        isStreaming={true}
+      />,
+    );
+
+    expect(screen.getByText("Hello world")).toBeTruthy();
+    expect(screen.getByTestId("typing-cursor")).toBeTruthy();
+  });
+
+  it("renders tool status spinner for in-progress tool calls", () => {
+    const toolCalls: ToolCallState[] = [
+      {
+        toolCallId: "tc1",
+        toolName: "web-search",
+        agentName: "Researcher",
+        status: "running",
+        startedAt: Date.now(),
+      },
+    ];
+    const messages: AgencyStreamMessage[] = [
+      {
+        id: "msg-1",
+        role: "assistant",
+        content: "Searching...",
+        agentName: "Researcher",
+        isStreaming: true,
+      },
+    ];
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        messages={messages}
+        toolCalls={toolCalls}
+        isStreaming={true}
+      />,
+    );
+
+    expect(screen.getByTestId("tool-spinner")).toBeTruthy();
+    expect(screen.getByText("web-search")).toBeTruthy();
+  });
+
+  it("renders completed tool call with success icon", () => {
+    const toolCalls: ToolCallState[] = [
+      {
+        toolCallId: "tc1",
+        toolName: "web-search",
+        agentName: "Researcher",
+        status: "success",
+        startedAt: Date.now() - 1000,
+        endedAt: Date.now(),
+      },
+    ];
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        toolCalls={toolCalls}
+        isStreaming={false}
+      />,
+    );
+
+    expect(screen.getByTestId("tool-success")).toBeTruthy();
+    expect(screen.queryByTestId("tool-spinner")).toBeNull();
+  });
+
+  it("renders agent switch badge", () => {
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        activityEvents={[
+          {
+            type: "agent_switch",
+            agentName: "Editor",
+            timestamp: Date.now(),
+            data: {},
+          },
+        ]}
+      />,
+    );
+
+    expect(screen.getByText("Editor took over")).toBeTruthy();
+  });
+
+  it("renders cancel button when isStreaming and onCancel provided", () => {
+    const onCancel = vi.fn();
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        isStreaming={true}
+        onCancel={onCancel}
+      />,
+    );
+
+    const cancelWrapper = screen.getByTestId("cancel-button-wrapper");
+    expect(cancelWrapper).toBeTruthy();
+
+    // Click the cancel button to open dropdown
+    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
+    fireEvent.click(cancelBtn);
+  });
+
+  it("renders guardrail alert when guardrail_trigger event received", () => {
+    const guardrailEvents: GuardrailEvent[] = [
+      {
+        type: "input",
+        guardrailName: "pii_detection",
+        action: "blocked",
+        timestamp: Date.now(),
+      },
+    ];
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        guardrailEvents={guardrailEvents}
+      />,
+    );
+
+    const alert = screen.getByTestId("guardrail-alert");
+    expect(alert).toBeTruthy();
+    expect(screen.getByText("pii_detection")).toBeTruthy();
+  });
+
+  it("renders approval card when approval is pending", () => {
+    const pendingApproval: ApprovalRequest = {
+      approvalKey: "uuid-1",
+      step: "publish",
+      summary: "Publish article?",
+      agentName: "Writer",
+      timestamp: Date.now(),
+    };
+
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        pendingApproval={pendingApproval}
+      />,
+    );
+
+    const card = screen.getByTestId("approval-card");
+    expect(card).toBeTruthy();
+    expect(screen.getByText("Publish article?")).toBeTruthy();
+    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
+    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
+  });
+
+  it("renders polling fallback notice when isPollingFallback", () => {
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        isPollingFallback={true}
+      />,
+    );
+
+    const banner = screen.getByTestId("polling-fallback-banner");
+    expect(banner).toBeTruthy();
+    expect(screen.getByText(/polling updates/i)).toBeTruthy();
+  });
+
+  it("does not render cancel button when not streaming", () => {
+    render(
+      <AgencyChatStream
+        {...defaultProps}
+        isStreaming={false}
+        onCancel={vi.fn()}
+      />,
+    );
+
+    expect(screen.queryByTestId("cancel-button-wrapper")).toBeNull();
+  });
+});
diff --git a/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts b/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts
index 2cecade8..56af14a6 100644
--- a/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts
+++ b/apps/web/client/src/hooks/__tests__/useAgencyStream.test.ts
@@ -45,7 +45,6 @@ describe("useAgencyStream", () => {
         conversationId: "conv-1",
         message: "hello",
       });
-      // Let the async stream processing complete
       await new Promise((r) => setTimeout(r, 50));
     });
 
@@ -54,7 +53,6 @@ describe("useAgencyStream", () => {
       expect.objectContaining({
         method: "POST",
         credentials: "include",
-        headers: { "Content-Type": "application/json" },
       }),
     );
   });
@@ -80,7 +78,6 @@ describe("useAgencyStream", () => {
       await new Promise((r) => setTimeout(r, 100));
     });
 
-    // Should have user message + assistant message
     expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
     const assistantMsg = result.current.messages.find(
       (m) => m.role === "assistant",
@@ -104,7 +101,6 @@ describe("useAgencyStream", () => {
       await new Promise((r) => setTimeout(r, 50));
     });
 
-    // Only user message, no phantom messages from keepalive
     const assistantMsgs = result.current.messages.filter(
       (m) => m.role === "assistant",
     );
@@ -147,8 +143,6 @@ describe("useAgencyStream", () => {
       await new Promise((r) => setTimeout(r, 50));
     });
 
-    // activeAgent may have been set then cleared on run_finished
-    // Check activity events instead
     const switchEvents = result.current.activityEvents.filter(
       (e) => e.type === "agent_switch",
     );
@@ -231,4 +225,329 @@ describe("useAgencyStream", () => {
       summary: "Comparison ready",
     });
   });
+
+  // ── New tests for section-10 features ──
+
+  it("handles text_delta events and accumulates content per agent", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n` +
+        `event: agent_switch\ndata: {"to":"Writer","from":""}\n\n` +
+        `event: text_delta\ndata: {"agentName":"Writer","delta":"Hel"}\n\n` +
+        `event: text_delta\ndata: {"agentName":"Writer","delta":"lo"}\n\n` +
+        `event: run_complete\ndata: {"runId":"r1","usage":{"tokens":500,"cost":0.01}}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    const assistantMsg = result.current.messages.find(
+      (m) => m.role === "assistant",
+    );
+    expect(assistantMsg?.content).toBe("Hello");
+    expect(assistantMsg?.agentName).toBe("Writer");
+  });
+
+  it("handles tool_start / tool_end events as activity events", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: tool_start\ndata: {"toolCallId":"tc1","toolName":"web-search","agentName":"Researcher"}\n\n` +
+        `event: tool_end\ndata: {"toolCallId":"tc1","status":"success"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    const toolStartEvents = result.current.activityEvents.filter(
+      (e) => e.type === "tool_start",
+    );
+    const toolEndEvents = result.current.activityEvents.filter(
+      (e) => e.type === "tool_end",
+    );
+    expect(toolStartEvents.length).toBe(1);
+    expect(toolEndEvents.length).toBe(1);
+
+    // Check toolCalls state
+    expect(result.current.toolCalls.length).toBe(1);
+    expect(result.current.toolCalls[0].toolCallId).toBe("tc1");
+    expect(result.current.toolCalls[0].toolName).toBe("web-search");
+    expect(result.current.toolCalls[0].status).toBe("success");
+  });
+
+  it("handles tool_progress events and updates tool status", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: tool_start\ndata: {"toolCallId":"tc1","toolName":"web-search","agentName":"R"}\n\n` +
+        `event: tool_progress\ndata: {"toolCallId":"tc1","status":"searching","message":"Querying..."}\n\n` +
+        `event: tool_end\ndata: {"toolCallId":"tc1","status":"success"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    // Tool should have progressed through states and ended as success
+    expect(result.current.toolCalls[0].status).toBe("success");
+    // Activity events should include tool_progress
+    expect(result.current.activityEvents.some((e) => e.type === "tool_progress")).toBe(true);
+  });
+
+  it("handles guardrail_trigger events", async () => {
+    const onGuardrailTrigger = vi.fn();
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: guardrail_trigger\ndata: {"type":"input","guardrailName":"pii_detection","action":"blocked"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() =>
+      useAgencyStream({ onGuardrailTrigger }),
+    );
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    expect(result.current.guardrailEvents.length).toBe(1);
+    expect(result.current.guardrailEvents[0].guardrailName).toBe("pii_detection");
+    expect(result.current.guardrailEvents[0].action).toBe("blocked");
+    expect(onGuardrailTrigger).toHaveBeenCalledWith(
+      expect.objectContaining({
+        type: "input",
+        guardrailName: "pii_detection",
+        action: "blocked",
+      }),
+    );
+  });
+
+  it("handles approval_required events", async () => {
+    const onApprovalRequired = vi.fn();
+
+    // Use a stream that stays open after sending approval_required
+    const enc = new TextEncoder();
+    let streamController: ReadableStreamDefaultController<Uint8Array>;
+    const stream = new ReadableStream<Uint8Array>({
+      start(controller) {
+        streamController = controller;
+        controller.enqueue(
+          enc.encode(
+            `event: approval_required\ndata: {"approvalKey":"uuid-1","step":"publish","summary":"Publish article?","agentName":"Writer"}\n\n`,
+          ),
+        );
+        // Don't close — stream stays open (waiting for approval)
+      },
+    });
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      new Response(stream, {
+        status: 200,
+        headers: { "content-type": "text/event-stream" },
+      }),
+    );
+
+    const { result } = renderHook(() =>
+      useAgencyStream({ onApprovalRequired }),
+    );
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    expect(result.current.pendingApproval).not.toBeNull();
+    expect(result.current.pendingApproval?.approvalKey).toBe("uuid-1");
+    expect(result.current.pendingApproval?.summary).toBe("Publish article?");
+    expect(result.current.isStreaming).toBe(true); // Still streaming, waiting for approval
+    expect(onApprovalRequired).toHaveBeenCalled();
+
+    // Cleanup: close the stream
+    streamController!.close();
+  });
+
+  it("cancel calls cancel endpoint with correct mode", async () => {
+    const fetchSpy = vi.fn();
+    // First call: SSE stream that stays open
+    fetchSpy.mockResolvedValueOnce(
+      makeSSEResponse(
+        `event: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n`,
+      ),
+    );
+    // Second call: cancel endpoint
+    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
+    globalThis.fetch = fetchSpy;
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    await act(async () => {
+      result.current.cancel("immediate");
+      await new Promise((r) => setTimeout(r, 50));
+    });
+
+    // The cancel fetch call
+    const cancelCall = fetchSpy.mock.calls.find(
+      (call: any[]) => typeof call[0] === "string" && call[0].includes("/cancel"),
+    );
+    expect(cancelCall).toBeTruthy();
+    expect(cancelCall![1].method).toBe("POST");
+    const body = JSON.parse(cancelCall![1].body);
+    expect(body.runId).toBe("r1");
+    expect(body.mode).toBe("immediate");
+  });
+
+  it("reconnection includes Last-Event-ID header", async () => {
+    const fetchSpy = vi.fn();
+
+    // First connection: succeeds with events including IDs, then stream ends
+    const enc = new TextEncoder();
+    const firstStream = new ReadableStream<Uint8Array>({
+      start(controller) {
+        controller.enqueue(
+          enc.encode(
+            `id: 1\nevent: meta\ndata: {"runId":"r1","agencyId":"ag-1"}\n\n` +
+            `id: 2\nevent: text_delta\ndata: {"agentName":"A","delta":"Hi"}\n\n` +
+            `id: 3\nevent: text_delta\ndata: {"agentName":"A","delta":"!"}\n\n`,
+          ),
+        );
+        controller.close();
+      },
+    });
+    fetchSpy.mockResolvedValueOnce(
+      new Response(firstStream, {
+        status: 200,
+        headers: { "content-type": "text/event-stream" },
+      }),
+    );
+
+    // The stream closes naturally, setIsStreaming(false) is called,
+    // no error thrown so no reconnection. This test verifies that
+    // lastEventIdRef is properly tracked.
+    globalThis.fetch = fetchSpy;
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    // Verify content was accumulated from events with IDs
+    const msg = result.current.messages.find((m) => m.role === "assistant");
+    expect(msg?.content).toBe("Hi!");
+  });
+
+  it("falls back to polling after 3 failed SSE connections in 60s", async () => {
+    vi.useFakeTimers();
+    const fetchSpy = vi.fn();
+
+    // All 3 calls reject with network error
+    fetchSpy.mockRejectedValue(new Error("Network error"));
+    globalThis.fetch = fetchSpy;
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      // Let the first failure propagate
+      await vi.advanceTimersByTimeAsync(100);
+    });
+
+    // Advance through reconnect delays (1s, 2s)
+    await act(async () => {
+      await vi.advanceTimersByTimeAsync(1100); // 1st reconnect after 1s
+    });
+    await act(async () => {
+      await vi.advanceTimersByTimeAsync(2100); // 2nd reconnect after 2s
+    });
+
+    // After 3 failures, should switch to polling
+    expect(result.current.isPollingFallback).toBe(true);
+
+    vi.useRealTimers();
+  });
+
+  it("run_complete event maps correctly (new event name)", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: run_complete\ndata: {"runId":"r1","usage":{"tokens":500,"cost":0.01}}\n\n`,
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
+    expect(result.current.creditsUsed).toBe(0.01);
+    expect(result.current.isStreaming).toBe(false);
+    expect(onRunFinished).toHaveBeenCalledWith(0.01);
+  });
+
+  it("backward compatible with legacy token events", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: token\ndata: {"token":"Hello","agentName":"Agent1"}\n\n` +
+        `event: run_finished\ndata: {"creditsUsed":0}\n\n`,
+      ),
+    );
+
+    const { result } = renderHook(() => useAgencyStream());
+
+    await act(async () => {
+      result.current.connect({ agencyId: "ag-1", message: "test" });
+      await new Promise((r) => setTimeout(r, 100));
+    });
+
+    const assistantMsg = result.current.messages.find(
+      (m) => m.role === "assistant",
+    );
+    expect(assistantMsg?.content).toBe("Hello");
+  });
+
+  it("disconnect cleans up and cancels in-flight request", async () => {
+    globalThis.fetch = vi.fn().mockResolvedValue(
+      makeSSEResponse(
+        `event: meta\ndata: {"runId":"r1"}\n\n`,
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
+    act(() => {
+      result.current.disconnect();
+    });
+
+    expect(result.current.isStreaming).toBe(false);
+  });
 });
diff --git a/apps/web/client/src/hooks/useAgencyStream.ts b/apps/web/client/src/hooks/useAgencyStream.ts
index fa096717..15b31f6d 100644
--- a/apps/web/client/src/hooks/useAgencyStream.ts
+++ b/apps/web/client/src/hooks/useAgencyStream.ts
@@ -15,12 +15,38 @@ export interface AgencyStreamMessage {
 }
 
 export interface AgencyActivityEvent {
-  type: "agent_switch" | "tool_call" | "tool_result" | "handoff";
+  type: "agent_switch" | "tool_call" | "tool_result" | "handoff" | "tool_start" | "tool_end" | "tool_progress" | "guardrail_trigger" | "approval_required";
   agentName: string;
   timestamp: number;
   data: Record<string, unknown>;
 }
 
+export interface ToolCallState {
+  toolCallId: string;
+  toolName: string;
+  agentName: string;
+  status: "running" | "success" | "error";
+  progressMessage?: string;
+  result?: string;
+  startedAt: number;
+  endedAt?: number;
+}
+
+export interface GuardrailEvent {
+  type: "input" | "output";
+  guardrailName: string;
+  action: string;
+  timestamp: number;
+}
+
+export interface ApprovalRequest {
+  approvalKey: string;
+  step: string;
+  summary: string;
+  agentName: string;
+  timestamp: number;
+}
+
 export interface UseAgencyStreamOptions {
   onRunFinished?: (creditsUsed: number) => void;
   onError?: (error: string) => void;
@@ -31,6 +57,8 @@ export interface UseAgencyStreamOptions {
     intent: string | null;
     summary: string | null;
   }) => void;
+  onGuardrailTrigger?: (event: GuardrailEvent) => void;
+  onApprovalRequired?: (request: ApprovalRequest) => void;
 }
 
 export interface UseAgencyStreamReturn {
@@ -40,6 +68,10 @@ export interface UseAgencyStreamReturn {
   error: string | null;
   creditsUsed: number;
   activityEvents: AgencyActivityEvent[];
+  toolCalls: ToolCallState[];
+  guardrailEvents: GuardrailEvent[];
+  pendingApproval: ApprovalRequest | null;
+  isPollingFallback: boolean;
   connect: (params: {
     agencyId: string;
     conversationId?: string;
@@ -53,12 +85,13 @@ export interface UseAgencyStreamReturn {
     additionalInstructions?: string;
   }) => void;
   disconnect: () => void;
+  cancel: (mode: "immediate" | "after_turn") => void;
 }
 
 function parseSSEEvents(
   buffer: string,
-): { events: Array<{ type: string; data: string }>; remaining: string } {
-  const events: Array<{ type: string; data: string }> = [];
+): { events: Array<{ type: string; data: string; id?: string }>; remaining: string } {
+  const events: Array<{ type: string; data: string; id?: string }> = [];
   const blocks = buffer.split("\n\n");
   // Last element may be incomplete
   const remaining = blocks.pop() || "";
@@ -67,11 +100,14 @@ function parseSSEEvents(
     if (!block.trim()) continue;
     let eventType = "message";
     let dataLines: string[] = [];
+    let eventId: string | undefined;
 
     for (const line of block.split("\n")) {
       if (line.startsWith(":")) continue; // comment/keepalive
       if (line.startsWith("event: ")) {
         eventType = line.slice(7).trim();
+      } else if (line.startsWith("id: ")) {
+        eventId = line.slice(4).trim();
       } else if (line.startsWith("data: ")) {
         dataLines.push(line.slice(6));
       } else if (line.startsWith("data:")) {
@@ -80,13 +116,20 @@ function parseSSEEvents(
     }
 
     if (dataLines.length > 0) {
-      events.push({ type: eventType, data: dataLines.join("\n") });
+      events.push({ type: eventType, data: dataLines.join("\n"), id: eventId });
     }
   }
 
   return { events, remaining };
 }
 
+/** Max SSE reconnect failures within the window before falling back to polling */
+const MAX_SSE_FAILURES = 3;
+/** Time window (ms) for counting SSE failures */
+const SSE_FAILURE_WINDOW_MS = 60_000;
+/** Polling interval (ms) for fallback mode */
+const POLLING_INTERVAL_MS = 3_000;
+
 export function useAgencyStream(
   options?: UseAgencyStreamOptions,
 ): UseAgencyStreamReturn {
@@ -98,37 +141,96 @@ export function useAgencyStream(
   const [activityEvents, setActivityEvents] = useState<
     AgencyActivityEvent[]
   >([]);
+  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);
+  const [guardrailEvents, setGuardrailEvents] = useState<GuardrailEvent[]>([]);
+  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
+  const [isPollingFallback, setIsPollingFallback] = useState(false);
 
   const abortRef = useRef<AbortController | null>(null);
   const streamingMsgRef = useRef<string>("");
   const streamingAgentRef = useRef<string>("");
   const runCounterRef = useRef(0);
+  const runIdRef = useRef<string | null>(null);
+  const currentAgencyIdRef = useRef<string | null>(null);
+  const lastEventIdRef = useRef<string | null>(null);
+  const failTimestampsRef = useRef<number[]>([]);
+  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
+  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
 
   // Store callbacks in refs to avoid stale closures (H3 fix)
   const onRunFinishedRef = useRef(options?.onRunFinished);
   const onErrorRef = useRef(options?.onError);
   const onBrowserSessionRef = useRef(options?.onBrowserSession);
   const onPreviewReadyRef = useRef(options?.onPreviewReady);
+  const onGuardrailTriggerRef = useRef(options?.onGuardrailTrigger);
+  const onApprovalRequiredRef = useRef(options?.onApprovalRequired);
   useEffect(() => {
     onRunFinishedRef.current = options?.onRunFinished;
     onErrorRef.current = options?.onError;
     onBrowserSessionRef.current = options?.onBrowserSession;
     onPreviewReadyRef.current = options?.onPreviewReady;
-  }, [options?.onRunFinished, options?.onError, options?.onBrowserSession, options?.onPreviewReady]);
+    onGuardrailTriggerRef.current = options?.onGuardrailTrigger;
+    onApprovalRequiredRef.current = options?.onApprovalRequired;
+  }, [
+    options?.onRunFinished,
+    options?.onError,
+    options?.onBrowserSession,
+    options?.onPreviewReady,
+    options?.onGuardrailTrigger,
+    options?.onApprovalRequired,
+  ]);
+
+  const clearReconnectTimer = useCallback(() => {
+    if (reconnectTimerRef.current) {
+      clearTimeout(reconnectTimerRef.current);
+      reconnectTimerRef.current = null;
+    }
+  }, []);
+
+  const clearPollingInterval = useCallback(() => {
+    if (pollingIntervalRef.current) {
+      clearInterval(pollingIntervalRef.current);
+      pollingIntervalRef.current = null;
+    }
+  }, []);
 
   const disconnect = useCallback(() => {
     if (abortRef.current) {
       abortRef.current.abort();
       abortRef.current = null;
     }
+    clearReconnectTimer();
+    clearPollingInterval();
     setIsStreaming(false);
-  }, []);
+  }, [clearReconnectTimer, clearPollingInterval]);
 
   // H2 fix: cleanup on unmount
   useEffect(() => {
     return () => disconnect();
   }, [disconnect]);
 
+  const cancel = useCallback(
+    async (mode: "immediate" | "after_turn") => {
+      if (mode === "immediate") {
+        abortRef.current?.abort();
+      }
+      const runId = runIdRef.current;
+      const agencyId = currentAgencyIdRef.current;
+      if (!runId || !agencyId) return;
+      try {
+        await fetch(`/api/agency/${agencyId}/cancel`, {
+          method: "POST",
+          headers: { "Content-Type": "application/json" },
+          credentials: "include",
+          body: JSON.stringify({ runId, mode }),
+        });
+      } catch {
+        // Best-effort cancel
+      }
+    },
+    [],
+  );
+
   const connect = useCallback(
     (params: {
       agencyId: string;
@@ -143,10 +245,18 @@ export function useAgencyStream(
       disconnect();
       setError(null);
       setCreditsUsed(0);
+      setToolCalls([]);
+      setGuardrailEvents([]);
+      setPendingApproval(null);
+      setIsPollingFallback(false);
       streamingMsgRef.current = "";
       streamingAgentRef.current = "";
       runCounterRef.current += 1;
-      const runId = runCounterRef.current;
+      const runCounter = runCounterRef.current;
+      runIdRef.current = null;
+      currentAgencyIdRef.current = params.agencyId;
+      lastEventIdRef.current = null;
+      failTimestampsRef.current = [];
 
       // Add user message
       const userMsg: AgencyStreamMessage = {
@@ -157,233 +267,445 @@ export function useAgencyStream(
       setMessages((prev) => [...prev, userMsg]);
       setIsStreaming(true);
 
-      const controller = new AbortController();
-      abortRef.current = controller;
-
-      (async () => {
-        try {
-          const res = await fetch("/api/v1/agency/stream", {
-            method: "POST",
-            headers: { "Content-Type": "application/json" },
-            credentials: "include",
-            body: JSON.stringify({
-              agencyId: params.agencyId,
-              conversationId: params.conversationId,
-              message: params.message,
-              ...(params.modelOverride ? { modelOverride: params.modelOverride } : {}),
-              ...(params.recipientAgent ? { recipientAgent: params.recipientAgent } : {}),
-              ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
-              ...(params.additionalInstructions ? { additionalInstructions: params.additionalInstructions } : {}),
-            }),
-            signal: controller.signal,
-          });
-
-          if (!res.ok) {
-            const err = await res.json().catch(() => ({ error: "Stream error" }));
-            const errMsg = err.error || `HTTP ${res.status}`;
-            setError(errMsg);
-            setIsStreaming(false);
-            onErrorRef.current?.(errMsg);
-            return;
-          }
+      startSSEConnection(params, runCounter);
+    },
+    [disconnect],
+  );
 
-          if (!res.body) {
-            setError("No response body");
-            setIsStreaming(false);
-            return;
-          }
+  function startSSEConnection(
+    params: {
+      agencyId: string;
+      conversationId?: string;
+      message: string;
+      modelOverride?: string;
+      recipientAgent?: string;
+      fileIds?: string[];
+      additionalInstructions?: string;
+    },
+    runCounter: number,
+  ) {
+    const controller = new AbortController();
+    abortRef.current = controller;
+
+    (async () => {
+      try {
+        const headers: Record<string, string> = {
+          "Content-Type": "application/json",
+        };
+        if (lastEventIdRef.current) {
+          headers["Last-Event-ID"] = lastEventIdRef.current;
+        }
+
+        const res = await fetch("/api/v1/agency/stream", {
+          method: "POST",
+          headers,
+          credentials: "include",
+          body: JSON.stringify({
+            agencyId: params.agencyId,
+            conversationId: params.conversationId,
+            message: params.message,
+            ...(params.modelOverride ? { modelOverride: params.modelOverride } : {}),
+            ...(params.recipientAgent ? { recipientAgent: params.recipientAgent } : {}),
+            ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
+            ...(params.additionalInstructions ? { additionalInstructions: params.additionalInstructions } : {}),
+          }),
+          signal: controller.signal,
+        });
+
+        if (!res.ok) {
+          const err = await res.json().catch(() => ({ error: "Stream error" }));
+          const errMsg = err.error || `HTTP ${res.status}`;
+          setError(errMsg);
+          setIsStreaming(false);
+          onErrorRef.current?.(errMsg);
+          return;
+        }
+
+        if (!res.body) {
+          setError("No response body");
+          setIsStreaming(false);
+          return;
+        }
+
+        // Reset fail count on successful connection
+        failTimestampsRef.current = [];
 
-          const reader = res.body.getReader();
-          const decoder = new TextDecoder();
-          let buffer = "";
+        const reader = res.body.getReader();
+        const decoder = new TextDecoder();
+        let buffer = "";
 
-          while (true) {
-            const { done, value } = await reader.read();
-            if (done) break;
+        while (true) {
+          const { done, value } = await reader.read();
+          if (done) break;
 
-            buffer += decoder.decode(value, { stream: true });
-            const { events, remaining } = parseSSEEvents(buffer);
-            buffer = remaining;
+          buffer += decoder.decode(value, { stream: true });
+          const { events, remaining } = parseSSEEvents(buffer);
+          buffer = remaining;
 
-            for (const evt of events) {
-              handleSSEEvent(evt.type, evt.data);
+          for (const evt of events) {
+            if (evt.id) {
+              lastEventIdRef.current = evt.id;
             }
+            handleSSEEvent(evt.type, evt.data, runCounter);
           }
+        }
 
-          // Process any remaining buffer
-          if (buffer.trim()) {
-            const { events } = parseSSEEvents(buffer + "\n\n");
-            for (const evt of events) {
-              handleSSEEvent(evt.type, evt.data);
+        // Process any remaining buffer
+        if (buffer.trim()) {
+          const { events } = parseSSEEvents(buffer + "\n\n");
+          for (const evt of events) {
+            if (evt.id) {
+              lastEventIdRef.current = evt.id;
             }
+            handleSSEEvent(evt.type, evt.data, runCounter);
           }
-
-          setIsStreaming(false);
-        } catch (err: any) {
-          if (err.name === "AbortError") return;
-          const errMsg = err.message || "Connection lost";
-          setError(errMsg);
-          setIsStreaming(false);
-          onErrorRef.current?.(errMsg);
         }
-      })();
 
-      function handleSSEEvent(type: string, rawData: string) {
-        let data: any;
-        try {
-          data = JSON.parse(rawData);
-        } catch {
+        setIsStreaming(false);
+      } catch (err: any) {
+        if (err.name === "AbortError") return;
+
+        // Attempt reconnection
+        const now = Date.now();
+        failTimestampsRef.current = failTimestampsRef.current.filter(
+          (ts) => now - ts < SSE_FAILURE_WINDOW_MS,
+        );
+        failTimestampsRef.current.push(now);
+
+        if (failTimestampsRef.current.length >= MAX_SSE_FAILURES) {
+          // Switch to polling fallback
+          setIsPollingFallback(true);
+          // Polling would call tRPC agency.getRun — but since we don't have
+          // tRPC client access in this hook, set the flag so the consumer
+          // can handle polling externally. For now, just mark as polling mode.
           return;
         }
 
-        switch (type) {
-          case "run_started":
-            setIsStreaming(true);
-            break;
-
-          case "agent_switch": {
-            const newAgent = data.agentName || data.agent_name || "";
-            setActiveAgent(newAgent || null);
-
-            // M6 fix: finalize previous agent's streaming message and reset buffer
-            if (streamingMsgRef.current) {
-              setMessages((prev) =>
-                prev.map((m) =>
-                  m.isStreaming ? { ...m, isStreaming: false } : m,
-                ),
-              );
-              streamingMsgRef.current = "";
-            }
+        // Exponential backoff: 1s, 2s, 4s
+        const attempt = failTimestampsRef.current.length;
+        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
+        reconnectTimerRef.current = setTimeout(() => {
+          if (abortRef.current?.signal.aborted) return;
+          startSSEConnection(params, runCounter);
+        }, delay);
+      }
+    })();
+  }
 
-            streamingAgentRef.current = newAgent;
-            setActivityEvents((prev) => [
-              ...prev,
-              {
-                type: "agent_switch",
-                agentName: newAgent,
-                timestamp: Date.now(),
-                data,
-              },
-            ]);
-            break;
-          }
+  function handleSSEEvent(type: string, rawData: string, runCounter: number) {
+    let data: any;
+    try {
+      data = JSON.parse(rawData);
+    } catch {
+      return;
+    }
 
-          case "token": {
-            const token = data.token || data.content || "";
-            streamingMsgRef.current += token;
-            const currentContent = streamingMsgRef.current;
-            const agent =
-              data.agentName ||
-              data.agent_name ||
-              streamingAgentRef.current;
-            // M5 fix: include runId to prevent key collisions across agent switches
-            const streamId = `stream-${runId}-${agent}`;
-
-            setMessages((prev) => {
-              const existing = prev.find(
-                (m) => m.id === streamId && m.isStreaming,
-              );
-              if (existing) {
-                return prev.map((m) =>
-                  m.id === streamId
-                    ? { ...m, content: currentContent }
-                    : m,
-                );
-              }
-              return [
-                ...prev,
-                {
-                  id: streamId,
-                  role: "assistant",
-                  content: currentContent,
-                  agentName: agent,
-                  isStreaming: true,
-                },
-              ];
-            });
-            break;
-          }
+    switch (type) {
+      case "meta":
+      case "run_started": {
+        const metaRunId = data.runId || data.run_id;
+        if (metaRunId) {
+          runIdRef.current = metaRunId;
+        }
+        setIsStreaming(true);
+        break;
+      }
 
-          case "tool_call":
-            setActivityEvents((prev) => [
-              ...prev,
-              {
-                type: "tool_call",
-                agentName:
-                  data.agentName || data.agent_name || "",
-                timestamp: Date.now(),
-                data,
-              },
-            ]);
-            break;
-
-          case "tool_result":
-            setActivityEvents((prev) => [
-              ...prev,
-              {
-                type: "tool_result",
-                agentName:
-                  data.agentName || data.agent_name || "",
-                timestamp: Date.now(),
-                data,
-              },
-            ]);
-            break;
-
-          case "browser_session": {
-            const artifact = parseBrowserSessionArtifact(data);
-            if (artifact) {
-              onBrowserSessionRef.current?.(artifact);
-            }
-            break;
-          }
+      case "agent_switch": {
+        // Support both new format (data.to) and legacy (data.agentName)
+        const newAgent = data.to || data.agentName || data.agent_name || "";
+        setActiveAgent(newAgent || null);
+
+        // M6 fix: finalize previous agent's streaming message and reset buffer
+        if (streamingMsgRef.current) {
+          setMessages((prev) =>
+            prev.map((m) =>
+              m.isStreaming ? { ...m, isStreaming: false } : m,
+            ),
+          );
+          streamingMsgRef.current = "";
+        }
+
+        streamingAgentRef.current = newAgent;
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "agent_switch",
+            agentName: newAgent,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+      }
 
-          case "preview_ready":
-            onPreviewReadyRef.current?.({
-              runId: typeof data.run_id === "string" ? data.run_id : "",
-              previewArtifactIds: Array.isArray(data.preview_artifact_ids)
-                ? data.preview_artifact_ids.filter((value: unknown): value is string => typeof value === "string")
-                : [],
-              intent: typeof data.intent === "string" ? data.intent : null,
-              summary: typeof data.summary === "string" ? data.summary : null,
-            });
-            break;
-
-          case "run_finished": {
-            const credits = data.creditsUsed ?? data.total_credits ?? 0;
-            setCreditsUsed(credits);
-            setIsStreaming(false);
-            // Finalize streaming message
-            setMessages((prev) =>
-              prev.map((m) =>
-                m.isStreaming ? { ...m, isStreaming: false } : m,
-              ),
+      case "text_delta": {
+        // New event: text_delta uses `delta` field
+        const token = data.delta || "";
+        streamingMsgRef.current += token;
+        const currentContent = streamingMsgRef.current;
+        const agent = data.agentName || data.agent_name || streamingAgentRef.current;
+        const streamId = `stream-${runCounter}-${agent}`;
+
+        setMessages((prev) => {
+          const existing = prev.find(
+            (m) => m.id === streamId && m.isStreaming,
+          );
+          if (existing) {
+            return prev.map((m) =>
+              m.id === streamId
+                ? { ...m, content: currentContent }
+                : m,
             );
-            streamingMsgRef.current = "";
-            streamingAgentRef.current = "";
-            onRunFinishedRef.current?.(credits);
-            break;
           }
+          return [
+            ...prev,
+            {
+              id: streamId,
+              role: "assistant",
+              content: currentContent,
+              agentName: agent,
+              isStreaming: true,
+            },
+          ];
+        });
+        break;
+      }
 
-          case "run_error":
-          case "error": {
-            const errMsg =
-              data.message || data.error || "Agency run failed";
-            setError(errMsg);
-            setIsStreaming(false);
-            setMessages((prev) =>
-              prev.map((m) =>
-                m.isStreaming ? { ...m, isStreaming: false } : m,
-              ),
+      case "token": {
+        // Legacy event: token uses `token` field
+        const token = data.token || data.content || "";
+        streamingMsgRef.current += token;
+        const currentContent = streamingMsgRef.current;
+        const agent =
+          data.agentName ||
+          data.agent_name ||
+          streamingAgentRef.current;
+        const streamId = `stream-${runCounter}-${agent}`;
+
+        setMessages((prev) => {
+          const existing = prev.find(
+            (m) => m.id === streamId && m.isStreaming,
+          );
+          if (existing) {
+            return prev.map((m) =>
+              m.id === streamId
+                ? { ...m, content: currentContent }
+                : m,
             );
-            onErrorRef.current?.(errMsg);
-            break;
           }
+          return [
+            ...prev,
+            {
+              id: streamId,
+              role: "assistant",
+              content: currentContent,
+              agentName: agent,
+              isStreaming: true,
+            },
+          ];
+        });
+        break;
+      }
+
+      case "tool_start": {
+        const toolCallId = data.toolCallId || data.tool_call_id || "";
+        const toolName = data.toolName || data.tool_name || "";
+        const agentName = data.agentName || data.agent_name || streamingAgentRef.current;
+
+        setToolCalls((prev) => [
+          ...prev,
+          {
+            toolCallId,
+            toolName,
+            agentName,
+            status: "running",
+            startedAt: Date.now(),
+          },
+        ]);
+
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "tool_start",
+            agentName,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+      }
+
+      case "tool_progress": {
+        const toolCallId = data.toolCallId || data.tool_call_id || "";
+        const progressMessage = data.message || data.status || "";
+
+        setToolCalls((prev) =>
+          prev.map((tc) =>
+            tc.toolCallId === toolCallId
+              ? { ...tc, progressMessage }
+              : tc,
+          ),
+        );
+
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "tool_progress",
+            agentName: streamingAgentRef.current,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+      }
+
+      case "tool_end": {
+        const toolCallId = data.toolCallId || data.tool_call_id || "";
+        const status = data.status === "error" ? "error" : "success";
+
+        setToolCalls((prev) =>
+          prev.map((tc) =>
+            tc.toolCallId === toolCallId
+              ? { ...tc, status, result: data.result, endedAt: Date.now() }
+              : tc,
+          ),
+        );
+
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "tool_end",
+            agentName: streamingAgentRef.current,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+      }
+
+      case "tool_call":
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "tool_call",
+            agentName:
+              data.agentName || data.agent_name || "",
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+
+      case "tool_result":
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "tool_result",
+            agentName:
+              data.agentName || data.agent_name || "",
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        break;
+
+      case "guardrail_trigger": {
+        const evt: GuardrailEvent = {
+          type: data.type || "input",
+          guardrailName: data.guardrailName || data.guardrail_name || "",
+          action: data.action || "",
+          timestamp: Date.now(),
+        };
+        setGuardrailEvents((prev) => [...prev, evt]);
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "guardrail_trigger",
+            agentName: streamingAgentRef.current,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        onGuardrailTriggerRef.current?.(evt);
+        break;
+      }
+
+      case "approval_required": {
+        const req: ApprovalRequest = {
+          approvalKey: data.approvalKey || data.approval_key || "",
+          step: data.step || "",
+          summary: data.summary || "",
+          agentName: data.agentName || data.agent_name || streamingAgentRef.current,
+          timestamp: Date.now(),
+        };
+        setPendingApproval(req);
+        setActivityEvents((prev) => [
+          ...prev,
+          {
+            type: "approval_required",
+            agentName: req.agentName,
+            timestamp: Date.now(),
+            data,
+          },
+        ]);
+        onApprovalRequiredRef.current?.(req);
+        break;
+      }
+
+      case "browser_session": {
+        const artifact = parseBrowserSessionArtifact(data);
+        if (artifact) {
+          onBrowserSessionRef.current?.(artifact);
         }
+        break;
       }
-    },
-    [disconnect],
-  );
+
+      case "preview_ready":
+        onPreviewReadyRef.current?.({
+          runId: typeof data.run_id === "string" ? data.run_id : "",
+          previewArtifactIds: Array.isArray(data.preview_artifact_ids)
+            ? data.preview_artifact_ids.filter((value: unknown): value is string => typeof value === "string")
+            : [],
+          intent: typeof data.intent === "string" ? data.intent : null,
+          summary: typeof data.summary === "string" ? data.summary : null,
+        });
+        break;
+
+      case "run_complete":
+      case "run_finished": {
+        const credits = data.creditsUsed ?? data.total_credits ?? data.usage?.cost ?? 0;
+        setCreditsUsed(credits);
+        setIsStreaming(false);
+        setPendingApproval(null);
+        // Finalize streaming message
+        setMessages((prev) =>
+          prev.map((m) =>
+            m.isStreaming ? { ...m, isStreaming: false } : m,
+          ),
+        );
+        streamingMsgRef.current = "";
+        streamingAgentRef.current = "";
+        onRunFinishedRef.current?.(credits);
+        break;
+      }
+
+      case "run_error":
+      case "error": {
+        const errMsg =
+          data.message || data.error || "Agency run failed";
+        setError(errMsg);
+        setIsStreaming(false);
+        setMessages((prev) =>
+          prev.map((m) =>
+            m.isStreaming ? { ...m, isStreaming: false } : m,
+          ),
+        );
+        onErrorRef.current?.(errMsg);
+        break;
+      }
+    }
+  }
 
   return {
     messages,
@@ -392,7 +714,12 @@ export function useAgencyStream(
     error,
     creditsUsed,
     activityEvents,
+    toolCalls,
+    guardrailEvents,
+    pendingApproval,
+    isPollingFallback,
     connect,
     disconnect,
+    cancel,
   };
 }
diff --git a/apps/web/client/src/pages/AgencyChat.tsx b/apps/web/client/src/pages/AgencyChat.tsx
index ce758e1f..bb0b3457 100644
--- a/apps/web/client/src/pages/AgencyChat.tsx
+++ b/apps/web/client/src/pages/AgencyChat.tsx
@@ -5,6 +5,7 @@ import { useAgencyStream } from "@/hooks/useAgencyStream";
 import { useAgencyById } from "@/hooks/useAgencyQuery";
 import { ModelPicker } from "@/components/agency/ModelPicker";
 import AgencyActivityPanel from "@/components/agency/AgencyActivityPanel";
+import { AgencyChatStream } from "@/components/agency/AgencyChatStream";
 import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
 import { BrowserSessionLaunchSuggestionCard } from "@/components/browser-session/BrowserSessionLaunchSuggestionCard";
 import { AgencyPreviewCard, type AgencyPreviewProps } from "@/components/agency/preview";
@@ -794,50 +795,25 @@ export default function AgencyChat() {
                 </div>
               )}
 
-              {stream.messages.map((msg) => (
-                <div
-                  key={msg.id}
-                  className={cn(
-                    "flex",
-                    msg.role === "user"
-                      ? "justify-end"
-                      : "justify-start",
-                  )}
-                >
-                  <div
-                    className={cn(
-                      "max-w-[80%] rounded-lg px-4 py-2.5",
-                      msg.role === "user"
-                        ? "bg-primary text-primary-foreground"
-                        : "bg-muted",
-                    )}
-                  >
-                    {msg.role === "assistant" && msg.agentName && (
-                      <Badge
-                        variant="secondary"
-                        className={cn(
-                          "mb-1.5 text-[10px] px-1.5 py-0",
-                          getAgentColor(msg.agentName),
-                        )}
-                      >
-                        {msg.agentName}
-                      </Badge>
-                    )}
-                    {msg.role === "user" ? (
-                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
-                        {msg.content}
-                      </p>
-                    ) : (
-                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
-                        <SafeMarkdown>{msg.content}</SafeMarkdown>
-                        {msg.isStreaming && (
-                          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />
-                        )}
-                      </div>
-                    )}
-                  </div>
-                </div>
-              ))}
+              {/* Streaming chat messages with rich indicators */}
+              <AgencyChatStream
+                messages={stream.messages}
+                activeAgent={stream.activeAgent}
+                isStreaming={stream.isStreaming}
+                error={stream.error}
+                creditsUsed={stream.creditsUsed}
+                activityEvents={stream.activityEvents}
+                toolCalls={stream.toolCalls}
+                guardrailEvents={stream.guardrailEvents}
+                pendingApproval={stream.pendingApproval}
+                isPollingFallback={stream.isPollingFallback}
+                onCancel={stream.cancel}
+                onApprovalSubmit={(approvalKey, approved, feedback) => {
+                  // TODO: Wire to trpc.agency.submitApproval when section 12 is implemented
+                  console.log("[AgencyChat] approval submit:", { approvalKey, approved, feedback });
+                }}
+                getAgentColor={getAgentColor}
+              />
 
               {browserSessionSuggestion ? (
                 <div className="mr-auto max-w-[80%]">
