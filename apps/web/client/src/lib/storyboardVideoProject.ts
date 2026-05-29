import {
  addAssetToProject,
  addClipToTrack,
  calculateProjectDuration,
  createEmptyProject,
  findTrackByType,
  generateId,
  type VideoEditorProject,
  type MediaLibraryAsset,
  type ClipTransition,
  type TransitionName,
} from "@/types/videoEditor";

export type StoryboardClipMediaType = "video" | "image";
export type StoryboardClipTransition = ClipTransition;
export type StoryboardClipTransitionName = TransitionName;

export const STORYBOARD_DEFAULT_TRANSITION_DURATION_MS = 500;

export const STORYBOARD_RENDER_TRANSITION_OPTIONS: Array<{
  name: StoryboardClipTransitionName;
  labelEn: string;
  labelTh: string;
}> = [
  { name: "none", labelEn: "Cut", labelTh: "ตัดตรง" },
  { name: "crossfade", labelEn: "Crossfade", labelTh: "ค่อย ๆ ซ้อนภาพ" },
  { name: "wipeLeft", labelEn: "Wipe left", labelTh: "ปาดซ้าย" },
  { name: "wipeRight", labelEn: "Wipe right", labelTh: "ปาดขวา" },
  { name: "wipeUp", labelEn: "Wipe up", labelTh: "ปาดขึ้น" },
  { name: "wipeDown", labelEn: "Wipe down", labelTh: "ปาดลง" },
  { name: "slideLeft", labelEn: "Slide left", labelTh: "เลื่อนซ้าย" },
  { name: "slideRight", labelEn: "Slide right", labelTh: "เลื่อนขวา" },
  { name: "slideUp", labelEn: "Slide up", labelTh: "เลื่อนขึ้น" },
  { name: "slideDown", labelEn: "Slide down", labelTh: "เลื่อนลง" },
  { name: "zoomIn", labelEn: "Zoom in", labelTh: "ซูมเข้า" },
  { name: "zoomOut", labelEn: "Zoom out", labelTh: "ซูมออก" },
  { name: "circleOpen", labelEn: "Circle open", labelTh: "วงกลมเปิด" },
  { name: "circleClose", labelEn: "Circle close", labelTh: "วงกลมปิด" },
  { name: "diamondOpen", labelEn: "Diamond", labelTh: "ไดมอนด์" },
  { name: "blur", labelEn: "Blur", labelTh: "เบลอ" },
  { name: "pixelize", labelEn: "Pixelize", labelTh: "พิกเซล" },
  { name: "radial", labelEn: "Radial", labelTh: "เรเดียล" },
  { name: "smoothLeft", labelEn: "Smooth left", labelTh: "สมูธซ้าย" },
  { name: "smoothRight", labelEn: "Smooth right", labelTh: "สมูธขวา" },
];

const STORYBOARD_RENDER_TRANSITION_NAMES = new Set<StoryboardClipTransitionName>(
  STORYBOARD_RENDER_TRANSITION_OPTIONS.map((option) => option.name),
);

export interface StoryboardClipCandidate {
  id: string;
  prompt: string;
  url: string;
  model?: string;
  durationSeconds?: number;
  mediaType?: StoryboardClipMediaType;
  transition?: StoryboardClipTransition;
  generationModelId?: string;
  referenceUrls?: string[];
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
  createdAt?: string;
}

export interface StoryboardCompanionAudioCandidate {
  id: string;
  url: string;
  title: string;
  prompt: string;
  model?: string;
  kind: "voiceover" | "music";
  startTimeSeconds?: number;
  segmentIndex?: number;
  segmentCount?: number;
  actualDurationSeconds?: number;
  targetDurationSeconds?: number;
  volume?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface BuildStoryboardProjectOptions {
  projectName?: string;
  defaultDurationSeconds?: number;
  companionAudio?: StoryboardCompanionAudioCandidate[];
  muteVideoClipAudio?: boolean;
  removeDuplicateBoundaryFrames?: boolean;
  outputAspectRatio?: StoryboardRenderAspectRatioMode;
}

export type StoryboardRenderAspectRatioMode = "auto" | "9:16" | "16:9";

export interface StoryboardRenderAspectRatioDecision {
  mode: Exclude<StoryboardRenderAspectRatioMode, "auto">;
  source: "selected-clips" | "fallback";
  verticalCount: number;
  horizontalCount: number;
}

function inferFormatFromUrl(url: string): string {
  const dataUrlMatch = url.match(/^data:([^;,]+)[;,]/i);
  if (dataUrlMatch?.[1]) {
    const mime = dataUrlMatch[1].toLowerCase();
    if (mime === "image/jpeg") return "jpg";
    const subtype = mime.split("/")[1];
    if (subtype) return subtype.replace("x-", "");
  }
  const match = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() || "mp4";
}

function inferStoryboardClipMediaType(url: string, explicitType?: StoryboardClipMediaType): StoryboardClipMediaType {
  if (explicitType === "image" || explicitType === "video") return explicitType;
  const normalized = url.split("?", 1)[0]?.toLowerCase() ?? "";
  if (
    url.startsWith("data:image/")
    || /\.(jpg|jpeg|png|webp|gif|avif|bmp|tiff|svg)$/i.test(normalized)
  ) {
    return "image";
  }
  return "video";
}

export function normalizeStoryboardClipTransition(value: unknown): StoryboardClipTransition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<StoryboardClipTransition>;
  const name = record.name;
  if (!name || !STORYBOARD_RENDER_TRANSITION_NAMES.has(name) || name === "none") {
    return undefined;
  }
  const durationMs = typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
    ? Math.round(record.durationMs)
    : STORYBOARD_DEFAULT_TRANSITION_DURATION_MS;
  return {
    name,
    durationMs: Math.min(2000, Math.max(200, durationMs)),
    alignment: record.alignment === "start" || record.alignment === "end" || record.alignment === "center"
      ? record.alignment
      : "center",
  };
}

export function getStoryboardRenderResolution(ratio: Exclude<StoryboardRenderAspectRatioMode, "auto">): { width: number; height: number } {
  return ratio === "9:16"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

function applyStoryboardAspectRatio(project: VideoEditorProject, ratio?: StoryboardRenderAspectRatioMode | string): void {
  const normalizedRatio = normalizeStoryboardOutputAspectRatio(ratio);
  if (!normalizedRatio) {
    return;
  }

  const resolution = getStoryboardRenderResolution(normalizedRatio);
  project.settings.width = resolution.width;
  project.settings.height = resolution.height;
}

function normalizeStoryboardAspectRatio(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") return null;
  if (normalized.includes("portrait") || normalized.includes("vertical") || normalized.includes("แนวตั้ง")) {
    return "9:16";
  }
  if (normalized.includes("landscape") || normalized.includes("horizontal") || normalized.includes("แนวนอน")) {
    return "16:9";
  }

  const dimensionMatch = normalized.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/);
  if (dimensionMatch) {
    const width = Number.parseFloat(dimensionMatch[1] ?? "");
    const height = Number.parseFloat(dimensionMatch[2] ?? "");
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width <= height ? "9:16" : "16:9";
    }
  }

  const ratioMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    return `${ratioMatch[1]}:${ratioMatch[2]}`;
  }
  return null;
}

function normalizeStoryboardOutputAspectRatio(value: unknown): Exclude<StoryboardRenderAspectRatioMode, "auto"> | null {
  const normalized = normalizeStoryboardAspectRatio(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const ratioWidth = Number.parseFloat(match[1] ?? "");
  const ratioHeight = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) {
    return null;
  }
  return ratioWidth <= ratioHeight ? "9:16" : "16:9";
}

function inferAspectRatioFromExtraParams(extraParams?: Record<string, unknown>): string | null {
  if (!extraParams) return null;
  for (const key of [
    "aspectRatio",
    "aspect_ratio",
    "ratio",
    "resolution",
    "size",
    "imageSize",
    "image_size",
    "videoSize",
    "video_size",
  ]) {
    const inferred = normalizeStoryboardAspectRatio(extraParams[key]);
    if (inferred) return inferred;
  }
  return null;
}

function inferStoryboardProjectAspectRatio(clips: StoryboardClipCandidate[]): string | undefined {
  for (const clip of clips) {
    const inferred =
      normalizeStoryboardAspectRatio(clip.generationAspectRatio)
      ?? inferAspectRatioFromExtraParams(clip.generationExtraParams)
      ?? normalizeStoryboardAspectRatio(clip.prompt);
    if (inferred) return inferred;
  }
  return undefined;
}

export function inferStoryboardRenderAspectRatio(clips: StoryboardClipCandidate[]): StoryboardRenderAspectRatioDecision {
  let verticalCount = 0;
  let horizontalCount = 0;
  let firstInferred: Exclude<StoryboardRenderAspectRatioMode, "auto"> | null = null;

  for (const clip of clips) {
    const inferred = normalizeStoryboardOutputAspectRatio(clip.generationAspectRatio)
      ?? normalizeStoryboardOutputAspectRatio(inferAspectRatioFromExtraParams(clip.generationExtraParams))
      ?? normalizeStoryboardOutputAspectRatio(clip.prompt);
    if (!inferred) continue;
    firstInferred ??= inferred;
    if (inferred === "9:16") {
      verticalCount += 1;
    } else {
      horizontalCount += 1;
    }
  }

  if (verticalCount === 0 && horizontalCount === 0) {
    return { mode: "9:16", source: "fallback", verticalCount, horizontalCount };
  }
  if (verticalCount === horizontalCount && firstInferred) {
    return { mode: firstInferred, source: "selected-clips", verticalCount, horizontalCount };
  }
  return {
    mode: verticalCount > horizontalCount ? "9:16" : "16:9",
    source: "selected-clips",
    verticalCount,
    horizontalCount,
  };
}

function clampAudioPlaybackRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(2, Math.max(0.5, value));
}

function inferAudioFormat(url: string): string {
  const format = inferFormatFromUrl(url);
  if (format === "mpeg") return "mp3";
  return format || "mp3";
}

export function inferStoryboardDurationSeconds(prompt: string, fallbackSeconds: number): number {
  const match = prompt.match(/(\d+(?:\.\d+)?)\s*seconds?/i);
  const parsed = match ? Number.parseFloat(match[1]) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(0.25, parsed);
  }
  return Math.max(0.25, fallbackSeconds);
}

function normalizeReferenceUrl(url: unknown): string {
  return String(url || "").trim();
}

function hasDuplicateFirstLastFrameBoundary(
  current: StoryboardClipCandidate,
  next: StoryboardClipCandidate | undefined,
): boolean {
  if (!next) return false;
  const currentEndFrame = normalizeReferenceUrl(current.referenceUrls?.[1]);
  const nextStartFrame = normalizeReferenceUrl(next.referenceUrls?.[0]);
  return currentEndFrame.length > 0 && currentEndFrame === nextStartFrame;
}

export function buildStoryboardVideoProject(
  clips: StoryboardClipCandidate[],
  options: BuildStoryboardProjectOptions = {},
): VideoEditorProject | null {
  const completed = clips.filter((clip) => clip.url.trim().length > 0);
  if (completed.length === 0) {
    return null;
  }

  const project = createEmptyProject(
    options.projectName?.trim() || `Storyboard Edit ${new Date().toLocaleString()}`,
  );
  const outputAspectRatio = options.outputAspectRatio && options.outputAspectRatio !== "auto"
    ? options.outputAspectRatio
    : inferStoryboardRenderAspectRatio(completed).mode;
  applyStoryboardAspectRatio(project, outputAspectRatio ?? inferStoryboardProjectAspectRatio(completed));
  const videoTrack = findTrackByType(project.timeline, "video");
  if (!videoTrack) {
    return null;
  }

  const groupId = generateId("compound");
  const fallbackDuration = Math.max(0.25, options.defaultDurationSeconds || 5);
  const shouldRemoveDuplicateBoundaryFrames = options.removeDuplicateBoundaryFrames !== false;
  const boundaryFrameDuration = project.settings.fps > 0 ? 1 / project.settings.fps : 1 / 30;
  let cursor = 0;
  let previousVisibleDuration = 0;

  for (let index = 0; index < completed.length; index += 1) {
    const clipSource = completed[index];
    const nextClipSource = completed[index + 1];
    const duration = typeof clipSource.durationSeconds === "number" && Number.isFinite(clipSource.durationSeconds) && clipSource.durationSeconds > 0
      ? Math.max(0.25, clipSource.durationSeconds)
      : inferStoryboardDurationSeconds(clipSource.prompt, fallbackDuration);
    const boundaryTrim = shouldRemoveDuplicateBoundaryFrames && hasDuplicateFirstLastFrameBoundary(clipSource, nextClipSource)
      ? Math.min(boundaryFrameDuration, Math.max(0, duration - 0.25))
      : 0;
    const visibleDuration = duration - boundaryTrim;
    const mediaType = inferStoryboardClipMediaType(clipSource.url, clipSource.mediaType);
    const transition = index > 0 ? normalizeStoryboardClipTransition(clipSource.transition) : undefined;
    const transitionSeconds = transition
      ? Math.min(transition.durationMs / 1000, visibleDuration, previousVisibleDuration)
      : 0;
    const clipStartTime = Math.max(0, cursor - transitionSeconds);
    const inferredFormat = inferFormatFromUrl(clipSource.url);
    const mediaAsset: MediaLibraryAsset = {
      id: `storyboard-${clipSource.id}`,
      type: mediaType,
      title: clipSource.prompt.trim().slice(0, 60) || `Clip ${index + 1}`,
      thumbnailUrl: clipSource.url,
      duration,
      url: clipSource.url,
      model: clipSource.model || "",
      createdAt: new Date(clipSource.createdAt || Date.now()),
      format: mediaType === "image" && inferredFormat === "mp4" ? "jpg" : inferredFormat,
      generationPrompt: clipSource.prompt,
      referenceUrls: clipSource.referenceUrls,
      generationModelId: clipSource.generationModelId || clipSource.model,
      generationAspectRatio: clipSource.generationAspectRatio,
      generationExtraParams: clipSource.generationExtraParams,
    };

    const asset = addAssetToProject(project, mediaAsset, clipSource.url);
    const clip = addClipToTrack(videoTrack, asset, clipStartTime);
    clip.groupId = groupId;
    clip.duration = visibleDuration;
    clip.trimOut = visibleDuration;
    if (boundaryTrim > 0) {
      clip.duplicateBoundaryFrameTrim = {
        frameCount: 1,
        seconds: boundaryTrim,
        fps: project.settings.fps || 30,
        reason: "matching_first_last_frame_boundary",
      };
    }
    if (options.muteVideoClipAudio) {
      clip.volume = 0;
    }
    if (transition) {
      clip.inTransition = transition;
    }
    cursor = clipStartTime + visibleDuration;
    previousVisibleDuration = visibleDuration;
  }

  const audioTrack = findTrackByType(project.timeline, "audio");
  const targetProjectDuration = cursor;
  if (audioTrack && options.companionAudio?.length) {
    for (const audioSource of options.companionAudio) {
      const targetDuration = Math.max(
        0.25,
        audioSource.targetDurationSeconds || targetProjectDuration || fallbackDuration,
      );
      const actualDuration = Math.max(
        0.25,
        audioSource.actualDurationSeconds || targetDuration,
      );
      const playbackRate = audioSource.kind === "voiceover"
        ? clampAudioPlaybackRate(actualDuration / targetDuration)
        : 1;
      const visibleDuration = audioSource.kind === "voiceover"
        ? Math.max(0.25, actualDuration / playbackRate)
        : targetDuration;

      const mediaAsset: MediaLibraryAsset = {
        id: `storyboard-audio-${audioSource.id}`,
        type: "audio",
        title: audioSource.title,
        thumbnailUrl: "",
        duration: actualDuration,
        url: audioSource.url,
        model: audioSource.model || "",
        createdAt: new Date(),
        format: inferAudioFormat(audioSource.url),
        generationPrompt: audioSource.prompt,
        generationModelId: audioSource.model,
        generationExtraParams: {
          kind: audioSource.kind,
          targetDurationSeconds: targetDuration,
          actualDurationSeconds: actualDuration,
          playbackRate,
          volume: audioSource.volume ?? (audioSource.kind === "music" ? 0.18 : 1),
        },
      };

      const asset = addAssetToProject(project, mediaAsset, audioSource.url);
      const clip = addClipToTrack(audioTrack, asset, Math.max(0, audioSource.startTimeSeconds ?? 0));
      clip.groupId = groupId;
      clip.duration = visibleDuration;
      clip.trimOut = actualDuration;
      clip.speed = playbackRate;
      clip.volume = audioSource.volume ?? (audioSource.kind === "music" ? 0.18 : 1);
    }
  }

  project.settings.duration = calculateProjectDuration(project.timeline);
  project.modifiedAt = new Date().toISOString();
  return project;
}
