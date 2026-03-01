import { describe, it, expect, vi } from "vitest";

// ── Tests for calculateSTTCredits and calculateTTSCredits ──────────────────

import { calculateSTTCredits } from "../sttService";
import { calculateTTSCredits } from "../ttsService";

describe("voice credit integration", () => {
  describe("STT credit calculation", () => {
    it("calculates STT cost as 0 credits for groq (free tier)", () => {
      expect(calculateSTTCredits(30, "groq")).toBe(0);
    });

    it("calculates STT cost as 3 credits per minute (ceiling) for openai", () => {
      // 30s = 0.5 min -> ceil(1.5) = 2 credits
      expect(calculateSTTCredits(30, "openai")).toBe(2);
    });

    it("calculates STT for 60s as 3 credits", () => {
      expect(calculateSTTCredits(60, "openai")).toBe(3);
    });
  });

  describe("TTS credit calculation", () => {
    it("calculates TTS cost as 5 credits per 1K characters", () => {
      expect(calculateTTSCredits(1000)).toBe(5);
    });

    it("rounds up for partial 1K blocks", () => {
      // 500 chars -> ceil(2.5) = 3 credits
      expect(calculateTTSCredits(500)).toBe(3);
    });

    it("minimum is 1 credit for any text", () => {
      expect(calculateTTSCredits(1)).toBe(1);
    });
  });
});
