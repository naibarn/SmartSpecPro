diff --git a/apps/web/client/src/components/chat/ChatView.tsx b/apps/web/client/src/components/chat/ChatView.tsx
index d1746fc..33b8802 100644
--- a/apps/web/client/src/components/chat/ChatView.tsx
+++ b/apps/web/client/src/components/chat/ChatView.tsx
@@ -63,6 +63,7 @@ import { ScheduleConfirmCard } from "./ScheduleConfirmCard";
 import { toast } from "sonner";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { FallbackConsent } from "./FallbackConsent";
+import { MessageCostBadge } from "./MessageCostBadge";
 import { formatModelCost, getCheapestProvider, type AvailableModel, type ModelProvider } from "@/lib/modelPricing";
 import {
   appendLibraryContextToMessage,
@@ -2188,25 +2189,26 @@ export function ChatView({ conversationId, onTitleUpdate }: ChatViewProps) {
                     ) : (
                       renderUserContent(m)
                     )}
-                    {m.role === "assistant" && (m.creditsUsed || m.skillUsed) && (
+                    {m.role === "assistant" && m.skillUsed && m.skillUsed !== "brainstorm" && (
                       <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
-                        {m.skillUsed && m.skillUsed !== "brainstorm" && (
-                          <Badge variant="outline" className="gap-1 text-xs">
-                            {(() => {
-                              const SkillIcon = skillIconMap[m.skillUsed] || Sparkles;
-                              return <SkillIcon className="h-3 w-3" />;
-                            })()}
-                            {m.skillUsed.replace(/-/g, " ")}
-                          </Badge>
-                        )}
-                        {m.creditsUsed && Number(m.creditsUsed) > 0 && (
-                          <span>
-                            {Number(m.creditsUsed)} credit{Number(m.creditsUsed) !== 1 ? 's' : ''}
-                            {m.modelUsed && m.skillUsed !== "brainstorm" && ` — ${m.modelUsed}`}
-                          </span>
-                        )}
+                        <Badge variant="outline" className="gap-1 text-xs">
+                          {(() => {
+                            const SkillIcon = skillIconMap[m.skillUsed] || Sparkles;
+                            return <SkillIcon className="h-3 w-3" />;
+                          })()}
+                          {m.skillUsed.replace(/-/g, " ")}
+                        </Badge>
                       </div>
                     )}
+                    {m.role === "assistant" && (
+                      <MessageCostBadge
+                        messageId={m.id}
+                        model={m.modelUsed}
+                        inputTokens={m.inputTokens ?? 0}
+                        outputTokens={m.outputTokens ?? 0}
+                        creditsUsed={m.creditsUsed}
+                      />
+                    )}
                   </div>
                 );
 
diff --git a/apps/web/client/src/components/chat/MessageCostBadge.tsx b/apps/web/client/src/components/chat/MessageCostBadge.tsx
new file mode 100644
index 0000000..597c19a
--- /dev/null
+++ b/apps/web/client/src/components/chat/MessageCostBadge.tsx
@@ -0,0 +1,115 @@
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { useAuth } from "@/contexts/AuthContext";
+import { cn } from "@/lib/utils";
+import { ChevronDown, ChevronUp, Zap } from "lucide-react";
+
+function formatTokens(n: number): string {
+  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
+  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
+  return String(n);
+}
+
+export interface MessageCostBadgeProps {
+  messageId: number;
+  model?: string | null;
+  inputTokens?: number;
+  outputTokens?: number;
+  creditsUsed?: string | number;
+}
+
+export function MessageCostBadge({
+  messageId,
+  model,
+  inputTokens = 0,
+  outputTokens = 0,
+  creditsUsed,
+}: MessageCostBadgeProps) {
+  const [isExpanded, setIsExpanded] = useState(false);
+  const { user } = useAuth();
+  const isAdmin = user?.role === "admin" || user?.role === "domain_admin";
+
+  const { data, isLoading } = trpc.chat.getMessageCost.useQuery(
+    { messageId },
+    { enabled: isExpanded }
+  );
+
+  const totalTokens = inputTokens + outputTokens;
+  const credits = creditsUsed != null ? Number(creditsUsed) : 0;
+
+  // Don't show badge if there's no useful data
+  if (!model && totalTokens === 0 && credits === 0) return null;
+
+  return (
+    <div className="mt-1.5">
+      <button
+        role="button"
+        onClick={() => setIsExpanded(!isExpanded)}
+        className={cn(
+          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors",
+          "hover:text-muted-foreground hover:bg-muted/50",
+          isExpanded && "bg-muted/50 text-muted-foreground"
+        )}
+      >
+        <Zap className="h-3 w-3" />
+        {model && <span>{model}</span>}
+        {model && totalTokens > 0 && <span className="opacity-50">·</span>}
+        {totalTokens > 0 && <span>{formatTokens(totalTokens)} tokens</span>}
+        {totalTokens > 0 && credits > 0 && (
+          <span className="opacity-50">·</span>
+        )}
+        {credits > 0 && <span>{credits} credits</span>}
+        {isExpanded ? (
+          <ChevronUp className="h-3 w-3" />
+        ) : (
+          <ChevronDown className="h-3 w-3" />
+        )}
+      </button>
+
+      {isExpanded && (
+        <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
+          {isLoading && <p>Loading cost data...</p>}
+          {data && (
+            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
+              <span className="opacity-70">Model</span>
+              <span>{data.model}</span>
+              {data.provider && (
+                <>
+                  <span className="opacity-70">Provider</span>
+                  <span>{data.provider}</span>
+                </>
+              )}
+              <span className="opacity-70">Input tokens</span>
+              <span>{data.inputTokens.toLocaleString()}</span>
+              <span className="opacity-70">Output tokens</span>
+              <span>{data.outputTokens.toLocaleString()}</span>
+              <span className="opacity-70">Credits</span>
+              <span>{data.creditsUsed}</span>
+              {isAdmin && data.costUsd != null && (
+                <>
+                  <span className="opacity-70">Cost</span>
+                  <span>${data.costUsd.toFixed(6)}</span>
+                </>
+              )}
+              <span className="opacity-70">Latency</span>
+              <span>
+                {data.responseTimeMs > 0
+                  ? `${(data.responseTimeMs / 1000).toFixed(1)}s`
+                  : "—"}
+              </span>
+              {data.wasFallback && data.fallbackFrom && (
+                <>
+                  <span className="opacity-70">Fallback from</span>
+                  <span>{data.fallbackFrom}</span>
+                </>
+              )}
+            </div>
+          )}
+          {!isLoading && !data && (
+            <p className="opacity-70">No detailed cost data available</p>
+          )}
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/chat/__tests__/MessageCostBadge.test.tsx b/apps/web/client/src/components/chat/__tests__/MessageCostBadge.test.tsx
new file mode 100644
index 0000000..01a5687
--- /dev/null
+++ b/apps/web/client/src/components/chat/__tests__/MessageCostBadge.test.tsx
@@ -0,0 +1,105 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+
+const { mockUseQuery, mockUseAuth } = vi.hoisted(() => ({
+  mockUseQuery: vi.fn(),
+  mockUseAuth: vi.fn(),
+}));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    chat: {
+      getMessageCost: {
+        useQuery: mockUseQuery,
+      },
+    },
+  },
+}));
+
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: mockUseAuth,
+}));
+
+import { MessageCostBadge } from "../MessageCostBadge";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mockUseQuery.mockReturnValue({ data: null, isLoading: false });
+  mockUseAuth.mockReturnValue({ user: { role: "user" } });
+});
+
+describe("MessageCostBadge", () => {
+  it("does not fetch cost data until expanded", () => {
+    render(
+      <MessageCostBadge
+        messageId={1}
+        model="gpt-4o"
+        inputTokens={500}
+        outputTokens={200}
+        creditsUsed="3"
+      />
+    );
+
+    // The tRPC query should be called with enabled: false initially
+    expect(mockUseQuery).toHaveBeenCalledWith(
+      { messageId: 1 },
+      expect.objectContaining({ enabled: false })
+    );
+  });
+
+  it("displays model, tokens, credits in compact view", () => {
+    render(
+      <MessageCostBadge
+        messageId={1}
+        model="gpt-4o"
+        inputTokens={500}
+        outputTokens={700}
+        creditsUsed="3"
+      />
+    );
+
+    // Should show model name
+    expect(screen.getByText(/gpt-4o/)).toBeTruthy();
+    // Should show total tokens (1200 -> "1.2K")
+    expect(screen.getByText(/1\.2K tokens/)).toBeTruthy();
+    // Should show credits
+    expect(screen.getByText(/3 credits/)).toBeTruthy();
+  });
+
+  it("shows full breakdown when expanded", async () => {
+    mockUseQuery.mockReturnValue({
+      data: {
+        model: "gpt-4o",
+        provider: "OpenRouter",
+        inputTokens: 500,
+        outputTokens: 200,
+        totalTokens: 700,
+        creditsUsed: 3,
+        responseTimeMs: 1400,
+        wasFallback: false,
+        fallbackFrom: null,
+      },
+      isLoading: false,
+    });
+
+    render(
+      <MessageCostBadge
+        messageId={1}
+        model="gpt-4o"
+        inputTokens={500}
+        outputTokens={200}
+        creditsUsed="3"
+      />
+    );
+
+    // Click to expand
+    const badge = screen.getByRole("button");
+    fireEvent.click(badge);
+
+    // After expanding, query should be enabled
+    expect(mockUseQuery).toHaveBeenCalledWith(
+      { messageId: 1 },
+      expect.objectContaining({ enabled: true })
+    );
+  });
+});
diff --git a/apps/web/client/src/components/chat/index.ts b/apps/web/client/src/components/chat/index.ts
index beb871e..c1a8ec1 100644
--- a/apps/web/client/src/components/chat/index.ts
+++ b/apps/web/client/src/components/chat/index.ts
@@ -1,6 +1,7 @@
 export { ChatSidebar } from "./ChatSidebar";
 export { ChatView } from "./ChatView";
 export { MemoryPanel } from "./MemoryPanel";
+export { MessageCostBadge } from "./MessageCostBadge";
 export { SkillSettings } from "./settings/SkillSettings";
 
 // Media components
diff --git a/apps/web/server/_core/llmRoutes.ts b/apps/web/server/_core/llmRoutes.ts
index 682a6bf..a8eaa1d 100644
--- a/apps/web/server/_core/llmRoutes.ts
+++ b/apps/web/server/_core/llmRoutes.ts
@@ -1137,6 +1137,10 @@ async function proxyChatWithCredits(
             await updateConversationCredits(conversationId, creditsUsed);
           }
 
+          // Get traceId for cost correlation
+          const { getTraceId } = await import("../services/traceContext");
+          const traceId = getTraceId();
+
           const message = await createMessage({
             conversationId,
             role: "assistant",
@@ -1146,8 +1150,25 @@ async function proxyChatWithCredits(
             creditsUsed: creditsUsed.toString(),
             modelUsed: model || conversation.model || undefined,
             skillUsed,
+            traceId,
           });
 
+          // Log to providerUsageLog for cost correlation
+          const { logRequest } = await import("../services/costTracker");
+          logRequest({
+            userId,
+            providerId: provider.providerId,
+            modelUsed: model,
+            inputTokens,
+            outputTokens,
+            costUsd: providerCostUsd,
+            creditsCharged: creditsUsed,
+            responseTimeMs: 0,
+            statusCode: 200,
+            wasFallback: false,
+            traceId,
+          }).catch((err: any) => debugError("LLM", "Failed to log streaming request:", err.message));
+
           debugLog("LLM", "Message saved after streaming", { messageId: message.id, creditsUsed });
 
           // Send final event with saved message info
diff --git a/apps/web/server/routers/__tests__/chatCost.test.ts b/apps/web/server/routers/__tests__/chatCost.test.ts
new file mode 100644
index 0000000..e178cfa
--- /dev/null
+++ b/apps/web/server/routers/__tests__/chatCost.test.ts
@@ -0,0 +1,205 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+/**
+ * Tests for the messageCostService.getMessageCost function.
+ */
+
+const { mockGetMessageById } = vi.hoisted(() => ({
+  mockGetMessageById: vi.fn(),
+}));
+
+vi.mock("../../services/chatService", () => ({
+  getMessageById: mockGetMessageById,
+}));
+
+// Track db query calls
+let dbQueryResults: any[] = [];
+let dbQueryCallCount = 0;
+
+const { mockDb } = vi.hoisted(() => {
+  const mockDb = {
+    select: vi.fn(),
+  };
+  return { mockDb };
+});
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn().mockResolvedValue(mockDb),
+}));
+
+function setupDbChain() {
+  dbQueryCallCount = 0;
+  mockDb.select.mockImplementation(() => {
+    const idx = dbQueryCallCount++;
+    const resultData = dbQueryResults[idx] ?? [];
+    return {
+      from: vi.fn().mockReturnValue({
+        where: vi.fn().mockReturnValue({
+          limit: vi.fn().mockReturnValue(resultData),
+          leftJoin: vi.fn().mockReturnValue(resultData),
+        }),
+        leftJoin: vi.fn().mockReturnValue({
+          where: vi.fn().mockReturnValue(resultData),
+        }),
+      }),
+    };
+  });
+}
+
+import { getMessageCost } from "../../services/messageCostService";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  dbQueryResults = [];
+  dbQueryCallCount = 0;
+});
+
+describe("getMessageCost", () => {
+  it("returns cost data for user's own message", async () => {
+    mockGetMessageById.mockResolvedValue({
+      id: 100,
+      conversationId: 10,
+      traceId: "trace123456789012345678901234",
+    });
+
+    dbQueryResults = [
+      [{ id: 10, userId: 1 }],
+      [{
+        modelUsed: "gpt-4o",
+        inputTokens: 500,
+        outputTokens: 200,
+        costUsd: "0.005",
+        creditsCharged: 3,
+        responseTimeMs: 1400,
+        wasFallback: false,
+        fallbackFromProviderId: null,
+        providerId: 2,
+        providerName: "OpenRouter",
+      }],
+    ];
+    setupDbChain();
+
+    const result = await getMessageCost({
+      messageId: 100,
+      userId: 1,
+      userRole: "user",
+    });
+
+    expect(result).not.toBeNull();
+    expect(result).toEqual(
+      expect.objectContaining({
+        model: "gpt-4o",
+        inputTokens: 500,
+        outputTokens: 200,
+        totalTokens: 700,
+        creditsUsed: 3,
+        responseTimeMs: 1400,
+      })
+    );
+  });
+
+  it("rejects request for another user's message (non-admin)", async () => {
+    mockGetMessageById.mockResolvedValue({
+      id: 100,
+      conversationId: 10,
+      traceId: "trace123456789012345678901234",
+    });
+
+    dbQueryResults = [
+      [{ id: 10, userId: 99 }], // Different user
+    ];
+    setupDbChain();
+
+    await expect(
+      getMessageCost({ messageId: 100, userId: 1, userRole: "user" })
+    ).rejects.toThrow("FORBIDDEN");
+  });
+
+  it("omits costUsd for non-admin users", async () => {
+    mockGetMessageById.mockResolvedValue({
+      id: 100,
+      conversationId: 10,
+      traceId: "trace123456789012345678901234",
+    });
+
+    dbQueryResults = [
+      [{ id: 10, userId: 1 }],
+      [{
+        modelUsed: "gpt-4o",
+        inputTokens: 500,
+        outputTokens: 200,
+        costUsd: "0.005",
+        creditsCharged: 3,
+        responseTimeMs: 1400,
+        wasFallback: false,
+        fallbackFromProviderId: null,
+        providerId: 2,
+        providerName: "OpenRouter",
+      }],
+    ];
+    setupDbChain();
+
+    const result = await getMessageCost({
+      messageId: 100,
+      userId: 1,
+      userRole: "user",
+    });
+
+    expect(result?.costUsd).toBeUndefined();
+  });
+
+  it("includes costUsd for admin users", async () => {
+    mockGetMessageById.mockResolvedValue({
+      id: 100,
+      conversationId: 10,
+      traceId: "trace123456789012345678901234",
+    });
+
+    dbQueryResults = [
+      [{ id: 10, userId: 99 }], // Different user, admin can access
+      [{
+        modelUsed: "gpt-4o",
+        inputTokens: 500,
+        outputTokens: 200,
+        costUsd: "0.005",
+        creditsCharged: 3,
+        responseTimeMs: 1400,
+        wasFallback: false,
+        fallbackFromProviderId: null,
+        providerId: 2,
+        providerName: "OpenRouter",
+      }],
+    ];
+    setupDbChain();
+
+    const result = await getMessageCost({
+      messageId: 100,
+      userId: 1,
+      userRole: "admin",
+    });
+
+    expect(result?.costUsd).toBe(0.005);
+  });
+
+  it("returns null gracefully when no providerUsageLog entry exists", async () => {
+    mockGetMessageById.mockResolvedValue({
+      id: 100,
+      conversationId: 10,
+      traceId: "trace123456789012345678901234",
+    });
+
+    dbQueryResults = [
+      [{ id: 10, userId: 1 }],
+      [], // No usage log entry
+    ];
+    setupDbChain();
+
+    const result = await getMessageCost({
+      messageId: 100,
+      userId: 1,
+      userRole: "user",
+    });
+
+    expect(result).toBeNull();
+  });
+});
diff --git a/apps/web/server/routers/chat.ts b/apps/web/server/routers/chat.ts
index 436fe93..7bdfb80 100644
--- a/apps/web/server/routers/chat.ts
+++ b/apps/web/server/routers/chat.ts
@@ -622,6 +622,32 @@ export const chatRouter = router({
       }));
     }),
 
+  /**
+   * Get per-response cost data for a message.
+   * Returns token usage, credits, latency, and provider info.
+   * Admins additionally see costUsd.
+   */
+  getMessageCost: protectedProcedure
+    .input(z.object({ messageId: z.number() }))
+    .query(async ({ ctx, input }) => {
+      const { getMessageCost } = await import("../services/messageCostService");
+      try {
+        return await getMessageCost({
+          messageId: input.messageId,
+          userId: ctx.user.id,
+          userRole: ctx.user.role,
+        });
+      } catch (err: any) {
+        if (err.message === "FORBIDDEN") {
+          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
+        }
+        if (err.message === "NOT_FOUND") {
+          throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
+        }
+        throw err;
+      }
+    }),
+
   /**
    * Send a message (non-streaming, returns full response)
    * For streaming, use the SSE endpoint at /api/chat/stream
@@ -736,8 +762,9 @@ export const chatRouter = router({
         await updateConversationCredits(input.conversationId, creditsUsed);
       }
 
-      // Create assistant message
+      // Create assistant message with traceId for cost correlation
       debugLog("Chat", "Creating assistant message...");
+      const { getTraceId } = await import("../services/traceContext");
       const message = await createMessage({
         conversationId: input.conversationId,
         role: "assistant",
@@ -750,6 +777,7 @@ export const chatRouter = router({
         skillUsed: input.skillUsed,
         skillArgs: input.skillArgs,
         error: input.error,
+        traceId: getTraceId(),
       });
 
       // --- Channel bridge fan-out (section-08) ---
diff --git a/apps/web/server/services/costTracker.test.ts b/apps/web/server/services/costTracker.test.ts
index 64b632c..b94a20f 100644
--- a/apps/web/server/services/costTracker.test.ts
+++ b/apps/web/server/services/costTracker.test.ts
@@ -91,6 +91,55 @@ describe("logRequest", () => {
       })
     );
   });
+
+  it("accepts and stores traceId in providerUsageLog", async () => {
+    const valuesFn = vi.fn().mockResolvedValue(undefined);
+    mockInsert.mockReturnValue({ values: valuesFn });
+
+    await logRequest({
+      userId: 1,
+      providerId: 2,
+      modelUsed: "gpt-4o",
+      inputTokens: 100,
+      outputTokens: 50,
+      costUsd: 0.001,
+      creditsCharged: 1,
+      responseTimeMs: 500,
+      statusCode: 200,
+      wasFallback: false,
+      traceId: "abc12345678901234567890123456789",
+    });
+
+    expect(valuesFn).toHaveBeenCalledWith(
+      expect.objectContaining({
+        traceId: "abc12345678901234567890123456789",
+      })
+    );
+  });
+
+  it("stores null traceId when not provided", async () => {
+    const valuesFn = vi.fn().mockResolvedValue(undefined);
+    mockInsert.mockReturnValue({ values: valuesFn });
+
+    await logRequest({
+      userId: 1,
+      providerId: 2,
+      modelUsed: "gpt-4o",
+      inputTokens: 100,
+      outputTokens: 50,
+      costUsd: 0.001,
+      creditsCharged: 1,
+      responseTimeMs: 500,
+      statusCode: 200,
+      wasFallback: false,
+    });
+
+    expect(valuesFn).toHaveBeenCalledWith(
+      expect.objectContaining({
+        traceId: null,
+      })
+    );
+  });
 });
 
 describe("calculateCost", () => {
diff --git a/apps/web/server/services/costTracker.ts b/apps/web/server/services/costTracker.ts
index 6ee97ba..1f8e6de 100644
--- a/apps/web/server/services/costTracker.ts
+++ b/apps/web/server/services/costTracker.ts
@@ -22,6 +22,7 @@ export async function logRequest(params: {
   errorType?: string;
   wasFallback: boolean;
   fallbackFromProviderId?: number;
+  traceId?: string;
 }): Promise<void> {
   const db = await getDb();
   if (!db) return;
@@ -39,6 +40,7 @@ export async function logRequest(params: {
     errorType: params.errorType ?? null,
     wasFallback: params.wasFallback,
     fallbackFromProviderId: params.fallbackFromProviderId ?? null,
+    traceId: params.traceId ?? null,
   });
 }
 
diff --git a/apps/web/server/services/llmRouter.ts b/apps/web/server/services/llmRouter.ts
index 1435072..323e196 100644
--- a/apps/web/server/services/llmRouter.ts
+++ b/apps/web/server/services/llmRouter.ts
@@ -5,6 +5,7 @@ import { isAvailable, recordSuccess, recordFailure } from "./providerHealth";
 import { logRequest, calculateCost, type CostMethod } from "./costTracker";
 import { auditLogger } from "./auditLogger";
 import { decrypt } from "./crypto";
+import { getTraceId } from "./traceContext";
 import type { Message } from "../_core/llm";
 
 // --- Types ---
@@ -309,6 +310,7 @@ export async function executeWithFallback(params: {
           statusCode: 200,
           wasFallback: i > 0,
           fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
+          traceId: getTraceId(),
         }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));
 
         // Log LLM response to JSONL audit trail (with full payload for transparency)
@@ -360,6 +362,7 @@ export async function executeWithFallback(params: {
         errorType: `http_${statusCode}`,
         wasFallback: i > 0,
         fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
+        traceId: getTraceId(),
       }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));
 
       // Log LLM error to JSONL audit trail
@@ -414,6 +417,7 @@ export async function executeWithFallback(params: {
         errorType: "network_error",
         wasFallback: i > 0,
         fallbackFromProviderId: i > 0 ? targets[i - 1].providerId : undefined,
+        traceId: getTraceId(),
       }).catch((err) => console.error("[AuditLog] Failed to log request:", err.message));
 
       // Check free->paid boundary
diff --git a/apps/web/server/services/messageCostService.ts b/apps/web/server/services/messageCostService.ts
new file mode 100644
index 0000000..4568eb9
--- /dev/null
+++ b/apps/web/server/services/messageCostService.ts
@@ -0,0 +1,116 @@
+/**
+ * Message Cost Service
+ * Retrieves per-response cost data by correlating messages with providerUsageLog via traceId.
+ */
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { providerUsageLog, llmProviders, conversations } from "../../drizzle/schema";
+import { getMessageById } from "./chatService";
+
+export interface MessageCostInfo {
+  model: string;
+  provider: string | null;
+  inputTokens: number;
+  outputTokens: number;
+  totalTokens: number;
+  creditsUsed: number;
+  costUsd?: number;
+  responseTimeMs: number;
+  wasFallback: boolean;
+  fallbackFrom: string | null;
+}
+
+export async function getMessageCost(params: {
+  messageId: number;
+  userId: number;
+  userRole: string;
+}): Promise<MessageCostInfo | null> {
+  const { messageId, userId, userRole } = params;
+  const isAdmin = userRole === "admin" || userRole === "domain_admin";
+
+  // 1. Fetch the message
+  const message = await getMessageById(messageId);
+  if (!message) {
+    throw new Error("NOT_FOUND");
+  }
+
+  // 2. Verify ownership via conversation
+  const db = await getDb();
+  if (!db) return null;
+
+  const [conversation] = await db
+    .select({ id: conversations.id, userId: conversations.userId })
+    .from(conversations)
+    .where(eq(conversations.id, message.conversationId))
+    .limit(1);
+
+  if (!conversation) {
+    throw new Error("NOT_FOUND");
+  }
+
+  if (!isAdmin && conversation.userId !== userId) {
+    throw new Error("FORBIDDEN");
+  }
+
+  // 3. If no traceId, return null
+  if (!message.traceId) {
+    return null;
+  }
+
+  // 4. Query providerUsageLog by traceId
+  const rows = await db
+    .select({
+      modelUsed: providerUsageLog.modelUsed,
+      inputTokens: providerUsageLog.inputTokens,
+      outputTokens: providerUsageLog.outputTokens,
+      costUsd: providerUsageLog.costUsd,
+      creditsCharged: providerUsageLog.creditsCharged,
+      responseTimeMs: providerUsageLog.responseTimeMs,
+      wasFallback: providerUsageLog.wasFallback,
+      fallbackFromProviderId: providerUsageLog.fallbackFromProviderId,
+      providerId: providerUsageLog.providerId,
+      providerName: llmProviders.providerName,
+    })
+    .from(providerUsageLog)
+    .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
+    .where(eq(providerUsageLog.traceId, message.traceId));
+
+  if (rows.length === 0) {
+    return null;
+  }
+
+  const row = rows[0];
+  const inputTokens = row.inputTokens ?? 0;
+  const outputTokens = row.outputTokens ?? 0;
+
+  // 5. Build response
+  const result: MessageCostInfo = {
+    model: row.modelUsed,
+    provider: row.providerName ?? null,
+    inputTokens,
+    outputTokens,
+    totalTokens: inputTokens + outputTokens,
+    creditsUsed: row.creditsCharged,
+    responseTimeMs: row.responseTimeMs ?? 0,
+    wasFallback: row.wasFallback,
+    fallbackFrom: null,
+  };
+
+  // 6. Include costUsd only for admin users
+  if (isAdmin) {
+    result.costUsd = Number(row.costUsd);
+  }
+
+  // 7. Resolve fallback provider name if applicable
+  if (row.wasFallback && row.fallbackFromProviderId) {
+    const [fallbackProvider] = await db
+      .select({ providerName: llmProviders.providerName })
+      .from(llmProviders)
+      .where(eq(llmProviders.id, row.fallbackFromProviderId));
+    if (fallbackProvider) {
+      result.fallbackFrom = fallbackProvider.providerName;
+    }
+  }
+
+  return result;
+}
