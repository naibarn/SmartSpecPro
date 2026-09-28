import { describe, expect, it } from "vitest";

import { VideoProjectDocumentSchema } from "../../../shared/videoIntelligence/projectSchemas";
import { retimeScenesToNarrationAudio } from "../videoProjectNarrationTiming";

function documentWithNarrationDurations() {
  return VideoProjectDocumentSchema.parse({
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 10000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [
      {
        sceneId: "scene-1",
        startMs: 0,
        endMs: 5000,
        narration: "หนึ่ง",
        narrationAudioAssetId: 1,
        narrationAudioDurationMs: 7000,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [{ startMs: 0, endMs: 7000, text: "หนึ่ง" }],
      },
      {
        sceneId: "scene-2",
        startMs: 5000,
        endMs: 10000,
        narration: "สอง",
        narrationAudioAssetId: 2,
        narrationAudioDurationMs: 4000,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [{ startMs: 0, endMs: 4000, text: "สอง" }],
      },
    ],
    audioTracks: [],
    captions: { presetId: "classic_box", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 8, maxLoops: 5 },
  });
}

describe("retimeScenesToNarrationAudio", () => {
  it("extends the long scene and shifts later scenes without changing local cues", () => {
    const result = retimeScenesToNarrationAudio(
      documentWithNarrationDurations()
    );

    expect(result.format.durationMs).toBe(12000);
    expect(result.scenes.map(scene => [scene.startMs, scene.endMs])).toEqual([
      [0, 7000],
      [7000, 12000],
    ]);
    expect(result.scenes[0]?.captionCues).toEqual([
      { startMs: 0, endMs: 7000, text: "หนึ่ง" },
    ]);
  });

  it("returns the same document when no narration needs more time", () => {
    const document = documentWithNarrationDurations();
    const noLongerNarrationDocument = {
      ...document,
      scenes: document.scenes.map(scene => ({
        ...scene,
        narrationAudioDurationMs: scene.sceneId === "scene-1" ? 5000 : 4000,
      })),
    };
    const result = retimeScenesToNarrationAudio(noLongerNarrationDocument);

    expect(result).toBe(noLongerNarrationDocument);
  });
});
