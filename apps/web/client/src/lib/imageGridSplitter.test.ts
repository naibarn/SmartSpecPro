import { describe, expect, it } from "vitest";
import { detectGridFromDimensions } from "./imageGridSplitter";

describe("detectGridFromDimensions", () => {
  it("prefers the 3x3 storyboard default for portrait storyboard dimensions", () => {
    const detected = detectGridFromDimensions(768, 1376);

    expect(detected).toMatchObject({
      rows: 3,
      cols: 3,
    });
    expect(detected?.confidence).toBeGreaterThanOrEqual(0.66);
  });

  it("keeps non-default grids only when line evidence is strong", () => {
    const detected = detectGridFromDimensions(768, 1376, {
      "3x3": { available: true, combined: 0.05 },
      "4x2": { available: true, combined: 0.95 },
    });

    expect(detected).toMatchObject({
      rows: 4,
      cols: 2,
    });
    expect(detected?.confidence).toBeGreaterThanOrEqual(0.74);
  });

  it("returns null for weak ambiguous non-default evidence so callers can fall back to 3x3", () => {
    const detected = detectGridFromDimensions(1536, 768, {
      "2x4": { available: true, combined: 0.12 },
      "3x3": { available: true, combined: 0.08 },
    });

    expect(detected).toBeNull();
  });
});
