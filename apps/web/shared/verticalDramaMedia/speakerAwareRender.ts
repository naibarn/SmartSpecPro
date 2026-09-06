import type { ComposedEditMap, EditMapRange } from "./speakerAwareContracts";
import { composedEditMapSchema } from "./speakerAwareContracts";

export type FfmpegSegmentPlan = {
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  filters: string[];
  reasons: EditMapRange["reasons"];
};

export type RemotionTimelineItem = {
  sourceStartMs: number;
  sourceEndMs: number;
  fromFrame: number;
  durationInFrames: number;
  outputStartMs: number;
};

export function compileFfmpegSegmentPlan(mapInput: ComposedEditMap, fps = 30): FfmpegSegmentPlan[] {
  const map = composedEditMapSchema.parse(mapInput);
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) throw new Error("invalid render fps");
  return map.ranges.filter((range) => range.decision === "keep" && range.sourceEndMs > range.sourceStartMs).map((range) => ({
    sourceStartMs: range.sourceStartMs,
    sourceEndMs: range.sourceEndMs,
    outputStartMs: range.outputStartMs,
    outputEndMs: range.outputEndMs,
    filters: [`trim=start=${(range.sourceStartMs / 1000).toFixed(3)}:end=${(range.sourceEndMs / 1000).toFixed(3)}`, "setpts=PTS-STARTPTS"],
    reasons: range.reasons,
  }));
}

export function compileRemotionTimeline(mapInput: ComposedEditMap, fps = 30): RemotionTimelineItem[] {
  const map = composedEditMapSchema.parse(mapInput);
  return map.ranges.filter((range) => range.decision === "keep" && range.sourceEndMs > range.sourceStartMs).map((range) => ({
    sourceStartMs: range.sourceStartMs,
    sourceEndMs: range.sourceEndMs,
    fromFrame: Math.round(range.sourceStartMs / 1000 * fps),
    durationInFrames: Math.max(1, Math.round((range.sourceEndMs - range.sourceStartMs) / 1000 * fps)),
    outputStartMs: range.outputStartMs,
  }));
}

export function assertRenderMapParity(mapInput: ComposedEditMap, fps = 30): string {
  const ffmpeg = compileFfmpegSegmentPlan(mapInput, fps).map((item) => [item.sourceStartMs, item.sourceEndMs, item.outputStartMs, item.outputEndMs]);
  const remotion = compileRemotionTimeline(mapInput, fps).map((item) => [item.sourceStartMs, item.sourceEndMs, item.outputStartMs, item.outputStartMs + Math.round(item.durationInFrames / fps * 1000)]);
  if (JSON.stringify(ffmpeg) !== JSON.stringify(remotion)) throw new Error("render_contract_mismatch: FFmpeg and Remotion edit maps differ");
  return mapInput.mapRevision;
}
