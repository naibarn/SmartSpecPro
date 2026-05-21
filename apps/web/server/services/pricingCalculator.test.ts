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

  it("uses the selected pricing field value for flat pricing", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 200,
        configJson: {
          pricingFormula: "flat",
          pricingTiers: {
            default: 200,
            veo3_fast: 30,
            veo3_lite: 15,
          },
          inputFields: [
            { key: "model", affectsPricing: true },
          ],
        },
      },
      { model: "veo3_fast" },
    );

    expect(credits).toBe(30);
  });

  it("builds matrix keys from pricing fields in config order", () => {
    const credits = calculateCreditCost(
      {
        creditCost: 200,
        configJson: {
          pricingFormula: "matrix",
          pricingTiers: {
            default: 200,
            "veo3_fast-9:16": 42,
          },
          inputFields: [
            { key: "model", affectsPricing: true },
            { key: "aspect_ratio", affectsPricing: true },
          ],
        },
      },
      {
        model: "veo3_fast",
        aspect_ratio: "9:16",
      },
    );

    expect(credits).toBe(42);
  });

  it("supports presence-based matrix pricing for optional video input", () => {
    const model = {
      creditCost: 450,
      configJson: {
        pricingFormula: "matrix" as const,
        pricingTiers: {
          default: 600,
          "1080p-4s-without-video": 450,
          "1080p-10s-without-video": 900,
          "4K-4s-without-video": 1050,
          "4K-10s-without-video": 1500,
          "1080p-4s-with-video": 1200,
          "1080p-10s-with-video": 1200,
          "4K-4s-with-video": 1800,
          "4K-10s-with-video": 1800,
        },
        inputFields: [
          { key: "video_list", affectsPricing: true, pricingPresenceLabels: { present: "with-video", absent: "without-video" } },
          { key: "resolution", default: "1080p", affectsPricing: true },
          { key: "duration", default: 4, affectsPricing: true },
        ],
      },
    };

    expect(calculateCreditCost(model, { resolution: "1080p", duration: 4 })).toBe(450);
    expect(calculateCreditCost(model, { resolution: "4K", duration: 10 })).toBe(1500);
    expect(calculateCreditCost(model, { resolution: "1080p", duration: 10, video_list: ["https://cdn.example.com/in.mp4"] })).toBe(1200);
    expect(calculateCreditCost(model, { resolution: "4K", duration: 4, video_list: [{ url: "https://cdn.example.com/in.mp4" }] })).toBe(1800);
  });
});
