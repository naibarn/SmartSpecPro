import { describe, expect, it } from "vitest";

import { mergeAvailableLlmModels } from "./llmProviders";

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
