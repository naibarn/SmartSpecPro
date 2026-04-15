import { describe, expect, it, vi } from "vitest";

import {
  deriveChatCapabilityRequirements,
  normalizeChatModelSelection,
  readStoredChatModelSelectionState,
  resolveChatModelSelection,
  selectionFromStoredState,
  writeStoredChatModelSelectionState,
} from "./chatModelSelection";

vi.mock("./enabledLlmModels", () => ({
  filterAutoSelectableLlmModelRows: (rows: Array<{ catalogEligibility?: string }>) =>
    rows.filter((row) => row.catalogEligibility == null || row.catalogEligibility === "public-chat"),
  loadEnabledLlmModelRows: vi.fn().mockResolvedValue([
    {
      providerId: 1,
      providerName: "openrouter",
      modelId: "gpt-4o-mini",
      providerModelId: "openai/gpt-4o-mini",
      defaultModel: "gpt-4o-mini",
      apiStyle: "chat-completions",
      supportsVision: false,
      supportsThinking: false,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: false,
      contextLength: 128000,
      priority: 2,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
    },
    {
      providerId: 2,
      providerName: "kie_ai",
      modelId: "gemini-3-pro",
      providerModelId: "gemini-3-pro",
      defaultModel: null,
      apiStyle: "gemini",
      supportsVision: true,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: true,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: false,
      contextLength: 1000000,
      priority: 1,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
    },
    {
      providerId: 2,
      providerName: "kie_ai",
      modelId: "gpt-5.4",
      providerModelId: "gpt-5-4",
      defaultModel: null,
      apiStyle: "responses",
      supportsVision: true,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsCodeExecution: true,
      supportsComputerUse: true,
      supportsBackground: true,
      supportsResponses: true,
      contextLength: 1000000,
      priority: 0,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
    },
    {
      providerId: 3,
      providerName: "kie_responses_only",
      modelId: "gpt-5.4-mini",
      providerModelId: "gpt-5-4-mini",
      defaultModel: null,
      apiStyle: "responses",
      supportsVision: false,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: true,
      contextLength: 1000000,
      priority: 9,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "public-chat",
      autoSelectionEligible: true,
    },
    {
      providerId: 4,
      providerName: "nvidia_nim",
      modelId: "nemotron-manual",
      providerModelId: "nvidia/llama-3.1-nemotron-51b-instruct",
      legacyModelAliases: ["legacy-nemotron"],
      defaultModel: null,
      apiStyle: "chat-completions",
      supportsVision: false,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: false,
      contextLength: 128000,
      priority: -1,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "manual-only",
      autoSelectionEligible: false,
    },
    {
      providerId: 4,
      providerName: "nvidia_nim",
      modelId: "meta-llama-manual",
      providerModelId: "meta/llama-3.3-70b-instruct",
      defaultModel: null,
      apiStyle: "chat-completions",
      supportsVision: false,
      supportsThinking: true,
      supportsFunctionTools: true,
      supportsStructuredOutputs: true,
      supportsWebSearch: false,
      supportsCodeExecution: false,
      supportsComputerUse: false,
      supportsBackground: false,
      supportsResponses: false,
      contextLength: 128000,
      priority: -2,
      priorityLocked: false,
      isFree: false,
      catalogEligibility: "manual-only",
      autoSelectionEligible: false,
    },
  ]),
}));

describe("normalizeChatModelSelection", () => {
  it("prefers modelSelection over legacy fields and validates conflicts", () => {
    expect(() =>
      normalizeChatModelSelection({
        bodyModel: "gpt-4o-mini",
        bodyModelSelection: { mode: "explicit", modelId: "gemini-3-pro" },
      }),
    ).toThrow("must match model");
  });

  it("falls back to stored auto-provider selection when request omits selection", () => {
    const selection = normalizeChatModelSelection({
      storedSelectionState: {
        mode: "auto-provider",
        providerId: 2,
      },
    });
    expect(selection).toEqual({ mode: "auto-provider", providerId: 2, providerName: null });
  });

  it("returns null when there is no explicit or stored selection intent", () => {
    expect(
      normalizeChatModelSelection({}),
    ).toBeNull();
  });
});

describe("chat model selection storage helpers", () => {
  it("round-trips llmSelection state inside skillSettings", () => {
    const stored = writeStoredChatModelSelectionState({}, {
      mode: "auto-provider",
      providerId: 2,
      providerName: "Kie AI",
      lastResolvedModelId: "gemini-3-pro",
      lastResolvedProviderId: 2,
      lastResolvedProviderName: "Kie AI",
      lastResolvedRouteFamily: "chat-completions",
    });

    expect(readStoredChatModelSelectionState(stored)).toMatchObject({
      mode: "auto-provider",
      providerId: 2,
      providerName: "Kie AI",
      lastResolvedModelId: "gemini-3-pro",
    });
  });
});

describe("deriveChatCapabilityRequirements", () => {
  it("derives capabilities only from allowlisted feature modes and image content", () => {
    const result = deriveChatCapabilityRequirements({
      selectionContext: { featureModes: ["web_search", "tool_calling"] },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            { type: "image_url", image_url: { url: "https://example.com/a.png" } },
          ],
        },
      ],
    });

    expect(result.requirements).toMatchObject({
      supportsWebSearch: true,
      supportsFunctionTools: true,
      supportsVision: true,
    });
    expect(result.allowResponsesFamily).toBe(false);
  });
});

describe("resolveChatModelSelection", () => {
  it("keeps provider-auto inside one provider and uses strict pin", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-provider", providerId: 2, providerName: "Kie AI" },
    });

    expect(result.selectionMode).toBe("auto-provider");
    expect(result.preferredProviderId).toBe(2);
    expect(result.strictProviderPin).toBe(true);
    expect(result.resolvedProviderId).toBe(2);
  });

  it("uses strict provider pin for explicit provider-bound selections", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "explicit", modelId: "gemini-3-pro", providerId: 2 },
    });

    expect(result.selectionMode).toBe("explicit");
    expect(result.preferredProviderId).toBe(2);
    expect(result.strictProviderPin).toBe(true);
    expect(result.resolvedProviderId).toBe(2);
  });

  it("prefers non-responses models for plain auto chat when available", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-global" },
    });

    expect(result.resolvedModelId).toBe("gemini-3-pro");
    expect(result.routeFamily).toBe("chat-completions");
  });

  it("ignores manual-only NVIDIA rows during global auto selection", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-global" },
    });

    expect(result.resolvedModelId).not.toBe("nemotron-manual");
  });

  it("ignores manual-only NVIDIA rows during provider-auto selection", async () => {
    await expect(
      resolveChatModelSelection({
        bodyModelSelection: { mode: "auto-provider", providerId: 4, providerName: "NVIDIA NIM" },
      }),
    ).rejects.toThrow("No enabled model in the selected provider");
  });

  it("still allows explicit selection of a manual-only NVIDIA chat row", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: {
        mode: "explicit",
        modelId: "nemotron-manual",
        providerId: 4,
      },
    });

    expect(result.selectionMode).toBe("explicit");
    expect(result.resolvedModelId).toBe("nemotron-manual");
    expect(result.resolvedProviderId).toBe(4);
  });

  it("allows explicit selection of curated partner manual-only NVIDIA chat rows", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: {
        mode: "explicit",
        modelId: "meta-llama-manual",
        providerId: 4,
      },
    });

    expect(result.selectionMode).toBe("explicit");
    expect(result.resolvedModelId).toBe("meta-llama-manual");
    expect(result.resolvedProviderId).toBe(4);
  });

  it("matches preserved legacy aliases for explicit NVIDIA selections", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: {
        mode: "explicit",
        modelId: "legacy-nemotron",
        providerId: 4,
      },
    });

    expect(result.selectionMode).toBe("explicit");
    expect(result.resolvedModelId).toBe("nemotron-manual");
    expect(result.resolvedProviderId).toBe(4);
  });

  it("falls back to responses-family models when a pinned provider only has responses-compatible options", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-provider", providerId: 3, providerName: "Kie Responses" },
    });

    expect(result.resolvedProviderId).toBe(3);
    expect(result.resolvedModelId).toBe("gpt-5.4-mini");
    expect(result.routeFamily).toBe("responses");
  });

  it("allows responses-family models when computer use is required", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-provider", providerId: 2, providerName: "Kie AI" },
      selectionContext: { featureModes: ["computer_use"] },
    });

    expect(result.resolvedModelId).toBe("gpt-5.4");
    expect(result.routeFamily).toBe("responses");
  });

  it("prefers responses-family models when responses are explicitly required", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-global" },
      selectionContext: { featureModes: ["photo_search", "structured_output", "responses"] },
    });

    expect(result.routeFamily).toBe("responses");
    expect(result.resolvedModelId).toBe("gpt-5.4");
  });

  it("uses legacy default resolution when chat does not explicitly opt into auto selection", async () => {
    const result = await resolveChatModelSelection({
      bodyPreferredProvider: 999,
    });

    expect(result.resolvedModelId).toBe("gpt-4o-mini");
    expect(result.selectionMode).toBe("explicit");
    expect(result.shouldPersistSelectionState).toBe(false);
    expect(result.strictProviderPin).toBe(false);
  });

  it("rejects explicit provider/model mismatches", async () => {
    await expect(() =>
      resolveChatModelSelection({
        bodyModelSelection: {
          mode: "explicit",
          modelId: "gemini-3-pro",
          providerId: 1,
        },
      }),
    ).rejects.toThrow("does not match");
  });

  it("prefers continuity family when eligible candidates exist", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-global" },
      storedSelectionState: {
        mode: "auto-global",
        lastResolvedRouteFamily: "chat-completions",
      },
    });

    expect(result.continuityApplied).toBe(true);
    expect(result.routeFamily).toBe("chat-completions");
  });

  it("degrades stored auto selection to last resolved explicit model when auto mode is disabled", async () => {
    const result = await resolveChatModelSelection({
      bodyModelSelection: { mode: "auto-provider", providerId: 2, providerName: "Kie AI" },
      storedSelectionState: {
        mode: "auto-provider",
        providerId: 2,
        lastResolvedModelId: "gemini-3-pro",
        lastResolvedProviderId: 2,
        lastResolvedProviderName: "Kie AI",
      },
      autoSelectionEnabled: false,
    });

    expect(result.selectionMode).toBe("explicit");
    expect(result.selection).toEqual({
      mode: "explicit",
      modelId: "gemini-3-pro",
      providerId: 2,
      providerName: "Kie AI",
    });
    expect(result.resolvedModelId).toBe("gemini-3-pro");
    expect(result.resolvedProviderId).toBe(2);
  });

  it("rejects auto selection when disabled and there is no safe fallback model", async () => {
    await expect(() =>
      resolveChatModelSelection({
        bodyModelSelection: { mode: "auto-global" },
        autoSelectionEnabled: false,
      }),
    ).rejects.toThrow("not enabled");
  });
});
