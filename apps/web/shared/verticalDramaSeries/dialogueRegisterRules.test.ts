import { describe, expect, it } from "vitest";
import {
  detectWrittenRegisterConnectives,
  VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_TH,
} from "./dialogueRegisterRules";

describe("detectWrittenRegisterConnectives", () => {
  it("flags อย่างไรก็ตาม / ดังนั้น / เนื่องจาก in Thai casual dialogue", () => {
    expect(detectWrittenRegisterConnectives("อย่างไรก็ตาม เราต้องไปแล้วนะ", "th")).toEqual([
      "อย่างไรก็ตาม",
    ]);
    expect(detectWrittenRegisterConnectives("ดังนั้นเราจะไม่ไป", "th")).toEqual(["ดังนั้น"]);
    expect(detectWrittenRegisterConnectives("เนื่องจากฝนตก เลยไม่ได้ไป", "th")).toEqual([
      "เนื่องจาก",
    ]);
  });

  it("returns an empty array for a natural spoken line with สิ/นะ/ล่ะ/เหรอ particles", () => {
    expect(detectWrittenRegisterConnectives("ไปกันเถอะสิ", "th")).toEqual([]);
    expect(detectWrittenRegisterConnectives("จริงเหรอ", "th")).toEqual([]);
    expect(detectWrittenRegisterConnectives("ทำไมล่ะ", "th")).toEqual([]);
    expect(detectWrittenRegisterConnectives("ไปนะ", "th")).toEqual([]);
  });

  it("detects multiple distinct connectives in one line", () => {
    const found = detectWrittenRegisterConnectives(
      "อย่างไรก็ตาม ดังนั้นเราจึงต้องเปลี่ยนแผน",
      "th",
    );
    expect(found).toEqual(["อย่างไรก็ตาม", "ดังนั้น"]);
  });

  it("known-limitation: a blocklist substring embedded inside a proper noun still matches (documented, not corrected)", () => {
    // A hypothetical character/place name that happens to CONTAIN "ทั้งนี้" as
    // a substring would still be flagged — this is a deliberate, documented
    // limitation of the pure substring-match heuristic (no word-boundary or
    // proper-noun awareness), not a false-positive bug this function attempts
    // to eliminate.
    const nameContainingBlocklistSubstring = "ทั้งนี้วรรณ อยู่ไหน";
    expect(detectWrittenRegisterConnectives(nameContainingBlocklistSubstring, "th")).toEqual([
      "ทั้งนี้",
    ]);
  });

  it("returns an empty array for an empty/whitespace line", () => {
    expect(detectWrittenRegisterConnectives("", "th")).toEqual([]);
  });

  it("uses the English placeholder list for a non-Thai locale, case-insensitively", () => {
    expect(detectWrittenRegisterConnectives("However, I disagree.", "en")).toEqual(["however"]);
    expect(detectWrittenRegisterConnectives("HOWEVER I disagree", "en")).toEqual(["however"]);
    expect(detectWrittenRegisterConnectives("I don't think so.", "en")).toEqual([]);
  });

  it("every entry in the exported Thai blocklist constant is independently detectable", () => {
    for (const term of VD_DIALOGUE_WRITTEN_REGISTER_CONNECTIVES_TH) {
      expect(detectWrittenRegisterConnectives(`${term} แล้วเราจะทำยังไง`, "th")).toContain(term);
    }
  });
});
