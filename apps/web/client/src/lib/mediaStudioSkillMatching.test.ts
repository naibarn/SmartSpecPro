import { describe, expect, it } from "vitest";
import {
  getMediaStudioSkillTypePriority,
  isMediaStudioSkillCompatible,
  sortMediaStudioSkillsForTab,
} from "./mediaStudioSkillMatching";

describe("mediaStudioSkillMatching", () => {
  it("shows only image prompt skills on the image tab", () => {
    const sorted = sortMediaStudioSkillsForTab("image", [
      { id: "image-creator", type: "image-generation", priority: 95 },
      { id: "image-prompt", type: "image-prompt-generation", priority: 50 },
      { id: "generic-prompt", type: "prompt-enhancement", priority: 99 },
    ]);

    expect(sorted.map((skill: any) => skill.id)).toEqual([
      "image-prompt",
    ]);
  });

  it("shows only video prompt skills on the video tab", () => {
    const sorted = sortMediaStudioSkillsForTab("video", [
      { id: "video-creator", type: "video-generation", priority: 95 },
      { id: "video-prompt", type: "video-prompt-generation", priority: 50 },
      { id: "generic-prompt", type: "prompt-enhancement", priority: 99 },
    ]);

    expect(sorted.map((skill: any) => skill.id)).toEqual([
      "video-prompt",
    ]);
  });

  it("keeps audio focused on text-to-speech before sound effects", () => {
    const sorted = sortMediaStudioSkillsForTab("audio", [
      { id: "sfx", type: "sound-effects", priority: 99 },
      { id: "tts", type: "audio-generation", priority: 50 },
    ]);

    expect(sorted.map((skill: any) => skill.id)).toEqual(["tts", "sfx"]);
  });

  it("rejects incompatible skill types per tab", () => {
    expect(isMediaStudioSkillCompatible("image", { type: "audio-generation" })).toBe(false);
    expect(isMediaStudioSkillCompatible("video", { type: "image-prompt-generation" })).toBe(false);
    expect(isMediaStudioSkillCompatible("audio", { type: "video-generation" })).toBe(false);
    expect(isMediaStudioSkillCompatible("image", { type: "image-generation" })).toBe(false);
    expect(isMediaStudioSkillCompatible("video", { type: "prompt-enhancement" })).toBe(false);
  });

  it("exposes deterministic type priorities", () => {
    expect(getMediaStudioSkillTypePriority("image", "image-prompt-generation")).toBe(0);
    expect(getMediaStudioSkillTypePriority("video", "video-prompt-generation")).toBe(0);
    expect(getMediaStudioSkillTypePriority("audio", "audio-generation")).toBe(0);
    expect(getMediaStudioSkillTypePriority("audio", "sound-effects")).toBe(1);
  });
});
