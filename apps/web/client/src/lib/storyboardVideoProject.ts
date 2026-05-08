import {
  addAssetToProject,
  addClipToTrack,
  calculateProjectDuration,
  createEmptyProject,
  findTrackByType,
  generateId,
  type VideoEditorProject,
  type MediaLibraryAsset,
} from "@/types/videoEditor";

export interface StoryboardClipCandidate {
  id: string;
  prompt: string;
  url: string;
  model?: string;
  durationSeconds?: number;
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
}

export interface BuildStoryboardProjectOptions {
  projectName?: string;
  defaultDurationSeconds?: number;
  companionAudio?: StoryboardCompanionAudioCandidate[];
  muteVideoClipAudio?: boolean;
}

function inferFormatFromUrl(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() || "mp4";
}

function applyStoryboardAspectRatio(project: VideoEditorProject, ratio?: string): void {
  const normalizedRatio = ratio?.trim().toLowerCase();
  if (!normalizedRatio || normalizedRatio === "auto") {
    return;
  }

  const match = normalizedRatio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) {
    return;
  }

  const ratioWidth = Number.parseFloat(match[1] ?? "");
  const ratioHeight = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) {
    return;
  }

  const longEdge = 1920;
  if (ratioWidth >= ratioHeight) {
    project.settings.width = longEdge;
    project.settings.height = Math.max(1, Math.round((longEdge * ratioHeight) / ratioWidth));
  } else {
    project.settings.height = longEdge;
    project.settings.width = Math.max(1, Math.round((longEdge * ratioWidth) / ratioHeight));
  }
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
  applyStoryboardAspectRatio(
    project,
    completed.find((clip) => clip.generationAspectRatio?.trim())?.generationAspectRatio,
  );
  const videoTrack = findTrackByType(project.timeline, "video");
  if (!videoTrack) {
    return null;
  }

  const groupId = generateId("compound");
  const fallbackDuration = Math.max(0.25, options.defaultDurationSeconds || 5);
  let cursor = 0;

  for (let index = 0; index < completed.length; index += 1) {
    const clipSource = completed[index];
    const duration = typeof clipSource.durationSeconds === "number" && Number.isFinite(clipSource.durationSeconds) && clipSource.durationSeconds > 0
      ? Math.max(0.25, clipSource.durationSeconds)
      : inferStoryboardDurationSeconds(clipSource.prompt, fallbackDuration);
    const mediaAsset: MediaLibraryAsset = {
      id: `storyboard-${clipSource.id}`,
      type: "video",
      title: clipSource.prompt.trim().slice(0, 60) || `Clip ${index + 1}`,
      thumbnailUrl: clipSource.url,
      duration,
      url: clipSource.url,
      model: clipSource.model || "",
      createdAt: new Date(clipSource.createdAt || Date.now()),
      format: inferFormatFromUrl(clipSource.url),
      generationPrompt: clipSource.prompt,
      referenceUrls: clipSource.referenceUrls,
      generationModelId: clipSource.generationModelId || clipSource.model,
      generationAspectRatio: clipSource.generationAspectRatio,
      generationExtraParams: clipSource.generationExtraParams,
    };

    const asset = addAssetToProject(project, mediaAsset, clipSource.url);
    const clip = addClipToTrack(videoTrack, asset, cursor);
    clip.groupId = groupId;
    clip.duration = duration;
    clip.trimOut = duration;
    if (options.muteVideoClipAudio) {
      clip.volume = 0;
    }
    cursor += duration;
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
