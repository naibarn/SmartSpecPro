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
        generationModelId: "model-a",
        generationAspectRatio: "9:16",
        referenceUrls: ["https://cdn.example.com/ref-a.png"],
        generationExtraParams: {
          resolution: "720p",
          enableTranslation: false,
        },
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
    expect(project?.settings.width).toBe(1080);
    expect(project?.settings.height).toBe(1920);
    expect(videoTrack?.clips).toHaveLength(2);
    expect(videoTrack?.clips[0].startTime).toBe(0);
    expect(videoTrack?.clips[1].startTime).toBeGreaterThan(videoTrack?.clips[0].startTime);
    expect(videoTrack?.clips[0].groupId).toBeDefined();
    expect(videoTrack?.clips[0].groupId).toBe(videoTrack?.clips[1].groupId);

    const firstClip = videoTrack?.clips[0];
    const firstAsset = firstClip ? project?.assets[firstClip.assetId] : undefined;
    expect(firstAsset?.generationPrompt).toContain("PROMPT 1");
    expect(firstAsset?.generationModelId).toBe("model-a");
    expect(firstAsset?.generationAspectRatio).toBe("9:16");
    expect(firstAsset?.referenceUrls).toEqual(["https://cdn.example.com/ref-a.png"]);
    expect(firstAsset?.generationExtraParams).toEqual({
      resolution: "720p",
      enableTranslation: false,
    });
  });

  it("attaches external voiceover and music tracks aligned to total storyboard duration", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "PROMPT 1 (8 seconds): visual-only clip",
        url: "https://cdn.example.com/clip-a.mp4",
        model: "veo",
      },
      {
        id: "b",
        prompt: "PROMPT 2 (8 seconds): visual-only clip",
        url: "https://cdn.example.com/clip-b.mp4",
        model: "veo",
      },
    ], {
      muteVideoClipAudio: true,
      companionAudio: [
        {
          id: "voice",
          kind: "voiceover",
          title: "News voiceover",
          url: "https://cdn.example.com/voice.mp3",
          prompt: "full spoken script",
          model: "fal-ai/gemini-3.1-flash-tts",
          actualDurationSeconds: 20,
          targetDurationSeconds: 16,
        },
        {
          id: "music",
          kind: "music",
          title: "News music bed",
          url: "https://cdn.example.com/music.mp3",
          prompt: "subtle newsroom pulse",
          model: "google/lyria-3-pro/music",
          actualDurationSeconds: 30,
          targetDurationSeconds: 16,
          volume: 0.12,
        },
      ],
    });

    expect(project).not.toBeNull();
    const videoTrack = project?.timeline.tracks.find((track) => track.type === "video");
    const audioTrack = project?.timeline.tracks.find((track) => track.type === "audio");

    expect(videoTrack?.clips.every((clip) => clip.volume === 0)).toBe(true);
    expect(audioTrack?.clips).toHaveLength(2);
    expect(audioTrack?.clips[0].startTime).toBe(0);
    expect(audioTrack?.clips[1].startTime).toBe(0);
    expect(audioTrack?.clips[0].duration).toBeCloseTo(16, 3);
    expect(audioTrack?.clips[0].speed).toBeCloseTo(1.25, 3);
    expect(audioTrack?.clips[1].duration).toBeCloseTo(16, 3);
    expect(audioTrack?.clips[1].volume).toBeCloseTo(0.12, 3);
    expect(project?.settings.duration).toBeCloseTo(16, 3);
  });

  it("places split voiceover segments sequentially on the audio timeline", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "PROMPT 1 (8 seconds): visual-only clip",
        url: "https://cdn.example.com/clip-a.mp4",
        model: "veo",
      },
      {
        id: "b",
        prompt: "PROMPT 2 (8 seconds): visual-only clip",
        url: "https://cdn.example.com/clip-b.mp4",
        model: "veo",
      },
    ], {
      muteVideoClipAudio: true,
      companionAudio: [
        {
          id: "voice-1",
          kind: "voiceover",
          title: "News voiceover 1/2",
          url: "https://cdn.example.com/voice-1.mp3",
          prompt: "first half",
          model: "alibaba/qwen3-tts-flash",
          startTimeSeconds: 0,
          actualDurationSeconds: 8,
          targetDurationSeconds: 8,
          segmentIndex: 0,
          segmentCount: 2,
        },
        {
          id: "voice-2",
          kind: "voiceover",
          title: "News voiceover 2/2",
          url: "https://cdn.example.com/voice-2.mp3",
          prompt: "second half",
          model: "alibaba/qwen3-tts-flash",
          startTimeSeconds: 8,
          actualDurationSeconds: 10,
          targetDurationSeconds: 8,
          segmentIndex: 1,
          segmentCount: 2,
        },
      ],
    });

    const audioTrack = project?.timeline.tracks.find((track) => track.type === "audio");
    expect(audioTrack?.clips).toHaveLength(2);
    expect(audioTrack?.clips[0].startTime).toBe(0);
    expect(audioTrack?.clips[1].startTime).toBe(8);
    expect(audioTrack?.clips[1].duration).toBeCloseTo(8, 3);
    expect(audioTrack?.clips[1].speed).toBeCloseTo(1.25, 3);
    expect(project?.settings.duration).toBeCloseTo(16, 3);
  });
});
