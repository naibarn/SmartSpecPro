import { describe, expect, it } from "vitest";
import { createChatInferenceIdempotencyKey } from "./chatInferenceIdempotency";

describe("chat inference idempotency key", () => {
  it("is stable for a persisted user message and the same route selection", async () => {
    const input = {
      conversationId: "conversation:1",
      userMessageId: 42,
      selection: { mode: "auto-global" as const },
    };
    const first = await createChatInferenceIdempotencyKey(input);
    const retry = await createChatInferenceIdempotencyKey(input);

    expect(first).toBe(retry);
    expect(first).toMatch(/^chat:[a-f0-9]{64}$/);
  });

  it("uses distinct keys for separate messages, conversations, or route choices", async () => {
    const base = {
      conversationId: "conversation:1",
      userMessageId: 42,
      selection: { mode: "auto-global" as const },
    };
    const key = await createChatInferenceIdempotencyKey(base);

    await expect(
      createChatInferenceIdempotencyKey({ ...base, userMessageId: 43 })
    ).resolves.not.toBe(key);
    await expect(
      createChatInferenceIdempotencyKey({
        ...base,
        selection: { mode: "auto-provider", providerId: 7 },
      })
    ).resolves.not.toBe(key);
  });

  it("keeps the output bounded for long model identifiers", async () => {
    const key = await createChatInferenceIdempotencyKey({
      conversationId: "conversation:1",
      userMessageId: 42,
      selection: { mode: "explicit", modelId: "m".repeat(512) },
    });

    expect(key).not.toBeNull();
    expect(key!.length).toBeLessThanOrEqual(200);
  });
});
