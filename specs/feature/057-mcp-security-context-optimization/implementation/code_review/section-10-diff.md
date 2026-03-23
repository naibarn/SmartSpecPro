diff --git a/apps/web/server/services/chatService.ts b/apps/web/server/services/chatService.ts
index 66c4fe37..116cdecd 100644
--- a/apps/web/server/services/chatService.ts
+++ b/apps/web/server/services/chatService.ts
@@ -21,6 +21,7 @@ import {
   tenants,
 } from "../../drizzle/schema";
 import { resolveEnabledLlmModelId } from "./enabledLlmModels";
+import { estimateTokens, estimateMessages } from "../utils/tokenEstimator";
 
 // ==================== Google Drive Integration ====================
 
@@ -816,16 +817,61 @@ Use 'react' for interactive React components, 'chart' for data visualizations (J
     });
   }
 
-  // 4. Add recent messages
+  // 4. Add recent messages with token budget enforcement
   const recentMessages = await getRecentMessages(conversationId, 20);
-  for (const msg of recentMessages) {
-    if (msg.role === "system") continue; // Skip system messages in buffer
-    context.push({
+
+  // Estimate token budget from model context length
+  const DEFAULT_CONTEXT_LENGTH = 32000;
+  const OUTPUT_RESERVE = 8192;
+  let inputBudget = DEFAULT_CONTEXT_LENGTH - OUTPUT_RESERVE;
+  try {
+    const db = await getDb();
+    if (db) {
+      const [conv] = await db
+        .select({ model: conversations.model })
+        .from(conversations)
+        .where(eq(conversations.id, conversationId))
+        .limit(1);
+      if (conv?.model) {
+        const { llmModels } = await import("../../drizzle/schema");
+        const [modelRow] = await db
+          .select({ contextLength: llmModels.contextLength })
+          .from(llmModels)
+          .where(eq(llmModels.modelId, conv.model))
+          .limit(1);
+        if (modelRow?.contextLength) {
+          inputBudget = modelRow.contextLength - OUTPUT_RESERVE;
+        }
+      }
+    }
+  } catch {
+    // Use default budget if model lookup fails
+  }
+
+  // Calculate tokens already used by system context
+  const systemTokens = estimateMessages(context);
+
+  // Add messages from most recent first, respecting token budget
+  const remainingBudget = inputBudget - systemTokens;
+  const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
+  let usedTokens = 0;
+
+  // Iterate from newest to oldest, stop when budget is exceeded
+  for (let i = recentMessages.length - 1; i >= 0; i--) {
+    const msg = recentMessages[i];
+    if (msg.role === "system") continue;
+    const tokens = estimateTokens(msg.content);
+    if (usedTokens + tokens > remainingBudget && chatMessages.length >= 6) {
+      break; // Keep at least 6 most recent turns
+    }
+    chatMessages.unshift({
       role: msg.role as "user" | "assistant",
       content: msg.content,
     });
+    usedTokens += tokens;
   }
 
+  context.push(...chatMessages);
   return context;
 }
 
diff --git a/apps/web/server/services/promptComposer.ts b/apps/web/server/services/promptComposer.ts
index 126198dc..1b4d1fb1 100644
--- a/apps/web/server/services/promptComposer.ts
+++ b/apps/web/server/services/promptComposer.ts
@@ -18,6 +18,10 @@ import {
 import { retrieveForPrompt, type MemorySearchResult } from "./scopedMemoryService";
 import { buildPersonaPromptSegments, type PersonaPromptSegments } from "./personaService";
 import { getEntityMemories } from "./chatService";
+import {
+  estimateTokens,
+  truncateToTokenBudget,
+} from "../utils/tokenEstimator";
 
 // ─── Types ──────────────────────────────────────────────────────────────────
 
@@ -150,9 +154,6 @@ export function scaleBudget(
  *
  * This gives ~15% more accurate estimates than flat 4-char division.
  */
-const CHARS_PER_TOKEN_ASCII = 4.0;
-const CHARS_PER_TOKEN_CJK = 1.5;
-
 // ─── Sanitization ───────────────────────────────────────────────────────────
 
 /** Sanitize message content to prevent stored prompt injection */
@@ -170,34 +171,8 @@ function sanitizeHistoryContent(content: string): string {
     .replace(/ignore (all )?previous/gi, "[filtered]");
 }
 
-// ─── Helpers (exported for testing) ─────────────────────────────────────────
-
-/** Regex to detect CJK / Thai / Korean script ranges */
-const CJK_RANGE = /[\u2E80-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;
-
-export function estimateTokens(text: string): number {
-  if (!text) return 0;
-
-  // Count CJK/Thai characters (tokenized at ~1.5 chars per token)
-  const cjkMatches = text.match(CJK_RANGE);
-  const cjkCharCount = cjkMatches?.length ?? 0;
-
-  // Remaining ASCII-like characters (tokenized at ~4 chars per token)
-  const asciiCharCount = text.length - cjkCharCount;
-
-  const cjkTokens = cjkCharCount / CHARS_PER_TOKEN_CJK;
-  const asciiTokens = asciiCharCount / CHARS_PER_TOKEN_ASCII;
-
-  // Add overhead for message framing (~4 tokens per message)
-  return Math.ceil(cjkTokens + asciiTokens + 4);
-}
-
-export function truncateToTokenBudget(text: string, budget: number): string {
-  // Use ASCII rate for safe truncation (slightly conservative)
-  const maxChars = Math.floor(budget * CHARS_PER_TOKEN_ASCII);
-  if (text.length <= maxChars) return text;
-  return text.substring(0, maxChars) + "\n...(truncated)";
-}
+// Re-export for backwards compatibility with existing test imports
+export { estimateTokens, truncateToTokenBudget };
 
 /** Compress history by removing oldest discussion messages first, preserving important types */
 export function compressHistory(
diff --git a/apps/web/server/utils/__tests__/tokenEstimator.test.ts b/apps/web/server/utils/__tests__/tokenEstimator.test.ts
new file mode 100644
index 00000000..f98a739b
--- /dev/null
+++ b/apps/web/server/utils/__tests__/tokenEstimator.test.ts
@@ -0,0 +1,64 @@
+import { describe, it, expect } from "vitest";
+import { estimateTokens, estimateMessages } from "../tokenEstimator";
+
+describe("estimateTokens", () => {
+  it("returns 0 for empty string", () => {
+    expect(estimateTokens("")).toBe(0);
+  });
+
+  it("estimates ASCII text (~4 chars per token + 4 overhead)", () => {
+    // "Hello world" = 11 chars → 11/4 = 2.75 + 4 overhead = 7 (ceil)
+    const tokens = estimateTokens("Hello world");
+    expect(tokens).toBe(7);
+  });
+
+  it("estimates Thai text (~1.5 chars per token + 4 overhead)", () => {
+    // "สวัสดีครับ" = 10 chars (including vowel marks) → 10/1.5 = 6.67 + 4 overhead = 11 (ceil)
+    const tokens = estimateTokens("สวัสดีครับ");
+    expect(tokens).toBe(11);
+  });
+
+  it("estimates mixed content (ASCII + Thai)", () => {
+    // "Hello สวัสดี World" — Thai "สวัสดี" = 6 chars, rest = 12 ASCII chars (incl. spaces)
+    // 12/4 + 6/1.5 + 4 = 3 + 4 + 4 = 11
+    const tokens = estimateTokens("Hello สวัสดี World");
+    expect(tokens).toBeGreaterThanOrEqual(10);
+    expect(tokens).toBeLessThanOrEqual(12);
+  });
+
+  it("handles CJK characters", () => {
+    // "你好世界" = 4 CJK chars → 4/1.5 + 4 = 6.67 → ceil = 7
+    const tokens = estimateTokens("你好世界");
+    expect(tokens).toBe(7);
+  });
+
+  it("handles Korean characters", () => {
+    // "안녕하세요" = 5 Korean chars → 5/1.5 + 4 = 7.33 → ceil = 8
+    const tokens = estimateTokens("안녕하세요");
+    expect(tokens).toBe(8);
+  });
+});
+
+describe("estimateMessages", () => {
+  it("sums tokens across messages", () => {
+    const messages = [
+      { role: "user", content: "Hello world" },        // 7 tokens
+      { role: "assistant", content: "Hi there!" },      // "Hi there!" = 9 chars → 9/4 + 4 = 7 (ceil)
+      { role: "user", content: "How are you?" },        // "How are you?" = 12 chars → 12/4 + 4 = 7
+    ];
+    const total = estimateMessages(messages);
+    expect(total).toBe(7 + 7 + 7);
+  });
+
+  it("handles empty messages array", () => {
+    expect(estimateMessages([])).toBe(0);
+  });
+
+  it("handles messages with empty content", () => {
+    const messages = [
+      { role: "user", content: "" },
+      { role: "assistant" },
+    ];
+    expect(estimateMessages(messages)).toBe(0);
+  });
+});
diff --git a/apps/web/server/utils/tokenEstimator.ts b/apps/web/server/utils/tokenEstimator.ts
new file mode 100644
index 00000000..336d8ce6
--- /dev/null
+++ b/apps/web/server/utils/tokenEstimator.ts
@@ -0,0 +1,40 @@
+/**
+ * Shared token estimation utilities for chat context budget enforcement.
+ *
+ * Estimates token counts for text using character-based heuristics:
+ * - ASCII/Latin text: ~4 characters per token
+ * - CJK/Thai/Korean text: ~1.5 characters per token
+ * - 4 tokens overhead per message (framing)
+ */
+
+const CHARS_PER_TOKEN_ASCII = 4.0;
+const CHARS_PER_TOKEN_CJK = 1.5;
+const MESSAGE_OVERHEAD_TOKENS = 4;
+
+/** Regex to detect CJK / Thai / Korean script ranges */
+const CJK_RANGE = /[\u2E80-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/g;
+
+export function estimateTokens(text: string): number {
+  if (!text) return 0;
+
+  const cjkMatches = text.match(CJK_RANGE);
+  const cjkCharCount = cjkMatches?.length ?? 0;
+  const asciiCharCount = text.length - cjkCharCount;
+
+  const cjkTokens = cjkCharCount / CHARS_PER_TOKEN_CJK;
+  const asciiTokens = asciiCharCount / CHARS_PER_TOKEN_ASCII;
+
+  return Math.ceil(cjkTokens + asciiTokens + MESSAGE_OVERHEAD_TOKENS);
+}
+
+export function estimateMessages(
+  messages: Array<{ content?: string; role?: string }>,
+): number {
+  return messages.reduce((sum, m) => sum + estimateTokens(m.content || ""), 0);
+}
+
+export function truncateToTokenBudget(text: string, budget: number): string {
+  const maxChars = Math.floor(budget * CHARS_PER_TOKEN_ASCII);
+  if (text.length <= maxChars) return text;
+  return text.substring(0, maxChars) + "\n...(truncated)";
+}
