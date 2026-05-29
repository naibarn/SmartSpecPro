import { describe, expect, it } from "vitest";
import { buildStoryboardVideoProject, inferStoryboardRenderAspectRatio } from "../storyboardVideoProject";

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

  it("trims one duplicate boundary frame when adjacent first/last frame references overlap", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "PROMPT 1 (8 seconds): start on frame 1 and end on frame 2",
        url: "https://cdn.example.com/clip-a.mp4",
        model: "veo-3-1",
        durationSeconds: 8,
        referenceUrls: [
          "https://cdn.example.com/frame-1.jpg",
          "https://cdn.example.com/frame-2.jpg",
        ],
      },
      {
        id: "b",
        prompt: "PROMPT 2 (8 seconds): start on frame 2 and end on frame 3",
        url: "https://cdn.example.com/clip-b.mp4",
        model: "veo-3-1",
        durationSeconds: 8,
        referenceUrls: [
          "https://cdn.example.com/frame-2.jpg",
          "https://cdn.example.com/frame-3.jpg",
        ],
      },
      {
        id: "c",
        prompt: "PROMPT 3 (8 seconds): unrelated references should not trim previous clip",
        url: "https://cdn.example.com/clip-c.mp4",
        model: "veo-3-1",
        durationSeconds: 8,
        referenceUrls: [
          "https://cdn.example.com/frame-x.jpg",
          "https://cdn.example.com/frame-y.jpg",
        ],
      },
    ]);

    const videoTrack = project?.timeline.tracks.find((track) => track.type === "video");
    const oneFrameAt30Fps = 1 / 30;

    expect(videoTrack?.clips).toHaveLength(3);
    expect(videoTrack?.clips[0].duration).toBeCloseTo(8 - oneFrameAt30Fps, 6);
    expect(videoTrack?.clips[0].trimOut).toBeCloseTo(8 - oneFrameAt30Fps, 6);
    expect(videoTrack?.clips[0].duplicateBoundaryFrameTrim).toEqual({
      frameCount: 1,
      seconds: oneFrameAt30Fps,
      fps: 30,
      reason: "matching_first_last_frame_boundary",
    });
    expect(videoTrack?.clips[1].startTime).toBeCloseTo(8 - oneFrameAt30Fps, 6);
    expect(videoTrack?.clips[1].duration).toBeCloseTo(8, 6);
    expect(videoTrack?.clips[1].duplicateBoundaryFrameTrim).toBeUndefined();
    expect(videoTrack?.clips[2].startTime).toBeCloseTo(16 - oneFrameAt30Fps, 6);
    expect(project?.settings.duration).toBeCloseTo(24 - oneFrameAt30Fps, 6);
  });

  it("infers a vertical project from extra params when direct aspect ratio is missing", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "PROMPT 1 (8 seconds): beauty product reveal",
        url: "https://cdn.example.com/clip-a.mp4",
        model: "veo",
        generationExtraParams: {
          resolution: "1080x1920",
        },
      },
    ]);

    expect(project?.settings.width).toBe(1080);
    expect(project?.settings.height).toBe(1920);
  });

  it("infers a vertical project from prompt language for imported clips", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "a",
        prompt: "Uploaded vertical clip for Storyboard Review",
        url: "https://cdn.example.com/uploaded.mp4",
        model: "Imported",
      },
    ]);

    expect(project?.settings.width).toBe(1080);
    expect(project?.settings.height).toBe(1920);
  });

  it("builds imported still images as image assets with configured duration and render transitions", () => {
    const project = buildStoryboardVideoProject([
      {
        id: "still-a",
        prompt: "Uploaded still image",
        url: "https://cdn.example.com/still-a",
        mediaType: "image",
        durationSeconds: 6,
        generationAspectRatio: "9:16",
      },
      {
        id: "still-b",
        prompt: "Second still image",
        url: "https://cdn.example.com/still-b",
        mediaType: "image",
        durationSeconds: 4,
        transition: { name: "smoothLeft", durationMs: 750, alignment: "center" },
        generationAspectRatio: "9:16",
      },
    ]);

    const videoTrack = project?.timeline.tracks.find((track) => track.type === "video");
    const firstClip = videoTrack?.clips[0];
    const secondClip = videoTrack?.clips[1];
    const firstAsset = firstClip ? project?.assets[firstClip.assetId] : undefined;
    const secondAsset = secondClip ? project?.assets[secondClip.assetId] : undefined;

    expect(firstAsset?.type).toBe("image");
    expect(secondAsset?.type).toBe("image");
    expect(firstClip?.duration).toBeCloseTo(6, 6);
    expect(firstClip?.trimOut).toBeCloseTo(6, 6);
    expect(secondClip?.startTime).toBeCloseTo(5.25, 6);
    expect(secondClip?.duration).toBeCloseTo(4, 6);
    expect(secondClip?.inTransition).toEqual({ name: "smoothLeft", durationMs: 750, alignment: "center" });
    expect(project?.settings.duration).toBeCloseTo(9.25, 6);
  });

  it("infers final render orientation from selected clips and allows explicit override", () => {
    const clips = [
      {
        id: "a",
        prompt: "Uploaded vertical clip",
        url: "https://cdn.example.com/a.mp4",
        model: "Imported",
        generationAspectRatio: "9:16",
      },
      {
        id: "b",
        prompt: "Uploaded vertical clip",
        url: "https://cdn.example.com/b.mp4",
        model: "Imported",
        generationExtraParams: { size: "1080x1920" },
      },
      {
        id: "c",
        prompt: "Landscape b-roll",
        url: "https://cdn.example.com/c.mp4",
        model: "Imported",
        generationAspectRatio: "16:9",
      },
    ];

    expect(inferStoryboardRenderAspectRatio(clips)).toMatchObject({
      mode: "9:16",
      verticalCount: 2,
      horizontalCount: 1,
    });

    const autoProject = buildStoryboardVideoProject(clips, { outputAspectRatio: "auto" });
    expect(autoProject?.settings).toMatchObject({ width: 1080, height: 1920 });

    const wideProject = buildStoryboardVideoProject(clips, { outputAspectRatio: "16:9" });
    expect(wideProject?.settings).toMatchObject({ width: 1920, height: 1080 });
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
