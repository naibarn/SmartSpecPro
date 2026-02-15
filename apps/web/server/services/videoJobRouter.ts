import type { VideoEditorProject } from "../../client/src/types/videoEditor";

/**
 * Determine which Cloud Tasks queue to route a video render job to.
 *
 * Routing rules:
 * - video-jobs-short (2 vCPU, 8 GiB): total input duration < 2 minutes AND
 *   no V2/T1 overlay content
 * - video-jobs-long (4 vCPU, 16 GiB): everything else
 */
export function routeVideoJob(
  project: VideoEditorProject,
): "video-jobs-short" | "video-jobs-long" {
  const tracks = project.timeline.tracks;

  // Calculate total V1 input duration
  let totalDuration = 0;
  let hasOverlays = false;

  for (const track of tracks) {
    if (track.type === "video" && track.name === "V1") {
      for (const clip of track.clips) {
        totalDuration += clip.duration;
      }
    }
    if (
      (track.type === "overlay" || track.name === "V2") &&
      track.clips.length > 0
    ) {
      hasOverlays = true;
    }
    if (
      (track.type === "text" || track.name === "T1") &&
      track.clips.length > 0
    ) {
      hasOverlays = true;
    }
  }

  // Short queue: < 2 minutes AND no overlays/text
  if (totalDuration < 120 && !hasOverlays) {
    return "video-jobs-short";
  }

  return "video-jobs-long";
}
