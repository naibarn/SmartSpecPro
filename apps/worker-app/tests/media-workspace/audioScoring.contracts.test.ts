import { describe, expect, it, vi } from "vitest";
import type { EpisodeSoundPlan } from "../../src/types/audioScoring";
import { extractDramaticBeats } from "../../src/services/audioScoring/dramaticBeatExtractor";
import { fetchApprovedScorePlan } from "../../src/services/audioScoring/smartAiHubSkillClient";
import { applySoundPlanToProjectTimeline } from "../../src/services/audioScoring/audioPlacementEngine";
import { runAudioQualityControl } from "../../src/services/audioScoring/audioQcEngine";

const plan: EpisodeSoundPlan = {
  planId: "plan-1",
  episodeId: "episode-1",
  seriesId: "series-1",
  totalDurationMs: 4000,
  overallMood: "approved-by-skill",
  authority: {
    planId: "plan-1",
    planHash: "hash-1",
    semanticRevision: "semantic-1",
    timelineRevision: "timeline-1",
    approvedAt: "2026-09-05T00:00:00.000Z",
    approvedBy: "user-1",
    rightsPolicyHash: "rights-1",
    skill: {
      skillId: "vertical-drama-emotion-score-director",
      skillVersion: "1.0.0",
      skillContentHash: "skill-hash",
      mode: "compile_music_caption",
      executionId: "execution-1",
      modelProvider: "authorized-provider",
      modelId: "authorized-model",
      inputHash: "input-hash",
      outputHash: "output-hash",
      executedAt: "2026-09-05T00:00:00.000Z",
    },
  },
  intensityCurve: [],
  cues: [{
    cueId: "cue-1",
    timelineStartMs: 0,
    timelineDurationMs: 4000,
    placement: "dialogue_underbed",
    displayCaption: "คำอธิบายจาก skill",
    modelInstruction: "Instrumental sparse piano under dialogue, no vocals",
    rightsPolicyHash: "rights-1",
    intensity: 0.4,
    duckingRequired: true,
    duckingLevelDb: -12,
    duckingAttackMs: 50,
    duckingReleaseMs: 300,
    duckingHoldMs: 100,
    fadeInMs: 100,
    fadeOutMs: 100,
  }],
  sfxEvents: [],
};

const project = {
  version: "1.0.0" as const,
  projectId: "episode-1",
  title: "test",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  canvas: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" as const, durationMs: 4000 },
  tracks: [
    { id: "track_a1", type: "audio_voice" as const, name: "Dialogue", muted: false, locked: false, volume: 1, clips: [] },
    { id: "track_a2", type: "audio_music" as const, name: "Manual music", muted: false, locked: false, volume: 1, clips: [{ id: "manual-a2", name: "Manual cue", timelineStartMs: 0, durationMs: 500, sourceType: "local_file" as const, sourcePath: "/tmp/manual.wav" }] },
  ],
};

describe("Feature 176/177 worker contracts", () => {
  it("does not classify emotion locally", () => {
    expect(() => extractDramaticBeats([{ shotIndex: 1, description: "shock", durationSeconds: 1 }])).toThrow("SKILL_UNAVAILABLE");
  });

  it("does not invent an approved plan when Web credentials are absent", async () => {
    await expect(fetchApprovedScorePlan({ plan: null, expectedSkillId: "vertical-drama-emotion-score-director", expectedSkillVersion: "1.0.0" }, "", ""))
      .rejects.toMatchObject({ code: "SKILL_UNAVAILABLE" });
  });

  it("keeps manual music and replaces only the owned score revision", () => {
    const mapped = applySoundPlanToProjectTimeline({
      project,
      soundPlan: plan,
      generatedCues: [{ cueId: "cue-1", audioPath: "/tmp/generated.wav", durationSeconds: 4, outputSha256: "a", measuredLufs: -16, truePeakDb: -1.2 }],
    });
    const music = mapped.tracks.find((track) => track.id === "track_a2");
    expect(music?.clips.map((clip) => clip.id)).toEqual(["manual-a2", "smartspec-score:plan-1:cue-1"]);
    expect(music?.ducking).toMatchObject({ attenuationDb: -12, attackMs: 50, releaseMs: 300, holdMs: 100 });
  });

  it("never reports QC pass without full-program measurements", () => {
    const report = runAudioQualityControl(project, []);
    expect(report).toMatchObject({ passed: false, measurementStatus: "insufficient_data" });
    expect(report.integratedLufs).toBeNull();
  });

  it("does not fall back when the approved-plan endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("skill unavailable", { status: 503 })));
    await expect(fetchApprovedScorePlan({ plan, expectedSkillId: "vertical-drama-emotion-score-director", expectedSkillVersion: "1.0.0" }, "http://server", "token"))
      .rejects.toMatchObject({ code: "SKILL_UNAVAILABLE" });
  });
});
