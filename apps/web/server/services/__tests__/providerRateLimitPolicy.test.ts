import { describe, expect, it } from "vitest";

import {
  getMediaProviderLimitConfig,
  getProviderLimitConfig,
} from "../llmRateLimiter";

describe("provider submission policies", () => {
  it("keeps Kie generation submission below the account window while allowing a durable backlog", () => {
    expect(getMediaProviderLimitConfig("kie.ai")).toMatchObject({
      reservoir: 18,
      reservoirRefreshInterval: 10_000,
      maxConcurrent: 50,
      perUserMaxConcurrent: 3,
    });
  });

  it("models WaveSpeed rate and concurrency independently from queue acceptance", () => {
    expect(getMediaProviderLimitConfig("wavespeed-ai")).toMatchObject({
      reservoir: 5,
      reservoirRefreshInterval: 60_000,
      maxConcurrent: 2,
      perUserMaxConcurrent: 3,
    });
  });

  it("models both OpenRouter rolling request limits and the per-user policy", () => {
    expect(getProviderLimitConfig("openrouter")).toMatchObject({
      reservoir: 20,
      reservoirRefreshInterval: 60_000,
      dailyReservoir: 1000,
      dailyRefreshInterval: 24 * 60 * 60 * 1000,
      perUserMaxConcurrent: 3,
    });
  });
});
