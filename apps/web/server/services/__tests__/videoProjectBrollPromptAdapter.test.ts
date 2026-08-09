import { describe, expect, it, vi } from "vitest";

const callLLMStructuredMock = vi.fn();

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: (...args: unknown[]) => callLLMStructuredMock(...args),
  LLMStructuredOutputError: class LLMStructuredOutputError extends Error {
    creditsUsed = 0;
  },
}));

import {
  makeRunBrollPromptSkill,
  VIDEO_PROJECT_BROLL_PROMPT_SYSTEM_FRAMING,
} from "../videoProjectBrollPromptAdapter";

describe("videoProjectBrollPromptAdapter", () => {
  it("uses the review-only B-roll skill and never submits a media task", async () => {
    callLLMStructuredMock.mockResolvedValueOnce({
      data: {
        kind: "image",
        sceneId: "scene-1",
        prompt: "A detailed editorial still frame showing a child reading beside a warm bedside lamp.",
        negativePrompt: "blurry, distorted hands",
        shotSummary: "Warm bedside reading B-roll",
        motionDirection: "",
        suggestedDurationSeconds: 4,
      },
      creditsUsed: 1,
      modelId: "gpt-test",
    });

    const run = makeRunBrollPromptSkill({
      tenantId: "tenant-1",
      userId: 7,
      projectId: 3,
      traceId: "trace-1",
      modelId: "gpt-test",
    });
    const result = await run({
      kind: "image",
      brief: {
        topic: "เด็กอ่านหนังสือก่อนนอน",
        audience: "ผู้ปกครอง",
        language: "th",
        platformPreset: "tiktok_9_16",
        studioType: "video_edit",
      },
      scene: {
        sceneId: "scene-1",
        startMs: 0,
        endMs: 4000,
        narration: "ลองสร้างกิจวัตรก่อนนอนที่อบอุ่น",
        captionText: ["กิจวัตรก่อนนอน"],
      },
    });

    expect(result.sceneId).toBe("scene-1");
    const call = callLLMStructuredMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.systemPrompt).toBe(VIDEO_PROJECT_BROLL_PROMPT_SYSTEM_FRAMING);
    expect(call.runtimeOptions).toMatchObject({
      skillSlugs: ["video-project-broll-prompt"],
      originSurface: "video_edit",
      entryPoint: "system",
    });
    expect(call.billingMetadata).toMatchObject({ skillSlug: "video-project-broll-prompt", projectId: 3 });
  });
});
