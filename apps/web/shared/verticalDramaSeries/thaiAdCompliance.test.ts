import { describe, it, expect } from "vitest";
import {
  VERTICAL_DRAMA_PRODUCT_CATEGORIES,
  VERTICAL_DRAMA_PRODUCT_CATEGORY_REQUIRED_DISCLOSURE_TH,
  normalizeVerticalDramaProductCategory,
  resolveRequiredDisclosureForCategory,
  screenThaiAdCompliance,
  buildThaiAdComplianceInstruction,
  VERTICAL_DRAMA_THAI_PROHIBITED_CLAIM_PATTERNS,
} from "./thaiAdCompliance";

describe("normalizeVerticalDramaProductCategory", () => {
  it("returns every documented category unchanged", () => {
    for (const category of VERTICAL_DRAMA_PRODUCT_CATEGORIES) {
      expect(normalizeVerticalDramaProductCategory(category)).toBe(category);
    }
  });

  it("returns undefined for unknown/missing values", () => {
    expect(normalizeVerticalDramaProductCategory("not_a_category")).toBeUndefined();
    expect(normalizeVerticalDramaProductCategory(undefined)).toBeUndefined();
    expect(normalizeVerticalDramaProductCategory(null)).toBeUndefined();
    expect(normalizeVerticalDramaProductCategory(42)).toBeUndefined();
  });
});

describe("resolveRequiredDisclosureForCategory — category -> required-warning map", () => {
  it("returns the mandated line for supplement (อาหารเสริม)", () => {
    expect(resolveRequiredDisclosureForCategory("supplement")).toBe(
      "อ่านคำเตือนในฉลากก่อนบริโภค",
    );
  });

  it("returns the mandated line for cosmetics", () => {
    expect(resolveRequiredDisclosureForCategory("cosmetics")).toBe(
      VERTICAL_DRAMA_PRODUCT_CATEGORY_REQUIRED_DISCLOSURE_TH.cosmetics,
    );
  });

  it("returns the mandated line for food_beverage", () => {
    expect(resolveRequiredDisclosureForCategory("food_beverage")).toBe(
      VERTICAL_DRAMA_PRODUCT_CATEGORY_REQUIRED_DISCLOSURE_TH.food_beverage,
    );
  });

  it("returns undefined for categories with a sensible 'no disclosure' default", () => {
    expect(resolveRequiredDisclosureForCategory("general_goods")).toBeUndefined();
    expect(resolveRequiredDisclosureForCategory("service")).toBeUndefined();
    expect(resolveRequiredDisclosureForCategory("other")).toBeUndefined();
  });

  it("returns undefined for an absent/unknown category (backward-compat)", () => {
    expect(resolveRequiredDisclosureForCategory(undefined)).toBeUndefined();
    expect(resolveRequiredDisclosureForCategory(null)).toBeUndefined();
    expect(resolveRequiredDisclosureForCategory("unknown_category")).toBeUndefined();
  });
});

describe("screenThaiAdCompliance — prohibited-claim screening", () => {
  it("flags a disease-cure claim", () => {
    const result = screenThaiAdCompliance(["ผลิตภัณฑ์นี้รักษาโรคได้"]);
    expect(result.hasViolations).toBe(true);
    expect(result.violations[0].matchedPattern).toBe("รักษาโรค");
  });

  it("flags an absolute/exaggerated claim word", () => {
    const result = screenThaiAdCompliance(["สินค้านี้ปลอดภัยแน่นอน 100%"]);
    expect(result.hasViolations).toBe(true);
  });

  it("flags an English-language absolute claim", () => {
    const result = screenThaiAdCompliance(["This is guaranteed results, the best in the world."]);
    expect(result.hasViolations).toBe(true);
  });

  it("flags unregistered herbal/drug efficacy over-claiming", () => {
    const result = screenThaiAdCompliance(["กินแล้วเลิกยาได้เลย"]);
    expect(result.hasViolations).toBe(true);
  });

  it("does not flag a clean, modest claim", () => {
    const result = screenThaiAdCompliance(["ช่วยให้ผิวชุ่มชื้นขึ้นเล็กน้อยเมื่อใช้เป็นประจำ"]);
    expect(result.hasViolations).toBe(false);
    expect(result.violations).toEqual([]);
  });

  it("returns no violations for an empty claim list", () => {
    expect(screenThaiAdCompliance([])).toEqual({ violations: [], hasViolations: false });
  });

  it("every pattern in the prohibited list is non-empty", () => {
    for (const pattern of VERTICAL_DRAMA_THAI_PROHIBITED_CLAIM_PATTERNS) {
      expect(pattern.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("buildThaiAdComplianceInstruction", () => {
  it("always includes the no-prohibited-claims MANDATORY section", () => {
    const instruction = buildThaiAdComplianceInstruction(undefined);
    expect(instruction).toMatch(/Thai ad compliance — MANDATORY/);
    expect(instruction).toMatch(/never claim to cure, treat, or prevent/i);
  });

  it("appends the category's required disclosure instruction when present", () => {
    const instruction = buildThaiAdComplianceInstruction("supplement");
    expect(instruction).toContain("อ่านคำเตือนในฉลากก่อนบริโภค");
    expect(instruction).toMatch(/requiredDisclosure/);
  });

  it("omits the disclosure instruction for a category with no mandated line", () => {
    const instruction = buildThaiAdComplianceInstruction("general_goods");
    expect(instruction).not.toMatch(/requiredDisclosure/);
  });
});
