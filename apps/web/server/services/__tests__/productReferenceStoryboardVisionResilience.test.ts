import { describe, expect, it, vi } from "vitest";

import { runProductReferenceStoryboardVisionLlmCallWithFallback } from "../productReferenceStoryboardSkillRunner";
import type { ExecuteResult } from "../llmRouter";
import type { Message } from "../../_core/llm";

function successResult(providerName = "provider-a"): Extract<
  ExecuteResult,
  { type: "success" }
> {
  return {
    type: "success",
    response: { usage: { prompt_tokens: 10, completion_tokens: 20 } },
    providerId: 1,
    providerName,
  };
}

function errorResult(message: string): Extract<ExecuteResult, { type: "error" }> {
  return { type: "error", error: message, statusCode: 502 };
}

const visionMessages: Message[] = [
  { role: "system", content: "sys" },
  { role: "user", content: [{ type: "text", text: "hi" }] },
];

describe("runProductReferenceStoryboardVisionLlmCallWithFallback", () => {
  it("returns success on the first (primary) model with no fallback recorded", async () => {
    const callModel = vi.fn().mockResolvedValue(successResult("provider-a"));

    const result = await runProductReferenceStoryboardVisionLlmCallWithFallback({
      primaryModelId: "model-a",
      candidateModelIds: ["model-a", "model-b", "model-c"],
      textOnlyModelId: "model-text",
      visionMessages,
      buildTextOnlyMessages: () => [{ role: "user", content: "text only" }],
      callModel,
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callModel).toHaveBeenCalledWith("model-a", visionMessages);
    expect(result.usedModelId).toBe("model-a");
    expect(result.visionFallback).toBeNull();
    expect(result.visionModelAttempts).toEqual([]);
    expect(result.llmResult.type).toBe("success");
  });

  it("retries the next ranked candidate model on a capability error, e.g. 'No endpoints found that support image input'", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(
        errorResult("No endpoints found that support image input"),
      )
      .mockResolvedValueOnce(successResult("provider-b"));

    const onHop = vi.fn();

    const result = await runProductReferenceStoryboardVisionLlmCallWithFallback({
      primaryModelId: "model-a",
      candidateModelIds: ["model-a", "model-b", "model-c"],
      textOnlyModelId: "model-text",
      visionMessages,
      buildTextOnlyMessages: () => [{ role: "user", content: "text only" }],
      callModel,
      onHop,
    });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel).toHaveBeenNthCalledWith(1, "model-a", visionMessages);
    expect(callModel).toHaveBeenNthCalledWith(2, "model-b", visionMessages);
    expect(result.usedModelId).toBe("model-b");
    expect(result.visionFallback).toBe("next_model");
    expect(result.visionModelAttempts).toEqual([
      {
        modelId: "model-a",
        error: "No endpoints found that support image input",
      },
    ]);
    expect(onHop).toHaveBeenCalledTimes(1);
    expect(onHop).toHaveBeenCalledWith({
      modelId: "model-a",
      error: "No endpoints found that support image input",
      mode: "vision",
    });
  });

  it("stops after at most the given candidate list length before falling back to text-only", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(errorResult("err-a"))
      .mockResolvedValueOnce(errorResult("err-b"))
      .mockResolvedValueOnce(errorResult("err-c"))
      .mockResolvedValueOnce(successResult("provider-text"));

    const result = await runProductReferenceStoryboardVisionLlmCallWithFallback({
      primaryModelId: "model-a",
      candidateModelIds: ["model-a", "model-b", "model-c"],
      textOnlyModelId: "model-text",
      visionMessages,
      buildTextOnlyMessages: () => [{ role: "user", content: "text only" }],
      callModel,
    });

    // 3 vision candidates + 1 text-only attempt = 4 calls total
    expect(callModel).toHaveBeenCalledTimes(4);
    expect(callModel).toHaveBeenNthCalledWith(4, "model-text", [
      { role: "user", content: "text only" },
    ]);
    expect(result.usedModelId).toBe("model-text");
    expect(result.visionFallback).toBe("text_only");
    expect(result.visionModelAttempts).toEqual([
      { modelId: "model-a", error: "err-a" },
      { modelId: "model-b", error: "err-b" },
      { modelId: "model-c", error: "err-c" },
    ]);
  });

  it("throws only after every vision candidate AND the text-only fallback fail", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(errorResult("err-a"))
      .mockResolvedValueOnce(errorResult("err-b"))
      .mockResolvedValueOnce(errorResult("err-text-only"));

    await expect(
      runProductReferenceStoryboardVisionLlmCallWithFallback({
        primaryModelId: "model-a",
        candidateModelIds: ["model-a", "model-b"],
        textOnlyModelId: "model-text",
        visionMessages,
        buildTextOnlyMessages: () => [{ role: "user", content: "text only" }],
        callModel,
      }),
    ).rejects.toThrow(/err-text-only/);

    expect(callModel).toHaveBeenCalledTimes(3);
  });

  it("describes a fallback_required attempt without a raw error string", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce({
        type: "fallback_required",
        from: { providerId: 1, providerName: "provider-a" },
        to: { providerId: 2, providerName: "provider-b" },
        estimatedCredits: 1,
      } as ExecuteResult)
      .mockResolvedValueOnce(successResult("provider-c"));

    const result = await runProductReferenceStoryboardVisionLlmCallWithFallback({
      primaryModelId: "model-a",
      candidateModelIds: ["model-a", "model-b"],
      textOnlyModelId: "model-text",
      visionMessages,
      buildTextOnlyMessages: () => [{ role: "user", content: "text only" }],
      callModel,
    });

    expect(result.visionModelAttempts[0].error).toContain(
      "provider fallback required from provider-a to provider-b",
    );
  });
});
