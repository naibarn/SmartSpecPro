import { describe, expect, it } from "vitest";

import {
  buildMarketplaceVerticalDramaVideoPromptInput,
  composeMarketplaceAutoReviewVideoPrompt,
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
});
