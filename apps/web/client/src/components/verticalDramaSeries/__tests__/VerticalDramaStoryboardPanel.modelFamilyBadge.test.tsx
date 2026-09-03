/**
 * Video-prompt model-family badge + mismatch warning
 * (planning/vd-video-prompt-model-family-quality/plan.md) coverage for
 * `VerticalDramaStoryboardPanel.tsx`: the storyboard video-prompt card shows
 * a small outline badge naming which model family (`grok`/`veo`/`seedance`/
 * `gemini_omni`/`other`) a clip's video prompt was generated for (`clip.promptModelTarget`,
 * stamped server-side), plus an amber mismatch warning when the currently-
 * selected video model resolves to a different family. Legacy clips without
 * `promptModelTarget` show neither.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const VEO_MODEL = {
  id: "veo3/generate-veo-3-video-lite",
  modelId: "veo3/generate-veo-3-video-lite",
  name: "Veo 3.1 Lite",
  type: "video",
  provider: "kie.ai",
};

const GROK_MODEL = {
  id: "grok-imagine-video-1.5",
  modelId: "grok-imagine-video-1.5",
  name: "Grok Imagine Video 1.5",
  type: "video",
  provider: "hermes_grok",
};

const OMNI_MODEL = {
  id: "gemini-omni-flash-1-1",
  modelId: "gemini-omni-flash-1-1",
  name: "Gemini Omni Flash 1.1",
  type: "video",
  provider: "kie.ai",
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — video prompt model-family badge + mismatch warning (planning/vd-video-prompt-model-family-quality/plan.md)", () => {
  it("renders the model-family badge and no mismatch warning when the clip's stamped family matches the selected video model", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL],
          selectedVideoModelId: VEO_MODEL.modelId,
          onSelectVideoModel: vi.fn(),
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Slow push-in on the hallway.",
                promptModelTarget: {
                  family: "veo",
                  modelId: VEO_MODEL.modelId,
                  modelName: VEO_MODEL.name,
                  generatedAt: "2026-07-21T00:00:00.000Z",
                },
              },
            ],
          },
        }) as any)}
      />
    );

    const badge = await screen.findByTestId(
      "vd-storyboard-video-prompt-1-model-family"
    );
    expect(badge.textContent).toBe("Veo");
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).not.toBeInTheDocument();
  });

  it("renders the badge AND a mismatch warning mentioning both families when the selected video model's family differs from the clip's stamped family", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [GROK_MODEL],
          selectedVideoModelId: GROK_MODEL.modelId,
          onSelectVideoModel: vi.fn(),
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Slow push-in on the hallway.",
                promptModelTarget: {
                  family: "veo",
                  modelId: VEO_MODEL.modelId,
                  modelName: VEO_MODEL.name,
                  generatedAt: "2026-07-21T00:00:00.000Z",
                },
              },
            ],
          },
        }) as any)}
      />
    );

    const badge = await screen.findByTestId(
      "vd-storyboard-video-prompt-1-model-family"
    );
    expect(badge.textContent).toBe("Veo");

    const mismatch = await screen.findByTestId(
      "vd-storyboard-video-prompt-1-model-mismatch"
    );
    expect(mismatch.textContent).toContain("Veo");
    expect(mismatch.textContent).toContain("Grok");
  });

  it("recognizes an early Omni clip stamped as other without rewriting the persisted prompt", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [OMNI_MODEL],
          selectedVideoModelId: OMNI_MODEL.modelId,
          onSelectVideoModel: vi.fn(),
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "A continuous close-up move.",
                promptModelTarget: {
                  family: "other",
                  modelId: OMNI_MODEL.modelId,
                  modelName: OMNI_MODEL.name,
                  generatedAt: "2026-09-01T00:00:00.000Z",
                },
              },
            ],
          },
        }) as any)}
      />
    );

    const badge = await screen.findByTestId(
      "vd-storyboard-video-prompt-1-model-family"
    );
    expect(badge.textContent).toBe("Gemini Omni");
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).not.toBeInTheDocument();
  });

  it("renders neither the family badge nor the mismatch warning when the clip has no promptModelTarget (legacy clip)", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [VEO_MODEL],
          selectedVideoModelId: VEO_MODEL.modelId,
          onSelectVideoModel: vi.fn(),
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Slow push-in on the hallway.",
              },
            ],
          },
        }) as any)}
      />
    );

    // Anchor on a guaranteed-present sibling first (the video prompt box's
    // own copy button, rendered whenever `clip.prompt` is non-empty) so this
    // negative assertion can't pass vacuously if the panel failed to render
    // at all — it must actually reach the video-prompt card and still find
    // no badge/mismatch testids.
    await screen.findByTestId("vd-storyboard-video-prompt-1-copy");

    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-family")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).not.toBeInTheDocument();
  });

  it("renders Gemini Omni badge when viewing an enhanced variant even if the legacy clip was stamped for Grok", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          videoModels: [OMNI_MODEL],
          selectedVideoModelId: OMNI_MODEL.modelId,
          onSelectVideoModel: vi.fn(),
          enhancedVideoPromptUiEnabled: true,
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "Legacy Grok prompt",
                promptModelTarget: {
                  family: "grok",
                  modelId: GROK_MODEL.modelId,
                  modelName: GROK_MODEL.name,
                  generatedAt: "2026-07-21T00:00:00.000Z",
                },
                videoPromptVariants: {
                  version: "vd-video-prompt-variants/1",
                  activeVariant: "enhanced",
                  revision: 1,
                  variants: {
                    legacy: {
                      variantId: "legacy",
                      status: "ready",
                      prompt: "Legacy Grok prompt",
                      promptModelTarget: {
                        family: "grok",
                        modelId: GROK_MODEL.modelId,
                        modelName: GROK_MODEL.name,
                        generatedAt: "2026-07-21T00:00:00.000Z",
                      },
                      inputFingerprint: "a".repeat(64),
                      revision: 1,
                      createdAt: "2026-07-21T00:00:00.000Z",
                      updatedAt: "2026-07-21T00:00:00.000Z",
                    },
                    enhanced: {
                      variantId: "enhanced",
                      status: "ready",
                      prompt: "Enhanced Omni prompt",
                      targetVideoModelId: OMNI_MODEL.modelId,
                      targetModelSnapshot: { name: OMNI_MODEL.name },
                      targetModelFingerprint: "b".repeat(64),
                      providerProfileId: "kie-omni",
                      providerPlanHash: "c".repeat(64),
                      authoringModelId: "gpt-4o",
                      terminalPromptHash: "d".repeat(64),
                      inputFingerprint: "e".repeat(64),
                      mediaBundle: {
                        contractVersion: "vd-shot-media/1",
                        bundleRevision: 1,
                        startFrame: null,
                        stopFrame: null,
                        references: [],
                        bundleFingerprint: "f".repeat(64),
                      },
                      warnings: [],
                      assumptions: [],
                      researchProvenance: [],
                      revision: 1,
                      createdAt: "2026-07-21T00:00:00.000Z",
                      updatedAt: "2026-07-21T00:00:00.000Z",
                      skillVersion: "11.0.0",
                      adapterVersion: "1.0.0",
                      sdkVersion: "0.22.0",
                    },
                  },
                },
              },
            ],
          },
        }) as any)}
      />
    );

    const badge = await screen.findByTestId(
      "vd-storyboard-video-prompt-1-model-family"
    );
    expect(badge.textContent).toBe("Gemini Omni");
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).not.toBeInTheDocument();

    // Now click the Legacy variant button
    const legacyButton = screen.getByRole("button", { name: "Legacy" });
    fireEvent.click(legacyButton);

    expect(badge.textContent).toBe("Grok");
    expect(
      screen.getByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).toBeInTheDocument();

    // Now click the Enhanced variant button back
    const enhancedButton = screen.getByRole("button", { name: "Enhanced" });
    fireEvent.click(enhancedButton);

    expect(badge.textContent).toBe("Gemini Omni");
    expect(
      screen.queryByTestId("vd-storyboard-video-prompt-1-model-mismatch")
    ).not.toBeInTheDocument();
  });
});
