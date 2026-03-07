import { describe, expect, it } from "vitest";
import { calculateCreditCost } from "./pricingCalculator";

describe("calculateCreditCost", () => {
  it("calculates per-unit character pricing from text with ceil rounding", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 10,
        configJson: {
          pricingFormula: "per_unit",
          pricingUnitMetric: "characters",
          pricingUnitField: "text",
          pricingUnitSize: 1000,
          pricingUnitRounding: "ceil",
          pricingTiers: { default: 70 },
        },
      },
      { text: "x".repeat(1001) },
    );

    expect(credits).toBe(140);
  });

  it("counts dialogue array characters from text fields only", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 5,
        configJson: {
          pricingFormula: "per_unit",
          pricingUnitMetric: "characters",
          pricingUnitField: "dialogue",
          pricingUnitSize: 10,
          pricingUnitRounding: "ceil",
          pricingTiers: { default: 5 },
        },
      },
      {
        dialogue: [
          { text: "hello", voice: "alice" },
          { text: "world!", voice: "bob" },
        ],
      },
    );

    // "hello"(5) + "world!"(6) = 11 chars -> ceil(11/10)=2 units -> 2*5
    expect(credits).toBe(10);
  });

  it("supports per-unit item counting", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 1,
        configJson: {
          pricingFormula: "per_unit",
          pricingUnitMetric: "items",
          pricingUnitField: "clips",
          pricingUnitSize: 2,
          pricingUnitRounding: "ceil",
          pricingTiers: { default: 3 },
        },
      },
      { clips: ["a", "b", "c"] },
    );

    // 3 items / 2 => ceil = 2 units * 3 credits
    expect(credits).toBe(6);
  });

  it("supports per-unit nested source fields", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 1,
        configJson: {
          pricingFormula: "per_unit",
          pricingUnitMetric: "characters",
          pricingUnitField: "dialogue.0.text",
          pricingUnitSize: 4,
          pricingUnitRounding: "ceil",
          pricingTiers: { default: 2 },
        },
      },
      {
        dialogue: [
          { text: "hello" },
          { text: "ignored" },
        ],
      },
    );

    // "hello" => 5 chars => ceil(5/4)=2 units => 2 * 2 credits
    expect(credits).toBe(4);
  });

  it("supports ignoring whitespace for per-unit character pricing", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 1,
        configJson: {
          pricingFormula: "per_unit",
          pricingUnitMetric: "characters",
          pricingUnitField: "text",
          pricingUnitSize: 5,
          pricingUnitRounding: "ceil",
          pricingIgnoreWhitespace: true,
          pricingTiers: { default: 10 },
        },
      },
      { text: "ab cd ef" },
    );

    // "ab cd ef" => 8 chars, 6 without whitespace => ceil(6/5)=2 units
    expect(credits).toBe(20);
  });
});
