import { describe, expect, it } from "vitest";

import {
  vdCopy,
  vdCopyWithParams,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

/**
 * Task #26 (data sanity — episode number beyond the planned season plan,
 * e.g. episode 11 while the plan only covers 10) — the
 * `getEpisodeBreakdownStatus`-driven warning banner copy
 * (`VerticalDramaEpisodeWorkspace.tsx`'s `breakdownStatus === "beyond_plan"`
 * block). Mirrors `verticalDramaWorkspaceCopy.dialogueAudioBatch.test.ts`'s
 * exact convention for the sibling `dialogueAudioMissingCast*` copy.
 */
describe("Episode-beyond-plan banner copy (task #26)", () => {
  const keys = [
    "episodeBeyondPlanTitle",
    "episodeBeyondPlanBody",
    "episodeBeyondPlanLink",
  ] as const;

  it("has a non-empty entry for every new key in both locales", () => {
    for (const key of keys) {
      expect(vdCopy("th")[key].length).toBeGreaterThan(0);
      expect(vdCopy("en")[key].length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai)", () => {
    expect(vdCopy("th").episodeBeyondPlanBody).toBe(
      "ขยายแผนซีซั่นที่หน้าภาพรวมก่อน เพื่อให้บท/ร่างละเอียด/QC อ้างอิงโครงเรื่องได้"
    );
    expect(vdCopy("th").episodeBeyondPlanTitle).toBe(
      "ตอนนี้อยู่นอกแผนซีซั่นปัจจุบัน (แผนมี {count} ตอน)"
    );
  });

  it("interpolates the planned-episode-count title template correctly (Thai)", () => {
    const text = vdCopyWithParams(vdCopy("th").episodeBeyondPlanTitle, {
      count: 10,
    });
    expect(text).toBe("ตอนนี้อยู่นอกแผนซีซั่นปัจจุบัน (แผนมี 10 ตอน)");
  });

  it("interpolates the planned-episode-count title template correctly (English)", () => {
    const text = vdCopyWithParams(vdCopy("en").episodeBeyondPlanTitle, {
      count: 10,
    });
    expect(text).toBe(
      "This episode is outside the current season plan (plan covers 10 episode(s))"
    );
  });
});
