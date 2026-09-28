import { describe, expect, it } from "vitest";
import {
  VD_VIDEO_PROMPT_ABSOLUTE_MAX,
  VD_VIDEO_PROMPT_GROK_MAX,
  VD_VIDEO_PROMPT_MINIMAX_H3_MAX,
  VD_VIDEO_PROMPT_OMNI_FLASH_1_1_MAX,
  VD_VIDEO_PROMPT_SEEDANCE_2_5_MAX,
  VD_VIDEO_PROMPT_WAN_3_MAX,
  VD_VIDEO_PROMPT_MAX,
  resolveVdVideoPromptBudgetForCatalogModel,
} from "../videoPromptBudget";

describe("resolveVdVideoPromptBudgetForCatalogModel", () => {
  it.each([
    ["grok-imagine-video-1-5-preview", VD_VIDEO_PROMPT_GROK_MAX],
    ["minimax-h3", VD_VIDEO_PROMPT_MINIMAX_H3_MAX],
    ["minimax-h3-max", VD_VIDEO_PROMPT_MINIMAX_H3_MAX],
    ["gemini-omni-flash-1-1", VD_VIDEO_PROMPT_OMNI_FLASH_1_1_MAX],
    ["gemini-omni-1.1-flash", VD_VIDEO_PROMPT_OMNI_FLASH_1_1_MAX],
    ["seedance-2.5-byteplus", VD_VIDEO_PROMPT_SEEDANCE_2_5_MAX],
    ["wan3.0-video-prime", VD_VIDEO_PROMPT_WAN_3_MAX],
  ])("uses the known ceiling for %s", (modelId, expected) => {
    expect(resolveVdVideoPromptBudgetForCatalogModel({ modelId })).toBe(expected);
    expect(VD_VIDEO_PROMPT_ABSOLUTE_MAX).toBe(30_000);
  });

  it("does not classify every Kie.ai model as Grok", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "gemini-omni-flash-1-1",
        provider: "kie.ai",
      })
    ).toBe(20_000);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({ provider: "kie.ai" })
    ).toBe(VD_VIDEO_PROMPT_MAX);
  });

  it("keeps unknown providers at the legacy cap", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({ provider: "unknown" })
    ).toBe(VD_VIDEO_PROMPT_MAX);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "future-video-model",
        configJson: { max_prompt_length: 12_000 },
      })
    ).toBe(12_000);
  });

  it("honors an explicit video-only model limit without exceeding 30000", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        provider: "other",
        configJson: { maxVideoPromptLength: 3500 },
      })
    ).toBe(3500);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        provider: "other",
        configJson: { maxVideoPromptLength: 9000 },
      })
    ).toBe(9000);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        provider: "other",
        configJson: { max_video_prompt_length: 50_000 },
      })
    ).toBe(30_000);
  });

  it("lets explicit video config tighten but never raise a known family ceiling", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "minimax-h3",
        configJson: { maxVideoPromptLength: 6500, maxPromptLength: 1000 },
      })
    ).toBe(6500);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "grok-imagine-video-1-5-preview",
        configJson: { maxVideoPromptLength: 1500 },
      })
    ).toBe(1500);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "grok-imagine-video-1-5-preview",
        configJson: { maxVideoPromptLength: 9000 },
      })
    ).toBe(4096);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        modelId: "gemini-omni-flash-1-1",
        provider: "kie.ai",
        configJson: { maxPromptLength: 5000 },
      })
    ).toBe(20_000);
  });
});
