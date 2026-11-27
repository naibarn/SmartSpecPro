import { describe, expect, it } from "vitest";

import {
  composeMarketplaceAutoReviewVideoPrompt,
  isMarketplaceAutoReviewVideoPromptComplete,
  renderMarketplaceVideoSpeakerSections,
} from "../marketplaceAutoReviewVideoPromptSkillRunner";
import type { StagedCastMember, StagedDialogueTurn } from "../marketplaceAutoReviewStoryArcPlanner";

const cast: StagedCastMember[] = [
  { castId: "cast-ann", name: "Ann", source: "uploaded", role: "host", imageIndex: 2 },
];
const turns: StagedDialogueTurn[] = [
  { castId: "cast-ann", speakerName: "Ann", line: "Hello there." },
];
const speakerSections = renderMarketplaceVideoSpeakerSections([
  {
    speaker: "Ann",
    line: "Hello there.",
    person: {
      id: "person-1",
      appearance: "adult woman with tied-back dark hair and a cream blouse",
    },
    cue: "person-1",
  },
]);

function videoPrompt(approvedShotAction = "Ann smiles and speaks naturally.") {
  return composeMarketplaceAutoReviewVideoPrompt({
    cameraMotion: "slow_pan_right",
    durationSeconds: 10,
    speakerSections,
    approvedShotAction,
  });
}

describe("Marketplace Auto Review video prompt identity and consistency", () => {
  it("uses detected person ID and appearance without viewer-side labels", () => {
    const prompt = videoPrompt();

    expect(speakerSections).toContain(
      "Ann: person-1 — adult woman with tied-back dark hair and a cream blouse"
    );
    expect(prompt).toContain(
      "honor changes only when the approved action explicitly requires them"
    );
    expect(prompt).not.toMatch(/viewer-(?:left|center|right)/i);
    expect(isMarketplaceAutoReviewVideoPromptComplete({
      value: prompt,
      approvedDialogue: "Ann: Hello there.",
      detectedPersonIds: ["person-1"],
      derivedDialogueTurns: turns,
      cast,
    })).toBe(true);
  });

  it("keeps the approved action as the only camera-motion authority", () => {
    const prompt = composeMarketplaceAutoReviewVideoPrompt({
      cameraMotion: "slow_pan_right",
      durationSeconds: 10,
      speakerSections,
      approvedShotAction: "The camera slowly pans left while Ann speaks.",
    });

    expect(prompt).toContain("pans left");
    expect(prompt).not.toContain("rightward camera drift");
  });

  it("rejects simultaneous opposing camera directions", () => {
    expect(isMarketplaceAutoReviewVideoPromptComplete({
      value: videoPrompt("Move in and pull back simultaneously while Ann speaks."),
      approvedDialogue: "Ann: Hello there.",
      detectedPersonIds: ["person-1"],
      derivedDialogueTurns: turns,
      cast,
    })).toBe(false);
  });

  it("rejects a no-speech instruction when approved dialogue is present", () => {
    expect(isMarketplaceAutoReviewVideoPromptComplete({
      value: videoPrompt("Use natural ambient sound with no speech."),
      approvedDialogue: "Ann: Hello there.",
      detectedPersonIds: ["person-1"],
      derivedDialogueTurns: turns,
      cast,
    })).toBe(false);
  });
});
