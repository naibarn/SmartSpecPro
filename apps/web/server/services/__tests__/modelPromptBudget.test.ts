import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetStaticModelById } = vi.hoisted(() => ({
  mockGetStaticModelById: vi.fn(),
}));

vi.mock("../modelRegistry", () => ({
  getStaticModelById: mockGetStaticModelById,
}));

import {
  VD_IMAGE_PROMPT_ABSOLUTE_MAX,
  resolveConfiguredMaxPromptLength,
  resolveModelMaxPromptLength,
  resolveVdImagePromptBudget,
  resolveVdImagePromptBudgetForModel,
} from "../modelPromptBudget";

describe("model prompt budget", () => {
  beforeEach(() => mockGetStaticModelById.mockReset());

  it("parses both spellings, numeric strings, and fractional values", () => {
    expect(resolveConfiguredMaxPromptLength({ maxPromptLength: "5000.9" })).toBe(5000);
    expect(resolveConfiguredMaxPromptLength({ max_prompt_length: 4200.8 })).toBe(4200);
  });

  it.each([null, undefined, "bad", 0, -1, Number.POSITIVE_INFINITY])(
    "rejects unusable configured limits: %s",
    value => {
      expect(
        resolveConfiguredMaxPromptLength(
          value === null || value === undefined
            ? value
            : { maxPromptLength: value },
        ),
      ).toBeNull();
    },
  );

  it("prefers DB config and falls back to the static registry", () => {
    mockGetStaticModelById.mockReturnValue({ configJson: { maxPromptLength: 6000 } });
    expect(resolveModelMaxPromptLength("model-a", { maxPromptLength: 7000 })).toBe(7000);
    expect(resolveModelMaxPromptLength("model-a", {})).toBe(6000);
    expect(resolveModelMaxPromptLength("model-a", { maxPromptLength: "bad" })).toBe(6000);
  });

  it("returns null when neither source declares a limit", () => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(resolveModelMaxPromptLength("unknown", undefined)).toBeNull();
  });

  it("freezes the absolute ceiling and literal VD clamp", () => {
    expect(VD_IMAGE_PROMPT_ABSOLUTE_MAX).toBe(20_000);
    expect(resolveVdImagePromptBudget(null)).toBe(3800);
    expect(resolveVdImagePromptBudget(500)).toBe(500);
    expect(resolveVdImagePromptBudget(5000)).toBe(5000);
    expect(resolveVdImagePromptBudget(999_999)).toBe(20_000);
  });

  it.each([
    ["gpt-image-2-text-to-image", { maxPromptLength: 20_000 }, 20_000],
    ["google-banana-2", { maxPromptLength: 20_000 }, 20_000],
    ["z-image", { maxPromptLength: 500 }, 3800],
    ["missing", {}, 3800],
    ["ceiling", { maxPromptLength: 999_999 }, 20_000],
  ])("resolves widening-only budget for %s", (modelId, configJson, expected) => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(resolveVdImagePromptBudgetForModel({ modelId, configJson })).toBe(expected);
  });

  it("keeps an unthreaded model at the legacy VD limit", () => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(resolveVdImagePromptBudgetForModel({ modelId: "missing" })).toBe(3800);
  });

  it("uses Kie.ai's current 20,000-character image allowance even when catalog metadata is stale", () => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "kie-image-model",
        provider: "kie.ai",
        configJson: { maxPromptLength: 3800 },
      }),
    ).toBe(20_000);
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "kie-image-model-legacy",
        provider: "kie_ai",
        configJson: {},
      }),
    ).toBe(20_000);
  });

  it("keeps a configured non-Kie provider at its catalog budget", () => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "other-image-model",
        provider: "openai",
        configJson: { maxPromptLength: 5000 },
      }),
    ).toBe(5000);
  });

  it("keeps legacy budget resolution independent from target contract validation", () => {
    mockGetStaticModelById.mockReturnValue(undefined);
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "seedream/5-pro-text-to-image",
        configJson: { maxPromptLength: 5_000 },
      }),
    ).toBe(5_000);
    expect(
      resolveVdImagePromptBudgetForModel({
        modelId: "legacy-image-model",
        configJson: { maxPromptLength: 500 },
      }),
    ).toBe(3_800);
  });
});
