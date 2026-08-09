import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaBarrierCutPlan,
  detectVerticalDramaDualViewIntent,
  deriveVerticalDramaBarrierMultiViewStatus,
  normalizeVerticalDramaBarrierMultiView,
  projectLegacyBarrierDialogueToMultiView,
  resolveVerticalDramaBarrierDialogueCharacterRefs,
  validateVerticalDramaBarrierMultiView,
} from "../barrierMultiView";

const baseView = {
  enabled: true as const,
  barrierType: "closed_door" as const,
  relation: "same_establishment_adjacent_spaces" as const,
  startView: {
    side: "inside" as const,
    characterRefs: ["irin"],
    locationKey: "storage-room",
  },
  referenceView: {
    side: "outside" as const,
    characterRefs: ["krit"],
    locationKey: "cafe-lower-floor",
    referenceFrameAssetId: "42",
  },
  dialogueSideMap: { irin: "inside" as const, krit: "outside" as const },
};

describe("Vertical Drama Barrier Multi-View", () => {
  it("normalizes and validates disjoint physical views", () => {
    const value = normalizeVerticalDramaBarrierMultiView(baseView);
    expect(value).toMatchObject(baseView);
    expect(
      validateVerticalDramaBarrierMultiView(value!, ["irin", "krit"])
    ).toEqual([]);
  });

  it("preserves View 2 image prompts independently from the primary frame prompt", () => {
    const value = normalizeVerticalDramaBarrierMultiView({
      ...baseView,
      referenceView: {
        ...baseView.referenceView,
        image_prompt: "กฤตยืนอยู่ในคาเฟ่หน้าประตูที่ปิดสนิท",
        negative_prompt: "no second person, no open door",
      },
    });
    expect(value?.referenceView).toMatchObject({
      imagePrompt: "กฤตยืนอยู่ในคาเฟ่หน้าประตูที่ปิดสนิท",
      negativePrompt: "no second person, no open door",
    });
  });

  it("rejects overlap and unmapped speakers", () => {
    const invalid = {
      ...baseView,
      referenceView: { ...baseView.referenceView, characterRefs: ["irin"] },
      dialogueSideMap: { irin: "inside" as const },
    };
    expect(
      validateVerticalDramaBarrierMultiView(invalid, ["irin", "krit"])
    ).toEqual(
      expect.arrayContaining([
        "view_character_refs_must_be_disjoint",
        "speaker_side_missing:krit",
      ])
    );
  });

  it("resolves canonical dialogue display names to the configured view character keys", () => {
    const resolved = resolveVerticalDramaBarrierDialogueCharacterRefs({
      view: {
        ...baseView,
        startView: { ...baseView.startView, characterRefs: ["character"] },
        referenceView: {
          ...baseView.referenceView,
          characterRefs: ["character-3"],
        },
        dialogueSideMap: {
          character: "inside",
          "character-3": "outside",
        },
      },
      dialogueCharacterRefs: ["ไอริณ", "กฤต"],
      characters: [
        { characterKey: "character", name: "ไอริณ" },
        { characterKey: "character-3", name: "คุณกฤต" },
      ],
    });

    expect(resolved).toEqual(["character", "character-3"]);
  });

  it("projects legacy single-frame data as incomplete until the outside view exists", () => {
    const migrated = projectLegacyBarrierDialogueToMultiView({
      type: "closed_door",
      state: "locked",
      cameraSide: "inside",
      visibleCharacterRefs: ["irin"],
      offscreenCharacterRefs: ["krit"],
    });
    expect(migrated.startView.characterRefs).toEqual(["irin"]);
    expect(migrated.referenceView.characterRefs).toEqual(["krit"]);
    expect(deriveVerticalDramaBarrierMultiViewStatus({ view: migrated })).toBe(
      "configured"
    );
  });

  it("maps speaker windows to physical view roles", () => {
    expect(
      buildVerticalDramaBarrierCutPlan({
        view: baseView,
        windows: [
          {
            subShotNumber: 1,
            characterKey: "irin",
            lineIndexes: [0],
            durationSeconds: 2,
          },
          {
            subShotNumber: 2,
            characterKey: "krit",
            lineIndexes: [1],
            durationSeconds: 2,
          },
        ],
      })
    ).toMatchObject([
      { side: "inside", viewRole: "start_frame" },
      { side: "outside", viewRole: "barrier_reference" },
    ]);
  });

  it("detects a physical closed-door conversation before phone-call cues", () => {
    const detected = detectVerticalDramaDualViewIntent({
      text: "ไอริณอยู่ในห้องเก็บของ กฤตยืนหน้าประตูที่ล็อกอยู่ ทั้งคู่ตะโกนคุยผ่านประตู แล้วไอริณโทรหากฤต",
      sceneCharacterRefs: ["irin"],
      screenCallerCharacterRefs: ["krit"],
      dialogueCharacterRefs: ["irin", "krit"],
      primaryLocationKey: "storage-room",
      locations: [
        { locationKey: "storage-room", name: "ห้องเก็บของ" },
        { locationKey: "cafe-floor", name: "คาเฟ่ชั้นล่าง" },
      ],
    });
    expect(detected).toMatchObject({
      scenario: "physical_barrier",
      activationSource: "auto",
      startView: { characterRefs: ["irin"] },
      referenceView: { characterRefs: ["krit"] },
    });
  });

  it("detects a remote call only when the text asks to show both environments", () => {
    const detected = detectVerticalDramaDualViewIntent({
      text: "ไอริณอยู่ที่คาเฟ่ โทรคุยกับกฤตซึ่งอยู่ที่โรงพยาบาล ตัดสลับให้เห็นบรรยากาศของทั้งสองฝ่าย",
      sceneCharacterRefs: ["irin"],
      screenCallerCharacterRefs: ["krit"],
      dialogueCharacterRefs: ["irin", "krit"],
      primaryLocationKey: "cafe",
      locations: [
        { locationKey: "cafe", name: "คาเฟ่" },
        { locationKey: "hospital", name: "โรงพยาบาล" },
      ],
    });
    expect(detected).toMatchObject({
      scenario: "remote_call",
      referenceView: {
        characterRefs: ["krit"],
        locationKey: "hospital",
      },
    });
  });

  it("does not turn an ordinary phone-screen caller into Dual View", () => {
    expect(
      detectVerticalDramaDualViewIntent({
        text: "ไอริณมองกฤตบนหน้าจอโทรศัพท์และคุยโทรศัพท์กับเขา",
        sceneCharacterRefs: ["irin"],
        screenCallerCharacterRefs: ["krit"],
        dialogueCharacterRefs: ["irin", "krit"],
        primaryLocationKey: "cafe",
      })
    ).toBeUndefined();
  });

  it("detects a general cross-location intercut without a phone", () => {
    expect(
      detectVerticalDramaDualViewIntent({
        text: "ทั้งสองอยู่คนละสถานที่ ภาพตัดสลับระหว่างสถานีรถไฟและบ้าน",
        sceneCharacterRefs: ["irin", "krit"],
        dialogueCharacterRefs: ["irin", "krit"],
        primaryLocationKey: "station",
        locations: [
          { locationKey: "station", name: "สถานีรถไฟ" },
          { locationKey: "home", name: "บ้าน" },
        ],
      })
    ).toMatchObject({
      scenario: "separate_locations",
      startView: { characterRefs: ["irin"] },
      referenceView: { characterRefs: ["krit"], locationKey: "home" },
    });
  });
});
