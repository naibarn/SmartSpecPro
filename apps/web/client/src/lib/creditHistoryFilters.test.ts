import { describe, expect, it } from "vitest";
import {
  getDefaultCreditHistoryDateRange,
  isCreditHistoryDateRangeValid,
  parseCreditHistoryEndDateExclusive,
  parseCreditHistoryStartDate,
} from "./creditHistoryFilters";

describe("credit history date filters", () => {
  it("defaults to one calendar month before today", () => {
    expect(
      getDefaultCreditHistoryDateRange(new Date(2026, 7, 29, 12, 0, 0))
    ).toEqual({
      startDate: "2026-07-29",
      endDate: "2026-08-29",
    });
  });

  it("clamps month-end defaults to the last day of the previous month", () => {
    expect(
      getDefaultCreditHistoryDateRange(new Date(2026, 2, 31, 12, 0, 0))
        .startDate
    ).toBe("2026-02-28");
  });

  it("creates an exclusive next-day end boundary", () => {
    const start = parseCreditHistoryStartDate("2026-08-29");
    const end = parseCreditHistoryEndDateExclusive("2026-08-29");

    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(30);
    expect(end > start).toBe(true);
    expect(isCreditHistoryDateRangeValid(start, end)).toBe(true);
    expect(isCreditHistoryDateRangeValid(end, start)).toBe(false);
  });
});
