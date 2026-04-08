import { describe, expect, it } from "vitest";

import {
  filterAutoSelectableLlmModelRows,
  hydrateEnabledLlmModelRows,
  resolveEnabledLlmModelIdFromRows,
} from "./enabledLlmModels";

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

  it("resolves historical model aliases preserved during duplicate cleanup", () => {
    expect(
      resolveEnabledLlmModelIdFromRows({
        rows: [
          {
            providerName: "nvidia_nim",
            modelId: "nemotron-manual",
            providerModelId: "nvidia/llama-3.1-nemotron-51b-instruct",
            legacyModelAliases: ["nemotron-preview", "legacy-nemotron"],
            defaultModel: null,
          },
        ] as any,
        preferredModelIds: ["legacy-nemotron"],
      }),
    ).toBe("nemotron-manual");
  });
});

describe("hydrateEnabledLlmModelRows", () => {
  it("suppresses invalid NVIDIA rows while preserving manual-only chat rows for explicit selection", () => {
    const hydrated = hydrateEnabledLlmModelRows([
      {
        providerId: 91,
        providerName: "nvidia_nim",
        modelId: "nemotron-manual",
        providerModelId: "nvidia/llama-3.1-nemotron-51b-instruct",
        defaultModel: null,
        availableModels: [
          {
            id: "nvidia/llama-3.1-nemotron-51b-instruct",
            name: "Nemotron 51B",
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: false,
          },
          {
            id: "meta/llama-guard-4-12b",
            name: "Llama Guard 4",
            surface: "guardrail",
            executionMode: "deferred",
            autoSelectionEligible: false,
          },
        ],
        apiStyle: "chat-completions",
        supportsVision: false,
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 128000,
        priority: 10,
        priorityLocked: false,
        isFree: false,
        pricingInput: "0.5",
        pricingOutput: "1.5",
      },
      {
        providerId: 91,
        providerName: "nvidia_nim",
        modelId: "llama-guard",
        providerModelId: "meta/llama-guard-4-12b",
        defaultModel: null,
        availableModels: [
          {
            id: "nvidia/llama-3.1-nemotron-51b-instruct",
            name: "Nemotron 51B",
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: false,
          },
          {
            id: "meta/llama-guard-4-12b",
            name: "Llama Guard 4",
            surface: "guardrail",
            executionMode: "deferred",
            autoSelectionEligible: false,
          },
        ],
        apiStyle: "chat-completions",
        supportsVision: false,
        supportsThinking: false,
        supportsFunctionTools: false,
        supportsStructuredOutputs: false,
        supportsJsonMode: false,
        supportsStrictToolSchema: false,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 8192,
        priority: 1,
        priorityLocked: false,
        isFree: true,
        pricingInput: "0",
        pricingOutput: "0",
      },
    ]);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({
      modelId: "nemotron-manual",
      catalogEligibility: "manual-only",
      autoSelectionEligible: false,
    });
  });

  it("keeps curated partner chat rows explicit-only while excluding them from auto selection", () => {
    const hydrated = hydrateEnabledLlmModelRows([
      {
        providerId: 91,
        providerName: "nvidia_nim",
        modelId: "meta-llama-manual",
        providerModelId: "meta/llama-3.3-70b-instruct",
        defaultModel: null,
        availableModels: [
          {
            id: "meta/llama-3.3-70b-instruct",
            name: "Meta Llama 3.3 70B Instruct",
            ownedBy: "meta",
            surface: "chat",
            executionMode: "public",
            autoSelectionEligible: false,
          },
        ],
        apiStyle: "chat-completions",
        supportsVision: false,
        supportsThinking: true,
        supportsFunctionTools: true,
        supportsStructuredOutputs: true,
        supportsJsonMode: true,
        supportsStrictToolSchema: true,
        supportsWebSearch: false,
        supportsCodeExecution: false,
        supportsComputerUse: false,
        supportsBackground: false,
        supportsResponses: false,
        contextLength: 128000,
        priority: 9,
        priorityLocked: false,
        isFree: false,
        pricingInput: "0.3",
        pricingOutput: "0.6",
      },
    ]);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({
      modelId: "meta-llama-manual",
      catalogEligibility: "manual-only",
      autoSelectionEligible: false,
    });
    expect(filterAutoSelectableLlmModelRows(hydrated)).toEqual([]);
  });
});

describe("filterAutoSelectableLlmModelRows", () => {
  it("keeps public-chat rows and excludes manual-only rows", () => {
    const rows = [
      { modelId: "auto", catalogEligibility: "public-chat" as const },
      { modelId: "manual", catalogEligibility: "manual-only" as const },
      { modelId: "legacy", catalogEligibility: undefined },
    ] as any;

    expect(filterAutoSelectableLlmModelRows(rows).map((row) => row.modelId)).toEqual(["auto", "legacy"]);
  });
});
