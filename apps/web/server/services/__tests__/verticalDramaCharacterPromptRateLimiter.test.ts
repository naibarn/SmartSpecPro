import { describe, expect, it } from "vitest";
import { mediaGenerationLimiter } from "../rateLimiter";
import { verticalDramaCharacterPromptLimiter } from "../verticalDramaCharacterPromptRateLimiter";

describe("verticalDramaCharacterPromptLimiter", () => {
  it("uses an independent admission bucket from media generation", () => {
    const key = `rate-limit-test:${Date.now()}:${Math.random()}`;

    expect(verticalDramaCharacterPromptLimiter.getRemaining(key)).toBe(60);
    expect(mediaGenerationLimiter.getRemaining(key)).toBe(100);

    expect(verticalDramaCharacterPromptLimiter.isAllowed(key)).toBe(true);
    expect(mediaGenerationLimiter.getRemaining(key)).toBe(100);

    expect(mediaGenerationLimiter.isAllowed(key)).toBe(true);
    expect(verticalDramaCharacterPromptLimiter.getRemaining(key)).toBe(59);

    verticalDramaCharacterPromptLimiter.reset(key);
    mediaGenerationLimiter.reset(key);
  });
});
