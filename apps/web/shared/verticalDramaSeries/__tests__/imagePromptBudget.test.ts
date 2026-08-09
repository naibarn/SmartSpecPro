import { describe, expect, it } from "vitest";
import {
  isKieAiProvider,
  resolveVdImagePromptBudgetForCatalogModel,
} from "../imagePromptBudget";

describe("Vertical Drama image prompt budget", () => {
  it.each(["kie.ai", "kie_ai", "kie-ai", "kie"]) (
    "recognizes %s as Kie.ai",
    provider => {
      expect(isKieAiProvider(provider)).toBe(true);
    },
  );

  it("uses 20,000 for Kie.ai even when catalog metadata is stale", () => {
    expect(
      resolveVdImagePromptBudgetForCatalogModel({
        provider: "kie.ai",
        configJson: { maxPromptLength: 3_800 },
      }),
    ).toBe(20_000);
  });

  it("keeps the legacy floor for unknown providers", () => {
    expect(
      resolveVdImagePromptBudgetForCatalogModel({
        provider: "other-provider",
        configJson: { maxPromptLength: 500 },
      }),
    ).toBe(3_800);
  });
});
