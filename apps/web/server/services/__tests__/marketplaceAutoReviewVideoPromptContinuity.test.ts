import { describe, expect, it } from "vitest";

import {
  buildMarketplaceVerticalDramaVideoPromptInput,
  composeMarketplaceAutoReviewVideoPrompt,
  isMarketplaceAutoReviewVideoPromptComplete,
  renderMarketplaceVideoSpeakerSections,
} from "../marketplaceAutoReviewVideoPromptSkillRunner";
import type { StagedStoryArcShot } from "../marketplaceAutoReviewStoryArcPlanner";

describe("Marketplace Auto Review video prompt object continuity", () => {
  it("does not pass global product metadata as a visual instruction for an unrelated shot", () => {
    const prompt = buildMarketplaceVerticalDramaVideoPromptInput({
      shotId: 1,
      shot: {
        shotId: 1,
        title: "Frizzy hair at the mirror",
        storySummary: "She smooths her frizzy hair while he watches.",
        visualSummary: "She stands at the mirror and runs a hand over her hair.",
        movementDirection: "She smooths her hair, then turns toward him.",
        dialogue: "Nicha: My hair is so frizzy today.\nKrit: It looks like it had an emergency meeting.",
        durationSeconds: 10,
      } as StagedStoryArcShot,
      cast: [
        { castId: "cast-1", name: "Nicha", role: "host", source: "uploaded", imageIndex: 2 },
        { castId: "cast-2", name: "Krit", role: "guest", source: "uploaded", imageIndex: 3 },
      ],
      productName: "Cella Protein Hair Mask",
      productFacts: ["500 ml bottle", "helps reduce frizz"],
      detectedPeople: [],
      characterPortraits: [
        { imageNumber: 2, characterName: "Nicha", role: "host" },
        { imageNumber: 3, characterName: "Krit", role: "guest" },
      ],
    });

    expect(prompt).not.toContain("Product: Cella Protein Hair Mask");
    expect(prompt).not.toContain("500 ml bottle");
  });

  it("passes product details only when the approved visual action names that product", () => {
    const prompt = buildMarketplaceVerticalDramaVideoPromptInput({
      shotId: 3,
      shot: {
        shotId: 3,
        title: "Introduce the hair mask",
        storySummary: "He shows her the product.",
        visualSummary: "Krit places the Cella Protein Hair Mask on the vanity.",
        movementDirection: "He turns the Cella Protein Hair Mask label toward Nicha.",
        dialogue: "",
        durationSeconds: 8,
      } as StagedStoryArcShot,
      cast: [],
      productName: "Cella Protein Hair Mask",
      productFacts: ["500 ml bottle"],
      detectedPeople: [],
      characterPortraits: [],
    });

    expect(prompt).toContain("Product: Cella Protein Hair Mask");
    expect(prompt).toContain("500 ml bottle");
  });

  it("uses the approved action once, with a bounded camera move and printed-label continuity", () => {
    const approvedShotAction = "She smooths her hair and turns toward him.";
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      cameraMotion: "slow_push_in_drift_right",
      durationSeconds: 10,
      speakerSections: renderMarketplaceVideoSpeakerSections([]),
      approvedShotAction,
    });

    expect(prompt).toContain("10-second vertical 9:16");
    expect(prompt).toContain("Image 1");
    expect(prompt).toContain("one continuous shot with no cuts");
    expect(prompt.split(approvedShotAction)).toHaveLength(2);
    expect(prompt).toContain("very slow push-in with a slight rightward camera drift");
    expect(prompt).toContain("Preserve visible objects and existing printed labels");
    expect(prompt).toContain("Use natural ambient sound with no speech.");
    expect(prompt).toContain("Do not add subtitles, captions, or other on-screen text.");
  });

  it("uses one camera direction when the approved action already describes it", () => {
    const action = "ทั้งคู่ชี้ฉลาก กล้องค่อย ๆ แพนไปทางขวา";
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      cameraMotion: "slow_push_in",
      durationSeconds: 10,
      speakerSections: "",
      approvedShotAction: action,
    });
    expect(prompt).toContain(action);
    expect(prompt).not.toContain("push-in");
    expect(prompt).not.toContain("Camera:");
  });

  it("passes completeness validation with the verified speaker map and exact ordered dialogue", () => {
    const cast = [
      { castId: "cast-1", name: "ธีร์", role: "host", source: "uploaded", imageIndex: 2 },
      { castId: "cast-2", name: "พิมพ์ชนก", role: "guest", source: "uploaded", imageIndex: 3 },
    ] as const;
    const turns = [
      { castId: "cast-1", speakerName: "ธีร์", line: "ตัวนี้ระบุ Copper Tripeptide-1 เป็นส่วนประกอบ และใช้ทาบนใบหน้าได้" },
      { castId: "cast-2", speakerName: "พิมพ์ชนก", line: "อย่างน้อยก็ได้เริ่มจากข้อมูลจริง ไม่ต้องเดาเอาเอง" },
    ];
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      durationSeconds: 10,
      cameraMotion: "slow_push_in_drift_right",
      approvedShotAction: "ธีร์ยื่นขวดเซรั่มที่อยู่ในเฟรม ทั้งสองคนชี้ไปที่ฉลากเดิม",
      speakerSections: renderMarketplaceVideoSpeakerSections(turns.map((turn, index) => ({
        speaker: turn.speakerName,
        line: turn.line,
        cue: index === 0 ? "person-1, viewer-left" : "person-2, viewer-right",
        person: { id: `person-${index + 1}`, appearance: index === 0 ? "man in navy pajamas" : "woman in navy pajamas" },
      }))),
    });
    expect(prompt.length).toBeLessThan(1200);
    expect(isMarketplaceAutoReviewVideoPromptComplete({
      value: prompt,
      approvedDialogue: turns.map(turn => `${turn.speakerName}: ${turn.line}`).join("\n"),
      detectedPersonIds: ["person-1", "person-2"],
      derivedDialogueTurns: turns,
      cast,
    })).toBe(true);
    for (const turn of turns) expect(prompt.split(turn.line)).toHaveLength(2);
    expect(prompt.indexOf(turns[0].line)).toBeLessThan(prompt.indexOf(turns[1].line));
  });

  it("uses one turn-taking instruction with numbered verbatim lines", () => {
    const sections = renderMarketplaceVideoSpeakerSections([
      {
        speaker: "Nicha",
        line: "My hair is frizzy.",
        cue: "person-1, viewer-left",
        person: { id: "person-1", appearance: "woman with long dark hair" },
      },
      {
        speaker: "Krit",
        line: "I can help.",
        cue: "person-2, viewer-right",
        person: { id: "person-2", appearance: "man in navy pajamas" },
      },
    ]);

    expect(sections).toContain("1. Nicha: “My hair is frizzy.”");
    expect(sections).toContain("2. Krit: “I can help.”");
    expect(sections).toContain("Only the current speaker moves their mouth. Everyone else stays silent with mouths closed.");
  });
});
