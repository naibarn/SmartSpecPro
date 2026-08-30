import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeSkillLlmWithFallback } = vi.hoisted(() => ({
  executeSkillLlmWithFallback: vi.fn(),
}));

vi.mock("../skillModelFallback", () => ({ executeSkillLlmWithFallback }));

import {
  ImagePromptSafetyError,
  hashImagePrompt,
  isVerticalDramaImageRequest,
  isReusablePreparedEpisodeCoverSafety,
  prepareImagePromptSafety,
} from "../imagePromptSafetyService";

const safeResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  content: JSON.stringify({
    safePrompt: "A clean editorial illustration of a family at home",
    riskLevel: "low",
    blocked: false,
    changes: [],
    preservedIntent: ["family", "editorial illustration"],
    ...overrides,
  }),
  attempts: [],
  totalDurationMs: 1,
});

describe("imagePromptSafetyService", () => {
  beforeEach(() => {
    executeSkillLlmWithFallback.mockReset();
  });

  it("uses the safety skill and preserves a low-risk prompt", async () => {
    executeSkillLlmWithFallback.mockResolvedValueOnce(
      safeResponse({
        safePrompt: "A clean editorial illustration of a family at home",
      })
    );

    const result = await prepareImagePromptSafety({
      prompt: "A clean editorial illustration of a family at home",
      userId: 24,
    });

    expect(executeSkillLlmWithFallback).toHaveBeenCalledOnce();
    expect(result.prompt).toBe(
      "A clean editorial illustration of a family at home"
    );
    expect(result.metadata.checked).toBe(true);
    expect(result.metadata.mode).toBe("standard");
    expect(result.metadata.originalPromptHash).toHaveLength(64);
  });

  it("accepts a minimal rewrite for a sensitive educational prompt", async () => {
    executeSkillLlmWithFallback.mockResolvedValueOnce(
      safeResponse({
        safePrompt:
          "A neutral educational parenting infographic about newborn umbilical cord care, clothed baby, medium framing",
        riskLevel: "medium",
        changes: ["neutral educational framing", "medium framing"],
      })
    );

    const result = await prepareImagePromptSafety({
      prompt: "A parenting infographic about newborn umbilical cord care",
      aspectRatio: "3:4",
    });

    expect(result.metadata.riskLevel).toBe("medium");
    expect(result.metadata.rewritten).toBe(true);
    expect(result.prompt).toContain(
      "neutral educational parenting infographic"
    );
  });

  it("blocks an inherently disallowed result", async () => {
    executeSkillLlmWithFallback.mockResolvedValueOnce(
      safeResponse({
        safePrompt: "",
        riskLevel: "high",
        blocked: true,
      })
    );

    await expect(
      prepareImagePromptSafety({ prompt: "explicit sexual content" })
    ).rejects.toMatchObject({
      code: "blocked",
    } satisfies Partial<ImagePromptSafetyError>);
  });

  it("fails closed when a sensitive prompt cannot be reviewed", async () => {
    executeSkillLlmWithFallback.mockResolvedValue({
      success: false,
      error: "no model",
      attempts: [],
      totalDurationMs: 1,
    });

    await expect(
      prepareImagePromptSafety({ prompt: "newborn umbilical care close-up" })
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(executeSkillLlmWithFallback).toHaveBeenCalledTimes(2);
  });

  it("retries a transient safety-review failure before accepting the result", async () => {
    executeSkillLlmWithFallback
      .mockResolvedValueOnce({
        success: false,
        error: "provider unavailable",
        attempts: [],
        totalDurationMs: 1,
      })
      .mockResolvedValueOnce(
        safeResponse({
          safePrompt: "A neutral educational newborn-care illustration",
          riskLevel: "medium",
        }),
      );

    const result = await prepareImagePromptSafety({
      prompt: "newborn umbilical care close-up",
    });

    expect(result.prompt).toBe("A neutral educational newborn-care illustration");
    expect(executeSkillLlmWithFallback).toHaveBeenCalledTimes(2);
  });

  it("fails closed for risky cover wording when the review service is unavailable", async () => {
    executeSkillLlmWithFallback.mockResolvedValue({
      success: false,
      error: "no model",
      attempts: [],
      totalDurationMs: 1,
    });

    await expect(
      prepareImagePromptSafety({
        prompt: "A woman is threatened with a knife in a dark alley",
        mode: "vertical_drama_cover" as never,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(executeSkillLlmWithFallback).toHaveBeenCalledTimes(2);
  });

  it("does not invoke the generic skill for Vertical Drama", async () => {
    const result = await prepareImagePromptSafety({
      prompt: "Vertical Drama character portrait",
      mode: "vertical_drama_managed",
    });

    expect(executeSkillLlmWithFallback).not.toHaveBeenCalled();
    expect(result.prompt).toBe("Vertical Drama character portrait");
    expect(result.metadata.riskLevel).toBe("managed");
  });

  it("uses the dedicated safety skill for an episode cover", async () => {
    executeSkillLlmWithFallback.mockResolvedValueOnce(
      safeResponse({
        safePrompt: "A softened but faithful vertical drama episode cover",
        riskLevel: "medium",
        changes: ["removed graphic wording"],
      }),
    );

    const result = await prepareImagePromptSafety({
      prompt: "A tense vertical drama episode cover scene",
      model: "gpt-image-1.5-all",
      aspectRatio: "9:16",
      referenceImageCount: 2,
      mode: "vertical_drama_cover" as never,
    });

    expect(executeSkillLlmWithFallback).toHaveBeenCalledOnce();
    expect(executeSkillLlmWithFallback.mock.calls[0][0]).toMatchObject({
      skillSlug: "vertical-drama-episode-cover-safety-rewriter",
    });
    expect(executeSkillLlmWithFallback.mock.calls[0][0].messages[0].content).toContain(
      "final provider-ready episode-cover prompt",
    );
    expect(result.prompt).toBe(
      "A softened but faithful vertical drama episode cover",
    );
    expect(result.metadata.mode).toBe("vertical_drama_cover");
    expect(result.metadata.rewritten).toBe(true);
  });

  it("reuses only a matching prepared episode-cover marker", () => {
    const prompt = "A safe prepared cover prompt";
    const marker = {
      checked: true,
      mode: "vertical_drama_cover",
      skillId: "vertical-drama-episode-cover-safety-rewriter",
      safePromptHash: hashImagePrompt(prompt),
    };

    expect(
      isReusablePreparedEpisodeCoverSafety({
        prompt,
        extraParams: {
          __vd_purpose: "episode_cover",
          __prompt_safety: marker,
        },
      }),
    ).toBe(true);
    expect(
      isReusablePreparedEpisodeCoverSafety({
        prompt: `${prompt} tampered`,
        extraParams: {
          __vd_purpose: "episode_cover",
          __prompt_safety: marker,
        },
      }),
    ).toBe(false);
  });

  it("recognizes Vertical Drama provenance with underscore naming", () => {
    expect(
      isVerticalDramaImageRequest({
        auditContext: { source: "vertical_drama_series" },
      })
    ).toBe(true);
  });
});
