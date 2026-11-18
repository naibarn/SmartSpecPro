import { describe, expect, it } from "vitest";

import {
  buildMarketplaceVerticalDramaVideoPromptInput,
  composeMarketplaceAutoReviewVideoPrompt,
  recomposeMarketplaceAutoReviewVideoPrompt,
  renderMarketplaceVideoSpeakerSections,
} from "../marketplaceAutoReviewVideoPromptSkillRunner";
import { isCompleteStagedVideoPrompt } from "../marketplaceAutoReviewStagedPromptCompiler";
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
    expect(prompt).toContain("OBJECT AND PRODUCT CONTINUITY LOCK");
    expect(prompt).toContain("global product metadata is not permission to add it");
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

  it("removes a model-added product placement and appends approved shot action plus a continuity lock", () => {
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      generatedPrompt: [
        "Use Image 1 as the exact start frame.",
        "Camera: slowly pushes toward the mirror.",
        "Product: include Cella Protein Hair Mask as a prop beside the mirror.",
        "Action: she smooths her hair and turns toward him.",
      ].join("\n\n"),
      speakerSections: "SPEAKER VISUAL MAP FOR THIS SHOT:\nApproved dialogue:",
      approvedDialogue: [],
      approvedShotAction: "She smooths her hair and turns toward him.",
    });

    expect(prompt).not.toContain("Product: include Cella Protein Hair Mask");
    expect(prompt).toContain("APPROVED SHOT ACTION (authoritative)");
    expect(prompt).toContain("She smooths her hair and turns toward him.");
    expect(prompt).toContain("OBJECT AND PRODUCT CONTINUITY LOCK");
    expect(prompt).toContain("global product metadata is not permission to add it");
    expect(prompt.indexOf("OBJECT AND PRODUCT CONTINUITY LOCK")).toBeGreaterThan(
      prompt.indexOf("APPROVED SHOT ACTION (authoritative)")
    );
  });

  it("rejects model-authored overlapping speech and serializes approved dialogue turns", () => {
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      generatedPrompt: [
        "Both characters speak simultaneously and repeat the same line.",
        "They recite their lines together.",
        "Nicha says 'My hair is frizzy.' as Krit repeats it.",
        "Camera slowly pushes toward the mirror.",
        "Nicha smooths her hair and turns toward Krit.",
      ].join(" "),
      speakerSections: [
        "SPEAKER VISUAL MAP FOR THIS SHOT:",
        "Nicha: person-1, viewer-left",
        "Krit: person-2, viewer-right",
        "Approved dialogue:",
        "Nicha: My hair is frizzy.",
        "Krit: I can help.",
      ].join("\n"),
      approvedDialogue: [
        { line: "My hair is frizzy." },
        { line: "I can help." },
      ],
      approvedShotAction: "Nicha smooths her hair and turns toward Krit.",
    });

    expect(prompt).not.toMatch(/speak simultaneously|repeat the same line|recite their lines/i);
    expect(prompt).toContain("Camera slowly pushes toward the mirror.");
    expect(prompt).toContain("SPEAKER TURN-TAKING LOCK");
    expect(prompt).toContain("one person at a time");
    expect(prompt).toContain("No overlapping turns");
    expect(prompt.match(/My hair is frizzy\./g)).toHaveLength(1);
  });

  it("restores the speaker map before dialogue when the optimizer appends protected fragments", () => {
    const cast = [
      { castId: "cast-1", name: "Nicha", role: "host", source: "uploaded", imageIndex: 2 },
      { castId: "cast-2", name: "Krit", role: "guest", source: "uploaded", imageIndex: 3 },
    ] as any;
    const dialogue = "Nicha: My hair is frizzy.\nKrit: I can help.";
    const turns = [
      { castId: "cast-1", speakerName: "Nicha", line: "My hair is frizzy." },
      { castId: "cast-2", speakerName: "Krit", line: "I can help." },
    ];
    const speakerSections = renderMarketplaceVideoSpeakerSections([
      {
        speaker: "Nicha",
        line: "My hair is frizzy.",
        cue: "person-1, viewer-left",
        person: { id: "person-1", appearance: "woman with long dark hair wearing a cream blouse" },
      },
      {
        speaker: "Krit",
        line: "I can help.",
        cue: "person-2, viewer-right",
        person: { id: "person-2", appearance: "man with short dark hair wearing a navy sweater" },
      },
    ]);
    const original = composeMarketplaceAutoReviewVideoPrompt({
      generatedPrompt: "Camera movement slowly follows the action as both characters move naturally.",
      speakerSections,
      approvedDialogue: turns,
      approvedShotAction: "Nicha smooths her hair and turns toward Krit.",
    });
    const mapStart = original.indexOf("SPEAKER VISUAL MAP FOR THIS SHOT:");
    const dialogueStart = original.indexOf("Approved dialogue:", mapStart);
    const speakerMap = original.slice(mapStart, dialogueStart).trim();
    const withoutMap = `${original.slice(0, mapStart)}${original.slice(dialogueStart)}`;
    const optimizedWithAppendedMap = `${withoutMap.trim()}\n\n${speakerMap}`;

    expect(
      isCompleteStagedVideoPrompt(
        optimizedWithAppendedMap,
        dialogue,
        ["person-1", "person-2"],
        turns,
        cast
      )
    ).toBe(false);

    const repaired = recomposeMarketplaceAutoReviewVideoPrompt({
      optimizedPrompt: optimizedWithAppendedMap,
      speakerSections,
      approvedDialogue: turns,
      approvedShotAction: "Nicha smooths her hair and turns toward Krit.",
    });

    expect(repaired.indexOf("SPEAKER VISUAL MAP FOR THIS SHOT:")).toBeLessThan(
      repaired.indexOf("Approved dialogue:")
    );
    expect(
      repaired.match(/Create a vertical 9:16 video using the approved image/g)
    ).toHaveLength(1);
    expect(
      repaired.match(/APPROVED SHOT ACTION \(authoritative\):/g)
    ).toHaveLength(1);
    expect(
      repaired.match(/OBJECT AND PRODUCT CONTINUITY LOCK \(MANDATORY\):/g)
    ).toHaveLength(1);
    expect(
      repaired.match(/NO-ADDED-TEXT LOCK \(MANDATORY\):/g)
    ).toHaveLength(1);
    expect(repaired.length).toBeLessThanOrEqual(3000);
    expect(
      isCompleteStagedVideoPrompt(
        repaired,
        dialogue,
        ["person-1", "person-2"],
        turns,
        cast
      )
    ).toBe(true);
  });

  it("tells each non-speaking character to keep their mouth closed during every line", () => {
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

    expect(sections).toContain("TURN 1 — Nicha (person-1) speaks once");
    expect(sections).toContain("While Nicha speaks, Krit (person-2) keep mouths fully closed");
    expect(sections).toContain("TURN 2 — Krit (person-2) speaks once");
    expect(sections).toContain("While Krit speaks, Nicha (person-1) keep mouths fully closed");
    expect(sections.indexOf("TURN 1 —")).toBeLessThan(sections.indexOf("TURN 2 —"));
  });
});
