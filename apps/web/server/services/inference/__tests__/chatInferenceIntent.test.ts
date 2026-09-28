import { describe, expect, it } from "vitest";
import type { Message } from "../../../_core/llm";
import { buildChatInferenceIntent } from "../chatInferenceIntent";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    messages: [{ role: "user", content: "สวัสดี" }] as Message[],
    selection: { mode: "auto-global" as const },
    tenantId: "tenant-a",
    userId: 7,
    traceId: "trace-123",
    idempotencyKey: "client-request-1",
    availableBudgetMicros: 50_000,
    ...overrides,
  };
}

describe("buildChatInferenceIntent", () => {
  it("builds a strict AUTO intent with server-owned scope and hashed idempotency", () => {
    const result = buildChatInferenceIntent(baseInput());

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.request).toMatchObject({
      contract: "SAH-INFERENCE-2",
      tenantId: "tenant-a",
      principalId: "user:7",
      consumer: "web.chat",
      selection: { mode: "AUTO" },
      inputModalities: ["text"],
      outputModalities: ["text"],
      idempotencyKey: expect.stringMatching(/^chat:[a-f0-9]{64}$/),
      maxEstimatedCostMicros: 50_000,
    });
    expect(result.request.idempotencyKey).not.toContain("client-request-1");
    expect(result.request.inputTokenEstimate).toBeGreaterThan(0);
  });

  it("maps provider AUTO to a provider lock without selecting a model", () => {
    const result = buildChatInferenceIntent(
      baseInput({
        selection: { mode: "auto-provider", providerId: 18 },
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      request: {
        selection: {
          mode: "PROVIDER_LOCK",
          providerId: "provider:llm-provider:18",
          fallback: "ask",
        },
      },
    });
  });

  it("maps requested multimodal capabilities into strict required features", () => {
    const result = buildChatInferenceIntent(
      baseInput({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "describe this" },
              { type: "image_url", image_url: { url: "https://example.test/image" } },
            ],
          },
        ] as unknown as Message[],
        selectionContext: {
          featureModes: ["web_search", "tool_calling", "structured_output"],
        },
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      request: {
        inputModalities: ["image", "text"],
        requiredFeatures: ["structured_output", "tool_calling", "vision", "web_search"],
      },
    });
  });

  it("does not trust an explicit model ID without a certified server profile", () => {
    const result = buildChatInferenceIntent(
      baseInput({
        selection: { mode: "explicit", modelId: "model-a" },
      }),
    );

    expect(result).toEqual({ ok: false, reason: "INVALID_SCOPE" });
  });

  it("maps a server-resolved explicit model to a policy MODEL_LOCK", () => {
    const result = buildChatInferenceIntent(
      baseInput({
        selection: { mode: "explicit", modelId: "model-a", providerId: 18 },
        resolvedModelProfileId: "logical:model-a",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      request: {
        selection: {
          mode: "MODEL_LOCK",
          modelProfileId: "logical:model-a",
          providerId: "provider:llm-provider:18",
          fallback: "none",
        },
      },
    });
  });

  it("fails closed for missing idempotency, invalid budget, or oversized input", () => {
    expect(buildChatInferenceIntent(baseInput({ idempotencyKey: " " }))).toEqual({
      ok: false,
      reason: "INVALID_IDEMPOTENCY_KEY",
    });
    expect(buildChatInferenceIntent(baseInput({ availableBudgetMicros: -1 }))).toEqual({
      ok: false,
      reason: "INVALID_BUDGET",
    });
    expect(
      buildChatInferenceIntent(
        baseInput({ messages: [{ role: "user", content: "x".repeat(25_000_000) }] }),
      ),
    ).toEqual({ ok: false, reason: "INPUT_TOO_LARGE" });
  });
});
