/**
 * SmartSpec NLE Standard Project Schema (Version 1.0.0)
 * Standard open project format designed for AI automation and human editing.
 * Compatible with CapCut draft structure and Remotion composition specs.
 */

export type TrackType =
  | "video_main"     // V1: Primary A-Roll video (e.g. talking head, dead-air trimmed)
  | "video_broll"    // V2: B-Roll cutaways, overlays, Picture-in-Picture
  | "code_overlay"   // O1: Dynamic React / CSS / Three.js live visual components
  | "text_subtitle"  // T1: Captions, title hooks, lower thirds
  | "audio_voice"    // A1: Dialogue track (detached or linked)
  | "audio_music"    // A2: Background music with auto-ducking
  | "audio_sfx";     // A3: Sound effects, whooshes, transitions

export interface AudioDuckingConfig {
  enabled: boolean;
  sidechainSourceTrackId: string; // usually track_a1
  attenuationDb: number;          // e.g. -16.0 dB
  thresholdDb: number;            // e.g. -28.0 dB
  attackMs: number;               // e.g. 40 ms
  releaseMs: number;              // e.g. 350 ms
}

export interface Transform2D {
  x: number;          // normalized center X (0.0 - 1.0)
  y: number;          // normalized center Y (0.0 - 1.0)
  scale: number;      // 1.0 = 100%
  rotationDeg?: number;
  opacity: number;    // 0.0 - 1.0
  blendMode?: "normal" | "screen" | "multiply" | "overlay";
}

export interface SubtitleWord {
  word: string;
  startMs: number;
  endMs: number;
}

export type TextPresetStyle =
  | "viral_word_highlight"  // TikTok/Alex Hormozi style (yellow/green accent on current word)
  | "impact_top_hook"       // Bold top banner with drop-shadow
  | "cinematic_lower_third" // Elegant minimalist lower third with bar
  | "neon_cyber_badge"      // Glowing neon box
  | "call_to_action_pill";  // Floating bounce button

export interface NleClip {
  id: string;
  name: string;
  timelineStartMs: number;
  durationMs: number;
  sourceType: "local_file" | "smartaihub_library" | "generated_code" | "text";
  sourcePath?: string;
  sourceUrl?: string;
  trimInMs?: number;
  trimOutMs?: number;
  speed?: number; // 1.0 = normal

  // Video / B-Roll specific
  transform?: Transform2D;
  crop?: {
    ratio: "9:16" | "16:9" | "1:1" | "source";
    focusX: number;
    focusY: number;
  };

  // Audio specific
  volume?: number; // 0.0 - 2.0 (1.0 = 100%)
  fadeInMs?: number;
  fadeOutMs?: number;

  // Code Overlay specific (React / CSS / Three.js)
  codeEngine?: "react_css" | "three_js" | "html_canvas";
  prompt?: string;
  componentCode?: string;
  customCss?: string;

  // Text & Subtitle specific
  text?: string;
  stylePreset?: TextPresetStyle | string;
  words?: SubtitleWord[];
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  textAlign?: "left" | "center" | "right";
  animationEffect?: "none" | "fade" | "pop" | "slide_up" | "typewriter" | "glow_pulse" | "bounce";

  // SVG Vector Graphic specific
  svgContent?: string;
  svgColor?: string;

  // Blur & Privacy Censor specific
  isBlurOverlay?: boolean;
  blurType?: "gaussian" | "mosaic" | "solid_bar";
  blurAmount?: number;
  blurAutoTrack?: "none" | "auto_person" | "auto_product";
  blurWidth?: number;
  blurHeight?: number;
  blurRadius?: number;

  // Compound clip / Nesting
  isCompound?: boolean;
  subClips?: NleClip[];

  // Pan & Zoom / Ken Burns
  kenBurns?: {
    enabled: boolean;
    startScale: number;
    endScale: number;
    panDirection: "left_to_right" | "right_to_left" | "zoom_in" | "zoom_out" | "diagonal_face" | "diagonal_product";
  };
}

export interface NleTrack {
  id: string;
  type: TrackType;
  name: string;
  muted: boolean;
  locked: boolean;
  volume: number; // 0.0 - 2.0
  ducking?: AudioDuckingConfig;
  clips: NleClip[];
}

export interface NleCanvas {
  width: number;
  height: number;
  fps: number;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5" | "21:9" | "custom" | string;
  durationMs: number;
  backgroundColor?: string;
}

export interface ProjectAsset {
  id: string;
  name: string;
  filePath: string;
  mediaType: "video" | "audio" | "image";
  durationMs?: number;
  width?: number;
  height?: number;
  importedAt: string;
}

export interface SmartSpecProjectDraft {
  version: "1.0.0";
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  canvas: NleCanvas;
  tracks: NleTrack[];
  mediaPool?: ProjectAsset[];
  metadata?: {
    author?: string;
    originalSourceVideo?: string;
    deadAirCutCount?: number;
    timeSavedMs?: number;
    aiPlanId?: string;
    transcriptionSummary?: string;
  };
}

/**
 * Creates a default, production-grade project draft from an active video file.
 */
export function createDefaultProjectDraft(options: {
  projectId: string;
  title: string;
  videoPath: string;
  videoDurationMs: number;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "source";
  focusX?: number;
  focusY?: number;
  deadAirSegments?: Array<{ startMs: number; endMs: number }>;
}): SmartSpecProjectDraft {
  const ratio = options.aspectRatio === "16:9" ? "16:9" : options.aspectRatio === "1:1" ? "1:1" : "9:16";
  const width = ratio === "16:9" ? 1920 : ratio === "1:1" ? 1080 : 1080;
  const height = ratio === "16:9" ? 1080 : ratio === "1:1" ? 1080 : 1920;

  // Split Main Video into active speech clips if deadAirSegments are provided
  const mainClips: NleClip[] = [];
  const voiceClips: NleClip[] = [];

  const sorted = (options.deadAirSegments ?? [])
    .filter((seg) => Number.isFinite(seg.startMs) && Number.isFinite(seg.endMs))
    .map((seg) => ({ startMs: Math.max(0, seg.startMs), endMs: Math.min(options.videoDurationMs, seg.endMs) }))
    .filter((seg) => seg.endMs > seg.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .reduce<Array<{ startMs: number; endMs: number }>>((merged, seg) => {
      const last = merged[merged.length - 1];
      if (last && seg.startMs <= last.endMs) last.endMs = Math.max(last.endMs, seg.endMs);
      else merged.push({ ...seg });
      return merged;
    }, []);

  if (sorted.length > 0) {
    let currentIn = 0;
    let timelineOffset = 0;

    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i];
      if (seg.startMs > currentIn + 200) {
        const segDuration = seg.startMs - currentIn;
        const clipId = `v1_clip_${i + 1}`;
        mainClips.push({
          id: clipId,
          name: `Speech Cut #${i + 1}`,
          timelineStartMs: timelineOffset,
          durationMs: segDuration,
          sourceType: "local_file",
          sourcePath: options.videoPath,
          trimInMs: currentIn,
          trimOutMs: seg.startMs,
          volume: 1.0,
          crop: {
            ratio,
            focusX: options.focusX ?? 0.5,
            focusY: options.focusY ?? 0.5,
          },
        });

        voiceClips.push({
          id: `a1_clip_${i + 1}`,
          name: `Voice Audio #${i + 1}`,
          timelineStartMs: timelineOffset,
          durationMs: segDuration,
          sourceType: "local_file",
          sourcePath: options.videoPath,
          trimInMs: currentIn,
          trimOutMs: seg.startMs,
          volume: 1.0,
        });

        timelineOffset += segDuration;
      }
      currentIn = seg.endMs;
    }

    // Trailing speech segment
    if (currentIn < options.videoDurationMs - 200) {
      const segDuration = options.videoDurationMs - currentIn;
      const idx = sorted.length + 1;
      mainClips.push({
        id: `v1_clip_${idx}`,
        name: `Speech Cut #${idx}`,
        timelineStartMs: timelineOffset,
        durationMs: segDuration,
        sourceType: "local_file",
        sourcePath: options.videoPath,
        trimInMs: currentIn,
        trimOutMs: options.videoDurationMs,
        volume: 1.0,
        crop: {
          ratio,
          focusX: options.focusX ?? 0.5,
          focusY: options.focusY ?? 0.5,
        },
      });

      voiceClips.push({
        id: `a1_clip_${idx}`,
        name: `Voice Audio #${idx}`,
        timelineStartMs: timelineOffset,
        durationMs: segDuration,
        sourceType: "local_file",
        sourcePath: options.videoPath,
        trimInMs: currentIn,
        trimOutMs: options.videoDurationMs,
        volume: 1.0,
      });

      timelineOffset += segDuration;
    }
  } else {
    // Single continuous clip
    mainClips.push({
      id: "v1_clip_master",
      name: options.title,
      timelineStartMs: 0,
      durationMs: options.videoDurationMs,
      sourceType: "local_file",
      sourcePath: options.videoPath,
      trimInMs: 0,
      trimOutMs: options.videoDurationMs,
      volume: 1.0,
      crop: {
        ratio,
        focusX: options.focusX ?? 0.5,
        focusY: options.focusY ?? 0.5,
      },
    });

    voiceClips.push({
      id: "a1_clip_master",
      name: `Voice Audio Master`,
      timelineStartMs: 0,
      durationMs: options.videoDurationMs,
      sourceType: "local_file",
      sourcePath: options.videoPath,
      trimInMs: 0,
      trimOutMs: options.videoDurationMs,
      volume: 1.0,
    });
  }

  const effectiveDuration = mainClips.reduce((acc, c) => acc + c.durationMs, 0);

  const tracks: NleTrack[] = [
    {
      id: "track_o1",
      type: "code_overlay",
      name: "O1 Code Overlay (React / Three.js)",
      muted: false,
      locked: false,
      volume: 1.0,
      clips: [],
    },
    {
      id: "track_t1",
      type: "text_subtitle",
      name: "T1 Captions & Text Hooks",
      muted: false,
      locked: false,
      volume: 1.0,
      clips: [],
    },
    {
      id: "track_v2",
      type: "video_broll",
      name: "V2 B-Roll Overlay (Cutaways / PiP)",
      muted: false,
      locked: false,
      volume: 1.0,
      clips: [],
    },
    {
      id: "track_v1",
      type: "video_main",
      name: "V1 Main Video (A-Roll)",
      muted: false,
      locked: false,
      volume: 1.0,
      clips: mainClips,
    },
    {
      id: "track_a1",
      type: "audio_voice",
      name: "A1 Dialogue / Speech",
      muted: false,
      locked: false,
      volume: 1.0,
      clips: voiceClips,
    },
    {
      id: "track_a2",
      type: "audio_music",
      name: "A2 BGM (Auto Ducking)",
      muted: false,
      locked: false,
      volume: 0.35,
      ducking: {
        enabled: true,
        sidechainSourceTrackId: "track_a1",
        attenuationDb: -16.0,
        thresholdDb: -28.0,
        attackMs: 40,
        releaseMs: 350,
      },
      clips: [],
    },
    {
      id: "track_a3",
      type: "audio_sfx",
      name: "A3 Sound FX & Transitions",
      muted: false,
      locked: false,
      volume: 0.8,
      clips: [],
    },
  ];

  return {
    version: "1.0.0",
    projectId: options.projectId,
    title: options.title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canvas: {
      width,
      height,
      fps: 30,
      aspectRatio: ratio,
      durationMs: effectiveDuration,
      backgroundColor: "#000000",
    },
    tracks,
    mediaPool: [
      {
        id: "media_main_source",
        name: options.title || "Main Video Source",
        filePath: options.videoPath,
        mediaType: "video",
        durationMs: options.videoDurationMs,
        importedAt: new Date().toISOString(),
      },
    ],
    metadata: {
      originalSourceVideo: options.videoPath,
      deadAirCutCount: sorted.length,
    },
  };
}

/**
 * CapCut draft structure JSON exporter compatibility helper.
 */
export function exportToCapCutDraftJson(project: SmartSpecProjectDraft): Record<string, unknown> {
  const videos: Array<Record<string, unknown>> = [];
  const audios: Array<Record<string, unknown>> = [];
  const materialIds = new Map<string, string>();
  for (const track of project.tracks) {
    if (!track.type.startsWith("video") && !track.type.startsWith("audio")) {
      if (track.clips.length > 0) throw new Error("CapCut export does not yet support text or code overlays. Save the SmartSpec project to preserve all tracks.");
      continue;
    }
    for (const clip of track.clips) {
      if (clip.isCompound) throw new Error("CapCut export does not yet support compound clips.");
      const path = clip.sourcePath || clip.sourceUrl;
      if (!path || /^(blob:|data:|https?:)/i.test(path)) throw new Error("CapCut export requires persistent media files.");
      const kind = track.type.startsWith("audio") ? "audio" : "video";
      const key = `${kind}:${path}`;
      if (!materialIds.has(key)) {
        const poolAsset = project.mediaPool?.find((asset) => asset.filePath === path);
        const id = `material_${materialIds.size + 1}`;
        materialIds.set(key, id);
        const materials = kind === "audio" ? audios : videos;
        materials.push({ id, path, type: kind === "audio" ? "audio" : poolAsset?.mediaType === "image" ? "image" : "video", duration: (poolAsset?.durationMs ?? clip.trimOutMs ?? ((clip.trimInMs ?? 0) + clip.durationMs * (clip.speed ?? 1))) * 1000 });
      }
    }
  }
  return {
    platform: { app_source: "smartaihub", app_version: "1.0.0", os: "windows" },
    canvas_config: {
      width: project.canvas.width,
      height: project.canvas.height,
      ratio: project.canvas.aspectRatio,
    },
    duration: project.canvas.durationMs * 1000, // microseconds
    materials: { videos, audios },
    tracks: project.tracks.map((track) => ({
      id: track.id,
      type: track.type.startsWith("video") ? "video" : track.type.startsWith("audio") ? "audio" : "effect",
      name: track.name,
      volume: track.volume,
      muted: track.muted,
      segments: track.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        is_compound: clip.isCompound ?? false,
        ken_burns: clip.kenBurns?.enabled ? clip.kenBurns : undefined,
        target_timerange: {
          start: clip.timelineStartMs * 1000,
          duration: clip.durationMs * 1000,
        },
        source_timerange: {
          start: (clip.trimInMs ?? 0) * 1000,
          duration: clip.durationMs * (clip.speed ?? 1) * 1000,
        },
        speed: clip.speed ?? 1,
        volume: clip.volume ?? 1,
        material_id: materialIds.get(`${track.type.startsWith("audio") ? "audio" : "video"}:${clip.sourcePath || clip.sourceUrl}`),
      })),
    })),
  };
}
