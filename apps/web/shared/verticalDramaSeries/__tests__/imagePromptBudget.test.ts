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

  it("honors a configured Kie.ai model limit", () => {
    expect(
      resolveVdImagePromptBudgetForCatalogModel({
        provider: "kie.ai",
        configJson: { maxPromptLength: 5_000 },
      }),
    ).toBe(5_000);
  });

  it("uses the Kie.ai fallback only when no model limit is configured", () => {
    expect(
      resolveVdImagePromptBudgetForCatalogModel({
        provider: "kie.ai",
        configJson: {},
      }),
    ).toBe(390_000);
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
