diff --git a/apps/web/server/services/__tests__/callLLMStructured.test.ts b/apps/web/server/services/__tests__/callLLMStructured.test.ts
new file mode 100644
index 0000000..4be931d
--- /dev/null
+++ b/apps/web/server/services/__tests__/callLLMStructured.test.ts
@@ -0,0 +1,214 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { z } from "zod";
+
+const { mockExecuteWithFallback, mockDeductCreditsForModel } = vi.hoisted(
+  () => ({
+    mockExecuteWithFallback: vi.fn(),
+    mockDeductCreditsForModel: vi.fn(),
+  }),
+);
+
+vi.mock("../llmRouter", () => ({
+  executeWithFallback: mockExecuteWithFallback,
+}));
+
+vi.mock("../creditService", () => ({
+  deductCreditsForModel: mockDeductCreditsForModel,
+}));
+
+vi.mock("../auditLogger", () => ({
+  auditLogger: { log: vi.fn() },
+}));
+
+import {
+  callLLMStructured,
+  LLMStructuredOutputError,
+} from "../callLLMStructured";
+
+// A simple Zod schema for testing
+const TestSchema = z.object({
+  title: z.string(),
+  items: z.array(z.string()),
+});
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mockDeductCreditsForModel.mockResolvedValue({
+    creditsUsed: 5,
+    wasFree: false,
+  });
+});
+
+// --- Helpers ---
+
+function makeSuccessResponse(content: string) {
+  return {
+    type: "success" as const,
+    response: {
+      choices: [{ message: { content } }],
+      usage: {
+        prompt_tokens: 100,
+        completion_tokens: 50,
+        total_tokens: 150,
+      },
+    },
+    providerId: 1,
+    providerName: "test-provider",
+  };
+}
+
+const baseParams = {
+  systemPrompt: "You are a helpful assistant.",
+  userMessage: "Generate a list",
+  zodSchema: TestSchema,
+  userId: 42,
+  tenantId: "tenant-1",
+};
+
+describe("callLLMStructured", () => {
+  it("returns parsed data when LLM returns valid JSON matching Zod schema", async () => {
+    const validJson = JSON.stringify({
+      title: "My List",
+      items: ["one", "two"],
+    });
+    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
+
+    const result = await callLLMStructured(baseParams);
+
+    expect(result.data).toEqual({ title: "My List", items: ["one", "two"] });
+  });
+
+  it("extracts tokensUsed and creditsUsed from response metadata", async () => {
+    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
+    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
+    mockDeductCreditsForModel.mockResolvedValue({
+      creditsUsed: 10,
+      wasFree: false,
+    });
+
+    const result = await callLLMStructured(baseParams);
+
+    expect(result.tokensUsed).toBe(150); // 100 + 50
+    expect(result.creditsUsed).toBe(10);
+  });
+
+  it("retries once when first response is invalid JSON, succeeds on retry", async () => {
+    const validJson = JSON.stringify({ title: "OK", items: ["x"] });
+    mockExecuteWithFallback
+      .mockResolvedValueOnce(makeSuccessResponse("not valid json {{{"))
+      .mockResolvedValueOnce(makeSuccessResponse(validJson));
+
+    const result = await callLLMStructured(baseParams);
+
+    expect(result.data).toEqual({ title: "OK", items: ["x"] });
+    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
+
+    // Verify retry message includes error context
+    const retryCall = mockExecuteWithFallback.mock.calls[1][0];
+    const userMsg = retryCall.messages.find(
+      (m: { role: string }) => m.role === "user",
+    );
+    expect(userMsg.content).toContain("JSON");
+  });
+
+  it("retries once when first response fails Zod validation, succeeds on retry", async () => {
+    // Missing 'items' field
+    const invalidShape = JSON.stringify({ title: "Missing items" });
+    const validJson = JSON.stringify({
+      title: "Complete",
+      items: ["item1"],
+    });
+    mockExecuteWithFallback
+      .mockResolvedValueOnce(makeSuccessResponse(invalidShape))
+      .mockResolvedValueOnce(makeSuccessResponse(validJson));
+
+    const result = await callLLMStructured(baseParams);
+
+    expect(result.data).toEqual({ title: "Complete", items: ["item1"] });
+    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
+  });
+
+  it("throws after retry when both attempts return invalid JSON", async () => {
+    mockExecuteWithFallback
+      .mockResolvedValueOnce(makeSuccessResponse("not json"))
+      .mockResolvedValueOnce(makeSuccessResponse("still not json"));
+
+    await expect(callLLMStructured(baseParams)).rejects.toThrow(
+      LLMStructuredOutputError,
+    );
+    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
+  });
+
+  it("throws after retry when both attempts fail Zod validation", async () => {
+    const wrongShape = JSON.stringify({ wrong: "shape" });
+    mockExecuteWithFallback
+      .mockResolvedValueOnce(makeSuccessResponse(wrongShape))
+      .mockResolvedValueOnce(makeSuccessResponse(wrongShape));
+
+    await expect(callLLMStructured(baseParams)).rejects.toThrow(
+      LLMStructuredOutputError,
+    );
+  });
+
+  it("passes systemPrompt with JSON instructions appended to messages", async () => {
+    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
+    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
+
+    await callLLMStructured(baseParams);
+
+    const call = mockExecuteWithFallback.mock.calls[0][0];
+    const systemMsg = call.messages.find(
+      (m: { role: string }) => m.role === "system",
+    );
+    expect(systemMsg.content).toContain("You are a helpful assistant.");
+    expect(systemMsg.content).toContain("JSON");
+  });
+
+  it("passes userId to executeWithFallback", async () => {
+    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
+    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
+
+    await callLLMStructured(baseParams);
+
+    const call = mockExecuteWithFallback.mock.calls[0][0];
+    expect(call.userId).toBe(42);
+  });
+
+  it("uses default model when model param is omitted", async () => {
+    const validJson = JSON.stringify({ title: "Test", items: ["a"] });
+    mockExecuteWithFallback.mockResolvedValue(makeSuccessResponse(validJson));
+
+    await callLLMStructured(baseParams);
+
+    const call = mockExecuteWithFallback.mock.calls[0][0];
+    expect(call.model).toBe("claude-sonnet-4-6");
+  });
+
+  it("propagates executeWithFallback errors without wrapping", async () => {
+    mockExecuteWithFallback.mockResolvedValue({
+      type: "error",
+      error: "Provider unavailable",
+      statusCode: 503,
+    });
+
+    await expect(callLLMStructured(baseParams)).rejects.toThrow(
+      "Provider unavailable",
+    );
+    // Should NOT be wrapped in LLMStructuredOutputError
+    await expect(callLLMStructured(baseParams)).rejects.not.toBeInstanceOf(
+      LLMStructuredOutputError,
+    );
+  });
+
+  it("handles maxRetries=0 to disable retry", async () => {
+    mockExecuteWithFallback.mockResolvedValue(
+      makeSuccessResponse("not json"),
+    );
+
+    await expect(
+      callLLMStructured({ ...baseParams, maxRetries: 0 }),
+    ).rejects.toThrow(LLMStructuredOutputError);
+
+    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/apps/web/server/services/callLLMStructured.ts b/apps/web/server/services/callLLMStructured.ts
new file mode 100644
index 0000000..34d680d
--- /dev/null
+++ b/apps/web/server/services/callLLMStructured.ts
@@ -0,0 +1,176 @@
+import { z } from "zod";
+import { executeWithFallback } from "./llmRouter";
+import { deductCreditsForModel } from "./creditService";
+import { auditLogger } from "./auditLogger";
+
+// ── Types ────────────────────────────────────────────────────
+
+export interface CallLLMStructuredParams<T> {
+  systemPrompt: string;
+  userMessage: string;
+  model?: string;
+  zodSchema: z.ZodType<T>;
+  maxRetries?: number; // default 1
+  userId: number;
+  tenantId: string;
+}
+
+export interface CallLLMStructuredResult<T> {
+  data: T;
+  tokensUsed: number;
+  creditsUsed: number;
+}
+
+// ── Error class ──────────────────────────────────────────────
+
+export class LLMStructuredOutputError extends Error {
+  constructor(
+    message: string,
+    public readonly rawResponse: string,
+    public readonly zodErrors?: z.ZodError,
+  ) {
+    super(message);
+    this.name = "LLMStructuredOutputError";
+  }
+}
+
+// ── Helpers ──────────────────────────────────────────────────
+
+function stripMarkdownFences(text: string): string {
+  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
+  return fenced ? fenced[1].trim() : text.trim();
+}
+
+const DEFAULT_MODEL = "claude-sonnet-4-6";
+
+// ── Main function ────────────────────────────────────────────
+
+export async function callLLMStructured<T>(
+  params: CallLLMStructuredParams<T>,
+): Promise<CallLLMStructuredResult<T>> {
+  const {
+    systemPrompt,
+    userMessage,
+    model = DEFAULT_MODEL,
+    zodSchema,
+    maxRetries = 1,
+    userId,
+    tenantId,
+  } = params;
+
+  const augmentedSystemPrompt = `${systemPrompt}
+
+You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanatory text, no trailing commas.
+The JSON must strictly conform to the expected schema.`;
+
+  let totalTokens = 0;
+  let totalCredits = 0;
+  let lastRawResponse = "";
+  let lastZodError: z.ZodError | undefined;
+
+  for (let attempt = 0; attempt <= maxRetries; attempt++) {
+    const isRetry = attempt > 0;
+
+    const messages = [
+      { role: "system", content: augmentedSystemPrompt },
+      {
+        role: "user",
+        content: isRetry
+          ? `${userMessage}\n\nYour previous response was invalid JSON or did not match the expected schema. The error was: ${lastZodError ? lastZodError.message : "Invalid JSON syntax"}. Raw response: "${lastRawResponse}". Please try again and return ONLY valid JSON.`
+          : userMessage,
+      },
+    ];
+
+    const result = await executeWithFallback({
+      model,
+      messages,
+      stream: false,
+      userId,
+    });
+
+    if (result.type === "error") {
+      throw new Error(result.error);
+    }
+
+    if (result.type === "fallback_required") {
+      throw new Error(
+        "LLM provider requires fallback consent, which is not supported in structured output mode",
+      );
+    }
+
+    // Extract content and usage
+    const content = result.response.choices[0]?.message?.content ?? "";
+    const usage = result.response.usage ?? {
+      prompt_tokens: 0,
+      completion_tokens: 0,
+    };
+    const inputTokens = usage.prompt_tokens ?? 0;
+    const outputTokens = usage.completion_tokens ?? 0;
+    totalTokens += inputTokens + outputTokens;
+
+    // Deduct credits for this attempt
+    const { creditsUsed } = await deductCreditsForModel({
+      userId,
+      model,
+      provider: result.providerName,
+      inputTokens,
+      outputTokens,
+      sourceType: "skill",
+    });
+    totalCredits += creditsUsed;
+
+    lastRawResponse = content;
+
+    // Strip markdown fences and attempt JSON parse
+    const cleaned = stripMarkdownFences(content);
+    let parsed: unknown;
+    try {
+      parsed = JSON.parse(cleaned);
+    } catch {
+      // JSON parse failed — retry if we have attempts left
+      lastZodError = undefined;
+      if (attempt < maxRetries) continue;
+      throw new LLMStructuredOutputError(
+        `LLM returned invalid JSON after ${attempt + 1} attempt(s)`,
+        content,
+      );
+    }
+
+    // Validate against Zod schema
+    const validation = zodSchema.safeParse(parsed);
+    if (!validation.success) {
+      lastZodError = validation.error;
+      if (attempt < maxRetries) continue;
+      throw new LLMStructuredOutputError(
+        `LLM response failed schema validation after ${attempt + 1} attempt(s): ${validation.error.message}`,
+        content,
+        validation.error,
+      );
+    }
+
+    // Success
+    auditLogger.log({
+      eventType: "llm_response",
+      userId,
+      model,
+      metadata: {
+        structured: true,
+        attempts: attempt + 1,
+        tenantId,
+      },
+    });
+
+    return {
+      data: validation.data,
+      tokensUsed: totalTokens,
+      creditsUsed: totalCredits,
+    };
+  }
+
+  // This should be unreachable, but TypeScript needs it
+  throw new LLMStructuredOutputError(
+    "LLM structured output failed",
+    lastRawResponse,
+    lastZodError,
+  );
+}
