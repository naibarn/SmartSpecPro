/**
 * Coverage for `verticalDramaStoryBible.ts`'s `executeJsonPlanningCallWithRetry`
 * — the shared one-retry-on-truncated/invalid-JSON wrapper used by every
 * vertical-drama LLM *planning* call (`generateStoryBible`,
 * `generateEpisodeScript`, `generateStoryboardShotgrid`,
 * `generateStartFrameRenderPlan`, `generateVideoMotionPromptPack`).
 *
 * Root cause this exists to fix (2026-07-05 evidence, series 2 episode 1):
 * `start_frame_render_plan` generation's `maxTokens: 4000` ceiling truncated
 * the LLM's 9-shot enriched JSON output mid-array, `extractJson` threw
 * `VD_SCHEMA_VALIDATION_FAILED`, and the stage failed with no retry — twice
 * in a row for the same user click. This wrapper adds exactly one retry
 * against the SAME model (never auto-switches models) with a stricter
 * "do not truncate" instruction appended and a higher token ceiling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

import { executeWithFallback } from "../llmRouter";
import {
  executeJsonPlanningCallWithRetry,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);

const schema = z.object({ items: z.array(z.string()).length(3) });

function successWith(content: string, completionTokens = 50) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: completionTokens },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

const VALID_JSON = JSON.stringify({ items: ["a", "b", "c"] });
const TRUNCATED_JSON = '{"items":["a","b"'; // cut mid-array, unparsable

function baseArgs(overrides: Partial<Parameters<typeof executeJsonPlanningCallWithRetry>[0]> = {}) {
  return {
    model: "gpt-4o-mini",
    systemPrompt: "system",
    userPrompt: "user prompt",
    temperature: 0.7,
    userId: 1,
    maxTokens: 4000,
    schema,
    label: "Test planning call",
    ...overrides,
  };
}

describe("executeJsonPlanningCallWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed+validated data on the first attempt without retrying when the JSON is valid", async () => {
    mockExecute.mockResolvedValue(successWith(VALID_JSON));

    const result = await executeJsonPlanningCallWithRetry(baseArgs());

    expect(result.data).toEqual({ items: ["a", "b", "c"] });
    expect(result.retried).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on truncated JSON, using the SAME model both times (never auto-switches models)", async () => {
    mockExecute
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000))
      .mockResolvedValueOnce(successWith(VALID_JSON));

    const result = await executeJsonPlanningCallWithRetry(baseArgs());

    expect(result.data).toEqual({ items: ["a", "b", "c"] });
    expect(result.retried).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute.mock.calls[0][0].model).toBe("gpt-4o-mini");
    expect(mockExecute.mock.calls[1][0].model).toBe("gpt-4o-mini");
  });

  it("raises the token ceiling on retry (default: max(2x, 16000)) and appends the strict no-truncation instruction", async () => {
    mockExecute
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000))
      .mockResolvedValueOnce(successWith(VALID_JSON));

    await executeJsonPlanningCallWithRetry(baseArgs({ maxTokens: 4000 }));

    expect(mockExecute.mock.calls[0][0].maxTokens).toBe(4000);
    expect(mockExecute.mock.calls[1][0].maxTokens).toBe(16000);
    const retryUserMessage = mockExecute.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(retryUserMessage.content).toMatch(/Do not truncate/i);
    expect(retryUserMessage.content).toContain("user prompt"); // original prompt preserved
  });

  it("honors an explicit retryMaxTokens override instead of the default 2x/16000 floor", async () => {
    mockExecute
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000))
      .mockResolvedValueOnce(successWith(VALID_JSON));

    await executeJsonPlanningCallWithRetry(baseArgs({ maxTokens: 16000, retryMaxTokens: 24000 }));

    expect(mockExecute.mock.calls[1][0].maxTokens).toBe(24000);
  });

  it("throws VdSchemaValidationError (does not silently return partial/empty data) when BOTH attempts fail", async () => {
    mockExecute
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000))
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000));

    await expect(executeJsonPlanningCallWithRetry(baseArgs())).rejects.toThrow(
      VdSchemaValidationError,
    );
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("throws VdSchemaValidationError when the retry's JSON parses but still fails schema validation", async () => {
    mockExecute
      .mockResolvedValueOnce(successWith(TRUNCATED_JSON, 4000))
      .mockResolvedValueOnce(successWith(JSON.stringify({ items: ["only-one"] })));

    await expect(executeJsonPlanningCallWithRetry(baseArgs())).rejects.toThrow(
      VdSchemaValidationError,
    );
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a provider/network error — only malformed-JSON/schema failures are retried", async () => {
    mockExecute.mockResolvedValue({ type: "error", error: "upstream 503", statusCode: 503 } as any);

    await expect(executeJsonPlanningCallWithRetry(baseArgs())).rejects.toThrow(
      "LLM request failed: upstream 503",
    );
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry when the provider never reaches a successful response (non-success, non-error type)", async () => {
    mockExecute.mockResolvedValue({ type: "no_provider" } as any);

    await expect(executeJsonPlanningCallWithRetry(baseArgs())).rejects.toThrow(
      "LLM request did not reach a successful provider response",
    );
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
