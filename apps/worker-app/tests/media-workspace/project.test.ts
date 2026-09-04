import { describe, expect, it } from "vitest";
import { createDefaultProjectDraft, exportToCapCutDraftJson } from "../../src/types/nleProject";

const draft = (deadAirSegments?: Array<{startMs: number; endMs: number}>) =>
  createDefaultProjectDraft({ projectId: "p1", title: "test.mp4", videoPath: "/videos/test.mp4", videoDurationMs: 10000, deadAirSegments });

describe("project timeline and export", () => {
  it("merges overlapping silence without reintroducing removed speech", () => {
    const project = draft([{startMs: 1000, endMs: 5000}, {startMs: 2000, endMs: 3000}]);
    expect(project.tracks.find(t => t.type === "video_main")?.clips.map(c => [c.trimInMs, c.trimOutMs])).toEqual([[0, 1000], [5000, 10000]]);
    expect(project.canvas.durationMs).toBe(6000);
  });
  it("clamps silence to the source and ignores invalid ranges", () => {
    const project = draft([{startMs: -1000, endMs: 1000}, {startMs: 9000, endMs: 12000}, {startMs: 6000, endMs: 4000}, {startMs: NaN, endMs: 3000}]);
    expect(project.canvas.durationMs).toBe(8000);
    expect(project.tracks.find(t => t.type === "video_main")?.clips[0].trimInMs).toBe(1000);
  });
  it("keeps a fully silent timeline empty", () => {
    expect(draft([{startMs: 0, endMs: 10000}]).canvas.durationMs).toBe(0);
  });
  it("references exported material ids for video and extracted voice", () => {
    const result = exportToCapCutDraftJson(draft()) as any;
    for (const track of result.tracks) for (const segment of track.segments) {
      const materials = track.type === "audio" ? result.materials.audios : result.materials.videos;
      expect(materials.some((m: any) => m.id === segment.material_id)).toBe(true);
    }
  });
  it("preserves square canvas ratios", () => {
    const project = draft(); project.canvas.aspectRatio = "1:1";
    expect((exportToCapCutDraftJson(project) as any).canvas_config.ratio).toBe("1:1");
  });
});
it("refuses incomplete exports instead of silently dropping overlays", () => {
  const project = draft();
  project.tracks[0].clips.push({id: "overlay", name: "privacy", timelineStartMs: 0, durationMs: 1000, sourceType: "generated_code", isBlurOverlay: true});
  expect(() => exportToCapCutDraftJson(project)).toThrow(/does not yet support/);
});
it.each(["blob:temporary", "data:audio/webm;base64,AA", "https://example.test/media.mp4"])("requires local persistent CapCut media: %s", path => {
  const project = draft(); project.tracks[3].clips[0].sourcePath = path;
  expect(() => exportToCapCutDraftJson(project)).toThrow(/persistent media/);
});
