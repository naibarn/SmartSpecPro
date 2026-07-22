/**
 * Start-frame image-prompt engine mode control + engine badge
 * (planning/vd-start-frame-prompt-modes/plan.md) coverage for
 * `VerticalDramaStoryboardPanel.tsx`:
 * - the per-episode header select lets the user pick `"auto"` /
 *   `"policy_safe_rewrite"` / `"cinematic_narrative"`, and while the value is
 *   `"auto"` its label shows which engine auto currently resolves to, derived
 *   from the selected image model's family (GPT-family → synopsis-direct,
 *   everything else → cinematic narrative);
 * - the per-shot start-frame image prompt card shows a small engine badge
 *   when the frame carries a `promptMode` stamp (absent on legacy frames,
 *   which show neither), mirroring the video prompt card's family badge
 *   (`VerticalDramaStoryboardPanel.modelFamilyBadge.test.tsx`).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

const GPT_IMAGE_MODEL = {
  id: "gpt-image-2-text-to-image",
  modelId: "gpt-image-2-text-to-image",
  name: "GPT Image 2",
  type: "image",
  provider: "openai",
};

const NANO_BANANA_MODEL = {
  id: "google-nano-banana-pro",
  modelId: "google-nano-banana-pro",
  name: "Nano Banana Pro",
  type: "image",
  provider: "google",
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

describe("VerticalDramaStoryboardPanel — start-frame image-prompt engine mode + badge (planning/vd-start-frame-prompt-modes/plan.md)", () => {
  it("renders the image-prompt-mode select with the stored value", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          imageModels: [GPT_IMAGE_MODEL],
          selectedImageModelId: GPT_IMAGE_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          imagePromptMode: "cinematic_narrative",
          onSelectImagePromptMode: vi.fn(),
        }) as any)}
      />
    );

    const select = (await screen.findByTestId(
      "vd-storyboard-image-prompt-mode-select"
    )) as HTMLSelectElement;
    expect(select.value).toBe("cinematic_narrative");
  });

  it("selecting an option calls onSelectImagePromptMode with the picked value", async () => {
    const onSelectImagePromptMode = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          imageModels: [GPT_IMAGE_MODEL],
          selectedImageModelId: GPT_IMAGE_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          imagePromptMode: "auto",
          onSelectImagePromptMode,
        }) as any)}
      />
    );

    const select = await screen.findByTestId(
      "vd-storyboard-image-prompt-mode-select"
    );
    fireEvent.change(select, { target: { value: "policy_safe_rewrite" } });
    expect(onSelectImagePromptMode).toHaveBeenCalledWith(
      "policy_safe_rewrite"
    );
  });

  it('shows the synopsis-direct engine as the "auto" hint for a GPT image model', async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          imageModels: [GPT_IMAGE_MODEL],
          selectedImageModelId: GPT_IMAGE_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          imagePromptMode: "auto",
          onSelectImagePromptMode: vi.fn(),
        }) as any)}
      />
    );

    const select = await screen.findByTestId(
      "vd-storyboard-image-prompt-mode-select"
    );
    // Assert against the select's own preceding label `<span>`, NOT the
    // whole wrapping `<label>` — the wrapper's textContent also concatenates
    // every `<option>`'s text (jsdom includes them), which would always
    // contain both engine names regardless of which one auto resolved to and
    // make this assertion pass vacuously.
    const labelSpan = select.previousElementSibling as HTMLElement | null;
    expect(labelSpan?.textContent).toContain("เรื่องย่อโดยตรง");
  });

  it('shows the cinematic-narrative engine as the "auto" hint for a non-GPT image model', async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          imageModels: [NANO_BANANA_MODEL],
          selectedImageModelId: NANO_BANANA_MODEL.modelId,
          onSelectImageModel: vi.fn(),
          imagePromptMode: "auto",
          onSelectImagePromptMode: vi.fn(),
        }) as any)}
      />
    );

    const select = await screen.findByTestId(
      "vd-storyboard-image-prompt-mode-select"
    );
    const labelSpan = select.previousElementSibling as HTMLElement | null;
    expect(labelSpan?.textContent).toContain("ตีความเชิงภาพยนตร์");
  });

  it("renders the engine badge on the start-frame image prompt card when the frame carries a promptMode stamp", async () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a prompt",
                promptMode: {
                  mode: "policy_safe_rewrite",
                  resolvedFrom: "auto",
                  imageModelFamily: "gpt",
                  imageModelId: GPT_IMAGE_MODEL.modelId,
                  generatedAt: "2026-07-22T00:00:00.000Z",
                },
              },
            ],
          },
        }) as any)}
      />
    );

    const badge = await screen.findByTestId(
      "vd-storyboard-image-prompt-1-engine"
    );
    expect(badge.textContent).toBe("เรื่องย่อโดยตรง");
  });

  it("renders no engine badge when the frame has no promptMode (legacy frame)", async () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);

    // Anchor on a guaranteed-present sibling first (the image prompt box's
    // own copy button, rendered whenever `frame.imagePrompt` is non-empty)
    // so this negative assertion can't pass vacuously if the panel failed to
    // render at all.
    await screen.findByTestId("vd-storyboard-image-prompt-1-copy");

    expect(
      screen.queryByTestId("vd-storyboard-image-prompt-1-engine")
    ).not.toBeInTheDocument();
  });
});
