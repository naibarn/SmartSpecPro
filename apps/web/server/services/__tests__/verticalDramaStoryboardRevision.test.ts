import { describe, expect, it } from "vitest";
import {
  computeStoryboardRevision,
  markArtifactStale,
  stampArtifactForStoryboard,
  stampStoryboardRevision,
  storyboardArtifactStatus,
} from "../verticalDramaStoryboardRevision";

describe("verticalDramaStoryboardRevision", () => {
  it("produces a canonical revision independent of object key order and metadata", () => {
    expect(computeStoryboardRevision({ b: 2, a: 1 })).toBe(
      computeStoryboardRevision({ a: 1, b: 2, _storyboardRevision: "old" }),
    );
  });

  it("marks old artifacts stale without deleting their content", () => {
    const storyboard = stampStoryboardRevision({ shots: [{ shotNumber: 1 }] });
    const artifact = stampArtifactForStoryboard({ clips: [{ prompt: "keep me" }] }, storyboard);
    const stale = markArtifactStale(artifact, storyboard) as typeof artifact;
    expect(stale.clips).toEqual([{ prompt: "keep me" }]);
    expect(stale._storyboardProvenance).toMatchObject({ status: "stale", reason: "storyboard_changed" });
  });

  it("distinguishes current, stale, and legacy unknown artifacts", () => {
    const storyboard = { shots: [{ shotNumber: 1 }] };
    const current = stampArtifactForStoryboard({ clips: [] }, storyboard);
    expect(storyboardArtifactStatus(current, storyboard)).toBe("current");
    expect(storyboardArtifactStatus(current, { shots: [{ shotNumber: 2 }] })).toBe("stale");
    expect(storyboardArtifactStatus({ clips: [] }, storyboard)).toBe("unknown");
  });
});
