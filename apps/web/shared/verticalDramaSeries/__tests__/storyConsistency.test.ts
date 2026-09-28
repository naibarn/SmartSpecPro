import { describe, expect, it } from "vitest";
import {
  formatStoryConsistencyRepairInstructions,
  inspectStoryConsistency,
} from "../storyConsistency";

function episode(episodeNumber: number, shots: unknown[], episodeMemory?: unknown) {
  return { episodeNumber, shotDrafts: shots, ...(episodeMemory ? { episodeMemory } : {}) };
}

function shot(shot_number: number, summary: string, lines: string[] = [], characters = ["พิมพ์ชนก"]) {
  return {
    shot_number,
    summary,
    characters: characters.map(name => ({ name })),
    dialogue_lines: lines.map(line => ({ speaker: characters[0], line })),
  };
}

describe("story consistency contract", () => {
  it("flags a secret placed in the protagonist's hearing range", () => {
    const report = inspectStoryConsistency({
      output: {
        episodeBreakdown: [
          episode(1, [shot(1, "พิมพ์ชนกยืนอยู่หน้าประตู มยุรีพูดเรื่องเด็กอีกคน")]),
        ],
      },
    });
    expect(report.findings.some(item => item.code === "secret_visibility_ambiguous")).toBe(true);
  });

  it("flags an ambiguous one-child instruction when the protagonist is present", () => {
    const report = inspectStoryConsistency({
      output: {
        episodeBreakdown: [
          episode(1, [
            shot(1, "พิมพ์ชนกยืนอยู่ตรงนั้น แม่เลี้ยงพูดว่าให้ออกจากบ้านให้เอาไปได้คนเดียว"),
          ]),
        ],
      },
    });
    expect(report.findings.some(item => item.code === "secret_visibility_ambiguous")).toBe(true);
  });

  it("flags the premise knowledge contradiction and repeated helper event", () => {
    const output = {
      episodeBreakdown: [
        episode(1, [shot(1, "พิมพ์ชนกช่วยลุงชาญที่ล้มอยู่โรงพยาบาล", [], ["พิมพ์ชนก", "ลุงชาญ"])]),
        episode(2, [shot(1, "มยุรีพูดว่าอีกคนต้องหายไปคืนนี้", [], ["มยุรี"])]),
        episode(3, [shot(1, "พิมพ์ชนกช่วยลุงชาญที่ล้มอยู่ริมถนน", [], ["พิมพ์ชนก", "ลุงชาญ"])]),
      ],
    };
    const report = inspectStoryConsistency({
      output,
      canonicalStory: "ลูกสาวของแม่เลี้ยงขโมยเด็กไปหนึ่งคนโดยไม่รู้ว่ามีแฝดอีกคน",
    });
    expect(report.findings.some(item => item.code === "premise_knowledge_contradiction")).toBe(true);
    expect(report.findings.some(item => item.code === "repeated_event_without_cause")).toBe(true);
  });

  it("does not treat an explicit unaware statement as coordinated twin knowledge", () => {
    const report = inspectStoryConsistency({
      output: {
        episodeBreakdown: [
          episode(1, [shot(1, "พิมพ์ชนกไม่รู้ว่ามีแฝดอีกคน", [], ["พิมพ์ชนก"])]),
        ],
      },
      canonicalStory: "พิมพ์ชนกพาลูกหนีไปโดยไม่รู้ว่ามีแฝดอีกคน",
    });
    expect(report.findings.some(item => item.code === "premise_knowledge_contradiction")).toBe(false);
  });

  it("does not flag generic repeated actions when the actor is unnamed", () => {
    const report = inspectStoryConsistency({
      output: {
        episodeBreakdown: [
          episode(1, [shot(1, "มีคนล้มอยู่หน้าห้องฉุกเฉิน", [], [])]),
          episode(2, [shot(1, "มีคนล้มอยู่ริมถนน", [], [])]),
        ],
      },
    });
    expect(report.findings.some(item => item.code === "repeated_event_without_cause")).toBe(false);
  });

  it("compares a newly generated episode with the existing breakdown baseline", () => {
    const repeatedLine = "เราต้องไปโรงพยาบาลเพื่อหาความจริงเรื่องนี้";
    const report = inspectStoryConsistency({
      output: {
        episodeBreakdown: [
          episode(2, [
            shot(
              1,
              "พิมพ์ชนกช่วยลุงชาญที่ล้มอยู่ริมถนน",
              [repeatedLine],
              []
            ),
          ]),
        ],
      },
      canonicalStory: {
        activeBreakdown: [
          episode(1, [
            shot(
              1,
              "พิมพ์ชนกช่วยลุงชาญที่ล้มอยู่โรงพยาบาล",
              [repeatedLine],
              ["พิมพ์ชนก", "ลุงชาญ"]
            ),
          ]),
        ],
      },
    });

    expect(report.findings.some(item => item.code === "repeated_event_without_cause")).toBe(true);
    expect(report.findings.some(item => item.code === "repeated_dialogue")).toBe(true);
    expect(report.findings.every(item => item.episodeNumber === 2)).toBe(true);
    expect(report.eventFingerprints).toHaveLength(1);
    expect(report.eventFingerprints[0]?.episodeNumber).toBe(2);
  });

  it("formats actionable repair instructions", () => {
    const report = inspectStoryConsistency({
      output: { episodeBreakdown: [episode(1, [shot(1, "พิมพ์ชนกได้ยินเรื่องเด็กอีกคน")])] },
    });
    expect(formatStoryConsistencyRepairInstructions(report.findings)).toContain("STORY CONSISTENCY REPAIR");
  });
});
