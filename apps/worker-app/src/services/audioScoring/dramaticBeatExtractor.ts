import type { ShotAudioIntent } from "../../types/audioScoring";

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
  _shots: ScriptShotInput[],
): ShotAudioIntent[] {
  throw new Error(
    "SKILL_UNAVAILABLE: emotional interpretation must come from the approved Feature 176 application skill.",
  );
}
