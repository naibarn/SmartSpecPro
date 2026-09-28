/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 13 §5 test suite for
 * `shared/marketplaceCapture/startFramePromptStyle.ts`.
 *
 * Pure module, no server imports — safe to test standalone.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARKETPLACE_START_FRAME_PROMPT_STYLE,
  MARKETPLACE_START_FRAME_PROMPT_STYLES,
  SEQUENTIAL_STORYBOARD_START_FRAME_PROMPT_ENGINES,
  SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_ENGINES,
  VERTICAL_DRAMA_IMAGE_PROMPT_MODES,
  classifyMarketplaceCinematicImagePromptModelFamily,
  isMarketplaceStartFramePromptStyle,
  resolveVerticalDramaImagePromptModeForImageModel,
} from "../startFramePromptStyle";

describe("MarketplaceStartFramePromptStyle union + default", () => {
  it("has exactly the two documented values", () => {
    expect(MARKETPLACE_START_FRAME_PROMPT_STYLES).toEqual([
      "evidence_product",
      "cinematic_auto",
    ]);
  });

  it("defaults to evidence_product", () => {
    expect(DEFAULT_MARKETPLACE_START_FRAME_PROMPT_STYLE).toBe(
      "evidence_product"
    );
  });

  it("isMarketplaceStartFramePromptStyle accepts only the two known values", () => {
    expect(isMarketplaceStartFramePromptStyle("evidence_product")).toBe(true);
    expect(isMarketplaceStartFramePromptStyle("cinematic_auto")).toBe(true);
    expect(isMarketplaceStartFramePromptStyle("something_else")).toBe(false);
    expect(isMarketplaceStartFramePromptStyle(undefined)).toBe(false);
    expect(isMarketplaceStartFramePromptStyle(null)).toBe(false);
    expect(isMarketplaceStartFramePromptStyle(42)).toBe(false);
  });
});

describe("VerticalDramaImagePromptMode + model-family routing (spec §5 family-routing tests)", () => {
  it("exposes exactly the two VD image-prompt engine modes", () => {
    expect(VERTICAL_DRAMA_IMAGE_PROMPT_MODES).toEqual([
      "policy_safe_rewrite",
      "cinematic_narrative",
    ]);
  });

  it.each([
    "gpt-image-1.5-all",
    "gpt-4o-image",
    "dall-e-3",
  ])("routes GPT-family model %s to policy_safe_rewrite", (model) => {
    expect(classifyMarketplaceCinematicImagePromptModelFamily(model)).toBe(
      "gpt"
    );
    expect(resolveVerticalDramaImagePromptModeForImageModel(model)).toBe(
      "policy_safe_rewrite"
    );
  });

  it.each([
    "google-nano-banana-pro",
    "flux-2.0",
    "z-image",
    "grok-imagine",
  ])("routes non-GPT model %s to cinematic_narrative", (model) => {
    expect(classifyMarketplaceCinematicImagePromptModelFamily(model)).toBe(
      "other"
    );
    expect(resolveVerticalDramaImagePromptModeForImageModel(model)).toBe(
      "cinematic_narrative"
    );
  });

  it("fails OPEN to cinematic_narrative for an unknown/absent model, never to GPT-only policy rewriting", () => {
    expect(
      resolveVerticalDramaImagePromptModeForImageModel("some-unknown-model")
    ).toBe("cinematic_narrative");
    expect(resolveVerticalDramaImagePromptModeForImageModel(null)).toBe(
      "cinematic_narrative"
    );
    expect(resolveVerticalDramaImagePromptModeForImageModel(undefined)).toBe(
      "cinematic_narrative"
    );
    expect(resolveVerticalDramaImagePromptModeForImageModel("")).toBe(
      "cinematic_narrative"
    );
  });

  it("is case-insensitive and matches substrings within a longer model id", () => {
    expect(
      classifyMarketplaceCinematicImagePromptModelFamily("GPT-IMAGE-1.5-ALL")
    ).toBe("gpt");
    expect(
      classifyMarketplaceCinematicImagePromptModelFamily("openai/dall-e-3")
    ).toBe("gpt");
  });
});

describe("Per-shot engine stamp enums", () => {
  it("start-frame engine stamp includes evidence_product + both VD image modes", () => {
    expect(SEQUENTIAL_STORYBOARD_START_FRAME_PROMPT_ENGINES).toEqual([
      "evidence_product",
      "policy_safe_rewrite",
      "cinematic_narrative",
    ]);
  });

  it("video engine stamp includes evidence_product + the VD video-prompt engine", () => {
    expect(SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_ENGINES).toEqual([
      "evidence_product",
      "vertical_drama_shot_video_prompt",
    ]);
  });
});
