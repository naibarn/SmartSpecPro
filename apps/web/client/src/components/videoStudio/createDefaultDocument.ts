/**
 * Pure helper that builds a minimal, schema-valid `VideoProjectDocument`
 * (Feature 133, section-08) for the workspace page's "initialize document"
 * flow — a fresh project row from `videoProjects.create` has `document:
 * null` (section-05's `video_projects.document` column is nullable), and
 * `VideoProjectDocumentSchema.scenes` requires at least one scene, so a
 * blank/`saveDocument`-less project has nothing to compile or preview yet.
 *
 * The single default scene uses `visual: { kind: "layers" }` with an empty
 * `layers` array — the compiler (`server/services/videoProjectCompiler.ts`)
 * treats that as a valid, visually-blank scene (no `VI_TEMPLATE_UNKNOWN`
 * risk from guessing an opinionated starter template/duration-bounds
 * combination). The Motion stage panel is where the user assigns a real
 * Motion Template afterward.
 */
import type {
  PlatformPreset,
  VideoProjectDocument,
} from "@shared/videoIntelligence/projectSchemas";

const PLATFORM_FORMAT: Record<
  PlatformPreset,
  { width: number; height: number; fps: number }
> = {
  tiktok_9_16: { width: 1080, height: 1920, fps: 30 },
  reels_9_16: { width: 1080, height: 1920, fps: 30 },
  youtube_16_9: { width: 1920, height: 1080, fps: 30 },
  square_1_1: { width: 1080, height: 1080, fps: 30 },
};

export const DEFAULT_SCENE_DURATION_MS = 8000;

export function createDefaultDocument(options: {
  platformPreset?: PlatformPreset;
  language?: string;
  topic?: string;
}): VideoProjectDocument {
  const platformPreset = options.platformPreset ?? "tiktok_9_16";
  const language = options.language?.trim() || "th";
  const format = PLATFORM_FORMAT[platformPreset];

  return {
    schemaVersion: 1,
    format: {
      width: format.width,
      height: format.height,
      fps: format.fps,
      durationMs: DEFAULT_SCENE_DURATION_MS,
    },
    content: {
      topic: options.topic?.trim() || undefined,
      language,
      platformPreset,
    },
    brandKitId: null,
    scenes: [
      {
        sceneId: "scene-1",
        startMs: 0,
        endMs: DEFAULT_SCENE_DURATION_MS,
        narration: null,
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ],
    audioTracks: [],
    captions: {
      presetId: "classic_box",
      burnIn: false,
      language,
    },
    claims: [],
    qa: { targetScore: 8, maxLoops: 2 },
  };
}
