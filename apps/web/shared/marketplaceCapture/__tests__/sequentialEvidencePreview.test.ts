/**
 * Feature 136 — section 02 §6 invariant 8 (cross-section decision): this
 * module is the SINGLE SOURCE of the sequential-storyboard reference
 * reservation/trim arithmetic. Section 05 extends this same file with the
 * evidence-preview functions; section 11's capacity meter calls
 * `computeSequentialReferenceCapacity` directly. These tests pin the pure
 * math contract that `resolveSequentialReferenceAttachmentPlan` (server) and
 * the future UI meter both rely on.
 */
import { describe, expect, it } from "vitest";

import {
  buildSequentialEvidencePreview,
  computeSequentialReferenceCapacity,
  deriveAssemblyDocumentationFromProductTruth,
  type SequentialEvidencePreviewInput,
} from "../sequentialEvidencePreview";

describe("computeSequentialReferenceCapacity", () => {
  it("never throws and reserves primary, guardian, environment ahead of angles, trimming surplus angles from the end", () => {
    const angleCandidates = [
      { ref: "angle-1", angleLabel: "back" },
      { ref: "angle-2", angleLabel: "side" },
      { ref: "angle-3", angleLabel: "top" },
      { ref: "angle-4", angleLabel: "detail" },
    ];

    const result = computeSequentialReferenceCapacity({
      modelCap: 5,
      angleCandidates,
      guardianRequired: true,
      guardianPresent: true,
      environmentPresent: true,
    });

    expect(result.requiredSlotsExceedCap).toBe(false);
    expect(result.guardianAttached).toBe(true);
    expect(result.environmentAttached).toBe(true);
    expect(result.angleSlotCount).toBe(2);
    expect(result.attachedAngles).toEqual([angleCandidates[0], angleCandidates[1]]);
    expect(result.trimmedAngles).toEqual([angleCandidates[2], angleCandidates[3]]);
    expect(result.attachedAngleCount).toBe(2);
  });

  it("flags requiredSlotsExceedCap without throwing when the required guardian cannot fit", () => {
    const result = computeSequentialReferenceCapacity({
      modelCap: 1,
      angleCandidates: [],
      guardianRequired: true,
      guardianPresent: true,
      environmentPresent: false,
    });

    expect(result.requiredSlotsExceedCap).toBe(true);
    expect(result.requiredReservedSlots).toBe(2);
  });

  it("flags requiredSlotsExceedCap for a zero model cap even without a guardian", () => {
    const result = computeSequentialReferenceCapacity({
      modelCap: 0,
      angleCandidates: [],
      guardianRequired: false,
      guardianPresent: false,
      environmentPresent: false,
    });

    expect(result.requiredSlotsExceedCap).toBe(true);
    expect(result.requiredReservedSlots).toBe(1);
  });

  it("drops a present-but-not-required guardian instead of throwing when there is no room left after primary", () => {
    const result = computeSequentialReferenceCapacity({
      modelCap: 1,
      angleCandidates: [],
      guardianRequired: false,
      guardianPresent: true,
      environmentPresent: false,
    });

    expect(result.requiredSlotsExceedCap).toBe(false);
    expect(result.guardianAttached).toBe(false);
  });
});

/**
 * Feature 136 — section 05 §4.2. Determinism / conflict / highlight /
 * childSubjectPolicy-preview tests for `buildSequentialEvidencePreview`, and
 * text-derivation tests for `deriveAssemblyDocumentationFromProductTruth`.
 */
function baseEvidenceInput(
  overrides: Partial<SequentialEvidencePreviewInput> = {}
): SequentialEvidencePreviewInput {
  return {
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    description: "โต๊ะไม้แท้คุณภาพดี ทนทาน ใช้งานง่าย",
    specs: { material: "ไม้แท้", color: "สีน้ำตาล" },
    productChildRelated: false,
    ...overrides,
  };
}

describe("buildSequentialEvidencePreview — determinism", () => {
  it("returns deep-equal output for two calls with the same input", () => {
    const input = baseEvidenceInput({
      productName: "โต๊ะ 120 cm",
      description: "โต๊ะขนาด 120 cm พร้อมชั้นวาง 150 cm",
    });
    const first = buildSequentialEvidencePreview(input);
    const second = buildSequentialEvidencePreview(input);
    expect(first).toEqual(second);
  });
});

describe("buildSequentialEvidencePreview — conflict detection", () => {
  it("flags a title-vs-description numeric conflict for the same unit with a stable id and both source texts", () => {
    const input = baseEvidenceInput({
      productName: "โต๊ะวางของข้างเตียง 120 cm",
      description: "โต๊ะไม้แท้ขนาด 150 cm เหมาะกับห้องนอน",
    });
    const preview = buildSequentialEvidencePreview(input);
    expect(preview.needsConfirmation).toHaveLength(1);
    const [conflict] = preview.needsConfirmation;
    expect(conflict.id).toBe("title_description_conflict:cm");
    expect(conflict.attribute).toBe("cm");
    expect(conflict.claimText).toContain("120");
    expect(conflict.claimText).toContain("150");
    expect(conflict.reason).toBe("title_description_conflict");
    expect(conflict.sources).toEqual(["title", "description"]);

    // Stable across calls (same input -> same id).
    const secondCall = buildSequentialEvidencePreview(input);
    expect(secondCall.needsConfirmation[0].id).toBe(conflict.id);
  });

  it("does not flag a conflict when title and description agree on the same unit", () => {
    const input = baseEvidenceInput({
      productName: "โต๊ะวางของข้างเตียง 120 cm",
      description: "โต๊ะไม้แท้ขนาด 120 cm เหมาะกับห้องนอน",
    });
    expect(buildSequentialEvidencePreview(input).needsConfirmation).toEqual([]);
  });
});

describe("buildSequentialEvidencePreview — highlights", () => {
  it("surfaces declared spec attributes as text-sourced highlights", () => {
    const preview = buildSequentialEvidencePreview(baseEvidenceInput());
    expect(preview.verifiedHighlights).toEqual(
      expect.arrayContaining([
        { attribute: "material", value: "ไม้แท้", source: "text" },
        { attribute: "color", value: "สีน้ำตาล", source: "text" },
      ])
    );
  });

  it("resolves a conflicting attribute via confirmedAttributes: leaves needsConfirmation and appears as a user_confirmed highlight", () => {
    const input = baseEvidenceInput({
      productName: "โต๊ะวางของข้างเตียง 120 cm",
      description: "โต๊ะไม้แท้ขนาด 150 cm เหมาะกับห้องนอน",
      confirmedAttributes: { cm: "120 cm ตามที่ผู้ใช้ยืนยัน" },
    });
    const preview = buildSequentialEvidencePreview(input);
    expect(preview.needsConfirmation).toEqual([]);
    expect(preview.verifiedHighlights).toEqual(
      expect.arrayContaining([
        {
          attribute: "cm",
          value: "120 cm ตามที่ผู้ใช้ยืนยัน",
          source: "user_confirmed",
        },
      ])
    );
  });

  it("never surfaces a forbidden claim string in any highlight", () => {
    const input = baseEvidenceInput({
      specs: { material: "ไม้แท้ 100% รับประกันตลอดชีพ" },
      forbiddenClaims: ["รับประกันตลอดชีพ"],
    });
    const preview = buildSequentialEvidencePreview(input);
    expect(
      preview.verifiedHighlights.some(h =>
        h.value.includes("รับประกันตลอดชีพ")
      )
    ).toBe(false);
  });
});

describe("buildSequentialEvidencePreview — childSubjectPolicy preview", () => {
  it("sets productChildRelated true with childDepictionPlanned false for child-related input (unknown until the skill runs)", () => {
    const preview = buildSequentialEvidencePreview(
      baseEvidenceInput({ productChildRelated: true })
    );
    expect(preview.childSubjectPolicy).toEqual({
      productChildRelated: true,
      childDepictionPlanned: false,
      guardianReferenceRef: undefined,
    });
  });
});

describe("deriveAssemblyDocumentationFromProductTruth", () => {
  it("is conservative by default: no assembly markers -> documented false, source none", () => {
    const result = deriveAssemblyDocumentationFromProductTruth({
      productName: "โต๊ะวางของข้างเตียง",
      description: "โต๊ะไม้แท้คุณภาพดี",
      specs: {},
    });
    expect(result).toEqual({ documented: false, evidence: [], source: "none" });
  });

  it("detects an explicit assembly/installation section in the description", () => {
    const result = deriveAssemblyDocumentationFromProductTruth({
      productName: "ตู้เก็บของ DIY",
      description: "มาพร้อม Assembly Instructions และน็อตครบชุด",
      specs: {},
    });
    expect(result.documented).toBe(true);
    expect(result.source).toBe("text");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("upgrades to user_confirmed when confirmedAttributes documents assembly", () => {
    const result = deriveAssemblyDocumentationFromProductTruth({
      productName: "โต๊ะวางของข้างเตียง",
      description: "โต๊ะไม้แท้คุณภาพดี",
      specs: {},
      confirmedAttributes: { assembly: "ประกอบเองตามคู่มือ" },
    });
    expect(result.documented).toBe(true);
    expect(result.source).toBe("user_confirmed");
  });
});
