/**
 * Vertical Drama Series — Thai advertising-regulation compliance (spec
 * follow-up, 2026-07-06 prompt-safety upgrade, §13 extension).
 *
 * Extends (does not duplicate) `verticalDramaProductTieIn.ts`'s existing
 * regulated-claim screening (`VERTICAL_DRAMA_REGULATED_CLAIM_PATTERNS`,
 * `screenClaims`) with Thai-law-specific prohibited-claim patterns and a
 * mandatory-disclosure-per-category map, for tie-in DIALOGUE and on-screen
 * claims (ยึดกฎหมายโฆษณาไทย — พ.ร.บ.คุ้มครองผู้บริโภค, พ.ร.บ.อาหาร,
 * พ.ร.บ.ยา, ประกาศ อย. ว่าด้วยการโฆษณาเครื่องสำอาง/อาหารเสริม).
 *
 * Pure module — no DB/server imports, safe for both client (category select
 * UI, tooltip) and server (dialogue-generation compliance injection) use.
 */

/* -------------------------------------------------------------------------- */
/* Product category (additive `productTieIn.productCategory` field)          */
/* -------------------------------------------------------------------------- */

/**
 * Broad product categories the tie-in tab's "หมวดหมู่สินค้า" select offers —
 * distinct from (and narrower-purpose than) `VerticalDramaRegulatedCategory`
 * in `verticalDramaProductTieIn.ts` (which governs claim-screening severity
 * and human-review gating). This set governs which MANDATORY disclosure line
 * the tie-in dialogue/motion-pack skill must include, per Thai advertising
 * regulation.
 */
export const VERTICAL_DRAMA_PRODUCT_CATEGORIES = [
  "cosmetics",
  "supplement",
  "food_beverage",
  "general_goods",
  "service",
  "other",
] as const;

export type VerticalDramaProductCategory = (typeof VERTICAL_DRAMA_PRODUCT_CATEGORIES)[number];

export const VERTICAL_DRAMA_PRODUCT_CATEGORY_LABELS_TH: Record<VerticalDramaProductCategory, string> = {
  cosmetics: "เครื่องสำอาง",
  supplement: "อาหารเสริม",
  food_beverage: "อาหาร-เครื่องดื่ม",
  general_goods: "ของใช้ทั่วไป",
  service: "บริการ",
  other: "อื่นๆ",
};

export const VERTICAL_DRAMA_PRODUCT_CATEGORY_LABELS_EN: Record<VerticalDramaProductCategory, string> = {
  cosmetics: "Cosmetics",
  supplement: "Supplements",
  food_beverage: "Food & beverage",
  general_goods: "General goods",
  service: "Service",
  other: "Other",
};

export function normalizeVerticalDramaProductCategory(
  value: unknown,
): VerticalDramaProductCategory | undefined {
  if (
    typeof value === "string" &&
    (VERTICAL_DRAMA_PRODUCT_CATEGORIES as readonly string[]).includes(value)
  ) {
    return value as VerticalDramaProductCategory;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Category -> mandatory disclosure line (spec: encode a category->required-  */
/* warning map with a sensible default)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mandatory disclosure/warning text per product category, per Thai
 * advertising regulation convention:
 *   - อาหารเสริม (supplement): must carry "อ่านคำเตือนในฉลากก่อนบริโภค"
 *     (ประกาศ อย./พ.ร.บ.อาหาร — health-supplement advertising rule).
 *   - เครื่องสำอาง (cosmetics): must not claim to cure/treat disease; carries
 *     a light "ผลลัพธ์อาจแตกต่างกันในแต่ละบุคคล" disclosure.
 *   - อาหาร-เครื่องดื่ม (food/beverage — incl. milk/formula/alcohol-adjacent
 *     categories the sensible-default net covers): standard food-advertising
 *     disclosure.
 *   - ของใช้ทั่วไป / บริการ / อื่นๆ: no category-specific legal disclosure
 *     mandated by default — `undefined` (sensible default = no forced line).
 */
export const VERTICAL_DRAMA_PRODUCT_CATEGORY_REQUIRED_DISCLOSURE_TH: Record<
  VerticalDramaProductCategory,
  string | undefined
> = {
  supplement: "อ่านคำเตือนในฉลากก่อนบริโภค",
  cosmetics: "ผลลัพธ์อาจแตกต่างกันไปในแต่ละบุคคล",
  food_beverage: "ควรบริโภคอาหารหลากหลายครบ 5 หมู่ในสัดส่วนที่เหมาะสม",
  general_goods: undefined,
  service: undefined,
  other: undefined,
};

/**
 * Resolve the mandatory disclosure line for a product category. Returns
 * `undefined` when the category has no mandated line (or is absent/unknown —
 * absent category is treated as "no category set", not an error, so tie-ins
 * created before this field existed keep working unchanged).
 */
export function resolveRequiredDisclosureForCategory(
  category: VerticalDramaProductCategory | string | null | undefined,
): string | undefined {
  const normalized = normalizeVerticalDramaProductCategory(category);
  if (!normalized) return undefined;
  return VERTICAL_DRAMA_PRODUCT_CATEGORY_REQUIRED_DISCLOSURE_TH[normalized];
}

/* -------------------------------------------------------------------------- */
/* Prohibited-claim patterns (Thai law) — extends, does not replace, the      */
/* generic `VERTICAL_DRAMA_REGULATED_CLAIM_PATTERNS` in                       */
/* `verticalDramaProductTieIn.ts`.                                            */
/* -------------------------------------------------------------------------- */

/**
 * Thai-law-specific prohibited claim patterns, case-insensitive substring
 * match against both Thai and English claim text:
 *   - เครื่องสำอาง/อาหารเสริมห้ามอ้างรักษา/บำบัดโรค (cosmetics/supplements
 *     must never claim to cure/treat/prevent disease).
 *   - ห้ามคำเด็ดขาดเกินจริง (absolute/exaggerated claim words).
 *   - ยา/สมุนไพรต้องไม่โฆษณาสรรพคุณเกินทะเบียน (unregistered drug/herbal
 *     efficacy claims).
 */
export const VERTICAL_DRAMA_THAI_PROHIBITED_CLAIM_PATTERNS: readonly string[] = [
  // Disease cure/treatment claims (cosmetics/supplements/general).
  "รักษาโรค",
  "บำบัดโรค",
  "รักษาให้หาย",
  "หายขาด",
  "cure disease",
  "cures disease",
  "treats disease",
  "treat illness",
  // Absolute/exaggerated claim words.
  "ที่สุด",
  "ที่หนึ่ง",
  "ดีที่สุดในโลก",
  "หายขาด100%",
  "100%",
  "ปลอดภัยแน่นอน",
  "การันตี",
  "รับประกันผล",
  "the best in the world",
  "guaranteed results",
  "absolutely safe",
  // Unregistered drug/herbal efficacy over-claiming.
  "สรรพคุณเกินทะเบียน",
  "เกินกว่าที่ขึ้นทะเบียน",
  "ไม่ต้องพึ่งหมอ",
  "เลิกยาได้",
];

/**
 * Screen a list of proposed claims (dialogue lines, on-screen captions, etc.)
 * against the Thai-law prohibited-claim patterns. Pure, case-insensitive
 * substring match — mirrors `screenClaims`'s matching style in
 * `verticalDramaProductTieIn.ts` but is a SEPARATE, additive check (callers
 * should run both: the generic `screenClaims` for the existing
 * forbidden-claims/regulated-pattern gate, and this for the Thai-law-specific
 * gate) so neither list has to duplicate the other's entries.
 */
export interface ThaiAdComplianceScreenResult {
  violations: Array<{ claim: string; matchedPattern: string }>;
  hasViolations: boolean;
}

export function screenThaiAdCompliance(claims: string[]): ThaiAdComplianceScreenResult {
  const violations: Array<{ claim: string; matchedPattern: string }> = [];
  for (const claim of claims) {
    const lower = claim.toLowerCase();
    const matched = VERTICAL_DRAMA_THAI_PROHIBITED_CLAIM_PATTERNS.find((p) =>
      lower.includes(p.toLowerCase()),
    );
    if (matched) violations.push({ claim, matchedPattern: matched });
  }
  return { violations, hasViolations: violations.length > 0 };
}

/* -------------------------------------------------------------------------- */
/* Dialogue-generation compliance instruction block                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the "Thai ad compliance — MANDATORY" instruction section injected
 * into the tie-in dialogue/motion-pack generation user-prompt whenever a shot
 * carries a product placement. Always includes the no-prohibited-claims
 * rule; appends the category's required disclosure line (as a spoken line or
 * caption note) only when the category has one.
 */
export function buildThaiAdComplianceInstruction(
  category: VerticalDramaProductCategory | string | null | undefined,
): string {
  const requiredDisclosure = resolveRequiredDisclosureForCategory(category);
  const lines = [
    "Thai ad compliance — MANDATORY (ยึดกฎหมายโฆษณาไทย): the product/benefit mention in this clip's " +
      "dialogue or on-screen caption must NEVER claim to cure, treat, or prevent any disease or medical " +
      "condition, must NEVER use absolute/exaggerated claim words (e.g. \"ที่สุด\", \"หายขาด\", \"100%\", " +
      "\"ปลอดภัยแน่นอน\", \"guaranteed\", \"the best in the world\"), and must NEVER state an efficacy claim " +
      "beyond what a registered product label would state. Keep the benefit natural and modest, in " +
      "character, never a hard advertisement line.",
  ];
  if (requiredDisclosure) {
    lines.push(
      `Mandatory disclosure for this product's category: include "${requiredDisclosure}" as an end-of-clip ` +
        'spoken line (if it fits naturally) or as a caption/on-screen note — set the output field ' +
        '"requiredDisclosure" to this exact text so the caller can render it even if it does not fit the ' +
        "spoken dialogue.",
    );
  }
  return lines.join(" ");
}
