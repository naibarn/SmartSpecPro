import { beforeEach, describe, expect, it, vi } from "vitest";

const mockZcard = vi.fn().mockResolvedValue(0);
const mockZrange = vi.fn().mockResolvedValue([]);

const mockRedisClient = {
  zcard: mockZcard,
  zrange: mockZrange,
};

vi.mock("../redis", () => ({
  getRedisClient: () => mockRedisClient,
  isRedisAvailable: () => true,
}));

import { getDocumentOcrLimiterStatus, getDocumentOcrProviderLimitConfig, DOCUMENT_OCR_RATE_LIMIT_KEY } from "../llmRateLimiter";

describe("document OCR limiter status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockZcard.mockResolvedValue(0);
    mockZrange.mockResolvedValue([]);
  });

  it("returns Typhoon OCR as an external limiter", async () => {
    mockZcard.mockResolvedValue(7);
    mockZrange.mockResolvedValue(["1700000000", "1700000000"]);

    const status = await getDocumentOcrLimiterStatus();

    expect(status).toHaveLength(1);
    expect(status[0].provider).toBe("typhoon_ocr_1_5");
    expect(status[0].displayName).toBe("Typhoon OCR 1.5");
    expect(status[0].managedExternally).toBe(true);
    expect(status[0].current).toBe(7);
    expect(status[0].remaining).toBe(13);
    expect(status[0].limit).toBe(20);
    expect(status[0].windowSeconds).toBe(60);
    expect(status[0].note).toContain("system-wide");
    expect(mockZcard).toHaveBeenCalledWith(DOCUMENT_OCR_RATE_LIMIT_KEY);
    expect(getDocumentOcrProviderLimitConfig("typhoon_ocr_1_5")?.managedExternally).toBe(true);
  });
});
