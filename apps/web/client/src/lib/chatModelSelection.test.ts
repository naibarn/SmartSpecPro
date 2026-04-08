import { describe, expect, it } from "vitest";

import {
  AUTO_MODEL,
  buildAutoProviderValue,
  formatSelectionLabel,
  getSelectionDisplaySummary,
  parsePickerSelectionValue,
  selectionToPickerValue,
} from "./chatModelSelection";

describe("chatModelSelection client helpers", () => {
  it("parses global auto and provider auto sentinel values", () => {
    expect(parsePickerSelectionValue({ value: AUTO_MODEL })).toEqual({ mode: "auto-global" });
    expect(parsePickerSelectionValue({
      value: buildAutoProviderValue(9),
      explicitProviderName: "Kie AI",
    })).toEqual({
      mode: "auto-provider",
      providerId: 9,
      providerName: "Kie AI",
    });
  });

  it("parses explicit selection with provider pin", () => {
    expect(parsePickerSelectionValue({
      value: "gpt-4o-mini",
      explicitProviderId: 2,
      explicitProviderName: "OpenRouter",
    })).toEqual({
      mode: "explicit",
      modelId: "gpt-4o-mini",
      providerId: 2,
      providerName: "OpenRouter",
    });
  });

  it("formats auto labels with resolved model metadata", () => {
    expect(formatSelectionLabel({
      pickerValue: AUTO_MODEL,
      storedSelection: {
        mode: "auto-global",
        lastResolvedModelId: "gemini-3-pro",
        lastResolvedProviderName: "Kie AI",
      },
    })).toBe("Auto -> gemini-3-pro (Kie AI)");
  });

  it("builds explicit selection display summaries with provider context", () => {
    expect(getSelectionDisplaySummary({
      pickerValue: "gpt-5-4",
      explicitLabel: "GPT 5.4",
      explicitProviderName: "Kie AI",
    })).toEqual({
      providerLabel: "Kie AI",
      primaryLabel: "GPT 5.4",
      secondaryLabel: "Provider: Kie AI",
      tooltipLabel: "Kie AI · GPT 5.4",
    });
  });

  it("builds auto display summaries with resolved provider details", () => {
    expect(getSelectionDisplaySummary({
      pickerValue: AUTO_MODEL,
      storedSelection: {
        mode: "auto-global",
        lastResolvedModelId: "gpt-5-4",
        lastResolvedProviderName: "Kie AI",
      },
    })).toEqual({
      providerLabel: "Kie AI",
      primaryLabel: "Auto (best overall)",
      secondaryLabel: "Resolved to gpt-5-4 via Kie AI",
      tooltipLabel: "Resolved to gpt-5-4 via Kie AI",
    });
  });

  it("builds provider auto display summaries", () => {
    expect(getSelectionDisplaySummary({
      pickerValue: buildAutoProviderValue(7),
      storedSelection: {
        mode: "auto-provider",
        providerId: 7,
        providerName: "OpenRouter",
        lastResolvedModelId: "gpt-4o-mini",
      },
    })).toEqual({
      providerLabel: "OpenRouter",
      primaryLabel: "Auto Model",
      secondaryLabel: "Resolved to gpt-4o-mini",
      tooltipLabel: "OpenRouter auto model. Resolved to gpt-4o-mini.",
    });
  });

  it("uses explicit provider name as fallback for provider-auto labels before a model is resolved", () => {
    expect(getSelectionDisplaySummary({
      pickerValue: buildAutoProviderValue(8),
      explicitProviderName: "Kie AI",
      storedSelection: {
        mode: "auto-provider",
        providerId: 8,
      },
    })).toEqual({
      providerLabel: "Kie AI",
      primaryLabel: "Auto Model",
      secondaryLabel: null,
      tooltipLabel: "Kie AI auto model.",
    });
  });

  it("converts stored state back to picker values", () => {
    expect(selectionToPickerValue({
      mode: "auto-provider",
      providerId: 5,
    })).toBe(buildAutoProviderValue(5));
    expect(selectionToPickerValue({
      mode: "explicit",
      modelId: "gpt-4o",
    })).toBe("gpt-4o");
  });
});
