import type { ShotAudioIntent, DramaGenre } from "../../types/audioScoring";

export interface ScriptShotInput {
  shotIndex: number;
  description: string;
  dialogue?: string;
  durationSeconds: number;
}

/**
 * Dramatic Beat Extractor
 * Analyzes video script/storyboard shot lines and extracts continuous emotional vectors.
 */
export function extractDramaticBeats(
  shots: ScriptShotInput[],
  genre: DramaGenre = "romance_ceo"
): ShotAudioIntent[] {
  let accumulatedMs = 0;

  return shots.map((shot, idx) => {
    const startMs = accumulatedMs;
    const durMs = Math.round(shot.durationSeconds * 1000);
    const endMs = startMs + durMs;
    accumulatedMs = endMs;

    const desc = (shot.description || "").toLowerCase();
    const dial = (shot.dialogue || "").toLowerCase();
    const hasDialogue = Boolean(shot.dialogue && shot.dialogue.trim().length > 0);

    // Emotion vector classifier based on semantic cues & genre
    let emotionalTone: ShotAudioIntent["emotionalTone"] = "neutral";
    let targetBgmVolume = 0.35;
    let suggestedBgmAction: ShotAudioIntent["suggestedBgmAction"] = "continue";

    if (desc.includes("climax") || desc.includes("shock") || desc.includes("reveal") || desc.includes("ระเบิด") || desc.includes("กระแทก")) {
      emotionalTone = "climax";
      targetBgmVolume = 0.65;
      suggestedBgmAction = "swell";
    } else if (desc.includes("chase") || desc.includes("fight") || desc.includes("run") || desc.includes("วิ่ง") || desc.includes("ต่อสู้")) {
      emotionalTone = "action";
      targetBgmVolume = 0.6;
      suggestedBgmAction = "continue";
    } else if (desc.includes("danger") || desc.includes("threat") || desc.includes("stalk") || desc.includes("จ้อง") || desc.includes("สงสัย")) {
      emotionalTone = "tension";
      targetBgmVolume = 0.45;
      suggestedBgmAction = "continue";
    } else if (desc.includes("cry") || desc.includes("tear") || desc.includes("heartbreak") || desc.includes("เลิก") || desc.includes("สูญเสีย")) {
      emotionalTone = "heartbreak";
      targetBgmVolume = 0.4;
      suggestedBgmAction = "continue";
    } else if (desc.includes("love") || desc.includes("kiss") || desc.includes("hold") || desc.includes("รัก") || desc.includes("กอด") || desc.includes("ยิ้ม")) {
      emotionalTone = "tender";
      targetBgmVolume = 0.4;
      suggestedBgmAction = "continue";
    }

    // Dialogue Presence dictates ducking priority
    if (hasDialogue) {
      suggestedBgmAction = "duck";
      targetBgmVolume = Math.min(targetBgmVolume, 0.25);
    }

    return {
      shotIndex: shot.shotIndex ?? (idx + 1),
      startMs,
      endMs,
      dialoguePresent: hasDialogue,
      emotionalTone,
      suggestedBgmAction,
      targetBgmVolume,
    };
  });
}
