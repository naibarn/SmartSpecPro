import { TRPCError } from "@trpc/server";
import { shotBrollBindingSchema, sourceMediaSegmentSchema, type ShotBrollBinding, type SourceMediaSegment } from "@shared/verticalDramaSeries/visualSource";
import { VerticalDramaArtifactAssuranceLineageSchema } from "@shared/verticalDramaSeries/assurance";

export type { ShotBrollBinding } from "@shared/verticalDramaSeries/visualSource";

/** Parse the JSON boundary and validate optional Feature 157 lineage once. */
export function parseShotBrollBinding(input: unknown): ShotBrollBinding {
  const parsed = shotBrollBindingSchema.parse(input);
  const { assuranceLineage: rawLineage, ...baseBinding } = parsed;
  return rawLineage === undefined
    ? baseBinding
    : { ...baseBinding, assuranceLineage: VerticalDramaArtifactAssuranceLineageSchema.parse(rawLineage) };
}

const TIMELINE_EPSILON = 1e-6;

export interface BrollPlacementInput {
  bindingId: string | number;
  shotNumber: number;
  order: number;
  mediaType: "image" | "video";
  inSeconds?: number | null;
  outSeconds?: number | null;
  displayDurationSeconds?: number | null;
  [key: string]: unknown;
}

export interface BrollTimelineClip {
  clipNumber: number;
  durationSeconds: number;
  sourceShotNumbers?: number[];
  parentShotNumber?: number;
}

export interface ProjectedBrollPlacement<T extends BrollPlacementInput = BrollPlacementInput> extends BrollPlacementInput {
  source: T;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

/**
 * Resolve B-roll order into an absolute destination window on the assembled
 * episode timeline. Source in/out points remain source-media coordinates;
 * start/end are destination coordinates. The projection uses probed clip
 * durations and groups all clips contributing to a logical shot, so split
 * shots and consolidated clips remain deterministic.
 */
export function projectBrollPlacements<T extends BrollPlacementInput>(
  bindings: readonly T[],
  clips: readonly BrollTimelineClip[],
  maxDurationSeconds?: number,
): { items: ProjectedBrollPlacement<T>[]; errors: string[]; totalDurationSeconds: number } {
  const errors: string[] = [];
  const shotWindows = new Map<number, { start: number; end: number }>();
  let cursor = 0;
  for (const clip of clips) {
    const duration = Number(clip.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`clip_duration_invalid:${clip.clipNumber}`);
      continue;
    }
    const sourceShots = clip.sourceShotNumbers?.length
      ? clip.sourceShotNumbers
      : [clip.parentShotNumber ?? clip.clipNumber];
    const end = cursor + duration;
    for (const shotNumber of sourceShots) {
      const existing = shotWindows.get(shotNumber);
      shotWindows.set(shotNumber, {
        start: existing ? Math.min(existing.start, cursor) : cursor,
        end: existing ? Math.max(existing.end, end) : end,
      });
    }
    cursor = end;
  }

  const ordered = [...bindings].sort(
    (a, b) => a.shotNumber - b.shotNumber || a.order - b.order || String(a.bindingId).localeCompare(String(b.bindingId)),
  );
  const nextStartByShot = new Map<number, number>();
  const items: ProjectedBrollPlacement<T>[] = [];
  for (const binding of ordered) {
    const sourceDuration = binding.mediaType === "video"
      ? (binding.outSeconds ?? 0) - (binding.inSeconds ?? 0)
      : binding.displayDurationSeconds ?? 0;
    if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
      errors.push(`broll_duration_invalid:${binding.bindingId}`);
      continue;
    }
    const shotWindow = shotWindows.get(binding.shotNumber);
    if (!shotWindow) {
      errors.push(`broll_shot_not_in_timeline:${binding.bindingId}:${binding.shotNumber}`);
      continue;
    }
    const start = Math.max(
      shotWindow.start,
      nextStartByShot.get(binding.shotNumber) ?? shotWindow.start,
    );
    const end = start + sourceDuration;
    if (end > shotWindow.end + TIMELINE_EPSILON) {
      errors.push(`broll_shot_overflow:${binding.bindingId}:${end}s>${shotWindow.end}s`);
    }
    nextStartByShot.set(binding.shotNumber, end);
    items.push({
      ...binding,
      source: binding,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: sourceDuration,
    });
  }
  const totalDurationSeconds = cursor;
  // `maxDurationSeconds` is a destination bound, not a claim that the
  // assembled episode itself must fit the target profile. A delivered clip
  // can legitimately be longer than its planned target; callers validate each
  // B-roll end window against their own authoritative render duration.
  if (maxDurationSeconds != null) {
    for (const item of items) {
      if (item.endSeconds > maxDurationSeconds + TIMELINE_EPSILON) {
        errors.push(`broll_timeline_out_of_range:${item.bindingId}:${item.endSeconds}s>${maxDurationSeconds}s`);
      }
    }
  }
  return { items, errors, totalDurationSeconds };
}

export function validateBrollBinding(input: ShotBrollBinding, context: { snapshotRevision: number; snapshotFingerprint: string; segment?: SourceMediaSegment | null }): ShotBrollBinding {
  const binding = shotBrollBindingSchema.parse(input);
  const assuranceLineage = binding.assuranceLineage === undefined
    ? undefined
    : VerticalDramaArtifactAssuranceLineageSchema.parse(binding.assuranceLineage);
  if (binding.usage.snapshotRevision !== context.snapshotRevision || binding.usage.snapshotFingerprint !== context.snapshotFingerprint) {
    throw new TRPCError({ code: "CONFLICT", message: "B-roll binding is based on a stale visual source snapshot" });
  }
  if (binding.usage.semanticRole === "scene_anchor" && binding.usage.mediaType !== "image") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Scene anchor promotion requires an image environment source" });
  }
  if (binding.usage.semanticRole === "b_roll_footage") {
    if (binding.usage.mediaType !== "video" || !binding.usage.segmentId || binding.usage.inSeconds == null || binding.usage.outSeconds == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Footage B-roll requires one video segment with in/out bounds" });
    }
    if (!context.segment) throw new TRPCError({ code: "NOT_FOUND", message: "B-roll segment not found" });
    const segment = sourceMediaSegmentSchema.parse(context.segment);
    if (segment.status !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "B-roll segment is not ready" });
    if (binding.usage.segmentRevision !== segment.revision || binding.usage.inSeconds < segment.inSeconds! || binding.usage.outSeconds > segment.outSeconds!) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "B-roll bounds or segment revision is invalid" });
    }
  }
  if (binding.usage.semanticRole === "b_roll_still" && binding.usage.displayDurationSeconds == null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Still B-roll requires an explicit display duration" });
  }
  const { assuranceLineage: _rawLineage, ...baseBinding } = binding;
  return assuranceLineage === undefined
    ? baseBinding
    : { ...baseBinding, assuranceLineage };
}

export function projectBrollTimeline(bindings: ShotBrollBinding[], maxDurationSeconds = 60): { bindings: ShotBrollBinding[]; totalDurationSeconds: number; warnings: string[] } {
  const ordered = bindings.filter(binding => binding.active).sort((a, b) => a.order - b.order || a.bindingId.localeCompare(b.bindingId));
  let totalDurationSeconds = 0;
  const warnings: string[] = [];
  for (const binding of ordered) {
    const usage = binding.usage;
    const duration = usage.mediaType === "video" && usage.inSeconds != null && usage.outSeconds != null
      ? usage.outSeconds - usage.inSeconds
      : usage.displayDurationSeconds ?? 0;
    if (duration <= 0) warnings.push(`${binding.bindingId}: zero or missing duration`);
    totalDurationSeconds += duration;
  }
  if (totalDurationSeconds > maxDurationSeconds) warnings.push(`B-roll timeline exceeds ${maxDurationSeconds}s`);
  return { bindings: ordered, totalDurationSeconds, warnings };
}
