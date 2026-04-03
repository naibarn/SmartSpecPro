import { describe, expect, it } from "vitest";
import { buildStoryboardVideoProject } from "../storyboardVideoProject";

describe("buildStoryboardVideoProject", () => {
  it("builds a sequential video timeline with shared compound grouping", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "PROMPT 1 (Hook - 8 seconds): A curious kid sees a dog",
        url: "https://cdn.example.com/clip-a.mp4",
        model: "model-a",
      },
      {
        id: "b",
        prompt: "PROMPT 2 (8 seconds): The kid bends down and talks",
        url: "https://cdn.example.com/clip-b.mp4",
        model: "model-a",
      },
    ]);

    expect(project).not.toBeNull();
    const videoTrack = project?.timeline.tracks.find((track) => track.type === "video");
    expect(videoTrack?.clips).toHaveLength(2);
    expect(videoTrack?.clips[0].startTime).toBe(0);
    expect(videoTrack?.clips[1].startTime).toBeGreaterThan(videoTrack?.clips[0].startTime);
    expect(videoTrack?.clips[0].groupId).toBeDefined();
    expect(videoTrack?.clips[0].groupId).toBe(videoTrack?.clips[1].groupId);
  });
});
