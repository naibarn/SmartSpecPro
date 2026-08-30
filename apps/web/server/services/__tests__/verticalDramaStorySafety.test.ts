import { describe, expect, it } from "vitest";
import {
  analyzeVerticalDramaStorySafety,
  buildVerticalDramaVideoPromptSafetyInput,
  formatVerticalDramaStorySafetyWarnings,
  isBlockingVerticalDramaStorySafety,
} from "../verticalDramaStorySafety";

describe("vertical drama story safety", () => {
  it("blocks a minor combined with threat or surveillance", () => {
    const result = analyzeVerticalDramaStorySafety({
      scene: "A child is unaware while someone secretly photographs the room.",
    });

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "minor_threat_or_surveillance"
    );
    expect(isBlockingVerticalDramaStorySafety(result)).toBe(true);
  });

  it("keeps ordinary safe childcare with mild distress at medium", () => {
    const result = analyzeVerticalDramaStorySafety(
      "The child is tearful while an adult offers water and reassurance."
    );

    expect(result.level).toBe("medium");
    expect(isBlockingVerticalDramaStorySafety(result)).toBe(false);
  });

  it("allows a neutral adult-only dramatic beat", () => {
    const result = analyzeVerticalDramaStorySafety(
      "The adult notices an unanswered message and quietly closes the door."
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("bounds recursive input so large payloads cannot expand the safety scan without limit", () => {
    const result = analyzeVerticalDramaStorySafety({
      text: "x".repeat(100_000),
      nested: { text: "A child is unaware while someone threatens the room." },
    });

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "oversized_or_malformed_input"
    );
  });

  it("does not combine minor and threat markers from separate shots", () => {
    const result = analyzeVerticalDramaStorySafety({
      shots: [
        { shot_number: 1, description: "A child reads quietly with an adult." },
        {
          shot_number: 2,
          description: "An adult notices a threat in a letter.",
        },
      ],
    });

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("still blocks a risky combination inside one shot", () => {
    const result = analyzeVerticalDramaStorySafety({
      shots: [
        {
          shot_number: 1,
          description: "A child is unaware while someone threatens the room.",
        },
        { shot_number: 2, description: "An adult reads a letter." },
      ],
    });

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "minor_threat_or_surveillance"
    );
  });

  it("does not treat safe-place metadata as a threat", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaVideoPromptSafetyInput({
        imagePrompt: "Two adults review payment records at a desk.",
        shotContext: {
          description:
            "Two adults review payment records and agree on the next step.",
          characterIdentityMap:
            "ลุงชาญ: ผู้ดูแลเด็กและพื้นที่ปลอดภัยในเรื่องราวเบื้องหลัง",
          sceneContinuityLockBlock: "เด็กเคยอยู่ในพื้นที่ปลอดภัยก่อนหน้านี้",
        },
      })
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("does not match the threat marker inside the Thai word for safe", () => {
    const result = analyzeVerticalDramaStorySafety(
      "เด็กอยู่ในพื้นที่ปลอดภัยกับผู้ใหญ่"
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("still blocks a real minor threat in the shot story", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaVideoPromptSafetyInput({
        imagePrompt:
          "A child is unaware while someone secretly photographs the room.",
        shotContext: {
          description:
            "The adult notices the surveillance and tries to intervene.",
          characterIdentityMap: "A guardian keeps a safe place for the family.",
        },
      })
    );

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "minor_threat_or_surveillance"
    );
  });

  it("does not flag forbidden terms that only appear in a negative prompt", () => {
    const result = analyzeVerticalDramaStorySafety({
      description: "Two adults discuss an unanswered message at home.",
      negative_prompt:
        "no nudity, no graphic injury, no abuse, no child distress, no surveillance",
    });

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("does not treat cinematic restrained tension as physical restraint", () => {
    const result = analyzeVerticalDramaStorySafety(
      "The child hears a sudden cry with restrained tension and quiet camera movement."
    );

    expect(result.findings.map(finding => finding.code)).not.toContain(
      "abuse_or_coercion"
    );
    expect(formatVerticalDramaStorySafetyWarnings(result, 1)).toEqual([]);
  });

  it("formats high-risk findings as advisory text without changing the analyzer result", () => {
    const result = analyzeVerticalDramaStorySafety(
      "A child is physically restrained by an adult."
    );

    expect(result.level).toBe("high");
    expect(formatVerticalDramaStorySafetyWarnings(result, 1)).toEqual([
      expect.stringContaining("Shot 1: video prompt safety advisory [abuse_or_coercion]"),
    ]);
  });
});
