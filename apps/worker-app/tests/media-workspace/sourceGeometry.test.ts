import { describe, expect, it } from "vitest";
import {
  applySourceGeometryDecision,
  evaluateSourceGeometry,
  type SourceVideoGeometry,
} from "../../src/screens/media-workspace/sourceGeometry";

const firstVideo: SourceVideoGeometry = {
  sourcePath: "D:/first.mp4",
  width: 3840,
  height: 2160,
  rotationDegrees: 0,
};

const secondVideo: SourceVideoGeometry = {
  sourcePath: "D:/second.mp4",
  width: 1920,
  height: 1080,
  rotationDegrees: 0,
};

describe("canonical source video geometry", () => {
  it("initializes the job geometry from the first video placed on the timeline", () => {
    expect(evaluateSourceGeometry(null, firstVideo)).toEqual({
      kind: "initialize",
      current: null,
      candidate: firstVideo,
    });
    expect(applySourceGeometryDecision(null, firstVideo, "accept-latest")).toEqual(firstVideo);
  });

  it("does not ask again when another video has the same analysis dimensions", () => {
    expect(evaluateSourceGeometry(firstVideo, { ...firstVideo, sourcePath: "D:/same-size.mp4" })).toEqual({
      kind: "unchanged",
      current: firstVideo,
      candidate: { ...firstVideo, sourcePath: "D:/same-size.mp4" },
    });
  });

  it("requires confirmation before a different-sized video can replace the job geometry", () => {
    expect(evaluateSourceGeometry(firstVideo, secondVideo).kind).toBe("confirm");
    expect(applySourceGeometryDecision(firstVideo, secondVideo, "keep-current")).toEqual(firstVideo);
    expect(applySourceGeometryDecision(firstVideo, secondVideo, "accept-latest")).toEqual(secondVideo);
  });
});
