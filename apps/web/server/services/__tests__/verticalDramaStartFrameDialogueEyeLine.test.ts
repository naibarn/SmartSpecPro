import { describe, expect, it } from "vitest";

import {
  buildStartFrameDialogueEyeLineLock,
  buildStartFrameShotPromptUserPrompt,
  type StartFrameDialogueLine,
} from "../verticalDramaStartFrameGeneration";

const characterNameByKey = new Map([
  ["pim", "พิมพ์ชนก"],
  ["thee", "ธีร์"],
  ["phum", "ภูมิ"],
]);

const manifest = [
  {
    index: 1,
    name: "พิมพ์ชนก",
    characterId: "pim",
    presence: "scene" as const,
  },
  { index: 2, name: "ธีร์", characterId: "thee", presence: "scene" as const },
  { index: 3, name: "ภูมิ", characterId: "phum", presence: "scene" as const },
];

function lines(value: StartFrameDialogueLine[]): StartFrameDialogueLine[] {
  return value;
}

describe("start-frame dialogue eye-line lock", () => {
  it("infers the other visible speaker when exactly two speakers are present", () => {
    const lock = buildStartFrameDialogueEyeLineLock({
      dialogueLines: lines([
        { speaker: "phum", line: "ธีร์กลับด้วยกันได้ไหมครับ" },
        { speaker: "pim", line: "ได้" },
      ]),
      visibleCharacterRefs: ["pim", "thee", "phum"],
      characterNameByKey,
    });

    expect(lock).toContain("ภูมิ is the first visible speaker");
    expect(lock).toContain("toward พิมพ์ชนก");
    expect(lock).toContain("Never stage spoken delivery directly to camera");
  });

  it("uses an explicit addressee and never makes the lens the target", () => {
    const lock = buildStartFrameDialogueEyeLineLock({
      dialogueLines: lines([
        { speaker: "pim", line: "ดูนี่สิ", addressedTo: "thee" },
        { speaker: "thee", line: "เห็นแล้ว" },
        { speaker: "phum", line: "ผมไปด้วย" },
      ]),
      visibleCharacterRefs: ["pim", "thee", "phum"],
      characterNameByKey,
    });

    expect(lock).toContain("toward ธีร์");
    expect(lock).toContain("พิมพ์ชนก -> ธีร์");
    expect(lock).toContain("Never stage spoken delivery directly to camera");
  });

  it("keeps a remote caller out of the physical eye-line map", () => {
    const lock = buildStartFrameDialogueEyeLineLock({
      dialogueLines: lines([
        { speaker: "caller", line: "เข้าประชุมแล้วค่ะ" },
        { speaker: "pim", line: "ได้ยินชัดค่ะ" },
      ]),
      visibleCharacterRefs: ["pim"],
      screenCallerCharacterRefs: ["caller"],
      characterNameByKey: new Map([
        ["caller", "รินลดา"],
        ["pim", "พิมพ์ชนก"],
      ]),
    });

    expect(lock).toContain("รินลดา is a remote caller");
    expect(lock).toContain("may appear only inside the assigned floating virtual screen");
    expect(lock).toContain("Do not render this caller as a physical person");
    expect(lock).not.toContain("รินลดา is the first visible speaker");
  });

  it("reaches the single-shot authoring prompt, including policy-safe-compatible staging context", () => {
    const prompt = buildStartFrameShotPromptUserPrompt({
      userId: 1,
      seriesId: 1,
      episodeId: 1,
      shotNumber: 8,
      currentPrompt: "vertical 9:16 start frame",
      currentNegativePrompt: "none",
      requiredCharacterRefs: ["pim", "thee", "phum"],
      characterReferenceManifest: manifest,
      dialogueLines: lines([
        { speaker: "pim", line: "มยุรีส่งภาพมาให้", addressedTo: "thee" },
      ]),
    });

    expect(prompt).toContain(
      "START-FRAME DIALOGUE / EYE-LINE LOCK (MANDATORY)"
    );
    expect(prompt).toContain("toward ธีร์");
    expect(prompt).toContain("Do not render subtitles");
  });
});
