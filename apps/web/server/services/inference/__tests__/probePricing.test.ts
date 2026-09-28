import { describe, expect, it } from "vitest";
import { resolveProbePricing } from "../probePricing";

const snapshot = {
  inputMicrosPerMillion: 100_000,
  outputMicrosPerMillion: 200_000,
};

describe("inference capability probe pricing", () => {
  it("uses current mapped prices when they exceed a stale profile snapshot", () => {
    expect(
      resolveProbePricing({
        providerName: "provider",
        availableModels: [],
        providerModelId: "model-a",
        pricingInput: "2.5",
        pricingOutput: "8",
        isFree: false,
        snapshot,
      })
    ).toEqual({
      inputMicrosPerMillion: 2_500_000,
      outputMicrosPerMillion: 8_000_000,
      source: "mapping",
    });
  });

  it("uses a catalog fallback when the mapping has no price", () => {
    expect(
      resolveProbePricing({
        providerName: "provider",
        availableModels: [
          { id: "model-a", pricing: { input: 1.25, output: 3.5 } },
        ],
        providerModelId: "model-a",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: false,
        snapshot,
      })
    ).toEqual({
      inputMicrosPerMillion: 1_250_000,
      outputMicrosPerMillion: 3_500_000,
      source: "catalog",
    });
  });

  it("never lowers a higher profile snapshot for a currently free mapping", () => {
    expect(
      resolveProbePricing({
        providerName: "provider",
        availableModels: [],
        providerModelId: "model-a",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        snapshot,
      })
    ).toEqual({
      ...snapshot,
      source: "mapping",
    });
  });
});
