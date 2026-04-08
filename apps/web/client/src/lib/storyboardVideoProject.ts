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
  createdAt?: string;
}

export interface BuildStoryboardProjectOptions {
  projectName?: string;
  defaultDurationSeconds?: number;
}

function inferFormatFromUrl(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() || "mp4";
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
  const videoTrack = findTrackByType(project.timeline, "video");
  if (!videoTrack) {
    return null;
  }

  const groupId = generateId("compound");
  const fallbackDuration = Math.max(0.25, options.defaultDurationSeconds || 5);
  let cursor = 0;

  for (let index = 0; index < completed.length; index += 1) {
    const clipSource = completed[index];
    const duration = inferStoryboardDurationSeconds(clipSource.prompt, fallbackDuration);
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
    };

    const asset = addAssetToProject(project, mediaAsset, clipSource.url);
    const clip = addClipToTrack(videoTrack, asset, cursor);
    clip.groupId = groupId;
    clip.duration = duration;
    clip.trimOut = duration;
    cursor += duration;
  }

  project.settings.duration = calculateProjectDuration(project.timeline);
  project.modifiedAt = new Date().toISOString();
  return project;
}
