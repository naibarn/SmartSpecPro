import { describe, expect, it } from "vitest";
import {
  SVG_GRAPHICS,
  pickRandomSvgFromCategory,
} from "../svgGraphicsCatalog";
import { AI_SVG_CATEGORIES } from "../aiTypes";

describe("SVG Graphics Catalog", () => {
  it("SVG_GRAPHICS array is non-empty", () => {
    expect(SVG_GRAPHICS.length).toBeGreaterThan(0);
  });

  it("each SVG graphic has id, label, category, svg", () => {
    for (const graphic of SVG_GRAPHICS) {
      expect(graphic.id).toBeTruthy();
      expect(graphic.label).toBeTruthy();
      expect(graphic.category).toBeTruthy();
      expect(graphic.svg).toBeTruthy();
      expect(graphic.svg).toContain("<svg");
    }
  });

  it("pickRandomSvgFromCategory returns a graphic from the requested category", () => {
    const graphic = pickRandomSvgFromCategory("Business");
    expect(graphic).not.toBeNull();
    expect(graphic!.category).toBe("Business");
  });

  it("pickRandomSvgFromCategory returns null for non-existent category", () => {
    const graphic = pickRandomSvgFromCategory("NonExistentCategory");
    expect(graphic).toBeNull();
  });

  it("all AI_SVG_CATEGORIES have at least one graphic in the catalog", () => {
    for (const category of AI_SVG_CATEGORIES) {
      const matching = SVG_GRAPHICS.filter((g) => g.category === category);
      expect(
        matching.length,
        `Category '${category}' has no graphics in the catalog`,
      ).toBeGreaterThan(0);
    }
  });

  it("all SVG graphic IDs are unique", () => {
    const ids = SVG_GRAPHICS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
