import { describe, expect, it } from "vitest";

import { resolveEnabledLlmModelIdFromRows } from "./enabledLlmModels";

const rows = [
  {
    providerName: "openai",
    modelId: "gpt-4o",
    providerModelId: "gpt-4o-2025-01-01",
    defaultModel: "gpt-4o",
  },
  {
    providerName: "anthropic",
    modelId: "claude-sonnet-4",
    providerModelId: "claude-sonnet-4-20250514",
    defaultModel: "claude-sonnet-4",
  },
];

describe("resolveEnabledLlmModelIdFromRows", () => {
  it("returns the preferred enabled model", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows,
        preferredModelIds: ["gpt-4o"],
      }),
    ).toBe("gpt-4o");
  });

  it("matches provider-prefixed model ids", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows,
        preferredModelIds: ["openai/gpt-4o"],
      }),
    ).toBe("gpt-4o");
  });

  it("matches provider-specific upstream model ids", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows,
        preferredModelIds: ["claude-sonnet-4-20250514"],
      }),
    ).toBe("claude-sonnet-4");
  });

  it("falls back to the enabled default model", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows,
        preferredModelIds: ["disabled-model"],
      }),
    ).toBe("gpt-4o");
  });

  it("returns null when there are no enabled models", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows: [],
        preferredModelIds: ["gpt-4o"],
      }),
    ).toBeNull();
  });
});
