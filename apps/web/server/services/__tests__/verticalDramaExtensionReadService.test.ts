import { describe, expect, it } from "vitest";
import { projectDramaShotDialogueLinesForExtension } from "../verticalDramaExtensionReadService";
import { estimateVerticalDramaSpeechSeconds } from "../../../shared/verticalDramaSeries/dialogueQuality";

describe("projectDramaShotDialogueLinesForExtension", () => {
  it("returns only the requested shot's safe dialogue fields with planned durations", () => {
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 2,
      dialogueAudioPlan: {
        dialogueLines: [
          {
            lineId: "line-1",
            shotNumber: 2,
            speakerName: "ใบข้าว",
            speakerCharacterId: "char-1",
            text: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?",
            start: 0,
            end: 3.2,
            targetDurationSeconds: 3.2,
            voiceId: "private-voice-id",
          },
          {
            lineId: "line-2",
            shotNumber: 3,
            speakerName: "อารมณ์",
            text: "ต้องไม่รั่วไหล",
            targetDurationSeconds: 2,
          },
        ],
      },
      clipDialogue: [{ characterKey: "ใบข้าว", lineTh: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?", emotion: "ลังเล" }],
    });

    expect(lines).toEqual([{
      speaker: "ใบข้าว",
      emotion: "ลังเล",
      text: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?",
      durationSeconds: 3.2,
    }]);
    expect(JSON.stringify(lines)).not.toContain("private-voice-id");
  });

  it("estimates a clip dialogue speaking length from text when no plan exists", () => {
    const lineTh = "หนูไม่ยอมแพ้หรอก";
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 1,
      dialogueAudioPlan: null,
      clipDialogue: [{ characterKey: "ใบข้าว", lineTh, emotion: "เด็ดเดี่ยว" }],
    });
    expect(lines).toEqual([{
      speaker: "ใบข้าว",
      emotion: "เด็ดเดี่ยว",
      text: lineTh,
      durationSeconds: estimateVerticalDramaSpeechSeconds(lineTh),
    }]);
    // The estimate must be a real positive number so the extension shows a
    // speaking length instead of "ยังไม่มีเวลาพูด".
    expect(lines[0].durationSeconds).toBeGreaterThan(0);
  });
});
