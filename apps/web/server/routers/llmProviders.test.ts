import { describe, expect, it } from "vitest";

import {
  mergeAvailableLlmModels,
  PROVIDER_TEMPLATES,
  resolveProviderCatalogDefaults,
} from "./llmProviders";
import { availableLlmProviderModelSchema } from "../services/llmProviderCatalog";

describe("mergeAvailableLlmModels", () => {
  it("includes models configured only in model_provider_map", () => {
    const models = mergeAvailableLlmModels({
      providers: [
        {
          id: 1,
          providerName: "openai",
          displayName: "OpenAI",
          availableModels: [
            { id: "gpt-5.3-chat", name: "GPT-5.3 Chat", contextLength: 128000 },
          ],
          configJson: null,
          defaultModel: "gpt-5.3-chat",
        },
      ],
      mappedModels: [
        {
          providerId: 1,
          providerName: "openai",
          providerDisplayName: "OpenAI",
          modelId: "gpt-5.4",
          modelName: "GPT-5.4",
          contextLength: 128000,
        },
      ],
    });

    expect(models.map((model) => model.id)).toContain("gpt-5.4");
    expect(models.map((model) => model.id)).not.toContain("gpt-5.3-chat");
  });

  it("does not expose provider models without an enabled mapping", () => {
    const models = mergeAvailableLlmModels({
      providers: [
        {
          id: 1,
          providerName: "openai",
          displayName: "OpenAI",
          availableModels: [
            { id: "gpt-5.4", name: "GPT-5.4", contextLength: 128000 },
          ],
          configJson: null,
          defaultModel: "gpt-5.4",
        },
      ],
      mappedModels: [],
    });

    expect(models).toEqual([]);
  });
});

describe("PROVIDER_TEMPLATES", () => {
  it("includes Kie AI with the curated multi-family model catalog", () => {
    const kie = PROVIDER_TEMPLATES.find((template) => template.providerName === "kie_ai");

    expect(kie).toBeDefined();
    expect(kie?.defaultModel).toBe("gpt-5-4");
    expect(kie?.availableModels).toHaveLength(13);
    expect(kie?.availableModels?.some((model) => model.id === "gpt-5-4" && model.apiStyle === "responses")).toBe(true);
    expect(kie?.availableModels?.some((model) => model.id === "claude-sonnet-4-6" && model.apiStyle === "messages")).toBe(true);
    expect(kie?.availableModels?.some((model) => model.id === "gemini-3-pro" && model.apiStyle === "chat-completions")).toBe(true);
    expect(kie?.availableModels?.find((model) => model.id === "gpt-5-4")?.pricing).toEqual({ input: 0.7, output: 5.6 });
  });

  it("includes NVIDIA NIM (Hosted) with the expected lightweight defaults", () => {
    const nvidia = PROVIDER_TEMPLATES.find((template) => template.providerName === "nvidia_nim");

    expect(nvidia).toBeDefined();
    expect(nvidia?.displayName).toBe("NVIDIA NIM (Hosted)");
    expect(nvidia?.baseUrl).toBe("https://integrate.api.nvidia.com");
    expect(nvidia?.defaultModel).toBe("nvidia/llama-3.3-nemotron-super-49b-v1.5");
    expect(nvidia?.availableModels).toBeUndefined();
  });
});

describe("resolveProviderCatalogDefaults", () => {
  it("hydrates Kie AI catalog defaults when legacy provider rows have no availableModels", () => {
    const hydrated = resolveProviderCatalogDefaults({
      providerName: "kie_ai",
      displayName: "Kie AI",
      defaultModel: null,
      availableModels: null,
    });

    expect(hydrated.defaultModel).toBe("gpt-5-4");
    expect(hydrated.availableModels).toHaveLength(13);
    expect(hydrated.availableModels?.some((model) => model.id === "gemini-3-pro")).toBe(true);
  });

  it("merges stored Kie catalog rows with template defaults to refresh capabilities and config", () => {
    const hydrated = resolveProviderCatalogDefaults({
      providerName: "kie_ai",
      displayName: "Kie AI",
      defaultModel: "gpt-5-4",
      availableModels: [
        {
          id: "gpt-5-4",
          name: "GPT 5.4",
          supportsStructuredOutputs: false,
        },
      ],
    });

    const gptModel = hydrated.availableModels?.find((model) => model.id === "gpt-5-4");
    expect(gptModel?.supportsStructuredOutputs).toBe(true);
    expect(gptModel?.supportsJsonMode).toBe(true);
    expect(gptModel?.supportsStrictToolSchema).toBe(true);
    expect(gptModel?.config?.requestBodyFormat).toBe("responses");
  });

  it("hydrates NVIDIA defaults without changing legacy providers", () => {
    const hydrated = resolveProviderCatalogDefaults({
      providerName: "nvidia_nim",
      displayName: null,
      baseUrl: null,
      defaultModel: null,
      availableModels: null,
    });

    expect(hydrated.displayName).toBe("NVIDIA NIM (Hosted)");
    expect(hydrated.baseUrl).toBe("https://integrate.api.nvidia.com");
    expect(hydrated.defaultModel).toBe("nvidia/llama-3.3-nemotron-super-49b-v1.5");
    expect(hydrated.availableModels).toBeNull();

    const openAiHydrated = resolveProviderCatalogDefaults({
      providerName: "openai",
      displayName: "OpenAI",
      baseUrl: null,
      defaultModel: null,
      availableModels: null,
    });

    expect(openAiHydrated.baseUrl).toBe("https://api.openai.com/v1");
    expect(openAiHydrated.defaultModel).toBe("gpt-4o-mini");
  });
});

describe("availableLlmProviderModelSchema", () => {
  it("accepts NVIDIA rollout metadata while keeping gemini apiStyle valid", () => {
    const result = availableLlmProviderModelSchema.safeParse({
      id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      name: "Llama 3.3 Nemotron Super 49B v1.5",
      apiStyle: "gemini",
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      embeddingDimension: 4096,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toMatchObject({
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      embeddingDimension: 4096,
      apiStyle: "gemini",
    });
  });

  it("accepts legacy provider rows without NVIDIA metadata", () => {
    const result = availableLlmProviderModelSchema.safeParse({
      id: "gpt-5-4",
      name: "GPT 5.4",
      apiStyle: "responses",
    });

    expect(result.success).toBe(true);
  });

  it("rejects absolute apiEndpoint values in model config", () => {
    const result = availableLlmProviderModelSchema.safeParse({
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      config: {
        requestBodyFormat: "openai-chat-completions",
        apiEndpoint: "https://evil.example/v1/chat/completions",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsafe apiEndpointTemplate placeholders", () => {
    const result = availableLlmProviderModelSchema.safeParse({
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      config: {
        requestBodyFormat: "openai-chat-completions",
        apiEndpointTemplate: "/{model}/v1/chat/completions",
      },
    });

    expect(result.success).toBe(false);
  });

  it("preserves NVIDIA metadata when catalog defaults are hydrated", () => {
    const hydrated = resolveProviderCatalogDefaults({
      providerName: "kie_ai",
      displayName: "Kie AI",
      defaultModel: "gpt-5-4",
      availableModels: [
        {
          id: "gpt-5-4",
          name: "GPT 5.4",
          ownedBy: "nvidia",
          surface: "chat",
          executionMode: "public",
          autoSelectionEligible: true,
          supportsStructuredOutputs: false,
        },
      ],
    });

    const model = hydrated.availableModels?.find((entry) => entry.id === "gpt-5-4");
    expect(model).toMatchObject({
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      supportsStructuredOutputs: true,
    });
  });
});
