import { describe, expect, it } from "vitest";

import {
  applyPinnedMerchantPresetsToDraft,
  findBestFinancePinnedMerchantPreset,
  rankFinancePinnedMerchantPresets,
} from "../financeMerchantPresetSettings";

describe("financeMerchantPresetSettings", () => {
  it("ranks an admin-pinned merchant ahead of generic merchant text", () => {
    const presets = [
      {
        id: "charge-point-pin",
        enabled: true,
        label: "Charge Point",
        matchText: "Charge Point | chargepoint | EV Charge Point",
        transactionType: "expense",
        categoryCode: "transport.fuel",
        counterpartyName: "Charge Point",
        merchantName: "Charge Point",
        note: "EV charging",
        priority: 500,
      },
      {
        id: "generic-food",
        enabled: true,
        label: "Food",
        matchText: "food|coffee|cafe",
        transactionType: "expense",
        categoryCode: "food",
        counterpartyName: null,
        merchantName: null,
        note: null,
        priority: 80,
      },
    ] as const;

    const ranked = rankFinancePinnedMerchantPresets(
      {
        text: "Charge Point EV Charge Point 250 THB",
        merchantName: "Charge Point",
        counterpartyName: "Charge Point",
      },
      presets as any,
    );

    expect(ranked[0]?.preset.label).toBe("Charge Point");
    expect(findBestFinancePinnedMerchantPreset(
      {
        text: "Charge Point EV Charge Point 250 THB",
        merchantName: "Charge Point",
        counterpartyName: "Charge Point",
      },
      presets as any,
    )?.label).toBe("Charge Point");
  });

  it("applies pinned merchant presets to a draft", () => {
    const draft = applyPinnedMerchantPresetsToDraft(
      {
        type: "expense",
        amountMinor: 25000,
        currency: "THB",
        occurredAt: "2026-04-12T08:00:00.000Z",
        categoryCode: "other.misc",
        counterpartyName: "Charge Point",
        merchantName: "Charge Point",
        note: null,
        evidence: [],
        confidence: 0.8,
        needsClarification: false,
        missingFields: [],
      } as any,
      "Charge Point EV Charge Point 250 THB",
      [
        {
          id: "charge-point-pin",
          enabled: true,
          label: "Charge Point",
          matchText: "Charge Point | chargepoint | EV Charge Point",
          transactionType: "expense",
          categoryCode: "transport.fuel",
          counterpartyName: "Charge Point",
          merchantName: "Charge Point",
          note: "EV charging",
          priority: 500,
        } as any,
      ],
    );

    expect(draft.categoryCode).toBe("transport.fuel");
    expect(draft.humanReadableSummary).toContain("EV charging");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "slipMappingPreset",
        value: "Charge Point",
      }),
      expect.objectContaining({
        field: "pinnedMerchantPreset",
        value: "Charge Point",
      }),
    ]));
  });
});
