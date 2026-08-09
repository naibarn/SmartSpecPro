import { describe, expect, it } from "vitest";
import {
  classifyDeviceMediatedCharacterRefs,
  filterDeviceMediatedCharacterRefs,
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
});
