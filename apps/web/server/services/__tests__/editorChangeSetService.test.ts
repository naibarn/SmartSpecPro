import { describe, expect, it } from "vitest";
import {
  applyEditorChangeSet,
  buildRoughCutChangeSet,
} from "../editorChangeSetService";

const project = {
  projectId: "project-1",
  schemaVersion: "nle.web.1" as const,
  timebase: { numerator: 90_000, denominator: 1 },
  canvas: {
    width: 1080,
    height: 1920,
    pixelAspectRatio: { numerator: 1, denominator: 1 },
  },
  tracks: [
    {
      id: "track-1",
      kind: "video" as const,
      clips: [
        {
          id: "clip-1",
          asset: { namespace: "media_asset" as const, id: 1 },
          startMs: 0,
          sourceInMs: 0,
          sourceOutMs: 10_000,
          playbackRate: 1,
          volume: 1,
          muted: false,
        },
      ],
    },
  ],
  markers: [],
  render: {
    profileId: "web-default",
    fps: { numerator: 30, denominator: 1 },
    outputRoles: ["final_video"],
  },
  migration: {
    sourceFormat: "nle.web",
    sourceVersion: "1",
    mappingVersion: "feature-184.2",
    unresolved: [],
    unsupported: [],
    preservedUnknown: {},
  },
};

describe("editor change sets", () => {
  it("maps rough-cut ranges to deterministic non-destructive operations", () => {
    const changeSet = buildRoughCutChangeSet({
      tenantId: "tenant-1",
      projectId: "project-1",
      expectedRevisionId: "revision-1",
      planHash: "plan-1",
      ranges: [{ id: "remove-1", startMs: 1000, endMs: 2000 }],
    });
    expect(changeSet.operations[0].id).toBe("remove-1");
    expect(changeSet.operations[0].payload).toMatchObject({
      startTick: 90_000,
      endTick: 180_000,
    });
  });

  it("applies safe trim and returns an inverse without touching protected ranges", () => {
    const changeSet = {
      schemaVersion: "editorial.change_set.v1" as const,
      changeSetId: "changes-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      expectedRevisionId: "revision-1",
      planHash: "plan-1",
      operations: [
        {
          id: "trim-1",
          type: "trim" as const,
          payload: { clipId: "clip-1", sourceOutMs: 5000 },
        },
      ],
    };
    const result = applyEditorChangeSet(project, changeSet, {
      protectedClipIds: [],
    });
    expect(result.project.tracks[0].clips[0].sourceOutMs).toBe(5000);
    expect(result.inverse.operations[0].payload).toMatchObject({
      sourceOutMs: 10_000,
    });
    expect(() =>
      applyEditorChangeSet(project, changeSet, { protectedClipIds: ["clip-1"] })
    ).toThrow("PROTECTED_CLIP");
  });

  it("applies rough-cut ranges as a ripple across tracks and can restore the snapshot", () => {
    const changeSet = buildRoughCutChangeSet({
      tenantId: "tenant-1",
      projectId: "project-1",
      expectedRevisionId: "revision-1",
      planHash: "plan-cut",
      ranges: [{ id: "remove-1", startMs: 1000, endMs: 2000 }],
    });
    const result = applyEditorChangeSet(project, changeSet, {
      protectedClipIds: [],
    });
    expect(result.project.tracks[0].clips).toHaveLength(2);
    expect(result.project.tracks[0].clips[0]).toMatchObject({
      startMs: 0,
      sourceInMs: 0,
      sourceOutMs: 1000,
    });
    expect(result.project.tracks[0].clips[1]).toMatchObject({
      startMs: 1000,
      sourceInMs: 2000,
      sourceOutMs: 10_000,
    });
    const restored = applyEditorChangeSet(result.project, result.inverse, {
      protectedClipIds: [],
    });
    expect(restored.project).toEqual(project);
  });

  it("does not cut through a protected clip", () => {
    const changeSet = buildRoughCutChangeSet({
      tenantId: "tenant-1",
      projectId: "project-1",
      expectedRevisionId: "revision-1",
      planHash: "plan-protected",
      ranges: [{ id: "remove-1", startMs: 1000, endMs: 2000 }],
    });
    expect(() =>
      applyEditorChangeSet(project, changeSet, { protectedClipIds: ["clip-1"] })
    ).toThrow("PROTECTED_CLIP");
  });
});
