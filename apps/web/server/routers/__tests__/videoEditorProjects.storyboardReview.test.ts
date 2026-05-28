import { describe, expect, it } from "vitest";
import {
  mergeFresherExistingReviewTasks,
  sanitizeStoryboardReviewClientDebugPayload,
} from "../videoEditorProjects";

describe("mergeFresherExistingReviewTasks", () => {
  it("preserves fresher existing task media when a stale client resaves with a newer draft timestamp", () => {
    const existing = {
      version: 1,
      updatedAt: 3000,
      taskIds: ["shot-1", "shot-2"],
      selectedTaskIds: ["shot-1", "shot-2"],
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 3000,
          url: "/files/v7.mp4",
        },
      ],
    };
    const incoming = {
      ...existing,
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        {
          id: "shot-1",
          updatedAt: 1000,
          url: "/files/v1.mp4",
        },
        {
          id: "shot-2",
          updatedAt: 1000,
          url: "/files/v4.mp4",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      updatedAt: 4000,
      compoundStatus: "Recovered storyboard review",
      tasks: [
        { id: "shot-1", updatedAt: 1000, url: "/files/v1.mp4" },
        { id: "shot-2", updatedAt: 3000, url: "/files/v7.mp4" },
      ],
    });
  });

  it("accepts incoming task media when it is at least as fresh as the stored task", () => {
    const existing = {
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/old.mp4" }],
    };
    const incoming = {
      tasks: [{ id: "shot-1", updatedAt: 2000, url: "/files/new.mp4" }],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toEqual(incoming);
  });

  it("preserves stored companion audio when an older refreshed draft would drop it", () => {
    const existing = {
      version: 1,
      updatedAt: 4000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };
    const incoming = {
      version: 1,
      updatedAt: 3500,
      companionAudioUpdatedAt: 3000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });

  it("accepts incoming companion audio when the incoming draft is newer", () => {
    const existing = {
      version: 1,
      updatedAt: 3000,
      companionAudioUpdatedAt: 3000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };
    const incoming = {
      version: 1,
      updatedAt: 4000,
      companionAudioUpdatedAt: 4000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toEqual(incoming);
  });

  it("preserves a newer companion audio removal instead of restoring older stored audio", () => {
    const existing = {
      version: 1,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [],
    };
    const incoming = {
      version: 1,
      updatedAt: 6000,
      companionAudioUpdatedAt: 4000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old narration",
          prompt: "Old narration",
          kind: "voiceover",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [],
    });
  });

  it("does not let legacy audio without an explicit audio timestamp overwrite newer audio", () => {
    const existing = {
      version: 1,
      updatedAt: 5000,
      companionAudioUpdatedAt: 5000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-new",
          url: "/files/new-audio.mp3",
          title: "New narration",
          prompt: "New narration",
          kind: "voiceover",
        },
      ],
    };
    const incoming = {
      version: 1,
      updatedAt: 6000,
      tasks: [{ id: "shot-1", updatedAt: 1000, url: "/files/shot-1.mp4" }],
      companionAudio: [
        {
          id: "audio-old",
          url: "/files/old-audio.mp3",
          title: "Old music",
          prompt: "Old music",
          kind: "music",
        },
      ],
    };

    expect(mergeFresherExistingReviewTasks(existing, incoming)).toMatchObject({
      companionAudioUpdatedAt: 5000,
      companionAudio: [
        expect.objectContaining({ id: "audio-new", url: "/files/new-audio.mp3" }),
      ],
    });
  });
});

describe("sanitizeStoryboardReviewClientDebugPayload", () => {
  it("redacts urls and trims long debug strings", () => {
    const sanitized = sanitizeStoryboardReviewClientDebugPayload({
      audio: [{
        id: "audio-1",
        sourceUrl: "https://example.com/file.mp3?sig=secret",
        title: "x".repeat(600),
      }],
      nested: {
        token: "secret-token",
      },
    }) as any;

    expect(sanitized.audio[0].id).toBe("audio-1");
    expect(sanitized.audio[0].sourceUrl).toBe("[redacted]");
    expect(sanitized.audio[0].title).toHaveLength(503);
    expect(sanitized.nested.token).toBe("[redacted]");
  });
});
