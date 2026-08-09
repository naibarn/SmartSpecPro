import { describe, expect, it } from "vitest";
import { evaluateVideoSafetyGate } from "../verticalDramaVideoSafetyGate";

const requiredCharacterRefs = ["prang", "ireen", "kadin"];

const safeVideoSafety = {
  analyzedAssetId: "42",
  video_safe_verdict: "safe" as const,
  faces_separated: true,
  face_touching_frame_edge: false,
  characters: requiredCharacterRefs.map(character => ({
    character,
    face_readable: true,
    facing: "three_quarter",
    eyes_visible: "both",
    occlusion: "none",
    face_size: "large",
    overlapped_by_other_face: false,
  })),
};

describe("evaluateVideoSafetyGate", () => {
  it("does not gate single-character shots", () => {
    expect(
      evaluateVideoSafetyGate({
        requiredCharacterRefs: ["prang"],
        selectedAssetId: "42",
      })
    ).toEqual({ allowed: true, reason: "not_required" });
  });

  it("requires QC for a multi-character I2V anchor", () => {
    expect(
      evaluateVideoSafetyGate({
        requiredCharacterRefs,
        selectedAssetId: "42",
      })
    ).toMatchObject({ allowed: false, reason: "missing_qc" });
  });

  it("rejects QC for a different asset", () => {
    expect(
      evaluateVideoSafetyGate({
        requiredCharacterRefs,
        selectedAssetId: "99",
        videoSafety: safeVideoSafety,
      })
    ).toMatchObject({ allowed: false, reason: "stale_qc" });
  });

  it("accepts fresh complete evidence for every required character", () => {
    expect(
      evaluateVideoSafetyGate({
        requiredCharacterRefs,
        selectedAssetId: "42",
        videoSafety: safeVideoSafety,
      })
    ).toEqual({ allowed: true, reason: "verified" });
  });

  it("rejects a back-facing or occluded character even when the verdict says safe", () => {
    expect(
      evaluateVideoSafetyGate({
        requiredCharacterRefs,
        selectedAssetId: "42",
        videoSafety: {
          ...safeVideoSafety,
          characters: safeVideoSafety.characters.map((character, index) =>
            index === 0 ? { ...character, facing: "back_of_head" } : character
          ),
        },
      })
    ).toMatchObject({ allowed: false, reason: "incomplete_evidence" });
  });
});
