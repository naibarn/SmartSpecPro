import {
  assertCanonicalProject,
  assertEditorialChangeSet,
  type CanonicalNleProject,
  type EditorialChangeSet,
} from "@smartspec/shared";
import { millisecondsToTicks } from "@smartspec/shared";

export function buildRoughCutChangeSet(input: {
  tenantId: string;
  projectId: string;
  expectedRevisionId: string;
  planHash: string;
  ranges: Array<{ id: string; startMs: number; endMs: number }>;
}): EditorialChangeSet {
  const operations = input.ranges.map(range => ({
    id: range.id,
    type: "cut" as const,
    payload: {
      startTick: millisecondsToTicks(range.startMs, { num: 90_000, den: 1 }),
      endTick: millisecondsToTicks(range.endMs, { num: 90_000, den: 1 }),
      sourceStartMs: range.startMs,
      sourceEndMs: range.endMs,
    },
  }));
  return assertEditorialChangeSet({
    schemaVersion: "editorial.change_set.v1",
    changeSetId: `changes-${input.planHash.slice(0, 24)}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    expectedRevisionId: input.expectedRevisionId,
    planHash: input.planHash,
    operations,
  });
}

export function applyEditorChangeSet(
  input: CanonicalNleProject,
  value: EditorialChangeSet,
  options: { protectedClipIds: string[] }
): { project: CanonicalNleProject; inverse: EditorialChangeSet } {
  assertCanonicalProject(input);
  assertEditorialChangeSet(value);
  if (input.projectId !== value.projectId)
    throw new Error("CHANGE_SET_PROJECT_MISMATCH");
  let project = structuredClone(input);
  const inverseOperations: EditorialChangeSet["operations"] = [];
  let requiresSnapshotInverse = false;

  const timelineAfterCut = (
    timeMs: number,
    startMs: number,
    endMs: number
  ): number => {
    if (timeMs <= startMs) return timeMs;
    return timeMs >= endMs ? timeMs - (endMs - startMs) : startMs;
  };

  for (const operation of value.operations) {
    if (operation.type === "metadata") {
      if (operation.payload.action !== "restore_project")
        throw new Error("CHANGE_SET_OPERATION_UNSUPPORTED");
      const restored = operation.payload.project;
      assertCanonicalProject(restored);
      if (restored.projectId !== value.projectId)
        throw new Error("CHANGE_SET_PROJECT_MISMATCH");
      project = structuredClone(restored);
      requiresSnapshotInverse = true;
      continue;
    }
    if (operation.type === "cut") {
      const startMs = operation.payload.sourceStartMs;
      const endMs = operation.payload.sourceEndMs;
      if (
        typeof startMs !== "number" ||
        typeof endMs !== "number" ||
        !Number.isSafeInteger(startMs) ||
        !Number.isSafeInteger(endMs) ||
        startMs < 0 ||
        endMs <= startMs
      )
        throw new Error("CHANGE_SET_TIMING_INVALID");

      const protectedClipIds = new Set(options.protectedClipIds);
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          const clipEndMs =
            clip.startMs +
            Math.round(
              (clip.sourceOutMs - clip.sourceInMs) / clip.playbackRate
            );
          if (
            clip.startMs < endMs &&
            clipEndMs > startMs &&
            protectedClipIds.has(clip.id)
          ) {
            throw new Error("PROTECTED_CLIP");
          }
        }
      }

      for (const track of project.tracks) {
        track.clips = track.clips.flatMap(clip => {
          const clipEndMs =
            clip.startMs +
            Math.round(
              (clip.sourceOutMs - clip.sourceInMs) / clip.playbackRate
            );
          const segments: Array<[number, number]> = [
            [clip.startMs, Math.min(startMs, clipEndMs)],
            [Math.max(endMs, clip.startMs), clipEndMs],
          ].filter(([segmentStart, segmentEnd]) => segmentEnd > segmentStart);
          return segments.map(
            ([segmentStartMs, segmentEndMs], segmentIndex) => ({
              ...clip,
              id:
                segmentIndex === 0
                  ? clip.id
                  : `${clip.id}:cut:${operation.id}`.slice(0, 160),
              startMs: timelineAfterCut(segmentStartMs, startMs, endMs),
              sourceInMs:
                clip.sourceInMs +
                Math.round((segmentStartMs - clip.startMs) * clip.playbackRate),
              sourceOutMs:
                clip.sourceInMs +
                Math.round((segmentEndMs - clip.startMs) * clip.playbackRate),
            })
          );
        });
      }
      project.markers = project.markers.map(marker => ({
        ...marker,
        timeMs: timelineAfterCut(marker.timeMs, startMs, endMs),
      }));
      requiresSnapshotInverse = true;
      continue;
    }
    if (operation.type !== "trim")
      throw new Error("CHANGE_SET_OPERATION_UNSUPPORTED");
    const clipId = operation.payload.clipId;
    if (typeof clipId !== "string")
      throw new Error("CHANGE_SET_OPERATION_INVALID");
    if (options.protectedClipIds.includes(clipId))
      throw new Error("PROTECTED_CLIP");
    const clip = project.tracks
      .flatMap(track => track.clips)
      .find(candidate => candidate.id === clipId);
    if (!clip) throw new Error("CHANGE_SET_CLIP_NOT_FOUND");
    const sourceOutMs = operation.payload.sourceOutMs;
    if (
      typeof sourceOutMs !== "number" ||
      !Number.isSafeInteger(sourceOutMs) ||
      sourceOutMs < clip.sourceInMs ||
      sourceOutMs > clip.sourceOutMs
    )
      throw new Error("CHANGE_SET_TIMING_INVALID");
    inverseOperations.push({
      id: `inverse-${operation.id}`,
      type: "trim",
      payload: { clipId, sourceOutMs: clip.sourceOutMs },
    });
    clip.sourceOutMs = sourceOutMs;
  }
  const inverse = assertEditorialChangeSet({
    ...value,
    changeSetId: `inverse-${value.changeSetId}`,
    operations: requiresSnapshotInverse
      ? [
          {
            id: `inverse-restore-${value.changeSetId}`,
            type: "metadata",
            payload: { action: "restore_project", project: input },
          },
        ]
      : inverseOperations,
  });
  assertCanonicalProject(project);
  return { project, inverse };
}
