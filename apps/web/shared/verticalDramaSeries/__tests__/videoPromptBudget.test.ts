import { describe, expect, it } from "vitest";
import {
  VD_VIDEO_PROMPT_ABSOLUTE_MAX,
  VD_VIDEO_PROMPT_KIE_AI_MAX,
  VD_VIDEO_PROMPT_MAX,
  resolveVdVideoPromptBudgetForCatalogModel,
} from "../videoPromptBudget";

describe("resolveVdVideoPromptBudgetForCatalogModel", () => {
  it("uses Kie.ai's 4096-character allowance", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({ provider: "kie.ai" })
    ).toBe(VD_VIDEO_PROMPT_KIE_AI_MAX);
    expect(VD_VIDEO_PROMPT_ABSOLUTE_MAX).toBe(4096);
  });

  it("recognizes Kie.ai aliases and provider metadata in config", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({ provider: "kie_ai" })
    ).toBe(4096);
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({
        configJson: { providerName: "kie-ai" },
      })
    ).toBe(4096);
  });

  it("keeps unknown providers at the legacy cap", () => {
    expect(
      resolveVdVideoPromptBudgetForCatalogModel({ provider: "unknown" })
    ).toBe(VD_VIDEO_PROMPT_MAX);
  });

  it("honors an explicit video-only model limit without exceeding 4096", () => {
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
    ).toBe(4096);
  });
});
