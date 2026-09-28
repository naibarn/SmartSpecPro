import { describe, expect, it, vi } from "vitest";

vi.mock("./runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn(async () => ({
    PROMPTPAY_DIRECT_FX_PROVIDER: "frankfurter_daily",
    PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE: "20",
    PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE: "60",
    PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS: "72",
  })),
}));

function response(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload } as Response;
}

describe("Frankfurter PromptPay FX pricing", () => {
  it("accepts the configured USD/THB daily quote", async () => {
    const { fetchFrankfurterUsdThbRate, calculatePromptPayThb } = await import("./frankfurterRateService");
    const now = new Date("2026-08-18T12:00:00.000Z");
    const quote = await fetchFrankfurterUsdThbRate({
      now,
      fetchImpl: vi.fn(async () => response({ date: "2026-08-18", base: "USD", quote: "THB", rate: 33.041 })),
    });

    expect(quote.rate).toBe(33.041);
    expect(quote.rateDate).toBe("2026-08-18");
    expect(calculatePromptPayThb({
      priceUsd: 10,
      dailyRate: quote.rate,
      sellSpreadBps: 200,
      riskBufferBps: 300,
      randomSatang: 7,
    })).toMatchObject({
      effectiveRate: 34.7128746,
      roundedBaseThb: 348,
      finalAmountThb: 348.07,
    });
  });

  it("fails closed for stale, invalid, and out-of-range provider responses", async () => {
    const { fetchFrankfurterUsdThbRate, FxQuoteError } = await import("./frankfurterRateService");
    const now = new Date("2026-08-18T12:00:00.000Z");
    await expect(fetchFrankfurterUsdThbRate({ now, fetchImpl: vi.fn(async () => response({ date: "2026-08-10", base: "USD", quote: "THB", rate: 33 })) })).rejects.toMatchObject<FxQuoteError>({ code: "FX_QUOTE_STALE" });
    await expect(fetchFrankfurterUsdThbRate({ now, fetchImpl: vi.fn(async () => response({ date: "2026-08-18", base: "USD", quote: "THB", rate: 100 })) })).rejects.toMatchObject<FxQuoteError>({ code: "FX_RATE_OUT_OF_BOUNDS" });
    await expect(fetchFrankfurterUsdThbRate({ now, fetchImpl: vi.fn(async () => response({ date: "2026-08-18", base: "EUR", quote: "THB", rate: 33 })) })).rejects.toMatchObject<FxQuoteError>({ code: "FX_PROVIDER_RESPONSE_INVALID" });
  });
});
