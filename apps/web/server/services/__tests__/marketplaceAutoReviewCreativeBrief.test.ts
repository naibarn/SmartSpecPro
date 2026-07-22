import { describe, it, expect } from "vitest";

import { creativeBriefDirectiveForTest } from "../marketplaceAutoReviewService";

const BRIEF_TEXT_TH =
  "มีเด็กผู้หญิงชาวไทยอายุ 6 ขวบ แม่กำลังสระผมให้";

describe("marketplace auto review creative brief directive (shot planning injection)", () => {
  it("emits an empty directive when creative brief is absent/empty/whitespace (byte-identical guarantee)", () => {
    // buildRuntimeInput inserts this value into an array that is filtered with
    // `.filter(value => value !== "")` before join. An empty directive therefore
    // adds zero bytes, keeping the Production Director prompt byte-identical.
    expect(creativeBriefDirectiveForTest(undefined)).toBe("");
    expect(creativeBriefDirectiveForTest(null)).toBe("");
    expect(creativeBriefDirectiveForTest("")).toBe("");
    expect(creativeBriefDirectiveForTest("   ")).toBe("");
  });

  it("emits the USER-SELECTED STORY DIRECTION LOCK exactly once when set", () => {
    const directive = creativeBriefDirectiveForTest(BRIEF_TEXT_TH);
    const occurrences =
      directive.split("USER-SELECTED STORY DIRECTION LOCK:").length - 1;
    expect(occurrences).toBe(1);
  });

  it("carries the user's story text verbatim into the planner directive (anti-taught-not-wired assertion)", () => {
    const directive = creativeBriefDirectiveForTest(BRIEF_TEXT_TH);
    expect(directive).toContain(BRIEF_TEXT_TH);
  });

  it("locks the scenario into per-shot storyboardGuide/visual/voiceover, chronologically coherent", () => {
    const directive = creativeBriefDirectiveForTest(BRIEF_TEXT_TH);
    const lower = directive.toLowerCase();
    expect(lower).toContain("storyboardguide");
    expect(lower).toContain("visual");
    expect(lower).toContain("voiceover");
    expect(lower).toContain("chronologically");
  });

  it("states the directive is additional (never a replacement) and preserves minor-safety rules", () => {
    const directive = creativeBriefDirectiveForTest(BRIEF_TEXT_TH);
    expect(directive).toContain("ADDITIONAL");
    expect(directive.toLowerCase()).toContain("never replaces or overrides");
    // minor-safety language must survive even when the scenario involves a child
    const lower = directive.toLowerCase();
    expect(lower).toContain("minor-safety");
    expect(lower).toContain("secondary product-use context");
  });
});
