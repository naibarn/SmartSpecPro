import { describe, expect, it } from "vitest";
import {
  applyVoiceGuidedVisualPlan,
  buildVoiceGuidedVisualPlan,
  mapTranscriptToTimeline,
  normalizeMatchText,
  type ImageAnalysis,
  type VoiceTranscriptSegment,
} from "../../src/screens/media-workspace/voiceGuidedVisualMatch";
import type { VideoProjectDraft } from "../../src/types/nleProject";

const analyses: ImageAnalysis[] = [
  { assetId: "image-a", fingerprint: "a", caption: "แมวกำลังนอนบนโซฟา", keywords: ["แมว", "โซฟา"], confidence: 0.95, analyzer: "skill", modelRevision: "test" },
  { assetId: "image-b", fingerprint: "b", caption: "รถยนต์สีแดงบนถนน", keywords: ["รถยนต์", "ถนน"], confidence: 0.95, analyzer: "skill", modelRevision: "test" },
];

const transcript: VoiceTranscriptSegment[] = [
  { text: "รถยนต์สีแดงกำลังวิ่งบนถนน", startMs: 0, endMs: 3000 },
  { text: "แมวนอนบนโซฟา", startMs: 3000, endMs: 6000 },
];

describe("voice guided visual match", () => {
  it("normalizes Thai punctuation without changing meaning", () => {
    expect(normalizeMatchText("แมว—กำลัง นอน! บนโซฟา")).toBe("แมว กำลัง นอน บนโซฟา");
  });

  it("maps source timestamps through trim, speed, and offset", () => {
    const mapped = mapTranscriptToTimeline(
      [{ text: "hello", startMs: 1000, endMs: 3000 }],
      [{ clipId: "voice", sourceStartMs: 500, sourceEndMs: 5000, timelineStartMs: 2000, speed: 2 }],
    );
    expect(mapped[0]).toMatchObject({ startMs: 2250, endMs: 3250 });
  });

  it("proposes reorder only after high-confidence global improvement", () => {
    const plan = buildVoiceGuidedVisualPlan({
      transcript,
      voiceMaps: [{ clipId: "voice", sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, speed: 1 }],
      analyses,
      originalOrder: ["image-a", "image-b"],
      projectRevision: "r1",
    });
    expect(plan.reorderEligible).toBe(true);
    expect(plan.proposedOrder).toEqual(["image-b", "image-a"]);
  });

  it("retains original order when an image has low confidence", () => {
    const plan = buildVoiceGuidedVisualPlan({
      transcript,
      voiceMaps: [{ clipId: "voice", sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, speed: 1 }],
      analyses: analyses.map((item) => item.assetId === "image-b" ? { ...item, confidence: 0.2 } : item),
      originalOrder: ["image-a", "image-b"],
      projectRevision: "r1",
    });
    expect(plan.reorderEligible).toBe(false);
    expect(plan.proposedOrder).toEqual(plan.originalOrder);
  });

  it("changes image clips only", () => {
    const project = {
      version: "1.0.0",
      projectId: "p1",
      title: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      canvas: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16", durationMs: 6000 },
      tracks: [
        { id: "a1", type: "audio_voice", name: "voice", muted: false, locked: false, volume: 1, clips: [{ id: "voice", name: "voice", timelineStartMs: 0, durationMs: 6000, sourceType: "local_file" as const, sourcePath: "/tmp/voice.wav" }] },
        { id: "t1", type: "text_subtitle", name: "sub", muted: false, locked: false, volume: 1, clips: [{ id: "sub", name: "sub", timelineStartMs: 0, durationMs: 1000, sourceType: "text" as const, text: "เดิม" }] },
        { id: "v1", type: "video_main", name: "main", muted: false, locked: false, volume: 1, clips: [{ id: "main-video", name: "main", timelineStartMs: 0, durationMs: 6000, sourceType: "local_file" as const, sourcePath: "/tmp/main.mp4" }] },
        { id: "v2", type: "video_broll", name: "images", muted: false, locked: false, volume: 1, clips: [
          { id: "image-a", name: "a", timelineStartMs: 0, durationMs: 3000, sourceType: "local_file" as const, sourcePath: "/tmp/a.png" },
          { id: "image-b", name: "b", timelineStartMs: 3000, durationMs: 3000, sourceType: "local_file" as const, sourcePath: "/tmp/b.png" },
        ] },
      ],
    } satisfies VideoProjectDraft;
    const plan = buildVoiceGuidedVisualPlan({ transcript, voiceMaps: [{ clipId: "voice", sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, speed: 1 }], analyses, originalOrder: ["image-a", "image-b"], projectRevision: project.updatedAt });
    const next = applyVoiceGuidedVisualPlan(project, plan, "reordered");
    expect(next.tracks.find((track) => track.type === "audio_voice")?.clips).toEqual(project.tracks[0].clips);
    expect(next.tracks.find((track) => track.type === "text_subtitle")?.clips).toEqual(project.tracks[1].clips);
    expect(next.tracks.find((track) => track.type === "video_main")?.clips).toEqual(project.tracks[2].clips);
    expect(next.metadata?.visualMatch?.previousProjectJson).toContain('"projectId":"p1"');
  });

  it("allocates the complete voice duration across image windows", () => {
    const plan = buildVoiceGuidedVisualPlan({
      transcript: [{ text: "ช่วงกลาง", startMs: 1500, endMs: 2500 }],
      voiceMaps: [{ clipId: "voice", sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, speed: 1 }],
      analyses,
      originalOrder: ["image-a", "image-b"],
      projectRevision: "r1",
    });
    expect(plan.sourceDurationMs).toBe(6000);
    expect(plan.windows.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[0, 3000], [3000, 6000]]);
  });

  it("rejects applying a preview after the project revision changed", () => {
    const project = {
      version: "1.0.0",
      projectId: "p2",
      title: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "new-revision",
      canvas: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16", durationMs: 6000 },
      tracks: [],
    } satisfies VideoProjectDraft;
    const plan = buildVoiceGuidedVisualPlan({
      transcript,
      voiceMaps: [{ clipId: "voice", sourceStartMs: 0, sourceEndMs: 6000, timelineStartMs: 0, speed: 1 }],
      analyses,
      originalOrder: ["image-a", "image-b"],
      projectRevision: "old-revision",
    });
    expect(() => applyVoiceGuidedVisualPlan(project, plan, "original")).toThrow("VISUAL_MATCH_PREVIEW_STALE");
  });
});
