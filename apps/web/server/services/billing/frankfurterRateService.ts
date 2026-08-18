import { getBillingRuntimeConfig } from "./runtimeConfig";

export type FrankfurterRateQuote = {
  provider: "frankfurter_daily";
  base: "USD";
  quote: "THB";
  rate: number;
  rateDate: string;
  fetchedAt: Date;
};

export class FxQuoteError extends Error {
  constructor(
    public readonly code:
      | "FX_QUOTE_UNAVAILABLE"
      | "FX_QUOTE_STALE"
      | "FX_PROVIDER_RESPONSE_INVALID"
      | "FX_RATE_OUT_OF_BOUNDS",
    message: string,
  ) {
    super(message);
    this.name = "FxQuoteError";
  }
}

function parseRateDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", "Frankfurter returned an invalid rate date");
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", "Frankfurter returned an invalid rate date");
  }
  return value;
}

function parseFiniteNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", `Frankfurter returned an invalid ${label}`);
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function fetchFrankfurterUsdThbRate(params?: {
  now?: Date;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FrankfurterRateQuote> {
  const runtime = await getBillingRuntimeConfig();
  if (runtime.PROMPTPAY_DIRECT_FX_PROVIDER !== "frankfurter_daily") {
    throw new FxQuoteError("FX_QUOTE_UNAVAILABLE", "Unsupported PromptPay Direct FX provider");
  }

  const fetchedAt = params?.now ?? new Date();
  const fetchImpl = params?.fetchImpl ?? fetch;
  const timeoutMs = params?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl("https://api.frankfurter.dev/v2/rate/USD/THB", {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    throw new FxQuoteError(
      "FX_QUOTE_UNAVAILABLE",
      error instanceof Error ? error.message : "Frankfurter request failed",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new FxQuoteError("FX_QUOTE_UNAVAILABLE", `Frankfurter returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", "Frankfurter response was not valid JSON");
  }

  if (!payload || typeof payload !== "object") {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", "Frankfurter response was not an object");
  }
  const record = payload as Record<string, unknown>;
  if (record.base !== "USD" || record.quote !== "THB") {
    throw new FxQuoteError("FX_PROVIDER_RESPONSE_INVALID", "Frankfurter returned an unexpected currency pair");
  }

  const rateDate = parseRateDate(record.date);
  const rate = parseFiniteNumber(record.rate, "rate");
  const minRate = Number(runtime.PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE ?? "20");
  const maxRate = Number(runtime.PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE ?? "60");
  if (!Number.isFinite(minRate) || !Number.isFinite(maxRate) || minRate >= maxRate || rate < minRate || rate > maxRate) {
    throw new FxQuoteError("FX_RATE_OUT_OF_BOUNDS", "Frankfurter rate is outside configured sanity bounds");
  }

  const rateEndMs = Date.parse(`${rateDate}T23:59:59.999Z`);
  const maxAgeHours = parsePositiveInteger(runtime.PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS, 72);
  if (rateEndMs > fetchedAt.getTime() + 24 * 60 * 60 * 1000) {
    throw new FxQuoteError("FX_QUOTE_STALE", "Frankfurter rate date is in the future");
  }
  if (fetchedAt.getTime() - rateEndMs > maxAgeHours * 60 * 60 * 1000) {
    throw new FxQuoteError("FX_QUOTE_STALE", "Frankfurter daily rate is too old");
  }

  return {
    provider: "frankfurter_daily",
    base: "USD",
    quote: "THB",
    rate,
    rateDate,
    fetchedAt,
  };
}

export function calculatePromptPayThb(params: {
  priceUsd: number;
  dailyRate: number;
  sellSpreadBps: number;
  riskBufferBps: number;
  taxRatePercent?: number;
  roundingUnitThb?: number;
  randomSatang: number;
}) {
  if (!Number.isFinite(params.priceUsd) || params.priceUsd <= 0) throw new Error("Invalid USD price");
  if (!Number.isFinite(params.dailyRate) || params.dailyRate <= 0) throw new Error("Invalid FX rate");
  if (!Number.isInteger(params.sellSpreadBps) || params.sellSpreadBps < 0) throw new Error("Invalid sell spread");
  if (!Number.isInteger(params.riskBufferBps) || params.riskBufferBps < 0) throw new Error("Invalid FX risk buffer");
  if (!Number.isInteger(params.randomSatang) || params.randomSatang < 0 || params.randomSatang > 99) throw new Error("Invalid random satang");

  const roundingUnitThb = params.roundingUnitThb ?? 1;
  if (roundingUnitThb !== 1) throw new Error("PromptPay Direct V1 requires a 1 THB rounding unit");
  const referenceThb = params.priceUsd * params.dailyRate;
  const commercialThb = referenceThb * (1 + params.sellSpreadBps / 10_000);
  const riskAdjustedThb = commercialThb * (1 + params.riskBufferBps / 10_000);
  const taxRate = Number.isFinite(params.taxRatePercent) ? Number(params.taxRatePercent) : 0;
  const taxAmount = riskAdjustedThb * (taxRate / 100);
  const taxedThb = riskAdjustedThb + taxAmount;
  const roundedBaseThb = Math.ceil((taxedThb - 1e-9) / roundingUnitThb) * roundingUnitThb;
  const finalAmountThb = Number((roundedBaseThb + params.randomSatang / 100).toFixed(2));
  const effectiveRate = params.dailyRate
    * (1 + params.sellSpreadBps / 10_000)
    * (1 + params.riskBufferBps / 10_000);

  return {
    referenceThb,
    commercialThb,
    riskAdjustedThb,
    taxAmount,
    taxedThb,
    roundedBaseThb,
    finalAmountThb,
    effectiveRate,
  };
}
