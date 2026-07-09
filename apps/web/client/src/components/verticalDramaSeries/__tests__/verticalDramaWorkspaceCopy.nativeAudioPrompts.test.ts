/**
 * Task #36 (optional NATIVE AUDIO DIRECTION prompt option, added
 * 2026-07-09) copy coverage — both locales must carry the native-audio
 * toggle label/hint and the per-clip audio-direction chip label.
 */
import { describe, expect, it } from "vitest";

import { vdCopy } from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

describe("vdCopy — native audio direction toggle (task #36)", () => {
  it("has non-empty EN copy for the toggle label, hint, and audio-direction chip label", () => {
    const t = vdCopy("en");
    expect(t.nativeAudioToggleLabel.length).toBeGreaterThan(0);
    expect(t.nativeAudioToggleHint.length).toBeGreaterThan(0);
    expect(t.nativeAudioDirectionChipLabel.length).toBeGreaterThan(0);
  });

  it("has non-empty TH copy matching the owner's exact requested wording", () => {
    const t = vdCopy("th");
    expect(t.nativeAudioToggleLabel).toBe(
      "เสียงประกอบในตัว (บรรยากาศ+SFX จากโมเดล)"
    );
    expect(t.nativeAudioToggleHint).toBe(
      "ไม่มีเสียงพูด/เพลง — เสียงพูดมาจากระบบพากย์ เพลงเป็นตัวเลือกแยก"
    );
    expect(t.nativeAudioDirectionChipLabel.length).toBeGreaterThan(0);
  });

  it("the hint never mentions dialogue/music being included (matches the hard content rules)", () => {
    const en = vdCopy("en");
    expect(en.nativeAudioToggleHint.toLowerCase()).toContain("speech");
    expect(en.nativeAudioToggleHint.toLowerCase()).toContain("music");
  });
});
