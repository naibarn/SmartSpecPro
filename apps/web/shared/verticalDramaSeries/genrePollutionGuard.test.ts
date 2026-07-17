import { describe, expect, it } from "vitest";
import {
  detectGenrePollution,
  genrePollutionErrorMessage,
  isGenrePolluted,
} from "./genrePollutionGuard";

describe("detectGenrePollution", () => {
  it("flags a genre that is byte-identical to the title (series 5)", () => {
    const title = "สวมรอยดาราสองชีวิต…";
    const genre = "สวมรอยดาราสองชีวิต…";
    expect(detectGenrePollution(genre, title)).toBe("duplicate_of_title");
  });

  it("flags a genre containing a colon — the 'Title: Subtitle' alt-title shape (series 17)", () => {
    const title = "รักข้ามเวลา";
    const genre = "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา";
    expect(detectGenrePollution(genre, title)).toBe("sentence_shaped");
  });

  it("flags a long, multi-segment genre that reads as a logline/paraphrased alt-title (series 16)", () => {
    const title = "คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ";
    const genre = "คาเฟ่ปั่นรัก พี่ชายหวงตัวแสบในตึกเดียวกัน";
    expect(detectGenrePollution(genre, title)).toBe("logline_length");
  });

  it("never flags a genuine short Thai genre label (single compound word, no punctuation)", () => {
    expect(
      detectGenrePollution("โรแมนติกดราม่าย้อนเวลา", "รักข้ามเวลา")
    ).toBeNull();
    expect(detectGenrePollution("ดราม่าครอบครัว", "บ้านในเงามืด")).toBeNull();
  });

  it("never flags a realistic multi-tag genre (space-separated, but well under the length threshold)", () => {
    expect(
      detectGenrePollution("โรแมนติก ดราม่า ครอบครัว ย้อนยุค", "รักข้ามเวลา")
    ).toBeNull();
  });

  it("returns null for an absent/blank genre — nothing to validate", () => {
    expect(detectGenrePollution(undefined, "Some Title")).toBeNull();
    expect(detectGenrePollution(null, "Some Title")).toBeNull();
    expect(detectGenrePollution("   ", "Some Title")).toBeNull();
  });

  it("is case-insensitive and whitespace-tolerant for the exact-duplicate check", () => {
    expect(detectGenrePollution("  My Title  ", "My Title")).toBe(
      "duplicate_of_title"
    );
    expect(detectGenrePollution("MY TITLE", "my title")).toBe(
      "duplicate_of_title"
    );
  });

  it("does not false-positive on a title-shaped genre when title is absent (nothing to compare against for duplicate check, but sentence-shape/length rules still apply independently)", () => {
    expect(detectGenrePollution("โรแมนติกดราม่า", undefined)).toBeNull();
  });
});

describe("isGenrePolluted", () => {
  it("mirrors detectGenrePollution as a boolean", () => {
    expect(isGenrePolluted("โรแมนติกดราม่าย้อนเวลา", "รักข้ามเวลา")).toBe(
      false
    );
    expect(
      isGenrePolluted(
        "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
        "รักข้ามเวลา"
      )
    ).toBe(true);
  });
});

describe("genrePollutionErrorMessage", () => {
  it("returns a distinct, non-empty Thai message for every reason", () => {
    const reasons = [
      "duplicate_of_title",
      "sentence_shaped",
      "logline_length",
    ] as const;
    const messages = reasons.map(genrePollutionErrorMessage);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
