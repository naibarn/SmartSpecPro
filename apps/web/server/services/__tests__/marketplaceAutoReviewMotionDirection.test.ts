import { describe, it, expect } from "vitest";

import {
  motionDirectionDirectiveForTest,
  buildMarketplaceAutoReviewSubmittedVideoPrompt,
} from "../marketplaceAutoReviewService";

const MOTION_TEXT_TH =
  "นางแบบหยิบขวดแชมพูขึ้นมา กดหัวปั๊มให้แชมพูไหลลงบนฝ่ามือ นำมาชะโลมบนศีรษะ เกิดฟองนุ่มทั่วเส้นผม แล้วปิดท้ายด้วยการโชว์สินค้าให้เห็นชัดเจน";
const MOTION_TEXT_EN =
  "The model pumps the bottle, pours onto the palm, lathers, then ends on a clear product showcase.";

describe("marketplace auto review motion direction directive (shot planning injection)", () => {
  it("emits an empty directive when motion direction is absent/empty/whitespace (byte-identical guarantee)", () => {
    // buildRuntimeInput inserts this value into an array that is filtered with
    // `.filter(value => value !== "")` before join. An empty directive therefore
    // adds zero bytes, keeping the Production Director prompt byte-identical.
    expect(motionDirectionDirectiveForTest(undefined)).toBe("");
    expect(motionDirectionDirectiveForTest(null)).toBe("");
    expect(motionDirectionDirectiveForTest("")).toBe("");
    expect(motionDirectionDirectiveForTest("   ")).toBe("");
  });

  it("emits the USER-SELECTED MOTION DIRECTION LOCK exactly once when set", () => {
    const directive = motionDirectionDirectiveForTest(MOTION_TEXT_TH);
    const occurrences = directive.split(
      "USER-SELECTED MOTION DIRECTION LOCK:"
    ).length - 1;
    expect(occurrences).toBe(1);
  });

  it("locks in chronological decomposition, additional-not-replacement, and final beat", () => {
    const directive = motionDirectionDirectiveForTest(MOTION_TEXT_TH);
    expect(directive).toContain(MOTION_TEXT_TH);
    expect(directive.toLowerCase()).toContain("chronologically");
    expect(directive.toLowerCase()).toContain("shot.movement");
    expect(directive).toContain("ADDITIONAL");
    expect(directive.toLowerCase()).toContain("never replaces or overrides");
    expect(directive.toLowerCase()).toContain("final beat");
  });
});

describe("marketplace auto review submitted video prompt (real provider prompt injection)", () => {
  const basePrompt = "Video prompt body. Action: hero pours product.";

  it("is byte-identical to the base prompt when no repair and no motion direction", () => {
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
    });
    expect(prompt).toBe(basePrompt);
  });

  it("preserves the existing targeted-repair append behavior unchanged", () => {
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      repairInstruction: "Fix the label crop.",
    });
    expect(prompt).toBe(`${basePrompt}\nTargeted repair: Fix the label crop.`);
  });

  it("appends the motion direction line to the REAL submitted prompt when present", () => {
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      motionDirection: MOTION_TEXT_EN,
    });
    expect(prompt).toBe(
      `${basePrompt}\nUser motion direction (MANDATORY, additional to the rules above): ${MOTION_TEXT_EN}`
    );
  });

  it("keeps the raw motion text (fallback) so Thai input still reaches the submitted prompt", () => {
    const prompt = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      motionDirection: MOTION_TEXT_TH,
    });
    expect(prompt).toContain(
      "User motion direction (MANDATORY, additional to the rules above):"
    );
    // The line must carry non-empty guidance derived from the user text
    // (translated English or raw Thai fallback — never dropped).
    const line = prompt.split(
      "User motion direction (MANDATORY, additional to the rules above): "
    )[1];
    expect((line ?? "").trim().length).toBeGreaterThan(0);
  });

  it("does not append a motion line when motion direction is absent or whitespace", () => {
    const absent = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      motionDirection: undefined,
    });
    const whitespace = buildMarketplaceAutoReviewSubmittedVideoPrompt({
      basePrompt,
      motionDirection: "   ",
    });
    expect(absent).not.toContain("User motion direction");
    expect(whitespace).not.toContain("User motion direction");
    expect(absent).toBe(basePrompt);
    expect(whitespace).toBe(basePrompt);
  });
});
