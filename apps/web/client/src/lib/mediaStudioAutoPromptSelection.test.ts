import { describe, expect, it } from "vitest";

import { AUTO_MODEL, buildAutoProviderValue } from "./chatModelSelection";
import {
  buildMediaStudioProviderAutoOptions,
  formatMediaStudioModelLabel,
  groupMediaStudioModelsByProvider,
  resolveMediaStudioAutoPromptSelection,
} from "./mediaStudioAutoPromptSelection";

const models = [
  {
    id: "kie/gpt-5.4",
    name: "GPT-5.4",
    provider: "kie",
    providerDisplayName: "Kie AI",
    providerId: 11,
    isDefault: true,
    supportsVision: true,
  },
  {
    id: "kie/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "kie",
    providerDisplayName: "Kie AI",
    providerId: 11,
    supportsVision: true,
  },
  {
    id: "openrouter/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openrouter",
    providerDisplayName: "OpenRouter",
    providerId: 22,
    supportsVision: true,
    isDefault: true,
  },
  {
    id: "openrouter/text-only",
    name: "Text Only",
    provider: "openrouter",
    providerDisplayName: "OpenRouter",
    providerId: 22,
    supportsVision: false,
  },
] as const;

describe("mediaStudioAutoPromptSelection", () => {
  it("builds provider auto options from supported vision models only", () => {
    expect(buildMediaStudioProviderAutoOptions(models)).toEqual([
      {
        value: buildAutoProviderValue(11),
        providerId: 11,
        providerName: "kie",
        providerDisplayName: "Kie AI",
      },
      {
        value: buildAutoProviderValue(22),
        providerId: 22,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
      },
    ]);
  });

  it("groups models by provider display name", () => {
    expect(groupMediaStudioModelsByProvider(models)).toEqual([
      {
        providerName: "Kie AI",
        models: [models[0], models[1]],
      },
      {
        providerName: "OpenRouter",
        models: [models[2]],
      },
    ]);
  });

  it("keeps auto-global as a true auto mode", () => {
    expect(resolveMediaStudioAutoPromptSelection({
      selectedValue: AUTO_MODEL,
      models,
      autoLabel: "Auto (skill requirements)",
    })).toEqual({
      mode: "auto-global",
      value: AUTO_MODEL,
      displayLabel: "Auto (skill requirements)",
      resolvedModelId: "",
      providerId: null,
      providerName: null,
      providerDisplayName: null,
    });
  });

  it("resolves provider auto to the configured provider default or preferred model", () => {
    expect(resolveMediaStudioAutoPromptSelection({
      selectedValue: buildAutoProviderValue(11),
      models,
      autoLabel: "Auto (skill requirements)",
      autoProviderLabelFormatter: (provider) => `Auto (${provider})`,
      preferredModelId: "kie/gpt-5.4-mini",
    })).toEqual({
      mode: "auto-provider",
      value: buildAutoProviderValue(11),
      displayLabel: "Auto (Kie AI)",
      resolvedModelId: "kie/gpt-5.4-mini",
      providerId: 11,
      providerName: "kie",
      providerDisplayName: "Kie AI",
    });
  });

  it("formats explicit selections using the model and provider label", () => {
    expect(formatMediaStudioModelLabel(models[2])).toBe("GPT-4.1 Mini (OpenRouter)");

    expect(resolveMediaStudioAutoPromptSelection({
      selectedValue: "openrouter/gpt-4.1-mini",
      models,
      autoLabel: "Auto (skill requirements)",
    })).toEqual({
      mode: "explicit",
      value: "openrouter/gpt-4.1-mini",
      displayLabel: "GPT-4.1 Mini (OpenRouter)",
      resolvedModelId: "openrouter/gpt-4.1-mini",
      providerId: 22,
      providerName: "openrouter",
      providerDisplayName: "OpenRouter",
    });
  });
});
