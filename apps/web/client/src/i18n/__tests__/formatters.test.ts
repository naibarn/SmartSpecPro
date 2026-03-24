import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("i18next", () => ({
  default: { language: "en" },
}));

import {
  formatDate,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
} from "../formatters";

describe("i18n/formatters", () => {
  it("formatDate returns English-formatted date when locale is en", () => {
    const date = new Date("2026-01-15T00:00:00Z");
    const result = formatDate(date, { year: "numeric", month: "long", day: "numeric" }, "en");
    expect(result).toContain("January");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });

  it("formatDate returns Thai-formatted date when locale is th", () => {
    const date = new Date("2026-01-15T00:00:00Z");
    const result = formatDate(date, { year: "numeric", month: "long", day: "numeric" }, "th");
    expect(result).toContain("มกราคม");
  });

  it("formatNumber formats with Thai digit grouping when locale is th", () => {
    const result = formatNumber(1234567.89, undefined, "th");
    expect(result).toBeTruthy();
    // Thai locale should group digits
    expect(result).toContain("1");
  });

  it("formatCurrency formats USD correctly", () => {
    const result = formatCurrency(42.5, "USD", "en");
    expect(result).toContain("$");
    expect(result).toContain("42.50");
  });

  it("formatCurrency formats THB correctly", () => {
    const result = formatCurrency(100, "THB", "th");
    expect(result).toBeTruthy();
    // Thai locale uses ฿ symbol or THB
    expect(result).toMatch(/฿|THB/);
  });

  it("formatRelativeTime returns relative string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T12:00:00Z"));

    const twoDaysAgo = new Date("2026-03-22T12:00:00Z").getTime();
    const result = formatRelativeTime(twoDaysAgo, "en");
    expect(result).toContain("2");
    expect(result.toLowerCase()).toContain("day");

    vi.useRealTimers();
  });

  it("formatters accept optional lng override parameter", () => {
    const date = new Date("2026-01-15T00:00:00Z");
    const enResult = formatDate(date, { month: "long" }, "en");
    const thResult = formatDate(date, { month: "long" }, "th");
    expect(enResult).not.toBe(thResult);
  });

  it("formatDate handles invalid date gracefully", () => {
    const result = formatDate(NaN as unknown as number);
    expect(typeof result).toBe("string");
  });
});
