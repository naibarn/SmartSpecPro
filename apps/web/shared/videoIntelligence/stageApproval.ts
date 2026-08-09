import type { VideoProjectDocument } from "./projectSchemas";

/** Shared browser/API gate: an approval requires a complete persisted artifact. */
export function isStageResultReady(
  status: string,
  document: VideoProjectDocument | null | undefined,
): boolean {
  if (!document) return false;
  const scenes = document.scenes ?? [];
  // Brief is an input stage. It has no generated artifact to approve; content
  // draft acceptance is the authoritative review action for this stage.
  if (status === "brief") return false;
  if (scenes.length === 0) return false;
  if (status === "scenes") return scenes.every(scene => Boolean(scene.narration?.trim()));
  if (status === "narration") return scenes.every(scene => scene.narrationAudioAssetId != null);
  if (status === "motion") return scenes.every(scene => scene.visual.kind === "template");
  if (status === "captions") return scenes.every(scene => scene.captionCues.length > 0);
  return false;
}
