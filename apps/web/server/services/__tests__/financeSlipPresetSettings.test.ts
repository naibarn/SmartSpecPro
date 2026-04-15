import { describe, expect, it } from "vitest";

import {
  applyFinanceSlipMappingPresetsToDraft,
  DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
} from "../financeSlipPresetSettings";

describe("financeSlipPresetSettings", () => {
  it("maps matching slip text into a common income preset", () => {
    const draft = applyFinanceSlipMappingPresetsToDraft(
      {
        type: "expense",
        amountMinor: 450000,
        currency: "THB",
        occurredAt: "2026-04-12T08:00:00.000Z",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: null,
        note: null,
        evidence: [],
        confidence: 0.8,
        needsClarification: false,
        missingFields: [],
      } as any,
      "เงินเดือน payroll บริษัท ACME โอนเข้าบัญชี",
      DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
    );

    expect(draft.type).toBe("income");
    expect(draft.categoryCode).toBe("income.salary");
    expect(draft.counterpartyName).toBe("Employer");
    expect(draft.merchantName).toBe("Employer");
    expect(draft.humanReadableSummary).toContain("Employer");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "slipMappingPreset",
        value: "Salary / payroll",
      }),
    ]));
  });

  it("keeps the selected preset transparent in evidence when matching an expense", () => {
    const draft = applyFinanceSlipMappingPresetsToDraft(
      {
        type: "expense",
        amountMinor: 120000,
        currency: "THB",
        occurredAt: "2026-04-12T08:00:00.000Z",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: null,
        note: null,
        evidence: [],
        confidence: 0.8,
        needsClarification: false,
        missingFields: [],
      } as any,
      "grab ride taxi to airport",
      DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
    );

    expect(draft.type).toBe("expense");
    expect(draft.categoryCode).toBe("transport");
    expect(draft.humanReadableSummary).toContain("Transport expense");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "slipMappingPreset",
        value: "Ride / transport",
      }),
    ]));
  });

  it("matches internal transfer slips before generic expense presets", () => {
    const draft = applyFinanceSlipMappingPresetsToDraft(
      {
        type: "transfer",
        amountMinor: 25000,
        currency: "THB",
        occurredAt: "2026-04-12T08:00:00.000Z",
        categoryCode: "transfer",
        counterpartyName: null,
        merchantName: null,
        note: null,
        evidence: [],
        confidence: 0.8,
        needsClarification: false,
        missingFields: [],
      } as any,
      "โอนเงินจาก SCB Main ไป KBank Blue",
      DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
    );

    expect(draft.type).toBe("transfer");
    expect(draft.categoryCode).toBe("transfer.internal");
    expect(draft.humanReadableSummary).toContain("Internal transfer");
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "slipMappingPreset",
        value: "Internal transfer",
      }),
    ]));
  });
});
