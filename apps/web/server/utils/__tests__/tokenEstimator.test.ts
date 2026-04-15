import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessages } from "../tokenEstimator";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates ASCII text (~4 chars per token + 4 overhead)", () => {
    // "Hello world" = 11 chars → 11/4 = 2.75 + 4 overhead = 7 (ceil)
    const tokens = estimateTokens("Hello world");
    expect(tokens).toBe(7);
  });

  it("estimates Thai text (~1.5 chars per token + 4 overhead)", () => {
    // "สวัสดีครับ" = 10 chars (including vowel marks) → 10/1.5 = 6.67 + 4 overhead = 11 (ceil)
    const tokens = estimateTokens("สวัสดีครับ");
    expect(tokens).toBe(11);
  });

  it("estimates mixed content (ASCII + Thai)", () => {
    // "Hello สวัสดี World" — Thai "สวัสดี" = 6 chars, rest = 12 ASCII chars (incl. spaces)
    // 12/4 + 6/1.5 + 4 = 3 + 4 + 4 = 11
    const tokens = estimateTokens("Hello สวัสดี World");
    expect(tokens).toBeGreaterThanOrEqual(10);
    expect(tokens).toBeLessThanOrEqual(12);
  });

  it("handles CJK characters", () => {
    // "你好世界" = 4 CJK chars → 4/1.5 + 4 = 6.67 → ceil = 7
    const tokens = estimateTokens("你好世界");
    expect(tokens).toBe(7);
  });

  it("handles Korean characters", () => {
    // "안녕하세요" = 5 Korean chars → 5/1.5 + 4 = 7.33 → ceil = 8
    const tokens = estimateTokens("안녕하세요");
    expect(tokens).toBe(8);
  });
});

describe("estimateMessages", () => {
  it("sums tokens across messages", () => {
    const messages = [
      { role: "user", content: "Hello world" },        // 7 tokens
      { role: "assistant", content: "Hi there!" },      // "Hi there!" = 9 chars → 9/4 + 4 = 7 (ceil)
      { role: "user", content: "How are you?" },        // "How are you?" = 12 chars → 12/4 + 4 = 7
    ];
    const total = estimateMessages(messages);
    expect(total).toBe(7 + 7 + 7);
  });

  it("handles empty messages array", () => {
    expect(estimateMessages([])).toBe(0);
  });

  it("handles messages with empty content", () => {
    const messages = [
      { role: "user", content: "" },
      { role: "assistant" },
    ];
    expect(estimateMessages(messages)).toBe(0);
  });

  it("handles multimodal message content without throwing", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          { type: "image_url", image_url: { url: "https://example.com/example.png" } },
        ],
      },
    ];

    const total = estimateMessages(messages as any);
    expect(total).toBeGreaterThan(0);
  });
});
