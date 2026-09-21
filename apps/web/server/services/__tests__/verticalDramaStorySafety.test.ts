import { describe, expect, it } from "vitest";
import {
  analyzeVerticalDramaStorySafety,
  buildVerticalDramaImagePromptSafetyInput,
  buildVerticalDramaScriptSafetyInput,
  buildVerticalDramaVideoPromptSafetyInput,
  buildVerticalDramaStorySafetyDiagnostic,
  buildVerticalDramaStorySafetyRewriteInstruction,
  formatVerticalDramaStorySafetyWarnings,
  isBlockingVerticalDramaStorySafety,
  rewriteVerticalDramaStoryForSafeMedia,
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

  it("does not match the corpse marker across Thai word boundaries", () => {
    const result = analyzeVerticalDramaStorySafety(
      "พระราชาประกาศพักการตัดสินไว้ชั่วคราวในห้องทรงงานหลวง"
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("still blocks an explicit Thai corpse reference", () => {
    const result = analyzeVerticalDramaStorySafety("ผู้ตรวจพบศพในห้องเก็บของ");

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "graphic_violence"
    );
    expect(result.findings.find(finding => finding.code === "graphic_violence"))
      .toMatchObject({
        detectorVersion: expect.any(String),
        evidence: {
          source: "story",
          fieldPath: "$",
          matchedRule: "graphic_violence",
          confidence: "high",
        },
      });
  });

  it("records the affected shot and field for a structured policy finding", () => {
    const result = analyzeVerticalDramaStorySafety({
      shots: [
        { shot_number: 6, description: "ผู้ใหญ่ตรวจเอกสารอย่างสงบ" },
        { shot_number: 7, description: "ผู้ตรวจพบศพในห้องเก็บของ" },
      ],
    });

    expect(result.findings.find(finding => finding.code === "graphic_violence"))
      .toMatchObject({
        evidence: {
          source: "story",
          fieldPath: "$.shots[1].description",
          shotNumber: 7,
          matchedRule: "graphic_violence",
        },
      });
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

  it("does not combine identity metadata with a safe current image story", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaImagePromptSafetyInput({
        imagePrompt:
          "REFERENCE MAPPING: Image 1 = รินลดา\n" +
          "CHARACTER IDENTITY MAP: ทรงเด็กวัยเรียน อายุปรากฏประมาณ 12 ปี\n" +
          "CURRENT SHOT COMPOSITION LOCK: มองตรงไปที่รินลดาเพื่อบังคับให้ตอบ",
        shotContext: {
          canonicalShotSummary:
            "ผู้ใหญ่สามคนตรวจเอกสารในสำนักงานและค้นข้อมูลในระบบต่อหน้ากัน",
          action: "ตัวละครทั้งสามยืนตรวจหลักฐานร่วมกันอย่างสงบ",
          emotion: "จริงจัง",
          dialogueExcerpt: "ระบบมีบันทึก เดี๋ยวผมเปิดให้ดู",
        },
      })
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("still blocks a real minor coercion in the current shot story", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaImagePromptSafetyInput({
        imagePrompt: "A cinematic office confrontation.",
        shotContext: {
          canonicalShotSummary:
            "ผู้ใหญ่บังคับเด็กให้เซ็นเอกสารและเด็กพยายามถอยหนี",
        },
      })
    );

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "abuse_or_coercion"
    );
  });

  it("keeps a manually authored prompt without generated markers in the scan", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaImagePromptSafetyInput({
        imagePrompt: "An adult forced the child to move before the child was ready.",
      })
    );

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "abuse_or_coercion"
    );
  });

  it("does not treat negated motion constraints as coercion", () => {
    const result = analyzeVerticalDramaStorySafety({
      shots: [
        {
          imagePrompt:
            "A child plays with a colorful toy while an adult supervises; no forced movement or forced assembly.",
          videoPrompt:
            "The child reaches at their own pace; do not force the motion.",
        },
      ],
    });

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("does not flag a Thai negative statement that says the adult does not force the child", () => {
    const result = analyzeVerticalDramaStorySafety(
      "ผู้ใหญ่หยิบของเล่นมาให้เด็กดู แต่ยังไม่ยื่นบังคับ เด็กเลือกเข้าหาเองได้"
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("builds a provider-facing rewrite instruction for a high-risk story", () => {
    const story = "A child is unaware while someone threatens the room.";
    const result = analyzeVerticalDramaStorySafety(story);

    expect(buildVerticalDramaStorySafetyRewriteInstruction(story, result)).toContain(
      "Preserve the plot purpose"
    );
  });

  it("rewrites risky story text without rewriting policy metadata", () => {
    const source = {
      scene: "A child is unaware while someone secretly photographs the room.",
      policy_safety_contract:
        "Do not depict a child being threatened or secretly photographed.",
    };

    const result = rewriteVerticalDramaStoryForSafeMedia(source);

    expect(result.changed).toBe(true);
    expect(result.value).toMatchObject({
      policy_safety_contract: source.policy_safety_contract,
    });
    expect(result.value).toMatchObject({
      scene: expect.not.stringContaining("secretly photographs"),
    });
    expect(analyzeVerticalDramaStorySafety(result.value).level).not.toBe("high");
  });

  it("creates a redacted diagnostic projection with stable correlation fields", () => {
    const story = { scene: "ผู้ตรวจพบศพในห้องเก็บของ" };
    const result = analyzeVerticalDramaStorySafety(story);
    const diagnostic = buildVerticalDramaStorySafetyDiagnostic(story, result);

    expect(diagnostic).toMatchObject({
      level: "high",
      textLength: expect.any(Number),
      textHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      findings: [
        expect.objectContaining({
          code: "graphic_violence",
          fieldPath: "$.scene",
          matchedRule: "graphic_violence",
        }),
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain("ศพในห้องเก็บของ");
  });

  it("does not treat generated script diagnostics as an authored unsafe scene", () => {
    const script = {
      contract_version: 1,
      episode_title: "หลักฐานที่หายไป",
      hook: "ผู้ใหญ่สามคนตรวจเอกสารในสำนักงานอย่างสงบ",
      scene_dialogue_summary: [
        {
          scene: 1,
          summary: "ผู้ใหญ่ตรวจเอกสารและค้นข้อมูลร่วมกัน",
        },
      ],
      warnings: [
        {
          code: "POLICY_GUIDANCE",
          message:
            "Keep children safe; do not depict danger, surveillance, abuse, or coercion.",
        },
      ],
      repair_queue: [
        {
          code: "SAFETY_REVIEW",
          message: "Review any child threat or forced action before rendering.",
        },
      ],
      evidence_refs: [
        {
          field_path: "character.role",
          excerpt: "child under adult supervision",
        },
      ],
    };

    expect(analyzeVerticalDramaStorySafety(script).level).toBe("high");
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaScriptSafetyInput(script),
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("does not combine unrelated top-level script fields into one unsafe scene", () => {
    const result = analyzeVerticalDramaStorySafety(
      buildVerticalDramaScriptSafetyInput({
        episode_title: "เด็กกับความลับในบ้าน",
        hook: "ผู้ใหญ่ตรวจเอกสารอย่างสงบ",
        cliffhanger: "ภัยคุกคามถูกพบในจดหมายของผู้ใหญ่",
      }),
    );

    expect(result.level).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("still blocks a positive forced action involving a child", () => {
    const result = analyzeVerticalDramaStorySafety(
      "An adult forced the child to move before the child was ready."
    );

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "abuse_or_coercion"
    );
  });

  it("still blocks a positive Thai forced action involving a child", () => {
    const result = analyzeVerticalDramaStorySafety(
      "ผู้ใหญ่บังคับเด็กให้หยิบของเล่นก่อนที่เด็กจะพร้อม"
    );

    expect(result.level).toBe("high");
    expect(result.findings.map(finding => finding.code)).toContain(
      "abuse_or_coercion"
    );
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
