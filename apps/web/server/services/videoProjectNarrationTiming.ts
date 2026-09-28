import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

/**
 * Keeps the authoring timeline long enough for generated narration.
 *
 * Scene layers and caption cues are scene-relative, so extending a scene only
 * needs to move the absolute boundaries of that scene and every later scene.
 * We deliberately never shrink a planned scene here: a shorter recording can
 * represent intentional visual breathing room, while a longer recording must
 * not be clipped or overlap the next scene.
 */
export function retimeScenesToNarrationAudio(
  document: VideoProjectDocument
): VideoProjectDocument {
  let accumulatedShiftMs = 0;
  let changed = false;

  const scenes = document.scenes.map(scene => {
    const originalDurationMs = Math.max(1, scene.endMs - scene.startMs);
    const startMs = scene.startMs + accumulatedShiftMs;
    const plannedEndMs = scene.endMs + accumulatedShiftMs;
    const narrationDurationMs = scene.narrationAudioDurationMs ?? 0;
    const extensionMs = Math.max(0, narrationDurationMs - originalDurationMs);
    if (extensionMs > 0) {
      accumulatedShiftMs += extensionMs;
      changed = true;
    }

    return {
      ...scene,
      startMs,
      endMs: plannedEndMs + extensionMs,
    };
  });

  if (!changed) return document;

  const lastSceneEndMs = scenes.reduce(
    (maxEndMs, scene) => Math.max(maxEndMs, scene.endMs),
    0
  );

  return {
    ...document,
    format: {
      ...document.format,
      durationMs: Math.max(
        document.format.durationMs + accumulatedShiftMs,
        lastSceneEndMs
      ),
    },
    scenes,
  };
}
