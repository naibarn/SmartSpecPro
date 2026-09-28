import { describe, expect, it } from "vitest";
import {
  classifyDeviceMediatedCharacterRefs,
  filterDeviceMediatedCharacterRefs,
  resolveVerticalDramaVisualCast,
} from "./characterPresence";

const characters = [
  { characterKey: "irin", name: "ไอริณ" },
  { characterKey: "pakin", name: "ภาคิน" },
  { characterKey: "krit", name: "กฤต" },
];

describe("filterDeviceMediatedCharacterRefs", () => {
  it("does not infer a caller role from synopsis wording", () => {
    expect(
      filterDeviceMediatedCharacterRefs({
        characterRefs: ["irin", "pakin", "krit"],
        characters,
        synopsis:
          "กฤตโทรเข้ามือถือภาคิน แต่กฤตไม่ได้อยู่ในห้องเดียวกับภาคินและไอริณ แสดงภาพกฤตบนหน้าจอโทรศัพท์มือถือ",
      })
    ).toEqual(["irin", "pakin", "krit"]);
  });

  it("does not remove a character who is physically in the room and merely uses a phone", () => {
    expect(
      filterDeviceMediatedCharacterRefs({
        characterRefs: ["krit"],
        characters,
        synopsis: "กฤตยืนอยู่ในห้องและถือโทรศัพท์ไว้ในมือ",
      })
    ).toEqual(["krit"]);
  });

  it("keeps an explicit caller reference while separating it from the scene cast", () => {
    expect(
      classifyDeviceMediatedCharacterRefs({
        characterRefs: ["irin", "pakin", "krit"],
        characters,
        screenCallerCharacterRefs: ["krit"],
        synopsis: "ภาคินและไอริณอยู่ในห้อง กฤตปรากฏบนหน้าจอมือถือ",
      })
    ).toEqual({
      sceneCharacterRefs: ["irin", "pakin"],
      screenCallerCharacterRefs: ["krit"],
    });
  });

  it("removes a caller's outfit variant from the physical scene role", () => {
    expect(
      classifyDeviceMediatedCharacterRefs({
        characterRefs: ["thir-look-casual_home"],
        characters: [
          { characterKey: "thir", name: "ธีร์" },
          {
            characterKey: "thir-look-casual_home",
            name: "ธีร์",
            parentCharacterKey: "thir",
          },
        ],
        screenCallerCharacterRefs: ["thir"],
      })
    ).toEqual({
      sceneCharacterRefs: [],
      screenCallerCharacterRefs: ["thir"],
    });
  });

  it("also removes the base role when the selected caller is a variant", () => {
    expect(
      classifyDeviceMediatedCharacterRefs({
        characterRefs: ["thir"],
        characters: [
          { characterKey: "thir", name: "ธีร์" },
          {
            characterKey: "thir-look-casual_home",
            name: "ธีร์",
            parentCharacterKey: "thir",
          },
        ],
        screenCallerCharacterRefs: ["thir-look-casual_home"],
      })
    ).toEqual({
      sceneCharacterRefs: [],
      screenCallerCharacterRefs: ["thir-look-casual_home"],
    });
  });

  it("does not merge unrelated characters that have no parent link", () => {
    expect(
      classifyDeviceMediatedCharacterRefs({
        characterRefs: ["twin-b"],
        characters: [
          { characterKey: "twin-a", name: "มิน" },
          { characterKey: "twin-b", name: "มิน" },
        ],
        screenCallerCharacterRefs: ["twin-a"],
      })
    ).toEqual({
      sceneCharacterRefs: ["twin-b"],
      screenCallerCharacterRefs: ["twin-a"],
    });
  });

  it("uses only the explicit caller list when partitioning references", () => {
    expect(
      filterDeviceMediatedCharacterRefs({
        characterRefs: ["irin", "pakin", "krit"],
        characters,
        synopsis: "กฤตปรากฏบนหน้าจอโทรศัพท์มือถือ",
      })
    ).toEqual(["irin", "pakin", "krit"]);
  });

  it("preserves ordinary narrative mentions and unknown keys", () => {
    expect(
      filterDeviceMediatedCharacterRefs({
        characterRefs: ["pakin", "unknown"],
        characters,
        synopsis: "ภาคินนึกถึงกฤตระหว่างจัดเอกสาร",
      })
    ).toEqual(["pakin", "unknown"]);
  });

  it("treats the user-selected frame cast as authoritative over narrative storyboard refs", () => {
    expect(
      resolveVerticalDramaVisualCast({
        selectedCharacterRefs: ["pakin", "irin"],
        storyboardCharacterRefs: ["pakin", "irin", "krit"],
        characterSelectionIsAuthoritative: true,
        characters,
      })
    ).toEqual({
      sceneCharacterRefs: ["pakin", "irin"],
      screenCallerCharacterRefs: [],
      narrativeOnlyCharacterRefs: ["krit"],
    });
  });

  it("does not infer a caller from a narrative-only storyboard mention", () => {
    expect(
      resolveVerticalDramaVisualCast({
        selectedCharacterRefs: ["pakin", "irin"],
        storyboardCharacterRefs: ["pakin", "irin", "krit"],
        storyboardCallerCharacterRefs: [],
        characterSelectionIsAuthoritative: true,
        characters,
      }).screenCallerCharacterRefs
    ).toEqual([]);
  });
});
